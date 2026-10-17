// Progreso guardado de los usuarios de Clerk (AC-97, AC-129 a AC-132). La simulación (src/game) no sabe nada de la BD:
// el servidor de juego carga al entrar, escribe las compras y los cambios de barco antes de confirmarlos y el resto (el
// oro) cada 2 s, solo si algo cambió: en reposo no hay ni una consulta. Las escrituras de cada usuario van en cola, en
// orden, y llevan la revisión que leyeron: si otro proceso escribió algo más nuevo, no se pisa. Si una escritura falla,
// la persistencia pasa a «degradada» (AC-132): la tienda se cierra y los jugadores ven el aviso. Mientras dura el corte
// no se reintenta ninguna escritura: solo un SELECT 1 por segundo, y cuando responde se escribe todo lo pendiente
import { Pool } from 'pg';
import { NEW_ROW, parseProgress, progressKey, RowCarry, SavedProgress, serializeProgress } from './progress';

export interface StoredProgress {
  progress: SavedProgress;
  carry: RowCarry; // lo que la fila trae y no se juega (AC-157): se vuelve a escribir tal cual
  revision: number;
}

export interface ProgressStore {
  // null: el usuario aún no tiene fila. Lanza si la BD falla o si el registro no pasa la validación (AC-131)
  load(userId: string): Promise<StoredProgress | null>;
  // Escribe solo si la fila sigue en `revision` (0: aún no existe), con la versión y lo que conserva de la fila que se
  // leyó (`carry`). Devuelve la revisión nueva, o null si otro proceso escribió antes (y entonces la fila no se toca)
  save(userId: string, progress: SavedProgress, revision: number, carry: RowCarry): Promise<number | null>;
  ping(): Promise<void>; // ¿responde la BD? (solo mientras está degradada, para saber si volvió)
}

export class InvalidProgressError extends Error {}

export function createPgStore(pool: Pool): ProgressStore {
  return {
    async load(userId) {
      const { rows } = await pool.query('SELECT state, revision FROM player_progress WHERE user_id = $1', [userId]);
      if (rows.length === 0) return null;
      const parsed = parseProgress(rows[0].state);
      if (!parsed) throw new InvalidProgressError(`Registro de progreso no válido (${userId})`);
      return { ...parsed, revision: Number(rows[0].revision) };
    },
    async save(userId, progress, revision, carry) {
      const state = serializeProgress(progress, carry);
      const { rows } =
        revision === 0
          ? await pool.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING RETURNING revision', [userId, state])
          : await pool.query(
              'UPDATE player_progress SET state = $2, revision = revision + 1, updated_at = now() WHERE user_id = $1 AND revision = $3 RETURNING revision',
              [userId, state, revision]
            );
      return rows.length ? Number(rows[0].revision) : null;
    },
    async ping() {
      await pool.query('SELECT 1');
    }
  };
}

export const SAVE_INTERVAL_MS = 2000; // el oro queda escrito en ≤ 5 s (AC-130 b)
// Con la BD caída, una consulta ligera por segundo como mucho: el aviso se va ≤ 5 s después de que la BD vuelva, dure lo
// que dure el corte, sin saturarla con escrituras (AC-132, opción B de game-product)
export const PROBE_INTERVAL_MS = 1000;

export interface PersistenceOptions {
  store: ProgressStore;
  read: (userId: string) => SavedProgress | null; // el progreso vivo del jugador en el mundo
  onConflict: (userId: string) => void; // otro proceso escribió un progreso más nuevo
  saveIntervalMs?: number;
  probeIntervalMs?: number;
  log?: (msg: string) => void;
}

export interface Persistence {
  load: (userId: string) => Promise<StoredProgress | null>;
  track: (userId: string, stored: StoredProgress | null) => void; // tras entrar al mundo con lo cargado
  isTracked: (userId: string) => boolean;
  forget: (userId: string) => void;
  // Escribe `next` y, solo si quedó escrito, llama a apply dentro de la misma cola (nada se cuela entre medias)
  commit: (userId: string, next: SavedProgress, apply: () => void) => Promise<boolean>;
  saveNow: (userId: string) => void; // al desconectarse (AC-130 c)
  saveState: (userId: string) => 'saved' | 'pending' | 'dirty'; // ¿lo que hay en memoria ya está escrito?
  flush: () => Promise<boolean>; // escribe todo lo que cambió y espera a la cola entera; false si alguna escritura falló
  isDegraded: () => boolean; // la BD no responde: tienda cerrada y aviso (AC-132)
  close: () => void;
}

interface Tracked {
  revision: number;
  carry: RowCarry; // de la fila leída; un usuario nuevo, NEW_ROW
  savedKey: string | null; // huella de lo último escrito; null: aún no hay fila
  queue: Promise<void>;
  pending: number;
  lost: boolean; // otro proceso ganó: este ya no escribe
}

export function createPersistence(options: PersistenceOptions): Persistence {
  const { store, read, onConflict } = options;
  const log = options.log ?? (() => {});
  const users = new Map<string, Tracked>();
  let degraded = false;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;
  let probing = false;
  let closed = false;

  const enqueue = (t: Tracked, job: () => Promise<void>): Promise<void> => {
    t.pending++;
    const run = t.queue.then(job).finally(() => t.pending--);
    t.queue = run.catch(() => {});
    return run;
  };

  async function write(userId: string, t: Tracked, progress: SavedProgress): Promise<boolean> {
    if (t.lost) return false;
    const revision = await store.save(userId, progress, t.revision, t.carry);
    if (revision === null) {
      t.lost = true;
      log(`⚠️  El progreso de ${userId} cambió en otro proceso: no se sobrescribe`);
      onConflict(userId);
      return false;
    }
    t.revision = revision;
    t.savedKey = progressKey(progress);
    return true;
  }

  // Una escritura falló: se avisa una vez y se pasa a sondear (no se insiste con escrituras)
  function markFailed(err: Error): void {
    if (degraded) return;
    degraded = true;
    log(`⚠️  La BD no responde (${err.message}): progreso sin guardar, comprobando cada ${options.probeIntervalMs ?? PROBE_INTERVAL_MS} ms`);
    scheduleProbe();
  }

  function scheduleProbe(): void {
    if (probeTimer || closed) return;
    probeTimer = setTimeout(() => void probe(), options.probeIntervalMs ?? PROBE_INTERVAL_MS);
    probeTimer.unref();
  }

  // Un SELECT 1 (con la BD colgada, un solo plazo de 3 s, sin solaparse); si responde, se escribe todo lo pendiente
  async function probe(): Promise<void> {
    probeTimer = null;
    if (probing || closed) return;
    probing = true;
    try {
      await store.ping();
      const results = await Promise.all([...users].map(([userId, t]) => saveCurrent(userId, t)));
      if (results.includes(false)) throw new Error('escritura fallida');
      degraded = false;
      log('✅ La BD responde de nuevo: progreso guardado');
    } catch {
      scheduleProbe();
    } finally {
      probing = false;
    }
  }

  // Escribe el progreso vivo si cambió desde la última escritura (lo lee al ejecutarse, no al encolarse). false: falló
  const saveCurrent = (userId: string, t: Tracked): Promise<boolean> => {
    let ok = true;
    return enqueue(t, async () => {
      const progress = read(userId);
      if (!progress || t.lost || progressKey(progress) === t.savedKey) return;
      try {
        await write(userId, t, progress);
      } catch (err) {
        ok = false;
        markFailed(err as Error);
      }
    }).then(() => ok);
  };

  // Guardado periódico: solo quien cambió y no tiene ya una escritura en cola. Con la BD caída, lo hace el reintento
  const timer = setInterval(() => {
    if (degraded) return;
    for (const [userId, t] of users) {
      if (t.lost || t.pending > 0) continue;
      const progress = read(userId);
      if (progress && progressKey(progress) !== t.savedKey) void saveCurrent(userId, t);
    }
  }, options.saveIntervalMs ?? SAVE_INTERVAL_MS);
  timer.unref();

  return {
    // Si alguien carga bien mientras la BD estaba degradada, la BD volvió: se escribe ya, sin esperar al sondeo
    load: async (userId) => {
      const stored = await store.load(userId);
      if (degraded && !probing) {
        if (probeTimer) clearTimeout(probeTimer);
        probeTimer = null;
        void probe();
      }
      return stored;
    },
    track: (userId, stored) => {
      users.set(userId, { revision: stored?.revision ?? 0, carry: stored?.carry ?? NEW_ROW, savedKey: stored ? progressKey(stored.progress) : null, queue: Promise.resolve(), pending: 0, lost: false });
    },
    isTracked: (userId) => users.has(userId),
    forget: (userId) => {
      users.delete(userId);
    },
    commit: async (userId, next, apply) => {
      const t = users.get(userId);
      if (!t || degraded) return false;
      let saved = false;
      await enqueue(t, async () => {
        try {
          saved = await write(userId, t, next);
        } catch (err) {
          markFailed(err as Error);
        }
        if (saved) apply();
      });
      return saved;
    },
    saveNow: (userId) => {
      const t = users.get(userId);
      if (t && !degraded) void saveCurrent(userId, t);
    },
    saveState: (userId) => {
      const t = users.get(userId);
      if (!t) return 'saved';
      if (t.pending > 0) return 'pending';
      const progress = read(userId);
      return !progress || progressKey(progress) === t.savedKey ? 'saved' : 'dirty';
    },
    flush: async () => {
      const results = await Promise.all([...users].map(([userId, t]) => saveCurrent(userId, t)));
      return !results.includes(false);
    },
    isDegraded: () => degraded,
    close: () => {
      closed = true;
      clearInterval(timer);
      if (probeTimer) clearTimeout(probeTimer);
    }
  };
}

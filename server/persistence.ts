// Progreso guardado de los usuarios de Clerk (AC-97, AC-129, AC-130). La simulación (src/game) no sabe nada de la BD: el
// servidor de juego carga al entrar, escribe las compras y los cambios de barco antes de confirmarlos y el resto (el
// oro) cada 2 s, solo si algo cambió: en reposo no hay ni una consulta. Las escrituras de cada usuario van en cola, en
// orden, y llevan la revisión que leyeron: si otro proceso escribió algo más nuevo, no se pisa
import { Pool } from 'pg';
import { parseProgress, progressKey, SavedProgress, serializeProgress } from './progress';

export interface StoredProgress {
  progress: SavedProgress;
  revision: number;
}

export interface ProgressStore {
  // null: el usuario aún no tiene fila. Lanza si la BD falla o si el registro no pasa la validación (AC-131)
  load(userId: string): Promise<StoredProgress | null>;
  // Escribe solo si la fila sigue en `revision` (0: aún no existe). Devuelve la revisión nueva, o null si otro proceso
  // escribió antes (y entonces la fila no se toca)
  save(userId: string, progress: SavedProgress, revision: number): Promise<number | null>;
}

export class InvalidProgressError extends Error {}

export function createPgStore(pool: Pool): ProgressStore {
  return {
    async load(userId) {
      const { rows } = await pool.query('SELECT state, revision FROM player_progress WHERE user_id = $1', [userId]);
      if (rows.length === 0) return null;
      const progress = parseProgress(rows[0].state);
      if (!progress) throw new InvalidProgressError(`Registro de progreso no válido (${userId})`);
      return { progress, revision: Number(rows[0].revision) };
    },
    async save(userId, progress, revision) {
      const state = serializeProgress(progress);
      const { rows } =
        revision === 0
          ? await pool.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING RETURNING revision', [userId, state])
          : await pool.query(
              'UPDATE player_progress SET state = $2, revision = revision + 1, updated_at = now() WHERE user_id = $1 AND revision = $3 RETURNING revision',
              [userId, state, revision]
            );
      return rows.length ? Number(rows[0].revision) : null;
    }
  };
}

export const SAVE_INTERVAL_MS = 2000; // el oro queda escrito en ≤ 5 s (AC-130 b)

export interface PersistenceOptions {
  store: ProgressStore;
  read: (userId: string) => SavedProgress | null; // el progreso vivo del jugador en el mundo
  onConflict: (userId: string) => void; // otro proceso escribió un progreso más nuevo
  saveIntervalMs?: number;
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
  flush: () => Promise<void>; // escribe todo lo que cambió y espera a la cola entera
  close: () => void;
}

interface Tracked {
  revision: number;
  savedKey: string | null; // huella de lo último escrito; null: aún no hay fila
  queue: Promise<void>;
  pending: number;
  lost: boolean; // otro proceso ganó: este ya no escribe
}

export function createPersistence(options: PersistenceOptions): Persistence {
  const { store, read, onConflict } = options;
  const log = options.log ?? (() => {});
  const users = new Map<string, Tracked>();

  const enqueue = (t: Tracked, job: () => Promise<void>): Promise<void> => {
    t.pending++;
    const run = t.queue.then(job).finally(() => t.pending--);
    t.queue = run.catch(() => {});
    return run;
  };

  async function write(userId: string, t: Tracked, progress: SavedProgress): Promise<boolean> {
    if (t.lost) return false;
    const revision = await store.save(userId, progress, t.revision);
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

  // Escribe el progreso vivo si cambió desde la última escritura (lo lee al ejecutarse, no al encolarse)
  const saveCurrent = (userId: string, t: Tracked) =>
    enqueue(t, async () => {
      const progress = read(userId);
      if (!progress || t.lost || progressKey(progress) === t.savedKey) return;
      try {
        await write(userId, t, progress);
      } catch (err) {
        log(`⚠️  No se pudo guardar el progreso de ${userId}: ${(err as Error).message}`);
      }
    });

  // Guardado periódico: solo quien cambió y no tiene ya una escritura en cola
  const timer = setInterval(() => {
    for (const [userId, t] of users) {
      if (t.lost || t.pending > 0) continue;
      const progress = read(userId);
      if (progress && progressKey(progress) !== t.savedKey) void saveCurrent(userId, t);
    }
  }, options.saveIntervalMs ?? SAVE_INTERVAL_MS);
  timer.unref();

  return {
    load: (userId) => store.load(userId),
    track: (userId, stored) => {
      users.set(userId, { revision: stored?.revision ?? 0, savedKey: stored ? progressKey(stored.progress) : null, queue: Promise.resolve(), pending: 0, lost: false });
    },
    isTracked: (userId) => users.has(userId),
    forget: (userId) => {
      users.delete(userId);
    },
    commit: async (userId, next, apply) => {
      const t = users.get(userId);
      if (!t) return false;
      let saved = false;
      await enqueue(t, async () => {
        try {
          saved = await write(userId, t, next);
        } catch (err) {
          log(`⚠️  No se pudo guardar una compra de ${userId}: ${(err as Error).message}`);
        }
        if (saved) apply();
      });
      return saved;
    },
    saveNow: (userId) => {
      const t = users.get(userId);
      if (t) void saveCurrent(userId, t);
    },
    saveState: (userId) => {
      const t = users.get(userId);
      if (!t) return 'saved';
      if (t.pending > 0) return 'pending';
      const progress = read(userId);
      return !progress || progressKey(progress) === t.savedKey ? 'saved' : 'dirty';
    },
    flush: async () => {
      await Promise.all([...users].map(([userId, t]) => saveCurrent(userId, t)));
    },
    close: () => clearInterval(timer)
  };
}

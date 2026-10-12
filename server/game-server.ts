// Servidor de juego autoritativo sobre Socket.IO (GDD §13): valida intenciones, simula a 20 Hz y envía a cada
// cliente solo lo que cambió dentro de su área de interés, a 10 Hz y en un único mensaje por envío.
import type { Server, Socket } from 'socket.io';
import {
  INTENT_BURST,
  INTENT_RATE_PER_SECOND,
  INTEREST_RADIUS,
  MAP_HALF_SIZE,
  MAX_PLAYERS,
  SNAPSHOT_RATE,
  TICK_RATE
} from '../src/game/constants';
import {
  C2S,
  S2C,
  parseAttack,
  parseBuy,
  parseEmpty,
  parseJoin,
  parseMoveTo,
  parseRepair,
  parseSelectShip
} from '../src/game/protocol';
import { GameEvent, Notice, ServerFrame, ShipDelta, ShipSnapshot, Welcome, World } from '../src/game/types';
import { distance } from '../src/game/vec';
import {
  ActionResult,
  addPlayer,
  applyBuy,
  applyPurchase,
  applySelectShip,
  attack,
  buy,
  cancelAttack,
  createWorld,
  disconnectPlayer,
  drainEvents,
  moveTo,
  planBuy,
  planSelectShip,
  playerView,
  removePlayer,
  respawn,
  selectShip,
  setRepair,
  shipOfPlayer,
  shipSnapshot,
  step,
  stop
} from '../src/game/world';
import type { Identity } from './auth';
import { createPersistence, ProgressStore, StoredProgress } from './persistence';
import { progressOf, SavedProgress } from './progress';

export interface GameServerOptions {
  authenticate: (auth: unknown) => Promise<Identity>;
  seed?: number;
  spawnNpcs?: boolean;
  tickRate?: number;
  snapshotRate?: number;
  autoStart?: boolean; // false: los tests avanzan la simulación con tick()
  setup?: (world: World) => void; // preparar el mundo antes de aceptar jugadores (escenarios de captura)
  now?: () => number; // reloj en ms para el límite de intenciones
  log?: (msg: string) => void;
  store?: ProgressStore; // progreso guardado de los usuarios de Clerk (AC-97); sin él, todo vive en memoria
  saveIntervalMs?: number; // guardado periódico del oro (por defecto 2 s)
  probeIntervalMs?: number; // con la BD caída, cada cuánto se comprueba si volvió (por defecto 1 s)
}

export interface GameServer {
  world: World;
  onlinePlayers: () => number;
  tick: () => void;
  stop: () => void;
  flushProgress: () => Promise<void>; // escribe ya todo el progreso que cambió y espera (apagado, tests)
}

const KICKED_TEXT = 'Abriste el juego en otra pestaña';
const PROGRESS_ERROR_TEXT = 'No podemos cargar tu progreso ahora mismo';
const SHOP_UNAVAILABLE_TEXT = 'La tienda no está disponible: no podemos guardar';

// Estado de red por cliente: qué barcos conoce y con qué valores
interface ClientState {
  socket: Socket;
  userId: string;
  known: Map<string, ShipSnapshot>;
  lastView: string;
  notices: Notice[];
  needsFull: boolean;
}

// Margen para que un evento en el borde del área (p. ej. una andanada desde fuera) llegue a quien lo ve
const EVENT_MARGIN = 60;
const SNAPSHOT_KEYS: (keyof ShipSnapshot)[] = ['k', 'c', 'n', 'o', 'x', 'z', 'h', 's', 'hp', 'mhp', 'st', 't', 'r', 'pu'];

export function createGameServer(io: Server, options: GameServerOptions): GameServer {
  const tickRate = options.tickRate ?? TICK_RATE;
  const snapshotEvery = Math.max(1, Math.round(tickRate / (options.snapshotRate ?? SNAPSHOT_RATE)));
  const log = options.log ?? (() => {});
  const now = options.now ?? Date.now;
  const world = createWorld({ seed: options.seed, spawnNpcs: options.spawnNpcs });
  options.setup?.(world);
  const clients = new Map<string, ClientState>(); // por userId: una sola pestaña por usuario
  let ticks = 0;
  let pendingEvents: GameEvent[] = [];
  const purchasing = new Set<string>(); // usuarios con una compra o un cambio de barco esperando a la BD
  const departing = new Set<string>(); // desconectados que salen de la memoria al retirar su barco (AC-129)

  const persistence = options.store
    ? createPersistence({
        store: options.store,
        read: (userId) => {
          const player = world.players.get(userId);
          return player ? progressOf(player) : null;
        },
        // Otro proceso escribió un progreso más nuevo: este suelta al jugador para no pisarlo; al volver, se carga de la BD
        onConflict: (userId) => {
          const c = clients.get(userId);
          if (c) {
            clients.delete(userId);
            c.socket.emit(S2C.kicked, { text: KICKED_TEXT });
            c.socket.disconnect(true);
          }
          removePlayer(world, userId);
          persistence?.forget(userId);
        },
        saveIntervalMs: options.saveIntervalMs,
        probeIntervalMs: options.probeIntervalMs,
        log
      })
    : null;
  // Con la BD caída, la tienda y el cambio de barco se cierran para todos los jugadores con cuenta (AC-132)
  const shopClosed = (userId: string) => !!persistence?.isDegraded() && persistence.isTracked(userId);

  io.use(async (socket, next) => {
    try {
      socket.data.identity = await options.authenticate(socket.handshake.auth);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  // Plazas: clientes conectados más barcos que esperan una reconexión (§13)
  const occupiedSlots = (exceptUser: string) => {
    let n = 0;
    for (const id of clients.keys()) if (id !== exceptUser) n++;
    for (const s of world.ships.values()) if (s.kind === 'player' && s.disconnectedAt !== null && s.ownerId !== exceptUser) n++;
    return n;
  };

  io.on('connection', (socket) => {
    const { userId, guest } = socket.data.identity as Identity;
    let client: ClientState | null = null;
    let joining = false;
    let joinAttempts = 0;
    let tokens = INTENT_BURST;
    let lastRefill = now();

    // Cubeta de fichas: ráfaga de 20 y 10/s sostenidas; el exceso se descarta (AC-06)
    const takeToken = () => {
      const t = now();
      tokens = Math.min(INTENT_BURST, tokens + ((t - lastRefill) / 1000) * INTENT_RATE_PER_SECOND);
      lastRefill = t;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    };

    // Solo llegan al handler payloads válidos; un error en uno no afecta a los demás (AC-05)
    const on = <T>(event: string, parse: (raw: unknown) => T | null, handler: (data: T, c: ClientState) => ActionResult | void) => {
      socket.on(event, (raw: unknown) => {
        if (!takeToken() || !client) return;
        const data = parse(raw);
        if (data === null) return;
        try {
          const result = handler(data, client);
          if (result && !result.ok) client.notices.push({ kind: 'error', text: result.reason });
        } catch (err) {
          log(`❌ Error en '${event}' (${socket.id}): ${String(err)}`);
        }
      });
    };

    const rejectIfFull = () => {
      if (occupiedSlots(userId) < MAX_PLAYERS) return false;
      socket.emit(S2C.full, { text: 'Servidor lleno' });
      socket.disconnect(true);
      return true;
    };

    // Entra al mundo con el progreso recién cargado de la BD (stored) o con el que ya está en memoria (undefined)
    const enter = (name: string | null, stored?: StoredProgress | null) => {
      if (rejectIfFull()) return;
      const previous = clients.get(userId);
      if (previous && previous.socket.id !== socket.id) {
        previous.socket.emit(S2C.kicked, { text: KICKED_TEXT });
        previous.socket.disconnect(true);
      }
      const existing = world.players.get(userId);
      const player = addPlayer(world, userId, name ?? existing?.name ?? defaultName(userId), stored?.progress);
      if (stored !== undefined) persistence?.track(userId, stored);
      departing.delete(userId);
      client = { socket, userId, known: new Map(), lastView: '', notices: [], needsFull: true };
      clients.set(userId, client);
      const welcome: Welcome = {
        playerId: userId,
        shipId: player.shipId,
        time: world.time,
        mapHalfSize: MAP_HALF_SIZE,
        islands: world.islands,
        tickRate,
        snapshotRate: tickRate / snapshotEvery,
        interestRadius: INTEREST_RADIUS
      };
      socket.emit(S2C.welcome, welcome);
      sendFrame(client, []); // snapshot completo inmediato
      log(`🎮 ${player.name} se unió (${clients.size} en línea)`);
    };

    // join se procesa una vez por socket y no gasta fichas; solo los reintentos tras un fallo de carga las gastan
    socket.on(C2S.join, (raw: unknown) => {
      if (client || joining) return;
      if (joinAttempts++ > 0 && !takeToken()) return;
      const data = parseJoin(raw);
      if (!data || rejectIfFull()) return;
      // Invitado, sin BD o con el jugador aún en memoria (reconexión, otra pestaña): la memoria es lo más fresco
      if (!persistence || guest || world.players.has(userId)) {
        enter(data.name);
        return;
      }
      joining = true;
      persistence.load(userId).then(
        (stored) => {
          joining = false;
          if (!socket.connected || client) return;
          enter(data.name, world.players.has(userId) ? undefined : stored); // otra pestaña pudo cargarlo mientras tanto
        },
        (err: Error) => {
          joining = false;
          // Nunca se entra con un estado por defecto: podría sobrescribir el progreso real (AC-131)
          log(`⚠️  No se pudo cargar el progreso de ${userId}: ${err.message}`);
          if (socket.connected) socket.emit(S2C.progressError, { text: PROGRESS_ERROR_TEXT });
        }
      );
    });

    on(C2S.moveTo, parseMoveTo, (target) => moveTo(world, userId, target));
    on(C2S.stop, parseEmpty, () => stop(world, userId));
    on(C2S.attack, parseAttack, ({ targetId }) => attack(world, userId, targetId));
    on(C2S.cancelAttack, parseEmpty, () => cancelAttack(world, userId));
    on(C2S.repair, parseRepair, ({ on: enabled }) => setRepair(world, userId, enabled));
    // Con progreso guardado, la compra o el cambio de barco se escribe en la BD y solo entonces se aplica y se confirma
    // (AC-130 a); si la escritura falla, se rechaza y el mundo no cambia. Una a la vez por usuario
    const persisted = () => !!persistence?.isTracked(userId);
    const commit = (c: ClientState, next: SavedProgress, apply: () => void, okText: string | null): ActionResult => {
      purchasing.add(userId);
      persistence!
        .commit(userId, next, apply)
        .then((saved) => {
          if (!saved) c.notices.push({ kind: 'error', text: SHOP_UNAVAILABLE_TEXT });
          else if (okText) c.notices.push({ kind: 'info', text: okText });
        })
        .catch((err: Error) => log(`❌ Error al aplicar una compra de ${userId}: ${err.message}`))
        .finally(() => purchasing.delete(userId));
      return { ok: true };
    };

    on(C2S.buy, parseBuy, ({ item }, c) => {
      if (!persisted()) {
        const result = buy(world, userId, item);
        if (result.ok) c.notices.push({ kind: 'info', text: 'Compra realizada' });
        return result;
      }
      if (shopClosed(userId)) return { ok: false, reason: SHOP_UNAVAILABLE_TEXT };
      if (purchasing.has(userId)) return { ok: false, reason: 'Compra en curso' };
      const plan = planBuy(world, userId, item);
      if (!plan.ok) return plan;
      const next = progressOf(world.players.get(userId)!);
      applyPurchase(next, item, plan.price);
      return commit(c, next, () => applyBuy(world, userId, item, plan.price), 'Compra realizada');
    });
    on(C2S.selectShip, parseSelectShip, ({ classId }, c) => {
      if (!persisted()) return selectShip(world, userId, classId);
      if (shopClosed(userId)) return { ok: false, reason: SHOP_UNAVAILABLE_TEXT };
      if (purchasing.has(userId)) return { ok: false, reason: 'Compra en curso' };
      const plan = planSelectShip(world, userId, classId);
      if (!plan.ok) return plan;
      const player = world.players.get(userId)!;
      if (player.activeShip === classId) return { ok: true };
      return commit(c, { ...progressOf(player), activeShip: classId }, () => applySelectShip(world, userId, classId), null);
    });
    on(C2S.respawn, parseEmpty, () => respawn(world, userId));

    socket.on('disconnect', () => {
      if (!client || clients.get(userId) !== client) return;
      clients.delete(userId);
      disconnectPlayer(world, userId); // el barco sigue 10 s en el mundo (AC-96)
      persistence?.saveNow(userId); // el progreso se escribe ya, sin esperar al guardado periódico (AC-130 c)
      departing.add(userId);
      log(`👋 ${userId} salió (${clients.size} en línea)`);
    });
  });

  // Delta de un cliente: barcos que entran (completos), campos que cambiaron y barcos que salen
  function diffShips(client: ClientState, current: Map<string, ShipSnapshot>, center: { x: number; z: number } | null, ownShipId: string | null) {
    const s: ShipDelta[] = [];
    const r: string[] = [];
    const visible = new Set<string>();
    for (const snap of current.values()) {
      const inside = snap.id === ownShipId || (center !== null && Math.hypot(snap.x - center.x, snap.z - center.z) <= INTEREST_RADIUS);
      if (!inside) continue;
      visible.add(snap.id);
      const prev = client.known.get(snap.id);
      if (!prev || client.needsFull) {
        s.push(snap);
        client.known.set(snap.id, snap);
        continue;
      }
      let delta: ShipDelta | null = null;
      for (const key of SNAPSHOT_KEYS) {
        if (prev[key] !== snap[key]) {
          delta ??= { id: snap.id };
          (delta as Record<string, unknown>)[key] = snap[key];
        }
      }
      if (delta) {
        s.push(delta);
        client.known.set(snap.id, snap);
      }
    }
    for (const id of [...client.known.keys()]) {
      if (!visible.has(id)) {
        client.known.delete(id);
        if (!client.needsFull) r.push(id);
      }
    }
    return { s, r };
  }

  function eventVisible(e: GameEvent, client: ClientState, center: { x: number; z: number } | null): boolean {
    const radius = INTEREST_RADIUS + EVENT_MARGIN;
    const near = (p: { x: number; z: number }) => center !== null && distance(p, center) <= radius;
    switch (e.type) {
      case 'loot':
        return e.playerId === client.userId;
      case 'wreck':
      case 'wreckGone':
        return true; // raros y pequeños: todos mantienen la lista de restos al día
      case 'volley':
        return near(e.from) || near(e.to);
      case 'respawn': {
        const ship = world.ships.get(e.shipId);
        return !!ship && (ship.ownerId === client.userId || near(ship.pos));
      }
      default:
        return near(e.pos);
    }
  }

  function sendFrame(client: ClientState, events: GameEvent[], current = snapshotAll()) {
    const own = shipOfPlayer(world, client.userId);
    const center = own ? own.pos : null;
    const full = client.needsFull;
    const { s, r } = diffShips(client, current, center, own && own.state !== 'dead' ? own.id : null);
    client.needsFull = false;
    const frame: ServerFrame = { t: world.time };
    if (full) frame.full = true;
    if (s.length) frame.s = s;
    if (r.length) frame.r = r;
    const visibleEvents = full ? [] : events.filter((e) => eventVisible(e, client, center));
    if (visibleEvents.length) frame.e = visibleEvents;
    if (full) frame.w = world.wrecks.map((w) => ({ id: w.id, x: w.pos.x, z: w.pos.z, gold: w.gold, expiresAt: w.expiresAt }));
    const view = playerView(world, client.userId);
    if (view && shopClosed(client.userId)) view.unsaved = true; // aviso persistente (AC-132)
    const viewKey = view ? JSON.stringify(view) : '';
    if (view && viewKey !== client.lastView) {
      frame.me = view;
      client.lastView = viewKey;
    }
    if (client.notices.length) {
      frame.n = client.notices;
      client.notices = [];
    }
    // Sin cambios no se envía nada (AC-87)
    if (!full && !frame.s && !frame.r && !frame.e && !frame.me && !frame.n) return;
    client.socket.emit(S2C.frame, frame);
  }

  // Los barcos hundidos del todo no se envían; los que se están hundiendo sí (para la animación)
  function snapshotAll(): Map<string, ShipSnapshot> {
    const current = new Map<string, ShipSnapshot>();
    for (const ship of world.ships.values()) if (ship.state !== 'dead') current.set(ship.id, shipSnapshot(world, ship));
    return current;
  }

  function broadcast() {
    const events = pendingEvents;
    pendingEvents = [];
    if (clients.size === 0) return;
    const current = snapshotAll();
    for (const client of clients.values()) sendFrame(client, events, current);
  }

  // Pasado el margen de reconexión, el barco ya no está (AC-96) y el jugador sale de la memoria: al volver, su progreso se
  // lee de la BD (AC-129) y el invitado empieza de cero. Con progreso guardado, solo cuando ya está escrito; si la
  // escritura falla, sigue en memoria hasta que se escriba, para no perder el oro
  function releaseDeparted() {
    for (const userId of departing) {
      const player = world.players.get(userId);
      if (!player) {
        departing.delete(userId);
        continue;
      }
      if (world.ships.has(player.shipId) || clients.has(userId) || purchasing.has(userId)) continue;
      if (persistence?.isTracked(userId)) {
        if (persistence.saveState(userId) !== 'saved') continue; // lo escribe el guardado periódico (o el reintento)
        persistence.forget(userId);
      }
      world.players.delete(userId);
      departing.delete(userId);
    }
  }

  function tick() {
    step(world, 1 / tickRate);
    if (departing.size) releaseDeparted();
    pendingEvents.push(...drainEvents(world));
    ticks++;
    if (ticks % snapshotEvery === 0) broadcast();
  }

  // Bucle de paso fijo: recupera ticks atrasados sin superar 5 por intervalo
  let interval: ReturnType<typeof setInterval> | null = null;
  if (options.autoStart !== false) {
    const dt = 1 / tickRate;
    let accumulator = 0;
    let last = Date.now();
    interval = setInterval(() => {
      const t = Date.now();
      accumulator = Math.min(accumulator + (t - last) / 1000, dt * 5);
      last = t;
      while (accumulator >= dt) {
        tick();
        accumulator -= dt;
      }
    }, 1000 / tickRate);
  }

  return {
    world,
    onlinePlayers: () => clients.size,
    tick,
    stop: () => {
      if (interval) clearInterval(interval);
      persistence?.close();
    },
    flushProgress: () => persistence?.flush() ?? Promise.resolve()
  };
}

function defaultName(userId: string): string {
  return `Capitán ${userId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`;
}

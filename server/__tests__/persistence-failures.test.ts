// Fallos de la BD (AC-131, AC-132) con Postgres real detrás de un proxy TCP que la corta (parada) o la cuelga (acepta y
// no contesta) sin pararla de verdad. Servidor de juego en este proceso y socket.io real
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { Socket as ClientSocket } from 'socket.io-client';
import { DISCONNECT_GRACE, TICK_RATE } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { Notice, PlayerView, Welcome } from '../../src/game/types';
import { shipOfPlayer } from '../../src/game/world';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
import { createGameServer, GameServer, GameServerOptions } from '../game-server';
import { createPersistence, createPgStore, ProgressStore } from '../persistence';
import { SavedProgress } from '../progress';
import { PgProxy, startPgProxy } from './fixtures/pg-proxy';
import { connectGame, joinGame, Joined, sleep, waitFor } from './fixtures/game-socket';
import { createTestDb, TestDb } from './pg/test-db';

jest.setTimeout(30_000);

const testAuth = async (auth: unknown) => {
  const token = (auth as { token?: unknown })?.token;
  if (typeof token !== 'string') throw new Error('unauthorized');
  return { userId: token, guest: token.startsWith('guest-') };
};

let db: TestDb;
let proxy: PgProxy;
let pool: Pool; // a través del proxy: es la conexión del servidor de juego
let httpServer: HttpServer;
let io: Server;
let game: GameServer | null = null;
let url: string;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  db = await createTestDb();
  const direct = createPool(db.url);
  await migrate(direct);
  await direct.end();
});

afterAll(async () => {
  await db?.drop();
});

beforeEach(async () => {
  await db.admin.query('TRUNCATE player_progress');
  proxy = await startPgProxy(db.url);
  pool = createPool(proxy.url);
});

afterEach(async () => {
  sockets.splice(0).forEach((c) => c.disconnect());
  proxy.restore();
  if (game) {
    const current = game;
    game = null;
    await sleep(50);
    await Promise.race([current.flushProgress(), new Promise((r) => setTimeout(r, 5000).unref())]);
    current.stop();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
  await pool.end();
  await proxy.close();
}, 20_000);

async function startServer(opts: Partial<GameServerOptions> = {}): Promise<void> {
  httpServer = createServer();
  io = new Server(httpServer);
  game = createGameServer(io, { authenticate: testAuth, seed: 11, spawnNpcs: false, store: createPgStore(pool), ...opts });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
}

const world = () => game!.world;
const join = (userId: string): Promise<Joined> => joinGame(url, { token: userId }, userId, sockets);
const SLOOP_ONLY: SavedProgress = { gold: 100, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop' };
const FRIGATE: SavedProgress = { gold: 1234, upgrades: { cannons: 2, hull: 3, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate' };
const fields = (v: PlayerView): SavedProgress => ({ gold: v.gold, upgrades: v.upgrades, ownedShips: v.ownedShips, activeShip: v.activeShip });
const texts = (j: Joined) => j.notices().map((n: Notice) => n.text);

async function seed(userId: string, state: unknown): Promise<void> {
  await db.admin.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', [userId, state]);
}

// La fila tal cual está en la BD, para compararla byte a byte (lectura directa, sin el proxy)
async function rawRow(userId: string): Promise<string> {
  const { rows } = await db.admin.query('SELECT state::text AS s, revision::text AS r, updated_at::text AS u FROM player_progress WHERE user_id = $1', [userId]);
  return JSON.stringify(rows);
}

async function stateOf(userId: string): Promise<Record<string, unknown> | undefined> {
  const { rows } = await db.admin.query('SELECT state FROM player_progress WHERE user_id = $1', [userId]);
  return rows[0]?.state;
}

// Pide entrar por un socket ya conectado y espera la respuesta: bienvenida o «No podemos cargar tu progreso»
function tryJoin(c: ClientSocket): Promise<{ welcome?: Welcome; error?: Notice; ms: number }> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const done = (r: { welcome?: Welcome; error?: Notice }) => {
      c.off(S2C.welcome, onWelcome);
      c.off(S2C.progressError, onError);
      resolve({ ...r, ms: Date.now() - t0 });
    };
    const onWelcome = (welcome: Welcome) => done({ welcome });
    const onError = (error: Notice) => done({ error });
    c.on(S2C.welcome, onWelcome);
    c.on(S2C.progressError, onError);
    c.emit(C2S.join, {});
  });
}

async function connected(userId: string): Promise<ClientSocket> {
  const c = connectGame(url, { token: userId });
  sockets.push(c);
  await new Promise<void>((resolve) => c.once('connect', () => resolve()));
  return c;
}

const lastView = (c: ClientSocket) => {
  let view: PlayerView | null = null;
  c.on(S2C.frame, (f: { me?: PlayerView }) => {
    if (f.me) view = f.me;
  });
  return () => view;
};

describe('AC-131: si no se puede cargar el progreso, no se entra con un estado por defecto', () => {
  test('BD parada: «No podemos cargar tu progreso ahora mismo», no entra y la fila queda igual byte a byte; al volver la BD, Reintentar entra con su progreso', async () => {
    await seed('u-ana', { v: 1, ...FRIGATE });
    const before = await rawRow('u-ana');
    await startServer();
    proxy.cut();
    const c = await connected('u-ana');
    const first = await tryJoin(c);
    expect(first.error).toEqual({ text: 'No podemos cargar tu progreso ahora mismo' });
    expect(first.welcome).toBeUndefined();
    expect(world().players.has('u-ana')).toBe(false);
    await sleep(300);
    expect(await rawRow('u-ana')).toBe(before);

    proxy.restore();
    const view = lastView(c);
    const retry = await tryJoin(c);
    expect(retry.welcome).toBeDefined();
    await waitFor(() => view() !== null, 3000, 'la vista privada');
    expect(fields(view()!)).toEqual(FRIGATE);
  });

  test('BD colgada: tras 3 s sin respuesta sale el mismo aviso; la fila queda igual; al volver, Reintentar entra', async () => {
    await seed('u-bea', { v: 1, ...FRIGATE });
    const before = await rawRow('u-bea');
    await startServer();
    proxy.hang();
    const c = await connected('u-bea');
    const first = await tryJoin(c);
    console.log(`AC-131: BD colgada → aviso a los ${first.ms} ms`);
    expect(first.error?.text).toBe('No podemos cargar tu progreso ahora mismo');
    expect(first.ms).toBeGreaterThanOrEqual(2900);
    expect(first.ms).toBeLessThanOrEqual(4500);
    expect(world().players.has('u-bea')).toBe(false);
    expect(await rawRow('u-bea')).toBe(before);

    proxy.restore();
    const view = lastView(c);
    expect((await tryJoin(c)).welcome).toBeDefined();
    await waitFor(() => view() !== null, 3000, 'la vista privada');
    expect(fields(view()!)).toEqual(FRIGATE);
  });

  test.each([
    ['oro negativo', { v: 1, ...FRIGATE, gold: -5 }],
    ['nivel 4', { v: 1, ...FRIGATE, upgrades: { cannons: 4, hull: 1, sails: 1 } }],
    ['barco activo que no posee', { v: 1, ...FRIGATE, ownedShips: ['sloop'], activeShip: 'frigate' }]
  ])('registro corrupto (%s): el aviso, la fila intacta aunque reintente; reparada la fila, entra con ella', async (_label, corrupt) => {
    await seed('u-cai', corrupt);
    const before = await rawRow('u-cai');
    await startServer();
    const c = await connected('u-cai');
    expect((await tryJoin(c)).error?.text).toBe('No podemos cargar tu progreso ahora mismo');
    expect((await tryJoin(c)).error?.text).toBe('No podemos cargar tu progreso ahora mismo');
    await game!.flushProgress();
    expect(await rawRow('u-cai')).toBe(before);
    expect(world().players.has('u-cai')).toBe(false);

    await db.admin.query('UPDATE player_progress SET state = $2 WHERE user_id = $1', ['u-cai', { v: 1, ...FRIGATE }]);
    const view = lastView(c);
    expect((await tryJoin(c)).welcome).toBeDefined();
    await waitFor(() => view() !== null, 3000, 'la vista privada');
    expect(fields(view()!)).toEqual(FRIGATE);
  });

  test('los reintentos gastan fichas: un cliente que martillea «Reintentar» no pasa del límite de intenciones (ráfaga de 20 y 10/s)', async () => {
    await seed('u-dan', { v: 1, ...SLOOP_ONLY, gold: -1 });
    let loads = 0;
    const inner = createPgStore(pool);
    const store: ProgressStore = { ...inner, load: (id) => (loads++, inner.load(id)) };
    await startServer({ store });
    const c = await connected('u-dan');
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) {
      c.emit(C2S.join, {});
      await sleep(10);
    }
    await sleep(200);
    const seconds = (Date.now() - t0) / 1000;
    console.log(`AC-131: 100 reintentos en ${seconds.toFixed(1)} s → ${loads} lecturas`);
    expect(loads).toBeGreaterThan(20); // los reintentos llegan a la BD…
    expect(loads).toBeLessThanOrEqual(1 + 20 + Math.ceil(10 * seconds)); // …pero no más que las fichas
  });

  test('el invitado entra igual con la BD caída', async () => {
    await startServer();
    proxy.cut();
    const g = await join('guest-gg123456');
    expect(fields(g.me())).toEqual(SLOOP_ONLY);
  });
});

// El almacén real con contadores: escrituras y consultas ligeras, con su instante
function countingStore(inner: ProgressStore) {
  const saves: number[] = [];
  const pings: number[] = [];
  const store: ProgressStore = {
    load: (userId) => inner.load(userId),
    save: (userId, progress, revision) => {
      saves.push(Date.now());
      return inner.save(userId, progress, revision);
    },
    ping: () => {
      pings.push(Date.now());
      return inner.ping();
    }
  };
  return { store, saves, pings };
}

// Todas las consultas del servidor de juego pasan por pool.query (createPgStore): se cuentan con su instante, fallen o no
function countQueries(p: Pool): number[] {
  const at: number[] = [];
  const query = p.query.bind(p) as (...args: unknown[]) => unknown;
  p.query = ((...args: unknown[]) => {
    at.push(Date.now());
    return query(...args);
  }) as unknown as Pool['query'];
  return at;
}

describe('AC-132: con la BD caída en partida se sigue jugando, con aviso y sin tienda', () => {
  test.each([5, 60])(
    'corte de %i s: aviso para los dos jugadores con cuenta (con y sin cambios) y no para el invitado; 0 escrituras y ≤ 1 consulta ligera/s durante el corte; tienda cerrada; al volver la BD, el aviso se va en ≤ 5 s y el oro está escrito',
    async (seconds) => {
      await seed('u-ana', { v: 1, ...SLOOP_ONLY });
      await seed('u-bea', { v: 1, ...SLOOP_ONLY, gold: 5000, ownedShips: ['sloop', 'brig'] });
      const counter = countingStore(createPgStore(pool));
      await startServer({ store: counter.store }); // tiempos reales: guardado cada 2 s y sondeo cada 1 s
      const a = await join('u-ana');
      const b = await join('u-bea');
      const g = await join('guest-gg123456');
      world().players.get('guest-gg123456')!.gold = 5000;

      const cutAt = Date.now();
      proxy.cut();
      world().players.get('u-ana')!.gold += 250; // oro pendiente de escribir; u-bea no cambia nada
      await waitFor(() => a.me().unsaved === true && b.me().unsaved === true, 4000, 'el aviso en los dos jugadores con cuenta');
      const detectedAt = Date.now();
      const savesAtDetection = counter.saves.length;
      expect(g.me().unsaved).toBeUndefined();

      // Se sigue jugando: navegar y cobrar
      const shipA = shipOfPlayer(world(), 'u-ana')!;
      const from = { ...shipA.pos };
      a.c.emit(C2S.moveTo, { x: from.x + 40, z: from.z });
      world().players.get('u-ana')!.gold += 50;
      await waitFor(() => Math.hypot(shipA.pos.x - from.x, shipA.pos.z - from.z) > 2, 3000, 'que el barco navegue');

      // Tienda y cambio de barco cerrados para los jugadores con cuenta; el invitado compra
      b.c.emit(C2S.buy, { itemId: 'cannons:2' });
      b.c.emit(C2S.selectShip, { classId: 'brig' });
      g.c.emit(C2S.buy, { itemId: 'cannons:2' });
      await waitFor(() => texts(b).filter((t) => t === 'La tienda no está disponible: no podemos guardar').length === 2, 3000, 'los dos rechazos');
      await waitFor(() => texts(g).includes('Compra realizada'), 3000, 'la compra del invitado');
      const bea = world().players.get('u-bea')!;
      expect({ gold: bea.gold, cannons: bea.upgrades.cannons, active: bea.activeShip }).toEqual({ gold: 5000, cannons: 1, active: 'sloop' });

      await sleep(Math.max(0, cutAt + seconds * 1000 - Date.now()));
      const outage = (Date.now() - detectedAt) / 1000;
      const pingsDuring = counter.pings.filter((t) => t >= detectedAt).length;
      const savesDuring = counter.saves.length - savesAtDetection;
      console.log(`AC-132 (${seconds} s): durante el corte ${savesDuring} escrituras y ${pingsDuring} consultas ligeras en ${outage.toFixed(1)} s`);
      expect(savesDuring).toBe(0);
      expect(pingsDuring).toBeLessThanOrEqual(Math.ceil(outage) + 1);
      expect(a.me().unsaved).toBe(true);

      const t0 = Date.now();
      proxy.restore();
      await waitFor(() => a.me().unsaved === undefined && b.me().unsaved === undefined, 5000, 'que el aviso desaparezca para los dos');
      console.log(`AC-132 (${seconds} s): aviso fuera ${Date.now() - t0} ms después de volver la BD`);
      expect(Date.now() - t0).toBeLessThanOrEqual(5000);
      expect((await stateOf('u-ana'))?.gold).toBe(400);
      b.c.emit(C2S.buy, { itemId: 'cannons:2' });
      await waitFor(() => texts(b).includes('Compra realizada'), 3000, 'la tienda abierta de nuevo');
    },
    100_000
  );

  // H-24 (decisión de game-product): en reposo no se consulta la BD, así que el corte se detecta con la primera escritura
  test('H-24: con todos en reposo, 15 s de corte sin ninguna consulta ni aviso; la primera compra se rechaza sin cambiar nada y desde ahí los dos jugadores con cuenta ven el aviso; al volver la BD, se va en ≤ 5 s y la fila sigue igual', async () => {
    await seed('u-ana', { v: 1, ...SLOOP_ONLY });
    await seed('u-bea', { v: 1, ...SLOOP_ONLY, gold: 5000, ownedShips: ['sloop', 'brig'] });
    const queries = countQueries(pool);
    await startServer(); // tiempos reales: guardado cada 2 s y sondeo cada 1 s
    const a = await join('u-ana');
    const b = await join('u-bea');
    await sleep(2500); // pasa un guardado periódico: sin cambios no escribe
    const beaRow = await rawRow('u-bea');
    const queriesBefore = queries.length;
    const framesAt = { a: a.frames.length, b: b.frames.length };

    proxy.cut();
    await sleep(15_000);
    const idleQueries = queries.length - queriesBefore;
    const warnedFrames = [...a.frames.slice(framesAt.a), ...b.frames.slice(framesAt.b)].filter((f) => f.me?.unsaved).length;
    expect(idleQueries).toBe(0);
    expect(warnedFrames).toBe(0);
    expect([a.me().unsaved, b.me().unsaved]).toEqual([undefined, undefined]);

    const t0 = Date.now();
    b.c.emit(C2S.buy, { itemId: 'cannons:2' });
    await waitFor(() => texts(b).includes('La tienda no está disponible: no podemos guardar'), 3000, 'el rechazo de la compra');
    const rejectedMs = Date.now() - t0;
    const bea = world().players.get('u-bea')!;
    expect({ gold: bea.gold, cannons: bea.upgrades.cannons }).toEqual({ gold: 5000, cannons: 1 });
    await waitFor(() => a.me().unsaved === true && b.me().unsaved === true, 3000, 'el aviso en los dos jugadores con cuenta');
    const warnedMs = Date.now() - t0;

    proxy.restore();
    const t1 = Date.now();
    await waitFor(() => a.me().unsaved === undefined && b.me().unsaved === undefined, 5000, 'que el aviso desaparezca para los dos');
    const clearedMs = Date.now() - t1;
    console.log(
      `H-24: 15 s de corte en reposo → ${idleQueries} consultas y ${warnedFrames} frames con aviso · compra rechazada a los ${rejectedMs} ms · ` +
        `aviso para los dos a los ${warnedMs} ms · fuera ${clearedMs} ms después de volver la BD`
    );
    expect(fields(b.me())).toEqual({ ...SLOOP_ONLY, gold: 5000, ownedShips: ['sloop', 'brig'] });
    expect(await rawRow('u-bea')).toBe(beaRow); // la compra no llegó a la BD, ni durante el corte ni al volver
  }, 60_000);

  test('BD colgada (no contesta): también sale el aviso y la partida sigue', async () => {
    await seed('u-fer', { v: 1, ...SLOOP_ONLY });
    await startServer({ saveIntervalMs: 200, probeIntervalMs: 200 });
    const f = await join('u-fer');
    proxy.hang();
    world().players.get('u-fer')!.gold = 222;
    await waitFor(() => f.me().unsaved === true, 6000, 'el aviso con la BD colgada');
    proxy.restore();
    await waitFor(async () => (await stateOf('u-fer'))?.gold === 222, 8000, 'el oro escrito al volver');
    await waitFor(() => f.me().unsaved === undefined, 5000, 'que el aviso desaparezca');
  });

  test('AC-129: con la BD caída al desconectar, al volver con la BD ya disponible el oro está intacto', async () => {
    await seed('u-gil', { v: 1, ...SLOOP_ONLY });
    await startServer({ autoStart: false, saveIntervalMs: 200, probeIntervalMs: 200 });
    const gil = await join('u-gil');
    world().players.get('u-gil')!.gold = 777;
    proxy.cut();
    gil.c.disconnect();
    await sleep(500);
    for (let i = 0; i < Math.round((DISCONNECT_GRACE + 0.5) * TICK_RATE); i++) game!.tick();
    expect(world().players.get('u-gil')?.gold).toBe(777); // sin escribir: sigue en memoria
    proxy.restore();
    await waitFor(async () => (await stateOf('u-gil'))?.gold === 777, 5000, 'el oro escrito al volver la BD');
    game!.tick();
    expect(world().players.has('u-gil')).toBe(false);
    const again = await join('u-gil');
    expect(again.me().gold).toBe(777);
  });
});

describe('AC-132: con la BD caída no se insiste con escrituras', () => {
  test('una consulta ligera por intervalo, sin solaparse, ninguna escritura más y ninguna compra; al responder, escribe y sale del modo degradado', async () => {
    const pings: number[] = [];
    let saves = 0;
    let down = true;
    const store: ProgressStore = {
      load: async () => null,
      save: async () => {
        saves++;
        if (down) throw new Error('caída');
        return 1;
      },
      ping: async () => {
        pings.push(Date.now());
        if (down) throw new Error('caída');
      }
    };
    let gold = 100;
    const p = createPersistence({ store, read: () => ({ ...SLOOP_ONLY, gold }), onConflict: () => {}, saveIntervalMs: 20, probeIntervalMs: 100 });
    p.track('u', { progress: SLOOP_ONLY, revision: 1 });
    gold = 150;
    await waitFor(() => p.isDegraded(), 1000, 'el estado degradado');
    const t0 = Date.now();
    await sleep(1050);
    const gaps = pings.map((t, i) => t - (i === 0 ? t0 : pings[i - 1]));
    console.log(`AC-132: consultas ligeras cada ${gaps.join(', ')} ms (intervalo 100 ms en el test)`);
    expect(pings.length).toBeGreaterThanOrEqual(8);
    expect(pings.length).toBeLessThanOrEqual(11);
    expect(gaps.slice(1).every((g) => g >= 90)).toBe(true);
    expect(saves).toBe(1); // solo la escritura que descubrió el corte; el guardado periódico (cada 20 ms aquí) no insiste
    let applied = false;
    expect(await p.commit('u', { ...SLOOP_ONLY, gold: 50 }, () => (applied = true))).toBe(false); // compra rechazada sin tocar la BD
    expect({ saves, applied }).toEqual({ saves: 1, applied: false });
    down = false;
    await waitFor(() => !p.isDegraded(), 1000, 'la recuperación');
    expect(saves).toBe(2); // al responder, se escribe lo pendiente
    p.close();
  });
});

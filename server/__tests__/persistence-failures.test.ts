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
import { createPersistence, createPgStore, ProgressStore, StoredProgress } from '../persistence';
import { SavedProgress } from '../progress';
import { PgProxy, startPgProxy } from './fixtures/pg-proxy';
import { connectGame, joinGame, Joined, sleep, waitFor } from './fixtures/game-socket';
import { rowV1 } from './fixtures/progress-rows';
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
const SLOOP_ONLY: SavedProgress = { gold: 100, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop', xp: 0 };
const FRIGATE: SavedProgress = { gold: 1234, upgrades: { cannons: 2, hull: 3, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate', xp: 0 };
const fields = (v: PlayerView): SavedProgress => ({ gold: v.gold, upgrades: v.upgrades, ownedShips: v.ownedShips, activeShip: v.activeShip, xp: v.xp });
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
    await seed('u-ana', rowV1(FRIGATE));
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
    await seed('u-bea', rowV1(FRIGATE));
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
    ['oro negativo', rowV1({ ...FRIGATE, gold: -5 })],
    ['nivel 4', rowV1({ ...FRIGATE, upgrades: { cannons: 4, hull: 1, sails: 1 } })],
    ['barco activo que no posee', rowV1({ ...FRIGATE, ownedShips: ['sloop'], activeShip: 'frigate' })]
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

    await db.admin.query('UPDATE player_progress SET state = $2 WHERE user_id = $1', ['u-cai', rowV1(FRIGATE)]);
    const view = lastView(c);
    expect((await tryJoin(c)).welcome).toBeDefined();
    await waitFor(() => view() !== null, 3000, 'la vista privada');
    expect(fields(view()!)).toEqual(FRIGATE);
  });

  test('los reintentos gastan fichas: un cliente que martillea «Reintentar» no pasa del límite de intenciones (ráfaga de 20 y 10/s)', async () => {
    await seed('u-dan', rowV1({ ...SLOOP_ONLY, gold: -1 }));
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
    save: (userId, progress, revision, carry) => {
      saves.push(Date.now());
      return inner.save(userId, progress, revision, carry);
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
      await seed('u-ana', rowV1(SLOOP_ONLY));
      await seed('u-bea', rowV1({ ...SLOOP_ONLY, gold: 5000, ownedShips: ['sloop', 'brig'] }));
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
    await seed('u-ana', rowV1(SLOOP_ONLY));
    await seed('u-bea', rowV1({ ...SLOOP_ONLY, gold: 5000, ownedShips: ['sloop', 'brig'] }));
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
    await seed('u-fer', rowV1(SLOOP_ONLY));
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
    await seed('u-gil', rowV1(SLOOP_ONLY));
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
    // La fila ya se ve en la BD, pero el servidor solo suelta al jugador cuando le llega la confirmación de esa escritura,
    // que en un runner lento puede llegar después de esta lectura (CI, run 38334139904): se avanza tick a tick hasta entonces
    await waitFor(() => {
      game!.tick();
      return !world().players.has('u-gil');
    }, 2000, 'que el servidor suelte al jugador al confirmarse la escritura');
    const again = await join('u-gil');
    expect(again.me().gold).toBe(777);
  });

  test('AC-129: con la confirmación de la escritura lenta, el jugador sigue en memoria hasta que llega', async () => {
    await seed('u-gil', rowV1(SLOOP_ONLY));
    // La confirmación de cada escritura llega 300 ms después de que la fila ya está en la BD (un runner lento)
    const inner = createPgStore(pool);
    const slow: ProgressStore = {
      ...inner,
      save: async (...args: Parameters<ProgressStore['save']>) => {
        const revision = await inner.save(...args);
        await sleep(300);
        return revision;
      }
    };
    await startServer({ autoStart: false, saveIntervalMs: 200, probeIntervalMs: 200, store: slow });
    const gil = await join('u-gil');
    world().players.get('u-gil')!.gold = 777;
    proxy.cut();
    gil.c.disconnect();
    await sleep(500);
    for (let i = 0; i < Math.round((DISCONNECT_GRACE + 0.5) * TICK_RATE); i++) game!.tick();
    proxy.restore();
    await waitFor(async () => (await stateOf('u-gil'))?.gold === 777, 5000, 'el oro escrito al volver la BD');
    game!.tick();
    expect(world().players.get('u-gil')?.gold).toBe(777); // escrito, pero sin confirmar: no se suelta todavía
    await waitFor(() => {
      game!.tick();
      return !world().players.has('u-gil');
    }, 2000, 'que el servidor suelte al jugador al confirmarse la escritura');
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
    p.track('u', { progress: SLOOP_ONLY, carry: { newShips: [] }, revision: 1 });
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

// O-42: cada escritura acaba guardada, fallida (se reintenta) o en conflicto con otro proceso (ni se reintenta ni se pisa).
// (b) Tras un intento fallido, una revisión que no cuadra puede ser la de ese mismo intento, que llegó a la BD aunque el
// plazo venciera en el cliente: se lee la fila y, si está en r+1 con la huella de uno de esos intentos, era nuestra
describe('O-42: tres resultados por escritura, y un intento vencido pero aplicado no es un conflicto', () => {
  const rowOf = async (userId: string) => {
    const { rows } = await db.admin.query('SELECT state, revision FROM player_progress WHERE user_id = $1', [userId]);
    return { gold: rows[0]?.state.gold, cannons: rows[0]?.state.upgrades.cannons, revision: Number(rows[0]?.revision) };
  };

  // El ejemplo de producto: las respuestas de la BD llegan 5 s tarde, así que el guardado periódico con 350 se aplica (r+1)
  // pero vence en el cliente; el jugador llega a 360 y, al volver la BD, el sondeo escribe 360 con la revisión r y no
  // encuentra fila. La fila está en r+1 con la huella del intento de 350: era nuestra, se adopta y 360 queda en r+2
  test('el guardado con 350 vence pero se aplica y el jugador llega a 360: el sondeo adopta r+1, escribe 360 en r+2 y nadie recibe kicked', async () => {
    await seed('u-ivo', rowV1(SLOOP_ONLY)); // revisión 1
    await startServer({ saveIntervalMs: 200, probeIntervalMs: 200 });
    const ivo = await join('u-ivo');
    const kicked: unknown[] = [];
    ivo.c.on(S2C.kicked, (k: unknown) => kicked.push(k));
    proxy.delayReplies(5000);
    world().players.get('u-ivo')!.gold = 350;
    await waitFor(() => ivo.me().unsaved === true || kicked.length > 0, 8000, 'el aviso: el guardado venció en el cliente');
    expect(await rowOf('u-ivo')).toEqual({ gold: 350, cannons: 1, revision: 2 }); // ...pero llegó a la BD
    world().players.get('u-ivo')!.gold = 360;
    proxy.delayReplies(0);
    await waitFor(() => ivo.me().unsaved === undefined || kicked.length > 0, 8000, 'que el aviso se vaya al volver la BD (o el kicked)');
    expect(kicked).toEqual([]);
    expect(world().players.has('u-ivo')).toBe(true);
    expect(await rowOf('u-ivo')).toEqual({ gold: 360, cannons: 1, revision: 3 });
  });

  // (4) y (c4) de producto: una compra cuyo commit vence pero se aplica. El jugador la ve rechazada, y así queda: el commit
  // deja la huella de su intento (pasa por el mismo save) y el primer guardado con la BD respondiendo (aquí, el sondeo, con
  // los tiempos reales: 1 s) comprueba la fila aunque el jugador no haya cambiado nada, adopta r+1 y escribe la memoria,
  // sin kicked. Repetida, la fila tiene la compra una vez y con el oro descontado una vez
  test('una compra que vence pero se aplica, sin ningún otro cambio: el primer sondeo con la BD respondiendo la deshace en la fila, sin kicked; repetida, queda una vez', async () => {
    await seed('u-eva', rowV1({ ...SLOOP_ONLY, gold: 5000 })); // revisión 1
    await startServer(); // tiempos reales: guardado cada 2 s y sondeo cada 1 s
    const eva = await join('u-eva');
    const kicked: unknown[] = [];
    eva.c.on(S2C.kicked, (k: unknown) => kicked.push(k));
    const player = world().players.get('u-eva')!;
    proxy.delayReplies(5000);
    eva.c.emit(C2S.buy, { itemId: 'cannons:2' });
    await waitFor(() => texts(eva).includes('La tienda no está disponible: no podemos guardar'), 8000, 'el rechazo de la compra');
    const late = await rowOf('u-eva');
    expect({ gold: player.gold, cannons: player.upgrades.cannons }).toEqual({ gold: 5000, cannons: 1 }); // rechazada en el juego...
    expect({ cannons: late.cannons, revision: late.revision }).toEqual({ cannons: 2, revision: 2 }); // ...pero aplicada en la BD
    const price = 5000 - late.gold;
    expect(price).toBeGreaterThan(0);

    proxy.delayReplies(0);
    await waitFor(() => eva.me().unsaved === undefined || kicked.length > 0, 8000, 'el primer sondeo con la BD respondiendo (o el kicked)');
    expect(kicked).toEqual([]);
    expect(await rowOf('u-eva')).toEqual({ gold: 5000, cannons: 1, revision: 3 });

    eva.c.emit(C2S.buy, { itemId: 'cannons:2' });
    await waitFor(() => texts(eva).includes('Compra realizada') || kicked.length > 0, 5000, 'la compra repetida');
    expect(kicked).toEqual([]);
    expect({ gold: player.gold, cannons: player.upgrades.cannons }).toEqual({ gold: 5000 - price, cannons: 2 });
    expect(await rowOf('u-eva')).toEqual({ gold: 5000 - price, cannons: 2, revision: 4 });
  });

  // (c4) con desconexión: el jugador se va sin cambiar nada tras la compra vencida pero aplicada. Mientras la fila no se
  // compruebe, sigue en memoria aunque pase el margen de reconexión (si saliera, nadie la comprobaría y al volver tendría
  // la compra que vio rechazada); al volver la BD, el sondeo la deshace y entonces sale
  test('una compra que vence pero se aplica y el jugador se va sin más cambios: sigue en memoria hasta que el sondeo deshace la compra en la fila; al volver, sin la compra', async () => {
    await seed('u-leo', rowV1({ ...SLOOP_ONLY, gold: 5000 })); // revisión 1
    const logs: string[] = [];
    await startServer({ autoStart: false, probeIntervalMs: 200, log: (msg) => void logs.push(msg) }); // ticks a mano
    const leo = await join('u-leo');
    proxy.delayReplies(5000);
    leo.c.emit(C2S.buy, { itemId: 'cannons:2' });
    await waitFor(() => logs.some((l) => l.includes('La BD no responde')), 8000, 'el fallo de la compra');
    expect(await rowOf('u-leo')).toMatchObject({ cannons: 2, revision: 2 }); // aplicada en la BD
    leo.c.disconnect();
    await sleep(200);
    for (let i = 0; i < Math.round((DISCONNECT_GRACE + 0.5) * TICK_RATE); i++) game!.tick();
    expect(world().players.has('u-leo')).toBe(true); // la fila aún no está comprobada: no sale de la memoria

    proxy.delayReplies(0);
    await waitFor(() => logs.some((l) => l.startsWith('✅ La BD responde de nuevo')), 5000, 'el sondeo con la BD respondiendo');
    expect(await rowOf('u-leo')).toEqual({ gold: 5000, cannons: 1, revision: 3 });
    await waitFor(() => {
      game!.tick();
      return !world().players.has('u-leo');
    }, 2000, 'que el servidor suelte al jugador con la fila comprobada');
    await join('u-leo');
    expect({ gold: world().players.get('u-leo')!.gold, cannons: world().players.get('u-leo')!.upgrades.cannons }).toEqual({ gold: 5000, cannons: 1 });
  });

  // (5) de producto, (c5): las huellas solo se borran con una escritura confirmada o al adoptar, nunca al leer la fila en r.
  // Un intento vencido puede aplicarse después de esa lectura; como el proxy descarta lo que no reenvió, aquí lo aplica
  // tarde un almacén envoltorio. La siguiente escritura lo ve en r+1 con su huella, lo adopta y escribe la memoria
  test('(c5) un intento vencido que se aplica después de leer la fila en r: la siguiente escritura lo adopta, la fila acaba sin él y nadie recibe kicked', async () => {
    await seed('u-max', rowV1({ ...SLOOP_ONLY, gold: 5000 })); // revisión 1
    const inner = createPgStore(pool);
    const held: { late?: () => Promise<unknown> } = {}; // en un objeto: tsc no estrecha a null lo que asigna un cierre
    let holdNext = false;
    const store: ProgressStore = {
      ...inner,
      save: async (...args: Parameters<ProgressStore['save']>) => {
        if (!holdNext) return inner.save(...args);
        holdNext = false;
        held.late = () => inner.save(...args); // 1. vence sin aplicarse: el UPDATE sigue en camino
        throw new Error('Query read timeout');
      }
    };
    const logs: string[] = [];
    await startServer({ store, saveIntervalMs: 200, probeIntervalMs: 200, log: (msg) => void logs.push(msg) });
    const max = await join('u-max');
    const kicked: unknown[] = [];
    max.c.on(S2C.kicked, (k: unknown) => kicked.push(k));
    holdNext = true;
    max.c.emit(C2S.buy, { itemId: 'cannons:2' });
    await waitFor(() => texts(max).includes('La tienda no está disponible: no podemos guardar'), 5000, 'el rechazo de la compra');
    await waitFor(() => logs.some((l) => l.startsWith('✅ La BD responde de nuevo')), 5000, 'el sondeo, que lee la fila');
    expect(await rowOf('u-max')).toEqual({ gold: 5000, cannons: 1, revision: 1 }); // 2. la lectura vio r
    await held.late!(); // 3. el intento llega tarde y se aplica
    expect(await rowOf('u-max')).toMatchObject({ cannons: 2, revision: 2 });
    world().players.get('u-max')!.gold += 10; // 4. la siguiente escritura
    await waitFor(async () => (await rowOf('u-max')).gold === 5010 || kicked.length > 0, 5000, 'la siguiente escritura (o el kicked)');
    expect(kicked).toEqual([]);
    expect(await rowOf('u-max')).toEqual({ gold: 5010, cannons: 1, revision: 3 });
    expect(logs.filter((l) => l.includes('cambió en otro proceso'))).toEqual([]);
  });

  // (6) de producto, (c6): la compra vence sin aplicarse y el jugador se va sin otro cambio. Desde el fallo, la fila se lee
  // una sola vez (al volver la BD: sigue en r, nada que escribir) y el jugador sale de la memoria, aunque sus huellas se
  // queden (c5). La fila queda igual byte a byte
  test('(c6) la compra vence sin aplicarse y el jugador se va sin más: una sola lectura de la fila desde el fallo, sale de la memoria y la fila queda igual byte a byte', async () => {
    await seed('u-noa', rowV1({ ...SLOOP_ONLY, gold: 5000 }));
    const inner = createPgStore(pool);
    let failNext = false;
    let loadsSinceFailure: number | null = null;
    const store: ProgressStore = {
      ...inner,
      load: (userId) => {
        if (loadsSinceFailure !== null) loadsSinceFailure++;
        return inner.load(userId);
      },
      save: async (...args: Parameters<ProgressStore['save']>) => {
        if (!failNext) return inner.save(...args);
        failNext = false;
        loadsSinceFailure = 0;
        throw new Error('Query read timeout'); // vence sin aplicarse
      }
    };
    const logs: string[] = [];
    await startServer({ store, autoStart: false, probeIntervalMs: 200, log: (msg) => void logs.push(msg) }); // ticks a mano
    const noa = await join('u-noa');
    const before = await rawRow('u-noa');
    failNext = true;
    noa.c.emit(C2S.buy, { itemId: 'cannons:2' });
    await waitFor(() => logs.some((l) => l.includes('La BD no responde')), 5000, 'el fallo de la compra');
    noa.c.disconnect();
    await waitFor(() => logs.some((l) => l.startsWith('✅ La BD responde de nuevo')), 5000, 'el sondeo, que lee la fila');
    for (let i = 0; i < Math.round((DISCONNECT_GRACE + 0.5) * TICK_RATE); i++) game!.tick();
    await sleep(600); // unos cuantos sondeos y guardados periódicos más: ninguno tiene que volver a leerla
    game!.tick();
    expect({ loads: loadsSinceFailure, inMemory: world().players.has('u-noa') }).toEqual({ loads: 1, inMemory: false });
    expect(await rawRow('u-noa')).toBe(before);
  });

  // Solo un intento nuestro pudo aplicarse, y deja la fila en r+1: con el mismo estado en otra revisión, escribió otro
  test('la fila con el estado de un intento fallido pero en una revisión que no es r+1 es de otro proceso: conflicto', async () => {
    let row: StoredProgress = { progress: SLOOP_ONLY, carry: { newShips: [] }, revision: 1 };
    let timeoutNext = true;
    const conflicts: string[] = [];
    const store: ProgressStore = {
      load: async () => row,
      save: async (_userId, progress, revision, carry) => {
        if (revision !== row.revision) return null;
        row = { progress, carry, revision: row.revision + 1 };
        if (timeoutNext) {
          timeoutNext = false;
          throw new Error('Query read timeout'); // se aplicó, pero el plazo venció en el cliente
        }
        return row.revision;
      },
      ping: async () => {}
    };
    const p = createPersistence({ store, read: () => ({ ...SLOOP_ONLY, gold: 150 }), onConflict: (userId) => conflicts.push(userId), saveIntervalMs: 20, probeIntervalMs: 200 });
    p.track('u', { progress: SLOOP_ONLY, carry: { newShips: [] }, revision: 1 });
    await waitFor(() => p.isDegraded(), 1000, 'el estado degradado');
    row = { ...row, revision: row.revision + 1 }; // otro proceso vuelve a escribir el mismo estado: r+2
    await waitFor(() => conflicts.length > 0 || !p.isDegraded(), 2000, 'el sondeo');
    expect(conflicts).toEqual(['u']);
    p.close();
  });

  test('sin un intento fallido antes, una revisión que no cuadra es otro proceso: no se lee la fila y se suelta al jugador', async () => {
    let loads = 0;
    const conflicts: string[] = [];
    const store: ProgressStore = {
      load: async () => (loads++, { progress: { ...SLOOP_ONLY, gold: 150 }, carry: { newShips: [] }, revision: 2 }), // el mismo estado: aun así, no se mira
      save: async () => null,
      ping: async () => {}
    };
    const p = createPersistence({ store, read: () => ({ ...SLOOP_ONLY, gold: 150 }), onConflict: (userId) => conflicts.push(userId), saveIntervalMs: 20 });
    p.track('u', { progress: SLOOP_ONLY, carry: { newShips: [] }, revision: 1 });
    await waitFor(() => conflicts.length > 0, 1000, 'el conflicto');
    expect({ conflicts, loads }).toEqual({ conflicts: ['u'], loads: 0 });
    p.close();
  });

  // Una fila en memoria con su revisión, que otro proceso puede reescribir (state.row); con failNext, el próximo intento
  // vence sin aplicarse
  const memoryRow = () => {
    const state = { row: { progress: SLOOP_ONLY, carry: { newShips: [] }, revision: 1 } as StoredProgress, failNext: true };
    const store: ProgressStore = {
      load: async () => state.row,
      save: async (_userId, progress, revision, carry) => {
        if (state.failNext) {
          state.failNext = false;
          throw new Error('Query read timeout'); // vence sin aplicarse
        }
        if (revision !== state.row.revision) return null;
        state.row = { progress, carry, revision: state.row.revision + 1 };
        return state.row.revision;
      },
      ping: async () => {}
    };
    return { state, store };
  };

  // (b): «en cualquier otro caso es un conflicto de verdad». La fila en r+1 tras un intento nuestro no basta: si su estado
  // no tiene la huella de uno de nuestros intentos, la escribió otro proceso, y no se adopta ni se pisa
  test('(b) tras un intento fallido que no se aplicó, otro proceso escribe otro estado en r+1: conflicto, y su fila no se pisa', async () => {
    const { state, store } = memoryRow();
    const conflicts: string[] = [];
    const p = createPersistence({ store, read: () => ({ ...SLOOP_ONLY, gold: 150 }), onConflict: (userId) => conflicts.push(userId), saveIntervalMs: 20, probeIntervalMs: 200 });
    p.track('u', { progress: SLOOP_ONLY, carry: { newShips: [] }, revision: 1 });
    await waitFor(() => p.isDegraded(), 1000, 'el estado degradado'); // el intento con 150 vence sin aplicarse y deja su huella
    state.row = { progress: { ...SLOOP_ONLY, gold: 999 }, carry: { newShips: [] }, revision: 2 }; // otro proceso, con otro estado
    await waitFor(() => conflicts.length > 0 || !p.isDegraded(), 2000, 'el sondeo');
    expect({ conflicts, gold: state.row.progress.gold, revision: state.row.revision }).toEqual({ conflicts: ['u'], gold: 999, revision: 2 });
    p.close();
  });

  // (c5): las huellas se borran con la escritura confirmada. Después, el estado de aquel intento en r+1 ya no puede ser
  // nuestro: lo escribió otro proceso, y es un conflicto
  test('(c5) tras un intento fallido y una escritura confirmada, otro proceso escribe en r+1 el estado de aquel intento: conflicto', async () => {
    const { state, store } = memoryRow();
    let gold = 150;
    const conflicts: string[] = [];
    const p = createPersistence({ store, read: () => ({ ...SLOOP_ONLY, gold }), onConflict: (userId) => conflicts.push(userId), saveIntervalMs: 20, probeIntervalMs: 200 });
    p.track('u', { progress: SLOOP_ONLY, carry: { newShips: [] }, revision: 1 });
    await waitFor(() => p.isDegraded(), 1000, 'el estado degradado'); // el intento con 150 vence sin aplicarse y deja su huella
    await waitFor(() => !p.isDegraded(), 2000, 'el sondeo'); // escribe 150 sobre r1: confirmada, en r2
    expect({ gold: state.row.progress.gold, revision: state.row.revision }).toEqual({ gold: 150, revision: 2 });
    state.row = { progress: { ...SLOOP_ONLY, gold: 150 }, carry: { newShips: [] }, revision: 3 }; // otro proceso, con el estado de aquel intento
    gold = 200;
    await waitFor(() => conflicts.length > 0 || state.row.revision > 3, 2000, 'el guardado periódico');
    expect({ conflicts, gold: state.row.progress.gold, revision: state.row.revision }).toEqual({ conflicts: ['u'], gold: 150, revision: 3 });
    p.close();
  });

  test('flush cuenta las fallidas y los conflictos; unsaved, los que quedan sin confirmar (sin contar los soltados)', async () => {
    const store: ProgressStore = {
      load: async () => null,
      save: async (userId) => {
        if (userId === 'falla') throw new Error('caída');
        return userId === 'choca' ? null : 2;
      },
      ping: async () => {}
    };
    const p = createPersistence({ store, read: () => ({ ...SLOOP_ONLY, gold: 150 }), onConflict: () => {}, saveIntervalMs: 60_000 });
    for (const userId of ['guarda', 'falla', 'choca']) p.track(userId, { progress: SLOOP_ONLY, carry: { newShips: [] }, revision: 1 });
    expect(await p.flush()).toEqual({ failed: 1, conflicts: 1 });
    expect(p.unsaved()).toBe(1);
    p.close();
  });
});

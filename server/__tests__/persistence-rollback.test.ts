// La fila de la 1.3 (GDD §13, «Formato de la fila (1.3)»; AC-218, AC-219 y AC-226 a) con Postgres real, servidor de juego
// en este proceso y socket.io real. Las filas v: 1 y v: 2 de la 1.2 entran con los niveles de su `upgrades` en cada barco y
// sin familia, y pasan a v: 3 cuando su jugador escribe, sin migración en bloque; una v: 3 entra con sus niveles y sus
// familias. Reiniciar es un servidor nuevo, con el mundo vacío, sobre la misma BD.
// *Cambiado a propósito con la 1.3 (AC-226 a):* hasta la 1.2, la Goleta y el Navío de la fila no entraban en el mundo y se
// jugaba con el mejor barco de la 1.0; ahora se juegan. La vuelta atrás a la 1.0.3 (AC-157) deja de aplicar: la 1.3 escribe
// v: 3, que solo lee la 1.2.x puente (AC-220; progress.test.ts prueba que la 1.2.0, la 1.0.3 y la 1.0.2 la rechazan)
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { Socket as ClientSocket } from 'socket.io-client';
import { DISCONNECT_GRACE, TICK_RATE } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { Notice, PlayerView, ShipSnapshot, Welcome } from '../../src/game/types';
import { shipOfPlayer } from '../../src/game/world';
import { upgradePrice } from '../../src/game/constants';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
import { createGameServer, GameServer, GameServerOptions } from '../game-server';
import { createPgStore } from '../persistence';
import { SavedProgress } from '../progress';
import { connectGame, joinGame, Joined, sleep, waitFor } from './fixtures/game-socket';
import { LegacyProgress, migrated, rowV1, rowV3 } from './fixtures/progress-rows';
import { createTestDb, TestDb } from './pg/test-db';

const testAuth = async (auth: unknown) => {
  const token = (auth as { token?: unknown })?.token;
  if (typeof token !== 'string') throw new Error('unauthorized');
  return { userId: token, guest: token.startsWith('guest-') };
};

let db: TestDb;
let pool: Pool;
let httpServer: HttpServer;
let io: Server;
let game: GameServer | null = null;
let url: string;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  db = await createTestDb();
  pool = createPool(db.url);
  await migrate(pool);
});

afterAll(async () => {
  await pool?.end();
  await db?.drop();
});

beforeEach(async () => {
  await db.admin.query('TRUNCATE player_progress');
});

afterEach(async () => {
  await stopServer();
}, 15_000);

async function startServer(opts: Partial<GameServerOptions> = {}): Promise<void> {
  httpServer = createServer();
  io = new Server(httpServer);
  game = createGameServer(io, { authenticate: testAuth, seed: 11, spawnNpcs: false, store: createPgStore(pool), ...opts });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
}

async function stopServer(): Promise<void> {
  sockets.splice(0).forEach((c) => c.disconnect());
  if (!game) return;
  const current = game;
  game = null;
  try {
    await sleep(50);
    await Promise.race([current.flushProgress(), new Promise((r) => setTimeout(r, 5000).unref())]);
  } finally {
    current.stop();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
}

async function restart(): Promise<void> {
  await stopServer();
  await startServer();
}

const join = (userId: string): Promise<Joined> => joinGame(url, { token: userId }, userId, sockets);
const world = () => game!.world;
const fields = (v: PlayerView): SavedProgress => ({ gold: v.gold, xp: v.xp, ships: v.ships, activeShip: v.activeShip, families: v.families, family: v.family });
const texts = (j: Joined) => j.notices().map((n) => n.text);

// Una fila de la 1.1 con todo: XP, los dos barcos nuevos y el Navío como barco activo
const V2 = {
  v: 2,
  gold: 4321,
  upgrades: { cannons: 3, hull: 2, sails: 1 },
  ownedShips: ['sloop', 'brig', 'schooner', 'frigate', 'line'],
  activeShip: 'line',
  xp: 1234
};
const L = V2.upgrades;
// Con lo que se juega esa fila en la 1.3 (AC-219 y AC-226 a): los 5 barcos con sus niveles, el Navío activo y sin familia
const PLAYED: SavedProgress = { gold: 4321, xp: 1234, ships: { sloop: L, brig: L, schooner: L, frigate: L, line: L }, activeShip: 'line', families: [], family: 'none' };
const FRIGATE: LegacyProgress = { gold: 1234, upgrades: { cannons: 2, hull: 3, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate', xp: 0 };
const N1 = { cannons: 1, hull: 1, sails: 1 };

async function seed(userId: string, state: unknown): Promise<void> {
  await db.admin.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', [userId, state]);
}

async function rowOf(userId: string): Promise<{ state: Record<string, unknown>; revision: number }> {
  const { rows } = await db.admin.query('SELECT state, revision FROM player_progress WHERE user_id = $1', [userId]);
  return { state: rows[0].state, revision: Number(rows[0].revision) };
}

// La fila tal cual está en la BD, para compararla byte a byte
async function rawRow(userId: string): Promise<string> {
  const { rows } = await db.admin.query('SELECT state::text AS s, revision::text AS r, updated_at::text AS u FROM player_progress WHERE user_id = $1', [userId]);
  return JSON.stringify(rows);
}

const ownSnapshot = (j: Joined): ShipSnapshot | undefined =>
  j.frames.flatMap((f) => f.s ?? []).find((s): s is ShipSnapshot => s.id === j.welcome.shipId && 'c' in s);

describe('AC-219 y AC-226 (a): una v: 2 con la Goleta y el Navío entra con ellos, cada barco con sus niveles y sin familia', () => {
  test('con el Navío como barco activo entra con el Navío, su XP y los 5 barcos a (3, 2, 1); viajan al cliente con «sin familia»', async () => {
    await seed('u-ana', V2);
    await startServer();
    const a = await join('u-ana');
    expect(fields(a.me())).toEqual(PLAYED);
    expect(shipOfPlayer(world(), 'u-ana')!.classId).toBe('line');
    expect(ownSnapshot(a)).toMatchObject({ c: 'line', mhp: Math.round(3200 * 1.2), fa: 'none' });
    expect(world().players.get('u-ana')!.xp).toBe(1234);
  });

  test.each([
    ['la Goleta, con Balandra y Bergantín', ['sloop', 'brig', 'schooner'], 'schooner'],
    ['el Navío, solo con la Balandra', ['sloop', 'line'], 'line']
  ])('con %s como barco activo entra con él', async (_label, ownedShips, activeShip) => {
    await seed('u-bea', { ...V2, ownedShips, activeShip });
    await startServer();
    const b = await join('u-bea');
    expect(b.me().activeShip).toBe(activeShip);
    expect(Object.keys(b.me().ships)).toEqual(ownedShips);
    expect(shipOfPlayer(world(), 'u-bea')!.classId).toBe(activeShip);
  });
});

describe('AC-218: la 1.3 siempre escribe v: 3', () => {
  test('v: 2: el oro y la XP ganados se escriben en v: 3, con los 5 barcos, el Navío activo y sin familia', async () => {
    await seed('u-cai', V2);
    await startServer();
    await join('u-cai');
    world().players.get('u-cai')!.gold += 40;
    world().players.get('u-cai')!.xp += 66;
    await game!.flushProgress();
    expect(await rowOf('u-cai')).toEqual({ state: rowV3({ ...PLAYED, gold: 4361, xp: 1300 }), revision: 2 });
  });

  test('v: 2: una mejora de un barco que no se navega se confirma después de escribirse (AC-130 a, AC-213 b): solo cambia ese barco', async () => {
    await seed('u-dan', { ...V2, gold: 2000, ownedShips: ['sloop', 'line'], activeShip: 'line' });
    await startServer();
    const d = await join('u-dan');
    d.c.emit(C2S.buy, { itemId: 'hull:3', ship: 'sloop' });
    await waitFor(() => texts(d).includes('Compra realizada'), 3000, 'la compra del Casco N3 de la Balandra');
    const after: SavedProgress = { ...PLAYED, gold: 2000 - upgradePrice('sloop', 'hull', 3), ships: { sloop: { ...L, hull: 3 }, line: L } };
    expect((await rowOf('u-dan')).state).toEqual(rowV3(after));
    await waitFor(() => d.me().ships.sloop?.hull === 3, 3000, 'la vista con el Casco N3');
    expect(fields(d.me())).toEqual(after);
  });

  test('v: 2: el cambio de barco en el puerto guarda el elegido', async () => {
    await seed('u-eva', V2);
    await startServer();
    const e = await join('u-eva');
    e.c.emit(C2S.selectShip, { classId: 'brig' });
    await waitFor(() => e.me().activeShip === 'brig', 3000, 'el cambio al Bergantín');
    expect((await rowOf('u-eva')).state).toEqual(rowV3({ ...PLAYED, activeShip: 'brig' }));
  });

  test('v: 2 con solo el Navío: entra con el Navío y, al escribir, la fila queda con el Navío solo y la misma XP', async () => {
    await seed('u-flor', { ...V2, ownedShips: ['line'], activeShip: 'line', xp: 500 });
    await startServer();
    const f = await join('u-flor');
    expect(fields(f.me())).toEqual({ ...PLAYED, xp: 500, ships: { line: L } });
    world().players.get('u-flor')!.gold += 1;
    await game!.flushProgress();
    expect((await rowOf('u-flor')).state).toEqual(rowV3({ ...PLAYED, gold: 4322, xp: 500, ships: { line: L } }));
  });

  test('v: 1: entra con 0 de XP y sus niveles en cada barco y, al escribir, pasa a v: 3 con una revisión más (AC-219)', async () => {
    await seed('u-gal', rowV1(FRIGATE));
    await startServer();
    const g = await join('u-gal');
    expect(fields(g.me())).toEqual(migrated(FRIGATE));
    world().players.get('u-gal')!.gold += 10;
    await game!.flushProgress();
    const { state, revision } = await rowOf('u-gal');
    expect(revision).toBe(2);
    expect(state).toEqual(rowV3({ ...migrated(FRIGATE), gold: 1244 }));
  });

  test('un usuario nuevo se escribe en v: 3: la Balandra a nivel 1 y activa, families [] y family «none»', async () => {
    await startServer();
    await join('u-hugo');
    await game!.flushProgress();
    const { state } = await rowOf('u-hugo');
    expect(state).toEqual({ v: 3, gold: 100, xp: 0, ships: { sloop: N1 }, activeShip: 'sloop', families: [], family: 'none' });
  });

  // La fila exacta de AC-218, leída con un SELECT y comparada como JSON (sin depender del orden de las claves de un objeto)
  test('la fila de AC-218: Balandra (3, 1, 2), Bergantín N1 y activo, 1 234 de oro, 2 500 de XP y las 2 familias con la española en uso; vuelve igual tras reiniciar', async () => {
    await startServer();
    const j = await join('u-ac218');
    const player = world().players.get('u-ac218')!;
    const saved: SavedProgress = { gold: 1234, xp: 2500, ships: { sloop: { cannons: 3, hull: 1, sails: 2 }, brig: { ...N1 } }, activeShip: 'brig', families: ['gb', 'es'], family: 'es' };
    Object.assign(player, { ...saved, families: ['es', 'gb'] }); // el escritor las ordena
    await game!.flushProgress();
    const { rows } = await db.admin.query("SELECT state, state->'families' AS families FROM player_progress WHERE user_id = $1", ['u-ac218']);
    expect(rows[0].state).toEqual({ v: 3, gold: 1234, xp: 2500, ships: { sloop: { cannons: 3, hull: 1, sails: 2 }, brig: { cannons: 1, hull: 1, sails: 1 } }, activeShip: 'brig', families: ['gb', 'es'], family: 'es' });
    expect(rows[0].families).toEqual(['gb', 'es']); // una lista conserva su orden en el jsonb
    j.c.disconnect();

    await restart();
    const again = await join('u-ac218');
    expect(fields(again.me())).toEqual(saved);
    expect(ownSnapshot(again)?.fa).toBe('es');
  });

  test('en reposo no se escribe nada (AC-130): la fila v: 3 queda igual byte a byte', async () => {
    await seed('u-rep', rowV3({ ...PLAYED, families: ['gb'], family: 'gb' }));
    const before = await rawRow('u-rep');
    await startServer({ saveIntervalMs: 50 });
    await join('u-rep');
    await sleep(400); // varios guardados periódicos sin cambios
    await game!.flushProgress();
    expect(await rawRow('u-rep')).toBe(before);
  });
});

describe('AC-219: no hay migración en bloque', () => {
  test('si la 1.3 no escribe la fila, queda igual byte a byte, en v: 2 y con el Navío como barco activo', async () => {
    await seed('u-ines', V2);
    const before = await rawRow('u-ines');
    await startServer();
    const i = await join('u-ines');
    await sleep(300);
    i.c.disconnect();
    await sleep(100);
    await game!.flushProgress();
    expect(await rawRow('u-ines')).toBe(before);
    expect((await rowOf('u-ines')).state).toMatchObject({ v: 2, activeShip: 'line' });
  });

  test('reconectar antes de 10 s (el progreso sigue en memoria) no pierde nada al escribir', async () => {
    await seed('u-kai', V2);
    await startServer({ autoStart: false });
    const k = await join('u-kai');
    k.c.disconnect();
    for (let n = 0; n < Math.round((DISCONNECT_GRACE - 2) * TICK_RATE); n++) game!.tick();
    const again = await join('u-kai');
    expect(again.welcome.shipId).toBe(k.welcome.shipId);
    world().players.get('u-kai')!.gold += 5;
    await game!.flushProgress();
    expect((await rowOf('u-kai')).state).toEqual(rowV3({ ...PLAYED, gold: 4326 }));
  });
});

describe('AC-224: una v: 3 entra con sus familias y la que usa', () => {
  test('con la española comprada y en uso entra con ella, y la ve en su barco (fa); con «sin familia», la española sigue comprada', async () => {
    await seed('u-es', rowV3({ ...PLAYED, families: ['es'], family: 'es' }));
    await seed('u-none', rowV3({ ...PLAYED, families: ['es'], family: 'none' }));
    await startServer();
    const es = await join('u-es');
    expect([es.me().families, es.me().family, ownSnapshot(es)?.fa]).toEqual([['es'], 'es', 'es']);
    const none = await join('u-none');
    expect([none.me().families, none.me().family, ownSnapshot(none)?.fa]).toEqual([['es'], 'none', 'none']);
  });
});

// Pide entrar por un socket ya conectado y espera la respuesta: bienvenida o «No podemos cargar tu progreso»
function tryJoin(c: ClientSocket): Promise<{ welcome?: Welcome; error?: Notice }> {
  return new Promise((resolve) => {
    c.once(S2C.welcome, (welcome: Welcome) => resolve({ welcome }));
    c.once(S2C.progressError, (error: Notice) => resolve({ error }));
    c.emit(C2S.join, {});
  });
}

describe('AC-156 y AC-219: se rechazan las demás filas, sin tocarlas', () => {
  const V3 = rowV3({ ...PLAYED, families: ['gb'], family: 'gb' });
  test.each([
    ['v: 4', { ...V3, v: 4 }],
    ['una v: 2 con ships', { ...V2, ships: V3.ships }],
    ['una v: 3 con upgrades', { ...V3, upgrades: L }],
    ['una v: 3 sin families', { ...V3, families: undefined }],
    ['una v: 3 con ships vacío', { ...V3, ships: {} }],
    ['una v: 3 con el barco activo fuera de ships', { ...V3, ships: { sloop: L }, activeShip: 'line' }],
    ['una v: 3 con un nivel 4', { ...V3, ships: { line: { ...L, hull: 4 } } }],
    ['una v: 3 con family que no está en families', { ...V3, family: 'es' }],
    ['una v: 3 con «none» en families', { ...V3, families: ['none'], family: 'none' }],
    ['una v: 3 con una familia repetida', { ...V3, families: ['gb', 'gb'] }],
    ['una v: 2 sin xp', { ...rowV1(FRIGATE), v: 2 }],
    ['una v: 1 con xp', { ...rowV1(FRIGATE), xp: 10 }],
    ['una v: 1 con el Navío', { ...rowV1(FRIGATE), ownedShips: ['sloop', 'line'], activeShip: 'sloop' }],
    ['xp negativa', { ...V2, xp: -1 }],
    ['xp por encima del tope', { ...V2, xp: 10_000_000 }],
    ['un barco fuera de los 5 ids', { ...V2, ownedShips: ['sloop', 'brigantine'], activeShip: 'sloop' }],
    ['oro negativo en una v: 2 (AC-131)', { ...V2, gold: -5 }]
  ])('%s: «No podemos cargar tu progreso ahora mismo», no entra y la fila queda igual byte a byte', async (_label, corrupt) => {
    await seed('u-lia', corrupt);
    const before = await rawRow('u-lia');
    await startServer();
    const c = connectGame(url, { token: 'u-lia' });
    sockets.push(c);
    await new Promise<void>((resolve) => c.once('connect', () => resolve()));
    expect((await tryJoin(c)).error?.text).toBe('No podemos cargar tu progreso ahora mismo');
    await game!.flushProgress();
    expect(world().players.has('u-lia')).toBe(false);
    expect(await rawRow('u-lia')).toBe(before);
  });
});

describe('revisión (AC-130): la guarda sigue igual con las filas de la 1.3', () => {
  test('si otro proceso escribe la fila por detrás, no se pisa: el jugador sale con el aviso', async () => {
    await seed('u-max', V2);
    await startServer({ saveIntervalMs: 60_000 });
    const m = await join('u-max');
    const kicked = new Promise<Notice>((resolve) => m.c.once(S2C.kicked, resolve));
    const newer = rowV3({ ...PLAYED, xp: 2000 });
    await db.admin.query('UPDATE player_progress SET state = $2, revision = revision + 1 WHERE user_id = $1', ['u-max', newer]);
    world().players.get('u-max')!.gold += 5;
    await game!.flushProgress();
    expect(await rowOf('u-max')).toEqual({ state: newer, revision: 2 });
    expect((await kicked).text).toBe('Has abierto el juego en otra pestaña');
  });
});

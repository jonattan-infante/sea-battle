// Filas v: 2 con el formato de GDD §13 («Formato de la fila») y vuelta atrás a la 1.0.3 (AC-157), con Postgres real,
// servidor de juego en este proceso y socket.io real. La 1.1 juega con la XP de la fila (AC-155); los barcos que la
// simulación todavía no juega (Goleta y Navío) no entran en el mundo ni viajan, y se vuelven a escribir tal cual. La 1.0.3
// lee y escribe con su lector congelado (fixtures/progress-1.0.3.ts). Reiniciar es un servidor nuevo, con el mundo vacío,
// sobre la misma BD
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { Socket as ClientSocket } from 'socket.io-client';
import { DISCONNECT_GRACE, TICK_RATE } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { Notice, PlayerView, ShipSnapshot, Welcome } from '../../src/game/types';
import { shipOfPlayer } from '../../src/game/world';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
import { createGameServer, GameServer, GameServerOptions } from '../game-server';
import { createPgStore } from '../persistence';
import { SavedProgress } from '../progress';
import { parseProgress as parseProgress103, serializeProgress as serializeProgress103 } from './fixtures/progress-1.0.3';
import { connectGame, joinGame, Joined, sleep, waitFor } from './fixtures/game-socket';
import { rowV1 } from './fixtures/progress-rows';
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
const fields = (v: PlayerView): SavedProgress => ({ gold: v.gold, upgrades: v.upgrades, ownedShips: v.ownedShips, activeShip: v.activeShip, xp: v.xp });
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
// Con lo que se juega esa fila: su XP, y los barcos que la simulación juega, con la Fragata, que es el mejor que posee.
// Cuando dev-npc añada la Goleta y el Navío a la simulación, estos casos cambian a propósito
const PLAYED: SavedProgress = { gold: 4321, upgrades: { cannons: 3, hull: 2, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate', xp: 1234 };
const FRIGATE: SavedProgress = { gold: 1234, upgrades: { cannons: 2, hull: 3, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate', xp: 0 };
const NEW_SHIPS = /"(schooner|line)"/;

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

// Todo lo que el servidor mandó a este cliente, como viaja por el socket
const wire = (j: Joined) => JSON.stringify([j.welcome, ...j.frames]);
const ownSnapshot = (j: Joined): ShipSnapshot | undefined =>
  j.frames.flatMap((f) => f.s ?? []).find((s): s is ShipSnapshot => s.id === j.welcome.shipId && 'c' in s);

describe('filas v: 2 (AC-155 y AC-157 b): se juega con su XP y con los barcos que la simulación juega', () => {
  test('con el Navío como barco activo entra con la Fragata y su XP; la XP viaja al cliente y los barcos nuevos no', async () => {
    await seed('u-ana', V2);
    await startServer();
    const a = await join('u-ana');
    expect(fields(a.me())).toEqual(PLAYED);
    expect(shipOfPlayer(world(), 'u-ana')!.classId).toBe('frigate');
    expect(ownSnapshot(a)?.c).toBe('frigate');
    expect(world().players.get('u-ana')!.ownedShips).toEqual(['sloop', 'brig', 'frigate']);
    expect(world().players.get('u-ana')!.xp).toBe(1234);
    // Más frames: el barco navega (deltas) y gana oro (otra vista privada)
    a.c.emit(C2S.moveTo, { x: 60, z: 60 });
    world().players.get('u-ana')!.gold += 1;
    await waitFor(() => a.frames.length >= 4 && a.me().gold === 4322, 3000, 'frames con deltas y la vista nueva');
    expect(a.me().xp).toBe(1234);
    expect(wire(a)).not.toMatch(NEW_SHIPS);
  });

  test.each([
    ['la Goleta, con Balandra y Bergantín', ['sloop', 'brig', 'schooner'], 'schooner', 'brig'],
    ['el Navío, solo con la Balandra', ['sloop', 'line'], 'line', 'sloop']
  ])('con %s como barco activo entra con el mejor que la simulación juega', async (_label, ownedShips, activeShip, playing) => {
    await seed('u-bea', { ...V2, ownedShips, activeShip });
    await startServer();
    const b = await join('u-bea');
    expect(b.me().activeShip).toBe(playing);
    expect(shipOfPlayer(world(), 'u-bea')!.classId).toBe(playing);
    expect(b.me().xp).toBe(1234);
    expect(wire(b)).not.toMatch(NEW_SHIPS);
  });
});

describe('escritura (AC-155 y AC-156): la 1.1 siempre escribe v: 2, con la XP de la partida', () => {
  test('v: 2: el oro y la XP ganados se escriben con los mismos barcos nuevos, y como activo la Fragata con la que juega', async () => {
    await seed('u-cai', V2);
    await startServer();
    await join('u-cai');
    world().players.get('u-cai')!.gold += 40;
    world().players.get('u-cai')!.xp += 66;
    await game!.flushProgress();
    expect(await rowOf('u-cai')).toEqual({ state: { ...V2, gold: 4361, activeShip: 'frigate', xp: 1300 }, revision: 2 });
  });

  test('v: 2: una compra se confirma después de escribirse (AC-130 a), con la XP y lo nuevo intactos', async () => {
    await seed('u-dan', { ...V2, gold: 2000, ownedShips: ['sloop', 'line'], activeShip: 'line' });
    await startServer();
    const d = await join('u-dan');
    expect(d.me().activeShip).toBe('sloop');
    d.c.emit(C2S.buy, { itemId: 'ship:brig' });
    await waitFor(() => texts(d).includes('Compra realizada'), 3000, 'la compra del Bergantín');
    expect((await rowOf('u-dan')).state).toEqual({ ...V2, gold: 0, ownedShips: ['sloop', 'brig', 'line'], activeShip: 'brig' });
    await waitFor(() => d.me().activeShip === 'brig', 3000, 'la vista con el Bergantín');
    expect(fields(d.me())).toEqual({ gold: 0, upgrades: V2.upgrades, ownedShips: ['sloop', 'brig'], activeShip: 'brig', xp: 1234 });
    expect(wire(d)).not.toMatch(NEW_SHIPS);
  });

  test('v: 2: el cambio de barco en el puerto guarda el elegido, con lo nuevo intacto', async () => {
    await seed('u-eva', V2);
    await startServer();
    const e = await join('u-eva');
    e.c.emit(C2S.selectShip, { classId: 'brig' });
    await waitFor(() => e.me().activeShip === 'brig', 3000, 'el cambio al Bergantín');
    expect((await rowOf('u-eva')).state).toEqual({ ...V2, activeShip: 'brig' });
  });

  test('v: 2: el Navío no se puede elegir ni comprar mientras la simulación no lo juegue (el protocolo no lo conoce) y la fila no cambia', async () => {
    await seed('u-fer', V2);
    const before = await rawRow('u-fer');
    await startServer();
    const f = await join('u-fer');
    f.c.emit(C2S.selectShip, { classId: 'line' });
    f.c.emit(C2S.buy, { itemId: 'ship:schooner' });
    await sleep(300);
    await game!.flushProgress();
    expect(f.me().activeShip).toBe('frigate');
    expect(await rawRow('u-fer')).toBe(before);
  });

  test('v: 2 sin ningún barco que la simulación juegue: entra con la Balandra y, al escribir, la fila queda con ["sloop", "line"] y la misma XP', async () => {
    await seed('u-flor', { ...V2, ownedShips: ['line'], activeShip: 'line', xp: 500 });
    await startServer();
    const f = await join('u-flor');
    expect(fields(f.me())).toEqual({ gold: 4321, upgrades: V2.upgrades, ownedShips: ['sloop'], activeShip: 'sloop', xp: 500 });
    world().players.get('u-flor')!.gold += 1;
    await game!.flushProgress();
    expect((await rowOf('u-flor')).state).toEqual({ ...V2, gold: 4322, ownedShips: ['sloop', 'line'], activeShip: 'sloop', xp: 500 });
  });

  test('v: 1: entra con 0 de XP y, al escribir, pasa a v: 2 con xp 0 (AC-156); la 1.0.3 la lee (AC-157)', async () => {
    await seed('u-gal', rowV1(FRIGATE));
    await startServer();
    const g = await join('u-gal');
    expect(fields(g.me())).toEqual(FRIGATE);
    world().players.get('u-gal')!.gold += 10;
    await game!.flushProgress();
    const { state, revision } = await rowOf('u-gal');
    expect(revision).toBe(2);
    expect(state).toEqual({ v: 2, ...FRIGATE, gold: 1244 });
    expect(parseProgress103(state)).toEqual({ progress: { gold: 1244, upgrades: FRIGATE.upgrades, ownedShips: FRIGATE.ownedShips, activeShip: 'frigate' }, carry: { v: 2, xp: 0, newShips: [] } });
  });

  test('un usuario nuevo se escribe en v: 2 con 0 de XP, y la 1.0.3 lo lee', async () => {
    await startServer();
    await join('u-hugo');
    await game!.flushProgress();
    const { state } = await rowOf('u-hugo');
    expect(state).toEqual({ v: 2, gold: 100, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop', xp: 0 });
    expect(parseProgress103(state)).not.toBeNull();
  });
});

describe('AC-157 (d): volver a la 1.0.3 y otra vez a la 1.1 no pierde la XP ni los barcos nuevos', () => {
  test('si la 1.1 no escribe la fila, queda igual byte a byte, con el Navío como barco activo', async () => {
    await seed('u-ines', V2);
    const before = await rawRow('u-ines');
    await startServer();
    const i = await join('u-ines');
    await sleep(300);
    i.c.disconnect();
    await sleep(100);
    await game!.flushProgress();
    expect(await rawRow('u-ines')).toBe(before);
    expect((await rowOf('u-ines')).state.activeShip).toBe('line');
  });

  test('la 1.1 escribe, la 1.0.3 lee y escribe, la 1.1 lee: la XP y los barcos nuevos son los de la 1.1, y el activo el de la 1.0.3', async () => {
    await seed('u-jon', V2);
    await startServer();
    await join('u-jon');
    world().players.get('u-jon')!.xp += 66;
    await game!.flushProgress();
    const by11 = await rowOf('u-jon');
    expect(by11).toEqual({ state: { ...V2, activeShip: 'frigate', xp: 1300 }, revision: 2 });
    await stopServer();

    // La 1.0.3, con su lector congelado y la misma guarda de revision: el jugador gana oro y elige el Bergantín
    const read = parseProgress103(by11.state)!;
    const written = serializeProgress103({ ...read.progress, gold: 4400, activeShip: 'brig' }, read.carry);
    const { rowCount } = await db.admin.query('UPDATE player_progress SET state = $2, revision = revision + 1 WHERE user_id = $1 AND revision = $3', ['u-jon', written, by11.revision]);
    expect(rowCount).toBe(1);

    // Vuelve la 1.1
    await startServer();
    const again = await join('u-jon');
    expect(fields(again.me())).toEqual({ ...PLAYED, gold: 4400, activeShip: 'brig', xp: 1300 });
    world().players.get('u-jon')!.gold += 1;
    await game!.flushProgress();
    expect(await rowOf('u-jon')).toEqual({ state: { ...V2, gold: 4401, activeShip: 'brig', xp: 1300 }, revision: 4 });
  });

  test('reconectar antes de 10 s (el progreso sigue en memoria) no pierde lo nuevo al escribir', async () => {
    await seed('u-kai', V2);
    await startServer({ autoStart: false });
    const k = await join('u-kai');
    k.c.disconnect();
    for (let n = 0; n < Math.round((DISCONNECT_GRACE - 2) * TICK_RATE); n++) game!.tick();
    const again = await join('u-kai');
    expect(again.welcome.shipId).toBe(k.welcome.shipId);
    world().players.get('u-kai')!.gold += 5;
    await game!.flushProgress();
    expect((await rowOf('u-kai')).state).toEqual({ ...V2, gold: 4326, activeShip: 'frigate' });
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

describe('AC-156: se rechazan las demás filas, sin tocarlas', () => {
  test.each([
    ['v: 3', { ...V2, v: 3 }],
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

describe('revisión (AC-130): la guarda sigue igual con las filas v: 2', () => {
  test('si otro proceso escribe la fila por detrás, no se pisa: el jugador sale con el aviso', async () => {
    await seed('u-max', V2);
    await startServer({ saveIntervalMs: 60_000 });
    const m = await join('u-max');
    const kicked = new Promise<Notice>((resolve) => m.c.once(S2C.kicked, resolve));
    const newer = { ...V2, xp: 2000 };
    await db.admin.query('UPDATE player_progress SET state = $2, revision = revision + 1 WHERE user_id = $1', ['u-max', newer]);
    world().players.get('u-max')!.gold += 5;
    await game!.flushProgress();
    expect(await rowOf('u-max')).toEqual({ state: newer, revision: 2 });
    expect((await kicked).text).toBe('Has abierto el juego en otra pestaña');
  });
});

// AC-201: la Goleta y el Navío salen latentes, con su propio interruptor del servidor, SEA_BATTLE_NEW_SHIPS=1
// (server/features.ts), apagado por defecto y aparte del I2 (AC-187 c): son dos decisiones distintas, el I2 por GDD Q11 y
// las dos clases por el piloto de AC-193. Apagado, nadie las compra, tampoco con una intención forjada (AC-68), y una fila
// que ya las tiene las conserva sin jugarlas, como la 1.0.3 (AC-201 b). Encendido, la compra pide el nivel (AC-162) y la
// fila entra con ellas. Los tests de la fila de AC-156 (progress.test.ts y persistence-rollback*) son el estado apagado
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { Socket as ClientSocket } from 'socket.io-client';
import { LEVEL_XP, TICK_RATE } from '../../src/game/constants';
import { C2S } from '../../src/game/protocol';
import { shipOfPlayer } from '../../src/game/world';
import { startGame } from '../bootstrap';
import { newShipsEnabled } from '../features';
import { createGameServer, GameServer, GameServerOptions } from '../game-server';
import { healthPayload } from '../health';
import { parseProgress } from '../progress';
import { joinGame } from './fixtures/game-socket';
import { createTestDb, TestDb } from './pg/test-db';

const testAuth = async (auth: unknown) => ({ userId: (auth as { token: string }).token, guest: false });
const flush = (ms = 30) => new Promise((r) => setTimeout(r, ms));

let io: Server | null = null;
let game: GameServer;
const sockets: ClientSocket[] = [];

afterEach(async () => {
  sockets.splice(0).forEach((c) => c.disconnect());
  if (!io) return;
  game.stop();
  const closing = io;
  io = null;
  await new Promise<void>((resolve) => closing.close(() => resolve()));
});

async function start(options: Partial<GameServerOptions> = {}): Promise<string> {
  const httpServer: HttpServer = createServer();
  io = new Server(httpServer);
  game = createGameServer(io, { authenticate: testAuth, seed: 5, spawnNpcs: false, autoStart: false, ...options });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  return `http://localhost:${(httpServer.address() as AddressInfo).port}`;
}

async function advance(seconds: number): Promise<void> {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) game.tick();
  await flush();
}

// Jugador en el puerto con el oro y la XP de un nivel
function equip(userId: string, gold: number, level: number) {
  const player = game.world.players.get(userId)!;
  player.gold = gold;
  player.xp = LEVEL_XP[level - 1];
  return player;
}

describe('SEA_BATTLE_NEW_SHIPS (AC-201)', () => {
  test('solo el valor exacto 1 lo enciende, y no depende de SEA_BATTLE_I2', () => {
    expect(newShipsEnabled({ SEA_BATTLE_NEW_SHIPS: '1' })).toBe(true);
    for (const v of [undefined, '', '0', 'true', 'yes', 'on', ' 1', '1 ', '01']) expect({ v, on: newShipsEnabled({ SEA_BATTLE_NEW_SHIPS: v }) }).toEqual({ v, on: false });
    expect(newShipsEnabled({ SEA_BATTLE_I2: '1' })).toBe(false);
  });

  test('/healthz dice si están encendidas, aparte del I2', () => {
    expect(healthPayload(0, 0, 0, {})).toMatchObject({ i2: false, newShips: false });
    expect(healthPayload(0, 0, 0, { SEA_BATTLE_NEW_SHIPS: '1' })).toMatchObject({ i2: false, newShips: true });
    expect(healthPayload(0, 0, 0, { SEA_BATTLE_I2: '1' })).toMatchObject({ i2: true, newShips: false });
  });

  test.each([
    [{}, false, /Goleta y Navío apagados: no se venden \(se encienden con SEA_BATTLE_NEW_SHIPS=1\)/],
    [{ SEA_BATTLE_I2: '1' }, false, /Goleta y Navío apagados/],
    [{ SEA_BATTLE_NEW_SHIPS: '1' }, true, /Goleta y Navío encendidos \(SEA_BATTLE_NEW_SHIPS=1\): se venden en el astillero con su nivel/]
  ])('con %j el mundo queda con newShips = %s y lo dice el log', async (env, on, line) => {
    const logs: string[] = [];
    const server = new Server(createServer());
    const { game: g } = await startGame(server, { SEA_BATTLE_NPCS: '0', ...env }, (m) => logs.push(m));
    expect(g.world.newShips).toBe(on);
    expect(logs.join('\n')).toMatch(line);
    g.stop();
    server.close();
  });

  test('apagadas (por defecto): la bienvenida lo dice, y una compra forjada de cada una se rechaza aunque haya nivel y oro, sin tocar nada; un cliente no las enciende', async () => {
    const url = await start();
    const a = await joinGame(url, { token: 'a', newShips: true }, 'Ana', sockets);
    expect(a.welcome.newShips).toBe(false);
    const player = equip('a', 20_000, 20);
    a.c.emit(C2S.buy, { itemId: 'ship:schooner' });
    a.c.emit(C2S.buy, { itemId: 'ship:line' });
    await flush();
    await advance(0.1);
    expect(a.notices().filter((n) => n.kind === 'error').map((n) => n.text)).toEqual(['Ese barco no está a la venta', 'Ese barco no está a la venta']);
    expect({ gold: player.gold, owned: player.ownedShips, active: player.activeShip }).toEqual({ gold: 20_000, owned: ['sloop'], active: 'sloop' });
    expect(game.world.newShips).toBe(false);
  });

  test('encendidas: la bienvenida lo dice; sin el nivel, la compra se rechaza con el texto de AC-162, y con él se compra', async () => {
    const url = await start({ newShips: true });
    const a = await joinGame(url, { token: 'a' }, 'Ana', sockets);
    expect(a.welcome.newShips).toBe(true);
    const player = equip('a', 3000, 4);
    a.c.emit(C2S.buy, { itemId: 'ship:schooner' });
    await flush();
    await advance(0.1);
    expect(a.notices().filter((n) => n.kind === 'error').map((n) => n.text)).toEqual(['Requiere nivel 5 (Marinero)']);
    expect(player.ownedShips).toEqual(['sloop']);

    player.xp = LEVEL_XP[4];
    a.c.emit(C2S.buy, { itemId: 'ship:schooner' });
    await flush();
    await advance(0.1);
    expect({ gold: player.gold, owned: player.ownedShips, active: player.activeShip, classId: shipOfPlayer(game.world, 'a')!.classId }).toEqual({
      gold: 0,
      owned: ['sloop', 'schooner'],
      active: 'schooner',
      classId: 'schooner'
    });
  });
});

describe('parseProgress con el interruptor (AC-201 b)', () => {
  const row = { v: 2, gold: 500, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'schooner', 'line'], activeShip: 'line', xp: 3000 };

  test('apagadas (por defecto), la Goleta y el Navío van aparte y se juega con el mejor de la 1.0; encendidas, se juegan con el activo de la fila', () => {
    expect(parseProgress(row)).toEqual(parseProgress(row, false));
    expect(parseProgress(row, false)).toEqual({
      progress: { gold: 500, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop', xp: 3000 },
      carry: { newShips: ['schooner', 'line'] }
    });
    expect(parseProgress(row, true)).toEqual({
      progress: { gold: 500, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'schooner', 'line'], activeShip: 'line', xp: 3000 },
      carry: { newShips: [] }
    });
  });

  test('encendidas, una v: 1 de la 1.0 se lee igual, y una v: 1 con la Goleta sigue sin pasar (AC-156)', () => {
    const v1 = { v: 1, gold: 10, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig' };
    expect(parseProgress(v1, true)).toEqual(parseProgress(v1, false));
    expect(parseProgress({ ...v1, ownedShips: ['sloop', 'schooner'], activeShip: 'schooner' }, true)).toBeNull();
  });
});

// AC-201 (b): apagadas, la 1.1 hace con la fila lo mismo que la 1.0.3 (AC-157 b y c). Por el arranque real
// (SEA_BATTLE_NEW_SHIPS y DATABASE_URL), con la fila en Postgres: así se prueba que el interruptor llega también al lector
// de la fila, no solo al mundo
describe('una fila con la Goleta activa y el Navío (AC-201 b)', () => {
  let db: TestDb;
  const pools: Pool[] = [];
  const ROW = { v: 2, gold: 500, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig', 'schooner', 'line'], activeShip: 'schooner', xp: 3000 };

  beforeAll(async () => {
    db = await createTestDb();
  });
  // Como stopServer de persistence.test.ts: lo pendiente se escribe antes de cerrar el pool
  afterEach(async () => {
    sockets.splice(0).forEach((c) => c.disconnect());
    if (io) {
      await new Promise((r) => setTimeout(r, 50));
      await Promise.race([game.flushProgress(), new Promise((r) => setTimeout(r, 5000).unref())]);
      game.stop();
      const closing = io;
      io = null;
      await new Promise<void>((resolve) => closing.close(() => resolve()));
    }
    await Promise.all(pools.splice(0).map((p) => p.end()));
  });
  afterAll(async () => {
    await db?.drop();
  });

  async function boot(env: Record<string, string>, userId: string): Promise<string> {
    const httpServer = createServer();
    io = new Server(httpServer);
    const stack = await startGame(io, { SEA_BATTLE_NPCS: '0', DATABASE_URL: db.url, ...env }, () => {}, { authenticate: testAuth, autoStart: false });
    game = stack.game;
    pools.push(stack.pool!);
    await db.admin.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', [userId, ROW]);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    return `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  }
  const stateOf = async (userId: string) => (await db.admin.query('SELECT state FROM player_progress WHERE user_id = $1', [userId])).rows[0].state;

  test('apagadas: entra con el mejor barco de la 1.0 que posee y su XP, el cliente nunca recibe "schooner" ni "line", y al escribir la fila los conserva con el activo con el que juega', async () => {
    const a = await joinGame(await boot({}, 'fila-off'), { token: 'fila-off' }, 'Ana', sockets);
    expect({ owned: a.me().ownedShips, active: a.me().activeShip, xp: a.me().xp, classId: shipOfPlayer(game.world, 'fila-off')!.classId }).toEqual({
      owned: ['sloop', 'brig'],
      active: 'brig',
      xp: 3000,
      classId: 'brig'
    });
    a.c.emit(C2S.selectShip, { classId: 'schooner' }); // forjada: no la posee en la partida
    await flush();
    await advance(0.1);
    expect(shipOfPlayer(game.world, 'fila-off')!.classId).toBe('brig');
    expect(JSON.stringify([a.welcome, a.frames])).not.toMatch(/"(schooner|line)"/);

    game.world.players.get('fila-off')!.gold += 100;
    expect(await game.flushProgress()).toBe(true);
    expect(await stateOf('fila-off')).toEqual({ ...ROW, gold: 600, activeShip: 'brig' });
  });

  test('encendidas: la misma fila entra con la Goleta activa y el Navío, y se escribe igual', async () => {
    const a = await joinGame(await boot({ SEA_BATTLE_NEW_SHIPS: '1' }, 'fila-on'), { token: 'fila-on' }, 'Ana', sockets);
    expect({ owned: a.me().ownedShips, active: a.me().activeShip, xp: a.me().xp, classId: shipOfPlayer(game.world, 'fila-on')!.classId }).toEqual({
      owned: ['sloop', 'brig', 'schooner', 'line'],
      active: 'schooner',
      xp: 3000,
      classId: 'schooner'
    });
    game.world.players.get('fila-on')!.gold += 100;
    expect(await game.flushProgress()).toBe(true);
    expect(await stateOf('fila-on')).toEqual({ ...ROW, gold: 600 });
  });
});

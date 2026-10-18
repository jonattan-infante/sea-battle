// AC-187 (c): el I2 llega latente y lo enciende solo el servidor, con SEA_BATTLE_I2=1 (server/features.ts). Apagado, que es
// lo que se despliega, el Capitán no aparece aunque se cumpla su disparador (AC-54), y nada de lo que manda un cliente lo
// enciende. Los escenarios del Capitán exigen el I2 encendido. Con él apagado, AC-137 lo cubre server/__tests__/latent-i2.test.ts
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { CAPTAIN_CLASS, CAPTAIN_KILLS_TO_SPAWN, TICK_RATE } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { GameEvent, ServerFrame, Welcome } from '../../src/game/types';
import { spawnCaptain } from '../../src/game/world';
import { startGame } from '../bootstrap';
import { i2Enabled } from '../features';
import { createGameServer, GameServer } from '../game-server';

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

async function start(i2?: boolean): Promise<string> {
  const httpServer: HttpServer = createServer();
  io = new Server(httpServer);
  game = createGameServer(io, { authenticate: testAuth, seed: 3, spawnNpcs: false, autoStart: false, ...(i2 === undefined ? {} : { i2 }) });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  return `http://localhost:${(httpServer.address() as AddressInfo).port}`;
}

describe('SEA_BATTLE_I2 (AC-187)', () => {
  test('solo el valor exacto 1 lo enciende', () => {
    expect(i2Enabled({ SEA_BATTLE_I2: '1' })).toBe(true);
    for (const v of [undefined, '', '0', 'true', 'TRUE', 'yes', 'on', ' 1', '1 ', '01', '2']) expect({ v, on: i2Enabled({ SEA_BATTLE_I2: v }) }).toEqual({ v, on: false });
  });

  test('por defecto está apagado: con el disparador cumplido (10 hundidos) no aparece el Capitán, ni en el mundo ni en los frames', async () => {
    const url = await start();
    expect(game.world.i2).toBe(false);
    const c = ioClient(url, { transports: ['websocket'], reconnection: false, auth: { token: 'a' } });
    sockets.push(c);
    const frames: ServerFrame[] = [];
    c.on(S2C.frame, (f: ServerFrame) => frames.push(f));
    const welcome = new Promise<Welcome>((resolve) => c.once(S2C.welcome, resolve));
    c.emit(C2S.join, { name: 'Ana' });
    await welcome;
    game.world.killsSinceBoss = CAPTAIN_KILLS_TO_SPAWN;
    for (let i = 0; i < 2 * TICK_RATE; i++) game.tick();
    await flush(60);
    expect(spawnCaptain(game.world)).toBeNull();
    expect([...game.world.ships.values()].filter((s) => s.classId === CAPTAIN_CLASS)).toEqual([]);
    const events = frames.flatMap((f) => f.e ?? []).map((e: GameEvent) => e.type);
    expect(events.filter((t) => t === 'captain' || t === 'captainDown')).toEqual([]);
    expect(frames.flatMap((f) => f.s ?? []).filter((s) => s.c === CAPTAIN_CLASS)).toEqual([]);
  });

  test('un cliente no lo enciende: ni con i2 en el handshake ni en el join (el parser lo rechaza y el join válido entra apagado)', async () => {
    const url = await start();
    const c = ioClient(url, { transports: ['websocket'], reconnection: false, auth: { token: 'b', i2: true, SEA_BATTLE_I2: '1' } });
    sockets.push(c);
    let welcomes = 0;
    c.on(S2C.welcome, () => welcomes++);
    await new Promise<void>((resolve) => c.once('connect', () => resolve()));
    c.emit(C2S.join, { name: 'Bea', i2: true });
    await flush(100);
    expect(welcomes).toBe(0); // campo de más: AC-05
    c.emit(C2S.join, { name: 'Bea' });
    await flush(100);
    expect(welcomes).toBe(1);
    game.world.killsSinceBoss = CAPTAIN_KILLS_TO_SPAWN;
    game.tick();
    expect(game.world.i2).toBe(false);
    expect([...game.world.ships.values()].some((s) => s.classId === CAPTAIN_CLASS)).toBe(false);
  });

  test('encendido (i2: true), el mismo disparador hace aparecer al Capitán', async () => {
    await start(true);
    expect(game.world.i2).toBe(true);
    game.world.killsSinceBoss = CAPTAIN_KILLS_TO_SPAWN;
    game.tick();
    expect([...game.world.ships.values()].filter((s) => s.classId === CAPTAIN_CLASS)).toHaveLength(1);
  });
});

describe('arranque con SEA_BATTLE_I2 (server/bootstrap.ts)', () => {
  const ioOnly = () => new Server(createServer());

  test.each([
    [{}, false, /I2 apagado/],
    [{ SEA_BATTLE_I2: '0' }, false, /I2 apagado/],
    [{ SEA_BATTLE_I2: '1' }, true, /I2 encendido \(SEA_BATTLE_I2=1\)/]
  ])('con %j el mundo queda con i2 = %s y lo dice el log', async (env, on, line) => {
    const logs: string[] = [];
    const server = ioOnly();
    const { game: g } = await startGame(server, { SEA_BATTLE_NPCS: '0', ...env }, (m) => logs.push(m));
    expect(g.world.i2).toBe(on);
    expect(logs.join('\n')).toMatch(line);
    g.stop();
    server.close();
  });

  test.each(['captain', 'captain-down'])('el escenario "%s" no arranca con el I2 apagado, y con él encendido sí', async (scenario) => {
    const server = ioOnly();
    await expect(startGame(server, { SEA_BATTLE_NPCS: '0', AUTH_BYPASS: '1', SEA_BATTLE_SCENARIO: scenario })).rejects.toThrow(/necesita el I2 encendido \(SEA_BATTLE_I2=1/);
    const { game: g } = await startGame(server, { SEA_BATTLE_NPCS: '0', AUTH_BYPASS: '1', SEA_BATTLE_SCENARIO: scenario, SEA_BATTLE_I2: '1' });
    expect(g.world.i2).toBe(true);
    if (scenario === 'captain-down') expect([...g.world.ships.values()].map((s) => s.classId)).toEqual([CAPTAIN_CLASS]);
    g.stop();
    server.close();
  });
});

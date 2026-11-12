// AC-187 (c) y AC-210: el I2 lo decide solo el servidor (server/features.ts). Desde la 1.2 está encendido por defecto, que es
// lo que se despliega (AC-210 a), y solo SEA_BATTLE_I2=0 lo apaga: la palanca de emergencia de E-1 (AC-210 d). Apagado, el
// Capitán no aparece aunque se cumpla su disparador (AC-54), y nada de lo que manda un cliente lo cambia. Los escenarios del
// Capitán exigen el I2 encendido. Con él apagado, AC-137 lo cubre server/__tests__/latent-i2.test.ts
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { CAPTAIN_CLASS, CAPTAIN_KILLS_TO_SPAWN, GUNBOAT_CLASS, TICK_RATE } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { GameEvent, ServerFrame, ShipSnapshot, Welcome } from '../../src/game/types';
import { shipOfPlayer, spawnCaptain } from '../../src/game/world';
import { startGame } from '../bootstrap';
import { i2Enabled, unrecognizedSwitches } from '../features';
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

describe('SEA_BATTLE_I2 (AC-187, AC-210 a y d)', () => {
  test('solo el valor exacto 0 lo apaga; cualquier otro valor, o ninguno, lo deja encendido', () => {
    expect(i2Enabled({ SEA_BATTLE_I2: '0' })).toBe(false);
    for (const v of [undefined, '', '1', 'true', 'false', 'FALSE', 'no', 'off', ' 0', '0 ', '00', '2']) expect({ v, on: i2Enabled({ SEA_BATTLE_I2: v }) }).toEqual({ v, on: true });
    expect(i2Enabled({})).toBe(true);
  });

  test('avisa de un valor que no se reconoce; 0, 1, vacía o ausente no avisan', () => {
    for (const v of [undefined, '', '0', '1']) expect({ v, warn: unrecognizedSwitches({ SEA_BATTLE_I2: v }) }).toEqual({ v, warn: [] });
    for (const v of ['true', 'false', 'no', 'off', ' 0', '0 ', '00', '2'])
      expect({ v, warn: unrecognizedSwitches({ SEA_BATTLE_I2: v }) }).toEqual({ v, warn: [`Aviso: SEA_BATTLE_I2=«${v}» no se reconoce (solo 0 lo apaga): I2 encendido`] });
  });

  test('apagado (la palanca), con el disparador cumplido (10 hundidos) no aparece el Capitán, ni en el mundo ni en los frames', async () => {
    const url = await start(false);
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

  test.each([
    [false, '1'],
    [true, '0']
  ])('un cliente no lo cambia: con el I2 encendido = %s, ni con i2 en el handshake ni en el join (el parser lo rechaza y el join válido entra con el del servidor)', async (on, wire) => {
    const url = await start(on);
    const c = ioClient(url, { transports: ['websocket'], reconnection: false, auth: { token: 'b', i2: !on, SEA_BATTLE_I2: wire } });
    sockets.push(c);
    let welcomes = 0;
    c.on(S2C.welcome, () => welcomes++);
    await new Promise<void>((resolve) => c.once('connect', () => resolve()));
    c.emit(C2S.join, { name: 'Bea', i2: !on });
    await flush(100);
    expect(welcomes).toBe(0); // campo de más: AC-05
    c.emit(C2S.join, { name: 'Bea' });
    await flush(100);
    expect(welcomes).toBe(1);
    game.world.killsSinceBoss = CAPTAIN_KILLS_TO_SPAWN;
    game.tick();
    expect(game.world.i2).toBe(on);
    expect([...game.world.ships.values()].some((s) => s.classId === CAPTAIN_CLASS)).toBe(on);
  });

  // Punto 3 de dev-render (BACKLOG :425-:427): la bienvenida dice qué NPC pueden salir, y el cliente solo baja sus modelos
  test.each([
    [false, ['merchant', 'pirate']],
    [true, ['captain', 'gunboat', 'merchant', 'pirate']]
  ])('con el I2 %s, la bienvenida lista las clases de NPC que pueden salir: %j', async (i2, classes) => {
    const url = await start(i2);
    const c = ioClient(url, { transports: ['websocket'], reconnection: false, auth: { token: 'a' } });
    sockets.push(c);
    const welcome = new Promise<Welcome>((resolve) => c.once(S2C.welcome, resolve));
    c.emit(C2S.join, { name: 'Ana' });
    expect([...(await welcome).npcClasses].sort()).toEqual(classes);
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

  const ON = 'I2 encendido (por defecto): el Capitán pirata y las cañoneras entran en partida (se apaga con SEA_BATTLE_I2=0)';
  const OFF = 'I2 apagado (SEA_BATTLE_I2=0, palanca de emergencia): sin Capitán pirata ni cañoneras';
  test.each([
    [{}, true, [ON]],
    [{ SEA_BATTLE_I2: '' }, true, [ON]],
    [{ SEA_BATTLE_I2: '1' }, true, [ON]],
    [{ SEA_BATTLE_I2: '0' }, false, [OFF]],
    [{ SEA_BATTLE_I2: 'false' }, true, ['Aviso: SEA_BATTLE_I2=«false» no se reconoce (solo 0 lo apaga): I2 encendido', ON]]
  ])('con %j el mundo queda con i2 = %s y lo dice el log', async (env, on, lines) => {
    const logs: string[] = [];
    const server = ioOnly();
    const { game: g } = await startGame(server, { SEA_BATTLE_NPCS: '0', ...env }, (m) => logs.push(m));
    expect(g.world.i2).toBe(on);
    expect(logs.filter((l) => /^(I2 |Aviso: SEA_BATTLE_I2)/.test(l))).toEqual(lines);
    g.stop();
    server.close();
  });

  // AC-51 por la vía de un e2e (startOwnServer): el entorno decide la población con NPC. Por defecto, la del I2 (H-306);
  // con la palanca, la de la 1.0
  test.each([
    [{}, { pirate: 8, gunboat: 4, merchant: 8 }],
    [{ SEA_BATTLE_I2: '0' }, { pirate: 12, gunboat: 0, merchant: 8 }],
    [{ SEA_BATTLE_I2: '1' }, { pirate: 8, gunboat: 4, merchant: 8 }]
  ])('con NPC y %j, el mundo arranca con %j (AC-51)', async (env, expected) => {
    const httpServer = createServer();
    io = new Server(httpServer);
    ({ game } = await startGame(io, env, () => {}, { autoStart: false }));
    const count = (classId: string) => [...game.world.ships.values()].filter((s) => s.classId === classId).length;
    expect({ pirate: count('pirate'), gunboat: count(GUNBOAT_CLASS), merchant: count('merchant') }).toEqual(expected);
  });

  test('con NPC y SEA_BATTLE_I2=1, un cliente junto a una cañonera la recibe en el frame como «Cañonera pirata», hostil y con su clase', async () => {
    const httpServer = createServer();
    io = new Server(httpServer);
    ({ game } = await startGame(io, { SEA_BATTLE_I2: '1' }, () => {}, { autoStart: false, authenticate: testAuth }));
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const c = ioClient(`http://localhost:${(httpServer.address() as AddressInfo).port}`, { transports: ['websocket'], reconnection: false, auth: { token: 'a' } });
    sockets.push(c);
    const frames: ServerFrame[] = [];
    c.on(S2C.frame, (f: ServerFrame) => frames.push(f));
    const welcome = new Promise<Welcome>((resolve) => c.once(S2C.welcome, resolve));
    c.emit(C2S.join, { name: 'Ana' });
    await welcome;
    const boat = [...game.world.ships.values()].find((s) => s.classId === GUNBOAT_CLASS)!;
    shipOfPlayer(game.world, 'a')!.pos = { x: boat.pos.x * 0.6, z: boat.pos.z * 0.6 }; // a ~180 m: dentro del área de interés (300 m)
    for (let i = 0; i < TICK_RATE; i++) game.tick();
    await flush(60);
    const seen = frames.flatMap((f) => f.s ?? []).find((s) => s.id === boat.id) as ShipSnapshot | undefined;
    expect(seen && { c: seen.c, k: seen.k, n: seen.n }).toEqual({ c: GUNBOAT_CLASS, k: 'pirate', n: 'Cañonera pirata' });
  });

  test.each(['captain', 'captain-down', 'legibility-i2', 'legibility-i2-90', 'danger', 'combat-i2'])('el escenario "%s" no arranca con SEA_BATTLE_I2=0, y sin la variable sí', async (scenario) => {
    const server = ioOnly();
    await expect(startGame(server, { SEA_BATTLE_NPCS: '0', AUTH_BYPASS: '1', SEA_BATTLE_SCENARIO: scenario, SEA_BATTLE_I2: '0' })).rejects.toThrow(/necesita el I2 encendido \(sin SEA_BATTLE_I2=0/);
    const { game: g } = await startGame(server, { SEA_BATTLE_NPCS: '0', AUTH_BYPASS: '1', SEA_BATTLE_SCENARIO: scenario });
    expect(g.world.i2).toBe(true);
    if (scenario === 'captain-down') expect([...g.world.ships.values()].map((s) => s.classId)).toEqual([CAPTAIN_CLASS]);
    if (scenario.startsWith('legibility-i2')) expect([...g.world.ships.values()].map((s) => s.classId).sort()).toEqual([CAPTAIN_CLASS, GUNBOAT_CLASS, 'merchant', 'pirate']);
    if (scenario === 'danger') expect([...g.world.ships.values()].map((s) => s.classId).sort()).toEqual([GUNBOAT_CLASS, 'pirate']);
    if (scenario === 'combat-i2') expect([...g.world.ships.values()].map((s) => s.classId).sort()).toEqual([CAPTAIN_CLASS, GUNBOAT_CLASS, ...Array(5).fill('merchant')]);
    g.stop();
    server.close();
  });

  // Como todos los escenarios, "combat-i2" (E-2) solo se aplica con el modo invitado permitido (server/bootstrap.ts:37), que
  // nunca corre en Railway: sin AUTH_BYPASS el mundo arranca sin sus barcos ni su oro
  test('sin el modo invitado, SEA_BATTLE_SCENARIO=combat-i2 no se aplica', async () => {
    const server = ioOnly();
    const { game: g } = await startGame(server, { SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'combat-i2' });
    try {
      expect([[...g.world.ships.values()].map((s) => s.classId), g.world.startingGold]).toEqual([[], undefined]);
    } finally {
      g.stop(); // también si falla: sin parar el juego, Jest no sale
      server.close();
    }
  });
});

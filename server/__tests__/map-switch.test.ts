// El mapa del mundo lo decide solo el servidor (server/features.ts). Desde la 1.2 (AC-210 a), sin la variable, que es lo que
// se despliega, el mundo es el de la 1.1 (MAP_1_1), y la bienvenida lleva sus islas para que el cliente pinte lo que simula
// el servidor (AC-199 e). Solo SEA_BATTLE_MAP=1.0 vuelve al de la 1.0: la palanca de emergencia de E-1 (AC-210 d). Con la
// 1.1, un escenario de prueba solo arranca si todos sus barcos quedan en sitios navegables del mapa (C3)
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { GAME_MAP, GUNBOAT_CLASS, ISLANDS, MAP_1_0, MAP_1_1, MOORINGS_1_1, navClearance } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { Welcome } from '../../src/game/types';
import { forward } from '../../src/game/vec';
import { createWorld, navigatorOf, shipOfPlayer, spawnMerchant } from '../../src/game/world';
import { startGame } from '../bootstrap';
import { mapId, mapOfId, unrecognizedSwitches } from '../features';
import * as scenarios from '../scenarios';
import { applyScenario, SCENARIOS, strandedShips } from '../scenarios';
import { createGameServer, GameServer } from '../game-server';

const testAuth = async (auth: unknown) => ({ userId: (auth as { token: string }).token, guest: false });

let io: Server | null = null;
let game: GameServer | null = null;
const sockets: ClientSocket[] = [];
// Servidores de los tests sin socket: se paran aquí, también cuando una aserción falla (si no, Jest no termina)
const cleanups: (() => void)[] = [];

afterEach(async () => {
  cleanups.splice(0).forEach((f) => f());
  sockets.splice(0).forEach((c) => c.disconnect());
  game?.stop();
  game = null;
  if (!io) return;
  const closing = io;
  io = null;
  await new Promise<void>((resolve) => closing.close(() => resolve()));
});

// Arranque por bootstrap con este entorno, sin NPC salvo que el entorno los pida, y escuchando en un puerto libre
async function boot(env: Record<string, string>, logs: string[] = []): Promise<string> {
  const httpServer: HttpServer = createServer();
  io = new Server(httpServer);
  ({ game } = await startGame(io, { SEA_BATTLE_NPCS: '0', ...env }, (m) => logs.push(m), { authenticate: testAuth, autoStart: false }));
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  return `http://localhost:${(httpServer.address() as AddressInfo).port}`;
}

function welcomeOf(url: string, token: string): Promise<Welcome> {
  const socket = ioClient(url, { auth: { token }, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  return new Promise((resolve) => {
    socket.once(S2C.welcome, (w: Welcome) => resolve(w));
    socket.on('connect', () => socket.emit(C2S.join, { name: 'Ana' }));
  });
}

describe('SEA_BATTLE_MAP (AC-210 a y d)', () => {
  // (i)
  test('solo el valor exacto 1.0 pone el mapa de la 1.0; cualquier otro valor, o ninguno, el de la 1.1', () => {
    expect(mapId({ SEA_BATTLE_MAP: '1.0' })).toBe('1.0');
    for (const v of [undefined, '', '1.1', '1', '10', '1,0', '1.2', ' 1.0', '1.0 ', 'true', '0']) expect({ v, map: mapId({ SEA_BATTLE_MAP: v }) }).toEqual({ v, map: '1.1' });
    expect(mapId({})).toBe('1.1');
    expect(mapOfId(mapId({}))).toBe(GAME_MAP); // el mapa del servidor sin variables es el de los tests de AC-210 (c)
    expect(GAME_MAP).toBe(MAP_1_1);
    expect(mapOfId('1.0')).toBe(MAP_1_0);
    expect(mapOfId('1.1')).toBe(MAP_1_1);
  });

  test('avisa de un valor que no se reconoce; 1.0, 1.1, vacía o ausente no avisan', () => {
    for (const v of [undefined, '', '1.0', '1.1']) expect({ v, warn: unrecognizedSwitches({ SEA_BATTLE_MAP: v }) }).toEqual({ v, warn: [] });
    for (const v of ['1', '10', '1,0', '1.2', ' 1.0', '1.0 ', 'true', '0'])
      expect({ v, warn: unrecognizedSwitches({ SEA_BATTLE_MAP: v }) }).toEqual({ v, warn: [`Aviso: SEA_BATTLE_MAP=«${v}» no se reconoce (solo 1.0 lo cambia): mapa 1.1`] });
  });
});

describe('arranque con SEA_BATTLE_MAP (server/bootstrap.ts)', () => {
  const ioOnly = () => new Server(createServer());

  // (ii)
  const LINE_1_1 = 'Mapa 1.1 (por defecto): las islas de la 1.1 y los amarres del puerto (se cambia con SEA_BATTLE_MAP=1.0)';
  const LINE_1_0 = 'Mapa 1.0 (SEA_BATTLE_MAP=1.0, palanca de emergencia): las islas de la 1.0, sin amarres';
  test.each([
    [{}, MAP_1_1, [LINE_1_1], false],
    [{ SEA_BATTLE_MAP: '' }, MAP_1_1, [LINE_1_1], false],
    [{ SEA_BATTLE_MAP: '1.1' }, MAP_1_1, [LINE_1_1], false],
    [{ SEA_BATTLE_MAP: '1.0' }, MAP_1_0, [LINE_1_0], false],
    [{ SEA_BATTLE_MAP: '1.2' }, MAP_1_1, ['Aviso: SEA_BATTLE_MAP=«1.2» no se reconoce (solo 1.0 lo cambia): mapa 1.1', LINE_1_1], true]
  ])('con %j el mundo queda con su mapa y lo dice el log', async (env, map, lines, warns) => {
    const logs: string[] = [];
    const server = ioOnly();
    const { game: g } = await startGame(server, { SEA_BATTLE_NPCS: '0', ...env }, (m) => logs.push(m));
    cleanups.push(() => (g.stop(), server.close()));
    expect(g.world.islands).toBe(map.islands);
    expect(g.world.moorings).toBe(map.moorings);
    expect(logs.filter((l) => /^(Mapa|Aviso: SEA_BATTLE_MAP)/.test(l))).toEqual(lines);
    expect(logs.some((l) => l.startsWith('Aviso: SEA_BATTLE_MAP'))).toBe(warns);
  });

  // Escenarios con la 1.1 (C3), que desde AC-210 es la de por defecto: todos los de SCENARIOS, sin NPC y sin variables de
  // mapa ni del I2 (los del I2 lo tienen por defecto). O arrancan con todos sus barcos en sitios navegables, o no arrancan y
  // el error nombra el escenario, el barco y la posición. Hoy arrancan los 18. Con la 1.0 (E-1), con el I2 si lo piden
  const env = (scenario: string, map?: string) => ({
    SEA_BATTLE_NPCS: '0',
    AUTH_BYPASS: '1',
    SEA_BATTLE_SCENARIO: scenario,
    ...(map ? { SEA_BATTLE_MAP: map } : {})
  });

  test.each([...SCENARIOS])('el escenario "%s" sin SEA_BATTLE_MAP (la 1.1, por defecto): arranca con sus barcos en sitios navegables, o no arranca y dice dónde', async (scenario) => {
    const server = ioOnly();
    cleanups.push(() => server.close());
    const result = await startGame(server, env(scenario)).then(
      ({ game: started }) => (cleanups.push(() => started.stop()), started),
      (err: Error) => err
    );
    if (result instanceof Error) {
      console.log(`C3: el escenario «${scenario}» no arranca con la 1.1: ${result.message}`);
      expect(result.message).toMatch(new RegExp(`^El escenario «${scenario}» deja barcos en sitios no navegables del mapa: \\S+ \\(\\S+\\) en \\(-?\\d+\\.\\d{2}, -?\\d+\\.\\d{2}\\)`));
      return;
    }
    expect(result.world.islands).toBe(MAP_1_1.islands);
    expect(strandedShips(result.world, new Set())).toEqual([]);
  });

  test.each([...SCENARIOS])('el escenario "%s" con SEA_BATTLE_MAP=1.0 arranca con el mapa 1.0, como antes (E-1)', async (scenario) => {
    const server = ioOnly();
    cleanups.push(() => server.close());
    const { game: g } = await startGame(server, env(scenario, '1.0'));
    cleanups.push(() => g.stop());
    expect(g.world.islands).toBe(MAP_1_0.islands);
  });

  // Hoy los 18 escenarios son navegables con la 1.1, así que ninguno lanza: lo que bootstrap pasa a applyScenario se
  // comprueba aparte, espiando la llamada (la implementación de verdad sigue corriendo)
  test.each([
    ['sin SEA_BATTLE_MAP (la 1.1)', true, undefined],
    ['con SEA_BATTLE_MAP=1.0', false, '1.0']
  ])('%s, bootstrap aplica el escenario con requireNavigable = %s', async (_, required, map) => {
    const spy = jest.spyOn(scenarios, 'applyScenario');
    cleanups.push(() => spy.mockRestore());
    const server = ioOnly();
    cleanups.push(() => server.close());
    const { game: g } = await startGame(server, env('targets', map));
    cleanups.push(() => g.stop());
    expect(spy.mock.calls.map(([world, name, options]) => ({ same: world === g.world, name, options }))).toEqual([
      { same: true, name: 'targets', options: { requireNavigable: required } }
    ]);
  });

  test('strandedShips da los barcos que puso el escenario y quedan en roca, con su margen; los de antes no cuentan', () => {
    const world = createWorld({ seed: 1, spawnNpcs: false, map: MAP_1_1 });
    spawnMerchant(world).pos = { x: 0, z: 0 }; // en roca, pero ya estaba antes del escenario
    const before = new Set(world.ships.keys());
    applyScenario(world, 'targets');
    expect(strandedShips(world, before)).toEqual([]);
    const placed = [...world.ships.values()].find((s) => !before.has(s.id))!;
    placed.pos = { x: 0, z: 0 }; // dentro del puerto de D92
    expect(strandedShips(world, before).map((s) => s.id)).toEqual([placed.id]);
    placed.pos = { x: 0, z: 150 + navClearance(placed.classId) }; // TARGETS_POINT y más: agua
    expect(strandedShips(world, before)).toEqual([]);
  });

  // (iii) La palanca de E-1: con las 2 variables, el mundo de la 1.1.x de prod, que es el de createGameServer sin opciones
  test('con SEA_BATTLE_MAP=1.0 y SEA_BATTLE_I2=0, con NPC, el mundo es idéntico al de la 1.1.x: las mismas islas, sin amarres y los mismos barcos en el mismo sitio (E-1)', async () => {
    const server = ioOnly();
    const { game: g } = await startGame(server, { SEA_BATTLE_MAP: '1.0', SEA_BATTLE_I2: '0' }, () => {}, { seed: 7, autoStart: false });
    const todayIo = ioOnly();
    const today = createGameServer(todayIo, { authenticate: testAuth, seed: 7, autoStart: false });
    cleanups.push(() => (g.stop(), today.stop(), server.close(), todayIo.close()));
    const ships = (s: GameServer) => [...s.world.ships.values()].map((x) => ({ id: x.id, c: x.classId, x: x.pos.x, z: x.pos.z, h: x.heading }));
    expect(g.world.islands).toBe(today.world.islands);
    expect(g.world.islands).toBe(ISLANDS);
    expect(g.world.moorings).toEqual([]);
    expect(ships(g)).toEqual(ships(today));
    expect(ships(g).length).toBe(20);
    for (let i = 0; i < 40; i++) {
      g.tick();
      today.tick();
    }
    expect(ships(g)).toEqual(ships(today));
  });

  // (iv)
  test.each([
    ['sin la variable', {}, MAP_1_1.islands, 50],
    ['con SEA_BATTLE_MAP=1.0', { SEA_BATTLE_MAP: '1.0' }, ISLANDS, 7]
  ])('%s, la bienvenida lleva las islas del mapa del servidor', async (_, env, islands, count) => {
    const url = await boot(env);
    const welcome = await welcomeOf(url, 'a');
    expect(welcome.islands).toEqual(islands);
    expect(welcome.islands.length).toBe(count);
  });

  // AC-210 (a) con AC-176: el barco del que entra, a su margen del punto Q de un amarre de D92 en su rumbo ψ, y con la proa
  // hacia fuera
  test('sin la variable, el jugador que entra aparece en un amarre libre del puerto de D92, a su margen de Q y con la proa hacia fuera (AC-210 a, AC-176)', async () => {
    const url = await boot({});
    await welcomeOf(url, 'a');
    const ship = shipOfPlayer(game!.world, 'a')!;
    const spots = MOORINGS_1_1.map((m, k) => {
      const f = forward((m.psiDeg * Math.PI) / 180);
      const d = navClearance(ship.classId);
      const turn = Math.abs(Math.atan2(Math.sin(ship.heading - (m.psiDeg * Math.PI) / 180), Math.cos(ship.heading - (m.psiDeg * Math.PI) / 180)));
      return { k, off: Math.hypot(ship.pos.x - (m.x + f.x * d), ship.pos.z - (m.z + f.z * d)), turnDeg: (turn * 180) / Math.PI };
    });
    const best = spots.reduce((a, b) => (b.off < a.off ? b : a));
    expect(game!.world.moorings).toBe(MAP_1_1.moorings);
    expect({ off: best.off <= 0.5, turn: best.turnDeg <= 5 }).toEqual({ off: true, turn: true });
  });

  test('sin la variable, los círculos de la bienvenida son los de ISLAND_SHAPES_1_1, forma a forma (AC-210 a)', async () => {
    const welcome = await welcomeOf(await boot({}), 'a');
    const expected = MAP_1_1.shapes.flatMap((s) => s.circles.map((c, k) => ({ id: s.circles.length > 1 ? `${s.id}.${k}` : s.id, ...c })));
    expect(welcome.islands).toEqual(expected);
  });

  // (v) AC-210 (a): sin ninguna variable, como en staging y prod
  test('sin variables de mapa ni del I2: el I2 y las islas de la 1.1, la población del I2 y ningún NPC en un sitio no navegable (AC-210 a)', async () => {
    const httpServer = createServer();
    io = new Server(httpServer);
    ({ game } = await startGame(io, {}, () => {}, { autoStart: false }));
    const world = game.world;
    expect(world.i2).toBe(true);
    expect(world.islands).toBe(MAP_1_1.islands);
    const count = (classId: string) => [...world.ships.values()].filter((s) => s.classId === classId).length;
    expect({ pirate: count('pirate'), gunboat: count(GUNBOAT_CLASS), merchant: count('merchant') }).toEqual({ pirate: 8, gunboat: 4, merchant: 8 });
    const nav = navigatorOf(world);
    const stranded = [...world.ships.values()].filter((s) => !nav.navigable(s.pos, navClearance(s.classId))).map((s) => s.id);
    expect(stranded).toEqual([]);
  });
});

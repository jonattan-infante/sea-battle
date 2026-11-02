// 1.2, piloto del mapa (C1): el mapa del mundo lo decide solo el servidor, con SEA_BATTLE_MAP=1.1 (server/features.ts).
// Sin la variable, que es lo que se despliega, el mundo es el de hoy (MAP_1_0). Con ella, la bienvenida lleva las islas de
// la 1.1 para que el cliente pinte lo que simula el servidor (AC-199 e). Con la 1.1, un escenario de prueba solo arranca si
// todos sus barcos quedan en sitios navegables del mapa (C3)
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { GUNBOAT_CLASS, ISLANDS, MAP_1_0, MAP_1_1, navClearance } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { Welcome } from '../../src/game/types';
import { createWorld, navigatorOf, spawnMerchant } from '../../src/game/world';
import { startGame } from '../bootstrap';
import { mapId, mapOfId } from '../features';
import * as scenarios from '../scenarios';
import { applyScenario, I2_SCENARIOS, SCENARIOS, strandedShips } from '../scenarios';
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

describe('SEA_BATTLE_MAP (1.2, C1)', () => {
  // (i)
  test('solo el valor exacto 1.1 pone el mapa de la 1.1; cualquier otro valor, o ninguno, el de la 1.0', () => {
    expect(mapId({ SEA_BATTLE_MAP: '1.1' })).toBe('1.1');
    for (const v of [undefined, '', '1.0', '1', '11', '1,1', '1.2', ' 1.1', '1.1 ', 'true']) expect({ v, map: mapId({ SEA_BATTLE_MAP: v }) }).toEqual({ v, map: '1.0' });
    expect(mapOfId('1.0')).toBe(MAP_1_0);
    expect(mapOfId('1.1')).toBe(MAP_1_1);
  });
});

describe('arranque con SEA_BATTLE_MAP (server/bootstrap.ts)', () => {
  const ioOnly = () => new Server(createServer());

  // (ii)
  test.each([
    [{}, MAP_1_0, ['Mapa 1.0 (se cambia con SEA_BATTLE_MAP=1.1)'], false],
    [{ SEA_BATTLE_MAP: '' }, MAP_1_0, ['Mapa 1.0 (se cambia con SEA_BATTLE_MAP=1.1)'], false],
    [{ SEA_BATTLE_MAP: '1.0' }, MAP_1_0, ['Mapa 1.0 (se cambia con SEA_BATTLE_MAP=1.1)'], false],
    [{ SEA_BATTLE_MAP: '1.1' }, MAP_1_1, ['Mapa 1.1 (SEA_BATTLE_MAP=1.1): las islas de la 1.1 y los amarres del puerto'], false],
    [{ SEA_BATTLE_MAP: '1.2' }, MAP_1_0, ['Aviso: SEA_BATTLE_MAP=«1.2» no se reconoce: mapa 1.0', 'Mapa 1.0 (se cambia con SEA_BATTLE_MAP=1.1)'], true]
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

  // Escenarios con la 1.1 (C3): todos los de SCENARIOS, sin NPC y con el I2 si lo piden. O arrancan con todos sus barcos en
  // sitios navegables, o no arrancan y el error nombra el escenario, el barco y la posición. Hoy arrancan los 17
  const env = (scenario: string, map?: string) => ({
    SEA_BATTLE_NPCS: '0',
    AUTH_BYPASS: '1',
    SEA_BATTLE_SCENARIO: scenario,
    ...((I2_SCENARIOS as readonly string[]).includes(scenario) ? { SEA_BATTLE_I2: '1' } : {}),
    ...(map ? { SEA_BATTLE_MAP: map } : {})
  });

  test.each([...SCENARIOS])('el escenario "%s" con SEA_BATTLE_MAP=1.1: arranca con sus barcos en sitios navegables, o no arranca y dice dónde', async (scenario) => {
    const server = ioOnly();
    cleanups.push(() => server.close());
    const result = await startGame(server, env(scenario, '1.1')).then(
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

  test.each([...SCENARIOS])('el escenario "%s" sin SEA_BATTLE_MAP arranca con el mapa 1.0, como antes', async (scenario) => {
    const server = ioOnly();
    cleanups.push(() => server.close());
    const { game: g } = await startGame(server, env(scenario));
    cleanups.push(() => g.stop());
    expect(g.world.islands).toBe(MAP_1_0.islands);
  });

  // Hoy los 17 escenarios son navegables con la 1.1, así que ninguno lanza: lo que bootstrap pasa a applyScenario se
  // comprueba aparte, espiando la llamada (la implementación de verdad sigue corriendo)
  test.each([
    ['con SEA_BATTLE_MAP=1.1', true, '1.1'],
    ['sin SEA_BATTLE_MAP', false, undefined]
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

  // (iii)
  test('sin la variable, con NPC, el mundo es idéntico al de hoy: las mismas islas, sin amarres y los mismos barcos en el mismo sitio', async () => {
    const server = ioOnly();
    const { game: g } = await startGame(server, {}, () => {}, { seed: 7, autoStart: false });
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
    ['sin la variable', {}, ISLANDS, 7],
    ['con SEA_BATTLE_MAP=1.1', { SEA_BATTLE_MAP: '1.1' }, MAP_1_1.islands, 50]
  ])('%s, la bienvenida lleva las islas del mapa del servidor', async (_, env, islands, count) => {
    const url = await boot(env);
    const welcome = await welcomeOf(url, 'a');
    expect(welcome.islands).toEqual(islands);
    expect(welcome.islands.length).toBe(count);
  });

  test('con SEA_BATTLE_MAP=1.1, los círculos de la bienvenida son los de ISLAND_SHAPES_1_1, forma a forma', async () => {
    const welcome = await welcomeOf(await boot({ SEA_BATTLE_MAP: '1.1' }), 'a');
    const expected = MAP_1_1.shapes.flatMap((s) => s.circles.map((c, k) => ({ id: s.circles.length > 1 ? `${s.id}.${k}` : s.id, ...c })));
    expect(welcome.islands).toEqual(expected);
  });

  // (v)
  test('con SEA_BATTLE_MAP=1.1 y SEA_BATTLE_I2=1: el I2 y las islas de la 1.1, la población del I2 y ningún NPC en un sitio no navegable', async () => {
    const httpServer = createServer();
    io = new Server(httpServer);
    ({ game } = await startGame(io, { SEA_BATTLE_MAP: '1.1', SEA_BATTLE_I2: '1' }, () => {}, { autoStart: false }));
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

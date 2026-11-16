// E19 y H-1703 por el socket (1.3; GDD §11 y §13): las intenciones `buy` con barco, `buy` de una familia y `selectFamily`,
// con Postgres real, servidor de juego en este proceso y socket.io real. Cada compra o cambio se escribe en la fila antes de
// confirmarse (AC-224 a); cada rechazo, también forjado (AC-68), deja la fila igual byte a byte; la familia viaja en el
// barco de cada jugador (`fa`) a quien lo tiene en su área de interés, solo al cambiar
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { Socket as ClientSocket } from 'socket.io-client';
import { DEATH_COUNTDOWN, DISCONNECT_GRACE, TICK_RATE, upgradePrice } from '../../src/game/constants';
import { C2S } from '../../src/game/protocol';
import { ShipSnapshot } from '../../src/game/types';
import { attack, shipOfPlayer } from '../../src/game/world';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
import { createGameServer, GameServer, GameServerOptions, SNAPSHOT_KEYS } from '../game-server';
import { createPgStore, ProgressStore } from '../persistence';
import { SavedProgress } from '../progress';
import { joinGame, Joined, sleep, waitFor } from './fixtures/game-socket';
import { rowV3 } from './fixtures/progress-rows';
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
const spies: { release: () => void }[] = [];

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
  sockets.splice(0).forEach((c) => c.disconnect());
  spies.splice(0).forEach((s) => s.release());
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
}, 15_000);

// Envoltorio del almacén real: cuenta escrituras y permite retenerlas o hacerlas fallar
function spyStore(inner: ProgressStore) {
  const calls = { save: 0 };
  let gate: Promise<void> | null = null;
  let open = () => {};
  let waiting = 0;
  let failing = false;
  const store: ProgressStore = {
    load: (userId) => inner.load(userId),
    save: async (userId, progress, revision) => {
      calls.save++;
      if (gate) {
        waiting++;
        await gate;
        waiting--;
      }
      if (failing) throw new Error('BD caída (test)');
      return inner.save(userId, progress, revision);
    },
    ping: () => (failing ? Promise.reject(new Error('BD caída (test)')) : inner.ping())
  };
  const spy = {
    store,
    calls,
    hold: () => (gate = new Promise<void>((r) => (open = r))),
    release: () => {
      gate = null;
      failing = false;
      open();
    },
    waiting: () => waiting,
    failSaves: (on: boolean) => (failing = on)
  };
  spies.push(spy);
  return spy;
}

async function startServer(opts: Partial<GameServerOptions> = {}): Promise<ReturnType<typeof spyStore>> {
  const spy = spyStore(createPgStore(pool));
  httpServer = createServer();
  io = new Server(httpServer);
  game = createGameServer(io, { authenticate: testAuth, seed: 11, spawnNpcs: false, store: spy.store, ...opts });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  return spy;
}

const join = (userId: string): Promise<Joined> => joinGame(url, { token: userId }, userId, sockets);
const world = () => game!.world;
const texts = (j: Joined) => j.notices().map((n) => n.text);
const errors = (j: Joined) => j.notices().filter((n) => n.kind === 'error').map((n) => n.text);
const N1 = { cannons: 1, hull: 1, sails: 1 };
const fresh = (over: Partial<SavedProgress> = {}): SavedProgress => ({ gold: 0, xp: 0, ships: { sloop: { ...N1 } }, activeShip: 'sloop', families: [], family: 'none', ...over });

async function seed(userId: string, progress: SavedProgress): Promise<void> {
  await db.admin.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', [userId, rowV3(progress)]);
}

async function stateOf(userId: string): Promise<Record<string, unknown>> {
  return (await db.admin.query('SELECT state FROM player_progress WHERE user_id = $1', [userId])).rows[0].state;
}

// La fila tal cual está en la BD, para compararla byte a byte
async function rawRow(userId: string): Promise<string> {
  const { rows } = await db.admin.query('SELECT state::text AS s, revision::text AS r, updated_at::text AS u FROM player_progress WHERE user_id = $1', [userId]);
  return JSON.stringify(rows);
}

// Los valores de `fa` que este cliente recibió para un barco, en orden (completos y deltas)
const faOf = (j: Joined, shipId: string) => j.frames.flatMap((f) => f.s ?? []).filter((s) => s.id === shipId && s.fa !== undefined).map((s) => s.fa);
const ownSnapshot = (j: Joined) => j.frames.flatMap((f) => f.s ?? []).filter((s): s is ShipSnapshot => s.id === j.welcome.shipId && 'c' in s).at(-1);
const lastOwn = <K extends keyof ShipSnapshot>(j: Joined, key: K) =>
  j.frames
    .flatMap((f) => f.s ?? [])
    .filter((s) => s.id === j.welcome.shipId && s[key] !== undefined)
    .at(-1)?.[key];

test('`fa` está en SNAPSHOT_KEYS: sin él, el cambio de familia no viajaría en el delta (GDD §6, AC-195)', () => {
  expect(SNAPSHOT_KEYS).toContain('fa');
});

describe('AC-222: comprar una familia por el socket', () => {
  test('sin familia y con 4 500, compra la británica: se escribe antes de confirmarse, le quedan 500, y quien lo tiene en su área lo ve en el siguiente frame (de «none» a «gb»), una sola vez', async () => {
    await seed('u-ana', fresh({ gold: 4500 }));
    const spy = await startServer();
    const a = await join('u-ana');
    const b = await join('guest-bbbb0001');
    await waitFor(() => faOf(b, a.welcome.shipId).length > 0, 3000, 'el barco de A en el cliente de B');
    expect(faOf(b, a.welcome.shipId)).toEqual(['none']);

    spy.hold();
    a.c.emit(C2S.buy, { itemId: 'family:gb' });
    await waitFor(() => spy.waiting() === 1, 3000, 'la escritura de la compra');
    await sleep(200); // mientras la escritura está retenida, el servidor sigue enviando frames
    expect([world().players.get('u-ana')!.family, a.me().family, a.me().gold]).toEqual(['none', 'none', 4500]);
    spy.release();
    await waitFor(() => texts(a).includes('Compra realizada'), 3000, 'la confirmación');
    expect(await stateOf('u-ana')).toEqual(rowV3(fresh({ gold: 500, families: ['gb'], family: 'gb' })));
    await waitFor(() => a.me().family === 'gb', 3000, 'la vista con la británica');
    expect([a.me().gold, a.me().families]).toEqual([500, ['gb']]);
    await waitFor(() => faOf(b, a.welcome.shipId).length === 2, 3000, 'el cambio de A en el cliente de B');
    expect(lastOwn(a, 'fa')).toBe('gb');
    await sleep(400); // sin más cambios, no vuelve a viajar (AC-224 c)
    expect(faOf(b, a.welcome.shipId)).toEqual(['none', 'gb']);
  });

  test.each([
    ['con 3 999 de oro', fresh({ gold: 3999 }), { itemId: 'family:gb' }, false, 'Necesitas 4000 de oro'],
    ['fuera de la zona segura', fresh({ gold: 9000 }), { itemId: 'family:gb' }, true, 'El astillero solo abre en el puerto'],
    ['una familia que ya tiene', fresh({ gold: 9000, families: ['gb'], family: 'none' }), { itemId: 'family:gb' }, false, 'Ya tienes esa familia'],
    ['«sin familia», que no se vende', fresh({ gold: 9000 }), { itemId: 'family:none' }, false, null],
    ['una familia desconocida', fresh({ gold: 9000 }), { itemId: 'family:fr' }, false, null],
    ['una familia con barco', fresh({ gold: 9000 }), { itemId: 'family:gb', ship: 'sloop' }, false, null],
    ['una familia con un precio', fresh({ gold: 9000 }), { itemId: 'family:es', price: 0 }, false, null]
  ])('forjada %s: se rechaza sin cambiar el oro ni la familia, y la fila queda igual byte a byte', async (_label, progress, payload, outside, reason) => {
    await seed('u-forja', progress);
    const before = await rawRow('u-forja');
    const spy = await startServer();
    const a = await join('u-forja');
    if (outside) shipOfPlayer(world(), 'u-forja')!.pos = { x: 300, z: 300 };
    a.c.emit(C2S.buy, payload);
    if (reason) await waitFor(() => errors(a).length > 0, 3000, 'el rechazo');
    else await sleep(300); // una intención que no pasa el protocolo se descarta sin respuesta (AC-05)
    expect(errors(a)).toEqual(reason ? [reason] : []);
    expect(texts(a)).not.toContain('Compra realizada');
    const p = world().players.get('u-forja')!;
    expect({ gold: p.gold, families: p.families, family: p.family }).toEqual({ gold: progress.gold, families: progress.families, family: progress.family });
    await game!.flushProgress();
    expect(spy.calls.save).toBe(0);
    expect(await rawRow('u-forja')).toBe(before);
  });
});

describe('AC-223: cambiar de aspecto por el socket', () => {
  test('con las 2 compradas: «sin familia» y la española se escriben antes de aplicarse, los demás lo ven en el siguiente frame, y elegir la que ya usa no escribe nada', async () => {
    await seed('u-cam', fresh({ families: ['gb', 'es'], family: 'gb' }));
    const spy = await startServer();
    const a = await join('u-cam');
    const b = await join('guest-bbbb0002');
    await waitFor(() => faOf(b, a.welcome.shipId).length > 0, 3000, 'el barco de A en el cliente de B');
    expect(faOf(b, a.welcome.shipId)).toEqual(['gb']);

    spy.hold();
    a.c.emit(C2S.selectFamily, { family: 'none' });
    await waitFor(() => spy.waiting() === 1, 3000, 'la escritura del cambio');
    await sleep(150);
    expect(world().players.get('u-cam')!.family).toBe('gb');
    spy.release();
    await waitFor(() => a.me().family === 'none', 3000, 'el cambio a «sin familia»');
    expect(await stateOf('u-cam')).toEqual(rowV3(fresh({ families: ['gb', 'es'], family: 'none' })));
    await waitFor(() => faOf(b, a.welcome.shipId).at(-1) === 'none', 3000, 'el cambio en el cliente de B');

    const saves = spy.calls.save;
    a.c.emit(C2S.selectFamily, { family: 'none' }); // la que ya usa
    await sleep(300);
    await game!.flushProgress();
    expect(spy.calls.save).toBe(saves);
    expect(errors(a)).toEqual([]);

    a.c.emit(C2S.selectFamily, { family: 'es' });
    await waitFor(() => a.me().family === 'es', 3000, 'el cambio a la española');
    expect(await stateOf('u-cam')).toMatchObject({ families: ['gb', 'es'], family: 'es', gold: 0 });
    await waitFor(() => faOf(b, a.welcome.shipId).at(-1) === 'es', 3000, 'la española en el cliente de B');
    expect(faOf(b, a.welcome.shipId)).toEqual(['gb', 'none', 'es']);
  });

  test.each([
    ['una familia que no tiene', { family: 'es' }, false, 'No tienes esa familia'],
    ['fuera de la zona segura', { family: 'none' }, true, 'Solo puedes cambiar de familia en el puerto'],
    ['una familia desconocida', { family: 'fr' }, false, null],
    ['con un campo de más', { family: 'none', free: true }, false, null],
    ['con el id en otro campo', { classId: 'gb' }, false, null]
  ])('forjado %s: se rechaza sin cambios y la fila queda igual byte a byte', async (_label, payload, outside, reason) => {
    await seed('u-dora', fresh({ families: ['gb'], family: 'gb' }));
    const before = await rawRow('u-dora');
    const spy = await startServer();
    const a = await join('u-dora');
    if (outside) shipOfPlayer(world(), 'u-dora')!.pos = { x: 300, z: 300 };
    a.c.emit(C2S.selectFamily, payload);
    if (reason) await waitFor(() => errors(a).length > 0, 3000, 'el rechazo');
    else await sleep(300);
    expect(errors(a)).toEqual(reason ? [reason] : []);
    expect(world().players.get('u-dora')!.family).toBe('gb');
    await game!.flushProgress();
    expect(spy.calls.save).toBe(0);
    expect(await rawRow('u-dora')).toBe(before);
  });
});

describe('AC-213: una mejora para cualquier barco propio, por el socket', () => {
  test('(b) Cañones N2 para la Balandra mientras navega el Bergantín: paga 250, se escribe, y el activo sigue igual (posición, destino, ruta y vida)', async () => {
    await seed('u-eli', fresh({ gold: 2000, ships: { sloop: { ...N1 }, brig: { ...N1 } }, activeShip: 'brig' }));
    await startServer({ autoStart: false });
    const a = await join('u-eli');
    a.c.emit(C2S.moveTo, { x: 20, z: 60 });
    await waitFor(() => !!shipOfPlayer(world(), 'u-eli')!.destination, 3000, 'el destino');
    const ship = shipOfPlayer(world(), 'u-eli')!;
    ship.hp = 1000;
    const before = JSON.stringify({ pos: ship.pos, heading: ship.heading, destination: ship.destination, path: ship.path, hp: ship.hp, maxHp: ship.maxHp, classId: ship.classId });
    a.c.emit(C2S.buy, { itemId: 'cannons:2', ship: 'sloop' });
    await waitFor(() => world().players.get('u-eli')!.ships.sloop?.cannons === 2, 3000, 'la mejora aplicada');
    expect(JSON.stringify({ pos: ship.pos, heading: ship.heading, destination: ship.destination, path: ship.path, hp: ship.hp, maxHp: ship.maxHp, classId: ship.classId })).toBe(before);
    expect(await stateOf('u-eli')).toEqual(rowV3(fresh({ gold: 2000 - upgradePrice('sloop', 'cannons', 2), ships: { sloop: { cannons: 2, hull: 1, sails: 1 }, brig: { ...N1 } }, activeShip: 'brig' })));
    expect(world().players.get('u-eli')!.activeShip).toBe('brig');
  });

  test.each([
    ['para un barco que no tiene', { itemId: 'cannons:2', ship: 'frigate' }, null, 'No tienes ese barco'],
    ['N3 sin N2 en el barco elegido, aunque otro tenga N2', { itemId: 'cannons:3', ship: 'sloop' }, null, 'Primero necesitas el nivel anterior'],
    ['sin el barco en la intención', { itemId: 'cannons:2' }, null, null],
    ['con un barco que no es del jugador ni una clase suya', { itemId: 'cannons:2', ship: 'pirate' }, null, null],
    ['con el barco como lista', { itemId: 'cannons:2', ship: ['sloop'] }, null, null],
    ['con el activo fuera del puerto, para otro barco', { itemId: 'cannons:2', ship: 'sloop' }, 'outside', 'El astillero solo abre en el puerto'],
    ['con el activo hundido, para otro barco', { itemId: 'cannons:2', ship: 'sloop' }, 'sinking', 'Tu barco no está a flote']
  ])('(d) forjada %s: se rechaza sin cambiar el oro ni ningún nivel, y la fila queda igual byte a byte', async (_label, payload, ship, reason) => {
    await seed('u-fer', fresh({ gold: 5000, ships: { sloop: { ...N1 }, brig: { cannons: 2, hull: 1, sails: 1 } }, activeShip: 'brig' }));
    const before = await rawRow('u-fer');
    const spy = await startServer();
    const a = await join('u-fer');
    const own = shipOfPlayer(world(), 'u-fer')!;
    if (ship === 'outside') own.pos = { x: 300, z: 300 };
    if (ship === 'sinking') own.state = 'sinking';
    a.c.emit(C2S.buy, payload);
    if (reason) await waitFor(() => errors(a).length > 0, 3000, 'el rechazo');
    else await sleep(300);
    expect(errors(a)).toEqual(reason ? [reason] : []);
    const p = world().players.get('u-fer')!;
    expect({ gold: p.gold, ships: p.ships, active: p.activeShip }).toEqual({ gold: 5000, ships: { sloop: N1, brig: { cannons: 2, hull: 1, sails: 1 } }, active: 'brig' });
    own.state = 'alive'; // para que el cierre escriba lo normal: no hay nada que escribir
    await game!.flushProgress();
    expect(spy.calls.save).toBe(0);
    expect(await rawRow('u-fer')).toBe(before);
  });
});

describe('AC-212 y AC-215 por el socket: los niveles son del barco al cambiar, al zarpar y al comprar uno nuevo', () => {
  test('AC-212: selectShip cambia la vida máxima a la del Casco de cada barco, y al zarpar sale el mismo barco con sus niveles', async () => {
    const ships = { sloop: { cannons: 3, hull: 1, sails: 2 }, brig: { cannons: 1, hull: 3, sails: 1 } };
    await seed('u-gil', fresh({ ships, activeShip: 'sloop' }));
    await startServer({ autoStart: false });
    const a = await join('u-gil');
    expect(ownSnapshot(a)).toMatchObject({ c: 'sloop', mhp: 800 });
    a.c.emit(C2S.selectShip, { classId: 'brig' });
    await waitFor(() => world().players.get('u-gil')!.activeShip === 'brig', 3000, 'el cambio al Bergantín');
    game!.tick();
    game!.tick();
    await waitFor(() => lastOwn(a, 'mhp') === 1960, 3000, 'la vida máxima del Bergantín con Casco N3');
    expect(await stateOf('u-gil')).toEqual(rowV3(fresh({ ships, activeShip: 'brig' })));

    // Se hunde fuera del puerto y zarpa
    const own = shipOfPlayer(world(), 'u-gil')!;
    own.pos = { x: 300, z: 300 };
    own.protectedUntil = 0;
    own.hp = 1;
    await join('guest-cccc0003');
    const killer = shipOfPlayer(world(), 'guest-cccc0003')!;
    killer.pos = { x: 300, z: 340 };
    killer.protectedUntil = 0;
    world().rng = () => 0;
    expect(attack(world(), 'guest-cccc0003', own.id).ok).toBe(true);
    for (let i = 0; i < (DEATH_COUNTDOWN + 3) * TICK_RATE; i++) game!.tick();
    expect(world().players.get('u-gil')!.death).not.toBeNull();
    a.c.emit(C2S.respawn);
    await waitFor(() => own.state === 'alive', 3000, 'zarpar');
    expect([own.classId, own.maxHp, own.hp]).toEqual(['brig', 1960, 1960]);
    expect(world().players.get('u-gil')!.ships).toEqual(ships);
  });

  test('AC-215: con el Bergantín a N3 y 6 000, compra la Fragata: activa, con la vida llena (2 200) y a nivel 1; el Bergantín conserva sus N3', async () => {
    const N3 = { cannons: 3, hull: 3, sails: 3 };
    await seed('u-hal', fresh({ gold: 6000, ships: { sloop: { ...N1 }, brig: { ...N3 } }, activeShip: 'brig' }));
    await startServer();
    const a = await join('u-hal');
    a.c.emit(C2S.buy, { itemId: 'ship:frigate' });
    await waitFor(() => texts(a).includes('Compra realizada'), 3000, 'la compra de la Fragata');
    await waitFor(() => a.me().activeShip === 'frigate', 3000, 'la vista con la Fragata');
    expect(a.me().ships).toEqual({ sloop: N1, brig: N3, frigate: N1 });
    await waitFor(() => lastOwn(a, 'mhp') === 2200, 3000, 'la vida máxima de la Fragata a nivel 1');
    expect(lastOwn(a, 'hp')).toBe(2200);
    expect(await stateOf('u-hal')).toEqual(rowV3(fresh({ gold: 0, ships: { sloop: N1, brig: N3, frigate: N1 }, activeShip: 'frigate' })));
  });
});

describe('AC-224: la familia va en la cuenta', () => {
  test('(a) si la escritura falla, no se cobra ni cambia nada, y sale el aviso de error; (b) con la BD caída, comprar y elegir se rechazan sin escribir', async () => {
    await seed('u-ines', fresh({ gold: 8000, families: ['gb'], family: 'gb' }));
    const before = await rawRow('u-ines');
    const spy = await startServer();
    const a = await join('u-ines');
    spy.failSaves(true);
    a.c.emit(C2S.buy, { itemId: 'family:es' });
    await waitFor(() => errors(a).length === 1, 3000, 'el rechazo de la compra');
    expect(errors(a)).toEqual(['La tienda no está disponible: no podemos guardar']);
    const p = world().players.get('u-ines')!;
    expect({ gold: p.gold, families: p.families, family: p.family }).toEqual({ gold: 8000, families: ['gb'], family: 'gb' });

    // La BD sigue caída: la persistencia está degradada y ni compra ni cambio llegan a escribir
    const saves = spy.calls.save;
    a.c.emit(C2S.selectFamily, { family: 'none' });
    a.c.emit(C2S.buy, { itemId: 'family:es' });
    await waitFor(() => errors(a).length === 3, 3000, 'los dos rechazos');
    expect(errors(a).slice(1)).toEqual(['La tienda no está disponible: no podemos guardar', 'La tienda no está disponible: no podemos guardar']);
    expect(spy.calls.save).toBe(saves);
    expect({ gold: p.gold, families: p.families, family: p.family }).toEqual({ gold: 8000, families: ['gb'], family: 'gb' });
    spy.release();
    expect(await rawRow('u-ines')).toBe(before);
  });

  test('(e) el invitado la compra con el oro de su sesión, sin escribir nada, y al volver tras salir de la memoria está otra vez sin familia', async () => {
    const spy = await startServer({ autoStart: false });
    const g = await join('guest-dddd0004');
    world().players.get('guest-dddd0004')!.gold = 4000;
    g.c.emit(C2S.buy, { itemId: 'family:es' });
    await waitFor(() => (game!.tick(), texts(g).includes('Compra realizada')), 3000, 'la compra del invitado'); // sin bucle propio: cada vuelta, un tick
    expect([g.me().gold, g.me().families, g.me().family]).toEqual([0, ['es'], 'es']);
    g.c.disconnect();
    await sleep(50);
    for (let i = 0; i < (DISCONNECT_GRACE + 1) * TICK_RATE; i++) game!.tick();
    expect(world().players.has('guest-dddd0004')).toBe(false);
    const again = await join('guest-dddd0004');
    expect([again.me().gold, again.me().families, again.me().family]).toEqual([100, [], 'none']);
    await game!.flushProgress();
    expect(spy.calls.save).toBe(0);
    expect((await db.admin.query('SELECT count(*)::int AS n FROM player_progress')).rows[0].n).toBe(0);
  });
});

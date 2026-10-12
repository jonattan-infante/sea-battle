// Progreso guardado en Postgres real (AC-97, AC-129, AC-130): servidor de juego en este proceso, socket.io real y un
// schema propio para este archivo. «Reiniciar» es un servidor nuevo, con el mundo vacío, sobre la misma BD
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { Socket as ClientSocket } from 'socket.io-client';
import { DISCONNECT_GRACE, SHIP_CLASSES, TICK_RATE, UPGRADE_LEVELS } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { Notice, PlayerView } from '../../src/game/types';
import { isInSafeZone, shipOfPlayer } from '../../src/game/world';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
import { createGameServer, GameServer, GameServerOptions } from '../game-server';
import { createPgStore, ProgressStore } from '../persistence';
import { SavedProgress } from '../progress';
import { joinGame, Joined, sleep, waitFor } from './fixtures/game-socket';
import { createTestDb, TestDb } from './pg/test-db';

// Identidad de prueba: el token es el userId; los que empiezan por guest- son invitados
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
  await stopServer();
}, 15_000);

async function startServer(opts: Partial<GameServerOptions> = {}): Promise<void> {
  httpServer = createServer();
  io = new Server(httpServer);
  game = createGameServer(io, { authenticate: testAuth, seed: 11, spawnNpcs: false, store: createPgStore(pool), ...opts });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
}

// Cierra los sockets, espera a que se escriba lo pendiente y para el servidor. Si un test falla con una escritura
// retenida, la suelta: si no, la cola no se vaciaría, el servidor seguiría abierto y Jest no terminaría
async function stopServer(): Promise<void> {
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
}

async function restart(opts: Partial<GameServerOptions> = {}): Promise<void> {
  await stopServer();
  await startServer(opts);
}

const join = (userId: string, name = userId): Promise<Joined> => joinGame(url, { token: userId }, name, sockets);
const world = () => game!.world;

const SLOOP_ONLY: SavedProgress = { gold: 100, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop' };
const fields = (v: PlayerView): SavedProgress => ({ gold: v.gold, upgrades: v.upgrades, ownedShips: v.ownedShips, activeShip: v.activeShip });

async function seed(userId: string, progress: SavedProgress): Promise<void> {
  await db.admin.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', [userId, { v: 1, ...progress }]);
}

async function rowOf(userId: string): Promise<{ state: Record<string, unknown>; revision: number; raw: string } | null> {
  const { rows } = await db.admin.query('SELECT state, state::text AS raw, revision FROM player_progress WHERE user_id = $1', [userId]);
  return rows[0] ? { state: rows[0].state, raw: rows[0].raw, revision: Number(rows[0].revision) } : null;
}

const texts = (j: Joined) => j.notices().map((n) => n.text);
const bought = (j: Joined) => texts(j).filter((t) => t === 'Compra realizada').length;

// Envoltorio del almacén real: cuenta llamadas y permite retener o hacer fallar las escrituras
function spyStore(inner: ProgressStore) {
  const calls = { load: 0, save: 0 };
  let gate: Promise<void> | null = null;
  let open = () => {};
  let waiting = 0;
  let failing = false;
  const store: ProgressStore = {
    load: (userId) => {
      calls.load++;
      return inner.load(userId);
    },
    save: async (userId, progress, revision) => {
      calls.save++;
      if (gate) {
        waiting++;
        await gate;
        waiting--;
      }
      if (failing) throw new Error('BD caída (test)');
      return inner.save(userId, progress, revision);
    }
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

describe('AC-97: recargar devuelve el mismo oro, mejoras y barcos; el invitado vuelve a 100', () => {
  test('un usuario de Clerk que acaba con 750 de oro, Cañones N2 y un Bergantín recupera exactamente eso tras reiniciar el servidor', async () => {
    const prices = UPGRADE_LEVELS.cannons.prices[1] + SHIP_CLASSES.brig.price;
    await seed('u-ana', { ...SLOOP_ONLY, gold: 750 + prices });
    await startServer();
    const a = await join('u-ana');
    a.c.emit(C2S.buy, { itemId: 'cannons:2' });
    await waitFor(() => bought(a) === 1, 3000, 'la compra de Cañones N2');
    a.c.emit(C2S.buy, { itemId: 'ship:brig' });
    await waitFor(() => bought(a) === 2, 3000, 'la compra del Bergantín');
    const expected: SavedProgress = { gold: 750, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig' };
    await waitFor(() => JSON.stringify(fields(a.me())) === JSON.stringify(expected), 3000, 'la vista con las dos compras');

    await restart();
    const again = await join('u-ana');
    expect(fields(again.me())).toEqual(expected);
  });

  test('un invitado vuelve a 100 de oro tras reiniciar', async () => {
    await startServer();
    await join('guest-abc12345');
    world().players.get('guest-abc12345')!.gold = 750;
    await restart();
    const again = await join('guest-abc12345');
    expect(fields(again.me())).toEqual(SLOOP_ONLY);
  });
});

describe('AC-129: el progreso sobrevive a un reinicio', () => {
  test('recupera oro, mejoras, barcos y barco activo; aparece en el puerto con la vida llena (vida y posición no se guardan)', async () => {
    const saved: SavedProgress = { gold: 1234, upgrades: { cannons: 3, hull: 2, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate' };
    await seed('u-bea', saved);
    await startServer();
    const b = await join('u-bea');
    expect(fields(b.me())).toEqual(saved);
    expect(shipOfPlayer(world(), 'u-bea')!.classId).toBe('frigate');

    // En partida: gana oro, pierde vida y sale del puerto
    world().players.get('u-bea')!.gold += 40;
    const ship = shipOfPlayer(world(), 'u-bea')!;
    ship.hp = Math.round(ship.maxHp / 3);
    ship.pos = { x: 300, z: 300 };

    await restart();
    const again = await join('u-bea');
    expect(fields(again.me())).toEqual({ ...saved, gold: 1274 });
    const fresh = shipOfPlayer(world(), 'u-bea')!;
    expect(fresh.classId).toBe('frigate');
    expect(fresh.hp).toBe(fresh.maxHp);
    expect(isInSafeZone(fresh.pos)).toBe(true);
  });

  test('un usuario nuevo empieza con 100 de oro y la Balandra, y su fila se escribe', async () => {
    await startServer();
    const n = await join('u-nuevo');
    expect(fields(n.me())).toEqual(SLOOP_ONLY);
    await game!.flushProgress();
    expect((await rowOf('u-nuevo'))?.state).toEqual({ v: 1, ...SLOOP_ONLY });
  });

  test('un invitado no escribe nada en la BD (0 filas) aunque gane oro, compre y salga', async () => {
    const spy = spyStore(createPgStore(pool));
    await startServer({ store: spy.store });
    const g = await join('guest-zz123456');
    world().players.get('guest-zz123456')!.gold = 5000;
    g.c.emit(C2S.buy, { itemId: 'cannons:2' });
    await waitFor(() => bought(g) === 1, 3000, 'la compra del invitado');
    g.c.disconnect();
    await sleep(50);
    await game!.flushProgress();
    expect(spy.calls).toEqual({ load: 0, save: 0 });
    expect((await db.admin.query('SELECT count(*)::int AS n FROM player_progress')).rows[0].n).toBe(0);
  });

  test('la fila es la del userId de la identidad verificada, no la del nombre que manda el cliente', async () => {
    await seed('u-carla', { ...SLOOP_ONLY, gold: 111 });
    await seed('u-otro', { ...SLOOP_ONLY, gold: 999 });
    await startServer();
    const c = await join('u-carla', 'u-otro');
    expect(c.me().gold).toBe(111);
    world().players.get('u-carla')!.gold = 222;
    await game!.flushProgress();
    expect((await rowOf('u-carla'))!.state.gold).toBe(222);
    expect((await rowOf('u-otro'))!.state.gold).toBe(999);
  });
});

describe('AC-129: pasados más de 10 s desde la desconexión, el progreso se lee de la BD, no de la memoria', () => {
  // Reloj de la simulación a mano (autoStart: false): los 10 s de AC-96 pasan en un instante
  const advance = async (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) game!.tick();
    await sleep(20);
  };

  test('si la fila cambia durante la ausencia, al volver el jugador ve el valor de la BD', async () => {
    await seed('u-kai', SLOOP_ONLY);
    await startServer({ autoStart: false });
    const k = await join('u-kai');
    world().players.get('u-kai')!.gold = 300;
    k.c.disconnect();
    await waitFor(async () => (await rowOf('u-kai'))!.state.gold === 300, 1000, 'la escritura al desconectar');
    await db.admin.query('UPDATE player_progress SET state = $2, revision = revision + 1 WHERE user_id = $1', ['u-kai', { v: 1, ...SLOOP_ONLY, gold: 4321 }]);
    await advance(DISCONNECT_GRACE + 0.5);
    expect(world().players.has('u-kai')).toBe(false);
    const again = await join('u-kai');
    expect(again.me().gold).toBe(4321);
  });

  test('antes de los 10 s vuelve con lo que hay en memoria (el mismo barco, AC-96)', async () => {
    await seed('u-lu', SLOOP_ONLY);
    await startServer({ autoStart: false });
    const l = await join('u-lu');
    world().players.get('u-lu')!.gold = 300;
    l.c.disconnect();
    await waitFor(async () => (await rowOf('u-lu'))!.state.gold === 300, 1000, 'la escritura al desconectar');
    await advance(DISCONNECT_GRACE - 2);
    const again = await join('u-lu');
    expect(again.welcome.shipId).toBe(l.welcome.shipId);
    expect(again.me().gold).toBe(300);
  });

  test('el invitado que vuelve pasados más de 10 s tiene 100 de oro', async () => {
    await startServer({ autoStart: false });
    const g = await join('guest-kk123456');
    world().players.get('guest-kk123456')!.gold = 750;
    g.c.disconnect();
    await sleep(50);
    await advance(DISCONNECT_GRACE + 0.5);
    const again = await join('guest-kk123456');
    expect(again.me().gold).toBe(100);
  });

  test('mientras su estado no esté escrito, el jugador sigue en memoria; sale en cuanto queda escrito', async () => {
    await seed('u-max', SLOOP_ONLY);
    const spy = spyStore(createPgStore(pool));
    await startServer({ autoStart: false, store: spy.store });
    const m = await join('u-max');
    world().players.get('u-max')!.gold = 300;
    spy.hold();
    m.c.disconnect();
    await waitFor(() => spy.waiting() === 1, 1000, 'la escritura al desconectar');
    await advance(DISCONNECT_GRACE + 0.5);
    expect(world().players.get('u-max')?.gold).toBe(300); // el barco ya no está, pero el oro no se ha escrito
    spy.release();
    await waitFor(async () => (await rowOf('u-max'))!.state.gold === 300, 1000, 'la escritura');
    await advance(0.1);
    expect(world().players.has('u-max')).toBe(false);
  });

  test('si la escritura al desconectar falla, el estado sigue en memoria, se reintenta y sale cuando queda escrito', async () => {
    await seed('u-nil', SLOOP_ONLY);
    const spy = spyStore(createPgStore(pool));
    await startServer({ autoStart: false, store: spy.store, saveIntervalMs: 100 });
    const n = await join('u-nil');
    world().players.get('u-nil')!.gold = 300;
    spy.failSaves(true);
    n.c.disconnect();
    await waitFor(() => spy.calls.save >= 1, 1000, 'el intento al desconectar');
    await advance(DISCONNECT_GRACE + 0.5);
    expect(world().players.get('u-nil')?.gold).toBe(300);
    spy.failSaves(false);
    await waitFor(async () => (await rowOf('u-nil'))!.state.gold === 300, 2000, 'el reintento');
    await advance(0.1);
    expect(world().players.has('u-nil')).toBe(false);
    const again = await join('u-nil');
    expect(again.me().gold).toBe(300);
  });
});

describe('AC-130: cuándo se escribe', () => {
  test('(a) una compra solo se confirma después de quedar escrita en la BD', async () => {
    await seed('u-dani', { ...SLOOP_ONLY, gold: 2000 });
    const spy = spyStore(createPgStore(pool));
    await startServer({ store: spy.store });
    const d = await join('u-dani');
    spy.hold();
    d.c.emit(C2S.buy, { itemId: 'ship:brig' });
    await waitFor(() => spy.waiting() === 1, 3000, 'la escritura de la compra');
    await sleep(300); // mientras la escritura está retenida, el servidor sigue enviando frames
    expect(texts(d)).not.toContain('Compra realizada');
    expect(fields(d.me())).toEqual({ ...SLOOP_ONLY, gold: 2000 });
    expect(world().players.get('u-dani')!.ownedShips).toEqual(['sloop']);
    expect((await rowOf('u-dani'))!.state.ownedShips).toEqual(['sloop']);

    spy.release();
    await waitFor(() => bought(d) === 1, 3000, 'la confirmación');
    const brig: SavedProgress = { gold: 0, upgrades: SLOOP_ONLY.upgrades, ownedShips: ['sloop', 'brig'], activeShip: 'brig' };
    expect((await rowOf('u-dani'))!.state).toEqual({ v: 1, ...brig });
    await waitFor(() => d.me().activeShip === 'brig', 3000, 'la vista con el Bergantín');
    expect(fields(d.me())).toEqual(brig);
  });

  test('(a) si la escritura falla, la compra se rechaza y no cambia nada, ni en el mundo ni en la BD', async () => {
    await seed('u-eva', { ...SLOOP_ONLY, gold: 2000 });
    const spy = spyStore(createPgStore(pool));
    await startServer({ store: spy.store });
    const e = await join('u-eva');
    const before = await rowOf('u-eva');
    spy.failSaves(true);
    e.c.emit(C2S.buy, { itemId: 'ship:brig' });
    await waitFor(() => e.notices().some((n: Notice) => n.kind === 'error'), 3000, 'el rechazo');
    expect(texts(e)).toContain('La tienda no está disponible: no podemos guardar');
    expect(texts(e)).not.toContain('Compra realizada');
    const player = world().players.get('u-eva')!;
    expect({ gold: player.gold, owned: player.ownedShips, active: player.activeShip }).toEqual({ gold: 2000, owned: ['sloop'], active: 'sloop' });
    expect(await rowOf('u-eva')).toEqual(before);
  });

  test('(a) el cambio de barco también se confirma solo después de escribirlo', async () => {
    await seed('u-fede', { ...SLOOP_ONLY, gold: 0, ownedShips: ['sloop', 'brig'] });
    const spy = spyStore(createPgStore(pool));
    await startServer({ store: spy.store });
    const f = await join('u-fede');
    spy.hold();
    f.c.emit(C2S.selectShip, { classId: 'brig' });
    await waitFor(() => spy.waiting() === 1, 3000, 'la escritura del cambio de barco');
    await sleep(200);
    expect(shipOfPlayer(world(), 'u-fede')!.classId).toBe('sloop');
    expect(f.me().activeShip).toBe('sloop');
    spy.release();
    await waitFor(() => f.me().activeShip === 'brig', 3000, 'el cambio de barco');
    expect(shipOfPlayer(world(), 'u-fede')!.classId).toBe('brig');
    expect((await rowOf('u-fede'))!.state.activeShip).toBe('brig');
  });

  test('(a) con una compra pendiente, otra compra o un cambio de barco se rechazan con «Compra en curso»', async () => {
    await seed('u-gala', { ...SLOOP_ONLY, gold: 5000, ownedShips: ['sloop', 'frigate'] });
    const spy = spyStore(createPgStore(pool));
    await startServer({ store: spy.store });
    const g = await join('u-gala');
    spy.hold();
    g.c.emit(C2S.buy, { itemId: 'cannons:2' });
    await waitFor(() => spy.waiting() === 1, 3000, 'la primera compra');
    g.c.emit(C2S.buy, { itemId: 'hull:2' });
    g.c.emit(C2S.selectShip, { classId: 'frigate' });
    await waitFor(() => texts(g).filter((t) => t === 'Compra en curso').length === 2, 3000, 'los dos rechazos');
    spy.release();
    await waitFor(() => bought(g) === 1, 3000, 'la primera compra');
    await sleep(100);
    const player = world().players.get('u-gala')!;
    expect(player.upgrades).toEqual({ cannons: 2, hull: 1, sails: 1 });
    expect(player.activeShip).toBe('sloop');
    expect(spy.calls.save).toBe(1);
  });

  test('(b) un cambio de oro queda escrito en ≤ 5 s sin que el jugador haga nada más', async () => {
    await seed('u-gus', SLOOP_ONLY);
    await startServer(); // guardado periódico por defecto, con su temporizador real
    await join('u-gus');
    world().players.get('u-gus')!.gold = 345;
    const t0 = Date.now();
    await waitFor(async () => (await rowOf('u-gus'))!.state.gold === 345, 5000, 'el oro en la BD');
    expect(Date.now() - t0).toBeLessThanOrEqual(5000);
  }, 10_000);

  test('(c) al desconectarse, el estado se escribe en ese momento, sin esperar al guardado periódico ni a los 10 s del barco', async () => {
    await seed('u-hugo', SLOOP_ONLY);
    await startServer({ saveIntervalMs: 60_000 });
    const h = await join('u-hugo');
    world().players.get('u-hugo')!.gold = 678;
    await sleep(300);
    expect((await rowOf('u-hugo'))!.state.gold).toBe(100); // el guardado periódico (60 s aquí) aún no pasó
    const t0 = Date.now();
    h.c.disconnect();
    await waitFor(async () => (await rowOf('u-hugo'))!.state.gold === 678, 1000, 'el oro escrito al desconectar');
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(shipOfPlayer(world(), 'u-hugo')).toBeDefined(); // el barco sigue en el mundo (AC-96)
  });
});

describe('cero tráfico en reposo, también hacia la BD', () => {
  test('sin cambios no se escribe nada; un cambio de oro, una escritura', async () => {
    await seed('u-ines', SLOOP_ONLY);
    const spy = spyStore(createPgStore(pool));
    await startServer({ store: spy.store, saveIntervalMs: 50 });
    await join('u-ines');
    await sleep(500); // 10 guardados periódicos sin cambios
    expect(spy.calls.save).toBe(0);
    world().players.get('u-ines')!.gold = 101;
    await sleep(300);
    expect(spy.calls.save).toBe(1);
  });
});

describe('revisión: nunca se pisa un estado más nuevo escrito por otro proceso', () => {
  test('si la fila cambió por detrás, no se sobrescribe; el jugador sale con el aviso y al volver carga lo nuevo', async () => {
    await seed('u-juan', SLOOP_ONLY);
    await startServer({ saveIntervalMs: 60_000 });
    const j = await join('u-juan');
    const kicked = new Promise<Notice>((resolve) => j.c.once(S2C.kicked, resolve));
    const newer: SavedProgress = { ...SLOOP_ONLY, gold: 9999 };
    await db.admin.query('UPDATE player_progress SET state = $2, revision = revision + 1 WHERE user_id = $1', ['u-juan', { v: 1, ...newer }]);
    world().players.get('u-juan')!.gold = 150;
    await game!.flushProgress();
    expect((await rowOf('u-juan'))!.state.gold).toBe(9999);
    await kicked;
    await waitFor(() => !world().players.has('u-juan'), 1000, 'que el jugador salga del mundo');
    const again = await join('u-juan');
    expect(fields(again.me())).toEqual(newer);
  });
});

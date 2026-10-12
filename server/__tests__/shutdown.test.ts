// AC-129: un redeploy llega como SIGTERM y no se pierde nada. El servidor (proceso hijo real, con el mismo apagado que
// server/index.ts) escribe el progreso de todos y solo después cierra las conexiones. La BD va detrás de un proxy que
// retrasa lo que le llega: si el servidor cerrara antes de escribir, el cliente vería la desconexión con la fila aún vieja
import { Pool } from 'pg';
import { Socket as ClientSocket } from 'socket.io-client';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
import { SavedProgress } from '../progress';
import type { GameServer } from '../game-server';
import { createShutdown, SHUTDOWN_FLUSH_MS } from '../shutdown';
import { GameChild, startGameChild } from './fixtures/game-child';
import { joinGame } from './fixtures/game-socket';
import { PgProxy, startPgProxy } from './fixtures/pg-proxy';
import { createTestDb, TestDb } from './pg/test-db';

jest.setTimeout(60_000);

let db: TestDb;
let proxy: PgProxy;
const children: GameChild[] = [];
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  db = await createTestDb();
  const pool: Pool = createPool(db.url);
  await migrate(pool);
  await pool.end();
});

afterAll(async () => {
  await db?.drop();
});

beforeEach(async () => {
  await db.admin.query('TRUNCATE player_progress');
  proxy = await startPgProxy(db.url);
});

afterEach(async () => {
  sockets.splice(0).forEach((c) => c.disconnect());
  await Promise.all(children.splice(0).map((c) => c.kill('SIGKILL')));
  await proxy.close();
});

// Sin guardado periódico (60 s): lo único que puede escribir el oro es el apagado
async function start(): Promise<GameChild> {
  const child = await startGameChild({ DATABASE_URL: proxy.url, TEST_SAVE_INTERVAL_MS: '60000' });
  children.push(child);
  return child;
}

const SLOOP_ONLY: SavedProgress = { gold: 100, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop' };
const seed = (userId: string, progress: SavedProgress) => db.admin.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', [userId, { v: 1, ...progress }]);
const goldOf = async (userId: string) => (await db.admin.query('SELECT state FROM player_progress WHERE user_id = $1', [userId])).rows[0]?.state.gold;

test('SIGTERM: escribe el estado de todos los jugadores y solo después desconecta; sale con 0 y al volver el estado está', async () => {
  await seed('test-ana', SLOOP_ONLY);
  await seed('test-bea', { ...SLOOP_ONLY, gold: 300 });
  const child = await start();
  const a = await joinGame(child.url, { testUser: 'ana' }, undefined, sockets);
  await joinGame(child.url, { testUser: 'bea' }, undefined, sockets);
  expect(await child.addGold('test-ana', 250)).toBe(true);
  expect(await child.addGold('test-bea', 50)).toBe(true);
  expect([await goldOf('test-ana'), await goldOf('test-bea')]).toEqual([100, 300]); // aún sin escribir

  proxy.delay(400); // cada escritura tarda ≥ 400 ms en llegar a la BD
  const atDisconnect = new Promise<number[]>((resolve) => a.c.once('disconnect', async () => resolve([await goldOf('test-ana'), await goldOf('test-bea')])));
  const t0 = Date.now();
  const exited = child.kill('SIGTERM');
  const rows = await atDisconnect;
  console.log(`AC-129 (SIGTERM): desconexión a los ${Date.now() - t0} ms con las filas en ${rows.join(' y ')}`);
  expect(rows).toEqual([350, 350]);
  expect(await exited).toEqual({ code: 0, signal: null });
  expect(child.output()).toContain('Progreso guardado');
  // H-25: el proceso real escribe su propia hora (ISO con ms) y los ms desde la señal, en orden
  console.log(`H-25 (SIGTERM): ${child.output().split('\n').filter((l) => /^(🛑|💾|🔌)/u.test(l)).join(' · ')}`);
  const iso = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z';
  expect(child.output()).toMatch(
    new RegExp(`🛑 SIGTERM: guardando el progreso antes de cerrar ${iso}\\n[\\s\\S]*💾 Progreso guardado ${iso} \\(\\+\\d+ ms\\)\\n[\\s\\S]*🔌 Sockets cerrados ${iso} \\(\\+\\d+ ms\\)\\n`)
  );

  proxy.delay(0);
  const again = await start();
  const back = await joinGame(again.url, { testUser: 'ana' }, undefined, sockets);
  expect(back.me().gold).toBe(350);
});

describe('orden del apagado (createShutdown)', () => {
  // Dobles mínimos: registran el orden en que se llama a cada pieza y lo que se loguea; onClose corre al cerrar io
  function harness(flush: () => Promise<boolean>, opts: { now?: () => number; onClose?: () => void } = {}) {
    const order: string[] = [];
    const lines: string[] = [];
    const game = { stop: () => order.push('stop'), flushProgress: () => flush().then((ok) => (order.push(ok ? 'flush' : 'flush-fallido'), ok)) } as unknown as GameServer;
    const io = { close: (cb: () => void) => (order.push('io.close'), opts.onClose?.(), cb()) } as never;
    const httpServer = { close: () => order.push('http.close') } as never;
    const pool = { end: async () => void order.push('pool.end') } as never;
    let resolveExit: (code: number) => void = () => {};
    const exited = new Promise<number>((r) => (resolveExit = r));
    const log = (msg: string) => void lines.push(msg);
    const shutdown = createShutdown({ game, io, httpServer, pool, log, exit: (code) => (order.push(`exit ${code}`), resolveExit(code)), flushTimeoutMs: 200, now: opts.now });
    return { order, lines, shutdown, exited };
  }

  // H-25: N se mide en el servidor, del cambio de /healthz a «💾 Progreso guardado», con la hora del propio proceso; los
  // sellos de Railway llegan en lote. Los prefijos no cambian: los buscan QA y scripts/railway/check_deploy.py
  test('cada paso del apagado lleva la hora del proceso (ISO con ms) y los ms desde la señal: 🛑, 💾 y 🔌, en ese orden', async () => {
    let clock = Date.parse('2026-10-12T18:20:37.500Z');
    const h = harness(
      async () => {
        clock += 120; // la escritura
        return true;
      },
      { now: () => clock, onClose: () => (clock += 35) } // el cierre de los sockets
    );
    await h.shutdown('SIGTERM');
    expect(h.lines).toEqual([
      '🛑 SIGTERM: guardando el progreso antes de cerrar 2026-10-12T18:20:37.500Z',
      '💾 Progreso guardado 2026-10-12T18:20:37.620Z (+120 ms)',
      '🔌 Sockets cerrados 2026-10-12T18:20:37.655Z (+155 ms)'
    ]);
  });

  test('si la escritura no llega en su plazo, el aviso también lleva la hora y los ms', async () => {
    const h = harness(() => new Promise<boolean>(() => {}));
    await h.shutdown('SIGTERM');
    expect(h.lines[1]).toMatch(/^⚠️ {2}El progreso no se pudo guardar en 200 ms \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \(\+\d+ ms\)$/);
    expect(h.lines[2]).toMatch(/^🔌 Sockets cerrados /);
  });

  test('para la simulación, escribe y solo después cierra las conexiones; sale con 0', async () => {
    const h = harness(async () => true);
    await h.shutdown('SIGTERM');
    expect(h.order).toEqual(['stop', 'flush', 'io.close', 'http.close', 'pool.end', 'exit 0']);
  });

  test('si la escritura no termina en su plazo, cierra igualmente (antes del SIGKILL de Railway)', async () => {
    const h = harness(() => new Promise<boolean>(() => {}));
    const t0 = Date.now();
    await h.shutdown('SIGTERM');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(190);
    expect(h.order).toEqual(['stop', 'io.close', 'http.close', 'pool.end', 'exit 0']);
  });

  test('un segundo SIGTERM (o SIGINT) no lanza otro apagado', async () => {
    const h = harness(async () => true);
    await Promise.all([h.shutdown('SIGTERM'), h.shutdown('SIGINT')]);
    expect(h.order.filter((x) => x === 'flush')).toHaveLength(1);
  });
});

test('SIGTERM con la BD colgada: el proceso sale igualmente antes de los 15 s del drenaje de Railway', async () => {
  await seed('test-cai', SLOOP_ONLY);
  const child = await start();
  await joinGame(child.url, { testUser: 'cai' }, undefined, sockets);
  await child.addGold('test-cai', 10);
  proxy.hang();
  const t0 = Date.now();
  expect(await child.kill('SIGTERM')).toEqual({ code: 0, signal: null });
  const ms = Date.now() - t0;
  console.log(`AC-129 (SIGTERM, BD colgada): salida a los ${ms} ms`);
  expect(ms).toBeLessThan(SHUTDOWN_FLUSH_MS + 3000);
  expect(child.output()).toContain('no se pudo guardar');
});

// AC-129: un redeploy llega como SIGTERM y no se pierde nada. El servidor (proceso hijo real, con el mismo apagado que
// server/index.ts) escribe el progreso de todos y solo después cierra las conexiones. La BD va detrás de un proxy que
// retrasa lo que le llega: si el servidor cerrara antes de escribir, el cliente vería la desconexión con la fila aún vieja
import { execFileSync } from 'child_process';
import net from 'net';
import { Pool } from 'pg';
import { Socket as ClientSocket } from 'socket.io-client';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
import { SavedProgress } from '../progress';
import { C2S, S2C } from '../../src/game/protocol';
import type { GameServer } from '../game-server';
import type { FlushResult } from '../persistence';
import { createShutdown, SHUTDOWN_FLUSH_MS } from '../shutdown';
import { GameChild, startGameChild } from './fixtures/game-child';
import { connectGame, joinGame, sleep, waitFor } from './fixtures/game-socket';
import { rowV1 } from './fixtures/progress-rows';
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
async function start(env: Record<string, string> = {}): Promise<GameChild> {
  const child = await startGameChild({ DATABASE_URL: proxy.url, TEST_SAVE_INTERVAL_MS: '60000', ...env });
  children.push(child);
  return child;
}

const SLOOP_ONLY: SavedProgress = { gold: 100, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop', xp: 0 };
const seed = (userId: string, progress: SavedProgress) => db.admin.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', [userId, rowV1(progress)]);
const goldOf = async (userId: string) => (await db.admin.query('SELECT state FROM player_progress WHERE user_id = $1', [userId])).rows[0]?.state.gold;
const rowOf = async (userId: string) => {
  const { rows } = await db.admin.query('SELECT state, revision FROM player_progress WHERE user_id = $1', [userId]);
  return { gold: rows[0]?.state.gold, cannons: rows[0]?.state.upgrades.cannons, revision: Number(rows[0]?.revision) };
};

// O-42: si cae una aserción sobre el proceso hijo, se imprime su salida, que dice por qué: la escritura pasó de su plazo
// («La BD no responde», «no se pudo guardar») o la fila cambió en otro proceso («cambió en otro proceso»)
async function explain(child: GameChild, check: () => unknown): Promise<void> {
  try {
    await check();
  } catch (err) {
    console.log(`Salida del proceso hijo:\n${child.output()}`);
    throw err;
  }
}

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
  await explain(child, () => expect(rows).toEqual([350, 350]));
  await explain(child, async () => expect(await exited).toEqual({ code: 0, signal: null }));
  await explain(child, () => expect(child.output()).toContain('Progreso guardado'));
  // H-25: el proceso real escribe su propia hora (ISO con ms) y los ms desde la señal, en orden
  console.log(`H-25 (SIGTERM): ${child.output().split('\n').filter((l) => /^(🛑|💾|🔌)/u.test(l)).join(' · ')}`);
  const iso = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z';
  await explain(child, () =>
    expect(child.output()).toMatch(
      new RegExp(`🛑 SIGTERM: guardando el progreso antes de cerrar ${iso}\\n[\\s\\S]*💾 Progreso guardado ${iso} \\(\\+\\d+ ms\\)\\n[\\s\\S]*🔌 Sockets cerrados ${iso} \\(\\+\\d+ ms\\)\\n`)
    )
  );

  proxy.delay(0);
  const again = await start();
  const back = await joinGame(again.url, { testUser: 'ana' }, undefined, sockets);
  expect(back.me().gold).toBe(350);
});

// O-42: la BD lenta pero viva. Se fuerza la causa del fallo de la CI, una escritura que pasa de su plazo de 3 s
// (DB_TIMEOUT_MS): desde el SIGTERM, cada trozo hacia la BD sale a los 5 s, así que los dos guardados vencen a los 3 s (al
// conectar o en la consulta) sin que nada llegue a la BD. En cuanto el hijo avisa de que la BD no responde, el proxy vuelve
// a 400 ms: el apagado tiene que reintentar dentro de su plazo (SHUTDOWN_FLUSH_MS) en vez de cerrar con las filas viejas
test('O-42: SIGTERM con la BD lenta pero viva: la escritura que pasa de su plazo se reintenta y al desconectar las dos filas están', async () => {
  await seed('test-ana', SLOOP_ONLY);
  await seed('test-bea', { ...SLOOP_ONLY, gold: 300 });
  const child = await start();
  const a = await joinGame(child.url, { testUser: 'ana' }, undefined, sockets);
  await joinGame(child.url, { testUser: 'bea' }, undefined, sockets);
  expect(await child.addGold('test-ana', 250)).toBe(true);
  expect(await child.addGold('test-bea', 50)).toBe(true);

  proxy.delay(5000);
  const atDisconnect = new Promise<number[]>((resolve) => a.c.once('disconnect', async () => resolve([await goldOf('test-ana'), await goldOf('test-bea')])));
  const t0 = Date.now();
  const exited = child.kill('SIGTERM');
  await waitFor(() => child.output().includes('La BD no responde'), SHUTDOWN_FLUSH_MS, 'el aviso de que la BD no responde');
  proxy.delay(400);
  const rows = await atDisconnect;
  console.log(`O-42 (SIGTERM, BD lenta): desconexión a los ${Date.now() - t0} ms con las filas en ${rows.join(' y ')}`);
  await explain(child, () => expect(rows).toEqual([350, 350]));
  await explain(child, async () => expect(await exited).toEqual({ code: 0, signal: null }));
  await explain(child, () => expect(child.output()).toMatch(/🔁 Intento 2 del guardado [\s\S]*💾 Progreso guardado /u));
});

// O-42 (b): el primer intento vence en el cliente pero llega a la BD. Desde el SIGTERM se retrasan 5 s las respuestas de
// la BD, no lo que se le manda: el UPDATE de Ana (por la conexión ya abierta) se aplica en el acto, y su respuesta no llega
// en los 3 s del plazo; la conexión nueva de Bea vence al conectar y no escribe. Al reintentar, el UPDATE de Ana no
// encuentra su revisión: el apagado lee la fila, la ve en r+1 con la huella de su intento vencido y lo da por guardado,
// sin echarla
test('O-42 (b): SIGTERM con el primer intento vencido pero aplicado: cuenta como guardado, nadie recibe kicked y sale 💾', async () => {
  await seed('test-ana', SLOOP_ONLY);
  await seed('test-bea', { ...SLOOP_ONLY, gold: 300 });
  const child = await start();
  const a = await joinGame(child.url, { testUser: 'ana' }, undefined, sockets);
  const b = await joinGame(child.url, { testUser: 'bea' }, undefined, sockets);
  const kicked: string[] = [];
  a.c.on(S2C.kicked, () => kicked.push('ana'));
  b.c.on(S2C.kicked, () => kicked.push('bea'));
  expect(await child.addGold('test-ana', 250)).toBe(true);
  expect(await child.addGold('test-bea', 50)).toBe(true);

  proxy.delayReplies(5000);
  const atDisconnect = new Promise<number[]>((resolve) => a.c.once('disconnect', async () => resolve([await goldOf('test-ana'), await goldOf('test-bea')])));
  const exited = child.kill('SIGTERM');
  await waitFor(() => child.output().includes('La BD no responde'), SHUTDOWN_FLUSH_MS, 'el aviso de que la BD no responde');
  await explain(child, async () => expect(await goldOf('test-ana')).toBe(350)); // el intento vencido sí llegó a la BD
  proxy.delayReplies(0);
  const rows = await atDisconnect;
  console.log(`O-42 (b) (SIGTERM, intento vencido pero aplicado): filas en ${rows.join(' y ')} al desconectar · kicked: [${kicked.join(', ')}]`);
  await explain(child, () => expect(kicked).toEqual([])); // primero: sin la relectura, Ana recibe kicked y se desconecta antes
  await explain(child, () => expect(rows).toEqual([350, 350]));
  await explain(child, async () => expect(await exited).toEqual({ code: 0, signal: null }));
  await explain(child, () => expect(child.output()).toMatch(/🔁 Intento 2 del guardado [\s\S]*💾 Progreso guardado /u));
  await explain(child, () => expect(child.output()).not.toContain('cambió en otro proceso'));
});

// O-42 (c4): una compra que vence pero se aplica, y llega el SIGTERM sin ningún otro cambio y antes del primer sondeo. El
// apagado comprueba la fila aunque la memoria no haya cambiado, adopta el intento (r+1 con su huella) y escribe la memoria:
// la fila queda sin la compra, como la vio el jugador, sin kicked y con «💾»
test('O-42 (c4): una compra vencida pero aplicada y un SIGTERM sin más cambios: el apagado la deshace en la fila, sin kicked y con 💾', async () => {
  await seed('test-eva', { ...SLOOP_ONLY, gold: 5000 }); // revisión 1
  const child = await start();
  const e = await joinGame(child.url, { testUser: 'eva' }, undefined, sockets);
  const kicked: string[] = [];
  e.c.on(S2C.kicked, () => kicked.push('eva'));
  proxy.delayReplies(5000);
  e.c.emit(C2S.buy, { itemId: 'cannons:2' });
  await waitFor(() => child.output().includes('La BD no responde'), 8000, 'el fallo de la compra');
  await explain(child, async () => expect(await rowOf('test-eva')).toMatchObject({ cannons: 2, revision: 2 })); // aplicada en la BD
  proxy.delayReplies(0);
  const outcome = await child.kill('SIGTERM');
  const row = await rowOf('test-eva');
  console.log(`O-42 (c4) (SIGTERM tras la compra vencida pero aplicada): fila ${JSON.stringify(row)} · kicked: [${kicked.join(', ')}]`);
  await explain(child, () => expect(outcome).toEqual({ code: 0, signal: null }));
  await explain(child, () => expect(row).toEqual({ gold: 5000, cannons: 1, revision: 3 }));
  await explain(child, () => expect(kicked).toEqual([]));
  await explain(child, () => expect(child.output()).toContain('💾 Progreso guardado'));
  await explain(child, () => expect(child.output()).not.toMatch(/✅ La BD responde de nuevo|cambió en otro proceso/u)); // lo hizo el apagado, no el sondeo
});

// O-42 (a): un conflicto de verdad durante el apagado. Otro proceso escribió la fila de Ana (subió su revisión) antes del
// SIGTERM: el apagado no la pisa ni la reintenta, suelta a Ana con el aviso (que aquí es cierto), guarda a Bea y avisa de
// que 1 jugador quedó sin guardar, sin «💾»
test('O-42 (a): un conflicto de verdad en el apagado: la fila del otro proceso no se pisa, no sale 💾 y el aviso cuenta 1 jugador sin guardar', async () => {
  await seed('test-ana', SLOOP_ONLY);
  await seed('test-bea', { ...SLOOP_ONLY, gold: 300 });
  const child = await start();
  const a = await joinGame(child.url, { testUser: 'ana' }, undefined, sockets);
  const b = await joinGame(child.url, { testUser: 'bea' }, undefined, sockets);
  const kicked: string[] = [];
  a.c.on(S2C.kicked, () => kicked.push('ana'));
  b.c.on(S2C.kicked, () => kicked.push('bea'));
  expect(await child.addGold('test-ana', 250)).toBe(true);
  expect(await child.addGold('test-bea', 50)).toBe(true);
  await db.admin.query('UPDATE player_progress SET state = $2, revision = revision + 1 WHERE user_id = $1', ['test-ana', rowV1({ ...SLOOP_ONLY, gold: 999 })]);

  const outcome = await child.kill('SIGTERM');
  const rows = [await goldOf('test-ana'), await goldOf('test-bea')];
  console.log(`O-42 (a) (SIGTERM, conflicto de verdad): filas en ${rows.join(' y ')} · kicked: [${kicked.join(', ')}]`);
  await explain(child, () => expect(outcome).toEqual({ code: 0, signal: null }));
  await explain(child, () => expect(rows).toEqual([999, 350]));
  await explain(child, () => expect(kicked).toEqual(['ana']));
  await explain(child, () => expect(child.output()).toContain('cambió en otro proceso'));
  await explain(child, () => expect(child.output()).not.toMatch(/💾|🔁/u));
  await explain(child, () =>
    expect(child.output()).toMatch(/El progreso no se pudo guardar en \d+ ms \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \(\+\d+ ms\) · 1 jugador sin guardar\n/u)
  );
});

describe('orden del apagado (createShutdown)', () => {
  // Dobles mínimos: registran el orden en que se llama a cada pieza, lo que se loguea y cuántas escrituras se empiezan;
  // onClose corre al cerrar io. Una escritura da true (todo guardado), false (una fallida) o el recuento; `unsaved` son
  // los jugadores que quedan sin confirmar en la BD al acabar (los del conflicto ya no están: se sueltan)
  type Opts = { now?: () => number; onClose?: () => void; flushTimeoutMs?: number; retryPauseMs?: number; unsaved?: number };
  function harness(flush: () => Promise<boolean | FlushResult>, opts: Opts = {}) {
    const order: string[] = [];
    const lines: string[] = [];
    let flushes = 0;
    const outcome = (r: boolean | FlushResult): FlushResult => (typeof r === 'boolean' ? { failed: r ? 0 : 1, conflicts: 0 } : r);
    const label = (r: FlushResult) => (r.failed > 0 ? 'flush-fallido' : r.conflicts > 0 ? 'flush-conflicto' : 'flush');
    const game = {
      stop: () => order.push('stop'),
      flushProgress: () => (flushes++, flush()).then((r) => (order.push(label(outcome(r))), outcome(r))),
      unsavedProgress: () => opts.unsaved ?? 1
    } as unknown as GameServer;
    const io = { close: (cb: () => void) => (order.push('io.close'), opts.onClose?.(), cb()) } as never;
    const httpServer = { close: () => order.push('http.close') } as never;
    const pool = { end: async () => void order.push('pool.end') } as never;
    let resolveExit: (code: number) => void = () => {};
    const exited = new Promise<number>((r) => (resolveExit = r));
    const log = (msg: string) => void lines.push(msg);
    const shutdown = createShutdown({ game, io, httpServer, pool, log, exit: (code) => (order.push(`exit ${code}`), resolveExit(code)), flushTimeoutMs: opts.flushTimeoutMs ?? 200, retryPauseMs: opts.retryPauseMs, now: opts.now });
    return { order, lines, shutdown, exited, flushes: () => flushes };
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

  // O-42 (a): el aviso lleva los ms reales (antes, el plazo) y, después del (+N ms) que lee check_deploy.py:160, cuántos
  // jugadores quedaron sin guardar
  test('si la escritura no llega en su plazo, el aviso lleva la hora, los ms reales y cuántos jugadores quedaron sin guardar', async () => {
    let clock = 0; // el reloj del proceso (now): la escritura colgada se lleva 250 ms; el plazo real de 200 ms cierra igual
    const h = harness(() => ((clock += 250), new Promise<boolean>(() => {})), { unsaved: 2, now: () => clock });
    await h.shutdown('SIGTERM');
    const m = /^⚠️ {2}El progreso no se pudo guardar en (\d+) ms \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \(\+(\d+) ms\) · 2 jugadores sin guardar$/.exec(h.lines[1]);
    expect(m).not.toBeNull();
    expect([m![1], m![2]]).toEqual(['250', '250']); // lo que marca el reloj del proceso, en el aviso y en el (+N ms)
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
    expect(Date.now() - t0).toBeGreaterThanOrEqual(190); // O-59: espera al plazo real de 200 ms; un temporizador se adelanta ~1 ms, no 10
    expect(h.order).toEqual(['stop', 'io.close', 'http.close', 'pool.end', 'exit 0']);
  });

  // O-42: con la BD lenta pero viva, una escritura que pasa de su plazo (3 s) no se da por perdida mientras quede plazo
  test('si la escritura falla antes del plazo, la reintenta; si el reintento escribe, 💾 y solo después cierra', async () => {
    const results = [false, true];
    const h = harness(async () => results.shift()!, { retryPauseMs: 10 });
    await h.shutdown('SIGTERM');
    expect(h.order).toEqual(['stop', 'flush-fallido', 'flush', 'io.close', 'http.close', 'pool.end', 'exit 0']);
    expect(h.lines[1]).toMatch(/^🔁 Intento 2 del guardado \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \(\+\d+ ms\)$/);
    expect(h.lines[2]).toMatch(/^💾 Progreso guardado /);
  });

  test('si la BD rechaza al instante, reintenta con una pausa entre intentos hasta el plazo y avisa de que no se pudo', async () => {
    const h = harness(async () => false, { flushTimeoutMs: 1000, retryPauseMs: 20 });
    await h.shutdown('SIGTERM');
    const tries = h.order.filter((x) => x === 'flush-fallido').length;
    expect(tries).toBeGreaterThan(2);
    expect(tries).toBeLessThanOrEqual(1000 / 20 + 1); // la pausa va entre intento e intento: no es un bucle
    expect(h.order.slice(1 + tries)).toEqual(['io.close', 'http.close', 'pool.end', 'exit 0']);
    expect(h.lines.at(-2)).toMatch(/^⚠️ {2}El progreso no se pudo guardar en \d+ ms .* · 1 jugador sin guardar$/);
  });

  // El pool espera a sus conexiones al cerrarse: un intento empezado al final del plazo retrasaría la salida hasta 3 s más
  test('no empieza un intento que no cabe en el plazo (se supone que dura como el que acaba de fallar)', async () => {
    let clock = 0; // el reloj del proceso (now) avanza 120 ms con la escritura: el aviso no depende de los ms reales de la CI
    const h = harness(() => new Promise<boolean>((resolve) => setTimeout(() => ((clock += 120), resolve(false)), 120)), { retryPauseMs: 10, now: () => clock });
    await h.shutdown('SIGTERM');
    expect(h.flushes()).toBe(1);
    expect(h.order).toEqual(['stop', 'flush-fallido', 'io.close', 'http.close', 'pool.end', 'exit 0']);
    const ms = Number(/no se pudo guardar en (\d+) ms /.exec(h.lines[1])?.[1]);
    expect(ms).toBe(120); // lo que tardó la escritura en el reloj del proceso, no el plazo de 200 ms
  });

  // O-42 (a): un conflicto de verdad (otro proceso escribió antes) ni se reintenta ni cuenta como guardado
  test('un conflicto no se reintenta: no sale 💾 y el aviso cuenta 1 jugador sin guardar', async () => {
    const h = harness(async () => ({ failed: 0, conflicts: 1 }), { retryPauseMs: 10, unsaved: 0 });
    await h.shutdown('SIGTERM');
    expect(h.flushes()).toBe(1);
    expect(h.order).toEqual(['stop', 'flush-conflicto', 'io.close', 'http.close', 'pool.end', 'exit 0']);
    expect(h.lines.some((l) => l.startsWith('💾'))).toBe(false);
    expect(h.lines[1]).toMatch(/^⚠️ {2}El progreso no se pudo guardar en \d+ ms .* · 1 jugador sin guardar$/);
  });

  test('los conflictos de un intento se suman aunque el reintento guarde a los demás', async () => {
    const results: FlushResult[] = [
      { failed: 1, conflicts: 1 },
      { failed: 0, conflicts: 0 }
    ];
    const h = harness(async () => results.shift()!, { retryPauseMs: 10, unsaved: 0 });
    await h.shutdown('SIGTERM');
    expect(h.order).toEqual(['stop', 'flush-fallido', 'flush', 'io.close', 'http.close', 'pool.end', 'exit 0']);
    expect(h.lines.slice(1, 3)).toEqual([expect.stringMatching(/^🔁 Intento 2 del guardado /), expect.stringMatching(/^⚠️ {2}El progreso no se pudo guardar en \d+ ms .* · 1 jugador sin guardar$/)]);
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
  const outcome = await child.kill('SIGTERM');
  const ms = Date.now() - t0;
  console.log(`AC-129 (SIGTERM, BD colgada): salida a los ${ms} ms`);
  await explain(child, () => expect(outcome).toEqual({ code: 0, signal: null }));
  await explain(child, () => expect(ms).toBeLessThan(SHUTDOWN_FLUSH_MS + 3000));
  await explain(child, () => expect(child.output()).toMatch(/🔁 Intento 2 del guardado [\s\S]*no se pudo guardar en \d+ ms .* · 1 jugador sin guardar/u)); // O-42: lo intentó más de una vez
});

// AC-203 (O-41): si desaparece el proceso que lee los logs, escribir en stdout o stderr da EPIPE, y Node lo lanza como
// uncaughtException. Sin listener, eso tumba el proceso antes de guardar; con el de Next (server/index.ts) entra en bucle
// (EPIPE → console.error → EPIPE) y el apagado no termina. Las dos variantes deben apagarse como con las tuberías abiertas
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};
// El proceso y sus descendientes, leídos de ps (con node --import tsx hoy es uno solo; el servicio de esbuild de la CLI de
// tsx, O-36, sería un hijo más)
function processTree(root: number): number[] {
  const rows = execFileSync('ps', ['-Ao', 'pid=,ppid='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const tree = [root];
  for (let i = 0; i < tree.length; i++) for (const [pid, ppid] of rows) if (ppid === tree[i]) tree.push(pid);
  return tree;
}
const refused = (url: string) =>
  new Promise<boolean>((resolve) => {
    const { hostname, port } = new URL(url);
    const socket = net.connect(Number(port), hostname);
    socket.once('connect', () => (socket.destroy(), resolve(false)));
    socket.once('error', () => resolve(true));
  });

const PIPE_MODES: { mode: string; env: Record<string, string> }[] = [
  { mode: 'sin listener de uncaughtException (como este proceso de pruebas)', env: {} },
  { mode: 'con el listener de Next (como server/index.ts)', env: { TEST_LOG_UNCAUGHT: '1' } }
];

describe.each(PIPE_MODES)('AC-203 (O-41): con las tuberías de los logs cerradas, $mode', ({ mode, env }) => {
  test('(a) y (b): SIGTERM escribe el estado antes de desconectar y sale solo con 0 en ≤ 10 s, sin dejar procesos ni puerto', async () => {
    await seed('test-dan', SLOOP_ONLY);
    await seed('test-eva', { ...SLOOP_ONLY, gold: 300 });
    const child = await start(env);
    const d = await joinGame(child.url, { testUser: 'dan' }, undefined, sockets);
    await joinGame(child.url, { testUser: 'eva' }, undefined, sockets);
    expect(await child.addGold('test-dan', 250)).toBe(true);
    expect(await child.addGold('test-eva', 50)).toBe(true);
    const tree = processTree(child.pid);
    console.log(`AC-203, ${mode}: árbol del hijo antes del SIGTERM, ${tree.length} procesos (${tree.join(', ')})`);
    child.closeOutput();

    proxy.delay(400); // como en AC-129: si cerrara antes de escribir, el cliente vería la fila vieja
    const atDisconnect = new Promise<number[]>((resolve) => d.c.once('disconnect', async () => resolve([await goldOf('test-dan'), await goldOf('test-eva')])));
    const outcome = await Promise.race([child.kill('SIGTERM'), sleep(10_000).then(() => 'sigue vivo a los 10 s del SIGTERM')]);
    expect(outcome).toEqual({ code: 0, signal: null }); // (b)
    expect(await atDisconnect).toEqual([350, 350]); // (a)
    for (let i = 0; i < 20 && tree.some(alive); i++) await sleep(100); // un hijo que hubiera sale al cerrarse su stdin
    expect({ tree: tree.length, alive: tree.filter(alive) }).toEqual({ tree: tree.length, alive: [] });
    expect(await refused(child.url)).toBe(true);
  });

  test('(c) sin SIGTERM el juego sigue: tras una línea de log, un cliente que navega recibe frames durante 5 s', async () => {
    const child = await start(env);
    const f = await joinGame(child.url, { testUser: 'fio' }, undefined, sockets);
    f.c.emit(C2S.moveTo, { x: 300, z: 300 }); // navegando hay deltas de su barco en cada snapshot (10 Hz)
    child.closeOutput();
    const before = f.frames.length;
    const g = connectGame(child.url, { testUser: 'gus' });
    sockets.push(g);
    g.emit(C2S.join, {}); // al unirse, el servidor escribe «🎮 … se unió» en su log, ya sin nadie que lo lea
    await sleep(5000);
    expect({ frames: f.frames.length - before >= 25, alive: alive(child.pid) }).toEqual({ frames: true, alive: true });
  });

  // «Un error al escribir en stdout o stderr»: el servidor escribe sus logs por stdout, así que sin esta línea por stderr
  // nada probaría la tubería de stderr (M2, el listener solo en stdout, sobrevivía al resto del archivo)
  test('(b) y (c) con una línea por stderr: el juego sigue durante 5 s y SIGTERM escribe el estado y sale solo con 0', async () => {
    await seed('test-hal', SLOOP_ONLY);
    const child = await start(env);
    const h = await joinGame(child.url, { testUser: 'hal' }, undefined, sockets);
    h.c.emit(C2S.moveTo, { x: 300, z: 300 });
    expect(await child.addGold('test-hal', 250)).toBe(true);
    child.closeOutput();
    expect(await child.logError()).toBe(true);
    const before = h.frames.length;
    await sleep(5000);
    expect({ frames: h.frames.length - before >= 25, alive: alive(child.pid) }).toEqual({ frames: true, alive: true }); // (c)
    const outcome = await Promise.race([child.kill('SIGTERM'), sleep(10_000).then(() => 'sigue vivo a los 10 s del SIGTERM')]);
    expect(outcome).toEqual({ code: 0, signal: null }); // (b)
    expect(await goldOf('test-hal')).toBe(350);
  });
});

// Filas v: 2 con el apagado de verdad (AC-155 y AC-157): un redeploy llega como SIGTERM (AC-129) a un proceso hijo real,
// con el mismo arranque y el mismo apagado que server/index.ts, y Postgres real. Con una fila v: 2, lo que escribe el
// apagado lleva la XP ganada y conserva los barcos que la simulación todavía no juega; si el jugador no cambió nada, no
// escribe. persistence-rollback.test.ts prueba lo mismo en el proceso, sin señal.
// Lo que se aserta solo puede haberlo escrito el apagado, por dos cosas: el proceso no tiene guardado periódico (60 s en
// vez de 2), y la BD va detrás de un proxy que retrasa 400 ms lo que le llega. La fila se lee cuando el cliente ve la
// desconexión: el apagado escribe y solo después cierra las conexiones; sin él, la única otra escritura es la de la
// desconexión (saveNow), que sale cuando el cliente ya está desconectado y llega a la BD 400 ms después
import { Pool } from 'pg';
import { Socket as ClientSocket } from 'socket.io-client';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
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
  proxy = await startPgProxy(db.url);
});

afterEach(async () => {
  sockets.splice(0).forEach((c) => c.disconnect());
  await Promise.all(children.splice(0).map((c) => c.kill('SIGKILL')));
  await proxy.close();
});

async function start(): Promise<GameChild> {
  const child = await startGameChild({ DATABASE_URL: proxy.url, TEST_SAVE_INTERVAL_MS: '60000' });
  children.push(child);
  return child;
}

// Una fila de la 1.1 con XP, los dos barcos nuevos (fuera del orden de la tabla de ids) y el Navío como barco activo
const V2 = {
  v: 2,
  gold: 4321,
  upgrades: { cannons: 3, hull: 2, sails: 1 },
  ownedShips: ['sloop', 'frigate', 'schooner', 'line'],
  activeShip: 'line',
  xp: 1234
};

const seed = (userId: string, state: unknown) => db.admin.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', [userId, state]);

async function rowOf(userId: string): Promise<{ state: Record<string, unknown>; revision: number }> {
  const { rows } = await db.admin.query('SELECT state, revision FROM player_progress WHERE user_id = $1', [userId]);
  return { state: rows[0].state, revision: Number(rows[0].revision) };
}

// La fila tal cual está en la BD, para compararla byte a byte
async function rawRow(userId: string): Promise<string> {
  const { rows } = await db.admin.query('SELECT state::text AS s, revision::text AS r, updated_at::text AS u FROM player_progress WHERE user_id = $1', [userId]);
  return JSON.stringify(rows);
}

describe('SIGTERM con una fila v: 2: el apagado escribe la XP ganada y conserva los barcos nuevos', () => {
  test('(a) con oro y XP ganados, la fila queda antes de salir en v: 2 con la XP y el oro nuevos, los barcos nuevos en el orden de la tabla y la Fragata como activo; sale con 0', async () => {
    await seed('test-nao', V2);
    const child = await start();
    const n = await joinGame(child.url, { testUser: 'nao' }, undefined, sockets);
    expect(n.me().activeShip).toBe('frigate');
    expect(await child.addGold('test-nao', 250)).toBe(true);
    expect(await child.addXp('test-nao', 66)).toBe(true);
    expect(await rowOf('test-nao')).toEqual({ state: V2, revision: 1 }); // aún sin escribir

    proxy.delay(400); // cada escritura tarda ≥ 400 ms en llegar a la BD
    const atDisconnect = new Promise<{ state: Record<string, unknown>; revision: number }>((resolve) => n.c.once('disconnect', async () => resolve(await rowOf('test-nao'))));
    const exited = child.kill('SIGTERM');
    const written = { state: { ...V2, gold: 4571, ownedShips: ['sloop', 'schooner', 'frigate', 'line'], activeShip: 'frigate', xp: 1300 }, revision: 2 };
    expect(await atDisconnect).toEqual(written);
    expect(await exited).toEqual({ code: 0, signal: null });
    expect(child.output()).toContain('💾 Progreso guardado');
    expect(await rowOf('test-nao')).toEqual(written);
  });

  test('(b) sin cambios, la fila queda igual byte a byte tras el SIGTERM, con la misma revision; sale con 0', async () => {
    await seed('test-ona', V2);
    const before = await rawRow('test-ona');
    const child = await start();
    const o = await joinGame(child.url, { testUser: 'ona' }, undefined, sockets);
    expect(o.me().activeShip).toBe('frigate');
    expect(await child.kill('SIGTERM')).toEqual({ code: 0, signal: null });
    expect(child.output()).toContain('💾 Progreso guardado');
    expect(await rawRow('test-ona')).toBe(before);
    expect((await rowOf('test-ona')).revision).toBe(1);
  });
});

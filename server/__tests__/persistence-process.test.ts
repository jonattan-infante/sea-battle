// AC-130 con el servidor en un proceso hijo y Postgres real: kill -9 de verdad. Pérdida máxima si el proceso muere de
// golpe: el oro de los últimos 5 s, y nunca una compra ni un cambio de barco ya confirmados. AC-155: la XP, igual que el
// oro, también tras un redeploy (SIGTERM, AC-129)
import { Pool } from 'pg';
import { Socket as ClientSocket } from 'socket.io-client';
import { C2S } from '../../src/game/protocol';
import { levelOf } from '../../src/game/xp';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
import { SavedProgress } from '../progress';
import { GameChild, startGameChild } from './fixtures/game-child';
import { joinGame, sleep, waitFor } from './fixtures/game-socket';
import { rowV1, rowV2 } from './fixtures/progress-rows';
import { createTestDb, TestDb } from './pg/test-db';

jest.setTimeout(90_000);

let db: TestDb;
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

afterEach(async () => {
  sockets.splice(0).forEach((c) => c.disconnect());
  await Promise.all(children.splice(0).map((c) => c.kill('SIGKILL')));
});

async function start(env: Record<string, string> = {}): Promise<GameChild> {
  const child = await startGameChild({ DATABASE_URL: db.url, ...env });
  children.push(child);
  return child;
}

const SLOOP_ONLY: SavedProgress = { gold: 100, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop', xp: 0 };

async function seed(userId: string, progress: SavedProgress): Promise<void> {
  await db.admin.query('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', [userId, progress.xp === 0 ? rowV1(progress) : rowV2(progress)]);
}

test('AC-130: comprar → kill -9 → arrancar → la compra está', async () => {
  await seed('test-kim', { ...SLOOP_ONLY, gold: 2100 });
  const first = await start();
  const k = await joinGame(first.url, { testUser: 'kim' }, undefined, sockets);
  k.c.emit(C2S.buy, { itemId: 'ship:brig' });
  await waitFor(() => k.notices().some((n) => n.text === 'Compra realizada'), 5000, 'la confirmación de la compra');
  expect(await first.kill('SIGKILL')).toEqual({ code: null, signal: 'SIGKILL' });

  const second = await start();
  const again = await joinGame(second.url, { testUser: 'kim' }, undefined, sockets);
  const { gold, upgrades, ownedShips, activeShip, xp } = again.me();
  expect({ gold, upgrades, ownedShips, activeShip, xp }).toEqual({ ...SLOOP_ONLY, gold: 100, ownedShips: ['sloop', 'brig'], activeShip: 'brig' });
});

test('AC-130: ganar oro → esperar 5 s → kill -9 → arrancar → el oro está', async () => {
  await seed('test-lia', SLOOP_ONLY);
  const first = await start();
  await joinGame(first.url, { testUser: 'lia' }, undefined, sockets);
  expect(await first.addGold('test-lia', 250)).toBe(true);
  await sleep(5000);
  await first.kill('SIGKILL');

  const second = await start();
  const again = await joinGame(second.url, { testUser: 'lia' }, undefined, sockets);
  expect(again.me().gold).toBe(350);
});

test('un usuario de prueba entra en el proceso real como usuario con progreso guardado (no como invitado)', async () => {
  const child = await start();
  await joinGame(child.url, { testUser: 'mar' }, undefined, sockets);
  await waitFor(async () => (await db.admin.query("SELECT 1 FROM player_progress WHERE user_id = 'test-mar'")).rowCount === 1, 5000, 'la fila de test-mar');
});

test('AC-155: ganar XP → esperar 5 s → kill -9 → arrancar → la XP está', async () => {
  await seed('test-noa', { ...SLOOP_ONLY, xp: 1200 });
  const first = await start();
  await joinGame(first.url, { testUser: 'noa' }, undefined, sockets);
  expect(await first.addXp('test-noa', 34)).toBe(true);
  await sleep(5000);
  await first.kill('SIGKILL');

  const second = await start();
  const again = await joinGame(second.url, { testUser: 'noa' }, undefined, sockets);
  expect(again.me().xp).toBe(1234);
});

test('AC-155: con 1 234 de XP (nivel 7), un redeploy (SIGTERM) la escribe al apagar; al volver, 1 234 y nivel 7', async () => {
  await seed('test-ole', { ...SLOOP_ONLY, xp: 1200 });
  const first = await start({ TEST_SAVE_INTERVAL_MS: '60000' }); // sin guardado periódico: solo escribe el apagado
  const o = await joinGame(first.url, { testUser: 'ole' }, undefined, sockets);
  expect(o.me().xp).toBe(1200);
  expect(await first.addXp('test-ole', 34)).toBe(true);
  expect(await first.kill('SIGTERM')).toEqual({ code: 0, signal: null });

  const second = await start();
  const again = await joinGame(second.url, { testUser: 'ole' }, undefined, sockets);
  expect(again.me().xp).toBe(1234);
  expect(levelOf(again.me().xp)).toBe(7);
});

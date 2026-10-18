// AC-97 y AC-155 en el navegador: un usuario con progreso guardado recupera oro, mejoras, barcos y XP al recargar y
// también tras reiniciar el servidor (la memoria ya no está: sale de la BD); el invitado vuelve a 100 y no escribe nada.
// El HUD todavía no muestra la XP (AC-152): se lee del estado del cliente, que es lo que leerá el HUD. El e2e no
// puede iniciar sesión en Clerk: usa el usuario de prueba (?testUser=), que solo existe con el modo invitado y se guarda
// como un usuario de Clerk. Servidor propio con su Postgres temporal, nunca la BD de otro ni la de Railway
import { expect, Page, test } from '@playwright/test';
import { Client } from 'pg';
import { UPGRADE_LEVELS } from '../src/game/constants';
import { levelOf } from '../src/game/xp';
import { rowV1, rowV2 } from '../server/__tests__/fixtures/progress-rows';
import { startTempCluster, TempCluster } from '../server/__tests__/pg/cluster';
import { migrate } from '../server/db/migrate';
import { createPool } from '../server/db/pool';
import { SavedProgress } from '../server/progress';
import { trackSocket, waitFor } from './helpers';
import { OwnServer, startOwnServer } from './own-server';

let cluster: TempCluster;
let server: OwnServer;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  cluster = await startTempCluster();
  const pool = createPool(cluster.url);
  await migrate(pool);
  await pool.end();
  server = await startOwnServer({ DATABASE_URL: cluster.url, SEA_BATTLE_NPCS: '0' });
});

test.afterAll(async () => {
  await server?.kill();
  await cluster?.stop();
});

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: cluster.url });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${server.url}/game${query}`);
  await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 30_000 });
}

const progress = (page: Page) =>
  page.evaluate(() => {
    const p = window.__SEA_BATTLE__!.player() as SavedProgress | null;
    return p ? { gold: p.gold, upgrades: p.upgrades, ownedShips: p.ownedShips, activeShip: p.activeShip, xp: p.xp } : null;
  });

test('AC-97: con 750 de oro, Cañones N2 y un Bergantín, recargar devuelve exactamente eso, también tras reiniciar el servidor', async ({ page }) => {
  test.setTimeout(120_000);
  const cannons2 = UPGRADE_LEVELS.cannons.prices[1];
  const seeded: SavedProgress = { gold: 750 + cannons2, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig', xp: 0 };
  await sql('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', ['test-ana', rowV1(seeded)]);

  await open(page, '?testUser=ana');
  expect(await progress(page)).toEqual(seeded);
  // La compra pasa por la tienda de verdad: el servidor la escribe en la BD antes de confirmarla (AC-130 a)
  await page.keyboard.press('KeyP');
  await page.getByTestId('buy-cannons-2').click();
  await expect(page.getByTestId('shop-cannons')).toContainText('Nivel 2/3');
  const expected: SavedProgress = { gold: 750, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig', xp: 0 };
  await waitFor(() => progress(page), (p) => JSON.stringify(p) === JSON.stringify(expected), 5000, 50);
  const rows = await sql<{ state: unknown }>('SELECT state FROM player_progress WHERE user_id = $1', ['test-ana']);
  expect(rows[0].state).toEqual({ v: 2, ...expected }); // la fila de la 1.0 pasa a v: 2 al escribir (AC-156)

  // 1) Recargar la página
  await open(page, '?testUser=ana');
  console.log(`AC-97: tras recargar ${JSON.stringify(await progress(page))}`);
  expect(await progress(page)).toEqual(expected);

  // 2) Reiniciar el servidor (kill -9): el progreso ya no está en memoria y sale de la BD
  await server.kill();
  await server.start();
  await open(page, '?testUser=ana');
  console.log(`AC-97: tras reiniciar el servidor ${JSON.stringify(await progress(page))}`);
  expect(await progress(page)).toEqual(expected);
});

test('AC-155: con 1 234 de XP (nivel 7), recargar y reiniciar el servidor devuelven 1 234 y nivel 7', async ({ page }) => {
  test.setTimeout(120_000);
  const seeded: SavedProgress = { gold: 500, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig', xp: 1234 };
  await sql('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', ['test-xia', rowV2(seeded)]);

  await open(page, '?testUser=xia');
  expect(await progress(page)).toEqual(seeded);
  expect(levelOf((await progress(page))!.xp)).toBe(7);

  // 1) Recargar la página
  await open(page, '?testUser=xia');
  expect(await progress(page)).toEqual(seeded);

  // 2) Reiniciar el servidor (kill -9): sale de la BD
  await server.kill();
  await server.start();
  await open(page, '?testUser=xia');
  console.log(`AC-155: tras reiniciar el servidor ${JSON.stringify(await progress(page))}`);
  expect(await progress(page)).toEqual(seeded);
  expect(levelOf((await progress(page))!.xp)).toBe(7);
});

test('AC-97: un invitado vuelve a 100 de oro tras reiniciar el servidor y no escribe nada en la BD', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, '');
  expect((await progress(page))?.gold).toBe(100);
  await server.kill();
  await server.start();
  await open(page, '');
  expect((await progress(page))?.gold).toBe(100);
  const guests = await sql<{ n: number }>("SELECT count(*)::int AS n FROM player_progress WHERE user_id NOT LIKE 'test-%'");
  expect(guests[0].n).toBe(0);
});

test('AC-133: al abrir el juego en otra pestaña, la vieja queda en «Sesión en otra pestaña» sin reintentos y la nueva sigue con el mismo barco y el mismo oro', async ({ browser }) => {
  test.setTimeout(120_000);
  await sql('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', ['test-tab', { v: 1, gold: 1234, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop' }]);
  const ctx = await browser.newContext();
  try {
    const old = await ctx.newPage();
    const oldSocket = trackSocket(old);
    await open(old, '?testUser=tab');
    const oldShip = await old.evaluate(() => window.__SEA_BATTLE__!.me() as { id: string } | null);
    const fresh = await ctx.newPage();
    await open(fresh, '?testUser=tab');

    const overlay = old.getByTestId('connection-overlay');
    await expect(overlay).toHaveAttribute('data-state', 'kicked');
    await expect(overlay).toContainText('Has abierto el juego en otra pestaña');
    await expect(old.getByTestId('btn-retry')).toHaveCount(0);
    const joinsAfterKick = oldSocket.sent.filter((m) => m.startsWith('42["join"')).length;
    await old.waitForTimeout(8000); // más que los reintentos de AC-99 (1 + 2 + 4 s)
    expect(oldSocket.sent.filter((m) => m.startsWith('42["join"')).length).toBe(joinsAfterKick);

    const freshShip = await fresh.evaluate(() => window.__SEA_BATTLE__!.me() as { id: string } | null);
    expect(freshShip?.id).toBe(oldShip?.id);
    expect((await progress(fresh))?.gold).toBe(1234);
  } finally {
    await ctx.close();
  }
});

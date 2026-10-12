// AC-131 y AC-132 de punta a punta, con la BD de verdad (los «ganchos de la BD» de AD-34): el servidor propio habla con su
// Postgres temporal a través de un proxy TCP de este proceso, que corta la BD (parada) sin pararla. El cliente de D50 ya
// tiene su e2e simulando el servidor (e2e/progress-states.spec.ts); este comprueba que el servidor real lo dispara. Usuario
// de prueba (?testUser=), que solo existe con el modo invitado y se guarda como un usuario de Clerk
import { expect, Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { startPgProxy, PgProxy } from '../server/__tests__/fixtures/pg-proxy';
import { startTempCluster, TempCluster } from '../server/__tests__/pg/cluster';
import { migrate } from '../server/db/migrate';
import { createPool } from '../server/db/pool';
import { SavedProgress } from '../server/progress';
import { trackSocket, waitFor } from './helpers';
import { OwnServer, startOwnServer } from './own-server';

const SHOTS = path.join(__dirname, '..', 'qa-artifacts', 'persistence');
const SLOOP_ONLY: SavedProgress = { gold: 2000, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop' };
const FRIGATE: SavedProgress = { gold: 1234, upgrades: { cannons: 2, hull: 3, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate' };

let cluster: TempCluster;
let proxy: PgProxy;
let server: OwnServer;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  cluster = await startTempCluster();
  const pool = createPool(cluster.url);
  await migrate(pool);
  await pool.end();
  proxy = await startPgProxy(cluster.url);
  server = await startOwnServer({ DATABASE_URL: proxy.url, SEA_BATTLE_NPCS: '0' });
  fs.mkdirSync(SHOTS, { recursive: true });
});

test.afterEach(() => proxy.restore());

test.afterAll(async () => {
  await server?.kill();
  await proxy?.close();
  await cluster?.stop();
});

async function sql(text: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const client = new Client({ connectionString: cluster.url });
  await client.connect();
  try {
    return (await client.query(text, params)).rows;
  } finally {
    await client.end();
  }
}

const seed = (userId: string, state: unknown) => sql('INSERT INTO player_progress (user_id, state) VALUES ($1, $2)', [userId, state]);
const rawRow = async (userId: string) => JSON.stringify(await sql('SELECT state::text AS s, revision::text AS r, updated_at::text AS u FROM player_progress WHERE user_id = $1', [userId]));
const progress = (page: Page) =>
  page.evaluate(() => {
    const p = window.__SEA_BATTLE__!.player() as SavedProgress | null;
    return p ? { gold: p.gold, upgrades: p.upgrades, ownedShips: p.ownedShips, activeShip: p.activeShip } : null;
  });
const joins = (sent: string[]) => sent.filter((m) => m.startsWith('42["join"')).length;

async function openLoadFailed(page: Page, user: string) {
  await page.goto(`${server.url}/game?testUser=${user}`);
  const overlay = page.getByTestId('connection-overlay');
  await expect(overlay).toHaveAttribute('data-state', 'load-failed', { timeout: 15_000 });
  return overlay;
}

test('AC-131: registro corrupto → «Progreso no disponible» sin entrar al mundo y la fila intacta aunque reintente; reparada la fila, entra con su progreso', async ({ page }) => {
  test.setTimeout(90_000);
  await seed('test-rota', { v: 1, ...FRIGATE, gold: -5 });
  const before = await rawRow('test-rota');
  const overlay = await openLoadFailed(page, 'rota');
  await expect(overlay).toContainText('Progreso no disponible');
  await expect(overlay).toContainText('No podemos cargar tu progreso ahora mismo');
  await expect(page.getByTestId('offline-detail')).toHaveText('Lo que tenías guardado sigue intacto.');
  const retry = page.getByTestId('btn-retry');
  await expect(retry).toBeFocused();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.locator('[data-hud-block]').count()).toBe(0);
  await page.screenshot({ path: path.join(SHOTS, 'ac131-load-failed.png') });

  await retry.click();
  await expect(page.getByTestId('offline-detail')).toHaveText('Sigue sin responder. Prueba de nuevo en unos segundos.');
  expect(await rawRow('test-rota')).toBe(before); // byte a byte

  await sql('UPDATE player_progress SET state = $2 WHERE user_id = $1', ['test-rota', { v: 1, ...FRIGATE }]);
  await retry.click();
  await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 15_000 });
  await expect(overlay).toHaveCount(0);
  expect(await progress(page)).toEqual(FRIGATE);
});

test('AC-131: con la BD colgada, 3 clics en Reintentar a 120 ms lanzan 1 intento («Reintentando…»); a los 3 s falla con el detalle nuevo; al volver la BD, entra', async ({ page }) => {
  test.setTimeout(90_000);
  await seed('test-cuelga', { v: 1, ...FRIGATE });
  proxy.cut();
  const socket = trackSocket(page);
  await openLoadFailed(page, 'cuelga');
  const retry = page.getByTestId('btn-retry');
  proxy.hang();
  const before = joins(socket.sent);
  const t0 = Date.now();
  // Mientras espera, el botón lleva aria-disabled (D55) y Playwright no lo pulsaría: force simula los clics de más del
  // jugador, que sí llegan al botón y no deben lanzar otro intento
  await retry.click();
  await page.waitForTimeout(120);
  await retry.click({ force: true });
  await page.waitForTimeout(120);
  await retry.click({ force: true });
  await expect(retry).toHaveText('Reintentando…');
  await expect(retry).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId('offline-detail')).toHaveText('Sigue sin responder. Prueba de nuevo en unos segundos.', { timeout: 10_000 });
  console.log(`AC-131 (e2e): BD colgada, el reintento falla a los ${Date.now() - t0} ms`);
  expect(joins(socket.sent) - before).toBe(1);
  await expect(retry).toHaveText('Reintentar');

  proxy.restore();
  await retry.click();
  await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 15_000 });
  expect(await progress(page)).toEqual(FRIGATE);
});

test('AC-131: con la BD parada al entrar sale el mismo overlay; al volver la BD, Reintentar entra con su progreso', async ({ page }) => {
  test.setTimeout(90_000);
  await seed('test-bea', { v: 1, ...FRIGATE });
  proxy.cut();
  await openLoadFailed(page, 'bea');
  proxy.restore();
  await page.getByTestId('btn-retry').click();
  await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 15_000 });
  expect(await progress(page)).toEqual(FRIGATE);
});

test('AC-132: con la BD caída en partida, el aviso es el primero de la columna, Puerto se deshabilita y P avisa; al volver la BD, «Progreso guardado»', async ({ page }) => {
  test.setTimeout(90_000);
  await seed('test-ana', { v: 1, ...SLOOP_ONLY });
  await page.goto(`${server.url}/game?testUser=ana`);
  await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 30_000 });

  // Con la tienda abierta llega el corte: la compra no se confirma, la tienda no se cierra pero deja de vender
  await page.keyboard.press('KeyP');
  await expect(page.getByTestId('shop')).toBeVisible();
  proxy.cut();
  await page.getByTestId('buy-cannons-2').click();
  const banner = page.getByTestId('save-warning');
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner).toHaveText('Progreso sin guardar, reintentando…');
  await expect(page.getByTestId('toasts')).toContainText('La tienda no está disponible: no podemos guardar');
  await expect(page.getByTestId('shop-unsaved')).toBeVisible();
  await expect(page.getByTestId('buy-hull-2')).toBeDisabled();
  expect((await progress(page))?.upgrades.cannons).toBe(1);
  expect(await page.evaluate(() => document.querySelector('[data-testid="toasts"]')?.firstElementChild?.getAttribute('data-testid'))).toBe('save-warning');
  await page.screenshot({ path: path.join(SHOTS, 'ac132-unsaved-shop.png') });

  // Sin la tienda: Puerto deshabilitado con su motivo, y P no abre la tienda
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shop')).toHaveCount(0);
  const port = page.getByTestId('btn-port');
  await expect(port).toHaveAttribute('aria-disabled', 'true');
  await expect(port).toHaveAttribute('title', 'La tienda no está disponible: no podemos guardar');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('shop')).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, 'ac132-unsaved.png') });

  // Vuelve la BD: el reintento escribe, el aviso se va y sale «Progreso guardado»
  const t0 = Date.now();
  proxy.restore();
  await expect(banner).toHaveCount(0, { timeout: 40_000 });
  console.log(`AC-132 (e2e): aviso fuera ${Date.now() - t0} ms después de volver la BD`);
  await expect(page.getByTestId('toasts')).toContainText('Progreso guardado');
  await expect(port).toHaveAttribute('aria-disabled', 'false');
  await waitFor(() => page.evaluate(() => (window.__SEA_BATTLE__!.hud() as { saveWarning: boolean }).saveWarning), (u) => u === false, 1000);
});

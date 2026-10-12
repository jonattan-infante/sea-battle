// Arnés remoto, base sin umbrales: la sesión del usuario de prueba entra al juego del despliegue con su identidad de
// Clerk, no como invitado. Es el primer paso de la latencia y de la prueba rápida (pendientes de sus AC)
import { expect, test } from '@playwright/test';
import { notVerified } from './env';

test('la sesión del usuario de prueba entra al juego @remote', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('/game');
  await expect(page, 'sin sesión, /game redirige al inicio de sesión').toHaveURL(/\/game(\?|$)/);
  await page.waitForFunction(() => window.__SEA_BATTLE__ !== undefined, null, { timeout: 30_000 }).catch(() => {
    throw notVerified('el build no expone window.__SEA_BATTLE__ (el puente de depuración que leen los arneses)');
  });
  await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 60_000 });
  const playerId = await page.evaluate(
    () => (window.__SEA_BATTLE__!.runtime() as unknown as { client: { welcome: { playerId: string } | null } }).client.welcome?.playerId ?? null
  );
  console.log(`REMOTE sesión: ${playerId} jugando a los ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  expect(playerId, 'identidad de Clerk (user_…), no un invitado').toMatch(/^user_/);
});

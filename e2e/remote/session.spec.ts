// Arnés remoto, comprobación de la base: la sesión del usuario de prueba entra al juego del despliegue con su identidad
// de Clerk, no como invitado
import { expect, test } from '@playwright/test';
import { CLERK_JS_VERSION } from '../../src/lib/clerk-js';
import { enterRemoteGame, shortId } from './game';

test('la sesión del usuario de prueba entra al juego @remote', async ({ page }) => {
  // DT-11: el despliegue carga la clerk-js fijada, no la última 5.x
  const clerkJs: string[] = [];
  page.on('request', (r) => {
    const m = r.url().match(/\/npm\/@clerk\/clerk-js@([^/]+)\//);
    if (m) clerkJs.push(m[1]);
  });
  const { playerId, seconds } = await enterRemoteGame(page);
  console.log(`REMOTE sesión: ${shortId(playerId)} jugando a los ${seconds.toFixed(1)} s · clerk-js ${clerkJs.join(', ') || '—'}`);
  expect(playerId, 'identidad de Clerk (user_…), no un invitado').toMatch(/^user_/);
  expect([...new Set(clerkJs)], 'DT-11: la clerk-js fijada, no la última 5.x').toEqual([CLERK_JS_VERSION]);
});

// Arnés remoto, comprobación de la base: la sesión del usuario de prueba entra al juego del despliegue con su identidad
// de Clerk, no como invitado
import { expect, test } from '@playwright/test';
import { enterRemoteGame, shortId } from './game';

test('la sesión del usuario de prueba entra al juego @remote', async ({ page }) => {
  const { playerId, seconds } = await enterRemoteGame(page);
  console.log(`REMOTE sesión: ${shortId(playerId)} jugando a los ${seconds.toFixed(1)} s`);
  expect(playerId, 'identidad de Clerk (user_…), no un invitado').toMatch(/^user_/);
});

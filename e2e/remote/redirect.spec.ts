// DT-11 (5): las URL de destino de Clerk pasan a NEXT_PUBLIC_CLERK_SIGN_{IN,UP}_FALLBACK_REDIRECT_URL. La consola de /,
// /sign-in, /sign-up y /game no avisa de afterSignInUrl obsoleto, y el destino tras iniciar sesión no cambia: sin
// redirect_url, el inicio; con redirect_url, esa ruta. Se inicia sesión por la UI de /sign-in con un ticket del usuario
// de prueba (método A), así que no hace falta su contraseña ni se crea nada en Clerk aparte del ticket
import { createClerkClient } from '@clerk/backend';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, Page, test } from '@playwright/test';
import { baseUrl, loginMethod, notVerified } from './env';

const DEPRECATED = /after(SignIn|SignUp)Url/i;

// Avisos de la consola que nombran afterSignInUrl o afterSignUpUrl, con la ruta en que salieron
function deprecations(page: Page): string[] {
  const out: string[] = [];
  page.on('console', (m) => {
    if (DEPRECATED.test(m.text())) out.push(`${new URL(page.url()).pathname}: ${m.text().slice(0, 140)}`);
  });
  return out;
}

test.describe('Clerk sin afterSignInUrl (DT-11)', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // sin la sesión del global setup

  test('sin sesión, la consola de /, /sign-in y /sign-up no avisa de afterSignInUrl @remote', async ({ page }) => {
    const warnings = deprecations(page);
    for (const path of ['/', '/sign-in', '/sign-up']) {
      await page.goto(path);
      await page.waitForFunction(() => !!window.Clerk?.loaded, null, { timeout: 30_000 });
      await page.waitForTimeout(1000);
    }
    expect(warnings).toEqual([]);
  });

  for (const dest of ['/', '/game']) {
    test(`al iniciar sesión ${dest === '/' ? 'sin redirect_url, termina en /' : 'con redirect_url a /game, termina en /game'} y la consola no avisa @remote`, async ({ page }) => {
      const method = loginMethod();
      if (method.kind !== 'A') throw notVerified('el inicio de sesión por la UI necesita el método A (ticket del Backend API)');
      const backend = createClerkClient({ secretKey: method.secretKey });
      const users = await backend.users.getUserList({ externalId: [method.externalId] });
      const { token } = await backend.signInTokens.createSignInToken({ userId: users.data[0].id, expiresInSeconds: 120 });
      await setupClerkTestingToken({ page });
      const warnings = deprecations(page);
      const redirect = dest === '/' ? '' : `&redirect_url=${encodeURIComponent(new URL(dest, baseUrl()).href)}`;
      await page.goto(`/sign-in?__clerk_ticket=${token}${redirect}`);
      await page.waitForURL((u) => u.pathname === dest, { timeout: 30_000 });
      await page.waitForFunction(() => !!window.Clerk?.user, null, { timeout: 15_000 });
      await page.waitForTimeout(1000);
      console.log(`DT-11 (5): tras iniciar sesión ${redirect ? 'con' : 'sin'} redirect_url → ${new URL(page.url()).pathname}`);
      expect(warnings).toEqual([]);
    });
  }
});

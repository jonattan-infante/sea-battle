// DT-11: el navegador carga la clerk-js fijada en el ClerkProvider (CLERK_JS_VERSION), no la última 5.x a la que
// redirige la Frontend API cuando se pide `@clerk/clerk-js@5`. Se mira la URL pedida, que vale también con la clave
// de Clerk ficticia de la CI
import { expect, test } from '@playwright/test';
import { CLERK_JS_VERSION } from '../src/lib/clerk-js';

test('DT-11: la clerk-js que pide el navegador es la versión fijada, no @5', async ({ page }) => {
  const versions: string[] = [];
  page.on('request', (r) => {
    const m = r.url().match(/\/npm\/@clerk\/clerk-js@([^/]+)\//);
    if (m) versions.push(m[1]);
  });
  await page.goto('/');
  await expect.poll(() => versions.length, { timeout: 15_000 }).toBeGreaterThan(0);
  console.log(`DT-11: clerk-js pedida ${versions.join(', ')} (fijada ${CLERK_JS_VERSION})`);
  expect([...new Set(versions)]).toEqual([CLERK_JS_VERSION]);
});

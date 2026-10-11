// Capturas estándar para QA y UX (ART-DIRECTION §18) sobre el escenario determinista "showcase"
// (server/scenarios.ts): pirata a 45 m, mercante a 40 m, pirata junto a la isla I5 y restos.
import { Browser, Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PORTS } from '../playwright.config';
import { enterGame, me, ships, waitFor } from './helpers';

const OUT = path.join(__dirname, '..', 'qa-artifacts');
const SHOWCASE = `http://localhost:${PORTS.showcase}`;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true }
];

type Vp = (typeof VIEWPORTS)[number];

async function newPage(browser: Browser, vp: Vp): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
  return ctx.newPage();
}

const moveTo = (page: Page, x: number, z: number) =>
  page.evaluate(([px, pz]) => {
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
    rt.client.moveTo(px, pz);
  }, [x, z]);

async function sailTo(page: Page, x: number, z: number) {
  await moveTo(page, x, z);
  await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - x, s.z - z) < 4, 45_000, 250);
  await page.waitForTimeout(700);
}

// Selecciona la entidad más cercana a (x, z) con un clic o toque real sobre su proyección
async function selectNear(page: Page, vp: Vp, kind: string, x: number, z: number): Promise<boolean> {
  const target = (await ships(page))
    .filter((s) => s.kind === kind && s.state === 'alive' && s.screen)
    .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
  if (!target?.screen) return false;
  if (vp.mobile) await page.touchscreen.tap(target.screen.sx, target.screen.sy);
  else await page.mouse.click(target.screen.sx, target.screen.sy);
  await page.waitForTimeout(400);
  return true;
}

const shot = (page: Page, vp: Vp, name: string) => page.screenshot({ path: path.join(OUT, `${vp.name}-${name}.png`) });

test.describe('Capturas @capture', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  for (const vp of VIEWPORTS) {
    test(`escenas estándar en ${vp.name} (${vp.width}×${vp.height})`, async ({ browser }) => {
      test.setTimeout(240_000);
      const page = await newPage(browser, vp);
      const other = await newPage(browser, vp);
      try {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await shot(page, vp, 'landing');

        await enterGame(page, SHOWCASE);
        await page.waitForTimeout(1200);
        await shot(page, vp, 'spawn');

        // Tienda en el puerto (§14)
        await page.keyboard.press('KeyP');
        await page.waitForTimeout(500);
        await shot(page, vp, 'shop');
        await page.keyboard.press('Escape');

        // Mar abierto con pirata, mercante y restos (estándar §18: barco quieto, zoom 1×)
        await sailTo(page, 0, 200);
        await shot(page, vp, 'open-sea');

        // Otro jugador cerca + pirata seleccionado: los 5 elementos de AC-72
        await enterGame(other, SHOWCASE);
        await moveTo(other, -18, 228);
        await waitFor(() => ships(page), (list) => list.filter((s) => s.kind === 'player').length >= 2, 30_000, 250);
        await waitFor(() => me(other), (s) => !!s && Math.hypot(s.x + 18, s.z - 228) < 4, 45_000, 250);
        await selectNear(page, vp, 'pirate', 45, 205);
        await shot(page, vp, 'legibility');

        // Combate: atacar al pirata (pierde la protección) y esperar andanadas de ambos lados
        if (vp.mobile) await page.getByTestId('m-attack').tap();
        else await page.keyboard.press('Space');
        await page.waitForTimeout(6500);
        await shot(page, vp, 'combat');

        // Objetivo junto a la costa de I5 (AC-74)
        await page.keyboard.press('Escape');
        await sailTo(page, 20, 270);
        await selectNear(page, vp, 'pirate', 20, 318);
        await shot(page, vp, 'target-coast');
      } finally {
        await page.context().close();
        await other.context().close();
      }
    });
  }
});

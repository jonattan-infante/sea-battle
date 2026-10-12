// Capturas estándar para QA y UX (ART-DIRECTION §18) sobre el escenario determinista "showcase"
// (server/scenarios.ts): pirata a 45 m, mercante a 40 m, pirata junto a la isla I5 y restos.
import { Browser, expect, Page, test } from '@playwright/test';
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

  // AD-32 (D39): el pirata de la escena "gallery" bajo el minimapa, con la placa a 4 px del borde inferior del panel
  // (oculta: está a menos de 8 px) y a 24 px del último bloque del HUD bajo el minimapa (visible). En escritorio ese
  // bloque es el propio minimapa; en 390×844, «Zona segura», que ocupa todo el ancho 8 px más abajo y es bloque desde D41
  // (O-10)
  for (const vp of VIEWPORTS) {
    test(`placa bajo el minimapa en ${vp.name} (AD-32)`, async ({ browser }) => {
      test.setTimeout(60_000);
      const page = await newPage(browser, vp);
      try {
        await enterGame(page, SHOWCASE);
        await page.mouse.move(5, 450);
        await page.evaluate(() => {
          const rt = window.__SEA_BATTLE__!.runtime();
          rt.setCameraPreset('game');
          rt.setZoomLevel(1);
          const scene = rt.startScene('gallery');
          scene.setPose('g-sloop', scene.focus.x + 10_000, scene.focus.z, Math.PI / 2);
          scene.setPose('g-pirate', scene.focus.x, scene.focus.z, Math.PI / 2);
          (window as unknown as { __capScene: typeof scene }).__capScene = scene;
        });
        await page.waitForTimeout(1500);
        for (const [name, gap, stack] of [['hud-plate-under', 4, false], ['hud-plate-near', 24, true]] as const) {
          await page.evaluate(async ([gap, stack]) => {
            const rt = window.__SEA_BATTLE__!.runtime();
            const scene = (window as unknown as { __capScene: { setPose(id: string, x: number, z: number, h: number): void; getShip(id: string): { x: number; z: number } | undefined } }).__capScene;
            const frames = (n: number) => new Promise<void>((resolve) => { const f = () => (--n <= 0 ? resolve() : requestAnimationFrame(f)); requestAnimationFrame(f); });
            const mm = document.querySelector('[data-testid="minimap"]')!.getBoundingClientRect();
            const zone = document.querySelector('[data-testid="safe-zone"]')?.getBoundingClientRect();
            const below = stack && zone && zone.height > 0 && zone.left < mm.right && zone.right > mm.left ? Math.max(mm.bottom, zone.bottom) : mm.bottom;
            for (let i = 0; i < 3; i++) {
              const p = document.querySelector('[data-plate][data-ship-id="g-pirate"] .wo-plate__body')!.getBoundingClientRect();
              const s = scene.getShip('g-pirate')!;
              const o = rt.project(s.x, s.z)!, px = rt.project(s.x + 1, s.z)!, pz = rt.project(s.x, s.z + 1)!;
              const dx = mm.left + mm.width / 2 - (p.left + p.width / 2), dy = below + gap - p.top;
              scene.setPose('g-pirate', s.x + dx / (px.sx - o.sx), s.z + dy / (pz.sy - o.sy), Math.PI / 2);
              await frames(3);
            }
          }, [gap, stack] as const);
          await page.waitForTimeout(400); // vuelta con el fundido de 150 ms
          await shot(page, vp, name);
          // El par documenta los dos estados (D52): oculta a 4 px y, con opacidad 1, a 16–32 px del bloque del HUD más
          // cercano. 16 es el umbral de vuelta de la histéresis (§11.4) y 32 obliga a que esté junto al bloque
          const plate = await page.evaluate(() => {
            const root = document.querySelector<HTMLElement>('[data-plate][data-ship-id="g-pirate"]')!;
            const body = root.querySelector('.wo-plate__body')!;
            const cs = getComputedStyle(root);
            const op = cs.display === 'none' || cs.visibility === 'hidden' ? 0 : Number(cs.opacity) * Number(getComputedStyle(body).opacity);
            const p = body.getBoundingClientRect();
            const blocks = Array.from(document.querySelectorAll('[data-hud-block]')).map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
            return { op, sep: Math.min(...blocks.map((b) => Math.max(b.left - p.right, p.left - b.right, b.top - p.bottom, p.top - b.bottom))) };
          });
          console.log(`AD-32 captura ${vp.name}-${name}: opacidad ${plate.op.toFixed(2)} · separación mín. a un bloque del HUD ${plate.sep.toFixed(1)} px`);
          if (stack) {
            expect.soft(plate.op, `${vp.name}-${name}: placa visible`).toBeGreaterThan(0.99);
            expect.soft(plate.sep, `${vp.name}-${name}: a 16–32 px del bloque más cercano`).toBeGreaterThanOrEqual(16);
            expect.soft(plate.sep, `${vp.name}-${name}: a 16–32 px del bloque más cercano`).toBeLessThanOrEqual(32);
          } else expect.soft(plate.op, `${vp.name}-${name}: placa oculta`).toBe(0);
        }
        await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
      } finally {
        await page.context().close();
      }
    });
  }
});

// Indicadores de borde y botón Centrar (E13, ART-DIRECTION §12.8, D89; AD-30): AC-121 el chip del barco propio en vista
// libre, AC-124 el de atacante, AC-119 Centrar y el chip propio devuelven la cámara y AC-110 la pista los esquiva. La regla
// de colocación la cubre src/client/__tests__/edge-chips.test.ts contra place() de la lámina; aquí, la sesión real con las
// cajas del DOM: la del chip (forma y distancia) dentro del marco útil y a ≥ 8 px (±1) de cada [data-hud-block], y el
// triángulo a ≤ 10° de la dirección real al barco
import { expect, Page, test } from '@playwright/test';
import { EDGE_ATTACK } from '../server/scenarios';
import { hudLayout } from '../src/client/art';
import type { ChipRect } from '../src/client/edge-chip-layer';
import { USABLE_FRAME } from '../src/client/edge-chips';
import { enterGame, hud, me, waitFor } from './helpers';
import { startOwnServer } from './own-server';

type Point = { x: number; z: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };

const chips = (page: Page) => page.evaluate(() => window.__SEA_BATTLE__!.runtime().chipRects() as ChipRect[]);
const mode = (page: Page) => page.evaluate(() => window.__SEA_BATTLE__!.runtime().freeView.mode as string);
const hudBlocks = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-hud-block]'))
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }))
  );
const boxOf = (testId: string) => (page: Page) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el || getComputedStyle(el).visibility === 'hidden') return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 ? { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom } : null;
  }, testId);
const hintBox = boxOf('hint');
const recenterBox = boxOf('recenter');
const crosses = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// La vista libre centrada para que el barco propio quede a `off` metros del centro (como build() de la lámina)
async function viewWithShipAt(page: Page, off: Point): Promise<Point> {
  const s = (await me(page))!;
  await page.evaluate(([x, z]) => window.__SEA_BATTLE__!.runtime().freeView.centerOn({ x, z }, performance.now()), [s.x - off.x, s.z - off.z]);
  await waitFor(() => mode(page), (m) => m === 'free', 2000, 50);
  await page.waitForTimeout(150); // la cámara llega al centro en el mismo frame; un frame más para la capa de chips
  return { x: s.x, z: s.z };
}

// AD-30: caja dentro del marco útil, a ≥ 8 px (±1) de cada bloque del HUD, triángulo a ≤ 10° y pista sin cruzarse
async function checkChip(page: Page, kind: ChipRect['kind'], target: Point, label: string): Promise<ChipRect> {
  await waitFor(() => chips(page), (l) => l.some((c) => c.kind === kind), 2000, 50);
  await page.waitForTimeout(150); // la pista se recoloca a 10 Hz
  const c = (await chips(page)).find((x) => x.kind === kind)!;
  const { width: vw, height: vh } = page.viewportSize()!;
  const f = USABLE_FRAME[hudLayout(vw, vh)];
  const blocks = await hudBlocks(page);
  const p = (await page.evaluate(([x, z]) => window.__SEA_BATTLE__!.runtime().project(x, z), [target.x, target.z]))!;
  const real = (Math.atan2(p.sy - c.cy, p.sx - c.cx) * 180) / Math.PI;
  const err = Math.abs((((c.deg - real + 180) % 360) + 360) % 360 - 180);
  const box = { x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h };
  const gaps = blocks.map((b) => Math.max(b.x0 - box.x1, box.x0 - b.x1, b.y0 - box.y1, box.y0 - b.y1));
  const hint = await hintBox(page);
  console.log(
    `${label}: ${kind} en ${c.cx.toFixed(1)}, ${c.cy.toFixed(1)} · caja ${box.x0.toFixed(1)}–${box.x1.toFixed(1)} × ${box.y0.toFixed(1)}–${box.y1.toFixed(1)} · distancia ${c.side} · deslizado ${c.travel} px · error ${err.toFixed(2)}° · bloque más cercano a ${Math.min(...gaps).toFixed(1)} px · pista ${hint ? `${hint.y0.toFixed(0)}–${hint.y1.toFixed(0)}` : 'oculta o sin pista'}`
  );
  expect(err).toBeLessThanOrEqual(10);
  expect(box.x0).toBeGreaterThanOrEqual(f.l - 1);
  expect(box.x1).toBeLessThanOrEqual(vw - f.r + 1);
  expect(box.y0).toBeGreaterThanOrEqual(f.t - 1);
  expect(box.y1).toBeLessThanOrEqual(vh - f.b + 1);
  for (const g of gaps) expect(g).toBeGreaterThanOrEqual(7);
  // AC-110: la pista no se cruza con el chip ni con Centrar
  if (hint) {
    expect(crosses(hint, box)).toBe(false);
    const rc = await recenterBox(page);
    if (rc) expect(crosses(hint, rc)).toBe(false);
  }
  return c;
}

const DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315];
const ring = (deg: number, m = 140): Point => ({ x: m * Math.cos((deg * Math.PI) / 180), z: m * Math.sin((deg * Math.PI) / 180) });

// Las 8 direcciones y el caso de la lámina en el que el rayo cae sobre un bloque (el chip se desliza)
async function eightAndBlocked(page: Page, label: string, blocked: Point) {
  for (const deg of DIRECTIONS) {
    const ship = await viewWithShipAt(page, ring(deg));
    await expect(page.getByTestId('recenter')).toBeVisible();
    await checkChip(page, 'self', ship, `AC-121 ${label} ${deg}°`);
  }
  const ship = await viewWithShipAt(page, blocked);
  const c = await checkChip(page, 'self', ship, `AC-121 ${label} rayo sobre un bloque (${blocked.x}, ${blocked.z}) m`);
  expect(c.travel).toBeGreaterThan(0);
}

test.describe('Indicadores de borde y Centrar (E13)', () => {
  test('AC-121 y AD-30 en 1440×900: 8 direcciones, el rayo sobre el minimapa y Centrar, y bajo la barra de acciones sí sale', async ({ page }) => {
    await enterGame(page);
    await expect(page.getByTestId('recenter')).toHaveCount(0); // Centrar solo existe en vista libre
    await eightAndBlocked(page, '1440×900', { x: 150, z: -60 });
    // En pantalla pero bajo la barra de acciones (808–884): fuera del marco útil, así que sale
    const ship = await viewWithShipAt(page, { x: 0, z: 79 });
    const p = (await page.evaluate(([x, z]) => window.__SEA_BATTLE__!.runtime().project(x, z), [ship.x, ship.z]))!;
    console.log(`AC-121 bajo la barra de acciones: barco en y = ${p.sy.toFixed(1)}`);
    expect(p.sy).toBeGreaterThan(808);
    expect(p.sy).toBeLessThan(884);
    await checkChip(page, 'self', ship, 'AC-121 bajo la barra de acciones');
    // Dentro del marco útil no sale
    await viewWithShipAt(page, { x: 0, z: 30 });
    await page.waitForTimeout(250); // el de antes se va en 150 ms
    expect((await chips(page)).filter((c) => c.kind === 'self')).toHaveLength(0);
  });

  test('AC-119: Centrar y el chip propio devuelven la cámara al barco; los dos desaparecen al volver', async ({ page }) => {
    await enterGame(page);
    const centred = async () => {
      const s = (await me(page))!;
      const p = (await page.evaluate(([x, z]) => window.__SEA_BATTLE__!.runtime().project(x, z), [s.x, s.z]))!;
      const { width, height } = page.viewportSize()!;
      return Math.abs(p.sx - width / 2) <= 0.05 * width && Math.abs(p.sy - height / 2) <= 0.05 * height;
    };
    for (const how of ['Centrar', 'chip propio'] as const) {
      await viewWithShipAt(page, ring(30));
      await checkChip(page, 'self', (await me(page))!, `AC-119 antes de ${how}`);
      const t0 = Date.now();
      if (how === 'Centrar') await page.getByTestId('recenter').click();
      else await page.locator('[data-edge-chip][data-chip="self"]').click();
      await waitFor(() => mode(page), (m) => m === 'follow', 2000, 20);
      const ms = Date.now() - t0;
      console.log(`AC-119 ${how}: seguimiento a los ${ms} ms (con la ida y vuelta de Playwright)`);
      expect(await centred()).toBe(true);
      await expect(page.getByTestId('recenter')).toHaveCount(0);
      await page.waitForTimeout(250);
      expect(await chips(page)).toHaveLength(0);
    }
  });

  test('AC-121 y AD-30 @mobile en 390×844 (el rayo sobre Centrar) y 844×390 (sobre Reparar)', async ({ page }) => {
    test.setTimeout(120_000);
    await enterGame(page);
    await eightAndBlocked(page, '390×844', { x: 80, z: 110 });
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().freeView.returnToFollow(performance.now()));
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(400);
    await eightAndBlocked(page, '844×390', { x: 170, z: 40 });
  });

  test('AC-124: quien te dispara desde fuera del marco útil tiene su chip; al pulsarlo se selecciona sin mover la cámara; 3 s después del último disparo se va', async ({ page }) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'edge-attack' });
    try {
      await enterGame(page, server.url);
      const post = { x: EDGE_ATTACK.pirate.x, z: EDGE_ATTACK.pirate.z - EDGE_ATTACK.standoff };
      await page.evaluate(([x, z]) => window.__SEA_BATTLE__!.runtime().client.moveTo(x, z), [post.x, post.z]);
      await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - post.x, s.z - post.z) < 3, 40_000, 200);
      // Las andanadas que llegan, con su hora en la página
      await page.evaluate(() => {
        const rt = window.__SEA_BATTLE__!.runtime();
        const w = window as unknown as { __volleys: number[] };
        w.__volleys = [];
        rt.client.onEvent((e) => {
          if (e.type === 'volley' && e.targetId === rt.client.myShipId) w.__volleys.push(performance.now());
        });
      });
      // Dentro del marco útil (zoom normal) no sale
      await page.keyboard.press('Tab');
      await page.keyboard.press('Space');
      const volleys = () => page.evaluate(() => (window as unknown as { __volleys: number[] }).__volleys.length);
      await waitFor(volleys, (n) => n >= 1, 15_000, 100);
      await page.waitForTimeout(200);
      expect((await chips(page)).filter((c) => c.kind === 'attacker')).toHaveLength(0);
      // Más cerca (0,7×): el pirata queda bajo el borde de abajo del marco útil y su chip sale con la siguiente andanada
      await page.evaluate(() => window.__SEA_BATTLE__!.runtime().setZoomLevel(0));
      const pirate = ((await page.evaluate(() => window.__SEA_BATTLE__!.ships())) as { id: string; kind: string; x: number; z: number }[]).find((x) => x.kind === 'pirate')!;
      await waitFor(() => chips(page), (l) => l.some((x) => x.kind === 'attacker'), 15_000, 100);
      const c = await checkChip(page, 'attacker', pirate, 'AC-124 1440×900, pirata a 52 m al sur con 0,7×');
      expect(c.id).toBe(pirate.id);
      // Al pulsarlo se selecciona como objetivo y la cámara no se mueve. Antes, Esc cancela el ataque y Esc deselecciona
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await waitFor(() => hud(page), (h) => h.selectedId === null, 2000, 50);
      const focus = () => page.evaluate(() => ({ x: window.__SEA_BATTLE__!.runtime().focusX, z: window.__SEA_BATTLE__!.runtime().focusZ }));
      const cam0 = await focus();
      await page.locator(`[data-edge-chip][data-ship-id="${pirate.id}"]`).click();
      await waitFor(() => hud(page), (h) => h.selectedId === pirate.id, 2000, 50);
      const cam1 = await focus();
      expect(await mode(page)).toBe('follow');
      expect(Math.hypot(cam1.x - cam0.x, cam1.z - cam0.z)).toBeLessThan(0.5);
      // Fuera de su alcance ya no dispara: el chip sigue hasta 3 s después del último disparo y se va en 300 ms
      await page.evaluate(([x, z]) => window.__SEA_BATTLE__!.runtime().client.moveTo(x, z), [post.x, post.z - 60]);
      const gone = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const tick = () => {
              const w = window as unknown as { __volleys: number[] };
              const list = window.__SEA_BATTLE__!.runtime().chipRects();
              if (!list.some((x) => x.kind === 'attacker')) resolve(performance.now() - w.__volleys[w.__volleys.length - 1]);
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          })
      );
      console.log(`AC-124: ${await volleys()} andanadas; el chip se fue ${gone.toFixed(0)} ms después de la última`);
      expect(gone).toBeGreaterThanOrEqual(3000);
      expect(gone).toBeLessThanOrEqual(3300 + 250); // + unos frames: con WebGL por software un frame llega a 100 ms
    } finally {
      await server.kill();
    }
  });
});

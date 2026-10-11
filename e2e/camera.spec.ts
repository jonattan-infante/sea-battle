// Cámara (GDD §5, ART-DIRECTION §6.2–6.3): AC-23 seguimiento, AC-24 encuadre por alcance (U8, D26) y AC-25 rueda.
// La fórmula de ppm₀ por viewport y nivel de cañón la fija el Jest de src/client/__tests__/framing.test.ts; aquí se
// comprueba la sesión real: N1 al entrar y el cambio de R al comprar un cañón en la tienda.
import { expect, Page, test } from '@playwright/test';
import { PORTS } from '../playwright.config';
import { clickWater, enterGame, me, waitFor } from './helpers';

const frame = (page: Page) =>
  page.evaluate(() => {
    const s = window.__SEA_BATTLE__!.runtime().stats();
    return { ppm: s.ppm, ppm0: s.ppm0, frameRange: s.frameRange };
  });

// AC-24 con compra real: escenario "shipyard" (2 000 de oro = N2 por 500 + N3 por 1 500). Con la tienda abierta el
// encuadre no cambia; al cerrarla, ease-in-out de 600 ms hacia el ppm₀ de la tabla de §6.2
async function buyCannonsAndCheckFrame(page: Page, label: string, n1: number, [n2, n3]: [number, number], shop: { open: () => Promise<void>; close: () => Promise<void> }) {
  test.setTimeout(60_000);
  await enterGame(page, `http://localhost:${PORTS.empty}`);
  const first = await waitFor(() => frame(page), (v) => v.frameRange === 65, 5000, 100);
  expect(Math.abs(first.ppm0 - n1)).toBeLessThanOrEqual(0.01);

  for (const [level, range, ppm0] of [[2, 70, n2], [3, 80, n3]] as const) {
    const before = await frame(page);
    await shop.open();
    await page.getByTestId(`buy-cannons-${level}`).click();
    await waitFor(() => page.evaluate(() => (window.__SEA_BATTLE__!.player() as { upgrades: { cannons: number } } | null)?.upgrades.cannons), (c) => c === level, 5000, 50);
    // Con la tienda abierta el encuadre no cambia
    await page.waitForTimeout(400);
    const open = await frame(page);
    expect(open.frameRange).toBe(before.frameRange);
    expect(open.ppm0).toBeCloseTo(before.ppm0, 6);
    await shop.close();
    await expect(page.getByTestId('shop')).toHaveCount(0);
    // A mitad de la transición (ease-in-out de 600 ms) el valor está entre los dos
    await page.waitForTimeout(300);
    const mid = await frame(page);
    await page.waitForTimeout(500);
    const done = await frame(page);
    console.log(`AC-24 N${level} ${label}: R ${done.frameRange} m · ppm₀ ${before.ppm0.toFixed(3)} → a ~300 ms ${mid.ppm0.toFixed(3)} → ${done.ppm0.toFixed(3)} (tabla ${ppm0})`);
    expect(done.frameRange).toBe(range);
    expect(Math.abs(done.ppm0 - ppm0)).toBeLessThanOrEqual(0.01);
    expect(mid.ppm0).toBeLessThan(before.ppm0);
    expect(mid.ppm0).toBeGreaterThan(done.ppm0);
  }
}

test.describe('Cámara', () => {
  test('AC-23: navegando en seguimiento, el barco propio queda en el 10 % central en 10 frames', async ({ page }) => {
    await enterGame(page);
    await clickWater(page, 320, -160);
    const start = (await me(page))!;
    await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - start.x, s.z - start.z) > 3, 10_000, 100);
    // 10 frames seguidos (requestAnimationFrame): proyección del barco y tamaño del viewport en cada uno
    const samples = await page.evaluate(
      () =>
        new Promise<{ x: number; z: number; sx: number; sy: number; w: number; h: number }[]>((resolve) => {
          const out: { x: number; z: number; sx: number; sy: number; w: number; h: number }[] = [];
          const tick = () => {
            const s = window.__SEA_BATTLE__!.me() as { x: number; z: number };
            const p = window.__SEA_BATTLE__!.runtime().project(s.x, s.z)!;
            out.push({ x: s.x, z: s.z, sx: p.sx, sy: p.sy, w: innerWidth, h: innerHeight });
            if (out.length < 10) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        })
    );
    const moved = Math.hypot(samples[9].x - samples[0].x, samples[9].z - samples[0].z);
    const worst = Math.max(...samples.map((p) => Math.max(Math.abs(p.sx - p.w / 2) / p.w, Math.abs(p.sy - p.h / 2) / p.h)));
    console.log(`AC-23: 10 frames · el barco avanzó ${moved.toFixed(2)} m · desvío máximo respecto del centro ${(100 * worst).toFixed(2)} % del viewport (límite 5 %)`);
    expect(moved).toBeGreaterThan(0);
    // 10 % central = caja centrada de 10 % del ancho × 10 % del alto
    for (const p of samples) {
      expect(Math.abs(p.sx - p.w / 2)).toBeLessThanOrEqual(0.05 * p.w);
      expect(Math.abs(p.sy - p.h / 2)).toBeLessThanOrEqual(0.05 * p.h);
    }
  });

  test('AC-24: la sesión nueva (cañón N1) encuadra R = 65 m con ppm₀ ≈ 6,20 en 1440×900', async ({ page }) => {
    await enterGame(page);
    const f = await waitFor(() => frame(page), (v) => v.frameRange === 65, 5000, 100);
    console.log(`AC-24 N1 escritorio: R ${f.frameRange} m · ppm₀ ${f.ppm0.toFixed(3)} · ppm ${f.ppm.toFixed(3)}`);
    expect(Math.abs(f.ppm0 - 6.2)).toBeLessThanOrEqual(0.01);
  });

  test('AC-24 @mobile: la sesión nueva (cañón N1) encuadra R = 65 m con ppm₀ ≈ 2,82 en 390×844', async ({ page }) => {
    await enterGame(page);
    const f = await waitFor(() => frame(page), (v) => v.frameRange === 65, 5000, 100);
    console.log(`AC-24 N1 móvil: R ${f.frameRange} m · ppm₀ ${f.ppm0.toFixed(3)} · ppm ${f.ppm.toFixed(3)}`);
    expect(Math.abs(f.ppm0 - 2.82)).toBeLessThanOrEqual(0.01);
  });

  test('AC-24: al comprar el cañón N2 y luego el N3, ppm₀ pasa a 5,76 y a 5,04 al cerrar la tienda, en 600 ms', async ({ page }) => {
    await buyCannonsAndCheckFrame(page, 'escritorio', 6.2, [5.76, 5.04], {
      open: () => page.keyboard.press('KeyP'),
      close: () => page.keyboard.press('Escape')
    });
  });

  test('AC-24 @mobile: al comprar el cañón N2 y luego el N3, ppm₀ pasa a 2,61 y a 2,29 en 390×844 al cerrar la tienda, en 600 ms', async ({ page }) => {
    // En móvil la tienda se abre con el botón Puerto del HUD móvil (m-port) y se cierra con su botón de cerrar (sin teclado)
    await buyCannonsAndCheckFrame(page, 'móvil', 2.82, [2.61, 2.29], {
      open: () => page.getByTestId('m-port').tap(),
      close: () => page.getByRole('button', { name: 'Cerrar (Esc)' }).tap()
    });
  });

  test('AC-25: la rueda pasa por exactamente 3 niveles (0,7×, 1,0× y 1,5×) y la página no hace scroll', async ({ page }) => {
    await enterGame(page);
    // Registra si cada wheel llegó a la ventana con preventDefault (la página no puede desplazarse con él)
    await page.evaluate(() => {
      const w = window as unknown as { __wheel: boolean[] };
      w.__wheel = [];
      window.addEventListener('wheel', (e) => w.__wheel.push(e.defaultPrevented));
    });
    const ship = (await me(page))!;
    await page.mouse.move(ship.screen!.sx + 200, ship.screen!.sy); // sobre el agua, fuera del HUD
    const state = () =>
      page.evaluate(() => {
        const s = window.__SEA_BATTLE__!.runtime().stats();
        return { f: Math.round((s.ppm0 / s.ppm) * 1000) / 1000, scrollY: window.scrollY, scrollTop: document.scrollingElement?.scrollTop ?? 0 };
      });
    const seen: number[] = [];
    // 4 pasos hacia abajo (más lejos) y 6 hacia arriba (más cerca): los extremos no pasan de 1,5× ni de 0,7×
    for (const dy of [120, 120, 120, 120, -120, -120, -120, -120, -120, -120]) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(400); // espera mínima entre pasos (220 ms) + transición de 180 ms
      const s = await state();
      seen.push(s.f);
      expect(s.scrollY).toBe(0);
      expect(s.scrollTop).toBe(0);
    }
    const prevented = await page.evaluate(() => (window as unknown as { __wheel: boolean[] }).__wheel);
    console.log(`AC-25: niveles tras cada paso ${seen.join(' → ')} · ${prevented.length} eventos wheel, con preventDefault: ${prevented.filter(Boolean).length}`);
    expect([...new Set(seen)].sort((a, b) => a - b)).toEqual([0.7, 1, 1.5]);
    expect(seen).toEqual([1.5, 1.5, 1.5, 1.5, 1, 0.7, 0.7, 0.7, 0.7, 0.7]);
    expect(prevented.length).toBeGreaterThanOrEqual(10);
    expect(prevented.every(Boolean)).toBe(true);
  });
});

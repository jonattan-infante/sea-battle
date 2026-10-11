// AC-89 y VFX-01/02/03 (VFX-SPEC §15) con la escena estándar sintética del runtime (src/client/synthetic-scene.ts):
// 20 barcos de jugadores + 20 NPC + 1 Fragata en lugar del jefe, todos en pantalla con 1,0× y el cañón N3 (5,04 px/m,
// la densidad en metros con la que se compone la escena, D31), una isla y 8 duelos simultáneos. Sin servidor de por medio para los barcos: el runtime dibuja exactamente lo mismo que en
// una partida, pero la escena es reproducible. AC-107 (declutter con el indicador de recarga) usa la misma escena
// con uno de los barcos en duelo como propio.
import { expect, test } from '@playwright/test';
import { enterGame } from './helpers';

interface Sample {
  calls: number;
  triangles: number;
  vfxCalls: number;
}

test.describe('Escena estándar @perf', () => {
  test('AC-89: 41 barcos en pantalla, ≤ 100 draw calls y ≤ 250 000 triángulos; VFX-01 ≤ 7 (tope 11); VFX-02 Δ = 0', async ({ page }) => {
    test.setTimeout(90_000);
    await enterGame(page);
    const setup = await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      rt.setCameraPreset('game');
      rt.setZoomLevel(1); // 1,0× (por defecto)
      const scene = rt.startScene('standard', { cannonLevel: 3 }); // con N3 cabe entera (D31)
      return { ships: scene.spec.ships.length, duels: scene.spec.duels.length, ids: scene.spec.ships.map((s) => s.id) };
    });
    expect(setup.ships).toBe(41);
    await page.waitForTimeout(3000); // transición de zoom, primeras andanadas y pools en régimen

    // Todos los barcos y la isla dentro del viewport
    const onScreen = await page.evaluate((ids) => {
      const rt = window.__SEA_BATTLE__!.runtime();
      const inside = (p: { sx: number; sy: number } | null) => !!p && p.sx >= 0 && p.sx <= window.innerWidth && p.sy >= 0 && p.sy <= window.innerHeight;
      const ships = ids.filter((id) => {
        const v = rt.view(id);
        return !!v && inside(rt.project(v.ship.x, v.ship.z));
      }).length;
      return { ships, island: inside(rt.project(260, 200)) }; // I1
    }, setup.ids);
    expect(onScreen.ships).toBe(41);
    expect(onScreen.island).toBe(true);

    const memory0 = await page.evaluate(() => window.__SEA_BATTLE__!.runtime().memoryInfo());

    // 20 muestras en 10 s: mismo estado dibujado con y sin VFX (VFX-01) y el frame normal
    const samples: Sample[] = [];
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      samples.push(await page.evaluate(() => {
        const rt = window.__SEA_BATTLE__!.runtime();
        const frame = rt.lastFrameInfo();
        rt.setVfxVisible(false);
        const without = rt.renderFrame()!;
        rt.setVfxVisible(true);
        const withVfx = rt.renderFrame()!;
        return { calls: Math.max(frame.calls, withVfx.calls), triangles: Math.max(frame.triangles, withVfx.triangles), vfxCalls: withVfx.calls - without.calls };
      }));
    }
    const memory1 = await page.evaluate(() => window.__SEA_BATTLE__!.runtime().memoryInfo());
    const max = (k: keyof Sample) => Math.max(...samples.map((s) => s[k]));
    console.log(`AC-89: ${onScreen.ships} barcos en pantalla · máx. ${max('calls')} draw calls · máx. ${max('triangles')} triángulos · VFX-01 máx. ${max('vfxCalls')} · memoria ${JSON.stringify(memory0)} → ${JSON.stringify(memory1)}`);
    expect(max('calls')).toBeLessThanOrEqual(100);
    expect(max('triangles')).toBeLessThanOrEqual(250_000);
    expect(max('vfxCalls')).toBeLessThanOrEqual(11);
    expect(memory1.geometries).toBe(memory0.geometries);
    expect(memory1.textures).toBe(memory0.textures);
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
  });
});

interface PlateSample {
  reload: boolean; // el indicador de recarga propio se ve
  ownWithReload: boolean; // la caja propia de plateRects() lo incluye
  reloadOverlap: number; // px² del indicador sobre placas ajenas
  ownOverlap: number; // px² de la caja propia (con el indicador) sobre placas ajenas
  plates: number;
}

test.describe('Escena estándar', () => {
  test('AC-107: el indicador de recarga propio (18 px) no se cruza con ninguna placa ajena', async ({ page }) => {
    test.setTimeout(60_000);
    await enterGame(page);
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      rt.setCameraPreset('game');
      rt.setZoomLevel(1);
      // s9 está en duelo y su placa cae justo a la derecha de la de s8: sin el indicador en la caja propia, la
      // recarga pisa la placa de s8 en la mayoría de los instantes
      rt.startScene('standard', { myShipId: 's9', cannonLevel: 3 });
    });
    await page.waitForTimeout(2500);

    // 20 instantes distintos: avanza 250 ms, congela y deja ≥ 1 pasada del declutter (10 Hz) sobre ese estado,
    // así las cajas se miden sin la deriva del movimiento entre dos pasadas
    const samples: PlateSample[] = [];
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.__SEA_BATTLE__!.runtime().setPaused(false));
      await page.waitForTimeout(250);
      samples.push(await page.evaluate(async () => {
        const rt = window.__SEA_BATTLE__!.runtime();
        rt.setPaused(true);
        await new Promise((r) => setTimeout(r, 200));
        const rects = rt.plateRects();
        const own = rects.find((p) => p.id === 's9');
        const el = document.querySelector('[data-ship-id="s9"] [data-reload]');
        const q = el?.classList.contains('is-visible') ? el.getBoundingClientRect() : null;
        const area = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
          Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        let reloadOverlap = 0;
        let ownOverlap = 0;
        for (const p of rects) {
          if (p.id === 's9') continue;
          if (q) reloadOverlap = Math.max(reloadOverlap, area({ x: q.left, y: q.top, w: q.width, h: q.height }, p));
          if (own) ownOverlap = Math.max(ownOverlap, area(own, p));
        }
        return { reload: !!q && q.width === 18, ownWithReload: !!own?.reload, reloadOverlap, ownOverlap, plates: rects.length };
      }));
    }
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      rt.setPaused(false);
      rt.stopScene();
    });
    const max = (k: 'reloadOverlap' | 'ownOverlap') => Math.max(...samples.map((s) => s[k]));
    console.log(`AC-107: indicador visible en ${samples.filter((s) => s.reload).length}/20 · solape máx. del indicador ${max('reloadOverlap')} px² · de la caja propia ${max('ownOverlap')} px² · ${Math.min(...samples.map((s) => s.plates))}–${Math.max(...samples.map((s) => s.plates))} placas`);
    expect(samples.every((s) => s.reload && s.ownWithReload)).toBe(true);
    expect(max('reloadOverlap')).toBe(0);
    expect(max('ownOverlap')).toBe(0);
  });
});

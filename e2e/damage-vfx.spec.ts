// Humo y fuego de vida baja en móvil (VFX-SPEC §0.4 y §6, D32): son información de daño (AC-104), así que no se
// recortan con la calidad baja (tasa y vida completas). A cambio, humo en ≤ 12 barcos y fuego en ≤ 4, los más cercanos
// al centro de la pantalla. Escenas sintéticas del runtime (src/client/synthetic-scene.ts) en el proyecto móvil.
import { expect, test } from '@playwright/test';
import { enterGame } from './helpers';

const PUFF = 7; // SHAPE.puff: bocanada de humo de daño (P_ALPHA)
const FLAME = 8; // SHAPE.damageFlame: cuerpo de llama en P_ALPHA (el núcleo va en P_ADD)

test.describe('Humo y fuego de daño en móvil', () => {
  test('D32 @mobile: el Mercante al 20 % mantiene la tasa completa (≥ 19 bocanadas y ≥ 12 llamas vivas, no la mitad)', async ({ page }) => {
    await enterGame(page);
    const mobile = await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      rt.setCameraPreset('game');
      rt.setZoomLevel(1);
      const scene = rt.startScene('damage');
      for (const id of ['d-sloop', 'd-frigate']) scene.getShip(id)!.hp = scene.getShip(id)!.maxHp;
      const m = scene.getShip('d-merchant')!;
      m.hp = Math.round(0.2 * m.maxHp); // humo denso (6/s) y fuego en 2 sockets (12/s cada uno)
      return rt.mobile;
    });
    expect(mobile).toBe(true);
    await page.waitForTimeout(4500); // > 3,4 s de vida del humo: régimen estable

    // Con tasa completa: 6/s × 3,4 s ≈ 20 bocanadas y 2 × 12/s × 0,55 s ≈ 13 llamas; con × 0,5 serían ≈ 10 y ≈ 7
    const samples: { puffs: number; flames: number }[] = [];
    for (let i = 0; i < 10; i++) {
      samples.push(await page.evaluate(([puff, flame]) => {
        const fx = window.__SEA_BATTLE__!.runtime().effects;
        return { puffs: fx.alpha.live(fx.time, puff), flames: fx.alpha.live(fx.time, flame) };
      }, [PUFF, FLAME]));
      await page.waitForTimeout(150);
    }
    const min = (k: 'puffs' | 'flames') => Math.min(...samples.map((s) => s[k]));
    const max = (k: 'puffs' | 'flames') => Math.max(...samples.map((s) => s[k]));
    console.log(`D32 móvil: bocanadas vivas ${min('puffs')}–${max('puffs')} · llamas vivas ${min('flames')}–${max('flames')} (10 muestras)`);
    expect(min('puffs')).toBeGreaterThanOrEqual(19);
    expect(max('puffs')).toBeLessThanOrEqual(21);
    expect(min('flames')).toBeGreaterThanOrEqual(12);
    expect(max('flames')).toBeLessThanOrEqual(14);
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
  });

  test('D32 @mobile: en la escena estándar, humo en ≤ 12 barcos y fuego en ≤ 4, los más cercanos al centro', async ({ page }) => {
    await enterGame(page);
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      rt.setCameraPreset('game');
      rt.setZoomLevel(1);
      rt.startScene('standard', { cannonLevel: 3 });
    });
    await page.waitForTimeout(1000);
    const views = await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      return [...rt.views.values()].map((v) => ({
        id: v.id, smoke: v.smoke, fire: v.fire, smokeSlot: v.smokeSlot, fireSlot: v.fireSlot,
        d: Math.hypot(v.ship.x - rt.focusX, v.ship.z - rt.focusZ)
      }));
    });
    const check = (lit: typeof views, slotted: typeof views, cap: number, label: string) => {
      const out = lit.filter((v) => !slotted.includes(v));
      console.log(`D32 móvil: ${label} en ${lit.length} barcos → con ranura ${slotted.length} (tope ${cap}) · distancia máx. con ranura ${Math.max(...slotted.map((v) => v.d)).toFixed(1)} m · mín. sin ranura ${out.length ? Math.min(...out.map((v) => v.d)).toFixed(1) : '—'} m`);
      expect(lit.length).toBeGreaterThan(cap); // la escena tiene que forzar el tope
      expect(slotted.length).toBe(cap);
      expect(Math.max(...slotted.map((v) => v.d))).toBeLessThanOrEqual(Math.min(...out.map((v) => v.d)));
    };
    check(views.filter((v) => v.smoke), views.filter((v) => v.smoke && v.smokeSlot), 12, 'humo');
    check(views.filter((v) => v.fire), views.filter((v) => v.fire && v.fireSlot), 4, 'fuego');
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
  });
});

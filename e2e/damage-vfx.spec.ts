// Humo y fuego de vida baja en móvil (VFX-SPEC §0.4 y §6, D32): son información de daño (AC-104), así que no se
// recortan con la calidad baja (tasa y vida completas). A cambio, humo en ≤ 12 barcos y fuego en ≤ 4, los más cercanos
// al centro de la pantalla. Escenas sintéticas del runtime (src/client/synthetic-scene.ts) en el proyecto móvil.
import { expect, Page, test } from '@playwright/test';
import { enterGame } from './helpers';

const PUFF = 7; // SHAPE.puff: bocanada de humo de daño (P_ALPHA)
const FLAME = 8; // SHAPE.damageFlame: cuerpo de llama en P_ALPHA (el núcleo va en P_ADD)

test.describe('Humo y fuego de daño en móvil', () => {
  test('D32 @mobile: el Mercante al 20 % mantiene la tasa y la vida completas (≥ 18 llamas/s y ≥ 4,5 bocanadas/s simulados, no la mitad)', async ({ page }) => {
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
    await slowFrames(page); // CONTROL C2: frames lentos a propósito; el test de la A tiene que pasar
    await page.waitForTimeout(4500); // > 3,4 s de vida del humo: régimen estable

    // O-66: se aserta lo nacido por segundo simulado (nacidas en la ventana ÷ Σ step), que no depende de los fps. Con
    // frames de más de 100 ms el step se queda en 0,1 s (runtime.ts:1285) y las vivas bajan, pero lo nacido por segundo
    // simulado no. Tasa completa: 2 × 12 = 24 llamas/s y 6 bocanadas/s; con × 0,5, 12 y 3. La ventana, de ≥ 2 s simulados:
    // con ± 1 tanda por emisor en la ventana, la completa y la mitad no se tocan
    const WINDOW_S = 2;
    const clock = () => page.evaluate(([puff, flame]) => {
      const rt = window.__SEA_BATTLE__!.runtime();
      const { born, bornLife } = rt.effects.alpha;
      return { frames: rt.vfxClock.frames, step: rt.vfxClock.step, puffs: born[puff], flames: born[flame], puffLife: bornLife[puff], flameLife: bornLife[flame] };
    }, [PUFF, FLAME]);
    const c0 = await clock();
    let c1 = c0;
    // Las vivas en un instante, cada 150 ms: solo al log y para los máximos (con tasa completa, ≈ 20 bocanadas y ≈ 13 llamas)
    const samples: { puffs: number; flames: number }[] = [];
    for (let i = 0; i < 80 && (samples.length < 10 || c1.step - c0.step < WINDOW_S); i++) {
      samples.push(await page.evaluate(([puff, flame]) => {
        const fx = window.__SEA_BATTLE__!.runtime().effects;
        return { puffs: fx.alpha.live(fx.time, puff), flames: fx.alpha.live(fx.time, flame) };
      }, [PUFF, FLAME]));
      await page.waitForTimeout(150);
      c1 = await clock();
    }
    // Los intervalos de frame de la ventana (ms), del anillo del runtime: si cae, el log dice a qué ritmo iba
    const dts = await page.evaluate(([f0, f1]) => {
      const ring = window.__SEA_BATTLE__!.runtime().vfxClock.dts;
      const out: number[] = [];
      for (let f = Math.max(f0, f1 - ring.length); f < f1; f++) out.push(ring[f % ring.length] * 1000);
      return out.sort((a, b) => a - b);
    }, [c0.frames, c1.frames]);
    const step = c1.step - c0.step;
    const [flames, puffs] = [c1.flames - c0.flames, c1.puffs - c0.puffs];
    const [flameRate, puffRate] = [flames / step, puffs / step];
    const [flameLife, puffLife] = [(c1.flameLife - c0.flameLife) / flames, (c1.puffLife - c0.puffLife) / puffs];
    const min = (k: 'puffs' | 'flames') => Math.min(...samples.map((s) => s[k]));
    const max = (k: 'puffs' | 'flames') => Math.max(...samples.map((s) => s[k]));
    const ms = (q: number) => dts[Math.min(dts.length - 1, Math.floor(q * dts.length))].toFixed(0);
    console.log(`D32 móvil: tasa de llamas ${flameRate.toFixed(1)}/s y de bocanadas ${puffRate.toFixed(2)}/s por segundo simulado (${flames} llamas y ${puffs} bocanadas en Σ step ${step.toFixed(2)} s) · vida media ${flameLife.toFixed(3)} s y ${puffLife.toFixed(3)} s · ${dts.length} frames de ${ms(0)}/${ms(0.5)}/${ms(1)} ms (mín./mediana/máx.), ${dts.filter((d) => d > 100).length} de más de 100 ms`);
    console.log(`D32 móvil: bocanadas vivas ${min('puffs')}–${max('puffs')} · llamas vivas ${min('flames')}–${max('flames')} (${samples.length} muestras)`);
    expect(step, 'la ventana llega a 2 s simulados').toBeGreaterThanOrEqual(WINDOW_S);
    expect(flameRate, 'llamas nacidas por segundo simulado (24 con la tasa completa, 12 con la mitad)').toBeGreaterThanOrEqual(18);
    expect(puffRate, 'bocanadas nacidas por segundo simulado (6 con la tasa completa, 3 con la mitad)').toBeGreaterThanOrEqual(4.5);
    // La vida completa (DAMAGE_FX.flameLife y smokeLife, effects.ts:21-22), sin el × 0,7 de la vida en móvil (runtime.ts:453)
    expect(flameLife, 'vida de las llamas (s)').toBeCloseTo(0.55, 6);
    expect(puffLife, 'vida de las bocanadas (s)').toBeCloseTo(3.4, 6);
    // Los máximos de vivas no dependen de los fps: con frames lentos solo bajan. Cazan que se emita de más o con más vida
    expect(max('puffs')).toBeLessThanOrEqual(21);
    expect(max('flames')).toBeLessThanOrEqual(14);
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
  });

  // CONTROL C2 de O-66: el test de D32 de c3e1bf8, tal cual salvo el título y los frames lentos
  test('D32 @mobile, control C2: el test de antes (≥ 19 bocanadas y ≥ 12 llamas vivas en 10 instantes) con frames lentos', async ({ page }) => {
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
    await slowFrames(page); // CONTROL C2: con frames lentos, el test de antes tiene que caer
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

// La Cañonera echa humo también por socket_smoke_02 (VFX-SPEC §6, D25): su huella L·B es grande para su mástil
test.describe('Humo de daño de la Cañonera', () => {
  test('D25: al 40 % echa humo por sus 2 sockets, cada uno con la tasa completa (2 × 10–11 bocanadas vivas) @gpu', async ({ page }) => {
    await enterGame(page);
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      rt.setCameraPreset('game');
      rt.setZoomLevel(1);
      const scene = rt.startScene('gallery', { cannonLevel: 1 });
      // Todas a 2 km del foco y con la vida llena, salvo la Cañonera, en el foco al 40 % (humo de 3/s por socket)
      scene.spec.ships.forEach((s, i) => scene.setPose(s.id, scene.focus.x + 2000 * (i + 1), scene.focus.z, s.heading));
      scene.setPose('g-gunboat', scene.focus.x, scene.focus.z, Math.PI / 2);
      const g = scene.getShip('g-gunboat')!;
      g.hp = Math.round(0.4 * g.maxHp);
    });
    await page.waitForTimeout(4500); // > 3,4 s de vida del humo: régimen estable
    const puffs: number[] = [];
    for (let i = 0; i < 10; i++) {
      puffs.push(await page.evaluate((puff) => { const fx = window.__SEA_BATTLE__!.runtime().effects; return fx.alpha.live(fx.time, puff); }, PUFF));
      await page.waitForTimeout(150);
    }
    console.log(`D25 Cañonera al 40 %: bocanadas vivas ${Math.min(...puffs)}–${Math.max(...puffs)} (10 muestras; con un solo socket, ≈ 10)`);
    // 3/s × 3,4 s = 10–11 vivas por socket, y salen de 2 en 2: 20 o 22 (con un solo socket, 10 u 11)
    expect(Math.min(...puffs)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...puffs)).toBeLessThanOrEqual(22);
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
  });
});

// CONTROL C2 de O-66: frames lentos a propósito, con un bucle ocupado de ~120 ms en cada rAF de la página
async function slowFrames(page: Page) {
  await page.evaluate(() => {
    const busy = () => {
      const t = performance.now();
      while (performance.now() - t < 120) {
        // ocupado: el frame no acaba antes de 120 ms
      }
      requestAnimationFrame(busy);
    };
    requestAnimationFrame(busy);
  });
}

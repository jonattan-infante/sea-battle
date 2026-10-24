// AC-89 y VFX-01/02/03 (VFX-SPEC §15) con la escena estándar sintética del runtime (src/client/synthetic-scene.ts):
// 20 barcos de jugadores + 20 NPC + 1 Fragata en lugar del jefe, todos en pantalla con 1,0× y el cañón N3 (5,04 px/m,
// la densidad en metros con la que se compone la escena, D31), una isla y 8 duelos simultáneos. Sin servidor de por medio para los barcos: el runtime dibuja exactamente lo mismo que en
// una partida, pero la escena es reproducible. AC-107 (declutter con el indicador de recarga) usa la misma escena
// con uno de los barcos en duelo como propio. La de la población del I2 mide además el tiempo de frame con el
// anisótropo de los GLB y sin él (tanda B).
import { expect, Page, test } from '@playwright/test';
import { mapAnisotropyFor, SHIP_GLB } from '../src/client/models/ship-glb';
import { enterGame } from './helpers';

interface Sample {
  calls: number;
  triangles: number;
  vfxCalls: number;
  callsNoVfx: number; // el mismo estado sin VFX: lo que se compara con la base (los triángulos de AC-89 incluyen los VFX)
  trianglesNoVfx: number;
}

// n muestras cada 500 ms: mismo estado dibujado con y sin VFX (VFX-01) y el frame normal
async function samples(page: Page, n: number): Promise<Sample[]> {
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(500);
    out.push(await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      const frame = rt.lastFrameInfo();
      rt.setVfxVisible(false);
      const without = rt.renderFrame()!;
      rt.setVfxVisible(true);
      const withVfx = rt.renderFrame()!;
      return { calls: Math.max(frame.calls, withVfx.calls), triangles: Math.max(frame.triangles, withVfx.triangles), vfxCalls: withVfx.calls - without.calls, callsNoVfx: without.calls, trianglesNoVfx: without.triangles };
    }));
  }
  return out;
}
const maxOf = (list: Sample[], k: keyof Sample) => Math.max(...list.map((s) => s[k]));

// La escena estándar (con la población del I2 si i2) con N3 y 1,0×, y que los 41 barcos y la isla quepan en pantalla
async function startStandard(page: Page, i2 = false) {
  const setup = await page.evaluate((i2) => {
    const rt = window.__SEA_BATTLE__!.runtime();
    rt.setCameraPreset('game');
    rt.setZoomLevel(1); // 1,0× (por defecto)
    const scene = rt.startScene('standard', { cannonLevel: 3, i2 }); // con N3 cabe entera (D31)
    return { ships: scene.spec.ships.length, duels: scene.spec.duels.length, ids: scene.spec.ships.map((s) => s.id), classes: scene.spec.ships.map((s) => s.classId) };
  }, i2);
  expect(setup.ships).toBe(41);
  await page.waitForTimeout(3000); // transición de zoom, primeras andanadas y pools en régimen
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
  return { ...setup, onScreen };
}

// Que el Capitán tenga su GLB con la KTX2 del atlas. La Cañonera, sin entrada en SHIP_GLB (BACKLOG :421: el Capitán entra
// solo), se dibuja con su procedural
const glbsReady = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => {
      const glb = (window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { loaded(c: string): boolean; model(c: string): { map?: { isCompressedTexture?: boolean } | null } } }).shipGlb;
      return ['captain'].every((c) => glb.loaded(c) && glb.model(c).map?.isCompressedTexture === true);
    }), { timeout: 60_000 })
    .toBe(true);

// Percentil por rango más cercano y media, en ms
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * xs.length) - 1)];
const stats = (xs: number[]) => ({ p50: pct(xs, 0.5), p95: pct(xs, 0.95), mean: xs.reduce((s, x) => s + x, 0) / xs.length });

test.describe('Escena estándar @perf', () => {
  test('AC-89: 41 barcos en pantalla, ≤ 100 draw calls y ≤ 250 000 triángulos; VFX-01 ≤ 7 (tope 11); VFX-02 Δ = 0', async ({ page }) => {
    test.setTimeout(90_000);
    await enterGame(page);
    const { onScreen } = await startStandard(page);

    const memory0 = await page.evaluate(() => window.__SEA_BATTLE__!.runtime().memoryInfo());
    const list = await samples(page, 20); // 20 muestras en 10 s
    const memory1 = await page.evaluate(() => window.__SEA_BATTLE__!.runtime().memoryInfo());
    const max = (k: keyof Sample) => maxOf(list, k);
    console.log(`AC-89: ${onScreen.ships} barcos en pantalla · máx. ${max('calls')} draw calls · máx. ${max('triangles')} triángulos · VFX-01 máx. ${max('vfxCalls')} · sin VFX, máx. ${max('callsNoVfx')} draw calls y ${max('trianglesNoVfx')} triángulos · memoria ${JSON.stringify(memory0)} → ${JSON.stringify(memory1)}`);
    expect(max('calls')).toBeLessThanOrEqual(100);
    expect(max('triangles')).toBeLessThanOrEqual(250_000);
    expect(max('vfxCalls')).toBeLessThanOrEqual(11);
    expect(memory1.geometries).toBe(memory0.geometries);
    expect(memory1.textures).toBe(memory0.textures);
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
  });

  // Producto (P2 del punto 3 de dev-render; BACKLOG :421): la misma escena con la población del I2 de GDD §0, con el GLB de
  // D91 del Capitán y su sombra en el agua (las Cañoneras, en su procedural: el Capitán entra solo). La base es la misma
  // escena con el procedural del Capitán, que es lo que dibuja la base (sin GLB ni sombra): su GLB se retiene hasta medirla
  test('AC-89 con la población del I2 (8 piratas, 4 Cañoneras, 8 mercantes y el Capitán): con el GLB del Capitán y su sombra, ≤ 100 draw calls y ≤ 250 000 triángulos; la diferencia con la base, sin VFX, al log', async ({ page }) => {
    test.setTimeout(150_000);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const glbs = [SHIP_GLB.captain!];
    for (const url of glbs) {
      await page.route(`**${url}`, async (route) => {
        await held;
        await route.continue();
      });
    }
    await enterGame(page);
    const { onScreen, classes } = await startStandard(page, true);
    expect([classes.filter((c) => c === 'gunboat').length, classes.filter((c) => c === 'captain').length]).toEqual([4, 1]);
    const base = await samples(page, 10);
    release();
    await glbsReady(page);
    await page.waitForTimeout(1000);
    const memory0 = await page.evaluate(() => window.__SEA_BATTLE__!.runtime().memoryInfo());
    const list = await samples(page, 20);
    const memory1 = await page.evaluate(() => window.__SEA_BATTLE__!.runtime().memoryInfo());
    // Las sombras del frame: instancias de las mallas visibles de ship-shadow.ts, por geometría de LOD1
    const shadows = await page.evaluate(() => {
      const group = (window.__SEA_BATTLE__!.runtime() as unknown as { shipShadows: { group: { children: { visible: boolean; count: number }[] } } }).shipShadows.group;
      return group.children.filter((m) => m.visible).map((m) => m.count).sort((a, b) => a - b);
    });
    const max = (k: keyof Sample) => maxOf(list, k);
    const d = (k: keyof Sample) => max(k) - maxOf(base, k);
    console.log(`AC-89 (I2): ${onScreen.ships} barcos en pantalla · máx. ${max('calls')} draw calls · máx. ${max('triangles')} triángulos · VFX-01 máx. ${max('vfxCalls')} · sombras ${JSON.stringify(shadows)} · memoria ${JSON.stringify(memory0)} → ${JSON.stringify(memory1)}`);
    console.log(`AC-89 (I2), sin VFX: base (procedurales) máx. ${maxOf(base, 'callsNoVfx')} draw calls y ${maxOf(base, 'trianglesNoVfx')} triángulos · con GLB y sombras ${max('callsNoVfx')} y ${max('trianglesNoVfx')} · diferencia ${d('callsNoVfx')} draw calls y ${d('trianglesNoVfx')} triángulos`);
    expect(shadows).toEqual([1]); // el Capitán; las 4 Cañoneras, procedurales, sin sombra
    expect(max('calls')).toBeLessThanOrEqual(100);
    expect(max('triangles')).toBeLessThanOrEqual(250_000);
    expect(max('vfxCalls')).toBeLessThanOrEqual(11);
    expect(memory1.geometries).toBe(memory0.geometries);
    expect(memory1.textures).toBe(memory0.textures);
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
  });

  // Tanda B (BACKLOG :421 (4)): el tiempo de frame con el anisótropo de los GLB y sin él, en la escena del I2 con sus GLB,
  // quieta y sin VFX. Ciclos intercalados A, B, A′, B′: A y A′ con el nivel del runtime, B y B′ con 1; A frente a A′ y B
  // frente a B′ son el A/A. En cada brazo, un frame sin medir (vuelve a subir los mapas) y uno medido: renderFrame y
  // readPixels de 1 px, que espera a la GPU. Al registro, sin cotas en ms: p50, p95 y media por brazo y sus diferencias.
  // El coste (producto, BACKLOG :421) es el p95 de A menos el p95 a 1 (B y B′), y la regla de 1 ms solo se lee si el A/A
  // del p95 (A − A′) queda por debajo de 0,5 ms; si no, la medida no separa
  test('Tanda B: tiempo de frame con el anisótropo de los GLB y sin él, en la escena del I2, intercalado y con A/A, al registro', async ({ page }) => {
    test.setTimeout(180_000);
    const cycles = 150;
    await enterGame(page);
    await startStandard(page, true);
    await glbsReady(page);
    await page.waitForTimeout(1000);
    const run = await page.evaluate((cycles) => {
      type Rt = {
        gl: { getContext(): WebGLRenderingContext; capabilities: { getMaxAnisotropy(): number } };
        shipGlb: { setMapAnisotropy(level: number): void; model(c: string): { map?: { anisotropy: number } | null } };
        setPaused(p: boolean): void;
        setVfxVisible(v: boolean): void;
        renderFrame(): { calls: number; triangles: number } | null;
      };
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as Rt;
      const gl = rt.gl.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      const levels = ['captain'].map((c) => rt.shipGlb.model(c).map?.anisotropy ?? 0);
      const px = new Uint8Array(4);
      const frame = () => {
        const t0 = performance.now();
        rt.renderFrame();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return performance.now() - t0;
      };
      const arms: Record<'A' | 'B' | 'A2' | 'B2', number[]> = { A: [], B: [], A2: [], B2: [] };
      const plan = [['A', levels[0]], ['B', 1], ['A2', levels[0]], ['B2', 1]] as const;
      rt.setPaused(true);
      rt.setVfxVisible(false);
      const info = rt.renderFrame();
      for (let i = 0; i < cycles; i++) {
        for (const [arm, level] of plan) {
          rt.shipGlb.setMapAnisotropy(level);
          frame();
          arms[arm].push(frame());
        }
      }
      rt.shipGlb.setMapAnisotropy(levels[0]);
      rt.setVfxVisible(true);
      rt.setPaused(false);
      return { renderer, isolated: self.crossOriginIsolated, max: rt.gl.capabilities.getMaxAnisotropy(), levels, info, arms };
    }, cycles);
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
    const level = mapAnisotropyFor(run.max);
    const s = { A: stats(run.arms.A), A2: stats(run.arms.A2), B: stats(run.arms.B), B2: stats(run.arms.B2), on: stats([...run.arms.A, ...run.arms.A2]), off: stats([...run.arms.B, ...run.arms.B2]) };
    const ms = (x: number) => x.toFixed(3);
    const delta = (a: ReturnType<typeof stats>, b: ReturnType<typeof stats>) => `p50 ${ms(a.p50 - b.p50)} · p95 ${ms(a.p95 - b.p95)} · media ${ms(a.mean - b.mean)}`;
    const line = (x: ReturnType<typeof stats>) => `p50 ${ms(x.p50)} · p95 ${ms(x.p95)} · media ${ms(x.mean)} ms`;
    console.log(`Tanda B, tiempo de frame (I2, quieta, sin VFX, ${cycles} ciclos A B A′ B′, ${run.info?.calls} draw calls / ${run.info?.triangles} triángulos) · ${run.renderer} · máximo ${run.max} · niveles de los GLB ${run.levels.join('/')} · performance.now ${run.isolated ? 'aislado (5 µs)' : 'sin aislar (100 µs)'}`);
    console.log(`Tanda B, tiempo de frame · A (${level}) ${line(s.A)} · A′ (${level}) ${line(s.A2)} · B (1) ${line(s.B)} · B′ (1) ${line(s.B2)}`);
    console.log(`Tanda B, tiempo de frame · con ${level} − con 1 (A∪A′ − B∪B′): ${delta(s.on, s.off)} ms · A/A: A − A′ ${delta(s.A, s.A2)} ms; B − B′ ${delta(s.B, s.B2)} ms`);
    const cost = s.A.p95 - s.off.p95;
    const aa = Math.abs(s.A.p95 - s.A2.p95);
    console.log(`Tanda B, tiempo de frame · coste: p95 de A (${level}) − p95 a 1 (B∪B′) = ${ms(cost)} ms · p95 sube > 1 ms: ${cost > 1 ? 'sí' : 'no'} · A/A del p95 |A − A′| = ${ms(aa)} ms · A/A p95 < 0,5 ms: ${aa < 0.5 ? 'sí' : 'no'} · ${aa < 0.5 ? 'la regla de 1 ms se lee' : 'la medida no separa: decide producto con lo medido'}`);
    expect(run.levels, `los GLB con el anisótropo del runtime (${level})`).toEqual([level]);
    expect(Object.values(run.arms).map((a) => a.length)).toEqual([cycles, cycles, cycles, cycles]);
    expect(Object.values(run.arms).flat().filter((t) => !Number.isFinite(t) || t < 0), 'tiempos de frame sin medir').toEqual([]);
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

// AD-32 (ART-DIRECTION §11.4, D39; O-4): las placas no se cruzan con el HUD. El pirata de la escena sintética "gallery"
// se mueve a pasos de 4 px de pantalla por una recta que lleva su placa desde 40 px fuera de un bloque hasta su centro
// y luego la aleja: el minimapa desde abajo (en escritorio cruza antes el pie del sector) y un bloque inferior (barra de
// acciones en escritorio; Atacar en móvil, en diagonal entre Reparar y Objetivo). En cada paso, tras 2 frames, ninguna
// placa visible se cruza con un bloque [data-hud-block] visible y queda a ≥ 8 px (±1 px por redondeo). Al alejarse a
// ≥ 16 px vuelve con opacidad 1 en ≤ 250 ms. Servidor sin NPC: 0 commits de React durante el recorrido (AD-20).
import { expect, Page, test } from '@playwright/test';
import { PORTS } from '../playwright.config';
import { commits, enterGame, installCommitCounter } from './helpers';

const EMPTY = `http://localhost:${PORTS.empty}`;

interface PathSpec {
  block: string; // data-testid del bloque objetivo
  dir: [number, number]; // dirección (pantalla) desde su centro hacia fuera
}

interface PathResult {
  block: string;
  steps: number;
  startSep: number; // separación de la placa con el bloque más cercano al empezar
  visibleAtStart: boolean;
  hiddenInside: boolean;
  maxArea: number;
  minSep: number; // mínima separación entre placas visibles y bloques visibles
  worst: string;
  returnMs: number | null;
  minimap: { w: number; h: number; coordsInside: boolean } | null;
}

async function setup(page: Page): Promise<void> {
  await installCommitCounter(page);
  await enterGame(page, EMPTY);
  await page.mouse.move(5, 450); // sin hover sobre barcos ni el HUD
  await page.evaluate(() => {
    const rt = window.__SEA_BATTLE__!.runtime();
    rt.setCameraPreset('game');
    rt.setZoomLevel(1); // 1,0×
    (window as unknown as { __ad32: unknown }).__ad32 = rt.startScene('gallery');
  });
  await page.waitForTimeout(2000); // transición del encuadre y asentarse tras la entrada
}

async function trajectory(page: Page, paths: PathSpec[]): Promise<PathResult[]> {
  return page.evaluate(async (paths) => {
    const rt = window.__SEA_BATTLE__!.runtime();
    const scene = (window as unknown as { __ad32: { focus: { x: number; z: number }; setPose(id: string, x: number, z: number, h: number): void; getShip(id: string): { x: number; z: number } | undefined } }).__ad32;
    const ID = 'g-pirate';
    type Box = { x: number; y: number; w: number; h: number };
    const frames = (n: number) => new Promise<void>((resolve) => { const f = () => (--n <= 0 ? resolve() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const box = (e: Element): Box => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    const sep = (a: Box, b: Box) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
    const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const blocks = () => Array.from(document.querySelectorAll<HTMLElement>('[data-hud-block]'))
      .map((e) => ({ id: e.dataset.testid ?? e.className, ...box(e) }))
      .filter((b) => b.w > 0 && b.h > 0);
    // Placa: el cuerpo y, en la propia, el indicador de recarga si se ve (AC-107). Opacidad efectiva = raíz × hijos
    const plateBox = (root: HTMLElement): Box => {
      const b = box(root.querySelector('.wo-plate__body')!);
      const q = root.querySelector('.wo-reload.is-visible');
      if (!q) return b;
      const r = box(q);
      const x0 = Math.min(b.x, r.x), y0 = Math.min(b.y, r.y);
      return { x: x0, y: y0, w: Math.max(b.x + b.w, r.x + r.w) - x0, h: Math.max(b.y + b.h, r.y + r.h) - y0 };
    };
    const opacity = (root: HTMLElement) => {
      const cs = getComputedStyle(root);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      return Number(cs.opacity) * Number(getComputedStyle(root.querySelector('.wo-plate__body')!).opacity);
    };
    const plates = () => Array.from(document.querySelectorAll<HTMLElement>('[data-plate]'));
    const pirate = () => document.querySelector<HTMLElement>(`[data-plate][data-ship-id="${ID}"]`)!;
    const nearest = (p: Box) => Math.min(...blocks().map((b) => sep(p, b)));

    // Mueve el barco para que el centro de su placa quede en (cx, cy): jacobiano local de la proyección (el eje X del
    // mundo solo mueve sx y el Z solo sy) y corrección con la caja real de la placa
    const moveTo = async (cx: number, cy: number) => {
      for (let i = 0; i < 2; i++) {
        const s = scene.getShip(ID)!;
        const p = plateBox(pirate());
        const o = rt.project(s.x, s.z)!, px = rt.project(s.x + 1, s.z)!, pz = rt.project(s.x, s.z + 1)!;
        const dx = cx - (p.x + p.w / 2), dy = cy - (p.y + p.h / 2);
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        scene.setPose(ID, s.x + dx / (px.sx - o.sx), s.z + dy / (pz.sy - o.sy), Math.PI / 2);
        await frames(2);
      }
    };

    // Solo el pirata en pantalla, en el foco: la Balandra (también en el foco) se aparca lejos como las demás
    scene.setPose('g-sloop', scene.focus.x + 10_000, scene.focus.z, Math.PI / 2);
    scene.setPose(ID, scene.focus.x, scene.focus.z, Math.PI / 2);
    // Hasta que la placa se dibuja (≥ 1 pasada del declutter) y una pasada más para que tenga su tamaño medido
    const shown = performance.now() + 5000;
    while (!(pirate()?.getBoundingClientRect().width > 0) && performance.now() < shown) await frames(1);
    if (!(pirate()?.getBoundingClientRect().width > 0)) throw new Error('la placa del pirata no llegó a dibujarse en el foco');
    await frames(12);

    const results = [];
    for (const path of paths) {
      const target = box(document.querySelector(`[data-testid="${path.block}"]`)!);
      const [ux, uy] = path.dir;
      const n = Math.hypot(ux, uy);
      const c = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
      const size = plateBox(pirate());
      const at = (d: number) => ({ x: c.x + (ux / n) * d, y: c.y + (uy / n) * d });
      // Punto de partida: el primer múltiplo de 4 px con la placa a ≥ 40 px de todos los bloques y dentro de la pantalla
      let d0 = 0;
      for (let d = 0; d < 800; d += 4) {
        const q = at(d);
        const b = { x: q.x - size.w / 2, y: q.y - size.h / 2, w: size.w, h: size.h };
        if (b.x >= 0 && b.y >= 0 && b.x + b.w <= innerWidth && b.y + b.h <= innerHeight && blocks().every((k) => sep(b, k) >= 40)) {
          d0 = d;
          break;
        }
      }
      await moveTo(at(d0).x, at(d0).y);
      await frames(8); // dos pasadas del declutter sobre la posición de salida
      const startSep = nearest(plateBox(pirate()));
      const visibleAtStart = opacity(pirate()) > 0.99;
      let maxArea = 0, minSep = Infinity, worst = '', steps = 0, hiddenInside = false;
      let returnMs: number | null = null, clearAt = -1;
      const check = () => {
        const bs = blocks();
        for (const root of plates()) {
          if (opacity(root) <= 0) continue;
          const p = plateBox(root);
          for (const b of bs) {
            const a = area(p, b), s = sep(p, b);
            if (a > maxArea) maxArea = a;
            if (s < minSep) {
              minSep = s;
              worst = `${root.dataset.shipId} frente a ${b.id} en el paso ${steps}: separación ${s.toFixed(1)} px, cruce ${a.toFixed(0)} px²`;
            }
          }
        }
      };
      const ds: number[] = [];
      for (let d = d0 - 4; d >= 0; d -= 4) ds.push(d);
      const inside = ds.length;
      for (let d = 4; d <= d0; d += 4) ds.push(d);
      for (let i = 0; i < ds.length; i++) {
        const q = at(ds[i]);
        const s = scene.getShip(ID)!;
        const p = plateBox(pirate());
        const o = rt.project(s.x, s.z)!, px = rt.project(s.x + 1, s.z)!, pz = rt.project(s.x, s.z + 1)!;
        scene.setPose(ID, s.x + (q.x - (p.x + p.w / 2)) / (px.sx - o.sx), s.z + (q.y - (p.y + p.h / 2)) / (pz.sy - o.sy), Math.PI / 2);
        const t = performance.now();
        await frames(2);
        steps++;
        check();
        if (i === inside - 1) hiddenInside = opacity(pirate()) === 0;
        // Vuelta: desde el primer paso del alejamiento a ≥ 16 px hasta opacidad 1 (±1 px de redondeo: se espera desde ≥ 17)
        if (i >= inside && returnMs === null) {
          const s16 = nearest(plateBox(pirate()));
          if (s16 >= 16 && clearAt < 0) clearAt = t;
          if (s16 >= 17) {
            const end = performance.now() + 1000;
            while (opacity(pirate()) < 0.999 && performance.now() < end) await frames(1);
            returnMs = opacity(pirate()) >= 0.999 ? performance.now() - clearAt : Infinity;
            check();
          }
        }
      }
      let minimap = null;
      const mm = document.querySelector('[data-testid="minimap"]');
      const coords = document.querySelector('[data-testid="coords"]');
      if (mm && coords && getComputedStyle(coords).display !== 'none') {
        const a = box(mm), k = box(coords);
        minimap = { w: a.w, h: a.h, coordsInside: k.x >= a.x - 0.5 && k.y >= a.y - 0.5 && k.x + k.w <= a.x + a.w + 0.5 && k.y + k.h <= a.y + a.h + 0.5 };
      }
      results.push({ block: path.block, steps, startSep, visibleAtStart, hiddenInside, maxArea, minSep, worst, returnMs, minimap });
    }
    return results;
  }, paths);
}

function report(label: string, results: PathResult[], commitDelta: number) {
  for (const r of results) {
    console.log(`AD-32 ${label} · ${r.block}: ${r.steps} pasos desde ${r.startSep.toFixed(0)} px · visible al salir ${r.visibleAtStart} · oculta dentro ${r.hiddenInside} · cruce máx. ${r.maxArea.toFixed(0)} px² · separación mín. ${r.minSep.toFixed(1)} px (${r.worst}) · vuelta ${r.returnMs === null ? '—' : `${r.returnMs.toFixed(0)} ms`}${r.minimap ? ` · minimapa ${r.minimap.w}×${r.minimap.h}, sector dentro ${r.minimap.coordsInside}` : ''}`);
  }
  console.log(`AD-32 ${label}: ${commitDelta} commits de React durante el recorrido`);
}

function expectAd32(results: PathResult[], commitDelta: number, desktop: boolean) {
  for (const r of results) {
    expect.soft(r.visibleAtStart, `${r.block}: placa visible a 40 px`).toBe(true);
    expect.soft(r.hiddenInside, `${r.block}: placa oculta dentro del bloque`).toBe(true);
    expect.soft(r.maxArea, `${r.block}: área de cruce (${r.worst})`).toBe(0);
    expect.soft(r.minSep, `${r.block}: separación ≥ 8 px ±1 (${r.worst})`).toBeGreaterThanOrEqual(7);
    expect.soft(r.returnMs, `${r.block}: vuelta con opacidad 1`).not.toBeNull();
    expect.soft(r.returnMs ?? Infinity, `${r.block}: vuelta en ≤ 250 ms`).toBeLessThanOrEqual(250);
    if (desktop) {
      expect.soft(r.minimap?.coordsInside, 'el sector queda dentro del minimapa').toBe(true);
      expect.soft(Math.abs((r.minimap?.w ?? 0) - 184), 'minimapa de 184 px de ancho (±4, AD-16)').toBeLessThanOrEqual(4);
      expect.soft(Math.abs((r.minimap?.h ?? 0) - 208), 'minimapa de 208 px de alto (±4, AD-16)').toBeLessThanOrEqual(4);
    }
  }
  expect.soft(commitDelta, 'AD-20: 0 commits de React durante el recorrido').toBe(0);
}

test.describe('Placas y HUD', () => {
  test('AD-32 (1440×900): ninguna placa se cruza con el minimapa, su pie del sector ni la barra de acciones; vuelve en ≤ 250 ms', async ({ page }) => {
    test.setTimeout(90_000);
    await setup(page);
    const c0 = await commits(page);
    const results = await trajectory(page, [{ block: 'minimap', dir: [0, 1] }, { block: 'action-bar', dir: [0, -1] }]);
    const delta = (await commits(page)) - c0;
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
    report('1440×900', results, delta);
    expectAd32(results, delta, true);
  });

  test('AD-32 con movimiento reducido (1440×900): la placa vuelve sin fundido', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page);
    const [r] = await trajectory(page, [{ block: 'minimap', dir: [0, 1] }]);
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
    report('1440×900, movimiento reducido', [r], 0);
    expect.soft(r.hiddenInside).toBe(true);
    expect.soft(r.maxArea, r.worst).toBe(0);
    expect.soft(r.minSep, r.worst).toBeGreaterThanOrEqual(7);
    // Sin fundido: opacidad 1 en el primer frame en que la caja queda a ≥ 16 px (los 2 frames del paso y margen)
    expect.soft(r.returnMs ?? Infinity, 'vuelta sin fundido').toBeLessThanOrEqual(100);
  });

  test('AD-32 (390×844) @mobile: ninguna placa se cruza con el minimapa ni con Atacar; vuelve en ≤ 250 ms', async ({ page }) => {
    test.setTimeout(90_000);
    await setup(page);
    const c0 = await commits(page);
    const results = await trajectory(page, [{ block: 'minimap', dir: [0, 1] }, { block: 'm-attack', dir: [-1, -1] }]);
    const delta = (await commits(page)) - c0;
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
    report('390×844', results, delta);
    expectAd32(results, delta, false);
  });
});

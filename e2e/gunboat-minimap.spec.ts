// O-40 (ART-DIRECTION §4.3, D43): con el I2 encendido, la Cañonera pirata sale en el minimapa como un ▬ de 11 × 5 px,
// horizontal, a DPR 1 y 2; el pirata de al lado sigue con su ◆. Servidor propio con el escenario "danger"
// (server/scenarios.ts): la cañonera y el pirata quietos, sin IA, a 60 m. El jugador se queda donde aparece, a 60–90 m del
// puerto: su ▲ queda lejos de los dos. Dos medidas:
// (a) las llamadas de dibujo del canvas del minimapa (se envuelve CanvasRenderingContext2D con un script de inicio): el
//     trazado de cada fill y stroke, su color, su grosor y si hay transformación, del último redibujado completo; la forma
//     se ata al barco por su posición. En 1440×900 a DPR 1 y 2 y en 390×844 a DPR 2.
// (b) los píxeles coral alrededor de cada uno, con getImageData. Solo en 1440×900, donde los dos quedan a 10,9 px CSS (mapa
//     de 182 px): en los de 86 y 72 px quedan a 5,2 y 4,3 y se tocan. El contorno de 1 px tapa medio píxel por lado y el
//     suavizado del borde no cuenta como coral: medido, el ▬ deja 9 × 3 (DPR 1) y 9,5 × 3,5 (DPR 2) px CSS de coral, y el
//     ◆, 5 × 5 y 5 × 4,5. Ventana de cada uno: ±6,5 px en x para el ▬ (el coral del ◆ empieza a 7,9) y ±4,5 para el ◆ (el
//     del ▬ empieza a 6,0: con ±6,5 entraba una columna y el ◆ daba 10 × 5)
import { BrowserContextOptions, expect, Page, test } from '@playwright/test';
import { MAP_HALF_SIZE } from '../src/game/constants';
import { DANGER, LEGIBILITY_I2 } from '../server/scenarios';
import { enterGame, me, ships, waitFor } from './helpers';
import { sailTo } from './net';
import { startOwnServer } from './own-server';

const SIZES: Record<string, BrowserContextOptions & { pixels: boolean }> = {
  '1440×900 a DPR 1': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, pixels: true },
  '1440×900 a DPR 2': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, pixels: true },
  '390×844 a DPR 2': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, pixels: false }
};
const CORAL = '#ff7a7a';
const OUTLINE = '#07121b';

// Grabador del minimapa: cada redibujado empieza con su clearRect a lienzo completo; se guarda el anterior, ya completo
function minimapRecorder() {
  type Rec = { op: 'fill' | 'stroke'; style: string; lineWidth: number; identity: boolean; path: (string | number)[][] };
  const w = window as unknown as { __o40: { frame: Rec[]; last: Rec[] | null } };
  w.__o40 = { frame: [], last: null };
  const P = CanvasRenderingContext2D.prototype;
  let path: (string | number)[][] = [];
  const mine = (ctx: CanvasRenderingContext2D) => !!ctx.canvas.closest?.('[data-testid="minimap"]');
  const wrap = (name: string, fn: (ctx: CanvasRenderingContext2D, args: number[]) => void) => {
    const orig = (P as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
    (P as unknown as Record<string, unknown>)[name] = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
      if (mine(this)) fn(this, args as number[]);
      return orig.apply(this, args);
    };
  };
  wrap('clearRect', (ctx, a) => {
    if (a[0] === 0 && a[1] === 0 && a[2] === ctx.canvas.width) {
      if (w.__o40.frame.length) w.__o40.last = w.__o40.frame;
      w.__o40.frame = [];
    }
  });
  wrap('beginPath', () => { path = []; });
  for (const name of ['moveTo', 'lineTo', 'rect', 'arc', 'closePath']) wrap(name, (_ctx, a) => { path.push([name, ...a]); });
  for (const op of ['fill', 'stroke'] as const) {
    wrap(op, (ctx) => {
      w.__o40.frame.push({ op, style: String(op === 'fill' ? ctx.fillStyle : ctx.strokeStyle).toLowerCase(), lineWidth: ctx.lineWidth, identity: ctx.getTransform().isIdentity, path: path.map((p) => [...p]) });
    });
  }
}

// Las formas del último redibujado cuyo centro cae a ≤ 1,5 px CSS de cada barco, en px CSS, y (para los que tienen
// ventana) la caja de sus píxeles coral en una ventana de ±ventana × ±4,5 px CSS que deja fuera al vecino
type Spot = { x: number; z: number };
async function measure(page: Page, at: Record<string, Spot>, windows: Record<string, number>) {
  return page.evaluate(([at, half, windows]) => {
    const canvas = document.querySelector('[data-testid="minimap"] canvas') as HTMLCanvasElement;
    const cssW = canvas.getBoundingClientRect().width;
    const dpr = canvas.width / cssW;
    const pos = (p: { x: number; z: number }) => ({ x: ((p.x + half) / (2 * half)) * cssW, y: ((p.z + half) / (2 * half)) * cssW });
    const recs = (window as unknown as { __o40: { last: { op: string; style: string; lineWidth: number; identity: boolean; path: (string | number)[][] }[] } }).__o40.last ?? [];
    const center = (path: (string | number)[][]) => {
      if (path.length === 1 && path[0][0] === 'rect') { const [, x, y, w, h] = path[0] as number[]; return { x: (x + w / 2) / dpr, y: (y + h / 2) / dpr }; }
      if (path.length === 1 && path[0][0] === 'arc') { const [, x, y] = path[0] as number[]; return { x: x / dpr, y: y / dpr }; }
      const pts = path.filter((p) => p[0] !== 'closePath') as number[][];
      return { x: pts.reduce((s, p) => s + Number(p[1]), 0) / pts.length / dpr, y: pts.reduce((s, p) => s + Number(p[2]), 0) / pts.length / dpr };
    };
    const shapes = (p: { x: number; z: number }) => {
      const e = pos(p);
      return recs
        .filter((r) => r.path.length > 0 && Math.hypot(center(r.path).x - e.x, center(r.path).y - e.y) <= 1.5)
        .map((r) => ({ op: r.op, style: r.style, lineWidth: r.lineWidth / dpr, identity: r.identity, path: r.path.map((s) => s.map((v) => (typeof v === 'number' ? Math.round((v / dpr) * 1000) / 1000 : v))) }));
    };
    const coral = (p: { x: number; z: number }, halfX: number | undefined) => {
      if (halfX === undefined) return null;
      const e = pos(p);
      const hx = Math.round(halfX * dpr);
      const hy = Math.round(4.5 * dpr);
      const x0 = Math.round(e.x * dpr) - hx;
      const y0 = Math.round(e.y * dpr) - hy;
      const data = canvas.getContext('2d')!.getImageData(x0, y0, 2 * hx + 1, 2 * hy + 1).data;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - 0xff) <= 12 && Math.abs(data[i + 1] - 0x7a) <= 18 && Math.abs(data[i + 2] - 0x7a) <= 18) {
          const px = (i / 4) % (2 * hx + 1);
          const py = Math.floor(i / 4 / (2 * hx + 1));
          minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); n++;
        }
      }
      return n ? { n, w: (maxX - minX + 1) / dpr, h: (maxY - minY + 1) / dpr } : { n: 0, w: 0, h: 0 };
    };
    const out: Record<string, { shapes: ReturnType<typeof shapes>; coral: ReturnType<typeof coral> }> = {};
    for (const [k, p] of Object.entries(at)) out[k] = { shapes: shapes(p), coral: coral(p, windows[k]) };
    return { dpr, cssW, at: out };
  }, [at, MAP_HALF_SIZE, windows] as const);
}

test.describe('▬ de la Cañonera pirata en el minimapa (O-40)', () => {
  test('O-40: con el I2, la Cañonera es un ▬ de 11 × 5 px CSS, horizontal, coral y con contorno de 1 px, a DPR 1 y 2 (1440×900 y 390×844); el pirata, un ◆; en 1440×900 sus píxeles coral dan ≈ 10 × 4 frente a ≈ 6 × 6', async ({ browser }) => {
    test.setTimeout(150_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: 'danger' });
    try {
      for (const [size, { pixels, ...options }] of Object.entries(SIZES)) {
        const ctx = await browser.newContext(options);
        try {
          await ctx.addInitScript(minimapRecorder);
          const page = await ctx.newPage();
          await enterGame(page, server.url);
          const at = (p: { x: number; z: number }) => async () => (await ships(page)).find((s) => Math.hypot(s.x - p.x, s.z - p.z) < 1);
          const gunboat = (await waitFor(at(DANGER.gunboat), (s) => !!s, 10_000, 100))!;
          const pirate = (await waitFor(at(DANGER.pirate), (s) => !!s, 10_000, 100))!;
          expect([gunboat.classId, pirate.classId]).toEqual(['gunboat', 'pirate']);
          // Dos redibujados completos (2 Hz) con los dos ya en la lista
          await page.waitForTimeout(1_200);
          const m = await measure(page, { gunboat, pirate }, pixels ? { gunboat: 6.5, pirate: 4.5 } : {});
          console.log(`O-40 ${size}: ${JSON.stringify(m)}`);
          expect(m.dpr).toBe(options.deviceScaleFactor);

          // (a) y (b) con expect.soft: un rojo en uno no esconde el otro, ni el de los demás tamaños. Cada mensaje dice el tamaño
          // (a) La Cañonera: un relleno coral y su contorno de 1 px, los dos con un único rect de 11 × 5 y sin transformación
          const fill = m.at.gunboat.shapes.filter((s) => s.op === 'fill');
          const stroke = m.at.gunboat.shapes.filter((s) => s.op === 'stroke');
          expect.soft(fill.map((s) => s.style), `(a) ${size}: relleno de la cañonera`).toEqual([CORAL]);
          expect.soft(stroke.map((s) => [s.style, s.lineWidth]), `(a) ${size}: contorno de la cañonera`).toEqual([[OUTLINE, 1]]);
          for (const s of [...fill, ...stroke]) {
            expect.soft(s.identity, `(a) ${size}: ${s.op} sin transformación`).toBe(true);
            expect.soft(s.path.map((p) => p[0]), `(a) ${size}: ${s.op} con un único rect`).toEqual(['rect']);
            const [, , , w, h] = s.path[0] as number[];
            expect.soft([w, h], `(a) ${size}: ${s.op} de 11 × 5 px CSS (±0,05)`).toEqual([expect.closeTo(11, 1), expect.closeTo(5, 1)]);
          }
          // El pirata: su ◆ de 4 vértices, coral
          const diamond = m.at.pirate.shapes.filter((s) => s.op === 'fill');
          expect.soft(diamond.map((s) => [s.style, s.path.map((p) => p[0]).join(' ')]), `(a) ${size}: ◆ del pirata`).toEqual([[CORAL, 'moveTo lineTo lineTo lineTo closePath']]);

          // (b) Los píxeles: el ▬ más ancho que alto (≈ 9 × 3; 8–12 × 2–6 deja 1 px de margen a lo medido) y el ◆ casi cuadrado
          if (pixels) {
            const g = m.at.gunboat.coral!;
            const p = m.at.pirate.coral!;
            expect.soft(g.w >= 8 && g.w <= 12 && g.h >= 2 && g.h <= 6, `(b) ${size}: caja coral de la cañonera ${g.w} × ${g.h} px CSS en 8–12 × 2–6`).toBe(true);
            expect.soft(g.w / g.h, `(b) ${size}: ancho / alto de la cañonera`).toBeGreaterThanOrEqual(1.8);
            expect.soft(p.w / p.h >= 0.7 && p.w / p.h <= 1.4, `(b) ${size}: ancho / alto del pirata ${p.w} / ${p.h} en 0,7–1,4`).toBe(true);
          }
        } finally {
          await ctx.close();
        }
      }
    } finally {
      await server.kill();
    }
  });
});

// D63 (ART-DIRECTION §4.3; D87): con el I2 y el escenario "legibility-i2" (pirata, cañonera, Capitán y mercante quietos,
// y el puesto del otro jugador, el de AC-115), las llamadas de dibujo del minimapa en los 3 tamaños: el pirata es un ◆ de
// 8 px de diagonal, el mercante un ■ de 7 y el otro jugador un ○ de 8 (banda de su color de radio 2 a 3,5 px y contorno de
// 1 a 4,5, sin relleno). El otro jugador es un 2.º contexto que zarpa a su puesto; cada tamaño entra con un jugador nuevo
// que zarpa a su propio puesto, a ≥ 25 m de los demás, para que el área de interés (300 m) los vea a todos
test.describe('Marcadores de D63 en el minimapa', () => {
  const POSTS = [LEGIBILITY_I2.self, { x: 0, z: 175 }, { x: 0, z: 150 }];

  test('D63: con el I2, el pirata es un ◆ de 8 px de diagonal, el mercante un ■ de 7 y el otro jugador un ○ de 8 (banda de radio 2 a 3,5 px, contorno de 1 a 4,5 y sin relleno), a DPR 1 y 2 (1440×900 y 390×844)', async ({ browser }) => {
    test.setTimeout(240_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: 'legibility-i2' });
    const otherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const other = await otherCtx.newPage();
      await enterGame(other, server.url);
      await sailTo(other, LEGIBILITY_I2.other.x, LEGIBILITY_I2.other.z);
      const otherShip = (await waitFor(() => me(other), (s) => !!s && Math.hypot(s.x - LEGIBILITY_I2.other.x, s.z - LEGIBILITY_I2.other.z) < 4, 45_000, 200))!;
      for (const [k, [size, { pixels: _pixels, ...options }]] of Object.entries(SIZES).entries()) {
        const ctx = await browser.newContext(options);
        try {
          await ctx.addInitScript(minimapRecorder);
          const page = await ctx.newPage();
          await enterGame(page, server.url);
          await sailTo(page, POSTS[k].x, POSTS[k].z);
          await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - POSTS[k].x, s.z - POSTS[k].z) < 4, 45_000, 200);
          const list = await ships(page);
          const pirate = list.find((s) => s.classId === 'pirate')!;
          const merchant = list.find((s) => s.classId === 'merchant')!;
          const player = list.find((s) => s.id === otherShip.id)!;
          expect([pirate?.classId, merchant?.classId, player?.kind]).toEqual(['pirate', 'merchant', 'player']);
          // Dos redibujados completos (2 Hz) con todos ya en la lista
          await page.waitForTimeout(1_200);
          const m = await measure(page, { pirate, merchant, player }, {});
          console.log(`D63 ${size}: ${JSON.stringify(m)}`);
          expect(m.dpr).toBe(options.deviceScaleFactor);
          // Cada fill y stroke con su color, y el grosor solo en los stroke (en un fill es el que quedó del marcador anterior)
          const ops = (key: 'pirate' | 'merchant' | 'player') => m.at[key].shapes.map((s) => `${s.op} ${s.style}${s.op === 'stroke' ? ` ${s.lineWidth}` : ''}`);
          // ◆: 4 vértices a 4 px CSS del centro (8 de diagonal), relleno coral y contorno de 1 px
          const d = m.at.pirate.shapes.find((s) => s.op === 'fill');
          expect.soft(ops('pirate'), `${size}: el ◆ del pirata, relleno y contorno`).toEqual(['fill #ff7a7a', 'stroke #07121b 1']);
          const v = (d?.path ?? []).filter((p) => p[0] !== 'closePath') as [string, number, number][];
          const cx = v.reduce((a, p) => a + p[1], 0) / (v.length || 1);
          const cy = v.reduce((a, p) => a + p[2], 0) / (v.length || 1);
          expect.soft(v.map((p) => Math.round(Math.hypot(p[1] - cx, p[2] - cy) * 100) / 100), `${size}: el ◆ del pirata, 8 px de diagonal`).toEqual([4, 4, 4, 4]);
          // ■: un rect de 7 × 7 px CSS, azul, con contorno de 1 px
          const sq = m.at.merchant.shapes.find((s) => s.op === 'fill');
          expect.soft(ops('merchant'), `${size}: el ■ del mercante, relleno y contorno`).toEqual(['fill #6cc3f5', 'stroke #07121b 1']);
          expect.soft(sq?.path.map((p) => (p[0] === 'rect' ? [p[0], p[3], p[4]] : [p[0]])), `${size}: el ■ del mercante, 7 × 7 px`).toEqual([['rect', 7, 7]]);
          // ○: sin relleno; dos trazos del mismo círculo de radio 2,75 px CSS, el contorno de 3,5 px y la banda de 1,5
          expect.soft(ops('player'), `${size}: el ○ del otro jugador, dos trazos y sin relleno`).toEqual(['stroke #07121b 3.5', 'stroke #f5f1e6 1.5']);
          expect.soft(m.at.player.shapes.map((s) => [s.path.length, s.path[0]?.[0], s.path[0]?.[3]]), `${size}: el ○ del otro jugador, radio 2,75 px`).toEqual([[1, 'arc', 2.75], [1, 'arc', 2.75]]);
        } finally {
          await ctx.close();
        }
      }
    } finally {
      await otherCtx.close();
      await server.kill();
    }
  });
});

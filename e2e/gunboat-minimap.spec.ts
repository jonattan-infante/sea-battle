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
import { DANGER } from '../server/scenarios';
import { enterGame, ships, waitFor } from './helpers';
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

// Las formas del último redibujado cuyo centro cae a ≤ 1,5 px CSS de cada barco, en px CSS, y (si se pide) la caja de sus
// píxeles coral en una ventana de ±hx × ±4,5 px CSS que deja fuera al vecino
async function measure(page: Page, at: { gunboat: { x: number; z: number }; pirate: { x: number; z: number } }, pixels: boolean) {
  return page.evaluate(([at, half, pixels]) => {
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
    const coral = (p: { x: number; z: number }, halfX: number) => {
      if (!pixels) return null;
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
    return { dpr, cssW, gunboat: { shapes: shapes(at.gunboat), coral: coral(at.gunboat, 6.5) }, pirate: { shapes: shapes(at.pirate), coral: coral(at.pirate, 4.5) } };
  }, [at, MAP_HALF_SIZE, pixels] as const);
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
          const m = await measure(page, { gunboat, pirate }, pixels);
          console.log(`O-40 ${size}: ${JSON.stringify(m)}`);
          expect(m.dpr).toBe(options.deviceScaleFactor);

          // (a) y (b) con expect.soft: un rojo en uno no esconde el otro, ni el de los demás tamaños. Cada mensaje dice el tamaño
          // (a) La Cañonera: un relleno coral y su contorno de 1 px, los dos con un único rect de 11 × 5 y sin transformación
          const fill = m.gunboat.shapes.filter((s) => s.op === 'fill');
          const stroke = m.gunboat.shapes.filter((s) => s.op === 'stroke');
          expect.soft(fill.map((s) => s.style), `(a) ${size}: relleno de la cañonera`).toEqual([CORAL]);
          expect.soft(stroke.map((s) => [s.style, s.lineWidth]), `(a) ${size}: contorno de la cañonera`).toEqual([[OUTLINE, 1]]);
          for (const s of [...fill, ...stroke]) {
            expect.soft(s.identity, `(a) ${size}: ${s.op} sin transformación`).toBe(true);
            expect.soft(s.path.map((p) => p[0]), `(a) ${size}: ${s.op} con un único rect`).toEqual(['rect']);
            const [, , , w, h] = s.path[0] as number[];
            expect.soft([w, h], `(a) ${size}: ${s.op} de 11 × 5 px CSS (±0,05)`).toEqual([expect.closeTo(11, 1), expect.closeTo(5, 1)]);
          }
          // El pirata: su ◆ de 4 vértices, coral
          const diamond = m.pirate.shapes.filter((s) => s.op === 'fill');
          expect.soft(diamond.map((s) => [s.style, s.path.map((p) => p[0]).join(' ')]), `(a) ${size}: ◆ del pirata`).toEqual([[CORAL, 'moveTo lineTo lineTo lineTo closePath']]);

          // (b) Los píxeles: el ▬ más ancho que alto (≈ 9 × 3; 8–12 × 2–6 deja 1 px de margen a lo medido) y el ◆ casi cuadrado
          if (pixels) {
            const g = m.gunboat.coral!;
            const p = m.pirate.coral!;
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

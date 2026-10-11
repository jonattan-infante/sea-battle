// D23 c y D36 (ASSET-SPEC §11: AS-V18 sin facetas, AS-V19 textura interna, AS-V20 cañones legibles; ART-DIRECTION
// AD-10, AD-25 y AD-26) medidos sobre el render del juego. Escena sintética 'gallery': las 5 clases quietas, con la vida
// entera y sin efectos; la que se mide va al foco con su rumbo y las demás quedan a 2 km. 1440×900 a zoom 1,0×: N1 (la
// sesión nueva, 6,20 px/m) para AS-V18/V19 y AD-26, y N3 (5,04 px/m, D28) para AS-V20. Por pose, el mismo frame
// congelado se dibuja 4 veces:
//   con   el juego tal cual
//   sin   sin la malla del barco: silueta = píxeles con ΔE76 ≥ 3 (AS-V19, AD-26)
//   alb   solo albedo: hemisférica blanca de intensidad π y sol apagado, así MeshStandardMaterial devuelve el vertex
//         color (irradiancia × albedo / π); localiza los bordes de color de AS-V18 y la franja de portas de AS-V20
//   ids   regiones como vertex color: costado (casco con |n_y| ≤ 0,6), cubierta, cada vela y cañones/portas
// Con D23_OUT=<carpeta> guarda los recortes de cada pose (k = 0) y un JSON con todas las cifras, para QA.
import { expect, Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { SHIP_LOOKS } from '../src/client/art';
import type { ShipKind } from '../src/game/constants';
import { enterGame } from './helpers';

const CLASSES = ['sloop', 'brig', 'frigate', 'pirate', 'merchant'] as const;
const CANNONS: Record<string, number> = { sloop: 4, brig: 6, frigate: 8, pirate: 4, merchant: 0 }; // por banda
const LOOK: Record<string, ShipKind> = { sloop: 'player', brig: 'player', frigate: 'player', pirate: 'pirate', merchant: 'merchant' };
const BUDGET: Record<string, number> = { sloop: 2500, brig: 2500, frigate: 2500, pirate: 2000, merchant: 2000 }; // tris LOD0 (§5)
const HEADINGS = [0, 90, 180, 270];
const SHOTS = 3; // capturas por pose, separadas 0,5 s (balanceo distinto)
const OUT = process.env.D23_OUT;

interface Region {
  name: string;
  pixels: number;
  steps: number[]; // escalones por línea (5 horizontales + 5 verticales)
}

interface Port {
  w: number;
  h: number;
  band: number; // px de franja a ≤ 3 px
  contrast: number; // mediana de L* de esa franja − mediana de L* de la componente
}

interface Shot {
  ppm: number;
  lod: number;
  mask: number; // px de la silueta (ΔE76 ≥ 3)
  interior: number; // silueta erosionada 1 px
  texture: number; // AS-V19: fracción del interior con |∇L*| ≥ 4
  regions: Region[]; // AS-V18
  calls: number; // draw calls del barco: con − sin
  triangles: number; // triángulos del barco: con − sin
  ports: Port[]; // AS-V20: componentes de cañón o porta junto a la franja
  crops?: Record<string, string>;
}

// Mide una pose: se ejecuta en la página (sin acceso a nada de Node)
async function measurePose([id, keep, bandHex]: [string, boolean, string]): Promise<Shot> {
  type V3 = { x: number; y: number; z: number };
  type Attr = { count: number; array: Float32Array; clone(): Attr; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
  type Light = { isLight?: boolean; isHemisphereLight?: boolean; intensity: number; color: { clone(): unknown; copy(c: unknown): void; setRGB(r: number, g: number, b: number): void }; groundColor?: Light['color'] };
  interface Loose {
    views: Map<string, { lod: number; model: { sails: [number, number][][] }; mesh: { visible: boolean; geometry: { getAttribute(n: string): Attr; setAttribute(n: string, a: Attr): void } } }>;
    rootScene: { traverse(fn: (o: Light) => void): void };
    stats(): { ppm: number };
    setPaused(p: boolean): void;
    captureImage(type: string): string | null;
    renderFrame(): { calls: number; triangles: number } | null;
  }
  const rt = window.__SEA_BATTLE__!.runtime() as unknown as Loose;
  const view = rt.views.get(id)!;
  const geo = view.mesh.geometry;
  rt.setPaused(true);
  const shot = () => rt.captureImage('image/png')!;
  const con = shot();
  const withShip = rt.renderFrame()!;
  view.mesh.visible = false;
  const sin = shot();
  const without = rt.renderFrame()!;
  view.mesh.visible = true;
  const lights: Light[] = [];
  rt.rootScene.traverse((o) => { if (o.isLight) lights.push(o); });
  const saved = lights.map((l) => ({ l, i: l.intensity, c: l.color.clone(), g: l.groundColor?.clone() }));
  for (const l of lights) {
    if (l.isHemisphereLight) {
      l.color.setRGB(1, 1, 1);
      l.groundColor!.setRGB(1, 1, 1);
      l.intensity = Math.PI;
    } else l.intensity = 0;
  }
  const alb = shot();
  // Pase de regiones (colores lineales: salen tal cual con la luz de albedo)
  const color = geo.getAttribute('color');
  const pos = geo.getAttribute('position');
  const rim = geo.getAttribute('_rim_mask');
  // El pase de ids no depende de la pose: uno por geometría (clase y LOD)
  const cache = ((window as unknown as { __d23ids?: Map<unknown, Attr> }).__d23ids ??= new Map());
  const cached = cache.get(geo);
  const ids = cached ?? color.clone();
  const lin = (hex: string) => [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const dark = [lin('#26282B'), lin('#1A1410')]; // cannon, gunport
  const near = (v: number, c: number[]) => Math.abs(color.getX(v) - c[0]) + Math.abs(color.getY(v) - c[1]) + Math.abs(color.getZ(v) - c[2]) < 1e-4;
  const LEVELS = [0, 0.1, 0.35, 1]; // → sRGB 0, 89, 160, 255
  const sails = view.model.sails[view.lod];
  const tris = pos.count / 3;
  const set = (t: number, r: number, g: number, b: number) => { for (let k = 0; k < 3; k++) ids.array.set([r, g, b], (3 * t + k) * 3); };
  const p = (i: number): V3 => ({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
  for (let t = 0; t < (cached ? 0 : tris); t++) {
    const s = sails.findIndex(([a, b]) => t >= a && t < b);
    if (s >= 0) { set(t, 1, LEVELS[(s >> 2) & 3], LEVELS[s & 3]); continue; }
    if (near(3 * t, dark[0]) || near(3 * t, dark[1])) { set(t, 0, 1, 1); continue; }
    if (rim.getX(3 * t) > 0.5) {
      const a = p(3 * t), b = p(3 * t + 1), c = p(3 * t + 2);
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const ky = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
      if (ky <= 0.6) set(t, 0, 1, 0);
      else set(t, 0, 0, ny > 0 ? 1 : 0);
      continue;
    }
    set(t, 0, 0, 0);
  }
  cache.set(geo, ids);
  geo.setAttribute('color', ids);
  const idsImg = shot();
  geo.setAttribute('color', color);
  for (const s of saved) {
    s.l.intensity = s.i;
    s.l.color.copy(s.c);
    if (s.g) s.l.groundColor!.copy(s.g);
  }
  const ppm = rt.stats().ppm;
  rt.setPaused(false);

  const decode = async (url: string) => {
    const im = new Image();
    im.src = url;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(im, 0, 0);
    return x.getImageData(0, 0, c.width, c.height);
  };
  const [A, B, C, D] = await Promise.all([con, sin, alb, idsImg].map(decode));
  const W = A.width;
  const H = A.height;
  const N = W * H;
  // CIELab D65 desde sRGB de 8 bits (mismas constantes que los scripts de QA)
  const LUT = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const lab = (img: ImageData) => {
    const out = new Float32Array(N * 3);
    const d = img.data;
    for (let i = 0; i < N; i++) {
      const r = LUT[d[4 * i]], g = LUT[d[4 * i + 1]], b = LUT[d[4 * i + 2]];
      const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
      const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
      out[3 * i] = 116 * fy - 16;
      out[3 * i + 1] = 500 * (fx - fy);
      out[3 * i + 2] = 200 * (fy - fz);
    }
    return out;
  };
  const LA = lab(A);
  const LB = lab(B);
  const LC = lab(C);
  const dE = (P: Float32Array, Q: Float32Array, i: number, j: number) => Math.hypot(P[3 * i] - Q[3 * j], P[3 * i + 1] - Q[3 * j + 1], P[3 * i + 2] - Q[3 * j + 2]);
  const L = (i: number) => LA[3 * i];

  // AS-V19: silueta, erosión de 1 px (4 vecinos) y |∇L*| por diferencia central
  const mask = new Uint8Array(N);
  let x0 = W, x1 = 0, y0 = H, y1 = 0, maskPx = 0;
  for (let i = 0; i < N; i++) {
    if (dE(LA, LB, i, i) < 3) continue;
    mask[i] = 1;
    maskPx++;
    const x = i % W, y = (i / W) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  let interior = 0, textured = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!(mask[i] && mask[i - 1] && mask[i + 1] && mask[i - W] && mask[i + W])) continue;
      interior++;
      const gx = (L(i + 1) - L(i - 1)) / 2, gy = (L(i + W) - L(i - W)) / 2;
      if (Math.hypot(gx, gy) >= 4) textured++;
    }
  }

  // Regiones del pase de ids (los píxeles mezclados por el antialias no coinciden con ningún id y quedan fuera)
  const region = new Int16Array(N).fill(-1); // -2 costado, -3 cañón/porta, ≥ 0 vela
  const lvl = (v: number) => [0, 89, 160, 255].findIndex((q) => Math.abs(v - q) <= 10);
  for (let i = 0; i < N; i++) {
    const r = D.data[4 * i], g = D.data[4 * i + 1], b = D.data[4 * i + 2];
    if (r > 215) {
      const gi = lvl(g), bi = lvl(b);
      if (gi >= 0 && bi >= 0) region[i] = gi * 4 + bi;
    } else if (r < 40 && g > 215) region[i] = b > 215 ? -3 : b < 40 ? -2 : -1;
  }

  // AS-V18: bordes de la pasada de albedo (ΔE76 ≥ 2 con un vecino) dilatados ±1 px; escalones |ΔL*| ≥ 5 entre vecinos
  // de la misma región a lo largo de 5 líneas horizontales y 5 verticales; vela visible = ≥ 50 px y caja ≥ 6 × 6
  const edge0 = new Uint8Array(N);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if ((x + 1 < W && dE(LC, LC, i, i + 1) >= 2) || (y + 1 < H && dE(LC, LC, i, i + W) >= 2)) {
        edge0[i] = 1;
        if (x + 1 < W) edge0[i + 1] = 1;
        if (y + 1 < H) edge0[i + W] = 1;
      }
    }
  }
  const edge = new Uint8Array(N);
  for (let y = Math.max(1, y0 - 1); y <= Math.min(H - 2, y1 + 1); y++) {
    for (let x = Math.max(1, x0 - 1); x <= Math.min(W - 2, x1 + 1); x++) {
      const i = y * W + x;
      if (edge0[i] || edge0[i - 1] || edge0[i + 1] || edge0[i - W] || edge0[i + W] || edge0[i - W - 1] || edge0[i - W + 1] || edge0[i + W - 1] || edge0[i + W + 1]) edge[i] = 1;
    }
  }
  const boxes = new Map<number, { n: number; x0: number; x1: number; y0: number; y1: number }>();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const r = region[y * W + x];
      if (r === -1 || r === -3) continue;
      const q = boxes.get(r) ?? { n: 0, x0: x, x1: x, y0: y, y1: y };
      q.n++; q.x0 = Math.min(q.x0, x); q.x1 = Math.max(q.x1, x); q.y0 = Math.min(q.y0, y); q.y1 = Math.max(q.y1, y);
      boxes.set(r, q);
    }
  }
  const regions: Region[] = [];
  for (const [r, q] of boxes) {
    if (q.n < 50 || q.x1 - q.x0 < 5 || q.y1 - q.y0 < 5) continue;
    const steps: number[] = [];
    const walk = (i0: number, stride: number, n: number) => {
      let s = 0;
      for (let k = 0, i = i0; k < n; k++, i += stride) {
        const j = i + stride;
        if (region[i] !== r || region[j] !== r || edge[i] || edge[j]) continue;
        if (Math.abs(L(j) - L(i)) >= 5) s++;
      }
      steps.push(s);
    };
    for (let k = 1; k <= 5; k++) walk(Math.round(q.y0 + (k * (q.y1 - q.y0)) / 6) * W + q.x0, 1, q.x1 - q.x0);
    for (let k = 1; k <= 5; k++) walk(q.y0 * W + Math.round(q.x0 + (k * (q.x1 - q.x0)) / 6), W, q.y1 - q.y0);
    regions.push({ name: r === -2 ? 'costado' : `vela${r}`, pixels: q.n, steps });
  }

  // AS-V20 (D36): componentes conexas (8 vecinos) de píxeles de cañón o porta del pase de ids con caja ≥ 2 × 2 y píxeles
  // de franja (pase de albedo a ΔE76 ≤ 8 de hull.band) a ≤ 3 px. Contraste = mediana de L* de esa franja − mediana de L*
  // de la componente, en la captura
  const band = new Uint8Array(N);
  {
    const [r, g, b] = [1, 3, 5].map((k) => LUT[parseInt(bandHex.slice(k, k + 2), 16)]);
    const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    const ref = [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (Math.hypot(LC[3 * i] - ref[0], LC[3 * i + 1] - ref[1], LC[3 * i + 2] - ref[2]) <= 8) band[i] = 1;
      }
    }
  }
  const median = (v: number[]) => { const q = [...v].sort((a, b) => a - b); const m = q.length >> 1; return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
  const seen = new Uint8Array(N);
  const nearBand = new Int32Array(N).fill(-1);
  const ports: Port[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i0 = y * W + x;
      if (region[i0] !== -3 || seen[i0]) continue;
      const comp: number[] = [];
      const stack = [i0];
      seen[i0] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        comp.push(c);
        const cx = c % W, cy = (c / W) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (seen[j] || region[j] !== -3) continue;
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
      const xs = comp.map((c) => c % W), ys = comp.map((c) => (c / W) | 0);
      const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
      if (w < 2 || h < 2) continue;
      const tag = ports.length;
      const ring: number[] = [];
      for (const c of comp) {
        const cx = c % W, cy = (c / W) | 0;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (!band[j] || nearBand[j] === tag) continue;
            nearBand[j] = tag;
            ring.push(L(j));
          }
        }
      }
      if (!ring.length) continue;
      ports.push({ w, h, band: ring.length, contrast: median(ring) - median(comp.map(L)) });
    }
  }

  let crops: Record<string, string> | undefined;
  if (keep) {
    const cx0 = Math.max(0, x0 - 16), cy0 = Math.max(0, y0 - 16), cw = Math.min(W, x1 + 17) - cx0, ch = Math.min(H, y1 + 17) - cy0;
    const crop = (img: ImageData) => {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      c.getContext('2d')!.putImageData(img, -cx0, -cy0, cx0, cy0, cw, ch);
      return c.toDataURL('image/png');
    };
    crops = { con: crop(A), sin: crop(B), alb: crop(C), ids: crop(D) };
  }
  return { ppm, lod: view.lod, calls: withShip.calls - without.calls, triangles: withShip.triangles - without.triangles, mask: maskPx, interior, texture: interior ? textured / interior : 0, regions, ports, crops };
}

interface Row extends Omit<Shot, 'crops'> {
  classId: string;
  level: number;
  deg: number;
  k: number;
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const lstar = (hex: string) => {
  const c = [1, 3, 5].map((k) => { const v = parseInt(hex.slice(k, k + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
};
const lab = (hex: string) => {
  const c = [1, 3, 5].map((k) => { const v = parseInt(hex.slice(k, k + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047), fy = f(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]), fz = f((0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const AS_V20_CONTRAST = 15;

// Una pasada por la galería con un nivel de cañón (encuadre de §6.2): cada clase al foco con cada rumbo, SHOTS capturas
async function gallery(page: Page, level: number, headings: number[], out?: string): Promise<Row[]> {
  const setup = await page.evaluate((level) => {
    const rt = window.__SEA_BATTLE__!.runtime();
    rt.setCameraPreset('game');
    rt.setZoomLevel(1);
    const scene = rt.startScene('gallery', { cannonLevel: level });
    // Todas a 2 km del foco hasta que les toque
    scene.spec.ships.forEach((s, i) => scene.setPose(s.id, scene.focus.x + 2000 * (i + 1), scene.focus.z, s.heading));
    (window as unknown as { __gallery: typeof scene }).__gallery = scene;
    for (const k of ['add', 'alpha', 'water'] as const) rt.effects[k].mesh.visible = false;
    return { focus: scene.focus, ids: scene.spec.ships.map((s) => s.id) };
  }, level);
  await page.mouse.move(5, 450); // sin hover sobre barcos
  await page.waitForTimeout(1500); // transición del encuadre
  const pose = (id: string, x: number, z: number, deg: number) =>
    page.evaluate(([id, x, z, deg]) => {
      (window as unknown as { __gallery: { setPose(id: string, x: number, z: number, h: number): void } }).__gallery.setPose(id, x, z, (deg * Math.PI) / 180);
    }, [id, x, z, deg] as [string, number, number, number]);
  const rows: Row[] = [];
  for (const [i, classId] of CLASSES.entries()) {
    const id = setup.ids[i];
    for (const deg of headings) {
      await pose(id, setup.focus.x, setup.focus.z, deg);
      await page.waitForTimeout(800);
      for (let k = 0; k < SHOTS; k++) {
        const { crops, ...shot } = await page.evaluate(measurePose, [id, !!out && k === 0, SHIP_LOOKS[LOOK[classId]].band] as [string, boolean, string]);
        rows.push({ classId, level, deg, k, ...shot });
        if (crops && out) for (const [name, url] of Object.entries(crops)) fs.writeFileSync(path.join(out, `n${level}-${classId}-${deg}-${name}.png`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
        await page.waitForTimeout(500);
      }
    }
    await pose(id, setup.focus.x + 2000 * (i + 1), setup.focus.z, 90);
  }
  return rows;
}

test.describe('Detalle interno de los cascos @perf', () => {
  test('D23 c y D36: AS-V19 ≥ 55 %, AS-V18 sin facetas, AS-V20 con contraste local, AD-10, AD-25, AD-26 y 1 draw call por barco en su presupuesto', async ({ page }) => {
    test.setTimeout(420_000);
    await enterGame(page);
    if (OUT) fs.mkdirSync(OUT, { recursive: true });
    const n1 = await gallery(page, 1, HEADINGS, OUT);
    const ppm = n1[0].ppm;
    // AD-26: measureShipValues (vela + cubierta + casco) con el ppm de la sesión nueva (N1 a 1,0×). AD-10 y AD-25: con el
    // nivel más cercano (0,7×, el ppm por defecto de measureShipValues), L* medio de la lona y color medio de la cubierta
    const ad26 = (await page.evaluate((ppm) => window.__SEA_BATTLE__!.runtime().measureShipValues(['sloop'], [0, 90, 180, 270], ppm), ppm))
      .map((v) => ({ deg: v.headingDeg, sail: v.sailPixels, deck: v.deckPixels, hull: v.hullPixels, total: v.sailPixels + v.deckPixels + v.hullPixels }));
    const values = await page.evaluate((classes) => window.__SEA_BATTLE__!.runtime().measureShipValues(classes, [0, 90, 180, 270]), [...CLASSES]);
    const n3 = await gallery(page, 3, [90, 270], OUT);
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      for (const k of ['add', 'alpha', 'water'] as const) rt.effects[k].mesh.visible = true;
      rt.stopScene();
    });

    const rows = [...n1, ...n3];
    const summary = CLASSES.flatMap((classId) => ([[1, HEADINGS], [3, [90, 270]]] as const).flatMap(([level, headings]) => headings.map((deg) => {
      const rs = rows.filter((r) => r.classId === classId && r.level === level && r.deg === deg);
      const lines = rs.flatMap((r) => r.regions.flatMap((g) => g.steps));
      return {
        classId, level, deg,
        ppm: rs[0].ppm,
        lod: Math.max(...rs.map((r) => r.lod)),
        calls: Math.max(...rs.map((r) => r.calls)),
        triangles: Math.max(...rs.map((r) => r.triangles)),
        mask: Math.round(mean(rs.map((r) => r.mask))),
        texture: mean(rs.map((r) => r.texture)),
        facetMax: lines.length ? Math.max(...lines) : 0,
        facetMean: lines.length ? mean(lines) : 0,
        regions: rs[0].regions.map((g) => `${g.name}:${g.pixels}`).join(' '),
        ports: rs.map((r) => r.ports.filter((q) => q.contrast >= AS_V20_CONTRAST).length),
        components: rs.map((r) => r.ports.length),
        contrast: rs.flatMap((r) => r.ports.map((q) => q.contrast))
      };
    })));
    const sails = values.map((v) => {
      const look = SHIP_LOOKS[LOOK[v.classId]];
      const token = LOOK[v.classId] === 'pirate' ? '#6E4B30' : '#C9965E'; // cubierta en pantalla = media de las tablas (D36)
      const [a, b] = [lab(v.deckHex), lab(token)];
      return { classId: v.classId, deg: v.headingDeg, sailL: v.sailL, stripeL: v.stripeL, deckHex: v.deckHex, ad25: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), alt: lstar(look.sailAlt) };
    });

    for (const p of summary) {
      const v20 = p.level === 3 ? ` · AS-V20 ${p.ports.join('/')} de ${CANNONS[p.classId]} (componentes ${p.components.join('/')}, contraste ${p.contrast.length ? `${Math.min(...p.contrast).toFixed(0)}–${Math.max(...p.contrast).toFixed(0)}` : '—'})` : '';
      const v19 = p.level === 1 ? ` · AS-V19 ${(p.texture * 100).toFixed(1)} % · AS-V18 máx. ${p.facetMax} / media ${p.facetMean.toFixed(2)} (${p.regions})` : '';
      console.log(`D36 ${p.classId.padEnd(8)} N${p.level} ${String(p.deg).padStart(3)}° LOD${p.lod} · ${p.calls} draw call / ${p.triangles} tris · silueta ${p.mask} px${v19}${v20}`);
    }
    console.log(`AD-26 (ppm ${ppm.toFixed(3)}): ${ad26.map((v) => `${v.deg}° ${v.sail}+${v.deck}+${v.hull} = ${v.total}`).join(' · ')}`);
    for (const v of sails) console.log(`AD-10/AD-25 ${v.classId.padEnd(8)} ${String(v.deg).padStart(3)}°: lona L* ${v.sailL.toFixed(1)}${v.stripeL ? ` (franjas ${v.stripeL.toFixed(1)})` : ''} · cubierta ${v.deckHex} (ΔE76 ${v.ad25.toFixed(1)} del token)`);
    if (OUT) fs.writeFileSync(path.join(OUT, 'd36.json'), JSON.stringify({ ppm, rows, summary, ad26, sails }, null, 1));

    for (const p of summary) {
      expect(p.lod, `${p.classId} N${p.level} ${p.deg}°: LOD0 en escritorio`).toBe(0);
      expect.soft(p.calls, `${p.classId} N${p.level} ${p.deg}°: 1 draw call por barco`).toBe(1);
      expect.soft(p.triangles, `${p.classId} N${p.level} ${p.deg}°: triángulos del barco ≤ §5`).toBeLessThanOrEqual(BUDGET[p.classId]);
      // AS-V18 y AS-V19 en 0° y 90° con N1 (180° y 270° se registran sin asertar, AS-V19)
      if (p.level === 1 && (p.deg === 0 || p.deg === 90)) {
        expect.soft(p.texture, `AS-V19 ${p.classId} ${p.deg}°`).toBeGreaterThanOrEqual(0.55);
        expect.soft(p.facetMax, `AS-V18 ${p.classId} ${p.deg}°: escalones por línea`).toBeLessThanOrEqual(1);
        expect.soft(p.facetMean, `AS-V18 ${p.classId} ${p.deg}°: media`).toBeLessThanOrEqual(0.5);
      }
      // AS-V20 con N3: en cada captura, componentes con contraste ≥ 15 = cañones por banda; el Mercante, 0 componentes
      if (p.level === 3) {
        for (const n of p.ports) expect.soft(n, `AS-V20 ${p.classId} ${p.deg}°`).toBe(CANNONS[p.classId]);
        if (CANNONS[p.classId] === 0) for (const n of p.components) expect.soft(n, `AS-V20 ${p.classId} ${p.deg}°: sin componentes`).toBe(0);
      }
    }
    expect.soft(Math.min(...ad26.map((v) => v.total)), 'AD-26: peor rumbo de la Balandra').toBeGreaterThanOrEqual(1900);
    // AD-10 con rumbo N (180°): pirata ≤ 25, jugador y mercante ≥ 80. AD-25: cubierta a ΔE76 ≤ 6 de la media de sus tablas
    for (const v of sails) {
      if (v.deg === 180) expect.soft(v.sailL, `AD-10 ${v.classId}`)[LOOK[v.classId] === 'pirate' ? 'toBeLessThanOrEqual' : 'toBeGreaterThanOrEqual'](LOOK[v.classId] === 'pirate' ? 25 : 80);
      expect.soft(v.ad25, `AD-25 ${v.classId} ${v.deg}°`).toBeLessThanOrEqual(6);
    }
  });
});

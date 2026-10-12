// D23 c, D36, D40 y D62 (ASSET-SPEC §11: AS-V18 sin facetas, AS-V19 textura interna, AS-V20 cañones legibles, AS-V21 y
// AS-V22 carácter de la lona y de la cubierta; ART-DIRECTION AD-10, AD-25, AD-26 y AD-33) medidos sobre el render del juego. Escena sintética 'gallery': las 5 clases quietas, con la vida
// entera y sin efectos; la que se mide va al foco con su rumbo y las demás quedan a 2 km. 1440×900 a zoom 1,0×: N1 (la
// sesión nueva, 6,20 px/m) para AS-V18/V19 y AD-26, y N3 (5,04 px/m, D28) para AS-V20. Por pose, el mismo frame
// congelado se dibuja 4 veces:
//   con   el juego tal cual
//   sin   sin la malla del barco: silueta = píxeles con ΔE76 ≥ 3 (AS-V19, AD-26)
//   alb   solo albedo: hemisférica blanca de intensidad π y sol apagado, así MeshStandardMaterial devuelve el vertex
//         color (irradiancia × albedo / π); localiza los bordes de color de AS-V18 y la franja de portas de AS-V20
//   ids   regiones como vertex color: costado (casco con |n_y| ≤ 0,6), cubierta y tapas (model.decks, AS-V22), cada
//         vela y cañones/portas
// Con D23_OUT=<carpeta> guarda los recortes de cada pose (k = 0) y un JSON con todas las cifras, para QA.
import { expect, Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { SHIP_LOOKS } from '../src/client/art';
import type { ShipKind } from '../src/game/constants';
import { enterGame } from './helpers';

const CLASSES = ['sloop', 'brig', 'frigate', 'pirate', 'merchant', 'captain'] as const; // + el Capitán de I2
const CANNONS: Record<string, number> = { sloop: 4, brig: 6, frigate: 8, pirate: 4, merchant: 0, captain: 6 }; // por banda
const LOOK: Record<string, ShipKind> = { sloop: 'player', brig: 'player', frigate: 'player', pirate: 'pirate', merchant: 'merchant', captain: 'pirate' };
const BUDGET: Record<string, number> = { sloop: 2500, brig: 2500, frigate: 2500, pirate: 2000, merchant: 2000, captain: 2500 }; // tris LOD0 (§5)
const HEADINGS = [0, 90, 180, 270];
const SHOTS = 3; // capturas por pose, separadas 0,5 s (balanceo distinto)
const OUT = process.env.D23_OUT;

interface Region {
  name: string;
  pixels: number;
  steps: number[]; // escalones por línea (5 horizontales + 5 verticales)
}

interface Port {
  x: number; // esquina de la caja, px del canvas
  y: number;
  w: number;
  h: number;
  band: number; // px de franja a ≤ 3 px
  core: number; // núcleo (D38): px de la componente con cobertura ≥ 75 %
  contrast: number; // mediana de L* de esa franja − mediana de L* del núcleo (NaN con núcleo < 2 px: no legible)
}

interface Profile { px: number; lines: number; n: number; r: number; eta: number; range: number }

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
  rejected: { x: number; y: number; w: number; h: number; why: 'caja' | 'sin franja' }[]; // AS-V20: las descartadas
  cloth: { sail: number; px: number; axis: 1 | 2; lines: number; n: number; r: number; eta: number; range: number }[]; // AS-V21 (b), por vela
  deck: Profile | { px: number; skip: string } | null; // AS-V22 (b): la cubierta y las tapas juntas; null sin los tonos de D62
  crops?: Record<string, string>;
}

// Mide una pose: se ejecuta en la página (sin acceso a nada de Node)
async function measurePose([id, keep, bandHex, measureDeck]: [string, boolean, string, boolean]): Promise<Shot> {
  type V3 = { x: number; y: number; z: number };
  type Attr = { count: number; array: Float32Array; clone(): Attr; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
  type Light = { isLight?: boolean; isHemisphereLight?: boolean; intensity: number; color: { clone(): unknown; copy(c: unknown): void; setRGB(r: number, g: number, b: number): void }; groundColor?: Light['color'] };
  type Node = Light & { visible: boolean; isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
  interface Loose {
    views: Map<string, { lod: number; model: { sails: [number, number][][]; decks: [number, number][][][] }; mesh: { visible: boolean; geometry: { getAttribute(n: string): Attr; setAttribute(n: string, a: Attr): void } } }>;
    rootScene: { traverse(fn: (o: Node) => void): void };
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
  const portCache = ((window as unknown as { __d23ports?: Map<unknown, Attr> }).__d23ports ??= new Map());
  const cached = cache.get(geo);
  const ids = cached ?? color.clone();
  const portIds = portCache.get(geo) ?? color.clone();
  const lin = (hex: string) => [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const dark = [lin('#26282B'), lin('#1A1410')]; // cannon, gunport
  const near = (v: number, c: number[]) => Math.abs(color.getX(v) - c[0]) + Math.abs(color.getY(v) - c[1]) + Math.abs(color.getZ(v) - c[2]) < 1e-4;
  const LEVELS = [0, 0.1, 0.35, 1]; // → sRGB 0, 89, 160, 255
  const sails = view.model.sails[view.lod];
  const tris = pos.count / 3;
  const deckTri = new Uint8Array(tris); // tablas de la cubierta y de las tapas (model.decks, D62)
  for (const surface of view.model.decks[view.lod]) for (const [a, b] of surface) deckTri.fill(1, a, b);
  const set = (t: number, r: number, g: number, b: number) => { for (let k = 0; k < 3; k++) ids.array.set([r, g, b], (3 * t + k) * 3); };
  const setPort = (t: number, v: number) => { for (let k = 0; k < 3; k++) portIds.array.set([v, v, v], (3 * t + k) * 3); };
  const p = (i: number): V3 => ({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
  for (let t = 0; t < (cached ? 0 : tris); t++) {
    setPort(t, near(3 * t, dark[0]) || near(3 * t, dark[1]) ? 1 : 0);
    const s = sails.findIndex(([a, b]) => t >= a && t < b);
    if (s >= 0) { set(t, 1, LEVELS[(s >> 2) & 3], LEVELS[s & 3]); continue; }
    if (deckTri[t]) { set(t, 0, LEVELS[2], 0); continue; }
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
  portCache.set(geo, portIds);
  geo.setAttribute('color', ids);
  const idsImg = shot();
  // Cobertura de cañones y portas (AS-V20, D37): solo el barco, con cañones y portas en blanco y el resto en negro. Con la
  // luz de albedo, cada píxel vale su cobertura (el MSAA promedia los valores ya codificados), y se toma ≥ 50 % como el
  // modelo de game-ux
  const hidden: Node[] = [];
  rt.rootScene.traverse((o) => {
    if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o !== (view.mesh as unknown) && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });
  geo.setAttribute('color', portIds);
  const portsImg = shot();
  for (const o of hidden) o.visible = true;
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
  const [A, B, C, D, E] = await Promise.all([con, sin, alb, idsImg, portsImg].map(decode));
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

  // Regiones. Costado y velas, del pase de ids: solo píxeles puros (los mezclados por el antialias quedan fuera). Cañón o
  // porta (AS-V20), del pase de cobertura: ≥ 50 %
  const region = new Int16Array(N).fill(-1); // -2 costado, -3 cañón/porta, -4 cubierta y tapas, ≥ 0 vela
  const lvl = (v: number) => [0, 89, 160, 255].findIndex((q) => Math.abs(v - q) <= 10);
  for (let i = 0; i < N; i++) {
    const r = D.data[4 * i], g = D.data[4 * i + 1], b = D.data[4 * i + 2];
    if (r > 215) {
      const gi = lvl(g), bi = lvl(b);
      if (gi >= 0 && bi >= 0) region[i] = gi * 4 + bi;
    } else if (r < 40 && g > 215 && b < 40) region[i] = -2;
    else if (r < 40 && Math.abs(g - 160) <= 10 && b < 40) region[i] = -4;
    if (mask[i] && E.data[4 * i] >= 128) region[i] = -3; // en la silueta: fuera solo queda el color de fondo
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
      if (r === -1 || r === -3 || r === -4) continue; // AS-V18: costado y velas
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

  // AS-V20 (D36, D37, D38): componentes conexas (8 vecinos) de píxeles de cañón o porta con cobertura ≥ 50 % (con solo
  // los píxeles puros del pase de ids, la porta de ≈ 2,3 px de alto con N3 quedaba a veces en una fila de 3 × 1 y caía por
  // la caja), con caja ≥ 2 × 2 y píxeles de franja (pase de albedo a ΔE76 ≤ 4 de hull.band; con ≤ 8 entraba el filete de
  // la Fragata, #D9A93F a 5,8) a ≤ 3 px. Contraste = mediana de L* de esa franja − mediana de L* del núcleo, los píxeles
  // de la componente con cobertura ≥ 75 % (sin los de borde, que mezclan porta y franja), en la captura. Con MSAA 4× la
  // cobertura sale en 0/64/128/191/255, así que 128 = 2 de 4 muestras y 191 = 3 de 4
  const BAND_DE = 4;
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
        if (Math.hypot(LC[3 * i] - ref[0], LC[3 * i + 1] - ref[1], LC[3 * i + 2] - ref[2]) <= BAND_DE) band[i] = 1;
      }
    }
  }
  const median = (v: number[]) => { const q = [...v].sort((a, b) => a - b); const m = q.length >> 1; return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
  const seen = new Uint8Array(N);
  const nearBand = new Int32Array(N).fill(-1);
  const ports: Port[] = [];
  const rejected: Shot['rejected'] = [];
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
      if (w < 2 || h < 2) {
        rejected.push({ x: Math.min(...xs), y: Math.min(...ys), w, h, why: 'caja' });
        continue;
      }
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
      if (!ring.length) {
        rejected.push({ x: Math.min(...xs), y: Math.min(...ys), w, h, why: 'sin franja' });
        continue;
      }
      const core = comp.filter((c) => E.data[4 * c] >= 191);
      ports.push({ x: Math.min(...xs), y: Math.min(...ys), w, h, band: ring.length, core: core.length, contrast: core.length >= 2 ? median(ring) - median(core.map(L)) : NaN });
    }
  }

  // AS-V21 (b) (D40, af92d47): los descriptores de qa-artifacts/render/o7-base/scripts/sail-profile.py, para que QA y
  // dev-render midan lo mismo. Vela = región del pase de ids con ≥ 120 px, erosionada 1 px (4 vecinos). Dirección «a
  // través de los paños» = la dominante del gradiente del albedo (tensor de estructura con los píxeles de |∇L*| ≥ 2); si
  // en ella no cabe ningún tramo de ≥ 12 px, la perpendicular (las franjas del Mercante). Líneas = paralelas cada 2 px
  // hasta ±40 px del centroide, partidas en tramos continuos de ≥ 12 px dentro de la vela; se quedan las de ≥ 60 % de la
  // más larga. Por línea, con el L* de la captura sin su tendencia lineal: r = el mayor máximo local de la autocorrelación
  // normalizada (3 ≤ k < n/2, n ≥ 2,5·k; 0 si no hay) y η = varianza entre las 2 clases de Otsu / varianza; rango = p95 −
  // p5 de L*. Por vela, la mediana de sus líneas
  const rint = (v: number) => { const fl = Math.floor(v), d = v - fl; return d > 0.5 || (d === 0.5 && fl % 2 !== 0) ? fl + 1 : fl; }; // np.rint
  const detrend = (p: number[]) => {
    const n = p.length, tm = (n - 1) / 2, pm = p.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let t = 0; t < n; t++) { num += (t - tm) * (p[t] - pm); den += (t - tm) ** 2; }
    return p.map((v, t) => v - pm - (num / den) * (t - tm));
  };
  const acPeak = (x: number[]) => {
    const n = x.length, r: number[] = [];
    for (let k = 1; k <= n >> 1; k++) {
      let ab = 0, aa = 0, bb = 0;
      for (let i = 0; i + k < n; i++) { ab += x[i] * x[i + k]; aa += x[i] * x[i]; bb += x[i + k] * x[i + k]; }
      r.push(aa * bb > 0 ? ab / Math.sqrt(aa * bb) : 0);
    }
    let best = 0;
    for (let k = 3; k < n >> 1; k++) if (r[k - 1] > r[k - 2] && r[k - 1] >= r[k] && r[k - 1] > best && n >= 2.5 * k) best = r[k - 1];
    return best;
  };
  const otsu = (x: number[]) => {
    const n = x.length, m = x.reduce((a, b) => a + b, 0) / n, v = x.reduce((a, b) => a + (b - m) ** 2, 0) / n;
    if (v <= 1e-9) return 0;
    const q = [...x].sort((a, b) => a - b), total = q.reduce((a, b) => a + b, 0);
    let best = 0, left = 0;
    for (let i = 1; i < n; i++) { left += q[i - 1]; best = Math.max(best, ((i * (n - i)) / (n * n)) * (left / i - (total - left) / (n - i)) ** 2); }
    return best / v;
  };
  const pct = (p: number[], k: number) => { const q = [...p].sort((a, b) => a - b), t = (k / 100) * (q.length - 1), lo = Math.floor(t); return q[lo] + (q[Math.min(lo + 1, q.length - 1)] - q[lo]) * (t - lo); };
  // Líneas de AS-V21 (b) en la región M1 (erosionada) en la dirección θ: paralelas cada 2 px hasta ±40 px del centroide,
  // tramos continuos de ≥ 12 px; se quedan las de ≥ 60 % de la más larga, con r, η y rango de cada una
  const profile = (M1: Uint8Array, box: { x0: number; x1: number; y0: number; y1: number }, theta: number) => {
    let m1 = 0, sx = 0, sy = 0;
    for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) if (M1[y * W + x]) { m1++; sx += x; sy += y; }
    const cx = sx / m1, cy = sy / m1, T = Math.trunc(Math.hypot(box.x1 - box.x0, box.y1 - box.y0)) + 2;
    const [dx, dy] = [Math.cos(theta), Math.sin(theta)], [nx, ny] = [-dy, dx];
    const lines: number[][] = [];
    for (let o = -40; o <= 40; o += 2) {
      let run: number[] = [];
      for (let t = -T; t <= T; t++) {
        const x = rint(cx + nx * o + dx * t), y = rint(cy + ny * o + dy * t);
        const inside = x >= 0 && x < W && y >= 0 && y < H && M1[y * W + x] === 1;
        if (inside && run[run.length - 1] !== y * W + x) run.push(y * W + x);
        else if (!inside && run.length) { if (run.length >= 12) lines.push(run); run = []; }
      }
      if (run.length >= 12) lines.push(run);
    }
    if (!lines.length) return null;
    const nmax = Math.max(...lines.map((l) => l.length));
    const ds = lines.filter((l) => l.length >= 0.6 * nmax).map((l) => {
      const p = l.map((i) => LA[3 * i]), x = detrend(p);
      return { r: acPeak(x), eta: otsu(x), range: pct(p, 95) - pct(p, 5) };
    });
    return { lines: ds.length, n: nmax, r: median(ds.map((d) => d.r)), eta: median(ds.map((d) => d.eta)), range: median(ds.map((d) => d.range)) };
  };
  // Erosión de 1 px (4 vecinos), caja de lo que queda y dirección dominante del gradiente del albedo (tensor de estructura
  // con los píxeles de |∇L*| ≥ 2)
  const erodeAndOrient = (inRegion: (x: number, y: number) => boolean, q: { x0: number; x1: number; y0: number; y1: number }) => {
    const M1 = new Uint8Array(N);
    let m1 = 0, mx0 = W, mx1 = 0, my0 = H, my1 = 0, jxx = 0, jyy = 0, jxy = 0, use = 0;
    for (let y = Math.max(1, q.y0); y <= Math.min(H - 2, q.y1); y++) {
      for (let x = Math.max(1, q.x0); x <= Math.min(W - 2, q.x1); x++) {
        if (!(inRegion(x, y) && inRegion(x - 1, y) && inRegion(x + 1, y) && inRegion(x, y - 1) && inRegion(x, y + 1))) continue;
        const i = y * W + x;
        M1[i] = 1; m1++;
        mx0 = Math.min(mx0, x); mx1 = Math.max(mx1, x); my0 = Math.min(my0, y); my1 = Math.max(my1, y);
        const gx = (LC[3 * (i + 1)] - LC[3 * (i - 1)]) / 2, gy = (LC[3 * (i + W)] - LC[3 * (i - W)]) / 2;
        if (Math.hypot(gx, gy) < 2) continue;
        jxx += gx * gx; jyy += gy * gy; jxy += gx * gy; use++;
      }
    }
    return { M1, m1, use, box: { x0: mx0, x1: mx1, y0: my0, y1: my1 }, theta: 0.5 * Math.atan2(2 * jxy, jxx - jyy) };
  };
  const cloth: Shot['cloth'] = [];
  for (const [rid, q] of boxes) {
    if (rid < 0 || q.n < 120) continue;
    const { M1, m1, use, box, theta } = erodeAndOrient((x, y) => region[y * W + x] === rid, q);
    if (m1 < 40 || use < 10) continue;
    let axis: 1 | 2 = 1, d = profile(M1, box, theta);
    if (!d) { axis = 2; d = profile(M1, box, theta + Math.PI / 2); }
    if (!d) continue;
    cloth.push({ sail: rid, px: q.n, axis, ...d });
  }

  // AS-V22 (b) (D62): la cubierta y las tapas juntas, del pase de ids (las superficies de model.decks), como las velas:
  // solo píxeles puros, erosionada 1 px y con ≥ 120 px. Solo líneas a través de las tablas: sin tramos de ≥ 12 px en la
  // dirección del tensor, la región no se mide
  let deck: Shot['deck'] = null;
  if (measureDeck) {
    const { M1, m1, use, box, theta } = erodeAndOrient((x, y) => region[y * W + x] === -4, { x0, x1, y0, y1 });
    if (m1 < 120) deck = { px: m1, skip: 'menos de 120 px' };
    else if (use < 10) deck = { px: m1, skip: 'sin gradiente' };
    else {
      const d = profile(M1, box, theta);
      deck = d ? { px: m1, ...d } : { px: m1, skip: 'sin tramos a través de las tablas' };
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
    crops = { con: crop(A), sin: crop(B), alb: crop(C), ids: crop(D), cob: crop(E) };
  }
  return { ppm, lod: view.lod, calls: withShip.calls - without.calls, triangles: withShip.triangles - without.triangles, mask: maskPx, interior, texture: interior ? textured / interior : 0, regions, ports, rejected, cloth, deck, crops };
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
const AS_V21 = { classes: ['sloop', 'brig', 'frigate', 'pirate', 'captain'], rMedian: 0.4, rHigh: 0.7, etaClass: 0.8, etaHigh: 0.85, share: 0.15 }; // D40; el Mercante se registra (D9)
const AS_V22 = { ...AS_V21, classes: ['sloop', 'brig', 'frigate', 'pirate'] }; // D62: los umbrales de AS-V21 (b); el Mercante se registra
// El Capitán conserva las tablas de D36 (ASSET-SPEC §8.2.2) y no entra en AS-V22 (I2)
const MEASURE_DECK = (classId: string) => classId !== 'captain';
const MOBILE_N1_PPM = 2.82; // 390×844 con N1 (ASSET-SPEC §7): Balandra, Bergantín (banda), Pirata y Mercante en LOD1
const LOD1_CLASSES = ['sloop', 'brig', 'pirate', 'merchant'];
const legible = (q: Port) => q.core >= 2 && q.contrast >= AS_V20_CONTRAST; // AS-V20 (D38): núcleo ≥ 2 px y contraste ≥ 15

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
  for (const classId of CLASSES) {
    const id = `g-${classId}`; // galleryScene: un barco por clase, aparcado en su hueco i hasta que le toca
    const i = setup.ids.indexOf(id);
    for (const deg of headings) {
      await pose(id, setup.focus.x, setup.focus.z, deg);
      await page.waitForTimeout(800);
      for (let k = 0; k < SHOTS; k++) {
        // Con N3 siempre se piden los recortes: si la captura no cumple AS-V20, se adjuntan al reporte con sus componentes
        const { crops, ...shot } = await page.evaluate(measurePose, [id, (!!out && k === 0) || level === 3, SHIP_LOOKS[LOOK[classId]].band, MEASURE_DECK(classId)] as [string, boolean, string, boolean]);
        rows.push({ classId, level, deg, k, ...shot });
        const counted = CANNONS[classId] ? shot.ports.filter(legible).length : shot.ports.length;
        const failed = level === 3 && counted !== CANNONS[classId];
        const png = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
        if (crops && out && (k === 0 || failed)) for (const [name, url] of Object.entries(crops)) fs.writeFileSync(path.join(out, `n${level}-${classId}-${deg}${k ? `-k${k}` : ''}-${name}.png`), png(url));
        if (crops && failed) {
          const tag = `AS-V20-${classId}-${deg}-k${k}`;
          for (const [name, url] of Object.entries(crops)) await test.info().attach(`${tag}-${name}.png`, { body: png(url), contentType: 'image/png' });
          await test.info().attach(`${tag}.json`, { body: JSON.stringify({ ports: shot.ports, rejected: shot.rejected }, null, 1), contentType: 'application/json' });
        }
        await page.waitForTimeout(500);
      }
    }
    await pose(id, setup.focus.x + 2000 * (i + 1), setup.focus.z, 90);
  }
  return rows;
}

test.describe('Detalle interno de los cascos @perf', () => {
  test('D23 c, D36, D40 y D62: AS-V19 ≥ 55 %, AS-V18 sin facetas, AS-V20 con contraste local, AS-V21, AS-V22, AD-10, AD-25, AD-26, AD-33 y 1 draw call por barco en su presupuesto', async ({ page }) => {
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
    // AD-33 (D40): la misma pose (N1 a 1,0×, rumbos 0°, 90° y 180°) con LOD0 y con LOD1 forzado. AD-25 en 390×844 con N1:
    // las clases que allí van en LOD1, con su ppm
    const lodPair = await page.evaluate(([classes, ppm]) => ([0, 1] as const).map((lod) => window.__SEA_BATTLE__!.runtime().measureShipValues(classes, [0, 90, 180], ppm, lod)), [[...CLASSES], ppm] as [string[], number]);
    const mobile = await page.evaluate(([classes, ppm]) => window.__SEA_BATTLE__!.runtime().measureShipValues(classes, [0, 90, 180, 270], ppm, 1), [LOD1_CLASSES, MOBILE_N1_PPM] as [string[], number]);
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
        ports: rs.map((r) => r.ports.filter(legible).length),
        components: rs.map((r) => r.ports.length),
        core: rs.flatMap((r) => r.ports.map((q) => q.core)),
        contrast: rs.flatMap((r) => r.ports.map((q) => q.contrast)).filter(Number.isFinite)
      };
    })));
    const sails = values.map((v) => {
      const look = SHIP_LOOKS[LOOK[v.classId]];
      const token = LOOK[v.classId] === 'pirate' ? '#6E4B30' : '#C9965E'; // cubierta en pantalla = media de las tablas (D36)
      const [a, b] = [lab(v.deckHex), lab(token)];
      return { classId: v.classId, deg: v.headingDeg, sailL: v.sailL, stripeL: v.stripeL, deckHex: v.deckHex, ad25: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), alt: lstar(look.sailAlt) };
    });

    // AS-V21 (b): cada vela de las 4 clases, a 0° y 90° con N1 y en las 3 capturas; el Mercante, sin asertar
    const med = (v: number[]) => { const q = [...v].sort((a, b) => a - b); const m = q.length >> 1; return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
    const v21all = rows.filter((r) => r.level === 1 && (r.deg === 0 || r.deg === 90)).flatMap((r) => r.cloth.map((c) => ({ classId: r.classId, deg: r.deg, k: r.k, ...c })));
    const v21 = v21all.filter((c) => AS_V21.classes.includes(c.classId));
    const share = (v: number[], t: number) => (v.length ? v.filter((x) => x >= t).length / v.length : NaN);
    const v21r = v21.length ? med(v21.map((c) => c.r)) : NaN;
    const v21rHigh = share(v21.map((c) => c.r), AS_V21.rHigh);
    const v21etaHigh = share(v21.map((c) => c.eta), AS_V21.etaHigh);
    const v21class = [...AS_V21.classes, 'merchant'].map((classId) => {
      const cs = v21all.filter((c) => c.classId === classId);
      return { classId, sails: cs.length, eta: cs.length ? med(cs.map((c) => c.eta)) : NaN, r: cs.length ? med(cs.map((c) => c.r)) : NaN, range: cs.length ? med(cs.map((c) => c.range)) : NaN };
    });
    // AS-V22 (b) (D62): una región por clase y rumbo (la primera captura de cada pose, la de los recortes de D23_OUT), con N1
    // en los 4 rumbos; las regiones no medibles y el Mercante se registran
    const v22all = rows.filter((r) => r.level === 1 && r.k === 0 && r.deck).map((r) => ({ classId: r.classId, deg: r.deg, ...r.deck! }));
    const v22m = v22all.flatMap((d) => ('skip' in d ? [] : [d]));
    const v22 = v22m.filter((d) => AS_V22.classes.includes(d.classId));
    const v22r = v22.length ? med(v22.map((d) => d.r)) : NaN;
    const v22rHigh = share(v22.map((d) => d.r), AS_V22.rHigh);
    const v22etaHigh = share(v22.map((d) => d.eta), AS_V22.etaHigh);
    const v22class = [...AS_V22.classes, 'merchant'].map((classId) => {
      const ds = v22m.filter((d) => d.classId === classId);
      return { classId, regions: ds.length, eta: ds.length ? med(ds.map((d) => d.eta)) : NaN, r: ds.length ? med(ds.map((d) => d.r)) : NaN, range: ds.length ? med(ds.map((d) => d.range)) : NaN };
    });
    // AD-33: por clase, L* medio de la vela y color medio de la cubierta (ponderados por píxeles en los 3 rumbos, para el
    // registro) y el salto en cada rumbo, que es lo que se aserta (D46)
    const avg = (vs: { px: number; v: number[] }[]) => { const n = vs.reduce((a, q) => a + q.px, 0); return [0, 1, 2].map((i) => vs.reduce((a, q) => a + q.px * q.v[i], 0) / n); };
    const rgb = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
    const hexOf = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
    const ad33 = CLASSES.map((classId) => {
      const [l0, l1] = lodPair.map((vs) => vs.filter((v) => v.classId === classId));
      const sailL = (vs: typeof l0) => vs.reduce((a, v) => a + v.sailPixels * v.sailL, 0) / vs.reduce((a, v) => a + v.sailPixels, 0);
      const deck = (vs: typeof l0) => hexOf(avg(vs.filter((v) => v.deckPixels > 0).map((v) => ({ px: v.deckPixels, v: rgb(v.deckHex) }))));
      const [d0, d1] = [lab(deck(l0)), lab(deck(l1))];
      const poses = l0.map((v, i) => {
        const [p0, p1] = [lab(v.deckHex), lab(l1[i].deckHex)];
        return { deg: v.headingDeg, dL: l1[i].sailL - v.sailL, dE: Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]) };
      });
      return { classId, sail0: sailL(l0), sail1: sailL(l1), deck0: deck(l0), deck1: deck(l1), dL: sailL(l1) - sailL(l0), dE: Math.hypot(d0[0] - d1[0], d0[1] - d1[1], d0[2] - d1[2]), poses };
    });
    const ad25m = mobile.map((v) => {
      const [a, b] = [lab(v.deckHex), lab(LOOK[v.classId] === 'pirate' ? '#6E4B30' : '#C9965E')];
      return { classId: v.classId, deg: v.headingDeg, deckHex: v.deckHex, px: v.deckPixels, dE: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) };
    });

    for (const p of summary) {
      const v20 = p.level === 3 ? ` · AS-V20 ${p.ports.join('/')} de ${CANNONS[p.classId]} (componentes ${p.components.join('/')}, núcleo ${p.core.length ? `${Math.min(...p.core)}–${Math.max(...p.core)}` : '—'} px, contraste ${p.contrast.length ? `${Math.min(...p.contrast).toFixed(1)}–${Math.max(...p.contrast).toFixed(1)}` : '—'})` : '';
      const v19 = p.level === 1 ? ` · AS-V19 ${(p.texture * 100).toFixed(1)} % · AS-V18 máx. ${p.facetMax} / media ${p.facetMean.toFixed(2)} (${p.regions})` : '';
      console.log(`D36 ${p.classId.padEnd(8)} N${p.level} ${String(p.deg).padStart(3)}° LOD${p.lod} · ${p.calls} draw call / ${p.triangles} tris · silueta ${p.mask} px${v19}${v20}`);
    }
    console.log(`AD-26 (ppm ${ppm.toFixed(3)}): ${ad26.map((v) => `${v.deg}° ${v.sail}+${v.deck}+${v.hull} = ${v.total}`).join(' · ')}`);
    for (const v of sails) console.log(`AD-10/AD-25 ${v.classId.padEnd(8)} ${String(v.deg).padStart(3)}°: lona L* ${v.sailL.toFixed(1)}${v.stripeL ? ` (franjas ${v.stripeL.toFixed(1)})` : ''} · cubierta ${v.deckHex} (ΔE76 ${v.ad25.toFixed(1)} del token)`);
    console.log(`AS-V21 (b): ${v21.length} velas · r mediana ${v21r.toFixed(2)} (≤ ${AS_V21.rMedian}) · r ≥ ${AS_V21.rHigh}: ${(100 * v21rHigh).toFixed(0)} % · η ≥ ${AS_V21.etaHigh}: ${(100 * v21etaHigh).toFixed(0)} % (≤ ${100 * AS_V21.share} %) · rango ${med(v21.map((c) => c.range)).toFixed(1)}`);
    for (const c of v21class) console.log(`AS-V21 ${c.classId.padEnd(8)}: ${c.sails} velas · η ${c.eta.toFixed(2)}${c.classId === 'merchant' ? ' (sin asertar)' : ` (≤ ${AS_V21.etaClass})`} · r ${c.r.toFixed(2)} · rango ${c.range.toFixed(1)}`);
    console.log(`AS-V22 (b): ${v22.length} regiones · r mediana ${v22r.toFixed(2)} (≤ ${AS_V22.rMedian}) · r ≥ ${AS_V22.rHigh}: ${(100 * v22rHigh).toFixed(0)} % · η ≥ ${AS_V22.etaHigh}: ${(100 * v22etaHigh).toFixed(0)} % (≤ ${100 * AS_V22.share} %) · rango ${v22.length ? med(v22.map((d) => d.range)).toFixed(1) : '—'}`);
    for (const c of v22class) console.log(`AS-V22 ${c.classId.padEnd(8)}: ${c.regions} regiones · η ${c.eta.toFixed(2)}${c.classId === 'merchant' ? ' (sin asertar)' : ` (≤ ${AS_V22.etaClass})`} · r ${c.r.toFixed(2)} · rango ${c.range.toFixed(1)}`);
    for (const d of v22all) console.log(`AS-V22 ${d.classId.padEnd(8)} ${String(d.deg).padStart(3)}°: ${d.px} px · ${'skip' in d ? `sin medir (${d.skip})` : `${d.lines} líneas de ${d.n} px · r ${d.r.toFixed(2)} · η ${d.eta.toFixed(2)} · rango ${d.range.toFixed(1)}`}`);
    for (const a of ad33) console.log(`AD-33 ${a.classId.padEnd(8)}: vela L* ${a.sail0.toFixed(1)} → ${a.sail1.toFixed(1)} (Δ ${a.dL >= 0 ? '+' : ''}${a.dL.toFixed(1)}) · cubierta ${a.deck0} → ${a.deck1} (ΔE76 ${a.dE.toFixed(1)}) · por rumbo ${a.poses.map((q) => `${q.deg}° vela ${q.dL >= 0 ? '+' : ''}${q.dL.toFixed(1)} cubierta ${q.dE.toFixed(1)}`).join(' · ')}`);
    for (const v of ad25m) console.log(`AD-25 390×844 LOD1 ${v.classId.padEnd(8)} ${String(v.deg).padStart(3)}°: cubierta ${v.deckHex} (${v.px} px) · ΔE76 ${v.dE.toFixed(1)} del token`);
    if (OUT) fs.writeFileSync(path.join(OUT, 'd36.json'), JSON.stringify({ ppm, rows, summary, ad26, sails, v21: v21all, v22: v22all, ad33, ad25m }, null, 1));

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
      // AS-V20 con N3: en cada captura, componentes legibles (núcleo ≥ 2 px, contraste ≥ 15) = cañones por banda; el
      // Mercante, 0 componentes
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
    // AS-V21 (b) (D40): η por clase ≤ 0,80; sobre todas las clases, r con mediana ≤ 0,40 y ≤ 15 % de velas con r ≥ 0,70 o con
    // η ≥ 0,85
    expect.soft(v21.length, 'AS-V21: velas medidas').toBeGreaterThan(0);
    for (const c of v21class) if (c.classId !== 'merchant') expect.soft(c.eta, `AS-V21 ${c.classId}: η`).toBeLessThanOrEqual(AS_V21.etaClass);
    expect.soft(v21r, 'AS-V21: mediana de r').toBeLessThanOrEqual(AS_V21.rMedian);
    expect.soft(v21rHigh, 'AS-V21: velas con r ≥ 0,70').toBeLessThanOrEqual(AS_V21.share);
    expect.soft(v21etaHigh, 'AS-V21: velas con η ≥ 0,85').toBeLessThanOrEqual(AS_V21.share);
    // AS-V22 (b) (D62): los mismos umbrales sobre las regiones medibles de la cubierta de las 4 clases en los 4 rumbos
    expect.soft(v22.length, 'AS-V22: regiones medidas').toBeGreaterThan(0);
    for (const c of v22class) if (c.classId !== 'merchant') expect.soft(c.eta, `AS-V22 ${c.classId}: η`).toBeLessThanOrEqual(AS_V22.etaClass);
    expect.soft(v22r, 'AS-V22: mediana de r').toBeLessThanOrEqual(AS_V22.rMedian);
    expect.soft(v22rHigh, 'AS-V22: regiones con r ≥ 0,70').toBeLessThanOrEqual(AS_V22.share);
    expect.soft(v22etaHigh, 'AS-V22: regiones con η ≥ 0,85').toBeLessThanOrEqual(AS_V22.share);
    // AD-33 (D40, D46): |ΔL*| de la vela ≤ 3 y ΔE76 de la cubierta ≤ 3 entre LOD0 y LOD1 en cada rumbo. AD-25 en LOD1
    // (390×844): ≤ 4
    for (const a of ad33) {
      for (const q of a.poses) {
        expect.soft(Math.abs(q.dL), `AD-33 ${a.classId} ${q.deg}°: vela`).toBeLessThanOrEqual(3);
        expect.soft(q.dE, `AD-33 ${a.classId} ${q.deg}°: cubierta`).toBeLessThanOrEqual(3);
      }
    }
    for (const v of ad25m) expect.soft(v.dE, `AD-25 390×844 ${v.classId} ${v.deg}°`).toBeLessThanOrEqual(4);
  });
});

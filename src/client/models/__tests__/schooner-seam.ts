// AD-37 (d) (ART-DIRECTION, fila AD-37; D107, aprobada el 2026-11-16): la costura entre las 2 cangrejas de la Goleta en
// LOD1. Es el port de measure() de scripts/ux/laminas/lamina_d107.py, con la misma definición, para medirla en Jest sin
// numpy ni WebGL: sobre el procedural (getShipModel('schooner').lods[1]) y sobre el LOD1 de las 2 GLB de familia.
// - Pose: 390×844 a DPR 2 con N1 a 1,0× (5,64 px de imagen por metro); la cámara del juego, ortográfica a 55° con arriba =
//   −Z (art.ts:153); rumbo 45° y rotation.set(pitch, heading, roll) en Euler XYZ (runtime.ts:1631): R = Rx · Ry · Rz.
// - 200 momentos del balanceo: roll = 3° · sen a y pitch = 1,5° · sen b, con a y b de numpy.random.default_rng(107)
//   (ad37d-balanceo.json, generado con numpy: primero los 200 de a y luego los 200 de b).
// - Render de identificadores: sin luz, con z-buffer y 3 × 3 submuestras por píxel; cada píxel se queda con el grupo que más
//   submuestras tiene (el primero en caso de empate, como argmax). No se pintan los triángulos por debajo del agua.
// - Grupos, por el color del 1.er vértice de cada triángulo (en sRGB de 8 bits) y su centro: 1 la cangreja mayor (vela
//   #E0D9C9 con z < −3,0), 2 la de trinquete (vela con −3,0 ≤ z < 3,7 e y < 14,4), 3 la gavia, 4 los foques, 5 palos y
//   perchas, 6 el resto; 0 el fondo.
// - Costura de una fila: con píxeles de 1 y de 2, los píxeles entre el último de 1 y el primero de 2, si ninguno es vela
//   (0, 5 o 6); si se tocan, se solapan o hay vela entre ellas, no hay costura (−1).
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';

export const SEAM_MIN_ROWS = 6; // AD-37 (d): filas con costura de ≥ 2 px en cada uno de los 200 momentos
const PPM = 2.82 * 2;
const DEG = Math.PI / 180; // math.radians(x) de Python es x · (π / 180)
const TH = 55.0 * DEG;
const SS = 3;
const PAD = 6;
const SAIL = '#E0D9C9'; // la vela lisa de LOD1 (D40)
const SPARS = ['#6B4426', '#633F23'];

const MOMENTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'ad37d-balanceo.json'), 'utf8')) as { a: number[]; b: number[] };

// round() de Python: a la par en el empate
const roundHalfEven = (x: number) => {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
};
// hexs() del script: lineal → sRGB de 8 bits
const hexOf = (lin: number[]) =>
  '#' +
  lin
    .map((c) => {
      const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
      return roundHalfEven(Math.min(Math.max(s, 0), 1) * 255).toString(16).toUpperCase().padStart(2, '0');
    })
    .join('');

export interface SeamMesh {
  P: Float64Array; // 9 por triángulo
  g: Int8Array; // el grupo de cada triángulo
}

// groups() del script, sobre una geometría con position y color (lineal; normalizado si viene en enteros, como el COLOR_0
// de las GLB). Sin índice: si lo tiene, se expande
export function seamMesh(geometry: THREE.BufferGeometry): SeamMesh {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const n = pos.count / 3;
  const P = new Float64Array(9 * n);
  const g = new Int8Array(n);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      P[9 * t + 3 * k] = pos.getX(3 * t + k);
      P[9 * t + 3 * k + 1] = pos.getY(3 * t + k);
      P[9 * t + 3 * k + 2] = pos.getZ(3 * t + k);
    }
    const hx = hexOf([col.getX(3 * t), col.getY(3 * t), col.getZ(3 * t)]);
    const cy = (P[9 * t + 1] + P[9 * t + 4] + P[9 * t + 7]) / 3;
    const cz = (P[9 * t + 2] + P[9 * t + 5] + P[9 * t + 8]) / 3;
    const sail = hx === SAIL;
    let k = 6;
    if (sail && cz < -3.0) k = 1;
    if (sail && cz >= -3.0 && cz < 3.7 && cy < 14.4) k = 2;
    if (sail && cy >= 14.4 && Math.abs(cz - 4.5) < 1.5) k = 3;
    if (sail && cz >= 4.4 && cy < 14.4) k = 4;
    if (SPARS.includes(hx)) k = 5;
    g[t] = k;
  }
  return { P, g };
}

type M3 = number[][];
const mul = (A: M3, B: M3): M3 => A.map((row) => [0, 1, 2].map((k) => row[0] * B[0][k] + row[1] * B[1][k] + row[2] * B[2][k]));

// rot() del script: mesh.rotation.set(pitch, heading, roll) de three.js
function rot(heading: number, roll: number, pitch: number): M3 {
  const [a, h, r] = [pitch * DEG, heading * DEG, roll * DEG];
  const Rx = [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const Ry = [[Math.cos(h), 0, Math.sin(h)], [0, 1, 0], [-Math.sin(h), 0, Math.cos(h)]];
  const Rz = [[Math.cos(r), -Math.sin(r), 0], [Math.sin(r), Math.cos(r), 0], [0, 0, 1]];
  return mul(mul(Rx, Ry), Rz);
}

// ids() del script: la imagen de grupos (H × W) con la pose R
function ids({ P, g }: SeamMesh, R: M3): { id: Int8Array; W: number; H: number } {
  const n = g.length;
  const X = new Float64Array(3 * n);
  const Y = new Float64Array(3 * n);
  const D = new Float64Array(3 * n);
  const keep = new Uint8Array(n);
  const [ct, st] = [Math.cos(TH), Math.sin(TH)];
  for (let v = 0; v < 3 * n; v++) {
    const [x, y, z] = [P[3 * v], P[3 * v + 1], P[3 * v + 2]];
    const wx = x * R[0][0] + y * R[0][1] + z * R[0][2];
    const wy = x * R[1][0] + y * R[1][1] + z * R[1][2];
    const wz = x * R[2][0] + y * R[2][1] + z * R[2][2];
    X[v] = wx * PPM;
    Y[v] = -(wy * ct - wz * st) * PPM;
    D[v] = -(wy * st + wz * ct);
    if (wy >= 0) keep[Math.floor(v / 3)] = 1;
  }
  let [xmin, xmax, ymin, ymax] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let v = 0; v < 3 * n; v++) [xmin, xmax, ymin, ymax] = [Math.min(xmin, X[v]), Math.max(xmax, X[v]), Math.min(ymin, Y[v]), Math.max(ymax, Y[v])];
  const x0 = Math.floor(xmin) - PAD;
  const y0 = Math.floor(ymin) - PAD;
  const W = Math.ceil(xmax) - x0 + PAD;
  const H = Math.ceil(ymax) - y0 + PAD;
  const WS = W * SS;
  const HS = H * SS;
  const zb = new Float64Array(WS * HS).fill(Infinity);
  const ib = new Int8Array(WS * HS);
  for (let k = 0; k < n; k++) {
    if (!keep[k]) continue;
    const [xa, xb, xc] = [(X[3 * k] - x0) * SS, (X[3 * k + 1] - x0) * SS, (X[3 * k + 2] - x0) * SS];
    const [ya, yb, yc] = [(Y[3 * k] - y0) * SS, (Y[3 * k + 1] - y0) * SS, (Y[3 * k + 2] - y0) * SS];
    const area = (xb - xa) * (yc - ya) - (xc - xa) * (yb - ya);
    if (Math.abs(area) < 1e-9) continue;
    const bx0 = Math.max(Math.floor(Math.min(xa, xb, xc)), 0);
    const bx1 = Math.min(Math.ceil(Math.max(xa, xb, xc)), WS - 1);
    const by0 = Math.max(Math.floor(Math.min(ya, yb, yc)), 0);
    const by1 = Math.min(Math.ceil(Math.max(ya, yb, yc)), HS - 1);
    const [d0, d1, d2] = [D[3 * k], D[3 * k + 1], D[3 * k + 2]];
    for (let j = by0; j <= by1; j++) {
      const YY = j + 0.5;
      for (let i = bx0; i <= bx1; i++) {
        const XX = i + 0.5;
        const w0 = ((xb - XX) * (yc - YY) - (xc - XX) * (yb - YY)) / area;
        const w1 = ((xc - XX) * (ya - YY) - (xa - XX) * (yc - YY)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const d = w0 * d0 + w1 * d1 + w2 * d2;
        if (d < zb[j * WS + i]) {
          zb[j * WS + i] = d;
          ib[j * WS + i] = g[k];
        }
      }
    }
  }
  const id = new Int8Array(W * H);
  const count = new Int32Array(7);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      count.fill(0);
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) count[ib[(r * SS + sy) * WS + c * SS + sx]]++;
      let best = 0;
      for (let k = 1; k < 7; k++) if (count[k] > count[best]) best = k;
      id[r * W + c] = best;
    }
  }
  return { id, W, H };
}

// seam() del script: por fila con las 2 cangrejas, el ancho de la costura o −1
function seam({ id, W, H }: { id: Int8Array; W: number; H: number }): number[] {
  const out: number[] = [];
  for (let r = 0; r < H; r++) {
    const row = id.subarray(r * W, (r + 1) * W);
    let ra = -1;
    let lb = -1;
    for (let c = 0; c < W; c++) {
      if (row[c] === 1) ra = c;
      if (row[c] === 2 && lb < 0) lb = c;
    }
    if (ra < 0 || lb < 0) continue;
    let clear = lb > ra + 1;
    for (let c = ra + 1; clear && c < lb; c++) clear = row[c] === 0 || row[c] === 5 || row[c] === 6;
    out.push(clear ? lb - ra - 1 : -1);
  }
  return out;
}

export interface SeamResult {
  rows2px: number[]; // filas con costura de ≥ 2 px, por momento
  min: number; // filas_costura_2px_min
  median: number; // filas_costura_2px_mediana (int, como el script)
  fusedPct: number; // fundidas_pct: momentos con ≤ 1 fila de costura de ≥ 1 px
}

// measure() del script, con los 200 momentos de AD-37 (d)
export function measureSeam(mesh: SeamMesh): SeamResult {
  const rows2px: number[] = [];
  let fused = 0;
  MOMENTS.a.forEach((a, i) => {
    const pr = seam(ids(mesh, rot(45, 3 * Math.sin(a), 1.5 * Math.sin(MOMENTS.b[i]))));
    rows2px.push(pr.filter((w) => w >= 2).length);
    if (pr.filter((w) => w >= 1).length <= 1) fused++;
  });
  const sorted = [...rows2px].sort((x, y) => x - y);
  const median = Math.trunc((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  return { rows2px, min: sorted[0], median, fusedPct: Math.round((fused / rows2px.length) * 1000) / 10 };
}

// Barcos procedurales según docs/game/ASSET-SPEC.md §8: casco por loft + aparejo + piezas, fusionados en
// 1 geometría por LOD (1 draw call por barco) con colores por vértice. Ejes del asset: +Y arriba, +Z proa,
// +X babor; origen en la flotación, en el centro de la eslora del casco. Mismo contrato que un .glb futuro.
import * as THREE from 'three';
import { ShipKind } from '../../game/constants';
import { RING_COLORS, SHIP_LOOKS, ShipLook } from '../art';
import { GeoBuilder, lin, trs, Vec3 } from './geometry-utils';

const deg = Math.PI / 180;

// ---- §8.1 Perfiles del casco: u, a (semimanga en cubierta), b (en la flotación), s (arrufo), k (quilla) ----
type ProfileRow = readonly [number, number, number, number, number];

const PROFILES: Record<'standard' | 'fine' | 'full', readonly ProfileRow[]> = {
  standard: [
    [-0.5, 0.8, 0.62, 1.3, 0.35], [-0.4, 0.96, 0.85, 1.15, 0.75], [-0.25, 1.0, 0.93, 1.04, 1.0], [0, 1.0, 0.95, 1.0, 1.0],
    [0.2, 0.97, 0.88, 1.03, 1.0], [0.36, 0.72, 0.56, 1.12, 0.85], [0.5, 0, 0, 1.28, 0.3]
  ],
  fine: [
    [-0.5, 0.62, 0.48, 1.18, 0.35], [-0.4, 0.88, 0.78, 1.08, 0.75], [-0.25, 1.0, 0.92, 1.02, 1.0], [0, 1.0, 0.94, 1.0, 1.0],
    [0.2, 0.92, 0.82, 1.02, 1.0], [0.36, 0.55, 0.42, 1.1, 0.85], [0.5, 0, 0, 1.25, 0.3]
  ],
  full: [
    [-0.5, 0.92, 0.8, 1.4, 0.45], [-0.4, 1.0, 0.93, 1.22, 0.85], [-0.25, 1.0, 0.97, 1.05, 1.0], [0, 1.0, 0.97, 1.0, 1.0],
    [0.2, 1.0, 0.95, 1.04, 1.0], [0.36, 0.88, 0.78, 1.15, 0.9], [0.5, 0.3, 0.18, 1.3, 0.5]
  ]
};

const LOD1_STATIONS = [-0.5, -0.25, 0, 0.36, 0.5]; // §7

interface Station { a: number; b: number; s: number; k: number }

function sample(profile: readonly ProfileRow[], u: number): Station {
  const last = profile[profile.length - 1];
  if (u <= profile[0][0]) return { a: profile[0][1], b: profile[0][2], s: profile[0][3], k: profile[0][4] };
  if (u >= last[0]) return { a: last[1], b: last[2], s: last[3], k: last[4] };
  for (let i = 0; i < profile.length - 1; i++) {
    const p = profile[i];
    const q = profile[i + 1];
    if (u <= q[0]) {
      const t = (u - p[0]) / (q[0] - p[0]);
      return { a: p[1] + (q[1] - p[1]) * t, b: p[2] + (q[2] - p[2]) * t, s: p[3] + (q[3] - p[3]) * t, k: p[4] + (q[4] - p[4]) * t };
    }
  }
  return { a: last[1], b: last[2], s: last[3], k: last[4] };
}

// ---- §8.4 Recetas por clase ----
type ZY = readonly [number, number]; // (z, y), como en las tablas de clase

interface SquareSail { w: number; h: number; yb: number }

interface MastDef {
  z: number;
  h: number; // altura de la punta sobre la flotación
  baseY?: number; // base sobre un castillo (mesana del mercante)
  squares?: SquareSail[];
  gaff?: { A: ZY; B: ZY; C: ZY; D: ZY };
  lateen?: { A: ZY; B: ZY; C: ZY };
  topY?: number; // cofa (LOD0)
}

interface BoxDef { size: Vec3; pos: Vec3; kind: 'castle' | 'lantern' | 'cargo' }
interface FireAt { z: number; y?: number }

export interface ShipRecipe {
  assetId: string;
  sbKind: 'ship' | 'npc';
  look: ShipKind;
  L: number;
  B: number;
  F: number;
  D: number;
  bowsprit: number;
  railH: number;
  profile: keyof typeof PROFILES;
  rake: number; // caída de los mástiles hacia popa (rad)
  masts: MastDef[];
  flagMast: number; // índice del palo mayor
  jibs: { H: Vec3; T: Vec3 | 'tip'; C: Vec3 }[];
  boxes: BoxDef[];
  barrels: Vec3[];
  cannonZ: number[];
  cannonY: number;
  cannon: [number, number, number]; // radio superior (boca), inferior, largo
  sailStyle: 'plain' | 'notched' | 'striped';
  flagStyle: 'pennant' | 'flag';
  trimRail: boolean;
  cannonScale: number; // escala del fogonazo y del humo (VFX §1)
  knifeOpen?: number; // apertura de las velas de cuchillo (D12): 25° por defecto, 35° solo si la clase no pasa AS-V14
  // Excepciones de socket_fire_01…03 (D22, AS-V17): z propia y, si cae sobre una superestructura, y = su tapa + 0,3.
  // x sigue la fórmula (+0,2·B / −0,2·B / 0)
  fire?: [FireAt?, FireAt?, FireAt?];
  radius: number; // sb_radius
  mastHeight: number;
  pick: Vec3;
}

const SLOOP: ShipRecipe = {
  assetId: 'ship_sloop', sbKind: 'ship', look: 'player',
  L: 16, B: 4.4, F: 1.5, D: 0.8, bowsprit: 4.5, railH: 0.5, profile: 'standard', rake: 0,
  masts: [{ z: 1.5, h: 14.5, gaff: { A: [1.1, 2.8], B: [1.1, 10.6], C: [-5.3, 11.8], D: [-7.4, 3.4] }, squares: [{ w: 5.6, h: 2.4, yb: 11.4 }] }],
  flagMast: 0,
  jibs: [{ H: [0, 12.0, 1.8], T: 'tip', C: [0, 2.9, 6.47] }],
  boxes: [{ size: [2.6, 0.7, 2.4], pos: [0, 2.1, -6.6], kind: 'castle' }],
  barrels: [],
  fire: [undefined, undefined, { z: -4.4 }], // _03 fuera de la camareta (13 % de solape con la fórmula)
  cannonZ: [-4.5, -1.5, 1.5, 4.5], cannonY: 0.9, cannon: [0.12, 0.16, 1.2],
  sailStyle: 'plain', flagStyle: 'pennant', trimRail: false, cannonScale: 0.8,
  radius: 9, mastHeight: 14.5, pick: [3.2, 14.5, 8.0]
};

const BRIGANTINE: ShipRecipe = {
  assetId: 'ship_brigantine', sbKind: 'ship', look: 'player',
  L: 24, B: 6.2, F: 2.0, D: 1.1, bowsprit: 6.0, railH: 0.7, profile: 'standard', rake: 0,
  masts: [
    { z: 5.5, h: 18, squares: [{ w: 9.0, h: 3.6, yb: 4.4 }, { w: 7.4, h: 3.2, yb: 8.3 }, { w: 5.6, h: 2.4, yb: 11.8 }], topY: 8.1 },
    { z: -3.0, h: 19.5, gaff: { A: [-3.4, 3.8], B: [-3.4, 13.6], C: [-11.4, 15.0], D: [-12.4, 4.4] }, squares: [{ w: 5.8, h: 2.6, yb: 15.4 }] }
  ],
  flagMast: 1,
  jibs: [{ H: [0, 14.8, 5.8], T: [0, 4.89, 17.58], C: [0, 3.44, 11.1] }],
  boxes: [{ size: [4.0, 1.0, 4.0], pos: [0, 2.8, -9.6], kind: 'castle' }],
  barrels: [],
  fire: [undefined, undefined, { z: -6.0 }], // _03 fuera de la camareta (33 %)
  cannonZ: [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5], cannonY: 1.2, cannon: [0.14, 0.18, 1.4],
  sailStyle: 'plain', flagStyle: 'pennant', trimRail: false, cannonScale: 1.0,
  radius: 13, mastHeight: 19.5, pick: [4.8, 19.5, 12.0]
};

const FRIGATE: ShipRecipe = {
  assetId: 'ship_frigate', sbKind: 'ship', look: 'player',
  L: 34, B: 8.6, F: 2.8, D: 1.5, bowsprit: 8.0, railH: 1.0, profile: 'standard', rake: 0,
  masts: [
    { z: 10, h: 24, squares: [{ w: 12.0, h: 4.6, yb: 5.6 }, { w: 9.8, h: 4.0, yb: 10.6 }, { w: 7.4, h: 3.0, yb: 15.0 }], topY: 10.3 },
    { z: 0.5, h: 27, squares: [{ w: 13.2, h: 5.0, yb: 5.6 }, { w: 10.8, h: 4.4, yb: 11.0 }, { w: 8.0, h: 3.2, yb: 15.8 }], topY: 10.7 },
    { z: -9.5, h: 21, gaff: { A: [-9.9, 5.4], B: [-9.9, 13.0], C: [-16.9, 14.6], D: [-18.4, 6.0] }, squares: [{ w: 7.6, h: 3.2, yb: 14.0 }] }
  ],
  flagMast: 1,
  jibs: [
    { H: [0, 18.7, 10.3], T: [0, 5.35, 21.08], C: [0, 4.34, 15.15] },
    { H: [0, 21.6, 10.3], T: [0, 6.58, 24.46], C: [0, 4.34, 16.67] }
  ],
  boxes: [
    { size: [6.9, 1.6, 9.0], pos: [0, 3.96, -12.5], kind: 'castle' },
    { size: [5.6, 1.0, 5.5], pos: [0, 3.64, 12.25], kind: 'castle' },
    { size: [0.35, 0.55, 0.35], pos: [2.6, 5.4, -16.8], kind: 'lantern' },
    { size: [0.35, 0.55, 0.35], pos: [-2.6, 5.4, -16.8], kind: 'lantern' },
    { size: [0.9, 0.6, 0.06], pos: [-2.0, 3.0, -17.05], kind: 'lantern' },
    { size: [0.9, 0.6, 0.06], pos: [0, 3.0, -17.05], kind: 'lantern' },
    { size: [0.9, 0.6, 0.06], pos: [2.0, 3.0, -17.05], kind: 'lantern' }
  ],
  barrels: [],
  // _01 fuera del castillo de proa (20 %); _03 sobre el alcázar, en su tapa (4,76) + 0,3 (estaba dentro al 100 %)
  fire: [{ z: 7.4 }, undefined, { z: -12.5, y: 5.06 }],
  cannonZ: [-11.5, -8.5, -5.5, -2.5, 0.5, 3.5, 6.5, 9.5], cannonY: 1.68, cannon: [0.16, 0.21, 1.6],
  sailStyle: 'plain', flagStyle: 'pennant', trimRail: true, cannonScale: 1.2,
  radius: 18, mastHeight: 27, pick: [7.0, 27.0, 17.0]
};

const PIRATE: ShipRecipe = {
  assetId: 'npc_pirate', sbKind: 'npc', look: 'pirate',
  L: 20, B: 5.0, F: 1.6, D: 0.9, bowsprit: 6.0, railH: 0.56, profile: 'fine', rake: 8 * deg,
  masts: [
    { z: 4.5, h: 16, squares: [{ w: 7.6, h: 3.2, yb: 3.6 }, { w: 6.0, h: 2.8, yb: 7.2 }] },
    { z: -2.5, h: 17.5, gaff: { A: [-2.9, 3.4], B: [-2.9, 12.0], C: [-9.4, 13.4], D: [-10.4, 3.9] } }
  ],
  flagMast: 1,
  jibs: [{ H: [0, 13.1, 4.8], T: [0, 4.39, 15.58], C: [0, 2.96, 9.65] }],
  boxes: [],
  barrels: [],
  cannonZ: [-5.6, -2.4, 0.8, 4.0], cannonY: 0.96, cannon: [0.13, 0.17, 1.3],
  sailStyle: 'notched', flagStyle: 'flag', trimRail: false, cannonScale: 1.0,
  radius: 11, mastHeight: 17.5, pick: [4.1, 17.5, 10.0]
};

const MERCHANT: ShipRecipe = {
  assetId: 'npc_merchant', sbKind: 'npc', look: 'merchant',
  L: 22, B: 7.6, F: 2.4, D: 1.2, bowsprit: 4.0, railH: 0.84, profile: 'full', rake: 0,
  masts: [
    { z: 5.0, h: 16, squares: [{ w: 8.6, h: 3.6, yb: 4.6 }, { w: 7.0, h: 3.0, yb: 8.6 }] },
    { z: -2.5, h: 17.5, squares: [{ w: 9.2, h: 3.8, yb: 4.6 }, { w: 7.4, h: 3.2, yb: 8.8 }] },
    { z: -8.0, h: 12, baseY: 4.65, lateen: { A: [-5.0, 4.5], B: [-11.4, 4.8], C: [-12.4, 11.5] } }
  ],
  flagMast: 1,
  jibs: [{ H: [0, 13.1, 5.3], T: 'tip', C: [0, 3.96, 9.53] }], // D12: era la única clase sin vela a proa
  boxes: [
    { size: [6.0, 1.8, 5.4], pos: [0, 3.75, -8.3], kind: 'castle' },
    // D22: el par de z +1,0 pasa a −3,0; metía el 26 % de la elipse de socket_fire_02 dentro de una caja (Q18)
    ...[2.6, -3.0, -4.4].flatMap((z) => [1.2, -1.2].map((x): BoxDef => ({ size: [1.4, 1.4, 1.4], pos: [x, 3.1, z], kind: 'cargo' })))
  ],
  barrels: [[-1.3, 3.2, 7.6], [0, 3.2, 7.6], [1.3, 3.2, 7.6]],
  fire: [undefined, undefined, { z: -8.3, y: 4.95 }], // _03 sobre el castillo de popa, en su tapa (4,65) + 0,3 (93 %)
  cannonZ: [], cannonY: 0, cannon: [0, 0, 0],
  sailStyle: 'striped', flagStyle: 'flag', trimRail: false, cannonScale: 1.0,
  radius: 12, mastHeight: 17.5, pick: [4.9, 17.5, 11.0]
};

// classId de la simulación (src/game/constants.ts) → receta
export const SHIP_RECIPES: Record<string, ShipRecipe> = {
  sloop: SLOOP,
  brig: BRIGANTINE,
  frigate: FRIGATE,
  pirate: PIRATE,
  merchant: MERCHANT
};

export const LOD_PX: [number, number] = [72, 64]; // LOD0 si L·ppm ≥ 72; LOD1 si < 64 (histéresis)

export interface ShipSockets {
  cannonsPort: THREE.Vector3[]; // 01 = el más a popa
  cannonsStbd: THREE.Vector3[];
  smoke: THREE.Vector3;
  fire: THREE.Vector3[];
  label: THREE.Vector3;
  wake: THREE.Vector3;
  bow: THREE.Vector3;
}

export interface ShipExtras {
  sb_version: 1;
  sb_kind: 'ship' | 'npc';
  sb_id: string;
  sb_length: number;
  sb_beam: number;
  sb_freeboard: number;
  sb_draft: number;
  sb_mast_height: number;
  sb_radius: number;
  sb_pick: Vec3;
  sb_cannons_per_side: number;
  sb_lod_px: [number, number];
}

export interface ShipModel {
  classId: string;
  recipe: ShipRecipe;
  lods: [THREE.BufferGeometry, THREE.BufferGeometry];
  triangles: [number, number];
  hullBox: THREE.Box3; // caja del casco de LOD0, sin bauprés (AS-V03)
  sails: [[number, number][], [number, number][]]; // rangos de triángulos de vela por LOD (AS-V14)
  extras: ShipExtras;
  sockets: ShipSockets;
}

// ---- Construcción ----

function deckY(r: ShipRecipe, u: number): number {
  return sample(PROFILES[r.profile], u).s * r.F;
}

function section(r: ShipRecipe, u: number, side: 1 | -1): Vec3[] {
  const { a, b, s, k } = sample(PROFILES[r.profile], u);
  const hb = r.B / 2;
  const yd = s * r.F;
  const z = u * r.L;
  const xAt = (y: number) => hb * (b + ((a - b) * y) / yd);
  const y1 = yd - 0.3 * r.F;
  const y2 = yd - 0.55 * r.F;
  return [
    [side * a * hb, yd + r.railH, z], // V5 regala
    [side * a * hb, yd, z], // V0 canto de cubierta
    [side * xAt(y1), y1, z], // V1 arriba de la franja
    [side * xAt(y2), y2, z], // V2 abajo de la franja
    [side * b * hb, 0, z], // V3 flotación
    [0, -k * r.D, z] // V4 quilla
  ];
}

function loftHull(g: GeoBuilder, r: ShipRecipe, look: ShipLook, stations: readonly number[]): void {
  const cHull = lin(look.hull);
  const cRail = lin(r.trimRail ? look.trim : look.rail);
  const strips: [number, number, THREE.Color][] = [
    [1, 0, cRail], [1, 2, cHull], [2, 3, lin(look.band)], [3, 4, cHull], [4, 5, lin(look.bottom)]
  ];
  const secs = stations.map((u) => ({ port: section(r, u, 1), stbd: section(r, u, -1) }));
  for (let i = 0; i < secs.length - 1; i++) {
    const s0 = secs[i];
    const s1 = secs[i + 1];
    for (const [a, b] of [[s0.port, s1.port], [s0.stbd, s1.stbd]]) {
      for (const [p, q, c] of strips) g.quad(a[p], a[q], b[q], b[p], c);
    }
    g.quad(s0.port[1], s0.stbd[1], s1.stbd[1], s1.port[1], lin(look.deck));
  }
  // Tapas: espejo de popa y proa (solo si la proa tiene manga en u = +0,5)
  cap(g, secs[0], cHull);
  if (sample(PROFILES[r.profile], 0.5).a > 0) cap(g, secs[secs.length - 1], cHull);
}

function cap(g: GeoBuilder, sec: { port: Vec3[]; stbd: Vec3[] }, color: THREE.Color): void {
  const ring = [...sec.port, ...sec.stbd.slice(0, 5).reverse()];
  const faces = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const [i, j, k] of faces) g.tri(ring[i], ring[j], ring[k], color);
}

// Cilindro entre dos puntos (botavaras, picos, entenas)
function spar(g: GeoBuilder, group: THREE.Matrix4, p: Vec3, q: Vec3, radius: number, color: THREE.Color): void {
  const a = new THREE.Vector3(...p);
  const b = new THREE.Vector3(...q);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const m = new THREE.Matrix4().compose(
    a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
    new THREE.Vector3(1, 1, 1)
  );
  g.add(new THREE.CylinderGeometry(radius, radius, len, 5), group.clone().multiply(m), color);
}

// Vela triangular o en abanico con panza: centro desplazado en X
function fanSail(g: GeoBuilder, group: THREE.Matrix4, pts: Vec3[], bulge: number, color: THREE.Color): void {
  const c = pts.reduce<Vec3>((acc, p) => [acc[0] + p[0] / pts.length, acc[1] + p[1] / pts.length, acc[2] + p[2] / pts.length], [0, 0, 0]);
  c[0] += bulge;
  const t = (p: Vec3): Vec3 => new THREE.Vector3(...p).applyMatrix4(group).toArray() as Vec3;
  const tc = t(c);
  g.mark(() => {
    for (let i = 0; i < pts.length; i++) g.tri(t(pts[i]), t(pts[(i + 1) % pts.length]), tc, color);
  });
}

const zy = (p: ZY): Vec3 => [0, p[1], p[0]];

// D12 (ASSET-SPEC §8.3): las velas de cuchillo se abren `open` alrededor de su gratil (eje por `p` en la dirección
// `axis`), con sus palos. El sentido se elige para que el puño libre `free` vaya siempre hacia −X (estribor): toda
// la flota abre hacia el mismo costado que la prueba medida (cuchillo25)
function opened(group: THREE.Matrix4, p: Vec3, axis: Vec3, free: Vec3, open: number): THREE.Matrix4 {
  const u = new THREE.Vector3(...axis).normalize();
  const r = new THREE.Vector3(free[0] - p[0], free[1] - p[1], free[2] - p[2]);
  const side = new THREE.Vector3().crossVectors(u, r).x; // x del desplazamiento = side·sin(ángulo)
  const angle = side > 0 ? -open : open;
  return group.clone()
    .multiply(new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]))
    .multiply(new THREE.Matrix4().makeRotationAxis(u, angle))
    .multiply(new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
}
const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function squareSail(g: GeoBuilder, r: ShipRecipe, look: ShipLook, group: THREE.Matrix4, mast: MastDef, sail: SquareSail, lod: 0 | 1, rm: number): void {
  const segs: [number, number] = r.sailStyle === 'notched' ? [4, 2] : r.sailStyle === 'striped' ? [2, 5] : [2, 2];
  const plane = new THREE.PlaneGeometry(sail.w, sail.h, segs[0], segs[1]);
  const pos = plane.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    const u = x / sail.w + 0.5;
    const v = y / sail.h + 0.5;
    // Borde raído del pirata: los vértices inferiores en u' = 0,25 y 0,75 suben 0,6 m
    if (r.sailStyle === 'notched' && v < 1e-6 && (Math.abs(u - 0.25) < 1e-6 || Math.abs(u - 0.75) < 1e-6)) y += 0.6;
    pos.setXYZ(i, x, y, 0.12 * sail.w * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)); // panza hacia proa
  }
  // Braza de +20° alrededor del eje del mástil (§8.3) para que no se vea de canto con rumbo E/O
  const brace = new THREE.Matrix4().makeTranslation(0, 0, mast.z).multiply(new THREE.Matrix4().makeRotationY(20 * deg));
  const sailM = group.clone().multiply(brace).multiply(trs(0, sail.yb + sail.h / 2, 0.45));
  const cSail = lin(look.sail);
  const stripe = look.sailStripe ? lin(look.sailStripe) : cSail;
  // PlaneGeometry ordena las filas de arriba abajo: filas 1 y 3 desde arriba en el color de franja
  const color = r.sailStyle === 'striped'
    ? (_x: number, _y: number, _z: number, t: number) => { const row = Math.floor(t / (2 * segs[0])); return row === 1 || row === 3 ? stripe : cSail; }
    : cSail;
  g.mark(() => g.add(plane, sailM, color));
  if (lod === 0) {
    const yard = group.clone().multiply(brace).multiply(trs(0, sail.yb + sail.h, 0.35, 0, 0, Math.PI / 2));
    g.add(new THREE.CylinderGeometry(0.35 * rm, 0.35 * rm, sail.w + 0.6, 5), yard, lin(look.mast));
  }
}

function boxColors(look: ShipLook, kind: BoxDef['kind']): (x: number, y: number, z: number, t: number) => THREE.Color {
  // BoxGeometry no indexada: 2 triángulos por cara en el orden +X, −X, +Y, −Y, +Z, −Z
  if (kind === 'lantern') return () => lin(look.lantern);
  const side = lin(kind === 'cargo' ? look.cargo : look.rail);
  return (_x, _y, _z, t) => (Math.floor(t / 2) === 2 ? lin(look.deck) : side);
}

function buildLod(r: ShipRecipe, lod: 0 | 1): { geometry: THREE.BufferGeometry; hullBox: THREE.Box3; triangles: number; sails: [number, number][] } {
  const look = SHIP_LOOKS[r.look];
  const g = new GeoBuilder({ rim: true });
  const rm = 0.022 * r.L;
  const cMast = lin(look.mast);
  const cSail = lin(look.sail);
  const open = (r.knifeOpen ?? 25) * deg;

  // _rim_mask = 1 solo en el casco: loft (con borda y cubierta), castillos y camaretas (D18, ASSET-SPEC §6)
  g.beginBox();
  g.rim = 1;
  loftHull(g, r, look, lod === 0 ? PROFILES[r.profile].map((row) => row[0]) : LOD1_STATIONS);
  g.rim = 0;
  const hullBox = g.endBox();

  // Bauprés: eje a 20° sobre el horizonte hacia +Z
  const bs = r.bowsprit + 1;
  const S: Vec3 = [0, 1.25 * r.F, r.L / 2 - 1];
  const dir: Vec3 = [0, 0.342, 0.94];
  const tip: Vec3 = [0, S[1] + dir[1] * bs, S[2] + dir[2] * bs];
  g.add(new THREE.CylinderGeometry(0.25 * rm, 0.45 * rm, bs, 5), trs(0, S[1] + (dir[1] * bs) / 2, S[2] + (dir[2] * bs) / 2, 70 * deg), cMast);

  r.masts.forEach((mast, index) => {
    const baseY = mast.baseY ?? deckY(r, mast.z / r.L);
    // Con caída, el mástil y sus velas giran alrededor de la base (la punta va a popa)
    const group = new THREE.Matrix4()
      .makeTranslation(0, baseY, mast.z)
      .multiply(new THREE.Matrix4().makeRotationX(-r.rake))
      .multiply(new THREE.Matrix4().makeTranslation(0, -baseY, -mast.z));
    const len = mast.h - baseY;
    g.add(new THREE.CylinderGeometry(0.6 * rm, rm, len, 6), group.clone().multiply(trs(0, baseY + len / 2, mast.z)), cMast);
    for (const sail of mast.squares ?? []) squareSail(g, r, look, group, mast, sail, lod, rm);
    if (mast.gaff) {
      // Cangreja: vela + botavara + pico giran alrededor del eje del mástil (gratil A→B)
      const { A, B, C, D } = mast.gaff;
      const axis: Vec3 = [0, B[1] - A[1], B[0] - A[0]];
      const m = opened(group, zy(A), axis, zy(D), open);
      fanSail(g, m, [zy(A), zy(B), zy(C), zy(D)], 0.08 * dist3(zy(A), zy(D)), cSail);
      if (lod === 0) {
        spar(g, m, zy(A), zy(D), 0.3 * rm, cMast);
        spar(g, m, zy(B), zy(C), 0.3 * rm, cMast);
      }
    }
    if (mast.lateen) {
      // Latina: alrededor del eje vertical que pasa por la amura A, con la entena
      const { A, B, C } = mast.lateen;
      const m = opened(group, zy(A), [0, 1, 0], zy(B), open);
      fanSail(g, m, [zy(A), zy(B), zy(C)], 0.06 * dist3(zy(A), zy(C)), cSail);
      if (lod === 0) spar(g, m, zy(A), zy(C), 0.3 * rm, cMast);
    }
    if (lod === 0 && mast.topY !== undefined) {
      g.add(new THREE.CylinderGeometry(0.045 * r.L, 0.04 * r.L, 0.5, 6), group.clone().multiply(trs(0, mast.topY, mast.z)), lin(look.rail));
    }
    if (index === r.flagMast) flag(g, r, look, group, mast);
  });

  for (const jib of r.jibs) {
    // Foque: alrededor del estay T→H
    const T = jib.T === 'tip' ? tip : jib.T;
    const m = opened(new THREE.Matrix4(), T, [jib.H[0] - T[0], jib.H[1] - T[1], jib.H[2] - T[2]], jib.C, open);
    fanSail(g, m, [jib.H, T, jib.C], 0.06 * dist3(jib.H, T), cSail);
  }

  for (const box of r.boxes) {
    if (lod === 1 && box.kind !== 'castle') continue;
    const geo = new THREE.BoxGeometry(...box.size);
    // La cara inferior de los castillos queda dentro del casco: no se dibuja
    g.rim = box.kind === 'castle' ? 1 : 0;
    g.add(geo, trs(...box.pos), boxColors(look, box.kind), box.kind === 'castle' ? (t) => Math.floor(t / 2) === 3 : undefined);
    g.rim = 0;
  }

  if (lod === 0) {
    for (const p of r.barrels) g.add(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 6), trs(...p), lin(look.barrel));
    const [rTop, rBot, len] = r.cannon;
    for (const z of r.cannonZ) {
      const a = sample(PROFILES[r.profile], z / r.L).a;
      for (const side of [1, -1] as const) {
        const x = side * (a * r.B / 2 + 0.3);
        // La boca (radio superior) mira hacia afuera de la banda
        g.add(new THREE.CylinderGeometry(rTop, rBot, len, 6), trs(x - side * (len / 2), r.cannonY, z, 0, 0, -side * Math.PI / 2), lin(look.cannon));
        g.add(new THREE.BoxGeometry(0.06, 0.5, 0.6), trs(side * (a * r.B / 2 + 0.02), r.cannonY, z), lin(look.gunport));
      }
    }
  }

  return { geometry: g.build(), hullBox, triangles: g.triangles, sails: g.marks };
}

function flag(g: GeoBuilder, r: ShipRecipe, look: ShipLook, group: THREE.Matrix4, mast: MastDef): void {
  const kf = r.L / 16;
  const top = mast.h;
  const t = (p: Vec3): Vec3 => new THREE.Vector3(...p).applyMatrix4(group).toArray() as Vec3;
  if (r.flagStyle === 'pennant') {
    g.tri(t([0, top, mast.z]), t([0, top - 0.5 * kf, mast.z]), t([0, top - 0.25 * kf, mast.z - 2.4 * kf]), lin(look.flag));
    return;
  }
  // Bandera en el plano YZ que ondea hacia popa, con un cuadro claro en las dos caras
  const w = kf;
  const h = 0.65 * kf;
  g.add(new THREE.PlaneGeometry(w, h), group.clone().multiply(trs(0, top - h / 2, mast.z - w / 2, 0, Math.PI / 2)), lin(look.flag));
  if (look.flagMark) {
    const m = r.look === 'pirate' ? 0.4 : 0.32 * w;
    for (const side of [1, -1]) {
      g.add(new THREE.PlaneGeometry(m, m), group.clone().multiply(trs(side * 0.01, top - h / 2, mast.z - w / 2, 0, Math.PI / 2)), lin(look.flagMark));
    }
  }
}

// socket_fire_NN (ASSET-SPEC §3): (x, yd(u) + 0,3, u·L), salvo las excepciones de la receta (D22, AS-V17)
function fireSocket(r: ShipRecipe, i: 0 | 1 | 2, x: number, u: number): THREE.Vector3 {
  const at = r.fire?.[i];
  const z = at ? at.z : u * r.L;
  return new THREE.Vector3(x, at?.y ?? deckY(r, z / r.L) + 0.3, z);
}

function buildSockets(r: ShipRecipe): ShipSockets {
  const zs = [...r.cannonZ].sort((a, b) => a - b);
  const cannon = (side: 1 | -1) => zs.map((z) => new THREE.Vector3(side * (sample(PROFILES[r.profile], z / r.L).a * r.B / 2 + 0.3), 0.6 * r.F, z));
  return {
    cannonsPort: cannon(1),
    cannonsStbd: cannon(-1),
    smoke: new THREE.Vector3(0, deckY(r, -0.15) + 0.5, -0.15 * r.L),
    fire: [fireSocket(r, 0, 0.2 * r.B, 0.25), fireSocket(r, 1, -0.2 * r.B, 0), fireSocket(r, 2, 0, -0.3)],
    label: new THREE.Vector3(0, r.mastHeight + 1.5, 0),
    wake: new THREE.Vector3(0, 0, -r.L / 2),
    bow: new THREE.Vector3(0, 0, r.L / 2)
  };
}

const models = new Map<string, ShipModel>();

// Modelo compartido por clase (la geometría no se libera: se reutiliza entre barcos)
export function getShipModel(classId: string): ShipModel {
  const key = SHIP_RECIPES[classId] ? classId : 'sloop';
  let model = models.get(key);
  if (model) return model;
  const r = SHIP_RECIPES[key];
  const lod0 = buildLod(r, 0);
  const lod1 = buildLod(r, 1);
  model = {
    classId: key,
    recipe: r,
    lods: [lod0.geometry, lod1.geometry],
    triangles: [lod0.triangles, lod1.triangles],
    hullBox: lod0.hullBox,
    sails: [lod0.sails, lod1.sails],
    extras: {
      sb_version: 1,
      sb_kind: r.sbKind,
      sb_id: r.assetId,
      sb_length: r.L,
      sb_beam: r.B,
      sb_freeboard: r.F,
      sb_draft: r.D,
      sb_mast_height: r.mastHeight,
      sb_radius: r.radius,
      sb_pick: r.pick,
      sb_cannons_per_side: r.cannonZ.length,
      sb_lod_px: LOD_PX
    },
    sockets: buildSockets(r)
  };
  models.set(key, model);
  return model;
}

// Jerarquía de §3 (raíz, LODs y sockets con nombre): la que tendría el .glb; la usan los tests de contrato
export function buildShipAsset(classId: string, material: THREE.Material = createShipMaterial()): THREE.Group {
  const model = getShipModel(classId);
  const id = model.recipe.assetId;
  const root = new THREE.Group();
  root.name = id;
  root.userData = { ...model.extras };
  model.lods.forEach((geometry, i) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${id}_lod${i}`;
    mesh.visible = i === 0;
    root.add(mesh);
  });
  const socket = (name: string, p: THREE.Vector3, rotY = 0) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.copy(p);
    o.rotation.y = rotY;
    root.add(o);
  };
  const nn = (i: number) => String(i + 1).padStart(2, '0');
  model.sockets.cannonsPort.forEach((p, i) => socket(`socket_cannon_port_${nn(i)}`, p, Math.PI / 2));
  model.sockets.cannonsStbd.forEach((p, i) => socket(`socket_cannon_stbd_${nn(i)}`, p, -Math.PI / 2));
  socket('socket_smoke', model.sockets.smoke);
  model.sockets.fire.forEach((p, i) => socket(`socket_fire_${nn(i)}`, p));
  socket('socket_label', model.sockets.label);
  socket('socket_wake', model.sockets.wake);
  socket('socket_bow', model.sockets.bow);
  return root;
}

// ---- §6 Material único por barco (mismo programa; uniforms propios para el destello y el daño, VFX §5–6, §12) ----
export interface ShipFx {
  uHit: { value: number };
  uDamage: { value: number };
  uShield: { value: number };
  uShieldColor: { value: THREE.Color };
}

export type ShipMaterial = THREE.MeshStandardMaterial & { userData: { fx: ShipFx } };

const SHIELD_COLOR = new THREE.Color(RING_COLORS.shield);

// Misma función para todos los materiales → misma clave de caché → un único programa de shader
function shipOnBeforeCompile(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms): void {
  const fx = (this.userData as { fx: ShipFx }).fx;
  shader.vertexShader = 'attribute float _rim_mask;\nvarying float vRimMask;\n' +
    shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvRimMask = _rim_mask;');
  shader.uniforms.uHit = fx.uHit;
  shader.uniforms.uDamage = fx.uDamage;
  shader.uniforms.uShield = fx.uShield;
  shader.uniforms.uShieldColor = fx.uShieldColor;
  // Protección (VFX §12, D8, D18): borde luminoso (rim) solo en el casco (_rim_mask), no un velo sobre el difuso.
  // Con cámara ortográfica la dirección de vista es (0, 0, 1) en espacio de vista, como geometryViewDir de three
  shader.fragmentShader = 'uniform float uHit;\nuniform float uDamage;\nuniform float uShield;\nuniform vec3 uShieldColor;\nvarying float vRimMask;\n' +
    shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.rgb = diffuseColor.rgb * (1.0 - 0.25 * uDamage) + vec3(0.35) * uHit;'
      )
      .replace(
        '#include <opaque_fragment>',
        '\tvec3 sbViewDir = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);\n' +
          '\toutgoingLight += uShieldColor * 0.6 * uShield * vRimMask * pow(1.0 - abs(dot(normal, sbViewDir)), 2.0);\n#include <opaque_fragment>'
      );
}

export function createShipMaterial(): ShipMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide
  }) as ShipMaterial;
  material.userData.fx = { uHit: { value: 0 }, uDamage: { value: 0 }, uShield: { value: 0 }, uShieldColor: { value: SHIELD_COLOR } };
  material.onBeforeCompile = shipOnBeforeCompile;
  return material;
}

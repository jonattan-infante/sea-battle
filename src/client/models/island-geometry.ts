// Islas, puerto y props procedurales según docs/game/ASSET-SPEC.md §9. Todas las islas y el puerto se fusionan
// en una geometría estática (1 draw call); palmeras, boyas y restos son InstancedMesh (1 draw call cada uno).
import * as THREE from 'three';
import { IslandDef, PORT_POSITION, SAFE_ZONE_RADIUS } from '../../game/constants';
import { createRng } from '../../game/vec';
import { PALETTE } from '../art';
import { GeoBuilder, lin, trs } from './geometry-utils';

const deg = Math.PI / 180;
const BEACH_WATERLINE = 1 - 0.12 * (0.6 / 1.4); // radio de la playa en y = 0 relativo a la base (cilindro 0,88r→r de −0,6 a +0,8)

export interface PropInstance {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
}

export interface IslandBuild {
  geometry: THREE.BufferGeometry;
  palms: PropInstance[];
  triangles: Record<string, number>;
  waterlineRadii: Record<string, number[]>; // radio visual de cada columna de la playa en y = 0 (AS-V16)
}

// Semilla determinista por id de isla (FNV-1a)
export function islandSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function cylinderSides(radial: number): (t: number) => 'side' | 'top' | 'bottom' {
  // CylinderGeometry no indexada: torso (2·radial), tapa superior (radial), tapa inferior (radial)
  return (t) => (t < 2 * radial ? 'side' : t < 3 * radial ? 'top' : 'bottom');
}

function addIsland(g: GeoBuilder, island: IslandDef, palms: PropInstance[], waterline: number[]): void {
  const rnd = createRng(islandSeed(island.id));
  const r = island.radius;
  const isPort = island.id === 'PORT';
  const n = Math.min(24, Math.max(12, Math.round(r / 2.5)));

  // Playa: jitter radial solo hacia dentro. Se escala cada columna para que el radio EN LA FLOTACIÓN quede en
  // r·(1 − 0,06·rnd) ∈ [0,94r, r]: lo visible nunca supera el colisionador (AS-V16); bajo el agua no se ve.
  const beach = new THREE.CylinderGeometry(0.88 * r, r, 1.4, n);
  const colScale: number[] = [];
  for (let c = 0; c < n; c++) colScale.push((1 - 0.06 * rnd()) / BEACH_WATERLINE);
  const pos = beach.getAttribute('position');
  const top: number[] = [];
  const bottom: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (Math.hypot(x, z) < 1e-6) continue;
    const col = ((Math.round(Math.atan2(x, z) / ((2 * Math.PI) / n)) % n) + n) % n;
    pos.setX(i, x * colScale[col]);
    pos.setZ(i, z * colScale[col]);
    (pos.getY(i) > 0 ? top : bottom)[col] = Math.hypot(x, z) * colScale[col];
  }
  // Radio medido en y = 0 de mundo (y = −0,1 local: el cilindro va de −0,6 a +0,8) a partir de los vértices
  const t0 = (-0.1 + 0.7) / 1.4;
  for (let c = 0; c < n; c++) waterline.push(bottom[c] + (top[c] - bottom[c]) * t0);
  const beachPart = cylinderSides(n);
  g.add(beach, trs(island.x, 0.1, island.z), (_x, _y, _z, t) => lin(beachPart(t) === 'top' ? PALETTE.sand : PALETTE.sandWet), (t) => beachPart(t) === 'bottom');

  // Meseta desplazada
  const dx = (rnd() * 2 - 1) * 0.08 * r * Math.SQRT1_2;
  const dz = (rnd() * 2 - 1) * 0.08 * r * Math.SQRT1_2;
  const topR = 0.62 * r * (1 + (rnd() * 2 - 1) * 0.08);
  const baseR = 0.74 * r * (1 + (rnd() * 2 - 1) * 0.08);
  const plateauPart = cylinderSides(n - 2);
  g.add(new THREE.CylinderGeometry(topR, baseR, 1.0, n - 2), trs(island.x + dx, 1.3, island.z + dz), lin(PALETTE.grass), (t) => plateauPart(t) === 'bottom');

  // Colina rocosa (r ≥ 35): base grass.dark, cima rock.dark
  if (r >= 35 && !isPort) {
    const h = 0.22 * r;
    const conePart = cylinderSides(9);
    g.add(
      new THREE.ConeGeometry(0.38 * r, h, 9),
      trs(island.x + dx, 1.8 + h / 2, island.z + dz),
      (_x, y) => lin(y > 0 ? PALETTE.rockDark : PALETTE.grassDark),
      (t) => conePart(t) === 'bottom'
    );
  }

  // Rocas de costa, mitad sumergidas
  const rocks = Math.round(r / 9);
  for (let i = 0; i < rocks; i++) {
    const a = rnd() * Math.PI * 2;
    const d = r * (0.95 + rnd() * 0.1);
    const size = 1.2 + rnd() * 1.6;
    g.add(
      new THREE.DodecahedronGeometry(size, 0),
      trs(island.x + Math.sin(a) * d, 0.2, island.z + Math.cos(a) * d, rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI),
      lin(i % 2 === 0 ? PALETTE.rock : PALETTE.rockDark)
    );
  }

  // Arbustos sobre la meseta
  const bushes = Math.round(r / 5);
  for (let i = 0; i < bushes; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * topR * 0.85;
    const size = 1.0 + rnd() * 0.8;
    g.add(
      new THREE.IcosahedronGeometry(size, 0),
      trs(island.x + dx + Math.sin(a) * d, 1.8 + size * 0.3, island.z + dz + Math.cos(a) * d, 0, rnd() * Math.PI, 0, 1, 0.6, 1),
      lin(i % 2 === 0 ? PALETTE.grassDark : PALETTE.grass)
    );
  }

  // Palmeras: anillo a 0,6–0,85r; sobre la meseta o sobre la arena según caigan
  const count = Math.round(r / 6);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = r * (0.6 + rnd() * 0.25);
    const x = island.x + Math.sin(a) * d;
    const z = island.z + Math.cos(a) * d;
    const onPlateau = Math.hypot(x - island.x - dx, z - island.z - dz) < baseR * 0.95;
    palms.push({ x, y: onPlateau ? 1.8 : 0.8, z, rotY: rnd() * Math.PI * 2, scale: 0.85 + rnd() * 0.35 });
  }

  if (isPort) addTown(g, island, rnd);
}

// §9.2 Pueblo refugio del puerto: casas, faro al norte, 2 muelles y mástil con bandera dorada
function addTown(g: GeoBuilder, island: IslandDef, rnd: () => number): void {
  const r = island.radius;
  for (let i = 0; i < 5; i++) {
    const a = (20 + 72 * i) * deg;
    const x = island.x + Math.cos(a) * 0.4 * r;
    const z = island.z + Math.sin(a) * 0.4 * r;
    const face = Math.atan2(island.x - x, island.z - z) + (rnd() - 0.5) * 0.3;
    g.add(new THREE.BoxGeometry(4, 3, 5), trs(x, 1.8 + 1.5, z, 0, face), lin(PALETTE.townWall), (t) => Math.floor(t / 2) === 3);
    const roofPart = cylinderSides(4);
    g.add(new THREE.ConeGeometry(3.6, 2.2, 4), trs(x, 1.8 + 3 + 1.1, z, 0, face + 45 * deg), lin(PALETTE.townRoof), (t) => roofPart(t) === 'bottom');
  }

  // Faro: blanco con 2 franjas town.roof (ART-DIRECTION §8.2) y linterna arriba
  const lx = island.x;
  const lz = island.z - 0.55 * r;
  const bands = [PALETTE.lighthouse, PALETTE.townRoof, PALETTE.lighthouse, PALETTE.townRoof, PALETTE.lighthouse];
  const bandH = 12 / bands.length;
  bands.forEach((color, i) => {
    const rBot = 1.6 - (0.4 * i) / bands.length;
    const rTop = 1.6 - (0.4 * (i + 1)) / bands.length;
    const part = cylinderSides(8);
    g.add(new THREE.CylinderGeometry(rTop, rBot, bandH, 8), trs(lx, 1.8 + bandH * (i + 0.5), lz), lin(color), (t) => part(t) === 'bottom' || (i < bands.length - 1 && part(t) === 'top'));
  });
  g.add(new THREE.BoxGeometry(1.4, 1.2, 1.4), trs(lx, 1.8 + 12 + 0.6, lz), lin(PALETTE.lantern));

  // Muelles hacia +X y +Z, desde la arena
  for (const [ux, uz] of [[1, 0], [0, 1]]) {
    const start = 0.8 * r;
    const cx = island.x + ux * (start + 7);
    const cz = island.z + uz * (start + 7);
    g.add(new THREE.BoxGeometry(ux ? 14 : 3, 0.4, ux ? 3 : 14), trs(cx, 1.0, cz), lin(PALETTE.palmTrunk));
    for (const along of [-5, 5]) {
      for (const across of [-1.2, 1.2]) {
        const px = cx + ux * along + uz * across;
        const pz = cz + uz * along + ux * across;
        g.add(new THREE.CylinderGeometry(0.2, 0.2, 2, 5), trs(px, 0, pz), lin(PALETTE.palmTrunk));
      }
    }
  }

  // Mástil con bandera dorada (en el plano XY para que se vea desde la cámara)
  const fx = island.x + 0.25 * r;
  const fz = island.z;
  g.add(new THREE.CylinderGeometry(0.15, 0.2, 9, 5), trs(fx, 1.8 + 4.5, fz), lin(PALETTE.rockDark));
  g.add(new THREE.PlaneGeometry(2, 1.3), trs(fx + 1, 1.8 + 9 - 0.65, fz), lin(PALETTE.portFlag));
}

export function buildIslands(islands: IslandDef[]): IslandBuild {
  const g = new GeoBuilder();
  const palms: PropInstance[] = [];
  const triangles: Record<string, number> = {};
  const waterlineRadii: Record<string, number[]> = {};
  for (const island of islands) {
    const before = g.triangles;
    waterlineRadii[island.id] = [];
    addIsland(g, island, palms, waterlineRadii[island.id]);
    triangles[island.id] = g.triangles - before;
  }
  return { geometry: g.build(), palms, triangles, waterlineRadii };
}

// prop_palm: tronco curvo de 3 tramos + 6 hojas caídas (≈ 60 tris)
export function buildPalmGeometry(): THREE.BufferGeometry {
  const g = new GeoBuilder();
  const trunk = lin(PALETTE.palmTrunk);
  const leaf = lin(PALETTE.palmLeaf);
  const radii = [0.22, 0.2, 0.18, 0.16];
  for (let i = 0; i < 3; i++) {
    const part = cylinderSides(5);
    g.add(new THREE.CylinderGeometry(radii[i + 1], radii[i], 1.8, 5), trs(0.25 * i + 0.125, 0.9 + 1.8 * i, 0, 0, 0, -0.14), trunk, (t) => part(t) !== 'side');
  }
  const top: [number, number, number] = [0.75, 5.4, 0];
  for (let i = 0; i < 6; i++) {
    const a = i * 60 * deg;
    const fx = Math.sin(a);
    const fz = Math.cos(a);
    const tilt = 20 * deg;
    const point = (l: number, w: number): [number, number, number] => [
      top[0] + fx * l * Math.cos(tilt) + fz * w,
      top[1] - l * Math.sin(tilt) - (l > 2 ? 0.8 : l > 0 ? 0.2 : 0),
      top[2] + fz * l * Math.cos(tilt) - fx * w
    ];
    const rows = [0, 1.7, 3.4];
    for (let k = 0; k < 2; k++) {
      const w0 = k === 0 ? 0.15 : 0.45;
      const w1 = k === 0 ? 0.45 : 0.1;
      g.quad(point(rows[k], -w0), point(rows[k], w0), point(rows[k + 1], w1), point(rows[k + 1], -w1), leaf);
    }
  }
  return g.build();
}

// prop_buoy: cuerpo buoy.a + cono buoy.b, pivote en la flotación
export function buildBuoyGeometry(): THREE.BufferGeometry {
  const g = new GeoBuilder();
  const body = cylinderSides(6);
  g.add(new THREE.CylinderGeometry(0.5, 0.7, 1.2, 6), trs(0, 0.4, 0), lin(PALETTE.buoyA), (t) => body(t) === 'bottom');
  const cone = cylinderSides(6);
  g.add(new THREE.ConeGeometry(0.5, 0.6, 6), trs(0, 1.3, 0), lin(PALETTE.buoyB), (t) => cone(t) === 'bottom');
  return g.build();
}

// 24 boyas cada 15° en el borde de la zona segura
export function buoyInstances(): PropInstance[] {
  const out: PropInstance[] = [];
  for (let i = 0; i < 24; i++) {
    const a = i * 15 * deg;
    out.push({ x: PORT_POSITION.x + Math.sin(a) * SAFE_ZONE_RADIUS, y: 0, z: PORT_POSITION.z + Math.cos(a) * SAFE_ZONE_RADIUS, rotY: a, scale: 1 });
  }
  return out;
}

// prop_loot: caja con 2 flejes dorados, 30 % sumergida
export function buildLootGeometry(): THREE.BufferGeometry {
  const g = new GeoBuilder();
  const cy = 0.6 - 0.36;
  g.add(new THREE.BoxGeometry(1.2, 1.2, 1.2), trs(0, cy, 0), lin(PALETTE.cargo));
  for (const dy of [-0.3, 0.3]) g.add(new THREE.BoxGeometry(1.24, 0.15, 1.24), trs(0, cy + dy, 0), lin(PALETTE.lootStrap));
  return g.build();
}

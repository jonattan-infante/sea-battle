// La costa visible de las islas: la malla cortada por la flotación (y = 0). Lo usan island-glb.test.ts (AC-199 a, la escena
// de islands.glb) e island-coast-ships.test.ts («se ve / se choca» en las 16 formas, con la malla de islands.glb y la de
// island_port.glb en la 1.1, y la procedural en la 1.0)
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Vec2 } from '../../../game/vec';
import { editGlb } from '../../../../scripts/glb/glb-fallback';
import { ISLANDS_GLB } from '../island-glb';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const ISLANDS_FILE = path.join(PUBLIC_DIR, ISLANDS_GLB);

// La escena de islands.glb (o de island_port.glb) sin texturas: sin navegador no hay descodificador de imágenes, y aquí solo
// cuentan la geometría y los extras de las raíces
export async function islandsScene(file = ISLANDS_FILE): Promise<THREE.Object3D> {
  const bytes = editGlb(new Uint8Array(fs.readFileSync(file)), (json) => {
    for (const m of (json.materials ?? []) as { pbrMetallicRoughness?: { baseColorTexture?: unknown } }[]) delete m.pbrMetallicRoughness?.baseColorTexture;
    delete json.textures;
    delete json.images;
    delete json.samplers;
    json.extensionsUsed = ((json.extensionsUsed ?? []) as string[]).filter((e) => e !== 'KHR_texture_basisu');
  });
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  return gltf.scene;
}

// Triángulos en coordenadas de mundo: 9 números por triángulo (x, y, z de sus 3 vértices)
export type Triangles = Float64Array;

function pushGeometry(out: number[], geometry: THREE.BufferGeometry, matrix: THREE.Matrix4 | null, keep: (v: THREE.Vector3[]) => boolean): void {
  const pos = geometry.getAttribute('position');
  const idx = geometry.index;
  const n = idx ? idx.count : pos.count;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t + 2 < n; t += 3) {
    for (let e = 0; e < 3; e++) {
      v[e].fromBufferAttribute(pos, idx ? idx.getX(t + e) : t + e);
      if (matrix) v[e].applyMatrix4(matrix);
    }
    if (keep(v)) for (const p of v) out.push(p.x, p.y, p.z);
  }
}

// Las mallas bajo una raíz (la de una isla de islands.glb), con su matriz de mundo
export function trianglesOfRoot(root: THREE.Object3D): Triangles {
  root.updateMatrixWorld(true);
  const out: number[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) pushGeometry(out, mesh.geometry, mesh.matrixWorld, () => true);
  });
  return Float64Array.from(out);
}

// Una geometría ya en coordenadas de mundo (la procedural de buildIslands), solo con los triángulos que pasan el filtro
export function trianglesOfGeometry(geometry: THREE.BufferGeometry, keep: (v: THREE.Vector3[]) => boolean): Triangles {
  const out: number[] = [];
  pushGeometry(out, geometry, null, keep);
  return Float64Array.from(out);
}

// Segmentos de la costa visible: cada triángulo que cruza la flotación da el segmento entre sus 2 puntos de cruce
// (el cruce de cada arista con y = 0, como en AC-199 a)
export function waterline(tris: Triangles): [Vec2, Vec2][] {
  const segs: [Vec2, Vec2][] = [];
  for (let t = 0; t < tris.length; t += 9) {
    const cross: Vec2[] = [];
    for (let e = 0; e < 3; e++) {
      const a = t + e * 3;
      const b = t + ((e + 1) % 3) * 3;
      const ya = tris[a + 1];
      const yb = tris[b + 1];
      if (ya > 0 !== yb > 0) {
        const k = ya / (ya - yb);
        cross.push({ x: tris[a] + (tris[b] - tris[a]) * k, z: tris[a + 2] + (tris[b + 2] - tris[a + 2]) * k });
      }
    }
    if (cross.length === 2) segs.push([cross[0], cross[1]]);
  }
  return segs;
}

// ¿Tierra visible en (x, z)? Algún triángulo lo cubre en planta y su altura interpolada ahí queda sobre el agua (y > 0)
export function landAt(tris: Triangles, x: number, z: number): boolean {
  for (let t = 0; t < tris.length; t += 9) {
    const x0 = tris[t], z0 = tris[t + 2], x1 = tris[t + 3], z1 = tris[t + 5], x2 = tris[t + 6], z2 = tris[t + 8];
    if (x < Math.min(x0, x1, x2) || x > Math.max(x0, x1, x2) || z < Math.min(z0, z1, z2) || z > Math.max(z0, z1, z2)) continue;
    const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
    if (Math.abs(d) < 1e-9) continue; // cara vertical en planta
    const w0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d;
    const w1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d;
    const w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    if (w0 * tris[t + 1] + w1 * tris[t + 4] + w2 * tris[t + 7] > 0) return true;
  }
  return false;
}

// landAt con los triángulos repartidos en una rejilla de celdas de `cell` m por su caja en planta: cada consulta mira solo los
// de su celda. Da lo mismo que landAt (un triángulo que cubre el punto está en la celda del punto) y deja que el barrido de
// las 16 formas quepa en el tiempo de verify
export function landGrid(tris: Triangles, cell = 4): (x: number, z: number) => boolean {
  const cells = new Map<string, number[]>();
  const key = (i: number, j: number) => `${i},${j}`;
  for (let t = 0; t < tris.length; t += 9) {
    const xs = [tris[t], tris[t + 3], tris[t + 6]];
    const zs = [tris[t + 2], tris[t + 5], tris[t + 8]];
    for (let i = Math.floor(Math.min(...xs) / cell); i <= Math.floor(Math.max(...xs) / cell); i++)
      for (let j = Math.floor(Math.min(...zs) / cell); j <= Math.floor(Math.max(...zs) / cell); j++) {
        const k = key(i, j);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k)!.push(t);
      }
  }
  const one = new Float64Array(9);
  return (x, z) => {
    const list = cells.get(key(Math.floor(x / cell), Math.floor(z / cell)));
    if (!list) return false;
    for (const t of list) {
      for (let e = 0; e < 9; e++) one[e] = tris[t + e];
      if (landAt(one, x, z)) return true;
    }
    return false;
  };
}

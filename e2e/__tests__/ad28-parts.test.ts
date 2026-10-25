// AD-28 con el GLB de la Cañonera de D91 (U6 de dev-render): las partes de la batería por el centroide de cada triángulo,
// sobre el GLB de public/models leído como en el juego (ship-glb.test.ts, «Los GLB de la Cañonera y el Capitán de D91»)
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SHIP_GLB, shipModelFromGlb } from '../../src/client/models/ship-glb';
import { geometryArrays, gunboatGlbParts, GUNBOAT_GLB_AD28 } from '../ad28-parts';

const lods = async () => {
  (globalThis as unknown as { self?: unknown }).self ??= globalThis; // GLTFLoader crea la URL de la imagen con self.URL
  const ktx2 = { load: (_url: string, onLoad: (t: THREE.Texture) => void) => onLoad(new THREE.CompressedTexture([], 1024, 1024)) } as unknown as KTX2Loader;
  const url = SHIP_GLB.gunboat!;
  const file = fs.readFileSync(path.join(__dirname, '..', '..', 'public', url));
  const scene = await new Promise<THREE.Object3D>((resolve, reject) =>
    new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .setKTX2Loader(ktx2)
      .parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, THREE.LoaderUtils.extractUrlBase(url), (g) => resolve(g.scene), reject)
  );
  return shipModelFromGlb(scene, 'gunboat').lods;
};

// Lo mismo que el e2e saca de la vista en la página (geometryArrays). En A1b, la página leía el COLOR_0 RGBA del GLB con su
// tamaño (4) y el clasificador, de 3 en 3, y este test, que lo leía de 3 en 3, no lo veía: 0 cañones en el navegador
const arrays = (g: THREE.BufferGeometry) => geometryArrays(g as unknown as Parameters<typeof geometryArrays>[0]);

// Las cureñas del modelo de ux: (±(x_at(z, yd) − 1,25), yd + 0,25, z), con x_at, y0 y deck_h de scripts/ux/barcos/curvo.py
// y el casco de canonera2_curvo.py:27-46 (calculadas por dev-render el 2026-10-24, sin escribir nada en UX_OUT)
const UX_CARRIAGES: [number, number, number][] = [
  [-7.0, 3.6646, 1.78], [-4.2, 3.6931, 1.7594], [-1.4, 3.6778, 1.7518], [1.4, 3.677, 1.7491], [4.2, 3.6801, 1.7553], [7.0, 3.5306, 1.7802]
];

describe('AD-28 con el GLB de la Cañonera: las partes por el centroide (U6)', () => {
  // Cañón: tronco de 6 lados con su tapa (12 + 4); mortero: tronco de 8 lados (16) y su boca (6); cureña: cuboid de
  // curvo.py:96-104, tapa y 4 lados, sin fondo (10)
  test('LOD0: 12 cañones de 16 triángulos, el mortero con su boca, 12 cureñas de 10 en las cajas del modelo de ux y la cubierta de la región deck, sin solaparse', async () => {
    const [lod0] = await lods();
    const g = arrays(lod0);
    expect(g.colorSize).toBe(4); // RGBA, como lo exporta Blender
    const p = gunboatGlbParts(g);
    const centroid = (t: number) => [0, 1, 2].map((ch) => [0, 1, 2].reduce((s, k) => s + g.position[3 * g.index![3 * t + k] + ch], 0) / 3);
    expect([p.cannon.length, p.mortar.length, p.carriage.length]).toEqual([12 * 16, 8 * 2 + 6, 12 * 10]);
    // 6 por banda, cada uno en su z
    for (const side of [1, -1]) {
      const zs = GUNBOAT_GLB_AD28.cannonZ.map((z) => p.cannon.filter((t) => Math.sign(centroid(t)[0]) === side && Math.abs(centroid(t)[2] - z) < 0.7).length);
      expect([side, zs]).toEqual([side, [16, 16, 16, 16, 16, 16]]);
    }
    // Las cajas, a ≤ 1 cm de las del modelo de ux (con su signo, una por banda)
    const got = p.carriages.map((b) => [b.z, Math.sign(b.x), Math.abs(b.x), b.y]);
    const want = UX_CARRIAGES.flatMap(([z, x, y]) => [1, -1].map((s) => [z, s, x, y]));
    expect(got.length).toBe(12);
    for (const [z, s, x, y] of want) {
      const b = got.find((q) => q[0] === z && q[1] === s)!;
      expect([z, s, Math.abs(b[2] - x) <= 0.01, Math.abs(b[3] - y) <= 0.01]).toEqual([z, s, true, true]);
    }
    // La cubierta: la del medio (entre el alcázar, en z −8,4, y el castillo, en 10,8), a la altura de la cubierta
    expect(p.deck.length).toBeGreaterThan(0);
    const off = p.deck.map(centroid).filter(([, y, z]) => z < -8.4 - 1e-3 || z > 10.8 + 1e-3 || y < 1.3 || y > 1.7);
    expect(off).toEqual([]);
    const all = [...p.cannon, ...p.mortar, ...p.carriage, ...p.deck];
    expect(new Set(all).size).toBe(all.length);
  });

  test('geometryArrays se puede correr desde su texto, como la corre el e2e en la página, y da lo mismo', async () => {
    const [lod0] = await lods();
    const fromText = new Function(`return (${geometryArrays.toString()})`)() as typeof geometryArrays;
    expect(fromText(lod0 as unknown as Parameters<typeof geometryArrays>[0])).toEqual(arrays(lod0));
  });

  test('LOD1 no lleva cañones ni cureñas, y sí el mortero, rasgo de identidad (ASSET-SPEC §7)', async () => {
    const [, lod1] = await lods();
    const p = gunboatGlbParts(arrays(lod1));
    expect([p.cannon.length, p.carriages.length, p.carriage.length, p.mortar.length]).toEqual([0, 0, 0, 8 * 2 + 6]);
  });
});

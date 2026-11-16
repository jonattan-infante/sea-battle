// AD-37 (d) (ART-DIRECTION, fila AD-37; D107): en LOD1, la costura entre las 2 cangrejas de las 3 Goletas, la sin familia
// (el procedural, con la relinga de D107 en ship-geometry.ts) y las 2 GLB de familia (con la suya, de la cadena de ux), en
// los 200 momentos del balanceo: ≥ 6 filas con una costura de ≥ 2 px en cada uno. Va antes de los evaluadores de AC-165
// (clases): si no pasa, no se lanzan. La medida es la de lamina_d107.py --medir (schooner-seam.ts, su port: mismos grupos y
// las mismas 200 cifras por momento en las 4 geometrías medidas el 2026-11-16)
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { getShipModel } from '../ship-geometry';
import { SHIP_GLB, shipModelFromGlb } from '../ship-glb';
import { measureSeam, SEAM_MIN_ROWS, seamMesh } from './schooner-seam';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

// Sin navegador no hay transcodificador: un KTX2Loader falso que entrega una textura vacía (aquí solo cuenta la geometría)
const ktx2 = { init: () => Promise.resolve(), load: (_url: string, onLoad: (t: THREE.Texture) => void) => onLoad(new THREE.CompressedTexture([], 16, 16)) } as unknown as KTX2Like;
type KTX2Like = Parameters<GLTFLoader['setKTX2Loader']>[0];

async function glbLod1(key: string): Promise<THREE.BufferGeometry> {
  const file = fs.readFileSync(path.join(ROOT, 'public', SHIP_GLB[key]!));
  const gltf = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .setKTX2Loader(ktx2)
    .parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, '');
  return shipModelFromGlb(gltf.scene, 'schooner').lods[1];
}

const report = (name: string, r: ReturnType<typeof measureSeam>) =>
  console.log(`AD-37 (d): ${name} · filas_costura_2px_min ${r.min} · mediana ${r.median} · fundidas ${r.fusedPct} % · momentos con < ${SEAM_MIN_ROWS} filas: ${r.rows2px.filter((n) => n < SEAM_MIN_ROWS).length} de ${r.rows2px.length}`);

describe('AD-37 (d): la costura entre las 2 cangrejas de la Goleta, en LOD1 (D107)', () => {
  beforeAll(() => {
    (globalThis as unknown as { self?: unknown }).self ??= globalThis; // GLTFLoader crea la URL de la imagen con self.URL
  });

  // Las 2 cangrejas son los 2 abanicos de 4 triángulos de vela; si el color o la posición no los encuentran, la medida no vale
  const fans = (g: THREE.BufferGeometry) => {
    const m = seamMesh(g);
    return [1, 2].map((k) => m.g.filter((x) => x === k).length);
  };

  test('la Goleta sin familia (el procedural): ≥ 6 filas con costura de ≥ 2 px en cada uno de los 200 momentos', () => {
    const lod1 = getShipModel('schooner').lods[1];
    expect(fans(lod1)).toEqual([4, 4]);
    const r = measureSeam(seamMesh(lod1));
    report('sin familia (procedural)', r);
    expect(r.rows2px).toHaveLength(200);
    expect(r.min).toBeGreaterThanOrEqual(SEAM_MIN_ROWS);
  });

  // El control: la misma medida sobre el procedural sin los 4 triángulos de la relinga (los que siguen a la cangreja de
  // trinquete en LOD1, assets.test.ts) da lo de antes de D107: las 2 velas fundidas en el 40,5 % de los momentos y 0 filas
  test('control: sin la relinga, el procedural no llega (0 filas en el peor momento)', () => {
    const model = getShipModel('schooner');
    const lod1 = model.lods[1];
    const p = lod1.getAttribute('position');
    const fan = model.sails[1].find(([a, b]) => {
      if (b - a !== 4) return false;
      let [y, z] = [0, 0];
      for (let i = 3 * a; i < 3 * b; i++) [y, z] = [y + p.getY(i), z + p.getZ(i)];
      return y / 12 < 14.4 && z / 12 > -3.0 && z / 12 < 3.7;
    })!;
    const without = new THREE.BufferGeometry();
    for (const name of ['position', 'color']) {
      const a = lod1.getAttribute(name).array as Float32Array;
      without.setAttribute(name, new THREE.BufferAttribute(Float32Array.from([...a.subarray(0, 9 * fan[1]), ...a.subarray(9 * (fan[1] + 4))]), 3));
    }
    const r = measureSeam(seamMesh(without));
    report('sin familia, sin la relinga (control)', r);
    expect([r.min, r.fusedPct]).toEqual([0, 40.5]);
  });

  test.each(['schooner:gb', 'schooner:es'])('la Goleta %s (su GLB): ≥ 6 filas con costura de ≥ 2 px en cada uno de los 200 momentos', async (key) => {
    const lod1 = await glbLod1(key);
    expect(fans(lod1)).toEqual([4, 4]);
    const r = measureSeam(seamMesh(lod1));
    report(`${key} (${path.basename(SHIP_GLB[key]!)})`, r);
    expect(r.min).toBeGreaterThanOrEqual(SEAM_MIN_ROWS);
  });
});

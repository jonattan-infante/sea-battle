// Piloto C1 del mapa nuevo (AC-198; ASSET-SPEC §9.7): islands.glb, con una raíz por isla, y su cargador. Sobre el archivo de
// public/models: sus raíces traen los círculos del mapa de la 1.1 (AC-199 e) y la costa de la del piloto, I1, cae dentro de
// su colisión (AC-199 a). Y el cargador: baja una vez, después de pedirlo, entrega solo la raíz del piloto y libera el resto
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MAP_1_1 } from '../../../game/constants';
import { editGlb } from '../../../../scripts/glb/glb-fallback';
import { Circle, IslandGlbStore, ISLANDS_GLB, PILOT_ROOTS, sameCircles, serverShapes, shapeOf, takeRoots } from '../island-glb';
import type { GlbLoader, TextureUpgrade } from '../ship-glb';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const FILE = path.join(ROOT, 'public', ISLANDS_GLB);

// La escena de islands.glb sin texturas: sin navegador no hay descodificador de imágenes, y aquí solo cuentan la geometría y
// los extras de las raíces
async function islandsScene(): Promise<THREE.Object3D> {
  const bytes = editGlb(new Uint8Array(fs.readFileSync(FILE)), (json) => {
    for (const m of (json.materials ?? []) as { pbrMetallicRoughness?: { baseColorTexture?: unknown } }[]) delete m.pbrMetallicRoughness?.baseColorTexture;
    delete json.textures;
    delete json.images;
    delete json.samplers;
    json.extensionsUsed = (json.extensionsUsed as string[]).filter((e) => e !== 'KHR_texture_basisu');
  });
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  return gltf.scene;
}

describe('islands.glb (ASSET-SPEC §9.7) frente al mapa de la 1.1', () => {
  test('el archivo está en public/models con el nombre de ISLANDS_GLB, y la raíz del piloto es I1', () => {
    expect(fs.existsSync(FILE)).toBe(true);
    expect(PILOT_ROOTS).toEqual(['island_I1']);
  });

  test('AC-199 e: las 15 raíces traen los círculos de su forma en el mapa de la 1.1, y la del piloto entra', async () => {
    const scene = await islandsScene();
    const all = scene.children.map((r) => r.userData.sb_id as string);
    const { models, problems } = takeRoots(scene, all);
    expect(problems).toEqual([]);
    const server = serverShapes(MAP_1_1.islands);
    expect(models.map((m) => m.shape).sort()).toEqual([...server.keys()].filter((k) => k !== 'PORT').sort());
    for (const m of models) expect([m.shape, sameCircles(m.circles, server.get(m.shape)!)]).toEqual([m.shape, true]);
  });

  test('AC-199 a, en I1: nada sobre el agua sale más de 0,5 m de su colisión, y la costa en la flotación cae entre 0 y 3 m por dentro', async () => {
    const scene = await islandsScene();
    const { models } = takeRoots(scene, PILOT_ROOTS);
    expect(models).toHaveLength(1);
    const circles = serverShapes(MAP_1_1.islands).get('I1')!;
    const outside = (x: number, z: number) => Math.min(...circles.map(([cx, cz, r]) => Math.hypot(x - cx, z - cz) - r));
    const root = models[0].root;
    root.updateMatrixWorld(true);
    let above = -Infinity;
    const coast: number[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute('position');
      const idx = mesh.geometry.index;
      const at = (i: number, v: THREE.Vector3) => v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      const n = idx ? idx.count : pos.count;
      for (let t = 0; t < n; t += 3) {
        for (let e = 0; e < 3; e++) {
          at(t + e, a);
          at(t + ((e + 1) % 3), b);
          if (a.y > 0) above = Math.max(above, outside(a.x, a.z));
          // Cruce de la arista con la flotación (y = 0): un punto de la costa visible
          if ((a.y > 0) !== (b.y > 0)) {
            const k = a.y / (a.y - b.y);
            coast.push(outside(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k));
          }
        }
      }
    });
    console.log(`AC-199 a, I1: ${coast.length} cruces de la costa, de ${Math.min(...coast).toFixed(3)} a ${Math.max(...coast).toFixed(3)} m; sobre el agua, como mucho ${above.toFixed(3)} m fuera`);
    expect(coast.length).toBeGreaterThan(0);
    expect(above).toBeLessThanOrEqual(0.5);
    expect(Math.max(...coast)).toBeLessThanOrEqual(1e-6);
    expect(Math.min(...coast)).toBeGreaterThanOrEqual(-3);
  });
});

describe('círculos del servidor y de las raíces', () => {
  test('shapeOf agrupa los círculos de mapOf por forma, y sameCircles no mira el orden pero sí cada valor a 1 mm', () => {
    expect(['I1.0', 'I1.4', 'E1a', 'PORT.6'].map(shapeOf)).toEqual(['I1', 'I1', 'E1a', 'PORT']);
    const i1 = serverShapes(MAP_1_1.islands).get('I1')!;
    expect(i1).toHaveLength(5);
    expect(sameCircles([...i1].reverse(), i1)).toBe(true);
    expect(sameCircles(i1.map(([x, z, r], k): Circle => (k === 2 ? [x, z, r + 0.002] : [x, z, r])), i1)).toBe(false);
    expect(sameCircles(i1.slice(1), i1)).toBe(false);
  });
});

// La descarga y el parse falsos, como los de ship-glb.test.ts
function fake() {
  const calls: { url: string; resolve: (scene: THREE.Object3D, upgrades?: Promise<TextureUpgrade[]>) => void; reject: (e: Error) => void }[] = [];
  const parsed = new Map<ArrayBuffer, { scene: THREE.Object3D; upgrades: Promise<TextureUpgrade[]> }>();
  const fetchBytes = (url: string) =>
    new Promise<ArrayBuffer>((resolve, reject) =>
      calls.push({
        url,
        resolve: (scene, upgrades = Promise.resolve([])) => {
          const bytes = new ArrayBuffer(0);
          parsed.set(bytes, { scene, upgrades });
          resolve(bytes);
        },
        reject
      })
    );
  const loader: GlbLoader = { parse: (bytes) => Promise.resolve(parsed.get(bytes)!), dispose: jest.fn() };
  return { calls, loader, fetchBytes };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const gl = {} as THREE.WebGLRenderer;

// Una escena como la de islands.glb: raíces con sb_id y sb_circles, una malla cada una y un material compartido
function scene(ids: string[], material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() })) {
  const s = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  for (const id of ids) {
    const root = new THREE.Object3D();
    root.userData = { sb_id: id, sb_kind: 'island', sb_circles: serverShapes(MAP_1_1.islands).get(id.replace(/^island_/, '')) };
    const g = new THREE.BoxGeometry();
    geometries.push(g);
    root.add(new THREE.Mesh(g, material));
    s.add(root);
  }
  return { s, geometries, material };
}

describe('IslandGlbStore (AC-198 c)', () => {
  test('sin request no baja nada; con request baja una vez y entrega solo la raíz del piloto, y libera la geometría de las demás', async () => {
    const { calls, loader, fetchBytes } = fake();
    const store = new IslandGlbStore(() => loader, ISLANDS_GLB, PILOT_ROOTS, fetchBytes);
    store.pump(gl);
    expect(calls).toHaveLength(0);
    store.request();
    store.pump(gl);
    store.pump(gl);
    expect(calls.map((c) => c.url)).toEqual([ISLANDS_GLB]);
    const { s, geometries } = scene(['island_E1a', 'island_I1', 'island_I5']);
    const freed: number[] = [];
    geometries.forEach((g, k) => g.addEventListener('dispose', () => freed.push(k)));
    calls[0].resolve(s);
    await settle();
    const got = store.take();
    expect(got.map((m) => [m.shape, m.sbId])).toEqual([['I1', 'island_I1']]);
    expect(freed.sort()).toEqual([0, 2]);
    expect(store.take()).toEqual([]);
    store.request();
    store.pump(gl);
    expect(calls).toHaveLength(1); // una sola descarga por sesión
  });

  test('D90: al llegar la KTX2 sustituye al respaldo en el material de la raíz, y el respaldo se libera', async () => {
    const { calls, loader, fetchBytes } = fake();
    const store = new IslandGlbStore(() => loader, ISLANDS_GLB, PILOT_ROOTS, fetchBytes);
    store.request();
    store.pump(gl);
    const { s, material } = scene(['island_I1']);
    const fallback = material.map!;
    const ktx2 = new THREE.CompressedTexture([], 16, 16);
    let freed = 0;
    fallback.addEventListener('dispose', () => freed++);
    let release!: (p: TextureUpgrade[]) => void;
    calls[0].resolve(s, new Promise((r) => (release = r)));
    await settle();
    expect(store.take()).toHaveLength(1);
    expect(material.map).toBe(fallback);
    release([[fallback, ktx2]]);
    await settle();
    expect(material.map).toBe(ktx2);
    expect(freed).toBe(1);
  });

  test('si falla la descarga, avisa y no entrega nada: se quedan las islas sencillas', async () => {
    const { calls, loader, fetchBytes } = fake();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new IslandGlbStore(() => loader, ISLANDS_GLB, PILOT_ROOTS, fetchBytes);
    store.request();
    store.pump(gl);
    calls[0].reject(new Error('HTTP 404'));
    await settle();
    expect(store.take()).toEqual([]);
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([`[island-glb] ${ISLANDS_GLB}: HTTP 404; se quedan las islas sencillas`]);
    warn.mockRestore();
  });

  test('una raíz del piloto que falta en el GLB se avisa', async () => {
    const { calls, loader, fetchBytes } = fake();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new IslandGlbStore(() => loader, ISLANDS_GLB, PILOT_ROOTS, fetchBytes);
    store.request();
    store.pump(gl);
    calls[0].resolve(scene(['island_I5']).s);
    await settle();
    expect(store.take()).toEqual([]);
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([`[island-glb] ${ISLANDS_GLB}: island_I1: no está en el GLB`]);
    warn.mockRestore();
  });
});

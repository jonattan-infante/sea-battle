// Las islas del mapa nuevo (AC-198, AC-210 b; ASSET-SPEC §9.7): islands.glb, con una raíz por isla, y su cargador. Sobre el
// archivo de public/models: sus 15 raíces traen los círculos del mapa de la 1.1 (AC-199 e) y la costa de I1, la del piloto C1,
// cae dentro de su colisión (AC-199 a). Y el cargador: baja una vez, después de pedirlo, entrega las raíces pedidas (las 15
// de PILOT_ROOTS) y libera el resto
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { MAP_1_1 } from '../../../game/constants';
import { Circle, IslandGlbStore, ISLANDS_GLB, PILOT_ROOTS, PORT_GLB, PORT_ROOTS, sameCircles, serverShapes, shapeOf, shapeOfRoot, takeRoots } from '../island-glb';
import type { GlbLoader, TextureUpgrade } from '../ship-glb';
// La escena de islands.glb (o de island_port.glb) sin texturas y la ruta de islands.glb, compartidas con
// island-coast-ships.test.ts
import { ISLANDS_FILE as FILE, PUBLIC_DIR, islandsScene } from './island-coast';

const PORT_FILE = path.join(PUBLIC_DIR, PORT_GLB);

describe('islands.glb (ASSET-SPEC §9.7) frente al mapa de la 1.1', () => {
  test('el archivo está en public/models con el nombre de ISLANDS_GLB, y PILOT_ROOTS son sus 15 raíces (AC-210 b)', async () => {
    expect(fs.existsSync(FILE)).toBe(true);
    const all = (await islandsScene()).children.map((r) => r.userData.sb_id as string);
    expect(PILOT_ROOTS).toHaveLength(15);
    expect([...PILOT_ROOTS].sort()).toEqual([...all].sort());
  });

  test('AC-199 e: las 15 raíces de PILOT_ROOTS traen los círculos de su forma en el mapa de la 1.1, y entran todas', async () => {
    const scene = await islandsScene();
    const { models, problems } = takeRoots(scene, PILOT_ROOTS);
    expect(problems).toEqual([]);
    const server = serverShapes(MAP_1_1.islands);
    expect(models.map((m) => m.shape).sort()).toEqual([...server.keys()].filter((k) => k !== 'PORT').sort());
    for (const m of models) expect([m.shape, sameCircles(m.circles, server.get(m.shape)!)]).toEqual([m.shape, true]);
  });

  test('AC-199 a, en I1: nada sobre el agua sale más de 0,5 m de su colisión, y la costa en la flotación cae entre 0 y 3 m por dentro', async () => {
    const scene = await islandsScene();
    const { models } = takeRoots(scene, ['island_I1']);
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

describe('island_port.glb (ASSET-SPEC §9.8) frente al puerto de la 1.1', () => {
  test('el archivo está en public/models con el nombre de PORT_GLB, y su nombre lleva el principio de su sha256 (paso 4c)', () => {
    expect(PORT_ROOTS).toEqual(['island_port']);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(PORT_FILE)).digest('hex');
    expect(PORT_GLB).toBe(`/models/island_port.${sha.slice(0, 8)}.glb`);
  });

  test('AC-200 e: la raíz island_port es la forma PORT y trae los 7 círculos del puerto de la bienvenida', async () => {
    const { models, problems } = takeRoots(await islandsScene(PORT_FILE), PORT_ROOTS);
    expect(problems).toEqual([]);
    expect(models.map((m) => [m.shape, m.sbId])).toEqual([['PORT', 'island_port']]);
    const port = serverShapes(MAP_1_1.islands).get('PORT')!;
    expect(port).toHaveLength(7);
    expect(sameCircles(models[0].circles, port)).toBe(true);
  });
});

describe('círculos del servidor y de las raíces', () => {
  test('shapeOfRoot: island_<id> es <id>, con sus minúsculas, salvo island_port, que es PORT', () => {
    expect(['island_I1', 'island_E1a', 'island_port'].map(shapeOfRoot)).toEqual(['I1', 'E1a', 'PORT']);
  });

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
    root.userData = { sb_id: id, sb_kind: 'island', sb_circles: serverShapes(MAP_1_1.islands).get(shapeOfRoot(id)) };
    const g = new THREE.BoxGeometry();
    geometries.push(g);
    root.add(new THREE.Mesh(g, material));
    s.add(root);
  }
  return { s, geometries, material };
}

describe('IslandGlbStore (AC-198 c)', () => {
  test('sin request no baja nada; con request baja una vez y entrega las 15 raíces pedidas, y libera la geometría de lo demás', async () => {
    const { calls, loader, fetchBytes } = fake();
    const store = new IslandGlbStore(() => loader, ISLANDS_GLB, PILOT_ROOTS, fetchBytes);
    store.pump(gl);
    expect(calls).toHaveLength(0);
    store.request();
    store.pump(gl);
    store.pump(gl);
    expect(calls.map((c) => c.url)).toEqual([ISLANDS_GLB]);
    // Una raíz que no se pide (island_port no está en islands.glb ni en PILOT_ROOTS), en medio de las 15
    const { s, geometries } = scene([...PILOT_ROOTS.slice(0, 7), 'island_port', ...PILOT_ROOTS.slice(7)]);
    const freed: number[] = [];
    geometries.forEach((g, k) => g.addEventListener('dispose', () => freed.push(k)));
    calls[0].resolve(s);
    await settle();
    const got = store.take();
    expect(got.map((m) => m.sbId)).toEqual([...PILOT_ROOTS]);
    expect(got.map((m) => m.shape)).toEqual(PILOT_ROOTS.map(shapeOfRoot));
    expect(freed).toEqual([7]);
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
    const { s, material } = scene([...PILOT_ROOTS]);
    const fallback = material.map!;
    const ktx2 = new THREE.CompressedTexture([], 16, 16);
    let freed = 0;
    fallback.addEventListener('dispose', () => freed++);
    let release!: (p: TextureUpgrade[]) => void;
    calls[0].resolve(s, new Promise((r) => (release = r)));
    await settle();
    expect(store.take()).toHaveLength(15);
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

  test('waiting: pedido y sin terminar; deja de esperar al llegar o al fallar', async () => {
    for (const ok of [true, false]) {
      const { calls, loader, fetchBytes } = fake();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const store = new IslandGlbStore(() => loader, PORT_GLB, PORT_ROOTS, fetchBytes);
      const seen = [store.waiting];
      store.request();
      seen.push(store.waiting);
      store.pump(gl);
      seen.push(store.waiting);
      if (ok) calls[0].resolve(scene(['island_port']).s);
      else calls[0].reject(new Error('HTTP 404'));
      await settle();
      seen.push(store.waiting);
      expect([ok, seen]).toEqual([ok, [false, true, true, false]]);
      expect(store.take().map((m) => [m.shape, m.sbId])).toEqual(ok ? [['PORT', 'island_port']] : []);
      expect(calls.map((c) => c.url)).toEqual([PORT_GLB]);
      warn.mockRestore();
    }
  });

  test('una raíz de las 15 que falta en el GLB se avisa, y las otras 14 se entregan', async () => {
    const { calls, loader, fetchBytes } = fake();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new IslandGlbStore(() => loader, ISLANDS_GLB, PILOT_ROOTS, fetchBytes);
    store.request();
    store.pump(gl);
    calls[0].resolve(scene(PILOT_ROOTS.filter((id) => id !== 'island_I1')).s);
    await settle();
    expect(store.take().map((m) => m.sbId)).toEqual(PILOT_ROOTS.filter((id) => id !== 'island_I1'));
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([`[island-glb] ${ISLANDS_GLB}: island_I1: no está en el GLB`]);
    warn.mockRestore();
  });
});

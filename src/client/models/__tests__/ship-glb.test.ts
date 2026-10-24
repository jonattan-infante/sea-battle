// Loader de GLB de los barcos (ASSET-SPEC §13 paso 6; D80; AC-193): un GLB con el contrato de §1–§4 sustituye al
// procedural sin cambiar el juego, y uno que lo incumple se rechaza y deja el procedural. Los GLB se escriben aquí desde
// el procedural (glb-writer.ts) y los lee el GLTFLoader de three, como en el navegador
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { buildShipAsset, getShipModel, LOD_PX, ShipModel } from '../ship-geometry';
import {
  BASIS_PATH,
  createGlbLoader,
  EntryGate,
  GlbLoader,
  mapAnisotropyFor,
  OWN_GLB_WAIT_MS,
  prefetchClasses,
  setShipMap,
  SHIP_GLB,
  SHIP_GLB_STAGED,
  ShipGlbError,
  ShipGlbStore,
  shipModelFromGlb,
  TextureUpgrade
} from '../ship-glb';
import { contentHash, E2E_PREFIX, HASHED_GLB, HASHED_KTX2, unhashedModels } from '../../../../scripts/glb/content-hash';
import { addFallback, editGlb, externalizeKtx2, externalUris, fallbackProblems, readGlb, solidPng } from '../../../../scripts/glb/glb-fallback';
import { basisuWithFallback } from '../basisu-fallback';
import { writeGlb, GlbOptions } from './glb-writer';

type Json = Record<string, unknown>;
type Node = { name: string; translation?: number[]; mesh?: number; children?: number[] };

const parse = (bytes: Uint8Array) =>
  new Promise<THREE.Object3D>((resolve, reject) =>
    new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '', (g) => resolve(g.scene), reject)
  );
const glb = (classId: string, options: GlbOptions = {}) => parse(writeGlb(buildShipAsset(classId), options));
const nodes = (gltf: Json) => gltf.nodes as Node[];
const node = (gltf: Json, name: string) => nodes(gltf).find((n) => n.name === name)!;
// Quita un nodo hijo de la raíz por nombre (los índices de los demás no cambian: solo se saca de la lista de hijos)
const drop = (name: string) => (gltf: Json) => {
  const root = nodes(gltf)[0];
  root.children = root.children!.filter((i) => nodes(gltf)[i].name !== name);
};
// Quita un atributo de las 2 primitivas
const without = (attribute: string) => (gltf: Json) => {
  for (const m of gltf.meshes as { primitives: { attributes: Json }[] }[]) delete m.primitives[0].attributes[attribute];
};

describe('ASSET-SPEC §13: GLB de un barco con el contrato de §1–§4', () => {
  test('el GLB escrito desde la Balandra da el mismo modelo: triángulos, extras, sockets y caja de cada LOD', async () => {
    const proc = getShipModel('sloop');
    const m = shipModelFromGlb(await glb('sloop'), 'sloop');
    expect(m.recipe).toBe(proc.recipe); // los números de la clase son los del juego (AC-193 a)
    expect(m.triangles).toEqual(proc.triangles);
    expect(m.extras).toEqual(proc.extras);
    expect(m.map).toBeNull();
    for (const k of ['cannonsPort', 'cannonsStbd', 'fire'] as const) {
      expect(m.sockets[k].map((p) => p.toArray())).toEqual(proc.sockets[k].map((p) => p.toArray()));
    }
    for (const k of ['smoke', 'label', 'wake', 'bow'] as const) expect(m.sockets[k].toArray()).toEqual(proc.sockets[k].toArray());
    for (const lod of [0, 1] as const) {
      const g = m.lods[lod];
      expect(['position', 'normal', 'color', '_rim_mask'].filter((a) => !g.getAttribute(a))).toEqual([]);
      g.computeBoundingBox();
      proc.lods[lod].computeBoundingBox();
      expect(g.boundingBox!.min.toArray()).toEqual(proc.lods[lod].boundingBox!.min.toArray());
      expect(g.boundingBox!.max.toArray()).toEqual(proc.lods[lod].boundingBox!.max.toArray());
    }
  });

  test('vale para cualquier clase con su eslora: la Fragata con 8 cañones por banda', async () => {
    const m = shipModelFromGlb(await glb('frigate'), 'frigate');
    expect([m.sockets.cannonsPort.length, m.sockets.cannonsStbd.length, m.extras.sb_length]).toEqual([8, 8, getShipModel('frigate').recipe.L]);
  });

  // La Cañonera echa humo por 2 sockets (VFX-SPEC §6, D25). El segundo, socket_smoke_02, sale del GLB como los demás
  // (BACKLOG :419): si no, perdería ese humo al pasar al GLB. Lo exige la clase cuya receta lo lleva; las demás no lo leen
  test('socket_smoke_02: la Cañonera lo lee del GLB y sin él no vale; una clase sin segundo humo no lo lee', async () => {
    const at = [0, 2.015, 5.6]; // el de la Cañonera de ux (ASSET-SPEC, fila de sus sockets), en otro sitio que el procedural
    const m = shipModelFromGlb(await glb('gunboat', { edit: (g) => (node(g, 'socket_smoke_02').translation = at) }), 'gunboat');
    expect(m.sockets.smoke2?.toArray()).toEqual(at);
    expect(getShipModel('gunboat').sockets.smoke2!.y).not.toBe(at[1]); // no es el del procedural
    const missing = await glb('gunboat', { edit: drop('socket_smoke_02') });
    expect(() => shipModelFromGlb(missing, 'gunboat')).toThrow(new ShipGlbError('falta socket_smoke_02 (§3)'));
    const extra = await glb('sloop', {
      edit: (g) => {
        nodes(g).push({ name: 'socket_smoke_02', translation: [0, 3, 1] });
        nodes(g)[0].children!.push(nodes(g).length - 1);
      }
    });
    expect(shipModelFromGlb(extra, 'sloop').sockets.smoke2).toBeUndefined();
  });

  test('sin COLOR_0 pone blanco y sin NORMAL calcula las de pliegue de 40°', async () => {
    const m = shipModelFromGlb(await glb('sloop', { edit: (g) => (without('COLOR_0')(g), without('NORMAL')(g)) }), 'sloop');
    const g = m.lods[0];
    expect(Array.from(g.getAttribute('color').array).every((v) => v === 1)).toBe(true);
    expect(g.getAttribute('normal').count).toBe(g.getAttribute('position').count);
  });

  // ux (2026-10-18, §13 paso 3): COLOR_0 multiplica la textura; en la jarcia y los cañones lleva su color, sobre un texel
  // blanco del atlas. El loader no lo toca: blanco solo si falta
  test('un COLOR_0 con color se conserva tal cual', async () => {
    const proc = getShipModel('sloop').lods[0].getAttribute('color');
    const g = shipModelFromGlb(await glb('sloop'), 'sloop').lods[0].getAttribute('color');
    expect(Array.from(g.array)).toEqual(Array.from(proc.array));
    expect(Array.from(g.array).some((v) => v < 1)).toBe(true);
  });

  test('el transform de un nodo de LOD se hornea en la geometría', async () => {
    const m = shipModelFromGlb(await glb('sloop', { edit: (g) => (node(g, 'ship_sloop_lod0').translation = [0, 1, 0]) }), 'sloop');
    const proc = getShipModel('sloop').lods[0];
    m.lods[0].computeBoundingBox();
    proc.computeBoundingBox();
    expect(m.lods[0].boundingBox!.max.y).toBeCloseTo(proc.boundingBox!.max.y + 1, 5);
  });

  test.each([
    ['falta un LOD', drop('ship_sloop_lod1'), 'falta la malla ship_sloop_lod1, hija de la raíz (§3)'],
    ['material con transparencia', (g: Json) => ((g.materials as Json[])[0].alphaMode = 'BLEND'), 'ship_sloop_lod0 no es OPAQUE (§1)'],
    ['dos primitivas', (g: Json) => {
      const p = (g.meshes as { primitives: Json[] }[])[0].primitives;
      p.push({ ...p[0] });
    }, 'ship_sloop_lod0 tiene más de una primitiva o material (§0)'],
    ['falta la estela', drop('socket_wake'), 'falta socket_wake (§3)'],
    ['falta un cañón de babor', drop('socket_cannon_port_04'), 'socket_cannon_port_NN: 3 de 4, del 01 seguidos (§3)'],
    ['la raíz movida', (g: Json) => (nodes(g)[0].translation = [0, 0.5, 0]), 'la raíz no tiene el transform identidad (§3)'],
    ['otros umbrales de LOD', (g: Json) => ((nodes(g)[0] as unknown as { extras: Json }).extras.sb_lod_px = [80, 70]), `sb_lod_px [80,70]; el juego usa ${JSON.stringify(LOD_PX)} (§7)`],
    ['sin versión', (g: Json) => delete (nodes(g)[0] as unknown as { extras: Json }).extras.sb_version, 'sb_version undefined; se espera 1 (§4)'],
    ['sin _RIM_MASK (AS-V09; ux: no un barco a medias)', without('_RIM_MASK'), 'ship_sloop_lod0 sin _RIM_MASK: sin borde de protección (§6, AS-V09)'],
    ['dos raíces', (g: Json) => {
      nodes(g).push({ name: 'extra' });
      (g.scenes as { nodes: number[] }[])[0].nodes.push(nodes(g).length - 1);
    }, 'la escena tiene 2 nodos raíz; el contrato pide 1 (§3)']
  ])('rechaza un GLB que incumple el contrato: %s', async (_case, edit, message) => {
    const scene = await glb('sloop', { edit });
    expect(() => shipModelFromGlb(scene, 'sloop')).toThrow(new ShipGlbError(message));
  });

  test('rechaza el GLB de otra clase: la Fragata no vale como Balandra (eslora de §8.4)', async () => {
    const scene = await glb('frigate');
    expect(() => shipModelFromGlb(scene, 'sloop')).toThrow(new ShipGlbError('sb_length 34 m y la clase sloop mide 16 m (§8.4)'));
  });
});

// Una red y un cargador falsos: cada descarga queda pendiente hasta que el test la resuelve con la escena que dará el
// parse, o la rechaza. `make` cuenta los cargadores creados y `renderers` guarda el renderer que recibe cada parse
// La descarga y el parse falsos: resolve() entrega la escena del GLB y, si lleva respaldo (D90), la promesa de sus KTX2
function fakeLoader() {
  const calls: { url: string; signal?: AbortSignal; resolve: (o: THREE.Object3D, upgrades?: Promise<TextureUpgrade[]>) => void; reject: (e: Error) => void }[] = [];
  const parsed = new Map<ArrayBuffer, { scene: THREE.Object3D; upgrades: Promise<TextureUpgrade[]> }>();
  const renderers: THREE.WebGLRenderer[] = [];
  // Como fetch, una descarga abortada rechaza
  const fetchGlb = (url: string, signal?: AbortSignal) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('AbortError')));
      calls.push({
        url,
        signal,
        resolve: (scene, upgrades = Promise.resolve([])) => {
          const bytes = new ArrayBuffer(0);
          parsed.set(bytes, { scene, upgrades });
          resolve(bytes);
        },
        reject
      });
    });
  const loader: GlbLoader = {
    parse: (bytes, _url, renderer) => {
      renderers.push(renderer);
      return Promise.resolve(parsed.get(bytes)!);
    },
    dispose: jest.fn()
  };
  const make = jest.fn(() => loader);
  return { calls, loader, fetchGlb, make, renderers };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const gl = {} as THREE.WebGLRenderer; // el cargador falso no lo usa

describe('AC-193 c: el procedural mientras carga, el propio primero y de uno en uno', () => {
  const manifest = { sloop: '/models/ship_sloop.glb', brig: '/models/ship_brig.glb', frigate: '/models/ship_frigate.glb' };

  test('model() da el procedural hasta que llega el GLB, y después el del GLB', async () => {
    const { calls, loader, fetchGlb } = fakeLoader();
    const store = new ShipGlbStore(manifest, () => loader, fetchGlb);
    store.request('sloop');
    expect(store.model('sloop')).toBe(getShipModel('sloop'));
    store.pump(gl);
    calls[0].resolve(await glb('sloop'));
    await settle();
    const m = store.model('sloop');
    expect(m).not.toBe(getShipModel('sloop'));
    expect(m.triangles).toEqual(getShipModel('sloop').triangles);
    expect(store.model('sloop')).toBe(m); // el mismo objeto en cada frame: la vista solo cambia una vez
  });

  test('carga de una en una, con el barco propio delante de los que ya esperaban', async () => {
    const { calls, loader, fetchGlb } = fakeLoader();
    const store = new ShipGlbStore(manifest, () => loader, fetchGlb);
    store.request('brig');
    store.request('frigate');
    store.request('sloop', true);
    store.request('brig'); // repetida: no se duplica
    store.pump(gl);
    store.pump(gl); // con una en curso no arranca otra
    expect(calls.map((c) => c.url)).toEqual(['/models/ship_sloop.glb']);
    calls[0].resolve(await glb('sloop'));
    await settle();
    store.pump(gl);
    calls[1].resolve(await glb('brig'));
    await settle();
    store.pump(gl);
    expect(calls.map((c) => c.url)).toEqual(['/models/ship_sloop.glb', '/models/ship_brig.glb', '/models/ship_frigate.glb']);
  });

  // AC-193 c (producto, 2026-10-18): los modelos que no son el propio se descargan en segundo plano nada más entrar, no al
  // entrar un barco en el área de interés, para que las 10 combinaciones queden en caché en ≤ 10 s
  test('al entrar se encolan todas las clases del manifiesto una vez, detrás del barco propio', async () => {
    const { calls, loader, fetchGlb } = fakeLoader();
    const store = new ShipGlbStore(manifest, () => loader, fetchGlb);
    store.request('brig', true);
    store.prefetchAll(prefetchClasses(null));
    store.prefetchAll(prefetchClasses(null)); // repetido: no duplica
    const classOf = (url: string) => Object.entries(manifest).find(([, u]) => u === url)![0];
    for (let i = 0; i < 3; i++) {
      store.pump(gl);
      expect(calls).toHaveLength(i + 1); // una descarga más por pump: si falta, falla aquí y no al resolver
      calls[i].resolve(await glb(classOf(calls[i].url)));
      await settle();
    }
    store.pump(gl);
    expect(calls.map((c) => c.url)).toEqual(['/models/ship_brig.glb', '/models/ship_sloop.glb', '/models/ship_frigate.glb']);
    expect(['sloop', 'brig', 'frigate'].map((c) => store.model(c) !== getShipModel(c))).toEqual([true, true, true]);
  });

  test('una clase sin GLB en el manifiesto no descarga nada', () => {
    const { calls, loader, fetchGlb } = fakeLoader();
    const store = new ShipGlbStore(manifest, () => loader, fetchGlb);
    store.request('pirate');
    store.pump(gl);
    expect(calls).toEqual([]);
    expect(store.model('pirate')).toBe(getShipModel('pirate'));
  });

  test('si falla la descarga o el contrato, se queda el procedural y no se reintenta', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { calls, loader, fetchGlb } = fakeLoader();
    const store = new ShipGlbStore(manifest, () => loader, fetchGlb);
    store.request('sloop');
    store.request('brig');
    store.pump(gl);
    calls[0].reject(new Error('404'));
    await settle();
    store.pump(gl);
    calls[1].resolve(await glb('brig', { edit: drop('socket_bow') }));
    await settle();
    store.request('sloop');
    store.request('brig');
    store.pump(gl);
    expect(calls).toHaveLength(2);
    expect([store.model('sloop'), store.model('brig')]).toEqual([getShipModel('sloop'), getShipModel('brig')]);
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      '[ship-glb] sloop (/models/ship_sloop.glb): 404; se queda el procedural',
      '[ship-glb] brig (/models/ship_brig.glb): falta socket_bow (§3); se queda el procedural'
    ]);
    warn.mockRestore();
  });

  test('setUrl vuelve a cargar la clase y libera el GLB anterior; dispose libera lo cargado y lo que llega tarde', async () => {
    const { calls, loader, fetchGlb } = fakeLoader();
    const store = new ShipGlbStore(manifest, () => loader, fetchGlb);
    store.request('sloop');
    store.pump(gl);
    calls[0].resolve(await glb('sloop'));
    await settle();
    const first = store.model('sloop');
    const released = jest.spyOn(first.lods[0], 'dispose');
    store.setUrl('sloop', '/models/ship_sloop-2.glb');
    expect(released).toHaveBeenCalled();
    expect(store.model('sloop')).toBe(getShipModel('sloop'));
    store.request('sloop');
    store.pump(gl);
    expect(calls[1].url).toBe('/models/ship_sloop-2.glb');
    store.dispose();
    expect(loader.dispose).toHaveBeenCalled();
    const late = await glb('sloop');
    const lateGeometry = (late.getObjectByName('ship_sloop_lod0') as THREE.Mesh).geometry;
    const lateDispose = jest.spyOn(lateGeometry, 'dispose');
    calls[1].resolve(late);
    await settle();
    expect(lateDispose).toHaveBeenCalled();
    expect(store.model('sloop')).toBe(getShipModel('sloop'));
  });
});

// AC-193 c, opción B (producto, 2026-10-18): la entrada espera al GLB propio con un tope. Para que la espera sea corta, su
// descarga empieza en cuanto se conoce la clase, sin esperar al renderer, y el cargador (sus módulos) en cuanto hay
// manifiesto. El transcodificador de KTX2 no: con el respaldo (D90) baja después del GLB propio
// BACKLOG :423-:427 (punto 3 de dev-render): el jugador no baja en segundo plano los modelos de barcos que no pueden salir en
// su partida. prefetchAll solo encola las clases de la lista (las del jugador y las de NPC de la bienvenida), y sin GLB de
// una clase del jugador la entrada no espera ni el cargador se crea antes de hacer falta, como sin manifiesto
describe('BACKLOG :423-:427: solo se precargan los modelos de los barcos que pueden salir', () => {
  const manifest = { sloop: '/models/ship_sloop.glb', gunboat: '/models/npc_pirate_gunboat.glb', captain: '/models/npc_pirate_captain.glb' };
  const I2_OFF = { npcClasses: ['pirate', 'merchant'] };
  const I2_ON = { npcClasses: ['pirate', 'merchant', 'gunboat', 'captain'] };

  test('prefetchClasses: las clases del jugador y las de NPC de la bienvenida; sin bienvenida, solo las del jugador', () => {
    expect(prefetchClasses(null)).toEqual(['sloop', 'brig', 'frigate']);
    expect(prefetchClasses(I2_ON)).toEqual(['sloop', 'brig', 'frigate', 'pirate', 'merchant', 'gunboat', 'captain']);
  });

  test('con el I2 apagado no se encolan la Cañonera ni el Capitán; encendido, sí, una vez cada uno y detrás del propio', async () => {
    const { calls, loader, fetchGlb } = fakeLoader();
    const store = new ShipGlbStore(manifest, () => loader, fetchGlb);
    store.request('sloop', true);
    store.prefetchAll(prefetchClasses(I2_OFF));
    store.pump(gl);
    calls[0].resolve(await glb('sloop'));
    await settle();
    store.pump(gl);
    expect(calls.map((c) => c.url)).toEqual(['/models/ship_sloop.glb']);
    store.prefetchAll(prefetchClasses(I2_ON));
    store.prefetchAll(prefetchClasses(I2_ON)); // repetido: no duplica
    for (const classId of ['gunboat', 'captain']) {
      store.pump(gl);
      calls[calls.length - 1].resolve(await glb(classId));
      await settle();
    }
    store.pump(gl);
    expect(calls.map((c) => c.url)).toEqual(['/models/ship_sloop.glb', '/models/npc_pirate_gunboat.glb', '/models/npc_pirate_captain.glb']);
    expect([store.loaded('gunboat'), store.loaded('captain')]).toEqual([true, true]);
  });

  test('con GLB solo de NPC, la entrada no espera y el cargador no se crea hasta que baja el primero, como sin manifiesto', () => {
    const { calls, fetchGlb, make } = fakeLoader();
    const store = new ShipGlbStore({ gunboat: manifest.gunboat, captain: manifest.captain }, make, fetchGlb);
    store.warm();
    store.predictOwn('sloop');
    store.request('sloop', true);
    expect([store.waiting(null), store.waiting('sloop'), make.mock.calls.length, calls.length]).toEqual([false, false, 0, 0]);
    store.prefetchAll(prefetchClasses(I2_ON));
    store.pump(gl);
    expect([make.mock.calls.length, calls.map((c) => c.url)]).toEqual([1, ['/models/npc_pirate_gunboat.glb']]);
  });
});

describe('AC-193 c, opción B: el GLB propio se empieza a bajar antes del primer frame', () => {
  const manifest = { sloop: '/models/ship_sloop.glb', brig: '/models/ship_brig.glb' };

  test('al pedir el propio arrancan su descarga y el cargador; el pump usa esa descarga y le pasa el renderer', async () => {
    const { calls, fetchGlb, make, renderers } = fakeLoader();
    const store = new ShipGlbStore(manifest, make, fetchGlb);
    store.request('brig');
    expect([calls.length, make.mock.calls.length]).toEqual([0, 0]); // los demás esperan a la cola
    store.request('sloop', true);
    expect(calls.map((c) => c.url)).toEqual(['/models/ship_sloop.glb']);
    expect(make).toHaveBeenCalledTimes(1);
    calls[0].resolve(await glb('sloop')); // llega antes de que haya renderer
    await settle();
    expect(store.model('sloop')).toBe(getShipModel('sloop'));
    store.pump(gl);
    await settle();
    expect(calls).toHaveLength(1);
    expect(renderers).toEqual([gl]);
    expect(store.model('sloop')).not.toBe(getShipModel('sloop'));
    store.pump(gl);
    expect(calls.map((c) => c.url)).toEqual(['/models/ship_sloop.glb', '/models/ship_brig.glb']);
    expect(make).toHaveBeenCalledTimes(1);
  });

  test('warm() crea el cargador antes de conocer la clase si hay manifiesto, una vez y sin bajar ningún GLB', () => {
    const none = fakeLoader();
    new ShipGlbStore({}, none.make, none.fetchGlb).warm();
    expect(none.make).not.toHaveBeenCalled();
    const { calls, fetchGlb, make } = fakeLoader();
    const store = new ShipGlbStore(manifest, make, fetchGlb);
    store.warm();
    store.warm();
    expect(make).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  test('si la descarga anticipada falla, la clase queda fallida en el siguiente pump, con un aviso y sin reintentos', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { calls, fetchGlb, make } = fakeLoader();
    const store = new ShipGlbStore(manifest, make, fetchGlb);
    store.request('sloop', true);
    calls[0].reject(new Error('Failed to fetch'));
    await settle();
    store.pump(gl);
    await settle();
    store.request('sloop', true);
    store.pump(gl);
    expect(calls).toHaveLength(1);
    expect(store.waiting('sloop')).toBe(false);
    expect(store.model('sloop')).toBe(getShipModel('sloop'));
    expect(warn.mock.calls.map((c) => c[0])).toEqual(['[ship-glb] sloop (/models/ship_sloop.glb): Failed to fetch; se queda el procedural']);
    warn.mockRestore();
  });

  test('waiting(): sin manifiesto, nunca; con él, mientras la clase propia no se conoce o su GLB no ha llegado ni fallado', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const empty = fakeLoader();
    const none = new ShipGlbStore({}, empty.make, empty.fetchGlb);
    expect([none.waiting(null), none.waiting('sloop')]).toEqual([false, false]);
    const { calls, fetchGlb, make } = fakeLoader();
    const store = new ShipGlbStore(manifest, make, fetchGlb);
    expect(store.waiting(null)).toBe(true);
    expect(store.waiting('pirate')).toBe(false); // su clase no tiene GLB
    store.request('sloop', true);
    expect([store.waiting('sloop'), store.loaded('sloop')]).toEqual([true, false]);
    store.pump(gl);
    calls[0].resolve(await glb('sloop'));
    await settle();
    expect([store.waiting('sloop'), store.loaded('sloop')]).toEqual([false, true]);
    store.request('brig', true);
    store.pump(gl);
    calls[1].reject(new Error('404'));
    await settle();
    expect([store.waiting('brig'), store.loaded('brig')]).toEqual([false, false]);
    warn.mockRestore();
  });
});

// Opción A de AC-193 c (producto, BACKLOG :1745): la clase del barco propio se predice al crear el runtime (la última del
// jugador en el navegador o la de salida, own-ship-memory.ts) y su GLB empieza a bajar antes de la bienvenida, delante del
// cargador. Si la clase real es otra, la predicha se aborta y la buena se pide al llegar
describe('AC-193 c, opción A: el GLB de la clase propia predicha, antes de la bienvenida', () => {
  const manifest = { sloop: '/models/ship_sloop.glb', frigate: '/models/ship_frigate.glb' };

  test('si acierta, la descarga empieza al predecir y antes que el cargador; la clase real no pide otra y el pump la usa', async () => {
    const f = fakeLoader();
    const order: string[] = [];
    const store = new ShipGlbStore(
      manifest,
      () => (order.push('cargador'), f.make()),
      (url, signal) => (order.push(url), f.fetchGlb(url, signal))
    );
    store.predictOwn('sloop');
    expect(order).toEqual(['/models/ship_sloop.glb', 'cargador']);
    store.request('sloop', true);
    store.prefetchAll(prefetchClasses(null));
    expect(f.calls.map((c) => c.url)).toEqual(['/models/ship_sloop.glb']);
    f.calls[0].resolve(await glb('sloop'));
    store.pump(gl);
    await settle();
    expect([store.loaded('sloop'), f.calls[0].signal?.aborted, f.calls.length]).toEqual([true, false, 1]);
  });

  test('si falla, la predicha se aborta al llegar la clase real, que se pide en el acto; prefetchAll vuelve a bajar la predicha desde cero', async () => {
    const f = fakeLoader();
    const store = new ShipGlbStore(manifest, f.make, f.fetchGlb);
    store.predictOwn('frigate');
    expect(f.calls.map((c) => [c.url, c.signal?.aborted])).toEqual([['/models/ship_frigate.glb', false]]);
    store.request('sloop', true);
    expect(f.calls.map((c) => [c.url, c.signal?.aborted])).toEqual([
      ['/models/ship_frigate.glb', true],
      ['/models/ship_sloop.glb', undefined]
    ]);
    store.prefetchAll(prefetchClasses(null));
    f.calls[1].resolve(await glb('sloop'));
    store.pump(gl);
    await settle();
    store.pump(gl);
    expect([store.loaded('sloop'), f.calls.map((c) => c.url)]).toEqual([true, ['/models/ship_frigate.glb', '/models/ship_sloop.glb', '/models/ship_frigate.glb']]);
    f.calls[2].resolve(await glb('frigate'));
    await settle();
    expect(store.loaded('frigate')).toBe(true);
  });

  test('solo GLB del manifiesto: sin URL no se pide nada ni se crea el cargador; si la URL llega antes que la clase real, la descarga empieza entonces, y después ya no', () => {
    const f = fakeLoader();
    new ShipGlbStore({}, f.make, f.fetchGlb).predictOwn('sloop');
    expect([f.calls.length, f.make.mock.calls.length]).toEqual([0, 0]);
    const late = new ShipGlbStore({}, f.make, f.fetchGlb);
    late.predictOwn('sloop');
    late.setUrl('frigate', '/models/ship_frigate.glb'); // otra clase
    expect(f.calls.length).toBe(0);
    late.setUrl('sloop', '/models/ship_sloop.glb'); // un manifiesto que llega tarde, como la trampa de los e2e
    expect([f.calls.map((c) => c.url), f.make.mock.calls.length]).toEqual([['/models/ship_sloop.glb'], 1]);
    const known = new ShipGlbStore({}, f.make, f.fetchGlb);
    known.predictOwn('sloop');
    known.request('frigate', true); // la clase real, sin URL todavía
    known.setUrl('sloop', '/models/ship_sloop.glb');
    known.predictOwn('sloop');
    expect(f.calls.length).toBe(1);
  });

  test('dispose aborta la descarga predicha', () => {
    const f = fakeLoader();
    const store = new ShipGlbStore(manifest, f.make, f.fetchGlb);
    store.predictOwn('frigate');
    store.dispose();
    expect(f.calls.map((c) => c.signal?.aborted)).toEqual([true]);
  });

  // La sonda QA-31 (BACKLOG :1821; scratchpad/qa-pr31-cf0ee5f.log, etapa SONDA): otro barco de la clase predicha entra antes
  // que el propio y el pump toma la descarga predicha; al llegar la clase real, el aborto no puede dejar esa clase fallida
  // hasta recargar. La predicha se aborta, la real se carga antes, y la predicha vuelve a la cola y acaba cargada, sin
  // quedar fallida (waiting) y sin aviso
  test('si el pump ya tomó la descarga predicha, el aborto la vuelve a encolar al final, sin marcarla fallida ni avisar', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = fakeLoader();
    const store = new ShipGlbStore(manifest, f.make, f.fetchGlb);
    const order: string[] = [];
    const loadedNow = () => ['sloop', 'frigate'].filter((c) => store.loaded(c) && !order.includes(c)).forEach((c) => order.push(c));
    store.predictOwn('frigate');
    store.request('frigate'); // un barco de la Fragata, antes que el propio
    store.pump(gl); // toma la descarga predicha
    store.request('sloop', true); // la clase real: aborta la predicha
    await settle();
    expect([f.calls[0].signal?.aborted, store.waiting('frigate'), warn.mock.calls]).toEqual([true, true, []]);
    f.calls[1].resolve(await glb('sloop'));
    store.pump(gl);
    await settle();
    loadedNow();
    store.pump(gl); // la predicha, desde cero
    expect(f.calls.map((c) => c.url)).toEqual(['/models/ship_frigate.glb', '/models/ship_sloop.glb', '/models/ship_frigate.glb']);
    f.calls[2].resolve(await glb('frigate'));
    await settle();
    loadedNow();
    expect([order, store.waiting('frigate'), warn.mock.calls]).toEqual([['sloop', 'frigate'], false, []]);
    warn.mockRestore();
  });
});

// Hoy el juego se muestra en el primer frame. Con el GLB propio pendiente, en el primer frame en que llega o falla, o en el
// primero que pasa del tope; update() devuelve true solo en el frame en que se abre
describe('AC-193 c, opción B: la entrada espera al GLB propio con un tope de 0,5 s sobre la de hoy', () => {
  test('sin nada que esperar se muestra en el primer frame, como hoy', () => {
    const gate = new EntryGate();
    expect([gate.update(1000, false, false), gate.update(1016, false, false)]).toEqual([true, false]);
    expect(gate).toMatchObject({ firstFrameAt: 1000, shownAt: 1000, lastWaitAt: 0, withGlb: false, capped: false });
  });

  test('con el GLB propio pendiente espera a que llegue y entra con él', () => {
    const gate = new EntryGate();
    expect([gate.update(1000, true, false), gate.update(1200, true, false), gate.update(1450, false, true)]).toEqual([false, false, true]);
    expect(gate).toMatchObject({ firstFrameAt: 1000, shownAt: 1450, lastWaitAt: 1200, withGlb: true, capped: false });
  });

  test('si no llega, se muestra en el primer frame que pasa del tope, con el modelo de hoy', () => {
    const gate = new EntryGate();
    expect([1000, 1300, 1499, 1516, 1600].map((t) => gate.update(t, true, false))).toEqual([false, false, false, true, false]);
    expect(gate).toMatchObject({ shownAt: 1516, lastWaitAt: 1499, withGlb: false, capped: true });
    expect(OWN_GLB_WAIT_MS).toBe(500);
    const longer = new EntryGate();
    longer.waitMs = 2000;
    expect([1000, 1600, 2999, 3000].map((t) => longer.update(t, true, false))).toEqual([false, false, false, true]);
  });

  test('si el GLB falla, entra en ese frame con el modelo de hoy', () => {
    const gate = new EntryGate();
    gate.update(1000, true, false);
    expect(gate.update(1100, false, false)).toBe(true);
    expect(gate).toMatchObject({ shownAt: 1100, withGlb: false, capped: false });
  });
});

describe('§1: el transcodificador de KTX2 no baja al crear el cargador (salida 1 de AC-193 c)', () => {
  // KTX2Loader.init() baja basis_transcoder.js y .wasm (≈ 585 KB) y solo crea los workers al transcodificar. Con el respaldo
  // (D90) la entrada no lo necesita, así que no se pide al crear el cargador, donde competiría con el GLB propio: lo pide el
  // plugin en el parse de un GLB con respaldo (el test de init de D90, más abajo), o la primera KTX2 sin él (KTX2Loader.load
  // lo inicia). El renderer hace falta para elegir el formato de GPU (detectSupport), antes del primer parse
  test('init() del KTX2Loader no se llama al crearlo ni con un GLB sin KTX2; detectSupport, con el renderer del primer parse y una sola vez', async () => {
    const init = jest.spyOn(KTX2Loader.prototype, 'init').mockResolvedValue(undefined);
    const detect = jest.spyOn(KTX2Loader.prototype, 'detectSupport').mockImplementation(function (this: KTX2Loader) {
      return this;
    });
    const loader = createGlbLoader();
    await settle();
    expect([init.mock.calls.length, detect.mock.calls.length]).toEqual([0, 0]);
    const bytes = writeGlb(buildShipAsset('sloop'));
    const buffer = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const { scene } = await loader.parse(buffer(), '/models/ship_sloop.glb', gl);
    await loader.parse(buffer(), '/models/ship_sloop.glb', gl);
    expect([init.mock.calls.length, detect.mock.calls]).toEqual([0, [[gl]]]);
    expect(shipModelFromGlb(scene, 'sloop').triangles).toEqual(getShipModel('sloop').triangles);
    loader.dispose();
    init.mockRestore();
    detect.mockRestore();
  });
});

describe('§6: la textura del GLB en el material del barco', () => {
  test('poner o quitar el mapa recompila el programa; cambiar de textura, no', () => {
    const material = new THREE.MeshStandardMaterial();
    const a = new THREE.Texture();
    const b = new THREE.Texture();
    const version = () => material.version;
    const v0 = version();
    // Se compara la identidad del mapa, no la textura: el diff de Jest de una THREE.Texture falla en Node (VideoFrame)
    const state = () => [material.map === a ? 'a' : material.map === b ? 'b' : material.map, version() - v0];
    setShipMap(material, a);
    expect(state()).toEqual(['a', 1]);
    setShipMap(material, b);
    expect(state()).toEqual(['b', 1]);
    setShipMap(material, b);
    setShipMap(material, null);
    expect(state()).toEqual([null, 2]);
  });

  test('el modelo del GLB lleva la textura de LOD0, la misma en los dos LOD', () => {
    const map = new THREE.Texture();
    const scene = buildShipAsset('sloop', new THREE.MeshStandardMaterial({ map }));
    const m: ShipModel = shipModelFromGlb(scene, 'sloop');
    expect(m.map).toBe(map);
  });
});

const ROOT = path.join(__dirname, '..', '..', '..', '..');

describe('§1: el transcodificador de KTX2 servido en public/basis', () => {
  const three = (file: string) => fs.readFileSync(path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis', file));

  // Se sirve con caché de un año (next.config.ts, AC-193 c): la carpeta lleva el hash de los dos archivos, así que un
  // transcodificador nuevo (al subir three) cambia de URL. Si este test falla, copia los de three a public/basis/<hash>/
  test('BASIS_PATH es /basis/<hash del js y el wasm de three>/', () => {
    expect(BASIS_PATH).toBe(`/basis/${contentHash(three('basis_transcoder.js'), three('basis_transcoder.wasm'))}/`);
  });

  test.each(['basis_transcoder.js', 'basis_transcoder.wasm'])('%s es el de three instalado (BASIS_PATH)', (file) => {
    const served = fs.readFileSync(path.join(ROOT, 'public', BASIS_PATH, file));
    expect(served.equals(three(file))).toBe(true);
  });

  test('public/basis solo tiene la carpeta de BASIS_PATH y el README: nada se sirve sin hash', () => {
    expect(fs.readdirSync(path.join(ROOT, 'public', 'basis')).sort()).toEqual([path.basename(BASIS_PATH), 'README.md'].sort());
  });
});

describe('§13: los GLB de public/models llevan el hash de su contenido', () => {
  // Con caché de un año, un GLB con nombre fijo no se actualizaría en el navegador de quien ya lo bajó
  // Con el paso 4c de §13, la KTX2 de un barco va a su lado en su .ktx2, con la misma regla (BACKLOG :419)
  test('se detectan el nombre sin hash, el hash que no es el del contenido y las carpetas, en los GLB y en las KTX2', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'models-'));
    try {
      const bytes = Buffer.from('glTF');
      const ktx2 = Buffer.from('«KTX 20»');
      fs.writeFileSync(path.join(dir, `ship_sloop.${contentHash(bytes)}.glb`), bytes);
      fs.writeFileSync(path.join(dir, `ship_sloop_atlas.${contentHash(ktx2)}.ktx2`), ktx2);
      fs.writeFileSync(path.join(dir, `${E2E_PREFIX}ship_sloop.00000000.glb`), bytes); // fixture de build:e2e, fuera de git
      fs.writeFileSync(path.join(dir, `${E2E_PREFIX}ship_sloop_atlas.00000000.ktx2`), ktx2);
      fs.writeFileSync(path.join(dir, 'ship_brig.glb'), bytes);
      fs.writeFileSync(path.join(dir, 'ship_brig_atlas.ktx2'), ktx2);
      fs.writeFileSync(path.join(dir, 'ship_frigate.00000000.glb'), bytes);
      fs.writeFileSync(path.join(dir, 'ship_frigate_atlas.00000000.ktx2'), ktx2);
      fs.writeFileSync(path.join(dir, `ship_sloop_atlas.${contentHash(ktx2)}.png`), ktx2);
      fs.mkdirSync(path.join(dir, 'navio'));
      expect(unhashedModels(dir)).toEqual([
        'navio',
        'ship_brig.glb',
        'ship_brig_atlas.ktx2',
        'ship_frigate.00000000.glb',
        'ship_frigate_atlas.00000000.ktx2',
        `ship_sloop_atlas.${contentHash(ktx2)}.png`
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  const badUrl = (url: string | undefined) =>
    !url || !/^\/models\/[^/]+$/.test(url) || !HASHED_GLB.test(path.basename(url)) || path.basename(url).startsWith(E2E_PREFIX) || !fs.existsSync(path.join(ROOT, 'public', url));

  test('public/models no tiene GLB sin hash, y SHIP_GLB y SHIP_GLB_STAGED solo apuntan a GLB con hash que existen', () => {
    expect(unhashedModels(path.join(ROOT, 'public', 'models'))).toEqual([]);
    expect([Object.values(SHIP_GLB).filter(badUrl), Object.values(SHIP_GLB_STAGED).filter(badUrl)]).toEqual([[], []]);
  });

  // La Cañonera, sin entrada en SHIP_GLB (producto, BACKLOG :421: el Capitán entra solo): su GLB sigue en public/models,
  // pero el store del juego no lo pide ni con el I2 encendido, y la clase se queda en su procedural
  test('SHIP_GLB_STAGED: ninguna de sus clases está en SHIP_GLB, y el store del juego no las pide con el I2 encendido', async () => {
    expect([Object.keys(SHIP_GLB_STAGED), Object.keys(SHIP_GLB_STAGED).filter((c) => SHIP_GLB[c])]).toEqual([['gunboat'], []]);
    const { calls, fetchGlb, make } = fakeLoader();
    const store = new ShipGlbStore(undefined, make, fetchGlb);
    store.prefetchAll(prefetchClasses({ npcClasses: ['pirate', 'merchant', 'gunboat', 'captain'] }));
    store.pump(gl);
    calls[0].resolve(await glb('captain'));
    await settle();
    store.pump(gl);
    expect(calls.map((c) => c.url)).toEqual([SHIP_GLB.captain]);
    expect([store.loaded('captain'), store.loaded('gunboat'), store.model('gunboat')]).toEqual([true, false, getShipModel('gunboat')]);
  });
});

describe('§1: el GLB comprimido como pide el contrato (meshopt, cuantización y KTX2 ETC1S)', () => {
  // e2e/fixtures/ship_sloop_etc1s_meshopt.glb, de scripts/glb/make-ship-fixture.ts con gltf-transform y toktx. La
  // cuantización deja en cada nodo de LOD una escala y un desplazamiento, que el loader hornea en la geometría
  test('la Balandra comprimida da los mismos triángulos y sockets, la caja a menos de 1 cm y la textura del KTX2', async () => {
    (globalThis as unknown as { self?: unknown }).self ??= globalThis; // GLTFLoader crea la URL de la imagen con self.URL
    const texture = new THREE.CompressedTexture([], 16, 16);
    // Sin navegador no hay transcodificador: un KTX2Loader falso entrega la textura (el e2e usa el de verdad)
    const ktx2 = { load: (_url: string, onLoad: (t: THREE.Texture) => void) => onLoad(texture) } as unknown as KTX2Loader;
    const file = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'e2e', 'fixtures', 'ship_sloop_etc1s_meshopt.glb'));
    const scene = await new Promise<THREE.Object3D>((resolve, reject) =>
      new GLTFLoader()
        .setMeshoptDecoder(MeshoptDecoder)
        .setKTX2Loader(ktx2)
        .parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, '', (g) => resolve(g.scene), reject)
    );
    const lod0 = scene.getObjectByName('ship_sloop_lod0')!;
    expect(lod0.scale.x).not.toBe(1); // el fixture viene cuantizado: si no, el test no prueba el horneado
    const proc = getShipModel('sloop');
    const m = shipModelFromGlb(scene, 'sloop');
    expect(m.triangles).toEqual(proc.triangles);
    expect(m.sockets.cannonsPort.map((p) => p.toArray())).toEqual(proc.sockets.cannonsPort.map((p) => p.toArray()));
    expect(m.map).toBe(texture);
    expect(m.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    for (const lod of [0, 1] as const) {
      const g = m.lods[lod];
      expect(g.getAttribute('position').array).toBeInstanceOf(Float32Array);
      g.computeBoundingBox();
      proc.lods[lod].computeBoundingBox();
      for (const k of ['min', 'max'] as const) {
        const d = g.boundingBox![k].clone().sub(proc.lods[lod].boundingBox![k]);
        expect(Math.max(Math.abs(d.x), Math.abs(d.y), Math.abs(d.z))).toBeLessThan(0.01);
      }
    }
  });
});

// D90 (ASSET-SPEC §1 y §13, paso 4b; salida 1 de AC-193 c): la textura KTX2 lleva un respaldo PNG en texture.source. El
// fixture comprimido (KTX2 magenta de 16 × 16) recibe en memoria un respaldo cian, así que no hace falta otro binario
const FIXTURE = path.join(ROOT, 'e2e', 'fixtures', 'ship_sloop_etc1s_meshopt.glb');
const CYAN = [0, 255, 255] as const;
const fixture = () => new Uint8Array(fs.readFileSync(FIXTURE));
// `dir` es la carpeta del GLB, contra la que GLTFLoader resuelve las `uri` (createGlbLoader le pasa la de su URL)
const readGltf = (bytes: Uint8Array, loader: GLTFLoader, dir = '') =>
  loader.setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, dir);

// Sin navegador no hay transcodificador ni descodificador de imágenes: un KTX2Loader falso, que entrega su textura al
// soltarlo, y un cargador de imágenes falso, que la entrega en el acto. Guardan las URL que se les piden; init es el del
// transcodificador
function fakeTextureLoaders() {
  const ktx2Texture = new THREE.CompressedTexture([], 16, 16);
  const imageTexture = new THREE.Texture();
  const calls = { ktx2: 0, image: 0 };
  const urls = { ktx2: [] as string[], image: [] as string[] };
  const init = jest.fn(() => Promise.resolve());
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  const ktx2 = {
    init,
    load: (url: string, onLoad: (t: THREE.Texture) => void) => {
      calls.ktx2++;
      urls.ktx2.push(url);
      void released.then(() => onLoad(ktx2Texture));
    }
  } as unknown as THREE.Loader & { init: typeof init };
  const images = {
    load: (url: string, onLoad: (t: THREE.Texture) => void) => {
      calls.image++;
      urls.image.push(url);
      onLoad(imageTexture);
    }
  } as unknown as THREE.Loader;
  return { ktx2, images, ktx2Texture, imageTexture, calls, urls, init, release };
}

// La Cañonera de la 2.ª vuelta y el Capitán de la receta (D91), aprobados por Jonattan y entregados por ux (ASSET-SPEC §13,
// sus filas), en public/models con el paso 4c. Se leen como en el juego, con un KTX2Loader falso porque sin navegador no hay
// transcodificador, y dan el modelo de su clase con los números de la entrega: triángulos, extras y sockets. El Capitán, de
// SHIP_GLB; la Cañonera, de SHIP_GLB_STAGED (sin entrada en SHIP_GLB: BACKLOG :421)
describe('Los GLB de la Cañonera y el Capitán de D91 (ASSET-SPEC §13)', () => {
  const read = async (classId: string) => {
    (globalThis as unknown as { self?: unknown }).self ??= globalThis; // GLTFLoader crea la URL de la imagen con self.URL
    const texture = new THREE.CompressedTexture([], 1024, 1024);
    const asked: string[] = [];
    const ktx2 = { load: (url: string, onLoad: (t: THREE.Texture) => void) => (asked.push(url), onLoad(texture)) } as unknown as KTX2Loader;
    const url = (SHIP_GLB[classId] ?? SHIP_GLB_STAGED[classId])!;
    const file = fs.readFileSync(path.join(ROOT, 'public', url));
    const scene = await new Promise<THREE.Object3D>((resolve, reject) =>
      new GLTFLoader()
        .setMeshoptDecoder(MeshoptDecoder)
        .setKTX2Loader(ktx2)
        .parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, THREE.LoaderUtils.extractUrlBase(url), (g) => resolve(g.scene), reject)
    );
    return { m: shipModelFromGlb(scene, classId), asked, texture };
  };
  const at = (v: THREE.Vector3 | undefined) => v?.toArray().map((x) => Math.round(x * 1000) / 1000);

  test('la Cañonera: 1 988 / 465 triángulos, su palo de 18,15 m, los 2 humos de D25 y los fuegos de AS-V17, con la KTX2 de al lado', async () => {
    const { m, asked, texture } = await read('gunboat');
    expect([m.extras.sb_id, m.triangles, m.extras.sb_mast_height, m.extras.sb_radius, m.extras.sb_pick]).toEqual(['npc_pirate_gunboat', [1988, 465], 18.15, 14, [5.5, 18.15, 13]]);
    expect([at(m.sockets.smoke), at(m.sockets.smoke2), m.sockets.fire.map(at)]).toEqual([[0, 2.009, -4.2], [0, 2.015, 5.6], [[1.2, 1.832, 7.1], [-1.8, 1.8, 0], [0, 1.827, -6.6]]]);
    expect([m.sockets.cannonsPort.length, m.sockets.cannonsStbd.length, m.recipe]).toEqual([6, 6, getShipModel('gunboat').recipe]);
    expect([m.map, asked]).toEqual([texture, ['/models/npc_pirate_gunboat_atlas.12e7f712.ktx2']]);
  });

  test('el Capitán: 2 383 / 511 triángulos, su palo de 24 m y un solo humo', async () => {
    const { m, asked } = await read('captain');
    expect([m.extras.sb_id, m.triangles, m.extras.sb_mast_height, m.extras.sb_radius, m.extras.sb_pick]).toEqual(['npc_pirate_captain', [2383, 511], 24, 16, [6, 24, 15]]);
    expect([at(m.sockets.smoke), m.sockets.smoke2, m.sockets.fire.map(at)]).toEqual([[0, 3.316, -4.5], undefined, [[1.6, 3.205, 7.4], [-1.6, 3.1, 0], [1.4, 4.796, -9]]]);
    expect([m.sockets.cannonsPort.length, m.recipe, asked]).toEqual([6, getShipModel('captain').recipe, ['/models/npc_pirate_captain_atlas.5455a0a6.ktx2']]);
  });
});

describe('D90: KHR_texture_basisu con respaldo, sin esperar al transcodificador (salida 1 de AC-193 c)', () => {
  beforeAll(() => {
    (globalThis as unknown as { self?: unknown }).self ??= globalThis; // GLTFLoader crea la URL de la imagen con self.URL
  });

  // GLTFLoader guarda los plugins por nombre y gana el registrado después: el de three va en el constructor (GLTFLoader.js
  // :151 de r180), register() pone los nuestros detrás (:379-381) y `plugins[ plugin.name ] = plugin` (:483) deja el
  // nuestro. Sin setKTX2Loader, el de three no lee un GLB con la extensión requerida (:1552-1554)
  test('el plugin sustituye al de three: sin setKTX2Loader, un GLB sin respaldo y con la extensión requerida solo se lee con él', async () => {
    await expect(readGltf(fixture(), new GLTFLoader())).rejects.toThrow('setKTX2Loader must be called before loading KTX2 textures');
    const t = fakeTextureLoaders();
    t.release();
    const basisu = basisuWithFallback(t.ktx2, t.images);
    const read = readGltf(fixture(), new GLTFLoader().register(basisu.register));
    await expect(read).resolves.toBeTruthy();
    const m = shipModelFromGlb((await read).scene, 'sloop');
    // Sin respaldo, como hoy: la KTX2 en el parse y nada que cambiar después
    expect([m.map === t.ktx2Texture, t.calls]).toEqual([true, { ktx2: 1, image: 0 }]);
    expect(await basisu.upgrades()).toEqual([]);
  });

  test('con respaldo, el GLB se lee con él sin esperar a la KTX2, que se pide en el parse y llega aparte, con flipY false en las dos', async () => {
    const t = fakeTextureLoaders(); // la KTX2, retenida hasta release()
    const basisu = basisuWithFallback(t.ktx2, t.images);
    const read = readGltf(addFallback(fixture(), solidPng(CYAN, 16)), new GLTFLoader().register(basisu.register));
    // Si el parse esperase a la KTX2 retenida no acabaría nunca: se compara con un plazo para que el rojo sea por aserción
    const first = await Promise.race([read.then(() => 'leído', () => 'falló'), new Promise((r) => setTimeout(() => r('esperando a la KTX2'), 2000))]);
    expect(first).toBe('leído');
    const m = shipModelFromGlb((await read).scene, 'sloop');
    expect([m.map === t.imageTexture, t.calls]).toEqual([true, { ktx2: 1, image: 1 }]);
    const got: { pairs?: TextureUpgrade[] } = {};
    void basisu.upgrades().then((pairs) => (got.pairs = pairs));
    await settle();
    expect(got.pairs).toBeUndefined(); // espera a la KTX2
    t.release();
    await settle();
    expect(got.pairs?.map(([fallback, ktx2]) => [fallback === t.imageTexture, ktx2 === t.ktx2Texture])).toEqual([[true, true]]);
    // GLTFLoader pone flipY false a toda textura de un glTF (GLTFLoader.js:3328); el respaldo nace con true
    expect([t.imageTexture.flipY, t.ktx2Texture.flipY, t.imageTexture.colorSpace]).toEqual([false, false, THREE.SRGBColorSpace]);
  });

  // Paso 4c de §13: la KTX2 en su .ktx2 aparte, por `uri`. GLTFLoader la pide con el KTX2Loader al lado del GLB
  // (LoaderUtils.resolveURL contra la carpeta, GLTFLoader.js:3420), y el parse no la espera porque el plugin devuelve el
  // respaldo: lo que era HIPÓTESIS en ASSET-SPEC :792. Con un plugin que la esperase, la carrera da el rojo por aserción
  test('con la KTX2 en su .ktx2 aparte (uri), el GLB se lee con el respaldo sin esperarla, y la KTX2 se pide en el parse al lado del GLB', async () => {
    const t = fakeTextureLoaders(); // la KTX2, retenida hasta release()
    const ext = externalizeKtx2(addFallback(fixture(), solidPng(CYAN, 16)), 'ship_sloop');
    const basisu = basisuWithFallback(t.ktx2, t.images);
    const read = readGltf(ext.glb, new GLTFLoader().register(basisu.register), '/models/');
    const first = await Promise.race([read.then(() => 'leído', () => 'falló'), new Promise((r) => setTimeout(() => r('esperando a la KTX2'), 2000))]);
    expect(first).toBe('leído');
    expect([t.urls.ktx2, t.calls]).toEqual([[`/models/${ext.name}`], { ktx2: 1, image: 1 }]);
    const m = shipModelFromGlb((await read).scene, 'sloop');
    expect([m.map === t.imageTexture, m.triangles]).toEqual([true, getShipModel('sloop').triangles]);
    t.release();
    expect((await basisu.upgrades()).map(([fallback, ktx2]) => [fallback === t.imageTexture, ktx2 === t.ktx2Texture])).toEqual([[true, true]]);
  });

  // KTX2Loader.load baja la KTX2 y solo al tenerla llama a init(), que baja el transcodificador: con la KTX2 aparte, irían
  // uno detrás del otro. Con respaldo, el plugin lo pide en el parse, en paralelo con ella. Sin respaldo no hace falta: la
  // entrada espera a la KTX2 igualmente
  test('con respaldo, el plugin pide el transcodificador (init) en el parse, con la KTX2 aún retenida; sin respaldo, no', async () => {
    const plain = fakeTextureLoaders();
    plain.release();
    await readGltf(fixture(), new GLTFLoader().register(basisuWithFallback(plain.ktx2, plain.images).register));
    expect(plain.init.mock.calls.length).toBe(0);
    for (const bytes of [addFallback(fixture(), solidPng(CYAN, 16)), externalizeKtx2(addFallback(fixture(), solidPng(CYAN, 16)), 'ship_sloop').glb]) {
      const t = fakeTextureLoaders();
      const read = readGltf(bytes, new GLTFLoader().register(basisuWithFallback(t.ktx2, t.images).register), '/models/');
      // Con un plazo: si el parse esperase a la KTX2 retenida, este test no se colgaría (eso lo mide el de arriba)
      await Promise.race([read, new Promise((r) => setTimeout(r, 2000))]);
      expect([t.init.mock.calls.length, t.calls.ktx2]).toEqual([1, 1]);
      t.release();
    }
  });

  const manifest = { sloop: '/models/ship_sloop.glb' };
  // Un GLB leído con respaldo: la escena con el respaldo en el material y la promesa de su KTX2, que se entrega a mano
  const withFallback = () => {
    const fallback = new THREE.Texture();
    fallback.flipY = false;
    fallback.colorSpace = THREE.SRGBColorSpace;
    const ktx2 = new THREE.CompressedTexture([], 16, 16); // sin colorSpace: el respaldo manda, no el DFD de la KTX2
    let deliver!: (pairs: TextureUpgrade[]) => void;
    const upgrades = new Promise<TextureUpgrade[]>((r) => (deliver = r));
    return { scene: buildShipAsset('sloop', new THREE.MeshStandardMaterial({ map: fallback })), fallback, ktx2, upgrades, deliver };
  };

  test('la clase cuenta como cargada con el respaldo; al llegar la KTX2, model() da un objeto nuevo con ella y el colorSpace del respaldo, y el respaldo se libera', async () => {
    const { calls, loader, fetchGlb } = fakeLoader();
    const store = new ShipGlbStore(manifest, () => loader, fetchGlb);
    const g = withFallback();
    const released = jest.spyOn(g.fallback, 'dispose');
    store.request('sloop', true);
    store.pump(gl);
    calls[0].resolve(g.scene, g.upgrades);
    await settle();
    const first = store.model('sloop');
    expect([store.loaded('sloop'), store.waiting('sloop'), first.map === g.fallback]).toEqual([true, false, true]);
    g.deliver([[g.fallback, g.ktx2]]);
    await settle();
    const second = store.model('sloop');
    // Un objeto nuevo: updateShips (runtime.ts) cambia la vista cuando cambia el modelo, por identidad
    expect([second !== first, second.map === g.ktx2, second.lods === first.lods, store.model('sloop') === second]).toEqual([true, true, true, true]);
    expect([g.ktx2.colorSpace, g.ktx2.flipY, released.mock.calls.length]).toEqual([THREE.SRGBColorSpace, false, 1]);
  });

  test('si la KTX2 no llega, se queda el respaldo con un aviso; con otro GLB, el store liberado o el contrato incumplido, la KTX2 se libera sin ponerla', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const a = fakeLoader();
    const failed = new ShipGlbStore(manifest, () => a.loader, a.fetchGlb);
    const g = withFallback();
    failed.request('sloop', true);
    failed.pump(gl);
    a.calls[0].resolve(g.scene, g.upgrades);
    await settle();
    const kept = failed.model('sloop');
    g.deliver([[g.fallback, null]]); // la KTX2 falló: GLTFLoader resuelve null (GLTFLoader.js:3351-3353)
    await settle();
    expect([failed.model('sloop') === kept, kept.map === g.fallback]).toEqual([true, true]);
    expect(warn.mock.calls.map((c) => c[0])).toEqual(['[ship-glb] sloop (/models/ship_sloop.glb): la KTX2 no llegó; se queda el respaldo']);
    for (const late of ['setUrl', 'dispose', 'contrato'] as const) {
      const b = fakeLoader();
      const store = new ShipGlbStore(manifest, () => b.loader, b.fetchGlb);
      const h = withFallback();
      if (late === 'contrato') h.scene.remove(h.scene.getObjectByName('socket_bow')!);
      const ktx2Dispose = jest.spyOn(h.ktx2, 'dispose');
      store.request('sloop', true);
      store.pump(gl);
      b.calls[0].resolve(h.scene, h.upgrades);
      await settle();
      if (late === 'setUrl') store.setUrl('sloop', '/models/ship_sloop-2.glb');
      if (late === 'dispose') store.dispose();
      h.deliver([[h.fallback, h.ktx2]]);
      await settle();
      expect([late, ktx2Dispose.mock.calls.length, store.model('sloop') === getShipModel('sloop')]).toEqual([late, 1, true]);
    }
    warn.mockRestore();
  });

  // Tanda B (BACKLOG :421; ASSET-SPEC, AS-V19): el anisótropo del mapa de los GLB. El runtime lo pone al tener renderer, antes
  // de la primera carga; el e2e lo cambia para medir con él y sin él
  test('el nivel es el máximo del renderizador hasta 16, y al menos 1; el respaldo y la KTX2 llevan el anisótropo del store; cambiarlo vuelve a subir los mapas cargados', async () => {
    expect([32, 16, 8, 0].map((max) => mapAnisotropyFor(max))).toEqual([16, 16, 8, 1]); // 0: sin la extensión
    const { calls, loader, fetchGlb } = fakeLoader();
    const store = new ShipGlbStore(manifest, () => loader, fetchGlb);
    store.setMapAnisotropy(16);
    const g = withFallback();
    store.request('sloop', true);
    store.pump(gl);
    calls[0].resolve(g.scene, g.upgrades);
    await settle();
    expect([store.model('sloop').map === g.fallback, g.fallback.anisotropy]).toEqual([true, 16]);
    g.deliver([[g.fallback, g.ktx2]]);
    await settle();
    expect([store.model('sloop').map === g.ktx2, g.ktx2.anisotropy]).toEqual([true, 16]);
    const version = g.ktx2.version;
    store.setMapAnisotropy(1);
    expect([g.ktx2.anisotropy, g.ktx2.version > version]).toEqual([1, true]);
    store.setMapAnisotropy(1); // sin cambio, no se vuelve a subir
    expect(g.ktx2.version).toBe(version + 1);
  });
});

describe('AS-V10 (D90): cada textura KTX2 de un GLB lleva su respaldo', () => {
  // El fixture es la Balandra (sb_id ship_sloop), que no está en la tabla del juego (scripts/glb/respaldo-tamanos.json): sus
  // tests le dan una con el lado de cada caso, y la regla de la tabla se prueba aparte, con la tabla real
  const sized = (lado: number) => ({ ship_sloop: { lado, mimeType: 'image/png' } });

  test('el fixture sin respaldo no pasa; con un PNG de 16² sí; uno mayor que la KTX2 o que no es potencia de 2, tampoco', () => {
    expect(fallbackProblems(fixture(), { sizes: sized(16) })).toEqual(['textura 0: sin respaldo en texture.source', 'KHR_texture_basisu está en extensionsRequired']);
    expect(fallbackProblems(addFallback(fixture(), solidPng(CYAN, 16)), { sizes: sized(16) })).toEqual([]);
    expect(fallbackProblems(addFallback(fixture(), solidPng(CYAN, 32)), { sizes: sized(32) })).toEqual(['textura 0: respaldo de 32 × 32, mayor que la KTX2 de 16 × 16']);
    expect(fallbackProblems(addFallback(fixture(), solidPng(CYAN, 12)), { sizes: sized(12) })).toEqual(['textura 0: respaldo de 12 × 12, no es potencia de 2']);
  });

  // Paso 4b de §13: el lado y el formato del respaldo salen de una medida por clase (ux), que se guarda en la tabla por sb_id.
  // Sin ella, un respaldo de 1024² pasaría (QA). La KTX2 de estos casos es la del fixture con la cabecera de una de 1024²
  // y 11 niveles, en su .ktx2 aparte, que es lo único que lee el validador
  test('tabla de 4b (scripts/glb/respaldo-tamanos.json): el respaldo mide el lado de su sb_id y lleva su formato; no pasa con otro lado, otro formato, un sb_id que no está o sin sb_id', () => {
    const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'glb', 'respaldo-tamanos.json'), 'utf8')) as Record<string, { lado: number; mimeType: string }>;
    expect(Object.entries(table).flatMap(([k, v]) => (k.startsWith('_') ? [] : [[k, v.lado, v.mimeType]]))).toEqual([
      ['ship_line_es', 256, 'image/png'],
      ['ship_line_gb', 256, 'image/png'],
      ['npc_pirate_gunboat', 128, 'image/png'], // la medida de ux, en ASSET-SPEC §13 (la Cañonera y el Capitán de la receta)
      ['npc_pirate_captain', 128, 'image/png']
    ]);
    const line = (fallback: Uint8Array, sbId: string | null = 'ship_line_es', mimeType = 'image/png') => {
      const ext = externalizeKtx2(addFallback(fixture(), fallback), 'ship_line_es');
      const ktx2 = Uint8Array.from(ext.ktx2);
      const header = new DataView(ktx2.buffer);
      header.setUint32(20, 1024, true);
      header.setUint32(24, 1024, true);
      header.setUint32(40, 11, true);
      const name = `ship_line_es_atlas.${contentHash(ktx2)}.ktx2`;
      const glb = editGlb(ext.glb, (json) => {
        const images = json.images as Json[];
        images[0].uri = name;
        images[1].mimeType = mimeType;
        const extras = (json.nodes as Json[])[(json.scenes as { nodes: number[] }[])[0].nodes[0]].extras as Json;
        if (sbId === null) delete extras.sb_id;
        else extras.sb_id = sbId;
      });
      return fallbackProblems(glb, { external: (uri) => (uri === name ? ktx2 : null) });
    };
    // Un JPEG mínimo: SOI y un SOF0 con el alto y el ancho, que es lo que lee el validador
    const jpeg = (side: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, side >> 8, side & 255, side >> 8, side & 255, 0x03, ...new Array(12).fill(0)]);
    expect(line(solidPng(CYAN, 256))).toEqual([]);
    for (const side of [512, 1024, 128]) expect(line(solidPng(CYAN, side))).toEqual([`textura 0: respaldo de ${side} × ${side}; la tabla pide 256 × 256 para ship_line_es`]);
    expect(line(jpeg(256), 'ship_line_es', 'image/jpeg')).toEqual(['textura 0: respaldo image/jpeg; la tabla pide image/png para ship_line_es']);
    expect(line(solidPng(CYAN, 256), 'ship_line_xx')).toEqual(['ship_line_xx no está en scripts/glb/respaldo-tamanos.json']);
    expect(line(solidPng(CYAN, 256), null)).toEqual(['la raíz no lleva sb_id en sus extras (AS-V03): no se sabe qué respaldo pide scripts/glb/respaldo-tamanos.json']);
  });

  test('addFallback deja la KTX2 en la extensión, el PNG en texture.source y la extensión solo en extensionsUsed', () => {
    const { json } = readGlb(addFallback(fixture(), solidPng(CYAN, 16)));
    expect(json.textures).toEqual([{ sampler: 0, source: 1, extensions: { KHR_texture_basisu: { source: 0 } } }]);
    expect((json.images as Json[]).map((i) => i.mimeType)).toEqual(['image/ktx2', 'image/png']);
    expect([json.extensionsUsed, json.extensionsRequired]).toEqual([
      ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu'],
      ['EXT_meshopt_compression', 'KHR_mesh_quantization']
    ]);
  });

  // Paso 4c de §13: la imagen de la extensión es una `uri` a un .ktx2 de la misma carpeta, con el hash de su contenido y
  // todos sus mipmaps; el respaldo sigue en el BIN, porque la entrada lo espera
  test('paso 4c: con la KTX2 en su .ktx2 aparte pasa; no, si la uri no es un nombre con hash a su lado, si falta, si el hash no es el de su contenido, si le faltan mipmaps o si el respaldo sale del BIN', () => {
    const ext = externalizeKtx2(addFallback(fixture(), solidPng(CYAN, 16)), 'ship_sloop');
    const files = (map: Record<string, Uint8Array>) => (uri: string) => map[uri] ?? null;
    const withUri = (image: number, uri: string) => editGlb(ext.glb, (json) => void ((json.images as Json[])[image].uri = uri));
    const check = (glb: Uint8Array, external?: (uri: string) => Uint8Array | null) => fallbackProblems(glb, { external, sizes: sized(16) });
    expect([ext.name, HASHED_KTX2.test(ext.name)]).toEqual([`ship_sloop_atlas.${contentHash(ext.ktx2)}.ktx2`, true]);
    expect(check(ext.glb, files({ [ext.name]: ext.ktx2 }))).toEqual([]);
    expect(externalUris(ext.glb)).toEqual([ext.name]);
    expect(check(ext.glb, files({}))).toEqual([`textura 0: falta ${ext.name}`]);
    expect(check(ext.glb)).toEqual([`textura 0: falta ${ext.name}`]);
    for (const uri of [`/models/${ext.name}`, `atlas/${ext.name}`, `https://cdn.example.com/${ext.name}`, 'ship_sloop_atlas.ktx2', `ship_sloop_atlas.${contentHash(ext.ktx2)}.KTX2`]) {
      expect(check(withUri(0, uri), () => ext.ktx2)).toEqual([`textura 0: uri ${uri}; se espera <nombre>.<hash>.ktx2, relativa y sin barra`]);
    }
    const stale = 'ship_sloop_atlas.00000000.ktx2';
    expect(check(withUri(0, stale), files({ [stale]: ext.ktx2 }))).toEqual([`textura 0: ${stale} no lleva el hash de su contenido (${contentHash(ext.ktx2)})`]);
    // Sin todos sus mipmaps (levelCount de la cabecera, en el byte 40): 16² pide 5 niveles. Vale también dentro del GLB
    const oneLevel = Uint8Array.from(ext.ktx2);
    new DataView(oneLevel.buffer).setUint32(40, 1, true);
    const oneName = `ship_sloop_atlas.${contentHash(oneLevel)}.ktx2`;
    expect(check(withUri(0, oneName), files({ [oneName]: oneLevel }))).toEqual(['textura 0: la KTX2 de 16 × 16 trae 1 nivel; se esperan 5, todos sus mipmaps']);
    const embedded = addFallback(fixture(), solidPng(CYAN, 16));
    const { bin } = readGlb(embedded); // la KTX2 es el bufferView 0, al principio del BIN
    new DataView(bin.buffer, bin.byteOffset).setUint32(40, 0, true);
    expect(check(embedded)).toEqual(['textura 0: la KTX2 de 16 × 16 trae 0 niveles; se esperan 5, todos sus mipmaps']);
    // El respaldo en su propio archivo: la entrada esperaría a otra descarga
    const fallbackOut = editGlb(ext.glb, (json) => {
      const image = (json.images as Json[])[1];
      delete image.bufferView;
      image.uri = 'respaldo.png';
    });
    expect(check(fallbackOut, files({ [ext.name]: ext.ktx2 }))).toEqual(['textura 0: el respaldo va en una uri (respaldo.png), no en el BIN']);
  });

  test('externalizeKtx2 saca la KTX2 del BIN, sin tocar la geometría ni el respaldo, y deja su uri en la imagen de la extensión', () => {
    const embedded = addFallback(fixture(), solidPng(CYAN, 16));
    const ext = externalizeKtx2(embedded, 'ship_sloop');
    const before = readGlb(embedded);
    const after = readGlb(ext.glb);
    expect(after.json.images).toEqual([{ uri: ext.name, mimeType: 'image/ktx2' }, { bufferView: 10, mimeType: 'image/png', name: 'respaldo' }]);
    expect(after.json.textures).toEqual(before.json.textures);
    expect([ext.ktx2.byteLength, before.bin.byteLength - after.bin.byteLength]).toEqual([515, 516]); // con el relleno a 4
    expect(Buffer.from(ext.ktx2.subarray(0, 12)).toString('latin1')).toBe('«KTX 20»\r\n\x1a\n');
    expect(Buffer.from(after.bin).indexOf(Buffer.from(ext.ktx2))).toBe(-1);
  });

  test('public/models: cada GLB (sin los e2e_ de build:e2e) lleva su respaldo con el tamaño de la tabla, sus KTX2 aparte están a su lado y no sobra ninguna', () => {
    const dir = path.join(ROOT, 'public', 'models');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith(E2E_PREFIX)) : [];
    const bytes = (f: string) => new Uint8Array(fs.readFileSync(path.join(dir, f)));
    const glbs = files.filter((f) => f.endsWith('.glb'));
    const beside = (uri: string) => (files.includes(uri) ? bytes(uri) : null);
    expect(glbs.map((f) => [f, fallbackProblems(bytes(f), { external: beside })] as const).filter(([, p]) => p.length > 0)).toEqual([]);
    const linked = new Set(glbs.flatMap((f) => externalUris(bytes(f))));
    expect(files.filter((f) => f.endsWith('.ktx2') && !linked.has(f))).toEqual([]);
  });
});

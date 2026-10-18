// Loader de GLB de los barcos (ASSET-SPEC §13 paso 6; D80; AC-193): un GLB con el contrato de §1–§4 sustituye al
// procedural sin cambiar el juego, y uno que lo incumple se rechaza y deja el procedural. Los GLB se escriben aquí desde
// el procedural (glb-writer.ts) y los lee el GLTFLoader de three, como en el navegador
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { buildShipAsset, getShipModel, LOD_PX, ShipModel } from '../ship-geometry';
import { BASIS_PATH, createGlbLoader, EntryGate, GlbLoader, OWN_GLB_WAIT_MS, setShipMap, ShipGlbError, ShipGlbStore, shipModelFromGlb } from '../ship-glb';
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
function fakeLoader() {
  const calls: { url: string; resolve: (o: THREE.Object3D) => void; reject: (e: Error) => void }[] = [];
  const scenes = new Map<ArrayBuffer, THREE.Object3D>();
  const renderers: THREE.WebGLRenderer[] = [];
  const fetchGlb = (url: string) =>
    new Promise<ArrayBuffer>((resolve, reject) =>
      calls.push({
        url,
        resolve: (scene) => {
          const bytes = new ArrayBuffer(0);
          scenes.set(bytes, scene);
          resolve(bytes);
        },
        reject
      })
    );
  const loader: GlbLoader = {
    parse: (bytes, _url, renderer) => {
      renderers.push(renderer);
      return Promise.resolve(scenes.get(bytes)!);
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
    store.prefetchAll();
    store.prefetchAll(); // repetido: no duplica
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
// descarga empieza en cuanto se conoce la clase, sin esperar al renderer, y el cargador (sus módulos y el transcodificador
// de KTX2) en cuanto hay manifiesto
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

describe('§1: el cargador empieza a bajar el transcodificador al crearse, sin renderer', () => {
  // KTX2Loader.init() baja basis_transcoder.js y .wasm (≈ 585 KB) y solo crea los workers al transcodificar; el renderer
  // hace falta para elegir el formato de GPU (detectSupport), antes del primer parse
  test('init() del KTX2Loader al crearlo y detectSupport con el renderer del primer parse, una sola vez', async () => {
    const init = jest.spyOn(KTX2Loader.prototype, 'init').mockResolvedValue(undefined);
    const detect = jest.spyOn(KTX2Loader.prototype, 'detectSupport').mockImplementation(function (this: KTX2Loader) {
      return this;
    });
    const loader = createGlbLoader();
    await settle();
    expect([init.mock.calls.length, detect.mock.calls.length]).toEqual([1, 0]);
    const bytes = writeGlb(buildShipAsset('sloop'));
    const buffer = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const scene = await loader.parse(buffer(), '/models/ship_sloop.glb', gl);
    await loader.parse(buffer(), '/models/ship_sloop.glb', gl);
    expect(detect.mock.calls).toEqual([[gl]]);
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

describe('§1: el transcodificador de KTX2 servido en public/basis', () => {
  test.each(['basis_transcoder.js', 'basis_transcoder.wasm'])('%s es el de three instalado (BASIS_PATH)', (file) => {
    const root = path.join(__dirname, '..', '..', '..', '..');
    const served = fs.readFileSync(path.join(root, 'public', 'basis', file));
    const three = fs.readFileSync(path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis', file));
    expect(served.equals(three)).toBe(true);
    expect(BASIS_PATH).toBe('/basis/');
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

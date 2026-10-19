// Barcos en GLB (ASSET-SPEC §13, paso 6; D80; AC-193): el .glb de una clase sustituye al procedural cuando termina de
// cargar. Mientras tanto, y si falla, se pinta el procedural. La entrada solo espera al GLB del barco propio, con un tope
// de 0,5 s sobre la de hoy (AC-193 c, opción B): si no llega a tiempo, se entra con el procedural y cambia al llegar.
// Con el respaldo de su textura (D90), el GLB se dibuja sin esperar al transcodificador y cambia a la KTX2 al llegar.
// El GLB cumple el mismo contrato que el procedural (§0–§4): raíz con extras, mallas <id>_lod0 y <id>_lod1 y sockets con
// nombre. Del material del GLB solo se usa la textura: el color, el destello, el daño y el borde de protección son los del
// material del barco, clonado por instancia (§6). La geometría y la textura se comparten entre los barcos de la clase
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { creaseNormals } from './geometry-utils';
import { getShipModel, LOD_PX, ShipExtras, ShipModel, ShipSockets } from './ship-geometry';

// Clase → URL del GLB (/models/<id>.<hash de su contenido>.glb, servido con caché de un año: next.config.ts). Vacío hasta el
// piloto: sin entrada, la clase usa el procedural y no se descarga nada
export const SHIP_GLB: Partial<Record<string, string>> = {};
// Transcodificador de KTX2 (basis_transcoder.js y .wasm, copiados de three/examples/jsm/libs/basis), en una carpeta con el
// hash de los dos: se sirve con caché de un año, y al subir three cambia de URL (lo comprueba ship-glb.test.ts)
export const BASIS_PATH = '/basis/dc5e5d6a/';
const CREASE = (40 * Math.PI) / 180; // D23: normales con pliegue de 40° si el GLB no trae NORMAL
// AC-193 c, opción B: lo más que la entrada espera al GLB del barco propio, sobre la de hoy (el primer frame)
export const OWN_GLB_WAIT_MS = 500;

export class ShipGlbError extends Error {}

const SOCKET = /^socket_(cannon_port|cannon_stbd|fire)_(\d{2})$/;
const NUMBER_KEYS = ['sb_length', 'sb_beam', 'sb_freeboard', 'sb_draft', 'sb_mast_height', 'sb_radius', 'sb_cannons_per_side'] as const;

function isIdentity(o: THREE.Object3D): boolean {
  return o.position.lengthSq() === 0 && o.quaternion.equals(new THREE.Quaternion()) && o.scale.equals(new THREE.Vector3(1, 1, 1));
}

// La raíz con los extras: la escena de GLTFLoader la envuelve en un grupo sin nombre
function rootOf(scene: THREE.Object3D): THREE.Object3D {
  if (typeof scene.userData.sb_id === 'string') return scene;
  if (scene.children.length !== 1) throw new ShipGlbError(`la escena tiene ${scene.children.length} nodos raíz; el contrato pide 1 (§3)`);
  return scene.children[0];
}

function extrasOf(root: THREE.Object3D, base: ShipModel): ShipExtras {
  const e = root.userData as Partial<ShipExtras>;
  if (e.sb_version !== 1) throw new ShipGlbError(`sb_version ${String(e.sb_version)}; se espera 1 (§4)`);
  if (typeof e.sb_id !== 'string' || root.name !== e.sb_id) throw new ShipGlbError(`la raíz «${root.name}» no se llama como su sb_id «${String(e.sb_id)}» (§3)`);
  for (const k of NUMBER_KEYS) if (typeof e[k] !== 'number' || !Number.isFinite(e[k])) throw new ShipGlbError(`falta ${k} en los extras (§4)`);
  if (!Array.isArray(e.sb_pick) || e.sb_pick.length !== 3) throw new ShipGlbError('falta sb_pick en los extras (§4)');
  if (!Array.isArray(e.sb_lod_px) || e.sb_lod_px[0] !== LOD_PX[0] || e.sb_lod_px[1] !== LOD_PX[1]) {
    throw new ShipGlbError(`sb_lod_px ${JSON.stringify(e.sb_lod_px)}; el juego usa ${JSON.stringify(LOD_PX)} (§7)`);
  }
  // La eslora del GLB es la de la clase (§8.4): con otra, la placa, el anillo y la selección no casarían con el casco
  if (Math.abs(e.sb_length! - base.recipe.L) > 0.01 * base.recipe.L) {
    throw new ShipGlbError(`sb_length ${e.sb_length} m y la clase ${base.classId} mide ${base.recipe.L} m (§8.4)`);
  }
  if (!isIdentity(root)) throw new ShipGlbError('la raíz no tiene el transform identidad (§3)');
  // Solo las claves sb_*: GLTFLoader añade a userData el nombre del nodo
  const extras = Object.fromEntries(Object.entries(e).filter(([k]) => k.startsWith('sb_'))) as unknown as ShipExtras;
  return { ...extras, sb_lod_px: LOD_PX };
}

// Un atributo cuantizado o entrelazado (meshopt) como Float32 con sus valores reales
function toFloat(geometry: THREE.BufferGeometry, name: string): void {
  const a = geometry.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!a || (!(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && a.array instanceof Float32Array)) return;
  const get = [a.getX, a.getY, a.getZ, a.getW];
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = get[k].call(a, i);
  geometry.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
}

function lodOf(root: THREE.Object3D, id: string, lod: 0 | 1): { geometry: THREE.BufferGeometry; map: THREE.Texture | null } {
  const name = `${id}_lod${lod}`;
  const mesh = root.children.find((c) => c.name === name) as THREE.Mesh | undefined;
  if (!mesh) throw new ShipGlbError(`falta la malla ${name}, hija de la raíz (§3)`);
  // GLTFLoader convierte una malla de varias primitivas en un grupo con una malla por primitiva
  const several = !mesh.isMesh ? mesh.children.some((c) => (c as THREE.Mesh).isMesh) : Array.isArray(mesh.material) || mesh.geometry.groups.length > 1;
  if (several) throw new ShipGlbError(`${name} tiene más de una primitiva o material (§0)`);
  if (!mesh.isMesh) throw new ShipGlbError(`${name} no es una malla (§3)`);
  const material = mesh.material as THREE.MeshStandardMaterial;
  if (material.transparent || material.alphaTest > 0) throw new ShipGlbError(`${name} no es OPAQUE (§1)`);
  let geometry = mesh.geometry;
  // Un nodo de LOD con transform se hornea en la geometría: la rotación de ejes o la escala del exportador, y la
  // descuantización de KHR_mesh_quantization (gltf-transform meshopt guarda la posición en enteros normalizados y deja en
  // el nodo la escala y el desplazamiento). Antes, la posición y la normal pasan a float: en enteros se recortarían a ±1
  mesh.updateMatrix();
  if (!isIdentity(mesh)) {
    for (const name of ['position', 'normal']) toFloat(geometry, name);
    geometry.applyMatrix4(mesh.matrix);
  }
  if (!geometry.getAttribute('normal')) {
    geometry = geometry.index ? geometry.toNonIndexed() : geometry;
    creaseNormals(geometry, CREASE);
  }
  // El material del barco usa vertexColors y COLOR_0 multiplica la textura (§13 paso 3: blanco en lo texturizado, el
  // color de la pieza en la jarcia y los cañones). Sin COLOR_0, blanco
  if (!geometry.getAttribute('color')) {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  }
  // Sin la máscara no hay borde de protección: el procedural sí lo tiene, así que el GLB no vale (ux, 2026-10-18)
  if (!geometry.getAttribute('_rim_mask')) throw new ShipGlbError(`${name} sin _RIM_MASK: sin borde de protección (§6, AS-V09)`);
  return { geometry, map: material.map ?? null };
}

function socketsOf(root: THREE.Object3D, cannons: number): ShipSockets {
  const one = (name: string) => {
    const o = root.children.find((c) => c.name === name);
    if (!o) throw new ShipGlbError(`falta ${name} (§3)`);
    return o.position.clone();
  };
  const numbered: Record<string, THREE.Vector3[]> = { cannon_port: [], cannon_stbd: [], fire: [] };
  for (const c of root.children) {
    const m = SOCKET.exec(c.name);
    if (m) numbered[m[1]][Number(m[2]) - 1] = c.position.clone();
  }
  for (const [kind, list] of Object.entries(numbered)) {
    const want = kind === 'fire' ? 3 : cannons;
    if (list.length !== want || list.some((p) => !p)) throw new ShipGlbError(`socket_${kind}_NN: ${list.filter(Boolean).length} de ${want}, del 01 seguidos (§3)`);
  }
  return {
    cannonsPort: numbered.cannon_port,
    cannonsStbd: numbered.cannon_stbd,
    smoke: one('socket_smoke'),
    fire: numbered.fire,
    label: one('socket_label'),
    wake: one('socket_wake'),
    bow: one('socket_bow')
  };
}

// El modelo de la clase con los LOD, los sockets, los extras y la textura del GLB. La receta (los números de la clase,
// §8.4) es la del procedural: el juego no cambia (AC-193 a). Lanza ShipGlbError si el GLB incumple el contrato
export function shipModelFromGlb(scene: THREE.Object3D, classId: string): ShipModel {
  const base = getShipModel(classId);
  const root = rootOf(scene);
  const extras = extrasOf(root, base);
  const lod0 = lodOf(root, extras.sb_id, 0);
  const lod1 = lodOf(root, extras.sb_id, 1);
  if (lod1.map && lod0.map?.source !== lod1.map.source) throw new ShipGlbError('los LOD usan texturas distintas; el contrato pide 1 atlas (§6)');
  const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  return {
    classId: base.classId,
    recipe: base.recipe,
    lods: [lod0.geometry, lod1.geometry],
    triangles: [tris(lod0.geometry), tris(lod1.geometry)],
    hullBox: base.hullBox,
    sails: [[], []], // los rangos de vela y de tabla son del procedural (AS-V14, AS-V22)
    decks: [[], []],
    extras,
    sockets: socketsOf(root, extras.sb_cannons_per_side),
    map: lod0.map
  };
}

// Libera lo que GLTFLoader creó para un GLB que no se usa (o del que solo se queda la textura)
function disposeScene(scene: THREE.Object3D, keep: THREE.Texture | null = null): void {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of ([] as THREE.Material[]).concat(mesh.material)) {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map && map !== keep) map.dispose();
      m.dispose();
    }
  });
}

// Una textura KTX2 con su respaldo (D90): el respaldo, que es el mapa del modelo al leerlo, y la KTX2 que lo sustituye
// cuando el transcodificador la entrega (null si no se pudo leer)
export type TextureUpgrade = [fallback: THREE.Texture | null, ktx2: THREE.Texture | null];

export interface ParsedGlb {
  scene: THREE.Object3D;
  upgrades: Promise<TextureUpgrade[]>; // vacío si ninguna textura lleva respaldo
}

export interface GlbLoader {
  parse(bytes: ArrayBuffer, url: string, renderer: THREE.WebGLRenderer): Promise<ParsedGlb>;
  dispose(): void;
}

// GLTFLoader con MeshoptDecoder, KTX2Loader y el plugin del respaldo (§1; basisu-fallback.ts). Se importan al crear el
// cargador, que es al haber un GLB que bajar: sin GLB, el bundle del juego no los lleva. El transcodificador de KTX2 (basis_transcoder.js y
// .wasm, ≈ 585 KB) no baja al crearlo: con respaldo lo pide el plugin en el parse del GLB propio, a la vez que su KTX2
// (también si va en su .ktx2 aparte, §13 paso 4c), así que no compite con su descarga (salida 1 de AC-193 c); sin respaldo,
// la primera KTX2 (KTX2Loader.load llama a init al tenerla). detectSupport elige el formato de GPU
// con el renderer del primer parse, antes de cualquier KTX2
export function createGlbLoader(): GlbLoader {
  let ktx2: { dispose(): void } | null = null;
  let detected = false;
  const modules = Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/KTX2Loader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    import('./basisu-fallback')
  ]).then(([{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }, { basisuWithFallback }]) => {
    const k = new KTX2Loader().setTranscoderPath(BASIS_PATH);
    ktx2 = k;
    return { GLTFLoader, MeshoptDecoder, basisuWithFallback, ktx2: k };
  });
  return {
    parse: (bytes, url, renderer) =>
      modules.then(async (m) => {
        if (!detected) m.ktx2.detectSupport(renderer);
        detected = true;
        const basisu = m.basisuWithFallback(m.ktx2);
        const gltf: GLTF = await new m.GLTFLoader().setMeshoptDecoder(m.MeshoptDecoder).register(basisu.register).parseAsync(bytes, THREE.LoaderUtils.extractUrlBase(url));
        return { scene: gltf.scene, upgrades: basisu.upgrades() };
      }),
    dispose: () => ktx2?.dispose()
  };
}

// La descarga de un GLB, aparte del parse: así la del barco propio empieza antes de que haya renderer
export function fetchGlb(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  return fetch(url, signal ? { signal } : undefined).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.arrayBuffer();
  });
}

// Los GLB de las clases: se cargan de uno en uno, el del barco propio primero y, detrás, todos los del manifiesto en
// segundo plano (AC-193 c). model() devuelve el GLB si ya está y, si no, el procedural. La descarga del propio y el
// cargador arrancan antes que la cola, sin renderer, porque la entrada los espera (opción B)
export class ShipGlbStore {
  private readonly manifest: Partial<Record<string, string>>;
  private readonly ready = new Map<string, ShipModel>();
  private readonly failed = new Set<string>();
  private readonly queue: string[] = [];
  private readonly early = new Map<string, Promise<ArrayBuffer>>(); // descargas del propio que el pump aún no tomó
  private predicted: { classId: string; abort: AbortController | null } | null = null; // opción A: la clase propia predicha
  private ownKnown = false; // ya llegó la clase real del barco propio
  private loading: string | null = null;
  private loader: GlbLoader | null = null;
  private disposed = false;

  constructor(
    manifest: Partial<Record<string, string>> = SHIP_GLB,
    private readonly makeLoader: () => GlbLoader = createGlbLoader,
    private readonly fetchBytes: (url: string, signal?: AbortSignal) => Promise<ArrayBuffer> = fetchGlb
  ) {
    this.manifest = { ...manifest };
  }

  model(classId: string): ShipModel {
    return this.ready.get(classId) ?? getShipModel(classId);
  }

  loaded(classId: string): boolean {
    return this.ready.has(classId);
  }

  // Si la entrada tiene que esperar al GLB del barco propio (AC-193 c, opción B): con manifiesto, mientras no se conozca
  // su clase (null) o su GLB no haya llegado ni fallado. Sin manifiesto, nunca: se entra como hoy
  waiting(classId: string | null): boolean {
    if (!Object.values(this.manifest).some(Boolean)) return false;
    if (classId === null) return true;
    return !!this.manifest[classId] && !this.ready.has(classId) && !this.failed.has(classId);
  }

  // Con manifiesto, crea ya el cargador: sus módulos empiezan a bajar (lo llama el runtime al crearse, antes de conectar).
  // El transcodificador de KTX2 no: lo pide la primera KTX2 (createGlbLoader)
  warm(): void {
    if (!this.disposed && !this.loader && Object.values(this.manifest).some(Boolean)) this.loader = this.makeLoader();
  }

  // Opción A de AC-193 c (BACKLOG :1745): antes de la bienvenida, el GLB de la clase propia predicha (la última del
  // jugador en este navegador o, si no hay, la de salida) empieza a bajar ya, y antes que el cargador, que también hace
  // falta para el primer frame con el modelo. Solo GLB del manifiesto: si la clase aún no tiene URL, la descarga empieza
  // al tenerla (setUrl), mientras no llegue la clase real. Si la real es otra, request() la aborta
  predictOwn(classId: string): void {
    if (this.disposed || this.ownKnown) return;
    this.predicted = { classId, abort: null };
    this.startPredicted();
    this.warm();
  }

  private startPredicted(): void {
    const p = this.predicted;
    const url = p ? this.manifest[p.classId] : undefined;
    if (!p || !url || p.abort || this.ready.has(p.classId) || this.failed.has(p.classId) || this.early.has(p.classId)) return;
    p.abort = new AbortController();
    const bytes = this.fetchBytes(url, p.abort.signal);
    bytes.catch(() => undefined); // un fallo lo recoge el pump, con su aviso; un aborto, nadie
    this.early.set(p.classId, bytes);
  }

  // Llega la clase real del barco propio: si la predicha era otra y ya bajaba, se aborta para que no compita con la buena.
  // Su clase sigue en el manifiesto: prefetchAll la vuelve a pedir, desde cero
  private settlePrediction(classId: string): void {
    this.ownKnown = true;
    const p = this.predicted;
    this.predicted = null;
    if (!p || p.classId === classId || !p.abort) return;
    p.abort.abort();
    this.early.delete(p.classId);
  }

  // Sin GLB en el manifiesto, ya cargado, en carga o fallido: no hace nada. `first` (el barco propio) lo pone el primero
  // de la cola y empieza ya su descarga y el cargador, aunque aún no haya renderer
  request(classId: string, first = false): void {
    if (first && !this.ownKnown) this.settlePrediction(classId);
    const url = this.manifest[classId];
    if (!url || this.ready.has(classId) || this.failed.has(classId) || this.loading === classId) return;
    if (first && !this.early.has(classId) && !this.disposed) {
      const bytes = this.fetchBytes(url);
      bytes.catch(() => undefined); // el fallo lo recoge el pump, con su aviso
      this.early.set(classId, bytes);
      this.warm();
    }
    const at = this.queue.indexOf(classId);
    if (at === 0 || (at > 0 && !first)) return;
    if (at > 0) this.queue.splice(at, 1);
    if (first) this.queue.unshift(classId);
    else this.queue.push(classId);
  }

  // Encola detrás de lo pedido todas las clases del manifiesto: al entrar, el propio va el primero y los demás se descargan
  // en segundo plano, sin esperar a que un barco de su clase entre en el área de interés (AC-193 c)
  prefetchAll(): void {
    for (const classId of Object.keys(this.manifest)) this.request(classId);
  }

  // Cambia el GLB de una clase (vista previa de ux y e2e): vuelve a cargarse la próxima vez que se pida
  setUrl(classId: string, url: string): void {
    this.manifest[classId] = url;
    this.failed.delete(classId);
    this.early.delete(classId);
    const old = this.ready.get(classId);
    if (old) this.release(old);
    this.ready.delete(classId);
    if (this.predicted?.classId === classId) {
      this.predicted.abort?.abort();
      this.predicted.abort = null;
      this.startPredicted();
      this.warm();
    }
  }

  // Lanza la siguiente carga si no hay otra en curso. Se llama en cada frame, que es cuando ya hay renderer
  pump(renderer: THREE.WebGLRenderer): void {
    if (this.disposed || this.loading || this.queue.length === 0) return;
    const loader = (this.loader ??= this.makeLoader());
    const classId = this.queue.shift()!;
    const url = this.manifest[classId]!;
    const bytes = this.early.get(classId) ?? this.fetchBytes(url);
    this.early.delete(classId);
    this.loading = classId;
    bytes
      .then((b) => loader.parse(b, url, renderer))
      .then(({ scene, upgrades }) => {
        let model: ShipModel;
        try {
          model = shipModelFromGlb(scene, classId);
        } catch (e) {
          disposeScene(scene);
          this.upgrade(classId, url, null, upgrades);
          throw e;
        }
        disposeScene(scene, model.map ?? null);
        if (this.disposed || this.manifest[classId] !== url) this.release(model);
        else this.ready.set(classId, model);
        this.upgrade(classId, url, model, upgrades);
      })
      .catch((e: Error) => {
        if (this.manifest[classId] === url) this.failed.add(classId);
        console.warn(`[ship-glb] ${classId} (${url}): ${e.message}; se queda el procedural`);
      })
      .finally(() => {
        this.loading = null;
      });
  }

  // Salida 1 de AC-193 c (D90): al llegar la KTX2 del respaldo, la clase pasa a un modelo nuevo con ella, que updateShips
  // (runtime.ts) pone en las vistas porque compara por identidad, y el respaldo se libera. La KTX2 toma el colorSpace y el
  // canal del respaldo: el programa no cambia (del mapa solo cuentan que exista, su canal y si es vídeo, WebGLPrograms.js
  // :205, :261 y :343). Si la KTX2 falla se queda el respaldo; si el modelo ya no está (otro GLB, dispose o el contrato
  // incumplido), la KTX2 se libera sin ponerla
  private upgrade(classId: string, url: string, model: ShipModel | null, upgrades: Promise<TextureUpgrade[]>): void {
    void upgrades.then((pairs) => {
      const current = !!model && !this.disposed && this.ready.get(classId) === model;
      for (const [fallback, ktx2] of pairs) {
        if (!current || fallback !== (model!.map ?? null)) {
          ktx2?.dispose();
          continue;
        }
        if (!ktx2) {
          console.warn(`[ship-glb] ${classId} (${url}): la KTX2 no llegó; se queda el respaldo`);
          continue;
        }
        if (fallback) {
          ktx2.colorSpace = fallback.colorSpace;
          ktx2.channel = fallback.channel;
        }
        this.ready.set(classId, { ...model!, map: ktx2 });
        fallback?.dispose();
      }
    });
  }

  private release(model: ShipModel): void {
    for (const g of model.lods) g.dispose();
    model.map?.dispose();
  }

  dispose(): void {
    this.disposed = true;
    for (const m of this.ready.values()) this.release(m);
    this.ready.clear();
    this.queue.length = 0;
    this.predicted?.abort?.abort();
    this.predicted = null;
    this.early.clear();
    this.loader?.dispose();
  }
}

// La entrada al juego (AC-193 c, opción B). Hoy el juego se muestra en el primer frame; si la entrada espera al GLB del
// barco propio, se muestra en el primer frame en que llega o falla, o en el primero que pasa del tope. update() va en cada
// frame hasta abrirse y devuelve true solo en ese frame. lastWaitAt (el último frame que esperó) deja comprobar en el e2e
// que se abrió en el primer frame posible
export class EntryGate {
  waitMs = OWN_GLB_WAIT_MS; // el tope; el e2e lo alarga cuando prueba la espera, porque un frame de SwiftShader pasa de 0,5 s
  firstFrameAt = 0;
  lastWaitAt = 0;
  shownAt = 0;
  withGlb = false; // el barco propio entró ya con su GLB
  capped = false; // se abrió por el tope, con el procedural

  update(now: number, waiting: boolean, loaded: boolean): boolean {
    if (this.shownAt) return false;
    if (!this.firstFrameAt) this.firstFrameAt = now;
    const capped = now - this.firstFrameAt >= this.waitMs;
    if (waiting && !capped) {
      this.lastWaitAt = now;
      return false;
    }
    this.shownAt = now;
    this.withGlb = loaded;
    this.capped = waiting;
    return true;
  }
}

// La textura del GLB en el material del barco (clonado por instancia). Poner o quitar el mapa cambia el programa de
// shader (USE_MAP); cambiar de textura, no
export function setShipMap(material: THREE.MeshStandardMaterial, map: THREE.Texture | null): void {
  if (material.map === map) return;
  if (!material.map !== !map) material.needsUpdate = true;
  material.map = map;
}

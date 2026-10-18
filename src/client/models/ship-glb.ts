// Barcos en GLB (ASSET-SPEC §13, paso 6; D80; AC-193): el .glb de una clase sustituye al procedural cuando termina de
// cargar. Mientras tanto, y si falla, se pinta el procedural, así que entrar al juego nunca espera a un modelo (AC-193 c).
// El GLB cumple el mismo contrato que el procedural (§0–§4): raíz con extras, mallas <id>_lod0 y <id>_lod1 y sockets con
// nombre. Del material del GLB solo se usa la textura: el color, el destello, el daño y el borde de protección son los del
// material del barco, clonado por instancia (§6). La geometría y la textura se comparten entre los barcos de la clase
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { creaseNormals } from './geometry-utils';
import { getShipModel, LOD_PX, ShipExtras, ShipModel, ShipSockets } from './ship-geometry';

// Clase → URL del GLB (public/models/<id>.glb, con hash en el nombre para cachearlo). Vacío hasta el piloto: sin entrada,
// la clase usa el procedural y no se descarga nada
export const SHIP_GLB: Partial<Record<string, string>> = {};
// Transcodificador de KTX2 (basis_transcoder.js y .wasm, copiados de three/examples/jsm/libs/basis a public/basis)
export const BASIS_PATH = '/basis/';
const CREASE = (40 * Math.PI) / 180; // D23: normales con pliegue de 40° si el GLB no trae NORMAL

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

function lodOf(root: THREE.Object3D, id: string, lod: 0 | 1, warn: string[]): { geometry: THREE.BufferGeometry; map: THREE.Texture | null } {
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
  // El material del barco usa vertexColors: sin COLOR_0, blanco (el color va en la textura, §13 paso 3)
  if (!geometry.getAttribute('color')) {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  }
  if (!geometry.getAttribute('_rim_mask')) warn.push(`${name} sin _RIM_MASK: sin borde de protección (§6)`);
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
export function shipModelFromGlb(scene: THREE.Object3D, classId: string, warn: string[] = []): ShipModel {
  const base = getShipModel(classId);
  const root = rootOf(scene);
  const extras = extrasOf(root, base);
  const lod0 = lodOf(root, extras.sb_id, 0, warn);
  const lod1 = lodOf(root, extras.sb_id, 1, warn);
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

export interface GlbLoader {
  load(url: string): Promise<THREE.Object3D>;
  dispose(): void;
}

// GLTFLoader con MeshoptDecoder y KTX2Loader (§1). Se importan al pedir el primer GLB: sin GLB, el bundle del juego no
// los lleva. KTX2Loader necesita el renderer para elegir el formato de GPU al que transcodifica
export function createGlbLoader(renderer: THREE.WebGLRenderer): GlbLoader {
  let ktx2: { dispose(): void } | null = null;
  const loader = Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/KTX2Loader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js')
  ]).then(([{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }]) => {
    const k = new KTX2Loader().setTranscoderPath(BASIS_PATH).detectSupport(renderer);
    ktx2 = k;
    return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(k);
  });
  return {
    load: (url) => loader.then((l) => l.loadAsync(url)).then((gltf: GLTF) => gltf.scene),
    dispose: () => ktx2?.dispose()
  };
}

// Los GLB de las clases: se piden al crear la vista de un barco y se cargan de uno en uno, el propio primero (AC-193 c:
// después los demás, a medida que entran en el área de interés). model() devuelve el GLB si ya está y, si no, el procedural
export class ShipGlbStore {
  private readonly manifest: Partial<Record<string, string>>;
  private readonly ready = new Map<string, ShipModel>();
  private readonly failed = new Set<string>();
  private readonly queue: string[] = [];
  private loading: string | null = null;
  private loader: GlbLoader | null = null;
  private disposed = false;

  constructor(
    manifest: Partial<Record<string, string>> = SHIP_GLB,
    private readonly makeLoader: (renderer: THREE.WebGLRenderer) => GlbLoader = createGlbLoader
  ) {
    this.manifest = { ...manifest };
  }

  model(classId: string): ShipModel {
    return this.ready.get(classId) ?? getShipModel(classId);
  }

  // Sin GLB en el manifiesto, ya cargado, en carga o fallido: no hace nada. `first` lo pone el primero de la cola
  request(classId: string, first = false): void {
    if (!this.manifest[classId] || this.ready.has(classId) || this.failed.has(classId) || this.loading === classId) return;
    const at = this.queue.indexOf(classId);
    if (at === 0 || (at > 0 && !first)) return;
    if (at > 0) this.queue.splice(at, 1);
    if (first) this.queue.unshift(classId);
    else this.queue.push(classId);
  }

  // Cambia el GLB de una clase (vista previa de ux y e2e): vuelve a cargarse la próxima vez que se pida
  setUrl(classId: string, url: string): void {
    this.manifest[classId] = url;
    this.failed.delete(classId);
    const old = this.ready.get(classId);
    if (old) this.release(old);
    this.ready.delete(classId);
  }

  // Lanza la siguiente carga si no hay otra en curso. Se llama en cada frame, que es cuando ya hay renderer
  pump(renderer: THREE.WebGLRenderer): void {
    if (this.disposed || this.loading || this.queue.length === 0) return;
    this.loader ??= this.makeLoader(renderer);
    const classId = this.queue.shift()!;
    const url = this.manifest[classId]!;
    this.loading = classId;
    this.loader
      .load(url)
      .then((scene) => {
        const warn: string[] = [];
        let model: ShipModel;
        try {
          model = shipModelFromGlb(scene, classId, warn);
        } catch (e) {
          disposeScene(scene);
          throw e;
        }
        disposeScene(scene, model.map ?? null);
        for (const w of warn) console.warn(`[ship-glb] ${classId}: ${w}`);
        if (this.disposed || this.manifest[classId] !== url) this.release(model);
        else this.ready.set(classId, model);
      })
      .catch((e: Error) => {
        if (this.manifest[classId] === url) this.failed.add(classId);
        console.warn(`[ship-glb] ${classId} (${url}): ${e.message}; se queda el procedural`);
      })
      .finally(() => {
        this.loading = null;
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
    this.loader?.dispose();
  }
}

// La textura del GLB en el material del barco (clonado por instancia). Poner o quitar el mapa cambia el programa de
// shader (USE_MAP); cambiar de textura, no
export function setShipMap(material: THREE.MeshStandardMaterial, map: THREE.Texture | null): void {
  if (material.map === map) return;
  if (!material.map !== !map) material.needsUpdate = true;
  material.map = map;
}

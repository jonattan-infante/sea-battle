// Islas del mapa nuevo en GLB (AC-198; ASSET-SPEC §9.7): un solo islands.glb con una raíz island_<id> por isla, cada una con
// su posición en el mundo, su malla y sus círculos (`sb_circles`). Baja en segundo plano después del barco propio, y desde la
// 1.2 se pintan sus 15 raíces (AC-210 b; el piloto C1 pintaba solo I1). Lo que no sea una de ellas se libera sin subirlo a la
// GPU (AC-198 c). Una raíz solo entra si sus círculos son los de la bienvenida del servidor (AC-199 e): lo que se ve es lo
// que choca. Si no cuadra, o falta, se queda la versión sencilla de su forma y lo dice la consola. Comparte con los barcos el
// cargador (un solo KTX2Loader y un solo transcodificador) y el respaldo de la textura (D90): se pinta con el respaldo y
// cambia a la KTX2 al llegar
import * as THREE from 'three';
import type { IslandDef } from '../../game/constants';
import { fetchGlb, GlbLoader, TextureUpgrade } from './ship-glb';

// /models/<id>.<hash de su contenido>.glb, con su islands_atlas.<hash>.ktx2 aparte (paso 4c, scripts/glb/stage-model.ts),
// desde la entrega A1 de ux (ASSET-SPEC §9.7, sha256 1b8aa368… con la KTX2 dentro)
export const ISLANDS_GLB = '/models/islands.31481120.glb';
// Las 15 raíces de islands.glb (AC-210 b): los 3 escollos, las 4 calas, las 6 islas de la 1.0 y las 2 nuevas. El nombre
// viene del piloto (C1), cuando solo iba I1; lo leen los tests y las sondas de QA
export const PILOT_ROOTS: readonly string[] = [
  'island_E1a',
  'island_E1b',
  'island_E1c',
  'island_G1',
  'island_G2',
  'island_G3',
  'island_G4',
  'island_I1',
  'island_I2',
  'island_I3',
  'island_I4',
  'island_I5',
  'island_I6',
  'island_T1',
  'island_T2'
];
// El puerto de D92 (ASSET-SPEC §9.8): un archivo con su raíz island_port, el mismo cargador y el mismo paso 4c, con la KTX2
// aparte (island_port_atlas.<hash>.ktx2). Sus 7 sb_circles son los PORT.k de la bienvenida
export const PORT_GLB = '/models/island_port.64aadaf2.glb';
export const PORT_ROOTS: readonly string[] = ['island_port'];

// La forma del mapa de cada raíz: island_<id> → <id>, salvo el puerto, cuyos círculos llegan como PORT.k (constants.ts). Un
// mapa explícito, y no mayúsculas, porque hay formas con minúsculas (E1a)
const ROOT_SHAPE: Record<string, string> = { island_port: 'PORT' };
export const shapeOfRoot = (sbId: string): string => ROOT_SHAPE[sbId] ?? sbId.replace(/^island_/, '');

export type Circle = [x: number, z: number, radius: number];

export interface IslandModel {
  shape: string; // la forma del mapa: «I1»
  sbId: string; // la raíz del GLB: «island_I1»
  circles: Circle[];
  root: THREE.Object3D;
}

// El id de forma de un círculo de la bienvenida: mapOf (constants.ts) los llama <forma>.<k> si la forma tiene varios
export const shapeOf = (circleId: string): string => circleId.split('.')[0];

export function serverShapes(islands: readonly IslandDef[]): Map<string, Circle[]> {
  const out = new Map<string, Circle[]>();
  for (const c of islands) {
    const key = shapeOf(c.id);
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push([c.x, c.z, c.radius]);
  }
  return out;
}

// Los mismos círculos, en cualquier orden, a ≤ 1 mm (el GLB los guarda en float de JSON y el servidor en sus constantes)
export function sameCircles(a: readonly Circle[], b: readonly Circle[], eps = 1e-3): boolean {
  if (a.length !== b.length) return false;
  const sort = (l: readonly Circle[]) => [...l].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  const [sa, sb] = [sort(a), sort(b)];
  return sa.every((c, i) => c.every((v, k) => Math.abs(v - sb[i][k]) <= eps));
}

// Las raíces pedidas de la escena de islands.glb (GLTFLoader deja los extras en userData). Las saca de la escena
export function takeRoots(scene: THREE.Object3D, wanted: readonly string[]): { models: IslandModel[]; problems: string[] } {
  const models: IslandModel[] = [];
  const problems: string[] = [];
  for (const root of [...scene.children]) {
    const { sb_id: sbId, sb_circles: circles } = root.userData as { sb_id?: unknown; sb_circles?: unknown };
    if (typeof sbId !== 'string' || !wanted.includes(sbId)) continue;
    if (!Array.isArray(circles) || !circles.length || !circles.every((c) => Array.isArray(c) && c.length === 3 && c.every((v) => typeof v === 'number'))) {
      problems.push(`${sbId}: sin sb_circles válidos`);
      continue;
    }
    scene.remove(root);
    models.push({ shape: shapeOfRoot(sbId), sbId, circles: circles as Circle[], root });
  }
  for (const id of wanted) if (!models.some((m) => m.sbId === id) && !problems.some((p) => p.startsWith(`${id}:`))) problems.push(`${id}: no está en el GLB`);
  return { models, problems };
}

function materialsOf(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const out = new Set<THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) for (const x of Array.isArray(m) ? m : [m]) out.add(x as THREE.MeshStandardMaterial);
  });
  return [...out];
}

// Libera las geometrías de lo que no se usa. Los materiales y la textura los comparten todas las raíces: se liberan con las
// que se quedan (disposeIsland), o aquí si no se queda ninguna
function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}

export function disposeIsland(root: THREE.Object3D): void {
  disposeGeometries(root);
  for (const m of materialsOf(root)) {
    m.map?.dispose();
    m.dispose();
  }
}

export class IslandGlbStore {
  private state: 'idle' | 'wanted' | 'loading' | 'done' = 'idle';
  private ready: IslandModel[] = [];
  private readonly kept: IslandModel[] = [];
  private disposed = false;

  constructor(
    private readonly loader: () => GlbLoader,
    private readonly url: string = ISLANDS_GLB,
    private readonly roots: readonly string[] = PILOT_ROOTS,
    private readonly fetchBytes: (url: string, signal?: AbortSignal) => Promise<ArrayBuffer> = fetchGlb
  ) {}

  // El mapa nuevo está en la bienvenida: el GLB bajará en el próximo pump (después de la entrada, lo decide el runtime)
  request(): void {
    if (this.state === 'idle' && this.url && this.roots.length) this.state = 'wanted';
  }

  get loading(): boolean {
    return this.state === 'loading';
  }

  // Pedido y sin terminar (ni llegado ni fallado): la entrada espera al puerto mientras tanto (AC-200 e)
  get waiting(): boolean {
    return this.state === 'wanted' || this.state === 'loading';
  }

  pump(renderer: THREE.WebGLRenderer): void {
    if (this.disposed || this.state !== 'wanted') return;
    this.state = 'loading';
    const loader = this.loader();
    this.fetchBytes(this.url)
      .then((bytes) => loader.parse(bytes, this.url, renderer))
      .then(({ scene, upgrades }) => {
        const { models, problems } = takeRoots(scene, this.roots);
        for (const p of problems) console.warn(`[island-glb] ${this.url}: ${p}`);
        if (this.disposed || !models.length) {
          disposeGeometries(scene);
          for (const m of models) disposeIsland(m.root);
          if (!models.length) for (const m of materialsOf(scene)) m.map?.dispose(), m.dispose();
          void upgrades.then((pairs) => pairs.forEach(([, k]) => k?.dispose()));
          return;
        }
        disposeGeometries(scene); // lo que quede en la escena y no sea una de las raíces pedidas
        this.ready.push(...models);
        this.kept.push(...models);
        this.upgrade(models, upgrades);
      })
      .catch((e: Error) => console.warn(`[island-glb] ${this.url}: ${e.message}; se quedan las islas sencillas`))
      .finally(() => {
        this.state = 'done';
      });
  }

  // Las raíces que llegaron desde la última llamada: el runtime comprueba sus círculos y las pone
  take(): IslandModel[] {
    const out = this.ready;
    this.ready = [];
    return out;
  }

  // D90: al llegar la KTX2, sustituye al respaldo en los materiales de las raíces que se quedan. Si no llega, el respaldo
  private upgrade(models: IslandModel[], upgrades: Promise<TextureUpgrade[]>): void {
    void upgrades.then((pairs) => {
      const materials = models.flatMap((m) => materialsOf(m.root));
      for (const [fallback, ktx2] of pairs) {
        const users = materials.filter((m) => m.map === fallback);
        if (this.disposed || !fallback || !ktx2 || !users.length) {
          if (!ktx2 && users.length && !this.disposed) console.warn(`[island-glb] ${this.url}: la KTX2 no llegó; se queda el respaldo`);
          ktx2?.dispose();
          continue;
        }
        ktx2.colorSpace = fallback.colorSpace;
        ktx2.channel = fallback.channel;
        for (const m of users) m.map = ktx2;
        fallback.dispose();
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    this.ready = [];
    for (const m of this.kept) disposeIsland(m.root);
    this.kept.length = 0;
  }
}

// Rutas que esquivan islas (§6): grafo de visibilidad con nodos en anillos alrededor de cada isla,
// inflados por el margen de navegación del barco (`clearance` = L/2 + 2, desde el borde de la isla),
// y A* sobre ese grafo (~100 nodos frente a 40 000 celdas de rejilla).
import { IslandDef, NAV_LIMIT, NAV_NODE_SLACK } from './constants';
import { Vec2, distance } from './vec';

const NODES_PER_ISLAND = 16;
const EPS = 1e-3;
const PUSH_OUT = 0.05; // lo que el punto navegable más cercano queda por fuera del margen, para que el redondeo no lo meta

interface Graph {
  nodes: Vec2[];
  edges: number[][]; // adyacencia entre nodos (índices)
}

// Distancia mínima entre el segmento ab y el punto c
export function segmentPointDistance(a: Vec2, b: Vec2, c: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((c.x - a.x) * abx + (c.z - a.z) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + abx * t - c.x, a.z + abz * t - c.z);
}

export class Navigator {
  private readonly graphs = new Map<number, Graph>();
  private readonly crossings = new Map<number, Vec2[]>();

  constructor(private readonly islands: IslandDef[]) {}

  // Libre si el segmento no entra en ninguna isla inflada por `clearance`
  segmentClear(a: Vec2, b: Vec2, clearance: number): boolean {
    for (const island of this.islands) {
      if (segmentPointDistance(a, b, { x: island.x, z: island.z }) < island.radius + clearance - EPS) return false;
    }
    return true;
  }

  // Distancia del punto al borde de la isla más cercana
  edgeClearance(p: Vec2): number {
    let min = Infinity;
    for (const island of this.islands) min = Math.min(min, Math.hypot(p.x - island.x, p.z - island.z) - island.radius);
    return min;
  }

  // Fuera de todas las islas infladas por `clearance` y dentro del límite
  private navigable(p: Vec2, clearance: number): boolean {
    if (Math.abs(p.x) > NAV_LIMIT || Math.abs(p.z) > NAV_LIMIT) return false;
    return this.islands.every((island) => Math.hypot(p.x - island.x, p.z - island.z) >= island.radius + clearance);
  }

  // Punto navegable más cercano: fuera de las islas infladas y dentro del límite (§4, AC-18, AC-21). Está en el borde de
  // la unión de las islas infladas: es la proyección sobre una de ellas o, donde dos se solapan (las rocas de los
  // escollos, AC-172), uno de sus cruces. Empujar fuera de cada isla por turnos rebotaba entre las que se solapan y podía
  // dejar el punto dentro. Supone que ninguna isla inflada pasa del límite, así que ningún tramo del borde es el del mapa
  nearestNavigable(p: Vec2, clearance: number): Vec2 {
    const q = { x: Math.max(-NAV_LIMIT, Math.min(NAV_LIMIT, p.x)), z: Math.max(-NAV_LIMIT, Math.min(NAV_LIMIT, p.z)) };
    if (this.navigable(q, clearance)) return q;
    let best = q;
    let bestD = Infinity;
    const consider = (c: Vec2) => {
      const d = distance(q, c);
      if (d < bestD && this.navigable(c, clearance)) {
        best = c;
        bestD = d;
      }
    };
    for (const island of this.islands) {
      const r = island.radius + clearance + PUSH_OUT;
      const d = Math.hypot(q.x - island.x, q.z - island.z);
      const nx = d > EPS ? (q.x - island.x) / d : 1;
      const nz = d > EPS ? (q.z - island.z) / d : 0;
      consider({ x: island.x + nx * r, z: island.z + nz * r });
    }
    for (const c of this.crossingsFor(clearance)) consider(c);
    return best;
  }

  // Cruces de cada par de islas infladas que se solapan, sin los que caen dentro de una tercera: los vértices del borde
  // de la unión. No dependen del punto, así que se calculan una vez por margen, como los grafos
  private crossingsFor(clearance: number): Vec2[] {
    let points = this.crossings.get(clearance);
    if (points) return points;
    points = [];
    for (let i = 0; i < this.islands.length; i++) {
      for (let j = i + 1; j < this.islands.length; j++) {
        const a = this.islands[i];
        const b = this.islands[j];
        const ra = a.radius + clearance + PUSH_OUT;
        const rb = b.radius + clearance + PUSH_OUT;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d >= ra + rb || d <= Math.abs(ra - rb)) continue; // no se tocan, o una contiene a la otra
        const along = (d * d + ra * ra - rb * rb) / (2 * d); // de a al pie de la cuerda común
        const half = Math.sqrt(ra * ra - along * along);
        const ux = (b.x - a.x) / d;
        const uz = (b.z - a.z) / d;
        const mx = a.x + ux * along;
        const mz = a.z + uz * along;
        points.push({ x: mx - uz * half, z: mz + ux * half }, { x: mx + uz * half, z: mz - ux * half });
      }
    }
    points = points.filter((c) => this.navigable(c, clearance));
    this.crossings.set(clearance, points);
    return points;
  }

  private graphFor(clearance: number): Graph {
    let graph = this.graphs.get(clearance);
    if (graph) return graph;
    const nodes: Vec2[] = [];
    for (const island of this.islands) {
      // El polígono inscrito de nodos deja sus lados a ≥ radio + margen + holgura del centro
      const r = (island.radius + clearance + NAV_NODE_SLACK) / Math.cos(Math.PI / NODES_PER_ISLAND);
      for (let i = 0; i < NODES_PER_ISLAND; i++) {
        const a = (i / NODES_PER_ISLAND) * Math.PI * 2;
        const n = { x: island.x + Math.cos(a) * r, z: island.z + Math.sin(a) * r };
        if (Math.abs(n.x) > NAV_LIMIT || Math.abs(n.z) > NAV_LIMIT) continue;
        if (!this.islands.every((o) => Math.hypot(n.x - o.x, n.z - o.z) >= o.radius + clearance)) continue;
        nodes.push(n);
      }
    }
    const edges: number[][] = nodes.map(() => []);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (this.segmentClear(nodes[i], nodes[j], clearance)) {
          edges[i].push(j);
          edges[j].push(i);
        }
      }
    }
    graph = { nodes, edges };
    this.graphs.set(clearance, graph);
    return graph;
  }

  // Waypoints desde `from` (excluido) hasta `to` (incluido)
  findPath(from: Vec2, to: Vec2, clearance: number): Vec2[] {
    // Si el barco ya está dentro de la zona inflada (p. ej., tras un empuje físico), los tramos desde el
    // origen solo pueden mantener o aumentar su distancia actual a la isla, nunca acercarse más
    const startClear = Math.min(clearance, Math.max(0, this.edgeClearance(from) - EPS));
    if (this.segmentClear(from, to, startClear)) return [to];
    const { nodes, edges } = this.graphFor(clearance);
    const n = nodes.length;
    const START = n;
    const GOAL = n + 1;
    const pos = (i: number) => (i === START ? from : i === GOAL ? to : nodes[i]);
    const startLinks: number[] = [];
    const goalLinks = new Set<number>();
    for (let i = 0; i < n; i++) {
      if (this.segmentClear(from, nodes[i], startClear)) startLinks.push(i);
      if (this.segmentClear(nodes[i], to, clearance)) goalLinks.add(i);
    }

    const g = new Float64Array(n + 2).fill(Infinity);
    const f = new Float64Array(n + 2).fill(Infinity);
    const came = new Int32Array(n + 2).fill(-1);
    const closed = new Uint8Array(n + 2);
    const open: number[] = [START];
    g[START] = 0;
    f[START] = distance(from, to);

    while (open.length > 0) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === GOAL) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const neighbors = cur === START ? startLinks : edges[cur];
      const relax = (next: number) => {
        if (closed[next]) return;
        const cost = g[cur] + distance(pos(cur), pos(next));
        if (cost < g[next]) {
          g[next] = cost;
          f[next] = cost + distance(pos(next), to);
          came[next] = cur;
          open.push(next);
        }
      };
      for (const next of neighbors) relax(next);
      if (cur !== START && goalLinks.has(cur)) relax(GOAL);
    }

    if (came[GOAL] === -1) return [to];
    const path: Vec2[] = [];
    for (let cur = GOAL; cur !== START && cur !== -1; cur = came[cur]) path.push(pos(cur));
    return path.reverse();
  }
}

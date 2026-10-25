// Rutas que esquivan islas (§6): grafo de visibilidad con nodos en anillos alrededor de cada isla,
// inflados por el margen de navegación del barco (`clearance` = L/2 + 2, desde el borde de la isla),
// y A* sobre ese grafo (~100 nodos frente a 40 000 celdas de rejilla).
import { IslandDef, NAV_LIMIT, NAV_NODE_SLACK } from './constants';
import { Vec2, distance } from './vec';

const NODES_PER_ISLAND = 16;
const EPS = 1e-3;
const PUSH_OUT = 0.05; // lo que el punto navegable más cercano queda por fuera del margen, para que el redondeo no lo meta
// Math.hypot leída una vez (O-43): la misma función, sin leer la global Math en cada llamada. En el contexto vm de Jest,
// donde se miden AC-22 y AC-03, cada lectura cuesta más que la cuenta: Math.hypot da ~110 ns por llamada leída cada vez
// y ~5 leída una vez, y Math.max con Math.min ~190 ns frente a ~1 de dos comparaciones. En node, ~5 y ~1 en los dos
// casos (dev-npc, 2026-10-19)
const { hypot } = Math;

interface Graph {
  nodes: Vec2[];
  edges: number[][]; // adyacencia entre nodos (índices)
  weights: number[][]; // la longitud de cada arista de edges, en su mismo orden: el A* no la recalcula en cada ruta (O-43)
}

// El punto de la lista más cercano a q (null si la lista está vacía)
function closest(q: Vec2, points: Vec2[]): Vec2 | null {
  let best: Vec2 | null = null;
  for (const p of points) if (!best || distance(q, p) < distance(q, best)) best = p;
  return best;
}

// Distancia mínima entre el segmento ab y el punto c (la cuenta de siempre, con Math: es la de referencia de los tests)
export function segmentPointDistance(a: Vec2, b: Vec2, c: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((c.x - a.x) * abx + (c.z - a.z) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + abx * t - c.x, a.z + abz * t - c.z);
}

// El cuadrado de esa distancia, con el tramo ya restado (ab y su longitud al cuadrado), para segmentClear: la misma cuenta
// sin la raíz ni objetos, y el recorte de t a [0, 1] con comparaciones en vez de Math.max y Math.min (O-43)
function segmentPointDistance2(a: Vec2, abx: number, abz: number, len2: number, x: number, z: number): number {
  let t = len2 > 0 ? ((x - a.x) * abx + (z - a.z) * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + abx * t - x;
  const dz = a.z + abz * t - z;
  return dx * dx + dz * dz;
}

// Lista abierta del A* (O-43): un montículo binario de nodos por f, en vez de recorrer la lista entera en cada paso. Cada
// entrada guarda la f con la que entró: cuando la f de un nodo baja, el nodo entra otra vez, y la entrada vieja sale
// después y se salta porque el nodo ya está cerrado
export class OpenList {
  private readonly keys: number[] = [];
  private readonly ids: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    const { keys, ids } = this;
    let i = ids.length;
    keys.push(key);
    ids.push(id);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      ids[i] = ids[parent];
      i = parent;
    }
    keys[i] = key;
    ids[i] = id;
  }

  // El nodo de menor f (la lista no puede estar vacía)
  pop(): number {
    const { keys, ids } = this;
    const top = ids[0];
    const lastKey = keys.pop() as number;
    const lastId = ids.pop() as number;
    const n = ids.length;
    if (n === 0) return top;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= n) break;
      const child = left + 1 < n && keys[left + 1] < keys[left] ? left + 1 : left;
      if (keys[child] >= lastKey) break;
      keys[i] = keys[child];
      ids[i] = ids[child];
      i = child;
    }
    keys[i] = lastKey;
    ids[i] = lastId;
    return top;
  }
}

// Una forma del mapa con el círculo que envuelve los suyos (O-43): centro en la media de sus centros y radio hasta su
// borde más lejano. Los círculos de una forma son los «id.k» de mapOf (constants.ts); con uno solo, el id de la forma
interface Shape {
  x: number;
  z: number;
  radius: number;
  circles: IslandDef[];
}

function shapesOf(islands: IslandDef[]): Shape[] {
  const byShape = new Map<string, IslandDef[]>();
  for (const island of islands) {
    const id = island.id.split('.')[0];
    byShape.set(id, [...(byShape.get(id) ?? []), island]);
  }
  return [...byShape.values()].map((circles) => {
    const x = circles.reduce((sum, c) => sum + c.x, 0) / circles.length;
    const z = circles.reduce((sum, c) => sum + c.z, 0) / circles.length;
    return { x, z, radius: Math.max(...circles.map((c) => hypot(c.x - x, c.z - z) + c.radius)), circles };
  });
}

export class Navigator {
  private readonly graphs = new Map<number, Graph>();
  private readonly crossings = new Map<string, Vec2[]>();
  private readonly shapes: Shape[];
  private builds = 0;

  constructor(private readonly islands: IslandDef[]) {
    this.shapes = shapesOf(islands);
  }

  // Libre si el segmento no entra en ninguna isla inflada por `clearance`. Una forma de varios círculos se prueba antes por
  // su círculo envolvente (O-43): si el tramo pasa a radio + margen o más de su centro, pasa a más del margen de cada uno
  // de sus círculos (desigualdad triangular), con el EPS de sobra, y la forma entera se salta con una sola cuenta. Las
  // distancias se comparan al cuadrado. Antes que la distancia, la caja (O-43): un círculo que queda entero fuera de la
  // caja del tramo inflada por el margen y el EPS está a más de radio + margen de todo el tramo, y se salta con cuatro
  // comparaciones. Un círculo de la forma no sale de su círculo envolvente, así que tampoco de la caja de este
  segmentClear(a: Vec2, b: Vec2, clearance: number): boolean {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const pad = clearance + EPS;
    const minX = (a.x < b.x ? a.x : b.x) - pad;
    const maxX = (a.x < b.x ? b.x : a.x) + pad;
    const minZ = (a.z < b.z ? a.z : b.z) - pad;
    const maxZ = (a.z < b.z ? b.z : a.z) + pad;
    for (const shape of this.shapes) {
      if (shape.x + shape.radius < minX || shape.x - shape.radius > maxX || shape.z + shape.radius < minZ || shape.z - shape.radius > maxZ) continue;
      if (shape.circles.length > 1) {
        const reach = shape.radius + clearance;
        if (segmentPointDistance2(a, abx, abz, len2, shape.x, shape.z) >= reach * reach) continue;
      }
      for (const island of shape.circles) {
        if (island.x + island.radius < minX || island.x - island.radius > maxX || island.z + island.radius < minZ || island.z - island.radius > maxZ) continue;
        const reach = island.radius + clearance - EPS;
        if (reach > 0 && segmentPointDistance2(a, abx, abz, len2, island.x, island.z) < reach * reach) return false;
      }
    }
    return true;
  }

  // Distancia del punto al borde de la isla más cercana. Ningún círculo de una forma tiene el borde más cerca del punto que
  // el de su círculo envolvente: si ese ya no baja del mínimo hallado (con el EPS de sobra), la forma no lo cambia y se
  // salta (O-43). El mínimo sale el mismo, porque solo se dejan los círculos que no lo bajan
  edgeClearance(p: Vec2): number {
    let min = Infinity;
    for (const shape of this.shapes) {
      if (shape.circles.length > 1 && hypot(p.x - shape.x, p.z - shape.z) - shape.radius - EPS >= min) continue;
      for (const island of shape.circles) {
        const d = hypot(p.x - island.x, p.z - island.z) - island.radius;
        if (d < min) min = d;
      }
    }
    return min;
  }

  // Fuera de todas las islas infladas por `extra` (con la tolerancia del redondeo, para los puntos justo en el borde). Fuera
  // del círculo envolvente de una forma inflado por `extra` y el EPS, fuera de cada uno de sus círculos (O-43, como en
  // segmentClear): la forma se salta con una sola cuenta, y los demás círculos se prueban como siempre
  private outside(p: Vec2, extra: number): boolean {
    for (const shape of this.shapes) {
      if (shape.circles.length > 1 && hypot(p.x - shape.x, p.z - shape.z) >= shape.radius + extra + EPS) continue;
      for (const island of shape.circles) if (hypot(p.x - island.x, p.z - island.z) < island.radius + extra - 1e-9) return false;
    }
    return true;
  }

  // Fuera de todas las islas infladas por `clearance` y dentro del límite
  navigable(p: Vec2, clearance: number): boolean {
    return p.x <= NAV_LIMIT && p.x >= -NAV_LIMIT && p.z <= NAV_LIMIT && p.z >= -NAV_LIMIT && this.outside(p, clearance);
  }

  // Punto navegable más cercano: fuera de las islas infladas y dentro del límite (§4, AC-18, AC-21). Está en el borde de
  // la unión de las islas infladas: es la proyección sobre una de ellas o, donde dos se solapan (las rocas de los
  // escollos, o los círculos de una isla, AC-172 y AC-199), uno de sus cruces. Empujar fuera de cada isla por turnos
  // rebotaba entre las que se solapan y podía dejar el punto dentro. Supone que ninguna isla inflada pasa del límite, así
  // que ningún tramo del borde es el del mapa
  nearestNavigable(p: Vec2, clearance: number): Vec2 {
    const q = { x: Math.max(-NAV_LIMIT, Math.min(NAV_LIMIT, p.x)), z: Math.max(-NAV_LIMIT, Math.min(NAV_LIMIT, p.z)) };
    if (this.navigable(q, clearance)) return q;
    return closest(q, this.edgePoints(q, clearance, PUSH_OUT, true)) ?? q;
  }

  // Contacto con la costa (el tope físico de último recurso, §6): el punto más cercano a p fuera de todas las islas
  // infladas por el radio de colisión `radius`, en el borde exacto de su unión; null si p no toca ninguna
  pushOut(p: Vec2, radius: number): Vec2 | null {
    if (this.outside(p, radius)) return null;
    return closest(p, this.edgePoints(p, radius, 0, false));
  }

  // Prepara al arrancar los grafos y los cruces de cada margen de navegación, y los cruces de cada radio de colisión, para
  // que ni la primera ruta ni el primer contacto con la costa los construyan dentro de un tick (AC-171)
  prepare(clearances: number[], radii: number[] = []): void {
    for (const clearance of clearances) {
      this.graphFor(clearance);
      this.crossingsFor(clearance, PUSH_OUT, true);
    }
    for (const radius of radii) this.crossingsFor(radius, 0, false);
  }

  // Grafos y conjuntos de cruces construidos hasta ahora: si la primera ruta no lo sube, ya estaban preparados (AC-171)
  get buildCount(): number {
    return this.builds;
  }

  // Márgenes con su grafo ya construido, de menor a mayor (AC-171)
  get graphMargins(): number[] {
    return [...this.graphs.keys()].sort((a, b) => a - b);
  }

  // Candidatos a punto más cercano a q del borde de la unión de las islas infladas por `extra`, a `pad` por fuera: la
  // proyección de q sobre cada isla y los cruces de las que se solapan, solo los que quedan fuera de todas (y dentro del
  // límite, con `bounded`)
  private edgePoints(q: Vec2, extra: number, pad: number, bounded: boolean): Vec2[] {
    const points: Vec2[] = [];
    for (const island of this.islands) {
      const r = island.radius + extra + pad;
      const d = hypot(q.x - island.x, q.z - island.z);
      const nx = d > EPS ? (q.x - island.x) / d : 1;
      const nz = d > EPS ? (q.z - island.z) / d : 0;
      const c = { x: island.x + nx * r, z: island.z + nz * r };
      if (bounded ? this.navigable(c, extra) : this.outside(c, extra)) points.push(c);
    }
    return points.concat(this.crossingsFor(extra, pad, bounded));
  }

  // Cruces de cada par de islas infladas que se solapan, sin los que caen dentro de una tercera: los vértices del borde
  // de la unión. No dependen del punto, así que se calculan una vez por margen, como los grafos
  private crossingsFor(extra: number, pad: number, bounded: boolean): Vec2[] {
    const key = `${extra}|${pad}|${bounded}`;
    let points = this.crossings.get(key);
    if (points) return points;
    points = [];
    for (let i = 0; i < this.islands.length; i++) {
      for (let j = i + 1; j < this.islands.length; j++) {
        const a = this.islands[i];
        const b = this.islands[j];
        const ra = a.radius + extra + pad;
        const rb = b.radius + extra + pad;
        const d = hypot(b.x - a.x, b.z - a.z);
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
    points = points.filter((c) => (bounded ? this.navigable(c, extra) : this.outside(c, extra)));
    this.crossings.set(key, points);
    this.builds++;
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
        if (!this.islands.every((o) => hypot(n.x - o.x, n.z - o.z) >= o.radius + clearance)) continue;
        nodes.push(n);
      }
    }
    const edges: number[][] = nodes.map(() => []);
    const weights: number[][] = nodes.map(() => []);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (this.segmentClear(nodes[i], nodes[j], clearance)) {
          edges[i].push(j);
          weights[i].push(distance(nodes[i], nodes[j]));
          edges[j].push(i);
          weights[j].push(distance(nodes[j], nodes[i]));
        }
      }
    }
    graph = { nodes, edges, weights };
    this.graphs.set(clearance, graph);
    this.builds++;
    return graph;
  }

  // Waypoints desde `from` (excluido) hasta `to` (incluido) o, si `to` no se alcanza, hasta el punto alcanzable más
  // cercano a `to`: el último waypoint es siempre el destino real
  findPath(from: Vec2, to: Vec2, clearance: number): Vec2[] {
    // Si el barco ya está dentro de la zona inflada (p. ej., tras un empuje físico), los tramos desde el
    // origen solo pueden mantener o aumentar su distancia actual a la isla, nunca acercarse más
    const startClear = Math.min(clearance, Math.max(0, this.edgeClearance(from) - EPS));
    if (this.segmentClear(from, to, startClear)) return [to];
    const { nodes, edges, weights } = this.graphFor(clearance);
    const n = nodes.length;
    const START = n;
    const GOAL = n + 1;
    const pos = (i: number) => (i === START ? from : i === GOAL ? to : nodes[i]);
    // Los enganches del origen se prueban al salir de la lista, no todos antes de empezar (O-43): la entrada LINK + i lleva
    // el tramo del origen al nodo i con la f que tendría el nodo enganchado. La línea recta es lo más corto hasta el nodo,
    // así que ninguna otra entrada suya sale antes (salvo un empate exacto), y los enganches cuya f pasa de la de la ruta
    // no se prueban nunca. Sin ruta, la lista se vacía y se prueban todos, como antes
    const LINK = n + 2;

    const g = new Float64Array(n + 2).fill(Infinity);
    const f = new Float64Array(n + 2).fill(Infinity);
    const came = new Int32Array(n + 2).fill(-1);
    const closed = new Uint8Array(n + 2);
    // La distancia de cada nodo al destino (la heurística y el último tramo), calculada la primera vez que hace falta y no
    // en cada relajación (O-43)
    const h = new Float64Array(n + 2).fill(-1);
    const toGoal = (i: number) => (h[i] < 0 ? (h[i] = distance(pos(i), to)) : h[i]);
    const open = new OpenList();
    g[START] = 0;
    closed[START] = 1;
    for (let i = 0; i < n; i++) open.push(LINK + i, distance(from, nodes[i]) + toGoal(i));
    // step: la longitud del tramo de cur a next, la misma distance(pos(cur), pos(next)) de siempre; entre nodos, la que
    // guarda el grafo (O-43). Una sola función para toda la ruta, no una por nodo expandido
    const relax = (cur: number, next: number, step: number) => {
      if (closed[next]) return;
      const cost = g[cur] + step;
      if (cost < g[next]) {
        g[next] = cost;
        f[next] = cost + toGoal(next);
        came[next] = cur;
        open.push(next, f[next]);
      }
    };

    while (open.size > 0) {
      const cur = open.pop();
      if (cur === GOAL) break;
      if (cur >= LINK) {
        const i = cur - LINK;
        if (!closed[i] && this.segmentClear(from, nodes[i], startClear)) relax(START, i, distance(from, nodes[i]));
        continue;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      for (let k = 0; k < edges[cur].length; k++) relax(cur, edges[cur][k], weights[cur][k]);
      // El destino se prueba desde cada nodo al expandirlo, no desde todos antes de empezar: cada nodo se expande una vez
      // como mucho, así que es la misma prueba, solo en los nodos que el A* llega a expandir (O-43)
      if (this.segmentClear(nodes[cur], to, clearance)) relax(cur, GOAL, toGoal(cur));
    }

    const route = (end: number) => {
      const path: Vec2[] = [];
      for (let cur = end; cur !== START && cur !== -1; cur = came[cur]) path.push(pos(cur));
      return path.reverse();
    };
    if (came[GOAL] !== -1) return route(GOAL);

    // Destino inalcanzable (§6, punto 1b; AC-172): sin él, el barco iría en línea recta contra la costa. El A* ya ha
    // cerrado todo lo alcanzable, así que el destino pasa al punto alcanzable más cercano: está en el borde de las islas
    // infladas (proyección o cruce, como en nearestNavigable) y se ve desde el origen o desde un nodo alcanzado. Si no
    // hay ninguno, el nodo alcanzado más cercano (o quedarse donde está)
    const reached = [START];
    for (let i = 0; i < n; i++) if (closed[i]) reached.push(i);
    const candidates = this.edgePoints(to, clearance, PUSH_OUT, true).sort((a, b) => distance(a, to) - distance(b, to));
    // La ruta hasta ese punto es la más corta, la misma que con él de destino (AC-172 c; O-57): con la lista agotada, la g
    // de cada nodo cerrado es su distancia más corta desde el origen, así que se sale por el que lo ve con menor g más el
    // último tramo. Antes salía por el primero que lo veía en el orden de las islas, y el Capitán desde WEST recorría
    // 676,6 m en lugar de 82,0
    for (const c of candidates) {
      const order = reached.map((i) => ({ i, cost: g[i] + distance(pos(i), c) })).sort((a, b) => a.cost - b.cost);
      const via = order.find(({ i }) => this.segmentClear(pos(i), c, i === START ? startClear : clearance));
      if (via !== undefined) return [...route(via.i), c];
    }
    const nearest = reached.reduce((best, i) => (distance(pos(i), to) < distance(pos(best), to) ? i : best));
    return nearest === START ? [from] : route(nearest);
  }
}

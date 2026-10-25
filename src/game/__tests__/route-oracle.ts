import { IslandDef } from '../constants';
import { Navigator, segmentPointDistance } from '../nav';
import { Vec2, createRng, distance } from '../vec';

// Oráculo de rutas (O-43): el findPath de 4afc607 tal cual, la versión lenta y directa de antes de los arreglos de coste.
// Prueba cada tramo contra cada círculo, engancha el destino a todos los nodos antes del A* y recorre la lista abierta
// entera en cada paso. Usa el grafo del propio Navigator (sus nodos y aristas, que los arreglos no cambian) y su
// edgePoints para el destino inalcanzable (AC-172). La regla de producto es que una ruta salga igual que con el algoritmo
// de antes, y eso es lo que se compara con él
const EPS = 1e-3; // el de nav.ts
const PUSH_OUT = 0.05; // el de nav.ts

interface Internals {
  islands: IslandDef[];
  graphFor(clearance: number): { nodes: Vec2[]; edges: number[][] };
  edgePoints(q: Vec2, extra: number, pad: number, bounded: boolean): Vec2[];
}

export function referencePath(nav: Navigator, from: Vec2, to: Vec2, clearance: number): Vec2[] {
  const inner = nav as unknown as Internals;
  const islands = inner.islands;
  const segmentClear = (a: Vec2, b: Vec2, c: number) => islands.every((i) => segmentPointDistance(a, b, { x: i.x, z: i.z }) >= i.radius + c - EPS);
  const edgeClearance = (p: Vec2) => Math.min(...islands.map((i) => Math.hypot(p.x - i.x, p.z - i.z) - i.radius));

  const startClear = Math.min(clearance, Math.max(0, edgeClearance(from) - EPS));
  if (segmentClear(from, to, startClear)) return [to];
  const { nodes, edges } = inner.graphFor(clearance);
  const n = nodes.length;
  const START = n;
  const GOAL = n + 1;
  const pos = (i: number) => (i === START ? from : i === GOAL ? to : nodes[i]);
  const startLinks: number[] = [];
  const goalLinks = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (segmentClear(from, nodes[i], startClear)) startLinks.push(i);
    if (segmentClear(nodes[i], to, clearance)) goalLinks.add(i);
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

  const route = (end: number) => {
    const path: Vec2[] = [];
    for (let cur = end; cur !== START && cur !== -1; cur = came[cur]) path.push(pos(cur));
    return path.reverse();
  };
  if (came[GOAL] !== -1) return route(GOAL);

  const reached = [START];
  for (let i = 0; i < n; i++) if (closed[i]) reached.push(i);
  const candidates = inner.edgePoints(to, clearance, PUSH_OUT, true).sort((a, b) => distance(a, to) - distance(b, to));
  for (const c of candidates) {
    const via = reached.find((i) => segmentClear(pos(i), c, i === START ? startClear : clearance));
    if (via !== undefined) return [...route(via), c];
  }
  const nearest = reached.reduce((best, i) => (distance(pos(i), to) < distance(pos(best), to) ? i : best));
  return nearest === START ? [from] : route(nearest);
}

// Las parejas de AC-22 (navigation.test.ts, semilla 7), llevadas al punto navegable del mapa
export function ac22Pairs(nav: Navigator, margin: number, count: number): [Vec2, Vec2][] {
  const rng = createRng(7);
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i < count; i++) {
    const p = nav.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, margin);
    const q = nav.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, margin);
    out.push([p, q]);
  }
  return out;
}

// Misma ruta a ±tol m: los mismos puntos, uno a uno, y la misma longitud desde el origen. null si coinciden; si no, qué cambia
export function routeDifference(from: Vec2, got: Vec2[], want: Vec2[], tol = 0.01): string | null {
  const length = (path: Vec2[]) => path.reduce((sum, p, i) => sum + distance(i === 0 ? from : path[i - 1], p), 0);
  if (got.length !== want.length) return `${got.length} puntos frente a ${want.length}`;
  const worst = Math.max(0, ...got.map((p, i) => distance(p, want[i])));
  if (worst > tol) return `un punto a ${worst.toFixed(3)} m`;
  const dl = Math.abs(length(got) - length(want));
  return dl > tol ? `longitud a ${dl.toFixed(3)} m` : null;
}

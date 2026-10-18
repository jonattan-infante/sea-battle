import { IslandDef, MAP_1_0, MAP_1_1 } from '../constants';
import { Navigator, OpenList, segmentPointDistance } from '../nav';
import { Vec2, createRng } from '../vec';

// Coste de las rutas con las islas de D83 (O-43; BACKLOG, decisiones de producto del 2026-10-18). Con MAP_1_1 (44 círculos
// y ~370 nodos frente a 7 y 112) casi ninguna ruta sale en línea recta, y cada una enganchaba el origen y el destino a
// todos los nodos: 2·N llamadas a segmentClear, cada una contra los 44 círculos (la sonda de dev-npc sobre 4afc607). Los
// arreglos no cambian ninguna ruta, solo el trabajo, así que se prueban con contadores y con la misma respuesta que la
// cuenta directa, no con tiempos. Los pares son los de AC-22 (navigation.test.ts, semilla 7)
const MARGINS = [13, 19, 20, 23];

function pairs(nav: Navigator, margin: number, count: number): [Vec2, Vec2][] {
  const rng = createRng(7);
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i < count; i++) {
    const p = { x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 };
    const q = { x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 };
    out.push([nav.nearestNavigable(p, margin), nav.nearestNavigable(q, margin)]);
  }
  return out;
}

// La cuenta directa de segmentClear: el tramo frente a cada círculo, con el EPS de nav.ts (1 mm)
const clearByCircles = (islands: IslandDef[], a: Vec2, b: Vec2, clearance: number) => islands.every((i) => segmentPointDistance(a, b, i) >= i.radius + clearance - 1e-3);

const nodesOf = (nav: Navigator, margin: number) => (nav as unknown as { graphFor(m: number): { nodes: Vec2[] } }).graphFor(margin).nodes.length;

describe('Coste de las rutas con MAP_1_1 (O-43)', () => {
  // A: el destino se engancha a los nodos que el A* expande, no a todos antes de empezar. Las pruebas contra el destino
  // son las llamadas a segmentClear que acaban en él, sin la de la línea recta
  test.each(MARGINS)('A, margen %i: una ruta que no es directa prueba el destino solo desde los nodos que expande, menos de N', (margin) => {
    const nav = new Navigator(MAP_1_1.islands);
    const n = nodesOf(nav, margin);
    const real = nav.segmentClear.bind(nav);
    let goalChecks = 0;
    let to: Vec2 | null = null;
    jest.spyOn(nav, 'segmentClear').mockImplementation((a, b, clearance) => {
      if (b === to) goalChecks++;
      return real(a, b, clearance);
    });
    const checks: number[] = [];
    for (const [a, b] of pairs(nav, margin, 200)) {
      goalChecks = 0;
      to = b;
      const path = nav.findPath(a, b, margin);
      if (path.length > 1) checks.push(goalChecks - 1); // por el grafo: la primera prueba es la de la línea recta
    }
    console.log(`O-43 A margen ${margin}: N ${n} · ${checks.length} rutas no directas · pruebas contra el destino por ruta: media ${(checks.reduce((s, c) => s + c, 0) / checks.length).toFixed(1)}, máx. ${Math.max(...checks)}`);
    expect(checks.length).toBeGreaterThan(80);
    expect(checks.filter((c) => c >= n)).toEqual([]);
  });

  // B (y C): la misma respuesta que la cuenta directa, círculo a círculo, en tramos al azar por todo el mapa y en tramos que
  // rozan el margen de cada círculo (a ±2 m del borde inflado), con los márgenes de las clases y con 0 (el del origen
  // dentro de la zona inflada, findPath)
  test.each<[string, IslandDef[]]>([['MAP_1_1', MAP_1_1.islands], ['MAP_1_0', MAP_1_0.islands]])('B, %s: segmentClear da lo mismo que probar el tramo contra cada círculo', (name, islands) => {
    const nav = new Navigator(islands);
    const rng = createRng(11);
    const at = () => (rng() * 2 - 1) * 490;
    const wrong: string[] = [];
    let blocked = 0;
    let total = 0;
    for (const clearance of [0, 0.5, 10, 12, 13, 14, 16, 17, 19, 20, 23]) {
      const segments: [Vec2, Vec2][] = [];
      for (let k = 0; k < 400; k++) segments.push([{ x: at(), z: at() }, { x: at(), z: at() }]);
      for (const c of islands) {
        for (let k = 0; k < 12; k++) {
          // Un punto a ±2 m del borde inflado y un tramo de hasta 60 m que pasa por él, en un rumbo al azar
          const ang = rng() * Math.PI * 2;
          const r = c.radius + clearance + (rng() * 4 - 2);
          const p = { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
          const dir = rng() * Math.PI * 2;
          const [l1, l2] = [rng() * 30, rng() * 30];
          segments.push([{ x: p.x - Math.cos(dir) * l1, z: p.z - Math.sin(dir) * l1 }, { x: p.x + Math.cos(dir) * l2, z: p.z + Math.sin(dir) * l2 }]);
        }
      }
      for (const [a, b] of segments) {
        const expected = clearByCircles(islands, a, b, clearance);
        total++;
        if (!expected) blocked++;
        if (nav.segmentClear(a, b, clearance) !== expected && wrong.length < 5) wrong.push(`margen ${clearance}: (${a.x}, ${a.z})–(${b.x}, ${b.z}) debía dar ${expected}`);
      }
    }
    console.log(`O-43 B ${name}: ${total} tramos, ${blocked} cortados`);
    expect(blocked).toBeGreaterThan(total / 10);
    expect(total - blocked).toBeGreaterThan(total / 10);
    expect(wrong).toEqual([]);
  });

  // D: el montículo de la lista abierta saca siempre una entrada de f mínima, frente a una lista ordenada a mano, con
  // entradas y salidas mezcladas como en el A* (más entradas que salidas, f repetidas y nodos que vuelven a entrar)
  test('D: la lista abierta saca siempre una entrada de f mínima', () => {
    const rng = createRng(13);
    const open = new OpenList();
    const naive: { id: number; key: number }[] = [];
    const wrong: string[] = [];
    let pops = 0;
    for (let step = 0; step < 5000; step++) {
      if (naive.length === 0 || rng() < 0.6) {
        const id = Math.floor(rng() * 400);
        const key = Math.round(rng() * 2000) / 4; // f repetidas, como en los empates del A*
        open.push(id, key);
        naive.push({ id, key });
      } else {
        const min = Math.min(...naive.map((e) => e.key));
        const id = open.pop();
        pops++;
        const k = naive.findIndex((e) => e.id === id && e.key === min);
        if (k < 0 && wrong.length < 5) wrong.push(`salida ${pops}: el nodo ${id} no tiene una entrada con la f mínima ${min}`);
        naive.splice(k < 0 ? naive.findIndex((e) => e.key === min) : k, 1);
      }
      if (open.size !== naive.length && wrong.length < 5) wrong.push(`paso ${step}: ${open.size} entradas frente a ${naive.length}`);
    }
    expect(pops).toBeGreaterThan(1000);
    expect(wrong).toEqual([]);
  });
});

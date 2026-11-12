// «Se ve / se choca» en las 16 formas del mapa de la 1.1 (AC-210; el P3 de BACKLOG :1720, subido a la 1.2 porque las 15
// islas salen con su modelo). Antes iba solo contra I1 y con el clic en su centro, así que los 32 rumbos acababan en una sola
// parada por clase (O-6 de QA-72). Ahora cada clase de jugador (Balandra, Bergantín y Fragata) sale desde 8 rumbos de cada
// forma, a GAP m de agua de su margen, y el clic va dentro de la forma, BEHIND m por detrás de la costa del lado de la
// salida. Al pararse, ningún punto del casco (el segmento de proa a popa de AC-20, sin bauprés) queda sobre la tierra
// visible de ninguna forma: la malla de islands.glb y la de island_port.glb cortadas por la flotación, no los sb_circles. Al
// log, sin aserción: la distancia del casco a la costa visible por forma, clase y rumbo, el mismo barrido en las 7 formas de
// la 1.0 (su malla procedural, buildIslands) y la cota relativa de producto, mediana de la 1.1 ≤ mediana de la 1.0 + 3 m en
// esas 7 formas. Si esa cota no se cumple vuelve a producto con los datos; la navegación no se toca por ella
import path from 'path';
import { IslandShape, MAP_1_0, MAP_1_1, MapDef, PLAYER_SHIP_ORDER, SHIP_CLASSES, navClearance } from '../../../game/constants';
import { segmentPointDistance } from '../../../game/nav';
import { Vec2, headingTo } from '../../../game/vec';
import { createWorld, moveTo, navigatorOf } from '../../../game/world';
import { placePlayer, runUntil } from '../../../game/__tests__/helpers';
import { buildIslands } from '../island-geometry';
import { PORT_GLB, PORT_ROOTS, takeRoots } from '../island-glb';
import { PUBLIC_DIR, Triangles, islandsScene, landGrid, trianglesOfGeometry, trianglesOfRoot, waterline } from './island-coast';

const HEADINGS = 8; // rumbos de salida por forma y clase, cada 45°
const GAP = 60; // m de agua entre el margen de la clase y el punto de salida, en el rumbo
const BEHIND = 1; // m por dentro de la costa del lado de la salida a los que va el clic
const SAMPLE = 0.25; // m entre puntos del casco
const NEAR = 120; // m: una forma con el centro a más de esto del barco no llega a su casco (la mayor mide < 80 m del centro al borde)
// Las 3 excepciones de la cota de los lados (producto, BACKLOG :1941 de r11): la Fragata en los rumbos de E1a, E1b y E1c que
// miran dentro del triángulo de los 3 escollos. Con su margen de 19 m los márgenes de las rocas se solapan (separación 45 m
// frente a 2 × 26 m), así que el interior del triángulo no es navegable y el destino sale fuera (AC-172 a): la parada no queda
// en su lado. No se saltan: el test aserta que su parada queda fuera del triángulo de los 3 centros
const E1_INSIDE: readonly { shape: string; classId: string; k: number }[] = [
  { shape: 'E1a', classId: 'frigate', k: 0 },
  { shape: 'E1b', classId: 'frigate', k: 3 },
  { shape: 'E1c', classId: 'frigate', k: 5 }
];

// La tierra visible de una forma: su consulta rápida, sus segmentos de costa y su centro
interface Land {
  shape: IslandShape;
  center: Vec2;
  onLand: (x: number, z: number) => boolean;
  coast: [Vec2, Vec2][];
}

interface Row {
  shape: string;
  classId: string;
  k: number;
  stopped: boolean;
  onLand: string[]; // las formas con algún punto del casco sobre su tierra visible
  coast: number; // menor distancia del casco a la costa visible de las formas cercanas (m)
  side: number; // grados entre el rumbo de salida y la dirección del centro de la forma a la parada
  pos: Vec2;
}

// El centro de una forma: el de sus círculos, pesado por su área
function centerOf(shape: IslandShape): Vec2 {
  const w = shape.circles.reduce((s, c) => s + c.radius ** 2, 0);
  return { x: shape.circles.reduce((s, c) => s + c.x * c.radius ** 2, 0) / w, z: shape.circles.reduce((s, c) => s + c.z * c.radius ** 2, 0) / w };
}

// Desde el centro, en la dirección d, el último punto dentro de la unión de círculos: la costa que ve quien llega desde fuera
// en ese rumbo
function edgeAlong(shape: IslandShape, from: Vec2, d: Vec2): number {
  let t = -Infinity;
  for (const c of shape.circles) {
    const b = d.x * (from.x - c.x) + d.z * (from.z - c.z);
    const q = (from.x - c.x) ** 2 + (from.z - c.z) ** 2 - c.radius ** 2;
    if (b * b - q >= 0) t = Math.max(t, -b + Math.sqrt(b * b - q));
  }
  return t;
}

// ¿p dentro del triángulo abc (o en su borde)? Por el signo de los 3 productos cruzados
function inTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const side = (u: Vec2, v: Vec2) => (v.x - u.x) * (p.z - u.z) - (v.z - u.z) * (p.x - u.x);
  const d = [side(a, b), side(b, c), side(c, a)];
  return d.every((x) => x >= 0) || d.every((x) => x <= 0);
}

// Distancia entre 2 segmentos en planta: 0 si se cruzan
function segmentDistance(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  const cross = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segmentPointDistance(c, d, a), segmentPointDistance(c, d, b), segmentPointDistance(a, b, c), segmentPointDistance(a, b, d));
}

function landOf(shape: IslandShape, tris: Triangles): Land {
  return { shape, center: centerOf(shape), onLand: landGrid(tris), coast: waterline(tris) };
}

function sweep(map: MapDef, lands: Land[]): Row[] {
  const rows: Row[] = [];
  for (const land of lands) {
    const { shape, center } = land;
    for (const classId of PLAYER_SHIP_ORDER) {
      const length = SHIP_CLASSES[classId].length;
      const clearance = navClearance(classId);
      for (let k = 0; k < HEADINGS; k++) {
        const world = createWorld({ seed: 1, spawnNpcs: false, map });
        const a = (k * 2 * Math.PI) / HEADINGS;
        const d = { x: Math.sin(a), z: Math.cos(a) };
        const edge = edgeAlong(shape, center, d);
        const click = { x: center.x + d.x * (edge - BEHIND), z: center.z + d.z * (edge - BEHIND) };
        const out = edge + clearance + GAP;
        const start = navigatorOf(world).nearestNavigable({ x: center.x + d.x * out, z: center.z + d.z * out }, clearance);
        const ship = placePlayer(world, 'a', start.x, start.z, headingTo(start, click));
        ship.classId = classId;
        moveTo(world, 'a', click); // el clic dentro de la forma lleva al borde de su margen
        const stopped = runUntil(world, 120, () => ship.destination === null && ship.speed === 0) !== Infinity;
        // El casco de AC-20: de proa a popa, longitud L, sin bauprés
        const fx = Math.sin(ship.heading) * (length / 2);
        const fz = Math.cos(ship.heading) * (length / 2);
        const bow = { x: ship.pos.x + fx, z: ship.pos.z + fz };
        const stern = { x: ship.pos.x - fx, z: ship.pos.z - fz };
        const near = lands.filter((l) => Math.hypot(l.center.x - ship.pos.x, l.center.z - ship.pos.z) <= NEAR);
        const n = Math.ceil(length / SAMPLE);
        const onLand = near.filter((l) => {
          for (let i = 0; i <= n; i++) if (l.onLand(stern.x + ((bow.x - stern.x) * i) / n, stern.z + ((bow.z - stern.z) * i) / n)) return true;
          return false;
        });
        let coast = Infinity;
        for (const l of near) for (const [p, q] of l.coast) coast = Math.min(coast, segmentDistance(bow, stern, p, q));
        const toStop = Math.atan2(ship.pos.x - center.x, ship.pos.z - center.z);
        const side = (Math.abs(Math.atan2(Math.sin(toStop - a), Math.cos(toStop - a))) * 180) / Math.PI;
        rows.push({ shape: shape.id, classId, k, stopped, onLand: onLand.map((l) => l.shape.id), coast, side, pos: { ...ship.pos } });
      }
    }
  }
  return rows;
}

const median = (v: number[]) => {
  const s = [...v].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function logRows(map: string, rows: Row[]): void {
  for (const shape of [...new Set(rows.map((r) => r.shape))]) {
    for (const classId of PLAYER_SHIP_ORDER) {
      const own = rows.filter((r) => r.shape === shape && r.classId === classId);
      console.log(
        `«se ve / se choca», mapa ${map}, ${shape}, ${classId}: por rumbo, distancia del casco a la costa visible (m) y grados de la parada a su rumbo: ` +
          `${own.map((r) => `${r.k}:${r.coast.toFixed(2)}/${r.side.toFixed(0)}°${r.onLand.length ? `(tierra de ${r.onLand.join('+')})` : ''}${r.stopped ? '' : '(sin parar)'}`).join(' ')}` +
          ` · mediana ${median(own.map((r) => r.coast)).toFixed(2)} · ${own.filter((r) => r.side <= 45).length} de ${own.length} paradas a ≤ 45° de su rumbo`
      );
    }
  }
}

describe('«Se ve / se choca» en las 16 formas del mapa de la 1.1 (AC-210; BACKLOG :1720)', () => {
  test('mapa 1.1: Balandra, Bergantín y Fragata, mandadas contra la costa de cada forma del lado de la salida desde 8 rumbos, se paran sin ningún punto del casco sobre la tierra visible de islands.glb ni de island_port.glb', async () => {
    const t0 = Date.now();
    // 1.1: todas las raíces de islands.glb (las 15) y la del puerto de island_port.glb, cada una con su matriz de mundo. Todas
    // las del archivo y no PILOT_ROOTS: el barrido mide el archivo frente a la simulación, pinte el cliente las que pinte (eso
    // lo prueba el e2e de AC-210 b)
    const scene11 = await islandsScene();
    const islands = takeRoots(scene11, scene11.children.map((r) => r.userData.sb_id as string));
    const port = takeRoots(await islandsScene(path.join(PUBLIC_DIR, PORT_GLB)), PORT_ROOTS);
    expect([...islands.problems, ...port.problems]).toEqual([]);
    const roots = new Map([...islands.models, ...port.models].map((m) => [m.shape, m.root]));
    expect([...roots.keys()].sort()).toEqual(MAP_1_1.shapes.map((s) => s.id).sort());
    const lands11 = MAP_1_1.shapes.map((s) => landOf(s, trianglesOfRoot(roots.get(s.id)!)));
    // 1.0: la malla procedural de las islas de la 1.0, con los triángulos de cada forma (a ≤ su radio + 35 m de su centro)
    const geometry10 = buildIslands(MAP_1_0.islands).geometry;
    const lands10 = MAP_1_0.shapes.map((s) => {
      const [c] = s.circles;
      return landOf(s, trianglesOfGeometry(geometry10, (v) => v.some((p) => Math.hypot(p.x - c.x, p.z - c.z) <= c.radius + 35)));
    });
    // Sin costa, el barrido no mide nada en esa forma
    expect([...lands11, ...lands10].filter((l) => !l.coast.length).map((l) => l.shape.id)).toEqual([]);

    const rows11 = sweep(MAP_1_1, lands11);
    const rows10 = sweep(MAP_1_0, lands10);
    logRows('1.1', rows11);
    logRows('1.0', rows10);
    const common = new Set(MAP_1_0.shapes.map((s) => s.id));
    const m11 = median(rows11.filter((r) => common.has(r.shape)).map((r) => r.coast));
    const m10 = median(rows10.map((r) => r.coast));
    console.log(
      `«se ve / se choca»: 1.1, ${rows11.length} barcos (16 formas × 3 clases × ${HEADINGS} rumbos), mediana de la distancia a la costa visible ${median(rows11.map((r) => r.coast)).toFixed(2)} m` +
        ` · en las 7 formas de la 1.0: 1.1 ${m11.toFixed(2)} m, 1.0 ${m10.toFixed(2)} m · cota de producto (sin aserción) 1.1 ≤ 1.0 + 3 m = ${(m10 + 3).toFixed(2)} m: ${m11 <= m10 + 3 ? 'se cumple' : 'NO se cumple, vuelve a producto'}` +
        ` · 1.0 con casco sobre tierra: ${rows10.filter((r) => r.onLand.length).length} · paradas de la 1.1 a ≤ 45° de su rumbo: ${rows11.filter((r) => r.side <= 45).length} de ${rows11.length} · ${((Date.now() - t0) / 1000).toFixed(1)} s`
    );

    // Primero la tierra y después «no se para»: Jest corta en el primer expect, y con el orden contrario el fallo de tierra
    // quedaba tapado (con el mutante nav-radio de QA, 17 no se paraban y 66 de los 79 que sí se paraban tenían el casco en tierra)
    // La aserción: en los 384 barcos, se paren o no, ningún punto del casco sobre la tierra visible de ninguna forma (un barco
    // que no se para con el casco en tierra cae por tierra, que es su causa)
    expect(rows11.filter((r) => r.onLand.length).map((r) => `${r.shape} ${r.classId} rumbo ${r.k} en (${r.pos.x.toFixed(1)}, ${r.pos.z.toFixed(1)}): casco sobre la tierra de ${r.onLand.join('+')}, a ${r.coast.toFixed(2)} m`)).toEqual([]);
    // Medido: los 384 barcos se paran; si no, el test no prueba lo que dice
    expect(rows11.filter((r) => !r.stopped).map((r) => `${r.shape} ${r.classId} rumbo ${r.k}`)).toEqual([]);
    // Y las paradas recorren la costa (O-6 de QA-72; cota de producto, BACKLOG :1941 de r11): en las 48 combinaciones de forma
    // y clase, los 8 rumbos con la parada a ≤ 45° de su rumbo, visto desde el centro de la forma, salvo las 3 excepciones de
    // E1_INSIDE. Con el clic en el centro de la forma, como antes, las 8 acaban en 1 o 2 puntos
    const isException = (r: Row) => E1_INSIDE.some((e) => e.shape === r.shape && e.classId === r.classId && e.k === r.k);
    expect(rows11.filter((r) => r.side > 45 && !isException(r)).map((r) => `${r.shape} ${r.classId} rumbo ${r.k}: parada a ${r.side.toFixed(1)}° de su rumbo`)).toEqual([]);
    // En las 3 excepciones, la parada fuera del triángulo de los 3 centros de E1 (AC-172 a)
    const [e1a, e1b, e1c] = ['E1a', 'E1b', 'E1c'].map((id) => centerOf(MAP_1_1.shapes.find((s) => s.id === id)!));
    const exceptions = rows11.filter(isException);
    expect(exceptions.map((r) => `${r.shape} ${r.classId} rumbo ${r.k}`)).toEqual(E1_INSIDE.map((e) => `${e.shape} ${e.classId} rumbo ${e.k}`));
    expect(exceptions.filter((r) => inTriangle(r.pos, e1a, e1b, e1c)).map((r) => `${r.shape} ${r.classId} rumbo ${r.k}: parada en (${r.pos.x.toFixed(1)}, ${r.pos.z.toFixed(1)}), dentro del triángulo de E1`)).toEqual([]);
  }, 300_000); // holgura: corre con 1 worker y con nice mientras QA mide
});

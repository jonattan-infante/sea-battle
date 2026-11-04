// «Se ve / se choca» en I1 (producto, opción A, 2026-11-04; condición para activar MAP_1_1 en la 1.2). Con el mapa de la
// 1.1, cada clase de jugador (Balandra, Bergantín y Fragata) se manda contra I1 desde 32 rumbos. Al pararse, ningún punto del
// casco (el segmento de proa a popa de AC-20, sin bauprés) queda sobre la tierra visible: la malla de islands.glb cortada
// por la flotación, no los sb_circles. Al log, sin aserción: la distancia del casco a la costa visible por clase y rumbo, el
// mismo barrido contra I1 de la 1.0 (su malla procedural, buildIslands) y la cota relativa de producto, mediana de la 1.1
// ≤ mediana de la 1.0 + 3 m. Si esa cota no se cumple vuelve a producto con los datos; la navegación no se toca por ella
import { MAP_1_0, MAP_1_1, MapDef, PLAYER_SHIP_ORDER, SHIP_CLASSES, navClearance } from '../../../game/constants';
import { segmentPointDistance } from '../../../game/nav';
import { Vec2, headingTo } from '../../../game/vec';
import { createWorld, moveTo, navigatorOf } from '../../../game/world';
import { placePlayer, runUntil } from '../../../game/__tests__/helpers';
import { buildIslands } from '../island-geometry';
import { PILOT_ROOTS, takeRoots } from '../island-glb';
import { Triangles, islandsScene, landAt, trianglesOfGeometry, trianglesOfRoot, waterline } from './island-coast';

const I1 = { x: 260, z: 200 }; // centro de I1 en los 2 mapas (constants.ts: MAP_1_0 y MAP_1_1)
const HEADINGS = 32;
const START = 150; // m del centro de I1 a los que sale cada barco
const SAMPLE = 0.25; // m entre puntos del casco

interface Row {
  classId: string;
  k: number;
  stopped: boolean;
  onLand: number; // puntos del casco sobre la tierra visible
  coast: number; // menor distancia del casco a la costa visible (m)
  pos: Vec2;
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

function sweep(map: MapDef, tris: Triangles): Row[] {
  const coast = waterline(tris);
  const rows: Row[] = [];
  for (const classId of PLAYER_SHIP_ORDER) {
    const length = SHIP_CLASSES[classId].length;
    for (let k = 0; k < HEADINGS; k++) {
      const world = createWorld({ seed: 1, spawnNpcs: false, map });
      const a = (k * 2 * Math.PI) / HEADINGS;
      const start = navigatorOf(world).nearestNavigable({ x: I1.x + Math.sin(a) * START, z: I1.z + Math.cos(a) * START }, navClearance(classId));
      const ship = placePlayer(world, 'a', start.x, start.z, headingTo(start, I1));
      ship.classId = classId;
      moveTo(world, 'a', I1); // el clic en la isla lleva al borde de su margen
      const stopped = runUntil(world, 120, () => ship.destination === null && ship.speed === 0) !== Infinity;
      // El casco de AC-20: de proa a popa, longitud L, sin bauprés
      const fx = Math.sin(ship.heading) * (length / 2);
      const fz = Math.cos(ship.heading) * (length / 2);
      const bow = { x: ship.pos.x + fx, z: ship.pos.z + fz };
      const stern = { x: ship.pos.x - fx, z: ship.pos.z - fz };
      const n = Math.ceil(length / SAMPLE);
      let onLand = 0;
      for (let i = 0; i <= n; i++) if (landAt(tris, stern.x + ((bow.x - stern.x) * i) / n, stern.z + ((bow.z - stern.z) * i) / n)) onLand++;
      let near = Infinity;
      for (const [p, q] of coast) near = Math.min(near, segmentDistance(bow, stern, p, q));
      rows.push({ classId, k, stopped, onLand, coast: near, pos: { ...ship.pos } });
    }
  }
  return rows;
}

const median = (v: number[]) => {
  const s = [...v].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function logRows(map: string, rows: Row[]): number {
  for (const classId of PLAYER_SHIP_ORDER) {
    const own = rows.filter((r) => r.classId === classId);
    console.log(`«se ve / se choca», mapa ${map}, ${classId}: distancia del casco a la costa visible por rumbo (m): ${own.map((r) => `${r.k}:${r.coast.toFixed(2)}${r.onLand ? `(tierra ${r.onLand})` : ''}${r.stopped ? '' : '(sin parar)'}`).join(' ')} · mediana ${median(own.map((r) => r.coast)).toFixed(2)}`);
  }
  return median(rows.map((r) => r.coast));
}

describe('«Se ve / se choca» en I1 (opción A de producto, 2026-11-04)', () => {
  test('mapa 1.1: Balandra, Bergantín y Fragata mandadas contra I1 desde 32 rumbos se paran sin ningún punto del casco sobre la tierra visible de islands.glb', async () => {
    // 1.1: la malla de I1 de islands.glb (su raíz, con la matriz de mundo)
    const scene = await islandsScene();
    const { models, problems } = takeRoots(scene, PILOT_ROOTS);
    expect(problems).toEqual([]);
    const tris11 = trianglesOfRoot(models[0].root);
    // 1.0: la malla procedural de las islas de la 1.0, con los triángulos de I1 (a ≤ 80 m de su centro)
    const near = (v: { x: number; z: number }[]) => v.some((p) => Math.hypot(p.x - I1.x, p.z - I1.z) <= 80);
    const tris10 = trianglesOfGeometry(buildIslands(MAP_1_0.islands).geometry, near);
    expect({ tris11: tris11.length > 0, coast11: waterline(tris11).length > 0, tris10: tris10.length > 0, coast10: waterline(tris10).length > 0 }).toEqual({ tris11: true, coast11: true, tris10: true, coast10: true });

    const rows11 = sweep(MAP_1_1, tris11);
    const rows10 = sweep(MAP_1_0, tris10);
    const m11 = logRows('1.1', rows11);
    const m10 = logRows('1.0', rows10);
    console.log(
      `«se ve / se choca»: ${rows11.length} barcos por mapa (3 clases × ${HEADINGS} rumbos) · mediana de la distancia a la costa visible: 1.1 ${m11.toFixed(2)} m, 1.0 ${m10.toFixed(2)} m` +
        ` · cota de producto (sin aserción) 1.1 ≤ 1.0 + 3 m = ${(m10 + 3).toFixed(2)} m: ${m11 <= m10 + 3 ? 'se cumple' : 'NO se cumple, vuelve a producto'}` +
        ` · 1.0 con casco sobre tierra: ${rows10.filter((r) => r.onLand > 0).length}`
    );

    // Primero la tierra y después «no se para»: Jest corta en el primer expect, y con el orden contrario el fallo de tierra
    // quedaba tapado (con el mutante nav-radio de QA, 17 no se paraban y 66 de los 79 que sí se paraban tenían el casco en tierra)
    // La aserción: en los 96 barcos, se paren o no, ningún punto del casco sobre la tierra visible de I1 (un barco que no se
    // para con el casco en tierra cae por tierra, que es su causa)
    expect(rows11.filter((r) => r.onLand > 0).map((r) => `${r.classId} rumbo ${r.k} en (${r.pos.x.toFixed(1)}, ${r.pos.z.toFixed(1)}): ${r.onLand} puntos sobre tierra, a ${r.coast.toFixed(2)} m`)).toEqual([]);
    // Medido: los 96 barcos se paran; si no, el test no prueba lo que dice
    expect(rows11.filter((r) => !r.stopped).map((r) => `${r.classId} rumbo ${r.k}`)).toEqual([]);
  }, 300_000); // holgura: corre con 1 worker y con nice mientras QA mide (AC91)
});

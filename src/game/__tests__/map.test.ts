import {
  CAPTAIN_CLASS,
  DEATH_COUNTDOWN,
  GUNBOAT_CLASS,
  GUNBOAT_RING,
  ISLANDS,
  ISLAND_SHAPES_1_1,
  MAP_1_1,
  PIRATE_SECTORS,
  PORT_POSITION,
  PORT_SHAPE_1_1,
  PlayerShipClass,
  RESPAWN_FALLBACK,
  RESPAWN_RING,
  SAFE_ZONE_RADIUS,
  SHIP_CLASSES,
  mapOf,
  navClearance
} from '../constants';
import { Navigator, segmentPointDistance } from '../nav';
import { Vec2, angleDelta, distance, forward } from '../vec';
import { addPlayer, createWorld, moveTo, navigatorOf, respawn, shipOfPlayer, step } from '../world';
import { DT, placeCaptain, placeGunboat, placePlayer, run, runUntil } from './helpers';

// Mapa de la 1.1 (GDD §4; puesto 5). Las islas de MAP_1_1 son las de D83, aprobada por Jonattan el 2026-10-18, y el puerto,
// el de D92, aprobado el 2026-10-19 (constants.ts, PORT_SHAPE_1_1 y MOORINGS_1_1). La lógica (uniones de círculos, destino
// inalcanzable y amarres) no depende de la disposición
const world11 = (seed = 1, i2 = false) => createWorld({ seed, spawnNpcs: false, i2, map: MAP_1_1 });
const nav11 = () => navigatorOf(world11());
const deg = (d: number) => (d * Math.PI) / 180;
const [E1a, E1b, E1c] = ['E1a', 'E1b', 'E1c'].map((id) => ISLAND_SHAPES_1_1.find((s) => s.id === id)!.circles[0]);
const CENTER = { x: 140, z: 286 }; // centro del triángulo de E1, a 25,99 m del centro de cada roca
const pathLength = (from: Vec2, path: Vec2[]) => path.reduce((sum, p, i) => sum + distance(i === 0 ? from : path[i - 1], p), 0);

// ¿Se cortan los segmentos ab y cd?
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const side = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}
// ¿Cruza la ruta el campo E1 entre dos rocas? Es decir, ¿corta alguno de los lados del triángulo de sus centros?
const crossesField = (from: Vec2, path: Vec2[]) =>
  path.some((p, i) => [[E1a, E1b], [E1b, E1c], [E1c, E1a]].some(([c, d]) => segmentsCross(i === 0 ? from : path[i - 1], p, c, d)));
// ¿Está el punto dentro del triángulo de E1?
const insideField = (p: Vec2) => {
  const side = (a: Vec2, b: Vec2) => Math.sign((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x));
  const s = [side(E1a, E1b), side(E1b, E1c), side(E1c, E1a)];
  return s.every((v) => v > 0) || s.every((v) => v < 0);
};
// El casco (de proa a popa, sin bauprés) toca una roca de E1 (como AC-20)
const hullTouchesRock = (pos: Vec2, heading: number, length: number) => {
  const f = forward(heading);
  const bow = { x: pos.x + (f.x * length) / 2, z: pos.z + (f.z * length) / 2 };
  const stern = { x: pos.x - (f.x * length) / 2, z: pos.z - (f.z * length) / 2 };
  return [E1a, E1b, E1c].some((r) => {
    const t = Math.max(0, Math.min(1, ((r.x - stern.x) * (bow.x - stern.x) + (r.z - stern.z) * (bow.z - stern.z)) / (length * length)));
    return Math.hypot(stern.x + (bow.x - stern.x) * t - r.x, stern.z + (bow.z - stern.z) * t - r.z) < r.radius;
  });
};

// Amarres de D92 (GDD §4, «Amarres de D92»), fila a fila: Q (x, z), el punto del muelle, 2 cm por fuera del borde de la
// unión en ψ (los de puerto-forma-v3.json, la variante de la lámina aprobada, movidos para que el redondeo de Q no meta
// ningún barco en su margen); ψ en grados (0 = +Z, 90 = +X); el centro del Navío atracado (x, z); y la salida del Navío y
// la de la Balandra: del centro del barco atracado al borde de la zona segura, en el rumbo ψ
const GDD_MOORINGS: [number, number, number, number, number, number, number][] = [
  [14.0, 30.02, 0, 14.0, 53.0, 56.1, 69.1],
  [25.67, 26.68, 32, 37.9, 46.2, 50.5, 63.5],
  [34.12, 16.96, 66, 55.1, 26.3, 48.9, 61.9],
  [45.74, 2.51, 60, 65.7, 14.0, 44.2, 57.2],
  [47.85, -8.37, 98, 70.6, -11.6, 38.4, 51.4],
  [42.82, -18.24, 136, 58.8, -34.8, 42.6, 55.6],
  [32.78, -22.93, 174, 35.2, -45.8, 56.5, 69.5],
  [-45.89, -12.25, 241, -66.0, -23.4, 40.3, 53.3],
  [-47.58, -0.18, 283, -70.0, 5.0, 40.1, 53.1],
  [-39.77, 10.59, 329, -51.6, 30.3, 53.6, 66.6],
  [-24.94, 25.82, 324, -38.5, 44.4, 51.3, 64.3],
  [-12.0, 30.02, 0, -12.0, 53.0, 56.3, 69.3]
];
const D92 = GDD_MOORINGS.map(([x, z, psi]) => ({ q: { x, z }, psi }));
// El punto a d m de Q en el rumbo ψ del amarre: el barco atracado tiene el centro a L/2 + 2 (su margen), y el eje del
// amarre va de Q (d = 0) a Q + 46 m
const along = (m: (typeof D92)[number], d: number) => ({ x: m.q.x + forward(deg(m.psi)).x * d, z: m.q.z + forward(deg(m.psi)).z * d });
// Las 5 clases del jugador de la 1.1 (GDD §6): eslora y manga en m, las de scripts/ux/mapa/puerto_forma.py, con las que ux
// sacó la tabla; el margen es L/2 + 2. La Goleta y el Navío aún no están en SHIP_CLASSES de esta rama
const HULLS_1_1: [string, number, number][] = [['Balandra', 16, 4.4], ['Goleta', 22, 5.6], ['Bergantín', 24, 6.2], ['Fragata', 34, 8.6], ['Navío', 42, 11.2]];
// Del centro c al borde de la zona segura en el rumbo ψ
const exitLength = (c: Vec2, psi: number) => {
  const d = forward(deg(psi));
  const b = c.x * d.x + c.z * d.z;
  return -b + Math.sqrt(b * b - (c.x * c.x + c.z * c.z - SAFE_ZONE_RADIUS * SAFE_ZONE_RADIUS));
};

// El casco (de proa a popa, sin bauprés) toca un círculo del puerto de MAP_1_1 (como AC-20)
const PORT_CIRCLES = ISLAND_SHAPES_1_1.find((s) => s.id === 'PORT')!.circles;
const hullTouchesPort = (pos: Vec2, heading: number, length: number) => {
  const f = forward(heading);
  const bow = { x: pos.x + (f.x * length) / 2, z: pos.z + (f.z * length) / 2 };
  const stern = { x: pos.x - (f.x * length) / 2, z: pos.z - (f.z * length) / 2 };
  return PORT_CIRCLES.some((c) => segmentPointDistance(stern, bow, c) < c.radius);
};

describe('E16 — Mapa de la 1.1 (D83 y el puerto de D92)', () => {
  // GDD §4, tabla de círculos de D83 y D92 (scripts/ux/mapa/circulos.py, ASSET-SPEC §9.7): id, arquetipo y sus círculos
  // [x, z, radio]. Los del puerto: ciudad este, ciudad oeste, fuerte, muelle este, palmar, roca e islote
  const GDD_TABLE: [string, string, [number, number, number][]][] = [
    ['PORT', 'port', [[14, 8, 22], [-12, 8, 22], [0, -22, 15], [31, -6, 17], [-31, -4, 17], [-16, -30, 9], [-39, -31, 4.5]]],
    ['I1', 'tropical', [[260, 200, 45], [212, 214, 30], [305, 182, 28], [225, 150, 8], [275, 255, 7]]],
    ['I2', 'rocky', [[-305, 160, 28], [-282, 188, 18], [-318, 186, 13], [-336, 138, 6]]],
    ['I3', 'rocky', [[-220, -280, 55], [-175, -250, 30], [-158, -312, 9]]],
    ['I4', 'rocky', [[250, -260, 40], [212, -232, 24], [262, -218, 18], [205, -282, 8]]],
    ['I5', 'tropical', [[20, 360, 30], [-14, 340, 18], [56, 338, 8]]],
    ['I6', 'tropical', [[-413, -36, 21], [-400, -18, 12], [-368, -62, 9]]],
    ['T1', 'tropical', [[150, -150, 22], [128, -168, 14], [170, -132, 12]]],
    ['T2', 'tropical', [[-170, 150, 22], [-190, 132, 14], [-150, 168, 12]]],
    ['E1a', 'reef', [[140, 260, 7]]],
    ['E1b', 'reef', [[117.5, 299, 7]]],
    ['E1c', 'reef', [[162.5, 299, 7]]],
    ['G1', 'cove', [[373.66, -373.66, 13], [355.27, -375.07, 9], [375.07, -355.27, 9]]],
    ['G2', 'cove', [[-373.66, -373.66, 13], [-375.07, -355.27, 9], [-355.27, -375.07, 9]]],
    ['G3', 'cove', [[-373.66, 373.66, 13], [-355.27, 375.07, 9], [-375.07, 355.27, 9]]],
    ['G4', 'cove', [[373.66, 373.66, 13], [375.07, 355.27, 9], [355.27, 375.07, 9]]]
  ];
  const circles = ISLAND_SHAPES_1_1.flatMap((s) => s.circles.map((c) => ({ shape: s, ...c })));
  type ShapeCircle = (typeof circles)[number];
  const OLD = new Map(ISLANDS.map((i) => [i.id, i]));
  // Un círculo entero dentro del de la 1.0 de su isla no tapa nada que la 1.0 no tapara: las reglas de AC-170 (AC-199 b)
  // son sobre lo que crece fuera de la 1.0
  const contained = (c: ShapeCircle) => {
    const o = OLD.get(c.shape.id);
    return !!o && Math.hypot(c.x - o.x, c.z - o.z) + c.radius <= o.radius + 1e-9;
  };
  // Lo que crece: los puntos del borde del círculo (cada 0,5°) que caen fuera del de la 1.0 de su isla (todo el borde si
  // es nueva)
  const growth = (c: ShapeCircle) => {
    const o = OLD.get(c.shape.id);
    return Array.from({ length: 720 }, (_, k) => ({ x: c.x + c.radius * Math.cos((2 * Math.PI * k) / 720), z: c.z + c.radius * Math.sin((2 * Math.PI * k) / 720) })).filter(
      (p) => !o || Math.hypot(p.x - o.x, p.z - o.z) > o.radius + 1e-6
    );
  };
  // Distancia de un punto al borde de la unión de una isla (negativa dentro)
  const unionEdge = (id: string, p: Vec2) => Math.min(...circles.filter((c) => c.shape.id === id).map((c) => Math.hypot(p.x - c.x, p.z - c.z) - c.radius));

  test('AC-170: las 16 formas de GDD §4 (D83 y D92) con su arquetipo y sus 50 círculos, la lista plana de círculos del mapa y los 12 amarres de D92', () => {
    expect(ISLAND_SHAPES_1_1.map((s) => [s.id, s.archetype, s.circles.map((c) => [c.x, c.z, c.radius])])).toEqual(GDD_TABLE);
    expect(MAP_1_1.islands).toEqual(GDD_TABLE.flatMap(([id, , cs]) => cs.map(([x, z, radius], k) => ({ id: cs.length > 1 ? `${id}.${k}` : id, x, z, radius }))));
    expect(MAP_1_1.islands).toHaveLength(50);
    expect(MAP_1_1.moorings.map((m) => [m.x, m.z, m.psiDeg])).toEqual(GDD_MOORINGS.map(([x, z, psi]) => [x, z, psi]));
  });

  // GDD §4, «El puerto con forma de isla»: ≤ 8 círculos, su unión contiene el centro (0, 0) y ningún círculo pasa de 55 m
  // del centro con su borde. Se calcula sobre el puerto del código, no sobre la copia de la tabla (O-58 ii)
  test('AC-170: el puerto del mapa (PORT_SHAPE_1_1) tiene ≤ 8 círculos, su unión contiene el centro y ninguno pasa de 55 m del centro con su borde', () => {
    const port = MAP_1_1.shapes.find((s) => s.id === 'PORT')!;
    const reach = port.circles.map((c) => Math.hypot(c.x - PORT_POSITION.x, c.z - PORT_POSITION.z) + c.radius);
    console.log(`AC-170: el puerto tiene ${port.circles.length} círculos y su borde más lejano está a ${Math.max(...reach).toFixed(3)} m del centro`);
    expect(port).toBe(PORT_SHAPE_1_1);
    expect(port.circles.length).toBeLessThanOrEqual(8);
    expect(port.circles.some((c) => Math.hypot(c.x - PORT_POSITION.x, c.z - PORT_POSITION.z) < c.radius)).toBe(true);
    expect(Math.max(...reach)).toBeLessThanOrEqual(55);
  });

  test('AC-170: entre los círculos de islas distintas hay ≥ 46 m de borde a borde, salvo entre los 3 escollos, a 31 ±0,5 m, y nada toca la zona segura salvo el puerto', () => {
    const gaps: string[] = [];
    circles.forEach((a, i) =>
      circles.slice(i + 1).forEach((b) => {
        if (a.shape.id === b.shape.id) return;
        const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius;
        const reefs = a.shape.archetype === 'reef' && b.shape.archetype === 'reef';
        if (reefs ? Math.abs(gap - 31) > 0.5 : gap < 46) gaps.push(`${a.shape.id}–${b.shape.id} ${gap.toFixed(1)} m`);
      })
    );
    expect(gaps).toEqual([]);
    const inSafeZone = circles.filter((c) => c.shape.id !== 'PORT' && Math.hypot(c.x, c.z) - c.radius < SAFE_ZONE_RADIUS).map((c) => c.shape.id);
    expect(inSafeZone).toEqual([]);
  });

  // Arco de la guarida (GDD §9): 440 m, de 7,5° a 82,5° de cada cuadrante, cada 2,5° (31 puntos por sector)
  const lairArc = PIRATE_SECTORS.flatMap(({ id, sx, sz }) =>
    Array.from({ length: 31 }, (_, k) => ({ sector: id, deg: 7.5 + 2.5 * k, x: Math.cos(deg(7.5 + 2.5 * k)) * 440 * sx, z: Math.sin(deg(7.5 + 2.5 * k)) * 440 * sz }))
  );

  test('AC-170: lo que las islas crecen fuera de la 1.0 queda a ≥ 17 m del arco de la guarida y fuera del anillo de la cañonera (400–470 m) con 16 m', () => {
    let arcMin = { d: Infinity, id: '' };
    const inBand: string[] = [];
    for (const c of circles)
      for (const p of growth(c)) {
        const d = Math.min(...lairArc.map((q) => Math.hypot(p.x - q.x, p.z - q.z)));
        if (d < arcMin.d) arcMin = { d, id: c.shape.id };
        const r = Math.hypot(p.x, p.z);
        if (r > 400 - 16 && r < 470 + 16) inBand.push(`${c.shape.id} (${c.x}, ${c.z}, ${c.radius}) a r ${r.toFixed(1)}`);
      }
    console.log(`AC-170: lo nuevo, a ${arcMin.d.toFixed(2)} m del arco de la guarida (${arcMin.id}; pide ≥ 17) · bordes nuevos dentro del anillo 384–486 m: ${inBand.length}`);
    expect(lairArc).toHaveLength(124);
    expect(arcMin.d).toBeGreaterThanOrEqual(17);
    expect([...new Set(inBand.map((s) => s.split(' ')[0]))]).toEqual([]);
  });

  // El abanico de aparición de la cañonera con el navigable() real (pirateSpot, world.ts): de 0,12 a π/2 − 0,12 rad de
  // cada sector, r de 400 a 470 m y el margen de la cañonera, en una rejilla de 1 m por 0,25°. La 1.0 ya tapa parte del
  // abanico (I3 e I4 entran en 400 − 16): la regla es que D83 no tape ningún punto que la 1.0 dejaba libre. La holgura de
  // cada círculo se escribe aparte para los nuevos y para los que caen dentro de la 1.0 (que no pueden tapar nada nuevo):
  // con una sola cifra por isla, los círculos contenidos de I6 (−23,3) escondían su islote nuevo (+1,8)
  test('AC-170: el abanico de aparición de la cañonera no pierde ningún punto que la 1.0 dejaba libre; holgura de los círculos nuevos ≥ 0', () => {
    const m = navClearance(GUNBOAT_CLASS);
    const nav = nav11();
    const nav10 = new Navigator(ISLANDS);
    const fan: Vec2[] = [];
    for (const { sx, sz } of PIRATE_SECTORS)
      for (let a = 0.12; a <= Math.PI / 2 - 0.12 + 1e-9; a += deg(0.25))
        for (let r = GUNBOAT_RING.min; r <= GUNBOAT_RING.max + 1e-9; r += 1) fan.push({ x: Math.cos(a) * r * sx, z: Math.sin(a) * r * sz });
    const newlyBlocked = fan.filter((p) => nav10.navigable(p, m) && !nav.navigable(p, m));
    // Holgura de cada círculo al abanico, solo de los que quedan a < 30 m de su corona (los demás no pueden tocarlo)
    const near = circles.filter((c) => Math.hypot(c.x, c.z) + c.radius + m > GUNBOAT_RING.min - 30 && Math.hypot(c.x, c.z) - c.radius - m < GUNBOAT_RING.max + 30);
    const slack = (c: ShapeCircle) => fan.reduce((min, p) => Math.min(min, Math.hypot(p.x - c.x, p.z - c.z) - c.radius - m), Infinity);
    const fresh = near.filter((c) => !contained(c)).map((c) => ({ c, d: slack(c) })).sort((a, b) => a.d - b.d);
    const inside = near.filter(contained).map((c) => ({ c, d: slack(c) })).sort((a, b) => a.d - b.d);
    const show = (l: { c: ShapeCircle; d: number }[]) => l.slice(0, 4).map(({ c, d }) => `${c.shape.id} (${c.x}, ${c.z}, ${c.radius}) ${d.toFixed(2)}`).join(' · ');
    console.log(
      `AC-170: abanico de la cañonera, ${fan.length} puntos, margen ${m}: libres en la 1.0 y tapados por D83: ${newlyBlocked.length} · holgura de los círculos nuevos a < 30 m del anillo (${fresh.length}): ${show(fresh)} · de los contenidos en la 1.0 (${inside.length}, no cuentan): ${show(inside)}`
    );
    expect(newlyBlocked).toEqual([]);
    expect(Math.min(...fresh.map((f) => f.d))).toBeGreaterThanOrEqual(0);
  });

  test('AC-170: de los 124 puntos del arco, solo el de 7,5° del sector NO no es navegable para el Capitán, a 10,6 ±0,5 m del borde de la unión de I6', () => {
    const nav = nav11();
    const blocked = lairArc.filter((p) => !nav.navigable(p, navClearance(CAPTAIN_CLASS)));
    const edge = blocked.map((p) => unionEdge('I6', p));
    console.log(`AC-170: puntos del arco no navegables para el Capitán: ${blocked.map((p, k) => `${p.sector} ${p.deg}° (a ${edge[k].toFixed(2)} m de la unión de I6)`).join(' · ')}`);
    expect(blocked.map((p) => [p.sector, p.deg])).toEqual([['NO', 7.5]]);
    expect(Math.abs(edge[0] - 10.6)).toBeLessThanOrEqual(0.5);
  });

  // AC-171 sin reloj: lo que pide es que los grafos ya estén hechos al crear el mundo. Se cuenta con buildCount: la primera
  // ruta, el primer clic dentro de una isla y el primer contacto con la costa de cada clase no construyen nada. El mapa es
  // una copia de MAP_1_1 con su propia lista de islas, así que su navegador es nuevo y no hereda lo que hayan construido
  // otros tests. El tiempo de la primera ruta (preparada y sin preparar) solo se registra: depende de la máquina, y con una
  // cota absoluta de 2 ms la CI daba rojos de tiempo (2,06 ms en el run 39140547625)
  test('AC-171: el mundo prepara al crearse los grafos y los cruces de todas las clases: la primera ruta, el primer clic en una isla y el primer contacto con la costa de cada clase no construyen nada', () => {
    const world = createWorld({ seed: 2, spawnNpcs: false, map: mapOf('1.1-arranque', ISLAND_SHAPES_1_1, MAP_1_1.moorings) });
    const nav = navigatorOf(world);
    const prepared = nav.buildCount;
    const graphsAtBoot = nav.graphMargins;
    const lair = { x: 311.1, z: -311.1 };
    const firstRoute = Object.keys(SHIP_CLASSES).map((classId) => {
      const m = navClearance(classId);
      const t0 = performance.now();
      nav.findPath(along(D92[7], m), lair, m); // del amarre 8, al oeste, a la guarida NE: rodea el puerto, necesita el grafo
      const ms = performance.now() - t0;
      nav.nearestNavigable({ x: E1a.x, z: E1a.z + 1 }, m); // dentro de una roca: necesita los cruces
      nav.pushOut({ x: E1a.x, z: E1a.z + 1 }, SHIP_CLASSES[classId].radius);
      return `${classId} ${ms.toFixed(3)}`;
    });
    const cold = new Navigator(MAP_1_1.islands);
    const t0 = performance.now();
    cold.findPath({ x: -40, z: -40 }, lair, navClearance('frigate'));
    console.log(`AC-171: ${prepared} grafos y conjuntos de cruces preparados al crear el mundo · primera ruta (ms): ${firstRoute.join(' · ')} · sin preparar (frigate): ${(performance.now() - t0).toFixed(3)}`);
    // El grafo de cada margen de las clases del juego (hoy 7; 9 cuando entren la Goleta, el Galeón y el Navío), y además los
    // cruces de cada margen y de cada radio de colisión: 7 + 7 + 5 = 19 construcciones hoy
    const classes = Object.values(SHIP_CLASSES);
    expect(graphsAtBoot).toEqual([...new Set(Object.keys(SHIP_CLASSES).map(navClearance))].sort((a, b) => a - b));
    expect(prepared).toBe(2 * new Set(classes.map((c) => c.length)).size + new Set(classes.map((c) => c.radius)).size);
    expect(nav.buildCount).toBe(prepared);
  });
});

describe('E16 — Escollos y destino inalcanzable (AC-172)', () => {
  const WEST = { x: 40, z: 279.5 };
  const EAST = { x: 240, z: 279.5 }; // la recta entre los dos pasa por los pasos de E1a–E1b y E1a–E1c

  test.each([
    [10, 'Balandra', true],
    [12, 'pirata', true],
    [13, 'Goleta y mercante', true],
    [14, 'Bergantín', true],
    [16, 'Cañonera', false],
    [17, 'Capitán', false],
    [19, 'Fragata', false],
    [20, 'Galeón', false],
    [23, 'Navío', false]
  ])('con margen %i (%s), la ruta de un lado a otro de E1 cruza el triángulo entre dos rocas: %s; y ningún tramo entra en el margen de una roca', (margin, _, crosses) => {
    const nav = nav11();
    const path = nav.findPath(WEST, EAST, margin);
    expect(path[path.length - 1]).toEqual(EAST);
    expect(crossesField(WEST, path)).toBe(crosses);
    expect(path.every((p, i) => nav.segmentClear(i === 0 ? WEST : path[i - 1], p, margin))).toBe(true);
  });

  test.each(['sloop', 'pirate', 'merchant', 'brig', 'gunboat', 'captain', 'frigate'])('%s: de un lado a otro de E1, el casco no toca ninguna roca en ningún tick y llega a ≤ 2 m (AC-20)', (classId) => {
    const world = world11(3);
    const ship = placePlayer(world, 'a', WEST.x, WEST.z, Math.PI / 2);
    ship.classId = classId;
    moveTo(world, 'a', EAST);
    let touched = false;
    const t = runUntil(world, 120, () => {
      touched ||= hullTouchesRock(ship.pos, ship.heading, SHIP_CLASSES[classId].length);
      return ship.destination === null && ship.speed === 0;
    });
    expect({ classId, touched, arrived: t !== Infinity && distance(ship.pos, EAST) <= 2 }).toEqual({ classId, touched: false, arrived: true });
  });

  // (a) Destino no navegable para la clase (margen ≥ 18,99 m): el punto navegable más cercano, fuera del campo y alcanzable
  test.each([
    ['Fragata', 19],
    ['Navío', 23]
  ])('AC-172 (a): un clic de %s en el centro del triángulo lleva al punto navegable más cercano, fuera del campo, y la ruta llega a él sin entrar en el margen de las rocas', (_, margin) => {
    const nav = nav11();
    const dest = nav.nearestNavigable(CENTER, margin);
    const path = nav.findPath(WEST, dest, margin);
    console.log(`AC-172 (a) margen ${margin}: destino a ${distance(dest, CENTER).toFixed(2)} m del centro, ruta de ${path.length} tramos`);
    expect(insideField(dest)).toBe(false);
    expect(path[path.length - 1]).toEqual(dest);
    expect(path.every((p, i) => nav.segmentClear(i === 0 ? WEST : path[i - 1], p, margin))).toBe(true);
  });

  // (b) Navegable pero no alcanzable (margen de 15,5 a 18,99 m): el punto alcanzable más cercano, frente a un paso. Está
  // en el cruce exterior de los márgenes de dos rocas: a 12,99 m del centro hasta el paso y √((7 + margen)² − 22,5²) más
  test.each([
    ['Cañonera', 16],
    ['Capitán', 17]
  ])('AC-172 (b): con destino en el centro del triángulo, la ruta de %s acaba en el punto alcanzable más cercano, frente a un paso, y nunca en línea recta contra el campo', (_, margin) => {
    const nav = nav11();
    expect(nav.nearestNavigable(CENTER, margin)).toEqual(CENTER); // el centro es navegable para la clase
    const path = nav.findPath(WEST, CENTER, margin);
    const end = path[path.length - 1];
    const expected = 12.99 + Math.sqrt((7 + margin + 0.05) ** 2 - 22.5 ** 2);
    console.log(`AC-172 (b) margen ${margin}: acaba a ${distance(end, CENTER).toFixed(2)} m del centro (cálculo: ${expected.toFixed(2)}), ruta de ${path.length} tramos`);
    expect(insideField(end)).toBe(false);
    expect(Math.abs(distance(end, CENTER) - expected)).toBeLessThanOrEqual(0.1);
    expect(path.every((p, i) => nav.segmentClear(i === 0 ? WEST : path[i - 1], p, margin))).toBe(true);
  });

  // (c) La ruta hasta el punto alcanzable es la del navegador con ese punto como destino, a ±0,01 m (O-57). En 1e2022f, el
  // Capitán desde WEST recorría 676,6 m, por un nodo de I2, en lugar de 82,0, y la Cañonera desde (100, 280), 752,0 en
  // lugar de 25,7 (QA-47)
  test.each([
    ['del Capitán', 17, WEST, 82.0],
    ['de la Cañonera', 16, { x: 100, z: 280 }, 25.7]
  ])('AC-172 (c): la ruta %s hasta el punto alcanzable mide lo mismo que la del navegador con ese punto de destino', (_, margin, from, qa) => {
    const nav = nav11();
    const path = nav.findPath(from, CENTER, margin);
    const end = path[path.length - 1];
    const got = pathLength(from, path);
    const want = pathLength(from, nav.findPath(from, end, margin));
    console.log(`AC-172 (c) margen ${margin}: ruta de ${got.toFixed(2)} m; con el punto de destino, ${want.toFixed(2)} m (QA-47: ${qa.toFixed(1)})`);
    expect(Math.abs(got - want)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(want - qa)).toBeLessThanOrEqual(0.05);
  });

  // (c) en la rejilla de orígenes cada 20 m por todo el mapa (los navegables para el margen), con destino en el centro de E1
  test.each([16, 17])(
    'AC-172 (c): con margen %i, desde cada origen de la rejilla de 20 m la ruta hasta el punto alcanzable mide lo mismo que con ese punto de destino',
    (margin) => {
      const nav = nav11();
      const wrong: string[] = [];
      let origins = 0;
      let outside = 0;
      let worst = 0;
      for (let x = -480; x <= 480; x += 20) {
        for (let z = -480; z <= 480; z += 20) {
          const from = { x, z };
          if (!nav.navigable(from, margin)) continue;
          origins++;
          const path = nav.findPath(from, CENTER, margin);
          const end = path[path.length - 1];
          if (distance(end, CENTER) > 0.01) outside++;
          const diff = Math.abs(pathLength(from, path) - pathLength(from, nav.findPath(from, end, margin)));
          worst = Math.max(worst, diff);
          if (diff > 0.01) wrong.push(`(${x}, ${z}): ${diff.toFixed(2)} m de más`);
        }
      }
      console.log(`AC-172 (c) margen ${margin}: ${origins} orígenes, ${outside} acaban fuera del centro, ${wrong.length} con la ruta más larga (peor diferencia ${worst.toFixed(3)} m)`);
      expect({ wrong: wrong.length, first: wrong.slice(0, 5) }).toEqual({ wrong: 0, first: [] });
    },
    120_000
  );

  // AC-199 (e): el cliente calcula la ruta desde su posición interpolada para pintar el marcador en el mismo frame, así que
  // el punto alcanzable no puede depender del origen exacto, solo de la zona desde la que se llega
  test.each([16, 17])('AC-199 (e): con margen %i, el punto alcanzable que sustituye al centro del triángulo es el mismo desde orígenes distintos de la misma zona', (margin) => {
    const nav = nav11();
    const starts = [WEST, EAST, { x: 140, z: 360 }, { x: 140, z: 225 }, { x: 128, z: 316 }, { x: 101, z: 272 }];
    const ends = starts.map((s) => {
      const path = nav.findPath(s, CENTER, margin);
      return path[path.length - 1];
    });
    expect(ends.map((e) => ({ x: e.x.toFixed(6), z: e.z.toFixed(6) }))).toEqual(starts.map(() => ({ x: ends[0].x.toFixed(6), z: ends[0].z.toFixed(6) })));
  });

  test('AC-172 (b): moveTo de un barco al que no le cabe el paso deja como destino el punto alcanzable, no el centro', () => {
    const world = world11(4, true);
    const ship = placePlayer(world, 'a', WEST.x, WEST.z, Math.PI / 2);
    ship.classId = CAPTAIN_CLASS; // margen 17: el centro es navegable, pero no se llega a él
    moveTo(world, 'a', CENTER);
    expect(insideField(ship.destination!)).toBe(false);
    expect(ship.destination).toEqual(ship.path[ship.path.length - 1]);
  });

  // La IA del Capitán y la de la cañonera, con una Balandra metida en el triángulo: no tocan roca y disparan desde fuera
  test.each([
    ['Capitán', placeCaptain],
    ['Cañonera', placeGunboat]
  ])('AC-172 (b): el %s que persigue a una Balandra metida en el triángulo no toca ninguna roca en 60 s, nunca tiene el destino dentro del campo y le dispara', (_, place) => {
    const world = world11(5, true);
    const prey = placePlayer(world, 'p', CENTER.x, CENTER.z, 0);
    prey.hp = prey.maxHp = 1e9;
    const hunter = place(world, 140, 360, Math.PI); // a 74 m: dentro del radio de detección de los dos (80 y 90 m)
    let touched = false;
    let destInside = false;
    const events = run(world, 60, () => {
      touched ||= hullTouchesRock(hunter.pos, hunter.heading, SHIP_CLASSES[hunter.classId].length);
      destInside ||= hunter.destination !== null && insideField(hunter.destination);
    });
    const volleys = events.filter((e) => e.type === 'volley' && e.shipId === hunter.id).length;
    console.log(`AC-172 (b) IA: ${hunter.classId} · ${volleys} andanadas a la Balandra del centro en 60 s`);
    expect({ touched, destInside }).toEqual({ touched: false, destInside: false });
    expect(volleys).toBeGreaterThan(0);
  });
});

describe('E16 — Islas de varios círculos (AC-199, opción B)', () => {
  // Una isla de 2 círculos que se solapan, con su entrante entre los dos en z = 180 (los bordes inflados por el radio de
  // colisión de la Balandra, 5 m, se cruzan en (15, 180) y (15, 220))
  const UNION = mapOf('prueba', [{ id: 'U', archetype: 'rocky', circles: [{ x: 0, z: 200, radius: 20 }, { x: 30, z: 200, radius: 20 }] }], []);

  test('la colisión saca el casco por el punto más cercano del borde de la unión, también en el entrante entre dos círculos', () => {
    const world = createWorld({ seed: 1, spawnNpcs: false, map: UNION });
    const ship = placePlayer(world, 'a', 15, 185);
    ship.speed = 0;
    step(world, DT);
    const radius = SHIP_CLASSES.sloop.radius;
    expect(UNION.islands.every((c) => Math.hypot(ship.pos.x - c.x, ship.pos.z - c.z) >= c.radius + radius - 1e-6)).toBe(true);
    expect(distance(ship.pos, { x: 15, z: 180 })).toBeLessThan(0.01);
  });

  test('las rutas rodean la unión entera, y un clic dentro de ella lleva al borde de la unión a su margen', () => {
    const nav = navigatorOf(createWorld({ seed: 1, spawnNpcs: false, map: UNION }));
    const margin = navClearance('sloop');
    const path = nav.findPath({ x: 15, z: 120 }, { x: 15, z: 280 }, margin);
    expect(path.length).toBeGreaterThan(1);
    expect(path.every((p, i) => nav.segmentClear(i === 0 ? { x: 15, z: 120 } : path[i - 1], p, margin))).toBe(true);
    const click = nav.nearestNavigable({ x: 15, z: 195 }, margin);
    const edge = Math.min(...UNION.islands.map((c) => Math.hypot(click.x - c.x, click.z - c.z) - c.radius));
    expect(Math.abs(edge - margin)).toBeLessThanOrEqual(0.1);
  });
});

describe('E16 — Amarres del puerto de D92 (AC-176, AC-199 d)', () => {
  // El amarre cuyo eje (de Q a Q + 46 m en ψ) pasa a ≤ 0,5 m del punto; −1 si ninguno
  const mooringOf = (p: Vec2) => D92.findIndex((m) => segmentPointDistance(along(m, 0), along(m, 46), p) <= 0.5);
  // Barco vivo y sin IA con el centro a d m de Q en el amarre k
  const occupy = (world: ReturnType<typeof world11>, k: number, d: number) => {
    const at = along(D92[k], d);
    return placePlayer(world, `o${k}-${world.ships.size}`, at.x, at.z, deg(D92[k].psi));
  };
  const asClass = (classId: string) => ({ gold: 0, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'] as PlayerShipClass[], activeShip: classId as PlayerShipClass });
  // El casco atracado en planta: el rectángulo de L × B alineado con ψ y centrado en el centro del barco (puerto_forma.py, hull)
  const hullOf = (m: (typeof D92)[number], length: number, beam: number) => {
    const c = along(m, length / 2 + 2);
    const d = forward(deg(m.psi));
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: c.x + ((a * length) / 2) * d.x + ((b * beam) / 2) * d.z, z: c.z + ((a * length) / 2) * d.z - ((b * beam) / 2) * d.x }));
  };
  // Holgura entre dos rectángulos convexos: −1 si ningún eje de sus lados los separa (se solapan); si no, la menor
  // distancia de un vértice de uno a un lado del otro
  const hullGap = (A: Vec2[], B: Vec2[]) => {
    const sides = (P: Vec2[]) => P.map((p, i) => ({ x: -(P[(i + 1) % 4].z - p.z), z: P[(i + 1) % 4].x - p.x }));
    const separated = [...sides(A), ...sides(B)].some((n) => {
      const pa = A.map((p) => p.x * n.x + p.z * n.z);
      const pb = B.map((p) => p.x * n.x + p.z * n.z);
      return Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa);
    });
    if (!separated) return -1;
    const toSides = (P: Vec2[], Q: Vec2[]) => Math.min(...P.flatMap((p) => Q.map((q, i) => segmentPointDistance(q, Q[(i + 1) % 4], p))));
    return Math.min(toSides(A, B), toSides(B, A));
  };

  test('AC-04: las 12 filas de GDD §4 cuadran entre sí: el centro del Navío a 23 m de Q en ψ y las salidas del Navío y la Balandra (±0,05 m)', () => {
    const near = (a: number, b: number) => Math.abs(a - b) <= 0.05;
    const wrong = GDD_MOORINGS.flatMap(([, , psi, lx, lz, exitLine, exitSloop], k) => {
      const line = along(D92[k], 23);
      const got = [near(line.x, lx) && near(line.z, lz), near(exitLength(line, psi), exitLine), near(exitLength(along(D92[k], 10), psi), exitSloop)];
      return got.every(Boolean) ? [] : [`amarre ${k + 1}: ${got}`];
    });
    expect(wrong).toEqual([]);
  });

  test.each(['sloop', 'brig', 'frigate'])('%s: con los otros 11 amarres ocupados, aparece en el que queda, con el centro a L/2 + 2 ±0,5 m de Q en ψ y la proa en ψ ±5°', (classId) => {
    for (const [k, m] of D92.entries()) {
      const world = world11(k + 1);
      D92.forEach((_, j) => {
        if (j !== k) occupy(world, j, 23);
      });
      addPlayer(world, 'a', 'a', asClass(classId));
      const ship = shipOfPlayer(world, 'a')!;
      const off = distance(ship.pos, along(m, navClearance(classId)));
      expect({ k, off: off <= 0.5, heading: Math.abs(angleDelta(ship.heading, deg(m.psi))) <= deg(5) }).toEqual({ k, off: true, heading: true });
    }
  });

  test('los amarres se reparten al azar con la semilla entre los libres', () => {
    const used = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const world = world11(seed);
      addPlayer(world, 'a', 'a');
      used.add(mooringOf(shipOfPlayer(world, 'a')!.pos));
    }
    expect(used.has(-1)).toBe(false);
    expect(used.size).toBeGreaterThanOrEqual(10);
  });

  test('con un Navío atracado en un amarre (centro a 23 m de Q), una Balandra nunca toma ese amarre, aunque su punto (10 m) quede a 13 m de él', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const world = world11(seed);
      occupy(world, 4, 23);
      addPlayer(world, 'a', 'a');
      const k = mooringOf(shipOfPlayer(world, 'a')!.pos);
      expect({ seed, k: k >= 0 && k !== 4 }).toEqual({ seed, k: true });
    }
  });

  test('con 11 amarres ocupados por Navíos, la Balandra toma el 12.º; con los 12 ocupados, aparece en el anillo de 60–90 m', () => {
    const world = world11(7);
    for (let k = 0; k < 12; k++) if (k !== 8) occupy(world, k, 23);
    addPlayer(world, 'a', 'a');
    expect(mooringOf(shipOfPlayer(world, 'a')!.pos)).toBe(8);
    addPlayer(world, 'b', 'b');
    const r = Math.hypot(shipOfPlayer(world, 'b')!.pos.x, shipOfPlayer(world, 'b')!.pos.z);
    expect(r).toBeGreaterThanOrEqual(RESPAWN_RING.min);
    expect(r).toBeLessThanOrEqual(RESPAWN_RING.max);
  });

  test('un barco hundido (no vivo) no ocupa su amarre, y al zarpar se vuelve a un amarre libre', () => {
    const world = world11(8);
    const sunk = occupy(world, 0, 10);
    sunk.state = 'dead';
    const player = world.players.get(sunk.ownerId!)!;
    player.death = { by: null, goldLost: 0, at: world.time - DEATH_COUNTDOWN };
    for (let k = 1; k < 12; k++) occupy(world, k, 10);
    expect(respawn(world, player.id).ok).toBe(true);
    expect(mooringOf(sunk.pos)).toBe(0);
    expect(distance(sunk.pos, along(D92[0], 10))).toBeLessThanOrEqual(0.5);
  });

  // (i) de AC-176: en cada amarre y en las 5 clases, el barco atracado es navegable para su clase frente a toda la unión, y
  // su casco no se solapa con el de ningún barco de otro amarre (las 25 parejas de clases)
  test('AC-176 (i): en cada amarre y con las 5 clases, el centro es navegable para su margen frente a toda la unión, y ningún casco se solapa con el de otro amarre', () => {
    const nav = nav11();
    const notNavigable: string[] = [];
    let slack = Infinity;
    for (const [k, m] of D92.entries()) {
      for (const [name, length] of HULLS_1_1) {
        const c = along(m, length / 2 + 2);
        if (!nav.navigable(c, length / 2 + 2)) notNavigable.push(`${name} en el amarre ${k + 1}`);
        slack = Math.min(slack, nav.edgeClearance(c) - (length / 2 + 2));
      }
    }
    let worst = { gap: Infinity, pair: '' };
    for (let j = 0; j < D92.length; j++) {
      for (let k = j + 1; k < D92.length; k++) {
        for (const [na, la, ba] of HULLS_1_1) {
          for (const [nb, lb, bb] of HULLS_1_1) {
            const gap = hullGap(hullOf(D92[j], la, ba), hullOf(D92[k], lb, bb));
            if (gap < worst.gap) worst = { gap, pair: `${na} en ${j + 1} y ${nb} en ${k + 1}` };
          }
        }
      }
    }
    console.log(`AC-176 (i): menor holgura de un centro atracado a su margen ${slack.toFixed(6)} m · cascos más juntos ${worst.gap.toFixed(2)} m (${worst.pair})`);
    expect(notNavigable).toEqual([]);
    expect(worst.gap).toBeGreaterThan(0);
  });

  test('AC-176 (ii): en cada amarre y con las 5 clases, la recta de salida en ψ hasta el borde de la zona segura es navegable y mide ≤ 80 m', () => {
    const nav = nav11();
    const wrong: string[] = [];
    let longest = 0;
    for (const [k, m] of D92.entries()) {
      for (const [name, length] of HULLS_1_1) {
        const margin = length / 2 + 2;
        const c = along(m, margin);
        const t = exitLength(c, m.psi);
        longest = Math.max(longest, t);
        if (t > 80 || !nav.segmentClear(c, along(m, margin + t), margin)) wrong.push(`${name} en el amarre ${k + 1}: ${t.toFixed(1)} m`);
      }
    }
    console.log(`AC-176 (ii): la salida más larga mide ${longest.toFixed(1)} m`);
    expect(wrong).toEqual([]);
  });

  test('AC-176 (iii): el anillo de 60–90 m es navegable para el Navío en ≥ 50 % de su área (rejilla de 1 m), y el punto de último recurso (RESPAWN_FALLBACK) lo es para las 5 clases', () => {
    const nav = nav11();
    let total = 0;
    let free = 0;
    for (let x = -90; x <= 90; x++) {
      for (let z = -90; z <= 90; z++) {
        const r = Math.hypot(x, z);
        if (r < RESPAWN_RING.min || r > RESPAWN_RING.max) continue;
        total++;
        if (nav.navigable({ x, z }, 23)) free++;
      }
    }
    console.log(`AC-176 (iii): ${free} de ${total} puntos del anillo navegables para el Navío (${((100 * free) / total).toFixed(1)} %)`);
    expect(free / total).toBeGreaterThanOrEqual(0.5);
    expect(HULLS_1_1.filter(([, length]) => !nav.navigable(RESPAWN_FALLBACK, length / 2 + 2))).toEqual([]);
  });

  // O-58 (i): el último recurso, forzado. Con los 12 amarres ocupados y las 50 tiradas del anillo a r 60 m hacia el islote
  // del puerto (−39, −31, r 4,5), a 5,68 m de su borde, donde ni la Balandra (margen 10) cabe, el barco aparece en el punto
  // que da respawnPoint, y ese punto es navegable para las 5 clases. Un cambio del punto en world.ts cae aquí aunque la
  // constante no cambie
  test('AC-176 (iii): con los 12 amarres ocupados y las 50 tiradas del anillo fallidas, el jugador aparece en el punto de último recurso, navegable para las 5 clases', () => {
    const world = world11(3);
    D92.forEach((_, k) => occupy(world, k, 23));
    const nav = navigatorOf(world);
    const a = Math.atan2(-39, -31) + 2 * Math.PI; // rumbo del islote visto desde el centro: x = sin a · r, z = cos a · r
    const ring = { x: Math.sin(a) * RESPAWN_RING.min, z: Math.cos(a) * RESPAWN_RING.min };
    expect(nav.navigable(ring, 10)).toBe(false);
    let draws = 0;
    world.rng = () => (draws++ % 2 === 0 ? a / (2 * Math.PI) : 0); // rumbo a, y r = 60 m
    addPlayer(world, 'x', 'x');
    const ship = shipOfPlayer(world, 'x')!;
    console.log(`AC-176 (iii): ${draws} tiradas del anillo; el barco aparece en (${ship.pos.x}, ${ship.pos.z})`);
    expect(draws).toBe(100);
    expect(ship.pos).toEqual(RESPAWN_FALLBACK);
    expect(HULLS_1_1.filter(([, length]) => !nav.navigable(ship.pos, length / 2 + 2)).map(([name]) => name)).toEqual([]);
  });

  // AC-199 (c) con la tabla de GDD §4, cuya Q va 2 cm por fuera de la lámina (que deja cada barco con 0,00 m de sobra): en
  // el juego, el barco que aparece atracado no se mueve solo, y zarpa por su salida sin que el casco toque el puerto ni
  // nearestNavigable lo desplace
  test.each(['sloop', 'brig', 'frigate'])('AC-199: %s, desde cada amarre, quieto no se mueve en 2 s, y por su salida llega al borde de la zona segura sin tocar el puerto', (classId) => {
    const length = SHIP_CLASSES[classId].length;
    for (const [k, m] of D92.entries()) {
      const world = world11(k + 1);
      D92.forEach((_, j) => {
        if (j !== k) occupy(world, j, 23);
      });
      addPlayer(world, 'a', 'a', asClass(classId));
      const ship = shipOfPlayer(world, 'a')!;
      const moored = { ...ship.pos };
      run(world, 2);
      expect({ k, moved: distance(ship.pos, moored) }).toEqual({ k, moved: 0 });
      const target = along(m, navClearance(classId) + exitLength(moored, m.psi) - 1);
      moveTo(world, 'a', target);
      let touched = false;
      runUntil(world, 30, () => {
        touched ||= hullTouchesPort(ship.pos, ship.heading, length);
        return distance(ship.pos, target) <= 2;
      });
      expect({ k, arrived: distance(ship.pos, target) <= 2, touched }).toEqual({ k, arrived: true, touched: false });
    }
  });

  test('con el mapa de la 1.0 (sin amarres) sigue el anillo de 60–90 m (AC-63)', () => {
    const world = createWorld({ seed: 1, spawnNpcs: false });
    addPlayer(world, 'a', 'a');
    const r = Math.hypot(shipOfPlayer(world, 'a')!.pos.x, shipOfPlayer(world, 'a')!.pos.z);
    expect(r).toBeGreaterThanOrEqual(RESPAWN_RING.min);
    expect(r).toBeLessThanOrEqual(RESPAWN_RING.max);
  });
});

describe('E16 — Rutas del puerto (AC-177, con las islas de D83 y el puerto de D92)', () => {
  const LAIRS = PIRATE_SECTORS.map(({ id, sx, sz }) => ({ id, x: 311.1 * sx, z: 311.1 * sz }));
  const ratio = (nav: Navigator, from: Vec2, to: Vec2, margin: number) => {
    const path = nav.findPath(from, to, margin);
    return pathLength(from, path) / distance(from, path[path.length - 1]);
  };

  // El tope de (a) es 1,16 con D92 (producto, 2026-10-19; BACKLOG AC-177): la ruta del navegador, con sus nodos a margen + 1 m
  // (NAV_NODE_SLACK), da 1,155 del amarre 10 a la guarida NE con el Navío, y la más corta que permite la geometría, 1,146
  test.each([
    ['Balandra', 10],
    ['Navío', 23]
  ])('AC-177 (a): %s, de cada uno de los 12 amarres a la guarida de cada sector, la ruta mide ≤ 1,16 × la recta', (_, margin) => {
    const nav = nav11();
    let worst = { r: 0, from: 0, to: '' };
    for (const [k, m] of D92.entries()) {
      const moor = along(m, margin);
      for (const lair of LAIRS) {
        expect(nav.navigable(lair, margin)).toBe(true);
        const r = ratio(nav, moor, lair, margin);
        if (r > worst.r) worst = { r, from: k + 1, to: lair.id };
      }
    }
    console.log(`AC-177 (a) margen ${margin}: peor ${worst.r.toFixed(3)} (del amarre ${worst.from} a la guarida ${worst.to})`);
    expect(worst.r).toBeLessThanOrEqual(1.16);
  });

  test.each([
    ['Balandra', 10],
    ['Navío', 23]
  ])('AC-177 (b): %s, desde 8 puntos a 300 m del puerto hasta el amarre más cercano, la ruta mide ≤ 1,15 × la recta', (_, margin) => {
    const nav = nav11();
    const moorings = D92.map((m) => along(m, margin));
    const out: string[] = [];
    let worst = 0;
    for (let k = 0; k < 8; k++) {
      const f = forward(deg(45 * k));
      const raw = { x: f.x * 300, z: f.z * 300 };
      const from = nav.nearestNavigable(raw, margin);
      const to = moorings.reduce((best, m) => (distance(from, m) < distance(from, best) ? m : best));
      const r = ratio(nav, from, to, margin);
      worst = Math.max(worst, r);
      out.push(`${45 * k}°${distance(raw, from) > 0 ? ` (movido ${distance(raw, from).toFixed(1)} m)` : ''}: ${r.toFixed(3)}`);
    }
    console.log(`AC-177 (b) margen ${margin}: ${out.join(' · ')}`);
    expect(worst).toBeLessThanOrEqual(1.15);
  });
});

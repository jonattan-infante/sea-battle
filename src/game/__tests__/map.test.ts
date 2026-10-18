import {
  CAPTAIN_CLASS,
  DEATH_COUNTDOWN,
  ISLANDS,
  ISLAND_SHAPES_1_1,
  MAP_1_1,
  MOORINGS,
  PIRATE_SECTORS,
  PORT_RADIUS,
  PlayerShipClass,
  RESPAWN_RING,
  SAFE_ZONE_RADIUS,
  SHIP_CLASSES,
  mapOf,
  navClearance
} from '../constants';
import { Navigator } from '../nav';
import { Vec2, angleDelta, distance, forward } from '../vec';
import { addPlayer, createWorld, moveTo, navigatorOf, respawn, shipOfPlayer, step } from '../world';
import { DT, placeCaptain, placeGunboat, placePlayer, run, runUntil } from './helpers';

// Mapa de la 1.1 (GDD §4; puesto 5). Los datos de MAP_1_1 son PROVISIONALES hasta que Jonattan apruebe la lámina nueva de
// islas (D67, que se rehace con formas irregulares; AC-198 y AC-199): si la disposición cambia, cambian estos datos y los
// tests de AC-170 y AC-177 se vuelven a correr con ella. La lógica (uniones de círculos, destino inalcanzable y amarres)
// no depende de la disposición
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

describe('E16 — Mapa de la 1.1 (datos provisionales)', () => {
  // GDD §4, tabla de islas: id, arquetipo, centro y radio
  const GDD_TABLE: [string, string, number, number, number][] = [
    ['PORT', 'port', 0, 0, 30],
    ['I1', 'tropical', 260, 200, 45],
    ['I2', 'rocky', -300, 170, 35],
    ['I3', 'rocky', -220, -280, 55],
    ['I4', 'rocky', 250, -260, 40],
    ['I5', 'tropical', 20, 360, 30],
    ['I6', 'tropical', -410, -30, 28],
    ['T1', 'tropical', 150, -150, 22],
    ['T2', 'tropical', -170, 150, 22],
    ['E1a', 'reef', 140, 260, 7],
    ['E1b', 'reef', 117.5, 299, 7],
    ['E1c', 'reef', 162.5, 299, 7],
    ['G1', 'cove', 368, -368, 20],
    ['G2', 'cove', -368, -368, 20],
    ['G3', 'cove', -368, 368, 20],
    ['G4', 'cove', 368, 368, 20]
  ];
  const circles = ISLAND_SHAPES_1_1.flatMap((s) => s.circles.map((c) => ({ shape: s, ...c })));
  const isNew = (id: string) => !ISLANDS.some((i) => i.id === id);

  test('AC-170: las 16 formas de GDD §4 con su arquetipo, su centro y su radio, y la lista plana de círculos del mapa', () => {
    expect(ISLAND_SHAPES_1_1.map((s) => [s.id, s.archetype, ...s.circles.flatMap((c) => [c.x, c.z, c.radius])])).toEqual(GDD_TABLE);
    expect(MAP_1_1.islands).toEqual(GDD_TABLE.map(([id, , x, z, radius]) => ({ id, x, z, radius })));
    expect(MAP_1_1.moorings).toBe(true);
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

  test('AC-170: las formas nuevas no tocan el arco de la guarida con 17 m de margen ni el anillo de la cañonera (400–470 m) con 16 m', () => {
    const touches = circles
      .filter((c) => isNew(c.shape.id))
      .filter((c) => {
        const d = Math.hypot(c.x, c.z);
        const ring = d + c.radius > 400 - 16 && d - c.radius < 470 + 16;
        return ring || lairArc.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < c.radius + 17);
      })
      .map((c) => c.shape.id);
    expect(lairArc).toHaveLength(124);
    expect(touches).toEqual([]);
  });

  test('AC-170: de los 124 puntos del arco, solo el de 7,5° del sector NO no es navegable para el Capitán, a ≈ 10 m del borde de I6', () => {
    const nav = nav11();
    const blocked = lairArc.filter((p) => !nav.navigable(p, navClearance(CAPTAIN_CLASS)));
    const i6 = ISLANDS.find((i) => i.id === 'I6')!;
    const edge = blocked.map((p) => Math.hypot(p.x - i6.x, p.z - i6.z) - i6.radius);
    console.log(`AC-170: puntos del arco no navegables para el Capitán: ${blocked.map((p, k) => `${p.sector} ${p.deg}° (a ${edge[k].toFixed(1)} m de I6)`).join(' · ')}`);
    expect(blocked.map((p) => [p.sector, p.deg])).toEqual([['NO', 7.5]]);
    expect(Math.abs(edge[0] - 10)).toBeLessThanOrEqual(0.5);
  });

  // AC-171 sin reloj: lo que pide es que los grafos ya estén hechos al crear el mundo. Se cuenta con buildCount: la primera
  // ruta, el primer clic dentro de una isla y el primer contacto con la costa de cada clase no construyen nada. El mapa es
  // una copia de MAP_1_1 con su propia lista de islas, así que su navegador es nuevo y no hereda lo que hayan construido
  // otros tests. El tiempo de la primera ruta (preparada y sin preparar) solo se registra: depende de la máquina, y con una
  // cota absoluta de 2 ms la CI daba rojos de tiempo (2,06 ms en el run 39140547625)
  test('AC-171: el mundo prepara al crearse los grafos y los cruces de todas las clases: la primera ruta, el primer clic en una isla y el primer contacto con la costa de cada clase no construyen nada', () => {
    const world = createWorld({ seed: 2, spawnNpcs: false, map: mapOf('1.1-arranque', ISLAND_SHAPES_1_1, true) });
    const nav = navigatorOf(world);
    const prepared = nav.buildCount;
    const lair = { x: 311.1, z: -311.1 };
    const firstRoute = Object.keys(SHIP_CLASSES).map((classId) => {
      const m = navClearance(classId);
      const f = forward(deg(195));
      const t0 = performance.now();
      nav.findPath({ x: f.x * (PORT_RADIUS + m), z: f.z * (PORT_RADIUS + m) }, lair, m); // rodea el puerto: necesita el grafo
      const ms = performance.now() - t0;
      nav.nearestNavigable({ x: E1a.x, z: E1a.z + 1 }, m); // dentro de una roca: necesita los cruces
      nav.pushOut({ x: E1a.x, z: E1a.z + 1 }, SHIP_CLASSES[classId].radius);
      return `${classId} ${ms.toFixed(3)}`;
    });
    const cold = new Navigator(MAP_1_1.islands);
    const t0 = performance.now();
    cold.findPath({ x: -40, z: -40 }, lair, navClearance('frigate'));
    console.log(`AC-171: ${prepared} grafos y conjuntos de cruces preparados al crear el mundo · primera ruta (ms): ${firstRoute.join(' · ')} · sin preparar (frigate): ${(performance.now() - t0).toFixed(3)}`);
    const classes = Object.values(SHIP_CLASSES);
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
  const UNION = mapOf('prueba', [{ id: 'U', archetype: 'rocky', circles: [{ x: 0, z: 200, radius: 20 }, { x: 30, z: 200, radius: 20 }] }], false);

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

describe('E16 — Amarres del puerto (AC-176)', () => {
  const HEADINGS = Array.from({ length: MOORINGS.count }, (_, k) => deg(MOORINGS.firstDeg + k * MOORINGS.stepDeg));
  const mooringOf = (p: Vec2) => HEADINGS.findIndex((h) => Math.abs(angleDelta(h, Math.atan2(p.x, p.z))) < deg(1));
  // Barco vivo y sin IA con el centro en el amarre k, a r m del centro del puerto
  const occupy = (world: ReturnType<typeof world11>, k: number, r: number) => {
    const s = placePlayer(world, `o${k}-${world.ships.size}`, Math.sin(HEADINGS[k]) * r, Math.cos(HEADINGS[k]) * r, HEADINGS[k]);
    s.pos = { x: Math.sin(HEADINGS[k]) * r, z: Math.cos(HEADINGS[k]) * r };
    return s;
  };

  test.each(['sloop', 'brig', 'frigate'])('%s: al entrar aparece atracado en un amarre, con el centro a 30 + L/2 + 2 ±0,5 m del puerto, la proa hacia fuera (±5°) y el casco sin tocar el puerto', (classId) => {
    for (let seed = 1; seed <= 20; seed++) {
      const world = world11(seed);
      addPlayer(world, 'a', 'a', { gold: 0, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'] as PlayerShipClass[], activeShip: classId as PlayerShipClass });
      const ship = shipOfPlayer(world, 'a')!;
      const r = Math.hypot(ship.pos.x, ship.pos.z);
      const k = mooringOf(ship.pos);
      expect({ seed, k: k >= 0, r: Math.abs(r - (PORT_RADIUS + navClearance(classId))) <= 0.5 }).toEqual({ seed, k: true, r: true });
      expect(Math.abs(angleDelta(ship.heading, HEADINGS[k]))).toBeLessThanOrEqual(deg(5));
      expect(r - SHIP_CLASSES[classId].length / 2).toBeGreaterThanOrEqual(PORT_RADIUS);
    }
  });

  test('los amarres se reparten al azar con la semilla entre los libres', () => {
    const used = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const world = world11(seed);
      addPlayer(world, 'a', 'a');
      used.add(mooringOf(shipOfPlayer(world, 'a')!.pos));
    }
    expect(used.size).toBeGreaterThanOrEqual(10);
  });

  test('con un barco grande atracado en un amarre (centro a 53 m), una Balandra nunca toma ese amarre, aunque su punto (40 m) quede a 13 m de él', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const world = world11(seed);
      occupy(world, 3, 53);
      addPlayer(world, 'a', 'a');
      expect({ seed, k: mooringOf(shipOfPlayer(world, 'a')!.pos) }).not.toEqual({ seed, k: 3 });
    }
  });

  test('con 11 amarres ocupados por barcos grandes, la Balandra toma el 12.º; con los 12 ocupados, aparece en el anillo de 60–90 m', () => {
    const world = world11(7);
    for (let k = 0; k < 12; k++) if (k !== 8) occupy(world, k, 53);
    addPlayer(world, 'a', 'a');
    expect(mooringOf(shipOfPlayer(world, 'a')!.pos)).toBe(8);
    addPlayer(world, 'b', 'b');
    const r = Math.hypot(shipOfPlayer(world, 'b')!.pos.x, shipOfPlayer(world, 'b')!.pos.z);
    expect(r).toBeGreaterThanOrEqual(RESPAWN_RING.min);
    expect(r).toBeLessThanOrEqual(RESPAWN_RING.max);
  });

  test('un barco hundido (no vivo) no ocupa su amarre, y al zarpar se vuelve a un amarre libre', () => {
    const world = world11(8);
    const sunk = occupy(world, 0, 40);
    sunk.state = 'dead';
    const player = world.players.get(sunk.ownerId!)!;
    player.death = { by: null, goldLost: 0, at: world.time - DEATH_COUNTDOWN };
    for (let k = 1; k < 12; k++) occupy(world, k, 40);
    expect(respawn(world, player.id).ok).toBe(true);
    expect(mooringOf(sunk.pos)).toBe(0);
    expect(Math.abs(Math.hypot(sunk.pos.x, sunk.pos.z) - 40)).toBeLessThanOrEqual(0.5);
  });

  test('con el mapa de la 1.0 (sin amarres) sigue el anillo de 60–90 m (AC-63)', () => {
    const world = createWorld({ seed: 1, spawnNpcs: false });
    addPlayer(world, 'a', 'a');
    const r = Math.hypot(shipOfPlayer(world, 'a')!.pos.x, shipOfPlayer(world, 'a')!.pos.z);
    expect(r).toBeGreaterThanOrEqual(RESPAWN_RING.min);
    expect(r).toBeLessThanOrEqual(RESPAWN_RING.max);
  });
});

describe('E16 — Rutas del puerto (AC-177, con la disposición provisional)', () => {
  const HEADINGS = Array.from({ length: MOORINGS.count }, (_, k) => deg(MOORINGS.firstDeg + k * MOORINGS.stepDeg));
  const LAIRS = PIRATE_SECTORS.map(({ id, sx, sz }) => ({ id, x: 311.1 * sx, z: 311.1 * sz }));
  const ratio = (nav: Navigator, from: Vec2, to: Vec2, margin: number) => {
    const path = nav.findPath(from, to, margin);
    return pathLength(from, path) / distance(from, path[path.length - 1]);
  };

  test.each([
    ['Balandra', 10],
    ['Navío', 23]
  ])('AC-177 (a): %s, de cada uno de los 12 amarres a la guarida de cada sector, la ruta mide ≤ 1,15 × la recta', (_, margin) => {
    const nav = nav11();
    let worst = { r: 0, from: 0, to: '' };
    for (const [k, h] of HEADINGS.entries()) {
      const f = forward(h);
      const moor = { x: f.x * (PORT_RADIUS + margin), z: f.z * (PORT_RADIUS + margin) };
      for (const lair of LAIRS) {
        expect(nav.navigable(lair, margin)).toBe(true);
        const r = ratio(nav, moor, lair, margin);
        if (r > worst.r) worst = { r, from: MOORINGS.firstDeg + k * MOORINGS.stepDeg, to: lair.id };
      }
    }
    console.log(`AC-177 (a) margen ${margin}: peor ${worst.r.toFixed(3)} (amarre de ${worst.from}° a la guarida ${worst.to})`);
    expect(worst.r).toBeLessThanOrEqual(1.15);
  });

  test.each([
    ['Balandra', 10],
    ['Navío', 23]
  ])('AC-177 (b): %s, desde 8 puntos a 300 m del puerto hasta el amarre más cercano, la ruta mide ≤ 1,15 × la recta', (_, margin) => {
    const nav = nav11();
    const moorings = HEADINGS.map((h) => ({ x: forward(h).x * (PORT_RADIUS + margin), z: forward(h).z * (PORT_RADIUS + margin) }));
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

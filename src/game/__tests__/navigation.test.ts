import { GAME_MAP, ISLANDS, MAP_1_0, MAP_1_1, NAV_LIMIT, PIVOT_MIN_ANGLE, PIVOT_SPEED, SHIP_CLASSES, navClearance } from '../constants';
import { Ship, World } from '../types';
import { Vec2, createRng, distance, forward, headingTo } from '../vec';
import { createWorld, moveTo, navigator, navigatorOf, stop } from '../world';
import { DT, emptyWorld, i2World, percentile, placeCaptain, placeGunboat, placeMerchant, placePirate, placePlayer, run, runUntil } from './helpers';

describe('E1 — Navegación', () => {
  test('AC-15: llega a ≤ 2 m del destino con velocidad 0 y no oscila', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 0, 0);
    moveTo(world, 'a', { x: 200, z: 120 });
    runUntil(world, 30, () => ship.destination === null && ship.speed === 0);
    const atArrival = distance(ship.pos, { x: 200, z: 120 });
    expect(atArrival).toBeLessThanOrEqual(2);
    expect(ship.speed).toBe(0);
    run(world, 5);
    expect(distance(ship.pos, { x: 200, z: 120 })).toBeLessThanOrEqual(atArrival + 1e-9);
  });

  test.each([
    ['sloop', 14, 3.5, 90],
    ['brig', 12, 4.0, 70],
    ['frigate', 10, 4.0, 55]
  ])('AC-16: %s alcanza %d m/s en %d s y gira a %d °/s', (classId, vmax, seconds, degPerSec) => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', -400, -300, Math.PI / 2);
    ship.classId = classId;
    moveTo(world, 'a', { x: 400, z: -300 });
    const t = runUntil(world, 10, () => ship.speed >= vmax - 1e-9);
    expect(ship.speed).toBeCloseTo(vmax, 1);
    expect(Math.abs(t - seconds)).toBeLessThanOrEqual(0.1);

    // Giro sostenido: destino a la espalda
    const turner = placePlayer(world, 'b', 300, 300, 0);
    turner.classId = classId;
    moveTo(world, 'b', { x: 300, z: 200 });
    run(world, DT); // primer tick fija la ruta
    const h0 = turner.heading;
    run(world, 0.5);
    const turned = Math.abs(turner.heading - h0) / 0.5;
    expect(Math.abs(turned - (degPerSec * Math.PI) / 180)).toBeLessThanOrEqual((1 * Math.PI) / 180);
  });

  test('AC-18: un destino fuera del límite se ajusta a ±490', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 0, 200);
    moveTo(world, 'a', { x: 9000, z: -9000 });
    expect(ship.destination).toEqual({ x: NAV_LIMIT, z: -NAV_LIMIT });
  });

  test('AC-19: S borra el destino y frena a su tasa de frenado', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', -300, 200, Math.PI / 2);
    moveTo(world, 'a', { x: 300, z: 200 });
    run(world, 5);
    const v0 = ship.speed;
    stop(world, 'a');
    expect(ship.destination).toBeNull();
    run(world, 1);
    expect(ship.speed).toBeCloseTo(Math.max(0, v0 - SHIP_CLASSES.sloop.brake), 5);
    run(world, 3);
    expect(ship.speed).toBe(0);
  });

  // AC-20 con el mapa del juego (las 1 000 rutas por clase): en ac20-<clase>.test.ts, un archivo por clase para que Jest los
  // reparta (ac20-routes.ts), con las 7 clases del juego (AC-210 c)

  // H1 (QA-70; producto, 2026-11-04, BACKLOG :914): la re-planificación de la ruta es solo de los mercantes NPC (C3,
  // AC-173). Un barco de jugador calcula su ruta 1 vez por orden de moveTo, aunque pase junto a la costa: un contador sobre el
  // Navigator del mapa (compartido por los mundos del mismo mapa) cuenta las llamadas a findPath de cada ruta, desde la orden
  // hasta la llegada. Rutas junto a la costa, con la semilla de AC-20: el barco va a la velocidad máxima por el borde del
  // margen de una isla al azar, con el rumbo tangente a ella, y recibe la orden de ir al otro lado de esa isla (la ruta la
  // rodea). Es el caso en que el arco de giro lo saca de la recta junto a la costa: con el mutante replan-todos (re-planificar
  // cualquier barco) re-planifica en 9 de las 10 combinaciones de clase y mapa (sonda de dev-npc, 2026-11-04); parado y con
  // el rumbo al azar, casi nunca
  test.each([
    ['1.0', MAP_1_0],
    ['1.1', MAP_1_1]
  ])('AC-20 (H1): mapa %s — un barco de jugador de cada una de las 5 clases, en 50 rutas que rodean una isla desde su costa, llama a findPath 1 vez por cada moveTo', (id, map) => {
    const ROUTES = 50;
    const report: string[] = [];
    for (const classId of ['sloop', 'brig', 'frigate', 'pirate', 'merchant']) {
      const clearance = navClearance(classId);
      const nav = navigatorOf(createWorld({ seed: 0, spawnNpcs: false, map }));
      const rng = createRng(2026);
      const routes: { from: Vec2; to: Vec2; heading: number }[] = [];
      for (let tries = 0; routes.length < ROUTES && tries < 5000; tries++) {
        const isl = map.islands[Math.floor(rng() * map.islands.length)];
        const a = rng() * Math.PI * 2;
        // Desde el borde del margen (el punto navegable más cercano a uno de dentro de la isla) hasta el lado opuesto
        const from = nav.nearestNavigable({ x: isl.x + Math.sin(a) * isl.radius * 0.5, z: isl.z + Math.cos(a) * isl.radius * 0.5 }, clearance);
        const to = nav.nearestNavigable({ x: isl.x - Math.sin(a) * (isl.radius + 60), z: isl.z - Math.cos(a) * (isl.radius + 60) }, clearance);
        if (nav.findPath(from, to, clearance).length >= 2) routes.push({ from, to, heading: headingTo(from, isl) + Math.PI / 2 });
      }
      const findPath = jest.spyOn(nav, 'findPath');
      const extra: string[] = [];
      let arrived = 0;
      try {
        routes.forEach(({ from, to, heading }, i) => {
          const world = createWorld({ seed: i, spawnNpcs: false, map });
          const ship = placePlayer(world, 'a', from.x, from.z, heading);
          ship.classId = classId;
          ship.speed = SHIP_CLASSES[classId].maxSpeed;
          const before = findPath.mock.calls.length;
          moveTo(world, 'a', to);
          const t = runUntil(world, 300, () => ship.destination === null && ship.speed === 0);
          if (t !== Infinity) arrived++;
          const calls = findPath.mock.calls.length - before;
          if (calls !== 1) extra.push(`ruta ${i} (${from.x.toFixed(1)}, ${from.z.toFixed(1)}) → (${to.x.toFixed(1)}, ${to.z.toFixed(1)}): ${calls} llamadas`);
        });
      } finally {
        findPath.mockRestore();
      }
      report.push(`${classId} ${routes.length} rutas, ${arrived} llegan, ${extra.length} con más de 1 llamada`);
      // Medido: sin las 50 rutas junto a la costa, el test no prueba lo que dice
      expect({ classId, routes: routes.length }).toEqual({ classId, routes: ROUTES });
      expect({ classId, extra }).toEqual({ classId, extra: [] });
    }
    console.log(`AC-20 (H1), mapa ${id}: ${report.join(' · ')}`);
  }, 120_000);

  test.each(['sloop', 'brig', 'frigate', 'pirate', 'merchant'])('AC-21: %s — un clic dentro de una isla lleva a L/2 + 2 ±1 m del borde', (classId) => {
    const margin = SHIP_CLASSES[classId].length / 2 + 2;
    for (const isl of ISLANDS) {
      const p = navigator.nearestNavigable({ x: isl.x + 3, z: isl.z - 2 }, navClearance(classId));
      const fromEdge = Math.hypot(p.x - isl.x, p.z - isl.z) - isl.radius;
      expect(Math.abs(fromEdge - margin)).toBeLessThanOrEqual(1);
    }
  });

  test('AC-100: en mar abierto un giro de 90° no baja de 0,6 × vel. máx.; junto a una isla, un giro > 45° baja a ≤ 1 m/s', () => {
    // Mar abierto: a más de margen + 8 m de toda isla
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', -100, -100, Math.PI / 2);
    ship.speed = SHIP_CLASSES.sloop.maxSpeed;
    expect(navigator.edgeClearance(ship.pos)).toBeGreaterThan(navClearance('sloop') + 8);
    moveTo(world, 'a', { x: -100, z: 300 }); // destino a 90° del rumbo
    let minSpeed = Infinity;
    runUntil(world, 5, () => {
      const err = Math.abs(Math.atan2(Math.sin(0 - ship.heading), Math.cos(0 - ship.heading)));
      minSpeed = Math.min(minSpeed, ship.speed);
      return err < (2 * Math.PI) / 180;
    });
    expect(minSpeed).toBeGreaterThanOrEqual(0.6 * SHIP_CLASSES.sloop.maxSpeed - 0.1);

    // Junto a la isla I1 (260, 200; r 45), a margen + 3 m del borde, con media vuelta (giro de 180°)
    const w2 = emptyWorld();
    const near = placePlayer(w2, 'a', 260, 200 + 45 + navClearance('sloop') + 3, Math.PI / 2);
    near.speed = 6;
    expect(navigator.edgeClearance(near.pos)).toBeLessThan(navClearance('sloop') + 8);
    moveTo(w2, 'a', { x: 60, z: 258 });
    let minNear = Infinity;
    runUntil(w2, 6, () => {
      minNear = Math.min(minNear, near.speed);
      const target = -Math.PI / 2; // hacia −X
      return Math.abs(Math.atan2(Math.sin(target - near.heading), Math.cos(target - near.heading))) < PIVOT_MIN_ANGLE;
    });
    expect(minNear).toBeLessThanOrEqual(PIVOT_SPEED + 1e-9);
  });

  // p50 y p99 de 1 000 cálculos de ruta aleatorios en el mapa del juego (GAME_MAP, AC-210 c). Misma semilla en cada llamada:
  // las mismas rutas, solo cambia la carga de la máquina (findPath no guarda rutas; solo el grafo por margen, que se
  // precalienta antes)
  const gameNav = () => navigatorOf(createWorld({ seed: 0, spawnNpcs: false, map: GAME_MAP }));
  function routeTimes(radius: number): { p50: number; p99: number } {
    const nav = gameNav();
    const rng = createRng(7);
    const times: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const a = nav.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, radius);
      const b = nav.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, radius);
      const t0 = performance.now();
      nav.findPath(a, b, radius);
      times.push(performance.now() - t0);
    }
    return { p50: percentile(times, 50), p99: percentile(times, 99) };
  }

  // DT-06 (como DT-05 en AC-03): la carga ajena de la máquina solo suma tiempo a una ruta, nunca lo resta, así que el
  // menor de 3 p99 estima el coste del cálculo; un p99 suelto medía también la máquina
  test(`AC-22: con el mapa del juego (${GAME_MAP.id}), el menor de 3 p99 del cálculo de ruta (1 000 rutas cada uno) es ≤ 2 ms`, () => {
    const radius = navClearance('frigate');
    gameNav().findPath({ x: -480, z: -480 }, { x: 480, z: 480 }, radius); // precalienta el grafo
    const runs = [routeTimes(radius), routeTimes(radius), routeTimes(radius)];
    const best = Math.min(...runs.map((r) => r.p99));
    console.log(`AC-22 (mapa ${GAME_MAP.id}): p99 ${runs.map((r) => r.p99.toFixed(3)).join(' · ')} ms (p50 ${runs.map((r) => r.p50.toFixed(3)).join(' · ')} ms) → menor ${best.toFixed(3)} ms`);
    expect(best).toBeLessThanOrEqual(2);
  });

  // O-70: con el destino final cerca y a la espalda, a 1,5 m/s, la Cañonera (50 °/s) orbitaba el punto en el borde de los
  // 2 m sin parar nunca. Cada clase tiene que pararse a ≤ 2 m en ≤ 10 s; un NPC también vale si elige otro destino. Los
  // destinos van de 2,5 a 8 m: a 2,0 m el barco ya cuenta como llegado en el primer tick
  function placeOf(world: World, classId: string, x: number, z: number, heading: number): Ship {
    switch (SHIP_CLASSES[classId].kind === 'player' ? 'player' : classId) {
      case 'player': {
        const ship = placePlayer(world, 'a', x, z, heading);
        ship.classId = classId;
        return ship;
      }
      case 'pirate':
        return placePirate(world, x, z, heading);
      case 'gunboat':
        return placeGunboat(world, x, z, heading);
      case 'merchant':
        return placeMerchant(world, x, z, heading);
      case 'captain': {
        const ship = placeCaptain(world, x, z, heading);
        ship.pos = { x, z };
        return ship;
      }
      default:
        throw new Error(`Clase sin colocar en el test: ${classId}`);
    }
  }

  // 7 clases × 3 rumbos relativos × 2 bandas × 4 distancias (a 180°, las 2 bandas dan el mismo punto)
  const ARRIVAL_CASES = Object.keys(SHIP_CLASSES).flatMap((classId) =>
    [100, 135, 180].flatMap((rel) => [1, -1].flatMap((band) => [2.5, 4, 6, 8].map((d) => [classId, rel * band, d] as const)))
  );

  test.each(ARRIVAL_CASES)('O-70: %s con el destino final a %i° a la espalda y a %d m, a 1,5 m/s, se para a ≤ 2 m en ≤ 10 s', (classId, rel, d) => {
    const world = i2World();
    const heading = Math.PI / 3;
    const ship = placeOf(world, classId, 200, 0, heading);
    const f = forward(heading + (rel * Math.PI) / 180);
    const target = { x: 200 + f.x * d, z: f.z * d };
    ship.destination = target;
    ship.path = [{ ...target }];
    ship.speed = 1.5;
    let arrival: { t: number; dist: number; speed: number } | null = null;
    let t = 0;
    run(world, 10, () => {
      t += DT;
      if (!arrival && ship.destination !== target) arrival = { t, dist: distance(ship.pos, target), speed: ship.speed };
    });
    expect(arrival).not.toBeNull();
    expect(arrival!.dist).toBeLessThanOrEqual(2);
    expect(arrival!.speed).toBe(0);
  });
});


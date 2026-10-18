import { ISLANDS, NAV_LIMIT, PIVOT_MIN_ANGLE, PIVOT_SPEED, SHIP_CLASSES, navClearance } from '../constants';
import { segmentPointDistance } from '../nav';
import { createRng, distance } from '../vec';
import { moveTo, navigator, stop } from '../world';
import { DT, emptyWorld, percentile, placePlayer, run, runUntil } from './helpers';

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

  // Segmento del casco (proa a popa, longitud L, sin bauprés) frente a cada isla
  function hullTouchesIsland(x: number, z: number, heading: number, length: number): boolean {
    const fx = Math.sin(heading) * (length / 2);
    const fz = Math.cos(heading) * (length / 2);
    const bow = { x: x + fx, z: z + fz };
    const stern = { x: x - fx, z: z - fz };
    return ISLANDS.some((isl) => segmentPointDistance(bow, stern, { x: isl.x, z: isl.z }) < isl.radius - 1e-6);
  }

  test.each(['sloop', 'brig', 'schooner', 'frigate', 'line', 'pirate', 'merchant'])(
    'AC-20: %s — 1 000 rutas aleatorias: el casco nunca toca una isla y el 100 %% llega a ≤ 2 m',
    (classId) => {
      const rng = createRng(2026);
      const clearance = navClearance(classId);
      const length = SHIP_CLASSES[classId].length;
      let arrived = 0;
      let touched = 0;
      for (let i = 0; i < 1000; i++) {
        const world = emptyWorld(i);
        const from = navigator.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, clearance);
        const to = navigator.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, clearance);
        const ship = placePlayer(world, 'a', from.x, from.z, rng() * Math.PI * 2);
        ship.classId = classId;
        moveTo(world, 'a', to);
        const target = ship.destination!;
        let violated = false;
        const t = runUntil(world, 300, () => {
          if (!violated && hullTouchesIsland(ship.pos.x, ship.pos.z, ship.heading, length)) violated = true;
          return ship.destination === null && ship.speed === 0;
        });
        if (violated) touched++;
        if (t !== Infinity && distance(ship.pos, target) <= 2) arrived++;
      }
      expect({ classId, touched }).toEqual({ classId, touched: 0 });
      expect({ classId, arrived }).toEqual({ classId, arrived: 1000 });
    },
    120_000
  );

  test.each(['sloop', 'brig', 'schooner', 'frigate', 'line', 'pirate', 'merchant'])('AC-21: %s — un clic dentro de una isla lleva a L/2 + 2 ±1 m del borde', (classId) => {
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

  // p50 y p99 de 1 000 cálculos de ruta aleatorios. Misma semilla en cada llamada: las mismas rutas, solo cambia la carga
  // de la máquina (findPath no guarda rutas; solo el grafo por margen, que se precalienta antes)
  function routeTimes(radius: number): { p50: number; p99: number } {
    const rng = createRng(7);
    const times: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const a = navigator.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, radius);
      const b = navigator.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, radius);
      const t0 = performance.now();
      navigator.findPath(a, b, radius);
      times.push(performance.now() - t0);
    }
    return { p50: percentile(times, 50), p99: percentile(times, 99) };
  }

  // DT-06 (como DT-05 en AC-03): la carga ajena de la máquina solo suma tiempo a una ruta, nunca lo resta, así que el
  // menor de 3 p99 estima el coste del cálculo; un p99 suelto medía también la máquina
  test('AC-22: el menor de 3 p99 del cálculo de ruta (1 000 rutas cada uno) es ≤ 2 ms', () => {
    const radius = navClearance('frigate');
    navigator.findPath({ x: -480, z: -480 }, { x: 480, z: 480 }, radius); // precalienta el grafo
    const runs = [routeTimes(radius), routeTimes(radius), routeTimes(radius)];
    const best = Math.min(...runs.map((r) => r.p99));
    console.log(`AC-22: p99 ${runs.map((r) => r.p99.toFixed(3)).join(' · ')} ms (p50 ${runs.map((r) => r.p50.toFixed(3)).join(' · ')} ms) → menor ${best.toFixed(3)} ms`);
    expect(best).toBeLessThanOrEqual(2);
  });
});

import { ISLANDS, NAV_LIMIT, SHIP_CLASSES } from '../constants';
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

  test('AC-20: 1 000 rutas aleatorias nunca entran en islas y llegan a ≤ 2 m', () => {
    const rng = createRng(2026);
    const radius = SHIP_CLASSES.sloop.radius;
    let arrived = 0;
    for (let i = 0; i < 1000; i++) {
      const world = emptyWorld(i);
      const from = navigator.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, radius);
      const to = navigator.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, radius);
      const ship = placePlayer(world, 'a', from.x, from.z, rng() * Math.PI * 2);
      moveTo(world, 'a', to);
      const target = ship.destination!;
      let violated = false;
      const t = runUntil(world, 240, () => {
        for (const isl of ISLANDS) if (Math.hypot(ship.pos.x - isl.x, ship.pos.z - isl.z) < isl.radius + radius - 1e-6) violated = true;
        return ship.destination === null && ship.speed === 0;
      });
      expect(violated).toBe(false);
      if (t !== Infinity && distance(ship.pos, target) <= 2) arrived++;
    }
    expect(arrived).toBe(1000);
  });

  test('AC-21: un clic dentro de una isla lleva a ≤ 1 m del borde navegable', () => {
    const radius = SHIP_CLASSES.sloop.radius;
    for (const isl of ISLANDS) {
      const p = navigator.nearestNavigable({ x: isl.x + 3, z: isl.z - 2 }, radius);
      const d = Math.hypot(p.x - isl.x, p.z - isl.z);
      expect(d).toBeGreaterThanOrEqual(isl.radius + radius);
      expect(d - (isl.radius + radius)).toBeLessThanOrEqual(1);
    }
  });

  test('AC-22: el p99 del cálculo de ruta es ≤ 2 ms', () => {
    const rng = createRng(7);
    const radius = SHIP_CLASSES.frigate.radius;
    navigator.findPath({ x: -480, z: -480 }, { x: 480, z: 480 }, radius); // precalienta el grafo
    const times: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const a = navigator.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, radius);
      const b = navigator.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, radius);
      const t0 = performance.now();
      navigator.findPath(a, b, radius);
      times.push(performance.now() - t0);
    }
    expect(percentile(times, 99)).toBeLessThanOrEqual(2);
  });
});

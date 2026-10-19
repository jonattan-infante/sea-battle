// TEMPORAL, NO SE FUSIONA (O-43; BACKLOG r11 a849871 :684). Mide en la CI AC-22 y AC-03 con MAP_1_1 y registra el menor
// de 3 p99 sin asertar: producto decide con 3 corridas de la CI (la del push y 2 re-runs) si A–D bastan (≤ 85 % de la
// cota: 1,7 ms y 3,4 ms). El método es el de las cotas: routeTimes de navigation.test.ts (AC-22, 1 000 rutas de semilla 7,
// el grafo precalentado) y tickTimes de architecture.test.ts (AC-03, 20 jugadores con intenciones aleatorias, 20 NPC y
// el jefe, 2 000 ticks tras 200), cada uno con el mapa como parámetro. MAP_1_0 se mide igual en la misma corrida,
// alternando corrida a corrida con MAP_1_1, como referencia de la velocidad de la máquina. Sin AC-20
import * as C from '../constants';
import { MAP_1_0, MAP_1_1, MapDef, navClearance } from '../constants';
import { Navigator } from '../nav';
import { createRng } from '../vec';
import { addPlayer, attack, createWorld, drainEvents, moveTo, navigatorOf, shipOfPlayer, spawnCaptain, step } from '../world';
import { DT, percentile } from './helpers';

type Run = { p50: number; p99: number };
const f = (v: number) => v.toFixed(3);
const best = (runs: Run[]) => Math.min(...runs.map((r) => r.p99));
const MAPS: [string, MapDef][] = [['MAP_1_1', MAP_1_1], ['MAP_1_0', MAP_1_0]];

// AC-22 (navigation.test.ts, routeTimes): p50 y p99 de 1 000 cálculos de ruta aleatorios, con la misma semilla en cada llamada
function routeTimes(nav: Navigator, radius: number): Run {
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

// AC-03 (architecture.test.ts, tickTimes), con el mapa como parámetro
function tickTimes(map: MapDef): Run {
  const world = createWorld({ seed: 3, i2: true, map });
  const boss = spawnCaptain(world);
  expect(boss).not.toBeNull();
  const rng = createRng(5);
  for (let i = 0; i < 20; i++) addPlayer(world, `p${i}`, `P${i}`);
  for (const s of world.ships.values()) s.protectedUntil = 0;
  const times: number[] = [];
  for (let t = 0; t < 2000 + 200; t++) {
    for (let i = 0; i < 20; i++) {
      if (rng() > 1 / C.TICK_RATE) continue;
      const id = `p${i}`;
      const ship = shipOfPlayer(world, id);
      if (!ship || ship.state !== 'alive') continue;
      if (rng() < 0.6) moveTo(world, id, { x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 });
      else {
        const near = [...world.ships.values()].find((s) => s.id !== ship.id && s.state === 'alive' && Math.hypot(s.pos.x - ship.pos.x, s.pos.z - ship.pos.z) < 150);
        if (near) attack(world, id, near.id);
      }
    }
    const t0 = performance.now();
    step(world, DT);
    drainEvents(world);
    if (t >= 200) times.push(performance.now() - t0);
  }
  return { p50: percentile(times, 50), p99: percentile(times, 99) };
}

describe('O-43 · medida en la CI de AC-22 y AC-03 con MAP_1_1 (TEMPORAL, NO SE FUSIONA)', () => {
  test.each([13, 19, 20, 23])(
    'AC-22, margen %i: el menor de 3 p99 con MAP_1_1 y con MAP_1_0, registrado sin asertar',
    (margin) => {
      const navs = MAPS.map(([, map]) => navigatorOf(createWorld({ seed: 1, spawnNpcs: false, map })));
      for (const nav of navs) nav.findPath({ x: -480, z: -480 }, { x: 480, z: 480 }, margin); // precalienta el grafo
      const runs: Run[][] = [[], []];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) runs[k].push(routeTimes(navs[k], margin));
      const [b11, b10] = [best(runs[0]), best(runs[1])];
      console.log(
        `O43-CI AC-22 margen ${margin}: MAP_1_1 p99 ${runs[0].map((r) => f(r.p99)).join(' · ')} → menor ${f(b11)} ms (${((100 * b11) / 2).toFixed(0)} % de la cota 2; 85 % = 1,7) · p50 ${f(Math.min(...runs[0].map((r) => r.p50)))} · MAP_1_0 p99 ${runs[1].map((r) => f(r.p99)).join(' · ')} → menor ${f(b10)} ms · ×${(b11 / b10).toFixed(2)}`
      );
      expect(runs[0]).toHaveLength(3);
    },
    300_000
  );

  test(
    'AC-03: el menor de 3 p99 del tick con MAP_1_1 y con MAP_1_0, registrado sin asertar',
    () => {
      const runs: Run[][] = [[], []];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) runs[k].push(tickTimes(MAPS[k][1]));
      const [b11, b10] = [best(runs[0]), best(runs[1])];
      console.log(
        `O43-CI AC-03: MAP_1_1 p99 ${runs[0].map((r) => f(r.p99)).join(' · ')} → menor ${f(b11)} ms (${((100 * b11) / 4).toFixed(0)} % de la cota 4; 85 % = 3,4) · p50 ${f(Math.min(...runs[0].map((r) => r.p50)))} · MAP_1_0 p99 ${runs[1].map((r) => f(r.p99)).join(' · ')} → menor ${f(b10)} ms · ×${(b11 / b10).toFixed(2)}`
      );
      expect(runs[0]).toHaveLength(3);
    },
    300_000
  );

  test('el margen de la cota de AC-22 es el de la Fragata (19), que está entre los 4 medidos', () => {
    expect(navClearance('frigate')).toBe(19);
  });
});

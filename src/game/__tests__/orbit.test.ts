// AC-188: el controlador de órbita compartido por los NPC deja la órbita real en el radio nominal (GDD §9, «Órbita real =
// nominal»). Los radios van escritos a mano, del GDD: así el test no se ajusta a las constantes que compara AC-04
import { CAPTAIN_CLASS, GUNBOAT_CLASS, SHIP_CLASSES, TICK_RATE } from '../constants';
import { Ship, World } from '../types';
import { distance } from '../vec';
import { shipOfPlayer, spawnCaptain, spawnPirate } from '../world';
import { i2World, median, placePlayer, run } from './helpers';

// BACKLOG AC-188: «cuando un pirata (45 m), un capitán (50 m) o una cañonera (62 m) orbitan 20 s un objetivo quieto,
// entonces la mediana real de su distancia queda dentro del ±5 % de su radio nominal: 42,75–47,25 m, 47,5–52,5 m y
// 58,9–65,1 m»
const GDD_ORBIT: [string, number][] = [['pirate', 45], [CAPTAIN_CLASS, 50], [GUNBOAT_CLASS, 62]];
const SEEDS = [1, 2, 3, 4, 5];
const START_ANGLES = [0, 1.6, 3.2, 4.8]; // rad alrededor del objetivo
// Mar abierto: a ≥ 220 m de toda isla y a 300 m del puerto, para que ninguna órbita toque el margen de navegación (§6).
// Junto a una isla, el NPC rodea la costa y la órbita se deforma (§9: «si queda acorralada contra una isla, orbita»)
const TARGET = { x: 0, z: -300 };

function hostile(world: World, classId: string, x: number, z: number): Ship {
  const ship = classId === CAPTAIN_CLASS ? spawnCaptain(world, { x, z })! : spawnPirate(world, 0);
  if (classId === GUNBOAT_CLASS) {
    ship.classId = classId;
    ship.hp = ship.maxHp = SHIP_CLASSES[classId].maxHp;
  }
  ship.pos = { x, z };
  ship.ai!.origin = { x, z };
  ship.ai!.wait = 999;
  ship.destination = null;
  ship.path = [];
  return ship;
}

// Mediana de la distancia en 20 s de combate, tras 5 s para llegar a la órbita desde 15 m por fuera
function orbitMedian(classId: string, nominal: number, seed: number, angle: number): number {
  const world = i2World(seed);
  const target = placePlayer(world, 'a', TARGET.x, TARGET.z);
  target.hp = target.maxHp = 1e9;
  const start = { x: TARGET.x + Math.cos(angle) * (nominal + 15), z: TARGET.z + Math.sin(angle) * (nominal + 15) };
  const ship = hostile(world, classId, start.x, start.z);
  run(world, 5);
  const d: number[] = [];
  run(world, 20, () => d.push(distance(ship.pos, target.pos)));
  expect([classId, ship.ai!.state, shipOfPlayer(world, 'a')!.state]).toEqual([classId, 'combat', 'alive']);
  expect(d.length).toBe(20 * TICK_RATE);
  return median(d);
}

describe('E3 — Órbita real = nominal (AC-188, GDD §9)', () => {
  test.each(GDD_ORBIT)('AC-188: %s orbita un objetivo quieto con la mediana a ±5 %% de %i m, con 5 semillas y 4 ángulos de partida', (classId, nominal) => {
    const medians = SEEDS.flatMap((seed) => START_ANGLES.map((angle) => orbitMedian(classId, nominal, seed, angle)));
    console.log(`AC-188 ${classId}: nominal ${nominal} m · medianas ${Math.min(...medians).toFixed(2)}–${Math.max(...medians).toFixed(2)} m en ${medians.length} corridas`);
    for (const m of medians) expect({ classId, inBand: m >= nominal * 0.95 && m <= nominal * 1.05, m }).toEqual({ classId, inBand: true, m });
  });
});

// E15 — Balance de la Goleta y del Navío de línea (AC-163): las filas 1.1 de GDD §9, «Balance verificable», con 1 000
// duelos con semilla y sin reparar. El bot es el de AC-53, AC-55 y AC-114, en el mismo punto de partida: ataca y se mantiene
// a ≤ 40 m del objetivo. Los números van escritos a mano, del GDD
import { PlayerShipClass, SHIP_CLASSES, TICK_RATE } from '../constants';
import { GameEvent, Ship, Upgrades, World } from '../types';
import { createRng, distance, forward } from '../vec';
import { attack, maxHpFor, moveTo } from '../world';
import { DT, emptyWorld, i2World, median, placeCaptain, placeGunboat, placePirate, placePlayer, run } from './helpers';

interface Side {
  classId: PlayerShipClass;
  upgrades: Upgrades;
}
interface DuelResult {
  time: number; // s hasta hundir al rival (∞ si no lo hunde en 120 s)
  hpLost: number; // fracción de vida perdida por el jugador
  died: boolean;
}

const N1: Upgrades = { cannons: 1, hull: 1, sails: 1 };
const N3: Upgrades = { cannons: 3, hull: 3, sails: 3 };
const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

// Un jugador con su clase y sus mejoras, con la vida llena
function equip(world: World, id: string, x: number, z: number, side: Side): Ship {
  const ship = placePlayer(world, id, x, z, 0);
  const player = world.players.get(id)!;
  player.upgrades = { ...side.upgrades };
  player.ownedShips = [side.classId];
  player.activeShip = side.classId;
  ship.classId = side.classId;
  ship.maxHp = maxHpFor(side.classId, player);
  ship.hp = ship.maxHp;
  return ship;
}

// Cada jugador ataca a su rival y lo persigue si se aleja a más de 40 m (cada 0,5 s, como en AC-53)
function fight(world: World, bots: { id: string; ship: Ship; target: Ship }[], foe: Ship, me: Ship): DuelResult {
  for (const b of bots) attack(world, b.id, b.target.id);
  let t = 0;
  let sunk = false;
  let died = false;
  while (t < 120 && !sunk && !died) {
    const events: GameEvent[] = run(world, DT);
    t += DT;
    for (const e of events) {
      if (e.type === 'sunk' && e.shipId === foe.id) sunk = true;
      if (e.type === 'sunk' && e.shipId === me.id) died = true;
    }
    if (Math.round(t * TICK_RATE) % 10 === 0) {
      for (const b of bots) if (b.ship.state === 'alive' && distance(b.ship.pos, b.target.pos) > 40) moveTo(world, b.id, b.target.pos);
    }
  }
  return { time: sunk ? t : Infinity, hpLost: 1 - Math.max(0, me.hp) / me.maxHp, died };
}

// Contra un NPC: el pirata en el mundo vacío; la Cañonera y el Capitán, con el I2 encendido (AC-187)
function duelNpc(seed: number, side: Side, npc: 'pirate' | 'gunboat' | 'captain'): DuelResult {
  const world = npc === 'pirate' ? emptyWorld(seed) : i2World(seed);
  world.rng = createRng(seed * 7919 + 1);
  const me = equip(world, 'a', 260, -380, side);
  const foe = npc === 'pirate' ? placePirate(world, 260, -330) : npc === 'gunboat' ? placeGunboat(world, 260, -330) : placeCaptain(world, 260, -330);
  return fight(world, [{ id: 'a', ship: me, target: foe }], foe, me);
}

// PvP: los dos jugadores con el mismo bot, cada uno contra el otro
function duelPvp(seed: number, mine: Side, theirs: Side): DuelResult {
  const world = emptyWorld(seed);
  world.rng = createRng(seed * 7919 + 1);
  const me = equip(world, 'a', 260, -380, mine);
  const foe = equip(world, 'b', 260, -330, theirs);
  return fight(world, [{ id: 'a', ship: me, target: foe }, { id: 'b', ship: foe, target: me }], foe, me);
}

const seeds = Array.from({ length: 1000 }, (_, i) => i + 1);

// Bot a distancia de AC-163: la Goleta dispara desde 66–70 m, fuera de los 65 m de la cañonera y dentro de sus 70 (cañones
// N2), con el alcance medido de centro a centro en los dos (updateCombat). Gira alrededor de la cañonera a toda vela y
// corrige la distancia en radial: lo que se acerca la cañonera más 1 m/s por cada metro que se aparta de 68
interface KiteResult {
  time: number; // s hasta hundir a la cañonera (∞ si no la hunde en 300 s)
  hpLost: number;
  volleys: number; // andanadas que dispara la cañonera
  minD: number; // distancia mínima y máxima entre las dos mientras las dos están a flote
  maxD: number;
}
function kite(seed: number): KiteResult {
  const world = i2World(seed);
  world.rng = createRng(seed * 7919 + 1);
  const boat = placeGunboat(world, 0, -300); // mar abierto: a más de 160 m de I3 e I4 y a 190 m del borde
  const me = equip(world, 'a', 0, -368, { classId: 'schooner', upgrades: { cannons: 2, hull: 1, sails: 1 } });
  me.heading = Math.PI / 2; // de costado a la cañonera, en la tangente por la que va a girar
  attack(world, 'a', boat.id);
  const vmax = SHIP_CLASSES.schooner.maxSpeed;
  let t = 0;
  let sunk = false;
  let died = false;
  let volleys = 0;
  let minD = Infinity;
  let maxD = 0;
  while (t < 300 && !sunk && !died) {
    const d = distance(me.pos, boat.pos);
    minD = Math.min(minD, d);
    maxD = Math.max(maxD, d);
    const r = { x: (me.pos.x - boat.pos.x) / d, z: (me.pos.z - boat.pos.z) / d };
    const toward = forward(boat.heading);
    const closing = boat.speed * (toward.x * r.x + toward.z * r.z); // lo que se acerca la cañonera, en m/s
    const vr = Math.max(-vmax, Math.min(vmax, closing + (68 - d)));
    const vt = Math.sqrt(Math.max(0, vmax * vmax - vr * vr));
    const dir = { x: r.x * vr - r.z * vt, z: r.z * vr + r.x * vt };
    const n = Math.hypot(dir.x, dir.z);
    moveTo(world, 'a', { x: me.pos.x + (dir.x / n) * 30, z: me.pos.z + (dir.z / n) * 30 });
    const events: GameEvent[] = run(world, DT);
    t += DT;
    for (const e of events) {
      if (e.type === 'volley' && e.shipId === boat.id) volleys++;
      if (e.type === 'sunk' && e.shipId === boat.id) sunk = true;
      if (e.type === 'sunk' && e.shipId === me.id) died = true;
    }
  }
  return { time: sunk ? t : Infinity, hpLost: 1 - Math.max(0, me.hp) / me.maxHp, volleys, minD, maxD };
}

describe('E15 — Balance de la Goleta y del Navío (AC-163, 1 000 duelos con semilla)', () => {
  test('AC-163: Goleta N1 contra Pirata → mediana 18–24 s y 18–30 % de vida perdida', () => {
    const r = seeds.map((s) => duelNpc(s, { classId: 'schooner', upgrades: N1 }, 'pirate'));
    const time = median(r.map((d) => d.time));
    const lost = median(r.map((d) => d.hpLost));
    console.log(`AC-163 Goleta N1 vs Pirata: ${time.toFixed(2)} s, vida perdida ${pct(lost)}; muertes ${r.filter((d) => d.died).length}/1000 (referencia de producto: 20,5 s y 24 %)`);
    expect(time).toBeGreaterThanOrEqual(18);
    expect(time).toBeLessThanOrEqual(24);
    expect(lost).toBeGreaterThanOrEqual(0.18);
    expect(lost).toBeLessThanOrEqual(0.3);
  });

  test('AC-163: Goleta con cañones N2 contra Cañonera, ambos a tiro → mediana 20–30 s y 20–45 % de vida perdida', () => {
    const r = seeds.map((s) => duelNpc(s, { classId: 'schooner', upgrades: { cannons: 2, hull: 1, sails: 1 } }, 'gunboat')); // casco y velas, N1
    const time = median(r.map((d) => d.time));
    const lost = median(r.map((d) => d.hpLost));
    console.log(`AC-163 Goleta (cañones N2) vs Cañonera: ${time.toFixed(2)} s, vida perdida ${pct(lost)}; muertes ${r.filter((d) => d.died).length}/1000 (referencia de producto: 25 s y 33 %)`);
    expect(time).toBeGreaterThanOrEqual(20);
    expect(time).toBeLessThanOrEqual(30);
    expect(lost).toBeGreaterThanOrEqual(0.2);
    expect(lost).toBeLessThanOrEqual(0.45);
  });

  test('AC-163: Goleta con cañones N2 contra Cañonera, manteniéndose a 66–70 m (20 semillas) → la hunde en todas sin perder vida, y la Cañonera no dispara', () => {
    const r = seeds.slice(0, 20).map((s) => kite(s));
    const span = (xs: number[]) => `${Math.min(...xs).toFixed(2)}–${Math.max(...xs).toFixed(2)}`;
    console.log(`AC-163 Goleta (cañones N2) vs Cañonera a 66–70 m: hundida en ${r.filter((k) => k.time < Infinity).length}/20, tiempo ${span(r.map((k) => k.time))} s (mediana ${median(r.map((k) => k.time)).toFixed(2)}), vida perdida máx. ${pct(Math.max(...r.map((k) => k.hpLost)))}, andanadas de la cañonera ${r.reduce((a, k) => a + k.volleys, 0)}; distancia ${span(r.map((k) => k.minD))} a ${span(r.map((k) => k.maxD))} m`);
    // El bot cumple su parte: si saliera de la franja, el 0 % no diría nada de las reglas
    expect(r.filter((k) => k.minD < 66 || k.maxD > 70).map((k) => ({ minD: k.minD, maxD: k.maxD }))).toEqual([]);
    expect(r.map((k) => ({ sunk: k.time < Infinity, hpLost: k.hpLost, volleys: k.volleys }))).toEqual(r.map(() => ({ sunk: true, hpLost: 0, volleys: 0 })));
  });

  test('AC-163: Navío con todo a N3 contra el Capitán → mediana 9–16 s y 5–15 % de vida perdida', () => {
    const r = seeds.map((s) => duelNpc(s, { classId: 'line', upgrades: N3 }, 'captain'));
    const time = median(r.map((d) => d.time));
    const lost = median(r.map((d) => d.hpLost));
    console.log(`AC-163 Navío N3 vs Capitán: ${time.toFixed(2)} s, vida perdida ${pct(lost)}; muertes ${r.filter((d) => d.died).length}/1000 (referencia de producto: 12,5 s y 10 %)`);
    expect(time).toBeGreaterThanOrEqual(9);
    expect(time).toBeLessThanOrEqual(16);
    expect(lost).toBeGreaterThanOrEqual(0.05);
    expect(lost).toBeLessThanOrEqual(0.15);
  });

  test('AC-163: Navío con todo a N3 contra Fragata con todo a N3 (PvP) → gana el Navío en ≥ 95 %, con el 45–75 % de vida perdida (mediana)', () => {
    const r = seeds.map((s) => duelPvp(s, { classId: 'line', upgrades: N3 }, { classId: 'frigate', upgrades: N3 }));
    const wins = r.filter((d) => d.time < Infinity).length / r.length;
    const lost = median(r.map((d) => d.hpLost));
    console.log(`AC-163 Navío N3 vs Fragata N3: gana el Navío ${pct(wins)}, pierde ${r.filter((d) => d.died).length}/1000; vida perdida del Navío ${pct(lost)}; mediana del tiempo ${median(r.map((d) => d.time)).toFixed(2)} s (referencia de producto: 24,5 s y 62 %)`);
    expect(wins).toBeGreaterThanOrEqual(0.95);
    expect(lost).toBeGreaterThanOrEqual(0.45);
    expect(lost).toBeLessThanOrEqual(0.75);
  });
});

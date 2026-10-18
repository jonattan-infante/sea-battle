// H-306 Cañonera pirata (GDD §9, I2): población con el I2 encendido (AC-51), reaparición (AC-52), IA de mantener la
// distancia (AC-113) y balance (AC-114). Los números van escritos a mano, del GDD: así el test no se ajusta a las
// constantes que compara AC-04
import { GUNBOAT_CLASS, ISLANDS, MERCHANT_RING, PIRATE_RING, PlayerShipClass, TICK_RATE } from '../constants';
import { GameEvent, Ship, Upgrades, World } from '../types';
import { createRng, distance, headingTo } from '../vec';
import { attack, createWorld, maxHpFor, moveTo, shipOfPlayer, spawnGunboat } from '../world';
import { DT, i2World, median, placeGunboat, placePlayer, run } from './helpers';

// GDD §9, «IA de la cañonera pirata»: «si la distancia al objetivo es > 64 m, se acerca a velocidad máxima; entre 55 y
// 64 m, orbita a 62 m a 6 m/s; por debajo de 55 m, se aleja del objetivo a velocidad máxima sin dejar de disparar.
// Dispara cuando la distancia es ≤ 65 m». Estadísticas (§9): 900 de vida, 5 / 8 m/s, reaparición a los 45 s, 1 por sector
// en el anillo de 400–470 m. Margen de navegación (§6): L/2 + 2 = 16 m con sus 28 m de eslora
const GDD = { approach: 64, flee: 55, orbit: 62, orbitSpeed: 6, range: 65, maxSpeed: 8, hp: 900, respawn: 45, ring: { min: 400, max: 470 }, clearance: 16 };
const PORT = { x: 0, z: 0 };
// Mar abierto, como en AC-188: a ≥ 220 m de toda isla y a 300 m del puerto
const OPEN = { x: 0, z: -300 };

// Sector pirata de un punto (GDD §4): NE = (x+, z−), NO = (x−, z−), SO = (x−, z+), SE = (x+, z+)
const sectorOf = (p: { x: number; z: number }) => (p.x > 0 ? (p.z < 0 ? 0 : 3) : p.z < 0 ? 1 : 2);
const gunboats = (world: World) => [...world.ships.values()].filter((s) => s.classId === GUNBOAT_CLASS);
const offIslands = (p: { x: number; z: number }, clearance: number) => ISLANDS.every((i) => Math.hypot(p.x - i.x, p.z - i.z) >= i.radius + clearance);
const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('H-306 — Población con el I2 encendido (AC-51)', () => {
  test.each([1, 2, 3, 4, 5])('AC-51 (I2 encendido, semilla %i): 8 piratas (2 por sector), 4 cañoneras (1 por sector, en el anillo de 400–470 m) y 8 mercantes', (seed) => {
    const world = createWorld({ seed, i2: true });
    const ships = [...world.ships.values()];
    const pirates = ships.filter((s) => s.classId === 'pirate');
    const boats = gunboats(world);
    const merchants = ships.filter((s) => s.kind === 'merchant');
    expect([pirates.length, boats.length, merchants.length, ships.length]).toEqual([8, 4, 8, 20]);
    const perSector = (list: Ship[]) => [0, 1, 2, 3].map((k) => list.filter((s) => sectorOf(s.pos) === k && s.ai!.sector === k).length);
    expect(perSector(pirates)).toEqual([2, 2, 2, 2]);
    expect(perSector(boats)).toEqual([1, 1, 1, 1]);
    for (const b of boats) {
      const r = distance(b.pos, PORT);
      expect({ r, inRing: r >= GDD.ring.min && r <= GDD.ring.max, offIslands: offIslands(b.pos, GDD.clearance) }).toEqual({ r, inRing: true, offIslands: true });
      expect([b.kind, b.hp, b.maxHp, b.ai!.state, b.ai!.origin]).toEqual(['pirate', GDD.hp, GDD.hp, 'patrol', b.pos]);
    }
    for (const p of pirates) {
      const r = distance(p.pos, PORT);
      expect(r >= PIRATE_RING.min - 1e-6 && r <= PIRATE_RING.max + 1e-6).toBe(true);
    }
    for (const m of merchants) {
      const r = distance(m.pos, PORT);
      expect(r >= MERCHANT_RING.min && r <= MERCHANT_RING.max).toBe(true);
    }
  });
});

describe('H-306 — Reaparición de la cañonera (AC-52)', () => {
  // Las islas I3, I4, I5 e I6 entran en el anillo contado con su margen (GDD §4): con pocas apariciones, un margen
  // menor (el del pirata, 12 m) no se vería
  test('AC-52: 2 000 puntos de aparición (500 semillas × 4 sectores) quedan en su sector, en el anillo de 400–470 m y a ≥ 16 m de la costa', () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 500; seed++) {
      const world = i2World(seed);
      for (const sector of [0, 1, 2, 3]) {
        const b = spawnGunboat(world, sector)!;
        const r = distance(b.pos, PORT);
        if (sectorOf(b.pos) !== sector || r < GDD.ring.min || r > GDD.ring.max || !offIslands(b.pos, GDD.clearance)) bad.push(`s${seed}/${sector}: (${b.pos.x.toFixed(1)}, ${b.pos.z.toFixed(1)})`);
      }
    }
    expect(bad).toEqual([]);
  });

  test.each([1, 2, 3, 4, 5, 6, 7, 8])('AC-52 (semilla %i): hundida, reaparece a los 45 s ±1 tick en su sector, en el anillo de 400–470 m, a ≥ 100 m de los jugadores y fuera de las islas', (seed) => {
    const world = i2World(seed);
    const boat = placeGunboat(world, 311, -311); // NE, a 440 m del puerto
    placePlayer(world, 'a', boat.pos.x - 30, boat.pos.z);
    placePlayer(world, 'b', 377, -218); // otro jugador quieto en el mismo arco del anillo (435 m a 30°)
    boat.hp = 1;
    const rng = world.rng;
    world.rng = () => 0; // la primera andanada acierta
    attack(world, 'a', boat.id);
    let sunkAt = -1;
    let respawnAt = -1;
    let at = { x: NaN, z: NaN }; // dónde reaparece (al final del tick de la reaparición, antes de moverse)
    for (let i = 1; i <= (GDD.respawn + 5) * TICK_RATE && respawnAt < 0; i++) {
      if (sunkAt > 0) world.rng = rng;
      for (const e of run(world, DT)) {
        if (e.type === 'sunk' && e.shipId === boat.id) sunkAt = i;
        if (e.type === 'respawn' && e.shipId === boat.id) {
          respawnAt = i;
          at = { ...boat.pos };
        }
      }
    }
    expect(sunkAt).toBeGreaterThan(0);
    expect(Math.abs((respawnAt - sunkAt) * DT - GDD.respawn)).toBeLessThanOrEqual(DT + 1e-9);
    const r = distance(at, PORT);
    expect([boat.state, boat.classId, boat.hp, sectorOf(at), boat.ai!.sector, boat.ai!.state, boat.ai!.origin]).toEqual(['alive', GUNBOAT_CLASS, GDD.hp, 0, 0, 'patrol', at]);
    expect({ r, inRing: r >= GDD.ring.min && r <= GDD.ring.max, offIslands: offIslands(at, GDD.clearance) }).toEqual({ r, inRing: true, offIslands: true });
    for (const id of ['a', 'b']) expect(distance(at, shipOfPlayer(world, id)!.pos)).toBeGreaterThanOrEqual(100);
  });
});

describe('H-306 — IA de la cañonera: mantiene la distancia (AC-113, GDD §9)', () => {
  // Cañonera a `d` m de un objetivo quieto (indestructible), en el rumbo `angle` desde él y mirando a `heading`
  function engage(d: number, angle: number, heading: number, seed = 1) {
    const world = i2World(seed);
    const target = placePlayer(world, 'a', OPEN.x, OPEN.z);
    target.hp = target.maxHp = 1e9;
    const boat = placeGunboat(world, OPEN.x + Math.sin(angle) * d, OPEN.z + Math.cos(angle) * d, heading);
    return { world, target, boat };
  }

  // Maniobra que decide en su primer tick de combate: hacia dónde queda su destino visto desde el objetivo
  test.each([
    [54.9, 'se aleja'],
    [55.1, 'orbita'],
    [63.9, 'orbita'],
    [64.1, 'se acerca']
  ] as const)('AC-113: a %d m del objetivo %s', (d, expected) => {
    for (const angle of [0, 1.6, 3.2, 4.8]) {
      const { world, target, boat } = engage(d, angle, 0);
      run(world, 2 * DT); // 1.er tick: lo detecta (≤ 80 m); 2.º: maniobra
      expect(boat.ai!.state).toBe('combat');
      const dest = boat.destination!;
      const bearing = headingTo(target.pos, boat.pos);
      const out = distance(dest, target.pos) - distance(boat.pos, target.pos); // > 0: el destino queda más lejos del objetivo
      const turn = angleBetween(headingTo(target.pos, dest), bearing); // > 0: el destino rodea al objetivo
      const got = turn > 0.2 ? 'orbita' : out > 0 ? 'se aleja' : 'se acerca';
      expect({ d, angle, got }).toEqual({ d, angle, got: expected });
    }
  });

  test('AC-113: contra un objetivo quieto a 40 m se aleja a velocidad máxima hasta ≥ 55 m sin dejar de disparar, y la mediana de su distancia en 20 s es 62 ±4 m (4 rumbos × 3 orientaciones)', () => {
    const medians: number[] = [];
    let fleeSpeed = Infinity;
    for (const angle of [0, 1.6, 3.2, 4.8]) {
      for (const facing of [0, Math.PI / 2, Math.PI]) {
        // facing 0: mira al objetivo (tiene que dar la vuelta); π: ya le da la espalda
        const { world, target, boat } = engage(40, angle, 0);
        boat.heading = headingTo(boat.pos, target.pos) + facing;
        const d: number[] = [];
        let top = 0;
        let fledVolleys = 0;
        const volleys: number[] = [];
        for (let i = 0; i < 20 * TICK_RATE; i++) {
          const before = distance(boat.pos, target.pos);
          for (const e of run(world, DT)) {
            if (e.type !== 'volley' || e.shipId !== boat.id) continue;
            volleys.push(distance(e.from, e.to));
            if (before < GDD.flee) fledVolleys++;
          }
          const now = distance(boat.pos, target.pos);
          if (now < GDD.flee) top = Math.max(top, boat.speed);
          d.push(now);
        }
        const m = median(d);
        medians.push(m);
        fleeSpeed = Math.min(fleeSpeed, top);
        const settled = d.slice(-5 * TICK_RATE); // últimos 5 s
        expect({ angle, facing, state: boat.ai!.state, inBand: m >= GDD.orbit - 4 && m <= GDD.orbit + 4, out: Math.min(...settled) >= GDD.flee }).toEqual({
          angle, facing, state: 'combat', inBand: true, out: true
        });
        expect({ angle, facing, fledVolleys: fledVolleys > 0, maxVolley: Math.max(...volleys) <= GDD.range }).toEqual({ angle, facing, fledVolleys: true, maxVolley: true });
      }
    }
    console.log(`AC-113 quieto a 40 m: medianas ${Math.min(...medians).toFixed(2)}–${Math.max(...medians).toFixed(2)} m en ${medians.length} corridas; velocidad máxima al alejarse (la menor de las corridas) ${fleeSpeed.toFixed(2)} m/s`);
    expect(fleeSpeed).toBeGreaterThan(GDD.orbitSpeed); // se aleja más rápido que su órbita: va a la máxima
  });

  test('AC-113: dispara solo a ≤ 65 m: contra un objetivo quieto a 78 m, se acerca y su primera andanada sale a ≤ 65 m', () => {
    for (const angle of [0, 1.6, 3.2, 4.8]) {
      const { world, boat } = engage(78, angle, 0);
      const volleys: number[] = [];
      let top = 0;
      for (let i = 0; i < 20 * TICK_RATE; i++) {
        for (const e of run(world, DT)) if (e.type === 'volley' && e.shipId === boat.id) volleys.push(distance(e.from, e.to));
        if (distance(boat.pos, OPEN) > GDD.approach) top = Math.max(top, boat.speed);
      }
      expect({ angle, fired: volleys.length > 0, first: volleys[0] <= GDD.range, all: Math.max(...volleys) <= GDD.range }).toEqual({ angle, fired: true, first: true, all: true });
      expect({ angle, approachFaster: top > GDD.orbitSpeed }).toEqual({ angle, approachFaster: true }); // por fuera se acerca a la máxima
    }
  });

  // «Si queda acorralada contra una isla o el borde, orbita» (GDD §9): de espaldas al borde, a una esquina o a una isla, a
  // 40 m del objetivo, no se queda pegada a la costa por debajo de 55 m: sale orbitando y vuelve a su radio
  test.each([
    ['el borde este', { x: 440, z: -250 }, { x: 480, z: -250 }],
    ['la esquina NE', { x: 450, z: -450 }, { x: 478, z: -478 }],
    ['la isla I1', { x: 150, z: 200 }, { x: 190, z: 200 }],
    ['la isla I3', { x: -100, z: -280 }, { x: -140, z: -280 }]
  ] as const)('AC-113: acorralada contra %s, orbita: en 30 s sigue disparando y en los 10 últimos está a ≥ 55 m, con la mediana en 62 ±4 m', (_, at, from) => {
    for (const facing of [0, Math.PI / 2, Math.PI]) {
      const world = i2World(1);
      const target = placePlayer(world, 'a', at.x, at.z);
      target.hp = target.maxHp = 1e9;
      const boat = placeGunboat(world, from.x, from.z);
      boat.heading = headingTo(boat.pos, target.pos) + facing;
      const d: number[] = [];
      let volleys = 0;
      for (let i = 0; i < 30 * TICK_RATE; i++) {
        for (const e of run(world, DT)) if (e.type === 'volley' && e.shipId === boat.id) volleys++;
        d.push(distance(boat.pos, target.pos));
      }
      const last = d.slice(-10 * TICK_RATE);
      const m = median(last);
      expect({ facing, state: boat.ai!.state, fired: volleys > 0, out: Math.min(...last) >= GDD.flee, inBand: m >= GDD.orbit - 4 && m <= GDD.orbit + 4 }).toEqual({
        facing, state: 'combat', fired: true, out: true, inBand: true
      });
    }
  });

  test('AC-113: se la puede alcanzar: un objetivo que se le acerca a 10 m/s (Fragata N1) le recorta la distancia', () => {
    const traces: string[] = [];
    for (const angle of [0, 1.6, 3.2, 4.8]) {
      const { world, target, boat } = engage(50, angle, 0);
      target.classId = 'frigate';
      const d0 = distance(boat.pos, target.pos);
      let closest = d0;
      for (let i = 0; i < 20 * TICK_RATE; i++) {
        moveTo(world, 'a', boat.pos);
        run(world, DT);
        closest = Math.min(closest, distance(boat.pos, target.pos));
      }
      const end = distance(boat.pos, target.pos);
      traces.push(`${angle}: ${d0.toFixed(1)} → ${end.toFixed(1)} m (mín. ${closest.toFixed(1)})`);
      expect({ angle, closer: end < d0, caught: closest <= 30 }).toEqual({ angle, closer: true, caught: true });
    }
    console.log(`AC-113 alcance a 10 m/s: ${traces.join(' · ')}`);
  });
});

describe('H-306 — Balance de la cañonera (AC-114, 1 000 duelos con semilla)', () => {
  // Bot de duelo de AC-53 y AC-55, en el mismo punto de partida: ataca y se mantiene a ≤ 40 m del objetivo, sin reparar
  function duel(seed: number, classId: PlayerShipClass, upgrades: Upgrades): { time: number; hpLost: number; died: boolean } {
    const world = i2World(seed);
    world.rng = createRng(seed * 7919 + 1);
    const me = placePlayer(world, 'a', 260, -380, 0);
    const boat = placeGunboat(world, 260, -330);
    const player = world.players.get('a')!;
    player.upgrades = { ...upgrades };
    player.ownedShips = [classId];
    player.activeShip = classId;
    me.classId = classId;
    me.maxHp = maxHpFor(classId, player);
    me.hp = me.maxHp;
    attack(world, 'a', boat.id);
    let t = 0;
    let sunk = false;
    let died = false;
    while (t < 120 && !sunk && !died) {
      const events: GameEvent[] = run(world, DT);
      t += DT;
      for (const e of events) {
        if (e.type === 'sunk' && e.shipId === boat.id) sunk = true;
        if (e.type === 'sunk' && e.shipId === me.id) died = true;
      }
      if (Math.round(t * TICK_RATE) % 10 === 0 && distance(me.pos, boat.pos) > 40) moveTo(world, 'a', boat.pos);
    }
    return { time: sunk ? t : Infinity, hpLost: 1 - Math.max(0, me.hp) / me.maxHp, died };
  }

  const many = (classId: PlayerShipClass, upgrades: Upgrades) => Array.from({ length: 1000 }, (_, i) => duel(i + 1, classId, upgrades));
  const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

  test('AC-114: un Bergantín con cañones N2 → mediana 15–22 s y 10–25 % de vida perdida', () => {
    const r = many('brig', { cannons: 2, hull: 1, sails: 1 }); // «con cañones N2»: casco y velas, N1
    const time = median(r.map((d) => d.time));
    const lost = median(r.map((d) => d.hpLost));
    console.log(`AC-114 Bergantín (cañones N2): ${time.toFixed(2)} s, vida perdida ${pct(lost)}; muertes ${r.filter((d) => d.died).length}/1000 (referencia de producto, ambos a tiro: 18,0 s y 17 %)`);
    expect(time).toBeGreaterThanOrEqual(15);
    expect(time).toBeLessThanOrEqual(22);
    expect(lost).toBeGreaterThanOrEqual(0.1);
    expect(lost).toBeLessThanOrEqual(0.25);
  });

  test('AC-114: una Balandra N1 pierde entre el 55 y el 80 % de su vida (mediana)', () => {
    const r = many('sloop', { cannons: 1, hull: 1, sails: 1 });
    const lost = median(r.map((d) => d.hpLost));
    console.log(`AC-114 Balandra N1: vida perdida ${pct(lost)}; muertes ${r.filter((d) => d.died).length}/1000; mediana del tiempo hasta hundir a la cañonera ${median(r.map((d) => d.time)).toFixed(2)} s (referencia de producto: 68 %)`);
    expect(lost).toBeGreaterThanOrEqual(0.55);
    expect(lost).toBeLessThanOrEqual(0.8);
  });
});

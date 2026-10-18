// H-305 Capitán pirata (GDD §9, I2): aparición (AC-54), balance (AC-55) y correa (AC-112)
import {
  CAPTAIN_CLASS,
  CAPTAIN_KILLS_TO_SPAWN,
  CAPTAIN_LAIR_RADIUS,
  CAPTAIN_SPAWN_MIN_PLAYER_DISTANCE,
  HOSTILE_AI,
  PIRATE_PORT_EXCLUSION,
  PIRATE_SECTORS,
  PlayerShipClass,
  TICK_RATE
} from '../constants';
import { GameEvent, Ship, Upgrades, World } from '../types';
import { createRng, distance } from '../vec';
import { addPlayer, attack, createWorld, maxHpFor, moveTo, respawn, setRepair, shipOfPlayer, spawnCaptain, spawnMerchant, spawnPirate } from '../world';
import { DT, i2World, median, placeCaptain, placePlayer, run } from './helpers';

const PORT = { x: 0, z: 0 };
const CAPTAIN = HOSTILE_AI[CAPTAIN_CLASS];

// Capitanes en el mundo (vivos o hundiéndose)
const captains = (world: World) => [...world.ships.values()].filter((s) => s.classId === CAPTAIN_CLASS && s.state !== 'dead');
// Sector pirata de un punto (GDD §4): NE = (x+, z−), NO = (x−, z−), SO = (x−, z+), SE = (x+, z+)
const sectorOf = (p: { x: number; z: number }) => (p.x > 0 ? (p.z < 0 ? 0 : 3) : p.z < 0 ? 1 : 2);
const players = (world: World) => [...world.ships.values()].filter((s) => s.kind === 'player');

// Hunde un NPC con la mecánica real: K le dispara una andanada que acierta (tiradas a 0 solo durante el disparo).
// K no se hunde: los NPC que se le acercan también disparan. Devuelve los eventos del tick en que se hunde
function sinkByPlayer(world: World, npc: Ship, killerId = 'K'): GameEvent[] {
  const killer = shipOfPlayer(world, killerId)!;
  killer.hp = killer.maxHp = 1e9;
  npc.pos = { x: killer.pos.x + 30, z: killer.pos.z };
  npc.destination = null;
  npc.path = [];
  npc.hp = 1;
  killer.reload = 0;
  const rng = world.rng;
  world.rng = () => 0;
  expect(attack(world, killerId, npc.id).ok).toBe(true);
  try {
    for (let i = 0; i < 3 * TICK_RATE; i++) {
      const tick = run(world, DT);
      if (tick.some((e) => e.type === 'sunk' && e.shipId === npc.id)) return tick;
    }
  } finally {
    world.rng = rng;
  }
  throw new Error(`${npc.id} no se hundió`);
}

describe('H-305 — Aparición del Capitán pirata (AC-54)', () => {
  test('AC-54: el 10.º pirata hundido hace aparecer 1 capitán, en el mismo tick, en el punto exterior (440 m) del sector con menos jugadores y a ≥ 150 m de todos; los mercantes no cuentan', () => {
    const world = i2World(7);
    placePlayer(world, 'K', -200, 200); // SO
    placePlayer(world, 'P1', 200, -200); // NE
    placePlayer(world, 'P2', -200, -200); // NO
    // SE (índice 3) queda sin jugadores
    for (let i = 0; i < 3; i++) sinkByPlayer(world, spawnMerchant(world));
    expect(world.killsSinceBoss).toBe(0);
    for (let i = 0; i < CAPTAIN_KILLS_TO_SPAWN - 1; i++) sinkByPlayer(world, spawnPirate(world, 0));
    expect(world.killsSinceBoss).toBe(9);
    expect(captains(world)).toHaveLength(0);

    const tick = sinkByPlayer(world, spawnPirate(world, 0));
    const list = captains(world);
    expect(list).toHaveLength(1);
    const c = list[0];
    console.log(`AC-54: capitán en (${c.pos.x.toFixed(1)}, ${c.pos.z.toFixed(1)}), r ${distance(c.pos, PORT).toFixed(2)} m, sector ${PIRATE_SECTORS[sectorOf(c.pos)].id}, jugador más cercano a ${Math.min(...players(world).map((p) => distance(p.pos, c.pos))).toFixed(1)} m`);
    expect(c.kind).toBe('pirate');
    expect(c.name).toBe('Capitán pirata');
    expect(c.hp).toBe(1800);
    expect(distance(c.pos, PORT)).toBeCloseTo(CAPTAIN_LAIR_RADIUS, 6);
    expect(sectorOf(c.pos)).toBe(3);
    expect(c.ai!.origin).toEqual(c.pos); // guarida = punto de aparición
    for (const p of players(world)) expect(distance(c.pos, p.pos)).toBeGreaterThanOrEqual(CAPTAIN_SPAWN_MIN_PLAYER_DISTANCE);
    // Mismo tick que el hundimiento del 10.º, con el aviso para todos
    expect(tick).toContainEqual(expect.objectContaining({ type: 'captain', shipId: c.id, sector: 'SE' }));
  });

  test('AC-54: nunca hay 2 capitanes vivos; al hundirse, la cuenta vuelve a 0 (su muerte no cuenta) y el siguiente necesita otros 10', () => {
    const world = i2World(8);
    placePlayer(world, 'K', -200, 200);
    for (let i = 0; i < CAPTAIN_KILLS_TO_SPAWN; i++) sinkByPlayer(world, spawnPirate(world, 0));
    const first = captains(world);
    expect(first).toHaveLength(1);
    // Con el capitán vivo, otros 15 piratas hundidos no hacen aparecer un segundo
    for (let i = 0; i < 15; i++) {
      sinkByPlayer(world, spawnPirate(world, 0));
      expect(captains(world).map((s) => s.id)).toEqual([first[0].id]);
    }
    expect(spawnCaptain(world)).toBeNull(); // tampoco a mano
    expect(spawnCaptain(world, { x: 300, z: -300 })).toBeNull();

    const down = sinkByPlayer(world, first[0]);
    expect(world.killsSinceBoss).toBe(0);
    expect(down).toContainEqual(expect.objectContaining({ type: 'captainDown', shipId: first[0].id, names: ['K'], more: 0 }));
    run(world, 5); // termina de hundirse y sale del mundo: no reaparece por tiempo
    expect(world.ships.has(first[0].id)).toBe(false);
    run(world, 60);
    expect(captains(world)).toHaveLength(0);

    for (let i = 0; i < CAPTAIN_KILLS_TO_SPAWN - 1; i++) sinkByPlayer(world, spawnPirate(world, 0));
    expect(captains(world)).toHaveLength(0);
    sinkByPlayer(world, spawnPirate(world, 0));
    const second = captains(world);
    expect(second).toHaveLength(1);
    expect(second[0].id).not.toBe(first[0].id);
  });

  test('AC-54: si el centro del arco exterior del sector elegido está a < 150 m de un jugador, aparece en otro punto del mismo arco (440 m) a ≥ 150 m', () => {
    const world = i2World(9);
    placePlayer(world, 'K', -200, 200);
    placePlayer(world, 'SO2', -250, 150);
    placePlayer(world, 'NE1', 200, -200);
    placePlayer(world, 'NE2', 250, -150);
    placePlayer(world, 'NO1', -200, -200);
    placePlayer(world, 'NO2', -250, -150);
    const bisector = (CAPTAIN_LAIR_RADIUS * Math.SQRT2) / 2;
    placePlayer(world, 'SE1', bisector, bisector); // SE: 1 jugador, justo en el centro del arco
    for (let i = 0; i < CAPTAIN_KILLS_TO_SPAWN; i++) sinkByPlayer(world, spawnPirate(world, 0));
    const [c] = captains(world);
    expect(c).toBeDefined();
    expect(sectorOf(c.pos)).toBe(3);
    expect(distance(c.pos, PORT)).toBeCloseTo(CAPTAIN_LAIR_RADIUS, 6);
    const nearest = Math.min(...players(world).map((p) => distance(p.pos, c.pos)));
    console.log(`AC-54 (arco ocupado): capitán en (${c.pos.x.toFixed(1)}, ${c.pos.z.toFixed(1)}), jugador más cercano a ${nearest.toFixed(1)} m`);
    expect(nearest).toBeGreaterThanOrEqual(CAPTAIN_SPAWN_MIN_PLAYER_DISTANCE);
  });
});

describe('H-305 — Correa del capitán (AC-112)', () => {
  // Guarida en el centro del arco NE, en mar abierto
  const LAIR = { x: (CAPTAIN_LAIR_RADIUS * Math.SQRT2) / 2, z: -(CAPTAIN_LAIR_RADIUS * Math.SQRT2) / 2 };

  test('AC-112: si el objetivo lo arrastra a más de 150 m de su guarida, vuelve sin disparar y llega con el 100 % de la vida', () => {
    const world = i2World(3);
    const cap = placeCaptain(world, LAIR.x, LAIR.z);
    const target = placePlayer(world, 'a', LAIR.x - 60, LAIR.z);
    target.hp = target.maxHp = 1e9;
    run(world, DT);
    expect(cap.ai!.state).toBe('combat');
    cap.hp = 900;
    // El jugador huye hacia el oeste y se mantiene a 60 m por delante del capitán (lo arrastra)
    let leftAt = -1;
    let maxFromLair = 0;
    const volleysOnReturn: number[] = [];
    let arrivedHp = -1;
    for (let i = 0; i < 90 * TICK_RATE && arrivedHp < 0; i++) {
      if (leftAt < 0) target.pos = { x: cap.pos.x - 60, z: LAIR.z };
      // La IA decide con la posición del principio del tick (antes de moverse)
      const before = cap.ai!.state;
      const d0 = distance(cap.pos, LAIR);
      for (const e of run(world, DT)) if (e.type === 'volley' && e.shipId === cap.id && cap.ai!.state !== 'combat') volleysOnReturn.push(i);
      maxFromLair = Math.max(maxFromLair, distance(cap.pos, LAIR));
      if (leftAt < 0 && cap.ai!.state === 'return') {
        leftAt = i;
        console.log(`AC-112: vuelve con ${d0.toFixed(2)} m de su guarida al empezar el tick (antes: ${before})`);
        expect(before).toBe('combat');
        expect(d0).toBeGreaterThan(CAPTAIN.leash);
        expect(d0).toBeLessThanOrEqual(CAPTAIN.leash + 10 * DT + 1e-6); // el primer tick fuera (10 m/s)
        expect(cap.attackTargetId).toBeNull();
      }
      if (leftAt >= 0 && cap.ai!.state === 'patrol') arrivedHp = cap.hp;
    }
    console.log(`AC-112: máximo alejamiento ${maxFromLair.toFixed(1)} m (inercia al dar la vuelta)`);
    expect(leftAt).toBeGreaterThan(0);
    expect(volleysOnReturn).toEqual([]);
    expect(arrivedHp).toBe(cap.maxHp);
    expect(distance(cap.pos, LAIR)).toBeLessThanOrEqual(10);
  });

  test.each([
    ['se aleja a más de 110 m', (_w: World, t: Ship, c: Ship) => { t.pos = { x: c.pos.x - 150, z: c.pos.z }; }],
    ['queda protegido', (w: World, t: Ship) => { t.protectedUntil = w.time + 30; }],
    ['se hunde', (_w: World, t: Ship) => { t.state = 'sinking'; t.stateTimer = 3; }]
  ])('AC-112: si pierde al objetivo (%s), vuelve sin disparar y llega con el 100 %% de la vida', (_label, lose) => {
    const world = i2World(4);
    const cap = placeCaptain(world, LAIR.x, LAIR.z);
    const target = placePlayer(world, 'a', LAIR.x - 70, LAIR.z);
    target.hp = target.maxHp = 1e9;
    run(world, 6); // combate
    expect(cap.ai!.state).toBe('combat');
    cap.hp = 1000;
    lose(world, target, cap);
    run(world, DT);
    expect(cap.ai!.state).toBe('return');
    expect(cap.attackTargetId).toBeNull();
    let volleys = 0;
    for (let i = 0; i < 60 * TICK_RATE && cap.ai!.state === 'return'; i++) {
      if (target.state !== 'alive') target.stateTimer = 3; // que siga hundiéndose
      for (const e of run(world, DT)) if (e.type === 'volley' && e.shipId === cap.id) volleys++;
    }
    expect(volleys).toBe(0);
    expect(cap.ai!.state).toBe('patrol');
    expect(cap.hp).toBe(cap.maxHp);
  });

  test('AC-112: detecta a ≤ 90 m (no a 95), orbita a 50 ±5 m (mediana en 20 s) y dispara solo a ≤ 65 m', () => {
    const world = i2World(5);
    const cap = placeCaptain(world, LAIR.x, LAIR.z);
    const target = placePlayer(world, 'a', LAIR.x - 95, LAIR.z);
    target.hp = target.maxHp = 1e9;
    run(world, 1);
    expect(cap.ai!.state).toBe('patrol');
    target.pos = { x: LAIR.x - 89, z: LAIR.z };
    run(world, DT);
    expect(cap.ai!.state).toBe('combat');
    const d: number[] = [];
    let farVolleys = 0;
    let volleys = 0;
    // Distancia al objetivo en cada tick y, en cada andanada, distancia al disparar
    for (const e of run(world, 25, () => d.push(distance(cap.pos, target.pos)))) {
      if (e.type !== 'volley' || e.shipId !== cap.id) continue;
      volleys++;
      if (distance(e.from, e.to) > 65 + 1e-6) farVolleys++;
    }
    const orbit = median(d.slice(5 * TICK_RATE));
    console.log(`AC-112 (combate): mediana de la órbita ${orbit.toFixed(1)} m; ${volleys} andanadas, ${farVolleys} a > 65 m`);
    expect(Math.abs(orbit - CAPTAIN.orbitRadius)).toBeLessThanOrEqual(5);
    expect(volleys).toBeGreaterThan(0);
    expect(farVolleys).toBe(0);
  });

  test('AC-112: en 10 min simulados con 20 bots, 4 de ellos lo atacan y huyen hacia el puerto para arrastrarlo, ningún capitán está nunca a menos de 130 m del puerto', () => {
    const world = createWorld({ seed: 21, i2: true });
    const rng = createRng(31);
    for (let i = 0; i < 20; i++) addPlayer(world, `bot${i}`, `Bot ${i}`);
    expect(spawnCaptain(world)).not.toBeNull();
    const LURERS = 4;
    let minToPort = Infinity;
    let combatTicks = 0;
    let returns = 0;
    let maxFromLairOnReturn = 0;
    const seen = new Set<string>();
    const lastState = new Map<string, string>();
    for (let t = 0; t < 600 * TICK_RATE; t++) {
      if (t % TICK_RATE === 0) {
        const cap = captains(world).find((s) => s.state === 'alive');
        for (let i = 0; i < 20; i++) {
          const id = `bot${i}`;
          const ship = shipOfPlayer(world, id)!;
          if (ship.state === 'dead') {
            world.players.get(id)!.death!.at = -100;
            respawn(world, id);
            continue;
          }
          if (ship.state !== 'alive') continue;
          if (i < LURERS) {
            // Señuelos: le disparan y, si el capitán los elige o les queda poca vida, huyen al puerto para arrastrarlo
            if (!cap) moveTo(world, id, { x: 0, z: 0 });
            else if (cap.attackTargetId === ship.id || ship.hp / ship.maxHp < 0.6) moveTo(world, id, { x: 0, z: 0 });
            else if (ship.hp >= ship.maxHp * 0.95 || distance(ship.pos, cap.pos) < 120) {
              attack(world, id, cap.id);
              if (distance(ship.pos, cap.pos) > 55) moveTo(world, id, cap.pos);
            }
            continue;
          }
          // El resto caza piratas (para que aparezcan capitanes nuevos) y a veces vuelve al puerto
          if (rng() < 0.05) {
            moveTo(world, id, { x: 0, z: 0 });
            continue;
          }
          const near = [...world.ships.values()]
            .filter((s) => s.kind === 'pirate' && s.state === 'alive' && s.classId !== CAPTAIN_CLASS)
            .sort((a, b) => distance(a.pos, ship.pos) - distance(b.pos, ship.pos))[0];
          if (near && ship.attackTargetId !== near.id) {
            attack(world, id, near.id);
            moveTo(world, id, near.pos);
          }
        }
      }
      // Los señuelos que vuelven al puerto reparan
      for (let i = 0; i < LURERS; i++) {
        const ship = shipOfPlayer(world, `bot${i}`)!;
        if (ship.state === 'alive' && !ship.destination && ship.hp < ship.maxHp && !ship.repairing && distance(ship.pos, { x: 0, z: 0 }) < 110) setRepair(world, `bot${i}`, true);
      }
      run(world, DT);
      for (const s of captains(world)) {
        seen.add(s.id);
        if (s.state !== 'alive') continue;
        minToPort = Math.min(minToPort, distance(s.pos, PORT));
        if (s.ai!.state === 'combat') combatTicks++;
        if (s.ai!.state === 'return' && lastState.get(s.id) !== 'return') {
          returns++;
          maxFromLairOnReturn = Math.max(maxFromLairOnReturn, distance(s.pos, s.ai!.origin));
        }
        lastState.set(s.id, s.ai!.state);
      }
    }
    console.log(`AC-112 (10 min): ${seen.size} capitanes, ${(combatTicks / TICK_RATE).toFixed(0)} s en combate, ${returns} regresos (el más lejano, a ${maxFromLairOnReturn.toFixed(1)} m de su guarida); mínimo al puerto ${minToPort.toFixed(1)} m`);
    expect(combatTicks).toBeGreaterThan(0);
    expect(returns).toBeGreaterThan(0);
    expect(minToPort).toBeGreaterThanOrEqual(PIRATE_PORT_EXCLUSION);
  });
});

describe('H-305 — Balance del capitán (AC-55, 1 000 duelos con semilla)', () => {
  interface Side {
    classId: PlayerShipClass;
    upgrades: Upgrades;
  }
  interface DuelResult {
    time: number; // s hasta hundir al capitán (∞ si no lo hunde en 120 s)
    deaths: number; // jugadores hundidos
    hpLost: number; // mayor fracción de vida perdida entre los jugadores (la del objetivo del capitán)
    playerLost: boolean; // todos los jugadores hundidos antes que el capitán
  }

  // Bot de duelo de AC-53: ataca y se mantiene a ≤ 40 m del objetivo, sin reparar. Varios jugadores atacan a la vez
  function duel(seed: number, sides: Side[]): DuelResult {
    const world = i2World(seed);
    world.rng = createRng(seed * 7919 + 1);
    const cap = placeCaptain(world, 260, -330);
    const mine = sides.map((side, i) => {
      const id = `p${i}`;
      const ship = placePlayer(world, id, 260 + (i - (sides.length - 1) / 2) * 20, -380, 0);
      const player = world.players.get(id)!;
      player.upgrades = { ...side.upgrades };
      player.ownedShips = [side.classId];
      player.activeShip = side.classId;
      ship.classId = side.classId;
      ship.maxHp = maxHpFor(side.classId, player);
      ship.hp = ship.maxHp;
      attack(world, id, cap.id);
      return { id, ship };
    });
    let t = 0;
    let sunk = false;
    let deaths = 0;
    while (t < 120 && !sunk && deaths < mine.length) {
      const events = run(world, DT);
      t += DT;
      for (const e of events) {
        if (e.type !== 'sunk') continue;
        if (e.shipId === cap.id) sunk = true;
        else if (mine.some((m) => m.ship.id === e.shipId)) deaths++;
      }
      if (Math.round(t * TICK_RATE) % 10 === 0) {
        for (const m of mine) if (m.ship.state === 'alive' && distance(m.ship.pos, cap.pos) > 40) moveTo(world, m.id, cap.pos);
      }
    }
    return {
      time: sunk ? t : Infinity,
      deaths,
      hpLost: Math.max(...mine.map((m) => 1 - Math.max(0, m.ship.hp) / m.ship.maxHp)),
      playerLost: deaths === mine.length && !sunk
    };
  }

  const N3: Upgrades = { cannons: 3, hull: 3, sails: 3 };
  const N2: Upgrades = { cannons: 2, hull: 2, sails: 1 };
  const N1: Upgrades = { cannons: 1, hull: 1, sails: 1 };
  const many = (sides: Side[]) => Array.from({ length: 1000 }, (_, i) => duel(i + 1, sides));
  const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

  test('AC-55: Fragata con todo a N3 → mediana 12–20 s y 10–25 % de vida perdida', () => {
    const r = many([{ classId: 'frigate', upgrades: N3 }]);
    const time = median(r.map((d) => d.time));
    const lost = median(r.map((d) => d.hpLost));
    console.log(`AC-55 Fragata N3: ${time.toFixed(2)} s, vida perdida ${pct(lost)}; muertes ${r.filter((d) => d.deaths > 0).length}/1000`);
    expect(time).toBeGreaterThanOrEqual(12);
    expect(time).toBeLessThanOrEqual(20);
    expect(lost).toBeGreaterThanOrEqual(0.1);
    expect(lost).toBeLessThanOrEqual(0.25);
  });

  test('AC-55: 2 Bergantines (cañones y casco N2) → mediana 14–22 s y sin muertes en ≥ 95 % de los duelos', () => {
    const r = many([{ classId: 'brig', upgrades: N2 }, { classId: 'brig', upgrades: N2 }]);
    const time = median(r.map((d) => d.time));
    const clean = r.filter((d) => d.deaths === 0).length / r.length;
    const lost = median(r.map((d) => d.hpLost));
    // GDD §9 añade 20–45 % de vida perdida por el objetivo del capitán: se registra (AC-55 no lo pide)
    console.log(`AC-55 2 Bergantines N2: ${time.toFixed(2)} s, duelos sin muertes ${pct(clean)}, vida perdida del objetivo ${pct(lost)} (GDD §9: 20–45 %)`);
    expect(time).toBeGreaterThanOrEqual(14);
    expect(time).toBeLessThanOrEqual(22);
    expect(clean).toBeGreaterThanOrEqual(0.95);
  });

  test('AC-55: una Balandra N1 sola pierde en ≥ 95 % de los duelos', () => {
    const r = many([{ classId: 'sloop', upgrades: N1 }]);
    const lostRate = r.filter((d) => d.playerLost).length / r.length;
    const capHpLeft = median(r.map((d) => d.time));
    console.log(`AC-55 Balandra N1: pierde ${pct(lostRate)} (mediana del tiempo hasta hundir al capitán: ${capHpLeft})`);
    expect(lostRate).toBeGreaterThanOrEqual(0.95);
  });
});

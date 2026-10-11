import {
  ISLANDS,
  MERCHANT_RING,
  NPC_RESPAWN_MIN_PLAYER_DISTANCE,
  PIRATE_PORT_EXCLUSION,
  PIRATE_RING,
  SAFE_ZONE_RADIUS,
  SHIP_CLASSES,
  TICK_RATE
} from '../constants';
import { GameEvent, Ship } from '../types';
import { createRng, distance } from '../vec';
import { addPlayer, attack, createWorld, moveTo, shipOfPlayer } from '../world';
import { DT, emptyWorld, median, placeMerchant, placePirate, placePlayer, run } from './helpers';

describe('E3 — Pirata hostil (§9)', () => {
  test('AC-43: entra en combate en ≤ 1 tick a ≤ 70 m y dispara cuando la distancia es ≤ 55 m', () => {
    const world = emptyWorld();
    const player = placePlayer(world, 'a', 300, -300);
    const pirate = placePirate(world, 300, -369);
    run(world, DT);
    expect(pirate.ai!.state).toBe('combat');
    let firstVolleyDist = -1;
    for (let i = 0; i < 20 * TICK_RATE && firstVolleyDist < 0; i++) {
      for (const e of run(world, DT)) if (e.type === 'volley' && e.shipId === pirate.id) firstVolleyDist = distance(pirate.pos, player.pos);
    }
    expect(firstVolleyDist).toBeGreaterThan(0);
    expect(firstVolleyDist).toBeLessThanOrEqual(55);
  });

  test('AC-44: no elige jugadores en la zona segura ni protegidos', () => {
    const world = emptyWorld();
    const inSafe = placePlayer(world, 'a', 0, 105);
    const pirate = placePirate(world, 0, 165);
    run(world, 1);
    expect(pirate.ai!.state).toBe('patrol');
    inSafe.pos = { x: 300, z: 300 };
    inSafe.protectedUntil = world.time + 10;
    pirate.pos = { x: 300, z: 340 };
    pirate.ai!.origin = { x: 300, z: 340 };
    run(world, 1);
    expect(pirate.ai!.state).toBe('patrol');
  });

  test('AC-45: con el objetivo a más de 110 m regresa sin disparar y llega con el 100 % de vida', () => {
    const world = emptyWorld();
    const player = placePlayer(world, 'a', 300, 300);
    const pirate = placePirate(world, 300, 350);
    run(world, 1);
    expect(pirate.ai!.state).toBe('combat');
    pirate.hp = 100;
    player.pos = { x: 300, z: 470 };
    player.speed = 0;
    const events = run(world, DT);
    expect(pirate.ai!.state).toBe('return');
    const after = run(world, 30, () => { player.pos = { x: 300, z: 470 }; });
    expect([...events, ...after].filter((e) => e.type === 'volley' && e.shipId === pirate.id && pirate.ai!.state === 'return')).toHaveLength(0);
    expect(pirate.ai!.state).toBe('patrol');
    expect(pirate.hp).toBe(pirate.maxHp);
  });

  test('AC-45: tampoco se aleja más de 200 m de su origen', () => {
    const world = emptyWorld();
    const player = placePlayer(world, 'a', 300, 300);
    const pirate = placePirate(world, 300, 350);
    run(world, 1);
    pirate.pos = { x: 300, z: 350 - 205 };
    player.pos = { x: 300, z: 350 - 245 };
    run(world, DT);
    expect(pirate.ai!.state).toBe('return');
  });

  test('AC-46: si un jugador lo daña desde 80 m, lo elige como objetivo (represalia)', () => {
    const world = emptyWorld();
    world.rng = () => 0;
    placePlayer(world, 'a', 300, 300);
    shipOfPlayer(world, 'a')!.protectedUntil = 0;
    const pirate = placePirate(world, 300, 380);
    world.players.get('a')!.upgrades.cannons = 3; // alcance 80 m
    attack(world, 'a', pirate.id);
    run(world, 1);
    expect(pirate.ai!.state).toBe('combat');
    expect(pirate.ai!.targetId).toBe(shipOfPlayer(world, 'a')!.id);
  });

  test('AC-48: en combate contra un objetivo quieto orbita a 45 ±5 m (mediana en 20 s)', () => {
    const world = emptyWorld();
    const player = placePlayer(world, 'a', 300, 300);
    player.hp = player.maxHp = 1e9;
    const pirate = placePirate(world, 300, 360);
    run(world, 5);
    const d: number[] = [];
    run(world, 20, () => d.push(distance(pirate.pos, player.pos)));
    expect(Math.abs(median(d) - 45)).toBeLessThanOrEqual(5);
  });
});

describe('E3 — Mercante pasivo (§9)', () => {
  test('AC-50: tras recibir daño se aleja del atacante quieto de forma monótona a 9 ±0,2 m/s y luego vuelve a su ruta', () => {
    const world = emptyWorld();
    world.rng = () => 0;
    const player = placePlayer(world, 'a', -200, 220, 0);
    const merchant = placeMerchant(world, -200, 270, 0); // ya mira en dirección contraria al atacante
    merchant.speed = SHIP_CLASSES.merchant.patrolSpeed;
    attack(world, 'a', merchant.id);
    run(world, 1);
    expect(merchant.ai!.state).toBe('flee');
    player.state = 'dead'; // el atacante deja de disparar y queda quieto
    const samples: number[] = [];
    run(world, 10.9, () => samples.push(distance(merchant.pos, player.pos)));
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    const rate = (samples[samples.length - 1] - samples[samples.length - 1 - 4 * TICK_RATE]) / 4;
    expect(Math.abs(rate - 9)).toBeLessThanOrEqual(0.2);
    run(world, 2);
    expect(merchant.ai!.state).toBe('route');
  });

  test('AC-49 y AC-47: en 10 min con 20 bots los mercantes no disparan y ningún pirata entra en 130 m del puerto', () => {
    const world = createWorld({ seed: 5 });
    const rng = createRng(11);
    for (let i = 0; i < 20; i++) addPlayer(world, `bot${i}`, `Bot ${i}`);
    let merchantVolleys = 0;
    let minPirateToPort = Infinity;
    for (let t = 0; t < 600 * TICK_RATE; t++) {
      if (t % (5 * TICK_RATE) === 0) {
        for (let i = 0; i < 20; i++) {
          const ship = shipOfPlayer(world, `bot${i}`)!;
          // Entran y salen del puerto y atacan lo que tengan cerca
          const out = rng() < 0.5;
          const a = rng() * Math.PI * 2;
          const r = out ? 150 + rng() * 300 : rng() * 90;
          moveTo(world, `bot${i}`, { x: Math.cos(a) * r, z: Math.sin(a) * r });
          const near = [...world.ships.values()].find((s) => s.kind !== 'player' && s.state === 'alive' && distance(s.pos, ship.pos) < 80);
          if (near) attack(world, `bot${i}`, near.id);
          if (ship.state === 'dead') world.players.get(`bot${i}`)!.death!.at = -100;
        }
      }
      for (const e of run(world, DT)) {
        if (e.type === 'volley' && world.ships.get(e.shipId)?.kind === 'merchant') merchantVolleys++;
      }
      for (const s of world.ships.values()) {
        if (s.kind === 'pirate' && s.state === 'alive') minPirateToPort = Math.min(minPirateToPort, distance(s.pos, { x: 0, z: 0 }));
      }
    }
    expect(merchantVolleys).toBe(0);
    expect(minPirateToPort).toBeGreaterThanOrEqual(PIRATE_PORT_EXCLUSION - 1e-6);
  });
});

describe('E3 — Población y reaparición (§9)', () => {
  test('AC-51: al arrancar hay 12 piratas (3 por sector) y 8 mercantes en sus zonas', () => {
    const world = createWorld({ seed: 3 });
    const pirates = [...world.ships.values()].filter((s) => s.kind === 'pirate');
    const merchants = [...world.ships.values()].filter((s) => s.kind === 'merchant');
    expect(pirates).toHaveLength(12);
    expect(merchants).toHaveLength(8);
    const sectors = [0, 0, 0, 0];
    for (const p of pirates) {
      const r = distance(p.pos, { x: 0, z: 0 });
      expect(r).toBeGreaterThanOrEqual(PIRATE_RING.min - 1e-6);
      expect(r).toBeLessThanOrEqual(PIRATE_RING.max + 1e-6);
      const sector = p.pos.x > 0 ? (p.pos.z < 0 ? 0 : 3) : p.pos.z < 0 ? 1 : 2;
      expect(sector).toBe(p.ai!.sector);
      sectors[sector]++;
    }
    expect(sectors).toEqual([3, 3, 3, 3]);
    for (const m of merchants) {
      const r = distance(m.pos, { x: 0, z: 0 });
      expect(r).toBeGreaterThanOrEqual(MERCHANT_RING.min);
      expect(r).toBeLessThanOrEqual(MERCHANT_RING.max);
    }
  });

  test.each([['pirate', 30], ['merchant', 20]])('AC-52: un %s hundido reaparece a los %d s ±1 tick, en su zona, lejos de jugadores y fuera de islas', (kind, seconds) => {
    const world = emptyWorld();
    world.rng = createRng(4);
    const victim: Ship = kind === 'pirate' ? placePirate(world, 300, -350) : placeMerchant(world, 200, 50);
    const player = placePlayer(world, 'a', victim.pos.x, victim.pos.z + 30);
    victim.hp = 1;
    const rngBackup = world.rng;
    world.rng = () => 0;
    attack(world, 'a', victim.id);
    let sunkAt = -1;
    let respawnAt = -1;
    for (let i = 1; i <= (seconds + 5) * TICK_RATE; i++) {
      if (sunkAt > 0) world.rng = rngBackup;
      for (const e of run(world, DT)) {
        if (e.type === 'sunk' && e.shipId === victim.id) sunkAt = i;
        if (e.type === 'respawn' && e.shipId === victim.id) respawnAt = i;
      }
    }
    expect(Math.abs((respawnAt - sunkAt) * DT - seconds)).toBeLessThanOrEqual(DT + 1e-9);
    expect(victim.state).toBe('alive');
    expect(distance(victim.pos, player.pos)).toBeGreaterThanOrEqual(NPC_RESPAWN_MIN_PLAYER_DISTANCE);
    for (const isl of ISLANDS) expect(Math.hypot(victim.pos.x - isl.x, victim.pos.z - isl.z)).toBeGreaterThan(isl.radius);
    const r = distance(victim.pos, { x: 0, z: 0 });
    if (kind === 'pirate') expect(r).toBeGreaterThanOrEqual(PIRATE_RING.min - 1e-6);
    else expect(r).toBeGreaterThan(SAFE_ZONE_RADIUS);
  });
});

describe('E3 — Balance de duelos (§9)', () => {
  // Bot de duelo: ataca y se mantiene a ≤ 40 m del objetivo, sin reparar
  function duel(seed: number, kind: 'pirate' | 'merchant'): { time: number; hpLost: number } {
    const world = emptyWorld(seed);
    world.rng = createRng(seed * 7919 + 1);
    const me = placePlayer(world, 'a', 260, -380, 0);
    const npc = kind === 'pirate' ? placePirate(world, 260, -330) : placeMerchant(world, 260, -330, 0);
    attack(world, 'a', npc.id);
    let t = 0;
    let sunk = false;
    while (t < 120 && !sunk) {
      const events: GameEvent[] = run(world, DT);
      t += DT;
      if (events.some((e) => e.type === 'sunk' && e.shipId === npc.id)) sunk = true;
      if (Math.round(t * TICK_RATE) % 10 === 0 && distance(me.pos, npc.pos) > 40) moveTo(world, 'a', npc.pos);
    }
    return { time: sunk ? t : Infinity, hpLost: 1 - me.hp / me.maxHp };
  }

  test('AC-53: Balandra N1 vs pirata, mediana 18–24 s y 25–40 % de vida perdida; vs mercante, 10–14 s (1 000 duelos)', () => {
    const pirate = Array.from({ length: 1000 }, (_, i) => duel(i + 1, 'pirate'));
    const merchant = Array.from({ length: 1000 }, (_, i) => duel(i + 1, 'merchant'));
    const pTime = median(pirate.map((d) => d.time));
    const pLost = median(pirate.map((d) => d.hpLost));
    const mTime = median(merchant.map((d) => d.time));
    // Evidencia para el reporte de QA
    console.log(`AC-53 pirata: ${pTime.toFixed(2)} s, vida perdida ${(pLost * 100).toFixed(1)} %; mercante: ${mTime.toFixed(2)} s`);
    expect(pTime).toBeGreaterThanOrEqual(18);
    expect(pTime).toBeLessThanOrEqual(24);
    expect(pLost).toBeGreaterThanOrEqual(0.25);
    expect(pLost).toBeLessThanOrEqual(0.4);
    expect(mTime).toBeGreaterThanOrEqual(10);
    expect(mTime).toBeLessThanOrEqual(14);
  });
});

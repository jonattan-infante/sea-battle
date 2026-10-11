import {
  CANNON_LEVELS,
  INTEREST_RADIUS,
  ISLANDS,
  NAV_LIMIT,
  navClearance,
  PIRATE_PORT_EXCLUSION,
  PIRATE_RETURN_ARRIVE,
  RESPAWN_RING,
  SAFE_ZONE_RADIUS,
  SHIP_CLASSES,
  STARTING_GOLD,
  TAB_TARGET_RADIUS,
  TICK_RATE
} from '../../src/game/constants';
import { addPlayer, attack, createWorld, drainEvents, setRepair, shipOfPlayer, step } from '../../src/game/world';
import {
  AMBUSH_POINT,
  applyScenario,
  BLIND_GUNNER_POINT,
  ENDURANCE_MERCHANT_RADIUS,
  ENDURANCE_MERCHANTS,
  ENDURANCE_POINT,
  parseScenario,
  REPAIR_START_HULL,
  SHOWCASE_POINT,
  TARGET_FAN,
  TARGETS_POINT
} from '../scenarios';

describe('escenario "showcase" para capturas', () => {
  const world = createWorld({ seed: 1, spawnNpcs: false });
  applyScenario(world, 'showcase');
  const npcs = [...world.ships.values()];
  const near = (p: { x: number; z: number }, r: number) => npcs.filter((s) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) <= r);

  test('coloca 2 piratas, 1 mercante y unos restos cerca de los puntos de captura, 5 piratas en la emboscada y el artillero ciego', () => {
    expect(npcs.filter((s) => s.kind === 'pirate')).toHaveLength(8);
    const blind = near(BLIND_GUNNER_POINT, 1);
    expect(blind).toHaveLength(1);
    expect(blind[0].accuracyOverride).toBe(0);
    expect(npcs.filter((s) => s.accuracyOverride !== undefined)).toHaveLength(1);
    expect(npcs.filter((s) => s.kind === 'merchant')).toHaveLength(1);
    expect(world.wrecks).toHaveLength(1);
    expect(near(SHOWCASE_POINT, 50).some((s) => s.kind === 'pirate')).toBe(true);
    expect(near(AMBUSH_POINT, 31).filter((s) => s.kind === 'pirate')).toHaveLength(5);
  });

  test('el punto de captura está fuera de la zona segura y ninguna entidad toca una isla ni la exclusión de piratas', () => {
    expect(Math.hypot(SHOWCASE_POINT.x, SHOWCASE_POINT.z)).toBeGreaterThan(SAFE_ZONE_RADIUS);
    for (const s of npcs) {
      for (const isl of ISLANDS) expect(Math.hypot(s.pos.x - isl.x, s.pos.z - isl.z)).toBeGreaterThan(isl.radius + SHIP_CLASSES[s.classId].radius);
      if (s.kind === 'pirate') expect(Math.hypot(s.pos.x, s.pos.z)).toBeGreaterThan(PIRATE_PORT_EXCLUSION);
      expect(Math.max(Math.abs(s.pos.x), Math.abs(s.pos.z))).toBeLessThan(NAV_LIMIT);
    }
  });

  // QA-5 H-13: tras un combate, los piratas del escenario volvían a su origen y se ponían a patrullar a ≤ 120 m
  // (world.ts sobrescribía su espera de 1e9), así que el estado del servidor compartido dependía de los tests anteriores
  test.each([
    ['el pirata del punto de captura', SHOWCASE_POINT, 50],
    ['el artillero ciego', BLIND_GUNNER_POINT, 1]
  ])('%s vuelve a su puesto tras un combate y se queda quieto en él', (label, point, radius) => {
    const w = createWorld({ seed: 3, spawnNpcs: false });
    applyScenario(w, 'showcase');
    const pirate = [...w.ships.values()].find((s) => s.kind === 'pirate' && Math.hypot(s.pos.x - point.x, s.pos.z - point.z) <= radius)!;
    const post = { ...pirate.pos };
    addPlayer(w, 'u1', 'Ana');
    const ship = shipOfPlayer(w, 'u1')!;
    const run = (seconds: number, x: number, z: number) => {
      for (let i = 0; i < seconds * TICK_RATE; i++) {
        ship.pos = { x, z };
        ship.speed = 0;
        ship.destination = null;
        step(w, 1 / TICK_RATE);
        drainEvents(w);
      }
    };
    ship.protectedUntil = 0;
    run(20, post.x, post.z - 45); // combate contra un jugador a 45 m
    expect(pirate.ai!.state).toBe('combat');
    run(80, post.x, post.z - 200); // el jugador se aleja: el pirata vuelve a su origen
    const drift = Math.hypot(pirate.pos.x - post.x, pirate.pos.z - post.z);
    console.log(`H-13: ${label}, tras el combate, en ${pirate.ai!.state} a ${drift.toFixed(1)} m de su puesto`);
    expect(drift).toBeLessThanOrEqual(PIRATE_RETURN_ARRIVE);
  });

  test('todos los piratas del escenario esperan en su puesto (holdPosition)', () => {
    expect(npcs.filter((s) => s.kind === 'pirate').every((s) => s.holdPosition === true)).toBe(true);
  });

  test('la emboscada y el artillero ciego quedan fuera del radio de interés desde el anillo de reaparición y el punto de captura', () => {
    // Así no aparecen en las capturas estándar ni en su minimapa
    for (const s of [...near(AMBUSH_POINT, 31), ...near(BLIND_GUNNER_POINT, 1)]) {
      expect(Math.hypot(s.pos.x, s.pos.z) - RESPAWN_RING.max).toBeGreaterThan(INTEREST_RADIUS);
      expect(Math.hypot(s.pos.x - SHOWCASE_POINT.x, s.pos.z - SHOWCASE_POINT.z)).toBeGreaterThan(INTEREST_RADIUS);
    }
  });
});

describe('escenario "shipyard" (AC-70)', () => {
  test('cada jugador entra con el precio del Bergantín; sin escenario, con el oro inicial del GDD', () => {
    const rich = createWorld({ seed: 1, spawnNpcs: false });
    applyScenario(rich, 'shipyard');
    expect(addPlayer(rich, 'u1', 'Ana').gold).toBe(SHIP_CLASSES.brig.price);
    expect(rich.ships.size).toBe(1); // solo el barco del jugador: no añade NPC
    expect(addPlayer(createWorld({ seed: 1, spawnNpcs: false }), 'u1', 'Ana').gold).toBe(STARTING_GOLD);
  });

  test('parseScenario solo acepta los escenarios conocidos', () => {
    expect(parseScenario('showcase')).toBe('showcase');
    expect(parseScenario('shipyard')).toBe('shipyard');
    expect(parseScenario('targets')).toBe('targets');
    expect(parseScenario('endurance')).toBe('endurance');
    expect(parseScenario('repair')).toBe('repair');
    expect(parseScenario('rich')).toBeNull();
    expect(parseScenario(undefined)).toBeNull();
  });
});

describe('escenario "targets" (AC-27, AC-31)', () => {
  const world = createWorld({ seed: 1, spawnNpcs: false });
  applyScenario(world, 'targets');
  const npcs = [...world.ships.values()];
  const dist = (p: { x: number; z: number }) => Math.hypot(p.x - TARGETS_POINT.x, p.z - TARGETS_POINT.z);
  const sorted = npcs.slice().sort((a, b) => dist(a.pos) - dist(b.pos));

  test('4 mercantes quietos y sin IA (no huyen ni disparan) a 40, 90, 140 y 170 m del punto', () => {
    expect(npcs).toHaveLength(4);
    expect(npcs.every((s) => s.kind === 'merchant' && s.ai === null && s.destination === null && s.path.length === 0)).toBe(true);
    TARGET_FAN.forEach((t, i) => expect(dist(sorted[i].pos)).toBeCloseTo(t.d, 1));
  });

  test('el punto queda fuera de la zona segura y el de 170 m fuera del radio de Tab; el de 40 m a tiro del cañón inicial y el de 90 m no', () => {
    expect(Math.hypot(TARGETS_POINT.x, TARGETS_POINT.z)).toBeGreaterThan(SAFE_ZONE_RADIUS);
    const [d40, d90, d140, d170] = sorted.map((s) => dist(s.pos));
    expect(d140).toBeLessThanOrEqual(TAB_TARGET_RADIUS);
    expect(d170).toBeGreaterThan(TAB_TARGET_RADIUS);
    expect(d40).toBeLessThanOrEqual(CANNON_LEVELS[0].range);
    expect(d90).toBeGreaterThan(CANNON_LEVELS[0].range);
  });

  test('ningún mercante ni el punto tocan una isla ni salen del límite navegable', () => {
    for (const p of [...npcs.map((s) => s.pos), TARGETS_POINT]) {
      for (const isl of ISLANDS) expect(Math.hypot(p.x - isl.x, p.z - isl.z)).toBeGreaterThan(isl.radius + navClearance('merchant'));
      expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(NAV_LIMIT);
    }
  });
});

describe('escenario "repair" (AC-128)', () => {
  test('el abanico de "targets" y cada jugador entra con el casco al 10 %; sin escenario, entero', () => {
    const world = createWorld({ seed: 1, spawnNpcs: false });
    applyScenario(world, 'repair');
    const npcs = [...world.ships.values()];
    expect(npcs).toHaveLength(4);
    expect(npcs.every((s) => s.kind === 'merchant' && s.ai === null && s.destination === null)).toBe(true);
    const ship = shipOfPlayer(world, addPlayer(world, 'u1', 'Ana').id)!;
    expect(ship.hp).toBe(Math.round(ship.maxHp * REPAIR_START_HULL));
    const plain = createWorld({ seed: 1, spawnNpcs: false });
    const full = shipOfPlayer(plain, addPlayer(plain, 'u1', 'Ana').id)!;
    expect(full.hp).toBe(full.maxHp);
  });

  test('sin nadie que dispare, 18 s reparando dejan el casco por debajo del 90 % que pide AC-128', () => {
    const world = createWorld({ seed: 1, spawnNpcs: false });
    applyScenario(world, 'repair');
    const player = addPlayer(world, 'u1', 'Ana');
    const ship = shipOfPlayer(world, player.id)!;
    expect(setRepair(world, player.id, true).ok).toBe(true);
    for (let i = 0; i < 18 * TICK_RATE; i++) step(world, 1 / TICK_RATE);
    expect(ship.repairing).toBe(true);
    expect(ship.hp).toBeGreaterThan(Math.round(ship.maxHp * REPAIR_START_HULL));
    expect(ship.hp / ship.maxHp).toBeLessThanOrEqual(0.9);
  });
});

describe('escenario "endurance" (AC-91)', () => {
  const world = createWorld({ seed: 1, spawnNpcs: false });
  applyScenario(world, 'endurance');
  const npcs = [...world.ships.values()];
  const merchants = npcs.filter((s) => s.kind === 'merchant');
  const pirates = npcs.filter((s) => s.kind === 'pirate');
  const dist = (p: { x: number; z: number }) => Math.hypot(p.x - ENDURANCE_POINT.x, p.z - ENDURANCE_POINT.z);

  test('mercantes quietos y sin IA en corro, que reaparecen en su sitio, y un pirata de puntería baja; oro para N2 + N3', () => {
    expect(merchants).toHaveLength(ENDURANCE_MERCHANTS);
    for (const m of merchants) {
      expect(m.ai).toBeNull();
      expect(m.respawnPos).toEqual(m.pos);
      expect(dist(m.pos)).toBeCloseTo(ENDURANCE_MERCHANT_RADIUS, 6);
    }
    expect(pirates).toHaveLength(1);
    expect(pirates[0].accuracyOverride).toBeLessThan(SHIP_CLASSES.pirate.cannon!.accuracy);
    expect(addPlayer(world, 'u1', 'Ana').gold).toBe(CANNON_LEVELS[1].price + CANNON_LEVELS[2].price);
  });

  test('el punto queda fuera de la zona segura y nada toca una isla, la exclusión de piratas ni el límite navegable', () => {
    expect(Math.hypot(ENDURANCE_POINT.x, ENDURANCE_POINT.z)).toBeGreaterThan(SAFE_ZONE_RADIUS);
    for (const s of npcs) {
      for (const isl of ISLANDS) expect(Math.hypot(s.pos.x - isl.x, s.pos.z - isl.z)).toBeGreaterThan(isl.radius + navClearance(s.classId));
      if (s.kind === 'pirate') expect(Math.hypot(s.pos.x, s.pos.z)).toBeGreaterThan(PIRATE_PORT_EXCLUSION);
      expect(Math.max(Math.abs(s.pos.x), Math.abs(s.pos.z))).toBeLessThan(NAV_LIMIT);
    }
  });

  // La carga que exige AC-91, con la misma política que e2e/endurance.spec.ts (reacción cada 0,5 s): ataca al mercante
  // vivo más cercano, repara al bajar del 45 % y vuelve a atacar al pasar del 55 %. Se mide desde la primera reparación
  // completa (el calentamiento del e2e)
  test('en 10 min tras el calentamiento, un jugador con cañones N3 hunde ≥ 40 mercantes que reaparecen, recibe daño, repara y no se hunde', () => {
    const w = createWorld({ seed: 7, spawnNpcs: false });
    applyScenario(w, 'endurance');
    const player = addPlayer(w, 'bot', 'Bot');
    player.upgrades.cannons = 3;
    const ship = shipOfPlayer(w, 'bot')!;
    ship.pos = { ...ENDURANCE_POINT };
    ship.protectedUntil = 0;
    const merchantIds = new Set([...w.ships.values()].filter((s) => s.kind === 'merchant').map((s) => s.id));
    const sunk = new Set<string>();
    const load = { cycles: 0, damageTaken: 0, repairs: 0, deaths: 0 };
    let repairsDone = 0;
    let wasRepairing = false;
    let measuredTicks = 0;
    for (let i = 0; measuredTicks < 600 * TICK_RATE; i++) {
      if (repairsDone === 0 && i > 300 * TICK_RATE) throw new Error('sin una reparación completa en 5 min simulados de calentamiento');
      if (wasRepairing && !ship.repairing) repairsDone++;
      wasRepairing = ship.repairing;
      const measuring = repairsDone > 0;
      if (measuring) measuredTicks++;
      step(w, 1 / TICK_RATE);
      for (const e of drainEvents(w)) {
        if (e.type === 'sunk' && merchantIds.has(e.shipId)) sunk.add(e.shipId);
        if (e.type === 'sunk' && e.shipId === ship.id && measuring) load.deaths++;
        if (e.type === 'respawn' && sunk.delete(e.shipId) && measuring) load.cycles++;
        if (e.type === 'impact' && e.shipId === ship.id && measuring) load.damageTaken += e.damage;
      }
      if (i % (TICK_RATE / 2) !== 0 || ship.state !== 'alive') continue;
      if (!ship.repairing && ship.hp <= ship.maxHp * 0.45) {
        setRepair(w, 'bot', true);
        if (measuring) load.repairs++;
      } else if ((ship.repairing && ship.hp >= ship.maxHp * 0.55) || (!ship.repairing && !ship.attackTargetId)) {
        const next = [...w.ships.values()]
          .filter((s) => merchantIds.has(s.id) && s.state === 'alive')
          .sort((a, b) => Math.hypot(a.pos.x - ship.pos.x, a.pos.z - ship.pos.z) - Math.hypot(b.pos.x - ship.pos.x, b.pos.z - ship.pos.z))[0];
        if (next) attack(w, 'bot', next.id);
      }
    }
    console.log(`AC-91 (simulación): ${load.cycles} ciclos · ${load.damageTaken} de daño recibido · ${load.repairs} reparaciones · ${load.deaths} hundimientos propios`);
    expect(load.cycles).toBeGreaterThanOrEqual(40);
    expect(load.damageTaken).toBeGreaterThan(0);
    expect(load.repairs).toBeGreaterThanOrEqual(3);
    expect(load.deaths).toBe(0);
  });
});

import {
  CANNON_LEVELS,
  INTEREST_RADIUS,
  ISLANDS,
  NAV_LIMIT,
  navClearance,
  PIRATE_PORT_EXCLUSION,
  RESPAWN_RING,
  SAFE_ZONE_RADIUS,
  SHIP_CLASSES,
  STARTING_GOLD,
  TAB_TARGET_RADIUS
} from '../../src/game/constants';
import { addPlayer, createWorld } from '../../src/game/world';
import { AMBUSH_POINT, applyScenario, BLIND_GUNNER_POINT, parseScenario, SHOWCASE_POINT, TARGET_FAN, TARGETS_POINT } from '../scenarios';

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

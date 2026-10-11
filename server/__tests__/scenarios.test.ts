import { INTEREST_RADIUS, ISLANDS, NAV_LIMIT, PIRATE_PORT_EXCLUSION, RESPAWN_RING, SAFE_ZONE_RADIUS, SHIP_CLASSES, STARTING_GOLD } from '../../src/game/constants';
import { addPlayer, createWorld } from '../../src/game/world';
import { AMBUSH_POINT, applyScenario, parseScenario, SHOWCASE_POINT } from '../scenarios';

describe('escenario "showcase" para capturas', () => {
  const world = createWorld({ seed: 1, spawnNpcs: false });
  applyScenario(world, 'showcase');
  const npcs = [...world.ships.values()];
  const near = (p: { x: number; z: number }, r: number) => npcs.filter((s) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) <= r);

  test('coloca 2 piratas, 1 mercante y unos restos cerca de los puntos de captura y 5 piratas en la emboscada', () => {
    expect(npcs.filter((s) => s.kind === 'pirate')).toHaveLength(7);
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

  test('la emboscada queda fuera del radio de interés desde el anillo de reaparición y el punto de captura', () => {
    // Así no aparece en las capturas estándar ni en su minimapa
    for (const s of near(AMBUSH_POINT, 31)) {
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
    expect(parseScenario('rich')).toBeNull();
    expect(parseScenario(undefined)).toBeNull();
  });
});

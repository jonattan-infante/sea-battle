import { ISLANDS, PIRATE_PORT_EXCLUSION, SAFE_ZONE_RADIUS, SHIP_CLASSES } from '../../src/game/constants';
import { createWorld } from '../../src/game/world';
import { applyScenario, SHOWCASE_POINT } from '../scenarios';

describe('escenario "showcase" para capturas', () => {
  const world = createWorld({ seed: 1, spawnNpcs: false });
  applyScenario(world, 'showcase');
  const npcs = [...world.ships.values()];

  test('coloca 2 piratas, 1 mercante y unos restos cerca del punto de captura', () => {
    expect(npcs.filter((s) => s.kind === 'pirate')).toHaveLength(2);
    expect(npcs.filter((s) => s.kind === 'merchant')).toHaveLength(1);
    expect(world.wrecks).toHaveLength(1);
    const pirate = npcs.find((s) => s.kind === 'pirate' && Math.hypot(s.pos.x - SHOWCASE_POINT.x, s.pos.z - SHOWCASE_POINT.z) < 50);
    expect(pirate).toBeDefined();
  });

  test('el punto de captura está fuera de la zona segura y ninguna entidad toca una isla ni la exclusión de piratas', () => {
    expect(Math.hypot(SHOWCASE_POINT.x, SHOWCASE_POINT.z)).toBeGreaterThan(SAFE_ZONE_RADIUS);
    for (const s of npcs) {
      for (const isl of ISLANDS) expect(Math.hypot(s.pos.x - isl.x, s.pos.z - isl.z)).toBeGreaterThan(isl.radius + SHIP_CLASSES[s.classId].radius);
      if (s.kind === 'pirate') expect(Math.hypot(s.pos.x, s.pos.z)).toBeGreaterThan(PIRATE_PORT_EXCLUSION);
    }
  });
});

// Escenarios deterministas para capturas de QA y UX (ART-DIRECTION §18). Solo se aplican con el modo
// invitado permitido (nunca en Railway); en producción el mundo es siempre el del GDD.
import { WRECK_LIFETIME } from '../src/game/constants';
import { World } from '../src/game/types';
import { spawnMerchant, spawnPirate } from '../src/game/world';

// Punto de captura en mar abierto, fuera de la zona segura (r 110) y a ≥ 60 m de cualquier isla
export const SHOWCASE_POINT = { x: 0, z: 200 };

export type ScenarioName = 'showcase';

export function applyScenario(world: World, name: ScenarioName): void {
  if (name !== 'showcase') return;
  // Pirata quieto a 45 m del punto de captura: entra en combate cuando el jugador pierde la protección
  const pirate = spawnPirate(world, 3);
  pirate.pos = { x: 45, z: 205 };
  pirate.heading = -Math.PI / 2;
  pirate.ai!.origin = { ...pirate.pos };
  pirate.ai!.wait = 1e9;
  pirate.destination = null;
  pirate.path = [];

  // Mercante quieto a 40 m al oeste (sin IA: no huye ni sigue su ruta)
  const merchant = spawnMerchant(world);
  merchant.pos = { x: -40, z: 195 };
  merchant.heading = Math.PI / 2;
  merchant.destination = null;
  merchant.path = [];
  merchant.ai = null;

  // Pirata junto a la isla I5 (20, 360; r 30) para capturar el anillo de selección sobre la costa (AC-74)
  const coastal = spawnPirate(world, 2);
  coastal.pos = { x: 20, z: 318 };
  coastal.heading = Math.PI;
  coastal.ai!.origin = { ...coastal.pos };
  coastal.ai!.wait = 1e9;
  coastal.destination = null;
  coastal.path = [];

  // Restos flotantes cerca del punto de captura (VFX §14)
  world.wrecks.push({ id: `wreck-${world.nextId++}`, pos: { x: 12, z: 182 }, gold: 30, expiresAt: world.time + WRECK_LIFETIME * 100 });
}

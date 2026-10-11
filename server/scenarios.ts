// Escenarios deterministas para capturas de QA y UX (ART-DIRECTION §18). Solo se aplican con el modo
// invitado permitido (nunca en Railway); en producción el mundo es siempre el del GDD.
import { SHIP_CLASSES, WRECK_LIFETIME } from '../src/game/constants';
import { World } from '../src/game/types';
import { spawnMerchant, spawnPirate } from '../src/game/world';

// Punto de captura en mar abierto, fuera de la zona segura (r 110) y a ≥ 60 m de cualquier isla
export const SHOWCASE_POINT = { x: 0, z: 200 };

// Emboscada para el e2e de muerte → Zarpar (AC-63): 5 piratas hunden una Balandra en ~15 s. A 420 m del puerto
// queda fuera del radio de interés (300 m) desde todo el anillo de reaparición (≤ 90 m) y desde el punto de
// captura, así que no aparece en las capturas estándar ni en su minimapa.
export const AMBUSH_POINT = { x: 0, z: -420 };
const AMBUSH_PIRATES = 5;
const AMBUSH_RADIUS = 30;

// Artillero ciego para el e2e de "Fallo" (AC-75): un pirata quieto cuyas andanadas nunca aciertan (k = 0). A 424 m
// del puerto, también fuera del radio de interés desde el anillo de reaparición y desde los puntos de captura.
export const BLIND_GUNNER_POINT = { x: -300, z: 300 };

export const SCENARIOS = ['showcase', 'shipyard'] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

export function parseScenario(value: string | undefined): ScenarioName | null {
  return (SCENARIOS as readonly string[]).includes(value ?? '') ? (value as ScenarioName) : null;
}

export function applyScenario(world: World, name: ScenarioName): void {
  if (name === 'shipyard') {
    // AC-70: cada jugador entra con el oro justo para comprar el Bergantín en el puerto
    world.startingGold = SHIP_CLASSES.brig.price;
    return;
  }
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

  const blind = spawnPirate(world, 2);
  blind.pos = { ...BLIND_GUNNER_POINT };
  blind.heading = 0;
  blind.ai!.origin = { ...blind.pos };
  blind.ai!.wait = 1e9;
  blind.destination = null;
  blind.path = [];
  blind.accuracyOverride = 0;

  // Emboscada: piratas quietos en corro alrededor de AMBUSH_POINT; atacan a quien llegue sin protección
  for (let i = 0; i < AMBUSH_PIRATES; i++) {
    const a = (2 * Math.PI * i) / AMBUSH_PIRATES;
    const p = spawnPirate(world, 0);
    p.pos = { x: AMBUSH_POINT.x + Math.cos(a) * AMBUSH_RADIUS, z: AMBUSH_POINT.z + Math.sin(a) * AMBUSH_RADIUS };
    p.heading = a + Math.PI / 2;
    p.ai!.origin = { ...p.pos };
    p.ai!.wait = 1e9;
    p.destination = null;
    p.path = [];
  }
}

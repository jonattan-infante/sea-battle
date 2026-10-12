// Escenarios deterministas para capturas de QA y UX (ART-DIRECTION §18). Solo se aplican con el modo
// invitado permitido (nunca en Railway); en producción el mundo es siempre el del GDD.
import { CANNON_LEVELS, CAPTAIN_KILLS_TO_SPAWN, SHIP_CLASSES, WRECK_LIFETIME } from '../src/game/constants';
import { World } from '../src/game/types';
import { spawnCaptain, spawnMerchant, spawnPirate } from '../src/game/world';

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

// Abanico de objetivos para los e2e de selección y ataque (AC-27, AC-31): 4 mercantes quietos y sin IA (no huyen ni
// disparan) a 40, 90, 140 y 170 m de TARGETS_POINT. Los e2e lo arrancan en su propio servidor
export const TARGETS_POINT = { x: 0, z: 150 };
export const TARGET_FAN = [
  { d: 40, x: 40, z: 150 },
  { d: 90, x: -90, z: 150 },
  { d: 140, x: 0, z: 290 },
  { d: 170, x: 120.21, z: 270.21 }
] as const;

// Corrida larga de AC-91 (e2e/endurance.spec.ts): mercantes quietos y sin IA en corro alrededor de ENDURANCE_POINT, que
// reaparecen en su sitio al hundirse (ciclos de hundimiento y reaparición en pantalla), y un pirata de puntería baja que
// mantiene al jugador bajo fuego sin hundirlo mientras repara. El jugador entra con el oro de los cañones N2 + N3
export const ENDURANCE_POINT = { x: 0, z: -200 };
export const ENDURANCE_MERCHANTS = 5;
export const ENDURANCE_MERCHANT_RADIUS = 28; // dentro de la órbita del pirata (45 m) y a tiro de cualquier cañón
export const ENDURANCE_PIRATE_OFFSET = 60; // a < 70 m (radio de agresión): ataca en cuanto el jugador pierde la protección
export const ENDURANCE_PIRATE_ACCURACY = 0.15; // ~2,9 de vida/s: reparar bajo fuego (1,5 %/s = 12/s) gana terreno de sobra

// Reparar y atacar cruzados (AC-128, e2e/input-toggle.spec.ts): el abanico de "targets" y el jugador entra con el casco
// al 10 %. Sin nadie que dispare, reparar cura 32 de vida/s (GDD §8): con 80 de vida quedan ~20 s de reparación antes
// de pasar del 90 % que pide el criterio
export const REPAIR_START_HULL = 0.1;

// Capitán pirata (AC-111, e2e/captain.spec.ts). "captain": ya hay 9 piratas hundidos y un cebo (pirata quieto, sin IA y con
// 1 de vida) a tiro desde el borde de la zona segura; al hundirlo aparece el capitán con las reglas del GDD, en el punto
// exterior (440 m) de un sector, fuera del radio de interés de quien esté junto al puerto. "captain-down": un capitán ya en
// el mar, quieto, con 1 de vida y que nunca acierta, también a tiro desde el borde de la zona
export const CAPTAIN_BAIT_POINT = { x: 0, z: 150 };
export const CAPTAIN_DOWN_POINT = { x: 0, z: -160 };

export const SCENARIOS = ['showcase', 'shipyard', 'targets', 'endurance', 'repair', 'captain', 'captain-down'] as const;
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
  if (name === 'endurance') {
    world.startingGold = CANNON_LEVELS[1].price + CANNON_LEVELS[2].price;
    for (let i = 0; i < ENDURANCE_MERCHANTS; i++) {
      const a = (2 * Math.PI * i) / ENDURANCE_MERCHANTS;
      const m = spawnMerchant(world);
      m.pos = { x: ENDURANCE_POINT.x + Math.cos(a) * ENDURANCE_MERCHANT_RADIUS, z: ENDURANCE_POINT.z + Math.sin(a) * ENDURANCE_MERCHANT_RADIUS };
      m.heading = a + Math.PI / 2;
      m.destination = null;
      m.path = [];
      m.ai = null;
      m.respawnPos = { ...m.pos };
    }
    const pirate = spawnPirate(world, 0);
    pirate.pos = { x: ENDURANCE_POINT.x, z: ENDURANCE_POINT.z - ENDURANCE_PIRATE_OFFSET };
    pirate.heading = 0;
    pirate.ai!.origin = { ...pirate.pos };
    pirate.holdPosition = true;
    pirate.destination = null;
    pirate.path = [];
    pirate.accuracyOverride = ENDURANCE_PIRATE_ACCURACY;
    return;
  }
  if (name === 'captain') {
    world.killsSinceBoss = CAPTAIN_KILLS_TO_SPAWN - 1;
    const bait = spawnPirate(world, 2);
    bait.pos = { ...CAPTAIN_BAIT_POINT };
    bait.heading = 0;
    bait.ai = null;
    bait.holdPosition = true;
    bait.destination = null;
    bait.path = [];
    bait.hp = 1;
    bait.respawnPos = { ...bait.pos };
    return;
  }
  if (name === 'captain-down') {
    const captain = spawnCaptain(world, CAPTAIN_DOWN_POINT)!;
    captain.heading = 0;
    captain.holdPosition = true;
    captain.accuracyOverride = 0;
    captain.hp = 1;
    return;
  }
  if (name === 'targets' || name === 'repair') {
    if (name === 'repair') world.startingHull = REPAIR_START_HULL;
    for (const p of TARGET_FAN) {
      const m = spawnMerchant(world);
      m.pos = { x: p.x, z: p.z };
      m.heading = 0;
      m.destination = null;
      m.path = [];
      m.ai = null;
    }
    return;
  }
  // Pirata quieto a 45 m del punto de captura: entra en combate cuando el jugador pierde la protección
  const pirate = spawnPirate(world, 3);
  pirate.pos = { x: 45, z: 205 };
  pirate.heading = -Math.PI / 2;
  pirate.ai!.origin = { ...pirate.pos };
  pirate.holdPosition = true;
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
  coastal.holdPosition = true;
  coastal.destination = null;
  coastal.path = [];

  // Restos flotantes cerca del punto de captura (VFX §14)
  world.wrecks.push({ id: `wreck-${world.nextId++}`, pos: { x: 12, z: 182 }, gold: 30, expiresAt: world.time + WRECK_LIFETIME * 100 });

  const blind = spawnPirate(world, 2);
  blind.pos = { ...BLIND_GUNNER_POINT };
  blind.heading = 0;
  blind.ai!.origin = { ...blind.pos };
  blind.holdPosition = true;
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
    p.holdPosition = true;
    p.destination = null;
    p.path = [];
  }
}

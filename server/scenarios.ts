// Escenarios deterministas para capturas de QA y UX (ART-DIRECTION §18). Solo se aplican con el modo
// invitado permitido (nunca en Railway); en producción el mundo es siempre el del GDD.
import { CANNON_LEVELS, CAPTAIN_CLASS, CAPTAIN_KILLS_TO_SPAWN, GUNBOAT_CLASS, LEVEL_XP, SHIP_CLASSES, WRECK_LIFETIME } from '../src/game/constants';
import { Ship, World } from '../src/game/types';
import { spawnCaptain, spawnGunboat, spawnMerchant, spawnPirate } from '../src/game/world';

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

// Legibilidad (AC-72, D57): un pirata quieto, un mercante sin IA y los puestos de los dos jugadores alrededor del punto de
// captura. Los jugadores quedan a más de 70 m del pirata (fuera de su radio de agresión), así que nadie se mueve, y los
// 4 barcos salen enteros en 1440×900 y en 390×844, a ≥ 16 px unos de otros y fuera de los paneles y botones del HUD.
// e2e/capture.spec.ts lo arranca en su propio servidor, sin más NPC
export const LEGIBILITY = {
  self: SHOWCASE_POINT,
  other: { x: -30, z: 230 },
  pirate: { x: 45, z: 262 },
  merchant: { x: -40, z: 160 }
} as const;

// Legibilidad del I2 (AC-115, ART-DIRECTION §18.2): los 4 NPC de la prueba de los evaluadores-agente (pirata, cañonera,
// Capitán y mercante), quietos alrededor del punto de captura con los 4 rumbos de AD-28 repartidos, y los puestos de los
// dos jugadores. Es solo para la captura (e2e/capture.spec.ts), así que van sin IA: la cañonera detecta a 80 m y el
// Capitán a 90 m, y tenerlos a esa distancia de los dos jugadores, también en su camino desde el puerto, los sacaría del
// encuadre de 390×844 a 1,0× (~138 m de ancho). Sin IA no entran en combate ni se mueven, y lo que se mide (modelo, placa
// y marcador del minimapa) sale de su clase. El pirata va igual, para que los puestos no dependan de su radio de agresión.
// Exige el I2 encendido: sin él no hay cañonera ni Capitán (AC-187)
export const LEGIBILITY_I2 = {
  self: SHOWCASE_POINT,
  other: { x: -30, z: 230 },
  ships: [
    { classId: 'pirate', x: 45, z: 262, headingDeg: 45 }, // a z 255, en 390×844 la placa del Capitán le tapaba 8 px
    { classId: GUNBOAT_CLASS, x: 40, z: 158, headingDeg: 135 },
    { classId: CAPTAIN_CLASS, x: 48, z: 212, headingDeg: 225 },
    { classId: 'merchant', x: -40, z: 160, headingDeg: 315 }
  ]
} as const;

// Marca de peligro (AC-189, D77): una cañonera y un pirata quietos y sin IA, a tiro del cañón N1 desde el borde de la zona
// segura y en torno al cebo del Capitán, fuera de la exclusión del puerto. Cada jugador entra con el oro justo de los
// Cañones N2: con la Balandra N1, la cañonera sale marcada y el pirata no; al comprarlos en el puerto, la marca se apaga.
// Sin IA, para que el e2e no dependa de cuándo entran en combate. Exige el I2 encendido: sin él no hay cañonera (AC-187)
export const DANGER = {
  gunboat: { x: -30, z: 145 },
  pirate: { x: 30, z: 145 }
} as const;

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

// Experiencia (1.1; AC-151 y AC-153, e2e/xp-hud.spec.ts). Cada jugador entra con la XP del escenario, salvo que traiga la
// suya de la fila, que gana, como con el oro. "xp": a 10 XP del nivel 9 (Contramaestre: el aviso más largo, «¡Nivel 9!
// Ahora eres Contramaestre», ART-DIRECTION §12.9) y un cebo (pirata quieto, sin IA y con 1 de vida, que da 30 XP) a tiro
// desde el borde de la zona segura. "xp-13": nivel 13 (Teniente). "xp-12": nivel 12 (Contramaestre) con el oro del
// Bergantín, para el caso más largo del panel del objetivo, «Bergantín · Nivel 12 · Contramaestre»
export const XP_BAIT_POINT = { x: 0, z: 150 };
const XP_SCENARIOS = {
  xp: { xp: LEVEL_XP[8] - 10 },
  'xp-13': { xp: LEVEL_XP[12] },
  'xp-12': { xp: LEVEL_XP[11], gold: SHIP_CLASSES.brig.price }
} as const;

// Vuelta de la vista libre (AC-119, E13): un pirata quieto con puntería entera a 40 m de la zona segura (y fuera de la
// exclusión del puerto) y el jugador entra con el casco al 30 %. Al atacarlo (atacar quita la protección) llegan 3
// andanadas de 88 cada ~4,6 s: la 1.ª enseguida, la 2.ª daña sin hundir y la 3.ª hunde. El e2e entra en vista libre antes
// de la 2.ª (daño) y de la 3.ª (muerte), y luego antes de reaparecer
export const VIEW_RETURN = { pirate: { x: 0, z: 150 }, hull: 0.3 } as const;

// Indicador de atacante (AC-124, E13): un pirata anclado al sur (no se mueve ni en combate: en combate, holdPosition no
// basta y orbitaría a 45 m, dentro del marco útil), fuera de la exclusión del puerto, y un puesto 52 m al norte de él,
// fuera de la zona segura y a tiro de los dos. Al atacarlo, sus andanadas llegan desde abajo; con el zoom más cerca (0,7×)
// queda fuera del marco útil de 1440×900 (y = 827 > 792). Con puntería baja el jugador aguanta más de 30 s.
// `volley-miss` (AC-119, una andanada contra ti devuelve la cámara aunque falle): el mismo pirata, con puntería 0
export const EDGE_ATTACK = { pirate: { x: 0, z: 215 }, standoff: 52, accuracy: 0.25 } as const;

export const SCENARIOS = ['showcase', 'shipyard', 'targets', 'endurance', 'repair', 'legibility', 'captain', 'captain-down', 'legibility-i2', 'danger', 'xp', 'xp-13', 'xp-12', 'view-return', 'edge-attack', 'volley-miss'] as const;
export type ScenarioName = (typeof SCENARIOS)[number];
// Escenarios con NPC del I2: con el I2 apagado no existen (AC-187), así que exigen SEA_BATTLE_I2=1
export const I2_SCENARIOS: readonly ScenarioName[] = ['captain', 'captain-down', 'legibility-i2', 'danger'];

export function parseScenario(value: string | undefined): ScenarioName | null {
  return (SCENARIOS as readonly string[]).includes(value ?? '') ? (value as ScenarioName) : null;
}

export function applyScenario(world: World, name: ScenarioName): void {
  if (name === 'xp' || name === 'xp-13' || name === 'xp-12') {
    const s: { xp: number; gold?: number } = XP_SCENARIOS[name];
    world.startingXp = s.xp;
    if (s.gold !== undefined) world.startingGold = s.gold;
    if (name !== 'xp') return;
    const bait = spawnPirate(world, 2);
    bait.pos = { ...XP_BAIT_POINT };
    bait.heading = 0;
    bait.ai = null;
    bait.holdPosition = true;
    bait.destination = null;
    bait.path = [];
    bait.hp = 1;
    bait.respawnPos = { ...bait.pos };
    return;
  }
  if (name === 'view-return') {
    world.startingHull = VIEW_RETURN.hull;
    const pirate = spawnPirate(world, 3);
    pirate.pos = { ...VIEW_RETURN.pirate };
    pirate.heading = Math.PI; // la proa hacia el puerto
    pirate.ai!.origin = { ...pirate.pos };
    pirate.holdPosition = true; // DT-04
    pirate.destination = null;
    pirate.path = [];
    pirate.accuracyOverride = 1;
    return;
  }
  if (name === 'edge-attack' || name === 'volley-miss') {
    const pirate = spawnPirate(world, 3);
    pirate.pos = { ...EDGE_ATTACK.pirate };
    pirate.heading = Math.PI / 2; // de costado al puesto del jugador
    pirate.ai!.origin = { ...pirate.pos };
    pirate.holdPosition = true; // DT-04
    pirate.anchored = true;
    pirate.destination = null;
    pirate.path = [];
    pirate.accuracyOverride = name === 'volley-miss' ? 0 : EDGE_ATTACK.accuracy;
    return;
  }
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
  if (name === 'legibility') {
    const pirate = spawnPirate(world, 3);
    pirate.pos = { ...LEGIBILITY.pirate };
    pirate.heading = -Math.PI / 2;
    pirate.ai!.origin = { ...pirate.pos };
    pirate.holdPosition = true;
    pirate.destination = null;
    pirate.path = [];
    const merchant = spawnMerchant(world);
    merchant.pos = { ...LEGIBILITY.merchant };
    merchant.heading = Math.PI / 2;
    merchant.destination = null;
    merchant.path = [];
    merchant.ai = null;
    return;
  }
  if (name === 'legibility-i2') {
    for (const p of LEGIBILITY_I2.ships) {
      const at = { x: p.x, z: p.z };
      const ship: Ship =
        p.classId === CAPTAIN_CLASS ? spawnCaptain(world, at)! : p.classId === GUNBOAT_CLASS ? spawnGunboat(world, 0)! : p.classId === 'merchant' ? spawnMerchant(world) : spawnPirate(world, 0);
      ship.pos = at;
      ship.heading = (p.headingDeg * Math.PI) / 180;
      ship.ai = null;
      if (ship.kind === 'pirate') ship.holdPosition = true; // DT-04: los hostiles de los escenarios no patrullan
      ship.destination = null;
      ship.path = [];
    }
    return;
  }
  if (name === 'danger') {
    world.startingGold = CANNON_LEVELS[1].price;
    for (const [ship, at] of [[spawnGunboat(world, 2)!, DANGER.gunboat], [spawnPirate(world, 3), DANGER.pirate]] as const) {
      ship.pos = { ...at };
      ship.heading = Math.PI; // la proa hacia el puerto
      ship.ai = null;
      ship.holdPosition = true; // DT-04
      ship.destination = null;
      ship.path = [];
    }
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

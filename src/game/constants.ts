// Números de juego. Fuente única de verdad: docs/game/GDD.md (las secciones se citan como §N).
// Cambiar el balance = cambiar este archivo; la lógica no lleva números mágicos.

const deg = Math.PI / 180;

// ---- Red y simulación (§13) ----
export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;
export const INTERPOLATION_DELAY_MS = 100;
export const INTEREST_RADIUS = 300;
export const MAX_PLAYERS = 20;
export const INTENT_RATE_PER_SECOND = 10;
export const INTENT_BURST = 20;
export const DISCONNECT_GRACE = 10; // s que el barco sigue en el mundo tras desconectarse (P1)

// ---- Mundo (§4) ----
export const MAP_HALF_SIZE = 500;
export const NAV_LIMIT = 490;
export const PORT_POSITION = { x: 0, z: 0 };
export const PORT_RADIUS = 30;
export const SAFE_ZONE_RADIUS = 110;
export const RESPAWN_RING = { min: 60, max: 90 };
export const MERCHANT_RING = { min: 150, max: 330 };
export const PIRATE_RING = { min: 300, max: 460 };
export const PIRATE_PORT_EXCLUSION = 130; // un pirata nunca entra en este radio (§9)

export interface IslandDef {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export const ISLANDS: IslandDef[] = [
  { id: 'PORT', x: 0, z: 0, radius: 30 },
  { id: 'I1', x: 260, z: 200, radius: 45 },
  { id: 'I2', x: -300, z: 170, radius: 35 },
  { id: 'I3', x: -220, z: -280, radius: 55 },
  { id: 'I4', x: 250, z: -260, radius: 40 },
  { id: 'I5', x: 20, z: 360, radius: 30 },
  { id: 'I6', x: -410, z: -30, radius: 28 }
];

// Sectores piratas en pantalla: NE = (x+, z−), NO = (x−, z−), SO = (x−, z+), SE = (x+, z+)
export const PIRATE_SECTORS = [
  { id: 'NE', sx: 1, sz: -1 },
  { id: 'NO', sx: -1, sz: -1 },
  { id: 'SO', sx: -1, sz: 1 },
  { id: 'SE', sx: 1, sz: 1 }
] as const;

// ---- Navegación (§6) ----
export const ARRIVE_DISTANCE = 2;
// Margen de navegación (§6): media eslora + 2 m desde el borde de la isla, para que el casco visible
// nunca entre en una isla. El radio de colisión sigue siendo el límite físico de último recurso.
export const NAV_CLEARANCE_EXTRA = 2;
export const NAV_NODE_SLACK = 1; // holgura de los nodos del grafo de rutas sobre el margen
// Giro casi en el sitio junto a una isla: con un error de rumbo > 45° el barco avanzaría mientras gira y el
// arco metería el casco en la costa. A ≤ 1 m/s el radio de giro es ~1 m y cabe en los 2 m extra del margen.
export const PIVOT_MIN_ANGLE = Math.PI / 4;
export const PIVOT_SPEED = 1;
export const PIVOT_ZONE = 8; // m por encima del margen de navegación
export const TURN_FACTORS = [
  { maxAngle: 45 * deg, factor: 1 },
  { maxAngle: 90 * deg, factor: 0.6 },
  { maxAngle: Infinity, factor: 0.4 }
];

// ---- Barcos (§6, §9) ----
export type ShipKind = 'player' | 'pirate' | 'merchant';

export interface ShipClassStats {
  id: string;
  label: string;
  kind: ShipKind;
  length: number;
  radius: number;
  maxHp: number;
  patrolSpeed: number; // NPC
  maxSpeed: number;
  accel: number;
  brake: number;
  turnRate: number; // rad/s
  cannonsPerSide: number;
  price: number; // oro (0 = inicial o no comprable)
  // Artillería propia (NPC); los jugadores usan CANNON_LEVELS
  cannon: CannonStats | null;
  reward: number;
  wreck: number;
  respawnTime: number;
}

export interface CannonStats {
  damage: number; // por bala
  accuracy: number;
  range: number;
  reload: number;
}

export const SHIP_CLASSES: Record<string, ShipClassStats> = {
  sloop: {
    id: 'sloop', label: 'Balandra', kind: 'player', length: 16, radius: 5, maxHp: 800,
    patrolSpeed: 14, maxSpeed: 14, accel: 4, brake: 6, turnRate: 90 * deg, cannonsPerSide: 4, price: 0,
    cannon: null, reward: 0, wreck: 0, respawnTime: 0
  },
  brig: {
    id: 'brig', label: 'Bergantín', kind: 'player', length: 24, radius: 7, maxHp: 1400,
    patrolSpeed: 12, maxSpeed: 12, accel: 3, brake: 5, turnRate: 70 * deg, cannonsPerSide: 6, price: 2000,
    cannon: null, reward: 0, wreck: 0, respawnTime: 0
  },
  frigate: {
    id: 'frigate', label: 'Fragata', kind: 'player', length: 34, radius: 9, maxHp: 2200,
    patrolSpeed: 10, maxSpeed: 10, accel: 2.5, brake: 4, turnRate: 55 * deg, cannonsPerSide: 8, price: 6000,
    cannon: null, reward: 0, wreck: 0, respawnTime: 0
  },
  pirate: {
    id: 'pirate', label: 'Pirata', kind: 'pirate', length: 20, radius: 6, maxHp: 450,
    patrolSpeed: 6, maxSpeed: 11, accel: 3, brake: 5, turnRate: 70 * deg, cannonsPerSide: 4, price: 0,
    cannon: { damage: 22, accuracy: 0.6, range: 55, reload: 4.5 }, reward: 105, wreck: 25, respawnTime: 30
  },
  merchant: {
    id: 'merchant', label: 'Mercante', kind: 'merchant', length: 22, radius: 7, maxHp: 300,
    patrolSpeed: 7, maxSpeed: 9, accel: 2.5, brake: 4, turnRate: 50 * deg, cannonsPerSide: 0, price: 0,
    cannon: null, reward: 60, wreck: 15, respawnTime: 20
  }
};

export function navClearance(classId: string): number {
  return SHIP_CLASSES[classId].length / 2 + NAV_CLEARANCE_EXTRA;
}

export const PLAYER_SHIP_ORDER = ['sloop', 'brig', 'frigate'] as const;
export type PlayerShipClass = (typeof PLAYER_SHIP_ORDER)[number];
export const STARTING_SHIP: PlayerShipClass = 'sloop';

export const NPC_POPULATION = { pirate: 12, merchant: 8 } as const;
export const PIRATES_PER_SECTOR = 3;

// ---- Combate (§7) ----
export const CANNONBALL_SPEED = 120; // m/s
export const ATTACK_MAX_DISTANCE = 200; // el ataque termina más allá
export const CANNON_LEVELS: (CannonStats & { label: string; price: number })[] = [
  { label: 'Cañón de 8 libras', damage: 30, accuracy: 0.7, range: 60, reload: 4.0, price: 0 },
  { label: 'Cañón de 12 libras', damage: 38, accuracy: 0.75, range: 70, reload: 3.5, price: 500 },
  { label: 'Cañón de 18 libras', damage: 48, accuracy: 0.8, range: 80, reload: 3.0, price: 1500 }
];
export const MAX_CANNON_RANGE = CANNON_LEVELS[CANNON_LEVELS.length - 1].range;
export const TAB_TARGET_RADIUS = 150;
export const PVP_ENABLED = true; // GDD Q1 (por defecto: PvP fuera de la zona segura)

// ---- Reparación (§8) ----
export const REPAIR_RATE = 0.04; // fracción de vida máx. por segundo
export const REPAIR_RATE_UNDER_FIRE = 0.015;
export const REPAIR_TICK = 0.5; // s entre incrementos
export const REPAIR_UNDER_FIRE_WINDOW = 3; // s desde el último daño
export const REPAIR_MAX_SPEED = 1; // m/s para empezar a reparar
export const LOW_HP_WARNING = 0.3;

// ---- NPC (§9) ----
export const PIRATE_AGGRO_RADIUS = 70;
export const PIRATE_DISENGAGE_TARGET = 110;
export const PIRATE_LEASH = 200;
export const PIRATE_ORBIT_RADIUS = 45;
export const PIRATE_ORBIT_SPEED = 8;
export const PIRATE_PATROL_RADIUS = 120;
export const PIRATE_PATROL_WAIT = { min: 2, max: 5 };
export const PIRATE_RETURN_ARRIVE = 10;
export const THREAT_WINDOW = 10; // s para elegir al que más daño hizo
export const MERCHANT_FLEE_TIME = 12;
export const MERCHANT_ROUTE_POINTS = { min: 4, max: 6 };
export const NPC_RESPAWN_MIN_PLAYER_DISTANCE = 100;

// ---- Botín y economía (§10) ----
export const STARTING_GOLD = 100;
export const LOOT_DAMAGE_WINDOW = 60;
export const DEATH_GOLD_PENALTY = 0.1;
export const GOLD_CAP = 999_999;
export const WRECK_PICKUP_RADIUS = 8;
export const WRECK_LIFETIME = 30;

// ---- Mejoras y barcos (§11) ----
export type UpgradeId = 'cannons' | 'hull' | 'sails';
export const UPGRADE_LEVELS: Record<UpgradeId, { label: string; multipliers: number[]; prices: number[] }> = {
  cannons: { label: 'Cañones', multipliers: [1, 1, 1], prices: [0, 500, 1500] },
  hull: { label: 'Casco', multipliers: [1, 1.2, 1.4], prices: [0, 400, 1200] },
  sails: { label: 'Velas', multipliers: [1, 1.1, 1.2], prices: [0, 300, 900] }
};
export const MAX_UPGRADE_LEVEL = 3;

// ---- Muerte y reaparición (§12) ----
export const SINKING_TIME = 3;
export const DEATH_COUNTDOWN = 8;
// El servidor procesa "Zarpar" con el world.time del último tick, que va hasta 1 tick por detrás del reloj real con el
// que el cliente habilita el botón (QA H-10). Se acepta si la cuenta atrás acaba antes del próximo tick, con 1 tick
// más de margen por el retraso del setInterval: ≤ 0,1 s antes de los 8 s, imperceptible para el jugador.
export const RESPAWN_CLOCK_TOLERANCE = 2 / TICK_RATE;
export const SPAWN_PROTECTION = 15;

// ---- Validación de entradas ----
export const MAX_NAME_LENGTH = 16;

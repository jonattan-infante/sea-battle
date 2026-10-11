// Tipos e interfaces para el juego Sea Battle

// Posición en el mapa
export interface Position {
  x: number;
  y: number;
}

// Mapa finito con límites
export interface GameMap {
  id: string;
  width: number;
  height: number;
  occupiedPositions: Position[]; // Posiciones ocupadas por barcos/NPCs
  lastUpdated: Date; // Para sincronización multijugador
}

// Tipos de equipamiento para barcos
export enum EquipmentType {
  Cannon = 'cannon',
  Sail = 'sail'
}

export interface Equipment {
  type: EquipmentType;
  level: number; // Nivel del equipamiento (1-5)
  damage?: number; // Para cañones, calculado basado en level
  speedBoost?: number; // Para velas, calculado basado en level
  maxAmmo?: number; // Para cañones, munición máxima
}

// Costos de mejora por nivel
export const UPGRADE_COSTS: Record<EquipmentType, number[]> = {
  [EquipmentType.Cannon]: [50, 100, 200, 400, 800], // Costos para niveles 1-5
  [EquipmentType.Sail]: [30, 60, 120, 240, 480]
};

// Beneficios por nivel
export const EQUIPMENT_BENEFITS: Record<EquipmentType, { damage?: number; speed?: number; ammo?: number }[]> = {
  [EquipmentType.Cannon]: [
    { damage: 10, ammo: 10 },
    { damage: 15, ammo: 15 },
    { damage: 20, ammo: 20 },
    { damage: 25, ammo: 25 },
    { damage: 30, ammo: 30 }
  ],
  [EquipmentType.Sail]: [
    { speed: 5 },
    { speed: 10 },
    { speed: 15 },
    { speed: 20 },
    { speed: 25 }
  ]
};

// Barco con propiedades de combate
export interface Ship {
  id: string;
  name: string; // Nombre distintivo del barco
  playerId?: string; // Opcional para barcos de NPCs
  position: Position;
  rotation?: number;
  health: number;
  maxHealth: number;
  speed: number;
  shipClass: ShipClass; // Tipo de barco
  equipment: Equipment[];
  lastUpdated: Date; // Para sincronización
}

// Jugador con datos de autenticación y barco asignado
export interface Player {
  id: string; // ID de Clerk o similar
  name: string;
  shipId: string;
  gold: number;
  lastUpdated: Date; // Para sincronización
}

// Tipos de barcos
export enum ShipClass {
  Galleon = 'galleon',
  Frigate = 'frigate',
  Brigantine = 'brigantine'
}

// Tipos de NPCs
export enum NPCType {
  Pirate = 'pirate',
  Merchant = 'merchant'
}

// NPC con recompensa al destruir
export interface NPC {
  id: string;
  name: string; // Nombre distintivo del NPC
  type: NPCType;
  position: Position;
  health: number;
  rewardGold: number;
  lastUpdated: Date; // Para sincronización
}

// Estado del juego para multijugador
export interface GameState {
  map: GameMap;
  players: Player[];
  ships: Ship[];
  npcs: NPC[];
  lastUpdated: Date;
}
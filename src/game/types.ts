import { IslandDef, PlayerShipClass, ShipKind, UpgradeId } from './constants';
import { Vec2 } from './vec';

export type Upgrades = Record<UpgradeId, number>; // nivel 1..3

export type ShipState = 'alive' | 'sinking' | 'dead';

export type NpcAiState = 'patrol' | 'combat' | 'return' | 'route' | 'flee';

export interface NpcAi {
  state: NpcAiState;
  origin: Vec2; // origen del pirata o primer waypoint del mercante
  sector: number; // índice de sector pirata (−1 en mercantes)
  wait: number; // s de espera en patrulla
  targetId: string | null;
  route: Vec2[];
  routeIndex: number;
  fleeUntil: number;
  threatId: string | null; // barco del que huye
}

export interface DamageEntry {
  playerId: string;
  shipId: string;
  amount: number;
  at: number;
  firstAt: number;
}

export interface Ship {
  id: string;
  kind: ShipKind;
  classId: string;
  name: string;
  ownerId: string | null;
  pos: Vec2;
  heading: number;
  speed: number;
  hp: number;
  maxHp: number;
  state: ShipState;
  stateTimer: number; // s restantes hundiéndose o hasta reaparecer (NPC)
  destination: Vec2 | null;
  path: Vec2[];
  attackTargetId: string | null;
  reload: number;
  repairing: boolean;
  repairClock: number;
  lastDamagedAt: number;
  damage: DamageEntry[];
  protectedUntil: number;
  ai: NpcAi | null;
  disconnectedAt: number | null;
  accuracyOverride?: number; // solo escenarios de prueba (server/scenarios.ts): precisión fija de sus andanadas
}

export interface DeathInfo {
  by: string | null; // nombre de quien hundió al jugador
  goldLost: number;
  at: number; // tiempo de simulación
}

export interface Player {
  id: string;
  name: string;
  shipId: string;
  gold: number;
  upgrades: Upgrades;
  ownedShips: PlayerShipClass[];
  activeShip: PlayerShipClass;
  kills: number;
  deaths: number;
  death: DeathInfo | null;
}

export interface Projectile {
  id: number;
  ownerShipId: string;
  targetShipId: string;
  hits: number;
  misses: number;
  damagePerBall: number;
  elapsed: number;
  duration: number;
}

export interface Wreck {
  id: string;
  pos: Vec2;
  gold: number;
  expiresAt: number;
}

export type Island = IslandDef;

export type GameEvent =
  | { type: 'volley'; shipId: string; targetId: string; from: Vec2; to: Vec2; duration: number; hits: number; cannons: number }
  | { type: 'impact'; shipId: string; byShipId: string; damage: number; hits: number; misses: number; pos: Vec2 }
  | { type: 'sunk'; shipId: string; byShipId: string | null; pos: Vec2 }
  | { type: 'loot'; playerId: string; gold: number; pos: Vec2; source: 'kill' | 'wreck' | 'pvp' }
  | { type: 'respawn'; shipId: string }
  | { type: 'wreck'; wreckId: string; pos: Vec2; gold: number; expiresAt: number }
  | { type: 'wreckGone'; wreckId: string };

export interface World {
  time: number;
  tick: number;
  ships: Map<string, Ship>;
  players: Map<string, Player>;
  projectiles: Projectile[];
  wrecks: Wreck[];
  islands: Island[];
  events: GameEvent[];
  rng: () => number;
  nextId: number;
  killsSinceBoss: number;
  startingGold?: number; // solo escenarios de prueba (server/scenarios.ts); por defecto STARTING_GOLD
}

// ---- Red (servidor → cliente) ----

export interface ShipSnapshot {
  id: string;
  k: ShipKind;
  c: string; // classId
  n: string; // nombre
  o: string | null; // ownerId
  x: number;
  z: number;
  h: number;
  s: number;
  hp: number;
  mhp: number;
  st: ShipState;
  t: string | null; // objetivo de ataque
  r: boolean; // reparando
  pu: number; // fin de la protección en tiempo de servidor (0 = sin protección); no cambia con el reloj
}

// Al entrar en el área de interés se envía el barco completo; después, solo los campos que cambiaron
export type ShipDelta = Partial<ShipSnapshot> & { id: string };

export interface WreckView {
  id: string;
  x: number;
  z: number;
  gold: number;
  expiresAt: number; // tiempo de servidor en que desaparece (parpadeo final, VFX §14)
}

export interface Notice {
  kind: 'info' | 'error';
  text: string;
}

// Un único mensaje por envío (≤ 10/s, AC-88). Si no hay nada que contar, no se envía (AC-87).
export interface ServerFrame {
  t: number; // tiempo del servidor (s)
  full?: true; // snapshot completo (al entrar)
  s?: ShipDelta[];
  r?: string[]; // barcos que salieron del área de interés o del mundo
  e?: GameEvent[];
  w?: WreckView[]; // restos activos (solo en el snapshot completo)
  me?: PlayerView; // vista privada, solo cuando cambia
  n?: Notice[];
}

export interface PlayerView {
  id: string;
  name: string;
  shipId: string;
  gold: number;
  upgrades: Upgrades;
  ownedShips: PlayerShipClass[];
  activeShip: PlayerShipClass;
  kills: number;
  deaths: number;
  death: { by: string | null; goldLost: number; respawnAt: number } | null; // respawnAt en tiempo de servidor
}

export interface Welcome {
  playerId: string;
  shipId: string;
  time: number; // tiempo del servidor al dar la bienvenida (sincroniza el reloj)
  mapHalfSize: number;
  islands: Island[];
  tickRate: number;
  snapshotRate: number;
  interestRadius: number;
}

import { IslandDef, Mooring, PirateSectorId, PlayerShipClass, ShipKind, UpgradeId } from './constants';
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
  respawnPos?: Vec2; // solo escenarios de prueba (server/scenarios.ts): NPC que reaparece aquí, quieto y sin IA
  holdPosition?: boolean; // solo escenarios de prueba (server/scenarios.ts): pirata que no patrulla; tras un combate vuelve a su puesto y espera allí
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
  xp: number; // experiencia total (§10b); el nivel se calcula de ella y no se guarda aparte
}

// Pareja atacante → víctima con hundimientos con XP en su ventana: desde cuándo y cuántos lleva (1 o 2)
export interface XpPair {
  since: number;
  kills: number;
}

// Un hundimiento entre jugadores, sin nombres ni ids: el nivel de la víctima y el de cada atacante con la XP que cobró
export interface PvpSinkRecord {
  victimLevel: number;
  attackers: { level: number; xp: number }[];
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
  | { type: 'xp'; playerId: string; xp: number; pos: Vec2; source: 'kill' | 'pvp' } // solo al dueño, en el tick del oro
  | { type: 'respawn'; shipId: string }
  | { type: 'wreck'; wreckId: string; pos: Vec2; gold: number; expiresAt: number }
  | { type: 'wreckGone'; wreckId: string }
  // Capitán pirata (§9): se envían a todos los jugadores, estén donde estén (AC-111)
  | { type: 'captain'; shipId: string; sector: PirateSectorId; pos: Vec2 } // cuadrante y punto de la guarida (aviso de D49)
  | { type: 'captainDown'; shipId: string; names: string[]; more: number; pos: Vec2 }; // hasta 3 nombres por daño y "y N más"

export interface World {
  time: number;
  tick: number;
  ships: Map<string, Ship>;
  players: Map<string, Player>;
  projectiles: Projectile[];
  wrecks: Wreck[];
  islands: Island[]; // los círculos de las islas del mapa (cada isla, la unión de 1 a 5; AC-199)
  moorings: readonly Mooring[]; // los amarres del puerto en los que aparecen los jugadores (AC-176): los da el mapa; sin ellos, el anillo
  events: GameEvent[];
  rng: () => number;
  nextId: number;
  killsSinceBoss: number;
  i2: boolean; // I2 encendido (AC-187): sin él no aparece el Capitán pirata. Lo decide el servidor (SEA_BATTLE_I2)
  xpPairs: Map<string, Map<string, XpPair>>; // atacante → víctima (ids de jugador): ventana de repetición (§10b)
  pvpLog: PvpSinkRecord[]; // hundimientos entre jugadores para el log del servidor (AC-148); lo vacía el servidor
  startingGold?: number; // solo escenarios de prueba (server/scenarios.ts); por defecto STARTING_GOLD
  startingHull?: number; // solo escenarios de prueba: fracción de la vida máxima con la que entra un jugador; por defecto 1
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
  lv?: number; // nivel del jugador (§10b), solo en barcos de jugador: cambia al subir de nivel
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
  xp: number; // el nivel y la insignia se calculan con levelOf y rankOf (src/game/xp.ts)
  unsaved?: boolean; // AC-132: la BD no guarda (solo jugadores con cuenta); al volver a false, la escritura está confirmada
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

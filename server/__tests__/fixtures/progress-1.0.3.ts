// El lector y el escritor de la 1.0.3 (`git show v1.0.3:server/progress.ts`, d6c60a5, la versión que hay en prod),
// congelados para AC-157: si la 1.1 fallara, se vuelve a la 1.0.3, que tiene que leer lo que escribe la 1.1 y conservar
// al escribir su XP y sus barcos nuevos. Desde `export interface SavedProgress` el código es el de la 1.0.3 sin cambios;
// las constantes, que allí venían de src/game/constants.ts y src/game/types.ts, van escritas aquí con sus valores de la
// 1.0.3 para que este lector no cambie cuando la 1.1 toque esas listas
const GOLD_CAP = 999_999;
const MAX_UPGRADE_LEVEL = 3;
const PLAYER_SHIP_ORDER = ['sloop', 'brig', 'frigate'] as const;
type PlayerShipClass = (typeof PLAYER_SHIP_ORDER)[number];
const STARTING_SHIP: PlayerShipClass = 'sloop';
type UpgradeId = 'cannons' | 'hull' | 'sails';
type Upgrades = Record<UpgradeId, number>;
const UPGRADE_LEVELS: Record<UpgradeId, unknown> = { cannons: null, hull: null, sails: null };

export interface SavedProgress {
  gold: number;
  upgrades: Upgrades;
  ownedShips: PlayerShipClass[];
  activeShip: PlayerShipClass;
}

// Ids de clase de la fila (GDD §13, «Ids de clase de la fila»), en el orden de esa tabla: los 3 de la 1.0 y los 2 que
// añade la 1.1, que la 1.0.3 conserva sin jugarlos
const ROW_SHIPS = ['sloop', 'brig', 'schooner', 'frigate', 'line'] as const;
type RowShip = (typeof ROW_SHIPS)[number];
const MAX_XP = 9_999_999;

// Lo que trae la fila y la 1.0.3 no juega: su versión y, en una v: 2, la XP y los barcos de la 1.1 (AC-157 c)
export type RowCarry = { v: 1 } | { v: 2; xp: number; newShips: RowShip[] };
export const NEW_ROW: RowCarry = { v: 1 }; // un usuario nuevo se escribe en v: 1, como en la 1.0.2

export interface ParsedProgress {
  progress: SavedProgress; // con lo que se juega
  carry: RowCarry;
}

export type ProgressRow =
  | ({ v: 1 } & SavedProgress)
  | ({ v: 2; xp: number } & Omit<SavedProgress, 'ownedShips'> & { ownedShips: RowShip[] });

const V1_KEYS = ['v', 'gold', 'upgrades', 'ownedShips', 'activeShip'];
const V2_KEYS = [...V1_KEYS, 'xp'];
const UPGRADE_IDS = Object.keys(UPGRADE_LEVELS) as UpgradeId[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

const isLevel = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_UPGRADE_LEVEL;
const isPlayerShip = (s: unknown): s is PlayerShipClass => typeof s === 'string' && (PLAYER_SHIP_ORDER as readonly string[]).includes(s);
const isRowShip = (s: unknown): s is RowShip => typeof s === 'string' && (ROW_SHIPS as readonly string[]).includes(s);

// Copia del progreso de un jugador (Player o PlayerView)
export function progressOf(p: SavedProgress): SavedProgress {
  return { gold: p.gold, upgrades: { ...p.upgrades }, ownedShips: [...p.ownedShips], activeShip: p.activeShip };
}

// Lo que se escribe en la columna state (jsonb): la misma v que se leyó y, en una v: 2, la XP y los barcos nuevos tal
// como estaban, junto a lo que se jugó. El barco activo es siempre el de la partida (AC-157 c)
export function serializeProgress(p: SavedProgress, carry: RowCarry): ProgressRow {
  const progress = progressOf(p);
  if (carry.v === 1) return { v: 1, ...progress };
  const owned: readonly RowShip[] = [...progress.ownedShips, ...carry.newShips];
  return { v: 2, ...progress, ownedShips: ROW_SHIPS.filter((c) => owned.includes(c)), xp: carry.xp };
}

// Huella para saber si cambió algo desde la última escritura (cero escrituras en reposo)
export function progressKey(p: SavedProgress): string {
  return JSON.stringify([p.gold, UPGRADE_IDS.map((id) => p.upgrades[id]), p.ownedShips, p.activeShip]);
}

// Acepta exactamente las filas v: 1 de la 1.0 y las v: 2 de la 1.1, y rechaza las demás como la 1.1 (AC-156, AC-157 a)
export function parseProgress(raw: unknown): ParsedProgress | null {
  if (!isPlainObject(raw) || (raw.v !== 1 && raw.v !== 2)) return null;
  const v2 = raw.v === 2;
  if (!hasExactKeys(raw, v2 ? V2_KEYS : V1_KEYS)) return null;
  const isShip = v2 ? isRowShip : isPlayerShip;
  const { gold, upgrades, ownedShips, activeShip, xp } = raw;
  if (!Number.isInteger(gold) || (gold as number) < 0 || (gold as number) > GOLD_CAP) return null;
  if (!isPlainObject(upgrades) || !hasExactKeys(upgrades, UPGRADE_IDS) || !UPGRADE_IDS.every((id) => isLevel(upgrades[id]))) return null;
  if (!Array.isArray(ownedShips) || ownedShips.length === 0 || !ownedShips.every(isShip)) return null;
  if (new Set(ownedShips).size !== ownedShips.length) return null;
  if (!isShip(activeShip) || !ownedShips.includes(activeShip)) return null;
  if (v2 && (!Number.isInteger(xp) || (xp as number) < 0 || (xp as number) > MAX_XP)) return null;
  // Se juega con los barcos de la 1.0, en el orden del astillero. Si el activo es nuevo, con el mejor de ellos; la
  // Balandra, si no posee ninguno (AC-157 b)
  const owned: PlayerShipClass[] = PLAYER_SHIP_ORDER.filter((c) => ownedShips.includes(c));
  if (owned.length === 0) owned.push(STARTING_SHIP);
  return {
    progress: {
      gold: gold as number,
      upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, upgrades[id]])) as Upgrades,
      ownedShips: owned,
      activeShip: isPlayerShip(activeShip) ? activeShip : owned[owned.length - 1]
    },
    carry: v2 ? { v: 2, xp: xp as number, newShips: ROW_SHIPS.filter((c) => !isPlayerShip(c) && ownedShips.includes(c)) } : { v: 1 }
  };
}

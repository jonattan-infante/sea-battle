// El lector de la 1.0.2 (`git show v1.0.2:server/progress.ts`, la versión que hay en prod), congelado para AC-157 (c):
// si hubiera que volver de la 1.0.3 a la 1.0.2 antes de la 1.1, la 1.0.2 tiene que poder leer las filas v: 1 que escribió
// la 1.0.3. El cuerpo de parseProgress es el de la 1.0.2 sin cambios; las constantes, que en la 1.0.2 venían de
// src/game/constants.ts y src/game/types.ts, van escritas aquí con sus valores de la 1.0.2 para que este lector no cambie
// cuando la 1.1 añada barcos a esas listas
const GOLD_CAP = 999_999;
const MAX_UPGRADE_LEVEL = 3;
const PLAYER_SHIP_ORDER = ['sloop', 'brig', 'frigate'] as const;
type PlayerShipClass = (typeof PLAYER_SHIP_ORDER)[number];
type UpgradeId = 'cannons' | 'hull' | 'sails';
type Upgrades = Record<UpgradeId, number>;
const UPGRADE_LEVELS: Record<UpgradeId, unknown> = { cannons: null, hull: null, sails: null };

export interface SavedProgress {
  gold: number;
  upgrades: Upgrades;
  ownedShips: PlayerShipClass[];
  activeShip: PlayerShipClass;
}

const VERSION = 1;
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

export function parseProgress(raw: unknown): SavedProgress | null {
  if (!isPlainObject(raw) || !hasExactKeys(raw, ['v', 'gold', 'upgrades', 'ownedShips', 'activeShip'])) return null;
  if (raw.v !== VERSION) return null;
  const { gold, upgrades, ownedShips, activeShip } = raw;
  if (!Number.isInteger(gold) || (gold as number) < 0 || (gold as number) > GOLD_CAP) return null;
  if (!isPlainObject(upgrades) || !hasExactKeys(upgrades, UPGRADE_IDS) || !UPGRADE_IDS.every((id) => isLevel(upgrades[id]))) return null;
  if (!Array.isArray(ownedShips) || ownedShips.length === 0 || !ownedShips.every(isPlayerShip)) return null;
  if (new Set(ownedShips).size !== ownedShips.length) return null;
  if (!isPlayerShip(activeShip) || !ownedShips.includes(activeShip)) return null;
  return {
    gold: gold as number,
    upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, upgrades[id]])) as Upgrades,
    ownedShips: [...ownedShips].sort((a, b) => PLAYER_SHIP_ORDER.indexOf(a) - PLAYER_SHIP_ORDER.indexOf(b)),
    activeShip
  };
}

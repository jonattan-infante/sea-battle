// Progreso que se guarda por usuario (AC-97): oro, mejoras, barcos en propiedad y barco activo. La vida y la posición no
// se guardan (AC-129). El parser es estricto, como protocol.ts: un registro que no pasa no se usa ni se sobrescribe
// (AC-131): oro entero entre 0 y el tope, niveles entre 1 y 3, y el barco activo entre los que posee
import { GOLD_CAP, MAX_UPGRADE_LEVEL, PLAYER_SHIP_ORDER, PlayerShipClass, UPGRADE_LEVELS, UpgradeId } from '../src/game/constants';
import { Upgrades } from '../src/game/types';

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

// Copia del progreso de un jugador (Player o PlayerView)
export function progressOf(p: SavedProgress): SavedProgress {
  return { gold: p.gold, upgrades: { ...p.upgrades }, ownedShips: [...p.ownedShips], activeShip: p.activeShip };
}

// Lo que se escribe en la columna state (jsonb)
export function serializeProgress(p: SavedProgress): { v: number } & SavedProgress {
  return { v: VERSION, ...progressOf(p) };
}

// Huella para saber si cambió algo desde la última escritura (cero escrituras en reposo)
export function progressKey(p: SavedProgress): string {
  return JSON.stringify([p.gold, UPGRADE_IDS.map((id) => p.upgrades[id]), p.ownedShips, p.activeShip]);
}

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

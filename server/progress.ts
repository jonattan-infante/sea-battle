// Progreso que se guarda por usuario (AC-97 y, desde la 1.1, AC-155): oro, mejoras, barcos en propiedad, barco activo y
// XP. La vida y la posición no se guardan (AC-129), y el nivel se calcula de la XP (AC-150). El parser es estricto, como
// protocol.ts: un registro que no pasa no se usa ni se sobrescribe (AC-131): oro entero entre 0 y el tope, niveles entre
// 1 y 3, y el barco activo entre los que posee.
// Formato de la fila (GDD §13): la 1.1 lee las filas v: 1 de la 1.0 con 0 de XP y las v: 2, y siempre escribe v: 2
// (AC-156); la 1.0.3 lee lo que escribe (AC-157). Los barcos de la fila que la simulación no juega (la Goleta y el Navío
// con su interruptor apagado, AC-201 b) van aparte, se escriben tal cual y no entran en el mundo; si el activo es uno de
// ellos, se juega con el mejor de los que sí juega, como en la 1.0.3
import {
  GOLD_CAP,
  LATENT_SHIPS,
  MAX_UPGRADE_LEVEL,
  PLAYER_SHIP_ORDER,
  PlayerShipClass,
  STARTING_SHIP,
  UPGRADE_LEVELS,
  UpgradeId,
  XP_CAP
} from '../src/game/constants';
import { Upgrades } from '../src/game/types';

export interface SavedProgress {
  gold: number;
  upgrades: Upgrades;
  ownedShips: PlayerShipClass[];
  activeShip: PlayerShipClass;
  xp: number;
}

// Ids de clase de la fila (GDD §13, «Ids de clase de la fila»), en el orden de esa tabla. Son los de la fila, no los de la
// simulación: una v: 1 solo admite los 3 de la 1.0 aunque PLAYER_SHIP_ORDER crezca (AC-156)
const ROW_SHIPS = ['sloop', 'brig', 'schooner', 'frigate', 'line'] as const;
type RowShip = (typeof ROW_SHIPS)[number];
const V1_SHIPS: readonly RowShip[] = ['sloop', 'brig', 'frigate'];

// Los barcos de la fila que la simulación no juega: se vuelven a escribir tal cual
export interface RowCarry {
  newShips: RowShip[];
}
export const NEW_ROW: RowCarry = { newShips: [] }; // un usuario nuevo

export interface ParsedProgress {
  progress: SavedProgress; // con lo que se juega
  carry: RowCarry;
}

export type ProgressRow = { v: 2 } & Omit<SavedProgress, 'ownedShips'> & { ownedShips: RowShip[] };

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

// Los barcos que la simulación juega, en el orden del astillero: la Goleta y el Navío, solo con su interruptor (AC-201)
function playedShips(newShips: boolean): readonly PlayerShipClass[] {
  return newShips ? PLAYER_SHIP_ORDER : PLAYER_SHIP_ORDER.filter((c) => !LATENT_SHIPS.includes(c));
}

// Copia del progreso de un jugador (Player o PlayerView)
export function progressOf(p: SavedProgress): SavedProgress {
  return { gold: p.gold, upgrades: { ...p.upgrades }, ownedShips: [...p.ownedShips], activeShip: p.activeShip, xp: p.xp };
}

// Lo que se escribe en la columna state (jsonb): siempre v: 2, con los barcos que se juegan y los que no, en el orden de
// la tabla de ids, y como activo el de la partida
export function serializeProgress(p: SavedProgress, carry: RowCarry): ProgressRow {
  const progress = progressOf(p);
  const owned: readonly string[] = [...progress.ownedShips, ...carry.newShips];
  return { v: 2, ...progress, ownedShips: ROW_SHIPS.filter((c) => owned.includes(c)) };
}

// Huella para saber si cambió algo desde la última escritura (cero escrituras en reposo). Lleva la XP: la de un
// coatacante que gana XP sin oro también se escribe
export function progressKey(p: SavedProgress): string {
  return JSON.stringify([p.gold, UPGRADE_IDS.map((id) => p.upgrades[id]), p.ownedShips, p.activeShip, p.xp]);
}

// Acepta exactamente las filas v: 1 de la 1.0 y las v: 2 de la 1.1, y rechaza las demás (AC-131, AC-156). newShips es el
// interruptor de AC-201 (SEA_BATTLE_NEW_SHIPS): apagado, como por defecto, la Goleta y el Navío de la fila no se juegan
export function parseProgress(raw: unknown, newShips = false): ParsedProgress | null {
  if (!isPlainObject(raw) || (raw.v !== 1 && raw.v !== 2)) return null;
  const v2 = raw.v === 2;
  if (!hasExactKeys(raw, v2 ? V2_KEYS : V1_KEYS)) return null;
  const rowShips: readonly string[] = v2 ? ROW_SHIPS : V1_SHIPS;
  const isShip = (s: unknown): s is RowShip => typeof s === 'string' && rowShips.includes(s);
  const { gold, upgrades, ownedShips, activeShip, xp } = raw;
  if (!Number.isInteger(gold) || (gold as number) < 0 || (gold as number) > GOLD_CAP) return null;
  if (!isPlainObject(upgrades) || !hasExactKeys(upgrades, UPGRADE_IDS) || !UPGRADE_IDS.every((id) => isLevel(upgrades[id]))) return null;
  if (!Array.isArray(ownedShips) || ownedShips.length === 0 || !ownedShips.every(isShip)) return null;
  if (new Set(ownedShips).size !== ownedShips.length) return null;
  if (!isShip(activeShip) || !ownedShips.includes(activeShip)) return null;
  if (v2 && (!Number.isInteger(xp) || (xp as number) < 0 || (xp as number) > XP_CAP)) return null;
  // Se juega con los barcos que la simulación juega, en el orden del astillero. Si el activo no es uno de ellos, con el
  // mejor; la Balandra, si no posee ninguno (AC-157 b)
  const played = playedShips(newShips);
  const isPlayed = (s: unknown): s is PlayerShipClass => typeof s === 'string' && (played as readonly string[]).includes(s);
  const owned: PlayerShipClass[] = played.filter((c) => ownedShips.includes(c));
  if (owned.length === 0) owned.push(STARTING_SHIP);
  return {
    progress: {
      gold: gold as number,
      upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, upgrades[id]])) as Upgrades,
      ownedShips: owned,
      activeShip: isPlayed(activeShip) ? activeShip : owned[owned.length - 1],
      xp: v2 ? (xp as number) : 0
    },
    carry: { newShips: ROW_SHIPS.filter((c) => !isPlayed(c) && ownedShips.includes(c)) }
  };
}

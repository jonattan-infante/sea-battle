// El lector y el escritor de la 1.3 (`git show 58b53d1:server/progress.ts`, rama feat/ship-families), congelados para el
// puente de la 1.2.x (GDD §13, «Lectura y escritura de la fila en la 1.3 y en la 1.2.x puente»; BACKLOG AC-220): las filas
// v: 3 de estos tests salen del escritor de verdad de la 1.3, no de una copia a mano, y lo que escribe el puente lo vuelve a
// leer el lector de la 1.3. Desde `export interface SavedProgress` el código es el de 58b53d1 sin cambios; las constantes y
// los tipos, que allí venían de src/game/constants.ts y src/game/types.ts, van escritos aquí con sus valores de 58b53d1,
// porque la 1.2.x no los tiene (su PLAYER_SHIP_ORDER solo juega 3 clases y no conoce las familias). El formato no cambia una
// vez empezado el puente (AC-220); si la 1.3 cambiara su escritor, este archivo se rehace con el commit nuevo
const GOLD_CAP = 999_999;
const MAX_UPGRADE_LEVEL = 3;
const XP_CAP = 9_999_999;
const PLAYER_SHIP_ORDER = ['sloop', 'brig', 'schooner', 'frigate', 'line'] as const;
type PlayerShipClass = (typeof PLAYER_SHIP_ORDER)[number];
type UpgradeId = 'cannons' | 'hull' | 'sails';
type Upgrades = Record<UpgradeId, number>;
type ShipLevels = Partial<Record<PlayerShipClass, Upgrades>>;
const UPGRADE_LEVELS: Record<UpgradeId, unknown> = { cannons: null, hull: null, sails: null };
const SHIP_FAMILIES = ['gb', 'es'] as const;
type ShipFamily = (typeof SHIP_FAMILIES)[number];
const NO_FAMILY = 'none';
type FamilyChoice = ShipFamily | typeof NO_FAMILY;

export interface SavedProgress {
  gold: number;
  xp: number;
  ships: ShipLevels; // al menos un barco; siempre con activeShip
  activeShip: PlayerShipClass;
  families: ShipFamily[]; // en el orden de SHIP_FAMILIES, sin repetidos
  family: FamilyChoice; // «none» o una de families
}

// Ids de clase de la fila (GDD §13, «Ids de clase de la fila»), en el orden de esa tabla. Son los de la fila, no los de la
// simulación: una v: 1 solo admite los 3 de la 1.0 (AC-156)
const ROW_SHIPS: readonly PlayerShipClass[] = PLAYER_SHIP_ORDER;
const V1_SHIPS: readonly PlayerShipClass[] = ['sloop', 'brig', 'frigate'];

export interface ProgressRow {
  v: 3;
  gold: number;
  xp: number;
  ships: Record<string, Upgrades>;
  activeShip: PlayerShipClass;
  families: ShipFamily[];
  family: FamilyChoice;
}

const V1_KEYS = ['v', 'gold', 'upgrades', 'ownedShips', 'activeShip'];
const V2_KEYS = [...V1_KEYS, 'xp'];
const V3_KEYS = ['v', 'gold', 'xp', 'ships', 'activeShip', 'families', 'family'];
const UPGRADE_IDS = Object.keys(UPGRADE_LEVELS) as UpgradeId[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

const isLevel = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_UPGRADE_LEVEL;
const isGold = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= GOLD_CAP;
const isXp = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= XP_CAP;
const isFamily = (f: unknown): f is ShipFamily => typeof f === 'string' && (SHIP_FAMILIES as readonly string[]).includes(f);
const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

// Exactamente { cannons, hull, sails }, enteros de 1 a 3
function parseLevels(raw: unknown): Upgrades | null {
  if (!isPlainObject(raw) || !hasExactKeys(raw, UPGRADE_IDS) || !UPGRADE_IDS.every((id) => isLevel(raw[id]))) return null;
  return Object.fromEntries(UPGRADE_IDS.map((id) => [id, raw[id]])) as Upgrades;
}

// Los barcos en el orden de la tabla de ids, cada uno con una copia de sus niveles
function orderedShips(ships: ShipLevels): ShipLevels {
  const out: ShipLevels = {};
  for (const classId of ROW_SHIPS) {
    const levels = ships[classId];
    if (levels) out[classId] = { cannons: levels.cannons, hull: levels.hull, sails: levels.sails };
  }
  return out;
}

// Copia del progreso de un jugador (Player o PlayerView), sin referencias compartidas
export function progressOf(p: SavedProgress): SavedProgress {
  return { gold: p.gold, xp: p.xp, ships: orderedShips(p.ships), activeShip: p.activeShip, families: [...p.families], family: p.family };
}

// Lo que se escribe en la columna state (jsonb): siempre v: 3 (AC-218), con `families` en el orden de §6. Las claves de
// `ships` van en el orden de la tabla de ids, aunque Postgres guarde las de un objeto en el suyo (GDD §13)
export function serializeProgress(p: SavedProgress): ProgressRow {
  const ships: Record<string, Upgrades> = {};
  for (const [classId, levels] of Object.entries(orderedShips(p.ships))) ships[classId] = levels;
  return { v: 3, gold: p.gold, xp: p.xp, ships, activeShip: p.activeShip, families: SHIP_FAMILIES.filter((f) => p.families.includes(f)), family: p.family };
}

// Huella para saber si cambió algo desde la última escritura (cero escrituras en reposo). No depende del orden de las
// claves; lleva la XP (la de un coatacante que gana XP sin oro también se escribe), los niveles de cada barco y las familias
export function progressKey(p: SavedProgress): string {
  const ships = ROW_SHIPS.map((c) => {
    const levels = p.ships[c];
    return levels ? UPGRADE_IDS.map((id) => levels[id]) : null;
  });
  return JSON.stringify([p.gold, p.xp, ships, p.activeShip, SHIP_FAMILIES.map((f) => p.families.includes(f)), p.family]);
}

// Acepta exactamente las filas v: 1 de la 1.0, las v: 2 de la 1.1 y las v: 3 de la 1.3, y rechaza las demás como registro
// corrupto (AC-131, AC-156 y GDD §13, «Se rechazan»). Una v: 1 o v: 2 pasa a v: 3 con la primera escritura de su jugador
export function parseProgress(raw: unknown): SavedProgress | null {
  if (!isPlainObject(raw)) return null;
  if (raw.v === 3) return parseV3(raw);
  if (raw.v !== 1 && raw.v !== 2) return null;
  const v2 = raw.v === 2;
  if (!hasExactKeys(raw, v2 ? V2_KEYS : V1_KEYS)) return null;
  const rowShips: readonly string[] = v2 ? ROW_SHIPS : V1_SHIPS;
  const isShip = (s: unknown): s is PlayerShipClass => typeof s === 'string' && rowShips.includes(s);
  const { gold, upgrades, ownedShips, activeShip, xp } = raw;
  if (!isGold(gold)) return null;
  const levels = parseLevels(upgrades);
  if (!levels) return null;
  if (!Array.isArray(ownedShips) || ownedShips.length === 0 || !ownedShips.every(isShip)) return null;
  if (new Set(ownedShips).size !== ownedShips.length) return null;
  if (!isShip(activeShip) || !ownedShips.includes(activeShip)) return null;
  if (v2 && !isXp(xp)) return null;
  // Cada barco de la fila recibe los 3 niveles de `upgrades` (Q35), sin familia (Q39). El activo se conserva: con las 5
  // clases jugables, también la Goleta y el Navío (AC-226 a)
  const ships: ShipLevels = {};
  for (const classId of ownedShips) ships[classId] = { ...levels };
  return { gold: gold as number, xp: v2 ? (xp as number) : 0, ships: orderedShips(ships), activeShip, families: [], family: NO_FAMILY };
}

function parseV3(raw: Record<string, unknown>): SavedProgress | null {
  if (!hasExactKeys(raw, V3_KEYS)) return null;
  const { gold, xp, ships: rawShips, activeShip, families, family } = raw;
  if (!isGold(gold) || !isXp(xp)) return null;
  if (!isPlainObject(rawShips)) return null;
  const keys = Object.keys(rawShips);
  if (keys.length === 0) return null;
  const ships: ShipLevels = {};
  for (const key of keys) {
    if (!(ROW_SHIPS as readonly string[]).includes(key)) return null;
    const levels = parseLevels(rawShips[key]);
    if (!levels) return null;
    ships[key as PlayerShipClass] = levels;
  }
  if (typeof activeShip !== 'string' || !hasOwn(ships, activeShip)) return null;
  if (!Array.isArray(families) || !families.every(isFamily) || new Set(families).size !== families.length) return null;
  if (family !== NO_FAMILY && !(isFamily(family) && families.includes(family))) return null;
  return {
    gold: gold as number,
    xp: xp as number,
    ships: orderedShips(ships),
    activeShip: activeShip as PlayerShipClass,
    families: SHIP_FAMILIES.filter((f) => families.includes(f)),
    family: family as FamilyChoice
  };
}

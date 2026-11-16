// El lector y el escritor de la 1.2.1 (`git show 6b9d8f8:server/progress.ts`, el tag v1.2.1, la versión que hay en prod
// desde el 2026-11-16), congelados para la 1.3: es el puente de AC-220, la versión a la que se vuelve si la 1.3 falla
// (GDD §13 y Q36; AC-229 y AC-230), así que tiene que leer lo que escribe la 1.3, jugarlo y devolverlo sin perder familias,
// compras ni niveles por barco. Desde `export interface SavedProgress` el código es el de 6b9d8f8 sin cambios; las
// constantes, que allí venían de src/game/constants.ts y src/game/types.ts, van escritas aquí con sus valores de la 1.2.1
// para que este lector no cambie cuando la 1.3 toque esas listas (la 1.2.1 solo juega 3 clases).
// La persistencia de la 1.2.1 (server/persistence.ts en 6b9d8f8) guarda el `carry` de la fila leída, lo pasa a cada
// escritura y, tras cada escritura confirmada, lo sustituye por carryAfterWrite(progress, carry); los tests que hacen de
// 1.2.1 lo hacen igual
const GOLD_CAP = 999_999;
const MAX_UPGRADE_LEVEL = 3;
const XP_CAP = 9_999_999;
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
  xp: number;
}

// Ids de clase de la fila (GDD §13, «Ids de clase de la fila»), en el orden de esa tabla. Son los de la fila, no los de la
// simulación: una v: 1 solo admite los 3 de la 1.0 aunque PLAYER_SHIP_ORDER crezca (AC-156)
const ROW_SHIPS = ['sloop', 'brig', 'schooner', 'frigate', 'line'] as const;
type RowShip = (typeof ROW_SHIPS)[number];
const V1_SHIPS: readonly RowShip[] = ['sloop', 'brig', 'frigate'];

// Ids de familia de la fila (GDD §6 y §13, «Formato de la fila (1.3)»), en el orden de §6, y «sin familia» (Q39). La 1.2.x no
// juega familias: solo las conserva. Un id que no está aquí es un registro corrupto, como en la 1.3
const ROW_FAMILIES = ['gb', 'es'] as const;
type RowFamily = (typeof ROW_FAMILIES)[number];
const NO_FAMILY = 'none';
type RowFamilyChoice = RowFamily | typeof NO_FAMILY;
type RowShipLevels = Partial<Record<RowShip, Upgrades>>;

// Lo que trae la fila y la simulación no juega, que se vuelve a escribir tal cual:
// - una v: 1 o una v: 2 (sin `v`): los barcos de la fila que la simulación no juega; se escribe en v: 2, como en la 1.2.0;
// - una v: 3: los niveles de cada barco tal como están en la fila, las familias que tiene y la que usa (AC-220 c). Tras cada
//   escritura pasa a ser lo escrito (carryAfterWrite), para que la siguiente parta de la fila y no de la leída al entrar
export type RowCarry = LegacyCarry | V3Carry;
export interface LegacyCarry {
  newShips: RowShip[];
}
export interface V3Carry {
  v: 3;
  ships: RowShipLevels;
  families: RowFamily[];
  family: RowFamilyChoice;
}
export const NEW_ROW: RowCarry = { newShips: [] }; // un usuario nuevo

export interface ParsedProgress {
  progress: SavedProgress; // con lo que se juega
  carry: RowCarry;
}

export type ProgressRowV2 = { v: 2 } & Omit<SavedProgress, 'ownedShips'> & { ownedShips: RowShip[] };
// Las claves en el orden en que las escribe la 1.3 (58b53d1); Postgres guarda las de un objeto en el suyo (GDD §13)
export interface ProgressRowV3 {
  v: 3;
  gold: number;
  xp: number;
  ships: RowShipLevels;
  activeShip: PlayerShipClass;
  families: RowFamily[];
  family: RowFamilyChoice;
}
export type ProgressRow = ProgressRowV2 | ProgressRowV3;

const V1_KEYS = ['v', 'gold', 'upgrades', 'ownedShips', 'activeShip'];
const V2_KEYS = [...V1_KEYS, 'xp'];
const V3_KEYS = ['v', 'gold', 'xp', 'ships', 'activeShip', 'families', 'family'];
const UPGRADE_IDS = Object.keys(UPGRADE_LEVELS) as UpgradeId[];
const BASE_LEVELS = Object.fromEntries(UPGRADE_IDS.map((id) => [id, 1])) as Upgrades; // un barco nuevo, en la 1.3

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
const isPlayerShip = (s: unknown): s is PlayerShipClass => typeof s === 'string' && (PLAYER_SHIP_ORDER as readonly string[]).includes(s);
const isRowShip = (s: unknown): s is RowShip => typeof s === 'string' && (ROW_SHIPS as readonly string[]).includes(s);
const isFamily = (f: unknown): f is RowFamily => typeof f === 'string' && (ROW_FAMILIES as readonly string[]).includes(f);
const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
const isV3 = (carry: RowCarry): carry is V3Carry => 'v' in carry;

// Exactamente { cannons, hull, sails }, enteros de 1 a 3 (una copia)
function parseLevels(raw: unknown): Upgrades | null {
  if (!isPlainObject(raw) || !hasExactKeys(raw, UPGRADE_IDS) || !UPGRADE_IDS.every((id) => isLevel(raw[id]))) return null;
  return Object.fromEntries(UPGRADE_IDS.map((id) => [id, raw[id]])) as Upgrades;
}

// Los barcos en el orden de la tabla de ids, cada uno con una copia de sus niveles
function orderedShips(ships: RowShipLevels): RowShipLevels {
  const out: RowShipLevels = {};
  for (const classId of ROW_SHIPS) {
    const levels = ships[classId];
    if (levels) out[classId] = { ...levels };
  }
  return out;
}

// Copia del progreso de un jugador (Player o PlayerView)
export function progressOf(p: SavedProgress): SavedProgress {
  return { gold: p.gold, upgrades: { ...p.upgrades }, ownedShips: [...p.ownedShips], activeShip: p.activeShip, xp: p.xp };
}

// Lo que se escribe en la columna state (jsonb), con la misma versión que se leyó (AC-220 c y d): una v: 3 sigue en v: 3, y
// una v: 1, una v: 2 o un usuario nuevo se escriben en v: 2, como en la 1.2.0. En v: 2, con los barcos que se juegan y los
// que no, en el orden de la tabla de ids, y como activo el de la partida
export function serializeProgress(p: SavedProgress, carry: RowCarry): ProgressRow {
  const progress = progressOf(p);
  if (isV3(carry)) return serializeV3(progress, carry);
  const owned: readonly string[] = [...progress.ownedShips, ...carry.newShips];
  return { v: 2, ...progress, ownedShips: ROW_SHIPS.filter((c) => owned.includes(c)) };
}

// En v: 3 (AC-220 c), cada barco de la fila tal como estaba, salvo el barco con el que juega, que toma en cada eje el mayor
// entre lo guardado y las mejoras globales: así no se pierde nada de lo pagado en la 1.2.x, donde las mejoras son globales
// y cada compra se escribe con el barco para el que se compró como activo. Un barco que la fila no tiene (comprado en la
// 1.2.x) entra igual, desde el nivel 1. Las familias y la que usa, tal cual, con `families` en el orden de §6; y como activo,
// el barco con el que juega
function serializeV3(p: SavedProgress, carry: V3Carry): ProgressRowV3 {
  const ships: RowShipLevels = {};
  for (const classId of ROW_SHIPS) {
    const saved = carry.ships[classId] ?? (isPlayerShip(classId) && p.ownedShips.includes(classId) ? BASE_LEVELS : null);
    if (!saved) continue;
    ships[classId] = classId === p.activeShip ? (Object.fromEntries(UPGRADE_IDS.map((id) => [id, Math.max(saved[id], p.upgrades[id])])) as Upgrades) : { ...saved };
  }
  return { v: 3, gold: p.gold, xp: p.xp, ships, activeShip: p.activeShip, families: ROW_FAMILIES.filter((f) => carry.families.includes(f)), family: carry.family };
}

// Lo que queda aparte después de escribir `p` con `carry`: en una v: 3, los niveles de cada barco tal como quedaron escritos
// (persistence.ts lo guarda tras cada escritura confirmada). Sin esto, una segunda escritura partiría de la fila leída al
// entrar y le quitaría a un barco lo que tomó en la primera: con la Fragata a Cañones N3 comprados y después la Balandra
// como activa, la Fragata volvería a N2. En una v: 1 o v: 2 no cambia nada
export function carryAfterWrite(p: SavedProgress, carry: RowCarry): RowCarry {
  if (!isV3(carry)) return carry;
  const row = serializeV3(progressOf(p), carry);
  return { v: 3, ships: row.ships, families: row.families, family: row.family };
}

// Huella para saber si cambió algo desde la última escritura (cero escrituras en reposo). Lleva la XP: la de un
// coatacante que gana XP sin oro también se escribe
export function progressKey(p: SavedProgress): string {
  return JSON.stringify([p.gold, UPGRADE_IDS.map((id) => p.upgrades[id]), p.ownedShips, p.activeShip, p.xp]);
}

// Huella de la fila que escribe `p` con `carry`, sin depender del orden de las claves de un objeto. persistence.ts reconoce
// con ella en la BD un intento suyo que venció en el cliente (O-42 b): no le basta el progreso que se lee de la fila,
// porque en una v: 3 el barco con el que se juega se escribe con el mayor de cada eje (AC-220 c), que puede no ser el de
// la memoria
export function rowKey(p: SavedProgress, carry: RowCarry): string {
  return JSON.stringify(serializeProgress(p, carry), (_key, value: unknown) =>
    isPlainObject(value) ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]])) : value
  );
}

// Acepta exactamente las filas v: 1 de la 1.0, las v: 2 de la 1.1 y las v: 3 de la 1.3, y rechaza las demás (AC-131,
// AC-156 y GDD §13, «Se rechazan», como la 1.3: AC-220 a)
export function parseProgress(raw: unknown): ParsedProgress | null {
  if (!isPlainObject(raw)) return null;
  if (raw.v === 3) return parseV3(raw);
  if (raw.v !== 1 && raw.v !== 2) return null;
  const v2 = raw.v === 2;
  if (!hasExactKeys(raw, v2 ? V2_KEYS : V1_KEYS)) return null;
  const rowShips: readonly string[] = v2 ? ROW_SHIPS : V1_SHIPS;
  const isShip = (s: unknown): s is RowShip => typeof s === 'string' && rowShips.includes(s);
  const { gold, upgrades, ownedShips, activeShip, xp } = raw;
  if (!isGold(gold)) return null;
  if (!isPlainObject(upgrades) || !hasExactKeys(upgrades, UPGRADE_IDS) || !UPGRADE_IDS.every((id) => isLevel(upgrades[id]))) return null;
  if (!Array.isArray(ownedShips) || ownedShips.length === 0 || !ownedShips.every(isShip)) return null;
  if (new Set(ownedShips).size !== ownedShips.length) return null;
  if (!isShip(activeShip) || !ownedShips.includes(activeShip)) return null;
  if (v2 && !isXp(xp)) return null;
  // Se juega con los barcos que la simulación juega, en el orden del astillero. Si el activo no es uno de ellos, con el
  // mejor; la Balandra, si no posee ninguno (AC-157 b)
  const owned: PlayerShipClass[] = PLAYER_SHIP_ORDER.filter((c) => ownedShips.includes(c));
  if (owned.length === 0) owned.push(STARTING_SHIP);
  return {
    progress: {
      gold: gold as number,
      upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, upgrades[id]])) as Upgrades,
      ownedShips: owned,
      activeShip: isPlayerShip(activeShip) ? activeShip : owned[owned.length - 1],
      xp: v2 ? (xp as number) : 0
    },
    carry: { newShips: ROW_SHIPS.filter((c) => !isPlayerShip(c) && ownedShips.includes(c)) }
  };
}

// Una v: 3 de la 1.3 (GDD §13, «Formato de la fila (1.3)»), con las mismas comprobaciones que su lector (58b53d1): las 7
// claves exactas; `ships` con al menos un barco de los 5 ids, cada uno con exactamente sus 3 ejes de 1 a 3; `activeShip`,
// una clave de `ships`; `families`, una lista sin repetidos de `gb` y `es`; y `family`, `none` o una de `families`
function parseV3(raw: Record<string, unknown>): ParsedProgress | null {
  if (!hasExactKeys(raw, V3_KEYS)) return null;
  const { gold, xp, ships: rawShips, activeShip, families, family } = raw;
  if (!isGold(gold) || !isXp(xp)) return null;
  if (!isPlainObject(rawShips)) return null;
  const keys = Object.keys(rawShips);
  if (keys.length === 0) return null;
  const ships: RowShipLevels = {};
  for (const key of keys) {
    if (!isRowShip(key)) return null;
    const levels = parseLevels(rawShips[key]);
    if (!levels) return null;
    ships[key] = levels;
  }
  if (typeof activeShip !== 'string' || !hasOwn(ships, activeShip)) return null;
  if (!Array.isArray(families) || !families.every(isFamily) || new Set(families).size !== families.length) return null;
  if (family !== NO_FAMILY && !(isFamily(family) && families.includes(family))) return null;
  // Se juega con los barcos de la 1.2 que tiene, con el activo si es uno de ellos y, si no, con el mejor; la Balandra, si no
  // tiene ninguno (AC-157 b). Sus mejoras globales son los niveles del barco con el que juega (AC-220 b)
  const owned: PlayerShipClass[] = PLAYER_SHIP_ORDER.filter((c) => hasOwn(ships, c));
  if (owned.length === 0) owned.push(STARTING_SHIP);
  const playing = isPlayerShip(activeShip) ? activeShip : owned[owned.length - 1];
  return {
    progress: { gold: gold as number, upgrades: { ...(ships[playing] ?? BASE_LEVELS) }, ownedShips: owned, activeShip: playing, xp: xp as number },
    carry: { v: 3, ships: orderedShips(ships), families: ROW_FAMILIES.filter((f) => families.includes(f)), family: family as RowFamilyChoice }
  };
}

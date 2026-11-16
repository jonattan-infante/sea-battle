// Protocolo cliente ↔ servidor (GDD §13). El cliente solo envía intenciones; el servidor valida forma y campos.
// Validación estricta: tipos exactos, números finitos y ningún campo extra (AC-05).
import { FamilyChoice, MAP_HALF_SIZE, MAX_NAME_LENGTH, MAX_UPGRADE_LEVEL, NO_FAMILY, PLAYER_SHIP_ORDER, PlayerShipClass, SHIP_FAMILIES, ShipFamily, UPGRADE_LEVELS, UpgradeId } from './constants';
import { Vec2 } from './vec';
import type { ShopItem } from './world';

export const C2S = {
  join: 'join',
  moveTo: 'moveTo',
  stop: 'stop',
  attack: 'attack',
  cancelAttack: 'cancelAttack',
  repair: 'repair',
  buy: 'buy',
  selectShip: 'selectShip',
  selectFamily: 'selectFamily', // 1.3: cambiar de aspecto en el puerto (GDD §13)
  respawn: 'respawn',
  viewAt: 'viewAt' // vista libre (E13): centro de la vista mientras se desplaza, o null al volver al seguimiento
} as const;

export const S2C = {
  welcome: 'welcome',
  frame: 'frame', // ServerFrame: deltas + eventos + vista privada + avisos
  kicked: 'kicked', // se abrió otra pestaña con el mismo usuario
  progressError: 'progressError', // no se pudo cargar el progreso al unirse (AC-131): no se entra al mundo
  full: 'serverFull'
} as const;

const MAX_ID_LENGTH = 64;
const COORD_LIMIT = 10_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((k) => allowed.includes(k));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

// Sin carga útil: undefined, null u objeto vacío
export function parseEmpty(data: unknown): Record<string, never> | null {
  if (data === undefined || data === null) return {};
  return isPlainObject(data) && Object.keys(data).length === 0 ? {} : null;
}

// Nombre visible: letras, números, espacios y signos básicos; recortado a 16
export function sanitizeName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 256) return null;
  const cleaned = value.replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return cleaned.length >= 2 ? cleaned : null;
}

export function parseJoin(data: unknown): { name: string | null } | null {
  if (data === undefined || data === null) return { name: null };
  if (!isPlainObject(data) || !onlyKeys(data, ['name'])) return null;
  if (data.name === undefined || data.name === null) return { name: null };
  if (typeof data.name !== 'string' || data.name.length > 256) return null;
  return { name: sanitizeName(data.name) };
}

export function parseMoveTo(data: unknown): Vec2 | null {
  if (!isPlainObject(data) || !onlyKeys(data, ['x', 'z'])) return null;
  if (!isFiniteNumber(data.x) || !isFiniteNumber(data.z)) return null;
  if (Math.abs(data.x) > COORD_LIMIT || Math.abs(data.z) > COORD_LIMIT) return null;
  return { x: data.x, z: data.z };
}

// Vista libre (GDD §13): {x, z} finitos como moveTo, ajustados a ±MAP_HALF_SIZE (AC-120), o null al volver al seguimiento
export function parseViewAt(data: unknown): { center: Vec2 | null } | null {
  if (data === null) return { center: null };
  const p = parseMoveTo(data);
  if (!p) return null;
  const clamp = (v: number) => Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, v));
  return { center: { x: clamp(p.x), z: clamp(p.z) } };
}

export function parseAttack(data: unknown): { targetId: string } | null {
  if (!isPlainObject(data) || !onlyKeys(data, ['targetId']) || !isId(data.targetId)) return null;
  return { targetId: data.targetId };
}

export function parseRepair(data: unknown): { on: boolean } | null {
  if (!isPlainObject(data) || !onlyKeys(data, ['on']) || typeof data.on !== 'boolean') return null;
  return { on: data.on };
}

const isPlayerShip = (value: unknown): value is PlayerShipClass => typeof value === 'string' && (PLAYER_SHIP_ORDER as readonly string[]).includes(value);
const isFamily = (value: unknown): value is ShipFamily => typeof value === 'string' && (SHIP_FAMILIES as readonly string[]).includes(value);

// itemId: "cannons:2" | "hull:3" | "sails:2" (con `ship`) | "ship:brig" | … | "family:gb" | "family:es". Una mejora nombra
// el barco para el que se compra (1.3; GDD §13): sin `ship`, o con `ship` en un barco o una familia, no es una intención
// válida. Que el barco sea del jugador lo decide el servidor (AC-213 d)
export function parseShopItem(itemId: unknown, ship?: unknown): ShopItem | null {
  if (typeof itemId !== 'string' || itemId.length > 32) return null;
  const match = /^([a-z]+):([a-z0-9]+)$/.exec(itemId);
  if (!match) return null;
  const [, kind, value] = match;
  if (kind === 'ship' || kind === 'family') {
    if (ship !== undefined) return null;
    if (kind === 'family') return isFamily(value) ? { kind: 'family', family: value } : null; // «none» no se vende (AC-222)
    return isPlayerShip(value) && value !== 'sloop' ? { kind: 'ship', classId: value } : null;
  }
  if (!Object.prototype.hasOwnProperty.call(UPGRADE_LEVELS, kind) || !/^\d$/.test(value) || !isPlayerShip(ship)) return null;
  const level = Number(value);
  if (level < 2 || level > MAX_UPGRADE_LEVEL) return null;
  return { kind: 'upgrade', upgrade: kind as UpgradeId, level, ship };
}

export function shopItemId(item: ShopItem): string {
  if (item.kind === 'ship') return `ship:${item.classId}`;
  return item.kind === 'family' ? `family:${item.family}` : `${item.upgrade}:${item.level}`;
}

// La carga útil de `buy` para un artículo: una mejora lleva su barco (GDD §13)
export function buyPayload(item: ShopItem): { itemId: string; ship?: PlayerShipClass } {
  return item.kind === 'upgrade' ? { itemId: shopItemId(item), ship: item.ship } : { itemId: shopItemId(item) };
}

export function parseBuy(data: unknown): { item: ShopItem } | null {
  if (!isPlainObject(data) || !onlyKeys(data, ['itemId', 'ship'])) return null;
  const item = parseShopItem(data.itemId, data.ship);
  return item ? { item } : null;
}

export function parseSelectShip(data: unknown): { classId: PlayerShipClass } | null {
  if (!isPlainObject(data) || !onlyKeys(data, ['classId']) || typeof data.classId !== 'string') return null;
  return isPlayerShip(data.classId) ? { classId: data.classId } : null;
}

// selectFamily (1.3; GDD §13): «none» o una de las 2 familias. Si la tiene lo decide el servidor (AC-223)
export function parseSelectFamily(data: unknown): { family: FamilyChoice } | null {
  if (!isPlainObject(data) || !onlyKeys(data, ['family'])) return null;
  return data.family === NO_FAMILY || isFamily(data.family) ? { family: data.family } : null;
}

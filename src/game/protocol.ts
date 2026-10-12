// Protocolo cliente ↔ servidor (GDD §13). El cliente solo envía intenciones; el servidor valida forma y campos.
// Validación estricta: tipos exactos, números finitos y ningún campo extra (AC-05).
import { MAX_NAME_LENGTH, MAX_UPGRADE_LEVEL, PLAYER_SHIP_ORDER, PlayerShipClass, UPGRADE_LEVELS, UpgradeId } from './constants';
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
  respawn: 'respawn'
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

export function parseAttack(data: unknown): { targetId: string } | null {
  if (!isPlainObject(data) || !onlyKeys(data, ['targetId']) || !isId(data.targetId)) return null;
  return { targetId: data.targetId };
}

export function parseRepair(data: unknown): { on: boolean } | null {
  if (!isPlainObject(data) || !onlyKeys(data, ['on']) || typeof data.on !== 'boolean') return null;
  return { on: data.on };
}

// itemId: "cannons:2" | "hull:3" | "sails:2" | "ship:brig" | "ship:frigate"
export function parseShopItem(itemId: unknown): ShopItem | null {
  if (typeof itemId !== 'string' || itemId.length > 32) return null;
  const match = /^([a-z]+):([a-z0-9]+)$/.exec(itemId);
  if (!match) return null;
  const [, kind, value] = match;
  if (kind === 'ship') {
    return (PLAYER_SHIP_ORDER as readonly string[]).includes(value) && value !== 'sloop' ? { kind: 'ship', classId: value as PlayerShipClass } : null;
  }
  if (!Object.prototype.hasOwnProperty.call(UPGRADE_LEVELS, kind) || !/^\d$/.test(value)) return null;
  const level = Number(value);
  if (level < 2 || level > MAX_UPGRADE_LEVEL) return null;
  return { kind: 'upgrade', upgrade: kind as UpgradeId, level };
}

export function shopItemId(item: ShopItem): string {
  return item.kind === 'ship' ? `ship:${item.classId}` : `${item.upgrade}:${item.level}`;
}

export function parseBuy(data: unknown): { item: ShopItem } | null {
  if (!isPlainObject(data) || !onlyKeys(data, ['itemId'])) return null;
  const item = parseShopItem(data.itemId);
  return item ? { item } : null;
}

export function parseSelectShip(data: unknown): { classId: PlayerShipClass } | null {
  if (!isPlainObject(data) || !onlyKeys(data, ['classId']) || typeof data.classId !== 'string') return null;
  return (PLAYER_SHIP_ORDER as readonly string[]).includes(data.classId) ? { classId: data.classId as PlayerShipClass } : null;
}

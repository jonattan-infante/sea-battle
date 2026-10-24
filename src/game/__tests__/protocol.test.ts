import {
  parseAttack,
  parseBuy,
  parseEmpty,
  parseJoin,
  parseMoveTo,
  parseRepair,
  parseSelectShip,
  parseShopItem,
  parseViewAt,
  sanitizeName,
  shopItemId
} from '../protocol';
import { MAP_HALF_SIZE } from '../constants';

// AC-05: tipo desconocido, NaN, Infinity, texto > 256, campos extra → se descarta
const GARBAGE: unknown[] = [undefined, null, 0, 1, true, 'x', [], [1, 2], () => 1, Symbol('s')];

describe('Protocolo — validación estricta de intenciones (AC-05)', () => {
  test('parseMoveTo acepta {x, z} finitos y rechaza todo lo demás', () => {
    expect(parseMoveTo({ x: 12.5, z: -40 })).toEqual({ x: 12.5, z: -40 });
    expect(parseMoveTo({ x: 9000, z: -9000 })).toEqual({ x: 9000, z: -9000 }); // el mundo lo ajusta a ±490 (AC-18)
    for (const bad of [
      ...GARBAGE,
      {},
      { x: 1 },
      { x: NaN, z: 0 },
      { x: 0, z: Infinity },
      { x: -Infinity, z: 0 },
      { x: '1', z: 2 },
      { x: 1, z: 2, extra: true },
      { x: 1e6, z: 0 }
    ]) {
      expect(parseMoveTo(bad)).toBeNull();
    }
  });

  test('parseViewAt (E13) acepta {x, z} finitos, ajustados a ±MAP_HALF_SIZE, o null para volver al seguimiento', () => {
    expect(parseViewAt({ x: 120.5, z: -300 })).toEqual({ center: { x: 120.5, z: -300 } });
    expect(parseViewAt({ x: 9000, z: -MAP_HALF_SIZE - 1 })).toEqual({ center: { x: MAP_HALF_SIZE, z: -MAP_HALF_SIZE } }); // AC-120
    expect(parseViewAt(null)).toEqual({ center: null });
    for (const bad of [
      ...GARBAGE.filter((g) => g !== null),
      {},
      { x: 1 },
      { x: NaN, z: 0 },
      { x: 0, z: Infinity },
      { x: '1', z: 2 },
      { x: 1, z: 2, extra: true },
      { x: 1e6, z: 0 }
    ]) {
      expect(parseViewAt(bad)).toBeNull();
    }
  });

  test('parseAttack exige un targetId de texto corto y sin campos extra', () => {
    expect(parseAttack({ targetId: 'ship-12' })).toEqual({ targetId: 'ship-12' });
    for (const bad of [...GARBAGE, {}, { targetId: '' }, { targetId: 7 }, { targetId: 'a'.repeat(300) }, { targetId: 'ship-1', x: 1 }]) {
      expect(parseAttack(bad)).toBeNull();
    }
  });

  test('parseRepair exige {on: boolean}', () => {
    expect(parseRepair({ on: true })).toEqual({ on: true });
    expect(parseRepair({ on: false })).toEqual({ on: false });
    for (const bad of [...GARBAGE, {}, { on: 1 }, { on: 'true' }, { on: true, x: 1 }]) expect(parseRepair(bad)).toBeNull();
  });

  test('parseEmpty acepta undefined, null u objeto vacío', () => {
    expect(parseEmpty(undefined)).toEqual({});
    expect(parseEmpty(null)).toEqual({});
    expect(parseEmpty({})).toEqual({});
    for (const bad of [1, 'x', [], { a: 1 }]) expect(parseEmpty(bad)).toBeNull();
  });

  test('parseShopItem solo acepta los artículos del catálogo con formato exacto', () => {
    expect(parseShopItem('cannons:2')).toEqual({ kind: 'upgrade', upgrade: 'cannons', level: 2 });
    expect(parseShopItem('hull:3')).toEqual({ kind: 'upgrade', upgrade: 'hull', level: 3 });
    expect(parseShopItem('sails:2')).toEqual({ kind: 'upgrade', upgrade: 'sails', level: 2 });
    expect(parseShopItem('ship:brig')).toEqual({ kind: 'ship', classId: 'brig' });
    expect(parseShopItem('ship:frigate')).toEqual({ kind: 'ship', classId: 'frigate' });
    for (const bad of [
      ...GARBAGE,
      'cannons:1',
      'cannons:4',
      'cannons:2.0',
      'cannons: 2',
      'cannons:2:extra',
      'Cannons:2',
      'ship:sloop',
      'ship:pirate',
      'ship:constructor',
      '__proto__:2',
      'toString:2',
      'hull',
      ':',
      'a'.repeat(40)
    ]) {
      expect(parseShopItem(bad)).toBeNull();
    }
  });

  test('shopItemId y parseShopItem son inversos', () => {
    for (const id of ['cannons:2', 'cannons:3', 'hull:2', 'hull:3', 'sails:2', 'sails:3', 'ship:brig', 'ship:frigate']) {
      expect(shopItemId(parseShopItem(id)!)).toBe(id);
    }
  });

  test('parseBuy exige {itemId} válido y sin campos extra', () => {
    expect(parseBuy({ itemId: 'hull:2' })).toEqual({ item: { kind: 'upgrade', upgrade: 'hull', level: 2 } });
    for (const bad of [...GARBAGE, {}, { itemId: 'hull:9' }, { itemId: 'hull:2', price: 0 }]) expect(parseBuy(bad)).toBeNull();
  });

  test('parseSelectShip solo acepta clases del jugador', () => {
    expect(parseSelectShip({ classId: 'sloop' })).toEqual({ classId: 'sloop' });
    expect(parseSelectShip({ classId: 'frigate' })).toEqual({ classId: 'frigate' });
    for (const bad of [...GARBAGE, {}, { classId: 'pirate' }, { classId: 'merchant' }, { classId: 1 }, { classId: 'brig', x: 1 }]) {
      expect(parseSelectShip(bad)).toBeNull();
    }
  });

  test('parseJoin y sanitizeName limpian el nombre visible y rechazan textos de más de 256', () => {
    expect(parseJoin(undefined)).toEqual({ name: null });
    expect(parseJoin({})).toEqual({ name: null });
    expect(parseJoin({ name: '  Capitán   <b>Jack</b> ' })).toEqual({ name: 'Capitán bJackb' });
    expect(parseJoin({ name: 'x'.repeat(257) })).toBeNull();
    expect(parseJoin({ name: 'Ok', admin: true })).toBeNull();
    expect(sanitizeName('A')).toBeNull();
    expect(sanitizeName('Un nombre larguísimo de barco')).toHaveLength(16);
    expect(sanitizeName(42)).toBeNull();
  });
});

import {
  buyPayload,
  parseAttack,
  parseBuy,
  parseEmpty,
  parseJoin,
  parseMoveTo,
  parseRepair,
  parseSelectFamily,
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

  // 1.3 (GDD §13): una mejora nombra su barco (`ship`), un barco o una familia van sin él (AC-213 d, AC-222)
  test('parseShopItem solo acepta los artículos del catálogo con formato exacto; una mejora, con un barco del jugador', () => {
    expect(parseShopItem('cannons:2', 'sloop')).toEqual({ kind: 'upgrade', upgrade: 'cannons', level: 2, ship: 'sloop' });
    expect(parseShopItem('hull:3', 'frigate')).toEqual({ kind: 'upgrade', upgrade: 'hull', level: 3, ship: 'frigate' });
    expect(parseShopItem('sails:2', 'line')).toEqual({ kind: 'upgrade', upgrade: 'sails', level: 2, ship: 'line' });
    expect(parseShopItem('ship:brig')).toEqual({ kind: 'ship', classId: 'brig' });
    expect(parseShopItem('ship:schooner')).toEqual({ kind: 'ship', classId: 'schooner' });
    expect(parseShopItem('ship:frigate')).toEqual({ kind: 'ship', classId: 'frigate' });
    expect(parseShopItem('ship:line')).toEqual({ kind: 'ship', classId: 'line' });
    expect(parseShopItem('family:gb')).toEqual({ kind: 'family', family: 'gb' });
    expect(parseShopItem('family:es')).toEqual({ kind: 'family', family: 'es' });
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
      'family:none',
      'family:fr',
      'family:GB',
      'family:__proto__',
      '__proto__:2',
      'toString:2',
      'hull',
      ':',
      'a'.repeat(40)
    ]) {
      expect(parseShopItem(bad, 'sloop')).toBeNull();
      expect(parseShopItem(bad)).toBeNull();
    }
    // Una mejora sin barco, o con uno que no es una clase del jugador
    for (const ship of [undefined, null, '', 'pirate', 'brigantine', 'Sloop', 1, {}, ['sloop'], '__proto__']) expect(parseShopItem('cannons:2', ship)).toBeNull();
    // Un barco o una familia con `ship`
    for (const id of ['ship:brig', 'family:gb']) expect(parseShopItem(id, 'sloop')).toBeNull();
  });

  test('shopItemId, buyPayload y parseBuy son inversos', () => {
    for (const ship of ['sloop', 'brig', 'schooner', 'frigate', 'line'] as const) {
      for (const id of ['cannons:2', 'cannons:3', 'hull:2', 'hull:3', 'sails:2', 'sails:3']) {
        const item = parseShopItem(id, ship)!;
        expect(shopItemId(item)).toBe(id);
        expect(parseBuy(buyPayload(item))).toEqual({ item });
      }
    }
    for (const id of ['ship:brig', 'ship:schooner', 'ship:frigate', 'ship:line', 'family:gb', 'family:es']) {
      const item = parseShopItem(id)!;
      expect(shopItemId(item)).toBe(id);
      expect(buyPayload(item)).toEqual({ itemId: id });
      expect(parseBuy(buyPayload(item))).toEqual({ item });
    }
  });

  test('parseBuy exige {itemId, ship} en una mejora y {itemId} en un barco o una familia, sin campos extra', () => {
    expect(parseBuy({ itemId: 'hull:2', ship: 'brig' })).toEqual({ item: { kind: 'upgrade', upgrade: 'hull', level: 2, ship: 'brig' } });
    expect(parseBuy({ itemId: 'family:es' })).toEqual({ item: { kind: 'family', family: 'es' } });
    for (const bad of [
      ...GARBAGE,
      {},
      { itemId: 'hull:2' }, // AC-213 d: una mejora sin el barco
      { itemId: 'hull:9', ship: 'brig' },
      { itemId: 'hull:2', ship: 'brig', price: 0 },
      { itemId: 'hull:2', ship: 'galleon' },
      { itemId: 'ship:brig', ship: 'brig' },
      { itemId: 'family:none' }, // AC-222: «sin familia» no se vende
      { itemId: 'family:gb', ship: 'sloop' },
      { itemId: 'family:gb', family: 'gb' }
    ]) {
      expect(parseBuy(bad)).toBeNull();
    }
  });

  test('parseSelectFamily (1.3): «none», «gb» o «es», sin campos extra; si la tiene lo decide el servidor (AC-223)', () => {
    expect(parseSelectFamily({ family: 'none' })).toEqual({ family: 'none' });
    expect(parseSelectFamily({ family: 'gb' })).toEqual({ family: 'gb' });
    expect(parseSelectFamily({ family: 'es' })).toEqual({ family: 'es' });
    for (const bad of [...GARBAGE, {}, { family: null }, { family: 'fr' }, { family: 'ES' }, { family: '' }, { family: 1 }, { family: ['gb'] }, { family: 'gb', x: 1 }, { classId: 'gb' }]) {
      expect(parseSelectFamily(bad)).toBeNull();
    }
  });

  test('parseSelectShip solo acepta clases del jugador', () => {
    expect(parseSelectShip({ classId: 'sloop' })).toEqual({ classId: 'sloop' });
    expect(parseSelectShip({ classId: 'frigate' })).toEqual({ classId: 'frigate' });
    expect(parseSelectShip({ classId: 'schooner' })).toEqual({ classId: 'schooner' });
    expect(parseSelectShip({ classId: 'line' })).toEqual({ classId: 'line' });
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

// Registro de progreso (AC-97, la XP de AC-155 y, desde la 1.3, las mejoras de cada barco y las familias): parser estricto,
// como protocol.ts. Un registro que no pasa no se usa ni se sobrescribe (AC-131).
// Formato de la fila (GDD §13, «Formato de la fila (1.3)»): la 1.3 lee v: 1 (con 0 de XP), v: 2 y v: 3, y siempre escribe
// v: 3 (AC-218). Una v: 1 o v: 2 entra con los niveles de su `upgrades` en cada barco y sin familia (AC-219). Los rechazos
// nuevos son los de GDD §13, «Se rechazan». La vuelta atrás va a la 1.2.1, el puente de AC-220 que está en prod: lee lo que
// escribe la 1.3 y rechaza lo mismo que ella (fixtures/progress-1.2.1.ts; la ida y vuelta, en progress-compat-1.2.1.test.ts).
// La 1.2.0, la 1.0.3 y la 1.0.2, con sus lectores congelados, rechazan lo que escribe la 1.3.
// *Cambiado a propósito con la 1.3 (AC-226 a):* con las 5 clases jugables, una fila con la Goleta o el Navío entra con
// ellos y con su barco activo, sin pasar por el mejor de la 1.0 ni dejarlos aparte (antes, «carry»)
import { GOLD_CAP, XP_CAP } from '../../src/game/constants';
import { levelOf } from '../../src/game/xp';
import { parseProgress, progressKey, SavedProgress, serializeProgress } from '../progress';
import { parseProgress as parseProgress102 } from './fixtures/progress-1.0.2';
import { parseProgress as parseProgress103 } from './fixtures/progress-1.0.3';
import { parseProgress as parseProgress120 } from './fixtures/progress-1.2.0';
import { parseProgress as parseProgress121 } from './fixtures/progress-1.2.1';
import { LegacyProgress, migrated, rowV1, rowV2, v1Shapes } from './fixtures/progress-rows';

const N1 = { cannons: 1, hull: 1, sails: 1 };
const valid = { v: 1, gold: 750, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig' };
// Una fila de la 1.1 con todo: XP, los dos barcos nuevos y el Navío como barco activo
const v2 = {
  v: 2,
  gold: 4321,
  upgrades: { cannons: 3, hull: 2, sails: 1 },
  ownedShips: ['sloop', 'brig', 'schooner', 'frigate', 'line'],
  activeShip: 'line',
  xp: 1234
};
// La fila de AC-218: la Balandra a (3, 1, 2), el Bergantín a N1 y activo, 1 234 de oro, 2 500 de XP y las 2 familias, con
// la española en uso
const AC218: SavedProgress = {
  gold: 1234,
  xp: 2500,
  ships: { sloop: { cannons: 3, hull: 1, sails: 2 }, brig: { ...N1 } },
  activeShip: 'brig',
  families: ['gb', 'es'],
  family: 'es'
};
const v3 = { v: 3, gold: 1234, xp: 2500, ships: { sloop: { cannons: 3, hull: 1, sails: 2 }, brig: { ...N1 } }, activeShip: 'brig', families: ['gb', 'es'], family: 'es' };
const roundTrip = (row: unknown) => JSON.parse(JSON.stringify(row));

describe('AC-219: las filas de la 1.2 entran con sus mejoras en cada barco, sin familia', () => {
  test('v: 1: cada barco con los niveles de upgrades, 0 de XP, families [] y family «none»', () => {
    expect(parseProgress(valid)).toEqual({
      gold: 750,
      xp: 0,
      ships: { sloop: { cannons: 2, hull: 1, sails: 1 }, brig: { cannons: 2, hull: 1, sails: 1 } },
      activeShip: 'brig',
      families: [],
      family: 'none'
    });
  });

  test('el ejemplo de GDD §13: upgrades (3, 2, 1) con la Balandra, el Bergantín y la Fragata dan los 3 barcos a (3, 2, 1)', () => {
    const row = { v: 2, gold: 10, upgrades: { cannons: 3, hull: 2, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate', xp: 5 };
    const levels = { cannons: 3, hull: 2, sails: 1 };
    expect(parseProgress(row)).toEqual({ gold: 10, xp: 5, ships: { sloop: levels, brig: levels, frigate: levels }, activeShip: 'frigate', families: [], family: 'none' });
  });

  test.each(v1Shapes(GOLD_CAP).map((p) => [`${p.ownedShips.join('+')}, activo ${p.activeShip}, oro ${p.gold}, mejoras ${Object.values(p.upgrades).join('/')}`, p]))(
    'cada forma que acepta la 1.0.2 entra con su oro, sus barcos y sus niveles en cada uno: %s',
    (_label, p) => {
      const row = rowV1(p as LegacyProgress);
      expect(parseProgress102(row)).not.toBeNull();
      expect(parseProgress(row)).toEqual(migrated(p as LegacyProgress));
    }
  );

  test('v: 2 con la Goleta y el Navío (AC-226 a): entra con los 5 barcos y con el Navío activo, cada uno con los niveles de upgrades', () => {
    const read = parseProgress(v2)!;
    const levels = { cannons: 3, hull: 2, sails: 1 };
    expect(read).toEqual({ gold: 4321, xp: 1234, ships: { sloop: levels, brig: levels, schooner: levels, frigate: levels, line: levels }, activeShip: 'line', families: [], family: 'none' });
    expect(levelOf(read.xp)).toBe(7);
  });

  test.each([
    ['la Goleta, con Balandra y Bergantín', ['sloop', 'brig', 'schooner'], 'schooner'],
    ['el Navío, solo con la Balandra', ['sloop', 'line'], 'line'],
    ['el Navío, sin ningún barco de la 1.0', ['line'], 'line']
  ])('v: 2 con %s como activo: entra con ese barco, sin pasar por el mejor de la 1.0 (AC-226 a)', (_label, ownedShips, activeShip) => {
    const read = parseProgress({ ...v2, ownedShips, activeShip })!;
    expect(read.activeShip).toBe(activeShip);
    expect(Object.keys(read.ships)).toEqual(ownedShips);
  });

  test('los barcos se leen en el orden de la tabla de ids', () => {
    expect(Object.keys(parseProgress({ ...v2, ownedShips: ['line', 'frigate', 'sloop'], activeShip: 'sloop' })!.ships)).toEqual(['sloop', 'frigate', 'line']);
  });

  test.each([
    ['0 de XP', 0],
    ['la XP en el tope', XP_CAP]
  ])('se acepta una v: 2 con %s', (_label, xp) => {
    expect(parseProgress({ ...v2, xp })?.xp).toBe(xp);
  });

  test('al escribir pasan a v: 3 (AC-219), y se vuelven a leer con el mismo progreso', () => {
    for (const row of [valid, v2, rowV2({ gold: 0, upgrades: N1, ownedShips: ['sloop'], activeShip: 'sloop', xp: 0 })]) {
      const read = parseProgress(row)!;
      const written = roundTrip(serializeProgress(read));
      expect(written.v).toBe(3);
      expect(written.families).toEqual([]);
      expect(written.family).toBe('none');
      expect(parseProgress(written)).toEqual(read);
    }
  });
});

describe('AC-218: el formato v: 3', () => {
  test('la fila de AC-218 se escribe tal cual, con families en el orden de §6 (gb, es)', () => {
    expect(roundTrip(serializeProgress(AC218))).toEqual(v3);
    expect(serializeProgress({ ...AC218, families: ['es', 'gb'] }).families).toEqual(['gb', 'es']);
    expect(JSON.stringify(serializeProgress({ ...AC218, families: ['es', 'gb'] }).families)).toBe('["gb","es"]');
  });

  test('un jugador nuevo: la Balandra a nivel 1 y activa, families [] y family «none»', () => {
    const fresh: SavedProgress = { gold: 100, xp: 0, ships: { sloop: { ...N1 } }, activeShip: 'sloop', families: [], family: 'none' };
    expect(serializeProgress(fresh)).toEqual({ v: 3, gold: 100, xp: 0, ships: { sloop: N1 }, activeShip: 'sloop', families: [], family: 'none' });
  });

  test('las claves exactas de la fila, en el orden de GDD §13; los barcos, en el de la tabla de ids', () => {
    const row = serializeProgress({ ...AC218, ships: { line: { ...N1 }, sloop: { ...N1 }, frigate: { ...N1 } }, activeShip: 'line' });
    expect(Object.keys(row)).toEqual(['v', 'gold', 'xp', 'ships', 'activeShip', 'families', 'family']);
    expect(Object.keys(row.ships)).toEqual(['sloop', 'frigate', 'line']);
  });

  test('se lee la v: 3 con lo mismo que se escribió; el orden de families no importa al leer', () => {
    expect(parseProgress(v3)).toEqual(AC218);
    expect(parseProgress({ ...v3, families: ['es', 'gb'] })).toEqual(AC218);
    const first = parseProgress(v3)!;
    const row = roundTrip(serializeProgress(first));
    expect(parseProgress(row)).toEqual(first);
    expect(roundTrip(serializeProgress(parseProgress(row)!))).toEqual(row);
  });

  test.each([
    ['sin familia, sin ninguna comprada', { families: [], family: 'none' }],
    ['sin familia, con las 2 compradas', { families: ['gb', 'es'], family: 'none' }],
    ['la británica, solo con ella', { families: ['gb'], family: 'gb' }],
    ['la española, solo con ella', { families: ['es'], family: 'es' }]
  ])('se acepta %s', (_label, f) => {
    expect(parseProgress({ ...v3, ...f })).toEqual({ ...AC218, ...f });
  });

  test('se aceptan los 5 barcos, cada nivel en cada eje, oro 0 y el tope, y la XP en el tope', () => {
    const ships = { sloop: { cannons: 1, hull: 2, sails: 3 }, brig: { cannons: 2, hull: 3, sails: 1 }, schooner: { cannons: 3, hull: 1, sails: 2 }, frigate: { ...N1 }, line: { cannons: 3, hull: 3, sails: 3 } };
    for (const gold of [0, GOLD_CAP]) expect(parseProgress({ ...v3, gold, xp: XP_CAP, ships, activeShip: 'line' })).toEqual({ ...AC218, gold, xp: XP_CAP, ships, activeShip: 'line' });
  });

  test('la huella no depende del orden de las claves ni del de families, y cambia con cada nivel de cada barco, el barco activo, las familias y la que usa', () => {
    const a = parseProgress(v3)!;
    const b = parseProgress({ family: 'es', families: ['es', 'gb'], activeShip: 'brig', ships: { brig: { sails: 1, hull: 1, cannons: 1 }, sloop: { sails: 2, cannons: 3, hull: 1 } }, xp: 2500, gold: 1234, v: 3 })!;
    expect(progressKey(a)).toBe(progressKey(b));
    const variants: SavedProgress[] = [
      { ...a, gold: 1235 },
      { ...a, xp: 2501 },
      { ...a, ships: { ...a.ships, brig: { cannons: 2, hull: 1, sails: 1 } } },
      { ...a, ships: { ...a.ships, sloop: { cannons: 3, hull: 1, sails: 3 } } },
      { ...a, ships: { ...a.ships, frigate: { ...N1 } } },
      { ...a, activeShip: 'sloop' },
      { ...a, families: ['gb'], family: 'gb' },
      { ...a, family: 'gb' },
      { ...a, family: 'none' }
    ];
    for (const v of variants) expect(progressKey(v)).not.toBe(progressKey(a));
  });
});

describe('vuelta atrás (GDD §13 y Q36): la 1.2.1 lee lo que escribe la 1.3; la 1.2.0, la 1.0.3 y la 1.0.2 lo rechazan, así que se vuelve a la 1.2.1', () => {
  test.each([
    ['la fila de AC-218', v3],
    ['un jugador nuevo', { v: 3, gold: 100, xp: 0, ships: { sloop: N1 }, activeShip: 'sloop', families: [], family: 'none' }],
    ['una fila de la 1.0 tras su primera escritura en la 1.3', roundTrip(serializeProgress(parseProgress(valid)!))],
    ['una fila v: 2 con la Goleta y el Navío tras su primera escritura en la 1.3', roundTrip(serializeProgress(parseProgress(v2)!))]
  ])('%s: la 1.2.1 la lee; la 1.2.0, la 1.0.3 y la 1.0.2 la rechazan', (_label, row) => {
    expect(row.v).toBe(3);
    expect(parseProgress(row)).not.toBeNull();
    expect(parseProgress121(row)).not.toBeNull();
    expect(parseProgress120(row)).toBeNull();
    expect(parseProgress103(row)).toBeNull();
    expect(parseProgress102(row)).toBeNull();
  });

  test('la 1.2.0 sí lee las filas de la 1.2 que la 1.3 aún no ha escrito (no hay migración en bloque)', () => {
    expect(parseProgress120(valid)).not.toBeNull();
    expect(parseProgress120(v2)).not.toBeNull();
  });
});

// Los rechazos de AC-131, en las dos versiones de la fila de la 1.2
const corrupt = (base: Record<string, unknown>): [string, unknown][] => [
  ['un campo de más', { ...base, hp: 100 }],
  ['oro negativo', { ...base, gold: -1 }],
  ['oro con decimales', { ...base, gold: 1.5 }],
  ['oro como texto', { ...base, gold: '750' }],
  ['oro por encima del tope', { ...base, gold: GOLD_CAP + 1 }],
  ['sin mejoras', { ...base, upgrades: undefined }],
  ['una mejora de menos', { ...base, upgrades: { cannons: 2, hull: 1 } }],
  ['una mejora desconocida', { ...base, upgrades: { cannons: 2, hull: 1, sails: 1, mast: 1 } }],
  ['nivel 0', { ...base, upgrades: { cannons: 0, hull: 1, sails: 1 } }],
  ['nivel 4', { ...base, upgrades: { cannons: 4, hull: 1, sails: 1 } }],
  ['nivel con decimales', { ...base, upgrades: { cannons: 1.5, hull: 1, sails: 1 } }],
  ['sin barcos', { ...base, ownedShips: [], activeShip: 'sloop' }],
  ['barcos que no son lista', { ...base, ownedShips: 'sloop' }],
  ['un barco repetido', { ...base, ownedShips: ['sloop', 'sloop'], activeShip: 'sloop' }],
  ['un barco desconocido', { ...base, ownedShips: ['sloop', 'galleon'], activeShip: 'sloop' }],
  ['un barco de PNJ', { ...base, ownedShips: ['sloop', 'captain'], activeShip: 'sloop' }],
  ['el id de ux del Bergantín', { ...base, ownedShips: ['sloop', 'brigantine'], activeShip: 'sloop' }],
  ['barco activo que no posee', { ...base, ownedShips: ['sloop'], activeShip: 'frigate' }],
  ['barco activo desconocido', { ...base, activeShip: 'galleon' }],
  // GDD §13 (1.3): una v: 1 o v: 2 con las claves de la v: 3
  ['ships', { ...base, ships: { sloop: N1 } }],
  ['families', { ...base, families: [] }],
  ['family', { ...base, family: 'none' }]
];

test.each([
  ['nulo', null],
  ['un array', [valid]],
  ['un texto', JSON.stringify(valid)],
  ...corrupt(valid)
])('se rechaza un registro v: 1 con %s', (_label, raw) => {
  expect(parseProgress(raw)).toBeNull();
});

test.each(corrupt(v2))('se rechaza un registro v: 2 con %s', (_label, raw) => {
  expect(parseProgress(raw)).toBeNull();
});

// Los rechazos de AC-156. Los ids de una v: 1 son los de la fila de la 1.0, no los de la simulación: con la Goleta y el
// Navío en PLAYER_SHIP_ORDER, una v: 1 con ellos sigue siendo un registro corrupto
test.each([
  ['sin versión', { ...valid, v: undefined }],
  ['v: 0', { ...valid, v: 0 }],
  ['v: 4', { ...v3, v: 4 }],
  ['v como texto', { ...v2, v: '2' }],
  ['v: 3 como texto', { ...v3, v: '3' }],
  ['v con decimales', { ...v2, v: 1.5 }],
  ['v: 1 con xp', { ...valid, xp: 0 }],
  ['v: 1 con la Goleta', { ...valid, ownedShips: ['sloop', 'schooner'], activeShip: 'sloop' }],
  ['v: 1 con el Navío', { ...valid, ownedShips: ['sloop', 'line'], activeShip: 'sloop' }],
  ['v: 1 con el Navío como barco activo', { ...valid, ownedShips: ['sloop', 'line'], activeShip: 'line' }],
  ['v: 2 sin xp', { ...valid, v: 2 }],
  ['xp negativa', { ...v2, xp: -1 }],
  ['xp con decimales', { ...v2, xp: 1.5 }],
  ['xp por encima del tope', { ...v2, xp: XP_CAP + 1 }],
  ['xp como texto', { ...v2, xp: '1234' }],
  ['xp nula', { ...v2, xp: null }]
])('se rechaza un registro con %s', (_label, raw) => {
  expect(parseProgress(raw)).toBeNull();
});

// GDD §13, «Lectura y escritura de la fila en la 1.3», punto «Se rechazan» (AC-219): cada caso, sin tocar la fila
const without = (key: string) => Object.fromEntries(Object.entries(v3).filter(([k]) => k !== key));
const ownKey = (key: string, value: unknown) => JSON.parse(`{${JSON.stringify(key)}: ${JSON.stringify(value)}}`); // una clave propia, también «__proto__»
test.each([
  // claves de la fila
  ['upgrades', { ...v3, upgrades: N1 }],
  ['ownedShips', { ...v3, ownedShips: ['sloop', 'brig'] }],
  ...(['gold', 'xp', 'ships', 'activeShip', 'families', 'family'] as const).map((k): [string, unknown] => [`sin ${k}`, without(k)]),
  ['una clave de más', { ...v3, hp: 100 }],
  // oro y XP, como en la v: 2
  ['oro negativo', { ...v3, gold: -1 }],
  ['oro por encima del tope', { ...v3, gold: GOLD_CAP + 1 }],
  ['oro como texto', { ...v3, gold: '1234' }],
  ['xp con decimales', { ...v3, xp: 2.5 }],
  ['xp por encima del tope', { ...v3, xp: XP_CAP + 1 }],
  ['xp nula', { ...v3, xp: null }],
  // ships
  ['ships vacío', { ...v3, ships: {} }],
  ['ships como lista', { ...v3, ships: [{ ...N1 }] }],
  ['ships nulo', { ...v3, ships: null }],
  ['un barco desconocido', { ...v3, ships: { ...v3.ships, galleon: N1 } }],
  ['un barco de PNJ', { ...v3, ships: { ...v3.ships, captain: N1 } }],
  ['el id de ux del Bergantín', { ...v3, ships: { sloop: N1, brigantine: N1 }, activeShip: 'sloop' }],
  ['un barco «__proto__»', { ...v3, ships: { ...v3.ships, ...ownKey('__proto__', N1) } }],
  ['un barco sin un eje', { ...v3, ships: { ...v3.ships, brig: { cannons: 1, hull: 1 } } }],
  ['un barco con un eje de más', { ...v3, ships: { ...v3.ships, brig: { ...N1, mast: 1 } } }],
  ['un barco con un eje desconocido en lugar de otro', { ...v3, ships: { ...v3.ships, brig: { cannons: 1, hull: 1, mast: 1 } } }],
  ['un barco sin niveles', { ...v3, ships: { ...v3.ships, brig: null } }],
  ['un barco con sus niveles en una lista', { ...v3, ships: { ...v3.ships, brig: [1, 1, 1] } }],
  ['nivel 0', { ...v3, ships: { ...v3.ships, brig: { ...N1, hull: 0 } } }],
  ['nivel 4', { ...v3, ships: { ...v3.ships, brig: { ...N1, sails: 4 } } }],
  ['nivel con decimales', { ...v3, ships: { ...v3.ships, brig: { ...N1, cannons: 1.5 } } }],
  ['nivel como texto', { ...v3, ships: { ...v3.ships, brig: { ...N1, cannons: '2' } } }],
  // activeShip
  ['barco activo que no es clave de ships', { ...v3, activeShip: 'frigate' }],
  ['barco activo desconocido', { ...v3, activeShip: 'galleon' }],
  ['barco activo que es una clave del prototipo', { ...v3, activeShip: 'constructor' }],
  ['barco activo «toString»', { ...v3, activeShip: 'toString' }],
  ['barco activo que no es texto', { ...v3, activeShip: 1 }],
  ['barco activo nulo', { ...v3, activeShip: null }],
  // families
  ['families que no es lista', { ...v3, families: 'gb' }],
  ['families como objeto', { ...v3, families: { gb: true } }],
  ['families nula', { ...v3, families: null }],
  ['«none» en families', { ...v3, families: ['gb', 'none'], family: 'gb' }],
  ['una familia desconocida', { ...v3, families: ['gb', 'fr'], family: 'gb' }],
  ['una familia en mayúsculas', { ...v3, families: ['GB'], family: 'none' }],
  ['una familia repetida', { ...v3, families: ['gb', 'gb'], family: 'gb' }],
  ['una familia que no es texto', { ...v3, families: [1], family: 'none' }],
  // family
  ['family que no está en families', { ...v3, families: ['gb'], family: 'es' }],
  ['family sin ninguna comprada', { ...v3, families: [], family: 'gb' }],
  ['family desconocida', { ...v3, family: 'fr' }],
  ['family vacía', { ...v3, family: '' }],
  ['family nula', { ...v3, family: null }],
  ['family como lista', { ...v3, family: ['es'] }]
])('se rechaza un registro v: 3 con %s, también en la 1.2.1 (AC-220 a)', (_label, raw) => {
  expect(parseProgress(raw)).toBeNull();
  expect(parseProgress121(raw)).toBeNull();
});

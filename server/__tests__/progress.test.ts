// Registro de progreso (AC-97): parser estricto, como protocol.ts. Un registro que no pasa no se usa ni se sobrescribe
// (AC-131): oro entero ≥ 0, niveles entre 1 y 3, y el barco activo entre los que posee. La 1.0.3 lee también las filas
// v: 2 de la 1.1 (GDD §13, «Formato de la fila»; AC-157): juega con lo de la 1.0 y escribe lo demás tal cual, con la misma
// v que leyó. Los rechazos nuevos son los de AC-156
import { GOLD_CAP } from '../../src/game/constants';
import { NEW_ROW, parseProgress, progressKey, serializeProgress } from '../progress';
import { parseProgress as parseProgress102 } from './fixtures/progress-1.0.2';

const valid = { v: 1, gold: 750, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig' };
const progress = { gold: 750, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig' };
// Una fila de la 1.1 con todo: XP, los dos barcos nuevos y el Navío como barco activo
const v2 = {
  v: 2,
  gold: 4321,
  upgrades: { cannons: 3, hull: 2, sails: 1 },
  ownedShips: ['sloop', 'brig', 'schooner', 'frigate', 'line'],
  activeShip: 'line',
  xp: 1234
};
const roundTrip = (row: unknown) => JSON.parse(JSON.stringify(row));

describe('filas v: 1 de la 1.0', () => {
  test('un registro válido se lee tal cual, y se recuerda que es v: 1', () => {
    expect(parseProgress(valid)).toEqual({ progress, carry: { v: 1 } });
  });

  test('serializar y leer devuelve el mismo progreso', () => {
    expect(parseProgress(roundTrip(serializeProgress(progress as never, NEW_ROW)))?.progress).toEqual(progress);
  });

  test('se escriben en v: 1, con las mismas claves de la 1.0.2 y sin xp', () => {
    expect(serializeProgress(progress as never, { v: 1 })).toEqual(valid);
  });

  test('una fila nueva se escribe en v: 1, como la 1.0.2', () => {
    expect(NEW_ROW).toEqual({ v: 1 });
    expect(serializeProgress(progress as never, NEW_ROW)).toEqual(valid);
  });

  test('los barcos en propiedad se leen en el orden del astillero', () => {
    expect(parseProgress({ ...valid, ownedShips: ['frigate', 'sloop'], activeShip: 'sloop' })?.progress.ownedShips).toEqual(['sloop', 'frigate']);
  });

  test.each([
    ['oro 0', { ...valid, gold: 0 }],
    ['oro en el tope', { ...valid, gold: GOLD_CAP }],
    ['sin Balandra', { ...valid, ownedShips: ['brig'], activeShip: 'brig' }]
  ])('se acepta, como en la 1.0.2, un registro con %s', (_label, raw) => {
    expect(parseProgress102(raw)).not.toBeNull();
    expect(parseProgress(raw)?.progress).toEqual(parseProgress102(raw));
  });

  test('la 1.0.2 lee la fila v: 1 que escribe la 1.0.3 (para volver de la 1.0.3 a la 1.0.2 antes de la 1.1)', () => {
    const read = parseProgress(valid)!;
    const written = roundTrip(serializeProgress({ ...read.progress, gold: 900 }, read.carry));
    expect(parseProgress102(written)).toEqual({ ...progress, gold: 900 });
  });
});

describe('filas v: 2 de la 1.1 (AC-157)', () => {
  test('(a, b) se aceptan: se juega con el oro, las mejoras y los barcos de la 1.0, y con la Fragata si el activo es el Navío', () => {
    expect(parseProgress(v2)).toEqual({
      progress: { gold: 4321, upgrades: { cannons: 3, hull: 2, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate' },
      carry: { v: 2, xp: 1234, newShips: ['schooner', 'line'] }
    });
  });

  test.each([
    ['la Goleta, con Balandra y Bergantín', ['sloop', 'brig', 'schooner'], 'schooner', 'brig'],
    ['el Navío, con Balandra y Bergantín', ['sloop', 'brig', 'line'], 'line', 'brig'],
    ['el Navío, solo con la Balandra', ['sloop', 'line'], 'line', 'sloop'],
    ['la Goleta, con la Fragata pero sin Bergantín', ['sloop', 'schooner', 'frigate'], 'schooner', 'frigate']
  ])('(b) si el barco activo es %s, se juega con el mejor de la 1.0 que posee', (_label, ownedShips, activeShip, playing) => {
    expect(parseProgress({ ...v2, ownedShips, activeShip })?.progress.activeShip).toBe(playing);
  });

  test('(b) si el barco activo es de la 1.0, se juega con él aunque posea uno nuevo mejor', () => {
    expect(parseProgress({ ...v2, activeShip: 'brig' })?.progress.activeShip).toBe('brig');
  });

  test('(b, c) sin ningún barco de la 1.0, se juega con la Balandra y, al escribir, la Balandra se añade a la fila', () => {
    const read = parseProgress({ ...v2, ownedShips: ['line'], activeShip: 'line', xp: 500 });
    expect(read).toEqual({
      progress: { gold: 4321, upgrades: { cannons: 3, hull: 2, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop' },
      carry: { v: 2, xp: 500, newShips: ['line'] }
    });
    expect(serializeProgress(read!.progress, read!.carry)).toEqual({ ...v2, ownedShips: ['sloop', 'line'], activeShip: 'sloop', xp: 500 });
  });

  test.each([
    ['0 de XP', 0],
    ['la XP en el tope', 9_999_999]
  ])('se acepta una fila con %s', (_label, xp) => {
    expect(parseProgress({ ...v2, xp })?.carry).toEqual({ v: 2, xp, newShips: ['schooner', 'line'] });
  });

  test('se acepta una fila v: 2 sin barcos nuevos', () => {
    expect(parseProgress({ ...v2, ownedShips: ['sloop', 'brig'], activeShip: 'brig' })).toEqual({
      progress: { gold: 4321, upgrades: { cannons: 3, hull: 2, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig' },
      carry: { v: 2, xp: 1234, newShips: [] }
    });
  });

  test('(c) se escribe en v: 2 con la misma XP y los mismos barcos nuevos, y como activo el barco con el que juega', () => {
    const read = parseProgress(v2)!;
    expect(serializeProgress(read.progress, read.carry)).toEqual({ ...v2, activeShip: 'frigate' });
  });

  test('(c) lo que cambia en la 1.0.3 se escribe junto a lo que conserva: un Bergantín comprado va entre los barcos nuevos, en el orden de la tabla de ids', () => {
    const read = parseProgress({ ...v2, gold: 2500, ownedShips: ['sloop', 'line'], activeShip: 'line' })!;
    const after = { ...read.progress, gold: 500, ownedShips: [...read.progress.ownedShips, 'brig' as const], activeShip: 'brig' as const };
    expect(serializeProgress(after, read.carry)).toEqual({ ...v2, gold: 500, ownedShips: ['sloop', 'brig', 'line'], activeShip: 'brig' });
  });

  test('(c, d) leer y escribir otra vez da la misma fila: la XP y los barcos nuevos no se pierden en las vueltas', () => {
    const first = parseProgress(v2)!;
    const row = roundTrip(serializeProgress(first.progress, first.carry));
    const second = parseProgress(row)!;
    expect(second).toEqual(first);
    expect(roundTrip(serializeProgress(second.progress, second.carry))).toEqual(row);
  });

  test('la 1.0.2 rechaza la fila v: 2: por eso existe la 1.0.3', () => {
    expect(parseProgress102(v2)).toBeNull();
    expect(parseProgress102({ ...valid, ownedShips: ['sloop', 'line'], activeShip: 'sloop' })).toBeNull();
  });
});

test('la huella no depende del orden de las claves', () => {
  const a = parseProgress(valid)!.progress;
  const b = parseProgress({ activeShip: 'brig', ownedShips: ['sloop', 'brig'], upgrades: { sails: 1, hull: 1, cannons: 2 }, gold: 750, v: 1 })!.progress;
  expect(progressKey(a)).toBe(progressKey(b));
  expect(progressKey({ ...a, gold: 751 })).not.toBe(progressKey(a));
});

// Los rechazos de AC-131, en las dos versiones de la fila
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
  ['barco activo desconocido', { ...base, activeShip: 'galleon' }]
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

// Los rechazos nuevos de AC-156, que la 1.0.3 comparte con la 1.1 (AC-157 a)
test.each([
  ['sin versión', { ...valid, v: undefined }],
  ['v: 0', { ...valid, v: 0 }],
  ['v: 3', { ...v2, v: 3 }],
  ['v como texto', { ...v2, v: '2' }],
  ['v con decimales', { ...v2, v: 1.5 }],
  ['v: 1 con xp', { ...valid, xp: 0 }],
  ['v: 1 con la Goleta', { ...valid, ownedShips: ['sloop', 'schooner'], activeShip: 'sloop' }],
  ['v: 1 con el Navío', { ...valid, ownedShips: ['sloop', 'line'], activeShip: 'sloop' }],
  ['v: 1 con el Navío como barco activo', { ...valid, ownedShips: ['sloop', 'line'], activeShip: 'line' }],
  ['v: 2 sin xp', { ...valid, v: 2 }],
  ['xp negativa', { ...v2, xp: -1 }],
  ['xp con decimales', { ...v2, xp: 1.5 }],
  ['xp por encima del tope', { ...v2, xp: 10_000_000 }],
  ['xp como texto', { ...v2, xp: '1234' }],
  ['xp nula', { ...v2, xp: null }]
])('se rechaza un registro con %s', (_label, raw) => {
  expect(parseProgress(raw)).toBeNull();
});

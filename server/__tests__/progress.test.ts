// Registro de progreso (AC-97 y, desde la 1.1, la XP de AC-155): parser estricto, como protocol.ts. Un registro que no
// pasa no se usa ni se sobrescribe (AC-131): oro entero ≥ 0, niveles entre 1 y 3, y el barco activo entre los que posee.
// Formato de la fila (GDD §13): la 1.1 lee v: 1 (con 0 de XP) y v: 2, y siempre escribe v: 2 (AC-156); los rechazos
// nuevos son los de AC-156. Lo que escribe la 1.1 lo tiene que leer la 1.0.3, por si hay que volver atrás (AC-157): se
// prueba con su lector congelado (fixtures/progress-1.0.3.ts)
import { GOLD_CAP, XP_CAP } from '../../src/game/constants';
import { levelOf } from '../../src/game/xp';
import { NEW_ROW, parseProgress, progressKey, serializeProgress } from '../progress';
import { parseProgress as parseProgress102 } from './fixtures/progress-1.0.2';
import { parseProgress as parseProgress103, serializeProgress as serializeProgress103 } from './fixtures/progress-1.0.3';
import { rowV1, v1Shapes } from './fixtures/progress-rows';

const valid = { v: 1, gold: 750, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig' };
const progress = { gold: 750, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig', xp: 0 };
// Una fila de la 1.1 con todo: XP, los dos barcos nuevos y el Navío como barco activo. Mientras la simulación no juegue la
// Goleta ni el Navío (no están en PLAYER_SHIP_ORDER), van aparte y se juega con el mejor barco que sí juega, como en la
// 1.0.3 (AC-157 b). Cuando dev-npc los añada, estos casos cambian a propósito
const v2 = {
  v: 2,
  gold: 4321,
  upgrades: { cannons: 3, hull: 2, sails: 1 },
  ownedShips: ['sloop', 'brig', 'schooner', 'frigate', 'line'],
  activeShip: 'line',
  xp: 1234
};
const roundTrip = (row: unknown) => JSON.parse(JSON.stringify(row));

describe('filas v: 1 de la 1.0 (AC-156)', () => {
  test('un registro válido se lee tal cual, con 0 de XP', () => {
    expect(parseProgress(valid)).toEqual({ progress, carry: { newShips: [] } });
  });

  test.each(v1Shapes(GOLD_CAP).map((p) => [`${p.ownedShips.join('+')}, activo ${p.activeShip}, oro ${p.gold}, mejoras ${Object.values(p.upgrades).join('/')}`, rowV1(p)]))(
    'cada forma que acepta la 1.0.2 entra intacta y con 0 de XP: %s',
    (_label, row) => {
      expect(parseProgress102(row)).not.toBeNull();
      expect(parseProgress(row)?.progress).toEqual({ ...parseProgress102(row), xp: 0 });
    }
  );

  test('al escribir pasa a v: 2, con 0 de XP y el resto igual, y se vuelve a leer con el mismo progreso', () => {
    const read = parseProgress(valid)!;
    const written = roundTrip(serializeProgress(read.progress, read.carry));
    expect(written).toEqual({ ...valid, v: 2, xp: 0 });
    expect(parseProgress(written)).toEqual(read);
  });

  test('un usuario nuevo se escribe en v: 2 con 0 de XP', () => {
    expect(NEW_ROW).toEqual({ newShips: [] });
    expect(serializeProgress({ gold: 100, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop', xp: 0 }, NEW_ROW)).toEqual({
      v: 2,
      gold: 100,
      upgrades: { cannons: 1, hull: 1, sails: 1 },
      ownedShips: ['sloop'],
      activeShip: 'sloop',
      xp: 0
    });
  });

  test('los barcos en propiedad se leen en el orden del astillero', () => {
    expect(parseProgress({ ...valid, ownedShips: ['frigate', 'sloop'], activeShip: 'sloop' })?.progress.ownedShips).toEqual(['sloop', 'frigate']);
  });
});

describe('filas v: 2 de la 1.1 (AC-155)', () => {
  test('se juega con su XP (1 234: nivel 7), el oro, las mejoras y los barcos que la simulación juega; con el Navío activo, con la Fragata', () => {
    const read = parseProgress(v2);
    expect(read).toEqual({
      progress: { gold: 4321, upgrades: { cannons: 3, hull: 2, sails: 1 }, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate', xp: 1234 },
      carry: { newShips: ['schooner', 'line'] }
    });
    expect(levelOf(read!.progress.xp)).toBe(7);
  });

  test.each([
    ['la Goleta, con Balandra y Bergantín', ['sloop', 'brig', 'schooner'], 'schooner', 'brig'],
    ['el Navío, con Balandra y Bergantín', ['sloop', 'brig', 'line'], 'line', 'brig'],
    ['el Navío, solo con la Balandra', ['sloop', 'line'], 'line', 'sloop'],
    ['la Goleta, con la Fragata pero sin Bergantín', ['sloop', 'schooner', 'frigate'], 'schooner', 'frigate']
  ])('si el barco activo es %s, se juega con el mejor que la simulación juega', (_label, ownedShips, activeShip, playing) => {
    expect(parseProgress({ ...v2, ownedShips, activeShip })?.progress.activeShip).toBe(playing);
  });

  test('si el barco activo es uno que la simulación juega, se juega con él aunque posea uno nuevo mejor', () => {
    expect(parseProgress({ ...v2, activeShip: 'brig' })?.progress.activeShip).toBe('brig');
  });

  test('sin ningún barco que la simulación juegue, se juega con la Balandra y, al escribir, se añade a la fila', () => {
    const read = parseProgress({ ...v2, ownedShips: ['line'], activeShip: 'line', xp: 500 })!;
    expect(read.progress).toEqual({ gold: 4321, upgrades: { cannons: 3, hull: 2, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop', xp: 500 });
    expect(serializeProgress(read.progress, read.carry)).toEqual({ ...v2, ownedShips: ['sloop', 'line'], activeShip: 'sloop', xp: 500 });
  });

  test.each([
    ['0 de XP', 0],
    ['la XP en el tope', XP_CAP]
  ])('se acepta una fila con %s', (_label, xp) => {
    expect(parseProgress({ ...v2, xp })?.progress.xp).toBe(xp);
  });

  test('se acepta una fila v: 2 sin barcos nuevos', () => {
    expect(parseProgress({ ...v2, ownedShips: ['sloop', 'brig'], activeShip: 'brig' })).toEqual({
      progress: { gold: 4321, upgrades: { cannons: 3, hull: 2, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig', xp: 1234 },
      carry: { newShips: [] }
    });
  });

  test('se escribe en v: 2 con la XP de la partida, los barcos nuevos tal cual y como activo el barco con el que juega', () => {
    const read = parseProgress(v2)!;
    expect(serializeProgress(read.progress, read.carry)).toEqual({ ...v2, activeShip: 'frigate' });
    expect(serializeProgress({ ...read.progress, xp: 1300 }, read.carry)).toEqual({ ...v2, activeShip: 'frigate', xp: 1300 });
  });

  test('un Bergantín comprado va entre los barcos nuevos, en el orden de la tabla de ids', () => {
    const read = parseProgress({ ...v2, gold: 2500, ownedShips: ['sloop', 'line'], activeShip: 'line' })!;
    const after = { ...read.progress, gold: 500, ownedShips: [...read.progress.ownedShips, 'brig' as const], activeShip: 'brig' as const };
    expect(serializeProgress(after, read.carry)).toEqual({ ...v2, gold: 500, ownedShips: ['sloop', 'brig', 'line'], activeShip: 'brig' });
  });

  test('leer y escribir otra vez da la misma fila', () => {
    const first = parseProgress(v2)!;
    const row = roundTrip(serializeProgress(first.progress, first.carry));
    const second = parseProgress(row)!;
    expect(second).toEqual(first);
    expect(roundTrip(serializeProgress(second.progress, second.carry))).toEqual(row);
  });
});

describe('volver a la 1.0.3 (AC-157): la 1.0.3 lee lo que escribe la 1.1 y lo conserva', () => {
  test.each([
    ['una fila de la 1.0 tras su primera escritura en la 1.1', valid],
    ['una fila v: 2 con XP y barcos nuevos', v2],
    ['una fila v: 2 sin barcos nuevos', { ...v2, ownedShips: ['sloop', 'brig'], activeShip: 'brig' }]
  ])('%s', (_label, row) => {
    const read = parseProgress(row)!;
    const written = roundTrip(serializeProgress(read.progress, read.carry));
    expect(parseProgress103(written)).not.toBeNull();
    expect(parseProgress103(written)!.carry).toEqual({ v: 2, xp: read.progress.xp, newShips: read.carry.newShips });
  });

  test('la 1.1 escribe, la 1.0.3 lee y escribe, la 1.1 lee: la XP y los barcos nuevos son los mismos, y el activo es el de la 1.0.3', () => {
    const by11 = parseProgress(v2)!;
    const row11 = roundTrip(serializeProgress({ ...by11.progress, xp: 1300 }, by11.carry));
    const by103 = parseProgress103(row11)!;
    const row103 = roundTrip(serializeProgress103({ ...by103.progress, gold: 4400, activeShip: 'brig' }, by103.carry));
    const back = parseProgress(row103)!;
    expect(back.progress).toEqual({ ...by11.progress, gold: 4400, activeShip: 'brig', xp: 1300 });
    expect(back.carry).toEqual(by11.carry);
  });

  test('la 1.0.2 rechaza todo lo que escribe la 1.1, también una fila de la 1.0 tras su primera escritura: se vuelve a la 1.0.3, no a la 1.0.2', () => {
    const read = parseProgress(valid)!;
    expect(parseProgress102(roundTrip(serializeProgress(read.progress, read.carry)))).toBeNull();
    expect(parseProgress102(v2)).toBeNull();
  });
});

test('la huella no depende del orden de las claves y cambia con la XP (la del coatacante sin oro también se escribe)', () => {
  const a = parseProgress(v2)!.progress;
  const b = parseProgress({ xp: 1234, activeShip: 'line', ownedShips: [...v2.ownedShips].reverse(), upgrades: { sails: 1, hull: 2, cannons: 3 }, gold: 4321, v: 2 })!.progress;
  expect(progressKey(a)).toBe(progressKey(b));
  expect(progressKey({ ...a, gold: 4322 })).not.toBe(progressKey(a));
  expect(progressKey({ ...a, xp: 1235 })).not.toBe(progressKey(a));
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

// Los rechazos nuevos de AC-156. Los ids de una v: 1 son los de la fila de la 1.0, no los de la simulación: aunque
// PLAYER_SHIP_ORDER crezca con la Goleta y el Navío, una v: 1 con ellos sigue siendo un registro corrupto
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
  ['xp por encima del tope', { ...v2, xp: XP_CAP + 1 }],
  ['xp como texto', { ...v2, xp: '1234' }],
  ['xp nula', { ...v2, xp: null }]
])('se rechaza un registro con %s', (_label, raw) => {
  expect(parseProgress(raw)).toBeNull();
});

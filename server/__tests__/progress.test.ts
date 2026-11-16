// Registro de progreso (AC-97 y, desde la 1.1, la XP de AC-155): parser estricto, como protocol.ts. Un registro que no
// pasa no se usa ni se sobrescribe (AC-131): oro entero ≥ 0, niveles entre 1 y 3, y el barco activo entre los que posee.
// Formato de la fila (GDD §13): la 1.1 lee v: 1 (con 0 de XP) y v: 2, y siempre escribe v: 2 (AC-156); los rechazos
// nuevos son los de AC-156. Lo que escribe la 1.1 lo tiene que leer la 1.0.3, por si hay que volver atrás (AC-157): se
// prueba con su lector congelado (fixtures/progress-1.0.3.ts).
// El puente de la 1.2.x (AC-220): además lee las filas v: 3 de la 1.3 y las vuelve a escribir en v: 3, sin perder lo que no
// juega. Las filas v: 3 salen del escritor de la 1.3 y lo que escribe el puente lo vuelve a leer el lector de la 1.3, los
// dos congelados (fixtures/progress-1.3.ts, 58b53d1); la 1.2.0, congelada también (fixtures/progress-1.2.0.ts), rechaza la v: 3
import { GOLD_CAP, XP_CAP } from '../../src/game/constants';
import { levelOf } from '../../src/game/xp';
import { carryAfterWrite, LegacyCarry, NEW_ROW, parseProgress, progressKey, SavedProgress, serializeProgress } from '../progress';
import { parseProgress as parseProgress102 } from './fixtures/progress-1.0.2';
import { parseProgress as parseProgress103, serializeProgress as serializeProgress103 } from './fixtures/progress-1.0.3';
import { parseProgress as parseProgress120 } from './fixtures/progress-1.2.0';
import { parseProgress as parseProgress13, SavedProgress as SavedProgress13, serializeProgress as serializeProgress13 } from './fixtures/progress-1.3';
import { rowV1, v1Shapes, V3_AC218, V3_AC220, V3_FULL, V3_NEW } from './fixtures/progress-rows';

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
    expect(parseProgress103(written)!.carry).toEqual({ v: 2, xp: read.progress.xp, newShips: (read.carry as LegacyCarry).newShips });
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
  ['v: 3 con las claves de la v: 2', { ...v2, v: 3 }],
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

// ---- El puente de la 1.2.x: filas v: 3 de la 1.3 (GDD §13, «Lectura y escritura de la fila en la 1.3 y en la 1.2.x
// puente»; BACKLOG AC-220) ----

const lv = (cannons: number, hull: number, sails: number) => ({ cannons, hull, sails });
const omit = (row: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== key));
const V3_KEYS = ['activeShip', 'families', 'family', 'gold', 'ships', 'v', 'xp'];

describe('las filas v: 3 de estos tests son las que escribe la 1.3 (su escritor congelado, 58b53d1)', () => {
  const from13: [string, Record<string, unknown>, SavedProgress13][] = [
    ['AC-218', V3_AC218, { gold: 1234, xp: 2500, ships: { brig: lv(1, 1, 1), sloop: lv(3, 1, 2) }, activeShip: 'brig', families: ['es', 'gb'], family: 'es' }],
    ['AC-220 (c)', V3_AC220, { gold: 5000, xp: 1500, ships: { line: lv(2, 1, 1), sloop: lv(1, 1, 1), frigate: lv(2, 2, 2) }, activeShip: 'line', families: ['es'], family: 'es' }],
    [
      'los dados de AC-220',
      V3_FULL,
      { gold: 4321, xp: 2500, ships: { line: lv(3, 3, 2), frigate: lv(2, 2, 1), schooner: lv(1, 2, 3), brig: lv(2, 3, 1), sloop: lv(3, 1, 2) }, activeShip: 'line', families: ['gb', 'es'], family: 'es' }
    ],
    ['un jugador nuevo de la 1.3', V3_NEW, { gold: 100, xp: 0, ships: { sloop: lv(1, 1, 1) }, activeShip: 'sloop', families: [], family: 'none' }]
  ];

  test.each(from13)('%s: el escritor de la 1.3 da esa fila, con sus claves en el mismo orden, y su lector la acepta', (_label, row, progress13) => {
    expect(JSON.stringify(serializeProgress13(progress13))).toBe(JSON.stringify(row));
    expect(parseProgress13(row)).not.toBeNull();
  });
});

describe('lectura de una v: 3 (AC-220 a y b): el puente juega con el oro, la XP y los barcos de la 1.2', () => {
  test('el ejemplo de AC-220: con el Navío activo juega con la Fragata a (2, 2, 2), su oro y su XP, y aparte quedan los niveles de cada barco y las familias', () => {
    expect(parseProgress(V3_AC220)).toEqual({
      progress: { gold: 5000, upgrades: lv(2, 2, 2), ownedShips: ['sloop', 'frigate'], activeShip: 'frigate', xp: 1500 },
      carry: { v: 3, ships: { sloop: lv(1, 1, 1), frigate: lv(2, 2, 2), line: lv(2, 1, 1) }, families: ['es'], family: 'es' }
    });
  });

  test('los dados de AC-220: la Goleta y el Navío no entran en el mundo; juega con la Fragata y sus niveles, y su XP (2 500: nivel 9)', () => {
    const read = parseProgress(V3_FULL)!;
    expect(read.progress).toEqual({ gold: 4321, upgrades: lv(2, 2, 1), ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate', xp: 2500 });
    expect(read.carry).toEqual({ v: 3, ships: V3_FULL.ships, families: ['gb', 'es'], family: 'es' });
    expect(levelOf(read.progress.xp)).toBe(9); // LEVEL_XP[8] = 2 400 ≤ 2 500 < 3 300
  });

  test('con un barco activo que la 1.2 juega, juega con él y con sus niveles, aunque otro barco tenga más (AC-218: el Bergantín a N1, la Balandra a 3/1/2)', () => {
    expect(parseProgress(V3_AC218)!.progress).toEqual({ gold: 1234, upgrades: lv(1, 1, 1), ownedShips: ['sloop', 'brig'], activeShip: 'brig', xp: 2500 });
    expect(parseProgress({ ...V3_FULL, activeShip: 'sloop' })!.progress).toMatchObject({ upgrades: lv(3, 1, 2), activeShip: 'sloop' });
  });

  test.each([
    ['la Goleta, con Balandra y Bergantín', { sloop: lv(1, 1, 1), brig: lv(2, 1, 3), schooner: lv(3, 3, 3) }, 'schooner', 'brig', lv(2, 1, 3)],
    ['el Navío, solo con la Balandra', { sloop: lv(2, 2, 1), line: lv(3, 3, 3) }, 'line', 'sloop', lv(2, 2, 1)],
    ['la Goleta, con la Fragata pero sin Bergantín', { sloop: lv(1, 1, 1), schooner: lv(1, 1, 1), frigate: lv(1, 3, 2) }, 'schooner', 'frigate', lv(1, 3, 2)]
  ])('con %s como barco activo, juega con el mejor de los de la 1.2 y con sus niveles', (_label, ships, activeShip, playing, upgrades) => {
    expect(parseProgress({ ...V3_FULL, ships, activeShip })!.progress).toMatchObject({ activeShip: playing, upgrades });
  });

  test('sin ningún barco de la 1.2 (solo una edición a mano la da), juega con la Balandra a N1 y, al escribir, la añade a ships como activa', () => {
    const read = parseProgress({ ...V3_FULL, ships: { line: lv(3, 3, 3) }, activeShip: 'line' })!;
    expect(read.progress).toEqual({ gold: 4321, upgrades: lv(1, 1, 1), ownedShips: ['sloop'], activeShip: 'sloop', xp: 2500 });
    expect(serializeProgress(read.progress, read.carry)).toEqual({ ...V3_FULL, ships: { sloop: lv(1, 1, 1), line: lv(3, 3, 3) }, activeShip: 'sloop' });
  });

  test('sin familia (families: [] y family: "none", Q39) se acepta y se juega igual', () => {
    expect(parseProgress(V3_NEW)).toEqual({
      progress: { gold: 100, upgrades: lv(1, 1, 1), ownedShips: ['sloop'], activeShip: 'sloop', xp: 0 },
      carry: { v: 3, ships: { sloop: lv(1, 1, 1) }, families: [], family: 'none' }
    });
  });

  const accepted: [string, Record<string, unknown>][] = [
    ['0 de oro', { ...V3_FULL, gold: 0 }],
    ['el oro en el tope', { ...V3_FULL, gold: GOLD_CAP }],
    ['0 de XP', { ...V3_FULL, xp: 0 }],
    ['la XP en el tope', { ...V3_FULL, xp: XP_CAP }],
    ['solo la británica, en uso', { ...V3_FULL, families: ['gb'], family: 'gb' }],
    ['las 2 familias, sin ninguna en uso', { ...V3_FULL, families: ['gb', 'es'], family: 'none' }],
    ['las familias en otro orden', { ...V3_FULL, families: ['es', 'gb'] }],
    ['los barcos en otro orden', { ...V3_FULL, ships: Object.fromEntries(Object.entries(V3_FULL.ships).reverse()) }],
    ['solo el Navío y la Balandra, el Navío activo', { ...V3_FULL, ships: { line: lv(1, 1, 1), sloop: lv(1, 1, 1) } }]
  ];
  test.each(accepted)('se acepta una v: 3 con %s, como en la 1.3', (_label, row) => {
    expect(parseProgress(row)).not.toBeNull();
    expect(parseProgress13(row)).not.toBeNull();
  });

  test('el orden de las claves no importa al leer: la misma fila en otro orden da el mismo progreso y la misma fila aparte', () => {
    const shuffled = { family: 'es', families: ['es', 'gb'], activeShip: 'line', ships: Object.fromEntries(Object.entries(V3_FULL.ships).reverse()), xp: 2500, gold: 4321, v: 3 };
    expect(parseProgress(shuffled)).toEqual(parseProgress(V3_FULL));
  });
});

describe('escritura de una v: 3 (AC-220 c): la misma v, cada barco como estaba salvo el que se juega, que toma el mayor de cada eje', () => {
  test.each([
    ['AC-218', V3_AC218, V3_AC218],
    ['un jugador nuevo de la 1.3', V3_NEW, V3_NEW],
    ['el Navío activo: queda como activo la Fragata, con la que juega', V3_FULL, { ...V3_FULL, activeShip: 'frigate' }]
  ])('sin cambios en la partida, se escribe la misma fila (%s), con las claves en el orden de la 1.3', (_label, row, expected) => {
    const read = parseProgress(row)!;
    expect(JSON.stringify(serializeProgress(read.progress, read.carry))).toBe(JSON.stringify(expected));
  });

  test('el ejemplo de AC-220: compra Cañones N3 y la Fragata queda a (3, 2, 2), el resto igual; si después cambia a la Balandra, la Balandra queda a (3, 2, 2) y la Fragata sigue a (3, 2, 2)', () => {
    const read = parseProgress(V3_AC220)!;
    const bought: SavedProgress = { ...read.progress, gold: 3500, upgrades: lv(3, 2, 2) };
    expect(roundTrip(serializeProgress(bought, read.carry))).toEqual({ ...V3_AC220, gold: 3500, ships: { sloop: lv(1, 1, 1), frigate: lv(3, 2, 2), line: lv(2, 1, 1) }, activeShip: 'frigate' });
    // La siguiente escritura parte de la fila escrita, no de la leída al entrar: si no, la Fragata volvería a Cañones N2
    const afterBuy = carryAfterWrite(bought, read.carry);
    const switched: SavedProgress = { ...bought, activeShip: 'sloop' };
    expect(roundTrip(serializeProgress(switched, afterBuy))).toEqual({ ...V3_AC220, gold: 3500, ships: { sloop: lv(3, 2, 2), frigate: lv(3, 2, 2), line: lv(2, 1, 1) }, activeShip: 'sloop' });
  });

  test('el barco con el que juega toma, en cada eje, el mayor entre lo guardado y las mejoras globales; los demás no cambian', () => {
    const read = parseProgress({ ...V3_FULL, ships: { sloop: lv(3, 1, 1), frigate: lv(1, 2, 1), line: lv(2, 2, 2) }, activeShip: 'frigate' })!;
    expect(read.progress.upgrades).toEqual(lv(1, 2, 1));
    const row = serializeProgress({ ...read.progress, activeShip: 'sloop' }, read.carry);
    expect(row).toEqual({ ...V3_FULL, ships: { sloop: lv(3, 2, 1), frigate: lv(1, 2, 1), line: lv(2, 2, 2) }, activeShip: 'sloop' });
  });

  test('un barco comprado en la 1.2.x entra igual, desde el nivel 1: con el Bergantín comprado y activo, toma las mejoras globales, en el orden de la tabla de ids', () => {
    const read = parseProgress(V3_AC220)!;
    const bought: SavedProgress = { ...read.progress, gold: 3000, ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'brig' };
    const row = serializeProgress(bought, read.carry);
    expect(row).toEqual({ ...V3_AC220, gold: 3000, ships: { sloop: lv(1, 1, 1), brig: lv(2, 2, 2), frigate: lv(2, 2, 2), line: lv(2, 1, 1) }, activeShip: 'brig' });
    expect(Object.keys((row as { ships: object }).ships)).toEqual(['sloop', 'brig', 'frigate', 'line']);
  });

  test('un barco en propiedad que no está en la fila y con el que no juega se escribe a nivel 1', () => {
    const read = parseProgress(V3_AC220)!;
    const row = serializeProgress({ ...read.progress, ownedShips: ['sloop', 'brig', 'frigate'] }, read.carry);
    expect((row as { ships: object }).ships).toEqual({ sloop: lv(1, 1, 1), brig: lv(1, 1, 1), frigate: lv(2, 2, 2), line: lv(2, 1, 1) });
  });

  test.each([
    ['AC-218', V3_AC218],
    ['AC-220 (c)', V3_AC220],
    ['los dados de AC-220', V3_FULL],
    ['un jugador nuevo de la 1.3', V3_NEW]
  ])('nunca baja a v: 2 (%s): escribe v: 3 con sus 7 claves, el oro y la XP de la partida, y las mismas familias', (_label, row) => {
    const read = parseProgress(row)!;
    const written = roundTrip(serializeProgress({ ...read.progress, gold: read.progress.gold + 7, xp: read.progress.xp + 66 }, read.carry));
    expect(written.v).toBe(3);
    expect(Object.keys(written).sort()).toEqual(V3_KEYS);
    expect(written).toMatchObject({ gold: (row.gold as number) + 7, xp: (row.xp as number) + 66, families: row.families, family: row.family });
  });

  test('families se escribe en el orden de §6 (gb, es) aunque la fila las trajera en otro', () => {
    const read = parseProgress({ ...V3_FULL, families: ['es', 'gb'] })!;
    expect(serializeProgress(read.progress, read.carry)).toMatchObject({ families: ['gb', 'es'], family: 'es' });
  });

  test('carryAfterWrite: tras escribir, lo que queda aparte es la fila escrita, y escribir otra vez lo mismo da la misma fila', () => {
    const read = parseProgress(V3_AC220)!;
    const bought: SavedProgress = { ...read.progress, gold: 3500, upgrades: lv(3, 2, 2) };
    const after = carryAfterWrite(bought, read.carry);
    expect(after).toEqual({ v: 3, ships: { sloop: lv(1, 1, 1), frigate: lv(3, 2, 2), line: lv(2, 1, 1) }, families: ['es'], family: 'es' });
    expect(serializeProgress(bought, after)).toEqual(serializeProgress(bought, read.carry));
    expect(read.carry).toEqual({ v: 3, ships: V3_AC220.ships, families: ['es'], family: 'es' }); // sin tocar el de entrada
  });

  test('carryAfterWrite no cambia lo que conserva una v: 1 o una v: 2 (los barcos que no juega)', () => {
    const read = parseProgress(v2)!;
    expect(carryAfterWrite(read.progress, read.carry)).toEqual({ newShips: ['schooner', 'line'] });
    expect(carryAfterWrite(read.progress, NEW_ROW)).toEqual(NEW_ROW);
  });

  test('leer y escribir otra vez da la misma fila', () => {
    for (const row of [V3_AC218, V3_AC220, V3_FULL, V3_NEW]) {
      const first = parseProgress(row)!;
      const written = roundTrip(serializeProgress(first.progress, first.carry));
      const second = parseProgress(written)!;
      expect(roundTrip(serializeProgress(second.progress, second.carry))).toEqual(written);
    }
  });

  test('la huella sigue siendo la del progreso que se juega: los niveles aparte no la cambian (cero escrituras en reposo)', () => {
    const a = parseProgress(V3_FULL)!;
    const b = parseProgress({ ...V3_FULL, ships: { ...V3_FULL.ships, line: lv(1, 1, 1) }, family: 'gb' })!;
    expect(progressKey(a.progress)).toBe(progressKey(b.progress));
  });
});

describe('volver de la 1.3 al puente y otra vez a la 1.3 (AC-220): la 1.3 lee lo que escribe el puente y conserva lo que el puente no juega', () => {
  test.each([
    ['AC-218', V3_AC218],
    ['AC-220 (c)', V3_AC220],
    ['los dados de AC-220', V3_FULL],
    ['un jugador nuevo de la 1.3', V3_NEW]
  ])('%s: la 1.3 lee lo que escribe el puente, con los mismos niveles en cada barco con el que no se jugó, las mismas familias y la XP de la partida', (_label, row) => {
    const read = parseProgress(row)!;
    const by13 = parseProgress13(row)!;
    const back = parseProgress13(roundTrip(serializeProgress({ ...read.progress, xp: read.progress.xp + 10 }, read.carry)))!;
    expect(back).not.toBeNull();
    const playing = read.progress.activeShip;
    const others = (ships: Record<string, unknown>) => Object.fromEntries(Object.entries(ships).filter(([c]) => c !== playing));
    expect(others(back.ships)).toEqual(others(by13.ships));
    expect(back).toMatchObject({ gold: by13.gold, xp: by13.xp + 10, activeShip: playing, families: by13.families, family: by13.family });
    expect(back.ships[playing]).toEqual(read.progress.upgrades);
  });

  test('la 1.3 escribe, el puente lee, compra y escribe, la 1.3 lee: la Fragata con su compra, la Balandra, la Goleta, el Navío, las familias y la XP como estaban', () => {
    const progress13: SavedProgress13 = { gold: 4321, xp: 2500, ships: { sloop: lv(3, 1, 2), brig: lv(2, 3, 1), schooner: lv(1, 2, 3), frigate: lv(2, 2, 1), line: lv(3, 3, 2) }, activeShip: 'line', families: ['gb', 'es'], family: 'es' };
    const row13 = roundTrip(serializeProgress13(progress13));
    const bridge = parseProgress(row13)!;
    expect(bridge.progress).toMatchObject({ activeShip: 'frigate', upgrades: lv(2, 2, 1) });
    const bought: SavedProgress = { ...bridge.progress, gold: 4321 - 300, upgrades: lv(2, 2, 2), xp: 2600 };
    const back = parseProgress13(roundTrip(serializeProgress(bought, bridge.carry)))!;
    expect(back).toEqual({ ...progress13, gold: 4021, xp: 2600, ships: { ...progress13.ships, frigate: lv(2, 2, 2) }, activeShip: 'frigate' });
    // Y la 1.3 lo vuelve a escribir en v: 3, igual que lo leyó
    expect(roundTrip(serializeProgress13(back))).toEqual({ ...row13, gold: 4021, xp: 2600, ships: { ...row13.ships, frigate: lv(2, 2, 2) }, activeShip: 'frigate' });
  });

  test('la 1.2.0 rechaza toda fila v: 3: por eso se vuelve de la 1.3 al puente, no a la 1.2.0 (GDD Q36)', () => {
    for (const row of [V3_AC218, V3_AC220, V3_FULL, V3_NEW]) expect(parseProgress120(row)).toBeNull();
  });

  test('lo que escribe el puente con una v: 1 o una v: 2 lo lee la 1.2.0, por si hubiera que volver a ella antes de la 1.3', () => {
    for (const row of [valid, v2, { ...v2, ownedShips: ['sloop', 'brig'], activeShip: 'brig' }]) {
      const read = parseProgress(row)!;
      const written = roundTrip(serializeProgress(read.progress, read.carry));
      expect(written.v).toBe(2);
      expect(parseProgress120(written)).toEqual({ progress: read.progress, carry: read.carry });
    }
  });

  // AC-220 (d), corregido por producto el 2026-11-16: una v: 1 no tiene xp, así que escribirla en v: 1 perdería la XP ganada
  test('una v: 1 con la que el jugador gana XP en el puente se escribe en v: 2 con esa XP; la 1.2.0 y el puente la leen con ella', () => {
    const read = parseProgress(valid)!;
    expect(read.progress.xp).toBe(0);
    const written = roundTrip(serializeProgress({ ...read.progress, xp: 66 }, read.carry));
    expect(written).toEqual({ ...valid, v: 2, xp: 66 });
    expect(parseProgress120(written)?.progress.xp).toBe(66);
    expect(parseProgress(written)?.progress).toEqual({ ...read.progress, xp: 66 });
  });
});

// Los rechazos de GDD §13 («Se rechazan»), además de los de la v: 2: el puente rechaza lo mismo que la 1.3 (AC-220 a)
const ships3 = V3_FULL.ships;
const v3Corrupt: [string, unknown][] = [
  ['una v: 3 con upgrades', { ...V3_FULL, upgrades: lv(1, 1, 1) }],
  ['una v: 3 con ownedShips', { ...V3_FULL, ownedShips: ['sloop'] }],
  ...['gold', 'xp', 'ships', 'activeShip', 'families', 'family'].map((key): [string, unknown] => [`una v: 3 sin ${key}`, omit(V3_FULL, key)]),
  ['una v: 3 con una clave de más', { ...V3_FULL, hp: 100 }],
  ['oro negativo', { ...V3_FULL, gold: -1 }],
  ['oro con decimales', { ...V3_FULL, gold: 1.5 }],
  ['oro como texto', { ...V3_FULL, gold: '4321' }],
  ['oro por encima del tope', { ...V3_FULL, gold: GOLD_CAP + 1 }],
  ['xp negativa', { ...V3_FULL, xp: -1 }],
  ['xp con decimales', { ...V3_FULL, xp: 1.5 }],
  ['xp por encima del tope', { ...V3_FULL, xp: XP_CAP + 1 }],
  ['xp como texto', { ...V3_FULL, xp: '2500' }],
  ['xp nula', { ...V3_FULL, xp: null }],
  ['ships vacío', { ...V3_FULL, ships: {} }],
  ['ships como lista', { ...V3_FULL, ships: [lv(1, 1, 1)] }],
  ['ships nulo', { ...V3_FULL, ships: null }],
  ['ships como texto', { ...V3_FULL, ships: 'sloop' }],
  ['un barco fuera de los 5 ids', { ...V3_FULL, ships: { ...ships3, galleon: lv(1, 1, 1) } }],
  ['el id de ux del Bergantín', { ...V3_FULL, ships: { ...ships3, brigantine: lv(1, 1, 1) } }],
  ['un barco de PNJ', { ...V3_FULL, ships: { ...ships3, captain: lv(1, 1, 1) } }],
  ['un barco sin un eje', { ...V3_FULL, ships: { ...ships3, sloop: { cannons: 3, hull: 1 } } }],
  ['un barco con un eje de más', { ...V3_FULL, ships: { ...ships3, sloop: { ...lv(3, 1, 2), mast: 1 } } }],
  ['un nivel 0', { ...V3_FULL, ships: { ...ships3, line: lv(0, 1, 1) } }],
  ['un nivel 4', { ...V3_FULL, ships: { ...ships3, schooner: lv(1, 4, 1) } }],
  ['un nivel con decimales', { ...V3_FULL, ships: { ...ships3, frigate: lv(1, 1, 1.5) } }],
  ['un nivel como texto', { ...V3_FULL, ships: { ...ships3, brig: { cannons: '2', hull: 3, sails: 1 } } }],
  ['un nivel nulo', { ...V3_FULL, ships: { ...ships3, brig: { cannons: null, hull: 3, sails: 1 } } }],
  ['un barco que no es un objeto', { ...V3_FULL, ships: { ...ships3, sloop: 3 } }],
  ['un barco como lista', { ...V3_FULL, ships: { ...ships3, sloop: [3, 1, 2] } }],
  ['activeShip que no es clave de ships', { ...V3_AC220, activeShip: 'brig' }],
  ['activeShip desconocido', { ...V3_FULL, activeShip: 'galleon' }],
  ['activeShip heredado del prototipo', { ...V3_FULL, activeShip: 'toString' }],
  ['activeShip como número', { ...V3_FULL, activeShip: 3 }],
  ['activeShip nulo', { ...V3_FULL, activeShip: null }],
  ['families que no es una lista', { ...V3_FULL, families: 'es' }],
  ['families como objeto', { ...V3_FULL, families: { es: true }, family: 'none' }],
  ['families nula', { ...V3_FULL, families: null, family: 'none' }],
  ['families con un id fuera de gb y es', { ...V3_FULL, families: ['gb', 'fr'], family: 'gb' }],
  ['families con "none"', { ...V3_FULL, families: ['none'], family: 'none' }],
  ['families con el id en mayúsculas', { ...V3_FULL, families: ['ES'], family: 'none' }],
  ['families con repetidos', { ...V3_FULL, families: ['es', 'es'] }],
  ['family que no está en families', { ...V3_FULL, families: ['gb'], family: 'es' }],
  ['family con families vacía', { ...V3_FULL, families: [], family: 'gb' }],
  ['family desconocida', { ...V3_FULL, family: 'fr' }],
  ['family nula', { ...V3_FULL, family: null }],
  ['family como lista', { ...V3_FULL, family: ['es'] }],
  ['una v: 2 con ships', { ...v2, ships: ships3 }],
  ['una v: 2 con families', { ...v2, families: [] }],
  ['una v: 2 con family', { ...v2, family: 'none' }],
  ['una v: 1 con ships', { ...valid, ships: ships3 }],
  ['una v: 1 con families', { ...valid, families: [] }],
  ['una v: 1 con family', { ...valid, family: 'none' }],
  ['v: 4', { ...V3_FULL, v: 4 }],
  ['v como texto ("3")', { ...V3_FULL, v: '3' }]
];

test.each(v3Corrupt)('se rechaza %s, igual que en la 1.3', (_label, raw) => {
  expect(parseProgress(raw)).toBeNull();
  expect(parseProgress13(raw)).toBeNull();
});

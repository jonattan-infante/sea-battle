// Registro de progreso (AC-97): parser estricto, como protocol.ts. Un registro que no pasa no se usa ni se sobrescribe
// (AC-131): oro entero ≥ 0, niveles entre 1 y 3, y el barco activo entre los que posee
import { GOLD_CAP } from '../../src/game/constants';
import { parseProgress, progressKey, serializeProgress } from '../progress';

const valid = { v: 1, gold: 750, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig' };
const progress = { gold: 750, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'brig'], activeShip: 'brig' };

test('un registro válido se lee tal cual', () => {
  expect(parseProgress(valid)).toEqual(progress);
});

test('serializar y leer devuelve el mismo progreso', () => {
  expect(parseProgress(JSON.parse(JSON.stringify(serializeProgress(progress as never))))).toEqual(progress);
});

test('los barcos en propiedad se leen en el orden del astillero', () => {
  expect(parseProgress({ ...valid, ownedShips: ['frigate', 'sloop'], activeShip: 'sloop' })?.ownedShips).toEqual(['sloop', 'frigate']);
});

test('la huella no depende del orden de las claves', () => {
  const a = parseProgress(valid)!;
  const b = parseProgress({ activeShip: 'brig', ownedShips: ['sloop', 'brig'], upgrades: { sails: 1, hull: 1, cannons: 2 }, gold: 750, v: 1 })!;
  expect(progressKey(a)).toBe(progressKey(b));
  expect(progressKey({ ...a, gold: 751 })).not.toBe(progressKey(a));
});

test.each([
  ['nulo', null],
  ['un array', [valid]],
  ['un texto', JSON.stringify(valid)],
  ['sin versión', { ...valid, v: undefined }],
  ['otra versión', { ...valid, v: 2 }],
  ['un campo de más', { ...valid, hp: 100 }],
  ['oro negativo', { ...valid, gold: -1 }],
  ['oro con decimales', { ...valid, gold: 1.5 }],
  ['oro como texto', { ...valid, gold: '750' }],
  ['oro por encima del tope', { ...valid, gold: GOLD_CAP + 1 }],
  ['sin mejoras', { ...valid, upgrades: undefined }],
  ['una mejora de menos', { ...valid, upgrades: { cannons: 2, hull: 1 } }],
  ['una mejora desconocida', { ...valid, upgrades: { cannons: 2, hull: 1, sails: 1, mast: 1 } }],
  ['nivel 0', { ...valid, upgrades: { cannons: 0, hull: 1, sails: 1 } }],
  ['nivel 4', { ...valid, upgrades: { cannons: 4, hull: 1, sails: 1 } }],
  ['nivel con decimales', { ...valid, upgrades: { cannons: 1.5, hull: 1, sails: 1 } }],
  ['sin barcos', { ...valid, ownedShips: [], activeShip: 'sloop' }],
  ['barcos que no son lista', { ...valid, ownedShips: 'sloop' }],
  ['un barco repetido', { ...valid, ownedShips: ['sloop', 'sloop'], activeShip: 'sloop' }],
  ['un barco desconocido', { ...valid, ownedShips: ['sloop', 'galleon'], activeShip: 'sloop' }],
  ['un barco de PNJ', { ...valid, ownedShips: ['sloop', 'captain'], activeShip: 'sloop' }],
  ['barco activo que no posee', { ...valid, activeShip: 'frigate' }],
  ['barco activo desconocido', { ...valid, activeShip: 'galleon' }]
])('se rechaza un registro con %s', (_label, raw) => {
  expect(parseProgress(raw)).toBeNull();
});

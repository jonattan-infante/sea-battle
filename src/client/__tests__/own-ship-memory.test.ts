// Opción A de AC-193 c (BACKLOG :1745): el último barco propio, por jugador, en el navegador: su clase y su familia (1.3,
// AC-227). Con ellos se predice qué GLB pedir antes de la bienvenida; sin nada guardado, el jugador es nuevo y sale con la
// Balandra sin familia, que no tiene GLB
import { predictedShip, rememberShip } from '../own-ship-memory';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: jest.fn((k: string, v: string) => void m.set(k, v)) };
};
const none = (classId: string) => ({ classId, family: 'none' });

describe('opción A de AC-193 c: el barco propio que se predice antes de la bienvenida', () => {
  test('sin nada guardado, la Balandra sin familia; después, el último barco de cada jugador, sin mezclarlos ni volver a escribir el mismo', () => {
    const s = memoryStorage();
    expect(predictedShip('guest:a', s)).toEqual(none('sloop'));
    rememberShip('guest:a', 'frigate', 'gb', s);
    rememberShip('guest:a', 'frigate', 'gb', s);
    expect([predictedShip('guest:a', s), predictedShip('guest:b', s), s.setItem.mock.calls]).toEqual([
      { classId: 'frigate', family: 'gb' },
      none('sloop'),
      [['sea-battle-last-ship:guest:a', 'frigate:gb']]
    ]);
    rememberShip('guest:a', 'frigate', 'none', s); // volver a «sin familia» también se guarda
    expect(predictedShip('guest:a', s)).toEqual(none('frigate'));
  });

  // AC-226 (d): en la 1.3 ya no hay interruptor de la Goleta y el Navío, así que se predicen las 5 clases (antes, solo las 3
  // que existían siempre, BACKLOG :1821). Un valor de la 1.2, sin familia («frigate»), es ese barco sin familia: la fila de la
  // 1.2 entra sin familia (AC-229 b). Con cualquier otro valor no se predice nada y se espera a la bienvenida
  test('las 5 clases, con su familia o sin ella (el valor de la 1.2); con un valor que no es un barco, nada', () => {
    const s = memoryStorage();
    const saved = (value: string) => (s.m.set('sea-battle-last-ship:guest:a', value), predictedShip('guest:a', s));
    expect(['sloop', 'brig', 'schooner', 'frigate', 'line'].map(saved)).toEqual(['sloop', 'brig', 'schooner', 'frigate', 'line'].map(none));
    expect(['sloop:gb', 'schooner:es', 'line:none'].map(saved)).toEqual([
      { classId: 'sloop', family: 'gb' },
      { classId: 'schooner', family: 'es' },
      none('line')
    ]);
    expect(['merchant', '', 'line:fr', 'line:gb:es', 'captain:gb', ':gb'].map(saved)).toEqual([null, null, null, null, null, null]);
  });

  test('un almacenamiento que falla o no existe da la Balandra sin familia sin lanzar', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    };
    expect(predictedShip('guest:a', broken)).toEqual(none('sloop'));
    expect(() => rememberShip('guest:a', 'brig', 'es', broken)).not.toThrow();
    expect([predictedShip('guest:a', null), predictedShip('guest:a')]).toEqual([none('sloop'), none('sloop')]); // en Jest no hay window
  });
});

// Opción A de AC-193 c (BACKLOG :1745): la última clase del barco propio, por jugador, en el navegador. Con ella se predice
// qué GLB pedir antes de la bienvenida; sin ella, el jugador es nuevo y sale con la Balandra
import { predictedShip, rememberShip } from '../own-ship-memory';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: jest.fn((k: string, v: string) => void m.set(k, v)) };
};

describe('opción A de AC-193 c: la clase propia que se predice antes de la bienvenida', () => {
  test('sin nada guardado, la Balandra; después, la última clase de cada jugador, sin mezclarlos ni volver a escribir la misma', () => {
    const s = memoryStorage();
    expect(predictedShip('guest:a', s)).toBe('sloop');
    rememberShip('guest:a', 'frigate', s);
    rememberShip('guest:a', 'frigate', s);
    expect([predictedShip('guest:a', s), predictedShip('guest:b', s), s.setItem.mock.calls]).toEqual(['frigate', 'sloop', [['sea-battle-last-ship:guest:a', 'frigate']]]);
  });

  // Punto 3 de dev-render (BACKLOG :1821): solo se predicen las clases que existen siempre, porque la predicción va antes de
  // la bienvenida y no conoce los interruptores. Con cualquier otro valor guardado (la Goleta o el Navío de AC-201, o uno que
  // no es una clase) no se predice nada y se espera a la bienvenida; sin nada guardado, el jugador es nuevo y acierta con la
  // Balandra. 'schooner' y 'line' son los ids de GDD §13 (AC-179)
  test('con la Balandra, el Bergantín o la Fragata guardados se predice esa clase; con cualquier otro valor (la Goleta, el Navío o uno que no es una clase), nada', () => {
    const s = memoryStorage();
    const saved = (value: string) => (s.m.set('sea-battle-last-ship:guest:a', value), predictedShip('guest:a', s));
    expect([predictedShip('guest:a', s), ...['sloop', 'brig', 'frigate', 'schooner', 'line', 'merchant', ''].map(saved)]).toEqual(['sloop', 'sloop', 'brig', 'frigate', null, null, null, null]);
  });

  test('un almacenamiento que falla o no existe da la Balandra sin lanzar', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    };
    expect(predictedShip('guest:a', broken)).toBe('sloop');
    expect(() => rememberShip('guest:a', 'brig', broken)).not.toThrow();
    expect([predictedShip('guest:a', null), predictedShip('guest:a')]).toEqual(['sloop', 'sloop']); // en Jest no hay window
  });
});

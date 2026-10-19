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

  test('un valor que no es una clase del jugador, o un almacenamiento que falla o no existe, dan la Balandra sin lanzar', () => {
    const s = memoryStorage();
    s.m.set('sea-battle-last-ship:guest:a', 'merchant');
    expect(predictedShip('guest:a', s)).toBe('sloop');
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

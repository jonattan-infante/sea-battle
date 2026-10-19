// AC-127 (QA-5 O-3): un aviso con el mismo texto que uno visible no se apila; se queda en su sitio y su vida se
// reinicia desde la última emisión. Los textos distintos siguen apilándose hasta MAX_TOASTS.
import { ACHIEVEMENT_MS, MAX_TOASTS, TOAST_MS, useHud } from '../hud-store';

const A = 'El puerto solo abre en la zona segura';
const B = 'Oro insuficiente';
const texts = () => useHud.getState().toasts.map((t) => t.text);

beforeEach(() => {
  jest.useFakeTimers();
  useHud.setState({ toasts: [] });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('AC-127: avisos que no se duplican', () => {
  test('A, A, A y B dan 2 avisos; A conserva su sitio y caduca a TOAST_MS de la 3.ª emisión', () => {
    const { pushToast } = useHud.getState();
    pushToast('warn', A);
    const first = useHud.getState().toasts[0].id;
    jest.advanceTimersByTime(1000);
    pushToast('warn', A);
    jest.advanceTimersByTime(1000);
    pushToast('warn', A); // t = 2000
    jest.advanceTimersByTime(500);
    pushToast('info', B); // t = 2500
    expect(texts()).toEqual([A, B]);
    expect(useHud.getState().toasts[0].id).toBe(first); // misma posición y misma clave: no se vuelve a montar

    jest.advanceTimersByTime(TOAST_MS - 501); // t = 2000 + TOAST_MS − 1
    expect(texts()).toEqual([A, B]);
    jest.advanceTimersByTime(1); // t = 2000 + TOAST_MS
    expect(texts()).toEqual([B]);
    jest.advanceTimersByTime(500); // t = 2500 + TOAST_MS
    expect(texts()).toEqual([]);
  });

  test('repetir un aviso idéntico no cambia el estado (cero commits de React)', () => {
    const { pushToast } = useHud.getState();
    pushToast('warn', A);
    const before = useHud.getState().toasts;
    pushToast('warn', A);
    expect(useHud.getState().toasts).toBe(before);
  });

  test('textos distintos siguen apilándose hasta MAX_TOASTS', () => {
    const { pushToast } = useHud.getState();
    for (let i = 0; i <= MAX_TOASTS; i++) pushToast('info', `aviso ${i}`);
    expect(texts()).toEqual(Array.from({ length: MAX_TOASTS }, (_, i) => `aviso ${i + 1}`));
  });
});

// AC-151 (ART-DIRECTION §12.9): el aviso de subida de nivel es un toast de logro de 5 s con la insignia del rango en
// lugar del icono. Va en la misma pila (≤ 3) y los demás avisos siguen durando 3,5 s
describe('AC-151: aviso de subida de nivel', () => {
  test('dura ACHIEVEMENT_MS (5 s) y lleva su insignia', () => {
    const { pushToast } = useHud.getState();
    pushToast('achievement', '¡Nivel 5! Ahora eres Marinero', 2);
    expect(ACHIEVEMENT_MS).toBe(5000);
    expect(useHud.getState().toasts).toEqual([{ id: expect.any(Number), kind: 'achievement', text: '¡Nivel 5! Ahora eres Marinero', rank: 2 }]);
    jest.advanceTimersByTime(ACHIEVEMENT_MS - 1);
    expect(texts()).toEqual(['¡Nivel 5! Ahora eres Marinero']);
    jest.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  test('un aviso genérico emitido a la vez sigue durando TOAST_MS', () => {
    const { pushToast } = useHud.getState();
    pushToast('achievement', '¡Nivel 4!', 1);
    pushToast('warn', A);
    jest.advanceTimersByTime(TOAST_MS);
    expect(texts()).toEqual(['¡Nivel 4!']);
    jest.advanceTimersByTime(ACHIEVEMENT_MS - TOAST_MS);
    expect(texts()).toEqual([]);
  });

  test('cuenta en el máximo de MAX_TOASTS: el más viejo sale', () => {
    const { pushToast } = useHud.getState();
    for (let i = 0; i < MAX_TOASTS; i++) pushToast('info', `aviso ${i}`);
    pushToast('achievement', '¡Nivel 9! Ahora eres Contramaestre', 3);
    expect(texts()).toEqual([...Array.from({ length: MAX_TOASTS - 1 }, (_, i) => `aviso ${i + 1}`), '¡Nivel 9! Ahora eres Contramaestre']);
  });
});

// AC-152: la línea del feed guarda su recompensa por partes, para pintar el nombre truncable y la XP en su color
describe('AC-152: línea de recompensa del feed', () => {
  test('pushFeed guarda la recompensa junto al texto, y sin recompensa la línea es la de siempre', () => {
    useHud.setState({ feed: [] });
    const { pushFeed } = useHud.getState();
    pushFeed('gold', 'Hundiste a Pirata +105 oro · +30 XP', { lead: 'Hundiste a', name: 'Pirata', gold: 105, xp: 30 });
    pushFeed('danger', 'Barbarroja te hundió');
    expect(useHud.getState().feed).toEqual([
      { id: expect.any(Number), tone: 'gold', text: 'Hundiste a Pirata +105 oro · +30 XP', reward: { lead: 'Hundiste a', name: 'Pirata', gold: 105, xp: 30 } },
      { id: expect.any(Number), tone: 'danger', text: 'Barbarroja te hundió' }
    ]);
  });
});

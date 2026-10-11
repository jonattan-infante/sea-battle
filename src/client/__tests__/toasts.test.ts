// AC-127 (QA-5 O-3): un aviso con el mismo texto que uno visible no se apila; se queda en su sitio y su vida se
// reinicia desde la última emisión. Los textos distintos siguen apilándose hasta MAX_TOASTS.
import { MAX_TOASTS, TOAST_MS, useHud } from '../hud-store';

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

// AC-132 (D50, ART-DIRECTION §12.5): aviso persistente «Progreso sin guardar, reintentando…». Aparece en cuanto llega el
// estado del servidor, se queda al menos 3 s y, al confirmarse la escritura, se quita y sale «Progreso guardado». No es un
// toast: no caduca ni cuenta en MAX_TOASTS. Mientras se ve, Puerto no abre y explica por qué (§12.4)
import { portBlock, SHOP_UNAVAILABLE } from '../hud-logic';
import { MAX_TOASTS, resetSaveWarning, SAVE_WARNING_HOLD_MS, SAVE_WARNING_MIN_MS, SAVED_TEXT, syncUnsaved, useHud } from '../hud-store';

const warning = () => useHud.getState().saveWarning;
const texts = () => useHud.getState().toasts.map((t) => t.text);

beforeEach(() => {
  jest.useFakeTimers();
  resetSaveWarning();
  useHud.setState({ toasts: [] });
});

afterEach(() => {
  resetSaveWarning();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('AC-132: aviso persistente de guardado', () => {
  test('aparece en la misma llamada en que llega unsaved y no caduca como un toast', () => {
    syncUnsaved(true, 0);
    expect(warning()).toBe(true);
    jest.advanceTimersByTime(60_000); // AD-34 b: sigue visible a los 60 s de corte
    expect(warning()).toBe(true);
    expect(texts()).toEqual([]);
  });

  test('si la BD vuelve antes de 3 s, se queda hasta los 3 s (más el margen del commit) y entonces sale «Progreso guardado»', () => {
    expect(SAVE_WARNING_HOLD_MS).toBeGreaterThanOrEqual(SAVE_WARNING_MIN_MS);
    expect(SAVE_WARNING_HOLD_MS).toBeLessThanOrEqual(SAVE_WARNING_MIN_MS + 100);
    syncUnsaved(true, 0);
    jest.advanceTimersByTime(1000);
    syncUnsaved(false, 1000);
    jest.advanceTimersByTime(SAVE_WARNING_HOLD_MS - 1000 - 1);
    expect(warning()).toBe(true);
    expect(texts()).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(warning()).toBe(false);
    expect(useHud.getState().toasts).toEqual([expect.objectContaining({ kind: 'ok', text: SAVED_TEXT })]);
  });

  test('si la BD vuelve pasados 3 s, se quita en la misma llamada', () => {
    syncUnsaved(true, 0);
    syncUnsaved(false, 5000);
    expect(warning()).toBe(false);
    expect(texts()).toEqual([SAVED_TEXT]);
  });

  test('un nuevo corte dentro de los 3 s anula la salida; los 3 s cuentan desde que apareció', () => {
    syncUnsaved(true, 0);
    syncUnsaved(false, 1000);
    syncUnsaved(true, 2000);
    jest.advanceTimersByTime(10_000);
    expect(warning()).toBe(true);
    expect(texts()).toEqual([]);
    syncUnsaved(false, 12_000);
    expect(warning()).toBe(false);
    expect(texts()).toEqual([SAVED_TEXT]);
  });

  test('sin corte, unsaved = false no saca «Progreso guardado»', () => {
    syncUnsaved(false, 0);
    expect(warning()).toBe(false);
    expect(texts()).toEqual([]);
  });

  test('repetir el mismo estado no cambia el store (cero commits de React)', () => {
    syncUnsaved(true, 0);
    const before = useHud.getState();
    syncUnsaved(true, 100);
    expect(useHud.getState()).toBe(before);
    syncUnsaved(false, 1000);
    const pending = useHud.getState();
    syncUnsaved(false, 1100); // la salida ya está programada: no se programa otra
    expect(useHud.getState()).toBe(pending);
    jest.advanceTimersByTime(SAVE_WARNING_HOLD_MS);
    expect(texts()).toEqual([SAVED_TEXT]);
  });

  test('no cuenta en el máximo de 3 toasts ni sale por cupo', () => {
    syncUnsaved(true, 0);
    const { pushToast } = useHud.getState();
    for (let i = 0; i <= MAX_TOASTS; i++) pushToast('info', `aviso ${i}`);
    expect(warning()).toBe(true);
    expect(useHud.getState().toasts).toHaveLength(MAX_TOASTS);
  });
});

describe('AC-132: Puerto con la BD caída', () => {
  const inPort = { state: 'alive' as const, inSafeZone: true };
  const atSea = { state: 'alive' as const, inSafeZone: false };

  test('con el aviso visible, Puerto no abre y saca el toast de peligro de AC-132, también fuera de la zona', () => {
    for (const me of [inPort, atSea]) {
      expect(portBlock(me, true)).toEqual({ title: SHOP_UNAVAILABLE, toast: { kind: 'danger', text: SHOP_UNAVAILABLE } });
    }
  });

  test('sin corte, fuera de la zona sigue el aviso de AC-66 y dentro abre', () => {
    expect(portBlock(atSea, false)).toEqual({ title: 'Solo en la zona segura', toast: { kind: 'warn', text: 'El puerto solo abre en la zona segura' } });
    expect(portBlock({ state: 'sinking', inSafeZone: true }, false)?.toast.kind).toBe('warn');
    expect(portBlock(inPort, false)).toBeNull();
  });
});

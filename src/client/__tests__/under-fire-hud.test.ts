// H-2005 y la parte de cliente de AC-253 (E20; ART-DIRECTION «Zona segura bajo fuego (1.3)», D120 a D128): el estado del
// hueco de aviso, la cuenta, el motivo del botón Puerto y el aviso que sustituye al anterior de su tipo
import { UNDER_FIRE_WINDOW } from '../../game/constants';
import { PORT_UNDER_FIRE_TEXT } from '../../game/world';
import {
  isPortUnderFireText,
  PORT_FIRE_TOAST_KEY,
  portBlock,
  portBlockReason,
  portUnderFireText,
  SHOP_UNAVAILABLE,
  underFireSeconds,
  zoneSlotOf
} from '../hud-logic';
import { TOAST_MS, useHud } from '../hud-store';

type Me = { state: 'alive' | 'sinking' | 'dead'; inSafeZone: boolean; underFireMark: boolean };
const me = (state: Me['state'], inSafeZone: boolean, underFireMark: boolean): Me => ({ state, inSafeZone, underFireMark });

describe('D120: el hueco de aviso enseña una sola fila', () => {
  test.each<[string, Me | null, ReturnType<typeof zoneSlotOf>]>([
    ['sin barco', null, 'none'],
    ['vivo, fuera y sin marca', me('alive', false, false), 'none'],
    ['vivo, fuera y bajo fuego: la píldora', me('alive', false, true), 'pill'],
    ['vivo, dentro y sin marca: «Zona segura»', me('alive', true, false), 'protected'],
    ['vivo, dentro y bajo fuego: «no te protege»', me('alive', true, true), 'under-fire'],
    ['hundiéndose dentro y bajo fuego', me('sinking', true, true), 'none'],
    ['hundido fuera y bajo fuego', me('dead', false, true), 'none']
  ])('%s', (_label, m, slot) => {
    expect(zoneSlotOf(m)).toBe(slot);
  });
});

describe('D128: la cuenta es ceil(uf − serverTime), de 10 a 1', () => {
  test.each([
    [20, 10.05, 10],
    [20, 12.3, 8],
    [20, 19.0, 1],
    [20, 19.95, 1],
    [20, 20, 1], // caducada, hasta que el HUD cambia de estado (≤ 100 ms): nunca 0
    [20, 9.5, 10] // reloj del cliente un poco por detrás: nunca 11
  ])('uf %d y serverTime %d → %d', (until, now, n) => {
    expect(underFireSeconds(until, now)).toBe(n);
  });
});

describe('D125: el texto del motivo', () => {
  test('con N = 10 es el del rechazo del servidor (world.ts), y se reconoce con cualquier N', () => {
    expect(portUnderFireText(UNDER_FIRE_WINDOW)).toBe(PORT_UNDER_FIRE_TEXT);
    expect(portUnderFireText(7)).toBe('Bajo fuego: el puerto abre tras 7 s sin disparos');
    expect(isPortUnderFireText(portUnderFireText(7))).toBe(true);
    expect(isPortUnderFireText(PORT_UNDER_FIRE_TEXT)).toBe(true);
    expect(isPortUnderFireText('El puerto solo abre en la zona segura')).toBe(false);
  });
});

describe('D124: el motivo del botón Puerto (data-port-block), por prioridad', () => {
  test.each<[string, Me | null, boolean, ReturnType<typeof portBlockReason>]>([
    ['BD caída, dentro y bajo fuego', me('alive', true, true), true, 'unsaved'],
    ['BD caída, fuera', me('alive', false, false), true, 'unsaved'],
    ['fuera y bajo fuego: manda la zona', me('alive', false, true), false, 'zone'],
    ['fuera y sin marca', me('alive', false, false), false, 'zone'],
    ['hundiéndose dentro', me('sinking', true, false), false, 'zone'],
    ['dentro y bajo fuego', me('alive', true, true), false, 'under-fire'],
    ['dentro y sin marca: abre', me('alive', true, false), false, null]
  ])('%s', (_label, m, unsaved, reason) => {
    expect(portBlockReason(m, unsaved)).toBe(reason);
  });

  test('bajo fuego: title fijo con 10 s y aviso de peligro con la llama y la N del momento', () => {
    expect(portBlock(me('alive', true, true), false, 7)).toEqual({
      title: 'Bajo fuego: el puerto abre tras 10 s sin disparos',
      toast: { kind: 'danger', text: 'Bajo fuego: el puerto abre tras 7 s sin disparos', fire: true }
    });
    // Los de antes no cambian
    expect(portBlock(me('alive', false, true), false, 7)).toEqual({ title: 'Solo en la zona segura', toast: { kind: 'warn', text: 'El puerto solo abre en la zona segura' } });
    expect(portBlock(me('alive', true, true), true, 7)).toEqual({ title: SHOP_UNAVAILABLE, toast: { kind: 'danger', text: SHOP_UNAVAILABLE } });
  });
});

describe('D125: el aviso del puerto bajo fuego sustituye al anterior de su tipo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useHud.setState({ toasts: [] });
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const push = (n: number) => useHud.getState().pushToast('danger', portUnderFireText(n), undefined, { key: PORT_FIRE_TOAST_KEY, fire: true });

  test('7 s y luego 5 s dan un solo aviso, con el texto nuevo, en su sitio y con la vida reiniciada', () => {
    push(7);
    const first = useHud.getState().toasts[0];
    expect(first).toMatchObject({ kind: 'danger', text: portUnderFireText(7), key: PORT_FIRE_TOAST_KEY, fire: true });
    jest.advanceTimersByTime(2000);
    push(5);
    expect(useHud.getState().toasts).toHaveLength(1);
    expect(useHud.getState().toasts[0]).toMatchObject({ id: first.id, text: portUnderFireText(5) });
    jest.advanceTimersByTime(TOAST_MS - 1);
    expect(useHud.getState().toasts).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(useHud.getState().toasts).toHaveLength(0);
  });

  test('el rechazo del servidor (N = 10) también sustituye al de la pulsación, y los otros avisos se apilan aparte', () => {
    push(4);
    useHud.getState().pushToast('warn', 'El puerto solo abre en la zona segura');
    push(10);
    expect(useHud.getState().toasts.map((t) => t.text)).toEqual([portUnderFireText(10), 'El puerto solo abre en la zona segura']);
  });
});

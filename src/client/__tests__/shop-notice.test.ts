// El aviso dentro del Astillero (O-48; ART-DIRECTION §14, «Avisos con el Astillero abierto») y la familia que espera al
// servidor (D101, «Estado»), en el store del HUD: uno a la vez, 3,5 s, se va al cerrar, y la familia vuelve sola a los 5 s
import { PlayerView } from '../../game/types';
import { SHOP_UNAVAILABLE } from '../hud-logic';
import { familyArrived, noticeArrived, startFamilyIntent, syncUnsaved, resetSaveWarning, TOAST_MS, useHud } from '../hud-store';
import { FAMILY_BUY_FAILED, FAMILY_SELECT_FAILED, FAMILY_TIMEOUT_MS } from '../shop-logic';

const shop = () => useHud.getState().shopNotice;
const toasts = () => useHud.getState().toasts.map((t) => t.text);
const player = (family: PlayerView['family'], families: PlayerView['families'] = ['gb']) => ({ family, families }) as PlayerView;

beforeEach(() => {
  jest.useFakeTimers();
  resetSaveWarning();
  useHud.setState({ toasts: [], shopOpen: true, shopNotice: null, familyIntent: null, saveWarning: false });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('O-48: con el Astillero abierto, los avisos salen dentro', () => {
  test('uno a la vez: el nuevo sustituye al que hay y reinicia los 3,5 s; nada pasa a la columna del HUD', () => {
    noticeArrived({ kind: 'info', text: 'Compra realizada' });
    expect(shop()).toMatchObject({ kind: 'ok', text: 'Compra realizada' });
    jest.advanceTimersByTime(2000);
    noticeArrived({ kind: 'error', text: 'Ya tienes ese barco' });
    expect(shop()).toMatchObject({ kind: 'danger', text: 'Ya tienes ese barco' });
    jest.advanceTimersByTime(TOAST_MS - 1);
    expect(shop()?.text).toBe('Ya tienes ese barco');
    jest.advanceTimersByTime(1);
    expect(shop()).toBeNull();
    expect(toasts()).toEqual([]);
  });

  test('con la tienda cerrada, la columna del HUD, como antes', () => {
    useHud.setState({ shopOpen: false });
    noticeArrived({ kind: 'info', text: 'Compra realizada' });
    expect([shop(), toasts()]).toEqual([null, ['Compra realizada']]);
  });

  test('al cerrar el Astillero el aviso se va con él y no pasa a la columna', () => {
    noticeArrived({ kind: 'info', text: 'Compra realizada' });
    useHud.getState().setShopOpen(false);
    expect([shop(), toasts()]).toEqual([null, []]);
  });

  test('si aparece la franja de «Guardado no disponible», el aviso con su mismo texto se quita', () => {
    noticeArrived({ kind: 'error', text: SHOP_UNAVAILABLE });
    expect(shop()?.text).toBe(SHOP_UNAVAILABLE);
    syncUnsaved(true);
    expect(shop()).toBeNull();
    noticeArrived({ kind: 'error', text: SHOP_UNAVAILABLE }); // con la franja, no vuelve
    expect(shop()).toBeNull();
  });
});

describe('D101: la familia que espera al servidor', () => {
  test('la compra: «Compra realizada» sale como el aviso de la familia, y el botón vuelve', () => {
    startFamilyIntent({ kind: 'buy', family: 'gb' });
    expect(useHud.getState().familyIntent).toEqual({ kind: 'buy', family: 'gb' });
    familyArrived(player('gb')); // el estado llega antes que el aviso, en el mismo frame
    expect(useHud.getState().familyIntent).not.toBeNull();
    noticeArrived({ kind: 'info', text: 'Compra realizada' });
    expect([useHud.getState().familyIntent, shop()?.text]).toEqual([null, 'Tus barcos ahora son de la familia británica']);
  });

  test('el cambio: sin aviso del servidor, lo resuelve el estado con la familia nueva', () => {
    startFamilyIntent({ kind: 'select', family: 'none' });
    familyArrived(player('gb')); // aún la de antes
    expect(useHud.getState().familyIntent).not.toBeNull();
    familyArrived(player('none'));
    expect([useHud.getState().familyIntent, shop()]).toEqual([null, expect.objectContaining({ kind: 'ok', text: 'Tus barcos vuelven al aspecto de siempre' })]);
  });

  test('sin respuesta en 5 s, el botón vuelve con el aviso de error; una respuesta a tiempo cancela el plazo', () => {
    startFamilyIntent({ kind: 'buy', family: 'es' });
    jest.advanceTimersByTime(FAMILY_TIMEOUT_MS - 1);
    expect(useHud.getState().familyIntent).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect([useHud.getState().familyIntent, shop()?.text, shop()?.kind]).toEqual([null, FAMILY_BUY_FAILED, 'danger']);

    startFamilyIntent({ kind: 'select', family: 'gb' });
    familyArrived(player('gb'));
    expect(shop()?.text).toBe('Tus barcos ahora son de la familia británica');
    jest.advanceTimersByTime(FAMILY_TIMEOUT_MS); // el de éxito caduca a los 3,5 s y no sale el de error
    expect([shop(), useHud.getState().familyIntent]).toEqual([null, null]);
  });

  test('un rechazo del servidor da el aviso de error de la familia', () => {
    startFamilyIntent({ kind: 'select', family: 'es' });
    noticeArrived({ kind: 'error', text: 'No tienes esa familia' });
    expect([useHud.getState().familyIntent, shop()?.text]).toEqual([null, FAMILY_SELECT_FAILED]);
  });

  test('al cerrar el Astillero, la espera se olvida', () => {
    startFamilyIntent({ kind: 'buy', family: 'gb' });
    useHud.getState().setShopOpen(false);
    expect(useHud.getState().familyIntent).toBeNull();
    jest.advanceTimersByTime(FAMILY_TIMEOUT_MS);
    expect([shop(), toasts()]).toEqual([null, []]);
  });
});

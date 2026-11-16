// La tienda de la 1.3 (D103 y D101; ART-DIRECTION §14, «1.3: la tienda por barco» y «Pestaña Familia en la 1.3»): los textos
// que dependen del barco o de la familia, y el reparto de los avisos con el Astillero abierto (O-48), con la compra y el
// cambio de familia esperando al servidor (D101, «Estado»)
import { SHIP_CLASSES, SHIP_MIN_LEVEL } from '../../game/constants';
import { levelRequirement } from '../../game/xp';
import { SHOP_UNAVAILABLE } from '../hud-logic';
import {
  FAMILY_BUY_FAILED,
  FAMILY_NOTE,
  FAMILY_SELECT_FAILED,
  familyDoneText,
  familyResolved,
  FAMILY_TEXT,
  otherShipNotice,
  routeNotice,
  shipLevelLock,
  upgradesTitle
} from '../shop-logic';

describe('textos por barco (D103)', () => {
  test('«Mejoras de la …» o «Mejoras del …», con el artículo de cada barco', () => {
    expect(['sloop', 'brig', 'schooner', 'frigate', 'line'].map((c) => upgradesTitle(c as never))).toEqual([
      'Mejoras de la Balandra',
      'Mejoras del Bergantín',
      'Mejoras de la Goleta',
      'Mejoras de la Fragata',
      'Mejoras del Navío de línea'
    ]);
  });

  test('el aviso de otro barco nombra el que se navega, con su artículo', () => {
    expect(otherShipNotice('brig')).toBe('No es el barco que navegas. La mejora se le aplica igual, y sigues navegando el Bergantín.');
    expect(otherShipNotice('frigate')).toBe('No es el barco que navegas. La mejora se le aplica igual, y sigues navegando la Fragata.');
  });

  test('«Requiere nivel» es el texto del rechazo del servidor (AC-162), y solo hasta tener el nivel', () => {
    expect(SHIP_MIN_LEVEL).toEqual({ schooner: 5, line: 9 });
    expect(shipLevelLock('schooner', 4)).toEqual({ level: 5, rank: 2, text: 'Requiere nivel 5 (Marinero)' });
    expect(shipLevelLock('line', 8)).toEqual({ level: 9, rank: 3, text: 'Requiere nivel 9 (Contramaestre)' });
    expect(shipLevelLock('line', 8)!.text).toBe(levelRequirement(9));
    expect([shipLevelLock('schooner', 5), shipLevelLock('line', 9), shipLevelLock('frigate', 1), shipLevelLock('brig', 1)]).toEqual([null, null, null, null]);
    expect(SHIP_CLASSES.line.label).toBe('Navío de línea');
  });
});

describe('textos de la pestaña Familia (D101)', () => {
  test('3 tarjetas: «Sin familia», la británica y la española, con sus rasgos y sin partir los nombres propios', () => {
    expect(Object.keys(FAMILY_TEXT)).toEqual(['none', 'gb', 'es']);
    expect(FAMILY_TEXT.none).toEqual({ label: 'Sin familia', traits: 'El aspecto de siempre · gratis' });
    expect(FAMILY_TEXT.gb.traits).toBe('Casco azul marino · franjas blancas · Union Jack');
    expect(FAMILY_TEXT.es.traits).toBe('Casco rojo · franjas doradas · cruz de Borgoña');
    expect(FAMILY_NOTE).toBe('Una familia solo cambia el aspecto: la vida, la velocidad y los cañones son los mismos. Se compra una vez y vale para todos tus barcos, también los que compres después.');
  });

  test('los avisos de D94 y D101', () => {
    expect(familyDoneText('gb')).toBe('Tus barcos ahora son de la familia británica');
    expect(familyDoneText('es')).toBe('Tus barcos ahora son de la familia española');
    expect(FAMILY_BUY_FAILED).toBe('No se pudo comprar la familia. Inténtalo de nuevo.');
    expect(FAMILY_SELECT_FAILED).toBe('No se pudo cambiar la familia. Inténtalo de nuevo.');
  });
});

describe('avisos con el Astillero abierto (O-48) y la familia esperando al servidor (D101)', () => {
  const closed = { shopOpen: false, saveWarning: false, familyIntent: null };
  const open = { shopOpen: true, saveWarning: false, familyIntent: null };

  test('con la tienda cerrada, todo va a la columna del HUD, como antes', () => {
    expect(routeNotice({ kind: 'info', text: 'Compra realizada' }, closed)).toEqual({ to: 'toast', kind: 'ok', text: 'Compra realizada', clearIntent: false });
    expect(routeNotice({ kind: 'error', text: 'Necesitas 300 de oro' }, closed)).toEqual({ to: 'toast', kind: 'danger', text: 'Necesitas 300 de oro', clearIntent: false });
  });

  test('con la tienda abierta, todo aviso del servidor sale dentro del Astillero', () => {
    expect(routeNotice({ kind: 'info', text: 'Compra realizada' }, open)).toEqual({ to: 'shop', kind: 'ok', text: 'Compra realizada', clearIntent: false });
    expect(routeNotice({ kind: 'error', text: 'Ya tienes ese barco' }, open)).toEqual({ to: 'shop', kind: 'danger', text: 'Ya tienes ese barco', clearIntent: false });
  });

  test('con la franja de «Guardado no disponible», su mismo texto no sale además en el aviso', () => {
    expect(routeNotice({ kind: 'error', text: SHOP_UNAVAILABLE }, { ...open, saveWarning: true })).toEqual({ to: 'none', clearIntent: false });
    expect(routeNotice({ kind: 'error', text: SHOP_UNAVAILABLE }, open)).toEqual({ to: 'shop', kind: 'danger', text: SHOP_UNAVAILABLE, clearIntent: false });
  });

  test('comprar una familia: «Compra realizada» se cambia por el aviso de la familia (un aviso, no dos)', () => {
    const intent = { kind: 'buy' as const, family: 'gb' as const };
    expect(routeNotice({ kind: 'info', text: 'Compra realizada' }, { ...open, familyIntent: intent })).toEqual({ to: 'shop', kind: 'ok', text: 'Tus barcos ahora son de la familia británica', clearIntent: true });
  });

  test('si la compra o el cambio fallan, el aviso de error de la familia, sea cual sea el motivo del servidor', () => {
    for (const reason of ['Compra en curso', SHOP_UNAVAILABLE, 'Necesitas 4000 de oro']) {
      expect(routeNotice({ kind: 'error', text: reason }, { ...open, familyIntent: { kind: 'buy', family: 'es' } })).toEqual({ to: 'shop', kind: 'danger', text: FAMILY_BUY_FAILED, clearIntent: true });
      expect(routeNotice({ kind: 'error', text: reason }, { ...open, saveWarning: true, familyIntent: { kind: 'select', family: 'none' } })).toEqual({ to: 'shop', kind: 'danger', text: FAMILY_SELECT_FAILED, clearIntent: true });
    }
  });

  test('un cambio de familia no tiene aviso del servidor: lo resuelve el estado del jugador', () => {
    expect(familyResolved({ kind: 'select', family: 'none' }, { family: 'none', families: ['gb'] })).toBe(true);
    expect(familyResolved({ kind: 'select', family: 'gb' }, { family: 'none', families: ['gb'] })).toBe(false);
    // la compra se resuelve con su aviso, que llega en el mismo frame que el estado (routeNotice)
    expect(familyResolved({ kind: 'buy', family: 'gb' }, { family: 'gb', families: ['gb'] })).toBe(false);
    // un aviso informativo que no es el de la compra no la resuelve
    expect(routeNotice({ kind: 'info', text: 'El casco ya está intacto' }, { ...open, familyIntent: { kind: 'buy', family: 'gb' } })).toEqual({ to: 'shop', kind: 'ok', text: 'El casco ya está intacto', clearIntent: false });
  });
});

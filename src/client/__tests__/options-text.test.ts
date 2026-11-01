// Textos del panel de opciones y del HUD (E18, lámina D98): ningún texto nombra una tecla distinta de la asignada, y las
// flechas se escriben («flecha abajo») porque la Barlow no tiene ↑ ↓ ← → (AC-208)
import { DEFAULT_BINDINGS, keyText } from '../key-bindings';
import { ACTION_NAMES, noticeText } from '../options-text';

describe('Texto de una tecla (AC-208)', () => {
  test('las flechas se escriben; las letras y los números, su etiqueta', () => {
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyC', 'Digit5'].map((c) => keyText(c))).toEqual([
      'flecha arriba',
      'flecha abajo',
      'flecha izquierda',
      'flecha derecha',
      'C',
      '5'
    ]);
  });

  test('las letras siguen la distribución del jugador', () => {
    expect(keyText('KeyW', new Map([['KeyW', 'z']]))).toBe('Z');
  });
});

describe('Avisos del panel (AC-209, lámina D98)', () => {
  test('el intercambio de la lámina: «S era de Detener: Detener pasa a la flecha abajo.»', () => {
    expect(noticeText({ kind: 'swap', action: 'viewDown', code: 'KeyS', other: 'stop', otherCode: 'ArrowDown' })).toBe('S era de Detener: Detener pasa a la flecha abajo.');
  });

  test('el intercambio nombra las teclas asignadas, también cuando la pulsada es una flecha', () => {
    expect(noticeText({ kind: 'swap', action: 'stop', code: 'ArrowUp', other: 'viewUp', otherCode: 'KeyS' })).toBe('La flecha arriba era de Vista arriba: Vista arriba pasa a la S.');
  });

  test('con números: «5 era de Detener: Detener pasa al 7.» (§20.4)', () => {
    expect(noticeText({ kind: 'swap', action: 'viewUp', code: 'Digit5', other: 'stop', otherCode: 'Digit7' })).toBe('5 era de Detener: Detener pasa al 7.');
  });

  test('la tecla de una acción fija dice de cuál es, con los nombres de la barra, «Aceptar» y «Niveles» (AC-209)', () => {
    const fixed = (['attack', 'target', 'confirm', 'repair', 'port', 'levels'] as const).map((f) => noticeText({ kind: 'fixed', action: 'viewDown', code: 'KeyR', fixed: f, label: 'R' }));
    expect(fixed).toEqual([
      'Esa tecla es de Atacar.',
      'Esa tecla es de Objetivo.',
      'Esa tecla es de Aceptar.',
      'Esa tecla es de Reparar.',
      'Esa tecla es de Puerto.',
      'Esa tecla es de Niveles.'
    ]);
  });

  test('ningún aviso usa los caracteres de flecha U+2190 a U+2193 (§20.8)', () => {
    const all = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].flatMap((a) => [
      noticeText({ kind: 'swap', action: 'viewUp', code: a, other: 'stop', otherCode: a }),
      keyText(a)
    ]);
    expect(all.filter((t) => /[\u2190-\u2193]/.test(t))).toEqual([]);
  });

  test('una tecla fuera de la lista: «Esa tecla no vale: usa una letra, un número o una flecha.»', () => {
    expect(noticeText({ kind: 'invalid', action: 'viewDown', code: 'F5', label: 'F5' })).toBe('Esa tecla no vale: usa una letra, un número o una flecha.');
  });

  test('los nombres de las 6 acciones, los de la lámina', () => {
    expect(Object.keys(DEFAULT_BINDINGS).map((a) => ACTION_NAMES[a as keyof typeof ACTION_NAMES])).toEqual([
      'Vista arriba',
      'Vista abajo',
      'Vista izquierda',
      'Vista derecha',
      'Centrar',
      'Detener'
    ]);
  });
});

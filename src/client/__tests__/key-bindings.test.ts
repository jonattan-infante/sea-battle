// Teclas a elegir (E18, H-1802): tabla de teclas, intercambios, rechazos (AC-209), la lista de permitidas (AC-208) y la
// etiqueta que enseña el panel según la distribución del teclado
import {
  actionOf,
  assignKey,
  BINDABLE,
  Bindable,
  Bindings,
  DEFAULT_BINDINGS,
  FIXED_KEYS,
  isBindableCode,
  isValidBindings,
  keyLabel,
  rejectedLabel,
  routeKey
} from '../key-bindings';

const LETTERS = Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`);
const DIGITS = Array.from({ length: 10 }, (_, i) => `Digit${i}`);
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

// Ninguna tecla repetida y ninguna acción sin tecla (AC-209)
function expectBijection(b: Bindings) {
  const codes = BINDABLE.map((a) => b[a]);
  expect(codes.every((c) => typeof c === 'string' && isBindableCode(c))).toBe(true);
  expect(new Set(codes).size).toBe(BINDABLE.length);
}

describe('Teclas por defecto (AC-208)', () => {
  test('las 6 acciones: la vista en las flechas, Centrar en C y Detener en S', () => {
    expect(DEFAULT_BINDINGS).toEqual({
      viewUp: 'ArrowUp',
      viewDown: 'ArrowDown',
      viewLeft: 'ArrowLeft',
      viewRight: 'ArrowRight',
      center: 'KeyC',
      stop: 'KeyS'
    });
    expectBijection(DEFAULT_BINDINGS);
  });

  test('actionOf devuelve la acción de cada tecla y null para las que no tienen', () => {
    expect(['ArrowUp', 'KeyS', 'KeyC', 'KeyW', 'Space'].map((c) => actionOf(DEFAULT_BINDINGS, c))).toEqual(['viewUp', 'stop', 'center', null, null]);
  });
});

describe('Lista de permitidas (AC-208): A–Z, 0–9 de la fila de arriba y las 4 flechas', () => {
  test.each([...LETTERS, ...DIGITS, ...ARROWS])('%s vale', (code) => {
    expect(isBindableCode(code)).toBe(true);
  });

  test.each(['Numpad1', 'NumpadEnter', 'F1', 'F5', 'F12', 'ShiftLeft', 'ControlLeft', 'AltRight', 'MetaLeft', 'Space', 'Tab', 'Enter', 'Escape', 'Semicolon', 'Minus', 'Backquote', 'IntlBackslash', 'CapsLock', 'Backspace', 'Keyw', 'KeyAA', 'Digit10', ''])(
    '%s no vale',
    (code) => {
      expect(isBindableCode(code)).toBe(false);
    }
  );
});

describe('Asignar una tecla (AC-208, AC-209)', () => {
  test('una tecla libre pasa a la acción y la anterior deja de hacerla', () => {
    const r = assignKey(DEFAULT_BINDINGS, 'viewUp', 'KeyW', false);
    expect(r).toEqual({ ok: true, bindings: { ...DEFAULT_BINDINGS, viewUp: 'KeyW' }, swapped: null, previous: 'ArrowUp' });
    expect(DEFAULT_BINDINGS.viewUp).toBe('ArrowUp'); // la tabla de entrada no cambia
  });

  test('la tecla de otra acción se intercambia: «abajo» en S deja Detener en la flecha abajo', () => {
    const r = assignKey(DEFAULT_BINDINGS, 'viewDown', 'KeyS', false);
    expect(r).toEqual({ ok: true, bindings: { ...DEFAULT_BINDINGS, viewDown: 'KeyS', stop: 'ArrowDown' }, swapped: 'stop', previous: 'ArrowDown' });
  });

  test.each(
    BINDABLE.flatMap((a) => BINDABLE.filter((b) => b !== a).map((b) => [a, b] as [Bindable, Bindable]))
  )('cada intercambio: %s toma la tecla de %s y le da la suya', (a, b) => {
    const r = assignKey(DEFAULT_BINDINGS, a, DEFAULT_BINDINGS[b], false);
    expect(r).toEqual({
      ok: true,
      bindings: { ...DEFAULT_BINDINGS, [a]: DEFAULT_BINDINGS[b], [b]: DEFAULT_BINDINGS[a] },
      swapped: b,
      previous: DEFAULT_BINDINGS[a]
    });
  });

  test('la misma tecla que ya tiene no cambia nada', () => {
    expect(assignKey(DEFAULT_BINDINGS, 'stop', 'KeyS', false)).toEqual({ ok: true, bindings: DEFAULT_BINDINGS, swapped: null, previous: 'KeyS' });
  });

  test.each(Object.entries(FIXED_KEYS))('%s es de una acción fija (%s): no se asigna y dice de cuál', (code, fixed) => {
    expect(assignKey(DEFAULT_BINDINGS, 'viewDown', code, false)).toEqual({ ok: false, reason: 'fixed', fixed });
  });

  test('las fijas son las de los manejadores de teclado: Espacio, Tab, Enter, R, P y N (reservada para niveles, AC-190)', () => {
    expect(Object.keys(FIXED_KEYS).sort()).toEqual(['Enter', 'KeyN', 'KeyP', 'KeyR', 'Space', 'Tab']);
  });

  test.each(['F5', 'Numpad8', 'ShiftLeft', 'Semicolon', 'NumpadEnter'])('%s no está en la lista: no se asigna y dice que no vale', (code) => {
    expect(assignKey(DEFAULT_BINDINGS, 'viewDown', code, false)).toEqual({ ok: false, reason: 'invalid' });
  });

  test('con un modificador (también Mayús) no vale, aunque la tecla sea de una fija (§20.4, estado d)', () => {
    expect([assignKey(DEFAULT_BINDINGS, 'viewUp', 'KeyW', true), assignKey(DEFAULT_BINDINGS, 'viewUp', 'KeyR', true)]).toEqual([
      { ok: false, reason: 'invalid' },
      { ok: false, reason: 'invalid' }
    ]);
  });

  test('Esc no se asigna: no es una tecla del juego ni de la lista', () => {
    expect(assignKey(DEFAULT_BINDINGS, 'viewUp', 'Escape', false)).toEqual({ ok: false, reason: 'invalid' });
  });

  test('tras cualquier secuencia de asignaciones no hay 2 acciones con la misma tecla ni una sin tecla', () => {
    const pool = [...LETTERS, ...DIGITS, ...ARROWS, 'F5', 'Space', 'KeyR', 'Numpad1', 'ShiftLeft', 'Escape'];
    let seed = 12345;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648; // LCG fijo: la secuencia es la misma en cada corrida
      return seed % n;
    };
    let b: Bindings = DEFAULT_BINDINGS;
    let swaps = 0;
    let rejects = 0;
    for (let i = 0; i < 5000; i++) {
      const r = assignKey(b, BINDABLE[rand(BINDABLE.length)], pool[rand(pool.length)], rand(10) === 0);
      if (r.ok) {
        b = r.bindings;
        if (r.swapped) swaps++;
      } else rejects++;
      expectBijection(b);
    }
    expect({ swaps: swaps > 0, rejects: rejects > 0 }).toEqual({ swaps: true, rejects: true }); // la secuencia pasa por los 2 caminos
  });
});

describe('Tabla guardada válida (AC-207)', () => {
  test('la de por defecto y una con intercambios valen', () => {
    expect(isValidBindings(DEFAULT_BINDINGS)).toBe(true);
    expect(isValidBindings({ ...DEFAULT_BINDINGS, viewUp: 'KeyW', viewDown: 'KeyS', stop: 'ArrowDown' })).toBe(true);
  });

  test.each([
    ['null', null],
    ['un texto', 'KeyW'],
    ['un array', ['ArrowUp']],
    ['le falta una acción', { viewUp: 'ArrowUp', viewDown: 'ArrowDown', viewLeft: 'ArrowLeft', viewRight: 'ArrowRight', center: 'KeyC' }],
    ['una acción de otra versión', { ...DEFAULT_BINDINGS, zoomIn: 'KeyZ' }],
    ['una tecla repetida', { ...DEFAULT_BINDINGS, stop: 'KeyC' }],
    ['una tecla fija', { ...DEFAULT_BINDINGS, stop: 'KeyR' }],
    ['una tecla fuera de la lista', { ...DEFAULT_BINDINGS, stop: 'F5' }],
    ['una tecla que no es texto', { ...DEFAULT_BINDINGS, stop: 83 }]
  ])('no vale %s', (_, value) => {
    expect(isValidBindings(value)).toBe(false);
  });
});

describe('Etiqueta de la tecla (AC-208): la del teclado del jugador, guardada por su posición', () => {
  test('sin distribución conocida, la del QWERTY de la CI: KeyW → «W», Digit7 → «7»', () => {
    expect(['KeyW', 'KeyS', 'Digit7'].map((c) => keyLabel(c))).toEqual(['W', 'S', '7']);
  });

  test('en un AZERTY, la tecla que en un QWERTY es la W dice «Z» (y la Q, «A»)', () => {
    const azerty = new Map([
      ['KeyW', 'z'],
      ['KeyQ', 'a'],
      ['KeyZ', 'w'],
      ['KeyA', 'q'],
      ['Digit1', '&']
    ]);
    // KeyS: sin dato para esa tecla, la del QWERTY
    expect(['KeyW', 'KeyQ', 'KeyZ', 'KeyS'].map((c) => keyLabel(c, azerty))).toEqual(['Z', 'A', 'W', 'S']);
  });

  test('los números de la fila de arriba dicen su número aunque la distribución ponga otro signo sin Mayús', () => {
    expect(keyLabel('Digit1', new Map([['Digit1', '&']]))).toBe('1');
  });

  test('un dato de la distribución que no es un carácter se ignora', () => {
    expect(['Dead', '', ' '].map((k) => keyLabel('KeyW', new Map([['KeyW', k]])))).toEqual(['W', 'W', 'W']);
  });

  test('las flechas no tienen letra: su etiqueta es la flecha, que el panel enseña como icono', () => {
    expect(ARROWS.map((c) => keyLabel(c))).toEqual(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  });

  test('una tecla rechazada también tiene etiqueta, para enseñarla en el aviso: F5, R, Espacio', () => {
    expect(['F5', 'KeyR', 'Numpad8'].map((c) => keyLabel(c))).toEqual(['F5', 'R', 'Numpad8']);
  });
});

describe('A dónde va una pulsación (AC-205): la espera, el panel y el juego', () => {
  const base = { waiting: false, open: false, bindings: DEFAULT_BINDINGS };

  test.each(['KeyR', 'Space', 'Tab', 'Escape', 'ArrowUp', 'KeyS', 'KeyC', 'KeyW', 'F5'])('esperando una tecla, %s solo sirve para asignarla', (code) => {
    expect(routeKey(code, { ...base, open: true, waiting: true })).toEqual({ kind: 'panel' });
  });

  test('con el panel abierto, Esc lo cierra; cerrado, Esc es del juego', () => {
    expect([routeKey('Escape', { ...base, open: true }), routeKey('Escape', base)]).toEqual([{ kind: 'closePanel' }, { kind: 'game' }]);
  });

  test('con el panel abierto, las teclas del juego actúan como con la tienda abierta: R repara, S detiene', () => {
    const open = { ...base, open: true };
    expect(['KeyR', 'Space', 'KeyS', 'ArrowUp'].map((c) => routeKey(c, open))).toEqual([
      { kind: 'game' },
      { kind: 'game' },
      { kind: 'action', action: 'stop' },
      { kind: 'action', action: 'viewUp' }
    ]);
  });

  test('tras reasignar Detener a X, X detiene y S ya no es de nadie', () => {
    const r = assignKey(DEFAULT_BINDINGS, 'stop', 'KeyX', false);
    if (!r.ok) throw new Error('rechazada');
    expect(['KeyX', 'KeyS'].map((c) => routeKey(c, { ...base, bindings: r.bindings }))).toEqual([{ kind: 'action', action: 'stop' }, { kind: 'game' }]);
  });
});

describe('La tecla rechazada, en rojo (§20.4, r11 828ea8a): nunca el e.code en inglés', () => {
  const none = { shift: false, ctrl: false, alt: false, meta: false };
  const cases: [string, string, Partial<typeof none>, string][] = [
    ['Space', ' ', {}, 'Esp'],
    ['Tab', 'Tab', {}, 'Tab'],
    ['Enter', 'Enter', {}, 'Enter'],
    ['NumpadEnter', 'Enter', {}, 'Enter'],
    ['KeyR', 'r', {}, 'R'],
    ['KeyN', 'n', {}, 'N'],
    ['F1', 'F1', {}, 'F1'],
    ['F12', 'F12', {}, 'F12'],
    ['KeyW', 'W', { shift: true }, 'Mayús'],
    ['KeyW', 'W', { shift: true, ctrl: true }, 'Mayús'],
    ['KeyW', 'w', { ctrl: true, alt: true }, 'Ctrl'],
    ['KeyW', 'w', { alt: true, meta: true }, 'Alt'],
    ['ArrowUp', 'ArrowUp', { meta: true }, 'Cmd'],
    ['ShiftLeft', 'Shift', { shift: true }, 'Mayús'],
    ['ControlRight', 'Control', { ctrl: true }, 'Ctrl'],
    ['MetaLeft', 'Meta', { meta: true }, 'Cmd'],
    ['Numpad0', '0', {}, 'Num 0'],
    ['Numpad9', '9', {}, 'Num 9'],
    ['NumpadAdd', '+', {}, '+'],
    ['Semicolon', 'ñ', {}, 'Ñ'],
    ['Minus', '-', {}, '-'],
    ['Home', 'Home', {}, 'Inicio'],
    ['End', 'End', {}, 'Fin'],
    ['PageUp', 'PageUp', {}, 'RePág'],
    ['PageDown', 'PageDown', {}, 'AvPág'],
    ['Insert', 'Insert', {}, 'Insert'],
    ['Delete', 'Delete', {}, 'Supr'],
    ['Backspace', 'Backspace', {}, 'Retroceso'],
    ['CapsLock', 'CapsLock', {}, 'Bloq Mayús'],
    ['ContextMenu', 'ContextMenu', {}, 'Otra'],
    ['F13', 'F13', {}, 'Otra'],
    ['Quote', 'Dead', {}, 'Otra']
  ];
  test.each(cases)('%s («%s», %j) → «%s»', (code, key, mods, label) => {
    expect(rejectedLabel(code, { ...none, ...mods }, key)).toBe(label);
  });

  test('las letras dicen lo que escriben (en un AZERTY, KeyM escribe «,»); si no escriben nada, la del teclado conocido', () => {
    expect([rejectedLabel('KeyM', none, ','), rejectedLabel('KeyM', none, 'Dead', new Map([['KeyM', ',']])), rejectedLabel('KeyM', none, 'Dead')]).toEqual([',', ',', 'M']);
  });
});

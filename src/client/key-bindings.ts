// Teclas a elegir (E18, H-1802, GDD §5): la tabla de las 6 acciones reasignables, sin DOM para probarla con Jest. Las
// teclas se guardan por su posición (`e.code`), como lee el teclado del juego; la etiqueta sale de la distribución del
// jugador cuando el navegador la da (AC-208)

// Las 4 de la vista mueven la vista libre mientras estén pulsadas (AC-118); Centrar vuelve al seguimiento (AC-119)
export const VIEW_ACTIONS = ['viewUp', 'viewDown', 'viewLeft', 'viewRight'] as const;
export const BINDABLE = [...VIEW_ACTIONS, 'center', 'stop'] as const;
export type ViewAction = (typeof VIEW_ACTIONS)[number];
export type Bindable = (typeof BINDABLE)[number];
export type Bindings = Readonly<Record<Bindable, string>>;

export const DEFAULT_BINDINGS: Bindings = {
  viewUp: 'ArrowUp',
  viewDown: 'ArrowDown',
  viewLeft: 'ArrowLeft',
  viewRight: 'ArrowRight',
  center: 'KeyC',
  stop: 'KeyS'
};

// Las teclas de acciones fijas (AC-209): las del manejador de teclado de GameApp.tsx (Espacio, Tab, R y P), Enter, que
// pulsa el botón con el foco (Zarpar y los del aviso de conexión), y N, reservada para la pantalla de niveles (AC-190).
// Esc no está: cancela la espera antes de llegar aquí (AC-205)
export const FIXED_KEYS = {
  Space: 'attack',
  Tab: 'target',
  Enter: 'confirm',
  KeyR: 'repair',
  KeyP: 'port',
  KeyN: 'levels'
} as const;
export type FixedAction = (typeof FIXED_KEYS)[keyof typeof FIXED_KEYS];

const ARROW_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

// Solo A–Z, 0–9 de la fila de arriba y las 4 flechas (AC-208); el teclado numérico no
export function isBindableCode(code: string): boolean {
  return /^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) || ARROW_CODES.has(code);
}

export function isArrowCode(code: string): boolean {
  return ARROW_CODES.has(code);
}

export function actionOf(bindings: Bindings, code: string): Bindable | null {
  for (const a of BINDABLE) if (bindings[a] === code) return a;
  return null;
}

export type AssignResult =
  | { ok: true; bindings: Bindings; swapped: Bindable | null; previous: string } // previous: la tecla que tenía la acción
  | { ok: false; reason: 'fixed'; fixed: FixedAction }
  | { ok: false; reason: 'invalid' };

function isFixedCode(code: string): code is keyof typeof FIXED_KEYS {
  return Object.prototype.hasOwnProperty.call(FIXED_KEYS, code);
}

// Asigna `code` a `action`. Si otra acción la tenía, las 2 se intercambian las teclas (AC-209), así que nunca quedan 2
// acciones con la misma tecla ni una sin tecla. `modified`: la pulsación llevaba Mayús, Ctrl, Alt o Cmd, y entonces no
// vale aunque la tecla sea de una fija (§20.4, estado d)
export function assignKey(bindings: Bindings, action: Bindable, code: string, modified: boolean): AssignResult {
  if (modified) return { ok: false, reason: 'invalid' };
  if (isFixedCode(code)) return { ok: false, reason: 'fixed', fixed: FIXED_KEYS[code] };
  if (!isBindableCode(code)) return { ok: false, reason: 'invalid' };
  const previous = bindings[action];
  if (previous === code) return { ok: true, bindings, swapped: null, previous };
  const other = actionOf(bindings, code);
  const next: Record<Bindable, string> = { ...bindings, [action]: code };
  if (other) next[other] = previous;
  return { ok: true, bindings: next, swapped: other, previous };
}

// Una tabla leída del navegador (AC-207): exactamente las 6 acciones, cada una con una tecla permitida y no fija, sin
// repetir. Cualquier otra cosa (rota o de otra versión) no vale
export function isValidBindings(value: unknown): value is Bindings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length !== BINDABLE.length || !BINDABLE.every((a) => keys.includes(a))) return false;
  const codes = BINDABLE.map((a) => rec[a]);
  if (!codes.every((c) => typeof c === 'string' && isBindableCode(c) && !isFixedCode(c))) return false;
  return new Set(codes).size === codes.length;
}

// Lo que se sabe de la distribución del jugador: posición → carácter sin Mayús (KeyboardLayoutMap de Chromium, o el
// `e.key` de las pulsaciones vistas)
export type LayoutLookup = { get(code: string): string | undefined };

// Etiqueta de una tecla (AC-208): las letras, la del teclado del jugador (en un AZERTY, KeyW dice «Z»); sin ese dato, la
// del QWERTY. Los números de la fila de arriba, su número. Las flechas, su nombre, que el panel y el HUD enseñan como
// icono porque la Barlow no tiene ↑ ↓ ← →. Cualquier otra (las rechazadas), su `code` sin prefijo cuando lo hay
export function keyLabel(code: string, layout?: LayoutLookup): string {
  if (ARROW_CODES.has(code)) return code;
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    const k = layout?.get(code);
    return k && [...k].length === 1 && k.trim() ? k.toUpperCase() : letter[1];
  }
  return code;
}

// A dónde va una pulsación nueva (sin autorrepetición) con el panel de opciones (AC-205). Mientras el panel espera una
// tecla, cualquiera, también Esc, que cancela, es del panel. Con el panel abierto, Esc lo cierra; las demás actúan como
// con la tienda abierta. Así, Esc hace una sola cosa por pulsación: cancela la espera, cierra el panel o, ya cerrado,
// lo suyo del juego. Las fijas no pueden estar en la tabla, así que una tecla es de una acción reasignable o del juego
export type KeyRoute = { kind: 'panel' } | { kind: 'closePanel' } | { kind: 'action'; action: Bindable } | { kind: 'game' };

export function routeKey(code: string, s: { waiting: boolean; open: boolean; bindings: Bindings }): KeyRoute {
  if (s.waiting) return { kind: 'panel' };
  if (code === 'Escape' && s.open) return { kind: 'closePanel' };
  const action = actionOf(s.bindings, code);
  return action ? { kind: 'action', action } : { kind: 'game' };
}

// Una tecla dicha con palabras, para los avisos y los title (AC-208): las flechas, «flecha abajo»; las demás, su etiqueta
const ARROW_WORDS: Record<string, string> = {
  ArrowUp: 'flecha arriba',
  ArrowDown: 'flecha abajo',
  ArrowLeft: 'flecha izquierda',
  ArrowRight: 'flecha derecha'
};

export function keyText(code: string, layout?: LayoutLookup): string {
  return ARROW_WORDS[code] ?? keyLabel(code, layout);
}

// Los modificadores de una pulsación, en el orden en que se nombran (§20.4)
export interface Mods {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

// Las que no escriben nada, con su nombre en un teclado español; Espacio, como en su ranura (§20.4)
const SPANISH_NAMES: Record<string, string> = {
  Space: 'Esp',
  Tab: 'Tab',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Home: 'Inicio',
  End: 'Fin',
  PageUp: 'RePág',
  PageDown: 'AvPág',
  Insert: 'Insert',
  Delete: 'Supr',
  Backspace: 'Retroceso',
  CapsLock: 'Bloq Mayús'
};

// La tecla rechazada, tal como la enseña la caja roja (§20.4, r11 828ea8a): con Mayús, Ctrl, Alt o Cmd, la primera de
// esas 4; F1–F12; el teclado numérico, «Num 0»…«Num 9»; las letras, lo que escriben; las que no escriben, su nombre en
// español; cualquier otra, lo que escribe sin Mayús en mayúscula, u «Otra». Nunca el `e.code` en inglés
export function rejectedLabel(code: string, mods: Mods, key: string, layout?: LayoutLookup): string {
  if (mods.shift) return 'Mayús';
  if (mods.ctrl) return 'Ctrl';
  if (mods.alt) return 'Alt';
  if (mods.meta) return 'Cmd';
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  const num = /^Numpad([0-9])$/.exec(code);
  if (num) return `Num ${num[1]}`;
  const writes = [...key].length === 1 && key.trim() !== '';
  if (/^Key[A-Z]$/.test(code)) return writes ? key.toUpperCase() : keyLabel(code, layout);
  if (SPANISH_NAMES[code]) return SPANISH_NAMES[code];
  return writes ? key.toUpperCase() : 'Otra';
}

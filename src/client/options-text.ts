// Textos del panel de opciones (E18, lámina D98; ART-DIRECTION §20.4). En un solo sitio para cotejarlos con la spec
import { Bindable, FixedAction, isArrowCode, keyText, LayoutLookup } from './key-bindings';
import type { KeyNotice } from './options-store';

export const ACTION_NAMES: Record<Bindable, string> = {
  viewUp: 'Vista arriba',
  viewDown: 'Vista abajo',
  viewLeft: 'Vista izquierda',
  viewRight: 'Vista derecha',
  center: 'Centrar',
  stop: 'Detener'
};

// Los de la barra de acciones (Atacar, Objetivo, Reparar, Puerto), «Aceptar» para Enter, que pulsa el botón con el foco,
// y «Niveles» para N (AC-190). Decidido por producto el 2026-11-01 (AC-209)
export const FIXED_NAMES: Record<FixedAction, string> = {
  attack: 'Atacar',
  target: 'Objetivo',
  confirm: 'Aceptar',
  repair: 'Reparar',
  port: 'Puerto',
  levels: 'Niveles'
};

// Después de «pasa a», con artículo (§20.4): «a la flecha abajo», «a la S» (las letras son femeninas), «al 5»
function afterPasa(code: string, layout?: LayoutLookup): string {
  const text = keyText(code, layout);
  return isArrowCode(code) || /^Key/.test(code) ? `a la ${text}` : `al ${text}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function noticeText(n: KeyNotice, layout?: LayoutLookup): string {
  switch (n.kind) {
    case 'swap': {
      // Al principio, la letra o el número solos, o «La flecha arriba»
      const pressed = isArrowCode(n.code) ? `la ${keyText(n.code, layout)}` : keyText(n.code, layout);
      const other = ACTION_NAMES[n.other];
      return `${capitalize(pressed)} era de ${other}: ${other} pasa ${afterPasa(n.otherCode, layout)}.`;
    }
    case 'fixed':
      return `Esa tecla es de ${FIXED_NAMES[n.fixed]}.`;
    case 'invalid':
      return 'Esa tecla no vale: usa una letra, un número o una flecha.';
  }
}

// Panel de opciones de cámara y teclas (E18, GDD §5): lo que elige el jugador, guardado en el navegador (AC-207), y el
// estado del panel. Solo cambia por una acción del jugador, nunca por frame; el teclado lo lee con getState()
import { create } from 'zustand';
import type { ConnectionState } from './game-client';
import { useHud } from './hud-store';
import { assignKey, Bindable, Bindings, FixedAction, Mods, rejectedLabel } from './key-bindings';
import { CameraMode, DEFAULT_OPTIONS, loadOptions, saveOptions } from './options';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

// Lo que dice el panel tras una pulsación en la espera (AC-209): el intercambio, o de quién es la tecla, o que no vale
export type KeyNotice =
  | { kind: 'swap'; action: Bindable; code: string; other: Bindable; otherCode: string }
  | { kind: 'fixed'; action: Bindable; code: string; fixed: FixedAction; label: string } // label: la tecla pulsada, en rojo
  | { kind: 'invalid'; action: Bindable; code: string; label: string };

interface OptionsState {
  camera: CameraMode;
  keys: Bindings;
  layout: ReadonlyMap<string, string>; // posición → carácter del teclado del jugador, para las etiquetas (AC-208)
  open: boolean;
  waiting: Bindable | null; // la acción que espera su tecla
  notice: KeyNotice | null;
  hydrate: (storage: StorageLike | undefined) => void;
  setOpen: (open: boolean) => void;
  setCamera: (camera: CameraMode) => void;
  startWait: (action: Bindable) => void;
  cancelWait: () => void;
  press: (code: string, mods: Partial<Mods>, key: string) => void;
  reset: () => void;
  learnLayout: (entries: Iterable<[string, string]>) => void;
}

// Nunca 2 ventanas a la vez (AC-205, precisado el 2026-11-01): la tienda, la tarjeta de muerte y el aviso de desconexión
// (el de Overlays.tsx, que no sale con 'connected', 'connecting' ni 'full') cierran el panel, y con una de ellas en
// pantalla no se abre. Así Esc tiene un solo dueño
export function otherWindowOpen(h: { shopOpen: boolean; player: { death?: unknown } | null; connection: ConnectionState }): boolean {
  return h.shopOpen || !!h.player?.death || (h.connection !== 'connected' && h.connection !== 'connecting' && h.connection !== 'full');
}

let storage: StorageLike | undefined;
const persist = (s: Pick<OptionsState, 'camera' | 'keys'>) => saveOptions({ camera: s.camera, keys: s.keys }, storage);

export const useOptions = create<OptionsState>((set, get) => ({
  camera: DEFAULT_OPTIONS.camera,
  keys: DEFAULT_OPTIONS.keys,
  layout: new Map(),
  open: false,
  waiting: null,
  notice: null,
  hydrate: (s) => {
    storage = s;
    const o = loadOptions(s);
    set({ camera: o.camera, keys: o.keys });
  },
  setOpen: (open) => {
    if (open && otherWindowOpen(useHud.getState())) return;
    set((s) => (s.open === open && !s.waiting && !s.notice ? s : { open, waiting: null, notice: null }));
  },
  setCamera: (camera) => {
    if (get().camera === camera) return;
    set({ camera, waiting: null, notice: null });
    persist(get());
  },
  startWait: (action) => set({ waiting: action, notice: null }),
  cancelWait: () => set((s) => (s.waiting ? { waiting: null } : s)),
  press: (code, mods, key) => {
    const { waiting: action, keys, layout } = get();
    if (!action) return;
    if (code === 'Escape') return set({ waiting: null, notice: null });
    const m: Mods = { shift: !!mods.shift, ctrl: !!mods.ctrl, alt: !!mods.alt, meta: !!mods.meta };
    const modified = m.shift || m.ctrl || m.alt || m.meta;
    const r = assignKey(keys, action, code, modified);
    if (!r.ok) {
      // Un rechazo acaba la espera; el aviso y la tecla en rojo duran hasta la siguiente acción en el panel (AC-209)
      const label = rejectedLabel(code, m, key, layout);
      return set({ waiting: null, notice: r.reason === 'fixed' ? { kind: 'fixed', action, code, fixed: r.fixed, label } : { kind: 'invalid', action, code, label } });
    }
    // «tal como la pulsó el jugador» (AC-208): su carácter sin modificadores es la etiqueta de esa posición
    const learnt = !modified && [...key].length === 1 && layout.get(code) !== key ? new Map(layout).set(code, key) : layout;
    set({
      keys: r.bindings,
      layout: learnt,
      waiting: null,
      notice: r.swapped ? { kind: 'swap', action, code, other: r.swapped, otherCode: r.previous } : null
    });
    if (r.bindings !== keys) persist(get());
  },
  reset: () => {
    set({ keys: DEFAULT_OPTIONS.keys, waiting: null, notice: null });
    persist(get());
  },
  learnLayout: (entries) => {
    const layout = new Map(get().layout);
    let changed = false;
    for (const [code, key] of entries) {
      if (layout.get(code) === key) continue;
      layout.set(code, key);
      changed = true;
    }
    if (changed) set({ layout });
  }
}));

// Cierra el panel (y cancela su espera sin cambiar nada) en cuanto se abre otra ventana. Devuelve cómo dejar de mirar
export function closeOnOtherWindows(): () => void {
  return useHud.subscribe((h) => {
    if (useOptions.getState().open && otherWindowOpen(h)) useOptions.getState().setOpen(false);
  });
}

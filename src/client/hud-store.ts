// Estado del HUD (React). Solo guarda datos que cambian por eventos o entradas, a ≤ 10 Hz y solo si cambian.
// Los contadores que avanzan con el reloj (protección, muerte, recarga) se pintan por ref, no aquí (AC-83).
import { create } from 'zustand';
import { ShipKind } from '../game/constants';
import { PlayerView, ShipState } from '../game/types';
import type { ConnectionState } from './game-client';

export type Relation = 'self' | 'player' | 'pirate' | 'merchant';
export type ActionState = 'idle' | 'armed' | 'firing' | 'repairing';

export interface MeHud {
  shipId: string;
  name: string;
  classId: string;
  classLabel: string;
  hp: number;
  maxHp: number;
  state: ShipState;
  inSafeZone: boolean;
  protectedUntil: number; // tiempo de servidor (s)
  action: ActionState;
  underFire: boolean; // dañado en los últimos 3 s (reparación al 1,5 %/s)
}

export interface TargetHud {
  id: string;
  name: string;
  kind: ShipKind;
  relation: Relation;
  classLabel: string;
  hp: number;
  maxHp: number;
  state: ShipState;
  distance: number; // m, entero
  inRange: boolean;
  attackable: boolean;
}

export interface Toast {
  id: number;
  kind: 'info' | 'ok' | 'warn' | 'danger';
  text: string;
}

export interface FeedLine {
  id: number;
  text: string;
  tone: 'ok' | 'danger' | 'gold' | 'info';
}

interface HudState {
  connection: ConnectionState;
  reconnectAttempt: number;
  me: MeHud | null;
  player: PlayerView | null;
  selectedId: string | null;
  target: TargetHud | null;
  shopOpen: boolean;
  toasts: Toast[];
  feed: FeedLine[];
  hint: number | null; // pista de primera sesión (0 navegar, 1 seleccionar, 2 atacar)
  goldGain: { id: number; amount: number } | null;
  killedBy: { name: string; relation: Relation } | null;
  select: (id: string | null) => void;
  setShopOpen: (open: boolean) => void;
  pushToast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
  pushFeed: (tone: FeedLine['tone'], text: string) => void;
}

let nextId = 1;
const TOAST_MS = 3500; // ART-DIRECTION §12.5
const MAX_TOASTS = 3;
const FEED_MS = 5000; // AC-78
const MAX_FEED = 4;

export const useHud = create<HudState>((set) => ({
  connection: 'connecting',
  reconnectAttempt: 0,
  me: null,
  player: null,
  selectedId: null,
  target: null,
  shopOpen: false,
  toasts: [],
  feed: [],
  hint: null,
  goldGain: null,
  killedBy: null,
  select: (id) => set({ selectedId: id }),
  setShopOpen: (open) => set({ shopOpen: open }),
  pushToast: (kind, text) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-MAX_TOASTS) }));
    setTimeout(() => useHud.getState().dismissToast(id), TOAST_MS);
  },
  dismissToast: (id) => set((s) => (s.toasts.some((t) => t.id === id) ? { toasts: s.toasts.filter((t) => t.id !== id) } : s)),
  pushFeed: (tone, text) => {
    const id = nextId++;
    set((s) => ({ feed: [...s.feed, { id, tone, text }].slice(-MAX_FEED) }));
    setTimeout(() => useHud.setState((s) => (s.feed.some((f) => f.id === id) ? { feed: s.feed.filter((f) => f.id !== id) } : s)), FEED_MS);
  }
}));

// Compara superficialmente para no notificar a React si nada cambió
export function sameShallow<T extends object>(a: T | null, b: T | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

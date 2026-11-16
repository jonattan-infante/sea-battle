// Estado del HUD (React). Solo guarda datos que cambian por eventos o entradas, a ≤ 10 Hz y solo si cambian.
// Los contadores que avanzan con el reloj (protección, muerte, recarga) se pintan por ref, no aquí (AC-83).
import { create } from 'zustand';
import { ShipKind } from '../game/constants';
import { PlayerView, ShipState } from '../game/types';
import type { Rank } from '../game/xp';
import type { ConnectionState } from './game-client';
import { SHOP_UNAVAILABLE, type Reward } from './hud-logic';
import { familyDoneText, familyResolved, FAMILY_BUY_FAILED, FAMILY_SELECT_FAILED, FAMILY_TIMEOUT_MS, FamilyIntent, routeNotice } from './shop-logic';
import type { Notice } from '../game/types';

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
  underFire: boolean; // dañado en los últimos 3 s (reparación al 1,5 %/s); no es la marca de la zona (O-151)
  // Marca de bajo fuego de la zona segura (E20, GDD §11): el instante en que caduca (`uf`, tiempo de servidor; 0 sin marca),
  // que cambia como mucho una vez por andanada, y si está activa, que cambia al aparecer y al caducar con el reloj del
  // cliente (O-150). La cuenta que corre no pasa por aquí: se pinta por ref (D128)
  underFireUntil: number;
  underFireMark: boolean;
}

export interface TargetHud {
  id: string;
  name: string;
  kind: ShipKind;
  relation: Relation;
  classId: string;
  classLabel: string;
  hp: number;
  maxHp: number;
  state: ShipState;
  distance: number; // m, redondeada hacia arriba (AC-31, 1.1): la que se muestra
  inRange: boolean;
  attackable: boolean;
  level: number | null; // nivel de un jugador (1.1, AC-153); null en los NPC
  danger: boolean; // marca de peligro de un NPC a flote (AC-189): cambia con el barco, las mejoras, el objetivo o su hundimiento, nunca con la vida
}

// achievement: el aviso de subida de nivel (ART-DIRECTION §12.9, «logro»), con la insignia del rango en lugar del icono.
// key: un aviso nuevo con la misma clave sustituye al visible en lugar de apilarse (D125, el del puerto bajo fuego); fire:
// lleva la llama delante del texto
export interface Toast {
  id: number;
  kind: 'info' | 'ok' | 'warn' | 'danger' | 'achievement';
  text: string;
  rank?: Rank;
  key?: string;
  fire?: true;
}
export interface ToastOptions {
  key?: string;
  fire?: boolean;
}

// reward: las partes de una línea de botín (AC-152), para truncar solo el nombre y pintar la XP en su color
export interface FeedLine {
  id: number;
  text: string;
  tone: 'ok' | 'danger' | 'gold' | 'info';
  reward?: Reward;
}

// El aviso dentro del Astillero (O-48; `.shop__notice`): ok o peligro, como los toasts
export interface ShopNotice {
  id: number;
  kind: 'ok' | 'danger';
  text: string;
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
  saveWarning: boolean; // aviso persistente de AC-132 (D50): la BD no guarda; no es un toast
  shopNotice: ShopNotice | null; // el aviso dentro del Astillero (O-48): uno a la vez
  familyIntent: FamilyIntent | null; // la compra o el cambio de familia que espera al servidor (D101)
  freeView: boolean; // vista libre (E13): solo cambia al entrar o salir, nunca por frame (el botón Centrar)
  select: (id: string | null) => void;
  setShopOpen: (open: boolean) => void;
  setFreeView: (free: boolean) => void;
  pushToast: (kind: Toast['kind'], text: string, rank?: Rank, options?: ToastOptions) => void;
  dismissToast: (id: number) => void;
  pushFeed: (tone: FeedLine['tone'], text: string, reward?: Reward) => void;
}

let nextId = 1;
export const TOAST_MS = 3500; // ART-DIRECTION §12.5
export const ACHIEVEMENT_MS = 5000; // el aviso de nivel es un logro y pasa pocas veces (§12.9)
export const MAX_TOASTS = 3;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleDismiss(id: number, kind: Toast['kind']) {
  clearTimeout(toastTimers.get(id));
  toastTimers.set(id, setTimeout(() => useHud.getState().dismissToast(id), kind === 'achievement' ? ACHIEVEMENT_MS : TOAST_MS));
}
let shopNoticeTimer: ReturnType<typeof setTimeout> | undefined;
let familyTimer: ReturnType<typeof setTimeout> | undefined;
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
  saveWarning: false,
  shopNotice: null,
  familyIntent: null,
  freeView: false,
  select: (id) => set({ selectedId: id }),
  // Al cerrar el Astillero, su aviso se va con él y no pasa a la columna del HUD, y la familia en espera se olvida (O-48)
  setShopOpen: (open) => {
    if (!open) {
      clearTimeout(shopNoticeTimer);
      clearTimeout(familyTimer);
    }
    set(open ? { shopOpen: true } : { shopOpen: false, shopNotice: null, familyIntent: null });
  },
  setFreeView: (free) => set((s) => (s.freeView === free ? s : { freeView: free })),
  pushToast: (kind, text, rank, options) => {
    // AC-127: un aviso con el mismo texto que uno visible no se apila; se queda en su sitio y su vida vuelve a empezar. Con
    // clave (D125), lo mismo con el visible de su clave, que toma el texto nuevo
    const key = options?.key;
    const same = useHud.getState().toasts.find((t) => (key ? t.key === key : t.text === text));
    if (same) {
      if (same.kind !== kind || same.text !== text) set((s) => ({ toasts: s.toasts.map((t) => (t.id === same.id ? { ...t, kind, text } : t)) }));
      scheduleDismiss(same.id, kind);
      return;
    }
    const id = nextId++;
    const toast: Toast = { id, kind, text };
    if (rank) toast.rank = rank;
    if (key) toast.key = key;
    if (options?.fire) toast.fire = true;
    set((s) => ({ toasts: [...s.toasts, toast].slice(-MAX_TOASTS) }));
    scheduleDismiss(id, kind);
  },
  dismissToast: (id) => {
    clearTimeout(toastTimers.get(id));
    toastTimers.delete(id);
    set((s) => (s.toasts.some((t) => t.id === id) ? { toasts: s.toasts.filter((t) => t.id !== id) } : s));
  },
  pushFeed: (tone, text, reward) => {
    const id = nextId++;
    set((s) => ({ feed: [...s.feed, reward ? { id, tone, text, reward } : { id, tone, text }].slice(-MAX_FEED) }));
    setTimeout(() => useHud.setState((s) => (s.feed.some((f) => f.id === id) ? { feed: s.feed.filter((f) => f.id !== id) } : s)), FEED_MS);
  }
}));

// AC-132 (D50, ART-DIRECTION §12.5): el aviso aparece en la misma llamada en que llega el estado del servidor y se queda
// al menos 3 s, para que un corte de un instante no parpadee. Al confirmarse la escritura se quita y en su lugar sale el
// toast de éxito; Puerto vuelve en ese mismo commit, porque se deriva de saveWarning
export const SAVE_WARNING_MIN_MS = 3000;
// El aviso se pinta en el commit que sigue a la llegada del estado, unos ms después: con 50 ms de margen, medido en el DOM
// nunca dura menos de 3 s (sin margen, el e2e midió 2 999,9 ms)
export const SAVE_WARNING_HOLD_MS = SAVE_WARNING_MIN_MS + 50;
export const SAVED_TEXT = 'Progreso guardado';
let warningSince = 0;
let warningExit: ReturnType<typeof setTimeout> | undefined;

function clearSaveWarning() {
  warningExit = undefined;
  useHud.setState({ saveWarning: false });
  useHud.getState().pushToast('ok', SAVED_TEXT);
}

export function syncUnsaved(unsaved: boolean, now = performance.now()): void {
  if (unsaved) {
    clearTimeout(warningExit);
    warningExit = undefined;
    if (useHud.getState().saveWarning) return;
    warningSince = now;
    // La franja manda: el aviso del Astillero con su mismo texto se quita al aparecer (O-48)
    useHud.setState((s) => ({ saveWarning: true, ...(s.shopNotice?.text === SHOP_UNAVAILABLE ? { shopNotice: null } : {}) }));
    return;
  }
  if (!useHud.getState().saveWarning || warningExit !== undefined) return;
  const left = warningSince + SAVE_WARNING_HOLD_MS - now;
  if (left <= 0) clearSaveWarning();
  else warningExit = setTimeout(clearSaveWarning, left);
}

export function resetSaveWarning(): void {
  clearTimeout(warningExit);
  warningExit = undefined;
  if (useHud.getState().saveWarning) useHud.setState({ saveWarning: false });
}

// Compara superficialmente para no notificar a React si nada cambió
export function sameShallow<T extends object>(a: T | null, b: T | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

// ---- El Astillero (O-48, D101) ----

// Un aviso dentro del Astillero: sustituye al que haya y dura 3,5 s desde el último (§12.5)
export function pushShopNotice(kind: ShopNotice['kind'], text: string): void {
  clearTimeout(shopNoticeTimer);
  const id = nextId++;
  useHud.setState({ shopNotice: { id, kind, text } });
  shopNoticeTimer = setTimeout(() => useHud.setState((s) => (s.shopNotice?.id === id ? { shopNotice: null } : s)), TOAST_MS);
}

function endFamilyIntent(): void {
  clearTimeout(familyTimer);
  useHud.setState({ familyIntent: null });
}

// Cada aviso del servidor (client.onNotice): a la columna del HUD o dentro del Astillero (shop-logic.ts, routeNotice)
export function noticeArrived(n: Notice): void {
  const s = useHud.getState();
  const route = routeNotice(n, s);
  if (route.clearIntent) endFamilyIntent();
  if (route.to === 'toast') s.pushToast(route.kind, route.text);
  else if (route.to === 'shop') pushShopNotice(route.kind, route.text);
}

// La compra o el cambio de familia sale hacia el servidor: su botón se apaga hasta la respuesta, y sin ella en 5 s vuelve con
// el aviso de error (D94, D101)
export function startFamilyIntent(intent: FamilyIntent): void {
  clearTimeout(familyTimer);
  useHud.setState({ familyIntent: intent });
  familyTimer = setTimeout(() => {
    if (useHud.getState().familyIntent !== intent) return;
    useHud.setState({ familyIntent: null });
    pushShopNotice('danger', intent.kind === 'buy' ? FAMILY_BUY_FAILED : FAMILY_SELECT_FAILED);
  }, FAMILY_TIMEOUT_MS);
}

// El estado del jugador (client.onPlayer): un cambio de familia no trae aviso del servidor, así que se resuelve aquí, en la
// misma llamada en que llega la familia nueva (el sello y el aviso, en el mismo commit)
export function familyArrived(player: Pick<PlayerView, 'family' | 'families'>): void {
  const intent = useHud.getState().familyIntent;
  if (!intent || !familyResolved(intent, player)) return;
  endFamilyIntent();
  pushShopNotice('ok', familyDoneText(intent.family));
}

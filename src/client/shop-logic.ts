// La tienda de la 1.3 sin React (D103 y D101; ART-DIRECTION §14, «1.3: la tienda por barco» y «Pestaña Familia en la 1.3»):
// los textos que dependen del barco o de la familia, y adónde va cada aviso del servidor con el Astillero abierto (O-48).
// El servidor decide todo; aquí solo se explica y se reparte
import { FamilyChoice, NO_FAMILY, PlayerShipClass, SHIP_CLASSES, SHIP_MIN_LEVEL, ShipFamily } from '../game/constants';
import { Notice, PlayerView } from '../game/types';
import { levelRequirement, Rank, rankOf } from '../game/xp';
import { SHOP_UNAVAILABLE } from './hud-logic';

// El artículo de cada barco: «Mejoras de la Fragata», «sigues navegando el Bergantín» (tienda103.py, ART)
const ARTICLE: Record<PlayerShipClass, 'el' | 'la'> = { sloop: 'la', brig: 'el', schooner: 'la', frigate: 'la', line: 'el' };
const withArticle = (classId: PlayerShipClass) => `${ARTICLE[classId]} ${SHIP_CLASSES[classId].label}`;

export const upgradesTitle = (classId: PlayerShipClass) => `Mejoras ${ARTICLE[classId] === 'el' ? 'del' : 'de la'} ${SHIP_CLASSES[classId].label}`;
export const otherShipNotice = (activeShip: PlayerShipClass) =>
  `No es el barco que navegas. La mejora se le aplica igual, y sigues navegando ${withArticle(activeShip)}.`;
export const NEW_SHIP_TEXT = 'Llega sin mejoras'; // AC-217 (c)

// La línea «Requiere nivel» de la Goleta y el Navío (AC-162, D85), hasta tener el nivel; null si el barco no lo pide
export function shipLevelLock(classId: PlayerShipClass, playerLevel: number): { level: number; rank: Rank; text: string } | null {
  const level = (SHIP_MIN_LEVEL as Partial<Record<PlayerShipClass, number>>)[classId];
  if (level === undefined || playerLevel >= level) return null;
  return { level, rank: rankOf(level), text: levelRequirement(level) };
}

// La pestaña Familia (D101): «Sin familia» y las 2 familias, en ese orden. `&nbsp;` en «Union Jack» y en «cruz de Borgoña»
export const FAMILY_CARDS: readonly FamilyChoice[] = [NO_FAMILY, 'gb', 'es'];
export const FAMILY_TEXT: Record<FamilyChoice, { label: string; traits: string; adjective?: string }> = {
  none: { label: 'Sin familia', traits: 'El aspecto de siempre · gratis' },
  gb: { label: 'Británica', adjective: 'británica', traits: 'Casco azul marino · franjas blancas · Union Jack' },
  es: { label: 'Española', adjective: 'española', traits: 'Casco rojo · franjas doradas · cruz de Borgoña' }
};
export const FAMILY_NOTE =
  'Una familia solo cambia el aspecto: la vida, la velocidad y los cañones son los mismos. Se compra una vez y vale para todos tus barcos, también los que compres después.';
// Al volver a «Sin familia», las palabras de su tarjeta (ux, ART-DIRECTION «Familia elegida»)
export const familyDoneText = (family: FamilyChoice) =>
  family === NO_FAMILY ? 'Tus barcos vuelven al aspecto de siempre' : `Tus barcos ahora son de la familia ${FAMILY_TEXT[family].adjective}`;
export const FAMILY_BUY_FAILED = 'No se pudo comprar la familia. Inténtalo de nuevo.';
export const FAMILY_SELECT_FAILED = 'No se pudo cambiar la familia. Inténtalo de nuevo.';
export const FAMILY_TIMEOUT_MS = 5000; // sin respuesta en 5 s, el botón vuelve (D94, D101)
export const familyAria = (action: 'buy' | 'select', family: FamilyChoice, price?: number) =>
  action === 'buy'
    ? `Comprar la familia ${FAMILY_TEXT[family].adjective} por ${price} de oro`
    : family === NO_FAMILY
      ? 'Elegir sin familia'
      : `Elegir la familia ${FAMILY_TEXT[family].adjective}`;

// La compra o el cambio de familia que espera al servidor: mientras, su botón se apaga (D101, «Esperando al servidor»)
export interface FamilyIntent {
  kind: 'buy' | 'select';
  family: FamilyChoice;
}

export const PURCHASE_DONE = 'Compra realizada'; // el aviso del servidor tras cualquier compra (server/game-server.ts)

export type NoticeRoute =
  | { to: 'toast'; kind: 'ok' | 'danger'; text: string; clearIntent: boolean }
  | { to: 'shop'; kind: 'ok' | 'danger'; text: string; clearIntent: boolean }
  | { to: 'none'; clearIntent: boolean };

// Adónde va un aviso del servidor. Con la tienda cerrada, a la columna del HUD; abierta, dentro del Astillero (O-48), salvo el
// de «Guardado no disponible» si ya se ve su franja. Con una familia esperando: la compra se confirma con «Compra realizada»,
// que se cambia por el aviso de la familia (un aviso, no dos); un error, sea cual sea, es el aviso de error de la familia
export function routeNotice(n: Notice, s: { shopOpen: boolean; saveWarning: boolean; familyIntent: FamilyIntent | null }): NoticeRoute {
  const kind = n.kind === 'error' ? 'danger' : 'ok';
  if (!s.shopOpen) return { to: 'toast', kind, text: n.text, clearIntent: false };
  const intent = s.familyIntent;
  if (intent && n.kind === 'error') return { to: 'shop', kind: 'danger', text: intent.kind === 'buy' ? FAMILY_BUY_FAILED : FAMILY_SELECT_FAILED, clearIntent: true };
  if (intent?.kind === 'buy' && n.text === PURCHASE_DONE) return { to: 'shop', kind: 'ok', text: familyDoneText(intent.family), clearIntent: true };
  if (n.kind === 'error' && n.text === SHOP_UNAVAILABLE && s.saveWarning) return { to: 'none', clearIntent: false };
  return { to: 'shop', kind, text: n.text, clearIntent: false };
}

// Un cambio de familia no trae aviso del servidor: se da por hecho cuando el estado del jugador trae la familia nueva. La
// compra no se resuelve aquí, sino con su aviso, que llega en el mismo frame (routeNotice)
export function familyResolved(intent: FamilyIntent, player: Pick<PlayerView, 'family' | 'families'>): boolean {
  return intent.kind === 'select' && player.family === intent.family;
}

export const isFamily = (f: FamilyChoice): f is ShipFamily => f !== NO_FAMILY;

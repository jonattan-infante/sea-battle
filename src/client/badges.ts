// Insignias de rango (ART-DIRECTION §11.5, D69 y D74; ASSET-SPEC: «copiado tal cual en un módulo propio como los iconos»).
// Una sola tabla para el HUD (RankBadge, src/components/hud/badges.tsx) y para las placas (rankBadgeSvg, overlays.ts, sin
// React). El marcado es el de scripts/ux/calibracion/insignias-1-1.json, elemento a elemento y en el orden de pintado:
// viewBox 0 0 12 12, solo <rect>, <circle> y <polygon>, sin transform ni opacidades y con los trazos centrados en el
// borde. El mismo dibujo en los 4 tamaños (12 en la placa; 16 en el objetivo, el feed y la tienda; 18 en el HUD móvil; 24
// en el panel del jugador y el aviso de nivel): solo cambian width y height. AD-40 (c) compara los dos con el JSON
import type { Rank } from '../game/xp';

export type BadgeSize = 12 | 16 | 18 | 24;

export interface BadgeShape {
  tag: 'rect' | 'circle' | 'polygon';
  attrs: Record<string, string | number>; // con los nombres de SVG (stroke-width)
}

const INK = '#07121B'; // --badge-ink
const BRONZE = '#B4703A'; // --badge-bronze
const SILVER = '#DCE2E8'; // --badge-silver
const GOLD = '#E3A82B'; // --badge-gold

// Marco hueco (fondo de tinta y trazo de 1 en el metal) o lleno (fondo del metal y trazo de 0,5 en tinta)
const frame = { x: 0.5, y: 0.5, width: 11, height: 11, rx: 2.5 };
const hollow = (metal: string): BadgeShape => ({ tag: 'rect', attrs: { ...frame, fill: INK, stroke: metal, 'stroke-width': 1 } });
const solid = (metal: string): BadgeShape => ({ tag: 'rect', attrs: { ...frame, fill: metal, stroke: INK, 'stroke-width': 0.5 } });
const stripe = (y: number, fill: string): BadgeShape => ({ tag: 'rect', attrs: { x: 3, y, width: 6, height: 2, fill } });
const star = (cx: number, cy: number): BadgeShape => ({ tag: 'circle', attrs: { cx, cy, r: 1.4, fill: GOLD } });
const rose: BadgeShape = { tag: 'polygon', attrs: { points: '6,1.4 6.919,5.081 10.6,6 6.919,6.919 6,10.6 5.081,6.919 1.4,6 5.081,5.081', fill: INK } };

// Grumete, Marinero, Contramaestre, Teniente y Almirante (GDD §10b): el metal, el relleno y las marcas suben juntos
export const BADGES: Record<Rank, readonly BadgeShape[]> = {
  1: [hollow(BRONZE), stripe(5, BRONZE)],
  2: [solid(BRONZE), stripe(3, INK), stripe(7, INK)],
  3: [hollow(SILVER), stripe(2, SILVER), stripe(5, SILVER), stripe(8, SILVER)],
  4: [hollow(GOLD), star(6, 3.4), star(3.6, 8.2), star(8.4, 8.2)],
  5: [solid(GOLD), rose]
};

export const BADGE_SVG = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 12 12' } as const;

// Sin clase ni aria en el <svg>: AD-40 (c) solo admite que cambien width y height
export function rankBadgeSvg(rank: Rank, size: BadgeSize): string {
  const body = BADGES[rank].map(({ tag, attrs }) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg xmlns="${BADGE_SVG.xmlns}" viewBox="${BADGE_SVG.viewBox}" width="${size}" height="${size}">${body}</svg>`;
}

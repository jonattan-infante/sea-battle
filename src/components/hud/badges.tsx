// Insignia de rango para el HUD de React (ART-DIRECTION §11.5, D93). El dibujo es la tabla de src/client/badges.ts, la
// misma que escriben las placas; AD-40 (c) compara las dos con scripts/ux/calibracion/insignias-v-1-1.json
import React from 'react';
import type { Rank } from '../../game/xp';
import { BADGE_SVG, BADGES, BadgeNode, BadgeSize, LARGE_BADGE_SVG, LARGE_BADGES, LargeBadgeSize } from '../../client/badges';

export type { BadgeSize, LargeBadgeSize };
export { rankBadgeSvg } from '../../client/badges';

// stroke-width → strokeWidth: React escribe el nombre de SVG
const reactProps = (attrs: Record<string, string | number>) => Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()), v]));

// Sin clase ni aria en el <svg>: AD-40 (c) solo admite que cambien width y height. Quien la usa pone el texto al lado
// («Nivel 13 · Teniente») o el nombre accesible en su contenedor
export function RankBadge({ rank, size }: { rank: Rank; size: BadgeSize }) {
  return (
    <svg xmlns={BADGE_SVG.xmlns} viewBox={BADGE_SVG.viewBox} width={size} height={size}>
      {BADGES[rank].map(({ tag, attrs }, i) => React.createElement(tag, { key: i, ...reactProps(attrs) }))}
    </svg>
  );
}

const node = ({ tag, attrs, children }: BadgeNode, key: number): React.ReactElement =>
  React.createElement(tag, { key, ...reactProps(attrs) }, children?.map(node));

// La grande (`svg_grande`), solo en la tarjeta propia de la pantalla de niveles (64, 48 en 390×844 y 56 en 844×390;
// §12.11). Como la de placa, sin clase ni aria en el <svg>
export function RankBadgeLarge({ rank, size }: { rank: Rank; size: LargeBadgeSize }) {
  return (
    <svg xmlns={LARGE_BADGE_SVG.xmlns} viewBox={LARGE_BADGE_SVG.viewBox} overflow={LARGE_BADGE_SVG.overflow} width={size} height={size}>
      {LARGE_BADGES[rank].map(node)}
    </svg>
  );
}

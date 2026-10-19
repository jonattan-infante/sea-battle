// Insignia de rango para el HUD de React (ART-DIRECTION §11.5, D74). El dibujo es la tabla de src/client/badges.ts, la
// misma que escriben las placas; AD-40 (c) compara las dos con scripts/ux/calibracion/insignias-1-1.json
import React from 'react';
import type { Rank } from '../../game/xp';
import { BADGE_SVG, BADGES, BadgeSize } from '../../client/badges';

export type { BadgeSize };
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

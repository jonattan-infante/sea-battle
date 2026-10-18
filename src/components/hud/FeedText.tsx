// Texto de una línea del feed (y de su aviso en móvil). En una línea de botín (AC-152, ART-DIRECTION §12.9) solo el nombre
// se trunca con «…»: la recompensa va en un tramo que no encoge, y la XP, en --ui-xp. Sin XP no hay tramo de XP, y sin oro
// no hay tramo de oro (GDD §14). Las demás líneas son texto tal cual, como en la 1.0
import React from 'react';
import { rewardParts } from '../../client/hud-logic';
import type { FeedLine } from '../../client/hud-store';

export default function FeedText({ line }: { line: FeedLine }) {
  const r = line.reward;
  if (!r) return <>{line.text}</>;
  const { gold, xp } = rewardParts(r);
  return (
    <span className="feed-text">
      <span>{r.name ? `${r.lead} ` : r.lead}</span>
      {r.name && <span className="feed-text__name">{r.name}</span>}
      <span>
        {gold && ` ${gold}`}
        {xp && <span className="feed-text__xp">{gold ? ` · ${xp}` : ` ${xp}`}</span>}
      </span>
    </span>
  );
}

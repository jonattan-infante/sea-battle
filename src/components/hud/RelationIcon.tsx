// Icono de la relación en el panel del objetivo (ART-DIRECTION §4.3 y §12). La lista es la de la placa (relationIcons),
// así que los dos llevan siempre los mismos iconos (O-39)
import React from 'react';
import type { Relation } from '../../client/hud-store';
import { IconName, relationIcons } from '../../client/overlays';
import { Alert, Anchor, Bomb, Coins, Crown, Shield, Skull, Star, Swords, Wrench } from './icons';

const ICON: Record<IconName, React.ComponentType<{ size?: number }>> = {
  star: Star,
  anchor: Anchor,
  skull: Skull,
  coins: Coins,
  shield: Shield,
  wrench: Wrench,
  swords: Swords,
  alert: Alert,
  crown: Crown,
  bomb: Bomb
};

export default function RelationIcon({ relation, classId, size = 22 }: { relation: Relation; classId?: string; size?: number }) {
  const [main, second] = relationIcons(relation, classId ?? '');
  const Main = ICON[main];
  if (!second) return <Main size={size} />;
  // Capitán y Cañonera piratas: el 2.º icono (corona o bomba) sobre la calavera, en columna (ART-DIRECTION §10)
  const Second = ICON[second];
  return <span className="hud-icon-pair"><Second size={Math.round(size * 0.55)} /><Main size={Math.round(size * 0.75)} /></span>;
}

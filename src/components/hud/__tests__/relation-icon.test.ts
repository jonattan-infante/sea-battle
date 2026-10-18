// O-39 (ART-DIRECTION §4.3, §12): el icono del panel del objetivo. Los hostiles de 2 iconos (Capitán y Cañonera) llevan
// el par en columna, el 2.º a 0,55 sobre la calavera a 0,75; el resto, su icono al tamaño pedido. El marcado esperado se
// construye con los mismos componentes de icons.tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CAPTAIN_CLASS, GUNBOAT_CLASS } from '../../../game/constants';
import type { Relation } from '../../../client/hud-store';
import { Anchor, Bomb, Coins, Crown, Skull, Star } from '../icons';
import RelationIcon from '../RelationIcon';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const icon = (relation: Relation, classId: string, size?: number) => html(React.createElement(RelationIcon, { relation, classId, size }));
const pair = (top: React.ElementType, size: number) =>
  html(React.createElement('span', { className: 'hud-icon-pair' }, React.createElement(top, { size: Math.round(size * 0.55) }), React.createElement(Skull, { size: Math.round(size * 0.75) })));

describe('RelationIcon del panel del objetivo (O-39)', () => {
  for (const size of [22, 18]) {
    test(`a ${size} px: la Cañonera pirata lleva la bomba sobre la calavera, el Capitán la corona; el resto, un icono`, () => {
      expect(icon('pirate', GUNBOAT_CLASS, size)).toBe(pair(Bomb, size));
      expect(icon('pirate', CAPTAIN_CLASS, size)).toBe(pair(Crown, size));
      expect(icon('pirate', 'pirate', size)).toBe(html(React.createElement(Skull, { size })));
      expect(icon('merchant', 'merchant', size)).toBe(html(React.createElement(Coins, { size })));
      expect(icon('self', 'sloop', size)).toBe(html(React.createElement(Star, { size })));
      expect(icon('player', 'sloop', size)).toBe(html(React.createElement(Anchor, { size })));
    });
  }

  test('sin tamaño, el del panel: 22 px, y la bomba de 12 sobre la calavera de 17', () => {
    const gunboat = icon('pirate', GUNBOAT_CLASS);
    expect(gunboat).toBe(pair(Bomb, 22));
    expect(gunboat.match(/<svg width="\d+"/g)).toEqual(['<svg width="12"', '<svg width="17"']);
  });
});

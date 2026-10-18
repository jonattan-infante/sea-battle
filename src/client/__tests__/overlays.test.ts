// O-39 (ART-DIRECTION §4.3, §11.1): los iconos de la placa. La Cañonera pirata y el Capitán pirata llevan 2 (calavera +
// bomba y calavera + corona); el resto, el de su relación. La bomba es la de Lucide tal cual: los elementos de
// https://unpkg.com/lucide-static@0.469.0/icons/bomb.svg (ISC), dentro del <svg> de 24×24 y trazo 2 de iconSvg
import { CAPTAIN_CLASS, GUNBOAT_CLASS } from '../../game/constants';
import { iconSvg, relationIcons } from '../overlays';

const LUCIDE_BOMB_0_469_0 =
  '<circle cx="11" cy="13" r="9"/><path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95"/><path d="m22 2-1.5 1.5"/>';
const inner = (svg: string) => svg.replace(/^<svg [^>]*>/, '').replace(/<\/svg>$/, '');

describe('Iconos de la placa (O-39)', () => {
  test('la Cañonera pirata lleva calavera + bomba; el Capitán, calavera + corona; el resto, el de su relación', () => {
    expect(relationIcons('pirate', GUNBOAT_CLASS)).toEqual(['skull', 'bomb']);
    expect(relationIcons('pirate', CAPTAIN_CLASS)).toEqual(['skull', 'crown']);
    expect(relationIcons('pirate', 'pirate')).toEqual(['skull']);
    expect(relationIcons('merchant', 'merchant')).toEqual(['coins']);
    expect(relationIcons('self', 'sloop')).toEqual(['star']);
    expect(relationIcons('player', 'sloop')).toEqual(['anchor']);
  });

  test('el 2.º icono de la Cañonera es la bomba de lucide-static 0.469.0, a 12 px', () => {
    const svg = iconSvg(relationIcons('pirate', GUNBOAT_CLASS)[1], 12);
    expect(inner(svg)).toBe(LUCIDE_BOMB_0_469_0);
    expect(svg).toMatch(/^<svg [^>]*width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"/);
  });
});

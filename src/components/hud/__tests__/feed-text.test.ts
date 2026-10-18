// AC-152 (ART-DIRECTION §12.9): la línea de botín del feed lleva el nombre en su propio tramo truncable, la recompensa en
// uno que no encoge y la XP en --ui-xp. GDD §14: con 0 XP no sale nada de XP. El texto que se lee es el de rewardText
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Reward, rewardText } from '../../../client/hud-logic';
import { FeedLine } from '../../../client/hud-store';
import FeedText from '../FeedText';

const markup = (line: FeedLine) => renderToStaticMarkup(React.createElement(FeedText, { line }));
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const line = (reward: Reward): FeedLine => ({ id: 1, tone: 'gold', text: rewardText(reward), reward });

describe('Línea de botín del feed (AC-152)', () => {
  test('«Hundiste a Pirata +105 oro · +30 XP»: nombre truncable aparte y la XP en su tramo', () => {
    const html = markup(line({ lead: 'Hundiste a', name: 'Pirata', gold: 105, xp: 30 }));
    expect(html).toBe(
      '<span class="feed-text"><span>Hundiste a </span><span class="feed-text__name">Pirata</span><span> +105 oro<span class="feed-text__xp"> · +30 XP</span></span></span>'
    );
    expect(text(html)).toBe('Hundiste a Pirata +105 oro · +30 XP');
  });

  test('con 0 XP no hay tramo de XP ni «+0 XP»: «Botín +5 oro» (AC-145)', () => {
    const html = markup(line({ lead: 'Botín', name: null, gold: 5, xp: 0 }));
    expect(html).not.toContain('feed-text__xp');
    expect(html).not.toContain('XP');
    expect(text(html)).toBe('Botín +5 oro');
  });

  test('XP sin oro (PvP, quien ayudó): «Botín de combate +40 XP», sin «·»', () => {
    const html = markup(line({ lead: 'Botín de combate', name: null, gold: 0, xp: 40 }));
    expect(html).toContain('<span class="feed-text__xp"> +40 XP</span>');
    expect(text(html)).toBe('Botín de combate +40 XP');
  });

  test('una línea sin botín es su texto tal cual, como en la 1.0', () => {
    expect(markup({ id: 2, tone: 'danger', text: 'Barbarroja te hundió' })).toBe('Barbarroja te hundió');
  });
});

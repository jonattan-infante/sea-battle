// AD-40 (c), D93: el marcado de RankBadge es el de scripts/ux/calibracion/insignias-v-1-1.json en los 5 rangos y los 5
// tamaños de la de placa: los mismos elementos en el mismo orden y los mismos atributos, salvo width y height del <svg>,
// con los números a ±0,001 y los colores sin distinguir mayúsculas. El `rank` del JSON es el de src/game/xp.ts (1 Grumete
// … 5 Almirante). Lo mismo para rankBadgeSvg, la cadena que escriben las placas (overlays.ts, sin React) a 12 px, y para
// RankBadgeLarge frente a `svg_grande` en los 3 tamaños de la tarjeta propia de la pantalla de niveles, con su anidamiento
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Rank, rankLabel } from '../../../game/xp';
import { BadgeSize, LargeBadgeSize, RankBadge, RankBadgeLarge, rankBadgeSvg } from '../badges';

interface El {
  tag: string; // «/defs» para un cierre
  attrs: Record<string, string>;
}

// Los elementos de un SVG en orden, con sus cierres: <x …/> y <x …></x> dan lo mismo, y el anidamiento cuenta
function parse(markup: string): El[] {
  return [...markup.matchAll(/<(\/?)(\w+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g)].flatMap(([, close, tag, raw, self]) => {
    if (close) return [{ tag: `/${tag}`, attrs: {} }];
    const open = { tag, attrs: Object.fromEntries([...raw.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])) };
    return self ? [open, { tag: `/${tag}`, attrs: {} }] : [open];
  });
}

// Igualdad de AD-40 (c): números (o listas de números, como `points`) a ±0,001; el resto, sin distinguir mayúsculas
function sameValue(a: string, b: string): boolean {
  const na = a.trim().split(/[\s,]+/).map(Number);
  const nb = b.trim().split(/[\s,]+/).map(Number);
  if (na.every(Number.isFinite) && nb.every(Number.isFinite)) return na.length === nb.length && na.every((x, i) => Math.abs(x - nb[i]) <= 1e-3);
  return a.toLowerCase() === b.toLowerCase();
}

// Las diferencias entre dos elementos, para que el fallo diga cuál y no solo que no son iguales
function differences(got: El, want: El, ignore: string[] = []): string[] {
  const keys = (e: El) => Object.keys(e.attrs).filter((k) => !ignore.includes(k)).sort();
  const out: string[] = [];
  if (got.tag !== want.tag) out.push(`<${got.tag}> en lugar de <${want.tag}>`);
  if (keys(got).join() !== keys(want).join()) out.push(`atributos [${keys(got)}] en lugar de [${keys(want)}]`);
  for (const k of keys(want)) if (k in got.attrs && !sameValue(got.attrs[k], want.attrs[k])) out.push(`${k}="${got.attrs[k]}" en lugar de "${want.attrs[k]}"`);
  return out;
}

function expectSameMarkup(markup: string, svg: string, size: number) {
  const got = parse(markup);
  const want = parse(svg);
  expect(got[0].tag).toBe('svg');
  expect([got[0].attrs.width, got[0].attrs.height]).toEqual([String(size), String(size)]);
  expect(differences(got[0], want[0], ['width', 'height'])).toEqual([]);
  expect(got.slice(1).map((e) => e.tag)).toEqual(want.slice(1).map((e) => e.tag));
  want.slice(1).forEach((w, i) => expect({ elemento: i + 1, diferencias: differences(got[i + 1], w) }).toEqual({ elemento: i + 1, diferencias: [] }));
}

const SPEC = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../scripts/ux/calibracion/insignias-v-1-1.json'), 'utf8')) as {
  insignias: Record<string, { rank: number; svg: string; svg_grande: string }>;
};
const SIZES: BadgeSize[] = [12, 16, 18, 24, 32];
const LARGE_SIZES: LargeBadgeSize[] = [48, 56, 64];
const CASES = Object.entries(SPEC.insignias).flatMap(([name, b]) => SIZES.map((size) => [name, b.rank, size, b.svg] as const));
const LARGE_CASES = Object.entries(SPEC.insignias).flatMap(([name, b]) => LARGE_SIZES.map((size) => [name, b.rank, size, b.svg_grande] as const));

describe('Insignias de rango en V (AD-40 c, D93)', () => {
  test('el JSON de ux trae las 5 insignias con su rank 1–5, y cada rank es el rango de ese nombre en src/game/xp.ts', () => {
    expect(Object.values(SPEC.insignias).map((b) => b.rank).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const [name, b] of Object.entries(SPEC.insignias)) expect(rankLabel(b.rank as Rank).toLowerCase()).toBe(name);
  });

  const render = {
    RankBadge: (rank: Rank, size: BadgeSize) => renderToStaticMarkup(React.createElement(RankBadge, { rank, size })),
    rankBadgeSvg: (rank: Rank, size: BadgeSize) => rankBadgeSvg(rank, size)
  };
  test.each(Object.keys(render).flatMap((how) => CASES.map((c) => [how as keyof typeof render, ...c] as const)))('%s: %s (rank %d) a %d px, el marcado es el del JSON', (how, _name, rank, size, svg) => {
    expectSameMarkup(render[how](rank as Rank, size), svg, size);
  });

  test.each(LARGE_CASES)('RankBadgeLarge: %s (rank %d) a %d px, el marcado es el de svg_grande', (_name, rank, size, svg) => {
    expectSameMarkup(renderToStaticMarkup(React.createElement(RankBadgeLarge, { rank: rank as Rank, size })), svg, size);
  });
});

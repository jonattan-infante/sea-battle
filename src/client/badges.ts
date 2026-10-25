// Insignias de rango en V (ART-DIRECTION §11.5, D69 y D93; ASSET-SPEC: «copiado tal cual en un módulo propio como los
// iconos»). Una sola tabla para el HUD (RankBadge, src/components/hud/badges.tsx) y para las placas (rankBadgeSvg,
// overlays.ts, sin React). El marcado es el de scripts/ux/calibracion/insignias-v-1-1.json, elemento a elemento y en el
// orden de pintado. La de placa: viewBox 0 0 12 12, solo <polygon> y <rect>, sin transform, opacidades ni trazos, y el
// mismo dibujo en todos sus tamaños (12 en la placa; 16 en el objetivo, el feed y la tienda; 18 en el HUD móvil; 24 en el
// panel del jugador y el aviso de nivel; 32 en la lista de la pantalla de niveles): solo cambian width y height. La grande
// (`svg_grande`), con su metal en degradado y sus sombras, solo en la tarjeta propia de la pantalla de niveles. AD-40 (c)
// compara las dos con el JSON
import type { Rank } from '../game/xp';

export type BadgeSize = 12 | 16 | 18 | 24 | 32;
export type LargeBadgeSize = 48 | 56 | 64;

export interface BadgeShape {
  tag: 'rect' | 'polygon';
  attrs: Record<string, string | number>; // con los nombres de SVG
}

// La grande lleva defs anidadas (degradado y sarga), así que sus elementos pueden tener hijos
export interface BadgeNode {
  tag: string;
  attrs: Record<string, string | number>; // con los nombres de SVG (stop-color, stroke-width)
  children?: readonly BadgeNode[];
}

const INK = '#07121B'; // --badge-ink
const BRONZE = '#B4703A'; // --badge-bronze
const SILVER = '#DCE2E8'; // --badge-silver
const GOLD = '#E3A82B'; // --badge-gold

// Con 3 decimales, como el JSON (10.2 y no 10.200000000000001)
const n = (x: number) => String(+x.toFixed(3));
const pts = (p: readonly (readonly [number, number])[]) => p.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');

// Octógono de esquinas cortadas a 45° entre a y b, con corte c: el parche va de 0 a 12 y el campo, 1 px por dentro, con
// corte c − 0,414
const octagon = (a: number, b: number, c: number) =>
  pts([[a + c, a], [b - c, a], [b, a + c], [b, b - c], [b - c, b], [a + c, b], [a, b - c], [a, a + c]]);
const patchPts = (c: number) => octagon(0, 12, c);
const fieldPts = (c: number) => octagon(1, 11, c - 0.414);

// Galón de 6 vértices con la punta arriba, de x0 a 12 − x0: el lado en y, la punta en tip y el grueso t
interface Chevron { x0: number; y: number; tip: number; t: number }
const chevronPts = ({ x0, y, tip, t }: Chevron) => pts([[x0, y], [6, tip], [12 - x0, y], [12 - x0, y + t], [6, tip + t], [x0, y + t]]);
// Su pespunte (la grande): a 0,35 de los extremos y a mitad del grueso
const stitchPts = ({ x0, y, tip, t }: Chevron) => pts([[x0 + 0.35, y + t / 2], [6, tip + t / 2], [12 - x0 - 0.35, y + t / 2]]);

// Barras del Teniente: 1,6 × 7,2 desde y 2,4
const BAR = { y: 2.4, width: 1.6, height: 7.2 };
const BARS = [3.6, 6.8];

// Rosa de 8 puntas centrada en (6, 6): puntas largas de 4,6 y cortas de 3,0 cada 45°, con la cintura de 1,3 entre ellas
const ROSE_TIPS = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => polar(k * 45, k % 2 ? 3 : 4.6));
const ROSE_WAIST = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => polar(k * 45 + 22.5, 1.3));
function polar(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [6 + r * Math.sin(a), 6 - r * Math.cos(a)];
}
const rosePts = pts(ROSE_TIPS.flatMap((tip, k) => [tip, ROSE_WAIST[k]]));

// Grumete, Marinero, Contramaestre, Teniente y Almirante (GDD §10b): el metal, el relleno y las marcas suben juntos
interface Spec { metal: string; solid: boolean; c: number; chevrons?: readonly Chevron[]; bars?: true; rose?: true }
const SPECS: Record<Rank, Spec> = {
  1: { metal: BRONZE, solid: false, c: 1.8, chevrons: [{ x0: 2.4, y: 6.8, tip: 4, t: 2 }] },
  2: { metal: BRONZE, solid: false, c: 2.6, chevrons: [{ x0: 2.6, y: 5.2, tip: 3, t: 1.2 }, { x0: 2.6, y: 8.2, tip: 6, t: 1.2 }] },
  3: { metal: SILVER, solid: true, c: 1.8, chevrons: [{ x0: 2.4, y: 2.8, tip: 1.4, t: 1.2 }, { x0: 2.4, y: 5.8, tip: 4.4, t: 1.2 }, { x0: 2.4, y: 8.8, tip: 7.4, t: 1.2 }] },
  4: { metal: GOLD, solid: false, c: 1.8, bars: true },
  5: { metal: GOLD, solid: true, c: 2.6, rose: true }
};

// La de placa. Hueca: el parche del metal, el campo de tinta y las marcas del metal; llena: parche y campo del metal y las
// marcas de tinta
function plate({ metal, solid, c, chevrons = [], bars, rose }: Spec): BadgeShape[] {
  const mark = solid ? INK : metal;
  return [
    { tag: 'polygon', attrs: { points: patchPts(c), fill: metal } },
    { tag: 'polygon', attrs: { points: fieldPts(c), fill: solid ? metal : INK } },
    ...chevrons.map((ch): BadgeShape => ({ tag: 'polygon', attrs: { points: chevronPts(ch), fill: mark } })),
    ...(bars ? BARS.map((x): BadgeShape => ({ tag: 'rect', attrs: { x, ...BAR, fill: mark } })) : []),
    ...(rose ? [{ tag: 'polygon' as const, attrs: { points: rosePts, fill: mark } }] : [])
  ];
}

export const BADGES: Record<Rank, readonly BadgeShape[]> = { 1: plate(SPECS[1]), 2: plate(SPECS[2]), 3: plate(SPECS[3]), 4: plate(SPECS[4]), 5: plate(SPECS[5]) };

// La grande: el metal en degradado de 3 paradas (claro arriba a la izquierda, el metal y oscuro abajo), con su id de
// prefijo rb-: si hay varias en la página, sus defs son idénticas
const LIGHT: Record<string, string> = { [BRONZE]: '#EDB98A', [SILVER]: '#FFFFFF', [GOLD]: '#FFE9A6' };
const DARK: Record<string, string> = { [BRONZE]: '#5E3417', [SILVER]: '#7D8894', [GOLD]: '#7E550C' };
const GRADIENT_ID: Record<string, string> = { [BRONZE]: 'rb-gb', [SILVER]: 'rb-gs', [GOLD]: 'rb-gg' };
const SHADOW = '#000000';
const FACET = '#22323F'; // la cara clara de cada punta de la rosa

const gradient = (metal: string): BadgeNode => ({
  tag: 'linearGradient',
  attrs: { id: GRADIENT_ID[metal], x1: 0, y1: 0, x2: 0.35, y2: 1 },
  children: [
    { tag: 'stop', attrs: { offset: 0, 'stop-color': LIGHT[metal] } },
    { tag: 'stop', attrs: { offset: 0.5, 'stop-color': metal } },
    { tag: 'stop', attrs: { offset: 1, 'stop-color': DARK[metal] } }
  ]
});
// La sarga del campo de las huecas
const TWILL: BadgeNode = {
  tag: 'pattern',
  attrs: { id: 'rb-tw', patternUnits: 'userSpaceOnUse', width: 0.7, height: 0.7, patternTransform: 'rotate(45)' },
  children: [
    { tag: 'rect', attrs: { width: 0.7, height: 0.7, fill: INK } },
    { tag: 'rect', attrs: { width: 0.16, height: 0.7, fill: '#11273A' } }
  ]
};
const shadow = (tag: string, attrs: Record<string, string | number>, opacity: number, dx: number, dy: number): BadgeNode => ({
  tag,
  attrs: { ...attrs, fill: SHADOW, opacity, transform: `translate(${dx},${dy})` }
});
const stitch = (points: string, stroke: string): BadgeNode => ({
  tag: 'polyline',
  attrs: { points, fill: 'none', stroke, 'stroke-width': 0.09, 'stroke-dasharray': '0.32 0.22' }
});

function large({ metal, solid, c, chevrons = [], bars, rose }: Spec): BadgeNode[] {
  const url = `url(#${GRADIENT_ID[metal]})`;
  const light = LIGHT[metal];
  const dark = DARK[metal];
  const out: BadgeNode[] = [
    { tag: 'defs', attrs: {}, children: solid ? [gradient(metal)] : [gradient(metal), TWILL] },
    shadow('polygon', { points: patchPts(c) }, 0.5, 0.3, 0.4),
    { tag: 'polygon', attrs: { points: patchPts(c), fill: url, stroke: dark, 'stroke-width': 0.22 } },
    { tag: 'polygon', attrs: { points: fieldPts(c), fill: solid ? url : 'url(#rb-tw)', stroke: dark, 'stroke-width': 0.14 } }
  ];
  // El canto claro de las huecas, arriba y a la izquierda
  if (!solid) out.push({ tag: 'polyline', attrs: { points: pts([[0, 12 - c], [0, c], [c, 0], [12 - c, 0]]), fill: 'none', stroke: light, 'stroke-width': 0.18, 'stroke-linejoin': 'miter' } });
  for (const ch of chevrons) {
    const points = chevronPts(ch);
    // Hueca: la marca del metal con su sombra y el pespunte oscuro; llena: hundida en tinta con un borde de luz
    if (solid) out.push({ tag: 'polygon', attrs: { points, fill: light, transform: 'translate(0.14,0.16)' } }, { tag: 'polygon', attrs: { points, fill: INK } }, stitch(stitchPts(ch), light));
    else out.push(shadow('polygon', { points }, 0.55, 0.16, 0.22), { tag: 'polygon', attrs: { points, fill: url, stroke: dark, 'stroke-width': 0.12 } }, stitch(stitchPts(ch), dark));
  }
  if (bars)
    for (const x of BARS)
      out.push(
        shadow('rect', { x, ...BAR }, 0.55, 0.16, 0.22),
        { tag: 'rect', attrs: { x, ...BAR, fill: url, stroke: dark, 'stroke-width': 0.12 } },
        // El brillo de la barra
        { tag: 'rect', attrs: { x: n(x + 0.15), y: n(BAR.y + 0.2), width: 0.352, height: n(BAR.height - 0.4), fill: light } }
      );
  // La rosa, en facetas: cada punta, clara hacia la cintura de antes y oscura hacia la de después
  if (rose) {
    out.push(shadow('polygon', { points: rosePts }, 0.45, 0.18, 0.24));
    ROSE_TIPS.forEach((tip, k) => {
      out.push({ tag: 'polygon', attrs: { points: pts([[6, 6], tip, ROSE_WAIST[(k + 7) % 8]]), fill: FACET } });
      out.push({ tag: 'polygon', attrs: { points: pts([[6, 6], tip, ROSE_WAIST[k]]), fill: INK } });
    });
  }
  return out;
}

export const LARGE_BADGES: Record<Rank, readonly BadgeNode[]> = { 1: large(SPECS[1]), 2: large(SPECS[2]), 3: large(SPECS[3]), 4: large(SPECS[4]), 5: large(SPECS[5]) };

export const BADGE_SVG = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 12 12' } as const;
// La sombra de la grande sale 0,4 por abajo y por la derecha
export const LARGE_BADGE_SVG = { ...BADGE_SVG, overflow: 'visible' } as const;

const attrList = (attrs: Record<string, string | number>) => Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('');

// Sin clase ni aria en el <svg>: AD-40 (c) solo admite que cambien width y height
export function rankBadgeSvg(rank: Rank, size: BadgeSize): string {
  const body = BADGES[rank].map(({ tag, attrs }) => `<${tag}${attrList(attrs)}/>`).join('');
  return `<svg xmlns="${BADGE_SVG.xmlns}" viewBox="${BADGE_SVG.viewBox}" width="${size}" height="${size}">${body}</svg>`;
}

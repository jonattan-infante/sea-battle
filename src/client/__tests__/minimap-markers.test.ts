// Marcadores del minimapa (ART-DIRECTION §4.3), a DPR 1 y 2. O-40 (D43): la Cañonera pirata es un ▬ de 11 × 5 px,
// horizontal en cualquier rumbo. D63 (D87): el pirata es un ◆ de 8 px de diagonal, el mercante un ■ de 7 y el otro
// jugador un ○ de 8, con la banda de su color de radio 2 a 3,5 px y el contorno de 1 a 4,5 (el centro, vacío). Se graba lo
// que dibuja drawShipMarker con un contexto falso: el trazado entre beginPath y fill, y el relleno y cada trazo (color y
// grosor) en el momento de fill y stroke
import { GUNBOAT_CLASS } from '../../game/constants';
import { AnchorContext, drawPortAnchor, drawShipMarker, MarkerContext, PORT_ANCHOR_SCALE } from '../minimap-markers';

interface Drawn {
  path: unknown[][];
  fill: string | null;
  strokes: { color: string; width: number }[];
}

function record(kind: 'player' | 'pirate' | 'merchant', classId: string, heading: number, x: number, y: number, dpr: number): Drawn {
  const out: Drawn = { path: [], fill: null, strokes: [] };
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 0 };
  const ctx = {
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v: string) { state.fillStyle = v; },
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v: string) { state.strokeStyle = v; },
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v: number) { state.lineWidth = v; },
    beginPath: () => { out.path = []; },
    moveTo: (...a: number[]) => out.path.push(['moveTo', ...a]),
    lineTo: (...a: number[]) => out.path.push(['lineTo', ...a]),
    closePath: () => out.path.push(['closePath']),
    rect: (...a: number[]) => out.path.push(['rect', ...a]),
    arc: (...a: number[]) => out.path.push(['arc', ...a]),
    fill: () => { out.fill = state.fillStyle; },
    stroke: () => { out.strokes.push({ color: state.strokeStyle, width: state.lineWidth }); }
  } as unknown as MarkerContext;
  drawShipMarker(ctx, { kind, classId, heading }, x, y, dpr);
  return out;
}

const CORAL = '#FF7A7A';
const OUTLINE = '#07121B';
const HEADINGS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
const AT = { x: 123.25, y: 87.5 };

describe('Marcadores del minimapa (O-40 y D63)', () => {
  for (const dpr of [1, 2]) {
    test(`a DPR ${dpr}: la Cañonera es un ▬ de 11 × 5 px CSS centrado en su posición, coral y con contorno de 1 px`, () => {
      const d = record('pirate', GUNBOAT_CLASS, 0, AT.x, AT.y, dpr);
      expect(d.path).toEqual([['rect', AT.x - 5.5 * dpr, AT.y - 2.5 * dpr, 11 * dpr, 5 * dpr]]);
      const [, x, y, w, h] = d.path[0] as number[];
      expect([w / dpr, h / dpr, (x + w / 2 - AT.x) / dpr, (y + h / 2 - AT.y) / dpr]).toEqual([11, 5, 0, 0]);
      expect(d.fill).toBe(CORAL);
      expect(d.strokes).toEqual([{ color: OUTLINE, width: dpr }]);
    });

    test(`a DPR ${dpr}: el ▬ de la Cañonera es el mismo en 8 rumbos (no gira)`, () => {
      const base = record('pirate', GUNBOAT_CLASS, 0, AT.x, AT.y, dpr);
      for (const heading of HEADINGS) expect(record('pirate', GUNBOAT_CLASS, heading, AT.x, AT.y, dpr)).toEqual(base);
    });

    test(`D63 a DPR ${dpr}: el pirata es un ◆ de 8 px de diagonal, coral y con contorno de 1 px`, () => {
      const r = 4 * dpr;
      expect(record('pirate', 'pirate', 1, AT.x, AT.y, dpr)).toEqual({
        path: [['moveTo', AT.x, AT.y - r], ['lineTo', AT.x + r, AT.y], ['lineTo', AT.x, AT.y + r], ['lineTo', AT.x - r, AT.y], ['closePath']],
        fill: CORAL,
        strokes: [{ color: OUTLINE, width: dpr }]
      });
    });

    test(`D63 a DPR ${dpr}: el mercante es un ■ de 7 px de lado, azul y con contorno de 1 px`, () => {
      expect(record('merchant', 'merchant', 1, AT.x, AT.y, dpr)).toEqual({
        path: [['rect', AT.x - 3.5 * dpr, AT.y - 3.5 * dpr, 7 * dpr, 7 * dpr]],
        fill: '#6CC3F5',
        strokes: [{ color: OUTLINE, width: dpr }]
      });
    });

    test(`D63 a DPR ${dpr}: el otro jugador es un ○ de 8 px: banda de radio 2 a 3,5 px, contorno de 1 a 4,5 y el centro vacío`, () => {
      const d = record('player', 'sloop', 1, AT.x, AT.y, dpr);
      expect(d).toEqual({
        path: [['arc', AT.x, AT.y, 2.75 * dpr, 0, Math.PI * 2]],
        fill: null,
        strokes: [{ color: OUTLINE, width: 3.5 * dpr }, { color: '#F5F1E6', width: 1.5 * dpr }]
      });
      // Los radios en px CSS: el trazo va centrado en el círculo, así que cubre de r − ancho / 2 a r + ancho / 2
      const r = (d.path[0][3] as number) / dpr;
      expect(d.strokes.map((s) => [r - s.width / dpr / 2, r + s.width / dpr / 2])).toEqual([[1, 4.5], [2, 3.5]]);
    });
  }
});

// ⚓ del puerto (D73, D87; ART-DIRECTION §4.3, aclarado en r11 52dd3a1): se graba la transformación, el trazado en las
// unidades del viewBox de 24 y cada trazo con su color, su grosor y sus extremos
function recordAnchor(x: number, y: number, dpr: number) {
  const calls: unknown[][] = [];
  const path: unknown[][] = [];
  const strokes: { color: string; width: number; cap: string; join: string }[] = [];
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: 'butt', lineJoin: 'miter' };
  const ctx = {
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v: string) { state.fillStyle = v; },
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v: string) { state.strokeStyle = v; },
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v: number) { state.lineWidth = v; },
    get lineCap() { return state.lineCap; },
    set lineCap(v: string) { state.lineCap = v; },
    get lineJoin() { return state.lineJoin; },
    set lineJoin(v: string) { state.lineJoin = v; },
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    translate: (...a: number[]) => calls.push(['translate', ...a]),
    scale: (...a: number[]) => calls.push(['scale', ...a]),
    beginPath: () => { path.length = 0; },
    moveTo: (...a: number[]) => path.push(['moveTo', ...a]),
    lineTo: (...a: number[]) => path.push(['lineTo', ...a]),
    closePath: () => path.push(['closePath']),
    rect: (...a: number[]) => path.push(['rect', ...a]),
    arc: (...a: number[]) => path.push(['arc', ...a]),
    ellipse: (...a: number[]) => path.push(['ellipse', ...a]),
    fill: () => calls.push(['fill']),
    stroke: () => strokes.push({ color: state.strokeStyle, width: state.lineWidth, cap: state.lineCap, join: state.lineJoin })
  } as unknown as AnchorContext;
  drawPortAnchor(ctx, x, y, dpr, SAND);
  return { calls, path, strokes };
}

const SAND = '#E6CF9A';
// El SVG de la lámina D87: <circle cx="12" cy="5" r="2.5"/> y <path d="M12 7.5V19.5M7 11h10M5 13a7 6.5 0 0 0 14 0"/>, con
// las 4 llamadas de §4.3 (r11 dfed3c6). El arco, con sweep 0 de (5, 13) a (19, 13), es la mitad de abajo de la elipse de
// centro (12, 13): pasa por (12, 19,5). Cada pieza empieza con su moveTo: sin él, el canvas la uniría con una recta
const D87_ANCHOR = [
  ['moveTo', 14.5, 5],
  ['arc', 12, 5, 2.5, 0, Math.PI * 2],
  ['moveTo', 12, 7.5],
  ['lineTo', 12, 19.5],
  ['moveTo', 7, 11],
  ['lineTo', 17, 11],
  ['moveTo', 5, 13],
  ['ellipse', 12, 13, 7, 6.5, 0, Math.PI, 0, true]
];

describe('⚓ del puerto en el minimapa (D73, D87)', () => {
  for (const dpr of [1, 2]) {
    test(`a DPR ${dpr}: es el ancla de la lámina D87, de 13 px de alto y 10,7 de ancho, centrada en el puerto`, () => {
      const { calls, path } = recordAnchor(91, 91, dpr);
      expect(path).toEqual(D87_ANCHOR);
      const k = PORT_ANCHOR_SCALE * dpr;
      expect(calls).toEqual([['save'], ['translate', 91, 91], ['scale', k, k], ['translate', -12, -11], ['restore']]);
      // La caja del ancla en el viewBox (x 5–19, y 2,5–19,5) llevada a px CSS por la transformación
      const toCss = (vx: number, vy: number) => [(91 + (vx - 12) * k) / dpr, (91 + (vy - 11) * k) / dpr];
      const [x0, y0] = toCss(5, 2.5);
      const [x1, y1] = toCss(19, 19.5);
      expect([y1 - y0, x1 - x0, (x0 + x1) / 2, (y0 + y1) / 2].map((v) => +v.toFixed(3))).toEqual([13, 10.706, +(91 / dpr).toFixed(3), +(91 / dpr).toFixed(3)]);
    });

    test(`a DPR ${dpr}: trazo de 1,5 px en arena sobre uno de 3,5 px #07121B, con extremos y uniones redondos`, () => {
      const { strokes } = recordAnchor(91, 91, dpr);
      const k = PORT_ANCHOR_SCALE * dpr;
      expect(strokes.map((s) => [s.color, +((s.width * k) / dpr).toFixed(6), s.cap, s.join])).toEqual([
        [OUTLINE, 3.5, 'round', 'round'],
        [SAND, 1.5, 'round', 'round']
      ]);
    });
  }
});

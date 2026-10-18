// O-40 (ART-DIRECTION §4.3, D43): la Cañonera pirata sale en el minimapa como un ▬ de 11 × 5 px, horizontal en cualquier
// rumbo, a DPR 1 y 2. Se graba lo que dibuja drawShipMarker con un contexto falso: el trazado entre beginPath y fill, y el
// relleno, el contorno y su grosor en el momento de fill y stroke. El pirata (◆ 7), el mercante (■ 6) y el jugador (● 5)
// siguen como estaban (D63 espera a D87)
import { GUNBOAT_CLASS } from '../../game/constants';
import { drawShipMarker, MarkerContext } from '../minimap-markers';

interface Drawn {
  path: unknown[][];
  fill: string | null;
  stroke: { color: string; width: number } | null;
}

function record(kind: 'player' | 'pirate' | 'merchant', classId: string, heading: number, x: number, y: number, dpr: number): Drawn {
  const out: Drawn = { path: [], fill: null, stroke: null };
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
    stroke: () => { out.stroke = { color: state.strokeStyle, width: state.lineWidth }; }
  } as unknown as MarkerContext;
  drawShipMarker(ctx, { kind, classId, heading }, x, y, dpr);
  return out;
}

const CORAL = '#FF7A7A';
const OUTLINE = '#07121B';
const HEADINGS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
const AT = { x: 123.25, y: 87.5 };

describe('Marcadores del minimapa (O-40)', () => {
  for (const dpr of [1, 2]) {
    test(`a DPR ${dpr}: la Cañonera es un ▬ de 11 × 5 px CSS centrado en su posición, coral y con contorno de 1 px`, () => {
      const d = record('pirate', GUNBOAT_CLASS, 0, AT.x, AT.y, dpr);
      expect(d.path).toEqual([['rect', AT.x - 5.5 * dpr, AT.y - 2.5 * dpr, 11 * dpr, 5 * dpr]]);
      const [, x, y, w, h] = d.path[0] as number[];
      expect([w / dpr, h / dpr, (x + w / 2 - AT.x) / dpr, (y + h / 2 - AT.y) / dpr]).toEqual([11, 5, 0, 0]);
      expect(d.fill).toBe(CORAL);
      expect(d.stroke).toEqual({ color: OUTLINE, width: dpr });
    });

    test(`a DPR ${dpr}: el ▬ de la Cañonera es el mismo en 8 rumbos (no gira)`, () => {
      const base = record('pirate', GUNBOAT_CLASS, 0, AT.x, AT.y, dpr);
      for (const heading of HEADINGS) expect(record('pirate', GUNBOAT_CLASS, heading, AT.x, AT.y, dpr)).toEqual(base);
    });

    test(`a DPR ${dpr}: el pirata sigue con el ◆ de 7 px, el mercante con el ■ de 6 y el jugador con el ● de 5`, () => {
      const r = 3.5 * dpr;
      expect(record('pirate', 'pirate', 1, AT.x, AT.y, dpr)).toEqual({
        path: [['moveTo', AT.x, AT.y - r], ['lineTo', AT.x + r, AT.y], ['lineTo', AT.x, AT.y + r], ['lineTo', AT.x - r, AT.y], ['closePath']],
        fill: CORAL,
        stroke: { color: OUTLINE, width: dpr }
      });
      expect(record('merchant', 'merchant', 1, AT.x, AT.y, dpr)).toEqual({
        path: [['rect', AT.x - 3 * dpr, AT.y - 3 * dpr, 6 * dpr, 6 * dpr]],
        fill: '#6CC3F5',
        stroke: { color: OUTLINE, width: dpr }
      });
      expect(record('player', 'sloop', 1, AT.x, AT.y, dpr)).toEqual({
        path: [['arc', AT.x, AT.y, 2.5 * dpr, 0, Math.PI * 2]],
        fill: '#F5F1E6',
        stroke: { color: OUTLINE, width: dpr }
      });
    });
  }
});

// Marcadores del minimapa (ART-DIRECTION §4.3), a DPR 1 y 2. O-40 (D43): la Cañonera pirata es un ▬ de 11 × 5 px,
// horizontal en cualquier rumbo. D63 (D87): el pirata es un ◆ de 8 px de diagonal, el mercante un ■ de 7 y el otro
// jugador un ○ de 8, con la banda de su color de radio 2 a 3,5 px y el contorno de 1 a 4,5 (el centro, vacío). Se graba lo
// que dibuja drawShipMarker con un contexto falso: el trazado entre beginPath y fill, y el relleno y cada trazo (color y
// grosor) en el momento de fill y stroke
import { GUNBOAT_CLASS, ISLAND_SHAPES_1_1, ISLANDS, MAP_1_0, MAP_1_1, MAP_HALF_SIZE, PORT_SHAPE_1_1, SAFE_ZONE_RADIUS } from '../../game/constants';
import {
  AnchorContext,
  drawIslands,
  drawPlaces,
  drawPort,
  drawPortAnchor,
  drawShipMarker,
  MarkerContext,
  MinimapIsland,
  PlacesContext,
  PORT_ANCHOR_SCALE
} from '../minimap-markers';

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

// Islas del minimapa (§4.3, D87): un disco de arena por círculo, de radio max(1,5 px, r), sin los del puerto. Con el mapa
// del juego (el de la 1.0), con el de la 1.1 (sus 43 círculos de D83) y, para las reglas que esos mapas no tocan (el
// mínimo de 1,5 px), con círculos de prueba
function recordIslands(islands: readonly MinimapIsland[], cssSize: number, dpr: number): unknown[][] {
  const calls: unknown[][] = [];
  const state = { fillStyle: '' };
  const ctx = {
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v: string) { state.fillStyle = v; },
    beginPath: () => calls.push(['beginPath']),
    arc: (...a: number[]) => calls.push(['arc', ...a]),
    fill: () => calls.push(['fill', state.fillStyle])
  } as unknown as MarkerContext;
  const s = (cssSize * dpr) / (MAP_HALF_SIZE * 2);
  drawIslands(ctx, islands, (x) => (x + MAP_HALF_SIZE) * s, (z) => (z + MAP_HALF_SIZE) * s, s, dpr, SAND);
  return calls;
}

// Lo esperado: por cada círculo, beginPath, el arco entero y el relleno de arena
function discs(islands: readonly MinimapIsland[], cssSize: number, dpr: number): unknown[][] {
  const s = (cssSize * dpr) / (MAP_HALF_SIZE * 2);
  return islands.flatMap((i) => [['beginPath'], ['arc', (i.x + MAP_HALF_SIZE) * s, (i.z + MAP_HALF_SIZE) * s, Math.max(1.5 * dpr, i.radius * s), 0, Math.PI * 2], ['fill', SAND]]);
}

describe('Islas del minimapa, círculo a círculo (D87)', () => {
  for (const dpr of [1, 2]) {
    for (const cssSize of [182, 86, 70]) {
      test(`a DPR ${dpr} y ${cssSize} px: un disco de arena por círculo del mapa, sin el del puerto`, () => {
        expect(recordIslands(ISLANDS, cssSize, dpr)).toEqual(discs(ISLANDS.filter((i) => i.id !== 'PORT'), cssSize, dpr));
      });

      test(`D87 a DPR ${dpr} y ${cssSize} px: con el mapa de la 1.1, un disco de arena por cada uno de los 43 círculos de D83, sin los 7 del puerto`, () => {
        const isles = ISLAND_SHAPES_1_1.filter((sh) => sh.id !== 'PORT').flatMap((sh) => sh.circles.map((c) => ({ id: sh.id, ...c })));
        expect(isles).toHaveLength(43);
        expect(MAP_1_1.islands).toHaveLength(50);
        expect(recordIslands(MAP_1_1.islands, cssSize, dpr)).toEqual(discs(isles, cssSize, dpr));
      });
    }

    test(`a DPR ${dpr}: un islote más pequeño que 1,5 px sale como un punto de 3 px`, () => {
      // Un escollo de 7 m en el canvas de 70 px: 7 × 0,07 = 0,49 px a DPR 1
      const reef = { id: 'E1a', x: 140, z: 260, radius: 7 };
      const [, arc] = recordIslands([reef], 70, dpr);
      expect(arc[3]).toBe(1.5 * dpr);
    });

    test(`a DPR ${dpr}: drawIslands no pinta ningún círculo de un puerto de varios círculos («PORT.k»): los pinta drawPort`, () => {
      const port = [0, 1, 2].map((k) => ({ id: `PORT.${k}`, x: 10 * k, z: 0, radius: 12 }));
      // No es del puerto: solo empieza igual. De 12 m (2,2 px a DPR 1), para que este test no dependa del mínimo de 1,5 px
      const near = { id: 'PORTX', x: 0, z: 40, radius: 12 };
      expect(recordIslands([...port, near], 182, dpr)).toEqual(discs([near], 182, dpr));
    });
  }
});

// El puerto en el minimapa (§4.3, «El puerto, en 2 tiempos», y D96, lámina docs/game/art/D96-minimapa-puerto.png): su
// costa círculo a círculo, un disco #07121B de 10 px CSS × DPR que la tapa, el ⚓ encima y, encima de todo, el círculo
// discontinuo de la zona segura. Se graba cada llamada del contexto en orden, y el relleno y el trazo con su estado
function recordCanvas(draw: (ctx: PlacesContext) => void): unknown[][] {
  const ops: unknown[][] = [];
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: 'butt', lineJoin: 'miter', dash: [] as number[] };
  const op = (name: string) => (...a: unknown[]) => { ops.push([name, ...a]); };
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
    save: op('save'),
    restore: op('restore'),
    translate: op('translate'),
    scale: op('scale'),
    beginPath: op('beginPath'),
    moveTo: op('moveTo'),
    lineTo: op('lineTo'),
    closePath: op('closePath'),
    rect: op('rect'),
    arc: op('arc'),
    ellipse: op('ellipse'),
    setLineDash: (v: number[]) => { state.dash = [...v]; ops.push(['setLineDash', [...v]]); },
    fill: () => ops.push(['fill', state.fillStyle]),
    stroke: () => ops.push(['stroke', state.strokeStyle, state.lineWidth, state.dash.join(',')])
  } as unknown as PlacesContext;
  draw(ctx);
  return ops;
}

const ZONE = 'rgba(108, 195, 245, 0.85)';
const SIZES = [182, 86, 70];
const scale = (cssSize: number, dpr: number) => Math.round(cssSize * dpr) / (MAP_HALF_SIZE * 2);
const toPx = (s: number) => (v: number) => (v + MAP_HALF_SIZE) * s;
const portOps = (islands: readonly MinimapIsland[], cssSize: number, dpr: number) => {
  const s = scale(cssSize, dpr);
  return recordCanvas((ctx) => drawPort(ctx, islands, toPx(s), toPx(s), s, dpr, SAND));
};
// Lo que dibuja el ⚓ solo, en el centro del puerto (0, 0)
const anchorOps = (cssSize: number, dpr: number) => {
  const c = toPx(scale(cssSize, dpr))(0);
  return recordCanvas((ctx) => drawPortAnchor(ctx, c, c, dpr, SAND));
};
const placesOps = (islands: readonly MinimapIsland[], cssSize: number, dpr: number) => {
  const s = scale(cssSize, dpr);
  return recordCanvas((ctx) => drawPlaces(ctx, islands, toPx(s), toPx(s), s, dpr, { sand: SAND, zone: ZONE }));
};
// El círculo discontinuo de la zona segura: 1 px, rayas de 3 px, centrado en el puerto
const zoneOps = (cssSize: number, dpr: number) => {
  const s = scale(cssSize, dpr);
  const c = toPx(s)(0);
  return [
    ['beginPath'],
    ['setLineDash', [3 * dpr, 3 * dpr]],
    ['arc', c, c, SAFE_ZONE_RADIUS * s, 0, Math.PI * 2],
    ['stroke', ZONE, dpr, `${3 * dpr},${3 * dpr}`],
    ['setLineDash', []]
  ];
};
// Los 7 círculos del puerto de D92 (GDD §4; los de la v3 de scripts/ux/mapa/puerto_forma.py, que pinta la lámina D96)
const COAST = PORT_SHAPE_1_1.circles.map((c, k) => ({ id: `PORT.${k}`, ...c }));

describe('El puerto en el minimapa: costa, disco y ⚓ (D87, D96)', () => {
  test('el puerto de D92 tiene 7 círculos, en el mapa de la 1.1 como «PORT.0»…«PORT.6»', () => {
    expect(COAST).toHaveLength(7);
    expect(MAP_1_1.islands.filter((i) => i.id.startsWith('PORT'))).toEqual(COAST);
  });

  for (const dpr of [1, 2]) {
    for (const cssSize of SIZES) {
      test(`D96 a DPR ${dpr} y ${cssSize} px: la costa del puerto círculo a círculo, encima el disco #07121B de 10 px de radio centrado en el puerto y encima el ⚓`, () => {
        const c = toPx(scale(cssSize, dpr))(0);
        expect(portOps(MAP_1_1.islands, cssSize, dpr)).toEqual([
          ...discs(COAST, cssSize, dpr),
          ['beginPath'],
          ['arc', c, c, 10 * dpr, 0, Math.PI * 2],
          ['fill', OUTLINE],
          ...anchorOps(cssSize, dpr)
        ]);
      });

      test(`a DPR ${dpr} y ${cssSize} px: con el puerto de un solo círculo de la 1.0 («PORT»), solo el ⚓, sin costa ni disco (D73)`, () => {
        expect(portOps(MAP_1_0.islands, cssSize, dpr)).toEqual(anchorOps(cssSize, dpr));
      });

      test(`D96 a DPR ${dpr} y ${cssSize} px: orden de capas: islas, costa del puerto, disco, ⚓ y, encima, el círculo discontinuo de la zona segura`, () => {
        const c = toPx(scale(cssSize, dpr))(0);
        const isles = MAP_1_1.islands.filter((i) => !i.id.startsWith('PORT'));
        expect(placesOps(MAP_1_1.islands, cssSize, dpr)).toEqual([
          ...discs(isles, cssSize, dpr),
          ...discs(COAST, cssSize, dpr),
          ['beginPath'],
          ['arc', c, c, 10 * dpr, 0, Math.PI * 2],
          ['fill', OUTLINE],
          ...anchorOps(cssSize, dpr),
          ...zoneOps(cssSize, dpr)
        ]);
      });

      test(`a DPR ${dpr} y ${cssSize} px: con el mapa del juego (el de la 1.0), los lugares del minimapa son los del candidato: islas, ⚓ y zona segura`, () => {
        expect(placesOps(MAP_1_0.islands, cssSize, dpr)).toEqual([
          ...discs(ISLANDS.filter((i) => i.id !== 'PORT'), cssSize, dpr),
          ...anchorOps(cssSize, dpr),
          ...zoneOps(cssSize, dpr)
        ]);
      });
    }
  }

  // Las medidas de la lámina (ART-DIRECTION :1780, de coast_peek de lamina_minimapa_puerto.py): con lo que dibuja drawPort,
  // muestreado en el centro de cada píxel del canvas como la lámina, la costa del puerto ocupa 155,0, 41,9 y 32,9 px² CSS
  // y fuera del disco asoman 1,0, 0,0 y 0,0, en 182 px a DPR 1 y en 86 y 70 px a DPR 3
  const LAMINA = [
    { cssSize: 182, dpr: 1, coast: 155.0, peek: 1.0 },
    { cssSize: 86, dpr: 3, coast: 41.9, peek: 0.0 },
    { cssSize: 70, dpr: 3, coast: 32.9, peek: 0.0 }
  ];
  const dec = (v: number) => v.toFixed(1).replace('.', ',');
  for (const { cssSize, dpr, coast, peek } of LAMINA) {
    test(`D96 en ${cssSize} px a DPR ${dpr}: la costa ocupa ${dec(coast)} px² y el disco la tapa salvo ${dec(peek)} px², como en la lámina`, () => {
      // Cada relleno con los arcos de su trazado: los de arena son la costa y el #07121B, el disco
      const fills: { color: string; arcs: number[][] }[] = [];
      let arcs: number[][] = [];
      for (const [name, ...a] of portOps(MAP_1_1.islands, cssSize, dpr)) {
        if (name === 'beginPath') arcs = [];
        else if (name === 'arc') arcs.push(a as number[]);
        else if (name === 'fill') fills.push({ color: a[0] as string, arcs });
      }
      const inside = (list: number[][], x: number, y: number) => list.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) <= r);
      const land = fills.filter((f) => f.color === SAND).flatMap((f) => f.arcs);
      const disc = fills.filter((f) => f.color === OUTLINE).flatMap((f) => f.arcs);
      expect([land.length, disc.length]).toEqual([7, 1]);
      const size = Math.round(cssSize * dpr);
      let landPx = 0;
      let peekPx = 0;
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          if (!inside(land, i + 0.5, j + 0.5)) continue;
          landPx++;
          if (!inside(disc, i + 0.5, j + 0.5)) peekPx++;
        }
      }
      const css2 = (n: number) => Math.round((n / dpr ** 2) * 10) / 10;
      console.log(`D96 ${cssSize} px a DPR ${dpr}: costa ${dec(css2(landPx))} px², asoma ${dec(css2(peekPx))} px²`);
      expect([css2(landPx), css2(peekPx)]).toEqual([coast, peek]);
    });
  }
});

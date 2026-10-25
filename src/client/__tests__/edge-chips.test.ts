// Indicadores de borde (E13, ART-DIRECTION §12.8, D89): placeChip contra place() de la lámina de ux, que es la que aprobó
// Jonattan. scripts/ux/calibracion/d89-place.json lo escribe scripts/ux/d89-place.py con place() del commit de su campo
// `fuente` (r11 87b7488): las 6 pantallas de la lámina, con los mismos argumentos que les pasa build(), y casos sintéticos
// en los que el lado de la distancia no converge en 3 vueltas. Cada caso trae el ancho de la pastilla que midió Python
import fs from 'fs';
import path from 'path';
import {
  AttackerTracker,
  CHIP,
  CHIP_TIMING,
  USABLE_FRAME,
  angleError,
  attackOpacity,
  chipSize,
  cross,
  halfShape,
  insideFrame,
  placeChip,
  pulseScale,
  shapeEdge,
  visibleAttackers,
  type Box,
  type ChipKind,
  type ChipSize,
  type Frame,
  type Pt
} from '../edge-chips';

interface Row {
  vw: number;
  vh: number;
  frame: number[];
  size: string;
  kind: string;
  blocks: number[][];
  origin: number[];
  target: number[];
  labelW: number;
  p: number[];
  naive: number[];
  travel: number;
  side: string;
  ang: number;
  box: number[];
}

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../scripts/ux/calibracion/d89-place.json'), 'utf8')) as {
  fuente: string;
  screens: (Row & { scene: string; mode: string; dCenter: number })[];
  unsettled: Row[];
};

const frameOf = ([l, t, r, b]: number[]): Frame => ({ l, t, r, b });
const place = (c: Row) =>
  placeChip(
    c.vw,
    c.vh,
    frameOf(c.frame),
    c.blocks as unknown as Box[],
    c.origin as unknown as Pt,
    c.target as unknown as Pt,
    c.kind as ChipKind,
    c.size as ChipSize,
    c.labelW
  );
const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
// La caja reserva 18 px de pastilla (16 + 2) del lado de la distancia
const reserved = (y: number, box: Box, kind: ChipKind, size: ChipSize) => {
  const h = halfShape(kind, size);
  return { above: y - box[1] - h, below: box[3] - y - h };
};

describe('placeChip: la regla de la lámina D89', () => {
  test.each(fixture.screens.map((c) => [`${c.scene} ${c.mode}`, c] as const))(
    '%s cae donde lo dibujó ux: posición, rayo, deslizamiento, lado de la distancia, ángulo y caja',
    (_, c) => {
      const got = place(c);
      close([got.x, got.y], c.p);
      close(got.naive, c.naive);
      expect(got.travel).toBe(c.travel);
      expect(got.side).toBe(c.side);
      expect(got.ang).toBeCloseTo(c.ang, 9);
      close(got.box, c.box);
    }
  );

  test('las pantallas cubren los dos chips, los dos tamaños y un deslizamiento por un bloque', () => {
    const s = fixture.screens;
    expect(new Set(s.map((c) => c.kind))).toEqual(new Set(['self', 'attacker']));
    expect(new Set(s.map((c) => c.size))).toEqual(new Set(['desk', 'touch']));
    expect(s.some((c) => c.travel > 0)).toBe(true);
    expect(new Set(s.map((c) => c.side))).toEqual(new Set(['above', 'below']));
  });

  test('si el lado no converge en 3 vueltas, el lado y la caja salen de la misma vuelta, como place()', () => {
    const sideOf = (rad: number) => (rad * (180 / Math.PI) >= 45 && rad * (180 / Math.PI) <= 135 ? 'above' : 'below');
    expect(fixture.unsettled.length).toBeGreaterThan(0);
    for (const c of fixture.unsettled) {
      expect(sideOf(c.ang)).not.toBe(c.side); // de verdad sin converger: el triángulo final pide el otro lado
      const got = place(c);
      close([got.x, got.y], c.p); // la posición y la caja son las de la última vuelta, como en place()
      close(got.box, c.box);
      expect(got.side).toBe(c.side); // el lado que reservó la caja (place() de 87b7488)
      const r = reserved(got.y, got.box, c.kind as ChipKind, c.size as ChipSize);
      expect(r[got.side]).toBeCloseTo(CHIP.labelH + CHIP.labelGap, 9);
    }
  });
});

describe('placeChip: invariantes en una rejilla de destinos', () => {
  const vw = 1440;
  const vh = 900;
  const frame = USABLE_FRAME.desktop;
  const blocks: Box[] = [
    [16, 16, 312, 104],
    [1240, 16, 1424, 56],
    [1240, 64, 1424, 272],
    [1240, 280, 1424, 320],
    [552, 808, 888, 884],
    [16, 859, 376, 883]
  ];
  const origin: Pt = [vw / 2, vh / 2];
  const cases: [ChipKind, ChipSize, number][] = [
    ['self', 'desk', 46],
    ['attacker', 'touch', 54]
  ];
  const targets: Pt[] = [];
  for (let a = 0; a < 360; a += 7.5) {
    const rad = (a * Math.PI) / 180;
    targets.push([origin[0] + 2000 * Math.cos(rad), origin[1] + 2000 * Math.sin(rad)]);
  }

  test.each(cases)('%s %s: borde del marco, sin bloques a < 8 px, triángulo al barco y pastilla de su lado', (kind, size, labelW) => {
    const h = halfShape(kind, size);
    const L = Math.max(h, labelW / 2);
    for (const target of targets) {
      const got = placeChip(vw, vh, frame, blocks, origin, target, kind, size, labelW);
      for (const B of blocks) expect(cross(got.box, B, CHIP.gap)).toBe(false);
      expect(angleError(got, target)).toBeLessThan(1e-9);
      expect(reserved(got.y, got.box, kind, size)[got.side]).toBeCloseTo(CHIP.labelH + CHIP.labelGap, 9);
      // en el borde del recorte: el marco útil metido L a los lados y la media forma más la pastilla arriba y abajo
      const top = got.y - got.box[1];
      const bot = got.box[3] - got.y;
      const onX = Math.abs(got.x - (frame.l + L)) < 1e-6 || Math.abs(got.x - (vw - frame.r - L)) < 1e-6;
      const onY = Math.abs(got.y - (frame.t + top)) < 1e-6 || Math.abs(got.y - (vh - frame.b - bot)) < 1e-6;
      expect(onX || onY).toBe(true);
    }
  });

  test('tocar un bloque a 8 px exactos cuenta como libre (desigualdades estrictas, como cross() de la lámina)', () => {
    expect(cross([0, 0, 10, 10], [18, 0, 30, 10], 8)).toBe(false);
    expect(cross([0, 0, 10, 10], [17.5, 0, 30, 10], 8)).toBe(true);
  });

  test('un segundo chip en casi la misma dirección queda a ≥ 52 px del primero', () => {
    const a = placeChip(vw, vh, frame, blocks, origin, [origin[0] + 2000, origin[1] + 300], 'attacker', 'desk', 54);
    const b = placeChip(vw, vh, frame, blocks, origin, [origin[0] + 2000, origin[1] + 320], 'attacker', 'desk', 54, {
      avoid: [[a.x, a.y]]
    });
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(CHIP.apart);
    expect(b.travel).toBeGreaterThan(0);
    for (const B of blocks) expect(cross(b.box, B, CHIP.gap)).toBe(false);
  });
});

describe('Atacantes y marco útil (§12.8)', () => {
  test('se ven los 3 más cercanos; el resto se suma en el 3.º como «+N»', () => {
    const all = [{ dist: 300 }, { dist: 120 }, { dist: 450 }, { dist: 80 }, { dist: 200 }];
    expect(visibleAttackers(all)).toEqual([
      { item: { dist: 80 }, more: 0 },
      { item: { dist: 120 }, more: 0 },
      { item: { dist: 200 }, more: 2 }
    ]);
    expect(visibleAttackers(all.slice(0, 3)).map((v) => v.more)).toEqual([0, 0, 0]);
  });

  test('el marco útil es el de §12.8 y un barco tapado por la barra de acciones cuenta como fuera', () => {
    expect(USABLE_FRAME).toEqual({
      desktop: { l: 16, t: 120, r: 16, b: 108 },
      portrait: { l: 12, t: 116, r: 12, b: 104 },
      landscape: { l: 12, t: 12, r: 12, b: 12 }
    });
    expect(insideFrame(1440, 900, USABLE_FRAME.desktop, 720, 792)).toBe(true);
    expect(insideFrame(1440, 900, USABLE_FRAME.desktop, 720, 793)).toBe(false);
    expect(insideFrame(390, 844, USABLE_FRAME.portrait, 195, 115)).toBe(false);
  });
});

describe('Forma, tiempos y atacantes (§12.8)', () => {
  test('el borde del rombo: 18 / 20 px en los lados (a 45°) y la esquina redondeada en los ejes; el círculo, su radio', () => {
    expect(shapeEdge('self', 'desk', 1.234)).toBe(22);
    expect(shapeEdge('self', 'touch', 0)).toBe(24);
    expect(shapeEdge('attacker', 'desk', Math.PI / 4)).toBeCloseTo(18, 9);
    expect(shapeEdge('attacker', 'touch', (-3 * Math.PI) / 4)).toBeCloseTo(20, 9);
    // en un eje, la esquina: centro del arco a (s/2 − 6)·√2 y su radio de 6
    expect(shapeEdge('attacker', 'desk', 0)).toBeCloseTo(12 * Math.SQRT2 + 6, 9);
    expect(shapeEdge('attacker', 'touch', Math.PI / 2)).toBeCloseTo(14 * Math.SQRT2 + 6, 9);
    // nunca más allá de la media diagonal del cuadrado sin redondear
    for (let a = 0; a < 2 * Math.PI; a += 0.05) expect(shapeEdge('attacker', 'desk', a)).toBeLessThanOrEqual(halfShape('attacker', 'desk') + 1e-9);
  });

  test('el chip de escritorio es el de 44 / 36 y en los dos móviles el de 48 / 40', () => {
    expect([chipSize('desktop'), chipSize('portrait'), chipSize('landscape')]).toEqual(['desk', 'touch', 'touch']);
  });

  test('cada andanada contra ti renueva 3 s; luego se desvanece en 300 ms y se olvida; las de otros no cuentan', () => {
    const t = new AttackerTracker();
    t.volley('p1', 'me', 'me', 0);
    t.volley('p2', 'otro', 'me', 0); // a otro barco
    t.volley('me', 'p1', 'me', 0); // la propia
    expect(t.active(0).map((a) => a.id)).toEqual(['p1']);
    t.volley('p1', 'me', 'me', 2000);
    const [a] = t.active(4999);
    expect(attackOpacity(a, 4999)).toBe(1);
    expect(attackOpacity(a, 5000)).toBe(1);
    expect(attackOpacity(a, 5150)).toBeCloseTo(0.5, 9);
    expect(t.active(5299)).toHaveLength(1);
    expect(t.active(2000 + CHIP_TIMING.holdMs + CHIP_TIMING.fadeMs)).toHaveLength(0);
  });

  test('cada impacto con daño de un atacante lo hace latir: 1,0 → 1,15 a los 90 ms → 1,0 a los 180', () => {
    const t = new AttackerTracker();
    t.volley('p1', 'me', 'me', 0);
    t.impact('me', 'p1', 0, 'me', 100); // sin daño no late
    t.impact('me', 'p9', 30, 'me', 100); // de quien no te ha disparado
    const [a] = t.active(100);
    expect(pulseScale(a, 100)).toBe(1);
    t.impact('me', 'p1', 30, 'me', 1000);
    expect(pulseScale(a, 1000)).toBe(1);
    expect(pulseScale(a, 1045)).toBeCloseTo(1.075, 9);
    expect(pulseScale(a, 1090)).toBeCloseTo(1.15, 9);
    expect(pulseScale(a, 1180)).toBe(1);
  });
});

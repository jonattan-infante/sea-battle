// AC-24 y AD-06 (ART-DIRECTION §6.2, U8/D26): encuadre por alcance. R = máx(alcance del cañón propio, 65 m) y ppm₀ es
// el máximo con el que el círculo de radio R cabe entero dentro de las reservas del HUD
import { CAMERA, computePpm0, frameRangeM, HUD_RESERVE, hudLayout, ZOOM } from '../art';
import { CANNON_LEVELS, SHIP_CLASSES } from '../../game/constants';

const ranges = CANNON_LEVELS.map((c) => frameRangeM(c.range));

// Tabla de §6.2 (2 decimales); null = la tabla no da la cifra
const TABLE: [number, number, (number | null)[]][] = [
  [1440, 900, [6.2, 5.76, 5.04]],
  [390, 844, [2.82, 2.61, 2.29]],
  [844, 390, [3.44, null, 2.79]]
];

describe('Encuadre por alcance (AC-24, AD-06)', () => {
  test('R = 65 / 70 / 80 m con los cañones N1 / N2 / N3', () => {
    expect(ranges).toEqual([65, 70, 80]);
  });

  test('ningún hostil dispara desde más lejos que el R mínimo (si un NPC alcanza más, R tiene que subir)', () => {
    for (const c of Object.values(SHIP_CLASSES)) expect(c.cannon?.range ?? 0).toBeLessThanOrEqual(ZOOM.hostileRangeM);
  });

  test.each(TABLE)('%i×%i: ppm₀ de la tabla de §6.2 por nivel de cañón', (w, h, expected) => {
    expected.forEach((ppm, i) => {
      if (ppm !== null) expect(Math.abs(computePpm0(w, h, ranges[i]) - ppm)).toBeLessThanOrEqual(0.0051);
    });
  });

  // AD-06: cabe en [12, W−12] × [top, H−bottom] y el eje que manda toca su borde: el vertical en escritorio y en
  // horizontal, el horizontal en móvil vertical
  test.each(TABLE)('%i×%i: el círculo de R cabe entero y el eje que manda toca el borde del área útil (±1 px)', (w, h) => {
    const layout = hudLayout(w, h);
    const reserve = HUD_RESERVE[layout];
    const halfW = w / 2 - ZOOM.sideMarginPx;
    const halfH = h / 2 - Math.max(reserve.top, reserve.bottom);
    for (const r of ranges) {
      const ppm = computePpm0(w, h, r);
      const x = r * ppm; // semieje horizontal del círculo en pantalla
      const y = r * ppm * Math.sin(CAMERA.elevation); // semieje vertical (el suelo se ve con sin θ)
      expect(x).toBeLessThanOrEqual(halfW + 1e-9);
      expect(y).toBeLessThanOrEqual(halfH + 1e-9);
      expect(layout === 'portrait' ? halfW - x : halfH - y).toBeLessThanOrEqual(1);
    }
  });
});

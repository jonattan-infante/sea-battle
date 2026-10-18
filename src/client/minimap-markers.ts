// Marcadores de los barcos en el minimapa (ART-DIRECTION §4.3, D43 y D63), en px del canvas (px CSS × dpr). Se rellenan
// con el color de su relación y llevan un contorno de 1 px #07121B; el ○ del otro jugador es un anillo con el contorno
// por dentro y por fuera. Ninguno gira con el rumbo: solo el ▲ propio, que dibuja Minimap.tsx junto con el ★ del Capitán
import { GUNBOAT_CLASS } from '../game/constants';
import type { RenderShip } from './game-client';

export const MARKER_COLORS = {
  player: '#F5F1E6',
  pirate: '#FF7A7A',
  merchant: '#6CC3F5',
  outline: '#07121B'
} as const;

export type MarkerContext = Pick<
  CanvasRenderingContext2D,
  'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'rect' | 'arc' | 'fill' | 'stroke' | 'fillStyle' | 'strokeStyle' | 'lineWidth'
>;

export function drawShipMarker(ctx: MarkerContext, ship: Pick<RenderShip, 'kind' | 'classId' | 'heading'>, x: number, y: number, dpr: number): void {
  ctx.beginPath();
  if (ship.kind === 'pirate' && ship.classId === GUNBOAT_CLASS) {
    ctx.rect(x - 5.5 * dpr, y - 2.5 * dpr, 11 * dpr, 5 * dpr); // ▬ 11 × 5 px, siempre horizontal (O-40)
    ctx.fillStyle = MARKER_COLORS.pirate;
  } else if (ship.kind === 'pirate') {
    const r = 4 * dpr; // ◆ 8 px de diagonal (D63)
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fillStyle = MARKER_COLORS.pirate;
  } else if (ship.kind === 'merchant') {
    const h = 3.5 * dpr; // ■ 7 px (D63)
    ctx.rect(x - h, y - h, h * 2, h * 2);
    ctx.fillStyle = MARKER_COLORS.merchant;
  } else {
    // ○ 8 px (D63): banda del color del jugador de radio 2 a 3,5 px, con el contorno de 1 px por dentro y por fuera (de 1 a
    // 4,5 px) y el centro vacío. Dos trazos sobre el mismo círculo de radio 2,75: el contorno de 3,5 px y la banda de 1,5
    ctx.arc(x, y, 2.75 * dpr, 0, Math.PI * 2);
    ctx.lineWidth = 3.5 * dpr;
    ctx.strokeStyle = MARKER_COLORS.outline;
    ctx.stroke();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = MARKER_COLORS.player;
    ctx.stroke();
    return;
  }
  ctx.fill();
  ctx.lineWidth = dpr;
  ctx.strokeStyle = MARKER_COLORS.outline;
  ctx.stroke();
}

// ⚓ del puerto (D73, D87; ART-DIRECTION §4.3): el ancla de la lámina D87, no el Anchor de icons.tsx (el de las placas). En
// su viewBox de 24 ocupa de x 5 a 19 y de y 2,5 a 19,5 (17 unidades), así que va escalada a 13 px de alto (0,765 px por
// unidad) con el centro de su caja, (12, 11), en el puerto. Trazo de 1,5 px en arena sobre uno de 3,5 px #07121B (el
// contorno de 1 px), con extremos y uniones redondos. Son las llamadas de §4.3 equivalentes a su SVG (anillo, caña hasta
// 19,5, cruceta y el arco «M5 13a7 6.5 0 0 0 14 0», la mitad de abajo de la elipse de centro (12, 13)), cada pieza con su
// moveTo para que no se una a la anterior con una recta
export const PORT_ANCHOR_SCALE = 13 / 17;

export type AnchorContext = MarkerContext & Pick<CanvasRenderingContext2D, 'save' | 'restore' | 'translate' | 'scale' | 'ellipse' | 'lineCap' | 'lineJoin'>;

export function drawPortAnchor(ctx: AnchorContext, x: number, y: number, dpr: number, fill: string): void {
  const k = PORT_ANCHOR_SCALE * dpr;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-12, -11);
  ctx.beginPath();
  ctx.moveTo(14.5, 5);
  ctx.arc(12, 5, 2.5, 0, Math.PI * 2);
  ctx.moveTo(12, 7.5);
  ctx.lineTo(12, 19.5);
  ctx.moveTo(7, 11);
  ctx.lineTo(17, 11);
  ctx.moveTo(5, 13);
  ctx.ellipse(12, 13, 7, 6.5, 0, Math.PI, 0, true);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5 / PORT_ANCHOR_SCALE;
  ctx.strokeStyle = MARKER_COLORS.outline;
  ctx.stroke();
  ctx.lineWidth = 1.5 / PORT_ANCHOR_SCALE;
  ctx.strokeStyle = fill;
  ctx.stroke();
  ctx.restore();
}

// Islas del minimapa (§4.3, D87): un disco del color de la arena por cada círculo del mapa, de radio max(1,5 px, r), así
// que las islas con lóbulos salen con su forma y los islotes como puntos de 3 px. Sin el puerto, que lo representa su ⚓
// (D73): su círculo se llama «PORT» o, si el puerto tiene varios, «PORT.0», «PORT.1»… (así nombra los círculos el mapa
// de la 1.1)
export type MinimapIsland = { id: string; x: number; z: number; radius: number };

export function isPortCircle(id: string): boolean {
  return id === 'PORT' || id.startsWith('PORT.');
}

export function drawIslands(ctx: MarkerContext, islands: readonly MinimapIsland[], px: (x: number) => number, py: (z: number) => number, s: number, dpr: number, fill: string): void {
  for (const isl of islands) {
    if (isPortCircle(isl.id)) continue;
    ctx.beginPath();
    ctx.arc(px(isl.x), py(isl.z), Math.max(1.5 * dpr, isl.radius * s), 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

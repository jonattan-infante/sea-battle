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

'use client';
// Minimapa (P1, ART-DIRECTION §12.1 y §4.3): canvas 2D redibujado a 2 Hz, sin commits de React (AC-77). El sector va
// en el pie del mismo panel (D39), sobre su fondo, y el panel entero es un bloque del HUD para las placas (§11.4).
// Pantalla: +X a la derecha y −Z arriba (norte), igual que la cámara del juego.
import React, { useEffect, useRef } from 'react';
import { CAPTAIN_CLASS, INTEREST_RADIUS, MAP_HALF_SIZE } from '../../game/constants';
import type { GameClient, RenderShip } from '../../client/game-client';
import { sectorOf } from '../../client/hud-logic';
import { drawPlaces, drawShipMarker, MARKER_COLORS } from '../../client/minimap-markers';

const REDRAW_MS = 500;
const COLORS = {
  ocean: 'rgba(26, 95, 134, 0.9)',
  sand: '#E6CF9A',
  grass: '#5E9E48',
  zone: 'rgba(108, 195, 245, 0.85)',
  self: '#FFD166',
  ...MARKER_COLORS
};

export interface ViewRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// ★ del Capitán pirata: 5 puntas, punta arriba, radio exterior 5,5 px e interior 2,2 px (ART-DIRECTION §4.3, D43)
function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number): void {
  ctx.moveTo(x, y - outer);
  for (let i = 1; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i * Math.PI) / 5;
    ctx.lineTo(x + Math.sin(a) * r, y - Math.cos(a) * r);
  }
  ctx.closePath();
}

export default function Minimap({
  client,
  islands,
  viewRect,
  onView
}: {
  client: GameClient;
  islands: { id: string; x: number; z: number; radius: number }[];
  viewRect?: () => ViewRect | null;
  onView?: (x: number, z: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const coordsRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let lastCoords = '';
    let lastHalo = '';

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.round(rect.width * dpr);
      if (canvas.width !== size) {
        canvas.width = size;
        canvas.height = size;
      }
      const s = size / (MAP_HALF_SIZE * 2);
      const px = (x: number) => (x + MAP_HALF_SIZE) * s;
      const py = (z: number) => (z + MAP_HALF_SIZE) * s;

      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = COLORS.ocean;
      ctx.fillRect(0, 0, size, size);
      // Islas, el puerto (su costa bajo el disco de D96 y el ⚓) y la zona segura: debajo de todas las entidades
      drawPlaces(ctx, islands, px, py, s, dpr, COLORS);

      // Rectángulo de la vista: 1 px blanco al 60 % (§12.1)
      const view = viewRect?.();
      if (view) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = dpr;
        ctx.strokeRect(px(view.minX), py(view.minZ), (view.maxX - view.minX) * s, (view.maxZ - view.minZ) * s);
      }

      const me = client.getShip(client.myShipId);
      if (me) {
        // Área de interés: lo que el servidor nos cuenta
        ctx.beginPath();
        ctx.arc(px(me.x), py(me.z), INTEREST_RADIUS * s, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.stroke();
      }

      // Orden de dibujo (D43): mercantes y jugadores, piratas y cañoneras (drawShipMarker), el capitán y, encima de todo,
      // el ▲ propio. El capitán llega siempre, también fuera del área de interés (GDD §13), y su marcador desaparece al hundirse
      let captain: RenderShip | null = null;
      for (const hostile of [false, true]) for (const ship of client.getShips()) {
        if (ship.state === 'dead' || ship.id === client.myShipId || (ship.kind === 'pirate') !== hostile) continue;
        if (ship.classId === CAPTAIN_CLASS) {
          if (ship.state === 'alive') captain = ship;
          continue;
        }
        drawShipMarker(ctx, ship, px(ship.x), py(ship.z), dpr);
      }

      if (captain) {
        ctx.beginPath();
        starPath(ctx, px(captain.x), py(captain.z), 5.5 * dpr, 2.2 * dpr);
        ctx.fillStyle = COLORS.pirate;
        ctx.fill();
        ctx.lineWidth = dpr;
        ctx.strokeStyle = COLORS.outline;
        ctx.stroke();
      }
      // Halo que late (CSS): aquí solo se coloca, en px CSS dentro del panel, y solo se escribe si cambia
      const halo = haloRef.current;
      const hx = captain ? ((captain.x + MAP_HALF_SIZE) / (MAP_HALF_SIZE * 2)) * rect.width : 0;
      const hy = captain ? ((captain.z + MAP_HALF_SIZE) / (MAP_HALF_SIZE * 2)) * rect.width : 0;
      const haloKey = captain ? `${captain.id}|${hx.toFixed(1)}|${hy.toFixed(1)}` : '';
      if (halo && haloKey !== lastHalo) {
        lastHalo = haloKey;
        if (captain) {
          halo.style.left = `${hx.toFixed(1)}px`;
          halo.style.top = `${hy.toFixed(1)}px`;
          halo.dataset.shipId = captain.id;
          halo.style.display = 'block';
        } else {
          halo.style.display = 'none';
          delete halo.dataset.shipId;
        }
      }

      if (me) {
        // ▲ 10 px orientado según el rumbo: forward = (sin h, cos h) en (x, z) = (x, y) del canvas
        const x = px(me.x);
        const y = py(me.z);
        const fx = Math.sin(me.heading);
        const fy = Math.cos(me.heading);
        const r = 5 * dpr;
        ctx.beginPath();
        ctx.moveTo(x + fx * r, y + fy * r);
        ctx.lineTo(x - fx * r * 0.7 + fy * r * 0.6, y - fy * r * 0.7 - fx * r * 0.6);
        ctx.lineTo(x - fx * r * 0.7 - fy * r * 0.6, y - fy * r * 0.7 + fx * r * 0.6);
        ctx.closePath();
        ctx.fillStyle = COLORS.self;
        ctx.fill();
        ctx.lineWidth = dpr;
        ctx.strokeStyle = COLORS.outline;
        ctx.stroke();

        const coords = `Sector ${sectorOf(me.x, me.z)} · X ${Math.round(me.x)} Z ${Math.round(me.z)}`.replace(/-/g, '−');
        if (coords !== lastCoords && coordsRef.current) {
          lastCoords = coords;
          coordsRef.current.textContent = coords;
        }
      }
    };

    draw();
    const id = setInterval(draw, REDRAW_MS);
    return () => clearInterval(id);
  }, [client, islands, viewRect]);

  // Vista libre (E13, AC-117): un clic o un arrastre en el minimapa centra la vista en ese punto del mundo, sin navegar
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false;
    const toView = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const x = ((e.clientX - r.left) / r.width) * 2 * MAP_HALF_SIZE - MAP_HALF_SIZE;
      const z = ((e.clientY - r.top) / r.height) * 2 * MAP_HALF_SIZE - MAP_HALF_SIZE;
      onViewRef.current?.(x, z);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      try {
        canvas.setPointerCapture?.(e.pointerId); // con captura, el arrastre sigue aunque el puntero salga del minimapa
      } catch {
        // un PointerEvent sintético no es un puntero activo
      }
      toView(e);
    };
    const move = (e: PointerEvent) => {
      if (dragging) toView(e);
    };
    const up = () => {
      dragging = false;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <section className="panel hud-minimap" aria-label="Minimapa" data-testid="minimap" data-hud-block="">
      <canvas ref={canvasRef} style={{ touchAction: 'none' }} />
      <svg className="hud-minimap__halo" ref={haloRef} viewBox="0 0 24 24" data-testid="minimap-captain" aria-hidden="true">
        <circle cx="12" cy="12" r="11.25" />
      </svg>
      <div className="hud-coords" ref={coordsRef} data-testid="coords" />
    </section>
  );
}

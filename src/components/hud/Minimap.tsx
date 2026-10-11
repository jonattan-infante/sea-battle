'use client';
// Minimapa (P1, ART-DIRECTION §12.1 y §4.3): canvas 2D redibujado a 2 Hz, sin commits de React (AC-77).
// Pantalla: +X a la derecha y −Z arriba (norte), igual que la cámara del juego.
import React, { useEffect, useRef } from 'react';
import { INTEREST_RADIUS, MAP_HALF_SIZE, PORT_POSITION, SAFE_ZONE_RADIUS } from '../../game/constants';
import type { GameClient } from '../../client/game-client';

const REDRAW_MS = 500;
const COLORS = {
  ocean: 'rgba(26, 95, 134, 0.9)',
  sand: '#E6CF9A',
  grass: '#5E9E48',
  zone: 'rgba(108, 195, 245, 0.85)',
  self: '#FFD166',
  player: '#F5F1E6',
  pirate: '#FF7A7A',
  merchant: '#6CC3F5',
  outline: '#07121B'
};

// "Sector E5": columnas A–J de oeste a este y filas 1–10 de norte a sur, en celdas de 100 m
export function sectorOf(x: number, z: number): string {
  const col = Math.max(0, Math.min(9, Math.floor((x + MAP_HALF_SIZE) / 100)));
  const row = Math.max(0, Math.min(9, Math.floor((z + MAP_HALF_SIZE) / 100)));
  return `${'ABCDEFGHIJ'[col]}${row + 1}`;
}

export interface ViewRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export default function Minimap({ client, islands, viewRect }: { client: GameClient; islands: { x: number; z: number; radius: number }[]; viewRect?: () => ViewRect | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coordsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let lastCoords = '';

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
      for (const isl of islands) {
        ctx.beginPath();
        ctx.arc(px(isl.x), py(isl.z), Math.max(1.5 * dpr, isl.radius * s), 0, Math.PI * 2);
        ctx.fillStyle = COLORS.sand;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.arc(px(PORT_POSITION.x), py(PORT_POSITION.z), SAFE_ZONE_RADIUS * s, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.zone;
      ctx.lineWidth = dpr;
      ctx.stroke();
      ctx.setLineDash([]);

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

      for (const ship of client.getShips()) {
        if (ship.state === 'dead' || ship.id === client.myShipId) continue;
        const x = px(ship.x);
        const y = py(ship.z);
        ctx.beginPath();
        if (ship.kind === 'pirate') {
          const r = 3.5 * dpr; // ◆ 7 px
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r, y);
          ctx.lineTo(x, y + r);
          ctx.lineTo(x - r, y);
          ctx.closePath();
          ctx.fillStyle = COLORS.pirate;
        } else if (ship.kind === 'merchant') {
          const h = 3 * dpr; // ■ 6 px
          ctx.rect(x - h, y - h, h * 2, h * 2);
          ctx.fillStyle = COLORS.merchant;
        } else {
          ctx.arc(x, y, 2.5 * dpr, 0, Math.PI * 2); // ● 5 px
          ctx.fillStyle = COLORS.player;
        }
        ctx.fill();
        ctx.lineWidth = dpr;
        ctx.strokeStyle = COLORS.outline;
        ctx.stroke();
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

  return (
    <>
      <section className="panel hud-minimap" aria-label="Minimapa" data-testid="minimap">
        <canvas ref={canvasRef} />
      </section>
      <div className="hud-coords" ref={coordsRef} data-testid="coords" />
    </>
  );
}

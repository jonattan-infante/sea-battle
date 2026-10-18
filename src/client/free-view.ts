// Vista libre (E13, GDD §5): seguimiento ↔ vista libre, sin DOM ni three.js para probarlo con Jest. La entrada (lienzo,
// teclado y minimapa) le pasa punteros, flechas y puntos del mapa; el runtime le pide el foco de la cámara en cada frame.
// Los viewAt salen por `send`: como mucho 2/s mientras la vista se mueve (gana el último), ninguno con la vista quieta y
// un null al volver al seguimiento (GDD §13, AC-123)
import { MAP_HALF_SIZE } from '../game/constants';

export const FREE_VIEW = {
  dragPx: 12, // más de 12 px es arrastrar la vista; al soltar con ≤ 12 px, un clic (AC-116)
  arrowSpeed: 150, // m/s con una flecha pulsada (AC-118: 300 ±30 m en 2 s)
  returnMs: 300, // transición al volver al seguimiento (AC-119)
  sendEveryMs: 500 // viewAt ≤ 2/s (AC-123)
} as const;

type Point = { x: number; z: number };
export type ViewMode = 'follow' | 'free' | 'returning';
export type Arrow = 'up' | 'down' | 'left' | 'right';

// Arriba en pantalla es −Z (la cámara mira hacia −Z desde +Z) y la derecha, +X (runtime.ts, CAM_RIGHT)
const ARROW_DIR: Record<Arrow, Point> = { up: { x: 0, z: -1 }, down: { x: 0, z: 1 }, left: { x: -1, z: 0 }, right: { x: 1, z: 0 } };
const easeOut = (t: number) => 1 - (1 - t) * (1 - t); // la misma curva que el resto de transiciones de cámara (runtime.ts)

interface Press {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  dragging: boolean;
}

export class FreeView {
  mode: ViewMode = 'follow';
  private center: Point = { x: 0, z: 0 };
  private lastFocus: Point = { x: 0, z: 0 };
  private returnFrom: Point = { x: 0, z: 0 };
  private returnAt = 0;
  private press: Press | null = null;
  private readonly arrows = new Set<Arrow>();
  private sent: Point | null = null; // lo último que tiene el servidor
  private sentAt = -Infinity;
  private dirty = false;

  constructor(
    private readonly send: (center: Point | null) => void,
    private readonly onFreeChange: (free: boolean) => void = () => {},
    private readonly mapHalf = MAP_HALF_SIZE // el límite de AC-120 sigue al mapa
  ) {}

  get free(): boolean {
    return this.mode === 'free';
  }

  // Foco de la cámara en este frame: el barco en seguimiento, el centro de la vista en libre y una mezcla durante la vuelta
  focus(ship: Point | null, now: number): Point | null {
    let p: Point | null = ship;
    if (this.mode === 'free') p = this.center;
    else if (this.mode === 'returning') {
      const k = (now - this.returnAt) / FREE_VIEW.returnMs;
      if (k >= 1 || !ship) this.mode = 'follow';
      else {
        const e = easeOut(k);
        p = { x: this.returnFrom.x + (ship.x - this.returnFrom.x) * e, z: this.returnFrom.z + (ship.z - this.returnFrom.z) * e };
      }
    }
    if (p) this.lastFocus = { x: p.x, z: p.z };
    return p;
  }

  pointerDown(x: number, y: number): void {
    this.press = { x, y, lastX: x, lastY: y, dragging: false };
  }

  // Devuelve si el puntero está arrastrando la vista. `toWorld` pasa un desplazamiento de pantalla (px) a metros del mundo
  pointerMove(x: number, y: number, toWorld: (dx: number, dy: number) => Point, now: number): boolean {
    const p = this.press;
    if (!p) return false;
    if (!p.dragging) {
      if (Math.hypot(x - p.x, y - p.y) <= FREE_VIEW.dragPx) return false;
      p.dragging = true;
      this.enterFree();
    }
    const d = toWorld(x - p.lastX, y - p.lastY);
    p.lastX = x;
    p.lastY = y;
    this.moveTo(this.center.x - d.x, this.center.z - d.z); // el mundo sigue al puntero
    this.flush(now);
    return true;
  }

  // 'click' si se soltó sin pasar de 12 px (navega o selecciona, como siempre); 'drag' si arrastró la vista
  pointerUp(): 'click' | 'drag' | null {
    const p = this.press;
    this.press = null;
    if (!p) return null;
    return p.dragging ? 'drag' : 'click';
  }

  // Un segundo dedo: es zoom, nunca desplazamiento ni clic (GDD §5)
  cancelPress(): void {
    this.press = null;
  }

  setArrow(arrow: Arrow, down: boolean): void {
    if (!down) {
      this.arrows.delete(arrow);
      return;
    }
    this.arrows.add(arrow);
    this.enterFree();
  }

  clearArrows(): void {
    this.arrows.clear();
  }

  // Minimapa: centra la vista en ese punto del mundo, sin navegar (AC-117)
  centerOn(p: Point, now: number): void {
    this.enterFree();
    this.moveTo(p.x, p.z);
    this.flush(now);
  }

  // Cada frame: desplaza con las flechas y envía el centro si toca (dt en segundos)
  update(now: number, dt: number): void {
    if (this.mode === 'free' && this.arrows.size) {
      let dx = 0;
      let dz = 0;
      for (const a of this.arrows) {
        dx += ARROW_DIR[a].x;
        dz += ARROW_DIR[a].z;
      }
      const len = Math.hypot(dx, dz);
      if (len > 0) this.moveTo(this.center.x + (dx / len) * FREE_VIEW.arrowSpeed * dt, this.center.z + (dz / len) * FREE_VIEW.arrowSpeed * dt);
    }
    this.flush(now);
  }

  // C, Centrar, daño propio, muerte o reaparición (AC-119): vuelve al seguimiento en 300 ms. Devuelve si había vista libre
  returnToFollow(now: number): boolean {
    if (this.mode !== 'free') return false;
    this.mode = 'returning';
    this.returnFrom = { ...this.center };
    this.returnAt = now;
    this.press = null;
    this.arrows.clear();
    this.dirty = false;
    if (this.sent) this.send(null);
    this.sent = null;
    this.onFreeChange(false);
    return true;
  }

  private enterFree(): void {
    if (this.mode === 'free') return;
    this.center = { ...this.lastFocus };
    this.mode = 'free';
    this.onFreeChange(true);
  }

  private moveTo(x: number, z: number): void {
    const nx = Math.max(-this.mapHalf, Math.min(this.mapHalf, x));
    const nz = Math.max(-this.mapHalf, Math.min(this.mapHalf, z));
    if (nx === this.center.x && nz === this.center.z) return;
    this.center = { x: nx, z: nz };
    this.dirty = true;
  }

  // Como mucho un viewAt cada 500 ms, con el último centro; si la vista se para entre dos, el pendiente sale en el siguiente
  private flush(now: number): void {
    if (this.mode !== 'free' || !this.dirty || now - this.sentAt < FREE_VIEW.sendEveryMs) return;
    this.sent = { ...this.center };
    this.sentAt = now;
    this.dirty = false;
    this.send(this.sent);
  }
}

// Qué le pasó al barco propio entre dos muestras, para AC-119. «Daño» es cualquier bajada de vida sin cambio de clase:
// cambiar de barco en la tienda no cuenta (GDD §5, decidido por producto el 2026-10-18)
export interface OwnSample {
  hp: number;
  classId: string;
  state: 'alive' | 'sinking' | 'dead';
}

export function returnTrigger(prev: OwnSample | null, next: OwnSample | null): 'damage' | 'death' | 'respawn' | null {
  if (!prev || !next) return null;
  if (prev.state !== 'alive' && next.state === 'alive') return 'respawn';
  if (prev.state === 'alive' && next.state !== 'alive') return 'death';
  if (next.state === 'alive' && next.classId === prev.classId && next.hp < prev.hp) return 'damage';
  return null;
}

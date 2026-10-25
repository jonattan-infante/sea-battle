// Indicadores de borde (E13, ART-DIRECTION §12.8, D89; AC-121 y AC-124): dónde va cada chip, hacia dónde apunta su
// triángulo y cuánto dura el de atacante, sin DOM ni three.js para probarlo con Jest (la capa DOM es edge-chip-layer.ts).
// placeChip es un port 1:1 de place() de scripts/ux/laminas/lamina_vista_libre.py (r11 87b7488), la regla con la que se
// pintó la lámina D89 que aprobó Jonattan: si el lado de la distancia no converge en 3 vueltas, el lado y la caja salen de
// la misma vuelta (ux lo arregló así en place() en 87b7488; la lámina sale idéntica). Lo que place() no hace (separar dos
// chips y el tope de 3 atacantes con «+N») va aparte, según §12.8
import { HUD_RESERVE, HudLayout } from './art';

export type ChipKind = 'self' | 'attacker';
export type ChipSize = 'desk' | 'touch';
export type Side = 'above' | 'below';
export type Box = readonly [number, number, number, number]; // x0, y0, x1, y1 en px CSS
export type Pt = readonly [number, number];

export interface Frame {
  l: number;
  t: number;
  r: number;
  b: number;
}

export const CHIP = {
  circle: { desk: 44, touch: 48 }, // diámetro del chip propio
  diamond: { desk: 36, touch: 40 }, // lado del rombo del atacante, antes de girarlo 45°
  diamondRadius: 6, // radio de sus esquinas
  labelH: 16, // pastilla de la distancia, a 2 px del chip
  labelGap: 2,
  gap: 8, // a ≥ 8 px de cada [data-hud-block]
  step: 0.5, // el deslizamiento por el borde, en pasos de 0,5 px
  apart: 52, // dos chips a menos de 52 px: el más lejano se desliza
  maxAttackers: 3 // los 3 más cercanos; el resto, «+N» en el 3.º
} as const;

// El marco útil son las reservas del HUD del zoom (§6.2): arriba y abajo, las de HUD_RESERVE; a los lados, 16 en
// escritorio y 12 en móvil (§12.8)
const SIDE: Record<HudLayout, number> = { desktop: 16, portrait: 12, landscape: 12 };
const frameOf = (layout: HudLayout): Frame => ({ l: SIDE[layout], t: HUD_RESERVE[layout].top, r: SIDE[layout], b: HUD_RESERVE[layout].bottom });
export const USABLE_FRAME: Record<HudLayout, Frame> = { desktop: frameOf('desktop'), portrait: frameOf('portrait'), landscape: frameOf('landscape') };
// El chip de escritorio mide 44 / 36; en móvil se puede tocar y mide 48 / 40
export const chipSize = (layout: HudLayout): ChipSize => (layout === 'desktop' ? 'desk' : 'touch');

// Media forma: el radio del círculo o la media diagonal del rombo
export function halfShape(kind: ChipKind, size: ChipSize): number {
  return kind === 'self' ? CHIP.circle[size] / 2 : (CHIP.diamond[size] * Math.SQRT2) / 2;
}

// Cuenta el centro del barco; tapado por la barra de acciones o por un panel cuenta como fuera (eso lo decide el marco)
export function insideFrame(vw: number, vh: number, f: Frame, x: number, y: number): boolean {
  return x >= f.l && x <= vw - f.r && y >= f.t && y <= vh - f.b;
}

// cross() de la lámina: desigualdades estrictas, así que tocar a 8 px exactos cuenta como libre
export const cross = (a: Box, b: Box, gap = 0) => a[0] < b[2] + gap && b[0] < a[2] + gap && a[1] < b[3] + gap && b[1] < a[3] + gap;

// La distancia va encima si el triángulo apunta hacia abajo entre 45° y 135° (y de pantalla hacia abajo), incluidos
const sideOf = (dx: number, dy: number): Side => {
  const deg = Math.atan2(dy, dx) * (180 / Math.PI); // math.degrees() de Python, para caer igual en 45° y 135° exactos
  return deg >= 45 && deg <= 135 ? 'above' : 'below';
};

export interface ChipPlacement {
  x: number; // centro de la forma
  y: number;
  ang: number; // hacia dónde apunta el triángulo (rad, pantalla), desde la posición final
  side: Side; // dónde va la distancia
  box: Box; // forma más distancia
  naive: Pt; // donde lo dejaría el rayo, sin deslizar
  travel: number; // lo que se deslizó por el borde (px)
}

export interface PlaceOptions {
  gap?: number;
  avoid?: readonly Pt[]; // chips ya colocados: el nuevo queda a ≥ CHIP.apart de cada uno
}

export function placeChip(
  vw: number,
  vh: number,
  frame: Frame,
  blocks: readonly Box[],
  origin: Pt,
  target: Pt,
  kind: ChipKind,
  size: ChipSize,
  labelW: number, // ancho de la pastilla de la distancia (texto + 10)
  { gap = CHIP.gap, avoid = [] }: PlaceOptions = {}
): ChipPlacement {
  const { l, t, r, b } = frame;
  const h = halfShape(kind, size);
  const L = Math.max(h, labelW / 2);
  const dx = target[0] - origin[0];
  const dy = target[1] - origin[1];
  const label = CHIP.labelH + CHIP.labelGap;
  let side = sideOf(dx, dy);
  let out: ChipPlacement | null = null;
  for (let turn = 0; turn < 3; turn++) {
    // El recorte: el marco útil metido L a los lados y la media forma (más la pastilla por su lado) arriba y abajo
    const top = h + (side === 'above' ? label : 0);
    const bot = h + (side === 'below' ? label : 0);
    const x0 = l + L;
    const y0 = t + top;
    const x1 = vw - r - L;
    const y1 = vh - b - bot;
    const W = x1 - x0;
    const H = y1 - y0;
    const P = 2 * (W + H);
    const tm = Math.min(
      dx > 0 ? (x1 - origin[0]) / dx : dx < 0 ? (x0 - origin[0]) / dx : Infinity,
      dy > 0 ? (y1 - origin[1]) / dy : dy < 0 ? (y0 - origin[1]) / dy : Infinity
    );
    const naive: Pt = [origin[0] + dx * tm, origin[1] + dy * tm];
    // El perímetro: arriba de izquierda a derecha, la derecha hacia abajo, abajo de derecha a izquierda y la izquierda hacia arriba
    const at = (sv: number): Pt => {
      const s = ((sv % P) + P) % P;
      if (s < W) return [x0 + s, y0];
      if (s < W + H) return [x1, y0 + s - W];
      if (s < 2 * W + H) return [x1 - (s - W - H), y1];
      return [x0, y1 - (s - 2 * W - H)];
    };
    const e = 1e-6;
    const s0 =
      Math.abs(naive[1] - y0) < e
        ? naive[0] - x0
        : Math.abs(naive[0] - x1) < e
          ? W + naive[1] - y0
          : Math.abs(naive[1] - y1) < e
            ? W + H + x1 - naive[0]
            : 2 * W + H + y1 - naive[1];
    const free = (p: Pt) =>
      !blocks.some((B) => cross([p[0] - L, p[1] - top, p[0] + L, p[1] + bot], B, gap)) &&
      avoid.every((c) => Math.hypot(p[0] - c[0], p[1] - c[1]) >= CHIP.apart);
    // La posición libre más cercana a lo largo del borde, en los dos sentidos y primero +1; sin ninguna, la del rayo
    let p: Pt = naive;
    let travel = 0;
    search: for (let k = 0; k * CHIP.step < P / 2; k++) {
      const d = k * CHIP.step;
      for (const sg of [1, -1]) {
        const q = at(s0 + sg * d);
        if (free(q)) {
          p = q;
          travel = d;
          break search;
        }
      }
    }
    const ang = Math.atan2(target[1] - p[1], target[0] - p[0]);
    out = { x: p[0], y: p[1], ang, side, box: [p[0] - L, p[1] - top, p[0] + L, p[1] + bot], naive, travel };
    const next = sideOf(target[0] - p[0], target[1] - p[1]);
    if (next === side) break;
    side = next;
  }
  return out!;
}

// Los atacantes que se ven: los 3 más cercanos, y el resto se suma en el 3.º («+N»)
export function visibleAttackers<T extends { dist: number }>(all: readonly T[]): { item: T; more: number }[] {
  const sorted = [...all].sort((a, b) => a.dist - b.dist);
  const shown = sorted.slice(0, CHIP.maxAttackers).map((item) => ({ item, more: 0 }));
  if (sorted.length > CHIP.maxAttackers) shown[shown.length - 1].more = sorted.length - CHIP.maxAttackers;
  return shown;
}

// Error del triángulo respecto a la dirección real al barco, en grados (AC-121 y AC-124: ≤ 10°)
export function angleError(p: ChipPlacement, target: Pt): number {
  const real = Math.atan2(target[1] - p.y, target[0] - p.x);
  return Math.abs((((((p.ang - real) * 180) / Math.PI + 180) % 360) + 360) % 360 - 180);
}

// Del centro al borde exterior de la forma en la dirección a (rad, pantalla): el triángulo va a 2 px de ahí. El rombo es
// un cuadrado de lado s con esquinas de radio r girado 45° (edge() de la lámina lo medía sobre la máscara)
export function shapeEdge(kind: ChipKind, size: ChipSize, a: number): number {
  if (kind === 'self') return CHIP.circle[size] / 2;
  const s = CHIP.diamond[size];
  const r = CHIP.diamondRadius;
  const h = s / 2;
  // la dirección en los ejes del cuadrado, plegada al primer cuadrante
  const ux = Math.abs(Math.cos(a - Math.PI / 4));
  const uy = Math.abs(Math.sin(a - Math.PI / 4));
  const flat = Math.min(ux > 0 ? h / ux : Infinity, uy > 0 ? h / uy : Infinity);
  if (ux * flat <= h - r + 1e-9 || uy * flat <= h - r + 1e-9) return flat;
  // en la esquina: la raíz mayor de |t·u − c| = r, con c = (h − r, h − r)
  const c = h - r;
  const b = ux * c + uy * c;
  return b + Math.sqrt(Math.max(0, b * b - (2 * c * c - r * r)));
}

export const CHIP_TIMING = {
  holdMs: 3000, // el de atacante dura 3 s tras el último disparo
  fadeMs: 300, // y luego se desvanece en 300 ms
  selfFadeMs: 150, // el propio desaparece en 150 ms cuando el barco vuelve al marco útil
  pulseMs: 180, // con cada impacto late una vez: 1,0 → 1,15 → 1,0
  pulseScale: 1.15
} as const;

export interface Attack {
  id: string;
  lastShot: number;
  pulseAt: number;
}

// Quién te dispara (AC-124): cada andanada con targetId = tú renueva su ventana de 3 s, y cada impacto con daño lo hace latir
export class AttackerTracker {
  private readonly byId = new Map<string, Attack>();

  volley(shooterId: string, targetId: string, myId: string | null, now: number): void {
    if (!myId || targetId !== myId || shooterId === myId) return;
    const a = this.byId.get(shooterId);
    if (a) a.lastShot = now;
    else this.byId.set(shooterId, { id: shooterId, lastShot: now, pulseAt: -Infinity });
  }

  impact(victimId: string, byShipId: string, damage: number, myId: string | null, now: number): void {
    if (victimId !== myId || damage <= 0) return;
    const a = this.byId.get(byShipId);
    if (a) a.pulseAt = now;
  }

  // Los que aún se ven (o se están desvaneciendo); los demás se olvidan
  active(now: number): Attack[] {
    const out: Attack[] = [];
    for (const [id, a] of this.byId) {
      if (now - a.lastShot >= CHIP_TIMING.holdMs + CHIP_TIMING.fadeMs) this.byId.delete(id);
      else out.push(a);
    }
    return out;
  }

  clear(): void {
    this.byId.clear();
  }
}

export function attackOpacity(a: Attack, now: number): number {
  const t = now - a.lastShot - CHIP_TIMING.holdMs;
  return t <= 0 ? 1 : Math.max(0, 1 - t / CHIP_TIMING.fadeMs);
}

// Escala del latido: sube y baja en línea recta en 180 ms; fuera de ese tiempo, 1
export function pulseScale(a: Attack, now: number): number {
  const k = (now - a.pulseAt) / CHIP_TIMING.pulseMs;
  if (!(k >= 0 && k < 1)) return 1;
  return 1 + (CHIP_TIMING.pulseScale - 1) * (1 - Math.abs(2 * k - 1));
}

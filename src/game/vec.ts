// Vectores en el plano XZ del mundo (+Y arriba, 1 u = 1 m)
export interface Vec2 {
  x: number;
  z: number;
}

export const vec = (x: number, z: number): Vec2 => ({ x, z });

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Rumbo 0 = proa hacia +Z; crece hacia +X (igual que rotation.y en three.js)
export function headingTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function forward(heading: number): Vec2 {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

// Diferencia angular normalizada a (-π, π]
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function normalizeAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDelta(a, b) * t;
}

// PRNG determinista (mulberry32) para simulaciones reproducibles en tests
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

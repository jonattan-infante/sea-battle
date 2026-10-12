// Reparto cosmético de una andanada (VFX-SPEC §1 y §3, D3). Puro y sin three.js para poder testearlo: la banda sale
// del rumbo del tirador y de to − from, y el azar (qué balas aciertan, dónde impactan o caen) se siembra con shipId +
// from/to del evento. El servidor envía esos valores idénticos a todos los clientes, así que todos ven lo mismo.
import type { Vec2 } from '../../game/vec';

export interface VolleyKey {
  shipId: string;
  from: Vec2;
  to: Vec2;
}

// Babor (+1) si dot(to − from, (cos ψ, 0, −sin ψ)) > 0, el +X local del tirador en el mundo; si no, estribor (−1)
export function volleySide(e: VolleyKey, heading: number): 1 | -1 {
  return (e.to.x - e.from.x) * Math.cos(heading) - (e.to.z - e.from.z) * Math.sin(heading) > 0 ? 1 : -1;
}

// mulberry32 (como createRng de src/game/vec.ts) con estado reutilizable: sin asignaciones por andanada
export class VolleyRandom {
  private state = 0;

  seed(e: VolleyKey): this {
    let h = 2166136261;
    for (let i = 0; i < e.shipId.length; i++) h = Math.imul(h ^ e.shipId.charCodeAt(i), 16777619);
    h = Math.imul(h ^ Math.round(e.from.x * 100), 16777619);
    h = Math.imul(h ^ Math.round(e.from.z * 100), 16777619);
    h = Math.imul(h ^ Math.round(e.to.x * 100), 16777619);
    h = Math.imul(h ^ Math.round(e.to.z * 100), 16777619);
    this.state = h >>> 0;
    return this;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Qué balas aciertan: `hits` de `count` al azar, como máscara de bits (bit k = la bala del cañón k)
  hitMask(count: number, hits: number): number {
    let mask = 0;
    for (let placed = 0; placed < Math.min(hits, count);) {
      const k = Math.floor(this.next() * count);
      if (!(mask & (1 << k))) {
        mask |= 1 << k;
        placed++;
      }
    }
    return mask;
  }
}

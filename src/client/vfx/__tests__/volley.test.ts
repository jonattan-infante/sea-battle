// D3 (VFX-SPEC §1 y §3): banda de la andanada y reparto cosmético sembrado. Mismo evento = mismo resultado en todos
// los clientes; la banda depende del costado en que está el objetivo.
import { VolleyKey, VolleyRandom, volleySide } from '../volley';

const event = (over: Partial<VolleyKey> = {}): VolleyKey => ({ shipId: 's12', from: { x: 120.5, z: -40.25 }, to: { x: 160, z: -10 }, ...over });
const sequence = (e: VolleyKey, n = 24) => {
  const r = new VolleyRandom().seed(e);
  return Array.from({ length: n }, () => r.next());
};
const bits = (mask: number) => mask.toString(2).split('').filter((b) => b === '1').length;

describe('D3 — andanada: banda y reparto sembrado', () => {
  test('mismo evento → misma secuencia, misma máscara de aciertos (dos instancias, y al resembrar)', () => {
    expect(sequence(event())).toEqual(sequence(event()));
    const a = new VolleyRandom().seed(event());
    const b = new VolleyRandom();
    expect(a.hitMask(8, 5)).toBe(b.seed(event()).hitMask(8, 5));
    const first = a.seed(event()).next();
    a.next();
    expect(a.seed(event()).next()).toBe(first);
  });

  test('cambiar el tirador o la geometría del disparo cambia el reparto', () => {
    const base = sequence(event());
    expect(sequence(event({ shipId: 's13' }))).not.toEqual(base);
    expect(sequence(event({ from: { x: 120.6, z: -40.25 } }))).not.toEqual(base);
    expect(sequence(event({ to: { x: 160, z: -9.9 } }))).not.toEqual(base);
  });

  test('la máscara tiene exactamente min(aciertos, cañones) bits dentro de los cañones', () => {
    const r = new VolleyRandom();
    for (let i = 0; i < 50; i++) {
      for (const [count, hits] of [[8, 0], [8, 3], [8, 8], [4, 6], [6, 1]] as const) {
        const mask = r.seed(event({ shipId: `s${i}` })).hitMask(count, hits);
        expect(bits(mask)).toBe(Math.min(count, hits));
        expect(mask >> count).toBe(0);
      }
    }
  });

  test('el reparto no es constante entre andanadas distintas', () => {
    const masks = new Set(Array.from({ length: 40 }, (_, i) => new VolleyRandom().seed(event({ shipId: `s${i}` })).hitMask(8, 4)));
    expect(masks.size).toBeGreaterThan(10);
  });

  test('banda: babor si el objetivo queda al +X local (cos ψ, 0, −sin ψ), estribor si no', () => {
    const from = { x: 10, z: 10 };
    // Rumbo 0 (proa a +Z): babor = +X
    expect(volleySide({ shipId: 'a', from, to: { x: 30, z: 12 } }, 0)).toBe(1);
    expect(volleySide({ shipId: 'a', from, to: { x: -10, z: 12 } }, 0)).toBe(-1);
    // Rumbo π/2 (proa a +X): babor = −Z
    expect(volleySide({ shipId: 'a', from, to: { x: 12, z: -20 } }, Math.PI / 2)).toBe(1);
    expect(volleySide({ shipId: 'a', from, to: { x: 12, z: 40 } }, Math.PI / 2)).toBe(-1);
    // Mismo objetivo: al girar el tirador 180° cambia la banda
    const to = { x: 40, z: 10 };
    expect(volleySide({ shipId: 'a', from, to }, 0)).toBe(-volleySide({ shipId: 'a', from, to }, Math.PI));
  });
});

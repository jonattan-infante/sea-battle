// O-66: el contador de nacimientos del pool por forma, del que el e2e de D32 saca la tasa de llamas y de bocanadas por
// segundo simulado. Solo cuenta: sigue contando cuando el anillo da la vuelta y no cambia lo que vive. Sin WebGL.
import { makeSpec, ParticlePool, SHAPE } from '../particles';

const pool = (capacity: number) => new ParticlePool({ capacity, mode: 'billboard', blending: 'alpha', renderOrder: 0 });

function emit(p: ParticlePool, shape: number, life: number, t0 = 0) {
  const s = makeSpec();
  s.shape = shape;
  s.life = life;
  s.t0 = t0;
  p.emit(s);
}

describe('ParticlePool: nacimientos por forma (O-66)', () => {
  test('cuenta las nacidas y la suma de sus vidas por forma', () => {
    const p = pool(64);
    for (let i = 0; i < 5; i++) emit(p, SHAPE.damageFlame, 0.55);
    for (let i = 0; i < 2; i++) emit(p, SHAPE.puff, 3.4);
    expect(p.born[SHAPE.damageFlame]).toBe(5);
    expect(p.born[SHAPE.puff]).toBe(2);
    expect(p.born[SHAPE.disc]).toBe(0);
    expect(p.bornLife[SHAPE.damageFlame]).toBeCloseTo(5 * 0.55, 12);
    expect(p.bornLife[SHAPE.puff]).toBeCloseTo(2 * 3.4, 12);
    p.dispose();
  });

  test('sigue contando cuando el anillo da la vuelta, aunque las vivas no pasen de la capacidad', () => {
    const p = pool(4);
    for (let i = 0; i < 10; i++) emit(p, SHAPE.damageFlame, 1, 0);
    expect(p.born[SHAPE.damageFlame]).toBe(10);
    expect(p.live(0.5, SHAPE.damageFlame)).toBe(4);
    p.dispose();
  });

  test('tiene una casilla por forma', () => {
    const p = pool(1);
    expect(p.born.length).toBe(Math.max(...Object.values(SHAPE)) + 1);
    expect(p.bornLife.length).toBe(p.born.length);
    p.dispose();
  });
});

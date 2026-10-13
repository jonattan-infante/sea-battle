// Arnés de estrés: percentiles y pendiente por mínimos cuadrados (la de AC-91, que AC-142 usa para la memoria)
import { bucket, percentile, slope, summarize } from '../stats';

describe('estadística del arnés de estrés', () => {
  test('percentil por rango más cercano sobre los valores ordenados', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile(v, 100)).toBe(100);
    expect(percentile([7], 99)).toBe(7);
  });

  test('summarize ordena una copia y da n, p50, p95, p99, máx y media', () => {
    const values = [30, 10, 20, 40];
    expect(summarize(values)).toEqual({ n: 4, p50: 20, p95: 40, p99: 40, max: 40, mean: 25 });
    expect(values).toEqual([30, 10, 20, 40]);
    expect(summarize([])).toBeNull();
  });

  test('pendiente por mínimos cuadrados, en unidades por paso', () => {
    expect(slope([1, 2, 3, 4])).toBeCloseTo(1);
    expect(slope([5, 5, 5])).toBeCloseTo(0);
    expect(slope([10, 12, 11, 13, 12, 14])).toBeCloseTo(0.6286, 3);
    expect(slope([3])).toBe(0);
  });

  test('bucket cuenta (o suma) por ventanas [inicio, fin) y deja fuera lo de antes y lo de después', () => {
    const times = [999, 1000, 1500, 1999, 2000, 3999, 4000];
    expect(bucket(times, 1000, 1000, 3)).toEqual([3, 1, 1]);
    expect(bucket(times, 1000, 1000, 3, [1, 2, 3, 4, 5, 6, 7])).toEqual([2 + 3 + 4, 5, 6]);
  });
});

// Percentiles del arnés de estrés (rango más cercano, sin interpolar: cada cifra es una medida real)
export interface Summary {
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
}

// sorted: valores ya ordenados de menor a mayor
export function percentile(sorted: number[], p: number): number {
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1];
}

export function summarize(values: number[]): Summary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { n: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99), max: sorted[sorted.length - 1], mean };
}

// Redondeo para el JSON y el resumen
export const r1 = (v: number) => Math.round(v * 10) / 10;
export const r2 = (v: number) => Math.round(v * 100) / 100;

export function roundSummary(s: Summary | null): Summary | null {
  return s && { n: s.n, p50: r1(s.p50), p95: r1(s.p95), p99: r1(s.p99), max: r1(s.max), mean: r1(s.mean) };
}

// Pendiente por mínimos cuadrados de una serie equiespaciada, en unidades por paso (por minuto, con una muestra por minuto)
export function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return num / den;
}

// Cuenta los instantes de cada ventana [start + i·width, start + (i + 1)·width); con `values`, suma el valor de cada uno
export function bucket(times: number[], start: number, width: number, n: number, values?: number[]): number[] {
  const out = new Array<number>(n).fill(0);
  times.forEach((t, i) => {
    const w = Math.floor((t - start) / width);
    if (w >= 0 && w < n) out[w] += values ? values[i] : 1;
  });
  return out;
}

// AD-27 (D23, D42): espuma natural medida en un conjunto fijo de 12 vistas de mar abierto, 3 puntos × 4 tiempos del
// reloj del océano, con el pase de solo océano en 1440×900 a 1,0×. Aserta la mediana de las 12 y las guardas por vista,
// periodicidad (R23) incluida, y guarda cada vista (PNG + JSON con la proyección y los uniforms) en
// qa-artifacts/render/ad27/ para el modelo del shader de scripts/ad27/
import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { OceanPass } from '../src/client/runtime';
import { enterGame, me, waitFor } from './helpers';
import { sailTo } from './net';
import { startOwnServer } from './own-server';

const OUT = path.join(__dirname, '..', 'qa-artifacts', 'render', 'ad27');
const SPOTS = [
  { name: 'A', x: 0, z: 220 },
  { name: 'B', x: 250, z: -40 },
  { name: 'C', x: -240, z: -60 }
];
const TIMES = [10, 40, 70, 100];
const MEDIAN = { coverage: [0.3, 1.2], emptyCells: 40, dL: 20, r23: 0.4 };
const GUARD = { coverage: 2.0, emptyCells: 25, dL: 22, r23: 0.7, r23MinCoverage: 0.3 }; // R23 solo con ≥ 0,3 % de espuma

interface FoamMetrics {
  coverage: number; // % de los píxeles de agua
  emptyCells: number; // % de celdas de 240×110 px con < 0,1 % de espuma
  cells: number;
  dL: number; // mediana de L* − mediana del agua en la espuma
  r23: number; // |media de e^{iφ}| de la fase de la ola de 23 m en la espuma (1 = diagonales rectas); NaN sin espuma
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

test('AD-27: espuma natural en 12 vistas fijas de mar abierto @capture', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startOwnServer({ SEA_BATTLE_NPCS: '0' });
  const rows: { view: string; m: FoamMetrics }[] = [];
  const shaderErrors: string[] = [];
  page.on('console', (msg) => msg.text().includes('Shader Error') && shaderErrors.push(msg.text().slice(0, 400)));
  try {
    await enterGame(page, server.url);
    for (const spot of SPOTS) {
      await sailTo(page, spot.x, spot.z);
      await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - spot.x, s.z - spot.z) < 2, 90_000, 250);
      await page.waitForTimeout(1500); // la cámara llega al barco y este se para
      for (const time of TIMES) {
        const shot = await page.evaluate(async (t) => {
          const pass = window.__SEA_BATTLE__!.runtime().captureOceanPass(t)!;
          // Métrica AD-27 (ART-DIRECTION §18), la misma de scripts/ad27/ad27.py: agua = B ≥ R; espuma = L* ≥ mediana + 10
          const img = new Image();
          img.src = pass.png;
          await img.decode();
          const canvas = new OffscreenCanvas(img.width, img.height);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const { data, width: W, height: H } = ctx.getImageData(0, 0, img.width, img.height);
          const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
          const L = new Float64Array(W * H);
          const water = new Uint8Array(W * H);
          let n = 0;
          for (let i = 0; i < W * H; i++) {
            const r = data[4 * i] / 255, g = data[4 * i + 1] / 255, b = data[4 * i + 2] / 255;
            const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
            L[i] = 116 * (Y > 0.008856 ? Math.cbrt(Y) : 7.787 * Y + 16 / 116) - 16;
            if (b >= r) water[i] = 1;
            n += water[i];
          }
          const waterL = new Float64Array(n);
          for (let i = 0, j = 0; i < W * H; i++) if (water[i]) waterL[j++] = L[i];
          waterL.sort();
          const med = n % 2 ? waterL[(n - 1) / 2] : (waterL[n / 2 - 1] + waterL[n / 2]) / 2;
          // Periodicidad: fase de la ola de 23 m en el agua bajo cada centro de píxel (proyección ortográfica, afín)
          const [c0, c1, c2] = pass.corners;
          const [dx, dz, kw, om] = (pass.uniforms.uWaves as number[][])[0];
          const foam = new Uint8Array(W * H);
          const dLs: number[] = [];
          let cos = 0, sin = 0;
          for (let i = 0; i < W * H; i++)
            if (water[i] && L[i] >= med + 10) {
              foam[i] = 1;
              dLs.push(L[i] - med);
              const x = c0.x + (((i % W) + 0.5) / W) * (c1.x - c0.x);
              const z = c0.z + ((Math.floor(i / W) + 0.5) / H) * (c2.z - c0.z);
              const ph = kw * (dx * x + dz * z) - om * t;
              cos += Math.cos(ph);
              sin += Math.sin(ph);
            }
          let cells = 0, empty = 0;
          for (let y = 0; y + 110 <= H; y += 110)
            for (let x = 0; x + 240 <= W; x += 240) {
              let w = 0, f = 0;
              for (let yy = y; yy < y + 110; yy++)
                for (let xx = x; xx < x + 240; xx++) {
                  w += water[yy * W + xx];
                  f += foam[yy * W + xx];
                }
              if (w < 0.85 * 240 * 110) continue;
              cells++;
              if (f / w < 0.001) empty++;
            }
          dLs.sort((a, b) => a - b);
          const k = dLs.length;
          const dL = k === 0 ? 0 : k % 2 ? dLs[(k - 1) / 2] : (dLs[k / 2 - 1] + dLs[k / 2]) / 2;
          const r23 = k === 0 ? NaN : Math.hypot(cos, sin) / k;
          return { pass, metrics: { coverage: (100 * k) / n, emptyCells: (100 * empty) / cells, cells, dL, r23 } };
        }, time);
        const { png, ...meta } = shot.pass as OceanPass;
        const view = `${spot.name}-t${time}`;
        fs.writeFileSync(path.join(OUT, `${view}.png`), Buffer.from(png.split(',')[1], 'base64'));
        fs.writeFileSync(path.join(OUT, `${view}.json`), JSON.stringify({ spot, ...meta }, null, 2));
        rows.push({ view, m: shot.metrics });
      }
    }
  } finally {
    await server.kill();
  }

  const fmt = (m: FoamMetrics) =>
    `cobertura ${m.coverage.toFixed(2)} % · celdas sin espuma ${m.emptyCells.toFixed(1)} % (${m.cells}) · ΔL* ${m.dL.toFixed(1)} · R23 ${m.r23.toFixed(2)}`;
  for (const { view, m } of rows) console.log(`AD-27 ${view}: ${fmt(m)}`);
  const med: FoamMetrics = {
    coverage: median(rows.map((r) => r.m.coverage)),
    emptyCells: median(rows.map((r) => r.m.emptyCells)),
    cells: rows[0].m.cells,
    dL: median(rows.map((r) => r.m.dL)),
    r23: median(rows.map((r) => r.m.r23).filter((r) => !Number.isNaN(r)))
  };
  console.log(`AD-27 mediana de ${rows.length} vistas: ${fmt(med)}`);

  expect(shaderErrors, 'el shader del océano compila').toEqual([]);
  expect(rows).toHaveLength(12);
  for (const { view, m } of rows) {
    expect(m.cells, `${view}: celdas de agua`).toBe(48);
    expect.soft(m.coverage, `${view}: guarda de cobertura`).toBeLessThanOrEqual(GUARD.coverage);
    expect.soft(m.emptyCells, `${view}: guarda de celdas sin espuma`).toBeGreaterThanOrEqual(GUARD.emptyCells);
    expect.soft(m.dL, `${view}: guarda de ΔL*`).toBeLessThanOrEqual(GUARD.dL);
    if (m.coverage >= GUARD.r23MinCoverage) expect.soft(m.r23, `${view}: guarda de R23`).toBeLessThanOrEqual(GUARD.r23);
  }
  expect.soft(med.coverage, 'mediana de la cobertura').toBeGreaterThanOrEqual(MEDIAN.coverage[0]);
  expect.soft(med.coverage, 'mediana de la cobertura').toBeLessThanOrEqual(MEDIAN.coverage[1]);
  expect.soft(med.emptyCells, 'mediana de las celdas sin espuma').toBeGreaterThanOrEqual(MEDIAN.emptyCells);
  expect.soft(med.dL, 'mediana de ΔL*').toBeLessThanOrEqual(MEDIAN.dL);
  expect.soft(med.r23, 'mediana de R23').toBeLessThanOrEqual(MEDIAN.r23);
});

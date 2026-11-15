// AC-173 (b): la curva económica de AC-60 con el mapa de la 1.1 y la población del I2, juzgada con las semillas 1–20 (producto,
// r11 d2814e1: con 5 semillas el resultado depende de la suerte ante cualquier cambio de navegación). Va fuera de `npm test` y
// de verify: `npm run test:map11`, que QA corre al activar MAP_1_1 y en cada PR que toque rutas, IA o el mapa
import { MAP_1_1 } from '../constants';
import { simulateShipFirst } from '../__tests__/economy-bot';
import { median } from '../__tests__/helpers';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

test('AC-173 (b) / AC-60 (I2 encendido, mapa 1.1): con el bot "barco primero", la mediana de las semillas 1–20 cumple 500 de oro ≤ 4 min, Bergantín ≤ 20 min y todo en 45–70 min', () => {
  const runs = SEEDS.map((seed) => simulateShipFirst(seed, true, MAP_1_1));
  const min = (v: number) => (v === Infinity ? '∞' : (v / 60).toFixed(1));
  const t500 = median(runs.map((r) => r.t500));
  const tBrig = median(runs.map((r) => r.tBrig));
  const tAll = median(runs.map((r) => r.tAll));
  console.log(`AC-173 (b) por semilla (min t500/tBrig/tAll): ${runs.map((r, i) => `s${SEEDS[i]} ${min(r.t500)}/${min(r.tBrig)}/${min(r.tAll)} (${r.deaths} muertes)`).join(' · ')} → mediana ${min(t500)}/${min(tBrig)}/${min(tAll)}`);
  console.log(`AC-173 (b) JSON ${JSON.stringify(runs.map((r) => [r.t500, r.tBrig, r.tAll]))}`);
  expect(t500).toBeLessThanOrEqual(4 * 60);
  expect(tBrig).toBeLessThanOrEqual(20 * 60);
  expect(tAll).toBeGreaterThanOrEqual(45 * 60);
  expect(tAll).toBeLessThanOrEqual(70 * 60);
}, 600_000);

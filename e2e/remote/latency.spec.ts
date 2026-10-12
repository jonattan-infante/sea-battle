// AC-136: latencia del clic contra un despliegue real, con la conexión de quien lo corre (REMOTE_CONNECTION la
// etiqueta en el registro). 30 clics en el agua con el método de AC-14: barco parado y pointerdown/up sobre el canvas en
// la misma tarea que t0; del clic al marcador (local) y del clic al primer cambio de la posición renderizada. El RTT se
// mide aparte (mediana de /healthz) para el árbol de decisión de AC-136 (umbral ~190 ms)
import { expect, test } from '@playwright/test';
import { me, waitFor } from '../helpers';
import { baseUrl } from './env';
import { enterRemoteGame, health, percentile, saveRun } from './game';

const CLICKS = 30;
const RTT_SAMPLES = 10; // antes y después de los clics
const RTT_DISTANCE_MS = 190;

test('AC-136: clic → marcador p95 ≤ 50 ms y máx ≤ 100 ms; clic → movimiento p95 ≤ 500 ms @remote', async ({ page }) => {
  test.setTimeout(300_000);
  const url = baseUrl();
  const h = await health(url);
  await enterRemoteGame(page);
  const rtt = (n: number) =>
    page.evaluate(async (count) => {
      const out: number[] = [];
      for (let i = 0; i < count; i++) {
        const t0 = performance.now();
        await fetch('/healthz', { cache: 'no-store' });
        out.push(performance.now() - t0);
      }
      return out;
    }, n);
  const rttBefore = await rtt(RTT_SAMPLES);

  const markers: number[] = [];
  const moves: number[] = [];
  for (let run = 0; run < CLICKS; run++) {
    // Barco quieto antes de cada clic (S y posición estable en pantalla), como AC-14
    await page.keyboard.press('KeyS');
    let last = await me(page);
    await waitFor(
      async () => {
        await page.waitForTimeout(300);
        const now = await me(page);
        const still = !!now && !!last && Math.hypot(now.x - last.x, now.z - last.z) < 0.01;
        last = now;
        return still;
      },
      (still) => still,
      10_000,
      0
    );
    const start = (await me(page))!;
    const dy = run % 2 === 0 ? -120 : 120; // alterna arriba y abajo para quedarse cerca del puerto
    const t = await page.evaluate(
      ([x, y]) =>
        new Promise<{ marker: number; move: number }>((resolve) => {
          const dbg = window.__SEA_BATTLE__!;
          const rt = dbg.runtime() as unknown as { clickMarker: unknown };
          const me0 = dbg.me() as { x: number; z: number };
          const canvas = document.querySelector('canvas')!;
          const t0 = performance.now();
          const opts = { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse', button: 0, isPrimary: true };
          canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
          canvas.dispatchEvent(new PointerEvent('pointerup', opts));
          let marker = -1;
          const poll = () => {
            const now = performance.now();
            if (marker < 0 && rt.clickMarker) marker = now - t0;
            const m = dbg.me() as { x: number; z: number };
            if (Math.hypot(m.x - me0.x, m.z - me0.z) > 0.01) return resolve({ marker, move: now - t0 });
            if (now - t0 > 3000) return resolve({ marker, move: Infinity });
            requestAnimationFrame(poll);
          };
          requestAnimationFrame(poll);
        }),
      [start.screen!.sx, start.screen!.sy + dy]
    );
    markers.push(t.marker);
    moves.push(t.move);
  }
  const rttAfter = await rtt(RTT_SAMPLES);

  const rttAll = [...rttBefore, ...rttAfter];
  const stats = (v: number[]) => ({ p50: percentile(v, 50), p95: percentile(v, 95), max: Math.max(...v) });
  const marker = stats(markers);
  const move = stats(moves);
  const rttMedian = percentile(rttAll, 50);
  const ms = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)}` : '> 3000');
  const connection = process.env.REMOTE_CONNECTION ?? 'sin etiqueta';
  console.log(`AC-136 ${url.host} · conexión «${connection}» · commit ${h.commit ?? '?'} · ${CLICKS} clics`);
  console.log(`AC-136 clic → marcador: p50 ${ms(marker.p50)} · p95 ${ms(marker.p95)} · máx ${ms(marker.max)} ms`);
  console.log(`AC-136 clic → movimiento: p50 ${ms(move.p50)} · p95 ${ms(move.p95)} · máx ${ms(move.max)} ms`);
  console.log(`AC-136 RTT /healthz: mediana ${rttMedian.toFixed(0)} ms (antes ${percentile(rttBefore, 50).toFixed(0)}, después ${percentile(rttAfter, 50).toFixed(0)})`);
  if (move.p95 > 500)
    console.log(
      rttMedian >= RTT_DISTANCE_MS
        ? `AC-136 (b) falla con RTT ${rttMedian.toFixed(0)} ms ≥ ~${RTT_DISTANCE_MS}: es la distancia; probar la región de Railway más cercana`
        : `AC-136 (b) falla con RTT ${rttMedian.toFixed(0)} ms < ~${RTT_DISTANCE_MS}: el tiempo se va en el servidor o el cliente (P1)`
    );
  const file = saveRun('ac136', url.host, {
    connection,
    health: h,
    clicks: CLICKS,
    markerMs: markers,
    moveMs: moves.map((v) => (Number.isFinite(v) ? v : null)),
    rttMs: { before: rttBefore, after: rttAfter, median: rttMedian },
    stats: { marker, move: { ...move, p95: Number.isFinite(move.p95) ? move.p95 : null, max: Number.isFinite(move.max) ? move.max : null } }
  });
  console.log(`AC-136 registro: ${file}`);

  expect(markers.every((v) => v >= 0), 'cada clic muestra el marcador').toBe(true);
  expect.soft(marker.p95, 'AC-136 (a) clic → marcador p95').toBeLessThanOrEqual(50);
  expect.soft(marker.max, 'AC-136 (a) clic → marcador máx').toBeLessThanOrEqual(100);
  expect.soft(move.p95, 'AC-136 (b) clic → movimiento p95').toBeLessThanOrEqual(500);
});

// AC-91: corrida larga de rendimiento. 10 min en 1440×900 con carga continua (escenario "endurance" en un servidor
// propio) y una muestra cada 60 s tras forzar el GC por CDP; la línea base es la muestra del minuto 1. Antes, un
// calentamiento de ~2,5 min lleva la vida a la banda de reparación para que el minuto 1 ya tenga la carga en régimen.
// Va fuera de verify y de test:e2e porque dura ~13 min: `npm run test:soak` (lo ejecuta game-qa). AC91_MINUTES=2 la
// acorta para validar el harness: mantiene las 10 muestras (cada 12 s) y escala los ciclos exigidos, pero el veredicto
// de AC-91 solo vale con la corrida de 10 min.
import { CDPSession, expect, Page, test } from '@playwright/test';
import { ENDURANCE_MERCHANTS, ENDURANCE_POINT } from '../server/scenarios';
import type { GameEvent, ServerFrame } from '../src/game/types';
import { commits, enterGame, hud, installCommitCounter, me, ships, waitFor } from './helpers';
import { sailTo } from './net';
import { startOwnServer } from './own-server';

const MINUTES = Number(process.env.AC91_MINUTES ?? 10);
const SAMPLES = 10;
const INTERVAL_MS = (MINUTES * 60_000) / SAMPLES;
const CYCLES_REQUIRED = Math.ceil((40 * MINUTES) / 10);
const REPAIR_BELOW = 0.45; // misma política que la simulación de server/__tests__/scenarios.test.ts
const RESUME_ABOVE = 0.55;
const MB = 1024 * 1024;
const WARMUP_TIMEOUT_MS = 300_000;

interface Sample {
  minute: number; // minutos reales desde el inicio de la carga
  // Memoria JS (AC-91, QA-6 H-19) = heap usado de V8 + memoria externa de los ArrayBuffer, de Runtime.getHeapUsage tras
  // el GC. Los arrays tipados (geometría, partículas, interpolación) viven fuera de usedSize
  memoryMB: number;
  heapUsedMB: number; // usedSize
  externalMB: number; // backingStorageSize
  nodes: number; // Performance.getMetrics → Nodes
  listeners: number; // Performance.getMetrics → JSEventListeners
  geometries: number; // renderer.info.memory
  textures: number;
  commits: number; // acumulado del contador onRender
  commitsPerSecond: number; // en el intervalo que termina en esta muestra
  cycles: number; // acumulado
}

// Contadores de la carga a partir de los eventos de los frames de Socket.IO, sin guardar los frames
function trackLoad(page: Page) {
  const load = {
    myId: '',
    merchants: new Set<string>(),
    sunk: new Set<string>(), // hundidos que aún no han reaparecido
    unchecked: [] as { id: string; x: number; z: number }[], // hundimientos sin comprobar si fueron en pantalla
    offScreen: new Set<string>(),
    cycles: 0,
    cyclesOffScreen: 0,
    volleys: 0,
    damageTaken: 0
  };
  const onEvent = (e: GameEvent) => {
    if (e.type === 'volley' && e.shipId === load.myId) load.volleys++;
    else if (e.type === 'impact' && e.shipId === load.myId) load.damageTaken += e.damage;
    else if (e.type === 'sunk' && load.merchants.has(e.shipId)) {
      load.sunk.add(e.shipId);
      load.unchecked.push({ id: e.shipId, ...e.pos });
    } else if (e.type === 'respawn' && load.sunk.delete(e.shipId)) {
      if (load.offScreen.delete(e.shipId)) load.cyclesOffScreen++;
      else load.cycles++;
    }
  };
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => {
      const p = String(f.payload);
      if (!p.startsWith('42["frame"') || !p.includes('"e":')) return;
      for (const e of (JSON.parse(p.slice(2))[1] as ServerFrame).e ?? []) onEvent(e);
    });
  });
  return load;
}

async function sample(page: Page, cdp: CDPSession, t0: number, prev: { commits: number; at: number }, cycles: number): Promise<Sample> {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = await cdp.send('Runtime.getHeapUsage');
  // Sin la memoria externa la corrida no vale (AC-91): un fallo aquí es NO VERIFICADO, no un verde
  if (typeof heap.backingStorageSize !== 'number') throw new Error('AC-91 NO VERIFICADO: Runtime.getHeapUsage no devuelve backingStorageSize (memoria externa de los ArrayBuffer)');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const metric = (name: string) => metrics.find((m) => m.name === name)?.value ?? NaN;
  const memory = await page.evaluate(() => window.__SEA_BATTLE__!.runtime().memoryInfo());
  const c = await commits(page);
  const now = Date.now();
  return {
    minute: (now - t0) / 60_000,
    memoryMB: (heap.usedSize + heap.backingStorageSize) / MB,
    heapUsedMB: heap.usedSize / MB,
    externalMB: heap.backingStorageSize / MB,
    nodes: metric('Nodes'),
    listeners: metric('JSEventListeners'),
    geometries: memory.geometries,
    textures: memory.textures,
    commits: c,
    commitsPerSecond: (c - prev.commits) / ((now - prev.at) / 1000),
    cycles
  };
}

// Pendiente por mínimos cuadrados (unidades de y por minuto)
function slope(points: { x: number; y: number }[]): number {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  return num / den;
}

const near = async (page: Page, tolerance: number) => {
  const s = await me(page);
  return !!s && Math.hypot(s.x - ENDURANCE_POINT.x, s.z - ENDURANCE_POINT.z) < tolerance;
};

test.describe('Corrida larga @soak', () => {
  test(`AC-91: ${MINUTES} min de combate con hundimientos y reapariciones en pantalla, sin deriva de memoria, DOM, escuchas, recursos de GPU ni commits`, async ({ page }) => {
    test.setTimeout(MINUTES * 60_000 + WARMUP_TIMEOUT_MS + 180_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'endurance' });
    try {
      await installCommitCounter(page);
      const load = trackLoad(page);
      await enterGame(page, server.url);
      load.myId = (await me(page))!.id;

      // Cañones N2 y N3 en el puerto, con clics reales (el escenario da el oro justo)
      await page.getByTestId('btn-port').click();
      await expect(page.getByTestId('shop')).toBeVisible();
      await page.getByTestId('buy-cannons-2').click();
      await expect(page.getByTestId('shop-cannons')).toContainText('Nivel 2/3');
      await page.getByTestId('buy-cannons-3').click();
      await expect(page.getByTestId('shop-cannons')).toContainText('Nivel 3/3');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('shop')).toHaveCount(0);

      await sailTo(page, ENDURANCE_POINT.x, ENDURANCE_POINT.z);
      await waitFor(() => near(page, 3), (ok) => ok, 60_000, 250);
      const vw = page.viewportSize()!;
      for (const s of await ships(page)) if (s.kind === 'merchant') load.merchants.add(s.id);
      expect(load.merchants.size, 'los mercantes del corro están a la vista').toBe(ENDURANCE_MERCHANTS);

      let repairs = 0;
      let repairsDone = 0;
      let deaths = 0;
      let wasRepairing = false;

      // Un paso de la política: repara al bajar de REPAIR_BELOW y vuelve a atacar al pasar de RESUME_ABOVE. La banda
      // es estrecha y cruza el 50 % (humo del barco propio) para que cada minuto tenga la misma mezcla de ataque y
      // reparación: los commits de React dependen de esa mezcla
      const drive = async () => {
        // ¿Los hundimientos nuevos ocurrieron en pantalla? (la cámara sigue al barco propio, quieto en el punto)
        while (load.unchecked.length) {
          const u = load.unchecked.shift()!;
          const sp = await page.evaluate(([x, z]) => window.__SEA_BATTLE__!.runtime().project(x, z), [u.x, u.z]);
          if (!sp || sp.sx < 0 || sp.sx > vw.width || sp.sy < 0 || sp.sy > vw.height) load.offScreen.add(u.id);
        }
        const mine = await me(page);
        if (!mine) return;
        if (mine.state !== 'alive') {
          // No debería pasar con la política de reparación; si pasa, se cuenta, se zarpa y se vuelve al punto
          deaths++;
          await expect(page.getByTestId('btn-respawn')).toBeEnabled({ timeout: 15_000 });
          await page.getByTestId('btn-respawn').click();
          await waitFor(() => me(page), (s) => !!s && s.state === 'alive', 5000, 100);
          await sailTo(page, ENDURANCE_POINT.x, ENDURANCE_POINT.z);
          await waitFor(() => near(page, 3), (ok) => ok, 60_000, 250);
          return;
        }
        const action = ((await hud(page)).me as { action: string } | null)?.action;
        const repairing = action === 'repairing';
        if (repairing && !wasRepairing) repairs++;
        if (!repairing && wasRepairing) repairsDone++;
        wasRepairing = repairing;
        const hp = mine.hp / mine.maxHp;
        if (!repairing && hp <= REPAIR_BELOW) {
          await page.keyboard.press('KeyR');
        } else if ((repairing && hp >= RESUME_ABOVE) || (!repairing && !mine.targetId)) {
          // Selecciona con un clic real el mercante vivo más cercano (solo si el punto lo elige a él y cae sobre el
          // canvas: un clic en el agua navegaría) y ataca con Espacio
          const target = (await ships(page))
            .filter((s) => load.merchants.has(s.id) && s.state === 'alive' && s.screen)
            .sort((a, b) => Math.hypot(a.x - mine.x, a.z - mine.z) - Math.hypot(b.x - mine.x, b.z - mine.z))[0];
          if (target) {
            const ok = await page.evaluate(
              ([id, sx, sy]) => {
                const hit = document.elementFromPoint(sx as number, sy as number);
                return !!hit?.closest('[data-testid="game-canvas"]') && window.__SEA_BATTLE__!.runtime().pick(sx as number, sy as number, false) === id;
              },
              [target.id, target.screen!.sx, target.screen!.sy]
            );
            if (ok) {
              await page.mouse.click(target.screen!.sx, target.screen!.sy);
              await page.mouse.move(5, 450); // sin hover sobre barcos
              const selected = await waitFor(async () => (await hud(page)).selectedId, (id) => id === target.id, 1000, 50).catch(() => null);
              if (selected === target.id) await page.keyboard.press('Space');
            }
          }
        }
        await page.waitForTimeout(250);
      };

      // Calentamiento: la carga entra en régimen tras la primera reparación completa (la vida baja del 100 % a la banda)
      const warmStart = Date.now();
      while (repairsDone === 0) {
        if (Date.now() - warmStart > WARMUP_TIMEOUT_MS) throw new Error(`AC-91 NO VERIFICADO (calentamiento sin una reparación completa en ${WARMUP_TIMEOUT_MS / 1000} s)`);
        await drive();
      }
      console.log(`AC-91: calentamiento de ${((Date.now() - warmStart) / 1000).toFixed(0)} s (${load.cycles} ciclos, ${repairs} reparación)`);
      const warm = { cycles: load.cycles, cyclesOffScreen: load.cyclesOffScreen, volleys: load.volleys, damageTaken: load.damageTaken, repairs, deaths };

      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      const t0 = Date.now();
      let prev = { commits: await commits(page), at: t0 };
      let nextSample = t0 + INTERVAL_MS;
      const samples: Sample[] = [];
      while (samples.length < SAMPLES) {
        if (Date.now() < nextSample) {
          await drive();
          continue;
        }
        const s = await sample(page, cdp, t0, prev, load.cycles - warm.cycles);
        prev = { commits: s.commits, at: t0 + s.minute * 60_000 };
        samples.push(s);
        nextSample += INTERVAL_MS;
        console.log(`AC-91 muestra ${samples.length}/${SAMPLES} (${s.minute.toFixed(2)} min): memoria ${s.memoryMB.toFixed(2)} MB (heap ${s.heapUsedMB.toFixed(2)} + externa ${s.externalMB.toFixed(2)}) · nodos ${s.nodes} · escuchas ${s.listeners} · geometrías ${s.geometries} · texturas ${s.textures} · ${s.commitsPerSecond.toFixed(2)} commits/s · ${s.cycles} ciclos · ${load.volleys - warm.volleys} andanadas propias · ${load.damageTaken - warm.damageTaken} de daño recibido · ${repairs - warm.repairs} reparaciones · ${deaths - warm.deaths} hundimientos propios`);
      }
      const measured = {
        cycles: load.cycles - warm.cycles,
        cyclesOffScreen: load.cyclesOffScreen - warm.cyclesOffScreen,
        volleys: load.volleys - warm.volleys,
        damageTaken: load.damageTaken - warm.damageTaken,
        repairs: repairs - warm.repairs,
        deaths: deaths - warm.deaths
      };

      // Veredicto por métrica (AC-91); se registran todas antes de fallar
      const base = samples[0];
      const last = samples[SAMPLES - 1];
      const early = samples.slice(0, 5); // minutos 1–5
      const late = samples.slice(4); // minutos 5–10
      const memorySlope = slope(late.map((s) => ({ x: s.minute, y: s.memoryMB })));
      const maxOf = (list: Sample[], k: 'geometries' | 'textures') => Math.max(...list.map((s) => s[k]));
      const rates = samples.map((s) => s.commitsPerSecond);
      // Pares de intervalos (QA-6 §10.2): la mezcla de ataque y reparación de un minuto suelto no da un falso rojo
      const firstPair = (rates[0] + rates[1]) / 2;
      const lastPair = (rates[SAMPLES - 2] + rates[SAMPLES - 1]) / 2;
      const report = {
        minutes: MINUTES,
        warmup: warm,
        load: { ...measured, required: CYCLES_REQUIRED },
        memory: {
          base: base.memoryMB,
          final: last.memoryMB,
          delta: last.memoryMB - base.memoryMB,
          slopeMinutes5to10: memorySlope,
          heapUsed: { base: base.heapUsedMB, final: last.heapUsedMB },
          external: { base: base.externalMB, final: last.externalMB }
        },
        nodes: { base: base.nodes, final: last.nodes, limit: base.nodes * 1.05 },
        listeners: { base: base.listeners, final: last.listeners, limit: base.listeners * 1.05 },
        geometries: { max1to5: maxOf(early, 'geometries'), max5to10: maxOf(late, 'geometries') },
        textures: { max1to5: maxOf(early, 'textures'), max5to10: maxOf(late, 'textures') },
        commitsPerSecond: { intervals1and2: firstPair, intervals9and10: lastPair, max: Math.max(...rates) },
        samples
      };
      console.log(`AC-91 resumen: ${JSON.stringify({ ...report, samples: undefined })}`);
      await test.info().attach('ac91-samples.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
      if (MINUTES !== 10) console.log(`AC-91: corrida corta de ${MINUTES} min para validar el harness; el veredicto del AC exige AC91_MINUTES=10`);

      // La carga es el "dado" de AC-91: sin ella no se puede hablar de deriva. Si falta, la corrida es NO VERIFICADO (en rojo
      // para que nadie la lea como verde) y no se evalúan las métricas de deriva
      const shortfall = [
        measured.cycles < CYCLES_REQUIRED && `${measured.cycles} ciclos < ${CYCLES_REQUIRED}`,
        measured.volleys === 0 && '0 andanadas propias',
        measured.damageTaken === 0 && '0 de daño recibido',
        measured.repairs === 0 && '0 reparaciones'
      ].filter(Boolean);
      if (shortfall.length > 0) {
        console.log('AC-91: carga insuficiente; las métricas de deriva del resumen no se evalúan');
        throw new Error(`AC-91 NO VERIFICADO (carga insuficiente: ${shortfall.join('; ')})`);
      }
      expect.soft(report.memory.delta, 'memoria JS (heap + externa): final − base ≤ 15 MB').toBeLessThanOrEqual(15);
      expect.soft(memorySlope, 'memoria JS (heap + externa): pendiente ≤ 1 MB/min en los minutos 5–10').toBeLessThanOrEqual(1);
      expect.soft(last.nodes, 'nodos DOM: final ≤ base × 1,05').toBeLessThanOrEqual(report.nodes.limit);
      expect.soft(last.listeners, 'escuchas JS: final ≤ base × 1,05').toBeLessThanOrEqual(report.listeners.limit);
      expect.soft(report.geometries.max5to10, 'geometrías: máx(5–10) ≤ máx(1–5) + 2').toBeLessThanOrEqual(report.geometries.max1to5 + 2);
      expect.soft(report.textures.max5to10, 'texturas: máx(5–10) ≤ máx(1–5) + 2').toBeLessThanOrEqual(report.textures.max1to5 + 2);
      // Con ventanas de 12 s (corrida corta) el cociente es ruido (±25 %, más que el 20 % que se mide): solo se aserta con
      // las ventanas de 60 s del AC
      if (INTERVAL_MS >= 60_000) expect.soft(lastPair, 'commits/s: media de los intervalos 9 y 10 ≤ media de los intervalos 1 y 2 × 1,2').toBeLessThanOrEqual(firstPair * 1.2);
      else console.log(`AC-91 (informativo con ventanas de ${INTERVAL_MS / 1000} s): commits/s de los intervalos 9 y 10 ${lastPair.toFixed(2)} frente a ${(firstPair * 1.2).toFixed(2)} (intervalos 1 y 2 × 1,2)`);
      expect.soft(Math.max(...rates), 'commits/s: siempre ≤ 10').toBeLessThanOrEqual(10);
    } finally {
      await server.kill();
    }
  });
});

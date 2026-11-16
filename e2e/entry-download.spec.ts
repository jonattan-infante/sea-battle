// La medida de descarga de AC-227 (c) (BACKLOG :2344; la de AC-193 c, :1770, repetida con las 10 combinaciones reales). Con
// el barco propio con familia y el GLB más pesado (el Navío español, escenario navio-13) y los modelos servidos por el
// servidor del juego, en cada perfil de red: el Δ del p95 de la entrada entre «hoy» (la misma entrada sin esperar al modelo
// propio) y la de B (esperándolo, con su tope), ≤ 517 ms en casa y en el hotspot; el GLB propio ≤ 120 KB; y las 10
// combinaciones (GLB y KTX2) en caché en ≤ 10 s tras la entrada por el hotspot. Anota los bytes transferidos con su
// Content-Encoding y el total en archivo frente a 1 020 000. Cada corrida, en un contexto nuevo (sin caché HTTP), con el
// barco guardado en el navegador (el que vuelve: la predicción acierta, opción A); los brazos van alternos.
//
// No corre en test:e2e ni en test:perf: AC227_RUNS=20 npx playwright test e2e/entry-download.spec.ts (AC227_PROFILES=casa,hotspot
// para elegir perfiles; AC227_MAP=1.0 para medir sin el modelo del puerto). Con SwiftShader un frame puede pasar de 0,5 s, así que la cifra que vale es la del equipo de
// referencia con GPU (AC-90); aquí, de orientación
import fs from 'fs';
import path from 'path';
import { Browser, expect, test } from '@playwright/test';
import { SHIP_GLB } from '../src/client/models/ship-glb';
import { enterGame, entryOf, waitFor } from './helpers';
import { OwnServer, startOwnServer } from './own-server';

const RUNS = Number(process.env.AC227_RUNS ?? 0);
const PROFILES = {
  casa: { latency: 157, downloadThroughput: -1, uploadThroughput: -1 },
  hotspot: { latency: 200, downloadThroughput: 10e6 / 8, uploadThroughput: 2e6 / 8 },
  'hotspot-malo': { latency: 300, downloadThroughput: 3e6 / 8, uploadThroughput: 1e6 / 8 }
} as const;
type Profile = keyof typeof PROFILES;
const CHOSEN = (process.env.AC227_PROFILES?.split(',') ?? Object.keys(PROFILES)) as Profile[];
// AC227_MAP=1.0: el mapa sin el modelo del puerto, para aislar la espera del modelo propio (la entrada también espera al puerto,
// AC-200 e, y con el mapa por defecto los 2 brazos lo esperan); como en la medida de AC-193 (c), anterior al puerto
const MAP = process.env.AC227_MAP;
const OWN = SHIP_GLB['line:es']!;
const COTA = 1_020_000;
const MODELS = path.join(__dirname, '..', 'public');

// Los 20 archivos de las 10 combinaciones: cada GLB y la KTX2 que nombra su uri (paso 4c)
const family = Object.entries(SHIP_GLB).filter(([k]) => k.includes(':')).map(([, u]) => u!);
const ktx2Of = (glbUrl: string) => {
  const b = fs.readFileSync(path.join(MODELS, glbUrl));
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { images?: { uri?: string }[] };
  const uri = json.images?.find((i) => i.uri?.endsWith('.ktx2'))?.uri;
  return uri ? `/models/${uri}` : null;
};
const FILES = family.flatMap((g) => [g, ktx2Of(g)!]);
const ON_DISK = FILES.reduce((n, f) => n + fs.statSync(path.join(MODELS, f)).size, 0);

interface Run {
  arm: 'hoy' | 'B';
  shownAt: number;
  firstFrameAt: number;
  welcomeAt: number;
  withGlb: boolean;
  capped: boolean;
  ownBytes: number; // cuerpo del GLB propio (decodedBodySize)
  ownTransfer: number;
  cachedAfterEntry: number; // de la entrada al último de los 20 archivos
  transfer: number; // bytes por la red de los 20 archivos
  encodings: string[]; // «.glb: gzip», «.ktx2: identity»: el Content-Encoding de cada tipo
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

async function once(browser: Browser, server: OwnServer, profile: Profile, arm: Run['arm'], i: number): Promise<Run> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...PROFILES[profile] });
    const encodings = new Set<string>();
    page.on('response', (r) => {
      const p = new URL(r.url()).pathname;
      if (FILES.includes(p)) encodings.add(`${path.extname(p)}: ${r.headers()['content-encoding'] ?? 'identity'}`);
    });
    const guestId = `e2em${profile.slice(0, 2)}${i}${Date.now().toString(36).slice(-5)}`;
    await page.addInitScript(
      ([id, hoy]) => {
        localStorage.setItem('sea-battle-guest-id', id as string);
        localStorage.setItem(`sea-battle-last-ship:guest:${id}`, 'line:es');
        const w = window as unknown as { __WELCOME_AT__: number };
        w.__WELCOME_AT__ = 0;
        let debug: { runtime(): unknown } | undefined;
        Object.defineProperty(window, '__SEA_BATTLE__', {
          configurable: true,
          get: () => debug,
          set: (v: { runtime(): unknown }) => {
            if (!debug) {
              const rt = v.runtime() as { shipGlb: { waiting(k: string | null): boolean }; src: { myShipId: string | null } };
              if (hoy) rt.shipGlb.waiting = () => false; // «hoy»: la entrada no espera al modelo propio (sí al puerto)
              const id = setInterval(() => {
                if (rt.src.myShipId) {
                  w.__WELCOME_AT__ = performance.now();
                  clearInterval(id);
                }
              }, 5);
            }
            debug = v;
          }
        });
      },
      [guestId, arm === 'hoy'] as const
    );
    await enterGame(page, server.url);
    const entry = await waitFor(() => entryOf(page), (e) => e.shownAt > 0, 30_000, 20);
    const timing = await waitFor(
      () =>
        page.evaluate((files) => {
          const es = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((e) => ({ path: new URL(e.name).pathname, end: e.responseEnd, transfer: e.transferSize, body: e.decodedBodySize }));
          return { done: files.filter((f) => es.some((e) => e.path === f && e.end > 0)).length, es: es.filter((e) => files.includes(e.path)), welcomeAt: (window as unknown as { __WELCOME_AT__: number }).__WELCOME_AT__ };
        }, FILES),
      (t) => t.done === FILES.length,
      60_000,
      100
    );
    const own = timing.es.find((e) => e.path === OWN);
    return {
      arm,
      shownAt: Math.round(entry.shownAt),
      firstFrameAt: Math.round(entry.firstFrameAt),
      welcomeAt: Math.round(timing.welcomeAt),
      withGlb: entry.withGlb,
      capped: entry.capped,
      ownBytes: own?.body ?? -1,
      ownTransfer: own?.transfer ?? -1,
      cachedAfterEntry: Math.round(Math.max(...timing.es.map((e) => e.end)) - entry.shownAt),
      transfer: timing.es.reduce((n, e) => n + e.transfer, 0),
      encodings: [...encodings]
    };
  } finally {
    await ctx.close();
  }
}

test.describe('AC-227 (c): la medida de descarga con las 10 combinaciones', () => {
  test.skip(!RUNS, 'medida a mano: AC227_RUNS=<corridas por brazo>');
  let server: OwnServer;
  test.beforeAll(async () => {
    server = await startOwnServer({ SEA_BATTLE_SCENARIO: 'navio-13', ...(MAP ? { SEA_BATTLE_MAP: MAP } : {}) });
  });
  test.afterAll(async () => {
    await server?.kill();
  });

  for (const profile of CHOSEN) {
    test(`${profile}: Δ p95 de la entrada, GLB propio y las 10 en caché`, async ({ browser }, info) => {
      test.setTimeout(RUNS * 2 * 90_000);
      const runs: Run[] = [];
      for (let i = 0; i < RUNS; i++) for (const arm of i % 2 ? (['B', 'hoy'] as const) : (['hoy', 'B'] as const)) runs.push(await once(browser, server, profile, arm, i));
      const of = (arm: Run['arm']) => runs.filter((r) => r.arm === arm);
      const shown = (arm: Run['arm']) => of(arm).map((r) => r.shownAt);
      const summary = {
        profile,
        map: MAP ?? 'por defecto',
        runs: RUNS,
        entry: { hoy: { p50: pct(shown('hoy'), 50), p95: pct(shown('hoy'), 95) }, B: { p50: pct(shown('B'), 50), p95: pct(shown('B'), 95) } },
        deltaP95: pct(shown('B'), 95) - pct(shown('hoy'), 95),
        ownOnTime: `${of('B').filter((r) => r.withGlb && !r.capped).length} de ${RUNS}`,
        ownBytes: Math.max(...runs.map((r) => r.ownBytes)),
        ownTransfer: Math.max(...runs.map((r) => r.ownTransfer)),
        cachedAfterEntry: { p50: pct(runs.map((r) => r.cachedAfterEntry), 50), p95: pct(runs.map((r) => r.cachedAfterEntry), 95) },
        transfer: { min: Math.min(...runs.map((r) => r.transfer)), max: Math.max(...runs.map((r) => r.transfer)) },
        encodings: [...new Set(runs.flatMap((r) => r.encodings))],
        onDisk: ON_DISK,
        cota: COTA
      };
      console.log(`AC-227 (c) ${profile}: ${JSON.stringify(summary)}`);
      fs.writeFileSync(info.outputPath(`ac227c-${profile}${MAP ? `-mapa-${MAP}` : ''}.json`), JSON.stringify({ summary, runs }, null, 1));
      expect(summary.ownBytes).toBeLessThanOrEqual(120_000);
      if (profile !== 'hotspot-malo') expect(summary.deltaP95).toBeLessThanOrEqual(517);
      if (profile === 'hotspot') expect(summary.cachedAfterEntry.p95).toBeLessThanOrEqual(10_000);
    });
  }
});

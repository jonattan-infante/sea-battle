// Las 10 combinaciones en el juego (1.3; BACKLOG AC-227, AC-226 d, AC-197 d): el modelo de cada barco sale de su clase y de
// su familia (`fa`, GDD §13). Con familia, su GLB de SHIP_GLB; sin familia, el procedural de la clase (AC-227 e). La
// predicción del barco propio guarda la clase y la familia (own-ship-memory.ts), y un jugador sin familia no espera a
// ningún modelo propio. Cada test lleva su servidor con el escenario de la tienda de la 1.3 (server/scenarios.ts)
import { Browser, expect, Page, test } from '@playwright/test';
import { SHIP_GLB } from '../src/client/models/ship-glb';
import { enterGame, entryOf, envNoise, me, waitFor } from './helpers';
import { OwnServer, startOwnServer } from './own-server';

type PlayerDebug = { family: string; families: string[]; activeShip: string };
const playerOf = (page: Page) => page.evaluate(() => window.__SEA_BATTLE__!.player() as PlayerDebug);

// La vista de un barco (el propio si no se da id): su modelo (sb_id de sus extras: «ship_frigate_gb» del GLB, «ship_frigate»
// del procedural), si lleva la textura del GLB en su material y si es el modelo que el store da para su clave
const viewOf = (page: Page, id?: string) =>
  page.evaluate((id) => {
    type View = { ship: { classId: string; family: string | null }; model: { map?: unknown; extras: { sb_id: string } }; mesh: { material: { map: unknown } } };
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { views: Map<string, View>; src: { myShipId: string }; shipGlb: { model(k: string): unknown } };
    const v = rt.views.get(id ?? rt.src.myShipId);
    if (!v) return null;
    const key = v.ship.family && v.ship.family !== 'none' ? `${v.ship.classId}:${v.ship.family}` : v.ship.classId;
    return { key, sbId: v.model.extras.sb_id, glb: !!v.model.map, materialMap: v.mesh.material.map === (v.model.map ?? null), current: v.model === rt.shipGlb.model(key) };
  }, id);

// La bienvenida (el primer instante con barco propio), apuntada en la página cada 5 ms, como en ship-glb.spec.ts
const probeWelcome = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __WELCOME_AT__: number; __SEA_BATTLE__?: { runtime(): unknown } };
    w.__WELCOME_AT__ = 0;
    const id = setInterval(() => {
      if ((w.__SEA_BATTLE__?.runtime() as { src: { myShipId: string | null } } | undefined)?.src.myShipId) {
        w.__WELCOME_AT__ = performance.now();
        clearInterval(id);
      }
    }, 5);
  });

// Las descargas de los GLB de los barcos del jugador (/models/ship_*.glb) según Resource Timing, y si salieron antes de la
// bienvenida
const shipRequests = (page: Page) =>
  page.evaluate(() => {
    const at = (window as unknown as { __WELCOME_AT__: number }).__WELCOME_AT__;
    return (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .map((e) => ({ path: new URL(e.name).pathname, start: e.startTime }))
      .filter((e) => e.path.startsWith('/models/ship_') && e.path.endsWith('.glb'))
      .map((e) => ({ path: e.path, beforeWelcome: at === 0 || e.start < at }));
  });

// La entrada ya abierta (EntryGate.shownAt)
const openedEntry = (page: Page) => waitFor(() => entryOf(page), (e) => e.shownAt > 0, 20_000, 50);

async function openFamilyTab(page: Page) {
  await page.getByTestId('btn-port').click();
  await expect(page.getByTestId('shop')).toBeVisible();
  await page.getByTestId('tab-family').click();
}

// Los errores de la página, sin el ruido del entorno (envNoise: Clerk JS contra su dominio .invalid de pruebas), en la consola
// y en las excepciones: si la carga de Clerk vence durante el test, sale como pageerror (H-2, QA-78)
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !envNoise(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => !envNoise(e.message) && errors.push(e.message));
  return () => errors;
};

async function player(browser: Browser, server: OwnServer, init?: (page: Page) => Promise<void>) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = errorsOf(page);
  await probeWelcome(page);
  await init?.(page);
  await enterGame(page, server.url);
  return { ctx, page, errors };
}

test.describe('AC-227: el modelo de cada barco sale de su clase y su familia', () => {
  test('SHIP_GLB tiene las 10 combinaciones y ninguna clase del jugador sin familia (AC-227 a y e)', () => {
    const keys = Object.keys(SHIP_GLB).filter((k) => k.includes(':')).sort();
    expect(keys).toEqual(['brig', 'frigate', 'line', 'schooner', 'sloop'].flatMap((c) => [`${c}:es`, `${c}:gb`]).sort());
    for (const c of ['sloop', 'brig', 'schooner', 'frigate', 'line']) expect(SHIP_GLB[c]).toBeUndefined();
  });

  test.describe('la Fragata sin familia que compra la británica (family-13)', () => {
    let server: OwnServer;
    test.beforeAll(async () => {
      server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'family-13' });
    });
    test.afterAll(async () => {
      await server?.kill();
    });

    test('AC-227 (e), AC-197 (d): sin familia entra con el procedural sin esperar a ningún modelo propio; al comprar la británica cambia a su GLB, y al volver a «Sin familia», al procedural', async ({ browser }) => {
      test.setTimeout(120_000);
      const { ctx, page, errors } = await player(browser, server);
      try {
        // No espera a ningún modelo propio: ni antes de la bienvenida (la predicción es la Balandra sin familia) ni con su barco
        // (la Fragata sin familia no tiene GLB). La entrada sí puede esperar al modelo del puerto (AC-200 e), que no es propio
        const entry = await openedEntry(page);
        const own = await page.evaluate(() => {
          const glb = (window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { waiting(k: string | null): boolean } }).shipGlb;
          return [glb.waiting(null), glb.waiting('frigate')];
        });
        console.log(`AC-197 (d), sin familia: ${JSON.stringify(entry)}`);
        expect(own).toEqual([false, false]);
        expect(entry).toMatchObject({ withGlb: false, capped: false, coverHidden: true });
        await expect.poll(() => page.evaluate(() => (window as unknown as { __WELCOME_AT__: number }).__WELCOME_AT__)).toBeGreaterThan(0);
        expect((await shipRequests(page)).filter((r) => r.beforeWelcome)).toEqual([]); // un jugador nuevo sin familia no pide GLB antes de la bienvenida
        await expect.poll(() => viewOf(page)).toMatchObject({ key: 'frigate', sbId: 'ship_frigate', glb: false, current: true });

        await openFamilyTab(page);
        await page.getByTestId('buy-family-gb').click();
        await waitFor(() => playerOf(page), (p) => p.family === 'gb', 5000, 50);
        await expect.poll(() => viewOf(page), { timeout: 30_000 }).toMatchObject({ key: 'frigate:gb', sbId: 'ship_frigate_gb', glb: true, materialMap: true, current: true });

        await page.getByTestId('select-family-none').click();
        await expect.poll(() => viewOf(page)).toMatchObject({ key: 'frigate', sbId: 'ship_frigate', glb: false, current: true });
        await page.getByTestId('select-family-gb').click();
        await expect.poll(() => viewOf(page)).toMatchObject({ key: 'frigate:gb', sbId: 'ship_frigate_gb', glb: true });
        // El GLB se bajó una vez, aunque el barco cambió 3 veces de modelo (AC-197 c: cada modelo se carga una vez)
        expect((await shipRequests(page)).filter((r) => r.path.startsWith('/models/ship_frigate_gb.')).length).toBe(1);
        expect(await page.evaluate(() => localStorage.getItem(`sea-battle-last-ship:guest:${localStorage.getItem('sea-battle-guest-id')}`))).toBe('frigate:gb');
        expect(errors()).toEqual([]);
      } finally {
        await ctx.close();
      }
    });
  });

  test.describe('2 jugadores con el Bergantín británico (shop-13)', () => {
    let server: OwnServer;
    test.beforeAll(async () => {
      server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'shop-13' });
    });
    test.afterAll(async () => {
      await server?.kill();
    });

    test('AC-227 (a, e): cada uno ve el barco del otro con la familia del otro; si uno vuelve a «Sin familia», el otro lo ve con el procedural', async ({ browser }) => {
      test.setTimeout(150_000);
      const a = await player(browser, server);
      const b = await player(browser, server);
      try {
        const [idA, idB] = [(await me(a.page))!.id, (await me(b.page))!.id];
        await expect.poll(() => viewOf(a.page, idB), { timeout: 30_000 }).toMatchObject({ key: 'brig:gb', sbId: 'ship_brigantine_gb', glb: true });
        await expect.poll(() => viewOf(b.page, idA), { timeout: 30_000 }).toMatchObject({ key: 'brig:gb', sbId: 'ship_brigantine_gb', glb: true });
        await openFamilyTab(b.page);
        await b.page.getByTestId('select-family-none').click();
        await expect.poll(() => viewOf(a.page, idB)).toMatchObject({ key: 'brig', sbId: 'ship_brigantine', glb: false, current: true });
        await expect.poll(() => viewOf(b.page)).toMatchObject({ key: 'brig', sbId: 'ship_brigantine', glb: false });
        expect(await viewOf(b.page, idA)).toMatchObject({ key: 'brig:gb', sbId: 'ship_brigantine_gb', glb: true });
        expect([...a.errors(), ...b.errors()]).toEqual([]);
      } finally {
        await a.ctx.close();
        await b.ctx.close();
      }
    });

    // Opción A de AC-193 c con la familia (AC-226 d): con el Bergantín británico guardado, su GLB sale antes de la bienvenida
    // y el barco propio entra ya con él. Con el tope a 10 s, como en ship-glb.spec.ts: un frame de SwiftShader pasa de 0,5 s
    test('AC-193 c (A), AC-226 (d): con el Bergantín británico guardado, su GLB se pide antes de la bienvenida, una vez, y el barco propio entra ya con él', async ({ browser }) => {
      test.setTimeout(120_000);
      const guestId = `e2ef${Date.now().toString(36).slice(-6)}`;
      const { ctx, page, errors } = await player(browser, server, (p) =>
        p.addInitScript((id) => {
          localStorage.setItem('sea-battle-guest-id', id);
          localStorage.setItem(`sea-battle-last-ship:guest:${id}`, 'brig:gb');
          let debug: unknown;
          Object.defineProperty(window, '__SEA_BATTLE__', {
            configurable: true,
            get: () => debug,
            set: (v: { runtime(): unknown }) => {
              if (!debug) (v.runtime() as { entry: { waitMs: number } }).entry.waitMs = 10_000;
              debug = v;
            }
          });
        }, guestId)
      );
      try {
        const entry = await openedEntry(page);
        const own = (await shipRequests(page)).filter((r) => r.path.startsWith('/models/ship_brigantine_gb.'));
        console.log(`AC-193 c (A) con familia: ${JSON.stringify({ entry, own })}`);
        expect(own).toEqual([{ path: SHIP_GLB['brig:gb'], beforeWelcome: true }]);
        expect(entry).toMatchObject({ withGlb: true, capped: false, coverHidden: true });
        expect(await viewOf(page)).toMatchObject({ key: 'brig:gb', sbId: 'ship_brigantine_gb', glb: true, materialMap: true });
        expect(errors()).toEqual([]);
      } finally {
        await ctx.close();
      }
    });
  });
});

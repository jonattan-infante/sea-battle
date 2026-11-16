// La tienda de la 1.3 (ART-DIRECTION §14, «1.3: la tienda por barco» y «Pestaña Familia en la 1.3»; láminas D103 y D101):
// la lista de barcos con su vista previa, sus niveles y «Mejoras» (AC-217, con la línea «Requiere nivel» de AC-162), la vista
// de mejoras de un barco (AC-216), sus precios (AC-214), la pestaña Familia con la compra (AC-225, AC-222 y AC-223) y el aviso
// dentro del Astillero (O-48). Servidores propios con los escenarios de las láminas (server/scenarios.ts): «shop-13» (nivel 4,
// 2 000 de oro, la británica, navega el Bergantín y tiene la Balandra 3/1/2 y la Fragata 2/3/1) y «family-13» (navega la
// Fragata, sin familia, con 5 500 de oro y la Balandra). En los 3 tamaños de §12; capturas en qa-artifacts/shop-13
import fs from 'fs';
import path from 'path';
import { Browser, BrowserContext, BrowserContextOptions, expect, Page, test, WebSocketRoute } from '@playwright/test';
import { FAMILY_13, SHOP_13 } from '../server/scenarios';
import { SHOP_UNAVAILABLE } from '../src/client/hud-logic';
import { FAMILY_BUY_FAILED, FAMILY_SELECT_FAILED } from '../src/client/shop-logic';
import { PLAYER_SHIP_ORDER, PlayerShipClass, upgradePrice } from '../src/game/constants';
import { SHIP_PREVIEWS } from '../src/client/ship-previews';
import { commits, enterGame, installCommitCounter, trackSocket, waitFor } from './helpers';
import { intents, Net } from './net';
import { OwnServer, startOwnServer } from './own-server';

type Size = 'desktop' | 'portrait' | 'landscape';
const SIZES: Record<Size, BrowserContextOptions> = {
  desktop: { viewport: { width: 1440, height: 900 } },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};
const SHOTS = path.join(__dirname, '..', 'qa-artifacts', 'shop-13');
fs.mkdirSync(SHOTS, { recursive: true });
const IMMUTABLE = 'public, max-age=31536000, immutable';

type Box = { x: number; y: number; width: number; height: number };
const inside = (a: Box, b: Box) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;

type Levels = { cannons: number; hull: number; sails: number };
type PlayerDebug = { gold: number; activeShip: PlayerShipClass; ships: Partial<Record<PlayerShipClass, Levels>>; families: string[]; family: string };
const playerOf = (page: Page) => page.evaluate(() => window.__SEA_BATTLE__!.player() as PlayerDebug);
const levelsText = (l: Levels) => `${l.cannons},${l.hull},${l.sails}`;

// Las peticiones a /previews/ que hace la página (con su Cache-Control), desde que se llama
function previews(page: Page) {
  const seen: { path: string; cache: string }[] = [];
  page.on('response', (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith('/previews/')) seen.push({ path: p, cache: r.headers()['cache-control'] ?? '' });
  });
  return seen;
}

// Lo que no cabe en su caja (scrollWidth > clientWidth) entre los elementos de la tienda que se le pasan
const overflowing = (page: Page, selector: string) =>
  page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => `${e.className}: ${e.scrollWidth} > ${e.clientWidth} «${e.textContent}»`), selector);

async function openShop(page: Page, touch: boolean) {
  if (touch) await page.getByTestId('m-port').tap();
  else await page.getByTestId('btn-port').click();
  await expect(page.getByTestId('shop')).toBeVisible();
}

const press = (page: Page, testId: string, touch: boolean) => (touch ? page.getByTestId(testId).tap() : page.getByTestId(testId).click());

// Las imágenes que se ven, cargadas
const loadedPreviews = (page: Page, selector: string) =>
  page.evaluate((sel) => [...document.querySelectorAll<HTMLImageElement>(sel)].every((i) => i.complete && i.naturalWidth > 0 && i.classList.contains('is-loaded')), selector);

// Un jugador nuevo del escenario, con sus frames de Socket.IO capturados desde antes de conectar
async function newPlayer(browser: Browser, size: Size, server: OwnServer): Promise<{ ctx: BrowserContext; page: Page; net: Net }> {
  const ctx = await browser.newContext(SIZES[size]);
  const page = await ctx.newPage();
  const net = trackSocket(page);
  await enterGame(page, server.url);
  return { ctx, page, net };
}

test.describe('La tienda por barco (D103; AC-216, AC-217, AC-162)', () => {
  let server: OwnServer;
  test.beforeAll(async () => {
    server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'shop-13' });
  });
  test.afterAll(async () => {
    await server?.kill();
  });

  for (const size of Object.keys(SIZES) as Size[]) {
    test(`AC-217 (${size}): cada barco con su vista previa en el aspecto en uso, sus niveles o «Llega sin mejoras», «Elegir»/«En uso» y «Mejoras», y «Requiere nivel»; 0 imágenes antes de abrir y 5 al abrir; el barco que navega y su «Mejoras» a la vista`, async ({ browser }) => {
      test.setTimeout(120_000);
      const touch = size !== 'desktop';
      const { ctx, page } = await newPlayer(browser, size, server);
      try {
        const seen = previews(page);
        const p = await playerOf(page);
        expect([p.activeShip, p.family, p.ships]).toEqual([SHOP_13.progress.activeShip, SHOP_13.progress.family, SHOP_13.progress.ships]);
        await page.waitForTimeout(500);
        expect(seen).toEqual([]); // 0 antes de abrir el Astillero
        await openShop(page, touch);
        await expect(page.getByRole('tab', { name: 'Barcos' })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tab')).toHaveText(['Barcos', 'Familia']); // ya no hay pestaña Mejoras
        await waitFor(() => loadedPreviews(page, '[data-testid^="ship-preview-"]'), (ok) => ok, 10_000, 100);
        // (a) las 5, también las que no tiene, con la familia en uso (la británica)
        for (const c of PLAYER_SHIP_ORDER) {
          const img = page.getByTestId(`ship-preview-${c}`);
          await expect(img).toHaveAttribute('src', SHIP_PREVIEWS[c].gb);
          await expect(img).toHaveAttribute('data-family', 'gb');
        }
        expect(seen.map((s) => s.path).sort()).toEqual(PLAYER_SHIP_ORDER.map((c) => SHIP_PREVIEWS[c].gb).sort()); // 5, solo las del aspecto en uso
        expect(new Set(seen.map((s) => s.cache))).toEqual(new Set([IMMUTABLE]));
        // (b) los propios: sus 3 niveles (los del servidor), «En uso» en el que navega, «Elegir» en los demás y «Mejoras»
        for (const c of ['sloop', 'brig', 'frigate'] as const) {
          await expect(page.getByTestId(`levels-${c}`)).toHaveAttribute('data-levels', levelsText(p.ships[c]!));
          await expect(page.getByTestId(`upgrades-${c}`)).toBeEnabled();
        }
        await expect(page.getByTestId('in-use-brig')).toHaveText('En uso');
        await expect(page.getByTestId('use-sloop')).toHaveText('Elegir');
        await expect(page.getByTestId('use-frigate')).toHaveText('Elegir');
        await expect(page.getByTestId('use-brig')).toHaveCount(0);
        // (c) los que no tiene: «Llega sin mejoras»; (d) con nivel 4, la línea «Requiere nivel» entera y «Comprar» apagado
        for (const c of ['schooner', 'line'] as const) await expect(page.getByTestId(`ship-${c}`)).toContainText('Llega sin mejoras');
        await expect(page.getByTestId('level-lock-schooner')).toHaveText('Requiere nivel 5 (Marinero)');
        await expect(page.getByTestId('level-lock-line')).toHaveText('Requiere nivel 9 (Contramaestre)');
        await expect(page.getByTestId('buy-ship-schooner')).toBeDisabled();
        await expect(page.getByTestId('buy-ship-line')).toBeDisabled();
        // Nada se sale de su caja
        expect(await overflowing(page, '.shop .card, .shop .card__title, .shop .card__stats, .shop .card__foot, .shop .card__why, .shop .lv, .shop .card__new')).toEqual([]);
        // Al abrir: el barco que navega y su «Mejoras», a la vista (en el escritorio, los 5)
        const body = (await page.getByTestId('shop-body').boundingBox())!;
        expect(inside((await page.getByTestId('ship-brig').boundingBox())!, body)).toBe(true);
        expect(inside((await page.getByTestId('upgrades-brig').boundingBox())!, body)).toBe(true);
        if (size === 'desktop') {
          for (const c of PLAYER_SHIP_ORDER) expect(inside((await page.getByTestId(`ship-${c}`).boundingBox())!, body)).toBe(true);
          expect(await page.getByTestId('shop-body').evaluate((e) => e.scrollTop)).toBe(0);
        } else expect(await page.getByTestId('shop-body').evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true); // se desplaza
        // La vista previa: 112 × 70,7 (19:12)
        const pv = (await page.locator('[data-testid="ship-frigate"] .card__preview').boundingBox())!;
        expect([Math.round(pv.width), Math.round(pv.height * 10) / 10]).toEqual([112, 70.7]);
        await page.screenshot({ path: path.join(SHOTS, `d103-lista-${size}.png`) });
        const sum = await page.evaluate(() => [...document.querySelectorAll('.shop .card--ship')].map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10));
        console.log(`AC-217 ${size}: alturas de las tarjetas ${JSON.stringify(sum)}; desplazamiento al abrir ${await page.getByTestId('shop-body').evaluate((e) => e.scrollTop)}`);
      } finally {
        await ctx.close();
      }
    });
  }

  // Reglas 3 y 4 de CLAUDE.md con la tienda abierta: las imágenes entran sin estado de React (clase is-loaded) y, quieto, el
  // Astillero no vuelve a pintar ni envía nada; tampoco al pasar a la vista de mejoras y volver, más allá de esos clics
  test('AC-83 y AC-86 con el Astillero abierto: con las imágenes cargadas y quieto, 0 commits de React en 5 s y 0 mensajes enviados', async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext(SIZES.desktop);
    const page = await ctx.newPage();
    await installCommitCounter(page);
    const net = trackSocket(page);
    try {
      await enterGame(page, server.url);
      await openShop(page, false);
      await waitFor(() => loadedPreviews(page, '[data-testid^="ship-preview-"]'), (ok) => ok, 10_000, 100);
      await page.mouse.move(5, 450); // fuera del panel, sin hover
      await page.waitForTimeout(1500);
      const c0 = await commits(page);
      net.reset();
      await page.waitForTimeout(5000);
      const c1 = await commits(page);
      console.log(`Astillero abierto y quieto: ${c1 - c0} commits en 5 s, ${net.sent.length} mensajes enviados`);
      expect(c1 - c0).toBe(0);
      expect(net.sent).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('AC-217: la caja de cada imagen tiene su tamaño antes de que llegue y no cambia al cargar', async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page } = await newPlayer(browser, 'desktop', server);
    try {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      await page.route('**/previews/**', async (route) => {
        await gate;
        await route.continue();
      });
      await openShop(page, false);
      const boxes = () => page.evaluate(() => [...document.querySelectorAll('.shop .card__preview')].map((e) => JSON.stringify(e.getBoundingClientRect())));
      const cards = () => page.evaluate(() => [...document.querySelectorAll('.shop .card--ship')].map((e) => JSON.stringify(e.getBoundingClientRect())));
      const before = [await boxes(), await cards()];
      expect(await loadedPreviews(page, '[data-testid^="ship-preview-"]')).toBe(false); // aún no han llegado
      release();
      await waitFor(() => loadedPreviews(page, '[data-testid^="ship-preview-"]'), (ok) => ok, 10_000, 100);
      expect([await boxes(), await cards()]).toEqual(before);
    } finally {
      await ctx.close();
    }
  });

  test('AC-217: en la visita siguiente, las imágenes no piden nada a la red (caché de un año)', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext(SIZES.desktop);
    try {
      const first = await ctx.newPage();
      await enterGame(first, server.url);
      await openShop(first, false);
      await waitFor(() => loadedPreviews(first, '[data-testid^="ship-preview-"]'), (ok) => ok, 10_000, 100);
      await first.close();
      const again = await ctx.newPage();
      await enterGame(again, server.url);
      await openShop(again, false);
      await waitFor(() => loadedPreviews(again, '[data-testid^="ship-preview-"]'), (ok) => ok, 10_000, 100);
      const net = await again.evaluate(() =>
        (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
          .filter((e) => new URL(e.name).pathname.startsWith('/previews/'))
          .map((e) => ({ path: new URL(e.name).pathname, toNetwork: e.transferSize > 0, body: e.decodedBodySize > 0 }))
      );
      console.log(`AC-217 visita siguiente: ${JSON.stringify(net)}`);
      expect(net.map((n) => n.path).sort()).toEqual(PLAYER_SHIP_ORDER.map((c) => SHIP_PREVIEWS[c].gb).sort());
      expect(net.every((n) => !n.toNetwork && n.body)).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  for (const size of Object.keys(SIZES) as Size[]) {
    test(`AC-216 (${size}): «Mejoras» de la Fragata abre su vista sin enviar nada: su nombre, su imagen, sus niveles y precios, y el aviso de que no es el barco que navega; la compra lleva ship: frigate, sube el nivel ahí mismo y el barco activo no cambia; «‹ Barcos» vuelve al mismo punto`, async ({ browser }) => {
      test.setTimeout(120_000);
      const touch = size !== 'desktop';
      const { ctx, page, net } = await newPlayer(browser, size, server);
      try {
        await openShop(page, touch);
        // En el móvil, la lista abre con el Bergantín a la vista; la Fragata queda más abajo
        const body = page.getByTestId('shop-body');
        await page.getByTestId('upgrades-frigate').scrollIntoViewIfNeeded();
        const listScroll = await body.evaluate((e) => e.scrollTop);
        net.reset();
        await press(page, 'upgrades-frigate', touch);
        const view = page.getByTestId('upgrades-view');
        await expect(view).toHaveAttribute('data-ship', 'frigate');
        await page.waitForTimeout(300);
        expect(intents(net)).toEqual([]); // abrir la vista no envía nada
        await expect(page.getByRole('tab', { name: 'Barcos' })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByTestId('upgrades-title')).toHaveText('Mejoras de la Fragata');
        await expect(page.getByTestId('upgrades-preview')).toHaveAttribute('src', SHIP_PREVIEWS.frigate.gb);
        const p = await playerOf(page);
        await expect(page.getByTestId('upgrades-levels')).toHaveAttribute('data-levels', levelsText(p.ships.frigate!));
        await expect(page.getByTestId('upgrades-other-ship')).toHaveText('No es el barco que navegas. La mejora se le aplica igual, y sigues navegando el Bergantín.');
        // El 8 % de --btn-primary sobre el color de tarjeta (#FBF4E2), no sobre el papel: #E9E9DB (ART-DIRECTION :1503)
        expect(await page.getByTestId('upgrades-other-ship').evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).backgroundImage])).toEqual([
          'rgb(251, 244, 226)',
          'linear-gradient(rgba(31, 111, 139, 0.08), rgba(31, 111, 139, 0.08)), none' // el color de tarjeta va en la 2.ª capa del atajo
        ]);
        await expect(page.getByTestId('upgrades-in-use')).toHaveCount(0);
        // Los niveles y los precios de la Fragata (2/3/1), no los del Bergantín
        await expect(page.getByTestId('shop-cannons')).toContainText('Nivel 2/3');
        await expect(page.getByTestId('price-cannons')).toHaveText(String(upgradePrice('frigate', 'cannons', 3))); // 1500 (es-ES no separa 4 cifras)
        await expect(page.getByTestId('shop-hull')).toContainText('Máximo');
        await expect(page.getByTestId('price-sails')).toHaveText(String(upgradePrice('frigate', 'sails', 2)));
        const imgBox = (await page.getByTestId('upgrades-preview').boundingBox())!;
        expect(Math.round(imgBox.width)).toBe(size === 'desktop' ? 190 : 144);
        expect(await overflowing(page, '.shop .upgrades__title, .shop .upgrades__other, .shop .card, .shop .card__foot, .shop .card__stats')).toEqual([]);
        await page.screenshot({ path: path.join(SHOTS, `d103-vista-fragata-${size}.png`) });

        // Comprar Velas N2 de la Fragata: la intención nombra la Fragata, el nivel sube ahí mismo, el oro baja y se sigue en el Bergantín
        net.reset();
        await press(page, 'buy-sails-2', touch);
        await expect(page.getByTestId('shop-sails')).toContainText('Nivel 2/3');
        await expect(page.getByTestId('upgrades-levels')).toHaveAttribute('data-levels', '2,3,2');
        expect(intents(net)).toEqual([{ name: 'buy', data: { itemId: 'sails:2', ship: 'frigate' } }]);
        const after = await playerOf(page);
        expect([after.activeShip, after.gold, after.ships.frigate, after.ships.brig]).toEqual(['brig', 2000 - upgradePrice('frigate', 'sails', 2), { cannons: 2, hull: 3, sails: 2 }, { cannons: 1, hull: 1, sails: 1 }]);
        // «Compra realizada» dentro del Astillero (O-48), visible, a 16 px del borde de abajo del panel, y no en la columna del HUD
        const notice = page.getByTestId('shop-notice');
        await expect(notice).toHaveText('Compra realizada');
        const nb = (await notice.boundingBox())!;
        const panel = await page.locator('.shop').evaluate((e) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          return { bottom: r.bottom - parseFloat(cs.borderBottomWidth), left: r.left, width: r.width };
        });
        expect(Math.abs(panel.bottom - 16 - (nb.y + nb.height))).toBeLessThanOrEqual(1);
        expect(Math.round(nb.width)).toBe(size === 'portrait' ? Math.round(panel.width) - 32 : 360);
        expect(await notice.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
        await expect(page.getByTestId('toasts')).not.toContainText('Compra realizada');
        await page.screenshot({ path: path.join(SHOTS, `d103-vista-comprada-${size}.png`) });

        // «‹ Barcos» vuelve a la lista, en el mismo punto de desplazamiento
        await press(page, 'upgrades-back', touch);
        await expect(page.getByTestId('upgrades-view')).toHaveCount(0);
        await expect(page.getByTestId('levels-frigate')).toHaveAttribute('data-levels', '2,3,2');
        expect(Math.abs((await body.evaluate((e) => e.scrollTop)) - listScroll)).toBeLessThanOrEqual(1);

        // El barco que navega: el sello «En uso» y sin aviso
        await press(page, 'upgrades-brig', touch);
        await expect(page.getByTestId('upgrades-title')).toHaveText('Mejoras del Bergantín');
        await expect(page.getByTestId('upgrades-in-use')).toHaveText('En uso');
        await expect(page.getByTestId('upgrades-other-ship')).toHaveCount(0);
        await page.screenshot({ path: path.join(SHOTS, `d103-vista-bergantin-${size}.png`) });
        // La pestaña Barcos, marcada, también vuelve a la lista
        await press(page, 'tab-ships', touch);
        await expect(page.getByTestId('upgrades-view')).toHaveCount(0);
        await expect(page.getByTestId('ship-brig')).toBeVisible();
      } finally {
        await ctx.close();
      }
    });
  }
});

test.describe('Los precios de cada barco y la pestaña Familia (AC-214; D101: AC-225, AC-222, AC-223)', () => {
  let server: OwnServer;
  test.beforeAll(async () => {
    server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'family-13' });
  });
  test.afterAll(async () => {
    await server?.kill();
  });

  test('AC-214: navegando la Balandra, su vista dice 250 en Cañones N2 y la de la Fragata 500, sin cambiar de barco', async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page } = await newPlayer(browser, 'desktop', server);
    try {
      expect(FAMILY_13.progress.activeShip).toBe('frigate');
      await openShop(page, false);
      await page.getByTestId('use-sloop').click();
      await waitFor(() => playerOf(page), (p) => p.activeShip === 'sloop', 3000, 50);
      await page.getByTestId('upgrades-sloop').click();
      await expect(page.getByTestId('price-cannons')).toHaveText(String(upgradePrice('sloop', 'cannons', 2)));
      await expect(page.getByTestId('price-cannons')).toHaveText('250');
      await page.getByTestId('upgrades-back').click();
      await page.getByTestId('upgrades-frigate').click();
      await expect(page.getByTestId('price-cannons')).toHaveText('500');
      expect((await playerOf(page)).activeShip).toBe('sloop');
    } finally {
      await ctx.close();
    }
  });

  // El WebSocket del juego pasa por el test (como en progress-states.spec.ts): puede tragarse las intenciones de familia, para
  // que el servidor no conteste, y marcar la vista privada con `unsaved`, como el servidor con la BD caída (AC-132)
  test('AC-225 (e) y AC-132: mientras llega la respuesta, el botón pulsado se apaga con su mismo texto; sin respuesta en 5 s vuelve con el aviso de error y no se cobra; con la BD caída, «Comprar» y «Elegir» se apagan y el sello se queda', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext(SIZES.desktop);
    const page = await ctx.newPage();
    const packet = (event: string, data: unknown) => `42${JSON.stringify([event, data])}`;
    const parse = (m: string | Buffer): [string, Record<string, unknown>] | null => (typeof m === 'string' && m.startsWith('42[') ? (JSON.parse(m.slice(2)) as [string, Record<string, unknown>]) : null);
    const s = { swallow: false, swallowed: [] as string[], unsaved: undefined as boolean | undefined, lastMe: null as Record<string, unknown> | null, lastT: 0, ws: null as WebSocketRoute | null };
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      const server = ws.connectToServer();
      s.ws = ws;
      ws.onMessage((m) => {
        const p = parse(m);
        const family = p && ((p[0] === 'buy' && String(p[1].itemId).startsWith('family:')) || p[0] === 'selectFamily');
        if (family && s.swallow) return void s.swallowed.push(String(m));
        server.send(m);
      });
      server.onMessage((m) => {
        const p = parse(m);
        if (p?.[0] === 'frame') {
          s.lastT = p[1].t as number;
          if (p[1].me) {
            s.lastMe = p[1].me as Record<string, unknown>;
            if (s.unsaved !== undefined) return ws.send(packet('frame', { ...p[1], me: { ...s.lastMe, unsaved: s.unsaved } }));
          }
        }
        ws.send(m);
      });
    });
    try {
      await enterGame(page, server.url);
      await openShop(page, false);
      await page.getByTestId('tab-family').click();
      // Comprar la británica sin respuesta: «Comprar» apagado con su texto; la española sigue encendida
      s.swallow = true;
      const t0 = Date.now();
      await page.getByTestId('buy-family-gb').click();
      await expect(page.getByTestId('buy-family-gb')).toBeDisabled();
      await expect(page.getByTestId('buy-family-gb')).toHaveText('Comprar');
      await expect(page.getByTestId('buy-family-es')).toBeEnabled();
      expect(s.swallowed).toHaveLength(1);
      await page.screenshot({ path: path.join(SHOTS, 'd101-esperando.png') });
      await expect(page.getByTestId('shop-notice')).toHaveText(FAMILY_BUY_FAILED, { timeout: 8000 });
      const waited = Date.now() - t0;
      console.log(`AC-225 (e): el botón volvió a los ${waited} ms`);
      expect(waited).toBeGreaterThanOrEqual(4900);
      await expect(page.getByTestId('buy-family-gb')).toBeEnabled();
      await expect(page.getByTestId('shop-notice')).toHaveClass(/toast--danger/);
      expect((await playerOf(page)).gold).toBe(5500); // no se cobra
      await page.screenshot({ path: path.join(SHOTS, 'd101-sin-respuesta.png') });

      // Con la británica comprada, elegir «Sin familia» sin respuesta: el aviso de error del cambio
      s.swallow = false;
      await page.getByTestId('buy-family-gb').click();
      await expect(page.getByTestId('family-gb')).toHaveAttribute('aria-current', 'true');
      s.swallow = true;
      await page.getByTestId('select-family-none').click();
      await expect(page.getByTestId('select-family-none')).toBeDisabled();
      await expect(page.getByTestId('select-family-none')).toHaveText('Elegir');
      await expect(page.getByTestId('shop-notice')).toHaveText(FAMILY_SELECT_FAILED, { timeout: 8000 });
      await expect(page.getByTestId('select-family-none')).toBeEnabled();
      await expect(page.getByTestId('family-gb')).toHaveAttribute('aria-current', 'true');

      // BD caída (AC-132): la franja, «Comprar» y «Elegir» apagados, y el sello en la británica
      s.swallow = false;
      s.unsaved = true;
      s.ws!.send(packet('frame', { t: s.lastT, me: { ...s.lastMe!, unsaved: true } }));
      await expect(page.getByTestId('shop-unsaved')).toHaveText(SHOP_UNAVAILABLE);
      await expect(page.getByTestId('select-family-none')).toBeDisabled();
      await expect(page.getByTestId('buy-family-es')).toBeDisabled();
      await expect(page.getByTestId('family-gb').locator('.stamp')).toHaveText('En uso');
      await page.screenshot({ path: path.join(SHOTS, 'd101-bd-caida.png') });
      // En la pestaña Barcos: «Elegir» y «Comprar» apagados, y «Mejoras» abre igual la vista, con «Mejorar» apagado
      await page.getByTestId('tab-ships').click();
      await expect(page.getByTestId('use-sloop')).toBeDisabled();
      await expect(page.getByTestId('buy-ship-brig')).toBeDisabled();
      await page.getByTestId('upgrades-sloop').click();
      await expect(page.getByTestId('upgrades-view')).toHaveAttribute('data-ship', 'sloop');
      await expect(page.getByTestId('buy-cannons-2')).toBeDisabled();
      await page.screenshot({ path: path.join(SHOTS, 'd103-bd-caida.png') });
    } finally {
      await ctx.close();
    }
  });

  for (const size of Object.keys(SIZES) as Size[]) {
    test(`AC-225 (${size}): 3 tarjetas con la Fragata en cada aspecto; «Sin familia» en uso y sin precio; cada familia con 4000 y «Comprar»; la nota; comprar la británica la pone en uso con su aviso (y no «Compra realizada»), y a la española le faltan 2500; elegir envía 1 selectFamily y lo que ya se usa no tiene botón`, async ({ browser }) => {
      test.setTimeout(120_000);
      const touch = size !== 'desktop';
      const { ctx, page, net } = await newPlayer(browser, size, server);
      try {
        const seen = previews(page);
        await openShop(page, touch);
        await waitFor(() => loadedPreviews(page, '[data-testid^="ship-preview-"]'), (ok) => ok, 10_000, 100);
        expect(seen.map((s) => s.path).sort()).toEqual(PLAYER_SHIP_ORDER.map((c) => SHIP_PREVIEWS[c].none).sort()); // la familia aún no se ha pedido
        // AC-217: la Fragata, que navega, es la 4.ª tarjeta: en el móvil y el apaisado la lista baja hasta ella y su «Mejoras»
        const listBox = (await page.getByTestId('shop-body').boundingBox())!;
        expect(inside((await page.getByTestId('ship-frigate').boundingBox())!, listBox)).toBe(true);
        expect(inside((await page.getByTestId('upgrades-frigate').boundingBox())!, listBox)).toBe(true);
        const opened = await page.getByTestId('shop-body').evaluate((e) => e.scrollTop);
        console.log(`AC-217 ${size} con la Fragata: desplazamiento al abrir ${opened}`);
        expect(opened > 0).toBe(size !== 'desktop');
        await page.screenshot({ path: path.join(SHOTS, `d103-lista-fragata-${size}.png`) });
        await press(page, 'tab-family', touch);
        await expect(page.locator('[data-testid="family-none"], [data-testid="family-gb"], [data-testid="family-es"]')).toHaveCount(3);
        await waitFor(() => loadedPreviews(page, '[data-testid^="family-preview-"]'), (ok) => ok, 10_000, 100);
        for (const f of ['none', 'gb', 'es'] as const) await expect(page.getByTestId(`family-preview-${f}`)).toHaveAttribute('src', SHIP_PREVIEWS.frigate[f]);
        expect(seen.length).toBe(7); // + las 2 de las familias de la Fragata; la suya sin familia ya estaba
        // (b, c) «Sin familia»: en uso, el aspecto de siempre y gratis, sin precio
        const none = page.getByTestId('family-none');
        await expect(none).toHaveAttribute('aria-current', 'true');
        await expect(none).toContainText('El aspecto de siempre · gratis');
        await expect(none.locator('.stamp')).toHaveText('En uso');
        await expect(none.locator('.card__price')).toHaveCount(0);
        // (a) cada familia: 4000 y «Comprar», con su nombre accesible
        for (const [f, adj] of [['gb', 'británica'], ['es', 'española']] as const) {
          await expect(page.getByTestId(`family-${f}`).locator('.card__price')).toHaveText('4000');
          await expect(page.getByTestId(`buy-family-${f}`)).toBeEnabled();
          await expect(page.getByTestId(`buy-family-${f}`)).toHaveAttribute('aria-label', `Comprar la familia ${adj} por 4000 de oro`);
          await expect(page.getByTestId(`family-${f}`)).not.toContainText('Te faltan');
        }
        // (d) la nota
        await expect(page.locator('.family__note')).toHaveText('Una familia solo cambia el aspecto: la vida, la velocidad y los cañones son los mismos. Se compra una vez y vale para todos tus barcos, también los que compres después.');
        // Las 3 tarjetas, enteras dentro del panel y sin recortes
        const bodyBox = await page.getByTestId('shop-body').evaluate((e) => ({ left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right }));
        for (const f of ['none', 'gb', 'es']) {
          const b = (await page.getByTestId(`family-${f}`).boundingBox())!;
          expect(b.x >= bodyBox.left - 0.5 && b.x + b.width <= bodyBox.right + 0.5).toBe(true);
        }
        expect(await overflowing(page, '.shop .card--family, .shop .family__name, .shop .family__traits, .shop .card__foot, .shop .family__note')).toEqual([]);
        await page.screenshot({ path: path.join(SHOTS, `d101-familia-${size}.png`) });

        // (f) comprar la británica: queda en uso, con su aviso dentro del Astillero y sin «Compra realizada»
        await page.evaluate(() => {
          const w = window as unknown as { __notices: string[] };
          w.__notices = [];
          new MutationObserver(() => {
            const n = document.querySelector('[data-testid="shop-notice"]');
            if (n?.textContent && w.__notices[w.__notices.length - 1] !== n.textContent) w.__notices.push(n.textContent);
          }).observe(document.body, { subtree: true, childList: true, characterData: true });
        });
        net.reset();
        await press(page, 'buy-family-gb', touch);
        await expect(page.getByTestId('family-gb')).toHaveAttribute('aria-current', 'true');
        await expect(page.getByTestId('shop-notice')).toHaveText('Tus barcos ahora son de la familia británica');
        expect(intents(net)).toEqual([{ name: 'buy', data: { itemId: 'family:gb' } }]);
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => (window as unknown as { __notices: string[] }).__notices)).toEqual(['Tus barcos ahora son de la familia británica']);
        const p = await playerOf(page);
        expect([p.gold, p.families, p.family]).toEqual([1500, ['gb'], 'gb']);
        await expect(page.getByTestId('shop-gold')).toContainText('1500');
        // La española: «Te faltan 2500», el precio y «Comprar» apagado; «Sin familia», «Elegir»
        await expect(page.getByTestId('family-es')).toContainText('Te faltan 2500');
        await expect(page.getByTestId('buy-family-es')).toBeDisabled();
        await expect(page.getByTestId('select-family-none')).toHaveAttribute('aria-label', 'Elegir sin familia');
        await expect(page.getByTestId('select-family-gb')).toHaveCount(0); // la que usa no tiene botón: nunca se envía
        expect(await overflowing(page, '.shop .card--family, .shop .card__foot, .shop .card__why')).toEqual([]);
        await page.screenshot({ path: path.join(SHOTS, `d101-familia-comprada-${size}.png`) });

        // AC-223: volver a «Sin familia» y a la británica, gratis: 1 selectFamily cada vez
        net.reset();
        await press(page, 'select-family-none', touch);
        await expect(page.getByTestId('family-none')).toHaveAttribute('aria-current', 'true');
        await expect(page.getByTestId('shop-notice')).toHaveText('Tus barcos vuelven al aspecto de siempre');
        expect(intents(net)).toEqual([{ name: 'selectFamily', data: { family: 'none' } }]);
        net.reset();
        await press(page, 'select-family-gb', touch);
        await expect(page.getByTestId('family-gb')).toHaveAttribute('aria-current', 'true');
        expect(intents(net)).toEqual([{ name: 'selectFamily', data: { family: 'gb' } }]);
        expect((await playerOf(page)).gold).toBe(1500);
        // Las imágenes de la pestaña Barcos pasan al aspecto nuevo
        await press(page, 'tab-ships', touch);
        await expect(page.getByTestId('ship-preview-frigate')).toHaveAttribute('src', SHIP_PREVIEWS.frigate.gb);
      } finally {
        await ctx.close();
      }
    });
  }
});

// AC-126 (DT-03): "Salir" desde el overlay "Sin conexión" nunca lleva a una página de error del navegador. El cliente
// sondea al servidor durante 2 s: una petición nueva cada ≤ 250 ms aunque las anteriores sigan sin respuesta, ≤ 10 en
// total; ni una conexión rechazada ni una colgada cortan el sondeo. Si responde, navega a la landing; si no, se queda
// en el overlay con el aviso y "Reintentar", sin ninguna petición pendiente.
// El navegador habla con el servidor propio a través de un proxy TCP: cerrarlo rechaza las conexiones y abrirlo
// devuelve el servidor al instante (relanzar el proceso tarda segundos y no permitiría el caso de "vuelve en 1 s").
import { expect, Page, test } from '@playwright/test';
import net from 'net';
import { enterGame } from './helpers';
import { freePort, OwnServer, startOwnServer } from './own-server';

const NO_RESPONSE = 'El servidor no responde. Vuelve a intentarlo en unos segundos';
const PROBE_MS = 2000;
const PROBE_EVERY_MS = 250;
const PROBE_MAX = 10;
const TOLERANCE_MS = 300;

type Mode = 'closed' | 'open' | 'hung';

// Proxy TCP en un puerto libre del rango propio. closed: nada escucha (conexión rechazada); open: reenvía al servidor;
// hung: acepta conexiones y nunca contesta. Cada cambio corta las conexiones abiertas
async function tcpProxy(upstream: number) {
  const port = await freePort();
  const sockets = new Set<net.Socket>();
  let listener: net.Server | null = null;
  let mode: Mode = 'closed';
  const track = (s: net.Socket, peer?: net.Socket) => {
    sockets.add(s);
    s.on('error', () => s.destroy());
    s.on('close', () => {
      sockets.delete(s);
      peer?.destroy();
    });
  };
  const set = async (next: Mode) => {
    sockets.forEach((s) => s.destroy());
    mode = next;
    if (next === 'closed') {
      const l = listener;
      listener = null;
      if (l) await new Promise<void>((resolve) => l.close(() => resolve()));
      return;
    }
    if (listener) return;
    const l = net.createServer((client) => {
      if (mode === 'hung') return track(client);
      const up = net.connect(upstream, '127.0.0.1');
      track(client, up);
      track(up, client);
      client.pipe(up);
      up.pipe(client);
    });
    await new Promise<void>((resolve, reject) => {
      l.once('error', reject);
      l.listen(port, () => resolve());
    });
    listener = l;
  };
  return { url: `http://localhost:${port}`, set };
}

interface Probe { at: number; path: string; failed: string | null; done: boolean }

// Peticiones HTTP del cliente al servidor del juego (sin socket.io, estáticos ni la carga RSC de la navegación), con
// su instante de inicio según el navegador (CDP: wallTime, ms desde 1970, el mismo reloj que Date.now) y si fallaron.
// Las rechazadas no traen timing de Playwright, por eso se leen de CDP
async function probes(page: Page, origin: string): Promise<Probe[]> {
  const list: Probe[] = [];
  const byId = new Map<string, Probe>();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (e) => {
    const url = new URL(e.request.url);
    if (url.origin !== origin || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/_next/') || url.searchParams.has('_rsc') || byId.has(e.requestId)) return;
    const p: Probe = { at: e.wallTime * 1000, path: url.pathname + url.search, failed: null, done: false };
    byId.set(e.requestId, p);
    list.push(p);
  });
  cdp.on('Network.loadingFailed', (e) => {
    const p = byId.get(e.requestId);
    if (!p) return;
    p.failed = e.errorText;
    p.done = true;
  });
  cdp.on('Network.loadingFinished', (e) => {
    const p = byId.get(e.requestId);
    if (p) p.done = true;
  });
  return list;
}

// URLs de cada navegación del marco principal con su instante: una página de error del navegador es chrome-error://
function navigations(page: Page): { at: number; url: string }[] {
  const list: { at: number; url: string }[] = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) list.push({ at: Date.now(), url: f.url() });
  });
  return list;
}

// Instante del clic en "Salir" y de la aparición del aviso, medidos en la página (ms desde 1970). Se guardan aquí al
// momento, para que una navegación (el fallo que se prueba) no se los lleve
async function watchExit(page: Page) {
  const marks: { click?: number; shown?: number } = {};
  await page.exposeFunction('__exitMark', (key: 'click' | 'shown', t: number) => (marks[key] ??= t));
  await page.evaluate((text) => {
    const mark = (window as unknown as { __exitMark: (key: string, t: number) => void }).__exitMark;
    const now = () => performance.timeOrigin + performance.now();
    let shown = false;
    document.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest?.('[data-testid="btn-exit"]')) mark('click', now());
    }, true);
    new MutationObserver(() => {
      if (shown || !document.querySelector('[data-testid="connection-overlay"]')?.textContent?.includes(text)) return;
      shown = true;
      mark('shown', now());
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, NO_RESPONSE);
  return async () => {
    await expect.poll(() => marks.click, { message: 'clic en Salir registrado' }).toBeDefined();
    return marks as { click: number; shown?: number };
  };
}

// Hasta el overlay "failed" (3 reintentos agotados) con el proxy cerrado
async function toFailed(page: Page, proxy: Awaited<ReturnType<typeof tcpProxy>>) {
  await proxy.set('open');
  await enterGame(page, proxy.url);
  await proxy.set('closed');
  await expect(page.getByTestId('connection-overlay')).toHaveAttribute('data-state', 'failed', { timeout: 15_000 });
}

// Sondeo tras el clic: número, separación máxima entre inicios (contando desde el clic) y último inicio
function cadence(list: Probe[], click: number, until: number) {
  const after = list.filter((p) => p.at >= click - 5 && p.at <= until);
  const starts = [click, ...after.map((p) => p.at)];
  const gaps = starts.slice(1).map((t, i) => t - starts[i]);
  return {
    count: after.length,
    refused: after.filter((p) => p.failed).length,
    pending: after.filter((p) => !p.done).length,
    maxGap: gaps.length ? Math.max(...gaps) : Infinity,
    last: after.length ? after[after.length - 1].at - click : -1,
    text: `${after.length} peticiones (${after.filter((p) => p.failed).length} fallidas) a ${JSON.stringify([...new Set(after.map((p) => p.path))])} a los ${JSON.stringify(after.map((p) => Math.round(p.at - click)))} ms`
  };
}

let server: OwnServer;
test.beforeEach(async () => {
  server = await startOwnServer({ SEA_BATTLE_NPCS: '0' });
});
test.afterEach(async () => {
  await server?.kill();
});

test.describe('Salir sin servidor', () => {
  test('AC-126 (a): con el servidor parado todo el tiempo, "Salir" sondea 2 s, muestra el aviso a los 2,0 ± 0,3 s, no navega y "Reintentar" sigue funcionando', async ({ page }) => {
    test.setTimeout(90_000);
    const proxy = await tcpProxy(server.port);
    try {
      await toFailed(page, proxy);
      const sent = await probes(page, new URL(proxy.url).origin);
      const urls = navigations(page);
      const exit = await watchExit(page);
      await page.getByTestId('btn-exit').click();
      await page.waitForTimeout(PROBE_MS + 1000);
      const { click, shown } = await exit();
      const after = urls.filter((u) => u.at >= click);
      const c = cadence(sent, click, click + PROBE_MS + TOLERANCE_MS);
      console.log(`AC-126 (a, parado): aviso a los ${shown === undefined ? 'nunca' : `${Math.round(shown - click)} ms`} · ${c.text} · separación máx. ${Math.round(c.maxGap)} ms · navegaciones ${JSON.stringify(after.map((u) => u.url))} · URL ${page.url()}`);
      expect(after.map((u) => u.url), 'sin navegar').toEqual([]);
      expect(new URL(page.url()).pathname).toBe('/game');
      expect(shown, 'aparece el aviso').toBeDefined();
      expect(Math.abs(shown! - click - PROBE_MS), 'el aviso, a los 2,0 ± 0,3 s del clic').toBeLessThanOrEqual(TOLERANCE_MS);
      await expect(page.getByTestId('btn-retry')).toBeVisible();
      // El sondeo: sigue tras cada conexión rechazada, dura los 2 s, una petición cada ≤ 250 ms y ≤ 10 en total
      expect.soft(c.refused, 'todas rechazadas, y el sondeo sigue').toBe(c.count);
      expect.soft(c.count, 'más de una petición').toBeGreaterThanOrEqual(2);
      expect.soft(c.count, '≤ 10 peticiones').toBeLessThanOrEqual(PROBE_MAX);
      expect.soft(c.maxGap, 'una petición cada ≤ 250 ms').toBeLessThanOrEqual(PROBE_EVERY_MS);
      expect.soft(c.last, 'sondea hasta el final de los 2 s').toBeGreaterThanOrEqual(PROBE_MS - TOLERANCE_MS);
      // "Reintentar" con el servidor de vuelta reconecta sin recargar
      await proxy.set('open');
      await page.getByTestId('btn-retry').click();
      await expect(page.getByTestId('connection-overlay')).toHaveCount(0, { timeout: 15_000 });
      await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 15_000 });
    } finally {
      await proxy.set('closed');
    }
  });

  test('AC-126 (b): con el servidor de vuelta 1 s después del clic, "Salir" navega a la landing en ≤ 2,5 s sin página de error', async ({ page }) => {
    test.setTimeout(90_000);
    const proxy = await tcpProxy(server.port);
    try {
      await toFailed(page, proxy);
      const sent = await probes(page, new URL(proxy.url).origin);
      const urls = navigations(page);
      const exit = await watchExit(page);
      await page.getByTestId('btn-exit').click();
      const { click } = await exit();
      // El servidor vuelve a contestar 1 s después del clic (en el reloj de la página)
      await page.waitForTimeout(Math.max(0, click + 1000 - Date.now()));
      await proxy.set('open');
      const back = Date.now() - click;
      // La landing del juego (chrome-error://chromewebdata/ también tiene la ruta "/")
      const isLanding = (url: string) => new URL(url).origin === new URL(proxy.url).origin && new URL(url).pathname === '/';
      await page.waitForURL((u) => isLanding(u.href), { timeout: 5000 }).catch(() => {});
      const landing = urls.find((u) => u.at >= click && isLanding(u.url));
      const c = cadence(sent, click, click + PROBE_MS + TOLERANCE_MS);
      console.log(`AC-126 (b, vuelve a los ${back} ms): landing ${landing ? `a los ${landing.at - click} ms` : 'nunca'} · ${c.text} · navegaciones ${JSON.stringify(urls.filter((u) => u.at >= click).map((u) => u.url))}`);
      expect(urls.filter((u) => u.url.startsWith('chrome-error://')), 'sin página de error').toEqual([]);
      expect(landing, 'navega a la landing').toBeDefined();
      expect(landing!.at - click, 'en ≤ 2,5 s').toBeLessThanOrEqual(2500);
      await expect(page.getByTestId('cta-guest')).toBeVisible();
      // Llegó porque siguió sondeando tras las conexiones rechazadas del primer segundo
      expect.soft(sent.filter((p) => p.at >= click - 5 && p.at < click + back && p.failed).length, 'peticiones rechazadas antes de volver').toBeGreaterThanOrEqual(1);
      expect.soft(c.count, '≤ 10 peticiones').toBeLessThanOrEqual(PROBE_MAX);
    } finally {
      await proxy.set('closed');
    }
  });

  test('AC-126 (c): con el servidor colgado (acepta y no contesta), "Salir" sigue lanzando peticiones cada ≤ 250 ms, muestra el aviso a los 2,0 ± 0,3 s y no deja ninguna pendiente', async ({ page }) => {
    test.setTimeout(90_000);
    const proxy = await tcpProxy(server.port);
    try {
      await toFailed(page, proxy);
      await proxy.set('hung');
      const sent = await probes(page, new URL(proxy.url).origin);
      const urls = navigations(page);
      const exit = await watchExit(page);
      await page.getByTestId('btn-exit').click();
      await page.waitForTimeout(PROBE_MS + 1000);
      const { click, shown } = await exit();
      const after = urls.filter((u) => u.at >= click);
      const c = cadence(sent, click, click + PROBE_MS + TOLERANCE_MS);
      console.log(`AC-126 (c, colgado): aviso a los ${shown === undefined ? 'nunca' : `${Math.round(shown - click)} ms`} · ${c.text} · separación máx. ${Math.round(c.maxGap)} ms · pendientes ${c.pending} · navegaciones ${JSON.stringify(after.map((u) => u.url))} · URL ${page.url()}`);
      expect(after.map((u) => u.url), 'sin navegar').toEqual([]);
      expect(new URL(page.url()).pathname).toBe('/game');
      expect(shown, 'aparece el aviso').toBeDefined();
      expect(Math.abs(shown! - click - PROBE_MS), 'el aviso, a los 2,0 ± 0,3 s del clic').toBeLessThanOrEqual(TOLERANCE_MS);
      await expect(page.getByTestId('btn-retry')).toBeVisible();
      // Una petición colgada no detiene el sondeo: salen ≥ 9 aunque ninguna conteste, y al terminar se abortan todas
      expect(c.count, '≥ 9 peticiones aunque ninguna conteste').toBeGreaterThanOrEqual(9);
      expect(c.count, '≤ 10 peticiones').toBeLessThanOrEqual(PROBE_MAX);
      expect(c.maxGap, 'una petición cada ≤ 250 ms entre inicios').toBeLessThanOrEqual(PROBE_EVERY_MS);
      expect(c.pending, 'ninguna petición pendiente al terminar').toBe(0);
    } finally {
      await proxy.set('closed');
    }
  });

  test('AC-126 (d): con el servidor colgado que vuelve a contestar a los 800 ms, "Salir" navega a la landing en ≤ 1,5 s sin página de error', async ({ page }) => {
    test.setTimeout(90_000);
    const proxy = await tcpProxy(server.port);
    try {
      await toFailed(page, proxy);
      await proxy.set('hung');
      const sent = await probes(page, new URL(proxy.url).origin);
      const urls = navigations(page);
      const exit = await watchExit(page);
      await page.getByTestId('btn-exit').click();
      const { click } = await exit();
      await page.waitForTimeout(Math.max(0, click + 800 - Date.now()));
      await proxy.set('open');
      const back = Date.now() - click;
      const isLanding = (url: string) => new URL(url).origin === new URL(proxy.url).origin && new URL(url).pathname === '/';
      await page.waitForURL((u) => isLanding(u.href), { timeout: 5000 }).catch(() => {});
      const landing = urls.find((u) => u.at >= click && isLanding(u.url));
      const c = cadence(sent, click, click + PROBE_MS + TOLERANCE_MS);
      console.log(`AC-126 (d, colgado que vuelve a los ${back} ms): landing ${landing ? `a los ${landing.at - click} ms` : 'nunca'} · ${c.text} · navegaciones ${JSON.stringify(urls.filter((u) => u.at >= click).map((u) => u.url))}`);
      expect(urls.filter((u) => u.url.startsWith('chrome-error://')), 'sin página de error').toEqual([]);
      expect(landing, 'navega a la landing').toBeDefined();
      expect(landing!.at - click, 'en ≤ 1,5 s').toBeLessThanOrEqual(1500);
      await expect(page.getByTestId('cta-guest')).toBeVisible();
      expect.soft(c.count, '≤ 10 peticiones').toBeLessThanOrEqual(PROBE_MAX);
    } finally {
      await proxy.set('closed');
    }
  });
});

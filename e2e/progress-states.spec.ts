// AD-34 en el cliente (D50; AC-131, AC-132 y AC-133): overlays de progreso y aviso persistente de guardado. El servidor de
// e2e no tiene BD: el WebSocket del juego pasa por page.routeWebSocket y el test hace de BD caída. Se traga el join y
// responde progressError (AC-131: al momento, o a los 3 s, como el servidor con la BD colgada), o añade `unsaved` a la
// vista privada del jugador (AC-132). AC-133 usa el camino real: otra pestaña con el mismo invitado.
// Lo que depende de la BD y de la cuenta (que un invitado nunca reciba unsaved, que el registro quede intacto) lo cubren
// los Jest+socket del servidor y el e2e con los ganchos de la BD.
import { expect, Page, test, WebSocketRoute } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PORTS } from '../playwright.config';
import { enterGame } from './helpers';

const SHIPYARD = `http://localhost:${PORTS.empty}`; // sin NPC y con 2 000 de oro: hay compras habilitadas
const SHOP_UNAVAILABLE = 'La tienda no está disponible: no podemos guardar';
const WARNING = 'Progreso sin guardar, reintentando…';
const HUNG_MS = 3000; // AC-131: el servidor contesta a los 3 s si la BD no responde
const OUT = process.env.D50_OUT; // carpeta para las capturas de revisión visual (opcional)

async function capture(page: Page, name: string) {
  if (!OUT) return;
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

type LoadMode = 'up' | 'down' | 'hung';

// Socket.IO sobre WebSocket: cada evento viaja como texto `42["evento",datos]`
const packet = (event: string, data: unknown) => `42${JSON.stringify([event, data])}`;
const parse = (m: string | Buffer): [string, Record<string, unknown>] | null => {
  if (typeof m !== 'string' || !m.startsWith('42[')) return null;
  return JSON.parse(m.slice(2)) as [string, Record<string, unknown>];
};

async function wire(page: Page) {
  const s = { load: 'up' as LoadMode, unsaved: undefined as boolean | undefined, joins: 0, sockets: 0, lastT: 0, lastMe: null as Record<string, unknown> | null, page: null as WebSocketRoute | null };
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer();
    s.sockets++;
    s.page = ws;
    ws.onMessage((m) => {
      if (parse(m)?.[0] === 'join') {
        s.joins++;
        if (s.load === 'down') return ws.send(packet('progressError', { reason: 'load' }));
        if (s.load === 'hung') return void setTimeout(() => ws.send(packet('progressError', { reason: 'load' })), HUNG_MS);
      }
      server.send(m);
    });
    server.onMessage((m) => {
      const p = parse(m);
      if (p?.[0] === 'frame') {
        const f = p[1];
        s.lastT = f.t as number;
        if (f.me) {
          s.lastMe = f.me as Record<string, unknown>;
          if (s.unsaved !== undefined) return ws.send(packet('frame', { ...f, me: { ...s.lastMe, unsaved: s.unsaved } }));
        }
      }
      ws.send(m);
    });
  });
  const frame = (extra: Record<string, unknown>) => s.page!.send(packet('frame', { t: s.lastT, ...extra }));
  return {
    s,
    // El servidor marca (o desmarca) la vista privada: llega un frame con me.unsaved
    setUnsaved: (unsaved: boolean) => {
      s.unsaved = unsaved;
      frame({ me: { ...s.lastMe!, unsaved } });
    },
    notices: (texts: string[]) => frame({ n: texts.map((text) => ({ kind: 'info', text })) }),
    dropSocket: () => s.page!.close()
  };
}

// Reloj de la página: instante en que cambia cada condición observada (mismo callback = mismo commit de React)
async function watch(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __PS__: { t: number; k: string; v: string | null }[] };
    w.__PS__ = [];
    const last: Record<string, string | null> = {};
    const probe = () => {
      const overlay = document.querySelector('[data-testid="connection-overlay"]');
      const port = document.querySelector('[data-testid="btn-port"], [data-testid="m-port"]');
      const values: Record<string, string | null> = {
        state: overlay?.getAttribute('data-state') ?? null,
        overlayText: overlay?.textContent ?? null,
        warning: document.querySelector('[data-testid="save-warning"]') ? 'on' : null,
        port: port ? port.getAttribute('aria-disabled') : null
      };
      const t = performance.now();
      for (const [k, v] of Object.entries(values)) {
        if (last[k] === v) continue;
        last[k] = v;
        w.__PS__.push({ t, k, v });
      }
    };
    new MutationObserver(probe).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __PS__: { t: number; k: string; v: string | null }[] }).__PS__.slice());
}

// ΔE76 de un píxel de la captura frente a un color sRGB
async function deltaE(page: Page, x: number, y: number, hex: string): Promise<number> {
  const png = (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString('base64');
  return page.evaluate(async ([data, ref]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
    c.drawImage(img, 0, 0);
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
    const lab = (rgb: number[]) => {
      const lin = rgb.map((v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const xyz = [
        (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047,
        0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2],
        (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883
      ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
      return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
    };
    const n = parseInt(ref.slice(1), 16);
    const a = lab([r, g, b]);
    const e = lab([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    return Math.hypot(a[0] - e[0], a[1] - e[1], a[2] - e[2]);
  }, [png, hex] as const);
}

// Textos sin recortar, tarjeta dentro del viewport con ≥ 16 px de margen y lo que hay detrás del overlay
async function overlayLayout(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => (el as HTMLElement).checkVisibility({ checkOpacity: true, visibilityProperty: true, checkVisibilityCSS: true } as CheckVisibilityOptions);
    const card = document.querySelector('[data-testid="connection-overlay"] .offline')!;
    const r = card.getBoundingClientRect();
    const clipped = Array.from(card.querySelectorAll('h2, p, button')).filter((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight).map((el) => el.textContent);
    return {
      margin: Math.min(r.left, r.top, innerWidth - r.right, innerHeight - r.bottom),
      clipped,
      buttons: Array.from(card.querySelectorAll('button')).map((b) => ({ id: b.getAttribute('data-testid'), h: b.getBoundingClientRect().height })),
      coarse: matchMedia('(pointer: coarse)').matches,
      hudBlocks: Array.from(document.querySelectorAll('[data-hud-block]')).filter(visible).length,
      canvases: Array.from(document.querySelectorAll('canvas')).filter(visible).length
    };
  });
}

async function expectLoadFailedScreen(page: Page, label: string) {
  const overlay = page.getByTestId('connection-overlay');
  await expect(overlay).toHaveAttribute('data-state', 'load-failed');
  await expect(overlay.locator('h2')).toHaveText('Progreso no disponible');
  await expect(overlay.locator('.offline__body')).toHaveText('No podemos cargar tu progreso ahora mismo');
  await expect(page.getByTestId('btn-retry')).toHaveText('Reintentar');
  await expect(page.getByTestId('btn-exit')).toHaveText('Salir');
  await expect(page.getByTestId('btn-retry')).toBeFocused();
  const layout = await overlayLayout(page);
  const vh = page.viewportSize()!.height;
  const top = await deltaE(page, 8, 8, '#0F3F5C');
  const bottom = await deltaE(page, 8, vh - 8, '#1A5F86');
  console.log(`AD-34 a (${label}): margen ${layout.margin.toFixed(0)} px · recortados ${JSON.stringify(layout.clipped)} · botones ${JSON.stringify(layout.buttons)} (pointer: coarse ${layout.coarse}) · bloques del HUD visibles ${layout.hudBlocks} · lienzos visibles ${layout.canvases} · ΔE76 fondo ${top.toFixed(2)} / ${bottom.toFixed(2)}`);
  expect(layout.margin).toBeGreaterThanOrEqual(16);
  expect(layout.clipped).toEqual([]);
  expect(layout.hudBlocks).toBe(0);
  expect(layout.canvases).toBe(0);
  expect(top).toBeLessThanOrEqual(3);
  expect(bottom).toBeLessThanOrEqual(3);
  return layout;
}

async function loadFailedFlow(page: Page, label: string) {
  const net = await wire(page);
  net.s.load = 'down';
  await page.goto('/game');
  const layout = await expectLoadFailedScreen(page, label);
  await expect(page.getByTestId('offline-detail')).toHaveText('Lo que tenías guardado sigue intacto.');
  await capture(page, `ac131-${label}`);

  // BD colgada: 3 clics separados 120 ms lanzan 1 intento, con «Reintentando…» y aria-busy mientras espera
  net.s.load = 'hung';
  const before = { joins: net.s.joins, sockets: net.s.sockets };
  const retry = page.getByTestId('btn-retry');
  for (let i = 0; i < 3; i++) {
    await retry.click();
    if (i === 0) {
      await expect(retry).toHaveText('Reintentando…');
      await expect(retry).toHaveAttribute('aria-busy', 'true');
    }
    await page.waitForTimeout(120);
  }
  await expect(retry).toHaveText('Reintentar', { timeout: HUNG_MS + 3000 });
  console.log(`AD-34 a (${label}): 3 clics → ${net.s.sockets - before.sockets} conexión(es) y ${net.s.joins - before.joins} join(s)`);
  expect(net.s.sockets - before.sockets).toBe(1);
  expect(net.s.joins - before.joins).toBe(1);
  // Sigue caída: overlay con el detalle del reintento fallido y el botón activo
  await expect(page.getByTestId('connection-overlay')).toHaveAttribute('data-state', 'load-failed');
  await expect(page.getByTestId('offline-detail')).toHaveText('Sigue sin responder. Prueba de nuevo en unos segundos.');
  await expect(retry).toHaveAttribute('aria-busy', 'false');
  await expect(retry).toBeFocused();
  await capture(page, `ac131-reintento-fallido-${label}`);

  // La BD vuelve: «Reintentar» entra al mundo
  net.s.load = 'up';
  await retry.click();
  await expect(page.getByTestId('connection-overlay')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true && !!window.__SEA_BATTLE__.me(), null, { timeout: 15_000 });
  return { net, layout };
}

test.describe('AD-34 a · AC-131: progreso no disponible', () => {
  test('sin progreso no se entra: overlay sobre el fondo de «Conectando», 3 clics → 1 intento y, con la BD de vuelta, entra; tras un deploy el mundo viejo se oculta', async ({ page }) => {
    test.setTimeout(90_000);
    const { net } = await loadFailedFlow(page, '1440×900');

    // Reconexión tras un deploy con la BD caída: el mundo de la sesión anterior no se ve detrás
    net.s.load = 'down';
    net.dropSocket();
    await expectLoadFailedScreen(page, '1440×900, tras reconectar');
    await page.keyboard.press('KeyP'); // las teclas del juego no hacen nada: el barco sigue en la zona segura y no abre la tienda
    await expect(page.getByTestId('shop')).toHaveCount(0);
  });

  test('en 390×844 el overlay cabe, no recorta y sus botones miden ≥ 48 px @mobile', async ({ page }) => {
    test.setTimeout(90_000);
    const { layout } = await loadFailedFlow(page, '390×844');
    for (const b of layout.buttons) expect(b.h, `alto de ${b.id}`).toBeGreaterThanOrEqual(48);
  });
});

async function warningBox(page: Page) {
  return page.evaluate(() => {
    const column = document.querySelector('[data-testid="toasts"]')!;
    const first = column.firstElementChild as HTMLElement;
    const r = first.getBoundingClientRect();
    return { first: first.getAttribute('data-testid'), block: first.hasAttribute('data-hud-block'), text: first.textContent?.trim(), x: r.x, y: r.y, w: r.width, h: r.height, children: column.children.length, clipped: first.scrollWidth > first.clientWidth };
  });
}

const port = (page: Page, mobile: boolean) => page.getByTestId(mobile ? 'm-port' : 'btn-port');

async function warningFlow(page: Page, mobile: boolean, y: number, label: string) {
  const trace = await watch(page);
  const net = await wire(page);
  await enterGame(page, SHIPYARD);
  await expect(page.getByTestId('safe-zone')).toBeVisible();
  const portBtn = port(page, mobile);
  await expect(portBtn).not.toHaveAttribute('aria-disabled', 'true');

  // Tienda abierta antes del corte: no se cierra; franja y 0 botones de compra o uso habilitados
  await portBtn.click();
  await expect(page.getByTestId('shop')).toBeVisible();
  const buyButtons = page.locator('[data-testid="shop"] button[data-testid^="buy-"], [data-testid="shop"] button[data-testid^="use-"]');
  const enabled = () => buyButtons.evaluateAll((bs) => bs.filter((b) => !(b as HTMLButtonElement).disabled).length);
  const enabledBefore = await enabled();
  const t0 = Date.now();
  net.setUnsaved(true);
  await expect(page.getByTestId('save-warning')).toBeAttached();
  const shownIn = Date.now() - t0;
  await expect(page.getByTestId('shop')).toBeVisible();
  await expect(page.getByTestId('shop-unsaved')).toHaveText(SHOP_UNAVAILABLE);
  const enabledDuring = await enabled();
  await capture(page, `ac132-tienda-${label}`);
  console.log(`AD-34 b (${label}): aviso en ${shownIn} ms · compras habilitadas ${enabledBefore} → ${enabledDuring} con la tienda abierta`);
  expect(shownIn).toBeLessThanOrEqual(1000);
  expect(enabledBefore).toBeGreaterThan(0);
  expect(enabledDuring).toBe(0);
  await page.getByTestId('shop').locator('.shop__close').click();
  await expect(page.getByTestId('shop')).toHaveCount(0);

  // Puerto deshabilitado; pulsarlo (o P) no abre la tienda y saca el toast de peligro
  await expect(portBtn).toHaveAttribute('aria-disabled', 'true');
  await expect(portBtn).toHaveAttribute('title', SHOP_UNAVAILABLE);
  await portBtn.click({ force: true }); // aria-disabled (DT-02): se ve desactivado, pero el clic llega al manejador
  if (!mobile) await page.keyboard.press('KeyP');
  await expect(page.getByTestId('shop')).toHaveCount(0);
  await expect(page.locator('[data-testid="toasts"] .toast--danger', { hasText: SHOP_UNAVAILABLE })).toBeVisible();

  // Con 3 toasts a la vez sigue el primero de la columna, en su sitio y en una línea
  net.notices(['Aviso de prueba 1', 'Aviso de prueba 2', 'Aviso de prueba 3']);
  await expect(page.locator('[data-testid="toasts"] > .toast:not(.feed-as-toast):not([data-testid])')).toHaveCount(3);
  const box = await warningBox(page);
  console.log(`AD-34 b (${label}): ${JSON.stringify(box)}`);
  expect(box.first).toBe('save-warning');
  expect(box.block).toBe(true);
  expect(box.text).toBe(WARNING);
  expect(box.y).toBeCloseTo(y, 0);
  expect(box.h).toBeCloseTo(36, 0);
  expect(box.clipped).toBe(false);
  await expect(page.getByTestId('save-warning')).toBeVisible();
  await capture(page, `ac132-aviso-${label}`);

  // La BD vuelve tras un corte largo (> 3 s): se quita al llegar la confirmación y Puerto vuelve en el mismo commit
  await page.waitForTimeout(3500);
  const restoreAt = await page.evaluate(() => performance.now());
  net.setUnsaved(false);
  await expect(page.getByTestId('save-warning')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('[data-testid="toasts"] .toast--ok', { hasText: 'Progreso guardado' })).toBeVisible();
  let events = await trace();
  const goneAt = events.find((e) => e.k === 'warning' && e.v === null && e.t > restoreAt)!.t;
  const portBackAt = events.find((e) => e.k === 'port' && e.v === 'false' && e.t > restoreAt)!.t;
  console.log(`AD-34 b (${label}): corte largo → aviso fuera a ${(goneAt - restoreAt).toFixed(0)} ms de la confirmación · Puerto a ${(portBackAt - goneAt).toFixed(0)} ms del aviso`);
  expect(goneAt - restoreAt).toBeLessThanOrEqual(5000);
  expect(portBackAt).toBe(goneAt);

  // Corte de un instante: se queda ≥ 3 s desde que apareció, no parpadea
  await page.waitForTimeout(4000); // que caduquen los toasts anteriores
  net.setUnsaved(true);
  await expect(page.getByTestId('save-warning')).toBeAttached();
  await page.waitForTimeout(500);
  const shortRestore = await page.evaluate(() => performance.now());
  net.setUnsaved(false);
  await expect(page.getByTestId('save-warning')).toHaveCount(0, { timeout: 5000 });
  events = await trace();
  const shortOn = events.filter((e) => e.k === 'warning' && e.v === 'on').at(-1)!.t;
  const shortOff = events.find((e) => e.k === 'warning' && e.v === null && e.t > shortOn)!.t;
  console.log(`AD-34 b (${label}): corte corto → visible ${(shortOff - shortOn).toFixed(0)} ms (confirmación a los ${(shortRestore - shortOn).toFixed(0)} ms)`);
  expect(shortOff - shortOn).toBeGreaterThanOrEqual(3000);
  expect(shortOff - shortRestore).toBeLessThanOrEqual(5000);
}

test.describe('AD-34 b · AC-132: aviso persistente con la BD caída', () => {
  test('1440×900: primero de la columna en y = 96, Puerto y tienda bloqueados, 3 toasts a la vez y salida con «Progreso guardado»', async ({ page }) => {
    test.setTimeout(90_000);
    await warningFlow(page, false, 96, '1440×900');
  });

  test('390×844: primero de la columna en y = 156 y Puerto táctil bloqueado @mobile', async ({ page }) => {
    test.setTimeout(90_000);
    await warningFlow(page, true, 156, '390×844');
  });

  test('844×390: primero de la columna en y = 12 @mobile', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 844, height: 390 });
    await warningFlow(page, true, 12, '844×390');
  });
});

async function kickedFlow(page: Page, label: string) {
  const trace = await watch(page);
  await enterGame(page);
  // La pestaña nueva del mismo invitado (mismo localStorage) toma el control
  const other = await page.context().newPage();
  try {
    await enterGame(other);
    const overlay = page.getByTestId('connection-overlay');
    await expect(overlay).toHaveAttribute('data-state', 'kicked');
    await expect(overlay.locator('h2')).toHaveText('Sesión en otra pestaña');
    await expect(overlay.locator('.offline__body')).toHaveText('Has abierto el juego en otra pestaña');
    await expect(page.getByTestId('offline-detail')).toHaveText('Tu barco sigue en la otra: solo hay uno por cuenta.');
    await expect(page.getByTestId('btn-exit')).toBeFocused();
    await expect(page.getByTestId('btn-retry')).toHaveCount(0);
    await capture(page, `ac133-${label}`);
    await page.waitForTimeout(8000); // más que los reintentos de AC-99 (1 + 2 + 4 s)
    const texts = (await trace()).filter((e) => e.k === 'overlayText' && e.v).map((e) => e.v!);
    const states = (await trace()).filter((e) => e.k === 'state').map((e) => e.v);
    console.log(`AD-34 c (${label}): estados ${JSON.stringify(states)} · textos ${JSON.stringify([...new Set(texts)])}`);
    expect(states.filter((s) => s !== null)).toEqual(['kicked']);
    for (const t of texts) {
      expect(t).not.toContain('Reintentar');
      expect(t).not.toMatch(/Reintentando \(\d\/3\)/);
    }
    const layout = await overlayLayout(page);
    expect(layout.clipped).toEqual([]);
    expect(layout.margin).toBeGreaterThanOrEqual(16);
    return layout;
  } finally {
    await other.close();
  }
}

test.describe('AD-34 c · AC-133: sesión en otra pestaña', () => {
  test('1440×900: la pestaña vieja queda en «Sesión en otra pestaña» con solo «Salir», sin reintentos', async ({ page }) => {
    test.setTimeout(90_000);
    await kickedFlow(page, '1440×900');
  });

  test('390×844: igual, con «Salir» de ≥ 48 px @mobile', async ({ page }) => {
    test.setTimeout(90_000);
    const layout = await kickedFlow(page, '390×844');
    for (const b of layout.buttons) expect(b.h, `alto de ${b.id}`).toBeGreaterThanOrEqual(48);
  });
});

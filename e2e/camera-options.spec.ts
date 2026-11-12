// Opciones de cámara y teclas (E18, GDD §5): AC-205 el panel, AC-206 cámara «Centrada» (la de por defecto), AC-207 cambiar
// de modo y guardarlo en el navegador, AC-208 y AC-209 las teclas. La lógica la cubren
// src/client/__tests__/free-view.test.ts, key-bindings.test.ts, options.test.ts y options-store.test.ts; aquí, la sesión
// real: el pivote del barco frame a frame (como AC-23) y los frames WebSocket
import { expect, Page, test } from '@playwright/test';
import { DEFAULT_BINDINGS } from '../src/client/key-bindings';
import { OPTIONS_KEY, parseOptions } from '../src/client/options';
import { MAP_HALF_SIZE } from '../src/game/constants';
import { C2S } from '../src/game/protocol';
import { enterGame, hud, me, presetOptions, trackSocket, waitFor } from './helpers';
import { intents } from './net';

type Point = { x: number; z: number };
const sentOf = (net: ReturnType<typeof trackSocket>, name: string) => intents(net).filter((i) => i.name === name);
const view = (page: Page) =>
  page.evaluate(() => {
    const rt = window.__SEA_BATTLE__!.runtime();
    return { mode: rt.freeView.mode, centered: rt.freeView.centered, x: rt.focusX, z: rt.focusZ, ppm: rt.ppm, w: rt.viewW, h: rt.viewH };
  });

// Cada frame, desde ahora hasta stopWatch: si el barco propio está en el 10 % central (AC-23) y el modo de la vista
async function startWatch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = { on: true, frames: [] as { inside: boolean; mode: string }[] };
    (window as unknown as { __e18Watch: typeof w }).__e18Watch = w;
    const tick = () => {
      if (!w.on) return;
      const dbg = window.__SEA_BATTLE__!;
      const s = dbg.me() as { x: number; z: number } | null;
      const p = s && dbg.runtime().project(s.x, s.z);
      const inside = !!p && Math.abs(p.sx - innerWidth / 2) <= 0.05 * innerWidth && Math.abs(p.sy - innerHeight / 2) <= 0.05 * innerHeight;
      w.frames.push({ inside, mode: dbg.runtime().freeView.mode });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const stopWatch = (page: Page) =>
  page.evaluate(() => {
    const w = (window as unknown as { __e18Watch: { on: boolean; frames: { inside: boolean; mode: string }[] } }).__e18Watch;
    w.on = false;
    return { frames: w.frames.length, outside: w.frames.filter((f) => !f.inside).length, notFollow: w.frames.filter((f) => f.mode !== 'follow').length };
  });

// El punto del mundo bajo un punto de la pantalla, con la cámara de este frame
const worldAt = (page: Page, x: number, y: number) =>
  page.evaluate(([sx, sy]) => window.__SEA_BATTLE__!.runtime().screenToWorld(sx, sy), [x, y] as const);

async function minimapPoint(page: Page, p: Point) {
  const box = (await page.getByTestId('minimap').locator('canvas').boundingBox())!;
  return { x: box.x + ((p.x + MAP_HALF_SIZE) / (2 * MAP_HALF_SIZE)) * box.width, y: box.y + ((p.z + MAP_HALF_SIZE) / (2 * MAP_HALF_SIZE)) * box.height };
}

async function expectNoFreeViewUi(page: Page) {
  await expect(page.getByTestId('recenter')).toHaveCount(0); // AC-121: sin Centrar
  await expect(page.locator('[data-edge-chip][data-chip="self"]:not([hidden])')).toHaveCount(0); // ni chip propio
}

test.describe('Cámara «Centrada» (E18, AC-206)', () => {
  test('AC-206 en 1440×900, sin preferencia guardada: arrastrar navega al soltar, las teclas de la vista y el minimapa no mueven la cámara, 0 viewAt', async ({ page }) => {
    const net = trackSocket(page); // antes de entrar: el WebSocket se abre al conectar
    await enterGame(page);
    expect((await view(page)).centered).toBe(true);
    await startWatch(page);
    const v0 = await view(page);

    // (a) arrastrar 200 px en el agua: al soltar, 1 moveTo hacia el punto donde suelta
    const p = { x: v0.w / 2 + 220, y: v0.h / 2 + 60 };
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x - 200, p.y, { steps: 20 });
    const aimed = (await worldAt(page, p.x - 200, p.y))!;
    await page.mouse.up();
    await waitFor(async () => sentOf(net, C2S.moveTo).length, (n) => n >= 1, 3000, 50);
    await page.waitForTimeout(300);
    const moves = sentOf(net, C2S.moveTo);
    const dest = moves[0]?.data as Point;
    console.log(`AC-206 a: ${moves.length} moveTo a ${dest?.x.toFixed(1)}, ${dest?.z.toFixed(1)} (bajo el puntero al soltar ${aimed.x.toFixed(1)}, ${aimed.z.toFixed(1)})`);
    expect(moves).toHaveLength(1);
    expect(Math.hypot(dest.x - aimed.x, dest.z - aimed.z)).toBeLessThanOrEqual(3); // lo que avanza el barco entre la lectura y el clic

    // (b) mantener 2 s la tecla «arriba» de la vista: la cámara sigue al barco
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowUp');

    // (c) clic y arrastre en el minimapa: 0 moveTo y la cámara no se mueve
    const m1 = await minimapPoint(page, { x: 300, z: -300 });
    await page.mouse.click(m1.x, m1.y);
    const m2 = await minimapPoint(page, { x: -300, z: 300 });
    await page.mouse.move(m1.x, m1.y);
    await page.mouse.down();
    await page.mouse.move(m2.x, m2.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const watch = await stopWatch(page);
    console.log(`AC-206: ${watch.frames} frames · ${watch.outside} con el barco fuera del 10 % central · ${watch.notFollow} sin seguimiento`);
    expect(watch.frames).toBeGreaterThan(30);
    expect({ outside: watch.outside, notFollow: watch.notFollow }).toEqual({ outside: 0, notFollow: 0 });
    expect(sentOf(net, C2S.moveTo)).toHaveLength(1);
    expect(sentOf(net, C2S.viewAt)).toHaveLength(0);
    await expectNoFreeViewUi(page);
  });

  test('AC-206 @mobile en 390×844 con toques reales: un dedo que arrastra navega al soltar, dos dedos solo hacen zoom, el minimapa no mueve, 0 viewAt', async ({ page }) => {
    const net = trackSocket(page);
    await enterGame(page);
    expect((await view(page)).centered).toBe(true);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    await startWatch(page);
    const v0 = await view(page);

    // (a) un dedo, 200 px
    const [x, y] = [v0.w / 2 + 100, v0.h / 2 + 120];
    await touch('touchStart', [[x, y]]);
    for (let i = 1; i <= 20; i++) await touch('touchMove', [[x - i * 10, y]]);
    const aimed = (await worldAt(page, x - 200, y))!;
    await touch('touchEnd', []);
    await waitFor(async () => sentOf(net, C2S.moveTo).length, (n) => n >= 1, 3000, 50);
    await page.waitForTimeout(300);
    const moves = sentOf(net, C2S.moveTo);
    const dest = moves[0]?.data as Point;
    console.log(`AC-206 a móvil: ${moves.length} moveTo a ${dest?.x.toFixed(1)}, ${dest?.z.toFixed(1)} (bajo el dedo al soltar ${aimed.x.toFixed(1)}, ${aimed.z.toFixed(1)})`);
    expect(moves).toHaveLength(1);
    expect(Math.hypot(dest.x - aimed.x, dest.z - aimed.z)).toBeLessThanOrEqual(3);

    // Dos dedos: zoom (AC-116), sin moveTo
    const zoom0 = (await view(page)).ppm;
    await touch('touchStart', [[x - 40, y], [x + 40, y]]);
    for (let i = 1; i <= 12; i++) await touch('touchMove', [[x - 40 - i * 8, y], [x + 40 + i * 8, y]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(400);
    expect((await view(page)).ppm).not.toBeCloseTo(zoom0, 2);

    // (c) toque y arrastre en el minimapa
    const m1 = await minimapPoint(page, { x: 300, z: -300 });
    const m2 = await minimapPoint(page, { x: -300, z: 300 });
    await touch('touchStart', [[m1.x, m1.y]]);
    await touch('touchEnd', []);
    await touch('touchStart', [[m1.x, m1.y]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[m1.x + ((m2.x - m1.x) * i) / 8, m1.y + ((m2.y - m1.y) * i) / 8]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(500);

    const watch = await stopWatch(page);
    console.log(`AC-206 móvil: ${watch.frames} frames · ${watch.outside} con el barco fuera del 10 % central · ${watch.notFollow} sin seguimiento`);
    expect(watch.frames).toBeGreaterThan(30);
    expect({ outside: watch.outside, notFollow: watch.notFollow }).toEqual({ outside: 0, notFollow: 0 });
    expect(sentOf(net, C2S.moveTo)).toHaveLength(1);
    expect(sentOf(net, C2S.viewAt)).toHaveLength(0);
    await expectNoFreeViewUi(page);
  });
});

// ---------- El panel (AC-205) ----------

type Box = { x: number; y: number; width: number; height: number };
const openOptions = async (page: Page) => {
  await page.getByTestId('options-button').click();
  await expect(page.getByTestId('options-panel')).toBeVisible();
};
const closed = (page: Page) => expect(page.getByTestId('options-panel')).toHaveCount(0);
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const storedOptions = (page: Page) => page.evaluate((k) => localStorage.getItem(k), OPTIONS_KEY);

// Cajas de ART-DIRECTION §20.1 y §20.2 (x, y, ancho, alto), con ±1 px (§20.8, reglas 1 y 2)
const SPEC_BOXES: Record<string, { button: number[]; panel: number[] }> = {
  '1440×900': { button: [1192, 16, 40, 40], panel: [808, 64, 424, 600] },
  '390×844': { button: [16, 704, 52, 52], panel: [0, 559, 390, 285] },
  '844×390': { button: [12, 266, 52, 52], panel: [72, 88, 264, 290] }
};
const off = (b: Box, want: number[]) => Math.max(...[b.x, b.y, b.width, b.height].map((v, i) => Math.abs(v - want[i])));
const arrowsInText = (page: Page) => page.evaluate(() => /[\u2190-\u2193]/.test(document.body.innerText));

async function checkPanel(page: Page, size: string, touch: boolean): Promise<void> {
  const net = trackSocket(page);
  await enterGame(page);
  await page.waitForTimeout(500);
  const fine = await page.evaluate(() => matchMedia('(pointer: fine)').matches);
  const vp = page.viewportSize()!;
  net.reset();
  const button0 = (await page.getByTestId('options-button').boundingBox())!;
  await openOptions(page);
  const button1 = (await page.getByTestId('options-button').boundingBox())!;
  const border = await page.getByTestId('options-button').evaluate((el) => getComputedStyle(el).borderTopWidth);

  // La cámara en los 3 tamaños; las teclas, solo en la forma de escritorio y con un puntero fino (§20.2)
  await expect(page.getByTestId('camera-centered')).toBeVisible();
  await expect(page.getByTestId('camera-free')).toBeVisible();
  const keys = size === '1440×900' && fine;
  await expect(page.getByTestId('options-keys')).toHaveCount(keys ? 1 : 0);
  console.log(`AC-205 ${size}: táctil ${touch} · pointer: fine ${fine} · teclas ${keys ? 'sí' : 'no'}`);
  if (!touch) expect(fine).toBe(true);

  // La caja dentro del viewport, sin scroll de la página (AC-81), y fuera del 10 % central (AC-23): el barco se ve
  const box = (await page.getByTestId('options-panel').boundingBox())!;
  const centre = { x: vp.width * 0.45, y: vp.height * 0.45, width: vp.width * 0.1, height: vp.height * 0.1 };
  const scroll = await page.evaluate(() => ({ w: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight - innerHeight, x: scrollX, y: scrollY }));
  console.log(`AC-205 ${size}: panel ${JSON.stringify(box)} · centro ${JSON.stringify(centre)} · scroll ${JSON.stringify(scroll)}`);
  expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height).toBe(true);
  const want = SPEC_BOXES[size];
  console.log(`§20.8 ${size}: botón ${JSON.stringify(button0)} (abierto ${JSON.stringify(button1)}, borde ${border}) · esperado ${want.button} y ${want.panel}`);
  expect({ button: off(button0, want.button) <= 1, buttonOpen: off(button1, want.button) <= 1, panel: off(box, want.panel) <= 1 }).toEqual({ button: true, buttonOpen: true, panel: true });
  if (size !== '390×844') expect(border).toBe('2px'); // en 390×844 la hoja lo tapa
  expect(await arrowsInText(page)).toBe(false); // §20.8, regla 5
  expect(scroll).toEqual({ w: 0, h: 0, x: 0, y: 0 });
  expect(overlaps(box, centre)).toBe(false);

  // 10 s abierto y tras cambiar cada opción: 0 mensajes (la vista no se movió: «Centrada» no manda viewAt(null))
  await page.waitForTimeout(10_000);
  await page.getByTestId('camera-free').click();
  await page.waitForTimeout(1000);
  await page.getByTestId('camera-centered').click();
  await page.waitForTimeout(1000);
  if (keys) {
    await page.getByTestId('key-stop').click();
    await page.keyboard.press('KeyX');
    await page.getByTestId('options-reset').click();
    await page.waitForTimeout(1000);
  }
  const sent = intents(net);
  console.log(`AC-205 ${size}: mensajes con el panel abierto y tras cambiar las opciones ${JSON.stringify(sent)}`);
  expect(sent).toEqual([]);

  // Se cierra con Esc, con su ✕ y con un clic o un toque fuera, que no navega ni selecciona
  await page.keyboard.press('Escape');
  await closed(page);
  await openOptions(page);
  const close = (await page.getByTestId('options-close').boundingBox())!;
  if (touch) expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(48);
  await page.getByTestId('options-close').click();
  await closed(page);
  await openOptions(page);
  const out = { x: centre.x + centre.width / 2 + (box.x > vp.width / 2 ? -vp.width * 0.2 : vp.width * 0.2), y: vp.height / 2 };
  if (touch) await page.touchscreen.tap(out.x, out.y);
  else await page.mouse.click(out.x, out.y);
  await closed(page);
  await page.waitForTimeout(500);
  expect({ sent: intents(net), selected: (await hud(page)).selectedId }).toEqual({ sent: [], selected: null });
}

test.describe('Panel de opciones (E18, AC-205)', () => {
  test('AC-205 en 1440×900: cámara y teclas; 0 mensajes; Esc, ✕ y clic fuera; el barco a la vista', async ({ page }) => {
    test.setTimeout(120_000);
    await checkPanel(page, '1440×900', false);
  });

  test('AC-205 @mobile en 390×844: solo la cámara; 0 mensajes; ✕ de 48 px y toque fuera', async ({ page }) => {
    test.setTimeout(120_000);
    await checkPanel(page, '390×844', true);
  });

  test('AC-205 en 844×390 táctil: solo la cámara; 0 mensajes; ✕ de 48 px y toque fuera', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    try {
      await checkPanel(await ctx.newPage(), '844×390', true);
    } finally {
      await ctx.close();
    }
  });

  test('AC-205: sin puntero fino, el panel no enseña las teclas', async ({ page }) => {
    // La MediaQueryList real con `matches` redefinido: una copia ({ ...mql }) pierde addEventListener, que está en el
    // prototipo, y la suscripción del panel lanzaría un TypeError (1.er turno de E18, 2026-11-01)
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => {
        const m = real(q);
        if (q === '(pointer: fine)') Object.defineProperty(m, 'matches', { get: () => false });
        return m;
      };
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await enterGame(page);
      await openOptions(page);
      await expect(page.getByTestId('camera-centered')).toBeVisible();
      await expect(page.getByTestId('options-keys')).toHaveCount(0);
    } finally {
      console.log(`AC-205 sin puntero fino: ${errors.length} errores de la página ${JSON.stringify(errors)}`);
    }
  });

  test('AC-205 en 1440×900: con el panel abierto R repara y S detiene; mientras espera una tecla, no; la 1.ª Esc solo cancela la espera', async ({ page }) => {
    const net = trackSocket(page);
    await enterGame(page);
    await page.waitForTimeout(500);
    net.reset(); // el join de la entrada no es del panel
    await openOptions(page);
    await page.keyboard.press('KeyR');
    await waitFor(async () => intents(net).filter((i) => i.name === C2S.repair).length, (n) => n >= 1, 3000, 50);
    await page.keyboard.press('KeyR'); // deja de reparar
    await page.keyboard.press('KeyS');
    await page.waitForTimeout(300);
    const open = intents(net).map((i) => i.name);
    await page.getByTestId('key-viewDown').click();
    await expect(page.getByTestId('key-viewDown')).toHaveText('Pulsa una tecla…');
    net.reset();
    await page.keyboard.press('KeyR');
    await expect(page.getByTestId('options-notice')).toHaveText('Esa tecla es de Reparar.');
    await page.getByTestId('key-viewDown').click();
    await page.keyboard.press('KeyS'); // S es de Detener: se intercambia, no detiene
    await page.getByTestId('key-viewDown').click();
    await page.keyboard.press('Escape'); // 1.ª Esc: cancela la espera
    await expect(page.getByTestId('options-panel')).toBeVisible();
    await expect(page.getByTestId('key-viewDown')).not.toHaveText('Pulsa una tecla…');
    await page.waitForTimeout(300);
    const waiting = intents(net).map((i) => i.name);
    await page.keyboard.press('Escape'); // 2.ª: cierra el panel
    await closed(page);
    console.log(`AC-205 teclas: con el panel abierto ${JSON.stringify(open)} · esperando ${JSON.stringify(waiting)}`);
    expect(open).toEqual([C2S.repair, C2S.repair, C2S.stop]);
    expect(waiting).toEqual([]);
  });
});

// ---------- Cambiar de modo y guardarlo (AC-207) ----------

test.describe('Cambiar de modo (E18, AC-207)', () => {
  test('AC-207: de «Libre» a 300 m, «Centrada» vuelve al barco en ≤ 300 ms con 1 viewAt(null); de «Centrada» a «Libre», la cámara se queda', async ({ page }) => {
    await presetOptions(page, 'free');
    const net = trackSocket(page);
    await enterGame(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(800); // sale el último centro
    const s = (await me(page))!;
    const v = await view(page);
    expect(v.mode).toBe('free');
    // Lo que pide AC-207 es la vista lejos del barco; los 300 m son la velocidad de AC-118, que vigila el Mac (QA-75 O-9)
    const shipOutside = await page.evaluate(() => {
      const dbg = window.__SEA_BATTLE__!;
      const m = dbg.me() as { x: number; z: number } | null;
      const p = m && dbg.runtime().project(m.x, m.z);
      return !!p && !(Math.abs(p.sx - innerWidth / 2) <= 0.05 * innerWidth && Math.abs(p.sy - innerHeight / 2) <= 0.05 * innerHeight);
    });
    console.log(`AC-207: la vista a ${(v.x - s.x).toFixed(1)} m del barco en x · el barco fuera del 10 % central: ${shipOutside}`);
    expect(v.x - s.x, 'la vista a ≥ 150 m del barco en x').toBeGreaterThanOrEqual(150);
    expect(shipOutside, 'el barco fuera del 10 % central').toBe(true);
    await openOptions(page);
    net.reset();
    // Elegir «Centrada» y mirar cada frame desde el clic: el barco en el 10 % central desde los 300 ms (como AC-119)
    const box = (await page.getByTestId('camera-centered').boundingBox())!;
    const frames = await page.evaluate(
      ([x, y]) =>
        new Promise<{ t: number; inside: boolean; mode: string }[]>((resolve) => {
          const el = document.elementFromPoint(x, y) as HTMLElement;
          el.click();
          const t0 = performance.now();
          const out: { t: number; inside: boolean; mode: string }[] = [];
          const tick = (ts: number) => {
            const dbg = window.__SEA_BATTLE__!;
            const me = dbg.me() as { x: number; z: number } | null;
            const p = me && dbg.runtime().project(me.x, me.z);
            const inside = !!p && Math.abs(p.sx - innerWidth / 2) <= 0.05 * innerWidth && Math.abs(p.sy - innerHeight / 2) <= 0.05 * innerHeight;
            out.push({ t: ts - t0, inside, mode: dbg.runtime().freeView.mode });
            if (ts - t0 < 1000) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
      [box.x + box.width / 2, box.y + box.height / 2] as const
    );
    const late = frames.filter((f) => f.t >= 300 && (!f.inside || f.mode !== 'follow'));
    console.log(`AC-207: ${frames.length} frames en 1 s; ${late.length} desde los 300 ms con el barco fuera o sin seguimiento · enviados ${JSON.stringify(intents(net))}`);
    expect(late).toEqual([]);
    expect(intents(net)).toEqual([{ name: C2S.viewAt, data: null }]);
    expect((await view(page)).centered).toBe(true);

    // De «Centrada» a «Libre»: la cámara no se mueve
    const before = await view(page);
    const ship0 = (await me(page))!;
    await page.getByTestId('camera-free').click();
    await page.waitForTimeout(1000);
    const after = await view(page);
    const ship1 = (await me(page))!;
    // Sigue al barco (que puede ir a la deriva): el foco se mueve lo mismo que él
    expect(after.mode).toBe('follow');
    expect(Math.hypot(after.x - before.x - (ship1.x - ship0.x), after.z - before.z - (ship1.z - ship0.z))).toBeLessThanOrEqual(1);
    expect(intents(net)).toEqual([{ name: C2S.viewAt, data: null }]);
  });

  test('AC-207: el modo y las teclas siguen tras recargar y en una pestaña nueva; no van al servidor; un valor roto se descarta sin consola', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
      const net = trackSocket(page);
      await enterGame(page);
      await openOptions(page);
      await page.getByTestId('camera-free').click();
      await page.getByTestId('key-viewUp').click();
      await page.keyboard.press('KeyW');
      await page.keyboard.press('Escape');
      expect(parseOptions(await storedOptions(page))).toEqual({ camera: 'free', keys: { ...DEFAULT_BINDINGS, viewUp: 'KeyW' } });
      const sent = intents(net).map((i) => JSON.stringify(i));
      expect(sent.filter((t) => /KeyW|free|centered/.test(t))).toEqual([]);

      await page.reload();
      await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 30_000 });
      expect((await view(page)).centered).toBe(false);
      await openOptions(page);
      await expect(page.getByTestId('camera-free')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('key-viewUp')).toHaveText('W');

      // Otra pestaña del mismo navegador: el mismo almacenamiento
      const state = await ctx.storageState();
      const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
      const page2 = await ctx2.newPage();
      await enterGame(page2);
      expect((await view(page2)).centered).toBe(false);
      await ctx2.close();

      // Un valor roto: «Centrada» y las teclas por defecto, sin aviso ni error
      await page.evaluate((k) => localStorage.setItem(k, '{"v":1,"camera":"free","keys":{"viewUp":"Numpad8"'), OPTIONS_KEY);
      await page.reload();
      await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 30_000 });
      expect((await view(page)).centered).toBe(true);
      await openOptions(page);
      await expect(page.getByTestId('camera-centered')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('key-viewUp').locator('svg title')).toHaveText('flecha arriba');
      const own = errors.filter((t) => /option|opcion|sea-battle-options|JSON/i.test(t));
      console.log(`AC-207: consola ${errors.length} avisos o errores, ${own.length} de las opciones: ${JSON.stringify(own)}`);
      expect(own).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});

// ---------- Teclas (AC-208, AC-209) ----------

async function setKey(page: Page, action: string, code: string): Promise<void> {
  await page.getByTestId(`key-${action}`).click();
  await expect(page.getByTestId(`key-${action}`)).toHaveText('Pulsa una tecla…');
  await page.keyboard.press(code);
}

test.describe('Teclas a elegir (E18, AC-208, AC-209)', () => {
  test('AC-208 en «Libre»: con «arriba» en W, W sube la vista al menos 30 m y casi nada de lado, y ↑ no la mueve; con Detener en X, X detiene y S no', async ({ page }) => {
    await presetOptions(page, 'free');
    const net = trackSocket(page);
    await enterGame(page);
    await openOptions(page);
    await setKey(page, 'viewUp', 'KeyW');
    await expect(page.getByTestId('key-viewUp')).toHaveText('W'); // la distribución de la CI
    await setKey(page, 'stop', 'KeyX');
    await expect(page.getByTestId('key-stop')).toHaveText('X');
    await page.keyboard.press('Escape');
    await closed(page);

    const hold = async (key: string) => {
      const a = await view(page);
      await page.keyboard.down(key);
      await page.waitForTimeout(2000);
      await page.keyboard.up(key);
      await page.waitForTimeout(100);
      const b = await view(page);
      return { up: a.z - b.z, side: b.x - a.x }; // arriba en pantalla es −Z
    };
    const w = await hold('KeyW');
    const arrow = await hold('ArrowUp');
    console.log(`AC-208: W ${w.up.toFixed(1)} m hacia arriba · ↑ ${arrow.up.toFixed(1)} m`);
    expect(w.up, 'W sube la vista al menos 30 m').toBeGreaterThanOrEqual(30);
    expect(Math.abs(w.side), 'y casi nada de lado: menos de la décima parte de lo que sube').toBeLessThan(w.up / 10);
    expect(Math.hypot(arrow.up, arrow.side)).toBeLessThanOrEqual(0.5);

    net.reset();
    await page.keyboard.press('KeyS');
    await page.waitForTimeout(300);
    const withS = intents(net).filter((i) => i.name === C2S.stop).length;
    await page.keyboard.press('KeyX');
    await waitFor(async () => intents(net).filter((i) => i.name === C2S.stop).length, (n) => n >= 1, 3000, 50);
    await page.waitForTimeout(200);
    expect({ withS, withX: intents(net).filter((i) => i.name === C2S.stop).length }).toEqual({ withS: 0, withX: 1 });
  });

  test('AC-208: con Detener en ↓ y Centrar en V, la ranura de Detener y la caja de Centrar enseñan las teclas nuevas', async ({ page }) => {
    await presetOptions(page, 'free');
    await enterGame(page);
    await openOptions(page);
    await setKey(page, 'stop', 'ArrowDown'); // ↓ era de «abajo»: se intercambian
    await setKey(page, 'center', 'KeyV');
    await page.keyboard.press('Escape');
    await closed(page);
    await page.keyboard.down('KeyS'); // «abajo» quedó en S: suelta la vista para que salga Centrar
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyS');
    await expect(page.getByTestId('recenter')).toBeVisible();
    await expect(page.getByTestId('btn-stop').locator('.slot__key svg title')).toHaveText('flecha abajo');
    await expect(page.getByTestId('btn-stop')).toHaveAttribute('title', 'Detener (flecha abajo)');
    await expect(page.getByTestId('recenter').locator('kbd')).toHaveText('V');
    await expect(page.getByTestId('recenter')).toHaveAttribute('title', 'Centrar (V)');
  });

  test('AC-209: 1 intercambio, 1 rechazo y «Restablecer»', async ({ page }) => {
    await enterGame(page);
    await openOptions(page);
    await setKey(page, 'viewDown', 'KeyS');
    await expect(page.getByTestId('options-notice')).toHaveText('S era de Detener: Detener pasa a la flecha abajo.');
    await expect(page.getByTestId('key-viewDown')).toHaveText('S');
    await expect(page.getByTestId('key-stop').locator('svg title')).toHaveText('flecha abajo');
    await setKey(page, 'viewLeft', 'KeyR');
    await expect(page.getByTestId('options-notice')).toHaveText('Esa tecla es de Reparar.');
    await setKey(page, 'viewLeft', 'F5');
    await expect(page.getByTestId('options-notice')).toHaveText('Esa tecla no vale: usa una letra, un número o una flecha.');
    expect(parseOptions(await storedOptions(page)).keys).toEqual({ ...DEFAULT_BINDINGS, viewDown: 'KeyS', stop: 'ArrowDown' });
    await page.getByTestId('options-reset').click();
    await expect(page.getByTestId('key-stop')).toHaveText('S');
    expect(parseOptions(await storedOptions(page)).keys).toEqual(DEFAULT_BINDINGS);
  });
});

// ---------- Precisiones de producto del 2026-11-01 (AC-205, AC-208, AC-209) ----------

test.describe('Rechazos y ventanas (E18, precisado el 2026-11-01)', () => {
  test('AC-208: con Detener en ↓, R en la espera pone «R» en rojo en su fila con el aviso; ↓ sigue deteniendo y la ranura sigue con la flecha; tras otra acción en el panel, la fila vuelve a la flecha', async ({ page }) => {
    const net = trackSocket(page);
    await enterGame(page);
    await openOptions(page);
    await setKey(page, 'stop', 'ArrowDown');
    await setKey(page, 'stop', 'KeyR');
    const row = page.getByTestId('key-row-stop');
    await expect(row).toHaveAttribute('data-state', 'rejected');
    await expect(page.getByTestId('key-stop')).toHaveText('R');
    await expect(page.getByTestId('options-notice')).toHaveText('Esa tecla es de Reparar.');
    const red = await page.getByTestId('key-stop').evaluate((el) => getComputedStyle(el).borderTopColor);
    await expect(page.getByTestId('btn-stop').locator('.slot__key svg title')).toHaveText('flecha abajo');
    await page.waitForTimeout(300);
    net.reset();
    await page.keyboard.press('ArrowDown');
    await waitFor(async () => intents(net).filter((i) => i.name === C2S.stop).length, (n) => n >= 1, 3000, 50);
    await page.getByTestId('camera-free').click(); // la siguiente acción en el panel
    await expect(row).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId('key-stop').locator('svg title')).toHaveText('flecha abajo');
    console.log(`AC-208: borde de la tecla rechazada ${red}`);
    expect(red).toBe('rgb(255, 122, 122)'); // --ui-danger
  });

  test('AC-205: en el puerto, con el panel abierto, P abre la tienda y el panel ya no está; con la tienda abierta, no se abre', async ({ page }) => {
    await enterGame(page);
    await waitFor(async () => (await hud(page)).me as { inSafeZone?: boolean } | null, (m) => !!m?.inSafeZone, 10_000, 100);
    await openOptions(page);
    await page.getByTestId('key-viewUp').click(); // con una espera abierta, P es de Puerto: no abre la tienda
    await page.keyboard.press('KeyP');
    await expect(page.getByTestId('options-notice')).toHaveText('Esa tecla es de Puerto.');
    await expect(page.getByTestId('shop')).toHaveCount(0);
    await page.keyboard.press('KeyP'); // fuera de la espera
    await expect(page.getByTestId('shop')).toBeVisible();
    await closed(page);
    await page.evaluate(() => (document.querySelector('[data-testid="options-button"]') as HTMLButtonElement).click()); // tapado por la tienda
    await page.waitForTimeout(200);
    await closed(page);
  });
});

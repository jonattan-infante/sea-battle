// O-63, SONDA TEMPORAL: el PR que la trae es solo de medida y no se fusiona. En la CI, con el servidor sin invitado
// (PORTS.auth), @mobile 390×844:
// - Diagnóstico, en 25 contextos nuevos: de la landing y de /sign-in, cuántas document.images hay al entrar en settle, y
//   de cada una currentSrc, complete y naturalWidth; la esquina de arriba a la izquierda con el settle de antes (complete,
//   fuentes y 300 ms) y tras decode() y 2 frames; cuánto tarda el decode() de cada imagen justo después de la 1.ª captura
//   (unos pocos ms = ya estaba decodificada), y las navegaciones del frame principal. Si las 2 esquinas difieren, adjunta
//   las 2 capturas. Para H5, en el reloj del documento: su load, la entrada en settle, las 2 capturas, las llamadas a
//   history.pushState/replaceState y las navegaciones, y si el documento cambió entre la entrada y una captura.
// - Control A: la imagen del fondo de /sign-in retenida 2 s con page.route. ¿Cae la esquina frente a la landing?
// - Control B: decode() de las imágenes del fondo envuelto para resolver a los 1,5 s, con el fondo oculto hasta entonces.
//   Con el settle de antes la esquina tiene que salir sin la imagen, y tras decode() y 2 frames, con ella.
// Solo escribe en el log: no aserta nada del fondo. Sin traza, como auth-pages.spec.ts, y ninguna cadena del log puede
// llevar un token de Clerk: de las URL solo va la ruta si son del servidor de la prueba («fuera» si no), y todo pasa por safe()
import { Page, test, TestInfo } from '@playwright/test';
import { PORTS } from '../playwright.config';

const AUTH = `http://localhost:${PORTS.auth}`;
test.use({ trace: 'off' });
const RUNS = 25;

type Rgb = [number, number, number];
const lab = ([r, g, b]: Rgb) => {
  const lin = [r, g, b].map((v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const f = [
    (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047,
    0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2],
    (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883
  ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
};
const deltaE = (a: Rgb, b: Rgb) => {
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
// La última barrera antes del log: una cadena con algo que pueda ser de Clerk no sale
const safe = (s: string) => (/__session|eyJ|__clerk/i.test(s) ? '[tapado]' : s);
// La ruta si la URL es del servidor de la prueba, «fuera» si no. La query solo va con withQuery (currentSrc de /_next/image):
// la vuelta del handshake de Clerk lleva el token en la query, así que las navegaciones nunca la llevan
const where = (u: string, withQuery = false) => {
  try {
    const x = new URL(u);
    return x.origin === AUTH ? x.pathname + (withQuery ? x.search : '') : 'fuera';
  } catch {
    return 'sin URL';
  }
};

// Una captura entera y su píxel (8, 8), como corners() de auth-pages.spec.ts
async function shot(page: Page): Promise<{ png: Buffer; rgb: Rgb }> {
  const png = await page.screenshot();
  const rgb = (await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const k = img.width / innerWidth;
    const c = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
    c.drawImage(img, 0, 0);
    return Array.from(c.getImageData(Math.round(8 * k), Math.round(8 * k), 1, 1).data.slice(0, 3));
  }, png.toString('base64'))) as Rgb;
  return { png, rgb };
}

// O-63, H5: el reloj de la página (ms desde el performance.timeOrigin de su documento) y el timeOrigin, que cambia si el
// documento se sustituye
type Clock = { origin: number; now: number };
const clock = (page: Page): Promise<Clock> => page.evaluate(() => ({ origin: performance.timeOrigin, now: performance.now() }));
const onClock = (c: Clock, entry: Clock) => (c.origin === entry.origin ? `+${Math.round(c.now)}` : `+${Math.round(c.now)} en otro documento (timeOrigin ${Math.round(c.origin - entry.origin)} ms después)`);

// Las llamadas a history.pushState/replaceState (navegaciones dentro del mismo documento), con su hora en el reloj de la
// página, y sin la URL
async function hookHistory(page: Page) {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __o63: string[] }).__o63 = log;
    for (const k of ['pushState', 'replaceState'] as const) {
      const f = history[k].bind(history);
      history[k] = (...a: Parameters<History['pushState']>) => {
        log.push(`${k} +${Math.round(performance.now())}`);
        return f(...a);
      };
    }
  });
}

// Una página: lo que hay en document.images al entrar en settle y cuando acaba, la esquina con el settle de antes, el
// decode() de cada imagen justo después y la esquina tras decode() y 2 frames. Al final, en el reloj del documento en el
// que entró en settle: su load, la entrada en settle, las 2 capturas, sus llamadas a history y las navegaciones del frame
// principal desde la página anterior
async function measure(page: Page, label: string, info: TestInfo, navs: Nav[]) {
  const atEntry = await page.evaluate(() => document.images.length);
  const entry = await clock(page);
  const t = Date.now();
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20_000 });
  const waited = Date.now() - t;
  const images = await page.evaluate(() => Array.from(document.images).map((i) => ({ src: i.currentSrc, complete: i.complete, w: i.naturalWidth, h: i.naturalHeight, display: getComputedStyle(i).display })));
  await page.evaluate(() => document.fonts.ready.then(() => {}));
  await page.waitForTimeout(300);
  const atOld = await clock(page);
  const old = await shot(page);
  const decodeMs = await page.evaluate(() =>
    Promise.all(
      Array.from(document.images).map((i) => {
        const t0 = performance.now();
        return i.decode().then(() => String(Math.round(performance.now() - t0)), (e: Error) => `rechazo ${e.name}`);
      })
    )
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const atFixed = await clock(page);
  const fixed = await shot(page);
  const doc = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return { load: n ? Math.round(n.loadEventEnd) : -1, type: n?.type ?? 'sin entrada', history: (window as unknown as { __o63?: string[] }).__o63 ?? [] };
  });
  const navList = navs.splice(0).map((n) => `+${Math.round(n.at - entry.origin)} ${n.to}`);
  const timeline = `reloj del documento: load +${doc.load} (0 = aún no), entrada en settle +${Math.round(entry.now)}, captura del settle de antes ${onClock(atOld, entry)}, captura tras decode ${onClock(atFixed, entry)} · tipo ${doc.type} · history [${doc.history.join(', ')}] · navegaciones [${navList.join(', ')}]`;
  const dE = deltaE(old.rgb, fixed.rgb);
  if (dE > 3) {
    await info.attach(`${label.replace('/', '')}-settle-de-antes.png`, { body: old.png, contentType: 'image/png' });
    await info.attach(`${label.replace('/', '')}-tras-decode.png`, { body: fixed.png, contentType: 'image/png' });
  }
  const list = images.map((i, n) => `${where(i.src, true)} complete=${i.complete} ${i.w}×${i.h} ${i.display} decode ${decodeMs[n]} ms`).join('; ');
  const text = `${label}: ${atEntry} imágenes al entrar en settle (esperó ${waited} ms), ${images.length} al acabar [${list}] · esquina con el settle de antes rgb(${old.rgb.join(',')}), tras decode y 2 frames rgb(${fixed.rgb.join(',')}), ΔE76 ${dE.toFixed(2)} · ${timeline}`;
  return { text, old: old.rgb, fixed: fixed.rgb };
}

// Las navegaciones del frame principal, con la hora de Node (epoch, como performance.timeOrigin) y solo la ruta
type Nav = { at: number; to: string };
function trackNavigations(page: Page): Nav[] {
  const navs: Nav[] = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navs.push({ at: Date.now(), to: where(f.url()) });
  });
  return navs;
}

for (let run = 1; run <= RUNS; run++) {
  test(`O-63 sonda #${run}: landing y /sign-in en un contexto nuevo @mobile`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await hookHistory(page);
    const navs = trackNavigations(page);
    await page.goto(`${AUTH}/`);
    const landing = await measure(page, 'landing', info, navs);
    await page.goto(`${AUTH}/sign-in`);
    await page.locator('.cl-formButtonPrimary').waitFor({ state: 'visible', timeout: 30_000 });
    const signIn = await measure(page, '/sign-in', info, navs);
    console.log(safe(`O-63 sonda #${run} · ${landing.text} · ${signIn.text}`));
  });
}

const versusLanding = (signIn: { old: Rgb; fixed: Rgb }, landing: { fixed: Rgb }) =>
  `/sign-in frente a la landing (el test pide ≤ 3): ΔE76 con el settle de antes ${deltaE(signIn.old, landing.fixed).toFixed(2)}, tras decode ${deltaE(signIn.fixed, landing.fixed).toFixed(2)}`;

test('O-63 control A: la imagen del fondo de /sign-in retenida 2 s con page.route @mobile', async ({ page }, info) => {
  test.setTimeout(90_000);
  await hookHistory(page);
  const navs = trackNavigations(page);
  // Sin caché, para que /sign-in vuelva a pedir la imagen; solo se retienen las peticiones que salen con /sign-in abierta
  await page.route('**/_next/image**', async (route) => {
    const res = await route.fetch();
    if (page.url().includes('/sign-in')) await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({ response: res, headers: { ...res.headers(), 'cache-control': 'no-store' } });
  });
  await page.goto(`${AUTH}/`);
  const landing = await measure(page, 'landing', info, navs);
  await page.goto(`${AUTH}/sign-in`);
  await page.locator('.cl-formButtonPrimary').waitFor({ state: 'visible', timeout: 30_000 });
  const signIn = await measure(page, '/sign-in', info, navs);
  console.log(safe(`O-63 control A · ${landing.text} · ${signIn.text} · ${versusLanding(signIn, landing)}`));
});

test('O-63 control B: decode() del fondo a los 1,5 s, con el fondo oculto hasta entonces @mobile', async ({ page }, info) => {
  test.setTimeout(90_000);
  await hookHistory(page);
  const navs = trackNavigations(page);
  await page.goto(`${AUTH}/`);
  const landing = await measure(page, 'landing', info, navs);
  await page.addInitScript(() => {
    const hide = new CSSStyleSheet();
    hide.replaceSync('.landing__bg img { visibility: hidden !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, hide];
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
      const done = decode.call(this);
      if (!this.closest('.landing__bg')) return done;
      return done.then(() => new Promise<void>((r) => setTimeout(r, 1500))).then(() => hide.replaceSync(''));
    };
  });
  await page.goto(`${AUTH}/sign-in`);
  await page.locator('.cl-formButtonPrimary').waitFor({ state: 'visible', timeout: 30_000 });
  const signIn = await measure(page, '/sign-in', info, navs);
  console.log(safe(`O-63 control B · ${landing.text} · ${signIn.text} · ${versusLanding(signIn, landing)}`));
});

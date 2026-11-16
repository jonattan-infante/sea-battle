// E20, H-2005 y la parte visual de AC-253 (BACKLOG AC-253 a AC-256; ART-DIRECTION «Zona segura bajo fuego (1.3)», D120 a
// D128, reglas ZB-1 a ZB-7). Servidor propio con el escenario "under-fire": un mercante quieto dentro de la zona, a tiro desde
// un puesto dentro (UNDER_FIRE.inside) y otro fuera (UNDER_FIRE.outside). Disparar es lo único que pone bajo fuego a quien
// está dentro (GDD §11). Los tiempos se miden con el reloj del servidor del cliente (serverTime), como pide AC-254, y en
// cada frame del navegador (requestAnimationFrame), no con esperas de Playwright.
// O-157 (QA-79; BACKLOG AC-254 y AC-255): lo que controla el HUD se aserta contado en frames, que es lo que la CI puede
// comprobar aunque pinte un frame cada ~265 ms: (a) al caducar la marca, el cambio está en el primer frame tras uf; (b) lo que
// toma el sync de 100 ms del HUD (GameApp.tsx) sale, como mucho, en el primer frame que empieza más de 100 ms después del
// primer frame que ve el cambio. Los ms van al log, y sus cotas (≤ 200 ms) solo se asertan con la escena a ≥ 30 fps en esa
// misma muestra (mediana entre frames ≤ 34 ms); si no, quedan NO VERIFICADAS (anotación del test), no en rojo.
// E2E_MIN_FRAME_MS frena los frames de la página para comprobarlo (e2e/helpers.ts, slowFrames)
import fs from 'fs';
import path from 'path';
import { expect, Locator, Page, test, TestInfo } from '@playwright/test';
import { UNDER_FIRE } from '../server/scenarios';
import { DebugShip, enterGame, hud, me, MIN_FRAME_MS, ships, slowFrames, waitFor } from './helpers';
import { sailTo } from './net';
import { OwnServer, startOwnServer } from './own-server';

let server: OwnServer;
test.beforeAll(async () => {
  server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'under-fire' });
});
test.afterAll(async () => {
  await server?.kill();
});
test.beforeEach(async ({ context }) => {
  if (MIN_FRAME_MS > 0) await slowFrames(context, MIN_FRAME_MS);
});

const PORT_TEXT = (n: number) => `Bajo fuego: el puerto abre tras ${n} s sin disparos`;
const SAFE_R = 110;
const EXPIRY_MS = 200; // AC-254 y AC-255: el aviso cambia ≤ 200 ms después de uf o del cruce, con la escena a ≥ 30 fps
const SYNC_MS = 100; // el ciclo del sync del HUD (GameApp.tsx): lo que toma de cada snapshot, lo toma cada 100 ms
const FPS30_MS = 34; // O-157: los ms solo se asertan con la mediana entre frames ≤ 34 ms (≥ 30 fps)

// (b) El índice del primer frame que empieza más de 100 ms después del frame i (o el final de la muestra si no hay ninguno)
function syncDue(frames: { p: number }[], i: number): number {
  const j = frames.findIndex((f, k) => k > i && f.p - frames[i].p > SYNC_MS);
  return j < 0 ? frames.length : j;
}

// La cadencia de una muestra: la mediana, el p90 y el máximo entre frames, en ms
type Cadence = { frames: number; median: number; p90: number; max: number };
function cadence(frames: { p: number }[]): Cadence {
  const d = frames.slice(1).map((f, i) => f.p - frames[i].p).sort((a, b) => a - b);
  const at = (q: number) => (d.length ? d[Math.min(d.length - 1, Math.floor(q * d.length))] : Infinity);
  return { frames: frames.length, median: at(0.5), p90: at(0.9), max: d.length ? d[d.length - 1] : Infinity };
}
const describeCadence = (c: Cadence) => `${c.frames} frames, entre frames mediana ${c.median.toFixed(0)} / p90 ${c.p90.toFixed(0)} / máx. ${c.max.toFixed(0)} ms`;

// La cota en ms de una medida tomada por frame: se aserta solo si esa muestra va a ≥ 30 fps (al menos 6 frames y mediana ≤
// 34 ms); si no, va al log y a las anotaciones del test como NO VERIFICADA, con la cadencia
function msBound(label: string, ms: number, bound: number, c: Cadence): void {
  const cad = describeCadence(c);
  if (c.frames >= 6 && c.median <= FPS30_MS) {
    console.log(`${label}: ${ms.toFixed(0)} ms (cota ${bound} ms, asertada) · ${cad}`);
    expect(ms, `${label} (${cad})`).toBeLessThanOrEqual(bound);
    return;
  }
  const why = `${label}: ${ms.toFixed(0)} ms NO VERIFICADA (la cota de ${bound} ms solo se aserta a ≥ 30 fps) · ${cad}`;
  console.log(why);
  test.info().annotations.push({ type: 'NO VERIFICADA', description: why });
}

// Un frame del HUD: el reloj, la marca del barco propio (interpolado, el que pinta el HUD), el estado del hueco de aviso,
// el número y los botones
interface Sample {
  p: number; // el inicio del frame (la marca de tiempo de requestAnimationFrame), en ms
  t: number; // serverTime() en ese instante: el mismo con el que decide el ticker del HUD (Hud.tsx, ZoneSlot)
  uf: number;
  r: number; // distancia del barco propio al puerto
  slot: 'none' | 'pill' | 'protected' | 'under-fire';
  holders: number; // elementos con data-under-fire-seconds
  both: boolean; // la píldora y el aviso de la zona a la vez
  n: number | null;
  text: string;
  port: string | null; // data-port-block del botón Puerto visible
  portCount: string | null;
  portFlame: boolean;
  portDisabled: string | null;
  shop: boolean;
}

function sample(page: Page, ms: number, mobile: boolean): Promise<Sample[]> {
  return page.evaluate(
    ([dur, mob]) =>
      new Promise<Sample[]>((resolve) => {
        const dbg = window.__SEA_BATTLE__!;
        const out: Sample[] = [];
        const end = performance.now() + dur;
        const frame = (ts: number) => {
          const s = dbg.me() as { x: number; z: number; underFireUntil: number } | null;
          const holders = document.querySelectorAll<HTMLElement>('[data-under-fire-seconds]');
          const pill = document.querySelector<HTMLElement>('[data-testid="under-fire"]');
          const zone = document.querySelector<HTMLElement>('[data-testid="safe-zone"]');
          const port = document.querySelector<HTMLElement>(mob ? '[data-testid="m-port"]' : '[data-testid="btn-port"]');
          const holder = holders[0];
          out.push({
            p: ts,
            t: dbg.runtime().client.serverTime(ts),
            uf: s?.underFireUntil ?? 0,
            r: s ? Math.hypot(s.x, s.z) : Infinity,
            slot: pill ? 'pill' : ((zone?.dataset.zoneState as Sample['slot']) ?? 'none'),
            holders: holders.length,
            both: !!pill && !!zone,
            n: holder ? Number(holder.dataset.underFireSeconds) : null,
            text: holder?.textContent ?? '',
            port: port?.dataset.portBlock ?? null,
            portCount: port?.querySelector('.slot__count')?.textContent ?? null,
            portFlame: !!port?.querySelector('.slot__fire svg'),
            portDisabled: port?.getAttribute('aria-disabled') ?? null,
            shop: !!document.querySelector('[data-testid="shop"]')
          });
          if (performance.now() < end) requestAnimationFrame(frame);
          else resolve(out);
        };
        requestAnimationFrame(frame);
      }),
    [ms, mobile] as const
  );
}

// Lo que el hueco debe enseñar en un frame (D120)
const expected = (s: Pick<Sample, 't' | 'uf' | 'r'>): Sample['slot'] => {
  const marked = s.uf > s.t;
  if (s.r <= SAFE_R) return marked ? 'under-fire' : 'protected';
  return marked ? 'pill' : 'none';
};

// ZB-1 a ZB-4 en cada frame: nunca 2 indicadores ni la píldora con el aviso; el estado es el de la regla desde el frame en
// que el HUD tiene que enseñarlo, contado en frames (O-157): al caducar la marca, ese mismo frame (a); tras cruzar los 110 m,
// al llegar la marca o al empezar la muestra, el primer frame más de 100 ms después (b). Con la marca, el número es
// ceil(uf − t) ± 1, está en el texto con «Bajo fuego» y «N s», y sin marca no hay ninguno
function checkFrames(samples: Sample[], label: string): void {
  let due = syncDue(samples, 0);
  samples.forEach((s, i) => {
    const want = expected(s);
    const prev = samples[i - 1];
    if (prev && expected(prev) !== want) {
      const crossed = prev.r <= SAFE_R !== s.r <= SAFE_R;
      const expired = prev.uf > prev.t && s.uf <= s.t;
      due = Math.max(due, expired && !crossed ? i : syncDue(samples, i)); // un cambio anterior sin cumplir conserva su margen
    }
    expect(s.holders, `${label}: un solo [data-under-fire-seconds]`).toBeLessThanOrEqual(1);
    expect(s.both, `${label}: la píldora y el aviso a la vez`).toBe(false);
    if (i >= due) expect(s.slot, `${label}: estado en el frame ${i} (t = ${s.t.toFixed(3)}, uf ${s.uf.toFixed(2)}, r ${s.r.toFixed(1)}), debido desde el frame ${due}`).toBe(want);
    if (s.slot === 'pill' || s.slot === 'under-fire') {
      expect(s.holders).toBe(1);
      const n = s.n!;
      expect(Number.isInteger(n) && n >= 1 && n <= 10).toBe(true);
      expect(Math.abs(n - Math.ceil(s.uf - s.t))).toBeLessThanOrEqual(1);
      expect(s.text).toContain('Bajo fuego');
      expect(s.text).toContain(`${n} s`);
    } else {
      expect(s.holders).toBe(0);
    }
  });
}

// Al caducar la marca (O-157 a): el primer frame tras uf ya enseña el estado de después y ninguno con t ≥ uf el de antes. El
// frame anterior a uf todavía enseñaba la marca: el cambio no se adelanta. Devuelve cuánto tarda ese frame desde uf con el
// reloj del servidor, en ms (para el log y la cota a ≥ 30 fps)
function expiryDelay(samples: Sample[], before: Sample['slot'], after: Sample['slot']): number {
  const marked = samples.find((s) => s.uf > s.t);
  expect(marked, 'hubo marca durante la muestra').toBeDefined();
  const uf = marked!.uf;
  const late = samples.filter((s) => s.t >= uf);
  expect(late.length, 'frames tras uf').toBeGreaterThan(0);
  expect(late[0].slot, `el primer frame tras uf (t = ${late[0].t.toFixed(3)}, uf ${uf.toFixed(3)})`).toBe(after);
  expect(late.filter((s) => s.slot === before).map((s) => s.t.toFixed(3)), `frames tras uf con «${before}»`).toEqual([]);
  const prior = [...samples].reverse().find((s) => s.t < uf - 0.05);
  if (prior) expect(prior.slot).not.toBe(after);
  return (late[0].t - uf) * 1000;
}

const merchantOf = async (page: Page): Promise<DebugShip> => (await ships(page)).find((s) => s.kind === 'merchant')!;

async function goTo(page: Page, post: { x: number; z: number }): Promise<void> {
  await sailTo(page, post.x, post.z);
  await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - post.x, s.z - post.z) < 4, 45_000, 200);
}

// Una andanada contra el mercante (atacar quita la protección y la primera sale enseguida) y se cancela el ataque, para
// que la marca corra sin renovarse. Devuelve el uf que trae el barco propio
async function fireOnce(page: Page): Promise<number> {
  const merchant = await merchantOf(page);
  await page.evaluate((id) => window.__SEA_BATTLE__!.runtime().client.attack(id), merchant.id);
  const s = await waitFor(() => page.evaluate(() => ({ uf: (window.__SEA_BATTLE__!.me() as DebugShip).underFireUntil, t: window.__SEA_BATTLE__!.serverTime() })), (v) => v.uf > v.t, 10_000, 50);
  await page.evaluate(() => window.__SEA_BATTLE__!.runtime().client.cancelAttack());
  return s.uf;
}

const portButton = (page: Page, mobile: boolean) => page.getByTestId(mobile ? 'm-port' : 'btn-port');
const pressPort = async (page: Page, mobile: boolean) => (mobile ? portButton(page, true).tap({ force: true }) : page.keyboard.press('KeyP'));
const fireToasts = (page: Page) => page.getByTestId('toasts').locator('.toast[data-toast-key="port-under-fire"]');

function contextOptions(info: TestInfo) {
  const u = info.project.use;
  return { viewport: u.viewport, deviceScaleFactor: u.deviceScaleFactor, isMobile: u.isMobile, hasTouch: u.hasTouch, userAgent: u.userAgent };
}

for (const mobile of [false, true]) {
  const tag = mobile ? ' en 390×844 @mobile' : ' en 1440×900';

  test(`AC-254 y AC-255: la píldora fuera, «no te protege» al entrar bajo fuego y «Zona segura» al caducar; nada sin marca${tag}`, async ({ page }) => {
    test.setTimeout(180_000);
    await enterGame(page, server.url);
    // Recién aparecido en un amarre: dentro y sin marca, «Zona segura» como hoy (AC-255, tercer caso)
    await expect(page.getByTestId('safe-zone')).toHaveAttribute('data-zone-state', 'protected');
    await expect(page.locator('[data-under-fire-seconds]')).toHaveCount(0);

    // Fuera y bajo fuego: la píldora, que desaparece al caducar (AC-254)
    await goTo(page, UNDER_FIRE.outside);
    await expect(page.getByTestId('safe-zone')).toHaveCount(0);
    const uf1 = await fireOnce(page);
    await expect(page.getByTestId('under-fire')).toBeVisible();
    await expect(portButton(page, mobile)).toHaveAttribute('data-port-block', 'zone'); // fuera manda la zona, sin cuenta
    await expect(portButton(page, mobile).locator('.slot__count')).toHaveCount(0);
    const outside = await sample(page, Math.max(0, (uf1 - (await page.evaluate(() => window.__SEA_BATTLE__!.serverTime()))) * 1000) + 1500, mobile);
    checkFrames(outside, 'fuera');
    const shown = [...new Set(outside.filter((s) => s.n !== null).map((s) => s.n))];
    expect(shown.every((n, i) => i === 0 || n === shown[i - 1]! - 1), `enteros que bajan de 1 en 1: ${shown.join(', ')}`).toBe(true);
    expect(shown.length).toBeGreaterThanOrEqual(7);
    const pillGone = expiryDelay(outside, 'pill', 'none');
    console.log(`AC-254 (${tag.trim()}): cuenta ${shown.join(' → ')} · la píldora se va en el primer frame tras uf, ${pillGone.toFixed(0)} ms después`);
    msBound(`AC-254 (${tag.trim()}): la píldora se va tras uf`, pillGone, EXPIRY_MS, cadence(outside));

    // Entrar bajo fuego: en el frame en que cruza los 110 m, «no te protege» (nunca «Zona segura» con la marca); al caducar
    // dentro, «Zona segura» (AC-255)
    const uf2 = await fireOnce(page);
    await sailTo(page, UNDER_FIRE.inside.x, UNDER_FIRE.inside.z);
    const entering = await sample(page, Math.max(0, (uf2 - (await page.evaluate(() => window.__SEA_BATTLE__!.serverTime()))) * 1000) + 1500, mobile);
    checkFrames(entering, 'al entrar');
    const crossAt = entering.findIndex((s) => s.r <= SAFE_R);
    expect(crossAt, 'cruzó los 110 m con la marca').toBeGreaterThanOrEqual(0);
    const cross = entering[crossAt];
    expect(cross.uf).toBeGreaterThan(cross.t);
    const insideAt = entering.findIndex((s) => s.slot === 'under-fire');
    expect(insideAt).toBeGreaterThanOrEqual(0);
    // (b) El cruce lo toma el sync de 100 ms: «no te protege», como mucho en el primer frame que empieza > 100 ms después
    const insideDue = syncDue(entering, crossAt);
    expect(insideAt, `«no te protege» en el frame ${insideAt}; cruzó en el ${crossAt} y el primero > 100 ms después es el ${insideDue}`).toBeLessThanOrEqual(insideDue);
    expect(entering.filter((s) => s.slot === 'protected' && s.uf > s.t + 0.25)).toEqual([]);
    const zoneBack = expiryDelay(entering, 'under-fire', 'protected');
    const insideMs = entering[insideAt].p - cross.p;
    console.log(`AC-255 (${tag.trim()}): «no te protege» ${insideAt - crossAt} frames y ${insideMs.toFixed(0)} ms tras cruzar (debido ≤ ${insideDue - crossAt} frames) · «Zona segura» en el primer frame tras uf, ${zoneBack.toFixed(0)} ms después`);
    const enteringCadence = cadence(entering);
    msBound(`AC-255 (${tag.trim()}): «no te protege» tras cruzar`, insideMs, EXPIRY_MS, enteringCadence);
    msBound(`AC-255 (${tag.trim()}): «Zona segura» tras uf`, zoneBack, EXPIRY_MS, enteringCadence);
  });

  test(`AC-253: la tienda abierta se cierra al caer bajo fuego; Puerto desactivado con la cuenta y la llama, su aviso sustituye al anterior y vuelve al caducar${tag}`, async ({ page }) => {
    test.setTimeout(180_000);
    await enterGame(page, server.url);
    await goTo(page, UNDER_FIRE.inside);
    const port = portButton(page, mobile);
    await expect(port).not.toHaveAttribute('data-port-block');
    await pressPort(page, mobile);
    await expect(page.getByTestId('shop')).toBeVisible();

    // Con la tienda abierta dispara (un ataque en curso): se cierra con la marca, y sale el aviso con N = 10. Un registro por
    // frame (su inicio, si el barco trae la marca y si la tienda sigue), hasta verla cerrada con la marca (tope de 15 s)
    const closing = page.evaluate(
      () =>
        new Promise<{ p: number; mark: boolean; shop: boolean }[]>((resolve) => {
          const dbg = window.__SEA_BATTLE__!;
          const out: { p: number; mark: boolean; shop: boolean }[] = [];
          const end = performance.now() + 15_000;
          const frame = (ts: number) => {
            const s = dbg.me() as { underFireUntil: number };
            const f = { p: ts, mark: s.underFireUntil > dbg.runtime().client.serverTime(ts), shop: !!document.querySelector('[data-testid="shop"]') };
            out.push(f);
            if ((out.some((o) => o.mark) && !f.shop) || performance.now() > end) return resolve(out);
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        })
    );
    const merchant = await merchantOf(page);
    await page.evaluate((id) => window.__SEA_BATTLE__!.runtime().client.attack(id), merchant.id);
    const shopFrames = await closing;
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().client.cancelAttack());
    expect(shopFrames[0].shop, 'la tienda abierta al empezar').toBe(true);
    const markAt = shopFrames.findIndex((f) => f.mark);
    const closedAt = shopFrames.findIndex((f) => !f.shop);
    expect(markAt, 'el barco trajo la marca').toBeGreaterThanOrEqual(0);
    expect(closedAt, 'la tienda se cerró').toBeGreaterThanOrEqual(0);
    // (b) La marca la toma el sync de 100 ms del HUD: cerrada, como mucho, en el primer frame que empieza > 100 ms después
    const closeDue = syncDue(shopFrames, markAt);
    const closeMs = Math.max(0, shopFrames[closedAt].p - shopFrames[markAt].p);
    console.log(`AC-253 (${tag.trim()}): la tienda se cierra ${closedAt - markAt} frames y ${closeMs.toFixed(0)} ms después de que el barco trae la marca (debido ≤ ${closeDue - markAt} frames)`);
    expect(closedAt, `cerrada en el frame ${closedAt}; la marca llegó en el ${markAt} y el primero > 100 ms después es el ${closeDue}`).toBeLessThanOrEqual(closeDue);
    msBound(`AC-253 (${tag.trim()}): la tienda se cierra tras la marca`, closeMs, EXPIRY_MS, cadence(shopFrames));
    await expect(fireToasts(page)).toHaveCount(1);
    await expect(fireToasts(page)).toHaveText(PORT_TEXT(10));
    await expect(fireToasts(page).locator('svg')).toHaveCount(1); // la llama

    // Puerto bajo fuego (ZB-5): desactivado, data-port-block="under-fire", la cuenta igual a N y la llama
    await expect(port).toHaveAttribute('data-port-block', 'under-fire');
    await expect(port).toHaveAttribute('aria-disabled', 'true');
    if (!mobile) await expect(port).toHaveAttribute('title', PORT_TEXT(10));
    const frames = await sample(page, 400, mobile);
    for (const s of frames) {
      expect(s.port).toBe('under-fire');
      expect(s.portFlame).toBe(true);
      expect(Number(s.portCount)).toBe(s.n);
    }

    // Pulsarlo: el aviso con la N del momento, y otra pulsación no añade un 2.º (D125). «Del momento» es ceil(uf − t) con t el
    // instante de la pulsación, entre el reloj de antes y el de después. Un número leído del DOM es el del último frame, que
    // con un frame cada ~265 ms (la CI) puede ir 1 s por detrás de la pulsación (O-157)
    const ufPort = (await me(page))!.underFireUntil;
    const clock = () => page.evaluate(() => window.__SEA_BATTLE__!.serverTime());
    const pressN = async (): Promise<number> => {
      const t0 = await clock();
      await pressPort(page, mobile);
      const t1 = await clock();
      await expect(fireToasts(page)).toHaveCount(1);
      const n = Number(/tras (\d+) s/.exec((await fireToasts(page).textContent()) ?? '')?.[1]);
      expect(n, `N del aviso entre ceil(uf − t) después (${Math.ceil(ufPort - t1)}) y antes (${Math.ceil(ufPort - t0)}) de la pulsación`).toBeGreaterThanOrEqual(Math.ceil(ufPort - t1));
      expect(n).toBeLessThanOrEqual(Math.ceil(ufPort - t0));
      await expect(fireToasts(page)).toHaveText(PORT_TEXT(n));
      return n;
    };
    await page.waitForTimeout(1200);
    const n1 = await pressN();
    await page.waitForTimeout(1200);
    const n2 = await pressN();
    expect(n2).toBeLessThan(n1);
    await expect(page.getByTestId('shop')).toHaveCount(0);

    // Al caducar, Puerto vuelve sin otra acción (≤ 200 ms con el reloj del servidor) y abre la tienda
    const uf = (await me(page))!.underFireUntil;
    const rest = await sample(page, Math.max(0, (uf - (await page.evaluate(() => window.__SEA_BATTLE__!.serverTime()))) * 1000) + 1000, mobile);
    // (a) Lo vuelve el ticker del hueco de aviso al caducar: en el primer frame tras uf, y ninguno después lo enseña bajo fuego
    const lateRest = rest.filter((s) => s.t >= uf);
    expect(lateRest.length, 'frames tras uf').toBeGreaterThan(0);
    const back = lateRest[0];
    expect({ port: back.port, disabled: back.portDisabled }, `Puerto en el primer frame tras uf (t = ${back.t.toFixed(3)}, uf ${uf.toFixed(3)})`).toEqual({ port: null, disabled: 'false' });
    expect(lateRest.filter((s) => s.port !== null).map((s) => s.t.toFixed(3)), 'frames tras uf con Puerto desactivado').toEqual([]);
    console.log(`AC-253 (${tag.trim()}): Puerto vuelve en el primer frame tras uf, ${((back.t - uf) * 1000).toFixed(0)} ms después`);
    msBound(`AC-253 (${tag.trim()}): Puerto vuelve tras uf`, (back.t - uf) * 1000, EXPIRY_MS, cadence(rest));
    expect(rest.filter((s) => s.t < uf - 0.05).every((s) => s.port === 'under-fire')).toBe(true);
    await pressPort(page, mobile);
    await expect(page.getByTestId('shop')).toBeVisible();
  });

  test(`AC-256: con 2 contextos, otro jugador dentro de la zona es atacable bajo fuego y «✕ No atacable» sin marca, en el panel y en Tab${tag}`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const ctxA = await browser.newContext(contextOptions(info));
    const ctxB = await browser.newContext(contextOptions(info));
    if (MIN_FRAME_MS > 0) await Promise.all([slowFrames(ctxA, MIN_FRAME_MS), slowFrames(ctxB, MIN_FRAME_MS)]);
    try {
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();
      await enterGame(a, server.url);
      await enterGame(b, server.url);
      const bShip = (await me(b))!.id;
      await goTo(b, UNDER_FIRE.inside);
      await goTo(a, UNDER_FIRE.outside);
      await fireOnce(a); // atacar quita la protección de reaparición del observador
      const range = a.getByTestId('target-range');
      const cycle = async () => {
        const seen = new Set<string>();
        for (let i = 0; i < 4; i++) {
          if (mobile) await a.getByTestId('m-target').tap();
          else await a.keyboard.press('Tab');
          const id = (await hud(a)).selectedId as string | null;
          if (id) seen.add(id);
        }
        return seen;
      };

      // B dentro y bajo fuego: «En alcance» o «Fuera de alcance», y Tab lo incluye
      const ufB = await fireOnce(b);
      await waitFor(() => ships(a), (list) => list.some((s) => s.id === bShip && s.underFireUntil > 0), 5_000, 50);
      await a.evaluate((id) => window.__SEA_BATTLE__!.select(id), bShip);
      await expect(range).toHaveText(/· (✓ En alcance|✕ Fuera de alcance)$/);
      expect([...(await cycle())]).toContain(bShip);

      // Sin marca: «✕ No atacable» y Tab no lo incluye
      await waitFor(() => a.evaluate(() => window.__SEA_BATTLE__!.serverTime()), (t) => t > ufB + 0.3, 15_000, 100);
      await a.evaluate((id) => window.__SEA_BATTLE__!.select(id), bShip);
      await expect(range).toHaveText('· ✕ No atacable');
      expect([...(await cycle())]).not.toContain(bShip);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
}

// ---- Capturas frente a las láminas (ZB-9) y la regla de la franja (ZB-3) ----

const OUT = path.join(__dirname, '..', 'qa-artifacts', 'under-fire');
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true }
];
// ZB-1 y ZB-2: las cajas del hueco de aviso (x, y, ancho, alto en px CSS), ±1 px
const BOXES = {
  desktop: { pill: [642, 96, 156, 36], zone: [540, 96, 360, 36] },
  mobile: { pill: [117, 156, 156, 36], zone: [16, 156, 358, 36] }
} as const;
async function expectBox(el: Locator, want: readonly number[]): Promise<void> {
  const b = (await el.boundingBox())!;
  const got = [b.x, b.y, b.width, b.height];
  got.forEach((v, i) => expect(Math.abs(v - want[i]), `caja ${got.map((n) => n.toFixed(1)).join(', ')} frente a ${want.join(', ')}`).toBeLessThanOrEqual(1));
}

// ZB-3: en la columna x = borde izquierdo + 2 px, de arriba + 2 a abajo − 3 (px CSS, × DPR), el rango de L* y los cruces de
// la media. «Zona segura»: rango ≤ 8; «no te protege» y la píldora: rango ≥ 40 y ≥ 4 cruces. L* sale de la luminancia, así
// que es la misma en color y en grises
async function stripeRule(page: Page, el: Locator): Promise<{ range: number; crossings: number }> {
  const box = (await el.boundingBox())!;
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    ([data, b]) =>
      new Promise<{ range: number; crossings: number }>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const dpr = img.width / window.innerWidth;
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext('2d')!;
          g.drawImage(img, 0, 0);
          const x = Math.round((b.x + 2) * dpr);
          const y0 = Math.round((b.y + 2) * dpr);
          const y1 = Math.round((b.y + b.height - 3) * dpr);
          const px = g.getImageData(x, y0, 1, y1 - y0).data;
          const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          const ls: number[] = [];
          for (let i = 0; i < px.length; i += 4) {
            const y = 0.2126 * lin(px[i] / 255) + 0.7152 * lin(px[i + 1] / 255) + 0.0722 * lin(px[i + 2] / 255);
            ls.push(y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);
          }
          const mean = ls.reduce((a, v) => a + v, 0) / ls.length;
          let crossings = 0;
          for (let i = 1; i < ls.length; i++) if (Math.sign(ls[i] - mean) !== Math.sign(ls[i - 1] - mean)) crossings++;
          resolve({ range: Math.max(...ls) - Math.min(...ls), crossings });
        };
        img.src = `data:image/png;base64,${data}`;
      }),
    [png, box] as const
  );
}

test.describe('Capturas @capture', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  for (const vp of VIEWPORTS) {
    test(`zona segura bajo fuego en ${vp.name} (${vp.width}×${vp.height}): las 2 láminas de pantalla, los 4 casos del hueco y los 3 del Puerto`, async ({ browser }) => {
      test.setTimeout(240_000);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
      try {
        const page = await ctx.newPage();
        const shot = (name: string) => page.screenshot({ path: path.join(OUT, `${vp.name}-${name}.png`) });
        const crop = (el: Locator, name: string) => el.screenshot({ path: path.join(OUT, `${vp.name}-${name}.png`) });
        const port = portButton(page, vp.mobile);
        const rules: Record<string, { range: number; crossings: number }> = {};
        await enterGame(page, server.url);
        await goTo(page, UNDER_FIRE.inside);
        await page.mouse.move(5, vp.height / 2);
        await page.waitForTimeout(800);

        // Dentro, sin marca: «Zona segura» y Puerto activo
        const zone = page.getByTestId('safe-zone');
        await expect(zone).toHaveAttribute('data-zone-state', 'protected');
        rules.protected = await stripeRule(page, zone);
        await expectBox(zone, BOXES[vp.name as 'desktop' | 'mobile'].zone);
        await crop(zone, 'hueco-zona-segura');
        await crop(port, 'puerto-activo');

        // Dentro, bajo fuego, tras pulsar Puerto: las 2 láminas de pantalla (con N = 7, como ellas)
        const uf = await fireOnce(page);
        await waitFor(() => page.evaluate(() => window.__SEA_BATTLE__!.serverTime()), (t) => uf - t <= 7, 15_000, 50);
        await pressPort(page, vp.mobile);
        await expect(fireToasts(page)).toHaveCount(1);
        await page.waitForTimeout(300);
        await expect(zone).toHaveAttribute('data-zone-state', 'under-fire');
        await shot('zona-bajo-fuego');
        rules['under-fire'] = await stripeRule(page, zone);
        await expectBox(zone, BOXES[vp.name as 'desktop' | 'mobile'].zone);
        await crop(zone, 'hueco-no-te-protege');
        await crop(port, 'puerto-bajo-fuego');
        await crop(fireToasts(page), 'aviso-puerto-bajo-fuego');

        // Fuera, bajo fuego: la píldora y Puerto desactivado por la zona, sin cuenta
        await goTo(page, UNDER_FIRE.outside);
        if ((await me(page))!.underFireUntil <= (await page.evaluate(() => window.__SEA_BATTLE__!.serverTime())) + 3) await fireOnce(page);
        await page.waitForTimeout(500);
        const pill = page.getByTestId('under-fire');
        await expect(pill).toBeVisible();
        rules.pill = await stripeRule(page, pill);
        await expectBox(pill, BOXES[vp.name as 'desktop' | 'mobile'].pill);
        await crop(pill, 'hueco-pildora');
        await crop(port, 'puerto-fuera-de-la-zona');
        await pressPort(page, vp.mobile);
        await page.waitForTimeout(300);
        await crop(page.getByTestId('toasts'), 'columna-fuera-bajo-fuego');

        // Fuera, sin marca: nada en el hueco
        const until = (await me(page))!.underFireUntil;
        await waitFor(() => page.evaluate(() => window.__SEA_BATTLE__!.serverTime()), (t) => t > until + 4, 15_000, 100); // y que caduque el aviso
        await expect(page.locator('[data-under-fire-seconds]')).toHaveCount(0);
        await shot('fuera-sin-marca');

        console.log(`ZB-3 (${vp.name}): ${Object.entries(rules).map(([k, r]) => `${k} rango ${r.range.toFixed(1)}, ${r.crossings} cruces`).join(' · ')}`);
        fs.writeFileSync(path.join(OUT, `${vp.name}-zb3.json`), JSON.stringify(rules, null, 2));
        expect(rules.protected.range).toBeLessThanOrEqual(8);
        for (const k of ['under-fire', 'pill']) {
          expect(rules[k].range).toBeGreaterThanOrEqual(40);
          expect(rules[k].crossings).toBeGreaterThanOrEqual(4);
        }
      } finally {
        await ctx.close();
      }
    });
  }
});

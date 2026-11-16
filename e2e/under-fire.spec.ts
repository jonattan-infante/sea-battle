// E20, H-2005 y la parte visual de AC-253 (BACKLOG AC-253 a AC-256; ART-DIRECTION «Zona segura bajo fuego (1.3)», D120 a
// D128, reglas ZB-1 a ZB-7). Servidor propio con el escenario "under-fire": un mercante quieto dentro de la zona, a tiro desde
// un puesto dentro (UNDER_FIRE.inside) y otro fuera (UNDER_FIRE.outside). Disparar es lo único que pone bajo fuego a quien
// está dentro (GDD §11). Los tiempos se miden con el reloj del servidor del cliente (serverTime), como pide AC-254, y en
// cada frame del navegador (requestAnimationFrame), no con esperas de Playwright
import fs from 'fs';
import path from 'path';
import { expect, Locator, Page, test, TestInfo } from '@playwright/test';
import { UNDER_FIRE } from '../server/scenarios';
import { DebugShip, enterGame, hud, me, ships, waitFor } from './helpers';
import { sailTo } from './net';
import { OwnServer, startOwnServer } from './own-server';

let server: OwnServer;
test.beforeAll(async () => {
  server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'under-fire' });
});
test.afterAll(async () => {
  await server?.kill();
});

const PORT_TEXT = (n: number) => `Bajo fuego: el puerto abre tras ${n} s sin disparos`;
const SAFE_R = 110;
const EXPIRY_MS = 200; // AC-254: el indicador cambia ≤ 200 ms después de uf, con el reloj del servidor

// Un frame del HUD: el reloj, la marca del barco propio (interpolado, el que pinta el HUD), el estado del hueco de aviso,
// el número y los botones
interface Sample {
  p: number; // performance.now()
  t: number; // serverTime()
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
        const frame = () => {
          const s = dbg.me() as { x: number; z: number; underFireUntil: number } | null;
          const holders = document.querySelectorAll<HTMLElement>('[data-under-fire-seconds]');
          const pill = document.querySelector<HTMLElement>('[data-testid="under-fire"]');
          const zone = document.querySelector<HTMLElement>('[data-testid="safe-zone"]');
          const port = document.querySelector<HTMLElement>(mob ? '[data-testid="m-port"]' : '[data-testid="btn-port"]');
          const holder = holders[0];
          out.push({
            p: performance.now(),
            t: dbg.serverTime(),
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

// ZB-1 a ZB-4 en cada frame: nunca 2 indicadores ni la píldora con el aviso; el estado es el de la regla salvo en los
// ≤ 250 ms que siguen a un cambio (el HUD se sincroniza a 10 Hz); con la marca, el número es ceil(uf − t) ± 1, está en el
// texto con «Bajo fuego» y «N s», y sin marca no hay ninguno
function checkFrames(samples: Sample[], label: string): void {
  let changeAt = -Infinity;
  let prev: Sample['slot'] | null = null;
  for (const s of samples) {
    const want = expected(s);
    if (want !== prev) changeAt = s.p;
    prev = want;
    expect(s.holders, `${label}: un solo [data-under-fire-seconds]`).toBeLessThanOrEqual(1);
    expect(s.both, `${label}: la píldora y el aviso a la vez`).toBe(false);
    if (s.p - changeAt > 250) expect(s.slot, `${label}: estado en t = ${s.t.toFixed(2)} (uf ${s.uf.toFixed(2)}, r ${s.r.toFixed(1)})`).toBe(want);
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
  }
}

// El primer frame con el estado de después de caducar la marca, y cuánto tarda desde uf con el reloj del servidor
function expiryDelay(samples: Sample[], after: Sample['slot']): number {
  const marked = samples.find((s) => s.uf > s.t);
  expect(marked, 'hubo marca durante la muestra').toBeDefined();
  const uf = marked!.uf;
  const first = samples.find((s) => s.t >= uf && s.slot === after);
  expect(first, `apareció «${after}» tras caducar`).toBeDefined();
  // El frame anterior a uf todavía enseñaba la marca: el cambio no se adelanta
  const before = [...samples].reverse().find((s) => s.t < uf - 0.05);
  if (before) expect(before.slot).not.toBe(after);
  return (first!.t - uf) * 1000;
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
    const pillGone = expiryDelay(outside, 'none');
    console.log(`AC-254 (${tag.trim()}): cuenta ${shown.join(' → ')} · la píldora se va ${pillGone.toFixed(0)} ms después de uf`);
    expect(pillGone).toBeLessThanOrEqual(EXPIRY_MS);

    // Entrar bajo fuego: en el frame en que cruza los 110 m, «no te protege» (nunca «Zona segura» con la marca); al caducar
    // dentro, «Zona segura» (AC-255)
    const uf2 = await fireOnce(page);
    await sailTo(page, UNDER_FIRE.inside.x, UNDER_FIRE.inside.z);
    const entering = await sample(page, Math.max(0, (uf2 - (await page.evaluate(() => window.__SEA_BATTLE__!.serverTime()))) * 1000) + 1500, mobile);
    checkFrames(entering, 'al entrar');
    const cross = entering.find((s) => s.r <= SAFE_R);
    expect(cross, 'cruzó los 110 m con la marca').toBeDefined();
    expect(cross!.uf).toBeGreaterThan(cross!.t);
    const firstInside = entering.find((s) => s.slot === 'under-fire');
    expect(firstInside).toBeDefined();
    expect(firstInside!.p - cross!.p).toBeLessThanOrEqual(250);
    expect(entering.filter((s) => s.slot === 'protected' && s.uf > s.t + 0.25)).toEqual([]);
    const zoneBack = expiryDelay(entering, 'protected');
    console.log(`AC-255 (${tag.trim()}): «no te protege» ${(firstInside!.p - cross!.p).toFixed(0)} ms tras cruzar · «Zona segura» ${zoneBack.toFixed(0)} ms después de uf`);
    expect(zoneBack).toBeLessThanOrEqual(EXPIRY_MS);
  });

  test(`AC-253: la tienda abierta se cierra al caer bajo fuego; Puerto desactivado con la cuenta y la llama, su aviso sustituye al anterior y vuelve al caducar${tag}`, async ({ page }) => {
    test.setTimeout(180_000);
    await enterGame(page, server.url);
    await goTo(page, UNDER_FIRE.inside);
    const port = portButton(page, mobile);
    await expect(port).not.toHaveAttribute('data-port-block');
    await pressPort(page, mobile);
    await expect(page.getByTestId('shop')).toBeVisible();

    // Con la tienda abierta dispara (un ataque en curso): se cierra en el commit que trae la marca, y sale el aviso con N = 10
    const closing = page.evaluate(
      () =>
        new Promise<{ markAt: number; closedAt: number }>((resolve) => {
          const dbg = window.__SEA_BATTLE__!;
          let markAt = 0;
          const frame = () => {
            const s = dbg.me() as { underFireUntil: number };
            if (!markAt && s.underFireUntil > dbg.serverTime()) markAt = performance.now();
            if (markAt && !document.querySelector('[data-testid="shop"]')) return resolve({ markAt, closedAt: performance.now() });
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        })
    );
    const merchant = await merchantOf(page);
    await page.evaluate((id) => window.__SEA_BATTLE__!.runtime().client.attack(id), merchant.id);
    const { markAt, closedAt } = await closing;
    await page.evaluate(() => window.__SEA_BATTLE__!.runtime().client.cancelAttack());
    console.log(`AC-253 (${tag.trim()}): la tienda se cierra ${(closedAt - markAt).toFixed(0)} ms después de que el barco trae la marca`);
    // «En ese mismo snapshot»: el HUD se sincroniza a 10 Hz, así que como mucho un sync (100 ms) y un frame después
    expect(closedAt - markAt).toBeLessThanOrEqual(200);
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

    // Pulsarlo: el aviso con la N del momento, y otra pulsación no añade un 2.º (D125)
    await page.waitForTimeout(1200);
    await pressPort(page, mobile);
    const n1 = Number(await page.locator('[data-under-fire-seconds]').getAttribute('data-under-fire-seconds'));
    await expect(fireToasts(page)).toHaveCount(1);
    await expect(fireToasts(page)).toHaveText(new RegExp(`^Bajo fuego: el puerto abre tras (${n1}|${n1 + 1}) s sin disparos$`));
    await page.waitForTimeout(1200);
    await pressPort(page, mobile);
    const n2 = Number(await page.locator('[data-under-fire-seconds]').getAttribute('data-under-fire-seconds'));
    await expect(fireToasts(page)).toHaveCount(1);
    await expect(fireToasts(page)).toHaveText(new RegExp(`^Bajo fuego: el puerto abre tras (${n2}|${n2 + 1}) s sin disparos$`));
    expect(n2).toBeLessThan(n1);
    await expect(page.getByTestId('shop')).toHaveCount(0);

    // Al caducar, Puerto vuelve sin otra acción (≤ 200 ms con el reloj del servidor) y abre la tienda
    const uf = (await me(page))!.underFireUntil;
    const rest = await sample(page, Math.max(0, (uf - (await page.evaluate(() => window.__SEA_BATTLE__!.serverTime()))) * 1000) + 1000, mobile);
    const back = rest.find((s) => s.t >= uf && s.port === null && s.portDisabled === 'false');
    expect(back).toBeDefined();
    console.log(`AC-253 (${tag.trim()}): Puerto vuelve ${((back!.t - uf) * 1000).toFixed(0)} ms después de uf`);
    expect((back!.t - uf) * 1000).toBeLessThanOrEqual(EXPIRY_MS);
    expect(rest.filter((s) => s.t < uf - 0.05).every((s) => s.port === 'under-fire')).toBe(true);
    await pressPort(page, mobile);
    await expect(page.getByTestId('shop')).toBeVisible();
  });

  test(`AC-256: con 2 contextos, otro jugador dentro de la zona es atacable bajo fuego y «✕ No atacable» sin marca, en el panel y en Tab${tag}`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const ctxA = await browser.newContext(contextOptions(info));
    const ctxB = await browser.newContext(contextOptions(info));
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

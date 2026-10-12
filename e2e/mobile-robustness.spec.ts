// Móvil y robustez (plan de AC-108, bloque 2). Interacción real del jugador (toque, tecla, clic) y asertos sobre el
// observable: frames de WebSocket, cajas y clases del DOM. La API del cliente solo se usa para navegar al punto de partida.
import { Browser, expect, Page, test } from '@playwright/test';
import { PORTS } from '../playwright.config';
import { SHIP_CLASSES, SAFE_ZONE_RADIUS } from '../src/game/constants';
import { SHOWCASE_POINT } from '../server/scenarios';
import { clickWater, enterGame, me, ships, trackSocket, waitFor } from './helpers';
import { intentNames, sailTo } from './net';
import { startOwnServer } from './own-server';

const SHOWCASE = `http://localhost:${PORTS.showcase}`;
const SHIPYARD = `http://localhost:${PORTS.empty}`;
const SHOWCASE_MERCHANT = { x: -40, z: 195 }; // mercante quieto y sin IA de server/scenarios.ts

type Box = { x: number; y: number; width: number; height: number };
const boxesOverlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function arrive(page: Page, x: number, z: number, tolerance = 3, timeout = 45_000) {
  await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - x, s.z - z) < tolerance, timeout, 250);
}

const mobileContext = (browser: Browser, width: number, height: number) =>
  browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

// Navega hasta `spot` y devuelve el mercante del showcase visto en pantalla
async function showcaseMerchant(page: Page, spot: { x: number; z: number }) {
  await sailTo(page, spot.x, spot.z);
  await arrive(page, spot.x, spot.z);
  await page.waitForTimeout(700);
  const merchant = (await ships(page)).find((s) => s.kind === 'merchant' && s.screen && Math.hypot(s.x - SHOWCASE_MERCHANT.x, s.z - SHOWCASE_MERCHANT.z) < 5);
  expect(merchant?.screen, 'el mercante del showcase está en pantalla').toBeTruthy();
  return merchant!;
}

// Punto de pantalla a `gap` px CSS de la silueta de selección de un barco (envolvente convexa de la caja sb_pick
// proyectada, ASSET-SPEC §3), en la dirección (dx, dy) desde su centro. La distancia se mide aquí, no con el picking
// del runtime: el test no reutiliza la función que evalúa.
async function pointNearSilhouette(page: Page, id: string, gap: number, dir: [number, number]) {
  return page.evaluate(([shipId, px, dx, dy]) => {
    type Pt = { sx: number; sy: number };
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as {
      view: (id: string) => { ship: { x: number; z: number; heading: number }; model: { extras: { sb_pick: [number, number, number] } }; mesh: { position: { y: number } } } | undefined;
      projectInto: (x: number, y: number, z: number, out: Pt) => void;
    };
    const v = rt.view(shipId as string)!;
    const [hx, hy, hz] = v.model.extras.sb_pick;
    const c = Math.cos(v.ship.heading);
    const s = Math.sin(v.ship.heading);
    const corners: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const lx = i & 1 ? hx : -hx;
      const ly = i & 2 ? hy : 0;
      const lz = i & 4 ? hz : -hz;
      const p = { sx: 0, sy: 0 };
      rt.projectInto(v.ship.x + lx * c + lz * s, ly + v.mesh.position.y, v.ship.z - lx * s + lz * c, p);
      corners.push([p.sx, p.sy]);
    }
    // Envolvente convexa (cadena monótona)
    const pts = corners.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: number[][] = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper: number[][] = [];
    for (const p of pts.slice().reverse()) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    const distance = (x: number, y: number) => {
      let inside = true;
      let min = Infinity;
      for (let k = 0; k < hull.length; k++) {
        const [ax, ay] = hull[k];
        const [bx, by] = hull[(k + 1) % hull.length];
        if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0) inside = false;
        const ex = bx - ax;
        const ey = by - ay;
        const u = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
        min = Math.min(min, Math.hypot(ax + ex * u - x, ay + ey * u - y));
      }
      return inside ? 0 : min;
    };
    const cx = hull.reduce((acc, p) => acc + p[0], 0) / hull.length;
    const cy = hull.reduce((acc, p) => acc + p[1], 0) / hull.length;
    // Bisección sobre la semirrecta desde el centro: la distancia a un convexo crece de forma monótona hacia fuera
    let lo = 0;
    let hi = 500;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (distance(cx + dx * mid, cy + dy * mid) < px) lo = mid;
      else hi = mid;
    }
    const x = cx + dx * hi;
    const y = cy + dy * hi;
    const hit = document.elementFromPoint(x, y);
    return { x, y, distance: distance(x, y), onCanvas: !!hit?.closest('[data-testid="game-canvas"]') };
  }, [id, gap, dir[0], dir[1]] as const);
}

test.describe('Selección táctil @mobile', () => {
  test('AC-29: en 390×844, un toque a ≤ 24 px de la silueta de un barco lo selecciona sin enviar nada', async ({ page }) => {
    test.setTimeout(90_000);
    const net = trackSocket(page);
    await enterGame(page, SHOWCASE);
    // 60 m al norte del mercante: queda bajo el barco propio, con agua libre a su izquierda
    const merchant = await showcaseMerchant(page, { x: -40, z: 135 });
    const near = await pointNearSilhouette(page, merchant.id, 23, [-1, 0]);
    expect(near.onCanvas, 'el punto de toque cae sobre el canvas, no sobre el HUD').toBe(true);
    net.reset();
    await page.touchscreen.tap(near.x, near.y);
    await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', merchant.id);
    await page.waitForTimeout(600);
    expect(net.sent, 'seleccionar no genera tráfico').toEqual([]);

    // Contraste: a 36 px (1,5 × 24) el toque ya es agua: navega y no selecciona
    await page.locator('.hud-target__close').tap();
    await expect(page.getByTestId('target-frame')).toHaveCount(0);
    const far = await pointNearSilhouette(page, merchant.id, 36, [-1, 0]);
    expect(far.onCanvas).toBe(true);
    net.reset();
    await page.touchscreen.tap(far.x, far.y);
    await page.waitForTimeout(600);
    console.log(`AC-29: toque a ${near.distance.toFixed(1)} px → seleccionado sin tráfico · toque a ${far.distance.toFixed(1)} px → ${JSON.stringify(intentNames(net))}`);
    await expect(page.getByTestId('target-frame')).toHaveCount(0);
    expect(intentNames(net)).toEqual(['moveTo']);
  });

  test('AC-80 (844×390): tocar un barco lo selecciona, tocar el agua navega y los botones (Atacar ≥ 64 px, el resto ≥ 48 px) no se solapan con los paneles ni con el minimapa', async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await mobileContext(browser, 844, 390);
    try {
      const page = await ctx.newPage();
      const net = trackSocket(page);
      await enterGame(page, SHOWCASE);
      // 60 m al oeste del mercante: en horizontal queda a la derecha del barco propio, a media altura
      const merchant = await showcaseMerchant(page, { x: -100, z: 195 });
      net.reset();
      await page.touchscreen.tap(merchant.screen!.sx, merchant.screen!.sy);
      await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', merchant.id);

      const ids = ['m-attack', 'm-target', 'm-repair', 'm-port', 'player-frame', 'target-frame', 'minimap'];
      const boxes: Record<string, Box> = {};
      for (const id of ids) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, id).toBeTruthy();
        boxes[id] = box!;
      }
      console.log(`AC-80 (844×390): ${ids.map((id) => `${id} ${Math.round(boxes[id].width)}×${Math.round(boxes[id].height)}@${Math.round(boxes[id].x)},${Math.round(boxes[id].y)}`).join(' · ')}`);
      expect(boxes['m-attack'].width).toBeGreaterThanOrEqual(64);
      expect(boxes['m-attack'].height).toBeGreaterThanOrEqual(64);
      for (const id of ['m-target', 'm-repair', 'm-port']) {
        expect(boxes[id].width, id).toBeGreaterThanOrEqual(48);
        expect(boxes[id].height, id).toBeGreaterThanOrEqual(48);
      }
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) expect(boxesOverlap(boxes[ids[i]], boxes[ids[j]]), `${ids[i]} se solapa con ${ids[j]}`).toBe(false);
      }

      // Tocar el agua (a la izquierda del barco propio) navega
      const mine = (await me(page))!;
      await page.touchscreen.tap(mine.screen!.sx - 120, mine.screen!.sy);
      await page.waitForTimeout(600);
      expect(intentNames(net)).toEqual(['moveTo']);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Navegación y zona segura', () => {
  test('AC-19: S emite exactamente 1 stop, borra el destino y el barco frena hasta 0 con su tasa de frenado', async ({ page }) => {
    test.setTimeout(90_000);
    const net = trackSocket(page);
    await enterGame(page, SHIPYARD);
    const speed = () =>
      page.evaluate(() => {
        const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { myShipId: string; getShip: (id: string) => { speed: number; x: number; z: number } } };
        const s = rt.client.getShip(rt.client.myShipId);
        return { v: s.speed, x: s.x, z: s.z, t: performance.now() };
      });
    // Clic real en el agua lejos, a la derecha del barco
    await clickWater(page, 600, 0);
    const dest = await page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { clickMarker: { x: number; z: number } | null }).clickMarker);
    expect(dest).toBeTruthy();
    await waitFor(speed, (s) => s.v > 9, 15_000, 50);

    // Registra la velocidad renderizada en cada frame desde la pulsación
    await page.evaluate(() => {
      const w = window as unknown as { __SPEED__: { t: number; v: number }[] };
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { myShipId: string; getShip: (id: string) => { speed: number } } };
      w.__SPEED__ = [];
      const t0 = performance.now();
      const poll = () => {
        const v = rt.client.getShip(rt.client.myShipId).speed;
        w.__SPEED__.push({ t: performance.now() - t0, v });
        if (performance.now() - t0 < 6000) requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
    net.reset();
    await page.keyboard.press('KeyS');
    await page.waitForTimeout(6500);
    const samples = await page.evaluate(() => (window as unknown as { __SPEED__: { t: number; v: number }[] }).__SPEED__);
    const v0 = samples[0].v;
    const stopped = samples.find((s) => s.v === 0);
    // Pendiente de la frenada (regresión lineal) en el tramo entre 1 m/s y v0 − 1 m/s
    const mid = samples.filter((s) => s.v > 1 && s.v < v0 - 1);
    const n = mid.length;
    const mt = mid.reduce((a, s) => a + s.t, 0) / n;
    const mv = mid.reduce((a, s) => a + s.v, 0) / n;
    const slope = (mid.reduce((a, s) => a + (s.t - mt) * (s.v - mv), 0) / mid.reduce((a, s) => a + (s.t - mt) ** 2, 0)) * 1000;
    const end = await speed();
    await page.waitForTimeout(1500);
    const later = await speed();
    const marker = await page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { clickMarker: unknown }).clickMarker);
    const brake = SHIP_CLASSES.sloop.brake;
    console.log(`AC-19: ${JSON.stringify(intentNames(net))} · de ${v0.toFixed(1)} m/s a 0 en ${stopped?.t.toFixed(0)} ms · frenada ${(-slope).toFixed(2)} m/s² (clase: ${brake}) · a ${Math.hypot(later.x - dest!.x, later.z - dest!.z).toFixed(1)} m del destino`);
    expect(intentNames(net)).toEqual(['stop']);
    expect(stopped, 'la velocidad llega a 0').toBeTruthy();
    expect(-slope).toBeGreaterThan(brake * 0.85);
    expect(-slope).toBeLessThan(brake * 1.15);
    // El destino se borró: no retoma la marcha, sigue lejos del destino y el marcador desaparece
    expect(Math.hypot(later.x - end.x, later.z - end.z)).toBeLessThan(0.05);
    expect(Math.hypot(later.x - dest!.x, later.z - dest!.z)).toBeGreaterThan(20);
    expect(marker).toBeNull();
  });

  test('AC-65: el aviso "Zona segura" desaparece al salir del círculo de 110 m y reaparece al volver, en el mismo snapshot', async ({ page }) => {
    test.setTimeout(120_000);
    await enterGame(page, SHIPYARD);
    await expect(page.getByTestId('safe-zone')).toBeVisible();
    // En cada frame: distancia renderizada al puerto y presencia del aviso
    await page.evaluate((radius) => {
      const w = window as unknown as { __ZONE__: { t: number; out: boolean; shown: boolean }[] };
      w.__ZONE__ = [];
      let last = '';
      const poll = () => {
        const m = window.__SEA_BATTLE__?.me() as { x: number; z: number } | null;
        if (m) {
          const out = Math.hypot(m.x, m.z) > radius;
          const shown = !!document.querySelector('[data-testid="safe-zone"]');
          const key = `${out}${shown}`;
          if (key !== last) w.__ZONE__.push({ t: performance.now(), out, shown });
          last = key;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    }, SAFE_ZONE_RADIUS);
    const log = () => page.evaluate(() => (window as unknown as { __ZONE__: { t: number; out: boolean; shown: boolean }[] }).__ZONE__);

    await sailTo(page, 0, 170);
    await waitFor(log, (l) => l.some((e) => !e.shown), 45_000, 200);
    await page.waitForTimeout(500);
    await sailTo(page, 0, 75);
    await waitFor(log, (l) => l.length > 0 && l[l.length - 1].shown && !l[l.length - 1].out, 45_000, 200);
    const events = await log();
    // Momento en que el barco renderizado cruza el borde y momento en que cambia el aviso
    const first = (pred: (e: { out: boolean; shown: boolean }) => boolean, after = 0) => events.find((e) => e.t >= after && pred(e))!.t;
    const crossOut = first((e) => e.out);
    const hidden = first((e) => !e.shown);
    const crossIn = first((e) => !e.out, Math.max(crossOut, hidden));
    const shownAgain = first((e) => e.shown, Math.max(crossOut, hidden));
    console.log(`AC-65: sale ${crossOut.toFixed(0)} ms → aviso oculto ${(hidden - crossOut).toFixed(0)} ms después · entra ${crossIn.toFixed(0)} ms → aviso visible ${(shownAgain - crossIn).toFixed(0)} ms después · ${JSON.stringify(events.map((e) => ({ t: Math.round(e.t), out: e.out, shown: e.shown })))}`);
    // El HUD lee la posición renderizada a 10 Hz: el aviso cambia como mucho 1 snapshot (100 ms) + 1 ciclo del HUD
    // (100 ms) después de que el barco cruce el borde dibujado, y nunca antes (con la posición del servidor, sin
    // interpolar, cambiaría ~100 ms antes)
    for (const lag of [hidden - crossOut, shownAgain - crossIn]) {
      expect(lag).toBeGreaterThanOrEqual(0);
      expect(lag).toBeLessThanOrEqual(200);
    }
  });
});

test.describe('Vida baja', () => {
  test('AC-41: el botón Reparar pulsa con vida < 30 % y no pulsa con vida ≥ 30 %', async ({ page }) => {
    test.setTimeout(180_000);
    // Servidor propio con el showcase: el pirata quieto del punto de captura dispara al acabar la protección y el
    // daño baja la vida poco a poco (~12 HP/s); aislado, no altera el pirata de los servidores compartidos
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'showcase' });
    try {
      await enterGame(page, server.url);
      // Cada cambio del HUD: vida mostrada y clase del botón Reparar del mismo commit
      await page.evaluate(() => {
        const w = window as unknown as { __HP__: { hp: number; max: number; pulse: boolean; alive: boolean }[] };
        w.__HP__ = [];
        const hud = document.querySelector('[data-testid="hud"]')!;
        const read = () => {
          const text = document.querySelector('[data-testid="player-hp-text"]')?.textContent ?? '';
          const [hp, max] = text.replace(/\./g, '').split('/').map(Number);
          const btn = document.querySelector('[data-testid="btn-repair"]');
          if (!btn || !max) return;
          const s = { hp, max, pulse: btn.classList.contains('is-pulse'), alive: !hud.classList.contains('is-dead') };
          const last = w.__HP__[w.__HP__.length - 1];
          if (!last || last.hp !== s.hp || last.pulse !== s.pulse || last.alive !== s.alive) w.__HP__.push(s);
        };
        read();
        new MutationObserver(read).observe(hud, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
      });
      const samples = () => page.evaluate(() => (window as unknown as { __HP__: { hp: number; max: number; pulse: boolean; alive: boolean }[] }).__HP__);
      await sailTo(page, SHOWCASE_POINT.x, SHOWCASE_POINT.z);
      await waitFor(samples, (l) => l.filter((s) => s.alive && s.hp / s.max < 0.3).length >= 2, 150_000, 500);
      await sailTo(page, 0, 75); // huye a la zona segura
      const list = (await samples()).filter((s) => s.alive);
      const low = list.filter((s) => s.hp / s.max < 0.3);
      const high = list.filter((s) => s.hp / s.max >= 0.3);
      console.log(`AC-41: ${list.map((s) => `${s.hp}/${s.max}${s.pulse ? ' (pulsa)' : ''}`).join(' → ')}`);
      expect(high.length).toBeGreaterThan(1);
      expect(low.length).toBeGreaterThanOrEqual(2);
      expect(high.every((s) => !s.pulse), 'con vida ≥ 30 % no pulsa').toBe(true);
      expect(low.every((s) => s.pulse), 'con vida < 30 % pulsa').toBe(true);
    } finally {
      await server.kill();
    }
  });
});

test.describe('Desconexión del servidor', () => {
  test('AC-99: al caer el servidor, overlay y 3 reintentos (1, 2 y 4 s); si vuelve, entra sin recargar; si no, "Reintentar" y "Salir" funcionan', async ({ page }) => {
    test.setTimeout(180_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0' });
    try {
      // Instante de cada intento de conexión (un WebSocket nuevo por intento) y del overlay, en el reloj de la página
      await page.addInitScript(() => {
        const w = window as unknown as { __WS__: number[]; __OVERLAY__: { t: number; state: string | null }[] };
        w.__WS__ = [];
        w.__OVERLAY__ = [];
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            w.__WS__.push(performance.now());
          }
        };
        let last: string | null = null;
        new MutationObserver(() => {
          const state = document.querySelector('[data-testid="connection-overlay"]')?.getAttribute('data-state') ?? null;
          if (state !== last) w.__OVERLAY__.push({ t: performance.now(), state });
          last = state;
        }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
      });
      await enterGame(page, server.url);
      await page.evaluate(() => ((window as unknown as { __SAME_PAGE__: boolean }).__SAME_PAGE__ = true));
      const samePage = () => page.evaluate(() => (window as unknown as { __SAME_PAGE__?: boolean }).__SAME_PAGE__ === true);
      const trace = () => page.evaluate(() => {
        const w = window as unknown as { __WS__: number[]; __OVERLAY__: { t: number; state: string | null }[] };
        return { ws: w.__WS__.slice(), overlay: w.__OVERLAY__.slice() };
      });
      const overlay = page.getByTestId('connection-overlay');

      // 1) Cae y no vuelve: overlay, 3 reintentos a 1, 2 y 4 s y después "Reintentar" y "Salir"
      const before = await trace();
      await server.kill();
      await expect(overlay).toHaveAttribute('data-state', 'reconnecting');
      await expect(overlay).toContainText('Sin conexión');
      await expect(overlay).toContainText('Reintentando (1/3)…');
      await expect(overlay).toHaveAttribute('data-state', 'failed', { timeout: 15_000 });
      await expect(page.getByTestId('btn-retry')).toBeVisible();
      await expect(page.getByTestId('btn-exit')).toBeVisible();
      await page.waitForTimeout(2000); // ningún 4.º intento
      const failed = await trace();
      const lostAt = failed.overlay.find((o) => o.t > (before.overlay.at(-1)?.t ?? 0) && o.state === 'reconnecting')!.t;
      const attempts = failed.ws.filter((t) => t > lostAt);
      const gaps = attempts.map((t, i) => t - (i === 0 ? lostAt : attempts[i - 1]));
      console.log(`AC-99: intentos a ${gaps.map((g) => g.toFixed(0)).join(' / ')} ms del anterior (desde la caída)`);
      expect(attempts).toHaveLength(3);
      [1000, 2000, 4000].forEach((expected, i) => {
        expect(gaps[i]).toBeGreaterThan(expected - 50);
        expect(gaps[i]).toBeLessThan(expected + 300);
      });

      // 2) "Reintentar" con el servidor de vuelta: entra sin recargar la página
      await server.start();
      await page.getByTestId('btn-retry').click();
      await expect(overlay).toHaveCount(0, { timeout: 15_000 });
      await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true && !!window.__SEA_BATTLE__.me(), null, { timeout: 15_000 });
      expect(await samePage()).toBe(true);

      // 3) Cae y vuelve solo: reconecta durante los reintentos automáticos, sin recargar ni pasar por "failed"
      const mark = (await trace()).overlay.length;
      await server.kill();
      await expect(overlay).toHaveAttribute('data-state', 'reconnecting');
      const t0 = Date.now();
      await server.start();
      await expect(overlay).toHaveCount(0, { timeout: 15_000 });
      await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true && !!window.__SEA_BATTLE__.me(), null, { timeout: 15_000 });
      const back = (await trace()).overlay.slice(mark).map((o) => o.state);
      console.log(`AC-99: servidor relanzado en ${Date.now() - t0} ms · estados del overlay ${JSON.stringify(back)}`);
      expect(back).not.toContain('failed');
      expect(await samePage()).toBe(true);

      // 4) "Salir" vuelve a la landing. La landing la sirve el mismo proceso: se relanza antes del clic, sin que el
      // cliente reconecte (en "failed" ya no hay reintentos automáticos)
      await server.kill();
      await expect(overlay).toHaveAttribute('data-state', 'failed', { timeout: 15_000 });
      await server.start();
      await expect(overlay).toHaveAttribute('data-state', 'failed');
      await page.getByTestId('btn-exit').click();
      await page.waitForURL((u) => u.pathname === '/', { timeout: 15_000 });
      await expect(page.getByTestId('cta-guest')).toBeVisible();
    } finally {
      await server.kill();
    }
  });
});

// Bucle principal (plan de AC-108, bloque 1): seleccionar → atacar → hundir → oro → mejorar → morir. Cada test hace la
// interacción real del jugador (clic, tecla) y aserta el observable del AC (frames de WebSocket, DOM o contadores);
// la API del cliente solo se usa para navegar hasta el punto de partida.
import { expect, Page, test } from '@playwright/test';
import { PORTS } from '../playwright.config';
import { TARGET_FAN, TARGETS_POINT } from '../server/scenarios';
import { CANNON_LEVELS, SHIP_CLASSES } from '../src/game/constants';
import { commits, DebugShip, enterGame, hud, installCommitCounter, me, ships, trackSocket, waitFor } from './helpers';
import { events, intentNames, intents, sailTo, shipName, volleysBy } from './net';
import { OwnServer, startOwnServer } from './own-server';

const SHIPYARD = `http://localhost:${PORTS.empty}`; // escenario "shipyard": 2 000 de oro y sin NPC

const goldOf = async (page: Page, testId: string) => Number(((await page.getByTestId(testId).textContent()) ?? '').replace(/\D/g, ''));

async function arrive(page: Page, x: number, z: number, tolerance = 3, timeout = 45_000) {
  await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - x, s.z - z) < tolerance, timeout, 250);
}

// Servidor propio con el escenario "targets" (4 mercantes quietos y sin IA a 40, 90, 140 y 170 m de TARGETS_POINT):
// estos tests disparan, hunden y hacen PvP, y así no alteran los servidores compartidos
let own: OwnServer;
test.beforeAll(async () => {
  test.setTimeout(90_000);
  own = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'targets' });
});
test.afterAll(async () => {
  await own?.kill();
});

type FanDistance = (typeof TARGET_FAN)[number]['d'];

// Navega a TARGETS_POINT, espera a que el barco quede quieto y devuelve los mercantes del abanico por distancia
async function atTargets(page: Page): Promise<Record<FanDistance, DebugShip>> {
  await sailTo(page, TARGETS_POINT.x, TARGETS_POINT.z);
  await arrive(page, TARGETS_POINT.x, TARGETS_POINT.z, 2.5);
  let last = (await me(page))!;
  const moved = async () => {
    await page.waitForTimeout(250);
    const now = (await me(page))!;
    const d = Math.hypot(now.x - last.x, now.z - last.z);
    last = now;
    return d;
  };
  await waitFor(moved, (d) => d < 0.02, 10_000, 0);
  await page.mouse.move(5, 450); // sin hover sobre barcos
  const list = await ships(page);
  const fan = {} as Record<FanDistance, DebugShip>;
  for (const t of TARGET_FAN) {
    const s = list.find((x) => x.kind === 'merchant' && x.state === 'alive' && Math.hypot(x.x - t.x, x.z - t.z) < 1);
    expect(s, `mercante del abanico a ${t.d} m`).toBeTruthy();
    fan[t.d] = s!;
  }
  return fan;
}

// Selecciona un barco con un clic real sobre él
async function clickShip(page: Page, id: string) {
  const s = (await ships(page)).find((x) => x.id === id);
  expect(s?.screen, `${id} en pantalla`).toBeTruthy();
  await page.mouse.click(s!.screen!.sx, s!.screen!.sy);
  await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', id);
}

// Ataque aceptado por el servidor: el snapshot propio trae el objetivo
const attacking = (page: Page, id: string | null, timeout = 3000) => waitFor(() => me(page), (s) => !!s && s.targetId === id, timeout, 50);

// Punto de pantalla de un punto del agua, comprobando que no cae sobre un barco ni sobre el HUD
async function waterPoint(page: Page, x: number, z: number) {
  const p = await page.evaluate(([wx, wz]) => {
    const rt = window.__SEA_BATTLE__!.runtime();
    const sp = rt.project(wx, wz)!;
    const hit = document.elementFromPoint(sp.sx, sp.sy);
    return { ...sp, ship: rt.pick(sp.sx, sp.sy, false), onCanvas: !!hit?.closest('[data-testid="game-canvas"]') };
  }, [x, z]);
  expect(p.ship, 'el punto no cae sobre un barco').toBeNull();
  expect(p.onCanvas, 'el punto cae sobre el canvas').toBe(true);
  return p;
}

test.describe('Selección y ataque', () => {
  test('AC-27: con NPC atacables a 40, 90, 140 y 170 m, Tab ×4 recorre 40 → 90 → 140 → 40 m sin enviar nada', async ({ page }) => {
    test.setTimeout(90_000);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const fan = await atTargets(page);
    // Solo el abanico: los barcos de jugadores de otros tests salen a los 10 s y podrían ser atacables
    await waitFor(() => ships(page), (l) => l.filter((s) => s.kind === 'player').length === 1, 15_000, 250);
    const mine = (await me(page))!;
    console.log(`AC-27: distancias reales ${TARGET_FAN.map((t) => Math.hypot(fan[t.d].x - mine.x, fan[t.d].z - mine.z).toFixed(1)).join(' / ')} m`);
    net.reset();
    const expected = [fan[40], fan[90], fan[140], fan[40]];
    for (const target of expected) {
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', target.id);
    }
    await page.waitForTimeout(500);
    expect(net.sent).toEqual([]);
  });

  test('AC-28: Esc ×2 con un objetivo atacado: la 1.ª cancela el ataque (1 cancelAttack, la selección sigue) y la 2.ª deselecciona sin tráfico', async ({ page }) => {
    test.setTimeout(90_000);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const target = (await atTargets(page))[90]; // fuera de alcance: el ataque queda activo sin dañar al mercante
    await clickShip(page, target.id);
    await page.keyboard.press('Space');
    await attacking(page, target.id);

    net.reset();
    await page.keyboard.press('Escape');
    await attacking(page, null);
    await expect(page.getByTestId('action-state')).toHaveAttribute('data-state', 'idle');
    expect(intentNames(net)).toEqual(['cancelAttack']);
    await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', target.id);

    net.reset();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('target-frame')).toHaveCount(0);
    expect((await hud(page)).selectedId).toBeNull();
    await page.waitForTimeout(500);
    expect(net.sent).toEqual([]);
  });

  test('AC-37: con un ataque activo contra el objetivo seleccionado, Espacio lo cancela con 1 cancelAttack y la selección sigue', async ({ page }) => {
    test.setTimeout(90_000);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const target = (await atTargets(page))[90];
    await clickShip(page, target.id);
    net.reset();
    await page.keyboard.press('Space');
    await attacking(page, target.id);
    expect(intents(net)).toEqual([{ name: 'attack', data: { targetId: target.id } }]);

    net.reset();
    await page.keyboard.press('Space');
    await attacking(page, null);
    await page.waitForTimeout(300);
    expect(intentNames(net)).toEqual(['cancelAttack']);
    expect((await hud(page)).selectedId).toBe(target.id);
    await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', target.id);
    await expect(page.getByTestId('action-state')).toHaveAttribute('data-state', 'idle');
  });

  test('AC-17: navegando y atacando, un clic en el agua reemplaza el destino (1 moveTo, 0 cancelAttack) y la selección y el ataque siguen activos', async ({ page }) => {
    test.setTimeout(90_000);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const myId = (await me(page))!.id;
    const target = (await atTargets(page))[40]; // en alcance (60 m)
    await clickShip(page, target.id);
    await page.keyboard.press('Space');
    await waitFor(async () => volleysBy(net, myId).length, (n) => n > 0, 6000, 100);
    // Los dos destinos quedan a < 60 m del objetivo: el ataque puede seguir disparando
    const first = { x: 0, z: 180 };
    const second = { x: 10, z: 120 };
    const p1 = await waterPoint(page, first.x, first.z);
    await page.mouse.click(p1.sx, p1.sy);
    await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - TARGETS_POINT.x, s.z - TARGETS_POINT.z) > 3, 5000, 50); // navegando

    const p2 = await waterPoint(page, second.x, second.z);
    net.reset();
    await page.mouse.click(p2.sx, p2.sy);
    await page.waitForTimeout(300);
    expect(intentNames(net)).toEqual(['moveTo']);
    const sent = intents(net)[0].data as { x: number; z: number };
    expect(Math.hypot(sent.x - second.x, sent.z - second.z)).toBeLessThan(1.5);
    // El barco va al destino nuevo, y durante el trayecto el ataque y la selección siguen
    const after = volleysBy(net, myId).length;
    await arrive(page, second.x, second.z, 3, 20_000);
    expect((await me(page))!.targetId).toBe(target.id);
    expect((await hud(page)).selectedId).toBe(target.id);
    await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', target.id);
    await waitFor(async () => volleysBy(net, myId).length, (n) => n > after, 6000, 100);
    console.log(`AC-17: intenciones tras el clic ${JSON.stringify(intentNames(net))} · andanadas después del clic ${volleysBy(net, myId).length - after}`);
    expect(intentNames(net).filter((n) => n !== 'moveTo')).toEqual([]);
    await page.keyboard.press('Escape'); // que el barco no siga disparando cuando se cierre la pestaña
  });

  test('AC-31: con el objetivo fuera de alcance, Espacio no dispara y el HUD dice "Fuera de alcance"; al entrar en alcance dispara sin otra orden de ataque', async ({ page }) => {
    test.setTimeout(90_000);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const myId = (await me(page))!.id;
    const target = (await atTargets(page))[90];
    await clickShip(page, target.id);
    net.reset();
    await page.keyboard.press('Space');
    await attacking(page, target.id);
    await expect(page.getByTestId('action-state')).toHaveAttribute('data-state', 'armed');
    await expect(page.getByTestId('action-state')).toContainText('Fuera de alcance');
    await expect(page.getByTestId('target-range')).toHaveText('· ✕ Fuera de alcance');
    // Más de una recarga (4 s) sin disparar
    await page.waitForTimeout(CANNON_LEVELS[0].reload * 1000 + 500);
    expect(volleysBy(net, myId)).toEqual([]);

    // Se acerca hasta quedar a 45 m (preparación: la navegación no es una orden de ataque)
    await sailTo(page, target.x + 45, target.z);
    await waitFor(async () => volleysBy(net, myId).length, (n) => n > 0, 20_000, 100);
    const volley = volleysBy(net, myId)[0];
    const range = volley.type === 'volley' ? Math.hypot(volley.to.x - volley.from.x, volley.to.z - volley.from.z) : Infinity;
    console.log(`AC-31: primera andanada a ${range.toFixed(1)} m · intenciones desde Espacio ${JSON.stringify(intentNames(net))}`);
    expect(volley.type === 'volley' && volley.targetId).toBe(target.id);
    expect(range).toBeLessThanOrEqual(CANNON_LEVELS[0].range + 1);
    expect(intentNames(net).filter((n) => n === 'attack')).toHaveLength(1);
    expect(intentNames(net).filter((n) => n !== 'attack' && n !== 'moveTo')).toEqual([]);
    await expect(page.getByTestId('action-state')).toHaveAttribute('data-state', 'firing');
    await page.keyboard.press('Escape');
  });
});

test.describe('Botín', () => {
  test('AC-58: al hundir un NPC, el HUD muestra "+N oro" y el contador actualizado ≤ 200 ms después de llegar el frame con el botín', async ({ page }) => {
    test.setTimeout(120_000);
    await enterGame(page, own.url);
    const gold0 = await goldOf(page, 'player-gold');
    // El mercante de 140 m, que ningún otro test daña: el botín es la recompensa entera, sin repartir (GDD §10)
    const target = (await atTargets(page))[140];
    await sailTo(page, target.x, target.z - 45);
    await arrive(page, target.x, target.z - 45, 2.5);
    // Reloj de la página: llegada del frame con el botín propio y cambios del panel de oro
    await page.evaluate(() => {
      const w = window as unknown as { __LOOT__: { t: number; gold: number }[]; __GOLD__: { t: number; counter: string; gain: string | null }[] };
      w.__LOOT__ = [];
      w.__GOLD__ = [];
      const rt = window.__SEA_BATTLE__!.runtime();
      const client = rt.client;
      client.onFrame((f) => {
        const mine = client.player?.id ?? client.welcome?.playerId;
        for (const e of f.e ?? []) if (e.type === 'loot' && e.playerId === mine) w.__LOOT__.push({ t: performance.now(), gold: e.gold });
      });
      const panel = document.querySelector('[data-testid="player-gold-panel"]')!;
      new MutationObserver(() => {
        w.__GOLD__.push({ t: performance.now(), counter: panel.querySelector('[data-testid="player-gold"]')?.textContent ?? '', gain: panel.querySelector('.hud-gold__gain')?.textContent ?? null });
      }).observe(panel, { subtree: true, childList: true, characterData: true });
    });
    await clickShip(page, target.id);
    await page.keyboard.press('Space');
    const loot = await waitFor(() => page.evaluate(() => (window as unknown as { __LOOT__: { t: number; gold: number }[] }).__LOOT__), (l) => l.length > 0, 60_000, 200);
    await page.waitForTimeout(500);
    const changes = await page.evaluate(() => (window as unknown as { __GOLD__: { t: number; counter: string; gain: string | null }[] }).__GOLD__);
    const { t, gold } = loot[0];
    expect(gold).toBe(SHIP_CLASSES.merchant.reward);
    const expectedCounter = gold0 + gold;
    const counterAt = changes.find((c) => c.t >= t && Number(c.counter.replace(/\D/g, '')) === expectedCounter)?.t;
    const gainAt = changes.find((c) => c.t >= t && c.gain === `+${gold}`)?.t;
    console.log(`AC-58: botín +${gold} · contador ${gold0} → ${expectedCounter} a ${counterAt !== undefined ? (counterAt - t).toFixed(0) : '—'} ms · "+${gold}" a ${gainAt !== undefined ? (gainAt - t).toFixed(0) : '—'} ms del frame`);
    expect(counterAt).toBeDefined();
    expect(gainAt).toBeDefined();
    expect(counterAt! - t).toBeLessThanOrEqual(200);
    expect(gainAt! - t).toBeLessThanOrEqual(200);
  });
});

// PvP en el servidor propio, fuera de la zona segura, a 40 m (alcance 60 m)
const PVP = { a: { x: -60, z: -160 }, b: { x: -60, z: -200 } };

// Lleva a los dos jugadores a sus puestos y espera a que acabe la protección (15 s desde que zarpan): PvP solo sin ella
async function pvpReady(a: Page, b: Page) {
  await sailTo(a, PVP.a.x, PVP.a.z);
  await sailTo(b, PVP.b.x, PVP.b.z);
  await arrive(a, PVP.a.x, PVP.a.z);
  await arrive(b, PVP.b.x, PVP.b.z);
  for (const p of [a, b]) {
    await waitFor(() => p.evaluate(() => ({ me: window.__SEA_BATTLE__!.me() as { protectedUntil: number }, now: window.__SEA_BATTLE__!.serverTime() })), (v) => v.me.protectedUntil <= v.now, 20_000, 250);
  }
}

test.describe('Muerte', () => {
  test('AC-62: hundido por otro jugador, la tarjeta dice "por <su nombre>" y "−N oro" con el 10 % exacto del oro que tenía', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();
      const netA = trackSocket(a);
      await enterGame(a, own.url);
      await enterGame(b, own.url);
      const idA = (await me(a))!.id;
      const idB = (await me(b))!.id;
      const gold0 = await goldOf(a, 'player-gold');
      // Un jugador como verdugo: su nombre ("Invitado XXXX") cambia en cada corrida, así que la tarjeta no puede acertarlo de casualidad
      await pvpReady(a, b);
      await clickShip(b, idA);
      await b.keyboard.press('Space');
      await expect(a.getByTestId('death-card')).toBeVisible({ timeout: 120_000 });

      const sunk = events(netA).find((e) => e.type === 'sunk' && e.shipId === idA);
      expect(sunk && sunk.type === 'sunk' && sunk.byShipId, 'el evento de hundimiento propio nombra al verdugo').toBe(idB);
      const killer = shipName(netA, idB);
      expect(killer).toBe((await me(b))!.name);
      const lost = Math.floor(gold0 / 10); // 10 % (GDD §12), redondeado hacia abajo como en el ejemplo de 455 → 45
      const by = (await a.getByTestId('death-by').textContent())!.replace(/\s+/g, ' ').trim();
      const goldLine = (await a.getByTestId('death-gold').textContent())!.trim();
      console.log(`AC-62: oro antes ${gold0} · tarjeta "${by}" · "${goldLine}" · hundido por ${idB} (${killer})`);
      expect(by).toBe(`por ${killer}`);
      expect(goldLine).toBe(`−${lost} oro`);
      // El contador del HUD baja lo mismo
      await waitFor(() => goldOf(a, 'player-gold'), (g) => g === gold0 - lost, 3000, 50);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

test.describe('Puerto', () => {
  test('AC-67: con oro, comprar Cañones N2 por la UI resta 500 y da alcance 70 m y recarga 3,5 s; con 400 de oro el botón está desactivado y no envía nada', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();
      const netA = trackSocket(a);
      const netB = trackSocket(b);
      await enterGame(a, SHIPYARD);
      await enterGame(b, SHIPYARD);
      const meA = (await me(a))!;
      const meB = (await me(b))!;
      expect(await goldOf(a, 'player-gold')).toBe(2000);

      // B se coloca a 65 m de A en el mismo anillo del puerto (zona segura): fuera del alcance N1 (60 m) y dentro del
      // N2 (70 m). Así el alcance nuevo se ve en el panel del objetivo de A
      const r = Math.hypot(meA.x, meA.z);
      const phi = 2 * Math.asin(65 / (2 * r));
      const spot = { x: meA.x * Math.cos(phi) - meA.z * Math.sin(phi), z: meA.x * Math.sin(phi) + meA.z * Math.cos(phi) };
      await sailTo(b, spot.x, spot.z);
      await arrive(b, spot.x, spot.z, 2.5);
      await a.waitForTimeout(500);
      const seen = (await ships(a)).find((s) => s.id === meB.id)!;
      const gap = Math.hypot(seen.x - meA.x, seen.z - meA.z);
      expect(gap).toBeGreaterThan(61);
      expect(gap).toBeLessThan(69);
      await a.mouse.click(seen.screen!.sx, seen.screen!.sy);
      await expect(a.getByTestId('target-frame')).toHaveAttribute('data-target-id', meB.id);
      await expect(a.getByTestId('target-range')).toHaveText('· ✕ Fuera de alcance');

      // Compra con clic real en el botón Puerto y en Mejorar
      await a.getByTestId('btn-port').click();
      await expect(a.getByTestId('shop')).toBeVisible();
      const buy = a.getByTestId('buy-cannons-2');
      await expect(buy).toBeEnabled();
      netA.reset();
      await buy.click();
      await waitFor(() => goldOf(a, 'shop-gold'), (g) => g === 1500, 3000, 50);
      expect(await goldOf(a, 'player-gold')).toBe(1500);
      const card = a.getByTestId('shop-cannons');
      await expect(card).toContainText('Nivel 2/3');
      await expect(card).toContainText('Alcance 70 →');
      await expect(card).toContainText('Recarga 3,5 →');
      expect(intents(netA)).toEqual([{ name: 'buy', data: { itemId: 'cannons:2' } }]);
      await a.keyboard.press('Escape');
      await expect(a.getByTestId('shop')).toHaveCount(0);
      await expect(a.getByTestId('target-range')).toHaveText('· ✓ En alcance');
      console.log(`AC-67: B a ${gap.toFixed(1)} m de A · oro 2000 → 1500 · intenciones ${JSON.stringify(intents(netA))}`);

      // B se queda con 400 (Casco N2 + N3 = 1 600): Cañones N2 cuesta 500
      await b.getByTestId('btn-port').click();
      await b.getByTestId('buy-hull-2').click();
      await waitFor(() => goldOf(b, 'shop-gold'), (g) => g === 1600, 3000, 50);
      await b.getByTestId('buy-hull-3').click();
      await waitFor(() => goldOf(b, 'shop-gold'), (g) => g === 400, 3000, 50);
      const blocked = b.getByTestId('buy-cannons-2');
      await expect(blocked).toBeDisabled();
      await expect(b.getByTestId('shop-cannons')).toContainText('Te faltan 100');
      netB.reset();
      await blocked.click({ force: true });
      await b.waitForTimeout(700);
      expect(intents(netB).filter((i) => i.name === 'buy')).toEqual([]);
      expect(await goldOf(b, 'shop-gold')).toBe(400);
      await expect(b.getByTestId('shop-cannons')).toContainText('Nivel 1/3');
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('AC-66: el botón Puerto está activo en la zona segura y fuera está desactivado, con su explicación', async ({ page }) => {
    test.setTimeout(120_000);
    await enterGame(page, SHIPYARD);
    const port = page.getByTestId('btn-port');
    await expect(port).toBeEnabled();

    await sailTo(page, 0, 170);
    await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x, s.z) > 125, 45_000, 250);
    await expect(port).toBeDisabled();
    await expect(port).toHaveAttribute('title', 'Solo en la zona segura');
    await expect(page.getByTestId('m-port')).toHaveAttribute('title', 'Solo en la zona segura');
    await port.click({ force: true });
    await page.keyboard.press('KeyP');
    await expect(page.getByTestId('toasts')).toContainText('El puerto solo abre en la zona segura');
    await expect(page.getByTestId('shop')).toHaveCount(0);

    // De vuelta en la zona se activa y un clic abre la tienda
    await sailTo(page, 0, 75);
    await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x, s.z) < 100, 45_000, 250);
    await expect(port).toBeEnabled();
    await expect(port).toHaveAttribute('title', 'Puerto (P)');
    await port.click();
    await expect(page.getByTestId('shop')).toBeVisible();
  });
});

test.describe('Rendimiento en combate @perf', () => {
  test('AC-85: 20 s de combate continuo (dos jugadores disparándose) con ≤ 10 commits/s de media', async ({ browser }) => {
    test.setTimeout(150_000);
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();
      await installCommitCounter(a);
      const netA = trackSocket(a);
      await enterGame(a, own.url);
      await enterGame(b, own.url);
      const idA = (await me(a))!.id;
      const idB = (await me(b))!.id;
      await pvpReady(a, b);
      // Cada uno selecciona al otro con un clic y ataca con Espacio
      for (const [p, target] of [[a, idB], [b, idA]] as const) {
        await clickShip(p, target);
        await p.keyboard.press('Space');
      }
      await waitFor(async () => volleysBy(netA, idA).length > 0 && volleysBy(netA, idB).length > 0, (ok) => ok, 10_000, 100);
      await a.mouse.move(5, 450); // fuera del HUD y de los barcos

      const c0 = await commits(a);
      const v0 = { mine: volleysBy(netA, idA).length, theirs: volleysBy(netA, idB).length };
      await a.waitForTimeout(20_000);
      const total = (await commits(a)) - c0;
      const rate = total / 20;
      const shot = volleysBy(netA, idA).length - v0.mine;
      const received = volleysBy(netA, idB).length - v0.theirs;
      const [hpA, hpB] = [(await me(a))!, (await me(b))!];
      console.log(`AC-85: ${rate.toFixed(2)} commits/s · andanadas en 20 s: A ${shot}, B ${received} · vida A ${hpA.hp}/${hpA.maxHp}, B ${hpB.hp}/${hpB.maxHp}`);
      // Combate continuo: los dos dispararon cada recarga (4 s) durante toda la ventana
      expect(shot).toBeGreaterThanOrEqual(4);
      expect(received).toBeGreaterThanOrEqual(4);
      expect(hpA.state).toBe('alive');
      expect(total, 'el contador está vivo: la vida de los dos paneles cambió').toBeGreaterThan(0);
      expect(rate).toBeLessThanOrEqual(10);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

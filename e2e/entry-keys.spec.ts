// O-54 (AC-193 c, AC-118 y AC-26): mientras la portada de la entrada tapa el juego, ninguna tecla hace nada; en cuanto se
// va, las mismas teclas funcionan como siempre. El GLB propio se retiene con page.route y el tope de la entrada se alarga a
// 10 s, como en ship-glb.spec.ts (un frame de SwiftShader puede pasar de 0,5 s): así la portada sigue puesta mientras se
// pulsan las teclas, y se comprueba que lo sigue en el momento de medir. Va en su propio servidor con el escenario
// "targets" (mercantes quietos y sin IA): con los NPC del servidor compartido, el más cercano a la reaparición queda a veces
// a más de los 150 m de Tab, y Tab no tendría a quién elegir al irse la portada
import fs from 'fs';
import path from 'path';
import { expect, Page, test } from '@playwright/test';
import { TAB_TARGET_RADIUS } from '../src/game/constants';
import { C2S } from '../src/game/protocol';
import { entryOf, hud, me, ships, trackSocket, waitFor } from './helpers';
import { intents, sailTo } from './net';
import { OwnServer, startOwnServer } from './own-server';

const URL_HELD = '/models/test/ship_sloop_held.glb';
const FIXTURE = path.join(__dirname, 'fixtures', 'ship_sloop_etc1s_meshopt.glb');
// Dentro de la zona segura (a 90 m del puerto, con SAFE_ZONE_RADIUS = 110: P abre el Astillero) y a tiro de Tab de 2
// mercantes del abanico de "targets" (TARGET_FAN): el de (40, 150) a 72 m y el de (−90, 150) a 108 m. Ninguno queda a los
// 60 m del cañón: no se hunden de una repetición a otra
const POST = { x: 0, z: 90 };

// La vista y el foco del documento
const view = (page: Page) =>
  page.evaluate(() => {
    const rt = window.__SEA_BATTLE__!.runtime();
    const focus = document.activeElement;
    return {
      mode: rt.freeView.mode,
      x: rt.focusX,
      z: rt.focusZ,
      focus: focus === document.body ? 'body' : `${focus?.tagName ?? 'null'}${focus?.getAttribute('data-testid') ? `#${focus.getAttribute('data-testid')}` : ''}`
    };
  });

// Lo que Tab puede elegir (cycleTarget, hud-logic.ts): NPC a flote a ≤ TAB_TARGET_RADIUS del barco propio. Los jugadores
// no cuentan: en la zona segura no son atacables
const tabTargets = async (page: Page) => {
  const mine = (await me(page))!;
  return (await ships(page))
    .filter((s) => s.kind !== 'player' && s.state === 'alive' && Math.hypot(s.x - mine.x, s.z - mine.z) <= TAB_TARGET_RADIUS)
    .map((s) => s.id);
};

// El aviso con que Espacio rechaza un objetivo que no se puede atacar (GameApp, toggleAttack)
const refusedOf = async (page: Page) =>
  ((await hud(page)).toasts as { text: string }[]).some((t) => t.text === 'No puedes atacar ese objetivo');

// Las teclas de O-54: ArrowRight mantenida 400 ms, Tab, Espacio, S, R y P
async function pressAll(page: Page): Promise<void> {
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  for (const key of ['Tab', 'Space', 'KeyS', 'KeyR', 'KeyP']) await page.keyboard.press(key);
}

test.describe('Teclado bajo la portada de la entrada (O-54)', () => {
  let own: OwnServer;
  test.beforeAll(async () => {
    test.setTimeout(90_000);
    own = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'targets' });
  });
  test.afterAll(async () => {
    await own?.kill();
  });

  test('O-54: con la portada puesta, ArrowRight, Tab, Espacio, S, R y P no hacen nada; al irse, las mismas teclas funcionan como siempre', async ({ page }) => {
    test.setTimeout(120_000);
    const bytes = fs.readFileSync(FIXTURE);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(`**${URL_HELD}`, async (route) => {
      await held;
      await route.fulfill({ body: bytes, contentType: 'model/gltf-binary' });
    });
    await page.addInitScript((u) => {
      let debug: unknown;
      Object.defineProperty(window, '__SEA_BATTLE__', {
        configurable: true,
        get: () => debug,
        set: (v: { runtime(): unknown }) => {
          if (!debug) {
            const rt = v.runtime() as { useShipGlb(c: string, url: string): void; entry: { waitMs: number } };
            rt.useShipGlb('sloop', u);
            rt.entry.waitMs = 10_000;
          }
          debug = v;
        }
      });
    }, URL_HELD);
    const net = trackSocket(page);
    await page.goto(`${own.url}/game`);
    // La bienvenida llegó, el frame ya corre (la entrada espera) y la portada tapa el juego. enterGame no vale: su ready()
    // pide la entrada abierta
    await page.waitForFunction(
      () => {
        const dbg = window.__SEA_BATTLE__;
        const e = dbg?.runtime().entry;
        return !!dbg?.me() && !!e && e.lastWaitAt > 0 && e.shownAt === 0;
      },
      null,
      { timeout: 30_000 }
    );
    await expect(page.locator('.game-root > [data-testid="loading"]')).toBeVisible();
    const before = await view(page);
    net.reset();
    await pressAll(page);
    await page.waitForTimeout(500); // un viewAt de la vista libre saldría al momento y el sync del HUD va cada 100 ms
    const { selectedId, shopOpen } = await hud(page);
    const covered = { entry: await entryOf(page), view: await view(page), selectedId, shopOpen, sent: intents(net) };
    console.log(`O-54 con la portada: ${JSON.stringify({ before, ...covered })}`);
    expect(covered.entry).toMatchObject({ shownAt: 0, coverHidden: false }); // la portada seguía puesta al medir
    // Primero el foco: si Tab lo bajase a un botón del HUD, Espacio lo pulsaría y el rojo saldría en los mensajes
    expect(covered.view.focus).toBe(before.focus);
    expect(covered.sent).toEqual([]);
    expect(covered.selectedId).toBeNull();
    expect(covered.shopOpen).toBe(false); // P no abrió el Astillero
    expect(covered.view.mode).toBe('follow');
    expect(Math.hypot(covered.view.x - before.x, covered.view.z - before.z)).toBeLessThanOrEqual(1);

    // Espacio con un objetivo ya elegido (condición de producto): sin objetivo, Espacio no hace nada haya guarda o no. Se
    // elige uno con el gancho del store, sin teclado ni ratón (la portada tapa el canvas), y Tab y Espacio siguen sin hacer nada
    const npc = (await waitFor(() => ships(page), (list) => list.some((sh) => sh.kind !== 'player'), 10_000, 100)).find((sh) => sh.kind !== 'player')!;
    await page.evaluate((id) => window.__SEA_BATTLE__!.select(id), npc.id);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    const armed = { entry: await entryOf(page), selectedId: (await hud(page)).selectedId, refused: await refusedOf(page), sent: intents(net) };
    console.log(`O-54 con la portada y ${npc.id} (${npc.kind}) elegido: ${JSON.stringify(armed)}`);
    expect(armed.entry).toMatchObject({ shownAt: 0, coverHidden: false });
    expect(armed.sent).toEqual([]);
    expect(armed.selectedId).toBe(npc.id); // Tab no lo cambió
    expect(armed.refused).toBe(false); // Espacio no llegó a toggleAttack
    await page.evaluate(() => window.__SEA_BATTLE__!.select(null));

    // La portada se va al llegar el GLB, y las mismas teclas funcionan como siempre (AC-118 y AC-26)
    release();
    await expect.poll(async () => (await entryOf(page)).coverHidden, { timeout: 15_000 }).toBe(true);
    // Se navega a POST con la API del cliente (preparación, sin teclas) y se espera a que Tab tenga a quién elegir
    await sailTo(page, POST.x, POST.z);
    await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - POST.x, s.z - POST.z) < 3, 45_000, 250);
    const tabbable = await waitFor(() => tabTargets(page), (ids) => ids.length > 0, 5_000, 100);
    const open = await view(page);
    net.reset();
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(100);
    const moved = await view(page);
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await hud(page)).selectedId, { timeout: 2_000 }).not.toBeNull();
    // Espacio ataca al elegido o, si no es atacable, avisa de que no se puede: los dos salen de toggleAttack, y tiene que
    // salir exactamente uno (producto). El ataque de verdad tras entrar lo prueba gameplay.spec.ts:470
    await page.keyboard.press('Space');
    await expect.poll(async () => intents(net).some((i) => i.name === C2S.attack) || (await refusedOf(page)), { timeout: 2_000 }).toBe(true);
    const space = { attack: intents(net).filter((i) => i.name === C2S.attack).length, refused: await refusedOf(page) };
    console.log(`O-54 Espacio tras la portada: ${space.attack ? 'attack' : 'aviso «No puedes atacar ese objetivo»'} ${JSON.stringify(space)}`);
    expect(space.attack + Number(space.refused)).toBe(1);
    for (const key of ['KeyS', 'KeyR']) await page.keyboard.press(key);
    // P abre el Astillero: POST está en la zona segura (AC-65/66, gameplay.spec.ts:47)
    await page.keyboard.press('KeyP');
    await expect(page.getByTestId('shop')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const names = intents(net).map((i) => i.name);
    console.log(`O-54 sin la portada: ${JSON.stringify({ open, moved, tabbable, selectedId: (await hud(page)).selectedId, sent: names })}`);
    expect(moved.mode).toBe('free');
    expect(Math.hypot(moved.x - open.x, moved.z - open.z)).toBeGreaterThan(10); // AC-118 da 150 m/s; aquí, el mecanismo
    expect(names).toContain(C2S.viewAt);
    expect(names.filter((n) => n === C2S.stop)).toHaveLength(1);
    expect(names.filter((n) => n === C2S.repair)).toHaveLength(1);
  });
});

// O-39 (ART-DIRECTION §4.3, §11.1, §12; D43): la placa y el panel del objetivo de la Cañonera pirata llevan calavera y
// bomba. En la placa, 2 iconos de 12 px separados 2 px y «Cañonera pirata» entera, con el máximo de las placas de 2 iconos
// (142 px en escritorio y 130 en móvil); en el panel, el par en columna, la bomba sobre la calavera, como el Capitán. El
// pirata, al lado, sigue con su calavera sola. Servidor propio con el I2 encendido y el escenario "danger"
// (server/scenarios.ts): la cañonera y el pirata quietos y sin IA. En los 3 tamaños de §12
import { BrowserContextOptions, expect, Page, test } from '@playwright/test';
import { DANGER } from '../server/scenarios';
import { DebugShip, enterGame, me, ships, waitFor } from './helpers';
import { sailTo } from './net';
import { startOwnServer } from './own-server';

type Size = 'desktop' | 'portrait' | 'landscape';
const SIZES: Record<Size, BrowserContextOptions> = {
  desktop: { viewport: { width: 1440, height: 900 } },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};
// Máximo de la placa (D43): 128 / 116 px, y 14 más con 2 iconos. El apaisado táctil usa el de móvil (pointer: coarse)
const PLATE_MAX: Record<Size, { one: string; two: string }> = {
  desktop: { one: '128px', two: '142px' },
  portrait: { one: '116px', two: '130px' },
  landscape: { one: '116px', two: '130px' }
};
// El par del panel: el 2.º icono a 0,55 y la calavera a 0,75 de 22 px; en 390×844, 9 y 13 px (globals.css)
const PANEL_PAIR: Record<Size, [number, number]> = { desktop: [12, 17], portrait: [9, 13], landscape: [12, 17] };
// Entre los dos, a 30 m de cada uno: las placas quedan a media altura, lejos de la barra de acciones y de los avisos. En
// el punto de tiro de danger-mark.spec.ts (0, 100), en 1440×900 la placa de la cañonera queda a 12 px de la barra: dentro
// de la histéresis de §11.4 (se oculta a < 8 px y no vuelve hasta 16), y se había ocultado en la travesía. Para la placa
// y el panel no hace falta estar a tiro; sin IA, los dos no disparan aunque el jugador salga de la zona segura
const POST = { x: 0, z: DANGER.gunboat.z };

// Selecciona un barco tocándolo o haciendo clic en él, como el jugador
async function select(page: Page, id: string, touch: boolean) {
  const s = (await ships(page)).find((x) => x.id === id) as DebugShip;
  if (touch) await page.touchscreen.tap(s.screen!.sx, s.screen!.sy);
  else await page.mouse.click(s.screen!.sx, s.screen!.sy);
  await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', id);
}

// Diagnóstico de una placa oculta (§11.4, D39): sus clases y su caja, y las de los bloques del HUD y las demás placas, con
// los que se cruzan a 8 px (se oculta) y a 16 px (no vuelve). Se escribe en el log antes de mirar si se ve
async function plateDiag(page: Page, id: string) {
  return page.evaluate((id) => {
    type Box = { x: number; y: number; w: number; h: number };
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const near = (a: Box, b: Box, m: number) => a.x - m < b.x + b.w && a.x + a.w + m > b.x && a.y - m < b.y + b.h && a.y + a.h + m > b.y;
    const root = document.querySelector(`[data-plate][data-ship-id="${id}"]`) as HTMLElement;
    const body = box(root.querySelector('.wo-plate__body')!);
    const blocks = Array.from(document.querySelectorAll('[data-hud-block]'))
      .map((el) => ({ el: (el as HTMLElement).dataset.testid ?? el.className, box: box(el) }))
      .filter((b) => b.box.w > 0 && b.box.h > 0)
      .map((b) => ({ ...b, at8: near(body, b.box, 8), at16: near(body, b.box, 16) }));
    const plates = Array.from(document.querySelectorAll('[data-plate]'))
      .filter((el) => el !== root)
      .map((el) => ({ id: (el as HTMLElement).dataset.shipId, cls: el.className, box: box(el.querySelector('.wo-plate__body')!) }));
    return { cls: root.className, display: root.style.display, transform: root.style.transform, body, blocks, plates };
  }, id);
}

// La placa del barco (seleccionado: la del objetivo nunca se compacta ni se oculta por el declutter, aunque bajo el HUD
// sí, §11.4)
async function plate(page: Page, id: string) {
  const root = page.locator(`[data-plate][data-ship-id="${id}"]`);
  const diag = await plateDiag(page, id);
  console.log(`O-39 diagnóstico de la placa ${id}: ${JSON.stringify(diag)}`);
  // Preparación: la placa a ≥ 16 px de todo bloque del HUD, para que pueda verse (§11.4). Si el escenario la vuelve a
  // acercar a uno, el rojo sale aquí y no en lo que se mide después
  expect(diag.blocks.filter((b) => b.at16).map((b) => b.el), `preparación: la placa ${id} queda a < 16 px de un bloque del HUD`).toEqual([]);
  await expect(root).toBeVisible();
  return root.evaluate((el) => {
    const name = el.querySelector('.wo-plate__name') as HTMLElement;
    const icon = el.querySelector('.wo-plate__icon') as HTMLElement;
    const body = el.querySelector('.wo-plate__body') as HTMLElement;
    const icons = Array.from(icon.querySelectorAll('svg')).map((s) => {
      const r = s.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, bomb: !!s.querySelector('circle[cx="11"][cy="13"][r="9"]') };
    });
    return { text: name.textContent, truncated: name.scrollWidth > name.clientWidth, count: icon.dataset.icons, icons, maxW: getComputedStyle(body).maxWidth, width: body.getBoundingClientRect().width };
  });
}

// El icono del panel del objetivo. En los dos, cada <svg> con su caja y si es la bomba de Lucide (su círculo de r 9 en 11, 13)
async function panelIcon(page: Page) {
  return page.locator('.hud-target__icon').evaluate((el) => ({
    pair: !!el.querySelector('.hud-icon-pair'),
    icons: Array.from(el.querySelectorAll('svg')).map((s) => {
      const r = s.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, bomb: !!s.querySelector('circle[cx="11"][cy="13"][r="9"]') };
    })
  }));
}

test.describe('Calavera y bomba de la Cañonera pirata (O-39)', () => {
  for (const size of ['desktop', 'portrait', 'landscape'] as const) {
    test(`O-39 en ${size}: la placa de la cañonera lleva calavera y bomba de 12 px separadas 2 px y «Cañonera pirata» entera dentro del máximo de D43; el panel, la bomba sobre la calavera; el pirata, solo la calavera`, async ({ browser }) => {
      test.setTimeout(120_000);
      const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: 'danger' });
      const ctx = await browser.newContext(SIZES[size]);
      try {
        const page = await ctx.newPage();
        const touch = size !== 'desktop';
        await enterGame(page, server.url);
        await sailTo(page, POST.x, POST.z);
        await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - POST.x, s.z - POST.z) < 4, 45_000, 200);
        await page.waitForTimeout(500);
        const at = (p: { x: number; z: number }) => async () => (await ships(page)).find((s) => Math.hypot(s.x - p.x, s.z - p.z) < 1);
        const gunboat = (await waitFor(at(DANGER.gunboat), (s) => !!s?.screen, 10_000, 100))!;
        const pirate = (await waitFor(at(DANGER.pirate), (s) => !!s?.screen, 10_000, 100))!;
        expect([gunboat.classId, pirate.classId]).toEqual(['gunboat', 'pirate']);

        await select(page, gunboat.id, touch);
        const g = await plate(page, gunboat.id);
        console.log(`O-39 placa de la cañonera ${size}: ${JSON.stringify(g)}`);
        expect(g).toMatchObject({ text: 'Cañonera pirata', truncated: false, count: '2', maxW: PLATE_MAX[size].two });
        expect(g.width).toBeLessThanOrEqual(parseFloat(PLATE_MAX[size].two) + 0.5);
        // Calavera y bomba, en ese orden (§11.1), de 12 px y a 2 px
        expect(g.icons.map((i) => i.bomb)).toEqual([false, true]);
        for (const i of g.icons) expect([i.w, i.h]).toEqual([12, 12]);
        expect(Math.abs(g.icons[1].x - (g.icons[0].x + g.icons[0].w) - 2)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(g.icons[1].y - g.icons[0].y)).toBeLessThanOrEqual(0.5);

        const p = await panelIcon(page);
        console.log(`O-39 panel de la cañonera ${size}: ${JSON.stringify(p)}`);
        expect(p.pair).toBe(true);
        expect(p.icons.map((i) => i.bomb)).toEqual([true, false]);
        expect(p.icons.map((i) => [i.w, i.h])).toEqual(PANEL_PAIR[size].map((s) => [s, s]));
        // En columna: la bomba encima de la calavera y centradas
        expect(p.icons[0].y + p.icons[0].h).toBeLessThanOrEqual(p.icons[1].y + 0.5);
        expect(Math.abs(p.icons[0].x + p.icons[0].w / 2 - (p.icons[1].x + p.icons[1].w / 2))).toBeLessThanOrEqual(0.5);
        await page.screenshot({ path: test.info().outputPath(`o-39-canonera-${size}.png`) });

        await select(page, pirate.id, touch);
        const q = await plate(page, pirate.id);
        console.log(`O-39 placa del pirata ${size}: ${JSON.stringify(q)}`);
        expect(q).toMatchObject({ count: '1', maxW: PLATE_MAX[size].one });
        expect(q.icons.map((i) => i.bomb)).toEqual([false]);
        expect(await panelIcon(page)).toMatchObject({ pair: false, icons: [{ bomb: false }] });
      } finally {
        await ctx.close();
        await server.kill();
      }
    });
  }
});

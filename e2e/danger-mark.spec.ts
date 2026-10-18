// Marca de peligro del panel del objetivo (AC-189; ART-DIRECTION §12.10, D77): con una Balandra N1, la cañonera sale
// marcada como «Demasiado fuerte para tu barco» y el pirata no; al comprar Cañones N2 la marca se apaga. Servidor propio
// con el I2 encendido y el escenario "danger" (server/scenarios.ts): la cañonera y el pirata quietos y sin IA, y el oro
// justo de los Cañones N2. En los 3 tamaños de §12
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
// Panel del objetivo de §12: 320 × 72 en escritorio (no cambia con la marca), y en móvil 70 con la marca y 48 sin ella
const FRAME: Record<Size, { w: number; marked: number; plain: number }> = {
  desktop: { w: 320, marked: 72, plain: 72 },
  portrait: { w: 262, marked: 70, plain: 48 },
  landscape: { w: 252, marked: 70, plain: 48 }
};
const DANGER_COLOR = 'rgb(255, 122, 122)'; // --ui-danger
// Dentro de la zona segura (radio 110) y a 54 m de los dos, a tiro del N1 (60 m)
const POST = { x: 0, z: 100 };

type Box = { x: number; y: number; w: number; h: number };
const inside = (a: Box, b: Box) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const cross = (a: Box, b: Box) => a.w > 0 && b.w > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Selecciona un barco tocándolo o haciendo clic en él, como el jugador
async function select(page: Page, id: string, touch: boolean) {
  const s = (await ships(page)).find((x) => x.id === id) as DebugShip;
  if (touch) await page.touchscreen.tap(s.screen!.sx, s.screen!.sy);
  else await page.mouse.click(s.screen!.sx, s.screen!.sy);
  await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', id);
}

// El panel del objetivo: su caja, la línea de tipo (con el icono, su estilo y si cabe) y las cajas de sus hijos visibles
async function targetPanel(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const frame = document.querySelector('[data-testid="target-frame"]')!;
    const type = document.querySelector('[data-testid="target-type"]') as HTMLElement;
    const span = type.querySelector('span');
    const svg = type.querySelector('svg');
    const style = getComputedStyle(type);
    const children = Array.from(frame.querySelectorAll('*')).filter((el) => (el as HTMLElement).offsetWidth > 0 || el instanceof SVGElement);
    const blocks = ['player-frame', 'toasts', 'minimap'].flatMap((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      return el ? (id === 'toasts' ? Array.from(el.children).map(box) : [box(el)]) : [];
    });
    return {
      frame: box(frame),
      shown: type.offsetWidth > 0,
      type: type.textContent,
      typeBox: box(type),
      typeFits: type.scrollWidth <= type.clientWidth,
      textFits: !span || span.scrollWidth <= span.clientWidth,
      text: span ? box(span) : null,
      icon: svg ? box(svg) : null,
      color: style.color,
      weight: style.fontWeight,
      size: style.fontSize,
      children: children.map(box),
      blocks
    };
  });
}

test.describe('Marca de peligro en el objetivo (AC-189)', () => {
  for (const size of ['desktop', 'portrait', 'landscape'] as const) {
    test(`AC-189 en ${size}: con la Balandra N1, la cañonera dice «Demasiado fuerte para tu barco» con el triángulo, cabe y no se sale del panel; el pirata no; tras comprar Cañones N2 desaparece${size === 'desktop' ? '' : ' y el panel vuelve a 48'}`, async ({ browser }) => {
      test.setTimeout(150_000);
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
        const frame = FRAME[size];

        await select(page, gunboat.id, touch);
        const marked = await targetPanel(page);
        console.log(`AC-189 marca ${size}: ${JSON.stringify(marked)}`);
        expect(marked).toMatchObject({ shown: true, type: 'Demasiado fuerte para tu barco', typeFits: true, textFits: true, color: DANGER_COLOR, weight: '600', size: touch ? '11px' : '12px' });
        // El triángulo de 12 px al principio de la línea y el texto 4 px después (§12.10). Lo que ocupa, para ux: 182 de 224 px
        // en escritorio y 169 de 206 y de 196 en móvil, medido con las Barlow del juego
        expect(marked.icon).toMatchObject({ w: 12, h: 12 });
        expect(Math.abs(marked.icon!.x - marked.typeBox.x)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(marked.text!.x - (marked.icon!.x + marked.icon!.w + 4))).toBeLessThanOrEqual(0.5);
        console.log(`AC-189 ancho ${size}: ${(marked.text!.x + marked.text!.w - marked.icon!.x).toFixed(1)} de ${marked.typeBox.w.toFixed(1)} px`);
        expect([marked.frame.w, marked.frame.h]).toEqual([frame.w, frame.marked]);
        for (const child of marked.children) expect(inside(child, marked.frame)).toBe(true);
        for (const block of marked.blocks) expect(cross(marked.frame, block)).toBe(false);
        if (touch) {
          // La última línea del panel, bajo la distancia, como el rango de un jugador (D75)
          const row = await page.getByTestId('target-distance').boundingBox();
          expect(marked.typeBox.y).toBeGreaterThan(row!.y);
        }

        await select(page, pirate.id, touch);
        const plain = await targetPanel(page);
        console.log(`AC-189 pirata ${size}: ${JSON.stringify(plain)}`);
        expect(plain.icon).toBeNull();
        expect([plain.frame.w, plain.frame.h]).toEqual([frame.w, frame.plain]);
        if (touch) expect(plain.shown).toBe(false);
        else expect(plain.type).toBe('Pirata · hostil');

        // Cañones N2 en el puerto, con la cañonera seleccionada: la marca se apaga con la mejora, sin cambiar de objetivo
        await select(page, gunboat.id, touch);
        if (touch) await page.getByTestId('m-port').tap();
        else await page.getByTestId('btn-port').click();
        await expect(page.getByTestId('shop')).toBeVisible();
        if (touch) await page.getByTestId('buy-cannons-2').tap();
        else await page.getByTestId('buy-cannons-2').click();
        await expect(page.getByTestId('shop-cannons')).toContainText('Nivel 2/3');
        if (touch) await page.getByRole('button', { name: 'Cerrar (Esc)' }).tap();
        else await page.keyboard.press('Escape');
        await expect(page.getByTestId('shop')).toHaveCount(0);
        await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', gunboat.id);
        const after = await targetPanel(page);
        console.log(`AC-189 tras Cañones N2 ${size}: ${JSON.stringify(after)}`);
        expect(after.icon).toBeNull();
        expect([after.frame.w, after.frame.h]).toEqual([frame.w, frame.plain]);
        if (touch) expect(after.shown).toBe(false);
        else expect(after.type).toBe('Cañonera pirata · hostil');
      } finally {
        await ctx.close();
        await server.kill();
      }
    });
  }
});

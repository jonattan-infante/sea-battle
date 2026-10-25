// HUD de la experiencia (1.1): AC-151 (aviso de subida de nivel), AC-152 (panel, feed y «+N XP») y AC-153 (insignia en la
// placa y panel del objetivo). Servidores propios con los escenarios de la XP (server/scenarios.ts: "xp", "xp-13" y
// "xp-12") y, para varios niveles de golpe, el Capitán con el I2 encendido ("captain-down"). Textos: GDD §14; medidas:
// ART-DIRECTION §11.5 y §12.9 (D74, D75)
import { Browser, BrowserContext, BrowserContextOptions, expect, Page, test } from '@playwright/test';
import { CAPTAIN_DOWN_POINT, XP_BAIT_POINT } from '../server/scenarios';
import { rankBadgeSvg } from '../src/client/badges';
import { CAPTAIN_CLASS, LEVEL_XP, SHIP_CLASSES, STARTING_GOLD } from '../src/game/constants';
import { deathPenalty } from '../src/game/world';
import { DebugShip, enterGame, me, ships, waitFor } from './helpers';
import { sailTo } from './net';
import { OwnServer, startOwnServer } from './own-server';

type Size = 'desktop' | 'portrait' | 'landscape';
const SIZES: Record<Size, BrowserContextOptions> = {
  desktop: { viewport: { width: 1440, height: 900 } },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};
const XP_COLOR = 'rgb(183, 156, 255)'; // --ui-xp (D70)
// El navegador serializa los elementos vacíos con cierre (<rect …></rect>); el JSON de ux y rankBadgeSvg, con «/>»
const markup = (html: string | null | undefined) => (html ?? '').replace(/><\/(rect|circle|polygon)>/g, '/>');

async function open(browser: Browser, server: OwnServer, size: Size, contexts: BrowserContext[]): Promise<Page> {
  const ctx = await browser.newContext(SIZES[size]);
  contexts.push(ctx);
  const page = await ctx.newPage();
  await enterGame(page, server.url);
  return page;
}

async function arrive(page: Page, x: number, z: number) {
  await sailTo(page, x, z);
  await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - x, s.z - z) < 4, 45_000, 200);
}

// Selecciona un barco tocándolo o haciendo clic en él, como el jugador
async function select(page: Page, id: string, touch: boolean) {
  const s = (await ships(page)).find((x) => x.id === id) as DebugShip;
  if (touch) await page.touchscreen.tap(s.screen!.sx, s.screen!.sy);
  else await page.mouse.click(s.screen!.sx, s.screen!.sy);
  await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', id);
}

// Marca el frame que trae la XP de `xpAtLeast` (antes de que el cliente lo procese: onAny va delante de los handlers) y
// el primer commit con el aviso de nivel, con lo que el panel mostraba en ese mismo commit. Cuenta los avisos de nivel
async function watchLevelUp(page: Page, xpAtLeast: number) {
  await page.evaluate((min) => {
    type W = Window & { __lv: { frameAt: number | null; domAt: number | null; dom: Record<string, string | null> | null; toasts: string[] } };
    const w = window as unknown as W;
    w.__lv = { frameAt: null, domAt: null, dom: null, toasts: [] };
    const client = (window.__SEA_BATTLE__!.runtime() as unknown as { client: { socket: { onAny: (l: (ev: string, f: { me?: { xp: number } }) => void) => void } } }).client;
    client.socket.onAny((ev, f) => {
      if (ev === 'frame' && f.me && f.me.xp >= min && w.__lv.frameAt === null) w.__lv.frameAt = performance.now();
    });
    const seen = new Set<Element>();
    new MutationObserver(() => {
      for (const t of Array.from(document.querySelectorAll('[data-testid="toasts"] .toast--achievement'))) {
        if (seen.has(t)) continue;
        seen.add(t);
        w.__lv.toasts.push(t.textContent ?? '');
        if (w.__lv.domAt !== null) continue;
        w.__lv.domAt = performance.now();
        const text = (sel: string) => document.querySelector(sel)?.textContent ?? null;
        w.__lv.dom = {
          toast: t.textContent,
          level: text('[data-testid="player-level"]'),
          xpLevel: document.querySelector('[data-testid="player-xp"]')?.getAttribute('data-level') ?? null,
          badge: document.querySelector('[data-testid="player-badge"]')?.getAttribute('data-rank') ?? null
        };
      }
    }).observe(document.querySelector('[data-testid="hud"]')!, { childList: true, subtree: true, attributes: true, characterData: true });
  }, xpAtLeast);
}

const levelUp = (page: Page) =>
  page.evaluate(() => (window as unknown as { __lv: { frameAt: number | null; domAt: number | null; dom: Record<string, string | null> | null; toasts: string[] } }).__lv);

type Box = { x: number; y: number; w: number; h: number };
const inside = (a: Box, b: Box) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const cross = (a: Box, b: Box) => a.w > 0 && b.w > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Cajas del panel del jugador y de sus piezas (null si no se pintan en este tamaño)
async function playerPanel(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const q = (sel: string) => document.querySelector(`[data-testid="player-frame"] ${sel}`);
    const texts = Array.from(document.querySelectorAll('[data-testid="player-frame"] strong, [data-testid="player-frame"] span'))
      .filter((el) => (el as HTMLElement).offsetWidth > 0 && el.children.length === 0)
      .map((el) => ({ text: el.textContent, clipped: (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 0.5 }));
    return {
      frame: box(document.querySelector('[data-testid="player-frame"]'))!,
      icon: box(q('.hud-class-icon'))!,
      badge: box(q('[data-testid="player-badge"]'))!,
      badgeSvg: q('[data-testid="player-badge"] svg')?.outerHTML ?? null,
      hp: box(q('[data-testid="player-hp"]'))!,
      xp: box(q('[data-testid="player-xp"]'))!,
      level: box(q('[data-testid="player-level"]')),
      levelText: q('[data-testid="player-level"]')?.textContent ?? null,
      classText: q('[data-testid="player-class"]')?.textContent ?? null,
      xpBar: ['role', 'aria-label', 'title', 'aria-valuenow', 'aria-valuemax'].map((a) => q('[data-testid="player-xp"]')?.getAttribute(a) ?? null),
      gold: box(document.querySelector('[data-testid="player-gold-panel"]')),
      texts
    };
  });
}

// AC-152 (§12.9, D76): insignia, nivel y barra de XP en su sitio, todo dentro del panel y sin recortes de texto. Los
// números de la barra van en su title y su nombre accesible
async function expectPlayerPanel(page: Page, size: Size, level: number, rank: number, xpText: string, into: number, span: number) {
  const p = await playerPanel(page);
  console.log(`AC-152 panel ${size}: ${JSON.stringify(p)}`);
  for (const part of [p.icon, p.badge, p.hp, ...(size === 'desktop' ? [p.xp] : [])]) expect(inside(part, p.frame)).toBe(true);
  expect(p.texts.filter((t) => t.clipped)).toEqual([]);
  const badgePx = size === 'desktop' ? 24 : 18;
  const over = size === 'desktop' ? 2 : 4; // la insignia asoma 2 px (escritorio) o 4 (móvil) por la esquina del icono
  expect(p.badge).toMatchObject({ w: badgePx, h: badgePx });
  expect(Math.abs(p.badge.x + p.badge.w - (p.icon.x + p.icon.w + over))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(p.badge.y + p.badge.h - (p.icon.y + p.icon.h + over))).toBeLessThanOrEqual(0.5);
  expect(markup(p.badgeSvg)).toBe(rankBadgeSvg(rank as 1 | 2 | 3 | 4 | 5, badgePx));
  expect(p.xpBar).toEqual(['progressbar', xpText, xpText, String(into), String(span)]);
  expect(p.levelText).toBe(level === 20 ? 'Nivel máximo' : `Nivel ${level}`);
  if (size === 'desktop') {
    expect(p.classText).toBe('Balandra'); // la fila del nombre, como en la 1.0 (D76)
    expect([p.xp.w, p.xp.h]).toEqual([200, 4]);
    expect(Math.abs(p.xp.y - (p.hp.y + p.hp.h + 3))).toBeLessThanOrEqual(0.5); // 3 px bajo la vida
    expect(Math.abs(p.level!.x + p.level!.w - (p.frame.x + p.frame.w - 13))).toBeLessThanOrEqual(1); // a la derecha de la línea de estado
    expect(p.level!.y).toBeGreaterThan(p.xp.y);
  } else {
    expect(p.level!.w).toBeLessThanOrEqual(76);
    if (size === 'portrait') {
      expect(p.xp).toEqual({ x: 0, y: p.frame.y + 49, w: 390, h: 3 }); // franja en el borde inferior de la barra superior
      expect(Math.abs(p.level!.x - (p.hp.x + p.hp.w + 8))).toBeLessThanOrEqual(0.5); // a la derecha de la vida…
      expect(Math.abs(p.level!.y + p.level!.h / 2 - (p.hp.y + p.hp.h / 2))).toBeLessThanOrEqual(1); // …y centrado en su alto
      if (p.gold) expect(cross(p.level!, p.gold)).toBe(false);
    } else {
      expect(p.xp).toEqual({ x: p.frame.x, y: p.frame.y + p.frame.h - 2, w: p.frame.w, h: 2 }); // (12, 54, 252, 2)
      expect(Math.abs(p.level!.x + p.level!.w - (p.frame.x + p.frame.w - 9))).toBeLessThanOrEqual(1); // a la derecha de la fila del nombre
    }
  }
}

// Avisos de nivel visibles: texto, caja y si la pista o una placa visible lo tapan (AC-105, AC-110; D41)
async function achievementToasts(page: Page) {
  return page.evaluate(() => {
    const box = (r: DOMRect) => ({ x: r.x, y: r.y, w: r.width, h: r.height });
    const cross = (a: DOMRect, b: DOMRect, m = 0) => a.width > 0 && b.width > 0 && a.left - m < b.right && b.left < a.right + m && a.top - m < b.bottom && b.top < a.bottom + m;
    return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="toasts"] .toast--achievement')).map((t) => {
      const r = t.getBoundingClientRect();
      const hint = document.querySelector<HTMLElement>('[data-testid="hint"]:not(.is-hidden)');
      const plates = Array.from(document.querySelectorAll<HTMLElement>('[data-plate]')).filter((p) => p.style.display === 'block' && getComputedStyle(p).visibility !== 'hidden');
      return {
        text: t.textContent,
        box: box(r),
        block: t.hasAttribute('data-hud-block'),
        badge: t.querySelector('svg')?.getAttribute('width') ?? null,
        lineClipped: t.scrollWidth > t.clientWidth,
        hintOver: !!hint && cross(hint.getBoundingClientRect(), r),
        platesOver: plates.filter((p) => cross(p.querySelector('.wo-plate__body')!.getBoundingClientRect(), r, 8)).length
      };
    });
  });
}

// Hunde el cebo de "xp" (pirata quieto con 1 de vida a 45 m) con el teclado, como el jugador (Tab + Espacio, GDD §5)
async function sinkBait(page: Page) {
  await arrive(page, XP_BAIT_POINT.x, XP_BAIT_POINT.z - 45);
  const bait = (await ships(page)).find((s) => s.kind === 'pirate')!;
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', bait.id);
  await page.keyboard.press('Space');
  return bait;
}

test.describe('HUD de la experiencia (1.1)', () => {
  for (const size of ['desktop', 'portrait', 'landscape'] as const) {
    test(`AC-151 y AC-152 en ${size}: a 10 XP del nivel 9, hundir un pirata da un solo aviso «¡Nivel 9! Ahora eres Contramaestre» en ≤ 200 ms del frame, con el panel del nivel nuevo en el mismo commit, y la línea «Hundiste a Pirata +105 oro · +30 XP»`, async ({ browser }) => {
      test.setTimeout(150_000);
      const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'xp' });
      const contexts: BrowserContext[] = [];
      try {
        const page = await open(browser, server, size, contexts);
        const pirate = SHIP_CLASSES.pirate;
        // Antes: nivel 8 (Marinero), 690 de los 700 que faltan hasta el 9
        await expectPlayerPanel(page, size, 8, 2, '690 / 700 XP', 690, 700);
        // El cebo es un NPC: su placa no lleva insignia; la propia, sí (§11.5)
        const plates = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('[data-plate]'))
            .filter((p) => p.dataset.shipId)
            .map((p) => ({ id: p.dataset.shipId, relation: p.dataset.relation, rank: p.querySelector<HTMLElement>('.wo-plate__badge')!.dataset.rank, html: p.querySelector('.wo-plate__badge')!.innerHTML }))
        );
        console.log(`AC-153 placas en ${size}: ${JSON.stringify(plates.map(({ html: _h, ...p }) => p))}`);
        expect(plates.find((p) => p.relation === 'pirate')).toMatchObject({ rank: '0', html: '' });
        const own = plates.find((p) => p.relation === 'self')!;
        expect([own.rank, markup(own.html)]).toEqual(['2', rankBadgeSvg(2, 12)]);

        await watchLevelUp(page, LEVEL_XP[8]);
        await sinkBait(page);
        const lv = await waitFor(() => levelUp(page), (v) => v.domAt !== null && v.frameAt !== null, 30_000, 50);
        console.log(`AC-151 ${size}: frame → aviso ${(lv.domAt! - lv.frameAt!).toFixed(1)} ms; en ese commit ${JSON.stringify(lv.dom)}`);
        expect(lv.domAt! - lv.frameAt!).toBeLessThanOrEqual(200);
        expect(lv.dom).toMatchObject({ toast: '¡Nivel 9! Ahora eres Contramaestre', xpLevel: '9', badge: '3' });
        expect(lv.dom!.level).toBe('Nivel 9');

        // El aviso: uno solo, en una línea, con la insignia de 24 px, bloque del HUD, sin pista ni placas encima
        const [toast] = await achievementToasts(page);
        console.log(`AC-151 aviso ${size}: ${JSON.stringify(toast)}`);
        expect(toast).toMatchObject({ text: '¡Nivel 9! Ahora eres Contramaestre', block: true, badge: '24', lineClipped: false, hintOver: false, platesOver: 0 });
        expect(toast.box.h).toBeLessThanOrEqual(36.5); // una línea: el alto mínimo del toast (§12.5)
        // «+30 XP» con el «+105 oro»: en escritorio, una línea del feed que cabe entera; en móvil, en el aviso del feed
        const line = `Hundiste a Pirata +${pirate.reward} oro · +30 XP`;
        const where = size === 'desktop' ? page.locator('.feed-line') : page.locator('.feed-as-toast');
        await expect(where.filter({ hasText: line })).toHaveCount(1, { timeout: 5000 });
        const fit = await where.filter({ hasText: line }).evaluate((el) => ({
          scroll: el.scrollWidth,
          client: el.clientWidth,
          xpColor: getComputedStyle(el.querySelector('.feed-text__xp')!).color,
          text: el.textContent
        }));
        console.log(`AC-152 feed ${size}: ${JSON.stringify(fit)}`);
        expect(fit.text).toBe(line);
        expect(fit.scroll).toBeLessThanOrEqual(fit.client);
        expect(fit.xpColor).toBe(XP_COLOR);
        // VFX-SPEC §9: «+30 XP» flotante 18 px por encima del oro de la misma recompensa
        const floats = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('.wo-float'))
            .filter((f) => f.style.display === 'block')
            .map((f) => ({ kind: f.dataset.kind, text: f.textContent, y: Number(/translate3d\([^,]+,\s*(-?[\d.]+)px/.exec(f.style.transform)?.[1]) }))
        );
        console.log(`AC-152 flotantes ${size}: ${JSON.stringify(floats)}`);
        const gold = floats.find((f) => f.kind === 'gold')!;
        const xp = floats.find((f) => f.kind === 'xp')!;
        expect([gold.text, xp.text]).toEqual([`+${pirate.reward} ◉`, '+30 XP']);
        expect(Math.abs(gold.y - xp.y - 18)).toBeLessThanOrEqual(1);

        // Después: nivel 9 (Contramaestre), 20 de los 900 que faltan hasta el 10, y un solo aviso en todo el rato
        await page.waitForTimeout(1500);
        expect((await levelUp(page)).toasts).toEqual(['¡Nivel 9! Ahora eres Contramaestre']);
        await expectPlayerPanel(page, size, 9, 3, '20 / 900 XP', 20, 900);
        if (size === 'desktop') {
          // D76: el peor caso de la línea de estado, «Reparando +1,5 %/s» con su icono y «Nivel máximo» (196 de 202 px según
          // ux). Se escribe en el DOM al final del test, con la fuente y el CSS reales, solo para medir
          const row = await page.evaluate(() => {
            const foot = document.querySelector<HTMLElement>('[data-testid="player-frame"] .hud-player__foot')!;
            const status = foot.querySelector<HTMLElement>('[data-testid="action-state"]')!;
            const base = status.firstElementChild as HTMLElement;
            const level = foot.querySelector<HTMLElement>('[data-testid="player-level"]')!;
            base.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24"></svg> Reparando +1,5 %/s';
            level.textContent = 'Nivel máximo';
            return { foot: foot.clientWidth, status: status.scrollWidth, statusClient: status.clientWidth, level: level.getBoundingClientRect().width };
          });
          console.log(`D76 fila de estado: ${JSON.stringify(row)}`);
          expect(row.status).toBeLessThanOrEqual(row.statusClient);
        }
      } finally {
        for (const ctx of contexts) await ctx.close();
        await server.kill();
      }
    });
  }

  test('AC-151: un hundimiento que da varios niveles (el Capitán, 240 XP desde 0) da un solo aviso con el nivel final, «¡Nivel 3!»', async ({ browser }) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: 'captain-down' });
    const contexts: BrowserContext[] = [];
    try {
      const page = await open(browser, server, 'desktop', contexts);
      await expectPlayerPanel(page, 'desktop', 1, 1, '0 / 60 XP', 0, 60);
      await watchLevelUp(page, 240);
      await arrive(page, CAPTAIN_DOWN_POINT.x, CAPTAIN_DOWN_POINT.z + 55);
      const captain = (await ships(page)).find((s) => s.classId === CAPTAIN_CLASS)!;
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', captain.id);
      await page.keyboard.press('Space');
      const lv = await waitFor(() => levelUp(page), (v) => v.domAt !== null && v.frameAt !== null, 30_000, 50);
      await page.waitForTimeout(2000);
      const after = await levelUp(page);
      console.log(`AC-151 varios niveles: ${(lv.domAt! - lv.frameAt!).toFixed(1)} ms; avisos ${JSON.stringify(after.toasts)}; ${JSON.stringify(lv.dom)}`);
      expect(lv.domAt! - lv.frameAt!).toBeLessThanOrEqual(200);
      expect(after.toasts).toEqual(['¡Nivel 3!']);
      expect(lv.dom).toMatchObject({ level: 'Nivel 3', xpLevel: '3', badge: '1' });
      await expectPlayerPanel(page, 'desktop', 3, 1, '90 / 150 XP', 90, 150);
    } finally {
      for (const ctx of contexts) await ctx.close();
      await server.kill();
    }
  });

  // Placa y panel del objetivo de otro jugador. B queda en la zona segura junto a A: no es atacable
  async function targetPanel(page: Page) {
    return page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const frame = document.querySelector('[data-testid="target-frame"]')!;
      const type = document.querySelector('[data-testid="target-type"]') as HTMLElement;
      const children = Array.from(frame.querySelectorAll('*')).filter((el) => (el as HTMLElement).offsetWidth > 0 || el instanceof SVGElement);
      const blocks = ['player-frame', 'toasts'].flatMap((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        return el ? (id === 'toasts' ? Array.from(el.children).map(box) : [box(el)]) : [];
      });
      return {
        frame: box(frame),
        icon: box(frame.querySelector('.hud-target__icon')!),
        type: type.textContent,
        typeFits: type.scrollWidth <= type.clientWidth,
        rankFits: (() => {
          const span = type.querySelector('span');
          return !span || span.scrollWidth <= span.clientWidth;
        })(),
        badge: type.querySelector('svg')?.outerHTML ?? null,
        range: document.querySelector('[data-testid="target-range"]')?.textContent ?? null,
        children: children.map(box),
        blocks
      };
    });
  }

  test('AC-153: la placa de otro jugador de nivel 13 lleva solo la insignia de Teniente, y su panel dice «Balandra · Nivel 13 · Teniente» y «✕ No atacable» en la zona segura', async ({ browser }) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'xp-13' });
    const contexts: BrowserContext[] = [];
    try {
      const a = await open(browser, server, 'desktop', contexts);
      const b = await open(browser, server, 'desktop', contexts);
      const meA = (await me(a))!;
      const meB = (await me(b))!;
      await arrive(b, meA.x + 30, meA.z);
      await a.waitForTimeout(500);
      const plate = await a.evaluate((id) => {
        const p = document.querySelector<HTMLElement>(`[data-plate][data-ship-id="${id}"]`)!;
        return {
          name: p.querySelector('.wo-plate__name')!.textContent,
          row: p.querySelector('.wo-plate__row')!.textContent,
          badgeText: p.querySelector('.wo-plate__badge')!.textContent,
          badge: p.querySelector('.wo-plate__badge')!.innerHTML,
          rank: p.querySelector<HTMLElement>('.wo-plate__badge')!.dataset.rank,
          width: p.querySelector('.wo-plate__body')!.getBoundingClientRect().width,
          relation: p.dataset.relation
        };
      }, meB.id);
      console.log(`AC-153 placa de B: ${JSON.stringify({ ...plate, badge: plate.badge.length })}`);
      // Solo la insignia: sin número de nivel ni marcas (la fila 1 es el nombre y la insignia no lleva texto)
      expect({ ...plate, badge: markup(plate.badge) }).toMatchObject({ relation: 'player', rank: '4', badgeText: '', badge: rankBadgeSvg(4, 12), row: meB.name });
      expect(plate.width).toBeLessThanOrEqual(128);

      await select(a, meB.id, false);
      const t = await targetPanel(a);
      console.log(`AC-153 objetivo: ${JSON.stringify({ ...t, badge: !!t.badge })}`);
      expect({ ...t, badge: markup(t.badge) }).toMatchObject({ type: 'Balandra · Nivel 13 · Teniente', typeFits: true, rankFits: true, badge: rankBadgeSvg(4, 16), range: '· ✕ No atacable' });
    } finally {
      for (const ctx of contexts) await ctx.close();
      await server.kill();
    }
  });

  // 844×390 por D81: con el icono del objetivo de 40 px quedaban 184 px de texto y la línea más ancha mide 186,5, así que se
  // cortaba el rango; con el de 28, como en 390×844, quedan 196
  test('AC-153: el caso más largo, «Bergantín · Nivel 12 · Contramaestre», cabe entero en 1440×900, 390×844 y 844×390; en móvil el icono mide 28 px y el panel crece a 262 × 70 (252 × 70 en horizontal) sin salirse ni tocar la barra superior ni los avisos (D75, D81)', async ({ browser }) => {
    test.setTimeout(180_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'xp-12' });
    const contexts: BrowserContext[] = [];
    try {
      const a = await open(browser, server, 'desktop', contexts);
      const c = await open(browser, server, 'portrait', contexts);
      const l = await open(browser, server, 'landscape', contexts);
      const b = await open(browser, server, 'desktop', contexts);
      // B compra el Bergantín con el oro del escenario (como AC-70) y se pone junto a A
      await b.keyboard.press('KeyP');
      await b.getByTestId('tab-ships').click();
      await b.getByTestId('buy-ship-brig').click();
      await waitFor(() => me(b), (s) => s?.classId === 'brig', 5000, 50);
      await b.keyboard.press('Escape');
      const meA = (await me(a))!;
      const meB = (await me(b))!;
      await arrive(b, meA.x + 35, meA.z);
      // La de 844×390 sale en otro punto del anillo de entrada y ve poco en vertical: se pone a 25 m de B, que queda a la
      // izquierda del centro, por debajo del panel del objetivo y lejos de los botones
      await arrive(l, meA.x + 60, meA.z);
      await a.waitForTimeout(500);

      for (const [label, page, touch, frame] of [['1440×900', a, false, null], ['390×844', c, true, [262, 70]], ['844×390', l, true, [252, 70]]] as const) {
        await select(page, meB.id, touch);
        const t = await targetPanel(page);
        console.log(`AC-153 caso largo ${label}: ${JSON.stringify({ ...t, badge: !!t.badge })}`);
        expect([label, t.icon.w, t.icon.h]).toEqual([label, touch ? 28 : 40, touch ? 28 : 40]);
        expect({ ...t, badge: markup(t.badge) }).toMatchObject({ type: 'Bergantín · Nivel 12 · Contramaestre', typeFits: true, rankFits: true, badge: rankBadgeSvg(3, touch ? 12 : 16) });
        if (frame) {
          expect([t.frame.w, t.frame.h]).toEqual(frame);
          for (const child of t.children) expect(inside(child, t.frame)).toBe(true);
          for (const block of t.blocks) expect(cross(t.frame, block)).toBe(false);
        }
      }
    } finally {
      for (const ctx of contexts) await ctx.close();
      await server.kill();
    }
  });

  test('AC-152 en PvP: quien da el último golpe ve «Hundiste a <nombre> +N oro · +N XP» y quien ayudó, «Ayudaste en un hundimiento +N XP»; con un nombre de 16 caracteres y «+99999 oro · +150 XP» se recorta el nombre, nunca las cifras', async ({ browser }) => {
    test.setTimeout(240_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'xp-13' });
    const contexts: BrowserContext[] = [];
    try {
      const a = await open(browser, server, 'desktop', contexts);
      const b = await open(browser, server, 'desktop', contexts);
      const c = await open(browser, server, 'desktop', contexts);
      const meB = (await me(b))!;
      // Fuera de la zona segura (r 110): B quieto en (0, 220), A y C a 40 m, uno a cada lado
      await Promise.all([arrive(b, 0, 220), arrive(a, -40, 220), arrive(c, 40, 220)]);
      // Sin la protección de entrada (15 s, GDD §12), que impide atacar y ser atacado
      for (const page of [a, b, c]) {
        await waitFor(
          () => page.evaluate(() => ({ me: window.__SEA_BATTLE__!.me() as { protectedUntil: number }, now: window.__SEA_BATTLE__!.serverTime() })),
          (v) => v.me.protectedUntil <= v.now,
          30_000,
          250
        );
      }
      for (const page of [a, c]) {
        await select(page, meB.id, false);
        await page.keyboard.press('Space');
      }
      await waitFor(() => ships(a), (list) => list.find((s) => s.id === meB.id)?.state !== 'alive', 120_000, 500);
      const lost = deathPenalty(STARTING_GOLD);
      const feedOf = (page: Page) => page.locator('.feed-line').allTextContents();
      const [feedA, feedC] = await waitFor(
        async () => [await feedOf(a), await feedOf(c)],
        (f) => f.flat().some((l) => l.startsWith('Hundiste a')) && f.flat().some((l) => l.startsWith('Ayudaste')),
        5000,
        100
      );
      console.log(`AC-152 PvP: A ${JSON.stringify(feedA)} · C ${JSON.stringify(feedC)}`);
      const lines = [...feedA, ...feedC];
      const kill = lines.find((l) => l.startsWith('Hundiste a'))!;
      const help = lines.find((l) => l.startsWith('Ayudaste'))!;
      const killXp = Number(/\+(\d+) XP$/.exec(kill)![1]);
      const helpXp = Number(/^Ayudaste en un hundimiento \+(\d+) XP$/.exec(help)![1]);
      expect(kill).toBe(`Hundiste a ${meB.name} +${lost} oro · +${killXp} XP`);
      expect(killXp + helpXp).toBe(100); // mismo nivel (Δ 0, ×1), la 1.ª vez (×1): los 100 repartidos por daño
      // Ninguna línea de botín con «Botín de combate» (1.0) ni con «+0»
      expect(lines.filter((l) => l.includes('Botín de combate') || /\+0 /.test(l))).toEqual([]);

      // Peor caso de §12.9 en la línea real del último golpe: nombre de 16 caracteres anchos y las cifras más largas
      const killer = feedA.some((l) => l.startsWith('Hundiste a')) ? a : c;
      const worst = await killer.locator('.feed-line', { hasText: 'Hundiste a' }).evaluate((line) => {
        const name = line.querySelector<HTMLElement>('.feed-text__name')!;
        const reward = name.nextElementSibling as HTMLElement;
        name.textContent = 'WWWWWWWWWWWWWWWW';
        reward.innerHTML = ' +99999 oro<span class="feed-text__xp"> · +150 XP</span>';
        return {
          line: { scroll: line.scrollWidth, client: line.clientWidth },
          name: { scroll: name.scrollWidth, client: name.clientWidth },
          reward: { scroll: reward.scrollWidth, client: reward.clientWidth, text: reward.textContent }
        };
      });
      console.log(`AC-152 peor caso: ${JSON.stringify(worst)}`);
      expect(worst.line.scroll).toBeLessThanOrEqual(worst.line.client);
      expect(worst.reward.scroll).toBeLessThanOrEqual(worst.reward.client); // las cifras, enteras
      expect(worst.reward.text).toBe(' +99999 oro · +150 XP');
    } finally {
      for (const ctx of contexts) await ctx.close();
      await server.kill();
    }
  });
});

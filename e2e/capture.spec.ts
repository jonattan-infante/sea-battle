// Capturas estándar para QA y UX (ART-DIRECTION §18) sobre el escenario determinista "showcase"
// (server/scenarios.ts): pirata a 45 m, mercante a 40 m, pirata junto a la isla I5 y restos. Las de legibilidad (AC-72 y,
// con el I2, AC-115) van en su propio servidor con los escenarios "legibility" y "legibility-i2".
import { Browser, expect, Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PORTS } from '../playwright.config';
import { DANGER, LEGIBILITY, LEGIBILITY_I2 } from '../server/scenarios';
import { enterGame, me, ships, waitFor } from './helpers';
import { startOwnServer } from './own-server';

const OUT = path.join(__dirname, '..', 'qa-artifacts');
const SHOWCASE = `http://localhost:${PORTS.showcase}`;
const AUTH = `http://localhost:${PORTS.auth}`; // sin invitado: Clerk de desarrollo de .env.local

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true }
];

type Vp = (typeof VIEWPORTS)[number];

async function newPage(browser: Browser, vp: Vp): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
  return ctx.newPage();
}

const moveTo = (page: Page, x: number, z: number) =>
  page.evaluate(([px, pz]) => {
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
    rt.client.moveTo(px, pz);
  }, [x, z]);

async function sailTo(page: Page, x: number, z: number) {
  await moveTo(page, x, z);
  await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - x, s.z - z) < 4, 45_000, 250);
  await page.waitForTimeout(700);
}

// Selecciona la entidad más cercana a (x, z) con un clic o toque real sobre su proyección
async function selectNear(page: Page, vp: Vp, kind: string, x: number, z: number): Promise<boolean> {
  const target = (await ships(page))
    .filter((s) => s.kind === kind && s.state === 'alive' && s.screen)
    .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
  if (!target?.screen) return false;
  if (vp.mobile) await page.touchscreen.tap(target.screen.sx, target.screen.sy);
  else await page.mouse.click(target.screen.sx, target.screen.sy);
  await page.waitForTimeout(400);
  return true;
}

const shot = (page: Page, vp: Vp, name: string) => page.screenshot({ path: path.join(OUT, `${vp.name}-${name}.png`) });

// ---- AC-72 (D57, ART-DIRECTION §18.1): captura de legibilidad y su verdad de terreno ----
const LEG_GAP = 16; // D57 b: px CSS entre las cajas de dos barcos
const ROLES = ['self', 'player', 'pirate', 'merchant'];

// Escena de legibilidad: la de AC-72 (D57) o la del I2 de AC-115 (ART-DIRECTION §18.2). Con `byClass`, el rol de un hostil
// sale de su clase, porque la cañonera y el Capitán también son kind 'pirate'. `questions` va al JSON como la lista de
// roles de rejilla.py (D71); sin ella, rejilla.py usa la de AC-72
interface LegibilityScene {
  name: string; // de la captura y del JSON
  ac: string;
  roles: string[]; // los que tienen que salir
  selected: string[]; // rol del objetivo seleccionado; ninguno en AC-115
  selectedLabel: string;
  byClass: boolean;
  questions?: [string, string][];
}
const AC72: LegibilityScene = { name: 'legibility', ac: 'AC-72', roles: ROLES, selected: ['pirate'], selectedLabel: 'un solo objetivo, el pirata', byClass: false };
const AC115: LegibilityScene = {
  name: 'legibility-i2',
  ac: 'AC-115',
  roles: ['self', 'player', 'pirate', 'gunboat', 'captain', 'merchant'],
  selected: [],
  selectedLabel: 'sin objetivo seleccionado',
  byClass: true,
  // La instrucción de §18.2: «un pirata, una cañonera pirata, el capitán pirata, un mercante y otro jugador»
  questions: [['pirate', 'un pirata'], ['gunboat', 'una cañonera pirata'], ['captain', 'el capitán pirata'], ['merchant', 'un mercante'], ['player', 'otro jugador']]
};

type Box = [number, number, number, number]; // x, y, ancho, alto en px CSS
interface Legible {
  id: string;
  role: string; // self, player, pirate o merchant
  selected: boolean;
  ship: Box; // casco, velas y palos: los vértices de la malla, proyectados
  plate: Box | null; // nombre y barra; null si está oculta
  ring: Box | null; // anillo de selección, solo en el objetivo
}
interface Frame {
  viewport: { width: number; height: number; dpr: number };
  elements: Legible[];
}

// Congela el bucle de frames: requestAnimationFrame deja de llamar (a R3F y al HUD), así que el lienzo y las placas se
// quedan en el último frame pintado hasta thaw(), que lo reanuda con los callbacks pendientes
const freeze = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const raf = window.requestAnimationFrame.bind(window);
        raf(() => {
          const queued: FrameRequestCallback[] = [];
          window.requestAnimationFrame = (cb) => (queued.push(cb), 0);
          (window as unknown as { __thaw: () => void }).__thaw = () => {
            window.requestAnimationFrame = raf;
            queued.splice(0).forEach((cb) => raf(cb));
          };
          raf(() => raf(() => resolve())); // por si R3F ya había pedido el frame siguiente con el rAF original
        });
      })
  );
const thaw = (page: Page) => page.evaluate(() => (window as unknown as { __thaw: () => void }).__thaw());

// Cajas de todos los barcos a flote en pantalla, leídas del puente de depuración en el frame congelado
const legibleFrame = (page: Page) =>
  page.evaluate((): Frame => {
    type View = {
      id: string;
      ship: { kind: string; state: string };
      model: { extras: { sb_radius: number } };
      mesh: { visible: boolean; position: { x: number; z: number }; matrixWorld: { elements: number[] }; geometry: { attributes: { position: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } } };
    };
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as {
      views: Map<string, View>;
      myShipId(): string | null;
      plateRects(): { id: string; x: number; y: number; w: number; h: number }[];
      projectInto(x: number, y: number, z: number, out: { sx: number; sy: number }): void;
    };
    const selected = (window.__SEA_BATTLE__!.hud() as { selectedId: string | null }).selectedId;
    const plates = new Map(rt.plateRects().map((p) => [p.id, p]));
    const pt = { sx: 0, sy: 0 };
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const box = (x0: number, y0: number, x1: number, y1: number): Box => [r1(x0), r1(y0), r1(x1 - x0), r1(y1 - y0)];
    const elements: Legible[] = [];
    for (const v of rt.views.values()) {
      if (!v.mesh.visible || v.ship.state !== 'alive') continue;
      const pos = v.mesh.geometry.attributes.position;
      const m = v.mesh.matrixWorld.elements;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        rt.projectInto(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], pt);
        x0 = Math.min(x0, pt.sx); y0 = Math.min(y0, pt.sy); x1 = Math.max(x1, pt.sx); y1 = Math.max(y1, pt.sy);
      }
      if (x1 < 0 || y1 < 0 || x0 > innerWidth || y0 > innerHeight) continue;
      const p = plates.get(v.id);
      let ring: Box | null = null;
      if (v.id === selected) {
        // Anillo de objetivo: círculo de r = sb_radius × 1,1 sobre el agua, con trazo de 3 px y contorno de 1 px
        const R = v.model.extras.sb_radius * 1.1;
        const { x, z } = v.mesh.position;
        rt.projectInto(x - R, 0, z - R, pt);
        const [ax, ay] = [pt.sx, pt.sy];
        rt.projectInto(x + R, 0, z + R, pt);
        ring = box(ax - 2.5, ay - 2.5, pt.sx + 2.5, pt.sy + 2.5);
      }
      elements.push({ id: v.id, role: v.id === rt.myShipId() ? 'self' : v.ship.kind, selected: v.id === selected, ship: box(x0, y0, x1, y1), plate: p ? box(p.x, p.y, p.x + p.w, p.y + p.h) : null, ring });
    }
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, elements };
  });

// Clase de cada barco del runtime (RenderShip.classId), por id
const classIds = (page: Page) =>
  page.evaluate(() => {
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { views: Map<string, { ship: { classId: string } }> };
    return Object.fromEntries([...rt.views.entries()].map(([id, v]) => [id, v.ship.classId])) as Record<string, string>;
  });

// Separación entre dos cajas en el eje en que más se separan (D57 b); negativa si se cruzan
const separation = (a: Box, b: Box) => Math.max(b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2]), b[1] - (a[1] + a[3]), a[1] - (b[1] + b[3]));
const inside = (b: Box, vp: { width: number; height: number }) => b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= vp.width && b[1] + b[3] <= vp.height;

// Caja de los píxeles de cada barco en la captura: la diferencia con una segunda captura del mismo frame congelado sin
// las mallas de los barcos (el HUD y las placas, que son DOM, salen iguales en las dos)
async function shipPixels(page: Page, png: Buffer, ships: Box[]): Promise<(Box | null)[]> {
  await page.evaluate(() => {
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { views: Map<string, { mesh: { visible: boolean } }>; renderFrame(): unknown };
    const hidden = [...rt.views.values()].filter((v) => v.mesh.visible);
    hidden.forEach((v) => (v.mesh.visible = false));
    rt.renderFrame();
    (window as unknown as { __unhide: () => void }).__unhide = () => {
      hidden.forEach((v) => (v.mesh.visible = true));
      rt.renderFrame();
    };
  });
  const without = await page.screenshot();
  await page.evaluate(() => (window as unknown as { __unhide: () => void }).__unhide());
  return page.evaluate(
    async ([a64, b64, ships]) => {
      const pixels = async (b64: string) => {
        const im = new Image();
        im.src = `data:image/png;base64,${b64}`;
        await im.decode();
        const c = document.createElement('canvas');
        [c.width, c.height] = [im.width, im.height];
        const g = c.getContext('2d')!;
        g.drawImage(im, 0, 0);
        return g.getImageData(0, 0, c.width, c.height);
      };
      const [a, b] = [await pixels(a64), await pixels(b64)];
      const k = a.width / innerWidth;
      const PAD = 10; // px CSS alrededor de la caja; los barcos quedan a ≥ 16 px unos de otros
      return ships.map(([x, y, w, h]) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let py = Math.max(0, Math.floor((y - PAD) * k)); py < Math.min(a.height, Math.ceil((y + h + PAD) * k)); py++)
          for (let px = Math.max(0, Math.floor((x - PAD) * k)); px < Math.min(a.width, Math.ceil((x + w + PAD) * k)); px++) {
            const i = (py * a.width + px) * 4;
            if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) <= 16) continue;
            x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px + 1); y1 = Math.max(y1, py + 1);
          }
        return Number.isFinite(x0) ? ([x0 / k, y0 / k, (x1 - x0) / k, (y1 - y0) / k] as [number, number, number, number]) : null;
      });
    },
    [png.toString('base64'), without.toString('base64'), ships] as const
  );
}

// Captura de legibilidad y, junto a ella, el JSON de cajas de D57 (px CSS; `imagePx`, en px de la imagen), del mismo
// frame congelado. Comprueba la verdad de terreno contra los píxeles de la propia captura
async function legibilityShot(page: Page, vp: Vp, scene: LegibilityScene = AC72) {
  await freeze(page);
  const classes = scene.byClass ? await classIds(page) : null;
  const roleOf = (f: Frame): Frame => (classes ? { ...f, elements: f.elements.map((e) => (e.role === 'pirate' ? { ...e, role: classes[e.id] } : e)) } : f);
  const frame = roleOf(await legibleFrame(page));
  const png = await shot(page, vp, scene.name);
  const fromPixels = await shipPixels(page, png, frame.elements.map((e) => e.ship));
  const after = roleOf(await legibleFrame(page));
  await thaw(page);

  const dpr = frame.viewport.dpr;
  const px = (b: Box | null) => b && (b.map((v) => Math.round(v * dpr)) as Box);
  const json = { ...frame, ...(scene.questions ? { roles: scene.questions } : {}), elements: frame.elements.map((e) => ({ ...e, imagePx: { ship: px(e.ship), plate: px(e.plate), ring: px(e.ring) } })) };
  fs.writeFileSync(path.join(OUT, `${vp.name}-${scene.name}.json`), JSON.stringify(json, null, 1).replace(/\[\s+([\d.,\s-]+?)\s+\]/g, (_, v: string) => `[${v.replace(/\s+/g, ' ')}]`));
  const edges = (b: Box) => [b[0], b[1], b[0] + b[2], b[1] + b[3]];
  const misfit = frame.elements.map((e, i) => (fromPixels[i] ? Math.max(...edges(e.ship).map((v, j) => Math.abs(v - edges(fromPixels[i]!)[j]))) : Infinity));
  for (const [i, e] of frame.elements.entries())
    console.log(`${scene.ac} ${vp.name}: ${e.role}${e.selected ? ' (objetivo)' : ''} ${e.id} · barco [${e.ship.join(', ')}] · en la captura [${fromPixels[i]?.map((v) => v.toFixed(1)).join(', ') ?? '—'}] (borde peor ${misfit[i].toFixed(1)} px) · placa ${e.plate ? `[${e.plate.join(', ')}]` : '—'}${e.ring ? ` · anillo [${e.ring.join(', ')}]` : ''}`);

  expect(after, 'las cajas son las del frame de la captura (el frame congelado no cambió)').toEqual(frame);
  expect(frame.elements.map((e) => e.role), `los ${scene.roles.length} tipos de ${scene.ac}`).toEqual(expect.arrayContaining(scene.roles));
  expect(frame.elements.filter((e) => e.selected).map((e) => e.role), scene.selectedLabel).toEqual(scene.selected);
  for (const e of frame.elements) {
    for (const [name, b] of [['barco', e.ship], ['placa', e.plate], ['anillo', e.ring]] as const)
      if (b) expect.soft(inside(b, frame.viewport), `${e.role} ${e.id}: ${name} dentro del viewport`).toBe(true);
    expect.soft(e.plate, `${e.role} ${e.id}: placa visible`).not.toBeNull();
  }
  frame.elements.forEach((a, i) =>
    frame.elements.slice(i + 1).forEach((b) => expect.soft(separation(a.ship, b.ship), `D57 b: ${a.role} ${a.id} y ${b.role} ${b.id} a ≥ ${LEG_GAP} px CSS`).toBeGreaterThanOrEqual(LEG_GAP))
  );
  for (const [i, e] of frame.elements.entries()) expect.soft(misfit[i], `${e.role} ${e.id}: la caja coincide con los píxeles del barco en la captura, sin nada del DOM encima (borde peor, px CSS)`).toBeLessThanOrEqual(2);
}

test.describe('Capturas @capture', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  // Inicio de sesión y registro (AC-140, D53), también en horizontal, donde la tarjeta no cabe en alto
  for (const vp of [...VIEWPORTS, { name: 'mobile-landscape', width: 844, height: 390, mobile: true }]) {
    test(`inicio de sesión y registro en ${vp.name} (${vp.width}×${vp.height})`, async ({ browser }) => {
      const page = await newPage(browser, vp);
      try {
        for (const route of ['sign-in', 'sign-up']) {
          await page.goto(`${AUTH}/${route}`);
          await expect(page.locator('.cl-formButtonPrimary')).toBeVisible({ timeout: 30_000 });
          await page.waitForLoadState('networkidle');
          await shot(page, vp, route);
        }
      } finally {
        await page.context().close();
      }
    });
  }

  for (const vp of VIEWPORTS) {
    test(`escenas estándar en ${vp.name} (${vp.width}×${vp.height})`, async ({ browser }) => {
      test.setTimeout(240_000);
      const page = await newPage(browser, vp);
      const other = await newPage(browser, vp);
      try {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await shot(page, vp, 'landing');

        await enterGame(page, SHOWCASE);
        await page.waitForTimeout(1200);
        await shot(page, vp, 'spawn');

        // Tienda en el puerto (§14)
        await page.keyboard.press('KeyP');
        await page.waitForTimeout(500);
        await shot(page, vp, 'shop');
        await page.keyboard.press('Escape');

        // Mar abierto con pirata, mercante y restos (estándar §18: barco quieto, zoom 1×)
        await sailTo(page, 0, 200);
        await shot(page, vp, 'open-sea');

        // Otro jugador cerca y el pirata seleccionado, para el combate (la captura de AC-72 tiene su propio test)
        await enterGame(other, SHOWCASE);
        await moveTo(other, -18, 228);
        await waitFor(() => ships(page), (list) => list.filter((s) => s.kind === 'player').length >= 2, 30_000, 250);
        await waitFor(() => me(other), (s) => !!s && Math.hypot(s.x + 18, s.z - 228) < 4, 45_000, 250);
        await selectNear(page, vp, 'pirate', 45, 205);

        // Combate: atacar al pirata (pierde la protección) y esperar andanadas de ambos lados
        if (vp.mobile) await page.getByTestId('m-attack').tap();
        else await page.keyboard.press('Space');
        await page.waitForTimeout(6500);
        await shot(page, vp, 'combat');

        // Objetivo junto a la costa de I5 (AC-74)
        await page.keyboard.press('Escape');
        await sailTo(page, 20, 270);
        await selectNear(page, vp, 'pirate', 20, 318);
        await shot(page, vp, 'target-coast');
      } finally {
        await page.context().close();
        await other.context().close();
      }
    });
  }

  // Los dos jugadores, cada uno en su puesto de la escena, quietos y sin la protección de la salida. Sin las pistas de
  // primera sesión, para que la imagen sea la de una partida normal
  async function toPosts(page: Page, other: Page, url: string, self: { x: number; z: number }, otherPost: { x: number; z: number }) {
    for (const p of [page, other]) await p.addInitScript(() => localStorage.setItem('sea-battle-hints', '3')); // pistas vistas
    await enterGame(page, url);
    await enterGame(other, url);
    await moveTo(page, self.x, self.z);
    await moveTo(other, otherPost.x, otherPost.z);
    for (const [p, post] of [[page, self], [other, otherPost]] as const)
      await waitFor(() => p.evaluate(() => ({ s: window.__SEA_BATTLE__!.me() as { x: number; z: number; protectedUntil: number } | null, t: window.__SEA_BATTLE__!.serverTime() })), ({ s, t }) => !!s && Math.hypot(s.x - post.x, s.z - post.z) < 2 && s.protectedUntil <= t, 60_000, 250);
    await waitFor(() => ships(page), (list) => list.filter((s) => s.kind === 'player').length === 2, 30_000, 250);
    await page.waitForTimeout(700); // el barco termina de frenar
  }

  // AC-72 (D57): los 5 elementos (barco propio, otro jugador, pirata, mercante y el pirata como objetivo) en la pose fija
  // del escenario "legibility", en un servidor propio sin más NPC
  for (const vp of VIEWPORTS) {
    test(`legibilidad en ${vp.name} (AC-72)`, async ({ browser }) => {
      test.setTimeout(150_000);
      const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'legibility' });
      const page = await newPage(browser, vp);
      const other = await newPage(browser, vp);
      try {
        await toPosts(page, other, server.url, LEGIBILITY.self, LEGIBILITY.other);
        await selectNear(page, vp, 'pirate', LEGIBILITY.pirate.x, LEGIBILITY.pirate.z);
        await legibilityShot(page, vp);
      } finally {
        await page.context().close();
        await other.context().close();
        await server.kill();
      }
    });
  }

  // AC-115 (ART-DIRECTION §18.2): la escena del I2 para los evaluadores-agente, con el escenario "legibility-i2" en un
  // servidor propio con el I2 encendido y sin más NPC: pirata, cañonera, Capitán y mercante quietos con los rumbos de AD-28,
  // y los dos jugadores. Sin objetivo seleccionado
  for (const vp of VIEWPORTS) {
    test(`legibilidad del I2 en ${vp.name} (AC-115)`, async ({ browser }) => {
      test.setTimeout(150_000);
      const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: 'legibility-i2' });
      const page = await newPage(browser, vp);
      const other = await newPage(browser, vp);
      try {
        await toPosts(page, other, server.url, LEGIBILITY_I2.self, LEGIBILITY_I2.other);
        await legibilityShot(page, vp, AC115);
      } finally {
        await page.context().close();
        await other.context().close();
        await server.kill();
      }
    });
  }

  // AC-189 (ART-DIRECTION §12.10, D77): la cañonera seleccionada con la Balandra N1 y la marca «Demasiado fuerte para tu
  // barco» en el panel del objetivo, con el escenario "danger" en un servidor propio con el I2 encendido. El e2e de AC-189
  // (e2e/danger-mark.spec.ts) mide los 3 tamaños; esto es la imagen para ux
  for (const vp of VIEWPORTS) {
    test(`marca de peligro en ${vp.name} (AC-189)`, async ({ browser }) => {
      test.setTimeout(120_000);
      const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: 'danger' });
      const page = await newPage(browser, vp);
      try {
        await enterGame(page, server.url);
        await sailTo(page, 0, 100); // dentro de la zona segura, a 54 m de la cañonera y del pirata
        expect(await selectNear(page, vp, 'pirate', DANGER.gunboat.x, DANGER.gunboat.z), 'la cañonera está en pantalla').toBe(true);
        await expect(page.getByTestId('target-type')).toHaveText('Demasiado fuerte para tu barco');
        await shot(page, vp, 'danger-mark');
      } finally {
        await page.context().close();
        await server.kill();
      }
    });
  }

  // AD-32 (D39): el pirata de la escena "gallery" bajo el minimapa, con la placa a 4 px del borde inferior del panel
  // (oculta: está a menos de 8 px) y a 24 px del último bloque del HUD bajo el minimapa (visible). En escritorio ese
  // bloque es el propio minimapa; en 390×844, «Zona segura», que ocupa todo el ancho 8 px más abajo y es bloque desde D41
  // (O-10)
  for (const vp of VIEWPORTS) {
    test(`placa bajo el minimapa en ${vp.name} (AD-32)`, async ({ browser }) => {
      test.setTimeout(60_000);
      const page = await newPage(browser, vp);
      try {
        await enterGame(page, SHOWCASE);
        await page.mouse.move(5, 450);
        await page.evaluate(() => {
          const rt = window.__SEA_BATTLE__!.runtime();
          rt.setCameraPreset('game');
          rt.setZoomLevel(1);
          const scene = rt.startScene('gallery');
          scene.setPose('g-sloop', scene.focus.x + 10_000, scene.focus.z, Math.PI / 2);
          scene.setPose('g-pirate', scene.focus.x, scene.focus.z, Math.PI / 2);
          (window as unknown as { __capScene: typeof scene }).__capScene = scene;
        });
        await page.waitForTimeout(1500);
        for (const [name, gap, stack] of [['hud-plate-under', 4, false], ['hud-plate-near', 24, true]] as const) {
          await page.evaluate(async ([gap, stack]) => {
            const rt = window.__SEA_BATTLE__!.runtime();
            const scene = (window as unknown as { __capScene: { setPose(id: string, x: number, z: number, h: number): void; getShip(id: string): { x: number; z: number } | undefined } }).__capScene;
            const frames = (n: number) => new Promise<void>((resolve) => { const f = () => (--n <= 0 ? resolve() : requestAnimationFrame(f)); requestAnimationFrame(f); });
            const mm = document.querySelector('[data-testid="minimap"]')!.getBoundingClientRect();
            const zone = document.querySelector('[data-testid="safe-zone"]')?.getBoundingClientRect();
            const below = stack && zone && zone.height > 0 && zone.left < mm.right && zone.right > mm.left ? Math.max(mm.bottom, zone.bottom) : mm.bottom;
            for (let i = 0; i < 3; i++) {
              const p = document.querySelector('[data-plate][data-ship-id="g-pirate"] .wo-plate__body')!.getBoundingClientRect();
              const s = scene.getShip('g-pirate')!;
              const o = rt.project(s.x, s.z)!, px = rt.project(s.x + 1, s.z)!, pz = rt.project(s.x, s.z + 1)!;
              const dx = mm.left + mm.width / 2 - (p.left + p.width / 2), dy = below + gap - p.top;
              scene.setPose('g-pirate', s.x + dx / (px.sx - o.sx), s.z + dy / (pz.sy - o.sy), Math.PI / 2);
              await frames(3);
            }
          }, [gap, stack] as const);
          await page.waitForTimeout(400); // vuelta con el fundido de 150 ms
          await shot(page, vp, name);
          // El par documenta los dos estados (D52): oculta a 4 px y, con opacidad 1, a 16–32 px del bloque del HUD más
          // cercano. 16 es el umbral de vuelta de la histéresis (§11.4) y 32 obliga a que esté junto al bloque
          const plate = await page.evaluate(() => {
            const root = document.querySelector<HTMLElement>('[data-plate][data-ship-id="g-pirate"]')!;
            const body = root.querySelector('.wo-plate__body')!;
            const cs = getComputedStyle(root);
            const op = cs.display === 'none' || cs.visibility === 'hidden' ? 0 : Number(cs.opacity) * Number(getComputedStyle(body).opacity);
            const p = body.getBoundingClientRect();
            const blocks = Array.from(document.querySelectorAll('[data-hud-block]')).map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
            return { op, sep: Math.min(...blocks.map((b) => Math.max(b.left - p.right, p.left - b.right, b.top - p.bottom, p.top - b.bottom))) };
          });
          console.log(`AD-32 captura ${vp.name}-${name}: opacidad ${plate.op.toFixed(2)} · separación mín. a un bloque del HUD ${plate.sep.toFixed(1)} px`);
          if (stack) {
            expect.soft(plate.op, `${vp.name}-${name}: placa visible`).toBeGreaterThan(0.99);
            expect.soft(plate.sep, `${vp.name}-${name}: a 16–32 px del bloque más cercano`).toBeGreaterThanOrEqual(16);
            expect.soft(plate.sep, `${vp.name}-${name}: a 16–32 px del bloque más cercano`).toBeLessThanOrEqual(32);
          } else expect.soft(plate.op, `${vp.name}-${name}: placa oculta`).toBe(0);
        }
        await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stopScene());
      } finally {
        await page.context().close();
      }
    });
  }
});

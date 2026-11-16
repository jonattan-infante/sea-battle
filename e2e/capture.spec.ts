// Capturas estándar para QA y UX (ART-DIRECTION §18) sobre el escenario determinista "showcase"
// (server/scenarios.ts): pirata a 45 m, mercante a 40 m, pirata junto a la isla I5 y restos. Las de legibilidad (AC-72 y,
// con el I2, AC-115) van en su propio servidor con los escenarios "legibility" y "legibility-i2".
import { Browser, expect, Page, test } from '@playwright/test';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PORTS } from '../playwright.config';
import { DANGER, LEGIBILITY, LEGIBILITY_165, LEGIBILITY_165_390, LEGIBILITY_165_HARBOR, LEGIBILITY_I2, LEGIBILITY_I2_90 } from '../server/scenarios';
import { postFamilyPlayers } from './family-visitors';
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
  // D107 (recolocar las escenas, «Lejos de las líneas» de §18.1): dónde está el barco, para calcular sus puestos. `pos`, x y z
  // en el mundo (m); `anchor`, ese punto sobre el agua en pantalla (px CSS); `headingDeg`, su rumbo (mesh.rotation.y)
  pos: [number, number];
  anchor: [number, number];
  headingDeg: number;
}
interface Frame {
  viewport: { width: number; height: number; dpr: number };
  hud: Box[]; // los bloques visibles del HUD ([data-hud-block]), para que los barcos queden fuera
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
      mesh: { visible: boolean; position: { x: number; z: number }; rotation: { y: number }; matrixWorld: { elements: number[] }; geometry: { attributes: { position: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } } };
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
      rt.projectInto(v.mesh.position.x, 0, v.mesh.position.z, pt);
      const world: [number, number] = [r1(v.mesh.position.x), r1(v.mesh.position.z)];
      const anchor: [number, number] = [r1(pt.sx), r1(pt.sy)];
      const headingDeg = Math.round(((((v.mesh.rotation.y * 180) / Math.PI) % 360) + 360) % 360);
      elements.push({ id: v.id, role: v.id === rt.myShipId() ? 'self' : v.ship.kind, selected: v.id === selected, ship: box(x0, y0, x1, y1), plate: p ? box(p.x, p.y, p.x + p.w, p.y + p.h) : null, ring, pos: world, anchor, headingDeg });
    }
    const hud = [...document.querySelectorAll<HTMLElement>('[data-hud-block]')]
      .filter((el) => getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => box(r.left, r.top, r.right, r.bottom));
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, hud, elements };
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

// Cómo encaja la caja del JSON (vértices de la malla) con los píxeles del barco en la captura: `outside`, lo que los píxeles se
// salen de la caja (lo que delata un DOM encima o un frame distinto del de la captura); `slack`, lo que la caja sobra. La caja
// puede sobrar algo en las puntas de los palos y del bauprés, que miden 1-2 px y quedan bajo el umbral de la diferencia
// (medido en la 1.3: de 2,5 a 6,6 px en los Navíos y las Goletas del GLB; el máximo, el gallardete azul marino del Navío
// británico sobre el agua). Lo que delata un DOM encima o un frame distinto es `outside` (≤ 0,9 px en las mismas capturas)
const BOX_OUTSIDE_PX = 2;
const BOX_SLACK_PX = 8;
const fit = (b: Box, p: Box | null) => {
  if (!p) return { outside: Infinity, slack: Infinity };
  const [bx1, by1, px1, py1] = [b[0] + b[2], b[1] + b[3], p[0] + p[2], p[1] + p[3]];
  return { outside: Math.max(b[0] - p[0], b[1] - p[1], px1 - bx1, py1 - by1, 0), slack: Math.max(p[0] - b[0], p[1] - b[1], bx1 - px1, by1 - py1, 0) };
};

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
  const fits = frame.elements.map((e, i) => fit(e.ship, fromPixels[i]));
  for (const [i, e] of frame.elements.entries())
    console.log(`${scene.ac} ${vp.name}: ${e.role}${e.selected ? ' (objetivo)' : ''} ${e.id} · barco [${e.ship.join(', ')}] · en la captura [${fromPixels[i]?.map((v) => v.toFixed(1)).join(', ') ?? '—'}] (fuera ${fits[i].outside.toFixed(1)} px, sobra ${fits[i].slack.toFixed(1)} px) · placa ${e.plate ? `[${e.plate.join(', ')}]` : '—'}${e.ring ? ` · anillo [${e.ring.join(', ')}]` : ''}`);

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
  for (const [i, e] of frame.elements.entries()) {
    expect.soft(fits[i].outside, `${e.role} ${e.id}: los píxeles del barco caben en su caja, sin nada del DOM encima (px CSS fuera)`).toBeLessThanOrEqual(BOX_OUTSIDE_PX);
    expect.soft(fits[i].slack, `${e.role} ${e.id}: la caja no sobra más que las puntas finas (px CSS)`).toBeLessThanOrEqual(BOX_SLACK_PX);
  }
}

// D107 («Lejos de las líneas», ART-DIRECTION §18.1; H-D106-2 de QA-78): las escenas de los evaluadores (la relación y las clases de
// AC-165, la mezcla de AC-194 d y las 2 disposiciones de AC-194 c) se miden con la rejilla de D57 desplazada a un origen fijo por
// tamaño: la primera línea vertical
// en x y la primera horizontal en y (px CSS). En la pose de AC-72 la cámara centra el barco propio, y con 12 × 8 y 6 × 12 el centro
// de la pantalla es un cruce: con el origen de siempre, el propio cae sobre 2 líneas (QA-78: a 0,0–0,8 px). Se desplaza el origen
// y no la cámara: mover la cámara pide la vista libre, que añade al HUD el botón Centrar y el indicador del propio, y la pose de
// AC-72 dejaría de ser la de una partida. Con (60, 30) en 1440×900 y (32,5, 26,5) en 390×844, el propio de la relación (la caja de
// la Balandra, de y = 380 a 535 con su placa en 1440×900) queda en el centro de su celda, a ≥ 0,35 de celda de las líneas y con su
// zona en 2 filas; las celdas de los bordes miden ≥ 0,27 de celda, así que ninguna se funde (rejilla de 13 × 9 y de 7 × 13). Las
// demás escenas ponen sus barcos en esa misma rejilla
const GRID_ORIGIN: Record<string, [number, number]> = { desktop: [60, 30], mobile: [32.5, 26.5] };
// rejilla.py necesita numpy y PIL, que la CI no tiene: esto corre en qa:capture. REJILLA_PYTHON elige el intérprete
const REJILLA_PYTHON = process.env.REJILLA_PYTHON ?? 'python3';

// La imagen vale para los evaluadores según D57 y D107: `scripts/ux/rejilla.py --estricto` con el origen fijo de su tamaño (sale con
// 2 si un centro preguntado queda a < ¼ de celda de una línea, si 2 roles distintos comparten celda o si 2 barcos quedan a < 16 px).
// Deja en qa-artifacts/rejilla/ las imágenes con la rejilla, la clave y las celdas, que es el material del lote
function gridCheck(vp: Vp, name: string) {
  const [x, y] = GRID_ORIGIN[vp.name];
  const args = ['-I', path.join(__dirname, '..', 'scripts', 'ux', 'rejilla.py'), path.join(OUT, `${vp.name}-${name}.png`), path.join(OUT, `${vp.name}-${name}.json`), path.join(OUT, 'rejilla'), '--origen', `${x},${y}`, '--estricto'];
  const r = spawnSync(REJILLA_PYTHON, args, { encoding: 'utf8' });
  const avisos = (r.stdout ?? '').split('\n').filter((l) => l.startsWith('**Aviso:**'));
  console.log(`rejilla.py ${vp.name}-${name} (origen ${x},${y}): exit ${r.status}${avisos.length ? `\n${avisos.join('\n')}` : ', sin avisos'}`);
  expect.soft(r.status, `rejilla.py --estricto ${vp.name}-${name}: ${avisos.join(' · ') || r.stderr || r.error} (REJILLA_PYTHON = un python con numpy y PIL)`).toBe(0);
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

  // AC-165 (relación) con las familias (ART-DIRECTION §21, D106): la pose de AC-72 (el pirata seleccionado) con 3 otros jugadores
  // de la clase de la corrida, uno por aspecto (sin familia, británica y española), en el escenario "legibility-165" (1440×900) o
  // "legibility-165-390" (390×844), cada uno con sus puestos de D107 (LEGIBILITY_165 y LEGIBILITY_165_390). Los 3 son
  // jugadores-bot por Socket.IO (e2e/family-visitors.ts); la página propia es la única con navegador.
  // La captura espera a que los 4 estén quietos y sin protección, y a que el cliente propio pinte a cada uno con su modelo final
  // (el GLB con su KTX2, o el procedural sin familia). El mismo JSON y las mismas comprobaciones que AC-72; la instrucción es la
  // de AC-72, sin cambios. Archivos: <vp>-legibility-165-<clase>.{png,json}
  for (const vp of VIEWPORTS) {
    test(`legibilidad con 3 Goletas y 3 Navíos en ${vp.name} (AC-165 relación, con las familias; D106)`, async ({ browser }) => {
      test.setTimeout(600_000);
      const rel = vp.mobile ? { scenario: 'legibility-165-390', spec: LEGIBILITY_165_390 } : { scenario: 'legibility-165', spec: LEGIBILITY_165 };
      for (const classId of ['schooner', 'line'] as const) {
        const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: rel.scenario });
        const page = await newPage(browser, vp);
        let others: ReturnType<typeof postFamilyPlayers> | null = null;
        try {
          await page.addInitScript(() => localStorage.setItem('sea-battle-hints', '3')); // pistas vistas
          await enterGame(page, server.url);
          const bots = postFamilyPlayers(server.url, rel.spec.posts.map((p) => ({ classId, family: p.family, harbor: LEGIBILITY_165_HARBOR, via: p.via, post: p.post })));
          others = bots;
          await moveTo(page, LEGIBILITY.self.x, LEGIBILITY.self.z);
          await bots.ready;
          // Los 4 jugadores, quietos en su puesto y sin protección
          await waitFor(
            () => page.evaluate(() => ({ list: window.__SEA_BATTLE__!.ships() as { kind: string; x: number; z: number; protectedUntil: number }[], t: window.__SEA_BATTLE__!.serverTime() })),
            ({ list, t }) => list.filter((s) => s.kind === 'player' && s.protectedUntil <= t).length === 4,
            60_000,
            250
          );
          await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - LEGIBILITY.self.x, s.z - LEGIBILITY.self.z) < 2, 60_000, 250);
          const want = rel.spec.posts.map((p) => ({ sbId: `ship_${classId}${p.family === 'none' ? '' : `_${p.family}`}`, current: true, ktx2: p.family === 'none' ? null : true })).sort((a, b) => a.sbId.localeCompare(b.sbId));
          await expect
            .poll(
              () =>
                page.evaluate((ids) => {
                  type View = { ship: { classId: string; family: string | null }; model: { extras: { sb_id: string }; map?: { isCompressedTexture?: boolean } | null } };
                  const rt = window.__SEA_BATTLE__!.runtime() as unknown as { views: Map<string, View>; shipGlb: { model(k: string): unknown } };
                  return ids
                    .map((id) => rt.views.get(id))
                    .map((v) => {
                      if (!v) return null;
                      const key = v.ship.family && v.ship.family !== 'none' ? `${v.ship.classId}:${v.ship.family}` : v.ship.classId;
                      return { sbId: v.model.extras.sb_id, current: v.model === rt.shipGlb.model(key), ktx2: v.model.map ? v.model.map.isCompressedTexture === true : null };
                    })
                    .sort((a, b) => (a?.sbId ?? '').localeCompare(b?.sbId ?? ''));
                }, bots.shipIds()),
              { timeout: 60_000 }
            )
            .toEqual(want);
          await page.waitForTimeout(700); // los barcos terminan de frenar
          await selectNear(page, vp, 'pirate', rel.spec.pirate.x, rel.spec.pirate.z);
          await legibilityShot(page, vp, { ...AC72, name: `legibility-165-${classId}`, ac: `AC-165 ${classId}` });
          gridCheck(vp, `legibility-165-${classId}`);
        } finally {
          others?.stop();
          await page.context().close();
          await server.kill();
        }
      }
    });
  }

  // AC-165 (clases; AD-37 c, ART-DIRECTION §18.2), sin familia y en las 2 familias (AC-194 b): la escena «fleet-1-1» con la
  // galería de familias. Por familia: (1) la tira de referencia en color, con las 5 clases a 225° en el orden de la tienda y
  // su nombre escrito debajo, sin rejilla; (2) la imagen de la prueba, las mismas 5 a 45° en un orden barajado en el que
  // ninguna queda en el puesto que tiene en la referencia, con su JSON de cajas (rejilla.py la pasa a grises, que es la que se
  // usa). Sin placas: no dicen la clase y ocupan sitio. Una fila en 1440×900 y 2 en 390×844. Como en las demás escenas de
  // §18.2, sin pistas ni protección de salida: el barco propio (fuera de la escena) espera en mar abierto, fuera de la zona
  // segura, en un servidor propio sin NPC. Archivos: <vp>-fleet-1-1-<familia>-referencia.png, <vp>-fleet-1-1-<familia>.{png,json}
  const FLEET_ORDER = ['sloop', 'brig', 'schooner', 'frigate', 'line'] as const; // el de la tienda (PLAYER_SHIP_ORDER)
  const FLEET_WAIT = { x: 0, z: -140 }; // el barco propio, fuera de la zona segura (r 110) mientras se ve la escena
  const FLEET_SHUFFLE = { desktop: ['frigate', 'sloop', 'line', 'schooner', 'brig'], mobile: ['schooner', 'line', 'sloop', 'brig', 'frigate'] } as const;
  // Puestos (m desde el foco). Los de la referencia, en una fila (2 en 390×844). Los de la prueba (D107, «Lejos de las líneas»), en
  // la rejilla del origen fijo (GRID_ORIGIN): cada clase es un rol, así que ninguna puede compartir celda con otra, y la Fragata y
  // el Navío ocupan 3 × 3 celdas, así que van en 2 filas: arriba, los 3 primeros del orden barajado y abajo los 2 últimos (en
  // 390×844, 2 + 1 + 2). Salen de un buscador sobre las cajas medidas de las 3 familias a la vez, porque comparten puesto: centros
  // a ≥ 0,42 de celda de las líneas y las zonas infladas 12 px sin celdas compartidas. El orden de lectura (por filas, de
  // izquierda a derecha) es el del barajado, así que ninguna clase queda en el puesto que tiene en la referencia
  const FLEET_SLOTS = { desktop: [[-80, 0], [-40, 0], [0, 0], [40, 0], [80, 0]], mobile: [[-40, -30], [0, -30], [40, -30], [-22, 30], [22, 30]] } as const;
  const FLEET_TEST_SLOTS = {
    desktop: [[-59.5, -22.5], [-1, -25], [56, -20.5], [-60, 44], [57.5, 43.5]],
    mobile: [[-48, -59], [22, -57], [-0.5, -1.5], [-47, 63], [45, 64]]
  } as const;
  const FLEET_ROLE: Record<string, string> = { sloop: 'sloop', brig: 'brigantine', schooner: 'schooner', frigate: 'frigate', line: 'line' }; // roles de §18.2
  const FLEET_NAME: Record<string, string> = { sloop: 'Balandra', brig: 'Bergantín', schooner: 'Goleta', frigate: 'Fragata', line: 'Navío de línea' };
  // La lista de roles para rejilla.py, con las palabras de la instrucción de §18.2
  const FLEET_QUESTIONS: [string, string][] = [['sloop', 'la Balandra'], ['brigantine', 'el Bergantín'], ['schooner', 'la Goleta'], ['frigate', 'la Fragata'], ['line', 'el Navío de línea']];

  // La galería de familias para las escenas de §18.2 y §21: en un servidor propio sin NPC, sin pistas ni protección de salida (el
  // barco propio espera en mar abierto, fuera de la escena y de la zona segura), sin placas (no dicen la clase ni la familia y
  // ocupan sitio), sin HUD (ux, D106: su panel decía «Balandra», el barco propio, que es uno de los nombres que pregunta la
  // flota; la pose de AC-72 sí lo lleva) y con las 10 combinaciones cargadas con su KTX2, como en el juego. Con `hud`, las placas y
  // el HUD se ven, como en la pose de AC-72 (la mezcla); `myShipId`, el barco de la galería que hace de propio
  async function galleryCapture(page: Page, url: string, opts: { hud?: boolean; myShipId?: string } = {}) {
    await page.addInitScript(() => localStorage.setItem('sea-battle-hints', '3')); // pistas vistas
    await enterGame(page, url);
    await moveTo(page, FLEET_WAIT.x, FLEET_WAIT.z);
    await waitFor(
      () => page.evaluate(() => ({ s: window.__SEA_BATTLE__!.me() as { x: number; z: number; protectedUntil: number } | null, t: window.__SEA_BATTLE__!.serverTime() })),
      ({ s, t }) => !!s && Math.hypot(s.x - FLEET_WAIT.x, s.z - FLEET_WAIT.z) < 3 && s.protectedUntil <= t,
      60_000,
      250
    );
    await page.mouse.move(5, 450);
    if (!opts.hud) await page.addStyleTag({ content: '.wo-plate, [data-testid="hud"] { visibility: hidden !important; }' });
    await page.evaluate((myShipId) => {
      const rt = window.__SEA_BATTLE__!.runtime();
      rt.setCameraPreset('game');
      rt.setZoomLevel(1);
      (window as unknown as { __capScene: unknown }).__capScene = rt.startScene('gallery', { families: true, ...(myShipId ? { myShipId } : {}) });
    }, opts.myShipId ?? null);
    await expect
      .poll(() => page.evaluate(() => {
        const glb = (window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { loaded(k: string): boolean; model(k: string): { map?: { isCompressedTexture?: boolean } | null } } }).shipGlb;
        return ['sloop', 'brig', 'schooner', 'frigate', 'line'].flatMap((c) => [`${c}:gb`, `${c}:es`]).every((k) => glb.loaded(k) && glb.model(k).map?.isCompressedTexture === true);
      }), { timeout: 120_000 })
      .toBe(true);
  }

  // Pone barcos de la galería («g-<clase>-<familia>», «g-pirate», «g-merchant») en puestos (m desde el foco) con su rumbo en grados
  // y, si lo lleva, el nombre de su placa; los demás, lejos
  const placeGallery = (page: Page, ships: { id: string; dx: number; dz: number; headingDeg: number; name?: string }[]) =>
    page.evaluate((ships) => {
      type Scene = { focus: { x: number; z: number }; setPose(id: string, x: number, z: number, h: number): void; getShip(id: string): { name: string } | undefined; spec: { ships: { id: string }[] } };
      const scene = (window as unknown as { __capScene: Scene }).__capScene;
      scene.spec.ships.forEach((s, i) => scene.setPose(s.id, scene.focus.x + 10_000 + 2000 * i, scene.focus.z, Math.PI / 2));
      for (const s of ships) {
        scene.setPose(s.id, scene.focus.x + s.dx, scene.focus.z + s.dz, (s.headingDeg * Math.PI) / 180);
        const ship = s.name ? scene.getShip(s.id) : undefined;
        if (ship && s.name) ship.name = s.name;
      }
    }, ships);

  // Nombres escritos debajo de cada barco, para las tiras de referencia (texto blanco con sombra, sin rejilla)
  const writeNames = (page: Page, labels: { text: string; x: number; y: number }[]) =>
    page.evaluate((labels) => {
      for (const l of labels) {
        const d = document.createElement('div');
        d.className = 'cap-fleet-name';
        d.textContent = l.text;
        d.style.cssText = `position:fixed;left:${l.x}px;top:${l.y}px;transform:translateX(-50%);font:700 15px Arial,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 2px #000,0 1px 2px #000;white-space:nowrap;z-index:99;pointer-events:none`;
        document.body.appendChild(d);
      }
    }, labels);
  const clearNames = (page: Page) => page.evaluate(() => document.querySelectorAll('.cap-fleet-name').forEach((d) => d.remove()));

  for (const vp of VIEWPORTS) {
    test(`flota de las 5 clases en ${vp.name} (AC-165 clases, AD-37 c; con las familias)`, async ({ browser }) => {
      test.setTimeout(300_000);
      const server = await startOwnServer({ SEA_BATTLE_NPCS: '0' });
      const page = await newPage(browser, vp);
      try {
        await galleryCapture(page, server.url);
        const vpName = vp.name as 'desktop' | 'mobile';
        // Pone las 5 clases de una familia en los puestos (las demás, lejos) con un rumbo
        const place = (family: string, order: readonly string[], headingDeg: number, slots: readonly (readonly number[])[]) =>
          placeGallery(page, order.map((c, i) => ({ id: `g-${c}-${family}`, dx: slots[i][0], dz: slots[i][1], headingDeg })));
        const classOf = (id: string) => id.split('-')[1];
        for (const family of ['none', 'gb', 'es'] as const) {
          // (1) Tira de referencia: 225°, en color, con el nombre debajo de cada barco
          await place(family, FLEET_ORDER, 225, FLEET_SLOTS[vpName]);
          await page.waitForTimeout(800);
          await freeze(page);
          const ref = await legibleFrame(page);
          expect(ref.elements.map((e) => classOf(e.id)).sort(), `referencia ${family}: las 5 clases en pantalla`).toEqual([...FLEET_ORDER].sort());
          await writeNames(page, ref.elements.map((e) => ({ text: FLEET_NAME[classOf(e.id)], x: e.ship[0] + e.ship[2] / 2, y: e.ship[1] + e.ship[3] + 6 })));
          await shot(page, vp, `fleet-1-1-${family}-referencia`);
          await clearNames(page);
          await thaw(page);

          // (2) La prueba: 45°, orden barajado; rejilla.py la pasa a grises
          const order = FLEET_SHUFFLE[vpName];
          order.forEach((c, i) => expect(c, `orden barajado: ${c} no queda en su puesto de la referencia`).not.toBe(FLEET_ORDER[i]));
          await place(family, order, 45, FLEET_TEST_SLOTS[vpName]);
          await page.waitForTimeout(800);
          await freeze(page);
          const frame = await legibleFrame(page);
          const png = await shot(page, vp, `fleet-1-1-${family}`);
          const fromPixels = await shipPixels(page, png, frame.elements.map((e) => e.ship));
          await thaw(page);
          const dpr = frame.viewport.dpr;
          const px = (b: Box | null) => b && (b.map((v) => Math.round(v * dpr)) as Box);
          const elements = frame.elements.map((e) => ({ ...e, role: FLEET_ROLE[classOf(e.id)], selected: false, plate: null, ring: null }));
          const json = { viewport: frame.viewport, roles: FLEET_QUESTIONS, elements: elements.map((e) => ({ ...e, imagePx: { ship: px(e.ship), plate: null, ring: null } })) };
          fs.writeFileSync(path.join(OUT, `${vp.name}-fleet-1-1-${family}.json`), JSON.stringify(json, null, 1).replace(/\[\s+([\d.,\s-]+?)\s+\]/g, (_, v: string) => `[${v.replace(/\s+/g, ' ')}]`));
          for (const [i, e] of elements.entries())
            console.log(`AC-165 clases ${vp.name} ${family}: ${e.role} ${e.id} · barco [${e.ship.join(', ')}] · en la captura [${fromPixels[i]?.map((v) => v.toFixed(1)).join(', ') ?? '—'}]`);
          expect(elements.map((e) => e.role).sort(), `${family}: las 5 clases`).toEqual(FLEET_QUESTIONS.map(([r]) => r).sort());
          for (const e of elements) expect.soft(inside(e.ship, frame.viewport), `${family} ${e.id}: dentro del viewport`).toBe(true);
          elements.forEach((a, i) => elements.slice(i + 1).forEach((b) => expect.soft(separation(a.ship, b.ship), `D57 b: ${a.id} y ${b.id} a ≥ ${LEG_GAP} px CSS`).toBeGreaterThanOrEqual(LEG_GAP)));
          for (const [i, e] of elements.entries()) {
            const f = fit(e.ship, fromPixels[i]);
            expect.soft(f.outside, `${family} ${e.id}: los píxeles del barco caben en su caja (px CSS fuera)`).toBeLessThanOrEqual(BOX_OUTSIDE_PX);
            expect.soft(f.slack, `${family} ${e.id}: la caja no sobra más que las puntas finas (px CSS)`).toBeLessThanOrEqual(BOX_SLACK_PX);
          }
          gridCheck(vp, `fleet-1-1-${family}`);
        }
      } finally {
        await page.context().close();
        await server.kill();
      }
    });
  }

  // AC-194 (d) y AC-72 con las familias (ART-DIRECTION §21, D106): la escena mezclada de QA-78 §7, que vivía en una sonda del
  // scratchpad de QA (probe/mixed.js) y se porta aquí para que todas las imágenes del lote salgan del mismo commit (BACKLOG,
  // «Adenda de QA-78 (D106)», reglas del lote). La galería con familias: el barco propio sin familia (el Bergantín, `myShipId`),
  // un Navío británico junto al mercante y una Fragata española junto al pirata (los pares de color más cercanos, AC-194 d), y
  // la Goleta sin familia como otro jugador. Con placas (nombres de jugador, no la clase) y HUD, como la pose de AC-72, y sin
  // objetivo seleccionado: §21 le da los 4 roles de su instrucción (en QA-78 la selección de la sonda no llegó a aplicarse). Sin
  // pistas ni protección de salida, como AC-72: el barco propio real espera fuera de la escena. Archivos: <vp>-mezcla.{png,json}
  const MIX_QUESTIONS: [string, string][] = [['self', 'el barco que controlas'], ['player', 'otro jugador'], ['pirate', 'un pirata'], ['merchant', 'un mercante']];
  const MIX_SCENE: LegibilityScene = { name: 'mezcla', ac: 'AC-194 d', roles: ROLES, selected: [], selectedLabel: 'sin objetivo seleccionado (§21)', byClass: false, questions: MIX_QUESTIONS };
  const MIX_MERCHANT_DEG = 90 + (0.25 * 180) / Math.PI; // el de la galería (π/2 + 0,25)
  // [id, dx, dz (m desde el foco), rumbo (°), nombre de la placa]. Los rumbos y los nombres, los de la sonda de QA. Los puestos (D107,
  // «Lejos de las líneas»), en la rejilla del origen fijo (GRID_ORIGIN): salen de un buscador sobre las cajas medidas (barco y placa),
  // con centros a ≥ 0,4 de celda en 1440×900 y ≥ 0,33 en 390×844, las zonas infladas 10 y 8 px sin celdas compartidas entre roles,
  // fuera del HUD y de las islas, y con cada par de AC-194 (d) en bloques de celdas contiguos: en 1440×900, el pirata sobre la
  // Fragata española y el mercante bajo el Navío británico, como en la sonda; en 390×844, cada par lado a lado (filas 5-6 y 9-10)
  const MIX_LAYOUT: Record<'desktop' | 'mobile', [string, number, number, number, string][]> = {
    desktop: [
      ['g-brig-none', -62.5, 20.5, 90, 'Invitado'],
      ['g-line-gb', -4.5, -37, 90, 'Capitana Morgana'],
      ['g-merchant', -0.5, 21.5, MIX_MERCHANT_DEG, 'Mercante'],
      ['g-frigate-es', 74, 25, 135, 'Rodrigo'],
      ['g-pirate', 77.5, -43, 180, 'Pirata'],
      ['g-schooner-none', -78.5, -41.5, 90, 'Lucía']
    ],
    mobile: [
      ['g-brig-none', 43.5, -28.5, 90, 'Invitado'],
      ['g-line-gb', -25.5, -51, 90, 'Capitana Morgana'],
      ['g-merchant', 44.5, -90, MIX_MERCHANT_DEG, 'Mercante'],
      ['g-frigate-es', -47.5, 63, 135, 'Rodrigo'],
      ['g-pirate', 46, 64.5, 180, 'Pirata'],
      ['g-schooner-none', -49.5, 1.5, 90, 'Lucía']
    ]
  };

  for (const vp of VIEWPORTS) {
    test(`la mezcla con las familias en ${vp.name} (AC-194 d y AC-72; QA-78 §7)`, async ({ browser }) => {
      test.setTimeout(300_000);
      const server = await startOwnServer({ SEA_BATTLE_NPCS: '0' });
      const page = await newPage(browser, vp);
      try {
        await galleryCapture(page, server.url, { hud: true, myShipId: 'g-brig-none' });
        await placeGallery(page, MIX_LAYOUT[vp.name as 'desktop' | 'mobile'].map(([id, dx, dz, headingDeg, name]) => ({ id, dx, dz, headingDeg, name })));
        await page.waitForTimeout(1500);
        await legibilityShot(page, vp, MIX_SCENE);
        gridCheck(vp, 'mezcla');
      } finally {
        await page.context().close();
        await server.kill();
      }
    });
  }

  // AC-194 (c) (ART-DIRECTION §21, D106): la familia se lee sin leer texto, a 1,0× en 1440×900 con DPR 2 y solo en color. (1) La
  // tira de referencia: la Fragata en los 3 aspectos a 225°, con su nombre debajo y sin rejilla. (2) Por disposición, 6 barcos de
  // jugador de otras clases (británica: Balandra y Navío; española: Bergantín y Navío; sin familia: Goleta y Bergantín), con los
  // rumbos de AD-28 repartidos y el orden barajado, con la semilla 1 en la 1.ª disposición y la 2 en la 2.ª; sin placas, y con su
  // JSON de cajas, en el que el rol de cada barco es su aspecto (gb, es o none). En 2 filas de 3, con cada barco en sus propias
  // celdas de la rejilla. Archivos: desktop-family-read-referencia.png, desktop-family-read-<1|2>.{png,json}
  const READ_SHIPS = [['sloop', 'gb'], ['line', 'gb'], ['brig', 'es'], ['line', 'es'], ['schooner', 'none'], ['brig', 'none']] as const;
  const READ_HEADINGS = [45, 135, 225, 315, 45, 135]; // AD-28, repartidos entre los 6
  // m desde el foco. D107 («Lejos de las líneas», §18.1): en la rejilla del origen fijo (GRID_ORIGIN), con el aspecto como rol (un
  // británico y un español en la misma celda dejarían pasar la confusión que se mide); los mismos 6 puestos valen para las 2
  // disposiciones (de un buscador sobre las cajas medidas): centros a ≥ 0,37 de celda y las zonas infladas 8 px sin celdas
  // compartidas entre aspectos. Antes, (±55, ±40) y (0, ±40), con centros a 0,196–0,216 de celda
  const READ_SLOTS = [[-58, -45], [-0.5, -44], [55.5, -43], [-56, 43], [0.5, 44], [55.5, 43.5]] as const;
  const READ_NAMES: Record<string, string> = { gb: 'familia británica', es: 'familia española', none: 'sin familia' };
  const READ_QUESTIONS: [string, string][] = [['gb', 'familia británica'], ['es', 'familia española'], ['none', 'sin familia']];
  // Barajado reproducible (mulberry32 + Fisher-Yates)
  const shuffled = <T,>(xs: readonly T[], seed: number): T[] => {
    let a = seed >>> 0;
    const rnd = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  test('la familia de cada barco en desktop con DPR 2 (AC-194 c; D106)', async ({ browser }) => {
    test.setTimeout(300_000);
    const vp = VIEWPORTS[0];
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0' });
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    try {
      await galleryCapture(page, server.url);
      // (1) Referencia: la Fragata británica, española y sin familia, a 225°, con su nombre debajo
      await placeGallery(page, (['gb', 'es', 'none'] as const).map((f, i) => ({ id: `g-frigate-${f}`, dx: -60 + 60 * i, dz: 0, headingDeg: 225 })));
      await page.waitForTimeout(800);
      await freeze(page);
      const ref = await legibleFrame(page);
      expect(ref.elements.map((e) => e.id).sort(), 'referencia: las 3 Fragatas').toEqual(['g-frigate-es', 'g-frigate-gb', 'g-frigate-none']);
      await writeNames(page, ref.elements.map((e) => ({ text: READ_NAMES[e.id.split('-')[2]], x: e.ship[0] + e.ship[2] / 2, y: e.ship[1] + e.ship[3] + 6 })));
      await shot(page, vp, 'family-read-referencia');
      await clearNames(page);
      await thaw(page);

      // (2) Las 2 disposiciones
      for (const seed of [1, 2]) {
        const order = shuffled(READ_SHIPS, seed);
        const headings = shuffled(READ_HEADINGS, seed + 100);
        await placeGallery(page, order.map(([c, f], i) => ({ id: `g-${c}-${f}`, dx: READ_SLOTS[i][0], dz: READ_SLOTS[i][1], headingDeg: headings[i] })));
        await page.waitForTimeout(800);
        await freeze(page);
        const frame = await legibleFrame(page);
        const png = await shot(page, vp, `family-read-${seed}`);
        const fromPixels = await shipPixels(page, png, frame.elements.map((e) => e.ship));
        await thaw(page);
        const dpr = frame.viewport.dpr;
        const px = (b: Box | null) => b && (b.map((v) => Math.round(v * dpr)) as Box);
        const elements = frame.elements.map((e) => ({ ...e, role: e.id.split('-')[2], selected: false, plate: null, ring: null }));
        const json = { viewport: frame.viewport, roles: READ_QUESTIONS, elements: elements.map((e) => ({ ...e, imagePx: { ship: px(e.ship), plate: null, ring: null } })) };
        fs.writeFileSync(path.join(OUT, `${vp.name}-family-read-${seed}.json`), JSON.stringify(json, null, 1).replace(/\[\s+([\d.,\s-]+?)\s+\]/g, (_, v: string) => `[${v.replace(/\s+/g, ' ')}]`));
        for (const [i, e] of elements.entries())
          console.log(`AC-194 c disposición ${seed}: ${e.role} ${e.id} a ${headings[order.findIndex(([c, f]) => `g-${c}-${f}` === e.id)]}° · barco [${e.ship.join(', ')}] · en la captura [${fromPixels[i]?.map((v) => v.toFixed(1)).join(', ') ?? '—'}]`);
        expect(dpr, 'DPR 2 (D106)').toBe(2);
        expect(elements.map((e) => e.id).sort(), `disposición ${seed}: los 6 barcos`).toEqual(READ_SHIPS.map(([c, f]) => `g-${c}-${f}`).sort());
        for (const e of elements) expect.soft(inside(e.ship, frame.viewport), `${seed} ${e.id}: dentro del viewport`).toBe(true);
        elements.forEach((a, i) => elements.slice(i + 1).forEach((b) => expect.soft(separation(a.ship, b.ship), `D57 b: ${a.id} y ${b.id} a ≥ ${LEG_GAP} px CSS`).toBeGreaterThanOrEqual(LEG_GAP)));
        for (const [i, e] of elements.entries()) {
          const f = fit(e.ship, fromPixels[i]);
          expect.soft(f.outside, `${seed} ${e.id}: los píxeles del barco caben en su caja (px CSS fuera)`).toBeLessThanOrEqual(BOX_OUTSIDE_PX);
          expect.soft(f.slack, `${seed} ${e.id}: la caja no sobra más que las puntas finas (px CSS)`).toBeLessThanOrEqual(BOX_SLACK_PX);
        }
        gridCheck(vp, `family-read-${seed}`);
      }
    } finally {
      await ctx.close();
      await server.kill();
    }
  });

  // AC-115 (ART-DIRECTION §18.2): la escena del I2 para los evaluadores-agente, en un servidor propio con el I2 encendido y
  // sin más NPC: pirata, cañonera, Capitán y mercante quietos con los rumbos de AD-28, y los dos jugadores. Sin objetivo
  // seleccionado. El Capitán, en el rumbo de canto de cada tamaño (producto, 2026-11-02, O-69): a 225° en 1440×900
  // ("legibility-i2") y a 90° en 390×844 ("legibility-i2-90", con sus propios puestos: BACKLOG :1149)
  for (const vp of VIEWPORTS) {
    test(`legibilidad del I2 en ${vp.name} (AC-115)`, async ({ browser }) => {
      test.setTimeout(150_000);
      const scenario = vp.mobile ? 'legibility-i2-90' : 'legibility-i2';
      const posts = vp.mobile ? LEGIBILITY_I2_90 : LEGIBILITY_I2;
      console.log(`AC-115 ${vp.name}: escenario ${scenario}`);
      const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: scenario });
      const page = await newPage(browser, vp);
      const other = await newPage(browser, vp);
      try {
        await toPosts(page, other, server.url, posts.self, posts.other);
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
  // (e2e/danger-mark.spec.ts) mide los 3 tamaños; esto es la imagen para ux, también en 844×390
  for (const vp of [...VIEWPORTS, { name: 'landscape', width: 844, height: 390, mobile: true }]) {
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

  // AC-227 (a, e): las 5 clases del jugador sin familia y en las 2 familias, como las pinta el juego (LOD y DPR del juego, las
  // KTX2 ya transcodificadas), de una en una en el foco de la galería, de costado (rumbo E) y a 3/4 (rumbo SE), para cotejarlas
  // con D91 y D95 (las familias), D102 (sin familia) y D104 (como en el juego). Archivos: <vp>-familia-<clase>-<familia>-<rumbo>.png
  for (const vp of VIEWPORTS) {
    test(`familias en ${vp.name} (AC-227; D91, D95, D102, D104)`, async ({ browser }) => {
      test.setTimeout(240_000);
      const page = await newPage(browser, vp);
      try {
        await enterGame(page);
        await page.mouse.move(5, 450);
        await page.evaluate(() => {
          const rt = window.__SEA_BATTLE__!.runtime();
          rt.setCameraPreset('game');
          rt.setZoomLevel(1);
          const scene = rt.startScene('gallery', { families: true });
          scene.setPose('g-sloop', scene.focus.x + 10_000, scene.focus.z, Math.PI / 2);
          (window as unknown as { __capScene: typeof scene }).__capScene = scene;
        });
        await expect
          .poll(() => page.evaluate(() => {
            const glb = (window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { loaded(k: string): boolean; model(k: string): { map?: { isCompressedTexture?: boolean } | null } } }).shipGlb;
            return ['sloop', 'brig', 'schooner', 'frigate', 'line'].flatMap((c) => [`${c}:gb`, `${c}:es`]).every((k) => glb.loaded(k) && glb.model(k).map?.isCompressedTexture === true);
          }), { timeout: 120_000 })
          .toBe(true);
        for (const classId of ['sloop', 'brig', 'schooner', 'frigate', 'line']) {
          for (const family of ['none', 'gb', 'es']) {
            for (const [rumbo, heading] of [['E', Math.PI / 2], ['SE', (3 * Math.PI) / 4]] as const) {
              await page.evaluate(([id, heading]) => {
                const scene = (window as unknown as { __capScene: { focus: { x: number; z: number }; setPose(id: string, x: number, z: number, h: number): void; spec: { ships: { id: string }[] } } }).__capScene;
                scene.spec.ships.forEach((s, i) => s.id !== id && scene.setPose(s.id, scene.focus.x + 10_000 + 2000 * i, scene.focus.z, Math.PI / 2));
                scene.setPose(id, scene.focus.x, scene.focus.z, heading);
              }, [`g-${classId}-${family}`, heading] as const);
              await page.waitForTimeout(600);
              await shot(page, vp, `familia-${classId}-${family}-${rumbo}`);
            }
          }
        }
      } finally {
        await page.context().close();
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

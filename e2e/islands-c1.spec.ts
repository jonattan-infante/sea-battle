// Piloto C1 del mapa nuevo (AC-198 c, AC-199 e y AC-200 e): con el mapa de la 1.1 encendido en el servidor
// (SEA_BATTLE_MAP=1.1), el cliente pinta los 50 círculos de su bienvenida, primero en la versión sencilla y después con la
// raíz de la isla piloto (I1) de islands.glb y el puerto de island_port.glb (AC-200 e: la entrada lo espera hasta 0,5 s y,
// mientras no llega, la ciudad y el muelle este van en empedrado). Con el mapa de la 1.0 (por defecto), ni se pide
// islands.glb ni island_port.glb, ni cambia nada.
// El agua con la rejilla frente a la lista y su tiempo los mide aparte el turno de C1 (qa-artifacts/c1, en el Mac con GPU)
import fs from 'fs';
import path from 'path';
import { expect, Page, Request, test, TestInfo } from '@playwright/test';
import * as THREE from 'three';
import { ISLANDS, MAP_1_1 } from '../src/game/constants';
import { islandsKey } from '../src/client/map-islands';
import { ISLANDS_GLB, PORT_GLB } from '../src/client/models/island-glb';
import { buildIslands, PORT_PAVED_COLOR } from '../src/client/models/island-geometry';
import { OWN_GLB_WAIT_MS } from '../src/client/models/ship-glb';
import { enterGame } from './helpers';
import { startOwnServer } from './own-server';

const GLB = /\/models\/islands\.[0-9a-f]+\.glb$/;
const PORT = /\/models\/island_port\.[0-9a-f]+\.glb$/;
const PORT_KTX2 = /\/models\/island_port_atlas\.[0-9a-f]+\.ktx2$/;
// Cota del escenario en la primera visita (AC-200 e, BACKLOG; producto: cuenta lo transferido) y lo que midió ux con el
// puerto y las islas (ASSET-SPEC §9.8 :712)
const SCENERY_BYTES = 800_000;
const UX_SCENERY_BYTES = 535_834;

// Las capturas: con C1_SHOTS_DIR (el turno de C1 la pone dentro de su carpeta de salida), a esa carpeta con nombre fijo; sin
// ella, adjuntas al informe de Playwright
async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const dir = process.env.C1_SHOTS_DIR;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}-${info.project.name}.png`);
    await page.screenshot({ path: file });
    console.log(`C1 · captura ${file}`);
  } else await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}
const KTX2 = /\/models\/islands_atlas\.[0-9a-f]+\.ktx2$/;

// Las peticiones de islands.glb, de island_port.glb y de sus KTX2 de la página, con la petición para leer sus bytes al acabar
function islandRequests(page: Page) {
  const glb: Request[] = [];
  const ktx2: Request[] = [];
  const port: Request[] = [];
  const portKtx2: Request[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (GLB.test(path)) glb.push(r);
    if (KTX2.test(path)) ktx2.push(r);
    if (PORT.test(path)) port.push(r);
    if (PORT_KTX2.test(path)) portKtx2.push(r);
  });
  return { glb, ktx2, port, portKtx2 };
}

// Lo que transfirió cada petición (cuerpo y cabeceras), y el total
async function transferred(reqs: Request[]) {
  const sizes = await Promise.all(reqs.map(async (r) => ({ url: new URL(r.url()).pathname, ...(await r.sizes()) })));
  return { bytes: sizes.reduce((s, x) => s + x.responseBodySize + x.responseHeadersSize, 0), detail: sizes.map((x) => `${x.url} ${x.responseBodySize}+${x.responseHeadersSize}`).join(' · ') };
}

// La entrada (EntryGate, AC-193 c y AC-200 e): primer frame, frame en que se abrió y si fue por el tope sin el barco propio o
// sin el puerto
const entryOf = (page: Page) =>
  page.evaluate(() => {
    const e = (window.__SEA_BATTLE__!.runtime() as unknown as { entry: { firstFrameAt: number; lastWaitAt: number; shownAt: number; capped: boolean; portCapped: boolean } }).entry;
    return { firstFrameAt: e.firstFrameAt, lastWaitAt: e.lastWaitAt, shownAt: e.shownAt, capped: e.capped, portCapped: e.portCapped };
  });

// Socket.IO sobre WebSocket: cada evento viaja como texto `42["evento",datos]` (como en progress-states.spec.ts)
const eventOf = (m: string | Buffer): string | null => (typeof m === 'string' && m.startsWith('42[') ? (JSON.parse(m.slice(2)) as [string])[0] : null);

// Peticiones de la Resource Timing por ruta: con transferSize > 0 salió a la red; con 0 y cuerpo, de la caché (como en
// glb-cache.spec.ts)
const network = (page: Page, paths: string[]) =>
  page.evaluate(
    (ps) =>
      ps.map((p) => {
        const es = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => new URL(e.name).pathname === p);
        return { path: p, requests: es.length, toNetwork: es.filter((e) => e.transferSize > 0).length, bytes: es.reduce((n, e) => n + e.transferSize, 0), body: es.every((e) => e.decodedBodySize > 0) };
      }),
    paths
  );
const hasRoot = (page: Page, shape: string) =>
  expect
    .poll(() => page.evaluate((s) => (window.__SEA_BATTLE__!.runtime() as unknown as { islandRoots: Map<string, unknown> }).islandRoots.has(s), shape), { timeout: 30_000 })
    .toBe(true);

// Vértices de la malla procedural de las islas con el color del empedrado (lineal, como lo guarda GeoBuilder)
const COBBLE = new THREE.Color(PORT_PAVED_COLOR);
const isCobble = (r: number, g: number, b: number) => Math.abs(r - COBBLE.r) < 1e-6 && Math.abs(g - COBBLE.g) < 1e-6 && Math.abs(b - COBBLE.b) < 1e-6;
const cobbleOf = (g: THREE.BufferGeometry) => {
  const c = g.getAttribute('color');
  let n = 0;
  for (let v = 0; v < c.count; v++) if (isCobble(c.getX(v), c.getY(v), c.getZ(v))) n++;
  return n;
};
const drawnCobble = (page: Page) =>
  page.evaluate(([r, g, b]) => {
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { islandMesh: { geometry: { attributes: { color: { array: ArrayLike<number>; itemSize: number } } } } };
    const { array, itemSize } = rt.islandMesh.geometry.attributes.color;
    let n = 0;
    for (let k = 0; k < array.length; k += itemSize) if (Math.abs(array[k] - r) < 1e-6 && Math.abs(array[k + 1] - g) < 1e-6 && Math.abs(array[k + 2] - b) < 1e-6) n++;
    return n;
  }, [COBBLE.r, COBBLE.g, COBBLE.b]);

// Lo que pinta el runtime: la huella de sus círculos, cuántos son, las raíces de GLB puestas y los triángulos de la malla
// procedural de las islas (la versión sencilla con la 1.1, sin los círculos de las formas que ya pinta su GLB)
const drawn = (page: Page) =>
  page.evaluate(() => {
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as {
      islandsKey: string;
      islandList: unknown[];
      islandRoots: Map<string, unknown>;
      islandMesh: { geometry: { index: { count: number } | null; attributes: { position: { count: number } } } };
      client: { welcome: { islands: { id: string; x: number; z: number; radius: number }[] } | null };
    };
    const g = rt.islandMesh.geometry;
    const welcome = rt.client.welcome?.islands ?? [];
    return {
      key: rt.islandsKey,
      circles: rt.islandList.length,
      welcomeKey: welcome.map((i) => `${i.id}:${i.x}:${i.z}:${i.radius}`).join('|'),
      roots: [...rt.islandRoots.keys()].sort(),
      triangles: g.index ? g.index.count / 3 : g.attributes.position.count / 3
    };
  });

const trianglesOf = (simple: boolean, circles = MAP_1_1.islands) => {
  const g = buildIslands(circles, { simple }).geometry;
  return g.index ? g.index.count / 3 : g.attributes.position.count / 3;
};

test.describe('C1: las islas del mapa de la 1.1 en el cliente', () => {
  test('con el mapa de la 1.0 (por defecto), las 7 islas de siempre y ninguna petición de islands.glb, island_port.glb ni sus KTX2', async ({ page }) => {
    const req = islandRequests(page);
    await enterGame(page);
    await page.waitForTimeout(3_000); // islands.glb se pediría al abrirse la entrada
    const d = await drawn(page);
    const entry = await entryOf(page);
    console.log(`C1 · mapa 1.0: ${d.circles} círculos · raíces ${JSON.stringify(d.roots)} · peticiones islands.glb ${req.glb.length} · KTX2 ${req.ktx2.length} · island_port.glb ${req.port.length} · su KTX2 ${req.portKtx2.length} · entrada ${JSON.stringify(entry)} · vértices de empedrado ${await drawnCobble(page)}`);
    expect(d.key).toBe(islandsKey(ISLANDS));
    expect(d.welcomeKey).toBe(islandsKey(ISLANDS));
    expect(d.roots).toEqual([]);
    expect(req.glb.length + req.ktx2.length + req.port.length + req.portKtx2.length).toBe(0);
    expect(entry.portCapped).toBe(false);
    expect(await drawnCobble(page)).toBe(0);
  });

  test('con la 1.1 e islands.glb e island_port.glb bloqueados, pinta los 50 círculos de la bienvenida en la versión sencilla, con el empedrado del puerto (AC-199 e, AC-200 e)', async ({ page }, info) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_MAP: '1.1', SEA_BATTLE_NPCS: '0' });
    try {
      const req = islandRequests(page);
      await page.route(GLB, (r) => r.abort());
      await page.route(PORT, (r) => r.abort());
      await enterGame(page, server.url);
      await expect.poll(() => [req.glb.length, req.port.length], { timeout: 10_000 }).toEqual([1, 1]); // se pidieron, y se bloquearon
      await page.waitForTimeout(2_000);
      const d = await drawn(page);
      const simple = trianglesOf(true);
      const cobble = cobbleOf(buildIslands(MAP_1_1.islands, { simple: true }).geometry);
      const drawnCobbleN = await drawnCobble(page);
      const entry = await entryOf(page);
      console.log(`C1 · mapa 1.1, islands.glb e island_port.glb bloqueados: ${d.circles} círculos · raíces ${JSON.stringify(d.roots)} · triángulos de la malla de islas ${d.triangles} (versión sencilla de los 50, calculada aquí: ${simple}; procedural de la 1.0 con los 50: ${trianglesOf(false)}) · vértices de empedrado ${drawnCobbleN} (calculados aquí: ${cobble}) · peticiones islands.glb ${req.glb.length} · KTX2 ${req.ktx2.length} · island_port.glb ${req.port.length} · su KTX2 ${req.portKtx2.length} · entrada ${JSON.stringify(entry)}`);
      expect(d.circles).toBe(50);
      expect(d.welcomeKey).toBe(islandsKey(MAP_1_1.islands)); // lo que mandó el servidor es el mapa de la 1.1
      expect(d.key).toBe(d.welcomeKey); // y lo que pinta el cliente, lo que mandó el servidor
      expect(d.roots).toEqual([]);
      expect(d.triangles).toBe(simple);
      expect(cobble).toBeGreaterThan(0);
      expect(drawnCobbleN).toBe(cobble);
      expect(req.ktx2.length + req.portKtx2.length).toBe(0);
      await shot(page, info, 'c1-version-sencilla');
    } finally {
      await server.kill();
    }
  });

  test('con la 1.1, el puerto llega tarde: la entrada se abre por el tope de 0,5 s y el puerto se pone después (AC-200 e)', async ({ page }, info) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_MAP: '1.1', SEA_BATTLE_NPCS: '0' });
    try {
      const req = islandRequests(page);
      await page.route(GLB, (r) => r.abort()); // solo el puerto
      // island_port.glb, 4 s tarde: más que el tope de la entrada aunque el primer frame llegue antes que la bienvenida
      await page.route(PORT, async (r) => {
        await new Promise((res) => setTimeout(res, 4_000));
        await r.continue();
      });
      await enterGame(page, server.url);
      const entry = await entryOf(page);
      await expect
        .poll(() => page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { islandRoots: Map<string, unknown> }).islandRoots.has('PORT')), { timeout: 30_000 })
        .toBe(true);
      const d = await drawn(page);
      const withoutPort = MAP_1_1.islands.filter((c) => c.id.split('.')[0] !== 'PORT');
      console.log(`C1 · mapa 1.1, island_port.glb 4 s tarde: entrada ${JSON.stringify(entry)}, esperó ${(entry.shownAt - entry.firstFrameAt).toFixed(1)} ms (tope ${OWN_GLB_WAIT_MS} ms) · raíces ${JSON.stringify(d.roots)} · peticiones island_port.glb ${req.port.length} · su KTX2 ${req.portKtx2.length} · triángulos procedurales ${d.triangles} (la versión sencilla sin el puerto: ${trianglesOf(true, withoutPort)}) · vértices de empedrado ${await drawnCobble(page)}`);
      expect(entry.portCapped).toBe(true);
      expect(entry.shownAt - entry.firstFrameAt).toBeGreaterThanOrEqual(OWN_GLB_WAIT_MS);
      expect(d.roots).toEqual(['PORT']);
      expect(req.port.length).toBe(1);
      expect(req.portKtx2.length).toBe(1);
      expect(d.triangles).toBe(trianglesOf(true, withoutPort)); // el puerto sale de la malla sencilla, y con él el empedrado
      expect(await drawnCobble(page)).toBe(0);
      await shot(page, info, 'c1-puerto-tarde');
    } finally {
      await server.kill();
    }
  });

  // AC-200 e: antes de la bienvenida no hay lienzo (GameApp.tsx:614 monta GameCanvas solo con ella; antes, la portada), así que
  // nunca se ven las formas de la 1.0 con otro mapa, y el tope de la entrada cuenta desde el primer frame, que va tras la
  // bienvenida. Con la bienvenida retenida 3 s se lee en cada rAF si hay <canvas> y si el runtime pintó algún frame, no un píxel
  test('con la 1.1 y la bienvenida retenida 3 s, hasta la bienvenida no hay lienzo ni frames del juego, solo la portada; después la entrada se abre y pone el puerto (AC-200 e)', async ({ page }, info) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_MAP: '1.1', SEA_BATTLE_NPCS: '0' });
    try {
      await page.addInitScript(() => {
        type Rt = { client: { welcome: unknown }; entry: { firstFrameAt: number } };
        const w = window as unknown as { __C1_PRE__: { t: number; welcome: boolean; canvas: boolean; frames: boolean; cover: boolean }[]; __SEA_BATTLE__?: { runtime(): unknown } };
        w.__C1_PRE__ = [];
        const tick = (t: number) => {
          const rt = w.__SEA_BATTLE__?.runtime() as Rt | undefined;
          if (rt) {
            const cover = document.querySelector<HTMLElement>('.game-root [data-testid="loading"]');
            w.__C1_PRE__.push({ t, welcome: !!rt.client.welcome, canvas: !!document.querySelector('.game-root canvas'), frames: rt.entry.firstFrameAt > 0, cover: !!cover && !cover.hidden });
          }
          if (w.__C1_PRE__.filter((f) => f.welcome).length < 30) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      // Todo lo que manda el servidor desde la bienvenida se retiene 3 s y sale después en su orden
      let held: (string | Buffer)[] | null = null;
      let welcomes = 0;
      await page.routeWebSocket(/\/socket\.io\//, (ws) => {
        const srv = ws.connectToServer();
        ws.onMessage((m) => srv.send(m));
        srv.onMessage((m) => {
          if (eventOf(m) === 'welcome' && !welcomes++) {
            held = [];
            setTimeout(() => {
              for (const x of held!) ws.send(x);
              held = null;
            }, 3_000);
          }
          if (held) held.push(m);
          else ws.send(m);
        });
      });
      await enterGame(page, server.url);
      await expect.poll(() => page.evaluate(() => (window as unknown as { __C1_PRE__: { welcome: boolean }[] }).__C1_PRE__.filter((f) => f.welcome).length), { timeout: 30_000 }).toBeGreaterThanOrEqual(30);
      const ticks = await page.evaluate(() => (window as unknown as { __C1_PRE__: { t: number; welcome: boolean; canvas: boolean; frames: boolean; cover: boolean }[] }).__C1_PRE__);
      await hasRoot(page, 'PORT');
      const entry = await entryOf(page);
      const before = ticks.filter((f) => !f.welcome);
      const after = ticks.filter((f) => f.welcome);
      const span = before.length ? before.at(-1)!.t - before[0].t : 0;
      const seen = (fs: typeof ticks) => [...new Set(fs.map((f) => JSON.stringify({ canvas: f.canvas, frames: f.frames, cover: f.cover })))];
      console.log(`C1 · mapa 1.1, bienvenida retenida 3 s: ${before.length} ticks de rAF antes de la bienvenida en ${span.toFixed(0)} ms: ${seen(before).join(' ')} · ${after.length} después: ${seen(after).join(' ')} · entrada ${JSON.stringify(entry)} · raíces ${JSON.stringify((await drawn(page)).roots)}`);
      expect(welcomes).toBe(1);
      expect(before.length).toBeGreaterThan(0); // hubo ticks con el runtime creado y sin bienvenida
      expect(seen(before)).toEqual([JSON.stringify({ canvas: false, frames: false, cover: true })]); // sin lienzo ni frames, con la portada
      expect(after.at(-1)).toMatchObject({ canvas: true, frames: true });
      expect(entry.shownAt).toBeGreaterThan(0);
      expect((await drawn(page)).key).toBe(islandsKey(MAP_1_1.islands));
      await shot(page, info, 'c1-bienvenida-retenida');
    } finally {
      await server.kill();
    }
  });

  // AC-200 e (BACKLOG :1726): el PR del cargador del puerto trae el e2e de «0 peticiones a la red en la visita siguiente» con
  // el puerto real
  test('con la 1.1, island_port.glb y su KTX2 se sirven con caché de un año, y en la visita siguiente hacen 0 peticiones a la red (AC-200 e)', async ({ context, page }) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_MAP: '1.1', SEA_BATTLE_NPCS: '0' });
    try {
      // Sin page.route: con una ruta registrada Chrome no usa la caché HTTP (playwright-core/types/types.d.ts:4002)
      const req = islandRequests(page);
      await enterGame(page, server.url);
      await hasRoot(page, 'PORT');
      expect([req.port.length, req.portKtx2.length]).toEqual([1, 1]);
      const pieces = [new URL(req.port[0].url()).pathname, new URL(req.portKtx2[0].url()).pathname];
      expect(pieces[0]).toBe(PORT_GLB);
      const headers = await Promise.all([req.port[0], req.portKtx2[0]].map(async (r) => { const res = await r.response(); return `${res?.status()} ${res?.headers()['cache-control']}`; }));
      console.log(`C1 · puerto, 1.ª visita: ${JSON.stringify(Object.fromEntries(pieces.map((p, k) => [p, headers[k]])))}`);
      expect(headers).toEqual(pieces.map(() => '200 public, max-age=31536000, immutable'));
      await page.close();

      const again = await context.newPage();
      await enterGame(again, server.url);
      await hasRoot(again, 'PORT');
      const next = await network(again, pieces);
      console.log(`C1 · puerto, visita siguiente: ${JSON.stringify(next)}`);
      expect(next).toEqual(pieces.map((p) => ({ path: p, requests: 1, toNetwork: 0, bytes: 0, body: true })));
    } finally {
      await server.kill();
    }
  });

  test('con la 1.1, islands.glb llega una vez con su KTX2 y pone la isla piloto I1, y island_port.glb, el puerto; el frame más largo mientras llega, al log (AC-198 c, AC-200 e)', async ({ page }, info) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_MAP: '1.1', SEA_BATTLE_NPCS: '0' });
    try {
      const req = islandRequests(page);
      // Duración de cada frame (entre rAF), con su instante: la ventana es de la petición de islands.glb a 1 s después de
      // que I1 está en la escena
      await page.addInitScript(() => {
        // y el primer frame con I1 en la escena (__C1_I1_AT__), en el reloj de la página
        const w = window as unknown as { __C1_FRAMES__: [number, number][]; __C1_I1_AT__: number | null; __SEA_BATTLE__?: { runtime(): unknown } };
        w.__C1_FRAMES__ = [];
        w.__C1_I1_AT__ = null;
        let last = 0;
        const tick = (t: number) => {
          if (last) w.__C1_FRAMES__.push([t, t - last]);
          if (w.__C1_I1_AT__ === null) {
            const rt = w.__SEA_BATTLE__?.runtime() as { islandRoots?: Map<string, unknown> } | undefined;
            if (rt?.islandRoots?.has('I1')) w.__C1_I1_AT__ = t;
          }
          last = t;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await enterGame(page, server.url);
      const entry = await entryOf(page);
      await expect
        .poll(() => page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { islandRoots: Map<string, unknown> }).islandRoots.has('I1')), { timeout: 20_000 })
        .toBe(true);
      await expect
        .poll(() => page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { islandRoots: Map<string, unknown> }).islandRoots.has('PORT')), { timeout: 20_000 })
        .toBe(true);
      const placedAt = await page.evaluate(() => (window as unknown as { __C1_I1_AT__: number | null }).__C1_I1_AT__);
      expect(placedAt, 'el frame en que I1 entra en la escena').not.toBeNull();
      await page.waitForTimeout(1_000);
      const d = await drawn(page);
      const glbAt = req.glb[0] ? req.glb[0].timing().startTime : NaN;
      const frames = await page.evaluate(() => (window as unknown as { __C1_FRAMES__: [number, number][] }).__C1_FRAMES__);
      const origin = await page.evaluate(() => performance.timeOrigin);
      // timing().startTime va en ms desde 1970 y el rAF desde el origen de la página: se pasa al reloj del rAF
      const from = Number.isFinite(glbAt) ? glbAt - origin : 0;
      const win = frames.filter(([t]) => t >= from && t <= placedAt! + 1_000).map(([, dt]) => dt);
      const longest = win.length ? Math.max(...win) : NaN;
      const islandsT = await transferred([...req.glb, ...req.ktx2]);
      const scenery = await transferred([...req.glb, ...req.ktx2, ...req.port, ...req.portKtx2]);
      const withoutI1 = MAP_1_1.islands.filter((c) => !['I1', 'PORT'].includes(c.id.split('.')[0]));
      console.log(`C1 · mapa 1.1 con islands.glb (${ISLANDS_GLB}) e island_port.glb (${PORT_GLB}): I1 puesta ${(placedAt! - from).toFixed(1)} ms después de pedir islands.glb (el frame en que entra en la escena, en el reloj de la página) · raíces ${JSON.stringify(d.roots)} · peticiones islands.glb ${req.glb.length} · KTX2 ${req.ktx2.length} · island_port.glb ${req.port.length} · su KTX2 ${req.portKtx2.length} · entrada ${JSON.stringify(entry)} (tope ${OWN_GLB_WAIT_MS} ms) · islands.glb y su KTX2, transferidos ${islandsT.bytes} B · escenario transferido ${scenery.bytes} B (ux: ${UX_SCENERY_BYTES} B; cota ${SCENERY_BYTES} B) (${scenery.detail}) · frame más largo mientras llega ${longest.toFixed(1)} ms en ${win.length} frames (umbral de producto 50 ms: ${longest > 50 ? 'PASA, a producto antes de C3' : 'por debajo'}) · triángulos procedurales ${d.triangles} (la versión sencilla sin I1 ni el puerto: ${trianglesOf(true, withoutI1)}) · vértices de empedrado ${await drawnCobble(page)}`);
      expect(d.key).toBe(islandsKey(MAP_1_1.islands));
      expect(d.roots).toEqual(['I1', 'PORT']);
      expect(req.glb.length).toBe(1);
      expect(req.ktx2.length).toBe(1);
      expect(req.port.length).toBe(1);
      expect(req.portKtx2.length).toBe(1);
      expect(scenery.bytes).toBeLessThanOrEqual(SCENERY_BYTES);
      expect(d.triangles).toBe(trianglesOf(true, withoutI1)); // I1 y el puerto salen de la malla sencilla: los pintan sus GLB
      expect(await drawnCobble(page)).toBe(0);
      expect(Number.isFinite(glbAt)).toBe(true);
      expect(win.length).toBeGreaterThan(0);
      await shot(page, info, 'c1-piloto-i1-puerto');
    } finally {
      await server.kill();
    }
  });
});

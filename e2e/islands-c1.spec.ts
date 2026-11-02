// Piloto C1 del mapa nuevo (AC-198 c, AC-199 e y AC-200 e): con el mapa de la 1.1 encendido en el servidor
// (SEA_BATTLE_MAP=1.1), el cliente pinta los 50 círculos de su bienvenida, primero en la versión sencilla y después con la
// raíz de la isla piloto (I1) de islands.glb. Con el mapa de la 1.0 (por defecto), ni se pide islands.glb ni cambia nada.
// El agua con la rejilla frente a la lista y su tiempo los mide aparte el turno de C1 (qa-artifacts/c1, en el Mac con GPU)
import fs from 'fs';
import path from 'path';
import { expect, Page, Request, test, TestInfo } from '@playwright/test';
import { ISLANDS, MAP_1_1 } from '../src/game/constants';
import { islandsKey } from '../src/client/map-islands';
import { ISLANDS_GLB } from '../src/client/models/island-glb';
import { buildIslands } from '../src/client/models/island-geometry';
import { enterGame } from './helpers';
import { startOwnServer } from './own-server';

const GLB = /\/models\/islands\.[0-9a-f]+\.glb$/;

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

// Las peticiones de islands.glb y de su KTX2 de la página, con la petición para leer sus bytes al acabar
function islandRequests(page: Page) {
  const glb: Request[] = [];
  const ktx2: Request[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (GLB.test(path)) glb.push(r);
    if (KTX2.test(path)) ktx2.push(r);
  });
  return { glb, ktx2 };
}

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
  test('con el mapa de la 1.0 (por defecto), las 7 islas de siempre y ninguna petición de islands.glb ni de su KTX2', async ({ page }) => {
    const req = islandRequests(page);
    await enterGame(page);
    await page.waitForTimeout(3_000); // islands.glb se pediría al abrirse la entrada
    const d = await drawn(page);
    console.log(`C1 · mapa 1.0: ${d.circles} círculos · raíces ${JSON.stringify(d.roots)} · peticiones islands.glb ${req.glb.length} · KTX2 ${req.ktx2.length}`);
    expect(d.key).toBe(islandsKey(ISLANDS));
    expect(d.welcomeKey).toBe(islandsKey(ISLANDS));
    expect(d.roots).toEqual([]);
    expect(req.glb.length + req.ktx2.length).toBe(0);
  });

  test('con la 1.1 e islands.glb bloqueado, pinta los 50 círculos de la bienvenida en la versión sencilla (AC-199 e, AC-200 e)', async ({ page }, info) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_MAP: '1.1', SEA_BATTLE_NPCS: '0' });
    try {
      const req = islandRequests(page);
      await page.route(GLB, (r) => r.abort());
      await enterGame(page, server.url);
      await expect.poll(() => req.glb.length, { timeout: 10_000 }).toBe(1); // se pidió, y se bloqueó
      await page.waitForTimeout(2_000);
      const d = await drawn(page);
      const simple = trianglesOf(true);
      console.log(`C1 · mapa 1.1, islands.glb bloqueado: ${d.circles} círculos · raíces ${JSON.stringify(d.roots)} · triángulos de la malla de islas ${d.triangles} (versión sencilla de los 50, calculada aquí: ${simple}; procedural de la 1.0 con los 50: ${trianglesOf(false)}) · peticiones islands.glb ${req.glb.length} · KTX2 ${req.ktx2.length}`);
      expect(d.circles).toBe(50);
      expect(d.welcomeKey).toBe(islandsKey(MAP_1_1.islands)); // lo que mandó el servidor es el mapa de la 1.1
      expect(d.key).toBe(d.welcomeKey); // y lo que pinta el cliente, lo que mandó el servidor
      expect(d.roots).toEqual([]);
      expect(d.triangles).toBe(simple);
      expect(req.ktx2.length).toBe(0);
      await shot(page, info, 'c1-version-sencilla');
    } finally {
      await server.kill();
    }
  });

  test('con la 1.1, islands.glb llega una vez con su KTX2 y pone la isla piloto I1; el frame más largo mientras llega, al log (AC-198 c)', async ({ page }, info) => {
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
      await expect
        .poll(() => page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { islandRoots: Map<string, unknown> }).islandRoots.has('I1')), { timeout: 20_000 })
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
      const sizes = await Promise.all([...req.glb, ...req.ktx2].map(async (r) => ({ url: new URL(r.url()).pathname, ...(await r.sizes()) })));
      const bytes = sizes.reduce((s, x) => s + x.responseBodySize + x.responseHeadersSize, 0);
      const withoutI1 = MAP_1_1.islands.filter((c) => c.id.split('.')[0] !== 'I1');
      console.log(`C1 · mapa 1.1 con islands.glb (${ISLANDS_GLB}): I1 puesta ${(placedAt! - from).toFixed(1)} ms después de pedir islands.glb (el frame en que entra en la escena, en el reloj de la página) · raíces ${JSON.stringify(d.roots)} · peticiones islands.glb ${req.glb.length} · KTX2 ${req.ktx2.length} · transferidos ${bytes} B (${sizes.map((x) => `${x.url} ${x.responseBodySize}+${x.responseHeadersSize}`).join(' · ')}) · frame más largo mientras llega ${longest.toFixed(1)} ms en ${win.length} frames (umbral de producto 50 ms: ${longest > 50 ? 'PASA, a producto antes de C3' : 'por debajo'}) · triángulos procedurales ${d.triangles} (la versión sencilla sin I1: ${trianglesOf(true, withoutI1)})`);
      expect(d.key).toBe(islandsKey(MAP_1_1.islands));
      expect(d.roots).toEqual(['I1']);
      expect(req.glb.length).toBe(1);
      expect(req.ktx2.length).toBe(1);
      expect(d.triangles).toBe(trianglesOf(true, withoutI1)); // I1 sale de la malla sencilla: la pinta su GLB
      expect(Number.isFinite(glbAt)).toBe(true);
      expect(win.length).toBeGreaterThan(0);
      await shot(page, info, 'c1-piloto-i1');
    } finally {
      await server.kill();
    }
  });
});

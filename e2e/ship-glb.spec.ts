// Loader de GLB de los barcos en el navegador (ASSET-SPEC §13 paso 6; D80; AC-193 a y c): el barco propio entra con el
// procedural y, al llegar su GLB, cambia a su geometría y su textura sin otra draw call; si el GLB no llega, se queda el
// procedural. El GLB es el fixture comprimido como pide §1 (e2e/fixtures/ship_sloop_etc1s_meshopt.glb, de
// scripts/glb/make-ship-fixture.ts): la Balandra con meshopt, cuantización y una textura magenta en KTX2 ETC1S, que el
// navegador transcodifica con public/basis. Lo sirve page.route
import fs from 'fs';
import path from 'path';
import { expect, Page, test } from '@playwright/test';
import { enterGame } from './helpers';

const URL_OK = '/models/test/ship_sloop.glb';
const URL_404 = '/models/test/missing.glb';
const OWN_GLB_WAIT_MS = 500; // src/client/models/ship-glb.ts (AC-193 c, opción B)
const FIXTURE = path.join(__dirname, 'fixtures', 'ship_sloop_etc1s_meshopt.glb');

// Estado de la vista del barco propio: geometría, mapa y LOD, y si sigue siendo 1 draw call (1 malla, 1 primitiva, 1 material)
const ownView = (page: Page) =>
  page.evaluate(() => {
    type View = { lod: 0 | 1; model: { map?: { image: { width: number } } | null; lods: { uuid: string }[] }; mesh: { geometry: { uuid: string; groups: unknown[] }; material: { map: unknown } } };
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { views: Map<string, View>; src: { myShipId: string } };
    const v = rt.views.get(rt.src.myShipId)!;
    return {
      geometry: v.mesh.geometry.uuid,
      lodGeometry: v.model.lods[v.lod].uuid,
      lod: v.lod,
      modelMap: v.model.map ? v.model.map.image.width : null,
      materialMap: v.mesh.material.map === (v.model.map ?? null),
      oneDrawCall: v.mesh.geometry.groups.length <= 1 && !Array.isArray(v.mesh.material)
    };
  });

// El GLB de la Balandra en el manifiesto antes de entrar. GameApp asigna window.__SEA_BATTLE__ en el efecto que sigue a
// crear el runtime, antes de que llegue la bienvenida y del primer frame: la trampa pone ahí la URL, como si viniera en
// SHIP_GLB. El barco del invitado es la Balandra
// waitMs alarga el tope cuando lo que se prueba es la espera: en SwiftShader, el primer frame (que compila los shaders)
// puede durar más de 0,5 s y abriría la entrada por el tope aunque el GLB llegase a tiempo en una GPU
const glbBeforeEntry = (page: Page, url: string, waitMs?: number) =>
  page.addInitScript(
    ([u, ms]) => {
      let debug: unknown;
      Object.defineProperty(window, '__SEA_BATTLE__', {
        configurable: true,
        get: () => debug,
        set: (v: { runtime(): unknown }) => {
          if (!debug) {
            const rt = v.runtime() as { useShipGlb(c: string, url: string): void; entry: { waitMs: number } };
            rt.useShipGlb('sloop', u);
            if (ms) rt.entry.waitMs = ms;
          }
          debug = v;
        }
      });
    },
    [url, waitMs ?? 0] as const
  );

// La entrada (EntryGate): primer frame, último frame que esperó, frame en que se mostró, con qué modelo y si fue por el
// tope; y si la portada «Izando velas…» ya no tapa el juego
const entryOf = (page: Page) =>
  page.evaluate(() => {
    type Entry = { firstFrameAt: number; lastWaitAt: number; shownAt: number; withGlb: boolean; capped: boolean };
    const e = (window.__SEA_BATTLE__!.runtime() as unknown as { entry: Entry }).entry;
    const cover = document.querySelector<HTMLElement>('.game-root > [data-testid="loading"]');
    return { firstFrameAt: e.firstFrameAt, lastWaitAt: e.lastWaitAt, shownAt: e.shownAt, withGlb: e.withGlb, capped: e.capped, coverHidden: !!cover && cover.hidden };
  });

test.describe('Barcos en GLB (ASSET-SPEC §13)', () => {
  test('AC-193 a y c: el barco propio entra con el procedural y cambia al GLB con meshopt y textura ETC1S, en 1 draw call', async ({ page }) => {
    const bytes = fs.readFileSync(FIXTURE);
    const requests: string[] = [];
    const basis: string[] = []; // el transcodificador de ETC1S se pide a public/basis y llega entero
    page.on('response', (r) => r.url().includes('/basis/') && basis.push(`${r.status()} ${r.url().split('/').pop()}`));
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.route(`**${URL_OK}`, (route) => {
      requests.push(route.request().url());
      return route.fulfill({ body: bytes, contentType: 'model/gltf-binary' });
    });
    await enterGame(page);
    const before = await ownView(page);
    expect(before.modelMap).toBeNull(); // el procedural, sin textura
    await page.evaluate((url) => (window.__SEA_BATTLE__!.runtime() as unknown as { useShipGlb(c: string, u: string): void }).useShipGlb('sloop', url), URL_OK);
    await expect.poll(async () => (await ownView(page)).modelMap, { timeout: 15_000 }).toBe(16);
    await page.waitForTimeout(500);
    const after = await ownView(page);
    console.log(`AC-193 GLB: ${JSON.stringify({ before, after, requests: requests.length })}`);
    expect(after.geometry).not.toBe(before.geometry);
    expect(after.geometry).toBe(after.lodGeometry); // la geometría del LOD actual del GLB
    expect(after.materialMap).toBe(true);
    expect(after.oneDrawCall).toBe(true);
    expect(requests).toHaveLength(1); // una descarga por clase, compartida
    expect(basis.sort()).toEqual(['200 basis_transcoder.js', '200 basis_transcoder.wasm']);
    // La textura se ve: píxeles magenta (R y B altos, G bajo) alrededor del barco propio, que antes no había
    const magenta = await page.evaluate(async () => {
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as { captureImage(type: string): string | null };
      const me = window.__SEA_BATTLE__!.me() as { screen: { sx: number; sy: number } };
      const img = new Image();
      img.src = rt.captureImage('image/png')!;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / window.innerWidth;
      const box = ctx.getImageData(Math.round((me.screen.sx - 60) * k), Math.round((me.screen.sy - 60) * k), Math.round(120 * k), Math.round(120 * k)).data;
      let n = 0;
      for (let i = 0; i < box.length; i += 4) if (box[i] > 150 && box[i + 2] > 150 && box[i + 1] < 90) n++;
      return n;
    });
    console.log(`AC-193 GLB: ${magenta} píxeles magenta junto al barco propio`);
    expect(magenta).toBeGreaterThan(50);
    expect(errors).toEqual([]);
  });

  test('AC-193 c: si el GLB no llega, se queda el procedural, con un aviso y sin errores', async ({ page }) => {
    const warnings: string[] = [];
    const errors: string[] = [];
    page.on('console', (m) => (m.type() === 'warning' ? warnings : m.type() === 'error' ? errors : []).push(m.text()));
    await page.route(`**${URL_404}`, (route) => route.fulfill({ status: 404, body: 'no' }));
    await enterGame(page);
    const before = await ownView(page);
    await page.evaluate((url) => (window.__SEA_BATTLE__!.runtime() as unknown as { useShipGlb(c: string, u: string): void }).useShipGlb('sloop', url), URL_404);
    await expect.poll(() => warnings.filter((w) => w.startsWith('[ship-glb] sloop')).length, { timeout: 15_000 }).toBe(1);
    const after = await ownView(page);
    expect(after).toMatchObject({ geometry: before.geometry, modelMap: null });
    // El 404 del recurso lo cuenta el navegador como error de red; el juego no añade ninguno
    expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
  });

  // AC-193 c, opción B (producto, 2026-10-18): la entrada espera al GLB propio, como mucho 0,5 s sobre la de hoy (el primer
  // frame). Los tiempos de SwiftShader no valen como cifra: se comprueba en qué frame se abre, que no depende de su duración
  test('AC-193 c (B): sin GLB en el manifiesto se entra en el primer frame, como hoy', async ({ page }) => {
    await enterGame(page);
    const entry = await entryOf(page);
    console.log(`AC-193 c entrada sin GLB: ${JSON.stringify(entry)}`);
    expect(entry).toMatchObject({ lastWaitAt: 0, withGlb: false, capped: false, coverHidden: true });
    expect(entry.shownAt).toBe(entry.firstFrameAt);
  });

  // Sin WebGL no hay frames. Hoy se ve el canvas vacío con el HUD: R3F crea el renderer dentro de una promesa (configure,
  // react-three-fiber.esm.js:68-69), así que el error de three no desmonta el árbol. Con el manifiesto vacío, la portada no
  // espera al primer frame y eso no cambia (con manifiesto, sin WebGL se quedaría: pendiente de producto y ux)
  test('AC-193 c (B): sin WebGL y sin GLB en el manifiesto, la portada no se queda: se ve el HUD, como hoy', async ({ page }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, ...rest: unknown[]) => unknown;
      (HTMLCanvasElement.prototype as unknown as { getContext: typeof getContext }).getContext = function (type, ...rest) {
        return /webgl/i.test(type) ? null : getContext.call(this, type, ...rest);
      };
    });
    await page.goto('/game');
    await expect(page.getByTestId('player-frame')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.game-root > [data-testid="loading"]')).toBeHidden();
    const entry = await entryOf(page);
    console.log(`AC-193 c entrada sin WebGL: ${JSON.stringify(entry)}`);
    expect(entry.firstFrameAt).toBe(0); // de verdad no hubo ningún frame
  });

  test('AC-193 c (B): con el GLB propio a tiempo, el barco propio entra ya con él', async ({ page }) => {
    const bytes = fs.readFileSync(FIXTURE);
    const requests: string[] = [];
    await page.route(`**${URL_OK}`, (route) => {
      requests.push(route.request().url());
      return route.fulfill({ body: bytes, contentType: 'model/gltf-binary' });
    });
    await glbBeforeEntry(page, URL_OK, 10_000);
    await enterGame(page);
    const entry = await entryOf(page);
    const view = await ownView(page);
    console.log(`AC-193 c entrada con GLB a tiempo (tope de 10 s): ${JSON.stringify({ entry, view, requests: requests.length })}`);
    expect(entry).toMatchObject({ withGlb: true, capped: false, coverHidden: true });
    expect(entry.shownAt).toBeGreaterThan(entry.firstFrameAt); // esperó al GLB
    expect(view).toMatchObject({ modelMap: 16, materialMap: true, oneDrawCall: true });
    expect(requests).toHaveLength(1); // la descarga anticipada es la que usa el pump
  });

  test('AC-193 c (B): la espera nunca bloquea: con la descarga del modelo abortada se entra dentro del tope con el de hoy', async ({ page }) => {
    const warnings: string[] = [];
    const errors: string[] = [];
    page.on('console', (m) => (m.type() === 'warning' ? warnings : m.type() === 'error' ? errors : []).push(m.text()));
    await page.route(`**${URL_OK}`, (route) => route.abort());
    await glbBeforeEntry(page, URL_OK);
    await enterGame(page);
    const entry = await entryOf(page);
    const view = await ownView(page);
    console.log(`AC-193 c entrada con la descarga abortada: ${JSON.stringify({ entry, view, warnings })}`);
    expect(entry).toMatchObject({ withGlb: false, capped: false, coverHidden: true }); // el fallo abre la entrada sin esperar al tope
    expect(entry.lastWaitAt - entry.firstFrameAt).toBeLessThan(OWN_GLB_WAIT_MS);
    expect(view.modelMap).toBeNull();
    expect(warnings.filter((w) => w.startsWith('[ship-glb] sloop'))).toHaveLength(1);
    // La petición abortada la cuenta el navegador como error de red; el juego no añade ninguno
    expect(errors.filter((e) => !e.includes('net::ERR_FAILED'))).toEqual([]);
  });

  test('AC-193 c (B): si el GLB no llega a tiempo, se entra en el primer frame tras el tope con el de hoy, y cambia al llegar', async ({ page }) => {
    const bytes = fs.readFileSync(FIXTURE);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(`**${URL_OK}`, async (route) => {
      await held;
      await route.fulfill({ body: bytes, contentType: 'model/gltf-binary' });
    });
    await glbBeforeEntry(page, URL_OK);
    await enterGame(page);
    const entry = await entryOf(page);
    const before = await ownView(page);
    console.log(`AC-193 c entrada por el tope: ${JSON.stringify({ entry, before })}`);
    expect(entry).toMatchObject({ withGlb: false, capped: true, coverHidden: true });
    expect(entry.lastWaitAt - entry.firstFrameAt).toBeLessThan(OWN_GLB_WAIT_MS); // esperó dentro del tope…
    expect(entry.shownAt - entry.firstFrameAt).toBeGreaterThanOrEqual(OWN_GLB_WAIT_MS); // …y se abrió en el primer frame que lo pasó
    expect(before.modelMap).toBeNull();
    release();
    await expect.poll(async () => (await ownView(page)).modelMap, { timeout: 15_000 }).toBe(16);
  });
});

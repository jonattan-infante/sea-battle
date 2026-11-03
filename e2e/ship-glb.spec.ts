// Loader de GLB de los barcos en el navegador (ASSET-SPEC §13 paso 6; D80; AC-193 a y c): el barco propio entra con el
// procedural y, al llegar su GLB, cambia a su geometría y su textura sin otra draw call; si el GLB no llega, se queda el
// procedural. El GLB es el fixture comprimido como pide §1 (e2e/fixtures/ship_sloop_etc1s_meshopt.glb, de
// scripts/glb/make-ship-fixture.ts): la Balandra con meshopt, cuantización y una textura magenta en KTX2 ETC1S, que el
// navegador transcodifica con public/basis. Lo sirve page.route
import fs from 'fs';
import path from 'path';
import { expect, Page, test } from '@playwright/test';
import { contentHash, E2E_PREFIX } from '../scripts/glb/content-hash';
import { externalKtx2Fixture } from '../scripts/glb/e2e-models';
import { addFallback, solidPng } from '../scripts/glb/glb-fallback';
import { enterGame, entryOf, glbBeforeEntry } from './helpers';

const URL_OK = '/models/test/ship_sloop.glb';
const URL_404 = '/models/test/missing.glb';
const OWN_GLB_WAIT_MS = 500; // src/client/models/ship-glb.ts (AC-193 c, opción B)
const FIXTURE = path.join(__dirname, 'fixtures', 'ship_sloop_etc1s_meshopt.glb');
// Salida 1 de AC-193 c (D90): el fixture con un respaldo verde de 16 × 16 añadido en memoria (scripts/glb/glb-fallback.ts).
// Con el respaldo el barco se ve verde y con la KTX2, magenta; el verde puro no lo tiene el agua (B alto)
const URL_FALLBACK = '/models/test/ship_sloop_fallback.glb';
const withFallback = () => Buffer.from(addFallback(new Uint8Array(fs.readFileSync(FIXTURE)), solidPng([0, 255, 0], 16)));
// Paso 4c de §13: el mismo respaldo, con la KTX2 en su .ktx2 aparte, al lado del GLB (scripts/glb/e2e-models.ts)
const URL_EXT = '/models/test/ship_sloop_ext.glb';
// Opción A de AC-193 c: el fixture servido por el servidor del juego (build:e2e lo copia a public/models), para que la red
// limitada por CDP se aplique a su descarga; con page.route no pasaría por la red
const SERVED_URL = `/models/${E2E_PREFIX}ship_sloop.${contentHash(fs.readFileSync(FIXTURE))}.glb`;
const URL_FRIGATE = '/models/test/ship_frigate.glb';
const URL_SCHOONER = '/models/test/ship_schooner.glb';

// La hora de la bienvenida (el primer instante en que el cliente conoce su barco), sondeada cada 5 ms, en __WELCOME_AT__
const probeWelcome = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __WELCOME_AT__: number; __SEA_BATTLE__?: { runtime(): unknown } };
    w.__WELCOME_AT__ = 0;
    const id = setInterval(() => {
      if ((w.__SEA_BATTLE__?.runtime() as { src: { myShipId: string | null } } | undefined)?.src.myShipId) {
        w.__WELCOME_AT__ = performance.now();
        clearInterval(id);
      }
    }, 5);
  });

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

// El mapa del material del barco propio (si es la KTX2, su flipY y su colorSpace) y su programa de shader, con el número de
// programas del renderer (D90: el cambio del respaldo a la KTX2 no debe compilar otro)
const ownMap = (page: Page) =>
  page.evaluate(() => {
    type Tex = { isCompressedTexture?: boolean; flipY: boolean; colorSpace: string };
    type View = { model: { map?: Tex | null }; mesh: { geometry: { groups: unknown[] }; material: { map: Tex | null } } };
    type Renderer = { info: { programs: unknown[] | null }; properties: { get(o: object): { currentProgram?: { id: number } } } };
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { views: Map<string, View>; src: { myShipId: string }; gl: Renderer };
    const v = rt.views.get(rt.src.myShipId)!;
    const map = v.mesh.material.map;
    return {
      compressed: !!map?.isCompressedTexture,
      flipY: map ? map.flipY : null,
      colorSpace: map ? map.colorSpace : null,
      materialMap: map === (v.model.map ?? null),
      program: rt.gl.properties.get(v.mesh.material).currentProgram?.id ?? null,
      programs: rt.gl.info.programs?.length ?? null,
      oneDrawCall: v.mesh.geometry.groups.length <= 1 && !Array.isArray(v.mesh.material)
    };
  });

// Píxeles magenta (la KTX2 del fixture) y verdes (su respaldo) en un cuadro de 120 px alrededor del barco propio
const ownPixels = (page: Page) =>
  page.evaluate(async () => {
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
    let magenta = 0;
    let green = 0;
    for (let i = 0; i < box.length; i += 4) {
      if (box[i] > 150 && box[i + 2] > 150 && box[i + 1] < 90) magenta++;
      if (box[i + 1] > 150 && box[i] < 90 && box[i + 2] < 90) green++;
    }
    return { magenta, green };
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
  test('AC-193 c (B): sin ningún GLB que pueda salir (ninguno de una clase del jugador y el I2 apagado) se entra en el primer frame, como hoy', async ({ page }) => {
    await enterGame(page);
    const entry = await entryOf(page);
    console.log(`AC-193 c entrada sin GLB: ${JSON.stringify(entry)}`);
    expect(entry).toMatchObject({ lastWaitAt: 0, withGlb: false, capped: false, coverHidden: true });
    expect(entry.shownAt).toBe(entry.firstFrameAt);
  });

  // Sin WebGL no hay frames que abran la entrada. En la 1.0.3 se ve el canvas vacío con el HUD: R3F crea el renderer
  // dentro de una promesa (configure, react-three-fiber.esm.js:68-69), así que el error de three no desmonta el árbol.
  // La entrada debe hacer lo mismo, con y sin GLB en el manifiesto (producto, AC-193 c): sin GLB que pueda salir la portada
  // se quita al conectarla; con él, GameCanvas avisa al runtime (rendererFailed) de que three no pudo crear el renderer
  for (const withGlb of [false, true]) {
    test(`AC-193 c (B): sin WebGL y ${withGlb ? 'con GLB en el manifiesto' : 'sin ningún GLB que pueda salir (ninguno de una clase del jugador y el I2 apagado)'}, la portada no se queda: se ve el HUD, como en la 1.0.3`, async ({ page }) => {
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, ...rest: unknown[]) => unknown;
        (HTMLCanvasElement.prototype as unknown as { getContext: typeof getContext }).getContext = function (type, ...rest) {
          return /webgl/i.test(type) ? null : getContext.call(this, type, ...rest);
        };
      });
      if (withGlb) {
        const bytes = fs.readFileSync(FIXTURE);
        await page.route(`**${URL_OK}`, (route) => route.fulfill({ body: bytes, contentType: 'model/gltf-binary' }));
        await glbBeforeEntry(page, URL_OK);
      }
      await page.goto('/game');
      await expect(page.getByTestId('player-frame')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.game-root > [data-testid="loading"]')).toBeHidden();
      const entry = await entryOf(page);
      console.log(`AC-193 c entrada sin WebGL (${withGlb ? 'con' : 'sin'} GLB): ${JSON.stringify(entry)}`);
      expect(entry.firstFrameAt).toBe(0); // de verdad no hubo ningún frame
    });
  }

  // Sin GLB que pueda salir, la entrada es la de hoy también antes del primer frame: la portada se quita al conectarla, sin
  // esperar a ninguno. Con requestAnimationFrame parado no llega ningún frame aunque haya WebGL
  test('AC-193 c (B): sin ningún GLB que pueda salir (ninguno de una clase del jugador y el I2 apagado) la portada no espera a ningún frame, como hoy', async ({ page }) => {
    await page.addInitScript(() => {
      window.requestAnimationFrame = () => 0;
    });
    await page.goto('/game');
    await expect(page.getByTestId('player-frame')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.game-root > [data-testid="loading"]')).toBeHidden();
    const entry = await entryOf(page);
    console.log(`AC-193 c entrada sin frames y sin GLB: ${JSON.stringify(entry)}`);
    expect(entry.firstFrameAt).toBe(0);
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

  // Salida 1 de AC-193 c (D90): con el respaldo en el GLB, la entrada no espera al transcodificador de KTX2, que ya no baja
  // al crear el cargador sino después del GLB propio. Aquí se retiene /basis/ hasta comprobar la entrada y el respaldo
  test('AC-193 c, salida 1 (D90): con el transcodificador retenido, el barco propio entra ya con el respaldo; al llegar, cambia a la KTX2 con el mismo programa', async ({ page }) => {
    test.setTimeout(120_000);
    const bytes = withFallback();
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    let glbDone = 0;
    const basisAt: number[] = [];
    page.on('requestfinished', (r) => r.url().endsWith(URL_FALLBACK) && (glbDone ||= Date.now()));
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(`**${URL_FALLBACK}`, (route) => route.fulfill({ body: bytes, contentType: 'model/gltf-binary' }));
    await page.route('**/basis/**', async (route) => {
      basisAt.push(Date.now());
      await held;
      await route.continue();
    });
    await glbBeforeEntry(page, URL_FALLBACK, 60_000); // un tope que SwiftShader no alcance: si la entrada esperase a /basis/, no se abriría
    await page.goto('/game');
    // Como enterGame, pero con expect.poll: si la entrada esperase al transcodificador, el rojo sería por aserción
    await expect.poll(() => page.evaluate(() => window.__SEA_BATTLE__?.ready() === true), { timeout: 30_000 }).toBe(true);
    const entry = await entryOf(page);
    await page.waitForTimeout(1_000);
    const before = { ...(await ownMap(page)), ...(await ownPixels(page)) };
    console.log(`AC-193 c salida 1, con /basis/ retenido: ${JSON.stringify({ entry, before, glbDone, basisAt })}`);
    expect(entry).toMatchObject({ withGlb: true, capped: false, coverHidden: true });
    expect(before).toMatchObject({ compressed: false, flipY: false, colorSpace: 'srgb', materialMap: true, oneDrawCall: true });
    expect(before.green).toBeGreaterThan(50);
    // El transcodificador se pidió (lo pide la KTX2 del GLB propio), y después de que el GLB terminase de bajar
    expect(basisAt.length).toBeGreaterThan(0);
    expect(glbDone).toBeGreaterThan(0);
    expect(basisAt[0]).toBeGreaterThanOrEqual(glbDone);
    release();
    await expect.poll(async () => (await ownMap(page)).compressed, { timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(500);
    const after = { ...(await ownMap(page)), ...(await ownPixels(page)) };
    console.log(`AC-193 c salida 1, con la KTX2: ${JSON.stringify(after)}`);
    // Mismo programa del material del barco: el cambio de mapa no compila otro (D90). El total del renderer no se aserta
    // (O-47): un programa ajeno al barco se compila cuando quiere y lo sube de 7 a 8 sin que el del barco cambie
    console.log(`AC-193 c salida 1, programas del renderer (sin asertar): ${before.programs} → ${after.programs}`);
    expect(before.program).toEqual(expect.any(Number));
    expect(after.program).toBe(before.program);
    expect([after.flipY, after.colorSpace, after.materialMap, after.oneDrawCall]).toEqual([before.flipY, before.colorSpace, true, true]);
    expect(after.magenta).toBeGreaterThan(50);
    expect(before.green - after.green).toBeGreaterThan(50);
    expect(errors).toEqual([]);
  });

  // Paso 4c de §13: con la KTX2 en su .ktx2 aparte, la entrada no la espera (la HIPÓTESIS de ASSET-SPEC :792), y el
  // transcodificador se pide mientras baja, no al tenerla (KTX2Loader.load solo lo pide después). Se retiene el .ktx2
  test('AC-193 c, paso 4c: con el .ktx2 aparte retenido, el barco propio entra con el respaldo y el transcodificador se pide sin esperarlo; al llegar, cambia a la KTX2 con el mismo programa', async ({ page }) => {
    test.setTimeout(120_000);
    const ext = externalKtx2Fixture(new Uint8Array(fs.readFileSync(FIXTURE)));
    const ktx2Url = `/models/test/${ext.ktx2File}`;
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const ktx2At: number[] = [];
    const basisAt: number[] = [];
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(`**${URL_EXT}`, (route) => route.fulfill({ body: Buffer.from(ext.glb), contentType: 'model/gltf-binary' }));
    await page.route(`**${ktx2Url}`, async (route) => {
      ktx2At.push(Date.now());
      await held;
      await route.fulfill({ body: Buffer.from(ext.ktx2), contentType: 'image/ktx2' });
    });
    await page.route('**/basis/**', (route) => {
      basisAt.push(Date.now());
      return route.continue();
    });
    await glbBeforeEntry(page, URL_EXT, 60_000); // un tope que SwiftShader no alcance: si la entrada esperase al .ktx2, no se abriría
    await page.goto('/game');
    await expect.poll(() => page.evaluate(() => window.__SEA_BATTLE__?.ready() === true), { timeout: 30_000 }).toBe(true);
    const entry = await entryOf(page);
    // Con el .ktx2 aún retenido: el plugin pide el transcodificador en el parse
    await expect.poll(() => basisAt.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1_000);
    const before = { ...(await ownMap(page)), ...(await ownPixels(page)) };
    console.log(`AC-193 c paso 4c, con el .ktx2 retenido: ${JSON.stringify({ entry, before, ktx2At, basisAt })}`);
    expect(entry).toMatchObject({ withGlb: true, capped: false, coverHidden: true });
    expect(before).toMatchObject({ compressed: false, flipY: false, colorSpace: 'srgb', materialMap: true, oneDrawCall: true });
    expect(before.green).toBeGreaterThan(50);
    expect(ktx2At.length).toBe(1);
    release();
    await expect.poll(async () => (await ownMap(page)).compressed, { timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(500);
    const after = { ...(await ownMap(page)), ...(await ownPixels(page)) };
    console.log(`AC-193 c paso 4c, con la KTX2: ${JSON.stringify(after)}`);
    // Como en la salida 1: solo el programa del material del barco (O-47)
    console.log(`AC-193 c paso 4c, programas del renderer (sin asertar): ${before.programs} → ${after.programs}`);
    expect(before.program).toEqual(expect.any(Number));
    expect(after.program).toBe(before.program);
    expect([after.flipY, after.colorSpace, after.materialMap, after.oneDrawCall]).toEqual([before.flipY, before.colorSpace, true, true]);
    expect(after.magenta).toBeGreaterThan(50);
    expect(before.green - after.green).toBeGreaterThan(50);
    expect(errors).toEqual([]);
  });

  test('AC-193 c, salida 1 (D90): si el transcodificador no llega, se queda el respaldo, con un aviso', async ({ page }) => {
    test.setTimeout(120_000);
    const bytes = withFallback();
    const warnings: string[] = [];
    const errors: string[] = [];
    page.on('console', (m) => (m.type() === 'warning' ? warnings : m.type() === 'error' ? errors : []).push(m.text()));
    await page.route(`**${URL_FALLBACK}`, (route) => route.fulfill({ body: bytes, contentType: 'model/gltf-binary' }));
    await page.route('**/basis/**', (route) => route.fulfill({ status: 404, body: 'no' }));
    await glbBeforeEntry(page, URL_FALLBACK, 60_000);
    await enterGame(page);
    const entry = await entryOf(page);
    await expect.poll(() => warnings.filter((w) => w.startsWith('[ship-glb] sloop')), { timeout: 30_000 }).toEqual([
      `[ship-glb] sloop (${URL_FALLBACK}): la KTX2 no llegó; se queda el respaldo`
    ]);
    const view = { ...(await ownMap(page)), ...(await ownPixels(page)) };
    console.log(`AC-193 c salida 1 sin transcodificador: ${JSON.stringify({ entry, view, errors })}`);
    expect(entry).toMatchObject({ withGlb: true, capped: false, coverHidden: true });
    expect(view).toMatchObject({ compressed: false, materialMap: true, oneDrawCall: true });
    expect(view.green).toBeGreaterThan(50);
    // Los 404 los cuenta el navegador como errores de red, y GLTFLoader avisa de la textura que no pudo leer
    // (GLTFLoader.js:3442); el juego no añade ninguno
    expect(errors.filter((e) => !e.includes('404') && !e.startsWith("THREE.GLTFLoader: Couldn't load texture"))).toEqual([]);
  });

  // Opción A de AC-193 c (producto, BACKLOG :1745): la clase propia se predice al crear el runtime, y un invitado nuevo
  // sale con la Balandra. Con la red del hotspot malo (HIPÓTESIS: RTT 300 ms y 3/1 Mbps, por CDP), la petición de su GLB
  // sale antes de la bienvenida; la cifra de la entrada, con el cargador compitiendo, va al log sin cota (es SwiftShader).
  // La trampa pone el manifiesto al asignarse window.__SEA_BATTLE__, algo después de crear el runtime: la descarga
  // predicha empieza ahí (setUrl), y en el juego, con SHIP_GLB, en el constructor
  test('AC-193 c, opción A: un jugador nuevo en el hotspot malo pide el GLB de la Balandra antes de la bienvenida, una sola vez', async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: 3e6 / 8, uploadThroughput: 1e6 / 8 });
    await probeWelcome(page);
    await glbBeforeEntry(page, SERVED_URL);
    await enterGame(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __WELCOME_AT__: number }).__WELCOME_AT__), { timeout: 30_000 }).toBeGreaterThan(0);
    const got = await page.evaluate((url) => {
      const glb = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => new URL(e.name).pathname === url);
      const e = (window.__SEA_BATTLE__!.runtime() as unknown as { entry: { firstFrameAt: number; shownAt: number; withGlb: boolean; capped: boolean } }).entry;
      return {
        requests: glb.length,
        glbStart: Math.round(glb[0]?.startTime ?? -1),
        glbEnd: Math.round(glb[0]?.responseEnd ?? -1),
        welcomeAt: Math.round((window as unknown as { __WELCOME_AT__: number }).__WELCOME_AT__),
        firstFrameAt: Math.round(e.firstFrameAt),
        wait: Math.round(e.shownAt - e.firstFrameAt),
        withGlb: e.withGlb,
        capped: e.capped
      };
    }, SERVED_URL);
    console.log(`AC-193 c opción A, jugador nuevo en el hotspot malo (HIPÓTESIS; SwiftShader, sin cota): ${JSON.stringify(got)}`);
    expect(got.requests).toBe(1); // la predicha es la que usa el pump
    expect(got.glbStart).toBeGreaterThan(0);
    expect(got.glbStart).toBeLessThan(got.welcomeAt);
    expect(errors).toEqual([]);
  });

  // Opción A de AC-193 c: con la Fragata guardada como última clase de este invitado, se predice la Fragata; la clase real
  // es la Balandra (un invitado sale con ella), así que la predicha se aborta al llegar la instantánea y la buena se pide
  // entonces. Con el tope a 10 s, como «con el GLB propio a tiempo»: un frame de SwiftShader puede pasar de 0,5 s
  test('AC-193 c, opción A: con otra clase guardada, la predicha se aborta y el barco propio entra ya con su GLB, sin errores', async ({ page }) => {
    test.setTimeout(120_000);
    const guestId = `e2ea${Date.now().toString(36).slice(-6)}`;
    await page.addInitScript((id) => {
      localStorage.setItem('sea-battle-guest-id', id);
      localStorage.setItem(`sea-battle-last-ship:guest:${id}`, 'frigate');
    }, guestId);
    const bytes = fs.readFileSync(FIXTURE);
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const sloop: string[] = [];
    const frigate: string[] = [];
    page.on('requestfailed', (r) => r.url().endsWith(URL_FRIGATE) && frigate.push(`fallida: ${r.failure()?.errorText}`));
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(`**${URL_OK}`, (route) => {
      sloop.push(route.request().url());
      return route.fulfill({ body: bytes, contentType: 'model/gltf-binary' });
    });
    await page.route(`**${URL_FRIGATE}`, async (route) => {
      frigate.push('pedida');
      await held;
      await route.fulfill({ body: bytes, contentType: 'model/gltf-binary' }).catch(() => undefined); // si ya se abortó
    });
    await page.addInitScript(
      ([ok, fr]) => {
        let debug: unknown;
        Object.defineProperty(window, '__SEA_BATTLE__', {
          configurable: true,
          get: () => debug,
          set: (v: { runtime(): unknown }) => {
            if (!debug) {
              const rt = v.runtime() as { useShipGlb(c: string, url: string): void; entry: { waitMs: number } };
              rt.useShipGlb('sloop', ok);
              rt.useShipGlb('frigate', fr);
              rt.entry.waitMs = 10_000;
            }
            debug = v;
          }
        });
      },
      [URL_OK, URL_FRIGATE] as const
    );
    await enterGame(page);
    const entry = await entryOf(page);
    await expect.poll(async () => (await ownView(page)).modelMap, { timeout: 15_000 }).toBe(16);
    const view = await ownView(page);
    console.log(`AC-193 c opción A, con la Fragata guardada: ${JSON.stringify({ entry, view, sloop: sloop.length, frigate })}`);
    expect(frigate.slice(0, 2)).toEqual(['pedida', 'fallida: net::ERR_ABORTED']); // la predicha, abortada
    expect(entry).toMatchObject({ withGlb: true, capped: false, coverHidden: true });
    expect(view).toMatchObject({ modelMap: 16, materialMap: true, oneDrawCall: true });
    expect(sloop).toHaveLength(1);
    expect(await page.evaluate((id) => localStorage.getItem(`sea-battle-last-ship:guest:${id}`), guestId)).toBe('sloop'); // la real, para la próxima
    release();
    // La petición abortada la puede contar el navegador como error de red; el juego no añade ninguno
    expect(errors.filter((e) => !e.includes('ERR_ABORTED'))).toEqual([]);
  });

  // Punto 3 de dev-render (BACKLOG :1821): solo se predicen las clases que existen siempre (la Balandra, el Bergantín y la
  // Fragata), porque la predicción va antes de la bienvenida y no conoce los interruptores. Con una Goleta guardada no se
  // predice nada: antes de la bienvenida no se baja ni su GLB ni el de la Balandra, y el propio se pide al llegar. En el
  // candidato no hay Goleta: AC-201 está apagado por construcción, y su GLB lo pone la trampa. Se guarda 'schooner', su id
  // de GDD §13. Las descargas las apunta un fetch envuelto en la página, y la bienvenida, onWelcome del cliente
  test('AC-193 c, opción A: con una Goleta guardada no se predice nada: ningún modelo se descarga antes de la bienvenida', async ({ page }) => {
    test.setTimeout(120_000);
    const guestId = `e2eg${Date.now().toString(36).slice(-6)}`;
    await page.addInitScript((id) => {
      localStorage.setItem('sea-battle-guest-id', id);
      localStorage.setItem(`sea-battle-last-ship:guest:${id}`, 'schooner');
    }, guestId);
    const bytes = fs.readFileSync(FIXTURE);
    for (const url of [URL_OK, URL_SCHOONER]) await page.route(`**${url}`, (route) => route.fulfill({ body: bytes, contentType: 'model/gltf-binary' }));
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.addInitScript(
      ([ok, schooner]) => {
        const w = window as unknown as { __FETCHES__: [string, number][]; __WELCOME_AT__: number; __WELCOME_BEFORE_TRAP__: boolean };
        w.__FETCHES__ = [];
        w.__WELCOME_AT__ = 0;
        const fetch0 = window.fetch;
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          w.__FETCHES__.push([new URL(url, location.href).pathname, performance.now()]);
          return fetch0(input, init);
        };
        let debug: unknown;
        Object.defineProperty(window, '__SEA_BATTLE__', {
          configurable: true,
          get: () => debug,
          set: (v: { runtime(): unknown }) => {
            if (!debug) {
              const rt = v.runtime() as { useShipGlb(c: string, url: string): void; entry: { waitMs: number }; client: { welcome: unknown; onWelcome(l: () => void): void } };
              // Primero la bienvenida: si ya hubiera llegado, onWelcome la daría ahora y la precondición lo dice
              w.__WELCOME_BEFORE_TRAP__ = rt.client.welcome !== null;
              rt.client.onWelcome(() => {
                if (!w.__WELCOME_AT__) w.__WELCOME_AT__ = performance.now();
              });
              rt.useShipGlb('sloop', ok);
              rt.useShipGlb('schooner', schooner);
              rt.entry.waitMs = 10_000;
            }
            debug = v;
          }
        });
      },
      [URL_OK, URL_SCHOONER] as const
    );
    await enterGame(page);
    await expect.poll(async () => (await ownView(page)).modelMap, { timeout: 15_000 }).toBe(16); // la Balandra, con su GLB
    const got = await page.evaluate(() => {
      const w = window as unknown as { __FETCHES__: [string, number][]; __WELCOME_AT__: number; __WELCOME_BEFORE_TRAP__: boolean };
      return { welcomeBeforeTrap: w.__WELCOME_BEFORE_TRAP__, welcomeAt: Math.round(w.__WELCOME_AT__), models: w.__FETCHES__.filter(([p]) => p.startsWith('/models/')).map(([p, t]) => [p, t < w.__WELCOME_AT__ ? 'antes' : 'después', Math.round(t)]) };
    });
    console.log(`AC-193 c opción A, con una Goleta guardada: ${JSON.stringify(got)}`);
    expect([got.welcomeBeforeTrap, got.welcomeAt > 0]).toEqual([false, true]); // la trampa llegó antes que la bienvenida
    expect(got.models.map(([p, when]) => [p, when])).toEqual([[URL_OK, 'después']]);
    expect(errors).toEqual([]);
  });
});

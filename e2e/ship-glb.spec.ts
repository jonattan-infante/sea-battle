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
});

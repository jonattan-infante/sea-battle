// Loader de GLB de los barcos en el navegador (ASSET-SPEC §13 paso 6; D80; AC-193 a y c): el barco propio entra con el
// procedural y, al llegar su GLB, cambia a su geometría y su textura KTX2 sin otra draw call; si el GLB no llega, se
// queda el procedural. El GLB se escribe aquí desde el procedural de la Balandra (glb-writer.ts) con una textura KTX2
// magenta sin supercompresión, y lo sirve page.route. La textura ETC1S y el meshopt reales llegan con el piloto de ux
import { expect, Page, test } from '@playwright/test';
import * as THREE from 'three';
import { KTX2Exporter } from 'three/examples/jsm/exporters/KTX2Exporter.js';
import { buildShipAsset } from '../src/client/models/ship-geometry';
import { writeGlb } from '../src/client/models/__tests__/glb-writer';
import { enterGame } from './helpers';

const URL_OK = '/models/test/ship_sloop.glb';
const URL_404 = '/models/test/missing.glb';

async function glbBytes(): Promise<Buffer> {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set([255, 0, 255, 255], i * 4); // magenta: no sale en ningún barco procedural
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ktx2 = await new KTX2Exporter().parse(texture);
  // UV en (0,5; 0,5): cada vértice lee el centro de la textura
  const root = buildShipAsset('sloop');
  for (const child of root.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) continue;
    const g = mesh.geometry.clone();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2).fill(0.5), 2));
    mesh.geometry = g;
  }
  return Buffer.from(writeGlb(root, { image: { mimeType: 'image/ktx2', bytes: ktx2 } }));
}

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
  test('AC-193 a y c: el barco propio entra con el procedural y cambia al GLB con su textura KTX2, en 1 draw call', async ({ page }) => {
    const bytes = await glbBytes();
    const requests: string[] = [];
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

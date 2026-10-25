// La Cañonera y el Capitán de D91 en GLB (punto 3 de dev-render; ASSET-SPEC §13, sus filas): entran por el cargador de los
// barcos (src/client/models/ship-glb.ts), con el .glb y su .ktx2 aparte (paso 4c) en public/models. El cliente solo baja
// en segundo plano los modelos de los barcos que pueden salir (BACKLOG :423): la bienvenida lista las clases de NPC del
// mundo, y con el I2 apagado no están la Cañonera ni el Capitán
import fs from 'fs';
import path from 'path';
import { expect, Page, test } from '@playwright/test';
import { externalUris } from '../scripts/glb/glb-fallback';
import { SHIP_GLB } from '../src/client/models/ship-glb';
import { enterGame } from './helpers';
import { startOwnServer } from './own-server';

const I2_CLASSES = ['gunboat', 'captain'] as const;
// Las rutas del .glb y del .ktx2 de cada clase del I2, las de SHIP_GLB y la uri de la KTX2 dentro de su GLB
const I2_FILES = I2_CLASSES.flatMap((classId) => {
  const url = SHIP_GLB[classId]!;
  return [url, ...externalUris(new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'public', url)))).map((uri) => `/models/${uri}`)];
});

// Peticiones de la página a cada archivo del I2, desde antes de entrar
function countRequests(page: Page): () => Record<string, number> {
  const seen = new Map<string, number>();
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname;
    if (I2_FILES.includes(p)) seen.set(p, (seen.get(p) ?? 0) + 1);
  });
  return () => Object.fromEntries(I2_FILES.map((p) => [p, seen.get(p) ?? 0]));
}
const each = (n: number) => Object.fromEntries(I2_FILES.map((p) => [p, n]));

const npcClasses = (page: Page) =>
  page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { src: { welcome: { npcClasses: string[] } | null } }).src.welcome?.npcClasses ?? null);

test.describe('Precarga de los GLB de los barcos que pueden salir (BACKLOG :423)', () => {
  test('con el I2 apagado no se pide ni el .glb ni el .ktx2 de la Cañonera ni del Capitán', async ({ page }) => {
    const requests = countRequests(page);
    await enterGame(page);
    await page.waitForTimeout(3_000); // la precarga de los demás GLB arranca al entrar (prefetchAll)
    const classes = await npcClasses(page);
    console.log(`BACKLOG :423, I2 apagado: npcClasses ${JSON.stringify(classes)} · peticiones ${JSON.stringify(requests())}`);
    expect(classes).toEqual(['pirate', 'merchant']);
    expect(requests()).toEqual(each(0));
  });

  test('con el I2 encendido se piden 1 vez el .glb y el .ktx2 de cada uno, y las dos clases acaban con su GLB y su KTX2', async ({ page }) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_I2: '1' });
    try {
      const requests = countRequests(page);
      await enterGame(page, server.url);
      const ready = () =>
        page.evaluate((classes) => {
          const glb = (window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { loaded(c: string): boolean; model(c: string): { map?: { isCompressedTexture?: boolean } | null } } }).shipGlb;
          return classes.map((c) => glb.loaded(c) && glb.model(c).map?.isCompressedTexture === true);
        }, [...I2_CLASSES]);
      await expect.poll(ready, { timeout: 60_000 }).toEqual([true, true]);
      await page.waitForTimeout(1_000); // ninguna petición de más después
      const classes = await npcClasses(page);
      console.log(`BACKLOG :423, I2 encendido: npcClasses ${JSON.stringify(classes)} · peticiones ${JSON.stringify(requests())}`);
      expect(classes).toEqual(['pirate', 'merchant', 'gunboat', 'captain']);
      expect(requests()).toEqual(each(1));
    } finally {
      await server.kill();
    }
  });
});

// AC-102 (AS-V14, ASSET-SPEC §8.3): píxeles de vela visibles de las 5 clases P0 en los 24 rumbos de 0° a 345°, con
// la cámara del juego a zoom 0,7× en 1440×900. measureSails() renderiza offscreen con el renderer del juego, así que
// mide los modelos y la cámara que se ven en la partida, en LOD0 y en LOD1.
import { expect, test } from '@playwright/test';
import { enterGame } from './helpers';

interface SailRow {
  classId: string;
  lod: 0 | 1;
  headings: number;
  min: number;
  max: number;
  minHeadingDeg: number;
  ratio: number;
}

test.describe('Visibilidad de velas @perf', () => {
  test('AC-102: Balandra, Bergantín, Fragata, Pirata, Mercante y Capitán conservan ≥ 25 % de vela en todos los rumbos (LOD0 y LOD1)', async ({ page }) => {
    await enterGame(page);
    const rows: SailRow[] = await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      return ([0, 1] as const).flatMap((lod) =>
        rt.measureSails(['sloop', 'brig', 'frigate', 'pirate', 'merchant', 'captain'], false, lod).map((r) => ({
          classId: r.classId, lod: r.lod, headings: r.pixels.length, min: r.min, max: r.max, minHeadingDeg: r.minHeadingDeg, ratio: r.ratio
        }))
      );
    });
    for (const r of rows) console.log(`AC-102: ${r.classId} LOD${r.lod} · ratio ${r.ratio.toFixed(3)} (mín. ${r.min} px a ${r.minHeadingDeg}° / máx. ${r.max} px)`);
    expect(rows).toHaveLength(12);
    for (const r of rows) {
      expect(r.headings, `${r.classId} LOD${r.lod}: rumbos medidos`).toBe(24);
      expect(r.min, `${r.classId} LOD${r.lod}: vela visible en el peor rumbo`).toBeGreaterThan(0);
      expect(r.ratio, `${r.classId} LOD${r.lod}: AS-V14`).toBeGreaterThanOrEqual(0.25);
    }
  });
});

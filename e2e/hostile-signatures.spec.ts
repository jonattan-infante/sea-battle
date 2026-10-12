// AD-28 (ART-DIRECTION, AC-115; firma de valor de D43): los hostiles se distinguen en grises en 390×844 con zoom 1,0×.
// Escena sintética 'gallery' con el cañón N1 (2,82 px/m): el Pirata (LOD1 a esa escala) y el Capitán (LOD0), quietos y
// de uno en uno en el foco, a los rumbos 45, 135, 225 y 315°. Por pose, el mismo frame con el barco y sin él (captureImage
// del lienzo, a su resolución): máscara = píxeles con ΔE76 ≥ 3 entre las dos capturas. Firmas: área (px), L* medio de la
// máscara y fracción clara (L* ≥ 65). La Cañonera entra cuando exista su arte
import fs from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { enterGame } from './helpers';

const HOSTILES = ['pirate', 'captain'] as const;
const HEADINGS = [45, 135, 225, 315];
const PAIR_DIFF = 0.3; // al menos una firma difiere ≥ 30 % (|x − y| / máx)
const STANDARD_PX = 20; // el estandarte del Capitán: ≥ 20 px CSS de área con L* ≥ 80 en cada rumbo (D47: px de lienzo ÷ DPR²)
const OUT = process.env.AD28_OUT;

interface Signature { classId: string; deg: number; lod: number; dpr: number; area: number; meanL: number; light: number; bright: number }

// En la página: captura con y sin el barco, máscara y firmas
async function signature([id, keep]: [string, boolean]): Promise<Signature & { crops?: string[] }> {
  type Loose = { views: Map<string, { lod: number; mesh: { visible: boolean } }>; setPaused(p: boolean): void; captureImage(t: string): string | null };
  const rt = window.__SEA_BATTLE__!.runtime() as unknown as Loose;
  const view = rt.views.get(id)!;
  rt.setPaused(true);
  const con = rt.captureImage('image/png')!;
  view.mesh.visible = false;
  const sin = rt.captureImage('image/png')!;
  view.mesh.visible = true;
  rt.setPaused(false);
  const decode = async (url: string) => {
    const im = new Image();
    im.src = url;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(im, 0, 0);
    return x.getImageData(0, 0, c.width, c.height);
  };
  const [A, B] = await Promise.all([con, sin].map(decode));
  const N = A.width * A.height;
  // CIELab D65 desde sRGB de 8 bits (las constantes de e2e/hull-detail.spec.ts y de los scripts de QA)
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const lab = (d: Uint8ClampedArray, i: number) => {
    const r = lin(d[4 * i]), g = lin(d[4 * i + 1]), b = lin(d[4 * i + 2]);
    const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b), fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  let area = 0, sumL = 0, light = 0, bright = 0;
  for (let i = 0; i < N; i++) {
    const p = lab(A.data, i), q = lab(B.data, i);
    if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 3) continue;
    area++;
    sumL += p[0];
    if (p[0] >= 65) light++;
    if (p[0] >= 80) bright++;
  }
  const canvas = document.querySelector('canvas')!;
  return {
    classId: id, deg: 0, lod: view.lod, dpr: canvas.width / canvas.clientWidth,
    area, meanL: area ? sumL / area : 0, light: area ? light / area : 0, bright, crops: keep ? [con, sin] : undefined
  };
}

test.describe('Firmas de los hostiles @mobile', () => {
  test.setTimeout(180_000);

  test('AD-28 @mobile: en cada rumbo, Pirata y Capitán difieren ≥ 30 % en alguna firma; estandarte ≥ 20 px con L* ≥ 80', async ({ page }) => {
    if (OUT) fs.mkdirSync(OUT, { recursive: true });
    await enterGame(page);
    const setup = await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      rt.setCameraPreset('game');
      rt.setZoomLevel(1);
      const scene = rt.startScene('gallery', { cannonLevel: 1 });
      scene.spec.ships.forEach((s, i) => scene.setPose(s.id, scene.focus.x + 2000 * (i + 1), scene.focus.z, s.heading));
      (window as unknown as { __ad28: typeof scene }).__ad28 = scene;
      for (const k of ['add', 'alpha', 'water'] as const) rt.effects[k].mesh.visible = false;
      return { focus: scene.focus, ids: scene.spec.ships.map((s) => s.id), ppm: rt.stats().ppm };
    });
    await page.waitForTimeout(1500); // transición del encuadre
    const pose = (id: string, x: number, z: number, deg: number) =>
      page.evaluate(([id, x, z, deg]) => {
        (window as unknown as { __ad28: { setPose(id: string, x: number, z: number, h: number): void } }).__ad28.setPose(id, x, z, (deg * Math.PI) / 180);
      }, [id, x, z, deg] as [string, number, number, number]);
    const rows: Signature[] = [];
    for (const classId of HOSTILES) {
      const id = `g-${classId}`;
      const i = setup.ids.indexOf(id);
      expect(i, `${id} en la escena gallery`).toBeGreaterThanOrEqual(0);
      for (const deg of HEADINGS) {
        await pose(id, setup.focus.x, setup.focus.z, deg);
        await page.waitForTimeout(800);
        const { crops, ...s } = await page.evaluate(signature, [id, !!OUT] as [string, boolean]);
        rows.push({ ...s, classId, deg });
        if (OUT && crops) crops.forEach((url, k) => fs.writeFileSync(path.join(OUT, `ad28-${classId}-${deg}-${k ? 'sin' : 'con'}.png`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')));
      }
      await pose(id, setup.focus.x + 2000 * (i + 1), setup.focus.z, 90);
    }

    const diff = (x: number, y: number) => (Math.max(x, y) > 0 ? Math.abs(x - y) / Math.max(x, y) : 0);
    console.log(`AD-28: ppm ${setup.ppm.toFixed(3)} · lienzo a DPR ${rows[0].dpr}`);
    for (const r of rows) console.log(`AD-28 ${r.classId.padEnd(8)} ${String(r.deg).padStart(3)}° LOD${r.lod}: área ${r.area} px · L* medio ${r.meanL.toFixed(1)} · clara ${(100 * r.light).toFixed(1)} % · L* ≥ 80: ${r.bright} px de lienzo = ${(r.bright / r.dpr ** 2).toFixed(1)} px CSS`);
    const pairs: { deg: number; a: string; b: string; area: number; meanL: number; light: number }[] = [];
    for (const deg of HEADINGS) {
      for (let i = 0; i < HOSTILES.length; i++) {
        for (let j = i + 1; j < HOSTILES.length; j++) {
          const [a, b] = [HOSTILES[i], HOSTILES[j]].map((c) => rows.find((r) => r.classId === c && r.deg === deg)!);
          const p = { deg, a: a.classId, b: b.classId, area: diff(a.area, b.area), meanL: diff(a.meanL, b.meanL), light: diff(a.light, b.light) };
          pairs.push(p);
          console.log(`AD-28 ${String(deg).padStart(3)}° ${p.a}–${p.b}: área ${(100 * p.area).toFixed(0)} % · L* medio ${(100 * p.meanL).toFixed(0)} % · clara ${(100 * p.light).toFixed(0)} %`);
        }
      }
    }
    if (OUT) fs.writeFileSync(path.join(OUT, 'ad28.json'), JSON.stringify({ ppm: setup.ppm, rows, pairs }, null, 1));

    expect(rows.every((r) => r.area > 0), 'cada barco deja máscara').toBe(true);
    for (const p of pairs) expect.soft(Math.max(p.area, p.meanL, p.light), `AD-28 ${p.deg}° ${p.a}–${p.b}: la firma que más difiere`).toBeGreaterThanOrEqual(PAIR_DIFF);
    for (const r of rows.filter((q) => q.classId === 'captain')) expect.soft(r.bright / r.dpr ** 2, `AD-28 estandarte ${r.deg}°: px CSS con L* ≥ 80`).toBeGreaterThanOrEqual(STANDARD_PX);
  });
});

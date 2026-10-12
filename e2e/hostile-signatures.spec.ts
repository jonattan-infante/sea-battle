// AD-28 (ART-DIRECTION, AC-115; firma de valor de D43): los hostiles se distinguen en grises en 390×844 con zoom 1,0×.
// Escena sintética 'gallery' con el cañón N1 (2,82 px/m): el Pirata (LOD1 a esa escala), el Capitán y la Cañonera (LOD0),
// quietos y de uno en uno en el foco, a los rumbos 45, 135, 225 y 315°. Por pose, el mismo frame con el barco y sin él
// (captureImage del lienzo, a su resolución): máscara = píxeles con ΔE76 ≥ 3 entre las dos capturas. Firmas: área (px),
// L* medio de la máscara y fracción clara (L* ≥ 65). Además, los cañones de la Cañonera en 1440×900 con N3 (D48)
import fs from 'fs';
import path from 'path';
import { expect, Page, test } from '@playwright/test';
import { SHIP_LOOKS, TOP_FACE } from '../src/client/art';
import { deckHalfBeam, deckY, getShipModel } from '../src/client/models/ship-geometry';
import { enterGame } from './helpers';

const HOSTILES = ['pirate', 'captain', 'gunboat'] as const;
const HEADINGS = [45, 135, 225, 315];
const PAIR_DIFF = 0.3; // al menos una firma difiere ≥ 30 % (|x − y| / máx)
const STANDARD_PX = 20; // el estandarte del Capitán: ≥ 20 px CSS de área con L* ≥ 80 en cada rumbo (D47: px de lienzo ÷ DPR²)
// AD-28 (D48): cañones de la Cañonera en 1440×900. Parámetros del conteo, por si ux cambia la definición: nivel de cañón
// (N3 = 5,04 px/m), rumbos, en qué pasadas se oculta el mortero, largo mínimo de la mancha (Feret) y mínimo de cañones
const GUN_COUNT = { cannonLevel: 3, headings: HEADINGS, hideMortar: { capture: true, region: true }, minFeret: 4, minGuns: 8 };
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

// Escena 'gallery' con un nivel de cañón y zoom 1,0×, sin efectos; cada barco aparcado a 2 km del foco hasta que le toca
async function startGallery(page: Page, cannonLevel = 1) {
  await enterGame(page);
  const setup = await page.evaluate((cannonLevel) => {
    const rt = window.__SEA_BATTLE__!.runtime();
    rt.setCameraPreset('game');
    rt.setZoomLevel(1);
    const scene = rt.startScene('gallery', { cannonLevel });
    scene.spec.ships.forEach((s, i) => scene.setPose(s.id, scene.focus.x + 2000 * (i + 1), scene.focus.z, s.heading));
    (window as unknown as { __ad28: typeof scene }).__ad28 = scene;
    for (const k of ['add', 'alpha', 'water'] as const) rt.effects[k].mesh.visible = false;
    return { focus: scene.focus, ids: scene.spec.ships.map((s) => s.id), ppm: rt.stats().ppm };
  }, cannonLevel);
  await page.waitForTimeout(1500); // transición del encuadre
  const pose = (id: string, x: number, z: number, deg: number) =>
    page.evaluate(([id, x, z, deg]) => {
      (window as unknown as { __ad28: { setPose(id: string, x: number, z: number, h: number): void } }).__ad28.setPose(id, x, z, (deg * Math.PI) / 180);
    }, [id, x, z, deg] as [string, number, number, number]);
  return { ...setup, pose };
}

test.describe('Firmas de los hostiles @mobile', () => {
  test.setTimeout(180_000);

  test('AD-28 @mobile: en cada rumbo, cada par de Pirata, Capitán y Cañonera difiere ≥ 30 % en alguna firma; estandarte ≥ 20 px CSS con L* ≥ 80', async ({ page }) => {
    if (OUT) fs.mkdirSync(OUT, { recursive: true });
    const { pose, ...setup } = await startGallery(page);
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

// AD-28 (D48): cañones de la Cañonera en 1440×900 con N3 a 1,0× (5,04 px/m, el menor ppm de escritorio, como AS-V20) y los
// rumbos de AD-28. Región = píxeles con cobertura ≥ 50 % en un pase de solo el barco con la luz de albedo, la cubierta en
// blanco y el resto en negro, y los cañones, las cureñas y el mortero ocultos (sus triángulos colapsados), para que entre
// la cubierta que tapan. Manchas = componentes de 8 vecinos de píxeles con L* ≤ 25 en la captura normal, con el mortero
// también oculto, dentro de la región y con diámetro de Feret ≥ 4 px (máxima distancia entre los centros de dos píxeles)
interface Part { x: number; y: number; z: number }
interface CountOptions { hideMortar: { capture: boolean; region: boolean }; minFeret: number }
async function deckGuns([id, deckHex, cannonHex, railHex, carriages, mortar, opts, keep]: [string, string[], string, string, Part[], Part, CountOptions, boolean]): Promise<{ guns: number; ferets: number[]; crops?: string[] }> {
  type Attr = { count: number; array: Float32Array; clone(): Attr; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
  type Light = { isLight?: boolean; isHemisphereLight?: boolean; intensity: number; color: { clone(): unknown; copy(c: unknown): void; setRGB(r: number, g: number, b: number): void }; groundColor?: Light['color'] };
  type Node = Light & { visible: boolean; isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
  interface Loose {
    views: Map<string, { mesh: { visible: boolean; geometry: { getAttribute(n: string): Attr; setAttribute(n: string, a: Attr): void } } }>;
    rootScene: { traverse(fn: (o: Node) => void): void };
    setPaused(p: boolean): void;
    captureImage(type: string): string | null;
  }
  const rt = window.__SEA_BATTLE__!.runtime() as unknown as Loose;
  const geo = rt.views.get(id)!.mesh.geometry;
  const lin = (hex: string) => [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const deck = deckHex.flatMap((h) => [lin(h), lin(h).map((v) => v * 0.85)]); // tablas y su tira oscurecida junto a la borda
  const cannon = lin(cannonHex);
  const rail = lin(railHex);
  const color = geo.getAttribute('color');
  const pos = geo.getAttribute('position');
  const near = (v: number, c: number[]) => Math.abs(color.getX(v) - c[0]) + Math.abs(color.getY(v) - c[1]) + Math.abs(color.getZ(v) - c[2]) < 1e-4;
  const all = (t: number, f: (x: number, y: number, z: number) => boolean) => [0, 1, 2].every((k) => f(pos.getX(3 * t + k), pos.getY(3 * t + k), pos.getZ(3 * t + k)));
  const e = 1e-3;
  // Por color y volumen: el mortero es `cannon` dentro de su cilindro, y cada cureña, `rail` dentro de su caja (las tablas
  // de debajo tienen otro color y se quedan)
  const isMortar = (t: number) => near(3 * t, cannon) && all(t, (x, y, z) => Math.hypot(x - mortar.x, z - mortar.z) <= 1.3 + e && Math.abs(y - mortar.y) <= 0.6 + e);
  const isCarriage = (t: number) => near(3 * t, rail) && carriages.some((c) => all(t, (x, y, z) => Math.abs(x - c.x) <= 0.5 + e && Math.abs(y - c.y) <= 0.25 + e && Math.abs(z - c.z) <= 0.7 + e));
  const collapse = (hide: (t: number) => boolean) => {
    const flat = pos.clone();
    for (let t = 0; t < pos.count / 3; t++) if (hide(t)) for (let k = 1; k < 3; k++) flat.array.set(flat.array.slice(9 * t, 9 * t + 3), 9 * t + 3 * k);
    return flat;
  };
  rt.setPaused(true);
  // Captura normal (D48: con el mortero oculto)
  geo.setAttribute('position', collapse((t) => opts.hideMortar.capture && isMortar(t)));
  const con = rt.captureImage('image/png')!;
  // Pase de región: solo el barco, con la luz de albedo (blanco = 255), la cubierta en blanco y cañones, cureñas y mortero ocultos
  const hidden: Node[] = [];
  rt.rootScene.traverse((o) => {
    if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o !== (rt.views.get(id)!.mesh as unknown) && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });
  const lights: Light[] = [];
  rt.rootScene.traverse((o) => { if (o.isLight) lights.push(o); });
  const saved = lights.map((l) => ({ l, i: l.intensity, c: l.color.clone(), g: l.groundColor?.clone() }));
  for (const l of lights) {
    if (l.isHemisphereLight) {
      l.color.setRGB(1, 1, 1);
      l.groundColor!.setRGB(1, 1, 1);
      l.intensity = Math.PI;
    } else l.intensity = 0;
  }
  const ids = color.clone();
  for (let t = 0; t < pos.count / 3; t++) {
    const white = deck.some((c) => near(3 * t, c));
    for (let k = 0; k < 3; k++) ids.array.set(white ? [1, 1, 1] : [0, 0, 0], (3 * t + k) * 3);
  }
  geo.setAttribute('color', ids);
  geo.setAttribute('position', collapse((t) => (opts.hideMortar.region && isMortar(t)) || isCarriage(t) || (near(3 * t, cannon) && !isMortar(t))));
  const deckImg = rt.captureImage('image/png')!;
  geo.setAttribute('color', color);
  geo.setAttribute('position', pos);
  for (const o of hidden) o.visible = true;
  for (const s of saved) {
    s.l.intensity = s.i;
    s.l.color.copy(s.c);
    if (s.g) s.l.groundColor!.copy(s.g);
  }
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
  const [A, D] = await Promise.all([con, deckImg].map(decode));
  const W = A.width;
  const N = W * A.height;
  const linB = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = (i: number) => {
    const Y = 0.2126 * linB(A.data[4 * i]) + 0.7152 * linB(A.data[4 * i + 1]) + 0.0722 * linB(A.data[4 * i + 2]);
    return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
  };
  const dark = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (D.data[4 * i] >= 128 && L(i) <= 25) dark[i] = 1;
  const seen = new Uint8Array(N);
  const ferets: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!dark[i] || seen[i]) continue;
    const stack = [i];
    const px: number[] = [];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      px.push(j);
      const x = j % W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = j + dy * W + dx;
          if ((dx || dy) && x + dx >= 0 && x + dx < W && k >= 0 && k < N && dark[k] && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
    }
    let d2 = 0;
    for (let a = 0; a < px.length; a++) {
      for (let b = a + 1; b < px.length; b++) d2 = Math.max(d2, (px[a] % W - px[b] % W) ** 2 + (((px[a] / W) | 0) - ((px[b] / W) | 0)) ** 2);
    }
    ferets.push(Math.sqrt(d2));
  }
  return { guns: ferets.filter((f) => f >= opts.minFeret).length, ferets: ferets.sort((a, b) => b - a), crops: keep ? [con, deckImg] : undefined };
}

test.describe('Cañones de la Cañonera', () => {
  test.setTimeout(180_000);

  test('AD-28: en 1440×900 con N3 se cuentan ≥ 8 cañones de la Cañonera sobre su cubierta en cada rumbo', async ({ page }) => {
    if (OUT) fs.mkdirSync(OUT, { recursive: true });
    const { pose, ...setup } = await startGallery(page, GUN_COUNT.cannonLevel);
    const id = 'g-gunboat';
    const i = setup.ids.indexOf(id);
    expect(i, `${id} en la escena gallery`).toBeGreaterThanOrEqual(0);
    // Cureñas y mortero en coordenadas del asset, de la receta (ASSET-SPEC §8.4)
    const r = getShipModel('gunboat').recipe;
    const carriages = r.cannonZ.flatMap((z) => [1, -1].map((side) => ({ x: side * (deckHalfBeam(r, z / r.L) - 1.0), y: deckY(r, z / r.L) + 0.25, z })));
    const mortar = { x: 0, y: deckY(r, r.mortarZ! / r.L) + 0.6, z: r.mortarZ! };
    const deck = [TOP_FACE.deckGunboat.albedo, TOP_FACE.deckAltGunboat.albedo];
    const rows: { deg: number; guns: number; ferets: number[] }[] = [];
    const opts: CountOptions = { hideMortar: GUN_COUNT.hideMortar, minFeret: GUN_COUNT.minFeret };
    for (const deg of GUN_COUNT.headings) {
      await pose(id, setup.focus.x, setup.focus.z, deg);
      await page.waitForTimeout(800);
      const { crops, ...q } = await page.evaluate(deckGuns, [id, deck, SHIP_LOOKS.pirate.cannon, SHIP_LOOKS.pirate.rail, carriages, mortar, opts, !!OUT] as [string, string[], string, string, Part[], Part, CountOptions, boolean]);
      rows.push({ deg, ...q });
      if (OUT && crops) crops.forEach((url, k) => fs.writeFileSync(path.join(OUT, `ad28-cañones-${deg}-${k ? 'region' : 'con'}.png`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')));
    }
    console.log(`AD-28 cañones: ppm ${(await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stats().ppm)).toFixed(3)}`);
    for (const q of rows) console.log(`AD-28 cañones ${String(q.deg).padStart(3)}°: ${q.guns} manchas con Feret ≥ ${GUN_COUNT.minFeret} px (Feret ${q.ferets.slice(0, 16).map((f) => f.toFixed(1)).join(' ')})`);
    for (const q of rows) expect.soft(q.guns, `AD-28 cañones de la Cañonera ${q.deg}°`).toBeGreaterThanOrEqual(GUN_COUNT.minGuns);
  });
});

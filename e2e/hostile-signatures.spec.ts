// AD-28 (ART-DIRECTION, AC-115; firma de valor de D43): los hostiles se distinguen en grises en 390×844 con zoom 1,0×.
// Escena sintética 'gallery' con el cañón N1 (2,82 px/m): el Pirata (LOD1 a esa escala), el Capitán y la Cañonera (LOD0),
// quietos y de uno en uno en el foco, a los rumbos 45, 135, 225 y 315°. Por pose, el mismo frame con el barco y sin él
// (captureImage del lienzo, a su resolución): máscara = píxeles con ΔE76 ≥ 3 entre las dos capturas. Firmas: área (px CSS),
// L* medio de la máscara, fracción clara (L* ≥ 65) y fracción media (45 ≤ L* < 65, la cubierta clara de la Cañonera; D51).
// El área se pasa a px CSS con el DPR de su propia captura (anchura de la imagen ÷ anchura CSS del lienzo): la calidad
// adaptativa puede bajar el DPR del lienzo a mitad de la prueba, también entre una captura y el final de su fila (O-62,
// QA-53 y su anexo); un control determinista lo prueba con la misma pose a 2 DPR. Además, los cañones de la Cañonera en
// 1440×900 con N3 (D48)
import fs from 'fs';
import path from 'path';
import { expect, Page, test } from '@playwright/test';
import { SHIP_LOOKS, TOP_FACE } from '../src/client/art';
import { deckHalfBeam, deckY, getShipModel } from '../src/client/models/ship-geometry';
import { SHIP_GLB } from '../src/client/models/ship-glb';
import { GeometryArrays, geometryArrays, GUNBOAT_GLB_AD28, gunboatGlbParts } from './ad28-parts';
import { enterGame } from './helpers';

const HOSTILES = ['pirate', 'captain', 'gunboat'] as const;
const HEADINGS = [45, 135, 225, 315];
// D51: en cada rumbo, cada par difiere en al menos 2 firmas. Una firma difiere si |x − y| / máx ≥ 30 % y, en las fracciones,
// además |x − y| ≥ 1 punto, para que dos fracciones casi nulas (0,02 % frente a 0 %) no cuenten como distintas
const PAIR_DIFF = 0.3;
const FRACTION_POINTS = 0.01;
const PAIR_SIGNATURES = 2;
const STANDARD_PX = 20; // el estandarte del Capitán: ≥ 20 px CSS de área con L* ≥ 80 en cada rumbo (D47: px de lienzo ÷ DPR²)
// O-62, control determinista del área en px CSS: cada hostil a 45° (el rumbo de los rojos de la CI), en pausa, se captura con
// el lienzo a DPR 1,5 (el tope del móvil), otra vez a 1,5 y a 1,125 (×0,75, el paso de la calidad adaptativa). El cociente
// de las áreas en px CSS entre 1,5 y 1,125 queda a ≤ 15 % de 1; sin dividir por el DPR² sería (585·1266)/(438·949) ≈ 1,78.
// Tolerancia: en el Mac (0aad965), el área en px CSS de la misma fila varía hasta un 10,2 % entre corridas al mismo DPR, y
// entre 1,5 y 1,1231 el cociente de las medias por fila va de 0,994 a 1,069
const DPR_CHECK = { deg: 45, dprs: [1.5, 1.5, 1.125], tolerance: 0.15 };
// AD-28 (D48): cañones de la Cañonera en 1440×900. Parámetros del conteo, por si ux cambia la definición: nivel de cañón
// (N3 = 5,04 px/m), rumbos, en qué pasadas se oculta el mortero, largo mínimo de la mancha (Feret) y mínimo de cañones
const GUN_COUNT = { cannonLevel: 3, headings: HEADINGS, hideMortar: { capture: true, region: true }, minFeret: 4, minGuns: 8, sway: { captures: 5, everyMs: 1150 } };
// Producto (BACKLOG :421; ART-DIRECTION, AD-28): se cuentan cañones distintos con ≥ 6 px de caña. Una mancha con cañón y
// Feret ≥ minFeret da su cañón principal, el de más px limpios en ella en las 2 pasadas de identidad, si tiene ≥ CANA_MIN
const CANA_MIN = 6;
const OUT = process.env.AD28_OUT;

// area en px del lienzo; areaCss = area ÷ dpr², con el dpr de la imagen capturada
interface Signature { classId: string; deg: number; lod: number; dpr: number; area: number; areaCss: number; meanL: number; light: number; mid: number; bright: number; model: string }

// model: con qué se dibujó la vista en esa pose, el procedural o el GLB con su respaldo o con su KTX2 (ship-glb.ts)
type ModelView = { model: { map?: { isCompressedTexture?: boolean } | null } };

// Las clases con GLB en el manifiesto (la Cañonera y el Capitán de D91) cambian a él al llegar: la escena pide su GLB al
// crear la vista. Antes de medir se espera a que lleguen, con su KTX2, para que todas las poses midan el modelo que se ve
// en el juego, y no unas el procedural y otras el GLB (O-62)
const GLB_HOSTILES = HOSTILES.filter((c) => SHIP_GLB[c]);
const glbReady = (page: Page, classes: readonly string[]) =>
  expect
    .poll(
      () =>
        page.evaluate((classes) => {
          const glb = (window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { loaded(c: string): boolean; model(c: string): ModelView['model'] } }).shipGlb;
          return classes.every((c) => glb.loaded(c) && glb.model(c).map?.isCompressedTexture === true);
        }, classes),
      { timeout: 60_000 }
    )
    .toBe(true);
const posesByModel = (rows: { model: string }[]) => JSON.stringify(rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.model]: (n[r.model] ?? 0) + 1 }), {}));

// En la página: captura con y sin el barco, máscara y firmas. Con `dprs` (el control de O-62), además el mismo instante con
// el lienzo a cada uno de esos DPR, medido igual; después el lienzo vuelve al DPR que tenía
async function signature([id, keep, dprs = []]: [string, boolean, number[]?]): Promise<Signature & { crops?: string[]; atDpr?: Signature[] }> {
  type Loose = { views: Map<string, { lod: number; mesh: { visible: boolean }; model: { map?: { isCompressedTexture?: boolean } | null } }>; gl: { getPixelRatio(): number; setPixelRatio(r: number): void }; setPaused(p: boolean): void; captureImage(t: string): string | null };
  const rt = window.__SEA_BATTLE__!.runtime() as unknown as Loose;
  const view = rt.views.get(id)!;
  const shot = () => {
    const con = rt.captureImage('image/png')!;
    view.mesh.visible = false;
    const sin = rt.captureImage('image/png')!;
    view.mesh.visible = true;
    return [con, sin];
  };
  rt.setPaused(true);
  const [con, sin] = shot();
  const dpr0 = rt.gl.getPixelRatio();
  const shots = dprs.map((r) => {
    rt.gl.setPixelRatio(r);
    return shot();
  });
  if (dprs.length) rt.gl.setPixelRatio(dpr0);
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
  // CIELab D65 desde sRGB de 8 bits (las constantes de e2e/hull-detail.spec.ts y de los scripts de QA)
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const lab = (d: Uint8ClampedArray, i: number) => {
    const r = lin(d[4 * i]), g = lin(d[4 * i + 1]), b = lin(d[4 * i + 2]);
    const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b), fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const measure = async ([con, sin]: string[]): Promise<Signature> => {
    const [A, B] = await Promise.all([con, sin].map(decode));
    const N = A.width * A.height;
    let area = 0, sumL = 0, light = 0, mid = 0, bright = 0;
    for (let i = 0; i < N; i++) {
      const p = lab(A.data, i), q = lab(B.data, i);
      if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 3) continue;
      area++;
      sumL += p[0];
      if (p[0] >= 65) light++;
      else if (p[0] >= 45) mid++;
      if (p[0] >= 80) bright++;
    }
    // El DPR de la captura, no el del lienzo ahora: tras los await de la decodificación puede ser otro (O-62)
    const dpr = A.width / document.querySelector('canvas')!.clientWidth;
    return {
      classId: id, deg: 0, lod: view.lod, dpr, model: !view.model.map ? 'procedural' : view.model.map.isCompressedTexture ? 'ktx2' : 'respaldo',
      area, areaCss: area / dpr ** 2, meanL: area ? sumL / area : 0, light: area ? light / area : 0, mid: area ? mid / area : 0, bright
    };
  };
  return { ...(await measure([con, sin])), crops: keep ? [con, sin] : undefined, atDpr: shots.length ? await Promise.all(shots.map(measure)) : undefined };
}

// Escena 'gallery' con un nivel de cañón y zoom 1,0×, sin efectos; cada barco aparcado a 2 km del foco hasta que le toca.
// retain: clases que se miden en su procedural, con su GLB retenido (no baja)
async function startGallery(page: Page, cannonLevel = 1, retain: readonly string[] = []) {
  for (const c of retain) await page.route(`**${SHIP_GLB[c]}`, (r) => r.abort());
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
  await glbReady(page, GLB_HOSTILES.filter((c) => !retain.includes(c))); // AD-28 con los GLB de D91 (O-62)
  const pose = (id: string, x: number, z: number, deg: number) =>
    page.evaluate(([id, x, z, deg]) => {
      (window as unknown as { __ad28: { setPose(id: string, x: number, z: number, h: number): void } }).__ad28.setPose(id, x, z, (deg * Math.PI) / 180);
    }, [id, x, z, deg] as [string, number, number, number]);
  return { ...setup, pose };
}

test.describe('Firmas de los hostiles @mobile', () => {
  test.setTimeout(180_000);

  test('AD-28 @mobile (D51): en cada rumbo, cada par de Pirata, Capitán y Cañonera difiere en al menos 2 firmas; estandarte ≥ 20 px CSS con L* ≥ 80', async ({ page }) => {
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
    const dprs = [...new Set(rows.map((r) => r.dpr.toFixed(4)))];
    console.log(`AD-28: ppm ${setup.ppm.toFixed(3)} · DPR de las capturas ${dprs.join(', ')}${dprs.length > 1 ? ' (cambió a mitad de la prueba: las áreas se comparan en px CSS, O-62)' : ''}`);
    console.log(`AD-28 poses por modelo: ${posesByModel(rows)}`);
    for (const r of rows) console.log(`AD-28 ${r.classId.padEnd(8)} ${String(r.deg).padStart(3)}° LOD${r.lod} DPR ${r.dpr.toFixed(4)} ${r.model}: área ${r.area} px de lienzo = ${r.areaCss.toFixed(0)} px CSS · L* medio ${r.meanL.toFixed(1)} · clara ${(100 * r.light).toFixed(1)} % · media ${(100 * r.mid).toFixed(1)} % · L* ≥ 80: ${r.bright} px de lienzo = ${(r.bright / r.dpr ** 2).toFixed(1)} px CSS`);
    type Key = 'area' | 'meanL' | 'light' | 'mid';
    const KEYS: [Key, string][] = [['area', 'área'], ['meanL', 'L* medio'], ['light', 'clara'], ['mid', 'media']];
    const pairs: ({ deg: number; a: string; b: string; signatures: number; differs: Record<Key, boolean> } & Record<Key, number>)[] = [];
    for (const deg of HEADINGS) {
      for (let i = 0; i < HOSTILES.length; i++) {
        for (let j = i + 1; j < HOSTILES.length; j++) {
          const [a, b] = [HOSTILES[i], HOSTILES[j]].map((c) => rows.find((r) => r.classId === c && r.deg === deg)!);
          const rel = { area: diff(a.areaCss, b.areaCss), meanL: diff(a.meanL, b.meanL), light: diff(a.light, b.light), mid: diff(a.mid, b.mid) };
          const differs = {
            area: rel.area >= PAIR_DIFF,
            meanL: rel.meanL >= PAIR_DIFF,
            light: rel.light >= PAIR_DIFF && Math.abs(a.light - b.light) >= FRACTION_POINTS,
            mid: rel.mid >= PAIR_DIFF && Math.abs(a.mid - b.mid) >= FRACTION_POINTS
          };
          const p = { deg, a: a.classId, b: b.classId, ...rel, differs, signatures: KEYS.filter(([k]) => differs[k]).length };
          pairs.push(p);
          console.log(`AD-28 ${String(deg).padStart(3)}° ${p.a}–${p.b}: ${KEYS.map(([k, label]) => `${label} ${(100 * p[k]).toFixed(0)} %${differs[k] ? ' ✓' : ''}`).join(' · ')} → ${p.signatures} firmas`);
        }
      }
    }
    // O-62: la clara del par Capitán–Cañonera, con el modelo de cada uno, para vigilarla en la CI. Difiere con lo de D51:
    // ≥ 30 % del mayor y ≥ 1 punto
    for (const deg of HEADINGS) {
      const [c, g] = (['captain', 'gunboat'] as const).map((k) => rows.find((r) => r.classId === k && r.deg === deg)!);
      const p = pairs.find((q) => q.deg === deg && q.a === 'captain' && q.b === 'gunboat')!;
      console.log(`AD-28 clara ${String(deg).padStart(3)}° Capitán (${c.model}) – Cañonera (${g.model}), O-62: ${(100 * c.light).toFixed(1)} % frente a ${(100 * g.light).toFixed(1)} % · ${(100 * Math.abs(c.light - g.light)).toFixed(1)} puntos (mínimo 1) · ${(100 * p.light).toFixed(0)} % del mayor (mínimo 30) → ${p.differs.light ? 'difiere' : 'NO difiere'}`);
    }
    if (OUT) fs.writeFileSync(path.join(OUT, 'ad28.json'), JSON.stringify({ ppm: setup.ppm, rows, pairs }, null, 1));

    expect(rows.every((r) => r.area > 0), 'cada barco deja máscara').toBe(true);
    for (const p of pairs) expect.soft(p.signatures, `AD-28 ${p.deg}° ${p.a}–${p.b}: firmas que difieren (D51)`).toBeGreaterThanOrEqual(PAIR_SIGNATURES);
    for (const r of rows.filter((q) => q.classId === 'captain')) expect.soft(r.bright / r.dpr ** 2, `AD-28 estandarte ${r.deg}°: px CSS con L* ≥ 80`).toBeGreaterThanOrEqual(STANDARD_PX);
  });

  test('AD-28 @mobile (O-62): la misma pose en el mismo instante da casi la misma área en px CSS con el lienzo a DPR 1,5 y a 1,125', async ({ page }) => {
    const { pose, ...setup } = await startGallery(page);
    for (const classId of HOSTILES) {
      const id = `g-${classId}`;
      const i = setup.ids.indexOf(id);
      expect(i, `${id} en la escena gallery`).toBeGreaterThanOrEqual(0);
      await pose(id, setup.focus.x, setup.focus.z, DPR_CHECK.deg);
      await page.waitForTimeout(800);
      const [hi, again, lo] = (await page.evaluate(signature, [id, false, DPR_CHECK.dprs] as [string, boolean, number[]])).atDpr!;
      const k = hi.areaCss / lo.areaCss;
      console.log(`AD-28 DPR ${classId.padEnd(8)} ${DPR_CHECK.deg}° LOD${hi.lod} ${hi.model}: DPR ${[hi, again, lo].map((s) => s.dpr.toFixed(4)).join(', ')} · área ${[hi, again, lo].map((s) => s.area).join(', ')} px de lienzo = ${[hi, again, lo].map((s) => s.areaCss.toFixed(0)).join(', ')} px CSS · al mismo DPR ×${(hi.areaCss / again.areaCss).toFixed(3)} · de 1,5 a 1,125: en px de lienzo ×${(hi.area / lo.area).toFixed(3)}, en px CSS ×${k.toFixed(3)}`);
      expect(hi.dpr / lo.dpr, `AD-28 DPR ${classId}: el lienzo cambió de DPR entre las capturas`).toBeGreaterThan(1.3);
      expect.soft(Math.abs(k - 1), `AD-28 DPR ${classId}: |área en px CSS a DPR 1,5 ÷ a 1,125 − 1| (O-62)`).toBeLessThanOrEqual(DPR_CHECK.tolerance);
      await pose(id, setup.focus.x + 2000 * (i + 1), setup.focus.z, 90);
    }
  });
});

// AD-28 (D48): cañones de la Cañonera en 1440×900 con N3 a 1,0× (5,04 px/m, el menor ppm de escritorio, como AS-V20) y los
// rumbos de AD-28. Región = píxeles con cobertura ≥ 50 % en un pase de solo el barco con la luz de albedo, la cubierta en
// blanco y el resto en negro, y los cañones, las cureñas y el mortero ocultos (sus triángulos colapsados), para que entre
// la cubierta que tapan. Manchas = componentes de 8 vecinos de píxeles con L* ≤ 25 en la captura normal, con el mortero
// también oculto, dentro de la región y con diámetro de Feret ≥ 4 px (máxima distancia entre los centros de dos píxeles).
// En el procedural (producto, r11 084fbd9 :421), cañón = triángulo `look.cannon` con el centroide a 1,5 m o más del eje, la
// frontera de U6 (GUNBOAT_GLB_AD28.axis); mortero = ese color a menos de 1,5 m; cureña = `rail` dentro de su caja.
// Con el GLB de D91 (U6 de dev-render), las partes no salen del color de la receta sino de gunboatGlbParts, por triángulo
// (e2e/ad28-parts.ts): se mide sobre una copia sin índice de su geometría, con los triángulos en el mismo orden, y el pase
// de región va sin el atlas, para que la cubierta salga en blanco
interface Part { x: number; y: number; z: number }
interface CountOptions { hideMortar: { capture: boolean; region: boolean }; minFeret: number; axis: number }
interface PartTris { cannon: number; mortar: number; carriage: number }
interface Sway { roll: number; pitch: number; y: number } // el balanceo de la vista en la captura (rad, rad y m)
interface GlbParts { cannon: number[]; mortar: number[]; carriage: number[]; deck: number[] }
// Una mancha oscura de la cubierta (px del lienzo) y los px limpios de cada cañón que tiene, «babor z 1.4»
interface BlobDetail { feret: number; px: number; x: number; y: number; cannon: boolean; carriage: boolean; ids: Record<string, number> }
type GunArgs = [string, string[], string, string, Part[], CountOptions, boolean, GlbParts | null, number[]];
async function deckGuns([id, deckHex, cannonHex, railHex, carriages, opts, keep, glb, zs]: GunArgs): Promise<{ guns: number; mounts: number; ferets: number[]; gunFerets: number[]; tris: PartTris; sway: Sway; model: string; blobs: BlobDetail[]; crops?: string[] }> {
  type Attr = { count: number; array: Float32Array; clone(): Attr; getX(i: number): number; getY(i: number): number; getZ(i: number): number; setXYZ(i: number, x: number, y: number, z: number): void };
  type Geo = { getAttribute(n: string): Attr; setAttribute(n: string, a: Attr): void; toNonIndexed(): Geo; dispose(): void };
  type Light = { isLight?: boolean; isHemisphereLight?: boolean; intensity: number; color: { clone(): unknown; copy(c: unknown): void; setRGB(r: number, g: number, b: number): void }; groundColor?: Light['color'] };
  type Node = Light & { visible: boolean; isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
  interface Loose {
    views: Map<string, { mesh: { visible: boolean; geometry: Geo; material: { map: unknown; needsUpdate: boolean }; rotation: { x: number; z: number }; position: { y: number } }; model: { map?: { isCompressedTexture?: boolean } | null } }>;
    rootScene: { traverse(fn: (o: Node) => void): void };
    setPaused(p: boolean): void;
    captureImage(type: string): string | null;
  }
  const rt = window.__SEA_BATTLE__!.runtime() as unknown as Loose;
  const view = rt.views.get(id)!;
  const original = view.mesh.geometry;
  const geo = glb ? original.toNonIndexed() : original;
  view.mesh.geometry = geo;
  const lin = (hex: string) => [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const deck = deckHex.flatMap((h) => [lin(h), lin(h).map((v) => v * 0.85)]); // tablas y su tira oscurecida junto a la borda
  const cannon = lin(cannonHex);
  const rail = lin(railHex);
  const color = geo.getAttribute('color');
  const pos = geo.getAttribute('position');
  const near = (v: number, c: number[]) => Math.abs(color.getX(v) - c[0]) + Math.abs(color.getY(v) - c[1]) + Math.abs(color.getZ(v) - c[2]) < 1e-4;
  const all = (t: number, f: (x: number, y: number, z: number) => boolean) => [0, 1, 2].every((k) => f(pos.getX(3 * t + k), pos.getY(3 * t + k), pos.getZ(3 * t + k)));
  const e = 1e-3;
  // Por color y posición: el cañón es `cannon` con el centroide a axis m o más del eje, el mortero, `cannon` a menos, y
  // cada cureña, `rail` dentro de su caja (las tablas de debajo tienen otro color y se quedan)
  const sets = glb && { cannon: new Set(glb.cannon), mortar: new Set(glb.mortar), carriage: new Set(glb.carriage), deck: new Set(glb.deck) };
  const offAxis = (t: number) => Math.abs(pos.getX(3 * t) + pos.getX(3 * t + 1) + pos.getX(3 * t + 2)) / 3 >= opts.axis;
  const isMortar = (t: number) => (sets ? sets.mortar.has(t) : near(3 * t, cannon) && !offAxis(t));
  const isCarriage = (t: number) => (sets ? sets.carriage.has(t) : near(3 * t, rail) && carriages.some((c) => all(t, (x, y, z) => Math.abs(x - c.x) <= 0.5 + e && Math.abs(y - c.y) <= 0.25 + e && Math.abs(z - c.z) <= 0.7 + e)));
  const isCannon = (t: number) => (sets ? sets.cannon.has(t) : near(3 * t, cannon) && offAxis(t));
  const isDeck = (t: number) => (sets ? sets.deck.has(t) : deck.some((c) => near(3 * t, c)));
  // Triángulos de cada parte, al registro (producto: HIPÓTESIS de 288 de cañón y 32 de mortero en el procedural)
  const tris: PartTris = { cannon: 0, mortar: 0, carriage: 0 };
  for (let t = 0; t < pos.count / 3; t++) {
    if (isCannon(t)) tris.cannon++;
    if (isMortar(t)) tris.mortar++;
    if (isCarriage(t)) tris.carriage++;
  }
  const collapse = (hide: (t: number) => boolean) => {
    const flat = pos.clone();
    for (let t = 0; t < pos.count / 3; t++) if (hide(t)) for (let k = 1; k < 3; k++) flat.array.set(flat.array.slice(9 * t, 9 * t + 3), 9 * t + 3 * k);
    return flat;
  };
  rt.setPaused(true);
  const sway: Sway = { roll: view.mesh.rotation.z, pitch: view.mesh.rotation.x, y: view.mesh.position.y };
  // Captura normal (D48: con el mortero oculto)
  geo.setAttribute('position', collapse((t) => opts.hideMortar.capture && isMortar(t)));
  const con = rt.captureImage('image/png')!;
  // Pase de región: solo el barco, con la luz de albedo (blanco = 255), la cubierta en blanco y cañones, cureñas y mortero ocultos
  const hidden: Node[] = [];
  rt.rootScene.traverse((o) => {
    if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o !== (view.mesh as unknown) && o.visible) {
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
    const w = isDeck(t) ? 1 : 0;
    for (let k = 0; k < 3; k++) ids.setXYZ(3 * t + k, w, w, w); // setXYZ normaliza: también con el COLOR_0 de 8 bits del GLB
  }
  geo.setAttribute('color', ids);
  geo.setAttribute('position', collapse((t) => (opts.hideMortar.region && isMortar(t)) || isCarriage(t) || isCannon(t)));
  const material = view.mesh.material;
  const map = material.map;
  if (map) {
    material.map = null;
    material.needsUpdate = true;
  }
  const deckImg = rt.captureImage('image/png')!;
  // Pase de piezas (AD-28, ux, 2026-10-24: se cuentan cañones): la geometría de la captura (con el mortero oculto), sin el
  // atlas, el cañón en rojo y la cureña en verde. Una mancha es cañón si toca el rojo (cobertura ≥ 50 %); montaje, si toca
  // el rojo o el verde
  const pieces = color.clone();
  for (let t = 0; t < pos.count / 3; t++) {
    const c = isCannon(t) ? 1 : 0;
    const g = isCarriage(t) ? 1 : 0;
    for (let k = 0; k < 3; k++) pieces.setXYZ(3 * t + k, c, g, 0);
  }
  geo.setAttribute('color', pieces);
  geo.setAttribute('position', collapse((t) => opts.hideMortar.capture && isMortar(t)));
  const piecesImg = rt.captureImage('image/png')!;
  // De qué cañón es cada píxel de cañón (turno a-v7 de dev-render): cada triángulo de cañón va a su cañón por su centroide,
  // el lado por el signo de x (+X babor, −X estribor; ASSET-SPEC §2) y la z por la más cercana de zs, a < 0,7 m. Dos pasadas
  // más con la geometría de la captura, en colores puros (con la luz de albedo salen a 0 o a ≥ 200): «lado», R = babor y
  // G = estribor; «z», el índice de la z + 1 en binario en R, G y B. Lo demás, negro
  const side = color.clone();
  const zid = color.clone();
  for (let t = 0; t < pos.count / 3; t++) {
    const cx = (pos.getX(3 * t) + pos.getX(3 * t + 1) + pos.getX(3 * t + 2)) / 3;
    const cz = (pos.getZ(3 * t) + pos.getZ(3 * t + 1) + pos.getZ(3 * t + 2)) / 3;
    const zi = isCannon(t) ? zs.findIndex((z) => Math.abs(z - cz) < 0.7) : -1;
    const sd = zi >= 0 ? [cx > 0 ? 1 : 0, cx < 0 ? 1 : 0, 0] : [0, 0, 0];
    const b = zi >= 0 ? [(zi + 1) & 1, ((zi + 1) >> 1) & 1, ((zi + 1) >> 2) & 1] : [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      side.setXYZ(3 * t + k, sd[0], sd[1], sd[2]);
      zid.setXYZ(3 * t + k, b[0], b[1], b[2]);
    }
  }
  geo.setAttribute('color', side);
  const sideImg = rt.captureImage('image/png')!;
  geo.setAttribute('color', zid);
  const zImg = rt.captureImage('image/png')!;
  if (map) {
    material.map = map;
    material.needsUpdate = true;
  }
  geo.setAttribute('color', color);
  geo.setAttribute('position', pos);
  view.mesh.geometry = original;
  if (glb) geo.dispose();
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
  const [A, D, P, SI, ZI] = await Promise.all([con, deckImg, piecesImg, sideImg, zImg].map(decode));
  // El cañón de un píxel, de las 2 pasadas; null si algún canal queda entre 56 y 199 (borde mezclado con el fondo: un px de
  // caña es el que la caña cubre en las 4 muestras del MSAA 4×)
  const cannonAt = (j: number) => {
    const bit = (v: number) => (v >= 200 ? 1 : v <= 55 ? 0 : -1);
    const [r, g] = [bit(SI.data[4 * j]), bit(SI.data[4 * j + 1])];
    const z = [0, 1, 2].map((c) => bit(ZI.data[4 * j + c]));
    if (r + g !== 1 || r < 0 || g < 0 || z.some((v) => v < 0)) return null;
    const zi = z[0] + 2 * z[1] + 4 * z[2] - 1;
    return zi >= 0 && zi < zs.length ? `${r ? 'babor' : 'estribor'} z ${zs[zi].toFixed(1)}` : null;
  };
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
  const blobs: BlobDetail[] = [];
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
    const ids: Record<string, number> = {};
    for (const j of px) {
      if (P.data[4 * j] < 128) continue;
      const c = cannonAt(j);
      if (c) ids[c] = (ids[c] ?? 0) + 1;
    }
    const x = px.reduce((sx, j) => sx + (j % W), 0) / px.length;
    const y = px.reduce((sy, j) => sy + ((j / W) | 0), 0) / px.length;
    blobs.push({ feret: Math.sqrt(d2), px: px.length, x, y, cannon: px.some((j) => P.data[4 * j] >= 128), carriage: px.some((j) => P.data[4 * j + 1] >= 128), ids });
  }
  const big = blobs.filter((b) => b.feret >= opts.minFeret).sort((a, b) => b.feret - a.feret);
  const model = view.model;
  return {
    guns: big.filter((b) => b.cannon).length,
    mounts: big.filter((b) => b.cannon || b.carriage).length,
    ferets: blobs.map((b) => b.feret).sort((a, b) => b - a),
    gunFerets: big.filter((b) => b.cannon).map((b) => b.feret),
    tris,
    sway,
    model: !model.map ? 'procedural' : model.map.isCompressedTexture ? 'ktx2' : 'respaldo',
    blobs: [...blobs].sort((a, b) => b.feret - a.feret),
    crops: keep ? [con, deckImg, piecesImg] : undefined
  };
}

// La geometría que dibuja la vista, si es la de un GLB (con atlas), y sus partes de AD-28 (U6)
// geometryArrays corre en la página tal cual (su texto), para leer los atributos como el test de Jest (ad28-parts.test.ts)
const glbParts = async (page: Page, id: string) => {
  const got = (await page.evaluate(`(() => {
    const v = window.__SEA_BATTLE__.runtime().views.get(${JSON.stringify(id)});
    return v.model.map ? { lod: v.lod, arrays: (${geometryArrays.toString()})(v.mesh.geometry) } : null;
  })()`)) as { lod: number; arrays: GeometryArrays } | null;
  return got && { lod: got.lod, parts: gunboatGlbParts(got.arrays) };
};

// El conteo de AD-28 en una página: la Cañonera al foco en cada rumbo; con retain = ['gunboat'], en su procedural (su GLB,
// retenido), y cada pose tiene que serlo. Cuentan los cañones distintos con ≥ CANA_MIN px de caña (cannonCount); los px de
// cañón salen, en el GLB, de sus triángulos de U6, y en el procedural, de su color y su distancia al eje (isCannon)
async function countGuns(page: Page, retain: readonly string[]) {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const { pose, ...setup } = await startGallery(page, GUN_COUNT.cannonLevel, retain);
  const id = 'g-gunboat';
  const i = setup.ids.indexOf(id);
  expect(i, `${id} en la escena gallery`).toBeGreaterThanOrEqual(0);
  // Cureñas y mortero en coordenadas del asset, de la receta (ASSET-SPEC §8.4)
  const r = getShipModel('gunboat').recipe;
  const carriages = r.cannonZ.flatMap((z) => [1, -1].map((side) => ({ x: side * (deckHalfBeam(r, z / r.L) - 1.0), y: deckY(r, z / r.L) + 0.25, z })));
  const deck = [TOP_FACE.deckGunboat.albedo, TOP_FACE.deckAltGunboat.albedo];
  const rows: { deg: number; guns: number; mounts: number; ferets: number[]; gunFerets: number[]; tris: PartTris; model: string; all: number; cana: number }[] = [];
  const opts: CountOptions = { hideMortar: GUN_COUNT.hideMortar, minFeret: GUN_COUNT.minFeret, axis: GUNBOAT_GLB_AD28.axis };
  // Con el GLB, sus partes por triángulo (U6), de la geometría que dibuja la vista (LOD0 con N3)
  const glb = await glbParts(page, id);
  if (glb) {
    console.log(`AD-28 cañones, partes del GLB (U6): LOD${glb.lod} · ${glb.parts.cannon.length} triángulos de cañón, ${glb.parts.mortar.length} de mortero, ${glb.parts.carriage.length} de cureña en ${glb.parts.carriages.length} cajas, ${glb.parts.deck.length} de cubierta`);
    expect(glb.parts.cannon.length, 'AD-28 cañones: el GLB con N3 dibuja sus cañones (LOD0)').toBeGreaterThan(0);
  }
  const parts: GlbParts | null = glb && { cannon: glb.parts.cannon, mortar: glb.parts.mortar, carriage: glb.parts.carriage, deck: glb.parts.deck };
  const zs = glb ? GUNBOAT_GLB_AD28.cannonZ : r.cannonZ; // las z de los cañones, de U6 o de la receta del procedural
  const args = (keep: boolean): GunArgs => [id, deck, SHIP_LOOKS.pirate.cannon, SHIP_LOOKS.pirate.rail, carriages, opts, keep, parts, zs];
  for (const deg of GUN_COUNT.headings) {
    await pose(id, setup.focus.x, setup.focus.z, deg);
    await page.waitForTimeout(800);
    const { crops, ...q } = await page.evaluate(deckGuns, args(!!OUT));
    rows.push({ deg, ...q, ...cannonCount(`${deg}° captura de siempre (${q.model})`, q.blobs, zs) });
    if (OUT && crops) crops.forEach((url, k) => fs.writeFileSync(path.join(OUT, `ad28-cañones-${q.model}-${deg}-${['con', 'region', 'piezas'][k]}.png`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')));
  }
  console.log(`AD-28 cañones: ppm ${(await page.evaluate(() => window.__SEA_BATTLE__!.runtime().stats().ppm)).toFixed(3)}`);
  console.log(`AD-28 cañones, poses por modelo: ${posesByModel(rows)}`);
  for (const model of new Set(rows.map((q) => q.model))) {
    const { tris } = rows.find((q) => q.model === model)!;
    console.log(`AD-28 cañones, triángulos del pase (${model}): ${tris.cannon} de cañón, ${tris.mortar} de mortero, ${tris.carriage} de cureña`);
  }
  // Las manchas con cañón, los montajes (manchas con cañón o cureña) y las demás manchas se registran sin asertar
  for (const q of rows) console.log(`AD-28 cañones ${String(q.deg).padStart(3)}° ${q.model}: ${q.cana} cañones distintos con ≥ ${CANA_MIN} px de caña (${q.all} sin el mínimo) · ${q.guns} manchas con cañón y Feret ≥ ${GUN_COUNT.minFeret} px (Feret ${q.gunFerets.map((f) => f.toFixed(1)).join(' ')}) · ${q.mounts} montajes, sin asertar · todas (Feret ${q.ferets.slice(0, 16).map((f) => f.toFixed(1)).join(' ')})`);
  if (retain.includes('gunboat')) for (const q of rows) expect.soft(q.model, `AD-28 cañones ${q.deg}°: el procedural, con el GLB retenido`).toBe('procedural');
  // El procedural y el GLB, cada uno en su línea (C5P cae en la 1.ª y C5 en la 2.ª)
  for (const q of rows.filter((q) => q.model === 'procedural')) expect.soft(q.cana, `AD-28 cañones de la Cañonera ${q.deg}° (procedural)`).toBeGreaterThanOrEqual(GUN_COUNT.minGuns);
  for (const q of rows.filter((q) => q.model !== 'procedural')) expect.soft(q.cana, `AD-28 cañones de la Cañonera ${q.deg}° (${q.model})`).toBeGreaterThanOrEqual(GUN_COUNT.minGuns);
  // El paso (4) de la Cañonera (BACKLOG :421): en cada rumbo, 5 capturas más con el balanceo, con 1,15 s de espera entre
  // ellas (el alabeo, runtime.ts, sin(1,1 t), ±3°, tiene un periodo de 5,7 s), cada una con su asignación al registro. En
  // el GLB, cada una da ≥ 8 cañones distintos, en su propia línea; el procedural se registra igual, sin asertar
  const { captures, everyMs } = GUN_COUNT.sway;
  const sway: { deg: number; k: number; model: string; all: number; cana: number }[] = [];
  const started = Date.now();
  const toDeg = (rad: number) => ((rad * 180) / Math.PI).toFixed(2);
  for (const deg of GUN_COUNT.headings) {
    await pose(id, setup.focus.x, setup.focus.z, deg);
    for (let k = 1; k <= captures; k++) {
      await page.waitForTimeout(everyMs);
      const q = await page.evaluate(deckGuns, args(false));
      const c = cannonCount(`${deg}° balanceo ${k}/${captures} (${q.model})`, q.blobs, zs);
      sway.push({ deg, k, model: q.model, ...c });
      console.log(`AD-28 cañones ${String(deg).padStart(3)}° ${q.model}, balanceo ${k}/${captures} (alabeo ${toDeg(q.sway.roll)}°, cabeceo ${toDeg(q.sway.pitch)}°, y ${q.sway.y.toFixed(3)} m): ${c.cana} cañones distintos con ≥ ${CANA_MIN} px de caña (${c.all} sin el mínimo) · ${q.guns} manchas con cañón y Feret ≥ ${GUN_COUNT.minFeret} px (Feret ${q.gunFerets.map((f) => f.toFixed(1)).join(' ')}) · ${q.mounts} montajes`);
    }
  }
  const byDeg = GUN_COUNT.headings.map((deg) => `${deg}° ${sway.filter((q) => q.deg === deg).map((q) => q.cana).join(', ')}`);
  console.log(`AD-28 cañones con el balanceo, ${captures} capturas por rumbo en ${((Date.now() - started) / 1000).toFixed(1)} s: ${byDeg.join(' · ')} · el menor ${Math.min(...sway.map((q) => q.cana))} (${[...new Set(sway.map((q) => q.model))].join(', ')})`);
  if (retain.includes('gunboat')) for (const q of sway) expect.soft(q.model, `AD-28 cañones ${q.deg}°, balanceo ${q.k}: el procedural, con el GLB retenido`).toBe('procedural');
  for (const q of sway.filter((q) => q.model !== 'procedural')) expect.soft(q.cana, `AD-28 cañones de la Cañonera ${q.deg}°, balanceo ${q.k}/${captures} (${q.model})`).toBeGreaterThanOrEqual(GUN_COUNT.minGuns);
}

// La asignación de una captura (turno a-v8 de dev-render): cada mancha con su Feret, sus px, su centro y los px limpios de
// cada cañón que toca; cada cañón, si cuenta (es el principal de una mancha con cañón y Feret ≥ minFeret, el de más px en
// ella) o por qué no; y los cañones distintos sin el mínimo de caña (all) y con él (cana: el principal, con ≥ CANA_MIN px
// suyos en la mancha). Un cañón partido en 2 manchas cuenta 1, y 2 cañones en una mancha cuentan 1, el principal
function cannonCount(tag: string, blobs: BlobDetail[], zs: number[]) {
  blobs.forEach((b, n) => {
    const ids = Object.entries(b.ids).sort((u, v) => v[1] - u[1]);
    console.log(`  AD-28 ${tag} · mancha ${n + 1}/${blobs.length}: Feret ${b.feret.toFixed(1)} px · ${b.px} px · centro (${b.x.toFixed(1)}, ${b.y.toFixed(1)}) · ${b.cannon ? `cañón ${ids.length ? ids.map(([c, m]) => `${c} (${m} px)`).join(' + ') : 'sin px limpios'}` : 'sin cañón'}${b.carriage ? ' · cureña' : ''}${b.feret >= GUN_COUNT.minFeret && b.cannon ? ' · CUENTA' : ''}`);
  });
  const main = (b: BlobDetail) => Object.entries(b.ids).sort((u, v) => v[1] - u[1])[0];
  const counted = blobs.filter((b) => b.cannon && b.feret >= GUN_COUNT.minFeret);
  const all = new Set(counted.map((b) => main(b)?.[0]).filter((c): c is string => !!c));
  const cana = new Set(counted.map((b) => main(b)).filter((m): m is [string, number] => !!m && m[1] >= CANA_MIN).map((m) => m[0]));
  const state = ['babor', 'estribor'].flatMap((sd) => zs.map((z) => `${sd} z ${z.toFixed(1)}`)).map((c) => {
    if (cana.has(c)) return { c, ok: true, why: '' };
    if (all.has(c)) return { c, ok: false, why: `menos de ${CANA_MIN} px de caña` };
    const shared = counted.find((b) => b.ids[c]);
    if (shared) return { c, ok: false, why: `en la mancha de ${main(shared)?.[0]}` };
    const small = blobs.filter((b) => b.ids[c]).sort((u, v) => v.feret - u.feret)[0];
    return { c, ok: false, why: small ? `su mayor mancha, de ${small.feret.toFixed(1)} px` : 'sin mancha oscura' };
  });
  console.log(`  AD-28 ${tag} · cuentan ${cana.size}: ${state.filter((q) => q.ok).map((q) => q.c).join(', ')} · no cuentan: ${state.filter((q) => !q.ok).map((q) => `${q.c} (${q.why})`).join(', ')}`);
  return { all: all.size, cana: cana.size };
}

test.describe('Cañones de la Cañonera', () => {
  test.setTimeout(300_000); // las 4 capturas de siempre y las 20 con el balanceo, cada una con 5 pasadas

  test('AD-28: en 1440×900 con N3 se cuentan ≥ 8 cañones distintos de la Cañonera sobre su cubierta en cada rumbo, también en 5 capturas con el balanceo', async ({ page }) => {
    await countGuns(page, []);
  });

  // Con la Cañonera en GLB, también su procedural, que es lo que se ve mientras carga o si falla (producto, con ux,
  // 2026-10-24). Sin GLB, el test de arriba ya mide el procedural
  test('AD-28: con la Cañonera en GLB, su procedural (el GLB retenido) también da ≥ 8 cañones distintos en cada rumbo', async ({ page }) => {
    test.skip(!SHIP_GLB.gunboat, 'la Cañonera no tiene GLB en SHIP_GLB');
    await countGuns(page, ['gunboat']);
  });
});

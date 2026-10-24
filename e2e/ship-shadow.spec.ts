// Sombra en el agua y luz de forma de los GLB de la receta (palancas 4 y 3 de D91; ASSET-SPEC §13, fila 6, U1–U5 de
// dev-render), en la escena gallery de 1440×900 con N3 (5,04 px/m, el peor caso de las reglas en px; ART-DIRECTION :319),
// quieta (setPaused) y sin VFX, para que la espuma de contacto, que se dibuja encima, no abra huecos en la sombra
import { expect, Page, test } from '@playwright/test';
import { LIGHTING } from '../src/client/art';
import { SHAPE_LIGHT } from '../src/client/models/ship-geometry';
import { SHIP_GLB } from '../src/client/models/ship-glb';
import { SHADOW_Y } from '../src/client/models/ship-shadow';
import { enterGame } from './helpers';

const HEADINGS = [45, 135, 225, 315];
// El Capitán de D91. La Cañonera, sin entrada en SHIP_GLB (BACKLOG :421: el Capitán entra solo), es un procedural más
const GLB_CLASSES = ['captain'] as const;

// Retiene los GLB de las clases hasta release()
async function hold(page: Page, classes: readonly string[]): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  for (const c of classes) {
    await page.route(`**${SHIP_GLB[c]!}`, async (route) => {
      await held;
      await route.continue();
    });
  }
  return release;
}

const glbLoaded = (page: Page, classes: readonly string[]) =>
  expect
    .poll(() => page.evaluate((classes) => {
      const glb = (window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { loaded(c: string): boolean; model(c: string): { map?: { isCompressedTexture?: boolean } | null } } }).shipGlb;
      return classes.every((c) => glb.loaded(c) && glb.model(c).map?.isCompressedTexture === true);
    }, classes), { timeout: 60_000 })
    .toBe(true);

// Escena gallery con N3 y 1,0×, sin VFX; los barcos, aparcados a 2 km del foco hasta que les toca
async function startGallery(page: Page) {
  const setup = await page.evaluate(() => {
    const rt = window.__SEA_BATTLE__!.runtime();
    rt.setCameraPreset('game');
    rt.setZoomLevel(1);
    const scene = rt.startScene('gallery', { cannonLevel: 3 });
    scene.spec.ships.forEach((s, i) => scene.setPose(s.id, scene.focus.x + 2000 * (i + 1), scene.focus.z, s.heading));
    (window as unknown as { __shadowScene: typeof scene }).__shadowScene = scene;
    rt.setVfxVisible(false);
    return { focus: scene.focus, ids: scene.spec.ships.map((s) => s.id) };
  });
  await page.waitForTimeout(1500); // transición del encuadre
  const pose = (id: string, x: number, z: number, deg: number) =>
    page.evaluate(([id, x, z, deg]) => {
      (window as unknown as { __shadowScene: { setPose(id: string, x: number, z: number, h: number): void } }).__shadowScene.setPose(id, x, z, (deg * Math.PI) / 180);
    }, [id, x, z, deg] as [string, number, number, number]);
  return { ...setup, pose };
}

// Instancias de sombra del frame, por malla visible, con la clase cuyo LOD1 dibuja cada una
const shadows = (page: Page) =>
  page.evaluate(() => {
    type Rt = { shipShadows: { group: { children: { visible: boolean; count: number; geometry: unknown }[] } }; shipGlb: { model(c: string): { lods: unknown[] } } };
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as Rt;
    const classOf = (g: unknown) => ['sloop', 'brig', 'frigate', 'pirate', 'merchant', 'captain', 'gunboat'].find((c) => rt.shipGlb.model(c).lods[1] === g) ?? '?';
    return rt.shipShadows.group.children.filter((m) => m.visible).map((m) => `${classOf(m.geometry)}×${m.count}`).sort();
  });

test.describe('Sombra en el agua de los GLB (U1–U4)', () => {
  test.setTimeout(180_000);

  test('U1: los procedurales (también la Cañonera) no proyectan sombra, el Capitán tampoco mientras carga su GLB, y con él sí, una; el lienzo tiene stencil', async ({ page }) => {
    const release = await hold(page, GLB_CLASSES);
    await enterGame(page);
    const stencil = await page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { gl: { getContext(): WebGL2RenderingContext } }).gl.getContext().getContextAttributes()?.stencil);
    expect(stencil, 'la sombra marca cada píxel una vez con el stencil').toBe(true);
    const { focus, ids, pose } = await startGallery(page);
    // Las 7 clases en pantalla, a 40 m unas de otras
    for (const [i, id] of ids.entries()) await pose(id, focus.x + 40 * (i - 3), focus.z, 90);
    await page.waitForTimeout(800);
    const loading = await shadows(page);
    release();
    await glbLoaded(page, GLB_CLASSES);
    await page.waitForTimeout(800);
    const loaded = await shadows(page);
    console.log(`U1: sombras con los GLB retenidos ${JSON.stringify(loading)} · con los GLB ${JSON.stringify(loaded)}`);
    expect(loading).toEqual([]);
    expect(loaded).toEqual(['captain×1']);
  });

  // U2 con U8 de ux (ASSET-SPEC :825): (a) la razón de luminancia lineal de cada píxel con y sin la sombra, en el mismo frame
  // congelado, 0,60 ± 0,03 de media sobre los píxeles a ≥ 3 px del borde de la sombra y de la silueta del barco; la razón
  // frente al anillo de agua de 3 a 10 px por fuera va solo al log. (b) Área de sombra (razón ≤ 0,80, la mitad de la caída:
  // un píxel del borde cuenta si la sombra cubre ≥ 50 %) a ±10 % de la del modelo: el LOD1 de la vista recortado en y = 0 y
  // proyectado por sunDir a y = SHADOW_Y, rasterizado aquí por el centro de cada píxel del lienzo, menos lo que tapa el
  // barco. Distancias en px de lienzo con 8 vecinos
  test('U2: la sombra del Capitán en los 4 rumbos deja el agua a 0,60 ± 0,03 de su luz y cubre el área del modelo (±10 %)', async ({ page }) => {
    await enterGame(page);
    const { focus, pose } = await startGallery(page);
    await glbLoaded(page, GLB_CLASSES);
    const rows: (Awaited<ReturnType<typeof measure>> & { classId: string; deg: number })[] = [];
    for (const classId of GLB_CLASSES) {
      const id = `g-${classId}`;
      for (const deg of HEADINGS) {
        await pose(id, focus.x, focus.z, deg);
        await page.waitForTimeout(800);
        rows.push({ classId, deg, ...(await measure(page, id)) });
      }
      await pose(id, focus.x + 2000, focus.z, 90);
    }
    for (const r of rows) console.log(`U2 ${r.classId.padEnd(7)} ${String(r.deg).padStart(3)}°: razón ${r.sameRatio.toFixed(3)} frente al mismo píxel sin sombra (media de ${r.inside} px a ≥ 3 px del borde y del barco; agua sin sombra ahí: luminancia lineal ${r.water.toFixed(4)}, sRGB medio ${r.waterHex}) · ${r.ringRatio.toFixed(3)} frente al anillo (${r.ring} px, solo log) · área ${r.area} px frente a ${r.model} del modelo (${(100 * (r.area / r.model - 1)).toFixed(1)} %) · barco ${r.ship} px`);
    for (const r of rows) {
      expect.soft(r.inside, `U2 ${r.classId} ${r.deg}°: px a ≥ 3 px del borde`).toBeGreaterThan(0);
      expect.soft(Math.abs(r.sameRatio - 0.6), `U2 (a) ${r.classId} ${r.deg}°: razón ${r.sameRatio.toFixed(3)}`).toBeLessThanOrEqual(0.03);
      expect.soft(Math.abs(r.area / r.model - 1), `U2 (b) ${r.classId} ${r.deg}°: área ${r.area} frente a ${r.model}`).toBeLessThanOrEqual(0.1);
    }
  });
});

// En la página: 3 capturas del mismo frame (barco y sombra; solo el barco; nada) y el modelo de la sombra
const measure = (page: Page, id: string) =>
  page.evaluate(async ([id, sun, shadowY]) => {
    type Attr = { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
    type View = { mesh: { visible: boolean; matrix: { elements: number[] } }; model: { lods: { index: { count: number; getX(i: number): number } | null; getAttribute(n: string): Attr }[] } };
    type Rt = { views: Map<string, View>; shipShadows: { group: { visible: boolean } }; setPaused(p: boolean): void; captureImage(t: string): string | null; projectInto(x: number, y: number, z: number, out: { sx: number; sy: number }): void };
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as Rt;
    const view = rt.views.get(id)!;
    rt.setPaused(true);
    const con = rt.captureImage('image/png')!;
    rt.shipShadows.group.visible = false;
    const noShadow = rt.captureImage('image/png')!;
    view.mesh.visible = false;
    const none = rt.captureImage('image/png')!;
    view.mesh.visible = true;
    rt.shipShadows.group.visible = true;
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
    const [A, B, C] = await Promise.all([con, noShadow, none].map(decode));
    const W = A.width;
    const H = A.height;
    const k = W / window.innerWidth;
    const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const Y = (d: Uint8ClampedArray, i: number) => 0.2126 * lin(d[4 * i]) + 0.7152 * lin(d[4 * i + 1]) + 0.0722 * lin(d[4 * i + 2]);
    // El modelo: cada triángulo del LOD1 en coordenadas del mundo, recortado en y ≥ 0, proyectado al agua y a px de lienzo
    const m = view.mesh.matrix.elements;
    const g = view.model.lods[1];
    const pos = g.getAttribute('position');
    const n = g.index ? g.index.count / 3 : pos.count / 3;
    const vi = (t: number, j: number) => (g.index ? g.index.getX(3 * t + j) : 3 * t + j);
    const world = (i: number) => {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    };
    const out = { sx: 0, sy: 0 };
    const model = new Uint8Array(W * H);
    for (let t = 0; t < n; t++) {
      let poly = [0, 1, 2].map((j) => world(vi(t, j)));
      const clipped: number[][] = [];
      for (let j = 0; j < poly.length; j++) {
        const p = poly[j], q = poly[(j + 1) % poly.length];
        if (p[1] >= 0) clipped.push(p);
        if ((p[1] >= 0) !== (q[1] >= 0)) {
          const s = p[1] / (p[1] - q[1]);
          clipped.push([p[0] + s * (q[0] - p[0]), 0, p[2] + s * (q[2] - p[2])]);
        }
      }
      if (clipped.length < 3) continue;
      poly = clipped.map(([x, y, z]) => {
        const d = (y - shadowY) / sun[1];
        rt.projectInto(x - sun[0] * d, shadowY, z - sun[2] * d, out);
        return [out.sx * k, out.sy * k];
      });
      let area2 = 0;
      for (let j = 0; j < poly.length; j++) area2 += poly[j][0] * poly[(j + 1) % poly.length][1] - poly[(j + 1) % poly.length][0] * poly[j][1];
      if (Math.abs(area2) < 1e-9) continue;
      const sgn = Math.sign(area2);
      const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
      for (let py = Math.max(0, Math.floor(Math.min(...ys))); py <= Math.min(H - 1, Math.ceil(Math.max(...ys))); py++) {
        for (let px = Math.max(0, Math.floor(Math.min(...xs))); px <= Math.min(W - 1, Math.ceil(Math.max(...xs))); px++) {
          const cx = px + 0.5, cy = py + 0.5;
          let inside = true;
          for (let j = 0; j < poly.length && inside; j++) {
            const [ax, ay] = poly[j], [bx, by] = poly[(j + 1) % poly.length];
            inside = sgn * ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) >= 0;
          }
          if (inside) model[py * W + px] = 1;
        }
      }
    }
    // Barco: lo que cambia entre solo el barco y nada; sombra: razón ≤ 0,8 frente al mismo píxel sin ella
    const ship = new Uint8Array(W * H);
    const shadow = new Uint8Array(W * H);
    let shipPx = 0, area = 0, modelPx = 0;
    for (let i = 0; i < W * H; i++) {
      if (B.data[4 * i] !== C.data[4 * i] || B.data[4 * i + 1] !== C.data[4 * i + 1] || B.data[4 * i + 2] !== C.data[4 * i + 2]) {
        ship[i] = 1;
        shipPx++;
        continue;
      }
      if (Y(A.data, i) <= 0.8 * Y(B.data, i)) {
        shadow[i] = 1;
        area++;
      }
      if (model[i]) modelPx++;
    }
    // Distancia (8 vecinos) a lo que no es sombra, dentro, y a la sombra, fuera
    const dist = (seed: (i: number) => boolean) => {
      const d = new Int32Array(W * H).fill(-1);
      let queue: number[] = [];
      for (let i = 0; i < W * H; i++) if (seed(i)) { d[i] = 0; queue.push(i); }
      while (queue.length) {
        const next: number[] = [];
        for (const i of queue) {
          const x = i % W, y = (i / W) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if ((dx || dy) && xx >= 0 && xx < W && yy >= 0 && yy < H && d[yy * W + xx] < 0) { d[yy * W + xx] = d[i] + 1; next.push(yy * W + xx); }
          }
        }
        queue = next;
      }
      return d;
    };
    const toEdge = dist((i) => !shadow[i]);
    const toShadow = dist((i) => !!shadow[i]);
    const toShip = dist((i) => !!ship[i]);
    let inN = 0, inCon = 0, ratioSum = 0, inSin = 0, ringN = 0, ringCon = 0;
    const rgb = [0, 0, 0];
    for (let i = 0; i < W * H; i++) {
      if (shadow[i] && toEdge[i] >= 3 && (toShip[i] < 0 || toShip[i] >= 3)) {
        inN++;
        inCon += Y(A.data, i);
        inSin += Y(B.data, i);
        ratioSum += Y(A.data, i) / Y(B.data, i);
        for (let c = 0; c < 3; c++) rgb[c] += B.data[4 * i + c];
      } else if (!shadow[i] && !ship[i] && toShadow[i] >= 3 && toShadow[i] <= 10) { ringN++; ringCon += Y(A.data, i); }
    }
    rt.setPaused(false);
    const hex = '#' + rgb.map((v) => Math.round(inN ? v / inN : 0).toString(16).padStart(2, '0')).join('').toUpperCase();
    return { inside: inN, ring: ringN, ringRatio: inN && ringN ? inCon / inN / (ringCon / ringN) : 0, sameRatio: inN ? ratioSum / inN : 0, water: inN ? inSin / inN : 0, waterHex: hex, area, model: modelPx, ship: shipPx };
  }, [id, [...LIGHTING.sunDir], SHADOW_Y] as [string, number[], number]);

// U5: la luz de forma, solo en los GLB de la receta. Con uShapeLight a (1, 1), la luz de sin ella; la razón por píxel del
// barco (luminancia lineal con ella / sin ella) es KH en lo que el sol no toca de la madera del casco (_rim_mask = 1), 1 en
// lo que no es casco y mayor que 1 donde da el sol. Un procedural no la lleva: sus píxeles no cambian
test.describe('Luz de forma de los GLB (U5)', () => {
  test.setTimeout(180_000);

  test('U5: en el Capitán, la razón con y sin la luz de forma no baja de KH − 0,06 y la moda de la razón < 0,95 (bin = floor(razón × 100); con empate, todos los bins empatados) cae en [0,68; 0,69) o [0,69; 0,70) (los costados en sombra); el Pirata, procedural, sale idéntico píxel a píxel', async ({ page }) => {
    await enterGame(page);
    const { focus, pose } = await startGallery(page);
    await glbLoaded(page, ['captain']);
    const rows: { deg: number; px: number; min: number; low: number; lowMedian: number; hist: number[]; lit: number }[] = [];
    for (const deg of HEADINGS) {
      await pose('g-captain', focus.x, focus.z, deg);
      await page.waitForTimeout(800);
      rows.push({ deg, ...(await shapeRatios(page, 'g-captain')) });
    }
    await pose('g-captain', focus.x + 2000, focus.z, 90);
    await pose('g-pirate', focus.x, focus.z, 135);
    await page.waitForTimeout(800);
    const pirate = await page.evaluate(() => {
      type Fx = { uShapeLight: { value: { set(x: number, y: number): void; toArray(): number[] } } };
      type Rt = { views: Map<string, { mesh: { material: { userData: { fx: Fx } } } }>; setPaused(p: boolean): void; captureImage(t: string): string | null };
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as Rt;
      const u = rt.views.get('g-pirate')!.mesh.material.userData.fx.uShapeLight.value;
      const [ks, kh] = u.toArray();
      rt.setPaused(true);
      const on = rt.captureImage('image/png')!;
      u.set(1, 1);
      const off = rt.captureImage('image/png')!;
      u.set(ks, kh);
      rt.setPaused(false);
      return { same: on === off, length: on.length };
    });
    for (const r of rows) console.log(`U5 Capitán ${String(r.deg).padStart(3)}°: ${r.px} px del barco · razón mínima ${r.min.toFixed(3)} · ${r.low} px con razón < 0,95 (${lowMode(r.hist).txt} · mediana ${r.lowMedian.toFixed(3)}; KH ${SHAPE_LIGHT.kh.toFixed(3)}) · ${r.lit} px > 1,02`);
    console.log(`U5 Pirata procedural: con y sin la luz de forma, ${pirate.same ? 'el mismo PNG' : 'PNG distintos'} (${pirate.length} caracteres)`);
    expect(pirate.same).toBe(true);
    const low = rows.reduce((s, r) => s + r.low, 0);
    expect(low, 'px de costado en sombra en los 4 rumbos').toBeGreaterThan(50);
    for (const r of rows) {
      expect.soft(r.min, `U5 ${r.deg}°: razón mínima`).toBeGreaterThanOrEqual(SHAPE_LIGHT.kh - 0.06);
      if (r.low >= 10) expect.soft(lowMode(r.hist).fuera, `U5 ${r.deg}°: bins de la moda de la razón < 0,95 (con empate, todos) fuera de [0,68; 0,69) y [0,69; 0,70)`).toEqual([]);
    }
  });
});

// En la página: el barco con la luz de forma y sin ella (uShapeLight a 1, 1), y sin barco para la máscara
const shapeRatios = (page: Page, id: string) =>
  page.evaluate(async (id) => {
    type Fx = { uShapeLight: { value: { set(x: number, y: number): void; toArray(): number[] } } };
    type Rt = { views: Map<string, { mesh: { visible: boolean; material: { userData: { fx: Fx } } } }>; setPaused(p: boolean): void; captureImage(t: string): string | null };
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as Rt;
    const view = rt.views.get(id)!;
    const u = view.mesh.material.userData.fx.uShapeLight.value;
    const [ks, kh] = u.toArray();
    rt.setPaused(true);
    const on = rt.captureImage('image/png')!;
    u.set(1, 1);
    const off = rt.captureImage('image/png')!;
    u.set(ks, kh);
    view.mesh.visible = false;
    const none = rt.captureImage('image/png')!;
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
    const [A, B, C] = await Promise.all([on, off, none].map(decode));
    const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const Y = (d: Uint8ClampedArray, i: number) => 0.2126 * lin(d[4 * i]) + 0.7152 * lin(d[4 * i + 1]) + 0.0722 * lin(d[4 * i + 2]);
    const ratios: number[] = [];
    for (let i = 0; i < A.width * A.height; i++) {
      const ship = B.data[4 * i] !== C.data[4 * i] || B.data[4 * i + 1] !== C.data[4 * i + 1] || B.data[4 * i + 2] !== C.data[4 * i + 2];
      if (ship && Y(B.data, i) >= 0.004) ratios.push(Y(A.data, i) / Y(B.data, i)); // sin los casi negros, donde 1 paso de 8 bits pesa > 10 %
    }
    const low = ratios.filter((r) => r < 0.95).sort((a, b) => a - b); const hist = new Array<number>(300).fill(0); for (const r of ratios) hist[Math.min(299, Math.floor(r * 100))]++; // el histograma del diagnóstico de U5
    return { px: ratios.length, min: ratios.length ? Math.min(...ratios) : 0, low: low.length, lowMedian: low.length ? low[low.length >> 1] : 0, hist, lit: ratios.filter((r) => r > 1.02).length };
  }, id);

// U5 (producto, r11 1f581f2): la moda de las razones < 0,95, con la función del diagnóstico de U5: los bins 0–94 del
// histograma de la página (bin = floor(razón × 100), sobre la razón en bruto). Con empate cuentan todos los bins empatados,
// y todos tienen que caer en [0,68; 0,69) o [0,69; 0,70), el bin de KH (0,690) y el de debajo: fuera son los que no (sin
// moda, [-1]). txt, para el registro: la moda y los 3 bins más altos con su recuento
function lowMode(hist: number[]) {
  const low = hist.slice(0, 95);
  const n = Math.max(...low);
  const bins = n > 0 ? low.flatMap((c, b) => (c === n ? [b] : [])) : [];
  const fuera = bins.length ? bins.filter((b) => b !== 68 && b !== 69) : [-1];
  const top3 = low.map((c, b) => ({ bin: b, n: c })).sort((x, y) => y.n - x.n || x.bin - y.bin).slice(0, 3);
  const bin = (b: number) => `[${(b / 100).toFixed(2)}, ${((b + 1) / 100).toFixed(2)})`;
  return { bins, n, fuera, top3, txt: `moda ${bins.map(bin).join(' y ') || 'ninguna'} con ${n} px · los 3 bins más altos ${top3.map((t) => `${bin(t.bin)} ${t.n}`).join(', ')}` };
}

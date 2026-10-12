// AD-36 (ART-DIRECTION §13.1, D54) y AC-141: el favicon y los iconos de la app son los de Sea Battle en todas las
// páginas, coinciden con las referencias de ux (e2e/fixtures/d54/, copia de qa-artifacts/render/d54-icono/ref-*.png) y
// en public/ no queda ningún asset de la plantilla de create-next-app. Sin WebGL: /game solo se abre para leer el <head>.
// La pestaña no sale en las capturas de Playwright: el icono se captura suelto a 16 y 32 px y QA mira la pestaña real
import { expect, Page, test } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PORTS } from '../playwright.config';

const GAME = `http://localhost:${PORTS.game}`; // con invitado: /game carga sin Clerk
const AUTH = `http://localhost:${PORTS.auth}`; // sin invitado: /sign-in y /sign-up con Clerk de desarrollo
const REF = path.join(__dirname, 'fixtures', 'd54');
const OUT = path.join(__dirname, '..', 'qa-artifacts', 'render', 'ac141');
const TEMPLATE_FAVICON_MD5 = 'c30c7d42707a47a3f4591831641e50dc'; // favicon.ico de create-next-app (25 931 bytes)
const TEMPLATE_SVGS = ['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg'];
const PALETTE = { fondo: '#0F3F5C', ola: '#1A5F86', vela: '#F5F1E6', oro: '#F2C14E' };

interface HeadLink {
  rel: string;
  href: string;
  type: string | null;
  sizes: string | null;
}

interface Analysis {
  w: number;
  h: number;
  minAlpha: number;
  meanDE: number;
  over10: number; // fracción de píxeles con ΔE76 > 10 frente a la referencia
  opaqueMaxDE: number; // máx. ΔE76 en los píxeles opacos de la referencia
  alphaMaxDiff: number;
  offPalette: number; // píxeles opacos a ΔE76 > 1 de los 4 colores
  motif: number; // píxeles opacos más cerca de la vela o del oro que del fondo y la ola
  motifRadius: number; // distancia máxima al centro de un píxel a ΔE76 > 10 del fondo y de la ola
  samples: Record<string, number>; // ΔE76 de cada punto frente a su color
}

const md5 = (buf: Buffer) => crypto.createHash('md5').update(buf).digest('hex');
const b64 = (buf: Buffer) => buf.toString('base64');

const headLinks = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')).map((l) => ({
      rel: l.rel,
      href: l.href,
      type: l.getAttribute('type'),
      sizes: l.getAttribute('sizes')
    }))
  );

// Entradas de un ICO con imágenes PNG: [lado, PNG]
function icoEntries(buf: Buffer): { size: number; png: Buffer }[] {
  expect(buf.readUInt16LE(2), 'ICO: tipo 1').toBe(1);
  return Array.from({ length: buf.readUInt16LE(4) }, (_, k) => {
    const e = 6 + 16 * k;
    const png = buf.subarray(buf.readUInt32LE(e + 12), buf.readUInt32LE(e + 12) + buf.readUInt32LE(e + 8));
    expect(png.subarray(1, 4).toString('ascii'), `ICO: la entrada ${k} es PNG`).toBe('PNG');
    return { size: buf.readUInt8(e) || 256, png };
  });
}

// Decodifica en el navegador y compara con la referencia (compuestas sobre blanco), con ΔE76 en CIELAB
async function analyze(page: Page, png: Buffer, ref: Buffer | null, points: Record<string, [number, number, string]> = {}): Promise<Analysis> {
  return page.evaluate(
    async ([cand, refB64, pts, palette]) => {
      const decode = async (data: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height).getContext('2d', { willReadFrequently: true })!;
        c.drawImage(img, 0, 0);
        return c.getImageData(0, 0, img.width, img.height);
      };
      const lab = (r: number, g: number, b: number) => {
        const lin = [r, g, b].map((v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        const f = [
          (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047,
          0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2],
          (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883
        ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
        return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
      };
      const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
      const de = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const over = (d: Uint8ClampedArray, i: number) => [0, 1, 2].map((k) => (d[i + k] * d[i + 3] + 255 * (255 - d[i + 3])) / 255) as [number, number, number];
      const pal = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, lab(...hex(v))]));
      const a = await decode(cand);
      const r = refB64 ? await decode(refB64) : null;
      const n = a.width * a.height;
      let minAlpha = 255, sumDE = 0, over10 = 0, opaqueMaxDE = 0, alphaMaxDiff = 0, offPalette = 0, motif = 0, motifRadius = 0;
      for (let p = 0; p < n; p++) {
        const i = 4 * p;
        minAlpha = Math.min(minAlpha, a.data[i + 3]);
        const la = lab(...over(a.data, i));
        if (r) {
          const d = de(la, lab(...over(r.data, i)));
          sumDE += d;
          if (d > 10) over10++;
          if (r.data[i + 3] === 255) opaqueMaxDE = Math.max(opaqueMaxDE, de(lab(a.data[i], a.data[i + 1], a.data[i + 2]), lab(r.data[i], r.data[i + 1], r.data[i + 2])));
          alphaMaxDiff = Math.max(alphaMaxDiff, Math.abs(a.data[i + 3] - r.data[i + 3]));
        }
        if (a.data[i + 3] === 255) {
          const own = lab(a.data[i], a.data[i + 1], a.data[i + 2]);
          const dist = Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, de(own, v)]));
          if (Math.min(...Object.values(dist)) > 1) offPalette++;
          if (Math.min(dist.vela, dist.oro) < Math.min(dist.fondo, dist.ola)) motif++;
          if (dist.fondo > 10 && dist.ola > 10) {
            const x = (p % a.width) + 0.5 - a.width / 2;
            const y = Math.floor(p / a.width) + 0.5 - a.height / 2;
            motifRadius = Math.max(motifRadius, Math.hypot(x, y));
          }
        }
      }
      const samples = Object.fromEntries(
        Object.entries(pts).map(([k, [x, y, h]]) => {
          const i = 4 * (y * a.width + x);
          return [k, de(lab(a.data[i], a.data[i + 1], a.data[i + 2]), lab(...hex(h)))];
        })
      );
      return { w: a.width, h: a.height, minAlpha, meanDE: r ? sumDE / n : 0, over10: r ? over10 / n : 0, opaqueMaxDE, alphaMaxDiff, offPalette, motif, motifRadius, samples };
    },
    [b64(png), ref ? b64(ref) : null, points, PALETTE] as const
  );
}

const ref = (name: string) => fs.readFileSync(path.join(REF, name));
const fmt = (a: Analysis) =>
  `${a.w}×${a.h} · alfa mín. ${a.minAlpha} · ΔE76 medio ${a.meanDE.toFixed(2)} · > 10: ${(a.over10 * 100).toFixed(2)} % · opacos máx. ${a.opaqueMaxDE.toFixed(2)} · alfa ±${a.alphaMaxDiff}`;

test.describe('AD-36 · AC-141: icono de Sea Battle', () => {
  test('(a) las 4 páginas enlazan el ICO, los PNG de 16/32/192/512, el apple-icon y el manifest; nada en SVG; todo se sirve con su tamaño', async ({ page }) => {
    test.setTimeout(120_000);
    const perPage: Record<string, HeadLink[]> = {};
    for (const url of [`${GAME}/`, `${AUTH}/sign-in`, `${AUTH}/sign-up`, `${GAME}/game`]) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const links = await headLinks(page);
      perPage[new URL(url).pathname] = links;
      console.log(`AD-36 ${new URL(url).pathname}: ${links.map((l) => `${l.rel} ${new URL(l.href).pathname}${l.sizes ? ` ${l.sizes}` : ''}`).join(' · ')}`);
    }
    await page.goto('about:blank'); // fuera de /game: sin WebGL de fondo
    const canon = JSON.stringify(perPage['/'].map((l) => [l.rel, new URL(l.href).pathname, l.sizes]));
    for (const [p, links] of Object.entries(perPage)) {
      expect(JSON.stringify(links.map((l) => [l.rel, new URL(l.href).pathname, l.sizes])), `${p}: los mismos enlaces que la landing`).toBe(canon);
      expect(links.filter((l) => /\.svg($|\?)/.test(l.href) || l.type === 'image/svg+xml'), `${p}: ningún SVG`).toEqual([]);
    }
    const links = perPage['/'];
    const pngIcons = links.filter((l) => l.rel === 'icon' && /\.png($|\?)/.test(l.href));
    expect(pngIcons.map((l) => l.sizes).sort()).toEqual(['16x16', '192x192', '32x32', '512x512']);
    expect(links.some((l) => l.rel === 'icon' && /\/favicon\.ico($|\?)/.test(l.href))).toBe(true);
    const apple = links.filter((l) => l.rel === 'apple-touch-icon');
    expect(apple.map((l) => l.sizes)).toEqual(['180x180']);

    for (const l of [...pngIcons, ...apple]) {
      const res = await page.request.get(l.href);
      expect(res.status(), new URL(l.href).pathname).toBe(200);
      const a = await analyze(page, await res.body(), null);
      expect(`${a.w}x${a.h}`, `${new URL(l.href).pathname} mide lo que declara`).toBe(l.sizes);
    }
    const ico = await page.request.get(`${GAME}/favicon.ico`);
    expect(ico.status()).toBe(200);
    const entries = icoEntries(await ico.body());
    expect(entries.map((e) => e.size)).toEqual([16, 32]);
    for (const e of entries) {
      const a = await analyze(page, e.png, null);
      expect(`${a.w}x${a.h}`, `entrada de ${e.size} del ICO`).toBe(`${e.size}x${e.size}`);
    }

    // (f) Manifest: nombre, color del tema igual al del viewport y los 3 iconos
    const manifestLink = links.find((l) => l.rel === 'manifest')!;
    const manifest = await (await page.request.get(manifestLink.href)).json();
    console.log(`AD-36 manifest: ${JSON.stringify(manifest)}`);
    expect(manifest.name).toBe('Sea Battle');
    expect(manifest.short_name).toBe('Sea Battle');
    await page.goto(`${GAME}/`, { waitUntil: 'domcontentloaded' });
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(manifest.theme_color.toLowerCase()).toBe(themeColor!.toLowerCase());
    expect(themeColor!.toLowerCase()).toBe('#0f3f5c');
    expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const i of manifest.icons as { src: string; sizes: string }[]) {
      const res = await page.request.get(new URL(i.src, GAME).href);
      expect(res.status(), i.src).toBe(200);
      const a = await analyze(page, await res.body(), null);
      expect(`${a.w}x${a.h}`, `${i.src} mide lo que declara`).toBe(i.sizes);
    }
  });

  test('(b–e) el 16 es el mapa a mano, 32/192/512 coinciden con la referencia, el apple-icon es opaco y el maskable cabe en la zona segura', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`${GAME}/`, { waitUntil: 'domcontentloaded' });
    const links = await headLinks(page);
    // Los PNG del App Router (el favicon.ico también declara 16x16: Next lee solo su primera entrada)
    const icon = (size: string) => page.request.get(links.find((l) => l.rel === 'icon' && l.sizes === size && /\.png($|\?)/.test(l.href))!.href).then((r) => r.body());

    // (b) 16: PNG y entrada del ICO, píxel a píxel con el mapa
    const ico16 = icoEntries(await (await page.request.get(`${GAME}/favicon.ico`)).body()).find((e) => e.size === 16)!.png;
    for (const [name, png] of [['icon 16', await icon('16x16')], ['ICO 16', ico16]] as const) {
      const a = await analyze(page, png, ref('ref-16.png'));
      console.log(`AD-36 ${name}: ${fmt(a)} · fuera de la paleta ${a.offPalette} · motivo ${a.motif} de 256 px`);
      expect(a.opaqueMaxDE, `${name}: opacos a ΔE76 ≤ 1`).toBeLessThanOrEqual(1);
      expect(a.alphaMaxDiff, `${name}: alfa de las esquinas a ±8`).toBeLessThanOrEqual(8);
      expect(a.offPalette, `${name}: solo los 4 colores`).toBe(0);
      expect(a.motif, `${name}: motivo de 89 px`).toBe(89);
    }
    const contrast = (x: string, y: string) => {
      const lum = (h: string) => {
        const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    expect(contrast(PALETTE.oro, PALETTE.fondo)).toBeGreaterThanOrEqual(6.6);

    // (c) 32, 192 y 512 frente a la referencia; en el 512, 5 puntos de color
    for (const [size, refName] of [['32x32', 'ref-32.png'], ['192x192', 'ref-192.png'], ['512x512', 'ref-512.png']] as const) {
      const points: Record<string, [number, number, string]> =
        size === '512x512'
          ? { fondo: [448, 96, PALETTE.fondo], ola: [256, 496, PALETTE.ola], vela: [200, 140, PALETTE.vela], casco: [256, 360, PALETTE.oro], gallardete: [232, 58, PALETTE.oro] }
          : {};
      const a = await analyze(page, await icon(size), ref(refName), points);
      console.log(`AD-36 icon ${size}: ${fmt(a)}${size === '512x512' ? ` · puntos ${JSON.stringify(Object.fromEntries(Object.entries(a.samples).map(([k, v]) => [k, +v.toFixed(2)])))}` : ''}`);
      expect(a.meanDE, `${size}: ΔE76 medio ≤ 2`).toBeLessThanOrEqual(2);
      expect(a.over10, `${size}: ≤ 1 % de píxeles con ΔE76 > 10`).toBeLessThanOrEqual(0.01);
      for (const [k, v] of Object.entries(a.samples)) expect(v, `512: ${k}`).toBeLessThanOrEqual(2);
    }

    // (d) apple-icon: opaco, con el fondo en la esquina
    const appleHref = links.find((l) => l.rel === 'apple-touch-icon')!.href;
    const apple = await analyze(page, await (await page.request.get(appleHref)).body(), ref('ref-apple-180.png'), { esquina: [0, 0, PALETTE.fondo] });
    console.log(`AD-36 apple-icon: ${fmt(apple)} · esquina ΔE76 ${apple.samples.esquina.toFixed(2)}`);
    expect(apple.minAlpha).toBe(255);
    expect(apple.samples.esquina).toBeLessThanOrEqual(2);

    // (e) Maskable: opaco y con todo el motivo a ≤ 204,8 px del centro (zona segura de radio 0,4)
    const maskable = await analyze(page, await (await page.request.get(`${GAME}/icons/icon-maskable-512.png`)).body(), ref('ref-maskable-512.png'));
    console.log(`AD-36 maskable: ${fmt(maskable)} · radio máximo del motivo ${maskable.motifRadius.toFixed(1)} px`);
    expect(maskable.minAlpha).toBe(255);
    expect(maskable.motifRadius).toBeLessThanOrEqual(204.8);
  });

  test('AC-141: el favicon no es el de la plantilla y los 5 SVG de la plantilla dan 404', async ({ page }) => {
    const ico = await (await page.request.get(`${GAME}/favicon.ico`)).body();
    console.log(`AC-141 /favicon.ico: ${ico.length} B · md5 ${md5(ico)}`);
    expect(md5(ico)).not.toBe(TEMPLATE_FAVICON_MD5);
    for (const file of TEMPLATE_SVGS) {
      const res = await page.request.get(`${GAME}/${file}`);
      console.log(`AC-141 /${file}: HTTP ${res.status()}`);
      expect(res.status(), `/${file}`).toBe(404);
    }
  });

  test('AC-141: captura del icono suelto a 16 y 32 px, sobre pestaña clara y oscura', async ({ page }) => {
    await page.goto(`${GAME}/`, { waitUntil: 'domcontentloaded' });
    const links = await headLinks(page);
    fs.mkdirSync(OUT, { recursive: true });
    for (const size of [16, 32]) {
      const href = links.find((l) => l.rel === 'icon' && l.sizes === `${size}x${size}` && /\.png($|\?)/.test(l.href))!.href;
      await page.setContent(
        `<body style="margin:0;display:flex;align-items:flex-start">${['#ffffff', '#202124'].map((bg) => `<div style="background:${bg};padding:8px"><img src="${href}" width="${size}" height="${size}" style="display:block"></div>`).join('')}</body>`
      );
      await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
      await page.locator('body > div').first().screenshot({ path: path.join(OUT, `icon-${size}-claro.png`) });
      await page.locator('body > div').nth(1).screenshot({ path: path.join(OUT, `icon-${size}-oscuro.png`) });
    }
    console.log(`AC-141: capturas a 16 y 32 px en ${OUT}`);
  });
});

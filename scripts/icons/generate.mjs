// AC-141 (ART-DIRECTION §13.1, D54): genera el favicon y los iconos de la app a partir de los SVG de scripts/icons/ y del
// mapa de 16 px. Rasteriza en el Chromium de Playwright, como qa:hero; el PNG del mapa y el ICO se escriben aquí, sin
// dependencias. Los resultados se versionan: `npm run icons` solo hace falta si cambia el diseño.
//   src/app/favicon.ico            entradas PNG de 16 (mapa) y 32 (SVG)
//   src/app/icon1–4.png            16 (mapa) · 32 · 192 · 512
//   src/app/apple-icon.png         180, a sangre y opaco
//   public/icons/icon-192.png, icon-512.png, icon-maskable-512.png (manifest)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const APP = path.join(ROOT, 'src', 'app');
const PUBLIC_ICONS = path.join(ROOT, 'public', 'icons');

// A 16 px el SVG se emborrona (el mástil y el foque se funden): mapa a mano de §13.1
const MAP16 = [
  '................',
  '........G.......',
  '......GGG.......',
  '......CCGCC.....',
  '......CCGCC.....',
  '......CCGCCC....',
  '........G..CC...',
  '.....CCCGCCCCC..',
  '.....CCCGCCCCCC.',
  '.....CCCGCCCCCC.',
  '..GG....G......G',
  '..GGGGGGGGGGGGG.',
  '...GGGGGGGGGGG..',
  '....GGGGGGGGG...',
  'wwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwww'
];
const COLORS = { '.': [15, 63, 92], w: [26, 95, 134], C: [245, 241, 230], G: [242, 193, 78] };

// Esquinas: alfa del rectángulo redondeado del SVG (rx = 7/32 del lado = 3,5 px), con supermuestreo 8×8
function roundedAlpha(n, r, ss = 8) {
  const alpha = new Float64Array(n * n);
  for (let y = 0; y < n * ss; y++) {
    for (let x = 0; x < n * ss; x++) {
      const px = (x + 0.5) / ss;
      const py = (y + 0.5) / ss;
      const cx = Math.min(Math.max(px, r), n - r);
      const cy = Math.min(Math.max(py, r), n - r);
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) alpha[Math.floor(y / ss) * n + Math.floor(x / ss)] += 1 / (ss * ss);
    }
  }
  return alpha;
}

// PNG RGBA de 8 bits, sin filtro
function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function map16Png() {
  const alpha = roundedAlpha(16, 3.5);
  const rgba = new Uint8Array(16 * 16 * 4);
  MAP16.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const i = (y * 16 + x) * 4;
      rgba.set(COLORS[c], i);
      rgba[i + 3] = Math.round(255 * alpha[y * 16 + x]);
    })
  );
  return encodePng(16, 16, rgba);
}

// ICO con entradas PNG (Vista+ y todos los navegadores actuales)
function encodeIco(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, k) => {
    const e = 6 + 16 * k;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); // planos
    header.writeUInt16LE(32, e + 6); // bits por píxel
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map((e) => e.png)]);
}

async function rasterize(page, svgFile, size) {
  const svg = fs.readFileSync(path.join(HERE, svgFile)).toString('base64');
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img id="i" width="${size}" height="${size}" src="data:image/svg+xml;base64,${svg}">`);
  await page.waitForFunction(() => document.getElementById('i').complete);
  return page.locator('#i').screenshot({ omitBackground: true });
}

const write = (file, buf) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`${path.relative(ROOT, file)}: ${buf.length} B`);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const png16 = map16Png();
  const png32 = await rasterize(page, 'icon.svg', 32);
  write(path.join(APP, 'favicon.ico'), encodeIco([{ size: 16, png: png16 }, { size: 32, png: png32 }]));
  write(path.join(APP, 'icon1.png'), png16);
  write(path.join(APP, 'icon2.png'), png32);
  write(path.join(APP, 'icon3.png'), await rasterize(page, 'icon.svg', 192));
  write(path.join(APP, 'icon4.png'), await rasterize(page, 'icon.svg', 512));
  write(path.join(APP, 'apple-icon.png'), await rasterize(page, 'icon-apple.svg', 180));
  write(path.join(PUBLIC_ICONS, 'icon-192.png'), await rasterize(page, 'icon.svg', 192));
  write(path.join(PUBLIC_ICONS, 'icon-512.png'), await rasterize(page, 'icon.svg', 512));
  write(path.join(PUBLIC_ICONS, 'icon-maskable-512.png'), await rasterize(page, 'icon-maskable.svg', 512));
} finally {
  await browser.close();
}

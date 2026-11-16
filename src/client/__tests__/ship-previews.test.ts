// Las 15 vistas previas de la tienda de la 1.3 (AC-217 y AC-225; ART-DIRECTION §14): una por clase y aspecto, ≤ 40 000 B,
// 760 × 480, con el hash de su contenido en el nombre y servidas con caché de un año; y public/previews sin nada más
import fs from 'fs';
import path from 'path';
import nextConfig from '../../../next.config';
import { contentHash, HASHED_WEBP } from '../../../scripts/glb/content-hash';
import { webpSize } from '../../../scripts/previews/webp';
import { FamilyChoice, NO_FAMILY, PLAYER_SHIP_ORDER, SHIP_FAMILIES } from '../../game/constants';
import { previewAlt, SHIP_PREVIEWS, SHIP_PREVIEW_SIZE } from '../ship-previews';

const ROOT = path.join(__dirname, '..', '..', '..');
const DIR = path.join(ROOT, 'public', 'previews');
const urls = PLAYER_SHIP_ORDER.flatMap((c) => ([NO_FAMILY, ...SHIP_FAMILIES] as FamilyChoice[]).map((f) => SHIP_PREVIEWS[c][f]));

describe('las vistas previas de la tienda (AC-217, AC-225)', () => {
  test('15, una por clase y aspecto, todas distintas', () => {
    expect(urls).toHaveLength(15);
    expect(new Set(urls).size).toBe(15);
  });

  test.each(urls)('%s: existe, lleva el hash de su contenido, pesa ≤ 40 000 B y mide 760 × 480', (url) => {
    expect(url).toMatch(/^\/previews\/[^/]+$/);
    const name = path.basename(url);
    expect(HASHED_WEBP.test(name)).toBe(true);
    const bytes = fs.readFileSync(path.join(ROOT, 'public', url));
    expect(name.split('.')[1]).toBe(contentHash(bytes));
    expect(bytes.length).toBeLessThanOrEqual(40_000);
    expect(webpSize(bytes)).toEqual(SHIP_PREVIEW_SIZE);
  });

  test('public/previews solo tiene esas 15', () => {
    expect(fs.readdirSync(DIR).sort()).toEqual(urls.map((u) => path.basename(u)).sort());
  });

  test('se sirven con caché de un año: la regla de next.config.ts casa con cada una', async () => {
    const rules = await nextConfig.headers!();
    const rule = rules.find((r) => r.source.startsWith('/previews/'))!;
    expect(rule.headers).toEqual([{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
    const pattern = new RegExp(`^${rule.source.replace(':file(', '(')}$`);
    for (const url of urls) expect(pattern.test(url)).toBe(true);
    expect(pattern.test('/previews/ship_sloop_side.webp')).toBe(false); // sin hash, no
  });

  test('el texto alternativo nombra el barco y su aspecto (D94)', () => {
    expect(previewAlt('line', 'gb')).toBe('Navío de línea de la familia británica');
    expect(previewAlt('frigate', 'es')).toBe('Fragata de la familia española');
    expect(previewAlt('sloop', 'none')).toBe('Balandra sin familia');
  });
});

describe('webpSize lee la cabecera de los 3 tipos de WebP', () => {
  const riff = (chunk: string, body: number[]) => Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), ...Buffer.from(chunk), 0, 0, 0, 0, ...body]);
  test('VP8 (con pérdida), VP8L (sin pérdida) y VP8X (extendido)', () => {
    const vp8 = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 760 & 0xff, 760 >> 8, 480 & 0xff, 480 >> 8]);
    const w = 759, h = 479, bits = w | (h << 14);
    const vp8l = riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff, 0, 0, 0, 0, 0]);
    const vp8x = riff('VP8X', [0, 0, 0, 0, w & 0xff, w >> 8, 0, h & 0xff, h >> 8, 0]);
    expect([webpSize(vp8), webpSize(vp8l), webpSize(vp8x)]).toEqual([SHIP_PREVIEW_SIZE, SHIP_PREVIEW_SIZE, SHIP_PREVIEW_SIZE]);
    expect(webpSize(Uint8Array.from(Buffer.from('not a webp at all, nothing to read here')))).toBeNull();
  });
});

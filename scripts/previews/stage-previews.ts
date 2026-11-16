// Las 15 vistas previas de la tienda de la 1.3 (D103 y D101; ART-DIRECTION §14; ASSET-SPEC §13, «Retratos»), de la salida de
// scripts/ux/barcos/retrato13.py (`$UX_OUT/retratos13`): comprueba cada WebP contra su retratos13-<clase>.json (sha256, peso
// ≤ 40 000 B, 760 × 480 y el hash de su contenido en el nombre), borra las de esos barcos en public/previews, las copia allí
// e imprime el manifiesto de src/client/ship-previews.ts. Se sirven con caché de un año (next.config.ts), como los GLB
//   npx tsx scripts/previews/stage-previews.ts <carpeta retratos13>
import fs from 'fs';
import path from 'path';
import { contentHash, HASHED_WEBP } from '../glb/content-hash';
import { webpSize } from './webp';

export const PREVIEW_MAX_BYTES = 40_000;
export const PREVIEW_SIZE = { width: 760, height: 480 };
const CLASSES = ['sloop', 'brig', 'schooner', 'frigate', 'line'] as const;

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('uso: npx tsx scripts/previews/stage-previews.ts <carpeta retratos13 de retrato13.py>');
  process.exit(2);
}
const dir = path.join(__dirname, '..', '..', 'public', 'previews');
fs.mkdirSync(dir, { recursive: true });
const manifest: Record<string, Record<string, string>> = {};
const problems: string[] = [];
const files: [string, Buffer][] = [];
for (const cls of CLASSES) {
  const meta = JSON.parse(fs.readFileSync(path.join(src, `retratos13-${cls}.json`), 'utf8')) as { retratos: Record<string, { familia: string; webp: string; B: number; sha256: string }> };
  manifest[cls] = {};
  for (const [sid, r] of Object.entries(meta.retratos)) {
    const bytes = fs.readFileSync(path.join(src, r.webp));
    const size = webpSize(bytes);
    const hash = contentHash(bytes);
    if (!HASHED_WEBP.test(r.webp) || r.webp !== `${sid}_side.${hash}.webp`) problems.push(`${r.webp}: el nombre no lleva el hash de su contenido (${hash})`);
    if (bytes.length !== r.B || bytes.length > PREVIEW_MAX_BYTES) problems.push(`${r.webp}: ${bytes.length} B (el json dice ${r.B}; tope ${PREVIEW_MAX_BYTES})`);
    if (size?.width !== PREVIEW_SIZE.width || size?.height !== PREVIEW_SIZE.height) problems.push(`${r.webp}: ${JSON.stringify(size)} en lugar de 760 × 480`);
    files.push([r.webp, bytes]);
    manifest[cls][r.familia] = `/previews/${r.webp}`;
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
for (const f of fs.readdirSync(dir)) if (/_side\.[0-9a-f]{8}\.webp$/.test(f)) fs.rmSync(path.join(dir, f));
for (const [name, bytes] of files) {
  fs.writeFileSync(path.join(dir, name), bytes);
  console.log(`public/previews/${name}: ${bytes.length} B`);
}
console.log('SHIP_PREVIEWS:');
for (const cls of CLASSES) console.log(`  ${cls}: { none: '${manifest[cls].none}', gb: '${manifest[cls].gb}', es: '${manifest[cls].es}' },`);

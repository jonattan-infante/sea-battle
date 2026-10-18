// Falla pronto y con un mensaje claro si no hay build de producción (ni los fixtures de GLB que copia build:e2e)
import fs from 'fs';
import path from 'path';
import { contentHash, E2E_PREFIX } from '../scripts/glb/content-hash';

export default function globalSetup() {
  const root = path.join(__dirname, '..');
  const glb = `public/models/${E2E_PREFIX}ship_sloop.${contentHash(fs.readFileSync(path.join(root, 'e2e', 'fixtures', 'ship_sloop_etc1s_meshopt.glb')))}.glb`;
  const missing = ['dist/server/index.js', '.next-e2e/BUILD_ID', glb].filter((f) => !fs.existsSync(path.join(root, f)));
  if (missing.length) throw new Error(`Falta el build de producción (${missing.join(', ')}). Ejecuta "npm run build:e2e" antes de los e2e.`);
}

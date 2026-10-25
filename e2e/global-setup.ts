// Falla pronto y con un mensaje claro si no hay build de producción (ni los fixtures de GLB que copia build:e2e)
import fs from 'fs';
import path from 'path';
import { contentHash, E2E_PREFIX } from '../scripts/glb/content-hash';
import { externalKtx2Fixture } from '../scripts/glb/e2e-models';

export default function globalSetup() {
  const root = path.join(__dirname, '..');
  const fixture = fs.readFileSync(path.join(root, 'e2e', 'fixtures', 'ship_sloop_etc1s_meshopt.glb'));
  const glb = `public/models/${E2E_PREFIX}ship_sloop.${contentHash(fixture)}.glb`;
  const ext = externalKtx2Fixture(new Uint8Array(fixture));
  const missing = ['dist/server/index.js', '.next-e2e/BUILD_ID', glb, `public/models/${ext.glbFile}`, `public/models/${ext.ktx2File}`].filter((f) => !fs.existsSync(path.join(root, f)));
  if (missing.length) throw new Error(`Falta el build de producción (${missing.join(', ')}). Ejecuta "npm run build:e2e" antes de los e2e.`);
}

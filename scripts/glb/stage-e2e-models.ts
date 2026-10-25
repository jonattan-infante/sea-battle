// build:e2e, antes de next build: copia el fixture del GLB a public/models/e2e_<nombre>.<hash>.glb, para que lo sirva el
// servidor del juego con su caché, como en prod (e2e/glb-cache.spec.ts), y el par del paso 4c de §13, el GLB y su .ktx2
// aparte (e2e-models.ts). Van fuera de git (.gitignore), así que Railway, que construye desde git, no los lleva. Antes
// borra los e2e_ de un build anterior
//   npx tsx scripts/glb/stage-e2e-models.ts
import fs from 'fs';
import path from 'path';
import { contentHash, E2E_PREFIX } from './content-hash';
import { externalKtx2Fixture } from './e2e-models';

const E2E_MODELS = ['ship_sloop', 'port']; // el puerto es el mismo fixture: su cargador llega con D82

const root = path.join(__dirname, '..', '..');
const dir = path.join(root, 'public', 'models');
const fixture = fs.readFileSync(path.join(root, 'e2e', 'fixtures', 'ship_sloop_etc1s_meshopt.glb'));
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (f.startsWith(E2E_PREFIX)) fs.rmSync(path.join(dir, f));
const ext = externalKtx2Fixture(new Uint8Array(fixture));
const files: [string, Uint8Array][] = [
  ...E2E_MODELS.map((name): [string, Uint8Array] => [`${E2E_PREFIX}${name}.${contentHash(fixture)}.glb`, fixture]),
  [ext.glbFile, ext.glb],
  [ext.ktx2File, ext.ktx2]
];
for (const [file, bytes] of files) {
  fs.writeFileSync(path.join(dir, file), bytes);
  console.log(`public/models/${file}: ${bytes.length} bytes`);
}

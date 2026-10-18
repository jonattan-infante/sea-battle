// build:e2e, antes de next build: copia el fixture del GLB a public/models/e2e_<nombre>.<hash>.glb, para que lo sirva el
// servidor del juego con su caché, como en prod (e2e/glb-cache.spec.ts). Van fuera de git (.gitignore), así que Railway,
// que construye desde git, no los lleva. Antes borra los e2e_ de un build anterior
//   npx tsx scripts/glb/stage-e2e-models.ts
import fs from 'fs';
import path from 'path';
import { contentHash, E2E_PREFIX } from './content-hash';

const E2E_MODELS = ['ship_sloop', 'port']; // el puerto es el mismo fixture: su cargador llega con D82

const root = path.join(__dirname, '..', '..');
const dir = path.join(root, 'public', 'models');
const fixture = fs.readFileSync(path.join(root, 'e2e', 'fixtures', 'ship_sloop_etc1s_meshopt.glb'));
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (f.startsWith(E2E_PREFIX)) fs.rmSync(path.join(dir, f));
for (const name of E2E_MODELS) {
  const file = `${E2E_PREFIX}${name}.${contentHash(fixture)}.glb`;
  fs.writeFileSync(path.join(dir, file), fixture);
  console.log(`public/models/${file}: ${fixture.length} bytes`);
}

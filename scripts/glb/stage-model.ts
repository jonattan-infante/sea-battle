// Paso 4c de ASSET-SPEC §13 con un GLB que entrega ux, con la KTX2 y el respaldo dentro: comprueba antes de usarlo que su
// sha256 es la que da ASSET-SPEC para ese barco, saca la KTX2 a su .ktx2 (externalizeKtx2) y escribe en public/models los 2
// archivos con el hash de su contenido en el nombre, después de borrar los de ese sb_id. AS-V10 tiene que pasar con la tabla
// de 4b (respaldo-tamanos.json). Imprime la URL para SHIP_GLB. Solo con GLB aprobados (CLAUDE.md, «Flujo de láminas»)
//   npx tsx scripts/glb/stage-model.ts <ruta del .glb> <sha256 de ASSET-SPEC, 64 hex>
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { contentHash } from './content-hash';
import { externalizeKtx2, fallbackProblems, readGlb } from './glb-fallback';

const [src, want] = process.argv.slice(2);
if (!src || !/^[0-9a-f]{64}$/.test(want ?? '')) {
  console.error('uso: npx tsx scripts/glb/stage-model.ts <ruta del .glb> <sha256 de 64 hex>');
  process.exit(2);
}
const bytes = new Uint8Array(fs.readFileSync(src));
const sha = createHash('sha256').update(bytes).digest('hex');
console.log(`${src}: ${bytes.length} B, sha256 ${sha}`);
if (sha !== want) {
  console.error(`sha256 distinta de la de ASSET-SPEC (${want}): no se usa`);
  process.exit(1);
}
const { json } = readGlb(bytes);
const roots = (json.scenes as { nodes: number[] }[])[(json.scene as number | undefined) ?? 0].nodes;
const sbId = (json.nodes as { extras?: { sb_id?: string } }[])[roots[0]].extras?.sb_id;
if (roots.length !== 1 || !sbId || !/^[a-z0-9_]+$/.test(sbId)) {
  console.error(`la raíz no lleva un sb_id válido (${String(sbId)})`);
  process.exit(1);
}
const { glb, ktx2, name } = externalizeKtx2(bytes, sbId);
const problems = fallbackProblems(glb, { external: (uri) => (uri === name ? ktx2 : null) });
if (problems.length) {
  console.error(`AS-V10:\n${problems.join('\n')}`);
  process.exit(1);
}
const dir = path.join(__dirname, '..', '..', 'public', 'models');
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (f.startsWith(`${sbId}.`) || f.startsWith(`${sbId}_atlas.`)) fs.rmSync(path.join(dir, f));
const glbFile = `${sbId}.${contentHash(glb)}.glb`;
for (const [file, out] of [[glbFile, glb], [name, ktx2]] as const) {
  fs.writeFileSync(path.join(dir, file), out);
  console.log(`public/models/${file}: ${out.length} B`);
}
console.log(`SHIP_GLB: '/models/${glbFile}'`);

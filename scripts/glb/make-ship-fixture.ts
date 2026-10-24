// Fixture de los tests del loader de GLB (ASSET-SPEC §13): la Balandra procedural escrita como GLB con una textura magenta
// de 16 × 16 y comprimida como pide §1, con la geometría en EXT_meshopt_compression y la textura en KTX2 ETC1S
// (KHR_texture_basisu). Todas las UV leen el centro de la textura, así que el barco se ve magenta: ningún procedural lo es.
// Necesita gltf-transform (npm) y toktx (KTX-Software) en el PATH; la CI no los tiene, por eso el .glb va en el repo.
//   npx tsx scripts/glb/make-ship-fixture.ts   →   e2e/fixtures/ship_sloop_etc1s_meshopt.glb
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as THREE from 'three';
import { buildShipAsset } from '../../src/client/models/ship-geometry';
import { writeGlb } from '../../src/client/models/__tests__/glb-writer';
import { solidPng } from './glb-fallback';

export const FIXTURE = path.join(__dirname, '..', '..', 'e2e', 'fixtures', 'ship_sloop_etc1s_meshopt.glb');
export const FIXTURE_RGB = [255, 0, 255] as const;
const SIZE = 16;

function main(): void {
  const root = buildShipAsset('sloop');
  for (const child of root.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) continue;
    const g = mesh.geometry.clone();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2).fill(0.5), 2));
    mesh.geometry = g;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-fixture-'));
  try {
    const raw = path.join(tmp, 'raw.glb');
    const etc1s = path.join(tmp, 'etc1s.glb');
    fs.writeFileSync(raw, writeGlb(root, { image: { mimeType: 'image/png', bytes: solidPng(FIXTURE_RGB, SIZE) } }));
    execFileSync('gltf-transform', ['etc1s', raw, etc1s], { stdio: 'inherit' });
    execFileSync('gltf-transform', ['meshopt', etc1s, FIXTURE], { stdio: 'inherit' });
    console.log(`${FIXTURE}: ${fs.statSync(FIXTURE).size} bytes`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) main();

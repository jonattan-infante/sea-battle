// Fixture de los tests del loader de GLB (ASSET-SPEC §13): la Balandra procedural escrita como GLB con una textura magenta
// de 16 × 16 y comprimida como pide §1, con la geometría en EXT_meshopt_compression y la textura en KTX2 ETC1S
// (KHR_texture_basisu). Todas las UV leen el centro de la textura, así que el barco se ve magenta: ningún procedural lo es.
// Necesita gltf-transform (npm) y toktx (KTX-Software) en el PATH; la CI no los tiene, por eso el .glb va en el repo.
//   npx tsx scripts/glb/make-ship-fixture.ts   →   e2e/fixtures/ship_sloop_etc1s_meshopt.glb
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import * as THREE from 'three';
import { buildShipAsset } from '../../src/client/models/ship-geometry';
import { writeGlb } from '../../src/client/models/__tests__/glb-writer';

export const FIXTURE = path.join(__dirname, '..', '..', 'e2e', 'fixtures', 'ship_sloop_etc1s_meshopt.glb');
export const FIXTURE_RGB = [255, 0, 255] as const;
const SIZE = 16;

// PNG RGBA de un solo color, sin dependencias
function solidPng(rgb: readonly number[], size: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [...rgb, 255]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

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

// Escritor mínimo de .glb para los tests del loader (ASSET-SPEC §1–§4): convierte la jerarquía de buildShipAsset (raíz con
// extras, mallas <id>_lod0/1 y sockets vacíos) en un glTF 2.0 binario sin comprimir. Sin dependencias, para generar en
// Jest y en Playwright el mismo GLB que exportaría Blender con el contrato, y para fabricar GLB que lo incumplen
import * as THREE from 'three';

type Json = Record<string, unknown>;
export interface GlbImage {
  mimeType: 'image/png' | 'image/ktx2';
  bytes: Uint8Array;
}
export interface GlbOptions {
  image?: GlbImage; // textura de color base (KTX2 con KHR_texture_basisu, como pide §1)
  edit?: (gltf: Json) => void; // retoca el JSON antes de escribirlo (casos que incumplen el contrato)
}

const FLOAT = 5126;
const UINT32 = 5125;
const TYPES: Record<number, string> = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' };
// Nombres de glTF de los atributos de three: los propios van con «_» y en mayúsculas (GLTFLoader los pasa a minúsculas)
const NAMES: Record<string, string> = { position: 'POSITION', normal: 'NORMAL', color: 'COLOR_0', uv: 'TEXCOORD_0' };

export function writeGlb(root: THREE.Object3D, options: GlbOptions = {}): Uint8Array {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const bufferViews: Json[] = [];
  const accessors: Json[] = [];
  const view = (bytes: Uint8Array, target?: number): number => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      byteLength += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    chunks.push(bytes);
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const accessor = (attr: THREE.BufferAttribute, minMax: boolean): number => {
    const array = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) for (let k = 0; k < attr.itemSize; k++) array[i * attr.itemSize + k] = attr.getComponent(i, k);
    const acc: Json = { bufferView: view(new Uint8Array(array.buffer), 34962), componentType: FLOAT, count: attr.count, type: TYPES[attr.itemSize] };
    if (minMax) {
      const min = Array(attr.itemSize).fill(Infinity);
      const max = Array(attr.itemSize).fill(-Infinity);
      for (let i = 0; i < array.length; i++) {
        min[i % attr.itemSize] = Math.min(min[i % attr.itemSize], array[i]);
        max[i % attr.itemSize] = Math.max(max[i % attr.itemSize], array[i]);
      }
      Object.assign(acc, { min, max });
    }
    accessors.push(acc);
    return accessors.length - 1;
  };

  const material: Json = { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 }, doubleSided: true };
  const gltf: Json = { asset: { version: '2.0', generator: 'sea-battle glb-writer (tests)' }, scene: 0, scenes: [{ nodes: [0] }] };
  if (options.image) {
    const image = { bufferView: view(options.image.bytes), mimeType: options.image.mimeType };
    const ktx2 = options.image.mimeType === 'image/ktx2';
    gltf.images = [image];
    gltf.samplers = [{ magFilter: 9729, minFilter: 9987 }];
    gltf.textures = [ktx2 ? { sampler: 0, extensions: { KHR_texture_basisu: { source: 0 } } } : { sampler: 0, source: 0 }];
    if (ktx2) gltf.extensionsUsed = gltf.extensionsRequired = ['KHR_texture_basisu'];
    (material.pbrMetallicRoughness as Json).baseColorTexture = { index: 0 };
  }
  gltf.materials = [material];

  const meshes: Json[] = [];
  const nodes: Json[] = [{ name: root.name, extras: { ...root.userData }, children: [] as number[] }];
  for (const child of root.children) {
    const node: Json = { name: child.name };
    if (!child.position.equals(new THREE.Vector3())) node.translation = child.position.toArray();
    if (!child.quaternion.equals(new THREE.Quaternion())) node.rotation = child.quaternion.toArray();
    if (child instanceof THREE.Mesh) {
      const g = child.geometry as THREE.BufferGeometry;
      const attributes: Json = {};
      for (const [name, attr] of Object.entries(g.attributes)) {
        attributes[NAMES[name] ?? `_${name.replace(/^_/, '').toUpperCase()}`] = accessor(attr as THREE.BufferAttribute, name === 'position');
      }
      const primitive: Json = { attributes, material: 0 };
      if (g.index) {
        const indices = new Uint32Array(g.index.array);
        accessors.push({ bufferView: view(new Uint8Array(indices.buffer), 34963), componentType: UINT32, count: indices.length, type: 'SCALAR' });
        primitive.indices = accessors.length - 1;
      }
      meshes.push({ name: child.name, primitives: [primitive] });
      node.mesh = meshes.length - 1;
    }
    nodes.push(node);
    (nodes[0].children as number[]).push(nodes.length - 1);
  }
  Object.assign(gltf, { nodes, meshes, accessors, bufferViews, buffers: [{ byteLength }] });
  options.edit?.(gltf);

  const pad4 = (n: number) => (n + 3) & ~3;
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = pad4(json.byteLength);
  const binLength = pad4(byteLength);
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // «glTF»
  dv.setUint32(4, 2, true);
  dv.setUint32(8, out.byteLength, true);
  dv.setUint32(12, jsonLength, true);
  dv.setUint32(16, 0x4e4f534a, true); // «JSON»
  out.set(json, 20);
  out.fill(0x20, 20 + json.byteLength, 20 + jsonLength);
  const bin = 20 + jsonLength;
  dv.setUint32(bin, binLength, true);
  dv.setUint32(bin + 4, 0x004e4942, true); // «BIN\0»
  let offset = bin + 8;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

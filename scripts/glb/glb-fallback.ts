// Respaldo de las texturas KTX2 de un GLB (D90; ASSET-SPEC §1, §13 paso 4b y AS-V10): una imagen PNG o JPEG más pequeña en
// `texture.source`, con la KTX2 en KHR_texture_basisu y la extensión fuera de extensionsRequired. El juego dibuja con ella
// hasta que llega el transcodificador (salida 1 de AC-193 c). La cadena de ux la incrusta con scripts/ux/barcos/respaldo.py;
// aquí están el validador de AS-V10 y addFallback, que se la añade en memoria al fixture de los tests sin otro binario. Con
// el paso 4c de §13, la KTX2 va en su .ktx2 aparte, enlazado por `uri`: externalizeKtx2 lo hace con el fixture
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { contentHash, HASHED_KTX2 } from './content-hash';

type Json = Record<string, unknown>;
type Texture = { source?: number; extensions?: { KHR_texture_basisu?: { source: number } } };
type Image = { bufferView?: number; uri?: string; mimeType: string; name?: string };
type BufferView = { buffer: number; byteOffset?: number; byteLength: number; extensions?: { EXT_meshopt_compression?: { buffer: number; byteOffset?: number } } };

const BASISU = 'KHR_texture_basisu';
const pad4 = (n: number) => (n + 3) & ~3;

export function readGlb(bytes: Uint8Array): { json: Json; bin: Uint8Array } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('no es un GLB');
  const jsonLength = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Json;
  const binLength = dv.getUint32(20 + jsonLength, true);
  return { json, bin: bytes.subarray(28 + jsonLength, 28 + jsonLength + binLength) };
}

function writeGlbChunks(json: Json, bin: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = pad4(text.byteLength);
  const binLength = pad4(bin.byteLength);
  const out = new Uint8Array(28 + jsonLength + binLength);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // «glTF»
  dv.setUint32(4, 2, true);
  dv.setUint32(8, out.byteLength, true);
  dv.setUint32(12, jsonLength, true);
  dv.setUint32(16, 0x4e4f534a, true); // «JSON»
  out.set(text, 20);
  out.fill(0x20, 20 + text.byteLength, 20 + jsonLength);
  dv.setUint32(20 + jsonLength, binLength, true);
  dv.setUint32(24 + jsonLength, 0x004e4942, true); // «BIN\0»
  out.set(bin, 28 + jsonLength);
  return out;
}

// PNG RGBA de un solo color, sin dependencias
export function solidPng(rgb: readonly number[], size: number): Uint8Array {
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
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
}

// Añade `png` como respaldo de cada textura KTX2 que no lo tenga y saca la extensión de extensionsRequired, como hace
// respaldo.py. La imagen va al final del BIN, en un bufferView nuevo del buffer 0; el resto del GLB no cambia
export function addFallback(glb: Uint8Array, png: Uint8Array, name = 'respaldo'): Uint8Array {
  const { json, bin } = readGlb(glb);
  const offset = pad4(bin.byteLength);
  const out = new Uint8Array(offset + png.byteLength);
  out.set(bin);
  out.set(png, offset);
  const bufferViews = json.bufferViews as BufferView[];
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: png.byteLength });
  const images = json.images as Json[];
  images.push({ bufferView: bufferViews.length - 1, mimeType: 'image/png', name });
  for (const t of (json.textures ?? []) as Texture[]) if (t.extensions?.[BASISU] && t.source === undefined) t.source = images.length - 1;
  (json.buffers as { byteLength: number }[])[0].byteLength = out.byteLength;
  const required = ((json.extensionsRequired ?? []) as string[]).filter((e) => e !== BASISU);
  if (required.length) json.extensionsRequired = required;
  else delete json.extensionsRequired;
  return writeGlbChunks(json, out);
}

// El GLB con su JSON cambiado por `edit` y el mismo BIN (los tests lo usan para estropear un campo)
export function editGlb(glb: Uint8Array, edit: (json: Json) => void): Uint8Array {
  const { json, bin } = readGlb(glb);
  edit(json);
  return writeGlbChunks(json, bin);
}

// Saca el bufferView `k` y sus bytes del BIN (el buffer 0): lo que va detrás se corre (con el relleno a 4, que mantiene la
// alineación) y los índices de bufferView mayores que `k` bajan uno
function dropBufferView(json: Json, bin: Uint8Array, k: number): Uint8Array {
  const views = json.bufferViews as BufferView[];
  const { buffer, byteOffset: start = 0, byteLength } = views[k];
  if (buffer !== 0 || start % 4) throw new Error(`bufferView ${k}: no está en el BIN alineado a 4`);
  const end = Math.min(bin.byteLength, start + pad4(byteLength));
  const out = new Uint8Array(bin.byteLength - (end - start));
  out.set(bin.subarray(0, start));
  out.set(bin.subarray(end), start);
  const shift = (o?: { buffer: number; byteOffset?: number }) => {
    if (o && o.buffer === 0 && (o.byteOffset ?? 0) > start) o.byteOffset = (o.byteOffset ?? 0) - (end - start);
  };
  views.splice(k, 1);
  for (const v of views) {
    shift(v);
    shift(v.extensions?.EXT_meshopt_compression);
  }
  type Ref = { bufferView?: number };
  const reindex = (o?: Ref) => {
    if (o?.bufferView !== undefined && o.bufferView > k) o.bufferView--;
  };
  for (const a of (json.accessors ?? []) as (Ref & { sparse?: { indices: Ref; values: Ref } })[]) {
    reindex(a);
    reindex(a.sparse?.indices);
    reindex(a.sparse?.values);
  }
  for (const image of (json.images ?? []) as Ref[]) reindex(image);
  (json.buffers as { byteLength: number }[])[0].byteLength = out.byteLength;
  return out;
}

// Paso 4c de §13: saca la KTX2 de la textura con KHR_texture_basisu a su archivo, `<id>_atlas.<hash>.ktx2` con los 8 hex del
// SHA-256 de sus bytes, y deja en su imagen la `uri` relativa a él. Devuelve el GLB sin la KTX2, la KTX2 y su nombre
export function externalizeKtx2(glb: Uint8Array, id: string): { glb: Uint8Array; ktx2: Uint8Array; name: string } {
  const { json, bin } = readGlb(glb);
  const textures = ((json.textures ?? []) as Texture[]).filter((t) => t.extensions?.[BASISU]);
  if (textures.length !== 1) throw new Error(`se espera 1 textura con ${BASISU} y hay ${textures.length}`);
  const images = json.images as Image[];
  const source = textures[0].extensions![BASISU]!.source;
  const { bufferView, mimeType, ...rest } = images[source];
  if (bufferView === undefined || mimeType !== 'image/ktx2') throw new Error(`imagen ${source}: no es una KTX2 en el BIN`);
  const v = (json.bufferViews as BufferView[])[bufferView];
  const ktx2 = bin.slice(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  const name = `${id}_atlas.${contentHash(ktx2)}.ktx2`;
  const out = dropBufferView(json, bin, bufferView);
  images[source] = { ...rest, uri: name, mimeType };
  return { glb: writeGlbChunks(json, out), ktx2, name };
}

// Las `uri` de las imágenes de un GLB (las KTX2 que van aparte, con el paso 4c)
export function externalUris(glb: Uint8Array): string[] {
  return ((readGlb(glb).json.images ?? []) as Image[]).flatMap((i) => (i.uri === undefined ? [] : [i.uri]));
}

// Ancho y alto de una imagen del BIN: PNG (IHDR), JPEG (SOFn) o KTX2 (pixelWidth y pixelHeight de la cabecera)
function imageSize(bytes: Uint8Array, mimeType: string): [number, number] | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === 'image/png') return [dv.getUint32(16), dv.getUint32(20)];
  if (mimeType === 'image/ktx2') return [dv.getUint32(20, true), dv.getUint32(24, true)];
  for (let i = 2; i + 9 < bytes.byteLength; i += 2 + dv.getUint16(i + 2)) {
    const marker = dv.getUint16(i);
    if (marker >= 0xffc0 && marker <= 0xffcf && marker !== 0xffc4 && marker !== 0xffc8 && marker !== 0xffcc) return [dv.getUint16(i + 7), dv.getUint16(i + 5)];
  }
  return null;
}

// La tabla de 4b (ASSET-SPEC §13; AS-V10): el lado y el formato del respaldo de cada sb_id, medidos por ux. Las claves que
// empiezan por _ son notas
export type FallbackSizes = Record<string, { lado: number; mimeType: string }>;
export const FALLBACK_SIZES_FILE = 'scripts/glb/respaldo-tamanos.json';
export function fallbackSizes(): FallbackSizes {
  const table = JSON.parse(fs.readFileSync(path.join(__dirname, 'respaldo-tamanos.json'), 'utf8')) as FallbackSizes;
  return Object.fromEntries(Object.entries(table).filter(([k]) => !k.startsWith('_')));
}

// AS-V10 con respaldo (D90): cada textura con KHR_texture_basisu lleva en `source` un PNG o JPEG del BIN, en potencia de 2,
// no mayor que su KTX2 y con el lado y el formato que la tabla de 4b da al sb_id de la raíz (`sizes`, por defecto
// FALLBACK_SIZES_FILE); la KTX2 trae todos sus mipmaps, y la extensión no está en extensionsRequired. Con el paso 4c, la
// KTX2 es una `uri` <nombre>.<hash de su contenido>.ktx2 de la misma carpeta, que se lee con `external` (null si no está).
// Devuelve los incumplimientos (vacío si cumple)
export function fallbackProblems(glb: Uint8Array, { external = () => null, sizes }: { external?: (uri: string) => Uint8Array | null; sizes?: FallbackSizes } = {}): string[] {
  const { json, bin } = readGlb(glb);
  const images = (json.images ?? []) as Image[];
  const bufferViews = (json.bufferViews ?? []) as BufferView[];
  const bytesOf = (image: Image) => {
    if (image.bufferView === undefined) return null;
    const v = bufferViews[image.bufferView];
    return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  };
  const pow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
  const problems: string[] = [];
  const roots = ((json.scenes ?? []) as { nodes?: number[] }[])[(json.scene as number | undefined) ?? 0]?.nodes ?? [];
  const sbId = roots.length === 1 ? ((json.nodes as { extras?: { sb_id?: string } }[])[roots[0]].extras?.sb_id) : undefined;
  const want = sbId === undefined ? undefined : (sizes ?? fallbackSizes())[sbId];
  if (((json.textures ?? []) as Texture[]).some((t) => t.extensions?.[BASISU])) {
    if (sbId === undefined) problems.push(`la raíz no lleva sb_id en sus extras (AS-V03): no se sabe qué respaldo pide ${FALLBACK_SIZES_FILE}`);
    else if (!want) problems.push(`${sbId} no está en ${FALLBACK_SIZES_FILE}`);
  }
  ((json.textures ?? []) as Texture[]).forEach((t, i) => {
    const ext = t.extensions?.[BASISU];
    if (!ext) return;
    const fallback = t.source === undefined ? undefined : images[t.source];
    if (!fallback) return void problems.push(`textura ${i}: sin respaldo en texture.source`);
    if (fallback.mimeType !== 'image/png' && fallback.mimeType !== 'image/jpeg') return void problems.push(`textura ${i}: respaldo ${fallback.mimeType}; se espera PNG o JPEG`);
    const fallbackBytes = bytesOf(fallback);
    if (!fallbackBytes) return void problems.push(`textura ${i}: el respaldo va en una uri (${fallback.uri}), no en el BIN`);
    const uri = images[ext.source].uri;
    let ktx2 = bytesOf(images[ext.source]);
    if (!ktx2 && uri !== undefined) {
      if (!HASHED_KTX2.test(uri)) return void problems.push(`textura ${i}: uri ${uri}; se espera <nombre>.<hash>.ktx2, relativa y sin barra`);
      ktx2 = external(uri);
      if (!ktx2) return void problems.push(`textura ${i}: falta ${uri}`);
      if (uri.split('.')[1] !== contentHash(ktx2)) problems.push(`textura ${i}: ${uri} no lleva el hash de su contenido (${contentHash(ktx2)})`);
    }
    if (!ktx2) return void problems.push(`textura ${i}: la KTX2 no está ni en el BIN ni en una uri`);
    const [w, h] = imageSize(fallbackBytes, fallback.mimeType) ?? [0, 0];
    const [kw, kh] = imageSize(ktx2, 'image/ktx2')!;
    if (!pow2(w) || !pow2(h)) problems.push(`textura ${i}: respaldo de ${w} × ${h}, no es potencia de 2`);
    else if (w > kw || h > kh) problems.push(`textura ${i}: respaldo de ${w} × ${h}, mayor que la KTX2 de ${kw} × ${kh}`);
    if (want && fallback.mimeType !== want.mimeType) problems.push(`textura ${i}: respaldo ${fallback.mimeType}; la tabla pide ${want.mimeType} para ${sbId}`);
    if (want && (w !== want.lado || h !== want.lado)) problems.push(`textura ${i}: respaldo de ${w} × ${h}; la tabla pide ${want.lado} × ${want.lado} para ${sbId}`);
    // levelCount de la cabecera KTX2. GLTFLoader le pone el minFilter del sampler, 9987 con mipmaps (GLTFLoader.js:3342), y a
    // una textura comprimida no le genera los que falten (generateMipmaps, :3345)
    const levels = new DataView(ktx2.buffer, ktx2.byteOffset, ktx2.byteLength).getUint32(40, true);
    const full = Math.floor(Math.log2(Math.max(kw, kh))) + 1;
    if (levels !== full) problems.push(`textura ${i}: la KTX2 de ${kw} × ${kh} trae ${levels} ${levels === 1 ? 'nivel' : 'niveles'}; se esperan ${full}, todos sus mipmaps`);
  });
  if (((json.extensionsRequired ?? []) as string[]).includes(BASISU)) problems.push(`${BASISU} está en extensionsRequired`);
  return problems;
}

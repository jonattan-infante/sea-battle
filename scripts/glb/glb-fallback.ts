// Respaldo de las texturas KTX2 de un GLB (D90; ASSET-SPEC §1, §13 paso 4b y AS-V10): una imagen PNG o JPEG más pequeña en
// `texture.source`, con la KTX2 en KHR_texture_basisu y la extensión fuera de extensionsRequired. El juego dibuja con ella
// hasta que llega el transcodificador (salida 1 de AC-193 c). La cadena de ux la incrusta con scripts/ux/barcos/respaldo.py;
// aquí están el validador de AS-V10 y addFallback, que se la añade en memoria al fixture de los tests sin otro binario
import zlib from 'zlib';

type Json = Record<string, unknown>;
type Texture = { source?: number; extensions?: { KHR_texture_basisu?: { source: number } } };
type Image = { bufferView: number; mimeType: string };
type BufferView = { buffer: number; byteOffset?: number; byteLength: number };

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

// AS-V10 con respaldo (D90): cada textura con KHR_texture_basisu lleva en `source` un PNG o JPEG en potencia de 2 y no
// mayor que su KTX2, y la extensión no está en extensionsRequired. Devuelve los incumplimientos (vacío si cumple)
export function fallbackProblems(glb: Uint8Array): string[] {
  const { json, bin } = readGlb(glb);
  const images = (json.images ?? []) as Image[];
  const bufferViews = (json.bufferViews ?? []) as BufferView[];
  const bytesOf = (image: Image) => {
    const v = bufferViews[image.bufferView];
    return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  };
  const pow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
  const problems: string[] = [];
  ((json.textures ?? []) as Texture[]).forEach((t, i) => {
    const ext = t.extensions?.[BASISU];
    if (!ext) return;
    const fallback = t.source === undefined ? undefined : images[t.source];
    if (!fallback) return void problems.push(`textura ${i}: sin respaldo en texture.source`);
    if (fallback.mimeType !== 'image/png' && fallback.mimeType !== 'image/jpeg') return void problems.push(`textura ${i}: respaldo ${fallback.mimeType}; se espera PNG o JPEG`);
    const [w, h] = imageSize(bytesOf(fallback), fallback.mimeType) ?? [0, 0];
    const [kw, kh] = imageSize(bytesOf(images[ext.source]), 'image/ktx2')!;
    if (!pow2(w) || !pow2(h)) problems.push(`textura ${i}: respaldo de ${w} × ${h}, no es potencia de 2`);
    else if (w > kw || h > kh) problems.push(`textura ${i}: respaldo de ${w} × ${h}, mayor que la KTX2 de ${kw} × ${kh}`);
  });
  if (((json.extensionsRequired ?? []) as string[]).includes(BASISU)) problems.push(`${BASISU} está en extensionsRequired`);
  return problems;
}

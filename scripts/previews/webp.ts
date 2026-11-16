// Ancho y alto de un WebP leídos de su cabecera (RIFF «WEBP» con un trozo VP8, VP8L o VP8X), sin descodificarlo: lo usan el
// paso de las vistas previas (stage-previews.ts) y su test, para no depender de una librería de imágenes
export function webpSize(b: Uint8Array): { width: number; height: number } | null {
  const tag = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (b.length < 30 || tag(0, 4) !== 'RIFF' || tag(8, 4) !== 'WEBP') return null;
  const chunk = tag(12, 4);
  if (chunk === 'VP8 ') return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  return null;
}

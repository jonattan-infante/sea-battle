// AD-28 con el GLB de la Cañonera de D91 (U6 de dev-render; ASSET-SPEC, fila AD-28, 2026-10-24): las partes de la batería
// se reconocen por el centroide de cada triángulo, en coordenadas del asset. Cañón: COLOR_0 `#232326` a 1,5 m o más del
// eje. Mortero: COLOR_0 `#232326` o `#0E0E10` (su boca) a menos de 1,5 m. Cureña: COLOR_0 `rail` dentro de las cajas de
// 1,0 × 0,5 × 1,4 m centradas en (±(x_at(z, yd) − 1,25), yd + 0,25, z), con z en CANNON_Z. Cubierta: la región `deck`
// del atlas (TEXCOORD_0 con el origen arriba, v de 0,25 a 0,46875). El GLB guarda COLOR_0 en lineal con 8 bits: un color
// casa si cada canal está a medio paso (0,5/255) o menos del hex en lineal; así el hierro de las cajas de balas
// (`#26282B`, un paso por encima en cada canal) no pasa por cañón
export interface GeometryArrays {
  position: number[];
  color: number[];
  colorSize: number; // 3 o 4: el COLOR_0 que exporta Blender es RGBA
  uv: number[];
  index: number[] | null;
}

type Readable = { index: { array: ArrayLike<number> } | null; getAttribute(n: string): { count: number; itemSize: number; getComponent(i: number, c: number): number } };

// Los atributos de una geometría tal como los lee three (getComponent desnormaliza el COLOR_0 de 8 bits), con su tamaño. El
// e2e la corre en la página (geometryArrays.toString()) y el test de Jest, sobre el GLB leído en node: así leen igual
export function geometryArrays(g: Readable): GeometryArrays {
  const flat = (name: string) => {
    const a = g.getAttribute(name);
    const out: number[] = [];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out.push(a.getComponent(i, c));
    return { values: out, size: a.itemSize };
  };
  const color = flat('color');
  return { position: flat('position').values, color: color.values, colorSize: color.size, uv: flat('uv').values, index: g.index ? Array.from(g.index.array) : null };
}

export interface Box { x: number; y: number; z: number }

// Triángulos de cada parte, en el orden de la geometría (el de toNonIndexed)
export interface Ad28Parts {
  cannon: number[];
  mortar: number[];
  carriage: number[];
  deck: number[];
  carriages: Box[]; // los centros de las 12 cajas, de babor a estribor por cada z
}

export const GUNBOAT_GLB_AD28 = {
  cannon: '#232326',
  mouth: '#0E0E10',
  rail: '#3A2A20',
  cannonZ: [-7.0, -4.2, -1.4, 1.4, 4.2, 7.0],
  axis: 1.5, // m: cañones a esta distancia del eje o más; el mortero, a menos
  box: { x: 1.0, y: 0.5, z: 1.4 },
  deckV: [0.25, 0.46875] as [number, number]
};

const lin = (hex: string) => [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

export function gunboatGlbParts(g: GeometryArrays, d = GUNBOAT_GLB_AD28): Ad28Parts {
  const n = (g.index ? g.index.length : g.position.length / 3) / 3;
  const vi = (t: number, k: number) => (g.index ? g.index[3 * t + k] : 3 * t + k);
  const mean = (a: number[], size: number, t: number, ch: number) => [0, 1, 2].reduce((s, k) => s + a[size * vi(t, k) + ch], 0) / 3;
  const centroid = (t: number) => [0, 1, 2].map((ch) => mean(g.position, 3, t, ch));
  const is = (t: number, hex: string) => lin(hex).every((c, ch) => Math.abs(mean(g.color, g.colorSize, t, ch) - c) <= 0.5 / 255 + 1e-6);
  const parts: Ad28Parts = { cannon: [], mortar: [], carriage: [], deck: [], carriages: [] };
  for (let t = 0; t < n; t++) {
    const [x] = centroid(t);
    if (is(t, d.cannon) && Math.abs(x) >= d.axis) parts.cannon.push(t);
    else if ((is(t, d.cannon) || is(t, d.mouth)) && Math.abs(x) < d.axis) parts.mortar.push(t);
    const v = mean(g.uv, 2, t, 1);
    if (v >= d.deckV[0] && v <= d.deckV[1]) parts.deck.push(t);
  }
  // Los centros de las cajas salen de cada cañón: va de xc − 1,2 a xc + 1,2 en x con el eje a yd + 0,45 (canonera2_curvo.py
  // :152-157), y su caja de vértices da xc y la y del eje; la cureña, en (xc ∓ 0,25, yd + 0,25, z)
  for (const z of d.cannonZ) {
    for (const side of [1, -1]) {
      const vs = parts.cannon.filter((t) => Math.sign(centroid(t)[0]) === side && Math.abs(centroid(t)[2] - z) < 0.7).flatMap((t) => [0, 1, 2].map((k) => vi(t, k)));
      if (!vs.length) continue;
      const span = (ch: number) => { const a = vs.map((i) => g.position[3 * i + ch]); return (Math.min(...a) + Math.max(...a)) / 2; };
      parts.carriages.push({ x: span(0) - side * 0.25, y: span(1) - 0.45 + 0.25, z });
    }
  }
  const e = 0.01; // las caras de la caja caen en su borde, y el GLB guarda las posiciones cuantizadas (≈ 1 mm)
  for (let t = 0; t < n; t++) {
    if (!is(t, d.rail)) continue;
    const [x, y, z] = centroid(t);
    if (parts.carriages.some((b) => Math.abs(x - b.x) <= d.box.x / 2 + e && Math.abs(y - b.y) <= d.box.y / 2 + e && Math.abs(z - b.z) <= d.box.z / 2 + e)) parts.carriage.push(t);
  }
  return parts;
}

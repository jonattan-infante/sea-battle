// Uso: en el árbol de la lámina (4b4c688 con code/ship-geometry-lamina.patch; ver la cabecera de
// scripts/ux/laminas/lamina_barcos.py): npx tsx export-rig.ts <salida.json>. No corre en la CI.
// LÁMINA para Jonattan (no es código del juego): exporta la Balandra, el Bergantín y la Fragata del código de dev-render
// (4b4c688, copia de solo lectura) y la Goleta y el Navío de línea con las recetas de ASSET-SPEC §8.4 de r11.
import fs from 'fs';
import { getShipModel, SHIP_RECIPES, deckY, ShipRecipe } from './src/client/models/ship-geometry';
const base = SHIP_RECIPES.sloop;
const S = (F: number, L: number) => [0, 1.25 * F, L / 2 - 1] as const;
const tAt = (F: number, L: number, bs: number, f: number): [number, number, number] => {
  const s = S(F, L); const k = (bs + 1) * f; return [0, +(s[1] + 0.342 * k).toFixed(3), +(s[2] + 0.94 * k).toFixed(3)];
};
const clew = (H: number[], T: number[], y: number): [number, number, number] => [0, y, +(H[2] + 0.45 * (T[2] - H[2])).toFixed(3)];
// Goleta (ASSET-SPEC `ship_schooner`)
const gT1 = tAt(1.6, 22, 7, 0.5), gT2 = tAt(1.6, 22, 7, 1);
const SCHOONER: ShipRecipe = {
  ...base, assetId: 'ship_schooner', L: 22, B: 5.6, F: 1.6, D: 0.9, bowsprit: 7.0, railH: 0.56, profile: 'standard', rake: 0,
  masts: [
    { z: 4.0, h: 18.0, gaff: { A: [3.6, 3.0], B: [3.6, 13.8], C: [-1.8, 15.0], D: [-2.4, 3.4] }, squares: [{ w: 5.4, h: 2.4, yb: 14.6 }] },
    { z: -3.3, h: 19.5, gaff: { A: [-3.7, 3.2], B: [-3.7, 15.2], C: [-10.4, 16.4], D: [-11.0, 3.6] } }
  ],
  flagMast: 1,
  jibs: [
    { H: [0, 14.0, 4.4], T: gT1, C: clew([0, 14.0, 4.4], gT1, 2.9) },
    { H: [0, 16.6, 4.4], T: gT2, C: clew([0, 16.6, 4.4], gT2, 3.2) }
  ],
  boxes: [], barrels: [], fire: undefined,
  cannonZ: [-6, -2, 2, 6], cannonY: 1.0, cannon: [0.23, 0.29, 1.3],
  sailStyle: 'plain', flagStyle: 'pennant', trimRail: false, cannonScale: 0.9,
  radius: 12, mastHeight: 19.5, pick: [2.8, 19.5, 11.0]
};
// Navío de línea (ASSET-SPEC `ship_line`), con sus 2 franjas de portas (S6)
const lineBase: ShipRecipe = { ...base, assetId: 'ship_line', L: 42, B: 11.2, F: 3.6, D: 1.9, bowsprit: 10.0, railH: 1.2, profile: 'standard', rake: 0 } as ShipRecipe;
const yd = (z: number) => deckY(lineBase, z / 42);
const lT = [0.5, 0.75, 1.0].map((f) => tAt(3.6, 42, 10, f));
const lH: [number, number, number][] = [[0, 22, 12.5], [0, 25, 12.5], [0, 28, 12.5]];
const LINE: ShipRecipe = {
  ...lineBase,
  masts: [
    { z: 12.5, h: 30, squares: [{ w: 14.6, h: 5.4, yb: 6.8 }, { w: 12.0, h: 4.8, yb: 12.8 }, { w: 9.2, h: 3.8, yb: 18.2 }], topY: 12.8 },
    { z: 1.0, h: 34, squares: [{ w: 16.0, h: 6.0, yb: 6.8 }, { w: 13.2, h: 5.2, yb: 13.4 }, { w: 10.0, h: 4.0, yb: 19.2 }], topY: 13.4 },
    { z: -11.5, h: 26, lateen: { A: [-8.6, 6.6], B: [-19.4, 7.0], C: [-20.6, 18.0] }, squares: [{ w: 9.0, h: 3.6, yb: 18.8 }], topY: 11.0 }
  ],
  flagMast: 1,
  jibs: lH.map((H, i) => ({ H, T: lT[i], C: clew(H, lT[i], 5.6) })),
  boxes: [
    { size: [9.6, 1.6, 11.0], pos: [0, yd(-15) + 0.8, -15.0], kind: 'castle' },
    { size: [8.6, 1.4, 6.0], pos: [0, yd(-17.5) + 2.3, -17.5], kind: 'castle' },
    { size: [7.6, 1.2, 7.0], pos: [0, yd(15.5) + 0.6, 15.5], kind: 'castle' },
    ...[-2.6, 0, 2.6].map((x) => ({ size: [0.4, 0.6, 0.4] as [number, number, number], pos: [x, yd(-17.5) + 3.3, -20.3] as [number, number, number], kind: 'lantern' as const })),
    ...[yd(-21) - 0.45, yd(-21) + 0.8].flatMap((y) => [-2.4, 0, 2.4].map((x) => ({ size: [1.0, 0.6, 0.06] as [number, number, number], pos: [x, y, -21.05] as [number, number, number], kind: 'lantern' as const })))
  ],
  barrels: [], fire: undefined,
  cannonZ: [-17.5, -14, -10.5, -7, -3.5, 0, 3.5, 7, 10.5, 14], cannonY: 2.05, cannon: [0.26, 0.32, 1.6],
  bands: [{ y: 1.35, z: [-14, -7, 0, 7, 14] }, { y: 2.75, z: [-17.5, -10.5, -3.5, 3.5, 10.5] }], bandH: 0.9, portH: 0.55,
  sailStyle: 'plain', flagStyle: 'pennant', trimRail: true, cannonScale: 1.2,
  radius: 22, mastHeight: 34, pick: [8.0, 34.0, 21.0]
};
SHIP_RECIPES.line = { ...LINE, boxes: [] };
// Solo el aparejo y los cañones del Navío (rim 0) para el piloto de E17: el casco, la cubierta, los castillos, las portas y
// los faroles se rehacen con textura en Python
const m = getShipModel('line');
const out: Record<string, unknown> = {};
for (const lod of [0, 1]) {
  const g = m.lods[lod];
  const rim = g.getAttribute('_rim_mask');
  out[`lod${lod}`] = { pos: Array.from(g.getAttribute('position').array as Float32Array), nor: Array.from(g.getAttribute('normal').array as Float32Array), col: Array.from(g.getAttribute('color').array as Float32Array), rim: rim ? Array.from(rim.array as Float32Array) : null };
}
const v = (p: { x: number; y: number; z: number } | undefined) => (p ? [p.x, p.y, p.z] : null);
out.extras = m.extras;
out.sockets = { port: m.sockets.cannonsPort.map(v), stbd: m.sockets.cannonsStbd.map(v), smoke: v(m.sockets.smoke), fire: m.sockets.fire.map(v), label: v(m.sockets.label), wake: v(m.sockets.wake), bow: v(m.sockets.bow) };
out.hullBox = [m.hullBox.min.toArray(), m.hullBox.max.toArray()];
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('tris', m.triangles.join('/'));

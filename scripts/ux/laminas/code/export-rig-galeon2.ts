// Uso: en una copia del código de 4b4c688 con code/ship-geometry-lamina.patch (ver la cabecera de
// scripts/ux/barcos/galeon.py): npx tsx export-rig-galeon2.ts <salida.json>. No corre en la CI.
// LÁMINA para Jonattan (no es código del juego): el Galeón del tesoro armado (D88 v2; GDD §9 desde el 2026-10-18: sin
// escolta y 8 cañones por banda) con la receta de ASSET-SPEC §8.4 (`npc_merchant_galleon`), en el formato de
// export-rig-clases.ts para que barcos/galeon_curvo.py le ponga el casco de D91: el barco del juego entero en LOD0 y LOD1 con
// su _rim_mask, la receta, los extras y los sockets. Exporta también el Mercante y el Pirata de hoy enteros, para compararlos
// en la lámina (AD-41 b y AC-169).
import fs from 'fs';
import { getShipModel, SHIP_RECIPES, deckY, deckHalfBeam, ShipRecipe } from './src/client/models/ship-geometry';
const base = SHIP_RECIPES.merchant;
const L = 36, F = 3.4, BS = 7.0;
const S = [0, 1.25 * F, L / 2 - 1] as const;
const tAt = (f: number): [number, number, number] => { const k = (BS + 1) * f; return [0, +(S[1] + 0.342 * k).toFixed(3), +(S[2] + 0.94 * k).toFixed(3)]; };
const clew = (H: number[], T: number[], y: number): [number, number, number] => [0, y, +(H[2] + 0.45 * (T[2] - H[2])).toFixed(3)];
const g0: ShipRecipe = { ...base, assetId: 'npc_merchant_galleon', L, B: 12.0, F, D: 1.8, bowsprit: BS, railH: 1.2, profile: 'full', rake: 0 } as ShipRecipe;
const yd = (z: number) => deckY(g0, z / L);
const T1 = tAt(0.55), T2 = tAt(1.0);
const H1: [number, number, number] = [0, 18.0, 11.0], H2: [number, number, number] = [0, 21.0, 11.0];
const GALLEON: ShipRecipe = {
  ...g0,
  masts: [
    { z: 11.0, h: 24, squares: [{ w: 12.4, h: 4.8, yb: 6.2 }, { w: 10.0, h: 4.0, yb: 11.2 }], topY: 11.0 },
    { z: 1.5, h: 27, squares: [{ w: 14.0, h: 5.4, yb: 6.2 }, { w: 11.4, h: 4.6, yb: 11.8 }, { w: 8.6, h: 3.4, yb: 16.6 }], topY: 11.6 },
    { z: -7.5, h: 18, lateen: { A: [-5.0, 6.5], B: [-12.4, 7.0], C: [-13.2, 16.0] } },
    // contramesana sobre el 2.º piso de la popa (Box(9,4, 2, 5,5) con la tapa en yd + 4,0)
    { z: -14.0, h: 14, baseY: +(yd(-14.8) + 4.0).toFixed(3), lateen: { A: [-12.0, 9.2], B: [-18.4, 9.6], C: [-19.0, 15.5] } }
  ],
  flagMast: 1,
  jibs: [{ H: H1, T: T1, C: clew(H1, T1, 5.6) }, { H: H2, T: T2, C: clew(H2, T2, 6.2) }],
  boxes: [], barrels: [], fire: undefined,
  // 8 cañones por banda desde el 2026-10-18 (ASSET-SPEC §8.4): las z de la receta, y = 1,95, el cañón de la Fragata
  cannonZ: [-12.0, -8.8, -5.6, -2.4, 0.8, 4.0, 7.2, 10.4], cannonY: 1.95, cannon: [0.26, 0.32, 1.6],
  sailStyle: 'striped', flagStyle: 'flag', trimRail: true, cannonScale: 1.2,
  radius: 19, mastHeight: 27, pick: [7.0, 27.0, 18.0]
};
SHIP_RECIPES.galleon = GALLEON;
const r = GALLEON;
const m = getShipModel('galleon');
const out: Record<string, unknown> = {};
for (const lod of [0, 1]) {
  const g = m.lods[lod];
  const rim = g.getAttribute('_rim_mask');
  out[`lod${lod}`] = { pos: Array.from(g.getAttribute('position').array as Float32Array), col: Array.from(g.getAttribute('color').array as Float32Array), rim: rim ? Array.from(rim.array as Float32Array) : null };
}
// el Mercante y el Pirata de hoy enteros (casco incluido), para compararlos en la lámina
for (const id of ['merchant', 'pirate']) {
  const mm = getShipModel(id).lods[0];
  out[id] = { pos: Array.from(mm.getAttribute('position').array as Float32Array), col: Array.from(mm.getAttribute('color').array as Float32Array) };
}
out.check = Array.from({ length: 13 }, (_, i) => { const u = -0.5 + i / 12; return [u, deckY(r, u), deckHalfBeam(r, u)]; });
out.recipe = { L: r.L, B: r.B, F: r.F, D: r.D, bowsprit: r.bowsprit, railH: r.railH, profile: r.profile, masts: r.masts, jibs: r.jibs, flagMast: r.flagMast,
  knifeOpen: r.knifeOpen ?? 25, boxes: r.boxes, cannonZ: r.cannonZ, cannonY: r.cannonY };
out.extras = m.extras;
const v = (p: { x: number; y: number; z: number } | undefined) => (p ? [p.x, p.y, p.z] : null);
const s = m.sockets;
out.sockets = { port: s.cannonsPort.map(v), stbd: s.cannonsStbd.map(v), smoke: v(s.smoke), fire: s.fire.map(v), label: v(s.label), wake: v(s.wake), bow: v(s.bow) };
out.hullBox = [m.hullBox.min.toArray(), m.hullBox.max.toArray()];
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('galleon tris', m.triangles.join('/'));

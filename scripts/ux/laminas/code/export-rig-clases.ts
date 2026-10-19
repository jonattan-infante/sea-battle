// Uso: en una copia del código de 4b4c688 con code/ship-geometry-lamina.patch (ver la cabecera de
// scripts/ux/barcos/galeon.py): npx tsx export-rig-clases.ts <classId> <salida.json>, con sloop, brig, frigate o schooner.
// No corre en la CI.
// LÁMINA para Jonattan (no es código del juego): las 4 clases del jugador que se rehacen con la receta de D91 en las 2
// familias (AC-195), como export-rig-npc.ts: el barco del juego entero en LOD0 y LOD1 con su _rim_mask, deckY y la
// semimanga en 13 puntos, los extras y los sockets del procedural. La Goleta no está en SHIP_RECIPES de 4b4c688: va con la
// receta de ASSET-SPEC §8.4 de r11, la misma de export-rig.ts y export-barcos.ts.
import fs from 'fs';
import { getShipModel, SHIP_RECIPES, deckY, deckHalfBeam, ShipRecipe } from './src/client/models/ship-geometry';
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
SHIP_RECIPES.schooner = SCHOONER;
const id = process.argv[2];
if (!['sloop', 'brig', 'frigate', 'schooner'].includes(id)) throw new Error(`clase desconocida: ${id}`);
const r = SHIP_RECIPES[id];
const m = getShipModel(id);
const out: Record<string, unknown> = {};
for (const lod of [0, 1]) {
  const g = m.lods[lod];
  const rim = g.getAttribute('_rim_mask');
  out[`lod${lod}`] = { pos: Array.from(g.getAttribute('position').array as Float32Array), col: Array.from(g.getAttribute('color').array as Float32Array), rim: rim ? Array.from(rim.array as Float32Array) : null };
}
out.check = Array.from({ length: 13 }, (_, i) => { const u = -0.5 + i / 12; return [u, deckY(r, u), deckHalfBeam(r, u)]; });
// la receta, para que la de D91 ponga sus piezas donde las pone el generador: la cangreja gira knifeOpen (25° por defecto)
// alrededor del gratil, y la bandera de la familia va en su pico (ART-DIRECTION §9.3)
out.recipe = { L: r.L, B: r.B, F: r.F, D: r.D, bowsprit: r.bowsprit, railH: r.railH, profile: r.profile, masts: r.masts, jibs: r.jibs, flagMast: r.flagMast,
  knifeOpen: r.knifeOpen ?? 25, boxes: r.boxes, cannonZ: r.cannonZ, cannonY: r.cannonY };
out.extras = m.extras;
const v = (p: { x: number; y: number; z: number } | undefined) => (p ? [p.x, p.y, p.z] : null);
const s = m.sockets;
out.sockets = { port: s.cannonsPort.map(v), stbd: s.cannonsStbd.map(v), smoke: v(s.smoke), fire: s.fire.map(v), label: v(s.label), wake: v(s.wake), bow: v(s.bow) };
out.hullBox = [m.hullBox.min.toArray(), m.hullBox.max.toArray()];
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log(id, 'tris', m.triangles.join('/'));

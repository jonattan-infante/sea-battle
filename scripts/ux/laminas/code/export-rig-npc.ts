// Uso: en una copia del código de 4b4c688 con code/ship-geometry-lamina.patch (ver la cabecera de
// scripts/ux/barcos/galeon.py): npx tsx export-rig-npc.ts <classId> <salida.json>. No corre en la CI.
// LÁMINA para Jonattan (no es código del juego): un barco del juego entero (p. ej. `gunboat`, la Cañonera), en LOD0 y
// LOD1, con su _rim_mask. canonera_curvo.py se queda con el aparejo (rim 0) y rehace el casco con curvas y textura; la
// lámina de la cadena de arte usa el modelo entero como «hoy». Exporta también deckY y la semimanga en 13 puntos, con
// los que el script de Python comprueba su copia del perfil.
import fs from 'fs';
import { getShipModel, SHIP_RECIPES, deckY, deckHalfBeam } from './src/client/models/ship-geometry';
const id = process.argv[2];
const r = SHIP_RECIPES[id];
const m = getShipModel(id);
const out: Record<string, unknown> = {};
for (const lod of [0, 1]) {
  const g = m.lods[lod];
  const rim = g.getAttribute('_rim_mask');
  out[`lod${lod}`] = { pos: Array.from(g.getAttribute('position').array as Float32Array), col: Array.from(g.getAttribute('color').array as Float32Array), rim: rim ? Array.from(rim.array as Float32Array) : null };
}
out.check = Array.from({ length: 13 }, (_, i) => { const u = -0.5 + i / 12; return [u, deckY(r, u), deckHalfBeam(r, u)]; });
out.extras = m.extras;
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log(id, 'tris', m.triangles.join('/'));

// Uso: en una copia del código de 4b4c688 con code/ship-geometry-lamina.patch (ver la cabecera de
// scripts/ux/barcos/galeon.py): npx tsx export-rig-npc.ts <classId> <salida.json>. No corre en la CI.
// LÁMINA para Jonattan (no es código del juego): un barco del juego entero (p. ej. `gunboat`, la Cañonera), en LOD0 y
// LOD1, con su _rim_mask. canonera_curvo.py se queda con el aparejo (rim 0) y rehace el casco con curvas y textura; la
// lámina de la cadena de arte usa el modelo entero como «hoy». Exporta también deckY y la semimanga en 13 puntos, con
// los que el script de Python comprueba su copia del perfil, y los sockets del procedural (sockets_canonera2.py los usa).
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
// los sockets del procedural (ASSET-SPEC §3), para que el GLB de la receta los compare (AS-V13) y herede la etiqueta, la
// estela y la proa; `smoke2` solo en la Cañonera (D25)
const v = (p: { x: number; y: number; z: number } | undefined) => (p ? [p.x, p.y, p.z] : null);
const s = m.sockets;
out.sockets = { port: s.cannonsPort.map(v), stbd: s.cannonsStbd.map(v), smoke: v(s.smoke), smoke2: v(s.smoke2), fire: s.fire.map(v), label: v(s.label), wake: v(s.wake), bow: v(s.bow) };
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log(id, 'tris', m.triangles.join('/'));

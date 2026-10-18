#!/bin/sh
# Uso (desde la raíz del repo): sh scripts/ux/barcos/comprimir.sh   →  $UX_OUT/piloto/comp/ship_line_{gb,es}.glb
# Paso 4 de ASSET-SPEC §13: textura WebP → PNG → KTX2 ETC1S (KHR_texture_basisu) y geometría con meshopt
# (EXT_meshopt_compression y KHR_mesh_quantization). Necesita gltf-transform 4.5.1 (en esta máquina, en el Node 24 de
# nvm) y toktx de KTX-Software 4.4.2. Ligero: segundos. No corre en la CI.
set -eu
OUT="${UX_OUT:-${TMPDIR:-/tmp}/sea-battle-laminas}/piloto"
mkdir -p "$OUT/comp"
for f in gb es; do
  gltf-transform png "$OUT/ship_line_$f.glb" "$OUT/comp/a_$f.glb" --formats webp
  gltf-transform etc1s "$OUT/comp/a_$f.glb" "$OUT/comp/b_$f.glb" --jobs 1
  gltf-transform meshopt "$OUT/comp/b_$f.glb" "$OUT/comp/ship_line_$f.glb"
  rm -f "$OUT/comp/a_$f.glb" "$OUT/comp/b_$f.glb"
  gltf-transform validate "$OUT/comp/ship_line_$f.glb" | tail -3
done
ls -l "$OUT/comp"

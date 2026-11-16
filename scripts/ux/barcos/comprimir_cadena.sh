#!/bin/sh
# Uso (desde la raíz del repo), tras blender_curvo.py export: sh scripts/ux/barcos/comprimir_cadena.sh
#   →  $UX_OUT/cadena/comp/<id>_meshopt.glb, atlas_<fam>.ktx2 y atlas_<fam>_base.ktx2 (sin la oclusión, para el coste de
#      esa palanca sola), y los del piloto de D80 para calibrar: piloto_<fam>_meshopt.glb (de $UX_PILOTO/ship_line_<fam>.glb,
#      el export de Blender) y piloto_<fam>.ktx2
# Coste de la lámina de la cadena de arte, en un solo núcleo. La geometría, con meshopt (gltf-transform, un hilo). La
# textura, con `ktx create` y los parámetros exactos de `gltf-transform etc1s` 4.5.1 (cli.mjs:704-743: basis-lz, calidad
# 128, RDO, mipmaps, sRGB y BT.709), con --threads 1 en lugar de un hilo por núcleo, y desde el PNG del atlas, sin pasar
# por WebP. Los barcos nuevos llevan además la paleta acotada a 1024 (--max-endpoints y --max-selectors 1024; en
# gltf-transform, `etc1s --max-endpoints 1024 --max-selectors 1024`), que es lo que mete a los Navíos en los 120 000 B de
# la entrada (turno B2 de ux, 2026-10-18). El GLB final se estima en lamina_cadena.py como meshopt − imagen + KTX2 +
# respaldo. Necesita gltf-transform 4.5.1 y KTX-Software 4.4.2 (`ktx`). No corre en la CI.
set -eu
OUT="${UX_OUT:-${TMPDIR:-/tmp}/sea-battle-laminas}/cadena"
PILOTO="${UX_PILOTO:-${UX_OUT:-${TMPDIR:-/tmp}/sea-battle-laminas}/piloto}"
mkdir -p "$OUT/comp"
for id in navio_gb navio_es canonera; do gltf-transform meshopt "$OUT/$id.glb" "$OUT/comp/${id}_meshopt.glb"; done
for a in gb es; do gltf-transform meshopt "$PILOTO/ship_line_$a.glb" "$OUT/comp/piloto_${a}_meshopt.glb"; done
k() { dst=$1; src=$2; shift 2
      ktx create --generate-mipmap --encode basis-lz --assign-tf srgb --assign-primaries bt709 --format R8G8B8_SRGB --threads 1 "$@" "$src" "$dst"; }
for a in gb es canonera; do
  k "$OUT/comp/atlas_$a.ktx2" "$OUT/atlas_$a.png" --max-endpoints 1024 --max-selectors 1024
  k "$OUT/comp/atlas_${a}_base.ktx2" "$OUT/atlas_${a}_base.png" --max-endpoints 1024 --max-selectors 1024
done
for a in gb es; do k "$OUT/comp/piloto_$a.ktx2" "$PILOTO/atlas_$a.png"; done
ls -l "$OUT/comp"

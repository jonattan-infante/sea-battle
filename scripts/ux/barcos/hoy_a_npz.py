# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/hoy_a_npz.py
#   →  $UX_OUT/piloto/navio_hoy{frigate,line}_lod{0,1}.npz y atlas_hoy{frigate,line}.png
# La Fragata de hoy y el Navío de la lámina D64, con su color por vértice sobre un atlas blanco, para que blender_navio.py
# los renderice junto a las familias en la lámina de D80. Necesita $UX_OUT/barcos-geo.json (code/export-barcos.ts; ver la
# cabecera de scripts/ux/laminas/lamina_barcos.py). No corre en la CI.
import json, os, sys, importlib.util
import numpy as np
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(here, '..', 'laminas')); import rutas as RT
OUT = os.path.join(RT.OUT, 'piloto'); os.makedirs(OUT, exist_ok=True)
g = json.load(open(RT.need(os.path.join(RT.OUT, 'barcos-geo.json'), 'barcos-geo.json (code/export-barcos.ts)')))
spec = importlib.util.spec_from_file_location('navio', os.path.join(here, 'navio.py')); N = importlib.util.module_from_spec(spec); spec.loader.exec_module(N)
for k in ('frigate', 'line'):
    P = np.array(g[k]['pos']).reshape(-1, 3); C = np.array(g[k]['col']).reshape(-1, 3); n = len(P)
    T = np.tile(np.array(N.WHITE), (n, 1))
    for lod in (0, 1): np.savez(os.path.join(OUT, f'navio_hoy{k}_lod{lod}.npz'), p=P, t=T, c=C, r=np.zeros(n))
    Image.new('RGB', (1024, 1024), (255, 255, 255)).save(os.path.join(OUT, f'atlas_hoy{k}.png'))
print('ok', OUT)

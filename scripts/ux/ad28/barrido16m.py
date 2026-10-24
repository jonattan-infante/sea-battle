# ux · barrido fino con el muestreo del MSAA 4× (AD28_MSAA4=1): 400 posturas por rumbo (5 × 5 × 16 fases) y las 5 del a-v6
# × 16 fases. Métricas: manchas con cañón (la del test de hoy) y cañones distintos por la regla de producto (r11 baa8cba,
# BACKLOG :421: el principal de una mancha con cañón y Feret ≥ 4 es el de más px limpios de caña), sin mínimo y con ≥ 6 px.
# Uso: AD28_MSAA4=1 HDS=225,45,135,315 python3 -I barrido16m.py <scripts/ux> <variante> <salida.json>
#      (AD28_KTX2=<otra KTX2 del atlas>: la del reexporte, con la AO rehorneada; turno CV de D97)
import sys, os, math, json
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
var, outj = sys.argv[2], sys.argv[3]; sys.argv = [sys.argv[0], sys.argv[1], 'x']
import numpy as np
import balanceo as BL
assert BL.MSAA4, 'falta AD28_MSAA4=1'
mod = BL.load_variant(var, ktx=os.environ.get('AD28_KTX2'))
ROLLS = [-3.0, -1.5, 0.0, 1.5, 3.0]; PITCHES = [-1.5, -0.75, 0.0, 0.75, 1.5]; PH = [(i / 4, j / 4) for i in range(4) for j in range(4)]
HDS = [int(x) for x in os.environ.get('HDS', '225,45,135,315').split(',')]
TH = (0, 6)
def metr(q): return dict(manchas=q['guns'], **{f'canones{t}': sum(1 for v in q['cana_por_canon'].values() if v >= t) for t in TH})
res = {}
for hd in HDS:
    rows = [metr(BL.count(mod, hd, math.radians(r), math.radians(p), 0.0, f)) for r in ROLLS for p in PITCHES for f in PH]
    av = [[metr(BL.count(mod, hd, math.radians(r), math.radians(p), y, f)) for f in PH] for (r, p, y) in BL.AV6]
    res[hd] = {}
    for m in rows[0]:
        g = np.array([x[m] for x in rows])
        res[hd][m] = dict(min=int(g.min()), max=int(g.max()), hist={int(k): int(v) for k, v in zip(*np.unique(g, return_counts=True))},
                          av6=[(min(x[m] for x in a), max(x[m] for x in a)) for a in av])
    print(f'{var} · {hd:3d}° · ' + ' · '.join(f'{m} {v["min"]}–{v["max"]} {v["hist"]} (a-v6 {v["av6"]})' for m, v in res[hd].items()), flush=True)
json.dump(dict(variante=var, msaa4=True, res=res), open(outj, 'w'), indent=1)

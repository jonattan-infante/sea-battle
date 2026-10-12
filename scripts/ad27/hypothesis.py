# Hipótesis de "repetida y procedural" (QA-REPORT-3) medida sobre las capturas: (a) filas periódicas ancladas a la
# cresta de la ola dominante de 23 m; (b) densidad uniforme en todo el mar; (c) bordes duros por el step() del ruido.
# Uso: python3 hypothesis.py qa-artifacts/render/ad27
import sys, glob, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ad27 import load, lstar, metrics
from oceanmodel import load_meta, world_grid

def analyse(L, meta):
    med = np.median(L); foam = L >= med + 10
    X, Z = world_grid(meta)
    xs, zs = X[foam].astype(float), Z[foam].astype(float)
    t = meta['time']
    R = []
    for (dx, dz, k, w) in meta['waves']:
        ph = k * (dx * xs + dz * zs) - w * t
        R.append(abs(np.mean(np.exp(1j * ph))))
    # Control: mismas cantidades de píxeles al azar en el cuadro
    rng = np.random.default_rng(0); idx = rng.integers(0, X.size, xs.size)
    dx, dz, k, w = meta['waves'][0]
    R0 = abs(np.mean(np.exp(1j * (k * (dx * X.ravel()[idx] + dz * Z.ravel()[idx]) - w * t))))
    # Bordes: salto de L* entre cada píxel de espuma y su vecino sin espuma (4 vecinos)
    jumps = []
    for sy, sx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb = np.roll(np.roll(L, sy, 0), sx, 1); nf = np.roll(np.roll(foam, sy, 0), sx, 1)
        e = foam & ~nf
        jumps.append((L - nb)[e])
    jumps = np.concatenate(jumps)
    return R, R0, jumps

if __name__ == "__main__":
    for png in sorted(glob.glob(sys.argv[1] + '/*.png')):
        meta = load_meta(png[:-4] + '.json'); rgb = load(png); L = lstar(rgb)
        R, R0, j = analyse(L, meta); m = metrics(rgb)
        print(f"{os.path.basename(png):12s} (a) R fase ola 23/13/7,5/3,8 m: {R[0]:.2f}/{R[1]:.2f}/{R[2]:.2f}/{R[3]:.2f} (azar {R0:.2f}) · (b) celdas sin espuma {m['empty_cells_pct']:.0f} %, CV {m['cell_cv']:.2f} · (c) salto de L* en el borde: mediana {np.median(j):.1f}, ≥ 10 en el {np.mean(j >= 10)*100:.0f} %")

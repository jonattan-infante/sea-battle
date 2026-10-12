# Periodicidad de la espuma en capturas reales (causa a; vigilancia de D42): R23 y el control R⊥ de predict_full.py
# Uso: python3 periodicity.py qa-artifacts/render/ad27 [más carpetas]
import sys, glob, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ad27 import load, lstar
from oceanmodel import load_meta, world_grid
from predict_full import periodicity

if __name__ == '__main__':
    for d in sys.argv[1:]:
        rs = []
        for png in sorted(glob.glob(d + '/*.png')):
            meta = load_meta(png[:-4] + '.json'); L = lstar(load(png)); X, Z = world_grid(meta)
            rs.append(periodicity(meta, X, Z, meta['time'], L >= np.median(L) + 10))
        r, rp = np.array([a for a, _ in rs]), np.array([b for _, b in rs])
        print(f"{d}: R23 {np.nanmin(r):.2f}–{np.nanmax(r):.2f} (mediana {np.nanmedian(r):.2f}) · R⊥ {np.nanmin(rp):.2f}–{np.nanmax(rp):.2f} (mediana {np.nanmedian(rp):.2f}) · {len(rs)} capturas")

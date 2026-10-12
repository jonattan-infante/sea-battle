# Validación del modelo (oceanmodel.py) contra capturas reales: cada captura se sintetiza solo con sus metadatos y se
# compara píxel a píxel (|ΔL*|), en la máscara de espuma (IoU) y con la métrica AD-27.
# Uso: python3 validate_full.py qa-artifacts/render/ad27 [más carpetas]
import sys, glob, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ad27 import load, lstar, metrics
from oceanmodel import load_meta, world_grid, crest_of, render

def ok3(m):
    return (0.3 <= m['coverage_pct'] <= 1.2) and m['empty_cells_pct'] >= 40 and m['dL_median'] <= 20

if __name__ == '__main__':
    rows = {}
    for d in sys.argv[1:]:
        for png in sorted(glob.glob(d + '/*.png')):
            meta = load_meta(png[:-4] + '.json'); rgb = load(png); X, Z = world_grid(meta)
            syn = render(meta, X, Z, meta['time'], crest_of(meta, X, Z))
            L, Ls = lstar(rgb), lstar(syn)
            e = np.abs(Ls - L)
            meas, pred = L >= np.median(L) + 10, Ls >= np.median(Ls) + 10
            iou = (meas & pred).sum() / max((meas | pred).sum(), 1)
            mm, mp = metrics(rgb), metrics(syn)
            name = os.path.basename(png)[:-4]
            var = name.rsplit('-', 2)[0] if name.count('-') > 1 else os.path.basename(os.path.normpath(d))
            rows.setdefault(var, []).append((mm, mp, iou))
            print(f"{name:10s} |ΔL*| píxel: mediana {np.median(e):.2f} · p99 {np.percentile(e, 99):.2f} | medida/modelo: cob {mm['coverage_pct']:4.2f}/{mp['coverage_pct']:4.2f} % · "
                  f"vacías {mm['empty_cells_pct']:5.1f}/{mp['empty_cells_pct']:5.1f} % · ΔL* {mm['dL_median']:4.1f}/{mp['dL_median']:4.1f} | IoU {iou:.3f}")
    for var, rs in rows.items():
        d = lambda k: max(abs(m[k] - p[k]) for m, p, _ in rs)
        print(f"{var}: IoU {min(i for *_, i in rs):.3f}–{max(i for *_, i in rs):.3f} · pasan las tres {sum(ok3(m) for m, _, _ in rs)}/{len(rs)} medidas, "
              f"{sum(ok3(p) for _, p, _ in rs)}/{len(rs)} modelo · error máx |cob| {d('coverage_pct'):.3f} pp · |vacías| {d('empty_cells_pct'):.1f} pp · |ΔL*| {d('dL_median'):.2f}")

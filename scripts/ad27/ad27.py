# Métrica AD-27 (ART-DIRECTION §18, D42): espuma = píxeles de agua con L* ≥ mediana + 10; celdas de 240×110 px con
# ≥ 85 % de agua. Por vista: cobertura (%), celdas sin espuma (< 0,1 %) y mediana de ΔL* de la espuma. Es la misma
# métrica que aserta e2e/ocean-foam.spec.ts. Uso: python3 ad27.py 'qa-artifacts/render/ad27/*.png'
import sys, glob, os, json
import numpy as np
from PIL import Image

def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def lstar(rgb):  # rgb sRGB en [0, 1]
    lin = srgb_to_lin(rgb)
    Y = lin @ np.array([0.2126, 0.7152, 0.0722])
    f = np.where(Y > 0.008856, np.cbrt(Y), 7.787 * Y + 16 / 116)
    return 116 * f - 16

def water_mask(rgb):
    r, b = rgb[..., 0], rgb[..., 2]
    return b >= r  # agua (azul) y espuma azulada; en las capturas de solo océano es todo el cuadro

def metrics(rgb, cell=(240, 110)):
    L = lstar(rgb)
    w = water_mask(rgb)
    med = np.median(L[w])
    foam = w & (L >= med + 10)
    H, W = L.shape
    cov = []
    for y in range(0, H - cell[1] + 1, cell[1]):
        for x in range(0, W - cell[0] + 1, cell[0]):
            cw = w[y:y + cell[1], x:x + cell[0]]
            if cw.mean() >= 0.85:
                cov.append(foam[y:y + cell[1], x:x + cell[0]].sum() / cw.sum())
    cov = np.array(cov)
    dl = L[foam] - med
    return {
        'coverage_pct': 100 * foam.sum() / w.sum(),
        'empty_cells_pct': 100 * (cov < 0.001).mean(),
        'cells': int(len(cov)),
        'dL_median': float(np.median(dl)) if dl.size else 0.0,
        'cell_cv': float(cov.std() / cov.mean()) if cov.mean() > 0 else 0.0,
        'water_L_median': float(med)
    }

def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(float) / 255

if __name__ == '__main__':
    files = sorted(sum((glob.glob(a) for a in sys.argv[1:]), []))
    rows = []
    for f in files:
        m = metrics(load(f))
        rows.append(m)
        print(f"{os.path.basename(f):14s} cobertura {m['coverage_pct']:5.2f} % · celdas sin espuma {m['empty_cells_pct']:5.1f} % ({m['cells']}) · ΔL* mediana {m['dL_median']:5.1f} · CV celdas {m['cell_cv']:.2f} · L* agua {m['water_L_median']:.1f}")
    if rows:
        k = lambda key: [r[key] for r in rows]
        print(f"RANGO          cobertura {min(k('coverage_pct')):.2f}–{max(k('coverage_pct')):.2f} % · celdas sin espuma {min(k('empty_cells_pct')):.0f}–{max(k('empty_cells_pct')):.0f} % · ΔL* {min(k('dL_median')):.1f}–{max(k('dL_median')):.1f}")
        med = {key: float(np.median(k(key))) for key in ('coverage_pct', 'empty_cells_pct', 'dL_median')}
        ok_med = 0.3 <= med['coverage_pct'] <= 1.2 and med['empty_cells_pct'] >= 40 and med['dL_median'] <= 20
        ok_guard = all(r['coverage_pct'] <= 2.0 and r['empty_cells_pct'] >= 25 and r['dL_median'] <= 22 for r in rows)
        print(f"MEDIANA        cobertura {med['coverage_pct']:.2f} % · celdas sin espuma {med['empty_cells_pct']:.1f} % · ΔL* {med['dL_median']:.1f} → "
              f"{'pasa' if ok_med else 'falla'} (0,3–1,2 % · ≥ 40 % · ≤ 20); guardas por vista (≤ 2,0 % · ≥ 25 % · ≤ 22): {'pasan' if ok_guard else 'fallan'}")

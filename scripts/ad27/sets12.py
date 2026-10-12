# AD-27 según D42 sobre conjuntos de 12 vistas del modelo: mediana de las 12 (cobertura 0,3–1,2 %, ≥ 40 % de celdas
# vacías, ΔL* ≤ 20, R23 ≤ 0,40) + guardas por vista (cobertura ≤ 2,0 %, ≥ 25 % de celdas vacías, ΔL* ≤ 22 y, con
# ≥ 0,3 % de cobertura, R23 ≤ 0,70). 300 vistas y 20 000 conjuntos al azar con reposición.
# Uso: python3 sets12.py qa-artifacts/render/ad27/A-t10.json [clave=valor ...]
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from predict_full import run
if __name__ == '__main__':  # spawn de macOS: sin esto cada proceso hijo relanza el cálculo
    params = {k: float(v) for k, v in (a.split('=') for a in sys.argv[2:])}
    rs = run(sys.argv[1], params, n=300, seed=11)
    a = lambda k: np.array([r[k] for r in rs])
    cov, emp, dl, R = a('coverage_pct'), a('empty_cells_pct'), a('dL_median'), a('R23')
    guard = (cov <= 2.0) & (emp >= 25) & (dl <= 22) & ((cov < 0.3) | (R <= 0.7))
    one = (cov >= 0.3) & (cov <= 1.2) & (emp >= 40) & (dl <= 20)
    rng = np.random.default_rng(0); okm = ok = 0; N = 20000
    for _ in range(N):
        i = rng.integers(0, len(rs), 12)
        m = (0.3 <= np.median(cov[i]) <= 1.2) and np.median(emp[i]) >= 40 and np.median(dl[i]) <= 20 and np.nanmedian(R[i]) <= 0.4
        okm += m; ok += m and guard[i].all()
    print(f"{params}: una vista pasa las tres {one.mean()*100:.0f} % · guardas por vista {guard.mean()*100:.1f} % · máx cobertura {cov.max():.2f} %, "
          f"mín celdas vacías {emp.min():.1f} %, máx ΔL* {dl.max():.1f} | conjuntos de 12: pasa la mediana {okm/N*100:.1f} %, mediana + guardas {ok/N*100:.1f} %")

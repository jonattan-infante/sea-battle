# Predicción con el modelo validado: N vistas al azar de mar abierto, sintetizadas píxel a píxel con la proyección de una
# captura a 1,0×. Métrica AD-27 por vista + periodicidad (causa a de QA-REPORT-3; criterio de AD-27 desde D42):
#   R23 = |media de e^{iφ}| de la fase de la ola de 23 m en los píxeles de espuma (1 = siempre en la misma fase)
#   R⊥  = lo mismo con una onda de 23 m perpendicular: control con la misma forma de manchas, da el ruido de fondo
# Uso: python3 predict_full.py qa-artifacts/render/ad27/A-t10.json [clave=valor ...]   (parámetros de oceanmodel.crest)
#   Sin argumentos, §7.3 (D42). D23 tal cual: h_lo=0.75 racha_scale=70 racha_lo=0.55 strength=0.25 warp=0 · k1 sin desplazar: warp=0
import sys, os
import numpy as np
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ad27 import lstar, metrics
from oceanmodel import load_meta, world_grid, crest, render

ISLANDS = [(0, 0, 30), (260, 200, 45), (-300, 170, 35), (-220, -280, 55), (250, -260, 40), (20, 360, 30), (-410, -30, 28)]  # src/game/constants.ts

def view_ok(cx, cz, hx=116.2, hz=88.7):
    # Mar abierto: sin el borde del mapa, la zona segura (110 m + 8) ni islas a menos de 18 m (agua somera) en el cuadro
    if max(abs(cx) + hx, abs(cz) + hz) > 490: return False
    if np.hypot(np.clip(0, cx - hx, cx + hx), np.clip(0, cz - hz, cz + hz)) < 118: return False
    return all(np.hypot(np.clip(ix, cx - hx, cx + hx) - ix, np.clip(iz, cz - hz, cz + hz) - iz) >= r + 18 for ix, iz, r in ISLANDS)

def views(n, seed):
    rng = np.random.default_rng(seed); out = []
    while len(out) < n:
        cx, cz = rng.uniform(-380, 380, 2)
        if view_ok(cx, cz): out.append((float(cx), float(cz), float(rng.uniform(0, 600))))
    return out

def periodicity(meta, X, Z, t, foam):
    if not foam.any(): return float('nan'), float('nan')
    dx, dz, k, w = meta['waves'][0]
    xs, zs = X[foam].astype(float), Z[foam].astype(float)
    return (float(abs(np.mean(np.exp(1j * (k * (dx * xs + dz * zs) - w * t))))),
            float(abs(np.mean(np.exp(1j * (k * (-dz * xs + dx * zs)))))))

def one(args):
    meta_path, params, (cx, cz, t) = args
    meta = load_meta(meta_path); X, Z = world_grid(meta)
    sc = meta['spot']; X, Z = X + np.float32(cx - sc['x']), Z + np.float32(cz - sc['z'])
    img = render(meta, X, Z, t, crest(meta, X, Z, t, params))
    m = metrics(img)
    m['R23'], m['Rperp'] = periodicity(meta, X, Z, t, lstar(img) >= m['water_L_median'] + 10)
    return m

def run(meta_path, params, n=300, seed=7, procs=4):
    with Pool(procs) as pool:
        return pool.map(one, [(meta_path, params, v) for v in views(n, seed)])

def summary(rs):
    a = lambda k: np.array([r[k] for r in rs])
    cov, emp, dl, R, Rp = a('coverage_pct'), a('empty_cells_pct'), a('dL_median'), a('R23'), a('Rperp')
    ok = (cov >= 0.3) & (cov <= 1.2) & (emp >= 40) & (dl <= 20)
    p = lambda x: f"{np.nanpercentile(x,10):.2f}/{np.nanpercentile(x,50):.2f}/{np.nanpercentile(x,90):.2f}"
    return (f"una vista pasa las tres {ok.mean()*100:.0f} % | p10/p50/p90: cobertura {p(cov)} % (en rango {((cov>=0.3)&(cov<=1.2)).mean()*100:.0f} %) · "
            f"celdas vacías {p(emp)} % (≥ 40: {(emp>=40).mean()*100:.0f} %) · ΔL* {p(dl)} · R23 {p(R)} · R⊥ {p(Rp)}")

if __name__ == '__main__':  # spawn de macOS: sin esto cada proceso hijo relanza el cálculo
    params = {k: float(v) for k, v in (a.split('=') for a in sys.argv[2:])}
    print(params, '→', summary(run(sys.argv[1], params)))

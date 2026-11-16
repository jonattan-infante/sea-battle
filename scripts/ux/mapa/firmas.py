# Uso (desde la raíz del repo), tras islas.py y puerto_colonial.py: python3 -I scripts/ux/mapa/firmas.py
#   (con UX_PUERTO=puerto_isla, el puerto con forma de isla de D92: tras puerto_forma.py y puerto_isla.py)
#   →  imprime y escribe $UX_OUT/mapa/firmas-grises.json (con UX_PUERTO=puerto_isla, firmas-grises-puerto_isla.json)
# Firma en grises por arquetipo (ART-DIRECTION AD-39 c, AC-174) de las islas rediseñadas (D83), con el render por software
# de render_tex.py a 6,2 px/m y 55° (N1 a 1,0× en 1440×900): en la máscara de la isla y sus props (cobertura ≥ 0,5, sin agua
# ni espuma), las fracciones de píxeles claros (L* ≥ 75), medios (40 ≤ L* < 75) y oscuros (L* < 40). El centroide de un
# arquetipo es la media de sus formas. Pasa si cada forma está más cerca (L∞) del centroide de su arquetipo que del de
# cualquier otro, y si los centroides de dos arquetipos distintos difieren ≥ 0,15 en alguna fracción. Es un modelo del
# juego, no la captura de AD-39 (la hace QA en el juego). No corre en la CI.
import json, math, os, sys
sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here); sys.path.insert(0, os.path.join(here, '..', 'laminas'))
import rutas as RT
import numpy as np
from PIL import Image
import render_tex as RX
import circulos as CI

MAPA = os.path.join(RT.OUT, 'mapa'); PPM = 6.2; TH = 55
ARQ = {'PORT': 'puerto', 'I1': 'tropical', 'I5': 'tropical', 'I6': 'tropical', 'T1': 'tropical', 'T2': 'tropical',
       'I2': 'rocosa', 'I3': 'rocosa', 'I4': 'rocosa', 'E1a': 'escollos', 'E1b': 'escollos', 'E1c': 'escollos',
       'G1': 'cala', 'G2': 'cala', 'G3': 'cala', 'G4': 'cala'}   # los 5 arquetipos de D67 (el islote habitado es tropical)
# el puerto: 'puerto' (D82, el círculo de 30 m) o 'puerto_isla' (D92: la malla y el atlas de puerto_isla.py y los círculos de
# puerto_forma.py), como en presupuesto.py
PUERTO = os.environ.get('UX_PUERTO', 'puerto')
if PUERTO == 'puerto_isla':
    import puerto_forma as PF
    PF.use(os.environ.get('UX_PUERTO_VAR', 'v3'))
    _v = list(CI.ISLAS['PORT']); _v[4] = [(x, z, r) for _, x, z, r in PF.CIRCLES]; CI.ISLAS['PORT'] = tuple(_v)


def lstar(rgb):
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    Y = lin @ np.array([0.2126, 0.7152, 0.0722])
    return np.where(Y > 216 / 24389, 116 * np.cbrt(Y) - 16, Y * 24389 / 27)


def firma(iid):
    if iid == 'PORT':
        d = np.load(os.path.join(MAPA, f'{PUERTO}_lod0.npz')); at = 'atlas_puerto_isla.png' if PUERTO == 'puerto_isla' else 'atlas_puerto.png'
    else:
        d = np.load(os.path.join(MAPA, f'isla_{iid}_lod0.npz')); at = 'atlas_isla.png'
    atlas = RX.srgb2lin(np.asarray(Image.open(os.path.join(MAPA, at)).convert('RGB'), float))
    P, U, C, _ = RX.clip_below_water(d['p'], d['t'], d['c'])
    cs = CI.ISLAS[iid][4]
    x0, x1 = min(c[0] - c[2] for c in cs), max(c[0] + c[2] for c in cs); z0, z1 = min(c[1] - c[2] for c in cs), max(c[1] + c[2] for c in cs)
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2; m = 6
    W = int((x1 - x0 + 2 * m) * PPM); H = int(((z1 - z0 + 2 * m) * math.sin(math.radians(TH)) + 20 * math.cos(math.radians(TH))) * PPM)
    oy = H - ((z1 - z0) / 2 + m) * math.sin(math.radians(TH)) * PPM
    col, cov = RX.render(P - np.array([cx, 0, cz]), U, C, atlas, PPM, W, H, W / 2, oy, TH, SS=2)
    msk = cov >= 0.5
    L = lstar(np.clip(col[msk] / cov[msk][:, None], 0, 1))
    n = len(L)
    return [round(float((L >= 75).sum() / n), 3), round(float(((L >= 40) & (L < 75)).sum() / n), 3), round(float((L < 40).sum() / n), 3)]


if __name__ == '__main__':
    F = {i: firma(i) for i in ARQ}
    cen = {a: np.mean([F[i] for i in ARQ if ARQ[i] == a], axis=0) for a in set(ARQ.values())}
    res = {'firmas_claro_medio_oscuro': F, 'centroides': {a: [round(float(v), 3) for v in c] for a, c in cen.items()}, 'fallos': []}
    for i, f in F.items():
        dist = {a: float(np.abs(np.array(f) - c).max()) for a, c in cen.items()}
        best = min(dist, key=dist.get)
        if best != ARQ[i]: res['fallos'].append(f'{i} ({ARQ[i]}) más cerca de {best}: {dist[best]:.3f} frente a {dist[ARQ[i]]:.3f}')
    names = sorted(cen); pares = {}
    for k, a in enumerate(names):
        for b in names[k + 1:]:
            g = float(np.abs(cen[a] - cen[b]).max()); pares[f'{a}–{b}'] = round(g, 3)
            if g < 0.15: res['fallos'].append(f'centroides {a}–{b}: {g:.3f} < 0,15')
    res['pares_centroides_Linf'] = pares
    json.dump(res, open(os.path.join(MAPA, 'firmas-grises.json' if PUERTO == 'puerto' else f'firmas-grises-{PUERTO}.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(res, ensure_ascii=False, indent=1))

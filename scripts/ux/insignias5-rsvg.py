# D74: contraste del raster de insignias5.py con otro rasterizador, librsvg (`rsvg-convert`), sobre el SVG de
# calibracion/insignias-1-1.json: |dL*| por píxel y la métrica b1 de AD-40 con los raster de librsvg.
# Falla (exit 1) si algún píxel se separa > 8 de L* o algún par de b1 baja de 20 px CSS.
# Uso: python3 -I scripts/ux/insignias5-rsvg.py   (necesita rsvg-convert en el PATH; tarda ~20 s)
import sys, os, io, json, runpy, subprocess, tempfile, itertools
sys.dont_write_bytecode = True  # sin __pycache__ en el repo
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
tmp = tempfile.mkdtemp()
sys.argv = ['insignias5.py', os.path.join(tmp, 'hoja.png')]
ns = runpy.run_path(os.path.join(HERE, 'insignias5.py'), run_name='insignias5')
lin, enc, Lstar, cvd, BGS, MODES, SS = (ns[k] for k in ('lin', 'enc', 'Lstar', 'cvd', 'BGS', 'MODES', 'SS'))
def rsvg(svg, dpr, bg):
    n = int(round(12 * dpr)) * SS; hexbg = '#%02X%02X%02X' % tuple(int(round(c * 255)) for c in bg)
    png = subprocess.run(['rsvg-convert', '-w', str(n), '-h', str(n), '-b', hexbg], input=svg.encode(), capture_output=True, check=True).stdout
    a = lin(np.asarray(Image.open(io.BytesIO(png)).convert('RGB'), dtype=np.float64) / 255.0); h = n // SS
    return enc(a.reshape(h, SS, h, SS, 3).mean(axis=(1, 3)))
js = json.load(open(os.path.join(HERE, 'calibracion', 'insignias-1-1.json')))['insignias']
R = {(r, dpr, bgn): rsvg(v['svg'], dpr, bg) for r, v in js.items() for dpr in (1, 1.5, 2) for bgn, bg in BGS.items()}
print('rsvg-convert:', subprocess.run(['rsvg-convert', '--version'], capture_output=True, text=True).stdout.split('\n')[0])
print('|dL*| por píxel, modelo frente a librsvg (peor de 3 DPR y 2 fondos):')
dmax = 0
for r, v in js.items():
    d = [np.abs(Lstar(ns['badge'](v['codigo'], dpr, BGS[bgn])) - Lstar(R[(r, dpr, bgn)])) for dpr in (1, 1.5, 2) for bgn in BGS]
    m = max(x.max() for x in d); dmax = max(dmax, m)
    print(f'  {r}: máx {m:.2f} · media {max(x.mean() for x in d):.2f}')
def Lm(img, mode): return Lstar(img if mode == 'gris' else cvd(img, mode))
pairs = {}
for a, b in itertools.combinations(js, 2):
    pairs[f'{a}–{b}'] = min((np.abs(Lm(R[(a, dpr, bgn)], mode) - Lm(R[(b, dpr, bgn)], mode)) >= 20).sum() / dpr ** 2 for dpr in (1, 1.5, 2) for bgn in BGS for mode in MODES)
print('AD-40 b1 con los raster de librsvg (px CSS con |dL*|>=20, peor caso):', ' · '.join(f'{k} {v:.0f}' for k, v in pairs.items()))
fails = (['píxel > 8 de L*'] if dmax > 8 else []) + [k for k, v in pairs.items() if v < 20]
print('FALLOS:', fails or 'ninguno')
os.remove(os.path.join(tmp, 'hoja.png')); os.rmdir(tmp)
sys.exit(1 if fails else 0)

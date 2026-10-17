# Paleta de ART-DIRECTION §4.5: Machado 2009 (severidad 1,0), WCAG 2.x y ΔE76. Uso: python3 -I scripts/ux/pal.py
# (reproduce las cifras publicadas antes de medir nada nuevo). Lo importa insignias5.py.
import numpy as np
M = {
 'protan': np.array([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]),
 'deutan': np.array([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]),
 'tritan': np.array([[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]),
}
def hx(h):
    h = h.lstrip('#'); return np.array([int(h[i:i+2], 16) for i in (0, 2, 4)]) / 255.0
def lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def enc(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)
def lab(c):
    l = lin(c); X = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]) @ l
    w = np.array([0.95047, 1.0, 1.08883]); t = X / w
    f = np.where(t > (6/29) ** 3, np.cbrt(t), t / (3 * (6/29) ** 2) + 4/29)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])
def sim(c, k): return enc(M[k] @ lin(c)) if k != 'normal' else c
def dE(a, b, k='normal'): return float(np.linalg.norm(lab(sim(hx(a), k)) - lab(sim(hx(b), k))))
def Y(c): return float(np.array([0.2126, 0.7152, 0.0722]) @ lin(c))
def cr(a, b):
    ya, yb = Y(hx(a) if isinstance(a, str) else a), Y(hx(b) if isinstance(b, str) else b); hi, lo = max(ya, yb), min(ya, yb); return (hi + 0.05) / (lo + 0.05)
def over(fg_rgb, a, bg):  # composición sRGB como el navegador
    return enc(lin(np.array(fg_rgb) / 255.0) * 0 + 0) if False else (np.array(fg_rgb) / 255.0) * a + hx(bg) * (1 - a)
def L(h): return float(lab(hx(h))[0])
if __name__ == '__main__':
    print('Pirata-Propio', [round(dE('#FF7A7A', '#FFD166', k)) for k in ('protan', 'deutan', 'tritan')], 'doc 51/33/44')
    print('Pirata-Jugador', [round(dE('#FF7A7A', '#F5F1E6', k)) for k in ('protan', 'deutan', 'tritan')], 'doc 35/34/68')
    print('Propio-Jugador', [round(dE('#FFD166', '#F5F1E6', k)) for k in ('protan', 'deutan', 'tritan')], 'doc 55/53/24')
    plate_ocean = over((6, 17, 26), 0.85, '#1A5F86'); plate_sand = over((6, 17, 26), 0.85, '#E6CF9A'); plate_foam = over((6, 17, 26), 0.85, '#EAF6FA')
    print('Propio sobre placa', [round(cr('#FFD166', p), 1) for p in (plate_ocean, plate_sand, plate_foam)], 'doc 12,0/9,6/8,9')
    print('Pirata sobre placa', [round(cr('#FF7A7A', p), 1) for p in (plate_ocean, plate_sand, plate_foam)], 'doc 6,8/5,5/5,1')
    print('Lstar ocean', round(L('#1A5F86'), 1), 'sand', round(L('#E6CF9A'), 1), 'shallow', round(L('#2C93A8'), 1), 'shore', round(L('#49B9BE'), 1))

# ux · AC-192 (f), punto 3 (BACKLOG :348): el veredicto de una lámina redibujada frente a la aprobada, con las vistas en
# cajas fijas leídas de un JSON (cajas-<lámina>.json: las cajas, sacadas de las constantes de maquetación del script de la
# lámina en su commit, con la ruta:línea de cada constante). Es veredicto_lamina.py (228ce1a4, el de RG1, que aceptaron el
# lead y producto) con las cajas fuera del código; la definición de silueta, el fondo, el ΔE76 y los umbrales son el mismo
# código, copiado tal cual. Solo lee 2 PNG y el JSON.
# 1. Si son idénticas (bytes o píxeles): PASA, y no hace falta más.
# 2. Si no, vista a vista, en las cajas del JSON (no se buscan en la imagen nueva):
#    - La vista tiene que estar en su caja en las 2 láminas: el anillo de 1 px de fuera, todo papel (245, 241, 230), y el
#      borde de dentro, sin papel. Si no, cambió el encuadre: NO PASA.
#    - Fondo: los píxeles con color de mar (26, 95, 134) o de cielo (226, 234, 239) bajo cualquier sombra de 0 a 45 % en
#      lineal, o su gris de convert('L'), ±1 por canal, unidos al borde de la vista (4 vecinos). Barco: todo lo demás.
#    - Silueta: se toleran 0 píxeles de silueta distinta. Un píxel es de silueta distinta si es fondo en una lámina y barco
#      en la otra y, además, su ΔE76 entre las 2 pasa de 2,3.
#    - Color: ΔE76 (sRGB → Lab D65) medio ≤ 1,0 sobre la unión de los píxeles del barco de las 2, en cada vista.
# Uso: python3 -I veredicto_cajas.py <nueva.png> <aprobada.png> <cajas.json>
#      → «VISTA …» por vista y «VEREDICTO PASA|NO PASA»; sale con 0 si pasa y con 2 si no.
import sys, os, hashlib, json
import numpy as np
from PIL import Image

PAPER = np.array([245, 241, 230]); SEA = np.array([26, 95, 134.0]); SKY = np.array([226, 234, 239.0])
DE_MAX = 1.0; JND = 2.3; TOL_SILUETA = 0
def srgb2lin(a): a = a / 255.0; return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
def lin2srgb(a): return np.where(a <= 0.0031308, 12.92 * a, 1.055 * np.power(np.clip(a, 0, None), 1 / 2.4) - 0.055)


def lab(x):
    c = srgb2lin(x)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T
    xyz /= np.array([0.95047, 1.0, 1.08883]); f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def bg_lut():
    f = np.linspace(0.55, 1.0, 9001)[:, None]
    col = np.concatenate([np.round(255 * lin2srgb(srgb2lin(c)[None, :] * f)) for c in (SEA, SKY)]).astype(int)
    col = np.unique(np.clip(col, 0, 255), axis=0)
    g = np.unique((col @ np.array([299, 587, 114]) + 500) // 1000)  # convert('L') de PIL, ITU-R 601-2
    lut = np.zeros((256, 256, 256), bool)
    for c in list(col) + [np.array([v, v, v]) for v in g]:
        lo, hi = np.clip(c - 1, 0, 255), np.clip(c + 1, 0, 255)
        lut[lo[0]:hi[0] + 1, lo[1]:hi[1] + 1, lo[2]:hi[2] + 1] = True
    return lut


def exterior(f):
    """Los píxeles de fondo `f` unidos al borde, por relleno con 4 vecinos."""
    e = np.zeros_like(f); e[0], e[-1], e[:, 0], e[:, -1] = f[0], f[-1], f[:, 0], f[:, -1]
    while True:
        g = e.copy(); g[1:] |= e[:-1]; g[:-1] |= e[1:]; g[:, 1:] |= e[:, :-1]; g[:, :-1] |= e[:, 1:]; g &= f
        if (g == e).all(): return e
        e = g


def en_su_caja(img, x, y, w, h):
    H, W = img.shape[:2]
    if x < 1 or y < 1 or x + w + 1 > W or y + h + 1 > H: return False
    ring = np.concatenate([img[y - 1, x - 1:x + w + 1], img[y + h, x - 1:x + w + 1], img[y:y + h, x - 1], img[y:y + h, x + w]])
    inner = np.concatenate([img[y, x:x + w], img[y + h - 1, x:x + w], img[y:y + h, x], img[y:y + h, x + w - 1]])
    return bool((ring == PAPER).all(-1).all() and not (inner == PAPER).all(-1).any())


a_p, b_p = sys.argv[1], sys.argv[2]; CJ = json.load(open(sys.argv[3])); BOXES = [tuple(b) for b in CJ['cajas']]
ha, hb = (hashlib.sha256(open(p, 'rb').read()).hexdigest() for p in (a_p, b_p))
if ha == hb: print('VEREDICTO PASA · idéntica (mismos bytes)', ha[:8]); sys.exit(0)
A = np.asarray(Image.open(a_p).convert('RGB')).astype(int); B = np.asarray(Image.open(b_p).convert('RGB')).astype(int)
if A.shape == B.shape and (A == B).all(): print('VEREDICTO PASA · idéntica (mismos píxeles)', ha[:8], hb[:8]); sys.exit(0)
LUT = bg_lut(); ok = True; inside = np.zeros(B.shape[:2], bool)
print('VISTAS', len(BOXES), 'cajas fijas de', CJ['lamina'], '(', os.path.basename(sys.argv[3]), ') ·', A.shape[1::-1], 'frente a', B.shape[1::-1])
for i, (x, y, w, h) in enumerate(BOXES):
    ca, cb = en_su_caja(A, x, y, w, h), en_su_caja(B, x, y, w, h)
    if not (ca and cb):
        print(f'VISTA {i + 1} caja {(x, y, w, h)} · en su caja: nueva {ca}, aprobada {cb} · NO PASA (cambió el encuadre)'); ok = False; continue
    a, b = A[y:y + h, x:x + w], B[y:y + h, x:x + w]; inside[y:y + h, x:x + w] = True
    fa, fb = (exterior(LUT[v[..., 0], v[..., 1], v[..., 2]]) for v in (a, b))
    ship = ~fa | ~fb; e = np.linalg.norm(lab(a) - lab(b), axis=-1); flip = fa != fb; sil = int((flip & (e > JND)).sum())
    dm = float(e[ship].mean()) if ship.any() else 0.0; p = sil <= TOL_SILUETA and dm <= DE_MAX; ok &= p
    print(f'VISTA {i + 1} caja {(x, y, w, h)} · px distintos {int((a != b).any(-1).sum())} · silueta',
          'IGUAL' if sil <= TOL_SILUETA else f'DISTINTA ({sil} px)', f'({int(flip.sum())} px cambian de lado con ΔE76 ≤ {JND})' if flip.any() and not sil else '',
          f'· ΔE76 medio {dm:.3f} sobre {int(ship.sum())} px del barco (máx {float(e[ship].max()) if ship.any() else 0:.2f})', '· PASA' if p else '· NO PASA')
if A.shape == B.shape:
    print('   fuera de las vistas:', int(((A != B).any(-1) & ~inside).sum()), 'px distintos (texto y cifras)')
print('VEREDICTO', 'PASA' if ok else 'NO PASA', f'(silueta: ≤ {TOL_SILUETA} px distintos; ΔE76 medio ≤ {DE_MAX} en cada vista)'); sys.exit(0 if ok else 2)

# ux · AC-192 (f), punto 3: compara una lámina redibujada con la commiteada.
# Uso: python3 -I cmp_lamina.py <nueva.png> <vieja.png> [<diferencias.png>]
# Imprime una línea «CMP …»: IDENTICA (mismos bytes), MISMOS_PIXELES, o DISTINTA con el número de píxeles distintos, el ΔE76
# medio y el máximo sobre ellos (sRGB → Lab D65, como pal.py) y las cajas de las zonas distintas (celdas de 32 px unidas por
# filas), para separar después las vistas del barco del texto; con un 3.er argumento guarda el antes, el después y el mapa
# de ΔE76 (blanco = 0, rojo = 10 o más) uno al lado del otro. Si cambia el tamaño, lo dice y no compara. Sale con 0 si es
# IDENTICA o MISMOS_PIXELES y con 2 si no.
import sys, hashlib
import numpy as np
from PIL import Image

a_p, b_p = sys.argv[1], sys.argv[2]
ha, hb = (hashlib.sha256(open(p, 'rb').read()).hexdigest() for p in (a_p, b_p))
if ha == hb:
    print('CMP IDENTICA', ha); sys.exit(0)
A = np.asarray(Image.open(a_p).convert('RGB'), float); B = np.asarray(Image.open(b_p).convert('RGB'), float)
if A.shape != B.shape:
    print('CMP TAMANO_DISTINTO', A.shape[1::-1], B.shape[1::-1], ha[:8], hb[:8]); sys.exit(2)
if (A == B).all():
    print('CMP MISMOS_PIXELES', ha[:8], hb[:8]); sys.exit(0)


def lab(x):
    c = x / 255.0; c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T
    xyz /= np.array([0.95047, 1.0, 1.08883]); f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


d = (A != B).any(-1); e = np.linalg.norm(lab(A) - lab(B), axis=-1)
H, W = d.shape; G = 32; cells = d[:H // G * G, :W // G * G].reshape(H // G, G, W // G, G).any(axis=(1, 3))
boxes = []
for r in range(cells.shape[0]):
    cs = np.nonzero(cells[r])[0]
    if len(cs): boxes.append((int(cs.min()) * G, r * G, int(cs.max() + 1) * G, (r + 1) * G))
print('CMP DISTINTA', 'px', int(d.sum()), 'de', H * W, '· ΔE76 medio', round(float(e[d].mean()), 3), 'máx', round(float(e[d].max()), 2),
      '· p95', round(float(np.percentile(e[d], 95)), 2), '· filas de 32 px con cambios', len(boxes), '·', ha[:8], hb[:8])
for bx in boxes[:60]: print('   caja', bx)
if len(sys.argv) > 3:
    t = np.clip(e / 10.0, 0, 1)[..., None]; heat = (255 * (1 - t) + np.array([200., 30., 30.]) * t)
    Image.fromarray(np.hstack([B, A, heat]).astype(np.uint8)).save(sys.argv[3], optimize=True); print('   antes | después | ΔE76 →', sys.argv[3])
sys.exit(2)

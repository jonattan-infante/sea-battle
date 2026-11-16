# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/lamina_bomba.py
#   →  $UX_OUT/I2-capitan-canonera-bomba-1440x900.png y -390x844.png
# O-39 (BACKLOG): la placa de la Cañonera pirata lleva solo la calavera y la spec pide calavera + bomba (ART-DIRECTION §4.3
# y §11.1: 2 iconos de 12 px separados 2 px). Las capturas de la pieza «Capitán y Cañonera» (docs/game/art/I2-capitan-
# canonera-*.png, del juego de dev-npc sobre 871b998) se rehacen con la placa de 2 iconos, con las reglas de
# src/styles/world-overlays.css: .wo-plate__icon[data-icons="2"] de 26 px con 2 de separación, 3 hasta el nombre, padding
# 2 × 6 y borde de 1. La placa crece 14 px y sigue centrada en su ancla (translateX(-50%)), 7 px por lado. Su fondo
# (--ui-plate, α 0,85) es el de la captura: dentro de la placa vieja se rellena el hueco del contenido con el fondo de
# alrededor, y en las 2 franjas nuevas se compone sobre el mar. La calavera, el nombre y la barra son los píxeles de la
# captura, desplazados; la bomba es la de lucide-static 0.469.0 (ISC), en --rel-pirate. Las capturas de móvil van a DPR 2.
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import rutas as RT
import tienda as T
import numpy as np
from PIL import Image, ImageDraw

ART = os.path.join(RT.REPO, 'docs', 'game', 'art')
PLATE = np.array([6, 17, 26.0]); ALPHA = 0.85; PIRATE = '#FF7A7A'
BOMB = ('<circle cx="11" cy="13" r="9"/><path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95"/>'
        '<path d="m22 2-1.5 1.5"/>')
# captura, DPR y caja de la placa de la Cañonera (px físicos, medida por plate_box)
CASES = [('I2-capitan-canonera-1440x900.png', 1, (900, 300, 1040, 360)), ('I2-capitan-canonera-390x844.png', 2, (480, 700, 740, 800))]


def plate_box(a, roi):
    """Caja de la placa: filas y columnas con más de la mitad de píxeles oscuros (el fondo de la placa sobre el mar)."""
    x0, y0, x1, y1 = roi; dark = a[y0:y1, x0:x1].sum(axis=2) < 110
    cols = np.where(dark.mean(axis=0) > 0.5)[0]; rows = np.where(dark.mean(axis=1) > 0.5)[0]
    return x0 + cols[0], y0 + rows[0], x0 + cols[-1] + 1, y0 + rows[-1] + 1


def rounded(w, h, r, cl=0.0, cr=0.0, k=8):
    """Máscara de la placa en una caja de w × h px con 1 px de margen a cada lado; cl y cr son la parte cubierta de la
    columna de fuera a la izquierda y a la derecha (la placa no cae en px enteros: translateX(-50%) de un ancho fraccionario)."""
    m = Image.new('L', ((w + 2) * k, h * k), 0)
    ImageDraw.Draw(m).rounded_rectangle(((1 - cl) * k, 0, (w + 1 + cr) * k - 1, h * k - 1), r * k, fill=255)
    return np.asarray(m.resize((w + 2, h), Image.BOX), float) / 255


def rebuild(name, S, roi):
    a = np.asarray(Image.open(RT.need(os.path.join(ART, name), name)).convert('RGB'), float); out = a.copy()
    L, Tp, R, B = plate_box(a, roi); w, h = R - L, B - Tp; g = 7 * S
    assert h == 35 * S, (name, h)
    # 1. el fondo de la placa vieja sin contenido: el icono, el nombre, la barra y las esquinas redondeadas, que tras crecer
    #    quedan dentro, se rellenan difundiendo el fondo de alrededor (lo que se ve del mar pesa un 15 %)
    sub = a[Tp:B, L:R].copy(); hole = np.zeros((h, w), bool)
    hole[3 * S:19 * S, 7 * S:w - 7 * S] = True; hole[20 * S:32 * S, 7 * S:7 * S + 68 * S] = True   # fila del nombre y barra
    c = 4 * S + 1; hole[:c, :c] = hole[:c, -c:] = hole[-c:, :c] = hole[-c:, -c:] = True
    known = ~hole; sub[hole] = np.median(sub[known], axis=0)
    for _ in range(400):
        avg = (np.roll(sub, 1, 0) + np.roll(sub, -1, 0) + np.roll(sub, 1, 1) + np.roll(sub, -1, 1)) / 4
        sub[hole] = avg[hole]
    # 2. la placa nueva, 14 px más ancha y centrada: dentro de la vieja, su fondo; en las franjas, el fondo sobre el mar. Las
    #    columnas justo fuera de la vieja, en parte cubiertas, toman el mar de la siguiente; la nueva repite esa cobertura
    NL, NR = L - g, R + g; W = NR - NL; sea = a.copy(); sea[:, L - 1] = a[:, L - 2]; sea[:, R] = a[:, R + 1]
    cov = lambda c, s_: float(np.clip(((s_ - a[Tp + 8:B - 8, c]) / (s_ - sub[8:-8].mean((0, 1)))).mean(), 0, 1))
    cl, cr = cov(L - 1, a[Tp + 8:B - 8, L - 2]), cov(R, a[Tp + 8:B - 8, R + 1])
    body = PLATE * ALPHA + sea[Tp:B, NL - 1:NR + 1] * (1 - ALPHA); body[:, 1 + g:1 + g + w] = sub
    m = rounded(W, h, 4 * S, cl, cr)[..., None]
    out[Tp:B, NL - 1:NR + 1] = body * m + sea[Tp:B, NL - 1:NR + 1] * (1 - m)
    # 3. el contenido de la captura, desplazado: la calavera y la barra 7 px a la izquierda, el nombre 7 a la derecha
    row0, row1 = Tp + 3 * S, Tp + 19 * S
    out[row0:row1, L:L + 12 * S] = a[row0:row1, L + 7 * S:L + 19 * S]
    out[row0:row1, L + 29 * S:R + g - 7 * S] = a[row0:row1, L + 22 * S:R - 7 * S]
    out[Tp + 20 * S:Tp + 32 * S, L:L + 68 * S] = a[Tp + 20 * S:Tp + 32 * S, L + 7 * S:L + 75 * S]
    # 4. la bomba, a 2 px de la calavera, centrada en la fila de 16 px como el icono de la captura
    img = Image.fromarray(out.round().clip(0, 255).astype(np.uint8)).convert('RGBA')
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="2" '
           'stroke-linecap="round" stroke-linejoin="round">%s</svg>' % (PIRATE, BOMB))
    img.alpha_composite(T.raster(svg, 12 * S, 'o39-bomb'), (L + 14 * S, row0 + 2 * S))
    return img.convert('RGB'), dict(vieja=(int(L), int(Tp), int(R), int(B)), nueva=(int(NL), int(Tp), int(NR), int(B)),
                                    cobertura_bordes=(round(cl, 2), round(cr, 2)), ancho_css=round((W + cl + cr) / S, 2))


if __name__ == '__main__':
    for name, S, roi in CASES:
        img, info = rebuild(name, S, roi)
        dst = os.path.join(RT.OUT, name.replace('canonera-', 'canonera-bomba-')); img.save(dst, optimize=True)
        print(dst, info, 'máximo de D43:', 142 if S == 1 else 130)

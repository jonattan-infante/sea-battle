# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/niveles_acceso.py  →  $UX_OUT/D78-niveles-acceso.png
# Reproduce docs/game/art/D78-niveles-acceso.png (sha256 99b7f988…). Mismas dependencias que niveles.py.
# Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS (.next/static/media de un
# build de Next) y, si se indica abajo, el renderizador por software en UX_RENDERER. Escribe en UX_OUT, nunca en
# docs/game/art/: una lámina aprobada no se pisa; una versión nueva se copia allí a mano y con otro nombre. No corre en la CI.
# Cómo se abre la pantalla de niveles desde el HUD (AC-190 a, D78): el marco del bloque del icono, sobre capturas reales.
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
import niveles as N
DEV = N.DEV
PAPER = (245, 241, 230)
def frame_on(im, box, s, pressed=False):
    """box en px CSS (x, y, w, h); s = factor de la imagen. Marco de botón como .hud-mobile-btn: fondo oro al 12 % (22 %
    pulsado), borde de 1 px --ui-line (2 px --ui-gold pulsado), radio 10."""
    x, y, w, h = box; ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    b = (round(x * s), round(y * s), round((x + w) * s) - 1, round((y + h) * s) - 1)
    d.rounded_rectangle(b, round(10 * s), fill=(242, 193, 78, 56 if pressed else 31))
    d.rounded_rectangle(b, round(10 * s), outline=(242, 193, 78, 255) if pressed else (242, 193, 78, 89), width=round((2 if pressed else 1) * s))
    return Image.alpha_composite(im, ov)
def redraw_icon(im, src, box, s):
    """El icono y la insignia van encima del marco: se vuelven a pegar desde la captura sus píxeles (los que se alejan del
    fondo del panel), con un margen de 2 px alrededor del marco para incluir la insignia que asoma."""
    import numpy as np
    x, y, w, h = box; b = (round((x - 2) * s), round((y - 2) * s), round((x + w + 3) * s), round((y + h + 3) * s))
    o = np.asarray(src.crop(b)).astype(float); bg = np.median(np.concatenate([o[:3].reshape(-1, 4), o[-3:].reshape(-1, 4)]), axis=0)
    dist = np.abs(o[..., :3] - bg[:3]).sum(axis=2); a = np.clip((dist - 30) / 40, 0, 1)
    cur = np.asarray(im.crop(b)).astype(float); mix = cur * (1 - a[..., None]) + o * a[..., None]
    im = im.copy(); im.paste(Image.fromarray(mix.round().astype('uint8'), 'RGBA'), b[:2]); return im
# escritorio: captura a DPR 1, recorte del panel del jugador, ampliado ×2
desk = Image.open(DEV + '/desktop-open-sea.png').convert('RGBA').crop((0, 0, 340, 116))
z = 2
d0 = desk.resize((desk.width * z, desk.height * z), Image.LANCZOS)
# hover: marco alrededor del icono de 56 en (29, 29), inflado 3 px
icon = desk.crop((26, 26, 92, 92)).resize((66 * z, 66 * z), Image.LANCZOS)
d1 = redraw_icon(frame_on(d0.copy(), (26, 26, 62, 62), z), d0, (26, 26, 62, 62), z)
# el icono, encima del fondo del marco (mezcla: el marco es translúcido, así que basta con el compuesto)
dd = ImageDraw.Draw(d1)
f = N.ImageFont.truetype(N.FONT + N.FF[500], 13 * z, layout_engine=N.ImageFont.Layout.RAQM)
tip = 'Niveles e insignias (N)'; tw = f.getlength(tip)
tx, ty = 70 * z, 96 * z
dd.rounded_rectangle((tx, ty, tx + tw + 16 * z, ty + 26 * z), 4 * z, fill=(245, 241, 230), outline=(120, 120, 120))
dd.text((tx + 8 * z, ty + 4 * z), tip, font=f, fill=(43, 29, 14))
# subrayado de «Nivel 1» al pasar el ratón
dd.line(((264 * z, 97 * z), (299 * z, 97 * z)), fill=(169, 184, 194), width=z)
# móvil: captura a DPR 2, barra superior
mob = Image.open(DEV + '/mobile-open-sea.png').convert('RGBA').crop((0, 0, 780, 110))
m1 = redraw_icon(frame_on(mob.copy(), (5, 4.5, 42, 42), 2), mob, (5, 4.5, 42, 42), 2)
m2 = redraw_icon(frame_on(mob.copy(), (5, 4.5, 42, 42), 2, pressed=True), mob, (5, 4.5, 42, 42), 2)
W = 40 + max(d1.width * 2 + 40, mob.width * 2 + 40) + 40
H = 120 + d1.height + 90 + mob.height + 120
sheet = Image.new('RGBA', (W, H), PAPER + (255,)); cv = N.Canvas(sheet, 1)
cv.text(40, 24, 'Pantalla de niveles: cómo se abre desde el HUD', 28, 600, 'ink')
cv.text(40, 62, 'Escritorio: clic en la insignia o en el nivel del panel del jugador, o la tecla N. Móvil: un toque en el bloque del icono (52 × 52). Capturas reales del HUD de hoy, ampliadas.', 15, 500, 'soft')
y = 110
cv.text(40, y, 'Escritorio, normal', 16, 600, 'title'); cv.text(80 + d0.width, y, 'Escritorio, al pasar el ratón o con el foco del teclado', 16, 600, 'title')
cv.paste(d0, 40, y + 28); cv.paste(d1, 80 + d0.width, y + 28)
y += 28 + d0.height + 40
cv.text(40, y, 'Móvil 390 × 844: el bloque del icono lleva siempre un marco de botón', 16, 600, 'title'); cv.text(80 + mob.width, y, 'Móvil, al tocarlo', 16, 600, 'title')
cv.paste(m1, 40, y + 28); cv.paste(m2, 80 + mob.width, y + 28)
y += 28 + mob.height + 24
cv.text(40, y, 'El marco es el de los botones del HUD móvil: fondo dorado al 12 % (22 % al tocar) y borde de 1 px dorado al 35 % (2 px dorado al tocar), radio 10, 3 px', 14, 500, 'soft')
cv.text(40, y + 22, 'alrededor del icono de clase. La insignia sigue encima y asoma por la esquina. En escritorio, además, el aviso «Niveles e insignias (N)» y el nivel subrayado.', 14, 500, 'soft')
cv.img.convert('RGB').save(os.path.join(N.RT.OUT, 'D78-niveles-acceso.png')); print(cv.img.size)

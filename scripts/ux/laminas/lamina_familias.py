# Uso (desde la raíz del repo), después de la cadena de scripts/ux/barcos (navio.py, hoy_a_npz.py y los renders de
# blender_navio.py; ver su cabecera): python3 -I scripts/ux/laminas/lamina_familias.py
#   →  $UX_OUT/D80-familia-{britanica,espanola}.png
# Reproduce las láminas de D80 (sha256 da0d1c07… y 3c5a35bd…). Lee los renders y los GLB de $UX_OUT/piloto.
# Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS (.next/static/media de un
# build de Next) y, si se indica abajo, el renderizador por software en UX_RENDERER. Escribe en UX_OUT, nunca en
# docs/game/art/: una lámina aprobada no se pisa; una versión nueva se copia allí a mano y con otro nombre. No corre en la CI.
# Láminas de las familias de barcos (E17, AC-193 e; formato de AC-192 g): el Navío de línea de cada familia junto a la
# Fragata y el Navío de hoy, a la misma escala, en las 3 vistas de la lámina de barcos y de cerca.
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import rutas as RT
import numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.join(RT.OUT, 'piloto')
FONT = RT.FONTS
def font(px, w=600): return ImageFont.truetype(FONT + ({500: 'b0bb26939bb40fdb-s.p.woff2', 600: '60c9b95e8d9e49be-s.p.woff2'}[w]), px)
SEA = np.array([26, 95, 134.0]); SKY = np.array([226, 234, 239.0]); PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42)
def shot(fam, view, water_line=None):
    a = np.asarray(Image.open(os.path.join(HERE, f'render_{fam}_{view}.png')).convert('RGBA')).astype(float)
    rgb, al = a[..., :3], a[..., 3:] / 255
    H, W = al.shape[:2]
    if water_line is None: return rgb * al + SEA * (1 - al)
    back = np.empty((H, W, 3)); back[:water_line] = SKY; back[water_line:] = SEA
    img = rgb * al + back * (1 - al)
    k = 0.55; img[water_line:] = img[water_line:] * (1 - k * al[water_line:]) + SEA * k * al[water_line:]  # la obra viva, vista a través del agua
    return img
def paste(sheet, arr, x, y): sheet.paste(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)), (x, y))
glb = {f: os.path.getsize(os.path.join(HERE, f'ship_line_{f}.glb')) for f in ('es', 'gb')}
tris = {f: [len(np.load(os.path.join(HERE, f'navio_{f}_lod{l}.npz'))['p']) // 3 for l in (0, 1)] for f in ('es', 'gb')}
TXT = {
 'gb': ('Familia británica: el Navío de línea con más detalle (barco piloto)',
        ['Casco negro con franjas ocres a la altura de las portas y tapas negras: el «Nelson chequer» del HMS Victory.',
         'Popa sobria con 3 filas de ventanas, velas blancas y bandera blanca con la cruz roja.',
         'Propuesta: que sea la familia por defecto, porque es la más parecida a los barcos de hoy.'],
        ['El casco negro se acerca al del pirata. Lo separan las velas (blancas aquí, negras en el pirata) y las franjas (ocres aquí, rojas en el pirata).',
         'Se comprobará con la misma prueba de legibilidad de hoy, también en grises.']),
 'es': ('Familia española: el Navío de línea con más detalle (barco piloto)',
        ['Casco rojo con filetes dorados, castillo de popa alto en 3 pisos con galerías y tallas doradas.',
         'La cruz de Borgoña roja en el trinquete y la mayor, y la misma cruz en la bandera.',
         'Sigue siendo un «Navío de línea»: no es el Galeón del tesoro, que es un barco mercante.'],
        ['El rojo del casco se acerca al de la franja del pirata. Lo separan las velas claras y el dorado.',
         'Las tallas doradas son pintura en la textura: a tamaño de juego se leen como «dorado», no como relieve.'])}
COLS = [('hoyfrigate', 'Fragata (hoy)', '34 × 8,6 m'), ('hoyline', 'Navío de línea (la lámina anterior)', '42 × 11,2 m · nivel 9 · 12.000 oro'), (None, None, None)]
for fam in ('gb', 'es'):
    title, why, con = TXT[fam]
    cols = COLS[:2] + [(fam, 'Navío de línea ' + ('británico' if fam == 'gb' else 'español') + '  (NUEVO)', '42 × 11,2 m · nivel 9 · 12.000 oro')]
    W, HP, HT, HG, gap = 370, 262, 112, 236, 16
    CW, CH = 560, 340
    SW = max(40 + 3 * W + 2 * gap + 40, 40 + 2 * CW + gap + 40 + 380)
    sheet = Image.new('RGB', (SW, 1500), PAPER); d = ImageDraw.Draw(sheet)
    d.text((40, 22), title, font=font(30), fill=INK)
    d.text((40, 62), 'A la misma escala (6 px por metro), junto a la Fragata de hoy y al Navío de la lámina anterior. Render de Blender del modelo que irá al juego, con textura. El juego no cambia: misma eslora, mismos palos y mismas estadísticas.', font=font(16, 500), fill=SOFT)
    y = 110
    for rt, h in (('De lado (vista de tres cuartos, proa a la derecha)', HP), ('Desde arriba', HT), ('Como en el juego (cámara a 55°, rumbo 135°)', HG)):
        d.text((40, y), rt, font=font(18), fill=TITLE); y += 30 + h + 18
    for i, (key, name, sub) in enumerate(cols):
        x = 40 + i * (W + gap); yy = 140
        paste(sheet, shot(key, 'lado', water_line=HP - 34), x, yy); yy += HP + 18 + 30
        paste(sheet, shot(key, 'arriba'), x, yy); yy += HT + 18 + 30
        paste(sheet, shot(key, 'juego'), x, yy); yy += HG + 14
        d.text((x, yy), name, font=font(20), fill=INK); d.text((x, yy + 28), sub, font=font(15, 500), fill=SOFT)
        if key == fam:
            d.text((x, yy + 48), f'{tris[fam][0]:,} triángulos (antes 3.152) · modelo de {glb[fam] / 1000:.0f} KB'.replace(',', '.'), font=font(15, 500), fill=SOFT)
    yc = yy + 90
    d.text((40, yc), 'De cerca (11 px por metro): el de la lámina anterior y el nuevo', font=font(18), fill=TITLE)
    paste(sheet, shot('hoyline', 'cerca'), 40, yc + 30); paste(sheet, shot(fam, 'cerca'), 40 + CW + gap, yc + 30)
    d.text((40, yc + 30 + CH + 8), 'Lámina anterior (sin textura)', font=font(15), fill=SOFT); d.text((40 + CW + gap, yc + 30 + CH + 8), 'Nuevo', font=font(15), fill=SOFT)
    tx = 40 + 2 * CW + 2 * gap + 10; ty = yc + 34
    d.text((tx, ty), 'Qué la distingue', font=font(18), fill=TITLE); ty += 30
    def wrap(t, x, y, w, f, col):
        line = ''
        for wd in t.split():
            s = (line + ' ' + wd).strip()
            if d.textlength(s, font=f) > w: d.text((x, y), line, font=f, fill=col); y += 20; line = wd
            else: line = s
        d.text((x, y), line, font=f, fill=col); return y + 26
    for t in why: ty = wrap(t, tx, ty, SW - tx - 30, font(15, 500), INK)
    d.text((tx, ty + 4), 'En contra', font=font(18), fill=RED); ty += 34
    for t in con: ty = wrap(t, tx, ty, SW - tx - 30, font(15, 500), RED)
    d.text((tx, ty + 4), 'Lo que no cambia', font=font(18), fill=TITLE); ty += 34
    ty = wrap('3 palos, mesana latina, 2 filas de portas con 10 cañones por banda y 42 × 11,2 m: se sigue leyendo como Navío.', tx, ty, SW - tx - 30, font(15, 500), INK)
    bottom = max(yc + 30 + CH + 40, ty + 10)
    sheet = sheet.crop((0, 0, SW, bottom)); out = os.path.join(RT.OUT, f'D80-familia-{"britanica" if fam == "gb" else "espanola"}.png')
    sheet.save(out); print('hoja', os.path.abspath(out), sheet.size)

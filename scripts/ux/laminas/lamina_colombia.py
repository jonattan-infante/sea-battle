# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/lamina_colombia.py
#   →  $UX_OUT/D69-insignias-b-colombia.png y .svg (necesita $UX_OUT/_colombia.pkl de insignias_colombia.py)
# Reproduce docs/game/art/D69-insignias-b-colombia.png (sha256 436a1cac…).
# Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS (.next/static/media de un
# build de Next) y, si se indica abajo, el renderizador por software en UX_RENDERER. Escribe en UX_OUT, nunca en
# docs/game/art/: una lámina aprobada no se pisa; una versión nueva se copia allí a mano y con otro nombre. No corre en la CI.
# Lámina «B-Colombia» para Jonattan (AC-191, AC-192): la B que eligió y su rediseño con las hombreras de la Armada de
# Colombia, a 48, 24 y 12 px, en color y en grises, con la medida de AD-40 y lo que tiene en contra en palabras llanas.
import sys, os, io, contextlib, pickle
sys.argv = ['x']; sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import rutas as RT
with contextlib.redirect_stdout(io.StringIO()):
    import insignias_colombia as K
import numpy as np
from PIL import Image, ImageDraw, ImageFont
with contextlib.redirect_stdout(io.StringIO()):
    rb = K.search('B', [[K.B_make]] * 5, K.B_FIG)
rc = pickle.load(open(RT.need(os.path.join(RT.OUT, '_colombia.pkl'), '_colombia.pkl (insignias_colombia.py)'), 'rb'))['punta+recta']
def ncc_max(combo): return max(c[4][0] for c in combo)
ROWS = [('B · Galones (la que elegiste)', rb, 'Galones en V para la marinería y estrella para los oficiales, sobre un disco.', 'Su punto débil: la estrella también es el icono de tu barco en la placa y el minimapa; el rediseño la quita.'),
        ('B-Colombia · Hombreras (propuesta)', rc, 'Como las hombreras de la Armada de Colombia: la marinería, en hombrera de punta con galones rectos (1, 2 y 3); los oficiales, en hombrera recta con galones y el lazo. Sin anclas ni estrellas, que en el juego son iconos.',
         'En contra: la hombrera de punta recuerda un poco al escudo de «protegido» (parecido {ncc} de un máximo de 0,80).|Y el lazo, a 12 px, se ve como un punto con hueco; el anillo se ve a partir de 24 px.')]
FONT = RT.FONTS
def to_img(rgb): return Image.fromarray((np.clip(rgb, 0, 1) * 255).round().astype(np.uint8))
def gray(rgb):
    y = np.clip(K.Lstar(rgb), 0, 100); Yl = np.where(y > 8, ((y + 16) / 116) ** 3, y / 903.3); return np.repeat(K.ns['enc'](Yl)[..., None], 3, axis=2)
K.to_img, K.gray = to_img, gray
def font(px, w=600): return ImageFont.truetype(FONT + ({500: 'b0bb26939bb40fdb-s.p.woff2', 600: '60c9b95e8d9e49be-s.p.woff2'}[w]), px)
PLATE = K.BGS['oceano']
row_h = 262; sheet = Image.new('RGB', (1720, 120 + row_h * len(ROWS) + 150), (245, 241, 230)); d = ImageDraw.Draw(sheet)
d.text((40, 22), 'Insignias de rango: la B y su rediseño con las insignias de la Armada de Colombia', font=font(30), fill=(43, 29, 14))
d.text((40, 64), 'De izquierda a derecha: Grumete, Marinero, Contramaestre, Teniente y Almirante. Cada una a 48 px, a 24 px y a su tamaño real en la placa (12 px), en color y en grises, sobre la placa del juego.', font=font(16, 500), fill=(92, 74, 51))
for ri, (name, res, why, con) in enumerate(ROWS):
    (w, combo), prs = res
    y = 110 + ri * row_h
    d.text((40, y), name, font=font(22), fill=(43, 29, 14))
    d.text((40, y + 32), why, font=font(15, 500), fill=(92, 74, 51))
    n3 = ncc_max(combo)
    verdict = (f'A su tamaño en la placa (12 px): el par más parecido difiere en {w:.0f} px (mín. 20) · las marcas se ven · '
               f'parecido con los iconos del juego {n3:.2f} (máx. 0,80): PASA (regla AD-40)').replace('0.', '0,')
    d.text((40, y + 56), verdict, font=font(15), fill=(31, 111, 60))
    x = 40
    for k in range(5):
        els = combo[k][2][0]
        big = K.raster(els, 4, PLATE); mid = K.raster(els, 2, PLATE); one = K.raster(els, 1, PLATE)
        tile = Image.new('RGB', (150, 140), tuple(int(c * 255) for c in PLATE)); tile.paste(K.to_img(big), (6, 8)); tile.paste(K.to_img(mid), (62, 8)); tile.paste(K.to_img(one), (94, 8))
        tile.paste(K.to_img(K.gray(big)), (6, 64)); tile.paste(K.to_img(K.gray(mid)), (62, 64)); tile.paste(K.to_img(K.gray(one)), (94, 64))
        ImageDraw.Draw(tile).text((6, 118), K.NAMES[k], font=font(13), fill=(245, 241, 230))
        sheet.paste(tile, (x, y + 84)); x += 160
    strip = np.concatenate([K.raster(combo[k][2][0], 1, PLATE) for k in range(5)], axis=1)
    sheet.paste(K.to_img(strip).resize((60 * 5, 60), Image.NEAREST), (870, y + 90)); sheet.paste(K.to_img(K.gray(strip)).resize((60 * 5, 60), Image.NEAREST), (870, y + 156))
    d.text((1180, y + 108), 'a 12 px, ampliado ×5', font=font(13, 500), fill=(92, 74, 51)); d.text((1180, y + 172), 'lo mismo en grises', font=font(13, 500), fill=(92, 74, 51))
    for li, t in enumerate(con.format(ncc=f'{n3:.2f}'.replace('.', ',')).split('|')): d.text((870, y + 226 + 18 * li), t, font=font(13, 500), fill=(162, 59, 42))
yb = 110 + len(ROWS) * row_h + 24
notes = ['Cabe en la caja de 12 × 12 de hoy: no cambia ninguna medida del HUD, de las placas ni de la pantalla de niveles.',
         'Es «inspirada», no una copia: sin el águila, el escudo nacional ni otros emblemas. Las anclas y estrellas de las hombreras de suboficiales no van, porque el juego ya las usa como iconos.',
         'Medida con la misma regla de legibilidad que la de hoy (AD-40): 12 px, pantallas normales y de alta densidad, sobre agua y sobre arena, en grises y con 3 tipos de daltonismo.']
for i, t in enumerate(notes): d.text((40, yb + i * 24), t, font=font(15, 500), fill=(92, 74, 51))
out = os.path.join(RT.OUT, 'D69-insignias-b-colombia.png'); sheet.save(out); print('hoja', os.path.abspath(out), sheet.size)
def svg_el(t, a): return f'<{t} ' + ' '.join(f'{k}="{v:g}"' if isinstance(v, (int, float)) else f'{k}="{v}"' for k, v in a.items()) + '/>'
(w, combo), _ = rc
body = ''.join(f'<g transform="translate({16 + k * 64},16) scale(4)">' + ''.join(svg_el(t, a) for t, a in combo[k][2][0]) + '</g>' for k in range(5))
txt = ''.join(f'<text x="{40 + k * 64}" y="90" font-family="Barlow, sans-serif" font-size="10" fill="#F5F1E6" text-anchor="middle">{K.NAMES[k]}</text>' for k in range(5))
p = os.path.join(RT.OUT, 'D69-insignias-b-colombia.svg')
open(p, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 336 100" width="672" height="200"><rect width="336" height="100" fill="#0B1A24"/>{body}{txt}</svg>\n'); print('svg', os.path.abspath(p))
for k in range(5): print(K.NAMES[k], [svg_el(t, a) for t, a in combo[k][2][0]])

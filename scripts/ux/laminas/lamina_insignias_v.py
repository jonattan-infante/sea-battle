# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/lamina_insignias_v.py
#   →  $UX_OUT/D69-insignias-v.png, D69-insignias-v.svg (versión de placa) y D69-insignias-v-grande.svg (versión grande)
# Necesita $UX_OUT/_insignias_v.pkl de insignias_v.py y rsvg-convert (librsvg 2.62) en el PATH. Depende de (rutas.py,
# cambiables por variables de entorno): las fuentes del juego en UX_FONTS. Escribe en UX_OUT, nunca en docs/game/art/.
# No corre en la CI.
# Lámina «Galones en V» para Jonattan (AC-191, AC-192; 3.ª vuelta): su nota a B-Colombia, «se ven muy redondos y de poca
# calidad. Quiero esto», con la tabla de insignias del Ejército de EE. UU. de la II Guerra Mundial como dirección (fuera
# del repo). Dos versiones con la misma silueta, el mismo metal y el mismo relleno (BACKLOG AC-191, «Versión grande»):
# - de placa (12, 16, 18 y 24 px): la que mide AD-40, en el marcado de D74 (polygon y rect, colores planos, sin opacidad);
# - grande (pantalla de niveles y aviso de subida, 64 px): metal con degradado, bisel, sombra, bordado en los galones,
#   sarga en el parche y rosa facetada. Es la «calidad» que pide la nota.
import sys, os, io, contextlib, pickle, subprocess, math
sys.argv = ['x']; sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import rutas as RT
with contextlib.redirect_stdout(io.StringIO()):
    import insignias_v as K
import numpy as np
from PIL import Image, ImageDraw, ImageFont
RES = pickle.load(open(RT.need(os.path.join(RT.OUT, '_insignias_v.pkl'), '_insignias_v.pkl (insignias_v.py)'), 'rb'))
if RES['v'] is None:  # sin combinación que pase AD-40: no hay lámina; el peor par parcial lo imprime insignias_v.py
    print('sin combinación: no se dibuja la lámina'); sys.exit(2)
(W_, combo), PRS = RES['v']
INK, NAMES, MET = K.INK, K.NAMES, K.MET
PANEL = '#0B1A24'  # el fondo oscuro de la pantalla de niveles (ART-DIRECTION §12.11)
LIGHT = {K.BR: '#EDB98A', K.SI: '#FFFFFF', K.GO: '#FFE9A6'}
DARK = {K.BR: '#5E3417', K.SI: '#7D8894', K.GO: '#7E550C'}
GID = {K.BR: 'gb', K.SI: 'gs', K.GO: 'gg'}


def pts(a): return [tuple(float(v) for v in p.split(',')) for p in a['points'].split()]
def ptxt(ps): return ' '.join(f'{x:g},{y:g}' for x, y in ps)
def el(t, a): return f'<{t} ' + ' '.join(f'{k}="{v:g}"' if isinstance(v, (int, float)) else f'{k}="{v}"' for k, v in a.items()) + '/>'


def defs():
    g = ''.join(f'<linearGradient id="{GID[m]}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="{LIGHT[m]}"/>'
                f'<stop offset="0.5" stop-color="{m}"/><stop offset="1" stop-color="{DARK[m]}"/></linearGradient>' for m in (K.BR, K.SI, K.GO))
    tw = (f'<pattern id="tw" patternUnits="userSpaceOnUse" width="0.7" height="0.7" patternTransform="rotate(45)">'
          f'<rect width="0.7" height="0.7" fill="{INK}"/><rect width="0.16" height="0.7" fill="#11273A"/></pattern>')
    return f'<defs>{g}{tw}</defs>'


def big(k):
    """La versión grande de la insignia k: el mismo marcado que la de placa, con material."""
    fi, solid, c = combo[k][0], combo[k][1], combo[k][2]; els = c[0]; m = MET[k]; gm = f'url(#{GID[m]})'
    outer, inner, marks = els[0], els[1], els[2:]
    o = [el('polygon', dict(points=outer[1]['points'], fill='#000000', opacity=0.5, transform='translate(0.3,0.4)')),
         el('polygon', dict(points=outer[1]['points'], fill=gm, stroke=DARK[m], **{'stroke-width': 0.22})),
         el('polygon', dict(points=inner[1]['points'], fill=gm if solid else 'url(#tw)', stroke=DARK[m], **{'stroke-width': 0.14}))]
    if not solid:  # bisel: el canto de arriba y de la izquierda del marco, en el metal claro
        ps = pts(outer[1]); o.append(el('polyline', dict(points=ptxt([ps[6], ps[7], ps[0], ps[1]]), fill='none', stroke=LIGHT[m], **{'stroke-width': 0.18, 'stroke-linejoin': 'miter'})))
    for t, a in marks:
        if t == 'polygon' and len(pts(a)) in (8, 16) and k == 4:  # rosa facetada: cada punta, mitad clara y mitad oscura
            ps = pts(a); n = len(ps); cx = sum(x for x, _ in ps) / n; cy = sum(y for _, y in ps) / n
            hi, lo = ('#22323F', INK) if solid else (LIGHT[m], DARK[m])
            o.append(el('polygon', dict(points=a['points'], fill='#000000', opacity=0.45, transform='translate(0.18,0.24)')))
            for i in range(0, n, 2):
                o.append(el('polygon', dict(points=ptxt([(cx, cy), ps[i], ps[i - 1]]), fill=hi)))
                o.append(el('polygon', dict(points=ptxt([(cx, cy), ps[i], ps[(i + 1) % n]]), fill=lo)))
            continue
        shape = el(t, {**a, 'fill': INK if solid else gm, **({} if solid else {'stroke': DARK[m], 'stroke-width': 0.12})})
        if solid:  # en relieve hundido: el borde de abajo a la derecha, en el metal claro
            o.append(el(t, {**a, 'fill': LIGHT[m], 'transform': 'translate(0.14,0.16)'})); o.append(shape)
        else:
            o.append(el(t, {**a, 'fill': '#000000', 'opacity': 0.55, 'transform': 'translate(0.16,0.22)'})); o.append(shape)
        if t == 'polygon' and len(pts(a)) == 6:  # galón: puntada del bordado por el centro
            ps = pts(a); mid = [((ps[i][0] + ps[5 - i][0]) / 2, (ps[i][1] + ps[5 - i][1]) / 2) for i in range(3)]
            mid[0] = (mid[0][0] + 0.35, mid[0][1]); mid[2] = (mid[2][0] - 0.35, mid[2][1])
            o.append(el('polyline', dict(points=ptxt(mid), fill='none', stroke=(LIGHT[m] if solid else DARK[m]), **{'stroke-width': 0.09, 'stroke-dasharray': '0.32 0.22'})))
        if t == 'rect' and not solid:  # barra: canto claro a la izquierda
            o.append(el('rect', dict(x=a['x'] + 0.15, y=a['y'] + 0.2, width=a['width'] * 0.22, height=a['height'] - 0.4, fill=LIGHT[m])))
    return ''.join(o)


def svg_big(k, px, bg=PANEL):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.6 -0.6 13.2 13.2" width="{px}" height="{px}">'
            f'{defs()}<rect x="-0.6" y="-0.6" width="13.2" height="13.2" fill="{bg}"/>{big(k)}</svg>')


def rsvg(svg):
    png = subprocess.run(['rsvg-convert'], input=svg.encode(), capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(png)).convert('RGB')


def font(px, w=600): return ImageFont.truetype(RT.FONTS + RT.FF[w], px, layout_engine=ImageFont.Layout.RAQM)
def to_img(rgb): return Image.fromarray((np.clip(rgb, 0, 1) * 255).round().astype(np.uint8))
def gray(rgb):
    y = np.clip(K.Lstar(rgb), 0, 100); Yl = np.where(y > 8, ((y + 16) / 116) ** 3, y / 903.3); return np.repeat(K.ns['enc'](Yl)[..., None], 3, axis=2)


PLATE = K.BGS['oceano']; PLATE_RGB = tuple(int(round(c * 255)) for c in PLATE)
PAPER, INK_T, SOFT, TITLE, RED, GREEN = (245, 241, 230), (43, 29, 14), (92, 74, 51), (107, 58, 26), (162, 59, 42), (31, 111, 60)
SW = 1720; sheet = Image.new('RGB', (SW, 1500), PAPER); d = ImageDraw.Draw(sheet)
d.text((40, 22), 'Insignias de rango: galones en V, con tu referencia', font=font(30), fill=INK_T)
d.text((40, 64), 'Respuesta a «se ven muy redondos y de poca calidad»: todo en ángulos, galones con la punta arriba, barras de metal y una rosa de puntas.', font=font(16, 500), fill=SOFT)
d.text((40, 88), 'De izquierda a derecha: Grumete, Marinero, Contramaestre, Teniente y Almirante.', font=font(16, 500), fill=SOFT)
y = 128
# 1. grande
d.text((40, y), 'Grande: en la pantalla de niveles y en el aviso de subida (64 px; aquí a 128, el doble, y a 64, su tamaño)', font=font(20), fill=TITLE); y += 34
x = 40
for k in range(5):
    tile = Image.new('RGB', (300, 176), PANEL); tile.paste(rsvg(svg_big(k, 128)), (16, 16)); tile.paste(rsvg(svg_big(k, 64)), (160, 48))
    ImageDraw.Draw(tile).text((16, 150), NAMES[k], font=font(15), fill=(245, 241, 230))
    sheet.paste(tile, (x, y)); x += 328
y += 176 + 30
# 2. en el juego: 24, 16 y 12 px en la placa, con su versión de placa
d.text((40, y), 'En el juego, con la versión de placa (la misma silueta, sin degradados): 24 px en tu panel, 16 en el feed y el objetivo, 12 en las placas', font=font(20), fill=TITLE); y += 34
x = 40
for k in range(5):
    els = combo[k][2][0]; tile = Image.new('RGB', (300, 124), PLATE_RGB)
    for (dpr, px0) in ((2, 16), (4 / 3, 80), (1, 128)):
        tile.paste(to_img(K.raster(els, dpr, PLATE)), (px0, 16)); tile.paste(to_img(gray(K.raster(els, dpr, PLATE))), (px0, 62))
    ImageDraw.Draw(tile).text((170, 20), 'color', font=font(13, 500), fill=(245, 241, 230)); ImageDraw.Draw(tile).text((170, 66), 'grises', font=font(13, 500), fill=(245, 241, 230))
    ImageDraw.Draw(tile).text((16, 100), NAMES[k], font=font(13), fill=(245, 241, 230))
    sheet.paste(tile, (x, y)); x += 328
y += 124 + 18
strip = np.concatenate([K.raster(combo[k][2][0], 1, PLATE) for k in range(5)], axis=1)
sheet.paste(to_img(strip).resize((60 * 5, 60), Image.NEAREST), (40, y)); sheet.paste(to_img(gray(strip)).resize((60 * 5, 60), Image.NEAREST), (360, y))
d.text((680, y + 8), 'Las 5 a 12 px, ampliadas ×5 sin suavizar (izquierda en color, derecha en grises): así de pocos píxeles tiene la placa.', font=font(15, 500), fill=SOFT)
def para(x, y, w, t, f, c, lh):
    line = ''
    for wd in t.split():
        s_ = (line + ' ' + wd).strip()
        if d.textlength(s_, font=f) > w: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
        else: line = s_
    d.text((x, y), line, font=f, fill=c); return y + lh
n3 = max(c[4][0] for c in combo); worst = min(PRS.items(), key=lambda kv: kv[1])
verdict = (f'Medida a 12 px (la regla de siempre): el par más parecido, {NAMES[worst[0][0]]} y {NAMES[worst[0][1]]}, difiere en {worst[1]:.0f} px '
           f'(mín. 20); las marcas se cuentan bien; parecido con los iconos del juego {n3:.2f} (máx. 0,80): ' + ('PASA' if W_ >= 20 and n3 <= 0.8 else 'NO PASA')).replace('0.', '0,')
y_v = para(680, y + 34, SW - 680 - 40, verdict, font(15), GREEN if W_ >= 20 and n3 <= 0.8 else RED, 22)
y = max(y + 60, y_v) + 36
# 3. antes
d.text((40, y), 'Lo que pediste cambiar (la versión anterior, inspirada en la Armada de Colombia, a 48 px)', font=font(20), fill=TITLE); y += 34
old = rsvg(open(os.path.join(RT.REPO, 'docs', 'game', 'art', 'D69-insignias-b-colombia.svg')).read()); old = old.crop((0, 0, old.width, int(old.height * 0.8)))
sheet.paste(old, (40, y)); y += old.height + 30
# 4. qué es, en contra y notas
FIGS = {k: K.V_TXT[k][combo[k][0]] for k in range(5)}
FILL = lambda k: 'llena' if combo[k][1] else 'hueca'
desc = ' · '.join(f'{NAMES[k]}: {FIGS[k]}, {("bronce", "bronce", "plata", "oro", "oro")[k]}, {FILL(k)}' for k in range(5))
contra = []
if combo[3][0] == 0: contra.append('Las dos barras del Teniente, a 12 px, recuerdan un poco al botón de pausa; en el juego no hay botón de pausa con ese dibujo.')
contra.append('La rosa del Almirante tiene puntas como una estrella, y la estrella es el icono de tu barco; la medida las separa (parecido ' + f'{n3:.2f}'.replace('.', ',') + ' de un máximo de 0,80), pero el significado se puede cruzar.')
contra.append('Los degradados, el bordado y la sarga solo se ven en la grande; a 12 px la placa no tiene píxeles para ellos y va en colores planos.')
notes = ['Es «inspirada», no una copia: sin águilas, escudos nacionales ni las insignias de rama. Las estrellas y anclas no van, porque el juego ya las usa como iconos.',
         'Cabe en la caja de 12 × 12 de hoy: no cambia ninguna medida del HUD, de las placas ni de la pantalla de niveles.',
         'Medida con la misma regla de legibilidad que la de hoy: 12 px, pantallas normales y de alta densidad, sobre agua y sobre arena, en grises y con 3 tipos de daltonismo.']
y = para(40, y, SW - 80, desc, font(16), INK_T, 24) + 10
d.text((40, y), 'En contra', font=font(20), fill=RED); y += 30
for t in contra: y = para(40, y, SW - 80, t, font(15, 500), RED, 22) + 4
y += 10
for t in notes: y = para(40, y, SW - 80, t, font(15, 500), SOFT, 22) + 4
sheet = sheet.crop((0, 0, SW, y + 24))
out = os.path.join(RT.OUT, 'D69-insignias-v.png'); sheet.save(out, optimize=True); print('hoja', os.path.abspath(out), sheet.size)
# SVG: versión de placa (las 5 a 48 px, como las de antes) y versión grande (las 5 a 64 px)
body = ''.join(f'<g transform="translate({16 + k * 64},16) scale(4)">' + ''.join(el(t, a) for t, a in combo[k][2][0]) + '</g>' for k in range(5))
txt = ''.join(f'<text x="{40 + k * 64}" y="90" font-family="Barlow, sans-serif" font-size="10" fill="#F5F1E6" text-anchor="middle">{NAMES[k]}</text>' for k in range(5))
p = os.path.join(RT.OUT, 'D69-insignias-v.svg')
open(p, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 336 100" width="672" height="200"><rect width="336" height="100" fill="{PANEL}"/>{body}{txt}</svg>\n'); print('svg', os.path.abspath(p))
body = ''.join(f'<g transform="translate({8 + k * 80},8) scale(5.333)">{big(k)}</g>' for k in range(5))
p = os.path.join(RT.OUT, 'D69-insignias-v-grande.svg')
open(p, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 408 80" width="816" height="160">{defs()}<rect width="408" height="80" fill="{PANEL}"/>{body}</svg>\n'); print('svg', os.path.abspath(p))
for k in range(5): print(NAMES[k], 'fig', combo[k][0], 'llena' if combo[k][1] else 'hueca', 'corte', (1.8, 2.6)[combo[k][5]], [el(t, a) for t, a in combo[k][2][0]])

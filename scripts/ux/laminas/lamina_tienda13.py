# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/lamina_tienda13.py
#   →  $UX_OUT/D99-tienda-mejoras.png y $UX_OUT/D100-tienda-barcos.png
# Láminas de la tienda de la 1.3 (mejoras por barco; GDD §11 «Mejoras por barco (1.3)», Q34; BACKLOG AC-216 y AC-217) para
# el visto bueno de Jonattan (AC-192): la pestaña Mejoras con la franja «Mejoras de tu <barco>» (D99) y la pestaña Barcos
# con los niveles de cada barco (D100), en 1440×900, 390×844 y 844×390, dibujadas con tienda13.py (sobre tienda.py: las
# reglas de globals.css, la Barlow del juego y los iconos de icons.tsx).
# Fondos: las capturas de la lámina aprobada D85 (docs/game/art/D85-tienda-nivel.png, sha256 1899e154…), que ya llevan el
# panel de 880 × 672 y la hoja del móvil en el mismo sitio; el panel nuevo los tapa enteros. Se leen, nunca se escriben.
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI. Necesita rsvg-convert (o un sustituto en el PATH).
import sys, os
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import rutas as RT
import tienda as T
import tienda13 as M
from PIL import Image, ImageDraw

S = 2
MODAL_H = 672
D85 = Image.open(os.path.join(RT.REPO, 'docs', 'game', 'art', 'D85-tienda-nivel.png')).convert('RGB')
BG = {'desk': (40, 202, 1440, 900), 'mob': (1510, 202, 390, 844), 'land': (40, 1362, 844, 390)}  # marcos de la sección 1 y 2 de D85
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); ANN = (0, 112, 192)
LV = dict(sloop=dict(cannons=3, hull=1, sails=2), brig=dict(cannons=1, hull=1, sails=1), frigate=dict(cannons=2, hull=3, sails=1))
# El caso de AC-212 y AC-213: la Balandra con Cañones N3 y Velas N2, el Bergantín a N1 y 1 000 de oro; la Fragata, para AC-217
ST_B = dict(owned={'sloop', 'brig', 'frigate'}, active='brig', gold=1000, level=4, levels=LV)
ST_S = dict(ST_B, active='sloop')


def font(px, w=600): return T.font(px, w)


def kind(vw, vh): return 'desk' if vw >= 700 and vh >= 700 else ('mob' if vw < 700 else 'land')


def background(vw, vh):
    x, y, w, h = BG[kind(vw, vh)]
    assert (w, h) == (vw, vh)
    return D85.crop((x, y, x + w, y + h)).resize((vw * S, vh * S), Image.LANCZOS).convert('RGBA')


def screen(vw, vh, st, tab, scroll=0.0, **kw):
    L = M.mej_layout(vw, vh, st, MODAL_H) if tab == 'Mejoras' else M.bar_layout(vw, vh, st, MODAL_H, **kw)
    g = L['g']; bg = background(vw, vh)
    shop = M.draw_mejoras(L, st, S, scroll) if tab == 'Mejoras' else M.draw_barcos(L, st, S, scroll)
    bg.alpha_composite(shop, (round(g['x'] * S), round(g['y'] * S)))
    return bg.convert('RGB'), L


def panel(vw, vh, st, tab, scroll=0.0, **kw):
    """Solo el panel (o la hoja), a S×, recortado de la pantalla."""
    im, L = screen(vw, vh, st, tab, scroll, **kw); g = L['g']
    return im.crop((round(g['x'] * S), round(g['y'] * S), round((g['x'] + g['w']) * S), round((g['y'] + g['h']) * S))), L


# --- posiciones (px CSS de la pantalla) para los números de las notas
def origin(L, tab, scroll=0.0):
    g = L['g']; mx = 6 if g['kind'] == 'modal' else 0; my = 6 if g['kind'] == 'modal' else 4
    top = g['y'] + my + 64 + 46.5 + (L['strip']['h'] if tab == 'Mejoras' else 0)
    return g['x'] + mx, top, g['y'] + my + 64 + 46.5


def card_of(L, key, val): return next(c for c in L['cards'] if (c.get('upg') if key == 'upg' else c['ship']['id']) == val)


def card_xy(L, tab, c, scroll=0.0):
    ox, top, _ = origin(L, tab, scroll); g = L['g']
    return ox + g['pad'][1] + c['x'], top + g['pad'][0] - scroll + c['y']


def foot_xy(L, tab, c, k, scroll=0.0):
    x, y = card_xy(L, tab, c, scroll); it = next(i for i in c['foot'] if i['k'].startswith(k))
    return x + 89 + it['x'], y + c['H'] - 13 - c['fh'] + it['y'], it


def title_right_xy(L, c, scroll=0.0):
    x, y = card_xy(L, 'Barcos', c, scroll); tr = c['tr']
    ry = y + 13 + (18 * T.LH + 8 if c['tw'] else (18 * T.LH - tr['h']) / 2)
    return x + 89 + c['BW'] - tr['w'], ry, tr


# --- la lámina
class Sheet:
    def __init__(self, w, h=5200):
        self.W = w; self.im = Image.new('RGB', (w, h), PAPER); self.d = ImageDraw.Draw(self.im)

    def title(self, y, t): self.d.text((40, y), t, font=font(21), fill=TITLE); return y + 36

    def label(self, x, y, t, c=SOFT, f=None): self.d.text((x, y), t, font=f or font(15, 500), fill=c)

    def frame(self, im, x, y, c=(120, 110, 95)):
        self.im.paste(im, (x, y)); self.d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=c, width=1)

    def num(self, x, y, n):
        d = self.d; d.ellipse((x - 14, y - 14, x + 14, y + 14), fill=(255, 255, 255), outline=ANN, width=3)
        t = str(n); w = d.textlength(t, font=font(16)); d.text((x - w / 2, y - 11), t, font=font(16), fill=ANN)

    def para(self, x, y, w, t, f=None, c=INK, lh=24):
        d = self.d; f = f or font(16, 500); line = ''
        for wd in t.split():
            s = (line + ' ' + wd).strip()
            if d.textlength(s, font=f) > w: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
            else: line = s
        d.text((x, y), line, font=f, fill=c); return y + lh

    def notes(self, y, items):
        for n, t in items: self.num(54, y + 10, n); y = self.para(80, y, self.W - 140, t) + 6
        return y

    def hdim(self, x0, x1, y, t, side='below'):
        d = self.d; d.line((x0, y, x1, y), fill=ANN, width=2)
        for x in (x0, x1): d.line((x, y - 6, x, y + 6), fill=ANN, width=2)
        w = d.textlength(t, font=font(15))
        d.text((x1 + 10, y - 10) if side == 'right' else ((x0 + x1 - w) / 2, y + 6), t, font=font(15), fill=ANN)

    def vdim(self, x, y0, y1, t):
        d = self.d; d.line((x, y0, x, y1), fill=ANN, width=2)
        for y in (y0, y1): d.line((x - 6, y, x + 6, y), fill=ANN, width=2)
        d.text((x + 10, (y0 + y1) / 2 - 10), t, font=font(15), fill=ANN)

    def save(self, y, name):
        im = self.im.crop((0, 0, self.W, y + 10)); out = os.path.join(RT.OUT, name); im.save(out, optimize=True); return out, im.size


def n(v):
    """Cifra a la española: coma decimal, sin tocar el resto del texto."""
    return (f'{v:g}' if isinstance(v, float) else str(v)).replace('.', ',')


def half(im): return im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
def k75(im): return im.resize((round(im.width * 0.75), round(im.height * 0.75)), Image.LANCZOS)


# ==================== D99: pestaña Mejoras
def d99():
    sh = Sheet(2360); d = sh.d
    d.text((40, 22), 'Tienda 1.3: las mejoras son de cada barco (pestaña Mejoras)', font=font(32), fill=INK)
    y = 72
    for t in ('Maqueta de la pestaña Mejoras de la 1.3, dibujada con las fuentes, los colores, los iconos y las medidas del juego, sobre el mismo modelo de la lámina D85. Aún no está construida.',
              'El caso (el de AC-212 y AC-213): tienes 1000 de oro, una Balandra con Cañones al nivel 3 y Velas al 2, y un Bergantín sin mejorar. Los precios son los de GDD §11: la base × cañones por banda / 8.',
              'Lo que se aprueba: la franja que nombra el barco y explica que cada barco tiene sus mejoras, y que la pestaña enseñe los niveles y los precios del barco que navegas.'):
        sh.label(40, y, t, f=font(17, 500)); y += 26

    # 1. antes y después de cambiar de barco: los 2 paneles a tamaño real
    y = sh.title(y + 16, '1. El mismo jugador con el Bergantín y, tras cambiar a la Balandra en Barcos, con la Balandra (escritorio, el panel a tamaño real)')
    pa, La = panel(1440, 900, ST_B, 'Mejoras'); pb, Lb = panel(1440, 900, ST_S, 'Mejoras')
    pa, pb = half(pa), half(pb); xa, xb = 40, 40 + pa.width + 120
    sh.frame(pa, xa, y); sh.frame(pb, xb, y)
    ax = xa + pa.width + 20; d.line((ax, y + 300, ax + 80, y + 300), fill=ANN, width=3); d.polygon([(ax + 80, y + 292), (ax + 92, y + 300), (ax + 80, y + 308)], fill=ANN)
    sh.label(xa, y + pa.height + 8, 'Con el Bergantín (en uso): Cañones 375, Casco 300, Velas 225')
    sh.label(xb, y + pb.height + 8, 'Con la Balandra: Cañones al máximo, Casco 200, Velas 450')
    g = La['g']
    def at(L, x0, px, py): return x0 + (px - L['g']['x']), y + (py - L['g']['y'])
    _, _, tabs_bottom = origin(La, 'Mejoras')
    for (L, x0) in ((La, xa), (Lb, xb)):
        sx, sy = at(L, x0, g['x'] + 6 + 20, tabs_bottom + M.STRIP_PAD + 12); sh.num(sx - 20, sy, 1)
        sb = L['strip']; lx, ly = at(L, x0, g['x'] + 6 + 20 + sb['tl'] + 16 + M.tw(M.SUB[0][0], 13, 500) + M.T.tw('Barcos', 13, 600) / 2, tabs_bottom + M.STRIP_PAD + 12)
        sh.num(lx, ly + 34, 2)
        c = card_of(L, 'upg', 'cannons'); k = 'stamp' if c['level'] >= 3 else 'price'
        fx, fy, it = foot_xy(L, 'Mejoras', c, k); px_, py_ = at(L, x0, fx, fy); sh.num(px_ - 22, py_ + it['h'] / 2, 3 if k == 'price' else 4)
    ly = y + pa.height + 48
    ly = sh.notes(ly, (
        (1, '«Mejoras de tu Bergantín»: el barco al que van las mejoras, con su nombre, en una franja fija bajo las pestañas. No se desplaza con la lista, así que se ve también en el móvil con la lista bajada. Si cambias de barco, cambia con él.'),
        (2, '«Cada barco tiene las suyas. Para mejorar otro, cámbiate a él en Barcos.» Dice la regla y cómo mejorar otro barco. «Barcos» es un enlace a esa pestaña, donde se cambia gratis en el puerto.'),
        (3, 'Los precios son los de ese barco: Cañones al nivel 2 cuestan 375 con el Bergantín (6 cañones por banda, ×0,75) y 250 con la Balandra (4, ×0,5). Las tarjetas son las de hoy; solo cambian sus cifras.'),
        (4, 'Los niveles también son de cada barco: la Balandra tiene los Cañones al máximo y el Bergantín, al 1. Con 1000 de oro, el Bergantín puede comprar Cañones (375); tras comprarlos le quedan 625 y la Balandra sigue igual.')))
    y = ly + 24

    # 2. escritorio y móvil
    y = sh.title(y, '2. Escritorio (1440×900) y móvil (390×844), a tamaño real, con el Bergantín')
    dsk, Ld = screen(1440, 900, ST_B, 'Mejoras'); mob, Lm = screen(390, 844, ST_B, 'Mejoras')
    sh.frame(half(dsk), 40, y); sh.frame(half(mob), 1510, y)
    sh.label(40, y + 906, f"Escritorio: la franja mide {n(Ld['strip']['h'])} px de alto, con el título y la línea en una fila")
    sh.label(1510, y + 850, f"Móvil: la línea se parte en 2; franja de {n(Lm['strip']['h'])} px")
    sh.label(1510, y + 874, f"Las 3 tarjetas caben sin desplazar ({n(Lm['content_h'])} de {n(round(Lm['grid_h'], 1))} px)")
    y += 940

    # 3. apaisado y la franja al doble
    y = sh.title(y, '3. Móvil apaisado (844×390), a tamaño real, y la franja del escritorio y del móvil al doble, con sus medidas')
    y3 = y
    lan, Ll = screen(844, 390, ST_B, 'Mejoras'); sh.frame(half(lan), 40, y)
    sh.label(40, y + 396, f"Apaisado: la franja va en una fila ({n(Ll['strip']['h'])} px) y la lista se desplaza, como hoy")
    sx = 40 + 844 + 60
    for (vw, vh, name, LL) in ((1440, 900, 'Escritorio', Ld), (390, 844, 'Móvil', Lm)):
        pim, _ = panel(vw, vh, ST_B, 'Mejoras'); gg = LL['g']; mx = 6 if gg['kind'] == 'modal' else 0; my = 6 if gg['kind'] == 'modal' else 4
        top = (my + 64 + 46.5) * S; crop = pim.crop((0, round(top), pim.width, round(top + LL['strip']['h'] * S)))
        if crop.width > sh.W - sx - 200: crop = crop.crop((0, 0, sh.W - sx - 200, crop.height))
        sh.frame(crop, sx, y); sh.vdim(sx + crop.width + 14, y, y + LL['strip']['h'] * S, f"{n(LL['strip']['h'])} px")
        sh.label(sx, y + crop.height + 8, f"{name}: relleno de 10 px arriba y abajo; título 16/600 y línea 13/500")
        y += crop.height + 50
    y = max(y, y3 + 390 + 40) + 20  # lo que sea más alto: el apaisado con su pie o las 2 franjas

    # 4. lo que descarté
    y = sh.title(y, '4. Lo que descarté')
    tab_w = M.T.tw('Mejoras del Navío de línea', 15, 600) + 24 + M.T.tw('Barcos', 15, 600) + 24 + M.T.tw('Familia', 15, 600)
    one_btn = 10 + 40 + 10 + 1
    y = sh.para(40, y, sh.W - 80, f"El nombre del barco en la pestaña («Mejoras del Navío de línea»): cabe ({n(round(tab_w))} px de pestañas en los {390 - 32} del móvil), pero no dice la regla ni cómo mejorar otro barco, así que la franja haría falta igual. Y una pestaña que cambia de nombre al cambiar de barco mueve a las otras dos.", f=font(16, 500))
    y = sh.para(40, y + 6, sh.W - 80, f"Un botón «Cambiar de barco» en la franja: repite la pestaña Barcos, que está justo encima, y sube la franja de {n(Ll['strip']['h'])} a {one_btn} px, que en el apaisado salen de una lista de {n(Ll['grid_h'])} px. El enlace «Barcos» dentro de la línea lleva al mismo sitio sin ocupar alto.", f=font(16, 500))
    y = sh.para(40, y + 6, sh.W - 80, 'La franja dentro de la lista, como una tarjeta más: en el móvil y en el apaisado se iría al bajar la lista, y el nombre del barco dejaría de verse justo al pulsar «Mejorar».', f=font(16, 500))
    return sh.save(y + 10, 'D99-tienda-mejoras.png')


# ==================== D100: pestaña Barcos
def d100():
    sh = Sheet(2360); d = sh.d
    d.text((40, 22), 'Tienda 1.3: los niveles de cada barco (pestaña Barcos)', font=font(32), fill=INK)
    y = 72
    for t in ('Maqueta de la pestaña Barcos de la 1.3, dibujada con las fuentes, los colores, los iconos y las medidas del juego, sobre el modelo de la lámina D85 (el panel de 880 × 672). Aún no está construida.',
              'El caso: tienes nivel 4 y 1000 de oro, navegas el Bergantín (sin mejorar), y tienes la Balandra (Cañones 3, Casco 1, Velas 2) y la Fragata (Cañones 2, Casco 3, Velas 1). La Goleta y el Navío piden nivel.',
              'Lo que se aprueba: cómo enseña cada barco propio sus 3 niveles, cómo dice un barco que no tienes que llega sin mejoras, y que los 5 barcos sigan cabiendo sin desplazar.'):
        sh.label(40, y, t, f=font(17, 500)); y += 26
    y = sh.title(y + 16, '1. Escritorio (1440×900) y móvil (390×844, arriba y desplazado al final), a tamaño real')
    dsk, Ld = screen(1440, 900, ST_B, 'Barcos'); mob0, Lm = screen(390, 844, ST_B, 'Barcos')
    end = Lm['content_h'] - Lm['grid_h']; mob1, _ = screen(390, 844, ST_B, 'Barcos', end)
    sh.frame(half(dsk), 40, y); sh.frame(half(mob0), 1510, y); sh.frame(half(mob1), 1930, y)
    sh.label(40, y + 906, f"Escritorio: los 5 barcos a la vista, {n(Ld['content_h'])} px de tarjetas en {n(Ld['grid_h'])}")
    sh.vdim(40 + 1160 + 12, y + Ld['g']['y'], y + Ld['g']['y'] + Ld['g']['h'], '672 px')
    sh.label(1510, y + 850, 'Móvil, arriba'); sh.label(1930, y + 850, 'Móvil, al final de la lista')
    def put(L, x0, sid, what, n, scroll=0.0, dx=-20, above=False):
        c = card_of(L, 'ship', sid)
        if what == 'tr' and above: px, py, it = title_right_xy(L, c, scroll); sh.num(x0 + px + it['w'] / 2, y + py - 16, n)
        elif what == 'tr': px, py, it = title_right_xy(L, c, scroll); sh.num(x0 + px + dx, y + py + it['h'] / 2, n)
        elif what == 'stats':
            cx, cy = card_xy(L, 'Barcos', c, scroll); sh.num(x0 + cx + 89 - 18, y + cy + 13 + c['th'] + 4 + 10, n)
        else:
            fx, fy, it = foot_xy(L, 'Barcos', c, what, scroll); sh.num(x0 + fx - 18, y + fy + it['h'] / 2, n)
    put(Ld, 40, 'sloop', 'tr', 1); put(Ld, 40, 'frigate', 'tr', 1); put(Ld, 40, 'frigate', 'stats', 2)
    put(Ld, 40, 'schooner', 'tr', 3); put(Ld, 40, 'line', 'tr', 3); put(Ld, 40, 'schooner', 'why', 4)
    put(Lm, 1510, 'sloop', 'tr', 1, above=True); put(Lm, 1930, 'line', 'tr', 3, end)
    ly = y + 950
    ly = sh.notes(ly, (
        (1, 'Cada barco que tienes enseña sus 3 niveles a la derecha del nombre, con los iconos de la pestaña Mejoras (mira, escudo y vela, en ese orden: Cañones, Casco y Velas) y 3 puntos cada uno, como las tarjetas de mejora. La Balandra: Cañones 3, Casco 1, Velas 2. Así se comparan sin cambiar de barco.'),
        (2, 'Las cifras de cada barco ya llevan sus mejoras: la Fragata, con el Casco al 3, dice «Vida 3080» (2200 × 1,4), y la Balandra, con las Velas al 2, «Velocidad 15,4 m/s». Hoy la vida usaba las mejoras del jugador y la velocidad, ninguna.'),
        (3, '«Llega sin mejoras» en cada barco que no tienes, en el mismo sitio, antes del botón «Comprar»: al comprarlo, sus Cañones, su Casco y sus Velas empiezan en el nivel 1.'),
        (4, 'Lo de D85 no cambia: «Requiere nivel 5 (Marinero)» sigue entera en su línea, y el panel sigue en 880 × 672 sin desplazar (los niveles van en la fila del nombre, que ya existía, y no añaden alto).')))
    y = ly + 24

    y = sh.title(y, '2. Móvil apaisado (844×390), a tamaño real, y la tarjeta de la Fragata (propia) y la del Navío (sin comprar) al doble, con sus medidas')
    row2 = card_of(M.bar_layout(844, 390, ST_B, MODAL_H), 'ship', 'schooner')['y']
    lan, Ll = screen(844, 390, ST_B, 'Barcos', row2); sh.frame(half(lan), 40, y)
    sh.label(40, y + 396, 'Apaisado: la lista se desplaza, como hoy (aquí, en la segunda fila)')
    cx = 40 + 844 + 60; cy = y; bottom = y + 420
    for sid in ('frigate', 'line'):
        L = M.bar_layout(1440, 900, ST_B, MODAL_H); c = card_of(L, 'ship', sid); pad = 10
        im = Image.new('RGBA', (round((c['W'] + 2 * pad) * S), round((c['H'] + 2 * pad) * S)), T.hexrgb(T.C['paper']) + (255,))
        M.draw_ship_card(T.Pen(im, S), dict(c, x=0, y=0), pad, pad, ST_B); im = im.convert('RGB')
        if cx + im.width + 120 > sh.W: cx = 40 + 844 + 60; cy = bottom
        sh.frame(im, cx, cy); tr = c['tr']
        rx = cx + (pad + 89 + c['BW'] - tr['w']) * S
        sh.hdim(rx, rx + tr['w'] * S, cy + (pad + 13 + 27) * S + 6, f"{n(round(tr['w']))} px", side='right')
        sh.vdim(cx + im.width + 14, cy + pad * S, cy + (pad + c['H']) * S, f"{n(c['H'])} px")
        sh.label(cx, cy + im.height + 44, f"{c['ship']['label']}: tarjeta de {n(c['W'])} × {n(c['H'])} px (escritorio)")
        bottom = max(bottom, cy + im.height + 80); cx += im.width + 150
    y = bottom + 10
    y = sh.para(40, y, sh.W - 80, f"Los niveles: icono de 14 px, a 4 px de sus 3 puntos de 8 px (separados 3), y 10 px entre grupos: {M.LV_W} px. Puntos llenos en --ui-gold-lo y vacíos en --paper-line, como .card__dot. «Llega sin mejoras», 13/500 en --ink-soft. Si no caben junto al nombre (el Navío propio en el móvil), bajan a su propia línea, alineados a la derecha.", f=font(16, 500)) + 24

    y = sh.title(y, '3. Con nivel 5 y 3000 de oro, la Goleta se puede comprar, y sigue diciendo que llega sin mejoras (escritorio, al doble)')
    st5 = dict(ST_B, level=5, gold=3000); L = M.bar_layout(1440, 900, st5, MODAL_H); c = card_of(L, 'ship', 'schooner'); pad = 10
    im = Image.new('RGBA', (round((c['W'] + 2 * pad) * S), round((c['H'] + 2 * pad) * S)), T.hexrgb(T.C['paper']) + (255,))
    M.draw_ship_card(T.Pen(im, S), dict(c, x=0, y=0), pad, pad, st5); im = im.convert('RGB'); sh.frame(im, 40, y)
    y += im.height + 50

    y = sh.title(y, '4. Lo que descarté')
    alt, La = panel(1440, 900, ST_B, 'Barcos', force_wrap=True)
    sh.frame(half(alt).resize((660, 504), Image.LANCZOS), 40, y)
    sh.para(40, y + 512, 660, f"Los niveles en una línea propia, bajo el nombre: cada barco propio crece 22 px y las tarjetas suman {n(La['content_h'])} px en {n(La['grid_h'])}: el Navío pierde {n(round(La['content_h'] - La['grid_h'], 1))} px por abajo y hay que desplazar, justo lo que arregló D85.", f=font(15, 500))
    nw = M.T.tw('Llega con las mejoras a nivel 1', 13, 500); tn = M.T.tw('Navío de línea', 18, 600) + 8
    room = card_of(Ld, 'ship', 'line')['BW'] - tn; room_m = card_of(Lm, 'ship', 'line')['BW'] - tn
    sh.para(760, y, 1500, f"«Llega con las mejoras a nivel 1»: mide {n(round(nw))} px; junto a «Navío de línea» caben {n(round(room))} en el escritorio, pero solo {n(round(room_m))} en el móvil, donde bajaría a otra línea. Y, sobre todo, «nivel» ya es el del jugador en la línea roja de debajo («Requiere nivel 9»): «sin mejoras» no se confunde con él.", f=font(16, 500))
    sh.para(760, y + 110, 1500, 'Una sola nota para toda la pestaña («Los barcos nuevos llegan sin mejoras»): AC-217 pide que lo diga cada barco que no tienes, y la nota añadiría 35,5 px a un panel que ya va justo.', f=font(16, 500))
    return sh.save(y + 560, 'D100-tienda-barcos.png')


if __name__ == '__main__':
    for f in (d99, d100):
        out, size = f(); print(out, size)

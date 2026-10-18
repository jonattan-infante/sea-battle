# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/lamina_tienda_nivel.py  →  $UX_OUT/D85-tienda-nivel.png
# Lámina de la tienda con los barcos que piden nivel (AC-162; D85) para Jonattan: la pestaña Barcos de la 1.1 con sus
# 5 tarjetas en los 3 tamaños, dibujada con el modelo de tienda.py (las reglas de globals.css, la Barlow del juego, los
# iconos de icons.tsx y la insignia de D74), que antes se contrasta con la captura real de la pestaña Barcos de la 1.0.
# Los fondos son capturas de qa:capture (UX_CAPTURAS): desktop-shop.png, mobile-shop.png y landscape-danger-mark.png.
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import rutas as RT
import tienda as T
from PIL import Image, ImageDraw, ImageFilter

S = 2
MODAL_H = 672  # D85: 880 × 672 en escritorio (antes, 580)
ST = dict(owned={'sloop'}, active='sloop', gold=3000, level=4, hull=1.0)
val = T.validar()
assert val['diff'][1:] == (0, 0) and val['diff'][0] < 2.5, f'el modelo no casa con la captura ac157: {val}'

def font(px, w=600): return T.font(px, w)
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); ANN = (0, 112, 192)
def cap(path, what): return Image.open(RT.need(os.path.join(RT.CAPTURAS, path), what)).convert('RGBA')


def shadow(bg, x, y, w, h):
    """box-shadow 0 20px 50px rgba(0, 0, 0, .45) del modal, en px de dispositivo."""
    m = Image.new('L', bg.size, 0); ImageDraw.Draw(m).rounded_rectangle((x, y + 20 * S, x + w, y + h + 20 * S), 12 * S, fill=115)
    sh = Image.new('RGBA', bg.size, (0, 0, 0, 0)); sh.putalpha(m.filter(ImageFilter.GaussianBlur(25 * S)))
    bg.alpha_composite(sh)


def screen(vw, vh, st, scroll=0.0, modal_h=MODAL_H, rule='propia'):
    """La pantalla entera a S×: el fondo de captura (con velo y desenfoque si hace falta) y la tienda encima."""
    L = T.layout(vw, vh, st, level_rule=rule, modal_h=modal_h); g = L['g']
    if vw >= 700 and vh >= 700:
        bg = cap('desktop-shop.png', 'captura de la tienda de escritorio').resize((vw * S, vh * S), Image.LANCZOS)
    elif vw < 700:
        bg = cap('mobile-shop.png', 'captura de la tienda de móvil')
    else:  # apaisado: la captura es del juego, sin velo; se le pone el de la tienda (--ui-scrim y blur de 3 px)
        bg = cap('landscape-danger-mark.png', 'captura del juego apaisado').filter(ImageFilter.GaussianBlur(3 * S))
        bg.alpha_composite(Image.new('RGBA', bg.size, (6, 17, 26, 140)))
    shop = T.draw_shop(L, st, S, scroll)
    x, y = round(g['x'] * S), round(g['y'] * S)
    if g['kind'] == 'modal': shadow(bg, x, y, shop.width, shop.height)
    bg.alpha_composite(shop, (x, y))
    return bg.convert('RGB'), L


def card_only(vw, vh, st, sid, rule='propia', pad=10):
    """Una tarjeta suelta a S×, con su alto de fila (la de al lado puede estirarla), sobre --paper."""
    L = T.layout(vw, vh, st, level_rule=rule, modal_h=MODAL_H)
    c = next(c for c in L['cards'] if c['ship']['id'] == sid)
    im = Image.new('RGBA', (round((c['W'] + 2 * pad) * S), round((c['H'] + 2 * pad) * S)), T.hexrgb(T.C['paper']) + (255,))
    T.draw_card(T.Pen(im, S), dict(c, x=0, y=0), pad, pad, st)
    return im.convert('RGB'), c


SW = 2360
sheet = Image.new('RGB', (SW, 4600), PAPER); d = ImageDraw.Draw(sheet)
def title(y, t): d.text((40, y), t, font=font(21), fill=TITLE); return y + 36
def label(x, y, t, c=SOFT, f=None): d.text((x, y), t, font=f or font(15, 500), fill=c)
def frame(im, x, y, c=(120, 110, 95)):
    sheet.paste(im, (x, y)); d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=c, width=1)
def num(x, y, n):
    d.ellipse((x - 14, y - 14, x + 14, y + 14), fill=(255, 255, 255), outline=ANN, width=3)
    t = str(n); w = d.textlength(t, font=font(16)); d.text((x - w / 2, y - 11), t, font=font(16), fill=ANN)
def para(x, y, w, t, f=None, c=INK, lh=24):
    f = f or font(16, 500); line = ''
    for wd in t.split():
        s = (line + ' ' + wd).strip()
        if d.textlength(s, font=f) > w: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
        else: line = s
    d.text((x, y), line, font=f, fill=c); return y + lh
def half(im): return im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
def hdim(x0, x1, y, t, side='below'):
    """Cota horizontal (px de la lámina) con su texto debajo o a la derecha."""
    d.line((x0, y, x1, y), fill=ANN, width=2)
    for x in (x0, x1): d.line((x, y - 6, x, y + 6), fill=ANN, width=2)
    w = d.textlength(t, font=font(15))
    d.text((x1 + 10, y - 10) if side == 'right' else ((x0 + x1 - w) / 2, y + 6), t, font=font(15), fill=ANN)
def vdim(x, y0, y1, t):
    d.line((x, y0, x, y1), fill=ANN, width=2)
    for y in (y0, y1): d.line((x - 6, y, x + 6, y), fill=ANN, width=2)
    d.text((x + 10, (y0 + y1) / 2 - 10), t, font=font(15), fill=ANN)

d.text((40, 22), 'Tienda: los barcos que piden nivel (Goleta y Navío de línea)', font=font(32), fill=INK)
y = 72
for t in ('Maqueta de la pestaña Barcos con los 5 barcos, dibujada con las fuentes, los colores, los iconos y las medidas del juego. El mismo dibujo, con los 3 barcos de hoy, coincide con una captura real',
          'de la tienda (las tarjetas en el mismo píxel). Aún no está construido. El caso: tienes nivel 4, 3000 de oro y solo la Balandra. La Goleta pide nivel 5 y el Navío, nivel 9.',
          'Lo que se aprueba: cómo dice la tarjeta el nivel que falta, y que el panel de escritorio crezca de 580 a 672 px de alto para que se vean los 5 barcos sin desplazar.'):
    label(40, y, t, f=font(17, 500)); y += 26

# --- 1. escritorio y móvil
y = title(y + 16, '1. Escritorio (1440×900) y móvil (390×844, arriba y desplazado al final), a tamaño real')
dsk, Ld = screen(1440, 900, ST)
mob0, Lm = screen(390, 844, ST, 0)
mob1, _ = screen(390, 844, ST, Lm['content_h'] - Lm['g']['grid_h'])
frame(dsk.resize((1440, 900), Image.LANCZOS), 40, y)
frame(mob0.resize((390, 844), Image.LANCZOS), 1510, y); frame(mob1.resize((390, 844), Image.LANCZOS), 1930, y)
label(40, y + 906, 'Escritorio: el panel de 880 × 672, con los 5 barcos a la vista')
vdim(40 + 1160 + 12, y + Ld['g']['y'], y + Ld['g']['y'] + Ld['g']['h'], '672 px'); label(1510, y + 850, 'Móvil, arriba'); label(1930, y + 850, 'Móvil, al final de la lista')
# números sobre las piezas (posiciones del modelo)
def card_at(L, sid): return next(c for c in L['cards'] if c['ship']['id'] == sid)
def foot_at(L, sid, k, scroll=0.0):
    g = L['g']; c = card_at(L, sid); it = next(i for i in c['foot'] if i['k'].startswith(k))
    ox = g['x'] + (6 if g['kind'] == 'modal' else 0) + g['pad'][1] + c['x'] + 89  # 89: borde, relleno, icono y hueco
    oy = g['y'] + (6 if g['kind'] == 'modal' else 4) + 64 + 46.5 + g['pad'][0] - scroll + c['y'] + c['H'] - 13 - c['fh']
    return ox + it['x'], oy + it['y'], it
for n, (sid, k) in enumerate((('schooner', 'why'), ('schooner', 'btn'), ('line', 'why'), ('frigate', 'why'), ('brig', 'btn')), 1):
    fx, fy, it = foot_at(Ld, sid, k)
    num(40 + fx - 18, y + fy + it['h'] / 2, n) if k == 'why' else num(40 + fx + it['w'] + 18, y + fy + 20, n)
fx, fy, it = foot_at(Lm, 'schooner', 'why'); num(1510 + fx + it['w'] + 18, y + fy + it['h'] / 2, 1)
fx, fy, it = foot_at(Lm, 'line', 'why', Lm['content_h'] - Lm['g']['grid_h']); num(1930 + fx + it['w'] + 18, y + fy + it['h'] / 2, 3)
ly = y + 950
notes = ((1, '«Requiere nivel 5 (Marinero)»: el nivel que pide el barco, con la insignia de ese rango delante, en el mismo rojo de «Te faltan». Es el mismo texto que da el servidor si alguien intenta comprarlo igualmente. Va en una línea propia, encima del precio, para que quepa entero también en el móvil.'),
         (2, 'El botón «Comprar» queda apagado hasta tener el nivel, aunque tengas el oro: aquí tienes 3000, justo lo que cuesta la Goleta.'),
         (3, 'Una razón cada vez: al Navío te faltan el nivel 9 y 9000 de oro, pero la tarjeta solo dice el nivel. Al llegar al nivel, dice lo del oro.'),
         (4, 'Lo demás no cambia: la Fragata dice «Te faltan 3000», como hoy.'),
         (5, 'Y lo que puedes comprar ya, con «Comprar» en azul: el Bergantín, por 2000.'))
for n, t in notes: num(54, ly + 10, n); ly = para(80, ly, SW - 140, t) + 6
y = ly + 24

# --- 2. apaisado y las medidas de la tarjeta, al doble
y = title(y, '2. Móvil apaisado (844×390), a tamaño real, y la tarjeta del Navío de línea (el texto más largo) al doble en los 3 tamaños, con sus medidas')
Ll = T.layout(844, 390, ST, modal_h=MODAL_H); gl = Ll['g']
row2 = card_at(Ll, 'schooner')['y']
lan, _ = screen(844, 390, ST, row2)
frame(lan.resize((844, 390), Image.LANCZOS), 40, y)
label(40, y + 396, 'Apaisado: el panel de 812 × 358; la lista se desplaza, como hoy (aquí, a la segunda fila)')
cx = 40 + 844 + 60; cy = y; bottom = y + 420
for (vw, vh, name) in ((1440, 900, 'Escritorio'), (390, 844, 'Móvil'), (844, 390, 'Apaisado')):
    im, c = card_only(vw, vh, ST, 'line')
    if cx + im.width > SW - 40: cx = 40; cy = max(cy, y + 460)
    frame(im, cx, cy)
    bx = cx + (10 + 89) * S
    it = next(i for i in c['foot'] if i['k'] == 'why')
    fy = cy + (10 + c['H'] - 13 - c['fh'] + it['y']) * S
    hdim(bx, bx + it['w'] * S, fy + it['h'] * S + 4, f"{it['w']:.0f} px", side='right')
    hdim(bx, bx + c['BW'] * S, cy + (10 + c['H']) * S + 14, f"columna de texto: {c['BW']:.0f} px")
    vdim(cx + im.width + 14, cy + 10 * S, cy + (10 + c['H']) * S, f"{c['H']:g} px".replace('.', ','))
    label(cx, cy + im.height + 44, f"{name}: tarjeta de {c['W']:g} × {c['H']:g} px".replace('.', ','))
    bottom = max(bottom, cy + im.height + 80); cx += im.width + 150
y = bottom + 20

# --- 3. con el nivel
y = title(y, '3. Al llegar al nivel 5, la tarjeta de la Goleta vuelve a lo de siempre (escritorio, al doble)')
a, _ = card_only(1440, 900, dict(ST, level=5), 'schooner'); b, _ = card_only(1440, 900, dict(ST, level=5, gold=2500), 'schooner')
frame(a, 40, y); frame(b, 40 + a.width + 40, y)
label(40, y + a.height + 8, 'Nivel 5 y 3000 de oro: se puede comprar'); label(80 + a.width, y + b.height + 8, 'Nivel 5 y 2500 de oro: «Te faltan 500»')
y += max(a.height, b.height) + 60

# --- 4. lo que descarté
y = title(y, '4. Lo que descarté')
old, _ = screen(1440, 900, ST, 0, modal_h=580)
oc = old.crop((280 * S, 160 * S, 1160 * S, 740 * S)).resize((660, 435), Image.LANCZOS)
frame(oc, 40, y)
para(40, y + 445, 660, 'El panel de hoy, de 580 px de alto (a tres cuartos): con 5 barcos, el Navío queda cortado y hay que desplazar para verlo. Con 672 px caben los 5, también con la línea del nivel (539 px de tarjetas en 549).', f=font(15, 500))
def k75(im): return im.resize((round(im.width * 0.75), round(im.height * 0.75)), Image.LANCZOS)
nat, cn = card_only(1440, 900, ST, 'schooner', rule='natural'); nat = k75(nat); frame(nat, 760, y)
para(760, y + nat.height + 8, nat.width, 'El nivel junto al precio cuando cabe: en escritorio va con el precio y el botón baja; en el móvil no cabe y la línea cambia de sitio según el tamaño. La tarjeta, además, crece más (172 px frente a 167,5).', f=font(15, 500))
ink, _ = card_only(1440, 900, dict(ST, why_color=T.C['ink']), 'schooner'); ink = k75(ink); frame(ink, 760 + nat.width + 40, y)
para(800 + nat.width, y + ink.height + 8, ink.width, 'El nivel en tinta oscura en vez de rojo: se lee, pero deja de parecerse a «Te faltan», que es la otra razón por la que un botón está apagado. En rojo, la razón está siempre en el mismo sitio y del mismo color.', f=font(15, 500))
y += max(445 + 4 * 24, nat.height + 8 + 5 * 24) + 30

sheet = sheet.crop((0, 0, SW, y + 10))
out = os.path.join(RT.OUT, 'D85-tienda-nivel.png'); sheet.save(out, optimize=True)
print(out, sheet.size, 'validación', val)

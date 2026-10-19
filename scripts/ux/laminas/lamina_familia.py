# Uso (desde la raíz del repo), con la misma UX_OUT que `retrato.py line` (sus retratos/ y retratos-line.json):
#   python3 -I scripts/ux/laminas/lamina_familia.py <origen> <entrega>  →  $UX_OUT/D94-selector-familia.png
#   <origen> y <entrega>: los de retrato.py (la UX_OUT del turno de la entrega de los Navíos y la carpeta de sus GLB), para
#   el retrato de lado del todo que se descarta
# Lámina de la pestaña Familia del Astillero (AC-195; D94) para Jonattan: las 2 tarjetas con el Navío de línea en cada
# familia, al elegir, mientras cargan las imágenes y con la BD caída, en 1440×900, 390×844 y 844×390, dibujada con el
# modelo de tienda.py (las reglas de globals.css, la Barlow del juego y sus iconos), que antes se contrasta con la captura
# real de la tienda. Las imágenes son los WebP de la entrega (retrato.py), descodificados: lo que verá el jugador.
# Los fondos son capturas de qa:capture (UX_CAPTURAS): desktop-shop.png, mobile-shop.png y landscape-danger-mark.png.
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'barcos'), os.path.join(HERE, '..', 'mapa')): sys.path.insert(0, p)
import rutas as RT
import tienda as T
import retrato as RE
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 2
MODAL_H = 672  # D85
ST = dict(gold=12450, fam='gb')
val = T.validar()
assert val['diff'][1:] == (0, 0) and val['diff'][0] < 2.5, f'el modelo no casa con la captura ac157: {val}'
RET = os.path.join(RT.OUT, 'retratos')
MAN = json.load(open(RT.need(os.path.join(RET, 'retratos-line.json'), 'retratos-line.json (retrato.py line)')))
IMGS = {MAN['retratos'][sid]['familia']: Image.open(os.path.join(RET, MAN['retratos'][sid]['webp'])).convert('RGBA') for sid in MAN['retratos']}
PNGS = {MAN['retratos'][sid]['familia']: Image.open(os.path.join(RET, f'{sid}_side.png')).convert('RGBA') for sid in MAN['retratos']}

def font(px, w=600): return T.font(px, w)
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); ANN = (0, 112, 192)
def cap(path, what): return Image.open(RT.need(os.path.join(RT.CAPTURAS, path), what)).convert('RGBA')


def shadow(bg, x, y, w, h):
    """box-shadow 0 20px 50px rgba(0, 0, 0, .45) del modal, en px de dispositivo."""
    m = Image.new('L', bg.size, 0); ImageDraw.Draw(m).rounded_rectangle((x, y + 20 * S, x + w, y + h + 20 * S), 12 * S, fill=115)
    sh = Image.new('RGBA', bg.size, (0, 0, 0, 0)); sh.putalpha(m.filter(ImageFilter.GaussianBlur(25 * S)))
    bg.alpha_composite(sh)


def background(vw, vh):
    if vw >= 700 and vh >= 700: return cap('desktop-shop.png', 'captura de la tienda de escritorio').resize((vw * S, vh * S), Image.LANCZOS)
    if vw < 700: return cap('mobile-shop.png', 'captura de la tienda de móvil')
    bg = cap('landscape-danger-mark.png', 'captura del juego apaisado').filter(ImageFilter.GaussianBlur(3 * S))
    bg.alpha_composite(Image.new('RGBA', bg.size, (6, 17, 26, 140))); return bg  # el velo de la tienda: --ui-scrim y blur de 3 px


def screen(vw, vh, st, scroll=0.0, banner=False, notice=None, hud_toast=None):
    """La pantalla entera a S×: el fondo de captura y la tienda encima. hud_toast: un aviso en la columna de avisos del HUD
    (540, 96), que queda debajo del velo (z 20 frente a 40) y, donde se cruzan, debajo del panel."""
    L = T.fam_layout(vw, vh, MODAL_H, banner); g = L['g']; bg = background(vw, vh)
    if hud_toast:
        lay = Image.new('RGBA', bg.size, (0, 0, 0, 0)); r = T.Pen(lay, S)
        r.rect(540, 96, 900, 132, fill=T.UI['panel'], radius=6); r.rect(540, 96, 544, 132, fill=T.UI['ok'])
        r.text(556, 96 + (36 - 14 * T.LH) / 2, hud_toast, 14, 500, T.UI['text'])
        lay = lay.filter(ImageFilter.GaussianBlur(3 * S)); a = np.asarray(lay, float); b = np.asarray(bg, float)
        al = a[..., 3:] / 255; scrim = np.array([6, 17, 26.0]); mix = a[..., :3] * 0.45 + scrim * 0.55  # bajo el velo del 55 %
        b[..., :3] = b[..., :3] * (1 - al) + mix * al; bg = Image.fromarray(np.round(b).astype(np.uint8), 'RGBA')
    shop = T.draw_fam(L, st, S, IMGS, scroll, notice)
    x, y = round(g['x'] * S), round(g['y'] * S)
    if g['kind'] == 'modal': shadow(bg, x, y, shop.width, shop.height)
    bg.alpha_composite(shop, (x, y))
    return bg.convert('RGB'), L


def panel(st, **kw):
    """Solo el panel de escritorio (880 × 672) a 1×, recortado de la pantalla."""
    im, L = screen(1440, 900, st, **kw); g = L['g']
    return im.crop((round(g['x'] * S), round(g['y'] * S), round((g['x'] + g['w']) * S), round((g['y'] + g['h']) * S))).resize((880, 672), Image.LANCZOS), L


def boxed(img):
    """Un retrato de 760 × 480 sobre el fondo CSS de su caja (a 2×, píxel a píxel)."""
    bg = T.sky_sea(380, 240, 2); bg.alpha_composite(img); return bg.convert('RGB')


SW = 2360
sheet = Image.new('RGB', (SW, 5200), PAPER); d = ImageDraw.Draw(sheet)
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
def hdim(x0, x1, y, t):
    d.line((x0, y, x1, y), fill=ANN, width=2)
    for x in (x0, x1): d.line((x, y - 6, x, y + 6), fill=ANN, width=2)
    w = d.textlength(t, font=font(15)); d.text(((x0 + x1 - w) / 2, y + 6), t, font=font(15), fill=ANN)
def vdim(x, y0, y1, t):
    d.line((x, y0, x, y1), fill=ANN, width=2)
    for y in (y0, y1): d.line((x - 6, y, x + 6, y), fill=ANN, width=2)
    d.text((x + 10, (y0 + y1) / 2 - 10), t, font=font(15), fill=ANN)
def fmtB(n): return f'{n:,}'.replace(',', ' ')
def card_xy(L, k, scroll=0.0):
    """Esquina de la tarjeta k en px CSS de la pantalla."""
    g = L['g']; c = L['cards'][k]; inset = 6 if g['kind'] == 'modal' else 4
    return g['x'] + (6 if g['kind'] == 'modal' else 0) + g['pad'][1] + c['x'], g['y'] + inset + 64 + 46.5 + g['pad'][0] + c['y'] - scroll, c


d.text((40, 22), 'Astillero: la pestaña Familia (elegir británica o española)', font=font(32), fill=INK)
y = 72
for t in ('Maqueta de la pestaña nueva del Astillero, dibujada con las fuentes, los colores y las medidas del juego (el mismo modelo de la lámina de la tienda con nivel, que coincide con una',
          'captura real de la tienda). Aún no está construida. El caso: tu barco activo es el Navío de línea y usas la británica. Las 2 imágenes son el Navío que aprobaste, sacadas de los',
          'mismos archivos que carga el juego. Lo que se aprueba: cómo se ven las 2 tarjetas, el aviso al elegir, y qué pasa mientras cargan las imágenes y si el guardado no funciona.'):
    label(40, y, t, f=font(17, 500)); y += 26

# --- 1. escritorio y móvil
y = title(y + 16, '1. Escritorio (1440×900) y móvil (390×844, arriba y desplazado al final), a tamaño real')
dsk, Ld = screen(1440, 900, ST)
mob0, Lm = screen(390, 844, ST)
end = max(0.0, Lm['content_h'] - Lm['grid_h']); mob1, _ = screen(390, 844, ST, end)
frame(dsk.resize((1440, 900), Image.LANCZOS), 40, y)
frame(mob0.resize((390, 844), Image.LANCZOS), 1510, y); frame(mob1.resize((390, 844), Image.LANCZOS), 1930, y)
label(40, y + 906, 'Escritorio: el panel de 880 × 672 de siempre, con una pestaña más')
label(1510, y + 850, 'Móvil, arriba'); label(1930, y + 850, f'Móvil, al final ({end:.0f} px más abajo)')
x0, y0, c = card_xy(Ld, 0); x1, y1, c1 = card_xy(Ld, 1)
num(40 + x0 + 13 + 18, y + y0 + 13 + 18, 1)
num(40 + x0 + c['W'] - 13 - 70, y + y0 + 13 + c['ih'] + 10 - 12, 2)
num(40 + x1 + c1['W'] - 13 - 66, y + y1 + 13 + c1['ih'] + 10 - 12, 3)
num(40 + x1 + 13 + T.tw(T.FAMS[1]['rasgos'], 13) + 20, y + y1 + 13 + c1['ih'] + 10 + 44 + 10, 4)
num(40 + x0 - 18, y + y0 + Ld['note_y'] + 10, 5)
mx, my, mc = card_xy(Lm, 1); num(1510 + mx + mc['W'] - 13 - 66, y + my + 13 + mc['ih'] + 10 - 12, 3)
ly = y + 950
notes = ((1, 'La imagen es tu barco activo en cada familia: el mismo modelo del juego, de lado y un poco desde la popa, que es donde más se distinguen (los castillos, las tallas doradas y la bandera). Las 2 van a la misma escala y a la misma altura del agua, para compararlas tal cual. El cielo y el mar son un degradado de la página: no pesan.'),
         (2, 'La familia que usas lleva el sello «En uso» y el borde dorado.'),
         (3, '«Elegir» cambia todos tus barcos a esa familia, al momento, gratis y sin pedir nivel. Los demás jugadores te ven cambiar.'),
         (4, 'Debajo, 3 rasgos de cada familia en una línea: el casco, las franjas y la bandera.'),
         (5, 'Una nota recuerda que solo cambia el aspecto y que los demás te ven con tu familia. En el móvil queda al final y se ve al desplazar; las 2 tarjetas caben enteras sin desplazar.'))
for n, t in notes: num(54, ly + 10, n); ly = para(80, ly, SW - 140, t) + 6
y = ly + 24

# --- 2. al elegir
y = title(y, '2. Al elegir la española: el botón espera al servidor (una vuelta de red) y, al confirmar, cambia el sello y sale el aviso, que dura 3,5 s')
pa, _ = panel(dict(ST, pend='es')); pb, _ = panel(dict(ST, fam='es'), notice='ok')
mb, _ = screen(390, 844, dict(ST, fam='es'), notice='ok')
frame(pa, 40, y); frame(pb, 960, y); frame(mb.resize((390, 844), Image.LANCZOS), 1880, y)
label(40, y + 678, '1. Al pulsar «Elegir»: se apaga mientras llega la respuesta'); label(960, y + 678, '2. Hecho: «En uso» pasa a la española y sale el aviso abajo')
label(1880, y + 850, '3. Igual en el móvil')
ly = y + 880
for t in ('El aviso va dentro del Astillero, abajo y centrado, con el estilo de los avisos del juego (fondo oscuro y borde verde). No mueve nada de sitio. Mientras tanto, tu barco cambia en el mar,',
          'detrás de la tienda. Si el servidor no responde, el botón vuelve a «Elegir» y el aviso dice «No se pudo cambiar la familia. Inténtalo de nuevo.» con el borde rojo.'):
    label(40, ly, t, c=INK, f=font(16, 500)); ly += 24
y = ly + 30

# --- 3. cargando y BD caída
y = title(y, '3. Mientras llegan las imágenes y con el guardado caído (escritorio)')
pc, _ = panel(dict(ST, loading=True)); pd_, _ = panel(dict(ST, down=True), banner=True)
frame(pc, 40, y); frame(pd_, 960, y)
label(40, y + 678, 'Cargando: el hueco de cada imagen ya tiene su tamaño, con el cielo y el mar; al llegar, el barco aparece sin mover nada')
label(960, y + 678, 'Guardado caído: la franja de siempre y «Elegir» apagado, como el resto del Astillero')
y += 678 + 50

# --- 4. la imagen al doble y el apaisado
y = title(y, '4. Las 2 imágenes como las recibe el navegador (al doble: 760 × 480 px para una caja de 380 × 240) y el móvil apaisado (844×390) a tamaño real')
bx = 40
for fam in ('gb', 'es'):
    sid = f'ship_line_{fam}'; r = MAN['retratos'][sid]; im = boxed(IMGS[fam]); frame(im, bx, y)
    label(bx, y + 486, f"{'Británica' if fam == 'gb' else 'Española'}: {fmtB(r['B'])} B (WebP, calidad {r['q']}); diferencia con la imagen sin comprimir: {str(r['dE']['medio']).replace('.', ',')} de media")
    bx += 760 + 40
hy = y + MAN['horizonte_px']; d.line((bx - 40 + 8, hy, bx - 40 + 28, hy), fill=ANN, width=2); label(bx - 40 + 34, hy - 10, 'horizonte, al 70 %', c=ANN, f=font(15))
lan, Ll = screen(844, 390, ST); frame(lan.resize((844, 390), Image.LANCZOS), 40, y + 530)
label(40, y + 926, f"Apaisado: la imagen baja a 104 px de alto para que la tarjeta quepa sin desplazar ({Ll['cards'][0]['H']:g} px en {Ll['grid_h']:g})".replace('.', ','))
zx = 40 + 844 + 60; zy = y + 530
sid = 'ship_line_es'; c0 = MAN['escala']['caja_px']; cx0 = int(c0[0]) + 10; cy0 = int(c0[3]) - 150
crop = lambda im: im.crop((cx0, cy0, cx0 + 220, cy0 + 130)).resize((660, 390), Image.NEAREST)
frame(crop(boxed(PNGS['es'])), zx, zy); frame(crop(boxed(IMGS['es'])), zx + 700, zy)
label(zx, zy + 396, 'La popa española a 3×: sin comprimir'); label(zx + 700, zy + 396, f"y en el WebP de {fmtB(MAN['retratos'][sid]['B'])} B que se descarga")
y += 530 + 390 + 70

# --- 5. lo que descarté
y = title(y, '5. Lo que descarté')
ht, Lh = screen(1440, 900, dict(ST, fam='es'), hud_toast=T.FAM_OK.format('española'))
g = Lh['g']; hc = ht.crop((round((g['x'] - 40) * S), round(60 * S), round((g['x'] + g['w'] + 40) * S), round(300 * S))).resize((960, 240), Image.LANCZOS)
frame(hc, 40, y)
para(40, y + 248, 960, 'El aviso en la columna de avisos del juego (arriba en el centro): queda debajo del velo de la tienda y, con el panel de 672 px, sus 18 px de abajo quedan detrás del panel. Casi no se ve. Por eso va dentro del Astillero.', f=font(15, 500))
fr0 = RE.frame([RE.model(os.path.join(sys.argv[1], 'cadena', 'navio_gb_lod0.npz'))], th=0.0, hd=90.0)
tmp = os.path.join(RET, 'tmp'); os.makedirs(tmp, exist_ok=True)
side = RE.shot(RE.model(os.path.join(sys.argv[1], 'cadena', 'navio_gb_lod0.npz')), RE.ktx_lin(os.path.join(sys.argv[1], 'cadena', 'comp', 'atlas_gb.ktx2'), tmp), fr0)
sd = boxed(side).resize((380, 240), Image.LANCZOS); ch = boxed(IMGS['gb']).resize((380, 240), Image.LANCZOS)
frame(sd, 1060, y); frame(ch, 1480, y)
para(1060, y + 248, 800, 'De lado del todo (izquierda), como las siluetas de la pestaña Barcos: el casco queda en una franja y no se ven ni la cubierta ni la popa. La elegida (derecha) mira 12° desde arriba y 20° hacia la popa.', f=font(15, 500))
y += 248 + 4 * 22 + 30

sheet = sheet.crop((0, 0, SW, y + 10))
out = os.path.join(RT.OUT, 'D94-selector-familia.png'); sheet.save(out, optimize=True)
print(out, sheet.size, 'validación', val, 'escala', MAN['escala'], 'móvil', dict(content=Lm['content_h'], grid=Lm['grid_h']),
      'apaisado', dict(card=Ll['cards'][0]['H'], grid=Ll['grid_h']), 'escritorio', dict(content=Ld['content_h'], grid=Ld['grid_h']))

# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/lamina_minimapa.py  →  $UX_OUT/D87-minimapa.png
# Lámina del minimapa de la 1.1 (D63, D73 y D87) para Jonattan: los marcadores nuevos (○ otro jugador, ◆ pirata, ■ mercante,
# ▣ galeón y ⚓ puerto, con ▲, ▬ y ★ como hoy) y las islas de D83 dibujadas círculo a círculo, en los 3 tamaños, con el
# antes y el después y la vista en grises. El minimapa se pinta con el modelo de canvas de AD-29 (scripts/ux/ad29py.py,
# calibrado contra Chromium), que antes se contrasta con el minimapa real de la captura de escritorio. Los fondos son
# capturas de qa:capture (UX_CAPTURAS). Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, math
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'mapa'))
import rutas as RT
import tienda as T
import circulos as CI
import numpy as np
from PIL import Image, ImageDraw

# el modelo de AD-29, sin su barrido (todo lo anterior a «PH = [0»), con las líneas finas de Skia a DPR 1
_argv = sys.argv; sys.argv = ['ad29py', '24', '1', '']; os.environ['JOIN'] = 'hairline'
M = {'__name__': 'ad29'}; exec(open(os.path.join(HERE, '..', 'ad29py.py')).read().split('PH = [0')[0], M); sys.argv = _argv
C = M['C']

ISL_10 = [(0, 0, 30), (260, 200, 45), (-300, 170, 35), (-220, -280, 55), (250, -260, 40), (20, 360, 30), (-410, -30, 28)]  # la 1.0
ISL_11 = [c for iid, v in CI.ISLAS.items() if iid != 'PORT' for c in v[4]]  # D83: los 43 círculos, sin el del puerto
CORAL = M['hexrgb']('#FF7A7A'); WHITE = np.array([255., 255., 255.]); ZONE = np.array([108., 195., 245.])


def disc(D, color):
    """● relleno de diámetro D (el de los otros jugadores en la 1.0, D43), como polígono de 48 lados."""
    return M['filled'](lambda x, y, d, h: [(x + D / 2 * d * math.cos(2 * math.pi * i / 48), y + D / 2 * d * math.sin(2 * math.pi * i / 48)) for i in range(48)], color)


MARK = {'1.0': {'player': disc(5, 'player'), 'pirate': M['dia'](7), 'merchant': M['sq'](6)},
        '1.1': {'player': M['ring'](8, 2.5), 'pirate': M['dia'](8), 'merchant': M['sq'](7), 'galleon': M['sqring'](10, 3)}}
for v in MARK.values(): v.update(gunboat=M['bar'](11, 5), captain=M['star'](5.5, 2.2), me=M['tri'](5, 0.7, 0.6))


def band(cv, cx, cy, R, w, rgb, alpha, dash=None):
    """Trazo circular de ancho w px físicos (cobertura de una banda), con el discontinuo del canvas si dash (px físicos)."""
    d = np.hypot(cv.X - cx, cv.Y - cy); m = np.abs(d - R) <= w / 2
    if dash: m &= (np.floor((np.arctan2(cv.Y - cy, cv.X - cx) % (2 * math.pi)) * R / dash) % 2) == 0
    cv.paint(m, rgb, alpha)


def rect_line(cv, x0, y0, x1, y1, w, rgb, alpha):
    X, Y = cv.X, cv.Y; h = w / 2
    outer = (X >= x0 - h) & (X <= x1 + h) & (Y >= y0 - h) & (Y <= y1 + h)
    inner = (X > x0 + h) & (X < x1 - h) & (Y > y0 + h) & (Y < y1 - h)
    cv.paint(outer & ~inner, rgb, alpha)


def minimap(css, dpr, ver, scene, under=None):
    """El canvas del minimapa (Minimap.tsx, con los cambios de la 1.1): océano, islas, ⚓, zona segura, vista, área de interés
    y entidades en el orden de §4.3. `under` es el fondo que deja ver el panel (su color medio en la captura)."""
    S = int(round(css * dpr)); ss = max(4, 8 // int(dpr)); M['K'] = S * ss; cv = M['Canvas'](S)
    s = S / 1000.0; px = lambda v: (v + 500) * s
    cv.fill_rgb(under if under is not None else C['panel']); cv.fill_rgb(C['ocean'], 0.9)
    for x, z, r in (ISL_10 if ver == '1.0' else ISL_11):
        cv.paint(np.hypot(cv.X - px(x), cv.Y - px(z)) <= max(1.5 * dpr, r * s), C['sand'])
    if ver == '1.1': M['anchor'](13, 1.5)(cv, px(0), px(0), dpr, 0)
    band(cv, px(0), px(0), 110 * s, dpr, ZONE, 0.85, dash=3 * dpr)
    me = scene['me']
    if scene.get('view'):
        (x0, z0), (x1, z1) = scene['view']; rect_line(cv, px(x0), px(z0), px(x1), px(z1), dpr, WHITE, 0.6)
    band(cv, px(me[0]), px(me[1]), 300 * s, dpr, WHITE, 0.35)
    mk = MARK[ver]
    order = ['merchant', 'player', 'galleon', 'pirate', 'gunboat', 'captain']
    for kind in order:
        for (x, z) in scene.get(kind, []):
            if kind == 'galleon' and ver == '1.0': continue
            f = mk[kind] if kind in mk else mk['merchant']
            f(cv, px(x), px(z), dpr, 0)
            if kind == 'captain':  # halo de §4.3 en su pose fija (prefers-reduced-motion): r 9 px, α 0,4, trazo de 1,5
                band(cv, px(x), px(z), 9 * dpr, 1.5 * dpr, CORAL, 0.4)
    mk['me'](cv, px(me[0]), px(me[1]), dpr, me[2])
    return Image.fromarray(np.clip(cv.img, 0, 255).astype(np.uint8))


def gray(im):
    a = np.asarray(im, float); y = M['enc'](M['lin'](a) @ np.array([0.2126, 0.7152, 0.0722]))
    return Image.fromarray(np.repeat(np.clip(y, 0, 255).astype(np.uint8)[..., None], 3, axis=2))


def validar():
    """El modelo frente al minimapa real de desktop-open-sea.png (1.0, DPR 1, canvas de 182 px en (1241, 65)): las islas, la
    zona segura y el área de interés alrededor del barco propio (X 1, Z 198, del pie del sector). Se excluye el centro, con
    la vista y las entidades. Devuelve el mejor desplazamiento y la diferencia media."""
    cap = Image.open(RT.need(os.path.join(RT.CAPTURAS, 'desktop-open-sea.png'), 'captura desktop-open-sea')).convert('RGB')
    a = np.asarray(cap, float)
    m = np.asarray(minimap(182, 1, '1.0', dict(me=(1, 198, 0.0))), float)
    mask = np.ones((182, 182), bool); mask[95:165, 55:130] = False
    best = None
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            e = np.abs(a[65 + dy:247 + dy, 1241 + dx:1423 + dx] - m)[mask].mean()
            if best is None or e < best[0]: best = (round(float(e), 2), dx, dy)
    # solo en los píxeles con algo dibujado (islas, zona segura y área de interés), y el control con 1 px de desfase
    cap = a[65:247, 1241:1423]; feat = (np.abs(m - np.median(m.reshape(-1, 3), axis=0)).sum(axis=2) > 30) & mask
    return dict(diff=best, rasgos_px=int(feat.sum()), rasgos=round(float(np.abs(cap - m)[feat].mean()), 2),
                rasgos_1px=round(float(np.abs(np.roll(cap, 1, axis=1) - m)[feat].mean()), 2))


# --- la escena de la lámina (mundo en m; el barco propio en el mar, al este del puerto, rumbo NE)
def mooring(k, L):
    a = math.radians(15 + 30 * k); r = 30 + L / 2 + 2; return (r * math.sin(a), r * math.cos(a))  # como minimapa-hoja.py
SCENE = dict(me=(200, -60, math.radians(135)), view=((80, -150), (320, 30)),
             player=[mooring(1, 34), mooring(2, 42), mooring(6, 16), mooring(9, 16), (110, 40)],
             merchant=[(60, -180)], pirate=[(380, -120), (300, 140)], gunboat=[(330, -250)], captain=[(-311, -311)], galleon=[(-210, 300)])
ME_SECTOR = 'Sector H5 · X 200 Z −60'

if __name__ == '__main__':
    val = validar()
    ok = val['diff'][1:] == (0, 0) and val['diff'][0] < 4 and val['rasgos'] < 5 and val['rasgos_1px'] > 3 * val['rasgos']
    assert ok, f'el modelo no casa con el minimapa de la captura: {val}'
    S = 2; PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); ANN = (0, 112, 192)
    def font(px, w=600): return T.font(px, w)
    def cap(name): return Image.open(RT.need(os.path.join(RT.CAPTURAS, name), f'captura {name}')).convert('RGB')
    def z(im, k): return im.resize((im.width * k, im.height * k), Image.NEAREST)
    sc = lambda **kw: dict(SCENE, **kw)
    # vistas por tamaño (rectángulo de la cámara, aproximado a lo que se ve en cada pantalla a zoom 1,0)
    V_DESK = ((80, -150), (320, 30)); V_MOB = ((128, -210), (272, 90)); V_LAN = ((50, -130), (350, 10))

    # escritorio: canvas de 182 en (1241, 65) y el pie del sector redibujado
    def paste_r(base, im, xy, r, bottom=True):
        """El canvas recortado por el panel (radio 8 por fuera, 7 por dentro del borde de 1 px): esquinas redondas arriba,
        y abajo también si no hay pie del sector."""
        mk = Image.new('L', (im.width, im.height + (0 if bottom else 4 * r)), 0)
        ImageDraw.Draw(mk).rounded_rectangle((0, 0, mk.width - 1, mk.height - 1), r, fill=255)
        base.paste(im, xy, mk.crop((0, 0, im.width, im.height)))
    desk = cap('desktop-open-sea.png'); m_desk = minimap(182, 1, '1.1', sc(view=V_DESK)); paste_r(desk, m_desk, (1241, 65), 7, bottom=False)
    dd = ImageDraw.Draw(desk); foot = desk.getpixel((1250, 262)); dd.rectangle((1241, 248, 1422, 270), fill=foot)
    f12 = T.font(12, 500); w = dd.textlength(ME_SECTOR, font=f12, features=['tnum'])
    dd.text((1332 - w / 2, 248 + 11.5), ME_SECTOR, font=f12, fill=(169, 184, 194), anchor='lm', features=['tnum'])
    # móvil (DPR 2): canvas de 86 en (287, 61); apaisado (DPR 2): canvas de 70 en (761, 13)
    mob = cap('mobile-open-sea.png'); m_mob = minimap(86, 2, '1.1', sc(view=V_MOB)); paste_r(mob, m_mob, (574, 122), 14)
    lan = cap('landscape-danger-mark.png'); m_lan = minimap(70, 2, '1.1', sc(view=V_LAN)); paste_r(lan, m_lan, (1522, 26), 14)

    SW = 2360
    sheet = Image.new('RGB', (SW, 4200), PAPER); d = ImageDraw.Draw(sheet)
    def title(y, t): d.text((40, y), t, font=font(21), fill=TITLE); return y + 36
    def label(x, y, t, c=SOFT, f=None): d.text((x, y), t, font=f or font(15, 500), fill=c)
    def frame(im, x, y, c=(120, 110, 95)):
        sheet.paste(im, (x, y)); d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=c, width=1)
    def para(x, y, w, t, f=None, c=INK, lh=24):
        f = f or font(16, 500); line = ''
        for wd in t.split():
            s_ = (line + ' ' + wd).strip()
            if d.textlength(s_, font=f) > w: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
            else: line = s_
        d.text((x, y), line, font=f, fill=c); return y + lh
    def num(x, y, n):
        d.ellipse((x - 13, y - 13, x + 13, y + 13), fill=(255, 255, 255), outline=ANN, width=3)
        t = str(n); tw_ = d.textlength(t, font=font(15)); d.text((x - tw_ / 2, y - 10), t, font=font(15), fill=ANN)

    d.text((40, 22), 'Minimapa de la 1.1: marcadores nuevos, el ancla del puerto, el galeón y las islas nuevas', font=font(32), fill=INK)
    y = 72
    for t in ('Maqueta del minimapa con un modelo que pinta como el navegador (con el mapa de hoy coincide con la captura real: las islas y los círculos caen en el mismo píxel). Aún no está construido.',
              'El fondo es el juego de hoy: solo cambia el minimapa. Lo que se aprueba: las formas de cada barco en el minimapa, el ancla del puerto, el marcador del galeón y las islas con sus formas nuevas.'):
        label(40, y, t, f=font(17, 500)); y += 26

    # --- 1. escritorio entero y el minimapa al triple, con los números
    y = title(y + 16, '1. Escritorio (1440×900) y su minimapa al triple')
    frame(desk.resize((1080, 675), Image.LANCZOS), 40, y)
    d.rectangle((40 + 1240 * 0.75 - 3, y + 64 * 0.75 - 3, 40 + 1424 * 0.75 + 3, y + 272 * 0.75 + 3), outline=ANN, width=3)
    label(40, y + 681, 'Escritorio, a tres cuartos (en azul, el minimapa)')
    zx = 40 + 1080 + 50; z3 = z(m_desk, 3); frame(z3, zx, y)
    k = 3 * 182 / 1000; P = lambda x, zz: (zx + (x + 500) * k, y + (zz + 500) * k)
    marks = [(1, SCENE['me'][:2], (30, -30)), (2, SCENE['player'][4], (-34, 30)), (3, SCENE['pirate'][0], (34, -26)),
             (4, SCENE['merchant'][0], (-36, 26)), (5, SCENE['gunboat'][0], (40, 20)), (6, SCENE['captain'][0], (40, 34)),
             (7, SCENE['galleon'][0], (38, 30)), (8, (0, 0), (-40, -40)), (9, (305, 182), (34, 40)), (10, (140, 285), (-40, 28))]
    for n, (x, zz), (ox, oy) in marks:
        cx, cy = P(x, zz); L_ = math.hypot(ox, oy)  # la guía para a 15 px del marcador, para no taparlo
        d.line((cx + ox * 15 / L_, cy + oy * 15 / L_, cx + ox * (L_ - 13) / L_, cy + oy * (L_ - 13) / L_), fill=ANN, width=2); num(cx + ox, cy + oy, n)
    label(zx, y + z3.height + 6, 'El minimapa de escritorio al triple (182 px de lado)')
    ly = y + z3.height + 40
    legend = ('Tu barco: triángulo dorado de 10 px que gira con el rumbo (como ahora).',
              'Otro jugador: anillo blanco de 8 px (ahora, un punto de 5). Aquí, 4 atracados en el puerto y 1 en el mar.',
              'Pirata: rombo coral de 8 px (ahora, 7).',
              'Mercante: cuadrado azul de 7 px (ahora, 6).',
              'Cañonera pirata: barra coral de 11 × 5 px (como ahora).',
              'Capitán pirata: estrella coral con un halo que late; se ve en todo el mapa (como ahora).',
              'Galeón del tesoro: cuadrado hueco azul de 10 px; se ve en todo el mapa, sin halo.',
              'Puerto: ancla de 13 px en color arena, en lugar del círculo de la isla. Los barcos atracados la tapan en parte.',
              'Islas con sus formas nuevas: cada isla se pinta con todos sus círculos, así se ven sus lóbulos y sus islotes.',
              'Escollos: 3 puntos juntos, como ahora.')
    for n, t in enumerate(legend, 1):
        num(zx + 14, ly + 12, n); ly = para(zx + 40, ly, SW - zx - 80, t, f=font(15, 500), lh=22) + 6
    y = max(y + 681 + 40, ly + 20)

    # --- 2. móvil y apaisado
    y = title(y, '2. Móvil (390×844) y móvil apaisado (844×390), a tamaño real, con el minimapa al cuádruple')
    mob1 = mob.resize((390, 844), Image.LANCZOS); frame(mob1, 40, y)
    zm = z(m_mob, 2); frame(zm, 470, y); label(470, y + zm.height + 6, 'Móvil: 86 px, al cuádruple')
    lan1 = lan.resize((844, 390), Image.LANCZOS); frame(lan1, 470 + zm.width + 50, y)
    zl = z(m_lan, 2); frame(zl, 470 + zm.width + 50, y + 430); label(470 + zm.width + 50, y + 430 + zl.height + 6, 'Apaisado: 70 px, al cuádruple')
    para(470 + zm.width + 50 + zl.width + 40, y + 430, SW - (470 + zm.width + 50 + zl.width + 80), 'En móvil los marcadores miden lo mismo que en escritorio y el mapa es más pequeño, así que se juntan: por eso cada barco tiene una forma distinta y no solo un color. El ancla del puerto queda tapada por los barcos atracados; el círculo discontinuo de la zona segura sigue marcando el puerto.', f=font(15, 500), lh=22)
    y += 844 + 40

    # --- 3. antes y después, y en grises
    y = title(y, '3. Como está ahora y en la 1.1 (escritorio, al triple, la misma escena), y la 1.1 en grises')
    old = z(minimap(182, 1, '1.0', sc(view=V_DESK)), 3); frame(old, 40, y); frame(z3, 40 + 546 + 40, y); frame(z(gray(m_desk), 3), 40 + 2 * (546 + 40), y)
    label(40, y + 552, 'Como está ahora: islas de un círculo, un punto de 5 px por jugador, sin ancla ni galeón'); label(626, y + 552, 'En la 1.1')
    label(1212, y + 552, 'La 1.1 en grises: cada barco se distingue por la forma')
    para(1800, y, SW - 1840, 'Comprobado con el modelo de la regla del minimapa: cada forma se parece a sí misma al menos 0,968 y como mucho 0,741 a otra (la pareja más parecida, tu barco y el capitán), por debajo del tope de 0,80. Con los marcadores de ahora, el punto del jugador y el rombo del pirata se parecen 0,910: demasiado.', f=font(15, 500), lh=22)
    y += 552 + 50
    sheet = sheet.crop((0, 0, SW, y))
    out = os.path.join(RT.OUT, 'D87-minimapa.png'); sheet.save(out, optimize=True)
    print(out, sheet.size, 'validación', val)

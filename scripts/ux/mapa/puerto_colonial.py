# Uso (desde la raíz del repo): python3 -I scripts/ux/mapa/puerto_colonial.py
#   →  $UX_OUT/mapa/puerto_lod0.npz, atlas_puerto.png y puerto-medidas.json (ligero: segundos)
# Puerto de la 1.1 rediseñado (D82, a petición de Jonattan: «El puerto debe tener más diseño, detalle, colores»): una
# plaza fuerte colonial caribeña dentro del círculo de colisión de 30 m (GDD §4, «El puerto» y «Rediseño de islas y
# puerto»). Murallas con baluartes y garitas al norte, la puerta roja hacia la plaza, casas de colores, iglesia, palmeras,
# escollera y playa entre los pantalanes, los 12 amarres y el astillero de D68 al sur. Construye la malla en coordenadas del
# juego (+X este, +Y arriba, +Z sur; origen en el centro del puerto) y pinta el atlas de 1024². Comprueba las reglas de
# D68 (nada con y > 0 fuera de r 30; oclusión a 55° ≤ 31 m) y cuenta triángulos por pieza. Escribe en $UX_OUT/mapa
# (rutas.py de scripts/ux/laminas). No corre en la CI.
import json, math, os, random, sys
sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here); sys.path.insert(0, os.path.join(here, '..', 'laminas'))
import rutas as RT
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import geo as G

OUT = os.path.join(RT.OUT, 'mapa'); os.makedirs(OUT, exist_ok=True)
TOP = 1.2            # tapa del muelle y suelo de la ciudad (D68)
R_COL = 30.0         # círculo de colisión (GDD §4)
T55 = 1 / math.tan(math.radians(55))

# ---------------------------------------------------------------- paleta (sRGB; las caras con textura llevan COLOR_0 = 1)
P = {
    'sillar': '#C99A5B', 'sillar.junta': '#86643C', 'sillar.claro': '#E6CFA0',
    'piedra': '#857D70', 'piedra.junta': '#565149', 'losa': '#A39A87', 'losa.junta': '#6E6759',
    'empedrado': '#A28C69', 'empedrado.junta': '#6E5E45', 'teja': '#B5523B', 'teja.sombra': '#83372A', 'teja.luz': '#CB6A4E',
    'tabla': '#9A6A45', 'tabla.junta': '#5A3B24', 'arena': '#E6CF9A', 'cesped': '#5E9E48', 'azotea': '#E2D6C0',
    'cal': '#F6F1E6', 'vidrio': '#263038', 'roja': '#B8322A', 'roja.sombra': '#7E2019', 'herraje': '#3B2A22',
    'ocre': '#E39A36', 'rosa': '#E8807E', 'azul': '#4F86CC', 'celeste': '#6FB9E0', 'amarilla': '#F2C443', 'menta': '#62C49B', 'blanca': '#F1ECE0',
    'buganvilla': '#C93B8E', 'buganvilla2': '#E05AA8', 'toldo.a': '#C8372D', 'toldo.b': '#2F6FB5', 'toldo.c': '#E8A92E',
    'postigo.verde': '#2F7D5B', 'postigo.azul': '#2E5A88', 'postigo.rojo': '#9C3A2E',
    'faro': '#F2EFE8', 'faro.franja': '#C0392B', 'linterna': '#FFE9A8', 'capitel': '#3A3F44', 'flag': '#F2C14E',
    'roca': '#7A736A', 'roca.osc': '#5E5850', 'palma.tronco': '#8A5A3B', 'palma.hoja': '#4E9A3E', 'palma.hoja2': '#3F7A35',
    'madera.osc': '#4B3A2C', 'madera.nueva': '#F0BC82', 'mastil': '#6B4426', 'carga': '#B07A3E', 'barril': '#8A5A33', 'saco': '#D8C7A2',
    'cobre': '#3E8C7A', 'campana': '#8C6A2E', 'agua.fuente': '#5AB3C9',
}
def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

# ---------------------------------------------------------------- atlas
AT = G.Atlas(1024)
AT.add('sillar', 0, 0, 256, 256, 4.0, 4.0)
AT.add('piedra', 256, 0, 256, 256, 4.0, 4.0)
AT.add('losa', 512, 0, 256, 256, 4.0, 4.0)
AT.add('empedrado', 768, 0, 256, 256, 4.0, 4.0)
FACH = ['ocre', 'rosa', 'azul', 'celeste', 'amarilla', 'menta', 'blanca']
for i, k in enumerate(FACH): AT.add('fachada.' + k, 128 * i, 256, 128, 192, 2.0, 3.0)
AT.add('puerta', 896, 256, 128, 192, 1.6, 2.4)
AT.add('teja', 0, 448, 256, 256, 3.0, 3.0)
AT.add('tabla', 256, 448, 256, 256, 3.0, 3.0)
AT.add('porton', 512, 448, 256, 256, 4.0, 4.0)
AT.add('arena', 768, 448, 128, 128, 4.0, 4.0)
AT.add('cesped', 896, 448, 128, 128, 4.0, 4.0)
AT.add('azotea', 768, 576, 128, 128, 3.0, 3.0)
AT.add('espadana', 896, 576, 128, 128, 3.0, 3.0)
for i, k in enumerate(('a', 'b', 'c')): AT.add('toldo.' + k, 64 * i, 704, 64, 64, 2.4, 1.6)
AT.add('white', 1000, 1000, 16, 16, 1.0, 1.0)


def paint_atlas(seed=11):
    rng = np.random.default_rng(seed)
    img = np.zeros((1024, 1024, 3), float)
    def put(name, arr):
        x0, y0, w, h, _, _ = AT.reg[name]; img[y0:y0 + h, x0:x0 + w] = arr
    def noise(h, w, cell, amp):
        small = rng.random((h // cell + 2, w // cell + 2))
        n = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((w + 2 * cell, h + 2 * cell), Image.BICUBIC), float)[cell:cell + h, cell:cell + w] / 255
        return 1 + amp * (n - 0.5) * 2
    def blocks(w, h, row_h, lens, base, joint, jit=0.07, jw=2, hl=None):
        a = np.ones((h, w, 3)) * np.array(rgb(base), float)
        yy = 0; r = 0
        while yy < h:
            x = int(rng.integers(0, w)) if r % 2 else 0
            n_cut = []
            total = 0
            while total < w:
                L = int(rng.integers(*lens)); L = min(L, w - total) if w - total < lens[0] * 1.5 else L
                n_cut.append(L); total += L
            n_cut[-1] -= total - w
            xx = x
            for L in n_cut:
                f = 1 + rng.uniform(-jit, jit)
                for k in range(L):
                    a[yy:yy + row_h, (xx + k) % w] *= f
                for j in range(jw): a[yy:yy + row_h, (xx + j) % w] = rgb(joint)
                if hl is not None:
                    a[yy + jw:yy + jw + 1, [(xx + k) % w for k in range(jw, L)]] = np.array(rgb(hl), float)
                xx += L
            a[yy:yy + jw, :] = rgb(joint)
            yy += row_h; r += 1
        return a * noise(h, w, 8, 0.05)[..., None]
    # sillar: 8 hiladas de 0,5 m en 4 m
    put('sillar', blocks(256, 256, 32, (44, 84), P['sillar'], P['sillar.junta'], hl=P['sillar.claro']))
    put('piedra', blocks(256, 256, 40, (52, 100), P['piedra'], P['piedra.junta'], jit=0.09))
    put('losa', blocks(256, 256, 51, (56, 72), P['losa'], P['losa.junta'], jit=0.06))
    put('empedrado', blocks(256, 256, 16, (16, 30), P['empedrado'], P['empedrado.junta'], jit=0.12, jw=3))
    # tejas: 10 hiladas de 0,3 m en 3 m con sombra en el borde inferior y canales verticales
    t = np.ones((256, 256, 3)) * np.array(rgb(P['teja']), float)
    for r in range(10):
        y0 = int(r * 25.6); y1 = int((r + 1) * 25.6)
        off = 0 if r % 2 == 0 else 10
        for x in range(256):
            ph = ((x + off) % 21) / 21
            t[y0:y1, x] *= 0.86 + 0.24 * math.sin(math.pi * ph)
        for k in range(y0, y1):
            t[k] *= 1.0 - 0.28 * max(0, (k - y0) / (y1 - y0) - 0.7) / 0.3
        t[y1 - 2:y1] = rgb(P['teja.sombra'])
    t *= noise(256, 256, 6, 0.06)[..., None]; put('teja', t)
    # tablas: tablones de 0,3 m a lo largo de v, con juntas y veta
    b = np.ones((256, 256, 3)) * np.array(rgb(P['tabla']), float)
    for c in range(0, 256, 26):
        b[:, c:c + 26] *= 1 + rng.uniform(-0.1, 0.1)
        b[:, c:c + 2] = rgb(P['tabla.junta'])
        cut = int(rng.integers(0, 256)); b[cut:cut + 2, c:c + 26] = rgb(P['tabla.junta'])
    b *= noise(256, 256, 4, 0.07)[..., None]
    put('tabla', b)
    for name, col, amp in (('arena', P['arena'], 0.06), ('cesped', P['cesped'], 0.14)):
        put(name, np.ones((128, 128, 3)) * np.array(rgb(col), float) * noise(128, 128, 4, amp)[..., None])
    az = np.ones((128, 128, 3)) * np.array(rgb(P['azotea']), float) * noise(128, 128, 8, 0.03)[..., None]
    az[::43, :] *= 0.9; az[:, ::43] *= 0.9; put('azotea', az)
    # fachadas: un vano de 2 × 3 m (64 px/m): cal de color, cornisa blanca, ventana con marco blanco y postigos abiertos
    post = {'ocre': 'postigo.verde', 'rosa': 'postigo.azul', 'azul': 'postigo.verde', 'celeste': 'postigo.rojo', 'amarilla': 'postigo.verde',
            'menta': 'postigo.azul', 'blanca': 'postigo.azul'}
    for k in FACH:
        im = Image.new('RGB', (128, 192), rgb(P[k])); d = ImageDraw.Draw(im)
        d.rectangle((0, 0, 127, 10), fill=rgb(P['cal']))                     # cornisa
        d.rectangle((0, 11, 127, 13), fill=tuple(int(v * 0.8) for v in rgb(P[k])))
        wx0, wx1, wy0, wy1 = 38, 90, 54, 138                                  # ventana de 0,8 × 1,3 m
        d.rectangle((wx0 - 26, wy0, wx0 - 4, wy1), fill=rgb(P[post[k]]))      # postigos abiertos
        d.rectangle((wx1 + 4, wy0, wx1 + 26, wy1), fill=rgb(P[post[k]]))
        for yy in range(wy0 + 4, wy1, 7):
            d.line((wx0 - 25, yy, wx0 - 5, yy), fill=tuple(int(v * 0.7) for v in rgb(P[post[k]])))
            d.line((wx1 + 5, yy, wx1 + 25, yy), fill=tuple(int(v * 0.7) for v in rgb(P[post[k]])))
        d.rectangle((wx0 - 5, wy0 - 5, wx1 + 5, wy1 + 4), fill=rgb(P['cal']))  # marco
        d.rectangle((wx0, wy0, wx1, wy1), fill=rgb(P['vidrio']))
        d.line((64, wy0, 64, wy1), fill=rgb(P['cal']), width=3); d.line((wx0, 96, wx1, 96), fill=rgb(P['cal']), width=3)
        d.polygon([(wx0 + 4, wy1 - 6), (wx0 + 22, wy0 + 6), (wx0 + 30, wy0 + 6), (wx0 + 12, wy1 - 6)], fill=(70, 84, 98))
        d.rectangle((wx0 - 9, wy1 + 4, wx1 + 9, wy1 + 9), fill=rgb(P['cal']))  # alféizar
        a = np.asarray(im, float) * noise(192, 128, 6, 0.04)[..., None]
        put('fachada.' + k, a)
    # puerta: 1,6 × 2,4 m (80 px/m) con marco de cal en arco y hoja de madera verde
    im = Image.new('RGB', (128, 192), rgb(P['cal'])); d = ImageDraw.Draw(im)
    d.rectangle((20, 40, 108, 191), fill=rgb(P['postigo.verde'])); d.pieslice((20, 0, 108, 80), 180, 360, fill=rgb(P['vidrio']))
    d.line((64, 40, 64, 191), fill=(28, 70, 50), width=3)
    for yy in (70, 120, 165): d.line((24, yy, 104, yy), fill=(28, 70, 50), width=2)
    put('puerta', np.asarray(im, float))
    # portón: 4 × 4 m (64 px/m); arco de medio punto de 3 m con dovelas claras y las hojas rojas tachonadas
    im = Image.new('RGB', (256, 256), rgb(P['sillar'])); d = ImageDraw.Draw(im)
    d.rectangle((22, 60, 234, 255), fill=rgb(P['sillar.claro']))
    d.pieslice((22, 0, 234, 140), 180, 360, fill=rgb(P['sillar.claro']))
    d.rectangle((40, 76, 216, 255), fill=rgb(P['roja'])); d.pieslice((40, 18, 216, 140), 180, 360, fill=rgb(P['roja']))
    for a_ in range(9):
        ang = math.pi * (a_ + 0.5) / 9; d.line((128 - 106 * math.cos(ang), 70 - 70 * math.sin(ang), 128 - 88 * math.cos(ang), 76 - 58 * math.sin(ang)), fill=rgb(P['sillar.junta']), width=2)
    d.line((128, 18, 128, 255), fill=rgb(P['roja.sombra']), width=4)
    for xx in range(52, 216, 22): d.line((xx, 60, xx, 255), fill=rgb(P['roja.sombra']), width=1)
    for yy in range(96, 250, 34):
        for xx in range(56, 210, 22): d.ellipse((xx - 2, yy - 2, xx + 2, yy + 2), fill=rgb(P['herraje']))
    d.rectangle((116, 2, 140, 22), fill=rgb(P['sillar.claro']))  # clave
    put('porton', np.asarray(im, float) * noise(256, 256, 6, 0.03)[..., None])
    # espadaña: hastial de la iglesia con 2 vanos de campana (3 × 3 m)
    im = Image.new('RGB', (128, 128), rgb(P['amarilla'])); d = ImageDraw.Draw(im)
    for cx in (40, 88):
        d.rectangle((cx - 13, 52, cx + 13, 110), fill=rgb(P['vidrio'])); d.pieslice((cx - 13, 38, cx + 13, 66), 180, 360, fill=rgb(P['vidrio']))
        d.ellipse((cx - 8, 64, cx + 8, 84), fill=rgb(P['campana']))
    d.rectangle((0, 116, 127, 127), fill=rgb(P['cal']))
    put('espadana', np.asarray(im, float))
    for k in ('a', 'b', 'c'):  # toldos de rayas de 0,3 m, color y blanco
        t = np.ones((64, 64, 3)) * np.array(rgb(P['cal']), float)
        for c0 in range(0, 64, 16): t[:, c0:c0 + 8] = rgb(P['toldo.' + k])
        put('toldo.' + k, t)
    x0, y0, w, h, _, _ = AT.reg['white']; img[y0:y0 + h, x0:x0 + w] = 255
    return Image.fromarray(img.clip(0, 255).astype(np.uint8))


# ---------------------------------------------------------------- geometría
def bearing(psi_deg, r):
    a = math.radians(psi_deg); return (r * math.sin(a), r * math.cos(a))


def R_edge(psi):
    """Radio de la costa visible por rumbo: muelle de piedra (30), escollera al oeste (27,2) y playa al suroeste (playa)."""
    s = sector(psi)
    return 30.0 if s == 'muelle' else 27.2 if s == 'escollera' else 26.0


def sector(psi):
    psi %= 360
    if 246 <= psi <= 294: return 'escollera'
    if 299 <= psi <= 337: return 'playa'
    return 'muelle'


BERTHS = [15 + 30 * k for k in range(12)]
pieces = {}
FOOT = []  # huellas en planta de las piezas macizas: (nombre, [(x, z)] convexo)


def foot(name, x, z, sx, sz, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)
    FOOT.append((name, [(x + c * u + s * v, z - s * u + c * v) for u, v in ((-sx / 2, sz / 2), (sx / 2, sz / 2), (sx / 2, -sz / 2), (-sx / 2, -sz / 2))]))


def piece(name):
    m = G.Mesh(AT); pieces[name] = m; return m


def build():
    rng = random.Random(20261018)
    N = 96; dpsi = 360 / N
    # --- plataforma: anillo exterior (muelle, escollera o playa) y suelo de la ciudad en anillos polares
    m = piece('plataforma')
    rings = [0, 7, 13, 18.5, 23.5]
    segs = [12, 32, 48, 96]
    for j in range(len(rings) - 1):
        r0, r1, n = rings[j], rings[j + 1], segs[j]
        for i in range(n):
            a0, a1 = 360 * i / n, 360 * (i + 1) / n
            p00, p01 = bearing(a0, r0), bearing(a1, r0); p10, p11 = bearing(a0, r1), bearing(a1, r1)
            w = 2 * math.pi * r1 / n / AT.reg['empedrado'][4]; dd = (r1 - r0) / AT.reg['empedrado'][5]
            W = AT.uv
            if r0 == 0:
                m.tri((0, TOP, 0), (p10[0], TOP, p10[1]), (p11[0], TOP, p11[1]), W('empedrado', 0.5 * w, 0), W('empedrado', 0, dd), W('empedrado', w, dd))
            else:
                m.quad((p00[0], TOP, p00[1]), (p10[0], TOP, p10[1]), (p11[0], TOP, p11[1]), (p01[0], TOP, p01[1]),
                       W('empedrado', 0, 0), W('empedrado', 0, dd), W('empedrado', w, dd), W('empedrado', w * r0 / r1, 0))
    for i in range(N):
        a0, a1 = dpsi * i, dpsi * (i + 1); am = (a0 + a1) / 2; s = sector(am)
        r_in = 23.5
        if s == 'muelle':
            # losas en 2 filas radiales y la cara de piedra de r 30, de −0,6 a TOP
            for (ra, rb) in ((r_in, 26.75), (26.75, 30.0)):
                pa0, pa1, pb0, pb1 = bearing(a0, ra), bearing(a1, ra), bearing(a0, rb), bearing(a1, rb)
                w = 2 * math.pi * rb / N / 4.0; dd = (rb - ra) / 4.0
                m.quad((pa0[0], TOP, pa0[1]), (pb0[0], TOP, pb0[1]), (pb1[0], TOP, pb1[1]), (pa1[0], TOP, pa1[1]),
                       AT.uv('losa', 0, 0), AT.uv('losa', 0, dd), AT.uv('losa', w, dd), AT.uv('losa', w, 0))
            q0, q1 = bearing(a0, 30.0), bearing(a1, 30.0)
            m.wall(q1, q0, -0.6, TOP, 'piedra')
        elif s == 'escollera':
            rb = 27.2
            pa0, pa1, pb0, pb1 = bearing(a0, r_in), bearing(a1, r_in), bearing(a0, rb), bearing(a1, rb)
            m.quad((pa0[0], TOP, pa0[1]), (pb0[0], TOP, pb0[1]), (pb1[0], TOP, pb1[1]), (pa1[0], TOP, pa1[1]),
                   AT.uv('cesped', 0, 0), AT.uv('cesped', 0, 0.9), AT.uv('cesped', 0.5, 0.9), AT.uv('cesped', 0.5, 0))
            m.wall(bearing(a1, rb), bearing(a0, rb), -0.6, TOP, 'piedra', col=np.array([0.8, 0.8, 0.8]))
        else:  # playa: arena de r 23,5 (TOP) a r 29,4 (bajo la flotación)
            prof = [(r_in, TOP), (26.0, TOP - 0.15), (28.0, 0.35), (29.4, -0.25)]
            for k in range(len(prof) - 1):
                (ra, ya), (rb, yb) = prof[k], prof[k + 1]
                pa0, pa1, pb0, pb1 = bearing(a0, ra), bearing(a1, ra), bearing(a0, rb), bearing(a1, rb)
                col = np.ones(3) * (1.0 if k < 2 else 0.93)
                m.quad((pa0[0], ya, pa0[1]), (pb0[0], yb, pb0[1]), (pb1[0], yb, pb1[1]), (pa1[0], ya, pa1[1]),
                       AT.uv('arena', 0, 0), AT.uv('arena', 0, 0.5), AT.uv('arena', 0.5, 0.5), AT.uv('arena', 0.5, 0), col)
    # transiciones: la cara de piedra entre sectores (el extremo del muelle mira hacia la escollera o la playa)
    for psi in (246, 294, 299, 337):
        r_hi, r_lo = 30.0, (27.2 if sector(psi + (1 if psi in (246, 299) else -1)) == 'escollera' else 23.5)
        a, b = bearing(psi, r_lo), bearing(psi, r_hi)
        m.wall(a, b, -0.6, TOP, 'piedra') if psi in (246, 299) else m.wall(b, a, -0.6, TOP, 'piedra')
    # cantil claro sobre el borde del muelle (se lee también en la mitad norte, donde la cara no se ve)
    m = piece('cantil')
    for i in range(N):
        a0, a1 = dpsi * i, dpsi * (i + 1)
        if sector((a0 + a1) / 2) != 'muelle': continue
        p0, p1, q0, q1 = bearing(a0, 29.35), bearing(a1, 29.35), bearing(a0, 30.0), bearing(a1, 30.0)
        y = TOP + 0.08
        m.solid((p0[0], y, p0[1]), (q0[0], y, q0[1]), (q1[0], y, q1[1]), (p1[0], y, p1[1]), '#D6CBB3')
    # escollera: rocas entre r 27,2 y 29,8 (bajo r 30), dejando libre la huella de los pantalanes
    m = piece('escollera')
    k = 0
    for psi in np.arange(247, 294, 2.6):
        if any(abs(psi - b) < 4.6 for b in BERTHS): continue
        for rr, h, rad in ((27.9, 1.5, 0.95), (29.0, 0.9, 0.75)):
            x, z = bearing(psi + rng.uniform(-0.8, 0.8), rr + rng.uniform(-0.2, 0.15))
            G.rock(m, x, z, rad, h + rng.uniform(-0.2, 0.3), rng, P['roca'] if k % 2 else P['roca.osc']); k += 1
    # --- pantalanes × 12 (D68): tablazón de 3,6 × 5,4 m (r 24,5–29,9) sobre pilotes, con 2 bolardos
    m = piece('pantalanes')
    for psi in BERTHS:
        a = math.radians(psi); d = np.array([math.sin(a), 0, math.cos(a)]); t = np.array([math.cos(a), 0, -math.sin(a)])
        o = np.array([0, TOP + 0.12, 0]) + d * 24.5 - t * 1.8
        m.tiled(o + t * 3.6, -t, d, 3.6, 5.4, 'tabla')  # tapa (normal +Y)
        for side in (-1, 1):
            e = d * 24.5 + t * side * 1.8
            m.wall((e[0] + d[0] * 5.4, e[2] + d[2] * 5.4), (e[0], e[2]), TOP - 0.15, TOP + 0.12, 'tabla', col=np.array([0.7, 0.7, 0.7])) if side == 1 else m.wall((e[0], e[2]), (e[0] + d[0] * 5.4, e[2] + d[2] * 5.4), TOP - 0.15, TOP + 0.12, 'tabla', col=np.array([0.7, 0.7, 0.7]))
        f = d * 29.9
        m.wall((f[0] - t[0] * 1.8, f[2] - t[2] * 1.8), (f[0] + t[0] * 1.8, f[2] + t[2] * 1.8), TOP - 0.15, TOP + 0.12, 'tabla', col=np.array([0.7, 0.7, 0.7]))
        for side in (-1, 1):
            c = d * 29.5 + t * side * 1.5
            G.cylinder(m, c[0], c[2], 0.17, 0.17, -0.6, TOP + 0.65, 6, col=P['madera.osc'], top=True)
        for rr in (26.0, 27.7):
            for side in (-1, 1):
                c = d * rr + t * side * 1.5
                if sector(psi) != 'muelle': G.cylinder(m, c[0], c[2], 0.15, 0.15, -0.6, TOP, 5, col=P['madera.osc'])
    # --- murallas al norte: 3 baluartes (125°, 180°, 235°), cortinas y cubos en los extremos (100° y 260°)
    wall = piece('murallas')
    H_W = TOP + 4.8      # adarve
    RG = 19.5            # gola de los baluartes
    def bast_pts(psi):
        a = math.radians(psi); c = np.array([math.sin(a), math.cos(a)]); p = np.array([math.cos(a), -math.sin(a)])
        L = lambda u, v: tuple(c * (RG + u) + p * v)
        return [L(0, 4.0), L(1.7, 4.3), L(3.7, 0.0), L(1.7, -4.3), L(0, -4.0)]  # gola+, hombro+, saliente, hombro−, gola−
    BAS = [125, 180, 235]
    trace = [bearing(100, RG)]
    for psi in BAS: trace += bast_pts(psi)
    trace.append(bearing(260, RG))
    # el trazado va de este a oeste por el norte; en pantalla, de derecha a izquierda pasando por arriba
    def outer_face(a, b, base_off=0.5):
        a, b = np.array(a), np.array(b); dv = b - a; L = np.linalg.norm(dv); dv /= L
        n = np.array([-dv[1], dv[0]])  # hacia fuera (al norte) para el sentido este → oeste
        # talud de TOP a TOP + 1,8 con la base 0,5 m hacia fuera, cordón y paño vertical hasta el adarve
        A0 = a + n * base_off; B0 = b + n * base_off
        wall.tiled((A0[0], TOP, A0[1]), (dv[0], 0, dv[1]), (-n[0] * base_off, 1.8, -n[1] * base_off), L, math.hypot(1.8, base_off), 'sillar', np.array([0.86, 0.86, 0.86]))
        wall.tiled((a[0], TOP + 1.8, a[1]), (dv[0], 0, dv[1]), (0, 1, 0), L, H_W - TOP - 1.8, 'sillar')
        cn = n * 0.16
        wall.solid((a[0] + cn[0], TOP + 1.8, a[1] + cn[1]), (b[0] + cn[0], TOP + 1.8, b[1] + cn[1]), (b[0] + cn[0], TOP + 2.05, b[1] + cn[1]), (a[0] + cn[0], TOP + 2.05, a[1] + cn[1]), P['sillar.claro'])
        wall.solid((a[0], TOP + 2.05, a[1]), (b[0], TOP + 2.05, b[1]), (b[0] + cn[0], TOP + 2.05, b[1] + cn[1]), (a[0] + cn[0], TOP + 2.05, a[1] + cn[1]), P['sillar.claro'])
        # parapeto de 0,6 m de grueso y 0,9 de alto, con almenas de 0,9 m cada 1,7 m
        ip = n * -0.6
        wall.tiled((a[0], H_W, a[1]), (dv[0], 0, dv[1]), (0, 1, 0), L, 0.9, 'sillar')
        wall.tiled((b[0] + ip[0], H_W, b[1] + ip[1]), (-dv[0], 0, -dv[1]), (0, 1, 0), L, 0.9, 'sillar', np.array([0.9, 0.9, 0.9]))
        wall.solid((a[0], H_W + 0.9, a[1]), (b[0], H_W + 0.9, b[1]), (b[0] + ip[0], H_W + 0.9, b[1] + ip[1]), (a[0] + ip[0], H_W + 0.9, a[1] + ip[1]), P['sillar.claro'])
        k = 0.45
        while k + 0.9 <= L - 0.3:
            p0 = a + dv * k; p1 = a + dv * (k + 0.9)
            G.box(wall, (p0[0] + p1[0]) / 2 + ip[0] / 2, (p0[1] + p1[1]) / 2 + ip[1] / 2, 0.9, 0.6, H_W + 0.9, H_W + 1.5, 'white', top='white',
                  rot=math.atan2(dv[0], dv[1]) - math.pi / 2, col=P['sillar'], top_col=P['sillar.claro'])
            k += 1.7
    for i in range(len(trace) - 1):
        outer_face(trace[i], trace[i + 1])
    # cortinas: cara interior (al sur, la que ve la cámara) a 3 m del trazado entre baluartes, y el adarve
    gola = [bearing(100, RG)] + [q for psi in BAS for q in (bast_pts(psi)[0], bast_pts(psi)[4])] + [bearing(260, RG)]
    for i in range(0, len(gola), 2):
        a, b = np.array(gola[i]), np.array(gola[i + 1])
        dv = b - a; L = np.linalg.norm(dv); dv /= L; n = np.array([-dv[1], dv[0]])
        ia, ib = a - n * 3.0, b - n * 3.0
        wall.tiled((ib[0], TOP, ib[1]), (-dv[0], 0, -dv[1]), (0, 1, 0), L, H_W - TOP, 'sillar', np.array([0.93, 0.93, 0.93]))
        ao(wall, tuple(ia), tuple(ib), tuple(-n), w=0.9)
        wall.tiled((ia[0], H_W, ia[1]), (dv[0], 0, dv[1]), (n[0], 0, n[1]), L, 3.0, 'losa', np.array([0.78, 0.76, 0.72]))
    # baluartes: terraplén macizo (tapa de losas al nivel del adarve) y cara interior de la gola
    for psi in BAS:
        pts = bast_pts(psi)
        c = np.mean(pts, axis=0)
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            wall.tri((a[0], H_W, a[1]), (b[0], H_W, b[1]), (c[0], H_W, c[1]), AT.uv('cesped', 0, 0), AT.uv('cesped', 1, 0), AT.uv('cesped', 0.5, 1))
        a, b = pts[4], pts[0]
        wall.wall(b, a, TOP, H_W, 'sillar', col=np.array([0.93, 0.93, 0.93]))
        wall.tri((a[0], H_W, a[1]), (b[0], H_W, b[1]), (c[0], H_W, c[1]), AT.uv('cesped', 0, 0), AT.uv('cesped', 1, 0), AT.uv('cesped', 0.5, 1))
    # cubos de los extremos (torres redondas de r 2,2) donde la muralla termina
    for psi in (100, 260):
        x, z = bearing(psi, RG - 1.0)
        G.cylinder(wall, x, z, 2.5, 2.2, TOP, TOP + 1.6, 10, reg=None, col=P['sillar'])
        G.cylinder(wall, x, z, 2.2, 2.2, TOP + 1.6, H_W + 0.9, 10, reg='sillar')
        G.cylinder(wall, x, z, 1.7, 1.7, H_W + 0.9, H_W + 0.95, 10, col='#B3AA96', top=True)
    # garitas en los 3 salientes (la de San Juan): ménsula cónica, cuerpo, cúpula y remate
    gar = piece('garitas')
    for psi in BAS:
        x, z = bearing(psi, RG + 3.3); garita(gar, x, z, H_W)
    for psi in (100, 260):
        x, z = bearing(psi, RG - 1.0); garita(gar, x, z, H_W + 0.95, corbel=False)
    # garita de la playa (la imagen de San Juan, en primer plano para la cámara): peana de piedra de 2,8 m en el borde
    # entre la playa y el muelle, en el hueco entre los amarres de 315° y 345°
    gx, gz = bearing(336.5, 26.6)
    G.box(gar, gx, gz, 2.8, 2.8, 0.2, TOP + 1.9, 'sillar', top='losa', rot=math.radians(336.5)); foot('garita de la playa', gx, gz, 3.2, 3.2, math.radians(336.5))
    G.box(gar, gx, gz, 3.2, 3.2, -0.6, 0.6, 'piedra', rot=math.radians(336.5))
    garita(gar, gx, gz, TOP + 1.9, corbel=False, scale=1.1)
    # faro en la gola del baluarte norte (rayas rojas y blancas, linterna y cúpula)
    far = piece('faro')
    fx, fz = 0.0, -18.2
    G.cylinder(far, fx, fz, 2.1, 2.1, TOP, TOP + 0.9, 10, reg='sillar')
    ys = np.linspace(TOP + 0.9, 13.2, 6)
    for i in range(5):
        r0 = 1.45 - 0.08 * i; r1 = 1.45 - 0.08 * (i + 1)
        G.cylinder(far, fx, fz, r0, r1, ys[i], ys[i + 1], 10, col=P['faro'] if i % 2 == 0 else P['faro.franja'])
    G.cylinder(far, fx, fz, 1.3, 1.3, 13.2, 13.4, 10, col=P['capitel'], top=False)
    G.cylinder(far, fx, fz, 0.8, 0.8, 13.4, 14.4, 8, col=P['linterna'])
    G.dome(far, fx, fz, 0.95, 14.4, 8, 2, P['capitel'], squash=0.8)
    # --- puerta roja: cuerpo de guardia de 6,5 × 2,6 m en la muralla interior, de cara a la plaza
    gate = piece('puerta_roja')
    GZ = -8.0
    G.box(gate, 0, GZ, 6.5, 2.6, TOP, TOP + 5.0, 'sillar', top='losa'); foot('puerta roja', 0, GZ, 6.5, 2.6)
    gate.tiled((-2.0, TOP, GZ + 1.31), (1, 0, 0), (0, 1, 0), 4.0, 4.0, 'porton')            # portón (sobre la cara sur)
    gate.solid((-3.45, TOP + 5.0, GZ + 1.4), (3.45, TOP + 5.0, GZ + 1.4), (3.45, TOP + 5.35, GZ + 1.4), (-3.45, TOP + 5.35, GZ + 1.4), P['sillar.claro'])
    gate.solid((-3.45, TOP + 5.35, GZ - 1.4), (3.45, TOP + 5.35, GZ - 1.4), (3.45, TOP + 5.35, GZ + 1.4), (-3.45, TOP + 5.35, GZ + 1.4), P['sillar.claro'])
    G.prism(gate, (2.6, TOP + 5.35, GZ), (2.6, TOP + 11.0, GZ), 0.09, 4, P['mastil'])
    gate.soltri((2.6, TOP + 10.9, GZ), (2.6, TOP + 9.7, GZ), (4.6, TOP + 10.3, GZ + 0.15), P['flag'])
    gate.soltri((2.6, TOP + 10.9, GZ), (4.6, TOP + 10.3, GZ + 0.15), (2.6, TOP + 9.7, GZ), P['flag'])
    ao(gate, (-3.25, GZ + 1.3), (3.25, GZ + 1.3), (0, 1))
    # muralla interior baja (3,2 m) de la puerta a los cubos: cierra el patio del fuerte
    inner = [(3.25, GZ), (13.0, GZ), bearing(100, RG - 2.4)]
    for sgn in (1, -1):
        pts = [(sgn * x, z) for x, z in inner]
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            dv = np.subtract(b, a); L = float(np.linalg.norm(dv)); u = dv / L; n = np.array([u[1], -u[0]]) * sgn
            s_a, s_b = np.array(a) + n * 0.6, np.array(b) + n * 0.6   # cara sur (de cara a la plaza)
            (gate.wall(tuple(s_a), tuple(s_b), TOP, TOP + 3.2, 'sillar') if sgn == -1 else gate.wall(tuple(s_b), tuple(s_a), TOP, TOP + 3.2, 'sillar'))
            ao(gate, tuple(s_a), tuple(s_b), tuple(n))
            gate.solid((s_a[0], TOP + 3.2, s_a[1]), (s_b[0], TOP + 3.2, s_b[1]), (s_b[0] - 1.2 * n[0], TOP + 3.2, s_b[1] - 1.2 * n[1]), (s_a[0] - 1.2 * n[0], TOP + 3.2, s_a[1] - 1.2 * n[1]), P['sillar.claro'])
    # --- patio del fuerte: capitanía (2 plantas, blanca con postigos azules) y 2 ceibas
    pat = piece('patio')
    house(pat, 0, -13.2, 8.0, 4.2, 2, 'blanca', roof='hip', door=True)
    G.tree(pat, -8.6, -12.6, TOP, 6.5, rng); G.tree(pat, 8.4, -12.9, TOP, 6.0, rng)
    # césped del patio: celdas polares entre la muralla interior (z = −8) y la cara interior de las cortinas (r 16,3)
    for psi in np.arange(120, 240, 6.0):
        r_in = [8.6 / abs(math.cos(math.radians(a))) for a in (psi, psi + 6)]
        if max(r_in) >= 16.0: continue
        a0, a1 = bearing(psi, r_in[0]), bearing(psi + 6, r_in[1]); b0, b1 = bearing(psi, 16.0), bearing(psi + 6, 16.0)
        y = TOP + 0.02
        pat.quad((a0[0], y, a0[1]), (b0[0], y, b0[1]), (b1[0], y, b1[1]), (a1[0], y, a1[1]), AT.uv('cesped', 0, 0), AT.uv('cesped', 0, 1), AT.uv('cesped', 0.4, 1), AT.uv('cesped', 0.4, 0))
    pat.ground(-1.1, -12.0, 1.1, -9.3, TOP + 0.04, 'losa')
    for psi in (125, 235):  # gallardetes dorados (los del puerto, `flag`) en los baluartes
        x, z = bearing(psi, RG + 1.6)
        G.prism(pat, (x, H_W, z), (x, H_W + 3.6, z), 0.07, 4, P['mastil'])
        pat.soltri((x, H_W + 3.55, z), (x, H_W + 2.75, z), (x + 1.5, H_W + 3.15, z + 0.1), P['flag'])
        pat.soltri((x, H_W + 3.55, z), (x + 1.5, H_W + 3.15, z + 0.1), (x, H_W + 2.75, z), P['flag'])
    # --- ciudad: casas de colores alrededor de la plaza, iglesia, almacenes, fuente
    town = piece('casas')
    HOUSES = [  # (x, z, ancho (x local), fondo, plantas, color, tejado, giro)
        (-11.6, -3.6, 5.0, 5.6, 2, 'ocre', 'flat', math.pi / 2), (-11.9, 1.6, 4.6, 5.8, 2, 'azul', 'gable', math.pi / 2), (-11.4, 6.8, 5.2, 5.6, 2, 'menta', 'flat', math.pi / 2),
        (11.6, -3.6, 5.0, 5.6, 2, 'rosa', 'flat', -math.pi / 2), (11.9, 1.6, 4.6, 5.8, 2, 'celeste', 'gable', -math.pi / 2), (11.4, 6.8, 5.2, 5.6, 2, 'amarilla', 'flat', -math.pi / 2),
        (13.4, 12.6, 4.8, 4.4, 2, 'rosa', 'flat', 0.0), (-9.6, 20.0, 3.4, 3.4, 1, 'celeste', 'gable', 0.0), (12.4, 19.0, 4.0, 3.8, 1, 'ocre', 'gable', 0.0),
    ]
    for (x, z, sx, sz, fl, col, roof, rot) in HOUSES:
        house(town, x, z, sx, sz, fl, col, roof=roof, rot=rot, door=True)
    church(town, -14.6, 14.0)
    store = piece('almacenes')
    house(store, 18.0, 6.2, 7.6, 4.6, 1, 'blanca', roof='gable', rot=math.pi / 2, door=True, floor_h=3.8)
    house(store, -18.4, 3.4, 6.0, 4.2, 1, 'blanca', roof='gable', rot=-math.pi / 2, door=True, floor_h=3.4)
    fountain(town, 0.0, 1.5)
    town.ground(-7.2, -6.4, 7.2, 7.4, TOP + 0.02, 'losa', col=np.array([1.12, 1.04, 0.9]))   # plaza enlosada
    for (x, z, k, rot) in ((-3.6, 6.0, 'a', 0.0), (3.6, 6.0, 'b', 0.0), (-4.8, -2.6, 'c', math.pi / 2), (4.8, -2.6, 'a', -math.pi / 2)):
        stall(town, x, z, k, rot)
    for (x, z, k) in ((-8.2, -7.0, 0), (8.2, -7.0, 1), (-11.6, -7.0, 1), (11.6, -7.0, 0), (-11.0, 15.6, 0), (-16.6, 0.4, 1), (9.2, 9.4, 0), (-6.8, 9.6, 1)):
        G.blob(town, x, TOP + 0.9, z, 0.9, P['buganvilla' if k == 0 else 'buganvilla2'])
        G.blob(town, x + 0.6, TOP + 0.5, z + 0.3, 0.6, '#4E8A3C')
    # --- astillero de D68 (sur, de cara a la cámara), con la grada en tablas oscuras y el cobertizo de tejas
    yard = piece('astillero')
    shipyard(yard)
    # --- grúa y carga (este, en el hueco de 90°) y carga junto a los almacenes
    crane = piece('grua_carga')
    G.cylinder(crane, 23.0, 0.0, 0.35, 0.3, TOP, TOP + 7.0, 6, col=P['mastil'])
    G.prism(crane, (23.0, TOP + 7.0, 0.0), (29.2, TOP + 8.2, 0.0), 0.15, 4, P['mastil'])
    G.prism(crane, (29.0, TOP + 8.1, 0.0), (29.0, TOP + 3.5, 0.0), 0.05, 3, '#3A2A20')
    for (x, z, sx, sy, sz, c) in ((20.6, 3.2, 1.2, 1.0, 1.2, 'carga'), (21.0, 4.6, 1.0, 0.9, 1.0, 'carga'), (19.9, -3.3, 1.2, 1.0, 1.2, 'carga'),
                                  (20.6, 3.2, 1.0, 0.8, 1.0, 'carga'), (21.3, -4.4, 0.9, 0.8, 0.9, 'saco'), (19.0, 9.6, 1.4, 1.0, 1.0, 'carga'),
                                  (-21.0, 7.4, 1.2, 0.9, 1.2, 'carga'), (-20.2, 8.6, 1.0, 0.8, 1.0, 'saco')):
        ybase = TOP + (1.0 if (x, z) == (20.6, 3.2) and sx == 1.0 else 0.0)
        G.box(crane, x, z, sx, sz, ybase, ybase + sy, 'white', top='white', col=P[c], top_col=np.asarray(G.hexlin(P[c])) * 1.12, rot=0.2)
    for (x, z) in ((21.6, -2.2), (22.2, -3.4), (20.4, 10.8), (-19.9, 9.9)):
        G.cylinder(crane, x, z, 0.4, 0.4, TOP, TOP + 1.0, 7, col=P['barril'], top=True, top_col='#6E4528')
    # carga en la raíz de 5 pantalanes (r 24,7–26,4): la punta queda libre para el barco atracado
    for psi in (45, 105, 135, 225, 345):
        a = math.radians(psi); d = np.array([math.sin(a), math.cos(a)]); t = np.array([math.cos(a), -math.sin(a)])
        y0 = TOP + 0.12
        for (rr, tt, kind, sx, sy) in ((25.2, -0.9, 'carga', 1.0, 0.9), (25.3, 0.4, 'barril', 0.8, 0.9), (26.1, -0.7, 'saco', 0.9, 0.5), (25.1, 1.1, 'carga', 0.8, 0.7)):
            c = d * rr + t * tt
            if kind == 'barril':
                G.cylinder(crane, c[0], c[1], 0.38, 0.38, y0, y0 + sy, 7, col=P['barril'], top=True, top_col='#6E4528')
            else:
                G.box(crane, c[0], c[1], sx, sx, y0, y0 + sy, 'white', top='white', col=P[kind], top_col=np.asarray(G.hexlin(P[kind])) * 1.12, rot=a + 0.15)
    # --- vegetación: palmeras (prop_palm, instancias en el juego) y arbustos
    palms = piece('palmeras')
    SPOTS = [(-6.4, -3.2), (6.6, -3.0), (-6.2, 6.2), (6.4, 6.4), (-20.5, -0.4), (-22.4, 5.6), (-21.0, 11.4), (-18.6, 15.8), (-15.4, 20.6), (-20.4, 17.8),
             (16.6, 15.0), (20.6, 13.4), (16.4, -2.2), (-16.6, -6.6), (-3.8, -16.0), (4.4, -16.2), (15.2, 20.6)]
    for (x, z) in SPOTS:
        # cerca del borde, la palmera se inclina hacia dentro para que ninguna hoja pase de r 30 (AC-103)
        lean = math.atan2(-x, -z) if math.hypot(x, z) > 17 else None
        G.palm(palms, x, z, TOP if math.hypot(x, z) < 23.5 else 0.6, rng.uniform(5.6, 7.4), rng, lean=lean)
    for (x, z) in ((-16.4, 6.0), (15.0, -6.0), (-3.0, 10.4), (3.2, 10.6)):
        G.blob(palms, x, TOP + 0.5, z, 0.75, '#4E8A3C')
    # --- botes varados en la playa
    boats = piece('botes')
    for (psi, rr, rot) in ((306, 27.2, 0.6), (330, 26.8, -0.3)):
        x, z = bearing(psi, rr); boat(boats, x, z, 0.35, rot + math.radians(psi))


def house(m, x, z, sx, sz, floors, color, roof='gable', rot=0.0, door=True, floor_h=2.8):
    """Casa colonial: fachada de cal de color con un vano de 2 × 3 m por planta (escalado a floor_h), puerta en la cara
    que mira a +z local, y tejado a dos o cuatro aguas de tejas, o azotea con pretil blanco."""
    H = TOP + floors * floor_h
    foot(f'casa {color} ({x:g}, {z:g})', x, z, sx, sz, rot)
    c, s = math.cos(rot), math.sin(rot)
    def P2(u, v): return (x + c * u + s * v, z - s * u + c * v)
    hx, hz = sx / 2, sz / 2
    corners = [P2(-hx, hz), P2(hx, hz), P2(hx, -hz), P2(-hx, -hz)]
    reg = 'fachada.' + color
    _, _, _, _, mw, mh = AT.reg[reg]
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]; mid = ((a[0] + b[0]) / 2 - x, (a[1] + b[1]) / 2 - z)
        ao(m, a, b, mid)
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, round(L / mw))
        for f in range(floors):
            y0 = TOP + f * floor_h
            for k in range(n):
                pa = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); pb = (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)
                W = AT.uv
                m.quad((pa[0], y0, pa[1]), (pb[0], y0, pb[1]), (pb[0], y0 + floor_h, pb[1]), (pa[0], y0 + floor_h, pa[1]),
                       W(reg, 0, 1), W(reg, 1, 1), W(reg, 1, 0), W(reg, 0, 0))
    if door:
        a, b = corners[0], corners[1]; mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        nv = np.array([s, c]) * 0.03; dvec = np.array([b[0] - a[0], b[1] - a[1]]); dvec /= np.linalg.norm(dvec)
        pa = np.array(mid) - dvec * 0.8 + nv; pb = np.array(mid) + dvec * 0.8 + nv
        m.tiled((pa[0], TOP, pa[1]), (dvec[0], 0, dvec[1]), (0, 1, 0), 1.6, 2.4, 'puerta')
    if roof == 'flat':
        tint = np.array([1.0, 0.72, 0.6]) if color in ('ocre', 'azul', 'celeste') else np.ones(3)
        m.tiled((corners[0][0], H, corners[0][1]), (corners[1][0] - corners[0][0], 0, corners[1][1] - corners[0][1]),
                (corners[3][0] - corners[0][0], 0, corners[3][1] - corners[0][1]), sx, sz, 'azotea', tint)
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            m.solid((a[0], H, a[1]), (b[0], H, b[1]), (b[0], H + 0.45, b[1]), (a[0], H + 0.45, a[1]), P['cal'])
            m.solid((a[0], H + 0.45, a[1]), (b[0], H + 0.45, b[1]), (b[0] * 0.98 + x * 0.02, H + 0.45, b[1] * 0.98 + z * 0.02), (a[0] * 0.98 + x * 0.02, H + 0.45, a[1] * 0.98 + z * 0.02), P['cal'])
    elif roof == 'hip':
        G.hip(m, x, z, sx, sz, H, 1.9, 'teja', rot=rot)
    else:
        G.gable(m, x, z, sx, sz, H, 1.25, 'teja', rot=rot, gable_col=P[color] if color in P else P['cal'])


def church(m, x, z):
    """Iglesia de cal amarilla mirando al sur, con nave a dos aguas y espadaña de 2 campanas sobre la fachada."""
    sx, sz, h = 5.5, 8.0, 6.4
    foot('iglesia', x, z, sx, sz)
    corners = [(x - sx / 2, z + sz / 2), (x + sx / 2, z + sz / 2), (x + sx / 2, z - sz / 2), (x - sx / 2, z - sz / 2)]
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, round(L / 2.0))
        for k in range(n):
            pa = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); pb = (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)
            W = AT.uv
            m.quad((pa[0], TOP, pa[1]), (pb[0], TOP, pb[1]), (pb[0], TOP + h, pb[1]), (pa[0], TOP + h, pa[1]), W('fachada.amarilla', 0, 1), W('fachada.amarilla', 1, 1), W('fachada.amarilla', 1, 0.35), W('fachada.amarilla', 0, 0.35))
    m.tiled((x - 0.8, TOP, z + sz / 2 + 0.03), (1, 0, 0), (0, 1, 0), 1.6, 2.4, 'puerta')
    G.gable(m, x, z, sz, sx, TOP + h, 2.2, 'teja', rot=math.pi / 2, gable_col=P['amarilla'])
    for i in range(4):
        aa, bb = corners[i], corners[(i + 1) % 4]; ao(m, aa, bb, ((aa[0] + bb[0]) / 2 - x, (aa[1] + bb[1]) / 2 - z))
    # espadaña: hastial plano sobre la fachada sur
    m.tiled((x - 1.5, TOP + h, z + sz / 2 + 0.05), (1, 0, 0), (0, 1, 0), 3.0, 3.0, 'espadana')
    m.soltri((x - 1.5, TOP + h + 3.0, z + sz / 2 + 0.05), (x + 1.5, TOP + h + 3.0, z + sz / 2 + 0.05), (x, TOP + h + 3.9, z + sz / 2 + 0.05), P['cal'])
    G.prism(m, (x, TOP + h + 3.9, z + sz / 2 + 0.05), (x, TOP + h + 4.8, z + sz / 2 + 0.05), 0.07, 4, P['herraje'])
    G.prism(m, (x - 0.35, TOP + h + 4.5, z + sz / 2 + 0.05), (x + 0.35, TOP + h + 4.5, z + sz / 2 + 0.05), 0.06, 4, P['herraje'])


def garita(m, x, z, y0, corbel=True, scale=1.0):
    """Garita de San Juan: ménsula cónica, cuerpo cilíndrico de sillar, cornisa, cúpula y remate."""
    r = 0.95 * scale
    if corbel: G.cylinder(m, x, z, 0.35 * scale, r, y0 - 0.9 * scale, y0, 8, col=P['sillar'])
    G.cylinder(m, x, z, r, r, y0, y0 + 2.2 * scale, 8, reg='sillar')
    for a in (0.0, math.pi):  # aspilleras oscuras al sur y al norte
        m.solid((x + 0.12 * math.cos(a), y0 + 1.2 * scale, z + (r + 0.01) * math.cos(a)), (x - 0.12 * math.cos(a), y0 + 1.2 * scale, z + (r + 0.01) * math.cos(a)),
                (x - 0.12 * math.cos(a), y0 + 1.9 * scale, z + (r + 0.01) * math.cos(a)), (x + 0.12 * math.cos(a), y0 + 1.9 * scale, z + (r + 0.01) * math.cos(a)), P['vidrio'])
    G.cylinder(m, x, z, r + 0.13 * scale, r + 0.13 * scale, y0 + 2.2 * scale, y0 + 2.4 * scale, 8, col=P['sillar.claro'])
    G.dome(m, x, z, r + 0.1 * scale, y0 + 2.4 * scale, 8, 3, '#D8BB86', squash=0.95)
    G.blob(m, x, y0 + 2.4 * scale + 1.15 * scale, z, 0.22 * scale, P['sillar.claro'])


def ao(m, a, b, out, w=0.7, reg='empedrado', tint=0.62):
    """Oclusión horneada (D23) al pie de una pared: franja de suelo oscurecida de a a b, w m hacia `out` (x, z)."""
    a, b, out = np.array(a, float), np.array(b, float), np.array(out, float); out /= np.linalg.norm(out)
    y = TOP + 0.025; c = np.ones(3) * tint
    p = [a, b, b + out * w, a + out * w]
    L = np.linalg.norm(b - a) / AT.reg[reg][4]; d = w / AT.reg[reg][5]
    m.quad(*[(q[0], y, q[1]) for q in p], AT.uv(reg, 0, 0), AT.uv(reg, L, 0), AT.uv(reg, L, d), AT.uv(reg, 0, d), c)


def stall(m, x, z, k, rot):
    """Puesto de mercado de 2,4 × 1,6 m: 4 postes, toldo de rayas inclinado y mostrador con fruta."""
    foot('puesto', x, z, 2.6, 1.9, rot)
    c, s = math.cos(rot), math.sin(rot)
    def T(u, y, v): return (x + c * u + s * v, y, z - s * u + c * v)
    for (u, v) in ((-1.15, -0.75), (1.15, -0.75), (-1.15, 0.75), (1.15, 0.75)):
        G.prism(m, T(u, TOP, v), T(u, TOP + (2.5 if v < 0 else 2.1), v), 0.05, 4, P['mastil'])
    a, b, cc, d = T(-1.3, TOP + 2.1, 0.95), T(1.3, TOP + 2.1, 0.95), T(1.3, TOP + 2.55, -0.85), T(-1.3, TOP + 2.55, -0.85)
    W = AT.uv; r = 'toldo.' + k
    m.quad(a, b, cc, d, W(r, 0, 1), W(r, 1, 1), W(r, 1, 0), W(r, 0, 0))
    G.box(m, x, z, 2.0 if rot == 0 else 0.7, 0.7 if rot == 0 else 2.0, TOP, TOP + 0.85, 'tabla', top='tabla')
    for i, col in enumerate(('#E8A92E', '#D9542B', '#7DBB3E')):
        u = -0.6 + 0.6 * i; G.blob(m, T(u, 0, 0)[0], TOP + 0.97, T(u, 0, 0)[2], 0.22, col)


def fountain(m, x, z):
    foot('fuente', x, z, 3.6, 3.6)
    G.cylinder(m, x, z, 1.8, 1.8, TOP, TOP + 0.55, 8, reg='sillar', top=False)
    G.cylinder(m, x, z, 1.55, 1.55, TOP + 0.5, TOP + 0.5, 8, col=P['agua.fuente'], top=True)
    G.cylinder(m, x, z, 0.35, 0.25, TOP + 0.5, TOP + 1.7, 6, col=P['sillar.claro'], top=True)
    G.blob(m, x, TOP + 1.8, z, 0.3, P['sillar.claro'])


def shipyard(m):
    """La grada y el casco a medio construir de D68 (ASSET-SPEC §9.5), con tablas y tejas."""
    def ramp(zz): return TOP + 1.2 - (zz - 12.0) / 17.5 * 1.05
    o = (-3.0, ramp(29.5), 29.5)
    m.tiled(o, (1, 0, 0), (0, ramp(12.0) - ramp(29.5), -17.5), 6.0, math.hypot(17.5, 1.05), 'tabla', col=np.array([0.55, 0.52, 0.5]))
    for sx in (-3.0, 3.0):
        a, b = (sx, 12.0), (sx, 29.5)
        top0, top1 = ramp(12.0), ramp(29.5)
        (m.wall(b, a, TOP - 0.3, TOP, 'tabla', col=np.array([0.5, 0.5, 0.5])) if sx > 0 else m.wall(a, b, TOP - 0.3, TOP, 'tabla', col=np.array([0.5, 0.5, 0.5])))
        p = [(sx, TOP, 12.0), (sx, TOP, 29.5), (sx, top1, 29.5), (sx, top0, 12.0)]
        m.solid(*p, P['madera.osc'])
    m.solid((-3, TOP, 12.0), (3, TOP, 12.0), (3, ramp(12.0), 12.0), (-3, ramp(12.0), 12.0), P['madera.osc'])
    G.box(m, 0, 20.5, 0.5, 14.0, ramp(20.5), ramp(20.5) + 0.5, 'white', top='white', col=P['madera.nueva'])
    G.prism(m, (0, ramp(13.5) + 0.5, 13.5), (0, ramp(13.5) + 3.4, 12.9), 0.2, 4, P['madera.nueva'])
    for zz in np.arange(14.5, 27.0, 2.0):
        u = (zz - 13.5) / 14; w = max(0.8, 2.4 * math.sin(math.pi * (0.15 + 0.85 * u))); y0 = ramp(zz) + 0.5
        for sgn in (-1, 1):
            G.prism(m, (0, y0, zz), (sgn * w * 0.8, y0 + 0.5, zz), 0.17, 4, P['madera.nueva'])
            G.prism(m, (sgn * w * 0.8, y0 + 0.5, zz), (sgn * w, y0 + 2.8, zz), 0.17, 4, P['madera.nueva'])
    for sgn in (-1, 1): G.prism(m, (sgn * 3.8, TOP, 20.0), (0, 9.2, 20.0), 0.2, 4, P['mastil'])
    # cobertizo de tablas con tejas y madera apilada
    G.box(m, 7.6, 15.5, 4.4, 9.0, TOP, TOP + 3.0, 'tabla'); foot('cobertizo', 7.6, 15.5, 4.4, 9.0); foot('grada', 0, 20.75, 6.0, 17.5)
    G.gable(m, 7.6, 15.5, 9.0, 4.4, TOP + 3.0, 1.4, 'teja', rot=math.pi / 2, gable_col=P['tabla'])
    G.box(m, -6.4, 14.5, 2.0, 3.5, TOP, TOP + 1.0, 'tabla', top='tabla'); foot('madera 1', -6.4, 14.5, 2.0, 3.5); foot('madera 2', -6.4, 19.0, 2.0, 3.5)
    G.box(m, -6.4, 19.0, 2.0, 3.5, TOP, TOP + 0.6, 'tabla', top='tabla')


def boat(m, x, z, y0, rot):
    """Bote de remos varado (3,2 × 1,2 m): casco en V de color con borda blanca."""
    c, s = math.cos(rot), math.sin(rot)
    def T(u, y, v): return (x + c * u + s * v, y0 + y, z - s * u + c * v)
    L, B, Hh = 1.6, 0.6, 0.55
    for sgn in (-1, 1):
        m.solid(T(sgn * B, Hh, -L * 0.8), T(sgn * B, Hh, L * 0.7), T(0, 0.0, L * 0.6), T(0, 0.0, -L * 0.7), P['azul'] if sgn > 0 else P['azul'])
        m.soltri(T(sgn * B, Hh, L * 0.7), T(0, Hh + 0.1, L), T(0, 0.0, L * 0.6), P['azul'])
    m.solid(T(-B, Hh, -L * 0.8), T(B, Hh, -L * 0.8), T(B, Hh, L * 0.7), T(-B, Hh, L * 0.7), P['tabla'])


# ---------------------------------------------------------------- comprobaciones (las de D68 en scripts/ux/puerto.py)
def gaps():
    """Holgura en planta entre cada par de huellas (eje separador; < 0 = se solapan)."""
    def sep(A, B):
        best = -1e9
        for poly in (A, B):
            for i in range(len(poly)):
                (x1, z1), (x2, z2) = poly[i], poly[(i + 1) % len(poly)]
                nx, nz = z2 - z1, -(x2 - x1); L = math.hypot(nx, nz); nx /= L; nz /= L
                pa = [x * nx + z * nz for x, z in A]; pb = [x * nx + z * nz for x, z in B]
                best = max(best, min(pb) - max(pa), min(pa) - max(pb))
        return best
    out = sorted((round(sep(A, B), 2), a, b) for (a, A), (b, B) in __import__('itertools').combinations(FOOT, 2))
    return out


def check(all_p):
    p = np.asarray(all_p)
    up = p[p[:, 1] > 0.001]
    r = np.hypot(up[:, 0], up[:, 2])
    occ = np.hypot(up[:, 0], up[:, 2] - T55 * up[:, 1])
    return {'radio_max_y_pos': float(r.max()), 'oclusion_max': float(occ.max()),
            'oclusion_peor': [round(float(v), 2) for v in up[int(np.argmax(occ))]]}


if __name__ == '__main__':
    atlas = paint_atlas(); atlas.save(os.path.join(OUT, 'atlas_puerto.png'))
    build()
    P_all, T_all, C_all = [], [], []
    tris = {}
    for name, m in pieces.items():
        tris[name] = m.ntri(); P_all += m.p; T_all += m.t; C_all += m.c
    np.savez(os.path.join(OUT, 'puerto_lod0.npz'), p=np.array(P_all, float), t=np.array(T_all, float), c=np.array(C_all, float), r=np.zeros(len(P_all)))
    res = check(P_all)
    g = gaps(); res['holgura_min'] = g[0]; res['pares_bajo_0_5'] = [x for x in g if x[0] < 0.5]
    res['tris'] = tris; res['tris_total'] = sum(tris.values()); res['tris_sin_palmeras'] = res['tris_total'] - tris['palmeras']
    # costa de la playa (AC-199 a): dónde corta la arena la flotación, medido en la malla (los triángulos de la región
    # `arena` del atlas): radio mínimo y máximo, y su distancia por dentro del círculo de 30 m
    x0, y0, w, h, _, _ = AT.reg['arena']; A = np.array(P_all).reshape(-1, 3, 3); U = np.array(T_all).reshape(-1, 3, 2) * AT.size
    sel = ((U[..., 0] >= x0 - 1) & (U[..., 0] <= x0 + w + 1)).all(1) & ((((U[..., 1] >= y0 - 1) & (U[..., 1] <= y0 + h + 1))) | (((AT.size - U[..., 1]) >= y0 - 1) & ((AT.size - U[..., 1]) <= y0 + h + 1))).all(1)
    A = A[sel]; cut = []
    for k in range(3):
        pa, pb = A[:, k], A[:, (k + 1) % 3]; ya, yb = pa[:, 1], pb[:, 1]; mk = (ya > 0) != (yb > 0)
        cut.append(pa[mk] + (pb[mk] - pa[mk]) * (ya[mk] / (ya[mk] - yb[mk]))[:, None])
    rc = np.hypot(np.concatenate(cut)[:, 0], np.concatenate(cut)[:, 2])
    res['costa_playa_r'] = [round(float(rc.min()), 2), round(float(rc.max()), 2)]; res['costa_playa_por_dentro'] = [round(30 - float(rc.max()), 2), round(30 - float(rc.min()), 2)]
    json.dump(res, open(os.path.join(OUT, 'puerto-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(res, ensure_ascii=False))

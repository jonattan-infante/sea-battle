# Uso (desde la raíz del repo), tras scripts/ux/mapa/islas.py, puerto_colonial.py y presupuesto.py (y, para el peso,
# blender_islas.py con la compresión de ASSET-SPEC §13, paso 4, en $UX_OUT/mapa/comp/):
#   python3 -I scripts/ux/laminas/lamina_islas_selva.py  →  $UX_OUT/D83-islas-selva.png
# Lámina de las islas rediseñadas (D83) para Jonattan, en el formato aprobado (AC-192): el mapa entero con los círculos
# donde chocan los barcos, los 7 tipos a la misma escala desde arriba y como en el juego, una vista del juego en 1440×900 y
# otra en 390×844 con barcos, el antes y el después frente a la lámina anterior, las medidas y lo que tiene en contra en
# palabras llanas. Render por software con textura (scripts/ux/mapa/render_tex.py: la luz del juego) sobre el agua de §7.2;
# el «antes» sale de las recetas de la lámina anterior (recetas.py) con el renderizador de UX_RENDERER.
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, math, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'mapa'))
import rutas as RT
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import vistas as V, render_tex as RX, oceano as O, recetas as R0, escena as E
import circulos as CI, islas as IS

def font(px, w=600): return ImageFont.truetype(RT.FONTS + RT.FF[w], px, layout_engine=ImageFont.Layout.RAQM)
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42); WHITE = (255, 255, 255)
MAPA = os.path.join(RT.OUT, 'mapa')
MED = json.load(open(RT.need(os.path.join(MAPA, 'islas-medidas.json'), 'islas-medidas.json (islas.py)')))
PRE = json.load(open(RT.need(os.path.join(MAPA, 'presupuesto-vista.json'), 'presupuesto-vista.json (presupuesto.py)')))
FIR = json.load(open(RT.need(os.path.join(MAPA, 'firmas-grises.json'), 'firmas-grises.json (firmas.py)')))
REG = CI.check()
S55, C55 = math.sin(math.radians(55)), math.cos(math.radians(55))
def mil(n): return f'{n:,}'.replace(',', '.')
def dec(x, k): return f'{x:.{k}f}'.replace('.', ',')
def kb(path): return os.path.getsize(path) / 1000 if os.path.exists(path) else None

ATI = RX.srgb2lin(np.asarray(Image.open(os.path.join(MAPA, 'atlas_isla.png')).convert('RGB'), float))
ATP = RX.srgb2lin(np.asarray(Image.open(os.path.join(MAPA, 'atlas_puerto.png')).convert('RGB'), float))
IDS = [i for i in CI.ISLAS if i != 'PORT']
ISL = {i: np.load(os.path.join(MAPA, f'isla_{i}_lod0.npz')) for i in IDS}
PORT = np.load(os.path.join(MAPA, 'puerto_lod0.npz'))
WHITE_UV = np.array(IS.AT.uv('white', 0.5, 0.5))
ALLC = [c for v in CI.ISLAS.values() for c in v[4]]


def render(ids, ships, ppm, W, H, ox, oy, th, x0, z0, circles, port=False, SS=2):
    """Islas `ids` y barcos en una pasada (atlas de islas), el puerto en otra (su atlas), compuestas por cobertura sobre el
    agua: en estas vistas no se solapan en pantalla."""
    layers = []
    P = [ISL[i]['p'] for i in ids]; U = [ISL[i]['t'] for i in ids]; C = [ISL[i]['c'] for i in ids]
    if P:
        P, U, C, _ = RX.clip_below_water(np.concatenate(P), np.concatenate(U), np.concatenate(C)); N = [RX.face_normals(P)]; P = [P]; U = [U]; C = [C]
    for (p, u, c, n) in ships:
        p, u, c, n = RX.clip_below_water(p, u, c, n); P.append(p); U.append(u); C.append(c); N.append(n)
    if P: layers.append((np.concatenate(P), np.concatenate(U), np.concatenate(C), np.concatenate(N), ATI))
    if port:
        p, u, c, _ = RX.clip_below_water(PORT['p'], PORT['t'], PORT['c']); layers.append((p, u, c, RX.face_normals(p), ATP))
    out = O.ocean(W, H, ox, oy, ppm, th, circles, x0, z0) / 255.0
    for (p, u, c, n, at) in layers:
        col, cov = RX.render(p - np.array([x0, 0, z0]), u, c, at, ppm, W, H, ox, oy, th, SS=SS, N=n)
        out = col + (1 - cov[..., None]) * out
    return Image.fromarray(np.clip(np.round(out * 255), 0, 255).astype(np.uint8))


def bbox(ids):
    cs = [c for i in ids for c in CI.ISLAS[i][4]]
    x0, x1 = min(c[0] - c[2] for c in cs), max(c[0] + c[2] for c in cs); z0, z1 = min(c[1] - c[2] for c in cs), max(c[1] + c[2] for c in cs)
    return (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, cs


def pair(ids, ppm, m=8, hmax=18):
    """Planta y vista a 55° a la misma escala, centradas en la caja de los círculos."""
    cx, cz, w, h, cs = bbox(ids)
    W = int((w + 2 * m) * ppm); Hp = int((h + 2 * m) * ppm)
    Hg = int(((h + 2 * m) * S55 + hmax * C55) * ppm); oy = Hg - (h / 2 + m) * S55 * ppm
    plan = render(ids, [], ppm, W, Hp, W / 2, Hp / 2, 90, cx, cz, cs)
    game = render(ids, [], ppm, W, Hg, W / 2, oy, 55, cx, cz, cs)
    return plan, game, (cx, cz, W, Hg, oy)


# --- 1. el mapa entero, en planta
MP = 0.95; HALF = 500; Wm = int(2 * HALF * MP)
mapa = render(IDS, [], MP, Wm, Wm, Wm / 2, Wm / 2, 90, 0.0, 0.0, ALLC, port=True, SS=2); print('mapa', flush=True)
# --- 2. los 7 tipos a la misma escala
TYPES = [(['I1'], 'Tropical', 'I1, I5, I6', 'Selva densa de palmeras y árboles, playa ancha y una colina en la grande'),
         (['I3'], 'Volcán', 'I3, la mayor', 'Cono de 17 m con un lago de lava en el cráter, coladas negras y falda de selva oscura'),
         (['I4'], 'Acantilado', 'I4', 'Meseta de selva oscura y basalto que sube hacia el sur y cae al agua en una pared de 9 m; playa al norte'),
         (['I2'], 'Peñón', 'I2', 'Roca de basalto de 10 m con selva oscura encima, lóbulos de playa al sur y un islote'),
         (['T1'], 'Islote habitado', 'T1, T2', 'Pescadores: cabañas, embarcadero hacia el puerto y secadero de redes'),
         (['G1'], 'Cala pirata', 'G1 a G4', 'Atalaya con bandera en la roca, tiendas, hoguera y un pecio; la cala mira al puerto'),
         (['E1a', 'E1b', 'E1c'], 'Escollos', 'E1', 'Montones de piedras a flor de agua, de 1,2 m como mucho, con un paso de 31 m')]
PT = 4.0
cards = []
for ids, name, which, why in TYPES:
    pl, gm, _ = pair(ids, PT, hmax=18 if ids[0] not in ('E1a',) else 4); cards.append((pl, gm, ids, name, which, why)); print(name, flush=True)
# --- 3. como en el juego: 1440×900 con N1 a 1,0× (6,2 px/m), recorte de 1000×650 centrado en el barco propio
GP = 6.2; Wg, Hg = 1000, 650; TG = (205.0, 262.0)
ships_g = [V.ship_at('brig', TG[0], TG[1], 90, WHITE_UV), V.ship_at('frigate', 150, 236, 120, WHITE_UV), V.ship_at('sloop', 262, 284, 250, WHITE_UV)]
game = render(['I1', 'E1a', 'E1b', 'E1c'], ships_g, GP, Wg, Hg, Wg / 2, Hg / 2, 55, TG[0], TG[1], ALLC, SS=2); print('juego', flush=True)
# --- 4. en el móvil: 390×844 con N1 (2,82 px/m), el barco propio al centro
MPm = 2.82; Wo, Ho = 390, 844; TM = (238.0, -190.0)
ships_m = [V.ship_at('brig', TM[0], TM[1], 270, WHITE_UV), V.ship_at('frigate', 292, -150, 200, WHITE_UV)]
movil = render(['I4', 'T1'], ships_m, MPm, Wo, Ho, Wo / 2, Ho / 2, 55, TM[0], TM[1], ALLC, SS=3); print('móvil', flush=True)
# --- 5. antes (recetas de la lámina anterior) y ahora, con la misma cámara y escala
F67 = {f[0]: f for f in R0.FORMS}
O.M.TH = math.radians(55)
def before_after(iid, ppm, hmax=18, m=8):
    cx, cz, w, h, cs = bbox([iid])
    W = int((w + 2 * m) * ppm); Hb = int(((h + 2 * m) * S55 + hmax * C55) * ppm); oy = Hb - (h / 2 + m) * S55 * ppm
    _, kind, var, x, z, r = F67[iid]
    g = E.Geo(); g.add(R0.build(iid, kind, var, r, x, z), None, (x - cx, 0, z - cz))
    b = Image.fromarray(O.shot(g.export(), W, Hb, W / 2, oy, ppm, 55, [(x - cx, z - cz, r)], SS=2).astype(np.uint8))
    a = render([iid], [], ppm, W, Hb, W / 2, oy, 55, cx, cz, cs)
    return b, a
BA = [before_after('I1', 3.0), before_after('I4', 3.0)]; print('antes y ahora', flush=True)

# --- hoja
SW = 2040
sheet = Image.new('RGB', (SW, 6000), PAPER); d = ImageDraw.Draw(sheet)
d.text((40, 22), 'Islas rediseñadas: selva densa, costas irregulares y paredes de roca', font=font(32), fill=INK)
d.text((40, 66), 'Propuesta para sustituir la lámina anterior de islas. Cada isla es ahora una unión de círculos: su costa se ve irregular y sigue siendo justo donde chocan los barcos.', font=font(17, 500), fill=SOFT)
d.text((40, 92), 'Render con la luz y el agua del juego. Los barcos son los de hoy, de ejemplo: su aspecto lo deciden las familias de barcos, no esta lámina.', font=font(17, 500), fill=SOFT)
Y0 = 140
d.text((40, Y0), f'El mapa entero desde arriba (1000 × 1000 m, norte arriba): en blanco, los {REG["circulos"]} círculos donde chocan los barcos', font=font(19), fill=TITLE)
MX, MY = 40, Y0 + 34
ov = Image.new('RGBA', (Wm, Wm), (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
for iid, v in CI.ISLAS.items():
    for (x, z, r) in v[4]:
        px, py = Wm / 2 + x * MP, Wm / 2 + z * MP; od.ellipse((px - r * MP, py - r * MP, px + r * MP, py + r * MP), outline=(255, 255, 255, 150), width=1)
rz = 110 * MP; od.ellipse((Wm / 2 - rz, Wm / 2 - rz, Wm / 2 + rz, Wm / 2 + rz), outline=(242, 193, 78, 220), width=2)
mapa = Image.alpha_composite(mapa.convert('RGBA'), ov).convert('RGB')
sheet.paste(mapa, (MX, MY))
NAME = {'I1': 'I1 tropical', 'I2': 'I2 peñón', 'I3': 'I3 volcán', 'I4': 'I4 acantilado', 'I5': 'I5 tropical', 'I6': 'I6 tropical', 'T1': 'T1 islote',
        'T2': 'T2 islote', 'G1': 'G1 cala', 'G2': 'G2 cala', 'G3': 'G3 cala', 'G4': 'G4 cala', 'E1a': 'E1 escollos'}
for iid, nm in NAME.items():
    cx, cz, w, h, _ = bbox([iid]); px, py = MX + Wm / 2 + cx * MP, MY + Wm / 2 + (cz + h / 2) * MP + 4
    tw = d.textlength(nm, font=font(14)); d.text((px - tw / 2, py), nm, font=font(14), fill=WHITE)
d.text((MX + Wm / 2 - 40, MY + Wm / 2 + 34), 'Puerto', font=font(14), fill=WHITE)
tw = d.textlength('zona segura (110 m)', font=font(14)); d.text((MX + Wm / 2 - tw / 2, MY + Wm / 2 - rz + 10), 'zona segura (110 m)', font=font(14), fill=(242, 193, 78))
d.rectangle((MX + 60, MY + Wm - 20, MX + 60 + 100 * MP, MY + Wm - 16), fill=WHITE); d.text((MX + 10, MY + Wm - 27), '100 m', font=font(13), fill=WHITE)
# a la derecha del mapa: como en el juego
GX = MX + Wm + 50
d.text((GX, Y0), 'Como en el juego, en 1440×900 (cámara a 55°, 6,2 px por metro), recorte', font=font(19), fill=TITLE)
sheet.paste(game, (GX, MY))
d.text((GX, MY + Hg + 8), 'Tu Bergantín al centro, junto a la costa sur de I1, con una Fragata y una Balandra. A la izquierda, los escollos.', font=font(16, 500), fill=SOFT)
yy = MY + Hg + 50
mn = REG['minimos']
FACTS = [('Lo que no cambia', INK, [
            'El centro de cada isla, el puerto y la zona segura. Las islas nuevas, las de pescadores y las calas, están donde ya estaban previstas.',
            'La costa visible queda siempre de 0 a 3 m por dentro del borde donde chocan los barcos, y nada con altura sale más de 0,4 m.',
            f'Nada tapa a un barco: lo alto de cada isla tapa el agua como mucho a {dec(max(v["oclusion_fuera_max"] for v in MED.values()), 1)} m de su borde, y el barco más pequeño navega a 10.']),
         ('Disposición', INK, [
            f'{REG["circulos"]} círculos en todo el mapa. Entre islas distintas quedan como mínimo {dec(mn["separacion"][0], 1)} m (pide 46), y la más cercana a la zona segura queda a {dec(mn["zona_segura"][0], 1)} m de ella.',
            'Las calas piratas y la guarida del Capitán tienen sus pasos libres, con los márgenes que pide el juego.']),
         ('Cada tipo se reconoce, también en blanco y negro', INK, [
            'Las tropicales, por la playa ancha y el verde claro; las rocosas (lejos del puerto), por el basalto y la selva oscuros; las calas, por la arena y la roca; los escollos, por la piedra mojada.',
            f'Medido en el render, contando píxeles claros, medios y oscuros: los 5 tipos se separan entre sí al menos {dec(min(FIR["pares_centroides_Linf"].values()), 2)} (se pide 0,15), y cada isla se parece más a su tipo que a cualquier otro.'])]
for title, colr, lines in FACTS:
    d.text((GX, yy), title, font=font(19), fill=TITLE); yy += 30
    for ln in lines:
        line, ly = '', yy
        for wd in ln.split():
            t = (line + ' ' + wd).strip()
            if d.textlength('·  ' + t, font=font(16, 500)) > SW - GX - 40: d.text((GX + 16, ly), ('·  ' if ly == yy else '    ') + line, font=font(16, 500), fill=colr); ly += 24; line = wd
            else: line = t
        d.text((GX + 16, ly), ('·  ' if ly == yy else '    ') + line, font=font(16, 500), fill=colr); yy = ly + 28
    yy += 8
# --- los 7 tipos
Y1 = max(MY + Wm + 50, yy + 30)
d.text((40, Y1), f'Los 7 tipos a la misma escala ({dec(PT, 1)} px por metro): desde arriba y, debajo, como en el juego', font=font(19), fill=TITLE)
rows = [cards[:3], cards[3:]]; yy = Y1 + 36; gap = 40
for row in rows:
    x = 40; hp = max(c[0].height for c in row); hg = max(c[1].height for c in row)
    for (pl, gm, ids, name, which, why) in row:
        sheet.paste(pl, (x, yy + (hp - pl.height) // 2)); sheet.paste(gm, (x, yy + hp + 10 + (hg - gm.height) // 2))
        ty = yy + hp + 10 + hg + 8; w = max(pl.width, 230)
        tris = sum(MED[i]['tris_terreno'] + MED[i]['tris_props'] + MED[i]['tris_palmeras'] for i in ids)
        d.text((x, ty), name, font=font(19), fill=INK); d.text((x, ty + 26), f'{which} · {mil(tris)} triángulos', font=font(14, 500), fill=SOFT)
        line, ly = '', ty + 46
        for wd in why.split():
            t = (line + ' ' + wd).strip()
            if d.textlength(t, font=font(14, 500)) > w - 4: d.text((x, ly), line, font=font(14, 500), fill=SOFT); ly += 18; line = wd
            else: line = t
        d.text((x, ly), line, font=font(14, 500), fill=SOFT)
        x += max(pl.width, 230) + gap
    yy += hp + 10 + hg + 110
# --- antes y ahora, y el móvil
Y2 = yy + 10
d.text((40, Y2), 'Antes (la lámina anterior) y ahora, con la misma cámara y escala (3 px por metro)', font=font(19), fill=TITLE)
ya = Y2 + 34
for (b, a), nm in zip(BA, ('I1, tropical', 'I4, acantilado')):
    d.text((40, ya), f'{nm}: antes', font=font(15), fill=SOFT); sheet.paste(b, (40, ya + 24))
    d.text((40 + b.width + 16, ya), 'ahora', font=font(15), fill=SOFT); sheet.paste(a, (40 + b.width + 16, ya + 24))
    ya += 24 + b.height + 20
MXo = SW - 40 - Wo
d.text((MXo, Y2), 'En el móvil (390×844, 2,82 px/m)', font=font(19), fill=TITLE)
sheet.paste(movil, (MXo, Y2 + 34))
d.text((MXo - 330, Y2 + 34 + Ho // 2 - 30), 'Tu Bergantín al centro, al sur', font=font(16, 500), fill=SOFT)
d.text((MXo - 330, Y2 + 34 + Ho // 2 - 6), 'del acantilado (I4), y una Fragata.', font=font(16, 500), fill=SOFT)
yb = ya + 10
# --- medidas y en contra
glb_all, glb_i1 = kb(os.path.join(MAPA, 'comp', 'islands.glb')), kb(os.path.join(MAPA, 'comp', 'island_I1.glb'))
pt = PRE['peor_tris']; tot = PRE['total_mapa_tris']
BLOCKS = [
    ('Medidas', INK, [
        f'Las 15 islas suman {mil(tot - 7501)} triángulos, y con el puerto, {mil(tot)}. Se dibuja cada isla por separado, así que solo cuenta lo que está en pantalla.',
        f'La vista que más cuesta (con el cañón más largo y la cámara lo más alejada) enseña el puerto y 6 islas: {mil(pt["tris"])} triángulos y {pt["draw_calls"]} llamadas de dibujo, dentro del techo provisional (60.000 y 10).',
        (f'Descarga: las 15 islas, {dec(glb_all, 0)} KB comprimidas, en segundo plano; I1 sola, {dec(glb_i1, 0)} KB. Una textura de 512 × 512 para todas.' if glb_all else 'Una textura de 512 × 512 para todas.')]),
    ('En contra', RED, [
        f'Pesa mucho más que hoy: las islas y el puerto de la 1.0 suman unos 3.000 triángulos; estas islas, unos {mil(round(tot - 7501, -3))}. La vista peor usa el {round(100 * pt["tris"] / 60000)} % del techo provisional.',
        'La selva tapa el relieve suave: la colina de I1 apenas se nota. Lo que se lee desde lejos son las paredes de roca, el volcán y el color.',
        'Las paredes de roca miran al sur para que la cámara las vea; las del norte quedan de espaldas.',
        f'El agua tiene que dibujar la espuma de {REG["circulos"]} círculos en vez de 16. Es lo que más puede costar en el juego, y aún no está medido.',
        'En el móvil, la selva es una mancha verde con textura; las palmeras sueltas se distinguen en las playas.',
        'Las islas se descargan mientras se juega. Hasta que llegan, cada isla tiene que verse con su forma nueva en versión sencilla (arena y verde), nunca con la de hoy: chocarías con costas que no ves.']),
]
yy = max(yb, Y2 + 34 + Ho + 30)
for title, colr, lines in BLOCKS:
    d.text((40, yy), title, font=font(19), fill=TITLE if colr == INK else RED); yy += 30
    for ln in lines:
        d.text((56, yy), '·  ' + ln, font=font(16, 500), fill=colr); yy += 26
    yy += 12
sheet = sheet.crop((0, 0, SW, yy + 20))
out = os.path.join(RT.OUT, 'D83-islas-selva.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

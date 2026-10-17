# Fase 2 (1.1): hoja del minimapa con el mapa de la 1.1, el ancla del puerto (⚓ 13 px) y el marcador del galeón (▣ 10 px),
# con jugadores atracados en los amarres. Mismo raster que ad29py.py (líneas finas de Skia a DPR 1). Ampliada ×4.
# Uso: python3 -I scripts/ux/minimapa-hoja.py <salida.png>   (lee ad29py.py de la misma carpeta)
import sys, os, math
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'ad29py.py')).read().split('PH = [0')[0]
os.environ['JOIN'] = 'hairline'
ns = {'__name__': 'hoja'}; sys_argv = sys.argv; sys.argv = ['x', '24', '1', '']; exec(src, ns); sys.argv = sys_argv
import numpy as np
from PIL import Image, ImageDraw
C = ns['C']; Canvas = ns['Canvas']
ISL = [('PORT', 0, 0, 30), ('I1', 260, 200, 45), ('I2', -300, 170, 35), ('I3', -220, -280, 55), ('I4', 250, -260, 40), ('I5', 20, 360, 30),
       ('I6', -410, -30, 28), ('T1', 150, -150, 22), ('T2', -170, 150, 22), ('E1a', 140, 260, 7), ('E1b', 117.5, 299, 7), ('E1c', 162.5, 299, 7),
       ('G1', 368, -368, 20), ('G2', -368, -368, 20), ('G3', -368, 368, 20), ('G4', 368, 368, 20)]
L = {'sloop': 16, 'frigate': 34, 'navio': 42}
def mooring(k, cls):
    a = math.radians(15 + 30 * k); r = 30 + L[cls] / 2 + 2; return r * math.sin(a), r * math.cos(a), a
def draw_map(css, dpr):
    S = int(round(css * dpr)); ss = max(4, 8 // int(dpr)); ns['K'] = S * ss; cv = Canvas(S)
    s = S / 1000.0; px = lambda x: (x + 500) * s
    cv.fill_rgb(C['panel']); cv.fill_rgb(C['ocean'], 0.9)
    for n, x, z, r in ISL:
        if n == 'PORT': continue
        cv.paint(np.hypot(cv.X - px(x), cv.Y - px(z)) <= max(1.5 * dpr, r * s), C['sand'])
    # zona segura discontinua: trazos de 3 px CSS, color rgba(108,195,245,.85), ancho 1 px CSS
    d = np.hypot(cv.X - px(0), cv.Y - px(0)); ang = np.arctan2(cv.Y - px(0), cv.X - px(0)) % (2 * math.pi)
    R = 110 * s; arc = ang * R / dpr; on = (np.floor(arc / 3) % 2) == 0
    cv.paint((np.abs(d - R) <= dpr / 2) & on, np.array([108, 195, 245.]), 0.85)
    ns['CANDS']['ancla13'][1](cv, px(0), px(0), dpr, 0)  # el puerto: ancla en lugar del disco
    # entidades: jugadores atracados (○), mercante (■), pirata (◆), galeón (▣) y el propio atracado (▲)
    for k, cls in ((1, 'frigate'), (2, 'navio'), (6, 'sloop'), (9, 'sloop')):
        x, z, a = mooring(k, cls); ns['ring'](8, 2.5)(cv, px(x), px(z), dpr, 0)
    ns['sq'](7)(cv, px(190), px(-60), dpr, 0); ns['dia'](8)(cv, px(330), px(-300), dpr, 0)
    ns['CANDS']['cuadhueco10'][1](cv, px(-120), px(220), dpr, 0)
    x, z, a = mooring(0, 'sloop'); ns['tri'](5, 0.7, 0.6)(cv, px(x), px(z), dpr, a)
    return cv.img
Z = 4; tiles = []
for css, dpr, label in ((184, 1, 'Escritorio 184 px, DPR 1'), (184, 2, 'Escritorio 184 px, DPR 2 (Retina)'), (88, 2, 'Móvil 88 px, DPR 2')):
    img = draw_map(css, dpr)
    g = ns['enc'](ns['lin'](img) @ np.array([0.2126, 0.7152, 0.0722]))
    for arr in (img, np.repeat(g[..., None], 3, axis=2)):
        t = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); sc = Z * 2 // dpr if css == 184 else Z * 4 // dpr
        tiles.append((label, t.resize((t.width * sc, t.height * sc), Image.NEAREST)))
W = max(t.width for _, t in tiles) * 2 + 30; H = sum(t.height + 40 for _, t in tiles[::2]) + 10
sheet = Image.new('RGB', (W, H), (28, 28, 28)); dr = ImageDraw.Draw(sheet); y = 10
for i in range(0, len(tiles), 2):
    dr.text((10, y), tiles[i][0] + ' — color y grises', fill=(230, 230, 230)); y += 20
    sheet.paste(tiles[i][1], (10, y)); sheet.paste(tiles[i + 1][1], (20 + tiles[i][1].width, y)); y += tiles[i][1].height + 20
sheet.save(sys.argv[1]); print('hoja:', sys.argv[1])

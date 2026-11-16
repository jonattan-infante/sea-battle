# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/lamina_islas.py  →  $UX_OUT/D67-islas.png
# Reproduce docs/game/art/D67-islas.png (sha256 f3297146…). Usa el renderizador (UX_RENDERER).
# Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS (.next/static/media de un
# build de Next) y, si se indica abajo, el renderizador por software en UX_RENDERER. Escribe en UX_OUT, nunca en
# docs/game/art/: una lámina aprobada no se pisa; una versión nueva se copia allí a mano y con otro nombre. No corre en la CI.
# Lámina de las islas de la 1.1 (ASSET-SPEC §9.4, D67; GDD §4) para Jonattan: los 7 tipos a la misma escala, de cerca
# a tamaño de juego, y el mapa con las 16 formas.
import sys, os, math
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import rutas as RT
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import recetas as R, escena as E, oceano as O
FONT = RT.FONTS
def font(px, w=600): return ImageFont.truetype(FONT + ({500: 'b0bb26939bb40fdb-s.p.woff2', 600: '60c9b95e8d9e49be-s.p.woff2'}[w]), px)
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26)
F = {f[0]: f for f in R.FORMS}
S55, C55 = math.sin(math.radians(55)), math.cos(math.radians(55))
def group(ids):
    """Geometría y círculos de un grupo de formas, con el origen en el centro de su caja."""
    xs = [F[i][3] for i in ids]; zs = [F[i][4] for i in ids]; rs = [F[i][5] for i in ids]
    x0 = (min(x - r for x, r in zip(xs, rs)) + max(x + r for x, r in zip(xs, rs))) / 2
    z0 = (min(z - r for z, r in zip(zs, rs)) + max(z + r for z, r in zip(zs, rs))) / 2
    g = E.Geo()
    for i in ids:
        _, kind, var, x, z, r = F[i]; g.add(R.build(i, kind, var, r, x, z), None, (x - x0, 0, z - z0))
    w = max(x + r for x, r in zip(xs, rs)) - min(x - r for x, r in zip(xs, rs)); h = max(z + r for z, r in zip(zs, rs)) - min(z - r for z, r in zip(zs, rs))
    return g.export(), [(x - x0, z - z0, r) for x, z, r in zip(xs, zs, rs)], w, h, (x0, z0)
def views(ids, ppm, m=8, plan=True, hmax=16):
    geo, circ, w, h, _ = group(ids)
    W = int((w + 2 * m) * ppm)
    out = []
    if plan:
        Hp = int((h + 2 * m) * ppm); out.append(O.shot(geo, W, Hp, W / 2, Hp / 2, ppm, 90, circ))
    Hg = int(((h + 2 * m) * S55 + hmax * C55) * ppm); oy = Hg - (h / 2 + m) * S55 * ppm
    out.append(O.shot(geo, W, Hg, W / 2, oy, ppm, 55, circ))
    return out, circ
TYPES = [(['I1'], 'Tropical', 'I1, I5, I6 · radio 45, 30 y 28 m', 'Aguas tranquilas: playa, palmeras; la grande, con colina', 12),
         (['T1'], 'Islote habitado', 'T1, T2 · 22 m', 'Pescadores: cabañas, embarcadero y redes', 8),
         (['I2'], 'Peñón', 'I2 · 35 m', 'Roca oscura y una media luna de playa al sur', 11),
         (['I3'], 'Volcán', 'I3 · 55 m, la mayor', 'Se reconoce de lejos: cono de 15,8 m', 16),
         (['I4'], 'Acantilado', 'I4 · 40 m', 'Pared de 9 m al sur y una cala al este', 10),
         (['E1a', 'E1b', 'E1c'], 'Escollos', 'E1a, E1b, E1c · 7 m', 'Rocas a flor de agua con un paso de 31 m', 3),
         (['G1'], 'Cala pirata', 'G1 a G4 · 20 m', 'Campamento del Capitán; la entrada mira al puerto', 8)]
PPM = 3.0
cards = []
for ids, name, sub, why, hm in TYPES:
    (pl, gm), _ = views(ids, PPM, hmax=hm); cards.append((pl, gm, name, sub, why)); print(name, flush=True)
# de cerca, a tamaño de juego (D23: 6,71 px/m con N1 en 1440×900)
PZ = 6.7
close = {}
for ids, key in ((['G1'], 'cala'), (['T1'], 'islote'), (['E1a', 'E1b', 'E1c'], 'escollos')):
    (gm,), circ = views(ids, PZ, m=6, plan=False, hmax=8); close[key] = (gm, circ); print(key, flush=True)
# mapa: las 16 formas en planta
MP = 0.9; HALF = 520
gall = E.Geo()
for fid, kind, var, x, z, r in R.FORMS: gall.add(R.build(fid, kind, var, r, x, z), None, (x, 0, z))
Wm = int(2 * HALF * MP)
mapa = O.shot(gall.export(), Wm, Wm, Wm / 2, Wm / 2, MP, 90, [(f[3], f[4], f[5]) for f in R.FORMS], edge=500)
print('mapa', flush=True)
# --- hoja
gap = 14; widths = [c[0].shape[1] for c in cards]
SW = max(80 + sum(widths) + gap * (len(cards) - 1), 2000)
Hpl = max(c[0].shape[0] for c in cards); Hgm = max(c[1].shape[0] for c in cards)
y1 = 150; y2 = y1 + Hpl + 10 + Hgm + 130
SH = y2 + 26 + Wm + 40
sheet = Image.new('RGB', (SW, SH), PAPER); d = ImageDraw.Draw(sheet)
d.text((40, 22), 'Islas de la 1.1: 7 tipos de isla en 16 formas', font=font(30), fill=INK)
d.text((40, 62), 'Render por software con la luz y el agua del juego, a partir de ASSET-SPEC §9.4 y del mapa del GDD (§4). Cada isla es un círculo: lo que se ve coincide con donde choca el barco.', font=font(16, 500), fill=SOFT)
d.text((40, 86), 'Las rocas, arbustos y palmeras se colocan al azar con una semilla por isla; aquí, una semilla de ejemplo.', font=font(16, 500), fill=SOFT)
d.text((40, y1 - 30), 'A la misma escala (3 px por metro): desde arriba y, debajo, como en el juego (cámara a 55°)', font=font(18), fill=TITLE)
x = 40
for (pl, gm, name, sub, why), w in zip(cards, widths):
    sheet.paste(Image.fromarray(pl.astype(np.uint8)), (x, y1 + (Hpl - pl.shape[0]) // 2))
    sheet.paste(Image.fromarray(gm.astype(np.uint8)), (x, y1 + Hpl + 10 + (Hgm - gm.shape[0]) // 2))
    ty = y1 + Hpl + 10 + Hgm + 8
    d.text((x, ty), name, font=font(19), fill=INK); d.text((x, ty + 26), sub, font=font(14, 500), fill=SOFT)
    # el porqué, partido en líneas que quepan en la tarjeta
    words, line, ly = why.split(), '', ty + 46
    for wd in words:
        t = (line + ' ' + wd).strip()
        if d.textlength(t, font=font(14, 500)) > max(w, 170) - 4: d.text((x, ly), line, font=font(14, 500), fill=SOFT); ly += 18; line = wd
        else: line = t
    d.text((x, ly), line, font=font(14, 500), fill=SOFT)
    x += w + gap
# mapa
d.text((40, y2 - 4), 'El mapa (1000 × 1000 m, norte arriba): las 16 formas', font=font(18), fill=TITLE)
MX, MY = 40, y2 + 26
sheet.paste(Image.fromarray(mapa.astype(np.uint8)), (MX, MY))
cx, cy = MX + Wm / 2, MY + Wm / 2
rz = 110 * MP; d.ellipse((cx - rz, cy - rz, cx + rz, cy + rz), outline=(242, 193, 78), width=2)
for k in range(24):
    a = math.radians(15 * k); bx, by = cx + rz * math.sin(a), cy + rz * math.cos(a); d.ellipse((bx - 2, by - 2, bx + 2, by + 2), fill=(245, 241, 230))
d.text((cx + rz * 0.72 + 6, cy - rz * 0.72 - 22), 'zona segura (110 m)', font=font(14), fill=(242, 193, 78))
NAME = {'PORT': 'Puerto', 'I1': 'I1 tropical', 'I2': 'I2 peñón', 'I3': 'I3 volcán', 'I4': 'I4 acantilado', 'I5': 'I5 tropical', 'I6': 'I6 tropical',
        'T1': 'T1 islote', 'T2': 'T2 islote', 'G1': 'G1 cala pirata', 'G2': 'G2 cala pirata', 'G3': 'G3 cala pirata', 'G4': 'G4 cala pirata'}
for fid, kind, var, x_, z_, r in R.FORMS:
    if fid.startswith('E1'): continue
    px, py = cx + x_ * MP, cy + z_ * MP; t = NAME[fid]
    tx = px + r * MP + 6 if x_ <= 300 else px - r * MP - 6 - d.textlength(t, font=font(14))
    if fid == 'PORT': tx, py = px - d.textlength(t, font=font(14)) / 2, py + r * MP + 2
    d.text((tx, py - 9 if fid != 'PORT' else py), t, font=font(14), fill=(255, 255, 255))
px, py = cx + 140 * MP, cy + 299 * MP; d.text((px + 34, py - 4), 'E1 escollos', font=font(14), fill=(255, 255, 255))
d.text((MX + 10, MY + Wm - 26), '100 m', font=font(13), fill=(255, 255, 255)); d.rectangle((MX + 60, MY + Wm - 20, MX + 60 + 100 * MP, MY + Wm - 16), fill=(255, 255, 255))
# de cerca
RX = MX + Wm + 40; d.text((RX, y2 - 4), 'De cerca, a tamaño de juego en escritorio (6,7 px por metro), cámara a 55°', font=font(18), fill=TITLE)
yy = y2 + 26; xx = RX
for key, label in (('cala', 'Cala pirata (G1): tiendas, hoguera, 3 banderas negras, un pecio varado y maderos'), ('islote', 'Islote habitado (T1): 3 cabañas, embarcadero hacia el puerto y secadero de redes')):
    gm = close[key][0]; sheet.paste(Image.fromarray(gm.astype(np.uint8)), (xx, yy)); xx += gm.shape[1] + gap
lab_y = yy + max(close['cala'][0].shape[0], close['islote'][0].shape[0]) + 6
def wrap(x, y, w, txt, f=None):
    f = f or font(15, 500); line, yy_ = '', y
    for wd in txt.split():
        t = (line + ' ' + wd).strip()
        if d.textlength(t, font=f) > w: d.text((x, yy_), line, font=f, fill=SOFT); yy_ += 20; line = wd
        else: line = t
    d.text((x, yy_), line, font=f, fill=SOFT); return yy_ + 20
e1 = wrap(RX, lab_y, close['cala'][0].shape[1] - 6, 'Cala pirata (G1): 2 tiendas, hoguera, 3 banderas negras, un pecio varado y maderos. El peñón queda detrás y la entrada mira al puerto.')
e2 = wrap(RX + close['cala'][0].shape[1] + gap, lab_y, close['islote'][0].shape[1] - 6, 'Islote habitado (T1): 3 cabañas, embarcadero hacia el puerto y secadero de redes.')
lab_y = max(e1, e2) - 54 + 10
# la cala pirata y el islote ocupan una fila; los escollos, la siguiente, con el paso marcado
yy = lab_y + 54
gm, circ = close['escollos']; sheet.paste(Image.fromarray(gm.astype(np.uint8)), (RX, yy))
(bx_, bz_, br), (cx_, cz_, cr) = circ[1], circ[2]
W_ = gm.shape[1]; Hg_ = gm.shape[0]
xs = [F[i][3] for i in ('E1a', 'E1b', 'E1c')]; zs = [F[i][4] for i in ('E1a', 'E1b', 'E1c')]
h = max(z + 7 for z in zs) - min(z - 7 for z in zs); oy = Hg_ - (h / 2 + 6) * S55 * PZ
p1 = (RX + W_ / 2 + (bx_ + br) * PZ, yy + oy + bz_ * S55 * PZ); p2 = (RX + W_ / 2 + (cx_ - cr) * PZ, yy + oy + cz_ * S55 * PZ)
d.line((p1, p2), fill=(255, 255, 255), width=2)
for p in (p1, p2): d.line(((p[0], p[1] - 7), (p[0], p[1] + 7)), fill=(255, 255, 255), width=2)
d.text(((p1[0] + p2[0]) / 2 - 18, p1[1] + 8), '31 m', font=font(15), fill=(255, 255, 255))
d.text((RX + W_ + 20, yy + 10), 'Escollos (E1): 3 rocas a flor de agua,', font=font(15, 500), fill=SOFT)
d.text((RX + W_ + 20, yy + 30), 'como mucho a 1,2 m. Entre roca y roca', font=font(15, 500), fill=SOFT)
d.text((RX + W_ + 20, yy + 50), 'hay 31 m: pasan la Balandra, la Goleta,', font=font(15, 500), fill=SOFT)
d.text((RX + W_ + 20, yy + 70), 'el Bergantín, el pirata y el mercante;', font=font(15, 500), fill=SOFT)
d.text((RX + W_ + 20, yy + 90), 'no pasan la Fragata, el Navío, la', font=font(15, 500), fill=SOFT)
d.text((RX + W_ + 20, yy + 110), 'Cañonera ni el Capitán.', font=font(15, 500), fill=SOFT)
d.text((RX + W_ + 20, yy + 140), 'La espuma la pinta el agua, como en', font=font(15, 500), fill=SOFT)
d.text((RX + W_ + 20, yy + 160), 'cualquier costa (aquí, aproximada).', font=font(15, 500), fill=SOFT)
out = os.path.join(RT.OUT, 'D67-islas.png'); sheet.save(out); print('hoja', os.path.abspath(out), sheet.size)

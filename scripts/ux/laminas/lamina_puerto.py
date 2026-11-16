# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/lamina_puerto.py  →  $UX_OUT/D68-puerto.png
# Reproduce docs/game/art/D68-puerto.png (sha256 df4842d6…). Usa el renderizador (UX_RENDERER) y los barcos de
# $UX_OUT/barcos-geo.json, que exporta code/export-barcos.ts (ver lamina_barcos.py).
# Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS (.next/static/media de un
# build de Next) y, si se indica abajo, el renderizador por software en UX_RENDERER. Escribe en UX_OUT, nunca en
# docs/game/art/: una lámina aprobada no se pisa; una versión nueva se copia allí a mano y con otro nombre. No corre en la CI.
# Lámina del puerto de la 1.1 (ASSET-SPEC §9.5, D68) para Jonattan: planta y vista del juego, con barcos atracados.
import sys, os, math, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import rutas as RT
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import recetas as R, escena as E, oceano as O
FONT = RT.FONTS
def font(px, w=600): return ImageFont.truetype(FONT + ({500: 'b0bb26939bb40fdb-s.p.woff2', 600: '60c9b95e8d9e49be-s.p.woff2'}[w]), px)
SHIPS = json.load(open(RT.need(os.path.join(RT.OUT, 'barcos-geo.json'), 'barcos-geo.json (code/export-barcos.ts)')))
LEN = {'sloop': 16, 'schooner': 22, 'brig': 24, 'frigate': 34, 'line': 42}
MOOR = [(45, 'schooner'), (75, 'sloop'), (135, 'frigate'), (225, 'brig'), (285, 'line'), (315, 'line')]
def ship_world(gid, psi_deg):
    """El barco atracado de popa a 2 m del muelle: centro a 30 + L/2 + 2 en el rumbo ψ, proa hacia fuera (GDD §4)."""
    g = SHIPS[gid]; P = np.array(g['pos']).reshape(-1, 3); N = np.array(g['nor']).reshape(-1, 3); C = np.array(g['col']).reshape(-1, 3)
    psi = math.radians(psi_deg); Rm = E.rot_y(psi); d = 30 + LEN[gid] / 2 + 2
    P = P @ Rm.T + np.array([d * math.sin(psi), 0, d * math.cos(psi)]); N = N @ Rm.T
    out_p, out_n, out_c = [], [], []
    for t in range(len(P) // 3):
        poly = [(P[3 * t + i], N[3 * t + i], C[3 * t + i]) for i in range(3)]
        res = []
        for i in range(3):
            (a, na, ca), (b, nb, cb) = poly[i], poly[(i + 1) % 3]
            if a[1] >= 0: res.append((a, na, ca))
            if (a[1] >= 0) != (b[1] >= 0):
                s = a[1] / (a[1] - b[1]); res.append((a + s * (b - a), na + s * (nb - na), ca + s * (cb - ca)))
        for i in range(1, len(res) - 1):
            for v in (res[0], res[i], res[i + 1]): out_p.append(v[0]); out_n.append(v[1]); out_c.append(v[2])
    return np.array(out_p), np.array(out_n), np.array(out_c)
def merged(with_ships=True):
    g = R.build('PORT', 'port', None, 30).export()
    P = [np.array(g['pos']).reshape(-1, 3)]; N = [np.array(g['nor']).reshape(-1, 3)]; C = [np.array(g['col']).reshape(-1, 3)]
    if with_ships:
        for psi, gid in MOOR:
            p, n, c = ship_world(gid, psi); P.append(p); N.append(n); C.append(c)
    return {'pos': np.concatenate(P).reshape(-1).tolist(), 'nor': np.concatenate(N).reshape(-1).tolist(), 'col': np.concatenate(C).reshape(-1).tolist()}
PPM = 5.0; HALF = 86
geo = merged()
W = int(2 * HALF * PPM); Hp = W
plan = O.shot(geo, W, Hp, W / 2, Hp / 2, PPM, 90, [(0, 0, 30)]); print('planta', flush=True)
s55, c55 = math.sin(math.radians(55)), math.cos(math.radians(55))
Hg = int((2 * HALF * s55 + 26 * c55) * PPM) + 10; oyg = Hg - HALF * s55 * PPM - 6
game = O.shot(geo, W, Hg, W / 2, oyg, PPM, 55, [(0, 0, 30)]); print('juego', flush=True)
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26)
SW = 40 + W + 30 + W + 40; SH = 120 + 34 + max(Hp, Hg) + 30 + 300
sheet = Image.new('RGB', (SW, SH), PAPER); d = ImageDraw.Draw(sheet)
d.text((40, 22), 'Puerto de la 1.1: muelle de piedra con 12 amarres, astillero y faro', font=font(30), fill=INK)
d.text((40, 62), 'Render por software con la luz y el agua del juego, a partir de ASSET-SPEC §9.5. Los barcos atracados son de ejemplo (Goleta, Balandra, Fragata, Bergantín y dos Navíos de línea juntos, el caso más justo). Escala: 5 px por metro.', font=font(16, 500), fill=SOFT)
d.text((40, 120), 'Desde arriba (norte arriba)', font=font(18), fill=TITLE); d.text((40 + W + 30, 120), 'Como en el juego (cámara a 55°)', font=font(18), fill=TITLE)
X0, Y0 = 40, 154; X1 = 40 + W + 30
sheet.paste(Image.fromarray(plan.astype(np.uint8)), (X0, Y0)); sheet.paste(Image.fromarray(game.astype(np.uint8)), (X1, Y0))
# llamadas numeradas sobre la planta (mundo → píxel)
CALLS = [((-17, 8), 'Muelle de piedra de 30 m de radio, con el cantil oscuro en el borde (se lee contra el agua clara)'),
         ((27.2 * math.sin(math.radians(165)) - 4, 27.2 * math.cos(math.radians(165)) + 2), '12 pantalanes de madera, uno por amarre, cada 30°; 2 norays negros en cada uno'),
         ((0, 22.5), 'Astillero: grada en rampa, quilla, 7 cuadernas y cabria (un barco a medio hacer)'),
         ((10.5, 15.5), 'Cobertizo del astillero'), ((-6.4, 16.8), 'Madera apilada'),
         ((3.8, -19.5), 'Faro de franjas blancas y rojas sobre un baluarte de piedra (el punto más alto: 15 m)'),
         ((15, -6), 'Dos almacenes con tejado de pizarra (los separa de las casas)'), ((23, -2.5), 'Grúa con carga al pie (cajas y barriles)'),
         ((0, -4), 'Capitanía con la bandera dorada del puerto'), ((-10, -13), 'Tres casas del pueblo'), ((-8, 4), 'Palmeras en la plaza'),
         ((48 * math.sin(math.radians(45)), 48 * math.cos(math.radians(45))), 'Barco atracado de popa, a 2 m del muelle, con la proa hacia fuera')]
for i, ((wx, wz), _) in enumerate(CALLS):
    px, py = X0 + W / 2 + wx * PPM, Y0 + Hp / 2 + wz * PPM
    d.ellipse((px - 11, py - 11, px + 11, py + 11), fill=(255, 255, 255), outline=INK, width=2)
    t = str(i + 1); tw = d.textlength(t, font=font(13)); d.text((px - tw / 2, py - 9), t, font=font(13), fill=INK)
# barra de escala
bx, by = X0 + 20, Y0 + Hp - 24
d.rectangle((bx, by, bx + 10 * PPM, by + 5), fill=(255, 255, 255)); d.text((bx + 10 * PPM + 8, by - 8), '10 m', font=font(14), fill=(255, 255, 255))
# leyenda en 2 columnas
ly = Y0 + max(Hp, Hg) + 26; colw = (SW - 80) // 2
for i, (_, txt) in enumerate(CALLS):
    cx = 40 + (i // 6) * colw; cy = ly + (i % 6) * 30
    d.ellipse((cx, cy, cx + 22, cy + 22), fill=(255, 255, 255), outline=INK, width=2)
    t = str(i + 1); tw = d.textlength(t, font=font(13)); d.text((cx + 11 - tw / 2, cy + 2), t, font=font(13), fill=INK)
    d.text((cx + 32, cy + 1), txt, font=font(16, 500), fill=INK)
d.text((40, ly + 6 * 30 + 16), 'Fuera del encuadre: las 24 boyas de la zona segura, a 110 m (lámina de islas). Todo lo construido queda dentro del círculo de 30 m del muelle; los barcos atracados, fuera, en el agua.', font=font(15, 500), fill=SOFT)
d.text((40, ly + 6 * 30 + 42), 'Holgura entre las popas de dos barcos vecinos: de 12,3 m (dos Balandras) a 5,8 m (dos Navíos, a la izquierda). Ningún barco atracado bloquea el amarre de al lado (scripts/ux/puerto.py).', font=font(15, 500), fill=SOFT)
out = os.path.join(RT.OUT, 'D68-puerto.png'); sheet.save(out); print('hoja', os.path.abspath(out), sheet.size)

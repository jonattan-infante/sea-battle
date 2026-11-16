# Uso (desde la raíz del repo), tras scripts/ux/mapa/puerto_colonial.py y, para el peso del modelo, blender_estatico.py
# con la compresión (ver su cabecera): python3 -I scripts/ux/laminas/lamina_puerto_colonial.py  →  $UX_OUT/D82-puerto-colonial.png
# Lámina del puerto rediseñado (D82) para Jonattan, en el formato aprobado (AC-192 g): a escala, desde arriba, como en el
# juego (1440×900 y 390×844) y de cerca, con el antes y el después, las medidas y lo que tiene en contra en palabras
# llanas. Render por software con textura (scripts/ux/mapa/render_tex.py: la luz del juego) sobre el agua de §7.2.
# Usa el renderizador (UX_RENDERER), las fuentes (UX_FONTS) y $UX_OUT/barcos-geo.json (ver lamina_barcos.py).
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, math, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'mapa'))
import rutas as RT
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import vistas as V, render_tex as RX, oceano as O, recetas as R0
import puerto_colonial as PC

def font(px, w=600): return ImageFont.truetype(RT.FONTS + RT.FF[w], px, layout_engine=ImageFont.Layout.RAQM)
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42)
MED = json.load(open(os.path.join(RT.OUT, 'mapa', 'puerto-medidas.json')))
GLB = os.path.join(RT.OUT, 'mapa', 'island_port_comp.glb'); GLB_KB = os.path.getsize(GLB) / 1000 if os.path.exists(GLB) else None
asset = V.load_asset('puerto')
white = np.array(PC.AT.uv('white', 0.5, 0.5))
MOOR = [(45, 'schooner'), (75, 'sloop'), (135, 'frigate'), (225, 'brig'), (285, 'line'), (315, 'line')]
ships = [V.moored(g, p, white) for p, g in MOOR]
S55, C55 = math.sin(math.radians(55)), math.cos(math.radians(55))

# --- vistas
PP = 9.0; HALF = 36; Wp = int(2 * HALF * PP)
plan = V.view(asset, ships, PP, Wp, Wp, Wp / 2, Wp / 2, 90, [(0, 0, 30)], SS=3)
GPPM = 6.2; Wg, Hg = 1000, 650
game = V.view(asset, ships, GPPM, Wg, Hg, Wg / 2, 338, 55, [(0, 0, 30)], SS=3)
MPPM = 2.8; Wm, Hm = 300, 200
mob = V.view(asset, ships, MPPM, Wm, Hm, Wm / 2, 104, 55, [(0, 0, 30)], SS=4)
CP = 14.0; Wc, Hc = 900, 640
close = V.view(asset, [], CP, Wc, Hc, Wc / 2, Hc / 2 + 30, 55, [(0, 0, 30)], SS=2)
# antes: el puerto de D68 (la lámina anterior) con la misma cámara y escala que «de cerca»
g68 = R0.build('PORT', 'port', None, 30).export()
O.M.TH = math.radians(55)
before = Image.fromarray(O.shot(g68, Wc, Hc, Wc / 2, Hc / 2 + 30, CP, 55, [(0, 0, 30)], SS=2).astype(np.uint8))

# --- lámina
SW = 40 + Wp + 30 + Wg + 40
sheet = Image.new('RGB', (SW, 3000), PAPER); d = ImageDraw.Draw(sheet)
d.text((40, 22), 'Puerto rediseñado: una plaza fuerte colonial caribeña', font=font(32), fill=INK)
d.text((40, 66), 'Propuesta para sustituir la lámina anterior del puerto. Mismo círculo de 30 m, los mismos 12 amarres y el astillero al sur; todo el borde sigue siendo salida.', font=font(17, 500), fill=SOFT)
d.text((40, 92), 'Render con la luz y el agua del juego. Los barcos atracados son los de hoy, de ejemplo: su aspecto lo deciden las familias de barcos, no esta lámina.', font=font(17, 500), fill=SOFT)
Y0 = 140
d.text((40, Y0), f'Desde arriba (norte arriba), {PP:.0f} px por metro'.replace('.', ','), font=font(19), fill=TITLE)
d.text((40 + Wp + 30, Y0), 'Como en el juego, en 1440×900 (cámara a 55°, 6,2 px por metro), con 6 barcos atracados', font=font(19), fill=TITLE)
X0, Yv = 40, Y0 + 34; X1 = 40 + Wp + 30
sheet.paste(plan, (X0, Yv)); sheet.paste(game, (X1, Yv))
# llamadas numeradas en la planta (mundo → píxel)
def bp(psi, r): return (r * math.sin(math.radians(psi)), r * math.cos(math.radians(psi)))
CALLS = [(bp(125, 21.5), 'Murallas con 3 baluartes al norte, con césped encima y una garita en cada punta (como las de San Juan)'),
         ((0, -18.2), 'Faro de franjas blancas y rojas en el baluarte del centro (el punto más alto: 15,2 m)'),
         ((0, -6.6), 'La puerta roja del fuerte, de cara a la plaza, con la bandera dorada del puerto'),
         ((-4.5, -13.2), 'Capitanía blanca de 2 plantas y 2 ceibas en el patio de armas'),
         ((2.6, 1.5), 'Plaza enlosada con fuente y 4 puestos de mercado con toldos de rayas'),
         ((-11.8, 1.6), 'Casas coloniales de colores: ocre, rosa, azul, celeste, amarilla y menta, con postigos y buganvillas'),
         ((-14.6, 14.0), 'Iglesia amarilla con espadaña de 2 campanas'),
         ((0, 21.0), 'Astillero (la tienda): grada con un barco a medio hacer, cabria y cobertizo'),
         ((20.4, 6.4), 'Almacenes, grúa y carga junto a los muelles'),
         (bp(270, 28.6), 'Escollera de rocas al oeste, entre los pantalanes'),
         (bp(318, 25.0), 'Playa con botes varados y una garita sobre el agua, en primer plano para la cámara'),
         (bp(195, 27.2), '12 pantalanes de madera, uno por amarre (cada 30°), con carga en la raíz y la punta libre'),
         (bp(45, 47.0), 'Barco atracado de popa, a 2 m del pantalán, con la proa hacia fuera')]
for i, ((wx, wz), _) in enumerate(CALLS):
    px, py = X0 + Wp / 2 + wx * PP, Yv + Wp / 2 + wz * PP
    d.ellipse((px - 12, py - 12, px + 12, py + 12), fill=(255, 255, 255), outline=INK, width=2)
    t = str(i + 1); tw = d.textlength(t, font=font(14)); d.text((px - tw / 2, py - 9), t, font=font(14), fill=INK)
bx, by = X0 + 20, Yv + Wp - 26
d.rectangle((bx, by, bx + 10 * PP, by + 5), fill=(255, 255, 255)); d.text((bx + 10 * PP + 8, by - 9), '10 m', font=font(15), fill=(255, 255, 255))
# leyenda de la planta, bajo las 2 vistas
ly = Yv + max(Wp, Hg) + 22; colw = (SW - 80) // 2
for i, (_, txt) in enumerate(CALLS):
    cx = 40 + (i // 7) * colw; cy = ly + (i % 7) * 30
    d.ellipse((cx, cy, cx + 22, cy + 22), fill=(255, 255, 255), outline=INK, width=2)
    t = str(i + 1); tw = d.textlength(t, font=font(13)); d.text((cx + 11 - tw / 2, cy + 2), t, font=font(13), fill=INK)
    d.text((cx + 32, cy + 1), txt, font=font(16, 500), fill=INK)
# fila 2: antes y después, de cerca, y el móvil
Y2 = ly + 7 * 30 + 30
d.text((40, Y2), 'Antes: la lámina anterior (de cerca, 14 px por metro)', font=font(19), fill=TITLE)
bw = (SW - 80 - 30) // 2; scale = bw / Wc
d.text((40 + bw + 30, Y2), 'Ahora: la misma cámara y la misma escala', font=font(19), fill=TITLE)
b2 = before.resize((bw, int(Hc * scale)), Image.LANCZOS); c2 = close.resize((bw, int(Hc * scale)), Image.LANCZOS)
sheet.paste(b2, (40, Y2 + 34)); sheet.paste(c2, (40 + bw + 30, Y2 + 34))
Y3 = Y2 + 34 + b2.height + 30
d.text((40, Y3), 'En el móvil (390×844, 2,8 px por metro): lo que se distingue es el astillero, el faro, la puerta roja y los muelles', font=font(19), fill=TITLE)
sheet.paste(mob, (40, Y3 + 34))
# paleta
px0 = 40 + Wm + 40; d.text((px0, Y3 + 34), 'Paleta', font=font(17), fill=TITLE)
SW_ = [('Muralla', PC.P['sillar']), ('Muelle', PC.P['losa']), ('Tejas', PC.P['teja']), ('Puerta', PC.P['roja']), ('Ocre', PC.P['ocre']), ('Rosa', PC.P['rosa']),
       ('Azul', PC.P['azul']), ('Celeste', PC.P['celeste']), ('Amarilla', PC.P['amarilla']), ('Menta', PC.P['menta']), ('Buganvilla', PC.P['buganvilla']),
       ('Césped', PC.P['cesped']), ('Faro', PC.P['faro.franja']), ('Bandera', PC.P['flag'])]
for i, (nm, hx) in enumerate(SW_):
    cx = px0 + (i % 7) * 132; cy = Y3 + 64 + (i // 7) * 62
    d.rectangle((cx, cy, cx + 30, cy + 30), fill=PC.rgb(hx), outline=(120, 110, 95))
    d.text((cx + 38, cy - 1), nm, font=font(14), fill=INK); d.text((cx + 38, cy + 15), hx, font=font(13, 500), fill=SOFT)
# textos
Y4 = Y3 + 34 + Hm + 30
def mil(n): return f'{n:,}'.replace(',', '.')
def dec(x, k): return f'{x:.{k}f}'.replace('.', ',')
tris = MED['tris_total']; tris_np = MED['tris_sin_palmeras']; occ = MED['oclusion_max']; rmax = MED['radio_max_y_pos']
BLOCKS = [
    ('Lo que no cambia', INK, [
        'El círculo de 30 m donde chocan los barcos, los 12 amarres cada 30° y el astillero al sur, que señala la tienda.',
        f'Nada con altura sale del círculo ({dec(rmax, 1)} m como mucho) y nada tapa a los barcos atracados: lo más alto tapa el suelo hasta {dec(occ, 2)} m del centro, y las popas están a 32.',
        'Sin diques ni bocanas: todo el borde es salida.']),
    ('Para que se lea como sitio seguro y no como fortaleza enemiga', INK, [
        'Las murallas miran hacia fuera, al norte; la ciudad se abre hacia la cámara y hacia los muelles.',
        'Sin cañones. Banderas doradas (las del puerto de hoy), colores cálidos, mercado, palmeras y el faro.']),
    ('Medidas', INK, [
        f'{mil(tris)} triángulos, de ellos {mil(MED["tris"]["palmeras"])} en las 17 palmeras, que en el juego van aparte, como hoy. El puerto anterior tenía unos 1.400 (estimados).',
        (f'Una textura de 1024 × 1024. Modelo comprimido: {GLB_KB:.0f} KB.' if GLB_KB else 'Una textura de 1024 × 1024.'),
        'Una llamada de dibujo más que hoy (el puerto con su textura).']),
    ('En contra', RED, [
        'Pesa más: unas 5 veces los triángulos del puerto anterior, más una textura. Cabe en el presupuesto provisional del mapa (60.000 triángulos), pero hay que medirlo en el juego.',
        'Desde la cámara del juego las murallas del norte se ven por detrás: se leen por las almenas, las garitas y el césped de los baluartes, no por sus paredes.',
        'En el móvil, las casas y los toldos son manchas de color; el detalle de puertas y ventanas solo se ve de cerca.']),
]
yy = Y4
for title, colr, lines in BLOCKS:
    d.text((40, yy), title, font=font(19), fill=TITLE if colr == INK else RED); yy += 30
    for ln in lines:
        d.text((56, yy), '·  ' + ln, font=font(16, 500), fill=colr); yy += 26
    yy += 12
sheet = sheet.crop((0, 0, SW, yy + 20))
out = os.path.join(RT.OUT, 'D82-puerto-colonial.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

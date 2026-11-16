# Uso (desde la raíz del repo), tras scripts/ux/mapa/puerto_forma.py y puerto_isla.py (la misma UX_OUT), y con el puerto
# de D82 (puerto_colonial.py) en $UX_OUT/mapa para el «antes», y tras comprimir_puerto.py y presupuesto.py con UX_PUERTO=puerto_isla:
#   python3 -I scripts/ux/laminas/lamina_puerto_isla.py  →  $UX_OUT/D92-puerto-isla.png
# Lámina del puerto con forma de isla (D92) para Jonattan, en el formato de la lámina del puerto de D82: desde arriba, como
# en el juego (1440×900 y 390×844) y de cerca, con el antes y el después, las medidas y lo que tiene en contra en palabras
# llanas. Barcos atracados de varias clases, con los Navíos en los amarres más justos. Al final, el peso, la vista peor, las
# reglas de GDD §4 con su medida y las tablas de círculos y amarres. Render por software con textura
# (render_tex.py: la luz del juego) sobre el agua de §7.2. Usa las fuentes (UX_FONTS) y $UX_OUT/barcos-geo.json.
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, math, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'mapa'))
import rutas as RT
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import vistas as V
import puerto_forma as PF
import puerto_isla as PI

def font(px, w=600): return ImageFont.truetype(RT.FONTS + RT.FF[w], px, layout_engine=ImageFont.Layout.RAQM)
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42)
MAPA = os.path.join(RT.OUT, 'mapa')
MED = json.load(open(RT.need(os.path.join(MAPA, 'puerto-isla-medidas.json'), 'puerto-isla-medidas.json (puerto_isla.py)')))
GL = json.load(open(RT.need(os.path.join(MAPA, 'puerto-isla-glb.json'), 'puerto-isla-glb.json (comprimir_puerto.py)')))
VP = json.load(open(RT.need(os.path.join(MAPA, 'presupuesto-vista-puerto_isla.json'), 'presupuesto-vista-puerto_isla.json (presupuesto.py con UX_PUERTO=puerto_isla)')))
ISLAS_B, D82_B, D83_VISTA = 599040, 181684, (48427, 7)   # las 15 islas (ASSET-SPEC §9.7), el puerto de D82 (§9.6) y la vista peor con él
FORMA = PI.FORMA; CIRC = PI.CIRC
asset = V.load_asset('puerto_isla'); before = V.load_asset('puerto')
white = np.array(PI.AT.uv('white', 0.5, 0.5))
GEO = {'Balandra': 'sloop', 'Goleta': 'schooner', 'Bergantín': 'brig', 'Fragata': 'frigate', 'Navío': 'line'}
# amarre (1–12) → clase: los Navíos en los 3 amarres seguidos más justos (4, 5 y 6: 1,78 m entre cascos) y el resto mezclado
MOOR = {1: 'Goleta', 2: 'Balandra', 4: 'Navío', 5: 'Navío', 6: 'Navío', 7: 'Fragata', 9: 'Bergantín', 10: 'Goleta', 12: 'Fragata'}


def moored(k, cls):
    Q, psi, _ = PI.BERTHS[k - 1]; c = Q + PI.u(psi) * PF.MARGIN[cls]
    return V.ship_at(GEO[cls], float(c[0]), float(c[1]), psi, white)


ships = [moored(k, c) for k, c in MOOR.items()]
S55 = math.sin(math.radians(55))

# --- vistas (x0, z0: centro de la vista en el mundo)
PP = 6.0; HALF_X, HALF_Z = 105, 90; Wp, Hp = int(2 * HALF_X * PP), int(2 * HALF_Z * PP)
plan = V.view(asset, ships, PP, Wp, Hp, Wp / 2, Hp / 2, 90, CIRC, SS=2, x0=5.0, z0=-4.0)
GPPM = 6.2; Wg, Hg = 1000, 650
game = V.view(asset, ships, GPPM, Wg, Hg, Wg / 2, 330, 55, CIRC, SS=3, x0=4.0, z0=-2.0)
MPPM = 2.8; Wm, Hm = 300, 230
mob = V.view(asset, ships, MPPM, Wm, Hm, Wm / 2, 118, 55, CIRC, SS=4, x0=4.0, z0=-2.0)
CP = 14.0; Wc, Hc = 900, 640
close = V.view(asset, [], CP, Wc, Hc, Wc / 2, Hc / 2 + 30, 55, CIRC, SS=2, x0=-2.0, z0=4.0)
PB = 6.0
plan_before = V.view(before, [], PB, int(80 * PB), int(80 * PB), 40 * PB, 40 * PB, 90, [(0, 0, 30)], SS=2)

# --- lámina
SW = 40 + Wp + 30 + Wg + 40
sheet = Image.new('RGB', (SW, 5600), PAPER); d = ImageDraw.Draw(sheet)
d.text((40, 22), 'Puerto con forma de isla: ciudad, fuerte, muelles y un palmar', font=font(32), fill=INK)
d.text((40, 66), 'Lo que pediste sobre la lámina anterior: que no sea un círculo, que sea más irregular, como una isla, con una parte de palmeras, más verde y con plazas.', font=font(17, 500), fill=SOFT)
d.text((40, 92), 'Render con la luz y el agua del juego. Los barcos atracados son los de hoy, de ejemplo: su aspecto lo deciden las familias de barcos, no esta lámina.', font=font(17, 500), fill=SOFT)
Y0 = 140
d.text((40, Y0), f'Desde arriba (norte arriba), {PP:.0f} px por metro, con 9 barcos atracados'.replace('.', ','), font=font(19), fill=TITLE)
d.text((40 + Wp + 30, Y0), 'Como en el juego, en 1440×900 (cámara a 55°, 6,2 px por metro)', font=font(19), fill=TITLE)
X0, Yv = 40, Y0 + 34; X1 = 40 + Wp + 30
sheet.paste(plan, (X0, Yv)); sheet.paste(game, (X1, Yv))
def W2P(wx, wz): return X0 + Wp / 2 + (wx - 5.0) * PP, Yv + Hp / 2 + (wz + 4.0) * PP
fx, fz, fr = PI.BY['fuerte']; px_, pz_, pr_ = PI.BY['palmar']; mx, mz, mr = PI.BY['muelle este']; rx_, rz_, rr_ = PI.BY['roca noroeste']; ix, iz, ir = PI.BY['islote']
CALLS = [((fx, fz - 10), 'El fuerte, sobre un acantilado al norte: murallas con 3 baluartes y garitas, como las de San Juan'),
         ((float(MED['faro'][0]) + 3, float(MED['faro'][1])), f'El faro de franjas blancas y rojas en el baluarte del centro (lo más alto: {MED["altura_max"]:.1f} m)'.replace('.', ',')),
         ((1.0, fz + 12.4), 'La puerta roja del fuerte, de cara a la plaza mayor'),
         ((1.0, 2.6), 'Plaza mayor: fuente y 4 puestos de mercado con toldos de rayas'),
         ((-17.0, 15.0), 'Plaza de la iglesia, con 2 árboles, abierta al muelle del suroeste'),
         ((-11.0, 0.0), 'Casas coloniales de colores con buganvillas'),
         ((1.0, 19.0), 'El astillero (la tienda) en la ensenada sur: grada, barco a medio hacer y cobertizo'),
         ((mx + 4, mz - 2), 'El muelle este: almacenes, grúa y carga'),
         ((px_ - 4, pz_), 'El palmar: playa, selva y palmeras, con 3 embarcaderos de madera y 2 botes varados'),
         ((rx_ - 2, rz_ - 1), 'Una roca alta al noroeste con su garita mirando al mar'),
         ((ix, iz), 'Un islote de roca y palmeras'),
         ((14.0, 34.0), '12 amarres: 9 en el muelle de piedra de la ciudad y del muelle este, y 3 en el palmar')]
for i, ((wx, wz), _) in enumerate(CALLS):
    px, py = W2P(wx, wz)
    d.ellipse((px - 12, py - 12, px + 12, py + 12), fill=(255, 255, 255), outline=INK, width=2)
    t = str(i + 1); tw = d.textlength(t, font=font(14)); d.text((px - tw / 2, py - 9), t, font=font(14), fill=INK)
bx, by = X0 + 20, Yv + Hp - 26
d.rectangle((bx, by, bx + 20 * PP, by + 5), fill=(255, 255, 255)); d.text((bx + 20 * PP + 8, by - 9), '20 m', font=font(15), fill=(255, 255, 255))
ly = Yv + max(Hp, Hg) + 22; colw = (SW - 80) // 2
for i, (_, txt) in enumerate(CALLS):
    cx = 40 + (i // 6) * colw; cy = ly + (i % 6) * 30
    d.ellipse((cx, cy, cx + 22, cy + 22), fill=(255, 255, 255), outline=INK, width=2)
    t = str(i + 1); tw = d.textlength(t, font=font(13)); d.text((cx + 11 - tw / 2, cy + 2), t, font=font(13), fill=INK)
    d.text((cx + 32, cy + 1), txt, font=font(16, 500), fill=INK)
# fila 2: antes (la lámina anterior, desde arriba) y de cerca; el móvil
Y2 = ly + 6 * 30 + 30
d.text((40, Y2), f'Antes: la lámina anterior, desde arriba ({PB:.0f} px por metro)'.replace('.', ','), font=font(19), fill=TITLE)
d.text((40 + plan_before.width + 30, Y2), 'Ahora, de cerca (14 px por metro): la ciudad y las 2 plazas', font=font(19), fill=TITLE)
sheet.paste(plan_before, (40, Y2 + 34))
cw = SW - 80 - plan_before.width - 30; c2 = close.resize((cw, int(Hc * cw / Wc)), Image.LANCZOS); sheet.paste(c2, (40 + plan_before.width + 30, Y2 + 34))
Y3 = Y2 + 34 + max(plan_before.height, c2.height) + 30
d.text((40, Y3), 'En el móvil (390×844, 2,8 px por metro): se distinguen el fuerte con el faro, la ciudad, el palmar verde y los muelles', font=font(19), fill=TITLE)
sheet.paste(mob, (40, Y3 + 34))
px0 = 40 + Wm + 40; d.text((px0, Y3 + 34), 'Paleta', font=font(17), fill=TITLE)
SW_ = [('Muralla', PI.P['sillar']), ('Muelle', PI.P['piedra']), ('Empedrado', PI.P['empedrado']), ('Tejas', PI.P['teja']), ('Puerta', PI.P['roja']),
       ('Ocre', PI.P['ocre']), ('Rosa', PI.P['rosa']), ('Azul', PI.P['azul']), ('Menta', PI.P['menta']), ('Arena', PI.IS.C['arena']),
       ('Selva', PI.IS.C['selva']), ('Roca', PI.IS.C['acantilado']), ('Faro', PI.P['faro.franja']), ('Bandera', PI.P['flag'])]
for i, (nm, hx) in enumerate(SW_):
    cx = px0 + (i % 7) * 132; cy = Y3 + 64 + (i // 7) * 62
    d.rectangle((cx, cy, cx + 30, cy + 30), fill=tuple(int(hx[k:k + 2], 16) for k in (1, 3, 5)), outline=(120, 110, 95))
    d.text((cx + 38, cy - 1), nm, font=font(14), fill=INK); d.text((cx + 38, cy + 15), hx, font=font(13, 500), fill=SOFT)
Y4 = Y3 + 34 + Hm + 30
def mil(n): return f'{n:,}'.replace(',', '.')
def dec(x, k): return f'{x:.{k}f}'.replace('.', ',')
sep, sep_to = FORMA['separacion_otras_islas']; exits = [r['Navío']['salida_m'] for r in FORMA['amarres']]
def kb(n): return f'{n / 1000:.0f}'
PT = VP['peor_tris']; RESP = GL['elegido']; ENT = GL['respaldo'][RESP]['entrada_B'] if RESP else GL['geo_B']; TOTAL = ISLAS_B + ENT + GL['ktx_B']
BLOCKS = [
    ('La forma', INK, [
        f'Son {FORMA["circulos"]} círculos de distintos tamaños que se tocan: así choca el barco con la costa que ves. Llega a {dec(FORMA["alcance_max_m"], 1)} m del centro, y la isla más cercana queda a {dec(sep, 0)} m.',
        f'La costa que se ve queda entre {dec(MED["costa_por_dentro_m"][0], 1)} y {dec(MED["costa_por_dentro_m"][1], 1)} m por dentro del borde donde chocan los barcos, y nada con altura sale del borde.',
        'El puerto sigue siendo zona segura y todo su borde es salida.']),
    ('Los 12 amarres', INK, [
        f'Caben 12 Navíos a la vez, uno en cada amarre, sin tocarse: entre los cascos más juntos quedan {dec(FORMA["holgura_minima_entre_cascos"], 1)} m. Con barcos más pequeños queda más sitio.',
        f'Cada barco sale en línea recta hacia mar abierto: entre {dec(min(exits), 0)} y {dec(max(exits), 0)} m hasta salir de la zona segura.',
        f'Nada de la isla tapa a un barco atracado desde la cámara del juego (lo más cerca, a {dec(MED["oclusion_a_cascos_min"][0], 1)} m).']),
    ('Medidas', INK, [
        f'{mil(MED["tris_total"])} triángulos, de ellos {mil(MED["tris"]["palmeras"])} en las {MED["palmeras"]} palmeras, que en el juego van aparte, como hoy. El de la lámina anterior tenía {mil(7501)}.',
        'Una textura de 1024 × 1024, la misma de la lámina anterior más la arena y la roca de las islas.']),
    ('Peso y coste', INK, [
        f'En la vista del juego que más escenario enseña (buscada moviendo la cámara por todo el mapa cada 5 m) se dibujan {mil(PT["tris"])} triángulos en {PT["draw_calls"]} llamadas; el tope es {mil(60000)} y 10. Con el puerto anterior eran {mil(D83_VISTA[0])} y {D83_VISTA[1]}.',
        f'Para entrar al juego se espera a la forma del puerto con una textura pequeña de respaldo: {kb(ENT)} KB. La textura buena ({kb(GL["ktx_B"])} KB) llega justo después. El puerto anterior pesaba {kb(D82_B)} KB.',
        f'Todo el escenario, las 15 islas y el puerto, pesa {kb(TOTAL)} KB en la primera visita; el tope es 800.']),
    ('En contra', RED, [
        'Ocupa más mar que el puerto redondo: los barcos atracados llegan más lejos del centro, y el anillo de mar alrededor es algo más estrecho.',
        'Desde la cámara del juego, las murallas del norte se ven por detrás: se leen por las almenas, las garitas y el faro.',
        'En el móvil, las casas son manchas de color; el detalle de puertas y ventanas solo se ve de cerca.',
        'Falta medir que los caminos desde cada amarre no den rodeos: lo mide la prueba del juego, no esta lámina.']
        + ([] if RESP else ['Ningún respaldo de textura pequeño pasa la regla de color: habría que esperar a la textura buena.'])
        + ([] if TOTAL <= 800000 else [f'El escenario se pasa del tope de 800 KB en {kb(TOTAL - 800000)} KB.'])),
]
yy = Y4
for title, colr, lines in BLOCKS:
    d.text((40, yy), title, font=font(19), fill=TITLE if colr == INK else RED); yy += 30
    for ln in lines:
        d.text((56, yy), '·  ' + ln, font=font(16, 500), fill=colr); yy += 26
    yy += 12
# --- datos para el juego: las reglas de GDD §4 con su medida, y las tablas de círculos y amarres
AM = FORMA['amarres']; CL = list(PF.MARGIN)
marg = min(r[c]['a_la_union'] - PF.MARGIN[c] for r in AM for c in CL); hol = min(r[c]['salida_holgura'] for r in AM for c in CL)
smax = max(r[c]['salida_m'] for r in AM for c in CL); p75 = min(FORMA['punto_0_75'].values())
RULES = [
    ('Círculos de la colisión', 'hasta 8, con el centro (0, 0) dentro', f'{FORMA["circulos"]}, con el centro dentro' if FORMA['centro_dentro'] else f'{FORMA["circulos"]}, SIN el centro', FORMA['circulos'] <= 8 and FORMA['centro_dentro']),
    ('Tamaño', 'hasta 55 m del centro, con el borde', f'{dec(FORMA["alcance_max_m"], 2)} m', FORMA['alcance_max_m'] <= 55),
    ('Amarres', '12, cada barco a su margen de toda la isla o más', f'{len(AM)}; en las 5 clases, a su margen o más (lo justo: {dec(marg, 2)} m de sobra)', len(AM) == 12 and marg >= -1e-6),
    ('Cascos de amarres distintos', 'sin solaparse (25 parejas de clases)', f'{dec(FORMA["holgura_minima_entre_cascos"], 2)} m entre los más juntos', FORMA['holgura_minima_entre_cascos'] > 0),
    ('Amarre libre', 'ningún barco atracado a < 12 m del eje de otro', f'{len(FORMA["centros_a_menos_de_12_del_eje_de_otro"])} casos', not FORMA['centros_a_menos_de_12_del_eje_de_otro']),
    ('Salida', 'en línea recta hacia fuera, navegable y de hasta 80 m', f'hasta {dec(smax, 1)} m; nunca más cerca de la isla que su margen ({dec(hol, 2)} m de sobra)', smax <= 80 and hol >= -1e-6),
    ('Aparición de respaldo', 'anillo de 60–90 m navegable en un 50 % o más (Navío); (0, 75), para las 5 clases', f'{dec(100 * FORMA["anillo_navegable_navio"], 1)} %; (0, 75) con {dec(p75, 1)} m de sobra', FORMA['anillo_navegable_navio'] >= 0.5 and p75 >= 0),
    ('Separación con las islas', 'al menos 46 m', f'{dec(sep, 1)} m ({sep_to})', sep >= 46),
    ('Costa visible', 'de 0 a 3 m por dentro del borde', f'{dec(MED["costa_por_dentro_m"][0], 2)}–{dec(MED["costa_por_dentro_m"][1], 2)} m', 0 <= MED['costa_por_dentro_m'][0] and MED['costa_por_dentro_m'][1] <= 3),
    ('Nada con altura fuera', 'hasta 0,5 m fuera del borde', 'nada fuera' if MED['fuera_max_y_pos'] <= 0 else f'{dec(MED["fuera_max_y_pos"], 2)} m', MED['fuera_max_y_pos'] <= 0.5),
    ('Lo que tapa a 55°', 'hasta 8 m fuera del borde', f'{dec(MED["oclusion_fuera_max"], 2)} m', MED['oclusion_fuera_max'] <= 8),
    ('Vista peor', 'hasta 60.000 triángulos y 10 llamadas', f'{mil(PT["tris"])} y {PT["draw_calls"]} (cámara en {tuple(int(v) for v in PT["camara"])}); máx. de llamadas {VP["mas_draw_calls"]["draw_calls"]}', PT['tris'] <= 60000 and VP['mas_draw_calls']['draw_calls'] <= 10),
    ('Peso del escenario', 'hasta 800 KB en la primera visita', f'{kb(TOTAL)} KB (islas {kb(ISLAS_B)}, puerto {kb(ENT)} + textura {kb(GL["ktx_B"])})', TOTAL <= 800000),
    ('Rutas desde cada amarre', 'hasta 1,15 veces la recta', 'sin medir aquí: lo mide la prueba del juego', None),
]
yy += 10; d.text((40, yy), 'Datos para el juego: las reglas del puerto que fijó producto, y su medida', font=font(19), fill=TITLE); yy += 32
CX = (40, 330, 1000, 1700)
for k, h in enumerate(('Regla', 'Pide', 'Queda', '')): d.text((CX[k], yy), h, font=font(15), fill=SOFT)
yy += 24
for nm, ask, got, ok in RULES:
    d.line((40, yy - 3, SW - 40, yy - 3), fill=(215, 205, 185))
    for k, t in enumerate((nm, ask, got)): d.text((CX[k], yy), t, font=font(15, 500), fill=INK)
    d.text((CX[3], yy), 'cumple' if ok else ('falta' if ok is None else 'NO cumple'), font=font(15), fill=(46, 110, 60) if ok else RED); yy += 24
yy += 18; T0 = yy
d.text((40, yy), f'Los {len(PF.CIRCLES)} círculos (x, z, r en m; +X este, +Z sur)', font=font(17), fill=TITLE); yy += 28
for k, h in enumerate(('Nº', 'Nombre', 'x', 'z', 'r')): d.text(((40, 80, 300, 380, 460)[k], yy), h, font=font(14), fill=SOFT)
yy += 22
for i, (nm, x, z, r) in enumerate(PF.CIRCLES):
    for k, t in enumerate((str(i + 1), nm, dec(x, 1), dec(z, 1), dec(r, 1))): d.text(((40, 80, 300, 380, 460)[k], yy), t, font=font(14, 500), fill=INK)
    yy += 21
ya = T0; AX = (620, 670, 840, 1000, 1080, 1260, 1420)
d.text((AX[0], ya), 'Los 12 amarres (punto de muelle Q y rumbo hacia fuera; el barco, a media eslora + 2 m de Q)', font=font(17), fill=TITLE); ya += 28
for k, h in enumerate(('Nº', 'Tramo', 'Q (x, z)', 'Rumbo', 'Navío: centro', 'Navío: salida', 'Balandra: salida')): d.text((AX[k], ya), h, font=font(14), fill=SOFT)
ya += 22
for r in AM:
    row = (str(r['amarre']), r['tramo'], f'({dec(r["Q"][0], 1)}, {dec(r["Q"][1], 1)})', f'{dec(r["psi"], 1)}°',
           f'({dec(r["Navío"]["centro"][0], 1)}, {dec(r["Navío"]["centro"][1], 1)})', f'{dec(r["Navío"]["salida_m"], 1)} m', f'{dec(r["Balandra"]["salida_m"], 1)} m')
    for k, t in enumerate(row): d.text((AX[k], ya), t, font=font(14, 500), fill=INK)
    ya += 21
yy = max(yy, ya)
sheet = sheet.crop((0, 0, SW, yy + 20))
out = os.path.join(RT.OUT, 'D92-puerto-isla.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

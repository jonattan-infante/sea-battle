# ux · lámina D91-canonera-v6.png (producto, 2026-10-24, tras el turno CV de D97; BACKLOG :421): la v5 que aprobó Jonattan
# (8d23e763…) con la KTX2 que se entrega (la del reexporte, con la sombra horneada otra vez para las velas a 48° y el foque a
# 10,5 m) y una fila más con la cubierta antes y después del rehorneado, a tamaño real (la cámara del juego de cerca,
# 12 px/m) y a ×3, sin marcas. Esa fila usa el atlas PNG sin comprimir, para que se vea solo la sombra; las vistas «como en
# el juego», la KTX2 de la entrega.
# Las vistas y las medidas de la v5 son las de lamina_canonera4.py: se ejecuta tal cual hasta «# --- la hoja», con su
# __file__. Encima: los cañones (barrido de 400 posturas) y las firmas del turno, con el atlas nuevo; los KB de las 2
# entregas; las cifras del atlas (los 2 PNG); y, en las 8 vistas que leen la KTX2 (3, 4, 7, 8, 15, 16, 19 y 20):
#   - la cifra de cada vista frente a la aprobada: ΔE76 medio sobre los px del barco (veredicto_cajas.py), sin los px de las
#     marcas (círculos y aspas) en ninguna de las 2;
#   - la condición de 0,10 de producto (BACKLOG :421, 3586ec3; la misma vista con la KTX2 y con su PNG, ΔE76 medio sobre los
#     px del barco), que tiene que pasar con 2 muestreos: (b) el de la vista, trilineal y anisótropo ×16, la KTX2 con su cadena
#     de mips y el PNG con mips de caja 2 × 2 en lineal; e (isobox) el de D90 (respaldo.py medir, :101-105 y :144): trilineal
#     sin anisótropo, con mips de caja 2 × 2 en lineal desde el nivel 0 de cada uno. Pasa si en cada vista, con los 2, la
#     nueva no supera en más de 0,10 a la de hoy. Se anota además «nivel 0» (el nivel 0 con el muestreo de la lámina), que no
#     decide. La frase «Queda igual de fiel que la de hoy» sale solo si pasan las 2.
# Controles: las vistas con la KTX2 nueva son las de la hoja; con la de hoy, las de la aprobada (fuera de las marcas).
# Uso: UX_OUT=<cadena/ de hoy> UX_RENDERER=… UX_FONTS=… AD28_MSAA4=1 AD28_MIN_CANA=6 AD28_KTX2_NUEVA=<KTX2 de la entrega> \
#      AD28_ATLAS_PNG_NUEVA=<su PNG> V6_BARRIDO=<b16m del turno> V6_FIRMAS=<ad28-canonera2.json del turno> V6_GLB=<GLB de la entrega> \
#      V6_ENTREGA_HOY=<entrega-canonera2.json de hoy> V6_ENTREGA_NUEVA=<la del reexporte> V6_APROBADA=<D91-canonera-v5.png> \
#      V6_CAJAS_V5=<cajas-D91-canonera-v5.json> \
#      python3 -I lamina_canonera6.py <scripts/ux> <variante (variante_npz.py)> <atlas_canonera2.png de hoy> <render_mip.py> <av7-png/> <salida.png>
# Un núcleo, sin GPU ni Blender. Nunca escribe en docs/game/art/.
import sys, os, json, math, hashlib, subprocess
sys.dont_write_bytecode = True
ENV = ('AD28_KTX2_NUEVA', 'AD28_ATLAS_PNG_NUEVA', 'V6_BARRIDO', 'V6_FIRMAS', 'V6_GLB', 'V6_ENTREGA_HOY', 'V6_ENTREGA_NUEVA', 'V6_APROBADA', 'V6_CAJAS_V5')
for k in ENV: assert os.environ.get(k), f'falta {k}'
UXS0 = os.path.abspath(sys.argv[1]); L4 = os.path.join(UXS0, 'ad28', 'lamina_canonera4.py')
SRC = open(L4, encoding='utf-8').read(); CUT = '# --- la hoja'; assert SRC.count(CUT) == 1
G = {'__file__': L4, '__name__': 'lamina_canonera4_en_v6'}
exec(compile(SRC[:SRC.index(CUT)], L4, 'exec'), G)
globals().update({k: v for k, v in G.items() if not k.startswith('__')})
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
FILES = {k: dict(ruta=os.environ[k], sha256=sha(os.environ[k])) for k in ('AD28_KTX2_NUEVA', 'V6_GLB', 'V6_APROBADA')}
print('v5: vistas y medidas de', L4, hashlib.md5(SRC.encode('utf-8')).hexdigest(), '· archivos', {k: v['sha256'][:8] for k, v in FILES.items()}, flush=True)

# --- veredicto_cajas.py: el fondo, la máscara del barco y el ΔE76, tal cual (su cabecera, hasta antes de leer argv)
VC = os.path.join(UXS0, 'regenerar', 'rg3', 'veredicto_cajas.py'); VSRC = open(VC, encoding='utf-8').read(); GV = {}
exec(compile(VSRC[:VSRC.index('a_p, b_p = sys.argv[1], sys.argv[2]')], VC, 'exec'), GV)
LUT = GV['bg_lut'](); lab = GV['lab']
MK = np.array([(255, 216, 77), (0, 0, 0), (255, 255, 255)])  # las marcas: anillo, su borde y el borde del aspa, y el aspa
def arr(im): return np.asarray(im.convert('RGB')).astype(int)
def ismark(a): return (a[..., None, :] == MK).all(-1).any(-1)
def de_barco(a, b, sin_marcas=False):
    a, b = arr(a), arr(b); assert a.shape == b.shape, (a.shape, b.shape)
    fa, fb = (GV['exterior'](LUT[t[..., 0], t[..., 1], t[..., 2]]) for t in (a, b)); ship = ~fa | ~fb
    if sin_marcas: ship &= ~(ismark(a) | ismark(b))
    e = np.linalg.norm(lab(a) - lab(b), axis=-1); return float(e[ship].mean()), int(ship.sum()), float(e[ship].max())

# --- las cifras del atlas (los 2 PNG)
PNG0, PNG1 = arr(Image.open(ATLAS_PNG)), arr(Image.open(PNG_NEW)); assert PNG0.shape == PNG1.shape
dif = (PNG0 != PNG1).any(-1); eA = np.linalg.norm(lab(PNG0) - lab(PNG1), axis=-1)
ATLAS = dict(lado=PNG0.shape[0], px=int(dif.sum()), pct=float(100 * dif.mean()), de_medio=float(eA[dif].mean()), de_max=float(eA.max()))

# --- cañones y firmas del turno, con el atlas nuevo; KB de las 2 entregas
B6 = json.load(open(os.environ['V6_BARRIDO'])); assert B6['variante'] == SPEC, (B6['variante'], SPEC)
SW_OLD = SW16['nueva']; SW16['nueva'] = B6['res']
for h, n in NEED.items(): assert SW16['nueva'][h]['canones6']['min'] >= n, (h, SW16['nueva'][h]['canones6'])
SAME = all((SW_OLD[h]['canones6']['min'], SW_OLD[h]['canones6']['max']) == (SW16['nueva'][h]['canones6']['min'], SW16['nueva'][h]['canones6']['max']) for h in NEED)
F6 = json.load(open(os.environ['V6_FIRMAS']))['pares']
assert len(F6) == 9 and all(v['pasa'] for v in F6.values()) and all(len(v['por_rumbo'][h]) >= 2 for k, v in F6.items() if 'canonera2' in k for h in ('45', '135', '225', '315')), F6
EH, EN = (next(iter(json.load(open(os.environ[k])).values())) for k in ('V6_ENTREGA_HOY', 'V6_ENTREGA_NUEVA'))
assert EN['sha256_ktx2'] == FILES['AD28_KTX2_NUEVA']['sha256'] and EN['sha256_glb'] == FILES['V6_GLB']['sha256'], 'la KTX2 o el GLB no son los de la entrega'
KBP = {k: 100 * (b - a) / a for k, (a, b) in dict(ktx2=(EH['ktx2_B'], EN['ktx2_B']), ktx2_gz=(EH['ktx2_gzip9_B'], EN['ktx2_gzip9_B']), respaldo=(EH['respaldo_B'], EN['respaldo_B']),
                                                  glb4c=(EH['glb_B'], EN['glb_B']), glb4c_gz=(EH['glb_gzip9_B'], EN['glb_gzip9_B']), dentro=(EH['dentro']['B'], EN['dentro']['B']),
                                                  dentro_gz=(EH['dentro']['gzip9_B'], EN['dentro']['gzip9_B'])).items()}

# --- las 8 vistas que leen la KTX2, otra vez, con cada atlas y cada muestreo (sin marcas)
def boxchain(a):
    out = [a]
    while out[-1].shape[0] > 1: x = out[-1]; out.append(x.reshape(x.shape[0] // 2, 2, x.shape[1] // 2, 2, 3).mean((1, 3)))
    return out
PB = {}; KT = {k: ATL[(k, 'aniso')] for k in ('hoy', 'nueva')}; assert all(id(v) in RM['CHAINS'] for v in KT.values())
for k in ('hoy', 'nueva'):  # el PNG con mips de caja (en las 2 cadenas) y la KTX2 con mips de caja desde su nivel 0 (para isobox)
    a = ATL[(k, 'lamina')].copy(); RM['CHAINS'][id(a)] = RM['CHAINS_BOX'][id(a)] = boxchain(a); PB[k] = a
    RM['CHAINS_BOX'][id(KT[k])] = boxchain(KT[k])
CACHE = {}
def base(v, X, how):  # la imagen de la que sale la vista v (la 4 y la 8 son la cubierta a ×3 de la 3 y la 7)
    key = (v - 1 if v in (4, 8) else v, id(X), how)
    if key in CACHE: return CACHE[key]
    if v in (3, 4, 7, 8):
        hd = 225 if v in (3, 4) else 45; r_, p_, ph = GUN[hd]['pose']; ox, oy = BL.W / 2 + ph[0], BL.H / 2 + 20 + ph[1]
        im = shot(model(NPZ['nueva'], X, math.radians(r_), math.radians(p_), 0.0), 55, hd, BL.PPM, (BL.W, BL.H, ox, oy), how, SS=4)
    elif v in (15, 16):
        h = 135 if v == 15 else 150; fr = LC.fit([model(NPZ[kk], atl(kk, 'aniso')) for kk in ('hoy', 'nueva')], 55, h, 6.2)
        im = shot(model(NPZ['nueva'], X), 55, h, 6.2, fr, how, SS=3)
    else:
        h = 225 if v == 19 else 45; r_, p_, _ = GUN[h]['pose']
        fr = LC.fit([model(NPZ[kk], atl(kk, 'aniso'), math.radians(r_), math.radians(p_)) for kk in ('hoy', 'nueva')], 55, h, 2.8)
        im = shot(model(NPZ['nueva'], X, math.radians(r_), math.radians(p_)), 55, h, 2.8, fr, how, SS=4)
    CACHE[key] = im; return im
def vista(v, X, how):
    im = base(v, X, how)
    if v in (4, 8):
        hd = 225 if v == 4 else 45; x0, x1, y0, y1 = crop_box([GUN[hd]['hoy'], GUN[hd]['nueva']])
        return im.crop((x0, y0, x1, y1)).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.NEAREST)
    return hcat(im, gray(im)) if v in (19, 20) else im
def subs(im): return [im.crop((x, y, x + w, y + h)) for x, y, w, h in im.info.get('cajas', [(0, 0, im.width, im.height)])]
SHOTS = {k: b for k, _, _, b in shots}
HOJA = dict(zip((3, 4), subs(GUNROW[(225, 'nueva')]))) | dict(zip((7, 8), subs(GUNROW[(45, 'nueva')]))) | dict(zip((15, 16), subs(SHOTS['diag']))) | dict(zip((19, 20), subs(SHOTS['movil'])))
APR = Image.open(os.environ['V6_APROBADA']).convert('RGB'); CJ5 = json.load(open(os.environ['V6_CAJAS_V5']))['cajas']
def apr(v): x, y, w, h = CJ5[v - 1]; return APR.crop((x, y, x + w, y + h))
V8 = (3, 4, 7, 8, 15, 16, 19, 20); VISTAS = {}
for v in V8:
    kn, kh = vista(v, KT['nueva'], 'aniso'), vista(v, KT['hoy'], 'aniso')
    # controles: con la KTX2 nueva, la vista de la hoja; con la de hoy, la de la aprobada; fuera de las marcas, px a px
    an, ah, hn, ap = arr(kn), arr(kh), arr(HOJA[v]), arr(apr(v)); assert an.shape == hn.shape == ah.shape == ap.shape, (v, an.shape, hn.shape, ap.shape)
    c_hoja = bool(np.array_equal(an[~ismark(hn)], hn[~ismark(hn)])); c_apr = bool(np.array_equal(ah[~ismark(ap)], ap[~ismark(ap)]))
    assert c_hoja and c_apr, (v, c_hoja, c_apr)
    cifra, npx, cmax = de_barco(HOJA[v], apr(v), sin_marcas=True)
    b_n = de_barco(kn, vista(v, PB['nueva'], 'aniso'))[0]; b_h = de_barco(kh, vista(v, PB['hoy'], 'aniso'))[0]
    n_n = de_barco(vista(v, KT['nueva'], 'lamina'), vista(v, ATL[('nueva', 'lamina')], 'lamina'))[0]; n_h = de_barco(vista(v, KT['hoy'], 'lamina'), vista(v, ATL[('hoy', 'lamina')], 'lamina'))[0]
    i_n = de_barco(vista(v, KT['nueva'], 'isobox'), vista(v, PB['nueva'], 'isobox'))[0]; i_h = de_barco(vista(v, KT['hoy'], 'isobox'), vista(v, PB['hoy'], 'isobox'))[0]
    VISTAS[v] = dict(frente_a_la_aprobada_sin_marcas=dict(medio=cifra, max=cmax, px_barco=npx), b=dict(nueva=b_n, hoy=b_h, pasa=b_n <= b_h + 0.10),
                     isobox=dict(nueva=i_n, hoy=i_h, pasa=i_n <= i_h + 0.10), nivel0_se_anota=dict(nueva=n_n, hoy=n_h))
    print(f'VISTA {v:2d} · frente a la aprobada, sin marcas: medio {cifra:.3f} y máx {cmax:.2f} ({npx} px del barco) · KTX2 frente a PNG: (b) nueva {b_n:.3f}, hoy {b_h:.3f} → {"pasa" if b_n <= b_h + 0.10 else "NO pasa"}'
          f' · (isobox) nueva {i_n:.3f}, hoy {i_h:.3f} → {"pasa" if i_n <= i_h + 0.10 else "NO pasa"} · nivel 0, se anota: nueva {n_n:.3f}, hoy {n_h:.3f} · controles hoja {c_hoja}, aprobada {c_apr}', flush=True)
PASA_B = all(v['b']['pasa'] for v in VISTAS.values()); PASA_I = all(v['isobox']['pasa'] for v in VISTAS.values()); PASA = PASA_B and PASA_I
print(f'CONDICIÓN 0,10 (b + isobox): {"PASA" if PASA else "NO PASA"}', flush=True)
print(f'  (b): {"pasa" if PASA_B else "NO pasa"} en las 8 vistas · (isobox): {"pasa" if PASA_I else "NO pasa"} en las 8 vistas', flush=True)

# --- la fila nueva: la cubierta con las velas nuevas, la sombra de antes y la de ahora (atlas PNG, sin comprimir), barco a nivel
SH = {}
for hd in (225, 45):
    mods = [model(NPZ['nueva'], ATL[(k, 'lamina')]) for k in ('hoy', 'nueva')]; fr = LC.fit(mods, 55, hd, 12.0)
    a_, b_ = (shot(m, 55, hd, 12.0, fr, 'lamina', SS=3) for m in mods)
    e = np.linalg.norm(lab(arr(a_)) - lab(arr(b_)), axis=-1)
    cw, ch_ = 120, 90; I = np.pad(e.cumsum(0).cumsum(1), ((1, 0), (1, 0)))  # la ventana de 120×90 px con más cambio, para el ×3
    s = I[ch_:, cw:] - I[:-ch_, cw:] - I[ch_:, :-cw] + I[:-ch_, :-cw]; yy, xx = np.unravel_index(np.argmax(s), s.shape)
    zoom = [im.crop((xx, yy, xx + cw, yy + ch_)).resize((3 * cw, 3 * ch_), Image.NEAREST) for im in (a_, b_)]
    SH[hd] = dict(real=(a_, b_), zoom=zoom, ventana=(int(xx), int(yy), cw, ch_), px=int((e > 0).sum()), de_medio=float(e[e > 0].mean()) if (e > 0).any() else 0.0)
    print('sombra', hd, a_.size, SH[hd]['ventana'], SH[hd]['px'], round(SH[hd]['de_medio'], 2), flush=True)
SH_REAL = (hcat(SH[225]['real'][0], SH[45]['real'][0], gap=16), hcat(SH[225]['real'][1], SH[45]['real'][1], gap=16))
SH_ZOOM = (hcat(SH[225]['zoom'][0], SH[45]['zoom'][0], gap=16), hcat(SH[225]['zoom'][1], SH[45]['zoom'][1], gap=16))

MED.update(v6=dict(archivos=FILES, atlas=ATLAS, kb_pct=KBP, firmas={k: v['pasa'] for k, v in F6.items()}, canones_400_mismos=SAME,
                   cañones_400={h: (SW16['nueva'][h]['canones6']['min'], SW16['nueva'][h]['canones6']['max']) for h in NEED},
                   vistas=VISTAS, condicion_010=dict(pasa=PASA, b=PASA_B, isobox=PASA_I), sombra={hd: dict(ventana=v['ventana'], px=v['px'], de_medio=v['de_medio']) for hd, v in SH.items()}))
json.dump(MED, open(OUTP[:-4] + '-medidas.json', 'w'), indent=1, ensure_ascii=False)
print('medidas v6', json.dumps({k: v for k, v in MED['v6'].items() if k != 'vistas'}, ensure_ascii=False), flush=True)


# --- la hoja
def font(px, w=600): return T.font(px, w)
GAP = 30
ROWS_IMG = [SH_REAL, SH_ZOOM, (GUNROW[(225, 'hoy')], GUNROW[(225, 'nueva')]), (GUNROW[(45, 'hoy')], GUNROW[(45, 'nueva')]), (cap_g, cap_m)] + [(a, b) for _, _, a, b in shots]
colw = max(max(a.width, b.width) for a, b in ROWS_IMG)
SW = max(40 + 2 * colw + GAP + 40, 1400)
sheet = Image.new('RGB', (SW, 14000), PAPER); d = ImageDraw.Draw(sheet); CAJAS = []


def para(x, y, txt, f, fill, width, lh):
    line = ''
    for w in txt.split(' '):
        t = (line + ' ' + w).strip()
        if d.textlength(t, font=f) > width and line: d.text((x, y), line, font=f, fill=fill); y += lh; line = w
        else: line = t
    if line: d.text((x, y), line, font=f, fill=fill); y += lh
    return y


LA, LB = 'Hoy, en el juego', f'Nueva: la que aprobaste (velas a {dec(OPEN_NEW, 0)}°), con la sombra rehecha'
def row(title, a, b, la=LA, lb=LB):
    global y
    y = para(40, y, title, font(19), TITLE, SW - 80, 28) + 2
    d.text((40, y), la, font=font(15), fill=SOFT); d.text((40 + colw + GAP, y), lb, font=font(15), fill=SOFT); y += 24
    for im, x0 in ((a, 40), (b, 40 + colw + GAP)):
        CAJAS.extend([(x0 + cx, y + cy, cw_, ch2) for cx, cy, cw_, ch2 in im.info.get('cajas', [(0, 0, im.width, im.height)])])
    sheet.paste(a, (40, y)); sheet.paste(b, (40 + colw + GAP, y)); y += max(a.height, b.height) + 26


def side(r_): return 'babor' if r_ < 0 else 'estribor'


d.text((40, 22), 'Cañonera pirata: la que aprobaste, con la sombra de la cubierta rehecha para las velas nuevas', font=font(32), fill=INK)
y = para(40, 66, 'Las 2 primeras filas enseñan solo la cubierta, antes y después de rehacer la sombra. Las de debajo son las de la lámina que aprobaste, ya con la sombra nueva. En la columna de la nueva, las vistas de la prueba, la de 1440×900 y la del móvil usan la textura comprimida que se entrega al juego; las de lado, desde arriba, de frente y de cerca, la textura sin comprimir.', font(17, 500), INK, SW - 80, 26) + 18
row('La cubierta de cerca, con la cámara del juego (12 px por metro), a 225° y a 45°, con el barco a nivel. Las 2 columnas llevan las velas nuevas y cambia solo la sombra pintada. En estas 2 filas la textura va sin comprimir, para que se vea solo la sombra',
    *SH_REAL, la='Antes: la sombra de las velas de antes', lb='Después: la sombra de las velas nuevas')
row('La misma cubierta a ×3, donde más cambia la sombra', *SH_ZOOM, la='Antes', lb='Después')
for hd in (225, 45):
    r_, p_, _ = GUN[hd]['pose']
    row(f'El modelo de la prueba, no una captura del juego: rumbo {hd}°, cámara más lejana del escritorio (5 px por metro), con el barco escorado {dec(abs(r_))}° a {side(r_)} y {dec(abs(p_), 2)}° de cabeceo (la peor postura de hoy entre 100 del balanceo); a la derecha de cada una, la cubierta a ×3',
        GUNROW[(hd, 'hoy')], GUNROW[(hd, 'nueva')], la=f'Hoy: el modelo cuenta {GUN[hd]["hoy"]["n"]} cañones', lb=f'Nueva, con la sombra rehecha: el modelo cuenta {GUN[hd]["nueva"]["n"]}')
y = para(40, y - 14, 'Círculo: un cañón que cuenta la prueba. Aspa: un cañón que no cuenta (tapado, o visible en menos de 6 px). La prueba cuenta cañones, no manchas: una cureña sola no suma, y 2 manchas del mismo cañón suman 1.', font(15, 500), SOFT, SW - 80, 22) + 18
row(f'Por qué al modelo le pedimos más de 8: la misma postura, a 225°, en una captura real del juego de hoy y en el modelo de hoy. El modelo ve {q1["cannons"] - GAME_N} cañones más que el juego, así que al modelo le pedimos 10 (y 9 a 45°, donde ve 1 de más) para que el juego llegue a 8',
    cap_g, cap_m, la=f'Captura del juego (hoy): cuenta {GAME_N}', lb=f'Modelo de la prueba (hoy), misma postura: cuenta {q1["cannons"]}')
for _, title, a, b in shots: row(title, a, b)

d.text((40, y), 'Cañones que se leen en el modelo en cada rumbo, en 400 posturas del balanceo (el menor y el mayor; al modelo le pedimos 10, y 9 a 45°)', font=font(19), fill=TITLE); y += 34
cols = [('', 380), ('225°', 150), ('45°', 150), ('135°', 150), ('315°', 150), ('lona de las 2 velas grandes', 270), ('lona del foque', 210)]
x = 40
for h_, w_ in cols: d.text((x, y), h_, font=font(16), fill=SOFT); x += w_
y += 28
for k, lab_ in (('hoy', 'Hoy, en el juego'), ('nueva', 'Nueva, con la sombra rehecha')):
    v = SW16[k]; prop = k == 'nueva'; f = font(16, 700 if prop else 500)
    if prop: d.rectangle((34, y - 4, 40 + sum(w for _, w in cols), y + 24), outline=TITLE, width=2)
    cells = [lab_] + [f'{v[h]["canones6"]["min"]}–{v[h]["canones6"]["max"]}' for h in ('225', '45', '135', '315')] + [
        f'{dec(AREA[k]["sail_main"], 1)} + {dec(AREA[k]["sail_fore"], 1)} m²', f'{dec(AREA[k]["jib"], 1)} m²']
    reds = [False] + [v[h]['canones6']['min'] < NEED[h] for h in ('225', '45', '135', '315')] + [False, False]
    x = 40
    for (h_, w_), c, rd in zip(cols, cells, reds): d.text((x, y), c, font=f, fill=RED if rd else INK); x += w_
    y += 30
y += 16

nmin = {h: SW16['nueva'][h]['canones6']['min'] for h in ('225', '45', '135', '315')}
C6 = {k: v for k, v in F6.items() if 'canonera2' in k}; N6 = sum(v['pasa'] for v in C6.values())  # las de la Cañonera nueva: con sombra, sin ella y LOD1, frente al pirata y al capitán
assert N6 == len(C6) == 6 and {k.split('–')[1] for k in C6} == {'canonera2', 'canonera2_sin_sombra', 'canonera2_lod1'} and {k.split('–')[0] for k in C6} == {'pirata', 'capitan'}, C6
def sg(p): return ('+' if p >= 0 else '') + dec(p, 1)
FA = {v: VISTAS[v]['frente_a_la_aprobada_sin_marcas'] for v in V8}; c = {v: f'{dec(FA[v]["medio"], 2)} ({dec(FA[v]["max"], 0)})' for v in V8}
CONTRA = ['Al guardar otra vez la textura comprimida que usa el juego, cambia un poco todo el barco, no solo la cubierta: el compresor reparte su error de otra manera.',
          f'Diferencia de color con la lámina que aprobaste, sin contar los círculos y las aspas, en las vistas con la textura comprimida (la media y, entre paréntesis, el punto que más cambia): en la prueba a 225°, {c[3]} el barco y {c[4]} la cubierta a ×3; a 45°, {c[7]} y {c[8]}; en 1440×900 a 135° y a 150°, {c[15]} y {c[16]}; en el móvil a 225° y a 45°, {c[19]} y {c[20]}.',
          f'De media cambia de {dec(min(f["medio"] for f in FA.values()), 1)} a {dec(max(f["medio"] for f in FA.values()), 1)} (una diferencia empieza a notarse hacia 2,3); en algunos puntos sueltos, hasta {dec(max(f["max"] for f in FA.values()), 0)}.']
if PASA: CONTRA.append('Queda igual de fiel que la de hoy.')
BLOCKS = [
    ('Qué es', INK, ['Es la Cañonera que aprobaste, con la sombra pintada de la cubierta rehecha para las velas nuevas, como proponía la lámina.']),
    ('Júzgalo por', INK, ['La fila de la cubierta de cerca: se va la sombra de las velas de antes y llega la de las nuevas. En el barco como se ve en el juego casi no se nota.']),
    ('Las cifras', INK, [
        f'La textura: cambia el {dec(ATLAS["pct"], 2)} % de sus puntos, con una diferencia de color de {dec(ATLAS["de_medio"], 2)} de media y de {dec(ATLAS["de_max"], 2)} como mucho. Mismo tamaño ({ATLAS["lado"]} × {ATLAS["lado"]}) y mismo dibujo.',
        f'El peso: de {sg(min(KBP.values()))} a {sg(max(KBP.values()))} %, según la medida.',
        f'Los cañones que se leen, como mínimo, en 400 posturas del balanceo: {nmin["225"]} a 225°, {nmin["45"]} a 45°, {nmin["135"]} a 135° y {nmin["315"]} a 315°' + (', los mismos que con la sombra de antes.' if SAME else '.'),
        f'Se sigue distinguiendo del pirata y del capitán en grises y a la escala del móvil: pasan sus {N6} comparaciones en los 4 rumbos (frente a cada uno, con su sombra en el agua, sin ella y con el modelo de lejos).']),
    ('En contra', RED, CONTRA),
    ('Lo que te pido', INK, ['¿La apruebas así?']),
]
for title, colr, lines in BLOCKS:
    d.text((40, y), title, font=font(19), fill=TITLE if colr == INK else RED); y += 30
    for ln in lines:
        d.text((56, y), '·', font=font(16, 500), fill=colr); y = para(74, y, ln, font(16, 500), colr, SW - 120, 24) + 2
    y += 12
sheet = sheet.crop((0, 0, SW, y + 20)); sheet.save(OUTP, optimize=True)
json.dump(dict(lamina=os.path.basename(OUTP), cajas=CAJAS, atlas_nueva=dict(ktx2=KTX_NEW, png=PNG_NEW)), open(OUTP[:-4] + '-cajas.json', 'w'), indent=1)
print('hoja', OUTP, sheet.size, hashlib.sha256(open(OUTP, 'rb').read()).hexdigest(), flush=True)

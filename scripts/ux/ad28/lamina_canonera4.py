# ux · lámina de la Cañonera con las velas al tercio abiertas a 48° (hoy 25°) y el puño de driza del foque a 10,5 m (hoy
# 12,1 m): AD-28 con el balanceo (producto, BACKLOG r11 :421; propuesta aceptada por producto el 2026-10-24). Dos columnas,
# la aprobada (D91-canonera-v2) y la nueva:
#   - la prueba de los cañones (modelo, 1440×900 con la cámara más lejana, 5,036 px/m) a 225° y a 45°, en la peor postura de
#     hoy entre 100 del balanceo, con los cañones que cuenta el modelo (balanceo.py, caña ≥ 6, MSAA 4×);
#   - la captura 1/5 del juego a 225° (a-v7) junto al modelo de hoy en su postura y su fase encajada (comparar.py);
#   - el móvil (390×844, 2,8 px/m) a 225° y a 45°; de lado; desde arriba; las velas de frente (20 px/m), cada una en su rumbo
#     de frente; y de cerca con la cámara del juego (12 px/m) a 45° y a 225°;
#   - la tabla del barrido de 400 posturas (barrido16m.py) y las medidas (lona, triángulos, firmas, foque, holgura, vuelo).
# Las vistas «como en el juego» muestrean la KTX2 con trilineal y anisótropo ×16 (render_mip.py, md5 72e1e3ca…); las de
# cerca, el atlas PNG entregado sin mip, como la aprobada. Luz de forma y sombra en el agua de la receta (lamina_capitan.shot).
# Uso: UX_OUT=<cadena/ entregada> UX_RENDERER=… UX_FONTS=… AD28_MSAA4=1 AD28_MIN_CANA=6 \
#      python3 -I lamina_canonera4.py <scripts/ux> <variante (variante_npz.py)> <atlas_canonera2.png> <render_mip.py> <av7-png/> <salida.png>
# Un núcleo, sin GPU ni Blender. Nunca escribe en docs/game/art/.
import sys, os, json, math, struct, subprocess, hashlib
sys.dont_write_bytecode = True
UXS, VARD, ATLAS_PNG, RMIP, AV7, OUTP = sys.argv[1:7]
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
sys.argv = [sys.argv[0], UXS, 'x']
import balanceo as BL
import comparar as CMP
import numpy as np
from PIL import Image, ImageDraw
import tienda as T
import lamina_capitan as LC
A, C2, CV, RTX, M = BL.A, BL.C2, BL.CV, BL.RTX, BL.M
PAPER, INK, SOFT, TITLE, RED = LC.PAPER, LC.INK, LC.SOFT, LC.TITLE, LC.RED
assert BL.MSAA4 and BL.MIN_CANA == 6, 'falta AD28_MSAA4=1 y AD28_MIN_CANA=6'

# --- el muestreo del juego (render_mip.py: chain, bil, trilin y render; se ejecutan sus definiciones tal cual)
assert hashlib.md5(open(RMIP, 'rb').read()).hexdigest() == '72e1e3ca47b4741173160cd56fd8aeaf', 'render_mip.py no es el de la tanda del mip'
src = open(RMIP).read(); src = src[src.index('def chain(ktx):'):src.index('def patched(')]
OUTD = os.path.join(os.path.dirname(os.path.abspath(OUTP)), 'mip-tmp'); os.makedirs(OUTD, exist_ok=True)
RM = dict(np=np, math=math, struct=struct, subprocess=subprocess, os=os, RTX=RTX, M=M, OUTD=OUTD, CHAINS={}, CHAINS_BOX={})
exec(compile(src, RMIP, 'exec'), RM)
ORIG = RTX.render; MODE = {'how': 'lamina'}


def patched(*a, **k):  # LC.shot llama a RTX.render: con 'aniso' y un atlas con su cadena, el de render_mip; si no (la sombra), el de siempre
    if MODE['how'] == 'lamina' or id(a[3]) not in RM['CHAINS']: return ORIG(*a, **k)
    return RM['render'](*a, how=MODE['how'], **k)


RTX.render = patched
KTX = os.path.join(A.CAD, 'comp', 'atlas_canonera2.ktx2')
atlas_ktx = A.ktx_lin(KTX); RM['CHAINS'][id(atlas_ktx)] = RM['chain'](KTX)
assert np.array_equal(RM['CHAINS'][id(atlas_ktx)][0], atlas_ktx)
atlas_png = RTX.srgb2lin(np.asarray(Image.open(ATLAS_PNG).convert('RGB'), float))
# la columna nueva puede llevar otro atlas, el del reexporte con la AO rehorneada (turno de D97, AC-192 f): AD28_KTX2_NUEVA
# y AD28_ATLAS_PNG_NUEVA; sin ellas, el de hoy en las 2 columnas, como en la lámina aprobada
KTX_NEW, PNG_NEW = os.environ.get('AD28_KTX2_NUEVA'), os.environ.get('AD28_ATLAS_PNG_NUEVA')
ATL = {('hoy', 'aniso'): atlas_ktx, ('hoy', 'lamina'): atlas_png, ('nueva', 'aniso'): atlas_ktx, ('nueva', 'lamina'): atlas_png}
if KTX_NEW:
    ATL[('nueva', 'aniso')] = A.ktx_lin(KTX_NEW); RM['CHAINS'][id(ATL[('nueva', 'aniso')])] = RM['chain'](KTX_NEW)
if PNG_NEW: ATL[('nueva', 'lamina')] = RTX.srgb2lin(np.asarray(Image.open(PNG_NEW).convert('RGB'), float))
def atl(k, how): return ATL[(k, 'aniso' if how == 'aniso' else 'lamina')]
NPZ = {'hoy': os.path.join(A.CAD, 'canonera2_lod0.npz'), 'nueva': os.path.join(VARD, 'cadena', 'canonera2_lod0.npz')}
NPZ1 = {'hoy': os.path.join(os.path.dirname(ATLAS_PNG), 'canonera2_lod1.npz'), 'nueva': os.path.join(VARD, 'cadena', 'canonera2_lod1.npz')}  # la entrega, junto a su atlas
VAR = json.load(open(os.path.join(VARD, 'variante.json'))); SPEC = VAR['variante']
OPEN_HOY, OPEN_NEW = math.degrees(C2.OPEN), VAR['abre_grados']; JIB_HOY, JIB_NEW = C2.FORE_TOP - 0.3, VAR['foque_driza_y']
assert SPEC == f'abre:{OPEN_NEW:g}+foquecab:{JIB_NEW:g}', SPEC
FACE = {'hoy': 90 - OPEN_HOY, 'nueva': 90 - OPEN_NEW}  # rumbo con las velas al tercio de frente a la cámara de lado


def model(npz, atlas, roll=0.0, pitch=0.0, y=0.0):
    d = np.load(npz); P = d['p']; N = CV.vertex_normals(P)
    cr, sr, cp, sp = math.cos(roll), math.sin(roll), math.cos(pitch), math.sin(pitch)
    R = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]]) @ np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    P = P @ R.T + np.array([0, y, 0]); N = N @ R.T
    C4 = np.concatenate([d['c'], d['r'][:, None]], axis=1); Pc, UVc, C4c, Nc = RTX.clip_below_water(P, d['t'], C4, N)
    return dict(P=Pc, UV=UVc, C=C4c[:, :3], S=C4c[:, 3], N=Nc, A=atlas, shadow=True)


def shot(mod, th, hd, ppm, fr, how, sky=None, SS=3):
    MODE['how'] = how
    try: return LC.shot(mod, th, hd, ppm, fr, sky=sky, SS=SS)
    finally: MODE['how'] = 'lamina'


def gray(im): return im.convert('L').convert('RGB')
def hcat(*ims, gap=0):
    W_ = sum(i.width for i in ims) + gap * (len(ims) - 1); H_ = max(i.height for i in ims); out = Image.new('RGB', (W_, H_), PAPER); x = 0
    cajas = []
    for i in ims:
        out.paste(i, (x, 0)); cajas += [(x + cx, cy, cw, ch) for cx, cy, cw, ch in i.info.get('cajas', [(0, 0, i.width, i.height)])]; x += i.width + gap
    if gap == 0: assert len({i.height for i in ims}) == 1; cajas = [(0, 0, W_, H_)]
    out.info['cajas'] = cajas
    return out


def ring(d, x, y, R=13):
    d.ellipse((x - R - 1, y - R - 1, x + R + 1, y + R + 1), outline=(0, 0, 0), width=4); d.ellipse((x - R, y - R, x + R, y + R), outline=(255, 216, 77), width=2)


def cross(d, x, y, s=7):
    for w, col in ((5, (0, 0, 0)), (2, (255, 255, 255))):
        d.line((x - s, y - s, x + s, y + s), fill=col, width=w); d.line((x - s, y + s, x + s, y - s), fill=col, width=w)


# --- la prueba de los cañones a 225° y a 45°: la peor postura de hoy entre 100 (5 alabeos × 5 cabeceos × 4 fases)
ROLLS = [-3.0, -1.5, 0.0, 1.5, 3.0]; PITCHES = [-1.5, -0.75, 0.0, 0.75, 1.5]; PH4 = [(0, 0), (0.5, 0.5), (0.25, 0.75), (0.75, 0.25)]
MOD = {'hoy': BL.load_variant('base'), 'nueva': BL.load_variant(SPEC, ktx=KTX_NEW)}


def counted_of(q):
    big = [b for b in q['manchas'] if b['feret'] >= 4 and b['canon'] and b['principal'] is not None and b['cana_px'][b['principal']] >= BL.MIN_CANA]
    best = {}
    for b in big:
        g = b['principal']
        if g not in best or b['cana_px'][g] > best[g]['cana_px'][g]: best[g] = b
    return best


def centers(k, hd, roll, pitch, y, ph):
    P, UV, C, N, tg, gn = BL.pose_arrays(*MOD[k][:3], hd, math.radians(roll), math.radians(pitch), y)
    can = tg == BL.TI['canon']; ox, oy = BL.W / 2 + ph[0], BL.H / 2 + 20 + ph[1]
    r = BL.raster(P, tg, hd, ox, oy, np.zeros(len(tg), bool), np.zeros(len(tg), bool), can); cen = {}
    for g in range(12):
        ys, xs = np.nonzero(np.where(r['iC'] >= 0, gn[np.maximum(r['iC'], 0)] == g, False))
        cen[g] = ((xs.mean() + 0.5) / BL.SS, (ys.mean() + 0.5) / BL.SS)
    return cen, (ox, oy)


GUN = {}
for hd in (225, 45):
    grid = [(BL.count(MOD['hoy'], hd, math.radians(r), math.radians(p), 0.0, f)['cannons'], r, p, f) for r in ROLLS for p in PITCHES for f in PH4]
    worst = min(grid, key=lambda g: (g[0], -abs(g[1])))
    _, ROLL, PITCH, PH = worst; GUN[hd] = dict(pose=(ROLL, PITCH, PH), hoy_100=(min(g[0] for g in grid), max(g[0] for g in grid)))
    for k in ('hoy', 'nueva'):
        q = BL.count(MOD[k], hd, math.radians(ROLL), math.radians(PITCH), 0.0, PH, detail=True); best = counted_of(q)
        assert len(best) == q['cannons'], (len(best), q['cannons'])
        cen, (ox, oy) = centers(k, hd, ROLL, PITCH, 0.0, PH)
        img = shot(model(NPZ[k], atl(k, 'aniso'), math.radians(ROLL), math.radians(PITCH), 0.0), 55, hd, BL.PPM, (BL.W, BL.H, ox, oy), 'aniso', SS=4)
        GUN[hd][k] = dict(img=img, n=q['cannons'], best=best, hidden=[g for g in range(12) if g not in best], cen=cen)
    print('prueba', hd, GUN[hd]['pose'], 'hoy', GUN[hd]['hoy']['n'], 'nueva', GUN[hd]['nueva']['n'], flush=True)


def crop_box(panels):
    xs = [c[0] for p in panels for c in p['cen'].values()]; ys = [c[1] for p in panels for c in p['cen'].values()]
    return int(min(xs)) - 12, int(max(xs)) + 13, int(min(ys)) - 12, int(max(ys)) + 13


Z = 3
def marked(img, box, rings, crosses):
    x0, x1, y0, y1 = box; im = img.crop((x0, y0, x1, y1)).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.NEAREST); d = ImageDraw.Draw(im)
    for x, y in rings: ring(d, (x - x0) * Z, (y - y0) * Z)
    for x, y in crosses: cross(d, (x - x0) * Z, (y - y0) * Z)
    return im


GUNROW = {}
for hd in (225, 45):
    box = crop_box([GUN[hd]['hoy'], GUN[hd]['nueva']])
    for k in ('hoy', 'nueva'):
        p = GUN[hd][k]; rings = [(b['centro'][0] + 0.5, b['centro'][1] + 0.5) for b in p['best'].values()]
        GUNROW[(hd, k)] = hcat(p['img'], marked(p['img'], box, rings, [p['cen'][g] for g in p['hidden']]), gap=12)

# --- la captura 1/5 del juego a 225° (a-v7) junto al modelo de hoy en su postura y su fase encajada
ENC = json.load(open(os.path.join(HERE, 'comparar-encaje-225-1-cana6.json'))); PH1 = tuple(ENC['fase']); DX, DY = ENC['desplazamiento']
pose1 = BL.AV6[0]
fcon, freg, fpie = (os.path.join(AV7, f'ad28-225-balanceo-1-{n}.png') for n in ('con', 'region', 'piezas'))
blobs, _ = CMP.game_blobs(fcon, freg, fpie)
_, gm = CMP.gun_maps(MOD['hoy'], pose1, PH1, 225)
PIE = np.asarray(Image.open(fpie).convert('RGB'))
game_best = {}
for b in blobs:
    if b['feret'] < 4 or not b['rojo']: continue
    yy, xx = b['px'][:, 0], b['px'][:, 1]; full = PIE[yy, xx, 0] == 255  # px de caña con las 4 muestras del MSAA (rojo pleno)
    my, mx = yy - DY, xx - DX; ok = (my >= 0) & (my < BL.H) & (mx >= 0) & (mx < BL.W)
    g = np.where(ok, gm[np.clip(my, 0, BL.H - 1), np.clip(mx, 0, BL.W - 1)], -1); cana = {}
    for gg in g[full & ok & (g >= 0)]: cana[int(gg)] = cana.get(int(gg), 0) + 1
    if not cana: continue
    pr = max(cana, key=cana.get)
    if cana[pr] >= BL.MIN_CANA and (pr not in game_best or cana[pr] > game_best[pr][0]): game_best[pr] = (cana[pr], (float(xx.mean()) + 0.5 - DX, float(yy.mean()) + 0.5 - DY))
GAME_N = len(game_best)
q1 = BL.count(MOD['hoy'], 225, math.radians(pose1[0]), math.radians(pose1[1]), pose1[2], PH1, detail=True); best1 = counted_of(q1)
cen1, (ox1, oy1) = centers('hoy', 225, pose1[0], pose1[1], pose1[2], PH1)
img_m1 = shot(model(NPZ['hoy'], atlas_ktx, math.radians(pose1[0]), math.radians(pose1[1]), pose1[2]), 55, 225, BL.PPM, (BL.W, BL.H, ox1, oy1), 'aniso', SS=4)
img_g1 = Image.open(fcon).convert('RGB').crop((DX, DY, DX + BL.W, DY + BL.H))
box1 = crop_box([dict(cen=cen1)])
cap_g = hcat(img_g1, marked(img_g1, box1, [c for _, c in game_best.values()], [cen1[g] for g in range(12) if g not in game_best]), gap=12)
cap_m = hcat(img_m1, marked(img_m1, box1, [(b['centro'][0] + 0.5, b['centro'][1] + 0.5) for b in best1.values()], [cen1[g] for g in range(12) if g not in best1]), gap=12)
print('captura 1/5 a 225°: juego', GAME_N, '(registro del a-v7: 6) · modelo', q1['cannons'], flush=True)

# --- el resto de vistas
VIEWS = [  # (clave, título, th, rumbo, px/m, cielo, muestreo, grises, pose por rumbo)
    ('diag', 'Como en el juego, en 1440×900 (6,2 px por metro), a 135° y a 150°, sin balanceo: toda vela de este tipo se ve de canto en algún rumbo. Hoy pasa cerca de 150° (y de 330°); con las velas a 48°, cerca de 135° (y de 315°)', 55, 'diag', 6.2, False, 'aniso', False),
    ('movil', 'En el móvil, en 390×844 (2,8 px por metro), a 225° y a 45° en la misma postura, en color y en grises', 55, None, 2.8, False, 'aniso', True),
    ('lado', 'De lado (9 px por metro), en color y en grises', 0, 90, 9.0, True, 'lamina', True),
    ('arriba', 'Desde arriba (9 px por metro): las 2 velas grandes, giradas hacia estribor', 90, 90, 9.0, False, 'lamina', False),
    ('frente', 'Las velas de frente (20 px por metro), cada barco girado hasta tener sus velas de cara: la lona entera, con sus paños, sus remiendos y la calavera', 0, 'face', 20.0, True, 'lamina', False),
    ('cerca', 'De cerca, con la cámara del juego (12 px por metro), a 225° y a 45° en la misma postura: así se ven la calavera y los paños con la vela girada', 55, None, 12.0, False, 'lamina', False),
]
shots = []
for key, title, th, hd, ppm, sky, how, gr in VIEWS:
    cols = {}
    if hd == 'diag':
        for k in ('hoy', 'nueva'):
            ims = []
            for h in (135, 150):
                mods = [model(NPZ[kk], atl(kk, 'aniso')) for kk in ('hoy', 'nueva')]; fr = LC.fit(mods, th, h, ppm)
                ims.append(shot(mods[0 if k == 'hoy' else 1], th, h, ppm, fr, how, SS=3))
            cols[k] = hcat(*ims, gap=16)
    elif hd is None:  # 225° y 45°, uno junto al otro, en la peor postura de hoy de cada rumbo
        for k in ('hoy', 'nueva'):
            ims = []
            for h in (225, 45):
                r_, p_, _ = GUN[h]['pose']; mods = [model(NPZ[kk], atl(kk, how), math.radians(r_), math.radians(p_)) for kk in ('hoy', 'nueva')]
                fr = LC.fit(mods, th, h, ppm); im = shot(mods[0 if k == 'hoy' else 1], th, h, ppm, fr, how, SS=4 if ppm < 4 else 3)
                ims.append(hcat(im, gray(im)) if gr else im)
            cols[k] = hcat(*ims, gap=16)
    elif hd == 'face':
        mods = {k: model(NPZ[k], atl(k, 'lamina')) for k in ('hoy', 'nueva')}
        frs = {k: LC.fit([mods[k]], th, FACE[k], ppm) for k in mods}; Wm = max(f[0] for f in frs.values()); Hm = max(f[1] for f in frs.values())
        for k in mods:
            W_, H_, ox, oy = frs[k]; fr = (Wm, Hm, ox + (Wm - W_) / 2, oy + (Hm - H_) / 2)
            cols[k] = shot(mods[k], th, FACE[k], ppm, fr, how, sky=fr[3] if sky else None)
    else:
        mods = [model(NPZ[k], atl(k, how)) for k in ('hoy', 'nueva')]
        fr = LC.fit(mods, th, hd, ppm); sk = fr[3] if sky else None
        for k, m in zip(('hoy', 'nueva'), mods):
            im = shot(m, th, hd, ppm, fr, how, sky=sk, SS=4 if ppm < 4 else 3); cols[k] = hcat(im, gray(im)) if gr else im
    shots.append((key, title, cols['hoy'], cols['nueva'])); print('vista', key, cols['hoy'].size, cols['nueva'].size, flush=True)

# --- medidas (de los npz, de canonera2_curvo y de los barridos de 400 posturas)
tri = lambda p: len(np.load(p)['p']) // 3
MED = dict(lod0=(tri(NPZ['hoy']), tri(NPZ['nueva'])), lod1=(tri(NPZ1['hoy']), tri(NPZ1['nueva'])))
for k in ('lod0', 'lod1'): assert MED[k][0] == MED[k][1], MED
for f in ('t', 'c', 'r'): assert np.array_equal(np.load(NPZ['hoy'])[f], np.load(NPZ['nueva'])[f]), f  # misma UV, color y rim: el mismo atlas
FIR0 = json.load(open(os.path.join(VARD, 'ad28-canonera2.json')))['pares']; FIR = {k: v['pasa'] for k, v in FIR0.items() if 'canonera2' in k}
# producto, 2026-10-24: la frase «en los 4 rumbos, también a 135° y 315°» solo si cada par pasa en cada rumbo (≥ 2 firmas)
FIR_4 = all(len(v['por_rumbo'][h]) >= v['minimo'] for k, v in FIR0.items() if 'canonera2' in k for h in ('45', '135', '225', '315'))
assert FIR_4 and all(FIR.values()), FIR0
AREA = {'hoy': json.load(open(os.path.join(HERE, 'var-base', 'variante.json')))['area_m2'], 'nueva': VAR['area_m2']}
SW16 = {'hoy': json.load(open(os.path.join(HERE, 'b16m-base.json')))['res'], 'nueva': json.load(open(os.path.join(HERE, f'b16m-{SPEC.replace(":", "-")}.json')))['res']}
NEED = {'225': 10, '45': 9, '135': 10, '315': 10}
Hh = C2.hull_of(); zs = 13.2; ys = Hh.top(zs) - 0.2; tack = np.array([0.0, ys + 1.5, C2.BOW_END[1] - 0.3])
luff = {k: float(np.linalg.norm(np.array([0.0, y_, C2.FORE_Z]) - tack)) for k, y_ in (('hoy', JIB_HOY), ('nueva', JIB_NEW))}
# vuelo de las velas fuera del casco y holgura sobre él: de la geometría anotada (balanceo.build_tagged), hoy y con la variante
def tagged(k):
    a, tag, gun = MOD[k][:3]; P = a['p'].reshape(-1, 3, 3); tg = tag
    return P, tg
geo = {}
for k in ('hoy', 'nueva'):
    P, tg = tagged(k); sail = P[np.isin(tg, [BL.TI['vela']])].reshape(-1, 3); jib = P[tg == BL.TI['foque']].reshape(-1, 3)
    solid = P[np.isin(tg, [BL.TI[t] for t in ('casco', 'cubierta', 'alcazar', 'castillo', 'mamparo', 'detalle')])].reshape(-1, 3)
    beam = float(np.abs(solid[:, 0]).max())
    # holgura: para cada vértice de vela, su altura sobre lo sólido que tiene en su vertical (rayo vertical contra los
    # triángulos del casco, la cubierta, el alcázar, el castillo, los mamparos y los detalles); negativa = la vela lo atraviesa
    ST = P[np.isin(tg, [BL.TI[t] for t in ('casco', 'cubierta', 'alcazar', 'castillo', 'mamparo', 'detalle')])]
    a0, a1, a2 = ST[:, 0], ST[:, 1], ST[:, 2]; den = (a1[:, 0] - a0[:, 0]) * (a2[:, 2] - a0[:, 2]) - (a2[:, 0] - a0[:, 0]) * (a1[:, 2] - a0[:, 2])
    ok_t = np.abs(den) > 1e-9; hol = []
    for v in sail:
        u = ((v[0] - a0[:, 0]) * (a2[:, 2] - a0[:, 2]) - (a2[:, 0] - a0[:, 0]) * (v[2] - a0[:, 2])) / np.where(ok_t, den, 1)
        w = ((a1[:, 0] - a0[:, 0]) * (v[2] - a0[:, 2]) - (v[0] - a0[:, 0]) * (a1[:, 2] - a0[:, 2])) / np.where(ok_t, den, 1)
        hit = ok_t & (u >= 0) & (w >= 0) & (u + w <= 1)
        if hit.any(): hol.append(float((v[1] - (a0[hit, 1] + u[hit] * (a1[hit, 1] - a0[hit, 1]) + w[hit] * (a2[hit, 1] - a0[hit, 1]))).min()))
    geo[k] = dict(vuelo=round(float(np.abs(sail[:, 0]).max()), 2), manga=round(beam, 2), holgura_min=round(float(min(hol)), 2) if hol else None,
                  foque_tope=round(float(jib[:, 1].max()), 2))
VCAM = np.array([0.0, math.sin(math.radians(55)), math.cos(math.radians(55))])
def facing(k, hd):
    a, tag, gun = MOD[k][:3]; P = a['p'].reshape(-1, 3, 3)
    uvc = a['t'].reshape(-1, 3, 2).mean(1) * np.array([C2.AT.A, -C2.AT.A]) + np.array([0, C2.AT.A]); x0, y0, w, h = C2.AT.R['sail_main']
    T_ = P[(uvc[:, 0] >= x0) & (uvc[:, 0] <= x0 + w) & (uvc[:, 1] >= y0) & (uvc[:, 1] <= y0 + h)]; n = np.cross(T_[:, 1] - T_[:, 0], T_[:, 2] - T_[:, 0])
    ps = math.radians(hd); Ry = np.array([[math.cos(ps), 0, math.sin(ps)], [0, 1, 0], [-math.sin(ps), 0, math.cos(ps)]])
    return float(abs((n @ Ry.T @ VCAM).sum()) / np.linalg.norm(n, axis=1).sum())
FACING = {k: {hd: round(facing(k, hd), 3) for hd in range(0, 360, 15)} for k in ('hoy', 'nueva')}
EDGE = {k: min(v, key=v.get) for k, v in FACING.items()}
assert abs(geo['nueva']['foque_tope'] - JIB_NEW) < 0.05 and abs(geo['hoy']['foque_tope'] - JIB_HOY) < 0.05, geo
MED.update(de_cara=FACING, de_canto=EDGE, firmas=FIR, lona=AREA, foque_gratil=luff, geometria=geo, abre=(OPEN_HOY, OPEN_NEW), foque_driza=(JIB_HOY, JIB_NEW),
           cañones_400={k: {h: (v[h]['canones6']['min'], v[h]['canones6']['max'], v[h]['canones6']['hist'][str(v[h]['canones6']['min'])]) for h in v} for k, v in SW16.items()},
           prueba={hd: dict(pose=GUN[hd]['pose'], hoy=GUN[hd]['hoy']['n'], nueva=GUN[hd]['nueva']['n'], hoy_100=GUN[hd]['hoy_100']) for hd in GUN},
           captura_225_1=dict(juego=GAME_N, modelo=q1['cannons'], fase=PH1, desplazamiento=(DX, DY), iou=ENC['iou']))
json.dump(MED, open(OUTP[:-4] + '-medidas.json', 'w'), indent=1, ensure_ascii=False)
print('medidas', json.dumps(MED, ensure_ascii=False), flush=True)


def dec(x, k=1): return f'{x:.{k}f}'.replace('.', ',')
def mil(n): return f'{n:,}'.replace(',', '.')
def pct(a, b): return dec(100 * (b - a) / a, 1)


# --- la hoja
def font(px, w=600): return T.font(px, w)


GAP = 30
ROWS_IMG = [(GUNROW[(225, 'hoy')], GUNROW[(225, 'nueva')]), (GUNROW[(45, 'hoy')], GUNROW[(45, 'nueva')]), (cap_g, cap_m)] + [(a, b) for _, _, a, b in shots]
colw = max(max(a.width, b.width) for a, b in ROWS_IMG)
SW = max(40 + 2 * colw + GAP + 40, 1400)
sheet = Image.new('RGB', (SW, 12000), PAPER); d = ImageDraw.Draw(sheet); CAJAS = []


def para(x, y, txt, f, fill, width, lh):
    line = ''
    for w in txt.split(' '):
        t = (line + ' ' + w).strip()
        if d.textlength(t, font=f) > width and line: d.text((x, y), line, font=f, fill=fill); y += lh; line = w
        else: line = t
    if line: d.text((x, y), line, font=f, fill=fill); y += lh
    return y


jib_loss = pct(AREA['hoy']['jib'], AREA['nueva']['jib'])[1:]
d.text((40, 22), 'Cañonera pirata: las velas más abiertas y el foque más bajo, para que se vean sus cañones', font=font(32), fill=INK)
y = para(40, 66, f'La Cañonera tiene que enseñar sus cañones: el diseño del juego pide «batería de cañones visible», y la regla es que se lean al menos 8 en cada rumbo con la cámara más lejana del escritorio. En la prueba del juego, navegando a 225° y a 45° y escorada por las olas, en 3 de 10 capturas se leían 6 o 7: las velas tapan los cañones del costado de enfrente. El arreglo gira más las 2 velas grandes alrededor de su palo, de {dec(OPEN_HOY, 0)}° a {dec(OPEN_NEW, 0)}°, y baja {dec(JIB_HOY - JIB_NEW)} m la punta del foque. Las 2 velas grandes no se acortan: conservan su lona, sus paños y la calavera; el foque pierde un {jib_loss} % de lona. A la izquierda, la aprobada; a la derecha, la nueva. Las vistas de la prueba de los cañones y las del móvil llevan el filtrado de textura que tendrá el juego; las demás, la textura entera, como la lámina aprobada.', font(17, 500), SOFT, SW - 80, 26) + 22


def row(title, a, b, la='Hoy (la aprobada)', lb=f'Nueva (velas a {dec(OPEN_NEW, 0)}°, foque más bajo)'):
    global y
    y = para(40, y, title, font(19), TITLE, SW - 80, 28) + 2
    d.text((40, y), la, font=font(15), fill=SOFT); d.text((40 + colw + GAP, y), lb, font=font(15), fill=SOFT); y += 24
    for im, x0 in ((a, 40), (b, 40 + colw + GAP)):
        CAJAS.extend([(x0 + cx, y + cy, cw, ch) for cx, cy, cw, ch in im.info.get('cajas', [(0, 0, im.width, im.height)])])
    sheet.paste(a, (40, y)); sheet.paste(b, (40 + colw + GAP, y)); y += max(a.height, b.height) + 26


def side(r_):
    return 'babor' if r_ < 0 else 'estribor'


for hd in (225, 45):
    r_, p_, _ = GUN[hd]['pose']
    row(f'El modelo de la prueba, no una captura del juego: rumbo {hd}°, cámara más lejana del escritorio (5 px por metro), con el barco escorado {dec(abs(r_))}° a {side(r_)} y {dec(abs(p_), 2)}° de cabeceo (la peor postura de hoy entre 100 del balanceo); a la derecha de cada una, la cubierta a ×3',
        GUNROW[(hd, 'hoy')], GUNROW[(hd, 'nueva')], la=f'Hoy: el modelo cuenta {GUN[hd]["hoy"]["n"]} cañones', lb=f'Nueva: el modelo cuenta {GUN[hd]["nueva"]["n"]}')
y = para(40, y - 14, 'Círculo: un cañón que cuenta la prueba. Aspa: un cañón que no cuenta (tapado, o visible en menos de 6 px). La prueba cuenta cañones, no manchas: una cureña sola no suma, y 2 manchas del mismo cañón suman 1.', font(15, 500), SOFT, SW - 80, 22) + 18
row(f'Por qué al modelo le pedimos más de 8: la misma postura, a 225°, en una captura real del juego de hoy y en el modelo de hoy. El modelo ve {q1["cannons"] - GAME_N} cañones más que el juego, así que al modelo le pedimos 10 (y 9 a 45°, donde ve 1 de más) para que el juego llegue a 8',
    cap_g, cap_m, la=f'Captura del juego (hoy): cuenta {GAME_N}', lb=f'Modelo de la prueba (hoy), misma postura: cuenta {q1["cannons"]}')
for _, title, a, b in shots: row(title, a, b)

# tabla del barrido de 400 posturas
d.text((40, y), 'Cañones que se leen en el modelo en cada rumbo, en 400 posturas del balanceo (el menor y el mayor; al modelo le pedimos 10, y 9 a 45°)', font=font(19), fill=TITLE); y += 34
cols = [('', 300), ('225°', 150), ('45°', 150), ('135°', 150), ('315°', 150), ('lona de las 2 velas grandes', 270), ('lona del foque', 210)]
x = 40
for h_, w_ in cols: d.text((x, y), h_, font=font(16), fill=SOFT); x += w_
y += 28
for k, lab in (('hoy', 'Hoy (la aprobada)'), ('nueva', f'Nueva (la propuesta)')):
    v = SW16[k]; prop = k == 'nueva'; f = font(16, 700 if prop else 500)
    if prop: d.rectangle((34, y - 4, 40 + sum(w for _, w in cols), y + 24), outline=TITLE, width=2)
    cells = [lab] + [f'{v[h]["canones6"]["min"]}–{v[h]["canones6"]["max"]}' for h in ('225', '45', '135', '315')] + [
        f'{dec(AREA[k]["sail_main"], 1)} + {dec(AREA[k]["sail_fore"], 1)} m²', f'{dec(AREA[k]["jib"], 1)} m²' + (f' ({pct(AREA["hoy"]["jib"], AREA[k]["jib"])} %)' if prop else '')]
    reds = [False] + [v[h]['canones6']['min'] < NEED[h] for h in ('225', '45', '135', '315')] + [False, False]
    x = 40
    for (h_, w_), c, rd in zip(cols, cells, reds): d.text((x, y), c, font=f, fill=RED if rd else INK); x += w_
    y += 30
y += 16

gn, gh = geo['nueva'], geo['hoy']; nf = sum(FIR.values())
BLOCKS = [
    ('Qué cambia', INK, [
        f'Las 2 velas grandes (las del palo mayor y el trinquete) giran {dec(OPEN_NEW - OPEN_HOY, 0)}° más alrededor de su palo, hacia estribor, como hoy: de {dec(OPEN_HOY, 0)}° a {dec(OPEN_NEW, 0)}° respecto a la línea del barco. Con ellas giran su botavara y su verga, y la escota sigue a la punta de abajo de cada vela. Salen más por fuera del costado: hasta {dec(gn["vuelo"])} m del centro del barco (hoy {dec(gh["vuelo"])} m; el casco mide {dec(gh["manga"])} m del centro a la borda).',
        f'El foque se iza más bajo: su punta pasa de {dec(JIB_HOY)} a {dec(JIB_NEW)} m de altura en el trinquete, y su borde delantero, de {dec(luff["hoy"])} a {dec(luff["nueva"])} m.',
        f'Con el barco escorado se leen los cañones del costado de enfrente: en la peor postura de hoy, a 225° pasa de {GUN[225]["hoy"]["n"]} a {GUN[225]["nueva"]["n"]} cañones y a 45°, de {GUN[45]["hoy"]["n"]} a {GUN[45]["nueva"]["n"]}.']),
    ('Lo que no cambia', INK, [
        'El casco, la popa, los palos, la forma y el tamaño de las 2 velas grandes, la batería y el mortero. La bandera es la misma: va en la punta alta de la vela mayor y gira con ella.',
        f'Las velas no tocan el barco: su punto más bajo queda a {dec(gn["holgura_min"], 2)} m por encima de lo que tiene debajo (hoy, a {dec(gh["holgura_min"], 2)} m).',
        f'La lona de las 2 velas grandes: {dec(AREA["hoy"]["sail_main"], 1)} y {dec(AREA["hoy"]["sail_fore"], 1)} m², como hoy. La textura es el mismo archivo y cada vela lleva la misma parte: los paños en 3 tonos, los remiendos y la calavera desvaída en la mayor no se deforman, solo giran.',
        f'Se sigue distinguiendo del pirata y del capitán en grises y a la escala del móvil: en el modelo de la prueba de siempre pasan {nf} de {len(FIR)} comparaciones en los 4 rumbos, también a 135° y 315° (con y sin sombra, de cerca y de lejos).']),
    ('Lo que cuesta', INK, [
        f'En el juego, nada: {mil(MED["lod0"][1])} triángulos de cerca y {mil(MED["lod1"][1])} de lejos, los mismos que hoy (solo se mueven puntos), la misma textura y el mismo número de piezas que dibujar.',
        f'El foque pierde un {jib_loss} % de lona (de {dec(AREA["hoy"]["jib"], 1)} a {dec(AREA["nueva"]["jib"], 1)} m²), y su dibujo se aplasta un {dec(100 * (1 - luff["nueva"] / luff["hoy"]), 0)} % a lo largo de su borde delantero.',
        'Hay que volver a exportar el barco en Blender, con un turno de máquina; su peso exacto se mide entonces.']),
    ('En contra', RED, [
        f'Todas las velas de este tipo de la flota se abren igual, {dec(OPEN_HOY, 0)}°; la Cañonera saldría con {dec(OPEN_NEW, 0)}°, así que su aparejo ya no se ve como el del resto.',
        f'A 135° y a 315° las 2 velas grandes se ven casi de canto: a la cámara del juego le enseñan un {dec(100 * FACING["nueva"][135], 0)} % de su superficie (hoy, un {dec(100 * FACING["hoy"][135], 0)} %; de frente sería un {dec(100 * math.cos(math.radians(55)), 0)} %), así que en esos rumbos la calavera no se ve. Hoy les pasa casi lo mismo a {EDGE["hoy"]}° y a {(EDGE["hoy"] + 180) % 360}° (un {dec(100 * FACING["hoy"][EDGE["hoy"]], 0)} %): toda vela de este tipo se ve de canto en algún rumbo, y el giro lo lleva a las diagonales.',
        f'Cumple justo: a 225° el modelo da exactamente 10 cañones en las 400 posturas, lo mínimo que le pedimos, y a 45° da {SW16["nueva"]["45"]["canones6"]["min"]} en {SW16["nueva"]["45"]["canones6"]["hist"][str(SW16["nueva"]["45"]["canones6"]["min"])]} de 400.',
        'La sombra suave horneada en la textura, la que dejan las velas sobre la cubierta, se hizo con las velas de hoy. Propongo rehornearla en el mismo turno de Blender, sin cambiar el tamaño ni el dibujo de la textura; sin rehacerla, queda una sombra suave donde ya no hay vela. No la he medido.']),
    ('Lo que te pido', INK, ['No es un pedido tuyo. Es una regla del juego: la Cañonera tiene que enseñar sus cañones, y hoy, desde 2 lados y con el barco escorado, se ven 6 o 7, y no los 8 que pide la regla. Para que se vean, giramos más sus velas y bajamos el foque. Así deja de llevar las velas como el resto de la flota. ¿Apruebas el cambio, o prefieres otra solución?',
                             'En el modelo cumple justo. La prueba en el juego, con el barco nuevo, lo confirmará o pedirá otra vuelta.']),
]
for title, colr, lines in BLOCKS:
    d.text((40, y), title, font=font(19), fill=TITLE if colr == INK else RED); y += 30
    for ln in lines:
        d.text((56, y), '·', font=font(16, 500), fill=colr); y = para(74, y, ln, font(16, 500), colr, SW - 120, 24) + 2
    y += 12
sheet = sheet.crop((0, 0, SW, y + 20)); sheet.save(OUTP, optimize=True)
json.dump(dict(lamina=os.path.basename(OUTP), cajas=CAJAS, atlas_nueva=dict(ktx2=KTX_NEW, png=PNG_NEW)), open(OUTP[:-4] + '-cajas.json', 'w'), indent=1)
print('hoja', OUTP, sheet.size, hashlib.sha256(open(OUTP, 'rb').read()).hexdigest())

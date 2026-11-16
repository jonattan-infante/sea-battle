# Uso (desde la raíz del repo), con la misma UX_OUT de las 10 combinaciones (clase_curvo.py y navio_curvo.py con la
# oclusión, sus KTX2 de entrega en cadena/comp y sus GLB de blender_curvo.py export):
#   UX_BLENDER=<blender 5.2.2> UX_GLTF=<gltf-transform 4.5.1> python3 -I scripts/ux/laminas/lamina_como_juego.py
#   →  $UX_OUT/D104-como-en-el-juego.png, $UX_OUT/cadena/como-juego-medidas.json y, en $UX_OUT/arreglo/cadena, los npz y
#      los GLB con la bandera de geometría (la propuesta)
# Lámina D104 para Jonattan: los 10 barcos de las familias (5 clases × 2) como los pinta el juego con su textura de entrega
# (la KTX2 ETC1S con sus mips reales, trilineal con anisótropo 16, SHIP_MAP_ANISOTROPY de ship-glb.ts:30; DPR 1 en
# 1440×900 y 1,5 en el móvil, art.ts:138-139; el LOD del juego, runtime.ts:1563, con LOD_PX = 72 px de eslora), junto a la
# lámina aprobada (render_tex.py: el nivel 0 sin mip, D91 y D95), y la propuesta de arreglo de la bandera: la bandera de
# geometría con color de vértice (la UV de todos sus vértices en el téxel blanco, así que la GPU la muestrea en el nivel
# 0, como el aparejo). Mide la bandera y la galería de popa (croma y ΔE76 frente a la lámina), los triángulos y los bytes.
# El muestreo de la GPU es el de scripts/ux/ad28/render_mip.py (gpu_mip.py). No corre en la CI.
import sys, os, json, math, shutil, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'mapa'), os.path.join(HERE, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import gpu_mip as G           # antes que nada: cambia RTX.render por el suyo
import render_tex as RTX
import lamina_capitan as LC
import lamina_clase as LCL
import clase_curvo as CC
import curvo as CV
import tienda as T
import numpy as np
from PIL import Image, ImageDraw

CAD = os.path.join(RT.OUT, 'cadena'); COMP = os.path.join(CAD, 'comp'); M = RTX.M
FIX = os.path.join(RT.OUT, 'arreglo', 'cadena'); TIL = os.path.join(RT.OUT, 'como-juego'); os.makedirs(TIL, exist_ok=True)
AT = CC.AT; SHIP = {s['id']: s for s in T.SHIPS}
PAPER, INK, SOFT, TITLE, RED = LCL.PAPER, LCL.INK, LCL.SOFT, LCL.TITLE, LCL.RED
CLS = ('sloop', 'schooner', 'brig', 'frigate', 'line'); FAM = ('gb', 'es')
NOM = {**LCL.NAME, 'line': 'Navío'}
LOD_PX = 72; DPR = {6.2: 1.0, 2.8: 1.5}
BLENDER = os.environ.get('UX_BLENDER', 'blender'); GLTF = os.environ.get('UX_GLTF', 'gltf-transform')
def font(px, w=600): return T.font(px, w)
def idf(c, f): return f'navio_{f}' if c == 'line' else f'{c}_{f}'
def ktx(c, f): return os.path.join(COMP, f'atlas_{f}.ktx2' if c == 'line' else f'atlas_{c}_{f}.ktx2')
def lod_de(c, ppm): return 0 if SHIP[c]['L'] * ppm >= LOD_PX else 1


def region(name):
    (u0, v0), (u1, v1) = AT.uv(name, 0, 0), AT.uv(name, 1, 1)
    return min(u0, u1), max(u0, u1), min(v0, v1), max(v0, v1)
RF, RG = region('flag'), region('gal'); WUV = AT.uv('white', 0.5, 0.5)
def en(UV, r, eps=1e-6):
    t = UV.reshape(-1, 3, 2); ok = ((t[..., 0] >= r[0] - eps) & (t[..., 0] <= r[1] + eps) & (t[..., 1] >= r[2] - eps) & (t[..., 1] <= r[3] + eps)).all(1)
    return np.repeat(ok, 3)


# ---- la propuesta: la bandera de geometría con color de vértice
def lin(rgb): return CV.hexlin('#%02X%02X%02X' % rgb)
UJ = dict(blue=(1, 33, 105), red=(200, 16, 46), white=(255, 255, 255)); RJ = dict(red=(170, 21, 27), yellow=(241, 191, 0))
# proporciones (en altos de la bandera): «fiel», las del atlas (clase_curvo.paint: líneas de 20 y 7 px en 96 de alto);
# «lectura», con las cruces más anchas para que se lean con 5–8 px de alto en pantalla
PROP = {'fiel': dict(sw=20 / 96, sr=7 / 96, cwv=0.16 * 160 / 96, cwh=0.26, crv=0.09 * 160 / 96, crh=0.16),
        'lectura': dict(sw=0.30, sr=0.12, cwv=0.36, cwh=0.36, crv=0.20, crh=0.20)}


def clip(poly):
    """Recorta un polígono convexo (s, t) al cuadrado [0, 1]² (Sutherland–Hodgman)."""
    for ax, lim, keep in ((0, 0, lambda a: a >= 0), (0, 1, lambda a: a <= 1), (1, 0, lambda a: a >= 0), (1, 1, lambda a: a <= 1)):
        out = []
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]; ka, kb = keep(a[ax] - lim if lim == 0 else a[ax]), keep(b[ax] - lim if lim == 0 else b[ax])
            if ka: out.append(a)
            if ka != kb:
                tt = (lim - a[ax]) / (b[ax] - a[ax]); out.append((a[0] + tt * (b[0] - a[0]), a[1] + tt * (b[1] - a[1])))
        poly = out
        if not poly: break
    return poly


def disenio(fam, w, h, prop):
    """Las piezas de la bandera, de abajo arriba: [(polígono (s, t), color lineal)]. s, de la driza a la punta; t, de arriba abajo."""
    rect = lambda s0, t0, s1, t1: [(s0, t0), (s1, t0), (s1, t1), (s0, t1)]
    if fam == 'es':
        return [[(rect(0, 0, 1, 0.25), lin(RJ['red'])), (rect(0, 0.25, 1, 0.75), lin(RJ['yellow'])), (rect(0, 0.75, 1, 1), lin(RJ['red']))]]
    P = PROP[prop]; L = math.hypot(w, h)
    def diag(a, b, hw):  # banda de (a) a (b) en (s, t), de semiancho hw en metros
        nx, ny = -(b[1] - a[1]) * h, (b[0] - a[0]) * w; n = math.hypot(nx, ny); ox, oy = nx / n * hw / w, ny / n * hw / h
        return clip([(a[0] - ox, a[1] - oy), (b[0] - ox, b[1] - oy), (b[0] + ox, b[1] + oy), (a[0] + ox, a[1] + oy)])
    cross = lambda hv, hh: [rect(0.5 - hv * h / w / 2, 0, 0.5 + hv * h / w / 2, 1), rect(0, 0.5 - hh / 2, 1, 0.5 + hh / 2)]
    capas = [[(rect(0, 0, 1, 1), lin(UJ['blue']))],
             [(diag((0, 0), (1, 1), P['sw'] * h / 2), lin(UJ['white'])), (diag((1, 0), (0, 1), P['sw'] * h / 2), lin(UJ['white']))],
             [(diag((0, 0), (1, 1), P['sr'] * h / 2), lin(UJ['red'])), (diag((1, 0), (0, 1), P['sr'] * h / 2), lin(UJ['red']))],
             [(q, lin(UJ['white'])) for q in cross(P['cwv'], P['cwh'])],
             [(q, lin(UJ['red'])) for q in cross(P['crv'], P['crh'])]]
    return capas


def con_bandera_geo(npz, fam, prop):
    """El npz con los triángulos de la bandera cambiados por la bandera de geometría (la misma cara, la misma posición y el
    mismo sentido), con la UV en el téxel blanco (r = 0, b = 0). Devuelve el npz nuevo y los triángulos de antes y después."""
    z = np.load(npz); P, Tt, C, R, B = z['p'], z['t'], z['c'], z['r'], z['b']; fl = en(Tt, RF)
    keep = ~fl; tri = np.nonzero(fl.reshape(-1, 3).all(1))[0]
    # cada cara de la bandera es un plano: se agrupan los triángulos por su normal y su distancia
    caras = {}
    for t in tri:
        p = P[3 * t:3 * t + 3]; n = np.cross(p[1] - p[0], p[2] - p[0]); n /= np.linalg.norm(n)
        key = (tuple(np.round(n, 3)), round(float(n @ p[0]), 3)); caras.setdefault(key, []).append(t)
    cent = {k: P[np.concatenate([np.arange(3 * t, 3 * t + 3) for t in v])].mean(0) for k, v in caras.items()}
    nP, nT, nC = [], [], []
    for k, ts in caras.items():
        idx = np.concatenate([np.arange(3 * t, 3 * t + 3) for t in ts]); uv = Tt[idx]
        s = (uv[:, 0] - AT.uv('flag', 0, 0)[0]) / (AT.uv('flag', 1, 0)[0] - AT.uv('flag', 0, 0)[0])
        tv = (uv[:, 1] - AT.uv('flag', 0, 0)[1]) / (AT.uv('flag', 0, 1)[1] - AT.uv('flag', 0, 0)[1])
        A_ = np.stack([np.ones_like(s), s, tv], 1); coef, *_ = np.linalg.lstsq(A_, P[idx], rcond=None); O, E1, E2 = coef
        w, h = float(np.linalg.norm(E1)), float(np.linalg.norm(E2)); n = np.array(k[0])
        otra = [c for kk, c in cent.items() if kk != k]; out = (cent[k] - otra[0]) if otra else n
        out = out / (np.linalg.norm(out) + 1e-12); orient = np.sign(np.cross(E1, E2) @ n)
        for li, capa in enumerate(disenio(fam, w, h, prop)):
            for poly, col in capa:
                pts = [O + a * E1 + b * E2 + out * (0.003 * li) for a, b in poly]
                for j in range(1, len(pts) - 1):
                    tr = [pts[0], pts[j], pts[j + 1]]
                    if np.sign(np.cross(tr[1] - tr[0], tr[2] - tr[0]) @ n) != orient and orient != 0: tr = [tr[0], tr[2], tr[1]]
                    nP += tr; nT += [WUV] * 3; nC += [col] * 3
    n_new = len(nP) // 3
    P2 = np.concatenate([P[keep], np.array(nP)]); T2 = np.concatenate([Tt[keep], np.array(nT)]); C2 = np.concatenate([C[keep], np.array(nC)])
    R2 = np.concatenate([R[keep], np.zeros(len(nP))]); B2 = np.concatenate([B[keep], np.zeros(len(nP))])
    return dict(p=P2, t=T2, c=C2, r=R2, b=B2), len(tri), n_new, np.concatenate([np.zeros(keep.sum(), bool), np.ones(len(nP), bool)])


# ---- render y medidas
def mascara(mod, sel, th, hd, ppm, fr, SS, dpr):
    """Los px de las caras con `sel` (cobertura 0–1): render del modelo con albedo blanco solo en sel, menos el negro."""
    def un(c):
        m = dict(mod, A=np.ones((4, 4, 3)), C=c, S=None, shadow=False); return np.asarray(G.shot_mode(m, th, hd, ppm, fr, SS, 'lamina', dpr), float)
    a, b = un(sel[:, None] * np.ones((1, 3))), un(np.zeros((len(sel), 3)))
    return np.clip((a - b).max(-1) / 160.0, 0, 1)


def medir(img, mask, ref=None, ref_mask=None):
    """Croma C*ab medio y color medio en los px de la máscara (≥ 0,6); con ref, ΔE76 por px (en la intersección) y del color medio."""
    a = np.asarray(img, float) / 255; m = mask >= 0.6
    if m.sum() < 3: return None
    L = M.lab(a * 255); out = dict(px=int(m.sum()), C=round(float(np.hypot(L[..., 1], L[..., 2])[m].mean()), 1), mean=[round(float(x), 1) for x in L[m].mean(0)])
    if ref is not None:
        b = np.asarray(ref, float) / 255; Lb = M.lab(b * 255); mm = m & (ref_mask >= 0.6) if ref_mask is not None else m
        if mm.sum() >= 3: out['dE_px'] = round(float(np.linalg.norm(L - Lb, axis=-1)[mm].mean()), 1)
        mb = ref_mask >= 0.6 if ref_mask is not None else m
        out['dE_medio'] = round(float(np.linalg.norm(L[m].mean(0) - Lb[mb].mean(0))), 1)
    return out


def lupa(imgs, mask, k=4, pad=5):
    ys, xs = np.nonzero(mask >= 0.3)
    if len(ys) == 0: return None
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad + 1, imgs[0].width), min(ys.max() + pad + 1, imgs[0].height))
    return [im.crop(box).resize(((box[2] - box[0]) * k, (box[3] - box[1]) * k), Image.NEAREST) for im in imgs]


def glb_bytes(path_npz_dir, i):
    """Exporta con Blender (blender_curvo.py export, UX_OUT = la carpeta del arreglo), pasa meshopt y mide el GLB sin imágenes."""
    env = dict(os.environ, UX_OUT=os.path.dirname(path_npz_dir)); repo = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
    subprocess.run([BLENDER, '-b', '--factory-startup', '-t', '1', '--python', os.path.join(repo, 'scripts', 'ux', 'barcos', 'blender_curvo.py'), '--', i, 'export'], check=True, capture_output=True, env=env, cwd=repo)
    os.makedirs(os.path.join(path_npz_dir, 'comp'), exist_ok=True); mo = os.path.join(path_npz_dir, 'comp', f'{i}_meshopt.glb')
    subprocess.run([GLTF, 'meshopt', os.path.join(path_npz_dir, f'{i}.glb'), mo], check=True, capture_output=True)
    return len(LC.glb_geo(mo))


def componer(MED):
    """La lámina, con las vistas guardadas en TIL y las medidas."""
    ELIGE = {'gb': 'fiel', 'es': 'fiel'}; GAP = 18
    def tile(i, ppm, nm): return Image.open(os.path.join(TIL, f'{i}-{ppm}-{nm}.png')).convert('RGB')
    def mk(i, ppm, nm): return np.load(os.path.join(TIL, f'{i}-{ppm}-{nm}.npy'))
    filas = []
    for c in CLS:
        for f in FAM:
            i = idf(c, f); pr = ELIGE[f]
            d = [tile(i, 6.2, n) for n in ('lamina', 'juego', pr)]; m = [tile(i, 2.8, n) for n in ('lamina', 'juego', pr)]
            zona = np.maximum(mk(i, 6.2, 'fl_l'), mk(i, 6.2, 'ga_l')); lp = lupa(d, zona, k=4, pad=6) or []
            filas.append((c, f, i, d, lp, m))
    cw = [max(r[3][j].width for r in filas) for j in range(3)]; lw = [max((r[4][j].width if r[4] else 0) for r in filas) for j in range(3)]
    mw = [max(r[5][j].width for r in filas) for j in range(3)]
    X = [40]; [X.append(X[-1] + w + GAP) for w in cw]; X[-1] += 24; [X.append(X[-1] + w + GAP) for w in lw]; X[-1] += 24; [X.append(X[-1] + w + GAP) for w in mw]
    SW = max(X[-1] + 40, 1800); sheet = Image.new('RGB', (SW, 20000), PAPER); d_ = ImageDraw.Draw(sheet)
    def para(x, y, txt, f, fill, width, lh):
        line = ''
        for w in txt.split(' '):
            t = (line + ' ' + w).strip()
            if d_.textlength(t, font=f) > width and line: d_.text((x, y), line, font=f, fill=fill); y += lh; line = w
            else: line = t
        if line: d_.text((x, y), line, font=f, fill=fill); y += lh
        return y
    d_.text((40, 22), 'Los 10 barcos como los pinta el juego', font=font(32), fill=INK)
    y = para(40, 66, 'Las láminas aprobadas (D91 y D95) pintan la textura entera, sin reducir. El juego la pinta con la textura de entrega: la KTX2 comprimida y, de lejos, sus versiones reducidas (mips), con anisótropo 16; en 1440×900 con 1 px de pantalla por px de imagen, y en el móvil con 1,5 y el modelo de lejos en la Balandra, la Goleta y el Bergantín. Así se ve cada barco en las 2 versiones, con la bandera y la popa ampliadas 4 veces, y con la propuesta: la bandera hecha de piezas de color en lugar de textura.', font(17, 500), INK, SW - 80, 26) + 16
    heads = [('Como en el juego, 1440×900 (6,2 px por metro)', X[0]), ('La popa y la bandera, ampliadas ×4', X[3]), ('En el móvil, 390×844 (2,8 px por metro)', X[6])]
    for t, x in heads: d_.text((x, y), t, font=font(19), fill=TITLE)
    y += 30
    for j, lab in enumerate(('Lámina', 'Juego hoy', 'Propuesta') * 3): d_.text((X[j], y), lab, font=font(15), fill=SOFT if j % 3 < 2 else INK)
    y += 26
    for c, f, i, d, lp, m in filas:
        hh = max([im.height for im in d] + [im.height for im in lp] + [im.height for im in m])
        d_.text((X[0], y), f"{NOM[c]} {'británic' + ('o' if c in LCL.MASC or c == 'line' else 'a') if f == 'gb' else 'español' + ('' if c in LCL.MASC or c == 'line' else 'a')}", font=font(16), fill=INK); y += 24
        for j, im in enumerate(d): sheet.paste(im, (X[j], y))
        for j, im in enumerate(lp): sheet.paste(im, (X[3 + j], y))
        for j, im in enumerate(m): sheet.paste(im, (X[6 + j], y))
        y += hh + 16
    return sheet, y, d_, para, SW


def bloques(MED, d_, para, SW, y):
    """El texto de la lámina, con las cifras de como-juego-medidas.json."""
    dec, mil = LCL.dec, LCL.mil
    ids = [idf(c, f) for c in CLS for f in FAM]; gb = [i for i in ids if i.endswith('_gb')]; es = [i for i in ids if i.endswith('_es')]
    def rng(sel, ppm, key, sub, campo):
        v = [MED[i][ppm][key][sub][campo] for i in sel if MED[i][ppm][key][sub] and campo in MED[i][ppm][key][sub]]
        return (dec(min(v), 1) if min(v) == max(v) else f'{dec(min(v), 1)}–{dec(max(v), 1)}') if v else '—'
    def rfix(sel, ppm, pr, campo):
        v = [MED[i][ppm][f'arreglo_{pr}']['bandera'][campo] for i in sel if f'arreglo_{pr}' in MED[i][ppm] and MED[i][ppm][f'arreglo_{pr}']['bandera']]
        return (dec(min(v), 1) if min(v) == max(v) else f'{dec(min(v), 1)}–{dec(max(v), 1)}') if v else '—'
    gal = [i for i in ids if MED[i]['6.2']['galeria']['lamina']]
    B = {i: MED[i]['bytes'] for i in ids}
    clases8 = [i for i in ids if not i.startswith('navio')]
    s8_antes = sum(B[i]['geo_receta'] for i in clases8); s8_despues = sum(B[i]['geo_arreglo'] for i in clases8)
    TOTAL_ANTES = 636463  # las 8 combinaciones de clase con la receta, medidas en este turno (lamina_clase.py: 110 853 + 139 233 + 115 132 + 271 245)
    total_despues = TOTAL_ANTES + (s8_despues - s8_antes)
    dgb = [B[i]['delta'] for i in gb]; des = [B[i]['delta'] for i in es]
    def bytes_txt(n): return f'{mil(-n)} bytes menos' if n < 0 else f'{mil(n)} más'
    PXB = [MED[i]['6.2']['bandera']['lamina']['px'] for i in ids]
    RAT = [round((160 * 96 if (i.startswith('navio') or i.startswith('frigate')) else 80 * 48) / MED[i]['6.2']['bandera']['lamina']['px']) for i in ids]
    BL = [
        ('Qué pasa hoy', INK, [
            f"La bandera británica pierde el color en el juego. En 1440×900, su croma medio baja de {rng(gb, '6.2', 'bandera', 'lamina', 'C')} en la lámina a {rng(gb, '6.2', 'bandera', 'juego', 'C')}, y cada px se aparta de la lámina {rng(gb, '6.2', 'bandera', 'juego', 'dE_px')} de media en diferencia de color (delta E CIE76); en el móvil, de {rng(gb, '2.8', 'bandera', 'lamina', 'C')} a {rng(gb, '2.8', 'bandera', 'juego', 'C')}. Es el rectángulo gris y beis de la nota del 24 de octubre.",
            f"La española aguanta mejor, porque sus 3 franjas son anchas: de {rng(es, '6.2', 'bandera', 'lamina', 'C')} a {rng(es, '6.2', 'bandera', 'juego', 'C')} de croma en 1440×900 (delta E por px, {rng(es, '6.2', 'bandera', 'juego', 'dE_px')}).",
            f"La galería de popa ({', '.join(NOM[c] for c in CLS if idf(c, 'gb') in gal)}): croma de {rng(gal, '6.2', 'galeria', 'lamina', 'C')} en la lámina y {rng(gal, '6.2', 'galeria', 'juego', 'C')} en el juego, con un delta E por px de {rng(gal, '6.2', 'galeria', 'juego', 'dE_px')}." if gal else 'Ninguna de las vistas enseña la galería de popa lo bastante para medirla.',
            f"Por qué: la bandera ocupa de {min(PXB)} a {max(PXB)} px en 1440×900, así que el juego la pinta con una versión reducida de la textura (los mips de la KTX2), donde cabe en pocos bloques de la compresión ETC1S. Cada bloque (4 × 4 téxeles) guarda 2 colores, y la Union Jack tiene 3, que además se mezclan con lo que la rodea en el atlas."]),
        ('La propuesta: la bandera de piezas de color', INK, [
            'La bandera deja de ser textura y pasa a ser geometría con color de vértice: la británica, con sus 5 capas (el paño azul, las aspas blancas y rojas y la cruz blanca y roja) y las mismas proporciones que la lámina aprobada; la española, con sus 3 franjas. Todos sus vértices apuntan al téxel blanco del atlas, como el aparejo, así que el juego la pinta con su color exacto a cualquier distancia.',
            f"Medido igual que arriba: la británica vuelve a {rfix(gb, '6.2', 'fiel', 'C')} de croma en 1440×900 (delta E por px frente a la lámina, {rfix(gb, '6.2', 'fiel', 'dE_px')}) y a {rfix(gb, '2.8', 'fiel', 'C')} en el móvil ({rfix(gb, '2.8', 'fiel', 'dE_px')}); la española, a {rfix(es, '6.2', 'fiel', 'C')} ({rfix(es, '6.2', 'fiel', 'dE_px')}) y {rfix(es, '2.8', 'fiel', 'C')} ({rfix(es, '2.8', 'fiel', 'dE_px')}).",
            f"Lo que cuesta, en cada LOD: la británica pasa de 4 a {MED[gb[0]]['6.2']['arreglo_fiel']['tris_bandera'][1]} triángulos y la española de 4 a {MED[es[0]]['6.2']['arreglo_fiel']['tris_bandera'][1]} (de las 4 clases, la que más lleva, la Fragata española, se queda en {mil(B['frigate_es']['tris_arreglo'][0])} / {mil(B['frigate_es']['tris_arreglo'][1])}, con un tope de 5 000 / 1 200; el Navío español, en {mil(B['navio_es']['tris_arreglo'][0])} / {mil(B['navio_es']['tris_arreglo'][1])}, dentro de sus 5 500 de D91). La geometría pesa de {mil(min(dgb))} a {mil(max(dgb))} bytes más en la británica y, en la española, de {bytes_txt(min(des))} a {bytes_txt(max(des))}, con meshopt; la textura no cambia.",
            f"Las 8 combinaciones de clase pasan de {mil(TOTAL_ANTES)} a {mil(total_despues)} bytes, frente al tope de {mil(630930)}: ya se pasaban en {mil(TOTAL_ANTES - 630930)} y se pasarían en {mil(total_despues - 630930)}. Es la misma decisión pendiente de la cota (la salida (b) de producto, con la medida del piloto)."]),
        ('Descartado', INK, [
            f"Más téxeles para la bandera en el atlas: el juego elige la versión reducida de la textura por el tamaño en pantalla, no por los téxeles. La bandera ya tiene de {min(RAT)} a {max(RAT)} veces más téxeles que px en pantalla (80 × 48 a 512², 160 × 96 a 1024²), y se reduciría igual.",
            f"La Union Jack con las cruces más anchas, «de lectura»: medida, sale más saturada ({rfix(gb, '6.2', 'lectura', 'C')} de croma), pero se aparta más de la bandera aprobada ({rfix(gb, '6.2', 'lectura', 'dE_px')} de delta E por px frente a {rfix(gb, '6.2', 'fiel', 'dE_px')} de la fiel). La fiel es la que aprobaste.",
            'Colores más contrastados en la textura (sin medir, por la causa de arriba): no quitan la mezcla con los vecinos del atlas ni el límite de 2 colores por bloque de la ETC1S, y la Union Jack necesita 3.']),
        ('En contra', RED, [
            'Suma bytes a una descarga que ya se pasa del tope: lo decide producto con la cota.',
            'La galería de popa sigue con la textura: aquí solo se mide; su arreglo, si hace falta, va aparte.']),
    ]
    for title, colr, lines in BL:
        d_.text((40, y), title, font=font(19), fill=TITLE if colr == INK else RED); y += 30
        for ln in lines:
            d_.text((56, y), '·', font=font(16, 500), fill=colr); y = para(74, y, ln, font(16, 500), colr, SW - 120, 24) + 2
        y += 12
    return y


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'componer':
        MED = json.load(open(os.path.join(CAD, 'como-juego-medidas.json')))
        sheet, y, d_, para, SW = componer(MED)
        y = bloques(MED, d_, para, SW, y)
        sheet = sheet.crop((0, 0, SW, y + 20)); out = os.path.join(RT.OUT, 'D104-como-en-el-juego.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)
        sys.exit(0)
    # la carpeta del arreglo: enlaces a todo lo de cadena/ (atlas, rigs, sockets), y los npz con la bandera de geometría
    os.makedirs(FIX, exist_ok=True)
    for fn in os.listdir(CAD):
        src, dst = os.path.join(CAD, fn), os.path.join(FIX, fn)
        if os.path.isfile(src) and not os.path.lexists(dst): os.symlink(src, dst)
    PROPS = ('fiel', 'lectura'); MED = {}; FILAS = []
    for c in CLS:
        for f in FAM:
            i = idf(c, f); rec = {}; tiles = {}
            for ppm, th, hd, SS in ((6.2, 55, 135, 3), (2.8, 55, 135, 4)):
                dpr = DPR[ppm]; lod = lod_de(c, ppm)
                ml, *_ = G.receta(os.path.join(CAD, f'{i}_lod0.npz'), ktx(c, f))                       # la lámina: LOD0, nivel 0
                mj, *_ = G.receta(os.path.join(CAD, f'{i}_lod{lod}.npz'), ktx(c, f))                    # el juego
                fr = LC.fit((ml, mj), th, hd, ppm)
                im_l = G.shot_mode(ml, th, hd, ppm, fr, SS, 'lamina'); im_j = G.shot_mode(mj, th, hd, ppm, fr, SS, 'aniso', dpr)
                fl_l, fl_j = en(ml['UV'], RF), en(mj['UV'], RF); ga_l, ga_j = en(ml['UV'], RG), en(mj['UV'], RG)
                mk = {k: mascara(m, s, th, hd, ppm, fr, SS, dp) for k, (m, s, dp) in dict(fl_l=(ml, fl_l, 1.0), fl_j=(mj, fl_j, dpr), ga_l=(ml, ga_l, 1.0), ga_j=(mj, ga_j, dpr)).items()}
                r = dict(lod=lod, dpr=dpr, bandera=dict(lamina=medir(im_l, mk['fl_l']), juego=medir(im_j, mk['fl_j'], im_l, mk['fl_l'])),
                         galeria=dict(lamina=medir(im_l, mk['ga_l']), juego=medir(im_j, mk['ga_j'], im_l, mk['ga_l'])))
                ims = {'lamina': im_l, 'juego': im_j}
                for pr in PROPS:
                    if f == 'es' and pr == 'lectura': continue  # la rojigualda no tiene líneas finas: una sola variante
                    d_, n0, n1, isf = con_bandera_geo(os.path.join(CAD, f'{i}_lod{lod}.npz'), f, pr)
                    pth = os.path.join(FIX, f'{i}_{pr}_lod{lod}.npz'); np.savez(pth, **d_)
                    mf, *_ = G.receta(pth, ktx(c, f))
                    # la máscara del arreglo: los triángulos nuevos (al final, tras el recorte por el agua, que no los toca)
                    sel = np.zeros(len(mf['P']), bool); sel[-3 * n1:] = True
                    mfk = mascara(mf, sel, th, hd, ppm, fr, SS, dpr); im_f = G.shot_mode(mf, th, hd, ppm, fr, SS, 'aniso', dpr)
                    r[f'arreglo_{pr}'] = dict(tris_bandera=[n0, n1], bandera=medir(im_f, mfk, im_l, mk['fl_l']))
                    ims[pr] = im_f; mk[f'fl_{pr}'] = mfk
                rec[str(ppm)] = r; tiles[ppm] = (ims, mk)
                for nm, im in ims.items(): im.save(os.path.join(TIL, f'{i}-{ppm}-{nm}.png'))
                for nm, a in mk.items(): np.save(os.path.join(TIL, f'{i}-{ppm}-{nm}.npy'), a)
            MED[i] = rec; FILAS.append((c, f, tiles)); print(i, json.dumps(rec, ensure_ascii=False), flush=True)
    # ---- bytes y triángulos: el GLB con la bandera de geometría (variante elegida) frente al de la receta
    ELIGE = {'gb': 'fiel', 'es': 'fiel'}
    for c in CLS:
        for f in FAM:
            i = idf(c, f); pr = ELIGE[f]; base_geo = len(LC.glb_geo(os.path.join(COMP, f'{i}_meshopt.glb')))
            for lod in (0, 1):
                d_, n0, n1, _ = con_bandera_geo(os.path.join(CAD, f'{i}_lod{lod}.npz'), f, pr)
                dst = os.path.join(FIX, f'{i}_lod{lod}.npz')
                if os.path.lexists(dst): os.remove(dst)
                np.savez(dst, **d_)
            for ext in ('.glb',):
                dst = os.path.join(FIX, i + ext)
                if os.path.lexists(dst): os.remove(dst)
            geo = glb_bytes(FIX, i)
            t0 = [len(np.load(os.path.join(CAD, f'{i}_lod{l}.npz'))['p']) // 3 for l in (0, 1)]; t1 = [len(np.load(os.path.join(FIX, f'{i}_lod{l}.npz'))['p']) // 3 for l in (0, 1)]
            MED[i]['bytes'] = dict(geo_receta=base_geo, geo_arreglo=geo, delta=geo - base_geo, tris_receta=t0, tris_arreglo=t1, variante=pr)
            print(i, MED[i]['bytes'], flush=True)
    json.dump(MED, open(os.path.join(CAD, 'como-juego-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    print('FIN medidas')

# ux · AD-28 con el balanceo (producto, BACKLOG r11 6a603c6 :421): en el modelo, el conteo de cañones de la Cañonera GLB
# como lo hace `hostile-signatures.spec.ts` (a-v6, md5 73252f46…, `deckGuns`), con la pose de cada captura.
#   Pose: vértice = Ry(rumbo)·Rx(cabeceo)·Rz(alabeo)·v + (0, y, 0) (runtime.ts:1484-1501, orden 'YXZ' en :1441).
#   Pase A (la captura, sin el mortero): L* ≤ 25 por píxel (sRGB de 8 bits, MSAA promediado en sRGB como render_tex).
#   Pase B (región): cubierta (región `deck`) con cobertura ≥ 50 %, con cañones, cureñas y mortero ocultos.
#   Pase de piezas: cañón con cobertura ≥ 50 % (rojo ≥ 128) y cureña (verde ≥ 128), de la geometría del pase A.
#   Manchas = componentes de 8 vecinos de (L* ≤ 25) ∧ región; cuenta si tiene algún px rojo y Feret ≥ 4 px.
# 1440×900 con N3 a 1,0× (5,036 px/m, DPR 1), cámara ortográfica a 55°, sin luz de forma ni anisótropo (el árbol del a-v6).
# Además de lo que cuenta el juego, dice qué cañón es cada mancha y, de cada cañón que no cuenta, qué tapa su huella.
# Uso: UX_OUT=<carpeta con cadena/canonera2_lod0.npz y cadena/comp/atlas_canonera2.ktx2> \
#      python3 -I balanceo.py <scripts/ux del árbol> <orden> [args]   (órdenes abajo, en __main__)
# Ligero: un núcleo, sin GPU.
import sys, os, json, math, time
sys.dont_write_bytecode = True
UXS = sys.argv[1]
for p in ('barcos', 'laminas', 'mapa'): sys.path.insert(0, os.path.join(UXS, p))
import numpy as np
import ad28_canonera2 as A
C2, CV, RTX, M = A.C2, A.CV, A.RTX, A.M

PPM, TH = 5.036, 55.0
SS = 4
W, H = 240, 210
TAGS = ['otro', 'casco', 'cubierta', 'alcazar', 'castillo', 'mamparo', 'canon', 'cureña', 'mortero', 'detalle', 'aparejo', 'vela', 'foque', 'bandera']
TI = {t: i for i, t in enumerate(TAGS)}
BANDA = {1: 'babor', -1: 'estribor'}


JIB = dict(head=None)  # variante foquecab:<y>: el puño de driza del foque en el trinquete (de serie FORE_TOP − 0,3 = 12,1 m)
BAT = dict(dy=0.0, r=1.0)  # variante de la batería (cana:<dy>,<factor>): la caña sube dy m sobre la cureña y su radio ×factor


def battery_tagged(m, H_, spans):
    """battery() de canonera2_curvo.py:148-163, anotando cada pieza; el cañón k = 2·(índice de z) + (babor)."""
    for zi, z in enumerate(C2.CANNON_Z):
        yd = H_.y0(z) + H_.deck_h(z)
        for side in (1, -1):
            xc = side * (H_.x_at(z, yd) - 1.0); k = 2 * zi + (side > 0)
            s0 = m.ntri(); CV.cuboid(m, xc - side * 0.25, yd + 0.25, z, 1.0, 0.5, 1.4, C2.PAL['rail'], rim=0.0); spans.append((s0, m.ntri(), 'cureña', k))
            s0 = m.ntri(); C2.taper(m, (xc - side * 1.2, yd + 0.45 + BAT['dy'], z), (xc + side * 1.2, yd + 0.45 + BAT['dy'], z), 0.40 * BAT['r'], 0.34 * BAT['r'], 6, C2.PAL['cannon'], cap=True); spans.append((s0, m.ntri(), 'canon', k))
    s0 = m.ntri(); yd = H_.y0(C2.MORTAR_Z); C2.taper(m, (0, yd, C2.MORTAR_Z), (0, yd + 1.2, C2.MORTAR_Z), 1.3, 1.1, 8, C2.PAL['cannon'])
    w = m.at.white; cy = yd + 1.2; ring = [(1.1 * math.cos(2 * math.pi * i / 8), cy, C2.MORTAR_Z + 1.1 * math.sin(2 * math.pi * i / 8)) for i in range(8)]
    for i in range(1, 7): m.tri(ring[0], ring[i], ring[i + 1], w, w, w, '#0E0E10')
    spans.append((s0, m.ntri(), 'mortero', -1))


def build_tagged(sails=None, jib_clew=None):
    """build(0) de canonera2_curvo.py:188-205 con cada pieza anotada. sails: {'main'|'fore': (z_m, A, B, C, D)} cambia
    SAILS; jib_clew: (x, y, z) del puño de escota del foque (canonera2_curvo.py:122). Devuelve arrays y etiquetas."""
    saved = dict(C2.SAILS); src = None
    if sails: C2.SAILS.update(sails)
    if jib_clew is not None or JIB['head'] is not None:  # rigging() lleva el foque escrito en su código: se cambia en una copia
        import inspect, textwrap
        src = inspect.getsource(C2.rigging); new = src
        if jib_clew is not None:
            new = new.replace('clew = np.array([-1.6, 3.4, 10.2])', 'clew = np.array(%r)' % (list(jib_clew),)); assert new != src, 'puño del foque'
        if JIB['head'] is not None:
            n2 = new.replace('head = np.array([0.0, FORE_TOP - 0.3, FORE_Z])', 'head = np.array([0.0, %r, FORE_Z])' % JIB['head']); assert n2 != new, 'puño de driza del foque'; new = n2
        ns = dict(C2.__dict__); exec(textwrap.dedent(new), ns); rig = ns['rigging']
    else: rig = C2.rigging
    try:
        Hh = C2.hull_of(); m = CV.Mesh(C2.AT); t, f = C2.Q0, C2.FC; spans = []
        def mark(tag, fn, *a, **k):
            s0 = m.ntri(); r = fn(*a, **k); spans.append((s0, m.ntri(), tag, -1)); return r
        zs = Hh.stations(21)
        secs = mark('casco', CV.build_hull, m, Hh, zs, 2, 2, C2.V_TOP, C2.V_BOT, C2.PAL['rail'])
        mark('casco', CV.build_stern, m, Hh, secs[0], 4)
        mark('casco', CV.build_stern, m, Hh, secs[-1], 4, region='bow', aft=False)
        mark('cubierta', CV.build_deck, m, Hh, zs, 'deck', t['edge'], f['edge'], 0.0, 10.4)
        mark('alcazar', CV.build_deck, m, Hh, zs, 'q0', C2.Q1['edge'], C2.Q0['edge'], C2.Q0['h'], 10.4)
        mark('alcazar', CV.build_deck, m, Hh, zs, 'q1', -C2.L / 2, C2.Q1['edge'], C2.Q1['h'], 10.4)
        mark('castillo', CV.build_deck, m, Hh, zs, 'fc', f['edge'], C2.L / 2, f['h'], 10.4)
        mark('mamparo', CV.build_wall, m, Hh, 'bw0', C2.Q0['edge'], 0.0, C2.Q0['h'], +1, ncol=4)
        mark('mamparo', CV.build_wall, m, Hh, 'bw2', C2.Q1['edge'], C2.Q0['h'], C2.Q1['h'], +1, ncol=4)
        mark('mamparo', CV.build_wall, m, Hh, 'bw1', f['edge'], 0.0, f['h'], -1, ncol=4)
        battery_tagged(m, Hh, spans)
        mark('detalle', C2.details, m, Hh)
        mark('aparejo', rig, m, Hh, 0)
    finally:
        C2.SAILS.clear(); C2.SAILS.update(saved)
    a = m.arrays(); T = len(a['p']) // 3
    tag = np.zeros(T, int); gun = np.full(T, -1)
    for s0, s1, name, k in spans: tag[s0:s1] = TI[name]; gun[s0:s1] = k
    # en el aparejo, las lonas por la región del atlas de su UV (px = u·A, (1 − v)·A; curvo.py:46-56)
    uvc = a['t'].reshape(T, 3, 2).mean(1) * np.array([C2.AT.A, -C2.AT.A]) + np.array([0, C2.AT.A])
    for reg, name in (('sail_main', 'vela'), ('sail_fore', 'vela'), ('jib', 'foque'), ('flag', 'bandera')):
        x0, y0, w, h = C2.AT.R[reg]
        ins = (uvc[:, 0] >= x0) & (uvc[:, 0] <= x0 + w) & (uvc[:, 1] >= y0) & (uvc[:, 1] <= y0 + h) & (tag == TI['aparejo'])
        tag[ins] = TI[name]
    return a, tag, gun


def pose_arrays(a, tag, gun, hd, roll, pitch, y):
    """Vértices y normales con la pose (sin el rumbo, que aplica el rasterizador), recortados por la flotación."""
    P = a['p']; N = CV.vertex_normals(P)
    cr, sr, cp, sp = math.cos(roll), math.sin(roll), math.cos(pitch), math.sin(pitch)
    Rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]]); Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]]); R = Rx @ Rz
    Pp = P @ R.T + np.array([0, y, 0]); Np = N @ R.T
    ext = np.concatenate([a['c'], np.repeat(tag, 3)[:, None].astype(float), np.repeat(gun, 3)[:, None].astype(float)], axis=1)
    Pc, UVc, Ec, Nc = RTX.clip_below_water(Pp, a['t'], ext, Np)
    T = len(Pc) // 3
    return Pc, UVc, Ec[:, :3], Nc, np.rint(Ec[::3, 3]).astype(int), np.rint(Ec[::3, 4]).astype(int)


def raster(P, tags, hd, ox, oy, keepA, keepB, keepC):
    """Un solo recorrido por triángulo con 3 z-buffers de ids: A (keepA), B (keepB) y C (keepC). Para A guarda también las
    baricéntricas y el signo del área (la cara trasera invierte la normal, como render_tex)."""
    TH_ = math.radians(TH); ps = math.radians(hd); c, s = math.cos(ps), math.sin(ps)
    Pw = P @ np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]).T
    sx = (Pw[:, 0] * PPM + ox) * SS; sy = (-(Pw[:, 1] * math.cos(TH_) - Pw[:, 2] * math.sin(TH_)) * PPM + oy) * SS
    dep = -(Pw[:, 1] * math.sin(TH_) + Pw[:, 2] * math.cos(TH_)); WS, HS = W * SS, H * SS
    zA = np.full((HS, WS), np.inf); iA = np.full((HS, WS), -1); w0A = np.zeros((HS, WS)); w1A = np.zeros((HS, WS))
    zB = np.full((HS, WS), np.inf); iB = np.full((HS, WS), -1); zC = np.full((HS, WS), np.inf); iC = np.full((HS, WS), -1)
    sgn = np.zeros(len(P) // 3)
    for t in range(len(P) // 3):
        kA, kB, kC = keepA[t], keepB[t], keepC[t]
        if not (kA or kB or kC): continue
        i = 3 * t; x0, x1, x2 = sx[i:i + 3]; y0, y1, y2 = sy[i:i + 3]; area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9: continue
        sgn[t] = area
        bx0, bx1 = max(int(math.floor(min(x0, x1, x2))), 0), min(int(math.ceil(max(x0, x1, x2))), WS - 1)
        by0, by1 = max(int(math.floor(min(y0, y1, y2))), 0), min(int(math.ceil(max(y0, y1, y2))), HS - 1)
        if bx1 < bx0 or by1 < by0: continue
        X, Y = np.meshgrid(np.arange(bx0, bx1 + 1) + 0.5, np.arange(by0, by1 + 1) + 0.5)
        w0 = ((x1 - X) * (y2 - Y) - (x2 - X) * (y1 - Y)) / area; w1 = ((x2 - X) * (y0 - Y) - (x0 - X) * (y2 - Y)) / area; w2 = 1 - w0 - w1
        ins = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not ins.any(): continue
        d = w0 * dep[i] + w1 * dep[i + 1] + w2 * dep[i + 2]; sl = (slice(by0, by1 + 1), slice(bx0, bx1 + 1))
        if kA:
            u = ins & (d < zA[sl]); zA[sl][u] = d[u]; iA[sl][u] = t; w0A[sl][u] = w0[u]; w1A[sl][u] = w1[u]
        if kB:
            u = ins & (d < zB[sl]); zB[sl][u] = d[u]; iB[sl][u] = t
        if kC:
            u = ins & (d < zC[sl]); zC[sl][u] = d[u]; iC[sl][u] = t
    return dict(iA=iA, w0=w0A, w1=w1A, iB=iB, iC=iC, sgn=sgn, Ry=np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]))


def shade(P, UV, C, N, atlas, r):
    """La luz de render_tex.render (hemisférica + sol + GGX, sin luz de forma) por muestra del pase A; sRGB promediado."""
    iA, w0, w1 = r['iA'], r['w0'], r['w1']; cov = iA >= 0; t = iA[cov]; a0, a1 = w0[cov], w1[cov]; a2 = 1 - a0 - a1
    i0, i1, i2 = 3 * t, 3 * t + 1, 3 * t + 2
    Nw = N @ r['Ry'].T
    n = a0[:, None] * Nw[i0] + a1[:, None] * Nw[i1] + a2[:, None] * Nw[i2]; n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-12
    n[r['sgn'][t] > 0] *= -1
    u = a0 * UV[i0, 0] + a1 * UV[i1, 0] + a2 * UV[i2, 0]; v = a0 * UV[i0, 1] + a1 * UV[i1, 1] + a2 * UV[i2, 1]
    ah, aw = atlas.shape[:2]
    fx = np.clip(u * aw - 0.5, 0, aw - 1.001); fy = np.clip((1 - v) * ah - 0.5, 0, ah - 1.001)
    ix, iy = fx.astype(int), fy.astype(int); ax, ay = (fx - ix)[:, None], (fy - iy)[:, None]
    tex = atlas[iy, ix] * (1 - ax) * (1 - ay) + atlas[iy, ix + 1] * ax * (1 - ay) + atlas[iy + 1, ix] * (1 - ax) * ay + atlas[iy + 1, ix + 1] * ax * ay
    alb = tex * (a0[:, None] * C[i0] + a1[:, None] * C[i1] + a2[:, None] * C[i2])
    hemi = M.GROUND + (M.SKY - M.GROUND) * (0.5 * n[:, 1:2] + 0.5); ndl = np.clip(n @ M.LD, 0, None)[:, None]
    rgb = alb / math.pi * (M.IH * hemi + M.IS * M.SUN * ndl)
    if M.GGX:
        TH_ = math.radians(TH); V = np.array([0.0, math.sin(TH_), math.cos(TH_)]); Hh = M.LD + V; Hh /= np.linalg.norm(Hh)
        nv = np.clip(n @ V, 1e-4, 1)[:, None]; nl = np.clip(n @ M.LD, 0, 1)[:, None]; nh = np.clip(n @ Hh, 0, 1)[:, None]
        vh = max(float(V @ Hh), 0.0); q2 = (0.85 ** 2) ** 2
        D = q2 / (math.pi * (nh * nh * (q2 - 1) + 1) ** 2); Vis = 0.5 / (nl * np.sqrt(q2 + (1 - q2) * nv * nv) + nv * np.sqrt(q2 + (1 - q2) * nl * nl) + 1e-6)
        F = 0.04 + 0.96 * (1 - vh) ** 5; rgb = rgb + M.IS * M.SUN * nl * F * Vis * D
    col = np.zeros(iA.shape + (3,)); col[cov] = M.lin2srgb(rgb)
    bg = np.where(cov[..., None], 0.0, A.SEA)  # el agua lisa donde no hay barco
    img = _pix_mean(col + bg)
    return np.round(np.clip(img, 0, 1) * 255)  # 8 bits, como la captura


def lstar(img8):
    c = img8 / 255.0; lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    Y = lin @ np.array([0.2126, 0.7152, 0.0722]); return np.where(Y > 0.008856, 116 * np.cbrt(Y) - 16, 903.3 * Y)


def comps(mask):
    seen = np.zeros_like(mask, bool); out = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]: continue
        st = [(y, x)]; seen[y, x] = True; comp = []
        while st:
            cy, cx = st.pop(); comp.append((cy, cx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; st.append((ny, nx))
        out.append(np.array(comp))
    return out


def feret(b):
    if len(b) < 2: return 0.0
    d = b[:, None, :] - b[None, :, :]; return float(np.sqrt((d ** 2).sum(-1).max()))


# AD28_MSAA4=1: solo las 4 muestras del MSAA 4× estándar (D3D/Metal: (6,2), (14,6), (2,10), (10,14) en 1/16 de px), que caen
# en la rejilla de 4 × 4 de SS = 4 como (columna, fila) = (1, 0), (3, 1), (0, 2), (2, 3); si no, las 16 de la rejilla
MSAA4 = os.environ.get('AD28_MSAA4') == '1'
_M4 = np.zeros((4, 4), bool)
for _c, _r in ((1, 0), (3, 1), (0, 2), (2, 3)): _M4[_r, _c] = True


def _pix_mean(a):
    """Media por píxel de un array (H·SS, W·SS, …): las 16 muestras, o las 4 del MSAA con MSAA4."""
    t = a.reshape((H, SS, W, SS) + a.shape[2:])
    if not MSAA4: return t.mean((1, 3))
    assert SS == 4
    return t.transpose((0, 2, 1, 3) + tuple(range(4, t.ndim)))[:, :, _M4].mean(2)


def frac(ids, sel):
    """Fracción de muestras por píxel cuyo id cumple sel (array booleano por triángulo, con −1 → False)."""
    ok = np.where(ids >= 0, sel[np.maximum(ids, 0)], False)
    return _pix_mean(ok.astype(float))


MIN_CANA = int(os.environ.get('AD28_MIN_CANA', '0'))  # px de caña del cañón mayor de la mancha para que cuente en `cannons` (0 = sin mínimo)


def count(model, hd, roll=0.0, pitch=0.0, y=0.0, phase=(0.0, 0.0), detail=False):
    a, tag, gun, atlas = model
    P, UV, C, N, tg, gn = pose_arrays(a, tag, gun, hd, roll, pitch, y)
    mort, can, car, deck = tg == TI['mortero'], tg == TI['canon'], tg == TI['cureña'], tg == TI['cubierta']
    ox, oy = W / 2 + phase[0], H / 2 + 20 + phase[1]
    r = raster(P, tg, hd, ox, oy, ~mort, ~(mort | can | car), can)
    L = lstar(shade(P, UV, C, N, atlas, r))
    region = frac(r['iB'], deck) >= 0.5
    red = frac(r['iA'], can) >= 0.5; green = frac(r['iA'], car) >= 0.5
    dark = (L <= 25) & region
    blobs = []
    for b in comps(dark):
        fr = feret(b); yy, xx = b[:, 0], b[:, 1]
        isred = red[yy, xx]
        # qué cañones toca: los ids de cañón de las muestras del pase A en sus px rojos
        gs = {}; cana = {}
        for (py, px) in b[isred]:
            full = r['iA'][py * SS:(py + 1) * SS, px * SS:(px + 1) * SS]
            if MSAA4: full = full[_M4]
            full = full.ravel(); blk = full[full >= 0]
            for g in gn[blk][can[blk]]: gs[int(g)] = gs.get(int(g), 0) + 1
            # px limpio de caña (el «(N px)» del registro del a-v7): todas las muestras del px son de un mismo cañón
            if (full >= 0).all() and can[full].all() and len(set(gn[full].tolist())) == 1: g = int(gn[full[0]]); cana[g] = cana.get(g, 0) + 1
        blobs.append(dict(feret=round(fr, 2), px=len(b), canon=bool(isred.any()), cureña=bool(green[yy, xx].any()), canones=sorted(gs, key=lambda k: -gs[k]), principal=(max(cana, key=cana.get) if cana else None), cana_px={int(k): int(v) for k, v in cana.items()},
                          centro=[round(float(xx.mean()), 1), round(float(yy.mean()), 1)]))
    big = [b for b in blobs if b['feret'] >= 4]
    out = dict(guns=sum(b['canon'] for b in big), cannons=len({b['principal'] for b in big if b['canon'] and b['principal'] is not None and b['cana_px'][b['principal']] >= MIN_CANA}),
               cana_por_canon={g: max(b['cana_px'][g] for b in big if b['canon'] and b['principal'] == g) for g in {b['principal'] for b in big if b['canon'] and b['principal'] is not None}}, mounts=sum(b['canon'] or b['cureña'] for b in big),
               gunFerets=sorted([b['feret'] for b in big if b['canon']], reverse=True), ferets=sorted([b['feret'] for b in blobs], reverse=True))
    if detail:
        out['manchas'] = blobs
        # por cañón: su huella sola (pase C) y qué hay encima en el pase A, en muestras
        per = {}
        for k in range(12):
            fp = np.where(r['iC'] >= 0, gn[np.maximum(r['iC'], 0)] == k, False)
            nfp = int(fp.sum())
            top = r['iA'][fp]; cnt = {}
            for t in top:
                key = 'nada' if t < 0 else ('él mismo' if (can[t] and gn[t] == k) else TAGS[tg[t]] + ('' if gn[t] < 0 or tg[t] != TI['canon'] else f' {gn[t]}'))
                cnt[key] = cnt.get(key, 0) + 1
            # px de su huella (cobertura ≥ 50 % de la huella sola) fuera de la región o no oscuros
            fpp = fp.reshape(H, SS, W, SS).mean((1, 3)) >= 0.5
            mine = [b for b in big if b['canon'] and b['canones'] and b['canones'][0] == k]
            per[k] = dict(z=C2.CANNON_Z[k // 2], banda=BANDA[1 if k % 2 else -1], huella_muestras=nfp,
                          encima={kk: round(v / max(nfp, 1), 3) for kk, v in sorted(cnt.items(), key=lambda kv: -kv[1])},
                          huella_px=int(fpp.sum()), fuera_region_px=int((fpp & ~region).sum()), claros_px=int((fpp & region & (L > 25)).sum()),
                          mancha=(mine[0]['feret'] if mine else None))
        out['por_canon'] = per
    return out


def load(sails=None, jib_clew=None, check=True, ktx=None):  # ktx: otra KTX2 del atlas (la del reexporte, con la AO nueva)
    a, tag, gun = build_tagged(sails, jib_clew)
    if check:
        ref = np.load(os.path.join(A.CAD, 'canonera2_lod0.npz'))
        assert a['p'].shape == ref['p'].shape and np.allclose(a['p'], ref['p']) and np.allclose(a['t'], ref['t']), 'la malla no es la del npz entregado'
    atlas = A.ktx_lin(ktx or os.path.join(A.CAD, 'comp', 'atlas_canonera2.ktx2'))
    return a, tag, gun, atlas


def load_variant(spec, ktx=None):
    """Variante de las velas: base | pie:<Δmayor>,<Δtrinquete> (sube la amura y el puño de escota, m) | abre:<grados>
    (apertura de D12, 25 de serie) | pico:<Δmayor>,<Δtrinquete> (sube o baja el pico C, m) | foque:<x>,<y>,<z> (el puño de
    escota del foque; de serie −1,6, 3,4, 10,2) | combinadas con «+». Solo la base se coteja con el npz entregado."""
    sails, open_deg, jib = {}, None, None
    for part in spec.split('+'):
        if part == 'base': continue
        k, v = part.split(':')
        if k in ('pie', 'pico'):
            dm, df = (float(x) for x in v.split(','))
            for key, dd in (('main', dm), ('fore', df)):
                z_m, A_, B_, Cc, D_ = sails.get(key, C2.SAILS[key])
                if k == 'pie': sails[key] = (z_m, (A_[0], A_[1] + dd), B_, Cc, (D_[0], D_[1] + dd))
                else: sails[key] = (z_m, A_, B_, (Cc[0], Cc[1] + dd), D_)
        elif k == 'abre': open_deg = float(v)
        elif k == 'foque': jib = tuple(float(x) for x in v.split(','))
        elif k == 'cana': BAT['dy'], BAT['r'] = (float(x) for x in v.split(','))
        elif k == 'foquecab': JIB['head'] = float(v)
    saved = C2.OPEN
    if open_deg is not None: C2.OPEN = math.radians(open_deg)
    try: return load(sails or None, jib_clew=jib, check=(spec == 'base'), ktx=ktx)
    finally: C2.OPEN = saved; BAT.update(dy=0.0, r=1.0); JIB.update(head=None)


# Las 5 capturas del a-v6 a 225° (dev-render-p3a5-turno-bb2a1fc.log :17-21): alabeo, cabeceo (°) e y (m)
AV6 = [(-1.91, -0.08, -0.044), (-2.71, -1.36, 0.116), (0.58, -1.20, 0.018), (3.00, 0.25, -0.120), (0.88, 1.42, 0.010)]
AV6_GUNS = [6, 8, 8, 8, 8]

if __name__ == '__main__':
    cmd = sys.argv[2]
    if cmd == 'partes':  # recuento de triángulos por etiqueta (frente a U6: 192 cañón, 22 mortero, 120 cureña, 38 cubierta)
        a, tag, gun, _ = load()
        print({t: int((tag == TI[t]).sum()) for t in TAGS})
    elif cmd == 'tiempo':
        mod = load(); t0 = time.time(); q = count(mod, 225); print(round(time.time() - t0, 2), 's', q)

# Uso (desde la raíz del repo), con la UX_OUT de la Cañonera rehecha (lamina_canonera2.py: canonera2_lod{0,1}.npz y
# comp/atlas_canonera2.ktx2 en $UX_OUT/cadena) y los barcos de hoy del generador del juego en $UX_OUT/cadena:
#   G=<copia del código con node_modules>; for id in pirate captain gunboat; do
#     (cd $G && npx tsx export-rig-npc.ts $id "$UX_OUT/cadena/$id-rig.json"); done     (scripts/ux/laminas/code/export-rig-npc.ts)
#   python3 -I scripts/ux/barcos/ad28_canonera2.py  →  $UX_OUT/ad28-canonera2.json y ad28-canonera2.png
# Modelo de AD-28 (ART-DIRECTION §19; AC-115) para la Cañonera rehecha: ¿se sigue distinguiendo en grises del Pirata y del
# Capitán a la escala del móvil? 390×844 con N1 a 1,0× (2,82 px/m CSS × DPR 1,5 del lienzo = 4,23 px/m), cámara a 55°,
# rumbos 45 / 135 / 225 / 315°, la luz del juego (render_tex.py). Máscara = px que cambian al ocultar el barco (ΔE76 ≥ 3
# frente al agua lisa); firmas: área, L* medio, fracción clara (L* ≥ 65) y fracción media (45 ≤ L* < 65). Pasa un par si en
# cada rumbo difieren ≥ 2 firmas un 30 % (|x − y| / máx; en las fracciones, además, ≥ 1 punto). Como en el juego, el Pirata
# va en LOD1 y la Cañonera y el Capitán en LOD0. Calibración: la Cañonera de hoy (D51) frente a lo medido en el juego con
# `hostile-signatures.spec.ts` (fracción media 46,6–54,1 %, Capitán 3,7–6,7 %, Pirata 0–0,2 %). La nueva va con su luz de
# forma (palanca 3) y se mide con y sin su sombra en el agua (palanca 1). Segunda parte de AD-28: los cañones que se cuentan
# en 1440×900 con N3 a 1,0× (5,04 px/m, DPR 1), ≥ 8 en cada rumbo. Región = px con ≥ 50 % de muestras de cubierta en un pase
# sin cañones, cureñas ni mortero; manchas = componentes de 8 vecinos con L* ≤ 25 en la captura normal (sin mortero) dentro
# de la región, con Feret ≥ 4 px. Cada mancha se cruza con los px de cañón del pase de ids: con cañón, sin cañón o fundida
# (más de un cañón). La Cañonera de hoy se etiqueta por su color de vértice (lo medido en el juego: 10–11 por rumbo).
# Ligero (segundos, un núcleo). No corre en la CI.
import sys, os, json, math, struct, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'laminas'), os.path.join(HERE, '..', 'mapa')): sys.path.insert(0, p)
import rutas as RT
import render_tex as RTX
import curvo as CV
import numpy as np
from PIL import Image, ImageFilter
import canonera2_curvo as C2

CAD = os.path.join(RT.OUT, 'cadena'); M = RTX.M
SEA = np.array([26, 95, 134.0]) / 255; WHITE = np.ones((4, 4, 3)); Yv = np.array([0.2126, 0.7152, 0.0722])
PPM = 2.82 * 1.5; HEADINGS = (45, 135, 225, 315); TH = 55
KS = 2.0; _up_h = M.IH * float(M.SKY @ Yv); _up_s = M.IS * float(M.SUN @ Yv) * M.LD[1]; KH = (_up_h + _up_s - KS * _up_s) / _up_h
SH_A, SH_BLUR = 0.40, 0.25   # los de lamina_cadena.py y lamina_canonera2.py


def rig(cid, lod):
    d = json.load(open(RT.need(os.path.join(CAD, f'{cid}-rig.json'), f'{cid}-rig.json (code/export-rig-npc.ts {cid})')))[f'lod{lod}']
    P = np.array(d['pos']).reshape(-1, 3); C = np.array(d['col']).reshape(-1, 3)
    P, UV, C, _ = RTX.clip_below_water(P, np.full((len(P), 2), 0.5), C)
    return dict(P=P, UV=UV, C=C, S=None, N=None, A=WHITE, shadow=False)


def ktx_lin(path):
    w, h = struct.unpack('<II', open(path, 'rb').read()[20:28]); raw = path[:-5] + '.ad28.raw'
    subprocess.run(['ktx', 'extract', '--transcode', 'rgba8', '--level', '0', '--raw', path, raw], check=True, capture_output=True)
    a = np.frombuffer(open(raw, 'rb').read(), np.uint8).reshape(h, w, 4)[..., :3].astype(float); os.remove(raw); return RTX.srgb2lin(a)


def recipe(lod, atlas, shadow):
    d = np.load(RT.need(os.path.join(CAD, f'canonera2_lod{lod}.npz'), f'canonera2_lod{lod}.npz (canonera2_curvo.py)'))
    P = d['p']; N = CV.vertex_normals(P); C4 = np.concatenate([d['c'], d['r'][:, None]], axis=1)
    Pc, UVc, C4c, Nc = RTX.clip_below_water(P, d['t'], C4, N)
    return dict(P=Pc, UV=UVc, C=C4c[:, :3], S=C4c[:, 3], N=Nc, A=atlas, shadow=shadow)


def Ry(hd):
    ps = math.radians(hd); c, s = math.cos(ps), math.sin(ps); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def shot(mod, hd, W=260, H=200):
    ox, oy = W / 2, H / 2 + 12
    kw = dict(S=mod['S'], kh=KH, ks=KS) if mod['S'] is not None else {}
    rgb, cov = RTX.render(mod['P'], mod['UV'], mod['C'], mod['A'], PPM, W, H, ox, oy, TH, SS=4, N=mod['N'], heading_deg=hd, **kw)
    bg = np.tile(SEA, (H, W, 1))
    if mod['shadow']:
        Ll = Ry(hd).T @ M.LD; Ps = mod['P'] - (mod['P'][:, 1:2] / Ll[1]) * Ll[None, :]; Ps[:, 1] = 0.005
        _, sc = RTX.render(Ps, np.full((len(Ps), 2), 0.5), np.ones((len(Ps), 3)), WHITE, PPM, W, H, ox, oy, TH, SS=2, heading_deg=hd)
        sm = np.asarray(Image.fromarray((sc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(SH_BLUR * PPM)), float) / 255
        bg = M.lin2srgb(RTX.srgb2lin(bg * 255) * (1 - SH_A * sm[..., None]))
    img = np.clip(rgb + bg * (1 - cov[..., None]), 0, 1)
    La = M.lab(img * 255); Lb = M.lab(np.tile(SEA, (H, W, 1)) * 255)
    mask = np.linalg.norm(La - Lb, axis=-1) >= 3; L = La[..., 0][mask]
    sig = dict(area=int(mask.sum()), L_medio=round(float(L.mean()), 2), clara=round(float((L >= 65).mean()), 4), media=round(float(((L >= 45) & (L < 65)).mean()), 4))
    return sig, img, mask


def differ(a, b):
    out = []
    for k in ('area', 'L_medio', 'clara', 'media'):
        x, y = a[k], b[k]; rel = abs(x - y) / max(abs(x), abs(y), 1e-12)
        if rel >= 0.30 and (k in ('area', 'L_medio') or abs(x - y) >= 0.01): out.append(k)
    return out


# --- segunda parte: cañones en 1440×900 (N3 a 1,0×)
PPM_D = 5.04
GUNBOAT_Z = (-10, -6, -2, 2, 6, 10)   # cannonZ de la Cañonera de hoy (SHIP_RECIPES.gunboat)


def hexkey(c): return '#%02X%02X%02X' % tuple(int(round(v * 255)) for v in c)


def gunboat_tagged():
    """La Cañonera de hoy (LOD0) con sus partes por color de vértice (lineal): cañones y mortero #050506 (el mortero, el de
    |x| < 1,5), cureñas #0B0604 bajo y = 2,3, fuera de |x| < 2,5, de ≤ 1,5 m en z y a ≤ 1 m de la z de un cañón (el resto de ese
    color es el palo y la regala, que va de punta a punta), cubierta en sus 4 tablas."""
    d = json.load(open(RT.need(os.path.join(CAD, 'gunboat-rig.json'), 'gunboat-rig.json')))['lod0']
    P = np.array(d['pos']).reshape(-1, 3); C = np.array(d['col']).reshape(-1, 3); T = len(P) // 3
    cen = P.reshape(T, 3, 3).mean(1); key = [hexkey(C[3 * i]) for i in range(T)]
    tag = np.array(['otro'] * T, dtype=object)
    for i, k in enumerate(key):
        if k == '#050506': tag[i] = 'mortero' if abs(cen[i, 0]) < 1.5 else 'canon'
        elif k == '#0B0604' and cen[i, 1] < 2.3 and abs(cen[i, 0]) > 2.5 and np.ptp(P[3 * i:3 * i + 3, 2]) <= 1.5 \
                and min(abs(cen[i, 2] - z) for z in GUNBOAT_Z) <= 1.0: tag[i] = 'cureña'
        elif k in ('#352515', '#5C442B', '#4E3A24', '#2D2012'): tag[i] = 'cubierta'
    UV = np.full((len(P), 2), 0.5)
    return P, UV, C, None, None, WHITE, tag


def canonera2_tagged(atlas):
    """La nueva (LOD0), construida otra vez con canonera2_curvo.build y sus partes anotadas: los mismos triángulos que el npz."""
    rng = {}; orig_deck = C2.CV.build_deck
    def deck(m, H, zs, region, *a, **k):
        s0 = m.ntri(); orig_deck(m, H, zs, region, *a, **k); rng.setdefault(region, []).append((s0, m.ntri()))
    def battery(m, H, lod):  # la de canonera2_curvo.py, anotando cada pieza
        for z in C2.CANNON_Z:
            yd = H.y0(z) + H.deck_h(z)
            for side in (1, -1):
                xc = side * (H.x_at(z, yd) - 1.0)
                s0 = m.ntri(); C2.CV.cuboid(m, xc - side * 0.25, yd + 0.25, z, 1.0, 0.5, 1.4, C2.PAL['rail'], rim=0.0); rng.setdefault('cureña', []).append((s0, m.ntri()))
                s0 = m.ntri(); C2.taper(m, (xc - side * 1.2, yd + 0.45, z), (xc + side * 1.2, yd + 0.45, z), 0.40, 0.34, 6, C2.PAL['cannon'], cap=True); rng.setdefault('canon', []).append((s0, m.ntri()))
        s0 = m.ntri(); yd = H.y0(C2.MORTAR_Z); C2.taper(m, (0, yd, C2.MORTAR_Z), (0, yd + 1.2, C2.MORTAR_Z), 1.3, 1.1, 8, C2.PAL['cannon'])
        w = m.at.white; cy = yd + 1.2; ring = [(1.1 * math.cos(2 * math.pi * i / 8), cy, C2.MORTAR_Z + 1.1 * math.sin(2 * math.pi * i / 8)) for i in range(8)]
        for i in range(1, 7): m.tri(ring[0], ring[i], ring[i + 1], w, w, w, '#0E0E10')
        rng.setdefault('mortero', []).append((s0, m.ntri()))
    C2.CV.build_deck, ob = deck, C2.battery; C2.battery = battery
    try: m, H = C2.build(0)
    finally: C2.CV.build_deck, C2.battery = orig_deck, ob
    a = m.arrays(); ref = np.load(os.path.join(CAD, 'canonera2_lod0.npz'))
    assert a['p'].shape == ref['p'].shape and np.allclose(a['p'], ref['p']), 'la malla reconstruida no es la del npz'
    T = len(a['p']) // 3; tag = np.array(['otro'] * T, dtype=object)
    for name, spans in rng.items():
        for s0, s1 in spans: tag[s0:s1] = 'cubierta' if name == 'deck' else name
    N = CV.vertex_normals(a['p'])
    return a['p'], a['t'], a['c'], a['r'], N, atlas, tag


def keep(P, UV, C, S, N, tag, drop):
    k = np.repeat(~np.isin(tag, drop), 3)
    return P[k], UV[k], C[k], (None if S is None else S[k]), (None if N is None else N[k]), tag[~np.isin(tag, drop)]


def ids(P, ppm, W, H, ox, oy, hd, SS):
    """Pase de ids (como render_tex.render, sin luz): por muestra, el triángulo más cercano o −1."""
    TH_ = math.radians(TH); ps = math.radians(hd); c, s = math.cos(ps), math.sin(ps); Pw = P @ np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]).T
    sx = (Pw[:, 0] * ppm + ox) * SS; sy = (-(Pw[:, 1] * math.cos(TH_) - Pw[:, 2] * math.sin(TH_)) * ppm + oy) * SS
    dep = -(Pw[:, 1] * math.sin(TH_) + Pw[:, 2] * math.cos(TH_)); WS, HS = W * SS, H * SS
    zb = np.full((HS, WS), np.inf); out = np.full((HS, WS), -1)
    for t in range(len(P) // 3):
        i = 3 * t; x0, x1, x2 = sx[i:i + 3]; y0, y1, y2 = sy[i:i + 3]; area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9: continue
        bx0, bx1 = max(int(math.floor(min(x0, x1, x2))), 0), min(int(math.ceil(max(x0, x1, x2))), WS - 1)
        by0, by1 = max(int(math.floor(min(y0, y1, y2))), 0), min(int(math.ceil(max(y0, y1, y2))), HS - 1)
        if bx1 < bx0 or by1 < by0: continue
        X, Y = np.meshgrid(np.arange(bx0, bx1 + 1) + 0.5, np.arange(by0, by1 + 1) + 0.5)
        w0 = ((x1 - X) * (y2 - Y) - (x2 - X) * (y1 - Y)) / area; w1 = ((x2 - X) * (y0 - Y) - (x0 - X) * (y2 - Y)) / area; w2 = 1 - w0 - w1
        ins = (w0 >= 0) & (w1 >= 0) & (w2 >= 0); d = w0 * dep[i] + w1 * dep[i + 1] + w2 * dep[i + 2]
        z = zb[by0:by1 + 1, bx0:bx1 + 1]; upd = ins & (d < z)
        z[upd] = d[upd]; out[by0:by1 + 1, bx0:bx1 + 1][upd] = t
    return out


def blobs(mask):
    """Componentes de 8 vecinos (sin scipy): lista de arrays (n, 2) de (y, x)."""
    seen = np.zeros_like(mask); out = []
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


def cannons(P, UV, C, S, N, A, tag, zs):
    """Manchas por rumbo: total (Feret ≥ 4 px), con un cañón, sin cañón y fundidas; y cuántos cañones (de 12) cubre alguna."""
    SSd = 3; W, Hh = 260, 220; ox, oy = W / 2, Hh / 2 + 20; res = {}
    Pn, UVn, Cn, Sn, Nn, tn = keep(P, UV, C, S, N, tag, ['mortero'])
    Pr, _, _, _, _, tr = keep(P, UV, C, S, N, tag, ['mortero', 'canon', 'cureña'])
    # cada cañón por separado: se numera por la z de su batería más cercana a su centro y por su banda
    ci = np.nonzero(tn == 'canon')[0]; cen = Pn.reshape(-1, 3, 3)[ci].mean(1)
    gid = np.full(len(tn) + 1, -1); gid[ci] = [2 * int(np.argmin(np.abs(np.array(zs) - z))) + (x > 0) for x, _, z in cen]  # índice −1 → −1
    for hd in HEADINGS:
        kwr = dict(S=Sn, kh=KH, ks=KS) if Sn is not None else {}
        rgb, cov = RTX.render(Pn, UVn, Cn, A, PPM_D, W, Hh, ox, oy, TH, SS=SSd, N=Nn, heading_deg=hd, **kwr)
        img = np.clip(rgb + np.tile(SEA, (Hh, W, 1)) * (1 - cov[..., None]), 0, 1); L = M.lab(img * 255)[..., 0]
        idr = ids(Pr, PPM_D, W, Hh, ox, oy, hd, SSd); dk = np.where(idr >= 0, tr[np.maximum(idr, 0)] == 'cubierta', False)
        region = dk.reshape(Hh, SSd, W, SSd).mean((1, 3)) >= 0.5
        g = gid[ids(Pn, PPM_D, W, Hh, ox, oy, hd, SSd)]
        tot = one = none = fused = big = 0; seen = set()
        for b in blobs((L <= 25) & region):
            if len(b) < 200 and (len(b) < 2 or max(np.hypot(*(b[i] - b[j])) for i in range(len(b)) for j in range(i + 1, len(b))) < 4): continue  # con 200 px el Feret ya pasa de 4
            tot += 1; gs = set(); big = max(big, len(b))
            for (y, x) in b: gs |= set(int(v) for v in g[y * SSd:(y + 1) * SSd, x * SSd:(x + 1) * SSd].ravel() if v >= 0)
            seen |= gs; one += len(gs) == 1; none += not gs; fused += len(gs) > 1
        res[hd] = dict(manchas=tot, con_un_canon=one, sin_canon=none, fundidas=fused, canones_vistos=len(seen), region_px=int(region.sum()), mayor_px=big)
    return res


if __name__ == '__main__':
    PARTS = sys.argv[1:] or ['firmas', 'canones']   # una parte sola: `firmas` o `canones` (cada una, por debajo de 15 s)
    atlas = ktx_lin(RT.need(os.path.join(CAD, 'comp', 'atlas_canonera2.ktx2'), 'atlas_canonera2.ktx2 (ktx create, lamina_canonera2.py)'))
    out = os.path.join(RT.OUT, 'ad28-canonera2.json'); res = json.load(open(out)) if os.path.exists(out) else {}
    if 'firmas' in PARTS:
        ships = {'pirata': rig('pirate', 1), 'capitan': rig('captain', 0), 'canonera_hoy': rig('gunboat', 0),
                 'canonera2': recipe(0, atlas, True), 'canonera2_sin_sombra': recipe(0, atlas, False), 'canonera2_lod1': recipe(1, atlas, True)}
        res.update(ppm_lienzo=PPM, firmas={}, pares={}); tiles = []
        for name, mod in ships.items():
            res['firmas'][name] = {}; row = []
            for hd in HEADINGS:
                sig, img, mask = shot(mod, hd); res['firmas'][name][hd] = sig
                row.append(np.clip(M.lab(img * 255)[..., 0] / 100, 0, 1))
            tiles.append(np.concatenate(row, 1))
        PAIRS = [('pirata', 'capitan')] + [(a, b) for c in ('canonera_hoy', 'canonera2', 'canonera2_sin_sombra', 'canonera2_lod1') for a, b in (('pirata', c), ('capitan', c))]
        for a, b in PAIRS:
            per = {hd: differ(res['firmas'][a][hd], res['firmas'][b][hd]) for hd in HEADINGS}
            res['pares'][f'{a}–{b}'] = dict(por_rumbo=per, minimo=min(len(v) for v in per.values()), pasa=all(len(v) >= 2 for v in per.values()))
        # hoja de evidencia: L* de cada barco en gris (fila) por rumbo (columna), en el orden de `ships`
        Image.fromarray((np.concatenate(tiles, 0) * 255).astype(np.uint8)).save(os.path.join(RT.OUT, 'ad28-canonera2.png'))
        for name in ships:
            f = res['firmas'][name]
            print(f'{name:22s} ' + ' | '.join(f'{hd}° A {f[hd]["area"]:5d} L* {f[hd]["L_medio"]:5.1f} cl {100 * f[hd]["clara"]:5.1f} md {100 * f[hd]["media"]:5.1f}' for hd in HEADINGS))
        for k, v in res['pares'].items():
            print(f'{k:32s} pasa {v["pasa"]} · mín {v["minimo"]} · ' + ' | '.join(f'{hd}° {",".join(x) or "—"}' for hd, x in v['por_rumbo'].items()))
    if 'canones' in PARTS:
        gb = gunboat_tagged(); c2 = canonera2_tagged(atlas)
        res['canones_1440'] = {'canonera_hoy': cannons(*gb, GUNBOAT_Z), 'canonera2': cannons(*c2, C2.CANNON_Z)}  # cannonZ del juego (D51) y la nueva
        for k, v in res['canones_1440'].items():
            print(f'cañones 1440 {k:14s} ' + ' | '.join(f'{hd}° {r["manchas"]} manchas ({r["con_un_canon"]} con 1, {r["sin_canon"]} sin, {r["fundidas"]} fundidas; {r["canones_vistos"]}/12; región {r["region_px"]} px, mayor {r["mayor_px"]} px)' for hd, r in v.items()))
    json.dump(res, open(out, 'w'), indent=1, ensure_ascii=False)

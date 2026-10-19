# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/clase_curvo.py <clase>   (sloop, schooner, brig o frigate)
#   →  $UX_OUT/cadena/<clase>_{gb,es}_lod{0,1}.npz, atlas_<clase>_{gb,es}_base.png y, si existe ao_<clase>_<fam>.npy
#      (blender_curvo.py <clase>_<fam> bake), atlas_<clase>_<fam>.png con la oclusión y atlas_<clase>_<fam>_out.png, el
#      de la entrega, del lado de la clase (ligero: segundos)
# Necesita $UX_OUT/cadena/<clase>-rig.json: el barco de hoy del generador del juego (code/export-rig-clases.ts). No corre
# en la CI.
# Las 4 clases del jugador que faltan en las 2 familias (AC-195) con la receta de D91 de los Navíos (navio_curvo.py), que
# Jonattan aprobó. La clase se lee igual en las 2 familias (GDD §6; ART-DIRECTION §9.2, AD-37): la eslora, los palos, el
# aparejo, la categoría de castillos de S4 (la Balandra y el Bergantín con camareta, la Goleta sin nada, la Fragata con
# alcázar y castillo de proa) y una franja de portas (S6). La familia cambia los colores (PAL de navio_curvo.py), el alto de
# la camareta y de los castillos (+0,4 m la española), la popa (ventanas, tallas doradas), la bandera de popa (Union Jack o
# rojigualda, en el pico de la cangreja de popa: en las 4 la botavara pasa por encima de donde iría el asta), la cruz de
# Borgoña en las cuadras de la española y el tamaño de los faroles. Del generador del juego se quedan el aparejo (palos,
# vergas, velas, foques, cofas y el gallardete del jugador) y los cañones; el casco, la camareta y los castillos se rehacen
# con curvo.py. El atlas se pinta a 1024² con la distribución del Navío y se entrega con el lado más pequeño que da
# ≥ 18 px/m en el casco y en las cubiertas (producto, 2026-10-19): 512² la Balandra, la Goleta y el Bergantín (26,2, 21,0
# y 19,1) y 1024² la Fragata (a 512², 10,4 en la manga del alcázar). La descarga de las 8 suma ≤ 630 930 B (AC-197 d).
import json, math, os, random, sys
HERE_S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE_S, '..', 'laminas')); sys.path.insert(0, HERE_S)
sys.dont_write_bytecode = True
import rutas as RT
import curvo as CV
import navio_curvo as NCV  # el atlas (AT), las paletas de familia (PAL) y compose()
import numpy as np
from PIL import Image, ImageDraw
OUT = os.path.join(RT.OUT, 'cadena'); os.makedirs(OUT, exist_ok=True)
AT, PAL = NCV.AT, NCV.PAL
T_ES = 0.4  # lo que sube la española la camareta y los castillos
# Las clases (ASSET-SPEC §8.4; SHIP_RECIPES del generador). house: la camareta de popa (centro en z, ancho, largo y alto por
# familia); band: la franja de portas (alto sobre la flotación en la maestra), centrada en cannonY; boats: (x, z, eslora,
# manga); emblems: las cuadras con la cruz de la española (z del palo, ancho, alto, y del borde de abajo); A: el lado del
# atlas que se entrega
CLASES = {
    'sloop': dict(sid='ship_sloop', L=16.0, B=4.4, F=1.5, D=0.8, RAIL=0.5, tiers=(),
                  house=dict(z=-6.6, w=2.6, l=2.4, h=0.7), band=(0.62, 1.18), lids=False, boats=(), capstan=None,
                  carronades=(), wheel=-4.4, bell=None, lanterns=1, gallery=None, figure=False, hatches=(-2.6, 4.4),
                  emblems=((1.5, 5.6, 2.4, 11.4),), A=512),
    'schooner': dict(sid='ship_schooner', L=22.0, B=5.6, F=1.6, D=0.9, RAIL=0.56, tiers=(), house=None, band=(0.7, 1.3),
                     lids=False, boats=(), capstan=None, carronades=(), wheel=-8.4, bell=None, lanterns=1, gallery=None,
                     figure=False, hatches=(0.4, -6.4, 7.6), emblems=((4.0, 5.4, 2.4, 14.6),), A=512),
    'brig': dict(sid='ship_brigantine', L=24.0, B=6.2, F=2.0, D=1.1, RAIL=0.7, tiers=(),
                 house=dict(z=-9.6, w=4.0, l=4.0, h=1.0), band=(0.85, 1.55), lids=True, boats=((0.0, 1.0, 5.0, 1.5),),
                 capstan=-5.6, carronades=(), wheel=-7.0, bell=None, lanterns=1, gallery=None, figure=True, hatches=(8.4,),
                 emblems=((5.5, 9.0, 3.6, 4.4), (5.5, 7.4, 3.2, 8.3)), A=512),
    'frigate': dict(sid='ship_frigate', L=34.0, B=8.6, F=2.8, D=1.5, RAIL=1.0,
                    tiers=(dict(kind='aft', edge=-8.0, h=1.6, ramp=2.0), dict(kind='fore', edge=9.5, h=1.0, ramp=2.0)),
                    house=None, band=(1.25, 2.1), lids=True, boats=((-1.4, 5.2, 6.0, 1.7), (1.4, 5.2, 6.0, 1.7)),
                    capstan=-4.4, carronades=(-10.0, -12.5, 11.0, 13.0), wheel=-10.0, bell=11.6, lanterns=3,
                    gallery=(-16.4, -13.6), figure=True, hatches=(-2.6, -6.2),
                    emblems=((10.0, 12.0, 4.6, 5.6), (0.5, 13.2, 5.0, 5.6)), A=1024),
}


def tiers_of(c, fam):
    return [dict(t, h=t['h'] + (T_ES if fam == 'es' else 0.0)) for t in c['tiers']]


def vrange(c, fam):
    """V_TOP / V_BOT de la región del casco (alto corregido por el arrufo), como los del Navío (10,4 / −2,2)."""
    hs = [t['h'] for t in tiers_of(c, fam)] or [0.0]
    return c['F'] + c['RAIL'] + max(hs) + 0.6, -(c['D'] + 0.3)


def hull_of(cls, fam):
    """El casco curvo de la clase. La caída de la popa (over_k) sale de que la caja del casco mida ≤ 1,6 % más que L
    (AS-V03 pide ±2 %): el vuelo del coronamiento más el abombado del espejo = 0,016·L."""
    c = CLASES[cls]; L, B, F, D, RAIL = c['L'], c['B'], c['F'], c['D'], c['RAIL']
    bulge = max(0.12, 0.25 * L / 42); over_y = 0.42 * F
    kw = dict(y_m=0.375 * F, T=0.07, tiers=tiers_of(c, fam), bulge=bulge)
    H0 = CV.Hull(L, B, F, D, RAIL, 'standard', over=(0.42, over_y, 0.0), **kw)
    k = max(0.0, (0.016 * L - bulge) / max(H0.top(-L / 2) - over_y, 0.5))
    return CV.Hull(L, B, F, D, RAIL, 'standard', over=(0.42, over_y, k), **kw)


def rig_json(cls): return json.load(open(RT.need(os.path.join(OUT, f'{cls}-rig.json'), f'{cls}-rig.json (code/export-rig-clases.ts {cls})')))


def rig(m, lod, cls):
    """Del generador del juego, todo menos el casco, la camareta, los castillos (_RIM_MASK 1), las portas y los faroles
    (van en la textura o se rehacen): palos, vergas, cofas, velas, foques, gallardete y cañones."""
    d = rig_json(cls)[f'lod{lod}']
    P = np.array(d['pos']).reshape(-1, 3, 3); C = np.array(d['col']).reshape(-1, 3, 3); Rm = np.array(d['rim']).reshape(-1, 3)
    drop = [CV.hexlin('#1A1410'), CV.hexlin('#FFE9A8')]; w = AT.white
    for p, c, r in zip(P, C, Rm):
        if r[0] > 0.5 or any(np.abs(c[0] - k).max() < 1e-3 for k in drop): continue
        m.p += [tuple(v) for v in p]; m.t += [w] * 3; m.c += [tuple(x) for x in c]; m.r += [0.0] * 3; m.b += [0] * 3


def peak(mast, open_deg):
    """El pico C de la cangreja tal como lo deja el generador: girado open_deg alrededor del gratil A→B (`opened`)."""
    g = mast['gaff']; zy = lambda q: np.array([0.0, q[1], q[0]])
    A, B, C = zy(g['A']), zy(g['B']), zy(g['C']); u = (B - A) / np.linalg.norm(B - A); r = C - A
    side = np.cross(u, r)[0]; ang = math.radians(-open_deg if side > 0 else open_deg)
    rr = r * math.cos(ang) + np.cross(u, r) * math.sin(ang) + u * (u @ r) * (1 - math.cos(ang))  # Rodrigues
    return A + rr


def build(cls, fam, lod):
    c = CLASES[cls]; L, B = c['L'], c['B']; H = hull_of(cls, fam); m = CV.Mesh(AT); pal = PAL[fam]
    V_TOP, V_BOT = vrange(c, fam)
    aft = [t for t in H.tiers if t['kind'] == 'aft']; fore = [t for t in H.tiers if t['kind'] == 'fore']
    zs = H.stations(max(11, round(29 * L / 42))) if lod == 0 else H.stations(7, fr=(0.0, 1.0))
    secs = CV.build_hull(m, H, zs, (4 if L >= 30 else 3) if lod == 0 else 2, 2 if lod == 0 else 1, V_TOP, V_BOT, pal['rail'])
    CV.build_stern(m, H, secs[0], 6 if lod == 0 else 2)
    za = aft[0]['edge'] if aft else -L / 2; zb = fore[0]['edge'] if fore else L / 2
    CV.build_deck(m, H, zs, 'deck', za, zb, 0.0, B + 0.4)
    for k, t in enumerate(aft):
        CV.build_deck(m, H, zs, f'q{k}', aft[k + 1]['edge'] if k + 1 < len(aft) else -L / 2, t['edge'], t['h'], B + 0.4)
        xl, xh, yl, yh = CV.build_wall(m, H, f'bw{k}', t['edge'], aft[k - 1]['h'] if k else 0.0, t['h'], +1, ncol=6 if lod == 0 else 2)
        if lod == 0: CV.cuboid(m, 0, yh + 0.45, t['edge'] + 0.15, 2 * xh - 0.1, 0.9, 0.14, pal['rail'], rim=1.0)
    if fore:
        f = fore[0]; CV.build_deck(m, H, zs, 'fc', f['edge'], L / 2, f['h'], B + 0.4)
        xl, xh, yl, yh = CV.build_wall(m, H, 'bw3', f['edge'], 0.0, f['h'], -1, ncol=6 if lod == 0 else 2)
        if lod == 0: CV.cuboid(m, 0, yh + 0.45, f['edge'] - 0.15, 2 * xh - 0.1, 0.9, 0.14, pal['rail'], rim=1.0)
    if c['house']: house(m, H, c, fam, pal, lod)  # S4: la camareta sobrevive en LOD1
    if lod == 0:
        zt = -L / 2 + H.tb; yd_ = H.y0(zt) + (aft[-1]['h'] if aft else 0.0); yt = H.top(zt); xs = H.x_at(zt, yt) - H.tb
        m.solid(H.warp(-xs, yd_, zt), H.warp(xs, yd_, zt), H.warp(xs, yt, zt), H.warp(-xs, yt, zt), pal['inner'], 1.0)
        if c['gallery']:
            z0, z1 = c['gallery']; zm = (z0 + z1) / 2
            CV.build_gallery(m, H, z0, z1, H.y0(zm) + 0.3, H.top(zm) - 0.6, (0.5 if fam == 'es' else 0.38), pal['trim'], nz=4, ny=2)
        details(m, H, cls, fam, pal)
        if fam == 'es': emblem(m, c['emblems'])
    ensign(m, H, cls, fam)
    rig(m, lod, cls)
    return m, H


def house(m, H, c, fam, pal, lod):
    """La camareta de popa (S4) en el color de la obra muerta, con la tapa en tablas oscuras, la moldura de la familia y,
    en LOD0, una fila de ventanas por costado y en el frente."""
    hc = c['house']; z, w, l = hc['z'], hc['w'], hc['l']; h = hc['h'] + (T_ES if fam == 'es' else 0.0)
    y0 = H.y0(z) - 0.05
    CV.cuboid(m, 0, y0 + h / 2, z, w, h, l, pal['wall'], top='#5C3B21', rim=1.0)
    CV.cuboid(m, 0, y0 + h + 0.04, z, w + 0.12, 0.08, l + 0.12, pal['trim'], top='#5C3B21', rim=1.0)  # la moldura, con la tapa en tablas
    if lod: return
    n = max(2, round(l / 0.9)); win = '#FFE9A8'
    for side in (1, -1):
        for k in range(n):
            zz = z - l / 2 + (k + 0.5) * l / n
            CV.cuboid(m, side * (w / 2 + 0.01), y0 + 0.55 * h, zz, 0.04, 0.42 * h, 0.42, pal['trim'])
            CV.cuboid(m, side * (w / 2 + 0.03), y0 + 0.55 * h, zz, 0.03, 0.30 * h, 0.30, win)
    for k in range(max(1, round(w / 1.2))):
        xx = -w / 2 + (k + 0.5) * w / max(1, round(w / 1.2))
        CV.cuboid(m, xx, y0 + 0.55 * h, z + l / 2 + 0.02, 0.42, 0.42 * h, 0.04, pal['trim'])
        CV.cuboid(m, xx, y0 + 0.55 * h, z + l / 2 + 0.04, 0.30, 0.30 * h, 0.03, win)


def details(m, H, cls, fam, pal):
    c = CLASES[cls]; L, B, F = c['L'], c['B'], c['F']; s = B / 11.2  # escala frente al Navío
    dark, wood, iron = '#2A2018', '#6B4426', '#26282B'; gold = pal['trim']
    rec = rig_json(cls)['recipe']; masts = rec['masts']
    tops = [mt.get('topY') or (mt['gaff']['B'][1] if mt.get('gaff') else 0.62 * mt['h']) for mt in masts]
    nsh = 3 if L < 20 else (4 if L < 30 else 5)
    # mesas de guarnición a la altura de la regala y obenques hasta la cofa (o hasta la boca de la cangreja)
    for mt, top in zip(masts, tops):
        mz = mt['z']; yc = H.top(mz) - 0.3 * s; a = H.x_at(mz, yc); half = 0.07 * L
        for side in (1, -1):
            x0, x1 = side * a, side * (a + 0.7 * s)
            m.solid((x0, yc, mz - half), (x1, yc, mz - half), (x1, yc, mz + half), (x0, yc, mz + half), '#3A2618', 0.0)
            for k in range(nsh):
                zz = mz - 0.9 * half + 1.8 * half * k / (nsh - 1); p = np.array([side * (a + 0.6 * s), yc, zz]); q = np.array([side * 0.9 * s, top, mz])
                dv = q - p; dv /= np.linalg.norm(dv); n = np.cross(dv, [0, 0, 1]); n = n / (np.linalg.norm(n) + 1e-9) * max(0.03, 0.05 * s)
                m.solid(tuple(p - n), tuple(p + n), tuple(q + n), tuple(q - n), dark, 0.0)
    # estays: del tope de cada palo al palo de proa (el de proa, a la punta del bauprés) y brandales a la regala
    bs = rec['bowsprit']; tip = (0, 1.25 * F + 0.342 * (bs + 1), L / 2 - 1 + 0.94 * (bs + 1))
    order = sorted(range(len(masts)), key=lambda i: -masts[i]['z'])
    for j, i in enumerate(order):
        mz, mh = masts[i]['z'], masts[i]['h']
        to = tip if j == 0 else (0, tops[order[j - 1]], masts[order[j - 1]]['z'])
        CV.prism(m, (0, mh - 0.6, mz), to, max(0.03, 0.06 * s), 4, dark)
        zb = max(mz - 0.15 * L, -L / 2 + 1.0)
        for side in (1, -1): CV.prism(m, (side * 0.3 * s, mh - 1.0, mz), (side * (H.x_at(zb, H.top(zb)) + 0.2 * s), H.top(zb), zb), max(0.03, 0.05 * s), 4, dark)
    # botes sobre calzos, cabrestante, carronadas, timón, campana
    for bx, bz, Lb, Bb in c['boats']:
        NCV.NV.boat(m, bx, H.y0(bz) + 0.25 + 0.5 * Bb, bz, Lb, Bb, '#2A3550' if fam == 'gb' else '#5A3A22', '#4A3424', gold)
        for zz in (bz - 0.3 * Lb, bz + 0.3 * Lb): CV.cuboid(m, bx, H.y0(zz) + 0.25, zz, 0.75 * Bb, 0.5, 0.3, wood)
    if c['capstan'] is not None:
        zc = c['capstan']; yc = H.y0(zc); r_ = 0.6 * max(s, 0.6)
        CV.prism(m, (0, yc, zc), (0, yc + 1.1 * max(s, 0.7), zc), r_, 8, wood)
        for k in range(4):
            a = math.pi / 4 * k; e = 2.5 * r_
            CV.prism(m, (e * math.cos(a), yc + 0.85 * max(s, 0.7), zc + e * math.sin(a)), (-e * math.cos(a), yc + 0.85 * max(s, 0.7), zc - e * math.sin(a)), 0.06, 4, wood)
    for side in (1, -1):
        for zz in c['carronades']:
            h = H.deck_h(zz); yd_ = H.y0(zz) + h; half = H.x_at(zz, yd_ + 0.5) - H.tb
            CV.cuboid(m, side * (half - 0.8), yd_ + 0.2, zz, 0.8, 0.4, 0.9, '#5A3A22')
            CV.prism(m, (side * (half - 1.15), yd_ + 0.45, zz), (side * (half + 0.12), yd_ + 0.45, zz), 0.14, 6, iron)
    zw = c['wheel']; yw = H.y0(zw) + H.deck_h(zw) + 0.9 * max(s, 0.75); rw = 0.65 * max(s, 0.75)
    CV.prism(m, (-0.4 * max(s, 0.75), yw, zw), (0.4 * max(s, 0.75), yw, zw), rw, 8, wood)
    CV.cuboid(m, 0, (H.y0(zw) + H.deck_h(zw) + yw) / 2, zw, 0.25, yw - H.y0(zw) - H.deck_h(zw), 0.25, wood)
    if c['bell'] is not None:
        zb_ = c['bell']; yb_ = H.y0(zb_) + H.deck_h(zb_); CV.cuboid(m, 0, yb_ + 0.55, zb_, 0.9, 1.1, 0.7, wood, top=gold)
    # faroles de popa en el coronamiento (los españoles, más grandes)
    fs = (1.3 if fam == 'es' else 1.0) * max(0.6, s)
    xs = (0.0,) if c['lanterns'] == 1 else tuple(np.linspace(-2.4 * s, 2.4 * s, c['lanterns']))
    for lx in xs:
        zl = -L / 2 + 0.4; yt = H.top(zl); b0 = H.warp(lx, yt, zl); b1 = H.warp(lx, yt + 0.5 * fs, zl)
        CV.prism(m, b0, b1, 0.1, 4, wood)
        q = H.warp(lx, yt + 0.95 * fs, zl); CV.cuboid(m, q[0], q[1], q[2], 0.55 * fs, 0.9 * fs, 0.55 * fs, '#FFE9A8', top=gold)
    # tapas de porta abiertas en la franja (bisagra arriba, 55°; dentro, rojo)
    if c['lids']:
        vb, vt = c['band']; pw = 0.45 + 0.008 * L
        for z in rec['cannonZ']:
            ytop = (vb + vt) / 2 + 0.33 * (vt - vb) + H.sheer(z); x = H.x_at(z, ytop)
            for side in (1, -1):
                w2, lh, ang = pw / 2 + 0.04, 0.75 * (vt - vb), math.radians(55)
                h0 = (side * x, ytop, z - w2); h1 = (side * x, ytop, z + w2)
                e0 = (side * (x + lh * math.sin(ang)), ytop - lh * math.cos(ang), z - w2); e1 = (e0[0], e0[1], z + w2)
                m.solid(h0, h1, e1, e0, pal['lid_out'], 0.0)
                o2 = 0.03 * side; m.solid((h0[0] + o2, h0[1], h0[2]), (e0[0] + o2, e0[1], e0[2]), (e1[0] + o2, e1[1], e1[2]), (h1[0] + o2, h1[1], h1[2]), '#9E2B1E', 0.0)
    # mascarón: un apéndice, como el bauprés (fuera de la caja del casco de AS-V03), así que sin _RIM_MASK
    if c['figure']:
        k = F / 3.6; z = L / 2 - 0.4 * k; y = H.y0(z) - 0.4 * k
        m.solid((-0.3 * k, y - 1.2 * k, z), (0.3 * k, y - 1.2 * k, z), (0.3 * k, y, z + 1.0 * k), (-0.3 * k, y, z + 1.0 * k), gold, 0.0)
        m.solid((-0.3 * k, y, z + 1.0 * k), (0.3 * k, y, z + 1.0 * k), (0.25 * k, y + 0.8 * k, z + 1.3 * k), (-0.25 * k, y + 0.8 * k, z + 1.3 * k), gold, 0.0)


def emblem(m, sails):
    """La cruz de Borgoña (aspa roja) en las cuadras de la española, en las 2 caras, sobre la panza de la vela: la misma
    superficie que squareSail del generador (PlaneGeometry de nx × 3 con panza de 0,12·w hacia proa, 0,45 m a proa del
    palo y la braza de 20°), como NV.emblem del Navío."""
    red = CV.hexlin('#B3261E'); w_ = AT.white; brace = np.radians(20)
    for mz, w, h, yb in sails:
        nx = max(4, 2 * round(w / (2 * 0.55)))
        def bulge(uu, vv):
            zf = lambda i, j: 0.12 * w * math.sin(math.pi * i / nx) * math.sin(math.pi * (1 - j / 3))
            fx = min(uu * nx, nx - 1e-9); fy = min((1 - vv) * 3, 3 - 1e-9); i, j = int(fx), int(fy); fu, fw = fx - i, fy - j
            za, zb_, zc, zd = zf(i, j), zf(i, j + 1), zf(i + 1, j + 1), zf(i + 1, j)
            return za + fu * (zd - za) + fw * (zb_ - za) if fu + fw <= 1 else zc + (1 - fu) * (zb_ - zc) + (1 - fw) * (zd - zc)
        def P(uu, vv, off):
            x = (uu - 0.5) * w; y = (vv - 0.5) * h; zb = bulge(uu, vv) + off + 0.45
            X = x * math.cos(brace) + zb * math.sin(brace); Z = -x * math.sin(brace) + zb * math.cos(brace)
            return (X, yb + h / 2 + y, mz + Z)
        n = 24; bw = 0.07
        for off in (0.05, -0.05):
            for (u0, v0, u1, v1) in ((0.12, 0.08, 0.88, 0.92), (0.88, 0.08, 0.12, 0.92)):
                for i in range(n):
                    a0, a1 = i / n, (i + 1) / n
                    ua, va = u0 + (u1 - u0) * a0, v0 + (v1 - v0) * a0; ub, vb = u0 + (u1 - u0) * a1, v0 + (v1 - v0) * a1
                    q = [P(ua - bw / 2, va, off), P(ub - bw / 2, vb, off), P(ub + bw / 2, vb, off), P(ua + bw / 2, va, off)]
                    m.quad(*q, w_, w_, w_, w_, red, 0.0)


def ensign(m, H, cls, fam):
    """La bandera de la familia (región flag) colgada del pico de la cangreja de popa, hacia popa, en las 2 caras."""
    c = CLASES[cls]; rec = rig_json(cls)['recipe']
    aftm = min((mt for mt in rec['masts'] if mt.get('gaff')), key=lambda mt: mt['z'])
    pk = peak(aftm, rec['knifeOpen']); w = 2.0 + 0.04 * c['L']; h = 0.6 * w
    x, y, z = pk[0], pk[1] - 0.1, pk[2] - 0.4  # 0,4 m a popa del pico, para que no se cruce con la baluma
    for off in (0.02, -0.02):
        p = [(x + off, y, z), (x + off, y, z - w), (x + off, y - h, z - w), (x + off, y - h, z)]
        m.quad(*p, AT.uv('flag', 0, 0), AT.uv('flag', 1, 0), AT.uv('flag', 1, 1), AT.uv('flag', 0, 1), rim=0.0, bk=0)


# ---- atlas
def paint(cls, fam, seed=7):
    """El atlas de 1024² con la distribución del Navío (NCV.AT): costado con la franja y las portas de la clase, obra
    muerta de los castillos, molduras, tablazón, cubiertas, interior, mamparos, galerías, espejo de popa y bandera."""
    c = CLASES[cls]; L, F, RAIL, D = c['L'], c['F'], c['RAIL'], c['D']
    rng = random.Random(seed); pal = PAL[fam]; img = Image.new('RGB', (AT.A, AT.A), (255, 255, 255)); d = ImageDraw.Draw(img)
    Hc = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    H = hull_of(cls, fam); V_TOP, V_BOT = vrange(c, fam); rec = rig_json(cls)['recipe']
    x0, y0_, w, h = AT.R['hull']
    ry = lambda v: AT.px('hull', 0, (V_TOP - v) / (V_TOP - V_BOT))[1]
    rx = lambda z: AT.px('hull', (z + L / 2) / L, 0)[0]
    pxm = 1024 / L  # px por metro a lo largo
    d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['hull']))
    d.rectangle((x0, ry(0.0), x0 + w, y0_ + h), fill=Hc(pal['bottom']))
    vb, vt = c['band']; d.rectangle((x0, ry(vt), x0 + w, ry(vb)), fill=Hc(pal['band']))
    for v in (vt, vb): d.rectangle((x0, ry(v) - 2, x0 + w, ry(v) + 1), fill=Hc(pal['wale']))
    pw, ph = (0.45 + 0.008 * L) * pxm / 2, 0.65 * (ry(vb) - ry(vt)) / 2; cy = ry((vb + vt) / 2)
    for z in rec['cannonZ']:
        d.rectangle((rx(z) - pw, cy - ph, rx(z) + pw, cy + ph), fill=Hc(pal['port']))
        d.rectangle((rx(z) - pw - 1, cy - ph - 2, rx(z) + pw + 1, cy - ph), fill=Hc(pal['port_edge']))
    vr = F + RAIL
    for t in [t for t in H.tiers if t['kind'] == 'aft']:  # ventanas de la obra muerta del alcázar
        yb, yt = vr + t['h'] - 1.2, vr + t['h'] - 0.45
        for z in np.arange(-L / 2 + 0.9, t['edge'] - 0.6, 1.25):
            d.rectangle((rx(z) - 9, ry(yt) - 1, rx(z) + 9, ry(yb) + 1), fill=Hc(pal['trim']))
            d.rectangle((rx(z) - 7, ry(yt), rx(z) + 7, ry(yb)), fill=Hc(pal['window']))
    zz = np.linspace(-L / 2, L / 2, 600)
    for dv, wd in ((0.0, 4), (-0.32, 2)):  # moldura bajo la regala, siguiendo su curva
        d.line([(rx(z), ry(vr + H.rail_rise(z) + dv - 0.12)) for z in zz], fill=Hc(pal['trim']), width=wd)
    if fam == 'es':  # friso de volutas doradas en la moldura alta y tallas en la obra muerta de popa
        for z in np.arange(-L / 2, L / 2, 0.5):
            yy = ry(vr + H.rail_rise(z) - 0.3); d.ellipse((rx(z) - 3, yy - 3, rx(z) + 3, yy + 3), outline=Hc(pal['trim']))
        for k in range(int(10 * L)):
            z = rng.uniform(-L / 2, -0.25 * L); v = rng.uniform(vt + 0.1, vr + H.rail_rise(z)); r = rng.choice((1, 2))
            d.ellipse((rx(z) - r, ry(v) - r, rx(z) + r, ry(v) + r), fill=(235, 190, 80))
    else:  # filete blanco a media altura entre la franja y la regala
        d.line([(rx(z), ry(0.5 * (vt + vr + H.rail_rise(z)))) for z in zz], fill=Hc(pal['band']), width=2)
    arr = np.asarray(img).astype(float)  # tablazón cada 0,25 m con juntas a tope y un leve cambio de tono por tabla
    for v in np.arange(V_BOT, V_TOP, 0.25):
        a_, b_ = int(ry(v + 0.25)), int(ry(v)); xx = 0
        while xx < 1024:
            seg = rng.randint(70, 150); arr[a_:b_, xx:xx + seg] *= rng.uniform(0.95, 1.05); xx += seg
        arr[b_ - 1:b_, :] *= 0.86
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(img)
    d.line((x0, ry(0.02), x0 + w, ry(0.02)), fill=(230, 225, 210), width=2)
    tones = [(225, 177, 123), (189, 141, 89), (151, 107, 57)]  # cubiertas: tablas a lo largo de Z en 3 tonos (D62)
    for reg in ('deck', 'q0', 'q1', 'q2', 'fc'):
        x0, y0_, w, h = AT.R[reg]; n = max(6, int(h / 11)); perm = [0, 1, 2]
        for i in range(n):
            if i % 3 == 0: rng.shuffle(perm)
            ya, yb2 = y0_ + i * h / n, y0_ + (i + 1) * h / n
            d.rectangle((x0, ya, x0 + w, yb2), fill=tones[perm[i % 3]]); d.line((x0, yb2, x0 + w, yb2), fill=(110, 80, 50))
            xx = x0 + rng.randint(0, 40)
            while xx < x0 + w: d.line((xx, ya, xx, yb2), fill=(130, 95, 60)); xx += rng.randint(50, 110)
    aft = [t for t in H.tiers if t['kind'] == 'aft']; fore = [t for t in H.tiers if t['kind'] == 'fore']
    za = aft[0]['edge'] if aft else -L / 2; zb = fore[0]['edge'] if fore else L / 2
    x0, y0_, w, h = AT.R['deck']; zr = lambda z: x0 + (z - za) / (zb - za) * w; hw = 0.07 * L * w / (zb - za)
    for zc in c['hatches']:
        xa, xb = zr(zc) - hw, zr(zc) + hw; ya, yb2 = y0_ + 0.39 * h, y0_ + 0.61 * h
        d.rectangle((xa, ya, xb, yb2), fill=(80, 56, 34))
        for gx in np.arange(xa + 4, xb, 8): d.line((gx, ya, gx, yb2), fill=(140, 100, 60))
        for gy in np.arange(ya + 4, yb2, 8): d.line((xa, gy, xb, gy), fill=(140, 100, 60))
    x0, y0_, w, h = AT.R['inner']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['inner']))
    d.rectangle((x0, y0_, x0 + w, y0_ + 4), fill=Hc(pal['rail']))
    for k in range(4):
        x0, y0_, w, h = AT.R[f'bw{k}']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['wall']))
        d.rectangle((x0, y0_, x0 + w, y0_ + 5), fill=Hc(pal['trim']))
        for xx in range(x0 + 14, x0 + w - 10, 26):
            d.rectangle((xx, y0_ + 14, xx + 10, y0_ + h - 8), fill=Hc(pal['trim'])); d.rectangle((xx + 2, y0_ + 16, xx + 8, y0_ + h - 10), fill=(60, 40, 25))
    x0, y0_, w, h = AT.R['gal']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['wall']))
    for yy in (0.2, 0.55):
        d.rectangle((x0, y0_ + (yy - 0.06) * h, x0 + w, y0_ + (yy + 0.3) * h), fill=Hc(pal['trim']))
        for xx in np.arange(x0 + 6, x0 + w - 8, 18): d.rectangle((xx, y0_ + yy * h, xx + 11, y0_ + (yy + 0.24) * h), fill=Hc(pal['window']))
    # espejo de popa: una fila de ventanas por piso bajo el coronamiento, molduras y cartela; la española, tallas doradas
    x0, y0_, w, h = AT.R['stern']; ytop = H.top(-L / 2); ybot = -H.prof(-L / 2)[3] * D
    sy = lambda y: AT.px('stern', 0, (ytop - y) / (ytop - ybot))[1]; sx = lambda x: AT.px('stern', 0.5 + x / (2 * H.hb), 0)[0]
    d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['wall'])); d.rectangle((x0, sy(0), x0 + w, y0_ + h), fill=Hc(pal['bottom']))
    y_ = H.y0(-L / 2); wh = min(0.7, 0.3 * F); half = H.x_at(-L / 2, y_) * 0.78
    lv = [0.0] + [t['h'] for t in aft]
    rows_ = [(y_ - 0.35 * F, y_ - 0.35 * F + wh)] + [(y_ + v + 0.3, y_ + v + 0.3 + wh) for v in lv[1:] if y_ + v + 0.3 + wh < ytop - 0.2]
    for (ya, yb_) in rows_:
        d.rectangle((x0, sy(yb_ + 0.15), x0 + w, sy(ya - 0.15)), fill=Hc(pal['trim']))
        n = max(3, round(2 * half / 1.1)); step = 2 * half / n
        for k in range(n):
            xx = -half + (k + 0.5) * step; hwx = 0.3 * step
            d.rectangle((sx(xx - hwx), sy(yb_), sx(xx + hwx), sy(ya)), fill=Hc(pal['window'])); d.rectangle((sx(xx - hwx), sy(yb_), sx(xx + hwx), sy(ya)), outline=(70, 45, 20))
    cw = 0.18 * H.hb; d.ellipse((sx(-cw), sy(min(ytop - 0.15, y_ + 0.45)), sx(cw), sy(y_ - 0.1)), fill=Hc(pal['trim']), outline=(70, 45, 20))
    if fam == 'es':
        for k in range(int(8 * L)):
            xx = rng.uniform(-H.hb, H.hb); yy = rng.uniform(y_ - 0.35 * F, ytop - 0.1); r = rng.choice((1, 2))
            d.ellipse((sx(xx) - r, sy(yy) - r, sx(xx) + r, sy(yy) + r), fill=(235, 190, 80))
    x0, y0_, w, h = AT.R['flag']  # bandera: Union Jack (británica) o rojigualda (española), las de navio_curvo.paint
    if fam == 'gb':
        blue, red, white = (1, 33, 105), (200, 16, 46), (255, 255, 255)
        d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=blue)
        for (a0, b0, a1, b1) in ((0, 0, 1, 1), (1, 0, 0, 1)):
            d.line((x0 + a0 * w, y0_ + b0 * h, x0 + a1 * w, y0_ + b1 * h), fill=white, width=20)
            d.line((x0 + a0 * w, y0_ + b0 * h, x0 + a1 * w, y0_ + b1 * h), fill=red, width=7)
        d.rectangle((x0 + 0.42 * w, y0_, x0 + 0.58 * w, y0_ + h), fill=white); d.rectangle((x0, y0_ + 0.37 * h, x0 + w, y0_ + 0.63 * h), fill=white)
        d.rectangle((x0 + 0.455 * w, y0_, x0 + 0.545 * w, y0_ + h), fill=red); d.rectangle((x0, y0_ + 0.42 * h, x0 + w, y0_ + 0.58 * h), fill=red)
    else:
        d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=(170, 21, 27)); d.rectangle((x0, y0_ + 0.25 * h, x0 + w, y0_ + 0.75 * h), fill=(241, 191, 0))
    x0, y0_, w, h = AT.R['white']; d.rectangle((x0 - 4, y0_ - 4, x0 + w + 4, y0_ + h + 4), fill=(255, 255, 255))
    return img


if __name__ == '__main__':
    cls = sys.argv[1]; assert cls in CLASES, f'clase desconocida: {cls}'
    for fam in ('gb', 'es'):
        idf = f'{cls}_{fam}'; base = paint(cls, fam); base.save(os.path.join(OUT, f'atlas_{idf}_base.png'))
        ao = os.path.join(OUT, f'ao_{idf}.npy')
        if os.path.exists(ao):
            full = NCV.compose(base, ao, AT.R['white']); full.save(os.path.join(OUT, f'atlas_{idf}.png'))
            a = CLASES[cls]['A']; (full if a == AT.A else full.resize((a, a), Image.LANCZOS)).save(os.path.join(OUT, f'atlas_{idf}_out.png'))
            print(idf, 'atlas con oclusión', a)
        for lod in (0, 1):
            m, H = build(cls, fam, lod)
            np.savez(os.path.join(OUT, f'{idf}_lod{lod}.npz'), **m.arrays())
            print(idf, f'lod{lod}', m.ntri(), 'tris')

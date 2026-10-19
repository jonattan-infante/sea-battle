# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/canonera2_curvo.py
#   →  $UX_OUT/cadena/canonera2_lod{0,1}.npz, atlas_canonera2_base.png y, si existe ao_canonera2.npy (blender_curvo.py
#      canonera2 bake), atlas_canonera2.png con la oclusión horneada (ligero: segundos)
# No corre en la CI.
# La Cañonera rehecha tras la lámina de la cadena de arte (D91). Jonattan, 2026-10-18: «La cañonera esta mejor pero la parte
# trasera y las velas siguen tienendo una geometria incorrecta. Iteremos con esta inspiración» (la Pirate Gunboat de
# Anno 1800; la referencia tiene derechos y queda fuera del repo: se toma la dirección, no el dibujo). Lo que cambia:
#   - la popa: un alcázar elevado de 5 m con su mamparo, su barandilla, el timón y el farol, y un espejo casi vertical y
#     más estrecho (perfil `chato_popa`), con ventanas encendidas, tallas doradas y la calavera; en los costados del
#     alcázar, paneles tallados. El castillo de proa, bajo, con un bauprés de 6 m;
#   - las velas: 2 palos con velas al tercio altas y negras (amura, puño de driza, pico y escota, como la cangreja de
#     ASSET-SPEC §8.2, con la apertura de 25° de D12 y la panza de 0,08·|AD|), con las vergas muy inclinadas y el pico por
#     encima del tope, y un foque; la bandera pirata, en el pico de la mayor. Lona con los 3 tonos de la paleta pirata
#     (§8.2.1) en paños de 0,5 m pintados en el atlas, remiendos y, en la mayor, la calavera desvaída. Sin muescas: son la
#     seña del Pirata (ART-DIRECTION §10; D48);
#   - la batería sigue a la vista sobre cubierta (GDD §9: «casco ancho y bajo, batería de cañones visible»): 6 cañones por
#     banda sobre cureña, algo más juntos (z de −7,0 a +7,0) para dejar sitio al alcázar, y el mortero en el centro.
# Conserva L × B × F (28 × 10 × 1,5 m), el casco negro con la franja roja y la cubierta clara (media #907C61; D36).
import json, math, os, random, sys
HERE_S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE_S, '..', 'laminas')); sys.path.insert(0, HERE_S)
sys.dont_write_bytecode = True
import rutas as RT
import curvo as CV
import numpy as np
from PIL import Image, ImageDraw
OUT = os.path.join(RT.OUT, 'cadena'); os.makedirs(OUT, exist_ok=True)
L, B, F, D, RAIL = 28.0, 10.0, 1.5, 1.2, 0.9
V_TOP, V_BOT = 4.4, -1.4
# como `flat`, pero con la popa más estrecha y más arrufo en ella (el espejo de D91 era una caja ancha) y la proa más fina
CV.PROFILES['chato_popa'] = [(-0.5, 0.80, 0.64, 1.22, 0.4), (-0.4, 0.95, 0.88, 1.08, 0.8), (-0.25, 1.0, 0.97, 1.02, 1.0), (0.0, 1.0, 0.98, 1.0, 1.0),
                             (0.2, 0.99, 0.95, 1.01, 1.0), (0.36, 0.86, 0.76, 1.06, 0.9), (0.5, 0.36, 0.22, 1.16, 0.5)]
# el alcázar en 2 escalones (la popa alta y recta de la referencia) y un castillo de proa bajo
Q0 = dict(kind='aft', edge=-8.4, h=1.1, ramp=1.4); Q1 = dict(kind='aft', edge=-11.8, h=2.2, ramp=1.0); FC = dict(kind='fore', edge=10.8, h=0.55, ramp=2.0)
TIERS = [Q0, Q1, FC]
AT = CV.Atlas({'hull': (0, 0, 1024, 256), 'deck': (0, 256, 1024, 224), 'inner': (0, 480, 1024, 48),
               'q0': (0, 528, 256, 160), 'fc': (256, 528, 192, 160), 'stern': (448, 528, 256, 224), 'bow': (704, 528, 192, 160),
               'bw0': (896, 528, 128, 64), 'bw1': (896, 592, 128, 64), 'bw2': (896, 656, 128, 64), 'q1': (448, 752, 192, 128),
               'sail_main': (0, 688, 176, 336), 'sail_fore': (176, 688, 160, 288), 'jib': (336, 688, 112, 160), 'flag': (336, 864, 96, 64)})
PAL = dict(hull='#2A2523', band='#B3261E', bottom='#1C1817', rail='#3A2A20', inner='#4A2016', cannon='#232326', wood='#5A3A22',
           dark='#2A2018', gold='#B08A3A', gold_d='#6E5420', bone='#E8E2D0', glass='#FFD27A', panel='#3A302A')
SAIL = ('#4A494D', '#303033', '#171619')  # sail / sail.mid / sail.alt de la paleta pirata (ASSET-SPEC §8.2.1)
CANNON_Z = (-7.0, -4.2, -1.4, 1.4, 4.2, 7.0); MORTAR_Z = 3.5
MAIN_Z, FORE_Z = -2.6, 6.0; MAIN_TOP, FORE_TOP = 14.0, 12.4
OPEN = math.radians(25)  # apertura de las velas de cuchillo (D12), hacia estribor
BOW_END = (0.0, 19.6)    # punta del bauprés (z), 6 m por delante de la roda


def hull_of(): return CV.Hull(L, B, F, D, RAIL, 'chato_popa', y_m=0.6, T=0.07, tiers=TIERS, H_T=F + RAIL - 0.6, bulge=0.15, over=(0.42, 1.0, 0.03))


def taper(m, p, q, r0, r1, n, col, cap=False, rim=0.0):
    """Tronco de cono de n lados de p (radio r0) a q (r1); con cap, la tapa en p."""
    p, q = np.array(p, float), np.array(q, float); dv = q - p; dv /= np.linalg.norm(dv)
    a = np.cross(dv, [0, 1, 0]) if abs(dv[1]) < 0.9 else np.cross(dv, [1, 0, 0]); a /= np.linalg.norm(a); b = np.cross(dv, a)
    ring = lambda c, r: [c + r * (math.cos(2 * math.pi * i / n) * a + math.sin(2 * math.pi * i / n) * b) for i in range(n)]
    A, Bq = ring(p, r0), ring(q, r1)
    for i in range(n): m.solid(tuple(A[i]), tuple(A[(i + 1) % n]), tuple(Bq[(i + 1) % n]), tuple(Bq[i]), col, rim)
    if cap:
        w = m.at.white
        for i in range(1, n - 1): m.tri(tuple(A[0]), tuple(A[i + 1]), tuple(A[i]), w, w, w, col)


def line(m, p, q, w, col):
    """Cabo: cinta de w m de ancho, de cara a la cámara del juego (55°), en 2 triángulos."""
    p, q = np.array(p, float), np.array(q, float); dv = q - p; view = np.array([0, math.sin(math.radians(55)), math.cos(math.radians(55))])
    s = np.cross(dv, view); s = s / (np.linalg.norm(s) + 1e-9) * w / 2
    m.solid(tuple(p - s), tuple(q - s), tuple(q + s), tuple(p + s), col)


def sail_frame(z_m):
    """Plano de una vela de cuchillo abierta OPEN hacia estribor alrededor del palo: (z, y) del plano → (x, y, z)."""
    ca, sa = math.cos(OPEN), math.sin(OPEN)
    n = np.array([-ca, 0.0, sa])  # normal hacia sotavento (estribor)
    return (lambda z, y, off=0.0: np.array([-(z_m - z) * sa, y, z_m - (z_m - z) * ca]) + off * n), n


def sail(m, H, z_m, A, B_, C, D_, region, nu, nv, lod):
    """Parche bilineal (ASSET-SPEC §8.2, cangreja): A amura, B puño de driza, C pico, D escota, en (z, y); la panza
    0,08·|AD|·sin(πu)·sin(πv) hacia sotavento. UV: u de la relinga de gratil (A–B) a la baluma (D–C), v del pujamen a
    la verga."""
    P, n = sail_frame(z_m); A, B_, C, D_ = (np.array(v, float) for v in (A, B_, C, D_)); belly = 0.08 * np.linalg.norm(D_ - A)
    if lod == 1: nu, nv = 1, 1
    grid = [[None] * (nu + 1) for _ in range(nv + 1)]
    for j in range(nv + 1):
        v = j / nv
        for i in range(nu + 1):
            u_ = i / nu; zy = (1 - v) * ((1 - u_) * A + u_ * D_) + v * ((1 - u_) * B_ + u_ * C)
            off = belly * math.sin(math.pi * u_) * math.sin(math.pi * v) if lod == 0 else 0.0
            grid[j][i] = (tuple(P(zy[0], zy[1], off)), m.at.uv(region, u_, 1 - v))
    w = np.ones(3)
    for j in range(nv):
        for i in range(nu):
            (a, ta), (b, tb), (c, tc), (d, td) = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
            m.quad(a, b, c, d, ta, tb, tc, td, w, 0.0, 0)
    return P


SAILS = {  # (z, y) de amura, puño de driza, pico y escota; y sobre la flotación
    'main': (MAIN_Z, (MAIN_Z, 3.9), (MAIN_Z, 9.2), (MAIN_Z - 6.2, 18.0), (MAIN_Z - 8.2, 4.5)),
    'fore': (FORE_Z, (FORE_Z, 3.7), (FORE_Z, 7.8), (FORE_Z - 4.6, 14.6), (FORE_Z - 6.2, 4.1)),
}


def rigging(m, H, lod):
    dark, wood = PAL['dark'], '#4A3424'
    # palos (caída de 2° a popa), bauprés y, en LOD0, botavaras, vergas, obenques, estays y drizas
    for z_m, top, r in ((MAIN_Z, MAIN_TOP, 0.24), (FORE_Z, FORE_TOP, 0.21)):
        y0 = H.y0(z_m) - 0.2; zt = z_m - math.tan(math.radians(2)) * (top - y0)
        taper(m, (0, y0, z_m), (0, top, zt), r, 0.62 * r, 6 if lod == 0 else 4, wood)
    zs = 13.2; ys = H.top(zs) - 0.2
    taper(m, (0, ys, zs - 1.2), (0, ys + 1.6, BOW_END[1]), 0.2, 0.1, 6 if lod == 0 else 4, wood)
    for key, region, nu, nv in (('main', 'sail_main', 5, 6), ('fore', 'sail_fore', 4, 5)):  # ≤ 2 000 triángulos (NPC)
        z_m, A, B_, C, D_ = SAILS[key]
        P = sail(m, H, z_m, A, B_, C, D_, region, nu, nv, lod)
        if lod == 0:
            taper(m, P(A[0], A[1] - 0.15), P(D_[0], D_[1] - 0.15), 0.11, 0.08, 5, wood)   # botavara
            taper(m, P(B_[0], B_[1] + 0.1), P(C[0], C[1] + 0.1), 0.1, 0.06, 5, wood)       # verga (casi vertical)
            top = MAIN_TOP if key == 'main' else FORE_TOP
            line(m, P(C[0], C[1]), (0, top, z_m), 0.07, dark)                               # driza del pico
            line(m, P(D_[0], D_[1]), (-(H.x_at(D_[0], H.top(D_[0])) - 0.3), H.top(D_[0]), D_[0]), 0.06, dark)  # escota
            for side in (1, -1):  # 2 obenques por banda hasta la regala
                for dz in (-0.9, 0.9):
                    zz = z_m + dz; line(m, (0, 0.72 * top, z_m), (side * (H.x_at(zz, H.top(zz)) - 0.1), H.top(zz), zz), 0.06, dark)
    # foque: del tope del trinquete a la punta del bauprés, con la escota a estribor
    head = np.array([0.0, FORE_TOP - 0.3, FORE_Z]); tack = np.array([0.0, ys + 1.5, BOW_END[1] - 0.3]); clew = np.array([-1.6, 3.4, 10.2])
    if lod == 0:
        n_u, n_v = 4, 5
        G = [[head + (tack + (clew - tack) * (i / n_u) - head) * (1 - j / n_v) for i in range(n_u + 1)] for j in range(n_v + 1)]
        bel = np.array([-0.35, 0, 0])
        for j in range(n_v):
            for i in range(n_u):
                q = [G[j][i], G[j][i + 1], G[j + 1][i + 1], G[j + 1][i]]
                q = [p + bel * math.sin(math.pi * (1 - j / n_v)) * 0.5 for p in q[:2]] + [p + bel * math.sin(math.pi * (1 - (j + 1) / n_v)) * 0.5 for p in q[2:]]
                t = [m.at.uv('jib', i / n_u, j / n_v), m.at.uv('jib', (i + 1) / n_u, j / n_v), m.at.uv('jib', (i + 1) / n_u, (j + 1) / n_v), m.at.uv('jib', i / n_u, (j + 1) / n_v)]
                if j == n_v - 1: m.tri(tuple(q[0]), tuple(q[1]), tuple(q[2]), t[0], t[1], t[2], np.ones(3))
                else: m.quad(*[tuple(p) for p in q], *t, np.ones(3))
        line(m, (0, MAIN_TOP - 0.2, MAIN_Z), (0, 0.75 * FORE_TOP, FORE_Z), 0.07, dark)  # estay de la mayor
    else:
        m.tri(tuple(head), tuple(tack), tuple(clew), m.at.uv('jib', 0.5, 1), m.at.uv('jib', 0, 0), m.at.uv('jib', 1, 0), np.ones(3))
    # bandera pirata (1,75 × 1,14 m; ASSET-SPEC §8.4) en el pico de la mayor, hacia popa
    z_m, A, B_, C, D_ = SAILS['main']; Pm, _ = sail_frame(z_m); c = Pm(C[0], C[1] + 0.15)
    kf = L / 16; fw, fh = kf, kf * 0.65
    a, b, cc, d = c, c + np.array([0, 0, -fw]), c + np.array([0, -fh, -fw]), c + np.array([0, -fh, 0])
    m.quad(tuple(a), tuple(b), tuple(cc), tuple(d), m.at.uv('flag', 0, 0), m.at.uv('flag', 1, 0), m.at.uv('flag', 1, 1), m.at.uv('flag', 0, 1), np.ones(3))


def battery(m, H, lod):
    """6 cañones por banda sobre cureña (ASSET-SPEC §8.4: Cylinder(0,34, 0,40, 2,4, 6) con tapa, eje en X; cureña de
    1,0 × 0,5 × 1,4 apoyada en la cubierta) y el mortero (Cylinder(1,1, 1,3, 1,2, 8))."""
    if lod == 1: return
    for z in CANNON_Z:
        yd = H.y0(z) + H.deck_h(z)
        for side in (1, -1):
            xc = side * (H.x_at(z, yd) - 1.0)
            CV.cuboid(m, xc - side * 0.25, yd + 0.25, z, 1.0, 0.5, 1.4, PAL['rail'], rim=0.0)
            taper(m, (xc - side * 1.2, yd + 0.45, z), (xc + side * 1.2, yd + 0.45, z), 0.40, 0.34, 6, PAL['cannon'], cap=True)
    yd = H.y0(MORTAR_Z); taper(m, (0, yd, MORTAR_Z), (0, yd + 1.2, MORTAR_Z), 1.3, 1.1, 8, PAL['cannon'])
    w = m.at.white; cy = yd + 1.2; ring = [(1.1 * math.cos(2 * math.pi * i / 8), cy, MORTAR_Z + 1.1 * math.sin(2 * math.pi * i / 8)) for i in range(8)]
    for i in range(1, 7): m.tri(ring[0], ring[i], ring[i + 1], w, w, w, '#0E0E10')  # la boca, oscura


def details(m, H):
    wood, dark, iron = PAL['wood'], PAL['dark'], '#26282B'
    for (x, z) in ((1.8, 5.2), (-1.8, 5.2), (1.6, 1.8)): CV.barrel(m, x, H.y0(z) + 0.4, z, 0.38, 0.8, wood, '#1C1410')
    for z in (-5.6, 5.6):  # cajas de balas entre parejas de cañones
        for side in (1, -1):
            x = side * (H.x_at(z, H.y0(z)) - H.tb - 1.9); CV.cuboid(m, x, H.y0(z) + 0.15, z, 0.5, 0.3, 0.8, '#3A2618', top=iron)
    for (x, z) in ((-2.4, -6.6), (2.4, 9.6)): CV.prism(m, (x, H.y0(z) + 0.02, z), (x, H.y0(z) + 0.2, z), 0.45, 8, '#8A7A5A')
    # alcázar: barandilla del borde, timón, bitácora y el farol de popa en su pescante
    t = Q0; yq = lambda z: H.y0(z) + t['h']
    for q in (Q0, Q1):  # barandilla en el borde de cada escalón
        yh = H.y0(q['edge']) + q['h']; xh = H.x_at(q['edge'], yh) - H.tb
        CV.cuboid(m, 0, yh + 0.45, q['edge'] + 0.15, 2 * xh - 0.1, 0.9, 0.12, PAL['rail'], top=PAL['gold'], rim=1.0)
    zw = -10.0; yw = yq(zw) + 0.75; CV.prism(m, (-0.3, yw, zw), (0.3, yw, zw), 0.6, 8, wood)
    CV.cuboid(m, 0, yq(zw) + 0.35, zw, 0.3, 0.7, 0.3, wood)
    CV.cuboid(m, 0, yq(-10.9) + 0.4, -10.9, 0.5, 0.8, 0.5, '#4A3424', top=PAL['gold'])
    yt = H.top(-13.8)  # el farol, colgado de un pescante sobre el espejo (como en la referencia)
    p0 = H.warp(0, yt, -13.8); p1 = H.warp(0, yt + 1.2, -14.6)
    CV.prism(m, p0, p1, 0.07, 4, dark); c = np.array(p1) + np.array([0, -0.45, -0.1])
    CV.cuboid(m, c[0], c[1], c[2], 0.45, 0.6, 0.45, PAL['glass'], top=dark)
    # castillo de proa: barandilla y un rollo de cabo; rollos de cabo junto a los palos
    f = FC; yf = H.y0(f['edge']) + f['h']; xf = H.x_at(f['edge'], yf) - H.tb
    CV.cuboid(m, 0, yf + 0.4, f['edge'] - 0.15, 2 * xf - 0.1, 0.8, 0.12, PAL['rail'], rim=1.0)
    for (x, z) in ((1.0, MAIN_Z + 1.2), (-1.4, FORE_Z + 1.0)): CV.prism(m, (x, H.y0(z) + 0.02, z), (x, H.y0(z) + 0.16, z), 0.42, 8, '#8A7A5A')


def build(lod):
    H = hull_of(); m = CV.Mesh(AT); t, f = Q0, FC
    zs = H.stations(21) if lod == 0 else H.stations(7, fr=(0.0, 1.0))
    secs = CV.build_hull(m, H, zs, 2, 2 if lod == 0 else 1, V_TOP, V_BOT, PAL['rail'])
    CV.build_stern(m, H, secs[0], 4 if lod == 0 else 2)
    CV.build_stern(m, H, secs[-1], 4 if lod == 0 else 2, region='bow', aft=False)
    CV.build_deck(m, H, zs, 'deck', t['edge'], f['edge'], 0.0, 10.4)
    CV.build_deck(m, H, zs, 'q0', Q1['edge'], Q0['edge'], Q0['h'], 10.4)
    CV.build_deck(m, H, zs, 'q1', -L / 2, Q1['edge'], Q1['h'], 10.4)
    CV.build_deck(m, H, zs, 'fc', f['edge'], L / 2, f['h'], 10.4)
    CV.build_wall(m, H, 'bw0', Q0['edge'], 0.0, Q0['h'], +1, ncol=4 if lod == 0 else 2)
    CV.build_wall(m, H, 'bw2', Q1['edge'], Q0['h'], Q1['h'], +1, ncol=4 if lod == 0 else 2)
    CV.build_wall(m, H, 'bw1', f['edge'], 0.0, f['h'], -1, ncol=4 if lod == 0 else 2)
    battery(m, H, lod)
    if lod == 0: details(m, H)
    rigging(m, H, lod)
    return m, H


def cloths(d, region, rng, n_cols, rot=0.0):
    """Paños de 3 tonos (bolsas barajadas de §8.2.1: dos vecinos nunca comparten tono) con costuras y remiendos."""
    x0, y0_, w, h = AT.R[region]; Hc = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5)); last = None; order = []
    while len(order) < n_cols:
        perms = [p for p in ((0, 1, 2), (0, 2, 1), (1, 0, 2), (1, 2, 0), (2, 0, 1), (2, 1, 0)) if p[0] != last]
        p = rng.choice(perms); order += list(p); last = p[-1]
    for i in range(n_cols):
        xa, xb = x0 + w * i / n_cols, x0 + w * (i + 1) / n_cols
        d.rectangle((xa, y0_, xb, y0_ + h), fill=Hc(SAIL[order[i]])); d.line((xa, y0_, xa, y0_ + h), fill=(12, 12, 13), width=1)
    for k in range(int(n_cols * 0.6)):  # remiendos, más claros o más oscuros que el paño
        px, py = rng.uniform(x0 + 6, x0 + w - 22), rng.uniform(y0_ + 6, y0_ + h - 26); pw, ph = rng.uniform(8, 20), rng.uniform(10, 26)
        f = rng.choice([1.25, 0.7]); base = np.array(Hc(SAIL[rng.randint(0, 2)]), float) * f
        d.rectangle((px, py, px + pw, py + ph), fill=tuple(int(min(255, c)) for c in base), outline=(10, 10, 11))
    for k in (0.35, 0.62):  # 2 fajas de rizos, apenas marcadas
        y = y0_ + h * (1 - k); d.line((x0, y, x0 + w, y), fill=(20, 20, 22), width=2)
    d.rectangle((x0, y0_, x0 + w - 1, y0_ + h - 1), outline=(88, 86, 90), width=2)  # relinga, más clara


def skull(d, cx, cy, s, col, width=None):
    width = width or max(2, int(s * 0.2))
    for a0, a1 in ((-1, 1), (1, -1)): d.line((cx - s * 1.1, cy + s * 0.2 * a0 + s * 0.95, cx + s * 1.1, cy + s * 0.2 * a1 + s * 0.95), fill=col, width=width)
    d.ellipse((cx - s * 0.55, cy - s * 0.6, cx + s * 0.55, cy + s * 0.45), fill=col)
    d.rectangle((cx - s * 0.32, cy + s * 0.3, cx + s * 0.32, cy + s * 0.62), fill=col)
    for ex in (-0.22, 0.22): d.ellipse((cx + s * ex - s * 0.14, cy - s * 0.18, cx + s * ex + s * 0.14, cy + s * 0.1), fill=(20, 16, 14))


def carved_panel(d, x0, y0, x1, y1, rng):
    """Panel tallado: marco dorado, fondo de madera y una voluta (2 arcos y un rombo)."""
    g, gd, pn = (176, 138, 58), (110, 84, 32), (58, 48, 42)
    d.rectangle((x0, y0, x1, y1), fill=pn, outline=g, width=2)
    cx, cy, w, h = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    d.arc((x0 + w * 0.12, y0 + h * 0.2, cx, y1 - h * 0.2), 200, 340, fill=g, width=2)
    d.arc((cx, y0 + h * 0.2, x1 - w * 0.12, y1 - h * 0.2), 200, 340, fill=g, width=2)
    d.polygon([(cx, y0 + h * 0.22), (cx + w * 0.07, cy), (cx, y1 - h * 0.22), (cx - w * 0.07, cy)], fill=gd, outline=g)


def paint(seed=23):
    rng = random.Random(seed); A = AT.A; img = Image.new('RGB', (A, A), (255, 255, 255)); d = ImageDraw.Draw(img)
    Hc = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    H = hull_of(); t = Q0
    # costado: tablazón gastada, franja roja descascarillada, imbornales, óxido bajo los cañones, moldura dorada bajo la
    # regala y, en el alcázar, los paneles tallados con 2 ventanas
    x0, y0_, w, h = AT.R['hull']
    ry = lambda v: AT.px('hull', 0, (V_TOP - v) / (V_TOP - V_BOT))[1]
    rx = lambda z: AT.px('hull', (z + L / 2) / L, 0)[0]
    d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(PAL['hull'])); d.rectangle((x0, ry(0.0), x0 + w, y0_ + h), fill=Hc(PAL['bottom']))
    arr = np.asarray(img).astype(float)
    for v in np.arange(V_BOT, V_TOP, 0.2):
        a_, b_ = int(ry(v + 0.2)), int(ry(v)); xx = 0
        while xx < A:
            seg = rng.randint(50, 130); f = 1.7 if rng.random() < 0.06 else rng.uniform(0.85, 1.18)
            arr[a_:b_, xx:xx + seg] *= f; arr[a_:b_, xx:xx + 1] *= 0.6; xx += seg
        arr[b_ - 1:b_, :] *= 0.7
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(img)
    vb, vt = F - 0.55 * F, F - 0.30 * F
    d.rectangle((x0, ry(vt), x0 + w, ry(vb)), fill=Hc(PAL['band']))
    for xx in range(0, A, 3):
        for v, sgn in ((vt, 1), (vb, -1)):
            if rng.random() < 0.45:
                k = rng.randint(1, 5); y = ry(v); d.rectangle((xx, min(y, y + sgn * k), xx + rng.randint(1, 5), max(y, y + sgn * k)), fill=Hc(PAL['hull']))
    for k in range(120):
        xx = rng.uniform(0, A); yy = rng.uniform(ry(vt) + 3, ry(vb) - 3); r = rng.uniform(1.5, 3.5)
        d.ellipse((xx - r, yy - r * 0.6, xx + r, yy + r * 0.6), fill=(70, 30, 26))
    for z in CANNON_Z:
        for k in range(9):
            xx = rx(z) + rng.uniform(-9, 9); y = ry(F + 0.1); d.line((xx, y, xx + rng.uniform(-2, 2), y + rng.uniform(14, 34)), fill=(112, 54, 30), width=2)
    for z in np.arange(-8.0, 10.5, 2.0):
        y = ry(F + 0.05); d.rectangle((rx(z) - 4, y - 3, rx(z) + 4, y + 2), fill=(12, 10, 9))
        d.line((rx(z), y + 2, rx(z) + rng.uniform(-2, 2), y + rng.uniform(10, 22)), fill=(58, 52, 46), width=2)
    d.line((x0, ry(F + RAIL - 0.05), x0 + w, ry(F + RAIL - 0.05)), fill=Hc(PAL['gold_d']), width=3)   # moldura bajo la regala
    d.line((x0, ry(F + RAIL - 0.12), x0 + w, ry(F + RAIL - 0.12)), fill=Hc(PAL['gold']), width=2)
    za, zb = -L / 2 + 0.4, t['edge'] - 0.6; ya, yb = F + RAIL + 0.15, F + RAIL + t['h'] - 0.15
    n = 4
    for i in range(n):
        z0, z1 = za + (zb - za) * i / n + 0.12, za + (zb - za) * (i + 1) / n - 0.12
        if i in (0, 2):
            d.rectangle((rx(z0), ry(yb), rx(z1), ry(ya)), fill=Hc(PAL['panel']), outline=Hc(PAL['gold']), width=2)
            cx, cy = (rx(z0) + rx(z1)) / 2, (ry(yb) + ry(ya)) / 2; ww, hh = (rx(z1) - rx(z0)) * 0.3, (ry(ya) - ry(yb)) * 0.32
            d.rectangle((cx - ww, cy - hh, cx + ww, cy + hh), fill=Hc(PAL['glass']), outline=Hc(PAL['gold_d']), width=2)
            d.line((cx, cy - hh, cx, cy + hh), fill=Hc(PAL['gold_d']), width=1)
        else: carved_panel(d, rx(z0), ry(yb), rx(z1), ry(ya), rng)
    za2, zb2 = -L / 2 + 0.4, Q1['edge'] - 0.4; ya2, yb2_ = F + RAIL + Q0['h'] + 0.1, F + RAIL + Q1['h'] - 0.15
    for i in range(2):
        z0, z1 = za2 + (zb2 - za2) * i / 2 + 0.1, za2 + (zb2 - za2) * (i + 1) / 2 - 0.1
        d.rectangle((rx(z0), ry(yb2_), rx(z1), ry(ya2)), fill=Hc(PAL['panel']), outline=Hc(PAL['gold']), width=2)
        cx, cy = (rx(z0) + rx(z1)) / 2, (ry(yb2_) + ry(ya2)) / 2; ww, hh = (rx(z1) - rx(z0)) * 0.22, (ry(ya2) - ry(yb2_)) * 0.3
        d.rectangle((cx - ww, cy - hh, cx + ww, cy + hh), fill=Hc(PAL['glass']), outline=Hc(PAL['gold_d']), width=2)
    for q in (Q0, Q1): d.line((x0, ry(F + RAIL + q['h'] - 0.05), rx(q['edge']), ry(F + RAIL + q['h'] - 0.05)), fill=Hc(PAL['gold']), width=2)
    d.line((x0, ry(0.03), x0 + w, ry(0.03)), fill=(70, 66, 58), width=3)
    for k in range(220): xx = rng.uniform(0, A); d.line((xx, ry(0.15), xx, ry(0.15) + rng.uniform(3, 9)), fill=(60, 70, 58))
    # cubiertas claras (D36: 2 tonos alternos, media #907C61): tablas de 0,5 m, juntas, manchas y la quemadura del mortero
    tones = [Hc('#A28D72'), Hc('#7E6B51')]
    for reg in ('deck', 'q0', 'q1', 'fc'):
        x0, y0_, w, h = AT.R[reg]; n = 20
        for i in range(n):
            ya, yb2 = y0_ + i * h / n, y0_ + (i + 1) * h / n
            d.rectangle((x0, ya, x0 + w, yb2), fill=tones[i % 2]); d.line((x0, yb2, x0 + w, yb2), fill=(70, 56, 40))
            xx = x0 + rng.randint(0, 40)
            while xx < x0 + w: d.line((xx, ya, xx, yb2), fill=(92, 76, 56)); xx += rng.randint(40, 120)
    arr = np.asarray(img).astype(float); x0, y0_, w, h = AT.R['deck']
    dz = lambda z: x0 + (z - t['edge']) / (FC['edge'] - t['edge']) * w; dx = lambda x: y0_ + (0.5 - x / 10.4) * h
    yy, xx = np.mgrid[0:A, 0:A]
    for k in range(22):
        cx, cy, r = rng.uniform(x0, x0 + w), rng.uniform(y0_, y0_ + h), rng.uniform(6, 16)
        mk = ((xx - cx) ** 2 / r ** 2 + (yy - cy) ** 2 / (0.6 * r) ** 2) < 1; arr[mk] *= 0.82
    cx, cy = dz(MORTAR_Z), dx(0.0); rr = np.hypot(xx - cx, yy - cy)
    burn = np.clip(1 - (rr - 46) / 40, 0, 1) * ((yy >= y0_) & (yy < y0_ + h)); arr *= (1 - 0.45 * burn)[..., None]
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(img)
    for zc in (-5.6, 9.0):  # escotillas con enjaretado
        xa, xb = dz(zc - 0.9), dz(zc + 0.9); ya, yb2 = dx(0.9), dx(-0.9)
        d.rectangle((xa, ya, xb, yb2), fill=(60, 44, 30))
        for gx in np.arange(xa + 4, xb, 9): d.line((gx, ya, gx, yb2), fill=(120, 96, 66), width=2)
        for gy in np.arange(ya + 4, yb2, 9): d.line((xa, gy, xb, gy), fill=(120, 96, 66), width=2)
    # interior de la borda; mamparo del alcázar con la puerta y 2 ventanas; mamparo del castillo, liso
    x0, y0_, w, h = AT.R['inner']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(PAL['inner'])); d.rectangle((x0, y0_, x0 + w, y0_ + 4), fill=Hc(PAL['rail']))
    for reg, door in (('bw0', True), ('bw2', True), ('bw1', False)):
        x0, y0_, w, h = AT.R[reg]; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(PAL['panel']))
        for xx in range(x0, x0 + w, 9): d.line((xx, y0_, xx, y0_ + h), fill=(40, 32, 28))
        if door:
            cx = x0 + w / 2; d.rectangle((cx - 9, y0_ + 14, cx + 9, y0_ + h), fill=(28, 20, 16), outline=Hc(PAL['gold']), width=2)
            for ex in (-0.3, 0.3): d.rectangle((cx + w * ex - 7, y0_ + 18, cx + w * ex + 7, y0_ + 34), fill=Hc(PAL['glass']), outline=Hc(PAL['gold_d']))
        d.rectangle((x0, y0_, x0 + w, y0_ + 4), fill=Hc(PAL['gold_d']))
    # espejo: ventanas encendidas bajo un friso tallado, la calavera y la franja; la proa, con su voluta
    for reg in ('stern', 'bow'):
        x0, y0_, w, h = AT.R[reg]; zend = -L / 2 if reg == 'stern' else L / 2
        ytop = H.top(zend); ybot = -H.prof(zend)[3] * D
        sy = lambda y: AT.px(reg, 0, (ytop - y) / (ytop - ybot))[1]; sx = lambda x: AT.px(reg, 0.5 + x / (2 * H.hb), 0)[0]
        d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(PAL['hull'])); d.rectangle((x0, sy(0), x0 + w, y0_ + h), fill=Hc(PAL['bottom']))
        y_ = H.y0(zend); d.rectangle((x0, sy(y_ - 0.30 * F), x0 + w, sy(y_ - 0.55 * F)), fill=Hc(PAL['band']))
        for yv in np.arange(ybot, ytop, 0.2): d.line((x0, sy(yv), x0 + w, sy(yv)), fill=(22, 18, 16))
        if reg == 'stern':
            # de abajo arriba: la franja, las ventanas de la cámara (bajo el alcázar) y la borda del alcázar con el panel tallado
            # y la calavera en su centro
            yw0, yw1 = y_ + 0.85, y_ + 1.65; yp0 = y_ + 1.8
            carved_panel(d, sx(-3.0), sy(ytop - 0.08), sx(3.0), sy(yp0), rng)
            for xc in (-1.9, 0.0, 1.9):
                d.rectangle((sx(xc - 0.55), sy(yw1), sx(xc + 0.55), sy(yw0)), fill=Hc(PAL['glass']), outline=Hc(PAL['gold']), width=3)
                d.line((sx(xc), sy(yw1), sx(xc), sy(yw0)), fill=Hc(PAL['gold_d']), width=2)
            skull(d, sx(0), sy((ytop + yp0) / 2 + 0.12), (sy(yp0) - sy(ytop)) * 0.32, Hc(PAL['bone']))
        else:
            for sgn in (-1, 1): d.arc((sx(sgn * 0.2 - 0.9), sy(y_ + 0.9), sx(sgn * 0.2 + 0.9), sy(y_ + 0.1)), 0, 360, fill=Hc(PAL['gold']), width=2)
    # velas: paños de 0,5 m en los 3 tonos, remiendos y, en la mayor, la calavera desvaída; el foque, igual; la bandera
    for reg, chord in (('sail_main', 8.2), ('sail_fore', 6.2), ('jib', 5.0)):
        cloths(d, reg, rng, max(6, int(round(chord / 0.5))))
    x0, y0_, w, h = AT.R['sail_main']; layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); dl = ImageDraw.Draw(layer)
    skull(dl, x0 + w * 0.52, y0_ + h * 0.36, w * 0.24, (206, 198, 178, 150), width=max(3, int(w * 0.05)))
    img = Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB'); d = ImageDraw.Draw(img)
    x0, y0_, w, h = AT.R['flag']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=(17, 17, 17))
    s = 0.32 * w; d.rectangle((x0 + w / 2 - s / 2, y0_ + h / 2 - s / 2, x0 + w / 2 + s / 2, y0_ + h / 2 + s / 2), fill=(245, 241, 230))
    x0, y0_, w, h = AT.R['white']; d.rectangle((x0 - 4, y0_ - 4, x0 + w + 4, y0_ + h + 4), fill=(255, 255, 255))
    return img


if __name__ == '__main__':
    import navio_curvo as NC  # compose(): el mismo atlas × oclusión que los Navíos
    base = paint(); base.save(os.path.join(OUT, 'atlas_canonera2_base.png'))
    ao = os.path.join(OUT, 'ao_canonera2.npy')
    if os.path.exists(ao): NC.compose(base, ao, AT.R['white']).save(os.path.join(OUT, 'atlas_canonera2.png')); print('atlas con oclusión')
    for lod in (0, 1):
        m, H = build(lod)
        np.savez(os.path.join(OUT, f'canonera2_lod{lod}.npz'), **m.arrays())
        print(f'lod{lod}', m.ntri(), 'tris')

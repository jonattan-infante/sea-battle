# Uso: lo importan lamina_islas.py y lamina_puerto.py (scripts/ux/laminas). No corre en la CI.
# Recetas de ASSET-SPEC §9.1–9.5 (islas por arquetipo y puerto de la 1.1) para las láminas. La semilla es la de Python
# (random.Random(id)), no el hash(id) del juego: el jitter es ilustrativo; las medidas, las de la spec.
import math, random
import numpy as np
import escena as E
from escena import jsround
FORMS = [  # GDD §4: id, arquetipo, variante, x, z, r
    ('PORT', 'port', None, 0, 0, 30), ('I1', 'tropical', None, 260, 200, 45), ('I2', 'rocky', 'stack', -300, 170, 35),
    ('I3', 'rocky', 'volcano', -220, -280, 55), ('I4', 'rocky', 'cliff', 250, -260, 40), ('I5', 'tropical', None, 20, 360, 30),
    ('I6', 'tropical', None, -410, -30, 28), ('T1', 'tropical', 'village', 150, -150, 22), ('T2', 'tropical', 'village', -170, 150, 22),
    ('E1a', 'reef', None, 140, 260, 7), ('E1b', 'reef', None, 117.5, 299, 7), ('E1c', 'reef', None, 162.5, 299, 7),
    ('G1', 'pirate_cove', None, 368, -368, 20), ('G2', 'pirate_cove', None, -368, -368, 20), ('G3', 'pirate_cove', None, -368, 368, 20),
    ('G4', 'pirate_cove', None, 368, 368, 20)]
def to_port(x, z):
    """Rumbo local (rad) hacia el puerto: rot_y(a) lleva el +Z local hacia (0, 0)."""
    return math.atan2(-x, -z) if (x or z) else 0.0
# --- §9.1
def beach(g, r, rnd):
    n = min(max(jsround(r / 2.5), 12), 24)
    f = [(1 - 0.06 * rnd()) / 0.9486 for _ in range(n)]
    bot = [(r * f[i] * math.sin(2 * math.pi * i / n), -0.6, r * f[i] * math.cos(2 * math.pi * i / n)) for i in range(n)]
    top = [(0.88 * r * f[i] * math.sin(2 * math.pi * i / n), 0.8, 0.88 * r * f[i] * math.cos(2 * math.pi * i / n)) for i in range(n)]
    E.prism(g, bot, top, 'sand.wet', 'sand'); return n
def plateau(g, r, rnd, n, rb=0.74, rt=0.62, k='grass'):
    a, d = 2 * math.pi * rnd(), 0.08 * r * rnd(); cx, cz = d * math.sin(a), d * math.cos(a)
    j = [1 + 0.08 * (2 * rnd() - 1) for _ in range(n)]
    bot = [(cx + rb * r * j[i] * math.sin(2 * math.pi * i / n), 0.8, cz + rb * r * j[i] * math.cos(2 * math.pi * i / n)) for i in range(n)]
    top = [(cx + rt * r * j[i] * math.sin(2 * math.pi * i / n), 1.8, cz + rt * r * j[i] * math.cos(2 * math.pi * i / n)) for i in range(n)]
    E.prism(g, bot, top, k, k); return cx, cz
def ground(r, d, rb=0.74, rt=0.62):
    if d <= rt * r: return 1.8
    if d <= rb * r: return 1.8 - (d - rt * r) / ((rb - rt) * r)
    return 0.8
def rocks(g, r, rnd):
    for i in range(jsround(r / 9)):
        rr = 1.2 + 1.6 * rnd(); a = 2 * math.pi * rnd()
        E.dodeca(g, rr, (r - rr) * math.sin(a), 0.2, (r - rr) * math.cos(a), 'rock' if i % 2 == 0 else 'rock.dark', 6.28 * rnd(), 6.28 * rnd())
def bushes(g, r, rnd, cx, cz, rt=0.62, k2=('grass.dark', 'grass')):
    for i in range(jsround(r / 5)):
        s = 1.0 + 0.8 * rnd(); a = 2 * math.pi * rnd(); d = (rt * r - s - 1) * math.sqrt(rnd())
        E.ico(g, s, cx + d * math.sin(a), 1.8, cz + d * math.cos(a), 0.6, k2[i % 2], 6.28 * rnd())
def palms(g, r, rnd, count, lo=0.6, hi=0.85, sector=None, gfun=None):
    for i in range(count):
        a = 2 * math.pi * rnd() if sector is None else sector[0] + (sector[1] - sector[0]) * rnd()
        d = (lo + (hi - lo) * rnd()) * r; x, z = d * math.sin(a), d * math.cos(a)
        y = (gfun or (lambda dd: ground(r, dd)))(d)
        E.palm(g, x, y, z, 6.28 * rnd(), 0.85 + 0.35 * rnd())
def tropical(g, r, rnd, hill=True):
    n = beach(g, r, rnd); cx, cz = plateau(g, r, rnd, n - 2)
    if hill and r >= 35: E.cone(g, 0.38 * r, 0.22 * r, 9, cx, 1.8, cz, 'grass.dark', 'rock.dark')
    rocks(g, r, rnd); bushes(g, r, rnd, cx, cz); palms(g, r, rnd, jsround(r / 6))
    return cx, cz
# --- §9.4
def village(g, r, rnd, a_port):
    cx, cz = tropical(g, r, rnd, hill=False)
    a0 = a_port + math.radians(60)
    for k, da in enumerate((0, 115, 240)):
        a = a0 + math.radians(da + 10 * (2 * rnd() - 1))
        E.hut(g, 0.35 * r * math.sin(a), 1.8, 0.35 * r * math.cos(a))
    # embarcadero hacia el puerto, de 0,70·r a 0,99·r, a y = 1,0 sobre 3 postes (como los muelles de §9.2)
    L = 0.29 * r; dm = (0.70 + 0.99) / 2 * r
    E.box(g, 2.0, 0.3, L, dm * math.sin(a_port), 1.0, dm * math.cos(a_port), a_port, 'palm.trunk')
    for t in (0.72, 0.85, 0.97):
        E.cyl(g, 0.2, 0.2, 1.6, 5, t * r * math.sin(a_port), -0.6, t * r * math.cos(a_port), 'palm.trunk', 'palm.trunk')
    # secadero de redes: la spec no fija dónde; aquí, en la playa a 35° del embarcadero
    a = a_port + math.radians(35); d = 0.8 * r; x, z = d * math.sin(a), d * math.cos(a); t = a + math.pi / 2
    p1 = np.array([x - 1.5 * math.sin(t), 0.8, z - 1.5 * math.cos(t)]); p2 = np.array([x + 1.5 * math.sin(t), 0.8, z + 1.5 * math.cos(t)])
    E.spar(g, p1, p1 + [0, 2, 0], 0.08, 4, 'palm.trunk'); E.spar(g, p2, p2 + [0, 2, 0], 0.08, 4, 'palm.trunk')
    E.spar(g, p1 + [0, 2, 0], p2 + [0, 2, 0], 0.07, 4, 'palm.trunk')
    E.flag(g, *(p1 + [0, 1.95, 0]), 3.0, 1.4, t, 'net')
def stack(g, r, rnd):
    beach(g, r, rnd); n = 9; zc = -0.2 * r
    bot = E.ring_pts(0.78 * r, n, -0.6, 0, zc)
    top = []
    for i, (x, y, z) in enumerate(E.ring_pts(0.62 * r, n, 9.9, 0, zc)):
        j = 1 - 0.08 * rnd(); top.append((x * j, 9.9, zc + (z - zc) * j))
    E.prism(g, bot, top, 'rock.cliff', 'rock.dark')
    for i in range(3 + int(3 * rnd())):
        a = 2 * math.pi * rnd(); d = 0.4 * r * math.sqrt(rnd())
        E.ico(g, 1.4, d * math.sin(a), 9.9, zc + d * math.cos(a), 0.5, 'grass.dark', 6.28 * rnd())
def volcano(g, r, rnd):
    n = beach(g, r, rnd); cx, cz = plateau(g, r, rnd, n - 2, rb=0.88, k='grass.dark')
    R0, H = 0.55 * r, 0.30 * r; y0 = 1.8
    rad = lambda y: R0 * (1 - (y - y0) / H)
    yA, yB = 15.8 - 3.0, 15.8
    E.prism(g, E.ring_pts(R0, 11, y0, cx, cz), E.ring_pts(rad(yA), 11, yA, cx, cz), 'rock.dark', None)
    E.prism(g, E.ring_pts(rad(yA), 11, yA, cx, cz), E.ring_pts(rad(yB), 11, yB, cx, cz), 'rock.cliff', None)
    # boca: anillo de la cima hasta el cráter, y el cráter (cilindro invertido de 0,06·r a 0,04·r, 1,2 m)
    E.prism(g, E.ring_pts(rad(yB), 11, yB, cx, cz), E.ring_pts(0.06 * r, 11, yB, cx, cz), 'rock.cliff', None)
    E.prism(g, E.ring_pts(0.06 * r, 11, yB, cx, cz), E.ring_pts(0.04 * r, 11, yB - 1.2, cx, cz), 'rock.cliff', 'rock.cliff')
    rocks(g, r, rnd)
    palms(g, r, rnd, 4 + int(3 * rnd()), 0.66, 0.84, (math.radians(-45), math.radians(45)), lambda d: ground(r, d, 0.88, 0.62))
def cliff(g, r, rnd):
    """Meseta inclinada de 12 lados (9,0 m al sur, 2,0 al norte) con una cala de arena de 60° al este, a +0,8 m."""
    yt = lambda z: 2 + 7 * (z + r) / (2 * r)
    ang = [math.radians(a) for a in range(120, 361, 30)] + [math.radians(30), math.radians(60)]  # el arco sin la cala
    inner = [math.radians(a) for a in (60, 75, 90, 105, 120)]  # pared de la cala; su fondo no lo fija la spec: 0,65·r
    out_b = [(0.97 * r * math.sin(a), -0.6, 0.97 * r * math.cos(a)) for a in ang]
    out_t = [(0.94 * r * math.sin(a), yt(0.94 * r * math.cos(a)), 0.94 * r * math.cos(a)) for a in ang]
    in_b = [(0.65 * r * math.sin(a), -0.6, 0.65 * r * math.cos(a)) for a in inner]
    in_t = [(0.65 * r * math.sin(a), yt(0.65 * r * math.cos(a)), 0.65 * r * math.cos(a)) for a in inner]
    # contorno: de 120° a 60° por fuera (por el oeste) y de vuelta de 60° a 120° por la pared de la cala
    bot = out_b + in_b; top = out_t + in_t; n = len(bot)
    for i in range(n):
        j = (i + 1) % n; g.quad(bot[i], bot[j], top[j], top[i], 'rock.cliff')
    c = (0, yt(0), 0)
    for i in range(n): g.tri(c, top[i], top[(i + 1) % n], 'grass.dark')
    for k in range(5):  # manchas de roca en la tapa
        a = 2 * math.pi * rnd(); d = 0.55 * r * math.sqrt(rnd()); x, z = d * math.sin(a), d * math.cos(a)
        pts = [(x + (2.5 + 2 * rnd()) * math.sin(b), 0, z + (2.5 + 2 * rnd()) * math.cos(b)) for b in np.linspace(0, 2 * math.pi, 8, endpoint=False)]
        pts = [(px, yt(pz) + 0.05, pz) for px, _, pz in pts]
        cc = (x, yt(z) + 0.05, z)
        for i in range(len(pts)): g.tri(cc, pts[i], pts[(i + 1) % len(pts)], 'rock.dark')
    # cala: arena a +0,8 m entre la pared (0,65·r) y 0,92·r, y talud hasta la flotación en r
    arc = [math.radians(a) for a in np.linspace(60, 120, 7)]
    for i in range(len(arc) - 1):
        a, b = arc[i], arc[i + 1]
        P = lambda rr, an, y: (rr * r * math.sin(an), y, rr * r * math.cos(an))
        g.quad(P(0.65, a, 0.8), P(0.65, b, 0.8), P(0.92, b, 0.8), P(0.92, a, 0.8), 'sand')
        g.quad(P(0.92, a, 0.8), P(0.92, b, 0.8), P(1.0, b, -0.6), P(1.0, a, -0.6), 'sand.wet')
def reef(g, r, rnd):
    n = 16; cols = []
    for i in range(n):
        a = 2 * math.pi * i / n; rw = r * (0.96 + 0.04 * rnd()); yt = 0.6 + 0.6 * rnd()
        rt = 0.80 * r; rb = rw + (rw - rt) * 0.6 / yt  # recta de la tapa a la flotación, prolongada hasta −0,6
        cols.append(((rb * math.sin(a), -0.6, rb * math.cos(a)), (rt * math.sin(a), yt, rt * math.cos(a))))
    E.prism(g, [c[0] for c in cols], [c[1] for c in cols], 'rock.cliff', 'rock.cliff')
    for i in range(1 + int(2 * rnd())):
        rr = 0.9 + 0.5 * rnd(); a = 2 * math.pi * rnd(); d = 0.4 * r * rnd()
        E.dodeca(g, rr, d * math.sin(a), 1.2 - rr, d * math.cos(a), 'rock.cliff', 6.28 * rnd(), 6.28 * rnd())
def tent(g, x, z, a):
    R = E.rot_y(a); o = np.array([x, 0.8, z]); P = lambda v: tuple(R @ np.array(v, float) + o)
    B = [P((-1.5, 0, -1.5)), P((1.5, 0, -1.5)), P((1.5, 0, 1.5)), P((-1.5, 0, 1.5))]; T = P((0, 2.2, 0))
    for i in range(4): g.tri(B[i], B[(i + 1) % 4], T, 'tent')
def pirate_flag(g, x, z, a):
    E.cyl(g, 0.1, 0.12, 6, 5, x, 0.8, z, 'mast.pirate', 'mast.pirate')
    E.flag(g, x, 6.8, z, 2.0, 1.3, a, 'black', 'white', 0.64)
def wreck(g, x, z, a, heel):
    """prop_wreck aproximado: casco abierto de 14 m cortado en u = +0,2 (8,4 m), escorado y hundido el 30 % en la arena."""
    w = []
    for zz, k in ((-7.0, 0.72), (-5.0, 0.9), (-2.0, 1.0), (0.0, 1.0), (1.4, 0.97)):
        hw = 1.95 * k
        w.append([(-hw, 1.4, zz), (-0.95 * hw, 0.0, zz), (-0.5 * hw, -0.9, zz), (0, -1.0, zz), (0.5 * hw, -0.9, zz), (0.95 * hw, 0.0, zz), (hw, 1.4, zz)])
    w[-1][0] = (w[-1][0][0], 1.4, 0.8); w[-1][6] = (w[-1][6][0], 1.4, 2.0); w[-1][3] = (0, -1.0, 1.0)  # borde roto
    loc = E.Geo()
    for s in range(4):
        for i in range(6):
            k = 'wreck' if w[s][i][1] >= 0 and w[s][i + 1][1] >= 0 else 'hull.bottom'
            loc.quad(w[s][i], w[s + 1][i], w[s + 1][i + 1], w[s][i + 1], k)
    for i in range(1, 6): loc.tri(w[0][0], w[0][i], w[0][i + 1], 'wreck')  # espejo de popa
    E.spar(loc, (0, 0.2, -2.0), (0, 2.8, -2.0), 0.18, 5, 'wreck')  # tocón de palo
    R = E.rot_y(a) @ E.rot_z(math.radians(heel)); g.add(loc, R, (x, 0.8 + 1.0 - 0.3 * 2.4, z))
def cove(g, r, rnd, a_port):
    loc = E.Geo(); beach(loc, r, rnd)
    E.cyl(loc, 0.45 * r, 0.60 * r, 3.6, 9, 0, -0.6, -0.35 * r, 'rock.cliff', 'rock.dark')
    tent(loc, -6, 8, 0.3); tent(loc, -2.0, 11.5, -0.2)
    for i in range(6):
        b = 2 * math.pi * i / 6; E.dodeca(loc, 0.25, 2.5 + 0.7 * math.sin(b), 0.9, 8.5 + 0.7 * math.cos(b), 'rock.cliff', b, 0.5)
    for (fx, fz) in ((-9.5, 4.5), (7.0, 5.0), (0.5, 14.0)): pirate_flag(loc, fx, fz, math.pi / 2 - a_port)  # la spec no fija hacia dónde ondean: de cara a la cámara (este-oeste)
    wreck(loc, 8.5, 10.0, math.radians(35), 22)
    for (tx, tz, ta) in ((-8.5, 12.0, 0.4), (4.0, 14.5, 1.3), (-3.5, 15.5, 2.2)): E.box(loc, 0.3, 0.2, 2.5, tx, 0.9, tz, ta, 'wreck')
    E.palm(loc, -11.5, 0.8, 8.0, 1.0, 1.0); E.palm(loc, 12.0, 0.8, 3.0, 2.5, 1.1)
    g.add(loc, E.rot_y(a_port))
# --- §9.5
TOP = 1.2
def port(g, rnd):
    E.cyl(g, 30, 30, 1.8, 48, 0, -0.6, 0, 'stone.face', 'stone')
    # cantil: RingGeometry(29, 30, 48) en TOP + 0,05
    o, i_ = E.ring_pts(30, 48, TOP + 0.05), E.ring_pts(29, 48, TOP + 0.05)
    for k in range(48): g.quad(i_[k], i_[(k + 1) % 48], o[(k + 1) % 48], o[k], 'stone.face')
    for k in range(12):
        psi = math.radians(15 + 30 * k); s, c = math.sin(psi), math.cos(psi)
        E.box(g, 4.0, 0.1, 5.4, 27.2 * s, TOP + 0.05, 27.2 * c, psi, 'palm.trunk')
        for side in (-1.5, 1.5):
            E.cyl(g, 0.3, 0.3, 0.6, 5, 29.2 * s + side * c, TOP + 0.1, 29.2 * c - side * s, 'cannon', 'cannon')
    # astillero: grada en rampa, quilla y roda, 7 cuadernas, cabria
    ramp = lambda z: TOP + 1.2 + (0.15 - 1.2) * (z - 12) / 17.5
    for x0, x1 in ((-3, 3),):
        A, B, C, D = (x0, ramp(12), 12), (x1, ramp(12), 12), (x1, ramp(29.5), 29.5), (x0, ramp(29.5), 29.5)
        g.quad(A, B, C, D, 'wreck')
        for (p, q) in ((A, D), (B, C)): g.quad(p, q, (q[0], TOP, q[2]), (p[0], TOP, p[2]), 'wreck')
        g.quad(A, (x0, TOP, 12), (x1, TOP, 12), B, 'wreck'); g.quad(D, C, (x1, TOP, 29.5), (x0, TOP, 29.5), 'wreck')
    for z in np.linspace(13.5, 27.5, 8)[:-1]:
        z2 = z + 2.0; E.Geo.quad(g, (-0.25, ramp(z) + 0.5, z), (0.25, ramp(z) + 0.5, z), (0.25, ramp(z2) + 0.5, z2), (-0.25, ramp(z2) + 0.5, z2), 'deck')
    E.box(g, 0.5, 0.5, 14, 0, (ramp(13.5) + ramp(27.5)) / 2 + 0.25, 20.5, 0, 'deck')
    E.spar(g, (0, ramp(13.5) + 0.5, 13.5), (0, ramp(13.5) + 3.4, 12.9), 0.2, 5, 'deck')
    for z in (14.5, 16.5, 18.5, 20.5, 22.5, 24.5, 26.5):
        u = (z - 13.5) / 14; w = max(0.8, 2.4 * math.sin(math.pi * (0.15 + 0.85 * u)))
        for sg in (-1, 1): E.spar(g, (0, ramp(z) + 0.5, z), (sg * w, ramp(z) + 2.8, z), 0.2, 4, 'deck')
    for sg in (-1, 1): E.spar(g, (sg * 3.8, TOP, 20), (0, 9.2, 20), 0.2, 5, 'mast')
    E.box(g, 4.4, 3.0, 9.0, 7.6, TOP + 1.5, 15.5, 0, 'town.wall'); E.gable(g, 9.0, 4.4, 1.4, 7.6, TOP + 3.0, 15.5, math.pi / 2)
    E.box(g, 2.0, 1.0, 3.5, -6.4, TOP + 0.5, 14.5, 0, 'palm.trunk'); E.box(g, 2.0, 0.6, 3.5, -6.4, TOP + 0.3, 19.0, 0, 'palm.trunk')
    # faro sobre el baluarte
    E.cyl(g, 3.2, 3.2, 0.6, 10, 0, TOP, -19.5, 'stone.face', 'stone')
    for k in range(5):
        r0, r1 = 1.6 - 0.4 * k / 5, 1.6 - 0.4 * (k + 1) / 5
        E.cyl(g, r1, r0, 2.4, 8, 0, TOP + 0.6 + 2.4 * k, -19.5, 'white' if k % 2 == 0 else 'town.roof', 'white')
    E.box(g, 1.4, 1.2, 1.4, 0, TOP + 0.6 + 12 + 0.6, -19.5, 0, 'lantern')
    for sx in (-15, 15):
        E.box(g, 10, 4, 6, sx, TOP + 2, -6, 0, 'store.wall'); E.gable(g, 10, 6, 1.8, sx, TOP + 4, -6, 0, 'roof.slate')
    E.cyl(g, 0.3, 0.35, 7, 6, 23, TOP, 0, 'mast', 'mast')
    E.spar(g, (23, TOP + 7, 0), (29.2, TOP + 8.2, 0), 0.15, 5, 'mast'); E.spar(g, (29.2, TOP + 8.2, 0), (29.2, TOP + 3.5, 0), 0.05, 4, 'mast')
    for k, (cx, cz) in enumerate(((19.9, 3.3), (21.6, 3.6), (20.4, 4.4), (20.0, -3.3), (21.7, -3.8), (20.6, -4.4))):
        if k % 3 == 2: E.cyl(g, 0.45, 0.45, 1.0, 6, cx, TOP, cz, 'barrel', 'barrel')
        else: E.box(g, 1.4, 1.4, 1.4, cx, TOP + 0.7, cz, 0.3 * k, 'cargo')
    E.box(g, 6, 5, 6, 0, TOP + 2.5, -4, 0, 'town.wall'); E.hip(g, 6, 6, 2.2, 0, TOP + 5, -4)
    E.cyl(g, 0.15, 0.2, 9, 5, 3.6, TOP, -7.6, 'mast', 'mast'); E.flag(g, 3.6, TOP + 9, -7.6, 2.0, 1.3, math.pi / 2, 'flag.gold')
    for (hx, hz, ha) in ((-10, -13, math.radians(-20)), (10, -13, 0), (0, -12.5, 0)):
        E.box(g, 4, 3, 5, hx, TOP + 1.5, hz, ha, 'town.wall')
        R = E.rot_y(ha + math.pi / 4); loc = E.Geo(); E.cone(loc, 3.6, 2.2, 4, 0, 0, 0, 'town.roof'); g.add(loc, R, (hx, TOP + 3, hz))
    for (px, pz, pa) in ((-8.0, 4.0, 0.5), (8.5, 6.0, 2.0), (-4.0, 9.0, 4.0)): E.palm(g, px, TOP, pz, pa, 1.0)
def build(fid, kind, var, r, x=0.0, z=0.0, seed_extra=''):
    rng = random.Random(fid + seed_extra); rnd = rng.random; g = E.Geo(); ap = to_port(x, z)
    if kind == 'port': port(g, rnd)
    elif kind == 'tropical' and var == 'village': village(g, r, rnd, ap)
    elif kind == 'tropical': tropical(g, r, rnd)
    elif var == 'stack': stack(g, r, rnd)
    elif var == 'volcano': volcano(g, r, rnd)
    elif var == 'cliff': cliff(g, r, rnd)
    elif kind == 'reef': reef(g, r, rnd)
    elif kind == 'pirate_cove': cove(g, r, rnd, ap)
    return g

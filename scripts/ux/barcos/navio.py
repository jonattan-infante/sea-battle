# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/navio.py
#   →  $UX_OUT/piloto/navio_{gb,es}_lod{0,1}.npz y atlas_{gb,es}.png (ligero: segundos)
# Necesita $UX_OUT/piloto/navio-rig.json: el aparejo, los cañones y los sockets del código del juego, que exporta
# scripts/ux/laminas/code/export-rig.ts en el árbol de la lámina (ver la cabecera de scripts/ux/laminas/lamina_barcos.py):
#   (cd /tmp/sb-lamina && npx tsx export-rig.ts "$UX_OUT/piloto/navio-rig.json")
# Escribe y lee en $UX_OUT/piloto (rutas.py de scripts/ux/laminas). No corre en la CI.
# Piloto de E17 (AC-193, D80): el Navío de línea en 2 familias, española (es) y británica (gb), con textura. Construye la
# malla en coordenadas del juego (+Y arriba, proa +Z, pivote en la flotación; ASSET-SPEC §2) y pinta el atlas de 1024².
# El aparejo, los cañones y el gallardete salen del código procedural (navio-rig.json, solo rim 0): pisan un texel blanco
# del atlas y llevan su color en COLOR_0, que glTF multiplica por la textura (ASSET-SPEC §6, «GLB futuro»).
import json, math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'laminas')); import rutas as RT
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.join(RT.OUT, 'piloto'); os.makedirs(HERE, exist_ok=True)
L, B, F, D, RAIL = 42.0, 11.2, 3.6, 1.9, 1.2
HB = B / 2
PROF = np.array([[-0.50, 0.80, 0.62, 1.30, 0.35], [-0.40, 0.96, 0.85, 1.15, 0.75], [-0.25, 1.00, 0.93, 1.04, 1.00], [0.00, 1.00, 0.95, 1.00, 1.00],
                 [0.20, 0.97, 0.88, 1.03, 1.00], [0.36, 0.72, 0.56, 1.12, 0.85], [0.50, 0.00, 0.00, 1.28, 0.30]])
def prof(u):
    return tuple(float(np.interp(u, PROF[:, 0], PROF[:, i])) for i in (1, 2, 3, 4))  # a, b, s, k (lineal, como §8.1)
def yd(z): return prof(z / L)[2] * F
BANDS = [(0.9, 1.8, [-14, -7, 0, 7, 14]), (2.3, 3.2, [-17.5, -10.5, -3.5, 3.5, 10.5])]  # franjas (alto sobre la flotación en la maestra) y portas
# ---- atlas (px, origen arriba a la izquierda)
A = 1024
R = {'hull': (0, 0, 1024, 288), 'deck': (0, 288, 1024, 112), 'wall': (0, 400, 512, 96), 'stern': (512, 400, 256, 224), 'flag': (768, 400, 256, 160),
     'white': (1000, 1000, 16, 16)}
V_TOP, V_BOT = 5.0, -2.0  # alto corregido por el arrufo en la región del casco
def uv(rect, s, t):
    x0, y0, w, h = R[rect]; return ((x0 + s * w) / A, 1 - (y0 + t * h) / A)
def hull_uv(z, v): return uv('hull', (z + 21) / 42, (V_TOP - v) / (V_TOP - V_BOT))
def deck_uv(z, x): return uv('deck', (z + 21) / 42, (x + 5.8) / 11.6)
WHITE = uv('white', 0.5, 0.5)
def hexlin(h): c = np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
ONE = np.ones(3)
class Mesh:
    def __init__(self): self.p, self.t, self.c, self.r = [], [], [], []
    def tri(self, a, b, c, ta, tb, tc, col=ONE, rim=0.0):
        self.p += [a, b, c]; self.t += [ta, tb, tc]; self.c += [col, col, col]; self.r += [rim] * 3
    def quad(self, a, b, c, d, ta, tb, tc, td, col=ONE, rim=0.0):
        self.tri(a, b, c, ta, tb, tc, col, rim); self.tri(a, c, d, ta, tc, td, col, rim)
    def solid(self, a, b, c, d, col, rim=0.0): self.quad(a, b, c, d, WHITE, WHITE, WHITE, WHITE, hexlin(col) if isinstance(col, str) else col, rim)
    def ntri(self): return len(self.p) // 3
# ---- casco por loft (§8.1, perfil estándar), con UV de banda corregida por el arrufo
def section(z):
    a, b, s, k = prof(z / L); y0 = s * F
    xAt = lambda y: HB * (b + (a - b) * y / y0)
    return [(a * HB, y0 + RAIL), (a * HB, y0), (xAt(0.55 * y0), 0.55 * y0), (b * HB, 0.0), (0.72 * b * HB, -0.62 * k * D), (0.0, -k * D)], y0 - F
def hull(m, nst):
    zs = np.linspace(-21, 21, nst)
    secs = [section(z) for z in zs]
    for side in (1, -1):
        for i in range(nst - 1):
            (S0, sh0), (S1, sh1) = secs[i], secs[i + 1]; z0, z1 = zs[i], zs[i + 1]
            for j in range(len(S0) - 1):
                p = [(side * S0[j][0], S0[j][1], z0), (side * S1[j][0], S1[j][1], z1), (side * S1[j + 1][0], S1[j + 1][1], z1), (side * S0[j + 1][0], S0[j + 1][1], z0)]
                t = [hull_uv(z0, S0[j][1] - sh0), hull_uv(z1, S1[j][1] - sh1), hull_uv(z1, S1[j + 1][1] - sh1), hull_uv(z0, S0[j + 1][1] - sh0)]
                m.quad(*p, *t, rim=1.0)
            # cara interior de la borda (madera de la regala) y su tapa
            pi = [(side * (S0[0][0] - 0.25), S0[0][1], z0), (side * (S1[0][0] - 0.25), S1[0][1], z1), (side * (S1[1][0] - 0.25), S1[1][1], z1), (side * (S0[1][0] - 0.25), S0[1][1], z0)]
            m.solid(*pi, '#5A3A22', 1.0)
            m.solid((side * S0[0][0], S0[0][1], z0), (side * S1[0][0], S1[0][1], z1), pi[1], pi[0], '#3A2618', 1.0)
    # cubierta en tablas (región deck)
    for i in range(nst - 1):
        (S0, _), (S1, _) = secs[i], secs[i + 1]; z0, z1 = zs[i], zs[i + 1]
        p = [(-S0[1][0], S0[1][1], z0), (S0[1][0], S0[1][1], z0), (S1[1][0], S1[1][1], z1), (-S1[1][0], S1[1][1], z1)]
        m.quad(*p, deck_uv(z0, -S0[1][0]), deck_uv(z0, S0[1][0]), deck_uv(z1, S1[1][0]), deck_uv(z1, -S1[1][0]), rim=1.0)
    # espejo de popa (región stern) y cierre de proa en punta
    S, sh = secs[0]; z = -21.0
    pts = [(x, y) for x, y in S]
    ring = pts + [(-x, y) for x, y in reversed(pts[:-1])]
    cx = 0.0; cy = np.mean([y for _, y in ring])
    st = lambda x, y: uv('stern', (x + 5.8) / 11.6, (10.0 - y) / 12.0)
    for i in range(len(ring)):
        (x0, y0), (x1, y1) = ring[i], ring[(i + 1) % len(ring)]
        m.tri((cx, cy, z), (x1, y1, z), (x0, y0, z), st(cx, cy), st(x1, y1), st(x0, y0), rim=1.0)
    return zs
# ---- castillos por familia
def box(m, x0, x1, y0, y1, z0, z1, wall, top='deck', back='stern', front=None, rim=1.0):
    """Caja con la tapa en la región de cubierta (tablas), los costados en la de muro y la cara de popa en la de popa."""
    zlen = z1 - z0
    wl = lambda s, y: uv(wall, s, 1 - (y - y0) / (y1 - y0))
    for side, x in ((1, x1), (-1, x0)):
        p = [(x, y0, z0), (x, y0, z1), (x, y1, z1), (x, y1, z0)]
        m.quad(*p, wl(0, y0), wl(min(1, zlen / 11), y0), wl(min(1, zlen / 11), y1), wl(0, y1), rim=rim)
    m.quad((x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1), deck_uv(z0, x0), deck_uv(z0, x1), deck_uv(z1, x1), deck_uv(z1, x0), rim=rim)
    st = lambda x, y: uv('stern', (x + 5.8) / 11.6, (10.0 - y) / 12.0)
    m.quad((x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0), st(x0, y0), st(x0, y1), st(x1, y1), st(x1, y0), rim=rim)
    m.solid((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), front or '#5A3A22', rim)
def castles(m, fam):
    y15, y175, y155 = yd(-15), yd(-17.5), yd(15.5)
    if fam == 'gb':  # ASSET-SPEC §8.4 tal cual: alcázar de 2 pisos y castillo de proa
        box(m, -4.8, 4.8, y15, y15 + 1.6, -20.5, -9.5, 'wall', front='#1E1C1A')
        box(m, -4.3, 4.3, y175 + 1.6, y175 + 3.0, -20.5, -14.5, 'wall', front='#1E1C1A')
        box(m, -3.8, 3.8, y155, y155 + 1.2, 12.0, 19.0, 'wall', front='#1E1C1A')
        return y175 + 3.0
    # española: alcázar más alto y escalonado en 3 pisos (toldilla), y castillo de proa algo más alto
    box(m, -4.8, 4.8, y15, y15 + 2.0, -20.5, -9.5, 'wall', front='#8E2A1E')
    box(m, -4.4, 4.4, y175 + 2.0, y175 + 3.8, -20.6, -13.5, 'wall', front='#8E2A1E')
    box(m, -3.6, 3.6, y175 + 3.8, y175 + 5.0, -20.7, -17.2, 'wall', front='#8E2A1E')
    box(m, -3.8, 3.8, y155, y155 + 1.6, 12.0, 19.0, 'wall', front='#8E2A1E')
    return y175 + 5.0
def galleries(m, fam, top):
    """Galerías de popa a los costados (jardines), con ventanas: cajas que sobresalen 0,5 m del costado."""
    y0 = yd(-18) + 0.4; y1 = top - (0.4 if fam == 'es' else 0.6)
    for side in (1, -1):
        x = side * (prof(-18 / L)[0] * HB); xo = x + side * (0.6 if fam == 'es' else 0.45)
        st = lambda zz, y: uv('stern', 0.1 + 0.2 * (zz + 20.4) / 3.6, (10.0 - y) / 12.0)
        m.quad((xo, y0, -20.4), (xo, y0, -16.8), (xo, y1, -16.8), (xo, y1, -20.4), st(-20.4, y0), st(-16.8, y0), st(-16.8, y1), st(-20.4, y1), rim=1.0)
        cap = '#D9A93F' if fam == 'es' else '#1E1C1A'
        m.solid((x, y1, -20.4), (xo, y1, -20.4), (xo, y1, -16.8), (x, y1, -16.8), cap, 1.0)
        m.solid((x, y0, -20.4), (x, y0, -16.8), (xo, y0, -16.8), (xo, y0, -20.4), cap, 1.0)
        m.solid((x, y0, -16.8), (x, y1, -16.8), (xo, y1, -16.8), (xo, y0, -16.8), cap, 1.0)
def channels_and_shrouds(m, fam, lod):
    if lod: return
    col = '#2A2018'
    for mz, mh, top in ((12.5, 30, 12.8), (1.0, 34, 13.4), (-11.5, 26, 11.0)):
        a = prof(mz / L)[0] * HB; yc = yd(mz) + RAIL - 0.2
        for side in (1, -1):
            x0, x1 = side * a, side * (a + 0.7)
            m.solid((x0, yc, mz - 3), (x1, yc, mz - 3), (x1, yc, mz + 3), (x0, yc, mz + 3), '#3A2618', 0.0)
            for k in range(5):  # obenques: del canal a la cofa
                zz = mz - 2.6 + 1.3 * k; p = np.array([side * (a + 0.6), yc, zz]); q = np.array([side * 0.9, top, mz])
                d = q - p; d /= np.linalg.norm(d); n = np.cross(d, [0, 0, 1]); n = n / (np.linalg.norm(n) + 1e-9) * 0.05
                m.solid(p - n, p + n, q + n, q - n, col, 0.0)
def emblem(m, fam, lod):
    """Cruz de Borgoña (aspa roja) sobre el trinquete y la mayor de la española, en las 2 caras, sobre la panza de la vela."""
    if fam != 'es': return
    red = hexlin('#B3261E')
    for mz, w, h, yb in ((12.5, 14.6, 5.4, 6.8), (1.0, 16.0, 6.0, 6.8)):
        brace = np.radians(20)
        nx = max(4, 2 * round(w / (2 * 0.55)))  # paños de la vela del jugador (squareSail, CLOTH.w = 0,55)
        def bulge(uu, vv):
            # la superficie real es la de PlaneGeometry(w, h, nx, 3): 2 triángulos por celda (a, b, d) y (b, c, d)
            zf = lambda i, j: 0.12 * w * math.sin(math.pi * i / nx) * math.sin(math.pi * (1 - j / 3))
            fx = min(uu * nx, nx - 1e-9); fy = min((1 - vv) * 3, 3 - 1e-9); i, j = int(fx), int(fy); fu, fw = fx - i, fy - j
            za, zb_, zc, zd = zf(i, j), zf(i, j + 1), zf(i + 1, j + 1), zf(i + 1, j)
            return za + fu * (zd - za) + fw * (zb_ - za) if fu + fw <= 1 else zc + (1 - fu) * (zb_ - zc) + (1 - fw) * (zd - zc)
        def P(uu, vv, off):
            x = (uu - 0.5) * w; y = (vv - 0.5) * h; zb = bulge(uu, vv) + off + 0.45
            # como squareSail: la vela (con su panza y los 0,45 m hacia proa) gira 20° alrededor del eje del palo, en z = mz
            X = x * math.cos(brace) + zb * math.sin(brace); Z = -x * math.sin(brace) + zb * math.cos(brace)
            return (X, yb + h / 2 + y, mz + Z)
        n = 24; bw = 0.07
        for off in (0.05, -0.05):
            for (u0, v0, u1, v1) in ((0.12, 0.08, 0.88, 0.92), (0.88, 0.08, 0.12, 0.92)):
                for i in range(n):
                    a0, a1 = i / n, (i + 1) / n
                    ua, va = u0 + (u1 - u0) * a0, v0 + (v1 - v0) * a0; ub, vb = u0 + (u1 - u0) * a1, v0 + (v1 - v0) * a1
                    q = [P(ua - bw / 2, va, off), P(ub - bw / 2, vb, off), P(ub + bw / 2, vb, off), P(ua + bw / 2, va, off)]
                    m.quad(*q, WHITE, WHITE, WHITE, WHITE, red, 0.0)
def ensign(m, fam):
    """Asta de popa y bandera de la familia (región flag), en las 2 caras."""
    z = -21.4; y0 = yd(-21) + (5.0 if fam == 'es' else 3.0); ytop = y0 + 4.5
    m.solid((-0.06, y0, z), (0.06, y0, z), (0.06, ytop, z), (-0.06, ytop, z), '#3A2618', 0.0)
    m.solid((0, y0, z - 0.06), (0, y0, z + 0.06), (0, ytop, z + 0.06), (0, ytop, z - 0.06), '#3A2618', 0.0)
    w, h = 3.2, 2.0; s0 = 0.0 if fam == 'es' else 0.5
    fl = lambda s, t: uv('flag', s0 + 0.5 * s, t)
    for off in (0.02, -0.02):
        p = [(off, ytop, z), (off, ytop, z - w), (off, ytop - h, z - w), (off, ytop - h, z)]
        m.quad(*p, fl(0, 0), fl(1, 0), fl(1, 1), fl(0, 1), rim=0.0)
def figurehead(m, fam):
    col = '#D9A93F' if fam == 'es' else '#D9A84A'; z = 20.6; y = yd(20.6) - 0.4
    m.solid((-0.35, y - 1.2, z), (0.35, y - 1.2, z), (0.35, y, z + 1.0), (-0.35, y, z + 1.0), col, 1.0)
    m.solid((-0.35, y, z + 1.0), (0.35, y, z + 1.0), (0.3, y + 0.8, z + 1.3), (-0.3, y + 0.8, z + 1.3), col, 1.0)
def rig(m, lod):
    d = json.load(open(os.path.join(HERE, 'navio-rig.json')))[f'lod{lod}']
    P = np.array(d['pos']).reshape(-1, 3, 3); C = np.array(d['col']).reshape(-1, 3, 3); Rm = np.array(d['rim']).reshape(-1, 3)
    gunport = hexlin('#1A1410')
    for p, c, r in zip(P, C, Rm):
        if r[0] > 0.5 or np.abs(c[0] - gunport).max() < 1e-3: continue  # el casco y las portas van ahora en la textura
        m.p += [tuple(v) for v in p]; m.t += [WHITE] * 3; m.c += [tuple(x) for x in c]; m.r += [0.0] * 3

# ---- detalle de cubierta y aparejo (lo que más se ve con la cámara del juego, a 55°)
def prism(m, p, q, r, n, col, rim=0.0):
    """Cilindro de n lados de p a q (sin tapas), en color plano."""
    p, q = np.array(p, float), np.array(q, float); dv = q - p; dv /= np.linalg.norm(dv)
    a = np.cross(dv, [0, 1, 0]) if abs(dv[1]) < 0.9 else np.cross(dv, [1, 0, 0]); a /= np.linalg.norm(a); b = np.cross(dv, a)
    ring = lambda c: [c + r * (math.cos(2 * math.pi * i / n) * a + math.sin(2 * math.pi * i / n) * b) for i in range(n)]
    A, Bq = ring(p), ring(q)
    for i in range(n): m.solid(tuple(A[i]), tuple(A[(i + 1) % n]), tuple(Bq[(i + 1) % n]), tuple(Bq[i]), col, rim)
def cuboid(m, cx, cy, cz, sx, sy, sz, col, top=None, rim=0.0, ry=0.0):
    c, s_ = math.cos(ry), math.sin(ry)
    P = lambda x, y, z: (cx + x * c + z * s_, cy + y, cz - x * s_ + z * c)
    X, Y, Z = sx / 2, sy / 2, sz / 2
    v = {k: P(*k) for k in [(i * X, j * Y, k_ * Z) for i in (-1, 1) for j in (-1, 1) for k_ in (-1, 1)]}
    g = lambda i, j, k_: v[(i * X, j * Y, k_ * Z)]
    m.solid(g(-1, 1, -1), g(-1, 1, 1), g(1, 1, 1), g(1, 1, -1), top or col, rim)
    for a_, b_, c_, d_ in (((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1)), ((1, -1, 1), (-1, -1, 1), (-1, 1, 1), (1, 1, 1)),
                           ((-1, -1, 1), (-1, -1, -1), (-1, 1, -1), (-1, 1, 1)), ((1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1))):
        m.solid(g(*a_), g(*b_), g(*c_), g(*d_), col, rim)
def boat(m, cx, cy, cz, Lb, Bb, col_out, col_in, stripe):
    """Bote de 7 m sobre calzos: casco abierto por estaciones (proa y popa en punta) con una franja."""
    zs = np.linspace(-Lb / 2, Lb / 2, 7); prof_ = lambda t: math.sin(math.pi * (t + 0.5)) ** 0.7
    secs = [[(Bb / 2 * prof_(z / Lb), 0.0), (Bb / 2 * prof_(z / Lb) * 0.8, -0.35), (0.0, -0.7)] for z in zs]
    for side in (1, -1):
        for i in range(len(zs) - 1):
            for j in range(2):
                a_ = (cx + side * secs[i][j][0], cy + secs[i][j][1], cz + zs[i]); b_ = (cx + side * secs[i + 1][j][0], cy + secs[i + 1][j][1], cz + zs[i + 1])
                c_ = (cx + side * secs[i + 1][j + 1][0], cy + secs[i + 1][j + 1][1], cz + zs[i + 1]); d_ = (cx + side * secs[i][j + 1][0], cy + secs[i][j + 1][1], cz + zs[i])
                m.solid(a_, b_, c_, d_, stripe if j == 0 else col_out)
        # bancadas e interior: una tapa oscura un poco bajo la borda
        for i in range(len(zs) - 1):
            m.solid((cx, cy - 0.25, cz + zs[i]), (cx + side * secs[i][0][0] * 0.9, cy - 0.2, cz + zs[i]), (cx + side * secs[i + 1][0][0] * 0.9, cy - 0.2, cz + zs[i + 1]), (cx, cy - 0.25, cz + zs[i + 1]), col_in)
def details(m, fam):
    dark, wood, iron = '#2A2018', '#6B4426', '#26282B'
    gold = '#D9A93F' if fam == 'es' else '#D9A84A'
    # 2 botes en el combés, sobre calzos, entre el trinquete y la mayor
    for bx in (-1.7, 1.7):
        yb = yd(6.5) + 1.25
        boat(m, bx, yb, 6.5, 7.0, 1.9, '#3A2A1E' if fam == 'gb' else '#5A3A22', '#4A3424', gold)
        for zz in (4.5, 8.5): cuboid(m, bx, yd(zz) + 0.25, zz, 1.4, 0.5, 0.3, wood)
    # cabrestante entre la mayor y la mesana, con sus barras
    yc = yd(-5.5); prism(m, (0, yc, -5.5), (0, yc + 1.1, -5.5), 0.6, 8, wood)
    for k in range(4):
        a = math.pi / 4 * k; prism(m, (1.5 * math.cos(a), yc + 0.85, -5.5 + 1.5 * math.sin(a)), (-1.5 * math.cos(a), yc + 0.85, -5.5 - 1.5 * math.sin(a)), 0.06, 4, wood)
    # cañones de cubierta (carronadas) en el alcázar y el castillo de proa, con su cureña, asomando por la borda
    y_alc = yd(-15) + (2.0 if fam == 'es' else 1.6); y_cas = yd(15.5) + (1.6 if fam == 'es' else 1.2)
    for side in (1, -1):
        for zz, ytop, half in ((-11.0, y_alc, 4.8), (-13.2, y_alc, 4.8), (-15.4, y_alc, 4.8), (13.5, y_cas, 3.8), (16.0, y_cas, 3.8)):
            if fam == 'es' and zz == -15.4: continue  # en la española, ahí empieza el 2.º piso
            cuboid(m, side * (half - 0.9), ytop + 0.2, zz, 0.9, 0.4, 1.0, '#5A3A22')
            prism(m, (side * (half - 1.3), ytop + 0.5, zz), (side * (half + 0.15), ytop + 0.5, zz), 0.16, 6, iron)
    # timón (rueda doble) en el alcázar
    prism(m, (-0.45, y_alc + 1.0, -17.0 if fam == 'gb' else -12.2), (0.45, y_alc + 1.0, -17.0 if fam == 'gb' else -12.2), 0.75, 8, wood)
    # campana bajo un pequeño tejado en el castillo de proa
    cuboid(m, 0, y_cas + 0.6, 13.0, 1.0, 1.2, 0.8, wood, top=gold)
    # faroles de popa: 3 en el coronamiento (los españoles, más grandes y dorados)
    top_y = yd(-17.5) + (5.0 if fam == 'es' else 3.0); fs = 1.3 if fam == 'es' else 1.0
    for lx in (-2.8, 0.0, 2.8):
        prism(m, (lx, top_y, -20.4), (lx, top_y + 0.5 * fs, -20.4), 0.12, 4, wood)
        cuboid(m, lx, top_y + 0.5 * fs + 0.45 * fs, -20.4, 0.55 * fs, 0.9 * fs, 0.55 * fs, '#FFE9A8', top=gold)
    # estays: de cada tope a proa, y brandales a popa
    for (mz, mh), (tz, ty) in (((12.5, 30.0), (24.0, 9.0)), ((1.0, 34.0), (12.5, 13.0)), ((-11.5, 26.0), (1.0, 13.4)), ((12.5, 22.0), (28.0, 12.0))):
        prism(m, (0, mh - 0.6, mz), (0, ty, tz), 0.06, 4, dark)
    for mz, mh in ((12.5, 30.0), (1.0, 34.0), (-11.5, 26.0)):
        for side in (1, -1):
            a = prof((mz - 6) / L)[0] * HB
            prism(m, (side * 0.3, mh - 1.0, mz), (side * (a + 0.4), yd(mz - 6) + RAIL, mz - 6), 0.05, 4, dark)
def port_lids(m, fam):
    """Tapas de porta abiertas en la batería alta: bisagra arriba, abiertas 55°, cara exterior del color de la franja e
    interior rojo (como en los navíos de la época)."""
    out_c = '#D9A84A' if fam == 'gb' else '#A3301F'
    for vb, vt, pz in BANDS[1:]:
        for z in pz:
            a, b, s_, k = prof(z / L); sh = s_ * F - F; ytop = (vb + vt) / 2 + 0.3 + sh
            x = a * HB * 0.995
            for side in (1, -1):
                w2 = 0.42; lh = 0.62; ang = math.radians(55)
                h0 = (side * x, ytop, z - w2); h1 = (side * x, ytop, z + w2)
                o = (side * (x + lh * math.sin(ang)), ytop - lh * math.cos(ang))
                e0 = (side * (x + lh * math.sin(ang)), ytop - lh * math.cos(ang), z - w2); e1 = (e0[0], e0[1], z + w2)
                m.solid(h0, h1, e1, e0, out_c, 0.0)
                o2 = 0.03 * side; m.solid((h0[0] + o2, h0[1], h0[2]), (e0[0] + o2, e0[1], e0[2]), (e1[0] + o2, e1[1], e1[2]), (h1[0] + o2, h1[1], h1[2]), '#9E2B1E', 0.0)
def build(fam, lod):
    m = Mesh(); hull(m, 25 if lod == 0 else 9); top = castles(m, fam)
    if lod == 0: galleries(m, fam, top); channels_and_shrouds(m, fam, lod); emblem(m, fam, lod); figurehead(m, fam); details(m, fam); port_lids(m, fam)
    ensign(m, fam); rig(m, lod)
    return m
# ---- atlas
def paint(fam, seed=7):
    rng = random.Random(seed); img = Image.new('RGB', (A, A), (255, 255, 255)); d = ImageDraw.Draw(img)
    def ry(v): x0, y0, w, h = R['hull']; return y0 + (V_TOP - v) / (V_TOP - V_BOT) * h
    def rx(z): return (z + 21) / 42 * 1024
    x0, y0, w, h = R['hull']
    if fam == 'gb':
        base, band, upper, bottom, port = (30, 28, 26), (217, 168, 74), (30, 28, 26), (122, 74, 46), (16, 14, 12)
    else:
        base, band, upper, bottom, port = (74, 44, 26), (163, 48, 31), (142, 42, 30), (58, 36, 22), (20, 14, 10)
    d.rectangle((x0, y0, x0 + w, y0 + h), fill=base)
    d.rectangle((x0, ry(0), x0 + w, y0 + h), fill=bottom)
    d.rectangle((x0, ry(4.8), x0 + w, ry(3.2)), fill=upper)
    for (vb, vt, pz) in BANDS:
        d.rectangle((x0, ry(vt), x0 + w, ry(vb)), fill=band)
        if fam == 'es':  # filetes dorados en el borde de cada franja
            for v in (vt, vb): d.rectangle((x0, ry(v) - 2, x0 + w, ry(v) + 1), fill=(217, 169, 63))
        else:  # cintas negras (los «wales») que separan las franjas
            for v in (vt, vb): d.rectangle((x0, ry(v) - 1, x0 + w, ry(v) + 1), fill=(16, 14, 12))
        for z in pz:  # tapas de porta: 0,8 × 0,6 m, oscuras (AS-V20: rompen la franja)
            pw, ph = 0.8 * 1024 / 42 / 2, 0.6 / 7 * 288 / 2; cy = ry((vb + vt) / 2)
            d.rectangle((rx(z) - pw, cy - ph, rx(z) + pw, cy + ph), fill=port)
            d.rectangle((rx(z) - pw, cy - ph - 1, rx(z) + pw, cy - ph), fill=(90, 70, 50) if fam == 'gb' else (217, 169, 63))
    if fam == 'es':  # friso dorado bajo la regala: volutas como puntos y trazos
        yy = ry(4.45)
        for xx in range(0, 1024, 12):
            d.ellipse((xx, yy - 3, xx + 6, yy + 3), outline=(217, 169, 63)); d.point((xx + 3, yy), fill=(240, 200, 90))
        d.rectangle((x0, ry(4.8), x0 + w, ry(4.75)), fill=(217, 169, 63))
    else:
        d.rectangle((x0, ry(4.55), x0 + w, ry(4.4)), fill=(217, 168, 74))
    # tablazón: líneas cada 0,25 m y juntas a tope; flotación con una línea clara
    for v in np.arange(V_BOT, V_TOP, 0.25):
        yy = ry(v); d.line((x0, yy, x0 + w, yy), fill=tuple(max(0, c - 18) for c in img.getpixel((5, int(min(max(yy + 2, 0), h - 1))))))
        xx = rng.randint(0, 60)
        while xx < 1024:
            d.line((xx, yy, xx, ry(v + 0.25)), fill=tuple(max(0, c - 12) for c in img.getpixel((min(xx, 1023), int(min(max(yy - 2, 0), h - 1))))))
            xx += rng.randint(70, 150)
    d.line((x0, ry(0.02), x0 + w, ry(0.02)), fill=(230, 225, 210) if fam == 'gb' else (200, 190, 170), width=2)
    # cubierta: tablas a lo largo de Z en 3 tonos (D62, albedo de §4.2.1), juntas y 2 escotillas con enjaretado
    x0, y0, w, h = R['deck']; tones = [(225, 177, 123), (189, 141, 89), (151, 107, 57)]
    n = int(11.6 / 0.5); perm = [0, 1, 2]
    for i in range(n):
        if i % 3 == 0: rng.shuffle(perm)
        ya, yb2 = y0 + i * h / n, y0 + (i + 1) * h / n
        d.rectangle((x0, ya, x0 + w, yb2), fill=tones[perm[i % 3]]); d.line((x0, yb2, x0 + w, yb2), fill=(110, 80, 50))
    for zc in (-4.5, 6.0, -12.0):
        xa, xb = (zc + 21 - 1.4) / 42 * 1024, (zc + 21 + 1.4) / 42 * 1024; ya, yb2 = y0 + (5.8 - 1.2) / 11.6 * h, y0 + (5.8 + 1.2) / 11.6 * h
        d.rectangle((xa, ya, xb, yb2), fill=(80, 56, 34))
        for gx in np.arange(xa + 3, xb, 6): d.line((gx, ya, gx, yb2), fill=(140, 100, 60))
        for gy in np.arange(ya + 3, yb2, 6): d.line((xa, gy, xb, gy), fill=(140, 100, 60))
    # muros de los castillos (región wall): banda de la familia y ventanas
    x0, y0, w, h = R['wall']
    if fam == 'gb':
        d.rectangle((x0, y0, x0 + w, y0 + h), fill=(30, 28, 26)); d.rectangle((x0, y0 + 0.30 * h, x0 + w, y0 + 0.62 * h), fill=(217, 168, 74))
        for xx in range(20, w, 46): d.rectangle((x0 + xx, y0 + 0.36 * h, x0 + xx + 12, y0 + 0.56 * h), fill=(16, 14, 12))
    else:
        d.rectangle((x0, y0, x0 + w, y0 + h), fill=(142, 42, 30))
        d.rectangle((x0, y0 + 0.08 * h, x0 + w, y0 + 0.14 * h), fill=(217, 169, 63)); d.rectangle((x0, y0 + 0.86 * h, x0 + w, y0 + 0.92 * h), fill=(217, 169, 63))
        for xx in range(14, w, 40):
            d.rectangle((x0 + xx - 3, y0 + 0.30 * h - 3, x0 + xx + 17, y0 + 0.66 * h + 3), fill=(217, 169, 63))
            d.rectangle((x0 + xx, y0 + 0.30 * h, x0 + xx + 14, y0 + 0.66 * h), fill=(255, 233, 168))
    # popa (región stern): espejo con ventanas en filas; la española, labrada y dorada
    x0, y0, w, h = R['stern']; sy = lambda y: y0 + (10.0 - y) / 12.0 * h; sx = lambda x: x0 + (x + 5.8) / 11.6 * w
    if fam == 'gb':
        d.rectangle((x0, y0, x0 + w, y0 + h), fill=(30, 28, 26))
        d.rectangle((x0, sy(0), x0 + w, y0 + h), fill=(122, 74, 46))
        for (ya, yb_) in ((5.0, 5.6), (6.6, 7.2), (8.0, 8.5)):
            d.rectangle((x0, sy(yb_ + 0.25), x0 + w, sy(ya - 0.25)), fill=(217, 168, 74))
            for xx in np.arange(-4.2, 4.3, 1.05): d.rectangle((sx(xx - 0.32), sy(yb_), sx(xx + 0.32), sy(ya)), fill=(255, 233, 168))
    else:
        d.rectangle((x0, y0, x0 + w, y0 + h), fill=(142, 42, 30)); d.rectangle((x0, sy(0), x0 + w, y0 + h), fill=(58, 36, 22))
        for (ya, yb_) in ((4.9, 5.6), (6.7, 7.4), (8.4, 9.0)):
            d.rectangle((x0, sy(yb_ + 0.35), x0 + w, sy(ya - 0.35)), fill=(217, 169, 63))
            for xx in np.arange(-4.0, 4.1, 1.15):
                d.rectangle((sx(xx - 0.36), sy(yb_), sx(xx + 0.36), sy(ya)), fill=(255, 233, 168)); d.rectangle((sx(xx - 0.36), sy(yb_), sx(xx + 0.36), sy(ya)), outline=(140, 90, 30))
        for k in range(160):  # tallas: puntos dorados sobre el rojo, más densos arriba
            xx = rng.uniform(-5.6, 5.6); yy = rng.uniform(3.5, 10.0); r = rng.choice((1, 2))
            d.ellipse((sx(xx) - r, sy(yy) - r, sx(xx) + r, sy(yy) + r), fill=(230, 185, 80))
        d.ellipse((sx(-0.9), sy(4.7), sx(0.9), sy(3.5)), fill=(217, 169, 63), outline=(140, 90, 30))  # cartela sin escudo
    # banderas: española (cruz de Borgoña: aspa roja raída sobre blanco) y británica (cruz roja sobre blanco)
    x0, y0, w, h = R['flag']; hw = w // 2
    d.rectangle((x0, y0, x0 + w, y0 + h), fill=(245, 241, 230))
    for (a0, b0, a1, b1) in ((0.08, 0.1, 0.92, 0.9), (0.92, 0.1, 0.08, 0.9)):
        d.line((x0 + a0 * hw, y0 + b0 * h, x0 + a1 * hw, y0 + b1 * h), fill=(179, 38, 30), width=16)
        for t in (0.3, 0.5, 0.7):  # nudos del aspa raída
            cx, cy = x0 + (a0 + (a1 - a0) * t) * hw, y0 + (b0 + (b1 - b0) * t) * h; d.ellipse((cx - 11, cy - 11, cx + 11, cy + 11), fill=(179, 38, 30))
    d.rectangle((x0 + hw + 0.42 * hw, y0, x0 + hw + 0.58 * hw, y0 + h), fill=(179, 38, 30)); d.rectangle((x0 + hw, y0 + 0.4 * h, x0 + w, y0 + 0.6 * h), fill=(179, 38, 30))
    # oclusión aproximada: el casco se oscurece bajo la regala y junto a la flotación (×0,85), como la de D23
    arr = np.asarray(img).astype(float)
    x0, y0, w, h = R['hull']
    for v0, v1 in ((4.8, 4.5), (0.35, 0.0)):
        a, b = int(ry(v0)), int(ry(v1)); arr[a:b, x0:x0 + w] *= 0.85
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img); x0, y0, w, h = R['white']; d.rectangle((x0, y0, x0 + w, y0 + h), fill=(255, 255, 255))
    return img
if __name__ == '__main__':
    for fam in ('es', 'gb'):
        img = paint(fam); img.save(os.path.join(HERE, f'atlas_{fam}.png'))
        for lod in (0, 1):
            m = build(fam, lod)
            np.savez(os.path.join(HERE, f'navio_{fam}_lod{lod}.npz'), p=np.array(m.p, float), t=np.array(m.t, float), c=np.array(m.c, float), r=np.array(m.r, float))
            print(fam, f'lod{lod}', m.ntri(), 'tris')

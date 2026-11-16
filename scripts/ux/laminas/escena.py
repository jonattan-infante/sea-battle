# Uso: lo importan lamina_islas.py y lamina_puerto.py (scripts/ux/laminas). No corre en la CI.
# Constructor de mallas para las láminas de islas y puerto (no es código del juego): primitivas de three.js, color por
# vértice en lineal y caras planas, para el render por software de qa-artifacts/render/d40-modelo/model.py.
import math
import numpy as np
def hexlin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
# ART-DIRECTION §4.1 y §4.2 (en pantalla); las tapas horizontales llevan el albedo de §4.2.1 (D17)
TOK = {'sand': '#E6CF9A', 'sand.wet': '#C9AE78', 'grass': '#5E9E48', 'grass.dark': '#3F7A35', 'rock': '#8A8378', 'rock.dark': '#625C53',
       'rock.cliff': '#544D45', 'palm.trunk': '#8A5A3B', 'palm.leaf': '#4E9A3E', 'town.wall': '#E8DCC0', 'town.roof': '#B5523B',
       'stone': '#9E9A90', 'stone.face': '#625A50', 'store.wall': '#D8C7A2', 'roof.slate': '#55606C', 'wreck': '#4B3A2C', 'deck': '#F0BC82',
       'mast': '#6B4426', 'mast.pirate': '#3A2A20', 'lantern': '#FFE9A8', 'cannon': '#26282B', 'cargo': '#B07A3E', 'barrel': '#8A5A33',
       'white': '#F5F1E6', 'flag.gold': '#F2C14E', 'buoy.a': '#F2C14E', 'buoy.b': '#F5F1E6', 'hull.bottom': '#3A2416', 'tent': '#4A494D',
       'black': '#111111', 'net': '#C2BBAC'}
ALBEDO_TOP = {'sand': '#D8C392', 'grass': '#589444', 'deck': '#E1B17B', 'cargo': '#A5723B'}  # tabla de §4.2.1
MULT = np.array([1.153, 1.149, 1.118])  # §4.2.1: una cara horizontal recibe este factor en lineal
COMPENSA = {'grass.dark', 'rock.dark', 'rock.cliff', 'palm.trunk', 'wreck'}  # tapas sin fila en §4.2.1: objetivo ÷ factor
def col(c, top):
    if top and c in ALBEDO_TOP: return hexlin(ALBEDO_TOP[c])
    if top and c in COMPENSA: return list(np.array(hexlin(TOK[c])) / MULT)
    return hexlin(TOK.get(c, c))
class Geo:
    def __init__(self): self.T = []  # (p0, p1, p2, c0, c1, c2) con c = token o hex
    def tri(self, a, b, c, k): self.T.append((tuple(a), tuple(b), tuple(c), k, k, k))
    def tri3(self, a, b, c, ka, kb, kc): self.T.append((tuple(a), tuple(b), tuple(c), ka, kb, kc))
    def quad(self, a, b, c, d, k): self.tri(a, b, c, k); self.tri(a, c, d, k)
    def add(self, g, R=None, t=(0, 0, 0)):
        R = np.eye(3) if R is None else np.asarray(R); t = np.asarray(t, float)
        for p0, p1, p2, *ks in g.T: self.T.append((tuple(R @ p0 + t), tuple(R @ p1 + t), tuple(R @ p2 + t), *ks))
    def ntris(self): return len(self.T)
    def export(self, clip=True):
        """Recorta por la flotación (lo de debajo no se ve en el juego: el agua es opaca) y aplica el albedo de las tapas."""
        P, C = [], []
        for p0, p1, p2, k0, k1, k2 in self.T:
            pts = [np.array(p0, float), np.array(p1, float), np.array(p2, float)]
            n = np.cross(pts[1] - pts[0], pts[2] - pts[0]); ln = np.linalg.norm(n)
            if ln < 1e-12: continue
            top = abs(n[1] / ln) > 0.9
            cs = [np.array(col(k, top)) for k in (k0, k1, k2)]
            poly = list(zip(pts, cs))
            if clip:
                out = []
                for i in range(len(poly)):
                    (a, ca), (b, cb) = poly[i], poly[(i + 1) % len(poly)]
                    if a[1] >= 0: out.append((a, ca))
                    if (a[1] >= 0) != (b[1] >= 0):
                        t = a[1] / (a[1] - b[1]); out.append((a + t * (b - a), ca + t * (cb - ca)))
                poly = out
            for i in range(1, len(poly) - 1):
                for v, c in (poly[0], poly[i], poly[i + 1]): P.append(v); C.append(c)
        P = np.array(P).reshape(-1, 3, 3); C = np.array(C)
        n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
        return {'pos': P.reshape(-1).tolist(), 'nor': np.repeat(n, 3, axis=0).reshape(-1).tolist(), 'col': C.reshape(-1).tolist()}
def rot_y(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def rot_z(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
def jsround(x): return math.floor(x + 0.5)
def ring_pts(r, n, y, x=0, z=0, a0=0.0):
    return [(x + r * math.sin(a0 + 2 * math.pi * i / n), y, z + r * math.cos(a0 + 2 * math.pi * i / n)) for i in range(n)]
def prism(g, bot, top, side, cap, bottom=None):
    """Une dos anillos (listas de puntos) con caras laterales y tapa en abanico desde su centroide."""
    n = len(bot)
    for i in range(n):
        j = (i + 1) % n; g.quad(bot[i], bot[j], top[j], top[i], side)
    if cap:
        c = tuple(np.mean(np.array(top), axis=0))
        for i in range(n): g.tri(c, top[i], top[(i + 1) % n], cap)
    if bottom:
        c = tuple(np.mean(np.array(bot), axis=0))
        for i in range(n): g.tri(c, bot[(i + 1) % n], bot[i], bottom)
def cyl(g, rt, rb, h, n, x=0, y=0, z=0, side='rock', cap='rock', bottom=None, a0=0.0):
    """CylinderGeometry de three con la base en y."""
    prism(g, ring_pts(rb, n, y, x, z, a0), ring_pts(rt, n, y + h, x, z, a0), side, cap, bottom)
def cone(g, r, h, n, x=0, y=0, z=0, base='rock', tip=None):
    tip = tip or base; B = ring_pts(r, n, y, x, z); A = (x, y + h, z)
    for i in range(n): g.tri3(B[i], B[(i + 1) % n], A, base, base, tip)
def box(g, sx, sy, sz, x, y, z, a=0.0, side='town.wall', top=None):
    """BoxGeometry con el centro en (x, y, z), girada a en Y."""
    top = top or side; R = rot_y(a); o = np.array([x, y, z], float)
    v = {(i, j, k): tuple(R @ np.array([sx / 2 * i, sy / 2 * j, sz / 2 * k]) + o) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)}
    g.quad(v[-1, 1, -1], v[1, 1, -1], v[1, 1, 1], v[-1, 1, 1], top)
    g.quad(v[-1, -1, -1], v[-1, -1, 1], v[1, -1, 1], v[1, -1, -1], side)
    for a_, b_, c_, d_ in (((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1)), ((-1, -1, 1), (-1, 1, 1), (1, 1, 1), (1, -1, 1)),
                           ((-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1)), ((1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1))):
        g.quad(v[a_], v[b_], v[c_], v[d_], side)
def gable(g, sx, sz, h, x, y, z, a=0.0, k='town.roof'):
    """Tejado a dos aguas sobre una planta sx × sz, cumbrera a lo largo de x, alero en y."""
    R = rot_y(a); o = np.array([x, y, z], float); p = lambda px, py, pz: tuple(R @ np.array([px, py, pz]) + o)
    A, B, C, D = p(-sx / 2, 0, -sz / 2), p(sx / 2, 0, -sz / 2), p(sx / 2, 0, sz / 2), p(-sx / 2, 0, sz / 2)
    E_, F = p(-sx / 2, h, 0), p(sx / 2, h, 0)
    g.quad(A, B, F, E_, k); g.quad(D, E_, F, C, k); g.tri(A, E_, D, k); g.tri(B, C, F, k)
def hip(g, sx, sz, h, x, y, z, k='town.roof'):
    A, B, C, D = (x - sx / 2, y, z - sz / 2), (x + sx / 2, y, z - sz / 2), (x + sx / 2, y, z + sz / 2), (x - sx / 2, y, z + sz / 2)
    T = (x, y + h, z)
    for a_, b_ in ((A, B), (B, C), (C, D), (D, A)): g.tri(a_, b_, T, k)
def spar(g, p, q, r, n=5, k='mast'):
    p, q = np.array(p, float), np.array(q, float); d = q - p; d /= np.linalg.norm(d)
    u = np.cross(d, [0, 1, 0]) if abs(d[1]) < 0.9 else np.cross(d, [1, 0, 0]); u /= np.linalg.norm(u); v = np.cross(d, u)
    rg = lambda c: [tuple(c + r * (math.cos(2 * math.pi * i / n) * u + math.sin(2 * math.pi * i / n) * v)) for i in range(n)]
    A, B = rg(p), rg(q)
    for i in range(n): g.quad(A[i], A[(i + 1) % n], B[(i + 1) % n], B[i], k)
_T = (1 + 5 ** 0.5) / 2
ICO_V = np.array([[-1, _T, 0], [1, _T, 0], [-1, -_T, 0], [1, -_T, 0], [0, -1, _T], [0, 1, _T], [0, -1, -_T], [0, 1, -_T], [_T, 0, -1], [_T, 0, 1], [-_T, 0, -1], [-_T, 0, 1]], float)
ICO_V /= np.linalg.norm(ICO_V[0])
ICO_F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
def _dodeca():
    C = np.array([ICO_V[list(f)].mean(axis=0) for f in ICO_F]); C /= np.linalg.norm(C, axis=1, keepdims=True)
    faces = []
    for vi, v in enumerate(ICO_V):
        fs = [fi for fi, f in enumerate(ICO_F) if vi in f]
        u = np.cross(v, [0.3, 1, 0.1]); u /= np.linalg.norm(u); w = np.cross(v, u)
        fs.sort(key=lambda fi: math.atan2(C[fi] @ w, C[fi] @ u)); faces.append(fs)
    return C, faces
DOD_V, DOD_F = _dodeca()
def ico(g, r, x, y, z, sy=1.0, k='grass', a=0.0):
    R = rot_y(a); W = [tuple(R @ (v * np.array([r, r * sy, r])) + np.array([x, y, z])) for v in ICO_V]
    for i, j, l in ICO_F: g.tri(W[i], W[j], W[l], k)
def dodeca(g, r, x, y, z, k='rock', a=0.0, b=0.0):
    R = rot_y(a) @ rot_z(b); W = [R @ (v * r) + np.array([x, y, z]) for v in DOD_V]
    for f in DOD_F:
        for i in range(1, 4): g.tri(W[f[0]], W[f[i]], W[f[i + 1]], k)
def palm(g, x, y, z, a, s=1.0):
    """prop_palm (ASSET-SPEC §9.3): 3 tramos de 1,8 m, 0,22 → 0,16, +0,25 en X por tramo; 6 hojas de 0,9 × 3,4 cada 60°."""
    R = rot_y(a); o = np.array([x, y, z], float); P = lambda v: tuple(R @ (np.array(v, float) * s) + o)
    rad = [0.22, 0.20, 0.18, 0.16]
    for i in range(3):
        b0, b1 = np.array([0.25 * i, 1.8 * i, 0]), np.array([0.25 * (i + 1), 1.8 * (i + 1), 0])
        A = [P(b0 + rad[i] * np.array([math.sin(2 * math.pi * k / 5), 0, math.cos(2 * math.pi * k / 5)])) for k in range(5)]
        B = [P(b1 + rad[i + 1] * np.array([math.sin(2 * math.pi * k / 5), 0, math.cos(2 * math.pi * k / 5)])) for k in range(5)]
        for k in range(5): g.quad(A[k], A[(k + 1) % 5], B[(k + 1) % 5], B[k], 'palm.trunk')
    top = np.array([0.75, 5.4, 0])
    c20, s20 = math.cos(math.radians(20)), math.sin(math.radians(20))
    for k in range(6):
        b = 2 * math.pi * k / 6; d = np.array([math.cos(b), 0, math.sin(b)]); sd = np.array([-math.sin(b), 0, math.cos(b)]) * 0.45
        mid = top + d * 1.7 * c20 + np.array([0, -1.7 * s20, 0]); tip = top + d * 3.4 * c20 + np.array([0, -3.4 * s20 - 0.8, 0])
        g.quad(P(top - sd), P(top + sd), P(mid + sd), P(mid - sd), 'palm.leaf')
        g.quad(P(mid - sd), P(mid + sd), P(tip + sd), P(tip - sd), 'palm.leaf')
def hut(g, x, y, z):
    cyl(g, 1.6, 1.6, 2.2, 8, x, y, z, 'town.wall', 'town.wall'); cone(g, 2.2, 1.6, 8, x, y + 2.2, z, 'palm.trunk')
def buoy(g, x, z):
    cyl(g, 0.5, 0.7, 1.2, 6, x, -0.6, z, 'buoy.a', 'buoy.a'); cone(g, 0.5, 0.6, 6, x, 0.6, z, 'buoy.b')
def flag(g, x, y, z, w, h, a, k, k2=None, sq=0.0):
    """Bandera plana en el plano vertical que contiene la dirección a (rumbo), colgada del mástil en (x, y, z) hacia arriba."""
    d = np.array([math.sin(a), 0, math.cos(a)]); o = np.array([x, y, z], float)
    A, B, C, D = o, o + d * w, o + d * w + [0, -h, 0], o + [0, -h, 0]
    g.quad(A, B, C, D, k)
    if k2 and sq:
        c = o + d * w / 2 + [0, -h / 2, 0]; e = 0.01 * np.array([-d[2], 0, d[0]])
        for sgn in (1, -1):
            q = [c + d * dx + [0, dy, 0] + sgn * e for dx, dy in ((-sq / 2, sq / 2), (sq / 2, sq / 2), (sq / 2, -sq / 2), (-sq / 2, -sq / 2))]
            g.quad(*q, k2)

# Constructor de mallas con textura para los assets estáticos del mapa (puerto e islas de la 1.1; ASSET-SPEC §13, la
# cadena del piloto). Coordenadas del juego: +X este, +Y arriba, +Z sur (hacia la cámara); 1 u = 1 m. Cada vértice lleva
# posición, UV del atlas y color lineal (COLOR_0, que glTF multiplica por la textura). No corre en la CI.
import math
import numpy as np


def hexlin(h):
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


ONE = np.ones(3)


class Atlas:
    """Regiones del atlas: nombre → (x0, y0, w, h) en px y el tamaño en metros que cubre una repetición (mw, mh)."""
    def __init__(self, size=1024):
        self.size, self.reg = size, {}

    def add(self, name, x0, y0, w, h, mw, mh):
        self.reg[name] = (x0, y0, w, h, mw, mh)

    def uv(self, name, s, t):
        x0, y0, w, h, _, _ = self.reg[name]
        s = min(max(s, 0.0), 1.0); t = min(max(t, 0.0), 1.0)
        # medio texel de margen para que el filtrado no mezcle regiones vecinas
        ps = (x0 + 0.5 + s * (w - 1)) / self.size; pt = (y0 + 0.5 + t * (h - 1)) / self.size
        return (ps, 1.0 - pt)


class Mesh:
    def __init__(self, atlas):
        self.A = atlas; self.p, self.t, self.c = [], [], []
        self.white = atlas.uv('white', 0.5, 0.5)

    def tri(self, a, b, c, ta, tb, tc, col=ONE):
        col = hexlin(col) if isinstance(col, str) else np.asarray(col, float)
        self.p += [tuple(a), tuple(b), tuple(c)]; self.t += [ta, tb, tc]; self.c += [col, col, col]

    def quad(self, a, b, c, d, ta, tb, tc, td, col=ONE):
        self.tri(a, b, c, ta, tb, tc, col); self.tri(a, c, d, ta, tc, td, col)

    def solid(self, a, b, c, d, col):
        w = self.white; self.quad(a, b, c, d, w, w, w, w, col)

    def soltri(self, a, b, c, col):
        w = self.white; self.tri(a, b, c, w, w, w, col)

    def ntri(self):
        return len(self.p) // 3

    def tiled(self, o, du, dv, lu, lv, reg, col=ONE, u_off=0.0, v_off=0.0):
        """Rectángulo plano desde el punto o, con lados du (largo lu m) y dv (largo lv m), partido en teselas del tamaño
        de la región: cada tesela muestrea la región completa o la parte que le toca. Normal = du × dv."""
        _, _, _, _, mw, mh = self.A.reg[reg]
        o, du, dv = np.asarray(o, float), np.asarray(du, float), np.asarray(dv, float)
        du = du / np.linalg.norm(du); dv = dv / np.linalg.norm(dv)
        us = _cuts(lu, mw, u_off); vs = _cuts(lv, mh, v_off)
        for (u0, u1, s0, s1) in us:
            for (v0, v1, t0, t1) in vs:
                a = o + du * u0 + dv * v0; b = o + du * u1 + dv * v0; c = o + du * u1 + dv * v1; d = o + du * u0 + dv * v1
                A = self.A
                self.quad(a, b, c, d, A.uv(reg, s0, 1 - t0), A.uv(reg, s1, 1 - t0), A.uv(reg, s1, 1 - t1), A.uv(reg, s0, 1 - t1), col)

    def wall(self, a, b, y0, y1, reg, col=ONE, v_off=0.0):
        """Pared vertical de a=(x, z) a b=(x, z) entre y0 e y1, que mira a la derecha del sentido a→b visto desde arriba
        (con +Z al sur: recorrer en sentido horario visto en pantalla deja la cara hacia fuera)."""
        a3 = (a[0], y0, a[1]); du = (b[0] - a[0], 0, b[1] - a[1]); lu = math.hypot(*du[::2])
        if lu < 1e-6: return
        self.tiled(a3, du, (0, 1, 0), lu, y1 - y0, reg, col, v_off=v_off)

    def ground(self, x0, z0, x1, z1, y, reg, col=ONE):
        """Rectángulo horizontal (normal +Y) de (x0, z0) a (x1, z1)."""
        self.tiled((x0, y, z1), (1, 0, 0), (0, 0, -1), x1 - x0, z1 - z0, reg, col)


def _cuts(L, m, off=0.0):
    """Cortes de un largo L en teselas de m metros: [(desde, hasta, s0, s1)] con s en fracción de la región."""
    out, x = [], 0.0
    while x < L - 1e-6:
        start_in_tile = ((x + off) % m) / m
        step = min(m * (1 - start_in_tile), L - x)
        out.append((x, x + step, start_in_tile, start_in_tile + step / m)); x += step
    return out


def box(m, cx, cz, sx, sz, y0, y1, side, top=None, rot=0.0, col=ONE, top_col=None, bottom=False):
    """Caja girada rot (rad, como el rumbo: hacia +X desde +Z) con las 4 caras de `side` y la tapa de `top`."""
    c, s = math.cos(rot), math.sin(rot)
    def P(x, z): return (cx + c * x + s * z, cz - s * x + c * z)
    hx, hz = sx / 2, sz / 2
    corners = [P(-hx, hz), P(hx, hz), P(hx, -hz), P(-hx, -hz)]  # SO, SE, NE, NO (sentido antihorario visto en pantalla)
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        m.wall(a, b, y0, y1, side, col) if side != 'white' else m.solid((a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1]), col)
    if top is not None:
        tc = top_col if top_col is not None else col
        a, b, cc, d = [(x, y1, z) for x, z in corners]
        if top == 'white':
            m.solid(a, b, cc, d, tc)
        else:
            m.tiled(a, np.subtract(b, a), np.subtract(d, a), sx, sz, top, tc)
    return corners


def gable(m, cx, cz, sx, sz, y0, h, reg, rot=0.0, col=ONE, gable_reg=None, gable_col=ONE, eave=0.35):
    """Tejado a dos aguas con la cumbrera a lo largo de x local (sx), alero de `eave` m, y los 2 hastiales."""
    c, s = math.cos(rot), math.sin(rot)
    def P(x, y, z): return (cx + c * x + s * z, y, cz - s * x + c * z)
    hx, hz = sx / 2 + eave, sz / 2 + eave
    ridge = y0 + h
    for side in (1, -1):  # agua sur (+z local) y norte
        a = P(-hx, y0, side * hz); b = P(hx, y0, side * hz); d = P(-hx, ridge, 0)
        if side == 1:
            m.tiled(a, np.subtract(b, a), np.subtract(d, a), 2 * hx, math.hypot(hz, h), reg, col)
        else:
            m.tiled(b, np.subtract(a, b), np.subtract(P(hx, ridge, 0), b), 2 * hx, math.hypot(hz, h), reg, col)
    for side in (1, -1):  # hastiales (triángulos de pared)
        x = side * sx / 2
        a = P(x, y0, side * sz / 2); b = P(x, y0, -side * sz / 2); t = P(x, ridge - h * eave / hz, 0)
        if gable_reg is None:
            m.soltri(a, b, t, gable_col)
        else:
            A = m.A; m.tri(a, b, t, A.uv(gable_reg, 0, 0.0), A.uv(gable_reg, 1, 0.0), A.uv(gable_reg, 0.5, 0.6), gable_col)


def hip(m, cx, cz, sx, sz, y0, h, reg, rot=0.0, col=ONE, eave=0.35):
    """Tejado a cuatro aguas."""
    c, s = math.cos(rot), math.sin(rot)
    def P(x, y, z): return (cx + c * x + s * z, y, cz - s * x + c * z)
    hx, hz = sx / 2 + eave, sz / 2 + eave
    r = max(0.0, hx - hz)
    top = y0 + h
    A0, B0, C0, D0 = P(-hx, y0, hz), P(hx, y0, hz), P(hx, y0, -hz), P(-hx, y0, -hz)
    R0, R1 = P(-r, top, 0), P(r, top, 0)
    W = m.A.uv
    sl = math.hypot(hz, h)
    for (a, b, rr0, rr1) in ((A0, B0, R0, R1), (C0, D0, R1, R0)):
        m.quad(a, b, rr1, rr0, W(reg, 0, 1), W(reg, 1, 1), W(reg, 0.5 + r / (2 * hx), 0), W(reg, 0.5 - r / (2 * hx), 0), col)
    for (a, b, rr) in ((B0, C0, R1), (D0, A0, R0)):
        m.tri(a, b, rr, W(reg, 0, 1), W(reg, 1, 1), W(reg, 0.5, 0), col)


def cylinder(m, cx, cz, r0, r1, y0, y1, n, reg=None, col=ONE, top=False, top_col=None, a0=0.0):
    for i in range(n):
        t0 = a0 + 2 * math.pi * i / n; t1 = a0 + 2 * math.pi * (i + 1) / n
        p = [(cx + r0 * math.sin(t0), y0, cz + r0 * math.cos(t0)), (cx + r0 * math.sin(t1), y0, cz + r0 * math.cos(t1)),
             (cx + r1 * math.sin(t1), y1, cz + r1 * math.cos(t1)), (cx + r1 * math.sin(t0), y1, cz + r1 * math.cos(t0))]
        if reg is None:
            m.solid(*p, col)
        else:
            W = m.A.uv; m.quad(*p, W(reg, i / n, 1), W(reg, (i + 1) / n, 1), W(reg, (i + 1) / n, 0), W(reg, i / n, 0), col)
        if top:
            m.soltri(p[3], p[2], (cx, y1, cz), top_col if top_col is not None else col)


def dome(m, cx, cz, r, y0, n, rings, col, squash=1.0):
    for j in range(rings):
        a0 = math.pi / 2 * j / rings; a1 = math.pi / 2 * (j + 1) / rings
        r0, r1 = r * math.cos(a0), r * math.cos(a1); h0, h1 = y0 + squash * r * math.sin(a0), y0 + squash * r * math.sin(a1)
        for i in range(n):
            t0 = 2 * math.pi * i / n; t1 = 2 * math.pi * (i + 1) / n
            p0 = (cx + r0 * math.sin(t0), h0, cz + r0 * math.cos(t0)); p1 = (cx + r0 * math.sin(t1), h0, cz + r0 * math.cos(t1))
            q1 = (cx + r1 * math.sin(t1), h1, cz + r1 * math.cos(t1)); q0 = (cx + r1 * math.sin(t0), h1, cz + r1 * math.cos(t0))
            if j == rings - 1:
                m.soltri(p0, p1, q0, col)
            else:
                m.solid(p0, p1, q1, q0, col)


def prism(m, p, q, r, n, col):
    """Cilindro de n lados de p a q, sin tapas (palos, troncos, cabos)."""
    p, q = np.array(p, float), np.array(q, float); dv = q - p; L = np.linalg.norm(dv); dv /= L
    a = np.cross(dv, [0, 1, 0]) if abs(dv[1]) < 0.9 else np.cross(dv, [1, 0, 0]); a /= np.linalg.norm(a); b = np.cross(dv, a)
    ring = [(math.cos(2 * math.pi * k / n), math.sin(2 * math.pi * k / n)) for k in range(n)]
    A = [p + r * (c * a + s * b) for c, s in ring]; B = [q + r * (c * a + s * b) for c, s in ring]
    for i in range(n):
        m.solid(tuple(A[i]), tuple(A[(i + 1) % n]), tuple(B[(i + 1) % n]), tuple(B[i]), col)


def rock(m, x, z, r, h, rng, col, y0=-0.4):
    """Roca baja de 5 lados con la tapa inclinada (escollera)."""
    n = 5; a0 = rng.uniform(0, 2 * math.pi)
    base = [(x + r * rng.uniform(0.8, 1.1) * math.sin(a0 + 2 * math.pi * k / n), z + r * rng.uniform(0.8, 1.1) * math.cos(a0 + 2 * math.pi * k / n)) for k in range(n)]
    topc = (x + rng.uniform(-0.15, 0.15) * r, y0 + h, z + rng.uniform(-0.15, 0.15) * r)
    mid = [(bx + (topc[0] - bx) * 0.45, y0 + h * rng.uniform(0.55, 0.8), bz + (topc[2] - bz) * 0.45) for bx, bz in base]
    shade = [np.asarray(hexlin(col) if isinstance(col, str) else col) * rng.uniform(0.85, 1.12) for _ in range(n)]
    for k in range(n):
        a, b = base[k], base[(k + 1) % n]
        m.solid((a[0], y0, a[1]), (b[0], y0, b[1]), mid[(k + 1) % n], mid[k], shade[k])
        m.soltri(mid[k], mid[(k + 1) % n], topc, shade[k] * 1.08)


def palm(m, x, z, y0, h, rng, trunk='#8A5A3B', leaf='#4E9A3E', leaf2='#3F7A35', lean=None, fronds=7):
    """Palmera de ≤ 60 triángulos: tronco curvo de 4 tramos y hojas caídas de 2 triángulos (prop_palm, ≤ 100 tris)."""
    ang = rng.uniform(0, 2 * math.pi) if lean is None else lean
    lx, lz = math.sin(ang), math.cos(ang); bend = rng.uniform(0.6, 1.4)
    pts = [(x + lx * bend * (k / 4) ** 2 * h * 0.25, y0 + h * k / 4, z + lz * bend * (k / 4) ** 2 * h * 0.25) for k in range(5)]
    for k in range(4):
        prism(m, pts[k], pts[k + 1], 0.22 - 0.03 * k, 4, trunk)
    top = np.array(pts[-1])
    a0 = rng.uniform(0, 2 * math.pi)
    for k in range(fronds):
        a = a0 + 2 * math.pi * k / fronds + rng.uniform(-0.2, 0.2)
        L = h * rng.uniform(0.42, 0.55); d = np.array([math.sin(a), 0, math.cos(a)]); side = np.array([math.cos(a), 0, -math.sin(a)])
        mid = top + d * L * 0.5 + np.array([0, 0.25, 0]); tip = top + d * L + np.array([0, -L * 0.45, 0])
        w = L * 0.17; col = leaf if k % 2 == 0 else leaf2
        m.soltri(tuple(top), tuple(mid + side * w), tuple(mid - side * w), col)
        m.soltri(tuple(mid + side * w), tuple(tip), tuple(mid - side * w), col)


def tree(m, x, z, y0, h, rng, trunk='#6B4426', leaves=('#3F7A35', '#4E8F3A', '#5E9E48')):
    """Árbol de copa ancha (ceiba): tronco y 3 copas de 8 caras."""
    prism(m, (x, y0, z), (x, y0 + h * 0.45, z), 0.3, 5, trunk)
    for k in range(3):
        a = 2 * math.pi * k / 3 + rng.uniform(0, 1); rr = h * rng.uniform(0.26, 0.34)
        cx, cy, cz = x + math.sin(a) * h * 0.18, y0 + h * rng.uniform(0.62, 0.78), z + math.cos(a) * h * 0.18
        blob(m, cx, cy, cz, rr, leaves[k % len(leaves)])


def blob(m, cx, cy, cz, r, col):
    """Octaedro achatado (8 caras): copa de árbol o arbusto."""
    t = (cx, cy + r * 0.8, cz); b = (cx, cy - r * 0.5, cz)
    ring = [(cx + r, cy, cz), (cx, cy, cz + r), (cx - r, cy, cz), (cx, cy, cz - r)]
    c = hexlin(col)
    for i in range(4):
        p, q = ring[i], ring[(i + 1) % 4]
        m.soltri(q, p, t, c * 1.08)
        m.soltri(p, q, b, c * 0.9)

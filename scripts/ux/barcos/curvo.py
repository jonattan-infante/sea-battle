# Biblioteca de la cadena de arte con curvas (lámina de prueba de la respuesta de realismo, 2026-10-18; ASSET-SPEC §13).
# No se lanza sola: la usan navio_curvo.py y pirata_curvo.py. Construye en coordenadas del juego (+Y arriba, proa +Z,
# pivote en la flotación; ASSET-SPEC §2):
#   - el perfil del casco con la interpolación de Hermite del juego (ship-geometry.ts `sample`, D23), no en tramos rectos
#     como el piloto de D80 (navio.py:20-21), que dejaba la proa en cuña;
#   - la sección con la curva hacia dentro de los navíos de la época (tumblehome): la manga máxima en la batería baja y el
#     costado que se cierra hacia la regala, en lugar del plano inclinado de navio.py:45-48;
#   - los castillos como parte del casco (la regala sube con una curva suave y las cubiertas altas van dentro del costado),
#     no como cajas (navio.py:79);
#   - la popa con caída hacia atrás y el espejo abombado, y las galerías de popa redondeadas;
#   - un atlas en el que cada superficie tiene su propio sitio (la oclusión se hornea sin pisarse; babor y estribor comparten
#     el suyo, porque el casco es simétrico, y solo babor se hornea: atributo bk).
import math
import numpy as np

PROFILES = {  # ship-geometry.ts PROFILES: u, a (semimanga en cubierta), b (en la flotación), s (arrufo), k (quilla)
    'standard': [(-0.5, 0.8, 0.62, 1.3, 0.35), (-0.4, 0.96, 0.85, 1.15, 0.75), (-0.25, 1.0, 0.93, 1.04, 1.0), (0.0, 1.0, 0.95, 1.0, 1.0),
                 (0.2, 0.97, 0.88, 1.03, 1.0), (0.36, 0.72, 0.56, 1.12, 0.85), (0.5, 0.0, 0.0, 1.28, 0.3)],
    'fine': [(-0.5, 0.62, 0.48, 1.18, 0.35), (-0.4, 0.88, 0.78, 1.08, 0.75), (-0.25, 1.0, 0.92, 1.02, 1.0), (0.0, 1.0, 0.94, 1.0, 1.0),
             (0.2, 0.92, 0.82, 1.02, 1.0), (0.36, 0.55, 0.42, 1.1, 0.85), (0.5, 0.0, 0.0, 1.25, 0.3)],
    'flat': [(-0.5, 0.86, 0.78, 1.1, 0.4), (-0.4, 0.98, 0.94, 1.04, 0.8), (-0.25, 1.0, 0.98, 1.0, 1.0), (0.0, 1.0, 0.98, 1.0, 1.0),
             (0.2, 1.0, 0.97, 1.0, 1.0), (0.36, 0.92, 0.85, 1.04, 0.9), (0.5, 0.45, 0.3, 1.12, 0.5)]}


def sample(rows, u):
    """Hermite con tangentes por diferencias finitas, como `sample` de ship-geometry.ts (D23)."""
    n = len(rows)
    if u <= rows[0][0]: return rows[0][1:]
    if u >= rows[-1][0]: return rows[-1][1:]
    i = 0
    while u > rows[i + 1][0]: i += 1
    p, q = rows[i], rows[i + 1]; h = q[0] - p[0]; t = (u - p[0]) / h
    sl = lambda j, c: (rows[min(n - 1, j + 1)][c] - rows[max(0, j - 1)][c]) / (rows[min(n - 1, j + 1)][0] - rows[max(0, j - 1)][0])
    v = lambda c: (2 * t**3 - 3 * t**2 + 1) * p[c] + (t**3 - 2 * t**2 + t) * h * sl(i, c) + (-2 * t**3 + 3 * t**2) * q[c] + (t**3 - t**2) * h * sl(i + 1, c)
    return (max(0.0, v(1)), max(0.0, v(2)), v(3), max(0.0, v(4)))


def hexlin(h):
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def smooth(t):
    t = min(max(t, 0.0), 1.0); return t * t * (3 - 2 * t)


class Atlas:
    """Regiones en px (origen arriba a la izquierda) de un atlas de A²; uv() devuelve la UV de glTF (v hacia arriba)."""
    def __init__(self, regions, A=1024, pad=2):
        self.R, self.A, self.pad = dict(regions), A, pad
        self.R.setdefault('white', (A - 24, A - 24, 16, 16))

    def uv(self, name, s, t):
        """El pintado llena la región entera; la UV deja `pad` px de margen para que el filtrado no mezcle regiones."""
        x0, y0, w, h = self.R[name]; p = self.pad
        return ((x0 + p + s * (w - 2 * p)) / self.A, 1 - (y0 + p + t * (h - 2 * p)) / self.A)

    def px(self, name, s, t):
        """Inversa de uv() en px del atlas (para pintar en el mismo sitio que mapea la malla)."""
        x0, y0, w, h = self.R[name]; p = self.pad
        return (x0 + p + s * (w - 2 * p), y0 + p + t * (h - 2 * p))

    @property
    def white(self): return self.uv('white', 0.5, 0.5)


class Mesh:
    """Triángulos sueltos: posición, UV, color lineal (COLOR_0), máscara del casco (_RIM_MASK) y bk (1 = se hornea)."""
    def __init__(self, atlas):
        self.at = atlas; self.p, self.t, self.c, self.r, self.b = [], [], [], [], []

    def tri(self, a, b, c, ta, tb, tc, col=None, rim=0.0, bk=0):
        col = np.ones(3) if col is None else (hexlin(col) if isinstance(col, str) else np.asarray(col, float))
        self.p += [a, b, c]; self.t += [ta, tb, tc]; self.c += [col] * 3; self.r += [rim] * 3; self.b += [bk] * 3

    def quad(self, a, b, c, d, ta, tb, tc, td, col=None, rim=0.0, bk=0):
        self.tri(a, b, c, ta, tb, tc, col, rim, bk); self.tri(a, c, d, ta, tc, td, col, rim, bk)

    def solid(self, a, b, c, d, col, rim=0.0):
        w = self.at.white; self.quad(a, b, c, d, w, w, w, w, col, rim, 0)

    def ntri(self): return len(self.p) // 3

    def arrays(self):
        return dict(p=np.array(self.p, float), t=np.array(self.t, float), c=np.array(self.c, float), r=np.array(self.r, float), b=np.array(self.b, float))


def prism(m, p, q, r, n, col, rim=0.0):
    """Cilindro de n lados de p a q (sin tapas), en color plano."""
    p, q = np.array(p, float), np.array(q, float); dv = q - p; dv /= np.linalg.norm(dv)
    a = np.cross(dv, [0, 1, 0]) if abs(dv[1]) < 0.9 else np.cross(dv, [1, 0, 0]); a /= np.linalg.norm(a); b = np.cross(dv, a)
    ring = lambda c: [c + r * (math.cos(2 * math.pi * i / n) * a + math.sin(2 * math.pi * i / n) * b) for i in range(n)]
    A, B = ring(p), ring(q)
    for i in range(n): m.solid(tuple(A[i]), tuple(A[(i + 1) % n]), tuple(B[(i + 1) % n]), tuple(B[i]), col, rim)


def cuboid(m, cx, cy, cz, sx, sy, sz, col, top=None, rim=0.0, ry=0.0):
    c, s_ = math.cos(ry), math.sin(ry)
    P = lambda x, y, z: (cx + x * c + z * s_, cy + y, cz - x * s_ + z * c)
    X, Y, Z = sx / 2, sy / 2, sz / 2
    g = lambda i, j, k: P(i * X, j * Y, k * Z)
    m.solid(g(-1, 1, -1), g(-1, 1, 1), g(1, 1, 1), g(1, 1, -1), top or col, rim)
    for a_, b_, c_, d_ in (((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1)), ((1, -1, 1), (-1, -1, 1), (-1, 1, 1), (1, 1, 1)),
                           ((-1, -1, 1), (-1, -1, -1), (-1, 1, -1), (-1, 1, 1)), ((1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1))):
        m.solid(g(*a_), g(*b_), g(*c_), g(*d_), col, rim)


def barrel(m, cx, cy, cz, r, h, col, band, n=6):
    """Barril de n duelas con 2 aros oscuros: 3 tramos de prisma de radio creciente al centro."""
    ys = [cy - h / 2, cy - 0.3 * h, cy + 0.3 * h, cy + h / 2]; rs = [0.85 * r, r, r, 0.85 * r]
    for k in range(3):
        p, q = np.array([cx, ys[k], cz]), np.array([cx, ys[k + 1], cz])
        ring = lambda c, rr: [c + rr * np.array([math.cos(2 * math.pi * i / n), 0, math.sin(2 * math.pi * i / n)]) for i in range(n)]
        A, B = ring(p, rs[k]), ring(q, rs[k + 1])
        for i in range(n): m.solid(tuple(A[i]), tuple(A[(i + 1) % n]), tuple(B[(i + 1) % n]), tuple(B[i]), band if k != 1 else col)
    ring = [(cx + 0.85 * r * math.cos(2 * math.pi * i / n), cy + h / 2, cz + 0.85 * r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    w = m.at.white
    for i in range(1, n - 1): m.tri(ring[0], ring[i + 1], ring[i], w, w, w, col)


class Hull:
    """Casco con curvas. tiers: castillos como dict(kind='aft'|'fore', edge=z del borde que mira al combés, h=alto de su
    cubierta sobre la principal, ramp=largo de la subida de la regala). y_m: alto de la manga máxima (la batería baja).
    T: cuánto se cierra el costado hacia dentro (fracción de la semimanga) H_T metros por encima de y_m."""
    def __init__(self, L, B, F, D, RAIL, profile, y_m, T, tiers=(), H_T=None, tb=0.25, over=(0.42, 1.5, 0.12), bulge=0.4):
        self.L, self.B, self.F, self.D, self.RAIL, self.rows = L, B, F, D, RAIL, PROFILES[profile]
        self.hb = B / 2; self.y_m, self.T, self.tiers, self.tb = y_m, T, list(tiers), tb
        self.H_T = H_T or (F + RAIL - y_m)
        self.over_u, self.over_y, self.over_k = over; self.bulge = bulge

    def prof(self, z): return sample(self.rows, z / self.L)
    def y0(self, z): return self.prof(z)[2] * self.F
    def sheer(self, z): return self.y0(z) - self.F  # lo que sube la cubierta sobre la de la maestra (v de la textura)

    def deck_h(self, z):
        """Alto de la cubierta local sobre la principal (escalón: la del castillo que cubre z, o 0 en el combés)."""
        h = 0.0
        for t in self.tiers:
            if (t['kind'] == 'aft' and z <= t['edge'] + 1e-6) or (t['kind'] == 'fore' and z >= t['edge'] - 1e-6): h = max(h, t['h'])
        return h

    def rail_rise(self, z):
        """Lo que sube la regala: igual al castillo sobre él y con una curva suave hacia el combés (sin escalones)."""
        h = 0.0
        for t in self.tiers:
            d = (z - t['edge']) if t['kind'] == 'aft' else (t['edge'] - z)
            h = max(h, t['h'] * (1 - smooth(d / t['ramp'])) if d > 0 else t['h'])
        return h

    def top(self, z): return self.y0(z) + self.rail_rise(z) + self.RAIL

    def x_at(self, z, y):
        a, b, s, k = self.prof(z); hb = self.hb
        if y >= self.y_m:  # se cierra con t² cerca de la manga máxima y se modera en los castillos altos (t²/(1 + 0,35·t²))
            t2 = ((y - self.y_m) / self.H_T) ** 2
            return max(a * hb - self.T * hb * t2 / (1 + 0.35 * t2), 0.4 * a * hb)
        if y >= 0: return b * hb + (a * hb - b * hb) * math.sin(0.5 * math.pi * y / self.y_m)
        th = min(1.0, -y / max(k * self.D, 1e-6)) * 0.5 * math.pi
        return b * hb * math.cos(th) ** 0.6

    def ys(self, z, nup, nuw):
        """Altos de la sección: bajo el agua (nuw tramos hasta la quilla), 2 tramos hasta y_m y nup tramos hasta la regala."""
        k = self.prof(z)[3]; kd = k * self.D; top = self.top(z)
        under = [-kd * math.sin(0.5 * math.pi * (1 - i / nuw)) for i in range(nuw)]
        up = [0.0, 0.5 * self.y_m, self.y_m] + [self.y_m + (top - self.y_m) * (i / nup) for i in range(1, nup + 1)]
        return under + up  # de la quilla a la regala

    def warp(self, x, y, z):
        """Caída de la popa: cerca del espejo, lo que está por encima de over_y se va hacia atrás over_k m por metro."""
        u = z / self.L; w = smooth((-self.over_u - u) / (0.5 - self.over_u))
        return (x, y, z - w * self.over_k * max(0.0, y - self.over_y))

    def v_hull(self, z, y, V_TOP, V_BOT):
        return (V_TOP - (y - self.sheer(z))) / (V_TOP - V_BOT)

    def stations(self, n, fr=(0.0, 1 / 3, 2 / 3, 1.0)):
        """n estaciones uniformes más, en cada castillo, su borde y la subida de la regala (fracciones fr de la rampa)."""
        keep = [-self.L / 2, self.L / 2] + [t['edge'] for t in self.tiers]  # los bordes de los castillos siempre
        cand = list(np.linspace(-self.L / 2, self.L / 2, n))
        for t in self.tiers:
            sgn = 1 if t['kind'] == 'aft' else -1
            cand += [t['edge'] + sgn * t['ramp'] * f for f in fr]
        out = list(keep)
        for z in cand:
            if -self.L / 2 < z < self.L / 2 and min(abs(z - q) for q in out) > 0.25: out.append(z)
        return sorted(out)


def build_hull(m, H, zs, nup, nuw, V_TOP, V_BOT, rail_col, inner=True):
    """Costados (región hull, babor horneado), cara interior de la borda (región inner) y la tapa de la regala (sólida).
    Devuelve las secciones por estación para cerrar la popa."""
    W = H.warp; secs = []
    for z in zs:
        ys = H.ys(z, nup, nuw); secs.append((z, [(H.x_at(z, y), y) for y in ys]))
    for side in (1, -1):
        bk = 1 if side == 1 else 0
        for i in range(len(secs) - 1):
            (z0, S0), (z1, S1) = secs[i], secs[i + 1]
            u0, u1 = (z0 + H.L / 2) / H.L, (z1 + H.L / 2) / H.L
            for j in range(len(S0) - 1):
                P = [W(side * S0[j][0], S0[j][1], z0), W(side * S1[j][0], S1[j][1], z1), W(side * S1[j + 1][0], S1[j + 1][1], z1), W(side * S0[j + 1][0], S0[j + 1][1], z0)]
                T = [m.at.uv('hull', u0, H.v_hull(z0, S0[j][1], V_TOP, V_BOT)), m.at.uv('hull', u1, H.v_hull(z1, S1[j][1], V_TOP, V_BOT)),
                     m.at.uv('hull', u1, H.v_hull(z1, S1[j + 1][1], V_TOP, V_BOT)), m.at.uv('hull', u0, H.v_hull(z0, S0[j + 1][1], V_TOP, V_BOT))]
                if side == 1: P, T = P[::-1], T[::-1]  # el giro de las caras hacia fuera en los 2 costados
                m.quad(*P, *T, rim=1.0, bk=bk)
            if not inner: continue
            # cara interior de la borda: de la cubierta local a la regala, tb m hacia dentro de la curva
            hm = H.deck_h(0.5 * (z0 + z1))  # las estaciones incluyen los bordes de los castillos: ningún tramo los cruza
            yl0, yl1 = H.y0(z0) + hm, H.y0(z1) + hm
            t0, t1 = H.top(z0), H.top(z1)
            xi = lambda z, y: max(H.x_at(z, y) - H.tb, 0.5 * H.x_at(z, y))
            P = [W(side * xi(z0, yl0), yl0, z0), W(side * xi(z1, yl1), yl1, z1), W(side * xi(z1, t1), t1, z1), W(side * xi(z0, t0), t0, z0)]
            vi = lambda z, y: (H.top(z) - y) / 4.0
            T = [m.at.uv('inner', u0, vi(z0, yl0)), m.at.uv('inner', u1, vi(z1, yl1)), m.at.uv('inner', u1, 0.0), m.at.uv('inner', u0, 0.0)]
            if side == -1: P, T = P[::-1], T[::-1]
            m.quad(*P, *T, rim=1.0, bk=bk)
            # tapa de la regala
            m.solid(W(side * S0[-1][0], t0, z0), W(side * S1[-1][0], t1, z1), W(side * xi(z1, t1), t1, z1), W(side * xi(z0, t0), t0, z0), rail_col, 1.0)
    return secs


def build_deck(m, H, zs, region, za, zb, h, v_span, planks=True):
    """Cubierta a h m sobre la principal (siguiendo el arrufo) entre za y zb, de borda a borda, en su propia región."""
    W = H.warp; zz = [z for z in zs if za - 1e-6 <= z <= zb + 1e-6]
    if not zz or abs(zz[0] - za) > 1e-6: zz = [za] + zz
    if abs(zz[-1] - zb) > 1e-6: zz = zz + [zb]
    for i in range(len(zz) - 1):
        z0, z1 = zz[i], zz[i + 1]; y0, y1 = H.y0(z0) + h, H.y0(z1) + h
        xi = lambda z, y: max(H.x_at(z, y) - H.tb, 0.5 * H.x_at(z, y))  # en la proa la manga tiende a 0
        x0, x1 = xi(z0, y0), xi(z1, y1)
        s0, s1 = (z0 - za) / (zb - za), (z1 - za) / (zb - za)
        tv = lambda x: 0.5 - x / v_span
        P = [W(-x0, y0, z0), W(x0, y0, z0), W(x1, y1, z1), W(-x1, y1, z1)]
        T = [m.at.uv(region, s0, tv(-x0)), m.at.uv(region, s0, tv(x0)), m.at.uv(region, s1, tv(x1)), m.at.uv(region, s1, tv(-x1))]
        m.quad(*P[::-1], *T[::-1], rim=1.0, bk=1)


def build_wall(m, H, region, z, y_lo_h, y_hi_h, facing, bulge=0.25, ncol=6):
    """Mamparo de un castillo (la cara que mira al combés), de borda a borda y un poco abombado hacia el combés."""
    W = H.warp; yl, yh = H.y0(z) + y_lo_h, H.y0(z) + y_hi_h
    xl, xh = H.x_at(z, yl) - H.tb, H.x_at(z, yh) - H.tb
    for c in range(ncol):
        f0, f1 = -1 + 2 * c / ncol, -1 + 2 * (c + 1) / ncol
        zf = lambda f: z + facing * bulge * (1 - f * f)
        P = [W(f0 * xl, yl, zf(f0)), W(f1 * xl, yl, zf(f1)), W(f1 * xh, yh, zf(f1)), W(f0 * xh, yh, zf(f0))]
        T = [m.at.uv(region, (f0 + 1) / 2, 1), m.at.uv(region, (f1 + 1) / 2, 1), m.at.uv(region, (f1 + 1) / 2, 0), m.at.uv(region, (f0 + 1) / 2, 0)]
        if facing < 0: P, T = P[::-1], T[::-1]
        m.quad(*P, *T, rim=1.0, bk=1)
    return xl, xh, yl, yh


def build_stern(m, H, sec, ncol=6, y_top=None, region='stern', aft=True):
    """Espejo de popa abombado hacia atrás (bulge m en el centro), por filas de la sección de popa (región stern). Con
    aft=False, la cara de proa de un casco que no acaba en punta (perfil `flat`), abombada hacia delante."""
    W = H.warp; z, S = sec; sg = -1 if aft else 1
    ys = [y for _, y in S]; ytop = y_top or ys[-1]; ybot = ys[0]
    for j in range(len(S) - 1):
        (xa, ya), (xb, yb) = S[j], S[j + 1]
        for c in range(ncol):
            f0, f1 = -1 + 2 * c / ncol, -1 + 2 * (c + 1) / ncol
            zb = lambda f: z + sg * H.bulge * (1 - f * f)
            P = [W(f0 * xa, ya, zb(f0)), W(f1 * xa, ya, zb(f1)), W(f1 * xb, yb, zb(f1)), W(f0 * xb, yb, zb(f0))]
            tv = lambda y: (ytop - y) / (ytop - ybot)
            T = [m.at.uv(region, 0.5 + f0 * xa / (2 * H.hb), tv(ya)), m.at.uv(region, 0.5 + f1 * xa / (2 * H.hb), tv(ya)),
                 m.at.uv(region, 0.5 + f1 * xb / (2 * H.hb), tv(yb)), m.at.uv(region, 0.5 + f0 * xb / (2 * H.hb), tv(yb))]
            if aft: P, T = P[::-1], T[::-1]  # cara hacia popa (−Z); la de proa ya mira a +Z
            m.quad(*P, *T, rim=1.0, bk=1)


def build_gallery(m, H, z0, z1, ylo, yhi, out, cap_col, nz=6, ny=3):
    """Galería de popa redondeada en cada costado: media elipse en planta que sobresale `out` m (región gal, babor)."""
    W = H.warp; zc, hz = (z0 + z1) / 2, (z1 - z0) / 2
    for side in (1, -1):
        bk = 1 if side == 1 else 0
        grid = []
        for j in range(ny + 1):
            y = ylo + (yhi - ylo) * j / ny; barrel_ = 1 - 0.25 * (2 * j / ny - 1) ** 2
            row = []
            for i in range(nz + 1):
                z = z0 + (z1 - z0) * i / nz; e = math.sqrt(max(0.0, 1 - ((z - zc) / hz) ** 2))
                row.append((side * (H.x_at(z, y) + out * e * barrel_ - 0.05), y, z))
            grid.append(row)
        for j in range(ny):
            for i in range(nz):
                P = [W(*grid[j][i]), W(*grid[j][i + 1]), W(*grid[j + 1][i + 1]), W(*grid[j + 1][i])]
                T = [m.at.uv('gal', i / nz, 1 - j / ny), m.at.uv('gal', (i + 1) / nz, 1 - j / ny), m.at.uv('gal', (i + 1) / nz, 1 - (j + 1) / ny), m.at.uv('gal', i / nz, 1 - (j + 1) / ny)]
                if side == 1: P, T = P[::-1], T[::-1]
                m.quad(*P, *T, rim=1.0, bk=bk)
        w = m.at.white
        for j in (0, ny):  # tejadillo y fondo: abanico desde el costado
            y = grid[j][0][1]; base = W(side * H.x_at(zc, y), y, zc)
            for i in range(nz):
                m.tri(base, W(*grid[j][i]), W(*grid[j][i + 1]), w, w, w, cap_col, 1.0)


def vertex_normals(P, crease_deg=40.0):
    """Normales suavizadas con pliegue (como el GLB: soldar y marcar aristas vivas > 40°, D23): para cada esquina, la media
    ponderada por área de las caras que la comparten con una normal a < crease_deg de la suya."""
    P = np.asarray(P, float); T = P.reshape(-1, 3, 3)
    fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); area = np.linalg.norm(fn, axis=1); fu = fn / (area[:, None] + 1e-12)
    key = np.round(P / 1e-4).astype(np.int64)
    groups = {}
    for idx, k in enumerate(map(tuple, key)): groups.setdefault(k, []).append(idx)
    N = np.repeat(fu, 3, axis=0).copy(); cc = math.cos(math.radians(crease_deg))
    for ids in groups.values():
        if len(ids) < 2: continue
        f = np.array(ids) // 3; nf = fu[f]; w = area[f]
        dots = nf @ nf.T
        acc = (dots >= cc) @ (nf * w[:, None])
        acc /= np.linalg.norm(acc, axis=1, keepdims=True) + 1e-12
        N[ids] = acc
    return N

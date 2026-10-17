# Fase 2 (1.1): modelo de AD-29 en Python, sin navegador. Reproduce d63-pares.cjs (canvas 2D de Chromium) con
# supermuestreo: cobertura por píxel, mezcla en sRGB de 8 bits como el canvas, trazo de 1 px CSS con unión en inglete
# (límite 10, el de canvas), grises con la luminancia de AD-21, plantillas en 16 fases de 1/4 px físico, marcadores en
# 6 desplazamientos subpíxel y +-1 px entero. Se calibra contra el JSON de Chromium de D63
# (calibracion/d63-chromium-w24.json) con ad29-calibrar.py antes de medir nada nuevo.
# A DPR 1, Skia dibuja los trazos de <= 1 px físico como líneas finas sin uniones: por eso JOIN=hairline es el método
# calibrado y el valor por defecto (miter y bevel quedan solo para reproducir la calibración).
# Uso: python3 -I scripts/ux/ad29py.py [W=24] [dprs=1,2] [extra=ancla13,cuadhueco10,...] > salida.json
# Salida de referencia de la 1.1 (ART-DIRECTION AD-29 y D73): calibracion/ad29-1-1-w24.json, con
#   python3 -I scripts/ux/ad29py.py 24 1,2 ancla13,cruz11,cruz12,hex10,hex11v,pent10,cuadhueco10
import sys, json, itertools, math
import numpy as np

W = int(sys.argv[1]) if len(sys.argv) > 1 else 24
DPRS = [float(x) for x in (sys.argv[2] if len(sys.argv) > 2 else '1,2').split(',')]
EXTRA = sys.argv[3].split(',') if len(sys.argv) > 3 and sys.argv[3] else []
import os
K = 384  # muestras por lado del lienzo
JOIN = os.environ.get('JOIN', 'hairline')  # trazo a DPR <= 1: hairline (Skia, calibrado) | miter | bevel | hair
BLUR = float(os.environ.get('BLUR', '0'))  # radio de un núcleo tienda extra en px físicos (0 = caja de 1 px)
HSTEP = 15

def hexrgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)
C = {'panel': hexrgb('#0B1A24'), 'ocean': hexrgb('#1A5F86'), 'self': hexrgb('#FFD166'), 'player': hexrgb('#F5F1E6'),
     'pirate': hexrgb('#FF7A7A'), 'merchant': hexrgb('#6CC3F5'), 'outline': hexrgb('#07121B'), 'sand': hexrgb('#E6CF9A')}

def lin(v):
    v = v / 255.0; return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)
def enc(y):
    return np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(np.maximum(y, 0), 1 / 2.4) - 0.055) * 255

# ---------- geometría vectorial sobre las muestras ----------
class Canvas:
    def __init__(self, S):
        self.S = S; n = K // S if K % S == 0 else None
        self.ss = K // S  # muestras por píxel y eje
        t = (np.arange(K) + 0.5) / self.ss  # coordenadas en px físicos
        self.X, self.Y = np.meshgrid(t, t)
        self.img = np.zeros((S, S, 3))
    def fill_rgb(self, rgb, alpha=1.0):
        self.img = np.round(self.img * (1 - alpha) + rgb * alpha)
    def paint(self, mask, rgb, alpha=1.0):
        if BLUR > 0:
            r = int(round(BLUR * self.ss)); k = 1 - np.abs(np.arange(-r, r + 1)) / (r + 1); k /= k.sum()
            mf = mask.astype(np.float64)
            mf = np.apply_along_axis(lambda v: np.convolve(v, k, 'same'), 0, mf); mf = np.apply_along_axis(lambda v: np.convolve(v, k, 'same'), 1, mf)
            cov = mf.reshape(self.S, self.ss, self.S, self.ss).mean(axis=(1, 3))[..., None] * alpha
        else:
            cov = mask.reshape(self.S, self.ss, self.S, self.ss).mean(axis=(1, 3))[..., None] * alpha
        self.img = np.round(self.img * (1 - cov) + rgb * cov)
    def gray(self):
        Y = lin(self.img) @ np.array([0.2126, 0.7152, 0.0722]); return enc(Y)

def poly_fill(cv, pts):
    X, Y = cv.X, cv.Y; inside = np.zeros(X.shape, dtype=np.int32); n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]
        up = (y1 <= Y) & (y2 > Y); dn = (y1 > Y) & (y2 <= Y)
        with np.errstate(divide='ignore', invalid='ignore'):
            xc = x1 + (Y - y1) * (x2 - x1) / (y2 - y1)
        inside += np.where(up & (X < xc), 1, 0) - np.where(dn & (X < xc), 1, 0)
    return inside != 0

def convex(cv, pts):
    X, Y = cv.X, cv.Y; m = np.ones(X.shape, dtype=bool); n = len(pts)
    s = 0
    for i in range(n):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]; s += (x2 - x1) * (y2 + y1)
    sign = -1 if s > 0 else 1
    for i in range(n):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]
        m &= sign * ((x2 - x1) * (Y - y1) - (y2 - y1) * (X - x1)) >= -1e-12
    return m

def seg_rect(cv, P, Q, hw):
    X, Y = cv.X, cv.Y; ux, uy = Q[0] - P[0], Q[1] - P[1]; L = math.hypot(ux, uy); ux /= L; uy /= L
    t = (X - P[0]) * ux + (Y - P[1]) * uy; c = -(X - P[0]) * uy + (Y - P[1]) * ux
    return (t >= 0) & (t <= L) & (np.abs(c) <= hw)

def stroke_closed_miter(cv, pts, w, limit=10.0):
    hw = w / 2; n = len(pts); m = np.zeros(cv.X.shape, dtype=bool)
    for i in range(n):
        m |= seg_rect(cv, pts[i], pts[(i + 1) % n], hw)
    if w <= 1.0 and JOIN == 'hair': return m
    if w <= 1.0 and JOIN == 'bevel': limit = 0
    for i in range(n):
        A, P, B = np.array(pts[i - 1]), np.array(pts[i]), np.array(pts[(i + 1) % n])
        u = (P - A) / np.linalg.norm(P - A); v = (B - P) / np.linalg.norm(B - P)
        cr = u[0] * v[1] - u[1] * v[0]
        if abs(cr) < 1e-9: continue
        # normal exterior al giro: hacia fuera de la curva
        n1 = np.array([u[1], -u[0]]) if cr > 0 else np.array([-u[1], u[0]])
        n2 = np.array([v[1], -v[0]]) if cr > 0 else np.array([-v[1], v[0]])
        a, b = P + n1 * hw, P + n2 * hw
        cosphi = float(np.clip(n1 @ n2, -1, 1)); half = math.acos(cosphi) / 2
        ratio = 1 / math.cos(half)  # longitud del inglete / (w/2)
        if ratio <= limit:
            mdir = (n1 + n2) / np.linalg.norm(n1 + n2); M = P + mdir * hw * ratio
            m |= convex(cv, [tuple(P), tuple(a), tuple(M), tuple(b)])
        else:
            m |= convex(cv, [tuple(P), tuple(a), tuple(b)])
    return m

def annulus(cv, x, y, r0, r1):
    d = np.hypot(cv.X - x, cv.Y - y); return (d >= r0) & (d <= r1)

def dist_polyline(cv, pts):
    X, Y = cv.X, cv.Y; best = np.full(X.shape, np.inf)
    for (x1, y1), (x2, y2) in zip(pts[:-1], pts[1:]):
        ux, uy = x2 - x1, y2 - y1; L2 = ux * ux + uy * uy
        t = np.clip(((X - x1) * ux + (Y - y1) * uy) / L2, 0, 1)
        best = np.minimum(best, np.hypot(X - (x1 + t * ux), Y - (y1 + t * uy)))
    return best

# ---------- marcadores (mismo dibujo que d63-pares.cjs) ----------
def hairline(cv, P, Q, rgb, wmod=1.0):
    # Skia dibuja los trazos de ancho <= 1 px físico como línea fina (SkDrawTreatAsHairline, cobertura x ancho):
    # por cada píxel del eje mayor, la cobertura 1 se reparte entre los 2 píxeles más cercanos del eje menor.
    S = cv.S; a = np.zeros((S, S)); (x1, y1), (x2, y2) = P, Q
    xmaj = abs(x2 - x1) >= abs(y2 - y1)
    if not xmaj: x1, y1, x2, y2 = y1, x1, y2, x2
    if x2 < x1: x1, y1, x2, y2 = x2, y2, x1, y1
    for i in range(int(math.floor(x1)), int(math.floor(x2)) + 1):
        lo, hi = max(i, x1), min(i + 1, x2); w = hi - lo
        if w <= 0: continue
        xm = (lo + hi) / 2; y = y1 + (y2 - y1) * (xm - x1) / (x2 - x1 if x2 != x1 else 1) - 0.5
        j = int(math.floor(y)); f = y - j
        for jj, cw in ((j, 1 - f), (j + 1, f)):
            if 0 <= jj < S and 0 <= i < S:
                if xmaj: a[jj, i] += cw * w
                else: a[i, jj] += cw * w
    cov = np.clip(a * wmod, 0, 1)[..., None]
    cv.img = np.round(cv.img * (1 - cov) + rgb * cov)

def filled(pathfn, color):
    def draw(cv, x, y, d, h):
        pts = pathfn(x, y, d, h)
        cv.paint(poly_fill(cv, pts), C[color])
        if d <= 1.0 and JOIN == 'hairline':
            for i in range(len(pts)): hairline(cv, pts[i], pts[(i + 1) % len(pts)], C['outline'], d)
        else:
            cv.paint(stroke_closed_miter(cv, pts, d), C['outline'])
    return draw
def tri(r, back, half):
    def p(x, y, d, h):
        fx, fy, R = math.sin(h), math.cos(h), r * d
        return [(x + fx * R, y + fy * R), (x - fx * R * back + fy * R * half, y - fy * R * back - fx * R * half),
                (x - fx * R * back - fy * R * half, y - fy * R * back + fx * R * half)]
    return filled(p, 'self')
def ring(D, w):
    def draw(cv, x, y, d, h):
        rm = (D / 2 - w / 2) * d
        cv.paint(annulus(cv, x, y, rm - (w + 1) * d / 2, rm + (w + 1) * d / 2), C['outline'])
        cv.paint(annulus(cv, x, y, rm - (w - 1) * d / 2, rm + (w - 1) * d / 2), C['player'])
    return draw
def dia(D):
    return filled(lambda x, y, d, h: [(x, y - D / 2 * d), (x + D / 2 * d, y), (x, y + D / 2 * d), (x - D / 2 * d, y)], 'pirate')
def sq(s):
    return filled(lambda x, y, d, h: [(x - s / 2 * d, y - s / 2 * d), (x + s / 2 * d, y - s / 2 * d), (x + s / 2 * d, y + s / 2 * d), (x - s / 2 * d, y + s / 2 * d)], 'merchant')
def bar(w, hh):
    return filled(lambda x, y, d, h: [(x - w / 2 * d, y - hh / 2 * d), (x + w / 2 * d, y - hh / 2 * d), (x + w / 2 * d, y + hh / 2 * d), (x - w / 2 * d, y + hh / 2 * d)], 'pirate')
def star(ro, ri, color='pirate', n=5):
    def p(x, y, d, h):
        return [(x + (ro if i % 2 == 0 else ri) * d * math.cos(-math.pi / 2 + i * math.pi / n),
                 y + (ro if i % 2 == 0 else ri) * d * math.sin(-math.pi / 2 + i * math.pi / n)) for i in range(2 * n)]
    return filled(p, color)

# ---------- iconos candidatos del puerto ----------
def ellipse_arc(cx, cy, rx, ry, a0, a1, n=24):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / n), cy + ry * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
def anchor(size, sw, fg='sand', outline=1.0, ring_r=None):
    """Ancla de línea (la de icons.tsx, viewBox 24) escalada a `size` px CSS de alto, trazo `sw` px CSS en `fg`,
    con contorno `outline` px CSS #07121B por fuera del trazo (como los marcadores) o sin contorno si es 0."""
    def draw(cv, x, y, d, h):
        s = size / 17.0 * d  # el ancla ocupa y 2,5..19,5 del viewBox (17 unidades)
        ox, oy = x - 12 * s, y - 11 * s
        P = lambda px, py: (ox + px * s, oy + py * s)
        rr = (ring_r if ring_r is not None else 2.5)
        paths = [[P(12, 5 + rr), P(12, 19.5)], [P(7, 11), P(17, 11)],
                 [P(*q) for q in ellipse_arc(12, 13, 7, 6.5, math.pi, 0)]]
        circ = (P(12, 5)[0], P(12, 5)[1], rr * s)
        def mask(extra):
            hw = sw * d / 2 + extra
            m = np.zeros(cv.X.shape, dtype=bool)
            for pl in paths:
                m |= dist_polyline(cv, pl) <= hw
            dd = np.abs(np.hypot(cv.X - circ[0], cv.Y - circ[1]) - circ[2]); m |= dd <= hw
            return m
        if outline > 0: cv.paint(mask(outline * d), C['outline'])
        cv.paint(mask(0), C[fg])
    return draw

V = {
    '▲': {'tri10': tri(5, 0.7, 0.6)},
    '●': {'ring8w2.5': ring(8, 2.5)},
    '◆': {'dia8': dia(8)},
    '■': {'sq7': sq(7)},
    '▬': {'bar11x5': bar(11, 5)},
    '★': {'star5.5': star(5.5, 2.2)},
}
CANDS = {
    'ancla11': ('⚓', anchor(11, 1.5)), 'ancla13': ('⚓', anchor(13, 1.5)), 'ancla12': ('⚓', anchor(12, 1.5)),
    'ancla13s2': ('⚓', anchor(13, 2.0)), 'ancla15': ('⚓', anchor(15, 1.5)), 'ancla12n': ('⚓', anchor(12, 1.5, outline=0)),
}
def poly(n, R, rot=0.0, color='merchant'):
    return filled(lambda x, y, d, h: [(x + R * d * math.cos(rot + 2 * math.pi * i / n), y + R * d * math.sin(rot + 2 * math.pi * i / n)) for i in range(n)], color)
def plus(L, w, color='merchant'):
    a, b = L / 2, w / 2
    return filled(lambda x, y, d, h: [(x + px * d, y + py * d) for px, py in [(-b, -a), (b, -a), (b, -b), (a, -b), (a, b), (b, b), (b, a), (-b, a), (-b, b), (-a, b), (-a, -b), (-b, -b)]], color)
def sqring(s, w, color='merchant'):
    def draw(cv, x, y, d, h):
        o, i = s / 2 * d, (s / 2 - w) * d
        outer = [(x - o, y - o), (x + o, y - o), (x + o, y + o), (x - o, y + o)]; inner = [(x - i, y - i), (x + i, y - i), (x + i, y + i), (x - i, y + i)]
        cv.paint(poly_fill(cv, outer) & ~poly_fill(cv, inner), C[color])
        for pts in (outer, inner):
            if d <= 1.0 and JOIN == 'hairline':
                for k in range(4): hairline(cv, pts[k], pts[(k + 1) % 4], C['outline'], d)
            else: cv.paint(stroke_closed_miter(cv, pts, d), C['outline'])
    return draw
CANDS.update({
    'cruz11': ('✚', plus(11, 4)), 'cruz12': ('✚', plus(12, 4.5)), 'hex10': ('⬢', poly(6, 5, 0)), 'hex11v': ('⬢', poly(6, 5.5, math.pi / 6)),
    'pent10': ('⬟', poly(5, 5.2, -math.pi / 2)), 'cuadhueco10': ('▣', sqring(10, 3)),
})
for e in EXTRA:
    cls, f = CANDS[e]; V.setdefault(cls, {})[e] = f

PH = [0, 0.25, 0.5, 0.75]
OFFS = [(0, 0), (0.5, 0.5), (0.25, 0.75), (0.125, 0.375), (0.625, 0.875), (0.875, 0.125)]
HEADS = [i * HSTEP * math.pi / 180 for i in range(round(360 / HSTEP))]

def render(draw, S, dpr, ox, oy, h):
    cv = Canvas(S); cv.fill_rgb(C['panel']); cv.fill_rgb(C['ocean'], 0.9)
    draw(cv, S / 2 + ox, S / 2 + oy, dpr, h); return cv.gray()
def norm(g):
    o = g - g.mean(); s = np.linalg.norm(o) or 1; return (o / s).ravel()
def shift(g, dx, dy):
    S = g.shape[0]; ys = np.clip(np.arange(S) - dy, 0, S - 1); xs = np.clip(np.arange(S) - dx, 0, S - 1)
    return g[np.ix_(ys, xs)]

res = {}
for dpr in DPRS:
    S = int(round(W * dpr)); T = {}; Mk = {}
    for cls in V:
        T[cls] = {}; Mk[cls] = {}
        hs = HEADS if cls == '▲' else [0]
        for vn, draw in V[cls].items():
            T[cls][vn] = [np.stack([norm(render(draw, S, dpr, ox, oy, h)) for ox in PH for oy in PH]) for h in hs]
            Mk[cls][vn] = []
            for h in hs:
                per = []
                for ox, oy in OFFS:
                    g = render(draw, S, dpr, ox, oy, h)
                    per.append(np.stack([norm(shift(g, dx, dy)) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]))
                Mk[cls][vn].append(per)
    own, cross = {}, {}
    for cls in V:
        for vn in V[cls]:
            mn = 9
            for hi, per in enumerate(Mk[cls][vn]):
                for sh in per:
                    mn = min(mn, float((sh @ T[cls][vn][hi].T).max()))
            own[cls + vn] = round(mn, 4)
    names = [(c, v) for c in V for v in V[c]]
    for (A, va), (B, vb) in itertools.combinations(names, 2):
        if A == B: continue
        TB = np.concatenate(T[B][vb]); TA = np.concatenate(T[A][va])
        mx = -1
        for per in Mk[A][va]:
            for sh in per: mx = max(mx, float((sh @ TB.T).max()))
        for per in Mk[B][vb]:
            for sh in per: mx = max(mx, float((sh @ TA.T).max()))
        cross[f'{A}{va}|{B}{vb}'] = round(mx, 4)
    res[str(int(dpr)) if dpr == int(dpr) else str(dpr)] = {'own': own, 'cross': cross}
print(json.dumps(res, ensure_ascii=False))

# Uso (desde la raíz del repo): python3 -I scripts/ux/mapa/islas.py [ids…]
#   →  $UX_OUT/mapa/isla_<id>_lod0.npz, atlas_isla.png e islas-medidas.json (ligero: segundos por isla)
# Islas rediseñadas (D83; Jonattan: «Yo sería más arriesgado en el diseño», con una isla de Seafight de referencia): la costa
# sigue la unión de círculos de circulos.py (colisión B, AC-199) con un trazo irregular entre 0,4 y 2,6 m por dentro del
# borde; el relieve y la selva van por arquetipo. Terreno en rejilla de 2 m cerca de la costa y en los relieves, y de 6 m en
# el interior llano (sin grietas: el interior está a la altura de la meseta). Los peñones, el acantilado, el respaldo de las
# calas y los escollos son mesetas con pared vertical: la rejilla se corta por su contorno y la pared se levanta en el corte. Color por vértice (COLOR_0) sobre un grano de
# textura; los props llevan su región del atlas o el texel blanco. Comprueba la costa, la oclusión a 55° (≤ 8 m fuera de
# la unión, AD-39 b) y cuenta triángulos, palmeras y draw calls. No corre en la CI.
import json, math, os, random, sys
sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here); sys.path.insert(0, os.path.join(here, '..', 'laminas'))
import rutas as RT
import numpy as np
from PIL import Image, ImageDraw
import geo as G
import circulos as CI

OUT = os.path.join(RT.OUT, 'mapa'); os.makedirs(OUT, exist_ok=True)
T55 = 1 / math.tan(math.radians(55))
C = {  # sRGB; las caras horizontales con el albedo de §4.2.1 (D17)
    'arena': '#E3CD97', 'arena.moj': '#C4A872', 'hierba': '#5E9E48', 'selva': '#3F7A35', 'selva.osc': '#2F5F2A',
    'roca': '#8A8378', 'roca.osc': '#625C53', 'acantilado': '#544D45', 'volcan': '#4A4446', 'ceniza': '#6E6668', 'lava': '#3A3335', 'lava.viva': '#E0662A', 'algas': '#4F5A3A',
    'paja': '#C9A15A', 'cabana': '#E8DCC0', 'tabla': '#9A6A45', 'lona': '#4A494D', 'negro': '#111111', 'blanco': '#F5F1E6',
    'pecio': '#4B3A2C', 'palma.tronco': '#8A5A3B', 'palma.hoja': '#4E9A3E', 'palma.hoja2': '#3F7A35', 'hoja.a': '#2F6B2C', 'hoja.b': '#4A8F38',
    'hoja.c': '#5FA244', 'hoja.osc': '#24502A', 'flor': '#E05AA8', 'red': '#D8C7A2',
}
# Atlas de 512² (se pinta a 1024² y se reduce): a 6,2 px/m en pantalla, 256 px por cada 6 m de grano sobran (43 texeles/m)
AT = G.Atlas(512)
AT.add('grano', 0, 0, 256, 256, 6.0, 6.0)
AT.add('roca', 256, 0, 256, 256, 6.0, 6.0)
AT.add('paja', 0, 256, 128, 128, 2.0, 2.0)
AT.add('tabla', 128, 256, 128, 128, 3.0, 3.0)
AT.add('lona', 256, 256, 128, 128, 3.0, 3.0)
AT.add('bandera', 384, 256, 64, 64, 1.0, 1.0)
AT.add('white', 500, 500, 8, 8, 1.0, 1.0)


def paint_atlas(seed=5):
    rng = np.random.default_rng(seed); img = np.zeros((1024, 1024, 3))
    def noise(h, w, cell, amp):
        small = rng.random((h // cell + 2, w // cell + 2))
        n = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((w + 2 * cell, h + 2 * cell), Image.BICUBIC), float)[cell:cell + h, cell:cell + w] / 255
        return 1 + amp * (n - 0.5) * 2
    # grano: blanco con variación suave (el color lo pone COLOR_0)
    g = 245 * noise(512, 512, 24, 0.06) * noise(512, 512, 6, 0.05)
    img[0:512, 0:512] = g[..., None]
    # roca: estratos horizontales y grietas, gris medio
    r = 235 * noise(512, 512, 16, 0.08) * noise(512, 512, 4, 0.05)
    for y in range(0, 512, 37): r[y:y + 3] *= 0.7
    for _ in range(40):
        x = int(rng.integers(0, 512)); y0 = int(rng.integers(0, 480)); r[y0:y0 + int(rng.integers(10, 40)), x:x + 2] *= 0.6
    img[0:512, 512:1024] = r[..., None]
    # paja: fibras inclinadas sobre ocre
    p = np.ones((256, 256, 3)) * np.array(G.hexlin(C['paja'])) ** (1 / 2.2) * 255
    for k in range(0, 256, 6): p[:, k:k + 2] *= 0.82
    for y in range(0, 256, 32): p[y:y + 4] *= 0.7
    img[512:768, 0:256] = p * noise(256, 256, 4, 0.08)[..., None]
    t = np.ones((256, 256, 3)) * np.array([154, 106, 69], float)
    for c0 in range(0, 256, 28): t[:, c0:c0 + 2] = (90, 59, 36)
    img[512:768, 256:512] = t * noise(256, 256, 4, 0.07)[..., None]
    l = np.ones((256, 256, 3)) * np.array([74, 73, 77], float) * noise(256, 256, 12, 0.08)[..., None]
    for y in range(0, 256, 40): l[y:y + 2] *= 0.75
    img[512:768, 512:768] = l
    # bandera pirata: negra con el cuadro blanco (ART-DIRECTION §8.3)
    b = Image.new('RGB', (128, 128), (17, 17, 17)); ImageDraw.Draw(b).rectangle((46, 40, 82, 76), fill=(245, 241, 230))
    img[512:640, 768:896] = np.asarray(b, float)
    img[1000:1016, 1000:1016] = 255
    return Image.fromarray(img.clip(0, 255).astype(np.uint8))


# ---------------------------------------------------------------- campo de distancias y ruido
def sdf(circles, X, Z):
    d = np.full(np.shape(X), 1e9)
    for (cx, cz, r) in circles: d = np.minimum(d, np.hypot(X - cx, Z - cz) - r)
    return d


def sdf_grad(circles, X, Z):
    """Distancia a la unión y su gradiente (la normal hacia fuera del círculo más cercano)."""
    d = np.full(np.shape(X), 1e9); nx = np.zeros(np.shape(X)); nz = np.zeros(np.shape(X))
    for (cx, cz, r) in circles:
        L = np.hypot(X - cx, Z - cz); dk = L - r; m = dk < d
        d = np.where(m, dk, d); nx = np.where(m, (X - cx) / (L + 1e-9), nx); nz = np.where(m, (Z - cz) / (L + 1e-9), nz)
    return d, nx, nz


def vnoise(X, Z, seed, scale):
    """Ruido de valor suave en [−1, 1] (bilineal sobre una rejilla con semilla)."""
    rs = np.random.default_rng(seed); N = 64; tab = rs.uniform(-1, 1, (N, N))
    fx, fz = X / scale, Z / scale; ix, iz = np.floor(fx).astype(int), np.floor(fz).astype(int); ax, az = fx - ix, fz - iz
    ax, az = ax * ax * (3 - 2 * ax), az * az * (3 - 2 * az)
    a = tab[ix % N, iz % N]; b = tab[(ix + 1) % N, iz % N]; c = tab[ix % N, (iz + 1) % N]; d = tab[(ix + 1) % N, (iz + 1) % N]
    return a * (1 - ax) * (1 - az) + b * ax * (1 - az) + c * (1 - ax) * az + d * ax * az


class Isla:
    def __init__(self, iid):
        self.id = iid; self.arq, self.var, self.centro, self.old, self.circles = CI.ISLAS[iid]
        self.main = self.circles[0]; self.seed = sum(map(ord, iid)) * 7919
        # firma en grises (AD-39 c): las tropicales, con playa ancha (clara); las rocosas, con roca y selva oscuras
        self.bw = min(max(0.17 * self.main[2], 4.0), 7.5) if self.arq == 'tropical' else 4.0; self.dark = self.arq == 'rocky'

    def shore(self, X, Z):
        """Distancia de la línea de costa al borde de la unión (negativa = dentro): entre −2,6 y −0,4 m (AC-199 a)."""
        if self.arq == 'reef': return -0.21 + 0.08 * vnoise(X, Z, self.seed, 3.0)
        return -1.5 + 1.1 * (0.65 * vnoise(X, Z, self.seed, 9.0) + 0.35 * vnoise(X, Z, self.seed + 1, 3.5))

    def height(self, X, Z):
        """Altura del terreno y su tipo (0 arena, 1 hierba/selva, 2 roca, 3 acantilado, 4 volcán)."""
        d = sdf(self.circles, X, Z); ds = self.shore(X, Z); t = ds - d  # t > 0 dentro de la costa (m hacia dentro)
        kind = np.zeros(np.shape(X), int)
        if self.arq == 'reef':  # el fondo queda bajo el agua: la losa es la meseta de terrace()
            return np.full(np.shape(X), -0.6), np.full(np.shape(X), 3), d, ds
        plateau = 1.6
        bw = self.bw   # ancho de la playa: sube a 0,8 m en bw y a la meseta en bw + 3
        h = np.where(t <= 0, np.maximum(-1.2, 0.3 * t), np.where(t < bw, 0.8 * t / bw, np.where(t < bw + 3, 0.8 + (plateau - 0.8) * (t - bw) / 3, plateau)))
        kind = np.where(t < bw + 0.5, 0, 1)
        mx, mz, mr = self.main
        dist = np.hypot(X - mx, Z - mz)
        if self.arq == 'tropical' and self.var is None and mr >= 35:
            hill = 6.5 * np.clip(1 - dist / (0.6 * mr), 0, 1) ** 1.6 * (1 + 0.15 * vnoise(X, Z, self.seed + 3, 6))
            h = np.where(t > bw + 3, h + hill, h)
        if self.var == 'volcano':    # cono truncado con cráter en el círculo principal; falda de selva
            rb = 0.62 * mr; rc = 0.13 * mr
            cone = np.where(dist < rb, 17.0 * np.clip(1 - (dist - rc) / (rb - rc), 0, 1) ** 1.15, 0)
            crater = np.where(dist < rc, 17.0 - 3.5 * np.clip((rc - dist) / (0.38 * rc), 0, 1), cone)   # fondo plano a 13,5 m
            gully = 1 + 0.07 * np.sin(11 * np.arctan2(X - mx, Z - mz) + 1.5 * vnoise(X, Z, self.seed + 6, 6)) * np.clip((dist - rc) / (0.3 * rb), 0, 1)
            cone = np.where(dist < rc, crater, cone * gully) * (1 + 0.04 * vnoise(X, Z, self.seed + 5, 3))
            h = np.where(t > 2, np.maximum(h, cone), h); kind = np.where(cone > 5.0, 4, kind)
            ang = np.arctan2(X - mx, Z - mz); flow = np.zeros(np.shape(X))
            for a_k in (2.6, 3.5, 0.9):   # 3 coladas viejas, del cráter a la falda
                da = np.angle(np.exp(1j * (ang - a_k))) * dist
                flow = np.maximum(flow, np.exp(-(da / (1.3 + 0.05 * dist)) ** 2) * ((dist > rc) & (dist < 1.05 * rb)))
            kind = np.where((flow > 0.5) & (kind == 4), 5, kind)
        return h, kind, d, ds

    def colors(self, h, kind, d, ds, X, Z):
        t = ds - d
        sand = np.array(G.hexlin(C['arena'])); wet = np.array(G.hexlin(C['arena.moj']))
        grass = np.array(G.hexlin(C['hierba'])); jungle = np.array(G.hexlin(C['selva'])); jdark = np.array(G.hexlin(C['selva.osc']))
        rock = np.array(G.hexlin(C['roca'])); rdark = np.array(G.hexlin(C['roca.osc'])); cliff = np.array(G.hexlin(C['acantilado']))
        volc = np.array(G.hexlin(C['volcan'])); ash = np.array(G.hexlin(C['ceniza']))
        n = vnoise(X, Z, self.seed + 9, 5.0)[..., None]
        s = np.clip((t - 0.0) / 1.0, 0, 1)[..., None]
        col = wet * (1 - s) + sand * s
        bw = self.bw
        if self.dark: grass = jungle
        g = np.clip((t - bw) / 2.5, 0, 1)[..., None]
        inner = grass * (1 - np.clip((t - bw - 2) / 6, 0, 1)[..., None]) + (jungle * (0.6 + 0.4 * n) + jdark * (0.4 - 0.4 * n)) * np.clip((t - bw - 2) / 6, 0, 1)[..., None]
        if self.arq in ('rocky', 'pirate_cove'):
            inner = inner * 0.85 + rdark * 0.15
        col = col * (1 - g) + inner * g
        k = kind[..., None]
        col = np.where(k == 2, rock * (0.9 + 0.1 * n) * np.clip(1 - (h[..., None] - 2) / 30, 0.7, 1) + rdark * 0.0, col)
        col = np.where(k == 3, cliff * (0.9 + 0.1 * n), col)
        col = np.where(k == 4, np.where(h[..., None] > 14.0, ash, volc * (0.92 + 0.08 * n)), col)
        col = np.where(k == 5, np.array(G.hexlin(C['lava'])) * 0.75, col)
        col = np.where(k == 6, np.array(G.hexlin(C['lava.viva'])), col)
        return col

    def terrace(self, X, Z, H, D, DS):
        """Meseta con pared vertical, o None: F (> 0 dentro; la pared se levanta en F = 0), la altura de su tapa y su tipo
        (1 hierba o selva, 2 roca). La pared queda ≥ 0,3 m por dentro de la costa visible."""
        t = DS - D; mx, mz, mr = self.main; n2 = vnoise(X, Z, self.seed + 7, 7.0)
        if self.arq == 'reef':   # losa baja de roca mojada (0,25–0,5 m); su pared es la costa, en [0,94·r, r]. Encima, las piedras de build()
            HT = 0.38 + 0.12 * vnoise(X, Z, self.seed + 2, 1.6)
            return t, HT, np.full(np.shape(X), 2)
        if self.var == 'stack':  # peñón de 10–11 m desplazado al norte: su cara norte es la costa; al sur, la playa y los lóbulos
            sx, sz = mx, mz - 0.2 * mr; dsk = np.hypot(X - sx, Z - sz); rs = 0.72 * mr
            F = np.minimum(rs * (1 + 0.08 * vnoise(X, Z, self.seed + 4, 5.0)) + 0.9 * vnoise(X, Z, self.seed + 5, 2.2) - dsk, t - 0.3)
            HT = 8.6 + 1.8 * np.clip(1 - (dsk / rs) ** 2, 0, 1) + 0.4 * vnoise(X, Z, self.seed + 6, 4.0) + 0.5 * vnoise(X, Z, self.seed + 8, 2.0)
            return F, HT, np.where((F < 1.2) | (n2 > 0.15), 2, 1)
        if self.var == 'cliff':  # meseta inclinada de 2 m (norte) a 9 m (sur): al sur cae a plomo al agua; al norte, playa
            body = self.circles[:3]; d3 = sdf(body, X, Z)
            zmin = min(c[1] - c[2] for c in body); zmax = max(c[1] + c[2] for c in body)
            w = 0.3 + 5.2 * np.clip((mz + 0.1 * mr - Z) / (0.5 * mr), 0, 1)       # al sur, la pared en el agua
            ang = np.degrees(np.arctan2(X - mx, Z - mz)); dist = np.hypot(X - mx, Z - mz)
            w = w + 13.0 * np.clip(1 - np.abs(ang - 90) / 28, 0, 1) * np.clip((dist - 0.45 * mr) / (0.2 * mr), 0, 1)  # cala al este
            F = np.minimum(t - w, -d3 - w) + 0.7 * vnoise(X, Z, self.seed + 5, 2.2)
            HT = 2.0 + 7.0 * np.clip((Z - zmin) / (zmax - zmin), 0, 1) + 0.35 * vnoise(X, Z, self.seed + 6, 4.0) + 0.4 * vnoise(X, Z, self.seed + 8, 2.0)
            return F, HT, np.where((F < 1.2) | (n2 > 0.4), 2, 1)
        if self.var == 'volcano':  # lago de lava: disco de 0,62·rc al ras del fondo del cráter (13,5 m), 0,15 m por encima
            dist = np.hypot(X - mx, Z - mz); rp = 0.62 * 0.13 * mr
            return rp + 0.4 * vnoise(X, Z, self.seed + 5, 1.5) - dist, np.full(np.shape(X), 13.65), np.full(np.shape(X), 6)
        if self.arq == 'pirate_cove':  # respaldo de roca de 6–7,5 m detrás de la cala, lejos del puerto
            bx, bz, br = self.circles[0]; L = math.hypot(bx, bz); ux, uz = -bx / L, -bz / L
            cx, cz = bx - 4 * ux, bz - 4 * uz; db = np.hypot(X - cx, Z - cz); rr = 0.65 * br
            F = np.minimum(rr * (1 + 0.08 * vnoise(X, Z, self.seed + 4, 3.0)) + 0.8 * vnoise(X, Z, self.seed + 5, 1.8) - db, t - 0.3)
            HT = 6.0 + 1.5 * np.clip(1 - db / rr, 0, 1) + 0.3 * vnoise(X, Z, self.seed + 6, 3.0) + 0.5 * vnoise(X, Z, self.seed + 8, 1.6)
            return F, HT, np.where((F < 1.0) | (n2 > -0.2), 2, 1)
        return None

    def colors_top(self, F, HT, KT, X, Z):
        n = vnoise(X, Z, self.seed + 9, 5.0)[..., None]
        if self.arq == 'reef':  # roca mojada con manchas de algas; las piedras de encima son más claras
            alg = np.clip(0.5 + vnoise(X, Z, self.seed + 14, 2.0), 0, 1)[..., None]
            return (np.array(G.hexlin(C['acantilado'])) * (1 - alg) + np.array(G.hexlin(C['algas'])) * alg) * (0.85 + 0.15 * n)
        if self.var == 'volcano': return np.full(np.shape(X) + (3,), G.hexlin(C['lava.viva']))
        jungle = np.array(G.hexlin(C['selva'])); jdark = np.array(G.hexlin(C['selva.osc'])); grass = np.array(G.hexlin(C['hierba']))
        rock = np.array(G.hexlin(C['roca'])); rdark = np.array(G.hexlin(C['roca.osc']))
        if self.dark:   # roca de basalto y selva oscuras: el sector lejano se lee amenazante (AD-39 c)
            grass = jungle
            rock, rdark = np.array(G.hexlin(C['roca.osc'])), np.array(G.hexlin(C['acantilado']))
        green = (jungle * (0.6 + 0.4 * n) + jdark * (0.4 - 0.4 * n)) * 0.7 + grass * 0.3
        stone = rock * (0.88 + 0.12 * n) * (1 - 0.25 * np.clip(F[..., None] - 1.2, 0, 3) / 3) + rdark * 0.25 * np.clip(F[..., None] - 1.2, 0, 3) / 3
        return np.where(KT[..., None] == 2, stone, green)


def terrain(m, isla, fine=2.0, coarse=6.0):
    """Rejilla fina de `fine` m (gruesa de `coarse` m en el interior llano), cada celda en 2 triángulos. Cada triángulo se
    recorta por el contorno F = 0 de la meseta (terrace): lo de fuera va a la altura del suelo, lo de dentro a la de la tapa, y
    en el corte se levanta la pared, vertical, en `acantilado` con la región de roca del atlas (sus estratos son horizontales)."""
    if isla.arq == 'reef': fine = 1.5
    xs = [c[0] - c[2] for c in isla.circles]; xe = [c[0] + c[2] for c in isla.circles]
    zs = [c[1] - c[2] for c in isla.circles]; ze = [c[1] + c[2] for c in isla.circles]
    x0 = math.floor((min(xs) - 2) / coarse) * coarse; x1 = math.ceil((max(xe) + 2) / coarse) * coarse
    z0 = math.floor((min(zs) - 2) / coarse) * coarse; z1 = math.ceil((max(ze) + 2) / coarse) * coarse
    gx = np.arange(x0, x1 + 1e-6, fine); gz = np.arange(z0, z1 + 1e-6, fine)
    X, Z = np.meshgrid(gx, gz, indexing='xy')
    H, K, D, DS = isla.height(X, Z); COL = isla.colors(H, K, D, DS, X, Z)
    tr = isla.terrace(X, Z, H, D, DS)
    if tr is None: F, HT, KT, COLT = np.full(X.shape, -100.0), H, K, COL
    else: F, HT, KT = tr; COLT = isla.colors_top(F, HT, KT, X, Z)
    flat = ((DS - D > isla.bw + 3.5) & (np.abs(H - 1.6) < 1e-6) & (F < 0)) | (F > 2.0)   # interior llano o tapa de meseta lejos de la pared
    step = int(round(coarse / fine)) if abs(coarse / fine - round(coarse / fine)) < 1e-9 else 1
    W = AT.uv
    gFz, gFx = np.gradient(F, fine)
    VV = np.concatenate([X[..., None], Z[..., None], F[..., None], H[..., None], HT[..., None], COL, COLT, gFx[..., None], gFz[..., None]], axis=-1)
    wc = np.array(G.hexlin(C['acantilado']))
    def wall_col(x, z, y, top):
        n = float(vnoise(np.array(x), np.array(z), isla.seed + 11, 3.0))
        return wc * (0.86 + 0.14 * n) * (1.0 if top else (0.72 if y < 1.0 else 0.86))
    def fan(poly, hk, ck, reg, tx, tz):
        if max(v[hk] for v in poly) < -0.3: return
        for k in range(1, len(poly) - 1):
            tri = (poly[0], poly[k], poly[k + 1])
            m.p += [(float(v[0]), float(v[hk]), float(v[1])) for v in tri]
            m.t += [W(reg, (v[0] - tx) / coarse, (v[1] - tz) / coarse) for v in tri]
            m.c += [v[ck:ck + 3] for v in tri]
    def wall(p, q, tx, tz):
        # el pie entra 0,5 m en el suelo (sin rendijas); solo baja del agua si el suelo ya está en la flotación
        foot = lambda h: h - 0.5 if h < 0.05 else max(h - 0.5, 0.01)
        yb = (foot(p[3]), foot(q[3])); yt = (p[4], q[4])
        if max(yt) < 0: return
        k = 0 if abs(q[0] - p[0]) >= abs(q[1] - p[1]) else 1; o = tx if k == 0 else tz
        up, uq = (p[k] - o) / coarse, (q[k] - o) / coarse
        vv = lambda y: min(max((y + 1.2) / 13.2, 0.0), 1.0)
        def mid(v, y0, y1):
            g = math.hypot(v[11], v[12]) + 1e-9; nx, nz = -v[11] / g, -v[12] / g
            off = 0.2 + 0.45 * float(vnoise(np.array(v[0]), np.array(v[1]), isla.seed + 12, 2.5))
            return (float(v[0]) + nx * off, 0.5 * (y0 + y1) + 0.25 * (y1 - y0) * float(vnoise(np.array(v[0]), np.array(v[1]), isla.seed + 13, 3.0)), float(v[1]) + nz * off)
        if (yt[0] - yb[0] < 1.2 and yt[1] - yb[1] < 1.2) or isla.arq == 'reef':  # el escollo, a plomo: su borde es la regla [0,94·r, r]
            rows = [((float(p[0]), yb[0], float(p[1])), (float(q[0]), yb[1], float(q[1]))), ((float(p[0]), yt[0], float(p[1])), (float(q[0]), yt[1], float(q[1])))]
        else:
            rows = [((float(p[0]), yb[0], float(p[1])), (float(q[0]), yb[1], float(q[1]))), (mid(p, yb[0], yt[0]), mid(q, yb[1], yt[1])),
                    ((float(p[0]), yt[0], float(p[1])), (float(q[0]), yt[1], float(q[1])))]
        for k in range(len(rows) - 1):
            (A, B), (Dp, Cq) = rows[k], rows[k + 1]; top = k == len(rows) - 2
            ta, tb, tc, td = W('roca', up, vv(A[1])), W('roca', uq, vv(B[1])), W('roca', uq, vv(Cq[1])), W('roca', up, vv(Dp[1]))
            ca, cb = wall_col(A[0], A[2], A[1], False), wall_col(B[0], B[2], B[1], False)
            cc, cd = wall_col(Cq[0], Cq[2], Cq[1], top), wall_col(Dp[0], Dp[2], Dp[1], top)
            m.p += [A, B, Cq, A, Cq, Dp]; m.t += [ta, tb, tc, ta, tc, td]; m.c += [ca, cb, cc, ca, cc, cd]
    def emit_tri(tri, base_reg, top_reg, tx, tz):
        ins = [v[2] > 0 for v in tri]
        if not any(ins): fan(list(tri), 3, 5, base_reg, tx, tz); return
        if all(ins): fan(list(tri), 4, 8, top_reg, tx, tz); return
        pin, pout, seg = [], [], []
        for k in range(3):
            p, q = tri[k], tri[(k + 1) % 3]
            (pin if p[2] > 0 else pout).append(p)
            if (p[2] > 0) != (q[2] > 0):
                x = p + (q - p) * (p[2] / (p[2] - q[2])); x[2] = 0.0
                pin.append(x); pout.append(x); seg.append(x)
        fan(pout, 3, 5, base_reg, tx, tz); fan(pin, 4, 8, top_reg, tx, tz); wall(seg[0], seg[1], tx, tz)
    nI, nJ = len(gz) - 1, len(gx) - 1
    def cell(i0, j0, i1, j1):
        cs = ((i0, j0), (i0, j1), (i1, j1), (i1, j0))
        if all(H[i, j] < -0.3 and F[i, j] <= 0 for i, j in cs): return
        tx = x0 + coarse * math.floor((gx[j0] - x0) / coarse + 1e-9); tz = z0 + coarse * math.floor((gz[i0] - z0) / coarse + 1e-9)
        a, b, c, d = (VV[i, j] for i, j in cs)
        base_reg = 'roca' if any(K[i, j] in (2, 3, 4, 5, 6) for i, j in cs) else 'grano'
        top_reg = 'roca' if isla.arq == 'reef' else 'grano'   # en las tapas, sin estratos: la roca la da el color
        S = [HT[i, j] if F[i, j] > 0 else H[i, j] for i, j in cs]
        if abs(S[0] - S[2]) <= abs(S[1] - S[3]): tris = ((a, c, b), (a, d, c))
        else: tris = ((a, d, b), (b, d, c))
        for tri in tris: emit_tri(tri, base_reg, top_reg, tx, tz)
    def top_block(I, J, i1, j1):
        """Bloque grueso de una tapa de meseta: abanico desde el centro por todos los nodos finos del borde, para que no
        queden grietas (uniones en T) con las celdas finas de al lado, que tienen otra altura."""
        ring = [(I, j) for j in range(J, j1)] + [(i, j1) for i in range(I, i1)] + [(i1, j) for j in range(j1, J, -1)] + [(i, J) for i in range(i1, I, -1)]
        tx = x0 + coarse * math.floor((gx[J] - x0) / coarse + 1e-9); tz = z0 + coarse * math.floor((gz[I] - z0) / coarse + 1e-9)
        mi, mj = (I + i1) // 2, (J + j1) // 2
        cen = VV[mi - 1:mi + 1, mj - 1:mj + 1].reshape(-1, VV.shape[-1]).mean(0) if (i1 - I) % 2 else VV[mi, mj]
        for k in range(len(ring)):
            a, b = VV[ring[k]], VV[ring[(k + 1) % len(ring)]]
            fan([cen, a, b], 4, 8, 'grano', tx, tz)
    for I in range(0, nI, step):
        for J in range(0, nJ, step):
            i1, j1 = min(I + step, nI), min(J + step, nJ)
            if step > 1 and i1 - I == step and j1 - J == step and flat[I:i1 + 1, J:j1 + 1].all():
                if (F[I:i1 + 1, J:j1 + 1] > 0).all(): top_block(I, J, i1, j1)
                else: cell(I, J, i1, j1)
            else:
                for i in range(I, i1):
                    for j in range(J, j1): cell(i, j, i + 1, j + 1)
    SURF = np.where(F > 0, HT, H); KS = np.where(F > 0, KT, K)
    return X, Z, SURF, KS, D, DS, F


def poisson(isla, X, Z, H, K, D, DS, rmin, where, rng, tries=30):
    """Muestreo de disco de Poisson sobre los puntos de la rejilla que cumplen `where`."""
    ok = np.argwhere(where)
    rng.shuffle(ok)
    pts = []
    cell = rmin / math.sqrt(2); grid = {}
    for (i, j) in ok:
        x, z = X[i, j] + rng.uniform(-0.9, 0.9), Z[i, j] + rng.uniform(-0.9, 0.9)
        gi, gj = int(x // cell), int(z // cell)
        if any(math.hypot(x - px, z - pz) < rmin for di in (-2, -1, 0, 1, 2) for dj in (-2, -1, 0, 1, 2) for (px, pz) in grid.get((gi + di, gj + dj), [])):
            continue
        grid.setdefault((gi, gj), []).append((x, z)); pts.append((x, z, H[i, j], i, j))
    return pts


def build(iid):
    isla = Isla(iid); rng = random.Random(isla.seed); nrng = np.random.default_rng(isla.seed)
    ter = G.Mesh(AT); props = G.Mesh(AT); palms = G.Mesh(AT)
    X, Z, H, K, D, DS, F = terrain(ter, isla)
    T = DS - D; top = F > 1.8; low = F < -1.5
    n_palm = 0
    # selva: palmeras (instancias de prop_palm en el juego) y copas de árboles, por densidad de arquetipo
    dens = {'tropical': (3.9, 0.72), 'rocky': (4.8, 0.5), 'pirate_cove': (5.0, 0.6), 'reef': (None, 0)}[isla.arq]
    if dens[0]:
        where = (((T > isla.bw + 1.5) & low) | top) & (K <= 1)
        if isla.var == 'village': where &= np.hypot(X - isla.main[0], Z - isla.main[1]) > 0.55 * isla.main[2]
        pts = poisson(isla, X, Z, H, K, D, DS, dens[0], where, nrng)
        for (x, z, h, i, j) in pts:
            if rng.random() < dens[1]:
                n_palm += add_palm(palms, isla, x, z, float(h), rng.uniform(5.2, 7.6), rng, cheap=True, dark=isla.dark)
            else:
                y_, r_, c_ = float(h) + rng.uniform(2.2, 3.4), rng.uniform(2.2, 3.0), C[rng.choice(['hoja.osc', 'hoja.a'] if isla.dark else ['hoja.a', 'hoja.b', 'hoja.c'])]
                def tree(m, x=x, z=z, h=h, y_=y_, r_=r_, c_=c_):
                    G.crown(m, x, y_, z, r_, c_, rng); G.prism(m, (x, float(h), z), (x, float(h) + 2.4, z), 0.22, 3, C['palma.tronco'])
                guarded(props, isla, tree)
        # palmeras de playa, inclinadas hacia el agua
        beach = (T > isla.bw - 1.8) & (T < isla.bw + 0.2) & (K == 0) & low
        bp = poisson(isla, X, Z, H, K, D, DS, 9.0 if isla.arq == 'tropical' else 16.0, beach, nrng)
        for (x, z, h, i, j) in bp:
            if rng.random() < (0.55 if isla.arq == 'tropical' else 0.3):
                gi = np.gradient(D); lean = math.atan2(float(gi[1][i, j]), float(gi[0][i, j]))
                n_palm += add_palm(palms, isla, x, z, float(h), rng.uniform(5.0, 7.0), rng, lean=lean, dark=isla.dark)
    # rocas de costa (escolleras naturales) en las islas rocosas y en las calas
    if isla.arq in ('rocky', 'pirate_cove'):
        coast = (T > -0.6) & (T < 0.8) & (F < -1.0)
        for (x, z, h, i, j) in poisson(isla, X, Z, H, K, D, DS, 7.0, coast, nrng):
            if rng.random() < 0.5:
                r_, h_, c_ = rng.uniform(0.8, 1.6), rng.uniform(0.8, 1.8), C['roca.osc'] if rng.random() < 0.5 else C['acantilado']
                guarded(props, isla, lambda m: G.rock(m, x, z, r_, h_, rng, c_))
    if isla.arq == 'reef':
        cx, cz, cr = isla.main
        for k in range(16):  # montón de piedras partidas, con la punta a ≤ 1,15 m (AD-39 d: ≤ 1,2)
            a = rng.uniform(0, 2 * math.pi); rr = math.sqrt(rng.uniform(0.0, 1.0)) * 0.6 * cr; x_, z_ = cx + rr * math.sin(a), cz + rr * math.cos(a)
            r_, y0_ = rng.uniform(1.3, 2.3), rng.uniform(0.2, 0.4); c_ = C[rng.choice(['roca', 'roca', 'roca.osc', 'acantilado'])]
            guarded(props, isla, lambda m: G.rock(m, x_, z_, r_, 1.15 - y0_ - rng.uniform(0.0, 0.25), rng, c_, y0=y0_))
    if isla.var == 'village': village(props, isla, X, Z, H, T, rng)
    if isla.arq == 'pirate_cove': camp(props, isla, X, Z, H, T, rng)
    if isla.var == 'volcano':
        for k in range(5):  # columnas de lava solidificada en el islote
            cx, cz, cr = isla.circles[-1]
            x_, z_, r_, h_ = cx + rng.uniform(-3, 3), cz + rng.uniform(-3, 3), rng.uniform(1.2, 2.2), rng.uniform(1.5, 3.0)
            guarded(props, isla, lambda m: G.rock(m, x_, z_, r_, h_, rng, C['lava']))
    return isla, ter, props, palms, n_palm, (X, Z, H, K, D, DS, F)


def guarded(dst, isla, make):
    """Añade la pieza que construye `make(mesh)` solo si ningún vértice con y > 0 queda a más de 0,4 m fuera de la unión
    (AC-199 a: ≤ 0,5 m) ni tapa agua a más de 7,5 m de ella (AD-39 b: ≤ 8). Devuelve 1 si la añadió."""
    tmp = G.Mesh(AT); make(tmp)
    P = np.array(tmp.p); up = P[P[:, 1] > 0.001]
    if len(up) and (sdf(isla.circles, up[:, 0], up[:, 2]).max() > 0.4 or sdf(isla.circles, up[:, 0], up[:, 2] - T55 * up[:, 1]).max() > 7.5): return 0
    dst.p += tmp.p; dst.t += tmp.t; dst.c += tmp.c
    return 1


def add_palm(palms, isla, x, z, y0, h, rng, lean=None, cheap=False, dark=False):
    lv = (C['palma.hoja2'], C['selva.osc']) if dark else (C['palma.hoja'], C['palma.hoja2'])
    return guarded(palms, isla, lambda m: G.palm(m, x, z, y0, h, rng, leaf=lv[0], leaf2=lv[1], lean=lean, cheap=cheap))


def at_h(X, Z, H, x, z):
    j = int(round((x - X[0, 0]) / (X[0, 1] - X[0, 0]))); i = int(round((z - Z[0, 0]) / (Z[1, 0] - Z[0, 0])))
    return float(H[min(max(i, 0), H.shape[0] - 1), min(max(j, 0), H.shape[1] - 1)])


def hut(m, x, z, y0, r, rng):
    G.cylinder(m, x, z, r, r, y0, y0 + 1.9, 8, col=C['cabana'])
    for k in range(8):  # techo cónico de paja
        a0 = 2 * math.pi * k / 8; a1 = 2 * math.pi * (k + 1) / 8; R = r + 0.45
        W = AT.uv
        m.tri((x + R * math.sin(a0), y0 + 1.75, z + R * math.cos(a0)), (x + R * math.sin(a1), y0 + 1.75, z + R * math.cos(a1)), (x, y0 + 3.6, z),
              W('paja', 0, 1), W('paja', 1, 1), W('paja', 0.5, 0))
    m.solid((x - 0.35, y0, z + r + 0.02), (x + 0.35, y0, z + r + 0.02), (x + 0.35, y0 + 1.3, z + r + 0.02), (x - 0.35, y0 + 1.3, z + r + 0.02), C['pecio'])


def village(m, isla, X, Z, H, T, rng):
    """Poblado de pescadores en el círculo principal: 4 cabañas de paja, un embarcadero dentro de la unión y un secadero."""
    mx, mz, mr = isla.main
    for k, ang in enumerate((200, 250, 300, 345)):
        a = math.radians(ang + (0 if isla.id == 'T1' else 180)); x, z = mx + 0.38 * mr * math.sin(a), mz + 0.38 * mr * math.cos(a)
        hut(m, x, z, at_h(X, Z, H, x, z), 1.7 + 0.2 * (k % 2), rng)
    # embarcadero hacia el puerto (sobre la playa, sin salir de la unión: AC-103)
    a = math.atan2(-mx, -mz); d = np.array([math.sin(a), math.cos(a)]); t = np.array([d[1], -d[0]])
    r0, r1 = 0.55 * mr, mr - 0.6
    o = np.array([mx, mz]) + d * r0
    y = 1.0
    m.tiled((o[0] - t[0] * 1.0, y, o[1] - t[1] * 1.0), (t[0], 0, t[1]), (d[0], 0, d[1]), 2.0, r1 - r0, 'tabla')
    for rr in np.arange(r0 + 1, r1, 2.5):
        for s in (-1, 1):
            p = np.array([mx, mz]) + d * rr + t * s * 0.9
            G.cylinder(m, p[0], p[1], 0.12, 0.12, -0.6, y, 4, col=C['pecio'])
    # secadero de redes y 2 botes
    sx, sz = mx + 0.2 * mr * math.sin(a + 1.2), mz + 0.2 * mr * math.cos(a + 1.2); y0 = at_h(X, Z, H, sx, sz)
    for s in (-1.4, 1.4): G.prism(m, (sx + s, y0, sz), (sx + s, y0 + 1.8, sz), 0.07, 4, C['pecio'])
    m.solid((sx - 1.4, y0 + 1.7, sz), (sx + 1.4, y0 + 1.7, sz), (sx + 1.4, y0 + 0.5, sz + 0.2), (sx - 1.4, y0 + 0.5, sz + 0.2), C['red'])


def camp(m, isla, X, Z, H, T, rng):
    """Campamento pirata en la cala (ART-DIRECTION §8.3): 2 tiendas de lona, hoguera, 3 banderas negras, un pecio varado y
    una atalaya en lo alto del respaldo con la bandera grande, que es lo que se reconoce de lejos."""
    bx, bz, br = isla.circles[0]
    L = math.hypot(bx, bz); u = np.array([-bx / L, -bz / L]); v = np.array([-u[1], u[0]])
    W = AT.uv
    tc = np.array([bx, bz]) - u * 4.0; ty = at_h(X, Z, H, *tc)
    for sx_ in (-1, 1):
        for sz_ in (-1, 1):
            G.prism(m, (tc[0] + 1.1 * sx_, ty - 0.2, tc[1] + 1.1 * sz_), (tc[0] + 0.9 * sx_, ty + 4.2, tc[1] + 0.9 * sz_), 0.14, 4, C['pecio'])
    G.box(m, tc[0], tc[1], 2.8, 2.8, ty + 4.2, ty + 4.5, 'tabla', top='tabla')
    G.prism(m, (tc[0], ty + 4.5, tc[1]), (tc[0], ty + 8.6, tc[1]), 0.09, 4, C['pecio'])
    f0 = (tc[0], ty + 8.5, tc[1])
    m.quad(f0, (f0[0] + v[0] * 2.6, f0[1], f0[2] + v[1] * 2.6), (f0[0] + v[0] * 2.6, f0[1] - 1.7, f0[2] + v[1] * 2.6), (f0[0], f0[1] - 1.7, f0[2]),
           W('bandera', 0, 0), W('bandera', 1, 0), W('bandera', 1, 1), W('bandera', 0, 1))
    c0 = np.array([bx, bz]) + u * 9.0
    W = AT.uv
    for s in (-1, 1):  # tiendas de lona: un tejadillo a dos aguas de 2,8 × 2,4 m con la cumbrera a 1,8 m
        p = c0 + v * s * 4.0; y0 = at_h(X, Z, H, *p)
        a, b = p + v * 1.4, p - v * 1.4
        for sg in (-1, 1):
            ea, eb = a + u * 1.2 * sg, b + u * 1.2 * sg
            m.quad((ea[0], y0, ea[1]), (eb[0], y0, eb[1]), (b[0], y0 + 1.8, b[1]), (a[0], y0 + 1.8, a[1]), W('lona', 0, 1), W('lona', 1, 1), W('lona', 1, 0), W('lona', 0, 0))
    y0 = at_h(X, Z, H, *c0)
    for k in range(6): G.rock(m, c0[0] + 0.8 * math.cos(k), c0[1] + 0.8 * math.sin(k), 0.3, 0.3, rng, C['roca.osc'], y0=y0 - 0.05)
    G.cylinder(m, c0[0], c0[1], 0.55, 0.0, y0, y0 + 1.1, 5, col=G.hexlin(C['lava.viva']))   # la hoguera encendida
    for s in (-1, 0, 1):
        p = c0 + v * s * 7.0 - u * 3.0; y0 = at_h(X, Z, H, *p)
        G.prism(m, (p[0], y0, p[1]), (p[0], y0 + 6.0, p[1]), 0.08, 4, C['pecio'])
        W = AT.uv
        m.quad((p[0], y0 + 5.9, p[1]), (p[0] + v[0] * 1.6, y0 + 5.9, p[1] + v[1] * 1.6), (p[0] + v[0] * 1.6, y0 + 4.8, p[1] + v[1] * 1.6), (p[0], y0 + 4.8, p[1]),
               W('bandera', 0, 0), W('bandera', 1, 0), W('bandera', 1, 1), W('bandera', 0, 1))
    # pecio: casco escorado y partido (sin velas ni palos enteros), en la arena del brazo
    p = c0 + v * 10.5 + u * 1.0; y0 = at_h(X, Z, H, *p)
    ang = math.atan2(v[0], v[1])
    c, s = math.cos(ang), math.sin(ang)
    def Tt(a_, y, b_): return (p[0] + c * a_ + s * b_, y0 + y, p[1] - s * a_ + c * b_)
    for sg in (-1, 1):
        m.solid(Tt(sg * 1.6, 1.4, -4.0), Tt(sg * 1.6, 1.4, 3.0), Tt(0, -0.2 + 0.3 * sg, 2.6), Tt(0, -0.2 + 0.3 * sg, -3.6), C['pecio'])
    G.prism(m, Tt(0, 0.6, -0.5), Tt(0.6, 3.0, -0.6), 0.18, 4, C['pecio'])


# ---------------------------------------------------------------- comprobaciones
def checks(isla, ter, props, palms):
    P = np.array(ter.p + props.p + palms.p)
    up = P[P[:, 1] > 0.001]
    d_up = sdf(isla.circles, up[:, 0], up[:, 2])
    hid = sdf(isla.circles, up[:, 0], up[:, 2] - T55 * up[:, 1])
    return {'fuera_max_y_pos': round(float(d_up.max()), 2), 'oclusion_fuera_max': round(float(hid.max()), 2),
            'altura_max': round(float(P[:, 1].max()), 2)}


def shoreline(isla, ter):
    """Costa visible medida en la malla del terreno: los puntos donde cada triángulo corta y = 0 (también las paredes), y
    su distancia al borde de la unión: [mín, máx] por dentro, en m (AC-199 a: entre 0 y 3; en los escollos, ≤ 0,06·r)."""
    P = np.array(ter.p).reshape(-1, 3, 3); y = P[:, :, 1]
    pts = []
    for k in range(3):
        a, b = P[:, k], P[:, (k + 1) % 3]; ya, yb = y[:, k], y[:, (k + 1) % 3]
        m = (ya > 0) != (yb > 0)
        s = (ya[m] / (ya[m] - yb[m]))[:, None]; pts.append(a[m] + (b[m] - a[m]) * s)
    Q = np.concatenate(pts); d = sdf(isla.circles, Q[:, 0], Q[:, 2])
    return [round(float(-d.max()), 2), round(float(-d.min()), 2)]


IDS = list(CI.ISLAS)
if __name__ == '__main__':
    want = sys.argv[1:] or [i for i in IDS if i != 'PORT']
    paint_atlas().resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'atlas_isla.png'))
    meds = json.load(open(os.path.join(OUT, 'islas-medidas.json'))) if os.path.exists(os.path.join(OUT, 'islas-medidas.json')) else {}
    for iid in want:
        isla, ter, props, palms, n_palm, _ = build(iid)
        P = ter.p + props.p + palms.p; Tt = ter.t + props.t + palms.t; Cc = ter.c + props.c + palms.c
        np.savez(os.path.join(OUT, f'isla_{iid}_lod0.npz'), p=np.array(P, float), t=np.array(Tt, float), c=np.array(Cc, float), r=np.zeros(len(P)))
        res = checks(isla, ter, props, palms); res['costa_por_dentro_m'] = shoreline(isla, ter)
        res.update({'tris_terreno': ter.ntri(), 'tris_props': props.ntri(), 'palmeras': n_palm, 'tris_palmeras': palms.ntri(), 'circulos': len(isla.circles)})
        meds[iid] = res; print(iid, json.dumps(res, ensure_ascii=False))
    json.dump(meds, open(os.path.join(OUT, 'islas-medidas.json'), 'w'), indent=1, ensure_ascii=False)

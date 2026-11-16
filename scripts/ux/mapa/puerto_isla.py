# Uso (desde la raíz del repo), tras scripts/ux/mapa/puerto_forma.py (que deja $UX_OUT/mapa/puerto-forma-<variante>.json):
#   python3 -I scripts/ux/mapa/puerto_isla.py  →  $UX_OUT/mapa/puerto_isla_lod0.npz, atlas_puerto_isla.png y puerto-isla-medidas.json
# Puerto con forma de isla (D92; Jonattan sobre D82: «Quiero no sea un circulo, que sea mas irregular como una isla y que
# una parte sea palmeras y mas ver con plazas»). La colisión es la unión de círculos de puerto_forma.py (GDD §4, «El puerto
# con forma de isla») y la costa visible queda de 0 a 3 m por dentro de su borde (AC-199 a). Por zonas, según el círculo que
# manda en cada punto: la ciudad y los muelles (los 2 círculos de la ciudad y el muelle este) son una plataforma de piedra a
# 1,2 m con la cara del muelle a 0,3 m del borde; el fuerte, una meseta a 2,8 m sobre un acantilado al norte, con las
# murallas, las garitas y el faro de D82; el palmar, la roca del noroeste y el islote son tierra natural: playa, hierba,
# selva y palmeras. Con 2 plazas (la mayor, con la fuente y el mercado, y la de la iglesia), casas de colores, el astillero
# (la tienda) en la ensenada sur, almacenes y grúa en el muelle este, y los 12 amarres de la tabla: pantalanes sobre el
# muelle de piedra y embarcaderos de madera desde la playa del palmar. Reutiliza las piezas de puerto_colonial.py y el
# terreno de islas.py. Comprueba lo visible dentro de la unión (AC-199 a), la costa, la oclusión a 55° (≤ 8 m fuera de la
# unión, AD-39 b, y a ≥ 1 m de los cascos atracados de las 5 clases en los 12 amarres), las holguras entre piezas y los
# triángulos. Escribe en $UX_OUT/mapa (rutas.py de scripts/ux/laminas). No corre en la CI.
import json, math, os, random, sys
sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here); sys.path.insert(0, os.path.join(here, '..', 'laminas'))
import rutas as RT
import numpy as np
from PIL import Image
import geo as G
import puerto_forma as PF
import puerto_colonial as PC
import islas as IS

OUT = os.path.join(RT.OUT, 'mapa')
VAR = os.environ.get('UX_PUERTO_VAR', 'v3')
PF.use(VAR)
CIRC = [(x, z, r) for _, x, z, r in PF.CIRCLES]; NAMES = [n for n, *_ in PF.CIRCLES]; BY = {n: (x, z, r) for n, x, z, r in PF.CIRCLES}
FORMA = json.load(open(RT.need(os.path.join(OUT, f'puerto-forma-{VAR}.json'), f'puerto-forma-{VAR}.json (puerto_forma.py)')))
BERTHS = [(np.array(b['Q'], float), float(b['psi']), b['tramo']) for b in FORMA['amarres']]
TOP, P, AT, T55 = PC.TOP, PC.P, PC.AT, PC.T55
FORT_TOP = TOP + 1.6
QUAY = [NAMES.index(n) for n in ('ciudad este', 'ciudad oeste', 'muelle este')]
FORT = NAMES.index('fuerte')
NAT = [i for i in range(len(CIRC)) if i not in QUAY + [FORT]]
QUAY_FACE = 0.6   # la cara del muelle, por dentro del borde de la unión (con 0,3, la rejilla de 2 m la sacaba 6 cm en la ensenada sur)
# el terreno de islas.py usa las regiones 'grano' y 'roca': van en el hueco libre del atlas del puerto (1 material)
AT.add('grano', 256, 704, 256, 256, 6.0, 6.0); AT.add('roca', 512, 704, 256, 256, 6.0, 6.0)
IS.AT = AT


def paint_atlas():
    img = np.asarray(PC.paint_atlas(), float).copy()
    isl = np.asarray(IS.paint_atlas().resize((512, 512), Image.LANCZOS), float)
    img[704:960, 256:512] = isl[0:256, 0:256]; img[704:960, 512:768] = isl[0:256, 256:512]
    return Image.fromarray(img.clip(0, 255).astype(np.uint8))


def u(psi): a = math.radians(psi); return np.array([math.sin(a), math.cos(a)])


def dists(X, Z):
    return np.stack([np.hypot(np.asarray(X) - x, np.asarray(Z) - z) - r for (x, z, r) in CIRC])


def zone_fields(X, Z):
    """d: distancia a la unión; Gq: > 0 en la zona de ciudad, muelles y fuerte (mitad de la diferencia con lo natural);
    wf: peso del fuerte (1 dentro de su lóbulo, 0 en la ciudad, rampa de 4 m)."""
    Dk = dists(X, Z); d = Dk.min(0)
    Dq = Dk[QUAY + [FORT]].min(0); Dn = Dk[NAT].min(0); Gq = (Dn - Dq) / 2
    Dt = Dk[QUAY].min(0); wf = np.clip((Dt - Dk[FORT]) / 4 + 0.5, 0, 1)
    return d, Gq, wf, Dk


class PortIsla:
    """El puerto con la interfaz de islas.Isla que usa terrain() (abajo)."""
    def __init__(self):
        self.id, self.arq, self.var, self.circles, self.main = 'PORT', 'port', None, CIRC, BY['ciudad este']
        self.seed, self.bw, self.dark = 4242, 5.0, False

    def shore(self, X, Z):
        d, Gq, wf, Dk = zone_fields(X, Z)
        nat = -1.5 + 1.1 * (0.65 * IS.vnoise(X, Z, self.seed, 9.0) + 0.35 * IS.vnoise(X, Z, self.seed + 1, 3.5))   # 0,4–2,6 por dentro
        cliff = -0.8 - 0.3 * IS.vnoise(X, Z, self.seed + 2, 4.0)                                                   # 0,5–1,1
        built = np.where(Dk[FORT] < Dk[QUAY].min(0), cliff, -QUAY_FACE)
        return np.where(Gq > 0, built, nat)

    def height(self, X, Z):
        d, Gq, wf, Dk = zone_fields(X, Z); ds = self.shore(X, Z); t = ds - d
        bw = np.where(Dk[NAMES.index('palmar')] <= Dk.min(0) + 1e-9, 5.0, 2.5)
        h = np.where(t <= 0, np.maximum(-1.2, 0.3 * t), np.where(t < bw, 0.8 * t / bw, np.where(t < bw + 3, 0.8 + 0.8 * (t - bw) / 3, 1.6)))
        px, pz, pr = BY['palmar']; dist = np.hypot(X - px, Z - pz)
        h = np.where((t > bw + 3) & (Dk[NAMES.index('palmar')] <= Dk.min(0) + 1e-9), h + 2.6 * np.clip(1 - dist / (0.75 * pr), 0, 1) ** 1.6, h)
        h = np.where(Gq > -6, np.minimum(h, TOP - 0.3 + 0.25 * np.maximum(-Gq, 0)), h)   # junto a la ciudad baja a 0,9: bordillo de 0,3 m
        kind = np.where(t < bw + 0.5, 0, 1)
        return h, kind, d, ds

    def colors(self, h, kind, d, ds, X, Z):
        return IS.Isla.colors(self, h, kind, d, ds, X, Z)

    def terrace(self, X, Z, H, D, DS):
        d, Gq, wf, Dk = zone_fields(X, Z); t = DS - D
        F = np.minimum(t, Gq)
        HT = TOP + (FORT_TOP - TOP) * wf * wf * (3 - 2 * wf)
        KT = np.where((wf > 0.5) & (t < 1.2), 2, 1)
        # la roca del noroeste: meseta de 4–5 m apartada del fuerte, con la pared hacia el mar
        rx, rz, rr = BY['roca noroeste']; cx, cz = rx - 2.0, rz - 1.0; dr = np.hypot(X - cx, Z - cz); rs = 0.6 * rr
        Fr = np.minimum(rs * (1 + 0.08 * IS.vnoise(X, Z, self.seed + 4, 3.0)) - dr, t - 0.3)
        HTr = 4.2 + 0.8 * np.clip(1 - dr / rs, 0, 1) + 0.3 * IS.vnoise(X, Z, self.seed + 6, 2.0)
        use_r = Fr > F
        return np.where(use_r, Fr, F), np.where(use_r, HTr, HT), np.where(use_r, 3, KT)

    def colors_top(self, F, HT, KT, X, Z):
        n = IS.vnoise(X, Z, self.seed + 9, 5.0)[..., None]
        d, Gq, wf, Dk = zone_fields(X, Z)
        town = np.ones(np.shape(X) + (3,)) * (0.94 + 0.06 * n)
        grass = np.array(G.hexlin(P['cesped'])) * (0.9 + 0.1 * n)
        rock = np.array(G.hexlin(P['roca'])) * (0.88 + 0.12 * n)
        jungle = np.array(G.hexlin(IS.C['selva'])) * (0.8 + 0.2 * n)
        col = np.where(wf[..., None] > 0.5, grass, town)
        col = np.where(KT[..., None] == 2, rock, col)
        return np.where(KT[..., None] == 3, jungle * 0.7 + rock * 0.3, col)


def wall_kind(x, z):
    """Qué pared se levanta en (x, z): 'muelle' (la cara de piedra de la ciudad y del muelle este, a plomo), 'contencion'
    (el escalón de piedra entre la ciudad y la tierra natural, y el muro de sillar entre la ciudad y el fuerte) o
    'natural' (el acantilado del fuerte, la roca del noroeste y el resto, con la fila del medio irregular de islas.py)."""
    X, Z = np.array(float(x)), np.array(float(z))
    d, Gq, wf, Dk = zone_fields(X, Z); t = float(PortIsla().shore(X, Z)) - float(d)
    town = float(wf) <= 0.5
    if abs(t) <= abs(float(Gq)): return 'muelle' if town and float(Gq) > 0 else 'natural'
    return 'contencion' if town else 'natural'


def terrain(m, isla, fine=2.0, coarse=6.0):
    """islas.terrain con 3 cambios para el puerto: (1) la tapa de la ciudad (y de los muelles) va con el empedrado del
    atlas, una repetición por celda gruesa de 6 m (los cantos salen 1,5 veces más grandes que en sus 4 m: a 6,2 px/m no se
    distingue); (2) la cara del muelle y los escalones de la ciudad son paredes a plomo de piedra (`piedra`), sin la fila
    irregular del medio; (3) el acantilado del fuerte, la roca del noroeste y las costas naturales quedan como en islas.py."""
    xs = [c[0] - c[2] for c in isla.circles]; xe = [c[0] + c[2] for c in isla.circles]
    zs = [c[1] - c[2] for c in isla.circles]; ze = [c[1] + c[2] for c in isla.circles]
    x0 = math.floor((min(xs) - 2) / coarse) * coarse; x1 = math.ceil((max(xe) + 2) / coarse) * coarse
    z0 = math.floor((min(zs) - 2) / coarse) * coarse; z1 = math.ceil((max(ze) + 2) / coarse) * coarse
    gx = np.arange(x0, x1 + 1e-6, fine); gz = np.arange(z0, z1 + 1e-6, fine)
    X, Z = np.meshgrid(gx, gz, indexing='xy')
    H, K, D, DS = isla.height(X, Z); COL = isla.colors(H, K, D, DS, X, Z)
    F, HT, KT = isla.terrace(X, Z, H, D, DS); COLT = isla.colors_top(F, HT, KT, X, Z)
    _, Gq_, wf_, _ = zone_fields(X, Z); TOWN = (Gq_ > 0) & (wf_ <= 0.5)
    flat = ((DS - D > isla.bw + 3.5) & (np.abs(H - 1.6) < 1e-6) & (F < 0)) | (F > 2.0)
    step = int(round(coarse / fine))
    W = AT.uv
    gFz, gFx = np.gradient(F, fine)
    VV = np.concatenate([X[..., None], Z[..., None], F[..., None], H[..., None], HT[..., None], COL, COLT, gFx[..., None], gFz[..., None]], axis=-1)
    wc = np.array(G.hexlin(IS.C['acantilado'])); stone = np.ones(3) * 0.95
    def wall_col(x, z, y, top):
        n = float(IS.vnoise(np.array(x), np.array(z), isla.seed + 11, 3.0))
        return wc * (0.86 + 0.14 * n) * (1.0 if top else (0.72 if y < 1.0 else 0.86))
    def fan(poly, hk, ck, reg, tx, tz):
        if max(v[hk] for v in poly) < -0.3: return
        for k in range(1, len(poly) - 1):
            tri = (poly[0], poly[k], poly[k + 1])
            m.p += [(float(v[0]), float(v[hk]), float(v[1])) for v in tri]
            m.t += [W(reg, (v[0] - tx) / coarse, (v[1] - tz) / coarse) for v in tri]
            m.c += [v[ck:ck + 3] for v in tri]
    def wall(p, q, tx, tz):
        foot = lambda h: h - 0.5 if h < 0.05 else max(h - 0.5, 0.01)
        yb = (foot(p[3]), foot(q[3])); yt = (p[4], q[4])
        if max(yt) < 0: return
        k = 0 if abs(q[0] - p[0]) >= abs(q[1] - p[1]) else 1; o = tx if k == 0 else tz
        up, uq = (p[k] - o) / coarse, (q[k] - o) / coarse
        kind = wall_kind((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
        if kind != 'natural':  # a plomo, de piedra de muelle: los sillares en 4 m de alto, de y = −1,2 a 2,8
            vs = lambda y: min(max((2.8 - y) / 4.0, 0.0), 1.0)
            A, B = (float(p[0]), yb[0], float(p[1])), (float(q[0]), yb[1], float(q[1])); Dp, Cq = (float(p[0]), yt[0], float(p[1])), (float(q[0]), yt[1], float(q[1]))
            ta, tb, tc, td = W('piedra', up, vs(A[1])), W('piedra', uq, vs(B[1])), W('piedra', uq, vs(Cq[1])), W('piedra', up, vs(Dp[1]))
            m.p += [A, B, Cq, A, Cq, Dp]; m.t += [ta, tb, tc, ta, tc, td]; m.c += [stone] * 6
            return
        vv = lambda y: min(max((y + 1.2) / 13.2, 0.0), 1.0)
        def mid(v, y0, y1):
            g = math.hypot(v[11], v[12]) + 1e-9; nx, nz = -v[11] / g, -v[12] / g
            off = 0.2 + 0.45 * float(IS.vnoise(np.array(v[0]), np.array(v[1]), isla.seed + 12, 2.5))
            return (float(v[0]) + nx * off, 0.5 * (y0 + y1) + 0.25 * (y1 - y0) * float(IS.vnoise(np.array(v[0]), np.array(v[1]), isla.seed + 13, 3.0)), float(v[1]) + nz * off)
        if yt[0] - yb[0] < 1.2 and yt[1] - yb[1] < 1.2:
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
        base_reg = 'roca' if any(K[i, j] >= 2 for i, j in cs) else 'grano'
        top_reg = 'empedrado' if any(TOWN[i, j] and F[i, j] > 0 for i, j in cs) else 'grano'
        S = [HT[i, j] if F[i, j] > 0 else H[i, j] for i, j in cs]
        if abs(S[0] - S[2]) <= abs(S[1] - S[3]): tris = ((a, c, b), (a, d, c))
        else: tris = ((a, d, b), (b, d, c))
        for tri in tris: emit_tri(tri, base_reg, top_reg, tx, tz)
    def top_block(I, J, i1, j1):
        ring = [(I, j) for j in range(J, j1)] + [(i, j1) for i in range(I, i1)] + [(i1, j) for j in range(j1, J, -1)] + [(i, J) for i in range(i1, I, -1)]
        tx = x0 + coarse * math.floor((gx[J] - x0) / coarse + 1e-9); tz = z0 + coarse * math.floor((gz[I] - z0) / coarse + 1e-9)
        mi, mj = (I + i1) // 2, (J + j1) // 2
        cen = VV[mi - 1:mi + 1, mj - 1:mj + 1].reshape(-1, VV.shape[-1]).mean(0) if (i1 - I) % 2 else VV[mi, mj]
        reg = 'empedrado' if TOWN[I:i1 + 1, J:j1 + 1].any() else 'grano'
        for k in range(len(ring)):
            a, b = VV[ring[k]], VV[ring[(k + 1) % len(ring)]]
            fan([cen, a, b], 4, 8, reg, tx, tz)
    for I in range(0, nI, step):
        for J in range(0, nJ, step):
            i1, j1 = min(I + step, nI), min(J + step, nJ)
            if i1 - I == step and j1 - J == step and flat[I:i1 + 1, J:j1 + 1].all():
                if (F[I:i1 + 1, J:j1 + 1] > 0).all(): top_block(I, J, i1, j1)
                else: cell(I, J, i1, j1)
            else:
                for i in range(I, i1):
                    for j in range(J, j1): cell(i, j, i + 1, j + 1)
    SURF = np.where(F > 0, HT, H); KS = np.where(F > 0, KT, K)
    return X, Z, SURF, KS, D, DS, F


# ---------------------------------------------------------------- piezas
pieces = {}


def piece(name):
    m = G.Mesh(AT); pieces[name] = m; return m


def at_top(name, fn, *args, top=None, **kw):
    """Llama a una pieza de puerto_colonial con su suelo a `top` (sus piezas leen PC.TOP)."""
    if top is None: return fn(*args, **kw)
    old = PC.TOP; PC.TOP = top
    try: return fn(*args, **kw)
    finally: PC.TOP = old


def quay_berth(m, Q, psi, k):
    """Pantalán de tablas de 3,6 × 5,4 m sobre el muelle de piedra, con 2 bolardos y carga en la raíz de algunos."""
    d = u(psi); t = np.array([d[1], -d[0]])
    a = Q - d * (QUAY_FACE + 0.1)
    o = a - d * 5.4 - t * 1.8
    m.tiled((o[0] + t[0] * 3.6, TOP + 0.12, o[1] + t[1] * 3.6), (-t[0], 0, -t[1]), (d[0], 0, d[1]), 3.6, 5.4, 'tabla')
    for s in (-1, 1):
        c = a - d * 0.5 + t * s * 1.5
        G.cylinder(m, c[0], c[1], 0.17, 0.17, TOP, TOP + 0.65, 6, col=P['madera.osc'], top=True)
    if k % 3 == 0:
        for (rr, tt, kind) in ((4.6, -0.9, 'carga'), (4.5, 0.6, 'barril'), (3.8, -0.4, 'saco')):
            c = a - d * rr + t * tt
            if kind == 'barril': G.cylinder(m, c[0], c[1], 0.38, 0.38, TOP + 0.12, TOP + 1.0, 7, col=P['barril'], top=True, top_col='#6E4528')
            else: G.box(m, c[0], c[1], 0.9, 0.9, TOP + 0.12, TOP + 0.9, 'white', top='white', col=P[kind], top_col=np.asarray(G.hexlin(P[kind])) * 1.12, rot=math.radians(psi) + 0.15)


def beach_pier(m, Q, psi, length=10.0):
    """Embarcadero de madera desde la playa del palmar: tablazón a 1,3 m sobre pilotes, de Q hacia dentro."""
    d = u(psi); t = np.array([d[1], -d[0]]); y = 1.3
    a = Q - d * 0.2; b = a - d * length
    o = b - t * 1.5
    m.tiled((o[0] + t[0] * 3.0, y, o[1] + t[1] * 3.0), (-t[0], 0, -t[1]), (d[0], 0, d[1]), 3.0, length, 'tabla')
    for s in (-1, 1):
        m.wall(tuple(a + t * s * 1.5), tuple(b + t * s * 1.5), y - 0.25, y, 'tabla', col=np.array([0.65, 0.65, 0.65])) if s > 0 else \
            m.wall(tuple(b + t * s * 1.5), tuple(a + t * s * 1.5), y - 0.25, y, 'tabla', col=np.array([0.65, 0.65, 0.65]))
        for rr in np.arange(0.4, length, 2.4):
            c = a - d * rr + t * s * 1.3
            G.cylinder(m, c[0], c[1], 0.14, 0.14, -0.8, y, 5, col=P['madera.osc'])
        c = a - d * 0.6 + t * s * 1.2
        G.cylinder(m, c[0], c[1], 0.16, 0.16, y, y + 0.6, 6, col=P['madera.osc'], top=True)


def grada(m, x0, z_head, z_end):
    """El astillero (la tienda; D68): grada de tablas que baja de TOP + 1,2 a TOP + 0,15 hasta el borde del muelle, con el
    casco a medio hacer, la cabria y el cobertizo de tejas al este."""
    L = z_end - z_head
    def ramp(zz): return TOP + 1.2 - (zz - z_head) / L * 1.05
    o = (x0 - 3.0, ramp(z_end), z_end)
    m.tiled(o, (1, 0, 0), (0, ramp(z_head) - ramp(z_end), -L), 6.0, math.hypot(L, 1.05), 'tabla', col=np.array([0.55, 0.52, 0.5]))
    for sx in (-3.0, 3.0):
        p = [(x0 + sx, TOP, z_head), (x0 + sx, TOP, z_end), (x0 + sx, ramp(z_end), z_end), (x0 + sx, ramp(z_head), z_head)]
        m.solid(*p, P['madera.osc'])
    m.solid((x0 - 3, TOP, z_head), (x0 + 3, TOP, z_head), (x0 + 3, ramp(z_head), z_head), (x0 - 3, ramp(z_head), z_head), P['madera.osc'])
    zm = (z_head + z_end) / 2
    G.box(m, x0, zm, 0.5, L - 2.0, ramp(zm), ramp(zm) + 0.5, 'white', top='white', col=P['madera.nueva'])
    G.prism(m, (x0, ramp(z_head + 1.5) + 0.5, z_head + 1.5), (x0, ramp(z_head + 1.5) + 3.4, z_head + 0.9), 0.2, 4, P['madera.nueva'])
    for zz in np.arange(z_head + 2.5, z_end - 1.0, 2.0):
        uu = (zz - z_head - 1.5) / (L - 2.5); w = max(0.8, 2.4 * math.sin(math.pi * (0.15 + 0.85 * uu))); y0 = ramp(zz) + 0.5
        for sgn in (-1, 1):
            G.prism(m, (x0, y0, zz), (x0 + sgn * w * 0.8, y0 + 0.5, zz), 0.17, 4, P['madera.nueva'])
            G.prism(m, (x0 + sgn * w * 0.8, y0 + 0.5, zz), (x0 + sgn * w, y0 + 2.8, zz), 0.17, 4, P['madera.nueva'])
    for sgn in (-1, 1): G.prism(m, (x0 + sgn * 3.8, TOP, zm), (x0, 9.2, zm), 0.2, 4, P['mastil'])
    PC.foot('grada', x0, zm, 6.0, L)


def fort(wall, gar, far, gate, pat, rng):
    """Las murallas de D82 sobre la meseta del fuerte (a 2,8 m), con el trazado alrededor del centro de su lóbulo: 3 baluartes
    al norte con garitas, cortinas, cubos en los extremos, el faro en el baluarte del centro y la puerta roja hacia la plaza."""
    fx, fz, fr = BY['fuerte']; base = FORT_TOP; H_W = base + 4.8; RG = 9.4
    def bp(psi, r): return np.array([fx, fz]) + r * u(psi)
    def bast_pts(psi):
        c = u(psi); p = np.array([c[1], -c[0]]); o = np.array([fx, fz])
        L = lambda a, v: tuple(o + c * (RG + a) + p * v)
        return [L(0, 3.6), L(1.6, 3.9), L(3.4, 0.0), L(1.6, -3.9), L(0, -3.6)]
    BAS = [130, 180, 230]
    trace = [tuple(bp(100, RG))]
    for psi in BAS: trace += bast_pts(psi)
    trace.append(tuple(bp(260, RG)))
    def outer_face(a, b, base_off=0.5):
        a, b = np.array(a), np.array(b); dv = b - a; L = np.linalg.norm(dv); dv /= L
        n = np.array([-dv[1], dv[0]])
        A0 = a + n * base_off
        wall.tiled((A0[0], base, A0[1]), (dv[0], 0, dv[1]), (-n[0] * base_off, 1.8, -n[1] * base_off), L, math.hypot(1.8, base_off), 'sillar', np.array([0.86, 0.86, 0.86]))
        wall.tiled((a[0], base + 1.8, a[1]), (dv[0], 0, dv[1]), (0, 1, 0), L, H_W - base - 1.8, 'sillar')
        cn = n * 0.16
        wall.solid((a[0] + cn[0], base + 1.8, a[1] + cn[1]), (b[0] + cn[0], base + 1.8, b[1] + cn[1]), (b[0] + cn[0], base + 2.05, b[1] + cn[1]), (a[0] + cn[0], base + 2.05, a[1] + cn[1]), P['sillar.claro'])
        ip = n * -0.6
        wall.tiled((a[0], H_W, a[1]), (dv[0], 0, dv[1]), (0, 1, 0), L, 0.9, 'sillar')
        wall.tiled((b[0] + ip[0], H_W, b[1] + ip[1]), (-dv[0], 0, -dv[1]), (0, 1, 0), L, 0.9, 'sillar', np.array([0.9, 0.9, 0.9]))
        wall.solid((a[0], H_W + 0.9, a[1]), (b[0], H_W + 0.9, b[1]), (b[0] + ip[0], H_W + 0.9, b[1] + ip[1]), (a[0] + ip[0], H_W + 0.9, a[1] + ip[1]), P['sillar.claro'])
        k = 0.45
        while k + 0.9 <= L - 0.3:
            p0 = a + dv * k; p1 = a + dv * (k + 0.9)
            G.box(wall, (p0[0] + p1[0]) / 2 + ip[0] / 2, (p0[1] + p1[1]) / 2 + ip[1] / 2, 0.9, 0.6, H_W + 0.9, H_W + 1.5, 'white', top='white',
                  rot=math.atan2(dv[0], dv[1]) - math.pi / 2, col=P['sillar'], top_col=P['sillar.claro'])
            k += 1.7
    for i in range(len(trace) - 1): outer_face(trace[i], trace[i + 1])
    gola = [tuple(bp(100, RG))] + [q for psi in BAS for q in (bast_pts(psi)[0], bast_pts(psi)[4])] + [tuple(bp(260, RG))]
    for i in range(0, len(gola), 2):
        a, b = np.array(gola[i]), np.array(gola[i + 1])
        dv = b - a; L = np.linalg.norm(dv); dv /= L; n = np.array([-dv[1], dv[0]])
        ia, ib = a - n * 3.0, b - n * 3.0
        wall.tiled((ib[0], base, ib[1]), (-dv[0], 0, -dv[1]), (0, 1, 0), L, H_W - base, 'sillar', np.array([0.93, 0.93, 0.93]))
        at_top('ao', PC.ao, wall, tuple(ia), tuple(ib), tuple(-n), w=0.9, top=base)
        wall.tiled((ia[0], H_W, ia[1]), (dv[0], 0, dv[1]), (n[0], 0, n[1]), L, 3.0, 'losa', np.array([0.78, 0.76, 0.72]))
    for psi in BAS:
        pts = bast_pts(psi); c = np.mean(pts, axis=0)
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            wall.tri((a[0], H_W, a[1]), (b[0], H_W, b[1]), (c[0], H_W, c[1]), AT.uv('cesped', 0, 0), AT.uv('cesped', 1, 0), AT.uv('cesped', 0.5, 1))
        a, b = pts[4], pts[0]
        wall.wall(b, a, base, H_W, 'sillar', col=np.array([0.93, 0.93, 0.93]))
        wall.tri((a[0], H_W, a[1]), (b[0], H_W, b[1]), (c[0], H_W, c[1]), AT.uv('cesped', 0, 0), AT.uv('cesped', 1, 0), AT.uv('cesped', 0.5, 1))
        x, z = bp(psi, RG + 3.1); PC.garita(gar, x, z, H_W)
    for psi in (100, 260):
        x, z = bp(psi, RG - 1.0)
        G.cylinder(wall, x, z, 2.5, 2.2, base, base + 1.6, 10, reg=None, col=P['sillar'])
        G.cylinder(wall, x, z, 2.2, 2.2, base + 1.6, H_W + 0.9, 10, reg='sillar')
        G.cylinder(wall, x, z, 1.7, 1.7, H_W + 0.9, H_W + 0.95, 10, col='#B3AA96', top=True)
        PC.garita(gar, x, z, H_W + 0.95, corbel=False)
    # faro en la gola del baluarte del centro
    lx, lz = bp(180, RG + 0.6)
    G.cylinder(far, lx, lz, 2.1, 2.1, base, base + 0.9, 10, reg='sillar')
    ys = np.linspace(base + 0.9, base + 12.0, 6)
    for i in range(5):
        r0 = 1.45 - 0.08 * i; r1 = 1.45 - 0.08 * (i + 1)
        G.cylinder(far, lx, lz, r0, r1, ys[i], ys[i + 1], 10, col=P['faro'] if i % 2 == 0 else P['faro.franja'])
    G.cylinder(far, lx, lz, 1.3, 1.3, ys[-1], ys[-1] + 0.2, 10, col=P['capitel'])
    G.cylinder(far, lx, lz, 0.8, 0.8, ys[-1] + 0.2, ys[-1] + 1.2, 8, col=P['linterna'])
    G.dome(far, lx, lz, 0.95, ys[-1] + 1.2, 8, 2, P['capitel'], squash=0.8)
    # puerta roja: cuerpo de guardia hacia la plaza mayor, y la muralla interior baja que cierra el patio
    GX, GZ = 1.0, fz + 12.4
    G.box(gate, GX, GZ, 6.5, 2.6, TOP, FORT_TOP + 3.4, 'sillar', top='losa'); PC.foot('puerta roja', GX, GZ, 6.5, 2.6)
    gate.tiled((GX - 2.0, TOP, GZ + 1.31), (1, 0, 0), (0, 1, 0), 4.0, 4.0, 'porton')
    yb = FORT_TOP + 3.4
    gate.solid((GX - 3.45, yb, GZ + 1.4), (GX + 3.45, yb, GZ + 1.4), (GX + 3.45, yb + 0.35, GZ + 1.4), (GX - 3.45, yb + 0.35, GZ + 1.4), P['sillar.claro'])
    gate.solid((GX - 3.45, yb + 0.35, GZ - 1.4), (GX + 3.45, yb + 0.35, GZ - 1.4), (GX + 3.45, yb + 0.35, GZ + 1.4), (GX - 3.45, yb + 0.35, GZ + 1.4), P['sillar.claro'])
    G.prism(gate, (GX + 2.6, yb + 0.35, GZ), (GX + 2.6, yb + 6.0, GZ), 0.09, 4, P['mastil'])
    gate.soltri((GX + 2.6, yb + 5.9, GZ), (GX + 2.6, yb + 4.7, GZ), (GX + 4.6, yb + 5.3, GZ + 0.15), P['flag'])
    gate.soltri((GX + 2.6, yb + 5.9, GZ), (GX + 4.6, yb + 5.3, GZ + 0.15), (GX + 2.6, yb + 4.7, GZ), P['flag'])
    at_top('ao', PC.ao, gate, (GX - 3.25, GZ + 1.3), (GX + 3.25, GZ + 1.3), (0, 1))
    for sgn in (1, -1):
        a = np.array([GX + sgn * 3.25, GZ]); b = np.array(bp(100 if sgn > 0 else 260, RG - 2.4))
        dv = b - a; L = float(np.linalg.norm(dv)); uu = dv / L; n = np.array([uu[1], -uu[0]]) * sgn
        s_a, s_b = a + n * 0.6, b + n * 0.6
        (gate.wall(tuple(s_a), tuple(s_b), TOP, FORT_TOP + 2.0, 'sillar') if sgn == -1 else gate.wall(tuple(s_b), tuple(s_a), TOP, FORT_TOP + 2.0, 'sillar'))
        gate.solid((s_a[0], FORT_TOP + 2.0, s_a[1]), (s_b[0], FORT_TOP + 2.0, s_b[1]), (s_b[0] - 1.2 * n[0], FORT_TOP + 2.0, s_b[1] - 1.2 * n[1]), (s_a[0] - 1.2 * n[0], FORT_TOP + 2.0, s_a[1] - 1.2 * n[1]), P['sillar.claro'])
    # patio de armas: capitanía blanca de 2 plantas y 2 ceibas
    at_top('casa', PC.house, pat, fx + 0.5, fz + 4.0, 8.0, 4.2, 2, 'blanca', roof='hip', door=True, top=FORT_TOP)
    G.tree(pat, fx - 7.0, fz + 4.6, FORT_TOP, 6.0, rng); G.tree(pat, fx + 7.6, fz + 4.2, FORT_TOP, 5.6, rng)
    for psi in (130, 230):
        x, z = bp(psi, RG + 1.6)
        G.prism(pat, (x, H_W, z), (x, H_W + 3.6, z), 0.07, 4, P['mastil'])
        pat.soltri((x, H_W + 3.55, z), (x, H_W + 2.75, z), (x + 1.5, H_W + 3.15, z + 0.1), P['flag'])
        pat.soltri((x, H_W + 3.55, z), (x + 1.5, H_W + 3.15, z + 0.1), (x, H_W + 2.75, z), P['flag'])
    return (lx, lz)


# Ciudad: las 2 plazas, casas de colores, iglesia, almacenes y la grúa. Posiciones en coordenadas del juego (+X este, +Z sur)
PLAZA_MAYOR = (-6.4, -3.6, 8.4, 8.8)      # x0, z0, x1, z1: fuente y mercado, de cara a la puerta roja
PLAZA_IGLESIA = (-23.0, 11.5, -11.0, 19.0)  # la iglesia al norte, abierta al muelle del suroeste
HOUSES = [  # (x, z, ancho, fondo, plantas, color, tejado, giro)
    (-10.4, -2.4, 5.0, 5.4, 2, 'ocre', 'flat', math.pi / 2), (-10.6, 3.0, 4.6, 5.2, 2, 'azul', 'gable', math.pi / 2),
    (12.4, -2.4, 5.0, 5.4, 2, 'rosa', 'flat', -math.pi / 2), (12.6, 3.0, 4.6, 5.2, 2, 'celeste', 'gable', -math.pi / 2),
    (13.0, 8.4, 5.0, 5.0, 2, 'amarilla', 'flat', -math.pi / 2),
    (13.2, 18.4, 4.4, 4.6, 2, 'rosa', 'gable', 0.0), (18.6, 13.8, 4.6, 4.2, 2, 'ocre', 'gable', -0.55),
    (22.8, 8.0, 4.4, 4.4, 1, 'menta', 'flat', -1.0), (-24.4, 6.0, 4.4, 4.6, 1, 'celeste', 'gable', 0.5),
    (-9.0, 20.6, 4.0, 3.8, 1, 'amarilla', 'flat', 0.0), (19.0, -10.0, 4.6, 4.2, 2, 'blanca', 'gable', -1.2),
]
CHURCH = (-17.0, 7.0)


def town(t, st, crane, rng, X, Z, H):
    for (x, z, sx, sz, fl, col, roof, rot) in HOUSES: PC.house(t, x, z, sx, sz, fl, col, roof=roof, rot=rot, door=True)
    PC.church(t, *CHURCH)
    x0, z0, x1, z1 = PLAZA_MAYOR; t.ground(x0, z0, x1, z1, TOP + 0.02, 'losa', col=np.array([1.12, 1.04, 0.9]))
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2; PC.fountain(t, cx, cz)
    for (dx, dz, k, rot) in ((-3.4, 3.2, 'a', 0.0), (3.4, 3.2, 'b', 0.0), (-4.6, -2.0, 'c', math.pi / 2), (4.6, -2.0, 'a', -math.pi / 2)):
        PC.stall(t, cx + dx, cz + dz, k, rot)
    x0, z0, x1, z1 = PLAZA_IGLESIA; t.ground(x0, z0, x1, z1, TOP + 0.02, 'losa', col=np.array([1.08, 1.04, 0.96]))
    G.tree(t, -20.4, 15.0, TOP, 5.4, rng); G.tree(t, -13.4, 15.4, TOP, 5.0, rng)
    for (x, z, k) in ((-7.6, -5.0, 0), (9.6, -5.0, 1), (-7.8, 7.8, 1), (9.8, 7.8, 0), (-14.2, 10.6, 0), (-21.4, 10.4, 1), (15.0, 11.0, 0), (-1.0, 12.6, 1)):
        G.blob(t, x, TOP + 0.9, z, 0.9, P['buganvilla' if k == 0 else 'buganvilla2']); G.blob(t, x + 0.6, TOP + 0.5, z + 0.3, 0.6, '#4E8A3C')
    # almacenes y grúa del muelle este
    mx, mz, mr = BY['muelle este']
    PC.house(st, mx - 2.0, mz + 3.0, 7.6, 4.6, 1, 'blanca', roof='gable', rot=math.pi / 2 - 0.3, door=True, floor_h=3.8)
    PC.house(st, mx + 1.0, mz - 6.0, 6.4, 4.2, 1, 'blanca', roof='gable', rot=math.pi / 2 + 0.5, door=True, floor_h=3.4)
    gx, gz = 42.5, 3.0   # junto al amarre 4; la oclusión (hacia el norte) no llega a ningún casco atracado
    G.cylinder(crane, gx, gz, 0.35, 0.3, TOP, TOP + 7.0, 6, col=P['mastil'])
    tip = np.array([gx, gz]) + 5.0 * u(235)   # la pluma, sobre el muelle: nada asoma fuera de la unión
    G.prism(crane, (gx, TOP + 7.0, gz), (tip[0], TOP + 8.0, tip[1]), 0.15, 4, P['mastil'])
    G.prism(crane, (tip[0], TOP + 7.9, tip[1]), (tip[0], TOP + 3.5, tip[1]), 0.05, 3, '#3A2A20')
    for k, (dpsi, rr) in enumerate(((80, 9.0), (95, 10.0), (105, 8.5), (140, 9.5), (70, 6.0), (150, 7.0))):
        c = np.array([mx, mz]) + rr * u(dpsi)
        if k % 3 == 2: G.cylinder(crane, c[0], c[1], 0.4, 0.4, TOP, TOP + 1.0, 7, col=P['barril'], top=True, top_col='#6E4528')
        else: G.box(crane, c[0], c[1], 1.1, 1.1, TOP, TOP + 1.0, 'white', top='white', col=P['carga' if k % 2 else 'saco'], top_col=np.asarray(G.hexlin(P['carga'])) * 1.12, rot=0.3 * k)


def nature(palms, props, isla, X, Z, H, K, D, DS, F, rng, nrng):
    """El palmar (selva densa de palmeras y árboles), palmeras de playa inclinadas hacia el agua, la roca del noroeste con su
    garita y el islote; rocas de costa en la roca y el islote. Las palmeras son instancias de prop_palm en el juego."""
    d, Gq, wf, Dk = zone_fields(X, Z); T = DS - D
    n = 0
    owner = np.argmin(Dk, axis=0)
    jungle = (Gq < -1.5) & (T > 6.5) & (F < -0.5)
    for (x, z, h, i, j) in IS.poisson(isla, X, Z, H, K, D, DS, 3.6, jungle, nrng):
        if rng.random() < 0.75: n += IS.add_palm(palms, isla, x, z, float(h), rng.uniform(5.6, 8.0), rng, cheap=True)
        else:
            y_, r_, c_ = float(h) + rng.uniform(2.2, 3.4), rng.uniform(2.2, 3.0), IS.C[rng.choice(['hoja.a', 'hoja.b', 'hoja.c'])]
            IS.guarded(props, isla, lambda m, x=x, z=z, h=h, y_=y_, r_=r_, c_=c_: (G.crown(m, x, y_, z, r_, c_, rng), G.prism(m, (x, float(h), z), (x, float(h) + 2.4, z), 0.22, 3, IS.C['palma.tronco'])))
    beach = (Gq < -0.5) & (T > 2.0) & (T < 5.6) & (F < -0.5)
    gi = np.gradient(D)
    for (x, z, h, i, j) in IS.poisson(isla, X, Z, H, K, D, DS, 6.0, beach, nrng):
        if rng.random() < 0.7:
            lean = math.atan2(float(gi[1][i, j]), float(gi[0][i, j]))
            n += IS.add_palm(palms, isla, x, z, float(h), rng.uniform(5.0, 7.0), rng, lean=lean)
    coast = (Gq < -0.5) & (T > -0.6) & (T < 0.9) & (owner != NAMES.index('palmar'))
    for (x, z, h, i, j) in IS.poisson(isla, X, Z, H, K, D, DS, 5.0, coast, nrng):
        r_, h_, c_ = rng.uniform(0.8, 1.5), rng.uniform(0.7, 1.6), IS.C['roca.osc'] if rng.random() < 0.5 else IS.C['acantilado']
        IS.guarded(props, isla, lambda m, x=x, z=z, r_=r_, h_=h_, c_=c_: G.rock(m, x, z, r_, h_, rng, c_))
    # palmeras en las plazas y en la ciudad (rectas, sobre el empedrado)
    for (x, z) in ((-4.8, -1.8), (6.8, -1.8), (-4.8, 6.8), (6.8, 6.8), (-15.0, 18.0), (-6.0, 24.0), (16.0, 19.0), (26.0, 0.0), (24.0, -12.0)):
        n += IS.add_palm(palms, isla, x, z, TOP, rng.uniform(5.6, 7.2), rng)
    # garita sobre la roca del noroeste (la imagen del Viejo San Juan, de cara al mar) y botes en la playa del palmar
    rx, rz, rr = BY['roca noroeste']; gx, gz = rx - 2.0 - 2.4, rz - 1.0 - 2.4
    PC.garita(props, gx, gz, IS.at_h(X, Z, H, gx, gz), corbel=False, scale=1.0)  # H: la superficie (la tapa de la roca)
    px, pz, pr = BY['palmar']
    for (ang, rot) in ((205, 0.4), (300, -0.5)):
        c = np.array([px, pz]) + (pr - 3.6) * u(ang)
        PC.boat(props, c[0], c[1], IS.at_h(X, Z, H, c[0], c[1]) + 0.05, rot + math.radians(ang))
    return n


def build():
    rng = random.Random(20261019); nrng = np.random.default_rng(20261019)
    isla = PortIsla()
    ter = piece('terreno')
    X, Z, SURF, K, D, DS, F = terrain(ter, isla)
    H = SURF
    lh = fort(piece('murallas'), piece('garitas'), piece('faro'), piece('puerta_roja'), piece('patio'), rng)
    town(piece('casas'), piece('almacenes'), piece('grua_carga'), rng, X, Z, H)
    sx = 1.0; zc = float(BY['ciudad este'][1]) + math.sqrt(BY['ciudad este'][2] ** 2 - (BY['ciudad este'][0] - sx) ** 2)
    grada(piece('astillero'), sx, 11.5, zc - QUAY_FACE - 0.5)
    yard = pieces['astillero']
    G.box(yard, sx + 6.8, 15.0, 4.4, 8.0, TOP, TOP + 3.0, 'tabla'); PC.foot('cobertizo', sx + 6.8, 15.0, 4.4, 8.0)
    G.gable(yard, sx + 6.8, 15.0, 8.0, 4.4, TOP + 3.0, 1.4, 'teja', rot=math.pi / 2, gable_col=P['tabla'])
    G.box(yard, sx - 6.2, 15.5, 2.0, 3.5, TOP, TOP + 1.0, 'tabla', top='tabla'); PC.foot('madera', sx - 6.2, 15.5, 2.0, 3.5)
    bm = piece('amarres')
    for k, (Q, psi, tramo) in enumerate(BERTHS):
        if NAMES.index(tramo) in QUAY: quay_berth(bm, Q, psi, k)
        else: beach_pier(bm, Q, psi)
    palms = piece('palmeras'); props = piece('naturaleza')
    n_palm = nature(palms, props, isla, X, Z, H, K, D, DS, F, rng, nrng)
    return isla, n_palm, lh, (X, Z, H, K, D, DS, F)


# ---------------------------------------------------------------- comprobaciones
def checks(n_palm):
    P_all = np.concatenate([np.array(m.p) for m in pieces.values() if m.p])
    up = P_all[P_all[:, 1] > 0.001]
    d_up = IS.sdf(CIRC, up[:, 0], up[:, 2])
    occ = np.stack([up[:, 0], up[:, 2] - T55 * up[:, 1]], 1)
    d_occ = IS.sdf(CIRC, occ[:, 0], occ[:, 1])
    res = {'fuera_max_y_pos': round(float(d_up.max()), 2), 'peor_fuera': [round(float(v), 2) for v in up[int(np.argmax(d_up))]],
           'oclusion_fuera_max': round(float(d_occ.max()), 2), 'altura_max': round(float(P_all[:, 1].max()), 2)}
    # oclusión sobre los cascos atracados: el punto de suelo tapado de cada vértice, a ≥ 1 m de los 60 cascos (12 × 5)
    worst = (1e9, None)
    near = occ[d_occ > -1.0]
    for k, (Q, psi, _) in enumerate(BERTHS):
        for cls in PF.CLS:
            dd = PF.rect_point_dist(Q, psi, cls, near).min() if len(near) else 99
            if dd < worst[0]: worst = (float(dd), f'amarre {k + 1} {cls}')
    res['oclusion_a_cascos_min'] = [round(worst[0], 2), worst[1]]
    # costa visible: dónde corta y = 0 el terreno, y su distancia por dentro del borde (AC-199 a: de 0 a 3 m)
    Pt = np.array(pieces['terreno'].p).reshape(-1, 3, 3); y = Pt[:, :, 1]; pts = []
    for k in range(3):
        a, b = Pt[:, k], Pt[:, (k + 1) % 3]; ya, yb = y[:, k], y[:, (k + 1) % 3]; mk = (ya > 0) != (yb > 0)
        s = (ya[mk] / (ya[mk] - yb[mk]))[:, None]; pts.append(a[mk] + (b[mk] - a[mk]) * s)
    Qc = np.concatenate(pts); dc = IS.sdf(CIRC, Qc[:, 0], Qc[:, 2])
    res['costa_por_dentro_m'] = [round(float(-dc.max()), 2), round(float(-dc.min()), 2)]
    res['tris'] = {k: m.ntri() for k, m in pieces.items()}; res['tris_total'] = sum(res['tris'].values())
    res['tris_sin_palmeras'] = res['tris_total'] - res['tris']['palmeras']; res['palmeras'] = n_palm
    g = PC.gaps(); res['holgura_min_piezas'] = g[0]; res['pares_bajo_0_4'] = [x for x in g if x[0] < 0.4][:8]
    return res


if __name__ == '__main__':
    paint_atlas().save(os.path.join(OUT, 'atlas_puerto_isla.png'))
    isla, n_palm, lh, _ = build()
    P_all, T_all, C_all = [], [], []
    for m in pieces.values(): P_all += m.p; T_all += m.t; C_all += [tuple(c) for c in m.c]
    np.savez(os.path.join(OUT, 'puerto_isla_lod0.npz'), p=np.array(P_all, float), t=np.array(T_all, float), c=np.array(C_all, float), r=np.zeros(len(P_all)))
    res = checks(n_palm); res['faro'] = [round(float(v), 2) for v in lh]; res['variante'] = VAR
    json.dump(res, open(os.path.join(OUT, 'puerto-isla-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(res, ensure_ascii=False))

# Uso (desde la raíz del repo): python3 -I scripts/ux/mapa/puerto_forma.py
#   →  $UX_OUT/mapa/puerto-forma.json y puerto-forma.png (ligero: segundos)
# Forma y amarres del puerto con forma de isla (D92; Jonattan sobre D82: «Quiero no sea un circulo, que sea mas irregular
# como una isla y que una parte sea palmeras y mas ver con plazas»). Las reglas son las de GDD §4, «El puerto con forma de
# isla» (producto, 2026-10-18): unión de ≤ 8 círculos que contiene (0, 0), ninguno a más de 55 m del centro contando su
# borde; 12 amarres, cada uno con un punto de muelle Q en el borde de la unión y un rumbo ψ hacia fuera; el barco atracado
# con el centro a L/2 + 2 de Q en ψ, a su margen o más de toda la unión, sin solaparse con ningún barco de otro amarre (las
# 25 parejas de clases); la salida en ψ hasta la zona segura, navegable y de ≤ 80 m; el anillo de 60–90 m navegable para el
# Navío en ≥ 50 % de su área; (0, 75) navegable para las 5 clases; y la separación de 46 m con las demás islas
# (circulos.py). Los amarres se eligen entre los tramos de muelle de QUAY: los 12 que dejan más holgura entre cascos.
# Coordenadas del juego: +X este, +Z sur (hacia la cámara); rumbo ψ como GDD §4: dirección (sen ψ, cos ψ). No corre en la CI.
import json, math, os, sys
sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here); sys.path.insert(0, os.path.join(here, '..', 'laminas'))
import rutas as RT
import numpy as np
from PIL import Image, ImageDraw
import circulos as CI

OUT = os.path.join(RT.OUT, 'mapa'); os.makedirs(OUT, exist_ok=True)

# Variantes de forma: (nombre, x, z, r) por círculo, y los tramos de muelle donde puede ir un amarre (círculo, ψ desde,
# ψ hasta). El fuerte, la roca y el islote no tienen muelle. En la ensenada entre los 2 círculos de la ciudad, donde no cabe
# amarre, va la grada del astillero (la tienda), de cara a la cámara
VARIANTS = {
    'v2': ([('ciudad este', 14.0, 8.0, 22.0), ('ciudad oeste', -12.0, 8.0, 22.0), ('fuerte', 0.0, -22.0, 15.0), ('muelle este', 30.0, -8.0, 16.0),
            ('palmar', -30.0, -6.0, 16.0), ('roca noroeste', -18.0, -28.0, 9.0), ('islote', -40.0, -30.0, 4.5)],
           [('ciudad este', 0, 120), ('ciudad oeste', 240, 360), ('muelle este', 20, 175), ('palmar', 185, 330)]),
    'v3': ([('ciudad este', 14.0, 8.0, 22.0), ('ciudad oeste', -12.0, 8.0, 22.0), ('fuerte', 0.0, -22.0, 15.0), ('muelle este', 31.0, -6.0, 17.0),
            ('palmar', -31.0, -4.0, 17.0), ('roca noroeste', -16.0, -30.0, 9.0), ('islote', -39.0, -31.0, 4.5)],
           [('ciudad este', 0, 120), ('ciudad oeste', 240, 360), ('muelle este', 20, 175), ('palmar', 185, 340)]),
    'v5': ([('ciudad este', 14.0, 8.0, 22.0), ('ciudad oeste', -12.0, 8.0, 22.0), ('fuerte', 0.0, -22.0, 15.0), ('muelle este', 32.0, -6.0, 18.0),
            ('palmar', -32.0, -4.0, 18.0), ('roca noroeste', -16.0, -30.0, 9.0), ('islote', -39.0, -31.0, 4.5)],
           [('ciudad este', 0, 120), ('ciudad oeste', 240, 360), ('muelle este', 20, 175), ('palmar', 185, 340)]),
    'v6': ([('ciudad este', 14.0, 8.0, 23.0), ('ciudad oeste', -12.0, 8.0, 23.0), ('fuerte', 0.0, -22.0, 15.0), ('muelle este', 32.0, -6.0, 17.0),
            ('palmar', -32.0, -4.0, 17.0), ('roca noroeste', -16.0, -30.0, 9.0), ('islote', -39.0, -31.0, 4.5)],
           [('ciudad este', 0, 120), ('ciudad oeste', 240, 360), ('muelle este', 20, 175), ('palmar', 185, 340)]),
    'v4': ([('ciudad este', 13.0, 6.0, 24.0), ('ciudad oeste', -13.0, 6.0, 24.0), ('fuerte', 0.0, -24.0, 15.0), ('muelle este', 32.0, -12.0, 14.0),
            ('palmar', -32.0, -10.0, 14.0), ('roca noroeste', -18.0, -32.0, 8.0), ('islote', -40.0, -30.0, 4.5)],
           [('ciudad este', 0, 130), ('ciudad oeste', 230, 360), ('muelle este', 30, 175), ('palmar', 185, 330)]),
}
CIRCLES, QUAY = VARIANTS['v2']
SHIPYARD = None
N_BERTHS = 12
CLS = {'Balandra': (16, 4.4), 'Goleta': (22, 5.6), 'Bergantín': (24, 6.2), 'Fragata': (34, 8.6), 'Navío': (42, 11.2)}  # L × B (puerto.py)
MARGIN = {c: L / 2 + 2 for c, (L, B) in CLS.items()}
SAFE, MAX_R, MAX_N, EXIT_MAX, RING, AXIS_LEN, AXIS_FREE = 110.0, 55.0, 8, 80.0, (60.0, 90.0), 46.0, 12.0
HULL_GAP, LAND_GAP = 1.0, 0.5   # holgura mínima entre cascos de amarres distintos y de un casco a la tierra (m)
C = np.array([(x, z, r) for _, x, z, r in CIRCLES])
NAME = [n for n, *_ in CIRCLES]


def u(psi): a = math.radians(psi); return np.array([math.sin(a), math.cos(a)])


def sdf(P):
    P = np.asarray(P, float); d = np.full(P.shape[:-1], 1e9)
    for (x, z, r) in C: d = np.minimum(d, np.hypot(P[..., 0] - x, P[..., 1] - z) - r)
    return d


def hull(Q, psi, cls):
    L, B = CLS[cls]; d = u(psi); p = np.array([d[1], -d[0]]); c = Q + d * MARGIN[cls]
    return c, np.array([c + sx * L / 2 * d + sy * B / 2 * p for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])


def rect_point_dist(Q, psi, cls, P):
    """Distancia de los puntos P (…, 2) al casco atracado (0 dentro)."""
    L, B = CLS[cls]; d = u(psi); p = np.array([d[1], -d[0]]); c = Q + d * MARGIN[cls]
    v = np.asarray(P, float) - c; a = v @ d; b = v @ p
    return np.hypot(np.maximum(np.abs(a) - L / 2, 0), np.maximum(np.abs(b) - B / 2, 0))


def hull_land(Q, psi, cls):
    """Holgura del casco a la unión: mín sobre los círculos de (distancia del centro del círculo al rectángulo) − r."""
    return float(min(rect_point_dist(Q, psi, cls, np.array([x, z])) - r for (x, z, r) in C))


def poly_gap(A, B):
    """Distancia entre 2 polígonos convexos (negativa si se solapan: −1)."""
    def axes(P): e = np.roll(P, -1, 0) - P; n = np.stack([-e[:, 1], e[:, 0]], 1); return n / np.linalg.norm(n, axis=1, keepdims=True)
    for n in np.concatenate([axes(A), axes(B)]):
        pa, pb = A @ n, B @ n
        if pa.max() < pb.min() or pb.max() < pa.min(): break
    else: return -1.0
    def segd(P, a, b):
        ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1); return np.hypot(*(P - a - t[:, None] * ab).T).min()
    return float(min(min(segd(A, B[i], B[(i + 1) % 4]) for i in range(4)), min(segd(B, A[i], A[(i + 1) % 4]) for i in range(4))))


def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1); return float(np.hypot(*(P - a - t * ab)))


def exit_ray(Q, psi, cls):
    """Salida en ψ: largo del centro del barco al borde de la zona segura y la holgura mínima a la unión por el camino."""
    c = Q + u(psi) * MARGIN[cls]; d = u(psi); b = c @ d; t = -b + math.sqrt(b * b - (c @ c - SAFE ** 2))
    pts = c + np.outer(np.arange(0, t + 1e-9, 0.5), d)
    return t, float((sdf(pts) - MARGIN[cls]).min())


def candidates():
    out = []
    for name, a0, a1 in QUAY:
        k = NAME.index(name); x, z, r = C[k]
        for psi in np.arange(a0, a1 + 1e-9, 2.0):
            psi = float(psi % 360); Q = np.array([x, z]) + r * u(psi)
            if any(math.hypot(Q[0] - C[j][0], Q[1] - C[j][1]) < C[j][2] + 0.5 for j in range(len(C)) if j != k): continue
            if SHIPYARD and name == SHIPYARD[0] and abs(((psi - SHIPYARD[1] + 180) % 360) - 180) < SHIPYARD[2]: continue
            ok = True
            for cls in CLS:
                c, _ = hull(Q, psi, cls)
                if sdf(c) < MARGIN[cls] - 1e-6 or hull_land(Q, psi, cls) < LAND_GAP: ok = False; break
                t, g = exit_ray(Q, psi, cls)
                if t > EXIT_MAX or g < -1e-6: ok = False; break
            if ok: out.append((name, psi, Q))
    return out


def hulls_all(Q, psi):
    return np.stack([hull(Q, psi, c)[1] for c in CLS])          # (5, 4, 2)


def gap_batch(A, B):
    """poly_gap en lote: A, B (m, 4, 2) → (m,) holgura (−1 si se solapan)."""
    def normals(P):
        e = np.roll(P, -1, 1) - P; n = np.stack([-e[..., 1], e[..., 0]], -1); return n / np.linalg.norm(n, axis=-1, keepdims=True)
    N = np.concatenate([normals(A), normals(B)], 1)               # (m, 8, 2)
    pa = np.einsum('mvk,mak->mav', A, N); pb = np.einsum('mvk,mak->mav', B, N)
    sep = (pa.max(-1) < pb.min(-1)) | (pb.max(-1) < pa.min(-1))
    over = ~sep.any(-1)
    def vs(P, R):  # vértices de P a las aristas de R: (m, 4, 4)
        a = R[:, None, :, :]; b = np.roll(R, -1, 1)[:, None, :, :]; p = P[:, :, None, :]; ab = b - a
        t = np.clip(((p - a) * ab).sum(-1) / (ab * ab).sum(-1), 0, 1)
        return np.linalg.norm(p - a - t[..., None] * ab, axis=-1)
    d = np.minimum(vs(A, B).min((1, 2)), vs(B, A).min((1, 2)))
    return np.where(over, -1.0, d)


IDX = [(i, j) for i in range(5) for j in range(5)]


def pair_gap(ha, hb):
    """Peor holgura entre los cascos de 2 amarres, en las 25 parejas de clases (ha, hb: hulls_all)."""
    A = np.stack([ha[i] for i, j in IDX]); B = np.stack([hb[j] for i, j in IDX]); return float(gap_batch(A, B).min())


def choose(cands):
    """Los N_BERTHS amarres con la mayor holgura mínima entre cascos: voraz (el más alejado) desde varias semillas y luego
    intercambios de uno en uno mientras suba la holgura mínima."""
    n = len(cands); H = [hulls_all(Q, psi) for _, psi, Q in cands]
    G = np.full((n, n), 99.0)
    for i in range(n):      # solo hace falta entre candidatos cercanos: el casco sale ≤ 46 m de Q y mide ≤ 11,2 de ancho
        for j in range(i + 1, n):
            if np.hypot(*(cands[i][2] - cands[j][2])) < 2 * 46 + 12:
                G[i, j] = G[j, i] = pair_gap(H[i], H[j])
    np.fill_diagonal(G, 99.0)
    def score(sel): return float(G[np.ix_(sel, sel)].min())
    best = None
    for seed in range(0, n, max(1, n // 24)):
        sel = [seed]
        while len(sel) < N_BERTHS:
            free = [j for j in range(n) if j not in sel]
            if not free: break
            sel.append(max(free, key=lambda j: G[j, sel].min()))
        if len(sel) < N_BERTHS: continue
        cur = score(sel); improved = True
        while improved:
            improved = False
            for k in range(len(sel)):
                rest = sel[:k] + sel[k + 1:]; rmin = score(rest)
                if rmin <= cur + 1e-6: continue
                cand = [j for j in range(n) if j not in sel]
                if not cand: continue
                j = max(cand, key=lambda j: G[j, rest].min()); v = min(rmin, G[j, rest].min())
                if v > cur + 1e-6: sel = rest + [j]; cur = v; improved = True; break
        if best is None or cur > best[0]: best = (cur, sorted(sel, key=lambda i: math.degrees(math.atan2(cands[i][2][0], cands[i][2][1])) % 360))
    return best, G


def ring_navigable(cls='Navío', n=40000, seed=7):
    rs = np.random.default_rng(seed); r = np.sqrt(rs.uniform(RING[0] ** 2, RING[1] ** 2, n)); a = rs.uniform(0, 2 * math.pi, n)
    P = np.stack([r * np.sin(a), r * np.cos(a)], 1); return float((sdf(P) >= MARGIN[cls]).mean())


def other_islands():
    worst = (1e9, None)
    for iid, v in CI.ISLAS.items():
        if iid == 'PORT': continue
        for (x, z, r) in v[4]:
            for (cx, cz, cr) in C:
                g = math.hypot(x - cx, z - cz) - r - cr
                if g < worst[0]: worst = (g, iid)
    return round(worst[0], 1), worst[1]


def report(berths):
    res = {'circulos': len(C), 'alcance_max_m': round(float(max(math.hypot(x, z) + r for x, z, r in C)), 2),
           'centro_dentro': bool(sdf(np.array([0.0, 0.0])) < 0)}
    res['anillo_navegable_navio'] = round(ring_navigable(), 3)
    res['punto_0_75'] = {c: round(float(sdf(np.array([0.0, 75.0])) - MARGIN[c]), 1) for c in CLS}
    res['separacion_otras_islas'] = other_islands()
    rows = []
    for k, (name, psi, Q) in enumerate(berths):
        row = {'amarre': k + 1, 'tramo': name, 'Q': [round(float(Q[0]), 2), round(float(Q[1]), 2)], 'psi': round(psi, 1)}
        for cls in CLS:
            c, _ = hull(Q, psi, cls); t, g = exit_ray(Q, psi, cls)
            row[cls] = {'centro': [round(float(c[0]), 1), round(float(c[1]), 1)], 'a_la_union': round(float(sdf(c)), 2),
                        'casco_a_tierra': round(hull_land(Q, psi, cls), 2), 'salida_m': round(t, 1), 'salida_holgura': round(g, 2)}
        rows.append(row)
    res['amarres'] = rows
    gaps = []
    for i in range(len(berths)):
        for j in range(i + 1, len(berths)):
            a, b = berths[i], berths[j]
            if np.hypot(*(a[2] - b[2])) > 110: continue
            w = min((poly_gap(hull(a[2], a[1], c1)[1], hull(b[2], b[1], c2)[1]), c1, c2) for c1 in CLS for c2 in CLS)
            gaps.append((round(w[0], 2), i + 1, j + 1, w[1], w[2]))
    gaps.sort(); res['peores_pares_cascos'] = gaps[:6]
    ax = []
    for i, (n1, p1, Q1) in enumerate(berths):
        for j, (n2, p2, Q2) in enumerate(berths):
            if i == j: continue
            a, b = Q2, Q2 + u(p2) * AXIS_LEN
            for cls in CLS:
                c, _ = hull(Q1, p1, cls); dd = seg_dist(c, a, b)
                if dd < AXIS_FREE: ax.append((round(dd, 1), i + 1, j + 1, cls))
    ax.sort(); res['centros_a_menos_de_12_del_eje_de_otro'] = ax[:12]
    return res


def plan(berths, path, ppm=5.0, half=115):
    W = int(2 * half * ppm); img = Image.new('RGB', (W, W), (31, 94, 140)); d = ImageDraw.Draw(img)
    S = lambda x, z: (W / 2 + x * ppm, W / 2 + z * ppm)
    rs = np.random.default_rng(3); r = np.sqrt(rs.uniform(RING[0] ** 2, RING[1] ** 2, 30000)); a = rs.uniform(0, 2 * math.pi, 30000)
    P = np.stack([r * np.sin(a), r * np.cos(a)], 1); bad = sdf(P) < MARGIN['Navío']
    for (x, z), b in zip(P, bad): d.point(S(x, z), fill=(200, 90, 80) if b else (52, 112, 156))
    for rr, col in ((SAFE, (240, 200, 90)), (RING[0], (120, 160, 190)), (RING[1], (120, 160, 190)), (MAX_R, (255, 255, 255)), (30, (255, 120, 120))):
        d.ellipse([S(-rr, -rr), S(rr, rr)], outline=col, width=1)
    G_ = np.mgrid[-60:60:0.2, -60:60:0.2].reshape(2, -1).T; ins = G_[sdf(G_) < 0]
    for (x, z) in ins: d.point(S(x, z), fill=(110, 160, 90))
    for k, (_, x, z, r) in enumerate(CIRCLES):
        d.ellipse([S(x - r, z - r), S(x + r, z + r)], outline=(255, 255, 255), width=1); d.text(S(x - 3, z - 2), str(k + 1), fill=(255, 255, 255))
    for k, (name, psi, Q) in enumerate(berths):
        for cls, col in (('Navío', (240, 150, 60)), ('Balandra', (250, 230, 120))):
            _, h = hull(Q, psi, cls); d.polygon([S(*p) for p in h], outline=col)
        d.ellipse([S(Q[0] - 0.8, Q[1] - 0.8), S(Q[0] + 0.8, Q[1] + 0.8)], fill=(255, 255, 255))
        e = Q + u(psi) * 30; d.text(S(*e), str(k + 1), fill=(255, 255, 255))
    img.save(path)


def use(vname):
    """Fija la variante de forma en las variables globales que leen las funciones de arriba."""
    global CIRCLES, QUAY, C, NAME
    CIRCLES, QUAY = VARIANTS[vname]; C = np.array([(x, z, r) for _, x, z, r in CIRCLES]); NAME = [n for n, *_ in CIRCLES]


if __name__ == '__main__':
    want = sys.argv[1:] or list(VARIANTS)
    for vname in want:
        use(vname)
        cands = candidates()
        print(f'== {vname} · candidatos:', len(cands), {n: [round(min(c[1] for c in cands if c[0] == n)), round(max(c[1] for c in cands if c[0] == n)), sum(1 for c in cands if c[0] == n)] for n, *_ in QUAY if any(c[0] == n for c in cands)})
        (score, sel), G = choose(cands)
        berths = [cands[i] for i in sel]
        res = report(berths); res['holgura_minima_entre_cascos'] = round(float(score), 2)
        res['circulos_tabla'] = [{'nombre': n, 'x': x, 'z': z, 'r': r} for n, x, z, r in CIRCLES]
        json.dump(res, open(os.path.join(OUT, f'puerto-forma-{vname}.json'), 'w'), indent=1, ensure_ascii=False)
        plan(berths, os.path.join(OUT, f'puerto-forma-{vname}.png'))
        short = {k: v for k, v in res.items() if k not in ('amarres', 'circulos_tabla', 'centros_a_menos_de_12_del_eje_de_otro')}
        print(json.dumps(short, ensure_ascii=False))
        print('  ejes a < 12 m (amarre, del eje de, clase):', [(a, b, c, d) for a, b, c, d in res['centros_a_menos_de_12_del_eje_de_otro'][:6]])
        for row in res['amarres']:
            nv = row['Navío']
            print(f"  {row['amarre']:2d} {row['tramo']:13s} Q {row['Q']} ψ {row['psi']:5.0f} · Navío centro {nv['centro']} salida {nv['salida_m']}")

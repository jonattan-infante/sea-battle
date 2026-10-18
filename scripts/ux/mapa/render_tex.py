# Render por software con textura para las láminas del mapa: la misma luz que el juego (la del modelo de D40 en
# UX_RENDERER: hemisférica + sol + especular GGX de MeshStandardMaterial) y, además, el atlas multiplicado por COLOR_0,
# como hace three.js con `map` y `vertexColors`. Con la cámara ortográfica, la interpolación afín de las UV es exacta.
# Islas y estáticos van con normales de cara (flatShading, ASSET-SPEC §6); los barcos, con las suyas. No corre en la CI.
import math, os, sys, importlib.util
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'laminas'))
import rutas as RT
import numpy as np

_spec = importlib.util.spec_from_file_location('model', RT.need(RT.RENDERER, 'el renderizador por software'))
M = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(M)


def srgb2lin(a):
    a = a / 255.0; return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def face_normals(P):
    T = P.reshape(-1, 3, 3); n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    return np.repeat(n, 3, axis=0)


def render(P, UV, C, atlas_lin, ppm, W, H, ox, oy, th_deg, SS=3, N=None, heading_deg=0.0):
    """P, UV, C: vértices por triángulo (3·T). atlas_lin: textura en lineal (h, w, 3). Devuelve (rgb sRGB [0,1], cobertura)."""
    TH = math.radians(th_deg)
    P = np.asarray(P, float); UV = np.asarray(UV, float); C = np.asarray(C, float)
    N = face_normals(P) if N is None else np.asarray(N, float)
    ps = math.radians(heading_deg); c, s = math.cos(ps), math.sin(ps)
    Ry = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    Pw = P @ Ry.T; Nw = N @ Ry.T
    sx = (Pw[:, 0] * ppm + ox) * SS
    sy = (-(Pw[:, 1] * math.cos(TH) - Pw[:, 2] * math.sin(TH)) * ppm + oy) * SS
    dep = -(Pw[:, 1] * math.sin(TH) + Pw[:, 2] * math.cos(TH))
    WS, HS = W * SS, H * SS
    zbuf = np.full((HS, WS), np.inf); col = np.zeros((HS, WS, 3)); cov = np.zeros((HS, WS), bool)
    ah, aw = atlas_lin.shape[:2]
    V = np.array([0.0, math.sin(TH), math.cos(TH)])
    for t in range(len(P) // 3):
        i = 3 * t
        x0, x1, x2 = sx[i:i + 3]; y0, y1, y2 = sy[i:i + 3]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9: continue
        bx0 = max(int(math.floor(min(x0, x1, x2))), 0); bx1 = min(int(math.ceil(max(x0, x1, x2))), WS - 1)
        by0 = max(int(math.floor(min(y0, y1, y2))), 0); by1 = min(int(math.ceil(max(y0, y1, y2))), HS - 1)
        if bx1 < bx0 or by1 < by0: continue
        X, Y = np.meshgrid(np.arange(bx0, bx1 + 1) + 0.5, np.arange(by0, by1 + 1) + 0.5)
        w0 = ((x1 - X) * (y2 - Y) - (x2 - X) * (y1 - Y)) / area
        w1 = ((x2 - X) * (y0 - Y) - (x0 - X) * (y2 - Y)) / area
        w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any(): continue
        d = w0 * dep[i] + w1 * dep[i + 1] + w2 * dep[i + 2]
        zb = zbuf[by0:by1 + 1, bx0:bx1 + 1]
        upd = inside & (d < zb)
        if not upd.any(): continue
        n = w0[..., None] * Nw[i] + w1[..., None] * Nw[i + 1] + w2[..., None] * Nw[i + 2]
        n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-12
        if area > 0: n = -n  # DoubleSide: three invierte la normal de la cara trasera
        # textura: UV interpolada (exacta en ortográfica) y muestreo bilineal
        u = w0 * UV[i, 0] + w1 * UV[i + 1, 0] + w2 * UV[i + 2, 0]
        v = w0 * UV[i, 1] + w1 * UV[i + 1, 1] + w2 * UV[i + 2, 1]
        fx = np.clip(u * aw - 0.5, 0, aw - 1.001); fy = np.clip((1 - v) * ah - 0.5, 0, ah - 1.001)
        ix, iy = fx.astype(int), fy.astype(int); ax, ay = (fx - ix)[..., None], (fy - iy)[..., None]
        tex = (atlas_lin[iy, ix] * (1 - ax) * (1 - ay) + atlas_lin[iy, ix + 1] * ax * (1 - ay)
               + atlas_lin[iy + 1, ix] * (1 - ax) * ay + atlas_lin[iy + 1, ix + 1] * ax * ay)
        alb = tex * (w0[..., None] * C[i] + w1[..., None] * C[i + 1] + w2[..., None] * C[i + 2])
        hemi = M.GROUND + (M.SKY - M.GROUND) * (0.5 * n[..., 1:2] + 0.5)
        ndl = np.clip(n @ M.LD, 0, None)[..., None]
        rgb = alb / math.pi * (M.IH * hemi + M.IS * M.SUN * ndl)
        if M.GGX:
            Hh = M.LD + V; Hh /= np.linalg.norm(Hh)
            nv = np.clip(n @ V, 1e-4, 1)[..., None]; nl = np.clip(n @ M.LD, 0, 1)[..., None]; nh = np.clip(n @ Hh, 0, 1)[..., None]
            vh = max(float(V @ Hh), 0.0); a2 = (0.85 ** 2) ** 2
            D = a2 / (math.pi * (nh * nh * (a2 - 1) + 1) ** 2)
            Vis = 0.5 / (nl * np.sqrt(a2 + (1 - a2) * nv * nv) + nv * np.sqrt(a2 + (1 - a2) * nl * nl) + 1e-6)
            F = 0.04 + 0.96 * (1 - vh) ** 5
            rgb = rgb + M.IS * M.SUN * nl * F * Vis * D
        zb[upd] = d[upd]
        col[by0:by1 + 1, bx0:bx1 + 1][upd] = M.lin2srgb(rgb[upd])
        cov[by0:by1 + 1, bx0:bx1 + 1][upd] = True
    covp = cov.reshape(H, SS, W, SS).mean((1, 3))
    colp = (col * cov[..., None]).reshape(H, SS, W, SS, 3).sum((1, 3)) / (SS * SS)
    return colp, covp


def clip_below_water(P, UV, C, N=None):
    """Recorta los triángulos por y = 0: el océano es opaco y tapa lo sumergido."""
    P = np.asarray(P, float); UV = np.asarray(UV, float); C = np.asarray(C, float); N = None if N is None else np.asarray(N, float)
    op, ou, oc, on = [], [], [], []
    for t in range(len(P) // 3):
        idx = [3 * t + k for k in range(3)]
        if all(P[k, 1] >= 0 for k in idx):
            op += [P[k] for k in idx]; ou += [UV[k] for k in idx]; oc += [C[k] for k in idx]
            if N is not None: on += [N[k] for k in idx]
            continue
        poly = [(P[k], UV[k], C[k], None if N is None else N[k]) for k in idx]
        res = []
        for k in range(3):
            a, b = poly[k], poly[(k + 1) % 3]
            if a[0][1] >= 0: res.append(a)
            if (a[0][1] >= 0) != (b[0][1] >= 0):
                s = a[0][1] / (a[0][1] - b[0][1])
                res.append(tuple(None if x is None else x + s * (y - x) for x, y in zip(a, b)))
        for k in range(1, len(res) - 1):
            for v in (res[0], res[k], res[k + 1]):
                op.append(v[0]); ou.append(v[1]); oc.append(v[2])
                if N is not None: on.append(v[3])
    return np.array(op), np.array(ou), np.array(oc), (None if N is None else np.array(on))

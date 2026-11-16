# Uso (desde la raíz del repo), tras navio_curvo.py (la misma UX_OUT): python3 -I scripts/ux/barcos/sockets_curvo.py
#   →  $UX_OUT/cadena/navio_{gb,es}-sockets.json: los sockets (ASSET-SPEC §3) y los extras (§4) de los 2 Navíos de la
#      receta de D91, que lee blender_curvo.py export; y en la salida, las comprobaciones AS-V03…V07 y AS-V17
# Los Navíos de D91 los aprobó Jonattan con la receta (2026-10-18) y van a dev-render como GLB (§13). La lámina se hizo sin
# sockets; aquí salen del casco curvo y no del procedural:
#   - cañones: la z de navio-rig.json (el juego), a la altura de la porta pintada (la franja de navio.BANDS más el arrufo,
#     como navio_curvo.paint) y a 0,30 m por fuera del costado curvo (x_at), mirando hacia fuera;
#   - fuego: la fórmula de §3 movida al punto de cubierta más cercano cuya elipse de AS-V17 pisa ≤ 1 % de algo que sobresalga
#     > 0,5 m (castillos, botes, timón, campana, carronadas, faroles); mástiles, velas y jarcia no cuentan (el aparejo de
#     navio-rig.json, el emblema de las velas y los cabos oscuros de navio_curvo.details);
#   - humo: la fórmula, y por encima de lo que haya debajo (+ 0,3 m); etiqueta, estela y proa: las de navio-rig.json.
# Ligero (segundos, un núcleo). No corre en la CI.
import json, math, os, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'laminas')): sys.path.insert(0, p)
import rutas as RT
import numpy as np
import curvo as CV
import navio as NV
import navio_curvo as NCV

STEP = 0.05                      # rejilla en planta (m)
X0, Z0, NX, NZ = -6.5, -22.5, 260, 900
SID = {'gb': 'ship_line_gb', 'es': 'ship_line_es'}


def raster_max(P):
    """Altura máxima en planta de los triángulos P (n, 3, 3), por celda de STEP m; −inf donde no hay nada."""
    Hm = np.full((NZ, NX), -np.inf)
    gx = X0 + STEP * (np.arange(NX) + 0.5); gz = Z0 + STEP * (np.arange(NZ) + 0.5)
    for a, b, c in P:
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = a, b, c
        det = (bx - ax) * (cz - az) - (cx - ax) * (bz - az)
        if abs(det) < 1e-9: continue  # vertical: su borde lo cubren las caras vecinas
        j0, j1 = np.searchsorted(gx, min(ax, bx, cx)), np.searchsorted(gx, max(ax, bx, cx))
        i0, i1 = np.searchsorted(gz, min(az, bz, cz)), np.searchsorted(gz, max(az, bz, cz))
        if j1 <= j0 or i1 <= i0: continue
        X, Z = np.meshgrid(gx[j0:j1], gz[i0:i1])
        l1 = ((X - ax) * (cz - az) - (cx - ax) * (Z - az)) / det; l2 = ((bx - ax) * (Z - az) - (X - ax) * (bz - az)) / det; l0 = 1 - l1 - l2
        ins = (l0 >= -1e-9) & (l1 >= -1e-9) & (l2 >= -1e-9)
        if not ins.any(): continue
        Y = l0 * ay + l1 * by + l2 * cy; blk = Hm[i0:i1, j0:j1]
        blk[ins] = np.maximum(blk[ins], Y[ins])
    return Hm


def cell(x, z): return int(math.floor((z - Z0) / STEP)), int(math.floor((x - X0) / STEP))


def ellipse_offsets():
    az, ax = 0.06 * NCV.L, 0.15 * NCV.B; n = int(math.ceil(az / STEP)) + 1
    di, dj = np.meshgrid(np.arange(-n, n + 1), np.arange(-n, n + 1), indexing='ij')
    keep = (dj * STEP / ax) ** 2 + (di * STEP / az) ** 2 <= 1
    return di[keep], dj[keep]


def overlap(Hm, i, j, surf, off):
    ii, jj = i + off[0], j + off[1]; ok = (ii >= 0) & (ii < NZ) & (jj >= 0) & (jj < NX)
    h = np.full(len(ii), -np.inf); h[ok] = Hm[ii[ok], jj[ok]]
    return float((h > surf + 0.5).mean())


def deck_mesh(fam):
    """LOD0 sin el aparejo (mástiles, vergas, velas, bauprés), sin el emblema de las velas y sin los cabos oscuros."""
    rig0, emb0 = NCV.rig, NV.emblem
    NCV.rig = lambda m, lod: None; NV.emblem = lambda m, fam, lod: None
    try: m, H = NCV.build(fam, 0)
    finally: NCV.rig, NV.emblem = rig0, emb0
    P = np.array(m.p, float).reshape(-1, 3, 3); C = np.array(m.c, float).reshape(-1, 3, 3)[:, 0]; Rm = np.array(m.r, float).reshape(-1, 3)[:, 0]
    dark = CV.hexlin('#2A2018'); keep = np.abs(C - dark).max(1) > 1e-6
    return P[keep], Rm[keep], H


def deck_only(P, Rm):
    """Las cubiertas: triángulos del casco (_RIM_MASK = 1) casi horizontales y de cara arriba."""
    n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    return P[(Rm > 0.5) & (np.abs(n[:, 1]) > 0.97)]


def place_fire(Hm, Dm, target, region, off):
    """El punto de cubierta más cercano a target con la elipse casi limpia (solape ≤ 1 %, como la Cañonera de §8.4), o el de
    menos solape si no hay ninguno."""
    (xa, xb), (za, zb) = region; best = None
    for x in np.arange(xa, xb + 1e-9, 0.1):
        for z in np.arange(za, zb + 1e-9, 0.1):
            i, j = cell(x, z); h, d = Hm[i, j], Dm[i, j]
            if not np.isfinite(d) or h - d > 0.05: continue  # el centro, en una cubierta y no sobre un objeto
            ring = Hm[max(i - 6, 0):i + 7, max(j - 6, 0):j + 7]
            if ring.max() - ring.min() > 0.12: continue  # y en llano (0,3 m alrededor)
            ov = overlap(Hm, i, j, h, off); dist = math.hypot(x - target[0], z - target[1])
            key = (ov > 0.01, dist if ov <= 0.01 else ov, dist)  # el más cercano con solape ≤ 1 %; si no hay, el de menos solape
            if best is None or key < best[0]: best = (key, (round(float(x), 2), round(float(h) + 0.3, 3), round(float(z), 2)), ov, dist)
    return best[1], best[2], best[3]


def sockets(fam, rig):
    P, Rm, H = deck_mesh(fam); Hm = raster_max(P); Dm = raster_max(deck_only(P, Rm)); off = ellipse_offsets()
    L, B = NCV.L, NCV.B; out, info = [], {}
    low = set(NV.BANDS[0][2])
    for side, key in ((1, 'port'), (-1, 'stbd')):
        zs = sorted(p[2] for p in rig['sockets'][key])
        for k, z in enumerate(zs):
            vb, vt, _ = NV.BANDS[0] if z in low else NV.BANDS[1]
            y = (vb + vt) / 2 + H.sheer(z); x = H.x_at(z, y) + 0.30
            out.append([f'socket_cannon_{key}_{k + 1:02d}', [round(side * x, 3), round(y, 3), z], side * math.pi / 2])
    # fuego (§3: fórmula, y AS-V17)
    yd = lambda z: H.y0(z) + H.deck_h(z)
    formula = [(0.2 * B, 0.25 * L), (-0.2 * B, 0.0), (0.0, -0.30 * L)]
    regions = [((0.3, 3.6), (0.25 * L - 6, 0.25 * L + 6)), ((-3.6, -0.3), (-6.0, 6.0)), ((-3.0, 3.0), (-0.30 * L - 6, -0.30 * L + 6))]
    for k, (t, reg) in enumerate(zip(formula, regions)):
        i, j = cell(*t); ov0 = overlap(Hm, i, j, yd(t[1]), off)
        p, ov, dist = place_fire(Hm, Dm, t, reg, off)
        out.append([f'socket_fire_{k + 1:02d}', list(p), 0.0])
        info[f'socket_fire_{k + 1:02d}'] = dict(formula=[round(t[0], 2), round(yd(t[1]) + 0.3, 3), round(t[1], 2)], solape_formula=round(ov0, 4),
                                                solape=round(ov, 4), movido_m=round(dist, 2))
    zs_ = -0.15 * L; i, j = cell(0.0, zs_); ys = max(yd(zs_) + 0.5, float(Hm[i, j]) + 0.3)
    out.append(['socket_smoke', [0.0, round(ys, 3), round(zs_, 2)], 0.0])
    for name in ('label', 'wake', 'bow'): out.append([f'socket_{name}', [float(v) for v in rig['sockets'][name]], 0.0])
    return out, info


def checks(fam, socks, ex):
    z = np.load(RT.need(os.path.join(NCV.OUT, f'navio_{fam}_lod0.npz'), f'navio_{fam}_lod0.npz (navio_curvo.py)'))
    p, r = z['p'], z['r']; hull = p[r > 0.5]; S = {n: np.array(q) for n, q, _ in socks}
    res = {}
    res['AS-V03 eslora del casco'] = [round(float(np.ptp(hull[:, 2])), 3), round(float(np.ptp(hull[:, 2]) / ex['sb_length'] - 1), 4)]
    res['AS-V03 manga del casco'] = [round(float(np.ptp(hull[:, 0])), 3), round(float(np.ptp(hull[:, 0]) / ex['sb_beam'] - 1), 4)]
    res['AS-V04'] = bool(S['socket_bow'][2] > 0 > S['socket_wake'][2] and p[:, 2].max() > abs(p[:, 2].min()))
    res['AS-V05 min y'] = round(float(p[:, 1].min()), 3)
    res['AS-V05 centro del casco'] = [round(float((hull[:, 0].max() + hull[:, 0].min()) / 2), 3), round(float((hull[:, 2].max() + hull[:, 2].min()) / 2), 3)]
    for key, sgn in (('port', 1), ('stbd', -1)):
        zs = [S[f'socket_cannon_{key}_{k:02d}'][2] for k in range(1, ex['sb_cannons_per_side'] + 1)]
        xs = [S[f'socket_cannon_{key}_{k:02d}'][0] for k in range(1, ex['sb_cannons_per_side'] + 1)]
        res[f'AS-V06 {key}'] = bool(zs == sorted(zs) and all(sgn * x > 0 for x in xs))
    res['AS-V06 resto'] = all(n in S for n in ('socket_smoke', 'socket_fire_01', 'socket_fire_02', 'socket_fire_03', 'socket_label', 'socket_wake', 'socket_bow'))
    return res


if __name__ == '__main__':
    rig = json.load(open(RT.need(NCV.RIG, 'navio-rig.json (ver la cabecera de navio.py)')))
    for fam in ('gb', 'es'):
        ex = dict(rig['extras']); ex['sb_id'] = SID[fam]; ex['sb_family'] = fam
        socks, info = sockets(fam, rig)
        proc = {}
        for key in ('port', 'stbd'):
            for k, q in enumerate(sorted(rig['sockets'][key], key=lambda v: v[2])): proc[f'socket_cannon_{key}_{k + 1:02d}'] = q
        for k, q in enumerate(rig['sockets']['fire']): proc[f'socket_fire_{k + 1:02d}'] = q
        for n in ('smoke', 'label', 'wake', 'bow'): proc[f'socket_{n}'] = rig['sockets'][n]
        d13 = {n: round(float(np.linalg.norm(np.array(q) - np.array(proc[n]))), 3) for n, q, _ in socks}
        res = checks(fam, socks, ex)
        doc = dict(id=f'navio_{fam}', extras=ex, sockets=socks, fuego=info, distancia_al_procedural=d13, comprobaciones=res)
        json.dump(doc, open(os.path.join(NCV.OUT, f'navio_{fam}-sockets.json'), 'w'), indent=1, ensure_ascii=False)
        print(fam, json.dumps(dict(fuego=info, comprobaciones=res, distancia_max_al_procedural=max(d13.items(), key=lambda kv: kv[1])), ensure_ascii=False))

# Uso (desde la raíz del repo), tras capitan_curvo.py y con $UX_OUT/cadena/captain-rig.json (el Capitán de hoy con sus
# sockets: code/export-rig-npc.ts captain, ver la cabecera de ad28_canonera2.py):
#   python3 -I scripts/ux/barcos/sockets_capitan.py  →  $UX_OUT/cadena/capitan-sockets.json: los sockets (ASSET-SPEC §3) y los
#   extras (§4) del Capitán de la receta (D91; aprobado por Jonattan el 2026-10-19), que lee blender_curvo.py capitan export;
#   y en la salida, las comprobaciones AS-V03…V07, AS-V17 y la de D45 (el mascarón no va en LOD1)
# Las reglas son las de los Navíos y la Cañonera (sockets_curvo.py, sockets_canonera2.py; ASSET-SPEC §13), con una
# diferencia en los cañones: el Capitán conserva los cañones del generador del juego (capitan_curvo.rig), así que
# su socket es el del procedural, en la boca de ese mismo cañón, siempre que quede por fuera del costado curvo:
#   - cañones: los de captain-rig.json, numerados con z creciente y mirando hacia fuera; se comprueba que cada uno quede
#     ≥ 0,05 m por fuera del costado curvo (x_at) a su altura;
#   - fuego: la fórmula de §3 movida al punto de cubierta más cercano cuya elipse de AS-V17 (0,06·L × 0,15·B) pisa ≤ 1 % de
#     algo que sobresalga > 0,5 m (cofre, timón, bitácora, faroles, barriles, cajas, alcázar); palos, velas, vergas, cofas,
#     estandarte y obenques no cuentan;
#   - humo: socket_smoke en la z de la fórmula (−0,15·L), a 0,5 m sobre la cubierta y a 0,3 m sobre lo que haya debajo; el
#     Capitán no lleva socket_smoke_02 (solo la Cañonera, D25);
#   - etiqueta, estela y proa: las del procedural, porque el aparejo y L no cambian; extras: los del procedural.
# Ligero (segundos, un núcleo). No corre en la CI.
import json, math, os, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'laminas')): sys.path.insert(0, p)
import rutas as RT
import numpy as np
import curvo as CV
import sockets_curvo as SC
import capitan_curvo as CP

SID = 'npc_pirate_captain'


def ellipse_offsets(L, B):
    az, ax = 0.06 * L, 0.15 * B; n = int(math.ceil(az / SC.STEP)) + 1
    di, dj = np.meshgrid(np.arange(-n, n + 1), np.arange(-n, n + 1), indexing='ij')
    keep = (dj * SC.STEP / ax) ** 2 + (di * SC.STEP / az) ** 2 <= 1
    return di[keep], dj[keep]


def deck_mesh():
    """LOD0 sin lo que viene del generador (palos, vergas, cofas, velas, estandarte, cañones) y sin los obenques."""
    rig0 = CP.rig; CP.rig = lambda m, lod: None
    try: m, H = CP.build(0)
    finally: CP.rig = rig0
    P = np.array(m.p, float).reshape(-1, 3, 3); C = np.array(m.c, float).reshape(-1, 3, 3)[:, 0]; Rm = np.array(m.r, float).reshape(-1, 3)[:, 0]
    keep = np.abs(C - CV.hexlin(CP.PAL['dark'])).max(1) > 1e-6
    return P[keep], Rm[keep], H


def sockets(rig):
    P, Rm, H = deck_mesh(); Hm = SC.raster_max(P); Dm = SC.raster_max(SC.deck_only(P, Rm)); L, B = CP.L, CP.B; off = ellipse_offsets(L, B)
    out, info = [], {'fuera_del_costado_m': {}}
    for side, key in ((1, 'port'), (-1, 'stbd')):
        for k, q in enumerate(sorted(rig['sockets'][key], key=lambda v: v[2])):
            name = f'socket_cannon_{key}_{k + 1:02d}'; x, y, z = q
            info['fuera_del_costado_m'][name] = round(side * x - H.x_at(z, y), 3)
            out.append([name, [round(x, 3), round(y, 3), round(z, 3)], side * math.pi / 2])
    yd = lambda z: H.y0(z) + H.deck_h(z)
    formula = [(0.2 * B, 0.25 * L), (-0.2 * B, 0.0), (0.0, -0.30 * L)]
    xr = round(0.32 * B, 1)  # 2,6 m: como los 3,6 m del Navío con B 11,2 y los 3,2 de la Cañonera con B 10
    regions = [((0.3, xr), (0.25 * L - 6, 0.25 * L + 6)), ((-xr, -0.3), (-6.0, 6.0)), ((-xr, xr), (-0.30 * L - 6, -0.30 * L + 6))]
    for k, (t, reg) in enumerate(zip(formula, regions)):
        i, j = SC.cell(*t); ov0 = SC.overlap(Hm, i, j, yd(t[1]), off)
        p, ov, dist = SC.place_fire(Hm, Dm, t, reg, off)
        out.append([f'socket_fire_{k + 1:02d}', list(p), 0.0])
        info[f'socket_fire_{k + 1:02d}'] = dict(formula=[round(t[0], 2), round(yd(t[1]) + 0.3, 3), round(t[1], 2)], solape_formula=round(ov0, 4),
                                                solape=round(ov, 4), movido_m=round(dist, 2))
    zz = -0.15 * L; i, j = SC.cell(0.0, zz); ys = max(yd(zz) + 0.5, float(Hm[i, j]) + 0.3)
    out.append(['socket_smoke', [0.0, round(ys, 3), round(zz, 2)], 0.0])
    for name in ('label', 'wake', 'bow'): out.append([f'socket_{name}', [float(v) for v in rig['sockets'][name]], 0.0])
    return out, info


def checks(socks, ex, info):
    z = np.load(RT.need(os.path.join(CP.OUT, 'capitan_lod0.npz'), 'capitan_lod0.npz (capitan_curvo.py)')); p, r = z['p'], z['r']; hull = p[r > 0.5]
    S = {n: np.array(q) for n, q, _ in socks}; res = {}
    res['AS-V03 eslora del casco'] = [round(float(np.ptp(hull[:, 2])), 3), round(float(np.ptp(hull[:, 2]) / ex['sb_length'] - 1), 4)]
    res['AS-V03 manga del casco'] = [round(float(np.ptp(hull[:, 0])), 3), round(float(np.ptp(hull[:, 0]) / ex['sb_beam'] - 1), 4)]
    res['AS-V04'] = bool(S['socket_bow'][2] > 0 > S['socket_wake'][2] and p[:, 2].max() > abs(p[:, 2].min()))
    res['AS-V05 min y'] = round(float(p[:, 1].min()), 3)
    res['AS-V05 centro del casco'] = [round(float((hull[:, 0].max() + hull[:, 0].min()) / 2), 3), round(float((hull[:, 2].max() + hull[:, 2].min()) / 2), 3)]
    for key, sgn in (('port', 1), ('stbd', -1)):
        zs = [S[f'socket_cannon_{key}_{k:02d}'][2] for k in range(1, ex['sb_cannons_per_side'] + 1)]
        xs = [S[f'socket_cannon_{key}_{k:02d}'][0] for k in range(1, ex['sb_cannons_per_side'] + 1)]
        res[f'AS-V06 {key}'] = bool(zs == sorted(zs) and all(sgn * x > 0 for x in xs))
    res['AS-V06 resto'] = all(n in S for n in ('socket_smoke', 'socket_fire_01', 'socket_fire_02', 'socket_fire_03', 'socket_label', 'socket_wake', 'socket_bow')) and 'socket_smoke_02' not in S
    res['cañones fuera del costado (≥ 0,05 m)'] = [min(info['fuera_del_costado_m'].values()), bool(min(info['fuera_del_costado_m'].values()) >= 0.05)]
    # D45: el mascarón (el tajamar dorado y la calavera de hueso de figurehead) solo en LOD0
    bone = CV.hexlin(CP.PAL['bone'])
    for lod in (0, 1):
        c = np.load(os.path.join(CP.OUT, f'capitan_lod{lod}.npz'))['c']
        res[f'D45 calavera del mascarón, vértices en LOD{lod}'] = int((np.abs(c - bone).max(1) < 1e-6).sum())
    res['D45'] = res['D45 calavera del mascarón, vértices en LOD0'] > 0 and res['D45 calavera del mascarón, vértices en LOD1'] == 0
    return res


if __name__ == '__main__':
    rig = json.load(open(RT.need(os.path.join(CP.OUT, 'captain-rig.json'), 'captain-rig.json (code/export-rig-npc.ts captain, con sockets)')))
    assert rig.get('sockets'), 'captain-rig.json sin sockets: exportarlo con la export-rig-npc.ts que los escribe'
    socks, info = sockets(rig)
    ex = dict(rig['extras']); ex['sb_id'] = SID
    assert ex['sb_cannons_per_side'] == len(CP.CANNON_Z) == len(rig['sockets']['port'])
    proc = {}
    for key in ('port', 'stbd'):
        for k, q in enumerate(sorted(rig['sockets'][key], key=lambda v: v[2])): proc[f'socket_cannon_{key}_{k + 1:02d}'] = q
    for k, q in enumerate(rig['sockets']['fire']): proc[f'socket_fire_{k + 1:02d}'] = q
    for n in ('smoke', 'label', 'wake', 'bow'): proc[f'socket_{n}'] = rig['sockets'][n]
    d13 = {n: round(float(np.linalg.norm(np.array(q) - np.array(proc[n]))), 3) for n, q, _ in socks if proc.get(n) is not None}
    full = np.load(os.path.join(CP.OUT, 'capitan_lod0.npz'))['p']; h_max = round(float(full[:, 1].max()), 2)
    res = checks(socks, ex, info)
    doc = dict(id='capitan', extras=ex, sockets=socks, fuego=info, distancia_al_procedural=d13, h_max=h_max, comprobaciones=res)
    json.dump(doc, open(os.path.join(CP.OUT, 'capitan-sockets.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(dict(extras=ex, h_max=h_max, fuego=info, comprobaciones=res, distancia_max_al_procedural=max(d13.items(), key=lambda kv: kv[1])), ensure_ascii=False))

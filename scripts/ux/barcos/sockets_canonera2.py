# Uso (desde la raíz del repo), tras canonera2_curvo.py y con $UX_OUT/cadena/gunboat-rig.json (la Cañonera de hoy con sus
# sockets: code/export-rig-npc.ts gunboat, ver la cabecera de ad28_canonera2.py):
#   python3 -I scripts/ux/barcos/sockets_canonera2.py  →  $UX_OUT/cadena/canonera2-sockets.json: los sockets (ASSET-SPEC §3) y
#   los extras (§4) de la Cañonera de la receta (D91, 2.ª vuelta), que lee blender_curvo.py canonera2 export; y en la salida,
#   las comprobaciones AS-V03…V07 y AS-V17
# Las reglas son las de los Navíos (sockets_curvo.py; ASSET-SPEC §13, «La Cañonera de la receta»):
#   - cañones: en la boca de cada cañón de la batería sobre cubierta (canonera2_curvo.battery): x = ±(costado a la altura de
#     la cubierta + 0,2), y = cubierta + 0,45, la z de CANNON_Z, numerados con z creciente y mirando hacia fuera;
#   - fuego: la fórmula de §3 movida al punto de cubierta más cercano cuya elipse de AS-V17 (0,06·L × 0,15·B) pisa ≤ 1 % de
#     algo que sobresalga > 0,5 m (cañones, cureñas, mortero, barriles, cajas, escalones del alcázar, castillo, timón, farol);
#     palos, velas, botavaras, vergas, cabos y bandera no cuentan;
#   - humo: socket_smoke en la z de la fórmula (−0,15·L) y socket_smoke_02 (D25) en +0,20·L, a 0,5 m sobre la cubierta y a
#     0,3 m sobre lo que haya debajo;
#   - etiqueta: (0, h_max + 1,5, 0), con h_max = lo más alto del barco: aquí el pico de la vela mayor, por encima del tope del
#     palo; estela y proa: las del procedural, porque L no cambia;
#   - extras: los del procedural, con sb_mast_height = h_max y ese mismo alto en sb_pick.
# Ligero (segundos, un núcleo). No corre en la CI.
import json, math, os, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'laminas')): sys.path.insert(0, p)
import rutas as RT
import numpy as np
import sockets_curvo as SC
import canonera2_curvo as C2

SID = 'npc_pirate_gunboat'


def ellipse_offsets(L, B):
    az, ax = 0.06 * L, 0.15 * B; n = int(math.ceil(az / SC.STEP)) + 1
    di, dj = np.meshgrid(np.arange(-n, n + 1), np.arange(-n, n + 1), indexing='ij')
    keep = (dj * SC.STEP / ax) ** 2 + (di * SC.STEP / az) ** 2 <= 1
    return di[keep], dj[keep]


def deck_mesh():
    """LOD0 sin el aparejo (palos, velas, foque, bauprés, botavaras, vergas, cabos y bandera)."""
    rig0 = C2.rigging; C2.rigging = lambda m, H, lod: None
    try: m, H = C2.build(0)
    finally: C2.rigging = rig0
    return np.array(m.p, float).reshape(-1, 3, 3), np.array(m.r, float).reshape(-1, 3)[:, 0], H


def sockets(rig):
    P, Rm, H = deck_mesh(); Hm = SC.raster_max(P); Dm = SC.raster_max(SC.deck_only(P, Rm)); L, B = C2.L, C2.B; off = ellipse_offsets(L, B)
    out, info = [], {}
    yd = lambda z: H.y0(z) + H.deck_h(z)
    for side, key in ((1, 'port'), (-1, 'stbd')):
        for k, z in enumerate(sorted(C2.CANNON_Z)):
            y = yd(z) + 0.45; x = H.x_at(z, yd(z)) + 0.2
            out.append([f'socket_cannon_{key}_{k + 1:02d}', [round(side * x, 3), round(y, 3), z], side * math.pi / 2])
    formula = [(0.2 * B, 0.25 * L), (-0.2 * B, 0.0), (0.0, -0.30 * L)]
    xr = round(0.32 * B, 1)  # 3,2 m: la mitad de la cubierta entre las cureñas, como los 3,6 m del Navío con B 11,2
    regions = [((0.3, xr), (0.25 * L - 6, 0.25 * L + 6)), ((-xr, -0.3), (-6.0, 6.0)), ((-3.0, 3.0), (-0.30 * L - 6, -0.30 * L + 6))]
    for k, (t, reg) in enumerate(zip(formula, regions)):
        i, j = SC.cell(*t); ov0 = SC.overlap(Hm, i, j, yd(t[1]), off)
        p, ov, dist = SC.place_fire(Hm, Dm, t, reg, off)
        out.append([f'socket_fire_{k + 1:02d}', list(p), 0.0])
        info[f'socket_fire_{k + 1:02d}'] = dict(formula=[round(t[0], 2), round(yd(t[1]) + 0.3, 3), round(t[1], 2)], solape_formula=round(ov0, 4),
                                                solape=round(ov, 4), movido_m=round(dist, 2))
    for name, zz in (('socket_smoke', -0.15 * L), ('socket_smoke_02', 0.20 * L)):
        i, j = SC.cell(0.0, zz); ys = max(yd(zz) + 0.5, float(Hm[i, j]) + 0.3)
        out.append([name, [0.0, round(ys, 3), round(zz, 2)], 0.0])
    full = np.load(RT.need(os.path.join(C2.OUT, 'canonera2_lod0.npz'), 'canonera2_lod0.npz (canonera2_curvo.py)'))['p']
    h_max = round(float(full[:, 1].max()), 2)
    out.append(['socket_label', [0.0, round(h_max + 1.5, 2), 0.0], 0.0])
    for name in ('wake', 'bow'): out.append([f'socket_{name}', [float(v) for v in rig['sockets'][name]], 0.0])
    return out, info, h_max


def checks(socks, ex):
    z = np.load(os.path.join(C2.OUT, 'canonera2_lod0.npz')); p, r = z['p'], z['r']; hull = p[r > 0.5]; S = {n: np.array(q) for n, q, _ in socks}
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
    res['AS-V06 resto'] = all(n in S for n in ('socket_smoke', 'socket_smoke_02', 'socket_fire_01', 'socket_fire_02', 'socket_fire_03', 'socket_label', 'socket_wake', 'socket_bow'))
    return res


if __name__ == '__main__':
    rig = json.load(open(RT.need(os.path.join(C2.OUT, 'gunboat-rig.json'), 'gunboat-rig.json (code/export-rig-npc.ts gunboat, con sockets)')))
    assert rig.get('sockets'), 'gunboat-rig.json sin sockets: exportarlo con la export-rig-npc.ts que los escribe'
    socks, info, h_max = sockets(rig)
    ex = dict(rig['extras']); ex['sb_id'] = SID; ex['sb_mast_height'] = h_max; ex['sb_pick'] = [ex['sb_pick'][0], h_max, ex['sb_pick'][2]]
    assert ex['sb_cannons_per_side'] == len(C2.CANNON_Z)
    proc = {}
    for key in ('port', 'stbd'):
        for k, q in enumerate(sorted(rig['sockets'][key], key=lambda v: v[2])): proc[f'socket_cannon_{key}_{k + 1:02d}'] = q
    for k, q in enumerate(rig['sockets']['fire']): proc[f'socket_fire_{k + 1:02d}'] = q
    proc['socket_smoke_02'] = rig['sockets']['smoke2']
    for n in ('smoke', 'label', 'wake', 'bow'): proc[f'socket_{n}'] = rig['sockets'][n]
    d13 = {n: round(float(np.linalg.norm(np.array(q) - np.array(proc[n]))), 3) for n, q, _ in socks if proc.get(n) is not None}
    res = checks(socks, ex)
    doc = dict(id='canonera2', extras=ex, sockets=socks, fuego=info, distancia_al_procedural=d13, comprobaciones=res)
    json.dump(doc, open(os.path.join(C2.OUT, 'canonera2-sockets.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(dict(extras=ex, fuego=info, comprobaciones=res, distancia_max_al_procedural=max(d13.items(), key=lambda kv: kv[1])), ensure_ascii=False))

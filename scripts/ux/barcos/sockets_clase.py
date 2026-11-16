# Uso (desde la raíz del repo), tras clase_curvo.py y con $UX_OUT/cadena/<clase>-rig.json (el barco de hoy del generador con
# sus sockets: code/export-rig-clases.ts <clase>):
#   python3 -I scripts/ux/barcos/sockets_clase.py [<clase> ...]   (sloop, schooner, brig o frigate; sin argumentos, las 4)
#   →  $UX_OUT/cadena/<clase>_{gb,es}-sockets.json: los sockets (ASSET-SPEC §3) y los extras (§4) de las 4 clases del jugador
#   con la receta de D91 (D95), que lee blender_curvo.py <clase>_<fam> export; y en la salida, las comprobaciones AS-V03…V06
#   y AS-V17
# Las reglas son las del Capitán (sockets_capitan.py; ASSET-SPEC §13), porque las 4 clases conservan, como él, los cañones
# del generador del juego (clase_curvo.rig):
#   - cañones: los de <clase>-rig.json, numerados con z creciente y mirando hacia fuera; se comprueba que cada uno quede
#     ≥ 0,05 m por fuera del costado curvo (x_at) a su altura;
#   - fuego: la fórmula de §3 movida al punto de cubierta más cercano cuya elipse de AS-V17 (0,06·L × 0,15·B) pisa ≤ 1 % de
#     algo que sobresalga > 0,5 m (camareta, castillos, botes, timón, cabrestante, carronadas, campana, faroles); palos,
#     velas, vergas, cofas, gallardete, cañones, la cruz de las velas y los cabos oscuros no cuentan; regiones a ±0,32·B;
#   - humo: socket_smoke en la z de la fórmula (−0,15·L), a 0,5 m sobre la cubierta y a 0,3 m sobre lo que haya debajo (sin
#     socket_smoke_02, que es solo de la Cañonera, D25);
#   - etiqueta, estela y proa: las del procedural, porque el aparejo y L no cambian; extras: los del procedural, con el sb_id
#     de la combinación (ship_<assetId>_<fam>) y sb_family.
# Ligero (segundos, un núcleo). No corre en la CI.
import json, math, os, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'laminas')): sys.path.insert(0, p)
import rutas as RT
import numpy as np
import curvo as CV
import sockets_curvo as SC
import sockets_capitan as SCP
import clase_curvo as CC

FAMS = ('gb', 'es')


def deck_mesh(cls, fam):
    """LOD0 sin lo que viene del generador (palos, vergas, cofas, velas, gallardete, cañones), sin la cruz de las velas y sin
    los cabos oscuros."""
    rig0, emb0 = CC.rig, CC.emblem
    CC.rig = lambda m, lod, cls_: None; CC.emblem = lambda m, e: None
    try: m, H = CC.build(cls, fam, 0)
    finally: CC.rig, CC.emblem = rig0, emb0
    P = np.array(m.p, float).reshape(-1, 3, 3); C = np.array(m.c, float).reshape(-1, 3, 3)[:, 0]; Rm = np.array(m.r, float).reshape(-1, 3)[:, 0]
    keep = np.abs(C - CV.hexlin('#2A2018')).max(1) > 1e-6  # los cabos oscuros de clase_curvo.details (`dark`)
    return P[keep], Rm[keep], H


def sockets(cls, fam, rig):
    c = CC.CLASES[cls]; L, B = c['L'], c['B']
    P, Rm, H = deck_mesh(cls, fam); Hm = SC.raster_max(P); Dm = SC.raster_max(SC.deck_only(P, Rm)); off = SCP.ellipse_offsets(L, B)
    out, info = [], {'fuera_del_costado_m': {}}
    for side, key in ((1, 'port'), (-1, 'stbd')):
        for k, q in enumerate(sorted(rig['sockets'][key], key=lambda v: v[2])):
            name = f'socket_cannon_{key}_{k + 1:02d}'; x, y, z = q
            info['fuera_del_costado_m'][name] = round(side * x - H.x_at(z, y), 3)
            out.append([name, [round(x, 3), round(y, 3), round(z, 3)], side * math.pi / 2])
    yd = lambda z: H.y0(z) + H.deck_h(z)
    formula = [(0.2 * B, 0.25 * L), (-0.2 * B, 0.0), (0.0, -0.30 * L)]
    xr = round(0.32 * B, 1)
    regions = [((0.3, xr), (0.25 * L - 6, 0.25 * L + 6)), ((-xr, -0.3), (-6.0, 6.0)), ((-xr, xr), (-0.30 * L - 6, -0.30 * L + 6))]
    for k, (t, reg) in enumerate(zip(formula, regions)):
        i, j = SC.cell(*t); ov0 = SC.overlap(Hm, i, j, yd(t[1]), off)
        p, ov, dist = SC.place_fire(Hm, Dm, t, reg, off)
        wide = ov > 0.05
        if wide:  # D105 (ux): sin ningún punto ≤ 5 % (AS-V17) en ±6 m, la misma regla con la z a ±8 m (la Fragata española, _01)
            (xa, xb), _ = reg; p, ov, dist = SC.place_fire(Hm, Dm, t, ((xa, xb), (t[1] - 8, t[1] + 8)), off)
        out.append([f'socket_fire_{k + 1:02d}', list(p), 0.0])
        info[f'socket_fire_{k + 1:02d}'] = dict(formula=[round(t[0], 2), round(yd(t[1]) + 0.3, 3), round(t[1], 2)], solape_formula=round(ov0, 4),
                                                solape=round(ov, 4), movido_m=round(dist, 2), region_ampliada=wide)
    zz = -0.15 * L; i, j = SC.cell(0.0, zz); ys = max(yd(zz) + 0.5, float(Hm[i, j]) + 0.3)
    out.append(['socket_smoke', [0.0, round(ys, 3), round(zz, 2)], 0.0])
    for name in ('label', 'wake', 'bow'): out.append([f'socket_{name}', [float(v) for v in rig['sockets'][name]], 0.0])
    return out, info


def checks(cls, fam, socks, ex, info):
    z = np.load(RT.need(os.path.join(CC.OUT, f'{cls}_{fam}_lod0.npz'), f'{cls}_{fam}_lod0.npz (clase_curvo.py)')); p, r = z['p'], z['r']; hull = p[r > 0.5]
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
    fuera = min(info['fuera_del_costado_m'].values())
    res['cañones fuera del costado (≥ 0,05 m)'] = [fuera, bool(fuera >= 0.05)]
    res['AS-V17 solape máximo del fuego'] = max(info[f'socket_fire_{k:02d}']['solape'] for k in (1, 2, 3))
    return res


def ok(res):
    return (abs(res['AS-V03 eslora del casco'][1]) <= 0.02 and abs(res['AS-V03 manga del casco'][1]) <= 0.02 and res['AS-V04']
            and res['AS-V06 port'] and res['AS-V06 stbd'] and res['AS-V06 resto'] and res['cañones fuera del costado (≥ 0,05 m)'][1]
            and res['AS-V17 solape máximo del fuego'] <= 0.05)  # AS-V17: ≤ 5 % del área de cada elipse (el 1 % es la meta de la búsqueda)


if __name__ == '__main__':
    bad = []
    for cls in (sys.argv[1:] or ('sloop', 'schooner', 'brig', 'frigate')):
        rig = CC.rig_json(cls)
        assert rig.get('sockets'), f'{cls}-rig.json sin sockets: exportarlo con la export-rig-clases.ts que los escribe'
        for fam in FAMS:
            socks, info = sockets(cls, fam, rig)
            ex = dict(rig['extras']); ex['sb_id'] = f"{CC.CLASES[cls]['sid']}_{fam}"; ex['sb_family'] = fam
            assert ex['sb_cannons_per_side'] == len(rig['sockets']['port']) == len(rig['sockets']['stbd'])
            proc = {}
            for key in ('port', 'stbd'):
                for k, q in enumerate(sorted(rig['sockets'][key], key=lambda v: v[2])): proc[f'socket_cannon_{key}_{k + 1:02d}'] = q
            for k, q in enumerate(rig['sockets']['fire']): proc[f'socket_fire_{k + 1:02d}'] = q
            for n in ('smoke', 'label', 'wake', 'bow'): proc[f'socket_{n}'] = rig['sockets'][n]
            d13 = {n: round(float(np.linalg.norm(np.array(q) - np.array(proc[n]))), 3) for n, q, _ in socks if proc.get(n) is not None}
            full = np.load(os.path.join(CC.OUT, f'{cls}_{fam}_lod0.npz'))['p']; h_max = round(float(full[:, 1].max()), 2)
            res = checks(cls, fam, socks, ex, info)
            doc = dict(id=f'{cls}_{fam}', extras=ex, sockets=socks, fuego=info, distancia_al_procedural=d13, h_max=h_max, comprobaciones=res)
            out = os.path.join(CC.OUT, f'{cls}_{fam}-sockets.json')
            if os.path.islink(out): os.remove(out)  # nunca se escribe a través de un enlace de otra UX_OUT
            json.dump(doc, open(out, 'w'), indent=1, ensure_ascii=False)
            print(f'{cls}_{fam}', json.dumps(dict(h_max=h_max, fuego=info, comprobaciones=res, distancia_max_al_procedural=max(d13.items(), key=lambda kv: kv[1])), ensure_ascii=False), flush=True)
            if not ok(res): bad.append(f'{cls}_{fam}')
    print('FALLOS:', bad or 'ninguno')
    sys.exit(1 if bad else 0)

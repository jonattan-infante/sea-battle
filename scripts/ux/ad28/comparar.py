# ux · AD-28 a 225° y 45° (a-v7; BACKLOG r11 c518a24 :421): el modelo frente al juego en las 5 posturas del a-v6, mancha por mancha.
#   modelo [rumbos]             → por postura y por cañón (banda y z de U6): Feret de su mancha mayor en 16 fases de subpíxel,
#                                 en cuántas cuenta (Feret ≥ 4 con rojo) y si se parte; y el total por fase (comparar-modelo.json)
#   encajar <rumbo> <k> <piezas.png> [<con.png> <region.png>] [--juego N]
#                               → la fase del juego en la postura k (1–5) del rumbo: el desplazamiento (entero + 1/8 px) que mejor casa la
#                                 máscara roja del pase de cañones del juego (R ≥ 128) con la del modelo (IoU); el recuento del
#                                 modelo en esa fase y, con la captura y la región, las manchas del juego (el algoritmo de
#                                 deckGuns: L* ≤ 25 ∧ región R ≥ 128, 8 vecinos, Feret ≥ 4, rojo ≥ 128) con el cañón de cada
#                                 una, por la huella del modelo encajada
# Uso: UX_OUT=… UX_RENDERER=… python3 -I comparar.py <scripts/ux> <orden> [args]   (un núcleo con VECLIB/OPENBLAS/OMP = 1)
import sys, os, json, math
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
cmd, args = sys.argv[2], sys.argv[3:]
sys.argv = [sys.argv[0], sys.argv[1], 'x']
import numpy as np
from PIL import Image
import balanceo as BL
C2 = BL.C2
PH16 = [(i / 4, j / 4) for i in range(4) for j in range(4)]
NOMBRE = lambda g: f'{BL.BANDA[1 if g % 2 else -1]} z {C2.CANNON_Z[g // 2]:+.1f}'


def gun_maps(mod, pose, ph, hd=225):
    """Máscara roja (cobertura de cañón ≥ 50 %, sin el mortero) y mapa de qué cañón domina cada px en el pase A."""
    r_, p_, y_ = pose
    P, UV, C, N, tg, gn = BL.pose_arrays(*mod[:3], hd, math.radians(r_), math.radians(p_), y_)
    mort, can, car = tg == BL.TI['mortero'], tg == BL.TI['canon'], tg == BL.TI['cureña']
    r = BL.raster(P, tg, hd, BL.W / 2 + ph[0], BL.H / 2 + 20 + ph[1], ~mort, np.zeros(len(tg), bool), can)
    red = BL.frac(r['iA'], can) >= 0.5
    ids = np.where(r['iC'] >= 0, gn[np.maximum(r['iC'], 0)], -1).reshape(BL.H, BL.SS, BL.W, BL.SS).transpose(0, 2, 1, 3).reshape(BL.H, BL.W, -1)
    cnt = np.stack([(ids == g).sum(-1) for g in range(12)], -1); gm = np.where(cnt.max(-1) > 0, cnt.argmax(-1), -1)
    return red, gm


def modelo(hds=(225, 45)):
    mod = BL.load(); out = []
    for hd, (k, pose) in ((h, kp) for h in hds for kp in enumerate(BL.AV6)):
        per = {g: dict(ferets=[], cuenta=0, partido=0) for g in range(12)}; tot = []
        for ph in PH16:
            q = BL.count(mod, hd, math.radians(pose[0]), math.radians(pose[1]), pose[2], ph, detail=True); tot.append(q['guns'])
            for g in range(12):
                mine = [b for b in q['manchas'] if b['canon'] and b['canones'] and b['canones'][0] == g]
                f = max([b['feret'] for b in mine], default=0.0); per[g]['ferets'].append(f)
                per[g]['cuenta'] += any(b['feret'] >= 4 for b in mine); per[g]['partido'] += len(mine) > 1
        out.append(dict(rumbo=hd, captura=k + 1, pose=pose, juego=(BL.AV6_GUNS[k] if hd == 225 else None), modelo_por_fase=tot,
                        canones={NOMBRE(g): dict(feret_min=min(v['ferets']), feret_max=max(v['ferets']), cuenta=f'{v["cuenta"]}/16', partido=f'{v["partido"]}/16') for g, v in per.items()}))
        print(f'{hd}° · captura {k + 1}/5 · alabeo {pose[0]}° cabeceo {pose[1]}° y {pose[2]} m · juego {BL.AV6_GUNS[k] if hd == 225 else "(a-v7)"} · modelo {min(tot)}–{max(tot)} por fase {tot}')
        for g in range(12):
            v = out[-1]['canones'][NOMBRE(g)]
            print(f'   {NOMBRE(g):16s} Feret {v["feret_min"]:5.2f}–{v["feret_max"]:5.2f} · cuenta en {v["cuenta"]:>5s} · partido en {v["partido"]}')
    json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'comparar-modelo.json'), 'w'), indent=1, ensure_ascii=False)


def game_blobs(con, reg, pie):
    """deckGuns (hostile-signatures.spec.ts a-v6) sobre las 3 PNG del juego: manchas con su Feret, rojo y px."""
    A_ = np.asarray(Image.open(con).convert('RGB'), float); D_ = np.asarray(Image.open(reg).convert('RGB'), float); P_ = np.asarray(Image.open(pie).convert('RGB'), float)
    L = BL.lstar(A_); dark = (D_[..., 0] >= 128) & (L <= 25)
    return [dict(px=b, feret=BL.feret(b), rojo=bool((P_[b[:, 0], b[:, 1], 0] >= 128).any())) for b in BL.comps(dark)], P_[..., 0] >= 128


def encajar(hd, k, pie, con=None, reg=None, juego=None):
    mod = BL.load(); pose = BL.AV6[k - 1]
    G = np.asarray(Image.open(pie).convert('RGB'))[..., 0] >= 128
    gy, gx = np.nonzero(G); best = None
    for i in range(8):
        for j in range(8):
            ph = (i / 8, j / 8); red, gm = gun_maps(mod, pose, ph, hd); my, mx = np.nonzero(red)
            d0 = (int(round(gy.mean() - my.mean())), int(round(gx.mean() - mx.mean())))
            for dy in range(d0[0] - 2, d0[0] + 3):
                for dx in range(d0[1] - 2, d0[1] + 3):
                    sel = (my + dy >= 0) & (my + dy < G.shape[0]) & (mx + dx >= 0) & (mx + dx < G.shape[1])
                    inter = G[my[sel] + dy, mx[sel] + dx].sum(); iou = inter / (len(my) + len(gy) - inter)
                    if best is None or iou > best[0]: best = (iou, ph, dy, dx)
    iou, ph, dy, dx = best
    q = BL.count(mod, hd, math.radians(pose[0]), math.radians(pose[1]), pose[2], ph, detail=True)
    if juego is None and hd == 225: juego = BL.AV6_GUNS[k - 1]
    print(f'{hd}° · captura {k}/5 · encaje IoU {iou:.3f} · fase {ph} · desplazamiento ({dx}, {dy}) px · modelo en esa fase {q["guns"]} · juego (log) {juego}' + (f' · diferencia {q["guns"] - juego:+d}' if juego is not None else ''))
    dist_m = len({b['canones'][0] for b in q['manchas'] if b['canon'] and b['feret'] >= 4 and b['canones']})
    print(f'   modelo en esa fase: {q["guns"]} manchas con cañón, {dist_m} cañones distintos, {q["cannons"]} con caña ≥ {BL.MIN_CANA} px')
    allq = [BL.count(mod, hd, math.radians(pose[0]), math.radians(pose[1]), pose[2], f)['guns'] for f in PH16]
    if iou < 0.8 and juego is not None: print(f'   IoU < 0,8: peor caso, máximo de las 16 fases {max(allq)} − juego {juego} = {max(allq) - juego:+d}')
    for b in sorted(q['manchas'], key=lambda b: -b['feret']):
        if b['feret'] > 0: print(f'   modelo · Feret {b["feret"]:5.2f} · {"rojo" if b["canon"] else "sin rojo"} · {", ".join(NOMBRE(g) for g in b["canones"]) or "—"}' + (f' · caña {b["cana_px"].get(b["canones"][0], 0)} px' if b['canones'] else ''))
    res = dict(rumbo=hd, captura=k, iou=round(float(iou), 4), fase=ph, desplazamiento=(dx, dy), modelo=q['guns'], modelo_canones=dist_m, modelo_canones_cana=q['cannons'], min_cana=BL.MIN_CANA, modelo_16_fases=allq, juego_log=juego, manchas_modelo=q['manchas'])
    if con and reg:
        _, gm = gun_maps(mod, pose, ph, hd); blobs, Gred = game_blobs(con, reg, pie); res['manchas_juego'] = []
        for b in sorted(blobs, key=lambda b: -b['feret']):
            if b['feret'] == 0: continue
            yy, xx = b['px'][:, 0] - dy, b['px'][:, 1] - dx; ok = (yy >= 0) & (yy < BL.H) & (xx >= 0) & (xx < BL.W)
            gs = gm[yy[ok], xx[ok]]; gs = gs[gs >= 0]; u, c = np.unique(gs, return_counts=True)
            who = [NOMBRE(int(g)) for g in u[np.argsort(-c)]]
            ri = Gred[b['px'][:, 0], b['px'][:, 1]]; ry, rx = b['px'][ri, 0] - dy, b['px'][ri, 1] - dx; okr = (ry >= 0) & (ry < BL.H) & (rx >= 0) & (rx < BL.W)
            gr = gm[ry[okr], rx[okr]]; gr = gr[gr >= 0]; ur, cr = np.unique(gr, return_counts=True)
            cana = {NOMBRE(int(g)): int(n) for g, n in zip(ur, cr)}
            if cana: who = sorted(cana, key=lambda n: -cana[n]) + [w for w in who if w not in cana]  # el mayor, por px de caña
            res['manchas_juego'].append(dict(feret=round(b['feret'], 2), rojo=b['rojo'], canones=who, cana_px=cana, centro_lienzo=[round(float(b['px'][:, 1].mean()), 1), round(float(b['px'][:, 0].mean()), 1)]))
            print(f'   juego  · Feret {b["feret"]:5.2f} · {"rojo" if b["rojo"] else "sin rojo"} · {", ".join(who) or "—"}' + (f' · caña {cana.get(who[0], 0)} px' if who else ''))
        res['juego_rehecho'] = sum(1 for b in res['manchas_juego'] if b['rojo'] and b['feret'] >= 4)
        res['juego_canones'] = len({b['canones'][0] for b in res['manchas_juego'] if b['rojo'] and b['feret'] >= 4 and b['canones']})
        res['juego_canones_cana'] = len({b['canones'][0] for b in res['manchas_juego'] if b['rojo'] and b['feret'] >= 4 and b['canones'] and b['cana_px'].get(b['canones'][0], 0) >= BL.MIN_CANA})
        print(f'   juego rehecho con las 3 PNG: {res["juego_rehecho"]} manchas con cañón, {res["juego_canones"]} cañones distintos, {res["juego_canones_cana"]} con caña ≥ {BL.MIN_CANA} px' + (f' (log: {juego} manchas)' if juego is not None else ''))
    json.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), f'comparar-encaje-{hd}-{k}' + (f'-cana{BL.MIN_CANA}' if BL.MIN_CANA else '') + '.json'), 'w'), indent=1, ensure_ascii=False, default=str)


if __name__ == '__main__':
    if cmd == 'modelo': modelo(tuple(int(x) for x in args[0].split(',')) if args else (225, 45))
    elif cmd == 'encajar':
        jg = None
        if '--juego' in args: i = args.index('--juego'); jg = int(args[i + 1]); args = args[:i] + args[i + 2:]
        encajar(int(args[0]), int(args[1]), *args[2:], juego=jg)

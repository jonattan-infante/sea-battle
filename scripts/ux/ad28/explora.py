# ux · criba rápida de variantes para AD-28 con caña ≥ 6 (MSAA 4×): por rumbo, el mínimo de cañones distintos en 100 posturas
# (alabeo × cabeceo 5 × 5 × 4 fases) y en cuántas sale; las finalistas pasan después por barrido16m.py (400 posturas).
#   criba <rumbos> <variante> [<variante>…]      p. ej. criba 225,45 pie:2.5,2.5 pie:2,2+abre:35
#   detalle <variante> <rumbo>                    las posturas en el mínimo: por cañón, px limpios y qué lo tapa
# Uso: AD28_MSAA4=1 AD28_MIN_CANA=6 python3 -I explora.py <scripts/ux> <orden> …   (un núcleo; BLAS a 1 hilo)
import sys, os, math, json
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
cmd, args = sys.argv[2], sys.argv[3:]
sys.argv = [sys.argv[0], sys.argv[1], 'x']
import numpy as np
import balanceo as BL
assert BL.MSAA4 and BL.MIN_CANA == 6, 'falta AD28_MSAA4=1 y AD28_MIN_CANA=6'
ROLLS = [-3.0, -1.5, 0.0, 1.5, 3.0]; PITCHES = [-1.5, -0.75, 0.0, 0.75, 1.5]; PH4 = [(0, 0), (0.5, 0.5), (0.25, 0.75), (0.75, 0.25)]
NOMBRE = lambda g: f'{BL.BANDA[1 if g % 2 else -1]} z {BL.C2.CANNON_Z[g // 2]:+.1f}'


def criba(hds, var):
    mod = BL.load_variant(var); out = {}
    for hd in hds:
        g = [BL.count(mod, hd, math.radians(r), math.radians(p), 0.0, f)['cannons'] for r in ROLLS for p in PITCHES for f in PH4]
        out[hd] = (min(g), max(g), g.count(min(g)))
    print(f'{var:28s} ' + ' · '.join(f'{hd}° {a}–{b} ({n} en {a})' for hd, (a, b, n) in out.items()), flush=True)
    return out


def detalle(var, hd):
    mod = BL.load_variant(var); rows = []
    for r in ROLLS:
        for p in PITCHES:
            for f in PH4:
                q = BL.count(mod, hd, math.radians(r), math.radians(p), 0.0, f, detail=True); rows.append(((r, p, f), q))
    mn = min(q['cannons'] for _, q in rows)
    for (r, p, f), q in [x for x in rows if x[1]['cannons'] == mn][:4]:
        print(f'{var} · {hd}° · alabeo {r:+.1f} cabeceo {p:+.2f} fase {f}: {q["cannons"]} cañones · px limpios por cañón {dict(sorted((NOMBRE(g), v) for g, v in q["cana_por_canon"].items()))}')
        for g, v in q['por_canon'].items():
            if q['cana_por_canon'].get(g, 0) < 6: print(f'     no cuenta {NOMBRE(g):16s} limpios {q["cana_por_canon"].get(g, 0)} · huella {v["huella_px"]} px · encima {dict(list(v["encima"].items())[:4])}')


if __name__ == '__main__':
    if cmd == 'criba':
        hds = [int(x) for x in args[0].split(',')]; res = {v: criba(hds, v) for v in args[1:]}
    elif cmd == 'detalle': detalle(args[0], int(args[1]))

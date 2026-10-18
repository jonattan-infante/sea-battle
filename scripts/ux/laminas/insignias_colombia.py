# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/insignias_colombia.py --guardar  →  $UX_OUT/_colombia.pkl
# Busca las combinaciones de B-Colombia que pasan AD-40 (tarda minutos: es una corrida pesada, pide turno). Lo lee lamina_colombia.py.
# Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS (.next/static/media de un
# build de Next) y, si se indica abajo, el renderizador por software en UX_RENDERER. Escribe en UX_OUT, nunca en
# docs/game/art/: una lámina aprobada no se pisa; una versión nueva se copia allí a mano y con otro nombre. No corre en la CI.
# B-Colombia (AC-191): Jonattan eligió la dirección B, «démosle un rediseño inspirados en las insignias de la armada
# colombiana». Hombrera vertical (la forma de la referencia): la marinería en hombrera de punta con galones rectos, y los
# oficiales en hombrera recta con galones y el lazo (el bucle del galón de los oficiales colombianos). Sin anclas ni
# estrellas, que en el juego son iconos de relación (GDD §10b). Misma métrica de AD-40 que insignias_direcciones.py.
import sys, os, itertools
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import rutas as RT
src = open(os.path.join(HERE, 'insignias_direcciones.py')).read()
g = {'__file__': os.path.join(HERE, 'insignias_direcciones.py'), '__name__': 'dirs'}
exec(compile(src[:src.index('CHOICE, RES = {}, {}')], 'insignias_direcciones.py', 'exec'), g)
globals().update({k: v for k, v in g.items() if not k.startswith('__')})
def ring(cx, cy, ro, ri): return [('circle', dict(cx=cx, cy=cy, r=ro)), ('circle', dict(cx=cx, cy=cy, r=ri, hole=True))]
def board_rect(m, solid):
    if solid: return [('rect', dict(x=2, y=0, width=8, height=12, rx=2, fill=m))]
    return [('rect', dict(x=2.5, y=0.5, width=7, height=11, rx=1.5, fill=INK, stroke=m, **{'stroke-width': 1}))]
PT_OUT = [(2, 0), (10, 0), (10, 8.4), (6, 12), (2, 8.4)]; PT_IN = [(3, 1), (9, 1), (9, 7.95), (6, 10.7), (3, 7.95)]
def board_point(m, solid):
    if solid: return [fill(P(PT_OUT), m)]
    return [fill(P(PT_OUT), m), fill(P(PT_IN), INK)]
F_RECT = ('rect', dict(x=3.5, y=1.5, width=5, height=9)); F_PT = P([(3.5, 1.5), (8.5, 1.5), (8.5, 7.7), (6, 9.9), (3.5, 7.7)])
def mk(board, field):
    def make(k, solid, marks):
        m = MET[k]; fg = INK if solid else m; fc = m if solid else INK
        out = board(m, solid)
        for t, a in marks:
            a = dict(a); hole = a.pop('hole', False); out.append((t, {**a, 'fill': fc if hole else fg}))
        return out, field, fg, fc
    return make
RECT, POINT = mk(board_rect, F_RECT), mk(board_point, F_PT)
def bars(ys, h, x0=3.5, w=5): return [R(x0, y, w, h) for y in ys]
COL_FIG = [  # (marcas, componentes) por rango; los anillos cuentan 1
    [(bars([6.0], 1.6), 1), (bars([5.0], 2.0), 1), (bars([6.0], 1.6, 3, 6), 1)],
    [(bars([3.8, 6.8], 1.5), 2), (bars([4.2, 7.0], 1.3), 2), (bars([3.8, 6.8], 1.5, 3, 6), 2)],
    [(bars([2.2, 4.8, 7.4], 1.2), 3), (bars([2.4, 5.0, 7.6], 1.1, 3, 6), 3)],
    [(ring(6, 3.8, 1.7, 0.8) + bars([6.9, 8.9], 1.2), 3), (ring(6, 3.6, 1.8, 0.85) + bars([6.6, 8.8], 1.3, 3, 6), 3), (ring(6, 4.2, 1.7, 0.8) + bars([7.6], 1.6), 2)],
    [(ring(6, 3.6, 1.7, 0.8) + bars([6.6], 3.0), 2), (ring(6, 3.6, 1.7, 0.8) + bars([6.4], 2.4) + bars([9.4], 1.0), 3), (ring(6, 3.4, 1.8, 0.85) + bars([6.4], 3.6, 3, 6), 2)]]
MAKES = [[RECT, POINT]] * 3 + [[RECT]] * 2
def search(name, makes_by_rank, FIG, only_solid_top=True):
    cands = []
    for k in range(5):
        ck = []
        for fi, (marks, want) in enumerate(FIG[k]):
            for mi, make in enumerate(makes_by_rank[k]):
                for solid in ((True,) if k == 4 and only_solid_top else (False, True)):
                    els, field, fg, fc = make(k, solid, marks); c = (els, field, fg, fc, want)
                    e2 = b2_one(c); n3, p3 = b3_one(els)
                    if e2 is None and n3 <= 0.80 and p3 >= 20: ck.append((fi, solid, c, Lmaps(els), (n3, p3), mi))
                    elif '-v' in sys.argv: print('   descartada', NAMES[k], fi, mi, solid, e2, f'{n3:.2f}', f'{p3:.0f}')
        cands.append(ck); print(f'{name} · {NAMES[k]}: {len(ck)} variantes pasan b2 y b3', flush=True)
    if not all(cands): return None
    best = None
    for combo in itertools.product(*cands):
        w = min(pair(combo[i][3], combo[j][3]) for i, j in itertools.combinations(range(5), 2))
        if best is None or w > best[0]: best = (w, combo)
    w, combo = best
    prs = {(i, j): pair(combo[i][3], combo[j][3]) for i, j in itertools.combinations(range(5), 2)}
    print('  elegida: ' + ' · '.join(f'{NAMES[k][:4]} fig{c[0]} {"llena" if c[1] else "hueca"} {"punta" if (c[5] == 1 and k < 3) else "recta"}' for k, c in enumerate(combo)) + f' → peor par {w:.0f} px')
    print('   pares:', ' · '.join(f'{NAMES[i][:4]}–{NAMES[j][:4]} {v:.0f}' for (i, j), v in prs.items()), f'· b3 NCC {max(c[4][0] for c in combo):.2f}, {min(c[4][1] for c in combo):.0f} px')
    return best, prs
if __name__ == '__main__':
    res = search('B-Colombia', MAKES, COL_FIG)
    import pickle; pickle.dump(res, open(os.path.join(RT.OUT, '_colombia.pkl'), 'wb'))

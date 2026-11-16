# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/insignias_v.py  →  $UX_OUT/_insignias_v.pkl
# Busca las combinaciones de «B-Galones en V» que pasan AD-40 (tarda minutos: es una corrida pesada, pide turno). Lo lee
# lamina_insignias_v.py. Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS.
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
# AC-191, 3.ª vuelta: Jonattan pidió cambios a B-Colombia, «se ven muy redondos y de poca calidad. Quiero esto», con una
# referencia (fuera del repo, por derechos): la tabla de insignias del Ejército de EE. UU. de la II Guerra Mundial. Se
# toma la dirección, no el dibujo: galones en V con la punta arriba para la marinería (1, 2 y 3, o 2 y una barra), barras de
# metal para el Teniente y una rosa de puntas para el Almirante; todo en ángulos, con el parche de esquinas cortadas en
# lugar de redondeadas. Sin águilas, escudos nacionales, anclas ni estrellas (las dos últimas son iconos del juego,
# GDD §10b). Misma métrica de AD-40 que insignias_direcciones.py y la misma búsqueda que insignias_colombia.py.
import sys, os, math, pickle
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import rutas as RT
ARGV = list(sys.argv)  # insignias_direcciones.py cambia sys.argv para insignias5.py; -v se recupera después
src = open(os.path.join(HERE, 'insignias_direcciones.py')).read()
g = {'__file__': os.path.join(HERE, 'insignias_direcciones.py'), '__name__': 'dirs'}
exec(compile(src[:src.index('CHOICE, RES = {}, {}')], 'insignias_direcciones.py', 'exec'), g)
globals().update({k: v for k, v in g.items() if not k.startswith('__')})
sys.argv = ARGV
src_c = open(os.path.join(HERE, 'insignias_colombia.py')).read()
exec(compile(src_c[src_c.index('def search('):src_c.index("if __name__ == '__main__':")], 'insignias_colombia.py', 'exec'), globals())


def chamfer(x0, y0, x1, y1, c):
    """Cuadrado de esquinas cortadas a 45° (corte c): el parche, en ángulos en vez del radio de D74 y B-Colombia."""
    return [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]


def patch(c):
    ci = round(c - (math.sqrt(2) - 1), 3)  # el borde interior a 1 de distancia también en el corte
    out, inn, fld = P(chamfer(0, 0, 12, 12, c)), P(chamfer(1, 1, 11, 11, ci)), P(chamfer(1.5, 1.5, 10.5, 10.5, max(ci - 0.2, 0)))
    def make(k, solid, marks):
        m = MET[k]; fg = INK if solid else m
        return [fill(out, m), fill(inn, m if solid else INK)] + [fill(e, fg) for e in marks], fld, fg, (m if solid else INK)
    return make


def chev(y, t=1.4, h=2.4, x0=2.6, x1=9.4): return chevron(y, x0, x1, t, h)  # punta arriba


def rose(n, R, r_, ri, cx=6, cy=6):
    """Rosa de n puntas largas (R) con n puntas cortas (r_) entre ellas y la cintura ri: 4n vértices."""
    pts = []
    for i in range(4 * n):
        a = math.radians(-90 + 90 / n * i); rr = (R, ri, r_, ri)[i % 4]
        pts.append((round(cx + rr * math.cos(a), 3), round(cy + rr * math.sin(a), 3)))
    return P(pts)


V_FIG = [  # (marcas, componentes) por rango
    [([chev(4.4, 1.6, 2.6)], 1), ([chev(4.0, 2.0, 2.8, 2.4, 9.6)], 1)],
    [([chev(2.8), chev(6.2)], 2), ([chev(3.0, 1.2, 2.2), chev(6.0, 1.2, 2.2)], 2)],
    # Contramaestre: en el I1, 2 galones + 1 invertido y 3 galones a paso 2,8 no pasaron b2 a DPR 1 en ninguna variante
    # (huecas: las 3 marcas se unen en 1; llenas: se parten en 5 u 8). Ahora: galones más planos a paso 3,0 (el de los
    # Marineros que pasan), o 2 galones y una barra recta debajo, separada ≥ 1,6 del galón
    [([chev(1.4, 1.2, 1.4, 2.4, 9.6), chev(4.4, 1.2, 1.4, 2.4, 9.6), chev(7.4, 1.2, 1.4, 2.4, 9.6)], 3),
     ([chev(1.6, 1.0, 1.0, 2.4, 9.6), chev(4.6, 1.0, 1.0, 2.4, 9.6), chev(7.6, 1.0, 1.0, 2.4, 9.6)], 3),
     ([chev(1.6, 1.2, 1.6), chev(4.6, 1.2, 1.6), R(3, 8.8, 6, 1.4)], 3),
     ([chev(1.6, 1.2, 1.6), chev(4.6, 1.2, 1.6), R(3.8, 8.8, 4.4, 1.4)], 3)],
    [([R(3.6, 2.4, 1.6, 7.2), R(6.8, 2.4, 1.6, 7.2)], 2), ([R(4.9, 2.2, 2.2, 7.6)], 1)],
    [([ROSE], 1), ([rose(4, 4.6, 3.0, 1.3)], 1), ([rose(4, 4.8, 2.6, 1.1)], 1)]]
V_TXT = [['un galón', 'un galón ancho'], ['dos galones', 'dos galones finos'],
         ['tres galones', 'tres galones finos', 'dos galones y una barra', 'dos galones y una barra corta'],
         ['dos barras', 'una barra'], ['una rosa de 4 puntas', 'una rosa de 8 puntas', 'una rosa de 8 puntas fina']]
MAKES_V = [[patch(1.8), patch(2.6)]] * 5


def partial(name, makes_by_rank, FIG):
    """Si search() no da combinación (algún rango sin variantes), el mejor peor par entre los rangos que sí tienen."""
    cands = []
    for k in range(5):
        ck = []
        for fi, (marks, want) in enumerate(FIG[k]):
            for mi, make in enumerate(makes_by_rank[k]):
                for solid in ((True,) if k == 4 else (False, True)):
                    c = make(k, solid, marks) + (want,); n3, p3 = b3_one(c[0])
                    if b2_one(c) is None and n3 <= 0.80 and p3 >= 20: ck.append((fi, solid, Lmaps(c[0]), mi))
        cands.append(ck)
    live = [k for k in range(5) if cands[k]]
    best = None
    for cb in itertools.product(*(cands[k] for k in live)):
        w = min((pair(a[2], b[2]) for a, b in itertools.combinations(cb, 2)), default=0)
        if best is None or w > best[0]: best = (w, cb)
    w, combo = best
    prs = {(live[i], live[j]): pair(combo[i][2], combo[j][2]) for i, j in itertools.combinations(range(len(live)), 2)}
    print(f'{name} · parcial, sin ' + ', '.join(NAMES[k] for k in range(5) if k not in live) + ': '
          + ' · '.join(f'{NAMES[k][:4]} fig{c[0]} {"llena" if c[1] else "hueca"} corte {(1.8, 2.6)[c[3]]}' for k, c in zip(live, combo))
          + f' → peor par {w:.0f} px')
    print('   pares:', ' · '.join(f'{NAMES[i][:4]}–{NAMES[j][:4]} {v:.0f}' for (i, j), v in prs.items()))
    return w, prs


if __name__ == '__main__':
    res = search('B-Galones en V', MAKES_V, V_FIG)
    out = {'v': res, 'parcial': partial('B-Galones en V', MAKES_V, V_FIG) if res is None else None}
    pickle.dump(out, open(os.path.join(RT.OUT, '_insignias_v.pkl'), 'wb'))

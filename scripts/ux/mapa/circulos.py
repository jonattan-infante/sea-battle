# Uso (desde la raíz del repo): python3 -I scripts/ux/mapa/circulos.py   →  imprime las reglas y escribe $UX_OUT/mapa/islas-circulos.json
# Tabla de círculos de las islas rediseñadas (D83; colisión B de GDD §4, «Rediseño de islas y puerto», y BACKLOG AC-199):
# cada isla es la unión de sus círculos, más los islotes satélite. Comprueba las reglas de disposición de GDD §4 contadas
# entre círculos de islas distintas. Es la tabla que dev-npc usa para AC-170 y AC-177 y que producto copia a GDD §4 cuando
# Jonattan apruebe la lámina. No corre en la CI.
import json, math, os, sys
sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(here, '..', 'laminas'))
import rutas as RT

# id: (arquetipo, variante, centro de GDD §4, círculo de la 1.0 o None, [(x, z, r)]; el primero, el principal)
ISLAS = {
    'PORT': ('port', None, (0, 0), (0, 0, 30), [(0, 0, 30)]),
    'I1': ('tropical', None, (260, 200), (260, 200, 45), [(260, 200, 45), (212, 214, 30), (305, 182, 28), (225, 150, 8), (275, 255, 7)]),
    'I2': ('rocky', 'stack', (-300, 170), (-300, 170, 35), [(-305, 160, 28), (-282, 188, 18), (-318, 186, 13), (-336, 138, 6)]),
    'I3': ('rocky', 'volcano', (-220, -280), (-220, -280, 55), [(-220, -280, 55), (-175, -250, 30), (-158, -312, 9)]),
    'I4': ('rocky', 'cliff', (250, -260), (250, -260, 40), [(250, -260, 40), (212, -232, 24), (262, -218, 18), (205, -282, 8)]),
    'I5': ('tropical', None, (20, 360), (20, 360, 30), [(20, 360, 30), (-14, 340, 18), (56, 338, 8)]),
    'I6': ('tropical', None, (-410, -30), (-410, -30, 28), [(-413, -36, 21), (-400, -18, 12), (-368, -62, 9)]),
    'T1': ('tropical', 'village', (150, -150), None, [(150, -150, 22), (128, -168, 14), (170, -132, 12)]),
    'T2': ('tropical', 'village', (-170, 150), None, [(-170, 150, 22), (-190, 132, 14), (-150, 168, 12)]),
    'E1a': ('reef', None, (140, 260), None, [(140, 260, 7)]),
    'E1b': ('reef', None, (117.5, 299), None, [(117.5, 299, 7)]),
    'E1c': ('reef', None, (162.5, 299), None, [(162.5, 299, 7)]),
}


def cala(cx, cz):
    """Cala pirata: un respaldo de roca y 2 brazos que abrazan una cala abierta hacia el puerto (dirección u)."""
    L = math.hypot(cx, cz); u = (-cx / L, -cz / L); v = (-u[1], u[0])
    P = lambda a, b, r: (round(cx + a * u[0] + b * v[0], 2), round(cz + a * u[1] + b * v[1], 2), r)
    return [P(-8, 0, 13), P(4, 14, 9), P(4, -14, 9)]


for gid, (gx, gz) in (('G1', (368, -368)), ('G2', (-368, -368)), ('G3', (-368, 368)), ('G4', (368, 368))):
    ISLAS[gid] = ('pirate_cove', None, (gx, gz), None, cala(gx, gz))

SAFE = 110.0
LAIR_R, LAIR_M = 440.0, 17.0           # arco de la guarida (GDD §9) y margen del Capitán
RING, RING_M = (400.0, 470.0), 16.0    # anillo de la cañonera y su margen
SEP = 46.0                             # 2 × el margen del Navío (GDD §6)
LAIR_PTS = [(sx * LAIR_R * math.cos(math.radians(t)), sz * LAIR_R * math.sin(math.radians(t)))
            for (sx, sz) in ((1, -1), (-1, -1), (-1, 1), (1, 1)) for t in [7.5 + 2.5 * k for k in range(31)]]
LAIR_DIAG = {'NE': (311.13, -311.13), 'NO': (-311.13, -311.13)}


def new_boundary(iid, c, n=720):
    """Puntos del borde del círculo c que quedan fuera del círculo de la 1.0 de su isla (lo que cuenta como forma nueva)."""
    old = ISLAS[iid][3]
    pts = [(c[0] + c[2] * math.cos(2 * math.pi * k / n), c[1] + c[2] * math.sin(2 * math.pi * k / n)) for k in range(n)]
    if old is None: return pts
    return [p for p in pts if math.hypot(p[0] - old[0], p[1] - old[1]) > old[2] + 1e-6]


def check():
    out = {'circulos': sum(len(v[4]) for v in ISLAS.values()), 'fallos': [], 'minimos': {}}
    ids = list(ISLAS)
    # (1) ≥ 46 m entre círculos de islas distintas (salvo entre los escollos)
    worst = (1e9, None)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            if a.startswith('E1') and b.startswith('E1'): continue
            for ca in ISLAS[a][4]:
                for cb in ISLAS[b][4]:
                    g = math.hypot(ca[0] - cb[0], ca[1] - cb[1]) - ca[2] - cb[2]
                    if g < worst[0]: worst = (g, f'{a}–{b}')
                    if g < SEP: out['fallos'].append(f'separación {a}–{b}: {g:.1f} m < {SEP}')
    out['minimos']['separacion'] = [round(worst[0], 1), worst[1]]
    # (2) nada toca la zona segura salvo el puerto
    worst = (1e9, None)
    for iid in ids:
        if iid == 'PORT': continue
        for c in ISLAS[iid][4]:
            g = math.hypot(c[0], c[1]) - c[2] - SAFE
            if g < worst[0]: worst = (g, iid)
            if g < 0: out['fallos'].append(f'zona segura {iid}: {g:.1f}')
    out['minimos']['zona_segura'] = [round(worst[0], 1), worst[1]]
    # (3) y (4) lo nuevo respeta 17 m al arco de la guarida y 16 m al anillo de la cañonera
    wl, wr = (1e9, None), (1e9, None)
    for iid in ids:
        if iid == 'PORT': continue
        for c in ISLAS[iid][4]:
            for p in new_boundary(iid, c):
                dl = min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in LAIR_PTS)
                if dl < wl[0]: wl = (dl, iid)
                if dl < LAIR_M: out['fallos'].append(f'arco de la guarida {iid}: {dl:.1f} m'); break
                rr = math.hypot(*p)
                dr = max(RING[0] - RING_M - rr, rr - RING[1] - RING_M)  # ≥ 0 si queda fuera de la banda con su margen
                gap = -1 if dr < 0 else min(abs(rr - (RING[0] - RING_M)), abs(rr - (RING[1] + RING_M)))
                if dr < 0: out['fallos'].append(f'anillo de la cañonera {iid}: r {rr:.1f}'); break
                if gap < wr[0]: wr = (gap, iid)
    out['minimos']['arco_guarida'] = [round(wl[0], 1), wl[1]]
    out['minimos']['anillo_canonera_holgura'] = [round(wr[0], 1), wr[1]]
    # (5) I3 e I4 no crecen más de 16 m hacia su punto de guarida (hoy, 41,3 y 39,6 m)
    for iid, key, today in (('I3', 'NO', 41.3), ('I4', 'NE', 39.6)):
        L = LAIR_DIAG[key]; g = min(math.hypot(c[0] - L[0], c[1] - L[1]) - c[2] for c in ISLAS[iid][4])
        out['minimos'][f'guarida_{iid}'] = round(g, 1)
        if g < today - 16: out['fallos'].append(f'guarida {iid}: {g:.1f} < {today - 16:.1f}')
    # (6) dentro del mapa navegable (±490)
    for iid in ids:
        for c in ISLAS[iid][4]:
            if max(abs(c[0]), abs(c[1])) + c[2] > 490: out['fallos'].append(f'mapa {iid}')
    return out


if __name__ == '__main__':
    res = check()
    data = {iid: {'arquetipo': v[0], 'variante': v[1], 'centro': v[2], 'circulo_1_0': v[3], 'circulos': v[4]} for iid, v in ISLAS.items()}
    os.makedirs(os.path.join(RT.OUT, 'mapa'), exist_ok=True)
    json.dump({'islas': data, 'reglas': res}, open(os.path.join(RT.OUT, 'mapa', 'islas-circulos.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(res, ensure_ascii=False, indent=1))

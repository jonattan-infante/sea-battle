# Uso: python3 -I scripts/ux/puerto.py
# Fase 2 (1.1): comprobación geométrica del puerto de D68 (rehecho con las cifras de product, GDD §4 «El puerto»).
# Coordenadas locales con el origen en el centro del puerto: +X este, +Z sur (hacia la cámara), y arriba; 1 u = 1 m.
# Comprueba: (1) ningún vértice con y > 0 fuera de r 30 (AC-103, AS-V24); (2) oclusión a 55°: el punto de suelo que tapa
# cada vértice, (x, z - 0,70·y), a <= 31 m del centro (los barcos amarrados tienen la popa a 32 m); (3) huellas sin
# solapes entre piezas; (4) barcos amarrados de cada clase en los 12 amarres: sin solape entre vecinos y holgura;
# (5) triángulos estimados por pieza; (6) tamaño en pantalla del astillero.
import math, itertools
T55 = 1 / math.tan(math.radians(55))  # 0,700
R, R_OCC = 30.0, 31.0
pieces = []  # (nombre, huella 2D como polígono convexo [(x, z)], vértices 3D [(x, y, z)], tris, sólido_en_planta)
def box(name, cx, cz, sx, sz, y0, y1, rot=0.0, tris=12, solid=True, top=None):
    c, s = math.cos(rot), math.sin(rot); pts = []
    for ux, uz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, z = ux * sx / 2, uz * sz / 2; pts.append((cx + c * x + s * z, cz - s * x + c * z))
    ys = [y0, y1] if top is None else None
    verts = [(x, y, z) for (x, z) in pts for y in (ys or [y0])]
    if top is not None: verts += [(x, top(x, z), z) for (x, z) in pts]
    pieces.append((name, pts, verts, tris, solid))
def cyl(name, cx, cz, r, y0, y1, n=8, tris=None, solid=True, r1=None):
    r1 = r if r1 is None else r1
    pts = [(cx + r * math.cos(2 * math.pi * i / n), cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    verts = [(cx + rr * math.cos(2 * math.pi * i / n), y, cz + rr * math.sin(2 * math.pi * i / n)) for i in range(n) for rr, y in ((r, y0), (r1, y1))]
    pieces.append((name, pts, verts, tris if tris is not None else 3 * n, solid))
def seg(name, a, b, rad, tris=10):  # cilindro fino de a a b (puntos 3D)
    verts = [(a[0] + dx, a[1] + dy, a[2] + dz) for dx in (-rad, rad) for dy in (-rad, rad) for dz in (-rad, rad)] + \
            [(b[0] + dx, b[1] + dy, b[2] + dz) for dx in (-rad, rad) for dy in (-rad, rad) for dz in (-rad, rad)]
    pieces.append((name, [], verts, tris, False))
TOP = 1.2  # tapa del muelle
# Plataforma de piedra (muelle) y cantil oscuro
pieces.append(('muelle', [], [(R * math.cos(2 * math.pi * i / 48) * math.cos(math.pi / 48) / math.cos(math.pi / 48), y, R * math.sin(2 * math.pi * i / 48)) for i in range(48) for y in (-0.6, TOP)], 144, False))
pieces.append(('cantil', [], [(rr * math.cos(2 * math.pi * i / 48), TOP + 0.05, rr * math.sin(2 * math.pi * i / 48)) for i in range(48) for rr in (29.0, 30.0)], 96, False))
# 12 pantalanes de atraque (tablazón embutida en el muelle) con 2 norays cada uno
for k in range(12):
    a = math.radians(15 + 30 * k); ux, uz = math.sin(a), math.cos(a)  # rumbo psi: (sin, cos)
    box(f'pantalan{k}', 27.2 * ux, 27.2 * uz, 4.0, 5.4, TOP, TOP + 0.1, rot=a, tris=12)
    for t in (-1.5, 1.5):
        cx, cz = 29.2 * ux + t * uz, 29.2 * uz - t * ux
        cyl(f'noray{k}{t}', cx, cz, 0.3, TOP + 0.1, TOP + 0.7, n=5, tris=15, solid=False)
# Faro en el baluarte norte (rumbo 180°, hueco entre los amarres de 165° y 195°)
FZ = -19.5
cyl('baluarte', 0, FZ, 3.2, TOP, TOP + 0.6, n=10, tris=30)
cyl('faro', 0, FZ, 1.6, TOP + 0.6, TOP + 0.6 + 12, n=8, tris=90, r1=1.2)
box('linterna', 0, FZ, 1.4, 1.4, TOP + 12.6, TOP + 13.8, tris=12, solid=False)
# Astillero al sur (rumbo 0°, hueco entre 345° y 15°): grada de madera oscura, esqueleto de casco, cabria, cobertizo y madera
slope = lambda x, z: 2.4 - (2.4 - 1.35) * (z - 12) / (29.5 - 12)
box('grada', 0, 20.75, 6, 17.5, TOP, None, tris=12, top=slope)
box('quilla', 0, 20.5, 0.5, 14, TOP, slope(0, 13.5) + 0.5, tris=12, solid=False)
for i in range(7):
    z = 14.5 + 2 * i; u = (z - 13.5) / 14; w = max(0.8, 2.4 * math.sin(math.pi * min(1, 0.15 + 0.85 * u)))
    for sgn in (-1, 1):
        seg(f'cuaderna{i}{sgn}', (0, slope(0, z) + 0.5, z), (sgn * w, slope(0, z) + 2.8, z), 0.2, tris=12)
seg('roda', (0, slope(0, 13.5) + 0.5, 13.5), (0, slope(0, 13.5) + 3.4, 12.9), 0.2, tris=12)
for sgn in (-1, 1): seg(f'cabria{sgn}', (sgn * 3.8, TOP, 20), (0, 9.2, 20), 0.2, tris=10)
box('cobertizo', 7.6, 15.5, 4.4, 9, TOP, TOP + 3.0, tris=12)
box('cobertizo-tejado', 7.6, 15.5, 4.8, 9.4, TOP + 3.0, TOP + 4.4, tris=8, solid=False)
box('madera1', -6.4, 14.5, 2.0, 3.5, TOP, TOP + 1.0, tris=24)
box('madera2', -6.4, 19.0, 2.0, 3.5, TOP, TOP + 0.6, tris=12)
# Almacenes este y oeste (fachada larga al sur) y grúa de muelle al este (rumbo 90°, hueco entre 75° y 105°)
for sgn in (-1, 1):
    box(f'almacen{sgn}', 15 * sgn, -6, 10, 6, TOP, TOP + 4, tris=12)
    box(f'almacen-tejado{sgn}', 15 * sgn, -6, 10.4, 6.4, TOP + 4, TOP + 5.8, tris=8, solid=False)
cyl('grua-poste', 23, 0, 0.35, TOP, TOP + 7, n=6, tris=18)
seg('grua-pluma', (23, TOP + 7, 0), (29.2, TOP + 8.2, 0), 0.15, tris=10)
seg('grua-cabo', (29.0, TOP + 8.2, 0), (29.0, TOP + 3.5, 0), 0.05, tris=4)
for i, (x, z) in enumerate([(20.5, -3.5), (21.8, -3.0), (20.8, 3.2), (22.0, 3.6), (19.6, 2.6), (21.2, -4.6)]):
    box(f'carga{i}', x, z, 1.0, 1.0, TOP, TOP + 1.0, tris=12, solid=False)
# Capitanía con el mástil de la bandera dorada (centro) y 3 casas al norte
box('capitania', 0, -4, 6, 6, TOP, TOP + 5, tris=12)
box('capitania-tejado', 0, -4, 6.4, 6.4, TOP + 5, TOP + 7.2, tris=8, solid=False)
seg('mastil', (3.6, TOP, -7.6), (3.6, TOP + 9, -7.6), 0.2, tris=10)
box('bandera', 4.6, -7.6, 2.0, 0.05, TOP + 7.7, TOP + 9, tris=2, solid=False)
for i, (x, z) in enumerate([(-10, -13), (10, -13), (0, -12.5)]):
    box(f'casa{i}', x, z, 4, 5, TOP, TOP + 3, rot=math.radians(20 * (i - 1) if i < 2 else 0), tris=12)
    box(f'casa-tejado{i}', x, z, 4.2, 5.2, TOP + 3, TOP + 5.2, rot=math.radians(20 * (i - 1) if i < 2 else 0), tris=8, solid=False)

# ---------------- comprobaciones ----------------
fails = []
maxr = max((math.hypot(x, z), n) for n, _, vs, _, _ in pieces for (x, y, z) in vs if y > 0 and n != 'muelle')
print(f'(1) radio máximo de un vértice con y > 0: {maxr[0]:.2f} m ({maxr[1]}) · límite 30,0 (AC-103 admite 30,5)')
if maxr[0] > 30.0 + 1e-6: fails.append('radio')
occ = max((math.hypot(x, z - T55 * y), n) for n, _, vs, _, _ in pieces for (x, y, z) in vs if y > 0)
print(f'(2) oclusión: punto de suelo tapado más lejano a {occ[0]:.2f} m ({occ[1]}) · límite {R_OCC} m')
if occ[0] > R_OCC: fails.append('oclusión')
def sat(A, B):  # separación de polígonos convexos (ejes separadores) -> distancia mínima aproximada por muestreo
    def inside(p, P):
        s = None
        for i in range(len(P)):
            (x1, z1), (x2, z2) = P[i], P[(i + 1) % len(P)]; c = (x2 - x1) * (p[1] - z1) - (z2 - z1) * (p[0] - x1)
            if abs(c) < 1e-12: continue
            if s is None: s = c > 0
            elif s != (c > 0): return False
        return True
    def segd(p, a, b):
        ax, az = b[0] - a[0], b[1] - a[1]; t = max(0, min(1, ((p[0] - a[0]) * ax + (p[1] - a[1]) * az) / (ax * ax + az * az))); return math.hypot(p[0] - a[0] - t * ax, p[1] - a[1] - t * az)
    if any(inside(p, B) for p in A) or any(inside(p, A) for p in B): return -1.0
    return min(min(segd(p, B[i], B[(i + 1) % len(B)]) for i in range(len(B))) for p in A) if A and B else 9
solid = [(n, P) for n, P, _, _, s in pieces if s and P]
worst = (9, '')
for (n1, P1), (n2, P2) in itertools.combinations(solid, 2):
    if n1.startswith('pantalan') and n2.startswith('pantalan'): continue
    if {n1, n2} == {'faro', 'baluarte'} or ('grada' in (n1, n2) and ('quilla' in (n1, n2))): continue
    if (n1 == 'baluarte' and n2 == 'faro'): continue
    d = min(sat(P1, P2), sat(P2, P1))
    if d < worst[0]: worst = (d, f'{n1}–{n2}')
print(f'(3) holgura mínima entre huellas de piezas sólidas: {worst[0]:.2f} m ({worst[1]}) · mínimo 0,5 m (salvo faro sobre baluarte)')
CLS = {'Balandra': (16, 4.4), 'Goleta': (22, 5.6), 'Bergantín': (24, 6.2), 'Fragata': (34, 8.6), 'Navío': (42, 11.2)}
print('(4) amarres: centro a 30 + L/2 + 2; popa a 32 m; holgura entre dos vecinos de la misma clase (cascos como rectángulos L × B):')
for c, (L, B) in CLS.items():
    rc = 30 + L / 2 + 2
    def hull(k):
        a = math.radians(15 + 30 * k); ux, uz = math.sin(a), math.cos(a); px, pz = uz, -ux
        cx, cz = rc * ux, rc * uz
        return [(cx + sx * L / 2 * ux + sy * B / 2 * px, cz + sx * L / 2 * uz + sy * B / 2 * pz) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    d = min(sat(hull(0), hull(1)), sat(hull(1), hull(0)))
    print(f'    {c:9s} L {L:2d} B {B:4.1f}: centro a {rc:4.1f} m · holgura de popa a popa {d:4.2f} m')
    if d < 0.5: fails.append('amarres ' + c)
# barco amarrado frente a la oclusión del faro (la columna x ∈ [-0,7, 0,7] entre z = FZ y la punta tapada)
L, B = CLS['Navío']; a = math.radians(165); ux, uz = math.sin(a), math.cos(a); px, pz = uz, -ux; rc = 30 + L / 2 + 2
sx = min(abs(rc * ux + s1 * L / 2 * ux + s2 * B / 2 * px) for s1 in (-1, 1) for s2 in (-1, 1))
print(f'    Navío en el amarre de 165°: esquina de casco más cerca del eje norte a |x| = {sx:.2f} m (la linterna ocupa |x| ≤ 0,7)')
# (4b) R-04 de QA: clases mezcladas en amarres contiguos y la regla de amarre libre de GDD §4 (ningún centro a < 12 m
# del eje del amarre, el segmento de r 30 a r 76 en su rumbo)
def hull_at(k, c):
    L, B = CLS[c]; a = math.radians(15 + 30 * k); ux, uz = math.sin(a), math.cos(a); px, pz = uz, -ux; rc = 30 + L / 2 + 2
    return [(rc * ux + sx * L / 2 * ux + sy * B / 2 * px, rc * uz + sx * L / 2 * uz + sy * B / 2 * pz) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))], (rc * ux, rc * uz)
def dist_axis(pt, k):
    a = math.radians(15 + 30 * k); ux, uz = math.sin(a), math.cos(a); t = max(30, min(76, pt[0] * ux + pt[1] * uz))
    return math.hypot(pt[0] - t * ux, pt[1] - t * uz)
print('(4b) clases mezcladas en amarres contiguos (k = 0 y 1): holgura entre cascos y distancia del centro al eje vecino:')
print('    holgura entre cascos, los 25 pares (fila: clase en el amarre k = 0; columna: clase en el contiguo k = 1):')
print('    ' + ' ' * 10 + ''.join(f'{c:>10s}' for c in CLS))
worst = (9, '')
for c1 in CLS:
    row = []
    for c2 in CLS:
        h1, _ = hull_at(0, c1); h2, _ = hull_at(1, c2)
        d = min(sat(h1, h2), sat(h2, h1))
        row.append(d)
        if d < worst[0]: worst = (d, f'{c1}–{c2}')
        if d < 0.5: fails.append(f'amarres {c1}–{c2}')
    print(f'    {c1:10s}' + ''.join(f'{d:10.2f}' for d in row))
for c in CLS:
    _, cc = hull_at(0, c)
    print(f'    {c:9s} atracado: centro a {dist_axis(cc, 1):5.2f} m del eje del amarre contiguo (libre si ≥ 12) y a {dist_axis(cc, 0):.2f} m del suyo')
print(f'    peor par de clases contiguas: {worst[1]}, holgura {worst[0]:.2f} m (los cascos se separan hacia fuera: el mínimo está en las popas)')
L, B = CLS['Navío']; Lb, Bb = CLS['Balandra']
print(f'    barco suelto (no atracado), peor orientación: un Navío cruzado con el centro a 12 m del eje invade {L / 2 - 12:.1f} m; para no tocar a quien aparece hace falta centro a ≥ L/2 + B/2 = {L / 2 + Bb / 2:.1f} m (Balandra) o {L / 2 + B / 2:.1f} m (Navío)')
tris = sum(t for _, _, _, t, _ in pieces)
print(f'(5) triángulos estimados del puerto: {tris} (presupuesto 3 000; el de hoy, medido: 650)')
for ppm, label in ((6.20, '1440×900 N1'), (2.82, '390×844 N1')):
    print(f'(6) astillero en {label}: esqueleto 14 m = {14 * ppm:.0f} px; cuadernas cada 2 m = {2 * ppm:.1f} px, de 0,4 m = {0.4 * ppm:.1f} px; grada 6 × 17,5 m = {6 * ppm:.0f} × {17.5 * ppm * math.sin(math.radians(55)):.0f} px')
print('FALLOS:', fails or 'ninguno')

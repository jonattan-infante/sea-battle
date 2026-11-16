# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/galeon.py
#   →  $UX_OUT/galeon/galeon_lod{0,1}.npz y atlas_galeon.png (ligero: segundos)
# Necesita $UX_OUT/galeon/galeon-rig.json: el aparejo del Galeón con el generador del juego, que exporta
# scripts/ux/laminas/code/export-rig-galeon.ts en una copia del código de 4b4c688 (sin worktree):
#   G=$UX_OUT/galeon/code; mkdir -p $G && git -C <repo principal> archive 4b4c688 src tsconfig.json package.json | tar -x -C $G
#   patch -d $G -p1 < scripts/ux/laminas/code/ship-geometry-lamina.patch; ln -s "$PWD/node_modules" $G/node_modules
#   cp scripts/ux/laminas/code/export-rig-galeon.ts $G/ && (cd $G && npx tsx export-rig-galeon.ts "$UX_OUT/galeon/galeon-rig.json")
# Escribe y lee en $UX_OUT/galeon (rutas.py de scripts/ux/laminas). No corre en la CI.
# Galeón del tesoro (`npc_merchant_galleon`, GDD §9, P2) con el estilo de las familias (E17, D80): la receta de ASSET-SPEC
# §8.4 (36 × 12 m, perfil lleno, 4 palos, popa alta dorada, castillo de proa, cofres y ningún cañón) con textura. Es un
# pasivo (§9.2): velas crema a franjas azules y la bandera del mercante, que salen del generador del juego, y ninguna porta.
# Lo que lo separa del Navío español (AC-194 d): casco de madera con una banda de oro sin portas (el español es rojo con 2
# filas de portas), velas a franjas (el español, con la cruz de Borgoña), 4 palos y la carga en cubierta.
import json, math, os, random, sys
HERE_S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE_S, '..', 'laminas')); sys.path.insert(0, HERE_S)
sys.dont_write_bytecode = True
import rutas as RT
import navio as NV  # utilidades sin medidas del Navío: Mesh, prism, cuboid, hexlin y la distribución del atlas
import numpy as np
from PIL import Image, ImageDraw
OUT = os.path.join(RT.OUT, 'galeon'); os.makedirs(OUT, exist_ok=True)
L, B, F, D, RAIL = 36.0, 12.0, 3.4, 1.8, 1.2
HB = B / 2
# perfil `full` del juego (ship-geometry.ts, PROFILES.full) con su interpolación de Hermite (D23)
FULL = [(-0.5, 0.92, 0.8, 1.4, 0.45), (-0.4, 1.0, 0.93, 1.22, 0.85), (-0.25, 1.0, 0.97, 1.05, 1.0), (0.0, 1.0, 0.97, 1.0, 1.0),
        (0.2, 1.0, 0.95, 1.04, 1.0), (0.36, 0.88, 0.78, 1.15, 0.9), (0.5, 0.3, 0.18, 1.3, 0.5)]
def prof(u):
    n = len(FULL)
    if u <= FULL[0][0]: return FULL[0][1:]
    if u >= FULL[-1][0]: return FULL[-1][1:]
    i = 0
    while u > FULL[i + 1][0]: i += 1
    p, q = FULL[i], FULL[i + 1]; h = q[0] - p[0]; t = (u - p[0]) / h
    sl = lambda j, c: (FULL[min(n - 1, j + 1)][c] - FULL[max(0, j - 1)][c]) / (FULL[min(n - 1, j + 1)][0] - FULL[max(0, j - 1)][0])
    v = lambda c: (2 * t**3 - 3 * t**2 + 1) * p[c] + (t**3 - 2 * t**2 + t) * h * sl(i, c) + (-2 * t**3 + 3 * t**2) * q[c] + (t**3 - t**2) * h * sl(i + 1, c)
    return (max(0, v(1)), max(0, v(2)), v(3), max(0, v(4)))
def yd(z): return prof(z / L)[2] * F
A_, R, uv, WHITE, hexlin, ONE = NV.A, NV.R, NV.uv, NV.WHITE, NV.hexlin, NV.ONE
V_TOP, V_BOT = 5.0, -2.0
BAND = (F - 0.55 * F, F - 0.30 * F)  # la franja sin portas del juego (D36): de 0,55·F a 0,30·F bajo el canto, en la maestra
def hull_uv(z, v): return uv('hull', (z + L / 2) / L, (V_TOP - v) / (V_TOP - V_BOT))
def deck_uv(z, x): return uv('deck', (z + L / 2) / L, (x + 6.2) / 12.4)
GOLD, GOLD_D, GOLD_H, WOOD, WOOD_D = '#D9A93F', '#9C7426', '#F2D38A', '#6B4426', '#3A2618'


def section(z):
    a, b, s, k = prof(z / L); y0 = s * F
    xAt = lambda y: HB * (b + (a - b) * y / y0)
    return [(a * HB, y0 + RAIL), (a * HB, y0), (xAt(0.55 * y0), 0.55 * y0), (b * HB, 0.0), (0.72 * b * HB, -0.62 * k * D), (0.0, -k * D)], y0 - F


def hull(m, nst):
    zs = np.linspace(-L / 2, L / 2, nst); secs = [section(z) for z in zs]
    for side in (1, -1):
        for i in range(nst - 1):
            (S0, sh0), (S1, sh1) = secs[i], secs[i + 1]; z0, z1 = zs[i], zs[i + 1]
            for j in range(len(S0) - 1):
                p = [(side * S0[j][0], S0[j][1], z0), (side * S1[j][0], S1[j][1], z1), (side * S1[j + 1][0], S1[j + 1][1], z1), (side * S0[j + 1][0], S0[j + 1][1], z0)]
                t = [hull_uv(z0, S0[j][1] - sh0), hull_uv(z1, S1[j][1] - sh1), hull_uv(z1, S1[j + 1][1] - sh1), hull_uv(z0, S0[j + 1][1] - sh0)]
                m.quad(*p, *t, rim=1.0)
            pi = [(side * (S0[0][0] - 0.25), S0[0][1], z0), (side * (S1[0][0] - 0.25), S1[0][1], z1), (side * (S1[1][0] - 0.25), S1[1][1], z1), (side * (S0[1][0] - 0.25), S0[1][1], z0)]
            m.solid(*pi, '#5A3A22', 1.0)
            m.solid((side * S0[0][0], S0[0][1], z0), (side * S1[0][0], S1[0][1], z1), pi[1], pi[0], GOLD_D, 1.0)  # regala dorada
    for i in range(nst - 1):
        (S0, _), (S1, _) = secs[i], secs[i + 1]; z0, z1 = zs[i], zs[i + 1]
        p = [(-S0[1][0], S0[1][1], z0), (S0[1][0], S0[1][1], z0), (S1[1][0], S1[1][1], z1), (-S1[1][0], S1[1][1], z1)]
        m.quad(*p, deck_uv(z0, -S0[1][0]), deck_uv(z0, S0[1][0]), deck_uv(z1, S1[1][0]), deck_uv(z1, -S1[1][0]), rim=1.0)
    S, sh = secs[0]; z = -L / 2
    ring = list(S) + [(-x, y) for x, y in reversed(S[:-1])]; cy = np.mean([y for _, y in ring])
    st = lambda x, y: uv('stern', (x + 6.2) / 12.4, (10.0 - y) / 12.0)
    for i in range(len(ring)):
        (x0, y0), (x1, y1) = ring[i], ring[(i + 1) % len(ring)]
        m.tri((0.0, cy, z), (x1, y1, z), (x0, y0, z), st(0, cy), st(x1, y1), st(x0, y0), rim=1.0)
    # proa: cierre de la sección de proa (a = 0,3, no llega a punta en el perfil lleno)
    S, sh = secs[-1]; z = L / 2
    ring = list(S) + [(-x, y) for x, y in reversed(S[:-1])]
    for i in range(len(ring)):
        (x0, y0), (x1, y1) = ring[i], ring[(i + 1) % len(ring)]
        m.tri((0.0, cy, z), (x0, y0, z), (x1, y1, z), hull_uv(z, y0 - sh), hull_uv(z, y0 - sh), hull_uv(z, y1 - sh), rim=1.0)


def box(m, x0, x1, y0, y1, z0, z1, rim=1.0, back=True):
    """Caja con la tapa en tablas (deck), los costados en la región wall (oro con ventanas) y la cara de popa en stern."""
    zlen = z1 - z0
    wl = lambda s, y: uv('wall', s, 1 - (y - y0) / (y1 - y0))
    for x in (x1, x0):
        m.quad((x, y0, z0), (x, y0, z1), (x, y1, z1), (x, y1, z0), wl(0, y0), wl(min(1, zlen / 11), y0), wl(min(1, zlen / 11), y1), wl(0, y1), rim=rim)
    m.quad((x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1), deck_uv(z0, x0), deck_uv(z0, x1), deck_uv(z1, x1), deck_uv(z1, x0), rim=rim)
    st = lambda x, y: uv('stern', (x + 6.2) / 12.4, (10.0 - y) / 12.0)
    if back: m.quad((x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0), st(x0, y0), st(x0, y1), st(x1, y1), st(x1, y0), rim=rim)
    else: m.solid((x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0), GOLD, rim)
    m.solid((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), '#5A3A22', rim)


C2_TOP = yd(-14.8) + 4.0  # la base de la contramesana del generador (export-rig-galeon.ts)
C1_TOP = C2_TOP - 2.0


def castles(m):
    """Popa alta de 2 pisos (alcázar y toldilla) y castillo de proa, a las medidas de §8.4 con la tapa por encima de la
    regala en toda su eslora (el arrufo sube a popa)."""
    box(m, -5.2, 5.2, yd(-13.0), C1_TOP, -18.35, -8.5)
    box(m, -4.7, 4.7, C1_TOP, C2_TOP, -18.45, -12.05)
    box(m, -4.0, 4.0, yd(13.5), yd(16.5) + 1.3, 10.5, 16.6, back=False)
    # barandillas doradas en el borde de las 2 tapas
    for (hx, z0, z1, y) in ((5.2, -18.35, -8.5, C1_TOP), (4.7, -18.45, -12.05, C2_TOP), (4.0, 10.5, 16.6, yd(16.5) + 1.3)):
        for side in (1, -1):
            NV.cuboid(m, side * (hx - 0.08), y + 0.35, (z0 + z1) / 2, 0.16, 0.7, z1 - z0, GOLD_D, top=GOLD)
        NV.cuboid(m, 0, y + 0.35, z0 + 0.08, 2 * hx, 0.7, 0.16, GOLD_D, top=GOLD)


def quarter_galleries(m):
    """Galerías de popa doradas a los costados, de 2 pisos, que sobresalen 0,7 m (el rasgo de riqueza más visible de lado)."""
    for side in (1, -1):
        x = side * 5.2; xo = x + side * 0.7
        for (y0, y1) in ((yd(-17.5) - 0.2, C1_TOP - 0.2), (C1_TOP + 0.2, C2_TOP - 0.3)):
            st = lambda zz, y: uv('stern', 0.12 + 0.2 * (zz + 18.3) / 3.8, (10.0 - y) / 12.0)
            m.quad((xo, y0, -18.3), (xo, y0, -14.5), (xo, y1, -14.5), (xo, y1, -18.3), st(-18.3, y0), st(-14.5, y0), st(-14.5, y1), st(-18.3, y1), rim=1.0)
            for yy in (y0, y1): m.solid((x, yy, -18.3), (xo, yy, -18.3), (xo, yy, -14.5), (x, yy, -14.5), GOLD, 1.0)
            m.solid((x, y0, -14.5), (x, y1, -14.5), (xo, y1, -14.5), (xo, y0, -14.5), GOLD, 1.0)
        # remate en voluta bajo la galería
        m.solid((x, yd(-17.5) - 0.2, -18.3), (xo, yd(-17.5) - 0.2, -18.3), (x, yd(-17.5) - 1.4, -16.4), (x, yd(-17.5) - 1.4, -16.4), GOLD_D, 1.0)


def chests(m):
    """La carga, entre la mayor y la mesana, donde la cámara del juego la ve: 4 cofres de 1,6 × 1,1 × 1,1 m (§8.4) en rojo
    oscuro con 2 flejes y el canto de la tapa en oro (el `cargo` de la receta se confundía con la cubierta), y uno abierto,
    lleno de oro, junto a la mesana."""
    for zc in (-2.4, -4.4):
        for xc in (-1.6, 1.6):
            y0 = yd(zc); NV.cuboid(m, xc, y0 + 0.5, zc, 1.6, 1.0, 1.1, '#6A2E17', top='#7A3B1E')
            for dx in (-0.45, 0.45): NV.cuboid(m, xc + dx, y0 + 0.52, zc, 0.18, 1.06, 1.16, GOLD, top=GOLD_H)
            NV.cuboid(m, xc, y0 + 1.05, zc, 1.66, 0.12, 1.16, GOLD_D, top='#7A3B1E')
    zc = -6.2; y0 = yd(zc)
    NV.cuboid(m, 0.0, y0 + 0.35, zc, 1.3, 0.7, 0.9, '#6A2E17', top=GOLD_H)
    NV.cuboid(m, 0.0, y0 + 0.95, zc - 0.47, 1.3, 0.6, 0.1, '#6A2E17', top=GOLD)


def lanterns_and_figurehead(m):
    for lx in (-3.0, 0.0, 3.0):  # 3 faroles grandes en el coronamiento
        NV.prism(m, (lx, C2_TOP, -18.2), (lx, C2_TOP + 0.9, -18.2), 0.12, 4, WOOD)
        NV.cuboid(m, lx, C2_TOP + 1.5, -18.2, 0.8, 1.2, 0.8, '#FFE9A8', top=GOLD)
    z = L / 2 + 0.2; y = yd(L / 2) - 0.2  # mascarón dorado
    m.solid((-0.4, y - 1.4, z), (0.4, y - 1.4, z), (0.4, y, z + 1.2), (-0.4, y, z + 1.2), GOLD, 1.0)
    m.solid((-0.4, y, z + 1.2), (0.4, y, z + 1.2), (0.35, y + 0.9, z + 1.5), (-0.35, y + 0.9, z + 1.5), GOLD, 1.0)


def deck_details(m):
    # cabrestante, timón en el alcázar y un bote sobre calzos en el combés
    NV.prism(m, (-0.45, C1_TOP + 1.0, -10.0), (0.45, C1_TOP + 1.0, -10.0), 0.8, 8, WOOD)
    NV.boat(m, 0.0, yd(6.4) + 1.2, 6.4, 6.0, 1.8, '#5A3A22', '#4A3424', GOLD)
    for zz in (4.4, 8.4): NV.cuboid(m, 0.0, yd(zz) + 0.25, zz, 1.4, 0.5, 0.3, WOOD)


MASTS = [(11.0, 24.0, 11.0), (1.5, 27.0, 11.6), (-7.5, 18.0, 12.5), (-14.0, 14.0, 12.8)]  # (z, punta, tope de los obenques)


def rigging(m):
    """Mesas de guarnición, obenques, estays y brandales, como en el piloto de las familias (navio.py)."""
    dark = '#2A2018'
    for mz, mh, top in MASTS:
        if mz > -12:  # la contramesana va sobre la toldilla: sin mesa, obenques a la barandilla
            a = prof(mz / L)[0] * HB; yc = yd(mz) + RAIL - 0.2
        else:
            a = 4.7; yc = C2_TOP + 0.3
        for side in (1, -1):
            x0, x1 = side * a, side * (a + 0.7)
            if mz > -12: m.solid((x0, yc, mz - 2.6), (x1, yc, mz - 2.6), (x1, yc, mz + 2.6), (x0, yc, mz + 2.6), WOOD_D, 0.0)
            for k in range(5 if mz > -12 else 3):
                zz = mz - 2.2 + 1.1 * k; p = np.array([side * (a + 0.6), yc, zz]); q = np.array([side * 0.8, top, mz])
                dv = q - p; dv /= np.linalg.norm(dv); n = np.cross(dv, [0, 0, 1]); n = n / (np.linalg.norm(n) + 1e-9) * 0.05
                m.solid(p - n, p + n, q + n, q - n, dark, 0.0)
    tip = (0.0, 1.25 * F + 0.342 * 8.0, L / 2 - 1 + 0.94 * 8.0)  # punta del bauprés del generador (bauprés de 7 m)
    for (p, q) in (((0, 23.4, 11.0), tip), ((0, 18.0, 11.0), (0, 1.25 * F + 0.342 * 4.4, L / 2 - 1 + 0.94 * 4.4)),
                   ((0, 26.4, 1.5), (0, 17.0, 11.0)), ((0, 17.4, -7.5), (0, 12.0, 1.5)), ((0, 13.6, -14.0), (0, 11.0, -7.5))):
        NV.prism(m, p, q, 0.06, 4, dark)
    for mz, mh, _ in MASTS[:3]:
        for side in (1, -1):
            zb = mz - 6.0; a = prof(zb / L)[0] * HB
            NV.prism(m, (side * 0.3, mh - 1.0, mz), (side * (a + 0.3), yd(zb) + RAIL, zb), 0.05, 4, dark)


def rig(m, lod):
    d = json.load(open(RT.need(os.path.join(OUT, 'galeon-rig.json'), 'galeon-rig.json (code/export-rig-galeon.ts)')))[f'lod{lod}']
    P = np.array(d['pos']).reshape(-1, 3, 3); C = np.array(d['col']).reshape(-1, 3, 3); Rm = np.array(d['rim']).reshape(-1, 3)
    for p, c, r in zip(P, C, Rm):
        if r[0] > 0.5: continue  # el casco va con textura
        m.p += [tuple(v) for v in p]; m.t += [WHITE] * 3; m.c += [tuple(x) for x in c]; m.r += [0.0] * 3


def build(lod):
    m = NV.Mesh(); hull(m, 25 if lod == 0 else 9); castles(m)
    if lod == 0: quarter_galleries(m); chests(m); lanterns_and_figurehead(m); deck_details(m); rigging(m)
    rig(m, lod)
    return m


def paint(seed=11):
    rng = random.Random(seed); img = Image.new('RGB', (A_, A_), (255, 255, 255)); d = ImageDraw.Draw(img)
    H = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    x0, y0, w, h = R['hull']
    ry = lambda v: y0 + (V_TOP - v) / (V_TOP - V_BOT) * h
    d.rectangle((x0, y0, x0 + w, y0 + h), fill=H('#6E4A2C'))
    d.rectangle((x0, ry(0), x0 + w, y0 + h), fill=H('#3A2416'))
    d.rectangle((x0, ry(F + RAIL), x0 + w, ry(F + 0.15)), fill=H('#5A3A22'))
    # tablazón (cada 0,25 m) con juntas a tope
    for v in np.arange(V_BOT, V_TOP, 0.25):
        yy = ry(v); base = img.getpixel((5, int(min(max(yy + 2, y0), y0 + h - 1))))
        d.line((x0, yy, x0 + w, yy), fill=tuple(max(0, c - 16) for c in base))
        xx = rng.randint(0, 60)
        while xx < 1024:
            d.line((xx, yy, xx, ry(v + 0.25)), fill=tuple(max(0, c - 10) for c in base)); xx += rng.randint(70, 150)
    # banda de oro sin portas (la ranura `band` de la librea, D66) con una greca de volutas y cintas oscuras en los bordes
    vb, vt = BAND
    d.rectangle((x0, ry(vt), x0 + w, ry(vb)), fill=H(GOLD))
    for v in (vt, vb): d.rectangle((x0, ry(v) - 2, x0 + w, ry(v) + 2), fill=H('#2A1A10'))
    cy, rr = (ry(vt) + ry(vb)) / 2, (ry(vb) - ry(vt)) / 2 - 5
    for xx in range(0, 1024, 26):
        d.arc((xx, cy - rr, xx + 2 * rr, cy + rr), 200, 520, fill=H(GOLD_D), width=3)
        d.ellipse((xx + rr - 3, cy - 3, xx + rr + 3, cy + 3), fill=H(GOLD_H))
    # cinta dorada bajo la regala y friso de rombos
    d.rectangle((x0, ry(F + 0.35), x0 + w, ry(F + 0.2)), fill=H(GOLD))
    for xx in range(8, 1024, 18):
        cyy = ry(F + 0.75); d.polygon([(xx, cyy - 5), (xx + 5, cyy), (xx, cyy + 5), (xx - 5, cyy)], fill=H(GOLD_D))
    d.line((x0, ry(0.02), x0 + w, ry(0.02)), fill=(200, 190, 170), width=2)
    # cubierta en 3 tonos (D62) con 2 escotillas de enjaretado
    x0, y0, w, h = R['deck']; tones = [(225, 177, 123), (189, 141, 89), (151, 107, 57)]
    n = int(12.4 / 0.5); perm = [0, 1, 2]
    for i in range(n):
        if i % 3 == 0: rng.shuffle(perm)
        ya, yb = y0 + i * h / n, y0 + (i + 1) * h / n
        d.rectangle((x0, ya, x0 + w, yb), fill=tones[perm[i % 3]]); d.line((x0, yb, x0 + w, yb), fill=(110, 80, 50))
    for zc in (-0.55,):
        xa, xb = (zc + 18 - 1.1) / 36 * 1024, (zc + 18 + 1.1) / 36 * 1024; ya, yb = y0 + (6.2 - 1.1) / 12.4 * h, y0 + (6.2 + 1.1) / 12.4 * h
        d.rectangle((xa, ya, xb, yb), fill=(80, 56, 34))
        for gx in np.arange(xa + 3, xb, 6): d.line((gx, ya, gx, yb), fill=(140, 100, 60))
        for gy in np.arange(ya + 3, yb, 6): d.line((xa, gy, xb, gy), fill=(140, 100, 60))
    # muros de la popa y del castillo (región wall): oro con pilastras oscuras y ventanas encendidas
    x0, y0, w, h = R['wall']
    d.rectangle((x0, y0, x0 + w, y0 + h), fill=H(GOLD))
    d.rectangle((x0, y0, x0 + w, y0 + 0.1 * h), fill=H(GOLD_D)); d.rectangle((x0, y0 + 0.9 * h, x0 + w, y0 + h), fill=H(GOLD_D))
    for xx in range(10, w, 36):
        d.rectangle((x0 + xx - 2, y0 + 0.1 * h, x0 + xx + 2, y0 + 0.9 * h), fill=H(GOLD_D))
        d.rectangle((x0 + xx + 8, y0 + 0.3 * h, x0 + xx + 26, y0 + 0.66 * h), fill=H('#2A1A10'))
        d.rectangle((x0 + xx + 10, y0 + 0.32 * h, x0 + xx + 24, y0 + 0.64 * h), fill=H('#FFE9A8'))
    # espejo de popa (región stern): oro labrado con 2 filas de ventanas y una cartela
    x0, y0, w, h = R['stern']; sy = lambda y: y0 + (10.0 - y) / 12.0 * h; sx = lambda x: x0 + (x + 6.2) / 12.4 * w
    d.rectangle((x0, y0, x0 + w, y0 + h), fill=H(GOLD)); d.rectangle((x0, sy(0), x0 + w, y0 + h), fill=H('#3A2416'))
    d.rectangle((x0, sy(2.2), x0 + w, sy(0)), fill=H('#6E4A2C'))
    for (ya, yb_) in ((C1_TOP - 1.4, C1_TOP - 0.5), (C2_TOP - 1.5, C2_TOP - 0.6)):
        d.rectangle((x0, sy(yb_ + 0.2), x0 + w, sy(ya - 0.2)), fill=H(GOLD_D))
        for xx in np.arange(-3.9, 4.0, 1.1):
            d.rectangle((sx(xx - 0.36), sy(yb_), sx(xx + 0.36), sy(ya)), fill=H('#FFE9A8')); d.rectangle((sx(xx - 0.36), sy(yb_), sx(xx + 0.36), sy(ya)), outline=H('#2A1A10'))
    for k in range(220):
        xx = rng.uniform(-6.0, 6.0); yy = rng.uniform(2.4, 10.0); r = rng.choice((1, 2))
        d.ellipse((sx(xx) - r, sy(yy) - r, sx(xx) + r, sy(yy) + r), fill=H(GOLD_H) if k % 3 else H(GOLD_D))
    d.ellipse((sx(-1.1), sy(4.6), sx(1.1), sy(3.0)), fill=H('#2F7FB8'), outline=H('#2A1A10'))  # cartela azul del mercante
    # oclusión aproximada bajo la regala y en la flotación
    arr = np.asarray(img).astype(float); x0, y0, w, h = R['hull']
    for v0, v1 in ((F + RAIL, F + 0.9), (0.35, 0.0)):
        a, b = int(ry(v0)), int(ry(v1)); arr[a:b, x0:x0 + w] *= 0.85
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img); x0, y0, w, h = R['white']; d.rectangle((x0, y0, x0 + w, y0 + h), fill=(255, 255, 255))
    return img


if __name__ == '__main__':
    img = paint(); img.save(os.path.join(OUT, 'atlas_galeon.png'))
    for lod in (0, 1):
        m = build(lod)
        np.savez(os.path.join(OUT, f'galeon_lod{lod}.npz'), p=np.array(m.p, float), t=np.array(m.t, float), c=np.array(m.c, float), r=np.array(m.r, float))
        print(f'lod{lod}', m.ntri(), 'tris')
    chk = json.load(open(os.path.join(OUT, 'galeon-rig.json')))['check']
    print('perfil: máx |Δ cubierta| y |Δ semimanga| frente al juego', max(abs(yd(u * L) - s) for u, s, a in chk), max(abs(prof(u)[0] * HB - a) for u, s, a in chk))

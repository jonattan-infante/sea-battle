# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/capitan_curvo.py
#   →  $UX_OUT/cadena/capitan_lod{0,1}.npz, atlas_capitan_base.png y, si existe ao_capitan.npy (blender_curvo.py capitan
#      bake), atlas_capitan.png con la oclusión horneada (ligero: segundos)
# Necesita $UX_OUT/cadena/captain-rig.json: el Capitán de hoy del generador del juego (code/export-rig-npc.ts captain; ver la
# cabecera de ad28_canonera2.py). No corre en la CI.
# El Capitán pirata (`npc_pirate_captain`, ASSET-SPEC §8.4; el jefe del I2) con la receta de D91, que Jonattan aprobó con los
# Navíos y la Cañonera (nota del I2: «Quiero mas detalles en los barcos pirata, se ven muy planos»). Del generador del juego
# se queda lo que lo identifica y lo que fija la silueta (AD-28, AD-37): los 3 palos con su caída de 6°, las cuadras negras
# con la fila baja roja, la cangreja de la mesana, las cofas, el estandarte blanco con el cuadro negro (sin foques), el
# mascarón dorado y los 6 cañones por banda. El casco se rehace con curvo.py y textura: perfil fino, alcázar de 1,6 m, popa
# con caída, galerías y espejo con 2 filas de ventanas encendidas, la calavera tallada y la regala dorada; en el costado,
# la franja roja de portas con las portas enmarcadas en oro, tapas abiertas (negras por fuera y rojas por dentro), óxido
# bajo cada porta y la franja descascarillada. En cubierta, tablas oscuras en 2 tonos (su media sigue en #6E4B30, para
# que la fracción media de AD-28 no se acerque a la de la Cañonera), el cofre del botín en el alcázar, 3 faroles en el
# coronamiento (el del buque insignia), el timón, barriles, balas y cabos.
import json, math, os, random, sys
HERE_S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE_S, '..', 'laminas')); sys.path.insert(0, HERE_S)
sys.dont_write_bytecode = True
import rutas as RT
import curvo as CV
import numpy as np
from PIL import Image, ImageDraw
OUT = os.path.join(RT.OUT, 'cadena'); os.makedirs(OUT, exist_ok=True)
L, B, F, D, RAIL = 30.0, 8.0, 2.8, 1.5, 1.0
V_TOP, V_BOT = 5.6, -1.8
Q0 = dict(kind='aft', edge=-7.0, h=1.6, ramp=2.0)  # el alcázar del juego: Box(6,4, 1,6, 8,0) de z −15 a −7
TIERS = [Q0]
AT = CV.Atlas({'hull': (0, 0, 1024, 320), 'deck': (0, 320, 1024, 224), 'inner': (0, 544, 1024, 48),
               'q0': (0, 592, 320, 160), 'stern': (320, 592, 320, 288), 'bw0': (640, 592, 192, 64), 'gal': (640, 656, 128, 128)})
PAL = dict(hull='#2A2523', band='#B3261E', bottom='#1C1817', wale='#100E0C', port='#140E0A', rail='#3A2A20', inner='#4A2016',
           trim='#D9A93F', trim_d='#7A5A1E', window='#FFD27A', bone='#E8E2D0', rust='#5E2A16', wood='#5A3A22', dark='#2A2018')
DECK = ('#805C40', '#5C3B21')  # las tablas del Capitán (§8.4); media #6E4B30
CANNON_Z = (-8.5, -5.1, -1.7, 1.7, 5.1, 8.5); CANNON_Y = 1.68; BAND = (1.18, 2.18)  # franja de portas de 1,0 m (§8.1)


def hull_of(): return CV.Hull(L, B, F, D, RAIL, 'fine', y_m=1.2, T=0.08, tiers=TIERS, over=(0.42, 1.6, 0.05), bulge=0.25)


def rig_json(): return json.load(open(RT.need(os.path.join(OUT, 'captain-rig.json'), 'captain-rig.json (code/export-rig-npc.ts captain)')))


def rig(m, lod):
    """Del generador del juego, todo menos el casco, el alcázar y las portas (van en la textura): palos, vergas, cofas, velas,
    estandarte, mascarón, cañones y escotillas, con su color de vértice y el texel blanco."""
    d = rig_json()[f'lod{lod}']
    P = np.array(d['pos']).reshape(-1, 3, 3); C = np.array(d['col']).reshape(-1, 3, 3); Rm = np.array(d['rim']).reshape(-1, 3)
    gunport = CV.hexlin('#1A1410'); gold = CV.hexlin('#D9A93F'); w = AT.white
    for p, c, r in zip(P, C, Rm):
        if r[0] > 0.5 or np.abs(c[0] - gunport).max() < 1e-3: continue
        if np.abs(c[0] - gold).max() < 2e-3 and p[:, 2].min() > 14.0: continue  # la caja del mascarón: va el de figurehead()
        m.p += [tuple(v) for v in p]; m.t += [w] * 3; m.c += [tuple(x) for x in c]; m.r += [0.0] * 3; m.b += [0] * 3


def build(lod):
    H = hull_of(); m = CV.Mesh(AT)
    zs = H.stations(15) if lod == 0 else H.stations(7, fr=(0.0, 1.0))
    secs = CV.build_hull(m, H, zs, 2, 2 if lod == 0 else 1, V_TOP, V_BOT, PAL['trim'])  # la regala dorada (§8.4; AD-28: se queda en LOD1)
    CV.build_stern(m, H, secs[0], 4 if lod == 0 else 2)
    CV.build_deck(m, H, zs, 'deck', Q0['edge'], L / 2, 0.0, 9.0)
    CV.build_deck(m, H, zs, 'q0', -L / 2, Q0['edge'], Q0['h'], 9.0)
    xl, xh, yl, yh = CV.build_wall(m, H, 'bw0', Q0['edge'], 0.0, Q0['h'], +1, ncol=4 if lod == 0 else 2)
    if lod == 0:
        CV.cuboid(m, 0, yh + 0.45, Q0['edge'] + 0.15, 2 * xh - 0.1, 0.9, 0.14, PAL['rail'], top=PAL['trim'], rim=1.0)
        zt = -L / 2 + H.tb; yd_ = H.y0(zt) + Q0['h']; yt = H.top(zt); xs = H.x_at(zt, yt) - H.tb  # borda interior del espejo
        m.solid(H.warp(-xs, yd_, zt), H.warp(xs, yd_, zt), H.warp(xs, yt, zt), H.warp(-xs, yt, zt), PAL['inner'], 1.0)
        CV.build_gallery(m, H, -14.6, -11.2, H.y0(-13) + Q0['h'] - 0.6, H.top(-13) - 0.3, 0.4, PAL['trim'], nz=4, ny=2)
        details(m, H)
    figurehead(m, H)
    rig(m, lod)
    return m, H


def figurehead(m, H):
    """Mascarón dorado bajo el bauprés (un apéndice, sin _RIM_MASK, como el de los Navíos; AS-V03 no lo cuenta): un tajamar
    curvo y, en la punta, una calavera de hueso. También en LOD1, porque es rasgo del Capitán (§8.4)."""
    gold, bone = PAL['trim'], PAL['bone']; z = 14.6; y = H.y0(z) - 0.2
    m.solid((-0.3, y - 1.4, z - 0.2), (0.3, y - 1.4, z - 0.2), (0.3, y, z + 0.9), (-0.3, y, z + 0.9), gold, 0.0)
    m.solid((-0.3, y, z + 0.9), (0.3, y, z + 0.9), (0.26, y + 0.7, z + 1.25), (-0.26, y + 0.7, z + 1.25), gold, 0.0)
    for sx in (1, -1): m.tri((sx * 0.3, y - 1.4, z - 0.2), (sx * 0.3, y, z + 0.9), (sx * 0.3, y, z - 0.2), m.at.white, m.at.white, m.at.white, gold, 0.0)
    CV.prism(m, (0, y + 0.55, z + 1.15), (0, y + 1.2, z + 1.35), 0.32, 6, bone)


def details(m, H):
    pal = PAL; yq = lambda z: H.y0(z) + Q0['h']
    # tapas de porta abiertas (bisagra arriba, 55°): negras por fuera y rojas por dentro, como la franja
    for z in CANNON_Z:
        ytop = BAND[1] + 0.05 + H.sheer(z); x = H.x_at(z, ytop)
        for side in (1, -1):
            w2, lh, ang = 0.42, 0.62, math.radians(55)
            h0 = (side * x, ytop, z - w2); h1 = (side * x, ytop, z + w2)
            e0 = (side * (x + lh * math.sin(ang)), ytop - lh * math.cos(ang), z - w2); e1 = (e0[0], e0[1], z + w2)
            m.solid(h0, h1, e1, e0, pal['band'], 0.0)  # la cara de dentro, roja, hacia el casco
            o2 = 0.03 * side; m.solid((h0[0] + o2, h0[1], h0[2]), (e0[0] + o2, e0[1], e0[2]), (e1[0] + o2, e1[1], e1[2]), (h1[0] + o2, h1[1], h1[2]), pal['hull'], 0.0)
    # el cofre del botín en el alcázar, con la tapa abierta y el oro a la vista (rasgo del jefe; en grises, una mancha clara)
    zc = -11.8; yc = yq(zc)
    CV.cuboid(m, 0, yc + 0.32, zc, 1.3, 0.64, 0.8, pal['wood'], top='#E8B83A')
    m.solid(H.warp(-0.65, yc + 0.64, zc - 0.4), H.warp(0.65, yc + 0.64, zc - 0.4), H.warp(0.65, yc + 1.25, zc - 0.62), H.warp(-0.65, yc + 1.25, zc - 0.62), pal['wood'])
    for (x, z) in ((1.0, -12.3), (-0.95, -11.4)): CV.prism(m, (x, yq(z) + 0.01, z), (x, yq(z) + 0.12, z), 0.32, 6, '#E8B83A')
    # timón y bitácora en el alcázar
    zw = -8.6; yw = yq(zw) + 0.8; CV.prism(m, (-0.3, yw, zw), (0.3, yw, zw), 0.6, 8, pal['wood'])
    CV.cuboid(m, 0, yq(-9.6) + 0.4, -9.6, 0.5, 0.8, 0.5, '#4A3424', top=pal['trim'])
    # 3 faroles en el coronamiento (el buque insignia), el central más grande
    for lx, s in ((-1.8, 0.8), (0.0, 1.15), (1.8, 0.8)):
        zl = -15.2; yt = H.top(zl); c = H.warp(lx, yt + 0.55 * s, zl)
        CV.cuboid(m, c[0], c[1], c[2], 0.5 * s, 0.8 * s, 0.5 * s, '#FFE9A8', top=pal['trim'])
    # barriles de pólvora, cajas de balas y adujas en el combés
    for (x, z) in ((1.9, 3.4), (-1.9, -3.4)): CV.barrel(m, x, H.y0(z) + 0.4, z, 0.38, 0.8, pal['wood'], '#1C1410')
    for (x, z) in ((2.2, -0.6), (-2.2, 4.6)):
        CV.cuboid(m, x, H.y0(z) + 0.15, z, 0.5, 0.3, 0.8, '#3A2618', top='#26282B')
    for (x, z) in ((-1.4, 10.6), (1.3, -5.8)): CV.prism(m, (x, H.y0(z) + 0.02, z), (x, H.y0(z) + 0.18, z), 0.45, 8, '#8A7A5A')
    # obenques del trinquete y de la mayor: 3 por banda, de la regala a la cofa
    for mz, top in ((9.0, 9.5), (0.0, 9.9)):
        for side in (1, -1):
            for dz in (-1.0, 0.0, 1.0):
                zz = mz - 1.6 + dz; a = H.x_at(zz, H.top(zz)); p = np.array([side * (a - 0.05), H.top(zz), zz]); q = np.array([side * 0.8, top, mz])
                dv = q - p; dv /= np.linalg.norm(dv); n = np.cross(dv, [0, 0, 1]); n = n / (np.linalg.norm(n) + 1e-9) * 0.05
                m.solid(tuple(p - n), tuple(p + n), tuple(q + n), tuple(q - n), pal['dark'], 0.0)


# ---- atlas
def paint(seed=29):
    rng = random.Random(seed); pal = PAL; img = Image.new('RGB', (AT.A, AT.A), (255, 255, 255)); d = ImageDraw.Draw(img)
    Hc = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    H = hull_of()
    # costado: v = alto sobre la flotación corregido por el arrufo
    x0, y0_, w, h = AT.R['hull']
    ry = lambda v: AT.px('hull', 0, (V_TOP - v) / (V_TOP - V_BOT))[1]
    rx = lambda z: AT.px('hull', (z + L / 2) / L, 0)[0]
    d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['hull'])); d.rectangle((x0, ry(0.0), x0 + w, y0_ + h), fill=Hc(pal['bottom']))
    d.rectangle((x0, ry(BAND[1]), x0 + w, ry(BAND[0])), fill=Hc(pal['band']))
    for k in range(70):  # la franja descascarillada: lascas negras
        z = rng.uniform(-L / 2, L / 2); v = rng.uniform(*BAND); r = rng.uniform(1.0, 2.6)
        d.ellipse((rx(z) - r * 1.6, ry(v) - r, rx(z) + r * 1.6, ry(v) + r), fill=Hc(pal['hull']))
    for v in BAND: d.rectangle((x0, ry(v) - 2, x0 + w, ry(v) + 1), fill=Hc(pal['wale']))
    pw, ph = 0.8 * 1024 / L / 2, 0.6 * (ry(0) - ry(1)) / 2; cy = ry(CANNON_Y)
    for z in CANNON_Z:  # portas enmarcadas en oro y el óxido que chorrea debajo
        d.rectangle((rx(z) - pw - 3, cy - ph - 3, rx(z) + pw + 3, cy + ph + 3), fill=Hc(pal['trim']))
        d.rectangle((rx(z) - pw, cy - ph, rx(z) + pw, cy + ph), fill=Hc(pal['port']))
        for k in range(5):
            xx = rx(z) + rng.uniform(-pw, pw); d.line((xx, cy + ph + 3, xx + rng.uniform(-2, 2), cy + ph + 3 + rng.uniform(10, 26)), fill=Hc(pal['rust']), width=2)
    # tablazón: líneas cada 0,25 m, juntas a tope, tablas cambiadas más claras
    arr = np.asarray(img).astype(float)
    for v in np.arange(V_BOT, V_TOP, 0.25):
        a_, b_ = int(ry(v + 0.25)), int(ry(v)); xx = 0
        while xx < 1024:
            seg = rng.randint(60, 140); arr[a_:b_, xx:xx + seg] *= rng.uniform(0.92, 1.08) if rng.random() > 0.08 else 1.35; xx += seg
            arr[a_:b_, max(xx - 1, 0):xx] *= 0.7
        arr[b_ - 1:b_, :] *= 0.8
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(img)
    d.rectangle((x0, ry(0.12), x0 + w, ry(-0.05)), fill=(46, 58, 38))  # verdín en la flotación
    d.line((x0, ry(0.02), x0 + w, ry(0.02)), fill=(200, 196, 180), width=2)
    vr = F + RAIL; zz = np.linspace(-L / 2, L / 2, 600)
    for dv, wd in ((0.0, 5), (-0.45, 2)):  # molduras de oro bajo la regala, siguiendo su curva
        d.line([(rx(z), ry(vr + H.rail_rise(z) + dv - 0.15)) for z in zz], fill=Hc(pal['trim']), width=wd)
    for z in np.arange(-L / 2 + 0.6, Q0['edge'] - 0.4, 0.55):  # volutas en la obra muerta del alcázar
        yy = ry(vr + H.rail_rise(z) - 0.75); d.arc((rx(z) - 6, yy - 5, rx(z) + 6, yy + 5), 180, 360, fill=Hc(pal['trim']), width=2)
    for z in np.arange(-14.2, -8.0, 1.05):  # ventanas de la cámara en el costado del alcázar
        yb, yt = vr + 0.25, vr + 0.95
        d.rectangle((rx(z) - 9, ry(yt) - 2, rx(z) + 9, ry(yb) + 2), fill=Hc(pal['trim'])); d.rectangle((rx(z) - 7, ry(yt), rx(z) + 7, ry(yb)), fill=Hc(pal['window']))
    # cubiertas: tablas a lo largo de Z en los 2 tonos del Capitán, juntas, clavos y quemaduras
    for reg in ('deck', 'q0'):
        x0, y0_, w, h = AT.R[reg]; n = max(6, int(h / 10))
        for i in range(n):
            ya, yb2 = y0_ + i * h / n, y0_ + (i + 1) * h / n
            d.rectangle((x0, ya, x0 + w, yb2), fill=Hc(DECK[i % 2])); d.line((x0, yb2, x0 + w, yb2), fill=(40, 26, 14))
            xx = x0 + rng.randint(0, 40)
            while xx < x0 + w:
                d.line((xx, ya, xx, yb2), fill=(48, 32, 18)); d.point([(xx + 3, ya + 2), (xx + 3, yb2 - 3)], fill=(30, 22, 16)); xx += rng.randint(50, 110)
        for k in range(4):  # quemaduras, pocas y suaves (de lejos, con más se lee como suciedad)
            cx, cy2, r = rng.uniform(x0 + 20, x0 + w - 20), rng.uniform(y0_ + 10, y0_ + h - 10), rng.uniform(5, 10)
            d.ellipse((cx - r * 1.5, cy2 - r, cx + r * 1.5, cy2 + r), fill=(78, 52, 32))
    x0, y0_, w, h = AT.R['deck']; zr = lambda z: x0 + (z - Q0['edge']) / (L / 2 - Q0['edge']) * w
    for zc in (-3.6, 5.6):  # escotillas con enjaretado
        xa, xb = zr(zc - 1.2), zr(zc + 1.2); ya, yb2 = y0_ + 0.4 * h, y0_ + 0.6 * h
        d.rectangle((xa, ya, xb, yb2), fill=(46, 30, 18))
        for gx in np.arange(xa + 4, xb, 8): d.line((gx, ya, gx, yb2), fill=(110, 78, 48))
        for gy in np.arange(ya + 4, yb2, 8): d.line((xa, gy, xb, gy), fill=(110, 78, 48))
    # interior de la borda, mamparo del alcázar y galerías
    x0, y0_, w, h = AT.R['inner']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['inner'])); d.rectangle((x0, y0_, x0 + w, y0_ + 4), fill=Hc(pal['trim']))
    x0, y0_, w, h = AT.R['bw0']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['hull'])); d.rectangle((x0, y0_, x0 + w, y0_ + 5), fill=Hc(pal['trim']))
    for xx in (x0 + 20, x0 + w - 44):
        d.rectangle((xx, y0_ + 14, xx + 24, y0_ + h - 4), fill=Hc(pal['trim'])); d.rectangle((xx + 3, y0_ + 17, xx + 21, y0_ + h - 6), fill=(60, 40, 25))
    for xx in (x0 + 70, x0 + 104):
        d.rectangle((xx, y0_ + 18, xx + 18, y0_ + 36), fill=Hc(pal['trim'])); d.rectangle((xx + 2, y0_ + 20, xx + 16, y0_ + 34), fill=Hc(pal['window']))
    x0, y0_, w, h = AT.R['gal']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['hull']))
    d.rectangle((x0, y0_ + 0.18 * h, x0 + w, y0_ + 0.72 * h), fill=Hc(pal['trim']))
    for xx in np.arange(x0 + 6, x0 + w - 8, 20): d.rectangle((xx, y0_ + 0.24 * h, xx + 13, y0_ + 0.66 * h), fill=Hc(pal['window']))
    # espejo: 2 filas de ventanas encendidas con marcos de oro, el panel tallado y la calavera con las tibias
    x0, y0_, w, h = AT.R['stern']; ytop = H.top(-L / 2); ybot = -H.prof(-L / 2)[3] * D
    sy = lambda y: AT.px('stern', 0, (ytop - y) / (ytop - ybot))[1]; sx = lambda x: AT.px('stern', 0.5 + x / (2 * H.hb), 0)[0]
    d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['hull'])); d.rectangle((x0, sy(0), x0 + w, y0_ + h), fill=Hc(pal['bottom']))
    y_ = H.y0(-L / 2)
    for (ya, yb_) in ((y_ - 1.05, y_ - 0.35), (y_ + 0.3, y_ + 1.0)):
        d.rectangle((x0, sy(yb_ + 0.18), x0 + w, sy(ya - 0.18)), fill=Hc(pal['trim']))
        for xx in np.arange(-1.65, 1.7, 0.82):
            d.rectangle((sx(xx - 0.3), sy(yb_), sx(xx + 0.3), sy(ya)), fill=Hc(pal['window'])); d.line((sx(xx), sy(yb_), sx(xx), sy(ya)), fill=Hc(pal['trim_d']), width=2)
    yp0 = y_ + 1.2
    d.rectangle((sx(-2.2), sy(ytop - 0.1), sx(2.2), sy(yp0)), fill=(58, 48, 42), outline=Hc(pal['trim']), width=3)
    for k in range(90):
        xx, yy = rng.uniform(-2.1, 2.1), rng.uniform(yp0 + 0.05, ytop - 0.15); r = rng.choice((1, 2))
        d.ellipse((sx(xx) - r, sy(yy) - r, sx(xx) + r, sy(yy) + r), fill=(235, 190, 80))
    s = (sy(yp0) - sy(ytop)) * 0.3; cxs, cys = sx(0), sy((ytop + yp0) / 2 + 0.1)
    for a0, a1 in ((-1, 1), (1, -1)): d.line((cxs - s * 1.4, cys + s * 0.9 * a0, cxs + s * 1.4, cys + s * 0.9 * a1), fill=Hc(pal['bone']), width=max(3, int(s * 0.22)))
    d.ellipse((cxs - s * 0.62, cys - s * 0.7, cxs + s * 0.62, cys + s * 0.5), fill=Hc(pal['bone'])); d.rectangle((cxs - s * 0.36, cys + s * 0.32, cxs + s * 0.36, cys + s * 0.68), fill=Hc(pal['bone']))
    for ex in (-0.25, 0.25): d.ellipse((cxs + s * ex - s * 0.16, cys - s * 0.22, cxs + s * ex + s * 0.16, cys + s * 0.1), fill=(20, 16, 14))
    x0, y0_, w, h = AT.R['white']; d.rectangle((x0 - 4, y0_ - 4, x0 + w + 4, y0_ + h + 4), fill=(255, 255, 255))
    return img


if __name__ == '__main__':
    import navio_curvo as NC  # compose(): el mismo atlas × oclusión que los Navíos y la Cañonera
    base = paint(); base.save(os.path.join(OUT, 'atlas_capitan_base.png'))
    ao = os.path.join(OUT, 'ao_capitan.npy')
    if os.path.exists(ao): NC.compose(base, ao, AT.R['white']).save(os.path.join(OUT, 'atlas_capitan.png')); print('atlas con oclusión')
    for lod in (0, 1):
        m, H = build(lod)
        np.savez(os.path.join(OUT, f'capitan_lod{lod}.npz'), **m.arrays())
        print(f'lod{lod}', m.ntri(), 'tris')

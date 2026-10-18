# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/navio_curvo.py
#   →  $UX_OUT/cadena/navio_{gb,es}_lod{0,1}.npz, atlas_{gb,es}_base.png y, si existe ao_navio_{gb,es}.npy (blender_curvo.py bake),
#      atlas_{gb,es}.png con la oclusión horneada (ligero: segundos)
# Necesita $UX_OUT/piloto/navio-rig.json (el aparejo del juego; ver la cabecera de navio.py). No corre en la CI.
# Lámina de prueba de la cadena de arte (respuesta de realismo a Jonattan, 2026-10-18): el Navío de línea del piloto (D80)
# con curvas (curvo.py), castillos que son parte del casco, popa con caída y espejo abombado, galerías redondeadas, cada
# superficie con su sitio en el atlas y los colores más propios de cada familia:
#   británica: casco azul marino con las 2 franjas de portas en blanco, interior de la borda en rojo (como en la Armada
#     de la época) y la Union Jack en la popa; deja el negro, que es el color del pirata (el «en contra» de D80);
#   española: casco rojo con las franjas en amarillo oro, la bandera rojigualda en la popa y la cruz de Borgoña en las
#     velas (la de D80).
# Las velas siguen claras (AD-10) y la silueta de clase no cambia (AD-37): 42 × 11,2 m, 3 palos, 2 franjas de portas.
import json, math, os, random, sys
HERE_S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE_S, '..', 'laminas')); sys.path.insert(0, HERE_S)
sys.dont_write_bytecode = True
import rutas as RT
import curvo as CV
import navio as NV  # la cruz de Borgoña sobre las velas (emblem) y las franjas de portas (BANDS)
import numpy as np
from PIL import Image, ImageDraw
OUT = os.path.join(RT.OUT, 'cadena'); os.makedirs(OUT, exist_ok=True)
RIG = os.environ.get('UX_RIG_NAVIO', os.path.join(RT.OUT, 'piloto', 'navio-rig.json'))
L, B, F, D, RAIL = 42.0, 11.2, 3.6, 1.9, 1.2
V_TOP, V_BOT = 10.4, -2.2
TIERS = {'gb': [dict(kind='aft', edge=-9.5, h=1.6, ramp=2.4), dict(kind='aft', edge=-14.5, h=3.0, ramp=1.6), dict(kind='fore', edge=12.0, h=1.2, ramp=2.4)],
         'es': [dict(kind='aft', edge=-9.5, h=2.0, ramp=2.4), dict(kind='aft', edge=-13.5, h=3.8, ramp=1.6), dict(kind='aft', edge=-17.2, h=5.0, ramp=1.2),
                dict(kind='fore', edge=12.0, h=1.6, ramp=2.4)]}
AT = CV.Atlas({'hull': (0, 0, 1024, 320), 'deck': (0, 320, 1024, 256), 'inner': (0, 576, 1024, 64),
               'q0': (0, 640, 384, 192), 'q1': (384, 640, 192, 192), 'q2': (576, 640, 192, 192), 'stern': (768, 640, 256, 384),
               'fc': (0, 832, 320, 192), 'gal': (320, 832, 128, 128), 'bw0': (448, 832, 160, 48), 'bw1': (448, 880, 160, 48),
               'bw2': (448, 928, 160, 48), 'bw3': (448, 976, 160, 48), 'flag': (608, 832, 160, 96), 'white': (624, 976, 16, 16)})
PAL = {'gb': dict(hull='#1E3557', band='#E9E2CF', wale='#100E0C', port='#100E0C', port_edge='#5A6A80', bottom='#9A5B33', inner='#9E2B1E',
                  rail='#E9E2CF', trim='#D9A84A', window='#FFE9A8', wall='#1E3557', lid_out='#E9E2CF'),
       'es': dict(hull='#9B2A1E', band='#E0B23A', wale='#5A140E', port='#140E0A', port_edge='#E0B23A', bottom='#3A2416', inner='#7A4A1E',
                  rail='#D9A93F', trim='#D9A93F', window='#FFE9A8', wall='#9B2A1E', lid_out='#E0B23A')}


def hull_of(fam): return CV.Hull(L, B, F, D, RAIL, 'standard', y_m=1.35, T=0.09, tiers=TIERS[fam], H_T=3.45)


def rig(m, lod):
    d = json.load(open(RT.need(RIG, 'navio-rig.json (ver la cabecera de navio.py)')))[f'lod{lod}']
    P = np.array(d['pos']).reshape(-1, 3, 3); C = np.array(d['col']).reshape(-1, 3, 3); Rm = np.array(d['rim']).reshape(-1, 3)
    gunport = CV.hexlin('#1A1410'); w = AT.white
    for p, c, r in zip(P, C, Rm):
        if r[0] > 0.5 or np.abs(c[0] - gunport).max() < 1e-3: continue  # el casco, los castillos y las portas van en la textura
        m.p += [tuple(v) for v in p]; m.t += [w] * 3; m.c += [tuple(x) for x in c]; m.r += [0.0] * 3; m.b += [0] * 3


def build(fam, lod):
    H = hull_of(fam); m = CV.Mesh(AT); pal = PAL[fam]; aft = [t for t in H.tiers if t['kind'] == 'aft']; fore = [t for t in H.tiers if t['kind'] == 'fore'][0]
    zs = H.stations(29) if lod == 0 else H.stations(9, fr=(0.0, 1.0))
    secs = CV.build_hull(m, H, zs, 5 if lod == 0 else 3, 3 if lod == 0 else 1, V_TOP, V_BOT, pal['rail'])
    CV.build_stern(m, H, secs[0], 6 if lod == 0 else 2)
    # cubiertas: la principal en el combés y una por castillo, a su alto y con su región
    CV.build_deck(m, H, zs, 'deck', aft[0]['edge'], fore['edge'], 0.0, 11.6)
    for k, t in enumerate(aft):
        z_aft = aft[k + 1]['edge'] if k + 1 < len(aft) else -L / 2; z_front = t['edge']  # bajo el piso de encima no se ve
        CV.build_deck(m, H, zs, f'q{k}', z_aft, z_front, t['h'], 11.6)
        lo = aft[k - 1]['h'] if k else 0.0
        xl, xh, yl, yh = CV.build_wall(m, H, f'bw{k}', z_front, lo, t['h'], +1, ncol=6 if lod == 0 else 2)
        if lod == 0:  # barandilla del borde del castillo, sobre el mamparo
            CV.cuboid(m, 0, yh + 0.45, z_front + 0.15, 2 * xh - 0.1, 0.9, 0.14, pal['rail'], rim=1.0)
    CV.build_deck(m, H, zs, 'fc', fore['edge'], L / 2, fore['h'], 11.6)
    xl, xh, yl, yh = CV.build_wall(m, H, 'bw3', fore['edge'], 0.0, fore['h'], -1, ncol=6 if lod == 0 else 2)
    if lod == 0:
        CV.cuboid(m, 0, yh + 0.45, fore['edge'] - 0.15, 2 * xh - 0.1, 0.9, 0.14, pal['rail'], rim=1.0)
        # borda interior del espejo, sobre la cubierta más alta de popa
        zt = -L / 2 + H.tb; yd_ = H.y0(zt) + aft[-1]['h']; yt = H.top(zt); xs = H.x_at(zt, yt) - H.tb
        m.solid(H.warp(-xs, yd_, zt), H.warp(xs, yd_, zt), H.warp(xs, yt, zt), H.warp(-xs, yt, zt), pal['inner'], 1.0)
        CV.build_gallery(m, H, -20.4, -16.6, H.y0(-18) + 0.3, H.top(-18) - 0.7, 0.6 if fam == 'es' else 0.45, pal['trim'])
        details(m, H, fam, pal)
        n0 = len(m.t); NV.emblem(m, fam, lod)
        m.t[n0:] = [AT.white] * (len(m.t) - n0)  # emblem() pone el texel blanco del atlas de navio.py, que aquí es la popa
    ensign(m, H, fam)
    rig(m, lod)
    return m, H


def details(m, H, fam, pal):
    dark, wood, iron = '#2A2018', '#6B4426', '#26282B'
    gold = pal['trim']; aft = [t for t in H.tiers if t['kind'] == 'aft']; fore = [t for t in H.tiers if t['kind'] == 'fore'][0]
    # mesas de guarnición a la altura de la regala, por fuera de la curva, y obenques hasta la cofa
    for mz, top in ((12.5, 12.8), (1.0, 13.4), (-11.5, 11.0)):
        yc = H.top(mz) - 0.3; a = H.x_at(mz, yc)
        for side in (1, -1):
            x0, x1 = side * a, side * (a + 0.7)
            m.solid((x0, yc, mz - 3), (x1, yc, mz - 3), (x1, yc, mz + 3), (x0, yc, mz + 3), '#3A2618', 0.0)
            for k in range(5):
                zz = mz - 2.6 + 1.3 * k; p = np.array([side * (a + 0.6), yc, zz]); q = np.array([side * 0.9, top, mz])
                dv = q - p; dv /= np.linalg.norm(dv); n = np.cross(dv, [0, 0, 1]); n = n / (np.linalg.norm(n) + 1e-9) * 0.05
                m.solid(tuple(p - n), tuple(p + n), tuple(q + n), tuple(q - n), dark, 0.0)
    # 2 botes en el combés y el cabrestante (cubierta principal)
    for bx in (-1.7, 1.7):
        NV.boat(m, bx, H.y0(6.5) + 1.25, 6.5, 7.0, 1.9, '#2A3550' if fam == 'gb' else '#5A3A22', '#4A3424', gold)
        for zz in (4.5, 8.5): CV.cuboid(m, bx, H.y0(zz) + 0.25, zz, 1.4, 0.5, 0.3, wood)
    yc = H.y0(-5.5); CV.prism(m, (0, yc, -5.5), (0, yc + 1.1, -5.5), 0.6, 8, wood)
    for k in range(4):
        a = math.pi / 4 * k; CV.prism(m, (1.5 * math.cos(a), yc + 0.85, -5.5 + 1.5 * math.sin(a)), (-1.5 * math.cos(a), yc + 0.85, -5.5 - 1.5 * math.sin(a)), 0.06, 4, wood)
    # carronadas en el alcázar y el castillo de proa, asomando por la borda
    for side in (1, -1):
        for zz in (-11.0, -12.6, 13.5, 16.0):
            h = H.deck_h(zz); yd_ = H.y0(zz) + h; half = H.x_at(zz, yd_ + 0.5) - H.tb
            CV.cuboid(m, side * (half - 0.9), yd_ + 0.2, zz, 0.9, 0.4, 1.0, '#5A3A22')
            CV.prism(m, (side * (half - 1.3), yd_ + 0.5, zz), (side * (half + 0.15), yd_ + 0.5, zz), 0.16, 6, iron)
    # timón en el alcázar, campana en el castillo de proa
    zw = -12.0; yw = H.y0(zw) + aft[0]['h'] + 1.0
    CV.prism(m, (-0.45, yw, zw), (0.45, yw, zw), 0.75, 8, wood)
    yb_ = H.y0(13.0) + fore['h']; CV.cuboid(m, 0, yb_ + 0.6, 13.0, 1.0, 1.2, 0.8, wood, top=gold)
    # faroles de popa en el coronamiento (los españoles, más grandes)
    fs = 1.3 if fam == 'es' else 1.0
    for lx in (-2.4, 0.0, 2.4):
        zl = -20.6; yt = H.top(zl); b0 = H.warp(lx, yt, zl); b1 = H.warp(lx, yt + 0.5 * fs, zl)
        CV.prism(m, b0, b1, 0.12, 4, wood)
        c = H.warp(lx, yt + 0.95 * fs, zl); CV.cuboid(m, c[0], c[1], c[2], 0.55 * fs, 0.9 * fs, 0.55 * fs, '#FFE9A8', top=gold)
    # estays y brandales
    for (mz, mh), (tz, ty) in (((12.5, 30.0), (24.0, 9.0)), ((1.0, 34.0), (12.5, 13.0)), ((-11.5, 26.0), (1.0, 13.4)), ((12.5, 22.0), (28.0, 12.0))):
        CV.prism(m, (0, mh - 0.6, mz), (0, ty, tz), 0.06, 4, dark)
    for mz, mh in ((12.5, 30.0), (1.0, 34.0), (-11.5, 26.0)):
        zb = mz - 6
        for side in (1, -1): CV.prism(m, (side * 0.3, mh - 1.0, mz), (side * (H.x_at(zb, H.top(zb)) + 0.3), H.top(zb), zb), 0.05, 4, dark)
    # tapas de porta abiertas en la batería alta (bisagra arriba, 55°; interior rojo)
    for vb, vt, pz in NV.BANDS[1:]:
        for z in pz:
            ytop = (vb + vt) / 2 + 0.3 + H.sheer(z); x = H.x_at(z, ytop)
            for side in (1, -1):
                w2, lh, ang = 0.42, 0.62, math.radians(55)
                h0 = (side * x, ytop, z - w2); h1 = (side * x, ytop, z + w2)
                e0 = (side * (x + lh * math.sin(ang)), ytop - lh * math.cos(ang), z - w2); e1 = (e0[0], e0[1], z + w2)
                m.solid(h0, h1, e1, e0, pal['lid_out'], 0.0)
                o2 = 0.03 * side; m.solid((h0[0] + o2, h0[1], h0[2]), (e0[0] + o2, e0[1], e0[2]), (e1[0] + o2, e1[1], e1[2]), (h1[0] + o2, h1[1], h1[2]), '#9E2B1E', 0.0)
    # mascarón
    z = 20.6; y = H.y0(20.6) - 0.4
    m.solid((-0.35, y - 1.2, z), (0.35, y - 1.2, z), (0.35, y, z + 1.0), (-0.35, y, z + 1.0), gold, 1.0)
    m.solid((-0.35, y, z + 1.0), (0.35, y, z + 1.0), (0.3, y + 0.8, z + 1.3), (-0.3, y + 0.8, z + 1.3), gold, 1.0)


def ensign(m, H, fam):
    """Asta en el coronamiento y bandera de la familia (región flag), de 3,6 × 2,2 m, en las 2 caras."""
    z = -21.2; y0 = H.top(z) + 0.2; ytop = y0 + 5.0
    b0, b1 = H.warp(0, y0, z), H.warp(0, ytop, z)
    CV.prism(m, b0, b1, 0.07, 4, '#3A2618')
    w, h = 3.6, 2.2; zx = b1[2]
    for off in (0.02, -0.02):
        p = [(off, ytop, zx), (off, ytop, zx - w), (off, ytop - h, zx - w), (off, ytop - h, zx)]
        m.quad(*p, AT.uv('flag', 0, 0), AT.uv('flag', 1, 0), AT.uv('flag', 1, 1), AT.uv('flag', 0, 1), rim=0.0, bk=0)


# ---- atlas
def paint(fam, seed=7):
    rng = random.Random(seed); pal = PAL[fam]; img = Image.new('RGB', (AT.A, AT.A), (255, 255, 255)); d = ImageDraw.Draw(img)
    Hc = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    H = hull_of(fam)
    # costado (hull): v = alto sobre la flotación corregido por el arrufo
    x0, y0_, w, h = AT.R['hull']
    ry = lambda v: AT.px('hull', 0, (V_TOP - v) / (V_TOP - V_BOT))[1]
    rx = lambda z: AT.px('hull', (z + L / 2) / L, 0)[0]
    d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['hull']))
    d.rectangle((x0, ry(0.0), x0 + w, y0_ + h), fill=Hc(pal['bottom']))
    for (vb, vt, pz) in NV.BANDS:
        d.rectangle((x0, ry(vt), x0 + w, ry(vb)), fill=Hc(pal['band']))
        for v in (vt, vb): d.rectangle((x0, ry(v) - 2, x0 + w, ry(v) + 1), fill=Hc(pal['wale']))
        for z in pz:
            pw, ph = 0.8 * 1024 / L / 2, 0.6 * (ry(0) - ry(1)) / 2; cy = ry((vb + vt) / 2)
            d.rectangle((rx(z) - pw, cy - ph, rx(z) + pw, cy + ph), fill=Hc(pal['port']))
            d.rectangle((rx(z) - pw - 1, cy - ph - 2, rx(z) + pw + 1, cy - ph), fill=Hc(pal['port_edge']))
    # obra muerta de los castillos (por encima de la regala de la maestra): ventanas por piso y molduras que siguen la regala
    vr = F + RAIL
    for t in [t for t in H.tiers if t['kind'] == 'aft']:
        za, zf = -L / 2, t['edge']; yb, yt = vr + t['h'] - 1.7, vr + t['h'] - 0.6
        for z in np.arange(za + 0.9, zf - 0.6, 1.25):
            d.rectangle((rx(z) - 9, ry(yt) - 1, rx(z) + 9, ry(yb) + 1), fill=Hc(pal['trim']))
            d.rectangle((rx(z) - 7, ry(yt), rx(z) + 7, ry(yb)), fill=Hc(pal['window']))
    zz = np.linspace(-L / 2, L / 2, 600)
    for dv, col, wd in ((0.0, pal['trim'], 4), (-0.5, pal['trim'], 2)):  # moldura de oro bajo la regala, siguiendo su curva
        pts = [(rx(z), ry(vr + H.rail_rise(z) + dv - 0.15)) for z in zz]; d.line(pts, fill=Hc(col), width=wd)
    if fam == 'es':  # friso de volutas doradas en la moldura alta y tallas en la obra muerta de popa
        for z in np.arange(-L / 2, L / 2, 0.5):
            yy = ry(vr + H.rail_rise(z) - 0.42); d.ellipse((rx(z) - 3, yy - 3, rx(z) + 3, yy + 3), outline=Hc(pal['trim']))
        for k in range(260):
            z = rng.uniform(-L / 2, -10.5); v = rng.uniform(vr, vr + H.rail_rise(z)); r = rng.choice((1, 2))
            d.ellipse((rx(z) - r, ry(v) - r, rx(z) + r, ry(v) + r), fill=(235, 190, 80))
    else:  # filete blanco a media altura de la obra muerta de popa
        pts = [(rx(z), ry(vr + 0.5 * H.rail_rise(z))) for z in zz if H.rail_rise(z) > 0.6]
        if len(pts) > 1: d.line(pts, fill=Hc(pal['band']), width=2)
    # tablazón: líneas cada 0,25 m con juntas a tope y un leve cambio de tono por tabla
    arr = np.asarray(img).astype(float)
    for v in np.arange(V_BOT, V_TOP, 0.25):
        a_, b_ = int(ry(v + 0.25)), int(ry(v))
        xx = 0
        while xx < 1024:
            seg = rng.randint(70, 150); arr[a_:b_, xx:xx + seg] *= rng.uniform(0.95, 1.05); xx += seg
        arr[b_ - 1:b_, :] *= 0.86
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(img)
    d.line((x0, ry(0.02), x0 + w, ry(0.02)), fill=(230, 225, 210), width=2)
    # cubiertas: tablas a lo largo de Z en 3 tonos (D62), juntas y escotillas
    tones = [(225, 177, 123), (189, 141, 89), (151, 107, 57)]
    for reg in ('deck', 'q0', 'q1', 'q2', 'fc'):
        x0, y0_, w, h = AT.R[reg]; n = max(6, int(h / 11)); perm = [0, 1, 2]
        for i in range(n):
            if i % 3 == 0: rng.shuffle(perm)
            ya, yb2 = y0_ + i * h / n, y0_ + (i + 1) * h / n
            d.rectangle((x0, ya, x0 + w, yb2), fill=tones[perm[i % 3]]); d.line((x0, yb2, x0 + w, yb2), fill=(110, 80, 50))
            xx = x0 + rng.randint(0, 40)
            while xx < x0 + w: d.line((xx, ya, xx, yb2), fill=(130, 95, 60)); xx += rng.randint(50, 110)
    x0, y0_, w, h = AT.R['deck']; zr = lambda z: x0 + (z + 9.5) / 21.5 * w
    for zc in (-4.5, 6.0, -7.8):
        xa, xb = zr(zc - 1.4), zr(zc + 1.4); ya, yb2 = y0_ + 0.39 * h, y0_ + 0.61 * h
        d.rectangle((xa, ya, xb, yb2), fill=(80, 56, 34))
        for gx in np.arange(xa + 4, xb, 8): d.line((gx, ya, gx, yb2), fill=(140, 100, 60))
        for gy in np.arange(ya + 4, yb2, 8): d.line((xa, gy, xb, gy), fill=(140, 100, 60))
    # interior de la borda y mamparos
    x0, y0_, w, h = AT.R['inner']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['inner']))
    d.rectangle((x0, y0_, x0 + w, y0_ + 4), fill=Hc(pal['rail']))
    for k in range(4):
        x0, y0_, w, h = AT.R[f'bw{k}']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['wall']))
        d.rectangle((x0, y0_, x0 + w, y0_ + 5), fill=Hc(pal['trim']))
        for xx in range(x0 + 14, x0 + w - 10, 26):  # puertas y ventanas del mamparo
            d.rectangle((xx, y0_ + 14, xx + 10, y0_ + h - 8), fill=Hc(pal['trim'])); d.rectangle((xx + 2, y0_ + 16, xx + 8, y0_ + h - 10), fill=(60, 40, 25))
    # galerías: ventanas en fila sobre el color de la obra muerta
    x0, y0_, w, h = AT.R['gal']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['wall']))
    for yy in (0.2, 0.55):
        d.rectangle((x0, y0_ + (yy - 0.06) * h, x0 + w, y0_ + (yy + 0.3) * h), fill=Hc(pal['trim']))
        for xx in np.arange(x0 + 6, x0 + w - 8, 18): d.rectangle((xx, y0_ + yy * h, xx + 11, y0_ + (yy + 0.24) * h), fill=Hc(pal['window']))
    # espejo de popa: 3 filas de ventanas, molduras y cartela; la española, tallas doradas
    x0, y0_, w, h = AT.R['stern']; ytop = H.top(-L / 2); ybot = -H.prof(-L / 2)[3] * D
    sy = lambda y: AT.px('stern', 0, (ytop - y) / (ytop - ybot))[1]; sx = lambda x: AT.px('stern', 0.5 + x / (2 * H.hb), 0)[0]
    d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(pal['wall'])); d.rectangle((x0, sy(0), x0 + w, y0_ + h), fill=Hc(pal['bottom']))
    y_ = H.y0(-L / 2)  # una fila de ventanas por piso (la cámara baja y cada cubierta de popa) bajo el coronamiento
    lv = [0.0] + [t['h'] for t in H.tiers if t['kind'] == 'aft']
    rows_ = [(y_ - 1.3, y_ - 0.6)] + [(y_ + v + 0.45, y_ + v + 1.15) for v in lv if y_ + v + 1.15 < ytop - 0.3]
    for (ya, yb_) in rows_:
        d.rectangle((x0, sy(yb_ + 0.3), x0 + w, sy(ya - 0.3)), fill=Hc(pal['trim']))
        for xx in np.arange(-3.9, 4.0, 1.1):
            d.rectangle((sx(xx - 0.34), sy(yb_), sx(xx + 0.34), sy(ya)), fill=Hc(pal['window'])); d.rectangle((sx(xx - 0.34), sy(yb_), sx(xx + 0.34), sy(ya)), outline=(70, 45, 20))
    d.ellipse((sx(-1.0), sy(y_ + 0.5), sx(1.0), sy(y_ - 0.9)), fill=Hc(pal['trim']), outline=(70, 45, 20))  # cartela, sin escudo
    if fam == 'es':
        for k in range(320):
            xx = rng.uniform(-5.4, 5.4); yy = rng.uniform(y_ - 1.0, ytop - 0.3); r = rng.choice((1, 2))
            d.ellipse((sx(xx) - r, sy(yy) - r, sx(xx) + r, sy(yy) + r), fill=(235, 190, 80))
    # bandera: Union Jack (británica) o rojigualda (española)
    x0, y0_, w, h = AT.R['flag']
    if fam == 'gb':
        blue, red, white = (1, 33, 105), (200, 16, 46), (255, 255, 255)
        d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=blue)
        for (a0, b0, a1, b1) in ((0, 0, 1, 1), (1, 0, 0, 1)):
            d.line((x0 + a0 * w, y0_ + b0 * h, x0 + a1 * w, y0_ + b1 * h), fill=white, width=20)
            d.line((x0 + a0 * w, y0_ + b0 * h, x0 + a1 * w, y0_ + b1 * h), fill=red, width=7)
        d.rectangle((x0 + 0.42 * w, y0_, x0 + 0.58 * w, y0_ + h), fill=white); d.rectangle((x0, y0_ + 0.37 * h, x0 + w, y0_ + 0.63 * h), fill=white)
        d.rectangle((x0 + 0.455 * w, y0_, x0 + 0.545 * w, y0_ + h), fill=red); d.rectangle((x0, y0_ + 0.42 * h, x0 + w, y0_ + 0.58 * h), fill=red)
    else:
        d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=(170, 21, 27)); d.rectangle((x0, y0_ + 0.25 * h, x0 + w, y0_ + 0.75 * h), fill=(241, 191, 0))
    x0, y0_, w, h = AT.R['white']; d.rectangle((x0 - 4, y0_ - 4, x0 + w + 4, y0_ + h + 4), fill=(255, 255, 255))
    return img


def compose(base, ao_path, white, strength=0.85):
    """Atlas final = base × (1 − s·(1 − AO)) en luz lineal; fuera de lo horneado, AO = 1 (lo deja blanco el bake).
    ao_path: el .npy de blender_curvo.py (float, filas de arriba abajo); white: el texel blanco del atlas, que queda blanco."""
    a = np.asarray(base, float) / 255; lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    im = Image.fromarray(np.load(ao_path).astype(np.float32), 'F')
    if im.size != base.size: im = im.resize(base.size, Image.BILINEAR)  # el ensayo hornea a menos resolución
    ao = np.clip(np.asarray(im, float), 0, 1)
    lin = lin * (1 - strength * (1 - ao))[..., None]
    s = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    out = Image.fromarray(np.clip(np.round(s * 255), 0, 255).astype(np.uint8))
    x0, y0_, w, h = white; ImageDraw.Draw(out).rectangle((x0 - 4, y0_ - 4, x0 + w + 4, y0_ + h + 4), fill=(255, 255, 255))
    return out


if __name__ == '__main__':
    for fam in ('gb', 'es'):
        base = paint(fam); base.save(os.path.join(OUT, f'atlas_{fam}_base.png'))
        ao = os.path.join(OUT, f'ao_navio_{fam}.npy')
        if os.path.exists(ao): compose(base, ao, AT.R['white']).save(os.path.join(OUT, f'atlas_{fam}.png')); print(fam, 'atlas con oclusión')
        for lod in (0, 1):
            m, H = build(fam, lod)
            np.savez(os.path.join(OUT, f'navio_{fam}_lod{lod}.npz'), **m.arrays())
            print(fam, f'lod{lod}', m.ntri(), 'tris')

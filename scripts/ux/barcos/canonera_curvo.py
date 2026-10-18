# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/canonera_curvo.py
#   →  $UX_OUT/cadena/canonera_lod{0,1}.npz, atlas_canonera_base.png y, si existe ao_canonera.npy (blender_curvo.py
#      bake), atlas_canonera.png con la oclusión horneada (ligero: segundos)
# Necesita $UX_OUT/cadena/canonera-rig.json: la Cañonera de hoy del generador del juego, que exporta
# scripts/ux/laminas/code/export-rig-npc.ts en la copia del código de 4b4c688 de la cabecera de galeon.py:
#   cp scripts/ux/laminas/code/export-rig-npc.ts $G/ && (cd $G && npx tsx export-rig-npc.ts gunboat "$UX_OUT/cadena/canonera-rig.json")
# No corre en la CI.
# Lámina de prueba de la cadena de arte (respuesta de realismo, 2026-10-18; nota de Jonattan del I2, «más detalles en
# los barcos pirata, se ven muy planos»; producto eligió la Cañonera como el pirata de la lámina porque frena el
# candidato): la Cañonera (`npc_pirate_gunboat`, ASSET-SPEC §8.4) con el casco de curvo.py y textura. Conserva lo que la
# identifica (AD-28, D51): el casco negro con la franja roja, la cubierta clara con la batería encima (su media sigue en
# `#907C61`), el mortero, el palo único con las velas negras lisas y la bandera, que salen del generador del juego.
# Añade el detalle pintado que pide la nota: tablazón gastada con tablas cambiadas, la franja descascarillada, óxido
# bajo cada cañón, imbornales, una calavera en el espejo y, en cubierta, quemaduras alrededor del mortero, barriles de
# pólvora, balas apiladas y rollos de cabo.
import json, math, os, random, sys
HERE_S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE_S, '..', 'laminas')); sys.path.insert(0, HERE_S)
sys.dont_write_bytecode = True
import rutas as RT
import curvo as CV
import numpy as np
from PIL import Image, ImageDraw
OUT = os.path.join(RT.OUT, 'cadena'); os.makedirs(OUT, exist_ok=True)
L, B, F, D, RAIL = 28.0, 10.0, 1.5, 1.2, 0.9
V_TOP, V_BOT = 2.6, -1.4
AT = CV.Atlas({'hull': (0, 0, 1024, 192), 'deck': (0, 192, 1024, 320), 'inner': (0, 512, 1024, 64), 'stern': (0, 576, 256, 192),
               'bow': (256, 576, 256, 192)})
PAL = dict(hull='#2A2523', band='#B3261E', bottom='#1C1817', rail='#3A2A20', inner='#4A2016')
CANNON_Z = (-10.0, -6.0, -2.0, 2.0, 6.0, 10.0); MORTAR_Z = 3.5


def hull_of(): return CV.Hull(L, B, F, D, RAIL, 'flat', y_m=0.6, T=0.06, tiers=(), H_T=F + RAIL - 0.6, bulge=0.25, over=(0.42, 0.6, 0.08))


def rig_json(): return json.load(open(RT.need(os.path.join(OUT, 'canonera-rig.json'), 'canonera-rig.json (code/export-rig-npc.ts gunboat)')))


def rig(m, lod):
    d = rig_json()[f'lod{lod}']
    P = np.array(d['pos']).reshape(-1, 3, 3); C = np.array(d['col']).reshape(-1, 3, 3); Rm = np.array(d['rim']).reshape(-1, 3)
    w = AT.white
    for p, c, r in zip(P, C, Rm):
        if r[0] > 0.5: continue  # el casco y la cubierta van con textura; la batería, el mortero y el aparejo se quedan
        m.p += [tuple(v) for v in p]; m.t += [w] * 3; m.c += [tuple(x) for x in c]; m.r += [0.0] * 3; m.b += [0] * 3


def build(lod):
    H = hull_of(); m = CV.Mesh(AT)
    zs = H.stations(21) if lod == 0 else H.stations(7)  # 21 estaciones y 2 tramos sobre la manga máxima: ≤ 2 000 (NPC)
    secs = CV.build_hull(m, H, zs, 2, 2 if lod == 0 else 1, V_TOP, V_BOT, PAL['rail'])
    CV.build_stern(m, H, secs[0], 4 if lod == 0 else 2)
    CV.build_stern(m, H, secs[-1], 4 if lod == 0 else 2, region='bow', aft=False)
    CV.build_deck(m, H, zs, 'deck', -L / 2, L / 2, 0.0, 10.4)
    if lod == 0: details(m, H)
    rig(m, lod)
    return m, H


def details(m, H):
    wood, dark = '#5A3A22', '#2A2018'
    # barriles de pólvora junto al mortero, una caja de balas entre cada pareja de cañones y rollos de cabo
    for (x, z) in ((1.6, 5.4), (-1.6, 5.4), (1.4, 1.6)):
        CV.barrel(m, x, H.y0(z) + 0.4, z, 0.38, 0.8, '#5A3A22', '#1C1410')
    for z in (-8.0, 0.0, 8.0):
        for side in (1, -1):
            x = side * (H.x_at(z, H.y0(z)) - H.tb - 1.9)
            CV.cuboid(m, x, H.y0(z) + 0.15, z, 0.5, 0.3, 0.8, '#3A2618', top='#26282B', rim=0.0)
    for (x, z) in ((-2.6, -7.6), (2.6, -11.0)):
        CV.prism(m, (x, H.y0(z) + 0.02, z), (x, H.y0(z) + 0.2, z), 0.45, 8, '#8A7A5A')
    # timón a popa y farol en el coronamiento
    zw = -11.6; yw = H.y0(zw) + 0.7; CV.prism(m, (-0.3, yw, zw), (0.3, yw, zw), 0.55, 8, wood)
    zl = -13.8; yt = H.top(zl); b0 = H.warp(0, yt, zl); b1 = H.warp(0, yt + 0.5, zl)
    CV.prism(m, b0, b1, 0.07, 4, dark); c = H.warp(0, yt + 0.8, zl); CV.cuboid(m, c[0], c[1], c[2], 0.4, 0.55, 0.4, '#FFD27A', top=dark)


def paint(seed=17):
    rng = random.Random(seed); A = AT.A; img = Image.new('RGB', (A, A), (255, 255, 255)); d = ImageDraw.Draw(img)
    Hc = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    H = hull_of()
    x0, y0_, w, h = AT.R['hull']
    ry = lambda v: AT.px('hull', 0, (V_TOP - v) / (V_TOP - V_BOT))[1]
    rx = lambda z: AT.px('hull', (z + L / 2) / L, 0)[0]
    d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(PAL['hull'])); d.rectangle((x0, ry(0.0), x0 + w, y0_ + h), fill=Hc(PAL['bottom']))
    # tablazón gastada: cada tabla con su tono, alguna cambiada (más clara) y juntas oscuras
    arr = np.asarray(img).astype(float)
    for v in np.arange(V_BOT, V_TOP, 0.2):
        a_, b_ = int(ry(v + 0.2)), int(ry(v)); xx = 0
        while xx < A:
            seg = rng.randint(50, 130); f = 1.7 if rng.random() < 0.06 else rng.uniform(0.85, 1.18)
            arr[a_:b_, xx:xx + seg] *= f; arr[a_:b_, xx:xx + 1] *= 0.6; xx += seg
        arr[b_ - 1:b_, :] *= 0.7
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(img)
    # franja roja sin portas (D36: de 0,30·F a 0,55·F bajo el canto), descascarillada en los bordes y con desconchones
    vb, vt = F - 0.55 * F, F - 0.30 * F
    d.rectangle((x0, ry(vt), x0 + w, ry(vb)), fill=Hc(PAL['band']))
    for xx in range(0, A, 3):
        for v, sgn in ((vt, 1), (vb, -1)):
            if rng.random() < 0.45:
                k = rng.randint(1, 5); y = ry(v); d.rectangle((xx, min(y, y + sgn * k), xx + rng.randint(1, 5), max(y, y + sgn * k)), fill=Hc(PAL['hull']))
    for k in range(140):
        xx = rng.uniform(0, A); yy = rng.uniform(ry(vt) + 3, ry(vb) - 3); r = rng.uniform(1.5, 3.5)
        d.ellipse((xx - r, yy - r * 0.6, xx + r, yy + r * 0.6), fill=(70, 30, 26))
    # óxido bajo cada cañón (asoman por la borda) e imbornales a la altura de la cubierta
    for z in CANNON_Z:
        for k in range(9):
            xx = rx(z) + rng.uniform(-9, 9); y = ry(F + 0.1); d.line((xx, y, xx + rng.uniform(-2, 2), y + rng.uniform(14, 34)), fill=(112, 54, 30), width=2)
    for z in np.arange(-12.0, 12.5, 2.0):
        y = ry(F + 0.05); d.rectangle((rx(z) - 4, y - 3, rx(z) + 4, y + 2), fill=(12, 10, 9))
        d.line((rx(z), y + 2, rx(z) + rng.uniform(-2, 2), y + rng.uniform(10, 22)), fill=(58, 52, 46), width=2)
    d.line((x0, ry(0.03), x0 + w, ry(0.03)), fill=(70, 66, 58), width=3)
    for k in range(220): xx = rng.uniform(0, A); d.line((xx, ry(0.15), xx, ry(0.15) + rng.uniform(3, 9)), fill=(60, 70, 58))
    # cubierta clara (D36: 2 tonos alternos, media #907C61): tablas de 0,5 m, juntas, manchas y quemaduras del mortero
    x0, y0_, w, h = AT.R['deck']; tones = [Hc('#A28D72'), Hc('#7E6B51')]; n = 20
    for i in range(n):
        ya, yb2 = y0_ + i * h / n, y0_ + (i + 1) * h / n
        d.rectangle((x0, ya, x0 + w, yb2), fill=tones[i % 2]); d.line((x0, yb2, x0 + w, yb2), fill=(70, 56, 40))
        xx = x0 + rng.randint(0, 60)
        while xx < x0 + w: d.line((xx, ya, xx, yb2), fill=(92, 76, 56)); xx += rng.randint(60, 140)
    arr = np.asarray(img).astype(float)
    dz = lambda z: x0 + (z + L / 2) / L * w; dx = lambda x: y0_ + (0.5 - x / 10.4) * h
    yy, xx = np.mgrid[0:A, 0:A]
    for k in range(26):  # manchas de brea y de agua salada, sin cambiar la media de la cubierta más de lo que pesan
        cx, cy, r = rng.uniform(x0, x0 + w), rng.uniform(y0_, y0_ + h), rng.uniform(6, 16)
        mk = ((xx - cx) ** 2 / r ** 2 + (yy - cy) ** 2 / (0.6 * r) ** 2) < 1; arr[mk] *= 0.82
    cx, cy = dz(MORTAR_Z), dx(0.0); rr = np.hypot((xx - cx) / 1.0, (yy - cy) / 1.0)
    burn = np.clip(1 - (rr - 46) / 40, 0, 1) * ((yy >= y0_) & (yy < y0_ + h)); arr *= (1 - 0.45 * burn)[..., None]
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(img)
    for zc in (-4.0, 8.4):  # escotillas con enjaretado
        xa, xb = dz(zc - 1.0), dz(zc + 1.0); ya, yb2 = dx(0.9), dx(-0.9)
        d.rectangle((xa, ya, xb, yb2), fill=(60, 44, 30))
        for gx in np.arange(xa + 4, xb, 9): d.line((gx, ya, gx, yb2), fill=(120, 96, 66), width=2)
        for gy in np.arange(ya + 4, yb2, 9): d.line((xa, gy, xb, gy), fill=(120, 96, 66), width=2)
    # interior de la borda, espejo con calavera y tibias en hueso, y la proa
    x0, y0_, w, h = AT.R['inner']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(PAL['inner'])); d.rectangle((x0, y0_, x0 + w, y0_ + 4), fill=Hc(PAL['rail']))
    for reg, skull in (('stern', True), ('bow', False)):
        x0, y0_, w, h = AT.R[reg]; zend = -L / 2 if reg == 'stern' else L / 2
        ytop = H.top(zend); ybot = -H.prof(zend)[3] * D
        sy = lambda y: AT.px(reg, 0, (ytop - y) / (ytop - ybot))[1]; sx = lambda x: AT.px(reg, 0.5 + x / (2 * H.hb), 0)[0]
        d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc(PAL['hull'])); d.rectangle((x0, sy(0), x0 + w, y0_ + h), fill=Hc(PAL['bottom']))
        y_ = H.y0(zend); d.rectangle((x0, sy(y_ - 0.30 * F), x0 + w, sy(y_ - 0.55 * F)), fill=Hc(PAL['band']))
        for yv in np.arange(ybot, ytop, 0.2): d.line((x0, sy(yv), x0 + w, sy(yv)), fill=(22, 18, 16))
        if skull:
            bone = (232, 226, 208); cx, cy = sx(0), sy(y_ + 0.25); s = (sx(1) - sx(0)) * 0.42
            for a0, a1 in ((-1, 1), (1, -1)): d.line((cx - s * 1.1, cy + s * 0.2 * a0 + s * 0.9, cx + s * 1.1, cy + s * 0.2 * a1 + s * 0.9), fill=bone, width=max(2, int(s * 0.18)))
            d.ellipse((cx - s * 0.55, cy - s * 0.6, cx + s * 0.55, cy + s * 0.45), fill=bone)
            d.rectangle((cx - s * 0.32, cy + s * 0.3, cx + s * 0.32, cy + s * 0.62), fill=bone)
            for ex in (-0.22, 0.22): d.ellipse((cx + s * ex - s * 0.14, cy - s * 0.18, cx + s * ex + s * 0.14, cy + s * 0.1), fill=(20, 16, 14))
    x0, y0_, w, h = AT.R['white']; d.rectangle((x0 - 4, y0_ - 4, x0 + w + 4, y0_ + h + 4), fill=(255, 255, 255))
    return img


if __name__ == '__main__':
    import navio_curvo as NC  # compose(): el mismo atlas × oclusión que los Navíos
    base = paint(); base.save(os.path.join(OUT, 'atlas_canonera_base.png'))
    ao = os.path.join(OUT, 'ao_canonera.npy')
    if os.path.exists(ao): NC.compose(base, ao, AT.R['white']).save(os.path.join(OUT, 'atlas_canonera.png')); print('atlas con oclusión')
    for lod in (0, 1):
        m, H = build(lod)
        np.savez(os.path.join(OUT, f'canonera_lod{lod}.npz'), **m.arrays())
        print(f'lod{lod}', m.ntri(), 'tris')
    chk = rig_json()['check']
    print('perfil: máx |Δ cubierta| y |Δ semimanga| frente al juego', max(abs(H.y0(u * L) - s) for u, s, a in chk), max(abs(H.prof(u * L)[0] * B / 2 - a) for u, s, a in chk))

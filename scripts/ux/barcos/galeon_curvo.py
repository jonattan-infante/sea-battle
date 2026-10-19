# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/galeon_curvo.py
#   →  $UX_OUT/cadena/galeon_lod{0,1}.npz, atlas_galeon_base.png y, si existe ao_galeon.npy (blender_curvo.py galeon bake),
#      atlas_galeon.png y atlas_galeon_out.png, el de la entrega a 1024² (ligero: segundos)
# Necesita $UX_OUT/cadena/galleon-rig.json: el Galeón armado del generador del juego (code/export-rig-galeon2.ts). No corre
# en la CI.
# El Galeón del tesoro (`npc_merchant_galleon`, GDD §9, P2) con la receta de D91 que Jonattan aprobó con los Navíos (D88 v2):
# el casco curvo, la oclusión horneada, la luz de forma y la sombra, sobre la receta de ASSET-SPEC §8.4. Desde el 2026-10-18
# no lleva escolta y responde al fuego con 8 cañones por banda (ART-DIRECTION §10.1, «Sin escolta y armado»): la batería va
# a la vista, con las 8 portas en la franja de oro y las tapas abiertas. Lo pasivo lo dicen las velas crema a franjas azules
# y la bandera del Mercante, que salen del generador del juego como el aparejo y los cañones. Su riqueza: la popa alta de 2
# pisos con los costados de oro, galerías de 2 pisos, 3 faroles, la cartela azul del Mercante, la greca de volutas, la regala
# dorada y la carga en cubierta (4 cofres y uno abierto con oro). Reutiliza clase_curvo.py: registra el Galeón como una clase
# más (CLASES) con su paleta (PAL), le da el perfil lleno del juego con la proa cerrada y no le pone la bandera de familia.
import os, sys
HERE_S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE_S, '..', 'laminas')); sys.path.insert(0, HERE_S)
sys.dont_write_bytecode = True
import curvo as CV
import navio_curvo as NCV
import clase_curvo as CC
import numpy as np
from PIL import Image, ImageDraw
OUT, AT = CC.OUT, CC.AT
ID = 'galeon'
# el perfil `full` del juego (ship-geometry.ts, PROFILES.full; el de galeon.py) con la proa cerrada, como los perfiles de
# curvo.py: allí la roda acaba en manga 0 (build_hull la estrecha hacia la proa) y en el juego en 0,3 / 0,18 de la semimanga
CV.PROFILES.setdefault('full_curvo', [(-0.5, 0.92, 0.8, 1.4, 0.45), (-0.4, 1.0, 0.93, 1.22, 0.85), (-0.25, 1.0, 0.97, 1.05, 1.0),
                                      (0.0, 1.0, 0.97, 1.0, 1.0), (0.2, 1.0, 0.95, 1.04, 1.0), (0.36, 0.88, 0.78, 1.15, 0.9), (0.5, 0.0, 0.0, 1.3, 0.5)])
# la madera del Mercante, la franja y la regala de oro (ART-DIRECTION §10.1); las tapas abiertas, de oro por fuera y rojas
# por dentro, como la batería alta del Navío
CC.PAL[ID] = dict(hull='#6E4A2C', band='#D9A93F', wale='#3A2416', port='#140E0A', port_edge='#9C7426', bottom='#3A2416',
                  inner='#7A4A1E', rail='#D9A93F', trim='#D9A93F', window='#FFE9A8', wall='#D9A93F', lid_out='#D9A93F')
# ASSET-SPEC §8.4: 36 × 12 × 3,4 × 1,8 m, railH 1,2; la popa de 2 pisos (Box de z −17,5 a −8,5 y de −17,55 a −12,05) y
# el castillo de proa (de +10,5 a +16,5); la franja de oro de 1,0 m centrada en la línea de cañones (y = 1,95)
CC.CLASES['galleon'] = dict(
    sid='npc_merchant_galleon', L=36.0, B=12.0, F=3.4, D=1.8, RAIL=1.2,
    tiers=(dict(kind='aft', edge=-8.5, h=2.0, ramp=2.0), dict(kind='aft', edge=-12.05, h=4.0, ramp=2.0),
           dict(kind='fore', edge=10.5, h=1.4, ramp=2.0)),
    house=None, band=(1.45, 2.45), lids=True, boats=(), capstan=7.6, carronades=(), wheel=-10.4, bell=9.6, lanterns=3,
    gallery=(-17.6, -14.6), figure=True, hatches=(5.0,), emblems=(), A=1024)
_ensign, _hull_of = CC.ensign, CC.hull_of
CC.ensign = lambda m, H, cls, fam: None if cls == 'galleon' else _ensign(m, H, cls, fam)  # lleva la bandera del Mercante


def hull_of(cls, fam):
    """El de clase_curvo.py con el perfil lleno del Galeón (`full_curvo`; allí, `standard`): la misma caída de popa (caja ≤ 1,6 % sobre L)."""
    if cls != 'galleon': return _hull_of(cls, fam)
    c = CC.CLASES[cls]; L, B, F, D, RAIL = c['L'], c['B'], c['F'], c['D'], c['RAIL']
    bulge = max(0.12, 0.25 * L / 42); over_y = 0.42 * F
    kw = dict(y_m=0.375 * F, T=0.07, tiers=CC.tiers_of(c, fam), bulge=bulge)
    H0 = CV.Hull(L, B, F, D, RAIL, 'full_curvo', over=(0.42, over_y, 0.0), **kw)
    k = max(0.0, (0.016 * L - bulge) / max(H0.top(-L / 2) - over_y, 0.5))
    return CV.Hull(L, B, F, D, RAIL, 'full_curvo', over=(0.42, over_y, k), **kw)


CC.hull_of = hull_of
_rig_json = CC.rig_json


def rig_json(cls):
    """El de clase_curvo.py. En el Galeón, las 2 latinas (mesana y contramesana) llevan `topY` = 0,8·h para los obenques
    de details(): sin él irían al 0,62·h, y en la contramesana, que nace sobre el 2.º piso de la popa, quedaría bajo la regala."""
    d = _rig_json(cls)
    if cls == 'galleon':
        for mt in d['recipe']['masts']:
            if mt.get('lateen') and not mt.get('topY'): mt['topY'] = round(0.8 * mt['h'], 2)
    return d


CC.rig_json = rig_json
CHEST, BANDS, GOLD = '#6A2E17', '#D9A93F', '#F2C14E'


def cargo(m, H):
    """La carga a la vista entre la mayor y la mesana: 4 cofres rojo oscuro con 2 flejes y el canto de oro, y 1 abierto
    con la tapa levantada y el oro asomando. En los 2 LOD: es un rasgo del Galeón frente al Navío español (AC-194 d)."""
    for x, z in ((-1.6, -2.6), (1.6, -2.6), (-1.6, -4.6), (1.6, -4.6)):
        y = H.y0(z); CV.cuboid(m, x, y + 0.55, z, 1.6, 1.1, 1.1, CHEST, top=CHEST)
        for dz in (-0.32, 0.32): CV.cuboid(m, x, y + 0.56, z + dz, 1.64, 1.14, 0.12, BANDS)
    z = -6.4; y = H.y0(z)
    CV.cuboid(m, 0.0, y + 0.45, z, 1.6, 0.9, 1.1, CHEST, top=GOLD)  # el abierto: el oro a ras de la boca
    CV.cuboid(m, 0.0, y + 0.95, z - 0.62, 1.6, 0.9, 0.1, CHEST)     # la tapa, de pie hacia popa
    CV.cuboid(m, 0.0, y + 0.98, z + 0.05, 0.9, 0.16, 0.6, GOLD)     # el montón de oro


def paint():
    """El atlas de clase_curvo.paint con la paleta del Galeón, más: los costados de la popa de oro con sus ventanas, la
    greca de volutas bajo la regala, la cartela azul del Mercante en el espejo y el azul del Mercante en la región flag."""
    img = CC.paint('galleon', ID); d = ImageDraw.Draw(img); c = CC.CLASES['galleon']; L, F, RAIL = c['L'], c['F'], c['RAIL']
    H = CC.hull_of('galleon', ID); V_TOP, V_BOT = CC.vrange(c, ID)
    ry = lambda v: AT.px('hull', 0, (V_TOP - v) / (V_TOP - V_BOT))[1]; rx = lambda z: AT.px('hull', (z + L / 2) / L, 0)[0]
    Hc = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)); vr = F + RAIL
    aft = [t for t in H.tiers if t['kind'] == 'aft']
    d.rectangle((rx(-L / 2), ry(vr + max(t['h'] for t in aft) + 0.6), rx(aft[0]['edge']), ry(vr) - 1), fill=Hc('#D9A93F'))
    for t in aft:
        yb, yt = vr + t['h'] - 1.2, vr + t['h'] - 0.45
        for z in np.arange(-L / 2 + 0.9, t['edge'] - 0.6, 1.25):
            d.rectangle((rx(z) - 9, ry(yt) - 2, rx(z) + 9, ry(yb) + 2), fill=Hc('#9C7426'))
            d.rectangle((rx(z) - 7, ry(yt), rx(z) + 7, ry(yb)), fill=Hc('#FFE9A8'))
    for z in np.arange(aft[0]['edge'], L / 2, 0.5):  # la greca de volutas bajo la regala, en la madera
        yy = ry(vr + H.rail_rise(z) - 0.3); d.ellipse((rx(z) - 3, yy - 3, rx(z) + 3, yy + 3), outline=Hc('#D9A93F'))
    x0, y0_, w, h = AT.R['stern']; ytop = H.top(-L / 2); ybot = -H.prof(-L / 2)[3] * c['D']
    sy = lambda y: AT.px('stern', 0, (ytop - y) / (ytop - ybot))[1]; sx = lambda x: AT.px('stern', 0.5 + x / (2 * H.hb), 0)[0]
    y_ = H.y0(-L / 2); cw = 0.18 * H.hb
    d.ellipse((sx(-cw), sy(min(ytop - 0.15, y_ + 0.45)), sx(cw), sy(y_ - 0.1)), fill=Hc('#2F7FB8'), outline=Hc('#9C7426'), width=3)
    x0, y0_, w, h = AT.R['flag']; d.rectangle((x0, y0_, x0 + w, y0_ + h), fill=Hc('#2F7FB8'))
    x0, y0_, w, h = AT.R['white']; d.rectangle((x0 - 4, y0_ - 4, x0 + w + 4, y0_ + h + 4), fill=(255, 255, 255))
    return img


if __name__ == '__main__':
    base = paint(); base.save(os.path.join(OUT, f'atlas_{ID}_base.png'))
    ao = os.path.join(OUT, f'ao_{ID}.npy')
    if os.path.exists(ao):
        full = NCV.compose(base, ao, AT.R['white']); full.save(os.path.join(OUT, f'atlas_{ID}.png')); full.save(os.path.join(OUT, f'atlas_{ID}_out.png'))
        print(ID, 'atlas con oclusión', AT.A)
    for lod in (0, 1):
        m, H = CC.build('galleon', ID, lod); cargo(m, H)
        np.savez(os.path.join(OUT, f'{ID}_lod{lod}.npz'), **m.arrays())
        print(ID, f'lod{lod}', m.ntri(), 'tris')

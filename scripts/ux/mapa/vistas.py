# Vistas de un asset del mapa sobre el océano de ART-DIRECTION §7.2, con barcos de hoy atracados (lámina de D82 y las de
# islas): planta (cámara a 90°), cámara del juego (55°) y de cerca. Lee $UX_OUT/mapa/<asset>_lod0.npz, el atlas y
# $UX_OUT/barcos-geo.json (code/export-barcos.ts; ver la cabecera de scripts/ux/laminas/lamina_barcos.py). No corre en la CI.
import math, os, sys, json
sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here); sys.path.insert(0, os.path.join(here, '..', 'laminas'))
import rutas as RT
import numpy as np
from PIL import Image
import render_tex as RX
import oceano as O

MAPA = os.path.join(RT.OUT, 'mapa')
LEN = {'sloop': 16, 'schooner': 22, 'brig': 24, 'frigate': 34, 'line': 42}


def load_asset(name):
    d = np.load(os.path.join(MAPA, f'{name}_lod0.npz'))
    atlas = RX.srgb2lin(np.asarray(Image.open(os.path.join(MAPA, f'atlas_{name}.png')).convert('RGB'), float))
    return d['p'], d['t'], d['c'], atlas


def moored(gid, psi_deg, white_uv, r_quay=30.0):
    """Barco de hoy atracado de popa a 2 m del muelle (GDD §4): centro a 30 + L/2 + 2 en el rumbo ψ, proa hacia fuera."""
    g = json.load(open(RT.need(os.path.join(RT.OUT, 'barcos-geo.json'), 'barcos-geo.json')))[gid]
    P = np.array(g['pos']).reshape(-1, 3); N = np.array(g['nor']).reshape(-1, 3); C = np.array(g['col']).reshape(-1, 3)
    psi = math.radians(psi_deg); c, s = math.cos(psi), math.sin(psi)
    Ry = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]); d = r_quay + LEN[gid] / 2 + 2
    P = P @ Ry.T + np.array([d * s, 0, d * c]); N = N @ Ry.T
    return P, np.tile(white_uv, (len(P), 1)), C, N


def view(asset, ships, ppm, W, H, ox, oy, th, circles, SS=3, x0=0.0, z0=0.0, extra=()):
    P, UV, C, atlas = asset
    P, UV, C, _ = RX.clip_below_water(P, UV, C)
    PS, US, CS, NS = [P], [UV], [C], [RX.face_normals(P)]
    for (p, u, c, n) in ships:
        p, u, c, n = RX.clip_below_water(p, u, c, n); PS.append(p); US.append(u); CS.append(c); NS.append(n)
    for (p, u, c) in extra:
        PS.append(p); US.append(u); CS.append(c); NS.append(RX.face_normals(p))
    Pa = np.concatenate(PS) - np.array([x0, 0, z0])
    col, cov = RX.render(Pa, np.concatenate(US), np.concatenate(CS), atlas, ppm, W, H, ox, oy, th, SS=SS, N=np.concatenate(NS))
    bg = O.ocean(W, H, ox, oy, ppm, th, circles, x0, z0)
    out = col + (1 - cov[..., None]) * (bg / 255.0)
    return Image.fromarray(np.clip(np.round(out * 255), 0, 255).astype(np.uint8))

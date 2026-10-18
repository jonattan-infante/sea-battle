# Uso (desde la raíz del repo), tras islas.py y puerto_colonial.py: python3 -I scripts/ux/mapa/presupuesto.py
#   →  imprime y escribe $UX_OUT/mapa/presupuesto-vista.json
# Vista peor del escenario (AC-200 b; GDD §16): triángulos y draw calls de islas y puerto con la cámara del juego (ortográfica
# a 55°, ART-DIRECTION §6) a 1,5× con el cañón de N3 (5,04 px/m a 1,0×; 3,36 a 1,5×) en 1440×900, que es la vista que más
# mapa enseña. La cámara sigue al barco propio, así que se recorre cada punto navegable del mapa cada 5 m (a ≥ 10 m de toda
# isla, el margen de la Balandra) y se cuenta lo que three dibuja: cada isla es su propia malla y entra entera si su esfera
# envolvente toca el frustum (el recorte de three es por objeto). Compara 2 montajes: una malla por isla (recomendado) y todo
# fusionado en una sola malla, como en la 1.0. No corre en la CI.
import json, math, os, sys
sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here); sys.path.insert(0, os.path.join(here, '..', 'laminas'))
import rutas as RT
import numpy as np
import circulos as CI

MAPA = os.path.join(RT.OUT, 'mapa')
TH = math.radians(55)
PPM = 402.9 / 80 / 1.5            # computePpm0(1440, 900, 80) = 5,04 px/m (src/client/art.ts:197) a 1,5× (ZOOM.levels)
WM, HM = 1440 / PPM, 900 / PPM    # ancho y alto de la vista en m de pantalla


def sphere(P):
    """Esfera envolvente como la de three (BufferGeometry.computeBoundingSphere): centro de la caja, radio al vértice más lejano."""
    c = (P.min(0) + P.max(0)) / 2
    return c, float(np.sqrt(((P - c) ** 2).sum(1)).max())


def load():
    objs = {}
    for iid in CI.ISLAS:
        f = os.path.join(MAPA, 'puerto_lod0.npz' if iid == 'PORT' else f'isla_{iid}_lod0.npz')
        P = np.load(RT.need(f, os.path.basename(f)))['p']
        c, r = sphere(P)
        objs[iid] = {'tris': len(P) // 3, 'c': c, 'r': r}
    return objs


def visible(objs, tx, tz):
    out = []
    for iid, o in objs.items():
        dx = o['c'][0] - tx; dz = o['c'][2] - tz
        sy = o['c'][1] * math.cos(TH) - dz * math.sin(TH)
        if abs(dx) <= WM / 2 + o['r'] and abs(sy) <= HM / 2 + o['r']: out.append(iid)
    return out


def island_area(tx, tz, step=4.0):
    """m² de isla (unión de círculos) dentro del suelo visible (la vista corta el suelo en WM × HM / sin 55°)."""
    xs = np.arange(tx - WM / 2, tx + WM / 2, step); zs = np.arange(tz - HM / 2 / math.sin(TH), tz + HM / 2 / math.sin(TH), step)
    X, Z = np.meshgrid(xs, zs); inside = np.zeros(X.shape, bool)
    for iid, v in CI.ISLAS.items():
        for (cx, cz, r) in v[4]: inside |= np.hypot(X - cx, Z - cz) <= r
    return float(inside.sum() * step * step)


if __name__ == '__main__':
    objs = load()
    allc = [c for v in CI.ISLAS.values() for c in v[4]]
    best = {'tris': (0, None), 'dc': (0, None), 'area': (0, None)}
    for tx in np.arange(-490, 490.1, 5.0):
        for tz in np.arange(-490, 490.1, 5.0):
            if min(math.hypot(tx - c[0], tz - c[1]) - c[2] for c in allc) < 10: continue
            vis = visible(objs, tx, tz); tris = sum(objs[i]['tris'] for i in vis)
            if tris > best['tris'][0]: best['tris'] = (tris, (float(tx), float(tz), vis))
            if len(vis) > best['dc'][0]: best['dc'] = (len(vis), (float(tx), float(tz), vis))
    # la de más superficie de isla (la definición de AC-200), en una rejilla de 20 m
    for tx in np.arange(-480, 480.1, 20.0):
        for tz in np.arange(-480, 480.1, 20.0):
            if min(math.hypot(tx - c[0], tz - c[1]) - c[2] for c in allc) < 10: continue
            a = island_area(tx, tz)
            if a > best['area'][0]: best['area'] = (a, (float(tx), float(tz), visible(objs, tx, tz)))
    a_vis = best['area'][1][2]
    res = {
        'ppm': round(PPM, 3), 'vista_m': [round(WM, 1), round(HM / math.sin(TH), 1)],
        'por_objeto': {i: {'tris': o['tris'], 'radio_esfera': round(o['r'], 1)} for i, o in objs.items()},
        'total_mapa_tris': sum(o['tris'] for o in objs.values()),
        'peor_tris': {'tris': best['tris'][0], 'draw_calls': len(best['tris'][1][2]), 'camara': best['tris'][1][:2], 'objetos': best['tris'][1][2]},
        'mas_draw_calls': {'draw_calls': best['dc'][0], 'camara': best['dc'][1][:2], 'objetos': best['dc'][1][2]},
        'mas_superficie': {'m2': round(best['area'][0]), 'tris': sum(objs[i]['tris'] for i in a_vis), 'draw_calls': len(a_vis), 'camara': best['area'][1][:2], 'objetos': a_vis},
        'fusionado_en_1': {'tris': sum(o['tris'] for o in objs.values()), 'draw_calls': 1},
    }
    json.dump(res, open(os.path.join(MAPA, 'presupuesto-vista.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({k: v for k, v in res.items() if k != 'por_objeto'}, ensure_ascii=False, indent=1))

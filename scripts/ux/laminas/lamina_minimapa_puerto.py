# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/lamina_minimapa_puerto.py  →  $UX_OUT/D96-minimapa-puerto.png
# Lámina corta para Jonattan (D96; ART-DIRECTION §4.3, «El puerto, en 2 tiempos»): cómo se ve el ⚓ del minimapa sobre la
# costa del puerto de D92 (7 círculos del mismo `sand`) en los 3 tamaños (182 px a DPR 1, 86 y 70 px a DPR 3). Compara el
# de hoy (sin costa, solo el ⚓: el tiempo 1), la costa con el ⚓ encima tal cual y la propuesta de ux: un disco `#07121B`
# detrás del ⚓, del radio mínimo que contiene su dibujo con el contorno más 1 px, medido aquí. Con el modelo de canvas de
# AD-29 de lamina_minimapa.py (D87). Los 7 círculos salen de la variante v3 de scripts/ux/mapa/puerto_forma.py, leída con
# ast (sin ejecutarla). Las 3 condiciones de producto (2026-10-19): (1) AD-29 con el disco, con el barrido de ad29py.py
# (W 24, DPR 1 y 2) y el ⚓ sobre el disco como variante de su clase; (2) el orden de capas, con el barco propio y otro
# jugador amarrados (GDD §4, amarres 5 y 2 de D92, centro del Navío) encima del disco; (3) el disco frente a la arena, el
# agua y el panel (ΔE76 de pal.py en las 4 visiones, y L*). Escribe en UX_OUT (la lámina y d96-medidas.json), nunca en
# docs/game/art/. No corre en la CI.
import sys, os, math, ast, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'mapa'))
sys.path.insert(0, os.path.join(HERE, '..'))
import rutas as RT
import tienda as T
import lamina_minimapa as LM
import pal as PAL
import numpy as np
from PIL import Image, ImageDraw

M, C = LM.M, LM.C
PAPER, INK, SOFT, TITLE = (245, 241, 230), (43, 29, 14), (92, 74, 51), (107, 58, 26)
BADGE = M['hexrgb']('#07121B')
def font(px, w=600): return T.font(px, w)
def dec(x, k): return f'{x:.{k}f}'.replace('.', ',')


def port_circles():
    """Los 7 círculos del puerto de D92 (puerto_forma.py, VARIANTS['v3']), en m: (x, z, r)."""
    src = open(os.path.join(HERE, '..', 'mapa', 'puerto_forma.py')).read(); tree = ast.parse(src)
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'VARIANTS' for t in node.targets):
            v = ast.literal_eval(node.value); return [(x, z, r) for _, x, z, r in v['v3'][0]]
    raise SystemExit('sin VARIANTS en puerto_forma.py')


PORT = port_circles()


def anchor_radius(dpr=4):
    """Radio en px CSS del dibujo del ⚓ (13 px, trazo 1,5, contorno de 1 px) medido en un canvas vacío: la distancia más
    larga de un píxel pintado al centro."""
    S = 64 * dpr; M['K'] = S * 4; cv = M['Canvas'](S); cv.fill_rgb(np.array([255., 0., 255.]))
    M['anchor'](13, 1.5)(cv, S / 2, S / 2, dpr, 0)
    a = np.asarray(cv.img, float); m = np.abs(a - np.array([255., 0., 255.])).sum(axis=2) > 6
    yy, xx = np.nonzero(m); return float(np.hypot(xx + 0.5 - S / 2, yy + 0.5 - S / 2).max() / dpr)


R_ANCHOR = anchor_radius(); R_BADGE = math.ceil(R_ANCHOR + 1.0)


# Los barcos amarrados (GDD §4, tabla de D92: centro del Navío y ψ): el propio en el amarre 5 y otro jugador en el 2
ME_PORT = (70.6, -11.6, math.radians(98)); OTRO = (37.9, 46.2)


def mini(css, dpr, mode, ships=False):
    """El minimapa con el puerto. mode: 'hoy' (sin costa del puerto), 'costa' (costa y ⚓ tal cual) o 'disco' (costa, disco y ⚓).
    ships: el barco propio y otro jugador amarrados, con la vista y el área de interés del propio, en el orden de
    lamina_minimapa.minimap (§4.3): encima del ⚓ y del anillo de la zona segura."""
    S = int(round(css * dpr)); ss = max(4, 8 // int(dpr)); M['K'] = S * ss; cv = M['Canvas'](S)
    s = S / 1000.0; px = lambda v: (v + 500) * s
    cv.fill_rgb(C['panel']); cv.fill_rgb(C['ocean'], 0.9)
    for x, z, r in LM.ISL_11 + (PORT if mode != 'hoy' else []):
        cv.paint(np.hypot(cv.X - px(x), cv.Y - px(z)) <= max(1.5 * dpr, r * s), C['sand'])
    if mode == 'disco': cv.paint(np.hypot(cv.X - px(0), cv.Y - px(0)) <= R_BADGE * dpr, BADGE)
    M['anchor'](13, 1.5)(cv, px(0), px(0), dpr, 0)
    LM.band(cv, px(0), px(0), 110 * s, dpr, LM.ZONE, 0.85, dash=3 * dpr)
    if ships:
        mx, mz, mh = ME_PORT
        LM.rect_line(cv, px(mx - 120), px(mz - 90), px(mx + 120), px(mz + 90), dpr, LM.WHITE, 0.6)  # la vista de 240 × 180 m de SCENE
        LM.band(cv, px(mx), px(mz), 300 * s, dpr, LM.WHITE, 0.35)
        LM.MARK['1.1']['player'](cv, px(OTRO[0]), px(OTRO[1]), dpr, 0)
        LM.MARK['1.1']['me'](cv, px(mx), px(mz), dpr, mh)
    return Image.fromarray(np.clip(cv.img, 0, 255).astype(np.uint8))


def coast_peek(css, dpr):
    """Px CSS² de costa del puerto que asoman fuera del disco (en el modo 'disco'): lo que se lee como la forma del puerto."""
    S = int(round(css * dpr)); s = S / 1000.0; yy, xx = np.mgrid[0:S, 0:S] + 0.5; c0 = (0 + 500) * s
    land = np.zeros((S, S), bool)
    for x, z, r in PORT: land |= np.hypot(xx - (x + 500) * s, yy - (z + 500) * s) <= max(1.5 * dpr, r * s)
    out = land & (np.hypot(xx - c0, yy - c0) > R_BADGE * dpr)
    return round(float(land.sum()) / dpr ** 2, 1), round(float(out.sum()) / dpr ** 2, 1)


def coast_vs_anchor(css, dpr):
    """Px CSS² de costa del puerto fuera del dibujo del ⚓ (cobertura < 0,5), sin disco: lo que asoma y emborrona el ancla."""
    S = int(round(css * dpr)); ss = max(4, 8 // int(dpr)); M['K'] = S * ss; cv = M['Canvas'](S); s = S / 1000.0; c0 = 500 * s
    keep = {k: C[k].copy() for k in ('sand', 'outline')}
    try:  # el ⚓ en blanco sobre negro: el canal rojo es su cobertura
        C['sand'][:] = 255; C['outline'][:] = 255; cv.fill_rgb(np.zeros(3)); M['anchor'](13, 1.5)(cv, c0, c0, dpr, 0)
    finally:
        for k in keep: C[k][:] = keep[k]
    yy, xx = np.mgrid[0:S, 0:S] + 0.5; land = np.zeros((S, S), bool)
    for x, z, r in PORT: land |= np.hypot(xx - (x + 500) * s, yy - (z + 500) * s) <= max(1.5 * dpr, r * s)
    return round(float((land & (cv.img[..., 0] / 255.0 < 0.5)).sum()) / dpr ** 2, 1)


SHAPE = {'▲': 'tu barco', '●': 'otro jugador', '◆': 'pirata', '■': 'mercante', '▬': 'cañonera', '★': 'capitán', '▣': 'galeón'}


def ad29_disco():
    """AD-29 (D87) con el disco: el barrido de ad29py.py tal cual (W 24, DPR 1 y 2; las 6 formas, ancla13 y cuadhueco10, como
    calibracion/ad29-1-1-w24.json) más el ⚓ sobre el disco como variante de la clase ⚓, para que no se compare con el ⚓
    sin disco. Devuelve, por DPR, la propia y el cruce de cada ⚓, y la diferencia del ⚓ sin disco con la referencia."""
    src = open(os.path.join(HERE, '..', 'ad29py.py')).read(); head, tail = src.split('PH = [0')
    argv = sys.argv; sys.argv = ['ad29py.py', '24', '1,2', 'ancla13,cuadhueco10']
    try:
        A = {'__name__': 'ad29'}; exec(head, A); anc = A['anchor'](13, 1.5)
        def con_disco(cv, x, y, d, h):
            cv.paint(np.hypot(cv.X - x, cv.Y - y) <= R_BADGE * d, A['C']['outline']); anc(cv, x, y, d, h)
        A['V']['⚓']['ancla13disco'] = con_disco; A['print'] = lambda *a, **k: None
        exec('PH = [0' + tail, A)
    finally:
        sys.argv = argv
    ref = json.load(open(os.path.join(HERE, '..', 'calibracion', 'ad29-1-1-w24.json'))); out = {}
    for dpr, v in A['res'].items():
        cr = {k: x for k, x in v['cross'].items() if '⚓' in k}
        dif = max([abs(v['own']['⚓ancla13'] - ref[dpr]['own']['⚓ancla13'])] + [abs(x - ref[dpr]['cross'][k]) for k, x in cr.items() if 'disco' not in k])
        out[dpr] = dict(propia={k: x for k, x in v['own'].items() if k.startswith('⚓')}, cruce=cr, dif_ref=round(dif, 4))
    return out


def peor(cr, disco):
    """El par más parecido del ⚓ (con o sin disco): (forma en llano, NCC)."""
    ks = [k for k in cr if ('disco' in k) == disco]; k = max(ks, key=lambda k: cr[k])
    return SHAPE[[c for c in SHAPE if c in k][0]], cr[k]


def disco_color():
    """El disco frente a la arena, el agua del minimapa (océano al 0,9 sobre el panel, como el canvas) y el panel: ΔE76 de
    pal.py (ART-DIRECTION §4.5) en las 4 visiones, y L*."""
    agua = '#%02X%02X%02X' % tuple(int(v) for v in np.round(C['panel'] * 0.1 + C['ocean'] * 0.9))
    ref = dict(arena='#E6CF9A', agua=agua, panel='#0B1A24')
    return dict(L={k: round(PAL.L(h), 1) for k, h in dict(disco='#07121B', **ref).items()},
                dE={k: [round(PAL.dE('#07121B', h, v), 1) for v in ('normal', 'protan', 'deutan', 'tritan')] for k, h in ref.items()})


if __name__ == '__main__':
    SIZES = [('Escritorio (182 px)', 182, 1), ('Móvil 390×844 (86 px)', 86, 3), ('Apaisado 844×390 (70 px)', 70, 3)]
    MODES = [('hoy', 'Hoy: sin la costa del puerto, solo el ancla'), ('costa', 'La costa del puerto con el ancla encima, tal cual'),
             ('disco', f'Propuesta: un disco oscuro detrás del ancla ({R_BADGE} px de radio)')]
    SW = 2240; sheet = Image.new('RGB', (SW, 6000), PAPER); d = ImageDraw.Draw(sheet)
    d.text((40, 22), 'El ancla del puerto en el minimapa, sobre la costa del puerto nuevo', font=font(30), fill=INK)
    for i, t in enumerate(['El puerto nuevo es de arena, como el ancla, y en el minimapa mide casi lo mismo que ella: en escritorio asoma alrededor del ancla y la emborrona; en el móvil, el ancla ya lo tapa casi entero.',
                           f'Propongo un disco oscuro detrás del ancla, de {R_BADGE} px de radio en los 3 tamaños. A cambio, el disco tapa la costa del puerto (las medidas, al final). Lo que se aprueba: la columna de la derecha.',
                           'En la 2.ª fila de cada tamaño, tu barco y otro jugador amarrados: van encima del disco y del ancla, como el círculo de la zona segura.']):
        d.text((40, 64 + 26 * i), t, font=font(17, 500), fill=INK)
    y = 162; med = {}
    for name, css, dpr in SIZES:
        d.text((40, y), name, font=font(20), fill=TITLE); y += 32
        for ships in (False, True):
            x = 40; hmax = 0
            for mode, lab in MODES:
                im = mini(css, dpr, mode, ships); S = im.width; c = S / 2; half = int(round(min(S / 2, 28 * dpr)))  # 28 px CSS alrededor del puerto
                crop = im.crop((int(c - half), int(c - half), int(c + half), int(c + half)))
                k = max(1, round(320 / crop.width))  # a ≈ 336 px en la lámina, con píxeles enteros
                big = crop.resize((crop.width * k, crop.height * k), Image.NEAREST); g = LM.gray(big)
                sheet.paste(big, (x, y)); sheet.paste(g, (x + big.width + 8, y)); yy = y + big.height + 8
                if not ships:  # el minimapa entero, a 1,5× CSS
                    th_ = im.resize((int(css * 1.5), int(css * 1.5)), Image.LANCZOS if dpr > 1 else Image.NEAREST); sheet.paste(th_, (x, yy)); yy += th_.height + 6
                d.text((x, yy), lab if not ships else lab.split(':')[0] + ', con tu barco y otro jugador amarrados', font=font(14, 500), fill=SOFT)
                x += 2 * big.width + 8 + 40; hmax = max(hmax, yy - y + 32)
            y += hmax + 10
        land, peek = coast_peek(css, dpr); s_ = int(round(css * dpr)) / 1000.0 / dpr
        med[name] = dict(costa_px2=land, asoma_px2=peek, r_zona=round(110 * s_, 2), sin_disco_px2=coast_vs_anchor(css, dpr))
        y += 16
    AD = ad29_disco(); col = disco_color()
    d.text((40, y), 'Medidas', font=font(20), fill=TITLE); y += 32
    for t in [f'Radio del dibujo del ancla, con su contorno: {dec(R_ANCHOR, 2)} px. El disco mide {R_BADGE} px de radio en los 3 tamaños.',
              *[f"{n}: la costa del puerto ocupa {dec(v['costa_px2'], 1)} px²; sin disco, fuera del dibujo del ancla asoman {dec(v['sin_disco_px2'], 1)} px², y con el disco, {dec(v['asoma_px2'], 1)} px². El círculo de la zona segura tiene {dec(v['r_zona'], 1)} px de radio" + (f", y el disco lo pasa en {dec(R_BADGE - v['r_zona'], 1)} px (el círculo va encima)." if v['r_zona'] < R_BADGE else ': el disco queda dentro.') for n, v in med.items()],
              *[f"Parecido entre formas (AD-29, a DPR {p}): el ancla con disco se parece a sí misma {dec(min(v['propia'][k] for k in v['propia'] if 'disco' in k), 3)} (se pide 0,90 o más), y a la forma más parecida, {peor(v['cruce'], True)[0]}, {dec(peor(v['cruce'], True)[1], 3)} (se pide 0,80 o menos). Sin disco: {dec(v['propia']['⚓ancla13'], 3)}, y {dec(peor(v['cruce'], False)[1], 3)} con {peor(v['cruce'], False)[0]}." for p, v in AD.items()],
              'El ancla sin disco da lo mismo que en la medida aprobada con D87 (scripts/ux/calibracion/ad29-1-1-w24.json): diferencia máxima ' + ' y '.join(dec(v['dif_ref'], 4) for v in AD.values()) + '.',
              f"El disco no se lee como tierra: su luminosidad L* es {dec(col['L']['disco'], 1)}, frente a {dec(col['L']['arena'], 1)} de la arena; su diferencia de color con la arena va de {dec(min(col['dE']['arena']), 1)} a {dec(max(col['dE']['arena']), 1)} en las 4 visiones (normal y 3 daltonismos).",
              f"Frente al agua del minimapa, de {dec(min(col['dE']['agua']), 1)} a {dec(max(col['dE']['agua']), 1)}; frente al fondo del panel, de {dec(min(col['dE']['panel']), 1)} a {dec(max(col['dE']['panel']), 1)}: el disco es del tono de los contornos de los marcadores."]:
        d.text((40, y), t, font=font(16, 500), fill=INK); y += 26
    sheet = sheet.crop((0, 0, SW, y + 20)); out = os.path.join(RT.OUT, 'D96-minimapa-puerto.png'); sheet.save(out, optimize=True)
    MED = dict(r_ancla=round(R_ANCHOR, 3), r_disco=R_BADGE, medidas=med, ad29=AD, color=col)
    json.dump(MED, open(os.path.join(RT.OUT, 'd96-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    print('hoja', out, sheet.size, json.dumps(MED, ensure_ascii=False))

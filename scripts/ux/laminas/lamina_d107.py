# Uso (desde la raíz del repo), con la UX_OUT de la entrega de las 10 combinaciones (sus npz con la bandera de D104 y sus
# atlas; la de `entregar.py familias`) y las capturas de QA-78 en qa-artifacts/ (o UX_QA):
#   UX_OUT=<…> UX_FONTS=<…> python3 -I scripts/ux/laminas/lamina_d107.py   →  $UX_OUT/D107-goleta-relinga.png y
#   $UX_OUT/d107-medidas.json
# Lámina D107 para Jonattan (H-D106-1 de QA-78; ART-DIRECTION §9.2 y fila D107): la Goleta y el Bergantín británicos, que 3
# de 5 evaluadores cambiaron en 390×844 y en grises. Enseña (1) los recortes reales del juego que vieron los evaluadores;
# (2) antes y después en 390×844 (LOD1, 2,8 px/m CSS a DPR 2), con 3 momentos del balanceo del juego (runtime.ts:1612-1631:
# roll ±3°, pitch ±1,5°), en color y en grises de AD-21; (3) 1440×900 (LOD0, 6,2 px/m), que no cambia; (4) la tira de las
# 5 clases británicas en 390×844, después; y (5) la medida: la costura entre las 2 cangrejas en 200 momentos del balanceo
# (render de identificadores con la cámara del juego, ortográfica a 55°, art.ts:153). El render en color es el de las
# láminas (render_tex.py, el nivel 0 del atlas, sin mips ni la sombra en el agua). «Después» = el npz de entrega con la
# relinga de relinga_d107.py, la misma que se midió en la cadena (+156 B). Ligero (≈ 1 min, un núcleo). No corre en la CI.
# La lámina se generó con la UX_OUT de antes de D107 (npz sin la relinga). Con la entrega de D107, cuyos npz ya la llevan,
# «antes» y «después» salen iguales: para regenerarla hace falta aquella UX_OUT.
# AD-37 (d) (D107, aprobada el 2026-11-16): la regla medible de la costura, sin lámina ni fuentes:
#   python3 -I scripts/ux/laminas/lamina_d107.py --medir <goleta_lod1.npz | rig.json> ...
#   Un .npz es el de la cadena (p y c por vértice; la Goleta británica y la española de la entrega, ya con la relinga). Un
#   .json es el que exporta el generador del juego (code/export-rig-clases.ts schooner: su 'lod1', 'pos' y 'col'), que es el
#   procedural de la Goleta sin familia. Escribe la medida en JSON por archivo y sale con código 1 si alguno no cumple:
#   en los 200 momentos, ≥ 6 filas con una costura de ≥ 2 px entre las 2 cangrejas (filas_costura_2px_min ≥ 6).
import sys, os, json, math
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'mapa'), os.path.join(HERE, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import render_tex as RTX
import curvo as CV
import tienda as T
import relinga_d107 as RL
import numpy as np
from PIL import Image, ImageDraw

CAD = os.path.join(RT.OUT, 'cadena'); QA = os.environ.get('UX_QA', os.path.join(RT.REPO, 'qa-artifacts'))
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42)
TH = 55.0; PPM_M = 2.82 * 2; PPM_D = 6.2  # 390×844 a DPR 2 y 1440×900 a DPR 1, con N1 a 1,0× (§18.1)
WHITE_UV = (0.6171875, 0.0390625)  # el téxel blanco del atlas de las 4 clases (el de las velas y los palos)
def font(px, w=600): return T.font(px, w)
def num(v): return f'{v:g}'.replace('.', ',')


# --- geometría y pose -------------------------------------------------------------------------------------------------
def load(id_, lod, relinga=False):
    d = np.load(RT.need(os.path.join(CAD, f'{id_}_lod{lod}.npz'), f'{id_}_lod{lod}.npz'))
    p, t, c, r, b = d['p'], d['t'], d['c'], d['r'], d['b']
    if relinga: p, t, c, r, b = RL.add_to_arrays(p, t, c, r, b, WHITE_UV)
    return dict(p=p.astype(float), t=t.astype(float), c=c.astype(float), r=r.astype(float))


def rot(heading, roll=0.0, pitch=0.0):
    """mesh.rotation.set(pitch, heading, roll) de three.js (Euler XYZ): R = Rx · Ry · Rz (runtime.ts:1631)."""
    a, h, r = (math.radians(v) for v in (pitch, heading, roll))
    Rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    Ry = np.array([[math.cos(h), 0, math.sin(h)], [0, 1, 0], [-math.sin(h), 0, math.cos(h)]])
    Rz = np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1]])
    return Rx @ Ry @ Rz


def screen(P, ppm):
    t = math.radians(TH)
    return P[:, 0] * ppm, -(P[:, 1] * math.cos(t) - P[:, 2] * math.sin(t)) * ppm


# --- render en color (render_tex: la luz del juego y el atlas) --------------------------------------------------------
_atlas = {}
def atlas(id_):
    name = id_.split('_')[1] if id_.startswith('navio_') else id_  # los Navíos usan atlas_gb y atlas_es (navio_curvo.py)
    if name not in _atlas:
        _atlas[name] = RTX.srgb2lin(np.asarray(Image.open(RT.need(os.path.join(CAD, f'atlas_{name}.png'), f'atlas_{name}.png')).convert('RGB')).astype(float))
    return _atlas[name]


OCEAN = None
def ocean():
    """El agua de la captura de QA-78 en 390×844 (mediana de un trozo de mar abierto, sin barcos ni espuma)."""
    global OCEAN
    if OCEAN is None:
        a = np.asarray(Image.open(os.path.join(QA, 'mobile-fleet-1-1-gb.png')).convert('RGB'))[1250:1550, 80:700].reshape(-1, 3)
        OCEAN = np.median(a, 0) / 255.0
    return OCEAN


def shot(m, id_, ppm, heading=45.0, roll=0.0, pitch=0.0, pad=8, box=None):
    R = rot(heading, roll, pitch); P = m['p'] @ R.T; N = CV.vertex_normals(m['p']) @ R.T
    Pc, UVc, C4c, Nc = RTX.clip_below_water(P, m['t'], np.concatenate([m['c'], m['r'][:, None]], 1), N)
    x, y = screen(Pc, ppm)
    if box is None: box = (math.floor(x.min()) - pad, math.floor(y.min()) - pad, math.ceil(x.max()) + pad, math.ceil(y.max()) + pad)
    x0, y0, x1, y1 = box
    col, cov = RTX.render(Pc, UVc, C4c[:, :3], atlas(id_), ppm, x1 - x0, y1 - y0, -x0, -y0, TH, SS=3, N=Nc, heading_deg=0.0, S=C4c[:, 3])
    img = col + ocean()[None, None, :] * (1 - cov[..., None])
    return Image.fromarray(np.round(np.clip(img, 0, 1) * 255).astype(np.uint8)), box


def gray(im):
    """AD-21: la de rejilla.py (luminancia relativa codificada en sRGB)."""
    a = np.asarray(im.convert('RGB')).astype(float) / 255
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4); Y = lin @ np.array([0.2126, 0.7152, 0.0722])
    g = np.where(Y <= 0.0031308, 12.92 * Y, 1.055 * np.power(Y, 1 / 2.4) - 0.055)
    return Image.fromarray(np.round(np.clip(g, 0, 1) * 255).astype(np.uint8)).convert('RGB')


# --- medida: la costura entre las 2 cangrejas (render de identificadores) ---------------------------------------------
def hexs(c):
    s = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)
    return '#%02X%02X%02X' % tuple(int(round(v * 255)) for v in np.clip(s, 0, 1))


def groups(m):
    """1 cangreja mayor, 2 cangreja de trinquete, 3 gavia, 4 foques, 5 palos, perchas y la relinga, 6 casco y resto."""
    P = m['p'].reshape(-1, 3, 3); hx = np.array([hexs(c) for c in m['c'].reshape(-1, 3, 3)[:, 0]]); cen = P.mean(1)
    g = np.full(len(P), 6); sail = hx == RL.SAIL_LOD1
    g[sail & (cen[:, 2] < -3.0)] = 1
    g[sail & (cen[:, 2] >= -3.0) & (cen[:, 2] < 3.7) & (cen[:, 1] < 14.4)] = 2
    g[sail & (cen[:, 1] >= 14.4) & (np.abs(cen[:, 2] - 4.5) < 1.5)] = 3
    g[sail & (cen[:, 2] >= 4.4) & (cen[:, 1] < 14.4)] = 4
    g[np.isin(hx, ['#6B4426', '#633F23'])] = 5
    return P, g


def ids(P, g, R, ppm, SS=3, pad=6):
    Pw = P @ R.T; X, Y = screen(Pw.reshape(-1, 3), ppm); X = X.reshape(-1, 3); Y = Y.reshape(-1, 3)
    t = math.radians(TH); D = -(Pw[..., 1] * math.sin(t) + Pw[..., 2] * math.cos(t))
    keep = Pw[..., 1].max(1) >= 0
    x0 = math.floor(X.min()) - pad; y0 = math.floor(Y.min()) - pad
    W = int(math.ceil(X.max())) - x0 + pad; H = int(math.ceil(Y.max())) - y0 + pad
    sx, sy = (X - x0) * SS, (Y - y0) * SS
    zb = np.full((H * SS, W * SS), np.inf); ib = np.zeros((H * SS, W * SS), np.int8)
    for k in np.nonzero(keep)[0]:
        xa, xb, xc = sx[k]; ya, yb, yc = sy[k]; area = (xb - xa) * (yc - ya) - (xc - xa) * (yb - ya)
        if abs(area) < 1e-9: continue
        bx0, bx1 = max(int(math.floor(min(xa, xb, xc))), 0), min(int(math.ceil(max(xa, xb, xc))), W * SS - 1)
        by0, by1 = max(int(math.floor(min(ya, yb, yc))), 0), min(int(math.ceil(max(ya, yb, yc))), H * SS - 1)
        XX, YY = np.meshgrid(np.arange(bx0, bx1 + 1) + 0.5, np.arange(by0, by1 + 1) + 0.5)
        w0 = ((xb - XX) * (yc - YY) - (xc - XX) * (yb - YY)) / area; w1 = ((xc - XX) * (ya - YY) - (xa - XX) * (yc - YY)) / area; w2 = 1 - w0 - w1
        ins = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not ins.any(): continue
        d = w0 * D[k, 0] + w1 * D[k, 1] + w2 * D[k, 2]; z = zb[by0:by1 + 1, bx0:bx1 + 1]; u = ins & (d < z)
        z[u] = d[u]; ib[by0:by1 + 1, bx0:bx1 + 1][u] = g[k]
    ibp = ib.reshape(H, SS, W, SS).transpose(0, 2, 1, 3).reshape(H, W, SS * SS)
    return np.stack([(ibp == k).sum(-1) for k in range(7)], -1).argmax(-1)


def seam(idp):
    """Por fila con las 2 cangrejas: el ancho (px) de lo que no es vela entre la mayor y la de trinquete, o −1 si se tocan."""
    out = []
    for row in idp:
        ia, ib = np.nonzero(row == 1)[0], np.nonzero(row == 2)[0]
        if len(ia) == 0 or len(ib) == 0: continue
        ra, lb = ia.max(), ib.min()
        out.append(lb - ra - 1 if lb > ra + 1 and np.isin(row[ra + 1:lb], (0, 5, 6)).all() else -1)
    return np.array(out)


def measure(m, n=200, seed=107):
    """La costura en n momentos del balanceo, a 45° y en 390×844: roll = 3° sen a y pitch = 1,5° sen b, con a y b
    uniformes (la fase del juego es aleatoria por barco, runtime.ts:1574)."""
    P, g = groups(m); rng = np.random.default_rng(seed); A = rng.uniform(0, 2 * math.pi, n); B = rng.uniform(0, 2 * math.pi, n)
    rows2, fused, one = [], [], []
    for a, b in zip(A, B):
        pr = seam(ids(P, g, rot(45, 3 * math.sin(a), 1.5 * math.sin(b)), PPM_M))
        rows2.append(int((pr >= 2).sum())); fused.append(int((pr < 0).sum())); one.append(int((pr >= 1).sum()))
    rows2, fused, one = map(np.array, (rows2, fused, one))
    return dict(momentos=n, fundidas_pct=round(float(np.mean(one <= 1)) * 100, 1), filas_costura_2px_mediana=int(np.median(rows2)),
                filas_costura_2px_min=int(rows2.min()), menos_de_6_filas_pct=round(float(np.mean(rows2 < 6)) * 100, 1),
                filas_tocandose_mediana=int(np.median(fused)))


# --- la lámina -------------------------------------------------------------------------------------------------------
def crop_capture(name, role, scale=3, pad=6):
    im = Image.open(os.path.join(QA, f'{name}.png')).convert('RGB'); js = json.load(open(os.path.join(QA, f'{name}.json')))
    e = [e for e in js['elements'] if e['role'] == role][0]; x, y, w, h = e['imagePx']['ship']
    c = im.crop((x - pad, y - pad, x + w + pad, y + h + pad))
    return [t.resize((t.width * scale, t.height * scale), Image.NEAREST) for t in (c, gray(c))]


def main():
    out = os.path.join(RT.OUT, 'D107-goleta-relinga.png')
    med = {'antes_gb': measure(load('schooner_gb', 1)), 'despues_gb': measure(load('schooner_gb', 1, True))}
    med['despues_es'] = measure(load('schooner_es', 1, True))
    print(json.dumps(med, ensure_ascii=False))
    Wd = 2400; canvas = Image.new('RGB', (Wd, 6000), PAPER); d = ImageDraw.Draw(canvas); y = 30; X0 = 40
    def text(s, px, col=INK, w=500, dy=None, x=X0):
        nonlocal y
        d.text((x, y), s, fill=col, font=font(px, w)); y += dy or int(px * 1.45)
    def para(s, px=19, col=INK, maxw=Wd - 2 * X0, w=500):
        nonlocal y
        words, line = s.split(' '), ''
        for wd in words:
            t_ = (line + ' ' + wd).strip()
            if font(px, w).getlength(t_) > maxw: d.text((X0, y), line, fill=col, font=font(px, w)); y += int(px * 1.5); line = wd
            else: line = t_
        if line: d.text((X0, y), line, fill=col, font=font(px, w)); y += int(px * 1.5)
    def section(s):
        nonlocal y
        y += 18; text(s, 24, TITLE, 600)
    def row(tiles, gap=14, cap_px=16):
        """tiles: [(etiqueta, [imágenes que van pegadas])]; las coloca en fila y escribe la etiqueta encima."""
        nonlocal y
        x = X0; hmax = 0; y0 = y + int(cap_px * 1.5)
        for lab, ims in tiles:
            d.text((x, y), lab, fill=SOFT, font=font(cap_px, 600)); xx = x
            for im in ims: canvas.paste(im, (xx, y0)); xx += im.width
            hmax = max(hmax, max(im.height for im in ims)); x = max(xx, x + int(font(cap_px, 600).getlength(lab))) + gap
        y = y0 + hmax + 10

    text('Goleta: que no se confunda con el Bergantín en el móvil (D107)', 34, INK, 700, 52)
    para('En el móvil (390×844) la Goleta se dibuja con su modelo de lejos (LOD1). Con el barco a 45°, lo único que la distingue del Bergantín '
         'es que enseña 2 velas de cangreja y no 1, y lo único que separa esas 2 velas es el palo mayor, que asoma 1 píxel entre ellas y no siempre: '
         f'el balanceo del barco (±3°, distinto en cada barco) lo tapa en el {num(med["antes_gb"]["fundidas_pct"])} % de los momentos. Entonces las 2 velas se ven como una sola, grande, '
         'que se parece a la del Bergantín. Es lo que pasó en la prueba: con la británica, 3 de los 5 evaluadores las cambiaron entre sí, en grises; '
         'con la española y sin familia, el palo asomaba y acertaron todos. No es cosa de la familia: es suerte del balanceo.')
    para('La propuesta: una relinga oscura de 0,4 m (del color de los palos) en el borde de popa de la vela de proa, solo en el modelo de lejos y '
         'en las 2 familias. Como va pegada a la vela, la raya sale siempre, con cualquier balanceo. Lo que se aprueba: cómo se ve, para construirla.', col=INK)

    section('Lo que vieron los evaluadores: la captura del juego en 390×844, ampliada 3 veces (en color y en grises)')
    row([('Goleta británica: las 2 velas, fundidas en una', crop_capture('mobile-fleet-1-1-gb', 'schooner')),
         ('Bergantín británico: 1 vela grande', crop_capture('mobile-fleet-1-1-gb', 'brigantine'))], gap=40)
    row([('Goleta española: el palo asoma entre las 2 velas', crop_capture('mobile-fleet-1-1-es', 'schooner')),
         ('Goleta sin familia: el palo asoma entre las 2 velas', crop_capture('mobile-fleet-1-1-none', 'schooner'))], gap=40)

    section('Antes y después, en 390×844 (2,8 px por metro, modelo de lejos), con 3 momentos del balanceo; ampliado 2 veces')
    for fam, nom in (('gb', 'británica'), ('es', 'española')):
        for rel, lab in ((False, 'Antes'), (True, 'Después')):
            m = load(f'schooner_{fam}', 1, rel); tiles = []
            box = None
            for r in (-3.0, 0.0, 3.0):
                im, box = shot(m, f'schooner_{fam}', PPM_M, roll=r, box=None)
                im2 = im.resize((im.width * 2, im.height * 2), Image.NEAREST)
                tiles.append((f'{lab}, {nom}: balanceo {r:+.0f}°', [im2, gray(im2)]))
            row(tiles)
    b, _ = shot(load('brig_gb', 1), 'brig_gb', PPM_M); b2 = b.resize((b.width * 2, b.height * 2), Image.NEAREST)
    row([('Bergantín británico (no cambia), balanceo 0°', [b2, gray(b2)])])

    section('Detalle: la unión de las 2 velas de la Goleta británica, en grises, ampliada 6 veces')
    tiles = []
    for r in (-3.0, 3.0):
        a, box = shot(load('schooner_gb', 1), 'schooner_gb', PPM_M, roll=r)
        z, _ = shot(load('schooner_gb', 1, True), 'schooner_gb', PPM_M, roll=r, box=box)
        cx, cy = int(0.42 * a.width), int(0.36 * a.height); win = (cx - 30, cy - 34, cx + 30, cy + 34)
        for im, lab in ((a, 'Antes'), (z, 'Después')):
            g = gray(im).crop(win); tiles.append((f'{lab}, balanceo {r:+.0f}°', [g.resize((g.width * 6, g.height * 6), Image.NEAREST)]))
    row(tiles, gap=30)

    section('En 1440×900 (6,2 px por metro, modelo de cerca): no cambia')
    tiles = []
    for fam, nom in (('gb', 'británica'), ('es', 'española')):
        im, _ = shot(load(f'schooner_{fam}', 0), f'schooner_{fam}', PPM_D); tiles.append((f'Goleta {nom}, antes y después', [im, gray(im)]))
    im, _ = shot(load('brig_gb', 0), 'brig_gb', PPM_D); tiles.append(('Bergantín británico', [im, gray(im)]))
    row(tiles)

    section('Las 5 clases británicas en 390×844, a 45°, después (tamaño real y en grises)')
    tiles = []
    for cid, nom, rel in (('sloop_gb', 'Balandra', False), ('schooner_gb', 'Goleta', True), ('brig_gb', 'Bergantín', False),
                          ('frigate_gb', 'Fragata', False), ('navio_gb', 'Navío de línea', False)):
        im, _ = shot(load(cid, 1, rel), cid, PPM_M); tiles.append((nom, [im, gray(im)]))
    row(tiles, gap=24)

    section('Qué cambia')
    for s in ('Una relinga de 0,4 m de ancho, del color de los palos, en el borde de popa de la vela de cangreja de proa de la Goleta, por las 2 caras.',
              'Solo en el modelo de lejos (LOD1), que es el que se ve en el móvil y al alejar la cámara; de cerca la vela ya lleva su botavara, su pico y sus paños.',
              'En las 2 familias. El barco sin familia (el de hoy, que pinta el juego) puede llevar la misma relinga más adelante; hoy acierta por suerte, como la española.'):
        para('·  ' + s, 18)
    section('Lo que no cambia')
    for s in ('La clase: eslora, palos, velas, sin camareta ni castillos; las velas siguen claras, de jugador. Los colores de cada familia y la bandera.',
              'El Bergantín, la Balandra, la Fragata y el Navío, y la Goleta de cerca (1440×900).'):
        para('·  ' + s, 18)
    section('Lo que se mide')
    a, g_, e = med['antes_gb'], med['despues_gb'], med['despues_es']
    for s in (f'Las 2 velas, fundidas (costura de 1 fila o menos), en 200 momentos del balanceo a 45° en 390×844: hoy, el {num(a["fundidas_pct"])} %; con la relinga, el {num(g_["fundidas_pct"])} % (británica) y el {num(e["fundidas_pct"])} % (española).',
              f'Filas con una raya oscura de 2 px o más entre las 2 velas: hoy, {a["filas_costura_2px_mediana"]} de mediana (la raya del palo mide 1 px); con la relinga, {g_["filas_costura_2px_mediana"]} de mediana y {g_["filas_costura_2px_min"]} como mínimo.',
              'Lo que cuesta: 4 triángulos de lejos por Goleta y 156 bytes las 2 (la entrega de las 10 pasa de 1 015 687 a 1 015 843 bytes, con el tope en 1 020 000).',
              'Cómo se comprueba: se repite la prueba de las clases con evaluadores (las 6 imágenes, en las 3 familias); tienen que acertar 4 de 5 en cada una.'):
        para('·  ' + s, 18)
    section('En contra')
    for s in ('De cerca no lleva relinga: al alejar la cámara, en el cambio de modelo, aparece una raya fina en esa vela. Es un detalle de 2 píxeles.',
              'Con el barco casi de proa o de popa (0–15° y 180–210°) las 2 velas se siguen tapando entre sí; ahí la relinga no ayuda. La prueba es a 45°.'):
        para('·  ' + s, 18, RED)
    canvas = canvas.crop((0, 0, Wd, y + 30)); canvas.save(out)
    json.dump(med, open(os.path.join(RT.OUT, 'd107-medidas.json'), 'w'), ensure_ascii=False, indent=1)
    print(out, canvas.size)


AD37D_FILAS = 6  # AD-37 (d): filas con costura de ≥ 2 px en cada uno de los 200 momentos


def medir_cli(paths):
    """AD-37 (d) sobre npz de la cadena o sobre el rig.json del generador (su LOD1). Código 1 si alguno no cumple."""
    bad = 0
    for pth in paths:
        if pth.endswith('.json'):
            d = json.load(open(pth))['lod1']; P = np.array(d['pos'], float).reshape(-1, 3); C = np.array(d['col'], float).reshape(-1, 3)
        else:
            z = np.load(pth); P, C = z['p'].astype(float), z['c'].astype(float)
        r = measure(dict(p=P, c=C, t=np.zeros((len(P), 2)), r=np.zeros(len(P))))
        r['cumple'] = r['filas_costura_2px_min'] >= AD37D_FILAS; bad += not r['cumple']
        print(os.path.basename(pth), json.dumps(r, ensure_ascii=False), flush=True)
    print('AD-37 (d):', 'cumple' if not bad else f'{bad} no cumplen (hacen falta ≥ {AD37D_FILAS} filas en los 200 momentos)')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--medir':
        medir_cli(sys.argv[2:])
    main()

# Uso (desde la raíz del repo), tras scripts/ux/barcos/galeon.py (ver su cabecera; la misma UX_OUT):
#   python3 -I scripts/ux/laminas/lamina_galeon.py  →  $UX_OUT/D88-galeon.png
# Lámina del Galeón del tesoro (GDD §9, P2; D88) para Jonattan, con el estilo de las familias (E17): de lado, desde arriba,
# como en el juego y en grises, a la misma escala que el Mercante de hoy y el Navío español del piloto (D80), de cerca, y su
# placa, su aviso y su marcador del minimapa. Render por software con la luz del juego (scripts/ux/mapa/render_tex.py,
# sin turno de máquina). Lee el Galeón y el Mercante de $UX_OUT/galeon y el Navío español de UX_PILOTO (por defecto,
# $UX_OUT/piloto: navio_es_lod0.npz y atlas_es.png de scripts/ux/barcos/navio.py). Escribe en UX_OUT, nunca en
# docs/game/art/. No corre en la CI.
import sys, os, json, math
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'mapa'))
import rutas as RT
import tienda as T
import render_tex as RTX
import lamina_minimapa as LM
import numpy as np
from PIL import Image, ImageDraw, ImageFont

GD = os.path.join(RT.OUT, 'galeon'); PIL_ = os.environ.get('UX_PILOTO', os.path.join(RT.OUT, 'piloto'))
SEA = np.array([26, 95, 134.0]) / 255; SKY = np.array([226, 234, 239.0]) / 255
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42); ANN = (0, 112, 192)
def font(px, w=600): return T.font(px, w)
def atlas(path): return RTX.srgb2lin(np.asarray(Image.open(RT.need(path, path)).convert('RGB'), float))

GA = atlas(os.path.join(GD, 'atlas_galeon.png')); g0 = np.load(RT.need(os.path.join(GD, 'galeon_lod0.npz'), 'galeon_lod0.npz (barcos/galeon.py)'))
EA = atlas(os.path.join(PIL_, 'atlas_es.png')); e0 = np.load(RT.need(os.path.join(PIL_, 'navio_es_lod0.npz'), 'navio_es_lod0.npz (barcos/navio.py)'))
HOY = json.load(open(os.path.join(GD, 'galeon-rig.json')))  # el Mercante y el Pirata de hoy, del generador del juego
def hoy(key):
    P = np.array(HOY[key]['pos']).reshape(-1, 3); C = np.array(HOY[key]['col']).reshape(-1, 3)
    return P, np.tile(np.array([1008 / 1024, 1 - 1008 / 1024]), (len(P), 1)), C, GA  # UV en el texel blanco (R['white'] de navio.py)
SHIPS = {'mer': hoy('merchant'), 'gal': (g0['p'], g0['t'], g0['c'], GA), 'es': (e0['p'], e0['t'], e0['c'], EA), 'pir': hoy('pirate')}
CLIP = {k: RTX.clip_below_water(*v[:3]) for k, v in SHIPS.items()}


def shot(key, th, hd, ppm, W, H, ox, oy, sky_line=None, gray=False):
    P, UVc, Cc, _ = CLIP[key]; rgb, cov = RTX.render(P, UVc, Cc, SHIPS[key][3], ppm, W, H, ox, oy, th, SS=3, heading_deg=hd)
    bg = np.tile(SEA, (H, W, 1))
    if sky_line is not None: bg[:sky_line] = SKY
    img = rgb + bg * (1 - cov[..., None])
    if gray:
        lin = RTX.srgb2lin(img * 255); y = lin @ np.array([0.2126, 0.7152, 0.0722])
        y = np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(np.maximum(y, 0), 1 / 2.4) - 0.055); img = np.repeat(y[..., None], 3, axis=2)
    return Image.fromarray(np.clip(img * 255, 0, 255).astype(np.uint8)), cov


def area(key, hd, ppm=2.82):
    """Área en px CSS de la máscara del barco en 390×844 a 1,0× (2,82 px/m) con la cámara del juego (AD-41 b)."""
    _, cov = shot(key, 55, hd, ppm, 160, 160, 80, 80); return float(cov.sum())


# --- placa, aviso y marcador (las reglas de world-overlays.css y de .toast en globals.css)
def plate(name, px_scale=3):
    S = px_scale; tw_ = T.tw(name, 12, 'label600'); w = max(12 + 3 + tw_, 64) + 12 + 2; h = 2 + 16 + 1 + 12 + 2 + 2
    im = Image.new('RGBA', (round((w + 16) * S), round((h + 16) * S)), tuple(int(c * 255) for c in SEA) + (255,)); p = T.Pen(im, S)
    plate_bg = tuple(round(a * 0.85 + b * 0.15) for a, b in zip((6, 17, 26), (int(SEA[0] * 255), int(SEA[1] * 255), int(SEA[2] * 255))))
    p.rect(8, 8, 8 + w, 8 + h, fill=plate_bg, radius=4)
    p.paste(T.raster('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6CC3F5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                     '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>', 12 * S, 'moneda-6cc3f5'), 8 + 7, 8 + 3 + 2)
    p.text(8 + 7 + 15, 8 + 3, name, 12, 'label600', '#6CC3F5', lh=16 / 12)
    p.rect(8 + 7, 8 + 3 + 16 + 1, 8 + 7 + 66, 8 + 3 + 16 + 1 + 7, fill='#000000')
    p.rect(8 + 8, 8 + 3 + 16 + 2, 8 + 8 + 64, 8 + 3 + 16 + 2 + 5, fill='#6CC3F5')
    return im.convert('RGB'), w


def toast(text, width, S=2):
    cw = width - 4 - 24; lines = []; cur = ''
    for wd in text.split(' '):
        s_ = (cur + ' ' + wd).strip()
        if cur and T.tw(s_, 14, 500) > cw: lines.append(cur); cur = wd
        else: cur = s_
    lines.append(cur); h = max(36, 12 + 21 * len(lines))
    im = Image.new('RGBA', (round((width + 24) * S), round((h + 24) * S)), tuple(int(c * 255) for c in SEA) + (255,)); p = T.Pen(im, S)
    bgc = tuple(round(a * 0.85 + b * 0.15) for a, b in zip((11, 26, 36), (int(SEA[0] * 255), int(SEA[1] * 255), int(SEA[2] * 255))))
    p.rect(12, 12, 12 + width, 12 + h, fill=bgc, radius=6); p.rect(12, 12, 16, 12 + h, fill='#F2C14E')
    y = 12 + (h - 21 * len(lines)) / 2
    for i, ln in enumerate(lines): p.text(12 + 4 + 12, y + 21 * i, ln, 14, 500, '#F5F1E6')
    return im.convert('RGB'), lines, max(T.tw(l, 14, 500) for l in lines)


if __name__ == '__main__':
    SW = 1980; sheet = Image.new('RGB', (SW, 3600), PAPER); d = ImageDraw.Draw(sheet)
    def label(x, y, t, c=SOFT, f=None): d.text((x, y), t, font=f or font(15, 500), fill=c)
    def frame(im, x, y, c=(120, 110, 95)): sheet.paste(im, (x, y)); d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=c, width=1)
    def para(x, y, w, t, f=None, c=INK, lh=22):
        f = f or font(15, 500); line = ''
        for wd in t.split():
            s_ = (line + ' ' + wd).strip()
            if d.textlength(s_, font=f) > w: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
            else: line = s_
        d.text((x, y), line, font=f, fill=c); return y + lh

    d.text((40, 22), 'Galeón del tesoro: el barco del evento, con el estilo de las familias', font=font(30), fill=INK)
    for i, t in enumerate(('A la misma escala (6 px por metro), junto al Mercante y al Pirata de hoy y al Navío español del barco piloto. Dibujado con la luz del juego,',
                           'con textura. Aún no está construido. Es un barco pasivo de evento (no ataca): aparece en el mapa con un aviso, lleva escolta pirata y oro.')):
        label(40, 62 + 22 * i, t, f=font(16, 500))
    W, gap = 370, 16
    cols = [('mer', 'Mercante (hoy)', '22 × 7,6 m · pasivo'), ('gal', 'Galeón del tesoro  (NUEVO)', '36 × 12 m · pasivo · 0 cañones · 4 palos'),
            ('es', 'Navío de línea español (piloto)', '42 × 11,2 m · del jugador · 10 cañones por banda'),
            ('pir', 'Pirata (hoy), su escolta', '20 × 5 m · hostil · 4 cañones por banda')]
    rows = [('De lado (proa a la derecha)', dict(th=0, hd=56, ppm=6, W=W, H=262, ox=175, oy=228), 228, False),
            ('Desde arriba', dict(th=90, hd=90, ppm=6, W=W, H=112, ox=165, oy=56), None, False),
            ('Como en el juego (cámara a 55°, rumbo 135°)', dict(th=55, hd=135, ppm=6, W=W, H=236, ox=175, oy=166), None, False),
            ('En grises, como en el juego', dict(th=55, hd=135, ppm=6, W=W, H=236, ox=175, oy=166), None, True)]
    y = 120
    for title_, v, sky, gray in rows:
        d.text((40, y), title_, font=font(18), fill=TITLE); y += 30
        for i, (key, name, sub) in enumerate(cols):
            im, _ = shot(key, v['th'], v['hd'], v['ppm'], v['W'], v['H'], v['ox'], v['oy'], sky_line=sky, gray=gray); frame(im, 40 + i * (W + gap), y)
        y += v['H'] + 18
    for i, (key, name, sub) in enumerate(cols):
        d.text((40 + i * (W + gap), y), name, font=font(19), fill=INK); label(40 + i * (W + gap), y + 28, sub)
    y += 70
    # columna de texto a la derecha
    tx = 40 + 4 * (W + gap) + 14; tw_ = SW - tx - 30; ty = 120
    d.text((tx, ty), 'Qué lo distingue', font=font(18), fill=TITLE); ty += 30
    for t in ('Del Mercante: el doble de largo, 4 palos, popa alta dorada con galerías y faroles, una banda de oro en el casco y cofres en cubierta.',
              'Del Navío español: casco de madera con banda de oro y sin portas (el español es rojo con 2 filas de portas abiertas), velas crema a franjas azules (el español lleva la cruz de Borgoña), 4 palos en vez de 3 y la carga a la vista.',
              'Del Pirata de su escolta: velas claras a franjas (las del pirata son negras), casco de madera y oro (el del pirata es negro con franja roja), sin cañones, con los palos rectos y casi el doble de eslora (36 frente a 20 m).',
              'Se lee como pasivo, igual que el Mercante: velas claras a franjas azules, ningún cañón y la bandera azul del Mercante.'):
        ty = para(tx, ty, tw_, t) + 8
    d.text((tx, ty + 6), 'En contra', font=font(18), fill=RED); ty += 36
    for t in ('Dorado y popa alta, como el Navío español: por eso el casco es de madera, sin rojo ni portas, y las velas son las del Mercante. En grises (4.ª fila) los separan las franjas de las velas y la cubierta llena de carga.',
              'Es el barco con más detalle de la escena del evento y lleva 2 piratas de escolta: aun así, con 2 922 triángulos, cabe en el presupuesto de las familias (5 000).'):
        ty = para(tx, ty, tw_, t, c=RED) + 8
    d.text((tx, ty + 6), 'Lo que no cambia', font=font(18), fill=TITLE); ty += 36
    ty = para(tx, ty, tw_, 'Lo que hace en el juego (GDD §9): no ataca, huye, lleva escolta y oro. Sus medidas son las de la receta: 36 × 12 m, perfil lleno, 4 palos y sin cañones.') + 8

    # de cerca
    d.text((40, y), 'De cerca (11 px por metro)', font=font(18), fill=TITLE); y += 30
    cerca, _ = shot('gal', 30, 118, 11, 760, 420, 380, 300); frame(cerca, 40, y)
    pop, _ = shot('gal', 25, 200, 14, 420, 420, 210, 300); frame(pop, 40 + 760 + 20, y)
    label(40, y + 426, 'De tres cuartos'); label(820, y + 426, 'La popa: galerías, ventanas encendidas y 3 faroles')
    y += 470

    # placa, aviso y marcador
    d.text((40, y), 'En el juego: su placa, su aviso al aparecer y su marcador del minimapa', font=font(18), fill=TITLE); y += 30
    pl, pw = plate('Galeón del tesoro'); frame(pl, 40, y); label(40, y + pl.height + 6, f'Placa, al triple: {pw:.0f} px de ancho (el tope es 142)')
    tx0 = 40 + pl.width + 40
    msg = '¡Galeón del tesoro en el noroeste, sector B10!'
    t1, l1, w1 = toast(msg, 360); frame(t1, tx0, y); label(tx0, y + t1.height + 6, f'Aviso en escritorio y móvil, al doble: 1 línea ({w1:.0f} de 332 px)')
    t2, l2, w2 = toast(msg, 300); frame(t2, tx0, y + t1.height + 40); label(tx0, y + t1.height + 40 + t2.height + 6, f'En el móvil apaisado (300 px): {len(l2)} líneas')
    sc = dict(LM.SCENE, view=((80, -150), (320, 30)))
    mm = LM.minimap(182, 1, '1.1', sc); gx, gz = LM.SCENE['galleon'][0]; cx_, cy_ = (gx + 500) * 0.182, (gz + 500) * 0.182
    crop = mm.crop((int(cx_ - 30), int(cy_ - 30), int(cx_ + 30), int(cy_ + 30))).resize((240, 240), Image.NEAREST)
    mx = tx0 + t1.width + 40; frame(crop, mx, y); label(mx, y + 246, 'Su marcador, al cuádruple')
    y += max(pl.height + 40, t1.height + t2.height + 90, 290)

    # medidas
    ar = {hd: area('gal', hd) / area('mer', hd) for hd in (45, 135, 225, 315)}
    arp = {hd: area('gal', hd) / area('pir', hd) for hd in (45, 135, 225, 315)}
    tri = [len(np.load(os.path.join(GD, f'galeon_lod{l}.npz'))['p']) // 3 for l in (0, 1)]
    d.text((40, y), 'Medidas', font=font(18), fill=TITLE); y += 30
    for t in (f'Triángulos: {tri[0]} de cerca y {tri[1]} de lejos (presupuesto de las familias: 5000 y 1200).',
              'Tamaño en pantalla frente al Mercante, en el móvil (390×844) con la cámara del juego: ' + ', '.join(f'{v:.2f}×' for v in ar.values()).replace('.', ',') + ' en los rumbos 45, 135, 225 y 315° (se pide al menos 1,6×). Frente al Pirata: ' + ', '.join(f'{v:.2f}×' for v in arp.values()).replace('.', ',') + '.',
              f'Aviso: «{msg}», el más largo posible (46 letras): {w1:.0f} px en una línea en escritorio y móvil; en el apaisado, {len(l2)} líneas.'):
        y = para(40, y, SW - 80, t) + 6
    sheet = sheet.crop((0, 0, SW, y + 20))
    out = os.path.join(RT.OUT, 'D88-galeon.png'); sheet.save(out, optimize=True)
    print(out, sheet.size, 'tris', tri, 'áreas', {k: round(v, 2) for k, v in ar.items()}, 'pirata', {k: round(v, 2) for k, v in arp.items()}, 'aviso', round(w1, 1), len(l2), 'placa', round(pw, 1))

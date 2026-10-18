# Uso (desde la raíz del repo): UX_D76=<carpeta de las capturas de D76> python3 -I scripts/ux/laminas/lamina_ascenso.py
#   →  $UX_OUT/D70-ascenso.png
# Lámina del ascenso de rango (VFX-SPEC §16 y la línea del registro de ART-DIRECTION §12.9; AC-159) para Jonattan. Aún no
# está construido: el efecto se modela con la receta de §16 (anillos y chispas, con su cinemática) y se pinta encima de
# capturas reales del candidato 4a125e0 (las de D76): tu Balandra justo al ascender a Contramaestre (C4) y otro jugador
# a 35 m (C6). La línea «X asciende a Y» se monta sobre la línea real del registro (C5) y el aviso real del móvil (C4), con
# la insignia dibujada desde su SVG (scripts/ux/calibracion/insignias-1-1.json, con rsvg-convert) y la Barlow del juego.
# Aproximaciones: los anillos se pintan encima del casco (en el juego pasan por detrás) y las chispas se suman en sRGB.
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, math, json, subprocess, random
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import rutas as RT
import numpy as np
from PIL import Image, ImageDraw, ImageFont

CAP = os.environ.get('UX_D76', os.path.join(RT.OUT, 'ux-d76-capturas'))
def font(px, w=600): return ImageFont.truetype(RT.FONTS + RT.FF[w], px, layout_engine=ImageFont.Layout.RAQM)
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42)
S55, C55 = math.sin(math.radians(55)), math.cos(math.radians(55))
def cap(name): return Image.open(RT.need(os.path.join(CAP, name), f'captura {name} (UX_D76)')).convert('RGB')
def hexc(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float) / 255
GOLD, OUTL, SP0, SP1 = hexc('#FFD166'), hexc('#07121B'), hexc('#FFE9A8'), hexc('#F2C14E')


def insignia(rank, px):
    """La insignia de hoy (D74) desde su SVG, rasterizada con librsvg al tamaño pedido."""
    ins = json.load(open(os.path.join(RT.REPO, 'scripts', 'ux', 'calibracion', 'insignias-1-1.json')))['insignias'][rank]
    svg = os.path.join(RT.OUT, f'ins-{rank}.svg'); png = os.path.join(RT.OUT, f'ins-{rank}-{px}.png')
    open(svg, 'w').write(ins['svg'])
    subprocess.run(['rsvg-convert', '-w', str(px), '-h', str(px), svg, '-o', png], check=True)
    return Image.open(png).convert('RGBA')


def ring_r(R, tau):
    """Radio del anillo de §16 a los tau s de su salida: de 0,6·R a 2,0·R en 900 ms, ease-out."""
    return R * (0.6 + 1.4 * (1 - (1 - min(max(tau, 0), 0.9) / 0.9) ** 3))


def sparks(seed, R):
    """Las 32 chispas de §16 (D84): salen en 600 ms del borde del primer anillo, en su radio de ese instante y a un rumbo
    al azar, y saltan hacia arriba y hacia fuera. Así se ven contra el agua: desde la cubierta quedaban dentro de las velas."""
    rng = random.Random(seed); out = []
    for k in range(32):
        a = rng.uniform(0, 2 * math.pi); t0 = 0.6 * k / 32; r = ring_r(R, t0); out_v = rng.uniform(1.0, 2.0)
        out.append({'t0': t0, 'life': rng.uniform(0.8, 1.2), 'p0': np.array([r * math.cos(a), 0.2, r * math.sin(a)]),
                    'v0': np.array([out_v * math.cos(a), rng.uniform(4, 7), out_v * math.sin(a)])})
    return out


def effect(img, cx, cy, ppm, R, L, B, yd, t, dpr=1, seed=7, reduced=False):
    """El efecto de §16 en el instante t (s) sobre la captura, con el barco en el píxel (cx, cy). ppm en px CSS por metro."""
    SS = 4; W, H = img.size
    ring = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0)); dr = ImageDraw.Draw(ring)
    def ellipse(r, w, col, a):
        rx = r * ppm * dpr * SS; ry = rx * S55; c = tuple(int(255 * v) for v in col) + (int(255 * a),)
        dr.ellipse((cx * SS - rx, cy * SS - ry, cx * SS + rx, cy * SS + ry), outline=c, width=max(1, round(w * dpr * SS)))
    if reduced:   # sin chispas: los anillos aparecen ya en su radio final y se desvanecen en 600 ms
        a = max(0.0, 1 - t / 0.6)
        if a > 0: ellipse(2.0 * R, 3.5, OUTL, 0.6 * a); ellipse(2.0 * R, 1.5, GOLD, a)
    else:
        for k in (0, 1):
            tau = t - 0.2 * k
            if not 0 <= tau <= 0.9: continue
            r = ring_r(R, tau); w = 4 - 2.5 * tau / 0.9
            a = 1.0 if tau < 0.6 else 1 - (tau - 0.6) / 0.3
            ellipse(r, w + 2, OUTL, 0.6 * a); ellipse(r, w, GOLD, a)
    ring = ring.resize((W, H), Image.LANCZOS)
    out = Image.alpha_composite(img.convert('RGBA'), ring)
    if reduced: return out.convert('RGB')
    add = Image.new('RGB', (W * SS, H * SS), (0, 0, 0)); da = ImageDraw.Draw(add); k_, g = 1.5, np.array([0, -2.0, 0])
    for s in sparks(seed, R):
        tau = t - s['t0']
        if not 0 <= tau <= s['life']: continue
        f = tau / s['life']; ex = math.exp(-k_ * tau)
        p = s['p0'] + g / k_ * tau + (s['v0'] - g / k_) * (1 - ex) / k_; v = (s['v0'] - g / k_) * ex + g / k_
        sx, sy = cx + p[0] * ppm * dpr, cy - (p[1] * C55 - p[2] * S55) * ppm * dpr
        vx, vy = v[0], -(v[1] * C55 - v[2] * S55); n = math.hypot(vx, vy) or 1
        size = max((0.8 - 0.5 * f) * ppm * dpr, 3 * dpr); ln = 1.5 * size
        col = tuple(int(255 * c * (1 - f)) for c in SP0 * (1 - f) + SP1 * f)
        ux, uy = vx / n * ln / 2, vy / n * ln / 2
        da.line(((sx - ux) * SS, (sy - uy) * SS, (sx + ux) * SS, (sy + uy) * SS), fill=col, width=round(size * SS))
        da.ellipse(((sx - size / 2) * SS, (sy - size / 2) * SS, (sx + size / 2) * SS, (sy + size / 2) * SS), fill=col)
    add = np.asarray(add.resize((W, H), Image.LANCZOS), float)
    return Image.fromarray(np.clip(np.asarray(out.convert('RGB'), float) + add, 0, 255).astype(np.uint8))


# --- escenas
C4d, C4m, C6d, C5d = cap('C4-1440x900.png'), cap('C4-390x844.png'), cap('C6-1440x900.png'), cap('C5-1440x900.png')
OWN = dict(cx=720, cy=450, ppm=6.2, R=9.0, L=16, B=5.0, yd=1.4)          # tu Balandra, al centro (C4, escritorio)
OWNM = dict(cx=195, cy=422, ppm=2.82, R=9.0, L=16, B=5.0, yd=1.4)        # la misma, en 390×844 (DPR 2)
OTHER = dict(cx=936, cy=446, ppm=6.2, R=13.0, L=24, B=7.0, yd=1.8)       # otro jugador, un Bergantín a 35 m (C6)
TIMES = (0.15, 0.4, 0.7, 1.0, 1.5)
def dom_boxes(img, regions):
    """Cajas de las placas (DOM, por encima del canvas, ART-DIRECTION §12.6): los píxeles muy oscuros de su fondo
    `--ui-plate` dentro de cada región aproximada, más 2 px de margen."""
    a = np.asarray(img, int).sum(2); out = []
    for (x0, y0, x1, y1) in regions:
        ys, xs = np.nonzero(a[y0:y1, x0:x1] < 110)
        out.append((x0 + xs.min() - 2, y0 + ys.min() - 2, x0 + xs.max() + 3, y0 + ys.max() + 3))
    return out
def shot(img, p, t, box, dpr=1, reduced=False, seed=7, dom=()):
    im = effect(img, p['cx'] * dpr, p['cy'] * dpr, p['ppm'], p['R'], p['L'], p['B'], p['yd'], t, dpr=dpr, seed=seed, reduced=reduced)
    for b in dom: im.paste(img.crop(b), b[:2])
    return im.crop(box)
own_box = (720 - 160, 450 - 135, 720 + 160, 450 + 95)
DOM_D = dom_boxes(C4d, [(640, 495, 790, 545)]); DOM_M = dom_boxes(C4m, [(236, 880, 500, 965)]); DOM_O = dom_boxes(C6d, [(640, 495, 790, 545), (870, 500, 1000, 548)])
own = [shot(C4d, OWN, t, own_box, dom=DOM_D) for t in TIMES]
mob_box = (390 - 170, 844 - 150, 390 + 170, 844 + 110)
mob = [shot(C4m, OWNM, t, mob_box, dpr=2, dom=DOM_M) for t in (0.4, 1.0)]
oth_box = (936 - 250, 446 - 200, 936 + 230, 446 + 140)
oth = shot(C6d, OTHER, 0.55, oth_box, seed=11, dom=DOM_O)
red = shot(C4d, OWN, 0.2, own_box, reduced=True, dom=DOM_D)

# --- la línea del registro: escritorio (sobre la línea real de C5) y móvil (sobre el aviso real de C4)
def feed_desktop(name, rank_key, rank_name):
    im = C5d.crop((0, 846, 470, 896)); im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS); d = ImageDraw.Draw(im)
    d.rectangle((34, 28, 750, 72), fill=(17, 45, 63))                  # al doble: el texto de antes, tapado con el fondo del panel
    ins = insignia(rank_key, 32); im.paste(ins, (54, 34), ins)
    d.text((54 + 32 + 8, 33), f'{name} asciende a {rank_name}', font=font(26, 500), fill=(245, 241, 230))
    return im
def feed_mobile(name, rank_key, rank_name):
    im = C4m.crop((0, 476, 780, 576)).copy(); d = ImageDraw.Draw(im)
    d.rectangle((34, 14, 41, 86), fill=(108, 195, 245))                # borde de tipo info (`--ui-info`): no es tu logro
    d.rectangle((44, 18, 744, 84), fill=(14, 36, 51))
    ins = insignia(rank_key, 32); im.paste(ins, (66, 34), ins)
    d.text((66 + 32 + 12, 30), f'{name} asciende a {rank_name}', font=font(30, 500), fill=(245, 241, 230))
    return im
fd = feed_desktop('Invitado 1NRB', 'contramaestre', 'Contramaestre'); fm = feed_mobile('Invitado 1NRB', 'contramaestre', 'Contramaestre')
fd2 = feed_desktop('Barbarroja Negra', 'teniente', 'Teniente')

# --- hoja
SW = 2000; sheet = Image.new('RGB', (SW, 4000), PAPER); d = ImageDraw.Draw(sheet)
def frame(im, x, y):
    sheet.paste(im, (x, y)); d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=(120, 110, 95), width=1)
def label(x, y, t, c=SOFT, f=None): d.text((x, y), t, font=f or font(15, 500), fill=c)
def para(x, y, w, t, f=None, c=INK, lh=24):
    f = f or font(16, 500); line = ''
    for wd in t.split():
        s = (line + ' ' + wd).strip()
        if d.textlength(s, font=f) > w: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
        else: line = s
    d.text((x, y), line, font=f, fill=c); return y + lh
d.text((40, 22), 'Ascenso de rango: el barco lo celebra y los demás lo ven', font=font(32), fill=INK)
y = 70
for t in ('Por construir. El efecto sale de su receta (anillos dorados y chispas) pintado encima de capturas reales del juego; la línea del registro se monta sobre la real.',
          'Solo pasa al cambiar de insignia: 4 veces en todo el juego (Marinero, Contramaestre, Teniente y Almirante). Subir de nivel sin cambiar de insignia no tiene efecto en el mar.'):
    label(40, y, t, f=font(17, 500)); y += 26
y += 14
d.text((40, y), 'Tu barco al ascender a Contramaestre (escritorio, a tamaño real): 2 anillos dorados se abren y sueltan 32 chispas', font=font(21), fill=TITLE); y += 36
x = 40
for im, t in zip(own, TIMES):
    frame(im, x, y); label(x, y + im.height + 6, f'{t:.2f} s'.replace('.', ',')); x += im.width + 18
y += own[0].height + 40
d.text((40, y), 'En el móvil (390×844, al doble)', font=font(21), fill=TITLE)
d.text((40 + 2 * (mob[0].width + 18) + 30, y), 'Otro jugador asciende a 35 m de ti (escritorio, 0,55 s)', font=font(21), fill=TITLE); y += 36
x = 40
for im, t in zip(mob, (0.4, 1.0)):
    frame(im, x, y); label(x, y + im.height + 6, f'{t:.1f} s'.replace('.', ',')); x += im.width + 18
xo = x + 30; frame(oth, xo, y)
label(xo, y + oth.height + 6, 'Los anillos de un Bergantín se abren hasta 26 m: se ve desde cualquier punto de la pantalla')
y += max(mob[0].height, oth.height) + 44
d.text((40, y), 'Lo que leen los demás en su registro (es lo único que dice quién asciende)', font=font(21), fill=TITLE); y += 36
frame(fd, 40, y); label(40, y + fd.height + 6, 'Escritorio, al doble, sobre la línea real del registro')
frame(fd2, 40, y + fd.height + 40); label(40, y + 2 * fd.height + 46, 'El caso de un nombre largo, con la insignia de Teniente')
frame(fm, 40 + fd.width + 40, y); label(40 + fd.width + 40, y + fm.height + 6, 'Móvil, al doble: como aviso, con el borde azul de información (no es tu logro)')
y += 2 * fd.height + 90
d.text((40, y), 'Con «reducir movimiento» activado en el sistema: sin chispas; los anillos aparecen ya abiertos y se apagan en 0,6 s', font=font(21), fill=TITLE); y += 36
frame(red, 40, y); label(40, y + red.height + 6, '0,20 s'); y += red.height + 44
BLOCKS = [
    ('Por qué así', INK, [
        'El ascenso es un logro que se ve en el mar: dorado, el color del oro y de los logros del juego, con anillos que se abren y sueltan chispas contra el agua, para que se vea de lejos sin tapar a nadie.',
        'Los anillos son continuos y no giran, para no confundirse con el anillo de tu objetivo, que es discontinuo y gira.',
        'Nada se dibuja encima de las placas de nombre: el efecto va en el mar, por debajo. La insignia de la placa cambia en el mismo instante en que empieza.']),
    ('Coste', INK, ['32 chispas y 2 anillos por ascenso, en los mismos grupos de efectos de hoy: ninguna llamada de dibujo nueva.']),
    ('En contra', RED, [
        'Dura 1,8 s, y en un combate cerrado los anillos (hasta el doble del tamaño de tu barco) pasan por debajo de los barcos de al lado. No tapan placas ni barras.',
        'Los demás no ven tu nuevo nivel en el mar, solo la insignia en tu placa y la línea del registro, que en móvil compite con los demás avisos (como mucho se ven 3).']),
]
for t, colr, lines in BLOCKS:
    d.text((40, y), t, font=font(19), fill=TITLE if colr != RED else RED); y += 30
    for ln in lines: y = para(56, y, SW - 110, '·  ' + ln, c=colr) + 2
    y += 12
sheet = sheet.crop((0, 0, SW, y + 20))
out = os.path.join(RT.OUT, 'D70-ascenso.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

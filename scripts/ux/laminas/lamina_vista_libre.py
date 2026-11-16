# Uso (desde la raíz del repo): UX_D89=<carpeta de las capturas> python3 -I scripts/ux/laminas/lamina_vista_libre.py
#   →  $UX_OUT/D89-vista-libre.png
# Lámina de la vista libre (E13; ART-DIRECTION §12.8, D89) para Jonattan: el botón Centrar, el indicador del barco propio y
# el de atacante en los 3 tamaños, dibujados sobre capturas reales del candidato 4a125e0 (qa:capture de QA:
# desktop-open-sea, mobile-open-sea y landscape-danger-mark). En la vista libre se borra el barco propio de la captura con
# agua clonada de la misma fila o columna de la rejilla de 100 m. place() coloca cada indicador con la regla de §12.8
# (rayo, marco útil, bloques del HUD, deslizamiento por el borde y triángulo desde la posición final), y la pista de primera
# sesión cambia de ranura con las cajas de AC-110. El minimapa se redibuja con el modelo de lamina_minimapa.py (D87). Las
# capturas de móvil vienen a DPR 2 y se dibuja a esa escala. Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, math
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import rutas as RT
import tienda as T
import lamina_minimapa as LM
import numpy as np
from PIL import Image, ImageDraw, ImageChops, ImageFilter

CAP = os.environ.get('UX_D89', os.path.join(RT.OUT, 'ux-d89-capturas'))
Q = 4                                    # supersampling de las formas
SIN = math.sin(math.radians(55))         # cámara a 55°: en pantalla, 1 m de Z mide ppm · sen 55°
PANEL = (11, 26, 36, 0.85); PLATE = (6, 17, 26, 0.85); LINE = (242, 193, 78, 0.35)   # --ui-panel, --ui-plate, --ui-line
TXT, DIM, SELF, HOST, PLAY, INKD = '#F5F1E6', '#A9B8C2', '#FFD166', '#FF7A7A', '#F5F1E6', '#0B1A24'
STAR = 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z'
ICON = {  # src/components/hud/icons.tsx (24 × 24, trazo de 2), el de Centrar de D89 y bomb y locate-fixed de Lucide (ISC)
    'star': f'<path d="{STAR}"/>',
    'skull': '<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.3 3 5.4V20h10v-3.6c1.8-1.1 3-2.8 3-5.4a8 8 0 0 0-8-8Z"/>'
             '<circle cx="9" cy="11.5" r="1.6"/><circle cx="15" cy="11.5" r="1.6"/><path d="M10 20v-2.5M14 20v-2.5"/>',
    'anchor': '<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V21M7 11h10M4 14a8 7 0 0 0 16 0"/>',
    'crown': '<path d="M4 18 2 7l5 5 5-8 5 8 5-5-2 11Z"/><path d="M5 21h14"/>',
    'bomb': '<circle cx="11" cy="13" r="9"/><path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95"/>'
            '<path d="m22 2-1.5 1.5"/>',  # lucide-static 0.469.0: el 2.º icono de la cañonera (§4.3), aún sin construir
    'crosshair': '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    'wrench': '<path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-1.5 1.5a6 6 0 0 1-6.6 1.3L7 21.6a2 2 0 0 1-2.8-2.8L10 13a6 6 0 0 1 1.3-6.6L12.8 5l1.7 1.5Z"/>',
    'store': '<path d="M3 9 5 4h14l2 5M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M5 13v8h14v-8M10 21v-5h4v5"/>',
    # Centrar (D89, dibujo propio): 4 esquinas de visor y la estrella del barco propio a 0,58 con el mismo trazo de 2 px
    'centrar': '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/>'
               f'<g transform="translate(12 12) scale(0.58) translate(-12 -11.5)" stroke-width="3.45"><path d="{STAR}"/></g>',
    'locate': '<path d="M2 12h3M19 12h3M12 2v3M12 19v3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>'}
SIZES = {'desk': (44, 36), 'touch': (48, 40)}   # chip: diámetro del círculo y lado del rombo (px CSS)
PAIRS = {'captain': ('crown', 'skull'), 'gunboat': ('bomb', 'skull')}   # 2 iconos en columna, como RelationIcon (Hud.tsx)


def rgba(c):
    return T.hexrgb(c) + (255,) if isinstance(c, str) else tuple(c[:3]) + (round(c[3] * 255),)


def icon(name, px, color, k=1):
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="2" '
           'stroke-linecap="round" stroke-linejoin="round">%s</svg>' % (color, ICON[name]))
    return T.raster(svg, max(1, round(px * k)), f'd89-{name}-{color[1:]}')


def _mask(w, h, r, k, inset=0.0):
    m = Image.new('L', (max(1, round(w * k)), max(1, round(h * k))), 0)
    ImageDraw.Draw(m).rounded_rectangle((inset * k, inset * k, (w - inset) * k - 1, (h - inset) * k - 1), max(0.0, r - inset) * k, fill=255)
    return m


def paint(base, S, xy, mask, color):
    """`color` (con su alfa) sobre base a través de una máscara supersampleada, con la esquina en xy (px CSS)."""
    m = mask.resize((round(mask.width / Q), round(mask.height / Q)), Image.LANCZOS)
    c = rgba(color); L = Image.new('RGBA', m.size, c[:3] + (0,))
    L.putalpha(Image.fromarray((np.asarray(m, float) * c[3] / 255).round().astype(np.uint8)))
    base.alpha_composite(L, (round(xy[0] * S), round(xy[1] * S)))


def rrect(base, S, box, fill=None, outline=None, width=1, radius=0):
    """Caja con borde como en CSS: el fondo llega bajo el borde (background-clip: border-box) y el borde va encima."""
    x0, y0, x1, y1 = box; w, h = x1 - x0, y1 - y0; k = S * Q; outer = _mask(w, h, radius, k)
    if fill: paint(base, S, (x0, y0), outer, fill)
    if outline: paint(base, S, (x0, y0), ImageChops.subtract(outer, _mask(w, h, radius, k, width)), outline)


def text(base, S, x, top, t, px, w=500, color=TXT, tnum=False, lh=T.LH, center=False):
    T.Pen(base, S).text(x - (T.tw(t, px, w, tnum) / 2 if center else 0), top, t, px, w, color, tnum, lh)


def put(base, S, im, x, y): base.alpha_composite(im, (round(x * S), round(y * S)))


# --- botón Centrar (§12.8 con D89)
def centrar_desk(base, S, box=(1240, 280, 1424, 320)):
    """184 × 40 bajo el minimapa: .panel, icono de 18, «Centrar» 14/600 y la tecla C en una caja de 20 × 20 a la derecha."""
    x0, y0, x1, y1 = box
    rrect(base, S, box, fill=PANEL, outline=LINE, radius=8)
    put(base, S, icon('centrar', 18, TXT, S), x0 + 12, y0 + 11)
    text(base, S, x0 + 38, y0 + 9.5, 'Centrar', 14, 600)
    kx = x1 - 12 - 20; rrect(base, S, (kx, y0 + 10, kx + 20, y0 + 30), outline=LINE, radius=4)
    text(base, S, kx + 10, y0 + 11.75, 'C', 11, 600, DIM, center=True)


def centrar_touch(base, S, x, y):
    """52 × 52 como los demás botones táctiles: icono de 22, 2 de separación y «Centrar» a 10 px."""
    rrect(base, S, (x, y, x + 52, y + 52), fill=PANEL, outline=LINE, radius=12)
    top = y + (52 - (22 + 2 + 15)) / 2
    put(base, S, icon('centrar', 22, TXT, S), x + 15, top)
    text(base, S, x + 26, top + 24, 'Centrar', 10, 500, center=True)


# --- el chip (§12.8 con D89)
def diamond(s, r, n=10):
    """Contorno del rombo: cuadrado de lado s con esquinas de radio r, girado 45° y centrado en el origen."""
    h = s / 2 - r; pts = []
    for cx, cy, a0 in ((h, h, 0), (-h, h, 90), (-h, -h, 180), (h, -h, 270)):
        pts += [(cx + r * math.cos(math.radians(a0 + 90 * i / n)), cy + r * math.sin(math.radians(a0 + 90 * i / n))) for i in range(n + 1)]
    c = math.cos(math.pi / 4); return [((x - y) * c, (x + y) * c) for x, y in pts]


def half(kind, size):
    D, s = SIZES[size]; return D / 2 if kind == 'self' else s * math.sqrt(2) / 2


def label_w(dist): return T.tw(f'{dist} m', 12, 600, True) + 10


def chip(kind, rel, size, S, ang, dist=None, side='below', scale=1.0, more=0, tri=True):
    """Capa RGBA (px físicos) del chip con su centro en (R, R) px CSS. kind: 'self' (círculo y estrella) o el icono de la
    relación del atacante ('skull', 'gunboat', 'captain', 'anchor'); ang: hacia dónde apunta el triángulo (rad, pantalla, y abajo).
    `scale` es el latido (1,15): escala la forma y no la distancia. `more` > 0 añade «+N» (atacantes agrupados)."""
    D, s = SIZES[size]; R = 64; k = S * Q; N = 2 * R * k; c = R * k
    outer, inner = Image.new('L', (N, N), 0), Image.new('L', (N, N), 0)
    if kind == 'self':
        ro, ri = D / 2 * scale, (D / 2 - 2) * scale; color = SELF
        ImageDraw.Draw(outer).ellipse((c - ro * k, c - ro * k, c + ro * k, c + ro * k), fill=255)
        ImageDraw.Draw(inner).ellipse((c - ri * k, c - ri * k, c + ri * k, c + ri * k), fill=255)
    else:
        ss, bw, rr = s * scale, 3 * scale, 6 * scale; color = rel
        ImageDraw.Draw(outer).polygon([(c + x * k, c + y * k) for x, y in diamond(ss, rr)], fill=255)
        ImageDraw.Draw(inner).polygon([(c + x * k, c + y * k) for x, y in diamond(ss - 2 * bw, max(0.0, rr - bw))], fill=255)
    o = np.asarray(outer, float) / 255; i = np.asarray(inner, float) / 255
    A = i * PANEL[3] + (o - i); pan = np.array(PANEL[:3], float); col = np.array(T.hexrgb(color), float)
    rgb = (pan * (i * PANEL[3])[..., None] + col * (o - i)[..., None]) / np.maximum(A, 1e-6)[..., None]
    img = Image.fromarray(np.dstack([rgb, A * 255]).round().clip(0, 255).astype(np.uint8), 'RGBA')

    def edge(a):  # distancia del centro al borde de la forma en la dirección a (px CSS)
        ux, uy = math.cos(a), math.sin(a); t = 0
        while outer.getpixel((int(c + ux * t), int(c + uy * t))) > 127: t += 1
        return t / k
    if tri:  # a 2 px del borde, 8 de alto y 10 de base, con un perfil oscuro de 1 px para leerse sobre espuma e islas
        ux, uy = math.cos(ang), math.sin(ang); b = edge(ang) + 2 * scale; tip = b + 8 * scale; hb = 5 * scale
        pts = [(c + ux * tip * k, c + uy * tip * k), (c + (ux * b - uy * hb) * k, c + (uy * b + ux * hb) * k),
               (c + (ux * b + uy * hb) * k, c + (uy * b - ux * hb) * k)]
        tl = Image.new('RGBA', (N, N), (0, 0, 0, 0)); ImageDraw.Draw(tl).polygon(pts, fill=rgba(color), outline=rgba(PLATE), width=k)
        img.alpha_composite(tl)
    if kind in PAIRS:  # RelationIcon: el 2.º icono a 0,55 sobre la calavera a 0,75, en columna
        cr, sk = icon(PAIRS[kind][0], round(18 * 0.55) * scale, rel, k), icon('skull', round(18 * 0.75) * scale, rel, k)
        y0 = c - (cr.height + sk.height) / 2
        img.alpha_composite(cr, (round(c - cr.width / 2), round(y0))); img.alpha_composite(sk, (round(c - sk.width / 2), round(y0 + cr.height)))
    else:
        im = icon('star' if kind == 'self' else kind, 18 * scale, color, k); img.alpha_composite(im, (round(c - im.width / 2), round(c - im.height / 2)))
    bpos = edge(-math.pi / 4) if more else 0
    img = img.resize((2 * R * S, 2 * R * S), Image.LANCZOS)
    if more:
        bx, by = R + bpos * math.cos(-math.pi / 4), R + bpos * math.sin(-math.pi / 4)
        rrect(img, S, (bx - 9, by - 9, bx + 9, by + 9), fill=color, outline=PLATE, radius=9)
        text(img, S, bx, by - 8.25, f'+{more}', 11, 700, INKD, center=True)
    if dist is not None:
        h = half(kind, size); lw = label_w(dist); top = R + h + 2 if side == 'below' else R - h - 2 - 16
        rrect(img, S, (R - lw / 2, top, R + lw / 2, top + 16), fill=PLATE, radius=4)
        text(img, S, R - lw / 2 + 5, top, f'{dist} m', 12, 600, TXT, tnum=True, lh=16 / 12)
    return img, R


def cross(a, b, gap=0): return a[0] < b[2] + gap and b[0] < a[2] + gap and a[1] < b[3] + gap and b[1] < a[3] + gap


def place(vw, vh, frame, blocks, origin, target, kind, size, dist, gap=8):
    """La regla de §12.8 (D89). El rayo de `origin` a `target` se recorta contra el marco útil; si la caja del chip (forma
    y distancia) queda a < 8 px de un bloque del HUD, el chip se desliza por el borde del marco hasta la posición libre más
    cercana, medida a lo largo del borde. El triángulo apunta desde la posición final. La distancia va debajo, o encima si
    el triángulo apunta hacia abajo (45–135°)."""
    l, t, r, b = frame; h = half(kind, size); L = max(h, label_w(dist) / 2)
    dx, dy = target[0] - origin[0], target[1] - origin[1]
    side = 'above' if 45 <= math.degrees(math.atan2(dy, dx)) <= 135 else 'below'
    for i in range(3):
        top, bot = h + (18 if side == 'above' else 0), h + (18 if side == 'below' else 0)
        x0, y0, x1, y1 = l + L, t + top, vw - r - L, vh - b - bot; W, H = x1 - x0, y1 - y0; P = 2 * (W + H)
        tm = min((x1 - origin[0]) / dx if dx > 0 else (x0 - origin[0]) / dx if dx < 0 else math.inf,
                 (y1 - origin[1]) / dy if dy > 0 else (y0 - origin[1]) / dy if dy < 0 else math.inf)
        naive = (origin[0] + dx * tm, origin[1] + dy * tm)

        def at(sv):
            sv %= P
            if sv < W: return (x0 + sv, y0)
            if sv < W + H: return (x1, y0 + sv - W)
            if sv < 2 * W + H: return (x1 - (sv - W - H), y1)
            return (x0, y1 - (sv - 2 * W - H))
        e = 1e-6
        s0 = (naive[0] - x0 if abs(naive[1] - y0) < e else W + naive[1] - y0 if abs(naive[0] - x1) < e
              else W + H + x1 - naive[0] if abs(naive[1] - y1) < e else 2 * W + H + y1 - naive[1])
        free = lambda p: not any(cross((p[0] - L, p[1] - top, p[0] + L, p[1] + bot), B, gap) for B in blocks.values())
        hit = None
        for d in np.arange(0, P / 2, 0.5):
            for sg in (1, -1):
                if free(at(s0 + sg * d)): hit = (at(s0 + sg * d), float(d), sg); break
            if hit: break
        p, d, sg = hit
        ang = math.atan2(target[1] - p[1], target[0] - p[0])
        new = 'above' if 45 <= math.degrees(ang) <= 135 else 'below'
        if new == side or i == 2: break  # sin asentarse en 3 vueltas, el lado de la última caja: la distancia va donde reservó sitio
        side = new
    box = (p[0] - L, p[1] - top, p[0] + L, p[1] + bot)
    near = min(((max(B[0] - box[2], box[0] - B[2], B[1] - box[3], box[1] - B[3]), n) for n, B in blocks.items()), key=lambda v: v[0])
    return dict(p=p, naive=naive, travel=d, side=side, ang=ang, origin=origin, target=target, kind=kind, h=h, box=box,
                path=[at(s0 + sg * v) for v in np.arange(0, d + 0.5, 2)], near=near,
                d_center=abs((math.degrees(ang - math.atan2(dy, dx)) + 180) % 360 - 180))


# --- retoques de la captura
def erase(im, box, shift, feather):
    """Borra lo que hay en box (px físicos) con el agua de box + shift; el borde se funde en `feather` px (a `feather` px
    del borde ya se reemplaza el 98 %, así que box es lo que se borra más ese margen). Si shift es una lista, usa el
    desplazamiento cuya agua casa mejor con la de alrededor en la franja de fundido. Devuelve la máscara de mezcla (array
    0..1, del tamaño de box)."""
    x0, y0, x1, y1 = box; f = feather / 2
    m = Image.new('L', (x1 - x0, y1 - y0), 0); ImageDraw.Draw(m).rectangle((f, f, x1 - x0 - f - 1, y1 - y0 - f - 1), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(feather / 4))
    a = np.asarray(m, float) / 255; ring = (a > 0.05) & (a < 0.95); dst = np.asarray(im.crop(box), float)
    cost = lambda s: float(np.abs(np.asarray(im.crop((x0 + s[0], y0 + s[1], x1 + s[0], y1 + s[1])), float) - dst)[ring].mean())
    dx, dy = min(shift, key=cost) if isinstance(shift, list) else shift
    im.paste(im.crop((x0 + dx, y0 + dy, x1 + dx, y1 + dy)), (x0, y0), m); return a


def regrid(im, box, m, rows, ref_cols):
    """Repone la línea horizontal de la rejilla que el borrado se llevó: suma, con el peso de la mezcla, el perfil
    (línea − fondo) medido en columnas limpias de las mismas filas."""
    a = np.asarray(im, float); y0, y1 = rows
    p = np.concatenate([a[y0:y1, c0:c1] for c0, c1 in ref_cols], axis=1).mean(axis=1)
    base = p[0] + (p[-1] - p[0]) * np.linspace(0, 1, y1 - y0)[:, None]; delta = p - base
    x0, by0 = box[0], box[1]
    a[y0:y1, x0:box[2]] += delta[:, None, :] * m[y0 - by0:y1 - by0, :, None]
    im.paste(Image.fromarray(a.clip(0, 255).round().astype(np.uint8)))


def arc_patch(orig, im, box, rows, band=9):
    """Repone el arco de amarre (apaisado) donde se borró el barco: círculo ajustado a los puntos amarillos de fuera de la
    zona; sus puntos van a paso angular fijo, así que el tramo borrado se copia del tramo situado dos pasos antes, girado
    alrededor del centro del arco, y solo donde ese tramo es claro (trazo o punto), con la mezcla según su luminancia."""
    a = np.asarray(orig, float); Y, X = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    yel = (a[..., 0] > 200) & (a[..., 1] > 150) & (a[..., 2] < 130) & (a[..., 0] - a[..., 2] > 90) & (Y >= rows[0]) & (Y < rows[1])
    yel &= ~((X >= box[0] - 20) & (X < box[2] + 20) & (Y >= box[1] - 20) & (Y < box[3] + 20))
    xs, ys = X[yel].astype(float), Y[yel].astype(float)
    Dk, Ek, Fk = np.linalg.lstsq(np.c_[xs, ys, np.ones_like(xs)], -(xs ** 2 + ys ** 2), rcond=None)[0]
    cx, cy = -Dk / 2, -Ek / 2; Rr = math.sqrt(cx * cx + cy * cy - Fk)
    t = np.sort(np.arctan2(ys - cy, xs - cx)); g = [c.mean() for c in np.split(t, np.where(np.diff(t) > 0.004)[0] + 1) if len(c) > 5]
    step = float(np.median(np.diff(g)))
    yy, xx = np.mgrid[box[1]:box[3], box[0]:box[2]]; r = np.hypot(xx - cx, yy - cy); th = np.arctan2(yy - cy, xx - cx) - 2 * step
    sx, sy = cx + r * np.cos(th), cy + r * np.sin(th); x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int); fx_, fy_ = sx - x0, sy - y0
    src = sum(a[y0 + j, x0 + i] * (np.where(i, fx_, 1 - fx_) * np.where(j, fy_, 1 - fy_))[..., None] for i in (0, 1) for j in (0, 1))
    w = np.clip((src @ np.array([0.2126, 0.7152, 0.0722]) - 115) / 55, 0, 1) * (np.abs(r - Rr) <= band)
    out = np.asarray(im, float); sub = out[box[1]:box[3], box[0]:box[2]]
    out[box[1]:box[3], box[0]:box[2]] = sub * (1 - w[..., None]) + src * w[..., None]
    im.paste(Image.fromarray(out.clip(0, 255).round().astype(np.uint8)))
    return (round(cx, 1), round(cy, 1), round(Rr, 1), round(math.degrees(step), 2), len(g))


def move_hint(im, S, box, top, up):
    """La pista recortada de la captura pasa a la otra ranura (AC-110); su sitio se rellena con el agua de entre up[0] y
    up[1] px CSS más arriba (un tramo sin barcos ni placas), con el desplazamiento que mejor casa con el agua de alrededor."""
    x0, y0, x1, y1 = [round(v * S) for v in box]; crop = im.crop((x0, y0, x1, y1)); f = 10 * S
    erase(im, (x0 - f - 2 * S, y0 - f - 2 * S, x1 + f + 2 * S, y1 + f + 2 * S), [(0, -v * S) for v in range(up[0], up[1] + 1, 2)], f)
    mk = Image.new('L', crop.size, 0); ImageDraw.Draw(mk).rounded_rectangle((0, 0, crop.width - 1, crop.height - 1), 8 * S, fill=255)
    im.paste(crop, (x0, round(top * S)), mk)


def paste_r(base, im, xy, r, bottom=True):
    """El canvas del minimapa recortado por el panel (como en lamina_minimapa.py)."""
    mk = Image.new('L', (im.width, im.height + (0 if bottom else 4 * r)), 0)
    ImageDraw.Draw(mk).rounded_rectangle((0, 0, mk.width - 1, mk.height - 1), r, fill=255)
    base.paste(im, xy, mk.crop((0, 0, im.width, im.height)))


def sector(x, z): return f"{'ABCDEFGHIJ'[max(0, min(9, int((x + 500) // 100)))]}{max(0, min(9, int((z + 500) // 100))) + 1}"


# --- las escenas (px CSS; los m son relativos al centro de la vista)
DESK = dict(name='desk', vw=1440, vh=900, S=1, ppm=6.20, frame=(16, 120, 16, 108), size='desk', cap='desktop-open-sea.png',
            blocks={'Jugador': (16, 16, 312, 104), 'Oro': (1240, 16, 1424, 56), 'Minimapa': (1240, 64, 1424, 272),
                    'Acciones': (552, 808, 888, 884), 'Registro': (16, 859, 376, 883)},
            centrar=(1240, 280, 1424, 320), hint=(588, 712, 851, 752), hint_alt=140, hint_up=(66, 154), toasts=[],
            mm=dict(css=182, dpr=1, at=(1241, 65), r=7, bottom=False), ground=(232.3, 177.2),
            ents=dict(merchant=[(-39.2, -7.5)], pirate=[(43.5, -25.2)]))
MOB = dict(name='mob', vw=390, vh=844, S=2, ppm=2.82, frame=(12, 116, 12, 104), size='touch', cap='mobile-open-sea.png',
           blocks={'Jugador': (0, 0, 390, 52), 'Minimapa': (286, 60, 374, 148), 'Reparar': (322, 684, 374, 736),
                   'Objetivo': (234, 776, 286, 828), 'Atacar': (302, 756, 374, 828), 'Puerto': (16, 776, 68, 828)},
           centrar=(322, 616, 374, 668), hint=(16, 604, 374, 644), hint_alt=200, hint_up=(66, 92), toasts=[],
           mm=dict(css=86, dpr=2, at=(574, 122), r=14, bottom=True), ground=(138.3, 365.4),
           ents=dict(merchant=[(-37.9, -7.4)], pirate=[(46.1, 1.3), (23.8, 105.2)]))
LAN = dict(name='lan', vw=844, vh=390, S=2, ppm=3.44, frame=(12, 12, 12, 12), size='touch', cap='landscape-danger-mark.png',
           blocks={'Jugador': (12, 12, 264, 57), 'Panel del objetivo': (12, 64, 264, 134), 'Zona segura': (272, 12, 572, 48),
                   'Oro': (672, 12, 752, 52), 'Minimapa': (760, 12, 832, 84), 'Reparar': (768, 238, 820, 290),
                   'Atacar': (748, 306, 820, 378), 'Objetivo': (684, 326, 736, 378), 'Puerto': (12, 326, 64, 378)},
           centrar=(704, 238, 756, 290), hint=(309, 64, 534.5, 104), hint_alt=None, toasts=['Zona segura'],
           mm=dict(css=70, dpr=2, at=(1522, 26), r=14, bottom=True), ground=(245.3, 138.4),
           ents=dict(gunboat=[(-30.2, 43.6)], pirate=[(29.4, 43.6)]))
# barco propio, estela, anillo y placa (px físicos) más el margen de fundido; el agua viene de una columna de la rejilla
# (escritorio y apaisado) o de la misma columna 155 px CSS más abajo (móvil, tras mover la pista, que tapaba esa agua)
ERASE = {'desk': dict(box=(639, 239, 811, 554), shift=(-620, 0), feather=14),
         'mob': dict(box=(265, 680, 516, 982), shift=(0, 310), feather=18, regrid=((836, 853), ((0, 60), (700, 780)))),
         'lan': dict(box=(732, 287, 956, 531), shift=(-688, 0), feather=16, arc=(280, 520))}


def screen(sc, dx, dz): return (sc['vw'] / 2 + dx * sc['ppm'], sc['vh'] / 2 + dz * sc['ppm'] * SIN)


def build(sc, mode, me, off, heading, rel=PLAY, kind='anchor'):
    """Una pantalla. mode 'libre': la vista está en me − off y el barco propio queda en off (m) del centro. mode 'ataque':
    seguimiento, el barco propio en el centro y un atacante a off (m) de él. Devuelve la imagen (px físicos) y las medidas."""
    S = sc['S']; im = Image.open(RT.need(os.path.join(CAP, sc['cap']), f'captura {sc["cap"]} (UX_D89)')).convert('RGB')
    blocks = dict(sc['blocks']); info = dict(scene=sc['name'], mode=mode)
    if mode == 'libre': blocks['Centrar'] = sc['centrar']; view = (me[0] - off[0], me[1] - off[1])
    else: view = me
    dist = round(math.hypot(*off))
    target = screen(sc, *off); origin = (sc['vw'] / 2, sc['vh'] / 2)
    res = place(sc['vw'], sc['vh'], sc['frame'], blocks, origin, target, 'self' if mode == 'libre' else kind, sc['size'], dist)
    res.update(dist=dist, blocks=blocks, sc=sc)
    # la pista: no se cruza con avisos, Centrar ni chips (AC-110); si sus dos ranuras se cruzan, se oculta
    obst = [blocks[n] for n in sc['toasts']] + [res['box']] + ([sc['centrar']] if mode == 'libre' else [])
    hb = sc['hint']; slot = 'normal' if not any(cross(hb, o) for o in obst) else None
    if slot is None and sc['hint_alt'] is not None:
        alt = (hb[0], sc['hint_alt'], hb[2], sc['hint_alt'] + hb[3] - hb[1])
        if not any(cross(alt, o) for o in obst): slot = 'alt'; move_hint(im, S, hb, sc['hint_alt'], sc['hint_up']); hb = alt
    info.update(hint=slot or 'oculta', hint_box=hb)
    if mode == 'libre':  # el barco propio sale de la captura (después de mover la pista: en móvil, el agua viene de debajo)
        e = ERASE[sc['name']]; orig = im.copy()
        m = erase(im, e['box'], e['shift'], e['feather'])
        if 'regrid' in e: regrid(im, e['box'], m, *e['regrid'])
        if 'arc' in e: info['arco'] = arc_patch(orig, im, e['box'], e['arc'])
    base = im.convert('RGBA')
    # minimapa: el ▲ en me, el rectángulo de la vista en `view` y los barcos de la captura (relativos a la vista)
    gw, gh = sc['ground']; ents = {k: [(view[0] + x, view[1] + z) for x, z in v] for k, v in sc['ents'].items()}
    if mode != 'libre': ents['player'] = ents.get('player', []) + [(me[0] + off[0], me[1] + off[1])]
    scene = dict(ents, me=(me[0], me[1], math.radians(heading)), view=((view[0] - gw / 2, view[1] - gh / 2), (view[0] + gw / 2, view[1] + gh / 2)))
    mm = sc['mm']; mmi = LM.minimap(mm['css'], mm['dpr'], '1.1', scene).convert('RGBA'); paste_r(base, mmi, mm['at'], mm['r'], mm['bottom'])
    if sc['name'] == 'desk':  # pie del sector, con la posición del barco propio (como hoy)
        dd = ImageDraw.Draw(base); foot = base.getpixel((1250, 262)); dd.rectangle((1241, 248, 1422, 270), fill=foot)
        t = f'Sector {sector(*me)} · X {round(me[0])} Z {round(me[1])}'.replace('-', '−'); f12 = T.font(12, 500)
        dd.text((1332 - dd.textlength(t, font=f12, features=['tnum']) / 2, 259.5), t, font=f12, fill=(169, 184, 194), anchor='lm', features=['tnum'])
    if mode == 'libre':
        (centrar_desk(base, S, sc['centrar']) if sc['size'] == 'desk' else centrar_touch(base, S, *sc['centrar'][:2]))
    ck, R = chip(res['kind'], SELF if mode == 'libre' else rel, sc['size'], S, res['ang'], dist, res['side'])
    put(base, S, ck, res['p'][0] - R, res['p'][1] - R)
    info.update(view=view, me=me)
    return base.convert('RGB'), res, info


# --- la lámina
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42); ANN = (0, 112, 192)


def gray_corr(a, b):
    """Correlación normalizada (Pearson) de las luminancias de dos imágenes RGB del mismo tamaño (AD-31)."""
    la, lb = [np.asarray(x.convert('RGB'), float) @ np.array([0.2126, 0.7152, 0.0722]) for x in (a, b)]
    la, lb = la - la.mean(), lb - lb.mean(); return float((la * lb).sum() / math.sqrt((la * la).sum() * (lb * lb).sum()))


def icon_corr(a, b, px=22):
    ia, ib = [np.asarray(icon(n, px, '#000000'), float)[..., 3] for n in (a, b)]
    ia, ib = ia - ia.mean(), ib - ib.mean(); return float((ia * ib).sum() / math.sqrt((ia * ia).sum() * (ib * ib).sum()))


if __name__ == '__main__':
    SEA = (31, 88, 128)
    sc_df = build(DESK, 'libre', (350, -120), (150, -60), 160)
    sc_da = build(DESK, 'ataque', (350, -120), (0, 80), 160)
    sc_mf = build(MOB, 'libre', (350, 100), (80, 110), 170)
    sc_ma = build(MOB, 'ataque', (350, 100), (75, -28), 170)
    sc_lf = build(LAN, 'libre', (350, -120), (170, 40), 150)
    sc_la = build(LAN, 'ataque', (350, -120), (0, -80), 150)
    css = lambda im, sc: im if sc['S'] == 1 else im.resize((sc['vw'], sc['vh']), Image.LANCZOS)

    SW = 1950; sheet = Image.new('RGB', (SW, 6400), PAPER); d = ImageDraw.Draw(sheet)
    def font(px, w=600): return T.font(px, w)
    def label(x, y, t, c=SOFT, f=None): d.text((x, y), t, font=f or font(15, 500), fill=c)
    def frame(im, x, y, c=(120, 110, 95)): sheet.paste(im, (x, y)); d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=c, width=1)
    def para(x, y, w, t, f=None, c=INK, lh=22):
        f = f or font(15, 500); line = ''
        for wd in t.split():
            s_ = (line + ' ' + wd).strip()
            if d.textlength(s_, font=f) > w: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
            else: line = s_
        d.text((x, y), line, font=f, fill=c); return y + lh
    def num(x, y, n):
        d.ellipse((x - 13, y - 13, x + 13, y + 13), fill=(255, 255, 255), outline=ANN, width=3)
        d.text((x, y + 1), str(n), font=font(15, 700), fill=ANN, anchor='mm')
    def legend(x, y, w, items):
        for i, t in enumerate(items, 1):
            num(x + 13, y + 11, i); y = para(x + 36, y, w - 36, t) + 6
        return y

    deg = lambda r: round(math.degrees(r['ang']))
    fx = lambda v, n=0: f'{v:.{n}f}'.replace('.', ',').replace('-', '−')
    d.text((40, 22), 'Vista libre: mover la vista, volver al barco y ver quién te dispara', font=font(30), fill=INK)
    for i, t in enumerate(('Capturas reales del juego de hoy (candidato de la 1.1) con lo nuevo dibujado encima: el botón Centrar, el indicador de tu barco y el del barco que te',
                           'dispara. A tamaño real: 1 px de la lámina = 1 px de la pantalla (el móvil, a la mitad de su resolución). Aún no está construido.')):
        label(40, 62 + 22 * i, t, f=font(16, 500))

    # 1 · vista libre en escritorio y móvil vertical
    y = 124; d.text((40, y), '1 · Vista libre: has movido la vista y tu barco queda fuera de la pantalla', font=font(20), fill=TITLE); y += 36
    (im_df, r_df, i_df), (im_mf, r_mf, i_mf) = sc_df, sc_mf
    frame(css(im_df, DESK), 40, y); frame(css(im_mf, MOB), 40 + 1440 + 40, y)
    X0, XM = 40, 40 + 1440 + 40
    num(X0 + 1226, y + 300, 1); num(X0 + r_df['p'][0] - 40, y + r_df['p'][1], 2); num(X0 + 1226, y + 170, 3); num(X0 + 574, y + 732, 4)
    num(XM + 306, y + 642, 1); num(XM + r_mf['p'][0] - 40, y + r_mf['p'][1], 2); num(XM + 30, y + 186, 3); num(XM + 272, y + 104, 4)
    yl = y + 900 + 14
    ya = legend(40, yl, 1440, [
        'Botón Centrar, solo mientras miras a otro sitio: vuelve la cámara a tu barco (también con la tecla C). Va justo debajo del minimapa, con el que también se mueve la vista.',
        f'Tu barco está a {r_df["dist"]} m, arriba a la derecha. El indicador iba a quedar sobre el minimapa, así que bajó por el borde hasta pasar Centrar ({r_df["travel"]:.0f} px). El triángulo apunta a tu barco desde donde quedó el indicador; desde el centro de la pantalla se habría desviado {r_df["d_center"]:.0f}°.',
        'En el minimapa, el rectángulo de lo que ves se separa de la flecha de tu barco.',
        'La pista de las primeras partidas sigue en su sitio: nada la tapa.'])
    yb = legend(XM, yl, 390, [
        'Centrar, encima de Reparar, con la palabra debajo como los demás botones.',
        f'Tu barco, a {r_mf["dist"]} m abajo a la derecha. El indicador caía sobre Centrar y subió {r_mf["travel"]:.0f} px por el borde. La distancia va encima porque el triángulo apunta hacia abajo.',
        'La pista se cruzaba con Centrar y subió a su otra ranura.',
        'Minimapa: la vista, lejos de tu flecha.'])
    y = max(ya, yb) + 30

    # 2 · atacante
    d.text((40, y), '2 · Te disparan desde fuera de lo que ves', font=font(20), fill=TITLE); y += 36
    (im_da, r_da, i_da), (im_ma, r_ma, i_ma) = sc_da, sc_ma
    frame(css(im_da, DESK), 40, y); frame(css(im_ma, MOB), XM, y)
    num(X0 + r_da['p'][0] - 48, y + r_da['p'][1], 1); num(X0 + 574, y + 160, 2); num(X0 + 540, y + 846, 3); num(X0 + 1226, y + 150, 4)
    num(XM + r_ma['p'][0] - 46, y + r_ma['p'][1], 1); num(XM + 30, y + 589, 2)
    yl = y + 900 + 14
    ya = legend(40, yl, 1440, [
        f'Un jugador con cañones de nivel 3 te dispara desde {r_da["dist"]} m al sur. Su barco queda tapado por la barra de acciones: para el juego eso cuenta como fuera de la vista. El rombo lleva el color y el icono del atacante (hueso y ancla para un jugador; coral y calavera para un pirata), late con cada impacto y se va 3 s después del último disparo. Tocarlo lo selecciona como objetivo, sin mover la cámara.',
        'El indicador se cruzaba con la pista, así que la pista subió a su otra ranura, encima de tu barco.',
        'Aquí está el atacante, bajo la barra.',
        'En el minimapa, el atacante es el círculo hueco de los jugadores.'])
    yb = legend(XM, yl, 390, [
        f'El mismo atacante, a {r_ma["dist"]} m al este: en el móvil vertical, todo lo que pasa de 69 m a los lados queda fuera.',
        'La pista no se cruza con nada y se queda.'])
    y = max(ya, yb) + 30

    # 3 · móvil apaisado
    d.text((40, y), '3 · Móvil apaisado (844 × 390): lo mismo, con el borde casi lleno de botones', font=font(20), fill=TITLE); y += 36
    (im_lf, r_lf, i_lf), (im_la, r_la, i_la) = sc_lf, sc_la
    XL2 = 40 + 844 + 40
    frame(css(im_lf, LAN), 40, y); frame(css(im_la, LAN), XL2, y)
    num(40 + 690, y + 264, 1); num(40 + r_lf['p'][0] - 42, y + r_lf['p'][1], 2)
    num(XL2 + r_la['p'][0] + 44, y + r_la['p'][1], 1); num(XL2 + 422, y - 16, 2)
    yl = y + 390 + 14
    ya = legend(40, yl, 844, [
        'Centrar, a la izquierda de Reparar.',
        f'Tu barco, a {r_lf["dist"]} m a la derecha. El indicador caía sobre Reparar y subió {r_lf["travel"]:.0f} px por el borde. Desde el centro, el triángulo se habría desviado {r_lf["d_center"]:.0f}°.'])
    yb = legend(XL2, yl, 844, [
        f'Un jugador te dispara desde {r_la["dist"]} m al norte. Arriba, en la vertical de tu barco, está el aviso «Zona segura», y a su izquierda, los paneles: el indicador se desliza {r_la["travel"]:.0f} px a la derecha y apunta hacia la izquierda, al atacante ({r_la["d_center"]:.0f}° de diferencia con el rayo desde el centro).',
        'Aquí arriba, fuera de la pantalla, está el atacante.'])
    y = max(ya, yb) + 30

    # 4 · cómo se coloca
    d.text((40, y), '4 · Cómo se coloca el indicador (la regla, sobre las mismas pantallas)', font=font(20), fill=TITLE); y += 36
    def dashed(dr, p0, p1, fill, width=2, dash=7, gap=5):
        L_ = math.dist(p0, p1); n = max(1, int(L_ // (dash + gap)) + 1)
        for i in range(n):
            a, b = i * (dash + gap) / L_, min(1, (i * (dash + gap) + dash) / L_)
            if a < 1: dr.line((p0[0] + (p1[0] - p0[0]) * a, p0[1] + (p1[1] - p0[1]) * a, p0[0] + (p1[0] - p0[0]) * b, p0[1] + (p1[1] - p0[1]) * b), fill=fill, width=width)
    def diagram(img, res, k, pad=18):
        """La pantalla atenuada con el marco útil, los bloques, el rayo, el punto donde caería el indicador, el deslizamiento,
        la posición final y la línea hacia el barco, que puede quedar fuera de la pantalla."""
        sc = res['sc']; vw, vh = sc['vw'], sc['vh']; sw, sh = round(vw * k), round(vh * k); tx, ty = res['target']
        x0, y0 = min(0, tx - 12 / k), min(0, ty - 12 / k); x1, y1 = max(vw, tx + 12 / k), max(vh, ty + 12 / k)
        im = Image.new('RGBA', (round((x1 - x0) * k) + 2 * pad, round((y1 - y0) * k) + 2 * pad), PAPER + (255,))
        P = lambda q: (pad + (q[0] - x0) * k, pad + (q[1] - y0) * k); ox, oy = [round(v) for v in P((0, 0))]
        im.paste(Image.blend(img.resize((sw, sh), Image.LANCZOS), Image.new('RGB', (sw, sh), (255, 255, 255)), 0.55), (ox, oy))
        ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); do = ImageDraw.Draw(ov)
        for B in res['blocks'].values(): do.rectangle((*P(B[:2]), *P(B[2:])), fill=(162, 59, 42, 60), outline=(162, 59, 42, 200))
        im.alpha_composite(ov); dr = ImageDraw.Draw(im)
        dr.rectangle((ox - 1, oy - 1, ox + sw, oy + sh), outline=(120, 110, 95))
        l, t, r, b = sc['frame']; a_, c_ = P((l, t)), P((vw - r, vh - b))
        for p0, p1 in ((a_, (c_[0], a_[1])), ((c_[0], a_[1]), c_), (c_, (a_[0], c_[1])), ((a_[0], c_[1]), a_)): dashed(dr, p0, p1, ANN, 2, 5, 4)
        dashed(dr, P(res['origin']), P(res['target']), (90, 90, 90), 2)
        nx, ny = P(res['naive']); hk = res['h'] * k
        if res['travel'] > 0: dr.ellipse((nx - hk, ny - hk, nx + hk, ny + hk), outline=(90, 90, 90), width=2)
        if len(res['path']) > 1: dr.line([P(q) for q in res['path']], fill=ANN, width=4)
        fx, fy = P(res['p']); col = T.hexrgb(SELF if res['kind'] == 'self' else PLAY)
        tx_, ty_ = P(res['target']); dr.line((fx, fy, tx_, ty_), fill=INK, width=3)
        if res['kind'] == 'self': dr.ellipse((fx - hk, fy - hk, fx + hk, fy + hk), fill=col, outline=INK, width=2)
        else: dr.polygon([(fx, fy - hk), (fx + hk, fy), (fx, fy + hk), (fx - hk, fy)], fill=col, outline=INK, width=2)
        dr.ellipse((tx_ - 6, ty_ - 6, tx_ + 6, ty_ + 6), fill=col, outline=INK, width=2)
        return im.convert('RGB')
    rows_d = [[(sc_df, 0.45, 'Escritorio, vista libre', f'El rayo hacia tu barco (gris) cae sobre el minimapa; el indicador baja {fx(r_df["travel"])} px por el borde (azul) y apunta desde ahí (negro).'),
               (sc_da, 0.45, 'Escritorio, atacante', 'El atacante está bajo la barra de acciones, fuera del marco útil (azul): sale el indicador, que no necesita deslizarse.'),
               (sc_mf, 0.45, 'Móvil, vista libre', f'Cae sobre Centrar: sube {fx(r_mf["travel"])} px.')],
              [(sc_ma, 0.45, 'Móvil, atacante', 'Nada en medio: se queda en el rayo.'),
               (sc_lf, 0.6, 'Apaisado, vista libre', f'Cae sobre Reparar: sube {fx(r_lf["travel"])} px.'),
               (sc_la, 0.6, 'Apaisado, atacante', f'Arriba están el aviso y los paneles: {fx(r_la["travel"])} px a la derecha.')]]
    for row in rows_d:
        x = 40; hmax = 0
        for (img, res, _), k, ttl, cap in row:
            di = diagram(img, res, k); frame(di, x, y); d.text((x, y + di.height + 8), ttl, font=font(16), fill=INK)
            para(x, y + di.height + 32, max(di.width, 200), cap, f=font(14, 500), c=SOFT, lh=19)
            x += max(di.width, 200) + 34; hmax = max(hmax, di.height)
        if row is rows_d[1]:
            para(x + 10, y, SW - x - 50, 'Azul discontinuo: el marco útil, el área sin HUD con la que se calcula el zoom (120 px arriba y 108 abajo en escritorio; 116 y 104 en el móvil vertical; 12 en el apaisado). Rojo: los bloques del HUD, a los que el indicador no se acerca a menos de 8 px. Gris: el rayo desde el centro y dónde caería el indicador. Azul grueso: el deslizamiento por el borde. Negro: hacia dónde apunta el triángulo, siempre desde la posición final del indicador.', f=font(15, 500), c=SOFT)
        y += hmax + 32 + 3 * 19 + 24

    # 5 · las piezas de cerca
    d.text((40, y), '5 · Las piezas, de cerca (al triple)', font=font(20), fill=TITLE); y += 36
    Z = 3; cw = 240
    def cell(img, R, w=80, h=110, dy=0):
        crop = img.crop((round((R - w / 2) * Z), round((R - h / 2 + dy) * Z), round((R + w / 2) * Z), round((R + h / 2 + dy) * Z)))
        bg = Image.new('RGBA', crop.size, SEA + (255,)); bg.alpha_composite(crop); return bg.convert('RGB')
    pieces = [(chip('self', SELF, 'desk', Z, math.radians(-30), 162), 'Tu barco', 'círculo de 44 px (48 en táctil), borde dorado de 2 px y tu estrella', 8),
              (chip('skull', HOST, 'desk', Z, math.radians(200), 64), 'Pirata', 'rombo de 36 px de lado (40 en táctil), borde coral de 3 px', 8),
              (chip('gunboat', HOST, 'desk', Z, math.radians(200), 64), 'Cañonera pirata', 'bomba y calavera, como en su placa', 8),
              (chip('captain', HOST, 'desk', Z, math.radians(200), 64), 'Capitán pirata', 'corona y calavera, como en su panel', 8),
              (chip('anchor', PLAY, 'desk', Z, math.radians(200), 80), 'Otro jugador', 'hueso y ancla, como en su placa', 8),
              (chip('anchor', PLAY, 'desk', Z, math.radians(200), 80, scale=1.15), 'Al recibir un impacto', 'late una vez: crece al 115 % y vuelve en 180 ms', 8),
              (chip('skull', HOST, 'desk', Z, math.radians(200), 72, more=2), 'Más de 3 atacantes', 'se ven los 3 más cercanos; el resto, «+2» en el 3.º', 8)]
    x = 40
    for (img, R), ttl, sub, dy in pieces:
        c_ = cell(img, R, dy=dy); frame(c_, x, y); d.text((x, y + c_.height + 8), ttl, font=font(16), fill=INK)
        para(x, y + c_.height + 32, cw, sub, f=font(14, 500), c=SOFT, lh=19); x += cw + 22
    y += 330 + 32 + 2 * 19 + 24
    # en grises (AD-31): mismo fondo, mismo triángulo y misma distancia
    own, R = chip('self', SELF, 'desk', 1, math.radians(-30), 80)
    def on_sea(im_): bg = Image.new('RGBA', im_.size, SEA + (255,)); bg.alpha_composite(im_); return bg.convert('RGB')
    corr = {n: gray_corr(on_sea(own), on_sea(chip(kd, rc, 'desk', 1, math.radians(-30), 80)[0])) for n, kd, rc in
            (('pirata', 'skull', HOST), ('cañonera', 'gunboat', HOST), ('capitán', 'captain', HOST), ('jugador', 'anchor', PLAY))}
    gx = 40
    for (img, R), ttl in ((chip('self', SELF, 'desk', Z, math.radians(-30), 80), 'Tu barco'), (chip('skull', HOST, 'desk', Z, math.radians(-30), 80), 'Pirata'),
                          (chip('anchor', PLAY, 'desk', Z, math.radians(-30), 80), 'Jugador')):
        c_ = LM.gray(cell(img, R, dy=8)); frame(c_, gx, y); d.text((gx, y + c_.height + 8), f'{ttl}, en grises', font=font(16), fill=INK); gx += cw + 22
    para(gx, y, SW - gx - 40, 'En grises, o para quien no distingue el coral del dorado, los separan la forma (círculo o rombo) y el icono (estrella, calavera o ancla). Parecido medido entre el de tu barco y el del atacante (correlación de grises, 1 = iguales; se pide 0,80 o menos): '
         + ', '.join(f'{n} {fx(v, 2)}' for n, v in corr.items()) + '.', f=font(15, 500), c=INK)
    y += 330 + 32 + 24
    # Centrar y su icono
    cb = Image.new('RGBA', (220 * Z, 64 * Z), SEA + (255,)); centrar_desk(cb, Z, (18, 12, 202, 52)); frame(cb.convert('RGB'), 40, y)
    d.text((40, y + 64 * Z + 8), 'Centrar en escritorio: 184 × 40', font=font(16), fill=INK)
    ct = Image.new('RGBA', (76 * Z, 64 * Z), SEA + (255,)); centrar_touch(ct, Z, 12, 6); frame(ct.convert('RGB'), 40 + 220 * Z + 46, y)
    d.text((40 + 220 * Z + 46, y + 64 * Z + 8), 'En táctil: 52 × 52', font=font(16), fill=INK)
    ix = 40 + 220 * Z + 46 + 76 * Z + 46
    ic = Image.new('RGBA', (4 * 60 * Z // 2, 64 * Z), SEA + (255,))
    for j, (n, col_) in enumerate((('crosshair', TXT), ('target', TXT), ('centrar', TXT), ('locate', DIM))):
        put(ic, Z, icon(n, 22, col_, Z), 9 + j * 30 - 2, 21)
    frame(ic.convert('RGB'), ix, y)
    cc = {n: icon_corr(n, o) for n in ('centrar', 'locate') for o in ('crosshair',)}
    for j, t in enumerate(('Atacar', 'Objetivo', 'Centrar', 'descartado')):
        d.text((ix + (9 + j * 30 + 9) * Z, y + 64 * Z + 8), t, font=font(14, 500), fill=INK if j < 3 else RED, anchor='ma')
    para(ix, y + 64 * Z + 34, ic.width, f'El icono de Centrar es tu estrella dentro de un visor. El que proponía la especificación (el 4.º) es casi el de Atacar: parecido con él {fx(cc["locate"], 2)}, frente a {fx(cc["centrar"], 2)} el nuevo.',
         f=font(14, 500), c=SOFT, lh=19)
    y += 64 * Z + 34 + 3 * 19 + 30

    # 6 · medidas, en contra y lo que cambia
    d.text((40, y), 'Medidas', font=font(20), fill=TITLE); y += 34
    rows = [('Escritorio, vista libre', r_df), ('Escritorio, atacante', r_da), ('Móvil, vista libre', r_mf), ('Móvil, atacante', r_ma),
            ('Apaisado, vista libre', r_lf), ('Apaisado, atacante', r_la)]
    infos = [i_df, i_da, i_mf, i_ma, i_lf, i_la]
    for (n, r), inf in zip(rows, infos):
        gapn = r['near']
        y = para(40, y, SW - 80, f'{n}: {"tu barco" if r["kind"] == "self" else "el atacante"} a {r["dist"]} m; indicador en ({fx(r["p"][0])}, {fx(r["p"][1])}), deslizado {fx(r["travel"])} px, a {fx(gapn[0])} px del bloque más cercano ({gapn[1]}). '
                 f'Triángulo a {fx(deg(r))}°: error 0°, porque se calcula desde el indicador (desde el centro serían {fx(r["d_center"], 1)}°). Distancia {"encima" if r["side"] == "above" else "debajo"}. '
                 f'Pista: {dict(normal="en su sitio", alt="en la otra ranura", oculta="oculta")[inf["hint"]]}.', f=font(15, 500)) + 2
    y += 18
    d.text((40, y), 'En contra', font=font(20), fill=RED); y += 34
    for t in (f'Un indicador deslizado ya no está en la línea recta hacia el barco: en escritorio baja {r_df["travel"]:.0f} px y en el apaisado el del atacante se va {r_la["travel"]:.0f} px a la derecha y apunta hacia la izquierda. El triángulo no se equivoca, pero el ojo busca primero en la dirección del barco.',
              'En el apaisado el borde de arriba está casi lleno (paneles, aviso, oro, minimapa): un atacante del norte siempre acaba desplazado.',
              'Es un elemento más en pantalla y tapa 44–57 px de mar junto al borde. El rombo es más grande que el círculo (51 frente a 44 px de alto) para que el icono quepa dentro del borde de 3 px.',
              'Las pantallas son capturas reales con el barco propio borrado; el resto de la escena es el de la captura (los demás barcos y el panel del objetivo, cuyo «55 m» del apaisado no corresponde a la nueva posición del barco).'):
        y = para(40, y, SW - 80, t, c=RED) + 6
    y += 14
    d.text((40, y), 'Lo que cambia frente a la especificación de hoy', font=font(20), fill=TITLE); y += 34
    for t in ('Icono de Centrar: la estrella en un visor, en lugar de locate-fixed, que se confunde con Atacar.',
              'En táctil, Centrar lleva la palabra debajo, como Reparar, Puerto y Objetivo.',
              'Fuera de la vista = fuera del marco útil: un barco tapado por la barra de acciones o por un panel cuenta como fuera.',
              'Marco útil del apaisado: 12 px a los cuatro lados. La caja del indicador incluye la distancia, y el deslizamiento se mide a lo largo del borde del marco.',
              'El indicador de atacante también lleva la distancia, y su icono es el de la placa del atacante (calavera; bomba y calavera; corona y calavera; o ancla), en columna como en el panel del objetivo.',
              'Los dos indicadores nunca coinciden: un impacto en vista libre devuelve la cámara a tu barco, así que el de tu barco se va cuando llega el del atacante.'):
        y = para(40, y, SW - 80, '· ' + t) + 4
    sheet = sheet.crop((0, 0, SW, y + 24))
    out = os.path.join(RT.OUT, 'D89-vista-libre.png'); sheet.save(out, optimize=True)
    rep = lambda r: dict(p=tuple(round(v, 1) for v in r['p']), travel=round(r['travel'], 1), ang=deg(r), d_center=round(r['d_center'], 1), side=r['side'], near=(round(r['near'][0], 1), r['near'][1]), dist=r['dist'])
    print(out, sheet.size)
    for (n, r), inf in zip(rows, infos): print(n, rep(r), 'pista', inf['hint'], inf.get('arco', ''))
    print('grises', {k: round(v, 3) for k, v in corr.items()}, 'iconos', {k: round(v, 3) for k, v in cc.items()})

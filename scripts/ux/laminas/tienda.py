# Modelo de la tienda (ART-DIRECTION §14) para las láminas: la caja de cada elemento según las reglas de
# src/app/globals.css (.shop, .card, .card__foot…) y su dibujo con la Barlow y los iconos del juego. Las alturas de línea son
# las de Tailwind (line-height 1,5) y el pie de la tarjeta es un flex con wrap, gap de 8 y justify-content: flex-end.
# validar() lo contrasta con las capturas reales de la tienda antes de dibujar estados que aún no existen (AC-162).
# Lo usa lamina_tienda_nivel.py. No corre en la CI.
import os, sys, json, subprocess
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rutas as RT
import numpy as np
from PIL import Image, ImageDraw, ImageFont

C = dict(paper='#F2E6C8', card='#FBF4E2', line='#D8C59A', ink='#2B1D0E', soft='#5C4A33', title='#6B3A1A', wood='#6B4426',
         fillet='#C9A24B', gold='#F2C14E', gold_lo='#B8862B', btn='#1F6F8B', dis='#D9CDB0', dis_txt='#7A6E57', red='#A23B2A')
# Barcos del jugador: GDD §6 y SHIP_CLASSES de src/game/constants.ts (árbol de dev-npc, 0567e5d)
SHIPS = [dict(id='sloop', label='Balandra', hp=800, v='14', can=4, L=16, price=0),
         dict(id='brig', label='Bergantín', hp=1400, v='12', can=6, L=24, price=2000),
         dict(id='schooner', label='Goleta', hp=1100, v='15', can=4, L=22, price=3000, lvl=5, rank='marinero', rank_label='Marinero'),
         dict(id='frigate', label='Fragata', hp=2200, v='10', can=8, L=34, price=6000),
         dict(id='line', label='Navío de línea', hp=3200, v='8,5', can=10, L=42, price=12000, lvl=9, rank='contramaestre', rank_label='Contramaestre')]
ICONS = {  # src/components/hud/icons.tsx: 24 × 24, trazo de 2 y currentColor
    'coins': '<circle cx="9" cy="9" r="6"/><path d="M17.5 10.2A6 6 0 1 1 10.2 17.5"/><path d="M9 6.5v5"/>',
    'sailboat': '<path d="M11 3v13M11 3 4 14h7M13 6l6 8h-6"/><path d="M3 17h18l-2 3H5Z"/>',
    'close': '<path d="M6 6l12 12M18 6 6 18"/>',
    'compass': '<circle cx="12" cy="12" r="10"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>'}
_cache = {}


def font(px, w=500):
    k = ('f', px, w)
    if k not in _cache: _cache[k] = ImageFont.truetype(RT.FONTS + RT.FF[w], px, layout_engine=ImageFont.Layout.RAQM)
    return _cache[k]


def tw(t, px, w=500, tnum=False):
    """Ancho en px CSS (la fuente a 100 px, escalada: el ancho de RAQM es lineal con el tamaño)."""
    return font(100, w).getlength(t, features=['tnum'] if tnum else None) * px / 100


def raster(svg, px, key):
    k = ('r', key, px)
    if k not in _cache:
        src = os.path.join(RT.OUT, f'tienda-{key}.svg'); png = os.path.join(RT.OUT, f'tienda-{key}-{px}.png')
        open(src, 'w').write(svg)
        subprocess.run(['rsvg-convert', '-w', str(px), '-h', str(px), src, '-o', png], check=True)
        _cache[k] = Image.open(png).convert('RGBA')
    return _cache[k]


def icon(name, px, color):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" '
           f'stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>')
    return raster(svg, px, f'{name}-{color[1:]}')


def insignia(rank, px):
    """La insignia de hoy (D74) desde su SVG de scripts/ux/calibracion/insignias-1-1.json."""
    ins = json.load(open(os.path.join(RT.REPO, 'scripts', 'ux', 'calibracion', 'insignias-1-1.json')))['insignias'][rank]
    return raster(ins['svg'], px, f'ins-{rank}')


def fmt(n):  # toLocaleString('es-ES'): sin separador con 4 cifras
    return f'{n:,}'.replace(',', '.') if n >= 10000 else str(n)


# --- caja de los elementos (px CSS)
LH = 1.5
def wrap(runs, W):
    """Parte las líneas de .card__stats (13 px; <b> a 700) por los espacios, como el navegador."""
    toks = []
    for t, w in runs:
        for i, part in enumerate(t.split(' ')):
            if i: toks.append((' ', w))
            if part: toks.append((part, w))
    lines, cur, x = [], [], 0.0
    for t, w in toks:
        if t == ' ':
            cur.append((t, w)); x += tw(t, 13, w); continue
        wd = tw(t, 13, w)
        if cur and x + wd > W + 0.01:
            while cur and cur[-1][0] == ' ': x -= tw(' ', 13, cur.pop()[1])
            lines.append(cur); cur, x = [], 0.0
        cur.append((t, w)); x += wd
    lines.append(cur)
    return lines


def foot_items(ship, st, level_rule):
    """Los hijos de .card__foot de la tarjeta de un barco. level_rule: 'propia' (línea propia, flex-basis 100 %),
    'natural' (sin forzar), o None (la tienda de la 1.0, sin nivel)."""
    if st['active'] == ship['id']:
        return [dict(k='stamp', t='EN USO', w=tw('EN USO', 13, 700) + 24, h=13 * LH + 12)]
    if ship['id'] in st['owned']:
        return [dict(k='btn2', t='Usar', w=max(132, tw('Usar', 15, 600) + 32), h=40)]
    out = []
    lock = level_rule and ship.get('lvl') and st['level'] < ship['lvl']
    if lock:
        t = f"Requiere nivel {ship['lvl']} ({ship['rank_label']})"
        out.append(dict(k='why', t=t, rank=ship['rank'], w=16 + 4 + tw(t, 13, 500), h=13 * LH, full=level_rule == 'propia', auto=True))
    elif st['gold'] < ship['price']:
        t = f"Te faltan {fmt(ship['price'] - st['gold'])}"
        out.append(dict(k='why', t=t, w=tw(t, 13, 500), h=13 * LH, auto=True))
    p = fmt(ship['price'])
    out.append(dict(k='price', t=p, w=16 + 4 + tw(p, 16, 700, True), h=16 * LH))
    off = lock or st['gold'] < ship['price']
    out.append(dict(k='btn' + ('0' if off else '1'), t='Comprar', w=max(132, tw('Comprar', 15, 600) + 32), h=40))
    return out


def foot_layout(items, W):
    """flex-wrap con gap 8: líneas codiciosas; la que lleva margin-right: auto queda a la izquierda y el resto a la
    derecha (justify-content: flex-end); cada línea, del alto de su hijo más alto y centrada en vertical."""
    lines, cur, x = [], [], 0.0
    for it in items:
        wd = W if it.get('full') else it['w']
        if cur and (x + 8 + wd > W + 0.01 or it.get('full') or cur[-1].get('full')):
            lines.append(cur); cur, x = [], 0.0
        cur.append(dict(it, ow=wd)); x += (8 if len(cur) > 1 else 0) + wd
    lines.append(cur)
    y, out = 0.0, []
    for ln in lines:
        h = max(i['h'] for i in ln)
        right = sum(i['ow'] for i in ln) + 8 * (len(ln) - 1)
        xs, xa = [], W - right
        if ln[0].get('auto'): xs.append(0.0); xa = W - (right - ln[0]['ow'] - 8)
        else: xs.append(xa); xa += ln[0]['ow'] + 8
        for i in ln[1:]: xs.append(xa); xa += i['ow'] + 8
        for i, x0 in zip(ln, xs): out.append(dict(i, x=x0, y=y + (h - i['h']) / 2))
        y += h + 8
    return out, y - 8


def card_box(ship, st, W, level_rule):
    """Alto natural de una tarjeta de barco de ancho W, y sus piezas."""
    BW = W - 2 - 24 - 64 - 12
    hp = round(ship['hp'] * st.get('hull', 1.0))
    runs = [('Vida ', 500), (fmt(hp), 700), (' · Velocidad ', 500), (f"{ship['v']} m/s", 700), (' · Cañones ', 500),
            (f"{ship['can']} por banda", 700), (f" · Eslora {ship['L']} m", 500)]
    stats = wrap(runs, BW)
    foot, fh = foot_layout(foot_items(ship, st, level_rule), BW)
    content = 18 * LH + 4 + len(stats) * 13 * LH + 4 + fh
    H = max(128, 2 + 24 + max(64, content))
    return dict(ship=ship, W=W, BW=BW, H=H, stats=stats, foot=foot, fh=fh)


def grid_layout(cards, cols, W, gap=16):
    """Rejilla de 2 o 1 columnas: cada fila, del alto de su tarjeta más alta (las demás se estiran)."""
    out, y = [], 0.0
    for r in range(0, len(cards), cols):
        row = cards[r:r + cols]; h = max(c['H'] for c in row)
        for j, c in enumerate(row): out.append(dict(c, x=j * (W + gap), y=y, H=h))
        y += h + gap
    return out, y - gap


# --- tamaños de la tienda (globals.css): escritorio y apaisado, modal; móvil (< 700 px), hoja inferior
def shop_geom(vw, vh, modal_h=580):
    if vw >= 700:
        w = min(880, vw - 32); h = min(modal_h, vh - 32); b = 6
        return dict(kind='modal', x=(vw - w) / 2, y=(vh - h) / 2, w=w, h=h, bt=b, bs=b, title=28, pad=(16, 20), cols=2,
                    inner=w - 2 * b, grid_h=h - 2 * b - 64 - (15 * LH + 23 + 1))
    h = round(vh * 0.82, 2)
    return dict(kind='sheet', x=0, y=vh - h, w=vw, h=h, bt=4, bs=0, title=24, pad=(12, 16), cols=1, inner=vw,
                grid_h=h - 4 - 64 - (15 * LH + 23 + 1))


def layout(vw, vh, st, ships=SHIPS, level_rule='propia', modal_h=580):
    g = shop_geom(vw, vh, modal_h)
    cw = (g['inner'] - 2 * g['pad'][1] - 16 * (g['cols'] - 1)) / g['cols']
    cards = [card_box(s, st, cw, level_rule) for s in ships]
    placed, gh = grid_layout(cards, g['cols'], cw)
    return dict(g=g, cw=cw, cards=placed, content_h=gh + 2 * g['pad'][0])


# --- dibujo (a escala S: 2 para las láminas)
def hexrgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


class Pen:
    def __init__(self, im, S):
        self.im, self.S, self.d = im, S, ImageDraw.Draw(im)

    def r(self, v): return int(np.floor(v * self.S + 0.5))

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1, radius=0):
        S = self.S
        self.d.rounded_rectangle((self.r(x0), self.r(y0), max(self.r(x0), self.r(x1) - 1), max(self.r(y0), self.r(y1) - 1)), radius=radius * S,
                                 fill=hexrgb(fill) if isinstance(fill, str) else fill,
                                 outline=hexrgb(outline) if isinstance(outline, str) else outline, width=max(1, round(width * S)))

    def text(self, x, top, t, px, w=500, color='#2B1D0E', tnum=False, lh=LH):
        """Texto con su caja de línea en `top` (alto px·lh): la línea base cae donde la pone el navegador."""
        f = font(px * self.S, w); a, dsc = f.getmetrics()
        base = self.r(top) + (px * lh * self.S - (a + dsc)) / 2 + a
        self.d.text((self.r(x), base), t, font=f, fill=hexrgb(color), anchor='ls', features=['tnum'] if tnum else None)

    def paste(self, img, x, y):
        self.im.alpha_composite(img, (self.r(x), self.r(y))) if self.im.mode == 'RGBA' else self.im.paste(img, (self.r(x), self.r(y)), img)


def draw_card(p, c, ox, oy, st):
    s, W, H = c['ship'], c['W'], c['H']
    x0, y0 = ox + c['x'], oy + c['y']
    p.rect(x0, y0, x0 + W, y0 + H, fill=C['card'], outline=C['line'], radius=8)
    ib = tuple(round(a * 0.92 + b * 0.08) for a, b in zip(hexrgb(C['card']), hexrgb(C['title'])))  # rgba(107,58,26,.08)
    p.rect(x0 + 13, y0 + 13, x0 + 77, y0 + 77, fill=ib, radius=8)
    p.paste(icon('sailboat', 40 * p.S, C['title']), x0 + 25, y0 + 25)
    bx, by = x0 + 89, y0 + 13
    p.text(bx, by, s['label'], 18, 600, C['ink'])
    y = by + 27 + 4
    for ln in c['stats']:
        x = bx
        for t, w in ln:
            if t != ' ': p.text(x, y, t, 13, w, C['ink'] if w == 700 else C['soft'])
            x += tw(t, 13, w)
        y += 13 * LH
    fy = y0 + H - 13 - c['fh']  # margin-top: auto
    for it in c['foot']:
        ix, iy = bx + it['x'], fy + it['y']
        k = it['k']
        if k == 'why':
            x = ix
            if it.get('rank'):
                p.paste(insignia(it['rank'], 16 * p.S), x, iy + (13 * LH - 16) / 2); x += 20
            p.text(x, iy, it['t'], 13, 500, st.get('why_color', C['red']))
        elif k == 'price':
            p.paste(icon('coins', 16 * p.S, C['ink']), ix, iy + 4)
            p.text(ix + 20, iy, it['t'], 16, 700, C['ink'], tnum=True)
        elif k == 'stamp':
            p.rect(ix, iy, ix + it['w'], iy + it['h'], outline=C['gold_lo'], width=2, radius=6)
            p.text(ix + 12, iy + 6, it['t'], 13, 700, C['gold_lo'])
        else:
            bg, fg, ol = {'btn1': (C['btn'], '#FFFFFF', None), 'btn0': (C['dis'], C['dis_txt'], None),
                          'btn2': (None, C['btn'], C['btn'])}[k]
            p.rect(ix, iy, ix + it['w'], iy + 40, fill=bg, outline=ol, width=1.5, radius=8)
            p.text(ix + (it['w'] - tw(it['t'], 15, 600)) / 2, iy + (40 - 15 * LH) / 2, it['t'], 15, 600, fg)


def draw_shop(L, st, S, scroll=0.0, tab='Barcos'):
    """La tienda entera (marco, cabecera, pestañas y la rejilla desplazada `scroll` px), en RGBA de su tamaño."""
    g = L['g']; im, p, ix, gy, iw = draw_frame(g, st, S, tab); gh = g['grid_h']
    tall = Image.new('RGBA', (round(iw * S), round((L['content_h'] + 2) * S)), (0, 0, 0, 0)); q = Pen(tall, S)
    for c in L['cards']: draw_card(q, c, g['pad'][1], g['pad'][0], st)
    win = tall.crop((0, round(scroll * S), round(iw * S), round((scroll + gh) * S)))
    p.paste(win, ix, gy)
    return im


def draw_frame(g, st, S, tab, tabs=('Mejoras', 'Barcos')):
    """Marco, cabecera de 64 y pestañas, en RGBA del tamaño de la tienda; devuelve también su Pen, la x interior, la y
    donde empieza la rejilla y el ancho interior."""
    W, H = g['w'], g['h']
    im = Image.new('RGBA', (round(W * S), round(H * S)), (0, 0, 0, 0)); p = Pen(im, S)
    if g['kind'] == 'modal':
        p.rect(0, 0, W, H, fill=C['wood'], radius=12)
        p.rect(6, 6, W - 6, H - 6, fill=C['paper'], radius=6)
        p.rect(6, 6, W - 6, H - 6, outline=C['fillet'], width=1, radius=6)
        ix, iy = 6, 6
    else:
        p.rect(0, 0, W, H + 16, fill=C['wood'], radius=16)
        p.rect(0, 4, W, H + 16, fill=C['paper'], radius=12)
        p.rect(0, 4, W, H + 16, outline=C['fillet'], width=1, radius=12)
        ix, iy = 0, 4
    iw = g['inner']
    # cabecera de 64: título (flex 1), ficha de oro, ✕ de 44
    tf = font(g['title'] * S, 'pirata')
    p.text(ix + 20, iy + (64 - g['title'] * LH) / 2, 'Astillero del Puerto', g['title'], 'pirata', C['title'])
    gt = fmt(st['gold']); chip_w = 24 + 16 + 6 + tw(gt, 16, 700, True)
    cx = ix + iw - 12 - 44; chx = cx - 12 - chip_w; chy = iy + 16
    p.rect(chx, chy, chx + chip_w, chy + 32, fill=C['gold'], radius=16)
    p.paste(icon('coins', 16 * S, C['ink']), chx + 12, chy + 8)
    p.text(chx + 34, chy + 4, gt, 16, 700, C['ink'], tnum=True)
    p.paste(icon('close', 24 * S, C['soft']), cx + 10, iy + 20)
    # pestañas: 15/600, relleno 10 0, subrayado de 3; línea de 1 debajo
    ty = iy + 64; th = 15 * LH + 23
    x = ix + 20
    for name in tabs:
        on = name == tab; wdt = tw(name, 15, 600)
        p.text(x, ty + 10, name, 15, 600, C['title'] if on else C['soft'])
        if on: p.rect(x, ty + th - 3, x + wdt, ty + th, fill=C['title'])
        x += wdt + 24
    p.rect(ix, ty + th, ix + iw, ty + th + 1, fill=C['line'])
    return im, p, ix, ty + th + 1, iw


# --- pestaña Familia (AC-195; D94; ART-DIRECTION §14): una tarjeta por familia con la imagen del barco activo en ella, su
# bandera, 3 rasgos y «Elegir» o el sello «En uso». La rejilla y la tarjeta usan las cajas de .shop__grid y .card
FAMS = (dict(id='gb', label='Británica', adj='británica', rasgos='Casco azul marino · franjas blancas · Union Jack'),
        dict(id='es', label='Española', adj='española', rasgos='Casco rojo · franjas doradas · cruz de Borgoña'))
FAM_NOTE = 'Solo cambia el aspecto: la vida, la velocidad y los cañones son los mismos. Los demás jugadores te ven con tu familia.'
FAM_OK = 'Tus barcos ahora son de la familia {}'  # el aviso, dentro del Astillero (los toasts del HUD quedan bajo el velo)
FAM_ERR = 'No se pudo cambiar la familia. Inténtalo de nuevo.'
UNAVAILABLE = 'La tienda no está disponible: no podemos guardar'  # SHOP_UNAVAILABLE (§14, AC-132)
IMG_AR = 19 / 12  # la caja de la imagen en el modal: 380 × 240 en escritorio
BACK = dict(sky=('#4F86AE', '#9EC2D6'), sea=('#1E6A93', '#0F3F5C'), hor=0.70)  # el fondo CSS de la caja (retrato.py)
UI = dict(panel=(11, 26, 36, 217), text='#F5F1E6', ok='#3DDC97', danger='#FF7A7A')  # --ui-panel (α 0,85), --ui-text…
FLAGS = {  # 30 × 20: las banderas de popa de navio_curvo.paint
    'gb': ('<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#FFFFFF" stroke-width="4"/>'
           '<path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.4"/><path d="M15 0V20M0 10H30" stroke="#FFFFFF" stroke-width="6"/>'
           '<path d="M15 0V20M0 10H30" stroke="#C8102E" stroke-width="3.6"/>'),
    'es': '<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>'}
ICONS['cloud-off'] = ('<path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/>'
                      '<path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/>')  # icons.tsx (Lucide, ISC)


def flag(fid, S):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="30" height="20">{FLAGS[fid]}</svg>'
    k = ('flag', fid, S)
    if k not in _cache:
        src = os.path.join(RT.OUT, f'tienda-flag-{fid}.svg'); png = os.path.join(RT.OUT, f'tienda-flag-{fid}-{S}.png')
        open(src, 'w').write(svg)
        subprocess.run(['rsvg-convert', '-w', str(30 * S), '-h', str(20 * S), src, '-o', png], check=True)
        _cache[k] = Image.open(png).convert('RGBA')
    return _cache[k]


def fam_layout(vw, vh, modal_h=672, banner=False):
    """Las 2 tarjetas en px CSS. Imagen: ancho de la tarjeta − 26; alto 19:12 en el modal, 104 si el alto de la ventana
    es < 700 (apaisado) y 160 en la hoja del móvil. Tarjeta: borde 1 + relleno 12 + imagen + 10 + fila de 40 (bandera,
    nombre y botón) + 4 + rasgos (13 px) + 12 + borde 1. banner: la franja de 40 px de la BD caída, que encoge la rejilla."""
    g = shop_geom(vw, vh, modal_h); cols = g['cols']
    cw = (g['inner'] - 2 * g['pad'][1] - 16 * (cols - 1)) / cols; iw = cw - 26
    ih = 160 if g['kind'] == 'sheet' else (104 if vh < 700 else iw / IMG_AR)
    H = 2 + 24 + ih + 10 + 40 + 4 + 13 * LH
    cards = [dict(fam=f, W=cw, H=H, iw=iw, ih=ih, x=j * (cw + 16) if cols == 2 else 0.0, y=0.0 if cols == 2 else j * (H + 16))
             for j, f in enumerate(FAMS)]
    cards_h = H if cols == 2 else 2 * H + 16; NW = cols * cw + 16 * (cols - 1)
    note = wrap([(FAM_NOTE, 500)], NW); note_y = cards_h + 16
    for f in FAMS: assert tw(f['rasgos'], 13, 500) <= iw, f"los rasgos de {f['label']} no caben en {iw} px"
    return dict(g=g, cw=cw, cards=cards, note=note, note_y=note_y, NW=NW, content_h=2 * g['pad'][0] + note_y + len(note) * 13 * LH,
                grid_h=g['grid_h'] - (40 if banner else 0), banner=banner)


def sky_sea(w, h, S):
    """El fondo CSS de la caja de la imagen (linear-gradient en sRGB), a S×."""
    hx = lambda s: np.array(hexrgb(s), float)
    H_ = round(h * S); y = (np.arange(H_) + 0.5) / H_; hor = BACK['hor']; sky = y < hor
    s0, s1 = map(hx, BACK['sky']); m0, m1 = map(hx, BACK['sea'])
    t = np.where(sky, y / hor, (y - hor) / (1 - hor))[:, None]
    rows = np.where(sky[:, None], s0 + (s1 - s0) * t, m0 + (m1 - m0) * t)
    return Image.fromarray(np.round(np.repeat(rows[:, None], round(w * S), 1)).astype(np.uint8), 'RGB').convert('RGBA')


def draw_fam_card(p, c, ox, oy, st, imgs):
    """st: fam (la que está en uso), pend (la elegida que espera al servidor), down (BD caída), loading (sin imágenes)."""
    f = c['fam']; W, H = c['W'], c['H']; x0, y0 = ox + c['x'], oy + c['y']; on = st['fam'] == f['id']
    p.rect(x0, y0, x0 + W, y0 + H, fill=C['card'], outline=C['gold_lo'] if on else C['line'], radius=8)
    if on: p.rect(x0 + 1, y0 + 1, x0 + W - 1, y0 + H - 1, outline=C['gold_lo'], radius=7)  # box-shadow inset de 1 px: sin mover nada
    # la imagen: el fondo CSS y el retrato encima con object-fit: contain, centrado (en la caja de 19:12 la llena)
    ix, iy, iw, ih = x0 + 13, y0 + 13, c['iw'], c['ih']
    box = sky_sea(iw, ih, p.S)
    if not st.get('loading'):
        im = imgs[f['id']]; k = ih * p.S / im.height; sw = round(im.width * k)
        box.alpha_composite(im.resize((sw, round(ih * p.S)), Image.LANCZOS), ((box.width - sw) // 2, 0))
    m = Image.new('L', box.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, box.width - 1, box.height - 1), 6 * p.S, fill=255)
    box.putalpha(m); p.paste(box, ix, iy)
    # fila de 40: bandera, nombre y, a la derecha, el botón o el sello
    ry = iy + ih + 10
    p.paste(flag(f['id'], p.S), ix, ry + 10)
    p.text(ix + 38, ry + (40 - 18 * LH) / 2, f['label'], 18, 600, C['ink'])
    if on:
        sw_ = tw('EN USO', 13, 700) + 24; sh_ = 13 * LH + 12; sx = ix + iw - sw_; sy = ry + (40 - sh_) / 2
        p.rect(sx, sy, sx + sw_, sy + sh_, outline=C['gold_lo'], width=2, radius=6); p.text(sx + 12, sy + 6, 'EN USO', 13, 700, C['gold_lo'])
    else:
        off = st.get('down') or st.get('pend') == f['id']; bw = max(132, tw('Elegir', 15, 600) + 32); bx = ix + iw - bw
        p.rect(bx, ry, bx + bw, ry + 40, fill=C['dis'] if off else C['btn'], radius=8)
        p.text(bx + (bw - tw('Elegir', 15, 600)) / 2, ry + (40 - 15 * LH) / 2, 'Elegir', 15, 600, C['dis_txt'] if off else '#FFFFFF')
    p.text(ix, ry + 44, f['rasgos'], 13, 500, C['soft'])


def notice_box(L, kind):
    """El aviso dentro del Astillero, en px CSS de la tienda: centrado y a 16 px del borde de abajo (360 × 36 en el modal;
    el ancho de la hoja − 32 en el móvil), con el estilo de .toast (--ui-panel, borde izquierdo de 4 y texto de 14)."""
    g = L['g']; w = 360 if g['kind'] == 'modal' else g['w'] - 32
    bottom = g['h'] - (g['bt'] if g['kind'] == 'modal' else 0)
    return dict(x=(g['w'] - w) / 2, y=bottom - 16 - 36, w=w, h=36, kind=kind)


def draw_fam(L, st, S, imgs, scroll=0.0, notice=None):
    """La tienda en la pestaña Familia. notice: None, 'ok' (con st['fam'] ya cambiada) o 'err'."""
    g = L['g']; im, p, ix, gy, iw = draw_frame(g, st, S, 'Familia', tabs=('Mejoras', 'Barcos', 'Familia'))
    if L['banner']:  # .shop__unsaved: 40 px, --paper-card, borde inferior de 1 --paper-line, cloud-off 16 y texto 14 en #A23B2A
        p.rect(ix, gy, ix + iw, gy + 40, fill=C['card']); p.rect(ix, gy + 39, ix + iw, gy + 40, fill=C['line'])
        p.paste(icon('cloud-off', 16 * S, C['red']), ix + 20, gy + 12); p.text(ix + 44, gy + (40 - 14 * LH) / 2, UNAVAILABLE, 14, 500, C['red'])
        gy += 40
    tall = Image.new('RGBA', (round(iw * S), round((L['content_h'] + 2) * S)), (0, 0, 0, 0)); q = Pen(tall, S)
    px, py = g['pad'][1], g['pad'][0]
    for c in L['cards']: draw_fam_card(q, c, px, py, st, imgs)
    y = py + L['note_y']
    for ln in L['note']:
        x = px
        for t, w in ln:
            if t != ' ': q.text(x, y, t, 13, w, C['soft'])
            x += tw(t, 13, w)
        y += 13 * LH
    p.paste(tall.crop((0, round(scroll * S), round(iw * S), round((scroll + L['grid_h']) * S))), ix, gy)
    if notice:
        b = notice_box(L, notice); t = FAM_OK.format(next(f['adj'] for f in FAMS if f['id'] == st['fam'])) if notice == 'ok' else FAM_ERR
        assert 12 + tw(t, 14, 500) + 12 <= b['w'] - 4, f'el aviso no cabe en {b["w"]} px'
        layer = Image.new('RGBA', im.size, (0, 0, 0, 0)); r = Pen(layer, S)
        r.rect(b['x'], b['y'], b['x'] + b['w'], b['y'] + 36, fill=UI['panel'], radius=6)
        # el borde izquierdo de 4 px sigue la curva del radio, como en CSS: la caja redondeada en su color, recortada a x < 4
        edge = Image.new('RGBA', im.size, (0, 0, 0, 0))
        Pen(edge, S).rect(b['x'], b['y'], b['x'] + b['w'], b['y'] + 36, fill=UI['ok'] if notice == 'ok' else UI['danger'], radius=6)
        cut = edge.getchannel('A').point(lambda v: v); ImageDraw.Draw(cut).rectangle((r.r(b['x'] + 4), 0, cut.width, cut.height), fill=0)
        layer.paste(edge, (0, 0), cut)
        r.text(b['x'] + 16, b['y'] + (36 - 14 * LH) / 2, t, 14, 500, UI['text'])
        im.alpha_composite(layer)
    return im


def validar():
    """Contrasta el modelo con la captura real de la pestaña Barcos (ac157-v2-shop.png, 1.0, 1440 × 900): busca el
    desplazamiento que mejor casa y da la diferencia media en el modal. Y con las alturas de las tarjetas de móvil
    (mobile-shop.png, DPR 2) medidas por las líneas de su borde."""
    st = dict(owned={'sloop', 'brig', 'frigate'}, active='frigate', gold=4321, level=1, hull=1.2)
    ships = [SHIPS[0], SHIPS[1], SHIPS[3]]
    L = layout(1440, 900, st, ships, None)
    im = draw_shop(L, st, 1)
    capt = Image.open(RT.need(os.path.join(RT.CAPTURAS, 'persistence', 'ac157-v2-shop.png'), 'captura ac157')).convert('RGB')
    g = L['g']; x0, y0 = round(g['x']), round(g['y'])
    a = np.asarray(capt, float)
    m = np.asarray(Image.alpha_composite(capt.convert('RGBA').crop((x0, y0, x0 + 880, y0 + 580)), im).convert('RGB'), float)
    best = None
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            ref = a[y0 + dy + 8:y0 + dy + 572, x0 + dx + 8:x0 + dx + 872]
            e = np.abs(ref - m[8:572, 8:872]).mean()
            if best is None or e < best[0]: best = (e, dx, dy)
    cards = [(c['ship']['label'], round(c['y'] + g['y'] + 6 + 64 + 46.5 + 16, 1), round(c['H'], 1)) for c in L['cards']]
    # móvil: alto de las tarjetas de Mejoras (bordes --paper-line en la columna x = 20 CSS)
    mob = np.asarray(Image.open(os.path.join(RT.CAPTURAS, 'mobile-shop.png')).convert('RGB'), int)
    col = mob[:, 200]; ln = hexrgb(C["line"])
    rows = [y for y in range(mob.shape[0]) if np.abs(col[y] - ln).sum() < 40]
    edges = [r for i, r in enumerate(rows) if i == 0 or r - rows[i - 1] > 2]
    return dict(diff=best, cards=cards, mobile_edges_css=[e / 2 for e in edges])


if __name__ == '__main__':
    print(validar())

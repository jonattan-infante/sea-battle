# Modelo de la tienda de la 1.3 (mejoras por barco, GDD §11 «Mejoras por barco (1.3)», Q34; D99 y D100) sobre el de
# tienda.py: la franja «Mejoras de tu <barco>» y las tarjetas de mejora de la pestaña Mejoras, y la pestaña Barcos con
# los niveles de cada barco propio y «Llega sin mejoras» en los que no se tienen. Las cajas siguen globals.css como
# tienda.py; lo nuevo (.shop__ship, .card__lv) se describe en ART-DIRECTION §14 (D99, D100).
# Los números salen de src/game/constants.ts (UPGRADE_LEVELS, CANNON_LEVELS, SHIP_CLASSES) y, para la Goleta y el Navío,
# de GDD §6 (SHIPS de tienda.py); los precios por barco se contrastan con la tabla de GDD §11 al importar. No corre en la CI.
import os, re, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rutas as RT
import tienda as T
from PIL import Image, ImageDraw, ImageFont

C, LH, fmt, Pen = T.C, T.LH, T.fmt, T.Pen
SRC = open(os.path.join(RT.REPO, 'src', 'game', 'constants.ts'), encoding='utf-8').read()
GDD = open(os.path.join(RT.REPO, 'docs', 'game', 'GDD.md'), encoding='utf-8').read()

# --- constantes del juego
UPG = {}
for m in re.finditer(r"(cannons|hull|sails): \{ label: '([^']+)', multipliers: \[([^\]]+)\], prices: \[([^\]]+)\] \}", SRC):
    UPG[m.group(1)] = dict(label=m.group(2), mult=[float(x) for x in m.group(3).split(',')],
                           prices=[int(x) for x in m.group(4).split(',')])
assert set(UPG) == {'cannons', 'hull', 'sails'}, UPG
CANNON = [dict(label=m.group(1), damage=int(m.group(2)), accuracy=float(m.group(3)), range=int(m.group(4)), reload=float(m.group(5)))
          for m in re.finditer(r"\{ label: '([^']+)', damage: (\d+), accuracy: ([\d.]+), range: (\d+), reload: ([\d.]+), price: \d+ \}", SRC)]
assert len(CANNON) == 3, CANNON
for sid in ('sloop', 'brig', 'frigate'):  # las 3 clases que ya están en el código deben casar con SHIPS de tienda.py
    m = re.search(sid + r": \{\s*id: '" + sid + r"', label: '([^']+)', kind: 'player', length: (\d+), radius: \d+, maxHp: (\d+),\s*"
                  r"patrolSpeed: [\d.]+, maxSpeed: ([\d.]+),.*?cannonsPerSide: (\d+), price: (\d+)", SRC, re.S)
    s = next(x for x in T.SHIPS if x['id'] == sid)
    got = (m.group(1), int(m.group(2)), int(m.group(3)), m.group(4), int(m.group(5)), int(m.group(6)))
    assert got == (s['label'], s['L'], s['hp'], s['v'], s['can'], s['price']), (sid, got)
UPG_ORDER = ('cannons', 'hull', 'sails')


def factor(ship): return ship['can'] / 8  # GDD §11: cañones por banda / 8


def price(ship, upg, level):
    """Precio de subir `upg` al nivel `level` (2 o 3) en `ship`: base × cañones por banda / 8 (Q34)."""
    p = UPG[upg]['prices'][level - 1] * factor(ship)
    assert p == int(p), (ship['id'], upg, level, p)
    return int(p)


# Contraste con la tabla de GDD §11 («Barco (cañones por banda) | Factor | Cañones N2 / N3 | Casco … | Velas … | Las 6»)
for s in T.SHIPS:
    row = re.search(r'^\| ' + re.escape(s['label']) + r' \(\d+\) \| ×[\d,]+ \|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|', GDD, re.M)
    assert row, f"falta la fila de {s['label']} en GDD §11"
    cells = [[int(v.replace(' ', '').replace(' ', '').replace('\xa0', '')) for v in c.split('/')] for c in row.groups()[:3]]
    mine = [[price(s, u, 2), price(s, u, 3)] for u in UPG_ORDER]
    assert cells == mine, (s['label'], cells, mine)

# --- texto con «→»: la Barlow del juego no lo trae en el subconjunto latin (lo dibuja la fuente de sistema, system-ui);
# aquí, Adwaita Sans, una sans de sistema que sí lo tiene (en el Mac sería la SF)
FALLBACK = '/usr/share/fonts/adwaita-sans-fonts/AdwaitaSans-Regular.ttf'
_fb = {}


def fb(px):
    if px not in _fb: _fb[px] = ImageFont.truetype(FALLBACK, px, layout_engine=ImageFont.Layout.RAQM)
    return _fb[px]


def tw(t, px, w=500, tnum=False):
    """Ancho en px CSS, con «→» en la fuente de sistema."""
    parts = t.split('→'); x = sum(T.tw(p, px, w, tnum) for p in parts)
    return x + (len(parts) - 1) * fb(100).getlength('→') * px / 100


def text(p, x, top, t, px, w=500, color='#2B1D0E', tnum=False):
    parts = t.split('→')
    for i, part in enumerate(parts):
        if part: p.text(x, top, part, px, w, color, tnum)
        x += T.tw(part, px, w, tnum)
        if i < len(parts) - 1:
            f = fb(px * p.S); a, dsc = f.getmetrics()
            base = p.r(top) + (px * LH * p.S - (a + dsc)) / 2 + a
            p.d.text((p.r(x), base), '→', font=f, fill=T.hexrgb(color), anchor='ls')
            x += fb(100).getlength('→') * px / 100


def wrap(runs, W, px=13):
    """Como tienda.wrap, con «→» medido en la fuente de sistema."""
    toks = []
    for t, w in runs:
        for i, part in enumerate(t.split(' ')):
            if i: toks.append((' ', w))
            if part: toks.append((part, w))
    lines, cur, x = [], [], 0.0
    for t, w in toks:
        if t == ' ':
            cur.append((t, w)); x += tw(t, px, w); continue
        wd = tw(t, px, w)
        if cur and x + wd > W + 0.01:
            while cur and cur[-1][0] == ' ': x -= tw(' ', px, cur.pop()[1])
            lines.append(cur); cur, x = [], 0.0
        cur.append((t, w)); x += wd
    lines.append(cur)
    return lines


def dec(v):  # toLocaleString('es-ES', { maximumFractionDigits: 1 })
    s = f'{round(v, 1):.1f}'.rstrip('0').rstrip('.')
    return s.replace('.', ',')


def ship_by(sid): return next(s for s in T.SHIPS if s['id'] == sid)


def vel(ship): return float(ship['v'].replace(',', '.'))


# --- pestaña Mejoras: la franja del barco (.shop__ship) y las 3 tarjetas de mejora
STRIP_PAD = 10


SUB = [('Cada barco tiene las suyas. Para mejorar otro, cámbiate a él en ', 500), ('Barcos', 600), ('.', 500)]  # «Barcos», enlace


def strip_box(g, st):
    """La franja fija bajo las pestañas (.shop__ship: flex con wrap, align-items: baseline y column-gap 16): el título
    16/600 y la línea 13/500, con «Barcos» como enlace a esa pestaña. Si caben en una fila, van juntos; si no, la línea
    baja y se parte. Alto en px CSS."""
    iw = g['inner'] - 2 * 20 if g['kind'] == 'modal' else g['inner'] - 2 * 16
    ship = ship_by(st['active'])
    title = f"Mejoras de tu {ship['label']}"; tl = T.tw(title, 16, 600)
    assert tl <= iw, title
    sw = sum(tw(t, 13, w) for t, w in SUB)
    one = tl + 16 + sw <= iw + 0.01
    lines = [[(t, w) for t, w in SUB]] if one else wrap(SUB, iw)
    body = 16 * LH if one else 16 * LH + len(lines) * 13 * LH
    return dict(title=title, tl=tl, lines=lines, one=one, iw=iw, h=STRIP_PAD + body + STRIP_PAD + 1)


def upg_stats(upg, level, ship):
    nxt = min(3, level + 1); maxed = level >= 3
    if upg == 'cannons':
        a, b = CANNON[level - 1], CANNON[nxt - 1]
        if maxed: return [(f"Daño {a['damage']} · Alcance {a['range']} m · Recarga {dec(a['reload'])} s", 500)]
        return [(f"Daño {a['damage']} → ", 500), (str(b['damage']), 700), (f" · Alcance {a['range']} → ", 500), (f"{b['range']} m", 700),
                (f" · Recarga {dec(a['reload'])} → ", 500), (f"{dec(b['reload'])} s", 700)]
    m = UPG[upg]['mult']
    base, label, unit = (ship['hp'], 'Vida máx.', '') if upg == 'hull' else (vel(ship), 'Vel. máx.', ' m/s')
    val = (lambda l: fmt(round(base * m[l - 1]))) if upg == 'hull' else (lambda l: dec(base * m[l - 1]))
    if maxed: return [(f"{label} {val(level)}{unit} (×{dec(m[level - 1])})", 500)]
    return [(f"{label} {val(level)} → ", 500), (f"{val(nxt)}{unit}", 700), (f" (×{dec(m[level - 1])} → ×{dec(m[nxt - 1])})", 500)]


def upg_foot(upg, level, ship, st):
    if level >= 3:
        return [dict(k='stamp', t='MÁXIMO', w=T.tw('MÁXIMO', 13, 700) + 24, h=13 * LH + 12)]
    pr = price(ship, upg, level + 1); out = []
    if st['gold'] < pr:
        t = f"Te faltan {fmt(pr - st['gold'])}"; out.append(dict(k='why', t=t, w=T.tw(t, 13, 500), h=13 * LH, auto=True))
    p = fmt(pr); out.append(dict(k='price', t=p, w=16 + 4 + T.tw(p, 16, 700, True), h=16 * LH))
    out.append(dict(k='btn' + ('0' if st['gold'] < pr else '1'), t='Mejorar', w=max(132, T.tw('Mejorar', 15, 600) + 32), h=40))
    return out


def upg_card(upg, st, W):
    ship = ship_by(st['active']); level = st['levels'][st['active']][upg]
    BW = W - 2 - 24 - 64 - 12
    stats = wrap(upg_stats(upg, level, ship), BW)
    foot, fh = T.foot_layout(upg_foot(upg, level, ship, st), BW)
    H = max(128, 2 + 24 + max(64, 18 * LH + 4 + len(stats) * 13 * LH + 4 + fh))
    return dict(upg=upg, level=level, W=W, BW=BW, H=H, stats=stats, foot=foot, fh=fh)


def mej_layout(vw, vh, st, modal_h=672):
    g = T.shop_geom(vw, vh, modal_h); sb = strip_box(g, st)
    cw = (g['inner'] - 2 * g['pad'][1] - 16 * (g['cols'] - 1)) / g['cols']
    placed, gh = T.grid_layout([upg_card(u, st, cw) for u in UPG_ORDER], g['cols'], cw)
    return dict(g=g, strip=sb, cw=cw, cards=placed, content_h=gh + 2 * g['pad'][0], grid_h=g['grid_h'] - sb['h'])


ICONS = dict(T.ICONS)
ICONS['crosshair'] = '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'
ICONS['shield'] = '<path d="M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6Z"/>'
T.ICONS.update(ICONS)
UPG_ICON = dict(cannons='crosshair', hull='shield', sails='sailboat')


def draw_runs(p, x, y, lines, color_bold=None, link=None):
    for ln in lines:
        xx = x
        for t, w in ln:
            if t != ' ':
                if link and w == 600 and t.rstrip('.') == link:
                    text(p, xx, y, t, 13, 600, C['btn']); ww = T.tw(t, 13, 600)
                    p.rect(xx, y + 13 * LH - 3, xx + ww, y + 13 * LH - 2, fill=C['btn'])  # subrayado de 1 px
                else:
                    text(p, xx, y, t, 13, w, (color_bold or C['ink']) if w == 700 else C['soft'])
            xx += tw(t, 13, w)
        y += 13 * LH
    return y


def draw_upg_card(p, c, ox, oy, st):
    W, H = c['W'], c['H']; x0, y0 = ox + c['x'], oy + c['y']
    p.rect(x0, y0, x0 + W, y0 + H, fill=C['card'], outline=C['line'], radius=8)
    ib = tuple(round(a * 0.92 + b * 0.08) for a, b in zip(T.hexrgb(C['card']), T.hexrgb(C['title'])))
    p.rect(x0 + 13, y0 + 13, x0 + 77, y0 + 77, fill=ib, radius=8)
    p.paste(T.icon(UPG_ICON[c['upg']], 36 * p.S, C['title']), x0 + 27, y0 + 27)
    bx, by = x0 + 89, y0 + 13
    p.text(bx, by, UPG[c['upg']]['label'], 18, 600, C['ink'])
    # .card__levels: 3 puntos de 10 (gap 4) y « Nivel n/3» 12/500, a la derecha del título
    lt = f" Nivel {c['level']}/3"; lw = 3 * 10 + 2 * 4 + 4 + T.tw(lt, 12, 500); lx = bx + c['BW'] - lw
    for i in range(3):
        cx = lx + i * 14; cy = by + (18 * LH - 10) / 2
        p.d.ellipse((p.r(cx), p.r(cy), p.r(cx + 10) - 1, p.r(cy + 10) - 1), fill=T.hexrgb(C['gold_lo'] if i < c['level'] else C['line']))
    p.text(lx + 38 + 4, by + (18 * LH - 12 * LH) / 2, lt, 12, 500, C['soft'])
    y = draw_runs(p, bx, by + 27 + 4, c['stats'])
    fy = y0 + H - 13 - c['fh']
    for it in c['foot']: draw_foot_item(p, it, bx + it['x'], fy + it['y'], st)


def draw_foot_item(p, it, ix, iy, st):
    k = it['k']
    if k == 'why':
        x = ix
        if it.get('rank'):
            p.paste(T.insignia(it['rank'], 16 * p.S), x, iy + (13 * LH - 16) / 2); x += 20
        p.text(x, iy, it['t'], 13, 500, C['red'])
    elif k == 'price':
        p.paste(T.icon('coins', 16 * p.S, C['ink']), ix, iy + 4); p.text(ix + 20, iy, it['t'], 16, 700, C['ink'], tnum=True)
    elif k == 'stamp':
        p.rect(ix, iy, ix + it['w'], iy + it['h'], outline=C['gold_lo'], width=2, radius=6); p.text(ix + 12, iy + 6, it['t'], 13, 700, C['gold_lo'])
    else:
        bg, fg, ol = {'btn1': (C['btn'], '#FFFFFF', None), 'btn0': (C['dis'], C['dis_txt'], None), 'btn2': (None, C['btn'], C['btn'])}[k]
        p.rect(ix, iy, ix + it['w'], iy + 40, fill=bg, outline=ol, width=1.5, radius=8)
        p.text(ix + (it['w'] - T.tw(it['t'], 15, 600)) / 2, iy + (40 - 15 * LH) / 2, it['t'], 15, 600, fg)


TABS = ('Mejoras', 'Barcos', 'Familia')  # 1.3: la pestaña Familia de D94 (AC-195)


def baseline_dy(S):
    """Desplazamiento (px CSS) de la caja de línea de 13/500 para que su línea base caiga en la del título 16/600."""
    def base(px, w):
        a, d = T.font(px * S, w).getmetrics(); return (px * LH * S - (a + d)) / 2 + a
    return (base(16, 600) - base(13, 500)) / S


def draw_mejoras(L, st, S, scroll=0.0):
    g = L['g']; im, p, ix, gy, iw = T.draw_frame(g, st, S, 'Mejoras', tabs=TABS); sb = L['strip']
    # .shop__ship: fondo --paper-card, relleno 10 y 20 (16 en la hoja), borde inferior de 1 --paper-line
    px = 20 if g['kind'] == 'modal' else 16
    p.rect(ix, gy, ix + iw, gy + sb['h'], fill=C['card']); p.rect(ix, gy + sb['h'] - 1, ix + iw, gy + sb['h'], fill=C['line'])
    p.text(ix + px, gy + STRIP_PAD, sb['title'], 16, 600, C['ink'])
    if sb['one']:  # align-items: baseline: la línea de 13 px comparte la línea base con el título de 16
        draw_runs(p, ix + px + sb['tl'] + 16, gy + STRIP_PAD + baseline_dy(p.S), sb['lines'], link='Barcos')
    else:
        draw_runs(p, ix + px, gy + STRIP_PAD + 16 * LH, sb['lines'], link='Barcos')
    gy += sb['h']
    tall = Image.new('RGBA', (round(iw * S), round((L['content_h'] + 2) * S)), (0, 0, 0, 0)); q = Pen(tall, S)
    for c in L['cards']: draw_upg_card(q, c, g['pad'][1], g['pad'][0], st)
    p.paste(tall.crop((0, round(scroll * S), round(iw * S), round((scroll + L['grid_h']) * S))), ix, gy)
    return im


# --- pestaña Barcos: los niveles de cada barco propio (.card__lv) y «Llega sin mejoras» en los que no se tienen
LV_ICON, LV_DOT, LV_DGAP, LV_IGAP, LV_GGAP = 14, 8, 3, 4, 10
LV_W = 3 * (LV_ICON + LV_IGAP + 3 * LV_DOT + 2 * LV_DGAP) + 2 * LV_GGAP
NEW_TXT = 'Llega sin mejoras'


def title_right(ship, st):
    if ship['id'] in st['owned']: return dict(k='lv', w=LV_W, h=LV_ICON)
    return dict(k='new', w=T.tw(NEW_TXT, 13, 500), h=13 * LH)


def ship_card(ship, st, W, level_rule='propia', force_wrap=False):
    BW = W - 2 - 24 - 64 - 12
    owned = ship['id'] in st['owned']; lv = st['levels'].get(ship['id'], dict(cannons=1, hull=1, sails=1))
    hp = round(ship['hp'] * UPG['hull']['mult'][lv['hull'] - 1]); v = vel(ship) * UPG['sails']['mult'][lv['sails'] - 1]
    runs = [('Vida ', 500), (fmt(hp), 700), (' · Velocidad ', 500), (f"{dec(v)} m/s", 700), (' · Cañones ', 500),
            (f"{ship['can']} por banda", 700), (f" · Eslora {ship['L']} m", 500)]
    stats = wrap(runs, BW)
    tr = title_right(ship, st); tl = T.tw(ship['label'], 18, 600)
    twrap = tl + 8 + tr['w'] > BW + 0.01 or (force_wrap and owned)  # .card__title con flex-wrap y gap 8: lo de la derecha baja
    th = 18 * LH + (8 + max(tr['h'], 0) if twrap else 0)
    foot, fh = T.foot_layout(T.foot_items(ship, dict(st, hull=1.0), level_rule), BW)
    H = max(128, 2 + 24 + max(64, th + 4 + len(stats) * 13 * LH + 4 + fh))
    return dict(ship=ship, W=W, BW=BW, H=H, stats=stats, foot=foot, fh=fh, tr=tr, tl=tl, tw=twrap, th=th, lv=lv)


def bar_layout(vw, vh, st, modal_h=672, ships=None, force_wrap=False):
    g = T.shop_geom(vw, vh, modal_h)
    cw = (g['inner'] - 2 * g['pad'][1] - 16 * (g['cols'] - 1)) / g['cols']
    placed, gh = T.grid_layout([ship_card(s, st, cw, force_wrap=force_wrap) for s in (ships or T.SHIPS)], g['cols'], cw)
    return dict(g=g, cw=cw, cards=placed, content_h=gh + 2 * g['pad'][0], grid_h=g['grid_h'])


def draw_lv(p, x, cy, lv):
    for j, u in enumerate(UPG_ORDER):
        p.paste(T.icon(UPG_ICON[u], LV_ICON * p.S, C['soft']), x, cy - LV_ICON / 2)
        dx = x + LV_ICON + LV_IGAP
        for i in range(3):
            d0 = dx + i * (LV_DOT + LV_DGAP); d1 = cy - LV_DOT / 2
            p.d.ellipse((p.r(d0), p.r(d1), p.r(d0 + LV_DOT) - 1, p.r(d1 + LV_DOT) - 1), fill=T.hexrgb(C['gold_lo'] if i < lv[u] else C['line']))
        x += LV_ICON + LV_IGAP + 3 * LV_DOT + 2 * LV_DGAP + LV_GGAP


def draw_ship_card(p, c, ox, oy, st):
    s, W, H = c['ship'], c['W'], c['H']; x0, y0 = ox + c['x'], oy + c['y']
    p.rect(x0, y0, x0 + W, y0 + H, fill=C['card'], outline=C['line'], radius=8)
    ib = tuple(round(a * 0.92 + b * 0.08) for a, b in zip(T.hexrgb(C['card']), T.hexrgb(C['title'])))
    p.rect(x0 + 13, y0 + 13, x0 + 77, y0 + 77, fill=ib, radius=8)
    p.paste(T.icon('sailboat', 40 * p.S, C['title']), x0 + 25, y0 + 25)
    bx, by = x0 + 89, y0 + 13
    p.text(bx, by, s['label'], 18, 600, C['ink'])
    tr = c['tr']
    if c['tw']: rx, ry = bx + c['BW'] - tr['w'], by + 18 * LH + 8  # en su propia línea, a la derecha (margin-left: auto)
    else: rx, ry = bx + c['BW'] - tr['w'], by + (18 * LH - tr['h']) / 2
    if tr['k'] == 'lv': draw_lv(p, rx, ry + LV_ICON / 2, c['lv'])
    else: p.text(rx, ry, NEW_TXT, 13, 500, C['soft'])
    y = draw_runs(p, bx, by + c['th'] + 4, c['stats'])
    fy = y0 + H - 13 - c['fh']
    for it in c['foot']: draw_foot_item(p, it, bx + it['x'], fy + it['y'], st)


def draw_barcos(L, st, S, scroll=0.0):
    g = L['g']; im, p, ix, gy, iw = T.draw_frame(g, st, S, 'Barcos', tabs=TABS)
    tall = Image.new('RGBA', (round(iw * S), round((L['content_h'] + 2) * S)), (0, 0, 0, 0)); q = Pen(tall, S)
    for c in L['cards']: draw_ship_card(q, c, g['pad'][1], g['pad'][0], st)
    p.paste(tall.crop((0, round(scroll * S), round(iw * S), round((scroll + L['grid_h']) * S))), ix, gy)
    return im


if __name__ == '__main__':
    for s in T.SHIPS:
        print(s['label'], [[price(s, u, l) for l in (2, 3)] for u in UPG_ORDER])


# --- pestaña Familia de la 1.3 (D101; GDD §6 y Q38–Q39; BACKLOG AC-222 a AC-225): 3 tarjetas, «sin familia» y las 2
# familias de pago. La caja de cada tarjeta sigue las de .shop__grid y .card de D94, con el pie de las tarjetas de barco (D85)
FAM_PRICE = 4000  # GDD §6, «Precio (1.3)»: cada familia, sin nivel
NB = {'Union Jack': 'Union\u00a0Jack', 'cruz de Borgoña': 'cruz\u00a0de\u00a0Borgoña'}  # sin partir los nombres propios
FAMS13 = (dict(id='none', label='Sin familia', adj=None, rasgos='El aspecto de siempre · gratis'),) + tuple(
    dict(f, rasgos=f['rasgos'].replace('Union Jack', NB['Union Jack']).replace('cruz de Borgoña', NB['cruz de Borgoña'])) for f in T.FAMS)
TABS13 = ('Barcos', 'Familia')  # 1.3 tras D103: la pestaña Mejoras desaparece; las mejoras se abren desde cada barco
FAM13_NOTE = ('Una familia solo cambia el aspecto: la vida, la velocidad y los cañones son los mismos. '
              'Se compra una vez y vale para todos tus barcos, también los que compres después.')
FAM_BUY_ERR = 'No se pudo comprar la familia. Inténtalo de nuevo.'
for _t in (FAM_BUY_ERR, T.FAM_ERR, T.FAM_OK.format('británica'), T.FAM_OK.format('española')):
    assert T.tw(_t, 14, 500) <= 330, _t  # O-48: un aviso de .shop__notice cabe en 330 px


def fam13_foot(f, st):
    """El pie: lo que se tiene («sin familia» siempre, y cada familia comprada) lleva «Elegir» o «EN USO» y nunca precio; una
    familia que no se tiene, «Te faltan N» si no llega el oro, el precio y «Comprar»."""
    if f['id'] == st['fam']:
        return [dict(k='stamp', t='EN USO', w=T.tw('EN USO', 13, 700) + 24, h=13 * LH + 12)]
    if f['id'] == 'none' or f['id'] in st['owned']:
        off = st.get('down') or st.get('pend') == f['id']
        return [dict(k='btn' + ('0' if off else '1'), t='Elegir', w=max(132, T.tw('Elegir', 15, 600) + 32), h=40)]
    out = []
    if st['gold'] < FAM_PRICE:
        t = f"Te faltan {fmt(FAM_PRICE - st['gold'])}"; out.append(dict(k='why', t=t, w=T.tw(t, 13, 500), h=13 * LH, auto=True))
    p = fmt(FAM_PRICE); out.append(dict(k='price', t=p, w=16 + 4 + T.tw(p, 16, 700, True), h=16 * LH))
    off = st['gold'] < FAM_PRICE or st.get('down') or st.get('pend') == f['id']
    out.append(dict(k='btn' + ('0' if off else '1'), t='Comprar', w=max(132, T.tw('Comprar', 15, 600) + 32), h=40))
    return out


def fam13_layout(vw, vh, st, modal_h=672, banner=False):
    """Las 3 tarjetas en px CSS: 3 columnas en el modal (escritorio y apaisado) y 1 en la hoja del móvil. Imagen: ancho de
    la tarjeta − 26; alto 19:12 en el escritorio, 104 si el alto de la ventana es < 700 y 160 en la hoja. Tarjeta: borde 1 +
    relleno 12 + imagen + 10 + nombre (27) + 4 + rasgos (13 px, en las líneas que hagan falta) + 12 + pie + 12 + borde 1;
    las de una fila se estiran a la más alta y el pie va abajo (margin-top: auto)."""
    g = T.shop_geom(vw, vh, modal_h); cols = 3 if g['kind'] == 'modal' else 1
    cw = (g['inner'] - 2 * g['pad'][1] - 16 * (cols - 1)) / cols; iw = cw - 26
    ih = 160 if g['kind'] == 'sheet' else (104 if vh < 700 else iw / T.IMG_AR)
    cards = []
    for f in FAMS13:
        ras = wrap([(f['rasgos'], 500)], iw); foot, fh = T.foot_layout(fam13_foot(f, st), iw)
        cards.append(dict(fam=f, W=cw, iw=iw, ih=ih, ras=ras, foot=foot, fh=fh,
                          H=2 + 24 + ih + 10 + 18 * LH + 4 + len(ras) * 13 * LH + 12 + fh))
    placed, gh = T.grid_layout(cards, cols, cw)
    NW = cols * cw + 16 * (cols - 1); note = wrap([(FAM13_NOTE, 500)], NW); note_y = gh + 16
    return dict(g=g, cw=cw, cards=placed, note=note, note_y=note_y, NW=NW, cards_h=gh,
                content_h=2 * g['pad'][0] + note_y + len(note) * 13 * LH, grid_h=g['grid_h'] - (40 if banner else 0), banner=banner)


def draw_fam13_card(p, c, ox, oy, st, imgs):
    f = c['fam']; W, H = c['W'], c['H']; x0, y0 = ox + c['x'], oy + c['y']; on = st['fam'] == f['id']
    p.rect(x0, y0, x0 + W, y0 + H, fill=C['card'], outline=C['gold_lo'] if on else C['line'], radius=8)
    if on: p.rect(x0 + 1, y0 + 1, x0 + W - 1, y0 + H - 1, outline=C['gold_lo'], radius=7)
    ix, iy, iw, ih = x0 + 13, y0 + 13, c['iw'], c['ih']
    box = T.sky_sea(iw, ih, p.S)
    if not st.get('loading'):
        im = imgs[f['id']]; k = ih * p.S / im.height; sw = round(im.width * k)
        if sw > box.width:  # object-fit: contain en una caja más estrecha que 19:12 (el móvil): manda el ancho
            k = box.width / im.width; sw = box.width
        sh_ = round(im.height * k); box.alpha_composite(im.resize((sw, sh_), Image.LANCZOS), ((box.width - sw) // 2, (box.height - sh_) // 2))
    m = Image.new('L', box.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, box.width - 1, box.height - 1), 6 * p.S, fill=255)
    box.putalpha(m); p.paste(box, ix, iy)
    ny = iy + ih + 10; nx = ix
    if f['id'] != 'none':
        p.paste(T.flag(f['id'], p.S), ix, ny + (18 * LH - 20) / 2); nx = ix + 38
    p.text(nx, ny, f['label'], 18, 600, C['ink'])
    y = ny + 18 * LH + 4
    for ln in c['ras']:
        x = ix
        for t, w in ln:
            if t != ' ': p.text(x, y, t, 13, w, C['soft'])
            x += tw(t, 13, w)
        y += 13 * LH
    fy = y0 + H - 13 - c['fh']
    for it in c['foot']: draw_foot_item(p, it, ix + it['x'], fy + it['y'], st)


def draw_fam13(L, st, S, imgs, scroll=0.0, notice=None):
    """La tienda en la pestaña Familia de la 1.3. notice: None, 'ok' (st['fam'] ya es la nueva), 'err_buy' o 'err_sel'."""
    g = L['g']; im, p, ix, gy, iw = T.draw_frame(g, st, S, 'Familia', tabs=TABS13)
    if L['banner']:
        p.rect(ix, gy, ix + iw, gy + 40, fill=C['card']); p.rect(ix, gy + 39, ix + iw, gy + 40, fill=C['line'])
        p.paste(T.icon('cloud-off', 16 * S, C['red']), ix + 20, gy + 12); p.text(ix + 44, gy + (40 - 14 * LH) / 2, T.UNAVAILABLE, 14, 500, C['red'])
        gy += 40
    tall = Image.new('RGBA', (round(iw * S), round((L['content_h'] + 2) * S)), (0, 0, 0, 0)); q = Pen(tall, S)
    px, py = g['pad'][1], g['pad'][0]
    for c in L['cards']: draw_fam13_card(q, c, px, py, st, imgs)
    y = py + L['note_y']
    for ln in L['note']:
        x = px
        for t, w in ln:
            if t != ' ': q.text(x, y, t, 13, w, C['soft'])
            x += tw(t, 13, w)
        y += 13 * LH
    p.paste(tall.crop((0, round(scroll * S), round(iw * S), round((scroll + L['grid_h']) * S))), ix, gy)
    if notice:
        b = T.notice_box(L, notice)
        t = (T.FAM_OK.format(next(f['adj'] for f in T.FAMS if f['id'] == st['fam'])) if notice == 'ok'
             else FAM_BUY_ERR if notice == 'err_buy' else T.FAM_ERR)
        layer = Image.new('RGBA', im.size, (0, 0, 0, 0)); r = Pen(layer, S)
        r.rect(b['x'], b['y'], b['x'] + b['w'], b['y'] + 36, fill=T.UI['panel'], radius=6)
        edge = Image.new('RGBA', im.size, (0, 0, 0, 0))
        Pen(edge, S).rect(b['x'], b['y'], b['x'] + b['w'], b['y'] + 36, fill=T.UI['ok'] if notice == 'ok' else T.UI['danger'], radius=6)
        cut = edge.getchannel('A').point(lambda v: v); ImageDraw.Draw(cut).rectangle((r.r(b['x'] + 4), 0, cut.width, cut.height), fill=0)
        layer.paste(edge, (0, 0), cut)
        r.text(b['x'] + 16, b['y'] + (36 - 14 * LH) / 2, t, 14, 500, T.UI['text'])
        im.alpha_composite(layer)
    return im

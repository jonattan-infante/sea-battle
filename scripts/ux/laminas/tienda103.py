# Modelo de la tienda por barco (D103; GDD §11, «Mejoras por barco (1.3)» y «Qué debe comunicar la tienda»; Q34 del
# 2026-11-16; BACKLOG AC-213, AC-214, AC-216 y AC-217), sobre tienda13.py y tienda.py. Pestañas Barcos y Familia; cada barco,
# con la vista previa de su modelo en el aspecto en uso (las 15 imágenes de retrato13.py); los propios, con sus niveles,
# «Elegir» o «EN USO» y «Mejoras», que abre la vista de mejoras de ese barco (la nueva D99). No corre en la CI.
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tienda as T
import tienda13 as M
from PIL import Image, ImageDraw

C, LH, fmt, Pen = T.C, T.LH, T.fmt, T.Pen
T.ICONS['wrench'] = ('<path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-1.5 1.5a6 6 0 0 1-6.6 1.3L7 21.6a2 2 0 0 1-2.8-2.8L10 13a6 6 0 0 1 '
                     '1.3-6.6L12.8 5l1.7 1.5Z"/>')  # icons.tsx, Wrench
T.ICONS['chevron-left'] = '<path d="m15 18-6-6 6-6"/>'  # Lucide «chevron-left» (ISC): icono nuevo para icons.tsx
PV_W = 112; PV_H = PV_W / T.IMG_AR  # la vista previa en la tarjeta: 112 × 70,7 (19:12, la caja de la pestaña Familia)
ART = dict(sloop='la', brig='el', schooner='la', frigate='la', line='el')
TABS = M.TABS13


def cbtn(t, icon=None):
    """.btn--compact: 40 de alto, sin el ancho mínimo de 132; relleno de 14 y, con icono, 16 px a 6 del texto."""
    return 14 + (16 + 6 if icon else 0) + T.tw(t, 15, 600) + 14


def ship_foot(ship, st):
    if ship['id'] in st['owned']:
        first = (dict(k='stamp', t='EN USO', w=T.tw('EN USO', 13, 700) + 24, h=13 * LH + 12) if st['active'] == ship['id']
                 else dict(k='btnc', t='Elegir', w=cbtn('Elegir'), h=40, off=st.get('down')))
        return [first, dict(k='btnm', t='Mejoras', w=cbtn('Mejoras', 'wrench'), h=40)]
    out = T.foot_items(ship, dict(st, hull=1.0), 'propia')
    if st.get('down'):
        for it in out:
            if it['k'].startswith('btn'): it['k'] = 'btn0'
    return out


def ship_card(ship, st, W):
    BW = W - 2 - 24 - PV_W - 12
    lv = st['levels'].get(ship['id'], dict(cannons=1, hull=1, sails=1))
    hp = round(ship['hp'] * M.UPG['hull']['mult'][lv['hull'] - 1]); v = M.vel(ship) * M.UPG['sails']['mult'][lv['sails'] - 1]
    runs = [('Vida ', 500), (fmt(hp), 700), (' · Velocidad ', 500), (f"{M.dec(v)} m/s", 700), (' · Cañones ', 500),
            (f"{ship['can']} por banda", 700), (f" · Eslora {ship['L']} m", 500)]
    stats = M.wrap(runs, BW)
    tr = M.title_right(ship, st); tl = T.tw(ship['label'], 18, 600)
    twrap = tl + 8 + tr['w'] > BW + 0.01
    th = 18 * LH + (8 + tr['h'] if twrap else 0)
    foot, fh = T.foot_layout(ship_foot(ship, st), BW)
    H = max(128, 2 + 24 + max(PV_H, th + 4 + len(stats) * 13 * LH + 4 + fh))
    return dict(ship=ship, W=W, BW=BW, H=H, stats=stats, foot=foot, fh=fh, tr=tr, tl=tl, tw=twrap, th=th, lv=lv)


def list_layout(vw, vh, st, modal_h=672, banner=False):
    g = T.shop_geom(vw, vh, modal_h)
    cw = (g['inner'] - 2 * g['pad'][1] - 16 * (g['cols'] - 1)) / g['cols']
    placed, gh = T.grid_layout([ship_card(s, st, cw) for s in T.SHIPS], g['cols'], cw)
    L = dict(g=g, cw=cw, cards=placed, content_h=gh + 2 * g['pad'][0], grid_h=g['grid_h'] - (40 if banner else 0), banner=banner)
    a = next(c for c in placed if c['ship']['id'] == st['active'])  # scrollIntoView({block: 'nearest'}) del barco activo al abrir
    bot = a['y'] + a['H'] + 2 * g['pad'][0]
    L['open_scroll'] = max(0.0, min(a['y'], bot - L['grid_h'])) if bot > L['grid_h'] else 0.0
    return L


def draw_preview(p, x, y, w, h, img, loading=False):
    box = T.sky_sea(w, h, p.S)
    if img is not None and not loading:
        k = min(box.height / img.height, box.width / img.width); sw, sh_ = round(img.width * k), round(img.height * k)
        box.alpha_composite(img.resize((sw, sh_), Image.LANCZOS), ((box.width - sw) // 2, (box.height - sh_) // 2))
    m = Image.new('L', box.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, box.width - 1, box.height - 1), 6 * p.S, fill=255)
    box.putalpha(m); p.paste(box, x, y)


def draw_cbtn(p, it, ix, iy):
    off = it.get('off')
    if off: p.rect(ix, iy, ix + it['w'], iy + 40, fill=C['dis'], radius=8); fg = C['dis_txt']
    else: p.rect(ix, iy, ix + it['w'], iy + 40, outline=C['btn'], width=1.5, radius=8); fg = C['btn']
    x = ix + 14
    if it['k'] == 'btnm': p.paste(T.icon('wrench', 16 * p.S, fg), x, iy + 12); x += 22
    p.text(x, iy + (40 - 15 * LH) / 2, it['t'], 15, 600, fg)


def draw_ship_card(p, c, ox, oy, st, imgs):
    s, W, H = c['ship'], c['W'], c['H']; x0, y0 = ox + c['x'], oy + c['y']
    p.rect(x0, y0, x0 + W, y0 + H, fill=C['card'], outline=C['line'], radius=8)
    draw_preview(p, x0 + 13, y0 + 13, PV_W, PV_H, imgs.get((s['id'], st['fam'])), st.get('loading'))
    bx, by = x0 + 13 + PV_W + 12, y0 + 13
    p.text(bx, by, s['label'], 18, 600, C['ink'])
    tr = c['tr']
    if c['tw']: rx, ry = bx + c['BW'] - tr['w'], by + 18 * LH + 8
    else: rx, ry = bx + c['BW'] - tr['w'], by + (18 * LH - tr['h']) / 2
    if tr['k'] == 'lv': M.draw_lv(p, rx, ry + M.LV_ICON / 2, c['lv'])
    else: p.text(rx, ry, M.NEW_TXT, 13, 500, C['soft'])
    M.draw_runs(p, bx, by + c['th'] + 4, c['stats'])
    fy = y0 + H - 13 - c['fh']
    for it in c['foot']:
        if it['k'] in ('btnc', 'btnm'): draw_cbtn(p, it, bx + it['x'], fy + it['y'])
        else: M.draw_foot_item(p, it, bx + it['x'], fy + it['y'], st)


def banner(p, ix, gy, iw, S):
    p.rect(ix, gy, ix + iw, gy + 40, fill=C['card']); p.rect(ix, gy + 39, ix + iw, gy + 40, fill=C['line'])
    p.paste(T.icon('cloud-off', 16 * S, C['red']), ix + 20, gy + 12); p.text(ix + 44, gy + (40 - 14 * LH) / 2, T.UNAVAILABLE, 14, 500, C['red'])


def toast(im, L, S, text, kind='ok'):
    b = T.notice_box(L, kind); layer = Image.new('RGBA', im.size, (0, 0, 0, 0)); r = Pen(layer, S)
    r.rect(b['x'], b['y'], b['x'] + b['w'], b['y'] + 36, fill=T.UI['panel'], radius=6)
    edge = Image.new('RGBA', im.size, (0, 0, 0, 0)); Pen(edge, S).rect(b['x'], b['y'], b['x'] + b['w'], b['y'] + 36, fill=T.UI['ok' if kind == 'ok' else 'danger'], radius=6)
    cut = edge.getchannel('A').point(lambda v: v); ImageDraw.Draw(cut).rectangle((r.r(b['x'] + 4), 0, cut.width, cut.height), fill=0)
    layer.paste(edge, (0, 0), cut); r.text(b['x'] + 16, b['y'] + (36 - 14 * LH) / 2, text, 14, 500, T.UI['text']); im.alpha_composite(layer)


def draw_list(L, st, S, imgs, scroll=None, notice=None):
    g = L['g']; im, p, ix, gy, iw = T.draw_frame(g, st, S, 'Barcos', tabs=TABS)
    if L['banner']: banner(p, ix, gy, iw, S); gy += 40
    scroll = L['open_scroll'] if scroll is None else scroll
    tall = Image.new('RGBA', (round(iw * S), round((L['content_h'] + 2) * S)), (0, 0, 0, 0)); q = Pen(tall, S)
    for c in L['cards']: draw_ship_card(q, c, g['pad'][1], g['pad'][0], st, imgs)
    p.paste(tall.crop((0, round(scroll * S), round(iw * S), round((scroll + L['grid_h']) * S))), ix, gy)
    if notice: toast(im, L, S, notice)
    return im


# --- la vista de mejoras de un barco: volver, la cabecera con la imagen, y las 3 tarjetas de mejora de hoy
NOTICE_OTHER = 'No es el barco que navegas. La mejora se le aplica igual, y sigues navegando {}.'
INFO_BG = tuple(round(a * 0.92 + b * 0.08) for a, b in zip(T.hexrgb(C['card']), T.hexrgb(C['btn'])))  # rgba(31,111,139,.08)


def art_label(sid): return f"{ART[sid]} {M.ship_by(sid)['label']}"
def de_label(sid): return ('del ' if ART[sid] == 'el' else 'de la ') + M.ship_by(sid)['label']


def upg_card(upg, st, W, sid):
    ship = M.ship_by(sid); level = st['levels'][sid][upg]; BW = W - 2 - 24 - 64 - 12
    stats = M.wrap(M.upg_stats(upg, level, ship), BW)
    foot, fh = T.foot_layout(M.upg_foot(upg, level, ship, st), BW)
    for it in foot:
        if it['k'].startswith('btn') and (st.get('down') or st.get('pend') == upg): it['k'] = 'btn0'
    H = max(128, 2 + 24 + max(64, 18 * LH + 4 + len(stats) * 13 * LH + 4 + fh))
    return dict(upg=upg, level=level, W=W, BW=BW, H=H, stats=stats, foot=foot, fh=fh)


def view_layout(vw, vh, st, sid, modal_h=672, banner=False):
    g = T.shop_geom(vw, vh, modal_h); NW = g['inner'] - 2 * g['pad'][1]
    hv_w = 190 if (g['kind'] == 'modal' and vh >= 700) else 144; hv_h = hv_w / T.IMG_AR
    tw_ = NW - hv_w - 16  # la columna de texto junto a la imagen
    title = f"Mejoras {de_label(sid)}"; tlines = M.wrap([(title, 600)], tw_, 18) if T.tw(title, 18, 600) > tw_ else [[(title, 600)]]
    active = st['active'] == sid; full = g['kind'] == 'sheet'  # en la hoja del móvil, el aviso va debajo, a todo el ancho
    nw = (NW if full else tw_) - 3 - 24
    note = None if active else M.wrap([(NOTICE_OTHER.format(art_label(st['active'])), 500)], nw)
    note_h = 0 if active else len(note) * 13 * LH + 16
    text_h = len(tlines) * 18 * LH + 6 + M.LV_ICON + 10 + ((13 * LH + 12) if active else (0 if full else note_h))
    head_h = max(hv_h, text_h) + (12 + note_h if (full and not active) else 0)
    cw = (g['inner'] - 2 * g['pad'][1] - 16 * (g['cols'] - 1)) / g['cols']
    placed, gh = T.grid_layout([upg_card(u, st, cw, sid) for u in M.UPG_ORDER], g['cols'], cw)
    y_cards = 40 + 12 + head_h + 16
    return dict(g=g, sid=sid, NW=NW, hv=(hv_w, hv_h), tw=tw_, tlines=tlines, note=note, note_h=note_h, full=full, active=active, head_h=head_h, cw=cw,
                cards=placed, y_cards=y_cards, content_h=2 * g['pad'][0] + y_cards + gh, grid_h=g['grid_h'] - (40 if banner else 0), banner=banner)


def draw_view(L, st, S, imgs, scroll=0.0, notice=None):
    g = L['g']; im, p, ix, gy, iw = T.draw_frame(g, st, S, 'Barcos', tabs=TABS)
    if L['banner']: banner(p, ix, gy, iw, S); gy += 40
    tall = Image.new('RGBA', (round(iw * S), round((L['content_h'] + 2) * S)), (0, 0, 0, 0)); q = Pen(tall, S)
    px, py = g['pad'][1], g['pad'][0]
    # volver: un botón de texto de 40 de alto, el chevron de 16 y «Barcos» 15/600 en --btn-primary
    q.paste(T.icon('chevron-left', 16 * S, C['btn']), px - 2, py + 12); q.text(px + 18, py + (40 - 15 * LH) / 2, 'Barcos', 15, 600, C['btn'])
    hy = py + 40 + 12; hv_w, hv_h = L['hv']
    draw_preview(q, px, hy, hv_w, hv_h, imgs.get((L['sid'], st['fam'])), st.get('loading'))
    tx = px + hv_w + 16; y = hy
    for ln in L['tlines']:
        x = tx
        for t, w in ln:
            if t != ' ': q.text(x, y, t, 18, 600, C['ink'])
            x += T.tw(t, 18, 600)
        y += 18 * LH
    M.draw_lv(q, tx, y + 6 + M.LV_ICON / 2, st['levels'][L['sid']]); y += 6 + M.LV_ICON + 10
    if L['active']:
        sw_ = T.tw('EN USO', 13, 700) + 24; q.rect(tx, y, tx + sw_, y + 13 * LH + 12, outline=C['gold_lo'], width=2, radius=6)
        q.text(tx + 12, y + 6, 'EN USO', 13, 700, C['gold_lo'])
    else:
        nh = L['note_h']; nx, nwid = (px, L['NW']) if L['full'] else (tx, L['tw'])
        if L['full']: y = hy + max(hv_h, y - hy) + 12
        q.rect(nx, y, nx + nwid, y + nh, fill=INFO_BG, radius=6); q.rect(nx, y, nx + 3, y + nh, fill=C['btn'])
        yy = y + 8
        for ln in L['note']:
            x = nx + 3 + 12
            for t, w in ln:
                if t != ' ': q.text(x, yy, t, 13, w, C['ink'])
                x += T.tw(t, 13, w)
            yy += 13 * LH
    for c in L['cards']: M.draw_upg_card(q, c, px, py + L['y_cards'], st)
    p.paste(tall.crop((0, round(scroll * S), round(iw * S), round((scroll + L['grid_h']) * S))), ix, gy)
    if notice: toast(im, L, S, notice)
    return im

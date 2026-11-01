# Uso (desde la raíz de r11): UX_FONTS=… UX_OUT=… UX_D98_B1=<capturas-11b/png> UX_D98_B2=<capturas-11/png> \
#        python3 -I <este guion> <scripts/ux/laminas de r11>   →  $UX_OUT/D98-opciones.png (+ D98-opciones-medidas.json)
# Lámina D98 (E18, 1.1.1): el botón de opciones del HUD y su panel, con la cámara «Centrada» (la de la 1.0, por defecto) o
# «Libre» (E13) y las 6 teclas que se pueden cambiar (las 4 de la vista, Centrar y Detener). Se dibuja sobre capturas reales
# del candidato 486b7a2 (capturas-11 de QA y capturas-11b de dev-render) con la Barlow, los colores y las cajas del juego
# (globals.css y ART-DIRECTION §12). Reutiliza el dibujo de D89 (lamina_vista_libre.py: rrect, text, icon y Centrar).
# Las flechas van como iconos, no como texto: la Barlow que sirve el juego no trae ↑ ↓ ← → (comprobado con su woff2).
# Iconos nuevos: settings y move de lucide-static 0.469.0 (ISC); las flechas, arrow-up de lucide-static girada.
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, json, math, hashlib
import numpy as np
sys.dont_write_bytecode = True
LAM = os.path.abspath(sys.argv[1]); sys.path.insert(0, LAM)
import rutas as RT
import tienda as T
import lamina_vista_libre as V
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fragata_panel as FP   # la silueta de la Fragata en el apaisado (junto a este guion)
from PIL import Image, ImageDraw, ImageOps, ImageFilter

B1 = os.environ['UX_D98_B1']; B2 = os.environ['UX_D98_B2']
PAPER, INK, SOFT, TITLE, ANN, RED = V.PAPER, V.INK, V.SOFT, V.TITLE, V.ANN, V.RED
TXT, DIM, PANEL, LINE = V.TXT, V.DIM, V.PANEL, V.LINE
GOLD, GOLD_HI, DANGER, INFO = '#F2C14E', '#FFD166', '#FF7A7A', '#6CC3F5'
ACTIVE_BG = (242, 193, 78, 0.20)   # .slot.is-active
SEL_BG = (242, 193, 78, 0.12)
V.ICON.update({
    'gear': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 '
            '.73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 '
            '0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 '
            '2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 '
            '0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    'move': '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>',
    'close': '<path d="M6 6l12 12M18 6 6 18"/>',
    **{f'arrow-{k}': f'<g transform="rotate({a} 12 12)"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></g>'
       for k, a in (('up', 0), ('right', 90), ('down', 180), ('left', 270))}})
ARROWS = {'↑': 'arrow-up', '↓': 'arrow-down', '←': 'arrow-left', '→': 'arrow-right'}

# --- textos (ux; E18, BACKLOG r11 :1909-1920)
TITLE_PANEL = 'Opciones'
CAM = [dict(id='centrada', icon='centrar', name='Centrada',
            desk='La cámara sigue siempre a tu barco, como antes.',
            touch='La cámara sigue siempre a tu barco, como antes.'),
       dict(id='libre', icon='move', name='Libre',
            desk='Mueve la vista arrastrando o con las teclas de la vista. Centrar vuelve al barco.',   # sin teclas fijas (AC-208)
            touch='Arrastra para mover la vista. Centrar vuelve al barco.')]
KEYS = [('Vista arriba', '↑'), ('Vista abajo', '↓'), ('Vista izquierda', '←'), ('Vista derecha', '→'), ('Centrar', 'C'), ('Detener', 'S')]
NOTE_KEYS = 'Solo con la cámara Libre'   # producto (E18, punto 5): la nota de las 4 de la vista y Centrar; Detener va sin nota
HELP_KEYS = 'Haz clic en una tecla para cambiarla.'
WAIT = 'Pulsa una tecla…'; WAIT_HELP = 'Esc cancela.'
SWAP = ('S era de Detener: Detener pasa a la flecha abajo.')
REJECT = 'Esa tecla es de Reparar.'                              # una fija: Espacio, Tab, Enter, R, P o N
NOVALE = 'Esa tecla no vale: usa una letra, un número o una flecha.'   # fuera de A–Z, 0–9 y flechas, o con un modificador
RESET = 'Restablecer'

# --- geometría (px CSS)
BTN_DESK = (1192, 16, 40, 40)          # a la izquierda del oro (1240, 16, 184, 40), 8 de separación
BTN_MOB = (16, 704, 52, 52)            # encima de Puerto (16, 776): 20 de separación
BTN_LAN = (12, 266, 52, 52)            # encima de Puerto (12, 326): 8 de separación
PW = 424                               # panel de escritorio: x0 808, a 16 de la caja central (x1 792)
LW = 264                               # panel del apaisado: x0 72 (8 a la derecha del botón), x1 336, a 43,8 de la caja central
FRAME = {'desk': (16, 120, 108), 'mob': (12, 116, 104), 'lan': (12, 12, 12)}   # reservas del marco útil (§6.2, D89): lado, arriba, abajo
VIEW = {'desk': (1440, 900), 'mob': (390, 844), 'lan': (844, 390)}
CENTER = {k: (0.45 * w, 0.45 * h, 0.55 * w, 0.55 * h) for k, (w, h) in VIEW.items()}   # el 10 % central de AC-23 (el barco propio)
dc = lambda v: f'{v:.1f}'.replace('.', ',')   # decimales con coma
def gap(a, c):  # separación entre 2 cajas (x0, y0, x1, y1); > 0 = no se tocan
    return max(a[0] - c[2], c[0] - a[2], a[1] - c[3], c[1] - a[3])


def gear_desk(base, S, active=False):
    x, y, w, h = BTN_DESK
    if active: V.rrect(base, S, (x, y, x + w, y + h), fill=PANEL, radius=8)
    V.rrect(base, S, (x, y, x + w, y + h), fill=ACTIVE_BG if active else PANEL, outline=GOLD if active else LINE, width=2 if active else 1, radius=8)
    V.put(base, S, V.icon('gear', 20, TXT, S), x + 10, y + 10)


def gear_touch(base, S, box, active=False):
    x, y, w, h = box
    if active: V.rrect(base, S, (x, y, x + w, y + h), fill=PANEL, radius=12)
    V.rrect(base, S, (x, y, x + w, y + h), fill=ACTIVE_BG if active else PANEL, outline=GOLD if active else LINE, width=2 if active else 1, radius=12)
    top = y + (h - (22 + 2 + 15)) / 2
    V.put(base, S, V.icon('gear', 22, TXT, S), x + (w - 22) / 2, top)
    V.text(base, S, x + w / 2, top + 24, 'Opciones', 10, 500, center=True)


def wrap(t, px, w, W):
    lines, line = [], ''
    for wd in t.split():
        s = (line + ' ' + wd).strip()
        if T.tw(s, px, w) > W and line: lines.append(line); line = wd
        else: line = s
    return lines + [line]


def keycap(base, S, x, y, key, state='normal', w=56, h=28):
    """Tecla: caja de 56 × 28, radio 6, borde --ui-line; la flecha como icono de 16 y la letra a 13/600."""
    if state == 'wait':
        V.rrect(base, S, (x, y, x + w, y + h), fill=SEL_BG, outline=GOLD, width=2, radius=6)
    elif state == 'swap':
        V.rrect(base, S, (x, y, x + w, y + h), fill=(108, 195, 245, 0.16), outline=INFO, width=2, radius=6)
    elif state == 'reject':
        V.rrect(base, S, (x, y, x + w, y + h), fill=(255, 122, 122, 0.16), outline=DANGER, width=2, radius=6)
    else:
        V.rrect(base, S, (x, y, x + w, y + h), fill=(255, 255, 255, 0.04), outline=LINE, radius=6)
    if key is None: return
    if key in ARROWS: V.put(base, S, V.icon(ARROWS[key], 16, TXT, S), x + (w - 16) / 2, y + (h - 16) / 2)
    else: V.text(base, S, x + w / 2, y + (h - 13 * 1.5) / 2, key, 13, 600, center=True)


def cam_card(base, S, box, c, selected, kind):
    x0, y0, x1, y1 = box
    if selected:
        V.rrect(base, S, box, fill=SEL_BG, outline=GOLD, width=2, radius=8)
    else:
        V.rrect(base, S, box, fill=(255, 255, 255, 0.03), outline=LINE, radius=8)
    ip = 24 if kind == 'desk' else 26
    V.put(base, S, V.icon(c['icon'], ip, GOLD_HI if selected else TXT, S), x0 + 12, y0 + 12)
    tx = x0 + 12 + ip + 10; tpx = 15 if kind == 'desk' else 16
    V.text(base, S, tx, y0 + 12 + (ip - tpx * 1.5) / 2, c['name'], tpx, 600, GOLD_HI if selected else TXT)
    # el estado: un círculo de 16 a la derecha, lleno con un punto si está elegido
    cx, cy = x1 - 12 - 8, y0 + 12 + ip / 2
    V.rrect(base, S, (cx - 8, cy - 8, cx + 8, cy + 8), outline=GOLD if selected else DIM, width=2, radius=8)
    if selected: V.rrect(base, S, (cx - 4, cy - 4, cx + 4, cy + 4), fill=GOLD, radius=4)
    dpx = 12 if kind == 'desk' else 13
    W = (x1 - x0) - 24
    lines = wrap(c['desk' if kind == 'desk' else 'touch'], dpx, 500, W)
    yy = y0 + 12 + ip + 8
    for ln in lines:
        V.text(base, S, x0 + 12, yy, ln, dpx, 500, DIM); yy += dpx * 1.5
    return lines


def close_btn(base, S, x, y, size):
    V.rrect(base, S, (x, y, x + size, y + size), fill=(255, 255, 255, 0.0), outline=LINE, radius=8)
    ip = 18 if size < 44 else 22
    V.put(base, S, V.icon('close', ip, TXT, S), x + (size - ip) / 2, y + (size - ip) / 2)


def panel_desk(base, S, mode='centrada', keys=None, state=None, x0=None, y0=64):
    """El panel de escritorio, colgado bajo el botón y alineado a su borde derecho. state: None, ('wait', i),
    ('swap', i, j) o ('reject', i, tecla)."""
    keys = list(keys or [k for _, k in KEYS])
    bx, by, bw, bh = BTN_DESK
    x1 = bx + bw; x0 = x1 - PW if x0 is None else x0
    P = 20; cw = (PW - 2 * P - 12) / 2
    # alto: cabecera 32 + 16 · «Cámara» 18 + 8 · tarjetas · 20 · «Teclas» 18 + 2 + ayuda 18 + 8 · 6 × 36 · nota · pie
    card_lines = max(len(wrap(c['desk'], 12, 500, cw - 24)) for c in CAM)
    ch = 12 + 24 + 8 + card_lines * 18 + 12
    msg_h = 22 if state else 0
    # «Teclas» 18 + 2 + ayuda 18 + 8 · «Vista» 20 + 5 × 36 · 6 · «Barco» 20 + 36 · 16 · pie 32
    H = P + 32 + 16 + 18 + 8 + ch + 20 + 18 + 2 + 18 + 8 + 20 + 5 * 36 + 6 + 20 + 36 + msg_h + 16 + 32 + P
    box = (x0, y0, x1, y0 + H)
    V.rrect(base, S, box, fill=(11, 26, 36, 0.94), outline=LINE, radius=8)
    y = y0 + P
    V.text(base, S, x0 + P, y + (32 - 18 * 1.5) / 2, TITLE_PANEL, 18, 600)
    close_btn(base, S, x1 - P - 32, y, 32)
    y += 32 + 16
    V.text(base, S, x0 + P, y, 'Cámara', 13, 600, DIM); y += 18 + 8
    cards = []
    for i, c in enumerate(CAM):
        cx = x0 + P + i * (cw + 12)
        cam_card(base, S, (cx, y, cx + cw, y + ch), c, c['id'] == mode, 'desk'); cards.append((cx, y, cx + cw, y + ch))
    y += ch + 20
    V.text(base, S, x0 + P, y, 'Teclas', 13, 600, DIM); y += 18 + 2
    V.text(base, S, x0 + P, y, HELP_KEYS, 12, 500, DIM); y += 18 + 8
    rows = []
    for i, (name, _) in enumerate(KEYS):
        if i == 0:   # grupo 1: las 4 de la vista y Centrar, con la nota a la derecha
            V.text(base, S, x0 + P, y + (20 - 12 * 1.5) / 2, 'Vista', 12, 600, DIM)
            V.text(base, S, x1 - P - T.tw(NOTE_KEYS, 12, 500), y + (20 - 12 * 1.5) / 2, NOTE_KEYS, 12, 500, DIM); y += 20
        if i == 5:   # grupo 2: Detener, que vale en los 2 modos
            y += 6; V.text(base, S, x0 + P, y + (20 - 12 * 1.5) / 2, 'Barco', 12, 600, DIM); y += 20
        st = 'normal'; k = keys[i]
        if state and state[0] == 'wait' and state[1] == i: st, k = 'wait', None
        if state and state[0] == 'swap' and i in state[1:3]: st = 'swap'
        if state and state[0] in ('reject', 'novale') and state[1] == i: st, k = 'reject', state[2]
        hi = st != 'normal'
        if hi: V.rrect(base, S, (x0 + P - 8, y, x1 - P + 8, y + 36), fill=(255, 255, 255, 0.05), radius=6)
        V.text(base, S, x0 + P, y + (36 - 14 * 1.5) / 2, name, 14, 500, TXT)
        kx = x1 - P - 56
        if st == 'wait':
            ww = T.tw(WAIT, 13, 600) + 20; keycap(base, S, x1 - P - ww, y + 4, None, 'wait', w=ww)
            V.text(base, S, x1 - P - ww / 2, y + 4 + (28 - 13 * 1.5) / 2, WAIT, 13, 600, GOLD_HI, center=True)
        else:
            keycap(base, S, kx, y + 4, k, st)
        rows.append((x0 + P, y, x1 - P, y + 36))
        y += 36
        if state and state[1] == i:
            t = {'wait': WAIT_HELP, 'swap': SWAP, 'reject': REJECT, 'novale': NOVALE}[state[0]]
            col = {'wait': DIM, 'swap': INFO, 'reject': DANGER, 'novale': DANGER}[state[0]]
            V.text(base, S, x0 + P, y + (22 - 12 * 1.5) / 2, t, 12, 600 if state[0] != 'wait' else 500, col); y += 22
    y += 16
    rw = T.tw(RESET, 14, 600) + 32
    V.rrect(base, S, (x1 - P - rw, y, x1 - P, y + 32), outline=LINE, radius=8)
    V.text(base, S, x1 - P - rw / 2, y + (32 - 14 * 1.5) / 2, RESET, 14, 600, center=True)
    return dict(box=box, cards=cards, rows=rows, H=H, card_lines=card_lines)


def panel_touch(base, S, vw, vh, mode='centrada', layout='stack'):
    """Móvil: la cámara sola. 390×844: hoja desde abajo, a todo el ancho; 844×390 ('side'): las 2 opciones una encima de
    otra, en un panel de LW a la derecha del botón y apoyado abajo, fuera de la caja central (AC-205)."""
    P = 16
    if layout == 'stack':
        W = vw; cw = W - 2 * P
        lines = [len(wrap(c['touch'], 13, 500, cw - 24)) for c in CAM]
        chs = [12 + 26 + 8 + n * 19.5 + 12 for n in lines]
        H = P + 48 + 8 + 18 + 8 + chs[0] + 8 + chs[1] + P + 8
        x0, y0 = 0, vh - H; box = (x0, y0, x0 + W, vh)
        V.rrect(base, S, (x0, y0, x0 + W, vh + 16), fill=(11, 26, 36, 0.96), outline=LINE, radius=16)
        y = y0 + P
        V.text(base, S, x0 + P, y + (48 - 18 * 1.5) / 2, TITLE_PANEL, 18, 600)
        close_btn(base, S, x0 + W - P - 48, y, 48)
        y += 48 + 8
        V.text(base, S, x0 + P, y, 'Cámara', 13, 600, DIM); y += 18 + 8
        cards = []
        for c, ch in zip(CAM, chs):
            cam_card(base, S, (x0 + P, y, x0 + P + cw, y + ch), c, c['id'] == mode, 'touch'); cards.append((x0 + P, y, x0 + P + cw, y + ch)); y += ch + 8
        return dict(box=box, cards=cards, H=H)
    bx, by, bw, bh = BTN_LAN
    W = LW; x0 = bx + bw + 8; cw = W - 2 * P
    chs = [12 + 26 + 8 + len(wrap(c['touch'], 13, 500, cw - 24)) * 19.5 + 12 for c in CAM]
    H = P + 48 + 8 + chs[0] + 8 + chs[1] + P
    y1 = vh - FRAME['lan'][2]; y0 = y1 - H; box = (x0, y0, x0 + W, y1)
    V.rrect(base, S, box, fill=(11, 26, 36, 0.96), outline=LINE, radius=12)
    y = y0 + P
    V.text(base, S, x0 + P, y + (48 - 18 * 1.5) / 2, TITLE_PANEL + ' · Cámara', 18, 600)
    close_btn(base, S, x0 + W - P - 48, y, 48)
    y += 48 + 8; cards = []
    for c, ch in zip(CAM, chs):
        cam_card(base, S, (x0 + P, y, x0 + P + cw, y + ch), c, c['id'] == mode, 'touch'); cards.append((x0 + P, y, x0 + P + cw, y + ch)); y += ch + 8
    return dict(box=box, cards=cards, H=H)


FONT = lambda px, w=600: T.font(px, w)


def azerty_img():
    """2 filas del panel con la misma tecla física (la W de un QWERTY, la Z de un AZERTY), dibujadas a 2× y bajadas."""
    W, H, k = 440, 150, 2
    L = Image.new('RGBA', (W * k, H * k), (0, 0, 0, 0))
    V.rrect(L, k, (0, 0, W, H), fill=(11, 26, 36, 0.94), outline=LINE, radius=8)
    for i, (key, lab) in enumerate((('W', 'Teclado español o inglés'), ('Z', 'Teclado francés (AZERTY): la misma tecla'))):
        y = 14 + i * 66
        V.text(L, k, 20, y + (36 - 14 * 1.5) / 2, 'Vista arriba', 14, 500, TXT); keycap(L, k, W - 20 - 56, y + 4, key)
        V.text(L, k, 20, y + 36, lab, 12, 500, DIM)
    bg = Image.new('RGBA', (W, H), (22, 78, 112, 255)); bg.alpha_composite(L.convert('RGBa').resize((W, H), Image.LANCZOS).convert('RGBA'))
    return bg.convert('RGB')


def hoja(out, hoy, nuevo, abierto, estados, libre, atac, barra_swap, medida_lan, pd, MED):
    css = lambda im: im.convert('RGB') if im.width in (1440, 1688) and im.height in (900,) else im.convert('RGB')
    def at(im, k):  # a px CSS (las de móvil vienen a DPR 2) y escala k
        w, h = (im.width // 2, im.height // 2) if im.width in (780, 1688) else im.size
        return im.convert('RGB').resize((round(w * k), round(h * k)), Image.LANCZOS)
    def cut(im, box, k=1):  # recorte en px CSS
        s = 2 if im.width in (780, 1688) else 1
        c = im.convert('RGB').crop(tuple(round(v * s) for v in box))
        return c.resize((round((box[2] - box[0]) * k), round((box[3] - box[1]) * k)), Image.LANCZOS)
    SW = 1950; sheet = Image.new('RGB', (SW, 9000), PAPER); d = ImageDraw.Draw(sheet)
    def frame(im, x, y, c=(120, 110, 95)): sheet.paste(im, (x, y)); d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=c, width=1)
    def para(x, y, w, t, f=None, c=INK, lh=22):
        f = f or FONT(15, 500); line = ''
        for wd in t.split():
            s_ = (line + ' ' + wd).strip()
            if d.textlength(s_, font=f) > w and line: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
            else: line = s_
        d.text((x, y), line, font=f, fill=c); return y + lh
    def num(x, y, n):
        d.ellipse((x - 13, y - 13, x + 13, y + 13), fill=(255, 255, 255), outline=ANN, width=3)
        d.text((x, y + 1), str(n), font=FONT(15, 700), fill=ANN, anchor='mm')
    def legend(x, y, w, items):
        for i, t in enumerate(items, 1):
            num(x + 13, y + 11, i); y = para(x + 36, y, w - 36, t) + 6
        return y
    def cap(x, y, t): d.text((x, y), t, font=FONT(14, 500), fill=SOFT)
    def h2(y, t): d.text((40, y), t, font=FONT(20), fill=TITLE); return y + 36

    d.text((40, 22), 'Opciones: la cámara centrada o libre, y tus teclas', font=FONT(30), fill=INK)
    y = para(40, 66, 1860, 'Lo que pediste: «El sistema tiene un comportamiento raro, ahora solo me puede mover en el mapa con las fechas, deberia poder '
             'ser configurable, fijo (como antes) con una opción en el menu algo como "centrar" y que se pueda elegir que teclas son las de navegación a modo '
             'de configuracion».', FONT(16, 500), SOFT)
    y = para(40, y, 1860, 'Capturas reales del juego de hoy (candidato de la 1.1) con lo nuevo dibujado encima. A tamaño real: 1 px de la lámina = 1 px de la '
             'pantalla (el móvil, a la mitad de su resolución). Aún no está construido.', FONT(16, 500), SOFT) + 18

    # 1 · el botón
    y = h2(y, '1 · El botón de opciones: hoy y con el botón, en los 3 tamaños')
    boxes = {'desk': (1080, 0, 1440, 130), 'mob': (0, 620, 200, 844), 'lan': (0, 200, 240, 390)}
    x = 40; yy = y; tops = []
    for k, lab in (('desk', 'Escritorio'), ('mob', 'Móvil'), ('lan', 'Apaisado')):
        b = boxes[k]; a1, a2 = cut(hoy[k], b), cut(nuevo[k], b)
        cap(x, yy, f'{lab}, hoy'); frame(a1, x, yy + 22); cap(x + a1.width + 24, yy, f'{lab}, con el botón'); frame(a2, x + a1.width + 24, yy + 22)
        bb = MED['boton'][k]; ox = bb[0] - b[0] - 18 if k == 'desk' else bb[0] - b[0] + bb[2] + 18
        num(x + a1.width + 24 + ox, yy + 22 + bb[1] - b[1] + bb[3] / 2, len(tops) + 1)
        tops.append(yy + 22 + max(a1.height, a2.height)); x += a1.width + a2.width + 24 + 56
    y = max(tops) + 14
    y = legend(40, y, 1860, [
        'Escritorio: arriba a la derecha, a la izquierda del oro, en (1192, 16), 40 × 40, con el engranaje de 20 px. Está en la franja de arriba, '
        'donde ya están los paneles, así que el marco donde se juega no cambia.',
        'Móvil vertical: encima de Puerto, en (16, 704), 52 × 52 con «Opciones» debajo, como los demás botones táctiles. En la barra de arriba '
        'no cabe: la derecha ya la llenan el nivel y el oro.',
        'Móvil apaisado: también encima de Puerto, en (12, 266), con 8 px de separación. En los 3, los indicadores del borde lo esquivan como a '
        'los demás botones.']) + 24

    # 2 · el panel abierto
    y = h2(y, '2 · El panel abierto: la cámara arriba del todo y, en escritorio, las teclas')
    e = at(abierto['desk'], 1); m = at(abierto['mob'], 1)
    frame(e, 40, y); frame(m, 40 + 1440 + 40, y)
    P = MED['panel']['desk']['box']; c0 = pd['desk']['cards'][0]; r0 = pd['desk']['rows'][0]
    num(40 + P[0] - 20, y + c0[1] + 20, 1); num(40 + P[0] - 20, y + r0[1] - 66 + 9, 2); num(40 + P[0] - 20, y + r0[1] - 10, 3)
    num(40 + P[2] - 20 - T.tw(RESET, 14, 600) - 32 - 22, y + P[3] - 36, 4); num(40 + P[2] + 22, y + P[1] + 36, 5)
    mm = pd['mob']; num(40 + 1440 + 40 + 24, y + mm['box'][1] - 20, 6)
    yl = y + 900 + 14
    ya = legend(40, yl, 1440, [
        'La cámara: 2 opciones grandes, la que está en uso en dorado y con el punto. «Centrada» es la de siempre y viene marcada; para volver a ella, '
        '1 clic en el engranaje y 1 en «Centrada». Su icono es el de Centrar: la misma idea.',
        'Las teclas: las 6 que se pueden cambiar, con un clic sobre la tecla. Las flechas van dibujadas, como en un teclado.',
        'Las 4 de la vista y Centrar van juntas, con la nota «Solo con la cámara Libre». Detener vale con las 2 cámaras.',
        'Restablecer vuelve a las teclas de siempre.',
        'Se cierra con la cruz, con Esc o con un clic fuera, que no mueve el barco. El juego no se para: con el panel abierto, las teclas del juego '
        'siguen funcionando, salvo mientras espera una tecla. Esc hace una cosa por pulsación: cancela la espera, cierra el panel y, después, el ataque.'])
    yb = para(40 + 1480 + 36, yl, 390 - 36, 'En el móvil, la cámara sola, en una hoja que sube desde abajo, con la cruz de 48 × 48. Tapa los botones mientras está abierta.')
    num(40 + 1480 + 13, yl + 11, 6)
    y = max(ya, yb) + 16
    l = at(abierto['lan'], 1); ml = at(medida_lan, 1); fr = MED['fragata']; lb = MED['panel']['lan']['box']
    cap(40, y, 'Móvil apaisado (844 × 390): las 2 opciones una encima de otra, junto al botón'); frame(l, 40, y + 22)
    cap(40 + 844 + 40, y, 'Medida (no es el juego): la caja del centro y la Fragata con la proa a la izquierda'); frame(ml, 40 + 884, y + 22)
    y += 22 + 390 + 14
    assert fr['defecto']['tapa_pct'] == 0 and fr['cercano']['rumbo'] == 270, fr
    pct = f"{fr['cercano']['tapa_pct']:.1f}".replace('.', ',')
    y = para(40, y, 1860, f'Con la cruz de 48 × 48. El panel va a la derecha del botón y apoyado abajo, de x {lb[0]:.0f} a {lb[2]:.0f}, para no tapar tu barco: '
             f'la caja del centro de la pantalla (en rojo, donde la cámara pone tu barco) queda a {MED["centro"]["lan"]["separacion"]:.0f} px. En blanco, la Fragata, '
             f'el barco más grande, con el zoom de siempre: no la tapa con ningún rumbo. En magenta, con el zoom más cercano: con la proa a la izquierda, '
             f'tapa el bauprés (el palo que sale de la proa) y la punta de sus velas, {fr["cercano"]["px"]:.0f} px, el {pct} % del barco.') + 24

    # 3 · cambiar una tecla
    y = h2(y, '3 · Escritorio: cambiar una tecla, en sus 4 casos')
    x = 40; hs = []
    for (st, im, r), lab in zip(estados, ('a · Espera: has hecho clic en «Vista abajo»', 'b · Intercambio: has pulsado S, que era de Detener',
                                           'c · Rechazo: R es de Reparar; la tecla no cambia', 'd · Rechazo: F5 no vale; la tecla no cambia')):
        crop = im.convert('RGB')
        cap(x, y, lab); frame(crop, x, y + 22); hs.append(crop.height); x += crop.width + 40
    y += 22 + max(hs) + 14
    sb = cut(barra_swap, (540, 796, 900, 900), 2); cap(40, y, 'b, en la barra de acciones (×2): la ranura de Detener enseña su tecla nueva'); frame(sb, 40, y + 22)
    az = azerty_img(); xa = 40 + sb.width + 40
    cap(xa, y, 'La misma tecla en 2 teclados: se guarda su sitio y se enseña su letra'); frame(az, xa, y + 22)
    yl = para(xa + az.width + 40, y + 22, 1910 - (xa + az.width + 40), 'La tecla que se enseña en el HUD sigue a la que eliges: la ranura de Detener '
              'y la caja de la tecla de Centrar. Valen las letras, los números de la fila de arriba y las 4 flechas, sin Mayús, Ctrl, Alt ni Cmd. '
              'Una tecla de una acción fija (Espacio, Tab, Enter, R, P o N) se rechaza con «Esa tecla es de…»; cualquier otra que no esté en la lista, '
              'con «Esa tecla no vale». Las 2, en rojo y sin cambiar nada. Esc no se asigna: mientras espera, cancela.')
    y = max(y + 22 + max(sb.height, az.height), yl) + 30

    # 4 · centrada frente a libre
    y = h2(y, '4 · «Centrada» frente a «Libre» en la pantalla de juego')
    a1, a2 = at(nuevo['desk'], 0.5), at(libre['desk'], 0.5)
    cap(40, y, 'Centrada: la cámara sobre tu barco'); frame(a1, 40, y + 22); cap(40 + 720 + 40, y, 'Libre: has movido la vista'); frame(a2, 40 + 760, y + 22)
    ak = cut(atac, (560, 640, 880, 900)); cap(40 + 1520 + 30, y, 'En los 2 modos: quien te dispara'); frame(ak, 40 + 1550, y + 22)
    num(40 + 760 + 620, y + 22 + 150, 1); num(40 + 760 + 690, y + 22 + 186, 2); num(40 + 1550 + 190, y + 22 + 130, 3)
    y += 22 + 450 + 14
    m1, m2 = at(nuevo['mob'], 0.6), at(libre['mob'], 0.6); l1, l2 = at(nuevo['lan'], 0.6), at(libre['lan'], 0.6)
    cap(40, y, 'Móvil: Centrada y Libre'); cap(40 + 2 * m1.width + 60, y, 'Apaisado: Centrada (arriba) y Libre'); y += 22
    frame(m1, 40, y); frame(m2, 40 + m1.width + 20, y); frame(l1, 40 + 2 * m1.width + 60, y); frame(l2, 40 + 2 * m1.width + 60, y + l1.height + 16)
    yl = legend(40 + 2 * m1.width + 60 + l1.width + 30, y, 1860 - (2 * m1.width + 60 + l1.width + 30), [
        'En «Libre», el botón Centrar, con la caja de su tecla (la C, si no la cambias), solo mientras la vista está lejos de tu barco, como hoy.',
        'Y el indicador de tu barco, con la distancia. En «Centrada» no sale ninguno de los 2: la vista nunca se separa.',
        'El indicador de quien te dispara desde fuera de la vista sale en los 2 modos.',
        'En «Centrada», arrastrar en el agua navega al soltar, como en la 1.0; ni las teclas de la vista ni el minimapa la mueven. '
        'Las pantallas de móvil y apaisado van a 0,6 de su tamaño.'])
    y = max(y + m1.height, yl) + 30

    # 5 · piezas
    y = h2(y, '5 · Las piezas de cerca (×3), en color y en grises')
    def piece(im, box, k=3):
        return cut(im, box, k)
    ps = [('Botón, escritorio', piece(nuevo['desk'], (1186, 10, 1238, 62))), ('Pulsado', piece(abierto['desk'], (1186, 10, 1238, 62))),
          ('Botón, táctil', piece(nuevo['mob'], (10, 698, 74, 762))),
          ('Las 2 opciones', cut(abierto['desk'], tuple(round(v) for v in (pd['desk']['cards'][0][0] - 6, pd['desk']['cards'][0][1] - 6, pd['desk']['cards'][1][2] + 6, pd['desk']['cards'][1][3] + 6)), 1.6))]
    x = 40; hmax = 0
    for lab, im in ps:
        cap(x, y, lab); frame(im, x, y + 22); g = ImageOps.grayscale(im).convert('RGB'); frame(g, x, y + 22 + im.height + 12)
        hmax = max(hmax, 2 * im.height + 12); x += im.width + 36
    y += 22 + hmax + 30

    # 6 · medidas, coste y en contra
    y = h2(y, 'Qué cambia frente a hoy')
    for t in ('Un botón nuevo en el HUD, en los 3 tamaños, y un panel que solo existe mientras está abierto.',
              '«Centrada» es la cámara de la 1.0 y la que trae todo el mundo. «Libre» es la de la vista libre de la 1.1, sin cambios.',
              'Las 4 teclas de la vista, Centrar y Detener se pueden cambiar; se guardan en el navegador con la cámara elegida.'):
        y = para(56, y, 1840, '· ' + t)
    y += 10; y = h2(y, 'Medidas')
    pdk = MED['panel']
    for t in (f'Botón: escritorio {BTN_DESK}, móvil {BTN_MOB}, apaisado {BTN_LAN} (x, y, ancho, alto, en px de pantalla).',
              f'Panel (x0, y0, x1, y1): escritorio {tuple(round(v) for v in pdk["desk"]["box"])}, de {PW} × {pdk["desk"]["H"]:.0f}, 8 px bajo el botón y a 8 px del minimapa; '
              f'móvil, hoja de 390 × {pdk["mob"]["H"]:.0f} desde abajo; apaisado, {tuple(round(v) for v in pdk["lan"]["box"])}, de {LW} × {pdk["lan"]["H"]:.0f}.',
              f'Tu barco se sigue viendo con el panel abierto: la caja del 10 % central de la pantalla, donde la cámara pone tu barco, queda fuera del panel en los 3 tamaños. '
              f'Separación: {MED["centro"]["desk"]["separacion"]:.0f} px en escritorio (la caja acaba en x {CENTER["desk"][2]:.0f} y el panel empieza en {pdk["desk"]["box"][0]:.0f}), '
              f'{MED["centro"]["mob"]["separacion"]:.0f} px en el móvil (la caja acaba en y {dc(CENTER["mob"][3])} y la hoja empieza en {pdk["mob"]["box"][1]:.0f}) '
              f'y {MED["centro"]["lan"]["separacion"]:.0f} px en el apaisado (el panel acaba en x {pdk["lan"]["box"][2]:.0f} y la caja empieza en {dc(CENTER["lan"][0])}).',
              'El marco útil no cambia: 16 / 120 / 108 en escritorio, 12 / 116 / 104 en el móvil y 12 en el apaisado. El botón de escritorio queda dentro de la '
              'franja de 120 de arriba; en el móvil y el apaisado es un bloque más del HUD dentro del marco, como Reparar, y los indicadores lo esquivan (regla AD-30).',
              f'Textos medidos con la Barlow del juego: el más largo de una línea, «{NOVALE}», {MED["anchos"][NOVALE]:.0f} px de los {PW - 40} del panel; '
              f'el del intercambio, {MED["anchos"][SWAP]:.0f}; «Opciones» bajo el botón táctil, {MED["anchos"]["Opciones"]:.0f} de 52.'):
        y = para(56, y, 1840, '· ' + t)
    y += 10; y = h2(y, 'Lo que cuesta')
    for t in (f'Nada en el render: 0 triángulos y 0 llamadas de dibujo; son elementos de la página. Iconos nuevos: el engranaje, el de «Libre» y las 4 '
              f'flechas, {MED["iconos_B"]} B de SVG sin comprimir. Ningún mensaje al servidor: la cámara y las teclas se guardan en el navegador.',):
        y = para(56, y, 1840, '· ' + t)
    y += 10; d.text((40, y), 'En contra', font=FONT(20), fill=RED); y += 36
    for t in ('Es un botón más en pantalla: en el móvil y el apaisado, encima de Puerto (a 20 y 8 px).',
              f'Con el panel abierto el juego sigue: en escritorio tapa el mar de la derecha y el final del aviso «Zona segura» ({MED["tapa_aviso"]:.0f} de sus '
              f'{MED["ancho_aviso"]:.0f} px; su texto se sigue leyendo); en el móvil, la hoja tapa los botones de abajo; en el apaisado, '
              f'el mar a la izquierda de tu barco y, si tienes un objetivo, la parte de abajo de su panel ({MED["objetivo"][48]:.0f} de sus 48 px de alto; {MED["objetivo"][70]:.0f} de 70 con un jugador o un barco peligroso). '
              f'Con el zoom más cercano y la proa a la izquierda, tapa la punta de la Fragata: {MED["fragata"]["cercano"]["px"]:.0f} px (§2).',
              'En «Centrada» no se puede mirar lejos de tu barco, como en la 1.0: para eso está «Libre».',
              'Las flechas no están en la letra del juego: van dibujadas en las teclas y, en los avisos, se escriben («flecha abajo»).',
              'En un teclado que no es el español o el inglés, la tecla se guarda por su sitio y se enseña con la letra de ese teclado.'):
        y = para(56, y, 1840, '· ' + t, c=RED)
    sheet = sheet.crop((0, 0, SW, y + 30))
    p = os.path.join(out, 'D98-opciones.png'); sheet.save(p, optimize=True)
    print('hoja', p, sheet.size, hashlib.sha256(open(p, 'rb').read()).hexdigest())


def load(path, S):
    im = Image.open(path).convert('RGBA'); assert im.size[0] in (1440, 780, 1688), im.size
    return im


if __name__ == '__main__':
    SRC = dict(c_desk=f'{B1}/xp-media-desktop.png', c_mob=f'{B1}/xp-media-mobile.png', c_lan=f'{B1}/xp-media-landscape.png',
               l_desk=f'{B2}/f1-E.png', l_mob=f'{B2}/f1-M.png', l_lan=f'{B2}/f1-A.png', a_desk=f'{B2}/f2-E.png')
    sha = {k: hashlib.sha256(open(v, 'rb').read()).hexdigest() for k, v in SRC.items()}
    out = os.environ['UX_OUT']; os.makedirs(out, exist_ok=True)
    MED = dict(fuentes={k: dict(ruta=os.path.basename(v), sha256=sha[k]) for k, v in SRC.items()})

    def scr(key, S, draw=None):
        """La captura con lo nuevo dibujado en una capa a 2× la escala de la captura (el texto a 12–14 px sale mal a 1×),
        bajada con LANCZOS en alfa premultiplicado y puesta encima."""
        im = load(SRC[key], S)
        if draw:
            k = 2; layer = Image.new('RGBA', (im.width * k, im.height * k), (0, 0, 0, 0)); draw(layer, S * k)
            im.alpha_composite(layer.convert('RGBa').resize(im.size, Image.LANCZOS).convert('RGBA'))
        return im

    # pantallas
    hoy = {'desk': scr('c_desk', 1), 'mob': scr('c_mob', 2), 'lan': scr('c_lan', 2)}
    nuevo = {'desk': scr('c_desk', 1, lambda b, s: gear_desk(b, s)), 'mob': scr('c_mob', 2, lambda b, s: gear_touch(b, s, BTN_MOB)),
             'lan': scr('c_lan', 2, lambda b, s: gear_touch(b, s, BTN_LAN))}
    pd = {}
    def open_desk(b, s): gear_desk(b, s, True); pd['desk'] = panel_desk(b, s)
    def open_mob(b, s): pd['mob'] = panel_touch(b, s, 390, 844, layout='stack')
    def open_lan(b, s): gear_touch(b, s, BTN_LAN, True); pd['lan'] = panel_touch(b, s, 844, 390, layout='side')
    abierto = {'desk': scr('c_desk', 1, open_desk), 'mob': scr('c_mob', 2, open_mob), 'lan': scr('c_lan', 2, open_lan)}
    estados = []
    for st in (('wait', 1), ('swap', 1, 5), ('reject', 1, 'R'), ('novale', 1, 'F5')):
        keys = [k for _, k in KEYS]
        if st[0] == 'swap': keys[1], keys[5] = 'S', '↓'
        rr = {}
        def dr(l, s, keys=keys, st=st): rr['r'] = panel_desk(l, s, keys=keys, state=st)
        b = scr('c_desk', 1, dr); r = rr['r']
        estados.append((st, b.crop(tuple(round(v) for v in r['box'])), r))
    libre = {'desk': scr('l_desk', 1, lambda b, s: gear_desk(b, s)), 'mob': scr('l_mob', 2, lambda b, s: gear_touch(b, s, BTN_MOB)),
             'lan': scr('l_lan', 2, lambda b, s: gear_touch(b, s, BTN_LAN))}
    atac = scr('a_desk', 1, lambda b, s: gear_desk(b, s))

    # medidas
    MED['boton'] = dict(desk=BTN_DESK, mob=BTN_MOB, lan=BTN_LAN)
    MED['iconos_B'] = sum(len(V.ICON[k].encode()) for k in ('gear', 'move', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right'))
    MED['panel'] = {k: dict(box=[round(v, 1) for v in r['box']], H=round(r['H'], 1)) for k, r in pd.items()}
    MED['centro'] = {k: dict(caja=[round(v, 1) for v in CENTER[k]], separacion=round(gap(pd[k]['box'], CENTER[k]), 1)) for k in pd}
    assert all(v['separacion'] > 0 for v in MED['centro'].values()), MED['centro']   # AC-205: la caja central fuera del panel
    # la Fragata frente al panel del apaisado, por rumbo cada 5°: zoom por defecto (ppm₀ 3,44, R 65 m) y el más cercano (÷ 0,7)
    lb = pd['lan']['box']; MED['fragata'] = {}
    for zk, ppm in (('defecto', 3.44), ('cercano', 3.44 / 0.7)):
        w = max(FP.tapa(ppm, lb[2], lb[1], lb[3]), key=lambda r: r[1])
        MED['fragata'][zk] = dict(ppm=round(ppm, 3), rumbo=w[0], tapa_pct=round(100 * w[1], 1), px=round(max(0.0, w[6]), 1))
    MED['anchos'] = {t: round(T.tw(t, px, w), 1) for t, px, w in (
        (WAIT, 13, 600), (SWAP, 12, 600), (REJECT, 12, 600), (NOVALE, 12, 600), (NOTE_KEYS, 12, 500), (HELP_KEYS, 12, 500), ('Opciones', 10, 500),
        ('Vista izquierda', 14, 500), (RESET, 14, 600), (TITLE_PANEL + ' · Cámara', 18, 600))}
    json.dump(MED, open(os.path.join(out, 'D98-opciones-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    for k, im in abierto.items(): im.convert('RGB').save(os.path.join(out, f'abierto-{k}.png'))
    zs = (720 - 180, 720 + 180)   # .hud-toasts: 360 de ancho, centrado (globals.css:181 en 7cfe265); se coteja con la captura
    row = (np.asarray(hoy['desk'].convert('RGB'), int)[115].sum(1) < 120).nonzero()[0]; assert int(row.max()) + 1 == zs[1], row.max()
    MED['aviso'] = zs; MED['ancho_aviso'] = zs[1] - zs[0]; MED['tapa_aviso'] = max(0, zs[1] - pd['desk']['box'][0])
    # el panel del objetivo en 844×390: (12, 64) y 252 de ancho, 48 de alto o 70 con un jugador o un peligroso (globals.css:288 y :291 en 7cfe265)
    lb = pd['lan']['box']; MED['objetivo'] = {}
    for h in (48, 70):
        tb = (12, 64, 12 + 252, 64 + h)
        MED['objetivo'][h] = max(0, min(tb[3], lb[3]) - max(tb[1], lb[1])) if min(tb[2], lb[2]) > max(tb[0], lb[0]) else 0
    medida_lan = abierto['lan'].copy(); dm = ImageDraw.Draw(medida_lan)
    for ppm, col in ((3.44 / 0.7, (255, 79, 216, 255)), (3.44, (255, 255, 255, 255))):
        e = FP.mask(ppm, 270, K=2).filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(3))
        medida_lan.paste(Image.new('RGBA', medida_lan.size, col), (0, 0), e)
    c = CENTER['lan']; dm.rectangle(tuple(round(2 * v) for v in c), outline=(255, 72, 72, 255), width=4)   # la caja central, en rojo
    json.dump(MED, open(os.path.join(out, 'D98-opciones-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    # --- la barra de acciones con Detener en la flecha abajo (el estado del intercambio): la tecla de la ranura sigue a la asignación
    def bar_swap(b, s):
        sx, sy = 552 + 12 + 3 * (56 + 8), 808 + 9            # ranura 4 (Detener): .hud-actions con padding 9 × 12 y gap 8
        V.rrect(b, s, (sx + 2, sy + 2, sx + 16, sy + 16), fill=(13, 30, 42, 1.0), radius=2)
        V.put(b, s, V.icon('arrow-down', 11, DIM, s), sx + 4, sy + 4)
    barra_swap = scr('c_desk', 1, bar_swap)
    hoja(out, hoy, nuevo, abierto, estados, libre, atac, barra_swap, medida_lan, pd, MED)
    for k, im in nuevo.items(): im.convert('RGB').save(os.path.join(out, f'nuevo-{k}.png'))
    for k, im in libre.items(): im.convert('RGB').save(os.path.join(out, f'libre-{k}.png'))
    for st, im, r in estados: im.convert('RGB').save(os.path.join(out, f'estado-{st[0]}.png'))
    print(json.dumps(MED['panel']), json.dumps(MED['anchos'], ensure_ascii=False))

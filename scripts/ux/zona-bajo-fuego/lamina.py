#!/usr/bin/env python3
# Láminas de «Zona segura bajo fuego (1.3)»: ART-DIRECTION, sección del mismo nombre (D120 a D128); BACKLOG E20 (AC-253 a
# AC-257). Compone el HUD nuevo con el CSS real del juego (src/app/globals.css) más las reglas nuevas de NEW_CSS, que son
# las que copia la spec, y lo renderiza con Firefox headless. Los fondos son las capturas de D77 (jugador dentro de la zona
# segura, con un pirata cerca); de ellas se borran el aviso «Zona segura» y el botón Puerto viejos antes de componer.
#
# Uso, desde la raíz del repo:
#   UX_FONTS=<dir con Barlow-Medium.ttf, Barlow-SemiBold.ttf y Barlow-Bold.ttf> python3 -I scripts/ux/zona-bajo-fuego/lamina.py [dir de salida]
# Por defecto escribe en docs/game/art/ las 3 láminas zona-bajo-fuego-*.png y, junto a este guion, medidas.json con la
# regla de la franja (AC-255) medida sobre los píxeles. Necesita Firefox y Pillow. La Barlow es la del juego
# (next/font/google; OFL), de github.com/google/fonts/tree/main/ofl/barlow.
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / 'docs/game/art'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ART
FONTS = Path(os.environ.get('UX_FONTS', ''))
BG_DESK = ART / 'D77-marca-peligro-1440x900.png'
BG_MOB = ART / 'D77-marca-peligro-390x844.png'  # 780 × 1688: 390 × 844 a DPR 2

# ---------------------------------------------------------------- iconos (24 × 24, trazo 2, currentColor; §13)
ICON_HEAD = '<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
PATHS = {
    # Lucide «flame» (ISC, lucide-static 0.469.0), tal cual
    'flame': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    # Shield de icons.tsx (dibujo propio), igual que hoy
    'shield': '<path d="M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6Z"/>',
    # ShieldOff (D123): el Shield de icons.tsx con la barra de 3,3 a 21,21 y el contorno cortado 3,6 unidades a cada lado
    # del cruce, como «shield-off» de Lucide. Sin máscaras, para que valga igual en React y en el HTML de las placas
    'shield-off': '<path d="M9.01 4.28 12 3l7 3v5C19 11.98 18.86 12.93 18.61 13.82"/><path d="M14.53 19.6C13.75 20.17 12.9 20.64 12 21 8 19.4 5 15.6 5 11V8.84"/><path d="m3 3 18 18"/>',
    'store': '<path d="M3 9 5 4h14l2 5M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M5 13v8h14v-8M10 21v-5h4v5"/>',
    'anchor': '<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V21M7 11h10M4 14a8 7 0 0 0 16 0"/>',
    'close': '<path d="M6 6l12 12M18 6 6 18"/>',
}


def icon(name: str, size: int) -> str:
    return ICON_HEAD.format(s=size) + PATHS[name] + '</svg>'


BADGES = json.loads((ROOT / 'scripts/ux/calibracion/insignias-v-1-1.json').read_text())['insignias']


def badge(rank: int, size: int) -> str:
    svg = BADGES[('grumete', 'marinero', 'contramaestre', 'teniente', 'almirante')[rank - 1]]['svg']
    return svg.replace('<svg ', f'<svg width="{size}" height="{size}" style="flex:none" ', 1)


# ---------------------------------------------------------------- CSS
# Reglas nuevas (las que copia ART-DIRECTION, «Zona segura bajo fuego (1.3)»). Todo lo demás es globals.css tal cual
NEW_CSS = """
/* E20 (D121-D124): bajo fuego. Franja rayada de 8 px en lugar del borde de 4 px */
.toast--fire, .toast--zone.is-under-fire { position: relative; border-left: 0; padding-left: 18px; color: var(--ui-text); }
.toast--fire::before, .toast--zone.is-under-fire::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 8px; border-radius: 6px 0 0 6px;
  background: repeating-linear-gradient(-45deg, #ff7a7a 0 4px, #07121b 4px 8px);
}
.toast--fire { align-self: center; width: 156px; }
.toast--fire svg, .toast--zone.is-under-fire svg, .toast--danger.is-fire svg { flex: none; color: var(--ui-danger); }
.toast__text { min-width: 0; }
.toast__text b { font-weight: 600; }
.toast__count { flex: none; margin-left: auto; min-width: 23px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
/* Puerto bajo fuego (D124): cuenta sobre el icono y llama de 12 px arriba a la derecha */
.slot__fire { position: absolute; right: 3px; top: 3px; line-height: 0; color: var(--ui-danger); }
.slot__count {
  position: absolute; left: 0; right: 0; top: 14px; font-size: 18px; font-weight: 700; line-height: 22px; text-align: center;
  font-variant-numeric: tabular-nums; color: var(--ui-text); text-shadow: 0 0 2px #07121b, 0 0 2px #07121b, 0 1px 1px #07121b; pointer-events: none;
}
.hud-mobile-btn--port.is-under-fire[aria-disabled="true"] { opacity: 1; }
.hud-mobile-btn--port.is-under-fire > svg, .hud-mobile-btn--port.is-under-fire .hud-mobile-btn__label { opacity: 0.45; }
.hud-mobile-btn .slot__count { top: 6px; }
.hud-mobile-btn .slot__fire { right: 4px; top: 4px; }
"""

# Lo que pone Tailwind (preflight) en el juego y que el HTML suelto no trae; sin animaciones para la captura
BASE_CSS = """
@font-face { font-family: Barlow; src: url(f/Barlow-Medium.ttf); font-weight: 500; }
@font-face { font-family: Barlow; src: url(f/Barlow-SemiBold.ttf); font-weight: 600; }
@font-face { font-family: Barlow; src: url(f/Barlow-Bold.ttf); font-weight: 700; }
*, ::before, ::after { box-sizing: border-box; margin: 0; padding: 0; border: 0 solid; }
html { line-height: 1.5; --font-ui: Barlow; -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; background: transparent; text-align: inherit; }
svg { display: block; vertical-align: middle; }
*, ::before, ::after { animation: none !important; transition: none !important; }
body { position: relative; overflow: hidden; }
.abs { position: absolute; }
.reuse-bg { background: transparent !important; border-color: transparent !important; }
"""


def media_block(css: str, header: str) -> str:
    i = css.index(header)
    j = css.index('{', i) + 1
    depth, k = 1, j
    while depth:
        depth += {'{': 1, '}': -1}.get(css[k], 0)
        k += 1
    return css[j:k - 1]


def scoped(rules: str, scope: str) -> str:
    out = []
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', re.sub(r'/\*.*?\*/', '', rules, flags=re.S)):
        sels = ', '.join(f'{scope} {s.strip()}' for s in m.group(1).split(',') if s.strip())
        out.append(f'{sels} {{{m.group(2)}}}')
    return '\n'.join(out)


GLOBALS = (ROOT / 'src/app/globals.css').read_text()
MOBILE_CSS = scoped(media_block(GLOBALS, '@media (max-width: 699.98px), (max-height: 499.98px) {'), '.m') + '\n' + \
    scoped(media_block(GLOBALS, '@media (max-width: 699.98px) {'), '.m')
STYLE = GLOBALS.replace('@import "tailwindcss";', '') + BASE_CSS + MOBILE_CSS + NEW_CSS


# ---------------------------------------------------------------- componentes (marcado propuesto para Hud.tsx)
def notice_protected() -> str:
    return f'<div class="toast toast--zone" data-testid="safe-zone" data-zone-state="protected">{icon("shield", 16)} Zona segura</div>'


def notice_under_fire(n: int, extra: str = '') -> str:
    return (f'<div class="toast toast--zone is-under-fire {extra}" data-testid="safe-zone" data-zone-state="under-fire" data-under-fire-seconds="{n}">'
            f'{icon("shield-off", 16)}<span class="toast__text"><b>Bajo fuego:</b> la zona aún no te protege</span>'
            f'<span class="toast__count" aria-hidden="true">{n} s</span></div>')


def pill(n: int) -> str:
    return (f'<div class="toast toast--fire" data-testid="under-fire" data-under-fire-seconds="{n}">{icon("flame", 16)}'
            f'<span class="toast__text"><b>Bajo fuego</b></span><span class="toast__count" aria-hidden="true">{n} s</span></div>')


def toast_port_fire(n: int) -> str:
    return f'<div class="toast toast--danger is-fire">{icon("flame", 16)}<span class="toast__text">{port_text(n)}</span></div>'


def toast_port_zone() -> str:
    return '<div class="toast toast--warn">El puerto solo abre en la zona segura</div>'


def port_text(n: int) -> str:
    return f'Bajo fuego: el puerto abre tras {n} s sin disparos'


def slot_port(state: str, n: int = 7, extra: str = '', style: str = '') -> str:
    # state: 'open' (dentro, sin marca), 'zone' (fuera de la zona, como hoy), 'fire' (dentro, bajo fuego)
    dis = '' if state == 'open' else ' aria-disabled="true"'
    block = {'open': '', 'zone': ' data-port-block="zone"', 'fire': ' data-port-block="under-fire"'}[state]
    fire = (f'<span class="slot__fire">{icon("flame", 12)}</span><span class="slot__count" aria-hidden="true">{n}</span>'
            if state == 'fire' else '')
    cls = ' is-under-fire' if state == 'fire' else ''
    return (f'<button class="slot{cls} {extra}"{dis}{block} style="{style}"><span class="slot__key">P</span>'
            f'<span class="slot__icon">{icon("store", 28)}</span><span class="slot__label">Puerto</span>{fire}</button>')


def mbtn_port(state: str, n: int = 7, extra: str = '', style: str = '') -> str:
    dis = '' if state == 'open' else ' aria-disabled="true"'
    block = {'open': '', 'zone': ' data-port-block="zone"', 'fire': ' data-port-block="under-fire"'}[state]
    fire = (f'<span class="slot__fire">{icon("flame", 12)}</span><span class="slot__count" aria-hidden="true">{n}</span>'
            if state == 'fire' else '')
    cls = ' is-under-fire' if state == 'fire' else ''
    return (f'<button class="hud-mobile-btn hud-mobile-btn--port{cls} {extra}"{dis}{block} style="{style}">{icon("store", 22)}'
            f'<span class="hud-mobile-btn__label">Puerto</span>{fire}</button>')


def target_player(attackable: bool, mobile: bool, style: str = '') -> str:
    rng = '<span class="in-range">· ✓ En alcance</span>' if attackable else '<span class="out-range">· ✕ No atacable</span>'
    size = 12 if mobile else 16
    isz = 22
    return (f'<section class="panel hud-target is-player" style="{style}"><div class="hud-target__icon" style="color:var(--rel-player)">{icon("anchor", isz)}</div>'
            f'<div class="hud-target__body"><div class="hud-target__name" style="color:var(--rel-player)">Barbarroja</div>'
            f'<div class="hud-target__meta is-player">{badge(2, size)}<span>Balandra · Nivel 6 · Marinero</span></div>'
            f'<div class="bar bar--sm"><div class="bar__fill" style="width:72%;background:var(--rel-player)"></div></div>'
            f'<div class="hud-target__row"><span>45 m</span>{rng}</div></div>'
            f'<button class="hud-target__close">{icon("close", 16)}</button></section>')


# ---------------------------------------------------------------- render con Firefox headless
TMP = Path(tempfile.mkdtemp(prefix='zbf-'))
(TMP / 'f').mkdir()
for w in ('Medium', 'SemiBold', 'Bold'):
    shutil.copy(FONTS / f'Barlow-{w}.ttf', TMP / 'f')
PROFILE = TMP / 'profile'
PROFILE.mkdir()


def render(body: str, w: int, h: int, scale: int, name: str, bg: str = '#1A5F86') -> Image.Image:
    html = (f'<!doctype html><html style="zoom:{scale}"><head><meta charset="utf-8"><style>{STYLE}\n'
            f'html,body{{background:{bg};width:{w}px;height:{h}px}}</style></head><body>{body}</body></html>')
    page = TMP / f'{name}.html'
    page.write_text(html)
    png = TMP / f'{name}.png'
    subprocess.run(['firefox', '--headless', '--no-remote', '--profile', str(PROFILE), f'--window-size={w * scale},{h * scale}',
                    '--screenshot', str(png), page.as_uri()], check=True, capture_output=True, timeout=120)
    return Image.open(png).convert('RGB')


# ---------------------------------------------------------------- fondos: se borra lo viejo que se rediseña
def inside_round(px_x, px_y, box, r) -> bool:
    x, y, w, h = box
    cx = min(max(px_x, x + r), x + w - 1 - r)
    cy = min(max(px_y, y + r), y + h - 1 - r)
    return (px_x - cx) ** 2 + (px_y - cy) ** 2 <= r * r


def clean(im: Image.Image, box, s: int) -> None:
    """Reconstruye la escena bajo el aviso «Zona segura» viejo (box en px del dispositivo, radio 6 px CSS × s), para que el
    nuevo se componga con su propio fondo al 85 %, como en el juego. Fuera del texto, la escena es (C − 0,85 · panel) / 0,15
    (exacta: el aviso nuevo la vuelve a cubrir al 85 %). En el texto y el icono azules (#6CC3F5; ningún canal del panel
    sobre la escena pasa de 70) se interpola en la fila entre los píxeles vecinos que no son texto."""
    x, y, w, h = box
    px = im.load()
    panel = (11, 26, 36)
    r = 6 * s
    for yy in range(y, y + h):
        row = []
        for xx in range(x, x + w):
            c = px[xx, yy]
            if not inside_round(xx, yy, box, r):
                row.append(('keep', c))
            elif xx < x + 4 * s:
                row.append(('keep', c))  # borde azul de 4 px: lo tapa la franja opaca de 8 px
            elif max(c) > 70:
                row.append(('text', None))
            else:
                row.append(('scene', tuple(max(0, min(255, round((v - 0.85 * p) / 0.15))) for v, p in zip(c, panel))))
        # dilata el texto 1 px × s (antialias) y rellena por interpolación lineal
        kinds = [k for k, _ in row]
        for i, k in enumerate(kinds):
            if k == 'text':
                for j in range(max(0, i - s), min(len(row), i + s + 1)):
                    if row[j][0] == 'scene':
                        row[j] = ('text2', None)
        for i, (k, c) in enumerate(row):
            if k in ('text', 'text2'):
                a = next((row[j][1] for j in range(i - 1, -1, -1) if row[j][0] == 'scene'), None)
                b = next((row[j][1] for j in range(i + 1, len(row)) if row[j][0] == 'scene'), None)
                ia = next((j for j in range(i - 1, -1, -1) if row[j][0] == 'scene'), None)
                ib = next((j for j in range(i + 1, len(row)) if row[j][0] == 'scene'), None)
                if a is None and b is None:
                    continue
                if a is None or b is None:
                    fill = a or b
                else:
                    t = (i - ia) / (ib - ia)
                    fill = tuple(round(av + (bv - av) * t) for av, bv in zip(a, b))
                px[x + i, yy] = fill
            elif k == 'scene':
                px[x + i, yy] = c


def clean_slot(im: Image.Image, box, s: int) -> None:
    """Quita el icono y la palabra viejos del botón (filas 9 a alto − 4 y x 5 a ancho − 5, en px CSS; s = DPR): cada fila se
    rellena con la mediana de su margen derecho de 2 px, que siempre es fondo (el izquierdo toca la «P» en las primeras
    filas). Lejos del borde redondeado y de la tecla «P», que la nueva repinta igual. Una mediana de la fila entera fallaba en las filas de «Puerto»."""
    x, y, w, h = box
    px = im.load()
    x0, x1 = x + 5 * s, x + w - 5 * s
    for yy in range(y + 9 * s, y + h - 4 * s):
        edge = [px[xx, yy] for xx in range(x1 - 2 * s, x1)]
        med = sorted(edge, key=sum)[len(edge) // 2]
        for xx in range(x0, x1):
            px[xx, yy] = med


def backgrounds():
    d = Image.open(BG_DESK).convert('RGB')
    clean(d, (540, 96, 360, 36), 1)  # «Zona segura» viejo
    clean_slot(d, (821, 818, 56, 56), 1)  # Puerto viejo (activo)
    m = Image.open(BG_MOB).convert('RGB')
    clean(m, (32, 312, 716, 72), 2)
    clean_slot(m, (32, 1552, 104, 104), 2)
    pd, pm = TMP / 'bg-desk.png', TMP / 'bg-mob.png'
    d.save(pd)
    m.save(pm)
    return pd, pm


# ---------------------------------------------------------------- medidas (regla de la franja, AC-255)
def lstar(rgb) -> float:
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(float(v)) for v in rgb)
    yy = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return 116 * yy ** (1 / 3) - 16 if yy > (6 / 29) ** 3 else yy * (29 / 3) ** 3


def band_profile(im: Image.Image, box, dpr: int):
    """L* de la columna x = izquierda + 2 px CSS, de arriba + 2 a abajo − 3 (px CSS), en píxeles del dispositivo."""
    x, y, w, h = box
    col = int((x + 2) * dpr)
    return [round(lstar(im.getpixel((col, yy))), 1) for yy in range(int((y + 2) * dpr), int((y + h - 3) * dpr) + 1)]


def band_rule(profile):
    lo, hi = min(profile), max(profile)
    mid = (lo + hi) / 2
    crossings = sum(1 for a, b in zip(profile, profile[1:]) if (a - mid) * (b - mid) < 0)
    state = 'under-fire' if crossings >= 4 and hi - lo >= 40 else ('protected' if hi - lo <= 8 else 'indeterminado')
    return {'rango_L': round(hi - lo, 1), 'cruces': crossings, 'estado_por_la_regla': state}


def gray(im: Image.Image) -> Image.Image:
    return im.convert('L').convert('RGB')


# ---------------------------------------------------------------- láminas a pantalla completa
def full_screens(pd: Path, pm: Path):
    desk = (f'<img class="abs" src="{pd.as_uri()}" style="left:0;top:0;width:1440px;height:900px">'
            f'<div class="hud-toasts" style="left:540px;top:96px;transform:none;width:360px">{notice_under_fire(7)}{toast_port_fire(7)}</div>'
            + slot_port('fire', 7, 'reuse-bg', 'position:absolute;left:821px;top:818px'))
    d = render(desk, 1440, 900, 1, 'full-desk')
    mob = (f'<img class="abs" src="{pm.as_uri()}" style="left:0;top:0;width:390px;height:844px"><div class="m">'
           f'<div class="hud-toasts" style="left:16px;top:156px;transform:none;width:358px">{notice_under_fire(7)}{toast_port_fire(7)}</div>'
           + mbtn_port('fire', 7, 'reuse-bg', 'left:16px;top:776px;bottom:auto') + '</div>')
    m = render(mob, 390, 844, 2, 'full-mob')
    return d, m


# ---------------------------------------------------------------- hoja de estados
def strip_measures():
    """Los 2 estados del aviso sobre 3 fondos (océano, arena y espuma; §4.1) a DPR 1 y 2: la regla de la franja no depende
    del fondo porque la franja y el borde son opacos."""
    res = {}
    for dpr in (1, 2):
        body = ''
        for i, bg in enumerate(('#1A5F86', '#E6CF9A', '#EAF6FA')):
            body += (f'<div class="abs" style="left:0;top:{i * 100}px;width:400px;height:100px;background:{bg}"></div>'
                     f'<div class="hud-toasts" style="left:20px;top:{i * 100 + 8}px;transform:none;width:360px">{notice_protected()}{notice_under_fire(7)}</div>')
        im = render(body, 400, 300, dpr, f'strip{dpr}')
        for i, bg in enumerate(('océano #1A5F86', 'arena #E6CF9A', 'espuma #EAF6FA')):
            for j, st in enumerate(('protected', 'under-fire')):
                box = (20, i * 100 + 8 + j * 44, 360, 36)
                prof = band_profile(im, box, dpr)
                g = band_profile(gray(im), box, dpr)
                res[f'DPR {dpr} · {bg} · {st}'] = {**band_rule(prof), 'en_grises': band_rule(g)['estado_por_la_regla']}
    return res


def sheet(full_d: Image.Image, full_m: Image.Image, measures: dict):
    prof_p = band_profile(full_d, (540, 96, 360, 36), 1)  # el aviso de la lámina de escritorio (bajo fuego)
    W = 975

    def h2(t, y):
        return f'<div class="abs" style="left:24px;top:{y}px;font-size:18px;font-weight:700;color:#FFD166">{t}</div>'

    def note(t, x, y, w=420, size=12, color='#A9B8C2'):
        return f'<div class="abs" style="left:{x}px;top:{y}px;width:{w}px;font-size:{size}px;line-height:1.4;color:{color}">{t}</div>'

    def col(inner, x, y, w=360, extra=''):
        return f'<div class="hud-toasts" style="left:{x}px;top:{y}px;transform:none;width:{w}px;{extra}">{inner}</div>'

    b = ''
    b += ('<div class="abs" style="left:0;top:0;width:975px;height:64px;background:#0B1A24"></div>'
          '<div class="abs" style="left:24px;top:12px;font-size:22px;font-weight:700;color:#F5F1E6">Zona segura bajo fuego (1.3) · estados del HUD</div>'
          '<div class="abs" style="left:24px;top:40px;font-size:12px;color:#A9B8C2">ART-DIRECTION «Zona segura bajo fuego (1.3)», D120–D128 · BACKLOG E20, AC-253 a AC-256 · px CSS a 1440×900 · lámina a DPR 2 · fuente: scripts/ux/zona-bajo-fuego/lamina.py</div>')

    # 1. El hueco de aviso: 4 casos, color y grises
    y = 84
    b += h2('1 · El hueco de aviso (columna de avisos, 1.º tras «Progreso sin guardar»): una sola fila a la vez', y)
    rows = [
        ('Fuera · sin marca', '', 'Nada (como hoy)'),
        ('Fuera · bajo fuego', pill(7), 'Píldora 156 × 36, centrada. data-testid="under-fire", data-under-fire-seconds="7"'),
        ('Dentro · sin marca', notice_protected(), 'Igual que hoy. data-testid="safe-zone", data-zone-state="protected"'),
        ('Dentro · bajo fuego', notice_under_fire(7), 'Ancho completo. data-testid="safe-zone", data-zone-state="under-fire", data-under-fire-seconds="7"'),
    ]
    y += 34
    b += note('Color sobre océano #1A5F86', 150, y - 4, 200) + note('Escala de grises (sin leer el texto)', 528, y - 4, 260)
    y += 18
    for label, html, desc in rows:
        b += note(label, 24, y + 9, 120, 13, '#F5F1E6')
        b += f'<div class="abs" style="left:146px;top:{y - 6}px;width:372px;height:48px;background:#1A5F86"></div>'
        b += f'<div class="abs" style="left:524px;top:{y - 6}px;width:372px;height:48px;background:#1A5F86;filter:grayscale(1)">' + \
            col(html, 6, 6) + '</div>'
        b += col(html, 152, y)
        b += note(desc, 146, y + 44, 760, 11)
        y += 74
    b += note('Las 3 claves de «bajo fuego», que no dependen del color: <b style="color:#F5F1E6">franja rayada de 8 px</b> (coral #FF7A7A y tinta #07121B, 4 + 4 px a 45°) en lugar del borde liso de 4 px; '
              '<b style="color:#F5F1E6">icono</b> llama (en el mar) o escudo tachado (en la zona) en lugar del escudo; y la <b style="color:#F5F1E6">cuenta «N s»</b> a la derecha. '
              'El estado «Zona segura» no cambia: borde liso azul, escudo y texto azul.', 24, y, 900, 12, '#A9B8C2')
    y += 56

    # 2. Regla medible
    b += h2('2 · Regla medible de los 2 estados (AC-255): la franja izquierda', y)
    y += 32
    b += note('Columna de muestreo: x = izquierda del aviso + 2 px, de arriba + 2 a abajo − 3 (px CSS; × DPR en la captura). Se pasa a L* (CIELAB). '
              '<b style="color:#F5F1E6">«Zona segura»</b>: rango de L* ≤ 8 (un solo tono). <b style="color:#F5F1E6">«No te protege»</b>: rango ≥ 40 y ≥ 4 cruces de la media. '
              'Vale en color y en grises, a DPR 1 y 2 y sobre océano, arena o espuma, porque la franja y el borde son opacos. '
              'Para el e2e: data-zone-state="protected" | "under-fire" en [data-testid="safe-zone"].', 24, y, 430, 12)
    # la franja ampliada ×4 (los 2 estados, en color y en grises): zoom CSS de los primeros 22 px del aviso
    for k, (lab, html) in enumerate((('Zona segura', notice_protected()), ('No te protege', notice_under_fire(7)))):
        for g in (0, 1):
            x = 476 + k * 124 + g * 58
            b += (f'<div class="abs" style="left:{x}px;top:{y}px;width:52px;height:152px;overflow:hidden;background:#1A5F86;{"filter:grayscale(1);" if g else ""}">'
                  f'<div class="hud-toasts" style="left:2px;top:4px;transform:none;width:360px;zoom:4">{html}</div></div>')
        b += note(lab + '<br><span style="font-size:10px">color · grises (×4)</span>', 476 + k * 124, y + 156, 120, 11, '#F5F1E6')
    # perfil (SVG) del aviso bajo fuego de la lámina 1440
    pts = ' '.join(f'{i * 6},{100 - v}' for i, v in enumerate(prof_p))
    b += (f'<svg class="abs" style="left:736px;top:{y}px" width="215" height="110" viewBox="-4 -4 210 110">'
          f'<rect x="-4" y="-4" width="210" height="110" fill="#0B1A24"/><polyline points="{pts}" fill="none" stroke="#FF7A7A" stroke-width="2"/>'
          f'<polyline points="0,{100 - 75} {len(prof_p) * 6 - 6},{100 - 75}" fill="none" stroke="#6CC3F5" stroke-width="2" stroke-dasharray="4 3"/></svg>')
    b += note(f'L* de la columna (eje 0–100) en la lámina 1440×900: coral = «No te protege» (rango {band_rule(prof_p)["rango_L"]}, {band_rule(prof_p)["cruces"]} cruces); '
              'azul discontinuo = el borde liso de «Zona segura» (L* 75, rango 0)', 736, y + 114, 215, 11)
    # tabla de medidas, agrupada por caso
    groups = {}
    for k, v in measures.items():
        case, _, st = k.rpartition(' · ')
        if k.startswith('lamina'):
            case, st = k.replace(' · aviso', '').replace('lamina', 'Lámina'), 'under-fire'
        groups.setdefault(case, {})[st] = v
    cell = lambda v: f'{v["rango_L"]:g} / {v["cruces"]} → {"sí" if v["estado_por_la_regla"] == v["en_grises"] else "no"}' if v else '—'
    rows_m = ''.join(f'<tr><td>{c}</td><td>{cell(g.get("protected"))}</td><td>{cell(g.get("under-fire"))}</td></tr>' for c, g in groups.items())
    b += (f'<table class="abs" style="left:24px;top:{y + 112}px;width:430px;font-size:11px;line-height:1.45;color:#A9B8C2;border-collapse:collapse">'
          f'<tr style="color:#F5F1E6"><td>Caso medido (medidas.json)</td><td>«Zona segura»</td><td>«No te protege»</td></tr>{rows_m}</table>')
    b += note('Cada celda: rango de L* / cruces → el estado que da la regla coincide en grises. La regla acierta los 2 estados en los 8 casos.', 24, y + 270, 430, 11)
    y += 310

    # 3. Botón Puerto
    b += h2('3 · Botón Puerto: activo, fuera de la zona (hoy) y bajo fuego (nuevo)', y)
    y += 34
    states = [('open', 'Dentro, sin marca', 'Activo'), ('zone', 'Fuera de la zona', 'Desactivado, como hoy'), ('fire', 'Dentro, bajo fuego', 'Desactivado + cuenta + llama')]
    for i, (st, l1, l2) in enumerate(states):
        x = 24 + i * 150
        b += f'<div class="abs" style="left:{x}px;top:{y}px;width:140px;height:132px;background:#1A5F86;border-radius:6px"></div>'
        b += slot_port(st, 7, '', f'position:absolute;left:{x + 10}px;top:{y + 10}px')
        b += f'<div class="abs" style="left:{x + 74}px;top:{y + 10}px;filter:grayscale(1)">' + slot_port(st, 7) + '</div>'
        b += f'<div class="m">' + mbtn_port(st, 7, '', f'left:{x + 12}px;top:{y + 74}px;bottom:auto') + '</div>'
        b += f'<div class="m abs" style="left:{x + 76}px;top:{y + 74}px;filter:grayscale(1)">' + mbtn_port(st, 7, '', 'left:0;top:0;bottom:auto') + '</div>'
        b += note(f'<b style="color:#F5F1E6">{l1}</b><br>{l2}', x, y + 136, 140, 11)
    b += note('Escritorio 56 × 56 (arriba) y táctil 52 × 52 (abajo); a la derecha de cada uno, en grises. Bajo fuego: icono y palabra al 40 % (táctil 45 %), '
              'como hoy; la cuenta (18/700, entero, sin «s») centrada sobre el icono y la llama coral de 12 px arriba a la derecha, al 100 %. '
              'data-port-block="under-fire" (o "zone", "unsaved"; sin atributo si abre). title (escritorio): «Bajo fuego: el puerto abre tras 10 s sin disparos».',
              486, y, 470, 12)
    b += note('Al pulsarlo (clic, toque o P), el aviso con los segundos que faltan, que sustituye a «El puerto solo abre en la zona segura»:', 486, y + 92, 470, 12, '#F5F1E6')
    b += f'<div class="abs" style="left:486px;top:{y + 128}px;width:372px;height:92px;background:#1A5F86"></div>'
    b += col(toast_port_fire(7) + toast_port_zone(), 492, y + 134)
    b += note('arriba, nuevo (peligro, con la llama); abajo, el de hoy, que sigue saliendo fuera de la zona', 486, y + 224, 470, 11)
    y += 256

    # 4. Panel de objetivo
    b += h2('4 · Panel de objetivo de otro jugador dentro de la zona (AC-256): sin cambio visual', y)
    y += 34
    b += f'<div class="abs" style="left:24px;top:{y}px;width:928px;height:96px;background:#1A5F86"></div>'
    b += target_player(True, False, f'left:{24 + 8}px;top:{y + 12}px;transform:none')
    b += target_player(False, False, f'left:{24 + 340}px;top:{y + 12}px;transform:none')
    b += f'<div class="m">' + target_player(True, True, f'left:{24 + 672}px;top:{y + 4}px;width:250px') + '</div>'
    y += 100
    b += note('<b style="color:#F5F1E6">Bajo fuego</b>: «45 m · ✓ En alcance» (o «✕ Fuera de alcance») y Tab lo incluye. <b style="color:#F5F1E6">Sin marca</b>: «45 m · ✕ No atacable», como hoy. '
              'Solo cambia cuándo sale cada texto (canAttackClient con uf); el panel, las placas y el cursor son los de hoy. A la derecha, 390×844 (262 × 70) bajo fuego.', 24, y, 928, 12)
    y += 44

    # 5. Cronología
    b += h2('5 · Cronología: entrar perseguido (el caso que más sorprende)', y)
    y += 34
    tl = [('t = 0 s', 'Fuera. El pirata dispara: aparece la píldora', pill(10), 'zone', 10),
          ('t = 3 s', 'Cruza los 110 m: en ese snapshot, el aviso «no te protege»', notice_under_fire(7), 'fire', 7),
          ('t = 5 s', 'Otra andanada: la marca vuelve a 10 s', notice_under_fire(10), 'fire', 10),
          ('t = 14 s', 'Último segundo', notice_under_fire(1), 'fire', 1),
          ('t = 15 s', 'Caduca (reloj del cliente): «Zona segura» y Puerto activo', notice_protected(), 'open', 0)]
    for t, desc, html, st, n in tl:
        b += note(t, 24, y + 8, 60, 14, '#FFD166')
        b += f'<div class="abs" style="left:86px;top:{y - 4}px;width:372px;height:66px;background:#1A5F86"></div>'
        b += col(html, 92, y + 10)
        b += f'<div class="abs" style="left:466px;top:{y - 4}px;width:66px;height:66px;background:#1A5F86"></div>'
        b += slot_port(st, n, '', f'position:absolute;left:471px;top:{y + 1}px')
        b += note(desc, 548, y + 12, 400, 13, '#F5F1E6')
        y += 72
    b += note('La cuenta es el entero ceil(uf − ahora), con el reloj del servidor (client.serverTime), y se escribe por ref (0 commits de React por segundo). '
              'Cambia al cambiar el entero y al renovarse la marca. Al caducar no llega ningún snapshot (AC-87): el cambio lo hace el reloj del cliente.', 24, y, 928, 12)
    y += 44
    return render(b, W, y, 2, 'sheet', bg='#07121B')


def main():
    if not (FONTS / 'Barlow-Medium.ttf').exists():
        sys.exit('UX_FONTS debe apuntar a la carpeta con Barlow-Medium.ttf, Barlow-SemiBold.ttf y Barlow-Bold.ttf')
    pd, pm = backgrounds()
    d, m = full_screens(pd, pm)
    measures = strip_measures()
    full = {
        'lamina 1440x900 · aviso': {**band_rule(band_profile(d, (540, 96, 360, 36), 1)), 'en_grises': band_rule(band_profile(gray(d), (540, 96, 360, 36), 1))['estado_por_la_regla']},
        'lamina 390x844 · aviso': {**band_rule(band_profile(m, (16, 156, 358, 36), 2)), 'en_grises': band_rule(band_profile(gray(m), (16, 156, 358, 36), 2))['estado_por_la_regla']},
    }
    s = sheet(d, m, {**measures, **full})
    OUT.mkdir(parents=True, exist_ok=True)
    d.save(OUT / 'zona-bajo-fuego-1440x900.png')
    m.save(OUT / 'zona-bajo-fuego-390x844.png')
    s.save(OUT / 'zona-bajo-fuego-estados.png')
    (Path(__file__).parent / 'medidas.json').write_text(json.dumps({'tira': measures, 'laminas': full}, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps({'tira': measures, 'laminas': full}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    try:
        main()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)  # también si falla: no deja el perfil de Firefox ni los HTML

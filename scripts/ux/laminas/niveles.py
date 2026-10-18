# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/niveles.py  →  $UX_OUT/D78-niveles-{1440x900,390x844,844x390}.png
# Reproduce las 3 maquetas de D78 (sha256 21d9de4d…, 731c9a7f…, c2d20646…). Además de las fuentes, necesita rsvg-convert
# (librsvg) para las insignias y las capturas de fondo desktop-open-sea.png y mobile-open-sea.png de qa:capture en
# UX_CAPTURAS (por defecto, qa-artifacts del árbol de dev-render).
# Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS (.next/static/media de un
# build de Next) y, si se indica abajo, el renderizador por software en UX_RENDERER. Escribe en UX_OUT, nunca en
# docs/game/art/: una lámina aprobada no se pisa; una versión nueva se copia allí a mano y con otro nombre. No corre en la CI.
# Maqueta de la pantalla de niveles e insignias (AC-190, D78) en 1440×900, 390×844 y 844×390, dibujada con las medidas,
# tokens y fuentes del juego. Las insignias son el SVG de D74 (scripts/ux/calibracion/insignias-1-1.json) por librsvg;
# los iconos, el SVG de Lucide. Fondo: capturas de qa:capture de dev-render (2026-10-17) bajo el velo de §14.
import sys, os, io, json, math, subprocess
sys.dont_write_bytecode = True
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import rutas as RT
DEV = RT.CAPTURAS
FONT = RT.FONTS
FF = {500: 'b0bb26939bb40fdb-s.p.woff2', 600: '60c9b95e8d9e49be-s.p.woff2', 'pirata': '5027f589d2b9109f-s.p.woff2'}
BADGES = json.load(open(os.path.join(RT.REPO, 'scripts', 'ux', 'calibracion', 'insignias-1-1.json')))['insignias']
LEVEL_XP = [0, 60, 150, 300, 500, 800, 1200, 1700, 2400, 3300, 4500, 6000, 8000, 10500, 13500, 17000, 21000, 25500, 30500, 36000]
RANKS = [('Grumete', 1), ('Marinero', 5), ('Contramaestre', 9), ('Teniente', 13), ('Almirante', 17)]
UNLOCK = {5: 'Goleta', 9: 'Navío de línea'}
C = {'paper': '#F2E6C8', 'card': '#FBF4E2', 'line': '#D8C59A', 'ink': '#2B1D0E', 'soft': '#5C4A33', 'title': '#6B3A1A', 'wood': '#6B4426',
     'goldlo': '#B8862B', 'tint': '#F3D98C', 'xpink': '#5D49AC', 'dark': '#0B1A24', 'track': '#23394A', 'text': '#F5F1E6', 'dim': '#A9B8C2',
     'xp': '#B79CFF', 'uiline': (242, 193, 78, 89), 'filete': '#C9A24B'}
def rgb(c): return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) if isinstance(c, str) else c
def es(n): return f'{n:,}'.replace(',', '.') if n >= 10000 else str(n)
def level_of(xp): return max(i + 1 for i, v in enumerate(LEVEL_XP) if xp >= v)
def rank_of(lv): return max(i for i, (_, f) in enumerate(RANKS) if f <= lv)
def faltan(n): return f'Te falta {es(n)} XP' if n == 1 else f'Te faltan {es(n)} XP'
def own_lines(xp):
    lv = level_of(xp); r = rank_of(lv); name = f'{RANKS[r][0]} · Nivel {lv}'
    if lv == 20: return name, 1.0, 'Nivel máximo', 'Nivel máximo', 'Rango máximo'
    lo, hi = LEVEL_XP[lv - 1], LEVEL_XP[lv]
    l1 = f'{faltan(hi - xp)} para el nivel {lv + 1}'
    l2 = 'Rango máximo' if r == 4 else f'{faltan(LEVEL_XP[RANKS[r + 1][1] - 1] - xp)} para {RANKS[r + 1][0]} (nivel {RANKS[r + 1][1]})'
    return name, (xp - lo) / (hi - lo), f'{es(xp - lo)} / {es(hi - lo)} XP', l1, l2
_cache = {}
def svg_png(svg, px):
    k = (svg, px)
    if k not in _cache:
        out = subprocess.run(['rsvg-convert', '-w', str(px), '-h', str(px)], input=svg.encode(), capture_output=True, check=True).stdout
        _cache[k] = Image.open(io.BytesIO(out)).convert('RGBA')
    return _cache[k]
def lucide(paths, px, color, sw=2):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">' + ''.join(f'<path d="{p}"/>' for p in paths) + '</svg>'
    return svg_png(svg, px)
X_ICON = ['M18 6 6 18', 'm6 6 12 12']; CHECK = ['M20 6 9 17l-5-5']
SAIL = ['M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z', 'M21 14 10 2 3 14h18Z', 'M10 2v16']
class Canvas:
    def __init__(self, img, s):
        self.img = img.convert('RGBA'); self.s = s; self.d = ImageDraw.Draw(self.img)
    def f(self, px, wt): return ImageFont.truetype(FONT + FF[wt], round(px * self.s), layout_engine=ImageFont.Layout.RAQM)
    def rect(self, x, y, w, h, fill=None, r=0, outline=None, width=1):
        s = self.s; box = (round(x * s), round(y * s), round((x + w) * s) - 1, round((y + h) * s) - 1)
        if fill is not None and len(rgb(fill)) == 4:
            ov = Image.new('RGBA', self.img.size, (0, 0, 0, 0)); ImageDraw.Draw(ov).rounded_rectangle(box, round(r * s), fill=rgb(fill))
            self.img.alpha_composite(ov); self.d = ImageDraw.Draw(self.img); fill = None
        if outline is not None and len(rgb(outline)) == 4:
            ov = Image.new('RGBA', self.img.size, (0, 0, 0, 0)); ImageDraw.Draw(ov).rounded_rectangle(box, round(r * s), outline=rgb(outline), width=round(width * s))
            if fill is not None: self.d.rounded_rectangle(box, round(r * s), fill=rgb(fill))
            self.img.alpha_composite(ov); self.d = ImageDraw.Draw(self.img); return
        self.d.rounded_rectangle(box, round(r * s), fill=rgb(fill) if fill is not None else None, outline=rgb(outline) if outline is not None else None, width=round(width * s))
    def text(self, x, y, t, px, wt=500, color='ink', anchor='la', tnum=True):
        self.d.text((x * self.s, y * self.s), t, font=self.f(px, wt), fill=rgb(C.get(color, color)), anchor=anchor, features=['tnum'] if tnum else None)
    def width(self, t, px, wt=500): return self.f(px, wt).getlength(t, features=['tnum']) / self.s
    def paste(self, im, x, y): self.img.alpha_composite(im, (round(x * self.s), round(y * self.s)))
def backdrop(path, size, s, crop=None):
    im = Image.open(path).convert('RGB')
    if crop: im = im.crop(crop)
    im = im.resize((size[0] * s, size[1] * s), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3 * s))
    return Image.alpha_composite(im.convert('RGBA'), Image.new('RGBA', im.size, (6, 17, 26, 140)))  # --ui-scrim 55 %
def badge(cv, rank, px, x, y): cv.paste(svg_png(BADGES[str(rank + 1)]['svg'] if str(rank + 1) in BADGES else list(BADGES.values())[rank]['svg'], round(px * cv.s)), x, y)
def own_card(cv, x, y, w, h, xp, layout):
    """Lo propio (AC-190 c) en una tarjeta oscura como el HUD: la insignia grande, rango y nivel, XP total, la barra y lo que falta."""
    name, frac, bar_label, l1, l2 = own_lines(xp); r = rank_of(level_of(xp))
    cv.rect(x, y, w, h, fill=C['dark'], r=8); cv.rect(x, y, w, h, outline=C['uiline'], r=8)
    if layout == 'strip':  # escritorio: una fila de 88
        badge(cv, r, 64, x + 12, y + 12)
        cv.text(x + 92, y + 12, name, 18, 600, 'text'); cv.text(x + 92, y + 37, f'{es(xp)} XP', 14, 600, 'xp')
        bx, by, bw = x + 92, y + 66, 280
        cv.rect(bx, by, bw, 8, fill=C['track'], r=4); frac and cv.rect(bx, by, max(8, bw * frac), 8, fill=C['xp'], r=4)
        cv.text(bx + bw + 10, by + 4, bar_label, 13, 500, 'dim', 'lm')
        cv.text(x + 484, y + 24, l1, 14, 500, 'text'); cv.text(x + 484, y + 48, l2, 14, 500, 'text')
    else:  # móvil: en columna
        bs = 48 if layout == 'mobile' else 56
        badge(cv, r, bs, x + 12, y + 12)
        cv.text(x + 12 + bs + 12, y + 14, name, 16, 600, 'text'); cv.text(x + 12 + bs + 12, y + 38, f'{es(xp)} XP', 13, 600, 'xp')
        by = y + 12 + bs + 14; lw = cv.width(bar_label, 12); bw = w - 24 - lw - 10
        cv.rect(x + 12, by, bw, 8, fill=C['track'], r=4); frac and cv.rect(x + 12, by, max(8, bw * frac), 8, fill=C['xp'], r=4)
        cv.text(x + w - 12, by + 4, bar_label, 12, 500, 'dim', 'rm')
        cv.text(x + 12, by + 22, l1, 13, 500, 'text'); cv.text(x + 12, by + 42, l2, 13, 500, 'text')
def cell(cv, x, y, w, h, lv, xp, last_right=False):
    cur = level_of(xp)
    if lv == cur:
        cv.rect(x, y, w, h, fill=C['tint']); cv.rect(x, y, 4, h, fill=C['goldlo'])
    cv.text(x + 12, y + 8, f'Nivel {lv}', 15, 600, 'ink')
    if lv < cur: cv.paste(lucide(CHECK, round(16 * cv.s), C['soft']), x + w - 12 - 16, y + 9)
    cv.text(x + 12, y + 28, f'{es(LEVEL_XP[lv - 1])} XP', 13, 500, 'soft')
    ly = y + 44
    if lv == cur: cv.text(x + 12, ly + 1, 'Estás aquí', 12, 600, 'ink'); ly += 16
    elif lv == cur + 1: cv.text(x + 12, ly + 1, faltan(LEVEL_XP[lv - 1] - xp), 12, 600, 'xpink'); ly += 16
    if lv in UNLOCK:
        cv.paste(lucide(SAIL, round(14 * cv.s), C['title']), x + 12, ly + 1); cv.text(x + 30, ly + 1, UNLOCK[lv], 12, 600, 'title')
def cell_h(lv, xp):
    cur = level_of(xp); n = (lv in (cur, cur + 1)) + (lv in UNLOCK)
    return max(56, 44 + 16 * n + 8)
def group(cv, x, y, w, rank, xp, layout):
    """Un grupo por insignia (AC-190 d). Escritorio: cabecera a la izquierda (160) y los 4 niveles en fila; móvil: cabecera
    arriba (44) y los niveles en 2 × 2."""
    name, f0 = RANKS[rank]; CH = 84
    if layout == 'row':
        h = CH; cv.rect(x, y, w, h, fill=C['card'], r=8)
        cv.rect(x + 12, y + 22, 40, 40, fill=C['dark'], r=8); badge(cv, rank, 32, x + 16, y + 26)
        cv.text(x + 62, y + 24, name, 15, 600, 'ink'); cv.text(x + 62, y + 45, f'Niveles {f0}–{f0 + 3}', 12, 500, 'soft')
        cw = (w - 176) / 4
        for i in range(4):
            cx = x + 176 + i * cw
            cv.rect(cx, y + 1, 1, h - 2, fill=C['line']); cell(cv, cx + 1, y + 1, cw - 1 - (1 if i == 3 else 0), h - 2, f0 + i, xp)
    else:
        r1 = max(cell_h(f0, xp), cell_h(f0 + 1, xp)); r2 = max(cell_h(f0 + 2, xp), cell_h(f0 + 3, xp))
        h = 44 + 1 + r1 + 1 + r2; cv.rect(x, y, w, h, fill=C['card'], r=8)
        cv.rect(x + 10, y + 6, 32, 32, fill=C['dark'], r=6); badge(cv, rank, 24, x + 14, y + 10)
        cv.text(x + 52, y + 22, name, 15, 600, 'ink', 'lm'); cv.text(x + 52 + cv.width(name, 15, 600) + 8, y + 23, f'Niveles {f0}–{f0 + 3}', 12, 500, 'soft', 'lm')
        cv.rect(x + 1, y + 44, w - 2, 1, fill=C['line']); cw = (w - 1) / 2
        for i in range(4):
            cx = x + (i % 2) * (cw + 1); cy = y + 45 + (i // 2) * (r1 + 1); ch = r1 if i < 2 else r2
            if i % 2: cv.rect(cx - 1, cy, 1, ch, fill=C['line'])
            if i == 2: cv.rect(x + 1, cy - 1, w - 2, 1, fill=C['line'])
            cell(cv, cx + (1 if i % 2 == 0 else 0), cy, cw - 1, ch, f0 + i, xp)
    # esquinas redondeadas también para el fondo de la celda actual (overflow: hidden en el grupo)
    sc = cv.s; box = (round(x * sc), round(y * sc), round((x + w) * sc), round((y + h) * sc))
    reg = cv.img.crop(box); m = Image.new('L', reg.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, reg.size[0] - 1, reg.size[1] - 1), round(8 * sc), fill=255)
    cv.img.paste(Image.composite(reg, Image.new('RGBA', reg.size, rgb(C['paper']) + (255,)), m), box[:2]); cv.d = ImageDraw.Draw(cv.img)
    cv.rect(x, y, w, h, outline=C['line'], r=8)
    return h
def ghm(rank, xp):
    f0 = RANKS[rank][1]; return 44 + 1 + max(cell_h(f0, xp), cell_h(f0 + 1, xp)) + 1 + max(cell_h(f0 + 2, xp), cell_h(f0 + 3, xp))
def frame(cv, x, y, w, h, r, top_only=False):
    if top_only:
        cv.rect(x, y, w, h + 20, fill=C['wood'], r=r); cv.rect(x, y + 4, w, h + 20, fill=C['paper'], r=r)
    else:
        cv.rect(x, y, w, h, fill=C['wood'], r=r); cv.rect(x + 6, y + 6, w - 12, h - 12, fill=C['paper'], r=r - 6 if r > 6 else 2)
        cv.rect(x + 6, y + 6, w - 12, h - 12, outline=C['filete'], r=r - 6 if r > 6 else 2)
def head(cv, x, y, w, h, title_px, close_px):
    cv.text(x + 20, y + h / 2, 'Niveles e insignias', title_px, 'pirata', 'title', 'lm', tnum=False)
    cx = x + w - 12 - close_px
    cv.paste(lucide(X_ICON, round(22 * cv.s), C['soft']), cx + (close_px - 22) / 2, y + (h - 22) / 2)
    cv.rect(x, y + h - 1, w, 1, fill=C['line'])
def list_clip(cv, x, y, w, h, draw, top_more=False, bottom_more=False):
    """Dibuja la lista en una capa aparte y la recorta a su caja visible (el scroll de la lista, AC-190 g)."""
    s = cv.s; sub = Canvas(Image.new('RGBA', (round(w * s), round(h * s) + 4000), rgb(C['paper']) + (255,)), s)
    draw(sub); im = sub.img.crop((0, 0, round(w * s), round(h * s)))
    fade = round(12 * s); bg = Image.new('RGBA', im.size, rgb(C['paper']) + (255,)); m = Image.new('L', im.size, 255); md = ImageDraw.Draw(m)
    for i in range(fade):  # fundido de 12 px arriba (si hay más arriba) y abajo (si hay más abajo)
        a = round(255 * i / fade)
        if top_more: md.line(((0, i), (im.size[0], i)), fill=a)
        if bottom_more: md.line(((0, im.size[1] - 1 - i), (im.size[0], im.size[1] - 1 - i)), fill=a)
    im = Image.composite(im, bg, m)
    cv.img.alpha_composite(im, (round(x * s), round(y * s))); cv.d = ImageDraw.Draw(cv.img)
# --- 1440×900 · 1240 XP (nivel 7, el ejemplo de AC-190 c)
def desktop(xp=1240):
    cv = Canvas(backdrop(DEV + '/desktop-open-sea.png', (1440, 900), 1), 1)
    W, H = 880, 660; X, Y = (1440 - W) / 2, (900 - H) / 2
    frame(cv, X, Y, W, H, 12); head(cv, X + 6, Y + 6, W - 12, 64, 28, 44)
    own_card(cv, X + 26, Y + 86, 828, 88, xp, 'strip')
    gy = Y + 86 + 88 + 12
    for r in range(5): gy += group(cv, X + 26, gy, 828, r, xp, 'row') + 8
    print('escritorio: lista hasta', gy - 8 - Y, 'de', H - 6 - 16)
    return cv.img.convert('RGB')
# --- 390×844 · 2400 XP (nivel 9) a DPR 2, como qa:capture
def mobile(xp=2400):
    s = 2; cv = Canvas(backdrop(DEV + '/mobile-open-sea.png', (390, 844), s), s)
    SH = round(0.82 * 844); Y = 844 - SH
    frame(cv, 0, Y, 390, SH, 16, top_only=True); cv.rect(177, Y + 10, 36, 4, fill=C['line'], r=2)
    head(cv, 0, Y + 12, 390, 52, 24, 48)
    oy = Y + 12 + 52 + 12; own_card(cv, 16, oy, 358, 140, xp, 'mobile')
    ly = oy + 140 + 12; lh = 844 - 12 - ly
    cur_rank = rank_of(level_of(xp)); offs = [0]
    for r in range(5): offs.append(offs[-1] + ghm(r, xp) + 8)
    scroll = min(offs[cur_rank], offs[5] - 8 - lh)
    def draw(sub):
        gy = -scroll
        for r in range(5): gy += group(sub, 16, gy, 358, r, xp, 'grid') + 8
    list_clip(cv, 0, ly, 390, lh, draw, scroll > 0, offs[5] - 8 - scroll > lh)
    print('móvil: lista visible', lh, 'px; desplazada', scroll)
    return cv.img.convert('RGB')
# --- 844×390 · 36 000 XP (nivel 20) a DPR 2
def landscape(xp=36000):
    s = 2; cv = Canvas(backdrop(DEV + '/desktop-open-sea.png', (844, 390), s, crop=(298, 255, 1142, 645)), s)
    W, H = 812, 358; X, Y = 16, 16
    frame(cv, X, Y, W, H, 12); head(cv, X + 6, Y + 6, W - 12, 52, 22, 48)
    by = Y + 6 + 52 + 12; bh = H - 12 - 52 - 24
    own_card(cv, X + 18, by, 296, bh, xp, 'landscape')
    lx = X + 18 + 296 + 12; lw = W - 12 - 12 - 296 - 12 - 12
    cur_rank = rank_of(level_of(xp)); offs = [0]
    for r in range(5): offs.append(offs[-1] + ghm(r, xp) + 8)
    scroll = min(offs[cur_rank], offs[5] - 8 - bh)
    def draw(sub):
        gy = -scroll
        for r in range(5): gy += group(sub, 0, gy, lw, r, xp, 'grid') + 8
    list_clip(cv, lx, by, lw, bh, draw, scroll > 0, offs[5] - 8 - scroll > bh)
    print('horizontal: lista', lw, '×', bh, 'desplazada', scroll)
    return cv.img.convert('RGB')
if __name__ == '__main__':
    out = RT.OUT
    desktop().save(os.path.join(out, 'D78-niveles-1440x900.png')); mobile().save(os.path.join(out, 'D78-niveles-390x844.png')); landscape().save(os.path.join(out, 'D78-niveles-844x390.png'))
    print('ok')

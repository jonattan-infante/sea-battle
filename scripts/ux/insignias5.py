# Fase 2 (1.1): 5 insignias, una por rango (GDD §10b: Grumete, Marinero, Contramaestre, Teniente, Almirante), sin
# marcas de grado. Mismo raster que badges4.py de la fase 1 (no versionado) (12 px CSS, supermuestreo 16x en luz lineal, DPR 1/1,5/2,
# sobre --ui-plate compuesta en océano y en arena) y la métrica de AD-40 (px CSS con |dL*| >= 20, dL* medio).
# Busca la combinación con el peor par más separado, cuenta las marcas (b2) y compara con los iconos de relación
# y de estado (NCC en grises, +-1 px, y px con |dL*| >= 20).
# Fase 3 (D74): cada insignia es un SVG (viewBox 0 0 12 12) con <rect>, <circle> y <polygon>, y se rasteriza con la
# semántica de SVG: el trazo va centrado en el borde. El marcado de las 5 elegidas está en
# calibracion/insignias-1-1.json, que es el que copia el código y el que compara su unitario (AD-40 c).
# Uso: python3 -I scripts/ux/insignias5.py <hoja.png> [--escribir-json]   (pal.py va en la misma carpeta)
import sys, os, itertools, math, json
sys.dont_write_bytecode = True  # sin __pycache__ en el repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw
from pal import hx, lin, enc, over, M
METAL = {'B': '#B4703A', 'P': '#DCE2E8', 'O': '#E3A82B'}
DARK = '#07121B'
BARS = {1: [5], 2: [3, 7], 3: [2, 5, 8]}
DOTS = {1: [(4.6, 4.6)], 2: [(2.6, 2.6), (6.6, 6.6)], 3: [(4.6, 2.0), (2.2, 6.8), (7.0, 6.8)]}
SS = 16
def rgb(h): return tuple(int(h.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
def parse(code):  # 'Bh-h1' = bronce, hueca, galones horizontales, 1 · 'Ol-rosa' = oro, llena, rosa de 4 puntas
    mp, mk = code.split('-'); return mp[0], mp[1], mk[0] if mk != 'rosa' else 'rosa', (int(mk[1]) if mk != 'rosa' else 0)
def r3(v): return round(v + 0.0, 3)
def elements(code):  # el SVG de la insignia: lista de (etiqueta, atributos) en el orden en que se pintan
    m, p, kind, n = parse(code); met = METAL[m]
    fg = met if p == 'h' else DARK
    if p == 'h': els = [('rect', dict(x=0.5, y=0.5, width=11, height=11, rx=2.5, fill=DARK, stroke=met, **{'stroke-width': 1}))]
    else: els = [('rect', dict(x=0.5, y=0.5, width=11, height=11, rx=2.5, fill=met, stroke=DARK, **{'stroke-width': 0.5}))]
    if kind == 'rosa':
        pts = [(6 + (4.6 if i % 2 == 0 else 1.3) * math.cos(math.pi / 4 * i - math.pi / 2), 6 + (4.6 if i % 2 == 0 else 1.3) * math.sin(math.pi / 4 * i - math.pi / 2)) for i in range(8)]
        els.append(('polygon', dict(points=' '.join(f'{r3(x):g},{r3(y):g}' for x, y in pts), fill=fg)))
    elif kind == 'h':
        els += [('rect', dict(x=3, y=y, width=6, height=2, fill=fg)) for y in BARS[n]]
    elif kind == 'v':
        els += [('rect', dict(x=x, y=3, width=2, height=6, fill=fg)) for x in BARS[n]]
    else:
        els += [('circle', dict(cx=r3(x + 1.4), cy=r3(y + 1.4), r=1.4, fill=fg)) for x, y in DOTS[n]]
    return els
def svg(code):
    def a(d): return ' '.join(f'{k}="{v:g}"' if isinstance(v, (int, float)) else f'{k}="{v}"' for k, v in d.items())
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12">' + ''.join(f'<{t} {a(d)}/>' for t, d in elements(code)) + '</svg>'
def raster(els, dpr, bg):  # semántica de SVG 1.1 para estos 3 elementos, colores opacos, supermuestreo SS
    k = dpr * SS; W = int(round(12 * k))
    im = Image.new('RGB', (W, W), tuple(int(round(c * 255)) for c in bg)); d = ImageDraw.Draw(im)
    def rr(x0, y0, x1, y1, r, col):  # caja semiabierta [x0, x1) en px CSS
        box = [x0 * k, y0 * k, x1 * k - 1, y1 * k - 1]
        d.rounded_rectangle(box, radius=r * k, fill=rgb(col)) if r > 0 else d.rectangle(box, fill=rgb(col))
    for t, a in els:
        if t == 'rect':
            x, y, w, h, r = a['x'], a['y'], a['width'], a['height'], a.get('rx', 0); sw = a.get('stroke-width', 0)
            if sw:  # trazo centrado: anillo entre el borde desplazado ±sw/2 (en un arco, radio r ± sw/2)
                rr(x - sw / 2, y - sw / 2, x + w + sw / 2, y + h + sw / 2, r + sw / 2, a['stroke'])
                rr(x + sw / 2, y + sw / 2, x + w - sw / 2, y + h - sw / 2, max(r - sw / 2, 0), a['fill'])
            else: rr(x, y, x + w, y + h, r, a['fill'])
        elif t == 'circle':
            cx, cy, r = a['cx'], a['cy'], a['r']; d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k - 1, (cy + r) * k - 1], fill=rgb(a['fill']))
        elif t == 'polygon':
            d.polygon([(float(x) * k, float(y) * k) for x, y in (q.split(',') for q in a['points'].split())], fill=rgb(a['fill']))
    a = lin(np.asarray(im, dtype=np.float64) / 255.0); h = W // SS
    return enc(a[:h * SS, :h * SS].reshape(h, SS, h, SS, 3).mean(axis=(1, 3)))
def badge(code, dpr, bg): return raster(elements(code), dpr, bg)
def Lstar(img):
    Y = lin(img) @ np.array([0.2126, 0.7152, 0.0722])
    f = np.where(Y > (6 / 29) ** 3, np.cbrt(Y), Y / (3 * (6 / 29) ** 2) + 4 / 29); return 116 * f - 16
def cvd(img, k): return enc(lin(img) @ M[k].T)
BGS = {'oceano': over((6, 17, 26), 0.85, '#1A5F86'), 'arena': over((6, 17, 26), 0.85, '#E6CF9A')}
MODES = ('gris', 'protan', 'deutan', 'tritan')
CACHE = {}
def Lmap(code, dpr, bgn, mode):
    key = (code, dpr, bgn, mode)
    if key not in CACHE:
        b = badge(code, dpr, BGS[bgn]); CACHE[key] = Lstar(b if mode == 'gris' else cvd(b, mode))
    return CACHE[key]
def worst(codes):
    w = (1e9, 0, None)
    for dpr in (1, 1.5, 2):
        for bgn in BGS:
            for mode in MODES:
                Ls = [Lmap(c, dpr, bgn, mode) for c in codes]
                for i, j in itertools.combinations(range(len(codes)), 2):
                    px = (np.abs(Ls[i] - Ls[j]) >= 20).sum() / dpr ** 2; dm = abs(Ls[i].mean() - Ls[j].mean())
                    if px < w[0]: w = (px, dm, f'{codes[i]}~{codes[j]} DPR {dpr} {bgn} {mode}')
    return w
# --- búsqueda: G y A fijos (la más sencilla y la más vistosa), M, C y T libres dentro del orden de metales
G, A = 'Bh-h1', 'Ol-rosa'
Ms = ['Bl-h1', 'Bl-h2', 'Bl-h3', 'Bh-h2', 'Bh-h3']
Cs = [f'P{p}-{k}{n}' for p in 'hl' for k in 'hv' for n in (1, 2, 3)]
Ts = [f'O{p}-d{n}' for p in 'hl' for n in (1, 2, 3)]
cands = []
for m_, c_, t_ in itertools.product(Ms, Cs, Ts):
    codes = [G, m_, c_, t_, A]; cands.append((worst(codes), codes))
cands.sort(key=lambda r: -r[0][0])
print('mejores 8 combinaciones (peor par en px CSS con |dL*|>=20, dL* medio, dónde):')
for (px, dm, wh), codes in cands[:8]: print(f'  {" · ".join(codes)}: {px:.1f} px · {dm:.1f} · {wh}')
# monótonas: el número de marcas no baja de G a T y el relleno de M a C no vuelve a hueca... se listan aparte
def monotone(codes):
    n = [parse(c)[3] for c in codes[:4]]; return all(a <= b for a, b in zip(n, n[1:]))
mono = [r for r in cands if monotone(r[1])]
print('mejores 5 con marcas no decrecientes de Grumete a Teniente:')
for (px, dm, wh), codes in mono[:5]: print(f'  {" · ".join(codes)}: {px:.1f} px · {dm:.1f} · {wh}')
CHOSEN = os.environ.get('CHOSEN', ' · '.join(mono[0][1])).split(' · ')
print('elegida:', CHOSEN, '→', worst(CHOSEN))
NAMES = dict(zip(CHOSEN, ['Grumete', 'Marinero', 'Contramaestre', 'Teniente', 'Almirante']))
print('pares de la elegida (peor caso de los 3 DPR, los 2 fondos y las 4 visiones; px CSS con |dL*|>=20):')
print('  ' + ' · '.join(f'{NAMES[x]}–{NAMES[y]} {worst([x, y])[0]:.0f}' for x, y in itertools.combinations(CHOSEN, 2)))
# --- marcado de las 5 elegidas frente a calibracion/insignias-1-1.json (el que copia el código)
RANKS = ['grumete', 'marinero', 'contramaestre', 'teniente', 'almirante']
JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'calibracion', 'insignias-1-1.json')
mk = {'viewBox': '0 0 12 12', 'nota': 'D74 (ART-DIRECTION §11.5): rank 1..5 = GDD §10b; elementos en orden de pintado; semántica de SVG 1.1; lo genera y lo comprueba scripts/ux/insignias5.py',
      'insignias': {r: {'rank': i + 1, 'codigo': c, 'elementos': [dict(etiqueta=t, **a) for t, a in elements(c)], 'svg': svg(c)} for i, (r, c) in enumerate(zip(RANKS, CHOSEN))}}
if '--escribir-json' in sys.argv:
    with open(JS, 'w') as f: json.dump(mk, f, ensure_ascii=False, indent=1); f.write('\n')
with open(JS) as f: same = json.load(f) == json.loads(json.dumps(mk))
print('marcado igual a calibracion/insignias-1-1.json:', 'sí' if same else 'NO')
# --- (b2) cuenta de marcas como componentes separadas (8 vecinos), sin el marco
def components(mask):
    h, w = mask.shape; seen = np.zeros_like(mask, bool); n = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                n += 1; st = [(y, x)]; seen[y, x] = True
                while st:
                    cy, cx = st.pop()
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            yy, xx = cy + dy, cx + dx
                            if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; st.append((yy, xx))
    return n
bad = []
for code in CHOSEN:
    m, p, kind, n = parse(code)
    want = 1 if kind == 'rosa' else n
    for dpr in (1, 1.5, 2):
        L = Lmap(code, dpr, 'oceano', 'gris'); k = int(round(12 * dpr)); inset = int(np.ceil(1.6 * dpr)); inner = L[inset:k - inset, inset:k - inset]
        mark = Lstar(np.array([[hx(METAL[m]) if p == 'h' else hx(DARK)]]))[0, 0]; fond = Lstar(np.array([[hx(DARK) if p == 'h' else hx(METAL[m])]]))[0, 0]
        thr = (mark + fond) / 2; mask = inner > thr if mark > fond else inner < thr
        c = components(mask)
        if c != want: bad.append(f'{code}@{dpr}:{c}')
print('b2 cuenta de marcas: fallos', len(bad), bad)
# --- iconos de relación y de estado (SVG de icons.tsx y Lucide 0.469.0), 12 px CSS, trazo 2/24
def arc_pts(x1, y1, rx, ry, phi, fa, fs, x2, y2, n=16):
    # SVG 1.1, F.6.5: de extremos a centro
    if rx == 0 or ry == 0: return [(x2, y2)]
    cp, sp = math.cos(phi), math.sin(phi); dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = cp * dx + sp * dy, -sp * dx + cp * dy
    lam = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2
    if lam > 1: rx *= math.sqrt(lam); ry *= math.sqrt(lam)
    num = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2; den = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2
    co = math.sqrt(max(0, num / den)) * (-1 if fa == fs else 1)
    cxp, cyp = co * rx * y1p / ry, -co * ry * x1p / rx
    cx, cy = cp * cxp - sp * cyp + (x1 + x2) / 2, sp * cxp + cp * cyp + (y1 + y2) / 2
    ang = lambda ux, uy, vx, vy: math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry); dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not fs and dt > 0: dt -= 2 * math.pi
    if fs and dt < 0: dt += 2 * math.pi
    return [(cx + rx * math.cos(t1 + dt * i / n) * cp - ry * math.sin(t1 + dt * i / n) * sp, cy + rx * math.cos(t1 + dt * i / n) * sp + ry * math.sin(t1 + dt * i / n) * cp) for i in range(1, n + 1)]
def path_polys(d):
    import re
    toks = re.findall(r'[MmLlHhVvCcAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?', d); polys = []; cur = []; x = y = 0; sx = sy = 0; i = 0; cmd = None
    def num():
        nonlocal i; v = float(toks[i]); i += 1; return v
    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]): cmd = toks[i]; i += 1
        rel = cmd.islower(); C_ = cmd.upper()
        if C_ == 'Z':
            cur.append((sx, sy)); polys.append(cur); cur = []; x, y = sx, sy; continue
        if C_ == 'M':
            nx, ny = num(), num(); x, y = (x + nx, y + ny) if rel else (nx, ny)
            if cur: polys.append(cur)
            cur = [(x, y)]; sx, sy = x, y; cmd = 'l' if rel else 'L'; continue
        if C_ == 'L':
            nx, ny = num(), num(); x, y = (x + nx, y + ny) if rel else (nx, ny); cur.append((x, y))
        elif C_ == 'H':
            nx = num(); x = x + nx if rel else nx; cur.append((x, y))
        elif C_ == 'V':
            ny = num(); y = y + ny if rel else ny; cur.append((x, y))
        elif C_ == 'C':
            c = [num() for _ in range(6)]
            if rel: c = [c[0] + x, c[1] + y, c[2] + x, c[3] + y, c[4] + x, c[5] + y]
            for t in np.linspace(0, 1, 13)[1:]:
                cur.append(((1 - t) ** 3 * x + 3 * (1 - t) ** 2 * t * c[0] + 3 * (1 - t) * t ** 2 * c[2] + t ** 3 * c[4], (1 - t) ** 3 * y + 3 * (1 - t) ** 2 * t * c[1] + 3 * (1 - t) * t ** 2 * c[3] + t ** 3 * c[5]))
            x, y = c[4], c[5]
        elif C_ == 'A':
            rx, ry, ph, fa, fs, nx, ny = [num() for _ in range(7)]
            if rel: nx, ny = x + nx, y + ny
            cur += arc_pts(x, y, rx, ry, math.radians(ph), int(fa), int(fs), nx, ny); x, y = nx, ny
    if cur: polys.append(cur)
    return polys
def circ(cx, cy, r): return [[(cx + r * math.cos(a), cy + r * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 33)]]
ICONS = {  # relación (§4.3) y estado (§11.1), con su color en la placa
    'estrella': ('#FFD166', path_polys('m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z')),
    'ancla': ('#F5F1E6', circ(12, 5, 2.5) + path_polys('M12 7.5V21M7 11h10M4 14a8 7 0 0 0 16 0')),
    'calavera': ('#FF7A7A', path_polys('M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.3 3 5.4V20h10v-3.6c1.8-1.1 3-2.8 3-5.4a8 8 0 0 0-8-8Z') + circ(9, 11.5, 1.6) + circ(15, 11.5, 1.6) + path_polys('M10 20v-2.5M14 20v-2.5')),
    'moneda': ('#6CC3F5', circ(9, 9, 6) + path_polys('M17.5 10.2A6 6 0 1 1 10.2 17.5') + path_polys('M9 6.5v5')),
    'corona': ('#FF7A7A', path_polys('M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z') + path_polys('M5 21h14')),
    'bomba': ('#FF7A7A', circ(11, 13, 9) + path_polys('M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95') + path_polys('m22 2-1.5 1.5')),
    'escudo': ('#BDEBFF', path_polys('M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6Z')),
    'espadas': ('#FF7A7A', path_polys('M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2') + path_polys('M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2')),
}
def icon(name, dpr, bg):
    col, polys = ICONS[name]; n = int(round(12 * dpr)); k = SS; S = n * k
    t = (np.arange(S) + 0.5) / (S) * 24; X, Y = np.meshgrid(t, t); best = np.full(X.shape, np.inf)
    for pl in polys:
        for (x1, y1), (x2, y2) in zip(pl[:-1], pl[1:]):
            ux, uy = x2 - x1, y2 - y1; L2 = ux * ux + uy * uy or 1e-12
            tt = np.clip(((X - x1) * ux + (Y - y1) * uy) / L2, 0, 1); best = np.minimum(best, np.hypot(X - x1 - tt * ux, Y - y1 - tt * uy))
    cov = (best <= 1.0).astype(float).reshape(n, k, n, k).mean(axis=(1, 3))[..., None]
    return enc(lin(hx(col)) * cov + lin(bg) * (1 - cov))
def ncc(a, b):
    best = -1
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            bb = np.roll(np.roll(b, dy, 0), dx, 1); x = a - a.mean(); y = bb - bb.mean()
            best = max(best, float((x * y).sum() / (np.linalg.norm(x) * np.linalg.norm(y) + 1e-12)))
    return best
print('insignia frente a iconos (peor caso de DPR 1/1,5/2, océano/arena; NCC en L* con +-1 px · px CSS con |dL*|>=20):')
for code in CHOSEN:
    row = []
    for name in ICONS:
        nc, px = -1, 1e9
        for dpr in (1, 1.5, 2):
            for bgn, bg in BGS.items():
                Lb, Li = Lmap(code, dpr, bgn, 'gris'), Lstar(icon(name, dpr, bg))
                nc = max(nc, ncc(Lb, Li)); px = min(px, (np.abs(Lb - Li) >= 20).sum() / dpr ** 2)
        row.append(f'{name} {nc:.2f}/{px:.0f}')
    print(f'  {code}: ' + ' · '.join(row))
# --- hoja: color y grises, DPR 1, 1,5 y 2, ampliada; y los iconos al lado
Z = 8; rows = []
for dpr in (1, 1.5, 2):
    for gray in (False, True):
        tiles = []
        for item in CHOSEN + ['|'] + list(ICONS):
            if item == '|': tiles.append(None); continue
            b = badge(item, dpr, BGS['oceano']) if item in CHOSEN else icon(item, dpr, BGS['oceano'])
            if gray:
                y = np.clip(Lstar(b), 0, 100); Yl = np.where(y > 8, ((y + 16) / 116) ** 3, y / 903.3); b = np.repeat(enc(Yl)[..., None], 3, axis=2)
            t = Image.fromarray((np.clip(b, 0, 1) * 255).round().astype(np.uint8)); sc = int(round(Z * 2 / dpr)); tiles.append(t.resize((t.width * sc, t.height * sc), Image.NEAREST))
        Wd = sum((t.width if t else 24) + 6 for t in tiles); Hh = max(t.height for t in tiles if t); row = Image.new('RGB', (Wd, Hh + 4), (40, 40, 40)); x = 0
        for t in tiles:
            if t is None: x += 30; continue
            row.paste(t, (x, 2)); x += t.width + 6
        rows.append(row)
sheet = Image.new('RGB', (max(r.width for r in rows), sum(r.height for r in rows)), (40, 40, 40)); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height
sheet.save(sys.argv[1]); print('hoja:', sys.argv[1])
if not same: sys.exit(1)

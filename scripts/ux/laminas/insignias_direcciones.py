# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/insignias_direcciones.py
#   →  $UX_OUT/D69-insignias-direcciones.png y D69-insignias-{a,b,c}.svg
# Reproduce docs/game/art/D69-insignias-direcciones.png (sha256 2423ed72…). Mide con scripts/ux/insignias5.py (AD-40).
# Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS (.next/static/media de un
# build de Next) y, si se indica abajo, el renderizador por software en UX_RENDERER. Escribe en UX_OUT, nunca en
# docs/game/art/: una lámina aprobada no se pisa; una versión nueva se copia allí a mano y con otro nombre. No corre en la CI.
# Rediseño de insignias (petición de Jonattan): 3 direcciones nuevas frente a la de D74, medidas con la métrica de AD-40
# (scripts/ux/insignias5.py de r11: raster con la semántica de SVG, 12 px CSS, DPR 1/1,5/2, placa sobre océano y arena,
# grises y 3 daltonismos). b1: px CSS con |dL*| >= 20 entre cada par (umbral 20). b2: marcas contadas como componentes.
# b3: frente a los 8 iconos, NCC <= 0,80 y >= 20 px. Escribe la lámina PNG y un SVG por dirección.
import sys, os, math, itertools, runpy, tempfile
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import rutas as RT
tmp = tempfile.mkdtemp(); sys.argv = ['insignias5.py', os.path.join(tmp, 'h.png')]
ns = runpy.run_path(os.path.join(RT.REPO, 'scripts', 'ux', 'insignias5.py'), run_name='i5')
raster, Lstar, cvd, BGS, MODES, ICONS, icon, ncc, components = (ns[k] for k in ('raster', 'Lstar', 'cvd', 'BGS', 'MODES', 'ICONS', 'icon', 'ncc', 'components'))
BR, SI, GO, INK = '#B4703A', '#DCE2E8', '#E3A82B', '#07121B'
NAMES = ['Grumete', 'Marinero', 'Contramaestre', 'Teniente', 'Almirante']
def P(pts): return ('polygon', {'points': ' '.join(f'{x:g},{y:g}' for x, y in pts)})
def fill(el, c): t, a = el; return (t, {**a, 'fill': c})
def star(cx, cy, R, r=None, n=5, rot=-90):
    r = r or R * 0.42
    return P([(round(cx + (R if i % 2 == 0 else r) * math.cos(math.radians(rot + 180 / n * i)), 3), round(cy + (R if i % 2 == 0 else r) * math.sin(math.radians(rot + 180 / n * i)), 3)) for i in range(2 * n)])
def chevron(y, x0=2.6, x1=9.4, t=1.4, h=2.2):
    xm = (x0 + x1) / 2
    return P([(x0, y + h), (xm, y), (x1, y + h), (x1, y + h + t), (xm, y + t), (x0, y + h + t)])
# Cada dirección: para cada rango, variantes de figura (fig) y relleno hueco / lleno (como D74); se busca la combinación
# que pasa b2 y b3 en cada insignia y tiene el peor par b1 más alto (como la búsqueda de D74 en insignias5.py)
MET = [BR, BR, SI, GO, GO]
def build(frame_out, frame_in, field_shape):
    def make(k, solid, marks):
        m = MET[k]; fg = INK if solid else m
        return [fill(frame_out, m), fill(frame_in, m if solid else INK)] + [fill(e, fg) for e in marks], field_shape, fg, (m if solid else INK)
    return make
R = lambda x, y, w, h: ('rect', dict(x=x, y=y, width=w, height=h))
C_ = lambda x, y, r: ('circle', dict(cx=x, cy=y, r=r))
ROSE = P([(6, 1.4), (6.919, 5.081), (10.6, 6), (6.919, 6.919), (6, 10.6), (5.081, 6.919), (1.4, 6), (5.081, 5.081)])
# D74 tal cual (solo para comparar; no se busca)
def d74(k):
    m = MET[k]; hollow = k in (0, 2, 3)
    frame = ('rect', dict(x=0.5, y=0.5, width=11, height=11, rx=2.5, fill=INK if hollow else m, stroke=m if hollow else INK, **{'stroke-width': 1 if hollow else 0.5}))
    fg = m if hollow else INK
    marks = [[R(3, 5, 6, 2)], [R(3, 3, 6, 2), R(3, 7, 6, 2)], [R(3, 2, 6, 2), R(3, 5, 6, 2), R(3, 8, 6, 2)],
             [C_(6, 3.4, 1.4), C_(3.6, 8.2, 1.4), C_(8.4, 8.2, 1.4)], [ROSE]][k]
    return [frame] + [fill(e, fg) for e in marks], ('rect', dict(x=1.5, y=1.5, width=9, height=9)), fg, (INK if hollow else m), [1, 2, 3, 3, 1][k]
def shield(x0, y0, x1, y1, ys):
    cx, rx, ry = (x0 + x1) / 2, (x1 - x0) / 2, y1 - ys
    return [(x0, y0), (x1, y0), (x1, ys)] + [(round(cx + rx * math.cos(math.radians(a)), 3), round(ys + ry * math.sin(math.radians(a)), 3)) for a in range(15, 180, 15)] + [(x0, ys)]
A_make = build(P(shield(0.6, 0.6, 11.4, 11.5, 5.0)), P(shield(1.6, 1.6, 10.4, 10.4, 5.0)), P(shield(1.6, 1.6, 10.4, 10.4, 5.0)))
A_FIG = [  # (figura, número de marcas)
    [([R(3, 5, 6, 2)], 1), ([R(5, 3, 2, 6)], 1), ([R(3, 2, 6, 2)], 1)],
    [([R(3, 3, 6, 2), R(3, 6, 6, 2)], 2), ([R(3, 3, 6, 2), R(3, 7, 6, 2)], 2), ([R(3, 3, 2, 5), R(7, 3, 2, 5)], 2)],
    [([R(3, 2, 6, 2), R(3, 5, 6, 2), R(4.5, 8, 3, 2)], 3)],
    [([star(6, 5.6, 3.6)], 1), ([star(6, 5.2, 3.2), R(4, 9, 4, 1)], 2), ([star(4.0, 4.4, 2.1), star(8.0, 4.4, 2.1)], 2)],
    [([star(6, 5.6, 3.8)], 1), ([star(6, 5.0, 3.0), R(3, 8, 6, 1.5)], 2), ([star(6, 4.6, 2.8), R(3, 7.5, 6, 1), R(4.5, 9, 3, 1)], 3)]]
def B_make(k, solid, marks):  # sin aro: disco oscuro con la figura en metal, o disco de metal con la figura oscura
    m = MET[k]; fg = INK if solid else m
    return [fill(('rect', dict(x=0.5, y=0.5, width=11, height=11, rx=5.5)), m if solid else INK)] + [fill(e, fg) for e in marks], C_(6, 6, 5.0), fg, (m if solid else INK)
def chev(y, t=1.2, h=2.0, x0=2.6, x1=9.4): return chevron(y, x0, x1, t, h)
B_FIG = [
    [([chev(4.4)], 1), ([chev(4.0, 1.6, 2.4)], 1)],
    [([chev(2.6), chev(6.0)], 2), ([chev(2.4, 1.0), chev(6.2, 1.0)], 2)],
    [([chev(1.0), chev(4.4), chev(7.8)], 3), ([chev(1.2, 1.0, 1.8), chev(4.6, 1.0, 1.8), chev(8.0, 1.0, 1.8)], 3)],
    [([star(6, 6.3, 4.2)], 1), ([star(6, 6.3, 3.6)], 1)],
    [([star(6, 6.3, 4.2), C_(6, 6.3, 1.1)], 1), ([ROSE], 1)]]
RIBS = [['#1E3A5F', '#2F7FB8', '#9CC9EA'], ['#6E1A14', '#B3261E', '#F0A39A'], ['#1E4D33', '#2E8B57', '#9ED9B5'], ['#5C5446', '#A79F8E', '#F5F1E6'], ['#3E1F55', '#7B3FA0', '#C9A6E4']]
def C_make_rib(ri):
    base = build(C_(6, 7.2, 4.6), C_(6, 7.2, 3.6), C_(6, 7.2, 3.3))
    def make(kk, solid, marks):
        els, field, fg, fc = base(kk, solid, marks)
        return [fill(P([(3.2, 0.4), (8.8, 0.4), (7.6, 4.0), (4.4, 4.0)]), RIBS[kk][ri])] + els, field, fg, fc
    return make
C_FIG = [
    [([C_(6, 7.2, 1.3)], 1), ([C_(6, 7.2, 1.7)], 1)],
    [([C_(6, 5.6, 1.0), C_(6, 8.8, 1.0)], 2), ([C_(6, 5.5, 0.9), C_(6, 8.9, 0.9)], 2)],  # en vertical: en horizontal parecían ojos
    [([C_(6, 5.4, 0.8), C_(4.2, 8.6, 0.8), C_(7.8, 8.6, 0.8)], 3), ([C_(3.6, 7.2, 0.75), C_(6, 7.2, 0.75), C_(8.4, 7.2, 0.75)], 3)],
    [([star(6, 7.4, 2.9)], 1), ([star(6, 7.4, 2.4)], 1)],
    [([star(6, 7.4, 3.2)], 1), ([star(6, 7.4, 3.2), C_(6, 7.4, 0.8)], 1)]]
SPACES = {'A · Escudo heráldico': ([A_make], A_FIG), 'B · Galones de la Armada': ([B_make], B_FIG), 'C · Medallas con cinta': ([C_make_rib(i) for i in range(3)], C_FIG)}
def Lmaps(els):
    out = []
    for dpr in (1, 1.5, 2):
        for bg in BGS:
            b = raster(els, dpr, BGS[bg])
            for mode in MODES: out.append((dpr, Lstar(b if mode == 'gris' else cvd(b, mode))))
    return out
def b2_one(cand):
    els, field, fg, fc, want = cand
    for dpr in (1, 1.5, 2):
        L = Lstar(raster(els, dpr, BGS['oceano']))
        fm = Lstar(raster([fill(field, '#FFFFFF')], dpr, (0, 0, 0))) > 99
        Lmk = Lstar(np.array([[ns['hx'](fg)]]))[0, 0]; Lf = Lstar(np.array([[ns['hx'](fc)]]))[0, 0]
        thr = (Lmk + Lf) / 2; mask = ((L > thr) if Lmk > Lf else (L < thr)) & fm
        if components(mask) != want: return f'@{dpr}:{components(mask)}≠{want}'
    return None
ICON_L = {(nm, dpr, bg): Lstar(icon(nm, dpr, bgc)) for nm in ICONS for dpr in (1, 1.5, 2) for bg, bgc in BGS.items()}
def b3_one(els):
    wn, wp = -1, 1e9
    for dpr in (1, 1.5, 2):
        for bg in BGS:
            Lb = Lstar(raster(els, dpr, BGS[bg]))
            for nm in ICONS:
                Li = ICON_L[(nm, dpr, bg)]; wn = max(wn, ncc(Lb, Li)); wp = min(wp, (np.abs(Lb - Li) >= 20).sum() / dpr ** 2)
    return wn, wp
def pair(La, Lb): return min((np.abs(a[1] - b[1]) >= 20).sum() / a[0] ** 2 for a, b in zip(La, Lb))
CHOICE, RES = {}, {}
for name, (makes, FIG) in SPACES.items():
    cands = []
    for k in range(5):
        ck = []
        for fi, (marks, want) in enumerate(FIG[k]):
          for mi, make in enumerate(makes):
            for solid in ((True,) if k == 4 else (False, True)):  # el Almirante, siempre lleno: «la más vistosa» (GDD §10b)
                els, field, fg, fc = make(k, solid, marks); c = (els, field, fg, fc, want)
                e2 = b2_one(c); n3, p3 = b3_one(els)
                if e2 is None and n3 <= 0.80 and p3 >= 20: ck.append((fi, solid, c, Lmaps(els), (n3, p3), mi))
        cands.append(ck)
        print(f'{name} · {NAMES[k]}: {len(ck)} de {2 * len(FIG[k]) * len(makes)} variantes pasan b2 y b3', flush=True)
    best = None
    if all(cands):
        for combo in itertools.product(*cands):
            w = min(pair(combo[i][3], combo[j][3]) for i, j in itertools.combinations(range(5), 2))
            if best is None or w > best[0]: best = (w, combo)
    CHOICE[name] = best
    if best:
        w, combo = best
        prs = {(i, j): pair(combo[i][3], combo[j][3]) for i, j in itertools.combinations(range(5), 2)}
        n3 = max(c[4][0] for c in combo); p3 = min(c[4][1] for c in combo)
        RES[name] = (min(prs.items(), key=lambda kv: kv[1]), [], (n3, p3), w >= 20)
        print(f'  elegida: ' + ' · '.join(f'{NAMES[k][:4]} fig{c[0]} {"llena" if c[1] else "hueca"} v{c[5]}' for k, c in enumerate(combo)) + f' → peor par {w:.0f} px', flush=True)
        print('   pares:', ' · '.join(f'{NAMES[i][:4]}–{NAMES[j][:4]} {v:.0f}' for (i, j), v in prs.items()), f'· b3 NCC {n3:.2f}, {p3:.0f} px')
    else:
        RES[name] = None; print('  sin combinación que pase b2 y b3 en las 5')
# D74 de referencia
c74 = [d74(k) for k in range(5)]; L74 = [Lmaps(c[0]) for c in c74]
p74 = {(i, j): pair(L74[i], L74[j]) for i, j in itertools.combinations(range(5), 2)}
RES['D74 (la de hoy)'] = (min(p74.items(), key=lambda kv: kv[1]), [x for x in (b2_one(c) for c in c74) if x], (max(b3_one(c[0])[0] for c in c74), min(b3_one(c[0])[1] for c in c74)), True)
def chosen_fn(name):
    if name == 'D74 (la de hoy)': return lambda k: d74(k)
    combo = CHOICE[name][1]; return lambda k: (combo[k][2])
DIRS = [('D74 (la de hoy)', None), ('A · Escudo heráldico', None), ('B · Galones de la Armada', None), ('C · Medallas con cinta', None)]
DIRS = [(n, chosen_fn(n)) for n, _ in DIRS if n == 'D74 (la de hoy)' or CHOICE.get(n)]
# --- lámina
FONT = RT.FONTS
def font(px, w=600): return ImageFont.truetype(FONT + ({500: 'b0bb26939bb40fdb-s.p.woff2', 600: '60c9b95e8d9e49be-s.p.woff2'}[w]), px)
def to_img(rgb): return Image.fromarray((np.clip(rgb, 0, 1) * 255).round().astype(np.uint8))
def gray(rgb):
    y = np.clip(Lstar(rgb), 0, 100); Yl = np.where(y > 8, ((y + 16) / 116) ** 3, y / 903.3); return np.repeat(ns['enc'](Yl)[..., None], 3, axis=2)
PLATE = BGS['oceano']
WHY = {'D74 (la de hoy)': ('Cuadrado con marco: metal (bronce, plata, oro), hueca o llena, y galones, puntos o rosa. Es la que ya está en staging.', ''),
       'A · Escudo heráldico': ('Como en Seafight: el escudo no cambia, y suben el metal del borde, el relleno y la figura (fajas para la marinería, estrella para los oficiales).', 'En contra: la placa ya usa un escudo para «protegido»; aunque la medida los separa, el significado se puede cruzar.'),
       'B · Galones de la Armada': ('Lo que se reconoce en cualquier marina: galones en V para la marinería y estrellas para los oficiales, sobre un disco sin marco: la figura es la insignia.', 'En contra: la estrella también es el icono del barco propio en la placa y el minimapa.'),
       'C · Medallas con cinta': ('Una medalla colgada de su cinta: la cinta añade un 2.º color por rango, y el disco sube de bronce a oro.', 'En contra: el disco se parece a la moneda de los mercantes; es la más parecida a los iconos del juego (parecido {ncc} de un máximo de 0,80).')}
row_h = 246; sheet = Image.new('RGB', (1720, 120 + row_h * len(DIRS) + 40), (245, 241, 230)); d = ImageDraw.Draw(sheet)
d.text((40, 22), 'Insignias de rango: la de hoy y 3 direcciones nuevas', font=font(30), fill=(43, 29, 14))
d.text((40, 64), 'De izquierda a derecha: Grumete, Marinero, Contramaestre, Teniente y Almirante. Cada una a 48 px, a 24 px y a su tamaño real en la placa (12 px), en color y en grises, sobre la placa del juego.', font=font(16, 500), fill=(92, 74, 51))
for ri, (name, fn) in enumerate(DIRS):
    y = 110 + ri * row_h; worst, r2, r3, ok = RES[name]
    d.text((40, y), 'La de hoy (D74)' if name.startswith('D74') else name, font=font(22), fill=(43, 29, 14))
    d.text((40, y + 32), WHY[name][0], font=font(15, 500), fill=(92, 74, 51))
    if WHY[name][1]: d.text((870, y + 214), WHY[name][1].format(ncc=f'{r3[0]:.2f}'.replace('.', ',')), font=font(13, 500), fill=(162, 59, 42))
    verdict = (f'A su tamaño en la placa (12 px): el par más parecido difiere en {worst[1]:.0f} px (mín. 20) · las marcas se ven{"" if not r2 else " (FALLA)"} · '
               f'parecido con los iconos del juego {r3[0]:.2f} (máx. 0,80): ' + ('PASA' if ok else 'NO PASA') + ' (regla AD-40)').replace('0.', '0,')
    d.text((40, y + 56), verdict, font=font(15), fill=(31, 111, 60) if ok else (162, 59, 42))
    x = 40
    for k in range(5):
        els = fn(k)[0]
        big = raster(els, 4, PLATE); mid = raster(els, 2, PLATE); one = raster(els, 1, PLATE)
        tile = Image.new('RGB', (150, 140), tuple(int(c * 255) for c in PLATE)); tile.paste(to_img(big), (6, 8)); tile.paste(to_img(mid), (62, 8)); tile.paste(to_img(one), (94, 8))
        tile.paste(to_img(gray(big)), (6, 64)); tile.paste(to_img(gray(mid)), (62, 64)); tile.paste(to_img(gray(one)), (94, 64))
        ImageDraw.Draw(tile).text((6, 118), NAMES[k], font=font(13), fill=(245, 241, 230))
        sheet.paste(tile, (x, y + 84)); x += 160
    # a 12 px en una placa, x8 en píxeles (como se ve de cerca)
    strip = np.concatenate([raster(fn(k)[0], 1, PLATE) for k in range(5)], axis=1)
    sheet.paste(to_img(strip).resize((60 * 5, 60), Image.NEAREST), (870, y + 90))
    sheet.paste(to_img(gray(strip)).resize((60 * 5, 60), Image.NEAREST), (870, y + 156))
    d.text((1180, y + 108), 'a 12 px, ampliado ×5', font=font(13, 500), fill=(92, 74, 51))
    d.text((1180, y + 172), 'lo mismo en grises', font=font(13, 500), fill=(92, 74, 51))
out = os.path.join(RT.OUT, 'D69-insignias-direcciones.png'); sheet.save(out); print('hoja', os.path.abspath(out))
# SVG por dirección: las 5 a 48 px sobre la placa
def svg_el(t, a):
    return f'<{t} ' + ' '.join(f'{k}="{v:g}"' if isinstance(v, (int, float)) else f'{k}="{v}"' for k, v in a.items()) + '/>'
for name, fn in DIRS[1:]:
    tag = name.split(' · ')[0].strip().lower()
    body = ''.join(f'<g transform="translate({16 + k * 64},16) scale(4)">' + ''.join(svg_el(t, a) for t, a in fn(k)[0]) + '</g>' for k in range(5))
    txt = ''.join(f'<text x="{40 + k * 64}" y="90" font-family="Barlow, sans-serif" font-size="10" fill="#F5F1E6" text-anchor="middle">{NAMES[k]}</text>' for k in range(5))
    p = os.path.join(RT.OUT, f'D69-insignias-{tag}.svg')
    open(p, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 336 100" width="672" height="200"><rect width="336" height="100" fill="#0B1A24"/>{body}{txt}</svg>\n'); print('svg', os.path.abspath(p))
os.remove(os.path.join(tmp, 'h.png')); os.rmdir(tmp)

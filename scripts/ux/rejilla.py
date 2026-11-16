#!/usr/bin/env python3
# AC-72 (D57, ART-DIRECTION §18.1): imágenes con rejilla para los evaluadores-agente y tabla de celdas correctas.
#   python3 -I scripts/ux/rejilla.py <captura.png> <cajas.json> <carpeta_salida> [--origen auto | --origen <x>,<y>] [--estricto]
# Copia versionada (R-17 de QA, 2026-10-17) de qa-artifacts/render/d57-ac72/rejilla.py, que no se versiona.
# Salida: <base>-rejilla-color.png y <base>-rejilla-grises.png (las que ven los evaluadores), <base>-clave.png (solo
# QA: zonas de acierto) y <base>-celdas.json/.md (celdas correctas por elemento, celdas compartidas y avisos).
# Cajas del JSON en px CSS: [x, y, ancho, alto]. El DPR sale de viewport.dpr o de ancho_png / viewport.width.
# 1.1 (D71, ART-DIRECTION §18.2): el JSON puede traer su lista de roles, "roles": [["rol", "pregunta"], ...]; sin ella,
# valen los 5 de AC-72. Un elemento con "kind": "place" (el astillero, una roca) es un lugar: entra en las celdas y
# en la clave, pero no en la regla de los 16 px entre barcos.
# D107 (H-D106-2; ART-DIRECTION §18.1, «Lejos de las líneas»): mide la distancia del centro de la caja de cada elemento
# preguntado a la línea interior más cercana, en x y en y, en fracción de celda. Por debajo de ¼ de celda en algún eje la
# imagen no vale: el evaluador duda entre 2 o 4 celdas válidas y responde «no sé» (QA-78, adenda A.4: los 14 elementos
# sin celda de las 13 respuestas con «no sé» estaban a ≤ 0,073 de celda, y ningún barco a ≥ 0,112 tuvo un «no sé»). La puerta
# es ¼, la de producto (BACKLOG, «Adenda de QA-78 (D106)», b), con margen sobre lo medido; corregido el 2026-11-16, antes ⅛.
# Además, 2 elementos de roles distintos no pueden compartir celda: un rol cambiado por el otro contaría como acierto.
# --estricto sale con código 2 si la imagen no vale (por esta regla o por la de los 16 px de D57). --origen desplaza la
# rejilla sobre la misma captura, sin mover barcos ni repetirla: la primera línea vertical pasa a x y la primera
# horizontal a y (px CSS, 0 ≤ x < ancho de celda); las celdas de los bordes quedan parciales y, si medirían menos de ¼
# de celda, se funden con su vecina. Con «auto», el origen sale de una regla fija que no mira las respuestas: el que
# maximiza la menor distancia (en fracción de celda) de los centros preguntados a una línea, buscado cada 0,5 px CSS; si
# empatan, el de menor x y después menor y. Sin --origen, la rejilla es la de siempre (origen 0, 0) y las imágenes salen
# idénticas a las de antes de D107.
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Rejilla fija por tamaño (D57): celdas de ≈ 1 eslora de barco en pantalla
GRIDS = {(1440, 900): (12, 8), (390, 844): (6, 12)}
ROLES = [('self', 'el barco que controlas'), ('player', 'otro jugador'), ('pirate', 'un pirata'),
         ('merchant', 'un mercante'), ('target', 'el barco seleccionado como objetivo')]
NEAR = 0.25   # D107: por debajo de esta fracción de celda, el centro de un elemento preguntado está «sobre una línea» (puerta)
GOAL = 0.25   # D107: igual a la puerta desde el 2026-11-16 (antes, objetivo por encima de una puerta de ⅛)
EDGE = 0.25   # D107: una celda de borde más estrecha que esto se funde con su vecina

def to_gray(rgb8):
    """AD-21: luminancia relativa (sRGB lineal, pesos Rec. 709) codificada otra vez en sRGB. Conserva el L* de cada píxel."""
    c = rgb8.astype(np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    y = lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722
    g = np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(y, 1 / 2.4) - 0.055)
    g8 = np.clip(np.round(g * 255), 0, 255).astype(np.uint8)
    return np.repeat(g8[..., None], 3, axis=-1)

def lstar(rgb8):
    c = rgb8.astype(np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    y = lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722
    f = np.where(y > 0.008856, np.cbrt(y), 7.787 * y + 16 / 116)
    return 116 * f - 16

def font(px):
    for p in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, px)
    return ImageFont.load_default(size=px)

def col_label(i):
    return str(i + 1)

def bounds_1d(size, cell, origin):
    """Límites de las celdas de un eje en px CSS, con los 2 bordes: líneas interiores cada `cell` desde `origin` (con 0,
    la rejilla de D57, que empieza en el borde: múltiplos de `cell`). D107: una línea a menos de ¼ de celda de un borde se
    quita, y la celda del borde se funde con su vecina; con el origen 0 no pasa nunca."""
    xs, i = [], 0
    while True:
        x = origin + i * cell
        if x >= size - 1e-6:
            break
        if x > 1e-6 and x >= cell * EDGE - 1e-6 and size - x >= cell * EDGE - 1e-6:
            xs.append(x)
        i += 1
    return [0.0] + xs + [float(size)]

def grid_image(img, xb, yb, dpr):
    """Rejilla después de la conversión (D57): líneas de 1 px CSS a trazos blanco/negro de 4 px al 60 % y etiquetas
    en un margen de 44 px CSS por los 4 lados, fuera de la captura: números de columna arriba y abajo, de fila a
    izquierda y derecha, y el nombre del eje («columna», «fila») por fuera de los números. xb, yb: los límites de las
    celdas en px CSS, con los bordes (bounds_1d)."""
    H, W = img.shape[:2]
    m = round(44 * dpr)
    out = np.full((H + 2 * m, W + 2 * m, 3), 255, np.uint8)
    out[m:m + H, m:m + W] = img
    lw, dash = max(1, round(dpr)), round(4 * dpr)
    a = 0.6
    def blend(ys, xs, color):
        out[ys, xs] = np.round(out[ys, xs] * (1 - a) + np.array(color) * a).astype(np.uint8)
    for xc in xb[1:-1]:
        x0 = m + round(xc * dpr) - lw // 2
        for y in range(m, m + H, dash):
            blend(slice(y, min(y + dash, m + H)), slice(x0, x0 + lw), (255, 255, 255) if ((y - m) // dash) % 2 == 0 else (0, 0, 0))
    for yc in yb[1:-1]:
        y0 = m + round(yc * dpr) - lw // 2
        for x in range(m, m + W, dash):
            blend(slice(y0, y0 + lw), slice(x, min(x + dash, m + W)), (255, 255, 255) if ((x - m) // dash) % 2 == 0 else (0, 0, 0))
    pil = Image.fromarray(out)
    d = ImageDraw.Draw(pil)
    f, fa = font(round(16 * dpr)), font(round(11 * dpr))
    num_in, cap_out = 0.68, 0.24  # números en la parte del margen pegada a la captura y el eje por fuera
    for i in range(len(xb) - 1):
        cx = m + (xb[i] + xb[i + 1]) / 2 * dpr
        d.text((cx, m * num_in), col_label(i), fill=(17, 17, 17), font=f, anchor='mm')
        d.text((cx, m + H + m * (1 - num_in)), col_label(i), fill=(17, 17, 17), font=f, anchor='mm')
    for j in range(len(yb) - 1):
        cy = m + (yb[j] + yb[j + 1]) / 2 * dpr
        d.text((m * num_in, cy), str(j + 1), fill=(17, 17, 17), font=f, anchor='mm')
        d.text((m + W + m * (1 - num_in), cy), str(j + 1), fill=(17, 17, 17), font=f, anchor='mm')
    gray_txt = (110, 110, 110)
    for cy in (m * cap_out, m + H + m * (1 - cap_out)):
        for frac in (0.25, 0.75):
            d.text((m + W * frac, cy), 'columna', fill=gray_txt, font=fa, anchor='mm')
    for cx, rot in ((m * cap_out, 90), (m + W + m * (1 - cap_out), 270)):
        for frac in (0.25, 0.75):
            t = Image.new('L', (round(60 * dpr), round(16 * dpr)), 0)
            ImageDraw.Draw(t).text((t.width / 2, t.height / 2), 'fila', fill=255, font=fa, anchor='mm')
            t = t.rotate(rot, expand=True)
            pil.paste(Image.new('RGB', t.size, gray_txt), (round(cx - t.width / 2), round(m + H * frac - t.height / 2)), t)
    return pil, m

def cells_of(rects, xb, yb):
    """Celdas con intersección de área > 0 con alguna de las cajas (D57: acierto = celda que corta la zona)."""
    out = set()
    for x, y, w, h in rects:
        if w <= 0 or h <= 0:
            continue
        x2, y2 = x + w, y + h
        for i in range(len(xb) - 1):
            if min(x2, xb[i + 1]) - max(x, xb[i]) <= 0:
                continue
            for j in range(len(yb) - 1):
                if min(y2, yb[j + 1]) - max(y, yb[j]) > 0:
                    out.add((i, j))
    return out

def name(c):
    return f'{c[0] + 1}-{c[1] + 1}'  # columna-fila (D57): números en los dos ejes, como «5-3»

def line_dist(v, b):
    """Distancia (px CSS) de v a la línea interior más cercana de los límites b; infinito si el eje no tiene líneas."""
    return min((abs(v - x) for x in b[1:-1]), default=math.inf)

def near_lines(centers, xb, yb, cw, rh):
    """Por elemento: la distancia de su centro a la línea más cercana en x y en y, en px CSS y en fracción de celda."""
    out = []
    for key, (cx, cy) in centers:
        dx, dy = line_dist(cx, xb), line_dist(cy, yb)
        out.append({'id': key, 'centro': [round(cx, 1), round(cy, 1)], 'dx': round(dx, 1) if dx < math.inf else None,
                    'dy': round(dy, 1) if dy < math.inf else None, 'fx': round(dx / cw, 3) if dx < math.inf else None,
                    'fy': round(dy / rh, 3) if dy < math.inf else None, 'f': round(min(dx / cw, dy / rh), 3)})
    return out

def auto_origin(centers, vw, vh, cw, rh, step=0.5):
    """D107: el origen (x, y) que maximiza la menor distancia en fracción de celda de los centros preguntados a una línea.
    Los 2 ejes son independientes (la distancia en x solo depende de las líneas verticales), así que se busca cada uno por
    separado; si empatan, el menor. Regla fija: solo usa las cajas, nunca las respuestas."""
    def best(vals, size, cell):
        top, arg = -1.0, 0.0
        for k in range(int(math.ceil(cell / step))):
            o = k * step
            b = bounds_1d(size, cell, o)
            s = min((line_dist(v, b) / cell for v in vals), default=math.inf)
            if s > top + 1e-9:
                top, arg = s, o
        return arg, top
    ox, sx = best([c[0] for _, c in centers], vw, cw)
    oy, sy = best([c[1] for _, c in centers], vh, rh)
    return (ox, oy), min(sx, sy)

def main(png, js, outdir, origin=None, strict=False):
    os.makedirs(outdir, exist_ok=True)
    base = os.path.splitext(os.path.basename(png))[0]
    data = json.load(open(js))
    vw, vh = data['viewport']['width'], data['viewport']['height']
    img = np.asarray(Image.open(png).convert('RGB'))
    dpr = data['viewport'].get('dpr') or img.shape[1] / vw
    cols, rows = GRIDS.get((vw, vh)) or (max(1, round(vw / (120 if vw >= 700 else 65))), max(1, round(vh / (112.5 if vw >= 700 else 70.3))))
    cw, rh = vw / cols, vh / rows
    els = data['elements']
    def members(role):
        if role == 'target':
            return [k for k, e in enumerate(els) if e.get('selected')]
        return [k for k, e in enumerate(els) if e['role'] == role]
    roles = [tuple(r) for r in data.get('roles', ROLES)]
    asked = sorted({k for role, _ in roles for k in members(role)})
    centers = [(els[k].get('id', str(k)), (els[k]['ship'][0] + els[k]['ship'][2] / 2, els[k]['ship'][1] + els[k]['ship'][3] / 2)) for k in asked]
    if origin == 'auto':
        origin, _ = auto_origin(centers, vw, vh, cw, rh)
    origin = tuple(origin or (0.0, 0.0))
    xb, yb = bounds_1d(vw, cw, origin[0]), bounds_1d(vh, rh, origin[1])
    gray = to_gray(img)
    dl = np.abs(lstar(gray) - lstar(img))
    for tag, im in (('color', img), ('grises', gray)):
        g, m = grid_image(im, xb, yb, dpr)
        g.save(os.path.join(outdir, f'{base}-rejilla-{tag}.png'))
    # Zonas de acierto: barco + placa + anillo de selección (en px CSS); el HUD no cuenta
    zone = {k: [e[f] for f in ('ship', 'plate', 'ring') if e.get(f)] for k, e in enumerate(els)}
    cells = {k: cells_of(z, xb, yb) for k, z in zone.items()}
    table, warnings, invalid = {}, [], False
    for role, label in roles:
        ks = members(role)
        if not ks:
            warnings.append(f'Falta «{label}» en la captura: AC-72 no se puede puntuar con esta imagen')
            invalid = True
        table[role] = {'pregunta': label, 'barcos': [els[k].get('id', str(k)) for k in ks],
                       'celdas': sorted({name(c) for k in ks for c in cells[k]}, key=lambda s: (int(s.split('-')[1]), int(s.split('-')[0])))}
    # Validez (D57): las cajas de barco de dos barcos distintos quedan separadas ≥ 16 px CSS (agua entre ellos); si
    # se cruzan o se rozan, no se sabe qué se identificó y hay que repetir la pose
    GAP = 16
    for a in range(len(els)):
        for b in range(a + 1, len(els)):
            if els[a].get('kind') == 'place' or els[b].get('kind') == 'place':
                continue
            (ax, ay, aw, ah), (bx, by, bw, bh) = els[a]['ship'], els[b]['ship']
            gap = max(bx - (ax + aw), ax - (bx + bw), by - (ay + ah), ay - (by + bh))  # < 0: se cruzan
            if gap < GAP:
                what = f'se superponen ({-gap:.0f} px CSS de solape)' if gap < 0 else f'quedan a {gap:.0f} px CSS'
                warnings.append(f'Imagen no válida: los barcos {els[a].get("id", a)} y {els[b].get("id", b)} {what}; hacen falta ≥ {GAP} px CSS. Hay que repetir la pose')
                invalid = True
    # D107: lejos de las líneas. El centro de la caja de barco de cada elemento preguntado, a ≥ ¼ de celda de toda línea
    # interior en x y en y; si no, el evaluador puede dudar entre 2 o 4 celdas válidas y responder «no sé»
    dist = near_lines(centers, xb, yb, cw, rh)
    for d_ in dist:
        if d_['f'] < NEAR:
            axis = ' y '.join(t for t, fv in (('en x', d_['fx']), ('en y', d_['fy'])) if fv is not None and fv < NEAR)
            warnings.append(f'Imagen no válida (D107): el centro de {d_["id"]} queda a {min(v for v in (d_["dx"], d_["dy"]) if v is not None):.1f} px CSS '
                            f'de una línea {axis} ({d_["f"]:.3f} de celda; hace falta ≥ {NEAR}). Se corrige con --origen auto o moviendo la pose')
            invalid = True
    shared = []
    for a in range(len(els)):
        for b in range(a + 1, len(els)):
            common = cells[a] & cells[b]
            if common:
                shared.append({'a': els[a].get('id', str(a)), 'b': els[b].get('id', str(b)), 'celdas': sorted(name(c) for c in common)})
                # D107: con roles distintos, una celda compartida deja pasar como acierto justo la confusión que se mide
                if 'place' not in (els[a].get('kind'), els[b].get('kind')) and els[a].get('role') != els[b].get('role'):
                    warnings.append(f'Imagen no válida (D107): {els[a].get("id", a)} ({els[a].get("role")}) y {els[b].get("id", b)} ({els[b].get("role")}) '
                                    f'comparten {", ".join(sorted(name(c) for c in common))}. Hay que mover la escena o el origen')
                    invalid = True
            if cells[a] and cells[a] == cells[b]:
                warnings.append(f'{els[a].get("id", a)} y {els[b].get("id", b)} tienen las mismas celdas: un cambio entre ellos no se detecta')
    H, W = img.shape[:2]
    lw = max(1, round(dpr))
    nx, ny = len(xb) - 1, len(yb) - 1
    line_px = ((nx - 1) * H + (ny - 1) * W) * lw
    meta = {'png': os.path.basename(png), 'viewport': [vw, vh], 'dpr': dpr, 'rejilla': [nx, ny],
            'celda_css': [round(cw, 2), round(rh, 2)], 'lineas_px_sobre_la_captura': f'{100 * line_px / (W * H):.2f} %',
            'grises_dL*_medio_y_max': [round(float(dl.mean()), 3), round(float(dl.max()), 3)]}
    if origin != (0.0, 0.0):
        meta['origen_css'] = [origin[0], origin[1]]
        meta['limites_css'] = {'x': [round(v, 2) for v in xb], 'y': [round(v, 2) for v in yb]}
    meta['distancia_a_las_lineas'] = dist
    meta['valida'] = not invalid
    json.dump({'meta': meta, 'celdas': table, 'compartidas': shared, 'avisos': warnings}, open(os.path.join(outdir, f'{base}-celdas.json'), 'w'), ensure_ascii=False, indent=1)
    with open(os.path.join(outdir, f'{base}-celdas.md'), 'w') as f:
        org = '' if origin == (0.0, 0.0) else f' Origen desplazado (D107): primera línea vertical en x = {origin[0]:g} y primera horizontal en y = {origin[1]:g} px CSS; celdas de los bordes parciales.'
        f.write(f'# {base}: celdas correctas (AC-72, D57)\n\nRejilla {nx} × {ny} (celdas de {cw:.1f} × {rh:.1f} px CSS), DPR {dpr:g}.{org} '
                f'Líneas sobre la captura: {meta["lineas_px_sobre_la_captura"]} de los píxeles (trazos blancos y negros alternos). Grises: ΔL* medio {meta["grises_dL*_medio_y_max"][0]} y máximo {meta["grises_dL*_medio_y_max"][1]} frente al color.\n\n')
        f.write('Celdas como «columna-fila» (D57): «5-3» es la columna 5, fila 3.\n\n| Elemento | Barcos | Celdas correctas |\n|---|---|---|\n')
        for role, _ in roles:
            t = table[role]
            f.write(f'| {t["pregunta"]} | {", ".join(t["barcos"]) or "—"} | {", ".join(t["celdas"]) or "—"} |\n')
        f.write('\nDistancia del centro de cada barco preguntado a la línea más cercana (D107): vale ≥ 0,125 de celda en x y en y; el objetivo para las escenas nuevas es ≥ 0,25.\n\n| Barco | Centro (px CSS) | x | y |\n|---|---|---|---|\n')
        for d_ in dist:
            cx_, cy_ = d_['centro']
            fmt = lambda v, fv: '—' if v is None else f'{v:.1f} px ({fv:.3f})' + (' **no vale**' if fv < NEAR else (' bajo el objetivo' if fv < GOAL else ''))
            f.write(f'| {d_["id"]} | {cx_:.1f}, {cy_:.1f} | {fmt(d_["dx"], d_["fx"])} | {fmt(d_["dy"], d_["fy"])} |\n')
        if shared:
            f.write('\nCeldas compartidas entre barcos distintos: ' + '; '.join(f'{s["a"]} y {s["b"]}: {", ".join(s["celdas"])}' for s in shared) + '\n')
        for w_ in warnings:
            f.write(f'\n**Aviso:** {w_}\n')
    # Clave para QA (no se enseña a los evaluadores): zonas de acierto y celdas correctas sobre la imagen en color
    key, m = grid_image(img, xb, yb, dpr)
    d = ImageDraw.Draw(key)
    pal = {'self': (255, 209, 102), 'player': (245, 241, 230), 'pirate': (255, 122, 122), 'merchant': (108, 195, 245)}
    for k, e in enumerate(els):
        col = pal.get(e['role'], (255, 255, 255))
        for c in cells[k]:
            d.rectangle([m + xb[c[0]] * dpr + 3, m + yb[c[1]] * dpr + 3, m + xb[c[0] + 1] * dpr - 3, m + yb[c[1] + 1] * dpr - 3], outline=col, width=max(1, round(dpr)))
        for x, y, w, h in zone[k]:
            d.rectangle([m + x * dpr, m + y * dpr, m + (x + w) * dpr, m + (y + h) * dpr], outline=col, width=max(2, round(2 * dpr)))
        if e.get('selected'):
            x, y, w, h = e['ship']
            d.text((m + x * dpr, m + (y - 4) * dpr), 'objetivo', fill=(255, 255, 255), font=font(round(12 * dpr)), anchor='ls')
    key.save(os.path.join(outdir, f'{base}-clave.png'))
    print(open(os.path.join(outdir, f'{base}-celdas.md')).read())
    if strict and invalid:
        print('rejilla.py --estricto: la imagen no vale (ver los avisos)', file=sys.stderr)
        sys.exit(2)

if __name__ == '__main__':
    args, origin, strict = [], None, False
    it = iter(sys.argv[1:])
    for a in it:
        if a == '--estricto':
            strict = True
        elif a == '--origen':
            v = next(it)
            origin = 'auto' if v == 'auto' else tuple(float(t) for t in v.split(','))
        else:
            args.append(a)
    if len(args) != 3:
        sys.exit('uso: rejilla.py <captura.png> <cajas.json> <carpeta_salida> [--origen auto | --origen <x>,<y>] [--estricto]')
    main(*args, origin=origin, strict=strict)

#!/usr/bin/env python3
# AC-72 (D57, ART-DIRECTION §18.1): imágenes con rejilla para los evaluadores-agente y tabla de celdas correctas.
#   python3 -I scripts/ux/rejilla.py <captura.png> <cajas.json> <carpeta_salida>
# Copia versionada (R-17 de QA, 2026-10-17) de qa-artifacts/render/d57-ac72/rejilla.py, que no se versiona.
# Salida: <base>-rejilla-color.png y <base>-rejilla-grises.png (las que ven los evaluadores), <base>-clave.png (solo
# QA: zonas de acierto) y <base>-celdas.json/.md (celdas correctas por elemento, celdas compartidas y avisos).
# Cajas del JSON en px CSS: [x, y, ancho, alto]. El DPR sale de viewport.dpr o de ancho_png / viewport.width.
# 1.1 (D71, ART-DIRECTION §18.2): el JSON puede traer su lista de roles, "roles": [["rol", "pregunta"], ...]; sin ella,
# valen los 5 de AC-72. Un elemento con "kind": "place" (el astillero, una roca) es un lugar: entra en las celdas y
# en la clave, pero no en la regla de los 16 px entre barcos.
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Rejilla fija por tamaño (D57): celdas de ≈ 1 eslora de barco en pantalla
GRIDS = {(1440, 900): (12, 8), (390, 844): (6, 12)}
ROLES = [('self', 'el barco que controlas'), ('player', 'otro jugador'), ('pirate', 'un pirata'),
         ('merchant', 'un mercante'), ('target', 'el barco seleccionado como objetivo')]

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

def grid_image(img, cols, rows, dpr):
    """Rejilla después de la conversión (D57): líneas de 1 px CSS a trazos blanco/negro de 4 px al 60 % y etiquetas
    en un margen de 44 px CSS por los 4 lados, fuera de la captura: números de columna arriba y abajo, de fila a
    izquierda y derecha, y el nombre del eje («columna», «fila») por fuera de los números."""
    H, W = img.shape[:2]
    m = round(44 * dpr)
    out = np.full((H + 2 * m, W + 2 * m, 3), 255, np.uint8)
    out[m:m + H, m:m + W] = img
    lw, dash = max(1, round(dpr)), round(4 * dpr)
    a = 0.6
    def blend(ys, xs, color):
        out[ys, xs] = np.round(out[ys, xs] * (1 - a) + np.array(color) * a).astype(np.uint8)
    cw, rh = W / cols, H / rows
    for i in range(1, cols):
        x0 = m + round(i * cw) - lw // 2
        for y in range(m, m + H, dash):
            blend(slice(y, min(y + dash, m + H)), slice(x0, x0 + lw), (255, 255, 255) if ((y - m) // dash) % 2 == 0 else (0, 0, 0))
    for j in range(1, rows):
        y0 = m + round(j * rh) - lw // 2
        for x in range(m, m + W, dash):
            blend(slice(y0, y0 + lw), slice(x, min(x + dash, m + W)), (255, 255, 255) if ((x - m) // dash) % 2 == 0 else (0, 0, 0))
    pil = Image.fromarray(out)
    d = ImageDraw.Draw(pil)
    f, fa = font(round(16 * dpr)), font(round(11 * dpr))
    num_in, cap_out = 0.68, 0.24  # números en la parte del margen pegada a la captura y el eje por fuera
    for i in range(cols):
        cx = m + (i + 0.5) * cw
        d.text((cx, m * num_in), col_label(i), fill=(17, 17, 17), font=f, anchor='mm')
        d.text((cx, m + H + m * (1 - num_in)), col_label(i), fill=(17, 17, 17), font=f, anchor='mm')
    for j in range(rows):
        cy = m + (j + 0.5) * rh
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

def cells_of(rects, cols, rows, vw, vh):
    """Celdas con intersección de área > 0 con alguna de las cajas (D57: acierto = celda que corta la zona)."""
    cw, rh = vw / cols, vh / rows
    out = set()
    for x, y, w, h in rects:
        if w <= 0 or h <= 0:
            continue
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(vw, x + w), min(vh, y + h)
        if x2 <= x1 or y2 <= y1:
            continue
        for i in range(int(x1 // cw), int(math.ceil(x2 / cw))):
            for j in range(int(y1 // rh), int(math.ceil(y2 / rh))):
                if min(x2, (i + 1) * cw) - max(x1, i * cw) > 0 and min(y2, (j + 1) * rh) - max(y1, j * rh) > 0:
                    out.add((i, j))
    return out

def name(c):
    return f'{c[0] + 1}-{c[1] + 1}'  # columna-fila (D57): números en los dos ejes, como «5-3»

def main(png, js, outdir):
    os.makedirs(outdir, exist_ok=True)
    base = os.path.splitext(os.path.basename(png))[0]
    data = json.load(open(js))
    vw, vh = data['viewport']['width'], data['viewport']['height']
    img = np.asarray(Image.open(png).convert('RGB'))
    dpr = data['viewport'].get('dpr') or img.shape[1] / vw
    cols, rows = GRIDS.get((vw, vh)) or (max(1, round(vw / (120 if vw >= 700 else 65))), max(1, round(vh / (112.5 if vw >= 700 else 70.3))))
    gray = to_gray(img)
    dl = np.abs(lstar(gray) - lstar(img))
    for tag, im in (('color', img), ('grises', gray)):
        g, m = grid_image(im, cols, rows, dpr)
        g.save(os.path.join(outdir, f'{base}-rejilla-{tag}.png'))
    # Zonas de acierto: barco + placa + anillo de selección (en px CSS); el HUD no cuenta
    els = data['elements']
    zone = {k: [e[f] for f in ('ship', 'plate', 'ring') if e.get(f)] for k, e in enumerate(els)}
    cells = {k: cells_of(z, cols, rows, vw, vh) for k, z in zone.items()}
    def members(role):
        if role == 'target':
            return [k for k, e in enumerate(els) if e.get('selected')]
        return [k for k, e in enumerate(els) if e['role'] == role]
    roles = [tuple(r) for r in data.get('roles', ROLES)]
    table, warnings = {}, []
    for role, label in roles:
        ks = members(role)
        if not ks:
            warnings.append(f'Falta «{label}» en la captura: AC-72 no se puede puntuar con esta imagen')
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
    shared = []
    for a in range(len(els)):
        for b in range(a + 1, len(els)):
            common = cells[a] & cells[b]
            if common:
                shared.append({'a': els[a].get('id', str(a)), 'b': els[b].get('id', str(b)), 'celdas': sorted(name(c) for c in common)})
            if cells[a] and cells[a] == cells[b]:
                warnings.append(f'{els[a].get("id", a)} y {els[b].get("id", b)} tienen las mismas celdas: un cambio entre ellos no se detecta')
    H, W = img.shape[:2]
    lw, dash = max(1, round(dpr)), round(4 * dpr)
    line_px = ((cols - 1) * H + (rows - 1) * W) * lw
    meta = {'png': os.path.basename(png), 'viewport': [vw, vh], 'dpr': dpr, 'rejilla': [cols, rows],
            'celda_css': [round(vw / cols, 2), round(vh / rows, 2)], 'lineas_px_sobre_la_captura': f'{100 * line_px / (W * H):.2f} %',
            'grises_dL*_medio_y_max': [round(float(dl.mean()), 3), round(float(dl.max()), 3)]}
    json.dump({'meta': meta, 'celdas': table, 'compartidas': shared, 'avisos': warnings}, open(os.path.join(outdir, f'{base}-celdas.json'), 'w'), ensure_ascii=False, indent=1)
    with open(os.path.join(outdir, f'{base}-celdas.md'), 'w') as f:
        f.write(f'# {base}: celdas correctas (AC-72, D57)\n\nRejilla {cols} × {rows} (celdas de {vw / cols:.1f} × {vh / rows:.1f} px CSS), DPR {dpr:g}. '
                f'Líneas sobre la captura: {meta["lineas_px_sobre_la_captura"]} de los píxeles (trazos blancos y negros alternos). Grises: ΔL* medio {meta["grises_dL*_medio_y_max"][0]} y máximo {meta["grises_dL*_medio_y_max"][1]} frente al color.\n\n')
        f.write('Celdas como «columna-fila» (D57): «5-3» es la columna 5, fila 3.\n\n| Elemento | Barcos | Celdas correctas |\n|---|---|---|\n')
        for role, _ in roles:
            t = table[role]
            f.write(f'| {t["pregunta"]} | {", ".join(t["barcos"]) or "—"} | {", ".join(t["celdas"]) or "—"} |\n')
        if shared:
            f.write('\nCeldas compartidas entre barcos distintos: ' + '; '.join(f'{s["a"]} y {s["b"]}: {", ".join(s["celdas"])}' for s in shared) + '\n')
        for w_ in warnings:
            f.write(f'\n**Aviso:** {w_}\n')
    # Clave para QA (no se enseña a los evaluadores): zonas de acierto y celdas correctas sobre la imagen en color
    key, m = grid_image(img, cols, rows, dpr)
    d = ImageDraw.Draw(key)
    pal = {'self': (255, 209, 102), 'player': (245, 241, 230), 'pirate': (255, 122, 122), 'merchant': (108, 195, 245)}
    cw, rh = vw / cols * dpr, vh / rows * dpr
    for k, e in enumerate(els):
        col = pal.get(e['role'], (255, 255, 255))
        for c in cells[k]:
            d.rectangle([m + c[0] * cw + 3, m + c[1] * rh + 3, m + (c[0] + 1) * cw - 3, m + (c[1] + 1) * rh - 3], outline=col, width=max(1, round(dpr)))
        for x, y, w, h in zone[k]:
            d.rectangle([m + x * dpr, m + y * dpr, m + (x + w) * dpr, m + (y + h) * dpr], outline=col, width=max(2, round(2 * dpr)))
        if e.get('selected'):
            x, y, w, h = e['ship']
            d.text((m + x * dpr, m + (y - 4) * dpr), 'objetivo', fill=(255, 255, 255), font=font(round(12 * dpr)), anchor='ls')
    key.save(os.path.join(outdir, f'{base}-clave.png'))
    print(open(os.path.join(outdir, f'{base}-celdas.md')).read())

if __name__ == '__main__':
    main(*sys.argv[1:4])

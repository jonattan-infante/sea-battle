# Uso (desde la raíz del repo): python3 -I scripts/ux/insignias_v_json.py
#   →  scripts/ux/calibracion/insignias-v-1-1.json (ligero: menos de 1 s)
# Marcado de las insignias en V (AC-191, aprobadas por Jonattan el 2026-10-18 a las 23:55:12Z sobre la lámina
# docs/game/art/D69-insignias-v.png, sha256 34372b8b…; ART-DIRECTION §11.5) para quien las construye. Lo saca de los 2 SVG
# que acompañan a la lámina aprobada, sin volver a dibujar nada:
#   - D69-insignias-v.svg: la de placa (12, 16, 18, 24 y 32 px), la que midió AD-40 (insignias_v.py y lamina_insignias_v.py);
#   - D69-insignias-v-grande.svg: la grande con material (solo la tarjeta propia de la pantalla de niveles: 64 / 48 / 56 px).
# Cada rango sale con su viewBox `0 0 12 12`: la de placa, con sus elementos en orden de pintado y los mismos atributos (como
# insignias-1-1.json de D74); la grande, con sus `defs` (solo los que usa) y los ids con el prefijo `rb-` para que no choquen
# con otros del documento. Comprueba que hay 5 grupos en cada SVG y que la forma de cada insignia (puntos de cada polígono
# y cada rect) es la misma en las 2 versiones. No corre en la CI.
import hashlib, json, os, re, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
ART = os.path.join(REPO, 'docs', 'game', 'art')
OUT = os.path.join(HERE, 'calibracion', 'insignias-v-1-1.json')
NAMES = ['grumete', 'marinero', 'contramaestre', 'teniente', 'almirante']
CODES = ['V-g1-hueca-c1,8', 'V-g2-hueca-c2,6', 'V-g3-llena-c1,8', 'V-b2-hueca-c1,8', 'V-rosa8-llena-c2,6']   # figura, relleno y corte del parche
TAG = re.compile(r'<(\w+)((?:\s+[\w:-]+="[^"]*")*)\s*/>')
ATTR = re.compile(r'([\w:-]+)="([^"]*)"')


def groups(svg):
    gs = re.findall(r'<g transform="translate\([^)]*\) scale\([^)]*\)">(.*?)</g>', svg, re.S)
    if len(gs) != 5: raise SystemExit(f'esperaba 5 grupos y hay {len(gs)}')
    return gs


def elements(inner):
    return [dict([('etiqueta', t)] + ATTR.findall(raw)) for t, raw in TAG.findall(inner)]


def shape(els):
    """La forma: los puntos de cada polígono y la caja de cada rect (la grande lleva además sombras, bisel, bordado y, en
    la rosa, sus facetas; la sombra de cada pieza repite sus puntos)."""
    out = []
    for e in els:
        if e['etiqueta'] == 'polygon': out.append(('polygon', e['points']))
        elif e['etiqueta'] == 'rect' and 'x' in e: out.append(('rect', e['x'], e['y'], e['width'], e['height']))
    return out


def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()


if __name__ == '__main__':
    p_plate, p_big, p_png = (os.path.join(ART, f) for f in ('D69-insignias-v.svg', 'D69-insignias-v-grande.svg', 'D69-insignias-v.png'))
    plate, big = open(p_plate).read(), open(p_big).read()
    defs = {m.group(1): m.group(0) for m in re.finditer(r'<(?:linearGradient|pattern) id="(\w+)".*?</(?:linearGradient|pattern)>', big, re.S)}
    res = {'viewBox': '0 0 12 12',
           'nota': ('AC-191 (ART-DIRECTION §11.5): las insignias en V, aprobadas por Jonattan el 2026-10-18 a las 23:55:12Z. rank 1..5 = GDD §10b. '
                    '«svg» y «elementos»: la de placa, en orden de pintado y con la semántica de SVG 1.1, la que mide AD-40 (12, 16, 18, 24 y 32 px). '
                    '«svg_grande»: la de material, solo para la tarjeta propia de la pantalla de niveles (64 / 48 / 56 px; ART §12.11), con overflow visible para su sombra. '
                    'Lo genera scripts/ux/insignias_v_json.py desde los SVG de la lámina aprobada'),
           'fuente': {'lamina': ['docs/game/art/D69-insignias-v.png', sha(p_png)], 'placa': ['docs/game/art/D69-insignias-v.svg', sha(p_plate)],
                      'grande': ['docs/game/art/D69-insignias-v-grande.svg', sha(p_big)]},
           'insignias': {}}
    for k, (gp, gb) in enumerate(zip(groups(plate), groups(big))):
        els = elements(gp); els_b = elements(gb)
        missing = [s for s in shape(els) if s not in set(shape(els_b))]
        if missing: raise SystemExit(f'{NAMES[k]}: la grande no tiene estas piezas de la de placa: {missing}')
        used = sorted(set(re.findall(r'url\(#(\w+)\)', gb)))
        d = ''.join(defs[i] for i in used)
        for i in used: d = d.replace(f'id="{i}"', f'id="rb-{i}"'); gb = gb.replace(f'url(#{i})', f'url(#rb-{i})')
        res['insignias'][NAMES[k]] = {
            'rank': k + 1, 'codigo': CODES[k], 'elementos': els,
            'svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12">' + gp + '</svg>',
            'svg_grande': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" overflow="visible"><defs>' + d + '</defs>' + gb + '</svg>'}
        print(NAMES[k], len(els), 'elementos de placa ·', len(els_b), 'de la grande · defs', used)
    with open(OUT, 'w') as f: json.dump(res, f, indent=1, ensure_ascii=False); f.write('\n')
    print('escrito', os.path.relpath(OUT, REPO), sha(OUT))

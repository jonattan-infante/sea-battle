# Uso (desde la raíz del repo), con la misma UX_OUT, tras: clase_curvo.py <clase> → blender_curvo.py <clase>_{gb,es} bake
# 1024 64 → clase_curvo.py <clase> otra vez (el atlas con la oclusión y el de 512²) → blender_curvo.py <clase>_{gb,es}
# export → gltf-transform meshopt (→ $UX_OUT/cadena/comp/<clase>_<fam>_meshopt.glb) y `ktx create` desde el atlas de 512²
# como en comprimir_cadena.sh, desde atlas_<clase>_<fam>_out.png (→ comp/atlas_<clase>_<fam>.ktx2); y en $UX_OUT/cadena los aparejos de hoy de las 4 clases
# (<clase>-rig.json, code/export-rig-clases.ts):
#   python3 -I scripts/ux/laminas/lamina_clase.py <clase> <origen_navios>  →  $UX_OUT/D95-<nombre>.png y
#   $UX_OUT/cadena/<clase>-medidas.json
#   <origen_navios>: la UX_OUT del turno de la entrega de los Navíos (E3), para ponerlos a la misma escala
# Lámina de una clase del jugador en las 2 familias con la receta de D91 (AC-195; formato de AC-192 g) para Jonattan: la de
# hoy (el generador del juego) y las 2 nuevas, con la luz del juego y la textura KTX2 como la ve la GPU (render por software
# de scripts/ux/mapa/render_tex.py), como en el juego en 1440×900, de lado, desde arriba, la popa de cerca y en el móvil en
# color y en grises; a la misma escala que las otras 4 clases y los Navíos aprobados, con su eslora y lo que pide (nivel y
# oro). Mide los triángulos, la caja del casco (AS-V03), el peso con la KTX2 fuera (ASSET-SPEC §13, 4c) y el respaldo de
# D90 (4b). Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, json, math, io, gzip
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'mapa'), os.path.join(HERE, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import tienda as T
import render_tex as RTX
import curvo as CV
import respaldo as RS
import clase_curvo as CC
import lamina_capitan as LC  # shot(), fit(), glb_geo() y respaldo_rule(): las mismas vistas y reglas que la del Capitán
import ad28_canonera2 as A
import numpy as np
from PIL import Image, ImageDraw

CAD = os.path.join(RT.OUT, 'cadena'); M = RTX.M; WHITE = np.ones((4, 4, 3))
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42)
NAME = {'sloop': 'Balandra', 'schooner': 'Goleta', 'brig': 'Bergantín', 'frigate': 'Fragata', 'line': 'Navío de línea'}
FILE = {'sloop': 'balandra', 'schooner': 'goleta', 'brig': 'bergantin', 'frigate': 'fragata'}
MASC = ('brig', 'line')  # el Bergantín y el Navío: el artículo y la familia en masculino
def art(k): return 'el' if k in MASC else 'la'
def fam_adj(k, f): return ('británico' if f == 'gb' else 'español') if k in MASC else ('británica' if f == 'gb' else 'española')
SHIP = {s['id']: s for s in T.SHIPS}
TOPE = dict(lod0=5000, lod1=1200, suma=630930)  # producto, 2026-10-19 (BACKLOG :359): el de las familias y la suma de las 8
def font(px, w=600): return T.font(px, w)


def hoy(cls):
    """La clase de hoy: el generador del juego entero, con su color de vértice, normales de cara y la luz del juego."""
    d = CC.rig_json(cls)['lod0']; P = np.array(d['pos']).reshape(-1, 3); C = np.array(d['col']).reshape(-1, 3)
    Pc, UVc, Cc, _ = RTX.clip_below_water(P, np.full((len(P), 2), 0.5), C)
    return dict(P=Pc, UV=UVc, C=Cc, S=None, N=None, A=WHITE, shadow=False)


def receta(npz, ktx):
    d = np.load(RT.need(npz, os.path.basename(npz))); P = d['p']; N = CV.vertex_normals(P)
    C4 = np.concatenate([d['c'], d['r'][:, None]], axis=1); Pc, UVc, C4c, Nc = RTX.clip_below_water(P, d['t'], C4, N)
    return dict(P=Pc, UV=UVc, C=C4c[:, :3], S=C4c[:, 3], N=Nc, A=A.ktx_lin(RT.need(ktx, os.path.basename(ktx))), shadow=True)


def respaldo_rule(npz, atlas_png, out_png, ktx, regions):
    """La de lamina_capitan.py (D90, 4b), con la base frente al atlas que se comprime (out_png: el de 512² en 3 de las 4
    clases) y no frente al de 1024² pintado, que sumaría a la base lo que se pierde al reducir. Los candidatos salen del
    de 1024², con sus regiones."""
    z = np.load(npz); P, UVc, Cc, _ = RTX.clip_below_water(z['p'], z['t'], z['c'])
    ref = RS.mips(Image.fromarray(np.round(M.lin2srgb(A.ktx_lin(ktx)) * 255).astype(np.uint8)))
    gb_ = RS.gbuffer(P, UVc, Cc, 6.20 / 0.7, 55, 135); r_img, r_cov = RS.shade(gb_, ref); full = r_cov > 0.999
    base = RS.dE(RS.shade(gb_, RS.mips(Image.open(out_png).convert('RGB')))[0], r_img, full); out = {}
    for n in (128, 256):
        im = RS.fallback(atlas_png, n, regions=regions, size=1024)
        for fmt in ('png', 'jpeg'):
            data = RS.encode(im, fmt); e = RS.dE(RS.shade(gb_, RS.mips(Image.open(io.BytesIO(data)).convert('RGB')))[0], r_img, full)
            out[f'{fmt}{n}'] = dict(bytes=len(data), dE=round(e[0], 3), dE_medio=round(e[2], 3), pasa=bool(e[0] <= 1.5 * base[0] and e[2] <= 1.0), data=data)
    ok = [k for k, v in out.items() if v['pasa']]
    return out, (min(ok, key=lambda k: out[k]['bytes']) if ok else 'png256'), round(base[0], 3)


def gray(img): return img.convert('L').convert('RGB')
def gz(b): return len(gzip.compress(b, 9, mtime=0))
def mil(n): return f'{n:,}'.replace(',', '.')
def dec(x, k): return f'{x:.{k}f}'.replace('.', ',')


def traits(cls):
    """Los rasgos de silueta de ART-DIRECTION §9.2 de la clase, desde su receta (iguales en las 2 familias)."""
    c = CC.CLASES[cls]; rec = CC.rig_json(cls)['recipe']
    seq = ''.join('Q' if not mt.get('gaff') and not mt.get('lateen') else ('G' if mt.get('gaff') else 'T') for mt in sorted(rec['masts'], key=lambda mt: -mt['z']))
    s4 = 'camareta de popa' if c['house'] else ('alcázar y castillo de proa' if c['tiers'] else 'ninguno')
    return dict(S1=c['L'], S2=len(rec['masts']), S3='·'.join(seq), S4=s4, S6=1)


if __name__ == '__main__':
    cls, nav = sys.argv[1], sys.argv[2]; comp = os.path.join(CAD, 'comp')
    old = hoy(cls)
    new = {f: receta(os.path.join(CAD, f'{cls}_{f}_lod0.npz'), os.path.join(comp, f'atlas_{cls}_{f}.ktx2')) for f in ('gb', 'es')}
    TRIO = (old, new['gb'], new['es'])
    s = math.sqrt(30 / CC.CLASES[cls]['L'])
    VIEWS = [  # (título, th, rumbo, px/m, cielo)
        ('Como en el juego, en 1440×900 (cámara a 55°, 6,2 px por metro)', 55, 135, 6.2, False),
        ('De lado (9 px por metro)', 0, 90, 9.0, True),
        ('Desde arriba (9 px por metro)', 90, 90, 9.0, False),
        (f'La popa de cerca, en 3/4 desde atrás ({dec(14 * s, 0)} px por metro)', 26, 160, round(14 * s, 1), False),
        ('En el móvil, en 390×844 (2,8 px por metro), en color y en grises', 55, 135, 2.8, False),
    ]
    shots = []
    for title, th, hd, ppm, sky in VIEWS:
        fr = LC.fit(TRIO, th, hd, ppm); sk = fr[3] if sky else None
        ims = [LC.shot(m, th, hd, ppm, fr, sky=sk, SS=4 if ppm < 4 else 3) for m in TRIO]
        if ppm < 4: ims = [Image.fromarray(np.hstack([np.asarray(x), np.asarray(gray(x))])) for x in ims]
        shots.append((title, ims))
    # --- a la misma escala (AC-192 g): las 5 clases de lado a 6 px/m; las que aún no tienen receta, como hoy
    strip = []
    for k in ('sloop', 'schooner', 'brig', 'frigate', 'line'):
        if k == cls:
            for f in ('gb', 'es'): strip.append((f"{NAME[k]} {fam_adj(k, f)}", new[f], k))
        elif k == 'line':
            for f in ('gb', 'es'): strip.append((f"Navío {'británico' if f == 'gb' else 'español'} (aprobado)", receta(os.path.join(nav, 'cadena', f'navio_{f}_lod0.npz'), os.path.join(nav, 'cadena', 'comp', f'atlas_{f}.ktx2')), k))
        else:
            strip.append((f'{NAME[k]} de hoy', hoy(k), k))
    sims = []
    for lab, m, k in strip:
        fr = LC.fit([m], 0, 90, 6.0, pad=8); sims.append((lab, LC.shot(m, 0, 90, 6.0, fr, sky=fr[3], SS=3), k))
    # --- medidas
    MED = {}
    for f in ('gb', 'es'):
        idf = f'{cls}_{f}'; tri = lambda p: len(np.load(p)['p']) // 3
        mo = RT.need(os.path.join(comp, f'{idf}_meshopt.glb'), f'{idf}_meshopt.glb'); kt = os.path.join(comp, f'atlas_{idf}.ktx2')
        geo = LC.glb_geo(mo); k_ = open(kt, 'rb').read()
        CC_AT = CC.AT.R
        rule, resp, base = respaldo_rule(os.path.join(CAD, f'{idf}_lod0.npz'), os.path.join(CAD, f'atlas_{idf}.png'), os.path.join(CAD, f'atlas_{idf}_out.png'), kt, CC_AT)
        png = rule[resp]['data']; z = np.load(os.path.join(CAD, f'{idf}_lod0.npz')); P = z['p'].reshape(-1, 3, 3); R = z['r'].reshape(-1, 3)
        hull = P[(R > 0.5).all(1)].reshape(-1, 3)
        MED[f] = dict(lod0=tri(os.path.join(CAD, f'{idf}_lod0.npz')), lod1=tri(os.path.join(CAD, f'{idf}_lod1.npz')),
                      caja_casco=dict(eslora=round(float(np.ptp(hull[:, 2])), 3), manga=round(float(np.ptp(hull[:, 0])), 3)),
                      resp=resp, resp_B=len(png), geo_B=len(geo), entrada_B=len(geo) + len(png), entrada_gz=gz(geo + png),
                      ktx_B=len(k_), ktx_gz=gz(k_), total_B=len(geo) + len(png) + len(k_), dE_atlas=base,
                      respaldo={kk: {x: y for x, y in v.items() if x != 'data'} for kk, v in rule.items()})
    rig = CC.rig_json(cls); MED['hoy'] = dict(lod0=len(rig['lod0']['pos']) // 9, lod1=len(rig['lod1']['pos']) // 9)
    MED['rasgos'] = {k: traits(k) for k in ('sloop', 'schooner', 'brig', 'frigate')}
    json.dump(MED, open(os.path.join(CAD, f'{cls}-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    print('medidas', json.dumps({f: {k: v for k, v in MED[f].items() if k != 'respaldo'} for f in ('gb', 'es')}, ensure_ascii=False), MED['hoy'])

    # --- lámina
    GAP = 30; colw = max(max(im.width for im in ims) for _, ims in shots)
    SW = max(40 + 3 * colw + 2 * GAP + 40, sum(im.width for _, im, _ in sims) + GAP * (len(sims) - 1) + 80, 1600)
    sheet = Image.new('RGB', (SW, 9000), PAPER); d = ImageDraw.Draw(sheet)

    def para(x, y, txt, f, fill, width, lh):
        line = ''
        for w in txt.split(' '):
            t = (line + ' ' + w).strip()
            if d.textlength(t, font=f) > width and line: d.text((x, y), line, font=f, fill=fill); y += lh; line = w
            else: line = t
        if line: d.text((x, y), line, font=f, fill=fill); y += lh
        return y

    c = CC.CLASES[cls]; sh = SHIP[cls]
    pide = 'nada, porque es el barco con el que se empieza' if not sh['price'] else (f"{mil(sh['price'])} de oro" + (f", nivel {sh['lvl']} ({sh['rank_label']})" if sh.get('lvl') else ''))
    d.text((40, 22), f'{NAME[cls]} en las 2 familias, con la receta de los Navíos', font=font(32), fill=INK)
    y = para(40, 66, f'La misma receta que aprobaste con los Navíos, la Cañonera y el Capitán: casco con curvas, sombras horneadas, más sol en la madera, sombra en el agua y los colores de cada familia. A la izquierda, {art(cls)} {NAME[cls]} de hoy; en el centro, la británica, y a la derecha, la española. Lo que se aprueba: cómo se ven las 2, para construirlas.', font(17, 500), INK, SW - 80, 26) + 14
    for title, ims in shots:
        d.text((40, y), title, font=font(19), fill=TITLE); y += 30
        for j, lab in enumerate(('Hoy', 'Británica', 'Española')): d.text((40 + j * (colw + GAP), y), lab, font=font(15), fill=SOFT)
        y += 24
        for j, im in enumerate(ims): sheet.paste(im, (40 + j * (colw + GAP), y))
        y += max(im.height for im in ims) + 26
    d.text((40, y), 'A la misma escala que los demás barcos del jugador (de lado, 6 px por metro), con su eslora y lo que piden', font=font(19), fill=TITLE); y += 32
    x = 40; hmax = max(im.height for _, im, _ in sims)
    for lab, im, k in sims:
        sheet.paste(im, (x, y + hmax - im.height)); s_ = SHIP[k]
        d.text((x, y + hmax + 8), lab, font=font(15), fill=INK if k == cls else SOFT)
        req = 'gratis' if not s_['price'] else (f"{mil(s_['price'])} de oro" + (f" · nivel {s_['lvl']}" if s_.get('lvl') else ''))
        d.text((x, y + hmax + 30), f"{s_['L']} m · {req}", font=font(14, 500), fill=SOFT); x += im.width + GAP
    y += hmax + 70
    tr = MED['rasgos']; me = tr[cls]
    others = [k for k in ('sloop', 'schooner', 'brig', 'frigate') if k != cls]
    def diff(a, b):
        out = []
        if max(a['S1'], b['S1']) / min(a['S1'], b['S1']) >= 1.25: out.append('la eslora')
        if a['S2'] != b['S2']: out.append('los palos')
        if a['S3'] != b['S3']: out.append('las velas bajas')
        if a['S4'] != b['S4']: out.append('los castillos')
        return out
    lect = [f"Frente {'al' if k in MASC else 'a la'} {NAME[k]}: {', '.join(diff(me, tr[k])) or 'NADA'} (se piden 2)." for k in others]
    g, e = MED['gb'], MED['es']
    BLOCKS = [
        ('Qué cambia', INK, [
            'El casco: curvas, la popa con caída y el espejo con su fila de ventanas; la española, con tallas doradas, un friso de volutas y la camareta o los castillos 40 cm más altos.',
            'Los colores de cada familia: la británica, azul marino con la franja blanca y la Union Jack; la española, roja con la franja dorada, la rojigualda y la cruz de Borgoña en las velas cuadras.',
            'La bandera de la familia va en el pico de la vela de popa, y en la cubierta hay obenques, estays, el timón y, según la clase, botes, cabrestante y faroles.']),
        ('Lo que no cambia', INK, [
            f"Lo que dice qué barco es: {c['L']:g} × {c['B']:g} m, {me['S2']} {'palo' if me['S2'] == 1 else 'palos'} con las velas de hoy, {me['S4']} y una franja de portas con {len(CC.rig_json(cls)['recipe']['cannonZ'])} cañones por banda. Las 2 familias son iguales en eso, y las velas siguen claras: es un barco del jugador.",
            f'Lo que pide: {pide}.']),
        ('Lo que cuesta', INK, [
            f"Triángulos de cerca y de lejos: británica {mil(g['lod0'])} y {mil(g['lod1'])}, española {mil(e['lod0'])} y {mil(e['lod1'])} (hoy, {mil(MED['hoy']['lod0'])} y {mil(MED['hoy']['lod1'])}; tope, {mil(TOPE['lod0'])} y {mil(TOPE['lod1'])}).",
            f"Lo que se descarga: británica {dec(g['total_B'] / 1000, 1)} KB y española {dec(e['total_B'] / 1000, 1)} KB, con la textura de {c['A']} × {c['A']}. Las 8 combinaciones que faltan tienen que sumar {dec(TOPE['suma'] / 1000, 1)} KB como mucho, para que las 10 quepan en 1 MB; esta clase se lleva el {dec(100 * (g['total_B'] + e['total_B']) / TOPE['suma'], 0)} %.",
            f"El casco mide {dec(g['caja_casco']['eslora'], 2)} y {dec(e['caja_casco']['eslora'], 2)} m de largo (se pide {c['L']:g} m ± 2 %)."]),
        ('La clase se distingue de las otras 3, en las 2 familias', INK if all(len(diff(me, tr[k])) >= 2 for k in others) else RED, lect),
        ('En contra', RED, [
            'Las velas son las de hoy: el detalle nuevo está en el casco, la cubierta y la bandera. De lejos, lo que más se ve sigue siendo el aparejo.',
            *(['La textura va a 512 × 512 para que quepa la descarga: con el zoom más cercano se ve algo menos nítida que la de los Navíos, que va a 1024 × 1024.'] if c['A'] < 1024 else [])]),
    ]
    for title, colr, lines in BLOCKS:
        d.text((40, y), title, font=font(19), fill=TITLE if colr == INK else RED); y += 30
        for ln in lines:
            d.text((56, y), '·', font=font(16, 500), fill=colr); y = para(74, y, ln, font(16, 500), colr, SW - 120, 24) + 2
        y += 12
    sheet = sheet.crop((0, 0, SW, y + 20))
    out = os.path.join(RT.OUT, f'D95-{FILE[cls]}.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

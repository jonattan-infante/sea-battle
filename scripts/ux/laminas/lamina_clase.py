# Uso (desde la raíz del repo), con la misma UX_OUT, tras: clase_curvo.py <clase> → blender_curvo.py <clase>_{gb,es} bake
# 1024 64 → clase_curvo.py <clase> otra vez (el atlas con la oclusión y el de 512²) → blender_curvo.py <clase>_{gb,es}
# export → gltf-transform meshopt (→ $UX_OUT/cadena/comp/<clase>_<fam>_meshopt.glb) y `ktx create` desde el atlas de 512²
# como en comprimir_cadena.sh, desde atlas_<clase>_<fam>_out.png (→ comp/atlas_<clase>_<fam>.ktx2); y en $UX_OUT/cadena los aparejos de hoy de las 4 clases
# (<clase>-rig.json, code/export-rig-clases.ts):
#   python3 -I scripts/ux/laminas/lamina_clase.py <clase> <origen_navios>  →  $UX_OUT/D95-<nombre>.png y
#   $UX_OUT/cadena/<clase>-medidas.json
#   <origen_navios>: la UX_OUT del turno de la entrega de los Navíos (E3), para ponerlos a la misma escala
# Las clases ya aprobadas (APROBADAS) salen con la receta, desde sus npz y KTX2 en la misma $UX_OUT/cadena. La Fragata se
# compara además con el Capitán (capitan_curvo.py: capitan_lod0.npz, comp/atlas_capitan.ktx2 y captain-rig.json en
# $UX_OUT/cadena), y la Goleta, con la Balandra y el Bergantín. Si las 2 combinaciones de la clase pasan de lo que les deja
# producto, mide la salida (a) con las KTX2 comp/atlas_<clase>_<fam>_a512.ktx2 y _a256.ktx2 (paleta acotada a 512 y 256).
# Lámina de una clase del jugador en las 2 familias con la receta de D91 (AC-195; formato de AC-192 g) para Jonattan: la de
# hoy (el generador del juego) y las 2 nuevas, con la luz del juego y la textura KTX2 como la ve la GPU (render por software
# de scripts/ux/mapa/render_tex.py), como en el juego en 1440×900, de lado, desde arriba, la popa de cerca y en el móvil en
# color y en grises; a la misma escala que las otras 4 clases y los Navíos aprobados, con su eslora y lo que pide (nivel y
# oro). Mide los triángulos, la caja del casco (AS-V03), el peso con la KTX2 fuera (ASSET-SPEC §13, 4c) y el respaldo de
# D90 (4b). Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, json, math, io, gzip, struct, subprocess
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
import capitan_curvo as CPC  # solo sus pisos (TIERS), para S4
import numpy as np
from PIL import Image, ImageDraw

CAD = os.path.join(RT.OUT, 'cadena'); M = RTX.M; WHITE = np.ones((4, 4, 3))
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42)
NAME = {'sloop': 'Balandra', 'schooner': 'Goleta', 'brig': 'Bergantín', 'frigate': 'Fragata', 'line': 'Navío de línea'}
FILE = {'sloop': 'balandra', 'schooner': 'goleta', 'brig': 'bergantin', 'frigate': 'fragata'}
MASC = ('brig', 'line', 'captain')  # el Bergantín, el Navío y el Capitán: el artículo y la familia en masculino
NOMBRE = {**NAME, 'line': 'Navío', 'captain': 'Capitán'}  # en las frases de los rasgos
def art(k): return 'el' if k in MASC else 'la'
def fam_adj(k, f): return ('británico' if f == 'gb' else 'español') if k in MASC else ('británica' if f == 'gb' else 'española')
SHIP = {s['id']: s for s in T.SHIPS}
TOPE = dict(lod0=5000, lod1=1200, suma=630930)  # producto, 2026-10-19 (BACKLOG :359): el de las familias y la suma de las 8
APROBADAS = ('sloop', 'brig')  # láminas D95 aprobadas por Jonattan el 2026-10-20 (ART-DIRECTION, fila D95)
BALANDRA_B, BERGANTIN_B = 110955, 139308; APROBADO_B = BALANDRA_B + BERGANTIN_B  # sus 4 combinaciones (ASSET-SPEC §13, turnos K)
# lo que producto deja a la clase (2026-10-20): a la Fragata, lo que queda menos lo que pesa el Bergantín, para la Goleta
OBJETIVO = {'frigate': TOPE['suma'] - APROBADO_B - BERGANTIN_B}
# salida (a) de producto (BACKLOG :361): la KTX2 más comprimida vale si no baja de lo peor de los Navíos aprobados, en
# fidelidad del atlas (D91: 30,5 dB) y en la diferencia de la propia KTX2 con el atlas en el render del juego (D90: 1,01)
# (producto, 2026-10-20: también el p95, 4,9, porque el error de la ETC1S está en los cantos finos; y el respaldo se mide
# siempre contra la base de la KTX2 de la receta, para que la (a) no lo relaje)
PSNR_MIN, BASE_MAX, P95_MAX = 30.5, 1.01, 4.9
# con quién se enseña en el móvil, en color y en grises (producto, 2026-10-20: la Fragata, también con cada clase del jugador)
PEERS = {'frigate': ('line', 'captain', 'sloop', 'brig', 'schooner'), 'schooner': ('sloop', 'brig')}
# px por metro del atlas que se entrega (BACKLOG :361: ≥ 18): el de la tabla de producto, y lo medido en este turno sobre la
# malla (densidad()) en las regiones de la medida de :361: casco, cubierta y castillos
DENS = {'sloop': 26.2, 'schooner': 21.0, 'brig': 19.1, 'frigate': 20.9}
DENS_REG = ('hull', 'deck', 'q0', 'q1', 'q2', 'fc')
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


def respaldo_rule(npz, atlas_png, out_png, ktx, regions, base_ref=None):
    """La de lamina_capitan.py (D90, 4b), con la base frente al atlas que se comprime (out_png: el de 512² en 3 de las 4
    clases) y no frente al de 1024² pintado, que sumaría a la base lo que se pierde al reducir. Los candidatos salen del
    de 1024², con sus regiones. base_ref: la base media con la que se compara el respaldo, si no es la de esta KTX2 (la
    salida (a) usa la de la receta). Devuelve también la base media y su p95."""
    z = np.load(npz); P, UVc, Cc, _ = RTX.clip_below_water(z['p'], z['t'], z['c'])
    ref = RS.mips(Image.fromarray(np.round(M.lin2srgb(A.ktx_lin(ktx)) * 255).astype(np.uint8)))
    gb_ = RS.gbuffer(P, UVc, Cc, 6.20 / 0.7, 55, 135); r_img, r_cov = RS.shade(gb_, ref); full = r_cov > 0.999
    base = RS.dE(RS.shade(gb_, RS.mips(Image.open(out_png).convert('RGB')))[0], r_img, full); out = {}
    for n in (128, 256):
        im = RS.fallback(atlas_png, n, regions=regions, size=1024)
        for fmt in ('png', 'jpeg'):
            data = RS.encode(im, fmt); e = RS.dE(RS.shade(gb_, RS.mips(Image.open(io.BytesIO(data)).convert('RGB')))[0], r_img, full)
            out[f'{fmt}{n}'] = dict(bytes=len(data), dE=round(e[0], 3), dE_medio=round(e[2], 3), pasa=bool(e[0] <= 1.5 * (base[0] if base_ref is None else base_ref) and e[2] <= 1.0), data=data)
    ok = [k for k, v in out.items() if v['pasa']]
    return out, (min(ok, key=lambda k: out[k]['bytes']) if ok else 'png256'), round(base[0], 3), round(base[1], 3)


def gray(img): return img.convert('L').convert('RGB')
def gz(b): return len(gzip.compress(b, 9, mtime=0))
def mil(n): return f'{n:,}'.replace(',', '\u00a0')  # «6 000», con espacio duro (la Barlow lo trae sin tinta)
def dec(x, k): return f'{x:.{k}f}'.replace('.', ',')
def num(x): return f'{x:g}'.replace('.', ',')  # «4,4», con coma decimal


def s4(tiers, house):
    """S4 de ART-DIRECTION §9.2 desde los pisos del casco de la receta (curvo.py): 2 o más a popa son la popa alta."""
    if house: return 'camareta de popa'
    aft = sum(t['kind'] == 'aft' for t in tiers); fore = any(t['kind'] == 'fore' for t in tiers)
    base = 'popa alta' if aft >= 2 else ('alcázar' if aft else '')
    return ' y '.join(x for x in (base, 'castillo de proa' if fore else '') if x) or 'ninguno'


def rig_rec(k, nav):
    if k == 'line': return json.load(open(RT.need(os.path.join(nav, 'piloto', 'navio-rig.json'), 'navio-rig.json')))['recipe']
    if k == 'captain': return json.load(open(RT.need(os.path.join(CAD, 'captain-rig.json'), 'captain-rig.json')))['recipe']
    return CC.rig_json(k)['recipe']


def traits(k, nav):
    """Los rasgos de silueta de ART-DIRECTION §9.2, desde la receta del generador (palos, foques, perfil y franjas) y los
    pisos del casco de la de D91 (iguales en las 2 familias en las 4 clases; en el Navío, popa alta en las 2)."""
    rec = rig_rec(k, nav)
    seq = ''.join('Q' if not mt.get('gaff') and not mt.get('lateen') else ('G' if mt.get('gaff') else 'T') for mt in sorted(rec['masts'], key=lambda mt: -mt['z']))
    if k == 'line': tiers, house = CC.NCV.TIERS['gb'], None
    elif k == 'captain': tiers, house = CPC.TIERS, None
    else: tiers, house = CC.CLASES[k]['tiers'], CC.CLASES[k]['house']
    return dict(S1=rec['L'], S2=len(rec['masts']), S3='·'.join(seq), S4=s4(tiers, house), S5=rec['profile'],
                S6=len(rec.get('bands') or []) or (1 if rec['cannonZ'] else 0), foques=len(rec.get('jibs') or []))


def diff(a, b):
    """Los rasgos que separan 2 barcos (AD-37): la eslora cuenta desde 1,25 veces."""
    out = []
    if max(a['S1'], b['S1']) / min(a['S1'], b['S1']) >= 1.25: out.append('la eslora')
    if a['S2'] != b['S2']: out.append('los palos')
    if a['S3'] != b['S3']: out.append('las velas bajas')
    if a['S4'] != b['S4']: out.append('los castillos')
    if a['S5'] != b['S5']: out.append('el perfil del casco')
    if a['S6'] != b['S6']: out.append(f"{a['S6']} {'fila' if a['S6'] == 1 else 'filas'} de portas frente a {b['S6']}")  # GDD :387
    if (a['foques'] > 0) != (b['foques'] > 0): out.append('los foques')
    return out


def fallos(x):
    """Los límites de la salida (a) que no pasa una variante, con los decimales que hacen falta para verlo (4,904 y no 4,9)."""
    fam = {'gb': 'la británica', 'es': 'la española'}; out = []
    for key, lim, k, mas, nom, pide in (('psnr', PSNR_MIN, 2, True, ' dB de fidelidad', f'se piden {dec(PSNR_MIN, 1)} dB o más'),
                                        ('dE_atlas', BASE_MAX, 3, False, ' de media', f'se pide {dec(BASE_MAX, 2)} o menos'),
                                        ('dE_atlas_p95', P95_MAX, 3, False, ' en los cantos', f'se pide {dec(P95_MAX, 1)} o menos')):
        bad = [f for f in ('gb', 'es') if (x[f][key] < lim if mas else x[f][key] > lim)]
        if bad: out.append(f"{'las 2 dan' if len(bad) == 2 else fam[bad[0]] + ' da'} {' y '.join(dec(x[f][key], k) for f in bad)}{nom} ({pide})")
    return '; '.join(out) or 'pasa los límites de calidad'


def alto(k):
    """Lo que sube la española (clase_curvo.T_ES) en la clase k, para «Qué cambia»."""
    c = CC.CLASES[k]; kinds = [t['kind'] for t in c['tiers']]
    p = [x for x, ok in (('la camareta', bool(c['house'])), ('el alcázar', 'aft' in kinds), ('el castillo de proa', 'fore' in kinds)) if ok]
    if not p: return ''
    adj = 'altos' if len(p) > 1 else ('alta' if p[0].startswith('la ') else 'alto')
    return f", y con {' y '.join(p)} {dec(CC.T_ES * 100, 0)} cm más {adj}"


def cubierta(k):
    """Lo que lleva la cubierta de la clase k (clase_curvo.CLASES), para «Qué cambia»: el de esta clase, no el de todas."""
    c = CC.CLASES[k]; nb, cz = len(c['boats']), c['carronades']; ed = {t['kind']: t['edge'] for t in c['tiers']}
    p = ['obenques', 'estays', 'el timón'] + (['la campana'] if c['bell'] is not None else []) + ([f"{nb} {'bote' if nb == 1 else 'botes'}"] if nb else [])
    if c['capstan'] is not None: p.append('el cabrestante')
    if cz:  # las últimas, para que su «en el alcázar y el castillo de proa» no se lea con lo que viene detrás
        donde = [x for x, ok in (('el alcázar', any(z <= ed.get('aft', -1e9) for z in cz)), ('el castillo de proa', any(z >= ed.get('fore', 1e9) for z in cz))) if ok]
        p.append('carronadas' + (f" en {' y '.join(donde)}" if donde else ''))
    nl = c['lanterns']
    return ', '.join(p[:-1]) + f" y {p[-1]}; en la popa, {nl} {'farol' if nl == 1 else 'faroles'}"


def psnr(a, b): return round(float(10 * np.log10(255 ** 2 / ((a.astype(float) - b.astype(float)) ** 2).mean())), 2)  # lamina_cadena.py
def densidad(npz, A):
    """px por metro del atlas de lado A, por región de AT: la mediana (por área) de la dirección más estrecha de cada
    triángulo con textura (el menor valor singular de la aplicación metros → px de su UV)."""
    z = np.load(npz); P = z['p'].reshape(-1, 3, 3).astype(float); UV = z['t'].reshape(-1, 3, 2).astype(float)
    e1, e2 = P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]; n = np.cross(e1, e2); nn = np.linalg.norm(n, axis=1)
    ok = nn / 2 > 1e-4; e1, e2, n, nn, UV = e1[ok], e2[ok], n[ok], nn[ok], UV[ok]
    u = e1 / np.linalg.norm(e1, axis=1)[:, None]; w = np.cross(n / nn[:, None], u)
    X = np.stack([np.stack([(e1 * u).sum(1), (e1 * w).sum(1)], 1), np.stack([(e2 * u).sum(1), (e2 * w).sum(1)], 1)], 1)
    Tp = (UV[:, 1:] - UV[:, :1]) * A; J = np.linalg.solve(X, Tp); sv = np.linalg.svd(J, compute_uv=False).min(1)
    c = UV.mean(1); cx, cy = c[:, 0] * CC.AT.A, (1 - c[:, 1]) * CC.AT.A; area = nn / 2; out = {}
    for name, (x0, y0, rw, rh) in CC.AT.R.items():
        m = (cx >= x0) & (cx < x0 + rw) & (cy >= y0) & (cy < y0 + rh) & (sv > 0.5)
        if m.sum() < 3: continue
        o = np.argsort(sv[m]); cw = np.cumsum(area[m][o]); out[name] = round(float(sv[m][o][np.searchsorted(cw, cw[-1] / 2)]), 1)
    return out


def manga(k): return CC.CLASES[k]['B'] if k in CC.CLASES else CC.NCV.B  # la del Navío, de navio_curvo.py


def ktx_rgb(k):  # el nivel 0 de la KTX2 en sRGB de 8 bits, como ktx_rgb de lamina_cadena.py (el método de los 30,5 dB)
    w, h = struct.unpack('<II', open(k, 'rb').read()[20:28]); raw = k[:-5] + '.psnr.raw'
    subprocess.run(['ktx', 'extract', '--transcode', 'rgba8', '--level', '0', '--raw', k, raw], check=True, capture_output=True)
    a = np.frombuffer(open(raw, 'rb').read(), np.uint8).reshape(h, w, 4)[..., :3].copy(); os.remove(raw); return a


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
    # --- a la misma escala (AC-192 g): las 5 clases de lado a 6 px/m; las aprobadas con la receta, y las que aún no la
    # tienen, como hoy
    def modelo(k, f):
        if k == cls: return new[f]
        if k == 'line': return receta(os.path.join(nav, 'cadena', f'navio_{f}_lod0.npz'), os.path.join(nav, 'cadena', 'comp', f'atlas_{f}.ktx2'))
        if k == 'captain': return receta(os.path.join(CAD, 'capitan_lod0.npz'), os.path.join(comp, 'atlas_capitan.ktx2'))
        if k in APROBADAS: return receta(os.path.join(CAD, f'{k}_{f}_lod0.npz'), os.path.join(comp, f'atlas_{k}_{f}.ktx2'))
        return hoy(k)
    def rotulo(k, f):
        if k == 'captain': return 'Capitán pirata (aprobado)'
        if k == 'line': return f"Navío {'británico' if f == 'gb' else 'español'} (aprobado)"
        if k == cls: return f'{NAME[k]} {fam_adj(k, f)}'
        return f"{NAME[k]} {fam_adj(k, f)} ({'aprobado' if k in MASC else 'aprobada'})"
    strip = []
    for k in ('sloop', 'schooner', 'brig', 'frigate', 'line'):
        if k == cls or k == 'line' or k in APROBADAS:
            for f in ('gb', 'es'): strip.append((rotulo(k, f), modelo(k, f), k))
        else:
            strip.append((f'{NAME[k]} de hoy', hoy(k), k))
    sims = []
    for lab, m, k in strip:
        fr = LC.fit([m], 0, 90, 6.0, pad=8); sims.append((lab, LC.shot(m, 0, 90, 6.0, fr, sky=fr[3], SS=3), k))
    # --- en el móvil, junto a las que más se le parecen (producto, 2026-10-20), en color y en grises
    pares = []
    if cls in PEERS:
        PM = [(rotulo(cls, f), new[f]) for f in ('gb', 'es')]
        for k in PEERS[cls]:
            if k == 'captain': PM.append((rotulo(k, 'gb'), modelo(k, 'gb')))
            elif k == 'line' or k in APROBADAS: PM += [(rotulo(k, f), modelo(k, f)) for f in ('gb', 'es')]
            else: PM.append((f'{NAME[k]} de hoy', hoy(k)))
        fr = LC.fit([m for _, m in PM], 55, 135, 2.8, pad=10)
        for lab, m in PM:
            x = LC.shot(m, 55, 135, 2.8, fr, SS=4); pares.append((lab, Image.fromarray(np.hstack([np.asarray(x), np.asarray(gray(x))]))))
    # --- medidas
    MED = {}
    for f in ('gb', 'es'):
        idf = f'{cls}_{f}'; tri = lambda p: len(np.load(p)['p']) // 3
        mo = RT.need(os.path.join(comp, f'{idf}_meshopt.glb'), f'{idf}_meshopt.glb'); kt = os.path.join(comp, f'atlas_{idf}.ktx2')
        geo = LC.glb_geo(mo); k_ = open(kt, 'rb').read()
        CC_AT = CC.AT.R
        rule, resp, base, base95 = respaldo_rule(os.path.join(CAD, f'{idf}_lod0.npz'), os.path.join(CAD, f'atlas_{idf}.png'), os.path.join(CAD, f'atlas_{idf}_out.png'), kt, CC_AT)
        png = rule[resp]['data']; z = np.load(os.path.join(CAD, f'{idf}_lod0.npz')); P = z['p'].reshape(-1, 3, 3); R = z['r'].reshape(-1, 3)
        hull = P[(R > 0.5).all(1)].reshape(-1, 3)
        MED[f] = dict(lod0=tri(os.path.join(CAD, f'{idf}_lod0.npz')), lod1=tri(os.path.join(CAD, f'{idf}_lod1.npz')),
                      caja_casco=dict(eslora=round(float(np.ptp(hull[:, 2])), 3), manga=round(float(np.ptp(hull[:, 0])), 3)),
                      resp=resp, resp_B=len(png), geo_B=len(geo), entrada_B=len(geo) + len(png), entrada_gz=gz(geo + png),
                      ktx_B=len(k_), ktx_gz=gz(k_), total_B=len(geo) + len(png) + len(k_), dE_atlas=base, dE_atlas_p95=base95,
                      respaldo={kk: {x: y for x, y in v.items() if x != 'data'} for kk, v in rule.items()},
                      psnr=psnr(ktx_rgb(kt), np.asarray(Image.open(os.path.join(CAD, f'atlas_{idf}_out.png')).convert('RGB'))),
                      densidad=densidad(os.path.join(CAD, f'{idf}_lod0.npz'), CC.CLASES[cls]['A']))
    rig = CC.rig_json(cls); MED['hoy'] = dict(lod0=len(rig['lod0']['pos']) // 9, lod1=len(rig['lod1']['pos']) // 9)
    COMP = [k for k in ('sloop', 'schooner', 'brig', 'frigate', 'line') if k != cls] + (['captain'] if cls == 'frigate' else [])
    MED['rasgos'] = {k: traits(k, nav) for k in [cls] + COMP}
    # --- peso frente a lo que deja producto y, si se pasa, la salida (a): la KTX2 con la paleta más acotada, dentro de la
    # calidad de los Navíos aprobados (PSNR_MIN, BASE_MAX); la lámina enseña la clase con la KTX2 de la receta
    MED['dos_B'] = MED['gb']['total_B'] + MED['es']['total_B']
    dm = {f: min((v, r) for r, v in MED[f]['densidad'].items() if r in DENS_REG) for f in ('gb', 'es')}
    MED['densidad_min'] = min(dm.values())  # (px/m, región)
    MED['densidad_tabla'] = DENS[cls]
    if cls in OBJETIVO:
        MED['objetivo_B'] = OBJETIVO[cls]; MED['salida_a'] = {}
        # con la textura a la mitad de lado, para «En contra»: si se pasa, bajarla no vale si deja < 18 px/m (BACKLOG :361)
        MED['densidad_mitad'] = min(min((v, r) for r, v in densidad(os.path.join(CAD, f'{cls}_{f}_lod0.npz'), CC.CLASES[cls]['A'] // 2).items() if r in DENS_REG) for f in ('gb', 'es'))
        if MED['dos_B'] > OBJETIVO[cls]:
            for v in ('a512', 'a256'):
                fam = {}
                for f in ('gb', 'es'):
                    idf = f'{cls}_{f}'; kv = RT.need(os.path.join(comp, f'atlas_{idf}_{v}.ktx2'), f'atlas_{idf}_{v}.ktx2')
                    rule, resp, base, base95 = respaldo_rule(os.path.join(CAD, f'{idf}_lod0.npz'), os.path.join(CAD, f'atlas_{idf}.png'), os.path.join(CAD, f'atlas_{idf}_out.png'), kv, CC.AT.R, base_ref=MED[f]['dE_atlas'])
                    kb = os.path.getsize(kv); pv = psnr(ktx_rgb(kv), np.asarray(Image.open(os.path.join(CAD, f'atlas_{idf}_out.png')).convert('RGB')))
                    fam[f] = dict(ktx_B=kb, resp=resp, resp_B=rule[resp]['bytes'], total_B=MED[f]['geo_B'] + rule[resp]['bytes'] + kb, psnr=pv, dE_atlas=base,
                                  dE_atlas_p95=base95, dentro=bool(pv >= PSNR_MIN and base <= BASE_MAX and base95 <= P95_MAX))
                fam['dos_B'] = fam['gb']['total_B'] + fam['es']['total_B']; fam['dentro'] = fam['gb']['dentro'] and fam['es']['dentro']
                MED['salida_a'][v] = fam
    json.dump(MED, open(os.path.join(CAD, f'{cls}-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    print('medidas', json.dumps({f: {k: v for k, v in MED[f].items() if k != 'respaldo'} for f in ('gb', 'es')}, ensure_ascii=False), MED['hoy'])

    # --- lámina
    GAP = 30; colw = max(max(im.width for im in ims) for _, ims in shots)
    def pie(k):
        s_ = SHIP[k]; req = 'gratis' if not s_['price'] else ((f"Nivel {s_['lvl']} · " if s_.get('lvl') else '') + f"{mil(s_['price'])} oro")  # el formato de producto
        return f"{num(s_['L'])} × {num(manga(k))} m · {req}"
    slot = [math.ceil(max(im.width, font(15).getlength(lab), font(14, 500).getlength(pie(k)))) for lab, im, k in sims]  # el rótulo no pisa al vecino
    SW = max(40 + 3 * colw + 2 * GAP + 40, sum(slot) + GAP * (len(sims) - 1) + 80, 1600)
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
    hechas = ', '.join(['los Navíos', 'la Cañonera', 'el Capitán'] + [f'{art(k)} {NAME[k]}' for k in APROBADAS][:-1]) + f' y {art(APROBADAS[-1])} {NAME[APROBADAS[-1]]}'
    y = para(40, 66, f'La misma receta que aprobaste con {hechas}: casco con curvas, sombras horneadas, más sol en la madera, sombra en el agua y los colores de cada familia. A la izquierda, {art(cls)} {NAME[cls]} de hoy; en el centro, la británica, y a la derecha, la española. Lo que se aprueba: cómo se ven las 2, para construirlas.', font(17, 500), INK, SW - 80, 26) + 14
    for title, ims in shots:
        d.text((40, y), title, font=font(19), fill=TITLE); y += 30
        for j, lab in enumerate(('Hoy', 'Británica', 'Española')): d.text((40 + j * (colw + GAP), y), lab, font=font(15), fill=SOFT)
        y += 24
        for j, im in enumerate(ims): sheet.paste(im, (40 + j * (colw + GAP), y))
        y += max(im.height for im in ims) + 26
    d.text((40, y), 'A la misma escala que los demás barcos del jugador (de lado, 6 px por metro), con su eslora y lo que piden', font=font(19), fill=TITLE); y += 32
    x = 40; hmax = max(im.height for _, im, _ in sims)
    for (lab, im, k), w in zip(sims, slot):
        sheet.paste(im, (x, y + hmax - im.height))
        d.text((x, y + hmax + 8), lab, font=font(15), fill=INK if k == cls else SOFT)
        d.text((x, y + hmax + 30), pie(k), font=font(14, 500), fill=SOFT); x += w + GAP
    y += hmax + 70
    if pares:
        q = [f'{art(k)} {NOMBRE[k]}' for k in PEERS[cls]]; q[0] = ('al ' + q[0][3:]) if q[0].startswith('el ') else 'a ' + q[0]  # «junto al Navío»
        quien = ', '.join(q[:-1]) + f' y {q[-1]}'
        d.text((40, y), f'En el móvil, en 390×844 (2,8 px por metro), junto {quien}: en color y en grises', font=font(19), fill=TITLE); y += 32
        x = 40; hmax = max(im.height for _, im in pares)
        for lab, im in pares:
            if x + im.width > SW - 40: x = 40; y += hmax + 40
            sheet.paste(im, (x, y)); d.text((x, y + hmax + 6), lab, font=font(14, 500), fill=SOFT); x += im.width + GAP
        y += hmax + 46
    tr = MED['rasgos']; me = tr[cls]
    def frente(k):
        t = f"Frente {'al' if k in MASC else 'a la'} {NOMBRE[k]}: {', '.join(diff(me, tr[k])) or 'NADA'} (se piden 2)."
        return t + (' Además es de otra facción: velas negras y casco oscuro.' if k == 'captain' else '')
    lect = [frente(k) for k in COMP]
    g, e = MED['gb'], MED['es']
    resto, mitad = TOPE['suma'] - APROBADO_B - MED['dos_B'], c['A'] // 2  # lo que quedaría a la Goleta, y la textura a la mitad
    peso = []
    if cls in OBJETIVO:
        dos, obj = MED['dos_B'], MED['objetivo_B']
        peso.append(f"Las 2 juntas pesan {dec(dos / 1000, 1)} KB. Para que a la Goleta le quede lo mismo que pesa el Bergantín, las 2 {NAME[cls]}s tienen que quedarse en {dec(obj / 1000, 1)} KB como mucho" + ('.' if dos <= obj else f': se pasan en {mil(dos - obj)} bytes.'))
        if dos > obj:
            ok = {v: x for v, x in MED['salida_a'].items() if x['dentro']}
            if ok:
                v = min(ok, key=lambda v: ok[v]['dos_B']); x = ok[v]
                peso.append(f"Con la textura más comprimida (paleta acotada a {v[1:]} en lugar de 1024; es la salida (a) de producto), pesarían {dec(x['dos_B'] / 1000, 1)} KB" + (', y caben.' if x['dos_B'] <= obj else f", y seguirían pasándose en {mil(x['dos_B'] - obj)} bytes.") + f" Su fidelidad es de {dec(x['gb']['psnr'], 1)} y {dec(x['es']['psnr'], 1)} dB, y se aparta del dibujo {dec(x['gb']['dE_atlas'], 2)} y {dec(x['es']['dE_atlas'], 2)} de media y {dec(x['gb']['dE_atlas_p95'], 1)} y {dec(x['es']['dE_atlas_p95'], 1)} en los cantos: no baja de lo peor de los Navíos aprobados ({dec(PSNR_MIN, 1)} dB, {dec(BASE_MAX, 2)} y {dec(P95_MAX, 1)}).")
            else:
                x5, x2 = MED['salida_a']['a512'], MED['salida_a']['a256']
                def pesa(x): return f"las 2 pesarían {dec(x['dos_B'] / 1000, 1)} KB" + (', y cabrían' if x['dos_B'] <= obj else f", {mil(x['dos_B'] - obj)} bytes de más")
                peso.append(f"La salida (a) de producto, comprimir más la textura, no se aplica. Con la paleta acotada a 512, {fallos(x5)}; y {pesa(x5)}. Con la de 256, {fallos(x2)}; y {pesa(x2)}.")
            peso.append('Se decide con la medida del piloto. Las vistas de arriba llevan la textura de la receta: lo que apruebas es cómo se ve, no el presupuesto.')
    BLOCKS = [
        ('Qué cambia', INK, [
            f'El casco: curvas, la popa con caída y el espejo con su fila de ventanas; la española, con tallas doradas y un friso de volutas{alto(cls)}.',
            'Los colores de cada familia: la británica, azul marino con la franja blanca y la Union Jack; la española, roja con la franja dorada, la rojigualda y la cruz de Borgoña en las velas cuadras.',
            f'La bandera de la familia va en el pico de la vela de popa, y en la cubierta hay {cubierta(cls)}.']),
        ('Lo que no cambia', INK, [
            f"Lo que dice qué barco es: {num(c['L'])} × {num(c['B'])} m, {me['S2']} {'palo' if me['S2'] == 1 else 'palos'} con las velas de hoy, {me['S4']} y una franja de portas con {len(CC.rig_json(cls)['recipe']['cannonZ'])} cañones por banda. Las 2 familias son iguales en eso, y las velas siguen claras: es un barco del jugador.",
            f'Lo que pide: {pide}.']),
        ('Lo que cuesta', INK, [
            f"Triángulos de cerca y de lejos: británica {mil(g['lod0'])} y {mil(g['lod1'])}, española {mil(e['lod0'])} y {mil(e['lod1'])} (hoy, {mil(MED['hoy']['lod0'])} y {mil(MED['hoy']['lod1'])}; tope, {mil(TOPE['lod0'])} y {mil(TOPE['lod1'])}).",
            f"Lo que se descarga: británica {dec(g['total_B'] / 1000, 1)} KB y española {dec(e['total_B'] / 1000, 1)} KB, con la textura de {c['A']} × {c['A']} ({dec(MED['densidad_min'][0], 1)} px por metro en lo más estrecho, medido en este turno; se piden 18). Las 8 combinaciones que faltan tienen que sumar {dec(TOPE['suma'] / 1000, 1)} KB como mucho, para que las 10 quepan en 1 MB; esta clase se lleva el {dec(100 * (g['total_B'] + e['total_B']) / TOPE['suma'], 0)} %.",
            *peso,
            (f"Las 2 miden {dec(g['caja_casco']['eslora'], 2)} m de largo" if dec(g['caja_casco']['eslora'], 2) == dec(e['caja_casco']['eslora'], 2) else f"El casco mide {dec(g['caja_casco']['eslora'], 2)} y {dec(e['caja_casco']['eslora'], 2)} m de largo") + f" (se pide {num(c['L'])} m ± 2 %)."]),
        ('Lo que la distingue de los demás, igual en las 2 familias', INK if all(len(diff(me, tr[k])) >= 2 for k in COMP) else RED, lect),
        ('En contra', RED, [
            'Las velas son las de hoy: el detalle nuevo está en el casco, la cubierta y la bandera. De lejos, lo que más se ve sigue siendo el aparejo.',
            *(['La textura va a 512 × 512 para que quepa la descarga: con el zoom más cercano se ve algo menos nítida que la de los Navíos, que va a 1024 × 1024.'] if c['A'] < 1024 else []),
            *([f"Pesa más de lo previsto: las 2 se pasan en {dec((MED['dos_B'] - MED['objetivo_B']) / 1000, 1)} KB de lo que dejaría a la Goleta lo mismo que al Bergantín. Si la medida del piloto no sube la cota de 1 MB, a las 2 Goletas les quedarían {dec(resto / 1000, 1)} KB, {'menos' if resto < BALANDRA_B else 'más'} de lo que pesan las 2 Balandras ({dec(BALANDRA_B / 1000, 1)} KB). " + (f"Bajarle la textura no lo arregla: a {mitad} × {mitad} se queda en {dec(MED['densidad_mitad'][0], 1)} px por metro, y se piden 18." if MED['densidad_mitad'][0] < 18 else f"Con la textura a {mitad} × {mitad} se quedaría en {dec(MED['densidad_mitad'][0], 1)} px por metro (se piden 18), y se vería algo menos nítida.")] if cls in OBJETIVO and MED['dos_B'] > MED['objetivo_B'] else [])]),
    ]
    for title, colr, lines in BLOCKS:
        d.text((40, y), title, font=font(19), fill=TITLE if colr == INK else RED); y += 30
        for ln in lines:
            d.text((56, y), '·', font=font(16, 500), fill=colr); y = para(74, y, ln, font(16, 500), colr, SW - 120, 24) + 2
        y += 12
    sheet = sheet.crop((0, 0, SW, y + 20))
    out = os.path.join(RT.OUT, f'D95-{FILE[cls]}.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

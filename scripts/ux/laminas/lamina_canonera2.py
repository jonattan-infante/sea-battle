# Uso (desde la raíz del repo), con la misma UX_OUT, tras: canonera2_curvo.py → blender_curvo.py canonera2 bake 1024 64 →
# canonera2_curvo.py otra vez (compone el atlas con la oclusión) → blender_curvo.py canonera2 export → gltf-transform meshopt y
# `ktx create` como en comprimir_cadena.sh (→ $UX_OUT/cadena/comp/canonera2_meshopt.glb y atlas_canonera2.ktx2); con la
# Cañonera de D91 (canonera_lod{0,1}.npz y atlas_canonera.png de canonera_curvo.py) en $UX_OUT/cadena para el «antes»:
#   python3 -I scripts/ux/laminas/lamina_canonera2.py  →  $UX_OUT/D91-canonera-v2.png
# Lámina de la Cañonera rehecha para Jonattan (2026-10-18: «la parte trasera y las verlas siguen tienendo una geometria
# incorrecta. Iteremos con esta inspiración», la de Anno 1800; se toma la dirección, no el dibujo): la de la lámina de la
# cadena de arte (D91) y la nueva, con las mismas 5 palancas (curvas, oclusión horneada, luz de forma, sombra en el agua y
# color con textura) y la luz del juego (render por software de scripts/ux/mapa/render_tex.py), en las vistas de esa lámina
# más la popa de cerca. Mide los triángulos, el peso con la KTX2 fuera (ASSET-SPEC §13, 4c) y el respaldo de D90 (4b).
# Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, json, math, io, gzip, struct, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'mapa'), os.path.join(HERE, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import tienda as T
import render_tex as RTX
import curvo as CV
import respaldo as RS, canonera_curvo as CCV, canonera2_curvo as C2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CAD = os.path.join(RT.OUT, 'cadena')
SEA = np.array([26, 95, 134.0]) / 255; SKYC = np.array([226, 234, 239.0]) / 255
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42)
M = RTX.M; WHITE = np.ones((4, 4, 3)); Yv = np.array([0.2126, 0.7152, 0.0722])
# la luz de forma y la sombra en el agua de la receta (palancas 3 y 1), con los valores de lamina_cadena.py
KS = 2.0
_up_h = M.IH * float(M.SKY @ Yv); _up_s = M.IS * float(M.SUN @ Yv) * M.LD[1]
KH = (_up_h + _up_s - KS * _up_s) / _up_h
SH_A, SH_BLUR = 0.40, 0.25


def font(px, w=600): return T.font(px, w)
def lin_img(path): return RTX.srgb2lin(np.asarray(Image.open(RT.need(path, path)).convert('RGB'), float))


def npz_model(path, atlas):
    d = np.load(RT.need(path, path)); P = d['p']; N = CV.vertex_normals(P)
    C4 = np.concatenate([d['c'], d['r'][:, None]], axis=1)
    Pc, UVc, C4c, Nc = RTX.clip_below_water(P, d['t'], C4, N)
    return dict(P=Pc, UV=UVc, C=C4c[:, :3], S=C4c[:, 3], N=Nc, A=atlas)


def Ry(hd):
    ps = math.radians(hd); c, s = math.cos(ps), math.sin(ps); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def fit(mods, th, hd, ppm, pad=16):
    P = np.concatenate([m['P'] for m in mods]) @ Ry(hd).T; TH = math.radians(th)
    x = P[:, 0] * ppm; y = -(P[:, 1] * math.cos(TH) - P[:, 2] * math.sin(TH)) * ppm
    return int(math.ceil(x.max() - x.min())) + 2 * pad, int(math.ceil(y.max() - y.min())) + 2 * pad, pad - x.min(), pad - y.min()


def shot(mod, th, hd, ppm, fr, sky=None, SS=3):
    W, H, ox, oy = fr
    rgb, cov = RTX.render(mod['P'], mod['UV'], mod['C'], mod['A'], ppm, W, H, ox, oy, th, SS=SS, N=mod['N'], heading_deg=hd, S=mod['S'], kh=KH, ks=KS)
    bg = np.tile(SEA, (H, W, 1))
    if sky is not None: bg[:int(sky)] = SKYC
    Ll = Ry(hd).T @ M.LD; Ps = mod['P'] - (mod['P'][:, 1:2] / Ll[1]) * Ll[None, :]; Ps[:, 1] = 0.005
    _, sc = RTX.render(Ps, np.full((len(Ps), 2), 0.5), np.ones((len(Ps), 3)), WHITE, ppm, W, H, ox, oy, th, SS=2, heading_deg=hd)
    sm = np.asarray(Image.fromarray((sc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(SH_BLUR * ppm)), float) / 255
    bg = M.lin2srgb(RTX.srgb2lin(bg * 255) * (1 - SH_A * sm[..., None]))
    img = rgb + bg * (1 - cov[..., None])
    return Image.fromarray(np.clip(np.round(img * 255), 0, 255).astype(np.uint8))


def gray(img): return img.convert('L').convert('RGB')
def gz(b): return len(gzip.compress(b, 9, mtime=0))


def glb_geo(path):
    """El GLB sin los bytes de sus imágenes (lo que queda con la KTX2 fuera y antes del respaldo)."""
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; js = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
    cuts = sorted((bin0 + js['bufferViews'][im['bufferView']].get('byteOffset', 0), js['bufferViews'][im['bufferView']]['byteLength']) for im in js['images'])
    keep, pos = [], 0
    for o, n in cuts: keep.append(b[pos:o]); pos = o + n
    keep.append(b[pos:]); return b''.join(keep)


def ktx_img(path):
    w, h = struct.unpack('<II', open(path, 'rb').read()[20:28]); raw = path[:-5] + '.raw'
    subprocess.run(['ktx', 'extract', '--transcode', 'rgba8', '--level', '0', '--raw', path, raw], check=True, capture_output=True)
    a = np.frombuffer(open(raw, 'rb').read(), np.uint8).reshape(h, w, 4)[..., :3].copy(); os.remove(raw); return Image.fromarray(a)


def respaldo_rule(npz, atlas_png, ktx, regions):
    """La regla de D90 (ASSET-SPEC §13, 4b; la de respaldo_curvo.py) para un barco: el lado y el formato más ligeros que pasan."""
    from render_tex import clip_below_water
    z = np.load(npz); P, UVc, Cc, _ = clip_below_water(z['p'], z['t'], z['c'])
    ref = RS.mips(ktx_img(ktx)); gb_ = RS.gbuffer(P, UVc, Cc, 6.20 / 0.7, 55, 135); r_img, r_cov = RS.shade(gb_, ref); full = r_cov > 0.999
    base = RS.dE(RS.shade(gb_, RS.mips(Image.open(atlas_png)))[0], r_img, full); out = {}
    for n in (128, 256):
        im = RS.fallback(atlas_png, n, regions=regions, size=1024)
        for fmt in ('png', 'jpeg'):
            data = RS.encode(im, fmt); e = RS.dE(RS.shade(gb_, RS.mips(Image.open(io.BytesIO(data)).convert('RGB')))[0], r_img, full)
            out[f'{fmt}{n}'] = dict(bytes=len(data), dE=round(e[0], 3), dE_medio=round(e[2], 3), pasa=bool(e[0] <= 1.5 * base[0] and e[2] <= 1.0), data=data)
    ok = [k for k, v in out.items() if v['pasa']]
    return out, (min(ok, key=lambda k: out[k]['bytes']) if ok else 'png256'), round(base[0], 3)


# --- modelos: la de D91 («antes») y la nueva, cada una con su atlas
old = npz_model(os.path.join(CAD, 'canonera_lod0.npz'), lin_img(os.path.join(CAD, 'atlas_canonera.png')))
new = npz_model(os.path.join(CAD, 'canonera2_lod0.npz'), lin_img(os.path.join(CAD, 'atlas_canonera2.png')))
PAIR = (old, new)
VIEWS = [  # (título, th, rumbo, px/m, cielo)
    ('Como en el juego, en 1440×900 (cámara a 55°, 6,2 px por metro)', 55, 135, 6.2, False),
    ('La popa de cerca, en 3/4 desde atrás (14 px por metro)', 24, 160, 14.0, False),
    ('De lado (9 px por metro)', 0, 90, 9.0, True),
    ('Desde arriba (9 px por metro)', 90, 90, 9.0, False),
    ('En el móvil, en 390×844 (2,8 px por metro), en color y en grises', 55, 135, 2.8, False),
]
shots = []
for title, th, hd, ppm, sky in VIEWS:
    fr = fit(PAIR, th, hd, ppm)
    sk = fr[3] if sky else None
    a, b = (shot(m, th, hd, ppm, fr, sky=sk, SS=4 if ppm < 4 else 3) for m in PAIR)
    if ppm < 4: a, b = Image.fromarray(np.hstack([np.asarray(a), np.asarray(gray(a))])), Image.fromarray(np.hstack([np.asarray(b), np.asarray(gray(b))]))
    shots.append((title, a, b))

# --- medidas
comp = os.path.join(CAD, 'comp'); mo = os.path.join(comp, 'canonera2_meshopt.glb'); kt = os.path.join(comp, 'atlas_canonera2.ktx2')
tri = lambda p: len(np.load(p)['p']) // 3
MED = dict(lod0=tri(os.path.join(CAD, 'canonera2_lod0.npz')), lod1=tri(os.path.join(CAD, 'canonera2_lod1.npz')),
           lod0_d91=tri(os.path.join(CAD, 'canonera_lod0.npz')), lod1_d91=tri(os.path.join(CAD, 'canonera_lod1.npz')))
if os.path.exists(mo) and os.path.exists(kt):
    geo = glb_geo(mo); k = open(kt, 'rb').read()
    rule, resp, base = respaldo_rule(os.path.join(CAD, 'canonera2_lod0.npz'), os.path.join(CAD, 'atlas_canonera2.png'), kt, C2.AT.R)
    png = rule[resp]['data']
    MED.update(resp=resp, resp_B=len(png), entrada_B=len(geo) + len(png), entrada_gz=gz(geo + png), ktx_B=len(k), ktx_gz=gz(k),
               respaldo={kk: {x: y for x, y in v.items() if x != 'data'} for kk, v in rule.items()}, dE_atlas=base)
json.dump(MED, open(os.path.join(CAD, 'canonera2-medidas.json'), 'w'), indent=1, ensure_ascii=False)
print('medidas', json.dumps({k: v for k, v in MED.items() if k != 'respaldo'}, ensure_ascii=False))

# --- lámina
GAP = 30; colw = max(max(a.width, b.width) for _, a, b in shots)
SW = max(40 + 2 * colw + GAP + 40, 1400)
sheet = Image.new('RGB', (SW, 6000), PAPER); d = ImageDraw.Draw(sheet)
d.text((40, 22), 'Cañonera pirata, segunda vuelta: la popa y las velas', font=font(32), fill=INK)
def para(x, y, txt, f, fill, width, lh):
    """Texto partido en líneas de `width` px; devuelve la y de debajo."""
    line = ''
    for w in txt.split(' '):
        t = (line + ' ' + w).strip()
        if d.textlength(t, font=f) > width and line: d.text((x, y), line, font=f, fill=fill); y += lh; line = w
        else: line = t
    if line: d.text((x, y), line, font=f, fill=fill); y += lh
    return y


y = para(40, 66, 'Lo que pediste: la parte de atrás y las velas tenían una forma incorrecta; inspiración, la Cañonera pirata de Anno 1800 (se toma la idea, no el dibujo). A la izquierda, la de la lámina anterior; a la derecha, la nueva. Las dos con la luz, la sombra y el agua del juego.', font(17, 500), SOFT, SW - 80, 26) + 22
for title, a, b in shots:
    d.text((40, y), title, font=font(19), fill=TITLE); y += 30
    d.text((40, y), 'Antes', font=font(15), fill=SOFT); d.text((40 + colw + GAP, y), 'Nueva', font=font(15), fill=SOFT); y += 24
    sheet.paste(a, (40, y)); sheet.paste(b, (40 + colw + GAP, y)); y += max(a.height, b.height) + 26
def mil(n): return f'{n:,}'.replace(',', '.')
def dec(x, k): return f'{x:.{k}f}'.replace('.', ',')
RESP_TXT = {'jpeg128': 'JPEG de 128 × 128', 'png128': 'PNG de 128 × 128', 'jpeg256': 'JPEG de 256 × 256', 'png256': 'PNG de 256 × 256'}
cost = [f'{mil(MED["lod0"])} triángulos de cerca y {mil(MED["lod1"])} de lejos (la anterior: {mil(MED["lod0_d91"])} y {mil(MED["lod1_d91"])}; el tope de un barco enemigo es 2.000 y 700).']
if 'entrada_gz' in MED:
    cost.append(f'Al entrar en su zona baja {dec(MED["entrada_gz"] / 1000, 1)} KB (la forma con una versión pequeña de la textura, {RESP_TXT[MED["resp"]]}); la textura buena, {dec(MED["ktx_gz"] / 1000, 1)} KB, llega después.')
BLOCKS = [
    ('Qué cambia', INK, [
        'La popa: un alcázar en 2 escalones, alto y recto, con barandillas, timón y bitácora; el espejo casi vertical, con 3 ventanas encendidas, un panel tallado con la calavera y un farol colgado.',
        'Los costados del alcázar llevan paneles tallados en dorado y 2 ventanas por lado; una moldura dorada recorre el casco bajo la borda.',
        'Las velas: 2 palos con velas altas y en punta hacia arriba (el extremo de la verga pasa del tope del palo), más un foque hasta un bauprés de 6 m. Lona negra en 3 tonos, con remiendos, y una calavera desvaída en la mayor.',
        'La bandera pirata ondea en el pico de la vela mayor.']),
    ('Lo que no cambia', INK, [
        'El tamaño (28 × 10 m), el casco negro y bajo con la franja roja, la cubierta clara y los 6 cañones por banda sobre cubierta con el mortero en el centro: lo que la distingue del pirata y del capitán.',
        'Las 5 mejoras de la receta que aprobaste con los Navíos: curvas, sombras pintadas en la textura, luz que marca la forma, sombra en el agua y color con textura. Las velas pasan a llevar textura, dentro de la misma mejora del color.']),
    ('Lo que cuesta', INK, cost),
    ('En contra', RED, [
        'La popa alta tapa una parte de la cubierta de popa cuando el barco navega hacia la cámara.',
        'La calavera de la vela es un recurso de pirata muy visto; ayuda a leer que es enemiga, pero no es original.',
        'Las velas son más grandes que antes: de lado, el barco se ve más alto.',
        'Son velas de cuchillo, a lo largo del barco: cuando navega hacia la cámara o se aleja de ella, se ven de canto y casi desaparecen; la batería y la popa siguen diciendo qué barco es.',
        'Falta medir, con la prueba de siempre, que en grises y a la escala del móvil se siga distinguiendo del pirata y del capitán.']),
]
for title, colr, lines in BLOCKS:
    d.text((40, y), title, font=font(19), fill=TITLE if colr == INK else RED); y += 30
    for ln in lines:
        d.text((56, y), '·', font=font(16, 500), fill=colr); y = para(74, y, ln, font(16, 500), colr, SW - 120, 24) + 2
    y += 12
sheet = sheet.crop((0, 0, SW, y + 20))
out = os.path.join(RT.OUT, 'D91-canonera-v2.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

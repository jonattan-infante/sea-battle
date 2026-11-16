# Uso (desde la raíz del repo), con la misma UX_OUT, tras: navio_curvo.py y canonera_curvo.py → blender_curvo.py bake (las 3) →
# navio_curvo.py y canonera_curvo.py otra vez (componen el atlas con la oclusión) → blender_curvo.py export → comprimir_cadena.sh:
#   python3 -I scripts/ux/laminas/lamina_cadena.py  →  $UX_OUT/cadena-prueba.png
# Lámina de prueba de la cadena de arte para Jonattan (respuesta de realismo, 2026-10-18; notas de familias, «se sienten
# planos como 2d… más curvas… colores más asociados a su familia», y del I2, «más detalles en los barcos pirata»): el
# Navío británico, el español y la Cañonera (el pirata que eligió producto, porque frena el candidato), hoy y con las 5 palancas, con la luz del juego (render por software de
# scripts/ux/mapa/render_tex.py). Hoy = el piloto de D80 (UX_PILOTO, por defecto $UX_OUT/piloto: navio_{gb,es}_lod{0,1}.npz
# y atlas_{gb,es}.png de navio.py) y la Cañonera del generador del juego (canonera-rig.json). Escribe en UX_OUT, nunca en
# docs/game/art/. No corre en la CI.
import sys, os, json, math, io, gzip, struct, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'mapa'), os.path.join(HERE, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import tienda as T
import render_tex as RTX
import curvo as CV
import respaldo as RS, navio_curvo as NCV, canonera_curvo as CCV  # el respaldo de D90 y las regiones de cada atlas
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CAD = os.path.join(RT.OUT, 'cadena'); PIL_ = os.environ.get('UX_PILOTO', os.path.join(RT.OUT, 'piloto'))
SEA = np.array([26, 95, 134.0]) / 255; SKYC = np.array([226, 234, 239.0]) / 255
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42)
M = RTX.M; WHITE = np.ones((4, 4, 3)); Yv = np.array([0.2126, 0.7152, 0.0722])
# luz de forma (palanca 3): en el casco, el sol ×KS y la hemisférica ×KH, con KH tal que una cara que mira arriba (la
# cubierta, calibrada en D62) recibe la misma luz que hoy; los costados quedan con más contraste. Las velas no cambian (D8).
KS = 2.0
_up_h = M.IH * float(M.SKY @ Yv); _up_s = M.IS * float(M.SUN @ Yv) * M.LD[1]
KH = (_up_h + _up_s - KS * _up_s) / _up_h
SH_A, SH_BLUR = 0.40, 0.25  # sombra en el agua (palanca 1): el agua pierde un 40 % de luz, borde suave de 0,25 m


def font(px, w=600): return T.font(px, w)
def lin_img(path): return RTX.srgb2lin(np.asarray(Image.open(RT.need(path, path)).convert('RGB'), float))


def model(P, UV, C, R, atlas):
    P = np.asarray(P, float); N = CV.vertex_normals(P)
    C4 = np.concatenate([np.asarray(C, float), np.asarray(R, float)[:, None]], axis=1)
    Pc, UVc, C4c, Nc = RTX.clip_below_water(P, np.asarray(UV, float), C4, N)
    return dict(P=Pc, UV=UVc, C=C4c[:, :3], S=C4c[:, 3], N=Nc, A=atlas)


def npz_model(path, atlas):
    d = np.load(RT.need(path, path)); return model(d['p'], d['t'], d['c'], d['r'], atlas)


def json_model(d):
    P = np.array(d['pos']).reshape(-1, 3); C = np.array(d['col']).reshape(-1, 3); R = np.array(d['rim']) if d.get('rim') else np.zeros(len(P))
    return model(P, np.full((len(P), 2), 0.5), C, R, WHITE)


PR = json.load(open(RT.need(os.path.join(CAD, 'canonera-rig.json'), 'canonera-rig.json (code/export-rig-npc.ts gunboat)')))


def tex(name):
    """El atlas «nuevo» tal como lo pinta la GPU: el nivel 0 de la KTX2 de comprimir_cadena.sh, descodificado con
    `ktx extract`; sin ella, el PNG sin comprimir."""
    k = os.path.join(CAD, 'comp', f'{name}.ktx2')
    return RTX.srgb2lin(ktx_rgb(k).astype(float)) if os.path.exists(k) else lin_img(os.path.join(CAD, f'{name}.png'))


def ktx_rgb(k):
    w, h = struct.unpack('<II', open(k, 'rb').read()[20:28]); raw = k[:-5] + '.raw'
    subprocess.run(['ktx', 'extract', '--transcode', 'rgba8', '--level', '0', '--raw', k, raw], check=True, capture_output=True)
    a = np.frombuffer(open(raw, 'rb').read(), np.uint8).reshape(h, w, 4)[..., :3].copy(); os.remove(raw); return a


def psnr(a, b): return round(float(10 * np.log10(255 ** 2 / ((a.astype(float) - b.astype(float)) ** 2).mean())), 2)


def ktx_gt(png_path, dst):
    """La KTX2 de `gltf-transform etc1s` por defecto (comprimir_cadena.sh, sin acotar la paleta): su tamaño en B."""
    subprocess.run(['ktx', 'create', '--generate-mipmap', '--encode', 'basis-lz', '--assign-tf', 'srgb', '--assign-primaries', 'bt709',
                    '--format', 'R8G8B8_SRGB', '--threads', '1', png_path, dst], check=True, capture_output=True)
    n = os.path.getsize(dst); os.remove(dst); return n


MOD = {}
for fam in ('gb', 'es'):
    for l in (0, 1):
        MOD[f'{fam}_hoy_{l}'] = npz_model(os.path.join(PIL_, f'navio_{fam}_lod{l}.npz'), lin_img(os.path.join(PIL_, f'atlas_{fam}.png')))
        MOD[f'{fam}_new_{l}'] = npz_model(os.path.join(CAD, f'navio_{fam}_lod{l}.npz'), tex(f'atlas_{fam}'))
    MOD[f'{fam}_base_0'] = dict(MOD[f'{fam}_new_0'], A=tex(f'atlas_{fam}_base'))
for l in (0, 1):
    MOD[f'can_hoy_{l}'] = json_model(PR[f'lod{l}'])
    MOD[f'can_new_{l}'] = npz_model(os.path.join(CAD, f'canonera_lod{l}.npz'), tex('atlas_canonera'))


def Ry(hd):
    ps = math.radians(hd); c, s = math.cos(ps), math.sin(ps); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def shadow_P(mod, hd):
    """La malla proyectada sobre el agua (y = 0) en la dirección de la luz, en el marco del barco."""
    Ll = Ry(hd).T @ M.LD; P = mod['P'] - (mod['P'][:, 1:2] / Ll[1]) * Ll[None, :]; P[:, 1] = 0.005; return P


def fit(mods, th, hd, ppm, pad=16):
    P = np.concatenate([m['P'] for m in mods]) @ Ry(hd).T; TH = math.radians(th)
    x = P[:, 0] * ppm; y = -(P[:, 1] * math.cos(TH) - P[:, 2] * math.sin(TH)) * ppm
    return int(math.ceil(x.max() - x.min())) + 2 * pad, int(math.ceil(y.max() - y.min())) + 2 * pad, pad - x.min(), pad - y.min()


def shot(mod, th, hd, ppm, fr, shape=False, shadow=None, sky=None, SS=3):
    W, H, ox, oy = fr
    rgb, cov = RTX.render(mod['P'], mod['UV'], mod['C'], mod['A'], ppm, W, H, ox, oy, th, SS=SS, N=mod['N'], heading_deg=hd,
                          S=mod['S'] if shape else None, kh=KH if shape else 1.0, ks=KS if shape else 1.0)
    bg = np.tile(SEA, (H, W, 1))
    if sky is not None: bg[:int(sky)] = SKYC
    if shadow is not None:
        Ps = shadow_P(shadow, hd)
        _, sc = RTX.render(Ps, np.full((len(Ps), 2), 0.5), np.ones((len(Ps), 3)), WHITE, ppm, W, H, ox, oy, th, SS=2, heading_deg=hd)
        sm = np.asarray(Image.fromarray((sc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(SH_BLUR * ppm)), float) / 255
        bg = M.lin2srgb(RTX.srgb2lin(bg * 255) * (1 - SH_A * sm[..., None]))
    img = rgb + bg * (1 - cov[..., None])
    return Image.fromarray(np.clip(np.round(img * 255), 0, 255).astype(np.uint8))


# ---- medidas. Bytes en B (1 KB = 1 000 B, BACKLOG AC-193); «gz» = con gzip -9, como las cifras de ASSET-SPEC §13
GZ = 9
KTX_JSON = 120   # lo que añade al JSON la textura KTX2 (KHR_texture_basisu) frente a la WebP del export; lo calibra el piloto
RESP_JSON = 107  # lo que añade el respaldo de D90 además de su PNG: 94 344 − 88 580 − 5 657 y 106 372 − 98 208 − 8 057
ENTRY = 120000   # el barco propio al entrar, en bytes que viajan: con gzip, que es como el servidor sirve los .glb
def ntri(path): return len(np.load(path)['p']) // 3
def gz(b): return len(gzip.compress(b, GZ))


def glb_parts(path):
    """El GLB sin los bytes de sus imágenes (geometría, JSON y cabeceras) y la lista de las imágenes."""
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; js = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
    cuts = sorted((bin0 + js['bufferViews'][im['bufferView']].get('byteOffset', 0), js['bufferViews'][im['bufferView']]['byteLength'])
                  for im in js.get('images', []) if 'bufferView' in im)
    keep, imgs, pos = [], [], 0
    for o, n in cuts: keep.append(b[pos:o]); imgs.append(b[o:o + n]); pos = o + n
    keep.append(b[pos:]); return b''.join(keep), imgs


RESP = os.environ.get('UX_RESP', 'png256')  # el respaldo de D90 de los barcos nuevos: png256, jpeg256, png128 o jpeg128
RESP_TXT = {'jpeg128': 'JPEG de 128²', 'png128': 'PNG de 128²', 'jpeg256': 'JPEG de 256²', 'png256': 'PNG de 256²'}
D90_JSON = os.path.join(CAD, 'respaldo-d90.json')


def resp_of(id_):
    """El respaldo de cada barco: con respaldo-d90.json (respaldo_curvo.py) y sin UX_RESP, el más ligero de los que pasan
    la regla de D90 (ASSET-SPEC §13, paso 4b); si no, el de UX_RESP."""
    if 'UX_RESP' in os.environ or not os.path.exists(D90_JSON): return RESP
    d = json.load(open(D90_JSON))[id_]; ok = [k for k in RESP_TXT if d[k]['pasa']]
    return min(ok, key=lambda k: d[k]['bytes']) if ok else 'png256'
def respaldo_png(atlas_path, regions, resp='png256'):
    n = int(resp[-3:]); return RS.encode(RS.fallback(atlas_path, n, regions=regions, size=1024), resp[:-3])


def estimate(geo, ktx, png):
    """GLB final (meshopt + KTX2 + respaldo de D90) estimado desde el meshopt con WebP del export. Con gzip, la parte
    añadida al JSON cuenta entera. «entry» es todo lo que baja el barco; «first» es lo que espera la entrada (BACKLOG
    `:419`, 2026-10-18): la geometría con el respaldo como única imagen, sin la KTX2, que baja después en su archivo."""
    glb = len(geo) + len(ktx) + KTX_JSON
    return dict(glb=glb, entry=glb + len(png) + RESP_JSON, entry_gz=gz(geo + ktx + png) + KTX_JSON + RESP_JSON, png=len(png), png_gz=gz(png), ktx=len(ktx),
                first=len(geo) + len(png), first_gz=gz(geo + png))


def measures():
    out = {}; comp = os.path.join(CAD, 'comp'); rd = lambda p: open(p, 'rb').read()
    REG = {'gb': NCV.AT.R, 'es': NCV.AT.R, 'canonera': CCV.AT.R}
    for id_, fam in (('navio_gb', 'gb'), ('navio_es', 'es'), ('canonera', 'canonera')):
        r = dict(lod0=ntri(os.path.join(CAD, f'{id_}_lod0.npz')), lod1=ntri(os.path.join(CAD, f'{id_}_lod1.npz')))
        mo, kt, k0p = (os.path.join(comp, f) for f in (f'{id_}_meshopt.glb', f'atlas_{fam}.ktx2', f'atlas_{fam}_base.ktx2'))
        if all(os.path.exists(p) for p in (mo, kt, k0p)):
            geo, _ = glb_parts(mo); k, k0 = rd(kt), rd(k0p)
            r['resp'] = resp_of(id_); r.update(estimate(geo, k, respaldo_png(os.path.join(CAD, f'atlas_{fam}.png'), REG[fam], r['resp'])))
            r['alt'] = {rs: estimate(geo, k, respaldo_png(os.path.join(CAD, f'atlas_{fam}.png'), REG[fam], rs))['entry_gz'] for rs in ('png256', 'jpeg256', 'png128', 'jpeg128')}
            r.update(geo=len(geo), geo_gz=gz(geo), ktx_gz=gz(k), ktx_base=len(k0), ktx_base_gz=gz(k0),
                     psnr=psnr(ktx_rgb(kt), np.asarray(Image.open(os.path.join(CAD, f'atlas_{fam}.png')).convert('RGB'))))
        bj = os.path.join(CAD, f'bake_{id_}.json')
        if os.path.exists(bj): r['bake'] = json.load(open(bj))
        out[id_] = r
    # el piloto de D80 («hoy» de los Navíos): sus GLB medidos (ASSET-SPEC §13) y el mismo método sobre su export, que calibra
    real = {'gb': (88580, 34561), 'es': (98208, 41441)}
    out['piloto'] = {}
    for fam in ('gb', 'es'):
        p = dict(lod0=ntri(os.path.join(PIL_, f'navio_{fam}_lod0.npz')), lod1=ntri(os.path.join(PIL_, f'navio_{fam}_lod1.npz')),
                 real_glb=real[fam][0], real_ktx=real[fam][1])
        rc = os.path.join(PIL_, 'comp', f'ship_line_{fam}_respaldo256.glb')
        if os.path.exists(rc):
            b_ = rd(rc); p.update(real_entry=len(b_), real_entry_gz=gz(b_))
            i_ = b_.find(b'\xabKTX 20\xbb')  # la KTX2 dentro del GLB medido: lo que el piloto dejaría fuera de la espera
            if i_ > 0: n_ = real[fam][1]; p.update(real_first=len(b_) - n_, real_first_gz=gz(b_[:i_] + b_[i_ + n_:]))
        mo, kt = os.path.join(comp, f'piloto_{fam}_meshopt.glb'), os.path.join(comp, f'piloto_{fam}.ktx2')
        if os.path.exists(mo) and os.path.exists(kt):
            geo, _ = glb_parts(mo); k = rd(kt)
            p.update(estimate(geo, k, respaldo_png(os.path.join(PIL_, f'atlas_{fam}.png'), RS.REG)))
            p.update(geo=len(geo), geo_gz=gz(geo), ktx_gz=gz(k))
        ex = os.path.join(PIL_, f'ship_line_{fam}.glb')  # la textura del export de D80, que salió en WebP con pérdida
        if os.path.exists(ex):
            _, ims = glb_parts(ex); tmp = os.path.join(comp, f'piloto_{fam}_webp.png'); Image.open(io.BytesIO(ims[0])).convert('RGB').save(tmp)
            p['ktx_desde_webp'] = ktx_gt(tmp, tmp[:-4] + '.ktx2'); os.remove(tmp)
        out['piloto'][fam] = p
    out['canonera_hoy'] = dict(lod0=len(PR['lod0']['pos']) // 9, lod1=len(PR['lod1']['pos']) // 9)
    out['luz'] = dict(KS=KS, KH=round(KH, 3))
    return out


if __name__ == '__main__':
    MS = measures(); print(json.dumps(MS, ensure_ascii=False))
    SW = 2200; sheet = Image.new('RGB', (SW, 9000), PAPER); d = ImageDraw.Draw(sheet)
    def label(x, y, t, c=SOFT, f=None): d.text((x, y), t, font=f or font(15, 500), fill=c)
    def frame(im, x, y, c=(120, 110, 95)): sheet.paste(im, (x, y)); d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=c, width=1)
    def para(x, y, w, t, f=None, c=INK, lh=22):
        f = f or font(15, 500); line = ''
        for wd in t.split():
            s_ = (line + ' ' + wd).strip()
            if d.textlength(s_, font=f) > w: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
            else: line = s_
        d.text((x, y), line, font=f, fill=c); return y + lh
    def row(title_, panels, y, gap=18):
        """panels: [(imagen, rótulo, subrótulo[, coste])] en una fila, de izquierda a derecha; los textos se parten al
        ancho de su imagen."""
        d.text((40, y), title_, font=font(19), fill=TITLE); y += 32; x = 40; bottom = y
        for pn in panels:
            im, cap, sub = pn[:3]; cost = pn[3] if len(pn) > 3 else None
            frame(im, x, y); ty = para(x, y + im.height + 6, im.width, cap, f=font(16, 600), lh=22)
            if sub: ty = para(x, ty, im.width, sub, f=font(15, 500), c=SOFT, lh=20)
            if cost: ty = para(x, ty, im.width, cost, f=font(15, 600), c=TITLE, lh=20)
            x += im.width + gap; bottom = max(bottom, ty)
        return bottom + 26

    d.text((40, 22), 'Barcos con más volumen: prueba de la cadena de arte', font=font(32), fill=INK)
    for i, t in enumerate(('Respuesta a «los barcos se sienten planos como 2D, quiero más curvas y colores más asociados a su familia» y a «más detalles en los barcos pirata».',
                           'Hoy = la lámina de familias que pediste cambiar, y la Cañonera del juego. Nuevo = las 5 mejoras juntas. Dibujado con la luz del juego, sin construir aún.')):
        label(40, 66 + 24 * i, t, f=font(17, 500))
    y = 130
    NAME = {'gb': 'Navío británico', 'es': 'Navío español', 'can': 'Cañonera pirata'}
    # A. a tamaño real de una Retina
    for k in ('gb', 'es', 'can'):
        hoy, new, new1 = MOD[f'{k}_hoy_0'], MOD[f'{k}_new_0'], MOD[f'{k}_new_1']
        fr = fit([hoy, new], 55, 135, 12.4, pad=40)
        a = shot(hoy, 55, 135, 12.4, fr); b = shot(new, 55, 135, 12.4, fr, shape=True, shadow=new1)
        title_ = f'{NAME[k]}, como en el juego en una pantalla Retina de 1440×900 (zoom normal: 12,4 px por metro, píxeles reales)' if k == 'gb' else NAME[k]
        y = row(title_, [(a, 'Hoy' if k == 'can' else 'Hoy (lámina de familias)', None), (b, 'Nuevo', 'Curvas, sombras pintadas, luz de forma, sombra en el agua y colores de familia')], y)
    # B. palanca por palanca, con lo que cuesta cada una en la descarga (sin comprimir y con gzip, que es lo que viaja)
    fx = lambda v: f'{v:,.0f}'.replace(',', ' ')
    kb = lambda b: f'{b / 1000:,.1f} KB'.replace(',', ' ').replace('.', ',')
    kbd = lambda b: ('+' if b >= 0 else '−') + kb(abs(b))
    fx1 = lambda v: f'{v:.1f}'.replace('.', ',')
    g, e, p = MS['navio_gb'], MS['navio_es'], MS['canonera']; pg, pe = MS['piloto']['gb'], MS['piloto']['es']
    HAS = all('entry' in r for r in (g, e, p, pg, pe))
    def lever(r, q):
        """Bytes de cada palanca frente al piloto, el mismo método a los dos lados: (sin comprimir, con gzip)."""
        return dict(curvas=(r['geo'] - q['geo'] + r['ktx_base'] - q['ktx'] + r['png'] - q['png'], r['geo_gz'] - q['geo_gz'] + r['ktx_base_gz'] - q['ktx_gz'] + r['png_gz'] - q['png_gz']),
                    ao=(r['ktx'] - r['ktx_base'], r['ktx_gz'] - r['ktx_base_gz']))
    LG = lever(g, pg) if HAS else None; LE = lever(e, pe) if HAS else None
    cost = lambda t: (f'{kbd(t[0])} ({kbd(t[1])} con gzip)') if HAS else None
    gb_hoy, gb_base, gb_new, gb_new1 = MOD['gb_hoy_0'], MOD['gb_base_0'], MOD['gb_new_0'], MOD['gb_new_1']
    fr = fit([gb_hoy, gb_new], 55, 135, 6.2, pad=24)
    steps = [(shot(gb_hoy, 55, 135, 6.2, fr), '0. Hoy', 'Lámina de familias', f'{kb(pg["real_entry"])} ({kb(pg["real_entry_gz"])} con gzip)' if 'real_entry' in pg else None),
             (shot(gb_base, 55, 135, 6.2, fr), '1. Curvas y colores', 'Casco curvo, castillos del casco, popa; cubierta más nítida',
              (cost(LG['curvas']) + f'; {fx(g["lod0"] - pg["lod0"])} triángulos más') if HAS else None),
             (shot(gb_new, 55, 135, 6.2, fr), '2. Sombras pintadas', 'Oclusión horneada en la textura', cost(LG['ao']) if HAS else None),
             (shot(gb_new, 55, 135, 6.2, fr, shape=True), '3. Luz de forma', 'Más sol en la madera del casco', '0 KB: solo cambia cómo se ilumina'),
             (shot(gb_new, 55, 135, 6.2, fr, shape=True, shadow=gb_new1), '4. Sombra en el agua', 'La del barco, sobre el mar', '0 KB; 1 llamada de dibujo más por clase')]
    y = row('Mejora por mejora (Navío británico, 1440×900, zoom normal: 6,2 px por metro); debajo, lo que suma cada una a la descarga del barco', steps, y, gap=14)
    # C. móvil: lienzo a 1,5× (2,82 px/m CSS); LOD por la eslora en px CSS (ASSET-SPEC §7): Navío 118 y Cañonera 79 → LOD0
    pan = []
    for k, l in (('gb', 0), ('es', 0), ('can', 0)):
        hoy, new = MOD[f'{k}_hoy_{l}'], MOD[f'{k}_new_{l}']
        fr = fit([hoy, new], 55, 135, 4.23, pad=14)
        pan += [(shot(hoy, 55, 135, 4.23, fr), f'{NAME[k]}, hoy', None), (shot(new, 55, 135, 4.23, fr, shape=True, shadow=MOD[f'{k}_new_1']), f'{NAME[k]}, nuevo', None)]
    y = row('En el móvil (390×844; 4,2 px por metro del lienzo)', pan, y)
    # D y E. de lado y desde arriba, a 6 px/m (como la lámina de familias)
    for title_, th, hd, sky in (('De lado (6 px por metro)', 0, 56, True), ('Desde arriba (6 px por metro): la proa deja de ser una cuña', 90, 90, False)):
        pan = []
        for k in ('gb', 'es', 'can'):
            hoy, new = MOD[f'{k}_hoy_0'], MOD[f'{k}_new_0']; fr = fit([hoy, new], th, hd, 6, pad=14)
            sk = fr[3] if sky else None
            pan += [(shot(hoy, th, hd, 6, fr, sky=sk), f'{NAME[k]}, hoy', None), (shot(new, th, hd, 6, fr, shape=True, sky=sk), f'{NAME[k]}, nuevo', None)]
        y = row(title_, pan, y, gap=14)
    # F. de cerca
    pan = []
    for k, ppm in (('es', 11), ('can', 15)):
        hoy, new = MOD[f'{k}_hoy_0'], MOD[f'{k}_new_0']; fr = fit([hoy, new], 30, 118, ppm, pad=14)
        pan += [(shot(hoy, 30, 118, ppm, fr), f'{NAME[k]}, hoy', None), (shot(new, 30, 118, ppm, fr, shape=True), f'{NAME[k]}, nuevo', None)]
    y = row('De cerca (Navío a 11 px por metro, Cañonera a 15)', pan, y, gap=14)
    # texto: qué cambia, lo que cuesta y en contra
    cw = (SW - 80 - 2 * 40) // 3; x1, x2, x3 = 40, 40 + cw + 40, 40 + 2 * (cw + 40); y0 = y
    d.text((x1, y), 'Qué cambia', font=font(19), fill=TITLE); ty = y + 32
    for t in ('Curvas: el costado se abomba en la batería baja y se cierra hacia la regala, como en los navíos de la época. La proa es una curva y no una cuña. Los castillos son parte del casco: la regala sube en curva. La popa cae hacia atrás, con el espejo abombado y las galerías redondeadas.',
              'Sombras pintadas: la oclusión, horneada en la textura, oscurece bajo los castillos, junto a la borda y alrededor de botes y palos. Al jugar no cuesta nada.',
              f'Luz de forma: en la madera del casco, el sol cuenta el doble y la luz del cielo ×{KH:.2f}'.replace('.', ',') + '. La cubierta recibe la misma luz que hoy y las velas no cambian.',
              'Sombra en el agua: la de cada barco, con su modelo simple, como si el sol estuviera arriba a la izquierda.',
              'Colores de familia: el británico, azul marino con franjas blancas, la borda roja por dentro y la Union Jack. El español, rojo y amarillo oro, con la rojigualda y la cruz de Borgoña.',
              'La Cañonera: el mismo casco chato con curvas, tablas gastadas y cambiadas, la franja roja descascarillada, óxido bajo cada cañón, imbornales, calavera en la popa y, en su cubierta clara, quemaduras alrededor del mortero, barriles de pólvora, balas apiladas y cabos.'):
        ty = para(x1, ty, cw, t) + 8
    d.text((x2, y), 'Lo que cuesta', font=font(19), fill=TITLE); ty2 = y + 32
    lines = [f'Triángulos, de cerca / de lejos: británico {fx(g["lod0"])} / {fx(g["lod1"])} (hoy {fx(pg["lod0"])} / {fx(pg["lod1"])}); español {fx(e["lod0"])} / {fx(e["lod1"])} (hoy {fx(pe["lod0"])} / {fx(pe["lod1"])}); Cañonera {fx(p["lod0"])} / {fx(p["lod1"])} (hoy {fx(MS["canonera_hoy"]["lod0"])} / {fx(MS["canonera_hoy"]["lod1"])}). Topes: 5 000 / 1 200 los Navíos (5 500 si el casco curvo lo pide) y 2 000 / 700 los piratas.']
    if HAS:
        worst = max(g['first_gz'], e['first_gz'])
        lines.append(f'Al entrar al juego solo se espera a lo que dibuja el primer momento: tu barco con su textura de respaldo. Británico {kb(g["first_gz"])} y español {kb(e["first_gz"])} con gzip, de 120 KB'
                     + (f' (hoy, {kb(pg["real_first_gz"])} y {kb(pe["real_first_gz"])})' if 'real_first_gz' in pg else '') + '. '
                     + (f'Quedan {kb(ENTRY - worst)} en el peor.' if worst <= ENTRY else f'Pasa por {kb(worst - ENTRY)} en el peor.')
                     + f' La textura buena ({kb(g["ktx_gz"])} y {kb(e["ktx_gz"])}) baja después, con los demás barcos. Todo el barco: {kb(g["entry_gz"])} y {kb(e["entry_gz"])} con gzip ({kb(g["entry"])} y {kb(e["entry"])} sin comprimir).')
        lines.append(f'Por mejora, en el español: curvas y colores {kbd(LE["curvas"][0])} ({kbd(LE["curvas"][1])} con gzip); sombras pintadas {kbd(LE["ao"][0])} ({kbd(LE["ao"][1])}); luz de forma y sombra en el agua, 0 KB. En el británico, {kbd(LG["curvas"][0])} ({kbd(LG["curvas"][1])}) y {kbd(LG["ao"][0])} ({kbd(LG["ao"][1])}).')
        lines.append(f'Los 10 barcos del jugador, si todos pesaran como el español: {kb(10 * e["entry_gz"])} con gzip y {kb(10 * e["entry"])} sin comprimir; tope 1 000 KB, que producto puede subir.')
        lines.append(f'La Cañonera: {kb(p["entry_gz"])} con gzip ({kb(p["entry"])} sin comprimir). Hoy no se descarga, y la nueva baja cuando se acerca, no al entrar.')
    lines.append('Llamadas de dibujo: 1 por barco, como hoy. La sombra en el agua suma 1 por clase en pantalla (10 como mucho).')
    if 'bake' in g and 'bake' in p: lines.append(f'Horneado: {g["bake"]["seconds"]:.0f} s por Navío y {p["bake"]["seconds"]:.0f} s la Cañonera, en un núcleo, una vez al hacer el modelo.')
    D90 = json.load(open(os.path.join(CAD, 'respaldo-d90.json'))) if os.path.exists(os.path.join(CAD, 'respaldo-d90.json')) else {}
    if HAS:
        fails = [NAME[{'navio_gb': 'gb', 'navio_es': 'es', 'canonera': 'can'}[i]] for i, r in D90.items() if not r.get(MS[i]['resp'], {}).get('pasa', True)]
        rtxt = (RESP_TXT[g['resp']] if g['resp'] == e['resp'] == p['resp'] else
                f'{RESP_TXT[g["resp"]]} en los Navíos y {RESP_TXT[p["resp"]]} en la Cañonera (el más ligero que pasa la regla)' if g['resp'] == e['resp'] else
                f'{RESP_TXT[g["resp"]]} en el británico, {RESP_TXT[e["resp"]]} en el español y {RESP_TXT[p["resp"]]} en la Cañonera (el más ligero que pasa la regla)')
        lines.append(f'La textura va con la paleta de colores acotada, para que pese menos (fidelidad {fx1(g["psnr"])} y {fx1(e["psnr"])} dB frente al dibujo sin comprimir; más es mejor), y las imágenes «nuevo» ya la llevan. El respaldo, que se ve solo hasta que llega la textura buena, va en {rtxt}'
                     + ('.' if not D90 else (', y pasa la regla de calidad del respaldo.' if not fails else f'; no pasa la regla de calidad del respaldo en: {", ".join(fails)}.')))
    if HAS and 'ktx_desde_webp' in pg and all(abs(q['ktx_desde_webp'] - q['real_ktx']) <= 0.1 * q['real_ktx'] for q in (pg, pe)):
        lines.append(f'Cómo se calcula: la geometría, como en los barcos de hoy (difiere en {fx(abs(pg["geo"] + KTX_JSON - (pg["real_glb"] - pg["real_ktx"])))} B); la textura, como la comprime el juego. Los de hoy pesan más por la textura, que se comprimió desde una WebP con pérdida: así sale de {kb(pg["ktx_desde_webp"])} y {kb(pe["ktx_desde_webp"])} (medido: {kb(pg["real_ktx"])} y {kb(pe["real_ktx"])}); desde el PNG, {kb(pg["ktx"])} y {kb(pe["ktx"])}. La receta nueva parte del PNG.')
    elif HAS and 'real_entry' in pg:
        lines.append(f'Los pesos son estimados: el mismo cálculo con los barcos de hoy da {kb(pg["entry"])} y {kb(pe["entry"])} ({kb(pg["entry_gz"])} y {kb(pe["entry_gz"])} con gzip), frente a los {kb(pg["real_entry"])} y {kb(pe["real_entry"])} ({kb(pg["real_entry_gz"])} y {kb(pe["real_entry_gz"])}) medidos; la diferencia, sin explicar.')
    for t in lines: ty2 = para(x2, ty2, cw, t) + 8
    d.text((x3, y), 'En contra', font=font(19), fill=RED); ty3 = y + 32
    contra = ['El azul marino británico va sobre un mar azul: lo separan del agua las franjas blancas, las velas claras y la sombra.',
              'La luz de forma oscurece el lado del casco que no da al sol: hay que volver a medir las reglas de color de los cascos.',
              'La sombra en el agua hay que programarla en el juego, y se mide en el presupuesto de la escena y en los fps.',
              'El rojo español sigue cerca de la franja del pirata: lo separan las velas claras y el amarillo.',
              'La Cañonera se reconoce en grises por su cubierta clara: la media de las tablas no cambia, pero las sombras pintadas la oscurecen un poco junto a la borda y los cañones. Hay que volver a medirla.']
    for fam_, r in (('español', e), ('británico', g)):
        if r['lod0'] > 5000: contra.append(f'El {fam_} pasa los 5 000 triángulos por {fx(r["lod0"] - 5000)}: cabe en los 5 500 que admite producto si lo pide el casco curvo.')
    if p['lod0'] > 2000: contra.append(f'La Cañonera pasa el tope de los piratas (2 000) por {fx(p["lod0"] - 2000)}: o se recorta más, y pierde curva, o producto sube el tope, como con el Navío.')
    if HAS and max(g['first_gz'], e['first_gz']) > ENTRY: contra.append(f'Tu barco pasa los 120 KB al entrar por {kb(max(g["first_gz"], e["first_gz"]) - ENTRY)}.')
    if HAS and D90 and fails:  # la regla de D90 decide el tamaño; si 128² no la pasa, las 2 salidas, con su cifra (decide producto)
        def r256(i):  # a 256², el formato más ligero de los que pasan (§13, 4b); si ninguno pasa, el más ligero
            ok = [rs for rs in ('png256', 'jpeg256') if D90[i][rs]['pasa']] or ['png256', 'jpeg256']
            return min(ok, key=lambda rs: D90[i][rs]['bytes'])
        alt = ', '.join(f'{NAME[k_]} {kb(MS[i]["alt"][r256(i)])}' for i, k_ in (('navio_gb', 'gb'), ('navio_es', 'es')))
        contra.append(f'El respaldo de 128² no pasa la regla de calidad del respaldo en: {", ".join(fails)}. Quedan 2 salidas, y elige producto: dejarlo así (se ve peor unos segundos al entrar, hasta que llega la textura buena), o subirlo a 256², y entonces tu barco pesa al entrar {alt}, por encima de los 120 KB.')
    if HAS: contra.append('La primera vez que entras, tu barco se ve unos segundos con la textura de respaldo, más borrosa, hasta que llega la buena; después queda guardada en el navegador.')
    if HAS and max(g['first_gz'], e['first_gz']) <= ENTRY: contra.append(f'Los pesos son estimados (±0,6 % frente a lo medido con los barcos de hoy) y aún no cuentan los puntos de anclaje de cañones y humo, que se añaden al construirlo.')
    for t in contra: ty3 = para(x3, ty3, cw, t, c=RED) + 8
    y = max(ty, ty2, ty3) + 10
    sheet = sheet.crop((0, 0, SW, y + 20))
    out = os.path.join(RT.OUT, 'cadena-prueba.png'); sheet.save(out, optimize=True)
    json.dump(MS, open(os.path.join(CAD, 'medidas.json'), 'w'), ensure_ascii=False, indent=1)
    print(out, sheet.size)

# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/retrato.py <clase> <origen> <entrega>
#   <clase>    line (los Navíos de D91); cada clase nueva se añade a CLASES cuando se entrega su GLB
#   <origen>   la UX_OUT del turno que hizo la entrega: sus cadena/<id>_lod0.npz y cadena/comp/<atlas>.ktx2
#   <entrega>  la carpeta con los GLB entregados a dev-render en la forma «dentro» (<sb_id>.glb, con la KTX2 en el BIN)
#   →  $UX_OUT/retratos/<sb_id>_side.<h8>.webp (la entrega), <sb_id>_side.png (sin pérdida, para las láminas) y
#      retratos-<clase>.json con las medidas
# El retrato de la pestaña Familia del Astillero (AC-195; D94; ASSET-SPEC §13, «Retratos del selector de familia»): el barco
# de una clase en una familia, de lado y 20° hacia la popa (la proa mira a la derecha), con la elevación de 12°, la luz del
# juego y la luz de forma de D91 (render_tex.py), sobre transparente y con su sombra en el agua. La popa es donde más se
# separan las familias (los castillos, las tallas doradas y la bandera; ART-DIRECTION §9.3), y el costado lleva el color.
# El fondo (cielo y mar) es un degradado CSS de la tarjeta, así que no pesa: el horizonte está al 70 % del alto en los dos.
# Las 2 familias de una clase van a la misma escala y con la flotación en el mismo sitio, para que se comparen tal cual.
# Comprueba que el retrato sale del GLB entregado: la KTX2 que se pinta es, byte a byte, la del BIN del GLB, y LOD0 tiene su
# caja y sus triángulos. El WebP va con la calidad Q, que elige ux para que no haya artefactos visibles a 2× (producto,
# 2026-10-19: la calidad primero), y tiene que caber en 40 000 B; si no cabe, se reduce el tamaño o el encuadre, no la
# calidad, y se avisa a producto. Guarda la tabla de todas las calidades, con su ΔE76 frente al render sin pérdida, los 2
# sobre el fondo CSS. Ligero (segundos por familia, un núcleo). Escribe en UX_OUT. No corre en la CI.
import hashlib, io, json, math, os, struct, subprocess, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'laminas'), os.path.join(HERE, '..', 'mapa')): sys.path.insert(0, p)
import rutas as RT
import render_tex as RTX
import curvo as CV
import numpy as np
from PIL import Image, ImageFilter

M = RTX.M
W, H = 760, 480              # 2× de la caja de 380 × 240 px CSS del escritorio (ART-DIRECTION §14, pestaña Familia)
HOR = 336                    # el horizonte del fondo CSS, al 70 % del alto
TH, HD = 12.0, 110.0         # elevación de la cámara y rumbo (90 = de lado con la proa a la derecha; 110 = 20° hacia la popa)
PAD_X, PAD_TOP, PAD_BOT, WL_GAP = 24, 16, 16, 8  # márgenes en px; la flotación más alta, WL_GAP px por debajo del horizonte
MAX_B = 40000                # BACKLOG AC-195 (2): ≤ 40 000 B cada una a 2× (producto subió el tope de 15 000, 2026-10-19)
Q = 85                       # la calidad de la entrega; la lámina D94 enseña la popa a 3× con y sin comprimir para verla
QS = (95, 90, 85, 80, 75, 70, 65, 60, 55, 50)  # la tabla que se guarda
SH_A, SH_BLUR = 0.40, 0.25   # la sombra en el agua de D91 (lamina_cadena.py, lamina_capitan.py)
Yv = np.array([0.2126, 0.7152, 0.0722])
KS = 2.0; _up_h = M.IH * float(M.SKY @ Yv); _up_s = M.IS * float(M.SUN @ Yv) * M.LD[1]; KH = (_up_h + _up_s - KS * _up_s) / _up_h
BACK = dict(sky=('#4F86AE', '#9EC2D6'), sea=('#1E6A93', '#0F3F5C'))  # el degradado CSS de la caja (ART-DIRECTION §14)
# clase → familia → (id de la cadena, sb_id del GLB, nombre del atlas en cadena/comp)
CLASES = {'line': {'gb': ('navio_gb', 'ship_line_gb', 'atlas_gb'), 'es': ('navio_es', 'ship_line_es', 'atlas_es')}}


def read_glb(data):
    magic, ver, _ = struct.unpack_from('<4sII', data, 0); jl, jt = struct.unpack_from('<I4s', data, 12)
    assert magic == b'glTF' and ver == 2 and jt == b'JSON'
    js = json.loads(data[20:20 + jl]); bl, bt = struct.unpack_from('<I4s', data, 20 + jl); assert bt == b'BIN\x00'
    return js, bytes(data[28 + jl:28 + jl + bl])


def glb_check(path, sid, ktx, P):
    """El GLB entregado lleva esta KTX2 en su BIN, y su LOD0 tiene la caja de estos vértices (la de POSITION descuantizada con
    el nodo, a ≤ 1 paso de la cuantización de 14 bits de `gltf-transform meshopt`: 3,4 mm en el Navío) y casi sus
    triángulos: al soldar, Blender quita unos pocos degenerados (7 en cada Navío: 4 780 → 4 773 y 5 286 → 5 279, entrega.json
    de E3), así que se piden de 0 a 10 menos."""
    b = open(path, 'rb').read(); js, bin_ = read_glb(b)
    kimg = [im for im in js['images'] if im.get('mimeType') == 'image/ktx2']
    assert len(kimg) == 1 and 'bufferView' in kimg[0], f'{sid}: el GLB no lleva la KTX2 en el BIN (forma «dentro»)'
    v = js['bufferViews'][kimg[0]['bufferView']]; o = v.get('byteOffset', 0)
    same_ktx = bin_[o:o + v['byteLength']] == ktx
    nodes = js['nodes']; root = nodes[js['scenes'][0]['nodes'][0]]
    lod0 = next(nodes[c] for c in root['children'] if nodes[c].get('name') == f'{sid}_lod0')
    prims = js['meshes'][lod0['mesh']]['primitives']; tri = sum(js['accessors'][p_['indices']]['count'] // 3 for p_ in prims)
    acc = js['accessors'][prims[0]['attributes']['POSITION']]
    k = {5122: 32767.0, 5120: 127.0, 5126: 1.0}[acc['componentType']] if acc.get('normalized') or acc['componentType'] == 5126 else 1.0
    sc = np.array(lod0.get('scale', [1, 1, 1])); tr = np.array(lod0.get('translation', [0, 0, 0]))
    lo = np.array(acc['min']) / k * sc + tr; hi = np.array(acc['max']) / k * sc + tr
    P = np.asarray(P).reshape(-1, 3); dbox = float(max(np.abs(lo - P.min(0)).max(), np.abs(hi - P.max(0)).max()))
    ntri = len(P) // 3; step = float(sc.max()) * 4 / 32767
    return dict(sha256_glb=hashlib.sha256(b).hexdigest(), ktx2_igual=same_ktx, caja_dif_m=round(dbox, 5), tris_glb=tri, tris_npz=ntri,
                paso_m=round(step, 5), ok=same_ktx and dbox <= step and 0 <= ntri - tri <= 10)


def ktx_lin(path, tmp):
    w, h = struct.unpack('<II', open(path, 'rb').read()[20:28]); raw = os.path.join(tmp, os.path.basename(path) + '.raw')
    subprocess.run(['ktx', 'extract', '--transcode', 'rgba8', '--level', '0', '--raw', path, raw], check=True, capture_output=True)
    a = np.frombuffer(open(raw, 'rb').read(), np.uint8).reshape(h, w, 4)[..., :3].astype(float); os.remove(raw)
    return RTX.srgb2lin(a)


def model(npz):
    d = np.load(npz); P = d['p']; N = CV.vertex_normals(P); C4 = np.concatenate([d['c'], d['r'][:, None]], axis=1)
    Pc, UVc, C4c, Nc = RTX.clip_below_water(P, d['t'], C4, N)
    return dict(P=Pc, UV=UVc, C=C4c[:, :3], S=C4c[:, 3], N=Nc, P0=P)


def Ry(hd):
    ps = math.radians(hd); c, s = math.cos(ps), math.sin(ps); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def frame(mods, th=TH, hd=HD):
    """Escala y origen comunes a las familias de la clase: cabe en el ancho y en el alto con sus márgenes, y la flotación más
    alta queda WL_GAP px por debajo del horizonte (la proa, que en 3/4 sube en la imagen, no se sale del mar)."""
    P = np.concatenate([m['P'] for m in mods]) @ Ry(hd).T; T = math.radians(th)
    f = -(P[:, 1] * math.cos(T) - P[:, 2] * math.sin(T))  # y de pantalla en metros (hacia abajo)
    wl = np.abs(P[:, 1]) < 1e-6
    x0, x1 = P[:, 0].min(), P[:, 0].max(); top = f.min(); wl0, wl1 = f[wl].min(), f[wl].max()
    ppm = min((W - 2 * PAD_X) / (x1 - x0), (HOR + WL_GAP - PAD_TOP) / (wl0 - top), (H - PAD_BOT - HOR - WL_GAP) / max(wl1 - wl0, 1e-6))
    ppm = math.floor(ppm * 20) / 20
    oy = HOR + WL_GAP - wl0 * ppm; ox = W / 2 - (x0 + x1) / 2 * ppm
    return dict(ppm=ppm, ox=ox, oy=oy, th=th, hd=hd, caja_px=[round(x0 * ppm + ox, 1), round(top * ppm + oy, 1), round(x1 * ppm + ox, 1), round(wl1 * ppm + oy, 1)],
                flotacion_px=[round(wl0 * ppm + oy, 1), round(wl1 * ppm + oy, 1)])


def shot(m, atlas, fr):
    """RGBA en sRGB, alfa recto: el barco (cobertura) y su sombra en el agua (negro), solo por debajo del horizonte."""
    ppm, ox, oy, th, hd = fr['ppm'], fr['ox'], fr['oy'], fr['th'], fr['hd']
    rgb, cov = RTX.render(m['P'], m['UV'], m['C'], atlas, ppm, W, H, ox, oy, th, SS=3, N=m['N'], heading_deg=hd, S=m['S'], kh=KH, ks=KS)
    Ll = Ry(hd).T @ M.LD; Ps = m['P'] - (m['P'][:, 1:2] / Ll[1]) * Ll[None, :]; Ps[:, 1] = 0.005
    _, sc = RTX.render(Ps, np.full((len(Ps), 2), 0.5), np.ones((len(Ps), 3)), np.ones((4, 4, 3)), ppm, W, H, ox, oy, th, SS=2, heading_deg=hd)
    sm = np.asarray(Image.fromarray((sc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(SH_BLUR * ppm)), float) / 255
    sm *= np.clip((np.arange(H)[:, None] - HOR) / 4.0, 0, 1)  # la sombra no sube al cielo
    k = 1 - SH_A * sm; a_sh = 1 - k ** (1 / 2.2)  # oscurecer en lineal ≈ negro con este alfa sobre sRGB
    a = cov + (1 - cov) * a_sh
    straight = np.where(a[..., None] > 1e-6, rgb / np.maximum(a[..., None], 1e-6), 0)
    out = np.dstack([np.clip(straight, 0, 1), a])
    return Image.fromarray(np.round(out * 255).astype(np.uint8), 'RGBA')


def backdrop(w, h):
    """El fondo CSS de la caja: linear-gradient(180deg, cielo 0 %, cielo 70 %, mar 70 %, mar 100 %), en sRGB."""
    hx = lambda s: np.array([int(s[i:i + 2], 16) for i in (1, 3, 5)], float)
    y = (np.arange(h) + 0.5) / h; hor = 0.70; out = np.zeros((h, 3))
    s0, s1 = map(hx, BACK['sky']); m0, m1 = map(hx, BACK['sea'])
    sky = y < hor; t = np.where(sky, y / hor, (y - hor) / (1 - hor))[:, None]
    out[:] = np.where(sky[:, None], s0 + (s1 - s0) * t, m0 + (m1 - m0) * t)
    return Image.fromarray(np.round(np.repeat(out[:, None], w, 1)).astype(np.uint8), 'RGB')


def over(img, bg):
    a = np.asarray(img, float) / 255; b = np.asarray(bg, float) / 255
    return a[..., :3] * a[..., 3:] + b * (1 - a[..., 3:])


def dE(a, b, mask):
    e = np.linalg.norm(M.lab(a * 255) - M.lab(b * 255), axis=-1)[mask]
    return dict(medio=round(float(e.mean()), 3), p95=round(float(np.percentile(e, 95)), 3), max=round(float(e.max()), 3))


def encode(img):
    """El WebP con la calidad Q (alfa sin pérdida, method 6), y la tabla de todas las calidades."""
    bg = backdrop(W, H); ref = over(img, bg); mask = np.asarray(img)[..., 3] > 4; tabla = []
    for q in QS:
        buf = io.BytesIO(); img.save(buf, 'WEBP', quality=q, method=6, alpha_quality=100); data = buf.getvalue()
        dec = Image.open(io.BytesIO(data)).convert('RGBA')
        tabla.append(dict(q=q, B=len(data), dE=dE(over(dec, bg), ref, mask), data=data))
    return next(t for t in tabla if t['q'] == Q), tabla


if __name__ == '__main__':
    cls, src, ent = sys.argv[1], sys.argv[2], sys.argv[3]
    out = os.path.join(RT.OUT, 'retratos'); tmp = os.path.join(out, 'tmp'); os.makedirs(tmp, exist_ok=True)
    fams = CLASES[cls]; mods, atl, res = {}, {}, {}
    for fam, (cid, sid, an) in fams.items():
        kp = RT.need(os.path.join(src, 'cadena', 'comp', f'{an}.ktx2'), f'{an}.ktx2 de la entrega')
        mods[fam] = model(RT.need(os.path.join(src, 'cadena', f'{cid}_lod0.npz'), f'{cid}_lod0.npz de la entrega'))
        chk = glb_check(RT.need(os.path.join(ent, f'{sid}.glb'), f'{sid}.glb entregado'), sid, open(kp, 'rb').read(), mods[fam]['P0'])
        if not chk['ok']: print('NO SALE DEL GLB ENTREGADO', sid, chk); sys.exit(3)
        atl[fam] = ktx_lin(kp, tmp); res[sid] = dict(familia=fam, origen=chk)
    fr = frame(list(mods.values()))
    for fam, (cid, sid, an) in fams.items():
        img = shot(mods[fam], atl[fam], fr); img.save(os.path.join(out, f'{sid}_side.png'))
        best, tabla = encode(img)
        if best['B'] > MAX_B: print('NO CABE CON LA CALIDAD', Q, 'EN', MAX_B, sid, [(t['q'], t['B']) for t in tabla]); sys.exit(4)
        name = f"{sid}_side.{hashlib.sha256(best['data']).hexdigest()[:8]}.webp"; open(os.path.join(out, name), 'wb').write(best['data'])
        res[sid].update(webp=name, B=best['B'], q=best['q'], dE=best['dE'], sha256=hashlib.sha256(best['data']).hexdigest(),
                        tabla=[{k: v for k, v in t.items() if k != 'data'} for t in tabla])
        print(sid, name, best['B'], 'B, q', best['q'], 'ΔE76', best['dE'])
    json.dump(dict(clase=cls, lado_px=[W, H], horizonte_px=HOR, camara=dict(elevacion=TH, rumbo=HD), escala=fr, retratos=res),
              open(os.path.join(out, f'retratos-{cls}.json'), 'w'), ensure_ascii=False, indent=1)
    print('escala', fr)

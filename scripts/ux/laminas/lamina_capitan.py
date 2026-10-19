# Uso (desde la raíz del repo), con la misma UX_OUT, tras: capitan_curvo.py → blender_curvo.py capitan bake 1024 64 →
# capitan_curvo.py otra vez (el atlas con la oclusión) → blender_curvo.py capitan export → gltf-transform meshopt y `ktx create`
# como en comprimir_cadena.sh (→ $UX_OUT/cadena/comp/capitan_meshopt.glb y atlas_capitan.ktx2); y, para AD-28, en $UX_OUT/cadena:
# captain-rig.json y pirate-rig.json (code/export-rig-npc.ts), canonera2_lod0.npz y comp/atlas_canonera2.ktx2 (la Cañonera
# aprobada, de su turno):
#   python3 -I scripts/ux/laminas/lamina_capitan.py  →  $UX_OUT/D91-capitan.png y $UX_OUT/cadena/capitan-medidas.json
# Lámina del Capitán pirata con la receta de D91 para Jonattan: el de hoy (el generador del juego, sin las palancas) y el
# nuevo, con la luz del juego (render por software de scripts/ux/mapa/render_tex.py), en el juego en 1440×900, la popa de
# cerca, de lado, desde arriba y en el móvil en color y en grises. Mide los triángulos, el peso con la KTX2 fuera (ASSET-SPEC
# §13, 4c), el respaldo de D90 (4b) y AD-28 con el modelo de ad28_canonera2.py: las firmas en 390×844 frente al Pirata y a la
# Cañonera aprobada, y el área clara del estandarte (≥ 20 px CSS). Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, json, math, io, gzip, struct, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'mapa'), os.path.join(HERE, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import tienda as T
import render_tex as RTX
import curvo as CV
import respaldo as RS
import capitan_curvo as CP
import ad28_canonera2 as A
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CAD = os.path.join(RT.OUT, 'cadena')
SEA = np.array([26, 95, 134.0]) / 255; SKYC = np.array([226, 234, 239.0]) / 255
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42)
M = RTX.M; WHITE = np.ones((4, 4, 3)); KS, KH, SH_A, SH_BLUR = A.KS, A.KH, A.SH_A, A.SH_BLUR


def font(px, w=600): return T.font(px, w)
def gz(b): return len(gzip.compress(b, 9, mtime=0))


def hoy():
    """El Capitán de hoy: el generador del juego entero, con su color de vértice, normales de cara y la luz del juego."""
    d = CP.rig_json()['lod0']; P = np.array(d['pos']).reshape(-1, 3); C = np.array(d['col']).reshape(-1, 3)
    Pc, UVc, Cc, _ = RTX.clip_below_water(P, np.full((len(P), 2), 0.5), C)
    return dict(P=Pc, UV=UVc, C=Cc, S=None, N=None, A=WHITE, shadow=False)


def receta(lod, atlas):
    d = np.load(RT.need(os.path.join(CAD, f'capitan_lod{lod}.npz'), f'capitan_lod{lod}.npz (capitan_curvo.py)')); P = d['p']
    N = CV.vertex_normals(P); C4 = np.concatenate([d['c'], d['r'][:, None]], axis=1)
    Pc, UVc, C4c, Nc = RTX.clip_below_water(P, d['t'], C4, N)
    return dict(P=Pc, UV=UVc, C=C4c[:, :3], S=C4c[:, 3], N=Nc, A=atlas, shadow=True)


def Ry(hd):
    ps = math.radians(hd); c, s = math.cos(ps), math.sin(ps); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def fit(mods, th, hd, ppm, pad=16):
    P = np.concatenate([m['P'] for m in mods]) @ Ry(hd).T; TH = math.radians(th)
    x = P[:, 0] * ppm; y = -(P[:, 1] * math.cos(TH) - P[:, 2] * math.sin(TH)) * ppm
    return int(math.ceil(x.max() - x.min())) + 2 * pad, int(math.ceil(y.max() - y.min())) + 2 * pad, pad - x.min(), pad - y.min()


def shot(mod, th, hd, ppm, fr, sky=None, SS=3):
    W, H, ox, oy = fr; kw = dict(S=mod['S'], kh=KH, ks=KS) if mod['S'] is not None else {}
    rgb, cov = RTX.render(mod['P'], mod['UV'], mod['C'], mod['A'], ppm, W, H, ox, oy, th, SS=SS, N=mod['N'], heading_deg=hd, **kw)
    bg = np.tile(SEA, (H, W, 1))
    if sky is not None: bg[:int(sky)] = SKYC
    if mod['shadow']:
        Ll = Ry(hd).T @ M.LD; Ps = mod['P'] - (mod['P'][:, 1:2] / Ll[1]) * Ll[None, :]; Ps[:, 1] = 0.005
        _, sc = RTX.render(Ps, np.full((len(Ps), 2), 0.5), np.ones((len(Ps), 3)), WHITE, ppm, W, H, ox, oy, th, SS=2, heading_deg=hd)
        sm = np.asarray(Image.fromarray((sc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(SH_BLUR * ppm)), float) / 255
        bg = M.lin2srgb(RTX.srgb2lin(bg * 255) * (1 - SH_A * sm[..., None]))
    img = rgb + bg * (1 - cov[..., None])
    return Image.fromarray(np.clip(np.round(img * 255), 0, 255).astype(np.uint8))


def gray(img): return img.convert('L').convert('RGB')


def glb_geo(path):
    """El GLB sin los bytes de sus imágenes (lo que queda con la KTX2 fuera y antes del respaldo)."""
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; js = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
    cuts = sorted((bin0 + js['bufferViews'][im['bufferView']].get('byteOffset', 0), js['bufferViews'][im['bufferView']]['byteLength']) for im in js['images'])
    keep, pos = [], 0
    for o, n in cuts: keep.append(b[pos:o]); pos = o + n
    keep.append(b[pos:]); return b''.join(keep)


def respaldo_rule(npz, atlas_png, ktx, regions):
    """La regla de D90 (ASSET-SPEC §13, 4b): el lado y el formato más ligeros que pasan, con la cámara del juego más cercana."""
    z = np.load(npz); P, UVc, Cc, _ = RTX.clip_below_water(z['p'], z['t'], z['c'])
    ref = RS.mips(Image.fromarray(np.round(M.lin2srgb(A.ktx_lin(ktx)) * 255).astype(np.uint8)))
    gb_ = RS.gbuffer(P, UVc, Cc, 6.20 / 0.7, 55, 135); r_img, r_cov = RS.shade(gb_, ref); full = r_cov > 0.999
    base = RS.dE(RS.shade(gb_, RS.mips(Image.open(atlas_png)))[0], r_img, full); out = {}
    for n in (128, 256):
        im = RS.fallback(atlas_png, n, regions=regions, size=1024)
        for fmt in ('png', 'jpeg'):
            data = RS.encode(im, fmt); e = RS.dE(RS.shade(gb_, RS.mips(Image.open(io.BytesIO(data)).convert('RGB')))[0], r_img, full)
            out[f'{fmt}{n}'] = dict(bytes=len(data), dE=round(e[0], 3), dE_medio=round(e[2], 3), pasa=bool(e[0] <= 1.5 * base[0] and e[2] <= 1.0), data=data)
    ok = [k for k, v in out.items() if v['pasa']]
    return out, (min(ok, key=lambda k: out[k]['bytes']) if ok else 'png256'), round(base[0], 3)


def estandarte_px(Pfull, Cfull, mod, hd, W, H):
    """px CSS del estandarte con L* ≥ 80 en la vista de AD-28 (390×844, N1, lienzo a DPR 1,5): px del pase de ids donde
    ≥ 50 % de las muestras son del estandarte (su paño blanco o su cuadro negro, sobre y = 19 m) y L* ≥ 80, ÷ 1,5²."""
    T_ = len(Pfull) // 3; key = [A.hexkey(Cfull[3 * i]) for i in range(T_)]; top = Pfull.reshape(-1, 3, 3)[:, :, 1].min(1) > 19.0
    flag = np.array([k in ('#E9E0CA', '#010101') and t for k, t in zip(key, top)] + [False])
    SS = 4; idn = A.ids(Pfull, A.PPM, W, H, W / 2, H / 2 + 12, hd, SS)
    frac = flag[np.where(idn >= 0, idn, T_)].reshape(H, SS, W, SS).mean((1, 3)) >= 0.5
    _, img, _ = A.shot(mod, hd, W, H); L = M.lab(img * 255)[..., 0]
    return round(float((frac & (L >= 80)).sum()) / 2.25, 1)


if __name__ == '__main__':
    comp = os.path.join(CAD, 'comp'); kt = os.path.join(comp, 'atlas_capitan.ktx2'); mo = os.path.join(comp, 'capitan_meshopt.glb')
    atlas = A.ktx_lin(RT.need(kt, 'atlas_capitan.ktx2 (ktx create)'))
    old, new = hoy(), receta(0, atlas); PAIR = (old, new)
    VIEWS = [  # (título, th, rumbo, px/m, cielo)
        ('Como en el juego, en 1440×900 (cámara a 55°, 6,2 px por metro)', 55, 135, 6.2, False),
        ('La popa de cerca, en 3/4 desde atrás (14 px por metro)', 26, 160, 14.0, False),
        ('De lado (9 px por metro)', 0, 90, 9.0, True),
        ('Desde arriba (9 px por metro)', 90, 90, 9.0, False),
        ('En el móvil, en 390×844 (2,8 px por metro), en color y en grises', 55, 135, 2.8, False),
    ]
    shots = []
    for title, th, hd, ppm, sky in VIEWS:
        fr = fit(PAIR, th, hd, ppm); sk = fr[3] if sky else None
        a, b = (shot(m, th, hd, ppm, fr, sky=sk, SS=4 if ppm < 4 else 3) for m in PAIR)
        if ppm < 4: a, b = (Image.fromarray(np.hstack([np.asarray(x), np.asarray(gray(x))])) for x in (a, b))
        shots.append((title, a, b))
    # --- medidas: triángulos, peso y respaldo
    tri = lambda p: len(np.load(p)['p']) // 3
    rig = CP.rig_json()
    MED = dict(lod0=tri(os.path.join(CAD, 'capitan_lod0.npz')), lod1=tri(os.path.join(CAD, 'capitan_lod1.npz')),
               lod0_hoy=len(rig['lod0']['pos']) // 9, lod1_hoy=len(rig['lod1']['pos']) // 9)
    geo = glb_geo(RT.need(mo, 'capitan_meshopt.glb (gltf-transform meshopt)')); k = open(kt, 'rb').read()
    rule, resp, base = respaldo_rule(os.path.join(CAD, 'capitan_lod0.npz'), os.path.join(CAD, 'atlas_capitan.png'), kt, CP.AT.R)
    png = rule[resp]['data']
    MED.update(resp=resp, resp_B=len(png), entrada_B=len(geo) + len(png), entrada_gz=gz(geo + png), ktx_B=len(k), ktx_gz=gz(k),
               respaldo={kk: {x: y for x, y in v.items() if x != 'data'} for kk, v in rule.items()}, dE_atlas=base)
    # --- AD-28 en 390×844 (N1, DPR 1,5): el Capitán nuevo frente al Pirata y a la Cañonera aprobada; el de hoy, de calibración
    W, H = 320, 280
    ships = {'pirata': A.rig('pirate', 1), 'capitan_hoy': A.rig('captain', 0), 'canonera2': A.recipe(0, A.ktx_lin(os.path.join(comp, 'atlas_canonera2.ktx2')), True),
             'capitan': receta(0, atlas), 'capitan_sin_sombra': dict(receta(0, atlas), shadow=False)}
    sig = {n: {hd: A.shot(m, hd, W, H)[0] for hd in A.HEADINGS} for n, m in ships.items()}
    pares = {}
    for a, b in (('pirata', 'capitan_hoy'), ('canonera2', 'capitan_hoy'), ('pirata', 'capitan'), ('canonera2', 'capitan'), ('pirata', 'capitan_sin_sombra'), ('canonera2', 'capitan_sin_sombra')):
        per = {hd: A.differ(sig[a][hd], sig[b][hd]) for hd in A.HEADINGS}
        pares[f'{a}–{b}'] = dict(por_rumbo=per, minimo=min(len(v) for v in per.values()), pasa=all(len(v) >= 2 for v in per.values()))
    dn = np.load(os.path.join(CAD, 'capitan_lod0.npz')); g0 = rig['lod0']
    est = {'capitan': {hd: estandarte_px(dn['p'], dn['c'], ships['capitan'], hd, W, H) for hd in A.HEADINGS},
           'capitan_hoy': {hd: estandarte_px(np.array(g0['pos']).reshape(-1, 3), np.array(g0['col']).reshape(-1, 3), ships['capitan_hoy'], hd, W, H) for hd in A.HEADINGS}}
    MED['ad28'] = dict(firmas=sig, pares=pares, estandarte_px_css=est)
    json.dump(MED, open(os.path.join(CAD, 'capitan-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    print('medidas', json.dumps({k: v for k, v in MED.items() if k not in ('respaldo', 'ad28')}, ensure_ascii=False))
    for kk, v in pares.items(): print(f'{kk:30s} pasa {v["pasa"]} · mín {v["minimo"]} · ' + ' | '.join(f'{hd}° {",".join(x) or "—"}' for hd, x in v['por_rumbo'].items()))
    for n in ('pirata', 'capitan_hoy', 'canonera2', 'capitan'):
        print(f'{n:12s} ' + ' | '.join(f'{hd}° A {s["area"]} L* {s["L_medio"]} cl {100 * s["clara"]:.1f} md {100 * s["media"]:.1f}' for hd, s in sig[n].items()))
    print('estandarte px CSS', json.dumps(est))

    # --- lámina
    GAP = 30; colw = max(max(a.width, b.width) for _, a, b in shots)
    SW = max(40 + 2 * colw + GAP + 40, 1400)
    sheet = Image.new('RGB', (SW, 7000), PAPER); d = ImageDraw.Draw(sheet)

    def para(x, y, txt, f, fill, width, lh):
        line = ''
        for w in txt.split(' '):
            t = (line + ' ' + w).strip()
            if d.textlength(t, font=f) > width and line: d.text((x, y), line, font=f, fill=fill); y += lh; line = w
            else: line = t
        if line: d.text((x, y), line, font=f, fill=fill); y += lh
        return y

    d.text((40, 22), 'Capitán pirata con la receta: más detalle, curvas y sombras', font=font(32), fill=INK)
    y = para(40, 66, 'Lo que pediste para los barcos pirata: «Quiero más detalles en los barcos pirata, se ven muy planos». Es la misma receta que aprobaste con los Navíos y la Cañonera. A la izquierda, el Capitán de hoy en el juego; a la derecha, el nuevo. Los dos con la luz y el agua del juego.', font(17, 500), SOFT, SW - 80, 26) + 22
    for title, a, b in shots:
        d.text((40, y), title, font=font(19), fill=TITLE); y += 30
        d.text((40, y), 'Hoy', font=font(15), fill=SOFT); d.text((40 + colw + GAP, y), 'Nuevo', font=font(15), fill=SOFT); y += 24
        sheet.paste(a, (40, y)); sheet.paste(b, (40 + colw + GAP, y)); y += max(a.height, b.height) + 26
    def mil(n): return f'{n:,}'.replace(',', '.')
    def dec(x, k): return f'{x:.{k}f}'.replace('.', ',')
    RESP_TXT = {'jpeg128': 'JPEG de 128 × 128', 'png128': 'PNG de 128 × 128', 'jpeg256': 'JPEG de 256 × 256', 'png256': 'PNG de 256 × 256'}
    ok_pairs = all(pares[f'{a}–capitan']['pasa'] for a in ('pirata', 'canonera2')); est_min = min(est['capitan'].values())
    lectura = [f'En grises y a la escala del móvil, en los 4 rumbos, se distingue del pirata y de la Cañonera nueva por al menos 2 rasgos medibles (tamaño, tono medio, partes claras y partes de tono medio).' if ok_pairs
               else 'En grises y a la escala del móvil NO se distingue en todos los rumbos del pirata o de la Cañonera nueva: ver «En contra».',
               f'El estandarte blanco se sigue viendo: en el móvil ocupa al menos {dec(est_min, 0)} puntos de pantalla muy claros (se piden 20).']
    BLOCKS = [
        ('Qué cambia', INK, [
            'El casco: curvas, la popa con caída, galerías a los lados del alcázar y el espejo con 2 filas de ventanas encendidas, tallas doradas y una calavera con las tibias.',
            'Los costados: tablazón negra gastada, la franja roja descascarillada, las portas enmarcadas en oro con las tapas abiertas, óxido bajo cada porta y verdín en la línea de flotación; la regala y 2 molduras doradas.',
            'La cubierta: tablas oscuras con juntas y clavos, escotillas con enjaretado, barriles de pólvora, cajas de balas y cabos; en el alcázar, el timón, la bitácora y el cofre del botín abierto, con el oro a la vista.',
            'Un mascarón dorado con una calavera bajo el bauprés, y 3 faroles en la popa, el del buque insignia.']),
        ('Lo que no cambia', INK, [
            'El tamaño (30 × 8 m), los 3 palos inclinados, las velas negras con la fila baja roja y la vela de cuchillo de popa, el estandarte blanco con el cuadro negro en lo alto del palo mayor y los 6 cañones por banda: lo que lo distingue del pirata y de la Cañonera.']),
        ('Lo que cuesta', INK, [
            f'{mil(MED["lod0"])} triángulos de cerca y {mil(MED["lod1"])} de lejos (hoy: {mil(MED["lod0_hoy"])} y {mil(MED["lod1_hoy"])}; el tope del Capitán es 2.500 y 800).',
            f'Al entrar en su zona baja {dec(MED["entrada_gz"] / 1000, 1)} KB (la forma con una versión pequeña de la textura, {RESP_TXT[MED["resp"]]}); la textura buena, {dec(MED["ktx_gz"] / 1000, 1)} KB, llega después.']),
        ('Se distingue en grises', INK if ok_pairs and est_min >= 20 else RED, lectura),
        ('En contra', RED, [
            'Las velas son las de hoy: el detalle nuevo está en el casco y en la cubierta. De lejos, lo que más se ve sigue siendo el aparejo negro y rojo.',
            'El negro del casco es muy oscuro: el detalle del costado se ve de cerca, y de lejos se lee sobre todo por el rojo y el oro.',
            'El cofre del botín es pequeño: se ve desde arriba y de cerca, no en el móvil.']
            + ([] if ok_pairs else ['No pasa la prueba de grises en todos los rumbos (ver arriba).'])),
    ]
    for title, colr, lines in BLOCKS:
        d.text((40, y), title, font=font(19), fill=TITLE if colr == INK else RED); y += 30
        for ln in lines:
            d.text((56, y), '·', font=font(16, 500), fill=colr); y = para(74, y, ln, font(16, 500), colr, SW - 120, 24) + 2
        y += 12
    sheet = sheet.crop((0, 0, SW, y + 20))
    out = os.path.join(RT.OUT, 'D91-capitan.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

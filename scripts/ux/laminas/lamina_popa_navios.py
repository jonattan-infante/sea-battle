# Uso (desde la raíz del repo): UX_ANTES=<UX_OUT de la lámina D91> python3 -I scripts/ux/laminas/lamina_popa_navios.py <gb|es|hoja>
#   gb / es  →  $UX_OUT/popa-<fam>.png: el Navío de esa familia antes (la malla de la lámina D91, en $UX_ANTES/cadena) y después
#               (la de la entrega, en $UX_OUT/cadena), a la escala del juego y de cerca en 3/4 desde atrás
#   hoja     →  $UX_OUT/D91-navios-popa.png: las 2 familias juntas con el texto, para Jonattan
# El ajuste de la popa de los 2 Navíos de D91 para que la caja del casco mida 42,75 m (≤ 42,84, el +2 % de AS-V03; regla de
# producto de r11 c0725e4, BACKLOG :1673): menos caída y menos abombado en el espejo. Cambia el barco aprobado, así que
# vuelve a Jonattan con esta imagen (AC-192). Render por software con la luz del juego, la luz de forma y la sombra en el
# agua de la receta (como lamina_cadena.py). Cada familia en su pasada (un núcleo, segundos). No corre en la CI.
import sys, os, json, math
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'mapa'), os.path.join(HERE, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import tienda as T
import render_tex as RTX
import curvo as CV
import navio_curvo as NCV
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

NOW = os.path.join(RT.OUT, 'cadena'); BEFORE = os.path.join(os.environ.get('UX_ANTES', RT.OUT), 'cadena')
SEA = np.array([26, 95, 134.0]) / 255; PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26)
M = RTX.M; WHITE = np.ones((4, 4, 3)); Yv = np.array([0.2126, 0.7152, 0.0722])
KS = 2.0; _up_h = M.IH * float(M.SKY @ Yv); _up_s = M.IS * float(M.SUN @ Yv) * M.LD[1]; KH = (_up_h + _up_s - KS * _up_s) / _up_h
SH_A, SH_BLUR = 0.40, 0.25
NAME = {'gb': 'Navío británico', 'es': 'Navío español'}
VIEWS = [('A la escala del juego (6,2 px por metro)', 55, 135, 6.2, None), ('De cerca, la popa en 3/4 desde atrás (16 px por metro)', 24, 160, 16.0, 'popa')]


def model(cad, fam):
    d = np.load(RT.need(os.path.join(cad, f'navio_{fam}_lod0.npz'), f'navio_{fam}_lod0.npz')); P = d['p']; N = CV.vertex_normals(P)
    C4 = np.concatenate([d['c'], d['r'][:, None]], axis=1); Pc, UVc, C4c, Nc = RTX.clip_below_water(P, d['t'], C4, N)
    A = RTX.srgb2lin(np.asarray(Image.open(os.path.join(cad, f'atlas_{fam}.png')).convert('RGB'), float))
    return dict(P=Pc, UV=UVc, C=C4c[:, :3], S=C4c[:, 3], N=Nc, A=A)


def Ry(hd):
    ps = math.radians(hd); c, s = math.cos(ps), math.sin(ps); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def frame(mods, th, hd, ppm, crop, pad=14):
    """Encuadre común de antes y después; con crop='popa', solo el último tercio del casco (z < −8) y la arboladura baja."""
    P = np.concatenate([m['P'] for m in mods])
    if crop == 'popa': P = P[(P[:, 2] < -8.0) & (P[:, 1] < 14.0)]
    P = P @ Ry(hd).T; TH = math.radians(th)
    x = P[:, 0] * ppm; y = -(P[:, 1] * math.cos(TH) - P[:, 2] * math.sin(TH)) * ppm
    return int(math.ceil(np.ptp(x))) + 2 * pad, int(math.ceil(np.ptp(y))) + 2 * pad, pad - x.min(), pad - y.min()


def shot(mod, th, hd, ppm, fr):
    W, H, ox, oy = fr
    rgb, cov = RTX.render(mod['P'], mod['UV'], mod['C'], mod['A'], ppm, W, H, ox, oy, th, SS=3, N=mod['N'], heading_deg=hd, S=mod['S'], kh=KH, ks=KS)
    Ll = Ry(hd).T @ M.LD; Ps = mod['P'] - (mod['P'][:, 1:2] / Ll[1]) * Ll[None, :]; Ps[:, 1] = 0.005
    _, sc = RTX.render(Ps, np.full((len(Ps), 2), 0.5), np.ones((len(Ps), 3)), WHITE, ppm, W, H, ox, oy, th, SS=2, heading_deg=hd)
    sm = np.asarray(Image.fromarray((sc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(SH_BLUR * ppm)), float) / 255
    bg = M.lin2srgb(RTX.srgb2lin(np.tile(SEA, (H, W, 1)) * 255) * (1 - SH_A * sm[..., None]))
    return Image.fromarray(np.clip(np.round((rgb + bg * (1 - cov[..., None])) * 255), 0, 255).astype(np.uint8))


def hull_len(cad, fam):
    d = np.load(os.path.join(cad, f'navio_{fam}_lod0.npz')); P = d['p'].reshape(-1, 3, 3); R = d['r'].reshape(-1, 3)
    C = d['c'].reshape(-1, 3, 3)[:, 0]; gold = CV.hexlin(NCV.PAL[fam]['trim'])
    fig = (P[:, :, 2].min(1) > 19.5) & (np.abs(C - gold).max(1) < 1e-6)  # el mascarón dorado (en la malla de D91 lleva _RIM_MASK)
    H = P[(R > 0.5).all(1) & ~fig].reshape(-1, 3); return round(float(np.ptp(H[:, 2])), 2)


def font(px, w=600): return T.font(px, w)


if __name__ == '__main__':
    arg = sys.argv[1]
    if arg in ('gb', 'es'):
        old, new = model(BEFORE, arg), model(NOW, arg); imgs = []
        for _, th, hd, ppm, crop in VIEWS:
            fr = frame((old, new), th, hd, ppm, crop); imgs.append([shot(old, th, hd, ppm, fr), shot(new, th, hd, ppm, fr)])
        W = max(a.width + b.width for a, b in imgs) + 20; Hh = sum(max(a.height, b.height) for a, b in imgs) + 20
        out = Image.new('RGB', (W, Hh), PAPER); y = 0
        for a, b in imgs: out.paste(a, (0, y)); out.paste(b, (a.width + 20, y)); y += max(a.height, b.height) + 20
        out.save(os.path.join(RT.OUT, f'popa-{arg}.png'))
        json.dump(dict(antes=hull_len(BEFORE, arg), despues=hull_len(NOW, arg), anchos=[[a.width, b.width] for a, b in imgs]), open(os.path.join(RT.OUT, f'popa-{arg}.json'), 'w'))
        print(arg, open(os.path.join(RT.OUT, f'popa-{arg}.json')).read())
    else:
        parts = {f: (Image.open(os.path.join(RT.OUT, f'popa-{f}.png')), json.load(open(os.path.join(RT.OUT, f'popa-{f}.json')))) for f in ('gb', 'es')}
        W = 40 + sum(p[0].width for p in parts.values()) + 40 + 40
        sheet = Image.new('RGB', (W, 3000), PAPER); d = ImageDraw.Draw(sheet)
        d.text((40, 22), 'Navíos: ajuste de la popa', font=font(30), fill=INK)
        lines = ['Para que el barco se vea del mismo largo con el que choca y se selecciona (42 m, con un margen del 2 %), la popa se acorta',
                 'medio metro: cae menos hacia atrás y el espejo es un poco menos curvo. El resto del barco no cambia. A la escala del juego son unos 3 px.']
        y = 64
        for ln in lines: d.text((40, y), ln, font=font(17, 500), fill=SOFT); y += 26
        y += 16; x = 40
        for f, (img, js) in parts.items():
            d.text((x, y), f'{NAME[f]}: largo del casco de {js["antes"]:.2f} a {js["despues"]:.2f} m'.replace('.', ','), font=font(19), fill=TITLE)
            wa = js['anchos'][0][0]; d.text((x, y + 30), 'Antes', font=font(15), fill=SOFT); d.text((x + wa + 20, y + 30), 'Después', font=font(15), fill=SOFT)
            sheet.paste(img, (x, y + 54)); x += img.width + 40
        y += 54 + max(p[0].height for p in parts.values()) + 24
        d.text((40, y), 'El mascarón de proa queda fuera de esa medida, como el bauprés: no se toca.', font=font(16, 500), fill=INK); y += 40
        sheet = sheet.crop((0, 0, W, y)); out = os.path.join(RT.OUT, 'D91-navios-popa.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

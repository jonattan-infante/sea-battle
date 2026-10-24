# ux · ¿Cuánto más borroso que las láminas D95 (Fragata v4, Goleta) se verá el barco en el juego por el mip de la KTX2?
# Las láminas pintan «como en el juego» con render_tex.py: bilineal del nivel 0 en SS × SS submuestras por píxel (SS = 3 en
# 6,2 px/m y 4 en 2,8 px/m), sin mip. La GPU, con la KTX2 de la receta (10–11 niveles, minFilter trilineal de three por
# defecto, anisotropía 1) y MSAA (antialias: true, GameCanvas.tsx:199), muestrea una vez por píxel, en su centro, con el
# nivel λ que sale de las derivadas de la UV. Este script repinta las 2 vistas del juego de la lámina (55°, rumbo 135°,
# 6,2 y 2,8 px/m) con 6 muestreos del mismo modelo, la misma luz y la misma sombra (lamina_capitan.shot):
#   lamina   render_tex.render tal cual (la lámina)
#   ideal    render_tex.render con SS = 8 (64 muestras del nivel 0: el filtro de caja de 1 px casi exacto)
#   iso      GPU sin anisótropo: trilineal entre los niveles reales de la KTX2, λ = log2(máx(|∂uv/∂x|, |∂uv/∂y|)) en téxeles
#            por píxel, en el centro del píxel (MSAA); la geometría y la luz, en las SS × SS submuestras
#   aniso    GPU con anisotropía 16 (EXT_texture_filter_anisotropic): N = mín(⌈Pmáx/Pmín⌉, 16) sondas a lo largo del eje
#            mayor, cada una trilineal en λ = log2(Pmáx/N)
#   isobox, anisobox  iso y aniso con mips ideales (caja 2 × 2 en lineal desde el nivel 0 de la KTX2): separa lo que pierde
#            el filtro de lo que pierde la codificación basis-lz de los mips
#   iso-dpr, aniso-dpr  lo mismo con el DPR máximo del juego (escritorio 2, móvil 1,5; src/client/art.ts:138-139) y
#            reducido con caja al tamaño de la lámina: lo que ve el ojo en una pantalla con esa densidad
# Controles: (C1) el nivel 0 de la cadena es igual al de A.ktx_lin; (C2) con el muestreo de la lámina, este renderizador da
# la imagen de render_tex.render bit a bit. Medidas sobre los píxeles del barco (cobertura ≥ 0,999, erosionada 2 px):
# PSNR frente a la lámina y «detalle» = media de |Y − Y desenfocado (gauss 1 px)| relativa a la lámina.
# Uso: python3 -I render_mip.py <árbol con scripts/ux de c665cb4> <ux-assets> <salida>   (un núcleo, sin GPU ni navegador)
import sys, os, math, struct, subprocess, json, time
sys.dont_write_bytecode = True
TREE, UXA, OUTD = sys.argv[1:4]
for p in ('scripts/ux/laminas', 'scripts/ux/mapa', 'scripts/ux/barcos'): sys.path.insert(0, os.path.join(TREE, p))
import render_tex as RTX
import lamina_capitan as LC
import ad28_canonera2 as A
import curvo as CV
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont

M = RTX.M; ORIG = RTX.render; os.makedirs(OUTD, exist_ok=True)
CHAINS = {}; CHAINS_BOX = {}; MODE = {'m': 'lamina'}


def chain(ktx):
    b = open(ktx, 'rb').read(48); w, h = struct.unpack('<II', b[20:28]); lv = struct.unpack('<I', b[40:44])[0]; out = []
    for L in range(lv):
        raw = os.path.join(OUTD, f'nivel{L}.raw')
        subprocess.run(['ktx', 'extract', '--transcode', 'rgba8', '--level', str(L), '--raw', ktx, raw], check=True, capture_output=True)
        wl, hl = max(w >> L, 1), max(h >> L, 1)
        a = np.frombuffer(open(raw, 'rb').read(), np.uint8).reshape(hl, wl, 4)[..., :3].astype(float); os.remove(raw)
        out.append(RTX.srgb2lin(a))
    return out


def bil(lev, u, v):
    h, w = lev.shape[:2]
    fx = np.clip(u * w - 0.5, 0, max(w - 1.001, 0)); fy = np.clip((1 - v) * h - 0.5, 0, max(h - 1.001, 0))
    ix, iy = fx.astype(int), fy.astype(int); ix1, iy1 = np.minimum(ix + 1, w - 1), np.minimum(iy + 1, h - 1)
    ax, ay = (fx - ix)[..., None], (fy - iy)[..., None]
    return lev[iy, ix] * (1 - ax) * (1 - ay) + lev[iy, ix1] * ax * (1 - ay) + lev[iy1, ix] * (1 - ax) * ay + lev[iy1, ix1] * ax * ay


def trilin(levels, u, v, lam):
    lam = min(max(lam, 0.0), len(levels) - 1); L0 = int(math.floor(lam)); f = lam - L0
    a = bil(levels[L0], u, v)
    return a if (f == 0 or L0 + 1 >= len(levels)) else a * (1 - f) + bil(levels[L0 + 1], u, v) * f


def render(P, UV, C, atlas_lin, ppm, W, H, ox, oy, th_deg, SS=3, N=None, heading_deg=0.0, S=None, kh=1.0, ks=1.0, how='lamina'):
    """render_tex.render con el muestreo de la textura cambiado (how); con how = 'lamina' es el de render_tex.py."""
    S = np.zeros(len(P)) if S is None else np.asarray(S, float)
    TH = math.radians(th_deg)
    P = np.asarray(P, float); UV = np.asarray(UV, float); C = np.asarray(C, float)
    N = RTX.face_normals(P) if N is None else np.asarray(N, float)
    ps = math.radians(heading_deg); c, s = math.cos(ps), math.sin(ps)
    Ry = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    Pw = P @ Ry.T; Nw = N @ Ry.T
    sx = (Pw[:, 0] * ppm + ox) * SS
    sy = (-(Pw[:, 1] * math.cos(TH) - Pw[:, 2] * math.sin(TH)) * ppm + oy) * SS
    dep = -(Pw[:, 1] * math.sin(TH) + Pw[:, 2] * math.cos(TH))
    WS, HS = W * SS, H * SS
    zbuf = np.full((HS, WS), np.inf); col = np.zeros((HS, WS, 3)); cov = np.zeros((HS, WS), bool)
    ah, aw = atlas_lin.shape[:2]; box = how.endswith('box'); how = how[:-3] if box else how
    levels = (CHAINS_BOX if box else CHAINS).get(id(atlas_lin))
    V = np.array([0.0, math.sin(TH), math.cos(TH)])
    for t in range(len(P) // 3):
        i = 3 * t
        x0, x1, x2 = sx[i:i + 3]; y0, y1, y2 = sy[i:i + 3]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9: continue
        bx0 = max(int(math.floor(min(x0, x1, x2))), 0); bx1 = min(int(math.ceil(max(x0, x1, x2))), WS - 1)
        by0 = max(int(math.floor(min(y0, y1, y2))), 0); by1 = min(int(math.ceil(max(y0, y1, y2))), HS - 1)
        if bx1 < bx0 or by1 < by0: continue
        X, Y = np.meshgrid(np.arange(bx0, bx1 + 1) + 0.5, np.arange(by0, by1 + 1) + 0.5)
        w0 = ((x1 - X) * (y2 - Y) - (x2 - X) * (y1 - Y)) / area
        w1 = ((x2 - X) * (y0 - Y) - (x0 - X) * (y2 - Y)) / area
        w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any(): continue
        d = w0 * dep[i] + w1 * dep[i + 1] + w2 * dep[i + 2]
        zb = zbuf[by0:by1 + 1, bx0:bx1 + 1]
        upd = inside & (d < zb)
        if not upd.any(): continue
        n = w0[..., None] * Nw[i] + w1[..., None] * Nw[i + 1] + w2[..., None] * Nw[i + 2]
        n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-12
        if area > 0: n = -n
        u = w0 * UV[i, 0] + w1 * UV[i + 1, 0] + w2 * UV[i + 2, 0]
        v = w0 * UV[i, 1] + w1 * UV[i + 1, 1] + w2 * UV[i + 2, 1]
        if how == 'lamina' or levels is None:
            fx = np.clip(u * aw - 0.5, 0, aw - 1.001); fy = np.clip((1 - v) * ah - 0.5, 0, ah - 1.001)
            ix, iy = fx.astype(int), fy.astype(int); ax, ay = (fx - ix)[..., None], (fy - iy)[..., None]
            tex = (atlas_lin[iy, ix] * (1 - ax) * (1 - ay) + atlas_lin[iy, ix + 1] * ax * (1 - ay)
                   + atlas_lin[iy + 1, ix] * (1 - ax) * ay + atlas_lin[iy + 1, ix + 1] * ax * ay)
        else:
            # derivadas de la UV (afines por triángulo en ortográfica) por submuestra → por píxel (× SS)
            g0x, g0y = (y1 - y2) / area, (x2 - x1) / area; g1x, g1y = (y2 - y0) / area, (x0 - x2) / area
            g2x, g2y = -(g0x + g1x), -(g0y + g1y)
            dux = (g0x * UV[i, 0] + g1x * UV[i + 1, 0] + g2x * UV[i + 2, 0]); duy = (g0y * UV[i, 0] + g1y * UV[i + 1, 0] + g2y * UV[i + 2, 0])
            dvx = (g0x * UV[i, 1] + g1x * UV[i + 1, 1] + g2x * UV[i + 2, 1]); dvy = (g0y * UV[i, 1] + g1y * UV[i + 1, 1] + g2y * UV[i + 2, 1])
            # MSAA: la textura se muestrea en el centro del píxel (la UV afín extrapolada hasta él)
            Xc = (np.floor(X / SS) + 0.5) * SS; Yc = (np.floor(Y / SS) + 0.5) * SS
            uc = u + dux * (Xc - X) + duy * (Yc - Y); vc = v + dvx * (Xc - X) + dvy * (Yc - Y)
            rx = math.hypot(dux * SS * aw, dvx * SS * ah); ry = math.hypot(duy * SS * aw, dvy * SS * ah)
            pmax, pmin = max(rx, ry), max(min(rx, ry), 1e-9)
            if how == 'iso':
                tex = trilin(levels, uc, vc, math.log2(max(pmax, 1e-9)))
            else:  # aniso
                Na = int(min(max(math.ceil(pmax / pmin - 1e-9), 1), 16)); lam = math.log2(max(pmax / Na, 1e-9))
                mu, mv = (dux * SS, dvx * SS) if rx >= ry else (duy * SS, dvy * SS)
                tex = sum(trilin(levels, uc + ((k + 0.5) / Na - 0.5) * mu, vc + ((k + 0.5) / Na - 0.5) * mv, lam) for k in range(Na)) / Na
        alb = tex * (w0[..., None] * C[i] + w1[..., None] * C[i + 1] + w2[..., None] * C[i + 2])
        hemi = M.GROUND + (M.SKY - M.GROUND) * (0.5 * n[..., 1:2] + 0.5)
        ndl = np.clip(n @ M.LD, 0, None)[..., None]
        sw = (w0 * S[i] + w1 * S[i + 1] + w2 * S[i + 2])[..., None]; fh, fs = 1 + sw * (kh - 1), 1 + sw * (ks - 1)
        rgb = alb / math.pi * (M.IH * hemi * fh + M.IS * M.SUN * ndl * fs)
        if M.GGX:
            Hh = M.LD + V; Hh /= np.linalg.norm(Hh)
            nv = np.clip(n @ V, 1e-4, 1)[..., None]; nl = np.clip(n @ M.LD, 0, 1)[..., None]; nh = np.clip(n @ Hh, 0, 1)[..., None]
            vh = max(float(V @ Hh), 0.0); a2 = (0.85 ** 2) ** 2
            D = a2 / (math.pi * (nh * nh * (a2 - 1) + 1) ** 2)
            Vis = 0.5 / (nl * np.sqrt(a2 + (1 - a2) * nv * nv) + nv * np.sqrt(a2 + (1 - a2) * nl * nl) + 1e-6)
            F = 0.04 + 0.96 * (1 - vh) ** 5
            rgb = rgb + M.IS * M.SUN * nl * F * Vis * D * fs
        zb[upd] = d[upd]
        col[by0:by1 + 1, bx0:bx1 + 1][upd] = M.lin2srgb(rgb[upd])
        cov[by0:by1 + 1, bx0:bx1 + 1][upd] = True
    covp = cov.reshape(H, SS, W, SS).mean((1, 3))
    colp = (col * cov[..., None]).reshape(H, SS, W, SS, 3).sum((1, 3)) / (SS * SS)
    return colp, covp


def patched(*a, **k):
    m = MODE['m']
    if m == 'lamina' or id(a[3]) not in CHAINS: return ORIG(*a, **k)  # la sombra (atlas blanco) va siempre como en la lámina
    if m == 'ideal': k['SS'] = 8; return ORIG(*a, **k)
    return render(*a, how=m.split('-')[0], **k)


RTX.render = patched  # LC.shot llama a RTX.render del mismo módulo


def receta(npz, ktx):
    d = np.load(npz); P = d['p']; N = CV.vertex_normals(P)
    C4 = np.concatenate([d['c'], d['r'][:, None]], axis=1); Pc, UVc, C4c, Nc = RTX.clip_below_water(P, d['t'], C4, N)
    atlas = A.ktx_lin(ktx); ch = chain(ktx)
    c1 = bool(np.array_equal(ch[0], atlas)); CHAINS[id(atlas)] = ch
    # mips ideales: la caja 2 × 2 en lineal, nivel a nivel, desde el nivel 0 de la KTX2 (sin la codificación de los mips)
    bx = [atlas]
    while bx[-1].shape[0] > 1: a = bx[-1]; bx.append(a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2, 3).mean((1, 3)))
    CHAINS_BOX[id(atlas)] = bx
    return dict(P=Pc, UV=UVc, C=C4c[:, :3], S=C4c[:, 3], N=Nc, A=atlas, shadow=True), c1, [l.shape[0] for l in ch]


def shot_mode(mod, th, hd, ppm, fr, SS, mode, dpr=1.0):
    MODE['m'] = mode
    if dpr == 1.0: return LC.shot(mod, th, hd, ppm, fr, SS=SS)
    W, H, ox, oy = fr; Wd, Hd = int(round(W * dpr)), int(round(H * dpr))
    big = LC.shot(mod, th, hd, ppm * dpr, (Wd, Hd, ox * dpr, oy * dpr), SS=SS)
    return big.resize((W, H), Image.BOX)


def Yof(im): a = np.asarray(im, float); return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def detalle(im, mask):
    y = Yof(im); yb = np.asarray(Image.fromarray(np.clip(y, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1)), float)
    return float(np.abs(y - yb)[mask].mean())


def psnr(a, b, mask):
    d = (np.asarray(a, float) - np.asarray(b, float))[mask]; mse = float((d ** 2).mean()); return 99.0 if mse == 0 else 10 * math.log10(255 ** 2 / mse)


G = os.path.join(UXA, 'goleta-c665cb4'); F = os.path.join(UXA, 'fragata-7f7d97c')
SHIPS = [('Fragata', 'frigate', F), ('Goleta', 'schooner', G), ('Balandra', 'sloop', G)]
VIEWS = [('1440×900', 55, 135, 6.2, 3, 2.0), ('móvil 390×844', 55, 135, 2.8, 4, 1.5)]
MODES = [('lamina', 'la lámina (nivel 0, sin mip)', 1.0), ('ideal', 'filtro ideal (64 muestras)', 1.0),
         ('iso', 'juego, DPR 1, sin anisótropo', 1.0), ('aniso', 'juego, DPR 1, anisótropo 16', 1.0),
         ('isobox', 'DPR 1, sin aniso., mips ideales', 1.0), ('anisobox', 'DPR 1, aniso. 16, mips ideales', 1.0),
         ('iso-dpr', 'juego, DPR máx., sin anisótropo', None), ('aniso-dpr', 'juego, DPR máx., anisótropo 16', None)]
res = {}; tiles = {}; t0 = time.time()
for nombre, cls, base in SHIPS:
    for fam in ('gb', 'es'):
        mod, c1, lv = receta(os.path.join(base, 'out', 'cadena', f'{cls}_{fam}_lod0.npz'), os.path.join(base, 'out', 'cadena', 'comp', f'atlas_{cls}_{fam}.ktx2'))
        print(f'{nombre} {fam}: cadena de {len(lv)} niveles {lv[:3]}… · C1 nivel 0 = ktx_lin: {c1}', flush=True)
        for vt, th, hd, ppm, SS, dmax in VIEWS:
            fr = LC.fit((mod,), th, hd, ppm)
            if nombre == 'Goleta' and fam == 'gb' and ppm == 6.2:  # C2: este renderizador con el muestreo de la lámina = render_tex
                a, ca = ORIG(mod['P'], mod['UV'], mod['C'], mod['A'], ppm, fr[0], fr[1], fr[2], fr[3], th, SS=SS, N=mod['N'], heading_deg=hd, S=mod['S'], kh=LC.KH, ks=LC.KS)
                b, cb = render(mod['P'], mod['UV'], mod['C'], mod['A'], ppm, fr[0], fr[1], fr[2], fr[3], th, SS=SS, N=mod['N'], heading_deg=hd, S=mod['S'], kh=LC.KH, ks=LC.KS, how='lamina')
                print(f'  C2 render() con el muestreo de la lámina = render_tex.render: {bool(np.array_equal(a, b) and np.array_equal(ca, cb))}', flush=True)
            MODE['m'] = 'lamina'
            _, cov = ORIG(mod['P'], mod['UV'], mod['C'], mod['A'], ppm, fr[0], fr[1], fr[2], fr[3], th, SS=SS, N=mod['N'], heading_deg=hd, S=mod['S'], kh=LC.KH, ks=LC.KS)
            mask = np.asarray(Image.fromarray((cov >= 0.999).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(5))) > 0
            ims = {}
            for m, _, dpr in MODES:
                ims[m] = shot_mode(mod, th, hd, ppm, fr, SS, m, dmax if dpr is None else dpr)
            dl = detalle(ims['lamina'], mask)
            for m, _, dpr in MODES:
                r = dict(psnr=round(psnr(ims[m], ims['lamina'], mask), 2), detalle=round(detalle(ims[m], mask), 3), detalle_rel=round(detalle(ims[m], mask) / dl, 3))
                res[f'{nombre}|{fam}|{vt}|{m}'] = r
                print(f'  {nombre} {fam} · {vt} {ppm} px/m · {m:9s} · PSNR frente a la lámina {r["psnr"]:6.2f} dB · detalle {r["detalle"]:.3f} = {100 * r["detalle_rel"]:.0f} % de la lámina · {mask.sum()} px', flush=True)
            tiles[(nombre, fam, vt)] = ims
            for m in ims: ims[m].save(os.path.join(OUTD, f'{cls}_{fam}_{ppm}_{m}.png'))
print(f'tiempo {time.time() - t0:.0f} s', flush=True)
json.dump(res, open(os.path.join(OUTD, 'medidas.json'), 'w'), ensure_ascii=False, indent=1)

# --- hoja de comparación (evidencia para producto y el lead, no es una lámina): cada vista a 1× y un recorte a 4×
fnt = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15); fb = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 17)
rows = []
for (nombre, fam, vt), ims in tiles.items():
    w, h = ims['lamina'].size; Z = 4; cw, ch = min(w, 110), min(h, 70); cx, cy = (w - cw) // 2, (h - ch) // 2
    cell = max(w, cw * Z) + 16; rh = h + ch * Z + 70
    row = Image.new('RGB', (cell * len(MODES), rh), (245, 241, 230)); d = ImageDraw.Draw(row)
    for j, (m, lab, _) in enumerate(MODES):
        x = j * cell + 8; im = ims[m]; r = res[f'{nombre}|{fam}|{vt}|{m}']
        d.text((x, 4), lab, font=fnt, fill=(43, 29, 14))
        d.text((x, 22), f'detalle {100 * r["detalle_rel"]:.0f} % · PSNR {r["psnr"]:.1f} dB' if m != 'lamina' else 'detalle 100 % (referencia)', font=fnt, fill=(92, 74, 51))
        row.paste(im, (x, 44)); row.paste(im.crop((cx, cy, cx + cw, cy + ch)).resize((cw * Z, ch * Z), Image.NEAREST), (x, 52 + h))
        d.rectangle((x + cx, 44 + cy, x + cx + cw, 44 + cy + ch), outline=(162, 59, 42))
    hdr = Image.new('RGB', (row.width, 30), (245, 241, 230)); ImageDraw.Draw(hdr).text((8, 6), f'{nombre} · {"británica" if fam == "gb" else "española"} · {vt}', font=fb, fill=(107, 58, 26))
    rows += [hdr, row]
Wt = max(r.width for r in rows); out = Image.new('RGB', (Wt, sum(r.height for r in rows)), (245, 241, 230)); y = 0
for r in rows: out.paste(r, (0, y)); y += r.height
out.save(os.path.join(OUTD, 'comparacion-mip-D95.png')); print('hoja', os.path.join(OUTD, 'comparacion-mip-D95.png'), out.size)

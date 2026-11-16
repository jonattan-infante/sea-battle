# Uso (desde la raíz del repo), tras navio.py y comprimir.sh:
#   python3 -I scripts/ux/barcos/respaldo.py medir    →  la medida de los tamaños del respaldo (tabla en la salida)
#   python3 -I scripts/ux/barcos/respaldo.py glb 64   →  $UX_OUT/piloto/comp/ship_line_{gb,es}.glb con el respaldo de 64²
# Respaldo de la textura (salida 1 de AC-193 c; ASSET-SPEC §13, D90): una imagen pequeña en `texture.source` junto a la
# KTX2 de KHR_texture_basisu, para dibujar el barco antes de que llegue el transcodificador. Es el mismo atlas con menos
# resolución: cada región se reduce en luz lineal a su bloque, sin mezclarse con las vecinas, el texel blanco del aparejo
# sigue blanco y los huecos se rellenan con el texel usado más cercano. «medir» lo compara con la KTX2 descodificada
# (dec_<fam>.png, lo que muestra la GPU) con la cámara y la luz del juego (render_tex.py), filtrado trilineal como el de
# three.js (mipmaps de la KTX2 y los que genera para el respaldo). Ligero: segundos, un núcleo. No corre en la CI.
import sys, os, math, json, struct, io
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'laminas'), os.path.join(HERE, '..', 'mapa')): sys.path.insert(0, p)
import rutas as RT
import render_tex as RTX
from navio import R as REG, A as ASIZE
import numpy as np
from PIL import Image

PIL_ = os.environ.get('UX_PILOTO', os.path.join(RT.OUT, 'piloto'))
M = RTX.M
SEA = np.array([26, 95, 134.0]) / 255


def fallback(atlas_png, N, regions=REG, size=ASIZE, mix=False):
    """Respaldo de N² en sRGB. Sin mix, cada región se reduce a su bloque (sus bordes caen en bordes de texel: múltiplos de
    size/N); con mix, el atlas entero se reduce de golpe (lo que haría un redimensionado normal). El texel blanco se amplía
    a todos los texels que toca, y los huecos toman el color medio de sus vecinos usados, de fuera hacia dentro."""
    a = RTX.srgb2lin(np.asarray(Image.open(atlas_png).convert('RGB'), float)); k = size // N
    out = np.zeros((N, N, 3)); used = np.zeros((N, N), bool)
    if mix:
        out = a.reshape(N, k, N, k, 3).mean((1, 3)); used[:] = True
    else:
        for name, (x, y, w, h) in regions.items():
            if name == 'white': continue
            assert x % k == 0 and y % k == 0 and w % k == 0 and h % k == 0, f'la región {name} no cae en texels de {N}²'
            out[y // k:(y + h) // k, x // k:(x + w) // k] = a[y:y + h, x:x + w].reshape(h // k, k, w // k, k, 3).mean((1, 3))
            used[y // k:(y + h) // k, x // k:(x + w) // k] = True
    x, y, w, h = regions['white']; out[y // k:-(-(y + h) // k), x // k:-(-(x + w) // k)] = 1.0
    used[y // k:-(-(y + h) // k), x // k:-(-(x + w) // k)] = True
    while not used.all():
        acc = np.zeros_like(out); n = np.zeros((N, N))
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            u = np.roll(used, (dy, dx), (0, 1)); acc += np.roll(out, (dy, dx), (0, 1)) * u[..., None]; n += u
        new = ~used & (n > 0); out[new] = acc[new] / n[new][:, None]; used |= new
    return Image.fromarray(np.round(M.lin2srgb(out) * 255).astype(np.uint8))


def encode(img, fmt):
    b = io.BytesIO()
    if fmt == 'png': img.save(b, 'PNG', optimize=True)
    else: img.save(b, 'JPEG', quality=85, subsampling=0, optimize=True)
    return b.getvalue()


# --- render diferido: la luz se calcula una vez por vista y se cambia solo la textura
def gbuffer(P, UV, C, ppm, th_deg, heading_deg, SS=3, margin=10):
    """Como render_tex.render, pero guarda por muestra la UV, el factor difuso (COLOR_0 × luz), el especular y cuántas
    unidades de UV recorre un px de pantalla (para elegir el mip). Encuadra el barco con `margin` px."""
    TH = math.radians(th_deg); P = np.asarray(P, float); UV = np.asarray(UV, float); C = np.asarray(C, float); N = RTX.face_normals(P)
    ps = math.radians(heading_deg); c, s = math.cos(ps), math.sin(ps); Ry = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    Pw = P @ Ry.T; Nw = N @ Ry.T
    X0 = Pw[:, 0] * ppm; Y0 = -(Pw[:, 1] * math.cos(TH) - Pw[:, 2] * math.sin(TH)) * ppm
    ox, oy = margin - X0.min(), margin - Y0.min(); W = int(math.ceil(X0.max() + ox + margin)); H = int(math.ceil(Y0.max() + oy + margin))
    sx, sy = (X0 + ox) * SS, (Y0 + oy) * SS; dep = -(Pw[:, 1] * math.sin(TH) + Pw[:, 2] * math.cos(TH))
    WS, HS = W * SS, H * SS; V = np.array([0.0, math.sin(TH), math.cos(TH)])
    zb = np.full((HS, WS), np.inf); cov = np.zeros((HS, WS), bool)
    U = np.zeros((HS, WS)); Vv = np.zeros((HS, WS)); K = np.zeros((HS, WS, 3)); SP = np.zeros((HS, WS, 3)); RHO = np.zeros((HS, WS))
    Hh = M.LD + V; Hh /= np.linalg.norm(Hh); vh = max(float(V @ Hh), 0.0); a2 = (0.85 ** 2) ** 2
    for t in range(len(P) // 3):
        i = 3 * t; x0, x1, x2 = sx[i:i + 3]; y0, y1, y2 = sy[i:i + 3]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9: continue
        bx0, bx1 = max(int(math.floor(min(x0, x1, x2))), 0), min(int(math.ceil(max(x0, x1, x2))), WS - 1)
        by0, by1 = max(int(math.floor(min(y0, y1, y2))), 0), min(int(math.ceil(max(y0, y1, y2))), HS - 1)
        if bx1 < bx0 or by1 < by0: continue
        X, Y = np.meshgrid(np.arange(bx0, bx1 + 1) + 0.5, np.arange(by0, by1 + 1) + 0.5)
        w0 = ((x1 - X) * (y2 - Y) - (x2 - X) * (y1 - Y)) / area; w1 = ((x2 - X) * (y0 - Y) - (x0 - X) * (y2 - Y)) / area; w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        d = w0 * dep[i] + w1 * dep[i + 1] + w2 * dep[i + 2]; z = zb[by0:by1 + 1, bx0:bx1 + 1]; upd = inside & (d < z)
        if not upd.any(): continue
        n = w0[..., None] * Nw[i] + w1[..., None] * Nw[i + 1] + w2[..., None] * Nw[i + 2]; n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-12
        if area > 0: n = -n
        hemi = M.GROUND + (M.SKY - M.GROUND) * (0.5 * n[..., 1:2] + 0.5); ndl = np.clip(n @ M.LD, 0, None)[..., None]
        k_ = (w0[..., None] * C[i] + w1[..., None] * C[i + 1] + w2[..., None] * C[i + 2]) / math.pi * (M.IH * hemi + M.IS * M.SUN * ndl)
        nv = np.clip(n @ V, 1e-4, 1)[..., None]; nl = np.clip(n @ M.LD, 0, 1)[..., None]; nh = np.clip(n @ Hh, 0, 1)[..., None]
        Dd = a2 / (math.pi * (nh * nh * (a2 - 1) + 1) ** 2); Vis = 0.5 / (nl * np.sqrt(a2 + (1 - a2) * nv * nv) + nv * np.sqrt(a2 + (1 - a2) * nl * nl) + 1e-6)
        sp = M.IS * M.SUN * nl * (0.04 + 0.96 * (1 - vh) ** 5) * Vis * Dd
        # derivadas de la UV por px de pantalla (constantes en ortográfica): dw/dX y dw/dY de las baricéntricas
        g0x, g0y, g1x, g1y = (y1 - y2) / area, (x2 - x1) / area, (y2 - y0) / area, (x0 - x2) / area
        du = UV[i:i + 3, :]; dX = du[0] * g0x + du[1] * g1x - du[2] * (g0x + g1x); dY = du[0] * g0y + du[1] * g1y - du[2] * (g0y + g1y)
        rho = max(math.hypot(*dX), math.hypot(*dY)) * SS
        sl = (slice(by0, by1 + 1), slice(bx0, bx1 + 1))
        z[upd] = d[upd]; cov[sl][upd] = True; RHO[sl][upd] = rho
        U[sl][upd] = (w0 * UV[i, 0] + w1 * UV[i + 1, 0] + w2 * UV[i + 2, 0])[upd]
        Vv[sl][upd] = (w0 * UV[i, 1] + w1 * UV[i + 1, 1] + w2 * UV[i + 2, 1])[upd]
        K[sl][upd] = k_[upd]; SP[sl][upd] = sp[upd]
    return dict(U=U, V=Vv, K=K, SP=SP, RHO=RHO, cov=cov, W=W, H=H, SS=SS)


def mips(img):
    """Cadena de mips en lineal, con media de 2 × 2 (la de generateMipmap y, aproximada, la de la KTX2)."""
    a = RTX.srgb2lin(np.asarray(img.convert('RGB'), float)); out = [a]
    while out[-1].shape[0] > 2: b = out[-1]; out.append(b.reshape(b.shape[0] // 2, 2, b.shape[1] // 2, 2, 3).mean((1, 3)))
    return out


def bilinear(a, u, v):
    h, w = a.shape[:2]; fx = np.clip(u * w - 0.5, 0, w - 1.001); fy = np.clip((1 - v) * h - 0.5, 0, h - 1.001)
    ix, iy = fx.astype(int), fy.astype(int); ax, ay = (fx - ix)[..., None], (fy - iy)[..., None]
    return a[iy, ix] * (1 - ax) * (1 - ay) + a[iy, ix + 1] * ax * (1 - ay) + a[iy + 1, ix] * (1 - ax) * ay + a[iy + 1, ix + 1] * ax * ay


def shade(gb, chain):
    """Imagen sRGB [0, 1] y cobertura por px, con filtrado trilineal (LinearMipmapLinear) sobre la cadena de mips."""
    m = gb['cov']; u, v, rho = gb['U'][m], gb['V'][m], gb['RHO'][m]
    lam = np.clip(np.log2(np.maximum(rho * chain[0].shape[0], 1e-9)), 0, len(chain) - 1); l0 = np.floor(lam).astype(int); f = (lam - l0)[:, None]
    tex = np.zeros((len(u), 3))
    for L in np.unique(l0):
        s = l0 == L; a = bilinear(chain[L], u[s], v[s]); b = bilinear(chain[min(L + 1, len(chain) - 1)], u[s], v[s])
        tex[s] = a * (1 - f[s]) + b * f[s]
    col = np.zeros(gb['K'].shape); col[m] = M.lin2srgb(tex * gb['K'][m] + gb['SP'][m])
    SS, W, H = gb['SS'], gb['W'], gb['H']
    covp = m.reshape(H, SS, W, SS).mean((1, 3)); rgb = (col * m[..., None]).reshape(H, SS, W, SS, 3).sum((1, 3)) / (SS * SS)
    return rgb + SEA * (1 - covp[..., None]), covp


def dE(a, b, full):
    """ΔE76 por px (sobre los px cubiertos del todo) y ΔE del color medio del barco."""
    la, lb = M.lab(a * 255), M.lab(b * 255); e = np.linalg.norm(la - lb, axis=-1)[full]
    ma, mb = [M.lab(np.array(M.lin2srgb(RTX.srgb2lin(x[full] * 255).mean(0))) * 255) for x in (a, b)]
    return float(e.mean()), float(np.percentile(e, 95)), float(np.linalg.norm(ma - mb))


VIEWS = [('escritorio 0,7× (el más cerca)', 6.20 / 0.7), ('escritorio 1,0×', 6.20), ('móvil 1,0×', 2.82)]

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'medir'
    if cmd == 'medir':
        out = os.path.join(RT.OUT, 'respaldo'); os.makedirs(out, exist_ok=True); rows = []
        for fam in ('es', 'gb'):
            z = np.load(RT.need(os.path.join(PIL_, f'navio_{fam}_lod0.npz'), f'navio_{fam}_lod0.npz (barcos/navio.py)'))
            P, UVc, Cc, _ = RTX.clip_below_water(z['p'], z['t'], z['c'])
            src = RT.need(os.path.join(PIL_, f'atlas_{fam}.png'), 'el atlas'); ref = mips(Image.open(RT.need(os.path.join(PIL_, 'comp', f'dec_{fam}.png'), 'la KTX2 descodificada')))
            cands = {'sin textura': [np.ones((2, 2, 3))], 'atlas original 1024²': mips(Image.open(src))}  # COLOR_0 solo; y la base: el PNG sin comprimir
            imgs = {'32² mezclado': fallback(src, 32, mix=True)}
            for n in (64, 128, 256): imgs[f'{n}²'] = fallback(src, n)
            for name, im in imgs.items():
                for fmt in ('png', 'jpeg'):
                    data = encode(im, fmt); dec = Image.open(io.BytesIO(data)).convert('RGB')
                    cands[f'{name} {fmt}'] = mips(dec); rows.append((fam, name, fmt, len(data)))
                    dec.save(os.path.join(out, f'respaldo_{fam}_{name.split("²")[0]}.{fmt}.png'))
            for vname, ppm in VIEWS:
                gb = gbuffer(P, UVc, Cc, ppm, 55, 135); r_img, r_cov = shade(gb, ref); full = r_cov > 0.999
                Image.fromarray(np.round(r_img * 255).astype(np.uint8)).save(os.path.join(out, f'{fam}_{ppm:.2f}_ktx2.png'))
                for cname, chain in cands.items():
                    img, _ = shade(gb, chain); e = dE(img, r_img, full)
                    Image.fromarray(np.round(img * 255).astype(np.uint8)).save(os.path.join(out, f'{fam}_{ppm:.2f}_{cname.replace(" ", "_").replace("²", "")}.png'))
                    rows.append((fam, vname, cname, round(e[0], 2), round(e[1], 2), round(e[2], 2)))
        for r in rows: print(*r, sep=' · ')
    elif cmd == 'glb':
        N = int(sys.argv[2]); comp = os.path.join(PIL_, 'comp')
        for fam in ('gb', 'es'):
            path = RT.need(os.path.join(comp, f'ship_line_{fam}.glb'), 'el GLB comprimido (comprimir.sh)'); data = open(path, 'rb').read()
            png = encode(fallback(os.path.join(PIL_, f'atlas_{fam}.png'), N), 'png')
            magic, _, _ = struct.unpack_from('<4sII', data, 0); jl, jt = struct.unpack_from('<I4s', data, 12); assert magic == b'glTF' and jt == b'JSON'
            js = json.loads(data[20:20 + jl]); bl, bt = struct.unpack_from('<I4s', data, 20 + jl); assert bt == b'BIN\x00'
            assert not any('KHR_texture_basisu' not in t.get('extensions', {}) for t in js['textures']), 'ya tiene respaldo o no es KTX2'
            assert all('source' not in t for t in js['textures']), 'ya tiene respaldo'
            bin_ = bytearray(data[28 + jl:28 + jl + bl]); bo = len(bin_); bin_ += png
            while len(bin_) % 4: bin_.append(0)
            js['bufferViews'].append({'buffer': 0, 'byteOffset': bo, 'byteLength': len(png)})
            js['images'].append({'bufferView': len(js['bufferViews']) - 1, 'mimeType': 'image/png', 'name': f'respaldo_{N}'})
            for t in js['textures']: t['source'] = len(js['images']) - 1  # el respaldo; la KTX2 sigue en la extensión
            js['buffers'][0]['byteLength'] = len(bin_)
            js['extensionsRequired'] = [e for e in js.get('extensionsRequired', []) if e != 'KHR_texture_basisu']
            if not js['extensionsRequired']: del js['extensionsRequired']
            jb = json.dumps(js, separators=(',', ':'), ensure_ascii=False).encode(); jb += b' ' * (-len(jb) % 4)
            outb = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(jb) + 8 + len(bin_)) + struct.pack('<I4s', len(jb), b'JSON') + jb + struct.pack('<I4s', len(bin_), b'BIN\x00') + bytes(bin_)
            dst = os.path.join(comp, f'ship_line_{fam}_respaldo{N}.glb'); open(dst, 'wb').write(outb)
            print(dst, len(data), '→', len(outb), 'B; respaldo PNG', len(png), 'B')

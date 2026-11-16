# Cuánto de la Fragata (la clase más grande del jugador, ship-geometry.ts:224-250 en 7cfe265) tapa el panel del apaisado
# de D98, a zoom por defecto (ppm 3,44, V.LAN), con el barco en el centro (422, 195) px CSS. Proyección ortográfica a la
# escala del barco: x = 422 + ppm·X, y = 195 + ppm·(Z·sen55 − Y·cos55) (cámara a 55°, norte arriba). Rasteriza a ×4
# el casco (perfil «standard», línea de flotación y cubierta), castillos, bauprés, mástiles, velas cuadras con braza
# de 20°, cangreja abierta 25° y foques. Sin el gallardete. Uso: [PPM=4.914] python3 -I fragata_panel.py <x1 del panel> [y0 y1]
# (PPM 3,44 = ppm₀ del apaisado con R 65 m, el mayor; 4,914 = 3,44 / 0,7, el zoom más cercano). Lo importa lamina_opciones.py.
import sys, math, os
import numpy as np
from PIL import Image, ImageDraw
CX, CY = 422.0, 195.0
s55, c55 = math.sin(math.radians(55)), math.cos(math.radians(55))
L, B, F = 34.0, 8.6, 2.8
STD = [(-0.5, 0.8, 0.62, 1.3), (-0.4, 0.96, 0.85, 1.15), (-0.25, 1.0, 0.93, 1.04), (0, 1.0, 0.95, 1.0), (0.2, 0.97, 0.88, 1.03),
       (0.36, 0.72, 0.56, 1.12), (0.5, 0, 0, 1.28)]   # u, a (manga en cubierta), manga en flotación, s (altura de cubierta)
def ring(col, yfun):
    st = [(u * L, r[col] * B / 2, yfun(r)) for r in STD for u in [r[0]]]
    return [(x, y, z) for z, x, y in [(z, hb, yy) for z, hb, yy in st]] + [(-x, y, z) for z, x, y in [(z, hb, yy) for z, hb, yy in reversed(st)]]
def poly_side(col, yfun):
    st = [(r[0] * L, r[col] * B / 2, yfun(r)) for r in STD]
    return [(hb, yy, z) for z, hb, yy in st] + [(-hb, yy, z) for z, hb, yy in reversed(st)]
polys = []
wl = poly_side(2, lambda r: 0.0); dk = poly_side(1, lambda r: r[3] * F + 1.0)   # flotación y borda (railH 1,0)
polys += [wl, dk]
for i in range(len(wl)):   # costados: cuadriláteros entre flotación y borda
    j = (i + 1) % len(wl); polys.append([wl[i], wl[j], dk[j], dk[i]])
def box(sz, p):
    sx, sy, sz_ = sz; px, py, pz = p; pts = []
    for dx in (-1, 1):
        for dy in (-1, 1):
            for dz in (-1, 1): pts.append((px + dx * sx / 2, py + dy * sy / 2, pz + dz * sz_ / 2))
    return pts
hulls = [box((6.9, 1.6, 9.0), (0, 3.96, -12.5)), box((5.6, 1.0, 5.5), (0, 3.64, 12.25))]
lines = [((0, 3.5, 16.0), (0, 6.58, 24.46), 0.45)]                        # bauprés
for z, h in ((10, 24), (0.5, 27), (-9.5, 21)): lines.append(((0, 3.0, z), (0, h, z), 0.35))
b20 = math.radians(20)
def braced(z, x, y, dz=0.45):  # braza de +20° alrededor del eje del mástil
    return (x * math.cos(b20) + dz * math.sin(b20), y, z - x * math.sin(b20) + dz * math.cos(b20))
for z, sq in ((10, [(12.0, 4.6, 5.6), (9.8, 4.0, 10.6), (7.4, 3.0, 15.0)]), (0.5, [(13.2, 5.0, 5.6), (10.8, 4.4, 11.0), (8.0, 3.2, 15.8)]),
              (-9.5, [(7.6, 3.2, 14.0)])):
    for w, h, yb in sq:
        w2 = w / 2 + 0.3
        polys.append([braced(z, -w2, yb), braced(z, w2, yb), braced(z, w2, yb + h), braced(z, -w2, yb + h)])
op = math.radians(25)
def gaff(zy):  # cangreja abierta 25° alrededor del mástil (eje vertical por A)
    z, y = zy; dz = z - (-9.9); return (dz * math.sin(op), y, -9.9 + dz * math.cos(op))
polys.append([gaff(p) for p in ([-9.9, 5.4], [-9.9, 13.0], [-16.9, 14.6], [-18.4, 6.0])])
for H, T_, C in (((0, 18.7, 10.3), (0, 5.35, 21.08), (0, 4.34, 15.15)), ((0, 21.6, 10.3), (0, 6.58, 24.46), (0, 4.34, 16.67))):
    polys.append([H, T_, C])

def proj(p, hd, PPM, K):
    x, y, z = p; c, s = math.cos(hd), math.sin(hd)
    X = x * c + z * s; Z = -x * s + z * c   # rumbo hd: la proa (+Z del modelo) apunta a (sen hd, cos hd) en el mundo
    return ((CX + PPM * X) * K, (CY + PPM * (Z * s55 - y * c55)) * K)
def convex(pts):
    pts = sorted(set(pts))
    if len(pts) < 3: return pts
    def cr(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]
def mask(PPM, deg, K=4):
    """La silueta en una imagen L de 844·K × 390·K (255 dentro)."""
    hd = math.radians(deg)
    im = Image.new('L', (844 * K, 390 * K), 0); d = ImageDraw.Draw(im)
    for pg in polys: d.polygon([proj(p, hd, PPM, K) for p in pg], fill=255)
    for pts in hulls: d.polygon(convex([proj(p, hd, PPM, K) for p in pts]), fill=255)
    for a, b, r in lines: d.line([proj(a, hd, PPM, K), proj(b, hd, PPM, K)], fill=255, width=max(1, round(2 * r * PPM * K)))
    return im


def tapa(PPM, x1, y0, y1, K=4):
    """Por rumbo (cada 5°): (rumbo, fracción de la silueta bajo el panel, x0, x1, y0, y1 de la silueta, px bajo el panel)."""
    res = []
    for deg in range(0, 360, 5):
        m = np.asarray(mask(PPM, deg, K)) > 127
        ys, xs = np.nonzero(m); tot = m.sum()
        cov = m[int(y0 * K):int(y1 * K), :int(x1 * K)].sum()
        res.append((deg, cov / tot, xs.min() / K, xs.max() / K, ys.min() / K, ys.max() / K, x1 - xs.min() / K))
    return res


if __name__ == '__main__':
    X1 = float(sys.argv[1]); Y0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0; Y1 = float(sys.argv[3]) if len(sys.argv) > 3 else 390
    res = tapa(float(os.environ.get('PPM', '3.44')), X1, Y0, Y1)
    w = max(res, key=lambda r: r[1])
    print(f'x1 {X1}: peor rumbo {w[0]}° tapa {100 * w[1]:.1f} % de la silueta; x de la silueta {w[2]:.1f}–{w[3]:.1f}, {max(0, w[6]):.1f} px bajo el panel')
    for deg in (0, 45, 90, 135, 180, 225, 270, 315):
        r = [q for q in res if q[0] == deg][0]
        print(f'  rumbo {deg:3d}°: tapa {100 * r[1]:5.1f} %  silueta x {r[2]:6.1f}–{r[3]:6.1f}  y {r[4]:6.1f}–{r[5]:6.1f}')

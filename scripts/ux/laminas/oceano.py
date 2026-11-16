# Uso: lo importan lamina_islas.py y lamina_puerto.py. Depende del renderizador de RT.RENDERER (ver rutas.py). No corre en la CI.
# Fondo de océano de las láminas: ART-DIRECTION §7.2 en reposo (h = 0, n = 0): base, aguas someras (≤ 18 m), orilla
# (≤ 4 m) y Fresnel; la espuma de orilla de §7.3 se aproxima en estático. Mezclas en lineal, como el shader.
import os, sys, math, importlib.util
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import rutas as RT
import numpy as np
RT.need(RT.RENDERER, 'el renderizador por software'); spec = importlib.util.spec_from_file_location('model', RT.RENDERER)
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
from escena import hexlin
L = {k: np.array(hexlin(v)) for k, v in {'deep': '#1A5F86', 'trough': '#154F72', 'crest': '#2F7AA3', 'shallow': '#2C93A8', 'shore': '#49B9BE',
                                         'foam': '#EAF6FA', 'sky': '#9CCBE6', 'edge': '#0F3F5C'}.items()}
def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def enc(c):
    c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055) * 255
def ocean(W, H, ox, oy, ppm, th_deg, circles, x0=0.0, z0=0.0, foam=True, edge=None):
    """circles: [(x, z, r)] en las mismas coordenadas que la geometría (origen en el píxel (ox, oy) = mundo (x0, z0))."""
    th = math.radians(th_deg)
    px = np.arange(W) + 0.5; py = np.arange(H) + 0.5
    X = x0 + (px[None, :] - ox) / ppm; Z = z0 + (py[:, None] - oy) / (ppm * math.sin(th))
    X, Z = np.broadcast_arrays(X, Z)
    d = np.full(X.shape, 1e9)
    for cx, cz, r in circles: d = np.minimum(d, np.hypot(X - cx, Z - cz) - r)
    c0 = L['deep'] + (L['trough'] + (L['crest'] - L['trough']) * sstep(-0.6, 0.8, 0.0) - L['deep']) * 0.55
    c = np.broadcast_to(c0, X.shape + (3,)).copy()
    s = (1 - sstep(0, 18, d))[..., None]; c = c + (L['shallow'] - c) * 0.85 * s
    s2 = (1 - sstep(0, 4, d))[..., None]; c = c + (L['shore'] - c) * s2
    if foam:
        f = np.where((d >= 0) & (d <= 2.5), 0.8 * (1 - d / 2.5) * (0.5 + 0.5 * np.sin(2.4 * d)), 0)[..., None]
        c = c + (L['foam'] - c) * f
    nv = math.sin(th); F = 0.02 + 0.98 * (1 - nv) ** 5; c = c + (L['sky'] - c) * 0.6 * F
    if edge is not None:
        out = ((np.abs(X) > edge) | (np.abs(Z) > edge))[..., None]; c = np.where(out, L['edge'], c)
    return enc(c)
def shot(geo, W, H, ox, oy, ppm, th_deg, circles, x0=0.0, z0=0.0, SS=3, edge=None):
    M.TH = math.radians(th_deg)
    bg = ocean(W, H, ox, oy, ppm, th_deg, circles, x0, z0, edge=edge)
    if not geo['pos']: return bg
    col, cov = M.render(geo, 0, ppm, W, H, ox, oy, SS=SS)
    return M.composite(col, cov, bg)

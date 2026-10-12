# Modelo del shader del océano (src/client/models/ocean-material.ts) en numpy, en float32 como la GPU: sintetiza cada
# píxel de una captura de mar abierto (AD-27) solo con sus metadatos (proyección, uTime y uniforms), sin leer la imagen.
# validate_full.py lo compara con las capturas reales de e2e/ocean-foam.spec.ts.
import json
import numpy as np
from ad27 import srgb_to_lin

F = np.float32

def fract(x):
    return x - np.floor(x)

def ghash(px, py):
    px = fract(px * F(123.34)).astype(F)
    py = fract(py * F(456.21)).astype(F)
    d = (px * (px + F(45.32)) + py * (py + F(45.32))).astype(F)
    px = (px + d).astype(F)
    py = (py + d).astype(F)
    return fract((px * py).astype(F)).astype(F)

def vnoise(px, py):
    px = px.astype(F); py = py.astype(F)
    ix, iy = np.floor(px), np.floor(py)
    fx, fy = (px - ix).astype(F), (py - iy).astype(F)
    ux, uy = fx * fx * (F(3) - F(2) * fx), fy * fy * (F(3) - F(2) * fy)
    a = ghash(ix, iy); b = ghash(ix + F(1), iy); c = ghash(ix, iy + F(1)); d = ghash(ix + F(1), iy + F(1))
    return ((a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy).astype(F)

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def hex_lin(h):
    return srgb_to_lin(np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255)

def _unit(*v):
    v = np.array(v, dtype=float)
    return v / np.linalg.norm(v)

# Valores de src/client/art.ts para las capturas que no traen los uniforms (sondas anteriores a e2e/ocean-foam.spec.ts)
DEFAULTS = {'uDeep': hex_lin('#1A5F86'), 'uTrough': hex_lin('#154F72'), 'uCrest': hex_lin('#2F7AA3'), 'uSky': hex_lin('#9CCBE6'),
            'uSpec': hex_lin('#FFF4D6'), 'uFoam': hex_lin('#EAF6FA'), 'uLightDir': _unit(-0.45, 0.8, 0.4),
            'uViewDir': np.array([0, np.sin(np.radians(55)), np.cos(np.radians(55))])}

def load_meta(path):
    # Normaliza el JSON de e2e/ocean-foam.spec.ts (uniforms planos) y el de las sondas anteriores (claves sueltas)
    with open(path) as f:
        meta = json.load(f)
    u = meta.get('uniforms', {})
    if 'uWaves' in u:
        meta.update(waves=u['uWaves'], amp=u['uWaveAmp'], slope=u['uWaveSlope'], foam=u['uFoam'],
                    foamCrest=u.get('uFoamCrest'), foamStreak=u.get('uFoamStreak'), foamGust=u.get('uFoamGust'), foamWarp=u.get('uFoamWarp'))
    meta['uniforms'] = {**DEFAULTS, **{k: np.array(v) for k, v in u.items() if k in DEFAULTS}}
    return meta

def world_grid(meta):
    # Proyección ortográfica: el agua bajo cada centro de píxel es afín en las esquinas que da screenToWorld
    W, H = meta['pxW'], meta['pxH']
    c0, c1, c2 = meta['corners'][0], meta['corners'][1], meta['corners'][2]
    x = c0['x'] + (np.arange(W) + 0.5) / W * (c1['x'] - c0['x'])
    z = c0['z'] + (np.arange(H) + 0.5) / H * (c2['z'] - c0['z'])
    X, Z = np.meshgrid(x, z)
    return X.astype(F), Z.astype(F)

def height(meta, X, Z, t):
    h = np.zeros_like(X, dtype=np.float64)
    for (dx, dz, k, w), a in zip(meta['waves'], meta['amp']):
        h += a * np.sin(k * (dx * X + dz * Z) - w * t)
    return h / sum(meta['amp'])

def crest_old(meta, X, Z, t):
    # Antes de D23: smoothstep(0.72, 0.95, h) · 0.35 · step(0.5, vnoise(p·0.45 + 0.5·drift))
    h = height(meta, X, Z, t)
    dxt, dzt = F(0.212 * t), F(-0.212 * t)
    gate = vnoise(X * F(0.45) + dxt * F(0.5), Z * F(0.45) + dzt * F(0.5)) >= 0.5
    return smoothstep(0.72, 0.95, h) * 0.35 * gate

def crest_params(meta):
    # Cifras de la espuma de cresta desde los uniforms de la captura (uFoamCrest, uFoamStreak, uFoamGust, uFoamWarp)
    c, s, g, w = meta['foamCrest'], meta['foamStreak'], meta['foamGust'], meta.get('foamWarp') or [0, 1 / 40]
    return {'h_lo': c[0], 'h_hi': c[1], 'nv_lo': c[2], 'nv_hi': c[3], 'streak_long': 1 / s[0], 'streak_short': 1 / s[1],
            'racha_scale': 1 / g[0], 'racha_lo': g[1], 'racha_hi': g[2], 'strength': g[3], 'warp': w[0], 'warp_scale': 1 / w[1]}

def foam_height(meta, X, Z, t, p):
    # Altura h_w sobre la que se evalúa la cresta (§7.3, D42): la de §7.1 en p desplazado hasta 'warp' m con ruido de
    # 'warp_scale' m, así las filas de espuma serpentean en vez de ir cada 23 m en línea recta (warp=0: sin desplazar)
    W = p.get('warp', 18.0)
    if W:
        sc = F(1 / p.get('warp_scale', 40.0)); dxt, dzt = F(0.0212 * t), F(-0.0212 * t)
        wx = vnoise(X * sc + F(3.1) + dxt, Z * sc + F(3.1) + dzt) * F(2) - F(1)
        wz = vnoise(X * sc + F(11.7) + dxt, Z * sc + F(11.7) + dzt) * F(2) - F(1)
        X, Z = (X + F(W) * wx).astype(F), (Z + F(W) * wz).astype(F)
    return height(meta, X, Z, t)

def crest(meta, X, Z, t, p=None):
    # §7.3 (D23, D42): smoothstep(h) · smoothstep(n_v) · racha · fuerza, con n_v estirado a lo largo del viento (NE)
    p = p or {}
    h = foam_height(meta, X, Z, t, p)
    dxt, dzt = F(0.212 * t), F(-0.212 * t)
    u = (F(0.707) * X - F(0.707) * Z).astype(F); v = (F(0.707) * X + F(0.707) * Z).astype(F)
    nv = vnoise(u * F(1 / p.get('streak_long', 6.0)) + dxt * F(0.5), v * F(1 / p.get('streak_short', 2.0)) + dzt * F(0.5))
    gs = F(1 / p.get('racha_scale', 35.0))
    racha = smoothstep(p.get('racha_lo', 0.60), p.get('racha_hi', 0.80), vnoise(X * gs + dxt * F(0.15), Z * gs + dzt * F(0.15)))
    lo, hi = p.get('h_lo', 0.55), p.get('h_hi', 0.95)
    return smoothstep(lo, hi, h) * smoothstep(p.get('nv_lo', 0.45), p.get('nv_hi', 0.65), nv) * racha * p.get('strength', 0.30)

def crest_of(meta, X, Z):
    # La espuma de la captura: fórmula de antes si no trae uFoamCrest, si no D23 con sus cifras
    return crest_old(meta, X, Z, meta['time']) if not meta.get('foamCrest') else crest(meta, X, Z, meta['time'], crest_params(meta))

def ocean_lin(meta, X, Z, t, v):
    # Color lineal de mar abierto (sin islas, zona segura ni borde del mapa a la vista), §7.1–7.3, con la espuma v
    U = meta['uniforms']
    h = np.zeros_like(X, dtype=F); gx = np.zeros_like(X, dtype=F); gz = np.zeros_like(X, dtype=F)
    for (dx, dz, k, w), a, s in zip(meta['waves'], meta['amp'], meta['slope']):
        ph = (F(k) * (F(dx) * X + F(dz) * Z) - F(w * t)).astype(F)
        h += F(a) * np.sin(ph); c = F(s) * np.cos(ph); gx += c * F(dx); gz += c * F(dz)
    h = h / F(sum(meta['amp']))
    dx_, dz_ = F(0.212 * t), F(-0.212 * t)
    n2 = lambda sc, mul, off: vnoise(X / F(sc) + dx_ * F(mul) + F(off), Z / F(sc) + dz_ * F(mul) + F(off))
    nx = (n2(1.6, 1, 0) + F(0.5) * n2(0.7, 1.3, 0)) / F(1.5) - F(0.5)
    nz = (n2(1.6, 1, 17.3) + F(0.5) * n2(0.7, 1.3, 41.7)) / F(1.5) - F(0.5)
    gx = gx + nx * F(0.1); gz = gz + nz * F(0.1)
    nrm = np.stack([-gx, np.ones_like(gx), -gz], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    nc = (vnoise(X / F(9) + dx_ * F(0.6), Z / F(9) + dz_ * F(0.6)) + F(0.5) * vnoise(X / F(4.5) - dx_ * F(0.4), Z / F(4.5) - dz_ * F(0.4))) / F(1.5) * F(2) - F(1)
    hc = F(0.6) * h + F(0.4) * nc
    mix = lambda a, b, s: a * (1 - s[..., None]) + b * s[..., None]
    full = lambda key: np.broadcast_to(U[key], X.shape + (3,))
    c = mix(full('uDeep'), mix(full('uTrough'), full('uCrest'), smoothstep(-0.6, 0.8, hc)), np.full(X.shape, 0.55))
    fres = 0.02 + 0.98 * (1 - np.clip(nrm @ U['uViewDir'], 0, 1)) ** 5
    c = mix(c, full('uSky'), 0.6 * fres)
    c = mix(c, full('uFoam'), np.clip(v, 0, 1))
    Hh = (U['uLightDir'] + U['uViewDir']) / np.linalg.norm(U['uLightDir'] + U['uViewDir'])
    return c + U['uSpec'] * (np.maximum(nrm @ Hh, 0) ** 90 * 0.8)[..., None]

def grid_mask(meta, X, Z):
    # §7.4 rejilla de 100 m, 1 px antialiasado con fwidth(p) = metros por px de la proyección
    c0, c1, c2 = meta['corners'][0], meta['corners'][1], meta['corners'][2]
    mx = abs(c1['x'] - c0['x']) / meta['pxW']; mz = abs(c2['z'] - c0['z']) / meta['pxH']
    line = lambda g, aa: 1 - smoothstep(0.0, 1.0, np.abs(g) / aa)
    return np.maximum(line((fract(X / 100 + 0.5) - 0.5) * 100, mx), line((fract(Z / 100 + 0.5) - 0.5) * 100, mz))

def render(meta, X, Z, t, v):
    # Captura sintética en sRGB de 8 bits, como captureOceanPass (PNG del canvas)
    g = grid_mask(meta, X, Z)[..., None]
    c = np.clip(ocean_lin(meta, X, Z, t, v) * (1 - 0.05 * g) + 0.05 * g, 0, 1)
    s = np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
    return np.round(s * 255) / 255

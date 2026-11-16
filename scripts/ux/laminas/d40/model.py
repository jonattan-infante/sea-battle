# RECONSTRUCCIÓN (2026-11-15) del renderizador por software de D40 (`qa-artifacts/render/d40-modelo/model.py`, sin
# versionar y perdido con la máquina de ux). Solo expone lo que usan scripts/ux/mapa/render_tex.py, barcos/respaldo.py y
# laminas/lamina_clase.py: las constantes de luz del juego (src/client/art.ts, LIGHTING), en lineal como las pasa three.js
# con ColorManagement, el especular GGX de MeshStandardMaterial (lo dice la cabecera de render_tex.py), la salida sRGB sin
# tone mapping (`<Canvas flat>`, D2; GameCanvas.tsx) y CIELAB (D65) para el ΔE76. No es el archivo original: las cifras
# que dependan de él son una reproducción, no las del turno de ux.
import numpy as np


def _hex(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255.0


def lin(c):
    c = np.asarray(c, float); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin2srgb(c):
    c = np.clip(np.asarray(c, float), 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


_d = np.array([-0.45, 0.8, 0.4]); LD = _d / np.linalg.norm(_d)  # sunDir: normalize3(-0.45, 0.8, 0.4)
SKY = lin(_hex('#F2F6FA'))     # hemiSky
GROUND = lin(_hex('#B8C9D1'))  # hemiGround
IH = 3.0                       # hemiIntensity
SUN = lin(_hex('#FFF1D6'))     # sunColor
IS = 1.2                       # sunIntensity
GGX = True

_M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
_WHITE = np.array([0.95047, 1.0, 1.08883])


def lab(srgb255):
    """sRGB en [0, 255] (…, 3) → CIELAB D65 (…, 3). Así lo llama respaldo.py (`M.lab(a * 255)`)."""
    xyz = lin(np.asarray(srgb255, float) / 255.0) @ _M.T / _WHITE
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)

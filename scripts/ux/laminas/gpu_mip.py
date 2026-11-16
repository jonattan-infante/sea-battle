# El muestreo de la textura como la GPU (D104), sacado de scripts/ux/ad28/render_mip.py sin tocarlo: ese script corre su
# estudio al importarse, así que aquí se ejecuta solo su parte de funciones (hasta la lista de barcos) con sus 3 argumentos.
# Expone chain(), receta() (con la cadena de mips real de la KTX2 registrada), shot_mode() y MODE: 'lamina' (render_tex.py
# tal cual, la lámina), 'iso' (trilineal entre los niveles reales de la KTX2) y 'aniso' (anisótropo 16, el del juego:
# SHIP_MAP_ANISOTROPY, src/client/models/ship-glb.ts:30). Importarlo cambia RTX.render por el suyo (patched), que con
# MODE 'lamina' es el original. No corre en la CI.
import os, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
_src = open(os.path.join(REPO, 'scripts', 'ux', 'ad28', 'render_mip.py'), encoding='utf-8').read()
_cut = _src.index("\nG = os.path.join(UXA, 'goleta-c665cb4')")
_argv = sys.argv; sys.argv = [os.path.join(REPO, 'scripts', 'ux', 'ad28', 'render_mip.py'), REPO, tempfile.gettempdir(), tempfile.mkdtemp(prefix='gpu-mip-')]
_g = {'__file__': sys.argv[0], '__name__': 'gpu_mip_core'}
try: exec(compile(_src[:_cut], sys.argv[0], 'exec'), _g)
finally: sys.argv = _argv
chain, receta, shot_mode, MODE, render, CHAINS = _g['chain'], _g['receta'], _g['shot_mode'], _g['MODE'], _g['render'], _g['CHAINS']

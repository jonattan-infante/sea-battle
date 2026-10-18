# Uso (desde la raíz del repo), tras comprimir_cadena.sh: python3 -I scripts/ux/barcos/respaldo_curvo.py
#   →  $UX_OUT/cadena/respaldo-d90.json: la regla de tamaño del respaldo de D90 (ASSET-SPEC §13, paso 4b) para los barcos
#      de la cadena de arte (navio_curvo.py y canonera_curvo.py), a 128² y 256², en PNG y en JPEG
# La regla: con la cámara y la luz del juego en el encuadre más cercano (escritorio 0,7×, 8,86 px/m), el render con el
# respaldo queda a un ΔE76 medio ≤ 1,5 × el del atlas original, los dos frente al render con la KTX2, y el color medio
# del barco a ΔE ≤ 1. Usa el render diferido y el filtrado trilineal de respaldo.py. Ligero (segundos, un núcleo); lee
# la KTX2 con `ktx extract` (KTX-Software 4.4.2). Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, io, json, struct, subprocess
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'laminas'), os.path.join(HERE, '..', 'mapa')): sys.path.insert(0, p)
import rutas as RT
import render_tex as RTX
import respaldo as RS, navio_curvo as NCV, canonera_curvo as CCV
import numpy as np
from PIL import Image
CAD = os.path.join(RT.OUT, 'cadena')


def ktx_img(path):
    w, h = struct.unpack('<II', open(path, 'rb').read()[20:28]); raw = path[:-5] + '.raw'
    subprocess.run(['ktx', 'extract', '--transcode', 'rgba8', '--level', '0', '--raw', path, raw], check=True, capture_output=True)
    a = np.frombuffer(open(raw, 'rb').read(), np.uint8).reshape(h, w, 4)[..., :3].copy(); os.remove(raw); return Image.fromarray(a)


out = {}
for id_, fam, reg in (('navio_gb', 'gb', NCV.AT.R), ('navio_es', 'es', NCV.AT.R), ('canonera', 'canonera', CCV.AT.R)):
    z = np.load(RT.need(os.path.join(CAD, f'{id_}_lod0.npz'), f'{id_}_lod0.npz'))
    P, UVc, Cc, _ = RTX.clip_below_water(z['p'], z['t'], z['c'])
    src = os.path.join(CAD, f'atlas_{fam}.png'); ref = RS.mips(ktx_img(RT.need(os.path.join(CAD, 'comp', f'atlas_{fam}.ktx2'), 'la KTX2 (comprimir_cadena.sh)')))
    gb = RS.gbuffer(P, UVc, Cc, 6.20 / 0.7, 55, 135); r_img, r_cov = RS.shade(gb, ref); full = r_cov > 0.999
    base = RS.dE(RS.shade(gb, RS.mips(Image.open(src)))[0], r_img, full)
    r = {'atlas original': dict(dE=round(base[0], 3), dE95=round(base[1], 2), dE_medio=round(base[2], 3))}
    for n in (128, 256):
        im = RS.fallback(src, n, regions=reg, size=1024)
        for fmt in ('png', 'jpeg'):
            data = RS.encode(im, fmt); e = RS.dE(RS.shade(gb, RS.mips(Image.open(io.BytesIO(data)).convert('RGB')))[0], r_img, full)
            r[f'{fmt}{n}'] = dict(bytes=len(data), dE=round(e[0], 3), dE95=round(e[1], 2), dE_medio=round(e[2], 3),
                                  pasa=bool(e[0] <= 1.5 * base[0] and e[2] <= 1.0))
    out[id_] = r; print(id_, json.dumps(r, ensure_ascii=False), flush=True)
json.dump(out, open(os.path.join(CAD, 'respaldo-d90.json'), 'w'), indent=1, ensure_ascii=False)

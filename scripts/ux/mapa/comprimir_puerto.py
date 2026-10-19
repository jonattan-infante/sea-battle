# Uso (desde la raíz del repo), tras puerto_isla.py y blender_estatico.py puerto_isla island_port '<extras>' (la misma
# UX_OUT), con gltf-transform 4.5.1 y KTX-Software 4.4.2 (`ktx`) en el PATH:
#   python3 -I scripts/ux/mapa/comprimir_puerto.py  →  $UX_OUT/mapa/comp/island_port_meshopt.glb, atlas_puerto_isla.ktx2 y
#   $UX_OUT/mapa/puerto-isla-glb.json
# El peso del puerto con forma de isla (D92) como lo bajaría el juego (ASSET-SPEC §13, pasos 4, 4b y 4c, como los barcos):
# la geometría con meshopt; la textura en KTX2 ETC1S desde el PNG del atlas, con los parámetros de comprimir_cadena.sh (un
# hilo, paleta acotada a 1024), en su archivo aparte; y el respaldo de D90 en el GLB, del lado y formato más ligeros que pasan
# la regla de 4b con la cámara del juego en el encuadre más cercano (escritorio 0,7×). Lo que espera la entrada (AC-200 e) es la
# geometría con el respaldo; la KTX2 baja después. Ligero (segundos, un núcleo). Escribe en UX_OUT. No corre en la CI.
import gzip, io, json, os, struct, subprocess, sys
sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__))
for p in (here, os.path.join(here, '..', 'laminas'), os.path.join(here, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import render_tex as RTX
import respaldo as RS
import puerto_isla as PI   # su atlas: el del puerto (D82) con 'grano' y 'roca' de las islas en el hueco libre
import numpy as np
from PIL import Image

MAPA = os.path.join(RT.OUT, 'mapa'); COMP = os.path.join(MAPA, 'comp')
GLB, ATLAS, NPZ = (os.path.join(MAPA, f) for f in ('island_port.glb', 'atlas_puerto_isla.png', 'puerto_isla_lod0.npz'))


def gz(b): return len(gzip.compress(b, 9, mtime=0))


def glb_geo(path):
    """El GLB sin los bytes de sus imágenes: lo que queda con la KTX2 fuera y antes del respaldo."""
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; js = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
    cuts = sorted((bin0 + js['bufferViews'][im['bufferView']].get('byteOffset', 0), js['bufferViews'][im['bufferView']]['byteLength']) for im in js['images'])
    keep, pos = [], 0
    for o, n in cuts: keep.append(b[pos:o]); pos = o + n
    keep.append(b[pos:]); return b''.join(keep)


def ktx_img(path):
    w, h = struct.unpack('<II', open(path, 'rb').read()[20:28]); raw = path[:-5] + '.raw'
    subprocess.run(['ktx', 'extract', '--transcode', 'rgba8', '--level', '0', '--raw', path, raw], check=True, capture_output=True)
    a = np.frombuffer(open(raw, 'rb').read(), np.uint8).reshape(h, w, 4)[..., :3].copy(); os.remove(raw); return Image.fromarray(a)


if __name__ == '__main__':
    os.makedirs(COMP, exist_ok=True)
    mo = os.path.join(COMP, 'island_port_meshopt.glb'); kt = os.path.join(COMP, 'atlas_puerto_isla.ktx2')
    subprocess.run(['gltf-transform', 'meshopt', RT.need(GLB, 'island_port.glb (blender_estatico.py)'), mo], check=True, capture_output=True)
    subprocess.run(['ktx', 'create', '--generate-mipmap', '--encode', 'basis-lz', '--assign-tf', 'srgb', '--assign-primaries', 'bt709',
                    '--format', 'R8G8B8_SRGB', '--threads', '1', '--max-endpoints', '1024', '--max-selectors', '1024', ATLAS, kt], check=True, capture_output=True)
    geo = glb_geo(mo); k = open(kt, 'rb').read()
    # la regla de 4b, con la vista del juego más cercana (escritorio 0,7×) del puerto entero
    z = np.load(NPZ); P, UVc, Cc, _ = RTX.clip_below_water(z['p'], z['t'], z['c'])
    gb_ = RS.gbuffer(P, UVc, Cc, 6.20 / 0.7, 55, 0, SS=2); ref = RS.mips(ktx_img(kt)); r_img, r_cov = RS.shade(gb_, ref); full = r_cov > 0.999
    base = RS.dE(RS.shade(gb_, RS.mips(Image.open(ATLAS)))[0], r_img, full)
    regions = {n: v[:4] for n, v in PI.AT.reg.items()}
    # con_ktx: la geometría y la KTX2 juntas, como se midió el puerto de D82 (181 684 B; 135 862 con gzip; ASSET-SPEC §9.6)
    out = dict(glb_export_B=os.path.getsize(GLB), geo_B=len(geo), geo_gz=gz(geo), ktx_B=len(k), ktx_gz=gz(k), con_ktx_B=len(geo) + len(k), con_ktx_gz=gz(geo + k),
               atlas_original=dict(dE=round(base[0], 3), dE_medio=round(base[2], 3)), respaldo={})
    for n in (128, 256):
        try: im = RS.fallback(ATLAS, n, regions=regions, size=1024); how = 'por regiones'
        except AssertionError: im = RS.fallback(ATLAS, n, regions=regions, size=1024, mix=True); how = 'mezclado (regiones fuera de texel)'
        for fmt in ('png', 'jpeg'):
            data = RS.encode(im, fmt); e = RS.dE(RS.shade(gb_, RS.mips(Image.open(io.BytesIO(data)).convert('RGB')))[0], r_img, full)
            out['respaldo'][f'{fmt}{n}'] = dict(bytes=len(data), dE=round(e[0], 3), dE_medio=round(e[2], 3), pasa=bool(e[0] <= 1.5 * base[0] and e[2] <= 1.0),
                                               entrada_B=len(geo) + len(data), entrada_gz=gz(geo + data), metodo=how)
    ok = [kk for kk, v in out['respaldo'].items() if v['pasa']]
    out['elegido'] = min(ok, key=lambda kk: out['respaldo'][kk]['bytes']) if ok else None
    json.dump(out, open(os.path.join(MAPA, 'puerto-isla-glb.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(out, ensure_ascii=False))

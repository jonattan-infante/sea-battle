# Uso (desde la raíz del repo), tras sockets_curvo.py, blender_curvo.py <id> export y comprimir_cadena.sh (la misma UX_OUT):
#   python3 -I scripts/ux/barcos/entregar.py [navios | canonera2]   →  $UX_OUT/entrega/dentro/<sb_id>.glb (la entrega a dev-render: la KTX2 y el respaldo
#   en el BIN; el paso 4c lo hace su externalizeKtx2), y de contraste <sb_id>.<hash>.glb y <sb_id>_atlas.<hash>.ktx2 con el 4c
#   de aquí; entrega.json (o entrega-canonera2.json) con las medidas, también la eslora del casco en la caja y en la flotación
#   (AS-V03). Con `canonera2`, la Cañonera de la receta (D91, 2.ª vuelta; tras sockets_canonera2.py), con el respaldo de 128²,
#   que pasa la regla de 4b (lamina_canonera2.py, turno C2: ΔE76 1,651 frente a 1,779)
# Los 2 Navíos de la receta de D91 (aprobados por Jonattan el 2026-10-18) como los espera el juego (ASSET-SPEC §13, pasos
# 4, 4b y 4c): la geometría con meshopt (`gltf-transform meshopt`); el respaldo PNG de 256² en el BIN, en `texture.source`
# (D90; 128² no pasa la regla de 4b en ninguno de los dos: respaldo-d90.json de respaldo_curvo.py); y la KTX2 de
# comprimir_cadena.sh (desde el PNG del atlas, paleta acotada a 1024) fuera del GLB, enlazada por `uri` con el hash de sus
# bytes, en KHR_texture_basisu y sin la extensión en extensionsRequired. Orden de 4c: la KTX2 y su hash, el GLB con esa
# `uri` y, al final, el hash del GLB. Comprueba lo que se puede leer del archivo (AS-V02, V06, V07, V08 y la parte de AS-V10
# que no necesita la tabla de respaldo-tamanos.json) y pasa `gltf-transform validate` con los 2 archivos en la misma
# carpeta. Necesita gltf-transform 4.5.1 en el PATH. Ligero (segundos, un núcleo). Escribe en UX_OUT. No corre en la CI.
import copy, gzip, hashlib, json, math, os, shutil, struct, subprocess, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'laminas'), os.path.join(HERE, '..', 'mapa')): sys.path.insert(0, p)
import rutas as RT
import respaldo as RS
import navio_curvo as NCV
import canonera2_curvo as C2
import numpy as np

CAD = os.path.join(RT.OUT, 'cadena'); DST = os.path.join(RT.OUT, 'entrega'); TMP = os.path.join(DST, 'tmp'); DST_D = os.path.join(DST, 'dentro')
# (id, nombre del atlas, sb_id, lado del respaldo, regiones del atlas)
SETS = {'navios': (('navio_gb', 'gb', 'ship_line_gb', 256, NCV.AT.R), ('navio_es', 'es', 'ship_line_es', 256, NCV.AT.R)),
        'canonera2': (('canonera2', 'canonera2', 'npc_pirate_gunboat', 128, C2.AT.R),)}
BASISU = 'KHR_texture_basisu'


def read_glb(data):
    magic, ver, _ = struct.unpack_from('<4sII', data, 0); jl, jt = struct.unpack_from('<I4s', data, 12)
    assert magic == b'glTF' and ver == 2 and jt == b'JSON'
    js = json.loads(data[20:20 + jl]); bl, bt = struct.unpack_from('<I4s', data, 20 + jl); assert bt == b'BIN\x00'
    return js, bytes(data[28 + jl:28 + jl + bl])


def write_glb(js, bin_):
    jb = json.dumps(js, separators=(',', ':'), ensure_ascii=False).encode(); jb += b' ' * (-len(jb) % 4)
    bin_ = bin_ + b'\x00' * (-len(bin_) % 4)
    return struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(jb) + 8 + len(bin_)) + struct.pack('<I4s', len(jb), b'JSON') + jb + struct.pack('<I4s', len(bin_), b'BIN\x00') + bin_


def drop_view(js, bin_, k):
    """Quita el bufferView k del BIN (buffer 0) y compacta lo demás: los de meshopt tienen sus bytes en la extensión
    (EXT_meshopt_compression.buffer/byteOffset) y su byteOffset propio en el buffer de respaldo, que no tiene bytes."""
    segs = []
    for i, v in enumerate(js['bufferViews']):
        ext = v.get('extensions', {}).get('EXT_meshopt_compression')
        if ext is not None: assert ext['buffer'] == 0; segs.append((ext.get('byteOffset', 0), ext['byteLength'], i, ext))
        elif v['buffer'] == 0: segs.append((v.get('byteOffset', 0), v['byteLength'], i, v))
    out = bytearray()
    for off, n, i, holder in sorted(segs, key=lambda s: s[0]):
        if i == k: continue
        out += b'\x00' * (-len(out) % 4); holder['byteOffset'] = len(out); out += bin_[off:off + n]
    del js['bufferViews'][k]
    assert all(a.get('bufferView') != k for a in js.get('accessors', []))  # solo la imagen lo usaba
    for coll in ('accessors', 'images'):
        for a in js.get(coll, []):
            if 'bufferView' in a and a['bufferView'] > k: a['bufferView'] -= 1
    return bytes(out)


def ktx2_header(b):
    assert b[:12] == b'\xabKTX 20\xbb\r\n\x1a\n', 'no es KTX2'
    w, h, _, layers, faces, levels, sc = struct.unpack_from('<7I', b, 20)
    return dict(lado=[w, h], niveles=levels, supercompresion=sc)


def gz(b): return len(gzip.compress(b, 9, mtime=0))


def h8(b): return hashlib.sha256(b).hexdigest()[:8]


def deliver(id_, fam, sid, SIDE, regions, ref_png_bytes):
    src = RT.need(os.path.join(CAD, f'{id_}.glb'), f'{id_}.glb (blender_curvo.py {id_} export)')
    mo = os.path.join(TMP, f'{id_}_meshopt.glb')
    subprocess.run(['gltf-transform', 'meshopt', src, mo], check=True, capture_output=True)
    js, bin_ = read_glb(open(mo, 'rb').read())
    assert len(js['textures']) == 1 and len(js['images']) == 1 and js['images'][0]['mimeType'] == 'image/png'
    k = js['images'][0]['bufferView']; geo = drop_view(js, bin_, k)
    # 4c: la KTX2 y su hash
    ktx = open(RT.need(os.path.join(CAD, 'comp', f'atlas_{fam}.ktx2'), f'atlas_{fam}.ktx2 (comprimir_cadena.sh)'), 'rb').read()
    kh = ktx2_header(ktx); kname = f'{sid}_atlas.{h8(ktx)}.ktx2'
    # 4b: el respaldo, por regiones (respaldo.fallback con las del atlas de navio_curvo)
    png = RS.encode(RS.fallback(os.path.join(CAD, f'atlas_{fam}.png'), SIDE, regions=regions, size=1024), 'png')
    # la forma que recibe dev-render: la KTX2 y el respaldo en el BIN (pasos 4 y 4b); el paso 4c lo hace su externalizeKtx2
    # (scripts/glb/glb-fallback.ts:138), que es la implementación única del paso (decisión del lead, 2026-10-19)
    jd = copy.deepcopy(js); bd = bytearray(geo)
    for blob in (ktx, png):
        bd += b'\x00' * (-len(bd) % 4); jd['bufferViews'].append({'buffer': 0, 'byteOffset': len(bd), 'byteLength': len(blob)}); bd += blob
    nv = len(jd['bufferViews'])
    jd['images'] = [{'name': f'atlas_{fam}', 'bufferView': nv - 2, 'mimeType': 'image/ktx2'}, {'bufferView': nv - 1, 'mimeType': 'image/png', 'name': f'respaldo_{SIDE}'}]
    jd['textures'] = [{'sampler': 0, 'source': 1, 'extensions': {BASISU: {'source': 0}}}]
    jd['buffers'][0]['byteLength'] = len(bd); jd['extensionsUsed'] = sorted(set(jd.get('extensionsUsed', [])) | {BASISU})
    glb_d = write_glb(jd, bytes(bd)); open(os.path.join(DST_D, f'{sid}.glb'), 'wb').write(glb_d)
    # y la forma de 4c, de contraste: la KTX2 fuera, con su hash
    bin2 = bytearray(geo); bin2 += b'\x00' * (-len(bin2) % 4); bo = len(bin2); bin2 += png
    js['bufferViews'].append({'buffer': 0, 'byteOffset': bo, 'byteLength': len(png)})
    js['images'] = [{'name': f'atlas_{fam}', 'uri': kname, 'mimeType': 'image/ktx2'},
                    {'bufferView': len(js['bufferViews']) - 1, 'mimeType': 'image/png', 'name': f'respaldo_{SIDE}'}]
    js['textures'] = [{'sampler': 0, 'source': 1, 'extensions': {BASISU: {'source': 0}}}]
    js['buffers'][0]['byteLength'] = len(bin2)
    js['extensionsUsed'] = sorted(set(js.get('extensionsUsed', [])) | {BASISU})
    assert BASISU not in js.get('extensionsRequired', [])
    glb = write_glb(js, bytes(bin2)); gname = f'{sid}.{h8(glb)}.glb'
    open(os.path.join(DST, kname), 'wb').write(ktx); open(os.path.join(DST, gname), 'wb').write(glb)
    # lo que se lee del archivo
    nodes = js['nodes']; root = nodes[js['scenes'][0]['nodes'][0]]; kids = {nodes[c]['name']: nodes[c] for c in root['children']}
    tris = {n: sum(js['accessors'][p['indices']]['count'] // 3 for p in js['meshes'][kids[n]['mesh']]['primitives']) for n in (f'{sid}_lod0', f'{sid}_lod1')}
    def fwd(nd):  # +Z local del socket en el mundo (rotación en cuaternión xyzw)
        x, y, z, w = nd.get('rotation', [0, 0, 0, 1]); return (2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y))
    cps = root['extras']['sb_cannons_per_side']; res = {}
    res['AS-V02'] = root['name'] == sid and all(k_ not in root for k_ in ('translation', 'rotation', 'scale', 'matrix'))
    for key, sgn in (('port', 1), ('stbd', -1)):
        ss = [kids[f'socket_cannon_{key}_{i:02d}'] for i in range(1, cps + 1)]
        zs = [s['translation'][2] for s in ss]
        res[f'AS-V06 {key}'] = zs == sorted(zs) and all(sgn * s['translation'][0] > 0 for s in ss)
        res[f'AS-V07 {key}'] = round(min(sgn * fwd(s)[0] for s in ss), 4)
    res['AS-V08 tris'] = tris
    res['AS-V09'] = dict(mallas=len(js['meshes']), primitivas=[len(m['primitives']) for m in js['meshes']], materiales=len(js['materials']),
                         atributos=sorted({a for m in js['meshes'] for p in m['primitives'] for a in p['attributes']}))
    res['AS-V10'] = dict(ktx2=kh, respaldo=[struct.unpack('>II', png[16:24]), 'image/png', len(png)], minFilter=js['samplers'][0]['minFilter'],
                         requeridas=js.get('extensionsRequired', []))
    for form, path in (('validate', os.path.join(DST, gname)), ('validate_dentro', os.path.join(DST_D, f'{sid}.glb'))):
        val = subprocess.run(['gltf-transform', 'validate', path], capture_output=True, text=True)
        vtxt = val.stdout + val.stderr; open(os.path.join(TMP, f'{form}_{fam}.txt'), 'w').write(vtxt)
        res[form] = dict(exit=val.returncode, sin_errores='No errors found.' in vtxt.split('WARNING')[0])
    res['AS-V03 casco'] = hull_lengths(id_)
    sha = lambda b: hashlib.sha256(b).hexdigest()
    info = dict(sb_id=sid, glb=gname, ktx2=kname, glb_B=len(glb), glb_gzip9_B=gz(glb), ktx2_B=len(ktx), ktx2_gzip9_B=gz(ktx),
                sha256_glb=sha(glb), sha256_ktx2=sha(ktx), respaldo_B=len(png), respaldo_igual_a_la_medida=(len(png) == ref_png_bytes) if ref_png_bytes else None,
                dentro=dict(glb=f'dentro/{sid}.glb', B=len(glb_d), gzip9_B=gz(glb_d), sha256=sha(glb_d)), comprobaciones=res)
    return info


def hull_lengths(id_):
    """Eslora y manga del casco de LOD0 (vértices con _RIM_MASK = 1): la caja entera y el corte de la flotación (y = 0)."""
    z = np.load(os.path.join(CAD, f'{id_}_lod0.npz')); P = z['p'].reshape(-1, 3, 3); R = z['r'].reshape(-1, 3)
    hull = P[(R > 0.5).all(1)]; pts = []
    for k in range(3):
        a, b = hull[:, k], hull[:, (k + 1) % 3]; mk = (a[:, 1] > 0) != (b[:, 1] > 0)
        s = (a[mk, 1] / (a[mk, 1] - b[mk, 1]))[:, None]; pts.append(a[mk] + (b[mk] - a[mk]) * s)
    W = np.concatenate(pts); allp = hull.reshape(-1, 3)
    span = lambda A, i: round(float(np.ptp(A[:, i])), 3)
    return dict(caja=dict(eslora=span(allp, 2), manga=span(allp, 0)), flotacion=dict(eslora=span(W, 2), manga=span(W, 0),
                z=[round(float(W[:, 2].min()), 3), round(float(W[:, 2].max()), 3)]))


if __name__ == '__main__':
    os.makedirs(TMP, exist_ok=True); os.makedirs(DST_D, exist_ok=True)
    assert shutil.which('gltf-transform'), 'falta gltf-transform 4.5.1 en el PATH'
    ref = os.path.join(CAD, 'respaldo-d90.json'); ref = json.load(open(ref)) if os.path.exists(ref) else {}
    which = sys.argv[1] if len(sys.argv) > 1 else 'navios'; out = {}
    for id_, fam, sid, side, regions in SETS[which]:
        out[sid] = deliver(id_, fam, sid, side, regions, ref.get(id_, {}).get(f'png{side}', {}).get('bytes'))
        print(sid, json.dumps(out[sid], ensure_ascii=False), flush=True)
    json.dump(out, open(os.path.join(DST, 'entrega.json' if which == 'navios' else f'entrega-{which}.json'), 'w'), indent=1, ensure_ascii=False)
    bad = [s for s, v in out.items() if not (v['comprobaciones']['validate']['sin_errores'] and v['comprobaciones']['validate_dentro']['sin_errores'] and v['comprobaciones']['AS-V02']
                                             and all(v['comprobaciones'][f'AS-V06 {k}'] for k in ('port', 'stbd'))
                                             and min(v['comprobaciones'][f'AS-V07 {k}'] for k in ('port', 'stbd')) >= 0.99)]
    print('FALLOS:', bad or 'ninguno')
    sys.exit(1 if bad else 0)

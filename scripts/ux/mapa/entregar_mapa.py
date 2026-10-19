# Uso (desde la raíz del repo), con gltf-transform 4.5.1 y KTX-Software 4.4.2 (`ktx`) en el PATH, y en $UX_OUT/mapa lo que
# dejan islas.py y blender_islas.py (islands.glb, island_I1.glb, atlas_isla.png y los isla_<id>_lod0.npz; D83) y
# puerto_forma.py, puerto_isla.py y blender_estatico.py (island_port.glb, atlas_puerto_isla.png, puerto_isla_lod0.npz y
# puerto-forma-v3.json; D92):
#   python3 -I scripts/ux/mapa/entregar_mapa.py  →  $UX_OUT/entrega-mapa/dentro/{islands,island_I1,island_port}.glb (la entrega
#   a dev-render: la KTX2 y el respaldo en el BIN; el paso 4c lo hace su externalizeKtx2), de contraste <nombre>.<hash>.glb y
#   <atlas>.<hash>.ktx2 con el 4c de aquí, y entrega-mapa.json con las medidas
# El escenario de la 1.1 como lo espera el juego (ASSET-SPEC §9.7, §9.8 y §13, pasos 4, 4b y 4c, como los barcos): la
# geometría con meshopt; la KTX2 ETC1S desde el PNG del atlas, con los parámetros de comprimir_cadena.sh (un hilo, paleta
# acotada a 1024); y el respaldo de D90 en `texture.source`. El del puerto es el de §9.8 (JPEG de 256², turno P3). El de las
# islas se mide aquí con la regla de los estáticos de §9.8: la de 4b en el encuadre más cercano (escritorio 0,7×) de cada
# isla, que tiene que pasar en las 15, y de los que pasan, el más ligero. islands.glb e island_I1.glb (el piloto de AC-198)
# comparten la KTX2. Comprueba lo que se lee del archivo (raíces, extras y `sb_circles` frente a las tablas de GDD §4, 1
# material OPAQUE, sin NORMAL, triángulos) y pasa `gltf-transform validate` con las 2 formas. Ligero (≈ 1 min, un núcleo:
# el render de las 15 islas). Escribe en UX_OUT. No corre en la CI.
import copy, hashlib, io, json, os, shutil, struct, subprocess, sys
sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__))
for p in (here, os.path.join(here, '..', 'laminas'), os.path.join(here, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import islas as IS
ISL_REG = {n: v[:4] for n, v in IS.AT.reg.items()}   # antes de importar puerto_isla, que cambia IS.AT por el atlas del puerto
import render_tex as RTX
import respaldo as RS
import entregar as EN      # read_glb, write_glb, drop_view, ktx2_header, gz y h8: los mismos pasos que los barcos
import comprimir_puerto as CP
import circulos as CI
import puerto_forma as PF
import puerto_isla as PI
import numpy as np
from PIL import Image

MAPA = os.path.join(RT.OUT, 'mapa'); DST = os.path.join(RT.OUT, 'entrega-mapa'); DST_D = os.path.join(DST, 'dentro'); TMP = os.path.join(DST, 'tmp')
BASISU = 'KHR_texture_basisu'
PORT_RESP = (256, 'jpeg')                    # ASSET-SPEC §9.8 (turno P3: ΔE76 0,963 frente a 1,002; 20 324 B)
ISL_SIDES, FMTS = (32, 64, 128, 256), ('png', 'jpeg')
MIME = {'png': 'image/png', 'jpeg': 'image/jpeg'}


def ktx_create(png, out):
    subprocess.run(['ktx', 'create', '--generate-mipmap', '--encode', 'basis-lz', '--assign-tf', 'srgb', '--assign-primaries', 'bt709',
                    '--format', 'R8G8B8_SRGB', '--threads', '1', '--max-endpoints', '1024', '--max-selectors', '1024', png, out], check=True, capture_output=True)
    return open(out, 'rb').read()


def measure_islands(atlas_png, ktx_path):
    """La regla de 4b en cada isla: el render con el respaldo frente al de la KTX2 (lo que muestra la GPU), y el umbral, 1,5 × el
    error de la KTX2 frente al atlas original en esa misma isla. Un candidato pasa si pasa en las 15."""
    regions = ISL_REG
    assert regions['white'] == (500, 500, 8, 8), 'no son las regiones del atlas de las islas'
    cands, meta = {}, {}
    for n in ISL_SIDES:
        im = RS.fallback(atlas_png, n, regions=regions, size=512)
        for fmt in FMTS: cands[f'{fmt}{n}'] = RS.encode(im, fmt); meta[f'{fmt}{n}'] = (fmt, n)
    ktx_ch, png_ch = RS.mips(CP.ktx_img(ktx_path)), RS.mips(Image.open(atlas_png))
    cand_ch = {k: RS.mips(Image.open(io.BytesIO(b)).convert('RGB')) for k, b in cands.items()}
    per = {}
    for iid in CI.ISLAS:
        if iid == 'PORT': continue
        z = np.load(os.path.join(MAPA, f'isla_{iid}_lod0.npz')); P, UVc, Cc, _ = RTX.clip_below_water(z['p'], z['t'], z['c'])
        gb = RS.gbuffer(P, UVc, Cc, 6.20 / 0.7, 55, 0, SS=2); r_img, r_cov = RS.shade(gb, ktx_ch); full = r_cov > 0.999
        base = RS.dE(RS.shade(gb, png_ch)[0], r_img, full); row = dict(px=int(full.sum()), umbral=round(1.5 * base[0], 3), ktx2_dE=round(base[0], 3))
        for k, ch in cand_ch.items():
            e = RS.dE(RS.shade(gb, ch)[0], r_img, full); row[k] = [round(e[0], 3), round(e[2], 3), bool(e[0] <= 1.5 * base[0] and e[2] <= 1.0)]
        per[iid] = row; print(iid, json.dumps(row, ensure_ascii=False), flush=True)
    res = {k: dict(bytes=len(b), pasa_en=sum(per[i][k][2] for i in per), peor=max(per, key=lambda i: per[i][k][0] / max(per[i]['umbral'], 1e-9)),
                   peor_dE_umbral=None) for k, b in cands.items()}
    for k, v in res.items(): i = v['peor']; v['peor_dE_umbral'] = [per[i][k][0], per[i]['umbral'], per[i][k][1]]
    ok = [k for k, v in res.items() if v['pasa_en'] == len(per)]
    chosen = min(ok, key=lambda k: res[k]['bytes']) if ok else None
    return dict(candidatos=res, por_isla=per, elegido=chosen), (cands[chosen], *meta[chosen]) if chosen else None


def deliver(src, name, ktx, kname_base, resp, fmt, side, circles_of):
    """La forma «dentro» (la KTX2 y el respaldo en el BIN) y la de 4c de contraste (la KTX2 aparte, con el hash en el nombre)."""
    mo = os.path.join(TMP, f'{name}_meshopt.glb')
    subprocess.run(['gltf-transform', 'meshopt', RT.need(src, os.path.basename(src)), mo], check=True, capture_output=True)
    js, bin_ = EN.read_glb(open(mo, 'rb').read())
    assert len(js['textures']) == 1 and len(js['images']) == 1 and js['images'][0]['mimeType'] == 'image/png'
    geo = EN.drop_view(js, bin_, js['images'][0]['bufferView'])
    kname = f'{kname_base}_atlas.{EN.h8(ktx)}.ktx2'; rname = f'respaldo_{side}'
    jd = copy.deepcopy(js); bd = bytearray(geo)
    for blob in (ktx, resp):
        bd += b'\x00' * (-len(bd) % 4); jd['bufferViews'].append({'buffer': 0, 'byteOffset': len(bd), 'byteLength': len(blob)}); bd += blob
    nv = len(jd['bufferViews'])
    jd['images'] = [{'name': f'{kname_base}_atlas', 'bufferView': nv - 2, 'mimeType': 'image/ktx2'}, {'bufferView': nv - 1, 'mimeType': MIME[fmt], 'name': rname}]
    jd['textures'] = [{'sampler': 0, 'source': 1, 'extensions': {BASISU: {'source': 0}}}]
    jd['buffers'][0]['byteLength'] = len(bd); jd['extensionsUsed'] = sorted(set(jd.get('extensionsUsed', [])) | {BASISU})
    glb_d = EN.write_glb(jd, bytes(bd)); open(os.path.join(DST_D, f'{name}.glb'), 'wb').write(glb_d)
    bin2 = bytearray(geo); bin2 += b'\x00' * (-len(bin2) % 4); bo = len(bin2); bin2 += resp
    js['bufferViews'].append({'buffer': 0, 'byteOffset': bo, 'byteLength': len(resp)})
    js['images'] = [{'name': f'{kname_base}_atlas', 'uri': kname, 'mimeType': 'image/ktx2'}, {'bufferView': len(js['bufferViews']) - 1, 'mimeType': MIME[fmt], 'name': rname}]
    js['textures'] = [{'sampler': 0, 'source': 1, 'extensions': {BASISU: {'source': 0}}}]
    js['buffers'][0]['byteLength'] = len(bin2); js['extensionsUsed'] = sorted(set(js.get('extensionsUsed', [])) | {BASISU})
    assert BASISU not in js.get('extensionsRequired', [])
    glb = EN.write_glb(js, bytes(bin2)); gname = f'{name}.{EN.h8(glb)}.glb'
    open(os.path.join(DST, kname), 'wb').write(ktx); open(os.path.join(DST, gname), 'wb').write(glb)
    # lo que se lee del archivo
    nodes = js['nodes']; roots = [nodes[i] for i in js['scenes'][0]['nodes']]; res = {'raices': {}}
    for r in roots:
        ex = r.get('extras', {}); sid = ex.get('sb_id'); want = circles_of(sid)
        mesh = [nodes[c] for c in r.get('children', []) if 'mesh' in nodes[c]]
        res['raices'][r['name']] = dict(
            nombre_igual_a_sb_id=r['name'] == sid, malla=[m['name'] for m in mesh] == [f'{sid}_lod0'], sb_kind=ex.get('sb_kind'), sb_archetype=ex.get('sb_archetype'),
            sb_circles_igual_a_gdd=want is not None and [[float(v) for v in c] for c in ex.get('sb_circles', [])] == [[float(v) for v in c] for c in want],
            traslacion=[round(v, 3) for v in r.get('translation', [0, 0, 0])],
            tris=sum(js['accessors'][p['indices']]['count'] // 3 for m in mesh for p in js['meshes'][m['mesh']]['primitives']))
    res['materiales'] = [(m.get('name'), m.get('alphaMode', 'OPAQUE')) for m in js['materials']]
    res['atributos'] = sorted({a for m in js['meshes'] for p in m['primitives'] for a in p['attributes']})
    res['AS-V10'] = dict(ktx2=EN.ktx2_header(ktx), respaldo=[list(Image.open(io.BytesIO(resp)).size), MIME[fmt], len(resp)],
                         minFilter=js['samplers'][0].get('minFilter'), requeridas=js.get('extensionsRequired', []))
    for form, path in (('validate', os.path.join(DST, gname)), ('validate_dentro', os.path.join(DST_D, f'{name}.glb'))):
        val = subprocess.run(['gltf-transform', 'validate', path], capture_output=True, text=True)
        vtxt = val.stdout + val.stderr; open(os.path.join(TMP, f'{form}_{name}.txt'), 'w').write(vtxt)
        res[form] = dict(exit=val.returncode, sin_errores='No errors found.' in vtxt.split('WARNING')[0])
    sha = lambda b: hashlib.sha256(b).hexdigest()
    return dict(glb=gname, ktx2=kname, glb_B=len(glb), glb_gzip9_B=EN.gz(glb), ktx2_B=len(ktx), ktx2_gzip9_B=EN.gz(ktx), respaldo_B=len(resp),
                sha256_glb=sha(glb), sha256_ktx2=sha(ktx), dentro=dict(glb=f'dentro/{name}.glb', B=len(glb_d), gzip9_B=EN.gz(glb_d), sha256=sha(glb_d)),
                comprobaciones=res)


if __name__ == '__main__':
    for d in (TMP, DST_D): os.makedirs(d, exist_ok=True)
    assert shutil.which('gltf-transform') and shutil.which('ktx'), 'faltan gltf-transform 4.5.1 y ktx en el PATH'
    out = {}
    # las islas: la KTX2, la medida del respaldo y las 2 entregas (el mapa entero y el piloto)
    atlas_i = RT.need(os.path.join(MAPA, 'atlas_isla.png'), 'atlas_isla.png (islas.py)')
    kt_i = os.path.join(TMP, 'atlas_isla.ktx2'); ktx_i = ktx_create(atlas_i, kt_i)
    out['respaldo_islas'], chosen = measure_islands(atlas_i, kt_i)
    print('respaldo de las islas:', out['respaldo_islas']['elegido'], json.dumps(out['respaldo_islas']['candidatos'], ensure_ascii=False), flush=True)
    isl = lambda sid: CI.ISLAS[sid[len('island_'):]][4] if sid and sid.startswith('island_') and sid[len('island_'):] in CI.ISLAS else None
    if chosen is not None:
        resp_i, fmt_i, side_i = chosen
        for name in ('islands', 'island_I1'):
            out[name] = deliver(os.path.join(MAPA, f'{name}.glb'), name, ktx_i, 'islands', resp_i, fmt_i, side_i, isl)
            print(name, json.dumps(out[name], ensure_ascii=False), flush=True)
    # el puerto (D92), con el respaldo de §9.8
    PF.use('v3')
    atlas_p = RT.need(os.path.join(MAPA, 'atlas_puerto_isla.png'), 'atlas_puerto_isla.png (puerto_isla.py)')
    ktx_p = ktx_create(atlas_p, os.path.join(TMP, 'atlas_puerto_isla.ktx2'))
    side_p, fmt_p = PORT_RESP
    resp_p = RS.encode(RS.fallback(atlas_p, side_p, regions={n: v[:4] for n, v in PI.AT.reg.items()}, size=1024), fmt_p)
    port_circles = lambda sid: [(x, z, r) for _, x, z, r in PF.CIRCLES] if sid == 'island_port' else None
    out['island_port'] = deliver(os.path.join(MAPA, 'island_port.glb'), 'island_port', ktx_p, 'island_port', resp_p, fmt_p, side_p, port_circles)
    out['island_port']['respaldo_igual_a_la_medida_P3'] = len(resp_p) == 20324
    print('island_port', json.dumps(out['island_port'], ensure_ascii=False), flush=True)
    # lo que baja la primera visita: el GLB de 4c y su KTX2, con gzip (AC-200 e: islas y puerto)
    if 'islands' in out:
        out['escenario_transferido_gzip9_B'] = out['islands']['glb_gzip9_B'] + out['islands']['ktx2_gzip9_B'] + out['island_port']['glb_gzip9_B'] + out['island_port']['ktx2_gzip9_B']
        out['escenario_archivo_B'] = out['islands']['glb_B'] + out['islands']['ktx2_B'] + out['island_port']['glb_B'] + out['island_port']['ktx2_B']
    json.dump(out, open(os.path.join(DST, 'entrega-mapa.json'), 'w'), indent=1, ensure_ascii=False)
    bad = [n for n in ('islands', 'island_I1', 'island_port') if n not in out]
    for n in ('islands', 'island_I1', 'island_port'):
        if n not in out: continue
        c = out[n]['comprobaciones']
        if not (c['validate']['sin_errores'] and c['validate_dentro']['sin_errores'] and all(r['nombre_igual_a_sb_id'] and r['malla'] and r['sb_circles_igual_a_gdd'] for r in c['raices'].values())
                and len(c['materiales']) == 1 and c['materiales'][0][1] == 'OPAQUE' and 'NORMAL' not in c['atributos']): bad.append(n)
    print('escenario (gzip -9, archivo):', out.get('escenario_transferido_gzip9_B'), out.get('escenario_archivo_B'))
    print('FALLOS:', bad or 'ninguno')
    sys.exit(1 if bad else 0)

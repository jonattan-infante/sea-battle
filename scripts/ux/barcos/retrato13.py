# Uso (desde la raíz del repo): python3 -I scripts/ux/barcos/retrato13.py <clase|all> <origen>
#   <clase>   sloop, brig, schooner, frigate o line; all, las 5 (las 15 imágenes de la tienda, D101 y D103)
#   <origen>  la UX_OUT del turno de la cadena: cadena/<clase>-rig.json (el barco de hoy, code/export-rig-clases.ts),
#             cadena/<id>_lod0.npz, cadena/comp/<atlas>.ktx2 y cadena/comp/<id>_meshopt.glb de cada familia
#   →  $UX_OUT/retratos13/<sb_id>_side.<h8>.webp y <sb_id>_side.png de los 3 aspectos y retratos13-<clase>.json
# Los retratos de la pestaña Familia de la 1.3 (D101; GDD §6, Q39; BACKLOG AC-225): el barco de una clase «sin familia» (su
# modelo procedural de hoy, con la luz del juego y sin la luz de forma de D91, que es de la cadena de arte), en la británica y
# en la española, con la vista y el tope de peso de retrato.py (D94; ASSET-SPEC §13): de lado y 20° hacia la popa, 12° de
# elevación, 760 × 480, WebP de calidad 85 en ≤ 40 000 B. Los 3 van a la misma escala y con la flotación en el mismo sitio.
# Comprobación de origen: la caja y los triángulos de LOD0 de cada familia frente a su GLB comprimido (el de la entrega
# «dentro», con la KTX2 en el BIN, solo existe para el Navío: retrato.py lo comprueba byte a byte), y la KTX2 que se pinta,
# la del atlas de la entrega. Escribe en UX_OUT. No corre en la CI.
import hashlib, json, os, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'laminas'), os.path.join(HERE, '..', 'mapa')): sys.path.insert(0, p)
import rutas as RT
import retrato as RE
import render_tex as RTX
import numpy as np

# clase → (sb_id sin familia, {familia: (id de la cadena, sb_id, atlas)}); el id de la cadena es también el del rig
# (<rig>-rig.json, en cadena/ o, el del Navío, en piloto/)
def _fam(cid, sid, atlas_gb='', atlas_es=''):
    return {'gb': (f'{cid}_gb', f'{sid}_gb', atlas_gb or f'atlas_{cid}_gb'), 'es': (f'{cid}_es', f'{sid}_es', atlas_es or f'atlas_{cid}_es')}


CLASES = {'sloop': ('ship_sloop', _fam('sloop', 'ship_sloop'), 'sloop'),
          'brig': ('ship_brigantine', _fam('brig', 'ship_brigantine'), 'brig'),
          'schooner': ('ship_schooner', _fam('schooner', 'ship_schooner'), 'schooner'),
          'frigate': ('ship_frigate', _fam('frigate', 'ship_frigate'), 'frigate'),
          'line': ('ship_line', _fam('navio', 'ship_line', 'atlas_gb', 'atlas_es'), 'navio')}


def rig_file(src, rig):
    for sub in ('cadena', 'piloto'):
        p = os.path.join(src, sub, f'{rig}-rig.json')
        if os.path.exists(p): return p
    return RT.need(os.path.join(src, 'cadena', f'{rig}-rig.json'), f'{rig}-rig.json')


def procedural(rig_path):
    """El barco de hoy del generador del juego: triángulos sueltos con color por vértice en lineal (clase_curvo.rig), sin
    textura (UV fija sobre un atlas blanco) y con las normales de cara, como la geometría no indexada del juego."""
    d = json.load(open(rig_path))['lod0']
    P = np.array(d['pos'], float).reshape(-1, 3); C = np.array(d['col'], float).reshape(-1, 3)
    UV = np.full((len(P), 2), 0.5); N = RTX.face_normals(P)
    Pc, UVc, Cc, Nc = RTX.clip_below_water(P, UV, C, N)
    return dict(P=Pc, UV=UVc, C=Cc, S=np.zeros(len(Pc)), N=Nc, P0=P)


def geom_check(glb, sid, P):
    """La caja de LOD0 del GLB comprimido (min/max de POSITION descuantizados con el nodo) frente a la del npz, y sus
    triángulos (Blender quita de 0 a 10 degenerados al soldar, como en retrato.glb_check)."""
    b = open(glb, 'rb').read(); js, _ = RE.read_glb(b); nodes = js['nodes']
    lod0 = next(n for n in nodes if n.get('name') == f'{sid}_lod0')
    prims = js['meshes'][lod0['mesh']]['primitives']; tri = sum(js['accessors'][p_['indices']]['count'] // 3 for p_ in prims)
    acc = js['accessors'][prims[0]['attributes']['POSITION']]
    k = {5122: 32767.0, 5120: 127.0, 5126: 1.0}[acc['componentType']] if acc.get('normalized') or acc['componentType'] == 5126 else 1.0
    sc = np.array(lod0.get('scale', [1, 1, 1])); tr = np.array(lod0.get('translation', [0, 0, 0]))
    lo = np.array(acc['min']) / k * sc + tr; hi = np.array(acc['max']) / k * sc + tr
    P = np.asarray(P).reshape(-1, 3); dbox = float(max(np.abs(lo - P.min(0)).max(), np.abs(hi - P.max(0)).max()))
    step = float(sc.max()) * 4 / 32767; ntri = len(P) // 3
    return dict(sha256_glb=hashlib.sha256(b).hexdigest(), caja_dif_m=round(dbox, 5), paso_m=round(step, 5), tris_glb=tri, tris_npz=ntri,
                ok=dbox <= step and 0 <= ntri - tri <= 10)


def run(cls, src, out, tmp):
    sid0, fams, rig = CLASES[cls]; mods, atl, res = {}, {}, {}
    rp = rig_file(src, rig); mods['none'] = procedural(rp)
    atl['none'] = np.ones((4, 4, 3)); res[sid0] = dict(familia='none', origen=dict(rig=os.path.relpath(rp, src), tris=len(mods['none']['P0']) // 3))
    for fam, (cid, sid, an) in fams.items():
        kp = RT.need(os.path.join(src, 'cadena', 'comp', f'{an}.ktx2'), f'{an}.ktx2')
        mods[fam] = RE.model(RT.need(os.path.join(src, 'cadena', f'{cid}_lod0.npz'), f'{cid}_lod0.npz'))
        chk = geom_check(RT.need(os.path.join(src, 'cadena', 'comp', f'{cid}_meshopt.glb'), f'{cid}_meshopt.glb'), sid, mods[fam]['P0'])
        if not chk['ok']: print('LA GEOMETRÍA NO CASA CON EL GLB', sid, chk); sys.exit(3)
        atl[fam] = RE.ktx_lin(kp, tmp); res[sid] = dict(familia=fam, origen=dict(chk, ktx2=an + '.ktx2', sha256_ktx2=hashlib.sha256(open(kp, 'rb').read()).hexdigest()))
    fr = RE.frame(list(mods.values()))
    for key, sid in [('none', sid0)] + [(f, v[1]) for f, v in fams.items()]:
        img = RE.shot(mods[key], atl[key], fr); img.save(os.path.join(out, f'{sid}_side.png'))
        best, tabla = RE.encode(img)
        if best['B'] > RE.MAX_B: print('NO CABE CON LA CALIDAD', RE.Q, 'EN', RE.MAX_B, sid, [(t['q'], t['B']) for t in tabla]); sys.exit(4)
        name = f"{sid}_side.{hashlib.sha256(best['data']).hexdigest()[:8]}.webp"; open(os.path.join(out, name), 'wb').write(best['data'])
        res[sid].update(webp=name, B=best['B'], q=best['q'], dE=best['dE'], sha256=hashlib.sha256(best['data']).hexdigest())
        print(sid, name, best['B'], 'B, q', best['q'], 'ΔE76', best['dE'])
    json.dump(dict(clase=cls, lado_px=[RE.W, RE.H], horizonte_px=RE.HOR, camara=dict(elevacion=RE.TH, rumbo=RE.HD), escala=fr, retratos=res),
              open(os.path.join(out, f'retratos13-{cls}.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    arg, src = sys.argv[1], sys.argv[2]
    out = os.path.join(RT.OUT, 'retratos13'); tmp = os.path.join(out, 'tmp'); os.makedirs(tmp, exist_ok=True)
    for cls in (CLASES if arg == 'all' else [arg]): run(cls, src, out, tmp)

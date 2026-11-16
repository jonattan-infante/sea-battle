# Uso (desde la raíz del repo), tras islas.py:
#   blender -b --factory-startup --python scripts/ux/mapa/blender_islas.py -- islands I1 I2 …   (o «all»)
#   →  $UX_OUT/mapa/<nombre>.glb (solo exporta: ligero, segundos; sin render)
# Monta las islas rediseñadas (D83) en un GLB: una raíz `island_<id>` por isla, con la traslación al centro de GDD §4 y los
# extras de ASSET-SPEC §4 (más `sb_circles`, la unión de círculos de la colisión B en coordenadas del mundo), y su malla
# `island_<id>_lod0` en coordenadas locales. 1 material OPAQUE (textura × COLOR_0) y 1 textura para todas, sin normales
# (flatShading, ASSET-SPEC §6). Comprimir después como en ASSET-SPEC §13, paso 4. No corre en la CI.
import bpy, bmesh, sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'laminas'))
sys.dont_write_bytecode = True
import rutas as RT
import circulos as CI
HERE = os.path.join(RT.OUT, 'mapa')
argv = sys.argv[sys.argv.index('--') + 1:]
NAME, IDS = argv[0], argv[1:]
if IDS == ['all']: IDS = [i for i in CI.ISLAS if i != 'PORT']
bpy.ops.wm.read_factory_settings(use_empty=True)
G2B = lambda p: (p[0], -p[2], p[1])  # juego (+Y arriba) → Blender (Z arriba); el exportador lo devuelve a +Y
img = bpy.data.images.load(os.path.join(HERE, 'atlas_isla.png')); img.colorspace_settings.name = 'sRGB'
mat = bpy.data.materials.new('islands'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
nt.links.new(tex.outputs['Color'], mul.inputs[6]); nt.links.new(vc.outputs['Color'], mul.inputs[7]); nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.85; bsdf.inputs['Metallic'].default_value = 0.0
for iid in IDS:
    arq, var, centro, old, circles = CI.ISLAS[iid]
    sid = f'island_{iid}'
    root = bpy.data.objects.new(sid, None); bpy.context.collection.objects.link(root)
    root.location = G2B((centro[0], 0.0, centro[1]))
    d = np.load(os.path.join(HERE, f'isla_{iid}_lod0.npz')); P, T, Cc = d['p'] - np.array([centro[0], 0.0, centro[1]]), d['t'], d['c']; n = len(P)
    me = bpy.data.meshes.new(f'{sid}_lod0')
    me.from_pydata([G2B(p) for p in P], [], [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(n // 3)])
    uvl = me.uv_layers.new(name='UVMap'); uvl.data.foreach_set('uv', T.reshape(-1))
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); col.data.foreach_set('color', np.concatenate([Cc, np.ones((n, 1))], axis=1).reshape(-1))
    me.materials.append(mat)
    ob = bpy.data.objects.new(f'{sid}_lod0', me); ob.parent = root; bpy.context.collection.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(me); bm.free()
    extras = {'sb_version': 1, 'sb_kind': 'island', 'sb_id': sid, 'sb_archetype': arq, 'sb_circles': [list(c) for c in circles]}
    if var: extras['sb_variant'] = var
    for k, v in extras.items(): root[k] = v
out = os.path.join(HERE, f'{NAME}.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_image_format='AUTO',
                          export_vertex_color='ACTIVE', export_attributes=True, export_extras=True, export_normals=False)
print('glb', os.path.basename(out), os.path.getsize(out), 'islas', len(IDS))

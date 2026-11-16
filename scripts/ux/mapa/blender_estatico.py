# Uso (desde la raíz del repo), tras puerto_colonial.py:
#   blender -b --factory-startup --python scripts/ux/mapa/blender_estatico.py -- puerto island_port '{"sb_collider": [0, 0, 30], "sb_archetype": "port"}'
#   →  $UX_OUT/mapa/island_port.glb (solo exporta: ligero, ≈ 1 s; sin render)
# Monta un asset estático del mapa desde $UX_OUT/mapa/<nombre>_lod0.npz y su atlas, y lo exporta como GLB con la
# jerarquía de ASSET-SPEC §3 (raíz <id> con extras §4 y la malla <id>_lod0), 1 material OPAQUE con la textura × COLOR_0
# (§6) y sin normales: las islas y los estáticos van con flatShading (§6), que no las usa. Comprimir después con
# gltf-transform etc1s y meshopt (como scripts/ux/barcos/comprimir.sh). No corre en la CI.
import bpy, bmesh, sys, os, json
import numpy as np
sys.dont_write_bytecode = True  # el Python de Blender ignora PYTHONDONTWRITEBYTECODE (sin esto deja __pycache__ en laminas/)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'laminas')); import rutas as RT
HERE = os.path.join(RT.OUT, 'mapa')
argv = sys.argv[sys.argv.index('--') + 1:]
NAME, SB_ID = argv[0], argv[1]; EXTRA = json.loads(argv[2]) if len(argv) > 2 else {}
bpy.ops.wm.read_factory_settings(use_empty=True)
G2B = lambda p: (p[0], -p[2], p[1])  # juego (+Y arriba) → Blender (Z arriba); el exportador lo devuelve a +Y
img = bpy.data.images.load(os.path.join(HERE, f'atlas_{NAME}.png')); img.colorspace_settings.name = 'sRGB'
mat = bpy.data.materials.new(SB_ID); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
nt.links.new(tex.outputs['Color'], mul.inputs[6]); nt.links.new(vc.outputs['Color'], mul.inputs[7]); nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.85; bsdf.inputs['Metallic'].default_value = 0.0
root = bpy.data.objects.new(SB_ID, None); bpy.context.collection.objects.link(root)
d = np.load(os.path.join(HERE, f'{NAME}_lod0.npz')); P, T, Cc = d['p'], d['t'], d['c']; n = len(P)
me = bpy.data.meshes.new(f'{SB_ID}_lod0')
me.from_pydata([G2B(p) for p in P], [], [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(n // 3)])
uvl = me.uv_layers.new(name='UVMap'); uvl.data.foreach_set('uv', T.reshape(-1))
col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); col.data.foreach_set('color', np.concatenate([Cc, np.ones((n, 1))], axis=1).reshape(-1))
me.materials.append(mat)
ob = bpy.data.objects.new(f'{SB_ID}_lod0', me); ob.parent = root; bpy.context.collection.objects.link(ob)
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(me); bm.free()
P3 = np.asarray(P)
extras = {'sb_version': 1, 'sb_kind': 'island', 'sb_id': SB_ID, **EXTRA}
for k, v in extras.items(): root[k] = v
out = os.path.join(HERE, f'{SB_ID}.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_image_format='AUTO',
                          export_vertex_color='ACTIVE', export_attributes=True, export_extras=True, export_normals=False)
print('glb', os.path.basename(out), os.path.getsize(out), 'tris', n // 3)

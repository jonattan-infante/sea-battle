# Uso (desde la raíz del repo), tras navio.py:
#   blender -b --factory-startup --python scripts/ux/barcos/blender_navio.py -- gb   →  $UX_OUT/piloto/ship_line_gb.glb
#   blender -b --factory-startup --python scripts/ux/barcos/blender_navio.py -- es   →  $UX_OUT/piloto/ship_line_es.glb
# El export es ligero (≈ 1 s). Con «render <vistas JSON>» además renderiza con Eevee las vistas de la lámina, y eso es
# una corrida pesada que pide turno de máquina. Las vistas de D80, con la Fragata y el Navío de hoy de hoy_a_npz.py:
#   V='[{"name":"lado","th":0,"heading":56,"ppm":6,"W":370,"H":262,"ox":175,"oy":228},{"name":"arriba","th":90,"heading":90,"ppm":6,"W":370,"H":112,"ox":165,"oy":56},{"name":"juego","th":55,"heading":135,"ppm":6,"W":370,"H":236,"ox":175,"oy":166},{"name":"cerca","th":30,"heading":118,"ppm":11,"W":560,"H":340,"ox":285,"oy":250}]'
#   for f in hoyfrigate hoyline gb es; do blender -b --factory-startup --python scripts/ux/barcos/blender_navio.py -- $f render "$V"; done
# Blender 5.2.2; la variable UX_OUT pasa a Blender tal cual. Después, comprimir.sh.
# Escribe y lee en $UX_OUT/piloto (rutas.py de scripts/ux/laminas). No corre en la CI.
# Blender (sin interfaz): monta el Navío por familia desde navio_<fam>_lod<n>.npz, exporta el GLB (ASSET-SPEC §1–§7, §13)
# y renderiza las vistas de la lámina con una cámara ortográfica como la del juego. Uso:
#   blender -b --factory-startup --python blender_navio.py -- <fam> [render]
import bpy, bmesh, sys, os, math, json
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'laminas')); import rutas as RT
HERE = os.path.join(RT.OUT, 'piloto')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['gb']
FAM = argv[0]; DO_RENDER = 'render' in argv
bpy.ops.wm.read_factory_settings(use_empty=True)
G2B = lambda p: (p[0], -p[2], p[1])  # juego (+Y arriba, proa +Z) → Blender (Z arriba); el exportador lo devuelve a +Y
img = bpy.data.images.load(os.path.join(HERE, f'atlas_{FAM}.png')); img.colorspace_settings.name = 'sRGB'
mat = bpy.data.materials.new(f'ship_line_{FAM}'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
nt.links.new(tex.outputs['Color'], mul.inputs[6]); nt.links.new(vc.outputs['Color'], mul.inputs[7]); nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.85; bsdf.inputs['Metallic'].default_value = 0.0
# especular por defecto en el GLB (sin KHR_materials_specular); a 0 solo para el render de la lámina
root = bpy.data.objects.new(f'ship_line_{FAM}', None); bpy.context.collection.objects.link(root)
tris = {}
for lod in (0, 1):
    d = np.load(os.path.join(HERE, f'navio_{FAM}_lod{lod}.npz'))
    P, T, Cc, Rr = d['p'], d['t'], d['c'], d['r']; n = len(P)
    me = bpy.data.meshes.new(f'ship_line_{FAM}_lod{lod}')
    me.from_pydata([G2B(p) for p in P], [], [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(n // 3)])
    uvl = me.uv_layers.new(name='UVMap'); uvl.data.foreach_set('uv', T.reshape(-1))
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); col.data.foreach_set('color', np.concatenate([Cc, np.ones((n, 1))], axis=1).reshape(-1))
    rim = me.attributes.new('_RIM_MASK', 'FLOAT', 'POINT'); rim.data.foreach_set('value', Rr)
    me.materials.append(mat)
    ob = bpy.data.objects.new(f'ship_line_{FAM}_lod{lod}', me); ob.parent = root; bpy.context.collection.objects.link(ob)
    # vértices soldados (mismas posición, UV y color) para no inflar el GLB, y normales con pliegue de 40° (§6, D23)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(me); bm.free()
    me.set_sharp_from_angle(angle=math.radians(40)) if hasattr(me, 'set_sharp_from_angle') else None
    ob.hide_render = lod == 1; tris[lod] = n // 3
# sockets (ASSET-SPEC §3) y extras (§4)
rig = json.load(open(os.path.join(HERE, 'navio-rig.json')))
ex = dict(rig['extras']); ex['sb_id'] = f'ship_line_{FAM}'; ex['sb_family'] = FAM
for k, v in ex.items(): root[k] = v
def socket(name, p, rz=0.0):
    # §3: los de cañón miran hacia fuera (+Z del socket → ±X); en Blender, giro en Z de ±90° (el exportador lo pasa a +Y)
    e = bpy.data.objects.new(name, None); e.location = G2B(p); e.rotation_euler = (0, 0, rz); e.parent = root; bpy.context.collection.objects.link(e)
BAND_Y = {-14: 1.35, -7: 1.35, 0: 1.35, 7: 1.35, 14: 1.35, -17.5: 2.75, -10.5: 2.75, -3.5: 2.75, 3.5: 2.75, 10.5: 2.75}
for side, key in ((1, 'port'), (-1, 'stbd')):
    for i, p in enumerate(rig['sockets'][key]):
        socket(f'socket_cannon_{key}_{i + 1:02d}', (p[0], BAND_Y.get(round(p[2], 1), p[1]), p[2]), side * math.pi / 2)
for name in ('smoke', 'label', 'wake', 'bow'): socket(f'socket_{name}', rig['sockets'][name])
for i, p in enumerate(rig['sockets']['fire']): socket(f'socket_fire_{i + 1:02d}', p)
out = os.path.join(HERE, f'ship_line_{FAM}.glb')
if not FAM.startswith('hoy'): bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_image_format='WEBP',
                          export_vertex_color='ACTIVE', export_attributes=True, export_extras=True)
print('glb', os.path.basename(out), os.path.getsize(out) if os.path.exists(out) else 0, 'tris', tris)
if DO_RENDER:
    if 'Specular IOR Level' in bsdf.inputs: bsdf.inputs['Specular IOR Level'].default_value = 0.0
    sc = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.render.film_transparent = True; sc.render.resolution_percentage = 100
    try: sc.eevee.taa_render_samples = 32
    except Exception: pass
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (1, 1, 1, 1); bg.inputs['Strength'].default_value = 0.85
    sun = bpy.data.lights.new('sol', 'SUN'); sun.energy = 1.18; sun.use_shadow = False
    so = bpy.data.objects.new('sol', sun); bpy.context.collection.objects.link(so)
    ld = np.array(G2B((-0.45, 0.8, 0.4))); ld /= np.linalg.norm(ld)
    so.rotation_mode = 'QUATERNION'; from mathutils import Vector
    so.rotation_quaternion = Vector(ld.tolist()).to_track_quat('Z', 'Y')
    cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam = bpy.data.objects.new('cam', cam_d); bpy.context.collection.objects.link(cam); sc.camera = cam
    VIEWS = json.loads(argv[argv.index('render') + 1]) if len(argv) > argv.index('render') + 1 else []
    for v in VIEWS:  # {name, th, heading, ppm, W, H, ox, oy}
        th = math.radians(v['th']); root.rotation_euler = (0, 0, math.radians(v['heading']))
        W, H, ppm = v['W'], v['H'], v['ppm']
        sc.render.resolution_x, sc.render.resolution_y = W, H
        cam_d.ortho_scale = max(W, H) / ppm
        right = np.array([1.0, 0, 0]); up = np.array([0, math.sin(th), math.cos(th)]); back = np.array([0, -math.cos(th), math.sin(th)])
        pos = 200 * back + right * (W / 2 - v['ox']) / ppm + up * (v['oy'] - H / 2) / ppm
        cam.location = pos.tolist(); cam.rotation_euler = (math.pi / 2 - th, 0, 0)
        cam_d.clip_end = 1000
        sc.render.filepath = os.path.join(HERE, f"render_{FAM}_{v['name']}.png"); bpy.ops.render.render(write_still=True)
        print('render', v['name'])

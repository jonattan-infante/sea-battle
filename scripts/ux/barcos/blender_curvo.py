# Uso (desde la raíz del repo), tras navio_curvo.py y canonera_curvo.py (la misma UX_OUT):
#   blender -b --factory-startup -t 1 --python scripts/ux/barcos/blender_curvo.py -- <id> bake <lado> <muestras>
#     →  $UX_OUT/cadena/ao_<id>.npy: la oclusión ambiental horneada con Cycles en la UV de cada superficie (solo las
#        caras con bk = 1: babor y lo que no se repite; estribor y el aparejo tapan pero no se hornean), en float y sin
#        pasar por la gestión de color de Blender (un PNG de save_render saldría con la transformada de vista de la escena)
#   blender -b --factory-startup -t 1 --python scripts/ux/barcos/blender_curvo.py -- <id> export
#     (la textura sale en PNG, sin pérdida, y la KTX2 se hace desde él: ver la cabecera de comprimir_cadena.sh)
#     →  $UX_OUT/cadena/<id>.glb con el atlas final (atlas_<fam>.png), LOD0 y LOD1, COLOR_0 y _RIM_MASK (ASSET-SPEC §1–§7);
#        los Navíos y la Cañonera rehecha, con los sockets y los extras de $UX_OUT/cadena/<id>-sockets.json (sockets_curvo.py;
#        sockets_canonera2.py)
# <id>: navio_gb, navio_es, canonera (la de D91), canonera2 (la rehecha, canonera2_curvo.py) o capitan (capitan_curvo.py). El horneado es una corrida pesada que pide turno de máquina (un núcleo con -t 1);
# el export es ligero (≈ 1 s). Blender 5.2.2. No corre en la CI.
import bpy, bmesh, sys, os, math, json, time
import numpy as np
sys.dont_write_bytecode = True  # el Python de Blender ignora PYTHONDONTWRITEBYTECODE
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'laminas')); import rutas as RT
OUT = os.path.join(RT.OUT, 'cadena')
argv = sys.argv[sys.argv.index('--') + 1:]
ID, MODE = argv[0], argv[1]
FAM = ID.split('_')[1] if ID.startswith('navio') else ID
bpy.ops.wm.read_factory_settings(use_empty=True)
G2B = lambda p: (p[0], -p[2], p[1])  # juego (+Y arriba, proa +Z) → Blender (Z arriba); el exportador lo devuelve a +Y


def mesh(lod, name, bake_uv=False):
    d = np.load(os.path.join(OUT, f'{ID}_lod{lod}.npz'))
    P, T, Cc, Rr, Bk = d['p'], d['t'], d['c'], d['r'], d['b']; n = len(P)
    me = bpy.data.meshes.new(name)
    me.from_pydata([G2B(p) for p in P], [], [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(n // 3)])
    uvl = me.uv_layers.new(name='UVMap'); uvl.data.foreach_set('uv', T.reshape(-1))
    if bake_uv:  # lo que no se hornea, fuera de la imagen (u + 2): tapa la luz pero no escribe píxeles
        Tb = T + np.where(Bk[:, None] > 0.5, 0.0, 2.0) * np.array([1.0, 0.0])
        bl = me.uv_layers.new(name='BakeUV'); bl.data.foreach_set('uv', Tb.reshape(-1))
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); col.data.foreach_set('color', np.concatenate([Cc, np.ones((n, 1))], axis=1).reshape(-1))
    rim = me.attributes.new('_RIM_MASK', 'FLOAT', 'POINT'); rim.data.foreach_set('value', Rr)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(me); bm.free()
    if bake_uv: bl = me.uv_layers['BakeUV']; me.uv_layers.active = bl; bl.active_render = True  # el horneado escribe en esta UV
    if hasattr(me, 'set_sharp_from_angle'): me.set_sharp_from_angle(angle=math.radians(40))  # normales con pliegue de 40° (§6, D23)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob, n // 3


if MODE == 'bake':
    size, samples = int(argv[2]), int(argv[3])
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    sc.render.threads_mode = 'FIXED'; sc.render.threads = 1
    world = bpy.data.worlds.new('w'); sc.world = world; world.light_settings.distance = 3.0  # alcance de la oclusión: 3 m
    ob, ntri = mesh(0, f'{ID}_bake', bake_uv=True)
    img = bpy.data.images.new(f'ao_{ID}', size, size, float_buffer=True); img.generated_color = (1, 1, 1, 1)
    mat = bpy.data.materials.new('bake'); mat.use_nodes = True; node = mat.node_tree.nodes.new('ShaderNodeTexImage'); node.image = img
    mat.node_tree.nodes.active = node; ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    t0 = time.time()
    bpy.ops.object.bake(type='AO', margin=6, margin_type='EXTEND', use_clear=False)
    dt = time.time() - t0
    px = np.empty(size * size * 4, np.float32); img.pixels.foreach_get(px)
    np.save(os.path.join(OUT, f'ao_{ID}.npy'), px.reshape(size, size, 4)[::-1, :, 0].copy())  # filas de arriba abajo, como el atlas
    json.dump(dict(id=ID, size=size, samples=samples, tris=ntri, seconds=round(dt, 1)), open(os.path.join(OUT, f'bake_{ID}.json'), 'w'))
    print(f'BAKE {ID} {size}px {samples} muestras {ntri} tris: {dt:.1f} s')
else:
    atlas = os.path.join(OUT, f'atlas_{FAM}.png')
    img = bpy.data.images.load(atlas); img.colorspace_settings.name = 'sRGB'
    mat = bpy.data.materials.new(ID); mat.use_nodes = True; nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    nt.links.new(tex.outputs['Color'], mul.inputs[6]); nt.links.new(vc.outputs['Color'], mul.inputs[7]); nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85; bsdf.inputs['Metallic'].default_value = 0.0
    sid = {'navio_gb': 'ship_line_gb', 'navio_es': 'ship_line_es', 'canonera': 'npc_pirate_gunboat', 'canonera2': 'npc_pirate_gunboat', 'capitan': 'npc_pirate_captain'}[ID]
    if ID != 'canonera': mat.name = sid  # el nombre del material, como en el piloto (blender_navio.py)
    root = bpy.data.objects.new(sid, None); bpy.context.collection.objects.link(root)
    tris = {}
    for lod in (0, 1):
        ob, tris[lod] = mesh(lod, f'{sid}_lod{lod}'); ob.data.materials.append(mat); ob.parent = root
    root['sb_id'] = sid
    if ID in ('navio_gb', 'navio_es', 'canonera2'):  # sockets (ASSET-SPEC §3) y extras (§4) de sockets_curvo.py o sockets_canonera2.py; el Capitán, en su entrega
        sk = json.load(open(RT.need(os.path.join(OUT, f'{ID}-sockets.json'), f'{ID}-sockets.json (sockets_curvo.py o sockets_canonera2.py)')))
        for k, v in sk['extras'].items(): root[k] = v
        for name, p, rz in sk['sockets']:  # los de cañón miran hacia fuera: giro en Z de Blender, que el exportador pasa a +Y
            e = bpy.data.objects.new(name, None); e.location = G2B(p); e.rotation_euler = (0, 0, rz); e.parent = root
            bpy.context.collection.objects.link(e)
    out = os.path.join(OUT, f'{ID}.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_image_format='AUTO',
                              export_vertex_color='ACTIVE', export_attributes=True, export_extras=True)
    print('GLB', os.path.basename(out), os.path.getsize(out), 'tris', tris)

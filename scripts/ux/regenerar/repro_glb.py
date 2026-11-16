# ux · AC-192 (f), punto 2 (BACKLOG :348): la entrega regenerada frente a lo que su commit de entrega dejó escrito en
# ASSET-SPEC (cada cifra con su ruta:línea en ese commit, en el archivo de lo esperado): triángulos por LOD, caja del casco
# (AS-V03), sockets (posición en el mundo, con la cadena de padres del GLB), extras de la raíz y, con el JSON de sockets del
# turno, sus comprobaciones (D45 en el Capitán). Los bytes (claves que acaban en _B) solo se anotan, sin cota; todo lo demás
# es condición. Imprime «REPRO <sb_id> <clave> <valor> frente a <esperado> IGUAL|DISTINTO (condición|se anota) · <fuente>»
# y acaba con «REPRO <sb_id> CONDICIONES CUMPLE|NO CUMPLE»; sale con 0 o con 2.
# Uso: python3 -I repro_glb.py <dir entrega> <esperado.json> [<…-sockets.json>]
# esperado.json: {"sb_id": …, "esperado": [[clave, valor, fuente], …]}. Claves:
#   lod0, lod1, cannons_port, cannons_stbd, fires (enteros); ktx_B, dentro_B, fuera_B, respaldo_B (bytes, se anotan);
#   caja_eslora_m, caja_manga_m, caja_eslora_pct, caja_manga_pct (cadenas: se compara con sus decimales);
#   socket:<nombre> ([x, y, z] en cadenas, "*" = no se mira; null = no tiene que existir);
#   cannon_absx, cannon_y ([mín, máx] en cadenas, sobre todos los socket_cannon_*);
#   extra:<nombre> (cadena o lista de cadenas); sj:<ruta/en/el/json/de/sockets> (entero o cadena)
import sys, os, json, struct, glob
import numpy as np

d, want = sys.argv[1], json.load(open(sys.argv[2])); sid = want['sb_id']
sj = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else None


def glb_json(p):
    b = open(p, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; return json.loads(b[20:20 + jl])


def trs(n):
    if 'matrix' in n: return np.array(n['matrix'], float).reshape(4, 4).T
    x, y, z, w = n.get('rotation', [0, 0, 0, 1]); R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                                                             [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                                                             [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(n.get('scale', [1, 1, 1]))[None, :]; M[:3, 3] = n.get('translation', [0, 0, 0]); return M


dentro = os.path.join(d, 'dentro', f'{sid}.glb'); js = glb_json(dentro); nodes = js['nodes']
parent = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}


def world(i):
    M = trs(nodes[i])
    while i in parent: i = parent[i]; M = trs(nodes[i]) @ M
    return M[:3, 3]


pos = {n.get('name', ''): world(i) for i, n in enumerate(nodes)}
tris = {n['name']: sum((js['accessors'][pr['indices']] if 'indices' in pr else js['accessors'][pr['attributes']['POSITION']])['count'] // 3
                       for pr in js['meshes'][n['mesh']]['primitives']) for n in nodes if 'mesh' in n}
root = next(n for n in nodes if n.get('name') == sid); ex = root.get('extras', {})
fuera = glob.glob(os.path.join(d, f'{sid}.*.glb')); ktx = glob.glob(os.path.join(d, f'{sid}_atlas.*.ktx2'))
ent = [json.load(open(p)) for p in glob.glob(os.path.join(d, 'entrega-*.json'))]
info = next((e[sid] for e in ent if sid in e), {}); casco = info.get('comprobaciones', {}).get('AS-V03 casco')
cann = [p for k, p in pos.items() if k.startswith('socket_cannon_')]
got = dict(lod0=next((v for k, v in tris.items() if k.endswith('_lod0')), None), lod1=next((v for k, v in tris.items() if k.endswith('_lod1')), None),
           ktx_B=os.path.getsize(ktx[0]) if len(ktx) == 1 else None, dentro_B=os.path.getsize(dentro),
           fuera_B=os.path.getsize(fuera[0]) if len(fuera) == 1 else None, respaldo_B=info.get('respaldo_B'),
           cannons_port=sum(k.startswith('socket_cannon_port_') for k in pos), cannons_stbd=sum(k.startswith('socket_cannon_stbd_') for k in pos),
           fires=sum(k.startswith('socket_fire_') for k in pos),
           cannon_absx=[min(abs(p[0]) for p in cann), max(abs(p[0]) for p in cann)] if cann else None,
           cannon_y=[min(p[1] for p in cann), max(p[1] for p in cann)] if cann else None)
if casco:
    got.update(caja_eslora_m=casco['caja']['eslora'], caja_manga_m=casco['caja']['manga'])
    if ex.get('sb_length') and ex.get('sb_beam'):
        got.update(caja_eslora_pct=100 * (casco['caja']['eslora'] / ex['sb_length'] - 1), caja_manga_pct=100 * (casco['caja']['manga'] / ex['sb_beam'] - 1))


def fmt(g, w):  # g con los decimales de la cadena w; sin «-0»
    nd = len(w.split('.')[1]) if '.' in w else 0; s = f'{float(g):.{nd}f}'
    return s.lstrip('-') if float(s) == 0 else s


def same(g, w):
    if g is None or w is None: return g is None and w is None, g
    if isinstance(w, str):
        try: s = fmt(g, w)
        except (TypeError, ValueError): return False, g
        return s == w, s
    if isinstance(w, list):
        if not isinstance(g, (list, tuple, np.ndarray)) or len(g) != len(w): return False, g
        r = [same(a, b) for a, b in zip(g, w) if b != '*']; return all(x for x, _ in r), [('*' if b == '*' else same(a, b)[1]) for a, b in zip(g, w)]
    return g == w, g


bad = []
for k, w, src in want['esperado']:
    if k.startswith('socket:'): g = pos.get(k[7:]); g = None if g is None else [float(v) for v in g]
    elif k.startswith('extra:'): g = ex.get(k[6:])
    elif k.startswith('sj:'):
        g = sj
        for part in k[3:].split('/'): g = (g[int(part)] if isinstance(g, list) else g.get(part)) if g is not None else None
    else: g = got.get(k)
    ok, shown = same(g, w); nota = k.endswith('_B')
    extra = f' ({g - w:+d})' if not ok and isinstance(g, int) and isinstance(w, int) and not isinstance(g, bool) else ''
    print('REPRO', sid, k, shown, 'frente a', w, ('IGUAL' if ok else 'DISTINTO' + extra), '(se anota, sin cota)' if nota else '(condición)', '·', src)
    if not ok and not nota: bad.append(k)
print('REPRO', sid, 'nodos con malla', tris, '· extras', ex, '· caja AS-V03', casco, '· archivos', [os.path.basename(p) for p in fuera + ktx])
print('REPRO', sid, 'CONDICIONES', 'CUMPLE' if not bad else f'NO CUMPLE ({", ".join(bad)})')
sys.exit(2 if bad else 0)

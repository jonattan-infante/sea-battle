# ux · npz de LOD0 y LOD1 de una variante de las velas (canonera2_curvo.build con SAILS cambiado), para las firmas de
# AD-28 (ad28_canonera2.py firmas) y el área de las lonas. Uso: python3 -I variante_npz.py <scripts/ux> <variante> <carpeta>
import sys, os, math, json, shutil
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
var, dst = sys.argv[2], sys.argv[3]
sys.argv = [sys.argv[0], sys.argv[1], 'x']
import numpy as np
import balanceo as BL
C2 = BL.C2
os.makedirs(os.path.join(dst, 'cadena', 'comp'), exist_ok=True)
sails, open_deg, jib = {}, None, None  # las mismas variantes que balanceo.load_variant: pie, pico, abre, foque, foquecab
for part in var.split('+'):
    k, v = part.split(':')
    if k in ('pie', 'pico'):
        dm, df = (float(x) for x in v.split(','))
        for key, dd in (('main', dm), ('fore', df)):
            z_m, A_, B_, Cc, D_ = sails.get(key, C2.SAILS[key])
            sails[key] = (z_m, (A_[0], A_[1] + dd), B_, Cc, (D_[0], D_[1] + dd)) if k == 'pie' else (z_m, A_, B_, (Cc[0], Cc[1] + dd), D_)
    elif k == 'abre': open_deg = float(v)
    elif k == 'foque': jib = tuple(float(x) for x in v.split(','))
    elif k == 'foquecab': BL.JIB['head'] = float(v)
    else: raise SystemExit(f'variante desconocida: {part}')
rig0, open0 = C2.rigging, C2.OPEN
if jib is not None or BL.JIB['head'] is not None:  # el foque está escrito en rigging(): build() usa una copia cambiada
    import inspect, textwrap
    src = inspect.getsource(C2.rigging); new = src
    if jib is not None:
        new = new.replace('clew = np.array([-1.6, 3.4, 10.2])', 'clew = np.array(%r)' % (list(jib),)); assert new != src, 'puño del foque'
    if BL.JIB['head'] is not None:
        n2 = new.replace('head = np.array([0.0, FORE_TOP - 0.3, FORE_Z])', 'head = np.array([0.0, %r, FORE_Z])' % BL.JIB['head']); assert n2 != new, 'puño de driza'; new = n2
    ns = dict(C2.__dict__); exec(textwrap.dedent(new), ns); C2.rigging = ns['rigging']
if open_deg is not None: C2.OPEN = math.radians(open_deg)
saved = dict(C2.SAILS); C2.SAILS.update(sails)
try:
    for lod in (0, 1):
        m, H = C2.build(lod); a = m.arrays(); np.savez(os.path.join(dst, 'cadena', f'canonera2_lod{lod}.npz'), **a)
        print(f'{var} lod{lod}: {m.ntri()} tris')
finally:
    C2.SAILS.clear(); C2.SAILS.update(saved); C2.rigging = rig0
src = BL.A.CAD
for f in ('pirate-rig.json', 'captain-rig.json', 'gunboat-rig.json'): shutil.copyfile(os.path.join(src, f), os.path.join(dst, 'cadena', f))
shutil.copyfile(os.path.join(src, 'comp', 'atlas_canonera2.ktx2'), os.path.join(dst, 'cadena', 'comp', 'atlas_canonera2.ktx2'))
# área de las lonas (m²) del LOD0, por la región del atlas de su UV
a, tag, gun = BL.build_tagged(sails or None, jib_clew=jib)
C2.OPEN = open0
T = a['p'].reshape(-1, 3, 3); ar = 0.5 * np.linalg.norm(np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]), axis=1)
uvc = a['t'].reshape(-1, 3, 2).mean(1) * np.array([C2.AT.A, -C2.AT.A]) + np.array([0, C2.AT.A])
out = {}
for reg in ('sail_main', 'sail_fore', 'jib'):
    x0, y0, w, h = C2.AT.R[reg]; ins = (uvc[:, 0] >= x0) & (uvc[:, 0] <= x0 + w) & (uvc[:, 1] >= y0) & (uvc[:, 1] <= y0 + h)
    out[reg] = round(float(ar[ins].sum()), 2)
print(f'{var} área de lona (m²): {out}')
json.dump(dict(variante=var, area_m2=out, abre_grados=open_deg, foque_escota=jib, foque_driza_y=BL.JIB['head'], sails={k: C2.SAILS[k] if k not in sails else sails[k] for k in ('main', 'fore')}), open(os.path.join(dst, 'variante.json'), 'w'), indent=1)

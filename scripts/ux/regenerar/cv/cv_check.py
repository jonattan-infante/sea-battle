# ux · comprobaciones del turno CV (D97: la Cañonera con las velas a 48° y el foque desde 10,5 m; reexporte con la AO
# rehorneada; BACKLOG :421, orden de construcción, punto (2)). Cada orden imprime líneas «[CV] …» y sale con 0 si cumple,
# con 2 si no y con otro código si falla la herramienta. Solo lee lo que se le pasa y escribe en <salida>.
#   npz <dir A> <dir B>        canonera2_lod{0,1}.npz de A y de B: las mismas claves y los mismos arrays (np.array_equal)
#   iguales <a> <b>            2 archivos: los mismos bytes o, si son PNG, los mismos píxeles
#   ao <ao viejo.npy> <ao nuevo.npy> <atlas base.png> <atlas viejo.png> <atlas nuevo.png> <scripts/ux> <salida>
#                              condiciones de producto para el atlas: el mismo tamaño y formato; el atlas nuevo es
#                              exactamente compose(base, AO nueva) de navio_curvo.py y el viejo, compose(base, AO vieja), así
#                              que todo lo que cambia sale de la AO; por región del atlas (canonera2_curvo.AT.R), px que
#                              cambian, ΔE76 medio y máximo, y cuánto se aclara o se oscurece la AO; y ao-antes-despues.png
#                              (atlas viejo | nuevo | ΔE76, a 512 px) y ao-cambios.json
#   sockets <a.json> <b.json>  los 2 JSON de sockets, clave a clave (se anota; las condiciones las pone repro_glb.py)
#   kb <entrega vieja.json> <entrega nueva.json>   los bytes de la textura (KTX2 y respaldo) y del GLB (dentro y 4c), con gzip
import sys, os, json, hashlib
import numpy as np
from PIL import Image


def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
def say(*a): print('[CV]', *a, flush=True)


def srgb2lin(a): a = a / 255.0; return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
def lab(x):  # sRGB de 8 bits → Lab D65, como veredicto_cajas.py
    c = srgb2lin(x)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T
    xyz /= np.array([0.95047, 1.0, 1.08883]); f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def c_npz(a, b):
    ok = True
    for lod in (0, 1):
        A, B = (np.load(os.path.join(d, f'canonera2_lod{lod}.npz')) for d in (a, b))
        same = sorted(A.files) == sorted(B.files) and all(np.array_equal(A[k], B[k]) for k in A.files)
        say(f'NPZ lod{lod}', 'IGUAL' if same else 'DISTINTO', f'· {len(A["p"]) // 3} frente a {len(B["p"]) // 3} tris · claves {sorted(A.files)}'); ok &= same
    return 0 if ok else 2


def c_iguales(a, b):
    ha, hb = sha(a), sha(b)
    if ha == hb: say('IGUALES (mismos bytes)', ha[:8], os.path.basename(a), os.path.basename(b)); return 0
    if a.endswith('.png') and b.endswith('.png'):
        A, B = (np.asarray(Image.open(p)) for p in (a, b))
        if A.shape == B.shape and (A == B).all(): say('IGUALES (mismos píxeles)', ha[:8], hb[:8]); return 0
        n = int((A != B).reshape(A.shape[0], A.shape[1], -1).any(-1).sum()) if A.shape == B.shape else None
        say('DISTINTOS', ha[:8], hb[:8], f'· {A.shape} frente a {B.shape} · px distintos {n}'); return 2
    say('DISTINTOS', ha[:8], hb[:8]); return 2


def c_ao(ao_old, ao_new, base, old, new, uxs, out):
    for p in ('barcos', 'laminas', 'mapa'): sys.path.insert(0, os.path.join(uxs, p))
    import navio_curvo as NC, canonera2_curvo as C2
    os.makedirs(out, exist_ok=True); ok = True
    im_o, im_n, im_b = Image.open(old), Image.open(new), Image.open(base)
    fmt = (im_o.size, im_o.mode) == (im_n.size, im_n.mode) == (im_b.size, im_b.mode)
    say('ATLAS formato', 'IGUAL' if fmt else 'DISTINTO', f'· viejo {im_o.size} {im_o.mode} · nuevo {im_n.size} {im_n.mode} · base {im_b.size} {im_b.mode}'); ok &= fmt
    O, N = np.asarray(im_o.convert('RGB')).astype(int), np.asarray(im_n.convert('RGB')).astype(int)
    for name, ao, ref in (('viejo', ao_old, O), ('nuevo', ao_new, N)):
        comp = np.asarray(NC.compose(im_b, ao, C2.AT.R['white']).convert('RGB')).astype(int)
        same = comp.shape == ref.shape and (comp == ref).all()
        say(f'ATLAS {name} = base × AO {name}', 'SÍ' if same else f'NO ({int((comp != ref).any(-1).sum())} px distintos)'); ok &= bool(same)
    a0, a1 = (np.asarray(Image.fromarray(np.load(p).astype(np.float32), 'F').resize(im_b.size, Image.BILINEAR), float) for p in (ao_old, ao_new))
    diff = (O != N).any(-1); e = np.linalg.norm(lab(O) - lab(N), axis=-1)
    say(f'ATLAS px que cambian {int(diff.sum())} de {diff.size} ({100 * diff.mean():.2f} %) · ΔE76 medio {float(e[diff].mean()) if diff.any() else 0:.2f} y máximo {float(e.max()):.2f} sobre los que cambian')
    regs = {}
    for rn, (x0, y0, w, h) in sorted(C2.AT.R.items()):
        sl = (slice(int(y0), int(y0 + h)), slice(int(x0), int(x0 + w))); dd = diff[sl]
        if not dd.any(): continue
        da = (a1 - a0)[sl][dd]
        regs[rn] = dict(px=int(dd.sum()), frac=round(float(dd.mean()), 4), dE_medio=round(float(e[sl][dd].mean()), 2), dE_max=round(float(e[sl][dd].max()), 2),
                        ao_aclara_px=int((da > 0).sum()), ao_oscurece_px=int((da < 0).sum()), ao_delta_min=round(float(da.min()), 3), ao_delta_max=round(float(da.max()), 3))
        say(f'  región {rn:14s} px {regs[rn]["px"]:6d} ({100 * regs[rn]["frac"]:5.1f} %) · ΔE76 medio {regs[rn]["dE_medio"]:5.2f} máx {regs[rn]["dE_max"]:5.2f} · la AO aclara {regs[rn]["ao_aclara_px"]} px y oscurece {regs[rn]["ao_oscurece_px"]} (Δ {regs[rn]["ao_delta_min"]:+.3f} a {regs[rn]["ao_delta_max"]:+.3f})')
    inreg = np.zeros_like(diff)
    for x0, y0, w, h in C2.AT.R.values(): inreg[int(y0):int(y0 + h), int(x0):int(x0 + w)] = True
    say(f'ATLAS px que cambian fuera de las regiones de AT.R: {int((diff & ~inreg).sum())}')
    heat = np.clip(e / 10.0, 0, 1); hm = np.stack([255 * heat, 255 * heat * 0.35, 40 + 0 * heat], -1).astype(np.uint8); hm[~diff] = (24, 24, 24)
    tiles = [Image.fromarray(O.astype(np.uint8)), Image.fromarray(N.astype(np.uint8)), Image.fromarray(hm)]
    sheet = Image.new('RGB', (3 * 512 + 2 * 8, 512), (245, 241, 230))
    for i, t in enumerate(tiles): sheet.paste(t.resize((512, 512), Image.NEAREST), (i * 520, 0))
    sheet.save(os.path.join(out, 'ao-antes-despues.png'))
    json.dump(dict(formato_igual=fmt, px_cambian=int(diff.sum()), regiones=regs, fuera_de_regiones=int((diff & ~inreg).sum()),
                   sha256=dict(ao_viejo=sha(ao_old), ao_nuevo=sha(ao_new), base=sha(base), atlas_viejo=sha(old), atlas_nuevo=sha(new))),
              open(os.path.join(out, 'ao-cambios.json'), 'w'), indent=1)
    say('AO', 'CUMPLE' if ok else 'NO CUMPLE', '(mismo formato; los 2 atlas salen de la misma base con su AO)')
    return 0 if ok else 2


def c_sockets(a, b):
    A, B = (json.load(open(p)) for p in (a, b))
    def flat(x, pre=''):
        if isinstance(x, dict): return {k2: v2 for k, v in x.items() for k2, v2 in flat(v, f'{pre}/{k}').items()}
        if isinstance(x, list): return {k2: v2 for i, v in enumerate(x) for k2, v2 in flat(v, f'{pre}[{i}]').items()}
        return {pre: x}
    fa, fb = flat(A), flat(B); keys = sorted(set(fa) | set(fb)); d = [k for k in keys if fa.get(k) != fb.get(k)]
    say('SOCKETS', 'IGUALES' if not d else f'{len(d)} claves distintas', f'· {len(keys)} claves')
    for k in d[:40]: say(f'  {k}: {fa.get(k)} → {fb.get(k)}')
    return 0 if not d else 2


def c_kb(a, b):
    A, B = (next(iter(json.load(open(p)).values())) for p in (a, b))
    rows = [('textura KTX2', 'ktx2_B'), ('textura KTX2, gzip -9', 'ktx2_gzip9_B'), ('respaldo PNG (en el BIN)', 'respaldo_B'),
            ('GLB 4c (sin la KTX2)', 'glb_B'), ('GLB 4c, gzip -9', 'glb_gzip9_B')]
    for lab_, k in rows: say(f'KB {lab_:28s} {A[k] / 1000:9.1f} → {B[k] / 1000:9.1f} ({100 * (B[k] - A[k]) / A[k]:+.1f} %)')
    for lab_, k in (('GLB de la entrega (dentro)', 'B'), ('GLB de la entrega, gzip -9', 'gzip9_B')):
        x, y = A['dentro'][k], B['dentro'][k]; say(f'KB {lab_:28s} {x / 1000:9.1f} → {y / 1000:9.1f} ({100 * (y - x) / x:+.1f} %)')
    say('KB sha256 dentro', A['dentro']['sha256'][:8], '→', B['dentro']['sha256'][:8], '· ktx2', A['sha256_ktx2'][:8], '→', B['sha256_ktx2'][:8])
    return 0


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    sys.exit(dict(npz=c_npz, iguales=c_iguales, ao=c_ao, sockets=c_sockets, kb=c_kb)[cmd](*args))

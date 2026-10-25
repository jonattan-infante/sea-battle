# ux · ¿son el mismo modelo 2 GLB? Compara el JSON (clave a clave) y el BIN (los bytes de cada bufferView y el relleno), y
# dice si la imagen de la KTX2 es externa o va dentro. Solo lee.
import sys, json, struct, hashlib
sys.dont_write_bytecode = True
def glb(p):
    b = open(p, 'rb').read(); magic, ver, ln = struct.unpack('<4sII', b[:12]); assert magic == b'glTF' and ver == 2 and ln == len(b), (p, magic, ver, ln, len(b))
    off, ch = 12, {}
    while off < len(b):
        cl, ct = struct.unpack('<I4s', b[off:off + 8]); ch[ct] = b[off + 8:off + 8 + cl]; off += 8 + cl
    return json.loads(ch[b'JSON']), ch.get(b'BIN\x00', b''), len(b)
def flat(x, pre=''):
    if isinstance(x, dict): return {k2: v2 for k, v in x.items() for k2, v2 in flat(v, f'{pre}.{k}' if pre else k).items()}
    if isinstance(x, list): return {k2: v2 for i, v in enumerate(x) for k2, v2 in flat(v, f'{pre}[{i}]').items()}
    return {pre: x}
for a_p, b_p in zip(sys.argv[1::2], sys.argv[2::2]):
    (ja, ba, la), (jb, bb, lb) = glb(a_p), glb(b_p); fa, fb = flat(ja), flat(jb)
    d = [k for k in sorted(set(fa) | set(fb)) if fa.get(k) != fb.get(k)]
    print(f'== {a_p.split("/")[-1]} ({la} B) frente a {b_p.split("/")[-1]} ({lb} B)')
    print(f'   JSON: {len(fa)} y {len(fb)} claves · distintas {len(d)}' + ''.join(f'\n     {k}: {fa.get(k)} → {fb.get(k)}' for k in d))
    print(f'   BIN: {len(ba)} y {len(bb)} B · byteLength {ja["buffers"][0]["byteLength"]} y {jb["buffers"][0]["byteLength"]}')
    n = min(ja['buffers'][0]['byteLength'], jb['buffers'][0]['byteLength'])
    print(f'   BIN, los primeros {n} B (lo que cubre el byteLength menor): {"IGUALES" if ba[:n] == bb[:n] else "DISTINTOS"} · sha256 {hashlib.sha256(ba[:n]).hexdigest()[:12]} y {hashlib.sha256(bb[:n]).hexdigest()[:12]}')
    print(f'   BIN entero: {"IGUAL" if ba == bb else "distinto"} · cola de a {ba[n:].hex() or "—"} · cola de b {bb[n:].hex() or "—"}')
    bv_ok = all(ba[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] == bb[w.get("byteOffset", 0):w.get("byteOffset", 0) + w["byteLength"]] for v, w in zip(ja['bufferViews'], jb['bufferViews'])) and len(ja['bufferViews']) == len(jb['bufferViews'])
    print(f'   bufferViews: {len(ja["bufferViews"])} y {len(jb["bufferViews"])} · sus bytes {"IGUALES" if bv_ok else "DISTINTOS"} · imágenes {[i.get("uri") or ("bufferView " + str(i.get("bufferView"))) for i in ja.get("images", [])]} y {[i.get("uri") or ("bufferView " + str(i.get("bufferView"))) for i in jb.get("images", [])]}')

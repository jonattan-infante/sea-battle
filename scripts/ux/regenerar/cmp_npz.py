# ux · AC-192 (f): ¿sale igual LOD0 desde el commit de la lámina y desde el de la entrega? Compara los arrays de 2 npz (el md5
# del archivo no sirve: np.savez guarda la hora en el zip) y, si se dan, los píxeles de 2 atlas PNG.
# Uso: python3 -I cmp_npz.py <a.npz> <b.npz> [<a.png> <b.png>]   → «NPZ IGUAL|DISTINTO …» y «ATLAS IGUAL|DISTINTO …»; sale con 1
# si algo difiere
import sys, hashlib
import numpy as np
from PIL import Image

a, b = np.load(sys.argv[1]), np.load(sys.argv[2]); bad = 0
ka, kb = sorted(a.files), sorted(b.files)
if ka != kb:
    print('NPZ DISTINTO claves', ka, kb); bad = 1
else:
    diff = [k for k in ka if a[k].shape != b[k].shape or not np.array_equal(a[k], b[k])]
    h = hashlib.md5(b''.join(np.ascontiguousarray(a[k]).tobytes() for k in ka)).hexdigest()
    print('NPZ', 'IGUAL' if not diff else 'DISTINTO', 'tris', len(a['p']) // 3, len(b['p']) // 3, 'claves distintas', diff, 'md5 de los arrays', h[:8]); bad |= bool(diff)
if len(sys.argv) > 4:
    A = np.asarray(Image.open(sys.argv[3]).convert('RGB')); B = np.asarray(Image.open(sys.argv[4]).convert('RGB'))
    same = A.shape == B.shape and np.array_equal(A, B)
    print('ATLAS', 'IGUAL' if same else 'DISTINTO', A.shape, B.shape, '' if same or A.shape != B.shape else f'px distintos {int((A != B).any(-1).sum())}'); bad |= not same
sys.exit(1 if bad else 0)

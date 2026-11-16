# D107 (H-D106-1, ART-DIRECTION §9.2 y fila D107; lámina docs/game/art/D107-goleta-relinga.png): la relinga oscura en la
# baluma (el borde de popa) de la cangreja de trinquete de la Goleta, solo en LOD1 y en las 2 familias. En 390×844 la Goleta
# va en LOD1 y, con el rumbo de AD-37 c (45°), lo único que la separa del Bergantín es que enseña 2 cangrejas y no 1; las
# separa el palo mayor, que asoma entre ellas 1 px y solo con parte del balanceo (runtime.ts:1614-1616, ±3° con fase
# aleatoria): con el 40,5 % de las fases las 2 velas se funden en una sola mancha clara, que es lo que los evaluadores
# leyeron como «la vela cuadrada grande» del Bergantín (QA-78, adenda, H-D106-1). Esta franja va pegada a la vela de
# delante, así que la costura sale siempre, con cualquier fase: ≥ 16 filas de ≥ 2 px en las 200 fases medidas.
# No es lona (como la cruz de Borgoña de clase_curvo.emblem): AD-10 la deja fuera del L* de la vela, y AS-V21 no la ve.
# Usa el color de los palos de LOD1 (#6B4426) y el téxel blanco del atlas, como el aparejo. 4 triángulos (2 caras).
# Aprobada por Jonattan el 2026-11-16 a las 15:16:17Z (página de diseños, pieza `goleta-relinga`, firma = sha256 de la
# lámina, 7c8e530b…6196), para las 3 Goletas. La llama clase_curvo.build() tras rig(m, lod, cls), solo con la Goleta en LOD1;
# después, la bandera de geometría de D104 (lamina_como_juego.con_bandera_geo, «fiel») va al final, como en la entrega.
# La Goleta sin familia (el procedural del juego, ship-geometry.ts) lleva la misma franja; la hace dev con estos números.
import numpy as np

W = 0.4          # ancho de la franja en la vela (m): 2,2 px a 5,6 px/m (390×844, DPR 2); 0,3 m deja < 6 filas en el 10 % de las fases
OFF = 0.05       # separación de la superficie (m), por cada cara, como la cruz de Borgoña
COLOR = '#6B4426'  # el de los palos y perchas de LOD1 (L* 33 frente a ≈ 83 de la vela en el juego)
SAIL_LOD1 = '#E0D9C9'  # el color de las velas lisas de LOD1 (D40), con el que se encuentra la cangreja


def _hexlin(h):
    c = np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _srgb_hex(c):
    s = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)
    return '#%02X%02X%02X' % tuple(int(round(v * 255)) for v in np.clip(s, 0, 1))


def fore_gaff(P, C):
    """Los 5 vértices de la cangreja de trinquete de LOD1 (el abanico de 4 triángulos de fanSail): A y B en el grátil
    (x = 0, abajo y arriba), C el pico, D el puño de escota y M el centro de la panza. P, C: (T, 3, 3), por triángulo."""
    sail = np.array([_srgb_hex(c[0]) == SAIL_LOD1 for c in C])
    cen = P.mean(1)
    # el abanico de trinquete: los triángulos de vela con el centro entre el palo mayor (z = −3,3) y el trinquete (z = 4,0)
    # y por debajo de la gavia (y = 14,6); ASSET-SPEC §8.4, `ship_schooner`
    gaff = sail & (cen[:, 1] < 14.4) & (cen[:, 2] > -3.0) & (cen[:, 2] < 3.7)
    V = np.unique(np.round(P[gaff].reshape(-1, 3), 4), axis=0)
    assert len(V) == 5, f'la cangreja de trinquete de LOD1 debería tener 5 vértices y tiene {len(V)}'
    luff = V[np.abs(V[:, 0]) < 1e-3]  # el grátil, en el plano de crujía (x = 0): A abajo y B arriba
    assert len(luff) == 2, 'el grátil de la cangreja de trinquete debería tener 2 vértices en x = 0'
    A, B = luff[np.argsort(luff[:, 1])]
    rest = [v for v in V if not any(np.allclose(v, q) for q in (A, B))]
    rest.sort(key=lambda v: v[2])  # los 2 de popa (z menor) son C y D; el que queda, M
    aft = sorted(rest[:2], key=lambda v: -v[1]); Cc, D = aft; M = rest[2]
    return A, B, Cc, D, M


def band(A, B, Cc, D, M, w=W, off=OFF):
    """La franja: un cuadrilátero de ancho w dentro de la vela, pegado a la baluma C→D, en el plano del triángulo C-D-M
    (el de LOD1, exacto) y a ±off de él, una vez por cara: 4 triángulos, (12, 3) por vértice."""
    A, B, Cc, D, M = (np.asarray(v, float) for v in (A, B, Cc, D, M))
    n = np.cross(D - Cc, M - Cc); n /= np.linalg.norm(n)
    uC = (B - Cc) / np.linalg.norm(B - Cc); uD = (A - D) / np.linalg.norm(A - D)  # hacia el grátil, a la misma altura
    # el borde de dentro, a w de la baluma medido en perpendicular a ella dentro del plano
    e = (D - Cc) / np.linalg.norm(D - Cc); perp = np.cross(n, e); perp *= np.sign(perp @ (M - Cc))
    qC = Cc + uC * (w / max(uC @ perp, 1e-6)); qD = D + uD * (w / max(uD @ perp, 1e-6))
    tris = []
    for o in (off, -off):
        a, b, c, d = Cc + n * o, D + n * o, qD + n * o, qC + n * o
        tris += [a, b, c, a, c, d]
    return np.array(tris)


def add_to_arrays(p, t, c, r, b, white_uv):
    """Para un npz de la cadena (p, t, c, r, b: por vértice): añade la franja con el color de los palos y la UV del téxel
    blanco. Devuelve los 5 arrays nuevos."""
    P = p.reshape(-1, 3, 3); Cv = c.reshape(-1, 3, 3)
    q = band(*fore_gaff(P, Cv))
    n = len(q)
    return (np.concatenate([p, q]), np.concatenate([t, np.tile(np.asarray(white_uv, t.dtype), (n, 1))]),
            np.concatenate([c, np.tile(_hexlin(COLOR).astype(c.dtype), (n, 1))]), np.concatenate([r, np.zeros(n, r.dtype)]),
            np.concatenate([b, np.zeros(n, b.dtype)]))


def relinga(m, white_uv):
    """Para clase_curvo.build() (CV.Mesh: listas p, t, c, r, b), tras rig(m, 1, 'schooner')."""
    p, t, c, r, b = (np.array(x, float) for x in (m.p, m.t, m.c, m.r, m.b))
    q = band(*fore_gaff(p.reshape(-1, 3, 3), c.reshape(-1, 3, 3)))
    col = tuple(_hexlin(COLOR))
    m.p += [tuple(v) for v in q]; m.t += [white_uv] * len(q); m.c += [col] * len(q); m.r += [0.0] * len(q); m.b += [0] * len(q)

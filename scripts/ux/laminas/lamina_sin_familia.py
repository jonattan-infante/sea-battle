# Uso (desde la raíz del repo), con la misma UX_OUT, tras:
#   (cd <árbol de la lámina> && npx tsx export-sin-familia.ts "$UX_OUT/cadena/sin-familia.json")   (code/export-sin-familia.ts)
#   capitan_curvo.py y canonera2_curvo.py → blender_curvo.py {capitan,canonera2} bake 1024 64 → otra vez el script → `ktx
#   create` como en comprimir_cadena.sh (→ comp/atlas_capitan.ktx2 y comp/atlas_canonera2.ktx2): los 2 NPC con GLB en prod
#   python3 -I scripts/ux/laminas/lamina_sin_familia.py  →  $UX_OUT/D102-sin-familia.png y $UX_OUT/cadena/sin-familia-medidas.json
# Lámina D102 para Jonattan (GDD Q39; BACKLOG AC-227 e): la Goleta y el Navío de línea «sin familia», con su modelo
# procedural, el provisional de la 1.1 (las recetas de ASSET-SPEC §8.4 de r11, las de la lámina D64), en el formato de la
# lámina de barcos (D95): como en el juego en 1440×900, de lado, desde arriba, la popa de cerca y en el móvil en color y en
# grises. Enseña que cada clase se lee por su silueta frente a las otras 3 sin familia (la Balandra, el Bergantín y la
# Fragata de prod; AC-165, también en grises) y que no se confunde con un NPC (AC-72), también en grises. En el móvil va
# el LOD1, que es el que pinta el juego en 390×844 (ASSET-SPEC §7). Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os, json, math
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'mapa'), os.path.join(HERE, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import tienda as T
import render_tex as RTX
import lamina_capitan as LC  # fit() y shot(): las mismas vistas que las láminas D91 y D95
import lamina_clase as LCL   # receta(), diff(), mil(), dec(), num(): las mismas reglas que D95
import numpy as np
from PIL import Image, ImageDraw

CAD = os.path.join(RT.OUT, 'cadena'); comp = os.path.join(CAD, 'comp'); M = RTX.M; WHITE = np.ones((4, 4, 3))
PAPER, INK, SOFT, TITLE, RED = LCL.PAPER, LCL.INK, LCL.SOFT, LCL.TITLE, LCL.RED
NAME = {**LCL.NAME, 'pirate': 'Pirata', 'merchant': 'Mercante', 'gunboat': 'Cañonera pirata', 'captain': 'Capitán pirata'}
SHIP = {s['id']: s for s in T.SHIPS}
SUBJ = ('schooner', 'line')                      # lo que se aprueba
PROD = ('sloop', 'brig', 'frigate')              # sin familia, los de prod (pasaron AC-72 en la 1.0)
NPC = ('pirate', 'merchant', 'gunboat', 'captain')
def font(px, w=600): return T.font(px, w)
GEO = json.load(open(RT.need(os.path.join(CAD, 'sin-familia.json'), 'sin-familia.json (code/export-sin-familia.ts)')))


def proc(k, lod=0):
    """El procedural de la clase k: el generador del juego entero, con su color de vértice, normales de cara y la luz del
    juego (como hoy() de lamina_clase.py), en LOD0 o LOD1."""
    d = GEO[k][f'lod{lod}']; P = np.array(d['pos']).reshape(-1, 3); C = np.array(d['col']).reshape(-1, 3)
    Pc, UVc, Cc, _ = RTX.clip_below_water(P, np.full((len(P), 2), 0.5), C)
    return dict(P=Pc, UV=UVc, C=Cc, S=None, N=None, A=WHITE, shadow=False)


def npc(k, lod=0):
    """Los NPC como en prod: el Pirata y el Mercante con su procedural; la Cañonera y el Capitán con el GLB de la receta (D91)."""
    if k == 'captain': return LCL.receta(os.path.join(CAD, f'capitan_lod{lod}.npz'), os.path.join(comp, 'atlas_capitan.ktx2'))
    if k == 'gunboat': return LCL.receta(os.path.join(CAD, f'canonera2_lod{lod}.npz'), os.path.join(comp, 'atlas_canonera2.ktx2'))
    return proc(k, lod)


def traits(k):
    """Los rasgos de silueta de ART-DIRECTION §9.2 del procedural, desde su receta: S4 sale de sus castillos (`boxes` de tipo
    castle: a popa con z < 0, a proa con z > 0); con 2 a popa es la popa alta, con 1 y sin castillo de proa, la camareta."""
    r = GEO[k]['recipe']
    seq = ''.join('Q' if not mt.get('gaff') and not mt.get('lateen') else ('G' if mt.get('gaff') else 'T') for mt in sorted(r['masts'], key=lambda mt: -mt['z']))
    cast = [b for b in (r.get('boxes') or []) if b['kind'] == 'castle']; aft = sum(b['pos'][2] < 0 for b in cast); fore = any(b['pos'][2] > 0 for b in cast)
    s4 = 'ninguno' if not cast else ('camareta de popa' if aft == 1 and not fore else ' y '.join(x for x in ('popa alta' if aft >= 2 else 'alcázar', 'castillo de proa' if fore else '') if x))
    return dict(S1=r['L'], S2=len(r['masts']), S3='·'.join(seq), S4=s4, S5=r['profile'], S6=len(r.get('bands') or []) or (1 if r['cannonZ'] else 0), foques=len(r.get('jibs') or []))


def lstar_medio(m, th, hd, ppm):
    """El L* medio de los píxeles del barco (cobertura > 0,5) en un render, como la firma de AD-28 (D43)."""
    fr = LC.fit([m], th, hd, ppm); W, H, ox, oy = fr
    rgb, cov = RTX.render(m['P'], m['UV'], m['C'], m['A'], ppm, W, H, ox, oy, th, SS=4, N=m['N'], heading_deg=hd,
                          **(dict(S=m['S'], kh=LC.KH, ks=LC.KS) if m['S'] is not None else {}))
    L = M.lab(rgb * 255)[..., 0]; return round(float(L[cov > 0.5].mean()), 1)


def gray(img): return img.convert('L').convert('RGB')
def cg(im): return Image.fromarray(np.hstack([np.asarray(im), np.asarray(gray(im))]))


if __name__ == '__main__':
    L0 = {k: proc(k, 0) for k in SUBJ}; L1 = {k: proc(k, 1) for k in SUBJ}
    pop = {k: round(14 * math.sqrt(30 / GEO[k]['recipe']['L']), 1) for k in SUBJ}
    VIEWS = [  # (título, th, rumbo, px/m por clase, cielo, lod)
        ('Como en el juego, en 1440×900 (cámara a 55°, 6,2 px por metro)', 55, 135, {k: 6.2 for k in SUBJ}, False, 0),
        ('De lado (9 px por metro)', 0, 90, {k: 9.0 for k in SUBJ}, True, 0),
        ('Desde arriba (9 px por metro)', 90, 90, {k: 9.0 for k in SUBJ}, False, 0),
        (f"La popa de cerca, en 3/4 desde atrás ({LCL.dec(pop['schooner'], 0)} y {LCL.dec(pop['line'], 0)} px por metro)", 26, 160, pop, False, 0),
        ('En el móvil, en 390×844 (2,8 px por metro, el modelo de lejos), en color y en grises', 55, 135, {k: 2.8 for k in SUBJ}, False, 1),
    ]
    shots = []
    for title, th, hd, ppm, sky, lod in VIEWS:
        ims = []
        for k in SUBJ:
            m = (L1 if lod else L0)[k]; fr = LC.fit([m], th, hd, ppm[k]); im = LC.shot(m, th, hd, ppm[k], fr, sky=fr[3] if sky else None, SS=4 if ppm[k] < 4 else 3)
            ims.append(cg(im) if ppm[k] < 4 else im)
        shots.append((title, ims))
    # --- AC-165: las 5 clases sin familia a la misma escala, de lado a 6 px/m, en color y en grises
    ORDER = ('sloop', 'schooner', 'brig', 'frigate', 'line'); sims = []
    for k in ORDER:
        m = proc(k, 0); fr = LC.fit([m], 0, 90, 6.0, pad=8); sims.append((k, LC.shot(m, 0, 90, 6.0, fr, sky=fr[3], SS=3)))
    # --- AC-72: junto a los NPC, como en el juego (1440×900, LOD0) y en el móvil (LOD1), en color y en grises
    CAST = list(SUBJ) + list(NPC)
    def fila(ppm, lod):
        mods = [proc(k, lod) if k in SUBJ else npc(k, lod) for k in CAST]; fr = LC.fit(mods, 55, 135, ppm, pad=10)
        return [(k, cg(LC.shot(m, 55, 135, ppm, fr, SS=4 if ppm < 4 else 3))) for k, m in zip(CAST, mods)]
    juego, movil = fila(6.2, 0), fila(2.8, 1)
    # --- medidas
    MED = dict(tris={k: GEO[k]['tris'] for k in GEO}, rasgos={k: traits(k) for k in ORDER})
    MED['pares'] = {f'{a}-{b}': LCL.diff(MED['rasgos'][a], MED['rasgos'][b]) for a in SUBJ for b in ORDER if a != b}
    MED['lstar_movil'] = {k: lstar_medio(proc(k, 1) if k in SUBJ + PROD else npc(k, 1), 55, 135, 2.8) for k in ORDER + NPC}
    json.dump(MED, open(os.path.join(CAD, 'sin-familia-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    print('medidas', json.dumps(MED, ensure_ascii=False))

    # --- lámina
    GAP = 30; colw = max(max(im.width for im in ims) for _, ims in shots)
    def pie(k):
        s_ = SHIP[k]; req = 'gratis' if not s_['price'] else ((f"Nivel {s_['lvl']} · " if s_.get('lvl') else '') + f"{LCL.mil(s_['price'])} oro")
        return f"{LCL.num(s_['L'])} m · {req}"
    def rot(k): return f"{NAME[k]} sin familia" + (' (la de prod)' if k in PROD else '')
    slot = [math.ceil(max(im.width, font(15).getlength(rot(k)), font(14, 500).getlength(pie(k)))) for k, im in sims]
    # el ancho, el de las vistas y la tira; las filas de los NPC saltan de línea si no caben
    SW = max(40 + 2 * colw + GAP + 40, sum(slot) + GAP * (len(sims) - 1) + 80, 1600)
    sheet = Image.new('RGB', (SW, 12000), PAPER); d = ImageDraw.Draw(sheet)
    def para(x, y, txt, f, fill, width, lh):
        line = ''
        for w in txt.split(' '):
            t = (line + ' ' + w).strip()
            if d.textlength(t, font=f) > width and line: d.text((x, y), line, font=f, fill=fill); y += lh; line = w
            else: line = t
        if line: d.text((x, y), line, font=f, fill=fill); y += lh
        return y
    d.text((40, 22), 'La Goleta y el Navío sin familia: su modelo de hoy', font=font(32), fill=INK)
    y = para(40, 66, 'Así se ven la Goleta y el Navío de línea cuando su dueño no ha comprado ninguna familia: con el modelo que ya dibuja el juego, sin textura, el mismo de la lámina de barcos de la 1.1 (D64). Es el aspecto con el que empieza todo jugador; el detalle de la receta, con las curvas y los colores de cada familia, es lo que se compra. La Balandra, el Bergantín y la Fragata sin familia son los de prod. Lo que se aprueba: cómo se ven estos 2, para construirlos.', font(17, 500), INK, SW - 80, 26) + 14
    for title, ims in shots:
        d.text((40, y), title, font=font(19), fill=TITLE); y += 30
        for j, k in enumerate(SUBJ): d.text((40 + j * (colw + GAP), y), f'{NAME[k]} sin familia', font=font(15), fill=SOFT)
        y += 24
        for j, im in enumerate(ims): sheet.paste(im, (40 + j * (colw + GAP), y))
        y += max(im.height for im in ims) + 26
    d.text((40, y), 'Las 5 clases sin familia, a la misma escala (de lado, 6 px por metro), en color y en grises', font=font(19), fill=TITLE); y += 32
    hmax = max(im.height for _, im in sims)
    for gris in (False, True):
        x = 40
        for (k, im), w in zip(sims, slot):
            sheet.paste(gray(im) if gris else im, (x, y + hmax - im.height))
            if gris: d.text((x, y + hmax + 8), rot(k), font=font(15), fill=INK if k in SUBJ else SOFT); d.text((x, y + hmax + 30), pie(k), font=font(14, 500), fill=SOFT)
            x += w + GAP
        y += hmax + (70 if gris else 14)
    for title, row in (('Junto a los NPC, como en el juego en 1440×900 (6,2 px por metro): en color y en grises', juego),
                       ('Junto a los NPC, en el móvil en 390×844 (2,8 px por metro, el modelo de lejos): en color y en grises', movil)):
        d.text((40, y), title, font=font(19), fill=TITLE); y += 32
        x = 40; hmax = max(im.height for _, im in row)
        for k, im in row:
            if x + im.width > SW - 40: x = 40; y += hmax + 40
            sheet.paste(im, (x, y)); d.text((x, y + hmax + 6), NAME[k] + (' sin familia' if k in SUBJ else ''), font=font(14, 500), fill=INK if k in SUBJ else SOFT); x += im.width + GAP
        y += hmax + 46
    tr, ls = MED['rasgos'], MED['lstar_movil']
    def frente(a, b): return f"{NAME[a]} frente {'al' if b in LCL.MASC else 'a la'} {LCL.NOMBRE[b]}: {', '.join(MED['pares'][f'{a}-{b}']) or 'NADA'} (se piden 2)."
    ok165 = all(len(v) >= 2 for v in MED['pares'].values())
    t = MED['tris']
    BLOCKS = [
        ('Qué son', INK, [
            f"El modelo que dibuja el juego, sin textura: el casco, las velas, los palos y los cañones salen del generador del juego con color en cada vértice. Triángulos de cerca y de lejos: Goleta {LCL.mil(t['schooner'][0])} y {LCL.mil(t['schooner'][1])}, Navío {LCL.mil(t['line'][0])} y {LCL.mil(t['line'][1])} (la Fragata de prod, {LCL.mil(t['frigate'][0])} y {LCL.mil(t['frigate'][1])}).",
            'No se descarga nada: no hay modelo ni textura que bajar, y quien entra sin familia no espera a ningún modelo.',
            'La Goleta: 22 × 5,6 m, 2 palos con cangreja (el trinquete con gavia), sin castillos, 2 foques y una franja de portas con 4 cañones por banda. El Navío: 42 × 11,2 m, 3 palos (cuadras en el trinquete y la mayor, latina en la mesana), popa alta de 2 pisos con faroles y castillo de proa, 3 foques y 2 franjas de portas con 5 portas cada una, al tresbolillo.']),
        ('Lo que la distingue de las otras 3 sin familia (AC-165), también en grises', INK if ok165 else RED,
         [frente(a, b) for a in SUBJ for b in ('sloop', 'brig', 'frigate', 'line', 'schooner') if a != b and not (a == 'line' and b == 'schooner')]),
        ('Lo que la separa de los NPC (AC-72), también en grises', INK, [
            'Las velas: las del jugador son claras (la lona en L* 96, 86 y 76), las del Pirata, la Cañonera y el Capitán son negras (L* 31, 20 y 8), y las del Mercante son crema con 2 franjas azules. Es el canal de facción de ART-DIRECTION §9.2, y la familia no lo toca.',
            "L* medio del barco en el móvil (390×844, el modelo de lejos): " + ', '.join(f"{NAME[k]} {LCL.dec(ls[k], 1)}" for k in ('schooner', 'line', 'sloop', 'brig', 'frigate')) + '; ' + ', '.join(f"{NAME[k]} {LCL.dec(ls[k], 1)}" for k in NPC) + f". Frente a los 3 piratas, los del jugador quedan muy por encima, también en grises. El Mercante queda cerca ({LCL.dec(ls['merchant'], 1)} frente a {LCL.dec(min(ls[k] for k in ORDER), 1)}–{LCL.dec(max(ls[k] for k in ORDER), 1)}), igual que con la Balandra, el Bergantín y la Fragata de prod, que pasaron AC-72 (GDD Q39): lo separan las 2 franjas de sus velas, que en grises siguen siendo 2 bandas oscuras, y el gallardete y la placa del jugador. Lo confirma QA con los evaluadores de AC-72 (AC-227 e).",
            'El gallardete dorado del jugador en la mayor y la placa con el nombre siguen siendo la señal de propio y de otro jugador (AC-72), como en las clases de prod.']),
        ('Decisiones', INK, [
            'Va tal cual, sin retocar: son las recetas de ASSET-SPEC §8.4 (r11) que ya dibujó D64, con sus números. Cada par de clases se separa por 2 rasgos o más (arriba), así que AC-165 no pide ningún cambio, y retocarlo sería diseñar un tercer aspecto, que producto descartó en GDD Q39 (a).',
            'En el móvil se enseña el modelo de lejos (LOD1), que es el que pinta el juego en 390×844; las vistas de cerca, el de cerca (LOD0).',
            'Para que el juego lo pinte, la Goleta y el Navío entran en las recetas del generador (`SHIP_RECIPES`) con estos números, y el generador aprende la 2.ª franja de portas del Navío (S6), que hoy solo está en el parche de la lámina (`scripts/ux/laminas/code/ship-geometry-lamina.patch`, `bands`).']),
        ('En contra', RED, [
            'Es el aspecto que en la lámina D64 te pareció muy simple. Aquí es la base gratuita: el detalle que pediste es el de las familias, que se compran.',
            'Sin textura, la madera y las velas son de color liso; de lejos, lo que más se ve sigue siendo el aparejo, como en la Balandra, el Bergantín y la Fragata de prod.']),
    ]
    for title, colr, lines in BLOCKS:
        d.text((40, y), title, font=font(19), fill=TITLE if colr == INK else RED); y += 30
        for ln in lines:
            d.text((56, y), '·', font=font(16, 500), fill=colr); y = para(74, y, ln, font(16, 500), colr, SW - 120, 24) + 2
        y += 12
    sheet = sheet.crop((0, 0, SW, y + 20))
    out = os.path.join(RT.OUT, 'D102-sin-familia.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

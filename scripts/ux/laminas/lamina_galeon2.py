# Uso (desde la raíz del repo), con la misma UX_OUT, tras: galeon_curvo.py → blender_curvo.py galeon bake 1024 64 →
# galeon_curvo.py otra vez (el atlas con la oclusión) → blender_curvo.py galeon export → gltf-transform meshopt
# (→ $UX_OUT/cadena/comp/galeon_meshopt.glb) y `ktx create` desde atlas_galeon_out.png como en comprimir_cadena.sh
# (→ comp/atlas_galeon.ktx2); y en $UX_OUT/cadena, galleon-rig.json (code/export-rig-galeon2.ts):
#   python3 -I scripts/ux/laminas/lamina_galeon2.py <origen_navios> <origen_d88>  →  $UX_OUT/D88-galeon-v2.png y
#   $UX_OUT/cadena/galeon-medidas.json
#   <origen_navios>: la UX_OUT de la entrega de los Navíos (E3), para el Navío español aprobado
#   <origen_d88>: la carpeta galeon/ de la lámina D88 (galeon_lod0.npz y atlas_galeon.png de barcos/galeon.py)
# Lámina D88 v2 del Galeón del tesoro (GDD §9, P2; ART-DIRECTION §10.1, «Sin escolta y armado») para Jonattan: con la receta
# de D91 y armado con 8 cañones por banda. Enseña el Galeón disparando (los fogonazos ×1,2 de VFX-SPEC §1 y su humo), y junto
# al Mercante y al Pirata de hoy, al Galeón de D88 y al Navío español aprobado, a 6 px/m: de lado, desde arriba, como en el
# juego y en grises; de cerca; y su placa, su aviso y su ▣. Mide los triángulos, la caja del casco, la descarga y el área
# frente al Mercante (AD-41 b). Render por software (scripts/ux/mapa/render_tex.py). Escribe en UX_OUT, nunca en
# docs/game/art/. No corre en la CI.
import sys, os, json, math
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, '..', 'mapa'), os.path.join(HERE, '..', 'barcos')): sys.path.insert(0, p)
import rutas as RT
import tienda as T
import render_tex as RTX
import lamina_minimapa as LM
import lamina_capitan as LC  # fit(), shot(), glb_geo() y Ry(): las vistas y la luz de las láminas de la receta
import lamina_clase as LCL   # receta(), respaldo_rule() y gray()
import galeon_curvo as GC    # registra el Galeón en clase_curvo
import numpy as np
from PIL import Image, ImageDraw

CAD = os.path.join(RT.OUT, 'cadena'); COMP = os.path.join(CAD, 'comp'); WHITE = np.ones((4, 4, 3)); M = RTX.M
SEA = LC.SEA; PAPER, INK, SOFT, TITLE, RED = LC.PAPER, LC.INK, LC.SOFT, LC.TITLE, LC.RED
TOPE = dict(lod0=2800, lod1=900, fam0=5000, fam1=1200, escena=182300, sombras=32000, gdd=250000)
# ASSET-SPEC §5 (la fila del Galeón) y §13 (el tope de los barcos con la receta; la escena del peor caso, sin escolta, con
# los 20 jugadores en Navío al tope de D91, 5 500, y el Galeón a 2 800). Sombras en el agua: el máximo de la HIPÓTESIS de
# BACKLOG :460 (20 000–32 000), sin medir. El tope de la escena es el de GDD §16
def font(px, w=600): return T.font(px, w)
def mil(n): return f'{n:,}'.replace(',', '.')
def dec(x, k): return f'{x:.{k}f}'.replace('.', ',')
RIG = json.load(open(RT.need(os.path.join(CAD, 'galleon-rig.json'), 'galleon-rig.json (code/export-rig-galeon2.ts)')))


def hoy(key):
    P = np.array(RIG[key]['pos']).reshape(-1, 3); C = np.array(RIG[key]['col']).reshape(-1, 3)
    Pc, UVc, Cc, _ = RTX.clip_below_water(P, np.full((len(P), 2), 0.5), C)
    return dict(P=Pc, UV=UVc, C=Cc, S=None, N=None, A=WHITE, shadow=False)


def d88(folder):
    z = np.load(RT.need(os.path.join(folder, 'galeon_lod0.npz'), 'galeon_lod0.npz de D88 (barcos/galeon.py)'))
    A_ = RTX.srgb2lin(np.asarray(Image.open(RT.need(os.path.join(folder, 'atlas_galeon.png'), 'atlas_galeon.png de D88')).convert('RGB'), float))
    Pc, UVc, Cc, _ = RTX.clip_below_water(z['p'], z['t'], z['c'])
    return dict(P=Pc, UV=UVc, C=Cc, S=None, N=None, A=A_, shadow=False)


def proj(p, th, hd, ppm, fr):
    """Un punto del barco en px de la vista (la proyección de LC.fit) y su profundidad (mayor = más cerca de la cámara)."""
    W, H, ox, oy = fr; q = LC.Ry(hd) @ np.asarray(p, float); TH = math.radians(th)
    return q[0] * ppm + ox, -(q[1] * math.cos(TH) - q[2] * math.sin(TH)) * ppm + oy, q[1] * math.sin(TH) + q[2] * math.cos(TH)


def volley(img, th, hd, ppm, fr, scale=1.2):
    """La andanada de la banda que mira a la cámara: los 8 fogonazos superpuestos (VFX-SPEC §1: núcleo #FFF6C8 de 1,2 m y
    penacho #FF8A2B de 0,9 m a 0,9 m de la boca, × 1,2) y el humo a 0,3 s (§2: 3 discos #E9E4DA por cañón)."""
    socks = {k: [p for p in RIG['sockets'][k] if p] for k in ('port', 'stbd')}
    side = max(socks, key=lambda k: np.mean([proj(p, th, hd, ppm, fr)[2] for p in socks[k]]))
    sgn = 1.0 if np.mean([p[0] for p in socks[side]]) > 0 else -1.0
    a = RTX.srgb2lin(np.asarray(img, float)); Hh, Ww = a.shape[:2]; yy, xx = np.mgrid[0:Hh, 0:Ww]
    def disc(p, diam, col, alpha, add):
        x, y, _ = proj(p, th, hd, ppm, fr); r = max(diam * ppm / 2, 1.0)
        f = np.clip(1 - np.hypot(xx - x, yy - y) / r, 0, 1) ** 1.5 * alpha; c = RTX.srgb2lin(np.array([int(col[i:i + 2], 16) for i in (1, 3, 5)], float))
        return (a + f[..., None] * c) if add else (a * (1 - f[..., None]) + f[..., None] * c)
    for p in socks[side]:  # humo a 0,3 s: 1,05 m hacia fuera (3,5 m/s con arrastre), 0,25 m arriba; 1,6 m × escala
        for k, ang in enumerate((-20, 0, 20)):
            ra = math.radians(ang); q = (p[0] + sgn * 1.05 * scale * math.cos(ra), p[1] + 0.25 + 0.1 * k, p[2] + 1.05 * scale * math.sin(ra))
            a = disc(q, 1.6 * scale, '#E9E4DA', 0.55, False)
    for p in socks[side]:
        a = disc(p, 1.2 * scale, '#FFF6C8', 1.0, True)
        a = disc((p[0] + sgn * 0.9 * scale, p[1], p[2]), 0.9 * scale, '#FF8A2B', 0.9, True)
    return Image.fromarray(np.clip(np.round(M.lin2srgb(np.clip(a, 0, 1)) * 255), 0, 255).astype(np.uint8)), len(socks[side])


def area(mod, hd, ppm=2.82):
    """Px CSS de la máscara del barco en 390×844 a 1,0× (2,82 px/m) con la cámara del juego (AD-41 b)."""
    _, cov = RTX.render(mod['P'], mod['UV'], mod['C'], mod['A'], ppm, 200, 200, 100, 100, 55, SS=3, heading_deg=hd); return float(cov.sum())


# --- placa y aviso (las de lamina_galeon.py, D88: world-overlays.css y .toast de globals.css)
def plate(name, S=3):
    tw_ = T.tw(name, 12, 'label600'); w = max(12 + 3 + tw_, 64) + 12 + 2; h = 2 + 16 + 1 + 12 + 2 + 2
    im = Image.new('RGBA', (round((w + 16) * S), round((h + 16) * S)), tuple(int(c * 255) for c in SEA) + (255,)); p = T.Pen(im, S)
    bg = tuple(round(a * 0.85 + b * 0.15) for a, b in zip((6, 17, 26), (int(SEA[0] * 255), int(SEA[1] * 255), int(SEA[2] * 255))))
    p.rect(8, 8, 8 + w, 8 + h, fill=bg, radius=4)
    p.paste(T.raster('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6CC3F5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                     '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>', 12 * S, 'moneda-6cc3f5'), 8 + 7, 8 + 3 + 2)
    p.text(8 + 7 + 15, 8 + 3, name, 12, 'label600', '#6CC3F5', lh=16 / 12)
    p.rect(8 + 7, 8 + 3 + 16 + 1, 8 + 7 + 66, 8 + 3 + 16 + 1 + 7, fill='#000000'); p.rect(8 + 8, 8 + 3 + 16 + 2, 8 + 8 + 64, 8 + 3 + 16 + 2 + 5, fill='#6CC3F5')
    return im.convert('RGB'), w


def toast(text, width, S=2):
    cw = width - 4 - 24; lines = []; cur = ''
    for wd in text.split(' '):
        s_ = (cur + ' ' + wd).strip()
        if cur and T.tw(s_, 14, 500) > cw: lines.append(cur); cur = wd
        else: cur = s_
    lines.append(cur); h = max(36, 12 + 21 * len(lines))
    im = Image.new('RGBA', (round((width + 24) * S), round((h + 24) * S)), tuple(int(c * 255) for c in SEA) + (255,)); p = T.Pen(im, S)
    bgc = tuple(round(a * 0.85 + b * 0.15) for a, b in zip((11, 26, 36), (int(SEA[0] * 255), int(SEA[1] * 255), int(SEA[2] * 255))))
    p.rect(12, 12, 12 + width, 12 + h, fill=bgc, radius=6); p.rect(12, 12, 16, 12 + h, fill='#F2C14E')
    y = 12 + (h - 21 * len(lines)) / 2
    for i, ln in enumerate(lines): p.text(12 + 4 + 12, y + 21 * i, ln, 14, 500, '#F5F1E6')
    return im.convert('RGB'), lines, max(T.tw(l, 14, 500) for l in lines)


if __name__ == '__main__':
    nav, old = sys.argv[1], sys.argv[2]
    NEW = LCL.receta(os.path.join(CAD, 'galeon_lod0.npz'), os.path.join(COMP, 'atlas_galeon.ktx2'))
    ES = LCL.receta(os.path.join(nav, 'cadena', 'navio_es_lod0.npz'), os.path.join(nav, 'cadena', 'comp', 'atlas_es.ktx2'))
    COLS = [('Mercante (hoy)', '22 m · pasivo · sin cañones', hoy('merchant')), ('Galeón de D88 (el que viste)', '36 m · sin cañones · con escolta', d88(old)),
            ('Galeón NUEVO', '36 m · pasivo · 8 cañones por banda', NEW), ('Navío español (aprobado)', '42 m · del jugador · 2 filas de 10', ES),
            ('Pirata (hoy)', '20 m · hostil · 4 cañones por banda', hoy('pirate'))]
    mods = [m for _, _, m in COLS]
    # --- medidas
    tri = [len(np.load(os.path.join(CAD, f'galeon_lod{l}.npz'))['p']) // 3 for l in (0, 1)]
    z = np.load(os.path.join(CAD, 'galeon_lod0.npz')); P = z['p'].reshape(-1, 3, 3); R = z['r'].reshape(-1, 3); hull = P[(R > 0.5).all(1)].reshape(-1, 3)
    geo = LC.glb_geo(RT.need(os.path.join(COMP, 'galeon_meshopt.glb'), 'galeon_meshopt.glb')); kt = os.path.join(COMP, 'atlas_galeon.ktx2')
    rule, resp, base = LCL.respaldo_rule(os.path.join(CAD, 'galeon_lod0.npz'), os.path.join(CAD, 'atlas_galeon.png'), os.path.join(CAD, 'atlas_galeon_out.png'), kt, GC.AT.R)
    ktx = open(kt, 'rb').read(); png = rule[resp]['data']
    ar = {hd: round(area(NEW, hd) / area(COLS[0][2], hd), 2) for hd in (45, 135, 225, 315)}
    MED = dict(lod0=tri[0], lod1=tri[1], caja_casco=dict(eslora=round(float(np.ptp(hull[:, 2])), 3), manga=round(float(np.ptp(hull[:, 0])), 3)),
               resp=resp, resp_B=len(png), geo_B=len(geo), ktx_B=len(ktx), total_B=len(geo) + len(png) + len(ktx), dE_atlas=base,
               area_vs_mercante=ar, extras={k: RIG['extras'].get(k) for k in ('sb_id', 'sb_length', 'sb_beam', 'sb_cannons_per_side')},
               respaldo={k: {x: y for x, y in v.items() if x != 'data'} for k, v in rule.items()})
    json.dump(MED, open(os.path.join(CAD, 'galeon-medidas.json'), 'w'), indent=1, ensure_ascii=False)
    print('medidas', json.dumps({k: v for k, v in MED.items() if k != 'respaldo'}, ensure_ascii=False))

    SW = 2000; sheet = Image.new('RGB', (SW, 9000), PAPER); d = ImageDraw.Draw(sheet)
    def label(x, y, t, c=SOFT, f=None): d.text((x, y), t, font=f or font(15, 500), fill=c)
    def para(x, y, w, t, f=None, c=INK, lh=24):
        f = f or font(16, 500); line = ''
        for wd in t.split(' '):
            s_ = (line + ' ' + wd).strip()
            if d.textlength(s_, font=f) > w and line: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
            else: line = s_
        if line: d.text((x, y), line, font=f, fill=c); y += lh
        return y
    d.text((40, 22), 'Galeón del tesoro, 2.ª vuelta: con la receta de los Navíos y armado', font=font(32), fill=INK)
    y = para(40, 66, SW - 80, 'Lo que pediste: que no lleve escolta y que, si lo atacan, responda con fuerza. Ahora lleva 8 cañones por banda, a la vista en su franja de oro, y está hecho con la misma receta que aprobaste con los Navíos: casco con curvas, sombras horneadas, más sol en la madera y sombra en el agua. Sigue siendo un barco pasivo: no ataca a nadie, y lo dicen sus velas a franjas azules, la bandera del Mercante, su placa y su marcador. Lo que se aprueba: cómo se ve, para construirlo.', font(17, 500), INK, 26) + 10
    # --- disparando
    d.text((40, y), 'Cuando lo atacan: su andanada, como en el juego en 1440×900 (cámara a 55°, 9 px por metro)', font=font(19), fill=TITLE); y += 32
    fr = LC.fit([NEW], 55, 135, 9.0, pad=40); calm = LC.shot(NEW, 55, 135, 9.0, fr, SS=3); fire, nf = volley(calm, 55, 135, 9.0, fr)
    sheet.paste(calm, (40, y)); sheet.paste(fire, (40 + calm.width + 30, y))
    label(40, y + calm.height + 6, 'En calma'); label(40 + calm.width + 30, y + calm.height + 6, f'Disparando: los {nf} fogonazos de la banda superpuestos (del tamaño de los de la Fragata) y su humo')
    y += calm.height + 44
    # --- comparación a 6 px/m
    VIEWS = [('De lado (6 px por metro)', 0, 90, 6.0, True), ('Desde arriba', 90, 90, 6.0, False),
             ('Como en el juego (cámara a 55°)', 55, 135, 6.0, False), ('En grises, como en el juego', 55, 135, 6.0, False)]
    gap = 18
    for k, (title, th, hd, ppm, sky) in enumerate(VIEWS):
        fr = LC.fit(mods, th, hd, ppm, pad=10); ims = [LC.shot(m, th, hd, ppm, fr, sky=fr[3] if sky else None, SS=3) for m in mods]
        if k == 3: ims = [LCL.gray(im) for im in ims]
        d.text((40, y), title, font=font(19), fill=TITLE); y += 30
        for j, im in enumerate(ims): sheet.paste(im, (40 + j * (im.width + gap), y))
        y += ims[0].height + 12
        if k == len(VIEWS) - 1:
            for j, (name, sub, _) in enumerate(COLS):
                d.text((40 + j * (ims[0].width + gap), y), name, font=font(17), fill=INK); label(40 + j * (ims[0].width + gap), y + 24, sub)
            y += 56
        y += 10
    # --- de cerca
    d.text((40, y), 'De cerca: la batería, la popa dorada y la carga', font=font(19), fill=TITLE); y += 30
    f1 = LC.fit([NEW], 30, 118, 12.0, pad=16); c1 = LC.shot(NEW, 30, 118, 12.0, f1, SS=3)
    f2 = LC.fit([NEW], 26, 200, 14.0, pad=16); c2 = LC.shot(NEW, 26, 200, 14.0, f2, SS=3)
    sheet.paste(c1, (40, y)); sheet.paste(c2, (40 + c1.width + 24, y))
    label(40, y + max(c1.height, c2.height) + 6, 'De tres cuartos: las 8 portas abiertas en la franja de oro, los cofres y el cofre abierto')
    label(40 + c1.width + 24, y + max(c1.height, c2.height) + 30, 'La popa: 2 pisos de ventanas, galerías, 3 faroles y la cartela azul del Mercante')
    y += max(c1.height, c2.height) + 64
    # --- placa, aviso y marcador
    d.text((40, y), 'En el juego: su placa, su aviso al aparecer y su marcador del minimapa (sin cambios)', font=font(19), fill=TITLE); y += 32
    pl, pw = plate('Galeón del tesoro'); sheet.paste(pl, (40, y)); label(40, y + pl.height + 6, f'Placa, al triple: {dec(pw, 0)} px de ancho (el tope es 142)')
    tx0 = 40 + pl.width + 40; msg = '¡Galeón del tesoro en el noroeste, sector B10!'
    t1, l1, w1 = toast(msg, 360); sheet.paste(t1, (tx0, y)); label(tx0, y + t1.height + 6, f'Aviso en escritorio y móvil, al doble: 1 línea ({dec(w1, 0)} de 332 px)')
    sc = dict(LM.SCENE, view=((80, -150), (320, 30))); mm = LM.minimap(182, 1, '1.1', sc); gx, gz = LM.SCENE['galleon'][0]
    cx_, cy_ = (gx + 500) * 0.182, (gz + 500) * 0.182; crop = mm.crop((int(cx_ - 30), int(cy_ - 30), int(cx_ + 30), int(cy_ + 30))).resize((240, 240), Image.NEAREST)
    mx = tx0 + t1.width + 40; sheet.paste(crop, (mx, y)); label(mx, y + 246, 'Su marcador, al cuádruple')
    y += max(pl.height + 40, t1.height + 40, 280)
    # --- bloques
    esc = TOPE['escena'] - TOPE['lod0'] + tri[0]; esc_r = int(round(esc, -2)); ess = esc + TOPE['sombras']
    BLOCKS = [
        ('Qué cambia frente a D88', INK, [
            'Responde al fuego: 8 cañones por banda, con las portas abiertas en la franja de oro (rojas por dentro, como en los Navíos) y los cañones asomando. Su fogonazo es el de la Fragata y el Capitán: 1,5 veces el de la Balandra.',
            'Sin escolta pirata: va solo.',
            'La receta de los Navíos: casco con curvas, sombras horneadas, más sol en la madera, sombra en el agua, la popa de 2 pisos con los costados de oro, galerías de 2 pisos y la regala dorada.']),
        ('Lo que no cambia', INK, [
            '36 × 12 m, 4 palos sin caída, las velas crema a franjas azules y la bandera del Mercante, la popa alta dorada con 3 faroles, la carga a la vista (4 cofres y uno abierto con oro), su placa con la moneda, su aviso y su marcador.']),
        ('Cómo se lee', INK, [
            'Pasivo: las velas claras a franjas y la bandera del Mercante, como el Mercante; las del pirata son negras. Que responde lo dicen sus andanadas y la marca de peligro del panel, no un color hostil.',
            'Frente al Navío español: 1 fila de 8 portas en oro frente a sus 2 filas de 10 en rojo, el casco de madera sin rojo, las velas a franjas en lugar de la cruz de Borgoña, 4 palos en vez de 3 y la carga en cubierta.',
            'Frente al Mercante, en el móvil (390×844) con la cámara del juego: ' + ', '.join(f'{dec(v, 2)}×' for v in ar.values()) + ' su tamaño en los rumbos 45, 135, 225 y 315° (se pide al menos 1,6×).']),
        ('Lo que cuesta', INK, [
            f"Triángulos de cerca y de lejos: {mil(tri[0])} y {mil(tri[1])} (el presupuesto del Galeón era 2.800 y 900; el de los barcos con la receta, 5.000 y 1.200).",
            f"Con él, el peor caso de la escena (los 20 jugadores en Navío) sube {mil(tri[0] - TOPE['lod0'])} triángulos: unos {mil(esc_r)} de {mil(TOPE['gdd'])} ({round(100 * esc / TOPE['gdd'])} %), y hasta unos {mil(int(round(ess, -2)))} ({round(100 * ess / TOPE['gdd'])} %) con las sombras en el agua, una estimación aún sin medir.",
            f"Lo que se descarga: {dec(MED['total_B'] / 1000, 1)} KB, con la textura de 1024 × 1024 (el tope del Galeón es 400 KB). El casco mide {dec(MED['caja_casco']['eslora'], 2)} m de largo (se pide 36 m ± 2 %)."]),
        ('En contra', RED, [
            'Armado y con la popa dorada, se acerca al Navío español más que el de D88: lo separan la fila de portas en oro, la madera sin rojo, las velas a franjas y la carga.',
            *([f"Tiene más detalle del que le reservaba su fila ({mil(tri[0])} triángulos frente a {mil(TOPE['lod0'])}). Cabe en el tope de los barcos con la receta de los Navíos ({mil(TOPE['fam0'])}), y el peor caso de la escena sigue dentro de su tope: unos {mil(esc_r)} de {mil(TOPE['gdd'])}."] if tri[0] > TOPE['lod0'] else [])]),
    ]
    for title, colr, lines in BLOCKS:
        d.text((40, y), title, font=font(19), fill=TITLE if colr == INK else RED); y += 30
        for ln in lines:
            d.text((56, y), '·', font=font(16, 500), fill=colr); y = para(74, y, SW - 120, ln, font(16, 500), colr, 24) + 2
        y += 12
    sheet = sheet.crop((0, 0, SW, y + 20))
    out = os.path.join(RT.OUT, 'D88-galeon-v2.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size, 'aviso', round(w1, 1), 'placa', round(pw, 1))

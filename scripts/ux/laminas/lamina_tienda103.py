# Uso (desde la raíz del repo), con la UX_OUT de `retrato13.py all` (sus retratos13/ y retratos13-<clase>.json):
#   python3 -I scripts/ux/laminas/lamina_tienda103.py  →  $UX_OUT/D103-tienda-por-barco.png
# Lámina de la tienda por barco (D103; sustituye a D99 y D100; GDD §11 y Q34 del 2026-11-16; BACKLOG AC-213, AC-214, AC-216
# y AC-217) para el visto bueno de Jonattan (AC-192): la lista de barcos con la vista previa de cada uno, sus niveles,
# «Elegir»/«EN USO» y «Mejoras», y la vista de mejoras de un barco (la que se navega y otra), en 1440×900, 390×844 y 844×390.
# Dibujada con tienda103.py (sobre tienda13.py y tienda.py). Las imágenes son los WebP de retrato13.py, descodificados.
# Fondos: las capturas de la lámina aprobada D85, como en lamina_tienda13.py. Escribe en UX_OUT. No corre en la CI.
import sys, os, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import rutas as RT
import tienda as T
import tienda13 as M
import tienda103 as D
import lamina_tienda13 as LT
from PIL import Image

S, MODAL_H = LT.S, LT.MODAL_H
RET = os.path.join(RT.OUT, 'retratos13'); IMGS, WEBP_B = {}, {}
for cls in ('sloop', 'brig', 'schooner', 'frigate', 'line'):
    man = json.load(open(RT.need(os.path.join(RET, f'retratos13-{cls}.json'), f'retratos13-{cls}.json (retrato13.py all)')))
    for v in man['retratos'].values():
        IMGS[(cls, v['familia'])] = Image.open(os.path.join(RET, v['webp'])).convert('RGBA'); WEBP_B[(cls, v['familia'])] = v['B']
LV = dict(sloop=dict(cannons=3, hull=1, sails=2), brig=dict(cannons=1, hull=1, sails=1), frigate=dict(cannons=2, hull=3, sails=1))
ST = dict(owned={'sloop', 'brig', 'frigate'}, active='brig', gold=2000, level=4, levels=LV, fam='gb')
LV2 = dict(LV, frigate=dict(cannons=3, hull=3, sails=1))
ST_BOUGHT = dict(ST, gold=500, levels=LV2)  # tras comprar Cañones N3 para la Fragata: 1500 (×1), sin cambiar de barco
n, half, font = LT.n, LT.half, LT.font


def bg_put(vw, vh, im_shop, L):
    bg = LT.background(vw, vh); g = L['g']; bg.alpha_composite(im_shop, (round(g['x'] * S), round(g['y'] * S))); return bg.convert('RGB')


def list_screen(vw, vh, st, scroll=None, banner=False, notice=None):
    L = D.list_layout(vw, vh, st, MODAL_H, banner); return bg_put(vw, vh, D.draw_list(L, st, S, IMGS, scroll, notice), L), L


def view_screen(vw, vh, st, sid, scroll=0.0, notice=None):
    L = D.view_layout(vw, vh, st, sid, MODAL_H); return bg_put(vw, vh, D.draw_view(L, st, S, IMGS, scroll, notice), L), L


def crop_panel(im, L):
    g = L['g']; return im.crop((round(g['x'] * S), round(g['y'] * S), round((g['x'] + g['w']) * S), round((g['y'] + g['h']) * S)))


def origin(L):
    g = L['g']; mx = 6 if g['kind'] == 'modal' else 0; my = 6 if g['kind'] == 'modal' else 4
    return g['x'] + mx + g['pad'][1], g['y'] + my + 64 + 46.5 + (40 if L.get('banner') else 0) + g['pad'][0]


def card_of(L, sid): return next(c for c in L['cards'] if c['ship']['id'] == sid)


def foot_xy(L, sid, k, scroll=0.0):
    c = card_of(L, sid); ox, oy = origin(L); it = next(i for i in c['foot'] if i['k'].startswith(k))
    bx = ox + c['x'] + 13 + D.PV_W + 12
    return bx + it['x'], oy - scroll + c['y'] + c['H'] - 13 - c['fh'] + it['y'], it


def d103():
    sh = LT.Sheet(2360, 9000); d = sh.d
    d.text((40, 22), 'Tienda 1.3 por barco: la lista con la imagen de cada barco y sus mejoras', font=font(32), fill=LT.INK)
    y = 72
    for t in ('Maqueta del Astillero de la 1.3 con tus cambios a D99 (2026-11-16): ya no hay pestaña Mejoras; cada barco lleva la imagen de su modelo y su botón «Mejoras», que abre las de ese barco. Sustituye a D99 y D100.',
              'El caso: tienes nivel 4, 2000 de oro y la familia británica. Navegas el Bergantín (sin mejorar), y tienes la Balandra (Cañones 3, Casco 1, Velas 2) y la Fragata (Cañones 2, Casco 3, Velas 1).',
              'Lo que se aprueba: la lista con las imágenes, los 2 botones de cada barco tuyo, la vista de mejoras de un barco (el que navegas y otro) y cómo se vuelve a la lista.'):
        sh.label(40, y, t, f=font(17, 500)); y += 26

    # 1. la lista
    y = sh.title(y + 16, '1. La lista de barcos: escritorio (1440×900) y móvil (390×844, arriba y al final), a tamaño real')
    dsk, Ld = list_screen(1440, 900, ST); m0, Lm = list_screen(390, 844, ST); end = Lm['content_h'] - Lm['grid_h']; m1, _ = list_screen(390, 844, ST, end)
    sh.frame(half(dsk), 40, y); sh.frame(half(m0), 1510, y); sh.frame(half(m1), 1930, y)
    sh.label(40, y + 906, f"Escritorio: los 5 barcos a la vista, {n(Ld['content_h'])} px de tarjetas en {n(Ld['grid_h'])}, como en D85")
    sh.vdim(40 + 1160 + 12, y + Ld['g']['y'], y + Ld['g']['y'] + Ld['g']['h'], '672 px')
    sh.label(1510, y + 850, 'Móvil, arriba'); sh.label(1930, y + 850, 'Móvil, al final de la lista')
    ox, oy = origin(Ld)
    c = card_of(Ld, 'frigate'); sh.num(40 + ox + c['x'] + 8, y + oy + c['y'] + 8, 1)
    c = card_of(Ld, 'sloop'); sh.num(40 + ox + c['x'] + 13 + D.PV_W + 12 + c['BW'] - c['tr']['w'] / 2, y + oy + c['y'] - 4, 2)
    fx, fy, it = foot_xy(Ld, 'frigate', 'btnc'); sh.num(40 + fx - 18, y + fy + 20, 3)
    fx, fy, it = foot_xy(Ld, 'brig', 'btnm'); sh.num(40 + fx + it['w'] + 18, y + fy + 20, 4)
    c = card_of(Ld, 'line'); sh.num(40 + ox + c['x'] + 13 + D.PV_W + 12 + c['BW'] - c['tr']['w'] / 2, y + oy + c['y'] - 4, 5)
    ly = y + 950
    ly = sh.notes(ly, (
        (1, 'Cada barco, con la imagen de su modelo, no con el icono genérico: con tu familia en uso (aquí, la británica) o con el modelo de hoy si no tienes familia. También los que no tienes, para ver qué compras.'),
        (2, 'En cada barco tuyo, sus 3 niveles junto al nombre (Cañones, Casco y Velas), para comparar sin abrir nada; y sus cifras ya llevan sus mejoras.'),
        (3, '«Elegir» para navegar ese barco; el que navegas lleva el sello «EN USO». Los 2 botones de los barcos son de borde: el azul lleno queda para lo que gasta oro («Comprar», «Mejorar»).'),
        (4, '«Mejoras», con la llave inglesa, en cada barco tuyo, también en el que navegas: abre la vista de mejoras de ese barco (sección 2).'),
        (5, 'Los barcos que no tienes no cambian: «Llega sin mejoras», «Requiere nivel 9 (Contramaestre)», «Te faltan» y «Comprar». En el escritorio caben los 5 sin desplazar; en el móvil y en el apaisado, la lista se desplaza y, al abrir, lleva el barco que navegas a la vista.')))
    y = ly + 24

    # 2. la vista de mejoras
    y = sh.title(y, '2. Pulsar «Mejoras» en la Fragata, que no navegas, y en el Bergantín, que sí (escritorio, el panel a tamaño real)')
    pa = half(crop_panel(dsk, Ld)); vf, Lf = view_screen(1440, 900, ST, 'frigate'); pf = half(crop_panel(vf, Lf))
    xa, xb = 40, 40 + pa.width + 120
    sh.frame(pa, xa, y); sh.frame(pf, xb, y)
    ax = xa + pa.width + 20; d.line((ax, y + 300, ax + 80, y + 300), fill=LT.ANN, width=3); d.polygon([(ax + 80, y + 292), (ax + 92, y + 300), (ax + 80, y + 308)], fill=LT.ANN)
    fx, fy, it = foot_xy(Ld, 'frigate', 'btnm'); sh.num(xa + (fx - Ld['g']['x']) + it['w'] / 2, y + (fy - Ld['g']['y']) - 16, 1)
    g = Lf['g']; vx, vy = g['x'] + 6 + g['pad'][1], g['y'] + 6 + 64 + 46.5 + g['pad'][0]
    sh.num(xb + (vx - g['x']) - 16, y + (vy - g['y']) + 20, 2)
    sh.num(xb + (vx - g['x']) + Lf['hv'][0] / 2, y + (vy - g['y']) + 52 + Lf['hv'][1] + 18, 3)
    sh.num(xb + (vx - g['x']) + Lf['hv'][0] + 16 + Lf['tw'] + 18, y + (vy - g['y']) + 52 + 27 + 6 + 14 + 10 + 18, 4)
    c0 = Lf['cards'][0]; sh.num(xb + (vx - g['x']) + c0['x'] + c0['W'] - 30, y + (vy - g['y']) + Lf['y_cards'] + c0['H'] - 33, 5)
    sh.label(xa, y + pa.height + 8, 'La lista: «Mejoras» en la Fragata'); sh.label(xb, y + pf.height + 8, 'La vista de mejoras de la Fragata, sin cambiar de barco')
    y += pa.height + 48
    vb, Lb = view_screen(1440, 900, ST, 'brig'); pb = half(crop_panel(vb, Lb))
    vbought, _ = view_screen(1440, 900, ST_BOUGHT, 'frigate', notice='Compra realizada'); pbought = half(crop_panel(vbought, Lf))
    sh.frame(pb, xa, y); sh.frame(pbought, xb, y)
    sh.label(xa, y + pb.height + 8, 'La del Bergantín, el que navegas: el sello «EN USO» y sin aviso')
    sh.label(xb, y + pbought.height + 8, 'Tras «Mejorar» los Cañones de la Fragata: nivel 3, 500 de oro, y sigues en el Bergantín')
    ly = y + pb.height + 48
    ly = sh.notes(ly, (
        (1, '«Mejoras» abre la vista de ese barco dentro del Astillero, sin enviar nada al servidor. La pestaña Barcos sigue marcada.'),
        (2, '«‹ Barcos» vuelve a la lista, en el mismo punto de desplazamiento. La pestaña Barcos también vuelve a ella.'),
        (3, 'De qué barco son las mejoras: su imagen grande (190 × 120) y «Mejoras de la Fragata», con sus 3 niveles.'),
        (4, 'Si no es el barco que navegas, el aviso: «No es el barco que navegas. La mejora se le aplica igual, y sigues navegando el Bergantín.» En el que navegas, el sello «EN USO».'),
        (5, 'Las 3 tarjetas de mejora son las de hoy, con los niveles y los precios de ese barco: los Cañones al nivel 3 cuestan 1500 en la Fragata (×1) y costarían 1125 en el Bergantín (×0,75). Al comprar, la tarjeta sube de nivel ahí mismo y sale «Compra realizada».')))
    y = ly + 24

    # 3. móvil y apaisado
    y = sh.title(y, '3. La vista de mejoras en el móvil (390×844, arriba y al final) y la lista y la vista en el apaisado (844×390), a tamaño real')
    mv0, Lmv = view_screen(390, 844, ST, 'frigate'); mv1, _ = view_screen(390, 844, ST, 'frigate', Lmv['content_h'] - Lmv['grid_h'])
    sh.frame(half(mv0), 40, y); sh.frame(half(mv1), 460, y)
    la, Lla = list_screen(844, 390, ST); lv, Llv = view_screen(844, 390, ST, 'frigate')
    sh.frame(half(la), 900, y); sh.frame(half(lv), 900, y + 440)
    sh.label(40, y + 850, f"Móvil: el aviso, debajo, a todo el ancho; la vista mide {n(round(Lmv['content_h'], 1))} px y se desplaza")
    sh.label(900, y + 396, 'Apaisado: la lista, que se desplaza; el Bergantín, que navegas, está en la primera fila')
    sh.label(900, y + 836, 'Apaisado: la vista de la Fragata (imagen de 144 × 91), que se desplaza hasta las tarjetas')
    y += 900

    # 4. al doble
    y = sh.title(y, '4. La tarjeta de la Fragata (tuya) y la del Navío (sin comprar) al doble, con sus medidas (escritorio)')
    cx = 40; bottom = y
    for sid in ('frigate', 'line'):
        c = card_of(Ld, sid); pad = 10
        im = Image.new('RGBA', (round((c['W'] + 2 * pad) * S), round((c['H'] + 2 * pad) * S)), T.hexrgb(T.C['paper']) + (255,))
        D.draw_ship_card(T.Pen(im, S), dict(c, x=0, y=0), pad, pad, ST, IMGS); im = im.convert('RGB'); sh.frame(im, cx, y)
        sh.hdim(cx + (pad + 13) * S, cx + (pad + 13 + D.PV_W) * S, y + (pad + 13 + D.PV_H) * S + 8, f"{D.PV_W} × {n(round(D.PV_H, 1))}")
        sh.vdim(cx + im.width + 14, y + pad * S, y + (pad + c['H']) * S, f"{n(c['H'])} px")
        sh.label(cx, y + im.height + 44, f"{c['ship']['label']}: tarjeta de {n(c['W'])} × {n(c['H'])} px; columna de texto de {n(round(c['BW'], 1))}")
        if sid == 'frigate':
            fx = cx + (pad + 13 + D.PV_W + 12) * S
            for it in c['foot']:
                if it['k'] in ('btnc', 'btnm'):
                    x0 = fx + it['x'] * S; sh.hdim(x0, x0 + it['w'] * S, y + (pad + c['H'] - 13) * S + 30, f"{n(round(it['w']))}")
        bottom = max(bottom, y + im.height + 80); cx += im.width + 140
    y = bottom + 10
    y = sh.para(40, y, sh.W - 80, f"La vista previa: 112 × 70,7 (19:12, la caja de la pestaña Familia), radio 6, con el mismo fondo CSS de cielo y mar; arriba a la izquierda de la tarjeta, donde estaba el icono de 64. «Elegir» y «Mejoras» son .btn--compact (40 de alto, sin el ancho mínimo de 132): {n(round(D.cbtn('Elegir')))} y {n(round(D.cbtn('Mejoras', 'wrench')))} px, que caben juntos en la columna de texto de {n(round(card_of(Ld, 'frigate')['BW'], 1))} del escritorio y de {n(round(card_of(Lm, 'frigate')['BW'], 1))} del móvil.", f=font(16, 500)) + 24

    # 5. sin familia y BD caída
    y = sh.title(y, '5. La misma lista sin familia (con el modelo de hoy de cada barco) y con la BD caída (escritorio, el panel a la mitad)')
    nf, Lnf = list_screen(1440, 900, dict(ST, fam='none')); dn, Ldn = list_screen(1440, 900, dict(ST, down=True), banner=True)
    pn, pdn = half(crop_panel(nf, Lnf)), half(crop_panel(dn, Ldn))
    sh.frame(pn, 40, y); sh.frame(pdn, 40 + pn.width + 120, y)
    sh.label(40, y + pn.height + 8, 'Sin familia: las imágenes son el modelo procedural de cada barco, el de hoy')
    sh.label(40 + pn.width + 120, y + pdn.height + 8, f"BD caída: la franja, y «Elegir» y «Comprar» apagados; «Mejoras» abre igual la vista, con «Mejorar» apagado ({n(Ldn['content_h'])} px en {n(Ldn['grid_h'])}: se desplaza)")
    y += pn.height + 50
    tot = {f: sum(WEBP_B[(c, f)] for c in ('sloop', 'brig', 'schooner', 'frigate', 'line')) for f in ('none', 'gb', 'es')}
    y = sh.para(40, y, sh.W - 80, f"Las imágenes: 15, una por clase y aspecto, las mismas de la pestaña Familia (D101); 760 × 480 a 2×, WebP de calidad 85; la más pesada, {n(max(WEBP_B.values()))} B (el tope es 40 000). Al abrir el Astillero se bajan las 5 del aspecto en uso: {n(tot['none'])} B sin familia, {n(tot['gb'])} B la británica y {n(tot['es'])} B la española.", f=font(16, 500)) + 24

    # 6. descartes
    y = sh.title(y, '6. Lo que descarté')
    y = sh.para(40, y, sh.W - 80, 'La imagen grande arriba de cada tarjeta, como en la pestaña Familia: cada tarjeta mediría más de 300 px, la lista pasaría de 1000 en el escritorio y el barco que navegas podría quedar fuera de la vista al abrir.', f=font(16, 500))
    y = sh.para(40, y + 6, sh.W - 80, f"Los 2 botones con el ancho de siempre (132 cada uno): suman 272 px y la columna de texto mide {n(round(card_of(Ld, 'frigate')['BW'], 1))}, así que el pie bajaría a 2 filas y los 5 barcos dejarían de caber.", f=font(16, 500))
    y = sh.para(40, y + 6, sh.W - 80, 'Que tocar el barco lo ponga a navegar y abra sus mejoras: junta mejorar con cambiar de barco (producto lo descartó en Q34). «Elegir» y «Mejoras» son 2 botones.', f=font(16, 500))
    y = sh.para(40, y + 6, sh.W - 80, 'Abrir la vista de mejoras como una ventana encima del Astillero: serían 2 paneles apilados en el móvil. La vista sustituye a la lista dentro del mismo panel, con «‹ Barcos» para volver.', f=font(16, 500))
    return sh.save(y + 10, 'D103-tienda-por-barco.png')


if __name__ == '__main__':
    out, size = d103(); print(out, size)

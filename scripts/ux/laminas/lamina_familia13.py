# Uso (desde la raíz del repo), con la UX_OUT de `retrato13.py frigate` (sus retratos13/ y retratos13-frigate.json):
#   python3 -I scripts/ux/laminas/lamina_familia13.py  →  $UX_OUT/D101-tienda-familia.png
# Lámina de la pestaña Familia de la 1.3 (D101; actualiza D94; GDD §6, Q33, Q38 y Q39; BACKLOG AC-222 a AC-225) para el visto
# bueno de Jonattan (AC-192): las 3 tarjetas («sin familia», la británica y la española, las 2 de pago), con la Fragata en
# cada aspecto, al comprar, mientras espera, si falla, con la BD caída y mientras cargan las imágenes, en 1440×900, 390×844 y
# 844×390. Dibujada con tienda13.py (sobre tienda.py). Las imágenes son los WebP de retrato13.py, descodificados: lo que verá
# el jugador. Fondos: las capturas de la lámina aprobada D85, como en lamina_tienda13.py. Escribe en UX_OUT. No corre en la CI.
import sys, os, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import rutas as RT
import tienda as T
import tienda13 as M
import lamina_tienda13 as LT
from PIL import Image

S, MODAL_H = LT.S, LT.MODAL_H
RET = os.path.join(RT.OUT, 'retratos13')
MAN = json.load(open(RT.need(os.path.join(RET, 'retratos13-frigate.json'), 'retratos13-frigate.json (retrato13.py frigate)')))
IMGS = {v['familia']: Image.open(os.path.join(RET, v['webp'])).convert('RGBA') for v in MAN['retratos'].values()}
WEBP_B = {v['familia']: v['B'] for v in MAN['retratos'].values()}
ST_A = dict(gold=5500, fam='none', owned=set())          # sin familia y con oro para una
ST_B = dict(gold=1500, fam='gb', owned={'gb'})           # tras comprar la británica: 5500 − 4000
n, half, font = LT.n, LT.half, LT.font


def screen(vw, vh, st, scroll=0.0, banner=False, notice=None):
    L = M.fam13_layout(vw, vh, st, MODAL_H, banner); g = L['g']; bg = LT.background(vw, vh)
    bg.alpha_composite(M.draw_fam13(L, st, S, IMGS, scroll, notice), (round(g['x'] * S), round(g['y'] * S)))
    return bg.convert('RGB'), L


def panel(vw, vh, st, **kw):
    im, L = screen(vw, vh, st, **kw); g = L['g']
    return im.crop((round(g['x'] * S), round(g['y'] * S), round((g['x'] + g['w']) * S), round((g['y'] + g['h']) * S))), L


def card_xy(L, fid, scroll=0.0, banner=False):
    g = L['g']; c = next(c for c in L['cards'] if c['fam']['id'] == fid)
    mx = 6 if g['kind'] == 'modal' else 0; my = 6 if g['kind'] == 'modal' else 4
    return c, g['x'] + mx + g['pad'][1] + c['x'], g['y'] + my + 64 + 46.5 + (40 if banner else 0) + g['pad'][0] - scroll + c['y']


def foot_xy(L, fid, k, scroll=0.0):
    c, x, y = card_xy(L, fid, scroll); it = next(i for i in c['foot'] if i['k'].startswith(k))
    return x + 13 + it['x'], y + c['H'] - 13 - c['fh'] + it['y'], it


def d101():
    sh = LT.Sheet(2360, 7000); d = sh.d
    d.text((40, 22), 'Tienda 1.3: la pestaña Familia, con las 2 familias de pago', font=font(32), fill=LT.INK)
    y = 72
    for t in ('Maqueta de la pestaña Familia de la 1.3 (actualiza D94), dibujada con las fuentes, los colores, los iconos y las medidas del juego. Las imágenes son las de verdad: la Fragata con su modelo de hoy y con cada familia.',
              'El caso: navegas la Fragata, sin familia, con 5500 de oro. Cada familia cuesta 4000, sin pedir nivel, y ninguna viene incluida. «Sin familia» es el aspecto de siempre y nunca se paga.',
              'Lo que se aprueba: las 3 tarjetas con su imagen, el precio y «Comprar» en cada familia, «Elegir» o «En uso» en lo que ya tienes, la nota y lo que se ve al comprar.'):
        sh.label(40, y, t, f=font(17, 500)); y += 26

    # 1. comprar la británica
    y = sh.title(y + 16, '1. Comprar la británica: antes, y justo después, con el aviso dentro del Astillero (escritorio, el panel a tamaño real)')
    pa, La = panel(1440, 900, ST_A); pb, Lb = panel(1440, 900, ST_B, notice='ok')
    pa, pb = half(pa), half(pb); xa, xb = 40, 40 + pa.width + 120
    sh.frame(pa, xa, y); sh.frame(pb, xb, y)
    ax = xa + pa.width + 20; d.line((ax, y + 300, ax + 80, y + 300), fill=LT.ANN, width=3); d.polygon([(ax + 80, y + 292), (ax + 92, y + 300), (ax + 80, y + 308)], fill=LT.ANN)
    sh.label(xa, y + pa.height + 8, 'Sin familia y con 5500 de oro: las 2 familias se pueden comprar')
    sh.label(xb, y + pb.height + 8, 'Tras pulsar «Comprar» en la británica: 1500 de oro, la británica en uso y el aviso')
    def at(L, x0, px, py): return x0 + (px - L['g']['x']), y + (py - L['g']['y'])
    c, cx, cy = card_xy(La, 'none'); sx, sy = at(La, xa, cx, cy); sh.num(sx + 6, sy + 6, 1)
    fx, fy, it = foot_xy(La, 'gb', 'price'); sx, sy = at(La, xa, fx, fy); sh.num(sx - 20, sy + it['h'] / 2, 2)
    fx, fy, it = foot_xy(Lb, 'es', 'why'); sx, sy = at(Lb, xb, fx, fy); sh.num(sx - 18, sy + it['h'] / 2, 3)
    g = La['g']; nx, ny = at(La, xa, g['x'] + 6 + g['pad'][1], g['y'] + 6 + 64 + 46.5 + g['pad'][0] + La['note_y']); sh.num(nx - 20, ny + 10, 4)
    b = T.notice_box(Lb, 'ok'); sh.num(xb + b['x'] - 20, y + b['y'] + 18, 5)
    ly = y + pa.height + 48
    ly = sh.notes(ly, (
        (1, '«Sin familia»: tu barco con su modelo de hoy, el que todos tienen al empezar. Es gratis y nunca lleva precio: «El aspecto de siempre · gratis», y «Elegir» o el sello «En uso».'),
        (2, 'Cada familia, con su precio, 4000, y «Comprar». No pide nivel y ya no hay ninguna incluida: las 2 cuestan lo mismo, para que se elija por gusto.'),
        (3, 'Con menos oro, «Comprar» se apaga y la tarjeta dice lo que falta, como los barcos (D85): tras gastar 4000 en la británica, a la española le faltan 2500.'),
        (4, 'La nota, para las 3: una familia solo cambia el aspecto, y se compra una vez y vale para todos tus barcos, también los que compres después.'),
        (5, 'Al comprar, la familia pasa a estar en uso en todos tus barcos y sale el aviso dentro del Astillero (O-48): «Tus barcos ahora son de la familia británica». Volver a «Sin familia» o cambiar entre las que tienes es gratis.')))
    y = ly + 24

    # 2. escritorio y móvil
    y = sh.title(y, '2. Escritorio (1440×900) y móvil (390×844, arriba y desplazado al final), a tamaño real, tras comprar la británica')
    dsk, Ld = screen(1440, 900, ST_B); m0, Lm = screen(390, 844, ST_B); end = Lm['content_h'] - Lm['grid_h']; m1, _ = screen(390, 844, ST_B, end)
    sh.frame(half(dsk), 40, y); sh.frame(half(m0), 1510, y); sh.frame(half(m1), 1930, y)
    sh.label(40, y + 906, f"Escritorio: las 3 tarjetas y la nota a la vista, {n(round(Ld['content_h'], 1))} px de {n(Ld['grid_h'])}, en 3 columnas de {n(round(Ld['cw'], 1))}")
    sh.label(1510, y + 850, 'Móvil, arriba: 1 columna'); sh.label(1930, y + 850, 'Móvil, al final: la lista se desplaza')
    y += 940

    # 3. apaisado y las tarjetas al doble
    y = sh.title(y, '3. Móvil apaisado (844×390), a tamaño real, y 2 tarjetas del escritorio al doble, con sus medidas')
    lan, Ll = screen(844, 390, ST_B); sh.frame(half(lan), 40, y)
    sh.label(40, y + 396, f"Apaisado: 3 columnas con la imagen de 104 de alto; las tarjetas miden {n(round(Ll['cards_h'], 1))} y la lista, {n(Ll['grid_h'])}: se desplaza")
    cx = 40 + 844 + 60; cy = y; bottom = y + 440
    for fid in ('none', 'es'):
        L = M.fam13_layout(1440, 900, ST_B, MODAL_H); c = next(c for c in L['cards'] if c['fam']['id'] == fid); pad = 10
        im = Image.new('RGBA', (round((c['W'] + 2 * pad) * S), round((c['H'] + 2 * pad) * S)), T.hexrgb(T.C['paper']) + (255,))
        M.draw_fam13_card(T.Pen(im, S), dict(c, x=0, y=0), pad, pad, ST_B, IMGS); im = im.convert('RGB')
        if cx + im.width + 100 > sh.W: cx = 40 + 844 + 60; cy = bottom
        sh.frame(im, cx, cy)
        sh.hdim(cx + (pad + 13) * S, cx + (pad + 13 + c['iw']) * S, cy + (pad + 13 + c['ih']) * S + 8, f"{n(round(c['iw'], 1))} × {n(round(c['ih'], 1))}")
        sh.vdim(cx + im.width + 14, cy + pad * S, cy + (pad + c['H']) * S, f"{n(round(c['H'], 1))} px")
        sh.label(cx, cy + im.height + 44, f"{c['fam']['label']}: tarjeta de {n(round(c['W'], 1))} × {n(round(c['H'], 1))} px")
        bottom = max(bottom, cy + im.height + 80); cx += im.width + 90
    y = bottom + 10
    y = sh.para(40, y, sh.W - 80, f"Imagen: 760 × 480, de lado y 20° hacia la popa, como en D94; WebP de calidad 85: sin familia {n(WEBP_B['none'])} B, británica {n(WEBP_B['gb'])} B y española {n(WEBP_B['es'])} B, las 3 dentro de los 40 000 B. La de «sin familia» es el modelo procedural de hoy con la luz del juego; las otras, los GLB de la cadena de arte (D91) con su textura.", f=font(16, 500)) + 24

    # 4. estados
    y = sh.title(y, '4. Los estados de D94, con la compra (escritorio, el panel a la mitad)')
    states = ((dict(ST_A, pend='es'), {}, 'Esperando al servidor: «Comprar» apagado en la española, con el mismo texto, hasta que llega la respuesta'),
              (ST_A, dict(notice='err_buy'), 'Sin respuesta en 5 s o si falla el guardado: no se cobra, el botón vuelve y sale el aviso de error'),
              (dict(ST_B, down=True), dict(banner=True), 'BD caída: la franja bajo las pestañas, y «Comprar» y «Elegir» apagados; el sello se queda'),
              (dict(ST_B, loading=True), {}, 'Cargando las imágenes: las cajas ya tienen su tamaño y su fondo, y no se mueve nada'))
    for i, (st, kw, cap) in enumerate(states):
        im, _ = panel(1440, 900, st, **kw); im = half(im); x = 40 + (i % 2) * (im.width + 120); yy = y + (i // 2) * (im.height + 70)
        sh.frame(im, x, yy); sh.para(x, yy + im.height + 8, im.width, cap, f=font(15, 500))
    y += 2 * (672 + 70) + 20

    # 5. descartes
    y = sh.title(y, '5. Lo que descarté')
    L2 = M.fam13_layout(1440, 900, ST_B, MODAL_H)
    h2 = 2 + 24 + 240 + 10 + 18 * T.LH + 4 + 13 * T.LH + 12 + 40  # una tarjeta de 406 con la imagen de 380 × 240, rasgos y pie en una línea
    y = sh.para(40, y, sh.W - 80, f"Las 2 columnas de D94 con la tercera tarjeta debajo: con la imagen de 380 × 240, cada tarjeta mide {n(h2)} px y las 2 filas suman {n(2 * h2 + 16)} px en {n(L2['grid_h'])}, así que en el escritorio habría que desplazar. Con 3 columnas cabe todo, con la nota ({n(round(L2['content_h'], 1))} px).", f=font(16, 500))
    row = 30 + 8 + T.tw('Española', 18, 600) + 8 + 132
    y = sh.para(40, y + 6, sh.W - 80, f"La fila de D94 con bandera, nombre y botón: en una columna de {n(round(L2['cards'][0]['iw'], 1))} px no cabe ({n(round(row))} px, y con el precio, más). El pie va abajo, como en las tarjetas de barco.", f=font(16, 500))
    y = sh.para(40, y + 6, sh.W - 80, '«Gratis» o «0» como precio en «Sin familia»: la regla es que lo que ya tienes nunca lleva precio, y un 0 parecería algo que se compra. Lo dicen los rasgos: «El aspecto de siempre · gratis».', f=font(16, 500))
    y = sh.para(40, y + 6, sh.W - 80, 'Un modelo con detalle «sin librea» para «Sin familia»: es una tercera familia que diseñar, descargar y probar, y regalaría el detalle que se paga (GDD Q39).', f=font(16, 500))
    return sh.save(y + 10, 'D101-tienda-familia.png')


if __name__ == '__main__':
    out, size = d101(); print(out, size)

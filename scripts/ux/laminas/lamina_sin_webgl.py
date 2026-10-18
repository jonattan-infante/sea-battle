# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/lamina_sin_webgl.py  →  $UX_OUT/D86-sin-webgl.png
# Lámina del aviso «sin WebGL» (P2 de producto; D86) para Jonattan: un estado más de la tarjeta de D50 (ART-DIRECTION §16.2),
# `no-webgl`, sobre el fondo de «Conectando» y sin velo, como «Progreso no disponible» (AC-131), en los 3 tamaños.
# La tarjeta se dibuja con un modelo de las reglas de globals.css (.offline, .offline-screen, .btn) y la Barlow y la
# Pirata One del juego, que antes se contrasta con la captura real de AC-131 (ac131-load-failed.png). Comparte las
# fuentes, los iconos y el dibujo con tienda.py. Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import rutas as RT
import tienda as T
import numpy as np
from PIL import Image, ImageDraw

S = 2
LH = 1.5
# Textos de los estados (Overlays.tsx de dev-render 8292bd6, y el nuevo de D86)
LOAD_FAILED = dict(title='Progreso no disponible', body='No podemos cargar tu progreso ahora mismo',
                   detail='Lo que tenías guardado sigue intacto.', buttons=('Reintentar', 'Salir'))
NO_WEBGL = dict(title='Sin gráficos 3D', body='Tu navegador no puede mostrar el juego.',
                detail='Activa la aceleración por hardware del navegador y reinícialo, o prueba otro navegador actualizado.',
                buttons=('Reintentar', 'Salir'))


def lines(t, px, w, W):
    """Parte un párrafo por los espacios, como el navegador, en líneas de ancho ≤ W."""
    out, cur = [], ''
    for wd in t.split(' '):
        s = (cur + ' ' + wd).strip()
        if cur and T.tw(s, px, w) > W + 0.01: out.append(cur); cur = wd
        else: cur = s
    return out + [cur]


def card_layout(vw, vh, copy):
    """La tarjeta .offline: 400 de ancho (calc(100vw − 32px) si no cabe), relleno de 20, columna centrada con hueco de 12,
    alto mínimo de 220 y centrada en la pantalla (.offline-screen: grid y place-items: center)."""
    W = min(400, vw - 32); CW = W - 2 - 40
    bh = 48 if (vw < 700 or vh < 500) else 40  # D50: ≥ 48 con los cortes móviles del HUD
    items = [('title', lines(copy['title'], 32, 'pirata', CW), 32, 'pirata'), ('body', lines(copy['body'], 16, 500, CW), 16, 500),
             ('detail', lines(copy['detail'], 14, 500, CW), 14, 500)]
    hs = [len(l) * px * LH for _, l, px, _ in items] + [bh]
    content = sum(hs) + 12 * (len(hs) - 1)
    H = max(220, 2 + 40 + content)
    bw = [max(132, T.tw(b, 15, 600) + 32) for b in copy['buttons']]
    return dict(W=W, H=H, CW=CW, x=(vw - W) / 2, y=(vh - H) / 2, items=items, hs=hs, bh=bh, bw=bw, top=(H - 2 - 40 - content) / 2)


def gradient(vw, vh, S):
    """linear-gradient(#0f3f5c, #1a5f86) de arriba abajo."""
    a, b = np.array(T.hexrgb('#0F3F5C'), float), np.array(T.hexrgb('#1A5F86'), float)
    t = (np.arange(vh * S) + 0.5) / (vh * S)
    col = (a[None] * (1 - t[:, None]) + b[None] * t[:, None]).round().astype(np.uint8)
    return Image.fromarray(np.repeat(col[:, None, :], vw * S, axis=1), 'RGB').convert('RGBA')


def over(fg, a, bg):
    return tuple(round(f * a + g * (1 - a)) for f, g in zip(fg, bg))


def screen(vw, vh, copy, S=S, focus=True):
    """La pantalla entera: el fondo de «Conectando» y la tarjeta, con el foco en el primario (D50)."""
    im = gradient(vw, vh, S); p = T.Pen(im, S); L = card_layout(vw, vh, copy)
    x0, y0, W, H = L['x'], L['y'], L['W'], L['H']
    mid = tuple(im.getpixel((int((x0 + W / 2) * S), int((y0 + H / 2) * S))))[:3]
    p.rect(x0, y0, x0 + W, y0 + H, fill=over((11, 26, 36), 0.85, mid), outline=over((242, 193, 78), 0.35, mid), radius=8)
    y = y0 + 1 + 20 + L['top']
    for (k, ls, px, w), h in zip(L['items'], L['hs']):
        color = '#F2C14E' if k == 'title' else ('#F5F1E6' if k == 'body' else '#A9B8C2')
        for i, t in enumerate(ls):
            p.text(x0 + W / 2 - T.tw(t, px, w) / 2, y + i * px * LH, t, px, w, color)
        y += h + 12
    bx = x0 + W / 2 - (sum(L['bw']) + 12) / 2
    for i, (t, w) in enumerate(zip(copy['buttons'], L['bw'])):
        if i == 0:
            if focus:  # anillo de foco de Chromium: 2 px #005FCC por dentro de 1 px blanco
                p.rect(bx - 3, y - 3, bx + w + 3, y + L['bh'] + 3, outline='#FFFFFF', width=1, radius=10)
                p.rect(bx - 2, y - 2, bx + w + 2, y + L['bh'] + 2, outline='#005FCC', width=2, radius=9)
            p.rect(bx, y, bx + w, y + L['bh'], fill='#1F6F8B', radius=8)
            fg = '#FFFFFF'
        else:
            p.rect(bx, y, bx + w, y + L['bh'], outline='#F5F1E6', width=1.5, radius=8)
            fg = '#F5F1E6'
        p.text(bx + (w - T.tw(t, 15, 600)) / 2, y + (L['bh'] - 15 * LH) / 2, t, 15, 600, fg)
        bx += w + 12
    return im.convert('RGB'), L


def validar():
    """El modelo frente a la captura real de AC-131 (1440 × 900). El rasterizado de las letras (FreeType frente a Skia)
    impide una diferencia de píxeles pequeña, así que se compara la posición: por cada elemento (título, texto, detalle y
    botones), el centro vertical de su tinta y sus extremos horizontales; y la diferencia media fuera del texto."""
    cap = Image.open(RT.need(os.path.join(RT.CAPTURAS, 'persistence', 'ac131-load-failed.png'), 'captura ac131')).convert('RGB')
    im, L = screen(1440, 900, LOAD_FAILED)  # a 2× y reducido, como un DPR 1 con suavizado
    im = im.resize((1440, 900), Image.LANCZOS)
    x0, y0 = int(L['x']), int(L['y'])
    def ink(img): return np.asarray(img, float)[y0 + 5:y0 + 215, x0 + 5:x0 + 395].mean(axis=2) > 70
    A, B = ink(cap), ink(im)
    out = {}
    for name, (a, b) in {'titulo': (25, 75), 'texto': (85, 110), 'detalle': (120, 140), 'botones': (150, 200)}.items():
        r = []
        for M in (A, B):
            ys, xs = np.nonzero(M[a:b]); r.append((ys.mean() + a, xs.min(), xs.max()))
        out[name] = (round(r[1][0] - r[0][0], 2), int(r[1][1] - r[0][1]), int(r[1][2] - r[0][2]))
    e = np.abs(np.asarray(cap, float) - np.asarray(im, float)).mean(axis=2)[y0:y0 + 220, x0:x0 + 400]
    flat = np.concatenate([e[0:25], e[75:85], e[110:120], e[140:150], e[200:]]).mean()
    return dict(card=(L['x'], L['y'], L['W'], L['H']), desfase_y_x0_x1=out, fuera_del_texto=round(float(flat), 2))


if __name__ == '__main__':
    val = validar()
    ok = val['card'] == (520.0, 340.0, 400, 220) and val['fuera_del_texto'] < 2 and all(abs(dy) <= 1 and abs(a) <= 1 and abs(b) <= 1 for dy, a, b in val['desfase_y_x0_x1'].values())
    assert ok, f'el modelo no casa con la captura ac131: {val}'
    PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); ANN = (0, 112, 192)
    def font(px, w=600): return T.font(px, w)
    SW = 2360
    sheet = Image.new('RGB', (SW, 3000), PAPER); d = ImageDraw.Draw(sheet)
    def title(y, t): d.text((40, y), t, font=font(21), fill=TITLE); return y + 36
    def label(x, y, t, c=SOFT, f=None): d.text((x, y), t, font=f or font(15, 500), fill=c)
    def frame(im, x, y, c=(120, 110, 95)):
        sheet.paste(im, (x, y)); d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=c, width=1)
    def para(x, y, w, t, f=None, c=INK, lh=24):
        f = f or font(16, 500); line = ''
        for wd in t.split():
            s = (line + ' ' + wd).strip()
            if d.textlength(s, font=f) > w: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
            else: line = s
        d.text((x, y), line, font=f, fill=c); return y + lh
    def dim_h(x0, x1, y, t):
        d.line((x0, y, x1, y), fill=ANN, width=2)
        for x in (x0, x1): d.line((x, y - 6, x, y + 6), fill=ANN, width=2)
        w = d.textlength(t, font=font(15)); d.text(((x0 + x1 - w) / 2, y + 6), t, font=font(15), fill=ANN)
    def dim_v(x, y0, y1, t):
        d.line((x, y0, x, y1), fill=ANN, width=2)
        for yy in (y0, y1): d.line((x - 6, yy, x + 6, yy), fill=ANN, width=2)
        d.text((x + 10, (y0 + y1) / 2 - 10), t, font=font(15), fill=ANN)
    def small(im): return im.resize((im.width // S, im.height // S), Image.LANCZOS)

    d.text((40, 22), 'Aviso «sin gráficos 3D»: qué ve quien no puede mostrar el juego', font=font(32), fill=INK)
    y = 72
    for t in ('Si el navegador no puede dibujar en 3D (WebGL), hoy el juego se queda en blanco sin explicar por qué, y con los modelos nuevos la carga «Izando velas…» no se quitaría nunca. Propongo un aviso que dice qué pasa y qué hacer.',
              'Es la misma tarjeta de los otros avisos de conexión, sobre el fondo azul de la carga, como «Progreso no disponible». Dibujada con las fuentes y medidas del juego: con los textos',
              'de «Progreso no disponible», el mismo dibujo coincide con su captura real (cada parte, a 1 px como mucho). Aún no está construido.'):
        label(40, y, t, f=font(17, 500)); y += 26

    y = title(y + 16, '1. Escritorio (1440×900), móvil (390×844) y móvil apaisado (844×390), a tamaño real')
    dsk, Ld = screen(1440, 900, NO_WEBGL); mob, Lm = screen(390, 844, NO_WEBGL); lan, Ll = screen(844, 390, NO_WEBGL)
    frame(small(dsk), 40, y); frame(small(mob), 1510, y)
    def mm(L): return f"{L['W']:g} × {L['H']:g}".replace('.', ',')
    label(40, y + 906, f'Escritorio: la tarjeta de {mm(Ld)} px, en el centro'); label(1510, y + 850, f'Móvil: {mm(Lm)} px')
    # fila 2: el apaisado a tamaño real y, a su derecha, qué dice cada parte
    y2 = y + 900 + 40
    frame(small(lan), 40, y2); label(40, y2 + 396, f'Apaisado: {mm(Ll)} px; en móvil, los botones miden 48 px de alto')
    notes = ('Título «Sin gráficos 3D», como los otros avisos («Sin conexión», «Progreso no disponible»): corto y en dorado.',
             'Qué pasa, en una frase: «Tu navegador no puede mostrar el juego.»',
             'Qué hacer, en gris: activar la aceleración por hardware del navegador y reiniciarlo, o probar otro navegador actualizado. Cabe en 2 líneas en los 3 tamaños.',
             '«Reintentar» vuelve a cargar la página: sirve si era algo pasajero o después de cambiar el ajuste. «Salir» vuelve a la portada. El foco empieza en «Reintentar», así que Intro funciona sin buscarlo.')
    ny = y2
    for i, t in enumerate(notes, 1):
        d.ellipse((924, ny, 952, ny + 28), outline=ANN, width=3); d.text((938 - d.textlength(str(i), font=font(16)) / 2, ny + 3), str(i), font=font(16), fill=ANN)
        ny = para(964, ny + 2, SW - 1004, t) + 10
    # fila 3: las tarjetas al doble, con sus medidas
    y3 = max(y2 + 440, ny + 20); cx = 40; bottom = y3
    for (im, L, name) in ((dsk, Ld, 'escritorio'), (mob, Lm, 'móvil')):
        pad = min(24, L['x'])
        crop = im.crop((int((L['x'] - pad) * S), int((L['y'] - pad) * S), int((L['x'] + L['W'] + pad) * S), int((L['y'] + L['H'] + pad) * S)))
        frame(crop, cx, y3)
        dim_h(cx + pad * S, cx + (pad + L['W']) * S, y3 + crop.height + 14, f"{L['W']:g} px".replace('.', ','))
        dim_v(cx + crop.width + 14, y3 + pad * S, y3 + (pad + L['H']) * S, f"{L['H']:g} px".replace('.', ','))
        label(cx, y3 + crop.height + 44, f'Tarjeta de {name}, al doble')
        bottom = max(bottom, y3 + crop.height + 80); cx += crop.width + 120
    y = int(bottom) + 10

    y = title(y, '2. Lo que descarté')
    # A: «Izando velas…» para siempre, lo de hoy
    con = gradient(844, 390, S); p = T.Pen(con, S)
    p.paste(T.icon('compass', 64 * S, '#F2C14E'), 422 - 32, 195 - 32 - 20)
    t = 'Izando velas…'; p.text(422 - T.tw(t, 16, 500) / 2, 195 + 32 + 16 - 20, t, 16, 500, '#F5F1E6')
    frame(small(con.convert('RGB')), 40, y)
    para(40, y + 400, 844, 'Dejarlo así: con los modelos nuevos, la carga «Izando velas…» no se quita nunca y no dice qué pasa (aquí, en 844×390).', f=font(15, 500))
    para(944, y, 1340, 'Quitar la carga a los pocos segundos: se ve lo de hoy, los botones del juego sobre un fondo vacío, sin barco ni aviso. Sirve de puente hasta que se construya este aviso, no como solución.', f=font(15, 500))
    para(944, y + 80, 1340, 'Un enlace de ayuda («Cómo activarla»): cada navegador lo llama distinto y lo cambia de sitio; un enlace a su página de soporte se quedaría viejo. Basta con nombrar el ajuste.', f=font(15, 500))
    para(944, y + 160, 1340, 'Un dibujo o icono propio en la tarjeta: los otros avisos no llevan, y es la misma pieza para todos; una tarjeta igual a las demás se reconoce como «algo del juego».', f=font(15, 500))
    y += 450
    sheet = sheet.crop((0, 0, SW, y))
    out = os.path.join(RT.OUT, 'D86-sin-webgl.png'); sheet.save(out, optimize=True)
    print(out, sheet.size, 'validación', val, 'escritorio', Ld['W'], Ld['H'], 'móvil', Lm['W'], Lm['H'], [l for _, l, _, _ in Lm['items']], 'apaisado', Ll['W'], Ll['H'])

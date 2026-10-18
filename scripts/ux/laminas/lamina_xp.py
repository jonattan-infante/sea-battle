# Uso (desde la raíz del repo): UX_D76=<carpeta de las capturas> python3 -I scripts/ux/laminas/lamina_xp.py
#   →  $UX_OUT/D76-panel-xp.png
# Lámina del HUD de la experiencia (D76, con D81) para Jonattan, hecha con capturas reales del candidato 4a125e0 que sacó
# dev-render (C1–C8; su log, `dev-render-turno-glb-d76.log`, dice cómo se tomó cada una). Junta la pantalla entera en
# los 3 tamaños y los detalles ampliados: el panel del jugador (insignia, nivel y barra), el aviso de nivel, el oro y la XP
# al hundir, el rango del objetivo con el antes y el después de D81 en 844×390, y lo ya construido que aún no había
# enseñado (el aviso del Capitán y su ★ en el minimapa). Las capturas de móvil vienen a DPR 2: se pegan a la mitad para
# verlas a tamaño CSS, y los detalles, a tamaño nativo. Escribe en UX_OUT, nunca en docs/game/art/. No corre en la CI.
import sys, os
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import rutas as RT
from PIL import Image, ImageDraw, ImageFont

CAP = os.environ.get('UX_D76', os.path.join(RT.OUT, 'ux-d76-capturas'))
def font(px, w=600): return ImageFont.truetype(RT.FONTS + RT.FF[w], px, layout_engine=ImageFont.Layout.RAQM)
PAPER = (245, 241, 230); INK = (43, 29, 14); SOFT = (92, 74, 51); TITLE = (107, 58, 26); RED = (162, 59, 42); MARK = (226, 70, 52)
def cap(name): return Image.open(RT.need(os.path.join(CAP, name), f'captura {name} (UX_D76)')).convert('RGB')
def crop(name, box, k=1.0):
    im = cap(name).crop(box)
    return im if k == 1 else im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
def half(name): im = cap(name); return im.resize((im.width // 2, im.height // 2), Image.LANCZOS)

SW = 2140
sheet = Image.new('RGB', (SW, 7000), PAPER); d = ImageDraw.Draw(sheet)
def title(y, t): d.text((40, y), t, font=font(21), fill=TITLE); return y + 36
def label(x, y, t, c=SOFT, f=None): d.text((x, y), t, font=f or font(15, 500), fill=c)
def frame(im, x, y, c=(120, 110, 95)):
    sheet.paste(im, (x, y)); d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=c, width=1)
def num(x, y, n):
    d.ellipse((x - 14, y - 14, x + 14, y + 14), fill=(255, 255, 255), outline=MARK, width=3)
    t = str(n); tw = d.textlength(t, font=font(16)); d.text((x - tw / 2, y - 11), t, font=font(16), fill=MARK)
def box(x, y, b, k=0.5):
    d.rectangle((x + b[0] * k, y + b[1] * k, x + b[2] * k, y + b[3] * k), outline=MARK, width=3)
def para(x, y, w, t, f=None, c=INK, lh=24):
    f = f or font(16, 500); line = ''
    for wd in t.split():
        s = (line + ' ' + wd).strip()
        if d.textlength(s, font=f) > w: d.text((x, y), line, font=f, fill=c); y += lh; line = wd
        else: line = s
    d.text((x, y), line, font=f, fill=c); return y + lh

d.text((40, 22), 'Experiencia y nivel: cómo se ven en el juego', font=font(32), fill=INK)
y = 70
for t in ('Capturas reales de la versión candidata (4a125e0), en los 3 tamaños: escritorio 1440×900, móvil 390×844 y móvil apaisado 844×390. Ya está construido.',
          'Lo que se aprueba: tu panel con la insignia, el nivel y la barra de experiencia; el aviso al subir de nivel; el oro y la experiencia al hundir; y el rango de otro jugador en el panel del objetivo,',
          'con el icono más pequeño en el móvil apaisado (el cambio de la sección 4). Las insignias son las de hoy: si apruebas su rediseño, cambian solo los dibujos.'):
    label(40, y, t, f=font(17, 500)); y += 26

# --- 1. la pantalla entera
y = title(y + 16, '1. Tu panel: insignia del rango, nivel y barra de experiencia (en rojo, dónde está en cada tamaño)')
d1, m1, l1 = cap('C1-1440x900.png').resize((720, 450), Image.LANCZOS), half('C1-390x844.png'), half('C1-844x390.png')
frame(d1, 40, y); box(40, y, (16, 16, 312, 104))
frame(m1, 40 + 720 + 30, y); box(40 + 750, y, (0, 0, 390, 52), k=1.0)
frame(l1, 40 + 750 + 390 + 30, y); box(40 + 1170, y, (12, 12, 264, 56), k=1.0)
label(40, y + 456, 'Escritorio, a la mitad'); label(790, y + 850, 'Móvil, a tamaño real'); label(1210, y + 396, 'Apaisado, a tamaño real')
# detalles ampliados del panel, a la derecha del apaisado y debajo
dx = 1210; dy = y + 430
p1 = crop('C1-1440x900.png', (8, 8, 320, 112), 2); p2 = crop('C2-1440x900.png', (8, 8, 320, 112), 2)
frame(p1, dx, dy); frame(p2, dx, dy + p1.height + 34)
num(dx + 26, dy + 168, 1); num(dx + 470, dy + 162, 2); num(dx + 600, dy + 134, 3)
label(dx, dy + p1.height + 6, 'Escritorio, al doble: nivel 12 (arriba) y nivel 20, «Nivel máximo» (abajo)')
y2 = y + 900
m2a = crop('C1-390x844.png', (0, 0, 780, 112)); m2b = crop('C2-390x844.png', (0, 0, 780, 112)); l2 = crop('C1-844x390.png', (0, 0, 560, 130))
frame(m2a, 40, y2); frame(m2b, 40, y2 + 112 + 14); frame(l2, 40 + 780 + 30, y2)
label(40, y2 + 252, 'Móvil, al doble: nivel 12 y «Nivel máximo»'); label(850, y2 + 136, 'Apaisado, al doble')
ly = y2 + 290
for n, t in ((1, 'La insignia del rango, sobre el icono de tu barco (aquí, Contramaestre; en el nivel 20, Almirante).'),
             (2, '«Nivel 12», a la derecha de tu estado; en el nivel 20 dice «Nivel máximo». En móvil va junto a la barra de vida, y en el apaisado, en la fila del nombre.'),
             (3, 'La barra morada de experiencia, bajo la de vida: se llena hacia el nivel siguiente. Sin números: la cifra exacta («1240 / 2000 XP») sale al pasar el ratón. En móvil, una franja en el borde de la barra de arriba.')):
    num(54, ly + 10, n); ly = para(80, ly, SW - 140, t) + 6
y = ly + 20

# --- 2. al subir de nivel
y = title(y, '2. Al subir de nivel: un aviso de 5 s con tu insignia, y si cambias de rango, cuál es el nuevo')
t1 = crop('C3-1440x900.png', (530, 136, 910, 180), 2); t2 = crop('C4-1440x900.png', (530, 136, 910, 180), 2)
frame(t1, 40, y); frame(t2, 40, y + t1.height + 14)
label(40, y + 2 * t1.height + 22, 'Escritorio, al doble: «¡Nivel 12!» y «¡Nivel 9! Ahora eres Contramaestre»')
m4 = crop('C4-390x844.png', (0, 300, 780, 570)); frame(m4, 40 + 760 + 40, y)
label(840, y + m4.height + 6, 'Móvil, al doble: el aviso de nivel y, debajo, la línea del hundimiento')
l4 = crop('C4-844x390.png', (540, 104, 1160, 282)); frame(l4, 840, y + m4.height + 40)
label(840, y + m4.height + 40 + l4.height + 6, 'Apaisado, al doble')
y = max(y + 2 * t1.height + 60, y + m4.height + 40 + l4.height + 40)

# --- 3. al hundir
y = title(y, '3. Al hundir un barco: «+30 XP» flota en morado junto al oro, y el registro lo apunta')
f1 = crop('C5-1440x900.png', (590, 490, 830, 770), 2); frame(f1, 40, y)
f2 = crop('C5-1440x900.png', (0, 862, 470, 898), 2); frame(f2, 40 + f1.width + 30, y)
label(40, y + f1.height + 6, 'Escritorio, al doble, 0,4 s después del hundimiento')
label(40 + f1.width + 30, y + f2.height + 6, 'La línea del registro, al doble: el tramo de experiencia, en morado')
f3 = crop('C5-390x844.png', (200, 800, 600, 1120)); frame(f3, 40 + f1.width + 30, y + f2.height + 50)
label(40 + f1.width + 30, y + f2.height + 50 + f3.height + 6, 'Móvil, al doble: con el pirata pegado a tu barco, los números tapan tu placa un momento (ver «En contra»)')
y += max(f1.height, f2.height + 50 + f3.height) + 50

# --- 4. el objetivo
y = title(y, '4. Otro jugador como objetivo: su clase, su nivel y su rango, con la insignia delante')
o1 = crop('C6-1440x900.png', (550, 10, 890, 100), 2); frame(o1, 40, y)
label(40, y + o1.height + 6, 'Escritorio, al doble')
o2 = crop('C6-390x844.png', (24, 112, 568, 272)); frame(o2, 40 + o1.width + 30, y)
label(40 + o1.width + 30, y + o2.height + 6, 'Móvil, al doble')
y += max(o1.height, o2.height) + 44
o3 = crop('C6-844x390.png', (16, 120, 540, 276)); o4 = crop('C6-844x390-d81.png', (16, 120, 540, 276))
label(40, y, 'Apaisado, hoy: el icono mide 40 px y el rango se corta («Contramaest…»)', c=RED, f=font(16)); frame(o3, 40, y + 26)
label(40 + o3.width + 40, y, 'Apaisado, con el cambio propuesto: icono de 28 px, como en móvil; cabe entero', c=INK, f=font(16)); frame(o4, 40 + o3.width + 40, y + 26)
y += 26 + o3.height + 20
y = para(40, y, SW - 80, 'El cambio (D81) es una sola regla de estilo: en el móvil apaisado, el icono del objetivo pasa de 40 a 28 px, el mismo tamaño que en el móvil en vertical. La captura de la derecha lo lleva aplicado sin publicar; el resto de la lámina es el juego tal cual.', c=SOFT) + 16

# --- 5. ya construido
y = title(y, '5. Ya construido y aún no enseñado: el aviso del Capitán pirata y su estrella en el minimapa')
c1 = crop('C7-1440x900.png', (530, 136, 910, 180), 2); frame(c1, 40, y)
label(40, y + c1.height + 6, 'Escritorio, al doble: el aviso, con el sector, cuando aparece el Capitán')
c2 = crop('C7-390x844.png', (0, 392, 780, 490)); frame(c2, 40, y + c1.height + 40)
label(40, y + c1.height + 40 + c2.height + 6, 'Móvil, al doble')
mm = cap('C8-1440x900-dpr2-minimapa.png'); frame(mm, 40 + c2.width + 50, y)
label(40 + c2.width + 50, y + mm.height + 6, 'El minimapa, al doble: la estrella roja con halo es el Capitán; el rombo rojo, un pirata')
y += max(c1.height + 40 + c2.height + 40, mm.height + 40)

# --- textos
BLOCKS = [
    ('Cómo se tomaron las capturas', SOFT, [
        'En las capturas del panel y del aviso «¡Nivel 12!» la experiencia de partida se fijó para la foto (7000, 36 000 y 5990 XP), con un escenario de prueba sin publicar. Lo que se ve es el juego real.',
        'La del hundimiento se congeló a 0,4 s del momento en que llegan el oro y la experiencia; la del aviso de rango, a 1,8 s, ya sin números flotando.']),
    ('En contra', RED, [
        'La cifra exacta de experiencia solo sale al pasar el ratón: en móvil, hoy no hay forma de verla. La enseñará la pantalla de niveles, que va en su propia lámina.',
        'Si hundes un barco pegado al tuyo, sus números flotantes («−60», «+30 XP», «+105») tapan tu placa durante 0,9 s (lo que dura un número flotante). Pasa igual con el daño de hoy; la experiencia suma una línea más.']),
]
for t, colr, lines in BLOCKS:
    d.text((40, y), t, font=font(19), fill=TITLE if colr != RED else RED); y += 30
    for ln in lines: y = para(56, y, SW - 110, '·  ' + ln, c=colr if colr == RED else INK, lh=24) + 2
    y += 12
sheet = sheet.crop((0, 0, SW, y + 20))
out = os.path.join(RT.OUT, 'D76-panel-xp.png'); sheet.save(out, optimize=True); print('hoja', out, sheet.size)

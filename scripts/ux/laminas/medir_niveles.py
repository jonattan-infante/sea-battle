# Uso (desde la raíz del repo): python3 -I scripts/ux/laminas/medir_niveles.py  (imprime los anchos de D78)
# Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS (.next/static/media de un
# build de Next) y, si se indica abajo, el renderizador por software en UX_RENDERER. Escribe en UX_OUT, nunca en
# docs/game/art/: una lámina aprobada no se pisa; una versión nueva se copia allí a mano y con otro nombre. No corre en la CI.
# Anchos de los textos de la pantalla de niveles (AC-190) con la Barlow del juego (D75), como measure-text-with-built-fonts.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import rutas as RT
from PIL import ImageFont, features
FONT = RT.FONTS
FF = {500: 'b0bb26939bb40fdb-s.p.woff2', 600: '60c9b95e8d9e49be-s.p.woff2', 'pirata': '5027f589d2b9109f-s.p.woff2'}
assert features.check('raqm')
def w(t, px, wt=500, tnum=True):
    f = ImageFont.truetype(FONT + FF[wt], px, layout_engine=ImageFont.Layout.RAQM)
    return f.getlength(t, features=['tnum'] if tnum else None)
LEVEL_XP = [0, 60, 150, 300, 500, 800, 1200, 1700, 2400, 3300, 4500, 6000, 8000, 10500, 13500, 17000, 21000, 25500, 30500, 36000]
RANKS = [('Grumete', 1), ('Marinero', 5), ('Contramaestre', 9), ('Teniente', 13), ('Almirante', 17)]
def es(n): return f'{n:,}'.replace(',', '.') if n >= 10000 else str(n)
def rank(lv): return [r for r, f in RANKS if f <= lv][-1]
def mx(items, px, wt): return max((w(t, px, wt), t) for t in items)
names = [f'{rank(l)} · Nivel {l}' for l in range(1, 21)]
print('nombre 18/600', mx(names, 18, 600), '· 16/600', mx(names, 16, 600))
print('XP total 14/600', mx([f'{es(x)} XP' for x in (36000, 9999999, 21000)], 14, 600), '· 13/600', mx([f'{es(9999999)} XP'], 13, 600))
inl = [f'{es(x - LEVEL_XP[l - 1] - 1 if False else LEVEL_XP[l] - LEVEL_XP[l - 1] - 1)} / {es(LEVEL_XP[l] - LEVEL_XP[l - 1])} XP' for l in range(1, 20)] + ['Nivel máximo']
print('barra 13/500', mx(inl, 13, 500), '· 12/500', mx(inl, 12, 500))
lv_lines, rk_lines = [], []
for xp in range(0, 36000, 1):
    pass
# peores casos: la XP mínima de cada nivel da lo que más falta
for l in range(1, 20):
    xp = LEVEL_XP[l - 1]; need = LEVEL_XP[l] - xp
    lv_lines.append(f'Te faltan {es(need)} XP para el nivel {l + 1}')
    nxt = [(r, f) for r, f in RANKS if f > l]
    if nxt: r, f = nxt[0]; rk_lines.append(f'Te faltan {es(LEVEL_XP[f - 1] - xp)} XP para {r} (nivel {f})')
for px in (14, 13):
    print(f'línea nivel {px}/500', mx(lv_lines, px, 500), f'· línea rango {px}/500', mx(rk_lines, px, 500))
print('AC-190 g:', [round(w(t, 14, 500), 1) for t in ('Te faltan 1900 XP para Contramaestre (nivel 9)', 'Te faltan 13.000 XP para Almirante (nivel 17)')], '(14 px)',
      [round(w(t, 13, 500), 1) for t in ('Te faltan 1900 XP para Contramaestre (nivel 9)', 'Te faltan 13.000 XP para Almirante (nivel 17)')], '(13 px)')
cells = [f'Te faltan {es(LEVEL_XP[l] - LEVEL_XP[l - 1])} XP' for l in range(1, 20)]
print('celda nivel 15/600', mx([f'Nivel {l}' for l in range(1, 21)], 15, 600), '· XP 13/500', mx([f'{es(x)} XP' for x in LEVEL_XP], 13, 500))
print('celda estado 12/600', mx(cells + ['Estás aquí'], 12, 600), '· desbloqueo 12/600', mx(['Goleta', 'Navío de línea'], 12, 600))
print('grupo 15/600', mx([r for r, _ in RANKS], 15, 600), '· rango 12/500', mx([f'Niveles {f}–{f + 3}' for _, f in RANKS], 12, 500))
print('título pirata 28', round(w('Niveles e insignias', 28, 'pirata', False), 1), '· 24', round(w('Niveles e insignias', 24, 'pirata', False), 1), '· 22', round(w('Niveles e insignias', 22, 'pirata', False), 1))
print('mismo grupo 1 línea móvil 15/600 + 12/500', round(w('Contramaestre', 15, 600) + 8 + w('Niveles 13–16', 12, 500), 1))

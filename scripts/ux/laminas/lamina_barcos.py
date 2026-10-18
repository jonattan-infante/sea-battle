# Uso (desde la raíz del repo):
#   1. La geometría sale del código del juego con la receta de la lámina, en un árbol aparte (no toca este):
#        git worktree add --detach /tmp/sb-lamina 4b4c688        # feat/ac-151-xp-hud, la base de D64
#        patch -d /tmp/sb-lamina -p1 < scripts/ux/laminas/code/ship-geometry-lamina.patch   # 2 franjas de portas
#        cp scripts/ux/laminas/code/export-*.ts /tmp/sb-lamina/ && ln -s "$PWD/node_modules" /tmp/sb-lamina/node_modules
#        (cd /tmp/sb-lamina && npx tsx export-barcos.ts "$UX_OUT/barcos-geo.json")
#   2. python3 -I scripts/ux/laminas/lamina_barcos.py  →  $UX_OUT/D64-barcos.png
# Reproduce docs/game/art/D64-barcos.png (sha256 8afa371b…). Usa el renderizador (UX_RENDERER).
# Depende de (rutas.py, cambiables por variables de entorno): las fuentes del juego en UX_FONTS (.next/static/media de un
# build de Next) y, si se indica abajo, el renderizador por software en UX_RENDERER. Escribe en UX_OUT, nunca en
# docs/game/art/: una lámina aprobada no se pisa; una versión nueva se copia allí a mano y con otro nombre. No corre en la CI.
# Lámina de los barcos del jugador de la 1.1 (para Jonattan): perfil, planta y vista del juego, a la misma escala.
# Render por software de ART-DIRECTION §5 (qa-artifacts/render/d40-modelo/model.py, solo lectura) sobre la geometría de
# export-barcos.ts: el código de dev-render (4b4c688) para Balandra, Bergantín y Fragata, y ASSET-SPEC §8.4 para los nuevos.
import sys, os, json, math, importlib.util
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import rutas as RT
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image, ImageDraw, ImageFont
spec = importlib.util.spec_from_file_location('model', RT.need(RT.RENDERER, 'el renderizador por software'))
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
HERE = os.path.dirname(os.path.abspath(__file__))
geo = json.load(open(RT.need(os.path.join(RT.OUT, 'barcos-geo.json'), 'barcos-geo.json (code/export-barcos.ts)')))
FONT = RT.FONTS
def font(px, w=600): return ImageFont.truetype(FONT + ({500: 'b0bb26939bb40fdb-s.p.woff2', 600: '60c9b95e8d9e49be-s.p.woff2'}[w]), px)
SEA = np.array([26, 95, 134.0]); SKY = np.array([226, 234, 239.0]); PAPER = (245, 241, 230)
INFO = {'sloop': ('Balandra', '16 × 4,4 m · la de inicio'), 'schooner': ('Goleta  (NUEVA)', '22 × 5,6 m · nivel 5 · 3000 oro'),
        'brig': ('Bergantín', '24 × 6,2 m'), 'frigate': ('Fragata', '34 × 8,6 m'), 'line': ('Navío de línea  (NUEVO)', '42 × 11,2 m · nivel 9 · 12.000 oro')}
ORDER = ['sloop', 'schooner', 'brig', 'frigate', 'line']
PPM = 6.0
def shot(gid, th_deg, heading, W, H, ox, oy, bg, water_line=None):
    M.TH = math.radians(th_deg)
    col, cov = M.render(geo[gid], heading, PPM, W, H, ox, oy, SS=4)
    if water_line is None:
        return M.composite(col, cov, np.broadcast_to(bg, (H, W, 3)))
    back = np.empty((H, W, 3)); back[:water_line] = SKY; back[water_line:] = SEA
    img = M.composite(col, cov, back)
    a = 0.55  # la obra viva, vista a través del agua
    img[water_line:] = img[water_line:] * (1 - a) + SEA * a * cov[water_line:, :, None] + img[water_line:] * a * (1 - cov[water_line:, :, None])
    return img
W, HP, HT, HG = 370, 262, 112, 236
sheet = Image.new('RGB', (80 + 5 * W + 4 * 16, 1030), PAPER); d = ImageDraw.Draw(sheet)
d.text((40, 22), 'Barcos del jugador de la 1.1: la Goleta y el Navío de línea junto a los de hoy', font=font(30), fill=(43, 29, 14))
d.text((40, 62), 'Todo a la misma escala (6 px por metro, casi el tamaño real del juego en escritorio). Render por software con la luz del juego, a partir de ASSET-SPEC; los barcos nuevos aún no existen en el juego.', font=font(16, 500), fill=(92, 74, 51))
rows = [('De lado (vista de tres cuartos, proa a la derecha)', HP), ('Desde arriba', HT), ('Como en el juego (cámara a 55°, rumbo 135°)', HG)]
y0 = 110
for title, h in rows:
    d.text((40, y0), title, font=font(18), fill=(107, 58, 26)); y0 += 30 + h + 18
for i, gid in enumerate(ORDER):
    x = 40 + i * (W + 16); y = 110 + 30
    side = shot(gid, 0, 56, W, HP, W // 2 - 10, HP - 34, None, water_line=HP - 34)
    sheet.paste(Image.fromarray(side.astype(np.uint8)), (x, y)); y += HP + 18 + 30
    top = shot(gid, 90, 90, W, HT, W // 2 - 20, HT // 2, SEA)
    sheet.paste(Image.fromarray(top.astype(np.uint8)), (x, y)); y += HT + 18 + 30
    game = shot(gid, 55, 135, W, HG, W // 2 - 10, HG - 70, SEA)
    sheet.paste(Image.fromarray(game.astype(np.uint8)), (x, y)); y += HG + 14
    name, sub = INFO[gid]
    d.text((x, y), name, font=font(20), fill=(43, 29, 14)); d.text((x, y + 28), sub, font=font(15, 500), fill=(92, 74, 51))
    print(gid, 'listo', flush=True)
d.text((40, 1000), 'Rasgos que los separan (ART-DIRECTION §9.2, AD-37): la Goleta, 2 palos con cangrejas y casco bajo sin castillos; el Navío, 3 palos, mesana latina y 2 franjas de portas con 5 + 5 cañones al tresbolillo.', font=font(15, 500), fill=(92, 74, 51))
out = os.path.join(RT.OUT, 'D64-barcos.png'); sheet.save(out); print('hoja', os.path.abspath(out), sheet.size)

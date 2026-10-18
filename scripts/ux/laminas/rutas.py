# Rutas compartidas de las láminas de ux (scripts/ux/laminas) y de la cadena del barco piloto (scripts/ux/barcos).
# Las láminas son la fuente de las imágenes de docs/game/art/ y se lanzan a mano desde la raíz del repo; ninguna corre en
# la CI. Sus dependencias de fuera del repo se cambian con variables de entorno:
#   UX_RENDERER  renderizador por software de D40 (qa-artifacts/render/d40-modelo/model.py del árbol principal, sin versionar)
#   UX_FONTS     carpeta con las fuentes del juego tal como las sirve Next (.next/static/media de un build); los nombres
#                con hash de FF son los del build de dev-render del 2026-10-18 y cambian si cambia next/font
#   UX_CAPTURAS  carpeta con las capturas de qa:capture que hacen de fondo (desktop-open-sea.png, mobile-open-sea.png)
#   UX_OUT       carpeta de salida y de los datos intermedios (por defecto, $TMPDIR/sea-battle-laminas)
# Por defecto buscan los árboles hermanos de esta máquina (sea-battle y sea-battle-dev-render junto a este repo).
# Nunca escriben en docs/game/art/: una lámina aprobada no se pisa, y una versión nueva se copia allí a mano con otro nombre.
import os, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
_SIB = os.path.dirname(REPO)
RENDERER = os.environ.get('UX_RENDERER', os.path.join(_SIB, 'sea-battle', 'qa-artifacts', 'render', 'd40-modelo', 'model.py'))
FONTS = os.path.join(os.environ.get('UX_FONTS', os.path.join(_SIB, 'sea-battle-dev-render', '.next', 'static', 'media')), '')
CAPTURAS = os.environ.get('UX_CAPTURAS', os.path.join(_SIB, 'sea-battle-dev-render', 'qa-artifacts'))
OUT = os.environ.get('UX_OUT', os.path.join(tempfile.gettempdir(), 'sea-battle-laminas'))
os.makedirs(OUT, exist_ok=True)
FF = {500: 'b0bb26939bb40fdb-s.p.woff2', 600: '60c9b95e8d9e49be-s.p.woff2', 'pirata': '5027f589d2b9109f-s.p.woff2'}


def need(path, what):
    """Devuelve la ruta si existe; si no, sale con un mensaje que dice qué falta y dónde configurarlo."""
    if not os.path.exists(path):
        raise SystemExit(f'falta {what}: {path} (ver la cabecera de scripts/ux/laminas/rutas.py)')
    return path

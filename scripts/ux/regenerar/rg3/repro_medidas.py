# ux · AC-192 (f), punto 2 (BACKLOG :348), para las clases de D95, que aún no tienen entrega: las medidas de la lámina
# regenerada (<clase>-medidas.json de lamina_clase.py) frente a lo que su commit dejó escrito en ASSET-SPEC, cada cifra con
# su ruta:línea en el archivo de lo esperado. Triángulos y caja del casco son condición; los bytes (claves que acaban en
# _B) solo se anotan, sin cota. Imprime «REPRO <clase> <clave> <valor> frente a <esperado> IGUAL|DISTINTO (condición|se
# anota) · <fuente>» y acaba con «REPRO <clase> CONDICIONES CUMPLE|NO CUMPLE»; sale con 0 o con 2.
# Uso: python3 -I repro_medidas.py <clase>-medidas.json <esperado.json>
# esperado.json: {"clase": …, "esperado": [[ruta/en/el/json, valor, fuente], …]}; un valor en cadena se compara con sus
# decimales; un entero, igual
import sys, json

med, want = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])); cls = want['clase']; bad = []
for k, w, src in want['esperado']:
    g = med
    for part in k.split('/'): g = g.get(part) if isinstance(g, dict) else None
    if isinstance(w, str) and isinstance(g, (int, float)):
        nd = len(w.split('.')[1]) if '.' in w else 0; shown = f'{float(g):.{nd}f}'; ok = shown == w
    else: shown, ok = g, g == w
    nota = k.endswith('_B')
    extra = f' ({g - w:+d})' if not ok and isinstance(g, int) and isinstance(w, int) and not isinstance(g, bool) else ''
    print('REPRO', cls, k, shown, 'frente a', w, ('IGUAL' if ok else 'DISTINTO' + extra), '(se anota, sin cota)' if nota else '(condición)', '·', src)
    if not ok and not nota: bad.append(k)
print('REPRO', cls, 'CONDICIONES', 'CUMPLE' if not bad else f'NO CUMPLE ({", ".join(bad)})')
sys.exit(2 if bad else 0)

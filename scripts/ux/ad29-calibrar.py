# Calibración del modelo de AD-29 (ad29py.py) contra el canvas 2D de Chromium de D63 (calibracion/d63-chromium-w24.json).
# Uso: python3 -I scripts/ux/ad29py.py 24 1,2 > /tmp/base.json && python3 -I scripts/ux/ad29-calibrar.py /tmp/base.json
# Esperado (2026-10-17): DPR 1, cruce máximo 0,741 frente a 0,738 y propia mínima 0,968 frente a 0,966; por par, −0,051…+0,006.
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
a = json.load(open(sys.argv[1])); b = json.load(open(os.path.join(here, 'calibracion', 'd63-chromium-w24.json')))
for d in a:
    eo = [a[d]['own'][k] - v for k, v in b[d]['own'].items()]
    ec = []
    for k, v in b[d]['cross'].items():
        pv = a[d]['cross'].get(k)
        if pv is None:
            A, B = k.split('|'); pv = a[d]['cross'].get(B + '|' + A)
        ec.append(pv - v)
    mxa = max(v for k, v in a[d]['cross'].items() if k in b[d]['cross'] or '|'.join(k.split('|')[::-1]) in b[d]['cross']); mxb = max(b[d]['cross'].values())
    print(f"DPR {d}: propia d [{min(eo):+.3f},{max(eo):+.3f}] cruce d [{min(ec):+.3f},{max(ec):+.3f}] media {sum(ec)/len(ec):+.3f} | cruce máx python {mxa:.3f} chromium {mxb:.3f} | propia mín python {min(a[d]['own'][k] for k in b[d]['own']):.3f} chromium {min(b[d]['own'].values()):.3f}")

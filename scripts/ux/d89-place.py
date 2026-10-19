# D89 (E13, ART-DIRECTION §12.8): el fixture de src/client/__tests__/edge-chips.test.ts, calibracion/d89-place.json.
# Llama a place() de la lámina de la vista libre tal como está en el commit FUENTE (r11 87b7488, el 2.º commit de
# scripts/ux/laminas/lamina_vista_libre.py tras 1d296e6), no a la copia de trabajo: extrae scripts/ux de ese commit con
# git archive a una carpeta temporal y la importa sin ejecutar build() (va bajo __main__). Escribe:
#   screens    las 6 pantallas de la lámina, con los mismos argumentos que les pasa build();
#   unsettled  casos sintéticos (semilla 89, como mucho 2000 intentos y 20 s) en los que el lado de la distancia no
#              converge en 3 vueltas: el triángulo de la última vuelta pide el otro lado y place() deja la distancia en el
#              que reservó su caja (desde 87b7488; en 1d296e6 devolvía el lado de la vuelta siguiente con la caja de esta).
# Cada caso lleva el labelW que midió place() con la Barlow 600 de un build de Next (tienda.tw), así que el test de TS no
# depende de las fuentes; el woff2 y su sha256 van en el JSON. El ancho real de la pastilla lo mide el e2e.
# Uso: python3 -I scripts/ux/d89-place.py [--escribir-json]. UX_FONTS: la carpeta .next/static/media de un build (por
# defecto, la de sea-battle-dev-render junto a este repo; ver rutas.py). No corre en la CI.
import sys, os, json, math, random, time, hashlib, shutil, subprocess, tempfile
sys.dont_write_bytecode = True  # sin __pycache__ en el repo

FUENTE = '87b7488'
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'calibracion', 'd89-place.json')

tmp = tempfile.mkdtemp(prefix='d89-place-')
try:
    tar = subprocess.run(['git', '-C', REPO, 'archive', FUENTE, 'scripts/ux'], check=True, capture_output=True).stdout
    subprocess.run(['tar', '-x', '-C', tmp], input=tar, check=True)
    os.environ.setdefault('UX_FONTS', os.path.join(os.path.dirname(REPO), 'sea-battle-dev-render', '.next', 'static', 'media'))
    os.environ['UX_OUT'] = os.path.join(tmp, 'out')
    sys.path.insert(0, os.path.join(tmp, 'scripts', 'ux', 'laminas'))
    import rutas as RT
    import lamina_vista_libre as V

    font = RT.need(RT.FONTS + RT.FF[600], 'la Barlow 600 (UX_FONTS)')
    letra = dict(archivo=RT.FF[600], peso=600, sha256=hashlib.sha256(open(font, 'rb').read()).hexdigest())

    def row(vw, vh, frame, blocks, origin, target, kind, size, dist, r):
        return dict(vw=vw, vh=vh, frame=list(frame), size=size, kind=kind, blocks=[list(b) for b in blocks.values()],
                    origin=list(origin), target=list(target), dist=dist, labelW=V.label_w(dist), p=list(r['p']),
                    naive=list(r['naive']), travel=r['travel'], side=r['side'], ang=r['ang'], box=list(r['box']))

    CASES = [('desk', 'libre', (150, -60)), ('desk', 'ataque', (0, 80)), ('mob', 'libre', (80, 110)),
             ('mob', 'ataque', (75, -28)), ('lan', 'libre', (170, 40)), ('lan', 'ataque', (0, -80))]
    SC = {'desk': V.DESK, 'mob': V.MOB, 'lan': V.LAN}
    screens = []
    for name, mode, off in CASES:
        sc = SC[name]; blocks = dict(sc['blocks'])
        if mode == 'libre': blocks['Centrar'] = sc['centrar']
        dist = round(math.hypot(*off)); target = V.screen(sc, *off); origin = (sc['vw'] / 2, sc['vh'] / 2)
        # place() solo distingue kind == 'self'; cualquier otro nombre es el rombo del atacante
        r = V.place(sc['vw'], sc['vh'], sc['frame'], blocks, origin, target, 'self' if mode == 'libre' else 'anchor', sc['size'], dist)
        kind = 'self' if mode == 'libre' else 'attacker'
        screens.append(dict(scene=name, mode=mode, dCenter=r['d_center'], **row(sc['vw'], sc['vh'], sc['frame'], blocks, origin, target, kind, sc['size'], dist, r)))

    # Sin converger: el triángulo de la posición final pide el otro lado (el bucle de place() acabó por la 3.ª vuelta, no
    # por asentarse). La caja siempre reserva los 18 px de la pastilla en el lado que devuelve: si no, FUENTE es anterior
    # a 87b7488 y el script se para
    side_of = lambda ang: 'above' if 45 <= math.degrees(ang) <= 135 else 'below'
    rng = random.Random(89); unsettled = []; tries = 0; t0 = time.time()
    while len(unsettled) < 3 and tries < 2000 and time.time() - t0 < 20:
        tries += 1
        vw, vh = rng.choice([(1440, 900), (390, 844), (844, 390)]); frame = (16, 16, 16, 16); origin = (vw / 2, vh / 2)
        kind = rng.choice(['self', 'anchor']); size = rng.choice(['desk', 'touch']); dist = rng.randint(40, 999)
        a = math.radians(rng.choice([45, 135, -45, -135]) + rng.uniform(-12, 12)); R = rng.uniform(1.2, 3) * max(vw, vh)
        target = (origin[0] + R * math.cos(a), origin[1] + R * math.sin(a))
        blocks = {}
        for i in range(rng.randint(1, 3)):
            w, h = rng.uniform(20, 160), rng.uniform(20, 160)
            cx = rng.choice([rng.uniform(0, vw), rng.choice([0, vw])]); cy = rng.choice([0, vh]) if cx not in (0, vw) else rng.uniform(0, vh)
            blocks['B%d' % i] = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
        try:
            r = V.place(vw, vh, frame, blocks, origin, target, kind, size, dist)
        except TypeError:  # sin ninguna posición libre en todo el borde, place() no tiene `hit`
            continue
        top = r['p'][1] - r['box'][1]
        if abs(top - (r['h'] + (18 if r['side'] == 'above' else 0))) > 1e-9:
            sys.exit('place() de %s deja la distancia de un lado y la reserva de su caja del otro (intento %d)' % (FUENTE, tries))
        if side_of(r['ang']) != r['side']:
            unsettled.append(row(vw, vh, frame, blocks, origin, target, 'self' if kind == 'self' else 'attacker', size, dist, r))
    print('%d pantallas · %d sin converger en %d intentos, %.1f s · %s %s' % (len(screens), len(unsettled), tries, time.time() - t0, letra['archivo'], letra['sha256'][:12]))
    for c in screens: print('  %s %s: deslizado %.1f px, distancia %s, %d m' % (c['scene'], c['mode'], c['travel'], c['side'], c['dist']))

    data = dict(fuente='r11 %s:scripts/ux/laminas/lamina_vista_libre.py, place()' % FUENTE, letra=letra,
                nota='Generado por scripts/ux/d89-place.py; lo lee src/client/__tests__/edge-chips.test.ts',
                screens=screens, unsettled=unsettled)
    if '--escribir-json' in sys.argv:
        with open(OUT, 'w') as f: json.dump(data, f, indent=1, ensure_ascii=False); f.write('\n')
        print('escrito', OUT)
finally:
    shutil.rmtree(tmp, ignore_errors=True)

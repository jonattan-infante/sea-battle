#!/usr/bin/env python3
# CI (job e2e de ci.yml): el repo es público y sus artefactos también. Con Clerk de desarrollo, las trazas, los blobs y el
# HTML de Playwright pueden llevar cookies y tokens de sesión (__session*, __clerk_db_jwt, el handshake, JWT eyJ…). Este
# script los tapa y comprueba que no queda ninguno antes de subir nada:
#   python3 scripts/ci/redact_clerk.py stream < log        tapa una salida línea a línea (la de playwright test)
#   python3 scripts/ci/redact_clerk.py redact <ruta>...    tapa en el sitio archivos y carpetas, también dentro de zips
#   python3 scripts/ci/redact_clerk.py check <ruta>...     sale con 1 si queda alguno; dice dónde, nunca el valor
# Entra en los zips anidados (la traza dentro del blob) y en el zip en base64 que el HTML de Playwright lleva dentro
import base64, io, os, re, sys, zipfile

NAMES = rb'(?:__session|__clerk_db_jwt|__clerk_handshake|__clerk_ticket|__clerk_testing_token|__client|__refresh)[A-Za-z0-9_-]*'
TAPADO = b'REDACTED'
# (patrón, sustitución): valor de ≥ 10 caracteres tras «nombre=» (cookie, Set-Cookie, query) y en los objetos de cookie
# de las trazas, JWT, dev browser de Clerk y claves secretas. Los valores de prueba cortos (dvb_e2e) no son de sesión
PATTERNS = [
    (re.compile(rb'(' + NAMES + rb')(=|%3D)(?!' + TAPADO + rb')[^;&\s"\'\\,<>]{10,}'), rb'\1\2' + TAPADO),
    (re.compile(rb'("name"\s*:\s*"' + NAMES + rb'"\s*,\s*"value"\s*:\s*")(?!' + TAPADO + rb')[^"]{10,}"'), rb'\1' + TAPADO + b'"'),
    (re.compile(rb'("value"\s*:\s*")(?!' + TAPADO + rb')[^"]{10,}("\s*,\s*"name"\s*:\s*"' + NAMES + rb'")'), rb'\1' + TAPADO + rb'\2'),
    (re.compile(rb'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?'), b'[JWT-' + TAPADO + b']'),
    (re.compile(rb'dvb_[A-Za-z0-9]{16,}'), b'dvb_' + TAPADO),
    (re.compile(rb'sk_(?:test|live)_[A-Za-z0-9]{16,}'), b'sk_' + TAPADO),
]
IMAGE_MAGIC = (b'\x89PNG', b'\xff\xd8\xff', b'\x1a\x45\xdf\xa3', b'RIFF', b'GIF8')
EMBEDDED_ZIP = re.compile(rb'(data:application/zip;base64,)([A-Za-z0-9+/=]+)')


def redact_text(data: bytes) -> bytes:
    for pattern, repl in PATTERNS:
        data = pattern.sub(repl, data)
    return data


def findings_in_text(data: bytes) -> int:
    return sum(len(pattern.findall(data)) for pattern, _ in PATTERNS)


def is_zip(data: bytes) -> bool:
    return data[:4] == b'PK\x03\x04'


def redact_bytes(data: bytes) -> bytes:
    if is_zip(data):
        return redact_zip(data)
    if data.startswith(IMAGE_MAGIC):
        return data  # las imágenes no se tocan; check las revisa igual
    data = EMBEDDED_ZIP.sub(lambda m: m.group(1) + base64.b64encode(redact_zip(base64.b64decode(m.group(2)))), data)
    return redact_text(data)


def redact_zip(data: bytes) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(out, 'w') as dst:
        for info in src.infolist():
            dst.writestr(info, redact_bytes(src.read(info)), compress_type=info.compress_type)
    return out.getvalue()


# [(dónde, cuántos)]: el nombre del miembro dentro de los zips, nunca el valor encontrado
def findings(data: bytes, where: str) -> list:
    if is_zip(data):
        found = []
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for info in z.infolist():
                found += findings(z.read(info), f'{where}!{info.filename}')
        return found
    found = []
    for i, m in enumerate(EMBEDDED_ZIP.finditer(data)):
        found += findings(base64.b64decode(m.group(2)), f'{where}!base64[{i}]')
    n = findings_in_text(data)
    return found + ([(where, n)] if n else [])


def files(paths):
    for p in paths:
        if os.path.isfile(p):
            yield p
        for root, _, names in os.walk(p):
            for name in sorted(names):
                yield os.path.join(root, name)


def main(argv) -> int:
    if len(argv) < 2 or argv[1] not in ('stream', 'redact', 'check'):
        print(__doc__ or 'uso: redact_clerk.py stream | redact <ruta>... | check <ruta>...', file=sys.stderr)
        return 2
    if argv[1] == 'stream':
        out = sys.stdout.buffer
        for line in sys.stdin.buffer:
            out.write(redact_text(line))
            out.flush()
        return 0
    changed = checked = 0
    found = []
    for path in files(argv[2:]):
        with open(path, 'rb') as f:
            data = f.read()
        checked += 1
        if argv[1] == 'redact':
            new = redact_bytes(data)
            if new != data:
                changed += 1
                with open(path, 'wb') as f:
                    f.write(new)
        else:
            found += findings(data, path)
    if argv[1] == 'redact':
        print(f'redact: {checked} archivos revisados, {changed} tapados')
        return 0
    for where, n in found:
        print(f'check: {n} valor(es) de sesión o clave en {where}')
    print(f'check: {checked} archivos revisados, {len(found)} con valores sin tapar')
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))

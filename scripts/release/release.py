#!/usr/bin/env python3
# DT-16: datos del tag y de la release de GitHub que crea el job de prod tras desplegar (.github/workflows/ci.yml).
#   version             la versión de package.json (1.0.2)
#   tag-status <ver>    con la salida de `git ls-remote --tags origin` en la entrada: «exists» si v<ver> ya existe, si no «missing»
#   notes <ver>         la sección de esa versión del CHANGELOG.md, sin su título; sale con 1 si no existe o está vacía
import json, os, re, sys

sys.dont_write_bytecode = True  # sin __pycache__ en el árbol
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
VERSION = re.compile(r'^\d+\.\d+\.\d+\Z')


def tag_for(version):
    if not VERSION.match(version):
        raise SystemExit(f'La versión de package.json no es X.Y.Z: {version!r}')
    return f'v{version}'


def tag_exists(ls_remote, version):
    """¿Está refs/tags/v<version> en la salida de `git ls-remote --tags`? Solo esa ref exacta: ni v1.0.10 para v1.0.1 ni
    la línea ^{} de un tag anotado cuentan como otro tag."""
    ref = f'refs/tags/{tag_for(version)}'
    return any(line.split('\t')[-1].strip() == ref for line in ls_remote.splitlines() if '\t' in line)


def changelog_section(changelog, version):
    """El cuerpo de «## [<version>] …» hasta el siguiente «## [», sin el título y sin líneas en blanco en los extremos."""
    lines = changelog.splitlines()
    head = re.compile(r'^## \[' + re.escape(version) + r'\](\s|$)')
    start = next((i for i, l in enumerate(lines) if head.match(l)), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith('## [')), len(lines))
    body = '\n'.join(lines[start + 1:end]).strip()
    return body or None


def main(argv):
    if argv[:1] == ['version'] and len(argv) == 1:
        version = json.load(open(os.path.join(ROOT, 'package.json'), encoding='utf-8'))['version']
        tag_for(version)
        print(version)
    elif argv[:1] == ['tag-status'] and len(argv) == 2:
        print('exists' if tag_exists(sys.stdin.read(), argv[1]) else 'missing')
    elif argv[:1] == ['notes'] and len(argv) == 2:
        body = changelog_section(open(os.path.join(ROOT, 'CHANGELOG.md'), encoding='utf-8').read(), argv[1])
        if body is None:
            raise SystemExit(f'CHANGELOG.md no tiene la sección «## [{argv[1]}]» o está vacía')
        print(body)
    else:
        raise SystemExit('Uso: release.py version | tag-status <versión> (con git ls-remote --tags en la entrada) | notes <versión>')


if __name__ == '__main__':
    main(sys.argv[1:])

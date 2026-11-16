#!/usr/bin/env python3
# AC-231: comprueba, después del deploy, cómo arrancó el servidor, solo con lo que da /healthz en la URL pública (lo pide
# curl en el job; este script lee su respuesta). Sin token ni API del proveedor: lo del proveedor (el deploy de
# scripts/railway/ y check_deploy.py) queda aislado. Falla (sale con 1) en 3 casos:
#   1. `commit` no es el SHA desplegado;
#   2. `migrationsApplied` no es el esperado: [] salvo que el PR de la versión declare una migración (--migrations);
#   3. `schemaVersion` no es la mayor de MIGRATIONS en ese commit (server/db/migrate.ts de ese commit, --migrate-ts).
# También falla si la respuesta no es la del servidor (no es JSON o no trae ok: true).
#
# Uso en el job:  curl … "$URL/healthz" > healthz.json
#                 python3 -B scripts/ci/check_healthz.py --commit "$SHA" --migrations '[]' --migrate-ts migrate.ts < healthz.json
# Solo la versión del esquema (la usa server/__tests__/ci-workflow.test.ts para comprobar que coincide con MIGRATIONS):
#                 python3 -B scripts/ci/check_healthz.py --schema-version --migrate-ts server/db/migrate.ts
import argparse
import json
import re
import sys


def schema_version(migrate_ts):
    """La versión mayor de la lista MIGRATIONS de server/db/migrate.ts (el texto del archivo)."""
    start = migrate_ts.find('export const MIGRATIONS')
    if start < 0:
        raise ValueError('server/db/migrate.ts no tiene «export const MIGRATIONS»')
    end = migrate_ts.find('\n];', start)
    if end < 0:
        raise ValueError('no se encuentra el final de MIGRATIONS («];» al principio de una línea)')
    versions = [int(v) for v in re.findall(r'^\s*version:\s*(\d+)\s*,', migrate_ts[start:end], re.M)]
    if not versions:
        raise ValueError('MIGRATIONS no tiene ninguna versión')
    return max(versions)


def parse_migrations(raw):
    """La lista esperada de --migrations: JSON, una lista de enteros (p. ej. '[]' o '[2]')."""
    value = json.loads(raw)
    if not isinstance(value, list) or not all(isinstance(v, int) and not isinstance(v, bool) for v in value):
        raise ValueError(f'--migrations tiene que ser una lista JSON de enteros, no {raw!r}')
    return value


def check(body, commit, migrations, version):
    """Los fallos de la respuesta de /healthz (texto) frente a lo esperado; [] si cuadra."""
    try:
        data = json.loads(body)
    except ValueError:
        return [f'/healthz no da JSON: {body[:120]!r}']
    if not isinstance(data, dict) or data.get('ok') is not True:
        return ['/healthz no es la respuesta del servidor (falta ok: true)']
    errors = []
    if data.get('commit') != commit:
        errors.append(f"commit es {data.get('commit')!r}, no el desplegado {commit!r}")
    if data.get('migrationsApplied') != migrations:
        errors.append(f"migrationsApplied es {json.dumps(data.get('migrationsApplied'))}, no el esperado {json.dumps(migrations)}")
    if data.get('schemaVersion') != version:
        errors.append(f"schemaVersion es {json.dumps(data.get('schemaVersion'))}, no la mayor de MIGRATIONS ({version})")
    return errors


def main(argv=None):
    ap = argparse.ArgumentParser(description='AC-231: comprueba por /healthz cómo arrancó el servidor desplegado')
    ap.add_argument('--migrate-ts', required=True, help='server/db/migrate.ts del commit desplegado')
    ap.add_argument('--schema-version', action='store_true', help='solo escribe la versión mayor de MIGRATIONS')
    ap.add_argument('--commit', help='el SHA desplegado')
    ap.add_argument('--migrations', default='[]', help="las migraciones que tiene que aplicar el arranque, en JSON (por defecto '[]')")
    args = ap.parse_args(argv)
    with open(args.migrate_ts, encoding='utf-8') as f:
        version = schema_version(f.read())
    if args.schema_version:
        print(version)
        return 0
    if not args.commit:
        ap.error('falta --commit')
    migrations = parse_migrations(args.migrations)
    body = sys.stdin.read()
    errors = check(body, args.commit, migrations, version)
    try:
        data = json.loads(body)
        if isinstance(data, dict):
            fields = {k: data.get(k) for k in ('commit', 'startedAt', 'migrationsApplied', 'schemaVersion')}
            print(f'/healthz: {json.dumps(fields)}')
    except ValueError:
        pass
    print(f'Esperado: commit {args.commit}, migrationsApplied {json.dumps(migrations)}, schemaVersion {version}')
    for e in errors:
        print(f'::error::AC-231: {e}')
    if errors:
        return 1
    print('AC-231: el despliegue arrancó con el commit, las migraciones y el esquema esperados')
    return 0


if __name__ == '__main__':
    sys.exit(main())

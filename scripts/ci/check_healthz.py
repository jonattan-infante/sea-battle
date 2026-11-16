#!/usr/bin/env python3
# AC-231: comprueba, después del deploy, cómo arrancó el servidor, solo con lo que da /healthz en la URL pública (lo pide
# curl en el job; este script lee su respuesta). Sin token ni API del proveedor: lo del proveedor (el deploy de
# scripts/railway/ y check_deploy.py) queda aislado. Falla (sale con 1) en 3 casos:
#   1. `commit` no es el SHA desplegado;
#   2. `migrationsApplied` no es el esperado: [] salvo que el PR de la versión declare una migración (--migrations).
#      Precisado por producto el 2026-11-16 (AC-231 f): un PR con una migración se despliega varias veces en staging, y
#      solo el 1.er deploy la aplica. Por eso, en staging vale también [] si `schemaVersion` ya es la mayor de MIGRATIONS
#      (las declaradas ya estaban aplicadas). En prod la comprobación es exacta en el 1.er intento del job, y en un re-run
#      del mismo SHA (--attempt > 1) vale la regla de staging: la migración pudo aplicarla el 1.er intento. Si el 1.er
#      intento de prod da [] con el esquema esperado, el mensaje lo dice: la BD de prod se migró fuera de su deploy;
#   3. `schemaVersion` no es la mayor de MIGRATIONS en ese commit (server/db/migrate.ts de ese commit, --migrate-ts). Esto
#      no se relaja nunca: tampoco en staging con una BD que lleva la migración de otro PR que este commit no tiene.
# También falla si la respuesta no es la del servidor (no es JSON o no trae ok: true).
#
# Uso en el job:  curl … "$URL/healthz" > healthz.json
#                 python3 -B scripts/ci/check_healthz.py --commit "$SHA" --migrations '[]' --env staging --attempt "$RUN_ATTEMPT" \
#                   --migrate-ts migrate.ts < healthz.json
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


def lenient_mode(env, attempt):
    """¿Vale [] con el esquema esperado aunque se declaren migraciones? En staging siempre; en prod, solo en un re-run."""
    return env == 'staging' or attempt > 1


def already_applied(data, migrations, version):
    """El arranque no aplicó nada porque las migraciones declaradas ya estaban: [] con el esquema esperado."""
    return migrations != [] and data.get('migrationsApplied') == [] and data.get('schemaVersion') == version


def check(body, commit, migrations, version, lenient=False):
    """Los fallos de la respuesta de /healthz (texto) frente a lo esperado; [] si cuadra. `lenient`: la regla de staging
    y de un re-run de prod (lenient_mode)."""
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
        if not already_applied(data, migrations, version):
            errors.append(f"migrationsApplied es {json.dumps(data.get('migrationsApplied'))}, no el esperado {json.dumps(migrations)}")
        elif not lenient:
            errors.append(
                f'migrationsApplied es [], no el esperado {json.dumps(migrations)}: las migraciones declaradas ya estaban aplicadas antes '
                'de este arranque (schemaVersion ya es la mayor de MIGRATIONS). En un 1.er deploy de prod, eso significa que la BD de '
                'prod se migró fuera de su deploy'
            )
    if data.get('schemaVersion') != version:
        errors.append(f"schemaVersion es {json.dumps(data.get('schemaVersion'))}, no la mayor de MIGRATIONS ({version})")
    return errors


def positive_int(raw):
    value = int(raw)
    if value < 1:
        raise argparse.ArgumentTypeError(f'tiene que ser un entero ≥ 1, no {raw!r}')
    return value


def main(argv=None):
    ap = argparse.ArgumentParser(description='AC-231: comprueba por /healthz cómo arrancó el servidor desplegado')
    ap.add_argument('--migrate-ts', required=True, help='server/db/migrate.ts del commit desplegado')
    ap.add_argument('--schema-version', action='store_true', help='solo escribe la versión mayor de MIGRATIONS')
    ap.add_argument('--commit', help='el SHA desplegado')
    ap.add_argument('--migrations', default='[]', help="las migraciones que tiene que aplicar el arranque, en JSON (por defecto '[]')")
    ap.add_argument('--env', choices=('staging', 'production'), help='el entorno del job (la regla de las migraciones)')
    ap.add_argument('--attempt', type=positive_int, default=1, help='github.run_attempt: > 1 es un re-run del mismo SHA')
    args = ap.parse_args(argv)
    with open(args.migrate_ts, encoding='utf-8') as f:
        version = schema_version(f.read())
    if args.schema_version:
        print(version)
        return 0
    if not args.commit or not args.env:
        ap.error('faltan --commit o --env')
    migrations = parse_migrations(args.migrations)
    lenient = lenient_mode(args.env, args.attempt)
    body = sys.stdin.read()
    errors = check(body, args.commit, migrations, version, lenient)
    try:
        data = json.loads(body)
        if isinstance(data, dict):
            fields = {k: data.get(k) for k in ('commit', 'startedAt', 'migrationsApplied', 'schemaVersion')}
            print(f'/healthz: {json.dumps(fields)}')
    except ValueError:
        pass
    print(f'Esperado ({args.env}, intento {args.attempt}): commit {args.commit}, migrationsApplied {json.dumps(migrations)}'
          f'{" (o [] si ya estaban aplicadas)" if lenient and migrations else ""}, schemaVersion {version}')
    try:
        if lenient and not errors and already_applied(json.loads(body), migrations, version):
            print(f'AC-231: las migraciones declaradas {json.dumps(migrations)} ya estaban aplicadas antes de este arranque '
                  f'(schemaVersion {version}); vale en {"staging" if args.env == "staging" else "un re-run de prod"}')
    except ValueError:
        pass
    for e in errors:
        print(f'::error::AC-231: {e}')
    if errors:
        return 1
    print('AC-231: el despliegue arrancó con el commit, las migraciones y el esquema esperados')
    return 0


if __name__ == '__main__':
    sys.exit(main())

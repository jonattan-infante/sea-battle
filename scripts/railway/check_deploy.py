#!/usr/bin/env python3
# Comprueba, en solo lectura, la configuración de despliegue del servicio en Railway (DT-13; paso de variables de
# AC-139). Railway no aplica railway.json a este servicio (creado después del 2026-08-28, y Config as Code deja de leerse
# el 2026-12-01): los 5 valores viven en los ajustes y variables del servicio de cada entorno, y aquí se comparan con lo
# que necesita el servidor:
#   arranque     node dist/server/index.js (ajuste Start Command): el SIGTERM le llega a node, sin npm en medio
#   healthcheck  /healthz (ajuste Healthcheck Path): sin un 2xx no se enruta al despliegue nuevo
#   réplicas     1 (ajuste Replicas): un solo mundo y un solo escritor por userId
#   solape       RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0: el viejo recibe el SIGTERM al empezar el relevo
#   drenaje      RAILWAY_DEPLOYMENT_DRAINING_SECONDS ≥ plazo del apagado + 2 s (SHUTDOWN_FLUSH_MS, server/shutdown.ts)
# Del último despliegue mira además el paso HEALTHCHECK, el arranque del plan de Railpack y, si relevó a otro, cuándo
# recibió el viejo el SIGTERM y cuánto duró el relevo (con 15 s de drenaje, DRAIN_INSTANCES dura ~15 s). Y, solo por el
# nombre, que exista DATABASE_URL (sin ella el servidor no arranca en Railway) y que las redirecciones de Clerk usen los
# nombres nuevos y no los obsoletos (DT-11, punto 5).
# Uso: python3 scripts/railway/check_deploy.py [--env staging|production] [--deployment <prefijo del id>]
# Sale con 1 si algo no coincide. Token: RAILWAY_TOKEN (de proyecto, el de GitHub Actions), RAILWAY_API_TOKEN o el de
# `railway login` (railway_api.py).
import argparse, json, os, re, sys
from datetime import datetime

sys.dont_write_bytecode = True  # sin __pycache__ en el árbol
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from railway_api import gql, mask, resolve

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
START = 'node dist/server/index.js'
HEALTH = '/healthz'
TUNING = re.compile(r'^RAILWAY_(DEPLOYMENT_(OVERLAP|DRAINING)_SECONDS|HEALTHCHECK_TIMEOUT_SEC)$')
# DT-11 (5): Clerk da por obsoletas las AFTER_* (la consola avisa de `afterSignInUrl`); van las FALLBACK_REDIRECT_URL
CLERK_REDIRECTS = ('NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL', 'NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL')
CLERK_DEPRECATED = ('NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL', 'NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL')


def clerk_redirects(variables):
    """Los nombres nuevos de las redirecciones de Clerk están y los obsoletos no. Solo mira los nombres, nunca los valores."""
    missing = [n for n in CLERK_REDIRECTS if n not in variables]
    stale = [n for n in CLERK_DEPRECATED if n in variables]
    if not missing and not stale:
        return True, 'los dos FALLBACK_REDIRECT_URL, sin los AFTER_* obsoletos'
    problems = ([f"faltan {', '.join(missing)}"] if missing else []) + ([f"sobran {', '.join(stale)} (obsoletas)"] if stale else [])
    return False, ' · '.join(problems)


def start_check(setting, manifest_start, banner):
    """Arranque: el ajuste y el manifest dicen START y, si el build trae el banner de Railpack, su plan también. H-27
    (QA-13 §5): hay builds sin banner en sus logs (el de prod de la 1.0.0); entonces el plan no se puede comprobar y no
    cuenta como FALLA, pero un banner con otro plan (p. ej. npm start) sí."""
    plan = re.findall(r'Deploy\s+─+\s+\$ ([^\n]+)', banner) if banner else None
    ok = setting == START and manifest_start == START and (plan is None or plan == [START])
    shown = 'no comprobable (el build no trae el banner en sus logs)' if plan is None else plan
    return ok, f'ajuste {setting!r} · manifest {manifest_start!r} · plan de Railpack {shown}'


def flush_seconds():
    source = open(os.path.join(ROOT, 'server', 'shutdown.ts'), encoding='utf-8').read()
    m = re.search(r'SHUTDOWN_FLUSH_MS\s*=\s*([\d_]+)', source)
    if not m:
        raise SystemExit('No encuentro SHUTDOWN_FLUSH_MS en server/shutdown.ts')
    return int(m.group(1).replace('_', '')) / 1000


def ts(s):
    s = s.replace('Z', '')
    if '.' in s:
        a, b = s.split('.')
        s = a + '.' + b[:6]
    return datetime.fromisoformat(s)


def deployments(ids, first=10):
    d = gql('query($projectId:String!,$environmentId:String!,$serviceId:String!,$first:Int){ deployments(first:$first, input:{projectId:$projectId, environmentId:$environmentId, serviceId:$serviceId}) { edges { node { id status createdAt statusUpdatedAt meta } } } }', {**ids, 'first': first})
    return [e['node'] for e in d['deployments']['edges']]


def logs(dep_id, kind):
    return gql('query($id:String!){ %s(deploymentId:$id, limit:2000){ message timestamp } }' % kind, {'id': dep_id})[kind]


def main():
    ap = argparse.ArgumentParser(description='Configuración de despliegue en Railway, en solo lectura')
    ap.add_argument('--env', default='staging')
    ap.add_argument('--project', default='sea-battle')
    ap.add_argument('--service', default='sea-battle')
    ap.add_argument('--deployment', help='prefijo del id del despliegue que se mira (por defecto, el último activo)')
    args = ap.parse_args()

    ids = resolve(args.project, args.env, args.service)
    checks = []

    def check(name, ok, detail):
        checks.append(ok)
        print(f"  {'OK   ' if ok else 'FALLA'} {name}: {detail}")

    si = gql('query($environmentId:String!,$serviceId:String!){ serviceInstance(environmentId:$environmentId, serviceId:$serviceId){ startCommand healthcheckPath healthcheckTimeout numReplicas railwayConfigFile } }', {'environmentId': ids['environmentId'], 'serviceId': ids['serviceId']})['serviceInstance']
    variables = gql('query($projectId:String!,$environmentId:String!,$serviceId:String!){ variables(projectId:$projectId, environmentId:$environmentId, serviceId:$serviceId, unrendered:true) }', ids)['variables']
    tuning = {k: variables[k] for k in variables if TUNING.match(k)}  # solo estos valores: el resto puede ser secreto
    deps = deployments(ids)
    if args.deployment:
        dep = next((d for d in deps if d['id'].startswith(args.deployment)), None)
        if not dep:
            raise SystemExit(f'No hay un despliegue reciente que empiece por {args.deployment}')
    else:
        dep = next((d for d in deps if d['status'] == 'SUCCESS'), None)
        if not dep:
            raise SystemExit('No hay ningún despliegue activo (SUCCESS) entre los últimos 10')
    manifest = (dep['meta'].get('serviceManifest') or {}).get('deploy') or {}
    ev = gql('query($id:String!){ deploymentEvents(id:$id, first:50){ edges { node { step createdAt completedAt } } } }', {'id': dep['id']})
    steps = {e['node']['step']: e['node'] for e in ev['deploymentEvents']['edges']}
    banner = next((re.sub(r'\x1b\[[0-9;]*m', '', l['message']) for l in logs(dep['id'], 'buildLogs') if 'Railpack' in l['message']), '')

    print(f"Railway · {args.project}/{args.service} · entorno {args.env}")
    print(f"  ajustes: {json.dumps(si)}")
    print(f"  variables de relevo: {json.dumps(tuning)}")
    print(f"  despliegue {mask(dep['id'])} ({(dep['meta'].get('commitHash') or '')[:7]}, {dep['status']}): pasos {[s for s in steps]}")
    print(f"  manifest del despliegue: {json.dumps({k: manifest.get(k) for k in ('startCommand', 'healthcheckPath', 'healthcheckTimeout', 'numReplicas', 'multiRegionConfig')})}")

    replicas = sum((r or {}).get('numReplicas') or 0 for r in (manifest.get('multiRegionConfig') or {}).values()) or manifest.get('numReplicas')
    flush = flush_seconds()
    check('arranque', *start_check(si['startCommand'], manifest.get('startCommand'), banner))
    check('healthcheck', si['healthcheckPath'] == HEALTH and manifest.get('healthcheckPath') == HEALTH and 'HEALTHCHECK' in steps,
          f"ajuste {si['healthcheckPath']!r} · manifest {manifest.get('healthcheckPath')!r} · paso HEALTHCHECK {'sí' if 'HEALTHCHECK' in steps else 'no'}")
    check('réplicas', replicas == 1, f'{replicas} (manifest)')
    check('solape', tuning.get('RAILWAY_DEPLOYMENT_OVERLAP_SECONDS') == '0', f"RAILWAY_DEPLOYMENT_OVERLAP_SECONDS={tuning.get('RAILWAY_DEPLOYMENT_OVERLAP_SECONDS')!r}")
    draining = tuning.get('RAILWAY_DEPLOYMENT_DRAINING_SECONDS')
    check('drenaje', bool(draining and draining.isdigit() and int(draining) >= flush + 2),
          f'RAILWAY_DEPLOYMENT_DRAINING_SECONDS={draining!r} (≥ {flush:g} s del apagado + 2 s)')
    check('DATABASE_URL', 'DATABASE_URL' in variables, 'definida' if 'DATABASE_URL' in variables else 'no existe: el servidor sale con exit 1 en Railway')
    check('redirecciones de Clerk', *clerk_redirects(variables))

    # Relevo: el despliegue anterior al mirado, si ya lo retiró
    older = [d for d in deps if ts(d['createdAt']) < ts(dep['createdAt'])]
    if older and 'DRAIN_INSTANCES' in steps:
        prev = older[0]
        prev_logs = logs(prev['id'], 'deploymentLogs')
        # La línea de la plataforma era «Stopping Container» sin drenaje configurado y es «sending signal SIGTERM to container» con él
        stop = next((l['timestamp'] for l in prev_logs if re.match(r'(Stopping Container|sending signal SIGTERM to container)', l['message'])), None)
        drain = steps['DRAIN_INSTANCES']
        parts = []
        if drain.get('completedAt'):
            parts.append(f"DRAIN_INSTANCES dura {max(0.0, (ts(drain['completedAt']) - ts(drain['createdAt'])).total_seconds()):.1f} s")
        if stop:
            s = ts(stop)
            parts.append(f"DRAIN_INSTANCES → SIGTERM al viejo {(s - ts(drain['createdAt'])).total_seconds():.1f} s")
            if prev['status'] == 'REMOVED':
                parts.append(f"SIGTERM → viejo REMOVED {(ts(prev['statusUpdatedAt']) - s).total_seconds():.1f} s")
        print(f"  relevo {mask(prev['id'])} → {mask(dep['id'])}: " + ' · '.join(parts))
        print(f"  apagado del viejo: {shutdown_timeline(prev_logs, stop)}")
    sys.exit(0 if all(checks) else 1)


# Las líneas del apagado (server/shutdown.ts) llevan la hora del propio proceso, porque los sellos de Railway llegan en lote:
# «🛑 SIGTERM: … <iso>», «💾 Progreso guardado <iso> (+N ms)» (o el aviso de que no se pudo) y «🔌 Sockets cerrados <iso> (+N ms)».
# De ahí salen los tramos de H-25: señal de la plataforma → 🛑 (la señal llega a node), 🛑 → 💾 (la escritura) y 🛑 → 🔌
def shutdown_timeline(lines, platform_signal):
    iso = r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)'
    found = {}
    for l in lines:
        msg = l['message']
        for key, pattern in (('🛑', r'🛑 SIGTERM: guardando el progreso antes de cerrar ' + iso), ('💾', r'💾 Progreso guardado ' + iso + r' \(\+(\d+) ms\)'),
                             ('⚠️', r'El progreso no se pudo guardar en \d+ ms ' + iso + r' \(\+(\d+) ms\)'), ('🔌', r'🔌 Sockets cerrados ' + iso + r' \(\+(\d+) ms\)')):
            m = re.search(pattern, msg)
            if m and key not in found:
                found[key] = m.groups()
    if '🛑' not in found:
        return 'sin la hora propia del proceso (build anterior a los logs con hora): solo hay sellos en lote'
    parts = [f"🛑 {found['🛑'][0]}"]
    if platform_signal:
        parts.append(f"señal de la plataforma → 🛑 {(ts(found['🛑'][0]) - ts(platform_signal)).total_seconds() * 1000:.0f} ms")
    if '💾' in found:
        parts.append(f"🛑 → 💾 {found['💾'][1]} ms")
    if '⚠️' in found:
        parts.append(f"🛑 → aviso de escritura fallida {found['⚠️'][1]} ms")
    if '🔌' in found:
        parts.append(f"🛑 → 🔌 {found['🔌'][1]} ms")
    return ' · '.join(parts)


if __name__ == '__main__':
    main()

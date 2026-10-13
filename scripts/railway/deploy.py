#!/usr/bin/env python3
# DT-16: despliega un commit en Railway (el repo de GitHub conectado al servicio) y espera a que quede activo. Pasos:
#   1. serviceInstanceDeployV2 con ese commitSha, en el entorno del token (railway_api.resolve lo comprueba);
#   2. el estado del despliegue hasta SUCCESS, con plazo; FAILED, CRASHED, REMOVED, SKIPPED o NEEDS_APPROVAL lo paran;
#   3. /healthz hasta que su `commit` (RAILWAY_GIT_COMMIT_SHA, server/health.ts) sea ese SHA, con plazo.
# Si el healthcheck del despliegue nuevo falla, Railway no le pasa el tráfico y sigue el anterior (TECH-ARCHITECTURE §2.1).
# Uso: python3 scripts/railway/deploy.py --env staging|production --sha <40 hex> --url https://… [--timeout s] [--health-timeout s]
# Sale con 1 si algo falla. Token: RAILWAY_TOKEN (de proyecto) en GitHub Actions; nunca se imprime (railway_api.py).
import argparse, json, os, re, sys, time, urllib.error, urllib.request

sys.dont_write_bytecode = True  # sin __pycache__ en el árbol
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from railway_api import deploy, gql, mask, resolve

OK = {'SUCCESS'}
FAILED = {'FAILED', 'CRASHED', 'REMOVED', 'REMOVING', 'SKIPPED', 'SLEEPING', 'NEEDS_APPROVAL'}  # NEEDS_APPROVAL esperaría a una persona
PENDING = {'QUEUED', 'WAITING', 'INITIALIZING', 'BUILDING', 'DEPLOYING'}
SHA = re.compile(r'^[0-9a-f]{40}\Z')  # \Z y no $: $ admite un salto de línea al final


def classify(status):
    """'ok', 'failed' o 'pending'; un estado que no conocemos cuenta como pendiente hasta el plazo."""
    if status in OK:
        return 'ok'
    if status in FAILED:
        return 'failed'
    return 'pending'


def health_commit(body):
    """El commit que dice /healthz, o None si la respuesta no es la del servidor."""
    try:
        data = json.loads(body)
    except ValueError:
        return None
    return data.get('commit') if isinstance(data, dict) and data.get('ok') is True else None


def fetch_health(url):
    try:
        req = urllib.request.Request(url.rstrip('/') + '/healthz', headers={'Cache-Control': 'no-store', 'User-Agent': 'sea-battle-deploy'})
        return urllib.request.urlopen(req, timeout=10).read().decode()
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return f'error: {e}'


def wait_deployment(dep_id, sha, timeout, every=10):
    start, last = time.monotonic(), None
    while True:
        node = gql('query($id:String!){ deployment(id:$id){ status meta } }', {'id': dep_id})['deployment']
        status = node['status']
        if status != last:
            print(f'  {time.monotonic() - start:6.0f} s  {status}', flush=True)
            last = status
        verdict = classify(status)
        if verdict == 'ok':
            commit = (node.get('meta') or {}).get('commitHash')
            if commit and commit != sha:
                raise SystemExit(f'El despliegue {mask(dep_id)} quedó activo con el commit {commit[:12]}, no con {sha[:12]}')
            return
        if verdict == 'failed':
            raise SystemExit(f'El despliegue {mask(dep_id)} terminó en {status}: Railway mantiene el anterior si no pasó el healthcheck')
        if time.monotonic() - start > timeout:
            raise SystemExit(f'El despliegue {mask(dep_id)} sigue en {status} tras {timeout} s')
        time.sleep(every)


def wait_health(url, sha, timeout, every=5):
    start, seen = time.monotonic(), None
    while True:
        commit = health_commit(fetch_health(url))
        if commit != seen:
            print(f'  {time.monotonic() - start:6.0f} s  /healthz commit {commit}', flush=True)
            seen = commit
        if commit == sha:
            return
        if time.monotonic() - start > timeout:
            raise SystemExit(f'{url}/healthz no da el commit {sha[:12]} tras {timeout} s (da {seen})')
        time.sleep(every)


def main():
    ap = argparse.ArgumentParser(description='Despliega un commit en Railway y espera a que quede activo (DT-16)')
    ap.add_argument('--env', required=True)
    ap.add_argument('--sha', required=True)
    ap.add_argument('--url', required=True, help='origen público del entorno, p. ej. https://sea-battle-staging.up.railway.app')
    ap.add_argument('--project', default='sea-battle')
    ap.add_argument('--service', default='sea-battle')
    ap.add_argument('--timeout', type=int, default=1200, help='plazo del build y el despliegue, en segundos')
    ap.add_argument('--health-timeout', type=int, default=180, help='plazo para que /healthz dé el commit, en segundos')
    args = ap.parse_args()
    if not SHA.match(args.sha):
        raise SystemExit(f'--sha tiene que ser un SHA completo de 40 caracteres hexadecimales en minúsculas (es {args.sha!r})')

    ids = resolve(args.project, args.env, args.service)
    print(f'Railway · {args.project}/{args.service} · entorno {args.env} · commit {args.sha[:12]}', flush=True)
    dep_id = deploy(ids, args.sha)
    if not dep_id:
        raise SystemExit('serviceInstanceDeployV2 no devolvió el id del despliegue')
    print(f'Despliegue {mask(dep_id)}:', flush=True)
    wait_deployment(dep_id, args.sha, args.timeout)
    print(f'{args.url}/healthz:', flush=True)
    wait_health(args.url, args.sha, args.health_timeout)
    print(f'OK: {args.env} sirve {args.sha[:12]} (despliegue {mask(dep_id)})')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
# DT-16: prueba de solo lectura del token de proyecto antes de desplegar (primer paso de los jobs de despliegue). Exige
# RAILWAY_TOKEN, comprueba que es del entorno pedido (projectToken + railway_api.resolve) y que puede leer los
# despliegues del servicio (deployments) y el estado de uno (deployment{status}). Nunca imprime el token; los ids salen
# acortados. Sale con 1 (y el job se para antes de desplegar) si algo falla.
# Uso: RAILWAY_TOKEN=… python3 scripts/railway/token_check.py --env staging|production
import argparse, os, sys

sys.dont_write_bytecode = True  # sin __pycache__ en el árbol
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import railway_api
from railway_api import gql, mask, resolve


def require_project_token(env=os.environ):
    if railway_api.auth(env)[0] != 'project':
        raise SystemExit('Falta RAILWAY_TOKEN (token de proyecto del entorno): sin él no se despliega')


def main():
    ap = argparse.ArgumentParser(description='Prueba de solo lectura del token de proyecto de Railway (DT-16)')
    ap.add_argument('--env', required=True)
    ap.add_argument('--project', default='sea-battle')
    ap.add_argument('--service', default='sea-battle')
    args = ap.parse_args()
    require_project_token()
    ids = resolve(args.project, args.env, args.service)
    print(f"projectToken: entorno {args.env} · proyecto {mask(ids['projectId'])} · entorno {mask(ids['environmentId'])} · servicio {mask(ids['serviceId'])}")
    deps = gql('query($p:String!,$e:String!,$s:String!){ deployments(first:1, input:{projectId:$p, environmentId:$e, serviceId:$s}) { edges { node { id status } } } }',
               {'p': ids['projectId'], 'e': ids['environmentId'], 's': ids['serviceId']})['deployments']['edges']
    if not deps:
        print('deployments: ninguno todavía (se puede leer)')
        return
    last = deps[0]['node']
    status = gql('query($id:String!){ deployment(id:$id){ status } }', {'id': last['id']})['deployment']['status']
    print(f"deployments: el último es {mask(last['id'])} · deployment{{status}}: {status}")


if __name__ == '__main__':
    main()

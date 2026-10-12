#!/usr/bin/env python3
# Consulta GraphQL de solo lectura a Railway, para investigar lo que check_deploy.py no cubre (eventos, logs, manifest).
# Si la consulta usa $projectId, $environmentId o $serviceId, se rellenan con los del entorno pedido. La salida acorta los
# UUID y nunca lleva el token; las mutaciones se rechazan (railway_api.py).
# Uso: python3 scripts/railway/query.py [--env staging] '<consulta>' ['<variables JSON>']
# Ejemplo: python3 scripts/railway/query.py --env staging \
#   'query($environmentId:String!,$serviceId:String!){ serviceInstance(environmentId:$environmentId, serviceId:$serviceId){ startCommand healthcheckPath } }'
import argparse, json, os, sys

sys.dont_write_bytecode = True  # sin __pycache__ en el árbol
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from railway_api import gql, mask, resolve

ap = argparse.ArgumentParser(description='Consulta GraphQL de solo lectura a Railway')
ap.add_argument('--env', default='staging')
ap.add_argument('--project', default='sea-battle')
ap.add_argument('--service', default='sea-battle')
ap.add_argument('query')
ap.add_argument('variables', nargs='?', default='{}')
args = ap.parse_args()

variables = json.loads(args.variables)
if any(f'${k}' in args.query for k in ('projectId', 'environmentId', 'serviceId')):
    ids = resolve(args.project, args.env, args.service)
    variables = {**{k: v for k, v in ids.items() if f'${k}' in args.query}, **variables}
print(mask(json.dumps(gql(args.query, variables), indent=1, ensure_ascii=False)))

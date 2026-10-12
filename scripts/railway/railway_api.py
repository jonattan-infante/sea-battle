# Cliente de solo lectura de la API GraphQL de Railway (DT-13, AC-139). Usa el token de la CLI (`railway login`, en
# ~/.railway/config.json) o RAILWAY_API_TOKEN, nunca lo imprime y rechaza mutaciones y suscripciones. mask() acorta los
# UUID a sus 8 primeros caracteres para que la salida se pueda pegar en un informe.
import json, os, re, urllib.error, urllib.request

API = 'https://backboard.railway.com/graphql/v2'
UUID = re.compile(r'\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b')


def _token():
    if os.environ.get('RAILWAY_API_TOKEN'):
        return os.environ['RAILWAY_API_TOKEN']
    path = os.path.expanduser('~/.railway/config.json')
    try:
        user = json.load(open(path))['user']
    except (OSError, KeyError, ValueError):
        raise SystemExit(f'Sin token de Railway: haz `railway login` (lee {path}) o define RAILWAY_API_TOKEN')
    token = user.get('accessToken') or user.get('token')
    if not token:
        raise SystemExit(f'Sin token de Railway en {path}: haz `railway login`')
    return token


_TOKEN = _token()


def mask(text):
    return UUID.sub(r'\1…', text.replace(_TOKEN, '<token>'))


def gql(query, variables=None):
    if re.search(r'\b(mutation|subscription)\b', query):
        raise SystemExit('Solo lectura: este arnés no envía mutaciones ni suscripciones')
    req = urllib.request.Request(
        API,
        data=json.dumps({'query': query, 'variables': variables or {}}).encode(),
        headers={'Authorization': f'Bearer {_TOKEN}', 'Content-Type': 'application/json', 'User-Agent': 'sea-battle-railway-readonly'},
    )
    try:
        body = urllib.request.urlopen(req, timeout=60).read().decode()
    except urllib.error.HTTPError as e:
        body = e.read().decode()
    data = json.loads(body)
    if data.get('errors'):
        raise SystemExit('Error de la API de Railway: ' + mask(json.dumps(data['errors'], ensure_ascii=False))[:800])
    return data['data']


def resolve(project='sea-battle', environment='staging', service='sea-battle'):
    """Ids del proyecto, el entorno y el servicio a partir de sus nombres."""
    data = gql('{ me { workspaces { projects { edges { node { id name environments { edges { node { id name } } } services { edges { node { id name } } } } } } } } }')
    for ws in data['me']['workspaces']:
        for p in ws['projects']['edges']:
            p = p['node']
            if p['name'] != project:
                continue
            envs = {e['node']['name']: e['node']['id'] for e in p['environments']['edges']}
            svcs = {s['node']['name']: s['node']['id'] for s in p['services']['edges']}
            if environment not in envs or service not in svcs:
                raise SystemExit(f'No existe el entorno «{environment}» o el servicio «{service}» en {project}: entornos {sorted(envs)}, servicios {sorted(svcs)}')
            return {'projectId': p['id'], 'environmentId': envs[environment], 'serviceId': svcs[service]}
    raise SystemExit(f'No encuentro el proyecto «{project}» con este token')

# Cliente de la API GraphQL de Railway (DT-13, AC-139, DT-16). Token, por este orden:
#   RAILWAY_TOKEN       token de proyecto (DT-16, el de GitHub Actions): cabecera Project-Access-Token, atado a un entorno
#   RAILWAY_API_TOKEN   token de cuenta: Authorization: Bearer
#   ~/.railway/config.json, el de `railway login`
# Nunca lo imprime. gql() rechaza mutaciones y suscripciones; la única escritura es deploy(), que solo envía
# serviceInstanceDeployV2. mask() acorta los UUID a sus 8 primeros caracteres para que la salida se pueda pegar en un informe.
import json, os, re, urllib.error, urllib.request

API = 'https://backboard.railway.com/graphql/v2'
UUID = re.compile(r'\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b')
DEPLOY = 'mutation($serviceId:String!,$environmentId:String!,$commitSha:String){ serviceInstanceDeployV2(serviceId:$serviceId, environmentId:$environmentId, commitSha:$commitSha) }'

_auth = None


def auth(env=os.environ):
    """(tipo, cabeceras): 'project' con un token de proyecto; 'account' con uno de cuenta o con el de la CLI."""
    if env.get('RAILWAY_TOKEN'):
        return 'project', {'Project-Access-Token': env['RAILWAY_TOKEN']}
    if env.get('RAILWAY_API_TOKEN'):
        return 'account', {'Authorization': f"Bearer {env['RAILWAY_API_TOKEN']}"}
    path = os.path.expanduser('~/.railway/config.json')
    try:
        user = json.load(open(path))['user']
    except (OSError, KeyError, ValueError):
        raise SystemExit(f'Sin token de Railway: define RAILWAY_TOKEN (de proyecto) o RAILWAY_API_TOKEN, o haz `railway login` (lee {path})')
    token = user.get('accessToken') or user.get('token')
    if not token:
        raise SystemExit(f'Sin token de Railway en {path}: haz `railway login`')
    return 'account', {'Authorization': f'Bearer {token}'}


def _credentials():
    global _auth
    if _auth is None:
        _auth = auth()
    return _auth


def mask(text):
    secret = next(iter(_credentials()[1].values())).split(' ', 1)[-1]
    return UUID.sub(r'\1…', text.replace(secret, '<token>'))


def _post(query, variables):
    req = urllib.request.Request(
        API,
        data=json.dumps({'query': query, 'variables': variables or {}}).encode(),
        headers={**_credentials()[1], 'Content-Type': 'application/json', 'User-Agent': 'sea-battle-railway'},
    )
    try:
        body = urllib.request.urlopen(req, timeout=60).read().decode()
    except urllib.error.HTTPError as e:
        body = e.read().decode()
    data = json.loads(body)
    if data.get('errors'):
        raise SystemExit('Error de la API de Railway: ' + mask(json.dumps(data['errors'], ensure_ascii=False))[:800])
    return data['data']


def gql(query, variables=None):
    if re.search(r'\b(mutation|subscription)\b', query):
        raise SystemExit('Solo lectura: gql() no envía mutaciones ni suscripciones (la única escritura es deploy())')
    return _post(query, variables)


def deploy(ids, commit_sha):
    """Despliega ese commit del repo conectado al servicio y devuelve el id del despliegue (DT-16)."""
    return _post(DEPLOY, {'serviceId': ids['serviceId'], 'environmentId': ids['environmentId'], 'commitSha': commit_sha})['serviceInstanceDeployV2']


def resolve(project='sea-battle', environment='staging', service='sea-battle'):
    """Ids del proyecto, el entorno y el servicio a partir de sus nombres. Con un token de proyecto, el entorno es el del
    token, y si no se llama como el pedido se para: un token de prod nunca despliega «en staging», ni al revés."""
    if _credentials()[0] == 'project':
        tok = gql('{ projectToken { projectId environmentId } }')['projectToken']
        p = gql('query($id:String!){ project(id:$id){ name environments { edges { node { id name } } } services { edges { node { id name } } } } }', {'id': tok['projectId']})['project']
        return ids_for_project_token(tok, p, project, environment, service)
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


def ids_for_project_token(token, project_data, project, environment, service):
    envs = {e['node']['id']: e['node']['name'] for e in project_data['environments']['edges']}
    svcs = {s['node']['name']: s['node']['id'] for s in project_data['services']['edges']}
    token_env = envs.get(token['environmentId'])
    if project_data['name'] != project or token_env != environment:
        raise SystemExit(f"El token de proyecto es de {project_data['name']}/{token_env}, no de {project}/{environment}")
    if service not in svcs:
        raise SystemExit(f'No hay un servicio «{service}» en {project} (servicios {sorted(svcs)})')
    return {'projectId': token['projectId'], 'environmentId': token['environmentId'], 'serviceId': svcs[service]}

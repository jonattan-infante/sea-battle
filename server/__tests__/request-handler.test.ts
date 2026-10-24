import { createServer, request, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { canonicalRedirect } from '../origins';
import { requestHandler } from '../request-handler';

// AC-139 (paso 3): con PUBLIC_ORIGINS, el dominio de Railway de prod redirige con 301 al propio; /healthz nunca
async function serve(env: Record<string, string | undefined>): Promise<HttpServer> {
  const server = createServer(
    requestHandler({
      health: () => ({ ok: true, players: 0, uptimeSeconds: 1, commit: null, i2: false }),
      redirect: canonicalRedirect(env),
      next: (_req, res) => res.writeHead(200, { 'Content-Type': 'text/plain' }).end('next')
    })
  );
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return server;
}

// http.request y no fetch: fetch no deja fijar el Host y sigue las redirecciones
function get(server: HttpServer, path: string, host: string): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ port: (server.address() as AddressInfo).port, path, headers: { host } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode!, location: res.headers.location, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('AC-139 (paso 3): redirección 301 al dominio propio', () => {
  let prod: HttpServer;
  let plain: HttpServer;

  beforeAll(async () => {
    prod = await serve({ PUBLIC_ORIGINS: 'https://seabattle.jonattan.dev' });
    plain = await serve({ RAILWAY_PUBLIC_DOMAIN: 'sea-battle-staging.up.railway.app' });
  });

  afterAll(async () => {
    await Promise.all([prod, plain].map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  });

  test('el host de Railway en /game?x=1 → 301 a https://seabattle.jonattan.dev/game?x=1', async () => {
    expect(await get(prod, '/game?x=1', 'sea-battle-production-5eba.up.railway.app')).toMatchObject({ status: 301, location: 'https://seabattle.jonattan.dev/game?x=1' });
  });

  test('/healthz con el host healthcheck.railway.app → 200, nunca se redirige', async () => {
    const r = await get(prod, '/healthz', 'healthcheck.railway.app');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ ok: true });
  });

  test('sin PUBLIC_ORIGINS no hay 301 (staging y local no cambian)', async () => {
    expect(await get(plain, '/game?x=1', 'sea-battle-production-5eba.up.railway.app')).toMatchObject({ status: 200, body: 'next' });
    expect(await get(plain, '/', 'localhost:3000')).toMatchObject({ status: 200, body: 'next' });
  });

  test.each(['seabattle.jonattan.dev', 'SeaBattle.Jonattan.dev'])('el host propio (%s) llega a Next', async (host) => {
    expect(await get(prod, '/game?x=1', host)).toMatchObject({ status: 200, body: 'next' });
  });
});

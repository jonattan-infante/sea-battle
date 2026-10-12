import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { canonicalRedirect, publicOrigins, socketServerOptions } from '../origins';

describe('PUBLIC_ORIGINS', () => {
  test('sin la variable, los de siempre: localhost con el puerto y el dominio de Railway', () => {
    expect(publicOrigins({ PORT: '3500', RAILWAY_PUBLIC_DOMAIN: 'sea-battle-staging.up.railway.app' })).toEqual(['http://localhost:3500', 'https://sea-battle-staging.up.railway.app']);
    expect(publicOrigins({})).toEqual(['http://localhost:3000']);
  });

  test('con la variable, solo los listados, normalizados como los manda el navegador (sin barra final, minúsculas, sin el puerto por defecto)', () => {
    const env = { PUBLIC_ORIGINS: ' https://SeaBattle.jonattan.dev/ ,https://sea-battle-staging.up.railway.app:443', PORT: '3500', RAILWAY_PUBLIC_DOMAIN: 'x.up.railway.app' };
    expect(publicOrigins(env)).toEqual(['https://seabattle.jonattan.dev', 'https://sea-battle-staging.up.railway.app']);
  });

  test('un valor que no es un origen falla al arrancar, no en cada conexión', () => {
    expect(() => publicOrigins({ PUBLIC_ORIGINS: 'seabattle.jonattan.dev' })).toThrow(/PUBLIC_ORIGINS/);
  });
});

// AC-134 (d): una petición de Socket.IO con otro Origin no recibe permiso de CORS, así que el navegador la bloquea
describe('AC-134 (d): CORS de Socket.IO', () => {
  let http: HttpServer;
  let io: Server;
  let base: string;

  beforeAll(async () => {
    http = createServer();
    io = new Server(http, socketServerOptions(publicOrigins({ PUBLIC_ORIGINS: 'https://seabattle.jonattan.dev' })));
    await new Promise<void>((resolve) => http.listen(0, resolve));
    base = `http://localhost:${(http.address() as AddressInfo).port}/socket.io/?EIO=4&transport=polling`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  const allowed = async (origin: string, method: 'GET' | 'OPTIONS') =>
    (await fetch(base, { method, headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } })).headers.get('access-control-allow-origin');

  test.each(['GET', 'OPTIONS'] as const)('%s desde https://seabattle.jonattan.dev: permitido', async (method) => {
    expect(await allowed('https://seabattle.jonattan.dev', method)).toBe('https://seabattle.jonattan.dev');
  });

  test.each([
    ['https://evil.example', 'GET'],
    ['https://otro.jonattan.dev', 'GET'],
    ['https://otro.jonattan.dev', 'OPTIONS'],
    ['http://localhost:3000', 'GET']
  ] as const)('%s (%s): sin permiso de CORS', async (origin, method) => {
    expect(await allowed(origin, method)).toBeNull();
  });
});

describe('AC-139 (paso 3): destino de la redirección', () => {
  const redirect = canonicalRedirect({ PUBLIC_ORIGINS: 'https://seabattle.jonattan.dev' });

  test('va al primer origen con la misma ruta y query', () => {
    expect(redirect('sea-battle-production-5eba.up.railway.app', '/game?x=1&y=%C3%B1')).toBe('https://seabattle.jonattan.dev/game?x=1&y=%C3%B1');
  });

  test('una petición en forma absoluta no saca la redirección del dominio propio', () => {
    expect(redirect('sea-battle-production-5eba.up.railway.app', 'http://evil.example/x')).toBe('https://seabattle.jonattan.dev/');
  });
});

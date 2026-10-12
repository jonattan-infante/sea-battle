import { verifyToken } from '@clerk/backend';
import { generateKeyPairSync, sign } from 'crypto';
import { isAuthBypassAllowed } from '../../src/lib/auth-bypass';
import { authenticateHandshake } from '../auth';

describe('modo invitado', () => {
  test('solo se permite con AUTH_BYPASS=1', () => {
    expect(isAuthBypassAllowed({})).toBe(false);
    expect(isAuthBypassAllowed({ AUTH_BYPASS: 'true' })).toBe(false);
    expect(isAuthBypassAllowed({ AUTH_BYPASS: '1' })).toBe(true);
  });

  test.each(['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID'])(
    'nunca se permite en Railway (%s presente)',
    (marker) => {
      expect(isAuthBypassAllowed({ AUTH_BYPASS: '1', [marker]: 'x' })).toBe(false);
    }
  );

  test('con el modo permitido, un invitado obtiene una identidad estable', async () => {
    const id = await authenticateHandshake({ guest: true, guestId: 'abc12345' }, { AUTH_BYPASS: '1' });
    expect(id).toEqual({ userId: 'guest-abc12345', guest: true });
  });

  test('sin el modo, pedir invitado exige token de Clerk', async () => {
    await expect(authenticateHandshake({ guest: true }, { CLERK_SECRET_KEY: 'sk_test_x' })).rejects.toThrow('unauthorized');
  });

  test('sin clave secreta el servidor rechaza (mal configurado)', async () => {
    await expect(authenticateHandshake({ token: 'abc' }, {})).rejects.toThrow('server misconfigured');
  });

  test('un token inválido de Clerk se rechaza', async () => {
    await expect(authenticateHandshake({ token: 'no-es-un-jwt' }, { CLERK_SECRET_KEY: 'sk_test_x' })).rejects.toThrow();
  });
});

describe('AC-09: arranque con AUTH_BYPASS en Railway', () => {
  const { authConfigError } = jest.requireActual('../../src/lib/auth-bypass') as typeof import('../../src/lib/auth-bypass');

  test('authConfigError detecta la combinación prohibida', () => {
    expect(authConfigError({})).toBeNull();
    expect(authConfigError({ AUTH_BYPASS: '1' })).toBeNull();
    expect(authConfigError({ RAILWAY_ENVIRONMENT: 'production' })).toBeNull();
    expect(authConfigError({ AUTH_BYPASS: '1', RAILWAY_PROJECT_ID: 'x' })).toMatch(/RAILWAY_PROJECT_ID/);
  });

  test('el servidor termina con código 1 y no abre el puerto', () => {
    const { spawnSync } = jest.requireActual('child_process') as typeof import('child_process');
    const port = String(40000 + Math.floor(Math.random() * 10000));
    const result = spawnSync('npx', ['tsx', 'server/index.ts'], {
      env: { ...process.env, AUTH_BYPASS: '1', RAILWAY_ENVIRONMENT: 'production', PORT: port, NODE_ENV: 'production' },
      encoding: 'utf8',
      timeout: 60_000
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('AUTH_BYPASS=1 no está permitido en Railway');
    expect(result.stdout).not.toContain('Servidor listo');
  }, 70_000);
});

describe('AC-134 (d): authorizedParties del JWT con PUBLIC_ORIGINS', () => {
  // Token de sesión firmado con una clave local; el verifyToken de Clerk es el real y solo cambia de dónde sale la
  // clave pública (jwtKey en vez de la JWKS de la instancia)
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64url');
  const sessionToken = (azp?: string) => {
    const now = Math.floor(Date.now() / 1000);
    const data = `${b64({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' })}.${b64({ sub: 'user_test', azp, iat: now - 5, nbf: now - 5, exp: now + 60 })}`;
    return `${data}.${b64(sign('RSA-SHA256', Buffer.from(data), privateKey))}`;
  };
  const localVerify: typeof verifyToken = (token, options) => verifyToken(token, { ...options, jwtKey: publicKey });
  const PROD = { CLERK_SECRET_KEY: 'sk_test_x', PUBLIC_ORIGINS: 'https://seabattle.jonattan.dev' };

  test('un token con azp listado se acepta', async () => {
    await expect(authenticateHandshake({ token: sessionToken('https://seabattle.jonattan.dev') }, PROD, localVerify)).resolves.toEqual({ userId: 'user_test', guest: false });
  });

  test.each([
    ['https://evil.example', 'otro sitio'],
    ['https://otro.jonattan.dev', 'otro subdominio de jonattan.dev, donde la sesión de Clerk también vale'],
    ['https://sea-battle-production-5eba.up.railway.app', 'el dominio de Railway, que ya no está en la lista'],
    ['http://localhost:3000', 'localhost'],
    [undefined, 'sin azp']
  ])('un token con azp %s (%s) se rechaza', async (azp, _why) => {
    await expect(authenticateHandshake({ token: sessionToken(azp) }, PROD, localVerify)).rejects.toThrow(/Authorized party claim \(azp\)/);
  });

  test('sin PUBLIC_ORIGINS valen los de siempre y nada más', async () => {
    const env = { CLERK_SECRET_KEY: 'sk_test_x', PORT: '3500', RAILWAY_PUBLIC_DOMAIN: 'sea-battle-staging.up.railway.app' };
    await expect(authenticateHandshake({ token: sessionToken('https://sea-battle-staging.up.railway.app') }, env, localVerify)).resolves.toEqual({ userId: 'user_test', guest: false });
    await expect(authenticateHandshake({ token: sessionToken('http://localhost:3500') }, env, localVerify)).resolves.toEqual({ userId: 'user_test', guest: false });
    await expect(authenticateHandshake({ token: sessionToken('https://seabattle.jonattan.dev') }, env, localVerify)).rejects.toThrow(/Authorized party claim/);
  });
});

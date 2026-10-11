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

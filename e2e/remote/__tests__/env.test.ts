// DT-08: la guarda de prod del arnés remoto falla cerrada. Sin REMOTE_ALLOW_PROD=1 solo arrancan localhost y los hosts
// de REMOTE_STAGING_HOSTS; cualquier otro host (el de Railway, el dominio propio de prod o uno nuevo) cuenta como prod
import { failureReason, isProdHost, loginMethod, prodGuard } from '../env';

const STAGING = { REMOTE_STAGING_HOSTS: 'sea-battle-staging.up.railway.app, Staging.Example.com' };

describe('guarda de prod del arnés remoto (DT-08)', () => {
  test.each(['http://localhost:3500', 'http://LOCALHOST:3500', 'http://127.0.0.1:3500', 'http://[::1]:3500', 'https://sea-battle-staging.up.railway.app', 'https://SEA-BATTLE-STAGING.up.railway.app:8443/game', 'https://staging.example.com/game'])(
    'arranca sin REMOTE_ALLOW_PROD: %s',
    (u) => {
      expect(isProdHost(new URL(u), STAGING)).toBe(false);
      expect(() => prodGuard(new URL(u), STAGING)).not.toThrow();
    }
  );

  test.each([
    ['https://sea-battle-production-5eba.up.railway.app', 'host de Railway de prod', STAGING],
    ['https://seabattle.jonattan.dev', 'el dominio propio de prod (AC-134, GDD Q13)', STAGING],
    ['https://seabattle.example.com', 'otro dominio propio', STAGING],
    ['https://SEA-BATTLE-PRODUCTION-5EBA.UP.RAILWAY.APP:8443/game', 'mayúsculas y puerto no cuelan', STAGING],
    ['https://dominio-nuevo.example.org', 'cualquier host no declarado', STAGING],
    ['https://staging.example.com.evil.net', 'un host que solo contiene el de staging', STAGING],
    ['https://sea-battle-staging.up.railway.app', 'staging sin REMOTE_STAGING_HOSTS', {}]
  ])('NO VERIFICADO sin REMOTE_ALLOW_PROD=1: %s (%s)', (u, _label, env) => {
    expect(isProdHost(new URL(u), env)).toBe(true);
    expect(() => prodGuard(new URL(u), env)).toThrow(/^REMOTE NO VERIFICADO: .*REMOTE_ALLOW_PROD=1/);
  });

  test('con REMOTE_ALLOW_PROD=1 arranca contra prod, que sigue contando como prod (AC-135 se salta el redeploy)', () => {
    const url = new URL('https://seabattle.example.com');
    expect(() => prodGuard(url, { ...STAGING, REMOTE_ALLOW_PROD: '1' })).not.toThrow();
    expect(isProdHost(url, { ...STAGING, REMOTE_ALLOW_PROD: '1' })).toBe(true);
  });
});

describe('método de inicio de sesión del arnés remoto', () => {
  test('A: externalId + clave secreta, aunque también haya usuario y contraseña', () => {
    const env = { E2E_CLERK_EXTERNAL_ID: 'sea-battle-qa', CLERK_SECRET_KEY: 'sk_test_x', E2E_REMOTE_USERNAME: 'sea-battle-qa', E2E_CLERK_PASSWORD: 'p' };
    expect(loginMethod(env)).toEqual({ kind: 'A', externalId: 'sea-battle-qa', secretKey: 'sk_test_x' });
  });

  // O-13 (a): con Q13 las cuentas no tienen correo; el identificador del método C es el nombre de usuario
  test('C: nombre de usuario + contraseña sin clave secreta', () => {
    expect(loginMethod({ E2E_REMOTE_USERNAME: 'sea-battle-qa', E2E_CLERK_PASSWORD: 'p' })).toEqual({ kind: 'C', username: 'sea-battle-qa', password: 'p' });
  });

  test.each([
    ['usuario + clave secreta (el A de antes)', { E2E_REMOTE_USERNAME: 'sea-battle-qa', CLERK_SECRET_KEY: 'sk_test_x' }],
    ['externalId sin clave secreta', { E2E_CLERK_EXTERNAL_ID: 'sea-battle-qa' }],
    // O-13 (a): el nombre viejo ya no se lee (sin alias), y el mensaje nombra la variable vigente
    ['solo el nombre viejo del método C, E2E_CLERK_EMAIL', { E2E_CLERK_EMAIL: 'sea-battle-qa', E2E_CLERK_PASSWORD: 'p' }],
    // El usuario del e2e del login (sea-battle-login-e2e) nunca es el del arnés remoto
    ['E2E_CLERK_USERNAME, la del e2e del login', { E2E_CLERK_USERNAME: 'sea-battle-login-e2e', E2E_CLERK_PASSWORD: 'p' }],
    ['sin credenciales', {}]
  ])('NO VERIFICADO: %s', (_label, env) => {
    expect(() => loginMethod(env)).toThrow(/^REMOTE NO VERIFICADO: faltan las credenciales/);
    expect(() => loginMethod(env)).toThrow(/E2E_REMOTE_USERNAME con E2E_CLERK_PASSWORD \(C\)/);
  });
});

// O-13 (b): el motivo de un login fallido nunca sale vacío. @clerk/backend, sin red, lanza un ClerkAPIResponseError con
// el mensaje vacío (el caso L3 de QA-9); otros errores pueden empezar por un salto de línea
describe('motivo de un inicio de sesión fallido', () => {
  test.each([
    ['empieza por un salto de línea', new Error('\nfetch failed\notra línea'), 'fetch failed'],
    ['líneas en blanco delante', new Error(' \n\t\n  conexión rechazada  \n'), 'conexión rechazada'],
    ['una sola línea', new Error('Timeout 15000ms exceeded.'), 'Timeout 15000ms exceeded.'],
    ['mensaje vacío: el nombre del error', Object.assign(new Error(''), { name: 'ClerkAPIResponseError' }), 'ClerkAPIResponseError'],
    // Lo que lanza @clerk/backend sin red (L3): el código y el mensaje de errors[0] distinguen la red de la clave
    ['mensaje vacío con errors[0] de Clerk', Object.assign(new Error(''), { name: 'ClerkAPIResponseError', errors: [{ code: 'unexpected_error', message: 'fetch failed' }] }), 'ClerkAPIResponseError (unexpected_error: fetch failed)'],
    ['errors[0] solo con código', Object.assign(new Error(''), { name: 'ClerkAPIResponseError', errors: [{ code: 'authentication_invalid' }] }), 'ClerkAPIResponseError (authentication_invalid)'],
    ['errors vacío', Object.assign(new Error(''), { name: 'ClerkAPIResponseError', errors: [] }), 'ClerkAPIResponseError'],
    ['con mensaje, errors[0] no hace falta', Object.assign(new Error('\nTimeout'), { errors: [{ code: 'x', message: 'y' }] }), 'Timeout'],
    ['mensaje vacío de un TypeError', new TypeError(''), 'TypeError'],
    ['solo espacios y saltos', new Error('\n  \n'), 'Error'],
    ['algo que no es un Error', '\nfalló el ticket', 'falló el ticket']
  ])('%s', (_label, e, reason) => {
    expect(failureReason(e)).toBe(reason);
  });
});

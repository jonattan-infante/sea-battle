// DT-08: la guarda de prod del arnés remoto falla cerrada. Sin REMOTE_ALLOW_PROD=1 solo arrancan localhost y los hosts
// de REMOTE_STAGING_HOSTS; cualquier otro host (el de Railway, el dominio propio de prod o uno nuevo) cuenta como prod
import { isProdHost, prodGuard } from '../env';

const STAGING = { REMOTE_STAGING_HOSTS: 'sea-battle-staging.up.railway.app, Staging.Example.com' };

describe('guarda de prod del arnés remoto (DT-08)', () => {
  test.each(['http://localhost:3500', 'http://127.0.0.1:3500', 'http://[::1]:3500', 'https://sea-battle-staging.up.railway.app', 'https://staging.example.com/game'])(
    'arranca sin REMOTE_ALLOW_PROD: %s',
    (u) => {
      expect(isProdHost(new URL(u), STAGING)).toBe(false);
      expect(() => prodGuard(new URL(u), STAGING)).not.toThrow();
    }
  );

  test.each([
    ['https://sea-battle-production-5eba.up.railway.app', 'host de Railway de prod', STAGING],
    ['https://seabattle.example.com', 'dominio propio de prod (AC-134)', STAGING],
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

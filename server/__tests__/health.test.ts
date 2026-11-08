// GET /healthz: lo leen Railway y los arneses remotos (e2e/remote), que registran qué commit midieron
import { healthPayload } from '../health';

describe('/healthz', () => {
  // AC-210 (a): sin variables de mapa ni del I2, como en staging y prod, «map»: «1.1» e «i2»: true
  test('devuelve ok, jugadores, uptime en s, el commit desplegado (RAILWAY_GIT_COMMIT_SHA) y, sin variables, el mapa 1.1 con el I2 (AC-210 a)', () => {
    expect(healthPayload(3, 1_000, 61_400, { RAILWAY_GIT_COMMIT_SHA: '434b1605c1c6' })).toEqual({
      ok: true,
      players: 3,
      uptimeSeconds: 60,
      commit: '434b1605c1c6',
      i2: true,
      map: '1.1'
    });
  });

  test('map dice el mapa del mundo: 1.0 solo con SEA_BATTLE_MAP=1.0, y 1.1 con cualquier otro valor o sin ella (AC-210 d)', () => {
    expect(healthPayload(0, 0, 0, { SEA_BATTLE_MAP: '1.0' }).map).toBe('1.0');
    for (const v of [undefined, '', '1.1', '1', '10', '1,0', '1.2', ' 1.0', '1.0 ']) expect({ v, map: healthPayload(0, 0, 0, { SEA_BATTLE_MAP: v }).map }).toEqual({ v, map: '1.1' });
  });

  test('AC-187, AC-210 (d): i2 dice si el I2 está encendido, y solo SEA_BATTLE_I2=0 lo apaga', () => {
    expect(healthPayload(0, 0, 0, { SEA_BATTLE_I2: '0' }).i2).toBe(false);
    for (const v of [undefined, '', '1', 'false', 'no', ' 0', '0 ', '00']) expect({ v, i2: healthPayload(0, 0, 0, { SEA_BATTLE_I2: v }).i2 }).toEqual({ v, i2: true });
  });

  test('sin RAILWAY_GIT_COMMIT_SHA (local o despliegue sin Git), commit es null', () => {
    expect(healthPayload(0, 0, 499, {}).commit).toBeNull();
    expect(healthPayload(0, 0, 499, { RAILWAY_GIT_COMMIT_SHA: '' }).commit).toBeNull();
  });
});

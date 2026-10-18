// GET /healthz: lo leen Railway y los arneses remotos (e2e/remote), que registran qué commit midieron
import { healthPayload } from '../health';

describe('/healthz', () => {
  test('devuelve ok, jugadores, uptime en s y el commit desplegado (RAILWAY_GIT_COMMIT_SHA)', () => {
    expect(healthPayload(3, 1_000, 61_400, { RAILWAY_GIT_COMMIT_SHA: '434b1605c1c6' })).toEqual({
      ok: true,
      players: 3,
      uptimeSeconds: 60,
      commit: '434b1605c1c6',
      i2: false,
      newShips: false
    });
  });

  test('AC-187: i2 dice si el I2 está encendido, y solo SEA_BATTLE_I2=1 lo enciende', () => {
    expect(healthPayload(0, 0, 0, { SEA_BATTLE_I2: '1' }).i2).toBe(true);
    for (const v of [undefined, '', '0', 'true', 'yes', ' 1', '1 ', '01']) expect({ v, i2: healthPayload(0, 0, 0, { SEA_BATTLE_I2: v }).i2 }).toEqual({ v, i2: false });
  });

  test('sin RAILWAY_GIT_COMMIT_SHA (local o despliegue sin Git), commit es null', () => {
    expect(healthPayload(0, 0, 499, {}).commit).toBeNull();
    expect(healthPayload(0, 0, 499, { RAILWAY_GIT_COMMIT_SHA: '' }).commit).toBeNull();
  });
});

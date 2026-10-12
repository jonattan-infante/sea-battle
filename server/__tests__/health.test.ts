// GET /healthz: lo leen Railway y los arneses remotos (e2e/remote), que registran qué commit midieron
import { healthPayload } from '../health';

describe('/healthz', () => {
  test('devuelve ok, jugadores, uptime en s y el commit desplegado (RAILWAY_GIT_COMMIT_SHA)', () => {
    expect(healthPayload(3, 1_000, 61_400, { RAILWAY_GIT_COMMIT_SHA: '434b1605c1c6' })).toEqual({
      ok: true,
      players: 3,
      uptimeSeconds: 60,
      commit: '434b1605c1c6'
    });
  });

  test('sin RAILWAY_GIT_COMMIT_SHA (local o despliegue sin Git), commit es null', () => {
    expect(healthPayload(0, 0, 499, {}).commit).toBeNull();
    expect(healthPayload(0, 0, 499, { RAILWAY_GIT_COMMIT_SHA: '' }).commit).toBeNull();
  });
});

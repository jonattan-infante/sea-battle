// GET /healthz: lo leen Railway, los arneses remotos (e2e/remote), que registran qué commit midieron, y desde la 1.3 el job
// de deploy y QA, que comprueban por él cómo arrancó el servidor sin el proveedor (AC-231)
import { Boot, healthPayload } from '../health';

const WITH_DB: Boot = { startedAt: Date.UTC(2026, 10, 16, 15, 22, 2), migrationsApplied: [], schemaVersion: 1 };
const NO_DB: Boot = { startedAt: Date.UTC(2026, 10, 16, 15, 22, 2), migrationsApplied: null, schemaVersion: null };
const at = (startedAt: number): Boot => ({ ...WITH_DB, startedAt });

describe('/healthz', () => {
  // AC-210 (a): sin variables de mapa ni del I2, como en staging y prod, «map»: «1.1» e «i2»: true
  test('devuelve ok, jugadores, uptime en s, el commit desplegado, el mapa 1.1 con el I2 (AC-210 a) y cómo arrancó (AC-231)', () => {
    expect(healthPayload(3, at(1_000), 61_400, { RAILWAY_GIT_COMMIT_SHA: '434b1605c1c6' })).toEqual({
      ok: true,
      players: 3,
      uptimeSeconds: 60,
      commit: '434b1605c1c6',
      i2: true,
      map: '1.1',
      startedAt: '1970-01-01T00:00:01.000Z',
      migrationsApplied: [],
      schemaVersion: 1
    });
  });

  test('map dice el mapa del mundo: 1.0 solo con SEA_BATTLE_MAP=1.0, y 1.1 con cualquier otro valor o sin ella (AC-210 d)', () => {
    expect(healthPayload(0, at(0), 0, { SEA_BATTLE_MAP: '1.0' }).map).toBe('1.0');
    for (const v of [undefined, '', '1.1', '1', '10', '1,0', '1.2', ' 1.0', '1.0 ']) expect({ v, map: healthPayload(0, at(0), 0, { SEA_BATTLE_MAP: v }).map }).toEqual({ v, map: '1.1' });
  });

  test('AC-187, AC-210 (d): i2 dice si el I2 está encendido, y solo SEA_BATTLE_I2=0 lo apaga', () => {
    expect(healthPayload(0, at(0), 0, { SEA_BATTLE_I2: '0' }).i2).toBe(false);
    for (const v of [undefined, '', '1', 'false', 'no', ' 0', '0 ', '00']) expect({ v, i2: healthPayload(0, at(0), 0, { SEA_BATTLE_I2: v }).i2 }).toEqual({ v, i2: true });
  });
});

describe('AC-231: /healthz dice cómo arrancó el servidor', () => {
  test('(d) commit: la variable propia (SEA_BATTLE_COMMIT) gana a la de Railway; la de Railway, de respaldo; sin ninguna, null', () => {
    expect(healthPayload(0, WITH_DB, 0, { SEA_BATTLE_COMMIT: 'aaaa111', RAILWAY_GIT_COMMIT_SHA: 'bbbb222' }).commit).toBe('aaaa111');
    expect(healthPayload(0, WITH_DB, 0, { RAILWAY_GIT_COMMIT_SHA: 'bbbb222' }).commit).toBe('bbbb222');
    expect(healthPayload(0, WITH_DB, 0, { SEA_BATTLE_COMMIT: '', RAILWAY_GIT_COMMIT_SHA: 'bbbb222' }).commit).toBe('bbbb222');
    expect(healthPayload(0, WITH_DB, 0, {}).commit).toBeNull();
    expect(healthPayload(0, WITH_DB, 0, { SEA_BATTLE_COMMIT: '', RAILWAY_GIT_COMMIT_SHA: '' }).commit).toBeNull();
  });

  test('(a) startedAt: la hora de arranque en ISO 8601 UTC, la misma en todas las respuestas del proceso', () => {
    const answers = [WITH_DB.startedAt + 5, WITH_DB.startedAt + 60_000, WITH_DB.startedAt + 3_600_000].map((now) => healthPayload(0, WITH_DB, now, {}).startedAt);
    expect(answers).toEqual(['2026-11-16T15:22:02.000Z', '2026-11-16T15:22:02.000Z', '2026-11-16T15:22:02.000Z']);
  });

  test('(b) y (c) con BD: lo que aplicó este arranque y la versión mayor; «al día» es [] y no null', () => {
    expect(healthPayload(0, { ...WITH_DB, migrationsApplied: [1] }, 0, {})).toMatchObject({ migrationsApplied: [1], schemaVersion: 1 });
    expect(healthPayload(0, WITH_DB, 0, {})).toMatchObject({ migrationsApplied: [], schemaVersion: 1 });
  });

  test('(c) sin BD, migrationsApplied y schemaVersion son null, para que «sin BD» no se confunda con «0 migraciones»', () => {
    expect(healthPayload(0, NO_DB, 0, {})).toMatchObject({ migrationsApplied: null, schemaVersion: null });
  });

  test('(e) solo esas claves, con BD y sin ella, y nada del entorno aunque esté (la URL de la BD, secretos, otras variables)', () => {
    const env = {
      DATABASE_URL: 'postgres://user:s3cr3t@db.internal:5432/railway',
      CLERK_SECRET_KEY: 'sk_live_supersecret',
      RAILWAY_TOKEN: 'tok_xyz',
      SEA_BATTLE_COMMIT: 'aaaa111',
      PGHOST: 'db.internal'
    };
    const keys = ['commit', 'i2', 'map', 'migrationsApplied', 'ok', 'players', 'schemaVersion', 'startedAt', 'uptimeSeconds'];
    for (const boot of [WITH_DB, NO_DB]) {
      const payload = healthPayload(2, boot, boot.startedAt + 1000, env);
      expect(Object.keys(payload).sort()).toEqual(keys);
      const json = JSON.stringify(payload);
      for (const leak of ['postgres', 's3cr3t', 'db.internal', 'supersecret', 'tok_xyz', 'player_progress', 'schema_migrations']) expect({ leak, found: json.includes(leak) }).toEqual({ leak, found: false });
    }
  });

  test('una copia: cambiar la lista que devolvió /healthz no cambia la del arranque', () => {
    const boot: Boot = { ...WITH_DB, migrationsApplied: [1] };
    healthPayload(0, boot, 0, {}).migrationsApplied!.push(99);
    expect(boot.migrationsApplied).toEqual([1]);
  });
});

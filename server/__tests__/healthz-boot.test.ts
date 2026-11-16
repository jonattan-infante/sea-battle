// AC-231 con Postgres real: /healthz dice cómo arrancó el servidor. Un proceso hijo (fixtures/game-process.ts) con el mismo
// arranque que server/index.ts (server/bootstrap.ts: BD y migraciones) y el mismo /healthz (healthOf y requestHandler),
// sin Next.js, se pide por HTTP como lo pide el job de deploy. Cada test con su BD vacía, detrás del proxy que la para
import { GameChild, startGameChild } from './fixtures/game-child';
import { PgProxy, startPgProxy } from './fixtures/pg-proxy';
import { createTestDb, TestDb } from './pg/test-db';

jest.setTimeout(60_000);

const KEYS = ['commit', 'i2', 'map', 'migrationsApplied', 'ok', 'players', 'schemaVersion', 'startedAt', 'uptimeSeconds'];
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let db: TestDb | null = null;
let proxy: PgProxy | null = null;
const children: GameChild[] = [];

afterEach(async () => {
  await Promise.all(children.splice(0).map((c) => c.kill('SIGKILL')));
  await proxy?.close();
  proxy = null;
  await db?.drop();
  db = null;
});

// Una BD vacía, sin migrar, detrás del proxy
async function emptyDb(): Promise<PgProxy> {
  db = await createTestDb();
  proxy = await startPgProxy(db.url);
  return proxy;
}

async function start(env: Record<string, string>): Promise<GameChild> {
  const child = await startGameChild({ SEA_BATTLE_COMMIT: '', RAILWAY_GIT_COMMIT_SHA: '', ...env });
  children.push(child);
  return child;
}

// GET /healthz como el curl del job: 200 y JSON, en ≤ 2 s
async function healthz(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2000) });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

describe('AC-231: /healthz dice cómo arrancó el servidor, con Postgres real', () => {
  test('con la BD vacía, el 1.er arranque da migrationsApplied [1] y schemaVersion 1; el 2.º, [] y 1; startedAt fijo en cada proceso', async () => {
    const { url } = await emptyDb();
    const first = await start({ DATABASE_URL: url, SEA_BATTLE_COMMIT: 'c0ffee1' });
    const a = [await healthz(first.url), await healthz(first.url), await healthz(first.url)];
    expect(a[0]).toMatchObject({ ok: true, commit: 'c0ffee1', migrationsApplied: [1], schemaVersion: 1 });
    expect(Object.keys(a[0]).sort()).toEqual(KEYS);
    expect(a[0].startedAt).toMatch(ISO_UTC);
    expect(a.map((h) => h.startedAt)).toEqual([a[0].startedAt, a[0].startedAt, a[0].startedAt]);
    expect(first.output()).toContain('Migración 1 aplicada');
    expect(await first.kill('SIGTERM')).toEqual({ code: 0, signal: null });

    const second = await start({ DATABASE_URL: url, SEA_BATTLE_COMMIT: 'c0ffee1' });
    const b = await healthz(second.url);
    expect(b).toMatchObject({ ok: true, commit: 'c0ffee1', migrationsApplied: [], schemaVersion: 1 });
    expect(Date.parse(b.startedAt as string)).toBeGreaterThan(Date.parse(a[0].startedAt as string));
    expect(second.output()).not.toMatch(/Migración \d+ aplicada/);
  });

  test('(e) con la BD parada, /healthz responde al momento y con lo mismo: no la consulta por petición (AC-132)', async () => {
    const pg = await emptyDb();
    const child = await start({ DATABASE_URL: pg.url });
    const before = await healthz(child.url);
    expect(before).toMatchObject({ migrationsApplied: [1], schemaVersion: 1 });
    pg.cut();
    const t0 = Date.now();
    const during = [await healthz(child.url), await healthz(child.url), await healthz(child.url)];
    expect(Date.now() - t0).toBeLessThan(1500);
    const stable = (h: Record<string, unknown>) => ({ ok: h.ok, commit: h.commit, startedAt: h.startedAt, migrationsApplied: h.migrationsApplied, schemaVersion: h.schemaVersion });
    for (const h of during) expect(stable(h)).toEqual(stable(before));
  });

  test('(c) sin DATABASE_URL (como el modo invitado), migrationsApplied y schemaVersion son null; (d) sin variables de commit, commit es null', async () => {
    const child = await start({ DATABASE_URL: '' });
    const h = await healthz(child.url);
    expect(h).toMatchObject({ ok: true, commit: null, migrationsApplied: null, schemaVersion: null });
    expect(Object.keys(h).sort()).toEqual(KEYS);
  });

  test('(d) con RAILWAY_GIT_COMMIT_SHA solo, commit es el de Railway; con las 2, gana SEA_BATTLE_COMMIT', async () => {
    const railway = await start({ DATABASE_URL: '', RAILWAY_GIT_COMMIT_SHA: 'bbbb222' });
    expect((await healthz(railway.url)).commit).toBe('bbbb222');
    const both = await start({ DATABASE_URL: '', RAILWAY_GIT_COMMIT_SHA: 'bbbb222', SEA_BATTLE_COMMIT: 'aaaa111' });
    expect((await healthz(both.url)).commit).toBe('aaaa111');
  });
});

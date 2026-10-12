// Migraciones al arrancar (server/db/migrate.ts): idempotentes y seguras aunque dos procesos arranquen a la vez
import { Pool } from 'pg';
import { createPool } from '../db/pool';
import { migrate, MIGRATIONS } from '../db/migrate';
import { createTestDb, TestDb } from './pg/test-db';

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.drop();
});

const versions = async (admin: Pool) => (await admin.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => r.version);

test('crea player_progress y registra cada versión una sola vez', async () => {
  const pool = createPool(db.url);
  try {
    expect(await migrate(pool)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await migrate(pool)).toEqual([]); // la segunda vez no hay nada que aplicar
  } finally {
    await pool.end();
  }
  expect(await versions(db.admin)).toEqual(MIGRATIONS.map((m) => m.version));
  const cols = await db.admin.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'player_progress' ORDER BY ordinal_position"
  );
  expect(cols.rows).toEqual([
    { column_name: 'user_id', data_type: 'text', is_nullable: 'NO' },
    { column_name: 'state', data_type: 'jsonb', is_nullable: 'NO' },
    { column_name: 'revision', data_type: 'bigint', is_nullable: 'NO' },
    { column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }
  ]);
});

test('dos arranques a la vez no chocan: el candado deja que solo uno aplique cada versión', async () => {
  const a = createPool(db.url);
  const b = createPool(db.url);
  try {
    const [ra, rb] = await Promise.all([migrate(a), migrate(b)]);
    expect([...ra, ...rb].sort()).toEqual(MIGRATIONS.map((m) => m.version));
  } finally {
    await Promise.all([a.end(), b.end()]);
  }
  expect(await versions(db.admin)).toEqual(MIGRATIONS.map((m) => m.version));
});

test('la BD solo acepta un objeto JSON como estado', async () => {
  const pool = createPool(db.url);
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
  await expect(db.admin.query("INSERT INTO player_progress (user_id, state) VALUES ('u', '[1]')")).rejects.toThrow(/check/i);
  await db.admin.query("INSERT INTO player_progress (user_id, state) VALUES ('u', '{}')");
  const row = await db.admin.query("SELECT revision FROM player_progress WHERE user_id = 'u'");
  expect(row.rows[0].revision).toBe('1'); // bigint llega como texto desde pg
});

// Migraciones al arrancar, antes de abrir el puerto: si fallan, el proceso termina, el healthcheck no pasa y Railway
// mantiene el despliegue anterior. Un candado de Postgres evita que dos procesos apliquen la misma versión a la vez
import { Pool } from 'pg';

export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE player_progress (
        user_id    text PRIMARY KEY,                                         -- sub del JWT verificado (AC-08)
        state      jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),   -- server/progress.ts
        revision   bigint NOT NULL DEFAULT 1,                                -- +1 en cada escritura (server/persistence.ts)
        updated_at timestamptz NOT NULL DEFAULT now()
      )`
  }
];

const LOCK_KEY = 7_211_940_001; // pg_advisory_lock: cualquier número fijo y propio de este proyecto

// Devuelve las versiones que aplicó (vacío si la BD ya estaba al día)
export async function migrate(pool: Pool, log: (msg: string) => void = () => {}): Promise<number[]> {
  const client = await pool.connect();
  const applied: number[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version as number));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      applied.push(m.version);
      log(`🗄️  Migración ${m.version} aplicada`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return applied;
}

// Un schema propio por archivo de test sobre el Postgres de global-setup.ts: los workers de Jest corren en paralelo sin
// pisarse. La URL lleva el search_path en `options`, así el código de producción no sabe nada de tests
import { Pool } from 'pg';

export interface TestDb {
  url: string; // DATABASE_URL con el search_path del schema
  admin: Pool; // conexión al mismo schema para preparar y leer filas desde el test
  drop: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error(process.env.TEST_DATABASE_URL_ERROR ?? 'Falta TEST_DATABASE_URL');
  const schema = `t_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const root = new Pool({ connectionString: base, max: 1 });
  await root.query(`CREATE SCHEMA ${schema}`);
  await root.end();
  const url = `${base}${base.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
  const admin = new Pool({ connectionString: url, max: 2 });
  return {
    url,
    admin,
    drop: async () => {
      await admin.end();
      const cleanup = new Pool({ connectionString: base, max: 1 });
      await cleanup.query(`DROP SCHEMA ${schema} CASCADE`);
      await cleanup.end();
    }
  };
}

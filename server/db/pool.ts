// Conexión a Postgres (DATABASE_URL de Railway). Plazos de 3 s al conectar y por consulta: si la BD no responde, el
// jugador ve el aviso en vez de esperar (AC-131) y una escritura colgada no bloquea las siguientes
import { Pool } from 'pg';

export const DB_TIMEOUT_MS = 3000;

export function createPool(connectionString: string, log: (msg: string) => void = () => {}): Pool {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: DB_TIMEOUT_MS,
    query_timeout: DB_TIMEOUT_MS,
    idleTimeoutMillis: 30_000
  });
  // Un cliente inactivo que pierde la conexión (BD reiniciada) emite 'error': sin escucha tumbaría el proceso
  pool.on('error', (err) => log(`⚠️  Postgres: ${err.message}`));
  return pool;
}

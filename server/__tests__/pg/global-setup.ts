// Postgres real para los tests de persistencia (AC-97, AC-129 a AC-133). En la CI llega TEST_DATABASE_URL (service
// container de ci.yml). En local, si no está, se levanta un clúster temporal (cluster.ts) que se limpia aunque Jest muera.
// Sin TEST_DATABASE_URL ni binarios de Postgres, los tests de persistencia fallan con el motivo (no se saltan) y el resto
// de la suite corre igual
import { ChildProcess } from 'child_process';
import { NO_POSTGRES, startTempCluster } from './cluster';

export default async function globalSetup(): Promise<void> {
  if (process.env.TEST_DATABASE_URL) return;
  try {
    const cluster = await startTempCluster();
    (globalThis as { __PG_WATCHDOG__?: ChildProcess }).__PG_WATCHDOG__ = cluster.watchdog;
    process.env.TEST_DATABASE_URL = cluster.url;
  } catch (e) {
    process.env.TEST_DATABASE_URL_ERROR = (e as Error).message === NO_POSTGRES ? NO_POSTGRES : `Postgres temporal: ${(e as Error).message}`;
  }
}

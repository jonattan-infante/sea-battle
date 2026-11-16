// GET /healthz: estado para Railway, para los arneses remotos (e2e/remote), que registran qué commit midieron, y desde la
// 1.3 para comprobar sin el proveedor cómo arrancó el servidor (AC-231): el job de deploy y QA lo piden con curl. Lo del
// arranque sale de él, una vez (Boot); cada petición solo lee la memoria, así que con la BD caída responde igual (AC-132).
// Solo estas claves: ni la URL de la BD, ni nombres de tabla, ni datos de jugadores, ni variables de entorno
import { i2Enabled, MapId, mapId } from './features';

// Cómo arrancó este proceso: lo fija el arranque (server/bootstrap.ts) y no cambia hasta que el proceso termina
export interface Boot {
  startedAt: number; // ms (Date.now()) del arranque
  migrationsApplied: number[] | null; // lo que aplicó migrate() en este arranque, [] si la BD ya estaba al día; null sin BD
  schemaVersion: number | null; // la versión mayor de schema_migrations después de migrar; null sin BD
}

export interface Health {
  ok: true;
  players: number;
  uptimeSeconds: number;
  commit: string | null; // SEA_BATTLE_COMMIT y, de respaldo, RAILWAY_GIT_COMMIT_SHA; null sin ninguna (AC-231 d)
  i2: boolean; // AC-187, AC-210: I2 encendido (por defecto; solo SEA_BATTLE_I2=0 lo apaga), para comprobar sin jugar que staging y prod lo tienen
  map: MapId; // mapa del mundo (SEA_BATTLE_MAP, server/features.ts): '1.1' salvo con SEA_BATTLE_MAP=1.0 (AC-210)
  startedAt: string; // AC-231 (a): la hora de arranque, en ISO 8601 UTC, la misma en todas las respuestas del proceso
  migrationsApplied: number[] | null; // AC-231 (b)
  schemaVersion: number | null; // AC-231 (c)
}

export function healthPayload(players: number, boot: Boot, now: number, env: Record<string, string | undefined> = process.env): Health {
  return {
    ok: true,
    players,
    uptimeSeconds: Math.round((now - boot.startedAt) / 1000),
    commit: env.SEA_BATTLE_COMMIT || env.RAILWAY_GIT_COMMIT_SHA || null,
    i2: i2Enabled(env),
    map: mapId(env),
    startedAt: new Date(boot.startedAt).toISOString(),
    migrationsApplied: boot.migrationsApplied && [...boot.migrationsApplied],
    schemaVersion: boot.schemaVersion
  };
}

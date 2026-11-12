// GET /healthz: estado para Railway y para los arneses remotos (e2e/remote), que registran qué commit midieron
import { i2Enabled, MapId, mapId } from './features';

export interface Health {
  ok: true;
  players: number;
  uptimeSeconds: number;
  commit: string | null; // RAILWAY_GIT_COMMIT_SHA; null en local o en un despliegue sin Git
  i2: boolean; // AC-187, AC-210: I2 encendido (por defecto; solo SEA_BATTLE_I2=0 lo apaga), para comprobar sin jugar que staging y prod lo tienen
  map: MapId; // mapa del mundo (SEA_BATTLE_MAP, server/features.ts): '1.1' salvo con SEA_BATTLE_MAP=1.0 (AC-210)
}

export function healthPayload(players: number, startedAt: number, now: number, env: Record<string, string | undefined> = process.env): Health {
  return { ok: true, players, uptimeSeconds: Math.round((now - startedAt) / 1000), commit: env.RAILWAY_GIT_COMMIT_SHA || null, i2: i2Enabled(env), map: mapId(env) };
}

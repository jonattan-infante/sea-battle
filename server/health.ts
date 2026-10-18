// GET /healthz: estado para Railway y para los arneses remotos (e2e/remote), que registran qué commit midieron
import { i2Enabled } from './features';

export interface Health {
  ok: true;
  players: number;
  uptimeSeconds: number;
  commit: string | null; // RAILWAY_GIT_COMMIT_SHA; null en local o en un despliegue sin Git
  i2: boolean; // AC-187: I2 encendido (SEA_BATTLE_I2=1), para comprobar sin jugar que staging y prod lo tienen apagado
}

export function healthPayload(players: number, startedAt: number, now: number, env: Record<string, string | undefined> = process.env): Health {
  return { ok: true, players, uptimeSeconds: Math.round((now - startedAt) / 1000), commit: env.RAILWAY_GIT_COMMIT_SHA || null, i2: i2Enabled(env) };
}

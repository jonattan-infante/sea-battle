// GET /healthz: estado para Railway y para los arneses remotos (e2e/remote), que registran qué commit midieron
import { i2Enabled, newShipsEnabled } from './features';

export interface Health {
  ok: true;
  players: number;
  uptimeSeconds: number;
  commit: string | null; // RAILWAY_GIT_COMMIT_SHA; null en local o en un despliegue sin Git
  i2: boolean; // AC-187: I2 encendido (SEA_BATTLE_I2=1), para comprobar sin jugar que staging y prod lo tienen apagado
  newShips: boolean; // AC-201: la Goleta y el Navío se venden (SEA_BATTLE_NEW_SHIPS=1), aparte del I2
}

export function healthPayload(players: number, startedAt: number, now: number, env: Record<string, string | undefined> = process.env): Health {
  return { ok: true, players, uptimeSeconds: Math.round((now - startedAt) / 1000), commit: env.RAILWAY_GIT_COMMIT_SHA || null, i2: i2Enabled(env), newShips: newShipsEnabled(env) };
}

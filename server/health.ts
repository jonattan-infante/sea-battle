// GET /healthz: estado para Railway y para los arneses remotos (e2e/remote), que registran qué commit midieron
export interface Health {
  ok: true;
  players: number;
  uptimeSeconds: number;
  commit: string | null; // RAILWAY_GIT_COMMIT_SHA; null en local o en un despliegue sin Git
}

export function healthPayload(players: number, startedAt: number, now: number, env: Record<string, string | undefined> = process.env): Health {
  return { ok: true, players, uptimeSeconds: Math.round((now - startedAt) / 1000), commit: env.RAILWAY_GIT_COMMIT_SHA || null };
}

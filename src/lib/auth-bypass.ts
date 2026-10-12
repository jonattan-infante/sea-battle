// Modo invitado para pruebas locales y e2e. Nunca se activa en Railway, aunque alguien defina AUTH_BYPASS allí.
const RAILWAY_MARKERS = ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID'];

export function isRailway(env: Record<string, string | undefined> = process.env): boolean {
  return RAILWAY_MARKERS.some((key) => Boolean(env[key]));
}

export function isAuthBypassAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.AUTH_BYPASS !== '1') return false;
  return !isRailway(env);
}

// AC-09: AUTH_BYPASS junto a un marcador de Railway es un error de configuración; el servidor no debe arrancar
export function authConfigError(env: Record<string, string | undefined> = process.env): string | null {
  if (env.AUTH_BYPASS !== '1') return null;
  const marker = RAILWAY_MARKERS.find((key) => Boolean(env[key]));
  return marker ? `AUTH_BYPASS=1 no está permitido en Railway (${marker} presente)` : null;
}

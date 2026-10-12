// En Railway el servidor arranca con `node dist/server/index.js` (railway.json, sin `npm start`, para que el SIGTERM le
// llegue directamente). NODE_ENV se fija aquí: en Railway siempre es producción, aunque falte o diga otra cosa. Lo importa
// server/index.ts antes que nada, porque Next.js y React leen NODE_ENV al cargarse
import { isRailway } from '../src/lib/auth-bypass';

export function applyRailwayNodeEnv(env: Record<string, string | undefined> = process.env): void {
  if (isRailway(env)) env.NODE_ENV = 'production';
}

applyRailwayNodeEnv();

// Arranque del juego, compartido por server/index.ts y por el proceso de los tests (server/__tests__/fixtures): la BD
// (DATABASE_URL), sus migraciones y el servidor de juego con el progreso guardado
import type { Pool } from 'pg';
import type { Server } from 'socket.io';
import { isAuthBypassAllowed, isRailway } from '../src/lib/auth-bypass';
import { authenticateHandshake } from './auth';
import { migrate } from './db/migrate';
import { createPool } from './db/pool';
import { createGameServer, GameServer, GameServerOptions } from './game-server';
import { createPgStore } from './persistence';
import { applyScenario, parseScenario } from './scenarios';

type Env = Record<string, string | undefined>;

// En Railway (prod y staging) el progreso se guarda siempre: sin DATABASE_URL el servidor no arranca, como AC-09
export function databaseConfigError(env: Env = process.env): string | null {
  return isRailway(env) && !env.DATABASE_URL ? 'Falta DATABASE_URL: en Railway el progreso de los jugadores se guarda en Postgres' : null;
}

export interface GameStack {
  game: GameServer;
  pool: Pool | null; // null: sin BD (solo fuera de Railway), todo en memoria
}

// overrides: solo para el proceso de los tests (p. ej., sin guardado periódico); server/index.ts no lo usa
export async function startGame(io: Server, env: Env = process.env, log: (msg: string) => void = () => {}, overrides: Partial<GameServerOptions> = {}): Promise<GameStack> {
  const configError = databaseConfigError(env);
  if (configError) throw new Error(configError);
  let pool: Pool | null = null;
  if (env.DATABASE_URL) {
    pool = createPool(env.DATABASE_URL, log);
    try {
      await migrate(pool, log);
    } catch (err) {
      await pool.end().catch(() => {});
      throw err;
    }
  } else {
    log('⚠️  Sin DATABASE_URL: el progreso vive solo en memoria (se pierde al reiniciar)');
  }
  const scenario = parseScenario(env.SEA_BATTLE_SCENARIO);
  const game = createGameServer(io, {
    authenticate: (auth) => authenticateHandshake(auth, env),
    spawnNpcs: env.SEA_BATTLE_NPCS !== '0', // servidor de prueba sin NPC (AC-83, AC-87)
    // Escenarios de prueba: solo con el modo invitado permitido, que nunca se activa en Railway
    setup: isAuthBypassAllowed(env) && scenario ? (world) => applyScenario(world, scenario) : undefined,
    store: pool ? createPgStore(pool) : undefined,
    log,
    ...overrides
  });
  return { game, pool };
}

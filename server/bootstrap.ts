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
import { i2Enabled, mapId, mapOfId, unrecognizedSwitches } from './features';
import { applyScenario, I2_SCENARIOS, parseScenario } from './scenarios';

type Env = Record<string, string | undefined>;

// En Railway (prod y staging) el progreso se guarda siempre: sin DATABASE_URL el servidor no arranca, como AC-09
export function databaseConfigError(env: Env = process.env): string | null {
  return isRailway(env) && !env.DATABASE_URL ? 'Falta DATABASE_URL: en Railway el progreso de los jugadores se guarda en Postgres' : null;
}

export interface GameStack {
  game: GameServer;
  pool: Pool | null; // null: sin BD (solo fuera de Railway), todo en memoria
}

// Ventana de las métricas en ms (por defecto 60 s): el humo del arnés de estrés la acorta. Menos de 1 s se ignora
function metricsInterval(raw: string | undefined): number | undefined {
  const ms = Number(raw);
  return Number.isInteger(ms) && ms >= 1000 ? ms : undefined;
}

// overrides: solo para el proceso de los tests (p. ej., sin guardado periódico); server/index.ts no lo usa
export async function startGame(io: Server, env: Env = process.env, log: (msg: string) => void = () => {}, overrides: Partial<GameServerOptions> = {}): Promise<GameStack> {
  const configError = databaseConfigError(env);
  if (configError) throw new Error(configError);
  // Escenarios de prueba: solo con el modo invitado permitido, que nunca se activa en Railway
  const scenario = isAuthBypassAllowed(env) && parseScenario(env.SEA_BATTLE_SCENARIO);
  const i2 = i2Enabled(env);
  if (scenario && I2_SCENARIOS.includes(scenario) && !i2) throw new Error(`El escenario «${scenario}» necesita el I2 encendido (sin SEA_BATTLE_I2=0, AC-187)`);
  const map = mapId(env);
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
  // AC-210 (d): una línea por interruptor, y antes su aviso si el valor no se reconoce
  const warnings = unrecognizedSwitches(env);
  warnings.filter((w) => w.startsWith('Aviso: SEA_BATTLE_I2')).forEach(log);
  log(i2 ? 'I2 encendido (por defecto): el Capitán pirata y las cañoneras entran en partida (se apaga con SEA_BATTLE_I2=0)' : 'I2 apagado (SEA_BATTLE_I2=0, palanca de emergencia): sin Capitán pirata ni cañoneras');
  warnings.filter((w) => w.startsWith('Aviso: SEA_BATTLE_MAP')).forEach(log);
  log(map === '1.1' ? 'Mapa 1.1 (por defecto): las islas de la 1.1 y los amarres del puerto (se cambia con SEA_BATTLE_MAP=1.0)' : 'Mapa 1.0 (SEA_BATTLE_MAP=1.0, palanca de emergencia): las islas de la 1.0, sin amarres');
  let game: GameServer;
  try {
    game = createGameServer(io, {
      authenticate: (auth) => authenticateHandshake(auth, env),
      spawnNpcs: env.SEA_BATTLE_NPCS !== '0', // servidor de prueba sin NPC (AC-83, AC-87)
      // Con el mapa 1.1, un escenario con un barco en un sitio no navegable no arranca (server/scenarios.ts)
      setup: scenario ? (world) => applyScenario(world, scenario, { requireNavigable: map !== '1.0' }) : undefined,
      store: pool ? createPgStore(pool) : undefined,
      metrics: env.SEA_BATTLE_METRICS !== '0', // AC-142 / AC-143: una línea por minuto con jugadores; 0 la apaga
      metricsIntervalMs: metricsInterval(env.SEA_BATTLE_METRICS_MS),
      i2,
      map: mapOfId(map),
      log,
      ...overrides
    });
  } catch (err) {
    await pool?.end().catch(() => {});
    throw err;
  }
  return { game, pool };
}

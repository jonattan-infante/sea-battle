// Apagado ordenado: Railway manda SIGTERM al despliegue viejo en cada redeploy y SIGKILL al acabar el drenaje (15 s,
// railway.json). AC-129: no se pierde nada. Se dejan de aceptar entradas, se para la simulación, se escribe el progreso
// de todos y solo después se cierran las conexiones, para que el cliente que reconecta al despliegue nuevo cargue lo ya
// escrito y no un estado anterior
import type { Server as HttpServer } from 'http';
import type { Pool } from 'pg';
import type { Server } from 'socket.io';
import type { GameServer } from './game-server';

export const SHUTDOWN_FLUSH_MS = 10_000; // por debajo de los 15 s de drenaje: con la BD colgada se sale igualmente

export interface ShutdownDeps {
  game: GameServer;
  io: Server;
  httpServer: HttpServer;
  pool: Pool | null;
  log: (msg: string) => void;
  exit?: (code: number) => void;
  flushTimeoutMs?: number;
}

export function createShutdown({ game, io, httpServer, pool, log, exit = (code) => process.exit(code), flushTimeoutMs = SHUTDOWN_FLUSH_MS }: ShutdownDeps) {
  let running: Promise<void> | null = null;
  return (signal: string): Promise<void> => {
    running ??= (async () => {
      log(`🛑 ${signal}: guardando el progreso antes de cerrar`);
      game.stop(); // sin ticks ni entradas nuevas: el estado ya no cambia
      let timer: ReturnType<typeof setTimeout> | undefined;
      const flushed = await Promise.race([
        game.flushProgress(),
        new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), flushTimeoutMs)))
      ]);
      clearTimeout(timer);
      log(flushed ? '💾 Progreso guardado' : `⚠️  El progreso no se pudo guardar en ${flushTimeoutMs} ms`);
      await new Promise<void>((resolve) => io.close(() => resolve())); // ahora sí: los clientes reconectan al nuevo
      httpServer.close();
      await pool?.end().catch(() => {});
      exit(0);
    })();
    return running;
  };
}

// SIGTERM (Railway) y SIGINT (Ctrl-C en local) disparan el mismo apagado; lo usan server/index.ts y el proceso de los tests
export function installShutdown(deps: ShutdownDeps): (signal: string) => Promise<void> {
  const shutdown = createShutdown(deps);
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  return shutdown;
}

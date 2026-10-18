// Apagado ordenado: Railway manda SIGTERM al despliegue viejo en cada redeploy y SIGKILL al acabar el drenaje (15 s,
// variable RAILWAY_DEPLOYMENT_DRAINING_SECONDS del servicio; TECH-ARCHITECTURE §2.1). AC-129: no se pierde nada. Se
// dejan de aceptar entradas, se para la simulación, se escribe el progreso de todos y solo después se cierran las
// conexiones, para que el cliente que reconecta al despliegue nuevo cargue lo ya escrito y no un estado anterior
import type { Server as HttpServer } from 'http';
import type { Pool } from 'pg';
import type { Server } from 'socket.io';
import type { GameServer } from './game-server';

// Por debajo de los 15 s de drenaje, con la BD colgada se sale igual (scripts/railway/check_deploy.py exige ≥ esto + 2 s)
export const SHUTDOWN_FLUSH_MS = 10_000;

export interface ShutdownDeps {
  game: GameServer;
  io: Server;
  httpServer: HttpServer;
  pool: Pool | null;
  log: (msg: string) => void;
  exit?: (code: number) => void;
  flushTimeoutMs?: number;
  now?: () => number; // reloj de los logs (ms desde epoch); los tests lo fijan
}

export function createShutdown({ game, io, httpServer, pool, log, exit = (code) => process.exit(code), flushTimeoutMs = SHUTDOWN_FLUSH_MS, now = Date.now }: ShutdownDeps) {
  let running: Promise<void> | null = null;
  return (signal: string): Promise<void> => {
    running ??= (async () => {
      // Cada paso con la hora del propio proceso y los ms desde la señal: los sellos de Railway llegan en lote, y H-25 se
      // mide en el servidor (del cambio de /healthz a «💾 Progreso guardado»). Los prefijos los buscan QA y check_deploy.py
      const t0 = now();
      const at = (t: number) => `${new Date(t).toISOString()} (+${t - t0} ms)`;
      log(`🛑 ${signal}: guardando el progreso antes de cerrar ${new Date(t0).toISOString()}`);
      game.stop(); // sin ticks ni entradas nuevas: el estado ya no cambia
      let timer: ReturnType<typeof setTimeout> | undefined;
      const flushed = await Promise.race([
        game.flushProgress(),
        new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), flushTimeoutMs)))
      ]);
      clearTimeout(timer);
      log(flushed ? `💾 Progreso guardado ${at(now())}` : `⚠️  El progreso no se pudo guardar en ${flushTimeoutMs} ms ${at(now())}`);
      await new Promise<void>((resolve) => io.close(() => resolve())); // ahora sí: los clientes reconectan al nuevo
      log(`🔌 Sockets cerrados ${at(now())}`);
      httpServer.close();
      await pool?.end().catch(() => {});
      exit(0);
    })();
    return running;
  };
}

// AC-203: si desaparece quien lee los logs, escribir en stdout o stderr da EPIPE, y sin un listener de 'error' Node lo
// lanza como uncaughtException. Sin listener eso tumba el proceso antes de guardar; con el de Next (15.5.27:
// node_modules/next/dist/server/next-server.js:216, que solo hace console.error) entra en bucle y el apagado no termina.
// Va en los streams y no en uncaughtException porque Next borra los listeners de ese evento (next-server.js:184-189).
// Se pierde el log, no el juego ni el apagado
export function ignoreStdioErrors(streams: NodeJS.WriteStream[] = [process.stdout, process.stderr]): void {
  for (const stream of streams) stream.on('error', () => {});
}

// SIGTERM (Railway) y SIGINT (Ctrl-C en local) disparan el mismo apagado; lo usan server/index.ts y el proceso de los tests
export function installShutdown(deps: ShutdownDeps): (signal: string) => Promise<void> {
  ignoreStdioErrors();
  const shutdown = createShutdown(deps);
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  return shutdown;
}

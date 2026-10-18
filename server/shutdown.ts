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
// O-42: entre un guardado fallido y el siguiente, para no reintentar en bucle si la BD rechaza al instante
export const FLUSH_RETRY_PAUSE_MS = 250;

export interface ShutdownDeps {
  game: GameServer;
  io: Server;
  httpServer: HttpServer;
  pool: Pool | null;
  log: (msg: string) => void;
  exit?: (code: number) => void;
  flushTimeoutMs?: number;
  retryPauseMs?: number;
  now?: () => number; // reloj de los logs (ms desde epoch); los tests lo fijan
}

export function createShutdown({ game, io, httpServer, pool, log, exit = (code) => process.exit(code), flushTimeoutMs = SHUTDOWN_FLUSH_MS, retryPauseMs = FLUSH_RETRY_PAUSE_MS, now = Date.now }: ShutdownDeps) {
  let running: Promise<void> | null = null;
  return (signal: string): Promise<void> => {
    running ??= (async () => {
      // Cada paso con la hora del propio proceso y los ms desde la señal: los sellos de Railway llegan en lote, y H-25 se
      // mide en el servidor (del cambio de /healthz a «💾 Progreso guardado»). Los prefijos los buscan QA y check_deploy.py
      const t0 = now();
      const at = (t: number) => `${new Date(t).toISOString()} (+${t - t0} ms)`;
      log(`🛑 ${signal}: guardando el progreso antes de cerrar ${new Date(t0).toISOString()}`);
      game.stop(); // sin ticks ni entradas nuevas: el estado ya no cambia
      // O-42: con la BD lenta pero viva, una escritura que pasa de su plazo (3 s, DB_TIMEOUT_MS) no se da por perdida: se
      // vuelve a escribir lo que falló mientras quede plazo. No se empieza un intento que no quepa (se supone que dura como
      // el que acaba de fallar): el pool espera a sus conexiones al cerrarse, y hay que salir antes del SIGKILL. Un
      // conflicto (otro proceso escribió antes) no se reintenta ni cuenta como guardado
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeUp = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), flushTimeoutMs)));
      const deadline = Date.now() + flushTimeoutMs;
      let conflicts = 0;
      let flushed = false;
      for (let attempt = 1; ; attempt++) {
        const started = Date.now();
        const result = await Promise.race([game.flushProgress(), timeUp]);
        if (!result) break; // se acabó el plazo con la escritura en curso
        conflicts += result.conflicts;
        if (result.failed === 0) {
          flushed = conflicts === 0;
          break;
        }
        if (Date.now() + retryPauseMs + (Date.now() - started) > deadline) break;
        await new Promise((resolve) => setTimeout(resolve, retryPauseMs));
        log(`🔁 Intento ${attempt + 1} del guardado ${at(now())}`);
      }
      clearTimeout(timer);
      // «💾» solo si se guardaron todos; si no, el aviso con los ms reales y, detrás del (+N ms) que lee check_deploy.py,
      // cuántos jugadores quedaron sin guardar (los del conflicto ya se soltaron: se suman aparte)
      const unsaved = conflicts + game.unsavedProgress();
      const end = now();
      log(flushed ? `💾 Progreso guardado ${at(end)}` : `⚠️  El progreso no se pudo guardar en ${end - t0} ms ${at(end)} · ${unsaved} ${unsaved === 1 ? 'jugador' : 'jugadores'} sin guardar`);
      await new Promise<void>((resolve) => io.close(() => resolve())); // ahora sí: los clientes reconectan al nuevo
      log(`🔌 Sockets cerrados ${at(now())}`);
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

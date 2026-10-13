// Arranque: Next.js + Socket.IO + servidor de juego en el mismo puerto (Railway inyecta PORT)
import './railway-env';
import { createServer } from 'http';
import { parse } from 'url';
import { loadEnvConfig } from '@next/env';
import next from 'next';
import { Server } from 'socket.io';
import { authConfigError, isAuthBypassAllowed } from '../src/lib/auth-bypass';
import { databaseConfigError, startGame } from './bootstrap';
import type { Pool } from 'pg';
import type { GameServer } from './game-server';
import { healthPayload } from './health';
import { canonicalRedirect, publicOrigins, socketServerOptions } from './origins';
import { requestHandler } from './request-handler';
import { installShutdown } from './shutdown';

// DT-16, prueba del camino de fallo (rama desechable, nunca se fusiona): en Railway el proceso sale al arrancar, así que
// el healthcheck nunca pasa y Railway debe dejar activo el despliegue anterior
if (process.env.RAILWAY_ENVIRONMENT_NAME) {
  console.error('DT-16: salida provocada para probar el camino de fallo del despliegue');
  process.exit(1);
}

const dev = process.env.NODE_ENV !== 'production';
loadEnvConfig(process.cwd(), dev);

// AC-09: nunca abrir el puerto con el modo invitado en Railway; ni, en Railway, sin la BD del progreso
const configError = authConfigError() ?? databaseConfigError();
if (configError) {
  console.error(`❌ ${configError}`);
  process.exit(1);
}

let origins: string[];
let redirect: ReturnType<typeof canonicalRedirect>;
try {
  origins = publicOrigins();
  redirect = canonicalRedirect();
} catch (e) {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
}

const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const startedAt = Date.now();
  let onlinePlayers = () => 0;

  const httpServer = createServer(
    requestHandler({
      health: () => healthPayload(onlinePlayers(), startedAt, Date.now()),
      redirect,
      next: (req, res) => handle(req, res, parse(req.url || '/', true))
    })
  );

  const io = new Server(httpServer, socketServerOptions(origins)); // CORS: PUBLIC_ORIGINS, los mismos que authorizedParties

  // BD y migraciones antes de abrir el puerto: si fallan, el healthcheck no pasa y Railway mantiene el despliegue anterior
  // (Healthcheck Path `/healthz` en los ajustes del servicio de cada entorno; TECH-ARCHITECTURE §2.1)
  const log = (msg: string) => console.log(msg);
  let game: GameServer;
  let pool: Pool | null;
  try {
    ({ game, pool } = await startGame(io, process.env, log));
  } catch (err) {
    console.error(`❌ No se pudo preparar la base de datos: ${(err as Error).message}`);
    process.exit(1);
  }
  onlinePlayers = game.onlinePlayers;
  installShutdown({ game, io, httpServer, pool, log }); // SIGTERM de Railway: escribir el progreso y después cerrar (AC-129)

  httpServer.listen(port, () => {
    console.log(`🚀 Servidor listo en http://${hostname}:${port}`);
    if (isAuthBypassAllowed()) console.log('⚠️  AUTH_BYPASS activo: modo invitado habilitado (solo local)');
  });
});

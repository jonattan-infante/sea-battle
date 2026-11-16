// Arranque: Next.js + Socket.IO + servidor de juego en el mismo puerto (Railway inyecta PORT)
import './railway-env';
import { createServer } from 'http';
import { parse } from 'url';
import { loadEnvConfig } from '@next/env';
import next from 'next';
import { Server } from 'socket.io';
import { authConfigError, isAuthBypassAllowed } from '../src/lib/auth-bypass';
import { databaseConfigError, GameStack, healthOf, startGame } from './bootstrap';
import type { Health } from './health';
import { canonicalRedirect, publicOrigins, socketServerOptions } from './origins';
import { requestHandler } from './request-handler';
import { installShutdown } from './shutdown';

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
  let health: (() => Health) | null = null; // lo pone el arranque; el puerto se abre después, así que nadie lo pide antes

  const httpServer = createServer(
    requestHandler({
      health: () => health!(),
      redirect,
      next: (req, res) => handle(req, res, parse(req.url || '/', true))
    })
  );

  const io = new Server(httpServer, socketServerOptions(origins)); // CORS: PUBLIC_ORIGINS, los mismos que authorizedParties

  // BD y migraciones antes de abrir el puerto: si fallan, el healthcheck no pasa y Railway mantiene el despliegue anterior
  // (Healthcheck Path `/healthz` en los ajustes del servicio de cada entorno; TECH-ARCHITECTURE §2.1)
  const log = (msg: string) => console.log(msg);
  let stack: GameStack;
  try {
    stack = await startGame(io, process.env, log);
  } catch (err) {
    console.error(`❌ No se pudo preparar la base de datos: ${(err as Error).message}`);
    process.exit(1);
  }
  health = healthOf(stack, startedAt); // AC-231: cómo arrancó (commit, migraciones aplicadas y versión del esquema)
  const { game, pool } = stack;
  installShutdown({ game, io, httpServer, pool, log }); // SIGTERM de Railway: escribir el progreso y después cerrar (AC-129)

  httpServer.listen(port, () => {
    console.log(`🚀 Servidor listo en http://${hostname}:${port}`);
    if (isAuthBypassAllowed()) console.log('⚠️  AUTH_BYPASS activo: modo invitado habilitado (solo local)');
  });
});

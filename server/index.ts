// Arranque: Next.js + Socket.IO + servidor de juego en el mismo puerto (Railway inyecta PORT)
import { createServer } from 'http';
import { parse } from 'url';
import { loadEnvConfig } from '@next/env';
import next from 'next';
import { Server } from 'socket.io';
import { authConfigError, isAuthBypassAllowed } from '../src/lib/auth-bypass';
import { authenticateHandshake } from './auth';
import { createGameServer } from './game-server';
import { healthPayload } from './health';
import { canonicalRedirect, publicOrigins, socketServerOptions } from './origins';
import { requestHandler } from './request-handler';
import { applyScenario, parseScenario } from './scenarios';

const dev = process.env.NODE_ENV !== 'production';
loadEnvConfig(process.cwd(), dev);

// AC-09: nunca abrir el puerto con el modo invitado en Railway
const configError = authConfigError();
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

app.prepare().then(() => {
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

  const scenario = parseScenario(process.env.SEA_BATTLE_SCENARIO);
  const game = createGameServer(io, {
    authenticate: (auth) => authenticateHandshake(auth),
    spawnNpcs: process.env.SEA_BATTLE_NPCS !== '0', // servidor de prueba sin NPC (AC-83, AC-87)
    // Escenarios de prueba: solo con el modo invitado permitido, que nunca se activa en Railway
    setup: isAuthBypassAllowed() && scenario ? (world) => applyScenario(world, scenario) : undefined,
    log: (msg) => console.log(msg)
  });
  onlinePlayers = game.onlinePlayers;

  httpServer.listen(port, () => {
    console.log(`🚀 Servidor listo en http://${hostname}:${port}`);
    if (isAuthBypassAllowed()) console.log('⚠️  AUTH_BYPASS activo: modo invitado habilitado (solo local)');
  });
});

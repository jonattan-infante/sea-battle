// Arranque: Next.js + Socket.IO + servidor de juego en el mismo puerto (Railway inyecta PORT)
import { createServer } from 'http';
import { parse } from 'url';
import { loadEnvConfig } from '@next/env';
import next from 'next';
import { Server } from 'socket.io';
import { authConfigError, isAuthBypassAllowed } from '../src/lib/auth-bypass';
import { authenticateHandshake } from './auth';
import { createGameServer } from './game-server';
import { applyScenario, ScenarioName } from './scenarios';

const dev = process.env.NODE_ENV !== 'production';
loadEnvConfig(process.cwd(), dev);

// AC-09: nunca abrir el puerto con el modo invitado en Railway
const configError = authConfigError();
if (configError) {
  console.error(`❌ ${configError}`);
  process.exit(1);
}

const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const startedAt = Date.now();
  let onlinePlayers = () => 0;

  const httpServer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, players: onlinePlayers(), uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) }));
      return;
    }
    handle(req, res, parse(req.url || '/', true));
  });

  const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  const io = new Server(httpServer, {
    serveClient: false,
    cors: {
      origin: [`http://localhost:${port}`, ...(publicDomain ? [`https://${publicDomain}`] : [])],
      methods: ['GET', 'POST']
    }
  });

  const game = createGameServer(io, {
    authenticate: (auth) => authenticateHandshake(auth),
    spawnNpcs: process.env.SEA_BATTLE_NPCS !== '0', // servidor de prueba sin NPC (AC-83, AC-87)
    // Escenario de capturas: solo con el modo invitado permitido, que nunca se activa en Railway
    setup: isAuthBypassAllowed() && process.env.SEA_BATTLE_SCENARIO === 'showcase' ? (world) => applyScenario(world, process.env.SEA_BATTLE_SCENARIO as ScenarioName) : undefined,
    log: (msg) => console.log(msg)
  });
  onlinePlayers = game.onlinePlayers;

  httpServer.listen(port, () => {
    console.log(`🚀 Servidor listo en http://${hostname}:${port}`);
    if (isAuthBypassAllowed()) console.log('⚠️  AUTH_BYPASS activo: modo invitado habilitado (solo local)');
  });
});

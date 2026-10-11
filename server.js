const { createServer } = require('http');
const { parse } = require('url');
const { loadEnvConfig } = require('@next/env');
const dev = process.env.NODE_ENV !== 'production';
loadEnvConfig(process.cwd(), dev);
const next = require('next');
const { Server } = require('socket.io');
const { verifyToken } = require('@clerk/backend');
const {
  onValidated,
  parsePlayerJoin,
  parseShipPositionUpdate,
  parseFireBullet,
  parseShipDamage,
  parseNpcDestroyed
} = require('./src/server/socket-payloads');

const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Estado del juego
const gameState = {
  ships: new Map(),
  npcs: new Map(),
  players: new Map(),
  map: {
    width: 50,
    height: 50,
    occupiedPositions: []
  }
};

// Función para calcular distancia
function calculateDistance(pos1, pos2) {
  return Math.sqrt(Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2));
}

// Generar posición aleatoria libre
function generateRandomFreePosition() {
  let attempts = 0;
  while (attempts < 100) {
    const x = Math.random() * gameState.map.width;
    const y = Math.random() * gameState.map.height;
    const isFree = !gameState.map.occupiedPositions.some(pos =>
      calculateDistance(pos, { x, y }) < 5
    );
    if (isFree) {
      return { x, y };
    }
    attempts++;
  }
  return { x: Math.random() * gameState.map.width, y: Math.random() * gameState.map.height };
}

// Generar NPC
function generateNPC() {
  const types = ['pirate', 'merchant'];
  const type = types[Math.floor(Math.random() * types.length)];
  const position = generateRandomFreePosition();
  gameState.map.occupiedPositions.push(position);

  return {
    id: `npc-${Date.now()}-${Math.random()}`,
    type,
    position,
    health: type === 'pirate' ? 100 : 50,
    goldReward: type === 'pirate' ? 50 : 25,
    isDestroyed: false
  };
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  const allowedOrigins = [
    `http://localhost:${port}`,
    'http://localhost:3000',
    ...(publicDomain ? [`https://${publicDomain}`] : [])
  ];

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST']
    }
  });

  // Autenticación: exigir JWT válido de Clerk en cada conexión socket
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  io.use(async (socket, next) => {
    try {
      if (!clerkSecretKey) {
        // Sin clave: permitir solo en desarrollo local
        if (dev) return next();
        return next(new Error('server misconfigured'));
      }
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));
      const session = await verifyToken(token, { secretKey: clerkSecretKey });
      socket.data.userId = session.sub;
      next();
    } catch (err) {
      next(new Error('unauthorized'));
    }
  });

  // Generar NPCs iniciales
  console.log('🎮 Iniciando servidor de juego...');
  const initialNPCCount = Math.floor(Math.random() * 6) + 5;
  for (let i = 0; i < initialNPCCount; i++) {
    const npc = generateNPC();
    gameState.npcs.set(npc.id, npc);
  }
  console.log(`✅ Generados ${initialNPCCount} NPCs iniciales`);

  // Respawn de NPCs cada 30 segundos
  setInterval(() => {
    if (gameState.npcs.size < 5) {
      const npc = generateNPC();
      gameState.npcs.set(npc.id, npc);
      io.emit('npc_spawned', npc);
      console.log('🆕 NPC respawneado:', npc.id);
    }
  }, 30000);

  // Socket.IO
  io.on('connection', (socket) => {
    console.log('👤 Jugador conectado:', socket.id);

    // Enviar estado actual del juego al nuevo jugador
    onValidated(socket, 'player_join', parsePlayerJoin, (data) => {
      console.log('🎮 Jugador unido:', data.playerId);
      gameState.players.set(socket.id, data);

      // Enviar estado inicial
      socket.emit('game_state', {
        ships: Array.from(gameState.ships.values()),
        npcs: Array.from(gameState.npcs.values()),
        players: Array.from(gameState.players.values()),
        map: gameState.map
      });

      // Notificar a otros jugadores
      socket.broadcast.emit('player_joined', {
        socketId: socket.id,
        ...data
      });
    });

    // Actualización de posición del barco
    onValidated(socket, 'ship_position_update', parseShipPositionUpdate, (data) => {
      const ship = gameState.ships.get(data.shipId) || {
        id: data.shipId,
        position: data.position,
        rotation: data.rotation || 0,
        health: data.health || 100,
        playerId: gameState.players.get(socket.id)?.playerId
      };

      ship.position = data.position;
      if (data.rotation !== undefined) ship.rotation = data.rotation;
      if (data.health !== undefined) ship.health = data.health;
      ship.lastUpdated = Date.now();

      gameState.ships.set(data.shipId, ship);

      // Emitir a todos excepto al emisor
      socket.broadcast.emit('ship_position_updated', {
        shipId: data.shipId,
        position: data.position,
        rotation: data.rotation,
        health: ship.health,
        socketId: socket.id
      });
    });

    // Disparo de bala
    onValidated(socket, 'fire_bullet', parseFireBullet, (data) => {
      console.log('💥 Disparo desde:', socket.id);
      // Emitir a todos los clientes
      io.emit('bullet_fired', {
        ...data,
        socketId: socket.id
      });
    });

    // Daño a barco
    onValidated(socket, 'ship_damage', parseShipDamage, (data) => {
      const ship = gameState.ships.get(data.shipId);
      if (ship) {
        ship.health = Math.max(0, ship.health - data.damage);
        io.emit('ship_damaged', {
          shipId: data.shipId,
          damage: data.damage,
          newHealth: ship.health
        });
      }
    });

    // Destrucción de NPC
    onValidated(socket, 'npc_destroyed', parseNpcDestroyed, (data) => {
      const npc = gameState.npcs.get(data.npcId);
      if (npc) {
        gameState.map.occupiedPositions = gameState.map.occupiedPositions.filter(pos =>
          calculateDistance(pos, npc.position) > 1
        );
        gameState.npcs.delete(data.npcId);
        io.emit('npc_destroyed', data);
        console.log('☠️ NPC destruido:', data.npcId, '- Recompensa:', data.goldReward);
      }
    });

    // Desconexión
    socket.on('disconnect', () => {
      console.log('👋 Jugador desconectado:', socket.id);
      const player = gameState.players.get(socket.id);
      if (player) {
        gameState.ships.delete(player.shipId);
        gameState.players.delete(socket.id);
        socket.broadcast.emit('player_left', {
          socketId: socket.id,
          playerId: player.playerId,
          shipId: player.shipId
        });
      }
    });
  });

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`🚀 Servidor listo en http://${hostname}:${port}`);
    console.log(`🔌 Socket.IO listo para conexiones`);
  });
});

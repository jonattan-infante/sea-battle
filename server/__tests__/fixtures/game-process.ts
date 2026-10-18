// Servidor de juego en un proceso aparte, para los tests que lo matan de verdad (AC-129, AC-130): el mismo arranque que
// server/index.ts (BD, migración y persistencia, server/bootstrap.ts) y el mismo apagado con SIGTERM (server/shutdown.ts),
// sin Next.js. Lo lanza game-child.ts, que le manda órdenes de prueba por IPC (sumar oro o XP como si fuera botín)
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { addXp } from '../../../src/game/xp';
import { startGame } from '../../bootstrap';
import { installShutdown } from '../../shutdown';

export type ChildCommand = { id: number; type: 'addGold' | 'addXp'; userId: string; amount: number };

async function main(): Promise<void> {
  // Next.js escucha uncaughtException y solo lo escribe con console.error, sin tumbar el proceso (15.5.27:
  // node_modules/next/dist/server/next-server.js:216). server/index.ts lo carga y este proceso no: TEST_LOG_UNCAUGHT=1
  // pone el mismo listener (AC-203)
  if (process.env.TEST_LOG_UNCAUGHT === '1') process.on('uncaughtException', (err) => console.error(err));
  const httpServer = createServer();
  const io = new Server(httpServer);
  const log = (msg: string) => console.log(msg);
  const saveIntervalMs = process.env.TEST_SAVE_INTERVAL_MS ? Number(process.env.TEST_SAVE_INTERVAL_MS) : undefined;
  const { game, pool } = await startGame(io, process.env, log, { saveIntervalMs });
  installShutdown({ game, io, httpServer, pool, log });
  process.on('message', (cmd: ChildCommand) => {
    const player = game.world.players.get(cmd.userId);
    if (player && cmd.type === 'addGold') player.gold += cmd.amount;
    if (player && cmd.type === 'addXp') addXp(player, cmd.amount);
    process.send?.({ id: cmd.id, ok: !!player });
  });
  httpServer.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
    console.log(`READY ${(httpServer.address() as AddressInfo).port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

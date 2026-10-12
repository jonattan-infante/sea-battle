// Servidor de juego en un proceso aparte, para los tests que lo matan de verdad (AC-129, AC-130): el mismo arranque que
// server/index.ts (BD, migración y persistencia, server/bootstrap.ts) sin Next.js. Lo lanza game-child.ts, que le
// manda órdenes de prueba por IPC (p. ej. sumar oro como si fuera botín)
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { startGame } from '../../bootstrap';

export type ChildCommand = { id: number; type: 'addGold'; userId: string; amount: number };

async function main(): Promise<void> {
  const httpServer = createServer();
  const io = new Server(httpServer);
  const { game } = await startGame(io, process.env, (msg) => console.log(msg));
  process.on('message', (cmd: ChildCommand) => {
    if (cmd.type === 'addGold') {
      const player = game.world.players.get(cmd.userId);
      if (player) player.gold += cmd.amount;
      process.send?.({ id: cmd.id, ok: !!player });
    }
  });
  httpServer.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
    console.log(`READY ${(httpServer.address() as AddressInfo).port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

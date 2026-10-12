// AC-12 (plan de AC-108, bloque 3): un 21.º jugador real. Servidor propio con 20 invitados conectados por socket y un
// navegador que intenta entrar: vuelve a la landing con "Servidor lleno" (GameApp.tsx, ?full=1).
import { expect, test } from '@playwright/test';
import { io, Socket } from 'socket.io-client';
import { MAX_PLAYERS } from '../src/game/constants';
import { C2S, S2C } from '../src/game/protocol';
import { startOwnServer } from './own-server';

const players = async (url: string) => ((await (await fetch(`${url}/healthz`)).json()) as { players: number }).players;

// Un invitado sintético: conecta, se une al mundo y espera la bienvenida
function guest(url: string, i: number, run: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(url, { transports: ['websocket'], reconnection: false, auth: { guest: true, guestId: `capacity-${run}-${String(i).padStart(2, '0')}` } });
    s.once('connect', () => s.emit(C2S.join, { name: `Bot ${i}` }));
    s.once(S2C.welcome, () => resolve(s));
    s.once(S2C.full, () => reject(new Error(`el invitado ${i} recibió "Servidor lleno"`)));
    s.once('connect_error', (err) => reject(err));
  });
}

test.describe('Capacidad', () => {
  test('AC-12: con 20 jugadores conectados, el 21.º (un navegador) vuelve a la landing con "Servidor lleno"', async ({ page }) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0' });
    const sockets: Socket[] = [];
    try {
      const run = Math.random().toString(36).slice(2, 8);
      for (let i = 0; i < MAX_PLAYERS; i++) sockets.push(await guest(server.url, i, run));
      expect(await players(server.url)).toBe(MAX_PLAYERS);

      await page.goto(`${server.url}/game`);
      await page.waitForURL((u) => u.pathname === '/' && u.searchParams.get('full') === '1', { timeout: 30_000 });
      await expect(page.getByTestId('server-full')).toHaveText('Servidor lleno. Inténtalo en unos minutos.');
      // El navegador no ocupó plaza y los 20 siguen dentro
      expect(await players(server.url)).toBe(MAX_PLAYERS);
      expect(sockets.every((s) => s.connected)).toBe(true);
      console.log(`AC-12: ${MAX_PLAYERS} invitados conectados · el navegador acabó en ${page.url()}`);
    } finally {
      sockets.forEach((s) => s.disconnect());
      await server.kill();
    }
  });
});

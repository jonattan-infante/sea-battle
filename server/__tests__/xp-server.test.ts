// E14 con el servidor de juego real (socket.io): el evento de XP en el frame del hundimiento, solo para quien la gana
// (AC-144), y la línea del log de cada hundimiento entre jugadores, con niveles y XP y sin nombres ni ids (AC-148)
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { Socket as ClientSocket } from 'socket.io-client';
import { LEVEL_XP, TICK_RATE } from '../../src/game/constants';
import { C2S } from '../../src/game/protocol';
import { GameEvent, ServerFrame, Ship } from '../../src/game/types';
import { shipOfPlayer, spawnPirate } from '../../src/game/world';
import { createGameServer, GameServer } from '../game-server';
import { joinGame, Joined, sleep } from './fixtures/game-socket';

const testAuth = async (auth: unknown) => ({ userId: (auth as { token: string }).token, guest: false });

let httpServer: HttpServer;
let io: Server;
let game: GameServer;
let url: string;
let logs: string[];
const sockets: ClientSocket[] = [];

async function start(): Promise<void> {
  httpServer = createServer();
  io = new Server(httpServer);
  logs = [];
  game = createGameServer(io, { authenticate: testAuth, seed: 5, spawnNpcs: false, autoStart: false, now: () => 0, log: (m) => logs.push(m) });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
}

afterEach(async () => {
  sockets.splice(0).forEach((c) => c.disconnect());
  game?.stop();
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

async function advance(seconds: number): Promise<void> {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    game.tick();
    if (i % 2 === 1) await sleep(1);
  }
  await sleep(30);
}

const join = (token: string, name: string) => joinGame(url, { token }, name, sockets);
const eventsOf = (frames: ServerFrame[]): GameEvent[] => frames.flatMap((f) => f.e ?? []);
const ONE_HIT = [0, 0.999, 0.999, 0.999]; // una Balandra N1 acierta 1 bala de 30

function place(j: Joined, x: number, z: number): Ship {
  const ship = game.world.ships.get(j.welcome.shipId)!;
  ship.pos = { x, z };
  ship.protectedUntil = 0;
  return ship;
}

function scriptedRng(rolls: readonly number[]): void {
  const queue = [...rolls];
  game.world.rng = () => (queue.length ? queue.shift()! : 0.999);
}

describe('E14 — XP con el servidor de juego real', () => {
  test('AC-144: el frame del hundimiento de un pirata lleva el evento de XP (30) junto al oro, y la vista privada con la XP; el otro jugador, a la vista, no recibe XP', async () => {
    await start();
    const a = await join('user_a', 'Alfa');
    const c = await join('user_c', 'Charlie');
    const shipA = place(a, 300, 300);
    place(c, 320, 300);
    const pirate = spawnPirate(game.world, 0);
    pirate.pos = { x: 300, z: 340 };
    pirate.ai = null;
    pirate.damage = [{ playerId: 'user_a', shipId: shipA.id, amount: 420, at: 0, firstAt: 0 }];
    pirate.hp = 30;
    scriptedRng(ONE_HIT);
    a.c.emit(C2S.attack, { targetId: pirate.id });
    await sleep(30);
    await advance(2);

    const xpFrames = a.frames.filter((f) => f.e?.some((e) => e.type === 'xp'));
    expect(xpFrames).toHaveLength(1);
    const frame = xpFrames[0];
    expect(frame.e!.filter((e) => e.type === 'xp')).toEqual([{ type: 'xp', playerId: 'user_a', xp: 30, pos: expect.any(Object), source: 'kill' }]);
    expect(frame.e!.some((e) => e.type === 'loot' && e.playerId === 'user_a' && e.source === 'kill')).toBe(true);
    expect(frame.e!.some((e) => e.type === 'sunk' && e.shipId === pirate.id)).toBe(true);
    expect(frame.me?.xp).toBe(30);
    expect(game.world.players.get('user_a')!.xp).toBe(30);

    expect(eventsOf(c.frames).some((e) => e.type === 'sunk' && e.shipId === pirate.id)).toBe(true); // lo vio hundirse
    expect(eventsOf(c.frames).filter((e) => e.type === 'xp')).toEqual([]);
    expect(c.me().xp).toBe(0);
    expect(game.world.players.get('user_c')!.xp).toBe(0);
  });

  test('AC-153 (servidor): el nivel de cada jugador viaja en su barco al entrar en el área y después solo al cambiar', async () => {
    await start();
    const a = await join('user_a', 'Alfa');
    game.world.players.get('user_a')!.xp = 50; // a 10 XP del nivel 2
    const c = await join('user_c', 'Charlie');
    const shipA = place(a, 300, 300);
    place(c, 320, 300);
    const pirate = spawnPirate(game.world, 0);
    pirate.pos = { x: 300, z: 340 };
    pirate.ai = null;
    await advance(3); // 3 s sin cambios de nivel
    // Un barco entra en el área con su snapshot completo (lleva `k`); después solo viajan los campos que cambian
    const entries = (id: string) => c.frames.flatMap((f) => (f.s ?? []).filter((s) => s.id === id && 'k' in s));
    const levelDeltas = () => c.frames.flatMap((f) => (f.s ?? []).filter((s) => s.id === shipA.id && !('k' in s) && 'lv' in s));
    expect(entries(shipA.id).map((s) => s.lv)).toEqual([1]);
    expect(entries(pirate.id).map((s) => [s.k, 'lv' in s])).toEqual([['pirate', false]]);
    expect(levelDeltas()).toEqual([]);

    pirate.damage = [{ playerId: 'user_a', shipId: shipA.id, amount: 420, at: game.world.time, firstAt: 0 }];
    pirate.hp = 30;
    scriptedRng(ONE_HIT);
    a.c.emit(C2S.attack, { targetId: pirate.id });
    await sleep(30);
    await advance(3);
    expect(game.world.players.get('user_a')!.xp).toBe(80);
    expect(levelDeltas().map((d) => d.lv)).toEqual([2]);
  });

  test('AC-148: cada hundimiento entre jugadores deja una línea en el log con el nivel de la víctima y de cada atacante y la XP dada, sin nombres ni ids', async () => {
    await start();
    const alpha = await join('user_alpha', 'Alfa');
    const bravo = await join('user_bravo', 'Bravo');
    const charlie = await join('user_charlie', 'Charlie');
    const levels: [string, number][] = [['user_alpha', 10], ['user_bravo', 10], ['user_charlie', 12]];
    for (const [id, level] of levels) game.world.players.get(id)!.xp = LEVEL_XP[level - 1];
    place(alpha, 30, 300);
    const victim = place(bravo, 0, 300);
    const shipC = place(charlie, 0, 340);
    victim.damage = [
      { playerId: 'user_alpha', shipId: shipOfPlayer(game.world, 'user_alpha')!.id, amount: 490, at: 0, firstAt: 0.1 },
      { playerId: 'user_charlie', shipId: shipC.id, amount: 180, at: 0, firstAt: 0.2 }
    ];
    victim.hp = 30;
    scriptedRng(ONE_HIT); // Charlie da el último golpe: 490 / 210 → 70 % y 30 %
    charlie.c.emit(C2S.attack, { targetId: victim.id });
    await sleep(30);
    logs.length = 0;
    await advance(2);

    expect(victim.state).toBe('sinking');
    const lines = logs.filter((l) => /PvP \{/.test(l));
    expect(lines).toEqual(['⚔️  PvP {"victim":10,"attackers":[{"level":10,"xp":70},{"level":12,"xp":15}]}']);
    expect(lines[0]).not.toMatch(/user_|Alfa|Bravo|Charlie/);
    // Cada atacante recibe solo su evento de XP
    expect(eventsOf(alpha.frames).filter((e) => e.type === 'xp')).toEqual([{ type: 'xp', playerId: 'user_alpha', xp: 70, pos: expect.any(Object), source: 'pvp' }]);
    expect(eventsOf(charlie.frames).filter((e) => e.type === 'xp')).toEqual([{ type: 'xp', playerId: 'user_charlie', xp: 15, pos: expect.any(Object), source: 'pvp' }]);
    expect(eventsOf(bravo.frames).filter((e) => e.type === 'xp')).toEqual([]);
  });
});

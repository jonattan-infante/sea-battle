// AC-109 (QA H-10), Jest + socket con reloj inyectable: el servidor avanza solo con tick() (autoStart: false) y el
// test decide el instante de cada mensaje. El cliente envía `respawn` en el momento en que su Zarpar se activa
// (`serverTime() ≥ respawnAt`) con el reloj adelantado `e` respecto al servidor, y el mensaje llega justo antes del
// tick siguiente: el servidor lo procesa con el world.time del último tick, el peor caso (hasta 1 tick por detrás).
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { TICK_RATE } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { ServerFrame } from '../../src/game/types';
import { attack, shipOfPlayer } from '../../src/game/world';
import { createGameServer, GameServer } from '../game-server';

const DT = 1 / TICK_RATE;
const NOT_YET = 'Aún no puedes zarpar';
const testAuth = async (auth: unknown) => ({ userId: (auth as { token: string }).token, guest: false });

let httpServer: HttpServer;
let io: Server;
let game: GameServer;
let clock = 0;
const clients: ClientSocket[] = [];
const flush = (ms = 20) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  httpServer = createServer();
  io = new Server(httpServer);
  clock = 0;
  game = createGameServer(io, { authenticate: testAuth, seed: 7, spawnNpcs: false, autoStart: false, now: () => clock });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  game.stop();
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

async function join(token: string): Promise<{ c: ClientSocket; frames: ServerFrame[] }> {
  const url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  const c = ioClient(url, { transports: ['websocket'], reconnection: false, auth: { token } });
  clients.push(c);
  const frames: ServerFrame[] = [];
  c.on(S2C.frame, (f: ServerFrame) => frames.push(f));
  await new Promise<void>((r) => c.once('connect', () => r()));
  const welcome = new Promise((r) => c.once(S2C.welcome, r));
  c.emit(C2S.join, { name: token });
  await welcome;
  await flush();
  return { c, frames };
}

// Avanza n ticks sin esperar entre ellos (los frames se entregan al final)
async function ticks(n: number) {
  for (let i = 0; i < n; i++) game.tick();
  await flush();
}

// Hunde a V con una andanada de K (todas las balas aciertan) y devuelve el respawnAt que ve el cliente de V
async function sinkVictim(victim: { frames: ServerFrame[] }): Promise<number> {
  const world = game.world;
  const v = shipOfPlayer(world, 'V')!;
  const k = shipOfPlayer(world, 'K')!;
  Object.assign(v, { pos: { x: 300, z: 300 }, destination: null, path: [], speed: 0, protectedUntil: 0, hp: 1 });
  Object.assign(k, { pos: { x: 300, z: 340 }, destination: null, path: [], speed: 0, protectedUntil: 0, reload: 0 });
  expect(attack(world, 'K', v.id).ok).toBe(true);
  for (let i = 0; i < 10 * TICK_RATE && !world.players.get('V')!.death; i++) game.tick();
  await ticks(2); // el frame con la muerte llega al cliente
  const death = [...victim.frames].reverse().find((f) => f.me?.death)?.me?.death;
  expect(death).toBeTruthy();
  return death!.respawnAt;
}

// Zarpar se activa en el cliente cuando su reloj (adelantado `ahead` s) alcanza respawnAt: eso pasa en el instante
// real respawnAt − ahead. El servidor llega hasta el último tick anterior y el mensaje entra antes del siguiente.
// `delayed` ticks de los que tocaban antes de ese instante aún no han corrido (el setInterval se retrasó, QA-6 H-18).
async function sailWithClockAhead(victim: { c: ClientSocket; frames: ServerFrame[] }, ahead: number, delayed = 0) {
  const respawnAt = await sinkVictim(victim);
  const sendAt = respawnAt - ahead;
  await ticks(Math.floor((sendAt - game.world.time) / DT + 1e-6) - delayed);
  const serverTime = game.world.time;
  const mark = victim.frames.length;
  clock += 1000; // la cubeta de intenciones se recarga entre corridas
  victim.c.emit(C2S.respawn);
  await flush();
  const accepted = game.world.players.get('V')!.death === null && shipOfPlayer(game.world, 'V')!.state === 'alive';
  await ticks(4); // los avisos van en el frame siguiente
  const rejected = victim.frames.slice(mark).flatMap((f) => f.n ?? []).filter((n) => n.text === NOT_YET).length;
  if (!accepted) {
    // Rechazado: zarpa ya fuera de la carrera para que la corrida siguiente empiece con el barco a flote
    await ticks(Math.ceil((respawnAt - game.world.time) / DT) + 1);
    clock += 1000;
    victim.c.emit(C2S.respawn);
    await flush();
  }
  return { accepted, rejected, lagMs: (respawnAt - serverTime) * 1000 };
}

describe('AC-109: Zarpar en el mismo frame en que se activa, con el reloj del cliente adelantado', () => {
  test('con el reloj adelantado de 0 a 50 ms, el servidor acepta 20 de 20 y no llega ningún "Aún no puedes zarpar"', async () => {
    const victim = await join('V');
    await join('K');
    const runs: { ahead: number; accepted: boolean; rejected: number; lagMs: number }[] = [];
    for (let i = 0; i < 20; i++) {
      const ahead = (0.05 * i) / 19;
      runs.push({ ahead, ...(await sailWithClockAhead(victim, ahead)) });
    }
    const worst = Math.max(...runs.map((r) => r.lagMs));
    console.log(`AC-109: ${runs.filter((r) => r.accepted).length}/20 aceptados · ${runs.reduce((a, r) => a + r.rejected, 0)} "${NOT_YET}" · el servidor procesó con su reloj hasta ${worst.toFixed(1)} ms antes de respawnAt`);
    expect(runs.filter((r) => r.accepted)).toHaveLength(20);
    expect(runs.reduce((a, r) => a + r.rejected, 0)).toBe(0);
    // El caso límite sí se dio: el servidor procesó algún respawn con su reloj 1 tick (50 ms) antes de los 8 s
    expect(worst).toBeCloseTo(DT * 1000, 0);
  }, 30_000);

  // El 2.º tick de margen (constants.ts:193-196, QA-6 H-18): con el reloj del cliente adelantado hasta 50 ms y el tick
  // anterior retrasado por el setInterval, el servidor procesa el respawn con su world.time 2 ticks (100 ms) antes de
  // respawnAt. Se acepta con 2 ticks de tolerancia; con 1 tick, se rechazaría
  test('con el reloj adelantado hasta 50 ms y 1 tick retrasado por el setInterval, el servidor acepta 20 de 20 con su reloj 100 ms antes de respawnAt', async () => {
    const victim = await join('V');
    await join('K');
    const runs: { ahead: number; accepted: boolean; rejected: number; lagMs: number }[] = [];
    for (let i = 0; i < 20; i++) {
      const ahead = (0.05 * (i + 1)) / 20;
      runs.push({ ahead, ...(await sailWithClockAhead(victim, ahead, 1)) });
    }
    const lags = runs.map((r) => r.lagMs);
    console.log(`AC-109 (tick retrasado): ${runs.filter((r) => r.accepted).length}/20 aceptados · ${runs.reduce((a, r) => a + r.rejected, 0)} "${NOT_YET}" · el servidor procesó con su reloj entre ${Math.min(...lags).toFixed(1)} y ${Math.max(...lags).toFixed(1)} ms antes de respawnAt`);
    expect(runs.filter((r) => r.accepted)).toHaveLength(20);
    expect(runs.reduce((a, r) => a + r.rejected, 0)).toBe(0);
    for (const lag of lags) expect(lag).toBeCloseTo(2 * DT * 1000, 0);
  }, 30_000);

  test('contraste: con el reloj adelantado 150 ms (3 ticks) el servidor lo rechaza con "Aún no puedes zarpar"', async () => {
    const victim = await join('V');
    await join('K');
    const r = await sailWithClockAhead(victim, 0.15);
    expect(r.accepted).toBe(false);
    expect(r.rejected).toBe(1);
  });
});

import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { MAX_PLAYERS, TICK_RATE } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { GameEvent, Notice, ServerFrame, ShipDelta, Welcome } from '../../src/game/types';
import { shipOfPlayer, spawnMerchant } from '../../src/game/world';
import { authenticateHandshake } from '../auth';
import { createGameServer, GameServer, GameServerOptions } from '../game-server';

// Autenticador de prueba: el token es el id de usuario
const testAuth = async (auth: unknown) => {
  const token = (auth as { token?: unknown })?.token;
  if (typeof token !== 'string') throw new Error('unauthorized');
  return { userId: token, guest: false };
};

let httpServer: HttpServer;
let io: Server;
let game: GameServer;
let url: string;
let clock = 0;
const clients: ClientSocket[] = [];

async function start(opts: Partial<GameServerOptions> = {}): Promise<void> {
  httpServer = createServer();
  io = new Server(httpServer);
  clock = 0;
  game = createGameServer(io, { authenticate: testAuth, seed: 11, spawnNpcs: false, autoStart: false, now: () => clock, ...opts });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
}

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  game?.stop();
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

const flush = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// Avanza la simulación y deja que los mensajes lleguen a los clientes
async function advance(seconds: number, everyTick?: (tick: number) => void): Promise<void> {
  const n = Math.round(seconds * TICK_RATE);
  for (let i = 0; i < n; i++) {
    everyTick?.(i);
    game.tick();
    if (i % 2 === 1) await flush(1);
  }
  await flush();
}

function connect(token: string | null): ClientSocket {
  const c = ioClient(url, { transports: ['websocket'], reconnection: false, auth: token ? { token } : {} });
  clients.push(c);
  return c;
}

function once<T>(c: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => c.once(event, resolve));
}

interface Joined {
  c: ClientSocket;
  welcome: Welcome;
  frames: ServerFrame[];
  bytes: () => number;
}

async function join(token: string, name = token): Promise<Joined> {
  const c = connect(token);
  await once(c, 'connect');
  const frames: ServerFrame[] = [];
  let bytes = 0;
  c.on(S2C.frame, (f: ServerFrame) => {
    frames.push(f);
    bytes += JSON.stringify([S2C.frame, f]).length + 2; // "42" de Socket.IO
  });
  const welcomeP = once<Welcome>(c, S2C.welcome);
  c.emit(C2S.join, { name });
  const welcome = await welcomeP;
  await flush();
  return { c, welcome, frames, bytes: () => bytes };
}

const noticesOf = (frames: ServerFrame[]): Notice[] => frames.flatMap((f) => f.n ?? []);
const eventsOf = (frames: ServerFrame[]): GameEvent[] => frames.flatMap((f) => f.e ?? []);
const deltasOf = (frames: ServerFrame[], id: string): ShipDelta[] => frames.flatMap((f) => (f.s ?? []).filter((s) => s.id === id));

describe('Servidor — conexión y snapshot inicial', () => {
  beforeEach(() => start());

  test('AC-08: sin credenciales válidas la conexión se rechaza antes de unirse al mundo', async () => {
    const c = connect(null);
    const err = await once<Error>(c, 'connect_error');
    expect(err.message).toBe('unauthorized');
    expect(game.world.players.size).toBe(0);
  });

  test('AC-08: con el autenticador real y sin modo invitado, un JWT inválido se rechaza', async () => {
    game.stop();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await start({ authenticate: (auth) => authenticateHandshake(auth, { CLERK_SECRET_KEY: 'sk_test_dummy' }) });
    const c = connect('no-es-un-jwt');
    const err = await once<Error>(c, 'connect_error');
    expect(err.message).toBe('unauthorized');
  });

  test('al unirse recibe welcome y un snapshot completo con su barco y su vista privada', async () => {
    const a = await join('u1', 'Jonattan');
    expect(a.welcome).toMatchObject({ playerId: 'u1', tickRate: 20, snapshotRate: 10, interestRadius: 300 });
    const first = a.frames[0];
    expect(first.full).toBe(true);
    expect(first.s!.some((s) => s.id === a.welcome.shipId && s.n === 'Jonattan')).toBe(true);
    expect(first.me).toMatchObject({ id: 'u1', gold: 100, activeShip: 'sloop' });
  });

  test('AC-11: una intención de movimiento llega como delta al otro jugador', async () => {
    const a = await join('a');
    const b = await join('b');
    const ship = game.world.ships.get(a.welcome.shipId)!;
    const start0 = { ...ship.pos };
    a.c.emit(C2S.moveTo, { x: start0.x + 40, z: start0.z });
    await flush();
    await advance(2);
    const moved = deltasOf(b.frames, a.welcome.shipId).filter((d) => d.x !== undefined);
    expect(moved.length).toBeGreaterThan(5);
    expect(Math.abs(moved[moved.length - 1].x! - start0.x)).toBeGreaterThan(3);
  });

  test('AC-12: el jugador 21 recibe "Servidor lleno"', async () => {
    for (let i = 0; i < MAX_PLAYERS; i++) await join(`p${i}`);
    const c = connect('extra');
    await once(c, 'connect');
    const full = once<{ text: string }>(c, S2C.full);
    c.emit(C2S.join, {});
    expect((await full).text).toBe('Servidor lleno');
    expect(game.onlinePlayers()).toBe(MAX_PLAYERS);
  });

  test('una segunda pestaña del mismo usuario desconecta la primera', async () => {
    const first = await join('u1');
    const kicked = once<{ text: string }>(first.c, S2C.kicked);
    await join('u1');
    expect((await kicked).text).toBe('Has abierto el juego en otra pestaña');
    await flush();
    expect(game.onlinePlayers()).toBe(1);
    expect([...game.world.ships.values()].filter((s) => s.ownerId === 'u1')).toHaveLength(1);
  });
});

describe('Servidor — latencia de una orden (AC-14 b)', () => {
  test('con el bucle real, el primer frame con el barco propio en movimiento llega ≤ 200 ms después del moveTo (10 corridas)', async () => {
    await start({ autoStart: true, now: Date.now });
    const a = await join('lat');
    const ship = game.world.ships.get(a.welcome.shipId)!;
    const samples: number[] = [];
    for (let run = 0; run < 10; run++) {
      // Barco quieto antes de cada corrida
      a.c.emit(C2S.stop, {});
      await new Promise((r) => setTimeout(r, 120 + run * 13)); // fase distinta respecto al tick en cada corrida
      ship.speed = 0;
      ship.destination = null;
      ship.path = [];
      await flush(60);
      const dir = run % 2 === 0 ? 1 : -1;
      const moving = new Promise<number>((resolve) => {
        const handler = (f: ServerFrame) => {
          if (deltasOf([f], ship.id).some((d) => (d.s ?? 0) > 0)) {
            a.c.off(S2C.frame, handler);
            resolve(performance.now());
          }
        };
        a.c.on(S2C.frame, handler);
      });
      const t0 = performance.now();
      a.c.emit(C2S.moveTo, { x: ship.pos.x + 30 * dir, z: ship.pos.z });
      samples.push((await moving) - t0);
    }
    console.log(`AC-14 (b): ${samples.map((v) => v.toFixed(0)).join(', ')} ms`);
    expect(Math.max(...samples)).toBeLessThanOrEqual(200);
  }, 30_000);
});

describe('Servidor — validación de intenciones', () => {
  beforeEach(() => start());

  test('AC-05: payloads inválidos se descartan, el estado no cambia y el proceso sigue vivo', async () => {
    const a = await join('a');
    const ship = game.world.ships.get(a.welcome.shipId)!;
    const before = JSON.stringify({ pos: ship.pos, dest: ship.destination, t: ship.attackTargetId, r: ship.repairing, gold: game.world.players.get('a')!.gold });
    const garbage = [null, 'x', 42, [], { x: NaN, z: 0 }, { x: Infinity, z: 1 }, { targetId: 'a'.repeat(300) }, { x: 1, z: 1, extra: 1 }, { itemId: 'hull:9' }, { on: 'yes' }];
    for (const ev of [...Object.values(C2S), 'hack', 'constructor']) for (const p of garbage) a.c.emit(ev, p);
    await flush(80);
    expect(JSON.stringify({ pos: ship.pos, dest: ship.destination, t: ship.attackTargetId, r: ship.repairing, gold: game.world.players.get('a')!.gold })).toBe(before);
    // Sigue atendiendo
    clock += 5000;
    a.c.emit(C2S.repair, { on: true });
    await flush();
    await advance(0.1);
    expect(noticesOf(a.frames).map((n) => n.text)).toContain('El casco ya está intacto');
  });

  test('AC-06: de 50 intenciones en 1 s se procesan 20 (ráfaga) y luego 10/s', async () => {
    const a = await join('a');
    for (let i = 0; i < 50; i++) a.c.emit(C2S.repair, { on: true }); // cada una procesada genera un aviso
    await flush(80);
    await advance(0.1);
    expect(noticesOf(a.frames)).toHaveLength(20);
    a.frames.length = 0;
    clock += 1000;
    for (let i = 0; i < 50; i++) a.c.emit(C2S.repair, { on: true });
    await flush(80);
    await advance(0.1);
    expect(noticesOf(a.frames)).toHaveLength(10);
  });

  test('AC-07: atacar a uno mismo, a un id inexistente o a un barco hundiéndose se rechaza', async () => {
    const a = await join('a');
    const ship = game.world.ships.get(a.welcome.shipId)!;
    const sinking = spawnMerchant(game.world);
    sinking.pos = { x: ship.pos.x, z: ship.pos.z + 20 };
    sinking.state = 'sinking';
    for (const targetId of [ship.id, 'ship-9999', sinking.id]) a.c.emit(C2S.attack, { targetId });
    await flush();
    await advance(0.1);
    expect(ship.attackTargetId).toBeNull();
    expect(noticesOf(a.frames).filter((n) => n.kind === 'error')).toHaveLength(3);
  });

  test('AC-68: compras forjadas (fuera de la zona, N3 sin N2, barco ya poseído) no cambian oro ni mejoras', async () => {
    const a = await join('a');
    const player = game.world.players.get('a')!;
    player.gold = 99_999;
    const before = JSON.stringify({ g: player.gold, u: player.upgrades, o: player.ownedShips });
    a.c.emit(C2S.buy, { itemId: 'cannons:3' });
    await flush();
    game.world.ships.get(a.welcome.shipId)!.pos = { x: 300, z: 300 };
    a.c.emit(C2S.buy, { itemId: 'cannons:2' });
    a.c.emit(C2S.buy, { itemId: 'ship:brig' });
    await flush();
    await advance(0.1);
    expect(JSON.stringify({ g: player.gold, u: player.upgrades, o: player.ownedShips })).toBe(before);
    expect(noticesOf(a.frames).filter((n) => n.kind === 'error')).toHaveLength(3);
  });
});

describe('Servidor — red y conexión', () => {
  test('AC-87: sin NPC y con 2 jugadores quietos, en 10 s no se envía ningún frame', async () => {
    await start();
    const a = await join('a');
    const b = await join('b');
    await advance(1); // asentarse tras la entrada
    a.frames.length = 0;
    b.frames.length = 0;
    await advance(10);
    expect(a.frames).toHaveLength(0);
    expect(b.frames).toHaveLength(0);
  });

  test('AC-96 / AC-13: desconectado sigue atacable 10 s; si reconecta recupera el barco; si no, sale del mundo', async () => {
    await start();
    const a = await join('a');
    const b = await join('b');
    const shipA = game.world.ships.get(a.welcome.shipId)!;
    shipA.hp = 555;
    shipA.pos = { x: 300, z: 300 };
    shipA.protectedUntil = 0;
    const shipB = game.world.ships.get(b.welcome.shipId)!;
    shipB.pos = { x: 300, z: 330 };
    shipB.protectedUntil = 0;
    a.c.disconnect();
    await flush();
    await advance(5);
    expect(game.world.ships.has(shipA.id)).toBe(true);
    b.c.emit(C2S.attack, { targetId: shipA.id });
    await flush();
    expect(shipB.attackTargetId).toBe(shipA.id);
    b.c.emit(C2S.cancelAttack, {});
    await flush();
    shipA.hp = 555;
    const again = await join('a');
    expect(again.welcome.shipId).toBe(shipA.id);
    expect(shipOfPlayer(game.world, 'a')!.hp).toBe(555);

    again.c.disconnect();
    await flush();
    b.frames.length = 0;
    await advance(10.5);
    expect(game.world.ships.has(shipA.id)).toBe(false);
    expect(b.frames.some((f) => f.r?.includes(shipA.id))).toBe(true);
  });

  test('atacar un NPC produce andanadas e impactos en los frames del atacante', async () => {
    await start();
    const a = await join('a');
    const ship = game.world.ships.get(a.welcome.shipId)!;
    ship.pos = { x: 200, z: 200 };
    const merchant = spawnMerchant(game.world);
    merchant.pos = { x: 200, z: 230 };
    merchant.ai = null;
    a.c.emit(C2S.attack, { targetId: merchant.id });
    await flush();
    await advance(1.5);
    const events = eventsOf(a.frames);
    expect(events.some((e) => e.type === 'volley' && e.shipId === ship.id)).toBe(true);
    expect(events.some((e) => e.type === 'impact' && e.byShipId === ship.id)).toBe(true);
  });

  test('AC-88: con 20 clientes y 20 NPC en combate, cada cliente recibe ≤ 10 mensajes/s y ≤ 12 KB/s (30 s)', async () => {
    await start({ spawnNpcs: true });
    const bots: Joined[] = [];
    for (let i = 0; i < MAX_PLAYERS; i++) bots.push(await join(`bot${i}`, `Bot ${i}`));
    const baseline = bots.map((b) => ({ frames: b.frames.length, bytes: b.bytes() }));
    await advance(30, (tick) => {
      if (tick % (2 * TICK_RATE) !== 0) return;
      clock += 2000;
      for (let i = 0; i < bots.length; i++) {
        const me = shipOfPlayer(game.world, `bot${i}`);
        if (!me) continue;
        if (me.state === 'dead') {
          bots[i].c.emit(C2S.respawn, {});
          continue;
        }
        let best = null;
        for (const s of game.world.ships.values()) {
          if (s.kind === 'player' || s.state !== 'alive') continue;
          if (!best || Math.hypot(s.pos.x - me.pos.x, s.pos.z - me.pos.z) < Math.hypot(best.pos.x - me.pos.x, best.pos.z - me.pos.z)) best = s;
        }
        if (best) {
          bots[i].c.emit(C2S.attack, { targetId: best.id });
          bots[i].c.emit(C2S.moveTo, { x: best.pos.x, z: best.pos.z });
        }
      }
    });
    const rates = bots.map((b, i) => ({
      msgs: (b.frames.length - baseline[i].frames) / 30,
      kbps: (b.bytes() - baseline[i].bytes) / 30 / 1024
    }));
    const worst = { msgs: Math.max(...rates.map((r) => r.msgs)), kbps: Math.max(...rates.map((r) => r.kbps)) };
    const volleys = bots.reduce((n, b) => n + eventsOf(b.frames).filter((e) => e.type === 'volley').length, 0);
    console.log(`AC-88: peor cliente ${worst.msgs.toFixed(2)} msg/s, ${worst.kbps.toFixed(2)} KB/s; media ${(rates.reduce((a, r) => a + r.kbps, 0) / rates.length).toFixed(2)} KB/s; andanadas vistas ${volleys}`);
    expect(volleys).toBeGreaterThan(50); // hubo combate de verdad
    expect(worst.msgs).toBeLessThanOrEqual(10);
    expect(worst.kbps).toBeLessThanOrEqual(12);
  }, 60_000);
});

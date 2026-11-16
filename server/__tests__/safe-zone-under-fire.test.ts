// E20 — Zona segura bajo fuego con el servidor real y clientes Socket.IO (GDD §11; BACKLOG AC-246 a AC-252 y AC-257 a, b).
// La regla vive en la simulación (src/game/__tests__/safe-zone-under-fire.test.ts); aquí, las intenciones reales y lo que
// viaja: los rechazos, la vida y el ataque en los snapshots, el oro de la vista privada y el campo `uf` del barco
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { DEATH_COUNTDOWN, SPAWN_PROTECTION, TICK_RATE, UNDER_FIRE_WINDOW } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import { GameEvent, Notice, ServerFrame, Ship, ShipDelta, Welcome } from '../../src/game/types';
import { isUnderFire, PORT_UNDER_FIRE_TEXT, spawnMerchant, spawnPirate } from '../../src/game/world';
import { createGameServer, GameServer, GameServerOptions } from '../game-server';
import type { ProgressStore, StoredProgress } from '../persistence';

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
  game = createGameServer(io, { authenticate: testAuth, seed: 7, spawnNpcs: false, autoStart: false, now: () => clock, ...opts });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
}

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  game?.stop();
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

const flush = (ms = 30) => new Promise((r) => setTimeout(r, ms));

async function advance(seconds: number, everyTick?: () => void): Promise<void> {
  const n = Math.round(seconds * TICK_RATE);
  for (let i = 0; i < n; i++) {
    everyTick?.();
    game.tick();
    if (i % 2 === 1) await flush(1);
  }
  await flush();
}

interface Joined {
  c: ClientSocket;
  welcome: Welcome;
  frames: ServerFrame[];
  ship: () => Ship;
  emit: (event: string, payload: unknown) => Promise<void>;
}

async function join(token: string): Promise<Joined> {
  const c = ioClient(url, { transports: ['websocket'], reconnection: false, auth: { token } });
  clients.push(c);
  await new Promise<void>((resolve) => c.once('connect', () => resolve()));
  const frames: ServerFrame[] = [];
  c.on(S2C.frame, (f: ServerFrame) => frames.push(f));
  const welcomeP = new Promise<Welcome>((resolve) => c.once(S2C.welcome, resolve));
  c.emit(C2S.join, { name: token });
  const welcome = await welcomeP;
  await flush();
  return {
    c,
    welcome,
    frames,
    ship: () => game.world.ships.get(welcome.shipId)!,
    emit: async (event, payload) => {
      c.emit(event, payload);
      await flush();
    }
  };
}

// Coloca el barco de un jugador sin protección de reaparición, parado
function place(j: Joined, x: number, z: number): Ship {
  const ship = j.ship();
  ship.pos = { x, z };
  ship.protectedUntil = 0;
  ship.destination = null;
  ship.path = [];
  ship.speed = 0;
  return ship;
}

// Blanco NPC inmóvil y sin IA
function dummy(x: number, z: number): Ship {
  const m = spawnMerchant(game.world);
  m.pos = { x, z };
  m.ai = null;
  m.destination = null;
  m.path = [];
  m.hp = m.maxHp = 1e6;
  return m;
}

const noticesOf = (frames: ServerFrame[]): Notice[] => frames.flatMap((f) => f.n ?? []);
const errorsOf = (frames: ServerFrame[]) => noticesOf(frames).filter((n) => n.kind === 'error').map((n) => n.text);
const eventsOf = (frames: ServerFrame[]): GameEvent[] => frames.flatMap((f) => f.e ?? []);
const volleysAgainst = (frames: ServerFrame[], id: string) => eventsOf(frames).filter((e) => e.type === 'volley' && e.targetId === id);
const deltasOf = (frames: ServerFrame[], id: string): ShipDelta[] => frames.flatMap((f) => (f.s ?? []).filter((s) => s.id === id));

// Avanza tick a tick hasta que `shooter` lanza una andanada; devuelve el world.time de ese tick
async function untilVolley(shooter: Ship, maxSeconds = 10, everyTick?: () => void): Promise<number> {
  let at = -1;
  const before = game.world.events.length;
  for (let i = 0; i < maxSeconds * TICK_RATE && at < 0; i++) {
    everyTick?.();
    const reload = shooter.reload;
    game.tick();
    if (shooter.reload > reload) at = game.world.time; // la recarga solo sube al disparar
    if (i % 2 === 1) await flush(1);
  }
  await flush();
  if (at < 0) throw new Error(`${shooter.id} no disparó en ${maxSeconds} s (${before})`);
  return at;
}

describe('E20 con el servidor real: combate', () => {
  beforeEach(() => start());

  test('AC-246: el `attack` real de un hostil contra quien está dentro sin marca se rechaza, y en 20 s no se le lanza ninguna andanada', async () => {
    const b = await join('b');
    const h = await join('h');
    const shipB = place(b, 0, 100);
    const hostile = place(h, 0, 140);
    hostile.hp = hostile.maxHp = 1e6;
    const pirate = spawnPirate(game.world, 0);
    Object.assign(pirate, { pos: { x: 0, z: 135 }, anchored: true, holdPosition: true, accuracyOverride: 0 });
    pirate.ai!.origin = { x: 0, z: 135 };
    for (let k = 0; k < 4; k++) {
      await h.emit(C2S.attack, { targetId: shipB.id });
      expect(hostile.attackTargetId).toBeNull();
      await advance(5, () => (shipB.speed = 0));
    }
    expect(errorsOf(h.frames)).toEqual(Array(4).fill('No puedes atacar ese objetivo'));
    expect(volleysAgainst(b.frames, shipB.id)).toHaveLength(0);
    expect(volleysAgainst(h.frames, shipB.id)).toHaveLength(0);
    expect(deltasOf(b.frames, shipB.id).every((d) => d.uf === undefined || d.uf === 0)).toBe(true);
    expect(shipB.underFireUntil).toBe(-Infinity);
  });

  test('AC-247: con 2 clientes, el ataque de A sigue cuando B entra bajo fuego, le quita vida, y termina 10 s después de su última andanada', async () => {
    const a = await join('a');
    const b = await join('b');
    const shipA = place(a, 0, 150);
    const shipB = place(b, 0, 180);
    shipA.accuracyOverride = 1;
    shipB.hp = shipB.maxHp = 1e5;
    await a.emit(C2S.attack, { targetId: shipB.id });
    await untilVolley(shipA);
    place(b, 0, 100); // entra en la zona con la andanada en vuelo
    b.frames.length = 0;
    let last = -1;
    for (let k = 0; k < 2; k++) last = await untilVolley(shipA, 10, () => (shipB.pos = { x: 0, z: 100 }));
    await advance(1);
    const hpInside = deltasOf(b.frames, shipB.id).flatMap((d) => (d.hp === undefined ? [] : [d.hp]));
    expect(hpInside.length).toBeGreaterThanOrEqual(2);
    expect(hpInside.every((hp, i) => i === 0 || hp < hpInside[i - 1])).toBe(true);
    expect(shipA.attackTargetId).toBe(shipB.id);

    place(a, 0, 260); // deja de disparar: fuera de alcance, con el ataque aún vivo (≤ 200 m)
    a.frames.length = 0;
    await advance(UNDER_FIRE_WINDOW + 1, () => (shipA.pos = { x: 0, z: 260 }));
    const end = a.frames.find((f) => (f.s ?? []).some((s) => s.id === shipA.id && s.t === null));
    expect(end).toBeDefined();
    expect(end!.t).toBeGreaterThanOrEqual(last + UNDER_FIRE_WINDOW);
    expect(end!.t).toBeLessThanOrEqual(last + UNDER_FIRE_WINDOW + 0.1 + 1e-9);
    expect(isUnderFire(game.world, shipB)).toBe(false);
  });

  test('AC-248: PvP desde dentro con intenciones reales, un caso por letra', async () => {
    const a = await join('a');
    const b = await join('b');
    const c = await join('c');
    const shipA = place(a, 0, 150);
    const shipB = place(b, 0, 100);
    const shipC = place(c, -20, 90);
    const merchant = dummy(30, 100);
    // (a) B, dentro y sin marca, contra A, fuera: se rechaza
    await b.emit(C2S.attack, { targetId: shipA.id });
    expect(shipB.attackTargetId).toBeNull();
    expect(errorsOf(b.frames.splice(0))).toEqual([]); // el aviso llega con el siguiente frame
    await advance(0.1);
    expect(errorsOf(b.frames)).toEqual(['No puedes atacar ese objetivo']);
    // (b) B, dentro y bajo fuego porque hace < 10 s disparó a un mercante, contra A: se acepta, y A puede atacar a B
    await b.emit(C2S.attack, { targetId: merchant.id });
    await untilVolley(shipB);
    await b.emit(C2S.cancelAttack, {});
    await advance(2);
    expect(isUnderFire(game.world, shipB)).toBe(true);
    await b.emit(C2S.attack, { targetId: shipA.id });
    expect(shipB.attackTargetId).toBe(shipA.id);
    await a.emit(C2S.attack, { targetId: shipB.id });
    expect(shipA.attackTargetId).toBe(shipB.id);
    // (c) C, dentro y sin marca, contra B, dentro y bajo fuego: se rechaza
    await c.emit(C2S.attack, { targetId: shipB.id });
    expect(shipC.attackTargetId).toBeNull();
    // (d) C sale de la zona y lo envía de nuevo: se acepta
    place(c, -20, 125);
    await c.emit(C2S.attack, { targetId: shipB.id });
    expect(shipC.attackTargetId).toBe(shipB.id);
    await advance(0.1);
    expect(errorsOf(c.frames)).toEqual(['No puedes atacar ese objetivo']);
  });

  test('AC-250: hundido dentro bajo fuego: el oro de los 2 como fuera, y al zarpar el barco llega con `uf` 0 y 15 s de protección', async () => {
    const v = await join('v');
    const k = await join('k');
    const victim = place(v, 0, 100);
    place(k, 0, 140);
    game.world.players.get('v')!.gold = 500;
    const merchant = dummy(30, 100);
    await v.emit(C2S.attack, { targetId: merchant.id });
    await untilVolley(victim);
    await v.emit(C2S.cancelAttack, {});
    await advance(0.5);
    expect(deltasOf(v.frames, victim.id).some((d) => (d.uf ?? 0) > 0)).toBe(true); // la marca viajó
    victim.hp = 1;
    game.world.rng = () => 0;
    await k.emit(C2S.attack, { targetId: victim.id });
    await advance(2);
    expect(victim.state).toBe('sinking');
    const lastMe = (j: Joined) => [...j.frames].reverse().find((f) => f.me)!.me!;
    expect(lastMe(v)).toMatchObject({ gold: 450, death: { by: game.world.players.get('k')!.name, goldLost: 50 } });
    expect(lastMe(k).gold).toBe(150);
    await advance(DEATH_COUNTDOWN);
    v.frames.length = 0;
    await v.emit(C2S.respawn, {});
    await advance(0.1);
    const back = deltasOf(v.frames, victim.id);
    expect(back.length).toBeGreaterThan(0);
    const full = back.find((d) => d.st === 'alive' && d.uf !== undefined)!;
    expect(full.uf).toBe(0);
    expect(full.pu! - game.world.time).toBeGreaterThan(SPAWN_PROTECTION - 0.2);
    expect(isUnderFire(game.world, victim)).toBe(false);
  });
});

describe('E20 con el servidor real: el puerto cierra bajo fuego (AC-252)', () => {
  // Almacén en memoria: con él, el jugador lleva progreso guardado y la tienda va por planBuy / planSelectShip y la BD
  function memoryStore() {
    const rows = new Map<string, StoredProgress>();
    const saves: string[] = [];
    const store: ProgressStore = {
      load: async (userId) => rows.get(userId) ?? null,
      save: async (userId, progress, revision) => {
        saves.push(userId);
        const next = revision + 1;
        rows.set(userId, { progress, revision: next });
        return next;
      },
      ping: async () => {}
    };
    return { store, saves };
  }

  async function underFireInPort() {
    const p = await join('p');
    const ship = place(p, 0, 80);
    const player = game.world.players.get('p')!;
    player.gold = 99_999;
    player.ships.frigate = { cannons: 1, hull: 1, sails: 1 }; // las mejoras son de cada barco (1.3, E19)
    const merchant = dummy(30, 80);
    await p.emit(C2S.attack, { targetId: merchant.id });
    await untilVolley(ship);
    await p.emit(C2S.cancelAttack, {});
    ship.hp = 500;
    await advance(0.2);
    p.frames.length = 0;
    const progress = () => JSON.stringify({ g: player.gold, s: player.ships, a: player.activeShip, c: ship.classId, hp: ship.hp });
    return { p, ship, player, progress };
  }

  test.each([
    ['sin progreso guardado (buy y selectShip en el acto)', false],
    ['con progreso guardado (planBuy, planSelectShip y la BD)', true]
  ])('%s: bajo fuego se rechazan con el motivo de bajo fuego y nada cambia; al caducar la marca se aceptan', async (_label, persisted) => {
    game.stop();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    const mem = memoryStore();
    await start(persisted ? { store: mem.store } : {});
    const { p, ship, player, progress } = await underFireInPort();
    const before = progress();
    const savesBefore = mem.saves.length;
    await p.emit(C2S.buy, { itemId: 'cannons:2', ship: 'sloop' });
    await p.emit(C2S.buy, { itemId: 'ship:brig' });
    await p.emit(C2S.selectShip, { classId: 'frigate' });
    await advance(0.2);
    expect(errorsOf(p.frames)).toEqual([PORT_UNDER_FIRE_TEXT, PORT_UNDER_FIRE_TEXT, PORT_UNDER_FIRE_TEXT]);
    expect(progress()).toBe(before);
    expect(mem.saves.length).toBe(savesBefore);

    // Fuera de la zona, el motivo de hoy
    p.frames.length = 0;
    place(p, 300, 300);
    await p.emit(C2S.buy, { itemId: 'cannons:2', ship: 'sloop' });
    await p.emit(C2S.selectShip, { classId: 'frigate' });
    await advance(0.1);
    expect(errorsOf(p.frames)).toEqual(['El astillero solo abre en el puerto', 'Solo puedes cambiar de barco en el puerto']);

    // Al caducar la marca, dentro, la misma intención se acepta
    place(p, 0, 80);
    await advance(UNDER_FIRE_WINDOW, () => (ship.pos = { x: 0, z: 80 }));
    expect(isUnderFire(game.world, ship)).toBe(false);
    p.frames.length = 0;
    await p.emit(C2S.buy, { itemId: 'cannons:2', ship: 'sloop' });
    await advance(0.2);
    await p.emit(C2S.selectShip, { classId: 'frigate' });
    await advance(0.2);
    expect(errorsOf(p.frames)).toEqual([]);
    expect(player.ships.sloop?.cannons).toBe(2);
    expect(ship.classId).toBe('frigate');
  });

  // Precisado por producto el 2026-11-16 (BACKLOG AC-252, con familias, PR #88): cambiar de familia es del Astillero, que
  // bajo fuego cierra. La intención va a una familia que el jugador tiene y no usa
  test.each([
    ['sin progreso guardado (selectFamily en el acto)', false],
    ['con progreso guardado (planSelectFamily y la BD)', true]
  ])('%s: selectFamily bajo fuego se rechaza con su motivo y sin escribir; fuera, con el de fuera; al caducar la marca, se acepta', async (_label, persisted) => {
    game.stop();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    const mem = memoryStore();
    await start(persisted ? { store: mem.store } : {});
    const { p, ship, player } = await underFireInPort();
    player.families = ['gb', 'es'];
    player.family = 'none';
    const look = () => JSON.stringify({ fs: player.families, f: player.family });
    const before = look();
    const savesBefore = mem.saves.length;
    const familyDeltas = () => deltasOf(p.frames, ship.id).filter((d) => d.fa !== undefined).map((d) => d.fa);

    // (a) Dentro y bajo fuego
    expect(isUnderFire(game.world, ship)).toBe(true);
    await p.emit(C2S.selectFamily, { family: 'gb' });
    await advance(0.2);
    expect(errorsOf(p.frames)).toEqual([PORT_UNDER_FIRE_TEXT]);
    expect(look()).toBe(before);
    expect(familyDeltas()).toEqual([]);
    expect(mem.saves.length).toBe(savesBefore);

    // (b) Fuera de la zona, con la marca y sin ella
    const markedUntil = ship.underFireUntil; // la marca de la andanada real, para dejarla caducar en (c)
    for (const marked of [true, false]) {
      p.frames.length = 0;
      place(p, 300, 300);
      if (!marked) ship.underFireUntil = -Infinity;
      await p.emit(C2S.selectFamily, { family: 'gb' });
      await advance(0.1);
      expect(errorsOf(p.frames)).toEqual(['Solo puedes cambiar de familia en el puerto']);
      expect(look()).toBe(before);
      expect(mem.saves.length).toBe(savesBefore);
    }

    // (c) Dentro, al caducar la marca: la misma intención se acepta, se escribe una vez si hay BD y el cambio viaja
    place(p, 0, 80);
    ship.underFireUntil = markedUntil;
    expect(isUnderFire(game.world, ship)).toBe(true);
    await advance(markedUntil - game.world.time + 0.2, () => (ship.pos = { x: 0, z: 80 }));
    expect(isUnderFire(game.world, ship)).toBe(false);
    p.frames.length = 0;
    await p.emit(C2S.selectFamily, { family: 'gb' });
    await advance(0.2);
    expect(errorsOf(p.frames)).toEqual([]);
    expect(player.family).toBe('gb');
    expect(player.families).toEqual(['gb', 'es']);
    expect(familyDeltas()).toEqual(['gb']);
    expect(mem.saves.length).toBe(savesBefore + (persisted ? 1 : 0));
  });
});

describe('E20 con el servidor real: red (AC-257 a y b)', () => {
  beforeEach(() => start());

  test('AC-257 (a): la marca caduca sin tráfico: con 2 jugadores quietos, en 10 s que incluyen el fin de la marca, ninguno recibe frames', async () => {
    const a = await join('a');
    const b = await join('b');
    const shipA = place(a, 0, 80);
    place(b, 0, -80);
    const merchant = dummy(30, 80);
    await a.emit(C2S.attack, { targetId: merchant.id });
    const t = await untilVolley(shipA);
    await a.emit(C2S.cancelAttack, {});
    await advance(2); // impacto y asentarse
    expect(isUnderFire(game.world, shipA)).toBe(true);
    a.frames.length = 0;
    b.frames.length = 0;
    await advance(10);
    expect(game.world.time).toBeGreaterThan(t + UNDER_FIRE_WINDOW);
    expect(isUnderFire(game.world, shipA)).toBe(false);
    expect(a.frames).toHaveLength(0);
    expect(b.frames).toHaveLength(0);
  });

  test('AC-257 (b): en combate, el `uf` de un barco viaja como mucho una vez por andanada que lo afecta', async () => {
    const a = await join('a');
    const b = await join('b');
    const shipA = place(a, 0, 200);
    const shipB = place(b, 0, 230);
    for (const s of [shipA, shipB]) s.hp = s.maxHp = 1e6;
    const pirate = spawnPirate(game.world, 0);
    Object.assign(pirate, { pos: { x: 40, z: 200 }, anchored: true, holdPosition: true });
    pirate.ai!.origin = { x: 40, z: 200 };
    pirate.hp = pirate.maxHp = 1e6;
    await a.emit(C2S.attack, { targetId: shipB.id });
    await b.emit(C2S.attack, { targetId: shipA.id });
    a.frames.length = 0;
    await advance(30, () => {
      shipA.speed = 0;
      shipB.speed = 0;
    });
    for (const id of [shipA.id, shipB.id]) {
      const involving = (f: ServerFrame) => (f.e ?? []).filter((e) => e.type === 'volley' && (e.shipId === id || e.targetId === id)).length;
      const withUf = a.frames.filter((f) => (f.s ?? []).some((s) => s.id === id && s.uf !== undefined));
      const volleys = a.frames.reduce((n, f) => n + involving(f), 0);
      console.log(`AC-257 (b): ${id} · ${withUf.length} cambios de uf · ${volleys} andanadas que lo afectan`);
      expect(volleys).toBeGreaterThan(10);
      expect(withUf.length).toBeLessThanOrEqual(volleys);
      expect(withUf.every((f) => involving(f) > 0)).toBe(true); // cada cambio llega con una andanada que lo afecta
    }
  });
});

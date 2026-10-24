// AC-137 (I2 latente en la 1.0.0): el servidor de juego real, con socket.io y los NPC del mundo normal, juega 10 min
// simulados en los que se hunden ≥ 10 piratas por la vía de combate (el disparador del Capitán en AC-54). No aparece nada
// de I2: ningún barco suyo en el mundo ni en los frames, ningún evento ni aviso que el HUD o el minimapa puedan pintar, y
// la población es la de AC-51 en todo momento. Pasa a verify la sonda de QA-9 §8 (H-23); el unitario de la población es
// el de AC-51 en src/game/__tests__/npc.test.ts
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { Socket as ClientSocket } from 'socket.io-client';
import { TICK_RATE } from '../../src/game/constants';
import { C2S } from '../../src/game/protocol';
import { shipOfPlayer } from '../../src/game/world';
import { createGameServer, GameServer } from '../game-server';
import { joinGame, sleep } from './fixtures/game-socket';

// Lo que existía antes de I2: cualquier otra clase, tipo de barco o evento cuenta como fuga (el Capitán de I2 es la
// clase 'captain' con kind 'pirate', y su aparición y su hundimiento son los eventos 'captain' y 'captainDown')
const PRE_I2_CLASSES = ['sloop', 'brig', 'frigate', 'pirate', 'merchant'];
const PRE_I2_KINDS = ['player', 'pirate', 'merchant'];
const PRE_I2_EVENTS = ['volley', 'impact', 'sunk', 'loot', 'xp', 'respawn', 'wreck', 'wreckGone']; // 'xp' es de la 1.1 (E14), no de I2
const I2_TEXT = /capit[aá]n|cañonera/i;

const SIM_SECONDS = 10 * 60;
const ATTACK_EVERY = 40 * TICK_RATE; // un pirata cada 40 s: 15 intentos, y los piratas reaparecen a los 30 s (AC-52)

const testAuth = async (auth: unknown) => ({ userId: (auth as { token: string }).token, guest: false });

let httpServer: HttpServer;
let io: Server;
let game: GameServer;
const sockets: ClientSocket[] = [];

afterEach(async () => {
  sockets.splice(0).forEach((c) => c.disconnect());
  game?.stop();
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

const outside = (seen: Iterable<string>, allowed: string[]) => [...seen].filter((v) => !allowed.includes(v));

test('AC-137: 10 min simulados y ≥ 10 piratas hundidos en combate; ningún Capitán ni Cañonera en el mundo, en los frames ni en los avisos, y 12 piratas y 8 mercantes en todo momento', async () => {
  let clock = 0;
  httpServer = createServer();
  io = new Server(httpServer);
  game = createGameServer(io, { authenticate: testAuth, seed: 7, spawnNpcs: true, autoStart: false, now: () => clock });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  const { c, frames, notices } = await joinGame(url, { token: 'ac137' }, 'ac137', sockets);

  const world = game.world;
  const pirateIds = new Set([...world.ships.values()].filter((s) => s.kind === 'pirate').map((s) => s.id));
  const worldClasses = new Set<string>();
  const worldKinds = new Set<string>();
  const population = { minPirates: Infinity, maxPirates: 0, minMerchants: Infinity, maxMerchants: 0 };
  let sunk = 0;
  let target: string | null = null;

  for (let i = 0; i < SIM_SECONDS * TICK_RATE; i++) {
    clock += 1000 / TICK_RATE;
    const me = shipOfPlayer(world, 'ac137')!;
    me.hp = me.maxHp; // el barco del jugador no se hunde: lo que se mide son los piratas
    const t = target ? world.ships.get(target) : undefined;
    if (t?.state === 'alive') {
      me.pos = { x: t.pos.x + 25, z: t.pos.z }; // a tiro mientras el objetivo siga vivo
    } else if (t) {
      sunk++;
      target = null;
    }
    if (i % ATTACK_EVERY === ATTACK_EVERY / 2 && !target) {
      const pirate = [...world.ships.values()].find((s) => s.kind === 'pirate' && s.state === 'alive');
      if (pirate) {
        pirate.hp = 1; // un impacto lo hunde; el daño, el hundimiento y el botín siguen la vía real del combate
        me.pos = { x: pirate.pos.x + 25, z: pirate.pos.z };
        target = pirate.id;
        c.emit(C2S.attack, { targetId: pirate.id }); // la intención del jugador, por el socket y el parser del protocolo
        await sleep(20);
      }
    }
    game.tick();
    let pirates = 0;
    let merchants = 0;
    for (const s of world.ships.values()) {
      worldClasses.add(s.classId);
      worldKinds.add(s.kind);
      if (s.kind === 'pirate') pirates++;
      if (s.kind === 'merchant') merchants++;
    }
    population.minPirates = Math.min(population.minPirates, pirates);
    population.maxPirates = Math.max(population.maxPirates, pirates);
    population.minMerchants = Math.min(population.minMerchants, merchants);
    population.maxMerchants = Math.max(population.maxMerchants, merchants);
    if (i % TICK_RATE === 0) await sleep(1); // que los frames lleguen al cliente
  }
  await sleep(100);

  const frameClasses = new Set<string>();
  const frameKinds = new Set<string>();
  const eventTypes = new Set<string>();
  let pirateSunkEvents = 0;
  for (const f of frames) {
    for (const s of f.s ?? []) {
      if (s.c !== undefined) frameClasses.add(s.c);
      if (s.k !== undefined) frameKinds.add(s.k);
    }
    for (const e of f.e ?? []) {
      eventTypes.add(e.type);
      if (e.type === 'sunk' && pirateIds.has(e.shipId)) pirateSunkEvents++;
    }
  }

  console.log(
    `AC-137: ${SIM_SECONDS / 60} min simulados · ${sunk} piratas hundidos (${pirateSunkEvents} en los frames, contador ${world.killsSinceBoss}) · ` +
      `${frames.length} frames · clases en el mundo ${[...worldClasses].join(', ')} · en los frames ${[...frameClasses].join(', ')} · ` +
      `eventos ${[...eventTypes].join(', ')} · piratas ${population.minPirates}–${population.maxPirates} · mercantes ${population.minMerchants}–${population.maxMerchants}`
  );
  // ≥ 10 hundimientos por la vía de combate, vistos en el mundo y en los frames del jugador
  expect(sunk).toBeGreaterThanOrEqual(10);
  expect(pirateSunkEvents).toBeGreaterThanOrEqual(10);
  expect(frames.length).toBeGreaterThan(SIM_SECONDS * 5); // 10 frames/s en combate: el cliente siguió recibiendo
  // Nada de I2 en el mundo ni en lo que recibe el cliente (las placas, los avisos y el minimapa salen de aquí)
  expect(outside(worldClasses, PRE_I2_CLASSES)).toEqual([]);
  expect(outside(worldKinds, PRE_I2_KINDS)).toEqual([]);
  expect(outside(frameClasses, PRE_I2_CLASSES)).toEqual([]);
  expect(outside(frameKinds, PRE_I2_KINDS)).toEqual([]);
  expect(outside(eventTypes, PRE_I2_EVENTS)).toEqual([]);
  expect(notices().filter((n) => I2_TEXT.test(n.text))).toEqual([]);
  // La población anterior a I2 (AC-51) en cada tick, contando los hundidos que esperan para reaparecer
  expect(population).toEqual({ minPirates: 12, maxPirates: 12, minMerchants: 8, maxMerchants: 8 });
}, 120_000);

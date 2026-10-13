// Bot del arnés (AC-142). Socket falso: los frames se le dan a mano y las decisiones se piden una a una.
// - Contra un jugador persigue desde fuera de la zona segura: desde dentro no se puede atacar y, con el objetivo pegado al
//   borde, el punto a 35 m caía dentro y el bot se quedaba parado allí (un 25 % del tiempo de los bots en la corrida de
//   diagnóstico).
// - O1: un attack sin reflejo solo queda anulado si el primer frame tras el envío ya muestra la condición con la que el
//   servidor lo termina sin aviso; si no, es perdido.
// - Caso (b2), O-27: el barco propio hundido anula un moveTo o un repair, pero no un respawn, que sale con el barco
//   hundido; si no, un respawn perdido se contaba como anulado.
import { performance } from 'perf_hooks'; // el reloj del bot: el de los temporizadores falsos de Jest es otro
import { io } from 'socket.io-client';
import { C2S, S2C } from '../../../src/game/protocol';
import type { ServerFrame, ShipSnapshot } from '../../../src/game/types';
import { Bot } from '../bot';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

class FakeSocket {
  connected = true;
  readonly sent: [string, unknown][] = [];
  private readonly handlers = new Map<string, (...args: unknown[]) => void>();
  on(event: string, fn: (...args: unknown[]) => void) {
    this.handlers.set(event, fn);
    return this;
  }
  emit(event: string, payload?: unknown) {
    this.sent.push([event, payload]);
    return this;
  }
  connect() {
    return this;
  }
  disconnect() {
    this.connected = false;
    return this;
  }
  fire(event: string, payload: unknown) {
    this.handlers.get(event)!(payload);
  }
  lastMoveTo(): { x: number; z: number } | undefined {
    return this.sent.filter(([e]) => e === C2S.moveTo).map(([, p]) => p as { x: number; z: number }).pop();
  }
}

const ship = (o: Partial<ShipSnapshot> & { id: string }): ShipSnapshot => ({
  k: 'player',
  c: 'sloop',
  n: o.id,
  o: null,
  x: 0,
  z: 0,
  h: 0,
  s: 0,
  hp: 100,
  mhp: 100,
  st: 'alive',
  t: null,
  r: false,
  pu: 0,
  ...o
});

// El bot decide cada 250 ms con sus temporizadores; aquí se le pide cada decisión sin esperar el moveTo de 1 ± 0,5 s
const decideNow = (bot: Bot) => {
  const internals = bot as unknown as { nextMoveAt: number; decide: () => void };
  internals.nextMoveAt = 0;
  internals.decide();
};
// Pasado el segundo sin reflejo
const expireNow = (bot: Bot) => (bot as unknown as { expire: (now: number) => void }).expire(performance.now() + 1500);

const WELCOME = { playerId: 'u1', shipId: 'me', time: 100, mapHalfSize: 600, islands: [], tickRate: 20, snapshotRate: 10, interestRadius: 300 };

// Un bot de PvP fuera de la zona (200 m) con un rival a 100 m de él, también fuera: le manda un attack medido
function botAttacking(): { bot: Bot; socket: FakeSocket } {
  const socket = new FakeSocket();
  (io as unknown as jest.Mock).mockReturnValue(socket);
  const b = new Bot({ index: 1, url: 'http://localhost:1', name: 'Bot 01', userId: 'u1', auth: {}, role: 'pvp', seed: 1, t0: 0 });
  b.start();
  socket.fire(S2C.welcome, WELCOME);
  socket.fire(S2C.frame, { t: 100, full: true, s: [ship({ id: 'me', o: 'u1', x: 0, z: 200 }), ship({ id: 'p2', o: 'u2', x: 0, z: 300 })] });
  decideNow(b);
  expect(socket.sent.filter(([e]) => e === C2S.attack)).toEqual([[C2S.attack, { targetId: 'p2' }]]);
  return { bot: b, socket };
}

let bot: Bot | null = null;

beforeEach(() => jest.useFakeTimers());

afterEach(() => {
  bot?.stop();
  bot = null;
  jest.useRealTimers();
});

test('el de PvP persigue a un jugador desde fuera de la zona segura (110 m), y solo lo saca si el punto cae dentro', () => {
  const socket = new FakeSocket();
  (io as unknown as jest.Mock).mockReturnValue(socket);
  bot = new Bot({ index: 1, url: 'http://localhost:1', name: 'Bot 01', userId: 'u1', auth: {}, role: 'pvp', seed: 1, t0: 0 });
  bot.start();
  socket.fire(S2C.welcome, WELCOME);

  // Dentro de la zona (90 m del puerto) con un rival a 115 m: a 35 m de él, el punto caería a 80 m, dentro de la zona
  const frame: ServerFrame = { t: 100, full: true, s: [ship({ id: 'me', o: 'u1', x: 0, z: 90 }), ship({ id: 'p2', o: 'u2', x: 0, z: 115 })] };
  socket.fire(S2C.frame, frame);
  decideNow(bot);
  expect(socket.lastMoveTo()).toEqual({ x: 0, z: 125 }); // sacado a 110 + 15 m, sobre la misma recta del puerto

  // Con el rival lejos del borde, el punto a 35 m ya está fuera: se usa tal cual
  socket.fire(S2C.frame, { t: 100.1, s: [{ id: 'p2', z: 300 }] });
  decideNow(bot);
  expect(socket.lastMoveTo()).toEqual({ x: 0, z: 265 });
});

test('O1: sin condición visible en el primer frame tras el envío, el attack sin reflejo es perdido aunque luego el objetivo desaparezca', () => {
  const r = botAttacking();
  bot = r.bot;
  r.socket.fire(S2C.frame, { t: 100.1, s: [{ id: 'me', x: 0, z: 201 }] }); // primer frame: nada que lo anule
  r.socket.fire(S2C.frame, { t: 100.2, r: ['p2'] }); // después, el objetivo sale del área de interés
  expireNow(bot);
  expect(bot.orders.map((o) => [o.kind, o.outcome])).toEqual([['attack', 'perdida']]);
});

test.each<[string, Partial<ServerFrame>, string]>([
  ['el objetivo ya en la zona segura (109 m)', { s: [{ id: 'p2', z: 109 }] }, 'el objetivo está en la zona segura'],
  ['el objetivo fuera del mundo o del área de interés', { r: ['p2'] }, 'el objetivo salió del mundo o del área de interés'],
  ['el objetivo hundiéndose', { s: [{ id: 'p2', st: 'sinking' }] }, 'el objetivo está hundido o hundiéndose'],
  ['el atacante hundiéndose', { s: [{ id: 'me', st: 'sinking' }] }, 'el atacante está hundido'],
  ['el objetivo protegido (pu > t)', { s: [{ id: 'p2', pu: 115 }] }, 'el objetivo está protegido'],
  ['el atacante en la zona segura (105 m) frente a un jugador', { s: [{ id: 'me', z: 105 }] }, 'el atacante está en la zona segura'],
  ['los dos a más de 200 m (220 m)', { s: [{ id: 'p2', z: 420 }] }, 'están a más de 200 m']
])('O1: con %s en el primer frame tras el envío, el attack sin reflejo queda anulado, con su motivo', (_, first, reason) => {
  const r = botAttacking();
  bot = r.bot;
  r.socket.fire(S2C.frame, { t: 100.1, ...first });
  expireNow(bot);
  expect(bot.orders.map((o) => [o.kind, o.outcome, o.reason])).toEqual([['attack', 'anulada', reason]]);
});

function botPve(): { bot: Bot; socket: FakeSocket } {
  const socket = new FakeSocket();
  (io as unknown as jest.Mock).mockReturnValue(socket);
  const b = new Bot({ index: 1, url: 'http://localhost:1', name: 'Bot 01', userId: 'u1', auth: {}, role: 'pve', seed: 1, t0: 0 });
  b.start();
  socket.fire(S2C.welcome, WELCOME);
  return { bot: b, socket };
}

test.each<['moveTo' | 'repair', Partial<ShipSnapshot>, (b: Bot) => void]>([
  [
    'moveTo',
    {},
    (b) => {
      (b as unknown as { nextStopAt: number }).nextStopAt = 0; // la parada medida: stop y, ya a 0 nudos, el moveTo
      decideNow(b);
      decideNow(b);
    }
  ],
  ['repair', { hp: 30 }, (b) => decideNow(b)] // por debajo del 40 %
])('(b2): un %s medido que sale a flote queda anulado si el barco se hunde antes de reflejarlo', (kind, own, send) => {
  const r = botPve();
  bot = r.bot;
  r.socket.fire(S2C.frame, { t: 100, full: true, s: [ship({ id: 'me', o: 'u1', x: 0, z: 300, ...own })] });
  send(bot);
  expect(r.socket.sent.filter(([e]) => e === C2S[kind])).toHaveLength(1);
  r.socket.fire(S2C.frame, { t: 100.1, s: [{ id: 'me', st: 'sinking' }] });
  expect(bot.orders.map((o) => [o.kind, o.outcome, o.reason])).toEqual([[kind, 'anulada', 'barco hundido']]);
});

test('(b2) no vale para respawn: con el barco propio hundido en los frames, un respawn sin reflejo en ≤ 1 s es perdido', () => {
  const r = botPve();
  bot = r.bot;
  // Hundido y con la cuenta atrás cumplida (zarpa a los 99 s; el frame es de los 100 s), con su barco aún en el mapa
  const me = { death: { by: null, goldLost: 0, respawnAt: 99 } };
  r.socket.fire(S2C.frame, { t: 100, full: true, s: [ship({ id: 'me', o: 'u1', x: 0, z: 300, st: 'sinking' })], me });
  decideNow(bot);
  expect(r.socket.sent.filter(([e]) => e === C2S.respawn)).toHaveLength(1);
  r.socket.fire(S2C.frame, { t: 100.1, s: [{ id: 'me', st: 'dead' }] }); // sigue hundido y sin zarpar
  expireNow(bot);
  expect(bot.orders.map((o) => [o.kind, o.outcome])).toEqual([['respawn', 'perdida']]);
});

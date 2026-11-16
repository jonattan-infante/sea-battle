// AC-256 (parte unitaria; E20, GDD §11 «Zona segura bajo fuego (1.3)»): canAttackClient da lo mismo que canAttack del
// servidor en cada fila de la tabla (fuera, dentro sin marca y dentro bajo fuego, en el tirador y en el blanco, con y sin
// protección). El cliente lee la marca del snapshot (`uf`, −∞ viaja como 0) y la protección (`pu`), como en el juego
import { UNDER_FIRE_WINDOW } from '../../game/constants';
import { S2C } from '../../game/protocol';
import { ServerFrame, Ship, ShipSnapshot, Welcome, World } from '../../game/types';
import { addPlayer, canAttack, createWorld, shipOfPlayer, shipSnapshot, spawnPirate } from '../../game/world';
import { GameClient, type RenderShip } from '../game-client';
import { canAttackClient, zoneProtectedClient } from '../hud-logic';

type Zone = 'fuera' | 'dentro sin marca' | 'dentro bajo fuego';
type Guard = 'sin protección' | 'protegido';

const ZONES: Zone[] = ['fuera', 'dentro sin marca', 'dentro bajo fuego'];
const GUARDS: Guard[] = ['sin protección', 'protegido'];

// Los campos de RenderShip que salen del snapshot (game-client.ts, toRender)
function render(s: ShipSnapshot): RenderShip {
  return {
    id: s.id, kind: s.k, classId: s.c, name: s.n, ownerId: s.o, x: s.x, z: s.z, heading: s.h, speed: s.s, hp: s.hp, maxHp: s.mhp,
    state: s.st, targetId: s.t, repairing: s.r, protectedUntil: s.pu, underFireUntil: s.uf ?? 0, sinkingSince: 0, level: s.lv ?? null
  };
}

function setUp(world: World, ship: Ship, zone: Zone, guard: Guard, side: number): void {
  ship.pos = zone === 'fuera' ? { x: side, z: 200 } : { x: side, z: 80 };
  ship.underFireUntil = zone === 'dentro bajo fuego' ? world.time + UNDER_FIRE_WINDOW : -Infinity;
  ship.protectedUntil = guard === 'protegido' ? world.time + 5 : 0;
}

function scene() {
  const world = createWorld({ seed: 3, spawnNpcs: false });
  world.time = 20;
  addPlayer(world, 'me', 'me');
  addPlayer(world, 'other', 'other');
  return { world, me: shipOfPlayer(world, 'me')!, target: shipOfPlayer(world, 'other')! };
}

const rows: [Zone, Guard, Zone, Guard][] = [];
for (const meZone of ZONES) for (const meGuard of GUARDS) for (const tZone of ZONES) for (const tGuard of GUARDS) rows.push([meZone, meGuard, tZone, tGuard]);

describe('AC-256: canAttackClient = canAttack, jugador contra jugador', () => {
  test.each(rows)('tirador %s y %s; blanco %s y %s', (meZone, meGuard, tZone, tGuard) => {
    const { world, me, target } = scene();
    setUp(world, me, meZone, meGuard, 0);
    setUp(world, target, tZone, tGuard, 40);
    const client = { serverTime: () => world.time };
    const free = (z: Zone, g: Guard) => z !== 'dentro sin marca' && g === 'sin protección';
    const expected = free(meZone, meGuard) && free(tZone, tGuard);
    expect(canAttack(world, me, target)).toBe(expected);
    expect(canAttackClient(client, render(shipSnapshot(world, me)), render(shipSnapshot(world, target)))).toBe(expected);
  });
});

describe('AC-256: casos de borde de la marca en el cliente', () => {
  test('contra un NPC se puede atacar desde dentro sin marca, en los dos lados', () => {
    const { world, me } = scene();
    setUp(world, me, 'dentro sin marca', 'sin protección', 0);
    const pirate = spawnPirate(world, 0);
    pirate.pos = { x: 0, z: 140 };
    expect(canAttack(world, me, pirate)).toBe(true);
    expect(canAttackClient({ serverTime: () => world.time }, render(shipSnapshot(world, me)), render(shipSnapshot(world, pirate)))).toBe(true);
  });

  test('sin marca, `uf` viaja como 0; en el instante en que caduca, el blanco vuelve a estar protegido en los dos lados', () => {
    const { world, me, target } = scene();
    setUp(world, me, 'fuera', 'sin protección', 0);
    expect(shipSnapshot(world, target).uf).toBe(0);
    setUp(world, target, 'dentro bajo fuego', 'sin protección', 40);
    const uf = shipSnapshot(world, target).uf!;
    expect(uf).toBe(world.time + UNDER_FIRE_WINDOW);
    const snapMe = render(shipSnapshot(world, me));
    const snapTarget = render(shipSnapshot(world, target));
    world.time = uf - 0.05;
    expect(canAttack(world, me, target)).toBe(true);
    expect(canAttackClient({ serverTime: () => world.time }, snapMe, snapTarget)).toBe(true);
    world.time = uf;
    expect(canAttack(world, me, target)).toBe(false);
    expect(canAttackClient({ serverTime: () => world.time }, snapMe, snapTarget)).toBe(false);
    expect(zoneProtectedClient(snapTarget, uf)).toBe(true);
  });

  test('los barcos de NPC no llevan `uf`', () => {
    const { world } = scene();
    expect(shipSnapshot(world, spawnPirate(world, 0)).uf).toBeUndefined();
  });
});

// AC-257 (a), lado del cliente: el GameClient real lee `uf` del frame (y de los deltas, que solo lo traen al cambiar) y,
// mientras la marca corre y caduca, no envía nada. El socket no se conecta y sus emit se espían (como intents.test.ts)
describe('AC-257 (a): el cliente lee `uf` y no envía mensajes en reposo', () => {
  test('frame completo sin marca, delta con la marca, 12 s de reloj: underFireUntil sigue al servidor y 0 emit', () => {
    let clock = 1000;
    const now = jest.spyOn(performance, 'now').mockImplementation(() => clock);
    const client = new GameClient({ url: 'http://localhost:1', auth: async () => ({}) });
    const emit = jest.spyOn(client.socket, 'emit').mockImplementation(() => client.socket);
    try {
      const deliver = (event: string, payload: unknown) => client.socket.listeners(event).forEach((l) => l(payload));
      const welcome: Partial<Welcome> = { playerId: 'u1', shipId: 'me', time: 10, snapshotRate: 10 };
      deliver(S2C.welcome, welcome);
      const full: ShipSnapshot = { id: 'me', k: 'player', c: 'sloop', n: 'Yo', o: 'u1', x: 0, z: 80, h: 0, s: 0, hp: 800, mhp: 800, st: 'alive', t: null, r: false, pu: 0, lv: 1, uf: 0 };
      deliver(S2C.frame, { t: 10.1, full: true, s: [full] } satisfies ServerFrame);
      deliver(S2C.frame, { t: 10.2, s: [{ id: 'me', uf: 20.2 }] } satisfies ServerFrame);
      deliver(S2C.frame, { t: 10.3, s: [{ id: 'me', hp: 770 }] } satisfies ServerFrame); // otro delta sin `uf`: la marca sigue
      for (let i = 0; i < 120; i++) {
        clock += 100;
        client.update(clock);
      }
      const me = client.getShip('me')!;
      expect(me.underFireUntil).toBe(20.2);
      expect(me.hp).toBe(770);
      expect(zoneProtectedClient(me, client.serverTime())).toBe(client.serverTime() >= 20.2);
      expect(emit).not.toHaveBeenCalled();
    } finally {
      client.dispose();
      now.mockRestore();
    }
  });
});

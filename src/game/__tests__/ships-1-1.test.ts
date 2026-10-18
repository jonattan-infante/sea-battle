// E15 — Goleta y Navío de línea (GDD §6, §11 y §13; AC-161, AC-162 y AC-201). Los números van escritos a mano, del GDD:
// así el test no se ajusta a las constantes que compara (AC-04). Los duelos de AC-163 van en ships-1-1-duels.test.ts
import { LEVEL_XP, PLAYER_SHIP_ORDER, PlayerShipClass, SHIP_CLASSES, navClearance } from '../constants';
import { parseBuy } from '../protocol';
import { addPlayer, buy, createWorld, moveTo, selectShip, shipOfPlayer } from '../world';
import { DT, placePlayer, run, runUntil } from './helpers';

const deg = Math.PI / 180;
const xpForLevel = (level: number) => LEVEL_XP[level - 1];
// Mundo sin NPC con las dos clases encendidas o apagadas (AC-201: apagadas por defecto)
const world = (newShips?: boolean) => createWorld({ seed: 1, spawnNpcs: false, newShips });
// Jugador en el puerto (zona segura) con oro y la XP de un nivel
function inPort(w: ReturnType<typeof world>, gold: number, level: number) {
  const ship = placePlayer(w, 'a', 0, 70);
  const player = w.players.get('a')!;
  player.gold = gold;
  player.xp = xpForLevel(level);
  return { ship, player };
}

describe('E15 — Goleta y Navío de línea: clases (AC-161)', () => {
  test('AC-04: la Goleta y el Navío coinciden con GDD §6 (eslora, radio, vida, velocidad, aceleración, frenado, giro, cañones por banda y precio), y van en el astillero entre los de la 1.0, por precio', () => {
    const row = (id: string) => {
      const s = SHIP_CLASSES[id];
      return [s.label, s.kind, s.length, s.radius, s.maxHp, s.maxSpeed, s.accel, s.brake, Math.round(s.turnRate / deg), s.cannonsPerSide, s.price];
    };
    expect(row('schooner')).toEqual(['Goleta', 'player', 22, 6, 1100, 15, 4.5, 6, 80, 4, 3000]);
    expect(row('line')).toEqual(['Navío de línea', 'player', 42, 11, 3200, 8.5, 2, 3.5, 45, 10, 12000]);
    expect(PLAYER_SHIP_ORDER).toEqual(['sloop', 'brig', 'schooner', 'frigate', 'line']);
    expect([navClearance('schooner'), navClearance('line')]).toEqual([13, 23]);
  });

  test.each([
    ['schooner', 15, 3.3, 80],
    ['line', 8.5, 4.25, 45]
  ])('AC-161: %s llega a %s m/s en %s ±0,1 s desde parado, y su giro sostenido mide %s ±1 °/s (como AC-16)', (classId, vmax, seconds, degPerSec) => {
    const w = world(true);
    const ship = placePlayer(w, 'a', -400, -300, Math.PI / 2);
    ship.classId = classId;
    moveTo(w, 'a', { x: 400, z: -300 });
    const t = runUntil(w, 10, () => ship.speed >= vmax - 1e-9);
    expect(Math.abs(ship.speed - vmax)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(t - seconds)).toBeLessThanOrEqual(0.1);

    const turner = placePlayer(w, 'b', 300, 300, 0);
    turner.classId = classId;
    moveTo(w, 'b', { x: 300, z: 200 }); // destino a la espalda
    run(w, DT); // el primer tick fija la ruta
    const h0 = turner.heading;
    run(w, 0.5);
    expect(Math.abs(Math.abs(turner.heading - h0) / 0.5 / deg - degPerSec)).toBeLessThanOrEqual(1);
  });
});

describe('E15 — Compra con nivel (AC-162) y clases latentes (AC-201)', () => {
  test.each([
    ['schooner', 3000, 5, 'Requiere nivel 5 (Marinero)'],
    ['line', 12000, 9, 'Requiere nivel 9 (Contramaestre)']
  ] as [PlayerShipClass, number, number, string][])('AC-162: con las clases encendidas, %s con %i de oro se rechaza un nivel por debajo del %i con su texto, sin tocar oro ni barcos; con el nivel, se compra como en AC-70', (classId, gold, level, text) => {
    const w = world(true);
    const { ship, player } = inPort(w, gold, level - 1);
    expect(buy(w, 'a', { kind: 'ship', classId })).toEqual({ ok: false, reason: text });
    expect({ gold: player.gold, owned: player.ownedShips, active: player.activeShip }).toEqual({ gold, owned: ['sloop'], active: 'sloop' });

    player.xp = xpForLevel(level);
    expect(buy(w, 'a', { kind: 'ship', classId })).toEqual({ ok: true });
    expect({ gold: player.gold, owned: player.ownedShips, active: player.activeShip, classId: ship.classId, hp: ship.hp }).toEqual({
      gold: 0,
      owned: ['sloop', classId],
      active: classId,
      classId,
      hp: SHIP_CLASSES[classId].maxHp
    });
  });

  test('AC-162: sin el nivel, el rechazo es el del nivel aunque tampoco llegue el oro (el barco bloqueado dice lo que pide)', () => {
    const w = world(true);
    inPort(w, 100, 1);
    expect(buy(w, 'a', { kind: 'ship', classId: 'line' })).toEqual({ ok: false, reason: 'Requiere nivel 9 (Contramaestre)' });
  });

  test('AC-201: con las clases apagadas (el mundo por defecto), nadie las compra, aunque tenga el nivel y el oro, y lo de la 1.0 se compra igual', () => {
    const w = world();
    expect(w.newShips).toBe(false);
    const { player } = inPort(w, 20000, 20);
    for (const classId of ['schooner', 'line'] as PlayerShipClass[]) {
      expect(buy(w, 'a', { kind: 'ship', classId })).toEqual({ ok: false, reason: 'Ese barco no está a la venta' });
    }
    expect(player.ownedShips).toEqual(['sloop']);
    expect(player.gold).toBe(20000);
    expect(buy(w, 'a', { kind: 'ship', classId: 'brig' })).toEqual({ ok: true });
  });

  // Apagadas, la fila no da estas clases al mundo (AC-201 b): lo prueba server/__tests__/new-ships.test.ts con Postgres
  test('AC-201 (b): con las clases encendidas, quien entra con la Goleta y el Navío los vuelve a elegir en el puerto sin coste', () => {
    const w = world(true);
    addPlayer(w, 'a', 'a', { gold: 500, upgrades: { cannons: 2, hull: 1, sails: 1 }, ownedShips: ['sloop', 'schooner', 'line'], activeShip: 'schooner', xp: 3000 });
    const ship = shipOfPlayer(w, 'a')!;
    const player = w.players.get('a')!;
    expect({ classId: ship.classId, hp: ship.hp }).toEqual({ classId: 'schooner', hp: 1100 });
    ship.pos = { x: 0, z: 70 };
    expect(selectShip(w, 'a', 'line')).toEqual({ ok: true });
    expect({ classId: ship.classId, owned: player.ownedShips, gold: player.gold }).toEqual({ classId: 'line', owned: ['sloop', 'schooner', 'line'], gold: 500 });
  });

  test('AC-162 y AC-201: el protocolo admite comprar las dos clases (la regla la pone el servidor, AC-68), y sigue sin admitir la Balandra', () => {
    expect(parseBuy({ itemId: 'ship:schooner' })).toEqual({ item: { kind: 'ship', classId: 'schooner' } });
    expect(parseBuy({ itemId: 'ship:line' })).toEqual({ item: { kind: 'ship', classId: 'line' } });
    expect(parseBuy({ itemId: 'ship:sloop' })).toBeNull();
  });
});

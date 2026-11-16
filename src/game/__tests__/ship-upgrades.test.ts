// E19 — Mejoras por barco (1.3; GDD §11, «Mejoras por barco (1.3)», Q34 y Q35): cada barco tiene sus niveles de Cañones,
// Casco y Velas, una mejora se compra para cualquier barco propio, el precio es la base × cañones por banda / 8 y un barco
// nuevo llega a nivel 1. Y la Goleta y el Navío, jugables y sin interruptor (Q37, AC-226), con su nivel (AC-162).
// Los números van escritos a mano, del GDD: así el test no se ajusta a las constantes que compara (AC-04)
import { LEVEL_XP, PLAYER_SHIP_ORDER, PlayerShipClass, SHIP_CLASSES, SHIP_MIN_LEVEL, UPGRADE_PRICE_BASE_CANNONS, UPGRADE_LEVELS, UpgradeId, navClearance, upgradePrice } from '../constants';
import { tooStrong } from '../stats';
import { Player, Ship, World } from '../types';
import { attack, buy, cannonOf, createWorld, isInSafeZone, maxSpeedOf, moveTo, respawn, selectShip, shipOfPlayer, ShopItem } from '../world';
import { DEATH_COUNTDOWN } from '../constants';
import { DT, emptyWorld, placePlayer, run, runUntil } from './helpers';

const deg = Math.PI / 180;
const N1 = { cannons: 1, hull: 1, sails: 1 };
const up = (upgrade: UpgradeId, level: number, ship: PlayerShipClass): ShopItem => ({ kind: 'upgrade', upgrade, level, ship });

// Jugador en el puerto (zona segura), con sus barcos y el activo
function inPort(ships: Player['ships'], activeShip: PlayerShipClass, gold = 0): { world: World; player: Player; ship: Ship } {
  const world = emptyWorld();
  const ship = placePlayer(world, 'a', 0, 70);
  const player = world.players.get('a')!;
  player.ships = ships;
  player.gold = gold;
  player.activeShip = activeShip;
  ship.classId = activeShip;
  ship.maxHp = Math.round(SHIP_CLASSES[activeShip].maxHp * UPGRADE_LEVELS.hull.multipliers[ships[activeShip]!.hull - 1]);
  ship.hp = ship.maxHp;
  expect(isInSafeZone(ship.pos)).toBe(true);
  return { world, player, ship };
}

const stats = (w: World, ship: Ship) => {
  const c = cannonOf(w, ship)!;
  return { damage: c.damage, range: c.range, reload: c.reload, maxSpeed: +maxSpeedOf(w, ship).toFixed(6), maxHp: ship.maxHp };
};

describe('AC-212: las mejoras son del barco', () => {
  const ships = () => ({ sloop: { cannons: 3, hull: 1, sails: 2 }, brig: { ...N1 } });

  test('con la Balandra (Cañones N3, Velas N2): daño 48, alcance 80, recarga 3,0 y 15,4 m/s; con el Bergantín N1: 30, 60, 4,0 y 12 m/s', () => {
    const { world, ship } = inPort(ships(), 'sloop');
    expect(stats(world, ship)).toEqual({ damage: 48, range: 80, reload: 3, maxSpeed: 15.4, maxHp: 800 });
    expect(selectShip(world, 'a', 'brig')).toEqual({ ok: true });
    expect(stats(world, ship)).toEqual({ damage: 30, range: 60, reload: 4, maxSpeed: 12, maxHp: 1400 });
    expect(selectShip(world, 'a', 'sloop')).toEqual({ ok: true });
    expect(stats(world, ship)).toEqual({ damage: 48, range: 80, reload: 3, maxSpeed: 15.4, maxHp: 800 });
  });

  test('la vida máxima es la del Casco de cada barco, y al cambiar se conserva el porcentaje', () => {
    const { world, ship } = inPort({ sloop: { ...N1 }, brig: { cannons: 1, hull: 3, sails: 1 } }, 'sloop');
    ship.hp = 400; // 50 %
    expect(selectShip(world, 'a', 'brig')).toEqual({ ok: true });
    expect([ship.maxHp, ship.hp]).toEqual([1960, 980]);
    expect(selectShip(world, 'a', 'sloop')).toEqual({ ok: true });
    expect([ship.maxHp, ship.hp]).toEqual([800, 400]);
  });

  test('(a) al hundirse y zarpar sale el mismo barco con sus mismos niveles', () => {
    const { world, player, ship } = inPort(ships(), 'brig');
    ship.pos = { x: 300, z: 300 };
    ship.hp = 1;
    world.rng = () => 0; // todas las balas aciertan
    placePlayer(world, 'k', 300, 340);
    expect(attack(world, 'k', ship.id).ok).toBe(true);
    run(world, 2);
    expect(ship.state).not.toBe('alive');
    run(world, DEATH_COUNTDOWN + 1);
    expect(respawn(world, 'a')).toEqual({ ok: true });
    expect([ship.state, ship.classId, player.activeShip]).toEqual(['alive', 'brig', 'brig']);
    expect(player.ships).toEqual(ships());
    expect(stats(world, ship)).toEqual({ damage: 30, range: 60, reload: 4, maxSpeed: 12, maxHp: 1400 });
    expect(ship.hp).toBe(1400);
  });

  test('(b) la marca de peligro usa los niveles del barco activo: Balandra N1, sí en la cañonera; Bergantín con Cañones N3, no', () => {
    const { world, player } = inPort({ sloop: { ...N1 }, brig: { cannons: 3, hull: 1, sails: 1 } }, 'sloop');
    expect(tooStrong('gunboat', player)).toBe(true);
    expect(selectShip(world, 'a', 'brig')).toEqual({ ok: true });
    expect(tooStrong('gunboat', player)).toBe(false);
  });
});

describe('AC-213: una mejora se compra para cualquier barco propio', () => {
  // Navega el Bergantín (Cañones N1, 1 000 de 1 400 de vida), con la Balandra (N1) en propiedad y 2 000 de oro
  function setup() {
    const w = inPort({ sloop: { ...N1 }, brig: { ...N1 } }, 'brig', 2000);
    w.ship.hp = 1000;
    return w;
  }
  const snapshot = (w: ReturnType<typeof setup>) => JSON.stringify({ gold: w.player.gold, ships: w.player.ships, active: w.player.activeShip });

  test('(a) Cañones N2 para el Bergantín: paga 375, el Bergantín pasa a N2 y la Balandra sigue igual', () => {
    const { world, player, ship } = setup();
    expect(buy(world, 'a', up('cannons', 2, 'brig'))).toEqual({ ok: true });
    expect(player.gold).toBe(2000 - 375);
    expect(player.ships).toEqual({ sloop: N1, brig: { cannons: 2, hull: 1, sails: 1 } });
    expect(cannonOf(world, ship)!.damage).toBe(38);
  });

  test.each([
    ['sin comprar antes la del Bergantín', 30, false],
    ['después de comprar la del Bergantín', 38, true]
  ])('(b) Cañones N2 para la Balandra %s: paga 250, la Balandra pasa a N2 y el activo sigue siendo el Bergantín, con el mismo cañón (daño %i), vida, destino y sitio', (_label, damage, firstBrig) => {
    const { world, player, ship } = setup();
    if (firstBrig) expect(buy(world, 'a', up('cannons', 2, 'brig')).ok).toBe(true);
    expect(moveTo(world, 'a', { x: 20, z: 60 }).ok).toBe(true);
    run(world, 0.5); // navega hacia el destino
    const before = { pos: { ...ship.pos }, heading: ship.heading, speed: ship.speed, destination: ship.destination && { ...ship.destination }, path: ship.path.map((p) => ({ ...p })), hp: ship.hp, maxHp: ship.maxHp, classId: ship.classId };
    const gold = player.gold;
    expect(buy(world, 'a', up('cannons', 2, 'sloop'))).toEqual({ ok: true });
    expect(player.gold).toBe(gold - 250);
    expect(player.ships.sloop).toEqual({ cannons: 2, hull: 1, sails: 1 });
    expect(player.activeShip).toBe('brig');
    expect({ pos: { ...ship.pos }, heading: ship.heading, speed: ship.speed, destination: ship.destination && { ...ship.destination }, path: ship.path.map((p) => ({ ...p })), hp: ship.hp, maxHp: ship.maxHp, classId: ship.classId }).toEqual(before);
    expect(cannonOf(world, ship)!.damage).toBe(damage);
  });

  test('(c) Casco N2 para la Balandra no toca la vida del Bergantín (1 000 de 1 400); al cambiar a la Balandra, 960 de vida máxima con el mismo porcentaje', () => {
    const { world, player, ship } = setup();
    expect(buy(world, 'a', up('hull', 2, 'sloop'))).toEqual({ ok: true });
    expect([ship.hp, ship.maxHp]).toEqual([1000, 1400]);
    expect(player.ships.sloop!.hull).toBe(2);
    expect(selectShip(world, 'a', 'sloop')).toEqual({ ok: true });
    expect([ship.maxHp, ship.hp]).toEqual([960, Math.round((960 * 1000) / 1400)]);
  });

  test('(c) Casco para el barco activo sigue como AC-69: conserva el porcentaje', () => {
    const { world, ship } = setup();
    expect(buy(world, 'a', up('hull', 2, 'brig'))).toEqual({ ok: true });
    expect([ship.maxHp, ship.hp]).toEqual([1680, Math.round((1680 * 1000) / 1400)]);
  });

  test('(d) se rechazan sin cambiar el oro ni ningún nivel: un barco que no tiene, N3 sin N2 en el barco elegido aunque otro tenga N2, y con el activo fuera del puerto o hundido aunque el elegido sea otro', () => {
    const w = setup();
    expect(buy(w.world, 'a', up('cannons', 2, 'brig')).ok).toBe(true); // el Bergantín tiene Cañones N2
    const before = snapshot(w);
    expect(buy(w.world, 'a', up('cannons', 2, 'frigate'))).toEqual({ ok: false, reason: 'No tienes ese barco' });
    expect(buy(w.world, 'a', up('cannons', 3, 'sloop'))).toEqual({ ok: false, reason: 'Primero necesitas el nivel anterior' });
    expect(buy(w.world, 'a', up('cannons', 2, 'brig'))).toEqual({ ok: false, reason: 'Primero necesitas el nivel anterior' }); // ya lo tiene
    w.ship.pos = { x: 300, z: 300 };
    expect(buy(w.world, 'a', up('cannons', 2, 'sloop'))).toEqual({ ok: false, reason: 'El astillero solo abre en el puerto' });
    w.ship.pos = { x: 0, z: 70 };
    w.ship.state = 'sinking';
    expect(buy(w.world, 'a', up('cannons', 2, 'sloop'))).toEqual({ ok: false, reason: 'Tu barco no está a flote' });
    expect(snapshot(w)).toBe(before);
  });
});

describe('AC-214: los precios son los de la tabla de GDD §11', () => {
  // La tabla de GDD §11, «Mejoras por barco (1.3)», cifra a cifra: Cañones N2 / N3, Casco N2 / N3, Velas N2 / N3
  const TABLE: Record<PlayerShipClass, number[]> = {
    sloop: [250, 750, 200, 600, 150, 450],
    schooner: [250, 750, 200, 600, 150, 450],
    brig: [375, 1125, 300, 900, 225, 675],
    frigate: [500, 1500, 400, 1200, 300, 900],
    line: [625, 1875, 500, 1500, 375, 1125]
  };
  const prices = (classId: PlayerShipClass) => (['cannons', 'hull', 'sails'] as const).flatMap((u) => [2, 3].map((level) => upgradePrice(classId, u, level)));

  test.each(PLAYER_SHIP_ORDER.map((c) => [c]))('%s: los 6 precios coinciden con la tabla y son enteros', (classId) => {
    expect(prices(classId)).toEqual(TABLE[classId]);
    expect(prices(classId).every(Number.isInteger)).toBe(true);
  });

  test('30 precios, la base es la de la Fragata y el factor son los cañones por banda / 8; las 6 suman 2 400, 2 400, 3 600, 4 800 y 6 000', () => {
    expect(PLAYER_SHIP_ORDER.flatMap(prices)).toHaveLength(30);
    expect(UPGRADE_PRICE_BASE_CANNONS).toBe(8);
    expect(prices('frigate')).toEqual([500, 1500, 400, 1200, 300, 900]);
    for (const c of PLAYER_SHIP_ORDER) expect(prices(c)).toEqual(prices('frigate').map((p) => (p * SHIP_CLASSES[c].cannonsPerSide) / 8));
    expect(PLAYER_SHIP_ORDER.map((c) => prices(c).reduce((a, b) => a + b, 0))).toEqual([2400, 3600, 2400, 4800, 6000]);
  });

  test('la compra cobra ese precio en cada barco, aunque no sea el activo', () => {
    const { world, player } = inPort(Object.fromEntries(PLAYER_SHIP_ORDER.map((c) => [c, { ...N1 }])), 'sloop', 1_000_000);
    for (const c of PLAYER_SHIP_ORDER) {
      for (const [i, item] of [up('cannons', 2, c), up('cannons', 3, c), up('hull', 2, c), up('hull', 3, c), up('sails', 2, c), up('sails', 3, c)].entries()) {
        const gold = player.gold;
        expect(buy(world, 'a', item)).toEqual({ ok: true });
        expect(gold - player.gold).toBe(TABLE[c][i]);
      }
    }
    expect(player.activeShip).toBe('sloop');
  });
});

describe('AC-215: un barco nuevo llega a nivel 1', () => {
  test('con el Bergantín a N3 y 6 000 de oro, la Fragata es el activo con la vida llena (2 200), daño 30, alcance 60 y 10 m/s; el Bergantín conserva sus N3', () => {
    const N3 = { cannons: 3, hull: 3, sails: 3 };
    const { world, player, ship } = inPort({ sloop: { ...N1 }, brig: { ...N3 } }, 'brig', 6000);
    ship.hp = 500;
    expect(buy(world, 'a', { kind: 'ship', classId: 'frigate' })).toEqual({ ok: true });
    expect([player.gold, player.activeShip, ship.classId, ship.hp]).toEqual([0, 'frigate', 'frigate', 2200]);
    expect(stats(world, ship)).toEqual({ damage: 30, range: 60, reload: 4, maxSpeed: 10, maxHp: 2200 });
    expect(player.ships).toEqual({ sloop: N1, brig: N3, frigate: N1 });
  });
});

describe('E15 en la 1.3: la Goleta y el Navío, jugables y sin interruptor (AC-161, AC-162 y AC-226)', () => {
  const xpForLevel = (level: number) => LEVEL_XP[level - 1];

  test('AC-04: coinciden con GDD §6 (eslora, radio, vida, velocidad, aceleración, frenado, giro, cañones por banda y precio) y van en el astillero por precio', () => {
    const row = (id: string) => {
      const s = SHIP_CLASSES[id];
      return [s.label, s.kind, s.length, s.radius, s.maxHp, s.maxSpeed, s.accel, s.brake, Math.round(s.turnRate / deg), s.cannonsPerSide, s.price];
    };
    expect(row('schooner')).toEqual(['Goleta', 'player', 22, 6, 1100, 15, 4.5, 6, 80, 4, 3000]);
    expect(row('line')).toEqual(['Navío de línea', 'player', 42, 11, 3200, 8.5, 2, 3.5, 45, 10, 12000]);
    expect(PLAYER_SHIP_ORDER).toEqual(['sloop', 'brig', 'schooner', 'frigate', 'line']);
    expect([navClearance('schooner'), navClearance('line')]).toEqual([13, 23]);
    expect(SHIP_MIN_LEVEL).toEqual({ schooner: 5, line: 9 });
  });

  test.each([
    ['schooner', 15, 3.3, 80],
    ['line', 8.5, 4.25, 45]
  ])('AC-161: %s llega a %s m/s en %s ±0,1 s desde parado, y su giro sostenido mide %s ±1 °/s (como AC-16)', (classId, vmax, seconds, degPerSec) => {
    const w = createWorld({ seed: 1, spawnNpcs: false });
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

  test.each([
    ['schooner', 3000, 5, 'Requiere nivel 5 (Marinero)'],
    ['line', 12000, 9, 'Requiere nivel 9 (Contramaestre)']
  ] as [PlayerShipClass, number, number, string][])('AC-162 y AC-226: en el mundo por defecto, %s con %i de oro se rechaza un nivel por debajo del %i con su texto, sin tocar nada; con el nivel, se compra a nivel 1 y con la vida llena', (classId, gold, level, text) => {
    const { world, player, ship } = inPort({ sloop: { ...N1 } }, 'sloop', gold);
    player.xp = xpForLevel(level - 1);
    expect(buy(world, 'a', { kind: 'ship', classId })).toEqual({ ok: false, reason: text });
    expect({ gold: player.gold, ships: player.ships, active: player.activeShip }).toEqual({ gold, ships: { sloop: N1 }, active: 'sloop' });
    player.xp = xpForLevel(level);
    expect(buy(world, 'a', { kind: 'ship', classId })).toEqual({ ok: true });
    expect({ gold: player.gold, ships: player.ships, active: player.activeShip, classId: ship.classId, hp: ship.hp }).toEqual({
      gold: 0,
      ships: { sloop: N1, [classId]: N1 },
      active: classId,
      classId,
      hp: SHIP_CLASSES[classId].maxHp
    });
  });

  test('AC-162: sin el nivel, el rechazo es el del nivel aunque tampoco llegue el oro', () => {
    const { world } = inPort({ sloop: { ...N1 } }, 'sloop', 100);
    expect(buy(world, 'a', { kind: 'ship', classId: 'line' })).toEqual({ ok: false, reason: 'Requiere nivel 9 (Contramaestre)' });
  });

  test('AC-226 (a): quien entra con la Goleta activa la juega, y elige el Navío en el puerto sin coste, cada uno con sus niveles', () => {
    const { world, player, ship } = inPort({ sloop: { ...N1 }, schooner: { cannons: 2, hull: 1, sails: 3 }, line: { cannons: 1, hull: 2, sails: 1 } }, 'schooner', 500);
    expect(stats(world, ship)).toEqual({ damage: 38, range: 70, reload: 3.5, maxSpeed: 18, maxHp: 1100 }); // la cazadora: 15 × 1,2 (§6)
    expect(selectShip(world, 'a', 'line')).toEqual({ ok: true });
    expect({ classId: ship.classId, gold: player.gold }).toEqual({ classId: 'line', gold: 500 });
    expect(stats(world, ship)).toEqual({ damage: 30, range: 60, reload: 4, maxSpeed: 8.5, maxHp: 3840 });
    expect(shipOfPlayer(world, 'a')).toBe(ship);
  });
});

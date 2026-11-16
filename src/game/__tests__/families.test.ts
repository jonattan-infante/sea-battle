// H-1703 — Comprar las familias (1.3; GDD §6 «Familias de barcos» y §13; Q33, Q38 y Q39): las 2 se compran, 4 000 de oro
// cada una, sin nivel, y cada compra vale para todos los barcos; comprar una la pone en uso; «sin familia» siempre vale y
// es gratis; cambiar entre lo que se tiene es gratis en el puerto; solo cambia el aspecto. Lo que viaja: `fa` en el barco
// de cada jugador, también «none». Los rechazos forjados por el socket, en server/__tests__/ship-families-server.test.ts
import { FAMILY_PRICE, NO_FAMILY, SHIP_FAMILIES } from '../constants';
import { Player, Ship, World } from '../types';
import {
  applySelectFamily,
  attack,
  buy,
  moveTo,
  planBuy,
  planSelectFamily,
  respawn,
  selectFamily,
  selectShip,
  shipOfPlayer,
  shipSnapshot,
  ShopItem
} from '../world';
import { DEATH_COUNTDOWN } from '../constants';
import { emptyWorld, placePirate, placePlayer, run } from './helpers';

const gb: ShopItem = { kind: 'family', family: 'gb' };
const es: ShopItem = { kind: 'family', family: 'es' };

function inPort(gold: number): { world: World; player: Player; ship: Ship } {
  const world = emptyWorld();
  const ship = placePlayer(world, 'a', 0, 70);
  const player = world.players.get('a')!;
  player.gold = gold;
  return { world, player, ship };
}

// Lo que una familia no puede tocar: vida, destino, ruta, posición, mejoras y barco activo (AC-222 y AC-223)
const state = (w: { player: Player; ship: Ship }) =>
  JSON.stringify({ hp: w.ship.hp, maxHp: w.ship.maxHp, pos: w.ship.pos, destination: w.ship.destination, path: w.ship.path, classId: w.ship.classId, ships: w.player.ships, active: w.player.activeShip, xp: w.player.xp });

describe('constantes (GDD §6)', () => {
  test('2 familias, «gb» y «es» en ese orden, 4 000 de oro cada una; «sin familia» es «none»', () => {
    expect(SHIP_FAMILIES).toEqual(['gb', 'es']);
    expect(FAMILY_PRICE).toBe(4000);
    expect(NO_FAMILY).toBe('none');
  });

  test('todo jugador empieza sin familia y sin ninguna comprada (Q39), y su barco lo dice: fa «none»', () => {
    const { world, player, ship } = inPort(100);
    expect([player.families, player.family]).toEqual([[], 'none']);
    expect(shipSnapshot(world, ship).fa).toBe('none');
  });

  test('los NPC no tienen familia: su snapshot no lleva fa', () => {
    const world = emptyWorld();
    expect('fa' in shipSnapshot(world, placePirate(world, 300, 300))).toBe(false);
  });
});

describe('AC-222: comprar una familia', () => {
  test('sin familia y con 4 500 de oro, compra la británica: le quedan 500, queda comprada y en uso, su barco lo dice (fa) y su estado no cambia', () => {
    const w = inPort(4500);
    expect(moveTo(w.world, 'a', { x: 20, z: 60 }).ok).toBe(true);
    run(w.world, 0.3);
    const before = state(w);
    expect(buy(w.world, 'a', gb)).toEqual({ ok: true });
    expect([w.player.gold, w.player.families, w.player.family]).toEqual([500, ['gb'], 'gb']);
    expect(shipSnapshot(w.world, w.ship).fa).toBe('gb');
    expect(state(w)).toBe(before);
  });

  test('con la británica y otros 4 000, la española se compra igual, por el mismo precio, y pasa a estar en uso; families queda en el orden de §6', () => {
    const w = inPort(8000);
    expect(buy(w.world, 'a', es)).toEqual({ ok: true });
    expect(buy(w.world, 'a', gb)).toEqual({ ok: true });
    expect([w.player.gold, w.player.families, w.player.family]).toEqual([0, ['gb', 'es'], 'gb']);
    expect(planBuy(w.world, 'a', es)).toEqual({ ok: false, reason: 'Ya tienes esa familia' });
  });

  test('no pide nivel: un jugador de nivel 1 con 4 000 compra cualquiera de las 2', () => {
    for (const item of [gb, es]) {
      const w = inPort(4000);
      expect(w.player.xp).toBe(0);
      expect(buy(w.world, 'a', item)).toEqual({ ok: true });
      expect(w.player.gold).toBe(0);
    }
  });

  test('vale para todos sus barcos: el activo, los que ya tiene y los que compre después', () => {
    const w = inPort(4000 + 2000);
    w.player.ships.frigate = { cannons: 1, hull: 1, sails: 1 };
    expect(buy(w.world, 'a', gb).ok).toBe(true);
    expect(buy(w.world, 'a', { kind: 'ship', classId: 'brig' }).ok).toBe(true); // uno nuevo
    expect(shipSnapshot(w.world, w.ship)).toMatchObject({ c: 'brig', fa: 'gb' });
    expect(selectShip(w.world, 'a', 'frigate').ok).toBe(true); // uno que ya tenía
    expect(shipSnapshot(w.world, w.ship)).toMatchObject({ c: 'frigate', fa: 'gb' });
  });

  test('se rechazan sin cambiar el oro ni la familia: con 3 999 («Necesitas 4000 de oro»), fuera de la zona segura y una familia que ya tiene', () => {
    const poor = inPort(3999);
    expect(buy(poor.world, 'a', gb)).toEqual({ ok: false, reason: 'Necesitas 4000 de oro' });
    expect([poor.player.gold, poor.player.families, poor.player.family]).toEqual([3999, [], 'none']);

    const out = inPort(10_000);
    out.ship.pos = { x: 300, z: 300 };
    expect(buy(out.world, 'a', gb)).toEqual({ ok: false, reason: 'El astillero solo abre en el puerto' });
    expect([out.player.gold, out.player.families, out.player.family]).toEqual([10_000, [], 'none']);

    const owned = inPort(10_000);
    expect(buy(owned.world, 'a', gb).ok).toBe(true);
    expect(selectFamily(owned.world, 'a', 'none').ok).toBe(true);
    expect(buy(owned.world, 'a', gb)).toEqual({ ok: false, reason: 'Ya tienes esa familia' });
    expect([owned.player.gold, owned.player.families, owned.player.family]).toEqual([6000, ['gb'], 'none']);
  });

  test('hundirse no la quita: zarpa con sus familias y la que usa', () => {
    const w = inPort(4000);
    expect(buy(w.world, 'a', es).ok).toBe(true);
    w.ship.pos = { x: 300, z: 300 };
    w.ship.hp = 1;
    w.world.rng = () => 0;
    placePlayer(w.world, 'k', 300, 340);
    expect(attack(w.world, 'k', w.ship.id).ok).toBe(true);
    run(w.world, 2 + DEATH_COUNTDOWN + 1);
    expect(respawn(w.world, 'a')).toEqual({ ok: true });
    expect([w.player.families, w.player.family, shipSnapshot(w.world, shipOfPlayer(w.world, 'a')!).fa]).toEqual([['es'], 'es', 'es']);
  });
});

describe('AC-223: cambiar de aspecto, «sin familia» y las familias que se tienen', () => {
  test('con la británica: «sin familia», la británica y, si la tiene, la española; gratis, al momento, en el barco (fa) y sin tocar su estado', () => {
    const w = inPort(8000);
    expect(buy(w.world, 'a', gb).ok).toBe(true);
    const gold = w.player.gold;
    const before = state(w);
    expect(selectFamily(w.world, 'a', 'none')).toEqual({ ok: true });
    expect([w.player.family, shipSnapshot(w.world, w.ship).fa]).toEqual(['none', 'none']);
    expect(selectFamily(w.world, 'a', 'gb')).toEqual({ ok: true });
    expect([w.player.family, shipSnapshot(w.world, w.ship).fa]).toEqual(['gb', 'gb']);
    expect(selectFamily(w.world, 'a', 'es')).toEqual({ ok: false, reason: 'No tienes esa familia' });
    expect(buy(w.world, 'a', es).ok).toBe(true);
    expect(selectFamily(w.world, 'a', 'gb')).toEqual({ ok: true });
    expect(selectFamily(w.world, 'a', 'es')).toEqual({ ok: true });
    expect([w.player.gold, w.player.families, w.player.family]).toEqual([gold - 4000, ['gb', 'es'], 'es']);
    expect(state(w)).toBe(before);
  });

  test('«sin familia» vale siempre, aunque no tenga ninguna', () => {
    const w = inPort(0);
    expect(selectFamily(w.world, 'a', 'none')).toEqual({ ok: true });
    expect(w.player.family).toBe('none');
  });

  test('se rechaza sin cambios: una familia que no tiene, fuera de la zona segura y con el barco hundiéndose', () => {
    const w = inPort(4000);
    expect(buy(w.world, 'a', gb).ok).toBe(true);
    expect(selectFamily(w.world, 'a', 'es')).toEqual({ ok: false, reason: 'No tienes esa familia' });
    w.ship.pos = { x: 300, z: 300 };
    expect(selectFamily(w.world, 'a', 'none')).toEqual({ ok: false, reason: 'Solo puedes cambiar de familia en el puerto' });
    w.ship.pos = { x: 0, z: 70 };
    w.ship.state = 'sinking';
    expect(selectFamily(w.world, 'a', 'none')).toEqual({ ok: false, reason: 'Tu barco no está a flote' });
    expect(w.player.family).toBe('gb');
  });

  test('planSelectFamily valida sin tocar nada, y plan + apply da lo mismo que selectFamily', () => {
    const direct = inPort(4000);
    const twoStep = inPort(4000);
    for (const w of [direct, twoStep]) expect(buy(w.world, 'a', gb).ok).toBe(true);
    expect(selectFamily(direct.world, 'a', 'none')).toEqual({ ok: true });
    const before = JSON.stringify(twoStep.player);
    expect(planSelectFamily(twoStep.world, 'a', 'none')).toEqual({ ok: true });
    expect(JSON.stringify(twoStep.player)).toBe(before);
    applySelectFamily(twoStep.world, 'a', 'none');
    expect(JSON.stringify(twoStep.player)).toBe(JSON.stringify(direct.player));
  });
});

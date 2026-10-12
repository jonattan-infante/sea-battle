// Tienda en dos pasos para el progreso guardado (AC-130 a): el servidor valida con planBuy / planSelectShip sin tocar el
// mundo, escribe en la BD y solo entonces aplica con applyBuy / applySelectShip. buy() y selectShip() siguen siendo el
// plan más la aplicación en el acto, con el mismo comportamiento de siempre
import { SHIP_CLASSES, UPGRADE_LEVELS } from '../constants';
import {
  addPlayer,
  applyBuy,
  deathPenalty,
  applyPurchase,
  applySelectShip,
  buy,
  planBuy,
  planSelectShip,
  selectShip,
  shipOfPlayer,
  ShopItem
} from '../world';
import { emptyWorld } from './helpers';

function inPort(gold: number) {
  const world = emptyWorld();
  addPlayer(world, 'a', 'a');
  const player = world.players.get('a')!;
  const ship = shipOfPlayer(world, 'a')!;
  player.gold = gold;
  return { world, player, ship };
}

const cannons2: ShopItem = { kind: 'upgrade', upgrade: 'cannons', level: 2 };
const hull2: ShopItem = { kind: 'upgrade', upgrade: 'hull', level: 2 };
const brig: ShopItem = { kind: 'ship', classId: 'brig' };
const state = (w: ReturnType<typeof inPort>) => JSON.stringify({ player: w.player, ship: w.ship });

describe('planBuy: valida como buy y no cambia nada', () => {
  test('con oro de sobra devuelve el precio', () => {
    const w = inPort(5000);
    const before = state(w);
    expect(planBuy(w.world, 'a', cannons2)).toEqual({ ok: true, price: UPGRADE_LEVELS.cannons.prices[1] });
    expect(planBuy(w.world, 'a', brig)).toEqual({ ok: true, price: SHIP_CLASSES.brig.price });
    expect(state(w)).toBe(before);
  });

  test('rechaza lo mismo que buy, con el mismo motivo', () => {
    const poor = inPort(10);
    expect(planBuy(poor.world, 'a', cannons2)).toEqual(buy(inPort(10).world, 'a', cannons2));
    expect(planBuy(poor.world, 'a', { kind: 'upgrade', upgrade: 'cannons', level: 3 })).toEqual({ ok: false, reason: 'Primero necesitas el nivel anterior' });
    const out = inPort(5000);
    out.ship.pos = { x: 300, z: 300 };
    expect(planBuy(out.world, 'a', cannons2)).toEqual({ ok: false, reason: 'El astillero solo abre en el puerto' });
  });
});

describe('planBuy + applyBuy = buy', () => {
  test.each([
    ['Cañones N2', cannons2],
    ['Casco N2', hull2],
    ['Bergantín', brig]
  ])('%s', (_label, item) => {
    const direct = inPort(5000);
    direct.ship.hp = 300;
    expect(buy(direct.world, 'a', item)).toEqual({ ok: true });

    const twoStep = inPort(5000);
    twoStep.ship.hp = 300;
    const plan = planBuy(twoStep.world, 'a', item);
    if (!plan.ok) throw new Error(plan.reason);
    applyBuy(twoStep.world, 'a', item, plan.price);
    expect(state(twoStep)).toBe(state(direct));
  });

  test('applyPurchase sobre una copia del progreso da lo mismo que se aplica después al jugador', () => {
    const w = inPort(5000);
    const copy = { gold: w.player.gold, upgrades: { ...w.player.upgrades }, ownedShips: [...w.player.ownedShips], activeShip: w.player.activeShip };
    applyPurchase(copy, brig, SHIP_CLASSES.brig.price);
    expect(w.player.ownedShips).toEqual(['sloop']); // la copia no toca al jugador
    applyBuy(w.world, 'a', brig, SHIP_CLASSES.brig.price);
    const { gold, upgrades, ownedShips, activeShip } = w.player;
    expect(copy).toEqual({ gold, upgrades, ownedShips, activeShip });
  });
});

describe('limitación conocida (P3): la compra se aplica ~20 ms después de validarla', () => {
  test('si el jugador pierde oro entre medias (muerte), el precio se descuenta con suelo 0: nunca queda oro negativo', () => {
    const w = inPort(UPGRADE_LEVELS.cannons.prices[1]);
    const plan = planBuy(w.world, 'a', cannons2);
    if (!plan.ok) throw new Error(plan.reason);
    w.player.gold = 120; // la penalización de muerte llegó mientras se escribía la compra
    applyBuy(w.world, 'a', cannons2, plan.price);
    expect(w.player.gold).toBe(0);
    expect(w.player.upgrades.cannons).toBe(2); // la compra ya estaba escrita y confirmada: se entrega
  });

  // Cota de BACKLOG «Conocidos de la 1.0.0» (a): lo que se deja de cobrar no pasa del 10 % del oro, y el jugador nunca
  // acaba con más oro que si la compra se hubiera escrito antes de morir
  test('morir entre validar y cobrar nunca deja más oro que comprar y después morir; lo no cobrado ≤ 10 % del oro', () => {
    const prices = [...new Set([...Object.values(UPGRADE_LEVELS).flatMap((u) => u.prices), SHIP_CLASSES.brig.price, SHIP_CLASSES.frigate.price])].filter((p) => p > 0);
    let worst = 0;
    for (const price of prices) {
      for (let gold = price; gold <= price * 3 + 50; gold += 7) {
        const raced = Math.max(0, gold - deathPenalty(gold) - price); // muere y luego se cobra (applyPurchase)
        const ordered = gold - price - deathPenalty(gold - price); // se cobra y luego muere
        const uncharged = price - (gold - deathPenalty(gold) - raced);
        expect(raced).toBeLessThanOrEqual(ordered);
        expect(uncharged).toBeLessThanOrEqual(gold * 0.1);
        worst = Math.max(worst, uncharged / gold);
      }
    }
    expect(worst).toBeGreaterThan(0); // el caso existe: con oro justo, la muerte deja menos que el precio
    const w = inPort(1000);
    const plan = planBuy(w.world, 'a', cannons2);
    if (!plan.ok) throw new Error(plan.reason);
    w.player.gold -= deathPenalty(w.player.gold);
    applyBuy(w.world, 'a', cannons2, plan.price);
    expect(w.player.gold).toBe(Math.max(0, 1000 - deathPenalty(1000) - plan.price)); // la misma cuenta que arriba
  });

  test('si el barco se está hundiendo, la compra se entrega sin devolverle la vida', () => {
    const w = inPort(SHIP_CLASSES.brig.price);
    const plan = planBuy(w.world, 'a', brig);
    if (!plan.ok) throw new Error(plan.reason);
    w.ship.state = 'sinking';
    w.ship.hp = 0;
    applyBuy(w.world, 'a', brig, plan.price);
    expect(w.player.ownedShips).toEqual(['sloop', 'brig']);
    expect(w.player.activeShip).toBe('brig');
    expect(w.ship.classId).toBe('brig'); // Zarpar lo saca con la clase nueva y la vida llena
    expect(w.ship.hp).toBe(0);
    expect(w.ship.state).toBe('sinking');
  });

  test('si el jugador ya no está en el mundo, applyBuy no falla', () => {
    const w = inPort(5000);
    w.world.players.delete('a');
    expect(() => applyBuy(w.world, 'a', cannons2, 500)).not.toThrow();
  });
});

describe('planSelectShip + applySelectShip = selectShip', () => {
  test('mismo resultado y mismos rechazos', () => {
    const direct = inPort(0);
    direct.player.ownedShips.push('brig');
    direct.ship.hp = 300;
    expect(selectShip(direct.world, 'a', 'brig')).toEqual({ ok: true });

    const twoStep = inPort(0);
    twoStep.player.ownedShips.push('brig');
    twoStep.ship.hp = 300;
    const before = state(twoStep);
    expect(planSelectShip(twoStep.world, 'a', 'brig')).toEqual({ ok: true });
    expect(state(twoStep)).toBe(before);
    applySelectShip(twoStep.world, 'a', 'brig');
    expect(state(twoStep)).toBe(state(direct));

    expect(planSelectShip(twoStep.world, 'a', 'frigate')).toEqual({ ok: false, reason: 'No tienes ese barco' });
    twoStep.ship.pos = { x: 300, z: 300 };
    expect(planSelectShip(twoStep.world, 'a', 'sloop')).toEqual({ ok: false, reason: 'Solo puedes cambiar de barco en el puerto' });
  });
});

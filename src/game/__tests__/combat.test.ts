import { CANNONBALL_SPEED, CANNON_LEVELS, SHIP_CLASSES, TICK_RATE } from '../constants';
import { GameEvent } from '../types';
import { attack, cancelAttack, canAttack, moveTo, rollHits, setRepair } from '../world';
import { createRng } from '../vec';
import { DT, dummy, emptyWorld, placePlayer, run } from './helpers';

const volleysOf = (events: GameEvent[], shipId: string) => events.filter((e) => e.type === 'volley' && e.shipId === shipId);

describe('E2 — Ataque persistente (§7)', () => {
  test('AC-30: primera andanada en el siguiente tick y luego cada 4,0 s ±1 tick sin más entradas', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 200);
    const target = dummy(world, 200, 240);
    expect(attack(world, 'a', target.id).ok).toBe(true);

    const ticks: number[] = [];
    for (let i = 1; i <= Math.round(13 * TICK_RATE); i++) {
      run(world, DT).forEach((e) => { if (e.type === 'volley' && e.shipId === ship.id) ticks.push(i); });
    }
    expect(ticks[0]).toBe(1);
    for (let i = 1; i < ticks.length; i++) expect(Math.abs((ticks[i] - ticks[i - 1]) - 4 * TICK_RATE)).toBeLessThanOrEqual(1);
    expect(ticks.length).toBe(4);
  });

  test('AC-31: fuera de alcance no dispara; al entrar en alcance dispara sin una entrada nueva', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 200, 0);
    const target = dummy(world, 200, 300); // 100 m > 60 m
    attack(world, 'a', target.id);
    expect(volleysOf(run(world, 3), ship.id)).toHaveLength(0);
    expect(ship.attackTargetId).toBe(target.id);
    moveTo(world, 'a', { x: 200, z: 260 });
    expect(volleysOf(run(world, 8), ship.id).length).toBeGreaterThan(0);
  });

  test('accuracyOverride (solo escenarios de prueba): con 0 todas las andanadas salen con k = 0 y no hacen daño', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 200);
    const target = dummy(world, 200, 240, 1000);
    ship.accuracyOverride = 0;
    attack(world, 'a', target.id);
    const volleys = volleysOf(run(world, 13), ship.id);
    expect(volleys.length).toBe(4);
    for (const v of volleys) expect(v.type === 'volley' && v.hits).toBe(0);
    expect(target.hp).toBe(1000);
  });

  test('AC-32: el daño medio por andanada es cañones × daño × precisión ±2 % (10 000 andanadas)', () => {
    const rng = createRng(99);
    for (const classId of ['sloop', 'brig', 'frigate']) {
      for (const cannon of CANNON_LEVELS) {
        const cannons = SHIP_CLASSES[classId].cannonsPerSide;
        let total = 0;
        for (let i = 0; i < 10_000; i++) total += rollHits(rng, cannons, cannon.accuracy) * cannon.damage;
        const expected = cannons * cannon.damage * cannon.accuracy;
        expect(Math.abs(total / 10_000 - expected) / expected).toBeLessThanOrEqual(0.02);
      }
    }
  });

  test('AC-33: el daño llega a los d/120 s ±1 tick y no se aplica si el objetivo se hundió antes', () => {
    const world = emptyWorld();
    world.rng = () => 0; // todos los cañones aciertan
    const ship = placePlayer(world, 'a', 200, 200);
    const target = dummy(world, 200, 260); // 60 m → 0,5 s
    attack(world, 'a', target.id);
    let fireTick = -1;
    let impactTick = -1;
    for (let i = 1; i <= 40; i++) {
      for (const e of run(world, DT)) {
        if (e.type === 'volley' && fireTick < 0) fireTick = i;
        if (e.type === 'impact' && impactTick < 0) impactTick = i;
      }
    }
    expect(Math.abs((impactTick - fireTick) * DT - 60 / CANNONBALL_SPEED)).toBeLessThanOrEqual(DT + 1e-9);

    const w2 = emptyWorld();
    w2.rng = () => 0;
    placePlayer(w2, 'b', 200, 200);
    const t2 = dummy(w2, 200, 260, 500);
    attack(w2, 'b', t2.id);
    run(w2, DT); // dispara
    t2.state = 'sinking'; // se hunde antes del impacto
    const hpBefore = t2.hp;
    const events = run(w2, 1);
    expect(events.some((e) => e.type === 'impact')).toBe(false);
    expect(t2.hp).toBe(hpBefore);
  });

  describe('AC-34: el ataque termina en el mismo tick', () => {
    const setup = () => {
      const world = emptyWorld();
      const ship = placePlayer(world, 'a', 200, 200);
      const target = dummy(world, 200, 240, 5000);
      attack(world, 'a', target.id);
      run(world, DT);
      return { world, ship, target };
    };
    test('al cancelar', () => {
      const { world, ship } = setup();
      cancelAttack(world, 'a');
      expect(ship.attackTargetId).toBeNull();
    });
    test('al hundirse el objetivo', () => {
      const { world, ship, target } = setup();
      target.hp = 1;
      world.rng = () => 0;
      run(world, 5);
      expect(target.state).not.toBe('alive');
      expect(ship.attackTargetId).toBeNull();
    });
    test('con el objetivo a más de 200 m', () => {
      const { world, ship, target } = setup();
      target.pos = { x: 200, z: 420 };
      run(world, DT);
      expect(ship.attackTargetId).toBeNull();
    });
    test('al morir el atacante', () => {
      const { world, ship } = setup();
      world.rng = () => 0;
      ship.hp = 1;
      placePlayer(world, 'killer', 230, 200); // PvP fuera de la zona segura
      expect(attack(world, 'killer', ship.id).ok).toBe(true);
      let sunkTickTarget: string | null | undefined;
      for (let i = 0; i < 40 && ship.state === 'alive'; i++) {
        run(world, DT);
        sunkTickTarget = ship.attackTargetId;
      }
      expect(ship.state).toBe('sinking');
      expect(sunkTickTarget).toBeNull();
    });
    test('al empezar a reparar', () => {
      const { world, ship } = setup();
      ship.hp = ship.maxHp / 2;
      setRepair(world, 'a', true);
      expect(ship.attackTargetId).toBeNull();
    });
  });

  test('AC-35: un barco entre atacante y objetivo nunca recibe daño (100 andanadas)', () => {
    const world = emptyWorld();
    placePlayer(world, 'a', 200, 200);
    const between = dummy(world, 200, 225, 1e9);
    const target = dummy(world, 200, 250, 1e9);
    attack(world, 'a', target.id);
    run(world, 100 * 4);
    expect(between.hp).toBe(1e9);
    expect(target.hp).toBeLessThan(1e9);
  });

  test('AC-36 / AC-17: navegar no cancela el ataque y sigue disparando a tiro', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 200);
    const target = dummy(world, 200, 240);
    attack(world, 'a', target.id);
    moveTo(world, 'a', { x: 230, z: 230 });
    const events = run(world, 9);
    moveTo(world, 'a', { x: 170, z: 220 });
    expect(ship.attackTargetId).toBe(target.id);
    expect(volleysOf(events, ship.id).length).toBeGreaterThanOrEqual(3);
  });

  test('AC-07: no se puede atacar a uno mismo, a un id inexistente ni a un barco hundiéndose', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 200);
    const sinking = dummy(world, 200, 240);
    sinking.state = 'sinking';
    expect(attack(world, 'a', ship.id).ok).toBe(false);
    expect(attack(world, 'a', 'ship-999').ok).toBe(false);
    expect(attack(world, 'a', sinking.id).ok).toBe(false);
    expect(ship.attackTargetId).toBeNull();
    expect(canAttack(world, ship, sinking)).toBe(false);
  });
});

describe('E2 — Reparar (§8)', () => {
  test('AC-38: frena, empieza a reparar bajo 1 m/s y suma +16 HP cada 0,5 s hasta 800', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', -300, 200, Math.PI / 2);
    moveTo(world, 'a', { x: 300, z: 200 });
    run(world, 5);
    ship.hp = 400;
    setRepair(world, 'a', true);
    expect(ship.destination).toBeNull();
    let lastHp = ship.hp;
    let started = false;
    const increments: number[] = [];
    for (let i = 0; i < 40 * TICK_RATE && ship.repairing; i++) {
      run(world, DT);
      if (ship.hp !== lastHp) {
        if (!started) expect(ship.speed).toBeLessThanOrEqual(1);
        started = true;
        increments.push(ship.hp - lastHp);
        lastHp = ship.hp;
      }
    }
    expect(ship.hp).toBe(800);
    expect(ship.repairing).toBe(false);
    expect(increments.every((d) => Math.abs(d - 16) < 1e-6)).toBe(true);
  });

  test('AC-39: con daño reciente repara al 1,5 %/s durante 3 s y luego vuelve al 4 %/s', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 200);
    ship.hp = 200;
    setRepair(world, 'a', true);
    ship.lastDamagedAt = world.time;
    const h0 = ship.hp;
    run(world, 2);
    expect(ship.hp - h0).toBeCloseTo(800 * 0.015 * 2, 5);
    run(world, 1.5);
    const h1 = ship.hp;
    run(world, 2);
    expect(ship.hp - h1).toBeCloseTo(800 * 0.04 * 2, 5);
  });

  test('AC-40: navegar o atacar cancela la reparación; reparar cancela el ataque', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 200);
    const target = dummy(world, 200, 240);
    ship.hp = 300;
    setRepair(world, 'a', true);
    moveTo(world, 'a', { x: 250, z: 250 });
    expect(ship.repairing).toBe(false);
    setRepair(world, 'a', true);
    attack(world, 'a', target.id);
    expect(ship.repairing).toBe(false);
    setRepair(world, 'a', true);
    expect(ship.attackTargetId).toBeNull();
  });
});

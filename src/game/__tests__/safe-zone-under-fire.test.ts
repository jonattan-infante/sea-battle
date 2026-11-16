// E20 — Zona segura bajo fuego (GDD §11, «Zona segura bajo fuego (1.3)»; BACKLOG AC-240 a AC-252). La zona protege solo a
// quien está dentro y no ha disparado ni recibido una andanada en los últimos UNDER_FIRE_WINDOW s. Las distancias al puerto
// se miden desde (0, 0); los piratas «anclados» disparan desde su puesto sin moverse (ship.anchored)
import { DEATH_COUNTDOWN, PIRATE_PORT_EXCLUSION, SHIP_CLASSES, SPAWN_PROTECTION, TICK_RATE, UNDER_FIRE_WINDOW } from '../constants';
import { GameEvent, Ship, World } from '../types';
import { distance } from '../vec';
import {
  addPlayer,
  attack,
  buy,
  cancelAttack,
  canUsePort,
  disconnectPlayer,
  drainEvents,
  isInSafeZone,
  isUnderFire,
  isZoneProtected,
  planBuy,
  planSelectFamily,
  planSelectShip,
  PORT_UNDER_FIRE_TEXT,
  respawn,
  selectShip,
  setRepair,
  shipOfPlayer,
  step
} from '../world';
import { DT, dummy, emptyWorld, placeMerchant, placePirate, placePlayer, run } from './helpers';

// Pirata que dispara desde su puesto sin moverse, en patrulla hasta que vea a alguien
function anchoredPirate(world: World, x: number, z: number, accuracy?: number): Ship {
  const pirate = placePirate(world, x, z);
  pirate.anchored = true;
  pirate.holdPosition = true;
  if (accuracy !== undefined) pirate.accuracyOverride = accuracy;
  return pirate;
}

// Un tick, con sus eventos
function tick(world: World): GameEvent[] {
  step(world, DT);
  return drainEvents(world);
}

const volleysOf = (events: GameEvent[], from: Ship, to?: Ship) =>
  events.filter((e): e is Extract<GameEvent, { type: 'volley' }> => e.type === 'volley' && e.shipId === from.id && (!to || e.targetId === to.id));

// Avanza hasta la siguiente andanada de `from` (contra `to`, si se da) y devuelve el world.time de ese tick
function untilVolley(world: World, from: Ship, to?: Ship, maxSeconds = 10, onTick?: () => void): number {
  for (let i = 0; i < maxSeconds * TICK_RATE; i++) {
    const events = tick(world);
    onTick?.();
    if (volleysOf(events, from, to).length) return world.time;
  }
  throw new Error(`${from.id} no disparó en ${maxSeconds} s`);
}

function makeFrigateN3(world: World, id: string, x: number, z: number): Ship {
  addPlayer(world, id, id);
  const player = world.players.get(id)!;
  player.ships.frigate = { cannons: 3, hull: 1, sails: 1 }; // las mejoras son de cada barco (1.3, E19)
  const ship = shipOfPlayer(world, id)!;
  expect(selectShip(world, id, 'frigate').ok).toBe(true);
  ship.pos = { x, z };
  ship.protectedUntil = 0;
  return ship;
}

describe('H-2001 — Qué es estar bajo fuego', () => {
  test('AC-240 (a): disparar a un NPC deja al tirador bajo fuego hasta el disparo + 10 s', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 200);
    const target = dummy(world, 200, 230);
    expect(ship.underFireUntil).toBe(-Infinity);
    expect(attack(world, 'a', target.id).ok).toBe(true);
    const t = untilVolley(world, ship, target);
    expect(ship.underFireUntil).toBeCloseTo(t + UNDER_FIRE_WINDOW, 9);
    expect(isUnderFire(world, ship)).toBe(true);
    expect(target.underFireUntil).toBe(-Infinity); // solo los jugadores llevan la marca
  });

  test('AC-240 (b): disparar a un jugador deja bajo fuego al tirador y al blanco', () => {
    const world = emptyWorld();
    const a = placePlayer(world, 'a', 0, 200);
    const b = placePlayer(world, 'b', 0, 230);
    expect(attack(world, 'a', b.id).ok).toBe(true);
    const t = untilVolley(world, a, b);
    expect(a.underFireUntil).toBeCloseTo(t + UNDER_FIRE_WINDOW, 9);
    expect(b.underFireUntil).toBeCloseTo(t + UNDER_FIRE_WINDOW, 9);
  });

  test('AC-240 (c): una andanada lanzada contra él, de un NPC o de un jugador, con 0 aciertos, también lo marca', () => {
    const world = emptyWorld();
    const victim = placePlayer(world, 'v', 300, -300);
    const pirate = anchoredPirate(world, 300, -340, 0);
    const t = untilVolley(world, pirate, victim);
    expect(victim.underFireUntil).toBeCloseTo(t + UNDER_FIRE_WINDOW, 9);
    expect(pirate.underFireUntil).toBe(-Infinity);

    const w2 = emptyWorld();
    const shooter = placePlayer(w2, 's', 0, 200);
    shooter.accuracyOverride = 0;
    const blank = placePlayer(w2, 'b', 0, 240);
    expect(attack(w2, 's', blank.id).ok).toBe(true);
    let hits = -1;
    let t2 = -1;
    for (let i = 0; i < 2 * TICK_RATE && t2 < 0; i++) {
      for (const e of volleysOf(tick(w2), shooter, blank)) {
        hits = e.hits;
        t2 = w2.time;
      }
    }
    expect(hits).toBe(0);
    expect(blank.underFireUntil).toBeCloseTo(t2 + UNDER_FIRE_WINDOW, 9);
  });

  test('AC-240: con 2 andanadas a t = 0 y t = 4 s, la marca queda en 14 s; una andanada nunca la acorta (max)', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 200);
    const target = dummy(world, 200, 230);
    attack(world, 'a', target.id);
    const t0 = untilVolley(world, ship, target);
    const t1 = untilVolley(world, ship, target);
    expect(t1 - t0).toBeCloseTo(4, 9); // recarga del cañón N1
    expect(ship.underFireUntil - t0).toBeCloseTo(14, 9);

    ship.underFireUntil = world.time + 30;
    const longer = ship.underFireUntil;
    untilVolley(world, ship, target);
    expect(ship.underFireUntil).toBe(longer);
  });

  describe('AC-241: sin andanadas no hay marca (30 s por caso)', () => {
    test('(a) arma un ataque contra un objetivo fuera de alcance sin llegar a disparar', () => {
      const world = emptyWorld();
      const ship = placePlayer(world, 'a', 200, 200);
      const far = dummy(world, 200, 350); // 150 m: fuera de los 60 m del cañón N1 y dentro de los 200 del ataque
      expect(attack(world, 'a', far.id).ok).toBe(true);
      const events = run(world, 30, () => {
        ship.pos = { x: 200, z: 200 };
        ship.speed = 0;
      });
      expect(ship.attackTargetId).toBe(far.id);
      expect(volleysOf(events, ship)).toHaveLength(0);
      expect(ship.underFireUntil).toBe(-Infinity);
    });

    test('(b) un pirata en combate lo persigue sin tenerlo a tiro', () => {
      const world = emptyWorld();
      const pirate = placePirate(world, 400, -150);
      const ship = placePlayer(world, 'a', 320, -150);
      pirate.ai!.state = 'combat';
      pirate.ai!.targetId = ship.id;
      pirate.attackTargetId = ship.id;
      let chasing = 0;
      const events = run(world, 30, () => {
        ship.pos = { x: pirate.pos.x - 80, z: pirate.pos.z }; // siempre a 80 m: fuera de sus 55 m
        if (pirate.ai!.state === 'combat') chasing++;
      });
      expect(chasing / TICK_RATE).toBeGreaterThan(10);
      expect(volleysOf(events, pirate)).toHaveLength(0);
      expect(ship.underFireUntil).toBe(-Infinity);
    });

    test('(c) repara', () => {
      const world = emptyWorld();
      const ship = placePlayer(world, 'a', 200, 200);
      ship.hp = 1;
      expect(setRepair(world, 'a', true).ok).toBe(true);
      run(world, 30);
      expect(ship.hp).toBe(ship.maxHp); // reparó hasta el final
      expect(ship.underFireUntil).toBe(-Infinity);
    });

    test('(d) recoge unos restos', () => {
      const world = emptyWorld();
      const ship = placePlayer(world, 'a', 200, 200);
      const gold = world.players.get('a')!.gold;
      world.wrecks.push({ id: 'wreck-1', pos: { x: 200, z: 205 }, gold: 25, expiresAt: 999 });
      run(world, 30);
      expect(world.players.get('a')!.gold).toBe(gold + 25);
      expect(ship.underFireUntil).toBe(-Infinity);
    });

    test('(e) un mercante huye de él', () => {
      const world = emptyWorld();
      const ship = placePlayer(world, 'a', 200, 0);
      const merchant = placeMerchant(world, 200, 40);
      merchant.ai!.state = 'flee';
      merchant.ai!.threatId = ship.id;
      merchant.ai!.fleeUntil = world.time + 30;
      let fleeing = 0;
      run(world, 30, () => {
        if (merchant.ai!.state === 'flee') fleeing++;
      });
      expect(fleeing / TICK_RATE).toBeGreaterThan(10);
      expect(ship.underFireUntil).toBe(-Infinity);
    });

    test('(f) otros dos barcos combaten a ≤ 30 m de él', () => {
      const world = emptyWorld();
      const ship = placePlayer(world, 'a', 200, 200);
      const x = placePlayer(world, 'x', 200, 215);
      const y = placePlayer(world, 'y', 200, 185);
      for (const s of [x, y]) s.hp = s.maxHp = 1e6;
      expect(attack(world, 'x', y.id).ok).toBe(true);
      expect(attack(world, 'y', x.id).ok).toBe(true);
      const events = run(world, 30, () => {
        for (const s of [ship, x, y]) s.speed = 0;
      });
      expect(volleysOf(events, x).length).toBeGreaterThan(5);
      expect(isUnderFire(world, x) && isUnderFire(world, y)).toBe(true);
      expect(ship.underFireUntil).toBe(-Infinity);
    });
  });

  test('AC-242: la marca dura hasta t0 + 10 tick a tick a 20 Hz; zarpar la quita y desconectarse no', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 200, 200);
    const target = dummy(world, 200, 230);
    attack(world, 'a', target.id);
    const t0 = untilVolley(world, ship, target);
    cancelAttack(world, 'a');
    let lastUnder = -1;
    let firstFree = -1;
    for (let i = 0; i < 12 * TICK_RATE && firstFree < 0; i++) {
      tick(world);
      const under = isUnderFire(world, ship);
      expect(under).toBe(world.time < t0 + UNDER_FIRE_WINDOW);
      if (under) lastUnder = world.time;
      else firstFree = world.time;
    }
    expect(lastUnder).toBeLessThan(t0 + UNDER_FIRE_WINDOW);
    expect(firstFree).toBeGreaterThanOrEqual(t0 + UNDER_FIRE_WINDOW);
    expect(firstFree - lastUnder).toBeCloseTo(DT, 9);

    // Hundido bajo fuego: al zarpar sale sin marca
    attack(world, 'a', target.id);
    untilVolley(world, ship, target);
    expect(isUnderFire(world, ship)).toBe(true);
    placePlayer(world, 'k', 200, 170);
    world.rng = () => 0;
    ship.hp = 1;
    attack(world, 'k', ship.id);
    run(world, 2);
    expect(ship.state).not.toBe('alive');
    run(world, DEATH_COUNTDOWN);
    expect(respawn(world, 'a').ok).toBe(true);
    expect(ship.underFireUntil).toBe(-Infinity);
    expect(isUnderFire(world, ship)).toBe(false);

    // Desconectado: sigue bajo fuego hasta t0 + 10
    const w2 = emptyWorld();
    const s2 = placePlayer(w2, 'b', 200, 200);
    const t2 = dummy(w2, 200, 230);
    attack(w2, 'b', t2.id);
    const at = untilVolley(w2, s2, t2);
    disconnectPlayer(w2, 'b');
    for (let i = 0; i < 9.5 * TICK_RATE; i++) {
      tick(w2);
      expect(isUnderFire(w2, s2)).toBe(w2.time < at + UNDER_FIRE_WINDOW);
    }
    expect(isUnderFire(w2, s2)).toBe(true);
    expect(w2.ships.has(s2.id)).toBe(true);
  });
});

describe('H-2002 — La zona no protege a quien está bajo fuego', () => {
  test('AC-243: entrar perseguido; el pirata anclado no lo suelta y su siguiente andanada le hace daño', () => {
    const world = emptyWorld();
    const pirate = anchoredPirate(world, 0, 135, 1);
    const ship = placePlayer(world, 'a', 0, 180); // fuera de la zona y a 45 m del pirata
    untilVolley(world, pirate, ship);
    expect(isInSafeZone(ship.pos)).toBe(false);
    ship.pos = { x: 0, z: 90 }; // dentro, a 90 m del puerto y a 45 m del pirata
    ship.speed = 0;
    expect(isInSafeZone(ship.pos)).toBe(true);
    run(world, 1); // llega la andanada en vuelo
    const hp = ship.hp;
    untilVolley(world, pirate, ship);
    expect(pirate.ai!.state).toBe('combat');
    expect(pirate.ai!.targetId).toBe(ship.id);
    run(world, 1);
    expect(ship.hp).toBeLessThan(hp);
  });

  test('AC-244: la andanada en vuelo llega aunque el blanco cruce los 110 m antes del impacto', () => {
    const world = emptyWorld();
    const b = placePlayer(world, 'b', 0, 115);
    const a = placePlayer(world, 'a', 0, 160);
    a.accuracyOverride = 1;
    expect(isUnderFire(world, b)).toBe(false);
    expect(attack(world, 'a', b.id).ok).toBe(true);
    untilVolley(world, a, b);
    b.pos = { x: 0, z: 105 };
    expect(isInSafeZone(b.pos)).toBe(true);
    const impacts = run(world, 1).filter((e) => e.type === 'impact' && e.shipId === b.id);
    expect(impacts).toHaveLength(1);
    const impact = impacts[0] as Extract<GameEvent, { type: 'impact' }>;
    expect(impact.damage).toBeGreaterThan(0);
    expect(b.hp).toBe(b.maxHp - impact.damage);
  });

  test('AC-245: el daño dentro renueva la marca; al caducar queda protegido, el ataque termina, el pirata regresa y no hay más andanadas', () => {
    const world = emptyWorld();
    const b = placePlayer(world, 'b', 0, 120);
    b.hp = b.maxHp = 1e6;
    const a = placePlayer(world, 'a', 30, 140);
    const pirate = anchoredPirate(world, 0, 135);
    pirate.reload = 999; // lo tiene de objetivo sin disparar (recarga bloqueada por el test)
    expect(attack(world, 'a', b.id).ok).toBe(true);
    untilVolley(world, a, b);
    b.pos = { x: 0, z: 100 }; // entra bajo fuego
    const t = untilVolley(world, a, b);
    expect(isInSafeZone(b.pos)).toBe(true);
    expect(b.underFireUntil).toBeCloseTo(t + UNDER_FIRE_WINDOW, 9);
    expect(pirate.ai!.targetId).toBe(b.id);

    a.pos = { x: 0, z: 260 }; // deja de disparar: a 160 m, el ataque sigue (≤ 200 m) pero fuera de alcance
    a.speed = 0;
    let expiredAt = -1;
    for (let i = 0; i < 11 * TICK_RATE && expiredAt < 0; i++) {
      const events = tick(world);
      a.pos = { x: 0, z: 260 };
      expect(volleysOf(events, a, b)).toHaveLength(0);
      if (!isUnderFire(world, b)) {
        expiredAt = world.time;
        expect(isZoneProtected(world, b)).toBe(true); // (a)
        expect(a.attackTargetId).toBeNull(); // (b) AC-34
        expect(pirate.ai!.state).toBe('return'); // (c)
      } else {
        expect(a.attackTargetId).toBe(b.id);
        expect(pirate.ai!.state).toBe('combat');
      }
    }
    expect(expiredAt).toBeGreaterThanOrEqual(t + UNDER_FIRE_WINDOW);

    // (d) ni el pirata, ya sin recarga, ni el jugador, de nuevo a tiro, le lanzan nada más
    pirate.reload = 0;
    a.pos = { x: 30, z: 140 };
    expect(attack(world, 'a', b.id)).toEqual({ ok: false, reason: 'No puedes atacar ese objetivo' });
    const after = run(world, 10, () => {
      b.pos = { x: 0, z: 100 };
    });
    expect(after.filter((e) => e.type === 'volley' && e.targetId === b.id)).toHaveLength(0);
    expect(isUnderFire(world, b)).toBe(false);
  });

  test('AC-246: sin marca, nadie te la pone dentro (60 s con un pirata anclado a 35 m y un hostil fuera a 40 m)', () => {
    const world = emptyWorld();
    const b = placePlayer(world, 'b', 0, 100);
    const pirate = anchoredPirate(world, 0, 135, 0);
    const hostile = placePlayer(world, 'h', 0, 140);
    hostile.hp = hostile.maxHp = 1e6;
    expect(distance(b.pos, pirate.pos)).toBeCloseTo(35, 9);
    expect(distance(b.pos, hostile.pos)).toBeCloseTo(40, 9);
    expect(isInSafeZone(hostile.pos)).toBe(false);
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 * TICK_RATE; i++) {
      if (i % TICK_RATE === 0) expect(attack(world, 'h', b.id)).toEqual({ ok: false, reason: 'No puedes atacar ese objetivo' });
      events.push(...tick(world));
      b.pos = { x: 0, z: 100 };
      b.speed = 0;
      expect(pirate.ai!.targetId).not.toBe(b.id);
    }
    expect(events.filter((e) => e.type === 'volley' && e.targetId === b.id)).toHaveLength(0);
    expect(b.underFireUntil).toBe(-Infinity);
  });

  test('AC-247: PvP, el que huye: el ataque sigue dentro y renueva las 2 marcas; termina 10 s después de la última andanada', () => {
    const world = emptyWorld();
    const a = placePlayer(world, 'a', 0, 150);
    const b = placePlayer(world, 'b', 0, 180);
    a.accuracyOverride = 1;
    b.hp = b.maxHp = 1e6;
    expect(attack(world, 'a', b.id).ok).toBe(true);
    untilVolley(world, a, b);
    b.pos = { x: 0, z: 100 }; // entra bajo fuego, a 50 m de A
    b.speed = 0;
    let last = -1;
    for (let k = 0; k < 3; k++) {
      const hp = b.hp;
      last = untilVolley(world, a, b, 10, () => (b.pos = { x: 0, z: 100 }));
      expect(a.underFireUntil).toBeCloseTo(last + UNDER_FIRE_WINDOW, 9);
      expect(b.underFireUntil).toBeCloseTo(last + UNDER_FIRE_WINDOW, 9);
      run(world, 1);
      expect(b.hp).toBeLessThan(hp);
    }
    a.pos = { x: 0, z: 260 }; // deja de disparar: fuera de alcance, con el ataque aún vivo
    let ended = -1;
    for (let i = 0; i < 11 * TICK_RATE && ended < 0; i++) {
      tick(world);
      a.pos = { x: 0, z: 260 };
      if (!a.attackTargetId) ended = world.time;
      expect(isZoneProtected(world, b)).toBe(ended >= 0);
    }
    expect(ended).toBeGreaterThanOrEqual(last + UNDER_FIRE_WINDOW);
    expect(ended - (last + UNDER_FIRE_WINDOW)).toBeLessThan(DT + 1e-9);
  });

  test('AC-248: PvP desde dentro, (a) a (d)', () => {
    const world = emptyWorld();
    const a = placePlayer(world, 'a', 0, 150);
    const b = placePlayer(world, 'b', 0, 100);
    const merchant = dummy(world, 30, 100);
    // (a) B, dentro y sin marca, contra A, fuera
    expect(attack(world, 'b', a.id).ok).toBe(false);
    // (b) B, dentro y bajo fuego porque disparó a un mercante hace < 10 s, contra A: se acepta, y A puede atacar a B
    expect(attack(world, 'b', merchant.id).ok).toBe(true);
    untilVolley(world, b, merchant);
    cancelAttack(world, 'b');
    run(world, 5);
    expect(isUnderFire(world, b)).toBe(true);
    expect(attack(world, 'b', a.id).ok).toBe(true);
    expect(attack(world, 'a', b.id).ok).toBe(true);
    // (c) C, dentro y sin marca, contra B, dentro y bajo fuego: se rechaza
    const c = placePlayer(world, 'c', -20, 90);
    expect(isInSafeZone(c.pos) && isUnderFire(world, b) && isInSafeZone(b.pos)).toBe(true);
    expect(attack(world, 'c', b.id).ok).toBe(false);
    // (d) C sale de la zona y lo envía de nuevo: se acepta
    c.pos = { x: -20, z: 125 };
    expect(attack(world, 'c', b.id).ok).toBe(true);
  });

  test('AC-249: disparar desde dentro a un NPC: queda bajo fuego en su primera andanada y el pirata responde con daño', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 0, 85);
    const pirate = anchoredPirate(world, 0, 135, 1);
    expect(distance(ship.pos, pirate.pos)).toBe(50);
    run(world, 2);
    expect(pirate.ai!.state).toBe('patrol'); // sin marca no lo elige
    expect(attack(world, 'a', pirate.id).ok).toBe(true);
    const t = untilVolley(world, ship, pirate);
    expect(ship.underFireUntil).toBeCloseTo(t + UNDER_FIRE_WINDOW, 9);
    const hp = ship.hp;
    untilVolley(world, pirate, ship, 10, () => (ship.pos = { x: 0, z: 85 }));
    run(world, 1, () => (ship.pos = { x: 0, z: 85 }));
    expect(ship.hp).toBeLessThan(hp);
  });

  test('AC-250: morir dentro bajo fuego es como morir fuera: oro, XP, pantalla de muerte, y zarpa sin marca y protegido', () => {
    // El mismo hundimiento dentro de la zona (bajo fuego) y fuera; todo lo de la muerte tiene que coincidir
    const sinkAt = (inside: boolean) => {
      const world = emptyWorld();
      const victimZ = inside ? 100 : 200;
      const victim = placePlayer(world, 'v', 0, victimZ);
      const killer = placePlayer(world, 'k', 0, victimZ + 40);
      world.players.get('v')!.gold = 500;
      const merchant = dummy(world, 30, victimZ);
      attack(world, 'v', merchant.id);
      untilVolley(world, victim, merchant);
      cancelAttack(world, 'v');
      expect(isInSafeZone(victim.pos)).toBe(inside);
      expect(isUnderFire(world, victim)).toBe(true);
      victim.hp = 1;
      world.rng = () => 0;
      expect(attack(world, 'k', victim.id).ok).toBe(true);
      run(world, 2);
      expect(victim.state).toBe('sinking');
      const v = world.players.get('v')!;
      const k = world.players.get('k')!;
      const result = { victimGold: v.gold, killerGold: k.gold, killerXp: k.xp, death: v.death };
      run(world, DEATH_COUNTDOWN);
      expect(respawn(world, 'v').ok).toBe(true);
      return { ...result, uf: victim.underFireUntil, protectedFor: victim.protectedUntil - world.time, underFire: isUnderFire(world, victim) };
    };
    const inside = sinkAt(true);
    const outside = sinkAt(false);
    expect(inside.victimGold).toBe(450);
    expect(inside.killerGold - outside.killerGold).toBe(0);
    expect(inside.killerGold).toBe(100 + 50);
    expect(inside.killerXp).toBeGreaterThan(0);
    expect(inside.killerXp).toBe(outside.killerXp);
    expect(inside.death).toEqual(outside.death);
    expect(inside.death).toMatchObject({ by: 'k', goldLost: 50 });
    expect(inside.uf).toBe(-Infinity);
    expect(inside.underFire).toBe(false);
    expect(inside.protectedFor).toBeCloseTo(SPAWN_PROTECTION, 9);
  });
});

describe('H-2003 — Los NPC no entran ni regalan una granja (AC-251)', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  test.each([1, 2, 3])('(a) semilla %i: en 60 s con el jugador entre 40 y 110 m del puerto, el pirata nunca está a < 130 m', (seed) => {
    const world = emptyWorld(seed);
    const pirate = placePirate(world, 0, 150); // a 40 m del jugador, que empieza en el borde (110 m)
    pirate.ai!.origin = { x: 0, z: 145 }; // junto al borde de 130 m: vuelve a verlo cada vez que el jugador se acerca
    const ship = placePlayer(world, 'a', 0, 110);
    ship.hp = ship.maxHp = 1e6;
    pirate.ai!.state = 'combat';
    pirate.ai!.targetId = ship.id;
    pirate.attackTargetId = ship.id;
    let minR = Infinity;
    let combat = 0;
    for (let i = 0; i < 60 * TICK_RATE; i++) {
      // El jugador va y viene entre 40 y 110 m por la línea del pirata, siempre bajo fuego
      const phase = (i / TICK_RATE / 12) * Math.PI * 2;
      const r = 75 + 35 * Math.cos(phase);
      ship.pos = { x: 0, z: r };
      ship.speed = 0;
      ship.underFireUntil = world.time + UNDER_FIRE_WINDOW;
      tick(world);
      minR = Math.min(minR, distance(pirate.pos, { x: 0, z: 0 }));
      if (pirate.ai!.state === 'combat') combat++;
    }
    expect(combat).toBeGreaterThan(0);
    expect(minR).toBeGreaterThanOrEqual(PIRATE_PORT_EXCLUSION - 1e-9);
  });

  test.each(SEEDS)('(b) semilla %i: suelta al jugador en el primer tick dentro y fuera de su alcance, y no vuelve a combate aunque le dispare', (seed) => {
    const world = emptyWorld(seed);
    const pirate = placePirate(world, 0, 150);
    pirate.ai!.origin = { x: 0, z: 250 };
    pirate.hp = pirate.maxHp = 1e5; // que la Fragata N3 no lo hunda antes de que llegue a la zona
    const ship = makeFrigateN3(world, 'a', 0, 125);
    ship.hp = ship.maxHp = 1e6;
    ship.accuracyOverride = 1;
    const range = SHIP_CLASSES.pirate.cannon!.range;
    pirate.ai!.state = 'combat';
    pirate.ai!.targetId = ship.id;
    pirate.attackTargetId = ship.id;
    expect(attack(world, 'a', pirate.id).ok).toBe(true);
    let dropped = false;
    let hitsWhileGone = 0;
    for (let i = 0; i < 30 * TICK_RATE; i++) {
      // Se mete en la zona a 10 m/s hasta 60 m del puerto y se queda allí, disparando a lo que tenga a tiro
      const z = Math.max(60, ship.pos.z - 10 * DT);
      ship.pos = { x: 0, z };
      ship.speed = 0;
      const outOfReach = isInSafeZone(ship.pos) && distance(pirate.pos, ship.pos) > range;
      const hpBefore = pirate.hp;
      tick(world);
      if (outOfReach && !dropped) {
        expect(pirate.ai!.state).toBe('return');
        dropped = true;
        expect(isUnderFire(world, ship)).toBe(true);
        ship.reload = 0; // le dispara en cuanto puede, aún a tiro de sus 80 m
      }
      if (dropped && outOfReach) {
        expect(pirate.ai!.state).not.toBe('combat');
        if (pirate.hp < hpBefore) hitsWhileGone++;
      }
      if (pirate.state !== 'alive') break;
    }
    expect(dropped).toBe(true);
    expect(hitsWhileGone).toBeGreaterThan(0); // le disparó mientras se alejaba
  });

  test.each(SEEDS)('(c) semilla %i: Fragata N3 parada a 60 m disparando a un pirata a 135 m: a los 10 s está en Regreso o Patrulla y a > 80 m', (seed) => {
    const world = emptyWorld(seed);
    const ship = makeFrigateN3(world, 'a', 0, 60);
    ship.underFireUntil = world.time + UNDER_FIRE_WINDOW;
    const pirate = placePirate(world, 0, 135);
    pirate.ai!.origin = { x: 0, z: 300 }; // en la prolongación de la línea jugador → pirata
    pirate.ai!.wait = 0;
    pirate.ai!.state = 'combat';
    pirate.ai!.targetId = ship.id;
    pirate.attackTargetId = ship.id;
    expect(distance(ship.pos, pirate.pos)).toBe(75);
    expect(attack(world, 'a', pirate.id).ok).toBe(true);
    const events = run(world, 10, () => {
      ship.pos = { x: 0, z: 60 };
      ship.speed = 0;
      if (ship.attackTargetId === null && pirate.state === 'alive') attack(world, 'a', pirate.id);
    });
    expect(volleysOf(events, ship).length).toBeGreaterThan(0);
    expect(volleysOf(events, pirate)).toHaveLength(0);
    expect(['return', 'patrol']).toContain(pirate.ai!.state);
    expect(distance(pirate.pos, ship.pos)).toBeGreaterThan(80);
  });
});

describe('H-2004 — El puerto cierra bajo fuego (AC-252)', () => {
  const cannons2 = { kind: 'upgrade', upgrade: 'cannons', level: 2, ship: 'sloop' } as const; // la mejora lleva el barco (1.3, E19)
  const brig = { kind: 'ship', classId: 'brig' } as const;

  function inPort() {
    const world = emptyWorld();
    addPlayer(world, 'a', 'a');
    const player = world.players.get('a')!;
    const ship = shipOfPlayer(world, 'a')!;
    player.gold = 99_999;
    player.ships.frigate = { cannons: 1, hull: 1, sails: 1 };
    ship.pos = { x: 0, z: 80 };
    return { world, player, ship };
  }
  const snapshot = (w: ReturnType<typeof inPort>) =>
    JSON.stringify({ gold: w.player.gold, ships: w.player.ships, families: w.player.families, family: w.player.family, active: w.player.activeShip, cls: w.ship.classId, hp: w.ship.hp });

  test('planBuy y planSelectShip: fuera, el motivo de hoy; dentro bajo fuego, el de bajo fuego; dentro sin marca, se acepta', () => {
    const w = inPort();
    expect(canUsePort(w.world, w.ship)).toBe(true);
    expect(planBuy(w.world, 'a', cannons2)).toMatchObject({ ok: true });
    expect(planSelectShip(w.world, 'a', 'frigate')).toEqual({ ok: true });

    w.ship.underFireUntil = w.world.time + UNDER_FIRE_WINDOW;
    expect(canUsePort(w.world, w.ship)).toBe(false);
    expect(planBuy(w.world, 'a', cannons2)).toEqual({ ok: false, reason: PORT_UNDER_FIRE_TEXT });
    expect(planBuy(w.world, 'a', brig)).toEqual({ ok: false, reason: PORT_UNDER_FIRE_TEXT });
    expect(planSelectShip(w.world, 'a', 'frigate')).toEqual({ ok: false, reason: PORT_UNDER_FIRE_TEXT });
    // Cambiar de familia es del Astillero, como comprar y cambiar de barco (1.3: E19 con E20)
    expect(planSelectFamily(w.world, 'a', 'none')).toEqual({ ok: false, reason: PORT_UNDER_FIRE_TEXT });

    for (const marked of [false, true]) {
      w.ship.underFireUntil = marked ? w.world.time + UNDER_FIRE_WINDOW : -Infinity;
      w.ship.pos = { x: 300, z: 300 };
      expect(planBuy(w.world, 'a', cannons2)).toEqual({ ok: false, reason: 'El astillero solo abre en el puerto' });
      expect(planSelectShip(w.world, 'a', 'frigate')).toEqual({ ok: false, reason: 'Solo puedes cambiar de barco en el puerto' });
      expect(planSelectFamily(w.world, 'a', 'none')).toEqual({ ok: false, reason: 'Solo puedes cambiar de familia en el puerto' });
      w.ship.pos = { x: 0, z: 80 };
    }
    expect(PORT_UNDER_FIRE_TEXT).not.toBe('El astillero solo abre en el puerto');
  });

  test('buy y selectShip bajo fuego no cambian oro, mejoras, barcos, clase ni vida; al caducar la marca, se aceptan', () => {
    const w = inPort();
    const target = dummy(w.world, 30, 80);
    attack(w.world, 'a', target.id);
    untilVolley(w.world, w.ship, target);
    cancelAttack(w.world, 'a');
    w.ship.hp = 500;
    expect(isInSafeZone(w.ship.pos) && isUnderFire(w.world, w.ship)).toBe(true);
    const before = snapshot(w);
    expect(buy(w.world, 'a', cannons2)).toEqual({ ok: false, reason: PORT_UNDER_FIRE_TEXT });
    expect(buy(w.world, 'a', brig)).toEqual({ ok: false, reason: PORT_UNDER_FIRE_TEXT });
    expect(selectShip(w.world, 'a', 'frigate')).toEqual({ ok: false, reason: PORT_UNDER_FIRE_TEXT });
    expect(snapshot(w)).toBe(before);

    run(w.world, UNDER_FIRE_WINDOW + DT, () => (w.ship.pos = { x: 0, z: 80 }));
    expect(isUnderFire(w.world, w.ship)).toBe(false);
    expect(buy(w.world, 'a', cannons2)).toEqual({ ok: true });
    expect(selectShip(w.world, 'a', 'frigate')).toEqual({ ok: true });
    expect(w.player.ships.sloop?.cannons).toBe(2);
    expect(w.ship.classId).toBe('frigate');
  });
});

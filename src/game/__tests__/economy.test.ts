import { CAPTAIN_CLASS, DEATH_COUNTDOWN, GUNBOAT_CLASS, DISCONNECT_GRACE, PORT_POSITION, RESPAWN_CLOCK_TOLERANCE, RESPAWN_RING, SHIP_CLASSES, SINKING_TIME, SPAWN_PROTECTION, TICK_RATE, WRECK_LIFETIME } from '../constants';
import { GameEvent, Player, Ship, World } from '../types';
import { distance } from '../vec';
import {
  addPlayer,
  attack,
  buy,
  cannonOf,
  canAttack,
  createWorld,
  disconnectPlayer,
  isInSafeZone,
  itemPrice,
  moveTo,
  respawn,
  selectShip,
  setRepair,
  shipOfPlayer,
  ShopItem,
  splitReward
} from '../world';
import { DT, dummy, emptyWorld, median, placeMerchant, placePirate, placePlayer, run, runUntil } from './helpers';

// Cola de tiradas: cada valor < precisión es un impacto; al vaciarse, todo falla
function scriptedRng(world: World, rolls: number[]): void {
  world.rng = () => (rolls.length ? rolls.shift()! : 0.999);
}

function seedDamage(target: Ship, entries: [Ship, number, number][]): void {
  target.damage = entries.map(([ship, amount, firstAt]) => ({ playerId: ship.ownerId!, shipId: ship.id, amount, at: 0, firstAt }));
}

function lootOf(events: GameEvent[], playerId: string, source?: string): number[] {
  return events.flatMap((e) => (e.type === 'loot' && e.playerId === playerId && (!source || e.source === source) ? [e.gold] : []));
}

describe('E4 — Botín (§10)', () => {
  test('AC-56: pirata dañado 60 % por A y 40 % por B → 63 y 42 de oro (suma 105), una sola vez', () => {
    const world = emptyWorld();
    const a = placePlayer(world, 'A', 300, 300);
    const b = placePlayer(world, 'B', 330, 330);
    const pirate = placePirate(world, 300, 340);
    pirate.ai = null; // sin IA: solo medimos el reparto
    seedDamage(pirate, [[a, 240, 0.1], [b, 180, 0.2]]);
    pirate.hp = 30;
    scriptedRng(world, [0, 0.999, 0.999, 0.999]); // A acierta 1 bala de 30 → 270 / 180
    attack(world, 'A', pirate.id);
    const goldA = world.players.get('A')!.gold;
    const goldB = world.players.get('B')!.gold;
    const events = run(world, 3);
    expect(lootOf(events, 'A', 'kill')).toEqual([63]);
    expect(lootOf(events, 'B', 'kill')).toEqual([42]);
    expect(world.players.get('A')!.gold - goldA).toBe(63);
    expect(world.players.get('B')!.gold - goldB).toBe(42);
  });

  test('AC-57: pirata (105) dañado a partes iguales por A y B, con A primero → 53 y 52 (el resto va a quien dañó primero)', () => {
    expect([...splitReward([
      { playerId: 'A', amount: 225, firstAt: 1 },
      { playerId: 'B', amount: 225, firstAt: 2 }
    ], 105)]).toEqual([['A', 53], ['B', 52]]);

    const world = emptyWorld();
    const a = placePlayer(world, 'A', 300, 300);
    const b = placePlayer(world, 'B', 330, 300);
    const pirate = placePirate(world, 300, 340);
    pirate.ai = null;
    seedDamage(pirate, [[a, 225, 0.1], [b, 195, 0.2]]);
    pirate.hp = 30;
    scriptedRng(world, [0, 0.999, 0.999, 0.999]); // B acierta 1 bala de 30 → 225 / 225
    attack(world, 'B', pirate.id);
    const events = run(world, 3);
    expect(lootOf(events, 'A', 'kill')).toEqual([53]);
    expect(lootOf(events, 'B', 'kill')).toEqual([52]);
  });

  test.each([['pirate', 25], ['merchant', 15]])('AC-59: un %s hundido deja una caja de %d; la recoge el más cercano a ≤ 8 m y caduca a los 30 s', (kind, gold) => {
    const world = emptyWorld();
    const victim = kind === 'pirate' ? placePirate(world, 300, 300) : placeMerchant(world, 300, 300);
    victim.ai = null;
    const killer = placePlayer(world, 'K', 300, 250);
    victim.hp = 1;
    scriptedRng(world, [0]);
    attack(world, 'K', victim.id);
    const events = run(world, 1);
    const wreckEvent = events.find((e) => e.type === 'wreck');
    expect(wreckEvent).toMatchObject({ gold, pos: { x: 300, z: 300 } });
    // Dos jugadores entran en radio en el mismo tick: gana el más cercano
    const near = placePlayer(world, 'near', 303, 300);
    placePlayer(world, 'far', 293, 300);
    const goldBefore = world.players.get('near')!.gold;
    const pick = run(world, DT);
    expect(lootOf(pick, 'near', 'wreck')).toEqual([gold]);
    expect(lootOf(pick, 'far', 'wreck')).toEqual([]);
    expect(world.players.get('near')!.gold - goldBefore).toBe(gold);
    expect(world.wrecks).toHaveLength(0);
    void near;
    void killer;

    // Caducidad
    const w2 = emptyWorld();
    const v2 = placePirate(w2, 300, 300);
    v2.ai = null;
    v2.hp = 1;
    const k2 = placePlayer(w2, 'K', 300, 250);
    scriptedRng(w2, [0]);
    attack(w2, 'K', v2.id);
    run(w2, 1);
    k2.pos = { x: 300, z: 200 };
    expect(w2.wrecks).toHaveLength(1);
    const gone = run(w2, WRECK_LIFETIME);
    expect(gone.some((e) => e.type === 'wreckGone')).toBe(true);
    expect(w2.wrecks).toHaveLength(0);
  });
});

describe('E4 — Muerte y reaparición (§10, §12)', () => {
  function pvpKill(victimGold: number) {
    const world = emptyWorld();
    world.rng = () => 0;
    const killer = placePlayer(world, 'K', 300, 300);
    const victim = placePlayer(world, 'V', 300, 340);
    world.players.get('V')!.gold = victimGold;
    world.players.get('K')!.gold = 0;
    victim.hp = 1;
    attack(world, 'K', victim.id);
    const events = run(world, 1);
    return { world, killer, victim, events, k: world.players.get('K')!, v: world.players.get('V')! };
  }

  test('AC-61: con vida ≤ 0 pasa 3 s hundiéndose, no se puede seleccionar y los ataques contra él terminan', () => {
    const world = emptyWorld();
    world.rng = () => 0;
    placePlayer(world, 'a', 300, 300);
    placePlayer(world, 'b', 330, 300);
    const target = dummy(world, 300, 340, 1);
    attack(world, 'a', target.id);
    attack(world, 'b', target.id);
    let sunkTick = -1;
    let deadTick = -1;
    for (let i = 1; i <= 6 * TICK_RATE; i++) {
      for (const e of run(world, DT)) if (e.type === 'sunk') sunkTick = i;
      if (sunkTick > 0 && i === sunkTick) {
        expect(target.state).toBe('sinking');
        expect(shipOfPlayer(world, 'a')!.attackTargetId).toBeNull();
        expect(shipOfPlayer(world, 'b')!.attackTargetId).toBeNull();
        expect(attack(world, 'a', target.id).ok).toBe(false);
      }
      if (deadTick < 0 && target.state === 'dead') deadTick = i;
    }
    expect(Math.abs((deadTick - sunkTick) * DT - SINKING_TIME)).toBeLessThanOrEqual(DT + 1e-9);
  });

  test('AC-62: con 455 de oro, la muerte registra quién lo hundió, −45 y la cuenta atrás de 8 s', () => {
    const { world, v } = pvpKill(455);
    expect(v.death).toMatchObject({ by: 'K', goldLost: 45 });
    expect(v.gold).toBe(410);
    expect(respawn(world, 'V').ok).toBe(false);
    run(world, DEATH_COUNTDOWN - 1 - 2 * DT);
    expect(respawn(world, 'V').ok).toBe(false);
  });

  test('H-10: acepta "Zarpar" enviado al terminar la cuenta atrás en el reloj del cliente aunque world.time vaya hasta 2 ticks por detrás', () => {
    const sink = () => {
      const world = emptyWorld();
      world.rng = () => 0;
      placePlayer(world, 'K', 300, 300);
      const victim = placePlayer(world, 'V', 300, 340);
      victim.hp = 1;
      attack(world, 'K', victim.id);
      runUntil(world, 5, () => !!world.players.get('V')!.death);
      return { world, at: world.players.get('V')!.death!.at };
    };
    // 2 ticks antes de los 8 s (el botón del cliente ya está activo): se acepta
    const early = sink();
    runUntil(early.world, DEATH_COUNTDOWN + 1, (w) => w.time - early.at >= DEATH_COUNTDOWN - RESPAWN_CLOCK_TOLERANCE - 1e-9);
    expect(early.world.time - early.at).toBeLessThan(DEATH_COUNTDOWN);
    expect(respawn(early.world, 'V').ok).toBe(true);
    // 3 ticks antes: todavía no
    const tooEarly = sink();
    runUntil(tooEarly.world, DEATH_COUNTDOWN + 1, (w) => w.time - tooEarly.at >= DEATH_COUNTDOWN - RESPAWN_CLOCK_TOLERANCE - DT - 1e-9);
    expect(respawn(tooEarly.world, 'V')).toEqual({ ok: false, reason: 'Aún no puedes zarpar' });
  });

  test('AC-63: tras la cuenta atrás reaparece a 60–90 m del puerto, con vida llena y la misma clase y mejoras', () => {
    const world = emptyWorld();
    world.rng = () => 0;
    placePlayer(world, 'K', 300, 300);
    const victim = placePlayer(world, 'V', 300, 340);
    const v = world.players.get('V')!;
    v.upgrades = { cannons: 2, hull: 3, sails: 2 };
    v.ownedShips = ['sloop', 'brig'];
    v.activeShip = 'brig';
    victim.classId = 'brig';
    victim.hp = 1;
    attack(world, 'K', victim.id);
    run(world, DEATH_COUNTDOWN + 1);
    expect(respawn(world, 'V').ok).toBe(true);
    const r = distance(victim.pos, { x: 0, z: 0 });
    expect(r).toBeGreaterThanOrEqual(RESPAWN_RING.min);
    expect(r).toBeLessThanOrEqual(RESPAWN_RING.max);
    expect(victim.state).toBe('alive');
    expect(victim.classId).toBe('brig');
    expect(victim.maxHp).toBe(Math.round(SHIP_CLASSES.brig.maxHp * 1.4));
    expect(victim.hp).toBe(victim.maxHp);
    expect(v.upgrades).toEqual({ cannons: 2, hull: 3, sails: 2 });
  });

  test('AC-64: la protección dura 15 s o hasta que ataca; mientras dura, nadie puede atacarlo', () => {
    const world = emptyWorld();
    addPlayer(world, 'P', 'P');
    const fresh = shipOfPlayer(world, 'P')!;
    fresh.pos = { x: 300, z: 300 }; // fuera de la zona, recién aparecido
    const enemy = placePlayer(world, 'E', 300, 330);
    expect(canAttack(world, enemy, fresh)).toBe(false);
    expect(attack(world, 'E', fresh.id).ok).toBe(false);
    run(world, SPAWN_PROTECTION - 1);
    expect(attack(world, 'E', fresh.id).ok).toBe(false);
    run(world, 1 + DT);
    expect(attack(world, 'E', fresh.id).ok).toBe(true);

    // Atacar termina la protección antes de los 15 s
    const w2 = emptyWorld();
    addPlayer(w2, 'P', 'P');
    const s2 = shipOfPlayer(w2, 'P')!;
    s2.pos = { x: 300, z: 300 };
    const target = dummy(w2, 300, 330);
    const e2 = placePlayer(w2, 'E', 330, 300);
    expect(attack(w2, 'P', target.id).ok).toBe(true);
    expect(attack(w2, 'E', s2.id).ok).toBe(true);
  });

  test('AC-94: hundido por otro jugador con 500 de oro → el atacante recibe 50 y la víctima queda con 450', () => {
    const { k, v, events } = pvpKill(500);
    expect(v.gold).toBe(450);
    expect(k.gold).toBe(50);
    expect(lootOf(events, 'K', 'pvp')).toEqual([50]);
  });
});

describe('E4 — Puerto y tienda (§11)', () => {
  function inPort(gold: number): { world: World; ship: Ship; player: Player } {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 0, 70);
    const player = world.players.get('a')!;
    player.gold = gold;
    return { world, ship, player };
  }
  const cannons2: ShopItem = { kind: 'upgrade', upgrade: 'cannons', level: 2 };

  test('AC-67: con 600 de oro compra Cañones N2 → 100 de oro, daño 38, alcance 70, recarga 3,5; con 400 se rechaza', () => {
    const { world, ship, player } = inPort(600);
    expect(buy(world, 'a', cannons2).ok).toBe(true);
    expect(player.gold).toBe(100);
    expect(cannonOf(world, ship)).toMatchObject({ damage: 38, range: 70, reload: 3.5 });

    const poor = inPort(400);
    expect(buy(poor.world, 'a', cannons2).ok).toBe(false);
    expect(poor.player.gold).toBe(400);
    expect(poor.player.upgrades.cannons).toBe(1);
  });

  test('AC-68: compra fuera de la zona, N3 sin N2 o barco ya poseído → rechazo sin cambios', () => {
    const { world, ship, player } = inPort(99_999);
    const snapshot = () => JSON.stringify({ gold: player.gold, upgrades: player.upgrades, owned: player.ownedShips, active: player.activeShip });
    const before = snapshot();
    expect(buy(world, 'a', { kind: 'upgrade', upgrade: 'cannons', level: 3 }).ok).toBe(false);
    expect(buy(world, 'a', { kind: 'ship', classId: 'sloop' }).ok).toBe(false);
    ship.pos = { x: 300, z: 300 };
    expect(isInSafeZone(ship.pos)).toBe(false);
    expect(buy(world, 'a', cannons2).ok).toBe(false);
    expect(buy(world, 'a', { kind: 'ship', classId: 'brig' }).ok).toBe(false);
    expect(snapshot()).toBe(before);
  });

  test('AC-69: Balandra con 400/800 compra Casco N2 → 480/960', () => {
    const { world, ship } = inPort(1000);
    ship.hp = 400;
    expect(buy(world, 'a', { kind: 'upgrade', upgrade: 'hull', level: 2 }).ok).toBe(true);
    expect(ship.maxHp).toBe(960);
    expect(ship.hp).toBe(480);
  });

  test('AC-70: con 2 000 compra el Bergantín con vida llena; conserva la Balandra; cambiar es gratis en el puerto y se rechaza fuera', () => {
    const { world, ship, player } = inPort(2000);
    player.upgrades.hull = 2;
    expect(buy(world, 'a', { kind: 'ship', classId: 'brig' }).ok).toBe(true);
    expect(player.gold).toBe(0);
    expect(ship.classId).toBe('brig');
    expect(ship.maxHp).toBe(Math.round(1400 * 1.2));
    expect(ship.hp).toBe(ship.maxHp);
    expect(player.ownedShips).toEqual(['sloop', 'brig']);
    expect(selectShip(world, 'a', 'sloop').ok).toBe(true);
    expect(ship.classId).toBe('sloop');
    expect(selectShip(world, 'a', 'brig').ok).toBe(true);
    expect(player.gold).toBe(0);
    ship.pos = { x: 300, z: 300 };
    expect(selectShip(world, 'a', 'sloop').ok).toBe(false);
    expect(ship.classId).toBe('brig');
  });
});

describe('E5 — PvP y conexión (§12, §13)', () => {
  test('AC-93: PvP se acepta fuera de la zona y sin protección; se rechaza si alguno está en la zona; se cancela si el objetivo entra', () => {
    const world = emptyWorld();
    const a = placePlayer(world, 'a', 0, 200);
    const b = placePlayer(world, 'b', 0, 230);
    expect(attack(world, 'a', b.id).ok).toBe(true);
    // El objetivo entra en la zona segura → el ataque se cancela en el siguiente tick
    b.pos = { x: 0, z: 100 };
    run(world, DT);
    expect(a.attackTargetId).toBeNull();
    expect(attack(world, 'a', b.id).ok).toBe(false);
    // Atacante dentro de la zona
    b.pos = { x: 0, z: 150 };
    a.pos = { x: 0, z: 105 };
    expect(attack(world, 'a', b.id).ok).toBe(false);
  });

  test('AC-96 / AC-13: desconectado sigue atacable ≤ 10 s; si reconecta recupera el mismo barco y vida; si no, desaparece', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'a', 300, 300);
    ship.hp = 555;
    const enemy = placePlayer(world, 'e', 300, 330);
    disconnectPlayer(world, 'a');
    run(world, DISCONNECT_GRACE - 1);
    expect(world.ships.has(ship.id)).toBe(true);
    expect(attack(world, 'e', ship.id).ok).toBe(true);
    enemy.attackTargetId = null;
    ship.hp = 555;
    addPlayer(world, 'a', 'a');
    expect(shipOfPlayer(world, 'a')).toBe(ship);
    expect(ship.hp).toBe(555);

    disconnectPlayer(world, 'a');
    run(world, DISCONNECT_GRACE + DT);
    expect(world.ships.has(ship.id)).toBe(false);
  });
});

describe('E4 — Curva económica (§10)', () => {
  // Bot "barco primero" (AC-60): ataca al NPC más cercano, repara bajo el 40 %, no compra nada hasta poder
  // pagar el Bergantín y, desde ahí, compra siempre lo más barato disponible (Fragata incluida). Con el Capitán pirata
  // (H-305): no lo ataca, no entra a menos de 200 m de su guarida y, si el capitán lo elige, navega al puerto. Con la
  // Cañonera (H-306): no la ataca mientras su cañón tenga menos alcance que ella (65 m), es decir, hasta Cañones N2
  const LAIR_AVOID = 200;
  const DUEL_DISTANCE = 40; // el bot se mantiene a ≤ 40 m de su objetivo
  const CATALOG: ShopItem[] = [
    ...(['cannons', 'hull', 'sails'] as const).flatMap((upgrade) => [2, 3].map((level) => ({ kind: 'upgrade' as const, upgrade, level }))),
    { kind: 'ship', classId: 'brig' },
    { kind: 'ship', classId: 'frigate' }
  ];
  function nextItem(p: Player): ShopItem | null {
    if (!p.ownedShips.includes('brig')) return { kind: 'ship', classId: 'brig' };
    const available = CATALOG.filter((i) =>
      i.kind === 'upgrade' ? i.level === p.upgrades[i.upgrade] + 1 : !p.ownedShips.includes(i.classId)
    );
    return available.sort((x, y) => itemPrice(x) - itemPrice(y))[0] ?? null;
  }

  function simulate(seed: number, i2: boolean) {
    const world = createWorld({ seed, i2 });
    addPlayer(world, 'g', 'Bot');
    const p = world.players.get('g')!;
    let earned = 0;
    let t500 = Infinity;
    let tBrig = Infinity;
    let tAll = Infinity;
    let earnedAtBrig = 0;
    let captains = 0;
    let fled = 0;
    let minLair = Infinity;
    const seen = new Set<string>();
    for (let tick = 1; tick <= 90 * 60 * TICK_RATE && tAll === Infinity; tick++) {
      const t = tick * DT;
      const cap = [...world.ships.values()].find((o) => o.classId === CAPTAIN_CLASS && o.state === 'alive');
      const lair = cap?.ai?.origin ?? null;
      if (cap && !seen.has(cap.id)) {
        seen.add(cap.id);
        captains++;
      }
      const own = shipOfPlayer(world, 'g')!;
      if (lair && own.state === 'alive') minLair = Math.min(minLair, distance(own.pos, lair));
      if (tick % 10 === 0) {
        const s = shipOfPlayer(world, 'g')!;
        if (s.state === 'dead') respawn(world, 'g');
        else if (s.state === 'alive' && cap && (cap.attackTargetId === s.id || distance(s.pos, lair!) < LAIR_AVOID) && !isInSafeZone(s.pos)) {
          // El capitán lo eligió o está cerca de su guarida: al puerto
          if (s.attackTargetId) fled++;
          s.attackTargetId = null;
          if (s.repairing) setRepair(world, 'g', false);
          if (!s.destination || distance(s.destination, PORT_POSITION) > 5) moveTo(world, 'g', PORT_POSITION);
        } else if (s.state === 'alive' && !s.repairing) {
          const item = nextItem(p);
          if (s.hp / s.maxHp < 0.4) setRepair(world, 'g', true);
          else if (item && p.gold >= itemPrice(item)) {
            if (isInSafeZone(s.pos)) {
              buy(world, 'g', item);
              if (item.kind === 'ship' && item.classId === 'brig') {
                tBrig = t;
                earnedAtBrig = earned;
              }
              if (!nextItem(p)) tAll = t;
            } else {
              s.attackTargetId = null;
              if (!s.destination) moveTo(world, 'g', { x: 0, z: 0 });
            }
          } else {
            let best: Ship | null = null;
            for (const o of world.ships.values()) {
              if (o.kind === 'player' || o.state !== 'alive' || o.classId === CAPTAIN_CLASS) continue;
              if (o.classId === GUNBOAT_CLASS && cannonOf(world, s)!.range < cannonOf(world, o)!.range) continue;
              // Para dispararle tendría que acercarse a ≤ 40 m: nada a menos de 240 m de la guarida
              if (lair && distance(o.pos, lair) < LAIR_AVOID + DUEL_DISTANCE) continue;
              if (!best || distance(o.pos, s.pos) < distance(best.pos, s.pos)) best = o;
            }
            if (best) {
              if (s.attackTargetId !== best.id) attack(world, 'g', best.id);
              if (distance(s.pos, best.pos) > DUEL_DISTANCE) moveTo(world, 'g', best.pos);
            }
          }
        }
      }
      for (const e of run(world, DT)) {
        if (e.type === 'loot' && e.playerId === 'g') earned += e.gold;
      }
      if (t500 === Infinity && earned >= 500) t500 = t;
    }
    return { t500, tBrig, tAll, deaths: p.deaths, n1PerMin: earnedAtBrig / (tBrig / 60), captains, fled, minLair };
  }

  // Los dos modos del servidor (AC-187): con el I2 apagado, la curva de la 1.0.3; encendido, la medida con el Capitán (H-305)
  test.each([
    ['apagado', false],
    ['encendido', true]
  ] as const)('AC-60 (I2 %s): con el bot "barco primero", la mediana de las semillas 1–5 cumple 500 de oro ≤ 4 min, Bergantín ≤ 20 min y todo en 45–70 min', (mode, i2) => {
    const runs = [1, 2, 3, 4, 5].map((seed) => simulate(seed, i2));
    const min = (v: number) => +(v / 60).toFixed(1);
    const t500 = median(runs.map((r) => r.t500));
    const tBrig = median(runs.map((r) => r.tBrig));
    const tAll = median(runs.map((r) => r.tAll));
    console.log(`AC-60 (I2 ${mode}) por semilla (min): ${runs.map((r, i) => `s${i + 1} ${min(r.t500)}/${min(r.tBrig)}/${min(r.tAll)} (${r.deaths} muertes, N1 ${r.n1PerMin.toFixed(0)} oro/min)`).join(' · ')} → mediana ${min(t500)}/${min(tBrig)}/${min(tAll)}; N1 mediana ${median(runs.map((r) => r.n1PerMin)).toFixed(0)} oro/min`);
    console.log(`AC-60 (I2 ${mode}) capitán por semilla: ${runs.map((r, i) => `s${i + 1} ${r.captains} capitán(es), ${r.fled} huidas, mínimo a la guarida ${r.minLair === Infinity ? '—' : r.minLair.toFixed(0) + ' m'}`).join(' · ')}`);
    if (!i2) expect(runs.map((r) => r.captains)).toEqual([0, 0, 0, 0, 0]);
    expect(t500).toBeLessThanOrEqual(4 * 60);
    expect(tBrig).toBeLessThanOrEqual(20 * 60);
    expect(tAll).toBeGreaterThanOrEqual(45 * 60);
    expect(tAll).toBeLessThanOrEqual(70 * 60);
  });
});

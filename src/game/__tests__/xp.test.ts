// E14 — Experiencia, niveles e insignias (GDD §10b): AC-144 a AC-150 y las constantes de §10b (AC-04)
import * as C from '../constants';
import { CAPTAIN_CLASS, LEVEL_XP, SHIP_CLASSES, TICK_RATE } from '../constants';
import { GameEvent, Ship, World } from '../types';
import { createRng } from '../vec';
import { addPlayer, attack, buy, canAttack, cancelAttack, drainEvents, moveTo, playerView, removePlayer, respawn, setRepair, shipOfPlayer, shipSnapshot, spawnCaptain, splitReward, step } from '../world';
import { drainPvpLog, levelFactorPercent, levelOf, openPairs, pairKills, pvpXp, rankLabel, rankOf } from '../xp';
import { DT, emptyWorld, i2World, placeMerchant, placePlayer, run } from './helpers';

// Tabla «XP por NPC» de GDD §10b, por id de clase (la Cañonera es `gunboat`, el Capitán `captain`, el Galeón `galleon`)
const GDD_NPC_XP: Record<string, number> = { merchant: 10, pirate: 30, gunboat: 60, captain: 240, galleon: 160 };
const EVENT_NPCS = ['captain', 'galleon']; // ×2 por ser de evento (§10b, «Reglas»)
const NPC_CLASSES = Object.values(SHIP_CLASSES).filter((s) => s.kind !== 'player').map((s) => s.id);

// Cola de tiradas (una copia): cada valor < precisión es un impacto; al vaciarse, todo falla
function scriptedRng(world: World, rolls: readonly number[]): void {
  const queue = [...rolls];
  world.rng = () => (queue.length ? queue.shift()! : 0.999);
}
const ONE_HIT = [0, 0.999, 0.999, 0.999]; // una Balandra N1 acierta 1 bala de 30

// Daño previo: [barco, cantidad, primer impacto, último impacto]
function seedDamage(target: Ship, entries: [Ship, number, number, number?][]): void {
  target.damage = entries.map(([ship, amount, firstAt, at]) => ({ playerId: ship.ownerId!, shipId: ship.id, amount, at: at ?? firstAt, firstAt }));
}

function xpOf(events: GameEvent[], playerId: string, source?: 'kill' | 'pvp'): number[] {
  return events.flatMap((e) => (e.type === 'xp' && e.playerId === playerId && (!source || e.source === source) ? [e.xp] : []));
}

const lootOf = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'loot' ? [[e.playerId, e.gold, e.source]] : []));

// NPC de la clase pedida, quieto, sin IA y con la vida de su clase. El Capitán sale por su vía real, que solo actúa con
// el I2 encendido (AC-187)
function npcOf(world: World, classId: string, x: number, z: number): Ship {
  const ship = classId === CAPTAIN_CLASS ? spawnCaptain(world, { x, z })! : placeMerchant(world, x, z);
  const stats = SHIP_CLASSES[classId];
  ship.classId = classId;
  ship.kind = stats.kind;
  ship.hp = ship.maxHp = stats.maxHp;
  ship.ai = null;
  return ship;
}

const GDD_REPEAT_WINDOW = 30 * 60; // s (§10b): el test de AC-147 no depende de la constante que comprueba
const xpOfPlayer = (world: World, id: string) => world.players.get(id)!.xp;
const setLevel = (world: World, id: string, level: number) => (world.players.get(id)!.xp = LEVEL_XP[level - 1]);

describe('E14 — Constantes de la experiencia (§10b)', () => {
  test('AC-04 (§10b): la XP de los NPC, la de un jugador, los factores, la ventana, el tope, los niveles y las insignias coinciden con el GDD', () => {
    expect(C.NPC_XP).toEqual(GDD_NPC_XP);
    expect(C.PVP_XP).toBe(100);
    expect([-6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 7].map((d) => levelFactorPercent(10, 10 + d))).toEqual([0, 0, 25, 50, 75, 100, 110, 120, 130, 140, 150, 150]);
    expect([C.XP_REPEAT_WINDOW, C.XP_REPEAT_PERCENT]).toEqual([30 * 60, [100, 50]]);
    expect(C.XP_CAP).toBe(9_999_999);
    expect(C.LEVEL_XP).toEqual([0, 60, 150, 300, 500, 800, 1200, 1700, 2400, 3300, 4500, 6000, 8000, 10500, 13500, 17000, 21000, 25500, 30500, 36000]);
    expect(C.MAX_LEVEL).toBe(20);
    expect(C.RANKS.map((r) => [r.label, r.fromLevel])).toEqual([['Grumete', 1], ['Marinero', 5], ['Contramaestre', 9], ['Teniente', 13], ['Almirante', 17]]);
  });

  test('§10b: la XP de cada NPC del juego sigue la regla por vida (vida / 15 si es hostil, / 30 si es pasivo, ×2 si es de evento)', () => {
    expect(NPC_CLASSES.length).toBeGreaterThanOrEqual(2);
    for (const id of NPC_CLASSES) {
      const s = SHIP_CLASSES[id];
      const rule = (s.maxHp / (s.kind === 'pirate' ? 15 : 30)) * (EVENT_NPCS.includes(id) ? 2 : 1);
      expect({ id, xp: C.NPC_XP[id] }).toEqual({ id, xp: rule });
    }
  });
});

describe('E14 — H-1401 XP por hundir NPC (§10b)', () => {
  test('AC-144: cada clase NPC del juego tiene su XP en la tabla de GDD §10b, también el Capitán con el I2 apagado', () => {
    for (const id of NPC_CLASSES) expect({ id, inGdd: id in GDD_NPC_XP }).toEqual({ id, inGdd: true });
    expect(NPC_CLASSES).toContain(CAPTAIN_CLASS);
    expect(spawnCaptain(emptyWorld(), { x: 300, z: 340 })).toBeNull(); // apagado no aparece…
    expect(C.NPC_XP[CAPTAIN_CLASS]).toBe(240); // …pero su XP está en la tabla
  });

  test.each(NPC_CLASSES)('AC-144: un %s dañado solo por A da a A su XP exacta, una sola vez y en el tick del oro; nadie más recibe XP', (classId) => {
    const world = classId === CAPTAIN_CLASS ? i2World() : emptyWorld();
    const a = placePlayer(world, 'A', 300, 300);
    placePlayer(world, 'C', 320, 300); // cerca, sin dañar
    const npc = npcOf(world, classId, 300, 340);
    expect([npc.classId, npc.kind]).toEqual([classId, SHIP_CLASSES[classId].kind]);
    seedDamage(npc, [[a, npc.maxHp - 30, 0.1]]);
    npc.hp = 30;
    scriptedRng(world, ONE_HIT);
    attack(world, 'A', npc.id);
    const ticks: GameEvent[][] = [];
    for (let i = 0; i < 40 * TICK_RATE; i++) {
      step(world, DT);
      ticks.push(drainEvents(world));
    }
    const xpTicks = ticks.flatMap((events, i) => xpOf(events, 'A').map(() => i));
    const lootTicks = ticks.flatMap((events, i) => (events.some((e) => e.type === 'loot' && e.playerId === 'A' && e.source === 'kill') ? [i] : []));
    const all = ticks.flat();
    expect(xpOf(all, 'A', 'kill')).toEqual([GDD_NPC_XP[classId]]);
    expect(xpTicks).toEqual(lootTicks);
    expect(xpOfPlayer(world, 'A')).toBe(GDD_NPC_XP[classId]);
    expect(xpOf(all, 'C')).toEqual([]);
    expect(xpOfPlayer(world, 'C')).toBe(0);
    const sunk = all.find((e) => e.type === 'sunk' && e.shipId === npc.id)!;
    expect(all.find((e) => e.type === 'xp')).toMatchObject({ pos: (sunk as { pos: unknown }).pos });
  });

  test('§10b: solo hundir da XP; recoger restos, reparar, comprar y navegar no', () => {
    const world = emptyWorld();
    const ship = placePlayer(world, 'A', 0, 70);
    const player = world.players.get('A')!;
    player.gold = 5000;
    ship.hp = 400;
    world.wrecks.push({ id: 'wreck-x', pos: { ...ship.pos }, gold: 25, expiresAt: 999 });
    const events = run(world, 1);
    expect(lootOf(events)).toEqual([['A', 25, 'wreck']]);
    expect(setRepair(world, 'A', true).ok).toBe(true);
    events.push(...run(world, 5));
    expect(buy(world, 'A', { kind: 'upgrade', upgrade: 'hull', level: 2 }).ok).toBe(true);
    expect(moveTo(world, 'A', { x: 0, z: 200 }).ok).toBe(true);
    events.push(...run(world, 10));
    expect(ship.pos.z).toBeGreaterThan(150);
    expect(xpOf(events, 'A')).toEqual([]);
    expect(player.xp).toBe(0);
  });
});

describe('E14 — Reparto de la XP de un NPC (AC-145)', () => {
  test('AC-145: pirata (30) con 2/3 del daño de A y 1/3 de B en los últimos 60 s → 20 y 10', () => {
    const world = emptyWorld();
    const a = placePlayer(world, 'A', 300, 300);
    const b = placePlayer(world, 'B', 330, 300);
    const pirate = npcOf(world, 'pirate', 300, 340);
    seedDamage(pirate, [[a, 300, 0.1], [b, 120, 0.2]]);
    pirate.hp = 30;
    scriptedRng(world, ONE_HIT); // B: 300 / 150
    attack(world, 'B', pirate.id);
    const events = run(world, 2);
    expect([xpOf(events, 'A'), xpOf(events, 'B')]).toEqual([[20], [10]]);
  });

  test('AC-145: mercante (10) dañado a partes iguales por A, B y C, con A primero → 4, 3 y 3 (el resto, a quien dañó primero)', () => {
    expect([...splitReward([
      { playerId: 'A', amount: 100, firstAt: 1 },
      { playerId: 'B', amount: 100, firstAt: 2 },
      { playerId: 'C', amount: 100, firstAt: 3 }
    ], C.NPC_XP.merchant)]).toEqual([['A', 4], ['B', 3], ['C', 3]]);

    const world = emptyWorld();
    const a = placePlayer(world, 'A', 300, 300);
    const b = placePlayer(world, 'B', 330, 300);
    const c = placePlayer(world, 'C', 270, 300);
    const merchant = npcOf(world, 'merchant', 300, 340);
    seedDamage(merchant, [[a, 100, 0.1], [b, 100, 0.2], [c, 70, 0.3]]);
    merchant.hp = 30;
    scriptedRng(world, ONE_HIT); // C: 100 / 100 / 100
    attack(world, 'C', merchant.id);
    const events = run(world, 2);
    expect([xpOf(events, 'A'), xpOf(events, 'B'), xpOf(events, 'C')]).toEqual([[4], [3], [3]]);
  });

  // La ventana del oro tal como está hecha: cuenta todo el daño de quien impactó en los últimos 60 s
  function windowCase(aHitsAgainAt85: boolean): number[][] {
    const world = emptyWorld();
    const a = placePlayer(world, 'A', 300, 300);
    const b = placePlayer(world, 'B', 330, 300);
    const pirate = npcOf(world, 'pirate', 300, 340);
    world.time = 85;
    seedDamage(pirate, [[a, aHitsAgainAt85 ? 270 : 300, 0, 0], [b, 120, 80, 84]]);
    pirate.hp = 60;
    const events: GameEvent[] = [];
    if (aHitsAgainAt85) {
      scriptedRng(world, ONE_HIT); // A vuelve a impactar a los 85 s: 300 / 120
      attack(world, 'A', pirate.id);
      events.push(...run(world, 1));
      cancelAttack(world, 'A');
    } else {
      pirate.hp = 30;
    }
    while (world.time < 89.6) events.push(...run(world, DT));
    scriptedRng(world, ONE_HIT); // B lo hunde a los ~90 s: 300 / 150
    attack(world, 'B', pirate.id);
    events.push(...run(world, 2));
    expect(pirate.state).not.toBe('alive');
    return [xpOf(events, 'A'), xpOf(events, 'B')];
  }

  test('AC-145: A hizo 2/3 hace 90 s sin volver a impactar y B 1/3 en los últimos 10 s → B recibe los 30', () => {
    expect(windowCase(false)).toEqual([[], [30]]);
  });

  test('AC-145: si A vuelve a impactar a los 85 s cuenta todo su daño → 20 y 10', () => {
    expect(windowCase(true)).toEqual([[20], [10]]);
  });

  // BACKLOG AC-145 (r11, e797ace): «Oro sin XP en el mercante, esperado […] B con 1 bala de 30 y A que lo hunde con 300
  // dan oro B 5 / A 55 y XP B 0 / A 10. B ve «Botín +5 oro» y nada de XP»
  test('AC-145: oro sin XP en el mercante, esperado: B con 1 bala de 30 y A que lo hunde con 300 → oro B 5 / A 55 y XP B 0 / A 10, sin evento xp para B', () => {
    const world = emptyWorld();
    const a = placePlayer(world, 'A', 300, 300);
    const b = placePlayer(world, 'B', 330, 300);
    const merchant = npcOf(world, 'merchant', 300, 340);
    seedDamage(merchant, [[b, 30, 0.1], [a, 270, 0.2]]);
    merchant.hp = 30;
    scriptedRng(world, ONE_HIT); // A lo hunde: 300 / 30
    attack(world, 'A', merchant.id);
    const events = run(world, 2);
    expect(merchant.state).not.toBe('alive');
    expect(lootOf(events)).toEqual([['B', 5, 'kill'], ['A', 55, 'kill']]);
    expect([xpOf(events, 'A'), xpOf(events, 'B')]).toEqual([[10], []]);
    expect([xpOfPlayer(world, 'A'), xpOfPlayer(world, 'B')]).toEqual([10, 0]);
  });

  // BACKLOG AC-145 (r11): «XP sin oro, nunca: en todas las clases el oro es mayor o igual que la XP, y el resto va al mismo
  // jugador en los dos repartos. En las demás clases, con daños reales (≥ 1 bala de 30 y un daño total ≤ vida + 384),
  // todo el que cobra oro cobra ≥ 1 XP»
  test('AC-145: XP sin oro, nunca; y fuera del mercante, con daños reales, todo el que cobra oro cobra ≥ 1 XP', () => {
    const rng = createRng(1450);
    for (const id of NPC_CLASSES) {
      const gold = SHIP_CLASSES[id].reward;
      const xp = C.NPC_XP[id];
      expect({ id, goldAtLeastXp: gold >= xp }).toEqual({ id, goldAtLeastXp: true });
      let xpWithoutGold = 0;
      for (let k = 0; k < 20_000; k++) {
        const n = 2 + Math.floor(rng() * 4);
        const entries = Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, amount: 1 + Math.floor(rng() * 3 * SHIP_CLASSES[id].maxHp), firstAt: rng() }));
        const g = splitReward(entries, gold);
        for (const [pid, share] of splitReward(entries, xp)) if (share > 0 && !((g.get(pid) ?? 0) > 0)) xpWithoutGold++;
      }
      expect({ id, xpWithoutGold }).toEqual({ id, xpWithoutGold: 0 });
      if (id === 'merchant') continue;
      // Dos jugadores: B con 1 a 20 balas de 30, 38 o 48; el total, entre la vida y la vida + 384 (andanada final de una Fragata N3)
      let goldWithoutXp = 0;
      let cases = 0;
      const hp = SHIP_CLASSES[id].maxHp;
      for (const ball of [30, 38, 48]) for (let balls = 1; balls <= 20; balls++) for (let total = hp; total <= hp + 384; total++) {
        const bDamage = balls * ball;
        if (total - bDamage <= 0) continue;
        cases++;
        const entries = [{ playerId: 'A', amount: total - bDamage, firstAt: 1 }, { playerId: 'B', amount: bDamage, firstAt: 2 }];
        if ((splitReward(entries, gold).get('B') ?? 0) > 0 && (splitReward(entries, xp).get('B') ?? 0) === 0) goldWithoutXp++;
      }
      expect({ id, goldWithoutXp, enough: cases > 10_000 }).toEqual({ id, goldWithoutXp: 0, enough: true });
    }
  });

  test('AC-145: la suma de lo repartido es siempre la XP del NPC (500 repartos al azar por clase)', () => {
    const rng = createRng(145);
    for (const id of NPC_CLASSES) {
      for (let k = 0; k < 500; k++) {
        const n = 1 + Math.floor(rng() * 5);
        const entries = Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, amount: 1 + Math.floor(rng() * 900), firstAt: rng() * 60 }));
        const total = [...splitReward(entries, C.NPC_XP[id]).values()].reduce((s, v) => s + v, 0);
        expect({ id, total }).toEqual({ id, total: C.NPC_XP[id] });
      }
    }
  });
});

// Si el barco del jugador está hundido, espera a que acabe la cuenta atrás y lo hace zarpar
function revive(world: World, id: string): void {
  if (shipOfPlayer(world, id)!.state === 'alive') return;
  while (!respawn(world, id).ok) run(world, DT);
}

// Hunde a `victimId` con un solo impacto de `killerId` (el resto del daño, sembrado): los dos a flote, fuera de la zona
// segura y sin protección. Devuelve la XP ganada por cada jugador y el tiempo del hundimiento
function pvpSink(world: World, killerId: string, victimId: string, seeded: [string, number, number][] = []): { gained: Record<string, number>; events: GameEvent[]; sunkAt: number } {
  revive(world, killerId);
  revive(world, victimId);
  const victim = shipOfPlayer(world, victimId)!;
  const killer = shipOfPlayer(world, killerId)!;
  victim.pos = { x: 0, z: 300 };
  killer.pos = { x: 0, z: 340 };
  victim.protectedUntil = 0;
  killer.protectedUntil = 0;
  victim.damage = seeded.map(([id, amount, firstAt]) => ({ playerId: id, shipId: shipOfPlayer(world, id)!.id, amount, at: world.time, firstAt }));
  victim.hp = 30;
  const before = Object.fromEntries([...world.players.values()].map((p) => [p.id, p.xp]));
  scriptedRng(world, ONE_HIT);
  expect(attack(world, killerId, victim.id).ok).toBe(true);
  const events: GameEvent[] = [];
  for (let i = 0; i < TICK_RATE && victim.state === 'alive'; i++) events.push(...run(world, DT));
  expect(victim.state).toBe('sinking');
  const sunkAt = world.time; // sinkShip corre con el reloj de ese tick
  const gained = Object.fromEntries([...world.players.values()].map((p) => [p.id, p.xp - (before[p.id] ?? 0)]));
  return { gained, events, sunkAt };
}

function pvpWorld(levels: Record<string, number>): World {
  const world = emptyWorld();
  Object.keys(levels).forEach((id, i) => {
    placePlayer(world, id, 100 * i, 300);
    setLevel(world, id, levels[id]);
  });
  return world;
}

describe('E14 — H-1402 XP por hundir jugadores (§10b)', () => {
  test.each([
    [0, 100], [1, 110], [2, 120], [3, 130], [4, 140], [5, 150], [7, 150],
    [-1, 75], [-2, 50], [-3, 25], [-4, 0], [-6, 0]
  ])('AC-146: con Δ = nivel de B − nivel de A = %i, A recibe %i al hundir solo a B; B no pierde XP ni nivel', (delta, expected) => {
    const world = pvpWorld({ A: 10, B: 10 + delta });
    const bXp = xpOfPlayer(world, 'B');
    const { gained, events } = pvpSink(world, 'A', 'B');
    expect(gained.A).toBe(expected);
    expect(xpOf(events, 'A', 'pvp')).toEqual(expected > 0 ? [expected] : []);
    expect(xpOfPlayer(world, 'B')).toBe(bXp);
    expect(levelOf(xpOfPlayer(world, 'B'))).toBe(10 + delta);
    expect(levelOf(xpOfPlayer(world, 'A'))).toBe(10);
  });

  test.each([
    ['dentro de la zona segura', { x: 0, z: 80 }, 0],
    ['protegido', { x: 0, z: 300 }, 1e9]
  ])('AC-146: en 10 min en los que A intenta atacar en bucle a un B %s, A gana 0 XP de B', (_case, pos, protectedFor) => {
    const world = pvpWorld({ A: 1, B: 1 });
    const a = shipOfPlayer(world, 'A')!;
    const b = shipOfPlayer(world, 'B')!;
    b.pos = { ...pos };
    b.protectedUntil = protectedFor;
    a.pos = { x: pos.x, z: pos.z + 40 };
    b.hp = 1; // cualquier impacto lo hundiría
    world.rng = () => 0; // todas las balas aciertan
    let tried = 0;
    let accepted = 0;
    const events = run(world, 10 * 60, () => {
      if (world.tick % TICK_RATE !== 0) return;
      tried++;
      if (attack(world, 'A', b.id).ok) accepted++;
      a.attackTargetId = b.id; // aunque forzara el ataque, el servidor no lo deja disparar
      a.reload = 0;
    });
    expect(tried).toBe(600);
    expect(accepted).toBe(0);
    expect(b.state).toBe('alive');
    expect(b.hp).toBe(1);
    expect(xpOf(events, 'A')).toEqual([]);
    expect(xpOfPlayer(world, 'A')).toBe(0);
  });

  test('AC-147: A hunde a B (mismo nivel) 3 veces en < 30 min → 100, 50 y 0; un 4.º pasados 30 min del 1.º → 100; B → A cuenta aparte', () => {
    const world = pvpWorld({ A: 10, B: 10 });
    const got: number[] = [];
    const first = pvpSink(world, 'A', 'B');
    got.push(first.gained.A);
    const expiresAt = first.sunkAt + GDD_REPEAT_WINDOW;
    expect(openPairs(world, 'A')).toEqual([{ victimId: 'B', kills: 1, expiresAt }]);
    run(world, 60);
    expect(pvpSink(world, 'B', 'A').gained.B).toBe(100); // B en medio: su pareja es otra
    run(world, 60);
    got.push(pvpSink(world, 'A', 'B').gained.A);
    expect(openPairs(world, 'A')).toEqual([{ victimId: 'B', kills: 2, expiresAt }]);
    // Reconectar no borra la pareja: vive por jugador, no por barco
    removePlayer(world, 'B');
    addPlayer(world, 'B', 'B');
    setLevel(world, 'B', 10);
    while (world.time < expiresAt - 15) run(world, 1);
    const third = pvpSink(world, 'A', 'B'); // a ~29:45 del 1.º: deja tiempo para la cuenta atrás antes del vencimiento
    got.push(third.gained.A);
    expect(third.sunkAt).toBeLessThan(expiresAt);
    // La ventana es [1.º, 1.º + 30 min): en el instante del vencimiento ya no cuenta
    const now = world.time;
    world.time = expiresAt - 1e-6;
    expect(pairKills(world, 'A', 'B')).toBe(2);
    world.time = expiresAt;
    expect(pairKills(world, 'A', 'B')).toBe(0);
    world.time = now;
    revive(world, 'B');
    while (world.time < expiresAt) run(world, DT);
    const fourth = pvpSink(world, 'A', 'B'); // pasados 30 min del 1.º: la pareja vuelve a empezar
    got.push(fourth.gained.A);
    expect(fourth.sunkAt - expiresAt).toBeLessThan(1);
    expect(got).toEqual([100, 50, 0, 100]);
    expect(openPairs(world, 'A')).toEqual([{ victimId: 'B', kills: 1, expiresAt: fourth.sunkAt + GDD_REPEAT_WINDOW }]);
    expect(openPairs(world, 'B')).toEqual([{ victimId: 'A', kills: 1, expiresAt: expect.any(Number) }]);
  });

  // BACKLOG AC-147 (r11, 2026-10-17): «Un hundimiento sin XP no gasta la ventana (GDD §10b): si A (nivel 9) hunde a B
  // (nivel 5), cobra 0 y la pareja A → B no se abre; cuando B llega al nivel 6, el siguiente hundimiento de A da 25 como
  // 1.º de la pareja.»
  test('AC-147: A (nivel 9) hunde a B (nivel 5) y cobra 0 sin abrir la pareja; con B en el nivel 6, el siguiente da 25 como 1.º (y el otro, 12 como 2.º)', () => {
    const world = pvpWorld({ A: 9, B: 5 });
    expect(pvpSink(world, 'A', 'B').gained.A).toBe(0);
    expect(openPairs(world, 'A')).toEqual([]);
    setLevel(world, 'B', 6);
    expect(pvpSink(world, 'A', 'B').gained.A).toBe(25);
    expect(openPairs(world, 'A').map((p) => p.kills)).toEqual([1]);
    expect(pvpSink(world, 'A', 'B').gained.A).toBe(12); // floor(25 × 0,5)
  });

  // GDD §10b (r11): «“Con XP” quiere decir que el atacante cobró más de 0: un hundimiento que no le da XP (p. ej., a 4 o
  // más niveles por encima de la víctima, o con una parte del reparto que redondea a 0) no abre la ventana ni avanza en ella.»
  test('AC-147: una parte del reparto que redondea a 0 no abre la ventana ni avanza en ella', () => {
    const world = pvpWorld({ A: 10, B: 10, C: 10 });
    const tiny = (): number => pvpSink(world, 'A', 'B', [['C', 3000, 0.1]]).gained.A; // A, 30 de 3 030: floor(0,99) = 0
    expect(tiny()).toBe(0);
    expect(openPairs(world, 'A')).toEqual([]);
    expect(openPairs(world, 'C').map((p) => [p.victimId, p.kills])).toEqual([['B', 1]]);
    expect(pvpSink(world, 'A', 'B').gained.A).toBe(100); // 1.º de la pareja
    expect(tiny()).toBe(0);
    expect(openPairs(world, 'A').map((p) => p.kills)).toEqual([1]);
    expect(pvpSink(world, 'A', 'B').gained.A).toBe(50); // 2.º: el de 0 no avanzó
  });

  test('AC-148: B (nivel 10) con el 70 % del daño de A (nivel 10) y el 30 % de C (nivel 12) → A 70 y C 15; el oro de la penalización, entero a quien dio el último golpe', () => {
    const world = pvpWorld({ user_alpha: 10, user_bravo: 10, user_charlie: 12 });
    world.players.get('user_bravo')!.gold = 500;
    world.players.get('user_alpha')!.gold = 0;
    world.players.get('user_charlie')!.gold = 0;
    drainPvpLog(world);
    const { gained, events } = pvpSink(world, 'user_charlie', 'user_bravo', [['user_alpha', 490, 0.1], ['user_charlie', 180, 0.2]]); // C da el último golpe: 490 / 210
    expect([gained.user_alpha, gained.user_charlie]).toEqual([70, 15]);
    expect(world.players.get('user_alpha')!.gold).toBe(0);
    expect(world.players.get('user_charlie')!.gold).toBe(50);
    expect(lootOf(events)).toEqual([['user_charlie', 50, 'pvp']]);
    // El registro para el log del servidor: niveles y XP, sin nombres ni ids
    const log = drainPvpLog(world);
    expect(log).toEqual([{ victimLevel: 10, attackers: [{ level: 10, xp: 70 }, { level: 12, xp: 15 }] }]);
    expect(JSON.stringify(log)).not.toMatch(/user_|alpha|bravo|charlie/);
    expect(drainPvpLog(world)).toEqual([]);
  });

  test('AC-148: en el log, un atacante 4 o más niveles por encima de la víctima figura con 0 XP, nunca con XP negativa', () => {
    const world = pvpWorld({ A: 10, B: 4 });
    drainPvpLog(world);
    expect(pvpSink(world, 'A', 'B').gained.A).toBe(0);
    expect(drainPvpLog(world)).toEqual([{ victimLevel: 4, attackers: [{ level: 10, xp: 0 }] }]);
  });

  // BACKLOG AC-148 (r11): «El daño de los NPC no entra: si a B lo dañaron un pirata (90 %) y A (10 %), A cobra los 100
  // con su factor (GDD §10b).» Aquí, con B dos niveles por encima de A, «los 100 con su factor» son 120
  test('AC-148: B dañado un 90 % por un pirata y un 10 % por A, que lo remata → A cobra los 100 con su factor (120 con Δ = +2)', () => {
    const world = pvpWorld({ A: 10, B: 12 });
    const b = shipOfPlayer(world, 'B')!;
    shipOfPlayer(world, 'A')!.pos = { x: 0, z: 340 };
    b.pos = { x: 0, z: 300 };
    b.hp = b.maxHp = 316; // el pirata hace 286 (13 balas de 22) y A, 30: 90,5 % y 9,5 %
    const pirate = npcOf(world, 'pirate', 30, 300);
    pirate.ai = { state: 'combat', origin: { x: 30, z: 300 }, sector: 0, wait: 0, targetId: b.id, route: [], routeIndex: 0, fleeUntil: 0, threatId: null };
    world.rng = () => 0; // 3 andanadas enteras: 264
    while (b.hp > 316 - 264) run(world, DT);
    scriptedRng(world, ONE_HIT); // la 4.ª, 1 bala: 286
    while (b.hp > 30) run(world, DT);
    pirate.ai = null;
    pirate.attackTargetId = null;
    run(world, 1);
    expect(b.hp).toBe(30);
    expect((316 - 30) / 316).toBeGreaterThanOrEqual(0.9);
    expect(b.damage).toEqual([]); // el daño del pirata no se anota, como en el oro
    expect(pvpSink(world, 'A', 'B').gained.A).toBe(120);
  });

  // BACKLOG AC-148 (r11): «Los factores usan el nivel de cada uno justo antes de acreditar este hundimiento.»
  test('AC-148: el factor usa el nivel justo antes de acreditar: A (nivel 1, 0 XP) que hunde a B (nivel 2) cobra 110 con Δ = +1, aunque esos 110 lo suban al nivel 2', () => {
    const world = pvpWorld({ A: 1, B: 2 });
    expect(pvpSink(world, 'A', 'B').gained.A).toBe(110);
    expect(levelOf(xpOfPlayer(world, 'A'))).toBe(2);
  });

  test('AC-148: hundido solo por piratas (sin daño de jugadores) no da XP ni entra en el log', () => {
    const world = pvpWorld({ A: 1 });
    const ship = shipOfPlayer(world, 'A')!;
    const pirate = npcOf(world, 'pirate', 0, 330);
    pirate.ai = { state: 'combat', origin: { x: 0, z: 330 }, sector: 0, wait: 0, targetId: ship.id, route: [], routeIndex: 0, fleeUntil: 0, threatId: null };
    pirate.attackTargetId = ship.id;
    ship.pos = { x: 0, z: 300 };
    ship.hp = 1;
    world.rng = () => 0;
    const events = run(world, 2);
    expect(ship.state).toBe('sinking');
    expect(events.some((e) => e.type === 'xp')).toBe(false);
    expect(drainPvpLog(world)).toEqual([]);
  });

  // BACKLOG AC-148 (r11, eee3be9; O-35): «La ventana de 60 s vale también aquí: si A dañó a B hace más de 60 s y no ha
  // vuelto a impactarle, y C lo remata, A cobra 0 de XP y C cobra los 100 con su factor.» Gemelo de windowCase (AC-145),
  // con un jugador como víctima: B (nivel 10), A (nivel 10) y C (nivel 12, Δ = −2: el 50 %)
  function pvpWindowCase(aHitsAgainAt85: boolean): number[][] {
    const world = pvpWorld({ A: 10, B: 10, C: 12 });
    const a = shipOfPlayer(world, 'A')!;
    const c = shipOfPlayer(world, 'C')!;
    const b = shipOfPlayer(world, 'B')!;
    a.pos = { x: 300, z: 300 };
    c.pos = { x: 330, z: 300 };
    b.pos = { x: 300, z: 340 };
    world.time = 85;
    seedDamage(b, [[a, aHitsAgainAt85 ? 270 : 300, 0, 0], [c, 120, 80, 84]]);
    b.hp = 60;
    const events: GameEvent[] = [];
    if (aHitsAgainAt85) {
      scriptedRng(world, ONE_HIT); // A vuelve a impactar a los 85 s: 300 / 120
      expect(attack(world, 'A', b.id).ok).toBe(true);
      events.push(...run(world, 1));
      cancelAttack(world, 'A');
    } else {
      b.hp = 30;
    }
    while (world.time < 89.6) events.push(...run(world, DT));
    scriptedRng(world, ONE_HIT); // C lo hunde a los ~90 s: 300 / 150
    expect(attack(world, 'C', b.id).ok).toBe(true);
    events.push(...run(world, 2));
    expect(b.state).not.toBe('alive');
    return [xpOf(events, 'A', 'pvp'), xpOf(events, 'C', 'pvp')];
  }

  test('AC-148 (O-35): A dañó a B hace 85 s sin volver a impactar y C lo remata → A cobra 0 y C los 100 con su factor (50 con Δ = −2)', () => {
    expect(pvpWindowCase(false)).toEqual([[], [50]]);
  });

  test('AC-148 (O-35): si A vuelve a impactar a los 85 s cuenta todo su daño → 300 / 150 da 67 y 33, y C cobra floor(33 × 0,5) = 16', () => {
    expect(pvpWindowCase(true)).toEqual([[67], [16]]);
  });
});

// Dos bots que se hunden por turnos lo más rápido que permiten las reglas, en el mundo real: la víctima zarpa en cuanto
// acaba la cuenta atrás y sale de la zona segura hacia su puesto, y el atacante ataca en cuanto puede (la víctima fuera
// de la zona y sin protección, y él sin protección). `first` y `second` son los órdenes de los hundimientos con XP de
// cada mitad (A = A hunde a B); entre una y otra, y al acabar, se alternan, y la segunda mitad empieza cuando las dos
// parejas ya cerraron su primera ventana
function duel(startLevel: number, first: string, second: string): { xp: Record<'A' | 'B', number>; kills: string[]; rewarded: string[]; lastKillAt: number } {
  const world = emptyWorld(149);
  const spot = { A: { x: 0, z: 150 }, B: { x: 0, z: 130 } }; // fuera de la zona segura (110 m) y a tiro (20 m)
  for (const id of ['A', 'B'] as const) {
    addPlayer(world, id, id);
    setLevel(world, id, startLevel);
  }
  const start = { A: xpOfPlayer(world, 'A'), B: xpOfPlayer(world, 'B') };
  const kills: string[] = [];
  const rewarded: string[] = [];
  let windowsClosedAt = Infinity;
  let lastKillAt = 0;
  const nextKiller = (): 'A' | 'B' => {
    if (rewarded.length < first.length) return first[rewarded.length] as 'A' | 'B';
    const secondDone = rewarded.length - first.length;
    if (world.time >= windowsClosedAt && secondDone < second.length) return second[secondDone] as 'A' | 'B';
    return kills.length && kills[kills.length - 1] === 'A' ? 'B' : 'A';
  };
  const sent = new Set<string>();
  for (let i = 0; i < 60 * 60 * TICK_RATE; i++) {
    for (const id of ['A', 'B'] as const) {
      const ship = shipOfPlayer(world, id)!;
      if (ship.state === 'dead' && respawn(world, id).ok) sent.delete(id);
      if (ship.state === 'alive' && !sent.has(id)) {
        moveTo(world, id, spot[id]);
        sent.add(id);
      }
    }
    const k = nextKiller();
    const v = k === 'A' ? 'B' : 'A';
    const ks = shipOfPlayer(world, k)!;
    const vs = shipOfPlayer(world, v)!;
    if (vs.attackTargetId) cancelAttack(world, v); // la víctima no se defiende (y el turno pudo cambiar a mitad de un ataque)
    if (ks.attackTargetId !== vs.id && canAttack(world, ks, vs)) attack(world, k, vs.id);
    step(world, DT);
    for (const e of drainEvents(world)) {
      if (e.type === 'sunk' && (e.shipId === shipOfPlayer(world, 'A')!.id || e.shipId === shipOfPlayer(world, 'B')!.id)) {
        kills.push(e.shipId === vs.id ? k : v);
        lastKillAt = world.time;
      }
      if (e.type === 'xp') rewarded.push(e.playerId);
    }
    if (windowsClosedAt === Infinity && rewarded.length >= first.length && first.length > 0) {
      const pairs = [...openPairs(world, 'A'), ...openPairs(world, 'B')];
      if (pairs.length) windowsClosedAt = Math.max(...pairs.map((p) => p.expiresAt));
    }
    if (windowsClosedAt === Infinity && first.length === 0) windowsClosedAt = 0;
  }
  return { xp: { A: xpOfPlayer(world, 'A') - start.A, B: xpOfPlayer(world, 'B') - start.B }, kills, rewarded, lastKillAt };
}

describe('E14 — Abuso: dos bots que se hunden por turnos (AC-149)', () => {
  test('AC-149 (a): los dos en el nivel 10, 60 min por turnos → cada uno ≤ 300 XP (2 ventanas × 150)', () => {
    const r = duel(10, '', '');
    console.log(`AC-149 (a): ${r.kills.length} hundimientos en 60 min (el último a ${(r.lastKillAt / 60).toFixed(1)} min) → A ${r.xp.A}, B ${r.xp.B} XP`);
    expect(r.kills.length).toBeGreaterThanOrEqual(20);
    expect(r.lastKillAt).toBeLessThan(60 * 60);
    expect(r.xp.A).toBeLessThanOrEqual(300);
    expect(r.xp.B).toBeLessThanOrEqual(300);
    expect([r.xp.A, r.xp.B]).toEqual([300, 300]); // turnos estrictos: las dos ventanas completas
  });

  // A no lo fija el BACKLOG; sale de las mismas reglas (297 = 100 + floor(37,5) + 110 + 50, el redondeo hacia abajo)
  test.each([
    ['ABAB', 'ABAB', 320, 300],
    ['ABAB', 'AABB', 330, 300],
    ['AABB', 'AABB', 310, 297]
  ])('AC-149 (b): los dos en el nivel 1, órdenes %s|%s → B gana %i (A, %i) y cada uno ≤ 450 XP', (first, second, expectedB, expectedA) => {
    const r = duel(1, first, second);
    console.log(`AC-149 (b) ${first}${second}: ${r.kills.length} hundimientos, con XP ${r.rewarded.join('')} → A ${r.xp.A}, B ${r.xp.B} XP`);
    expect(r.rewarded.join('')).toBe(first + second);
    expect([r.xp.B, r.xp.A]).toEqual([expectedB, expectedA]);
    expect(r.xp.A).toBeLessThanOrEqual(450);
    expect(r.xp.B).toBeLessThanOrEqual(450);
  });

  test('AC-149 (b): en los 70 órdenes posibles de 4 + 4 hundimientos con XP en 2 ventanas, nadie pasa de 450 y el máximo es 330 (ABABAABB)', () => {
    const orders: string[] = [];
    const gen = (p: string, a: number, b: number) => {
      if (a === 4 && b === 4) orders.push(p);
      if (a < 4) gen(p + 'A', a + 1, b);
      if (b < 4) gen(p + 'B', a, b + 1);
    };
    gen('', 0, 0);
    const score = (order: string) => {
      const xp = { A: 0, B: 0 };
      const count = { A: 0, B: 0 };
      for (const k of order as Iterable<'A' | 'B'>) {
        const v = k === 'A' ? 'B' : 'A';
        xp[k] += pvpXp(C.PVP_XP, levelOf(xp[k]), levelOf(xp[v]), count[k]++ % 2);
      }
      return xp;
    };
    const scored = orders.map((o) => ({ o, ...score(o) }));
    const bestB = scored.reduce((m, s) => (s.B > m.B ? s : m));
    expect(orders.length).toBe(70);
    expect(Math.max(...scored.map((s) => Math.max(s.A, s.B)))).toBeLessThanOrEqual(450);
    expect([bestB.o, bestB.B]).toEqual(['ABABAABB', 330]);
    expect([score('ABABABAB').B, score('ABABAABB').B, score('AABBAABB').B]).toEqual([320, 330, 310]);
    expect(pvpXp(C.PVP_XP, 2, 1, 1)).toBe(37); // Δ −1 y 2.º de la ventana: floor(100 × 0,75 × 0,5) = floor(37,5)
  });
});

describe('E14 — H-1403 Niveles e insignias (§10b)', () => {
  test.each([
    [59, 1, 'Grumete'], [60, 2, 'Grumete'], [499, 4, 'Grumete'], [500, 5, 'Marinero'],
    [35_999, 19, 'Almirante'], [36_000, 20, 'Almirante'], [9_999_999, 20, 'Almirante']
  ])('AC-150: con %i de XP, nivel %i e insignia %s', (xp, level, rank) => {
    expect(levelOf(xp)).toBe(level);
    expect(rankLabel(rankOf(levelOf(xp)))).toBe(rank);
  });

  test('AC-150: cada umbral de la tabla sube un nivel exacto y cada insignia empieza en su nivel', () => {
    LEVEL_XP.forEach((xp, i) => {
      expect([xp, levelOf(xp)]).toEqual([xp, i + 1]);
      if (i > 0) expect([xp - 1, levelOf(xp - 1)]).toEqual([xp - 1, i]);
    });
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(rankOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  test('AC-150: la XP no pasa del tope y el nivel se calcula de la XP: no hay campo de nivel guardado', () => {
    const world = emptyWorld();
    const a = placePlayer(world, 'A', 300, 300);
    const player = world.players.get('A')!;
    player.xp = C.XP_CAP - 10;
    const pirate = npcOf(world, 'pirate', 300, 340);
    seedDamage(pirate, [[a, 420, 0.1]]);
    pirate.hp = 30;
    scriptedRng(world, ONE_HIT);
    attack(world, 'A', pirate.id);
    run(world, 2);
    expect(player.xp).toBe(C.XP_CAP);
    const view = playerView(world, 'A')!;
    expect(view.xp).toBe(C.XP_CAP);
    for (const keys of [Object.keys(player), Object.keys(view)]) expect(keys.filter((k) => /level|rank|nivel/i.test(k))).toEqual([]);
  });

  test('AC-153 (simulación): el snapshot del barco de un jugador lleva su nivel (`lv`), calculado de la XP; el de un NPC no', () => {
    const world = emptyWorld();
    const a = placePlayer(world, 'A', 300, 300);
    const merchant = placeMerchant(world, 0, 300);
    expect(shipSnapshot(world, a).lv).toBe(1);
    world.players.get('A')!.xp = 8000;
    expect(shipSnapshot(world, a).lv).toBe(13);
    expect('lv' in shipSnapshot(world, merchant)).toBe(false);
  });

  test('AC-150: un jugador nuevo empieza con 0 de XP (nivel 1) y uno con progreso guardado, con su XP', () => {
    const world = emptyWorld();
    expect(addPlayer(world, 'nuevo', 'nuevo').xp).toBe(0);
    const saved = addPlayer(world, 'guardado', 'guardado', { gold: 100, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: ['sloop'], activeShip: 'sloop', xp: 1234 });
    expect([saved.xp, levelOf(saved.xp)]).toEqual([1234, 7]);
  });
});

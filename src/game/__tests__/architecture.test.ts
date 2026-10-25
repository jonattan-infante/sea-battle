import fs from 'fs';
import path from 'path';
import * as C from '../constants';
import { PlayerShipClass } from '../constants';
import { World } from '../types';
import { createRng } from '../vec';
import { maxHpFor as statsMaxHpFor } from '../stats';
import { addPlayer, attack, createWorld, drainEvents, maxHpFor, moveTo, setRepair, shipOfPlayer, spawnCaptain, step } from '../world';
import { DT, percentile } from './helpers';

const GAME_DIR = path.join(__dirname, '..');
const sources = fs
  .readdirSync(GAME_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ file: f, code: stripComments(fs.readFileSync(path.join(GAME_DIR, f), 'utf8')) }));

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

describe('E0 — Arquitectura de la simulación', () => {
  test('AC-01: src/game no importa react, three ni @react-three/*, ni usa fuentes no deterministas', () => {
    expect(sources.length).toBeGreaterThanOrEqual(6);
    for (const { file, code } of sources) {
      const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect({ file, spec, ok: !/^(react|three|@react-three\/)/.test(spec) }).toEqual({ file, spec, ok: true });
        expect({ file, spec, ok: spec.startsWith('.') }).toEqual({ file, spec, ok: true }); // solo módulos propios
      }
      expect({ file, random: /Math\.random|Date\.now|new Date|performance\.now/.test(code) }).toEqual({ file, random: false });
    }
  });

  // AC-189: el cliente calcula el coste de un NPC con las tablas de la simulación sin arrastrar el grafo de rutas, que
  // world.ts construye al importarse (navigator). stats.ts es lo que puede importar el cliente: ni él ni lo que importa
  // llegan a world.ts ni a nav.ts
  test('stats.ts no importa world.ts ni nav.ts, tampoco a través de otro módulo de src/game', () => {
    const local = (code: string) => [...code.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)].map((m) => `${m[1]}.ts`);
    const reached = new Set<string>();
    const pending = ['stats.ts'];
    while (pending.length) {
      const file = pending.pop()!;
      if (reached.has(file)) continue;
      reached.add(file);
      const src = sources.find((s) => s.file === file);
      expect({ file, found: !!src }).toEqual({ file, found: true });
      pending.push(...local(src!.code));
    }
    expect([...reached].filter((f) => f === 'world.ts' || f === 'nav.ts')).toEqual([]);
  });

  test('maxHpFor vive en stats.ts y world.ts lo reexporta: la vida máxima con el casco de §11 (×1 / ×1,2 / ×1,4)', () => {
    expect(maxHpFor).toBe(statsMaxHpFor);
    const hull = (h: number) => ({ upgrades: { cannons: 1, hull: h, sails: 1 } });
    expect([
      statsMaxHpFor('sloop', undefined),
      statsMaxHpFor('sloop', hull(2)),
      statsMaxHpFor('sloop', hull(3)),
      statsMaxHpFor('brig', hull(2)),
      statsMaxHpFor('frigate', hull(3)),
      statsMaxHpFor('gunboat', undefined)
    ]).toEqual([800, 960, 1120, 1680, 3080, 900]);
  });

  // Secuencia fija de intenciones aplicada a un mundo con semilla
  function scripted(seed: number): World {
    const world = createWorld({ seed });
    const rng = createRng(seed + 1000);
    for (let i = 0; i < 6; i++) addPlayer(world, `p${i}`, `P${i}`);
    for (let t = 0; t < 1200; t++) {
      if (t % 20 === 0) {
        for (let i = 0; i < 6; i++) {
          const id = `p${i}`;
          const roll = rng();
          if (roll < 0.6) moveTo(world, id, { x: (rng() * 2 - 1) * 450, z: (rng() * 2 - 1) * 450 });
          else if (roll < 0.9) {
            const ship = shipOfPlayer(world, id)!;
            const others = [...world.ships.values()].filter((s) => s.id !== ship.id && s.state === 'alive');
            if (others.length) attack(world, id, others[Math.floor(rng() * others.length)].id);
          } else setRepair(world, id, true);
        }
      }
      step(world, DT);
      drainEvents(world);
    }
    return world;
  }

  function serialize(world: World): string {
    const { rng: _rng, ...rest } = world as World & { rng: unknown };
    return JSON.stringify(rest, (_k, v) => (v instanceof Map ? [...v.entries()] : v === Infinity ? 'Inf' : v === -Infinity ? '-Inf' : v));
  }

  test('AC-02: misma semilla y mismas intenciones → mismo estado tras 1 200 ticks', () => {
    const a = serialize(scripted(77));
    const b = serialize(scripted(77));
    expect(a.length).toBeGreaterThan(1000);
    expect(a).toBe(b);
    expect(serialize(scripted(78))).not.toBe(a);
  });

  // p50 y p99 del tick en 2 000 ticks (tras 200 de calentamiento del JIT) con 20 jugadores con intenciones aleatorias,
  // 20 NPC y el jefe (H-305; con el I2 encendido, el peor caso). Mismas semillas en cada llamada: la carga de la simulación
  // es idéntica y solo cambia la de la máquina
  function tickTimes(): { p50: number; p99: number } {
    const world = createWorld({ seed: 3, i2: true });
    const boss = spawnCaptain(world);
    expect(boss).not.toBeNull();
    const rng = createRng(5);
    for (let i = 0; i < 20; i++) addPlayer(world, `p${i}`, `P${i}`);
    for (const s of world.ships.values()) s.protectedUntil = 0;
    const times: number[] = [];
    for (let t = 0; t < 2000 + 200; t++) {
      // Cada jugador envía en promedio ~1 intención/s
      for (let i = 0; i < 20; i++) {
        if (rng() > 1 / C.TICK_RATE) continue;
        const id = `p${i}`;
        const ship = shipOfPlayer(world, id);
        if (!ship || ship.state !== 'alive') continue;
        if (rng() < 0.6) moveTo(world, id, { x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 });
        else {
          const near = [...world.ships.values()].find((s) => s.id !== ship.id && s.state === 'alive' && Math.hypot(s.pos.x - ship.pos.x, s.pos.z - ship.pos.z) < 150);
          if (near) attack(world, id, near.id);
        }
      }
      const t0 = performance.now();
      step(world, DT);
      drainEvents(world);
      if (t >= 200) times.push(performance.now() - t0);
    }
    return { p50: percentile(times, 50), p99: percentile(times, 99) };
  }

  // DT-05: la carga ajena de la máquina (otro Jest en paralelo) solo suma tiempo a un tick, nunca lo resta, así que el
  // menor de 3 p99 estima el coste de la simulación; un p99 suelto medía también la máquina
  test('AC-03: con 20 jugadores con intenciones aleatorias, 20 NPC y el jefe, el menor de 3 p99 del tick (2 000 ticks cada uno) es ≤ 4 ms', () => {
    const runs = [tickTimes(), tickTimes(), tickTimes()];
    const best = Math.min(...runs.map((r) => r.p99));
    console.log(`AC-03: p99 ${runs.map((r) => r.p99.toFixed(3)).join(' · ')} ms (p50 ${runs.map((r) => r.p50.toFixed(3)).join(' · ')} ms) → menor ${best.toFixed(3)} ms`);
    expect(best).toBeLessThanOrEqual(4);
  });

  test('AC-04: las constantes coinciden con las tablas del GDD (§4, §6, §7, §8, §9, §10, §11, §12, §13)', () => {
    // §4 Mundo
    expect([C.MAP_HALF_SIZE, C.NAV_LIMIT, C.PORT_RADIUS, C.SAFE_ZONE_RADIUS]).toEqual([500, 490, 30, 110]);
    expect([C.RESPAWN_RING, C.MERCHANT_RING, C.PIRATE_RING]).toEqual([{ min: 60, max: 90 }, { min: 150, max: 330 }, { min: 300, max: 460 }]);
    expect(C.ISLANDS.map((i) => [i.id, i.x, i.z, i.radius])).toEqual([
      ['PORT', 0, 0, 30], ['I1', 260, 200, 45], ['I2', -300, 170, 35], ['I3', -220, -280, 55],
      ['I4', 250, -260, 40], ['I5', 20, 360, 30], ['I6', -410, -30, 28]
    ]);
    // §6 Barcos del jugador: eslora, radio, vida, vel., acel., frenado, giro, cañones, precio
    const row = (id: PlayerShipClass) => {
      const s = C.SHIP_CLASSES[id];
      return [s.length, s.radius, s.maxHp, s.maxSpeed, s.accel, s.brake, Math.round((s.turnRate * 180) / Math.PI), s.cannonsPerSide, s.price];
    };
    expect(row('sloop')).toEqual([16, 5, 800, 14, 4, 6, 90, 4, 0]);
    expect(row('brig')).toEqual([24, 7, 1400, 12, 3, 5, 70, 6, 2000]);
    expect(row('frigate')).toEqual([34, 9, 2200, 10, 2.5, 4, 55, 8, 6000]);
    expect(C.TURN_FACTORS.map((t) => t.factor)).toEqual([1, 0.6, 0.4]);
    expect(C.ARRIVE_DISTANCE).toBe(2);
    // §7 Cañones
    expect(C.CANNON_LEVELS.map((c) => [c.damage, c.accuracy, c.range, c.reload, c.price])).toEqual([
      [30, 0.7, 60, 4.0, 0], [38, 0.75, 70, 3.5, 500], [48, 0.8, 80, 3.0, 1500]
    ]);
    expect([C.CANNONBALL_SPEED, C.ATTACK_MAX_DISTANCE, C.TAB_TARGET_RADIUS]).toEqual([120, 200, 150]);
    // §8 Reparación
    expect([C.REPAIR_RATE, C.REPAIR_RATE_UNDER_FIRE, C.REPAIR_TICK, C.REPAIR_UNDER_FIRE_WINDOW, C.REPAIR_MAX_SPEED, C.LOW_HP_WARNING]).toEqual([0.04, 0.015, 0.5, 3, 1, 0.3]);
    // §9 NPC: vida, patrulla/máx., giro, cañones, daño, precisión, alcance, recarga, recompensa, restos, reaparición
    const p = C.SHIP_CLASSES.pirate;
    expect([p.maxHp, p.patrolSpeed, p.maxSpeed, Math.round((p.turnRate * 180) / Math.PI), p.cannonsPerSide, p.cannon, p.reward, p.wreck, p.respawnTime]).toEqual([
      450, 6, 11, 70, 4, { damage: 22, accuracy: 0.6, range: 55, reload: 4.5 }, 105, 25, 30
    ]);
    const m = C.SHIP_CLASSES.merchant;
    expect([m.maxHp, m.patrolSpeed, m.maxSpeed, Math.round((m.turnRate * 180) / Math.PI), m.cannonsPerSide, m.cannon, m.reward, m.wreck, m.respawnTime]).toEqual([
      300, 7, 9, 50, 0, null, 60, 15, 20
    ]);
    // Capitán pirata (I2): eslora, radio, vida, patrulla/máx., giro, cañones, artillería, recompensa y restos; margen L/2 + 2 (§6)
    const k = C.SHIP_CLASSES[C.CAPTAIN_CLASS];
    expect([k.kind, k.label, k.length, k.radius, k.maxHp, k.patrolSpeed, k.maxSpeed, Math.round((k.turnRate * 180) / Math.PI), k.cannonsPerSide, k.cannon, k.reward, k.wreck]).toEqual([
      'pirate', 'Capitán pirata', 30, 9, 1800, 6, 10, 60, 6, { damage: 28, accuracy: 0.65, range: 65, reload: 4.0 }, 600, 150
    ]);
    expect(C.navClearance(C.CAPTAIN_CLASS)).toBe(17);
    expect([C.CAPTAIN_KILLS_TO_SPAWN, C.CAPTAIN_LAIR_RADIUS, C.CAPTAIN_SPAWN_MIN_PLAYER_DISTANCE]).toEqual([10, 440, 150]);
    expect([C.HOSTILE_AI.captain.aggro, C.HOSTILE_AI.captain.orbitRadius, C.HOSTILE_AI.captain.leash]).toEqual([90, 50, 150]);
    expect(C.HOSTILE_AI.pirate).toEqual({ aggro: 70, disengage: 110, leash: 200, orbitRadius: 45, orbitSpeed: 8, patrolRadius: 120 });
    // Cañonera pirata (I2): eslora, radio, vida, patrulla/máx., acel./frenado, giro, cañones, artillería, recompensa, restos y
    // reaparición; detección, órbita, velocidad de órbita y correa (§9)
    const g = C.SHIP_CLASSES[C.GUNBOAT_CLASS];
    expect([g.kind, g.label, g.length, g.radius, g.maxHp, g.patrolSpeed, g.maxSpeed, g.accel, g.brake, Math.round((g.turnRate * 180) / Math.PI), g.cannonsPerSide, g.cannon, g.reward, g.wreck, g.respawnTime]).toEqual([
      'pirate', 'Cañonera pirata', 28, 8, 900, 5, 8, 2.5, 4, 50, 6, { damage: 20, accuracy: 0.55, range: 65, reload: 5.0 }, 210, 50, 45
    ]);
    // Detección, objetivo perdido (> 110 m, como el pirata), correa, órbita, patrulla y las bandas de mantener la distancia:
    // se acerca por encima de 64 m y se aleja por debajo de 55 m
    expect(C.HOSTILE_AI.gunboat).toEqual({ aggro: 80, disengage: 110, leash: 200, orbitRadius: 62, orbitSpeed: 6, patrolRadius: 120, keepAway: { approach: 64, flee: 55 } });
    expect(C.navClearance(C.GUNBOAT_CLASS)).toBe(16);
    // Población (AC-51): con el I2 apagado, la de la 1.0; encendido, 4 cañoneras (1 por sector, en el anillo de 400–470 m)
    // sustituyen a 4 piratas
    expect([C.NPC_POPULATION.pirate, C.NPC_POPULATION.merchant, C.PIRATES_PER_SECTOR]).toEqual([12, 8, 3]);
    expect([C.NPC_POPULATION_I2, C.PIRATES_PER_SECTOR_I2, C.GUNBOATS_PER_SECTOR, C.GUNBOAT_RING]).toEqual([{ pirate: 8, gunboat: 4, merchant: 8 }, 2, 1, { min: 400, max: 470 }]);
    expect([C.PIRATE_AGGRO_RADIUS, C.PIRATE_DISENGAGE_TARGET, C.PIRATE_LEASH, C.PIRATE_ORBIT_RADIUS, C.PIRATE_ORBIT_SPEED, C.PIRATE_PORT_EXCLUSION]).toEqual([70, 110, 200, 45, 8, 130]);
    expect([C.THREAT_WINDOW, C.MERCHANT_FLEE_TIME]).toEqual([10, 12]);
    // §10 Economía
    expect([C.STARTING_GOLD, C.LOOT_DAMAGE_WINDOW, C.DEATH_GOLD_PENALTY, C.GOLD_CAP, C.WRECK_PICKUP_RADIUS, C.WRECK_LIFETIME]).toEqual([100, 60, 0.1, 999_999, 8, 30]);
    // §11 Mejoras
    expect(C.UPGRADE_LEVELS.cannons.prices).toEqual([0, 500, 1500]);
    expect([C.UPGRADE_LEVELS.hull.multipliers, C.UPGRADE_LEVELS.hull.prices]).toEqual([[1, 1.2, 1.4], [0, 400, 1200]]);
    expect([C.UPGRADE_LEVELS.sails.multipliers, C.UPGRADE_LEVELS.sails.prices]).toEqual([[1, 1.1, 1.2], [0, 300, 900]]);
    const total = [...Object.values(C.UPGRADE_LEVELS).flatMap((u) => u.prices), C.SHIP_CLASSES.brig.price, C.SHIP_CLASSES.frigate.price].reduce((a, b) => a + b, 0);
    expect(total).toBe(12_800);
    // §12 Muerte
    expect([C.SINKING_TIME, C.DEATH_COUNTDOWN, C.SPAWN_PROTECTION]).toEqual([3, 8, 15]);
    // §13 Red
    expect([C.TICK_RATE, C.SNAPSHOT_RATE, C.INTERPOLATION_DELAY_MS, C.INTEREST_RADIUS, C.MAX_PLAYERS, C.INTENT_RATE_PER_SECOND, C.INTENT_BURST, C.DISCONNECT_GRACE]).toEqual([
      20, 10, 100, 300, 20, 10, 20, 10
    ]);
  });
});

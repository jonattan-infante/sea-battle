// Arnés de AC-173 (a): 10 min con 20 bots y la población del I2, en el mapa que se le pase (BACKLOG :1616, decisión de
// producto del 2026-11-02, r11 63c0fc2, precisada en fbbd0c4). 10 bots de puerto con el arnés de AC-47 y AC-49 (npc.test.ts,
// «en 10 min con 20 bots»), que aquí vuelven a zarpar al hundirse, y 10 cazadores con la Fragata y el cañón de nivel 3 que
// van al pirata o a la cañonera vivos más cercanos, reparan del 40 % al 80 % (la regla de AC-142) y al hundirse vuelven a
// zarpar. Encima, las medidas de AC-173: el atasco, las
// órbitas de O-70 (ii), las apariciones del Capitán (AC-54) y las reapariciones de los NPC (AC-52). Lo usan map-soak.test.ts
// (con MAP_1_1) y la calibración con MAP_1_0, que pide la fila antes de fijar las aserciones
import { CAPTAIN_CLASS, CAPTAIN_LAIR_RADIUS, CAPTAIN_SPAWN_MIN_PLAYER_DISTANCE, GUNBOAT_CLASS, MapDef, TICK_RATE, navClearance } from '../constants';
import { Ship, World } from '../types';
import { Vec2, angleDelta, createRng, distance } from '../vec';
import { addPlayer, attack, createWorld, moveTo, navigatorOf, respawn, setRepair, shipOfPlayer } from '../world';
import { DT, run } from './helpers';

export const SOAK_SECONDS = 600;
export const STUCK_SPEED = 0.5; // m/s: por debajo, con destino, cuenta como atasco
export const STUCK_LIMIT = 10; // s seguidos
export const ORBIT_WINDOW = 16; // s, como la sonda de O-70
export const ORBIT_TURN = 2 * Math.PI; // ≥ 360° en la ventana
export const ORBIT_DISPLACEMENT = 10; // < 10 m de desplazamiento neto en la ventana
export const PORT_BOTS = 10;
export const HUNTERS = 10;
export const HUNTER_REPAIR_BELOW = 0.4; // reparan por debajo del 40 % de la vida (AC-142, BACKLOG :1249)
export const HUNTER_REPAIR_UNTIL = 0.8; // y hasta el 80 %
export const HUNTER_DUEL = 40; // m: se acercan hasta 40 m de su objetivo, como el bot de AC-60
export const COAST_NEAR = 30; // m: un destino a ≤ 30 m de una costa (solo al log)

export interface ShipNote {
  id: string;
  classId: string;
  ai: string;
  pos: Vec2;
  destination: Vec2 | null;
}

// Una ventana de 16 s de un NPC (para leer las rachas de órbita): estado de la IA, objetivo y distancia a él, velocidad al
// final y media (recorrido / 16 s), giro y desplazamiento netos, y destino y distancia a él, todo al cerrar la ventana
export interface WindowNote {
  t: number;
  ai: string;
  targetId: string | null;
  targetDist: number | null;
  speed: number;
  meanSpeed: number;
  turnDeg: number;
  disp: number;
  destination: Vec2 | null;
  destDist: number | null;
}

export interface SoakReport {
  seed: number;
  map: string;
  stuck: (ShipNote & { seconds: number })[]; // el peor tramo de cada NPC que pasó de STUCK_LIMIT
  maxStuck: ShipNote & { seconds: number }; // el peor tramo de todos, aunque no pase de la cota (para la calibración)
  orbitRuns: (ShipNote & { windows: number; t: number; detail: WindowNote[] })[]; // rachas de ≥ 2 ventanas malas seguidas (la peor por NPC), con cada ventana
  orbitSingles: (ShipNote & { t: number; detail: WindowNote })[]; // ventanas malas sueltas (solo al log)
  captains: { id: string; t: number; radius: number; nearestPlayer: number; navigable: boolean }[];
  respawns: { id: string; classId: string; t: number; pos: Vec2; navigable: boolean }[];
  minPirateToPort: number;
  minGunboatToPort: number;
  sunkHostiles: number; // piratas y cañoneras hundidos (el Capitán nace con el 10.º, AC-54)
  nearCoastSeconds: Record<string, number>; // segundos-NPC con destino a ≤ 30 m de una costa, por clase (solo al log)
  portBotsByMinute: { minute: number; alive: number; dead: number }[]; // bots de puerto vivos y hundidos, por minuto (solo al log)
}

const note = (s: Ship): ShipNote => ({ id: s.id, classId: s.classId, ai: s.ai?.state ?? '-', pos: { ...s.pos }, destination: s.destination ? { ...s.destination } : null });

interface Track {
  stuck: number;
  worst: (ShipNote & { seconds: number }) | null;
  turn: number;
  start: Vec2 | null;
  heading: number;
  valid: boolean;
  run: number;
  runWindows: WindowNote[];
  path: number;
  last: Vec2 | null;
  worstRun: (ShipNote & { windows: number; t: number; detail: WindowNote[] }) | null;
}

export function runMapSoak(seed: number, map: MapDef): SoakReport {
  const world: World = createWorld({ seed, i2: true, map });
  const nav = navigatorOf(world);
  const rng = createRng(11);
  for (let i = 0; i < PORT_BOTS; i++) addPlayer(world, `bot${i}`, `Bot ${i}`);
  for (let i = 0; i < HUNTERS; i++) {
    addPlayer(world, `hunter${i}`, `Cazador ${i}`, { gold: 0, upgrades: { cannons: 3, hull: 1, sails: 1 }, ownedShips: ['sloop', 'frigate'], activeShip: 'frigate' });
  }
  const coastDistance = (p: Vec2) => Math.min(...world.islands.map((i) => distance(p, i) - i.radius));
  const tracks = new Map<string, Track>();
  const report: SoakReport = {
    seed,
    map: map.id,
    stuck: [],
    maxStuck: { id: '-', classId: '-', ai: '-', pos: { x: 0, z: 0 }, destination: null, seconds: 0 },
    orbitRuns: [],
    orbitSingles: [],
    captains: [],
    respawns: [],
    minPirateToPort: Infinity,
    minGunboatToPort: Infinity,
    sunkHostiles: 0,
    nearCoastSeconds: {},
    portBotsByMinute: []
  };
  const windowTicks = ORBIT_WINDOW * TICK_RATE;
  for (let t = 0; t < SOAK_SECONDS * TICK_RATE; t++) {
    if (t % (5 * TICK_RATE) === 0) {
      for (let i = 0; i < PORT_BOTS; i++) {
        // Al hundirse vuelven a zarpar (solo en AC-173, fbbd0c4): el arnés de AC-47 solo adelantaba su reloj
        if (shipOfPlayer(world, `bot${i}`)!.state === 'dead') {
          world.players.get(`bot${i}`)!.death!.at = -100;
          respawn(world, `bot${i}`);
        }
        const ship = shipOfPlayer(world, `bot${i}`)!;
        // Entran y salen del puerto y atacan lo que tengan cerca (npc.test.ts, AC-47 y AC-49)
        const out = rng() < 0.5;
        const a = rng() * Math.PI * 2;
        const r = out ? 150 + rng() * 300 : rng() * 90;
        moveTo(world, `bot${i}`, { x: Math.cos(a) * r, z: Math.sin(a) * r });
        const near = [...world.ships.values()].find((s) => s.kind !== 'player' && s.state === 'alive' && distance(s.pos, ship.pos) < 80);
        if (near) attack(world, `bot${i}`, near.id);
      }
    }
    if (t % (60 * TICK_RATE) === 0) {
      const alive = Array.from({ length: PORT_BOTS }, (_, i) => shipOfPlayer(world, `bot${i}`)!.state === 'alive').filter(Boolean).length;
      report.portBotsByMinute.push({ minute: t / (60 * TICK_RATE), alive, dead: PORT_BOTS - alive });
    }
    // Los cazadores deciden cada 0,5 s, como el bot de AC-60 (economy.test.ts): al hundirse vuelven a zarpar en cuanto
    // pueden; por debajo del 40 % reparan, hasta el 80 %; si no, al pirata o la cañonera vivos más cercanos (nunca al
    // Capitán ni a un mercante), a ≤ 40 m
    if (t % 10 === 0) {
      for (let i = 0; i < HUNTERS; i++) {
        const id = `hunter${i}`;
        const s = shipOfPlayer(world, id)!;
        if (s.state === 'dead') {
          respawn(world, id);
          continue;
        }
        if (s.state !== 'alive') continue;
        if (s.repairing) {
          if (s.hp / s.maxHp >= HUNTER_REPAIR_UNTIL) setRepair(world, id, false);
          else continue;
        } else if (s.hp / s.maxHp < HUNTER_REPAIR_BELOW) {
          setRepair(world, id, true);
          continue;
        }
        let best: Ship | null = null;
        for (const o of world.ships.values()) {
          if (o.kind !== 'pirate' || o.classId === CAPTAIN_CLASS || o.state !== 'alive') continue;
          if (!best || distance(o.pos, s.pos) < distance(best.pos, s.pos)) best = o;
        }
        if (!best) continue;
        if (s.attackTargetId !== best.id) attack(world, id, best.id);
        if (distance(s.pos, best.pos) > HUNTER_DUEL) moveTo(world, id, best.pos);
      }
    }
    const now = (t + 1) * DT;
    const respawned = new Set<string>();
    for (const e of run(world, DT)) {
      if (e.type === 'sunk') {
        const s = world.ships.get(e.shipId);
        if (s && s.kind === 'pirate' && s.classId !== CAPTAIN_CLASS) report.sunkHostiles++;
      }
      if (e.type === 'captain') {
        const c = world.ships.get(e.shipId)!;
        const players = [...world.ships.values()].filter((s) => s.kind === 'player' && s.state !== 'dead');
        report.captains.push({
          id: c.id,
          t: now,
          radius: distance(c.pos, { x: 0, z: 0 }),
          nearestPlayer: Math.min(Infinity, ...players.map((p) => distance(p.pos, c.pos))),
          navigable: nav.navigable(c.pos, navClearance(CAPTAIN_CLASS))
        });
      }
      if (e.type === 'respawn') {
        const s = world.ships.get(e.shipId);
        if (!s || s.kind === 'player') continue;
        respawned.add(s.id);
        report.respawns.push({ id: s.id, classId: s.classId, t: now, pos: { ...s.pos }, navigable: nav.navigable(s.pos, navClearance(s.classId)) });
      }
    }
    const windowEnd = (t + 1) % windowTicks === 0;
    for (const s of world.ships.values()) {
      if (s.kind === 'player') continue;
      let tr = tracks.get(s.id);
      if (!tr) {
        tr = { stuck: 0, worst: null, turn: 0, start: null, heading: s.heading, valid: true, run: 0, runWindows: [], path: 0, last: null, worstRun: null };
        tracks.set(s.id, tr);
      }
      const alive = s.state === 'alive';
      // El atasco: con destino y a < 0,5 m/s, seguido; vuelve a 0 en cuanto falla una de las dos o el barco no está vivo
      tr.stuck = alive && s.destination !== null && s.speed < STUCK_SPEED ? tr.stuck + DT : 0;
      if (tr.stuck > 0 && (!tr.worst || tr.stuck > tr.worst.seconds)) tr.worst = { ...note(s), seconds: tr.stuck };
      if (tr.stuck > report.maxStuck.seconds) report.maxStuck = { ...note(s), seconds: tr.stuck };
      if (alive && s.classId !== GUNBOAT_CLASS && s.classId !== CAPTAIN_CLASS && s.kind === 'pirate') report.minPirateToPort = Math.min(report.minPirateToPort, distance(s.pos, { x: 0, z: 0 }));
      if (alive && s.classId === GUNBOAT_CLASS) report.minGunboatToPort = Math.min(report.minGunboatToPort, distance(s.pos, { x: 0, z: 0 }));
      if (alive && s.destination && coastDistance(s.destination) <= COAST_NEAR) report.nearCoastSeconds[s.classId] = (report.nearCoastSeconds[s.classId] ?? 0) + DT;
      // Las órbitas (O-70 ii): ventanas de 16 s alineadas desde t = 0. Una ventana en la que el barco no estuvo vivo de
      // principio a fin, o reapareció, no cuenta y corta la racha
      if (!alive || respawned.has(s.id)) tr.valid = false;
      if (tr.start === null) tr.start = { ...s.pos };
      else tr.turn += angleDelta(tr.heading, s.heading);
      tr.heading = s.heading;
      if (tr.last) tr.path += distance(tr.last, s.pos);
      tr.last = { ...s.pos };
      if (windowEnd) {
        const disp = distance(s.pos, tr.start);
        const bad = tr.valid && Math.abs(tr.turn) >= ORBIT_TURN && disp < ORBIT_DISPLACEMENT;
        if (bad) {
          const targetId = s.ai?.targetId ?? s.attackTargetId ?? null;
          const target = targetId ? world.ships.get(targetId) : undefined;
          const w: WindowNote = {
            t: now,
            ai: s.ai?.state ?? '-',
            targetId,
            targetDist: target ? distance(s.pos, target.pos) : null,
            speed: s.speed,
            meanSpeed: tr.path / ORBIT_WINDOW,
            turnDeg: (tr.turn * 180) / Math.PI,
            disp,
            destination: s.destination ? { ...s.destination } : null,
            destDist: s.destination ? distance(s.pos, s.destination) : null
          };
          tr.run++;
          tr.runWindows.push(w);
          if (tr.run >= 2 && (!tr.worstRun || tr.run > tr.worstRun.windows)) tr.worstRun = { ...note(s), windows: tr.run, t: now, detail: [...tr.runWindows] };
          report.orbitSingles.push({ ...note(s), t: now, detail: w });
        } else {
          tr.run = 0;
          tr.runWindows = [];
        }
        tr.turn = 0;
        tr.start = { ...s.pos };
        tr.path = 0;
        tr.valid = true;
      }
    }
    // Barcos que salieron del mundo (el Capitán hundido): su racha y su ventana se cierran
    for (const id of [...tracks.keys()]) if (!world.ships.has(id)) tracks.delete(id);
  }
  for (const tr of tracks.values()) {
    if (tr.worst && tr.worst.seconds > STUCK_LIMIT) report.stuck.push(tr.worst);
    if (tr.worstRun) report.orbitRuns.push(tr.worstRun);
  }
  // Las ventanas malas que forman parte de una racha no son sueltas
  const inRun = new Set(report.orbitRuns.map((r) => r.id));
  report.orbitSingles = report.orbitSingles.filter((w) => !inRun.has(w.id));
  return report;
}

// Una línea para el log: lo que se aserta y lo que solo se mira
export function soakSummary(r: SoakReport): string {
  const count = (c: string) => r.respawns.filter((x) => x.classId === c).length;
  return (
    `AC-173 (mapa ${r.map}, semilla ${r.seed}): atasco máx ${r.maxStuck.seconds.toFixed(2)} s (${r.maxStuck.id} ${r.maxStuck.classId} ${r.maxStuck.ai})` +
    ` · atascos > ${STUCK_LIMIT} s: ${r.stuck.length} · rachas de órbita: ${r.orbitRuns.length} · ventanas sueltas: ${r.orbitSingles.length}` +
    ` · Capitanes: ${r.captains.length} · reapariciones: pirata ${count('pirate')}, mercante ${count('merchant')}, cañonera ${count(GUNBOAT_CLASS)}` +
    ` · hostiles hundidos: ${r.sunkHostiles}` +
    ` · bots de puerto vivos/hundidos por minuto: ${r.portBotsByMinute.map((m) => `${m.minute}:${m.alive}/${m.dead}`).join(' ')}` +
    ` · mín. al puerto: pirata ${r.minPirateToPort.toFixed(1)} m, cañonera ${r.minGunboatToPort.toFixed(1)} m` +
    ` · segundos-NPC con destino a ≤ ${COAST_NEAR} m de costa: ${Object.entries(r.nearCoastSeconds).map(([c, v]) => `${c} ${v.toFixed(0)}`).join(', ') || '0'}` +
    ` · guarida a ${CAPTAIN_LAIR_RADIUS} m, jugadores a ≥ ${CAPTAIN_SPAWN_MIN_PLAYER_DISTANCE} m`
  );
}

// Una ventana de órbita en una línea, para la aserción y el log
export function windowLine(w: WindowNote): string {
  const p = (v: Vec2 | null) => (v ? `(${v.x.toFixed(1)}, ${v.z.toFixed(1)})` : '-');
  return (
    `t=${w.t.toFixed(0)} ${w.ai} objetivo ${w.targetId ?? '-'}${w.targetDist === null ? '' : ` a ${w.targetDist.toFixed(1)} m`}` +
    ` v ${w.speed.toFixed(2)} m/s (media ${w.meanSpeed.toFixed(2)}) giro ${w.turnDeg.toFixed(0)}° desplazamiento ${w.disp.toFixed(1)} m` +
    ` destino ${p(w.destination)}${w.destDist === null ? '' : ` a ${w.destDist.toFixed(1)} m`}`
  );
}

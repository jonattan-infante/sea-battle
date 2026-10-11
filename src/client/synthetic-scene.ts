// Escena sintética sin servidor para QA y capturas (dueño: capa de render). Barcos que navegan solos,
// andanadas programadas y eventos con el mismo formato que el servidor (src/game/types.ts), para que el
// runtime los dibuje exactamente igual que una partida. Dos escenas: la portada de la landing
// (ART-DIRECTION §16.1) y la escena estándar de AC-89 (20 jugadores + 20 NPC + 1, con ≥ 6 duelos).
import { CANNON_LEVELS, CANNONBALL_SPEED, ISLANDS, IslandDef, SHIP_CLASSES, ShipKind } from '../game/constants';
import { GameEvent, PlayerView, Welcome, WreckView } from '../game/types';
import { createRng } from '../game/vec';
import type { RenderShip } from './game-client';
import type { RenderSource } from './runtime';

export type SceneName = 'hero' | 'standard';

export interface SceneShip {
  id: string;
  kind: ShipKind;
  classId: string;
  name: string;
  x: number;
  z: number;
  heading: number;
  hp: number; // fracción de la vida máxima
  speed: number; // m/s
  orbit: number; // radio del círculo que describe (0 = línea recta)
}

export interface SceneDuel {
  shooter: string;
  target: string;
  period: number; // s entre andanadas
  offset: number; // s hasta la primera
  accuracy: number;
}

export interface SceneSpec {
  name: SceneName;
  focus: { x: number; z: number };
  ships: SceneShip[];
  duels: SceneDuel[];
  seed: number;
}

// Cámara para la que se compone la escena (px CSS y ppm del preset activo)
export interface SceneView {
  w: number;
  h: number;
  ppm: number;
  sinT: number;
}

interface Motion {
  ship: RenderShip;
  x0: number;
  z0: number;
  heading0: number;
  speed: number;
  orbit: number;
}

interface Duel extends SceneDuel {
  next: number;
}

export class SyntheticSource implements RenderSource {
  readonly myShipId: string | null = null;
  readonly player: PlayerView | null = null;
  readonly welcome: Welcome | null = null;
  readonly focus: { x: number; z: number };
  readonly spec: SceneSpec;
  private readonly ships: RenderShip[] = [];
  private readonly byId = new Map<string, RenderShip>();
  private readonly motions: Motion[] = [];
  private readonly duels: Duel[];
  private readonly pending: { at: number; event: GameEvent }[] = [];
  private readonly listeners = new Set<(e: GameEvent) => void>();
  private readonly rng: () => number;
  private readonly t0 = performance.now();
  private time = 0;

  constructor(spec: SceneSpec) {
    this.spec = spec;
    this.focus = spec.focus;
    this.rng = createRng(spec.seed);
    const targets = new Map(spec.duels.map((d) => [d.shooter, d.target]));
    for (const s of spec.ships) {
      const maxHp = SHIP_CLASSES[s.classId]?.maxHp ?? 500;
      const ship: RenderShip = {
        id: s.id, kind: s.kind, classId: s.classId, name: s.name, ownerId: s.kind === 'player' ? `owner-${s.id}` : null,
        x: s.x, z: s.z, heading: s.heading, speed: s.speed, hp: Math.round(maxHp * s.hp), maxHp, state: 'alive',
        targetId: targets.get(s.id) ?? null, repairing: false, protectedUntil: 0, sinkingSince: 0
      };
      this.ships.push(ship);
      this.byId.set(s.id, ship);
      this.motions.push({ ship, x0: s.x, z0: s.z, heading0: s.heading, speed: s.speed, orbit: s.orbit });
    }
    this.duels = spec.duels.map((d) => ({ ...d, next: d.offset }));
  }

  update(nowMs: number): void {
    const t = (nowMs - this.t0) / 1000;
    this.time = t;
    for (const m of this.motions) {
      const s = m.ship;
      if (m.orbit > 0) {
        // Círculo con centro fijo: la posición inicial está en el círculo y el rumbo es la tangente
        const omega = m.speed / m.orbit;
        const cx = m.x0 + Math.cos(m.heading0) * m.orbit;
        const cz = m.z0 - Math.sin(m.heading0) * m.orbit;
        const a = Math.atan2(m.x0 - cx, m.z0 - cz) + omega * t;
        s.x = cx + Math.sin(a) * m.orbit;
        s.z = cz + Math.cos(a) * m.orbit;
        s.heading = a + Math.PI / 2;
      } else {
        s.x = m.x0 + Math.sin(m.heading0) * m.speed * t;
        s.z = m.z0 + Math.cos(m.heading0) * m.speed * t;
      }
    }
    for (const d of this.duels) {
      if (t >= d.next) {
        this.volley(d, t);
        d.next += d.period;
      }
    }
    if (this.pending.length > 0) {
      let i = 0;
      while (i < this.pending.length && this.pending[i].at <= t) this.emit(this.pending[i++].event);
      if (i > 0) this.pending.splice(0, i);
    }
  }

  // Fuerza la andanada de un barco en el próximo frame (capturas deterministas)
  fire(shooterId: string): void {
    for (const d of this.duels) if (d.shooter === shooterId) d.next = this.time;
  }

  // Desplaza las andanadas programadas para que ninguna llegue antes de `seconds` (capturas sin solapes)
  hold(seconds: number): void {
    for (const d of this.duels) d.next = Math.max(d.next, this.time + seconds);
  }

  private volley(d: Duel, t: number): void {
    const shooter = this.byId.get(d.shooter);
    const target = this.byId.get(d.target);
    if (!shooter || !target) return;
    const stats = SHIP_CLASSES[shooter.classId];
    const cannons = stats?.cannonsPerSide ?? 0;
    if (cannons === 0) return;
    let hits = 0;
    for (let i = 0; i < cannons; i++) if (this.rng() < d.accuracy) hits++;
    const distance = Math.hypot(target.x - shooter.x, target.z - shooter.z);
    const duration = distance / CANNONBALL_SPEED;
    const damage = (stats.cannon ?? CANNON_LEVELS[CANNON_LEVELS.length - 1]).damage;
    this.emit({ type: 'volley', shipId: shooter.id, targetId: target.id, from: { x: shooter.x, z: shooter.z }, to: { x: target.x, z: target.z }, duration, hits, cannons });
    const impact: GameEvent = { type: 'impact', shipId: target.id, byShipId: shooter.id, damage: hits * damage, hits, misses: cannons - hits, pos: { x: target.x, z: target.z } };
    this.pending.push({ at: t + duration, event: impact });
    this.pending.sort((a, b) => a.at - b.at);
  }

  private emit(event: GameEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  serverTime(): number {
    return this.time;
  }

  getShip(id: string | null | undefined): RenderShip | undefined {
    return id ? this.byId.get(id) : undefined;
  }

  onMembership(l: (list: RenderShip[]) => void): () => void {
    l(this.ships);
    return () => undefined;
  }

  onWrecks(l: (list: WreckView[]) => void): () => void {
    l([]);
    return () => undefined;
  }

  onEvent(l: (e: GameEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

function island(id: string): IslandDef {
  return ISLANDS.find((i) => i.id === id) ?? ISLANDS[1];
}

// Punto del agua en una fracción de la pantalla para una cámara con foco `focus`
function at(view: SceneView, focus: { x: number; z: number }, fx: number, fy: number): { x: number; z: number } {
  return { x: focus.x + ((fx - 0.5) * view.w) / view.ppm, z: focus.z + ((fy - 0.5) * view.h) / (view.ppm * view.sinT) };
}

// Foco que deja el centro de la isla en la fracción (fx, fy) de la pantalla
function focusFor(view: SceneView, isle: IslandDef, fx: number, fy: number): { x: number; z: number } {
  return { x: isle.x - ((fx - 0.5) * view.w) / view.ppm, z: isle.z - ((fy - 0.5) * view.h) / (view.ppm * view.sinT) };
}

// ART-DIRECTION §16.1: una Fragata y un pirata intercambiando andanadas con humo y una isla con palmeras en una
// esquina. La Fragata navega al oeste con la banda de babor (sur) hacia el pirata, que navega al este más abajo.
// La acción queda a la derecha en escritorio (el logo y el lema van a la izquierda, x = 120…680) y en la mitad
// inferior en móvil (texto en y = 30 % y botones fijos abajo). Las posiciones son las del instante `settle`.
export const HERO_SETTLE_S = 7.2;

export function heroScene(view: SceneView): SceneSpec {
  const portrait = view.h > view.w;
  const layout = portrait
    ? { island: [1.0, 0.07], frigate: [0.4, 0.55], pirate: [0.62, 0.72] }
    : { island: [1.0, 0.04], frigate: [0.56, 0.4], pirate: [0.76, 0.64] };
  const isle = island('I1');
  const focus = focusFor(view, isle, layout.island[0], layout.island[1]);
  const speed = 1.2;
  const ship = (id: string, kind: ShipKind, classId: string, name: string, fx: number, fy: number, heading: number, hp: number): SceneShip => {
    const p = at(view, focus, fx, fy);
    return { id, kind, classId, name, x: p.x - Math.sin(heading) * speed * HERO_SETTLE_S, z: p.z - Math.cos(heading) * speed * HERO_SETTLE_S, heading, hp, speed, orbit: 0 };
  };
  return {
    name: 'hero',
    focus,
    seed: 7,
    ships: [
      ship('hero-frigate', 'player', 'frigate', 'Fragata', layout.frigate[0], layout.frigate[1], -Math.PI / 2, 0.62),
      ship('hero-pirate', 'pirate', 'pirate', 'Pirata', layout.pirate[0], layout.pirate[1], Math.PI / 2, 0.22)
    ],
    duels: [
      { shooter: 'hero-frigate', target: 'hero-pirate', period: 2.6, offset: 0.6, accuracy: 0.75 },
      { shooter: 'hero-pirate', target: 'hero-frigate', period: 3.1, offset: 1.9, accuracy: 0.6 }
    ]
  };
}

// AC-89: 20 barcos de jugadores + 20 NPC (12 piratas y 8 mercantes) + 1 Fragata en lugar del jefe (P2), todos en
// pantalla con el zoom por defecto, una isla en una esquina, 8 duelos simultáneos y daño variado (humo y fuego)
export function standardScene(view: SceneView): SceneSpec {
  const rng = createRng(89);
  const isle = island('I1');
  const focus = focusFor(view, isle, 0.94, 0.1);
  const players = ['sloop', 'brig', 'frigate'];
  const roster: { kind: ShipKind; classId: string; name: string }[] = [];
  for (let i = 0; i < 20; i++) roster.push({ kind: 'player', classId: players[i % 3], name: `Capitán ${i + 1}` });
  for (let i = 0; i < 12; i++) roster.push({ kind: 'pirate', classId: 'pirate', name: 'Pirata' });
  for (let i = 0; i < 8; i++) roster.push({ kind: 'merchant', classId: 'merchant', name: 'Mercante' });
  roster.push({ kind: 'player', classId: 'frigate', name: 'Capitán 21' });

  // Rejilla de 7 columnas que salta las celdas pegadas a la isla
  const cells: { x: number; z: number }[] = [];
  for (let row = 0; cells.length < roster.length && row < 12; row++) {
    for (let col = 0; col < 7 && cells.length < roster.length; col++) {
      const p = at(view, focus, 0.08 + (col + 0.5) * (0.84 / 7), 0.14 + (row + 0.5) * (0.74 / 6));
      if (Math.hypot(p.x - isle.x, p.z - isle.z) < isle.radius + 22) continue;
      cells.push(p);
    }
  }
  const hpFor = (i: number) => (i % 7 === 0 ? 0.2 : i % 5 === 0 ? 0.4 : 0.7 + 0.3 * rng());
  const ships: SceneShip[] = roster.map((r, i) => ({
    id: `s${i + 1}`, kind: r.kind, classId: r.classId, name: r.name, x: cells[i].x + (rng() - 0.5) * 4, z: cells[i].z + (rng() - 0.5) * 4,
    heading: rng() * Math.PI * 2, hp: hpFor(i), speed: r.kind === 'merchant' ? 2 : 3, orbit: 5
  }));
  // 8 duelos jugador ↔ pirata (en los dos sentidos) entre barcos cercanos
  const duels: SceneDuel[] = [];
  for (let k = 0; k < 8; k++) {
    const a = ships[k * 2];
    const b = ships[20 + (k % 12)];
    duels.push({ shooter: a.id, target: b.id, period: 3 + rng(), offset: rng() * 2, accuracy: 0.75 });
    duels.push({ shooter: b.id, target: a.id, period: 4.5, offset: 1 + rng() * 2, accuracy: 0.6 });
  }
  return { name: 'standard', focus, seed: 89, ships, duels };
}

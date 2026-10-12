// Escena sintética sin servidor para QA y capturas (dueño: capa de render). Barcos que navegan solos,
// andanadas programadas y eventos con el mismo formato que el servidor (src/game/types.ts), para que el
// runtime los dibuje exactamente igual que una partida. Tres escenas: la portada de la landing
// (ART-DIRECTION §16.1), la escena estándar de AC-89 (20 jugadores + 20 NPC + 1, con ≥ 6 duelos) y un
// escaparate para capturas antes/después (barco propio protegido, objetivo fuera de alcance, estela, placas).
import { CANNON_LEVELS, CANNONBALL_SPEED, ISLANDS, IslandDef, SHIP_CLASSES, ShipKind } from '../game/constants';
import { GameEvent, PlayerView, Welcome, WreckView } from '../game/types';
import { createRng } from '../game/vec';
import type { RenderShip } from './game-client';
import type { RenderSource } from './runtime';

export type SceneName = 'hero' | 'standard' | 'showcase' | 'damage' | 'gallery';

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
  targetId?: string; // objetivo fijo (si no, el del duelo)
  protectedFor?: number; // s de protección desde el inicio de la escena
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
  captureAt?: number; // s de escena en los que la composición queda como se diseñó (capturas)
  myShipId?: string; // barco "propio" (anillo propio, placa propia, alcance del objetivo)
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
  readonly myShipId: string | null;
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
    this.myShipId = spec.myShipId ?? null;
    this.rng = createRng(spec.seed);
    const targets = new Map(spec.duels.map((d) => [d.shooter, d.target]));
    for (const s of spec.ships) {
      const maxHp = SHIP_CLASSES[s.classId]?.maxHp ?? 500;
      const ship: RenderShip = {
        id: s.id, kind: s.kind, classId: s.classId, name: s.name, ownerId: s.kind === 'player' ? `owner-${s.id}` : null,
        x: s.x, z: s.z, heading: s.heading, speed: s.speed, hp: Math.round(maxHp * s.hp), maxHp, state: 'alive',
        targetId: s.targetId ?? targets.get(s.id) ?? null, repairing: false, protectedUntil: s.protectedFor ?? 0, sinkingSince: 0
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

  // QA: deja un barco quieto en (x, z) con un rumbo; la escena recalcula la posición desde su origen en cada tick
  setPose(id: string, x: number, z: number, heading: number): void {
    const m = this.motions.find((q) => q.ship.id === id);
    if (!m) return;
    m.x0 = m.ship.x = x;
    m.z0 = m.ship.z = z;
    m.heading0 = m.ship.heading = heading;
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
// inferior en móvil (texto en y = 30 % y botones fijos abajo). Las posiciones son las del instante de captura.
// Coreografía para T = 7,3 s: andanada de la Fragata en T − 1,05 (su humo ya creció), la del pirata en T − 0,85
// (salpicaduras junto a la Fragata) y otra de la Fragata en T − 0,2 (fogonazos y balas en vuelo). Con 45 ms entre
// cañones, las dos primeras terminan de impactar antes de T − 0,2, así que el destello del casco (120 ms) ya pasó.
export const HERO_CAPTURE_S = 7.3;

export function heroScene(view: SceneView): SceneSpec {
  const portrait = view.h > view.w;
  // En vertical se ven ~360 m de fondo: con I1 (z = 200) arriba, el borde del mapa (z = 500) entraría por abajo,
  // así que se usa I4 (z = −260), que deja todo el encuadre entre z ≈ −285 y 71, lejos de la zona segura
  const layout = portrait
    ? { island: 'I4', at: [1.0, 0.07], frigate: [0.4, 0.55], pirate: [0.62, 0.72] }
    : { island: 'I1', at: [1.0, 0.04], frigate: [0.56, 0.4], pirate: [0.76, 0.64] };
  const isle = island(layout.island);
  const focus = focusFor(view, isle, layout.at[0], layout.at[1]);
  const speed = 1.2;
  const ship = (id: string, kind: ShipKind, classId: string, name: string, fx: number, fy: number, heading: number, hp: number): SceneShip => {
    const p = at(view, focus, fx, fy);
    return { id, kind, classId, name, x: p.x - Math.sin(heading) * speed * HERO_CAPTURE_S, z: p.z - Math.cos(heading) * speed * HERO_CAPTURE_S, heading, hp, speed, orbit: 0 };
  };
  return {
    name: 'hero',
    focus,
    seed: 7,
    captureAt: HERO_CAPTURE_S,
    ships: [
      ship('hero-frigate', 'player', 'frigate', 'Fragata', layout.frigate[0], layout.frigate[1], -Math.PI / 2, 0.62),
      ship('hero-pirate', 'pirate', 'pirate', 'Pirata', layout.pirate[0], layout.pirate[1], Math.PI / 2, 0.22)
    ],
    duels: [
      { shooter: 'hero-frigate', target: 'hero-pirate', period: 2.6, offset: HERO_CAPTURE_S - 1.05 - 2 * 2.6, accuracy: 0.75 },
      { shooter: 'hero-frigate', target: 'hero-pirate', period: 60, offset: HERO_CAPTURE_S - 0.2, accuracy: 0.75 },
      { shooter: 'hero-pirate', target: 'hero-frigate', period: 3.1, offset: HERO_CAPTURE_S - 0.85 - 2 * 3.1, accuracy: 0.6 }
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

  // Rejilla que salta las celdas pegadas a cualquier isla visible; con más columnas si no caben los 41
  const clear = (p: { x: number; z: number }) => ISLANDS.every((i) => Math.hypot(p.x - i.x, p.z - i.z) >= i.radius + 22);
  let cells: { x: number; z: number }[] = [];
  for (let cols = 7; cols <= 10 && cells.length < roster.length; cols++) {
    cells = [];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < cols; col++) {
        const p = at(view, focus, 0.08 + (col + 0.5) * (0.84 / cols), 0.14 + (row + 0.5) * (0.74 / 6));
        if (clear(p)) cells.push(p);
      }
    }
  }
  if (cells.length < roster.length) throw new Error(`La escena estándar no cabe en ${view.w}×${view.h} (está pensada para 1440×900)`);
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

// Escaparate para capturas antes/después (1440×900 con el zoom más cercano, o 390×844): barco propio protegido
// (anillos de protección, borde luminoso y "🛡" en la placa), otro jugador protegido con un nombre de 16
// caracteres, un pirata seleccionado fuera de alcance (anillo de objetivo al 40 % sin giro), un mercante
// navegando (estela) y una balandra. El encuadre (x de −220 a −20) contiene las líneas x = −150 y x = −50, donde
// la rejilla de sectores dibujaba líneas falsas.
export function showcaseScene(): SceneSpec {
  const fx = -120;
  const fz = 260;
  return {
    name: 'showcase',
    focus: { x: fx, z: fz },
    seed: 11,
    myShipId: 'me',
    ships: [
      { id: 'me', kind: 'player', classId: 'frigate', name: 'Invitado', x: fx - 10, z: fz + 12, heading: Math.PI / 2, hp: 1, speed: 0, orbit: 0, targetId: 'pirate', protectedFor: 600 },
      { id: 'ally', kind: 'player', classId: 'brig', name: 'Capitana Morgana', x: fx - 55, z: fz - 25, heading: -Math.PI / 2, hp: 0.8, speed: 0, orbit: 0, protectedFor: 600 },
      { id: 'pirate', kind: 'pirate', classId: 'pirate', name: 'Pirata', x: fx + 70, z: fz - 40, heading: Math.PI, hp: 0.45, speed: 0, orbit: 0 },
      { id: 'merchant', kind: 'merchant', classId: 'merchant', name: 'Mercante', x: fx - 60, z: fz + 45, heading: Math.PI / 2 + 0.25, hp: 1, speed: 6, orbit: 0 },
      { id: 'sloop', kind: 'player', classId: 'sloop', name: 'Balandra', x: fx + 45, z: fz + 40, heading: 0, hp: 0.25, speed: 0, orbit: 0 }
    ],
    duels: []
  };
}

// AS-V18–V20 y AD-26 (D23 c): las 5 clases quietas, con la vida entera y sin efectos, en el mar abierto de la escena
// de daño. La prueba pone una en el foco con setPose (con su rumbo) y deja las otras a 2 km
export function galleryScene(): SceneSpec {
  const fx = -120;
  const fz = 260;
  const classes: [string, ShipKind][] = [['sloop', 'player'], ['brig', 'player'], ['frigate', 'player'], ['pirate', 'pirate'], ['merchant', 'merchant'], ['captain', 'pirate'], ['gunboat', 'pirate']];
  return {
    name: 'gallery',
    focus: { x: fx, z: fz },
    seed: 23,
    ships: classes.map(([classId, kind], i): SceneShip => ({
      id: `g-${classId}`, kind, classId, name: classId, x: fx + (i === 0 ? 0 : 2000 * i), z: fz, heading: Math.PI / 2, hp: 1, speed: 0, orbit: 0
    })),
    duels: []
  };
}

// VFX-09b (D19): Balandra, Mercante y Fragata quietas, de costado (rumbo E) y separadas 90 m en mar abierto, para
// medir el área del humo y el fuego de vida baja con 1440×900 y zoom 1,0× sin que se solapen sus ROI. La vida la
// fija la prueba (getShip(id).hp)
export function damageScene(): SceneSpec {
  const fx = -120;
  const fz = 260;
  const ship = (id: string, classId: string, name: string, dx: number): SceneShip => ({
    id, kind: classId === 'merchant' ? 'merchant' : 'player', classId, name, x: fx + dx, z: fz, heading: Math.PI / 2, hp: 1, speed: 0, orbit: 0
  });
  return {
    name: 'damage',
    focus: { x: fx, z: fz },
    seed: 19,
    ships: [ship('d-sloop', 'sloop', 'Balandra', -90), ship('d-merchant', 'merchant', 'Mercante', 0), ship('d-frigate', 'frigate', 'Fragata', 90)],
    duels: []
  };
}

// Jugadores-bot con familia, por Socket.IO y sin navegador (otra página con WebGL por software costaría ~6 núcleos más). Solo
// usan el protocolo: entran como invitados, eligen barco y familia en la zona segura y navegan. Cada orden va sola y espera su
// reflejo en los frames (el barco o la familia en `me`, la llegada en la posición de su barco). Solo envían al actuar (regla 4:
// cero tráfico en reposo).
// - startFamilyVisitors (soak de AC-91 con las familias, AC-197 c; O-2 de QA-78): uno por cada ENDURANCE_VISITORS de
//   server/scenarios.ts. Repite el ciclo: su familia siguiente (ENDURANCE_FAMILY_CYCLE) donde está, siempre en la zona segura
//   → su puesto a la vista del jugador del soak → espera → vuelta a su punto del puerto o, una vuelta de cada dos, a su punto
//   lejano, fuera del área de interés del jugador.
// - postFamilyPlayers (escenas de legibilidad de ART-DIRECTION §21, D106): cada uno elige su barco y su familia y se queda
//   quieto en su puesto, llegando por su punto de paso para fijar el rumbo con el que se para.
import { io, Socket } from 'socket.io-client';
import { FamilyChoice, PlayerShipClass } from '../src/game/constants';
import { C2S, S2C } from '../src/game/protocol';
import type { PlayerView, ServerFrame, Welcome } from '../src/game/types';
import { ENDURANCE_FAMILY_CYCLE, ENDURANCE_VISITORS } from '../server/scenarios';

const DWELL_MS = 20_000; // en el puesto, a la vista
const ARRIVE_M = 4;
const LEG_TIMEOUT_MS = 120_000;
const ORDER_TIMEOUT_MS = 5_000;
const POLL_MS = 200;

type Point = { x: number; z: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Un jugador por el protocolo: su vista privada, la posición y el estado de su barco, y los avisos de error del servidor
class ProtocolPlayer {
  shipId = '';
  readonly errors: string[] = [];
  protected me: PlayerView | null = null;
  protected pos: Point | null = null;
  protected alive = true;
  protected running = true;
  private readonly socket: Socket;

  constructor(
    url: string,
    readonly name: string,
    guestId: string
  ) {
    this.socket = io(url, { transports: ['websocket'], reconnection: false, auth: { guest: true, guestId } });
    this.socket.on('connect', () => this.socket.emit(C2S.join, { name }));
    this.socket.on(S2C.welcome, (w: Welcome) => (this.shipId = w.shipId));
    this.socket.on(S2C.frame, (f: ServerFrame) => this.onFrame(f));
  }

  private onFrame(f: ServerFrame): void {
    if (f.me) this.me = f.me;
    for (const n of f.n ?? []) if (n.kind === 'error') this.errors.push(n.text);
    for (const s of f.s ?? []) {
      if (s.id !== this.shipId) continue;
      if (s.x !== undefined || s.z !== undefined) this.pos = { x: s.x ?? this.pos?.x ?? 0, z: s.z ?? this.pos?.z ?? 0 };
      if (s.st !== undefined) this.alive = s.st === 'alive';
    }
  }

  // Espera a que se cumpla la condición; si no llega en el plazo, lo apunta (salvo al parar)
  protected async until(cond: () => boolean, timeoutMs: number, what: string): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (this.running && Date.now() < end) {
      if (cond()) return true;
      await sleep(POLL_MS);
    }
    if (this.running) this.errors.push(`${this.name}: ${what}, sin reflejo en ${timeoutMs / 1000} s`);
    return false;
  }

  protected welcomed(): Promise<boolean> {
    return this.until(() => !!this.me && !!this.pos, 15_000, 'bienvenida');
  }

  protected async sail(to: Point, what: string): Promise<boolean> {
    this.socket.emit(C2S.moveTo, to);
    return this.until(() => this.alive && !!this.pos && Math.hypot(this.pos.x - to.x, this.pos.z - to.z) <= ARRIVE_M, LEG_TIMEOUT_MS, what);
  }

  protected async selectShip(classId: PlayerShipClass): Promise<boolean> {
    if (this.me!.activeShip === classId) return true;
    this.socket.emit(C2S.selectShip, { classId });
    return this.until(() => this.me!.activeShip === classId, ORDER_TIMEOUT_MS, `cambiar a ${classId}`);
  }

  protected async selectFamily(family: FamilyChoice): Promise<boolean> {
    if (this.me!.family === family) return false;
    this.socket.emit(C2S.selectFamily, { family });
    return this.until(() => this.me!.family === family, ORDER_TIMEOUT_MS, `cambiar a la familia ${family}`);
  }

  protected disconnect(): void {
    this.running = false;
    this.socket.disconnect();
  }
}

// El nombre de invitado que pone el cliente (GameApp.tsx): «Invitado» y las 4 primeras letras de su id, que empieza al azar
// como el de un invitado real (un prefijo fijo se leería en la placa: «Invitado LEG0»)
const guest = (prefix: string, index: number) => {
  const guestId = `${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}-${prefix}${index}`;
  return { guestId, name: `Invitado ${guestId.slice(0, 4).toUpperCase()}` };
};

// ---- Los barcos con familia del soak ----

type Visitor = (typeof ENDURANCE_VISITORS)[number];

export interface VisitorStats {
  name: string;
  classId: PlayerShipClass;
  changes: { at: number; family: FamilyChoice }[]; // los cambios de familia que confirmó el servidor (`me.family`), con Date.now()
  dwells: number; // veces que llegó a su puesto
  farTrips: number; // veces que llegó a su punto lejano
  errors: string[]; // avisos de error del servidor y órdenes sin reflejo
}

class FamilyVisitor extends ProtocolPlayer {
  readonly stats: VisitorStats;
  private readonly done: Promise<void>;

  constructor(
    url: string,
    private readonly v: Visitor,
    index: number
  ) {
    super(url, `Visita ${index + 1}`, `soak-visita-${index}-${Date.now().toString(36)}`);
    this.stats = { name: this.name, classId: v.classId, changes: [], dwells: 0, farTrips: 0, errors: this.errors };
    this.done = this.run().catch((e: unknown) => void this.errors.push(String(e)));
  }

  private async run(): Promise<void> {
    if (!(await this.welcomed())) return;
    if (!(await this.sail(this.v.port, 'llegar al puerto'))) return; // en la zona segura, sea cual sea el amarre de salida
    if (!(await this.selectShip(this.v.classId))) return;
    let k = ENDURANCE_FAMILY_CYCLE.indexOf(this.v.start);
    for (let trip = 0; this.running; trip++, k++) {
      const family = ENDURANCE_FAMILY_CYCLE[k % ENDURANCE_FAMILY_CYCLE.length];
      if (await this.selectFamily(family)) this.stats.changes.push({ at: Date.now(), family });
      if (await this.sail(this.v.post, 'llegar al puesto')) {
        this.stats.dwells++;
        for (const end = Date.now() + DWELL_MS; this.running && Date.now() < end; ) await sleep(POLL_MS);
      }
      const far = trip % 2 === 1;
      if ((await this.sail(far ? this.v.far : this.v.port, far ? 'llegar al punto lejano' : 'llegar al puerto')) && far) this.stats.farTrips++;
    }
  }

  async stop(): Promise<void> {
    this.disconnect();
    await this.done;
  }
}

export function startFamilyVisitors(url: string): { stats: VisitorStats[]; stop(): Promise<void> } {
  const visitors = ENDURANCE_VISITORS.map((v, i) => new FamilyVisitor(url, v, i));
  return {
    stats: visitors.map((v) => v.stats),
    stop: async () => void (await Promise.all(visitors.map((v) => v.stop())))
  };
}

// ---- Jugadores quietos en un puesto (legibilidad, §21) ----

export interface PostSpec {
  classId: PlayerShipClass;
  family: FamilyChoice;
  harbor: Point; // en la zona segura: donde elige barco y familia
  via: Point; // punto de paso: el último tramo, de via al puesto, fija el rumbo con el que se para
  post: Point;
}

class PostedPlayer extends ProtocolPlayer {
  readonly ready: Promise<boolean>;

  constructor(
    url: string,
    private readonly spec: PostSpec,
    index: number
  ) {
    const g = guest('leg', index);
    super(url, g.name, g.guestId);
    this.ready = this.run().catch((e: unknown) => (this.errors.push(String(e)), false));
  }

  private async run(): Promise<boolean> {
    if (!(await this.welcomed())) return false;
    if (!(await this.sail(this.spec.harbor, 'llegar al puerto'))) return false;
    if (!(await this.selectShip(this.spec.classId))) return false;
    if (this.me!.family !== this.spec.family && !(await this.selectFamily(this.spec.family))) return false;
    if (!(await this.sail(this.spec.via, 'llegar al punto de paso'))) return false;
    return this.sail(this.spec.post, 'llegar al puesto');
  }

  stop(): void {
    this.disconnect();
  }
}

// Los jugadores en sus puestos: `ready` se cumple cuando todos han llegado (con sus ids de barco), o falla con sus errores
export function postFamilyPlayers(url: string, specs: PostSpec[]): { shipIds(): string[]; ready: Promise<void>; stop(): void } {
  const players = specs.map((s, i) => new PostedPlayer(url, s, i));
  return {
    shipIds: () => players.map((p) => p.shipId),
    ready: Promise.all(players.map((p) => p.ready)).then((ok) => {
      if (!ok.every(Boolean)) throw new Error(`jugadores de la escena sin llegar a su puesto: ${players.flatMap((p) => p.errors).join(' · ')}`);
    }),
    stop: () => players.forEach((p) => p.stop())
  };
}

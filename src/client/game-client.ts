// Cliente de red: envía intenciones e interpola los frames del servidor. No usa React: el render lo lee por frame.
// Los frames traen solo deltas (GDD §13); aquí se fusionan en muestras completas por entidad y se interpola
// con un retraso fijo. Si no llega nada, todo se queda quieto en su última muestra (sin extrapolar).
import { io, Socket } from 'socket.io-client';
import { INTERPOLATION_DELAY_MS, PlayerShipClass } from '../game/constants';
import { C2S, S2C } from '../game/protocol';
import { GameEvent, Notice, PlayerView, ServerFrame, ShipSnapshot, ShipState, Welcome, WreckView } from '../game/types';
import { lerp, lerpAngle } from '../game/vec';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'full' | 'kicked' | 'unauthorized';

// Estado interpolado de un barco, reutilizado entre frames (sin asignaciones por frame)
export interface RenderShip {
  id: string;
  kind: ShipSnapshot['k'];
  classId: string;
  name: string;
  ownerId: string | null;
  x: number;
  z: number;
  heading: number;
  speed: number;
  hp: number;
  maxHp: number;
  state: ShipState;
  targetId: string | null;
  repairing: boolean;
  protectedUntil: number; // tiempo de servidor (s); protegido si > client.serverTime()
  sinkingSince: number; // performance.now() en que empezó a hundirse (0 si no)
}

interface Sample {
  t: number; // tiempo de servidor (s)
  snap: ShipSnapshot;
}

interface Entity {
  samples: Sample[];
  render: RenderShip;
  removeAt: number | null; // tiempo de servidor en que sale (se aplica con el retraso de interpolación)
}

export interface GameClientOptions {
  url: string;
  auth: () => Promise<Record<string, unknown>>;
  name?: string | null;
}

type Listener<T> = (value: T) => void;

const MAX_SAMPLES = 8;
const DELAY_S = INTERPOLATION_DELAY_MS / 1000;
// Los eventos se reproducen un poco antes que la posición para que el fogonazo coincida con el barco
const EVENT_LEAD_S = 0.05;
// Reintentos de reconexión: 1 s, 2 s y 4 s (AC-99)
const RECONNECT_ATTEMPTS = 3;

export class GameClient {
  readonly socket: Socket;
  welcome: Welcome | null = null;
  player: PlayerView | null = null;
  state: ConnectionState = 'connecting';

  private snapshotInterval = 0.1;
  private clockOffset: number | null = null; // ms locales − ms del servidor
  private readonly entities = new Map<string, Entity>();
  private readonly wrecks = new Map<string, WreckView>();
  private pendingEvents: { t: number; event: GameEvent }[] = [];

  private eventListeners = new Set<Listener<GameEvent>>();
  private playerListeners = new Set<Listener<PlayerView>>();
  private noticeListeners = new Set<Listener<Notice>>();
  private stateListeners = new Set<Listener<ConnectionState>>();
  private membershipListeners = new Set<Listener<RenderShip[]>>();
  private wreckListeners = new Set<Listener<WreckView[]>>();
  private welcomeListeners = new Set<Listener<Welcome>>();
  private frameListeners = new Set<Listener<ServerFrame>>();

  constructor(private readonly options: GameClientOptions) {
    this.socket = io(options.url, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
      randomizationFactor: 0,
      auth: (cb) => {
        options.auth().then(cb).catch(() => cb({}));
      }
    });

    this.socket.on('connect', () => {
      this.setState('connected');
      this.socket.emit(C2S.join, { name: this.options.name ?? undefined });
    });
    this.socket.on('disconnect', (reason) => {
      if (this.state === 'full' || this.state === 'kicked') return;
      // Desconexión iniciada por el servidor: Socket.IO no reintenta solo
      if (reason === 'io server disconnect') this.socket.connect();
      this.setState('reconnecting');
    });
    this.socket.on('connect_error', (err) => {
      if (err.message === 'unauthorized') this.setState('unauthorized');
    });
    this.socket.io.on('reconnect_failed', () => this.setState('failed'));

    this.socket.on(S2C.welcome, (w: Welcome) => {
      this.welcome = w;
      this.snapshotInterval = 1 / w.snapshotRate;
      this.clockOffset = performance.now() - w.time * 1000;
      this.welcomeListeners.forEach((l) => l(w));
    });
    this.socket.on(S2C.frame, (f: ServerFrame) => this.receiveFrame(f));
    this.socket.on(S2C.full, () => {
      this.setState('full');
      this.socket.disconnect();
    });
    this.socket.on(S2C.kicked, (n: Notice) => {
      this.setState('kicked');
      this.noticeListeners.forEach((l) => l({ kind: 'error', text: n.text }));
    });
  }

  connect(): void {
    this.setState('connecting');
    this.socket.connect();
  }

  // Reintento manual tras agotar los automáticos (botón "Reintentar")
  retry(): void {
    this.setState('reconnecting');
    this.socket.connect();
  }

  dispose(): void {
    this.socket.removeAllListeners();
    this.socket.io.removeAllListeners();
    this.socket.disconnect();
    this.eventListeners.clear();
    this.playerListeners.clear();
    this.noticeListeners.clear();
    this.stateListeners.clear();
    this.membershipListeners.clear();
    this.wreckListeners.clear();
    this.welcomeListeners.clear();
    this.frameListeners.clear();
  }

  // ---- Intenciones (GDD §13) ----
  moveTo(x: number, z: number): void {
    this.socket.emit(C2S.moveTo, { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
  }
  stop(): void {
    this.socket.emit(C2S.stop);
  }
  attack(targetId: string): void {
    this.socket.emit(C2S.attack, { targetId });
  }
  cancelAttack(): void {
    this.socket.emit(C2S.cancelAttack);
  }
  repair(on: boolean): void {
    this.socket.emit(C2S.repair, { on });
  }
  buy(itemId: string): void {
    this.socket.emit(C2S.buy, { itemId });
  }
  selectShip(classId: PlayerShipClass): void {
    this.socket.emit(C2S.selectShip, { classId });
  }
  respawn(): void {
    this.socket.emit(C2S.respawn);
  }

  get myShipId(): string | null {
    return this.player?.shipId ?? this.welcome?.shipId ?? null;
  }

  // Tiempo de servidor estimado ahora mismo (s), sin el retraso de interpolación
  serverTime(nowMs = performance.now()): number {
    return this.clockOffset === null ? 0 : (nowMs - this.clockOffset) / 1000;
  }

  // ---- Suscripciones ----
  onWelcome(l: Listener<Welcome>): () => void {
    this.welcomeListeners.add(l);
    if (this.welcome) l(this.welcome);
    return () => this.welcomeListeners.delete(l);
  }
  onFrame(l: Listener<ServerFrame>): () => void {
    this.frameListeners.add(l);
    return () => this.frameListeners.delete(l);
  }
  // Eventos del juego, reproducidos en el instante de servidor que les toca (alineados con la interpolación)
  onEvent(l: Listener<GameEvent>): () => void {
    this.eventListeners.add(l);
    return () => this.eventListeners.delete(l);
  }
  onPlayer(l: Listener<PlayerView>): () => void {
    this.playerListeners.add(l);
    if (this.player) l(this.player);
    return () => this.playerListeners.delete(l);
  }
  onNotice(l: Listener<Notice>): () => void {
    this.noticeListeners.add(l);
    return () => this.noticeListeners.delete(l);
  }
  onState(l: Listener<ConnectionState>): () => void {
    this.stateListeners.add(l);
    l(this.state);
    return () => this.stateListeners.delete(l);
  }
  // Barcos que entran o salen: lo único que obliga a React a re-renderizar la escena
  onMembership(l: Listener<RenderShip[]>): () => void {
    this.membershipListeners.add(l);
    l(this.shipList());
    return () => this.membershipListeners.delete(l);
  }
  onWrecks(l: Listener<WreckView[]>): () => void {
    this.wreckListeners.add(l);
    l([...this.wrecks.values()]);
    return () => this.wreckListeners.delete(l);
  }

  getShip(id: string | null | undefined): RenderShip | undefined {
    return id ? this.entities.get(id)?.render : undefined;
  }

  *getShips(): IterableIterator<RenderShip> {
    for (const e of this.entities.values()) yield e.render;
  }

  getWrecks(): IterableIterator<WreckView> {
    return this.wrecks.values();
  }

  private shipList(): RenderShip[] {
    return [...this.entities.values()].map((e) => e.render);
  }

  private setState(state: ConnectionState) {
    if (this.state === state) return;
    this.state = state;
    this.stateListeners.forEach((l) => l(state));
  }

  private receiveFrame(f: ServerFrame) {
    // El menor desfase observado es el que menos latencia incluye; se relaja despacio por deriva de reloj
    const offset = performance.now() - f.t * 1000;
    this.clockOffset = this.clockOffset === null ? offset : Math.min(offset, this.clockOffset + 2);
    let membershipChanged = false;

    if (f.full) {
      membershipChanged = this.entities.size > 0;
      this.entities.clear();
      this.pendingEvents = [];
      this.wrecks.clear();
      for (const w of f.w ?? []) this.wrecks.set(w.id, w);
      this.wreckListeners.forEach((l) => l([...this.wrecks.values()]));
    }

    for (const d of f.s ?? []) {
      const entity = this.entities.get(d.id);
      if (!entity) {
        // Entra en el área de interés: el servidor garantiza que viene completo
        const snap = d as ShipSnapshot;
        this.entities.set(d.id, { samples: [{ t: f.t, snap }], render: toRender(snap), removeAt: null });
        membershipChanged = true;
        continue;
      }
      entity.removeAt = null;
      const last = entity.samples[entity.samples.length - 1];
      // Estaba quieto (sin deltas): fija un punto de reposo justo antes para no deslizarse desde hace segundos
      if (f.t - last.t > this.snapshotInterval * 1.5) entity.samples.push({ t: f.t - this.snapshotInterval, snap: last.snap });
      entity.samples.push({ t: f.t, snap: { ...last.snap, ...d } });
      if (entity.samples.length > MAX_SAMPLES) entity.samples.splice(0, entity.samples.length - MAX_SAMPLES);
    }

    for (const id of f.r ?? []) {
      const entity = this.entities.get(id);
      if (entity) entity.removeAt = f.t;
    }

    for (const event of f.e ?? []) this.pendingEvents.push({ t: f.t, event });

    if (f.me) {
      this.player = f.me;
      this.playerListeners.forEach((l) => l(f.me!));
    }
    for (const n of f.n ?? []) this.noticeListeners.forEach((l) => l(n));
    if (membershipChanged) this.emitMembership();
    this.frameListeners.forEach((l) => l(f));
  }

  private emitMembership() {
    const list = this.shipList();
    this.membershipListeners.forEach((l) => l(list));
  }

  // Avanza la interpolación al instante actual y dispara los eventos que tocan. Llamar una vez por frame.
  update(nowMs: number): void {
    if (this.clockOffset === null) return;
    const renderTime = (nowMs - this.clockOffset) / 1000 - DELAY_S;

    if (this.pendingEvents.length > 0) {
      let i = 0;
      while (i < this.pendingEvents.length && this.pendingEvents[i].t - EVENT_LEAD_S <= renderTime) {
        this.dispatch(this.pendingEvents[i].event);
        i++;
      }
      if (i > 0) this.pendingEvents.splice(0, i);
    }

    let removed = false;
    for (const [id, entity] of this.entities) {
      if (entity.removeAt !== null && renderTime >= entity.removeAt) {
        this.entities.delete(id);
        removed = true;
        continue;
      }
      interpolate(entity, renderTime, nowMs);
    }
    if (removed) this.emitMembership();
  }

  private dispatch(event: GameEvent) {
    if (event.type === 'wreck') {
      this.wrecks.set(event.wreckId, { id: event.wreckId, x: event.pos.x, z: event.pos.z, gold: event.gold, expiresAt: event.expiresAt });
      this.wreckListeners.forEach((l) => l([...this.wrecks.values()]));
    } else if (event.type === 'wreckGone' && this.wrecks.delete(event.wreckId)) {
      this.wreckListeners.forEach((l) => l([...this.wrecks.values()]));
    }
    this.eventListeners.forEach((l) => l(event));
  }
}

function toRender(s: ShipSnapshot): RenderShip {
  return {
    id: s.id,
    kind: s.k,
    classId: s.c,
    name: s.n,
    ownerId: s.o,
    x: s.x,
    z: s.z,
    heading: s.h,
    speed: s.s,
    hp: s.hp,
    maxHp: s.mhp,
    state: s.st,
    targetId: s.t,
    repairing: s.r,
    protectedUntil: s.pu,
    sinkingSince: 0
  };
}

function interpolate(entity: Entity, renderTime: number, nowMs: number): void {
  const { samples, render } = entity;
  let a = samples[0];
  let b = a;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].t <= renderTime) {
      a = samples[i];
      b = samples[Math.min(i + 1, samples.length - 1)];
      break;
    }
  }
  const span = b.t - a.t;
  const k = span > 0 ? Math.min(1, Math.max(0, (renderTime - a.t) / span)) : 1;
  render.x = lerp(a.snap.x, b.snap.x, k);
  render.z = lerp(a.snap.z, b.snap.z, k);
  render.heading = lerpAngle(a.snap.h, b.snap.h, k);
  render.speed = lerp(a.snap.s, b.snap.s, k);
  // Campos discretos: los de la muestra ya alcanzada
  const s = k >= 1 ? b.snap : a.snap;
  render.name = s.n;
  render.classId = s.c;
  render.hp = s.hp;
  render.maxHp = s.mhp;
  render.targetId = s.t;
  render.repairing = s.r;
  render.protectedUntil = s.pu;
  if (s.st === 'sinking' && render.state !== 'sinking') render.sinkingSince = nowMs;
  if (s.st === 'alive') render.sinkingSince = 0;
  render.state = s.st;
}

// Cliente de red: envía intenciones e interpola los frames del servidor. No usa React: el render lo lee por frame.
// Los frames traen solo deltas (GDD §13); aquí se fusionan en muestras completas por entidad y se interpola
// con un retraso fijo. Si no llega nada, todo se queda quieto en su última muestra (sin extrapolar).
import { io, Socket } from 'socket.io-client';
import { INTERPOLATION_DELAY_MS, PlayerShipClass } from '../game/constants';
import { C2S, S2C } from '../game/protocol';
import { GameEvent, Notice, PlayerView, ServerFrame, ShipSnapshot, ShipState, Welcome, WreckView } from '../game/types';
import { lerp, lerpAngle } from '../game/vec';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'full' | 'kicked' | 'unauthorized' | 'load-failed';

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
  level: number | null; // nivel del jugador (1.1, `lv`): la insignia de la placa y del objetivo; null en los NPC
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
// AC-131: plazo de un reintento de carga. El servidor contesta en ≤ 3 s aunque la BD esté colgada; esto cubre el caso en
// que no contesta nada, para que «Reintentando…» no se quede para siempre
export const LOAD_RETRY_TIMEOUT_MS = 8000;
// DT-01 (GDD §5, regla de entrada): una intención de ataque o reparación queda pendiente hasta que el servidor la
// confirma o pasa este tiempo (si la rechaza, vuelve a mandar su estado). Cubre de sobra un RTT de Railway más un tick
const INTENT_TTL_MS = 1500;
const MAX_PENDING_INTENTS = 8;

interface Intent<T> {
  value: T;
  at: number; // performance.now() al enviarla
}

// Intenciones pendientes de un conmutador, en el orden en que se enviaron. Se confirman en ese orden: la de cabeza sale
// cuando el servidor muestra su valor o vence su plazo. Así, con «atacar» y «cancelar» seguidos, un frame viejo sin
// ataque no confirma la cancelación antes de que llegue el del ataque. El valor efectivo es la última intención
function settle<T>(pending: Intent<T>[], server: T, nowMs: number): T {
  while (pending.length > 0 && (pending[0].value === server || nowMs - pending[0].at > INTENT_TTL_MS)) pending.shift();
  return pending.length > 0 ? pending[pending.length - 1].value : server;
}
function push<T>(pending: Intent<T>[], value: T): void {
  pending.push({ value, at: performance.now() });
  if (pending.length > MAX_PENDING_INTENTS) pending.shift();
}

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
  private readonly targetIntents: Intent<string | null>[] = [];
  private readonly repairIntents: Intent<boolean>[] = [];
  private loadAttempt: { promise: Promise<boolean>; settle: (ok: boolean) => void } | null = null;

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
      // AC-131: durante un reintento de carga el overlay sigue («Reintentando…») hasta que llegue welcome o el fallo
      if (this.state !== 'load-failed') this.setState('connected');
      this.socket.emit(C2S.join, { name: this.options.name ?? undefined });
    });
    this.socket.on('disconnect', (reason) => {
      if (this.state === 'full' || this.state === 'kicked' || this.state === 'load-failed') return;
      // Desconexión iniciada por el servidor: Socket.IO no reintenta solo
      if (reason === 'io server disconnect') this.socket.connect();
      this.setState('reconnecting');
    });
    this.socket.on('connect_error', (err) => {
      if (err.message !== 'unauthorized') return;
      this.setState('unauthorized');
      this.settleLoad(false);
    });
    this.socket.io.on('reconnect_failed', () => {
      this.setState('failed');
      this.settleLoad(false);
    });

    this.socket.on(S2C.welcome, (w: Welcome) => {
      this.welcome = w;
      this.snapshotInterval = 1 / w.snapshotRate;
      this.clockOffset = performance.now() - w.time * 1000;
      this.welcomeListeners.forEach((l) => l(w));
      if (this.state === 'load-failed') this.setState('connected');
      this.settleLoad(true);
    });
    this.socket.on(S2C.frame, (f: ServerFrame) => this.receiveFrame(f));
    this.socket.on(S2C.full, () => {
      this.setState('full');
      this.socket.disconnect();
    });
    // AC-133: el overlay lo explica con los textos de D50; no hace falta además un toast detrás del velo
    this.socket.on(S2C.kicked, () => this.setState('kicked'));
    // AC-131: sin progreso no se entra al mundo ni se reintenta solo; lo decide el jugador con «Reintentar»
    this.socket.on(S2C.progressError, () => {
      this.setState('load-failed');
      this.settleLoad(false);
      this.socket.disconnect();
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

  // AC-131: un solo intento de carga a la vez. Se resuelve en true si entra al mundo (welcome) y en false si vuelve a
  // fallar, si el servidor no está o si vence el plazo
  retryLoad(): Promise<boolean> {
    if (this.loadAttempt) return this.loadAttempt.promise;
    let settle!: (ok: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => this.settleLoad(false), LOAD_RETRY_TIMEOUT_MS);
      settle = (ok) => {
        clearTimeout(timer);
        this.loadAttempt = null;
        resolve(ok);
      };
    });
    this.loadAttempt = { promise, settle };
    this.socket.connect();
    return promise;
  }

  private settleLoad(ok: boolean): void {
    this.loadAttempt?.settle(ok);
  }

  dispose(): void {
    this.settleLoad(false);
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
  // Una orden de navegación deja de reparar (GDD §8, world.ts moveTo): se apunta, para que el siguiente Reparar repare en
  // vez de leer el "reparando" viejo del servidor (H-21)
  moveTo(x: number, z: number): void {
    if (this.myRepairing()) push(this.repairIntents, false);
    this.socket.emit(C2S.moveTo, { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
  }
  stop(): void {
    this.socket.emit(C2S.stop);
  }
  // Atacar deja de reparar y reparar con el casco dañado anula el ataque (GDD §8, world.ts): la intención cruzada también
  // se apunta, para que el conmutador siguiente no lea el estado viejo del servidor (H-17). Con el casco entero el
  // servidor rechaza la reparación seguro: no se apunta nada, así que ni el HUD pasa por "reparando" ni el ataque se
  // anula mientras llega el rechazo (AC-128 c)
  attack(targetId: string): void {
    push(this.targetIntents, targetId);
    push(this.repairIntents, false);
    this.socket.emit(C2S.attack, { targetId });
  }
  cancelAttack(): void {
    push(this.targetIntents, null);
    this.socket.emit(C2S.cancelAttack);
  }
  repair(on: boolean): void {
    const own = this.latestOwn();
    const intact = !!own && own.hp >= own.mhp;
    if (!on || !intact) push(this.repairIntents, on);
    if (on && own && !intact) push(this.targetIntents, null);
    this.socket.emit(C2S.repair, { on });
  }

  // ---- Estado propio para los conmutadores (DT-01) ----
  // Atacar, Esc, Reparar y el HUD alternan sobre la última intención del jugador mientras el servidor no la confirma, y
  // si no hay ninguna pendiente, sobre el último estado recibido (sin el retraso de interpolación). El estado
  // interpolado llega 150–200 ms tarde: dos pulsaciones seguidas leían el mismo valor y repetían la intención
  myTargetId(nowMs = performance.now()): string | null {
    return settle(this.targetIntents, this.latestOwn()?.t ?? null, nowMs);
  }
  myRepairing(nowMs = performance.now()): boolean {
    return settle(this.repairIntents, this.latestOwn()?.r ?? false, nowMs);
  }
  private latestOwn(): ShipSnapshot | undefined {
    const samples = this.entities.get(this.myShipId ?? '')?.samples;
    return samples?.[samples.length - 1]?.snap;
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
  // Vista libre (E13): el centro de la vista mientras se desplaza (FreeView lo limita a 2/s) o null al volver al seguimiento
  viewAt(center: { x: number; z: number } | null): void {
    this.socket.emit(C2S.viewAt, center && { x: Math.round(center.x * 100) / 100, z: Math.round(center.z * 100) / 100 });
  }
  // El barco propio en el último estado recibido, sin el retraso de interpolación: la vista libre vuelve al seguimiento con
  // el daño, la muerte o la reaparición (AC-119)
  ownSample(): { hp: number; classId: string; state: ShipState } | null {
    const s = this.latestOwn();
    return s ? { hp: s.hp, classId: s.c, state: s.st } : null;
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
    sinkingSince: 0,
    level: s.lv ?? null
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
  render.level = s.lv ?? null;
  if (s.st === 'sinking' && render.state !== 'sinking') render.sinkingSince = nowMs;
  if (s.st === 'alive') render.sinkingSince = 0;
  render.state = s.st;
}

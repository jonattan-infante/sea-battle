// Bot del arnés de estrés (AC-142): un jugador por Socket.IO, con las mismas opciones de conexión que el navegador
// (src/client/game-client.ts), que solo usa el protocolo: elige objetivo con lo que recibe en los frames.
// - PvP: ataca al jugador atacable más cercano (los dos fuera de la zona segura y sin protección, GDD §7).
//   PvE: ataca al NPC vivo más cercano. Los dos navegan hacia su objetivo con un moveTo cada 1 ± 0,5 s.
// - Reparan por debajo del 40 % de vida hasta el 80 % (el de PvP, nunca mientras pelea contra un jugador). Hundidos,
//   zarpan al acabar la cuenta atrás. Con ≥ 300 de oro vuelven al puerto y compran lo más barato que puedan pagar.
// - Una parada medida por minuto: stop, espera a velocidad 0 y moveTo (el único moveTo con observable, AC-14 b).
// Cada orden medida (attack, repair, respawn, buy y el moveTo de la parada) va sola en vuelo y se cierra con el primer
// frame que la refleja (respondida), con un aviso del servidor (rechazada por una regla) o, pasado 1 s, como perdida. Un
// attack sin reflejo queda anulado solo si el primer frame tras el envío ya muestra una condición con la que una regla lo
// termina sin aviso (O1 de AC-142, `cancelReason`); un moveTo o un repair, si el barco se hunde antes (caso b2, O-27), y
// un respawn o un buy, nunca. Una cubeta local igual a la del servidor (AC-06) marca las órdenes que la excederían:
// serían culpa del bot, no del servidor
import { performance } from 'perf_hooks';
import { io, Socket } from 'socket.io-client';
import { ATTACK_MAX_DISTANCE, INTENT_BURST, INTENT_RATE_PER_SECOND, MAX_UPGRADE_LEVEL, PIRATE_SECTORS, PORT_POSITION, SAFE_ZONE_RADIUS, SHIP_CLASSES, UPGRADE_LEVELS, UpgradeId } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import type { Notice, PlayerView, ServerFrame, ShipSnapshot, Welcome } from '../../src/game/types';
import { createRng, distance, headingTo, Vec2 } from '../../src/game/vec';

export type Role = 'pvp' | 'pve';
export type MeasuredKind = 'attack' | 'repair' | 'respawn' | 'buy' | 'moveTo';
export type Outcome = 'respondida' | 'rechazada' | 'perdida' | 'anulada' | 'excede-cubeta';

export interface OrderRecord {
  kind: MeasuredKind;
  at: number; // ms desde el inicio de la corrida (performance.now() − t0)
  outcome: Outcome;
  latencyMs?: number;
  reason?: string;
}

export interface BotConfig {
  index: number;
  url: string;
  name: string;
  userId: string; // el ownerId con el que el servidor lo identifica (server/auth.ts)
  auth: Record<string, unknown>;
  role: Role;
  seed: number;
  t0: number;
}

const DECIDE_MS = 250;
const LOST_AFTER_MS = 1000; // AC-142: sin reflejo en ≤ 1 s, perdida
const MOVE_EVERY_MS = 1000;
const MOVE_JITTER_MS = 500; // 1 ± 0,5 s
const STOP_EVERY_MS = 60_000;
const STOP_TIMEOUT_MS = 6000;
const ATTACK_RANGE = 180; // el ataque termina a más de 200 m (AC-34): solo se ordena por debajo
const CHASE_DISTANCE = 35; // dentro del alcance de los cañones de 8 libras (60 m)
const CHASE_OUTSIDE_ZONE = SAFE_ZONE_RADIUS + 15; // contra un jugador se persigue desde fuera de la zona segura, con margen
const REPAIR_BELOW = 0.4;
const REPAIR_UNTIL = 0.8;
const BUY_FROM_GOLD = 300;
const PORT: Vec2 = PORT_POSITION;

// Avisos de error del servidor (src/game/world.ts, server/game-server.ts) y a qué órdenes medidas responden
const REJECTIONS: [RegExp, MeasuredKind[]][] = [
  [/^Tu barco no está a flote$/, ['attack', 'repair', 'buy', 'moveTo']],
  [/^No puedes atacar ese objetivo$/, ['attack']],
  [/^El casco ya está intacto$/, ['repair']],
  [/^Aún no puedes zarpar$|^Tu barco está a flote$|^Jugador desconocido$/, ['respawn']],
  [/^El astillero solo abre en el puerto$|^Primero necesitas el nivel anterior$|^Ya tienes ese barco$|^Necesitas \d+ de oro$|^Compra en curso$|^La tienda no está disponible/, ['buy']]
];

interface Pending {
  kind: MeasuredKind;
  at: number;
  targetId?: string;
  repairWas?: boolean;
  item?: string;
  cancelReason?: string | null; // attack: lo que mostró el primer frame tras el envío (undefined: aún no llegó)
}

type ShopChoice = { itemId: string; price: number };

// Lo más barato que puede pagar (mejoras al nivel siguiente y barcos que no tiene)
export function cheapestAffordable(me: Pick<PlayerView, 'gold' | 'upgrades' | 'ownedShips'>): ShopChoice | null {
  const options: ShopChoice[] = [];
  for (const up of Object.keys(UPGRADE_LEVELS) as UpgradeId[]) {
    const next = me.upgrades[up] + 1;
    if (next <= MAX_UPGRADE_LEVEL) options.push({ itemId: `${up}:${next}`, price: UPGRADE_LEVELS[up].prices[next - 1] });
  }
  for (const cls of ['brig', 'frigate'] as const) if (!me.ownedShips.includes(cls)) options.push({ itemId: `ship:${cls}`, price: SHIP_CLASSES[cls].price });
  const affordable = options.filter((o) => o.price <= me.gold).sort((a, b) => a.price - b.price);
  return affordable[0] ?? null;
}

export function hasItem(me: Pick<PlayerView, 'upgrades' | 'ownedShips'>, itemId: string): boolean {
  const [kind, value] = itemId.split(':');
  if (kind === 'ship') return me.ownedShips.includes(value as PlayerView['ownedShips'][number]);
  return me.upgrades[kind as UpgradeId] >= Number(value);
}

export class Bot {
  role: Role;
  private socket: Socket | null = null;
  private welcome: Welcome | null = null;
  private shipId: string | null = null;
  private readonly ships = new Map<string, ShipSnapshot>();
  me: PlayerView | null = null;
  private minOffset: number | null = null;
  private pending: Pending | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private readonly rng: () => number;
  private nextMoveAt = 0;
  private nextStopAt = Infinity;
  private stopPhase: 'braking' | 'moving' | null = null;
  private stopStartedAt = 0;
  private roamTarget: Vec2 | null = null;
  private buying: string | null = null;
  homing = false;
  quiet = false; // control de ruido (AC-142): conectado y quieto en el puerto, sin enviar nada
  private tokens = INTENT_BURST;
  private tokensAt = 0;

  // Medidas, con su instante en ms desde t0 para que el orquestador las reparta por minuto
  readonly orders: OrderRecord[] = [];
  readonly framesAt: number[] = []; // llegada de cada frame
  readonly frameBytes: number[] = []; // bytes de cada frame, como AC-88: JSON.stringify([evento, frame]) + 2
  readonly volleysAt: number[] = [];
  readonly pvpDeathsAt: number[] = []; // hundido por un jugador (lo cuenta la víctima)
  readonly npcKillsAt: number[] = []; // NPC hundido por este bot (lo cuenta quien hunde)
  readonly purchasesAt: number[] = [];
  readonly unsavedAt: number[] = [];
  readonly disconnects: { at: number; reason: string }[] = [];
  readonly ruleRejections: Record<string, number> = {}; // avisos de órdenes de carga (objetivo protegido, etc.)
  readonly connectErrors: string[] = [];
  overBucket = 0;
  readonly sentAt: number[] = []; // cada orden emitida, medida o de carga
  joinMs: number | null = null;
  welcomes = 0;
  private connectAt = 0;

  constructor(private readonly cfg: BotConfig) {
    this.role = cfg.role;
    this.rng = createRng(cfg.seed);
  }

  get name(): string {
    return this.cfg.name;
  }

  get userId(): string {
    return this.cfg.userId;
  }

  get joined(): boolean {
    return this.welcome !== null;
  }

  // En el puerto y parado: listo para comparar su fila de la BD con el último frame
  get home(): boolean {
    const own = this.own();
    return !!own && own.st === 'alive' && distance(own, PORT) <= SAFE_ZONE_RADIUS - 20 && own.s === 0;
  }

  private since(now = performance.now()): number {
    return now - this.cfg.t0;
  }

  private serverNow(now = performance.now()): number {
    return this.minOffset === null ? 0 : (now - this.minOffset) / 1000;
  }

  start(): void {
    this.connectAt = performance.now();
    this.tokensAt = this.connectAt;
    const socket = io(this.cfg.url, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
      randomizationFactor: 0,
      auth: this.cfg.auth
    });
    this.socket = socket;
    socket.on('connect', () => socket.emit(C2S.join, { name: this.cfg.name }));
    socket.on('disconnect', (reason) => {
      if (this.stopping) return;
      this.disconnects.push({ at: this.since(), reason });
      if (this.pending) this.settle('anulada', undefined, 'desconectado');
      if (reason === 'io server disconnect') socket.connect(); // como el navegador: Socket.IO no reintenta solo
    });
    socket.on('connect_error', (err) => this.connectErrors.push(err.message));
    socket.on(S2C.welcome, (w: Welcome) => {
      this.welcomes++;
      this.welcome = w;
      this.shipId = w.shipId;
      this.joinMs ??= performance.now() - this.connectAt;
    });
    socket.on(S2C.frame, (f: ServerFrame) => this.onFrame(f));
    socket.on(S2C.kicked, () => this.disconnects.push({ at: this.since(), reason: 'kicked' }));
    socket.on(S2C.full, () => this.disconnects.push({ at: this.since(), reason: 'servidor lleno' }));
    socket.on(S2C.progressError, () => this.disconnects.push({ at: this.since(), reason: 'progressError' }));
    socket.connect();
    this.timer = setInterval(() => this.decide(), DECIDE_MS);
  }

  // La parada medida de cada minuto empieza en un instante al azar del primer minuto
  armStops(): void {
    this.nextStopAt = performance.now() + this.rng() * STOP_EVERY_MS;
  }

  setRole(role: Role): void {
    this.role = role;
    this.roamTarget = null;
  }

  stop(): void {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.pending) this.settle('anulada', undefined, 'fin de la corrida');
    this.socket?.disconnect();
  }

  // ---- Frames ----

  private onFrame(f: ServerFrame): void {
    const now = performance.now();
    const at = this.since(now);
    this.framesAt.push(at);
    this.frameBytes.push(JSON.stringify([S2C.frame, f]).length + 2);
    const offset = now - f.t * 1000;
    this.minOffset = this.minOffset === null ? offset : Math.min(this.minOffset, offset);

    const prevOwn = this.own();
    const prev = prevOwn ? { ...prevOwn } : undefined;
    // Los eventos se leen con los barcos del frame anterior: el que se hunde sigue en el mapa
    for (const e of f.e ?? []) {
      if (e.type === 'volley' && e.shipId === this.shipId) this.volleysAt.push(at);
      if (e.type !== 'sunk') continue;
      const victim = this.ships.get(e.shipId);
      const killer = e.byShipId ? this.ships.get(e.byShipId) : undefined;
      if (e.shipId === this.shipId && killer?.k === 'player') this.pvpDeathsAt.push(at);
      if (e.byShipId === this.shipId && victim && victim.k !== 'player') this.npcKillsAt.push(at);
    }
    if (f.full) this.ships.clear();
    for (const d of f.s ?? []) {
      const known = this.ships.get(d.id);
      this.ships.set(d.id, known ? { ...known, ...d } : (d as ShipSnapshot));
    }
    for (const id of f.r ?? []) this.ships.delete(id);
    if (f.me) {
      this.me = f.me;
      if (f.me.unsaved) this.unsavedAt.push(at);
    }
    this.resolve(now, prev, this.own(), f);
    for (const n of f.n ?? []) if (n.kind === 'error') this.onError(n);
  }

  private own(): ShipSnapshot | undefined {
    return this.shipId ? this.ships.get(this.shipId) : undefined;
  }

  private resolve(now: number, prev: ShipSnapshot | undefined, next: ShipSnapshot | undefined, f: ServerFrame): void {
    const p = this.pending;
    if (!p) return;
    const ms = now - p.at;
    switch (p.kind) {
      case 'attack':
        if (next?.t === p.targetId) this.settle('respondida', ms);
        else if (p.cancelReason === undefined) p.cancelReason = this.cancelReason(p.targetId!, next, f.t);
        return; // sin reflejo, se decide pasado 1 s (expire)
      case 'repair':
        if (next && next.r !== p.repairWas) this.settle('respondida', ms);
        break;
      case 'moveTo':
        if (next && next.s > 0) this.settle('respondida', ms);
        break;
      case 'respawn':
        if ((f.me && f.me.death === null) || (next?.st === 'alive' && prev?.st !== 'alive')) this.settle('respondida', ms);
        break;
      case 'buy':
        if (f.me && hasItem(f.me, p.item!)) {
          this.settle('respondida', ms);
          this.purchasesAt.push(this.since(now));
          this.buying = null;
        }
        return; // la compra se aplica aunque el barco se esté hundiendo
    }
    // Caso (b2) de AC-142 (O-27): un barco hundido no navega ni repara. No vale para respawn, que sale con el barco
    // hundido: sin reflejo es perdido
    const sinkable = p.kind === 'moveTo' || p.kind === 'repair';
    if (sinkable && this.pending && next && next.st !== 'alive') this.settle('anulada', undefined, 'barco hundido');
  }

  // Con una sola orden medida en vuelo, el aviso es suyo si es de su tipo; si no, es de una orden de carga
  private onError(n: Notice): void {
    const kinds = REJECTIONS.find(([re]) => re.test(n.text))?.[1] ?? [];
    if (this.pending && kinds.includes(this.pending.kind)) {
      const kind = this.pending.kind;
      this.settle('rechazada', performance.now() - this.pending.at, n.text);
      if (kind === 'buy') this.buying = null;
      return;
    }
    this.ruleRejections[n.text] = (this.ruleRejections[n.text] ?? 0) + 1;
  }

  private settle(outcome: Outcome, latencyMs?: number, reason?: string): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.orders.push({ kind: p.kind, at: this.since(p.at), outcome, latencyMs, reason });
  }

  // ---- Órdenes ----

  // Cubeta local, la misma que la del servidor (server/game-server.ts): false si la orden la excedería
  private takeToken(now: number): boolean {
    this.tokens = Math.min(INTENT_BURST, this.tokens + ((now - this.tokensAt) / 1000) * INTENT_RATE_PER_SECOND);
    this.tokensAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private emit(event: string, payload: unknown, measured: Omit<Pending, 'at'> | null): void {
    const now = performance.now();
    const ok = this.takeToken(now);
    if (!ok) this.overBucket++;
    this.sentAt.push(this.since(now));
    if (payload === undefined) this.socket!.emit(event);
    else this.socket!.emit(event, payload);
    if (!measured) return;
    if (!ok) {
      this.orders.push({ kind: measured.kind, at: this.since(now), outcome: 'excede-cubeta' });
      return;
    }
    this.pending = { ...measured, at: now };
  }

  private moveTo(target: Vec2, measured = false): void {
    const payload = { x: Math.round(target.x * 100) / 100, z: Math.round(target.z * 100) / 100 };
    this.emit(C2S.moveTo, payload, measured ? { kind: 'moveTo' } : null);
    this.nextMoveAt = performance.now() + MOVE_EVERY_MS + (this.rng() * 2 - 1) * MOVE_JITTER_MS;
  }

  private expire(now: number): void {
    if (!this.pending || now - this.pending.at <= LOST_AFTER_MS) return;
    if (this.pending.cancelReason) this.settle('anulada', undefined, this.pending.cancelReason);
    else this.settle('perdida');
  }

  // O1 (AC-142): condiciones, comprobables con el primer frame tras el envío, con las que el servidor acepta el attack y
  // una regla de AC-34 o AC-93 lo termina en el tick siguiente sin aviso (world.ts:685; O-26). null: ninguna, y entonces
  // un attack sin reflejo es perdido
  private cancelReason(targetId: string, own: ShipSnapshot | undefined, t: number): string | null {
    const target = this.ships.get(targetId);
    if (!target) return 'el objetivo salió del mundo o del área de interés';
    if (target.st !== 'alive') return 'el objetivo está hundido o hundiéndose';
    if (!own || own.st !== 'alive') return 'el atacante está hundido';
    if (target.k === 'player' && distance(target, PORT) <= SAFE_ZONE_RADIUS) return 'el objetivo está en la zona segura';
    if (target.k === 'player' && target.pu > t) return 'el objetivo está protegido';
    if (target.k === 'player' && distance(own, PORT) <= SAFE_ZONE_RADIUS) return 'el atacante está en la zona segura';
    if (distance(own, target) > ATTACK_MAX_DISTANCE) return 'están a más de 200 m';
    return null;
  }

  // ---- Comportamiento (como mucho una orden por decisión: ≤ 4/s, y en la práctica 1–2/s) ----

  private decide(): void {
    if (!this.welcome || this.stopping || this.quiet || !this.socket?.connected) return;
    const now = performance.now();
    this.expire(now);
    if (this.me?.death) {
      if (!this.pending && this.serverNow(now) >= this.me.death.respawnAt + 0.1) this.emit(C2S.respawn, undefined, { kind: 'respawn' });
      return;
    }
    const own = this.own();
    if (!own || own.st !== 'alive') return;
    if (this.homing) return this.goHome(own, now);
    if (this.measuredStop(own, now)) return;

    const hp = own.hp / own.mhp;
    const target = this.pickTarget(own, now);
    const fightingPlayer = this.role === 'pvp' && !!own.t && this.ships.get(own.t)?.k === 'player';
    if (own.r) {
      // Reparando hasta el 80 %. El de PvP responde si un jugador le ataca (atacar cancela la reparación)
      const attacker = this.role === 'pvp' ? [...this.ships.values()].find((s) => s.k === 'player' && s.t === own.id && s.st === 'alive') : undefined;
      if (attacker && this.canAttackNow(own, attacker, now)) return this.attack(attacker);
      if (hp >= REPAIR_UNTIL && this.pending?.kind !== 'repair' && now >= this.nextMoveAt) this.moveTo(this.roam(own)); // navegar deja de reparar
      return;
    }
    if (hp < REPAIR_BELOW && !fightingPlayer) {
      if (!this.pending) this.emit(C2S.repair, { on: true }, { kind: 'repair', repairWas: own.r });
      return;
    }
    // Compras: con ≥ 300 de oro y sin un objetivo atacado, al puerto
    if (!this.buying && this.me && this.me.gold >= BUY_FROM_GOLD && !own.t) this.buying = cheapestAffordable(this.me)?.itemId ?? null;
    if (this.buying) {
      if (distance(own, PORT) <= SAFE_ZONE_RADIUS - 10) {
        if (!this.pending) this.emit(C2S.buy, { itemId: this.buying }, { kind: 'buy', item: this.buying });
        return;
      }
      if (now >= this.nextMoveAt) this.moveTo(towards(PORT, own, 60));
      return;
    }
    if (target) {
      if (own.t !== target.id && distance(own, target) <= ATTACK_RANGE && this.canAttackNow(own, target, now)) return this.attack(target);
      if (now >= this.nextMoveAt) this.moveTo(chasePoint(own, target));
      return;
    }
    if (now >= this.nextMoveAt) this.moveTo(this.roam(own));
  }

  // Con un attack medido en vuelo no se repite: un duplicado que llegase taparía la pérdida del primero (el mutante M2 del
  // arnés lo enseñó: con el 20 % de las órdenes descartadas salían 0 perdidas y respuestas de 285 ms). Con una reparación
  // medida en vuelo tampoco: atacar la desharía antes de verla
  private attack(target: ShipSnapshot): void {
    if (this.pending?.kind === 'repair' || this.pending?.kind === 'attack') return;
    this.emit(C2S.attack, { targetId: target.id }, this.pending ? null : { kind: 'attack', targetId: target.id });
  }

  // El servidor solo deja atacar a un jugador si los dos están fuera de la zona segura y sin protección (canAttack)
  private canAttackNow(own: ShipSnapshot, target: ShipSnapshot, now: number): boolean {
    if (target.k !== 'player') return true;
    const t = this.serverNow(now);
    return distance(own, PORT) > SAFE_ZONE_RADIUS && distance(target, PORT) > SAFE_ZONE_RADIUS && own.pu <= t && target.pu <= t;
  }

  private pickTarget(own: ShipSnapshot, now: number): ShipSnapshot | undefined {
    const t = this.serverNow(now);
    const alive = [...this.ships.values()].filter((s) => s.st === 'alive' && s.id !== own.id);
    const candidates =
      this.role === 'pvp'
        ? alive.filter((s) => s.k === 'player' && s.o !== this.cfg.userId && distance(s, PORT) > SAFE_ZONE_RADIUS && s.pu <= t)
        : alive.filter((s) => s.k === 'pirate' || s.k === 'merchant');
    let best: ShipSnapshot | undefined;
    for (const s of candidates) if (!best || distance(own, s) < distance(own, best)) best = s;
    return best;
  }

  // Sin objetivo: el de PvP recorre el anillo de fuera de la zona segura; el de PvE, su sector pirata
  private roam(own: ShipSnapshot): Vec2 {
    if (!this.roamTarget || distance(own, this.roamTarget) < 20) {
      const a = this.rng() * Math.PI * 2;
      if (this.role === 'pvp') {
        const r = SAFE_ZONE_RADIUS + 25 + this.rng() * 80;
        this.roamTarget = { x: Math.sin(a) * r, z: Math.cos(a) * r };
      } else {
        const s = PIRATE_SECTORS[(this.cfg.index - 1) % PIRATE_SECTORS.length];
        const q = (Math.PI / 2) * (0.15 + this.rng() * 0.7);
        const r = 260 + this.rng() * 120;
        this.roamTarget = { x: s.sx * Math.sin(q) * r, z: s.sz * Math.cos(q) * r };
      }
    }
    return this.roamTarget;
  }

  // Parada medida: stop, espera a velocidad 0 y moveTo; el primer frame con velocidad > 0 la refleja (AC-14 b)
  private measuredStop(own: ShipSnapshot, now: number): boolean {
    if (this.stopPhase === 'braking') {
      if (own.s === 0) {
        if (!this.pending) {
          this.moveTo(this.roam(own), true);
          this.stopPhase = 'moving';
        }
      } else if (now - this.stopStartedAt > STOP_TIMEOUT_MS) this.stopPhase = null;
      return true;
    }
    if (this.stopPhase === 'moving') {
      if (this.pending?.kind === 'moveTo') return true;
      this.stopPhase = null;
      return false;
    }
    if (now >= this.nextStopAt && !this.pending && !own.r && !this.buying) {
      this.emit(C2S.stop, undefined, null);
      this.stopPhase = 'braking';
      this.stopStartedAt = now;
      this.nextStopAt += STOP_EVERY_MS;
      return true;
    }
    return false;
  }

  // Fin de la corrida: todos al puerto (en la zona segura nadie les ataca) para comparar la BD con el último frame
  private goHome(own: ShipSnapshot, now: number): void {
    if (distance(own, PORT) <= SAFE_ZONE_RADIUS - 20) {
      if (own.s > 0 && now >= this.nextMoveAt) {
        this.emit(C2S.stop, undefined, null);
        this.nextMoveAt = now + 2000;
      }
      return;
    }
    if (now >= this.nextMoveAt) this.moveTo(towards(PORT, own, 50));
  }
}

// A 35 m del objetivo, en la recta hacia el bot. Contra un jugador, nunca dentro de la zona segura: desde dentro no se
// puede atacar y, con el objetivo pegado al borde, ese punto caía dentro y el bot se quedaba parado allí minutos enteros
// (AC-142: un 25 % del tiempo de los bots en la corrida de diagnóstico). Si cae dentro, se saca sobre la recta del puerto
function chasePoint(own: Vec2, target: ShipSnapshot): Vec2 {
  const p = towards(target, own, CHASE_DISTANCE);
  if (target.k !== 'player' || distance(p, PORT) >= CHASE_OUTSIDE_ZONE) return p;
  const from = distance(p, PORT) > 1 ? p : target;
  const k = CHASE_OUTSIDE_ZONE / distance(from, PORT);
  return { x: PORT.x + (from.x - PORT.x) * k, z: PORT.z + (from.z - PORT.z) * k };
}

// Punto a `gap` m de `to`, en la recta hacia `from`
function towards(to: Vec2, from: Vec2, gap: number): Vec2 {
  const a = headingTo(to, from);
  return { x: to.x + Math.sin(a) * gap, z: to.z + Math.cos(a) * gap };
}

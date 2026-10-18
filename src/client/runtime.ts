// Runtime de render en el navegador: escena imperativa de three.js (océano, islas, barcos y VFX), cámara,
// picking en pantalla y capas DOM. Todo se actualiza desde un único useFrame (FrameDriver, prioridad −1),
// sin estado de React por frame (CLAUDE.md, regla 3). Fuentes: ART-DIRECTION, ASSET-SPEC y VFX-SPEC.
import * as THREE from 'three';
import type { RootState } from '@react-three/fiber';
import { CANNON_LEVELS, INTERPOLATION_DELAY_MS, MAX_CANNON_RANGE, ISLANDS, PORT_POSITION, PVP_ENABLED, SAFE_ZONE_RADIUS, SHIP_CLASSES, SINKING_TIME } from '../game/constants';
import { Navigator } from '../game/nav';
import { GameEvent, PlayerView, Welcome, WreckView } from '../game/types';
import { CAMERA, computePpm0, DAMAGE_TEXT, DamageTextKind, frameRangeM, LABEL, LIGHTING, MOBILE_MAX_WIDTH, RING_COLORS, ZOOM } from './art';
import { ChipHost, EdgeChipLayer } from './edge-chip-layer';
import { Attack, AttackerTracker } from './edge-chips';
import { FreeView, OwnWatch, ViewMode } from './free-view';
import type { GameClient, RenderShip } from './game-client';
import { useHud } from './hud-store';
import { buildBuoyGeometry, buildIslands, buildLootGeometry, buildPalmGeometry, buoyInstances, PropInstance } from './models/island-geometry';
import { createOceanGeometry, createOceanMaterial } from './models/ocean-material';
import { measureSailVisibility, measureShipValues, SailVisibility, ShipValues } from './models/sail-visibility';
import { createShipMaterial, LOD_PX, ShipMaterial, ShipModel } from './models/ship-geometry';
import { setShipMap, ShipGlbStore } from './models/ship-glb';
import { FloatingTextLayer, LabelLayer, LabelTarget, OverlayHost, ReloadState, ScreenPoint } from './overlays';
import { DAMAGE_FX, Effects, RENDER_ORDER, rgba } from './vfx/effects';
import { makeRing, RING_MODE, RingSpec } from './vfx/rings';
import { VolleyRandom, volleySide } from './vfx/volley';
import { damageScene, galleryScene, heroScene, SceneName, showcaseScene, standardScene, SyntheticSource } from './synthetic-scene';

const deg = Math.PI / 180;
const CAM_RIGHT = new THREE.Vector3(1, 0, 0); // guiñada 0: derecha en pantalla = +X
const SINK_MS = SINKING_TIME * 1000;
const LOOT_CAPACITY = 32;
const FLIGHT_CAPACITY = 96;
const EMERGE_MS = 600;
const SIDES = [1, -1] as const;
const VIEW_MARGIN = 30; // m: un emisor fuera del suelo visible + 30 m no emite (VFX §0.1)

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeInCubic = (t: number) => t * t * t;
const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export interface ClickMarker {
  x: number; // destino ajustado (punto navegable)
  z: number;
  clickX: number;
  clickZ: number;
  adjusted: boolean;
  start: number; // ms
  endAt: number; // ms en que empezó a encogerse (0 = activo)
}

// Lo que el render lee de los datos del juego. Lo cumple el GameClient real y la escena sintética de QA
// (capturas de la landing y escena estándar de 41 barcos), que además puede fijar el foco de la cámara.
export interface RenderSource {
  readonly myShipId: string | null;
  readonly player: PlayerView | null;
  readonly welcome: Welcome | null;
  readonly focus?: { x: number; z: number } | null;
  update(nowMs: number): void;
  serverTime(nowMs?: number): number;
  getShip(id: string | null | undefined): RenderShip | undefined;
  onMembership(l: (list: RenderShip[]) => void): () => void;
  onWrecks(l: (list: WreckView[]) => void): () => void;
  onEvent(l: (e: GameEvent) => void): () => void;
}

export type CameraPreset = 'game' | 'presentation';

// ART-DIRECTION §16.1: cámara de presentación para las capturas de la landing
const PRESENTATION = { elevation: 40 * deg, zoom: 1.6 };

export interface RenderInfo {
  calls: number;
  triangles: number;
}

// AD-27 (D42): pase de solo océano para medir la espuma y reproducir cada píxel fuera del navegador (scripts/ad27/)
export interface OceanPass {
  png: string; // data URL del canvas: sin HUD ni placas, que son DOM
  time: number; // uTime fijado (s)
  pxW: number;
  pxH: number;
  ppm: number;
  corners: { x: number; z: number }[]; // agua bajo las esquinas: arriba izq., arriba der., abajo izq., abajo der.
  uniforms: Record<string, unknown>; // uniforms del océano en valores planos (vectores y colores lineales → arrays)
}

const plainUniform = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(plainUniform) : v instanceof THREE.Color ? [v.r, v.g, v.b] : v && typeof (v as THREE.Vector4).toArray === 'function' ? (v as THREE.Vector4).toArray() : v;

// Estado de render de un barco (malla propia, material propio, temporizadores de efectos)
interface ShipView extends LabelTarget {
  id: string;
  model: ShipModel;
  mesh: THREE.Mesh<THREE.BufferGeometry, ShipMaterial>;
  lod: 0 | 1;
  phase: number;
  smoke: boolean;
  fire: boolean;
  smokeAcc: number;
  fireAcc: number;
  coreAcc: number;
  emberAcc: number;
  repairAcc: number;
  chipAcc: number;
  wakeDist: number;
  wakeCount: number;
  lastX: number;
  lastZ: number;
  hitAt: number;
  lastDamagedAt: number;
  heel: number; // −1 o +1: banda del último impacto
  emergeAt: number;
  sinkFx: boolean;
  sinkRingAcc: number;
  sprayAcc: number;
  debris: boolean;
  fireUnder: [boolean, boolean, boolean];
  shieldEnd: number; // ms en que terminó la protección (para el desvanecido)
  wasProtected: boolean;
  lastHp: number;
  repairGain: number;
  repairClock: number;
  smokeSlot: boolean;
  fireSlot: boolean;
}

interface VolleyRecord {
  shooterId: string;
  targetId: string;
  hits: number;
  arrivedHit: boolean;
  arrivedAny: boolean;
  impact: { damage: number; hits: number } | null;
  shown: boolean;
  expires: number; // s del reloj de VFX
  hitIndex: number;
}

interface Flight {
  active: boolean;
  fired: boolean;
  volley: VolleyRecord | null;
  shooterId: string;
  targetId: string;
  start: number; // s (reloj de VFX)
  duration: number;
  hit: boolean;
  side: 1 | -1;
  cannon: number;
  mine: boolean; // la dispara o la recibe el jugador propio
  mx: number; my: number; mz: number; // boca del cañón al disparar
  ox: number; oy: number; oz: number; // impacto: local del casco (acierto) u offset de mundo (fallo)
  tx: number; tz: number; // última posición conocida del objetivo
  arc: number;
  trailAt: number;
}

interface WreckState {
  id: string;
  x: number;
  z: number;
  seenAt: number; // ms
  goneAt: number; // ms (0 = activo)
  expiresAt: number; // tiempo de servidor (s) en que desaparece (D4)
  seed: number;
  sparkleAcc: number;
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_MAX_WIDTH || window.matchMedia?.('(pointer: coarse)').matches === true;
}

// ---- VfxDirector: traduce eventos del servidor en efectos y emite los efectos continuos ----
export class VfxDirector {
  private readonly flights: Flight[] = [];
  private readonly volleys: VolleyRecord[] = [];
  private readonly v = new THREE.Vector3();
  private readonly fireCandidates: ShipView[] = [];
  private readonly smokeCandidates: ShipView[] = [];
  // Orden por distancia al centro de la pantalla (los topes de humo y fuego); creado una vez, sin asignar por frame
  private readonly byFocus = (a: ShipView, b: ShipView) =>
    Math.hypot(a.ship.x - this.rt.focusX, a.ship.z - this.rt.focusZ) - Math.hypot(b.ship.x - this.rt.focusX, b.ship.z - this.rt.focusZ);
  private readonly random = new VolleyRandom(); // reparto sembrado de cada andanada (D3)

  constructor(private readonly rt: GameRuntime) {
    for (let i = 0; i < FLIGHT_CAPACITY; i++) {
      this.flights.push({
        active: false, fired: false, volley: null, shooterId: '', targetId: '', start: 0, duration: 0, hit: false, side: 1, cannon: 0,
        mine: false, mx: 0, my: 0, mz: 0, ox: 0, oy: 0, oz: 0, tx: 0, tz: 0, arc: 1.5, trailAt: 0
      });
    }
  }

  // Al cambiar de fuente: las balas en vuelo y las andanadas pendientes pertenecen a la anterior
  reset(): void {
    for (const f of this.flights) f.active = false;
    this.volleys.length = 0;
  }

  onEvent(e: GameEvent): void {
    const rt = this.rt;
    const now = performance.now();
    switch (e.type) {
      case 'volley':
        this.volley(e);
        break;
      case 'impact': {
        const target = rt.view(e.shipId);
        const shooter = rt.src.getShip(e.byShipId);
        if (target) {
          target.lastDamagedAt = now;
          if (shooter) {
            // Escora hacia la banda del último impacto: +X local (babor) en el mundo = (cos h, −sin h)
            const s = target.ship;
            const port = (shooter.x - s.x) * Math.cos(s.heading) - (shooter.z - s.z) * Math.sin(s.heading);
            target.heel = port > 0 ? -1 : 1;
          }
        }
        const record = this.volleys.find((r) => !r.impact && r.shooterId === e.byShipId && r.targetId === e.shipId);
        if (record) {
          record.impact = { damage: e.damage, hits: e.hits };
          if (record.hits > 0 ? record.arrivedHit : record.arrivedAny) this.showNumber(record);
        } else {
          // Andanada anterior a nuestra llegada al área: el número sale ya
          this.showNumber({ shooterId: e.byShipId, targetId: e.shipId, hits: e.hits, arrivedHit: true, arrivedAny: true, impact: { damage: e.damage, hits: e.hits }, shown: false, expires: 0, hitIndex: 0 });
        }
        break;
      }
      case 'respawn': {
        const view = rt.view(e.shipId);
        if (view) {
          view.emergeAt = now;
          if (rt.inView(view.ship.x, view.ship.z) || e.shipId === rt.src.myShipId) rt.effects.respawn(view.ship.x, view.ship.z, view.length);
        }
        if (e.shipId === rt.src.myShipId) rt.clearClickMarker();
        break;
      }
      case 'loot': {
        const myPlayer = rt.src.player?.id ?? rt.src.welcome?.playerId;
        if (e.source === 'wreck' && rt.inView(e.pos.x, e.pos.z)) rt.effects.lootPickup(e.pos.x, e.pos.z);
        if (e.playerId === myPlayer) rt.floating?.spawn('gold', `+${e.gold} ◉`, e.pos.x, 4, e.pos.z, `gold:${e.pos.x}:${e.pos.z}`, now);
        break;
      }
      // «+30 XP» (VFX-SPEC §9, D70): sale con el oro de la misma recompensa, en la misma pasada y con su misma clave, así que
      // empieza 18 px más arriba (la regla de los 250 ms). Solo llega a quien la recibe y nunca con 0 (xp.ts)
      case 'xp': {
        const myPlayer = rt.src.player?.id ?? rt.src.welcome?.playerId;
        if (e.playerId === myPlayer) rt.floating?.spawn('xp', `+${e.xp} XP`, e.pos.x, 4, e.pos.z, `gold:${e.pos.x}:${e.pos.z}`, now);
        break;
      }
      default:
        break;
    }
  }

  private volley(e: Extract<GameEvent, { type: 'volley' }>): void {
    const rt = this.rt;
    const myId = rt.src.myShipId;
    const shooter = rt.view(e.shipId);
    const target = rt.view(e.targetId);
    const t = rt.effects.time;
    if (e.shipId === myId) rt.onOwnVolley();
    const record: VolleyRecord = {
      shooterId: e.shipId, targetId: e.targetId, hits: e.hits, arrivedHit: false, arrivedAny: false, impact: null, shown: false,
      expires: t + e.duration + e.cannons * 0.045 + 1.5, hitIndex: 0
    };
    this.volleys.push(record);
    if (this.volleys.length > 64) this.volleys.shift();
    const mine = e.shipId === myId || e.targetId === myId;
    // Banda (VFX §1, D3) y azar sembrado con shipId + from/to: todos los clientes ven el mismo reparto
    const sx = shooter?.ship.x ?? e.from.x;
    const sz = shooter?.ship.z ?? e.from.z;
    const side = volleySide(e, shooter?.ship.heading ?? 0);
    const rand = this.random.seed(e);
    const sockets = shooter ? (side === 1 ? shooter.model.sockets.cannonsPort : shooter.model.sockets.cannonsStbd) : [];
    const count = Math.max(1, Math.min(e.cannons, sockets.length || e.cannons));
    const hitMask = rand.hitMask(count, e.hits);
    const d = Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z);
    const tModel = target?.model;
    for (let k = 0; k < count; k++) {
      const f = this.flights.find((x) => !x.active) ?? this.oldestFlight();
      f.active = true;
      f.fired = false;
      f.volley = record;
      f.shooterId = e.shipId;
      f.targetId = e.targetId;
      f.start = t + k * 0.045; // 45 ms de desfase del cañón 01 (popa) al N (proa)
      f.duration = e.duration;
      f.hit = (hitMask & (1 << k)) !== 0;
      f.side = side;
      f.cannon = k;
      f.mine = mine;
      f.tx = target?.ship.x ?? e.to.x;
      f.tz = target?.ship.z ?? e.to.z;
      f.mx = e.from.x;
      f.my = 1.2;
      f.mz = e.from.z;
      f.arc = Math.max(1.5, Math.min(5, 0.06 * d));
      f.trailAt = 0;
      if (f.hit) {
        // Punto aleatorio dentro de la elipse del casco (0,6·L/2 × 0,6·B/2) a 0,6·F, en coordenadas del casco
        const L = tModel?.recipe.L ?? 20;
        const B = tModel?.recipe.B ?? 5;
        const a = rand.next() * Math.PI * 2;
        const r = Math.sqrt(rand.next());
        f.ox = Math.cos(a) * r * 0.3 * B;
        f.oz = Math.sin(a) * r * 0.3 * L;
        f.oy = 0.6 * (tModel?.recipe.F ?? 1.6);
      } else {
        // Fallo: en el agua, del lado del tirador (±60°) a [0,5·sb_radius + 2, sb_radius + 4] m del centro
        const R = tModel?.extras.sb_radius ?? 10;
        const toShooter = Math.atan2(sx - f.tx, sz - f.tz) + (rand.next() * 2 - 1) * 60 * deg;
        const dist = 0.5 * R + 2 + rand.next() * (0.5 * R + 2);
        f.ox = Math.sin(toShooter) * dist;
        f.oz = Math.cos(toShooter) * dist;
        f.oy = 0;
      }
    }
  }

  private oldestFlight(): Flight {
    let oldest = this.flights[0];
    for (const f of this.flights) if (f.start < oldest.start) oldest = f;
    return oldest;
  }

  private showNumber(r: VolleyRecord): void {
    if (r.shown || !r.impact) return;
    r.shown = true;
    const rt = this.rt;
    const myId = rt.src.myShipId;
    const target = rt.view(r.targetId);
    if (!target) return;
    const s = target.ship;
    const label = target.model.sockets.label;
    const now = performance.now();
    const mineShot = r.shooterId === myId;
    const mineHit = r.targetId === myId;
    if (r.impact.hits === 0 || r.impact.damage <= 0) {
      // "Fallo" solo si el tirador o el objetivo es el jugador propio (GDD §14)
      if (mineShot || mineHit) rt.floating?.spawn('miss', 'Fallo', s.x, label.y, s.z, r.targetId, now);
      return;
    }
    let kind: DamageTextKind = 'others';
    if (mineShot) kind = r.impact.damage >= DAMAGE_TEXT.heavyRatio * s.maxHp ? 'heavy' : 'dealt';
    else if (mineHit) kind = 'taken';
    rt.floating?.spawn(kind, `−${r.impact.damage}`, s.x, label.y, s.z, r.targetId, now);
  }

  // Por frame: balas en vuelo
  updateFlights(now: number): void {
    const rt = this.rt;
    const fx = rt.effects;
    const t = fx.time;
    const balls = fx.balls;
    balls.begin();
    const trails = !rt.mobile && !rt.lowQuality;
    for (const f of this.flights) {
      if (!f.active || t < f.start) continue;
      const target = rt.view(f.targetId);
      if (target && target.ship.state !== 'dead') {
        f.tx = target.ship.x;
        f.tz = target.ship.z;
      }
      if (!f.fired) {
        f.fired = true;
        this.fire(f);
      }
      // Punto de impacto que sigue la posición interpolada actual del objetivo
      let ix: number;
      let iz: number;
      const iy = f.oy;
      if (f.hit && target) {
        const h = target.ship.heading;
        ix = f.tx + f.ox * Math.cos(h) + f.oz * Math.sin(h);
        iz = f.tz - f.ox * Math.sin(h) + f.oz * Math.cos(h);
      } else {
        ix = f.tx + f.ox;
        iz = f.tz + f.oz;
      }
      const s = (t - f.start) / f.duration;
      if (s >= 1) {
        f.active = false;
        this.arrive(f, ix, iy, iz, target, now);
        continue;
      }
      const lift = 4 * f.arc * s * (1 - s);
      const x = f.mx + (ix - f.mx) * s;
      const y = f.my + (iy - f.my) * s + lift;
      const z = f.mz + (iz - f.mz) * s;
      const shadowPx = 6 * (1 - 0.5 * (lift / f.arc));
      balls.push(x, y, z, shadowPx / rt.ppm, 0.35 * Math.max(0, 1 - y / 8));
      if (trails && f.mine && t - f.trailAt >= 0.06) {
        f.trailAt = t;
        fx.ballTrail(x, y, z);
      }
    }
    balls.end((rt.mobile ? 6 : 7) / rt.ppm, CAM_RIGHT, rt.camUp);
    // Andanadas cuyo impacto no llegó (objetivo protegido o hundido): se descartan
    while (this.volleys.length > 0 && this.volleys[0].expires < t) this.volleys.shift();
  }

  private fire(f: Flight): void {
    const rt = this.rt;
    const shooter = rt.view(f.shooterId);
    if (!shooter) return;
    const sockets = f.side === 1 ? shooter.model.sockets.cannonsPort : shooter.model.sockets.cannonsStbd;
    const socket = sockets[Math.min(f.cannon, sockets.length - 1)];
    if (socket) {
      this.v.copy(socket).applyMatrix4(shooter.mesh.matrix);
      f.mx = this.v.x;
      f.my = this.v.y;
      f.mz = this.v.z;
    }
    if (!f.mine && !rt.inView(f.mx, f.mz)) return;
    const h = shooter.ship.heading;
    const dx = f.side * Math.cos(h);
    const dz = -f.side * Math.sin(h);
    rt.effects.muzzle(f.mx, f.my, f.mz, dx, dz, shooter.model.recipe.cannonScale);
  }

  private arrive(f: Flight, x: number, y: number, z: number, target: ShipView | undefined, now: number): void {
    const rt = this.rt;
    const record = f.volley;
    const visible = f.mine || rt.inView(x, z);
    if (f.hit && target) {
      const index = record ? record.hitIndex++ : 0;
      if (visible) {
        rt.effects.impact(x, Math.max(y, 0.5), z, index);
        rt.vfxCounters.hits++;
      }
      target.hitAt = now;
      if (target.id === rt.src.myShipId) rt.shake(now);
    } else if (visible) {
      rt.effects.splash(x, z);
      rt.vfxCounters.splashes++;
    }
    if (!record) return;
    record.arrivedAny = true;
    if (f.hit) record.arrivedHit = true;
    if (record.impact && (record.hits > 0 ? record.arrivedHit : record.arrivedAny)) this.showNumber(record);
  }

  // Por frame: estela, espuma de contacto, humo y fuego, reparación y hundimiento
  updateShips(now: number, dt: number): void {
    const rt = this.rt;
    const fx = rt.effects;
    // Móvil y calidad baja (§0.4): tasas × 0,5 y estela × 0,7, salvo el humo y el fuego de vida baja, que van con la
    // tasa y la vida completas (D32); a cambio, humo en ≤ 12 barcos y fuego en ≤ 4
    const low = rt.mobile || rt.lowQuality;
    const rate = low ? 0.5 : 1;
    const lifeScale = rt.mobile ? 0.7 : 1;
    const contact = fx.contact;
    contact.begin();

    // Humo y fuego en los barcos más cercanos al centro de la pantalla: fuego ≤ 8 (4) y humo sin tope (≤ 12)
    const maxFire = DAMAGE_FX.fireShips[low ? 1 : 0];
    const maxSmoke = DAMAGE_FX.smokeShips[low ? 1 : 0];
    const cands = this.fireCandidates;
    const smokers = this.smokeCandidates;
    cands.length = 0;
    smokers.length = 0;
    for (const view of rt.views.values()) {
      view.fireSlot = false;
      view.smokeSlot = false;
      const s = view.ship;
      const ratio = s.maxHp > 0 ? s.hp / s.maxHp : 1;
      if (view.fire) {
        if (ratio > 0.28 && s.state === 'alive') view.fire = false;
      } else if (ratio <= 0.25 && s.state === 'alive') view.fire = true;
      if (view.smoke) {
        if (ratio > 0.53 && s.state === 'alive') view.smoke = false;
      } else if (ratio <= 0.5 && s.state === 'alive') view.smoke = true;
      if (view.fire && s.state !== 'dead') cands.push(view);
      if (view.smoke && s.state !== 'dead') smokers.push(view);
    }
    if (cands.length > maxFire) cands.sort(this.byFocus);
    for (let i = 0; i < Math.min(maxFire, cands.length); i++) cands[i].fireSlot = true;
    if (smokers.length > maxSmoke) smokers.sort(this.byFocus);
    for (let i = 0; i < Math.min(maxSmoke, smokers.length); i++) smokers[i].smokeSlot = true;

    for (const view of rt.views.values()) {
      const s = view.ship;
      const r = view.model.recipe;
      const mine = view.id === rt.src.myShipId;
      const shown = mine || rt.inView(s.x, s.z);

      if (s.state === 'alive' || s.state === 'sinking') {
        const vmax = SHIP_CLASSES[view.model.classId]?.maxSpeed ?? 10;
        const sinkK = s.state === 'sinking' ? clamp01((now - s.sinkingSince) / SINK_MS) : 0;
        contact.push(s.x, s.z, s.heading, 1.4 * r.B, 1.1 * r.L, (0.22 + 0.13 * clamp01(s.speed / vmax)) * (1 - sinkK));
      }

      // Estela por distancia recorrida (densidad constante)
      const moved = Math.hypot(s.x - view.lastX, s.z - view.lastZ);
      view.lastX = s.x;
      view.lastZ = s.z;
      if (s.state === 'alive' && s.speed > 0.6 && moved < 20) {
        view.wakeDist += moved;
        const step = Math.max(1.5, 0.06 * r.L);
        const vmax = SHIP_CLASSES[view.model.classId]?.maxSpeed ?? 10;
        const f = Math.max(0.3, Math.min(1, s.speed / vmax));
        while (view.wakeDist >= step) {
          view.wakeDist -= step;
          if (!shown) continue;
          const fw = Math.sin(s.heading);
          const fz = Math.cos(s.heading);
          fx.wakeStern(s.x - fw * r.L / 2, s.z - fz * r.L / 2, s.heading, r.B, f, lifeScale);
          view.wakeCount++;
          if (view.wakeCount % 2 === 0) {
            for (const side of SIDES) {
              const bx = s.x + fw * r.L / 2 + Math.cos(s.heading) * side * r.B / 2;
              const bz = s.z + fz * r.L / 2 - Math.sin(s.heading) * side * r.B / 2;
              fx.wakeBow(bx, bz, s.heading, r.B, s.speed, f, side, lifeScale);
            }
          }
        }
      } else {
        view.wakeDist = 0;
      }

      // Humo (≤ 50 %) y fuego (≤ 25 %) con histéresis; siguen encendidos mientras se hunde
      const dense = view.fire;
      if (view.smoke && view.smokeSlot && s.state !== 'dead' && shown) {
        // 3/s (≤ 50 %) o 6/s denso (≤ 25 %) con vida 3,4 s: ≤ 11 y ≤ 21 vivas por barco (VFX §6, D20), también en móvil
        view.smokeAcc += dt * (dense ? DAMAGE_FX.denseSmokeRate : DAMAGE_FX.smokeRate);
        while (view.smokeAcc >= 1) {
          view.smokeAcc -= 1;
          // La misma tasa en cada socket de humo: el segundo, solo en la Cañonera (VFX §6, D25)
          for (const p of [view.model.sockets.smoke, view.model.sockets.smoke2]) {
            if (!p) continue;
            this.v.copy(p).applyMatrix4(view.mesh.matrix);
            if (this.v.y > 0) fx.damageSmoke(this.v.x, this.v.y, this.v.z, dense, view.model.extras.sb_mast_height);
          }
        }
      }
      if (view.fire && view.fireSlot && shown) {
        const ratio = s.hp / Math.max(1, s.maxHp);
        const sockets = ratio <= 0.12 ? DAMAGE_FX.fireSockets : 2;
        // Por socket: 12 cuerpos de llama/s (P_ALPHA), 6 núcleos/s y 2 brasas/s (P_ADD); vivos ≤ 20, ≤ 8 y ≤ 7 (D21)
        view.fireAcc += dt * DAMAGE_FX.flameRate;
        view.coreAcc += dt * DAMAGE_FX.coreRate;
        view.emberAcc += dt * DAMAGE_FX.emberRate;
        while (view.fireAcc >= 1 || view.coreAcc >= 1 || view.emberAcc >= 1) {
          const kind = view.fireAcc >= 1 ? 0 : view.coreAcc >= 1 ? 1 : 2;
          if (kind === 0) view.fireAcc -= 1;
          else if (kind === 1) view.coreAcc -= 1;
          else view.emberAcc -= 1;
          for (let i = 0; i < sockets; i++) {
            if (view.fireUnder[i]) continue;
            this.v.copy(view.model.sockets.fire[i]).applyMatrix4(view.mesh.matrix);
            if (this.v.y <= 0) continue;
            if (kind === 0) fx.flame(this.v.x, this.v.y, this.v.z, s.heading, r.L, r.B);
            else if (kind === 1) fx.flameCore(this.v.x, this.v.y, this.v.z, r.L);
            else fx.ember(this.v.x, this.v.y, this.v.z);
          }
        }
      }

      // Reparación (VFX §13): cruces y virutas desde la cubierta; bajo fuego, tasas × 0,5
      if (s.state === 'alive' && s.repairing) {
        const k = now - view.lastDamagedAt < 3000 ? 0.5 : 1;
        view.repairAcc += dt * 3 * rate * k;
        view.chipAcc += dt * 2 * rate * k;
        while (view.repairAcc >= 1) {
          view.repairAcc -= 1;
          if (shown) {
            this.deckPoint(view);
            fx.repairCross(this.v.x, this.v.y, this.v.z);
          }
        }
        while (view.chipAcc >= 1) {
          view.chipAcc -= 1;
          if (shown) {
            this.deckPoint(view);
            fx.repairChip(this.v.x, this.v.y, this.v.z);
          }
        }
        // "+N" de reparación propia cada 1 s
        if (mine) {
          if (s.hp > view.lastHp) view.repairGain += s.hp - view.lastHp;
          view.repairClock += dt;
          if (view.repairClock >= 1) {
            view.repairClock = 0;
            if (view.repairGain > 0) rt.floating?.spawn('repair', `+${Math.round(view.repairGain)}`, s.x, view.model.sockets.label.y, s.z, `${view.id}:repair`, now);
            view.repairGain = 0;
          }
        }
      } else {
        view.repairGain = 0;
        view.repairClock = 0;
      }
      view.lastHp = s.hp;

      this.sinking(view, now, dt, shown);
    }
    contact.end();
  }

  // Punto aleatorio de la cubierta en coordenadas de mundo (queda en this.v)
  private deckPoint(view: ShipView): void {
    const r = view.model.recipe;
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random());
    this.v.set(Math.cos(a) * d * 0.3 * r.B, r.F + 0.4, Math.sin(a) * d * 0.35 * r.L).applyMatrix4(view.mesh.matrix);
  }

  // VFX §7: impacto inicial a 1,5×, ondas de espuma, rocío, vapor al sumergirse el fuego y restos a 2,6 s
  private sinking(view: ShipView, now: number, dt: number, shown: boolean): void {
    const s = view.ship;
    const fx = this.rt.effects;
    if (s.state !== 'sinking') {
      if (s.state === 'alive') {
        view.sinkFx = false;
        view.debris = false;
        view.fireUnder[0] = view.fireUnder[1] = view.fireUnder[2] = false;
      }
      return;
    }
    const r = view.model.recipe;
    const elapsed = now - s.sinkingSince;
    if (elapsed > SINK_MS + 200 || s.sinkingSince === 0) return;
    if (!view.sinkFx) {
      view.sinkFx = true;
      view.sinkRingAcc = 0;
      view.sprayAcc = 0;
      if (shown) fx.impact(s.x, 0.6 * r.F, s.z, 0, 1.5);
      if (view.id === this.rt.src.myShipId) this.rt.clearClickMarker();
    }
    if (!shown) return;
    view.sinkRingAcc += dt;
    while (view.sinkRingAcc >= 0.4) {
      view.sinkRingAcc -= 0.4;
      fx.sinkRing(s.x, s.z, r.L);
    }
    view.sprayAcc += dt;
    while (view.sprayAcc >= 0.1) {
      view.sprayAcc -= 0.1;
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const lx = Math.cos(a) * r.B / 2;
        const lz = Math.sin(a) * r.L / 2;
        fx.spray(s.x + lx * Math.cos(s.heading) + lz * Math.sin(s.heading), s.z - lx * Math.sin(s.heading) + lz * Math.cos(s.heading));
      }
    }
    if (view.fire) {
      for (let i = 0; i < 3; i++) {
        if (view.fireUnder[i]) continue;
        this.v.copy(view.model.sockets.fire[i]).applyMatrix4(view.mesh.matrix);
        if (this.v.y < 0) {
          view.fireUnder[i] = true;
          fx.steam(this.v.x, 0.3, this.v.z);
        }
      }
    }
    if (!view.debris && elapsed >= 2600) {
      view.debris = true;
      fx.debris(s.x, s.z, r.L);
    }
  }
}

// ---- GameRuntime ----
export class GameRuntime implements OverlayHost, ChipHost {
  readonly client: GameClient;
  src: RenderSource; // de dónde lee el render: el cliente real o una escena sintética
  readonly scene = new THREE.Group();
  readonly effects: Effects;
  readonly mobile: boolean;
  readonly renderInfo: RenderInfo = { calls: 0, triangles: 0 };
  readonly views = new Map<string, ShipView>();
  // GLB de las clases (ASSET-SPEC §13): el procedural se pinta mientras carga y si falla
  readonly shipGlb = new ShipGlbStore();
  hoverId: string | null = null;
  clickMarker: ClickMarker | null = null;
  labels: LabelLayer | null = null;
  floating: FloatingTextLayer | null = null;
  chips: EdgeChipLayer | null = null; // indicadores de borde (E13, §12.8)
  private readonly attackTracker = new AttackerTracker(); // quién te dispara (AC-124)
  lowQuality = false;

  // Cámara
  viewW = 0;
  viewH = 0;
  ppm = 5;
  private ppm0 = 5;
  // Encuadre por alcance (§6.2, U8): R aplicado, transición de ppm₀ al cambiar de cañón y si R ya salió del jugador
  private frameRange = 0;
  private frameFromPlayer = false;
  private sceneCannonLevel = 1;
  private ppm0From = 5;
  private ppm0To = 5;
  private ppm0Start = -Infinity;
  private level: number = ZOOM.defaultLevel;
  private zoomFrom: number = ZOOM.levels[ZOOM.defaultLevel];
  private zoomStart = -Infinity;
  private camReady = false;
  focusX: number = PORT_POSITION.x;
  focusZ: number = PORT_POSITION.z;
  readonly freeView: FreeView; // vista libre (E13): el foco cuando la cámara no sigue al barco
  private readonly stopViewReturn: () => void;
  private lookX = 0;
  private lookY = 0;
  private lookZ = 0;
  private shakeAt = -Infinity;
  camera: THREE.OrthographicCamera | null = null; // lectura para QA (AD-05)
  preset: CameraPreset = 'game';
  sinT = Math.sin(CAMERA.elevation);
  cosT = Math.cos(CAMERA.elevation);
  readonly camUp = new THREE.Vector3(0, this.cosT, -this.sinT); // arriba en pantalla = −Z y +Y
  private gl: THREE.WebGLRenderer | null = null;
  private rootScene: THREE.Scene | null = null;

  // Escena estática
  private readonly ocean: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly staticMaterial: THREE.MeshStandardMaterial;
  private readonly islandMesh: THREE.Mesh;
  private readonly palms: THREE.InstancedMesh;
  private readonly buoys: THREE.InstancedMesh;
  private readonly loot: THREE.InstancedMesh;
  private readonly wrecks = new Map<string, WreckState>();

  private readonly director: VfxDirector;
  private readonly navigator = new Navigator(ISLANDS);
  private readonly materialPool: ShipMaterial[] = [];
  private readonly unsubscribe: (() => void)[] = [];
  private readonly reducedMotionQuery: MediaQueryList | null;
  private t0 = performance.now(); // origen del reloj de animación y de VFX (se desplaza lo que dure una pausa de QA)
  private pausedAt = 0;
  private lastVolleyAt = -Infinity;
  private readonly reloadState: ReloadState = { visible: false, progress: 1, ready: false, flash: false };
  private infoAt = 0;
  private slowFor = 0;
  private fastFor = 0;
  private baseDpr = 0;
  private dprOverride = false;
  private paused = false;
  // AC-75: salpicaduras por bala fallada e impactos en casco emitidos (los que se ven: en pantalla o propios)
  readonly vfxCounters = { splashes: 0, hits: 0 };
  private readonly ring: RingSpec = makeRing();
  private readonly ringColor = new Float32Array(4);
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p3 = new THREE.Vector3();
  private readonly s3 = new THREE.Vector3();
  private readonly pt: ScreenPoint = { sx: 0, sy: 0 };
  private readonly hull = new Float32Array(16);
  private readonly hullIdx: number[] = [0, 1, 2, 3, 4, 5, 6, 7];
  private readonly hullOut: number[] = [];

  constructor(client: GameClient) {
    this.client = client;
    this.src = client;
    // Los viewAt solo salen con el cliente real (no con las escenas sintéticas de QA); el botón Centrar lee el modo del store
    this.freeView = new FreeView(
      (center) => {
        if (this.src === this.client) this.client.viewAt(center);
      },
      (free) => useHud.getState().setFreeView(free)
    );
    // AC-119: el daño propio, la muerte o la reaparición devuelven la cámara al barco. Se mira al recibir cada frame del
    // servidor (fuera del bucle de render), con el último estado y sin el retraso de interpolación. Una andanada contra el
    // barco propio también, aunque falle (producto, 2026-10-18): así el chip de atacante nunca sale en vista libre
    const own = new OwnWatch();
    own.next(client.ownSample());
    const stopFrames = client.onFrame(() => {
      if (own.next(client.ownSample())) this.freeView.returnToFollow(performance.now());
    });
    const stopVolleys = client.onEvent((e) => {
      if (e.type === 'volley' && e.targetId === client.myShipId) this.freeView.returnToFollow(performance.now());
    });
    this.stopViewReturn = () => {
      stopFrames();
      stopVolleys();
    };
    this.mobile = isMobileDevice();
    this.reducedMotionQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.effects = new Effects(this.mobile);

    this.ocean = new THREE.Mesh(createOceanGeometry(), createOceanMaterial(ISLANDS));
    this.ocean.renderOrder = RENDER_ORDER.ocean;
    this.ocean.frustumCulled = false;

    this.staticMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    const islands = buildIslands(ISLANDS);
    this.islandMesh = new THREE.Mesh(islands.geometry, this.staticMaterial);
    this.islandMesh.renderOrder = RENDER_ORDER.islands;
    this.palms = this.instanced(buildPalmGeometry(), islands.palms);
    this.buoys = this.instanced(buildBuoyGeometry(), buoyInstances());
    this.loot = new THREE.InstancedMesh(buildLootGeometry(), this.staticMaterial, LOOT_CAPACITY);
    this.loot.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.loot.count = 0;
    this.loot.frustumCulled = false;
    this.loot.renderOrder = RENDER_ORDER.islands;
    this.scene.add(this.ocean, this.islandMesh, this.palms, this.buoys, this.loot, this.effects.group);

    this.director = new VfxDirector(this);
    this.subscribe(client);
  }

  private subscribe(src: RenderSource): void {
    this.unsubscribe.push(
      src.onMembership((list) => this.syncShips(list)),
      src.onWrecks((list) => this.syncWrecks(list)),
      src.onEvent((e) => {
        this.director.onEvent(e);
        if (e.type === 'volley') this.attackTracker.volley(e.shipId, e.targetId, src.myShipId, performance.now());
        else if (e.type === 'impact') this.attackTracker.impact(e.shipId, e.byShipId, e.damage, src.myShipId, performance.now());
      })
    );
  }

  // Cambia la fuente de datos del render (cliente real ↔ escena sintética) sin recrear la escena
  private setSource(src: RenderSource): void {
    this.unsubscribe.forEach((u) => u());
    this.unsubscribe.length = 0;
    for (const view of this.views.values()) {
      this.scene.remove(view.mesh);
      this.materialPool.push(view.mesh.material);
    }
    this.views.clear();
    this.wrecks.clear();
    this.director.reset();
    this.attackTracker.clear();
    this.clickMarker = null;
    this.hoverId = null;
    this.src = src;
    this.subscribe(src);
    this.labels?.sync(this.views.values());
    this.snapFrame();
  }

  private instanced(geometry: THREE.BufferGeometry, items: PropInstance[]): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, this.staticMaterial, Math.max(1, items.length));
    items.forEach((p, i) => {
      this.e.set(0, p.rotY, 0);
      this.q.setFromEuler(this.e);
      mesh.setMatrixAt(i, this.m4.compose(this.p3.set(p.x, p.y, p.z), this.q, this.s3.setScalar(p.scale)));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.renderOrder = RENDER_ORDER.islands;
    return mesh;
  }

  // ---- API pública ----
  get zoomLevel(): number {
    return this.level;
  }

  get reducedMotion(): boolean {
    return this.reducedMotionQuery?.matches ?? false;
  }

  setZoomLevel(level: number): void {
    const next = Math.max(0, Math.min(ZOOM.levels.length - 1, level));
    if (next === this.level) return;
    this.zoomFrom = this.currentZoomFactor(performance.now());
    this.zoomStart = performance.now();
    this.level = next;
  }

  // +1 = más lejos (más extensión visible), −1 = más cerca
  zoomBy(step: number): void {
    this.setZoomLevel(this.level + step);
  }

  // Proyección a px CSS del canvas (null antes del primer frame)
  project(x: number, z: number): { sx: number; sy: number } | null {
    if (!this.camReady) return null;
    this.projectInto(x, 0, z, this.pt);
    return { sx: this.pt.sx, sy: this.pt.sy };
  }

  projectInto(x: number, y: number, z: number, out: ScreenPoint): void {
    const dx = x - this.lookX;
    const dy = y - this.lookY;
    const dz = z - this.lookZ;
    out.sx = this.viewW / 2 + dx * this.ppm;
    out.sy = this.viewH / 2 - (dy * this.cosT - dz * this.sinT) * this.ppm;
  }

  // Un desplazamiento de pantalla (px CSS) en metros del agua: para arrastrar la vista libre
  screenDeltaToWorld(dx: number, dy: number): { x: number; z: number } {
    return { x: dx / this.ppm, z: dy / (this.ppm * this.sinT) };
  }

  // Punto del agua (y = 0) bajo un punto de pantalla
  screenToWorld(sx: number, sy: number): { x: number; z: number } | null {
    if (!this.camReady) return null;
    const x = this.lookX + (sx - this.viewW / 2) / this.ppm;
    const z = this.lookZ + ((sy - this.viewH / 2) / this.ppm - this.lookY * this.cosT) / this.sinT;
    return { x, z };
  }

  // Rectángulo de agua visible (para el minimapa)
  viewRect(): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    if (!this.camReady) return null;
    const hw = this.viewW / (2 * this.ppm);
    const hh = this.viewH / (2 * this.ppm * this.sinT);
    return { minX: this.focusX - hw, maxX: this.focusX + hw, minZ: this.focusZ - hh, maxZ: this.focusZ + hh };
  }

  inView(x: number, z: number): boolean {
    const hw = this.viewW / (2 * this.ppm) + VIEW_MARGIN;
    const hh = this.viewH / (2 * this.ppm * this.sinT) + VIEW_MARGIN;
    return Math.abs(x - this.focusX) <= hw && Math.abs(z - this.focusZ) <= hh;
  }

  view(id: string | null | undefined): ShipView | undefined {
    return id ? this.views.get(id) : undefined;
  }

  myShipId(): string | null {
    return this.src.myShipId;
  }

  focusId(): string | null {
    const selected = useHud.getState().selectedId;
    if (selected) return selected;
    return this.src.getShip(this.src.myShipId)?.targetId ?? null;
  }

  serverTime(): number {
    return this.src.serverTime();
  }

  // Lo que necesitan los indicadores de borde (ChipHost)
  ship(id: string): RenderShip | undefined {
    return this.src.getShip(id);
  }

  viewCenter(): { x: number; z: number } {
    return { x: this.focusX, z: this.focusZ };
  }

  viewMode(): ViewMode {
    return this.freeView.mode;
  }

  attackers(now: number): readonly Attack[] {
    return this.attackTracker.active(now);
  }

  reload(): ReloadState {
    return this.reloadState;
  }

  onOwnVolley(): void {
    this.lastVolleyAt = performance.now();
  }

  shake(now: number): void {
    if (!this.reducedMotion) this.shakeAt = now;
  }

  // Marcador de destino local e inmediato (AC-14): se ajusta con la misma función pura de la simulación
  placeClickMarker(x: number, z: number): ClickMarker | null {
    const me = this.src.getShip(this.src.myShipId);
    if (!me || me.state !== 'alive') return null;
    const radius = SHIP_CLASSES[me.classId]?.radius ?? 5;
    const dest = this.navigator.nearestNavigable({ x, z }, radius);
    this.clickMarker = {
      x: dest.x,
      z: dest.z,
      clickX: x,
      clickZ: z,
      adjusted: Math.hypot(dest.x - x, dest.z - z) > 1,
      start: performance.now(),
      endAt: 0
    };
    return this.clickMarker;
  }

  clearClickMarker(): void {
    this.clickMarker = null;
  }

  // Picking en pantalla: silueta proyectada (caja sb_pick) + 12 px (24 px en táctil); gana la más cercana al cursor
  pick(sx: number, sy: number, touch: boolean): string | null {
    if (!this.camReady) return null;
    const pad = touch ? 24 : 12;
    const myId = this.src.myShipId;
    let best: string | null = null;
    let bestD = Infinity;
    let bestC = Infinity;
    for (const view of this.views.values()) {
      const s = view.ship;
      if (view.id === myId || s.state !== 'alive' || !view.mesh.visible) continue;
      const d = this.silhouetteDistance(view, sx, sy);
      if (d > pad) continue;
      this.projectInto(s.x, 0, s.z, this.pt);
      const c = Math.hypot(this.pt.sx - sx, this.pt.sy - sy);
      if (d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && c < bestC)) {
        best = view.id;
        bestD = d;
        bestC = c;
      }
    }
    return best;
  }

  // Distancia en px del cursor a la silueta proyectada (envolvente convexa de la caja sb_pick); 0 si está dentro
  private silhouetteDistance(view: ShipView, sx: number, sy: number): number {
    const s = view.ship;
    const [hx, hy, hz] = view.model.extras.sb_pick;
    const c = Math.cos(s.heading);
    const sn = Math.sin(s.heading);
    const pts = this.hull;
    for (let i = 0; i < 8; i++) {
      const lx = i & 1 ? hx : -hx;
      const ly = i & 2 ? hy : 0;
      const lz = i & 4 ? hz : -hz;
      this.projectInto(s.x + lx * c + lz * sn, ly + view.mesh.position.y, s.z - lx * sn + lz * c, this.pt);
      pts[i * 2] = this.pt.sx;
      pts[i * 2 + 1] = this.pt.sy;
    }
    const idx = this.hullIdx;
    for (let i = 0; i < 8; i++) idx[i] = i;
    for (let i = 1; i < 8; i++) {
      const k = idx[i];
      let j = i - 1;
      while (j >= 0 && (pts[idx[j] * 2] > pts[k * 2] || (pts[idx[j] * 2] === pts[k * 2] && pts[idx[j] * 2 + 1] > pts[k * 2 + 1]))) {
        idx[j + 1] = idx[j];
        j--;
      }
      idx[j + 1] = k;
    }
    const cross = (o: number, a: number, b: number) =>
      (pts[a * 2] - pts[o * 2]) * (pts[b * 2 + 1] - pts[o * 2 + 1]) - (pts[a * 2 + 1] - pts[o * 2 + 1]) * (pts[b * 2] - pts[o * 2]);
    const out = this.hullOut;
    out.length = 0;
    for (let i = 0; i < 8; i++) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], idx[i]) <= 0) out.pop();
      out.push(idx[i]);
    }
    const lower = out.length + 1;
    for (let i = 6; i >= 0; i--) {
      while (out.length >= lower && cross(out[out.length - 2], out[out.length - 1], idx[i]) <= 0) out.pop();
      out.push(idx[i]);
    }
    out.pop();
    let inside = true;
    let sign = 0;
    let min = Infinity;
    for (let k = 0; k < out.length; k++) {
      const ax = pts[out[k] * 2];
      const ay = pts[out[k] * 2 + 1];
      const bx = pts[out[(k + 1) % out.length] * 2];
      const by = pts[out[(k + 1) % out.length] * 2 + 1];
      const cr = (bx - ax) * (sy - ay) - (by - ay) * (sx - ax);
      if (cr !== 0) {
        if (sign === 0) sign = Math.sign(cr);
        else if (Math.sign(cr) !== sign) inside = false;
      }
      const ex = bx - ax;
      const ey = by - ay;
      const len2 = ex * ex + ey * ey;
      const u = len2 > 0 ? clamp01(((sx - ax) * ex + (sy - ay) * ey) / len2) : 0;
      min = Math.min(min, Math.hypot(ax + ex * u - sx, ay + ey * u - sy));
    }
    return inside ? 0 : min;
  }

  updateHover(sx: number, sy: number): string | null {
    this.hoverId = this.mobile ? null : this.pick(sx, sy, false);
    return this.hoverId;
  }

  clearHover(): void {
    this.hoverId = null;
  }

  // Cursor sobre un barco (ART-DIRECTION §12.7): mira si es atacable, not-allowed si no
  canAttack(id: string): boolean {
    const me = this.src.getShip(this.src.myShipId);
    const target = this.src.getShip(id);
    if (!me || !target || me.state !== 'alive' || target.state !== 'alive' || me.id === target.id) return false;
    if (target.kind !== 'player') return true;
    const now = this.src.serverTime();
    const safe = (s: RenderShip) => Math.hypot(s.x - PORT_POSITION.x, s.z - PORT_POSITION.z) <= SAFE_ZONE_RADIUS;
    return PVP_ENABLED && !safe(target) && !safe(me) && target.protectedUntil <= now && me.protectedUntil <= now;
  }

  attachOverlays(labels: HTMLElement, floating: HTMLElement, chips: HTMLElement): void {
    this.detachOverlays();
    this.labels = new LabelLayer(labels, this);
    this.floating = new FloatingTextLayer(floating, this);
    // El chip propio centra como C (AC-119) y el de atacante lo selecciona como Tab, sin mover la cámara (§12.8)
    this.chips = new EdgeChipLayer(chips, this, {
      onSelf: () => this.freeView.returnToFollow(performance.now()),
      onAttacker: (id) => useHud.getState().select(id)
    });
    this.labels.sync(this.views.values());
  }

  detachOverlays(): void {
    this.labels?.dispose();
    this.floating?.dispose();
    this.chips?.dispose();
    this.labels = null;
    this.floating = null;
    this.chips = null;
  }

  // Depuración/QA: partículas vivas por pool, placas y números visibles
  // Más los contadores acumulados de AC-75: no dependen de los pools y solo se reinician con resetCounters()
  stats(): Record<string, number> {
    return {
      ...this.effects.liveCounts(), floating: this.floating?.active ?? 0, ships: this.views.size, ppm: this.ppm, ppm0: this.ppm0,
      splashes: this.vfxCounters.splashes, hits: this.vfxCounters.hits, frameRange: this.frameRange
    };
  }

  resetCounters(): void {
    this.vfxCounters.splashes = 0;
    this.vfxCounters.hits = 0;
  }

  plateRects(): ReturnType<LabelLayer['visibleRects']> {
    return this.labels?.visibleRects() ?? [];
  }

  chipRects(): ReturnType<EdgeChipLayer['visibleRects']> {
    return this.chips?.visibleRects() ?? [];
  }

  // ---- Cámara de presentación, escenas sintéticas y capturas (QA y landing) ----
  setCameraPreset(preset: CameraPreset): void {
    this.preset = preset;
    const elevation = preset === 'presentation' ? PRESENTATION.elevation : CAMERA.elevation;
    this.sinT = Math.sin(elevation);
    this.cosT = Math.cos(elevation);
    this.camUp.set(0, this.cosT, -this.sinT);
    this.ocean.material.uniforms.uViewDir.value.set(0, this.sinT, this.cosT);
    this.snapFrame(); // antes de startScene: la escena se compone con el ppm del preset
  }

  // ppm al que llegará la cámara con el preset y el nivel actuales (sin las transiciones)
  targetPpm(): number {
    return this.preset === 'presentation' ? this.ppm0To * PRESENTATION.zoom : this.ppm0To / ZOOM.levels[this.level];
  }

  // myShipId: barco "propio" de la escena (placa propia con recarga, AC-107); por defecto, el de la escena.
  // cannonLevel: nivel de cañón con el que se encuadra (VFX-09b se mide con N1 y con N3, D29); por defecto, N1.
  // La escena estándar se compone en metros con la densidad de N3 en 1440×900 (5,04 px/m) y se renderiza con
  // cualquier nivel: rellenar la pantalla con el ppm de N1 juntaría los barcos un 19 % (Q23, D31)
  startScene(name: SceneName, options: { myShipId?: string; cannonLevel?: number } = {}): SyntheticSource {
    this.sceneCannonLevel = options.cannonLevel ?? 1;
    const view = name === 'standard'
      ? { w: 1440, h: 900, ppm: computePpm0(1440, 900, MAX_CANNON_RANGE), sinT: this.sinT }
      : { w: this.viewW, h: this.viewH, ppm: this.targetPpm(), sinT: this.sinT };
    const spec = name === 'hero' ? heroScene(view) : name === 'showcase' ? showcaseScene() : name === 'damage' ? damageScene() : name === 'gallery' ? galleryScene() : standardScene(view);
    const source = new SyntheticSource(options.myShipId ? { ...spec, myShipId: options.myShipId } : spec);
    this.setSource(source);
    return source;
  }

  stopScene(): void {
    this.sceneCannonLevel = 1;
    if (this.src !== this.client) this.setSource(this.client);
  }

  // Dibuja el estado actual una vez (sin avanzar la simulación) y devuelve renderer.info de ese render
  renderFrame(): RenderInfo | null {
    if (!this.gl || !this.rootScene || !this.camera) return null;
    this.gl.render(this.rootScene, this.camera);
    return { calls: this.gl.info.render.calls, triangles: this.gl.info.render.triangles };
  }

  // Renderiza un frame y lo codifica en la misma tarea (no hace falta preserveDrawingBuffer)
  captureImage(type = 'image/webp', quality = 0.9): string | null {
    if (!this.renderFrame()) return null;
    return this.gl!.domElement.toDataURL(type, quality);
  }

  // AD-27 (D42): captura del océano solo, con su reloj fijado en `time` s. Barcos y VFX se ocultan solo durante este
  // render síncrono (el bucle de frames no se intercala) y el siguiente frame repone uTime
  captureOceanPass(time: number): OceanPass | null {
    if (!this.camReady || !this.gl) return null;
    const shown = [...this.views.values()].filter((v) => v.mesh.visible);
    const vfx = this.effects.group.visible;
    const u = this.ocean.material.uniforms;
    const t = u.uTime.value;
    for (const v of shown) v.mesh.visible = false;
    this.effects.group.visible = false;
    u.uTime.value = time;
    const png = this.captureImage('image/png');
    const uniforms = Object.fromEntries(Object.entries(u).map(([k, { value }]) => [k, plainUniform(value)]));
    u.uTime.value = t;
    this.effects.group.visible = vfx;
    for (const v of shown) v.mesh.visible = true;
    if (!png) return null;
    const corners = [[0, 0], [this.viewW, 0], [0, this.viewH], [this.viewW, this.viewH]].map(([x, y]) => this.screenToWorld(x, y)!);
    return { png, time, pxW: this.gl.domElement.width, pxH: this.gl.domElement.height, ppm: this.ppm, corners, uniforms };
  }

  // VFX-01: draw calls de los efectos = con VFX − sin VFX
  setVfxVisible(visible: boolean): void {
    this.effects.group.visible = visible;
  }

  // VFX-02: geometrías y texturas vivas en la GPU (deben quedar constantes durante el combate)
  memoryInfo(): { geometries: number; textures: number } {
    return { geometries: this.gl?.info.memory.geometries ?? 0, textures: this.gl?.info.memory.textures ?? 0 };
  }

  // Draw calls y triángulos del último frame dibujado (sin el muestreo a 2 Hz de renderInfo)
  lastFrameInfo(): RenderInfo {
    return { calls: this.gl?.info.render.calls ?? 0, triangles: this.gl?.info.render.triangles ?? 0 };
  }

  // AS-V14: píxeles de vela por rumbo (0°…345° cada 15°) con el nivel más cercano (0,7×) de 1440×900. Con R = 80 m
  // (5,04 px/m, la base con la que se calibró antes de U8): es un cociente, no depende del encuadre
  measureSails(classIds: string[] = ['sloop', 'brig', 'frigate', 'pirate', 'merchant'], sheet = false, lod?: 0 | 1): SailVisibility[] {
    if (!this.gl) return [];
    return measureSailVisibility(this.gl, computePpm0(1440, 900, MAX_CANNON_RANGE) / ZOOM.levels[0], CAMERA.elevation, classIds, { sheet, lod });
  }

  // AD-10 / D8: L* de velas y casco por rumbo con el nivel más cercano (0,7×) de 1440×900 y la cámara del juego.
  // ppm opcional (AD-26: el de una sesión nueva, N1 a 1,0×)
  // lod: fuerza LOD0 o LOD1 con cualquier ppm (AD-33, D40); sin él, el que toca con ese ppm (ASSET-SPEC §7)
  measureShipValues(classIds: string[] = ['sloop', 'brig', 'frigate', 'pirate', 'merchant'], headingsDeg?: number[], ppm?: number, lod?: 0 | 1): ShipValues[] {
    if (!this.gl) return [];
    return measureShipValues(this.gl, ppm ?? computePpm0(1440, 900, MAX_CANNON_RANGE) / ZOOM.levels[0], CAMERA.elevation, classIds, headingsDeg, lod);
  }

  // QA: congela la simulación y los efectos (R3F sigue dibujando el último estado) para comparar dos capturas del
  // mismo instante, con y sin una capa (VFX-20, VFX-21). Las placas siguen recolocándose sobre el estado congelado,
  // así sus cajas se miden sin la deriva entre dos pasadas del declutter (AD-11, AC-107)
  // El reloj de VFX no cuenta la pausa: si no, al reanudar las partículas envejecerían de golpe lo que duró y, como en
  // pausa no se emite, la columna de humo quedaría con un hueco (sesgaba a la baja las capturas 2.ª y 3.ª de VFX-09b)
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    const now = performance.now();
    if (paused) this.pausedAt = now;
    else this.t0 += now - this.pausedAt;
    this.paused = paused;
  }

  // ---- Frame ----
  frame(state: RootState, dt: number): void {
    const now = performance.now();
    this.gl = state.gl;
    this.rootScene = state.scene;
    if (this.paused) {
      this.labels?.frame(now);
      this.chips?.frame(now);
      return;
    }
    this.shipGlb.pump(state.gl);
    this.src.update(now);
    if (this.src !== this.client) this.client.update(now); // drena sus eventos aunque no se dibuje
    const step = Math.min(dt, 0.1);
    // Flechas y envío del centro de la vista (≤ 2/s). Con el dt real hasta 0,5 s: con frames lentos (WebGL por software),
    // el tope de 0,1 s de la simulación de efectos frenaría la vista y AC-118 pide 300 m en 2 s
    this.freeView.update(now, Math.min(dt, 0.5));
    this.updateCamera(state, now);
    this.updateShips(now);
    this.director.updateFlights(now);
    this.director.updateShips(now, step);
    this.updateRings(now);
    this.updateWrecks(now, step);
    const t = (now - this.t0) / 1000;
    this.ocean.material.uniforms.uTime.value = t;
    this.effects.update(t, this.ppm, CAM_RIGHT, this.camUp);
    this.updateReload(now);
    this.labels?.frame(now);
    this.floating?.frame(now);
    this.chips?.frame(now);
    this.adaptQuality(state, dt, now);
  }

  private currentZoomFactor(now: number): number {
    const target = ZOOM.levels[this.level];
    const k = clamp01((now - this.zoomStart) / ZOOM.transitionMs);
    return k >= 1 ? target : this.zoomFrom + (target - this.zoomFrom) * easeOut(k);
  }

  // R del encuadre: en partida, máx(alcance propio, 65 m); la portada conserva la base de 80 m con la que se compuso
  private frameRangeTarget(): number {
    return this.preset === 'presentation' ? MAX_CANNON_RANGE : frameRangeM(this.cannonRange());
  }

  // R y ppm₀ al momento: viewport nuevo, cambio de preset o de fuente
  private snapFrame(): void {
    this.frameRange = this.frameRangeTarget();
    this.frameFromPlayer = !!this.src.player;
    this.ppm0 = this.ppm0To = computePpm0(this.viewW, this.viewH, this.frameRange);
    this.ppm0Start = -Infinity;
  }

  // Cañón nuevo (solo se compra en la tienda): al cerrarla, ease-in-out de 600 ms hacia el ppm₀ nuevo. Si R cambia
  // con el primer dato del jugador (al entrar con un cañón mejorado), se aplica sin transición
  private updateFrame(now: number): void {
    const range = this.frameRangeTarget();
    if (range !== this.frameRange) {
      if (!this.frameFromPlayer) this.snapFrame();
      else if (!useHud.getState().shopOpen) {
        this.ppm0From = this.ppm0;
        this.ppm0To = computePpm0(this.viewW, this.viewH, range);
        this.ppm0Start = now;
        this.frameRange = range;
      }
    } else if (!this.frameFromPlayer && this.src.player) {
      this.frameFromPlayer = true;
    }
    if (this.ppm0Start === -Infinity) return;
    const k = clamp01((now - this.ppm0Start) / ZOOM.rangeTransitionMs);
    this.ppm0 = this.ppm0From + (this.ppm0To - this.ppm0From) * easeInOut(k);
    if (k >= 1) this.ppm0Start = -Infinity;
  }

  private updateCamera(state: RootState, now: number): void {
    const cam = state.camera as THREE.OrthographicCamera;
    this.camera = cam;
    const w = state.size.width;
    const h = state.size.height;
    if (w !== this.viewW || h !== this.viewH) {
      this.viewW = w;
      this.viewH = h;
      this.snapFrame();
    }
    this.updateFrame(now);
    this.ppm = this.preset === 'presentation' ? this.ppm0 * PRESENTATION.zoom : this.ppm0 / this.currentZoomFactor(now);

    // Seguimiento rígido del barco propio (AC-23); muerto, la cámara se queda sobre los restos y al
    // reaparecer salta sin transición
    // En vista libre (E13) el foco es el centro de la vista, y al volver se mezcla con el barco durante 300 ms
    const me = this.src.getShip(this.src.myShipId);
    const fixed = this.src.focus;
    if (fixed) {
      this.focusX = fixed.x;
      this.focusZ = fixed.z;
    } else {
      const ship = me && me.state !== 'dead' ? { x: me.x, z: me.z } : { x: this.focusX, z: this.focusZ };
      const f = this.freeView.focus(ship, now)!;
      this.focusX = f.x;
      this.focusZ = f.z;
    }
    let ox = 0;
    let oy = 0;
    const k = (now - this.shakeAt) / CAMERA.shakeMs;
    if (k >= 0 && k < 1) {
      const amp = CAMERA.shakePx * (1 - k);
      ox = (Math.random() * 2 - 1) * amp;
      oy = (Math.random() * 2 - 1) * amp;
    }
    // Punto de mira = foco + sacudida en px de pantalla
    this.lookX = this.focusX + CAM_RIGHT.x * (ox / this.ppm);
    this.lookY = this.camUp.y * (oy / this.ppm);
    this.lookZ = this.focusZ + this.camUp.z * (oy / this.ppm);
    cam.position.set(this.lookX, this.lookY + CAMERA.distance * this.sinT, this.lookZ + CAMERA.distance * this.cosT);
    cam.up.set(0, 1, 0);
    this.p3.set(this.lookX, this.lookY, this.lookZ);
    cam.lookAt(this.p3);
    if (cam.zoom !== this.ppm || cam.near !== CAMERA.near || cam.far !== CAMERA.far) {
      cam.zoom = this.ppm;
      cam.near = CAMERA.near;
      cam.far = CAMERA.far;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    this.camReady = w > 0 && h > 0;

    // Océano: suelo visible + 40 m, recentrado en el foco (redondeado a 1 m)
    this.ocean.position.set(Math.round(this.focusX), 0, Math.round(this.focusZ));
    this.ocean.scale.set(w / this.ppm + 40, 1, h / (this.ppm * this.sinT) + 40);
  }

  private syncShips(list: RenderShip[]): void {
    const seen = new Set<string>();
    for (const ship of list) {
      seen.add(ship.id);
      const view = this.views.get(ship.id);
      if (view) {
        view.ship = ship;
        continue;
      }
      this.views.set(ship.id, this.createView(ship));
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this.scene.remove(view.mesh);
      this.materialPool.push(view.mesh.material);
      this.views.delete(id);
      if (this.hoverId === id) this.hoverId = null;
    }
    this.labels?.sync(this.views.values());
  }

  private createView(ship: RenderShip): ShipView {
    const model = this.shipGlb.model(ship.classId);
    this.shipGlb.request(ship.classId, ship.id === this.src.myShipId); // el propio, el primero (AC-193 c)
    const material = this.materialPool.pop() ?? createShipMaterial();
    setShipMap(material, model.map ?? null);
    const lod: 0 | 1 = model.recipe.L * this.ppm >= LOD_PX[0] ? 0 : 1;
    const mesh = new THREE.Mesh(model.lods[lod], material);
    mesh.rotation.order = 'YXZ';
    mesh.renderOrder = RENDER_ORDER.ships;
    mesh.matrixAutoUpdate = false;
    mesh.name = ship.id;
    this.scene.add(mesh);
    return {
      id: ship.id, ship, model, mesh, lod, length: model.recipe.L, beam: model.recipe.B, phase: Math.random() * Math.PI * 2,
      smoke: false, fire: false, smokeAcc: 0, fireAcc: 0, coreAcc: 0, emberAcc: 0, repairAcc: 0, chipAcc: 0, wakeDist: 0, wakeCount: 0,
      lastX: ship.x, lastZ: ship.z, hitAt: -Infinity, lastDamagedAt: -Infinity, heel: 1, emergeAt: -Infinity, sinkFx: false,
      sinkRingAcc: 0, sprayAcc: 0, debris: false, fireUnder: [false, false, false], shieldEnd: -Infinity, wasProtected: false,
      lastHp: ship.hp, repairGain: 0, repairClock: 0, smokeSlot: false, fireSlot: false
    };
  }

  private updateShips(now: number): void {
    const t = (now - this.t0) / 1000;
    const serverTime = this.src.serverTime();
    for (const view of this.views.values()) {
      const s = view.ship;
      // Cambio de clase o llegada del GLB de la clase: misma vista y mismo LOD, con la geometría y la textura nuevas
      const model = this.shipGlb.model(s.classId);
      if (model !== view.model) {
        view.model = model;
        view.length = model.recipe.L;
        view.beam = model.recipe.B;
        view.mesh.geometry = model.lods[view.lod];
        setShipMap(view.mesh.material, model.map ?? null);
        this.shipGlb.request(s.classId, view.id === this.src.myShipId);
      }
      const r = view.model.recipe;
      // LOD por eslora proyectada con histéresis (ASSET-SPEC §7)
      const px = r.L * this.ppm;
      const lod: 0 | 1 = view.lod === 1 ? (px >= LOD_PX[0] ? 0 : 1) : px < LOD_PX[1] ? 1 : 0;
      if (lod !== view.lod) {
        view.lod = lod;
        view.mesh.geometry = view.model.lods[lod];
      }

      const mesh = view.mesh;
      let y = 0;
      let pitch = 0;
      let roll = 0;
      if (s.state === 'alive') {
        y = Math.sin(t * 1.4 + view.phase) * 0.12;
        roll = Math.sin(t * 1.1 + view.phase) * 3 * deg;
        pitch = Math.sin(t * 0.9 + view.phase * 1.3) * 1.5 * deg;
        const ek = (now - view.emergeAt) / EMERGE_MS;
        if (ek >= 0 && ek < 1) y -= (r.F + 1) * (1 - easeOutBack(ek));
        mesh.visible = true;
      } else if (s.state === 'sinking') {
        // VFX §7: escora ±22°, proa abajo 14° y hundimiento de (h_max + 2) m en 3 s
        const k = s.sinkingSince > 0 ? clamp01((now - s.sinkingSince) / SINK_MS) : 1;
        roll = view.heel * 22 * deg * easeInOut(k);
        pitch = 14 * deg * easeInOut(k);
        y = -(r.mastHeight + 2) * easeInCubic(k);
        mesh.visible = k < 1;
      } else {
        mesh.visible = false;
      }
      mesh.position.set(s.x, y, s.z);
      mesh.rotation.set(pitch, s.heading, roll);
      mesh.updateMatrix();

      // Uniforms: destello de impacto (120 ms), oscurecimiento por daño y brillo de protección
      const fx = mesh.material.userData.fx;
      fx.uHit.value = Math.max(0, 1 - (now - view.hitAt) / 120);
      const ratio = s.maxHp > 0 ? s.hp / s.maxHp : 1;
      fx.uDamage.value = clamp01((0.5 - ratio) / 0.5);
      const prot = s.state === 'alive' && s.protectedUntil > serverTime;
      if (view.wasProtected && !prot) view.shieldEnd = now;
      view.wasProtected = prot;
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t)); // VFX §12
      fx.uShield.value = prot ? pulse : Math.max(0, 1 - (now - view.shieldEnd) / 300) * pulse;
    }
  }

  private pushRing(x: number, z: number, radius: number, strokePx: number, hex: string, alpha: number, dashes = 0, fill = 1, phase = 0, outlinePx = 0, outlineAlpha = 0, mode: number = RING_MODE.ring): void {
    const r = this.ring;
    r.x = x;
    r.z = z;
    r.radius = radius;
    r.mode = mode;
    r.strokePx = strokePx;
    r.dashes = dashes;
    r.fill = fill;
    r.phase = phase;
    this.ringColor.set(ringRgb(hex));
    this.ringColor[3] = alpha;
    r.color.set(this.ringColor);
    r.outlinePx = outlinePx;
    r.outlineAlpha = outlineAlpha;
    this.effects.rings.push(r);
  }

  // VFX §10–12, §14: propio, protección, objetivo, hover, alcance, marcador de clic y restos
  private updateRings(now: number): void {
    const rings = this.effects.rings;
    rings.begin();
    const t = (now - this.t0) / 1000;
    const still = this.reducedMotion;
    const myId = this.src.myShipId;
    const me = this.views.get(myId ?? '');
    const serverTime = this.src.serverTime();

    for (const view of this.views.values()) {
      const s = view.ship;
      if (s.state !== 'alive') continue;
      const R = view.model.extras.sb_radius;
      const prot = s.protectedUntil > serverTime;
      const fade = prot ? 1 : clamp01(1 - (now - view.shieldEnd) / 300);
      if (prot || fade > 0) {
        // Protección (§12): continuo r × 1,1 + discontinuo r × 1,22 girando a −30°/s; se encoge al terminar
        const k = prot ? 1 : fade;
        this.pushRing(s.x, s.z, R * 1.1 * (0.6 + 0.4 * k), 2, RING_COLORS.shield, 0.7 * k);
        this.pushRing(s.x, s.z, R * 1.22 * (0.6 + 0.4 * k), 2, RING_COLORS.shield, 0.5 * k, 16, 0.5, still ? 0 : -30 * deg * t);
        if (prot) continue;
      }
      if (view.id === myId) this.pushRing(s.x, s.z, R * 1.1, 2, RING_COLORS.own, 0.4);
    }

    const focusId = this.focusId();
    const target = this.views.get(focusId ?? '');
    const range = this.cannonRange();
    if (target && target.id !== myId) {
      const s = target.ship;
      const sinkK = s.state === 'sinking' ? clamp01((now - s.sinkingSince) / 300) : s.state === 'dead' ? 1 : 0;
      const inRange = !!me && Math.hypot(s.x - me.ship.x, s.z - me.ship.z) <= range;
      if (sinkK < 1) {
        const R = target.model.extras.sb_radius * 1.1;
        if (inRange) this.pushRing(s.x, s.z, R, 3, RING_COLORS.target, 1 - sinkK, 12, 0.7, still ? 0 : 25 * deg * t, 1, 0.6 * (1 - sinkK));
        // Fuera de alcance (D11): α 1; el estado lo dicen el relleno al 40 % y la ausencia de giro
        else this.pushRing(s.x, s.z, R, 3, RING_COLORS.target, 1 - sinkK, 12, 0.4, 0, 1, 0.6 * (1 - sinkK));
      }
      // Alcance (§11): en alcance trazos 2/2 m verdes; fuera 2/6 m claros (se distinguen en grises, AC-74)
      if (me && me.ship.state === 'alive' && s.state === 'alive') {
        if (inRange) this.pushRing(me.ship.x, me.ship.z, range, 1.5, RING_COLORS.rangeIn, 0.45, -4, 0.5);
        else this.pushRing(me.ship.x, me.ship.z, range, 1.5, RING_COLORS.rangeOut, 0.25, -8, 0.25);
      }
    }

    const hover = this.views.get(this.hoverId ?? '');
    if (hover && hover.id !== focusId && hover.ship.state === 'alive') {
      this.pushRing(hover.ship.x, hover.ship.z, hover.model.extras.sb_radius * 1.05, 2, RING_COLORS.hover, 0.5);
    }

    this.clickRings(now, me);

    // Últimos 5 s (VFX §14, D4): con expiresAt del servidor en el reloj de render (serverTime − retardo de
    // interpolación), el mismo con el que se despacha wreckGone; así cuadra aunque se entre tarde al área
    const renderClock = this.src.serverTime() - INTERPOLATION_DELAY_MS / 1000;
    for (const w of this.wrecks.values()) {
      if (w.goneAt) continue;
      const age = now - w.seenAt;
      const blink = w.expiresAt - renderClock < 5 && !still ? (Math.sin(2 * Math.PI * 2 * (age / 1000)) > 0 ? 1 : 0.15) : 1;
      const beat = still ? 1 : 0.75 + 0.25 * Math.sin(2 * Math.PI * (age / 1000));
      this.pushRing(w.x, w.z, Math.max(2.5, 10 / this.ppm), 2, RING_COLORS.wreck, 0.45 * beat * blink);
    }
    rings.end(this.ppm);
  }

  private clickRings(now: number, me: ShipView | undefined): void {
    const m = this.clickMarker;
    if (!m) return;
    if (!me || me.ship.state !== 'alive') {
      this.clickMarker = null;
      return;
    }
    if (!m.endAt && Math.hypot(me.ship.x - m.x, me.ship.z - m.z) <= 2) m.endAt = now;
    const shrink = m.endAt ? clamp01(1 - (now - m.endAt) / 200) : 1;
    if (shrink <= 0) {
      this.clickMarker = null;
      return;
    }
    const age = now - m.start;
    const beat = this.reducedMotion ? 1 : 1 + 0.08 * Math.sin(2 * Math.PI * 1.2 * (age / 1000));
    this.pushRing(m.x, m.z, (12 / this.ppm) * beat * shrink, 2, RING_COLORS.click, 0.6 * shrink, 0, 1, 0, 1, 0.5);
    this.pushRing(m.x, m.z, (2.5 / this.ppm) * shrink, 1, RING_COLORS.click, 0.9 * shrink, 0, 1, 0, 1, 0.5, RING_MODE.dot);
    if (age < 350) {
      const k = easeOut(age / 350);
      this.pushRing(m.x, m.z, (4 + 18 * k) / this.ppm, 2, RING_COLORS.click, 1 - age / 350, 0, 1, 0, 1, 0.5 * (1 - age / 350));
    }
    if (m.adjusted && age < 300) {
      const a = 1 - age / 300;
      this.pushRing(m.clickX, m.clickZ, 6 / this.ppm, 2, RING_COLORS.clickCross, a, 0, 1, 0, 0, 0, RING_MODE.cross);
      this.ring.x2 = m.x;
      this.ring.z2 = m.z;
      this.pushLine(m.clickX, m.clickZ, m.x, m.z, RING_COLORS.click, 0.8 * a);
    }
  }

  private pushLine(x1: number, z1: number, x2: number, z2: number, hex: string, alpha: number): void {
    const r = this.ring;
    r.x = x1;
    r.z = z1;
    r.x2 = x2;
    r.z2 = z2;
    r.radius = 0;
    r.mode = RING_MODE.line;
    r.strokePx = 1;
    r.dashes = 0;
    r.fill = 1;
    r.phase = 0;
    this.ringColor.set(ringRgb(hex));
    this.ringColor[3] = alpha;
    r.color.set(this.ringColor);
    r.outlinePx = 0;
    r.outlineAlpha = 0;
    this.effects.rings.push(r);
  }

  // Nivel de cañón propio: el del jugador; en una escena sintética (sin jugador), el que fije la prueba (QA, D29)
  private cannonLevel(): number {
    return this.src.player?.upgrades.cannons ?? this.sceneCannonLevel;
  }

  private cannonRange(): number {
    const level = this.cannonLevel();
    return CANNON_LEVELS[Math.max(0, Math.min(CANNON_LEVELS.length - 1, level - 1))].range;
  }

  private reloadMs(): number {
    const level = this.cannonLevel();
    return CANNON_LEVELS[Math.max(0, Math.min(CANNON_LEVELS.length - 1, level - 1))].reload * 1000;
  }

  // AC-73: avanza monótono desde la andanada propia; lleno (y destello blanco de 120 ms) al disparar
  private updateReload(now: number): void {
    const me = this.src.getShip(this.src.myShipId);
    const r = this.reloadState;
    const since = now - this.lastVolleyAt;
    r.progress = clamp01(since / this.reloadMs());
    r.flash = since >= 0 && since < LABEL.reloadFlashMs;
    const armed = !!me && me.state === 'alive' && !!me.targetId;
    r.visible = !!me && me.state === 'alive' && (armed || r.progress < 1);
    r.ready = armed && r.progress >= 1;
  }

  private syncWrecks(list: WreckView[]): void {
    const now = performance.now();
    const seen = new Set<string>();
    for (const w of list) {
      seen.add(w.id);
      if (!this.wrecks.has(w.id)) {
        this.wrecks.set(w.id, { id: w.id, x: w.x, z: w.z, seenAt: now, goneAt: 0, expiresAt: w.expiresAt, seed: Math.random() * Math.PI * 2, sparkleAcc: 0 });
      }
    }
    for (const w of this.wrecks.values()) if (!seen.has(w.id) && !w.goneAt) w.goneAt = now;
  }

  // VFX §14: caja que se mece y gira, destello cada 0,6 s; al recogerla escala a 0 en 200 ms
  private updateWrecks(now: number, dt: number): void {
    let i = 0;
    const t = (now - this.t0) / 1000;
    for (const [id, w] of this.wrecks) {
      let scale = 1;
      if (w.goneAt) {
        scale = 1 - (now - w.goneAt) / 200;
        if (scale <= 0) {
          this.wrecks.delete(id);
          continue;
        }
      }
      if (i >= LOOT_CAPACITY) continue;
      this.e.set(0, w.seed + 0.4 * t, 0);
      this.q.setFromEuler(this.e);
      this.p3.set(w.x, 0.15 * Math.sin((2 * Math.PI * t) / 2.4 + w.seed), w.z);
      this.loot.setMatrixAt(i++, this.m4.compose(this.p3, this.q, this.s3.setScalar(scale)));
      if (!w.goneAt && this.inView(w.x, w.z)) {
        w.sparkleAcc += dt;
        if (w.sparkleAcc >= 0.6) {
          w.sparkleAcc = 0;
          this.effects.lootSparkle(w.x, 1.2, w.z);
        }
      }
    }
    this.loot.count = i;
    this.loot.visible = i > 0;
    if (i > 0) {
      this.loot.instanceMatrix.clearUpdateRanges();
      this.loot.instanceMatrix.addUpdateRange(0, i * 16);
      this.loot.instanceMatrix.needsUpdate = true;
    }
  }

  // Calidad adaptativa (ART-DIRECTION §5) y lectura de renderer.info a ≤ 2 Hz
  private adaptQuality(state: RootState, dt: number, now: number): void {
    if (now - this.infoAt >= 500) {
      this.infoAt = now;
      this.renderInfo.calls = state.gl.info.render.calls;
      this.renderInfo.triangles = state.gl.info.render.triangles;
    }
    if (!this.baseDpr) this.baseDpr = state.viewport.dpr;
    if (this.preset === 'presentation') {
      // Capturas (§16.1): la densidad del dispositivo hasta 2× aunque el juego en móvil se limite a 1,5×
      const dpr = Math.min(window.devicePixelRatio || 1, LIGHTING.dprDesktop[1]);
      if (state.viewport.dpr !== dpr) state.setDpr(dpr);
      this.dprOverride = true;
      return;
    }
    if (this.dprOverride) {
      this.dprOverride = false;
      state.setDpr(this.lowQuality ? Math.max(1, this.baseDpr * LIGHTING.dprStep) : this.baseDpr);
    }
    const ms = dt * 1000;
    if (ms > LIGHTING.slowFrameMs) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (ms < LIGHTING.fastFrameMs) {
      this.fastFor += dt;
      this.slowFor = Math.max(0, this.slowFor - dt);
    }
    if (!this.lowQuality && this.slowFor >= LIGHTING.slowWindowS) {
      this.lowQuality = true;
      this.slowFor = 0;
      state.setDpr(Math.max(1, this.baseDpr * LIGHTING.dprStep));
    } else if (this.lowQuality && this.fastFor >= LIGHTING.fastWindowS) {
      this.lowQuality = false;
      this.fastFor = 0;
      state.setDpr(this.baseDpr);
    }
  }

  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    this.stopViewReturn();
    this.detachOverlays();
    for (const view of this.views.values()) view.mesh.material.dispose();
    for (const m of this.materialPool) m.dispose();
    this.views.clear();
    this.effects.dispose();
    this.ocean.geometry.dispose();
    this.ocean.material.dispose();
    this.islandMesh.geometry.dispose();
    this.palms.geometry.dispose();
    this.buoys.geometry.dispose();
    this.loot.geometry.dispose();
    this.staticMaterial.dispose();
    this.shipGlb.dispose();
    this.scene.clear();
  }

  // Vista previa de un GLB (ux) y e2e: la clase usa ese GLB en cuanto carga, con el procedural mientras tanto
  useShipGlb(classId: string, url: string): void {
    this.shipGlb.setUrl(classId, url);
    for (const view of this.views.values()) if (view.ship.classId === classId) this.shipGlb.request(classId, view.id === this.src.myShipId);
  }
}

const ringColors = new Map<string, Float32Array>();
function ringRgb(hex: string): Float32Array {
  let c = ringColors.get(hex);
  if (!c) {
    c = rgba(hex, 1);
    ringColors.set(hex, c);
  }
  return c;
}

export function createRuntime(client: GameClient): GameRuntime {
  return new GameRuntime(client);
}

export function disposeRuntime(rt: GameRuntime): void {
  rt.dispose();
}

// Conecta las capas DOM de placas, números e indicadores de borde (las crea GameApp); devuelve la limpieza para un useEffect
export function attachOverlays(rt: GameRuntime, labels: HTMLElement, floating: HTMLElement, chips: HTMLElement): () => void {
  rt.attachOverlays(labels, floating, chips);
  return () => rt.detachOverlays();
}

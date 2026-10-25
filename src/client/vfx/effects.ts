// Efectos según docs/game/VFX-SPEC.md. 7 draw calls en total (§0.2): P_ADD, P_ALPHA, P_WATER, P_BALL,
// P_BALL_SHADOW, P_CONTACT y RINGS. Todo está preasignado; emitir solo escribe en un ring buffer (AC-91).
import * as THREE from 'three';
import { PALETTE, RING_COLORS } from '../art';
import { BallLayer, ContactLayer } from './balls';
import { makeSpec, ParticlePool, ParticleSpec, SHAPE } from './particles';
import { RingLayer } from './rings';

// renderOrder (§0.2): océano 0 → sombras de los barcos con GLB 0,5 (ship-shadow.ts) → P_WATER 1 → P_CONTACT 2 → islas 3 →
// RINGS 4 → barcos 5 → sombras de las balas 6 → balas 7 → P_ALPHA 8 → P_ADD 9
export const RENDER_ORDER = { ocean: 0, shipShadows: 0.5, water: 1, contact: 2, islands: 3, rings: 4, ships: 5, shadows: 6, balls: 7, alpha: 8, add: 9 };

export const POOLS = {
  desktop: { add: 384, alpha: 1280, water: 768, balls: 96, contact: 64, rings: 64 }, // P_ALPHA con los cuerpos de llama (D21)
  mobile: { add: 192, alpha: 640, water: 384, balls: 64, contact: 64, rings: 64 }
};

// §6 humo y fuego de vida baja: tasas por socket (1/s) y vidas (s) (D20, D21), y barcos que los llevan a la vez, los
// más cercanos al centro: [normal, móvil y calidad baja]. En móvil y calidad baja no se recortan la tasa ni la vida,
// porque son información de daño (AC-104); a cambio, humo en ≤ 12 barcos y fuego en ≤ 4 (§0.4, D32)
export const DAMAGE_FX = {
  smokeRate: 3, denseSmokeRate: 6, smokeLife: 3.4,
  flameRate: 12, coreRate: 6, emberRate: 2, flameLife: 0.55, coreLife: 0.4, emberLife: 1.2, fireSockets: 3,
  smokeShips: [Infinity, 12], fireShips: [8, 4]
} as const;

// Mínimo en px del cuerpo de llama (10) y del núcleo (5), pero nunca más de ≈ 1/4 de la eslora en pantalla
// (0,22·L·ppm y 0,11·L·ppm): en 390×844 con N3 la Balandra baja a 8 px y su fuego deja de taparle el casco (Q24, D35)
export function flamePxMin(length: number, ppm: number, core = false): number {
  return core ? Math.min(5, 0.11 * length * ppm) : Math.min(10, 0.22 * length * ppm);
}

const WIND = new THREE.Vector3(0.5, 0, -0.5); // m/s (VFX §2); el humo de daño usa × 1,2 = (0,6, 0, −0,6)

// RGBA lineal a partir de un hex sRGB
export function rgba(hex: string, a: number): Float32Array {
  const c = new THREE.Color(hex);
  return new Float32Array([c.r, c.g, c.b, a]);
}

const C = {
  muzzleCore: [rgba('#FFF6C8', 1), rgba('#FFB347', 0)],
  muzzlePlume: [rgba('#FF8A2B', 0.9), rgba('#FF5A1F', 0)],
  spark: [rgba('#FFD27A', 1), rgba('#FF6A1F', 0)],
  cannonSmoke: [rgba('#E9E4DA', 0.75), rgba('#9A958C', 0)],
  trail: [rgba('#D8D3CA', 0.45), rgba('#D8D3CA', 0)],
  column: [rgba('#F4FBFD', 0.95), rgba('#BFE3F0', 0)],
  ripple: [rgba(PALETTE.oceanFoam, 0.8), rgba(PALETTE.oceanFoam, 0)],
  splashFoam: [rgba(PALETTE.oceanFoam, 0.5), rgba(PALETTE.oceanFoam, 0)],
  flash: [rgba('#FFE7A8', 1), rgba('#FF7A1A', 0)],
  splinter: [rgba('#7A4E2A', 1), rgba('#7A4E2A', 0)],
  hitSmoke: [rgba('#6B6660', 0.7), rgba('#4A4642', 0)],
  // Humo de vida baja: bocanadas (forma 7, D20) de color constante (D22). El alfa final no se usa: la curva de la forma
  // la apaga en el último 45 % de la vida. Claro con α0,42: con 0,35, una bocanada sola sobre el agua daba ΔE76 14,7
  // (Q17). Denso #A29D97 (L* 65): aclara el agua ΔL* +19,7 y la vela pirata +40, y oscurece la vela blanca −22 (Q19)
  smoke: [rgba('#B8B3AC', 0.42), rgba('#B8B3AC', 0)],
  denseSmoke: [rgba('#A29D97', 0.8), rgba('#A29D97', 0)],
  // Cuerpo de la llama en mezcla normal y núcleo aditivo (D21): en aditivo puro saturaba a blanco sobre la cubierta
  flame: [rgba('#FF9E2C', 1), rgba('#D9381A', 0)],
  flameCore: [rgba('#FFE08A', 0.6), rgba('#FFE08A', 0)],
  ember: [rgba('#FFB347', 1), rgba('#FFB347', 0)],
  sinkRing: [rgba(PALETTE.oceanFoam, 0.7), rgba(PALETTE.oceanFoam, 0)],
  spray: [rgba('#F4FBFD', 0.8), rgba('#F4FBFD', 0)],
  steam: [rgba('#F2F2F0', 0.6), rgba('#F2F2F0', 0)],
  // α inicial > 1 (se satura a 1): el tablón se ve opaco y solo se desvanece el último 30 % de su vida (1,5 de 5 s)
  plank: [rgba('#6B4426', 1 / 0.3), rgba('#6B4426', 0)],
  wake: [rgba('#F2FAFC', 1), rgba('#F2FAFC', 0)],
  repair: [rgba('#3DDC97', 0.9), rgba('#3DDC97', 0)],
  chip: [rgba('#C9965E', 1), rgba('#C9965E', 0)],
  sparkle: [rgba('#FFF2B3', 1), rgba('#FFF2B3', 0)],
  goldSpark: [rgba(RING_COLORS.wreck, 1), rgba('#FFB347', 0)]
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export class Effects {
  readonly group = new THREE.Group();
  readonly add: ParticlePool;
  readonly alpha: ParticlePool;
  readonly water: ParticlePool;
  readonly balls: BallLayer;
  readonly contact: ContactLayer;
  readonly rings: RingLayer;
  readonly mobile: boolean;
  time = 0; // s, reloj de VFX
  ppm = 5;
  private readonly s: ParticleSpec = makeSpec();
  private readonly wakeTmp = new Float32Array(4);
  private readonly wakeTmp1 = new Float32Array(4);
  private readonly wakeColors = [this.wakeTmp, this.wakeTmp1];

  constructor(mobile: boolean) {
    this.mobile = mobile;
    const size = mobile ? POOLS.mobile : POOLS.desktop;
    this.add = new ParticlePool({ capacity: size.add, mode: 'billboard', blending: 'add', renderOrder: RENDER_ORDER.add });
    this.alpha = new ParticlePool({ capacity: size.alpha, mode: 'billboard', blending: 'alpha', renderOrder: RENDER_ORDER.alpha });
    this.water = new ParticlePool({ capacity: size.water, mode: 'water', blending: 'alpha', renderOrder: RENDER_ORDER.water, opaquePass: true, waterY: 0.03 });
    this.balls = new BallLayer(size.balls, '#2E2E30', '#FFE2B0');
    this.contact = new ContactLayer(size.contact, PALETTE.oceanFoam, RENDER_ORDER.contact);
    this.rings = new RingLayer(size.rings, RING_COLORS.outline, RENDER_ORDER.rings);
    this.group.add(this.water.mesh, this.contact.mesh, this.rings.mesh, this.balls.shadows, this.balls.balls, this.alpha.mesh, this.add.mesh);
  }

  update(time: number, ppm: number, camRight: THREE.Vector3, camUp: THREE.Vector3): void {
    this.time = time;
    this.ppm = ppm;
    this.add.update(time, ppm, camRight, camUp);
    this.alpha.update(time, ppm, camRight, camUp, WIND);
    this.water.update(time, ppm, camRight, camUp);
  }

  liveCounts(): Record<string, number> {
    return {
      add: this.add.live(this.time),
      alpha: this.alpha.live(this.time),
      water: this.water.live(this.time),
      balls: this.balls.active,
      contact: this.contact.active,
      rings: this.rings.active
    };
  }

  dispose(): void {
    this.add.dispose();
    this.alpha.dispose();
    this.water.dispose();
    this.balls.dispose();
    this.contact.dispose();
    this.rings.dispose();
  }

  // ---- utilidades ----
  private spec(x: number, y: number, z: number, life: number, s0: number, s1: number, colors: Float32Array[], shape: number, delay = 0): ParticleSpec {
    const s = this.s;
    s.x = x; s.y = y; s.z = z;
    s.vx = 0; s.vy = 0; s.vz = 0;
    s.t0 = this.time + delay;
    s.life = life;
    s.s0 = s0; s.s1 = s1;
    s.gravity = 0; s.drag = 0;
    s.c0.set(colors[0]);
    s.c1.set(colors[1]);
    s.shape = shape;
    s.rot = 0; s.spin = 0; s.stretch = 1;
    s.pxMin = 0;
    s.wind = 0;
    return s;
  }

  // Dirección aleatoria dentro de un cono de semiángulo `cone` alrededor de (dx, dy, dz) normalizado
  private cone(s: ParticleSpec, dx: number, dy: number, dz: number, cone: number, speed: number): void {
    const yaw = rand(-cone, cone);
    const pitch = rand(-cone, cone);
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const x = dx * c - dz * sn;
    const z = dx * sn + dz * c;
    s.vx = x * speed;
    s.vy = (dy + Math.sin(pitch)) * speed;
    s.vz = z * speed;
  }

  // ---- §1 Fogonazo (5 partículas por cañón) y §2 humo (3) ----
  muzzle(x: number, y: number, z: number, dx: number, dz: number, scale: number): void {
    let s = this.spec(x, y, z, 0.1, 0.9 * scale, 1.5 * scale, C.muzzleCore, SHAPE.disc);
    s.pxMin = 10;
    this.add.emit(s);
    s = this.spec(x + dx * 0.9, y, z + dz * 0.9, 0.1, 0.6 * scale, 1.2 * scale, C.muzzlePlume, SHAPE.disc);
    this.add.emit(s);
    for (let i = 0; i < 3; i++) {
      s = this.spec(x, y, z, 0.25, 0.18, 0.18, C.spark, SHAPE.streak);
      this.cone(s, dx, 0, dz, 25 * (Math.PI / 180), 9);
      s.gravity = -9.8;
      s.stretch = 3;
      s.pxMin = 2;
      this.add.emit(s);
    }
    for (let i = 0; i < 3; i++) {
      s = this.spec(x, y, z, 1.6 + rand(-0.3, 0.3), 0.9 * scale, 3.4 * scale, C.cannonSmoke, SHAPE.disc);
      this.cone(s, dx, 0, dz, 25 * (Math.PI / 180), 3.5);
      s.vy += 0.8;
      s.drag = 2.5;
      s.gravity = 0.3;
      s.pxMin = 8;
      s.wind = 1;
      this.alpha.emit(s);
    }
  }

  // §3 Estela de humo de la bala (solo escritorio y calidad alta; la decide el director)
  ballTrail(x: number, y: number, z: number): void {
    const s = this.spec(x, y, z, 0.4, 0.6, 1.6, C.trail, SHAPE.disc);
    s.pxMin = 3;
    this.alpha.emit(s);
  }

  // ---- §4 Salpicadura de fallo (15 partículas) ----
  splash(x: number, z: number): void {
    for (let i = 0; i < 12; i++) {
      const s = this.spec(x, 0.2, z, 0.75, 0.6, 1.2, C.column, SHAPE.disc);
      s.vx = rand(-1.5, 1.5);
      s.vy = rand(6, 9);
      s.vz = rand(-1.5, 1.5);
      s.gravity = -18;
      s.pxMin = 4;
      this.alpha.emit(s);
    }
    const minD = 36 / this.ppm; // diámetro final mínimo de la onda: 36 px
    this.water.emit(this.spec(x, 0, z, 0.8, 0.8, Math.max(6.0, minD), C.ripple, SHAPE.ring));
    this.water.emit(this.spec(x, 0, z, 0.8, 0.8, Math.max(8.4, minD), C.ripple, SHAPE.ring, 0.12));
    this.water.emit(this.spec(x, 0, z, 1.2, 3.2, 3.2, C.splashFoam, SHAPE.foam));
  }

  // ---- §5 Impacto en madera (18 partículas; desde el 5.º impacto de la andanada, 4 chispas y 3 astillas) ----
  impact(x: number, y: number, z: number, index: number, scale = 1): void {
    let s = this.spec(x, y, z, 0.09, 1.6 * scale, 1.6 * scale, C.flash, SHAPE.disc);
    s.pxMin = 14;
    this.add.emit(s);
    const sparks = index >= 4 ? 4 : 8;
    const splinters = index >= 4 ? 3 : 6;
    for (let i = 0; i < sparks; i++) {
      s = this.spec(x, y, z, 0.35, 0.15, 0.15, C.spark, SHAPE.streak);
      const a = rand(0, Math.PI * 2);
      const v = rand(6, 10);
      s.vx = Math.cos(a) * v * 0.6;
      s.vz = Math.sin(a) * v * 0.6;
      s.vy = v * 0.8;
      s.gravity = -12;
      s.stretch = 3;
      s.pxMin = 2;
      this.add.emit(s);
    }
    for (let i = 0; i < splinters; i++) {
      s = this.spec(x, y, z, 0.7, 0.22, 0.22, C.splinter, SHAPE.square);
      const a = rand(0, Math.PI * 2);
      const v = rand(4, 7);
      s.vx = Math.cos(a) * v * 0.7;
      s.vz = Math.sin(a) * v * 0.7;
      s.vy = v * 0.7;
      s.gravity = -14;
      s.rot = rand(0, Math.PI);
      s.spin = rand(6, 12) * (Math.random() < 0.5 ? -1 : 1);
      s.pxMin = 3;
      this.alpha.emit(s);
    }
    for (let i = 0; i < 3; i++) {
      s = this.spec(x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4), 1.0, 0.8 * scale, 2.6 * scale, C.hitSmoke, SHAPE.disc);
      s.vy = 0.8;
      s.wind = 1;
      this.alpha.emit(s);
    }
  }

  // ---- §6 Humo y fuego con vida baja ----
  // Cinemática escalada con h = sb_mast_height (D13): v0 = 0,22·h, flotación +0,035·h y vida 3,4 s → la columna
  // sube 0,75h + 0,20h sobre el socket, hasta la punta del mástil más alto. Bocanadas de borde firme (forma 7, D20)
  // de 0,07·h → 0,25·h (claro) o 0,10·h → 0,32·h (denso), × (1 ± 0,15) para que la columna no sea un collar de cuentas
  damageSmoke(x: number, y: number, z: number, dense: boolean, mastHeight: number): void {
    const k = mastHeight * (1 + rand(-0.15, 0.15));
    const s = this.spec(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3), DAMAGE_FX.smokeLife, (dense ? 0.1 : 0.07) * k, (dense ? 0.32 : 0.25) * k, dense ? C.denseSmoke : C.smoke, SHAPE.puff);
    s.vy = 0.22 * mastHeight;
    s.gravity = 0.035 * mastHeight;
    s.wind = 1.2;
    s.pxMin = 6;
    this.alpha.emit(s);
  }

  // Cuerpo de la llama (D21): de 3,0 a 1,2 m × L/24 (mínimo flamePxMin, D35; final 1,2 m en D29, antes 0,9: con el encuadre N1
  // el mínimo en px ya no inflaba el final y el fuego del Mercante quedaba en el límite), nacida en un punto al azar de la elipse de
  // cubierta del socket, de semiejes 0,06·L (eslora) × 0,15·B (manga). Antes nacían a ±0,3 m y se apilaban en un óvalo.
  // Forma 8 (D24): con el sesgo del humo, para que las cuadras braceadas propias no la tapen (Q20)
  flame(x: number, y: number, z: number, heading: number, length: number, beam: number): void {
    const d = Math.sqrt(Math.random());
    const a = rand(0, Math.PI * 2);
    const along = 0.06 * length * d * Math.cos(a);
    const across = 0.15 * beam * d * Math.sin(a);
    const k = length / 24;
    const s = this.spec(x + Math.sin(heading) * along + Math.cos(heading) * across, y, z + Math.cos(heading) * along - Math.sin(heading) * across, DAMAGE_FX.flameLife, 3.0 * k, 1.2 * k, C.flame, SHAPE.damageFlame);
    s.vy = 1.8 + rand(-0.4, 0.4);
    s.pxMin = flamePxMin(length, this.ppm);
    this.alpha.emit(s);
  }

  // Núcleo aditivo (forma 8) en el centro del socket: de 1,5 a 0,6 m × L/24 (mínimo flamePxMin, D35) y vida 0,4 s (D21, D31)
  flameCore(x: number, y: number, z: number, length: number): void {
    const k = length / 24;
    const s = this.spec(x, y, z, DAMAGE_FX.coreLife, 1.5 * k, 0.6 * k, C.flameCore, SHAPE.damageFlame);
    s.vy = 1.8 + rand(-0.4, 0.4);
    s.pxMin = flamePxMin(length, this.ppm, true);
    this.add.emit(s);
  }

  ember(x: number, y: number, z: number): void {
    const s = this.spec(x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4), DAMAGE_FX.emberLife, 0.12, 0.12, C.ember, SHAPE.disc);
    s.vx = rand(-0.4, 0.4);
    s.vy = 3;
    s.vz = rand(-0.4, 0.4);
    s.pxMin = 2;
    this.add.emit(s);
  }

  // ---- §7 Hundimiento ----
  sinkRing(x: number, z: number, length: number): void {
    this.water.emit(this.spec(x, 0, z, 1.2, 0.5 * length, 1.2 * length, C.sinkRing, SHAPE.ring));
  }

  spray(x: number, z: number): void {
    const s = this.spec(x, 0.2, z, 0.6, 0.5, 1.2, C.spray, SHAPE.disc);
    s.vy = 3;
    this.alpha.emit(s);
  }

  steam(x: number, y: number, z: number): void {
    for (let i = 0; i < 4; i++) {
      const s = this.spec(x + rand(-0.5, 0.5), Math.max(0.2, y), z + rand(-0.5, 0.5), 1.2, 1, 3.5, C.steam, SHAPE.disc);
      s.vy = 2;
      this.alpha.emit(s);
    }
  }

  debris(x: number, z: number, length: number): void {
    const k = length / 24;
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2);
      const d = Math.sqrt(Math.random()) * 0.4 * length;
      const s = this.spec(x + Math.cos(a) * d, 0, z + Math.sin(a) * d, 5, 0.3 * k, 0.3 * k, C.plank, SHAPE.square);
      s.vx = Math.cos(a) * 0.3;
      s.vz = Math.sin(a) * 0.3;
      s.rot = rand(0, Math.PI);
      s.spin = 0.3 * (Math.random() < 0.5 ? -1 : 1);
      s.stretch = 1.4 / 0.3;
      this.water.emit(s);
    }
  }

  // ---- §8 Estela ----
  wakeStern(x: number, z: number, heading: number, beam: number, f: number, lifeScale: number): void {
    this.wakeTmp.set(C.wake[0]);
    this.wakeTmp[3] = 0.55 * f;
    this.wakeTmp1.set(C.wake[1]);
    const s = this.spec(x, 0, z, 2.6 * lifeScale, 0.6 * beam, 1.6 * beam, this.wakeColors, SHAPE.foam);
    s.rot = heading;
    s.stretch = 0.8 / 0.6;
    this.water.emit(s);
  }

  wakeBow(x: number, z: number, heading: number, beam: number, speed: number, f: number, side: 1 | -1, lifeScale: number): void {
    this.wakeTmp.set(C.wake[0]);
    this.wakeTmp[3] = 0.45 * f;
    this.wakeTmp1.set(C.wake[1]);
    const s = this.spec(x, 0, z, 1.6 * lifeScale, 0.3 * beam, 0.9 * beam, this.wakeColors, SHAPE.foam);
    // Velocidad lateral perpendicular al rumbo: las dos manchas forman la V del bigote
    s.vx = Math.cos(heading) * side * 0.15 * speed;
    s.vz = -Math.sin(heading) * side * 0.15 * speed;
    s.rot = heading;
    this.water.emit(s);
  }

  // ---- §12 Reaparición: 3 ondas de 2 m a 2,4·L ----
  respawn(x: number, z: number, length: number): void {
    for (let i = 0; i < 3; i++) this.water.emit(this.spec(x, 0, z, 1.2, 2, 2.4 * length, C.ripple, SHAPE.ring, i * 0.2));
  }

  // ---- §13 Reparación ----
  repairCross(x: number, y: number, z: number): void {
    const s = this.spec(x, y, z, 1.0, 0.6, 0.6, C.repair, SHAPE.cross);
    s.vy = 1.2;
    s.pxMin = 6;
    this.alpha.emit(s);
  }

  repairChip(x: number, y: number, z: number): void {
    const s = this.spec(x, y, z, 0.6, 0.2, 0.2, C.chip, SHAPE.square);
    s.vx = rand(-0.5, 0.5);
    s.vy = 2;
    s.vz = rand(-0.5, 0.5);
    s.gravity = -10;
    s.spin = rand(-8, 8);
    this.alpha.emit(s);
  }

  // ---- §14 Restos flotantes ----
  lootSparkle(x: number, y: number, z: number): void {
    const s = this.spec(x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4), 0.4, 0.5, 0.5, C.sparkle, SHAPE.disc);
    s.pxMin = 6;
    this.add.emit(s);
  }

  lootPickup(x: number, z: number): void {
    for (let i = 0; i < 6; i++) {
      const s = this.spec(x, 0.8, z, 0.5, 0.2, 0.2, C.goldSpark, SHAPE.streak);
      const a = (i / 6) * Math.PI * 2;
      s.vx = Math.cos(a) * 3;
      s.vz = Math.sin(a) * 3;
      s.vy = 5;
      s.gravity = -10;
      s.stretch = 3;
      s.pxMin = 3;
      this.add.emit(s);
    }
  }
}

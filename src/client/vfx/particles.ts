// Pool de partículas animadas en la GPU (VFX-SPEC §0.3): ring buffer de tamaño fijo, la CPU solo escribe al
// emitir y sube el rango tocado; el vertex shader calcula posición, tamaño y color con uTime. Sin texturas.
import * as THREE from 'three';

export const SHAPE = { disc: 0, ring: 1, flame: 2, square: 3, streak: 4, foam: 5, cross: 6, puff: 7, damageFlame: 8 } as const;

// Formas 7 (bocanada, D20) y 8 (llama de daño, D24): 7 m hacia la cámara solo en profundidad (D31; antes 6, con
// oclusión residual del gratil del trinquete del Mercante, a ≈ 6,7 m). En ortográfica no mueve la imagen; así el
// aparejo propio (la cangreja abierta de D12, las cuadras braceadas) no tapa el humo ni el fuego de vida baja (VFX §0.3)
export const FX_BIAS_M = 7;

// Partícula a emitir: objeto de trabajo reutilizable (se rellena y se pasa a emit, sin asignar)
export interface ParticleSpec {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  t0: number; // s (reloj de VFX); puede ser futuro para un retraso
  life: number;
  s0: number; s1: number; // tamaño (diámetro, m)
  gravity: number; // m/s², + = sube
  drag: number; // s⁻¹
  c0: Float32Array; c1: Float32Array; // RGBA lineal
  shape: number;
  rot: number; spin: number; stretch: number;
  pxMin: number;
  wind: number; // factor del viento global del pool
}

export function makeSpec(): ParticleSpec {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t0: 0, life: 1, s0: 1, s1: 1, gravity: 0, drag: 0,
    c0: new Float32Array(4), c1: new Float32Array(4), shape: 0, rot: 0, spin: 0, stretch: 1, pxMin: 0, wind: 0
  };
}

export interface PoolOptions {
  capacity: number;
  mode: 'billboard' | 'water';
  blending: 'add' | 'alpha';
  renderOrder: number;
  opaquePass?: boolean; // dibujar en la pasada opaca (antes que islas y barcos) con mezcla alfa
  waterY?: number;
}

const vertexShader = /* glsl */ `
attribute vec4 aP0T0;
attribute vec4 aV0Life;
attribute vec4 aSize;
attribute vec4 aC0;
attribute vec4 aC1;
attribute vec4 aMisc;
attribute vec2 aExtra;
uniform float uTime;
uniform float uPpm;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uWind;
uniform float uWaterY;
uniform float uFxBias;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vSeed;

void main() {
  float tau = uTime - aP0T0.w;
  float life = aV0Life.w;
  if (tau < 0.0 || tau > life || life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float x = tau / life;
  float drag = aSize.w;
  vec3 disp = drag > 0.0 ? aV0Life.xyz * (1.0 - exp(-drag * tau)) / drag : aV0Life.xyz * tau;
  vec3 p = aP0T0.xyz + disp + vec3(0.0, 0.5 * aSize.z * tau * tau, 0.0) + uWind * aExtra.y * tau;
  float size = max(mix(aSize.x, aSize.y, 1.0 - (1.0 - x) * (1.0 - x)), aExtra.x / uPpm);
  float ang = aMisc.y + aMisc.z * tau;
  vec2 c = position.xy;
  c.x *= aMisc.w;
#ifdef WATER
  vec2 r = c * size;
  float ca = cos(ang);
  float sa = sin(ang);
  p.x += ca * r.x + sa * r.y;
  p.z += -sa * r.x + ca * r.y;
  p.y = uWaterY;
#else
  if (aMisc.x > 3.5 && aMisc.x < 4.5) {
    // Chispa: se estira en la dirección de la velocidad proyectada en pantalla
    vec3 v = (drag > 0.0 ? aV0Life.xyz * exp(-drag * tau) : aV0Life.xyz) + vec3(0.0, aSize.z * tau, 0.0);
    ang = atan(dot(v, uCamUp), dot(v, uCamRight));
  }
  float ca = cos(ang);
  float sa = sin(ang);
  vec2 r = vec2(ca * c.x - sa * c.y, sa * c.x + ca * c.y) * size;
  p += uCamRight * r.x + uCamUp * r.y;
#endif
  vec4 mv = viewMatrix * vec4(p, 1.0);
#ifndef WATER
  if (aMisc.x > 6.5) mv.z += uFxBias;
#endif
  gl_Position = projectionMatrix * mv;
  vColor = mix(aC0, aC1, x);
  // Forma 7: opaca hasta el 55 % de la vida y apagada en el último 45 % (ignora aC1.a)
  vColor.a = aMisc.x > 6.5 && aMisc.x < 7.5 ? aC0.a * (1.0 - smoothstep(0.55, 1.0, x)) : vColor.a;
  vColor.a *= smoothstep(0.0, 0.08, x);
  vUv = position.xy * 2.0;
  vShape = aMisc.x;
  vSeed = fract(aP0T0.w * 7.31 + aP0T0.x * 0.173);
}
`;

const fragmentShader = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vSeed;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float r = length(vUv);
  int shape = int(vShape + 0.5);
  vec3 rgb = vColor.rgb;
  float a;
  if (shape == 0) a = 1.0 - smoothstep(0.3, 1.0, r);
  else if (shape == 1) a = smoothstep(0.7, 0.82, r) * (1.0 - smoothstep(0.92, 1.0, r));
  else if (shape == 2 || shape == 8) {
    vec2 q = vec2(vUv.x * 1.5, vUv.y < 0.0 ? vUv.y * 1.4 : vUv.y * 0.7);
    a = 1.0 - smoothstep(0.35, 1.0, length(q));
  }
  else if (shape == 3) a = 1.0 - smoothstep(0.7, 0.95, max(abs(vUv.x), abs(vUv.y)));
  else if (shape == 4) a = 1.0 - smoothstep(0.15, 1.0, r);
  else if (shape == 5) {
    // Mancha de espuma: ruido de valor interpolado (sin bloques) sobre un disco suave
    vec2 q = vUv * 2.5 + vSeed * 9.0;
    vec2 i = floor(q);
    vec2 f = fract(q);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float n = mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    a = (1.0 - smoothstep(0.35, 1.0, r)) * (0.45 + 0.55 * n);
  }
  else if (shape == 7) {
    // Bocanada: borde firme y luz cenital (más clara arriba)
    a = 1.0 - smoothstep(0.6, 1.0, r);
    rgb *= 0.9 + 0.2 * smoothstep(-0.6, 0.6, vUv.y);
  }
  else {
    float bar = min(max(abs(vUv.x) - 0.2, abs(vUv.y) - 0.8), max(abs(vUv.y) - 0.2, abs(vUv.x) - 0.8));
    a = 1.0 - smoothstep(-0.08, 0.04, bar);
  }
  a *= vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const ATTRS = [
  ['aP0T0', 4],
  ['aV0Life', 4],
  ['aSize', 4],
  ['aC0', 4],
  ['aC1', 4],
  ['aMisc', 4],
  ['aExtra', 2]
] as const;

type AttrName = (typeof ATTRS)[number][0];

export class ParticlePool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly capacity: number;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly attrs: Record<AttrName, THREE.InstancedBufferAttribute>;
  private readonly arrays: Record<AttrName, Float32Array>;
  private readonly deaths: Float32Array;
  private head = 0;
  private emitted = 0;
  private dirtyMin = Infinity;
  private dirtyMax = -1;
  private lastDeath = 0;
  // Nacidas y Σ de sus vidas (s) por forma (SHAPE) desde que existe el pool, para los e2e de D32 (O-66): solo cuentan,
  // no cambian lo que se emite ni lo que se ve
  readonly born = new Float64Array(Math.max(...Object.values(SHAPE)) + 1);
  readonly bornLife = new Float64Array(this.born.length);

  constructor(opts: PoolOptions) {
    this.capacity = opts.capacity;
    const base = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = base.index;
    this.geometry.setAttribute('position', base.getAttribute('position'));
    this.attrs = {} as Record<AttrName, THREE.InstancedBufferAttribute>;
    this.arrays = {} as Record<AttrName, Float32Array>;
    for (const [name, size] of ATTRS) {
      const array = new Float32Array(opts.capacity * size);
      const attr = new THREE.InstancedBufferAttribute(array, size);
      attr.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, attr);
      this.attrs[name] = attr;
      this.arrays[name] = array;
    }
    this.deaths = new Float32Array(opts.capacity);
    this.geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: opts.mode === 'water' ? { WATER: 1 } : {},
      uniforms: {
        uTime: { value: 0 },
        uPpm: { value: 5 },
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
        uWind: { value: new THREE.Vector3() },
        uWaterY: { value: opts.waterY ?? 0.03 },
        uFxBias: { value: FX_BIAS_M }
      },
      depthWrite: false,
      toneMapped: false,
      // Los quads horizontales mapean (x, y) local → (x, z) de mundo: es una reflexión y se verían por detrás
      side: THREE.DoubleSide
    });
    if (opts.blending === 'add') {
      material.transparent = true;
      material.blending = THREE.AdditiveBlending;
    } else if (opts.opaquePass) {
      // Mezcla alfa dentro de la lista opaca: así respeta renderOrder frente a islas y barcos (VFX §0.2)
      material.transparent = false;
      material.blending = THREE.CustomBlending;
      material.blendSrc = THREE.SrcAlphaFactor;
      material.blendDst = THREE.OneMinusSrcAlphaFactor;
      material.blendSrcAlpha = THREE.OneFactor; // VFX §0.2: el alfa del framebuffer se queda en 1
      material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    } else {
      material.transparent = true;
    }
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder;
    this.mesh.visible = false;
    base.dispose();
  }

  emit(p: ParticleSpec): void {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    this.emitted++;
    this.born[p.shape]++;
    this.bornLife[p.shape] += p.life;
    const a = this.arrays;
    let o = i * 4;
    a.aP0T0[o] = p.x; a.aP0T0[o + 1] = p.y; a.aP0T0[o + 2] = p.z; a.aP0T0[o + 3] = p.t0;
    a.aV0Life[o] = p.vx; a.aV0Life[o + 1] = p.vy; a.aV0Life[o + 2] = p.vz; a.aV0Life[o + 3] = p.life;
    a.aSize[o] = p.s0; a.aSize[o + 1] = p.s1; a.aSize[o + 2] = p.gravity; a.aSize[o + 3] = p.drag;
    a.aC0.set(p.c0, o);
    a.aC1.set(p.c1, o);
    a.aMisc[o] = p.shape; a.aMisc[o + 1] = p.rot; a.aMisc[o + 2] = p.spin; a.aMisc[o + 3] = p.stretch;
    o = i * 2;
    a.aExtra[o] = p.pxMin; a.aExtra[o + 1] = p.wind;
    const death = p.t0 + p.life;
    this.deaths[i] = death;
    if (death > this.lastDeath) this.lastDeath = death;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  // Sube a la GPU solo el rango escrito desde el último frame y apaga el pool si no queda nada vivo
  update(time: number, ppm: number, camRight: THREE.Vector3, camUp: THREE.Vector3, wind?: THREE.Vector3): void {
    const u = this.mesh.material.uniforms;
    u.uTime.value = time;
    u.uPpm.value = ppm;
    u.uCamRight.value.copy(camRight);
    u.uCamUp.value.copy(camUp);
    if (wind) u.uWind.value.copy(wind);
    if (this.dirtyMax >= 0) {
      for (const [name, size] of ATTRS) {
        const attr = this.attrs[name];
        attr.clearUpdateRanges();
        attr.addUpdateRange(this.dirtyMin * size, (this.dirtyMax - this.dirtyMin + 1) * size);
        attr.needsUpdate = true;
      }
      this.dirtyMin = Infinity;
      this.dirtyMax = -1;
    }
    this.geometry.instanceCount = Math.min(this.emitted, this.capacity);
    this.mesh.visible = time < this.lastDeath;
  }

  // Instancias vivas (contador de depuración, VFX-03); con shape, solo las de esa forma (QA de D32)
  live(time: number, shape?: number): number {
    let n = 0;
    const count = Math.min(this.emitted, this.capacity);
    for (let i = 0; i < count; i++) {
      const t0 = this.arrays.aP0T0[i * 4 + 3];
      if (time >= t0 && time <= this.deaths[i] && (shape === undefined || this.arrays.aMisc[i * 4] === shape)) n++;
    }
    return n;
  }

  dispose(): void {
    this.geometry.dispose();
    this.mesh.material.dispose();
  }
}

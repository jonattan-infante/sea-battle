// RINGS (VFX-SPEC §0.2, §10–12, §14): un único draw call de quads horizontales con un shader de anillo.
// La CPU reescribe cada frame los anillos activos (≤ 30). Trazo y contorno en px de pantalla (fwidth), así que
// se ven igual en escritorio y en móvil. Modos: anillo, punto, aspa y línea discontinua.
import * as THREE from 'three';

export const RING_MODE = { ring: 0, dot: 1, cross: 2, line: 3 } as const;

export interface RingSpec {
  x: number;
  z: number;
  radius: number; // m (punto/aspa: radio en m de la figura)
  mode: number;
  strokePx: number;
  dashes: number; // > 0: nº de trazos; < 0: −periodo en m; 0: continuo
  fill: number; // fracción llena de cada periodo
  phase: number; // rad
  color: Float32Array; // RGBA lineal
  outlinePx: number;
  outlineAlpha: number;
  x2: number; // fin de la línea
  z2: number;
}

export function makeRing(): RingSpec {
  return {
    x: 0, z: 0, radius: 1, mode: 0, strokePx: 2, dashes: 0, fill: 1, phase: 0,
    color: new Float32Array([1, 1, 1, 1]), outlinePx: 0, outlineAlpha: 0, x2: 0, z2: 0
  };
}

const vertexShader = /* glsl */ `
attribute vec4 aCenter; // x, z, radio, modo
attribute vec4 aStyle; // trazo px, trazos, fracción, fase
attribute vec4 aColor;
attribute vec4 aOutline; // contorno px, alfa del contorno, fin de línea x, z
uniform float uPpm;
uniform float uY;
varying vec2 vLocal;
varying vec4 vCenter;
varying vec4 vStyle;
varying vec4 vColor;
varying vec2 vOutline;

void main() {
  vec2 c = position.xy;
  vec2 wp;
  float margin = (aStyle.x + 2.0 * aOutline.x + 4.0) / uPpm;
  if (aCenter.w > 2.5) {
    vec2 d = aOutline.zw - aCenter.xy;
    float len = max(length(d), 1e-3);
    vec2 dir = d / len;
    vec2 nrm = vec2(-dir.y, dir.x);
    vLocal = vec2((c.x + 0.5) * len, c.y * 2.0 * margin);
    wp = aCenter.xy + dir * vLocal.x + nrm * vLocal.y;
  } else {
    float half_ = aCenter.z + margin;
    vLocal = c * 2.0 * half_;
    wp = aCenter.xy + vLocal;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(wp.x, uY, wp.y, 1.0);
  vCenter = aCenter;
  vStyle = aStyle;
  vColor = aColor;
  vOutline = aOutline.xy;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uOutlineColor;
varying vec2 vLocal;
varying vec4 vCenter;
varying vec4 vStyle;
varying vec4 vColor;
varying vec2 vOutline;

void main() {
  float mode = vCenter.w;
  float halfStroke = vStyle.x * 0.5;
  float dpx;
  float dash = 1.0;
  if (mode < 0.5) {
    float r = length(vLocal);
    float aa = max(fwidth(r), 1e-5);
    dpx = abs(r - vCenter.z) / aa;
    if (abs(vStyle.y) > 0.0) {
      float ang = atan(vLocal.y, vLocal.x) + vStyle.w;
      float k = vStyle.y > 0.0 ? ang / 6.2831853 * vStyle.y : ang * vCenter.z / -vStyle.y;
      float f = fract(k);
      float fw = max(fwidth(k), 1e-4);
      dash = smoothstep(0.0, fw, f) * (1.0 - smoothstep(vStyle.z - fw, vStyle.z, f));
    }
  } else if (mode < 1.5) {
    float r = length(vLocal);
    float aa = max(fwidth(r), 1e-5);
    dpx = max(r / aa - vCenter.z / aa + halfStroke, 0.0);
  } else if (mode < 2.5) {
    vec2 q = abs(vLocal);
    float aa = max(fwidth(vLocal.x), 1e-5);
    float diag = abs(q.x - q.y) * 0.70710678;
    float ends = max(q.x, q.y) - vCenter.z;
    dpx = max(diag / aa, ends > 0.0 ? ends / aa + halfStroke : 0.0);
  } else {
    float aa = max(fwidth(vLocal.y), 1e-5);
    dpx = abs(vLocal.y) / aa;
    float along = vLocal.x / max(fwidth(vLocal.x), 1e-5);
    dash = step(0.5, fract(along / 8.0));
  }
  float core = 1.0 - smoothstep(halfStroke - 0.5, halfStroke + 0.5, dpx);
  float outer = vOutline.x > 0.0 ? 1.0 - smoothstep(halfStroke + vOutline.x - 0.5, halfStroke + vOutline.x + 0.5, dpx) : 0.0;
  float a = core * vColor.a;
  float oa = (outer - core) * vOutline.y;
  float alpha = (a + oa * (1.0 - a)) * dash;
  if (alpha < 0.004) discard;
  vec3 rgb = mix(uOutlineColor, vColor.rgb, a / max(a + oa * (1.0 - a), 1e-4));
  gl_FragColor = vec4(rgb, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class RingLayer {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly capacity: number;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly center: THREE.InstancedBufferAttribute;
  private readonly style: THREE.InstancedBufferAttribute;
  private readonly color: THREE.InstancedBufferAttribute;
  private readonly outline: THREE.InstancedBufferAttribute;
  private count = 0;

  constructor(capacity: number, outlineHex: string, renderOrder: number) {
    this.capacity = capacity;
    const base = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = base.index;
    this.geometry.setAttribute('position', base.getAttribute('position'));
    const make = (name: string) => {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, attr);
      return attr;
    };
    this.center = make('aCenter');
    this.style = make('aStyle');
    this.color = make('aColor');
    this.outline = make('aOutline');
    this.geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uPpm: { value: 5 }, uY: { value: 0.05 }, uOutlineColor: { value: new THREE.Color(outlineHex) } },
      // Lista opaca + mezcla alfa + sin prueba de profundidad: se pinta sobre las islas y los barcos lo tapan
      transparent: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide // quad horizontal: (x, y) local → (x, z) de mundo invierte el sentido de giro
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    base.dispose();
  }

  begin(): void {
    this.count = 0;
  }

  push(r: RingSpec): boolean {
    if (this.count >= this.capacity) return false;
    const i = this.count++ * 4;
    const c = this.center.array as Float32Array;
    const s = this.style.array as Float32Array;
    const o = this.outline.array as Float32Array;
    c[i] = r.x; c[i + 1] = r.z; c[i + 2] = r.radius; c[i + 3] = r.mode;
    s[i] = r.strokePx; s[i + 1] = r.dashes; s[i + 2] = r.fill; s[i + 3] = r.phase;
    (this.color.array as Float32Array).set(r.color, i);
    o[i] = r.outlinePx; o[i + 1] = r.outlineAlpha; o[i + 2] = r.x2; o[i + 3] = r.z2;
    return true;
  }

  end(ppm: number): void {
    this.mesh.material.uniforms.uPpm.value = ppm;
    for (const attr of [this.center, this.style, this.color, this.outline]) {
      attr.clearUpdateRanges();
      if (this.count > 0) {
        attr.addUpdateRange(0, this.count * 4);
        attr.needsUpdate = true;
      }
    }
    this.geometry.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
  }

  get active(): number {
    return this.count;
  }

  dispose(): void {
    this.geometry.dispose();
    this.mesh.material.dispose();
  }
}

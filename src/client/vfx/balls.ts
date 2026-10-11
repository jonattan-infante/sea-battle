// P_BALL, P_BALL_SHADOW y P_CONTACT (VFX-SPEC §0.2, §3, §8): instancias que la CPU reescribe cada frame.
// Las balas tienen tamaño constante en pantalla; la sombra en el agua es la que hace legible el arco.
import * as THREE from 'three';

const ballVertex = /* glsl */ `
attribute vec4 aBall; // x, y, z, alfa
uniform float uSizeM;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec3 p = aBall.xyz + (uCamRight * position.x + uCamUp * position.y) * uSizeM;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vUv = position.xy * 2.0;
  vAlpha = aBall.w;
}
`;

const ballFragment = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uRim;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float r = length(vUv);
  float aa = fwidth(r);
  float a = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * vAlpha;
  if (a < 0.01) discard;
  vec3 c = mix(uCore, uRim, smoothstep(0.7 - aa, 0.7 + aa, r));
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const flatVertex = /* glsl */ `
attribute vec4 aFlat; // x, z, rumbo, alfa
attribute vec2 aDims; // ancho (X local), largo (Z local) en m
uniform float uY;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec2 c = position.xy * aDims;
  float ca = cos(aFlat.z);
  float sa = sin(aFlat.z);
  vec3 p = vec3(aFlat.x + ca * c.x + sa * c.y, uY, aFlat.y - sa * c.x + ca * c.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vUv = position.xy * 2.0;
  vAlpha = aFlat.w;
}
`;

const shadowFragment = /* glsl */ `
varying vec2 vUv;
varying float vAlpha;
void main() {
  float r = length(vUv);
  float a = (1.0 - smoothstep(0.6, 1.0, r)) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`;

const contactFragment = /* glsl */ `
uniform vec3 uFoam;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float r = length(vUv);
  float a = smoothstep(0.55, 0.8, r) * (1.0 - smoothstep(0.85, 1.0, r)) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uFoam, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function instanced(capacity: number, attrs: [string, number][]): { geometry: THREE.InstancedBufferGeometry; arrays: Float32Array[]; attributes: THREE.InstancedBufferAttribute[] } {
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  const arrays: Float32Array[] = [];
  const attributes: THREE.InstancedBufferAttribute[] = [];
  for (const [name, size] of attrs) {
    const array = new Float32Array(capacity * size);
    const attr = new THREE.InstancedBufferAttribute(array, size);
    attr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attr);
    arrays.push(array);
    attributes.push(attr);
  }
  geometry.instanceCount = 0;
  base.dispose();
  return { geometry, arrays, attributes };
}

function commit(geometry: THREE.InstancedBufferGeometry, attributes: THREE.InstancedBufferAttribute[], count: number, mesh: THREE.Mesh): void {
  for (const attr of attributes) {
    attr.clearUpdateRanges();
    if (count > 0) {
      attr.addUpdateRange(0, count * attr.itemSize);
      attr.needsUpdate = true;
    }
  }
  geometry.instanceCount = count;
  mesh.visible = count > 0;
}

// Balas (billboard de tamaño constante en px) y sus sombras (elipse en el agua)
export class BallLayer {
  readonly balls: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly shadows: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly capacity: number;
  private readonly ballData: ReturnType<typeof instanced>;
  private readonly shadowData: ReturnType<typeof instanced>;
  private count = 0;

  constructor(capacity: number, core: string, rim: string) {
    this.capacity = capacity;
    this.ballData = instanced(capacity, [['aBall', 4]]);
    this.shadowData = instanced(capacity, [['aFlat', 4], ['aDims', 2]]);
    this.balls = new THREE.Mesh(this.ballData.geometry, new THREE.ShaderMaterial({
      vertexShader: ballVertex,
      fragmentShader: ballFragment,
      uniforms: {
        uSizeM: { value: 1 },
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
        uCore: { value: new THREE.Color(core) },
        uRim: { value: new THREE.Color(rim) }
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false
    }));
    this.shadows = new THREE.Mesh(this.shadowData.geometry, new THREE.ShaderMaterial({
      vertexShader: flatVertex,
      fragmentShader: shadowFragment,
      uniforms: { uY: { value: 0.04 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide // quad horizontal: (x, y) local → (x, z) de mundo invierte el sentido de giro
    }));
    for (const [mesh, order] of [[this.shadows, 6], [this.balls, 7]] as const) {
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      mesh.visible = false;
    }
  }

  begin(): void {
    this.count = 0;
  }

  // Bala en (x, y, z) y su sombra en el agua: ancho en m y opacidad dados por la altura relativa del arco
  push(x: number, y: number, z: number, shadowSizeM: number, shadowAlpha: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    const b = this.ballData.arrays[0];
    b[i * 4] = x; b[i * 4 + 1] = y; b[i * 4 + 2] = z; b[i * 4 + 3] = 1;
    const f = this.shadowData.arrays[0];
    const d = this.shadowData.arrays[1];
    f[i * 4] = x; f[i * 4 + 1] = z; f[i * 4 + 2] = 0; f[i * 4 + 3] = shadowAlpha;
    d[i * 2] = shadowSizeM; d[i * 2 + 1] = shadowSizeM;
  }

  end(sizeM: number, camRight: THREE.Vector3, camUp: THREE.Vector3): void {
    const u = this.balls.material.uniforms;
    u.uSizeM.value = sizeM;
    u.uCamRight.value.copy(camRight);
    u.uCamUp.value.copy(camUp);
    commit(this.ballData.geometry, this.ballData.attributes, this.count, this.balls);
    commit(this.shadowData.geometry, this.shadowData.attributes, this.count, this.shadows);
  }

  get active(): number {
    return this.count;
  }

  dispose(): void {
    for (const mesh of [this.balls, this.shadows]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}

// Espuma de contacto bajo cada casco: elipse anular orientada al rumbo, siempre visible (VFX §8)
export class ContactLayer {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly capacity: number;
  private readonly data: ReturnType<typeof instanced>;
  private count = 0;

  constructor(capacity: number, foam: string, renderOrder: number) {
    this.capacity = capacity;
    this.data = instanced(capacity, [['aFlat', 4], ['aDims', 2]]);
    this.mesh = new THREE.Mesh(this.data.geometry, new THREE.ShaderMaterial({
      vertexShader: flatVertex,
      fragmentShader: contactFragment,
      uniforms: { uY: { value: 0.02 }, uFoam: { value: new THREE.Color(foam) } },
      transparent: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, // VFX §0.2: el alfa del framebuffer se queda en 1
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
  }

  begin(): void {
    this.count = 0;
  }

  push(x: number, z: number, heading: number, width: number, length: number, alpha: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    const f = this.data.arrays[0];
    const d = this.data.arrays[1];
    f[i * 4] = x; f[i * 4 + 1] = z; f[i * 4 + 2] = heading; f[i * 4 + 3] = alpha;
    d[i * 2] = width; d[i * 2 + 1] = length;
  }

  end(): void {
    commit(this.data.geometry, this.data.attributes, this.count, this.mesh);
  }

  get active(): number {
    return this.count;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// Sombra en el agua de los GLB de la receta (palanca 4 de D91; ASSET-SPEC §13, fila 6): el LOD1 del barco proyectado
// por LIGHTING.sunDir sobre y = SHADOW_Y, recortado por el agua antes de proyectar (el fragmento descarta donde la y de
// origen es < 0, así que se encoge al hundirse, sin fundido aparte), que quita al agua el 40 % de la luz en lineal una
// sola vez por píxel (stencil). Sin desenfoque: el borde es el del MSAA. Los procedurales no la llevan (U1): solo se
// empuja la de los barcos con el GLB ya puesto. Una malla instanciada por geometría de LOD1 (una por clase con GLB),
// reescrita en cada frame; se dibuja justo detrás del océano (RENDER_ORDER.shipShadows)
import * as THREE from 'three';
import { LIGHTING } from '../art';
import { RENDER_ORDER } from '../vfx/effects';

export const SHADOW_Y = 0.005;
// −40 % de luz en lineal. El lienzo guarda sRGB de 8 bits y la mezcla multiplica ahí: × 0,78 da 0,60 en lineal en el
// agua profunda y de 0,58 a 0,62 en el resto de la paleta del agua (ship-shadow.test.ts)
export const SHADOW_SRGB_FACTOR = 0.78;

const vertexShader = /* glsl */ `
uniform vec3 uSunDir;
uniform float uY;
varying float vY;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vY = w.y;
  w.xyz -= uSunDir * ((w.y - uY) / uSunDir.y);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// La proyección es afín: la y de origen se interpola sin error y el corte cae en la línea de flotación
const fragmentShader = /* glsl */ `
varying float vY;
void main() {
  if (vY < 0.0) discard;
  gl_FragColor = vec4(vec3(${SHADOW_SRGB_FACTOR.toFixed(2)}), 1.0);
}
`;

const FIRST_CAPACITY = 8;

export class ShipShadows {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  private readonly meshes = new Map<THREE.BufferGeometry, THREE.InstancedMesh>();

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uSunDir: { value: new THREE.Vector3(...LIGHTING.sunDir) }, uY: { value: SHADOW_Y } },
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor, // destino × factor
      blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.OneFactor, // VFX §0.2: el alfa del framebuffer se queda en 1
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      // Una sola vez por píxel: el primer fragmento marca el stencil y los que caen encima no pasan
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
      depthWrite: false,
      side: THREE.DoubleSide // la proyección da la vuelta a la mitad de los triángulos
    });
  }

  begin(): void {
    for (const mesh of this.meshes.values()) mesh.count = 0;
  }

  // La sombra de un barco: el LOD1 de su GLB con la matriz de su malla
  push(lod1: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
    let mesh = this.meshes.get(lod1);
    if (!mesh || mesh.count === mesh.instanceMatrix.count) mesh = this.grow(lod1, mesh);
    mesh.setMatrixAt(mesh.count++, matrix);
  }

  end(): void {
    for (const mesh of this.meshes.values()) {
      mesh.visible = mesh.count > 0;
      if (mesh.visible) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
    this.group.clear();
    this.material.dispose();
  }

  // Otra malla con el doble de capacidad y las instancias ya puestas en este frame
  private grow(lod1: THREE.BufferGeometry, old: THREE.InstancedMesh | undefined): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(lod1, this.material, old ? old.instanceMatrix.count * 2 : FIRST_CAPACITY);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = RENDER_ORDER.shipShadows;
    mesh.count = 0;
    if (old) {
      (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array);
      mesh.count = old.count;
      this.group.remove(old);
      old.dispose();
    }
    this.meshes.set(lod1, mesh);
    this.group.add(mesh);
    return mesh;
  }
}

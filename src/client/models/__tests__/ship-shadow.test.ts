// Sombra en el agua de los GLB de la receta (D91 palanca 4; ASSET-SPEC §13, fila 6, U1–U4 de dev-render): el LOD1
// proyectado por el sol sobre el agua, que le quita el 40 % de la luz en lineal una sola vez por píxel
import * as THREE from 'three';
import { LIGHTING, PALETTE } from '../../art';
import { RENDER_ORDER } from '../../vfx/effects';
import { SHADOW_SRGB_FACTOR, SHADOW_Y, ShipShadows } from '../ship-shadow';

const lin = (s: number) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
// Luminancia lineal de un color sRGB de 8 bits
const lum = (rgb: number[]) => [0.2126, 0.7152, 0.0722].reduce((a, w, i) => a + w * lin(rgb[i] / 255), 0);
const bytes = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('la sombra en el agua', () => {
  test('el factor del lienzo sRGB quita el 40 % de la luz en lineal al agua: 0,60 ± 0,03 en toda la paleta del agua, con el redondeo a 8 bits', () => {
    const water = ['oceanDeep', 'oceanTrough', 'oceanCrest', 'oceanShallow', 'oceanShore', 'oceanEdge', 'calmWater'] as const;
    const ratios = Object.fromEntries(water.map((k) => {
      const rgb = bytes(PALETTE[k]);
      return [k, lum(rgb.map((c) => Math.round(c * SHADOW_SRGB_FACTOR))) / lum(rgb)];
    }));
    for (const [k, r] of Object.entries(ratios)) expect([k, Math.abs(r - 0.6) <= 0.03]).toEqual([k, true]);
    // En el agua profunda, el color de fondo del mar (§4), a menos de 0,005
    expect(Math.abs(ratios.oceanDeep - 0.6)).toBeLessThan(0.005);
  });

  test('el material multiplica el agua por el factor, una sola vez por píxel (stencil), sin escribir profundidad y con el alfa del lienzo en 1', () => {
    const shadows = new ShipShadows();
    const m = shadows.material;
    expect([m.blending, m.blendEquation, m.blendSrc, m.blendDst]).toEqual([THREE.CustomBlending, THREE.AddEquation, THREE.ZeroFactor, THREE.SrcColorFactor]);
    expect([m.blendSrcAlpha, m.blendDstAlpha]).toEqual([THREE.OneFactor, THREE.OneMinusSrcAlphaFactor]); // VFX §0.2
    expect([m.stencilWrite, m.stencilRef, m.stencilFunc, m.stencilZPass, m.stencilFail, m.stencilZFail]).toEqual([true, 1, THREE.NotEqualStencilFunc, THREE.ReplaceStencilOp, THREE.KeepStencilOp, THREE.KeepStencilOp]);
    expect([m.depthWrite, m.depthTest, m.transparent, m.side]).toEqual([false, true, false, THREE.DoubleSide]);
    expect(m.fragmentShader).toContain(`vec3(${SHADOW_SRGB_FACTOR.toFixed(2)})`);
    // La luz del juego y el plano del agua
    expect((m.uniforms.uSunDir.value as THREE.Vector3).toArray()).toEqual([...LIGHTING.sunDir]);
    expect(m.uniforms.uY.value).toBe(SHADOW_Y);
    expect(SHADOW_Y).toBe(0.005);
    shadows.dispose();
  });

  test('recorta por el agua antes de proyectar: el fragmento descarta donde la y de origen es < 0, así que se encoge al hundirse', () => {
    const shadows = new ShipShadows();
    expect(shadows.material.vertexShader).toMatch(/vY = w\.y;[\s\S]*w\.xyz -= uSunDir \* \(\(w\.y - uY\) \/ uSunDir\.y\);/);
    expect(shadows.material.fragmentShader).toMatch(/if \(vY < 0\.0\) discard;/);
    shadows.dispose();
  });

  test('se dibuja justo detrás del océano: antes que las partículas del agua, la espuma, las islas y los barcos', () => {
    const shadows = new ShipShadows();
    const order = RENDER_ORDER.shipShadows;
    expect(order).toBeGreaterThan(RENDER_ORDER.ocean);
    expect(Object.entries(RENDER_ORDER).filter(([k, v]) => k !== 'ocean' && k !== 'shipShadows' && v <= order)).toEqual([]);
    const g = new THREE.BoxGeometry();
    shadows.begin();
    shadows.push(g, new THREE.Matrix4());
    shadows.end();
    const mesh = shadows.group.children[0] as THREE.InstancedMesh;
    expect([mesh.renderOrder, mesh.frustumCulled, mesh.matrixAutoUpdate]).toEqual([order, false, false]);
    shadows.dispose();
  });

  test('una malla instanciada por geometría de LOD1, con una instancia por barco en el frame y las vacías ocultas', () => {
    const shadows = new ShipShadows();
    const gunboat = new THREE.BoxGeometry();
    const captain = new THREE.BoxGeometry();
    const at = (x: number) => new THREE.Matrix4().makeTranslation(x, 0, 0);
    shadows.begin();
    shadows.push(gunboat, at(1));
    shadows.push(captain, at(2));
    shadows.push(gunboat, at(3));
    shadows.end();
    const meshes = shadows.group.children as THREE.InstancedMesh[];
    const byGeometry = (g: THREE.BufferGeometry) => meshes.find((m) => m.geometry === g)!;
    const xs = (m: THREE.InstancedMesh) => Array.from({ length: m.count }, (_, i) => { const t = new THREE.Matrix4(); m.getMatrixAt(i, t); return t.elements[12]; });
    expect(meshes.length).toBe(2);
    expect([xs(byGeometry(gunboat)), xs(byGeometry(captain))]).toEqual([[1, 3], [2]]);
    expect(meshes.every((m) => m.visible && m.material === shadows.material)).toBe(true);
    // Otro frame sin el Capitán: su malla se oculta y la de la Cañonera vuelve a empezar
    shadows.begin();
    shadows.push(gunboat, at(5));
    shadows.end();
    expect([xs(byGeometry(gunboat)), byGeometry(gunboat).visible, byGeometry(captain).count, byGeometry(captain).visible]).toEqual([[5], true, 0, false]);
    shadows.dispose();
  });

  test('crece al pasar de su capacidad sin perder las instancias del frame ni dejar la malla vieja en el grupo', () => {
    const shadows = new ShipShadows();
    const g = new THREE.BoxGeometry();
    const n = 40;
    shadows.begin();
    for (let i = 0; i < n; i++) shadows.push(g, new THREE.Matrix4().makeTranslation(i, 0, 0));
    shadows.end();
    const meshes = shadows.group.children as THREE.InstancedMesh[];
    expect(meshes.length).toBe(1);
    const xs = Array.from({ length: meshes[0].count }, (_, i) => { const t = new THREE.Matrix4(); meshes[0].getMatrixAt(i, t); return t.elements[12]; });
    expect(xs).toEqual(Array.from({ length: n }, (_, i) => i));
    shadows.dispose();
  });

  test('dispose libera el material y las mallas instanciadas, pero no las geometrías de LOD1, que son del modelo', () => {
    const shadows = new ShipShadows();
    const g = new THREE.BoxGeometry();
    const geometryDisposed = jest.fn();
    g.addEventListener('dispose', geometryDisposed);
    const materialDisposed = jest.fn();
    shadows.material.addEventListener('dispose', materialDisposed);
    shadows.begin();
    shadows.push(g, new THREE.Matrix4());
    shadows.end();
    const mesh = shadows.group.children[0] as THREE.InstancedMesh;
    const meshDisposed = jest.fn();
    mesh.addEventListener('dispose', meshDisposed);
    shadows.dispose();
    expect([materialDisposed.mock.calls.length, meshDisposed.mock.calls.length, geometryDisposed.mock.calls.length, shadows.group.children.length]).toEqual([1, 1, 0, 0]);
  });
});

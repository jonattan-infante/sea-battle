// Luz de forma de los GLB de la receta (palanca 3 de D91; ASSET-SPEC §13, fila 6, U5 de dev-render): en la madera del
// casco (_rim_mask), la hemisférica × mix(1, KH, rim) y el sol directo, difuso y especular, × mix(1, KS, rim), con
// KS = 2,0 y KH = 0,68969 (scripts/ux/laminas/lamina_cadena.py:28-30). Solo en el material con atlas
import * as THREE from 'three';
import { LIGHTING } from '../../art';
import { createShipMaterial, SHAPE_LIGHT } from '../ship-geometry';

const compiled = () => {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
  const material = createShipMaterial();
  material.onBeforeCompile.call(material, shader, null as unknown as THREE.WebGLRenderer);
  return shader;
};

describe('la luz de forma del material de los barcos', () => {
  test('KS = 2,0 y KH = 0,68969, el de la spec, calculado con la luz del juego', () => {
    expect(SHAPE_LIGHT.ks).toBe(2);
    expect(SHAPE_LIGHT.kh).toBeCloseTo(0.68969, 5);
  });

  test('una cara que mira arriba (la cubierta, D62) recibe la misma luz que sin ella', () => {
    const lum = (hex: string) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
    const hemi = LIGHTING.hemiIntensity * lum(LIGHTING.hemiSky);
    const sun = LIGHTING.sunIntensity * lum(LIGHTING.sunColor) * LIGHTING.sunDir[1];
    expect(hemi * SHAPE_LIGHT.kh + sun * SHAPE_LIGHT.ks).toBeCloseTo(hemi + sun, 10);
  });

  test('escala la hemisférica y el sol directo, difuso y especular, justo tras sumar las luces y solo con USE_MAP', () => {
    const shader = compiled();
    const f = shader.fragmentShader;
    const at = f.indexOf('#include <lights_fragment_begin>');
    expect(at).toBeGreaterThan(-1);
    expect(f.slice(at, f.indexOf('#include <lights_fragment_maps>'))).toBe(
      '#include <lights_fragment_begin>\n#ifdef USE_MAP\n' +
      '\tfloat sbShapeSun = mix(1.0, uShapeLight.x, vRimMask);\n' +
      '\tirradiance *= mix(1.0, uShapeLight.y, vRimMask);\n' +
      '\treflectedLight.directDiffuse *= sbShapeSun;\n' +
      '\treflectedLight.directSpecular *= sbShapeSun;\n' +
      '#endif\n\t'
    );
    // Nada más de la luz de forma fuera de ese bloque: el procedural (sin mapa) compila lo de antes
    expect(f.split('sbShapeSun').length - 1).toBe(3);
    expect(f.match(/irradiance \*=/g)).toHaveLength(1);
    // (KS, KH) en un uniform, el mismo objeto en todos los materiales
    const other = createShipMaterial();
    expect([(shader.uniforms.uShapeLight.value as THREE.Vector2).toArray(), other.userData.fx.uShapeLight === createShipMaterial().userData.fx.uShapeLight]).toEqual([[SHAPE_LIGHT.ks, SHAPE_LIGHT.kh], true]);
  });
});

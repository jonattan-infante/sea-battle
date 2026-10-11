// AS-V14 (ASSET-SPEC §8.3 y §11): píxeles de vela visibles en pantalla con rumbos de 0° a 345° cada 15°.
// Render offscreen con la cámara del juego: los triángulos de vela (ShipModel.sails) salen en rojo y el resto
// del barco en negro con prueba de profundidad, así que el casco, los mástiles y las otras velas tapan lo que
// tapan en el juego. Además devuelve una hoja de contacto con el barco iluminado para revisar a ojo.
import * as THREE from 'three';
import { LIGHTING, PALETTE } from '../art';
import { getShipModel, LOD_PX } from './ship-geometry';

export const SAIL_HEADINGS_DEG = Array.from({ length: 24 }, (_, i) => i * 15);
export const SAIL_MIN_RATIO = 0.25;

export interface SailVisibility {
  classId: string;
  lod: 0 | 1;
  ppm: number;
  pixels: number[]; // uno por rumbo de SAIL_HEADINGS_DEG
  min: number;
  max: number;
  minHeadingDeg: number;
  ratio: number; // min / max
  pass: boolean;
  sheet?: string; // PNG: 6 × 4 vistas iluminadas con la máscara de vela contada en magenta
}

const MASK_VERTEX = /* glsl */ `
attribute float aSail;
varying float vSail;
void main() {
  vSail = aSail;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const MASK_FRAGMENT = /* glsl */ `
varying float vSail;
void main() {
  gl_FragColor = vec4(step(0.5, vSail), 0.0, 0.0, 1.0);
}`;

function maskGeometry(geometry: THREE.BufferGeometry, sails: [number, number][]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geometry.getAttribute('position').clone()); // copia: dispose() no toca el buffer del juego
  const flags = new Float32Array(geometry.getAttribute('position').count);
  for (const [t0, t1] of sails) flags.fill(1, t0 * 3, t1 * 3);
  g.setAttribute('aSail', new THREE.BufferAttribute(flags, 1));
  return g;
}

// sRGB de 8 bits a partir del lineal que sale del render target (sin tone mapping: solo para la hoja)
const SRGB = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
});

export function measureSailVisibility(
  renderer: THREE.WebGLRenderer,
  ppm: number,
  elevation: number,
  classIds: string[],
  options: { sheet?: boolean } = {}
): SailVisibility[] {
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const results: SailVisibility[] = [];

  const scene = new THREE.Scene();
  const pivot = new THREE.Group();
  scene.add(pivot);
  // Luces fijas en el mundo (el barco gira dentro de pivot); el ShaderMaterial de la máscara no las usa
  const [lx, ly, lz] = LIGHTING.sunDir;
  const sun = new THREE.DirectionalLight(LIGHTING.sunColor, LIGHTING.sunIntensity);
  sun.position.set(lx * 100, ly * 100, lz * 100);
  scene.add(new THREE.HemisphereLight(LIGHTING.hemiSky, LIGHTING.hemiGround, LIGHTING.hemiIntensity), sun);
  const background = new THREE.Color(PALETTE.oceanDeep);
  const maskMaterial = new THREE.ShaderMaterial({ vertexShader: MASK_VERTEX, fragmentShader: MASK_FRAGMENT, side: THREE.DoubleSide });
  const litMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });

  for (const classId of classIds) {
    const model = getShipModel(classId);
    const lod: 0 | 1 = model.extras.sb_length * ppm >= LOD_PX[0] ? 0 : 1;
    const geometry = model.lods[lod];
    const mask = maskGeometry(geometry, model.sails[lod]);
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere!;
    // Cuadro que contiene el barco con cualquier rumbo: el centro gira alrededor del eje Y del barco
    const reach = sphere.radius + Math.hypot(sphere.center.x, sphere.center.z);
    const size = Math.ceil(2 * reach * ppm) + 8;
    const half = size / (2 * ppm);
    const camera = new THREE.OrthographicCamera(-half, half, half, -half, 1, 4 * reach + 200);
    camera.position.set(0, sphere.center.y + Math.sin(elevation) * (2 * reach + 100), Math.cos(elevation) * (2 * reach + 100));
    camera.lookAt(0, sphere.center.y, 0);
    const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, samples: 0 });
    const buffer = new Uint8Array(size * size * 4);
    const maskMesh = new THREE.Mesh(mask, maskMaterial);
    const litMesh = new THREE.Mesh(geometry, litMaterial);

    const cols = 6;
    const sheet = options.sheet && typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const ctx = sheet?.getContext('2d') ?? null;
    if (sheet && ctx) {
      sheet.width = cols * size;
      sheet.height = Math.ceil(SAIL_HEADINGS_DEG.length / cols) * size;
      ctx.fillStyle = PALETTE.oceanDeep;
      ctx.fillRect(0, 0, sheet.width, sheet.height);
    }

    const pixels: number[] = [];
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    SAIL_HEADINGS_DEG.forEach((deg, i) => {
      pivot.rotation.y = (deg * Math.PI) / 180;
      pivot.clear();
      pivot.add(maskMesh);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, buffer);
      let count = 0;
      for (let p = 0; p < buffer.length; p += 4) if (buffer[p] > 127) count++;
      pixels.push(count);
      if (!ctx) return;
      const sailMask = buffer.slice();
      pivot.clear();
      pivot.add(litMesh);
      scene.background = background;
      renderer.clear();
      renderer.render(scene, camera);
      scene.background = null;
      renderer.readRenderTargetPixels(target, 0, 0, size, size, buffer);
      const image = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const src = ((size - 1 - y) * size + x) * 4; // el render target va de abajo arriba
          const dst = (y * size + x) * 4;
          const sail = sailMask[src] > 127;
          image.data[dst] = sail ? Math.round(0.6 * SRGB[buffer[src]] + 0.4 * 255) : SRGB[buffer[src]];
          image.data[dst + 1] = sail ? Math.round(0.6 * SRGB[buffer[src + 1]]) : SRGB[buffer[src + 1]];
          image.data[dst + 2] = sail ? Math.round(0.6 * SRGB[buffer[src + 2]] + 0.4 * 255) : SRGB[buffer[src + 2]];
          image.data[dst + 3] = 255;
        }
      }
      const cx = (i % cols) * size;
      const cy = Math.floor(i / cols) * size;
      ctx.putImageData(image, cx, cy);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.fillText(`${String(deg).padStart(3, '0')}°  ${count} px`, cx + 6, cy + 16);
    });

    const max = Math.max(...pixels);
    const min = Math.min(...pixels);
    const ratio = max > 0 ? min / max : 0;
    results.push({
      classId: model.classId, lod, ppm, pixels, min, max,
      minHeadingDeg: SAIL_HEADINGS_DEG[pixels.indexOf(min)],
      ratio, pass: ratio >= SAIL_MIN_RATIO,
      sheet: sheet ? sheet.toDataURL('image/png') : undefined
    });
    target.dispose();
    mask.dispose();
  }

  maskMaterial.dispose();
  litMaterial.dispose();
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  return results;
}

// AS-V14 (ASSET-SPEC §8.3 y §11): píxeles de vela visibles en pantalla con rumbos de 0° a 345° cada 15°.
// Render offscreen con la cámara del juego: los triángulos de vela (ShipModel.sails) salen en rojo y el resto
// del barco en negro con prueba de profundidad, así que el casco, los mástiles y las otras velas tapan lo que
// tapan en el juego. Además devuelve una hoja de contacto con el barco iluminado para revisar a ojo.
// measureShipValues (AD-10, D8): L* de velas y casco con el pipeline real del canvas (tone mapping y sRGB).
import * as THREE from 'three';
import { LIGHTING, PALETTE } from '../art';
import { createShipMaterial, getShipModel, LOD_PX, shipLook } from './ship-geometry';

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

export interface ShipValues {
  classId: string;
  headingDeg: number;
  sailPixels: number;
  sailL: number; // L* medio de los píxeles de vela (interiores: sin los bordes mezclados por el antialias)
  sailLp5: number;
  sailLp95: number;
  sailHex: string; // color sRGB medio
  stripePixels: number; // franjas del mercante (fuera de la media de la vela)
  stripeL: number;
  sailClipPct: number; // % de píxeles de vela (con franjas) con algún canal = 255 (D15: < 1 %)
  deckPixels: number; // caras con el color `deck` (AD-25)
  deckHex: string;
  hullPixels: number; // caras con el color `hull` de la receta
  hullL: number;
  hullHex: string;
}

// R = vela (con franjas), G = casco (color `hull`), B = franja, A = cubierta (color `deck`); el resto del barco en
// negro y con profundidad. El alfa se escribe tal cual: el material es opaco (sin mezcla)
const MASK_VERTEX = /* glsl */ `
attribute float aSail;
attribute float aHull;
attribute float aStripe;
attribute float aDeck;
varying vec4 vMask;
void main() {
  vMask = vec4(aSail, aHull, aStripe, aDeck);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const MASK_FRAGMENT = /* glsl */ `
varying vec4 vMask;
void main() {
  gl_FragColor = step(0.5, vMask);
}`;

const sameColor = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, v: number, c: THREE.Color) =>
  Math.abs(attr.getX(v) - c.r) + Math.abs(attr.getY(v) - c.g) + Math.abs(attr.getZ(v) - c.b) < 1e-4;

// hull y deck admiten varios colores: las tablas alternas (deck.alt) y la oclusión horneada ×0,85 (D23)
function maskGeometry(geometry: THREE.BufferGeometry, sails: [number, number][], hull?: THREE.Color[], stripe?: THREE.Color, deck?: THREE.Color[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geometry.getAttribute('position').clone()); // copia: dispose() no toca el buffer del juego
  const count = geometry.getAttribute('position').count;
  const flags = new Float32Array(count);
  for (const [t0, t1] of sails) flags.fill(1, t0 * 3, t1 * 3);
  g.setAttribute('aSail', new THREE.BufferAttribute(flags, 1));
  const color = geometry.getAttribute('color');
  const hullFlags = new Float32Array(count);
  const stripeFlags = new Float32Array(count);
  const deckFlags = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    if (hull?.some((c) => sameColor(color, v, c))) hullFlags[v] = 1;
    if (stripe && flags[v] === 1 && sameColor(color, v, stripe)) stripeFlags[v] = 1;
    if (deck?.some((c) => sameColor(color, v, c))) deckFlags[v] = 1;
  }
  g.setAttribute('aHull', new THREE.BufferAttribute(hullFlags, 1));
  g.setAttribute('aStripe', new THREE.BufferAttribute(stripeFlags, 1));
  g.setAttribute('aDeck', new THREE.BufferAttribute(deckFlags, 1));
  return g;
}

// Cámara ortográfica del juego (guiñada 0) que encuadra el barco con cualquier rumbo
function framing(geometry: THREE.BufferGeometry, ppm: number, elevation: number): { camera: THREE.OrthographicCamera; size: number } {
  geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere!;
  const reach = sphere.radius + Math.hypot(sphere.center.x, sphere.center.z);
  const size = Math.ceil(2 * reach * ppm) + 8;
  const half = size / (2 * ppm);
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 1, 4 * reach + 200);
  camera.position.set(0, sphere.center.y + Math.sin(elevation) * (2 * reach + 100), Math.cos(elevation) * (2 * reach + 100));
  camera.lookAt(0, sphere.center.y, 0);
  return { camera, size };
}

function lightRig(scene: THREE.Scene): void {
  const [lx, ly, lz] = LIGHTING.sunDir;
  const sun = new THREE.DirectionalLight(LIGHTING.sunColor, LIGHTING.sunIntensity);
  sun.position.set(lx * 100, ly * 100, lz * 100);
  scene.add(new THREE.HemisphereLight(LIGHTING.hemiSky, LIGHTING.hemiGround, LIGHTING.hemiIntensity), sun);
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function lstar(r: number, g: number, b: number): number {
  const y = 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

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
  options: { sheet?: boolean; lod?: 0 | 1 } = {}
): SailVisibility[] {
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const results: SailVisibility[] = [];

  const scene = new THREE.Scene();
  const pivot = new THREE.Group();
  scene.add(pivot);
  lightRig(scene); // fijas en el mundo: el barco gira dentro de pivot; el ShaderMaterial de la máscara no las usa
  const background = new THREE.Color(PALETTE.oceanDeep);
  const maskMaterial = new THREE.ShaderMaterial({ vertexShader: MASK_VERTEX, fragmentShader: MASK_FRAGMENT, side: THREE.DoubleSide });
  const litMaterial = createShipMaterial();

  for (const classId of classIds) {
    const model = getShipModel(classId);
    // AS-V14 se mide en los dos LOD (D12); sin `lod`, el que tocaría con este ppm
    const lod: 0 | 1 = options.lod ?? (model.extras.sb_length * ppm >= LOD_PX[0] ? 0 : 1);
    const geometry = model.lods[lod];
    const mask = maskGeometry(geometry, model.sails[lod]);
    const { camera, size } = framing(geometry, ppm, elevation);
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

// AD-10 / D8: L* de velas y casco por rumbo. Dibuja en el canvas (no en un render target) para pasar por el
// mismo tone mapping y la misma conversión a sRGB que el juego, y lee los píxeles en la misma tarea; el
// siguiente frame lo sobrescribe. Solo cuenta píxeles interiores (máscara a 255) para no mezclar bordes.
export function measureShipValues(
  renderer: THREE.WebGLRenderer,
  ppm: number,
  elevation: number,
  classIds: string[],
  headingsDeg: number[] = [0, 90, 180, 270],
  lodOverride?: 0 | 1 // AD-33 (D40): el mismo barco y pose con LOD0 y con LOD1 forzado
): ShipValues[] {
  const gl = renderer.getContext();
  const prev = {
    target: renderer.getRenderTarget(),
    clear: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
    viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest()
  };
  const pr = renderer.getPixelRatio();
  const results: ShipValues[] = [];
  const scene = new THREE.Scene();
  const pivot = new THREE.Group();
  scene.add(pivot);
  lightRig(scene);
  const background = new THREE.Color(PALETTE.oceanDeep);
  const maskMaterial = new THREE.ShaderMaterial({ vertexShader: MASK_VERTEX, fragmentShader: MASK_FRAGMENT, side: THREE.DoubleSide });
  const litMaterial = createShipMaterial();
  renderer.setRenderTarget(null);
  renderer.setScissorTest(true);

  for (const classId of classIds) {
    const model = getShipModel(classId);
    const lod: 0 | 1 = lodOverride ?? (model.extras.sb_length * ppm >= LOD_PX[0] ? 0 : 1);
    const geometry = model.lods[lod];
    const look = shipLook(model.recipe);
    const withAo = (...hex: string[]) => hex.flatMap((h) => [new THREE.Color(h), new THREE.Color(h).multiplyScalar(0.85)]);
    // Cubierta: tablas de LOD0 y cara lisa de LOD1 (deckLod1, D40)
    const mask = maskGeometry(geometry, model.sails[lod], withAo(look.hull), look.sailStripe ? new THREE.Color(look.sailStripe) : undefined, withAo(look.deck, look.deckAlt, look.deckLod1));
    const { camera, size } = framing(geometry, ppm, elevation);
    const maskMesh = new THREE.Mesh(mask, maskMaterial);
    const litMesh = new THREE.Mesh(geometry, litMaterial);
    const maskBuf = new Uint8Array(size * size * 4);
    const colorBuf = new Uint8Array(size * size * 4);
    renderer.setViewport(0, 0, size / pr, size / pr);
    renderer.setScissor(0, 0, size / pr, size / pr);
    for (const deg of headingsDeg) {
      pivot.rotation.y = (deg * Math.PI) / 180;
      pivot.clear();
      pivot.add(maskMesh);
      scene.background = null;
      renderer.setClearColor(0x000000, 0); // α 0 de fondo: el alfa de la máscara marca la cubierta
      renderer.clear();
      renderer.render(scene, camera);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, maskBuf);
      pivot.clear();
      pivot.add(litMesh);
      scene.background = background;
      renderer.clear();
      renderer.render(scene, camera);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, colorBuf);
      const sail: number[] = [];
      const acc = { sr: 0, sg: 0, sb: 0, hr: 0, hg: 0, hb: 0, hl: 0, hn: 0, tl: 0, tn: 0, clip: 0, all: 0, dr: 0, dg: 0, db: 0, dn: 0 };
      for (let p = 0; p < maskBuf.length; p += 4) {
        const r = colorBuf[p];
        const g = colorBuf[p + 1];
        const b = colorBuf[p + 2];
        if (maskBuf[p] === 255) {
          acc.all++;
          if (r === 255 || g === 255 || b === 255) acc.clip++;
        }
        if (maskBuf[p + 3] === 255 && maskBuf[p] === 0 && maskBuf[p + 1] === 0) {
          acc.dr += r; acc.dg += g; acc.db += b; acc.dn++;
        }
        if (maskBuf[p] === 255 && maskBuf[p + 2] === 255) {
          acc.tl += lstar(r, g, b);
          acc.tn++;
        } else if (maskBuf[p] === 255 && maskBuf[p + 2] === 0) {
          sail.push(lstar(r, g, b));
          acc.sr += r; acc.sg += g; acc.sb += b;
        } else if (maskBuf[p + 1] === 255) {
          acc.hl += lstar(r, g, b);
          acc.hr += r; acc.hg += g; acc.hb += b;
          acc.hn++;
        }
      }
      sail.sort((a, b) => a - b);
      const n = sail.length;
      const mean = n ? sail.reduce((a, v) => a + v, 0) / n : 0;
      results.push({
        classId: model.classId, headingDeg: deg,
        sailPixels: n, sailL: mean, sailLp5: n ? sail[Math.floor(0.05 * n)] : 0, sailLp95: n ? sail[Math.floor(0.95 * (n - 1))] : 0,
        sailHex: n ? hex(acc.sr / n, acc.sg / n, acc.sb / n) : '',
        stripePixels: acc.tn, stripeL: acc.tn ? acc.tl / acc.tn : 0,
        sailClipPct: acc.all ? (100 * acc.clip) / acc.all : 0,
        deckPixels: acc.dn, deckHex: acc.dn ? hex(acc.dr / acc.dn, acc.dg / acc.dn, acc.db / acc.dn) : '',
        hullPixels: acc.hn, hullL: acc.hn ? acc.hl / acc.hn : 0,
        hullHex: acc.hn ? hex(acc.hr / acc.hn, acc.hg / acc.hn, acc.hb / acc.hn) : ''
      });
    }
    mask.dispose();
  }

  scene.background = null;
  maskMaterial.dispose();
  litMaterial.dispose();
  renderer.setRenderTarget(prev.target);
  renderer.setClearColor(prev.clear, prev.alpha);
  renderer.setViewport(prev.viewport); // unidades lógicas, como las devuelve getViewport
  renderer.setScissor(prev.scissor);
  renderer.setScissorTest(prev.scissorTest);
  return results;
}

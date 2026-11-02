// Océano según ART-DIRECTION §7: un plano de 2 triángulos que sigue a la cámara y un shader en coordenadas
// de mundo (el patrón no viaja con la cámara). Olas por normales procedurales, aguas someras por distancia a
// las islas, espuma, especular y las líneas del borde del mapa, de la zona segura y de la rejilla de sectores.
import * as THREE from 'three';
import { IslandDef, MAP_HALF_SIZE, PORT_POSITION, SAFE_ZONE_RADIUS } from '../../game/constants';
import { CAMERA, LIGHTING, PALETTE } from '../art';
import { buildIsleGrid, EMPTY, IsleGrid } from './isle-grid';

const deg = Math.PI / 180;

// §7.1: λ (m), giro respecto a la dirección del viento, pendiente k·A
const WAVES: [number, number, number][] = [
  [23, 0, 0.1],
  [13, 28, 0.08],
  [7.5, -35, 0.06],
  [3.8, 62, 0.04]
];
const WIND = new THREE.Vector2(0.707, -0.707); // hacia el NE en XZ, igual que el viento del humo (VFX §2)

// §7.3 Espuma de cresta (D23, cifras de D42): cresta de la ola × vetas estiradas 3:1 a lo largo del viento × rachas, que
// la agrupan y dejan limpio el resto del mar. La cresta se evalúa en un punto desplazado por ruido, así las filas de
// espuma serpentean en vez de formar diagonales rectas cada 23 m. AD-27 la mide en 12 vistas fijas de mar abierto
// (e2e/ocean-foam.spec.ts)
export const CREST_FOAM = {
  height: [0.55, 0.95], // smoothstep sobre la altura h_w, evaluada en el punto desplazado
  warp: [18, 40], // m de desplazamiento máximo y escala del ruido que lo da
  streak: [6, 2], // m a lo largo y a lo ancho del viento del ruido de vetas
  streakEdge: [0.45, 0.65], // smoothstep sobre ese ruido
  gustScale: 35, // m del ruido de rachas
  gustEdge: [0.6, 0.8], // smoothstep sobre el ruido de rachas
  strength: 0.3 // mezcla máxima hacia ocean.foam
};

const vertexShader = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// El número de círculos y los texels por celda de la rejilla (isle-grid.ts) van en el código del shader: se compila una vez
// por material, con las islas del mapa. `lookup` 'list' recorre todos los círculos en cada píxel, como antes de la rejilla:
// solo para medir la rejilla contra la lista en el mismo build (QA, rt.setOceanLookup; AC-198 e). El juego usa la rejilla
export type OceanLookup = 'grid' | 'list';

const isleDistance = (lookup: OceanLookup, circles: number, texelsPerCell: number) =>
  lookup === 'list'
    ? /* glsl */ `
  for (int i = 0; i < ${circles}; i++) dIsle = min(dIsle, length(p - uIslands[i].xy) - uIslands[i].z);`
    : /* glsl */ `
  vec2 gi = floor((p - uIsleBox.xy) * uIsleBox.z);
  if (gi.x >= 0.0 && gi.y >= 0.0 && gi.x < uIsleSize.x && gi.y < uIsleSize.y) {
    ivec2 cell = ivec2(gi);
    // Los índices de una celda van seguidos y los vacíos detrás: el primer vacío corta también el bucle de los texels, y una
    // celda con ≤ 3 candidatos lee 1 texel aunque la rejilla lleve 2 (con los 50 círculos de D92; BACKLOG :1687)
    bool cellDone = false;
    for (int l = 0; l < ${texelsPerCell}; l++) {
      if (cellDone) break;
      vec4 t = texelFetch(uIsleGrid, ivec2(cell.x * ${texelsPerCell} + l, cell.y), 0) * 255.0;
      for (int k = 0; k < 4; k++) {
        int i = int(t[k] + 0.5);
        if (i == ${EMPTY}) {
          cellDone = true;
          break;
        }
        dIsle = min(dIsle, length(p - uIslands[i].xy) - uIslands[i].z);
      }
    }
  }`;

const fragmentShader = (circles: number, texelsPerCell: number, lookup: OceanLookup) => /* glsl */ `
uniform float uTime;
uniform vec3 uLightDir;
uniform vec3 uViewDir;
uniform vec3 uIslands[${circles}];
uniform sampler2D uIsleGrid; // RGBA8: 4 índices de círculo por texel, ${EMPTY} = vacío
uniform vec4 uIsleBox; // origen x, z de la rejilla, 1 / celda, sin uso
uniform vec2 uIsleSize; // celdas en x y en z
uniform float uMapHalf;
uniform vec2 uSafeCenter;
uniform float uSafeRadius;
uniform vec4 uWaves[4]; // dir.x, dir.z, k, ω
uniform vec4 uWaveAmp;
uniform vec4 uWaveSlope;
uniform vec3 uDeep;
uniform vec3 uTrough;
uniform vec3 uCrest;
uniform vec3 uShallow;
uniform vec3 uShore;
uniform vec3 uFoam;
uniform vec3 uSpec;
uniform vec3 uSky;
uniform vec3 uEdge;
uniform vec3 uCalm;
uniform vec3 uBorder;
uniform vec3 uSafeLine;
uniform vec2 uWind;
uniform vec4 uFoamCrest; // smoothstep de h (x, y) y del ruido de vetas (z, w)
uniform vec2 uFoamStreak; // 1 / m a lo largo y a lo ancho del viento
uniform vec4 uFoamGust; // 1 / escala de las rachas, smoothstep (y, z) y fuerza (w)
uniform vec2 uFoamWarp; // desplazamiento máximo (m) y 1 / escala del ruido de la cresta desplazada
varying vec3 vWorld;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Línea antialiasada de ancho constante en px a partir de una distancia con signo en metros; aa = metros por px
float lineMaskAA(float sd, float aa, float widthPx) {
  return 1.0 - smoothstep(widthPx * 0.5 - 0.5, widthPx * 0.5 + 0.5, abs(sd) / max(aa, 1e-4));
}

float lineMask(float sd, float widthPx) {
  return lineMaskAA(sd, fwidth(sd), widthPx);
}

void main() {
  vec2 p = vWorld.xz;
  float dSafe = length(p - uSafeCenter);
  float calm = 1.0 - smoothstep(uSafeRadius - 6.0, uSafeRadius + 6.0, dSafe);
  float ampScale = mix(1.0, 0.6, calm);

  // §7.1 Suma de 4 ondas direccionales: altura normalizada para el color y gradiente para la normal
  float h = 0.0;
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    float ph = w.z * dot(w.xy, p) - w.w * uTime;
    h += uWaveAmp[i] * sin(ph);
    grad += uWaveSlope[i] * cos(ph) * w.xy;
  }
  h = h / (uWaveAmp.x + uWaveAmp.y + uWaveAmp.z + uWaveAmp.w) * ampScale;
  grad *= ampScale;
  vec2 drift = vec2(0.212, -0.212) * uTime;
  float nx = (vnoise(p / 1.6 + drift) + 0.5 * vnoise(p / 0.7 + drift * 1.3)) / 1.5 - 0.5;
  float nz = (vnoise(p / 1.6 + drift + 17.3) + 0.5 * vnoise(p / 0.7 + drift * 1.3 + 41.7)) / 1.5 - 0.5;
  grad += vec2(nx, nz) * 0.1;
  vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));

  // §7.2 Color
  // AD-24: la altura de color mezcla ruido de 2 octavas (9 y 4,5 m) para romper las bandas regulares, y el
  // contraste de ola baja al 55 % hacia ocean.deep (p95 − p5 de L* entre 4 y 12)
  float nc = (vnoise(p / 9.0 + drift * 0.6) + 0.5 * vnoise(p / 4.5 - drift * 0.4)) / 1.5 * 2.0 - 1.0;
  float hc = 0.6 * h + 0.4 * nc;
  vec3 c = mix(uDeep, mix(uTrough, uCrest, smoothstep(-0.6, 0.8, hc)), 0.55);
  // Distancia a la costa: solo los círculos candidatos de la celda (AC-198 e). Fuera de la rejilla no hay ninguno a menos
  // de 18 m, y 1e5 da lo mismo que la distancia de verdad
  float dIsle = 1e5;${isleDistance(lookup, circles, texelsPerCell)}
  float s = 1.0 - smoothstep(0.0, 18.0, dIsle);
  c = mix(c, uShallow, 0.85 * s);
  float s2 = 1.0 - smoothstep(0.0, 4.0, dIsle);
  c = mix(c, uShore, s2);
  c = mix(c, uCalm, 0.08 * calm);
  float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, uViewDir), 0.0, 1.0), 5.0);
  c = mix(c, uSky, 0.6 * fres);

  // §7.3 Espuma de cresta (D23, D42): vetas a lo largo del viento, agrupadas en rachas; y de orilla (ondas hacia la costa)
  vec2 pw = vec2(dot(p, uWind), dot(p, vec2(-uWind.y, uWind.x)));
  float streak = vnoise(pw * uFoamStreak + 0.5 * drift);
  float gust = smoothstep(uFoamGust.y, uFoamGust.z, vnoise(p * uFoamGust.x + 0.15 * drift));
  vec2 wd = 0.1 * drift;
  vec2 pf = p + uFoamWarp.x * (vec2(vnoise(p * uFoamWarp.y + 3.1 + wd), vnoise(p * uFoamWarp.y + 11.7 + wd)) * 2.0 - 1.0);
  float hw = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    hw += uWaveAmp[i] * sin(w.z * dot(w.xy, pf) - w.w * uTime);
  }
  hw = hw / (uWaveAmp.x + uWaveAmp.y + uWaveAmp.z + uWaveAmp.w) * ampScale;
  float crest = smoothstep(uFoamCrest.x, uFoamCrest.y, hw) * smoothstep(uFoamCrest.z, uFoamCrest.w, streak) * gust * uFoamGust.w;
  float band = step(0.0, dIsle) * (1.0 - smoothstep(2.0, 2.5, dIsle));
  float shore = band * (0.5 + 0.5 * sin(dIsle * 2.4 - uTime * 1.6)) * 0.8;
  c = mix(c, uFoam, clamp(crest + shore, 0.0, 1.0));

  // Especular Blinn-Phong: con agua plana n·H = 0,834 → 0; solo destellan las facetas de ola
  vec3 H = normalize(uLightDir + uViewDir);
  c += uSpec * pow(max(dot(n, H), 0.0), 90.0) * 0.8;

  // §7.4 Rejilla de sectores cada 100 m (blanca al 5 %, 1 px)
  float e = max(abs(p.x), abs(p.y)) - uMapHalf;
  if (e < 0.0) {
    // La derivada se toma de p, no de g: fract() salta en ±50 m y fwidth(g) dibujaba líneas falsas ahí
    vec2 g = (fract(p / 100.0 + 0.5) - 0.5) * 100.0;
    float grid = max(lineMaskAA(g.x, fwidth(p.x), 1.0), lineMaskAA(g.y, fwidth(p.y), 1.0));
    c = mix(c, vec3(1.0), 0.05 * grid);
  }

  // Fuera del mapa: mar oscuro; borde discontinuo dorado (trazo de 4 m) de 2 px
  c = mix(c, uEdge, smoothstep(0.0, 30.0, e));
  float along = abs(p.x) > abs(p.y) ? p.y : p.x;
  float dashE = step(0.5, fract(along / 8.0));
  c = mix(c, uBorder, 0.5 * lineMask(e, 2.0) * dashE);

  // Borde de la zona segura: círculo discontinuo (trazo de 6 m) de 2 px
  vec2 q = p - uSafeCenter;
  float arc = atan(q.y, q.x) * uSafeRadius;
  float dashS = step(0.5, fract(arc / 12.0));
  c = mix(c, uSafeLine, 0.55 * lineMask(dSafe - uSafeRadius, 2.0) * dashS);

  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const col = (hex: string) => new THREE.Color(hex);

// La rejilla en una textura sin filtrar: texelFetch lee los índices tal cual. Sin islas, 1 texel vacío que no se lee
function isleGridTexture(grid: IsleGrid): THREE.DataTexture {
  const empty = grid.nx === 0;
  const tex = new THREE.DataTexture(empty ? new Uint8Array(4).fill(EMPTY) : grid.data, empty ? 1 : grid.nx * grid.texelsPerCell, empty ? 1 : grid.nz, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

export function createOceanMaterial(islands: IslandDef[], options: { lookup?: OceanLookup } = {}): THREE.ShaderMaterial {
  const grid = buildIsleGrid(islands);
  // Sin islas, un círculo que no se lee: GLSL no admite arrays de tamaño 0
  const packed = islands.length ? islands.map((island) => new THREE.Vector3(island.x, island.z, island.radius)) : [new THREE.Vector3(0, 0, -1)];
  const waves = WAVES.map(([lambda, turn, slope]) => {
    const k = (2 * Math.PI) / lambda;
    const c = Math.sqrt((9.81 * lambda) / (2 * Math.PI)) * 0.35;
    const d = WIND.clone().rotateAround(new THREE.Vector2(), turn * deg);
    return { v: new THREE.Vector4(d.x, d.y, k, k * c), amp: slope / k, slope };
  });
  const theta = CAMERA.elevation;
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: fragmentShader(packed.length, grid.texelsPerCell, options.lookup ?? 'grid'),
    uniforms: {
      uTime: { value: 0 },
      uLightDir: { value: new THREE.Vector3(...LIGHTING.sunDir) },
      uViewDir: { value: new THREE.Vector3(0, Math.sin(theta), Math.cos(theta)) },
      uIslands: { value: packed },
      uIsleGrid: { value: isleGridTexture(grid) },
      uIsleBox: { value: new THREE.Vector4(grid.originX, grid.originZ, 1 / grid.cell, 0) },
      uIsleSize: { value: new THREE.Vector2(grid.nx, grid.nz) },
      uMapHalf: { value: MAP_HALF_SIZE },
      uSafeCenter: { value: new THREE.Vector2(PORT_POSITION.x, PORT_POSITION.z) },
      uSafeRadius: { value: SAFE_ZONE_RADIUS },
      uWaves: { value: waves.map((w) => w.v) },
      uWaveAmp: { value: new THREE.Vector4(...waves.map((w) => w.amp)) },
      uWaveSlope: { value: new THREE.Vector4(...waves.map((w) => w.slope)) },
      uDeep: { value: col(PALETTE.oceanDeep) },
      uTrough: { value: col(PALETTE.oceanTrough) },
      uCrest: { value: col(PALETTE.oceanCrest) },
      uShallow: { value: col(PALETTE.oceanShallow) },
      uShore: { value: col(PALETTE.oceanShore) },
      uFoam: { value: col(PALETTE.oceanFoam) },
      uSpec: { value: col(PALETTE.oceanSpec) },
      uSky: { value: col(PALETTE.oceanSky) },
      uEdge: { value: col(PALETTE.oceanEdge) },
      uCalm: { value: col(PALETTE.calmWater) },
      uBorder: { value: col(PALETTE.mapBorder) },
      uSafeLine: { value: col(PALETTE.safeBorder) },
      uWind: { value: WIND.clone() },
      uFoamCrest: { value: new THREE.Vector4(...CREST_FOAM.height, ...CREST_FOAM.streakEdge) },
      uFoamStreak: { value: new THREE.Vector2(1 / CREST_FOAM.streak[0], 1 / CREST_FOAM.streak[1]) },
      uFoamGust: { value: new THREE.Vector4(1 / CREST_FOAM.gustScale, ...CREST_FOAM.gustEdge, CREST_FOAM.strength) },
      uFoamWarp: { value: new THREE.Vector2(CREST_FOAM.warp[0], 1 / CREST_FOAM.warp[1]) }
    }
  });
}

// El material y su textura de la rejilla, que material.dispose() no libera (AC-199 e: el agua se rehace al llegar las islas)
export function disposeOceanMaterial(material: THREE.ShaderMaterial): void {
  (material.uniforms.uIsleGrid.value as THREE.Texture).dispose();
  material.dispose();
}

// Plano unitario horizontal; se escala al suelo visible + 40 m y se recentra en cada frame
export function createOceanGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
}

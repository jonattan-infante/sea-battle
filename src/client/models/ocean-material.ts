// Océano según ART-DIRECTION §7: un plano de 2 triángulos que sigue a la cámara y un shader en coordenadas
// de mundo (el patrón no viaja con la cámara). Olas por normales procedurales, aguas someras por distancia a
// las islas, espuma, especular y las líneas del borde del mapa, de la zona segura y de la rejilla de sectores.
import * as THREE from 'three';
import { IslandDef, MAP_HALF_SIZE, PORT_POSITION, SAFE_ZONE_RADIUS } from '../../game/constants';
import { CAMERA, LIGHTING, PALETTE } from '../art';

const MAX_ISLANDS = 16;
const deg = Math.PI / 180;

// §7.1: λ (m), giro respecto a la dirección del viento, pendiente k·A
const WAVES: [number, number, number][] = [
  [23, 0, 0.1],
  [13, 28, 0.08],
  [7.5, -35, 0.06],
  [3.8, 62, 0.04]
];
const WIND = new THREE.Vector2(0.707, -0.707); // hacia el NE en XZ, igual que el viento del humo (VFX §2)

const vertexShader = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uLightDir;
uniform vec3 uViewDir;
uniform vec3 uIslands[${MAX_ISLANDS}];
uniform int uIslandCount;
uniform float uMapHalf;
uniform vec2 uSafeCenter;
uniform float uSafeRadius;
uniform vec4 uWaves[4]; // dir.x, dir.z, k, ω
uniform vec4 uWaveAmp;
uniform vec4 uWaveSlope;
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

// Línea antialiasada de ancho constante en px a partir de una distancia con signo en metros
float lineMask(float sd, float widthPx) {
  float aa = max(fwidth(sd), 1e-4);
  return 1.0 - smoothstep(widthPx * 0.5 - 0.5, widthPx * 0.5 + 0.5, abs(sd) / aa);
}

#if defined(TONE_MAPPING) && defined(NEUTRAL_TOE_COMPENSATION)
// NeutralToneMapping resta al color un desplazamiento que depende del canal mínimo (x − 6,25x² si x < 0,08):
// aplasta el rojo del océano (#1A5F86 → #025B83). Se aplica la inversa exacta para que el agua salga con el
// color de la paleta (AD-01) sin dejar de pasar por el tone mapping como el resto de la escena.
vec3 neutralToeInverse(vec3 c) {
  float t = max(min(c.r, min(c.g, c.b)), 0.0);
  float offset = t < 0.04 ? sqrt(t / 6.25) - t : 0.04;
  return (c + offset) / toneMappingExposure;
}
#endif

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
  vec3 c = mix(uTrough, uCrest, smoothstep(-0.6, 0.8, h));
  float dIsle = 1e5;
  for (int i = 0; i < ${MAX_ISLANDS}; i++) {
    if (i >= uIslandCount) break;
    dIsle = min(dIsle, length(p - uIslands[i].xy) - uIslands[i].z);
  }
  float s = 1.0 - smoothstep(0.0, 18.0, dIsle);
  c = mix(c, uShallow, 0.85 * s);
  float s2 = 1.0 - smoothstep(0.0, 4.0, dIsle);
  c = mix(c, uShore, s2);
  c = mix(c, uCalm, 0.08 * calm);
  float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, uViewDir), 0.0, 1.0), 5.0);
  c = mix(c, uSky, 0.6 * fres);

  // §7.3 Espuma de cresta (en manchas) y de orilla (ondas que avanzan hacia la costa)
  float crest = smoothstep(0.72, 0.95, h) * 0.35 * step(0.5, vnoise(p * 0.45 + drift * 0.5));
  float band = step(0.0, dIsle) * (1.0 - smoothstep(2.0, 2.5, dIsle));
  float shore = band * (0.5 + 0.5 * sin(dIsle * 2.4 - uTime * 1.6)) * 0.8;
  c = mix(c, uFoam, clamp(crest + shore, 0.0, 1.0));

  // Especular Blinn-Phong: con agua plana n·H = 0,834 → 0; solo destellan las facetas de ola
  vec3 H = normalize(uLightDir + uViewDir);
  c += uSpec * pow(max(dot(n, H), 0.0), 90.0) * 0.8;

  // §7.4 Rejilla de sectores cada 100 m (blanca al 5 %, 1 px)
  float e = max(abs(p.x), abs(p.y)) - uMapHalf;
  if (e < 0.0) {
    vec2 g = (fract(p / 100.0 + 0.5) - 0.5) * 100.0;
    float grid = max(lineMask(g.x, 1.0), lineMask(g.y, 1.0));
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

#if defined(TONE_MAPPING) && defined(NEUTRAL_TOE_COMPENSATION)
  c = neutralToeInverse(c);
#endif
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const col = (hex: string) => new THREE.Color(hex);

export function createOceanMaterial(islands: IslandDef[]): THREE.ShaderMaterial {
  const packed = Array.from({ length: MAX_ISLANDS }, (_, i) => {
    const island = islands[i];
    return island ? new THREE.Vector3(island.x, island.z, island.radius) : new THREE.Vector3(0, 0, -1);
  });
  const waves = WAVES.map(([lambda, turn, slope]) => {
    const k = (2 * Math.PI) / lambda;
    const c = Math.sqrt((9.81 * lambda) / (2 * Math.PI)) * 0.35;
    const d = WIND.clone().rotateAround(new THREE.Vector2(), turn * deg);
    return { v: new THREE.Vector4(d.x, d.y, k, k * c), amp: slope / k, slope };
  });
  const theta = CAMERA.elevation;
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: { NEUTRAL_TOE_COMPENSATION: 1 },
    uniforms: {
      uTime: { value: 0 },
      uLightDir: { value: new THREE.Vector3(...LIGHTING.sunDir) },
      uViewDir: { value: new THREE.Vector3(0, Math.sin(theta), Math.cos(theta)) },
      uIslands: { value: packed },
      uIslandCount: { value: Math.min(islands.length, MAX_ISLANDS) },
      uMapHalf: { value: MAP_HALF_SIZE },
      uSafeCenter: { value: new THREE.Vector2(PORT_POSITION.x, PORT_POSITION.z) },
      uSafeRadius: { value: SAFE_ZONE_RADIUS },
      uWaves: { value: waves.map((w) => w.v) },
      uWaveAmp: { value: new THREE.Vector4(...waves.map((w) => w.amp)) },
      uWaveSlope: { value: new THREE.Vector4(...waves.map((w) => w.slope)) },
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
      uSafeLine: { value: col(PALETTE.safeBorder) }
    }
  });
}

// Plano unitario horizontal; se escala al suelo visible + 40 m y se recentra en cada frame
export function createOceanGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
}

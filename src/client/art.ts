// Tokens visuales del juego. Fuente de verdad: docs/game/ART-DIRECTION.md (§N) y docs/game/VFX-SPEC.md (VFX §N).
// Los hex son sRGB; three los pasa a lineal al construir THREE.Color (ColorManagement activo).
import { ShipKind } from '../game/constants';

const deg = Math.PI / 180;

// ---- §4.1 Mundo ----
export const PALETTE = {
  oceanDeep: '#1A5F86',
  oceanTrough: '#154F72',
  oceanCrest: '#2F7AA3',
  oceanShallow: '#2C93A8',
  oceanShore: '#49B9BE',
  oceanFoam: '#EAF6FA',
  oceanSpec: '#FFF4D6',
  oceanSky: '#9CCBE6',
  oceanEdge: '#0F3F5C',
  calmWater: '#2A7FA0', // tinte de la zona segura (§7.3)
  mapBorder: '#F2C14E',
  safeBorder: '#F5F1E6',
  sand: '#E6CF9A',
  sandWet: '#C9AE78',
  grass: '#5E9E48',
  grassDark: '#3F7A35',
  rock: '#8A8378',
  rockDark: '#625C53',
  palmTrunk: '#8A5A3B',
  palmLeaf: '#4E9A3E',
  townWall: '#E8DCC0',
  townRoof: '#B5523B',
  lighthouse: '#F5F1E6',
  lantern: '#FFE9A8',
  portFlag: '#F2C14E',
  buoyA: '#F2C14E',
  buoyB: '#F5F1E6',
  cargo: '#B07A3E',
  lootStrap: '#F2C14E'
};

// ---- §4.2.1 Albedo de las caras horizontales (D17) ----
// Con la luz de §5 una cara horizontal recibe ×(1,153, 1,149, 1,118) en lineal. Los materiales que se ven sobre todo
// desde arriba llevan un albedo compensado (objetivo ÷ multiplicador) para que en pantalla salga su token (AD-25);
// velas y cascos (verticales) usan el hex tal cual
export const TOP_FACE = {
  sand: { albedo: '#D8C392', target: PALETTE.sand },
  grass: { albedo: '#589444', target: PALETTE.grass },
  // Tablas de cubierta a ±7 de L* de la cubierta en pantalla (#C9965E; pirata #6E4B30), que queda como su media (D36, AD-25)
  deck: { albedo: '#CF9F6A', target: '#DDA970' }, // tabla clara, jugador y mercante
  deckPirate: { albedo: '#78563C', target: '#805C40' },
  deckAlt: { albedo: '#AA7C49', target: '#B5844D' }, // tabla oscura, jugador y mercante
  deckAltPirate: { albedo: '#56371F', target: '#5C3B21' },
  cargo: { albedo: '#A5723B', target: PALETTE.cargo }
} as const;

// ---- §4.2 Barcos (un look por facción; todos los jugadores comparten colores, §9) ----
export interface ShipLook {
  hull: string;
  band: string;
  bottom: string;
  deck: string;
  deckAlt: string; // tablas de cubierta alternas (D23)
  rail: string;
  mast: string;
  sail: string;
  sailAlt: string; // paños de lona alternos (D23, D36); en las cuadras del mercante, solo en las filas crema
  sailStripe: string | null;
  cannon: string;
  gunport: string;
  flag: string;
  flagMark: string | null;
  trim: string;
  lantern: string;
  cargo: string;
  barrel: string;
}

const SHARED = { cannon: '#26282B', gunport: '#1A1410', trim: '#D9A93F', lantern: '#FFE9A8', cargo: TOP_FACE.cargo.albedo, barrel: '#8A5A33' };

export const SHIP_LOOKS: Record<ShipKind, ShipLook> = {
  player: {
    ...SHARED, hull: '#4A2F1C', band: '#D4A548', bottom: '#3A2416', deck: TOP_FACE.deck.albedo, deckAlt: TOP_FACE.deckAlt.albedo, rail: '#6B4426', mast: '#6B4426',
    sail: '#F2EADB', sailAlt: '#D0C8BA', sailStripe: null, flag: '#F2C14E', flagMark: null
  },
  pirate: {
    ...SHARED, hull: '#2A2523', band: '#B3261E', bottom: '#1C1817', deck: TOP_FACE.deckPirate.albedo, deckAlt: TOP_FACE.deckAltPirate.albedo, rail: '#3A2A20', mast: '#3A2A20',
    sail: '#2B2A2E', sailAlt: '#0D0D0F', sailStripe: null, flag: '#111111', flagMark: '#F5F1E6'
  },
  merchant: {
    ...SHARED, hull: '#6E4A2C', band: '#E8DCC0', bottom: '#3A2416', deck: TOP_FACE.deck.albedo, deckAlt: TOP_FACE.deckAlt.albedo, rail: '#6B4426', mast: '#6B4426',
    sail: '#EADFC6', sailAlt: '#D9CEB6', sailStripe: '#2F7FB8', flag: '#2F7FB8', flagMark: '#F5F1E6'
  }
};

// ---- §4.3 Relación con el jugador: color + icono + forma (nunca solo color) ----
export type Relation = 'self' | 'player' | 'pirate' | 'merchant';
export type RelationIcon = 'star' | 'anchor' | 'skull' | 'coins';

export const RELATIONS: Record<Relation, { text: string; bar: string; icon: RelationIcon }> = {
  self: { text: '#FFD166', bar: '#3DDC97', icon: 'star' },
  player: { text: '#F5F1E6', bar: '#F5F1E6', icon: 'anchor' },
  pirate: { text: '#FF7A7A', bar: '#FF7A7A', icon: 'skull' },
  merchant: { text: '#6CC3F5', bar: '#6CC3F5', icon: 'coins' }
};

export const RELATION_COLORS: Record<Relation, string> = {
  self: RELATIONS.self.text,
  player: RELATIONS.player.text,
  pirate: RELATIONS.pirate.text,
  merchant: RELATIONS.merchant.text
};

export function relationOf(ship: { id: string; kind: ShipKind }, myShipId: string | null): Relation {
  return ship.id === myShipId ? 'self' : ship.kind;
}

// ---- §5 Iluminación y render ----
// Sin tone mapping (`<Canvas flat>`, D2): el toe de NeutralToneMapping aplastaba todos los oscuros. Hemisférica
// clara ×3,0 + sol ×1,2 (D8): velas del jugador L* 81–90 en cualquier cara, pirata 14–16, casco 18–21
export const LIGHTING = {
  hemiSky: '#F2F6FA',
  hemiGround: '#B8C9D1',
  hemiIntensity: 3.0,
  sunColor: '#FFF1D6',
  sunIntensity: 1.2,
  sunDir: normalize3(-0.45, 0.8, 0.4), // hacia la luz; el océano usa el mismo vector
  dprDesktop: [1, 2] as [number, number],
  dprMobile: [1, 1.5] as [number, number],
  // Calidad adaptativa: media > 20 ms durante 3 s → DPR × 0,75 y partículas × 0,5; se revierte tras 10 s < 14 ms
  slowFrameMs: 20,
  slowWindowS: 3,
  fastFrameMs: 14,
  fastWindowS: 10,
  dprStep: 0.75
};

// ---- §6.1 Cámara ----
export const CAMERA = {
  elevation: 55 * deg, // θ sobre el horizonte; guiñada 0 (arriba = −Z, derecha = +X)
  distance: 300,
  near: 50,
  far: 650,
  shakePx: 4,
  shakeMs: 160
};

// ---- §6.2 Zoom: ppm₀ calculado, 3 niveles de extensión visible ----
export const ZOOM = {
  // R nunca baja del mayor alcance de disparo de un NPC (cañonera y capitán, GDD §9): todo lo que te puede disparar
  // está en pantalla. Si un NPC alcanza más, hay que subirlo (lo vigila un test)
  hostileRangeM: 65,
  sideMarginPx: 12,
  minPpm: 1.5,
  maxPpm: 12,
  levels: [0.7, 1, 1.5] as const, // f = extensión visible; ppm = ppm₀ / f (0,7 = más cerca)
  defaultLevel: 1,
  transitionMs: 180,
  rangeTransitionMs: 600 // cañón nuevo: ease-in-out hacia el ppm₀ nuevo al cerrar la tienda (U8)
};

// R del encuadre (U8, D26): máx(alcance del cañón propio, 65 m) → 65 / 70 / 80 m con N1 / N2 / N3. Tu círculo de
// alcance cabe entero y todo lo que te puede disparar está en pantalla
export function frameRangeM(cannonRange: number): number {
  return Math.max(cannonRange, ZOOM.hostileRangeM);
}

export type HudLayout = 'desktop' | 'portrait' | 'landscape';

// Reservas de HUD arriba/abajo (px CSS) del layout de §12; las comparte el HUD
export const HUD_RESERVE: Record<HudLayout, { top: number; bottom: number }> = {
  desktop: { top: 120, bottom: 108 },
  portrait: { top: 116, bottom: 104 },
  landscape: { top: 12, bottom: 12 }
};

export const MOBILE_MAX_WIDTH = 700;
export const LANDSCAPE_MAX_HEIGHT = 500;

export function hudLayout(w: number, h: number): HudLayout {
  if (w < MOBILE_MAX_WIDTH) return 'portrait';
  if (h < LANDSCAPE_MAX_HEIGHT) return 'landscape';
  return 'desktop';
}

// ppm₀ = clamp(min((W/2 − 12)/R, (H/2 − max(top, bottom))/(R·sin θ)), 1,5, 12): el máximo con el que el círculo de
// radio R alrededor del barco cabe entero dentro de las reservas del HUD (AC-24, AD-06)
export function computePpm0(w: number, h: number, rangeM: number): number {
  const reserve = HUD_RESERVE[hudLayout(w, h)];
  const byWidth = (w / 2 - ZOOM.sideMarginPx) / rangeM;
  const byHeight = (h / 2 - Math.max(reserve.top, reserve.bottom)) / (rangeM * Math.sin(CAMERA.elevation));
  return Math.min(ZOOM.maxPpm, Math.max(ZOOM.minPpm, Math.min(byWidth, byHeight)));
}

// ---- §11 Placas de nombre y vida (lógica y medidas; los estilos estáticos van en src/styles/world-overlays.css) ----
export const LABEL = {
  pool: 48,
  barW: 64,
  barWMobile: 52,
  barH: 5,
  barHMobile: 4,
  maxW: 128,
  maxWMobile: 116,
  padX: 6,
  nameMax: 16,
  anchorM: 1.5, // la placa abraza el casco: borde +Z del casco + 1,5 m
  declutterHz: 10,
  steps: [18, 36],
  gapPx: 2,
  lowHp: 0.3,
  fadeMs: 300,
  reloadPx: 18,
  reloadGapPx: 6, // hueco entre el indicador y el borde izquierdo de la placa propia
  reloadTopPx: 2,
  reloadFlashMs: 120,
  // §11.4 (D39): a menos de 8 px de un bloque del HUD la placa se oculta en el mismo frame y vuelve a ≥ 16 px
  // (histéresis) con el fundido fade-in de 150 ms
  hudHidePx: 8,
  hudShowPx: 16,
  hudFadeMs: 150
};

// ---- VFX §9 Números flotantes (tiempos; color, tamaño y peso por tipo en world-overlays.css) ----
export type DamageTextKind = 'dealt' | 'heavy' | 'taken' | 'others' | 'miss' | 'repair' | 'gold';

export const DAMAGE_TEXT = {
  poolDesktop: 24,
  poolMobile: 16,
  risePx: 36,
  durationMs: 900,
  jitterPx: 10,
  stackMs: 250,
  stackPx: 18,
  heavyRatio: 0.15, // golpe fuerte: ≥ 15 % de la vida máxima del objetivo
  opacity: { dealt: 1, heavy: 1, taken: 1, others: 0.75, miss: 1, repair: 1, gold: 1 } as Record<DamageTextKind, number>
};

// ---- VFX §10–12, §14 Anillos ----
export const RING_COLORS = {
  outline: '#07121B',
  target: '#FFD166',
  hover: '#FFFFFF',
  own: '#F2C14E',
  rangeIn: '#3DDC97',
  rangeOut: '#F5F1E6',
  shield: '#BDEBFF',
  click: '#E6F7FF',
  clickCross: '#FF7A7A',
  wreck: '#F2C14E'
};

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

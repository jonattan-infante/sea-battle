// Capas DOM sobre el canvas (ART-DIRECTION §11, VFX-SPEC §9): placas de nombre y vida y números flotantes.
// Se posicionan por frame con transform, por ref y sin estado de React (CLAUDE.md, regla 3; AC-83). El
// contenido y el declutter se recalculan a 10 Hz y solo se escribe en el DOM lo que cambia. Los estilos
// estáticos (clases wo-*) viven en src/styles/world-overlays.css.
import { DAMAGE_TEXT, DamageTextKind, LABEL, Relation, RELATIONS, relationOf } from './art';
import type { RenderShip } from './game-client';

export { relationOf };
export type { Relation };

// D41: el HUD lo emite en el commit en que cambia la lista de avisos (antes de pintar). La capa de placas relee entonces
// las cajas de los bloques y oculta ya las placas que quedan debajo, sin esperar a la siguiente pasada a 10 Hz
export const HUD_BLOCKS_EVENT = 'sea-battle:hud-blocks';

// Iconos de línea de Lucide (ISC), 24×24, trazo 2 px, currentColor (ART-DIRECTION §13)
const ICONS = {
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  anchor: '<circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>',
  skull: '<circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
} as const;

export type IconName = keyof typeof ICONS;

export function iconSvg(name: IconName, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  parent?.appendChild(e);
  return e;
}

const DY_STEPS = [0, ...LABEL.steps];

function truncateName(name: string): string {
  return name.length > LABEL.nameMax ? `${name.slice(0, LABEL.nameMax - 1)}…` : name;
}

// ---- Lo que la capa necesita del runtime (sin depender de three) ----
export interface ScreenPoint {
  sx: number;
  sy: number;
}

export interface LabelTarget {
  ship: RenderShip;
  length: number;
  beam: number;
}

export interface ReloadState {
  visible: boolean;
  progress: number; // 0..1, monótono dentro del ciclo
  ready: boolean;
  flash: boolean;
}

export interface OverlayHost {
  readonly viewW: number;
  readonly viewH: number;
  readonly mobile: boolean;
  readonly reducedMotion: boolean;
  projectInto(x: number, y: number, z: number, out: ScreenPoint): void;
  myShipId(): string | null;
  focusId(): string | null; // objetivo: seleccionado o atacado
  serverTime(): number;
  reload(): ReloadState;
}

type PlateMode = 'full' | 'compact' | 'hidden';

interface Plate {
  id: string;
  target: LabelTarget | null;
  root: HTMLDivElement;
  body: HTMLDivElement;
  row: HTMLDivElement;
  icon: HTMLSpanElement;
  name: HTMLSpanElement;
  status: HTMLSpanElement;
  bar: HTMLDivElement;
  trail: HTMLDivElement;
  fill: HTMLDivElement;
  reload: HTMLDivElement | null;
  // estado escrito (para no tocar el DOM si no cambia)
  relation: Relation | null;
  nameText: string;
  statusKey: string;
  fillPx: number;
  low: boolean;
  attacker: boolean;
  mode: PlateMode;
  display: boolean;
  dy: number;
  sx: number;
  sy: number;
  opacity: number;
  w: number;
  h: number;
  sizeDirty: boolean;
  // caja colocada en el declutter, relativa al ancla en x y a la posición escrita en y (§11.2 y §11.4)
  bx: number;
  bw: number;
  bh: number;
  slot: number; // índice en placed, o −1 si no ocupa sitio
  // bajo un bloque del HUD (§11.4)
  hud: boolean;
  entering: boolean;
  enterUntil: number;
  // declutter
  priority: number;
  dist: number;
  onScreen: boolean;
  reloadP: number;
  reloadVisible: boolean;
  reloadReady: boolean;
  reloadFlash: boolean;
}

const pt: ScreenPoint = { sx: 0, sy: 0 };

export class LabelLayer {
  private readonly plates: Plate[] = [];
  private readonly byId = new Map<string, Plate>();
  private readonly order: Plate[] = [];
  private readonly placed: number[] = []; // rects colocados: x, y, w, h
  // Bloques del HUD (§11.4, D39): cajas de los [data-hud-block] visibles, relativas al contenedor, leídas a 10 Hz en la
  // fase de lectura del declutter y al cambiar el tamaño de la ventana. Por frame solo se usan estas cajas guardadas
  private readonly blocks: number[] = []; // x, y, w, h
  private readonly onResize = () => this.readBlocks();
  private readonly onBlocksChanged = () => this.refreshBlocks();
  private lastTick = 0;

  constructor(private readonly container: HTMLElement, private readonly host: OverlayHost) {
    for (let i = 0; i < LABEL.pool; i++) this.plates.push(this.createPlate());
    window.addEventListener('resize', this.onResize);
    window.addEventListener(HUD_BLOCKS_EVENT, this.onBlocksChanged);
  }

  private createPlate(): Plate {
    const mobile = this.host.mobile;
    const barW = mobile ? LABEL.barWMobile : LABEL.barW;
    const barH = mobile ? LABEL.barHMobile : LABEL.barH;
    const root = el('div', 'wo-plate', this.container);
    root.dataset.plate = '';
    // Medidas que también usa la lógica (ancho de la barra y declutter): una sola fuente en LABEL
    root.style.setProperty('--bar-w', `${barW}px`);
    root.style.setProperty('--bar-h', `${barH}px`);
    root.style.setProperty('--plate-max', `${mobile ? LABEL.maxWMobile : LABEL.maxW}px`);
    root.style.setProperty('--reload-size', `${LABEL.reloadPx}px`);
    root.style.setProperty('--reload-gap', `${LABEL.reloadGapPx}px`);
    root.style.setProperty('--reload-top', `${LABEL.reloadTopPx}px`);
    root.style.setProperty('--hud-fade', `${LABEL.hudFadeMs}ms`);
    const body = el('div', 'wo-plate__body', root);
    const row = el('div', 'wo-plate__row', body);
    const icon = el('span', 'wo-plate__icon', row);
    const name = el('span', 'wo-plate__name', row);
    // 2.ª fila: barra + iconos de estado a su derecha (§11.1): el estado nunca le quita espacio al nombre
    const meter = el('div', 'wo-plate__meter', body);
    const bar = el('div', 'wo-plate__bar', meter);
    const status = el('span', 'wo-plate__status', meter);
    const trail = el('div', 'wo-plate__trail', bar);
    const fill = el('div', 'wo-plate__fill', bar);
    // Caja estimada hasta la primera medida en modo completo (world-overlays.css): ancho mínimo + borde, y alto de
    // las 2 filas (16 + 1 + 12) + padding 2 × 2 + borde 2
    const w = barW + 2 * LABEL.padX + 2;
    return {
      id: '', target: null, root, body, row, icon, name, status, bar, trail, fill, reload: null,
      relation: null, nameText: '', statusKey: '', fillPx: -1, low: false, attacker: false,
      mode: 'full', display: false, dy: 0, sx: NaN, sy: NaN, opacity: 1, w, h: 35, sizeDirty: true,
      bx: -w / 2, bw: w, bh: 35, slot: -1, hud: false, entering: false, enterUntil: 0,
      priority: 4, dist: 0, onScreen: false, reloadP: -1, reloadVisible: false, reloadReady: false, reloadFlash: false
    };
  }

  // Altas y bajas de barcos: asigna placas del pool (sin crear nodos)
  sync(targets: Iterable<LabelTarget>): void {
    const seen = new Set<string>();
    for (const t of targets) {
      seen.add(t.ship.id);
      const plate = this.byId.get(t.ship.id);
      if (plate) {
        plate.target = t;
        continue;
      }
      const free = this.plates.find((p) => p.target === null);
      if (!free) continue;
      free.id = t.ship.id;
      free.target = t;
      free.root.dataset.shipId = t.ship.id;
      free.relation = null;
      free.nameText = '';
      free.statusKey = '';
      free.fillPx = -1;
      free.sx = NaN;
      free.sizeDirty = true;
      this.byId.set(t.ship.id, free);
    }
    for (const [id, plate] of this.byId) {
      if (seen.has(id)) continue;
      this.release(plate);
      this.byId.delete(id);
    }
  }

  private release(plate: Plate): void {
    plate.target = null;
    plate.id = '';
    this.setDisplay(plate, false);
    this.setLow(plate, false);
    plate.reload?.classList.remove('is-visible', 'is-ready', 'is-flash');
    plate.reloadVisible = false;
    plate.reloadReady = false;
    plate.reloadFlash = false;
  }

  frame(now: number): void {
    if (now - this.lastTick >= 1000 / LABEL.declutterHz) {
      this.lastTick = now;
      this.refreshContent();
      this.declutter();
    }
    this.position(now);
  }

  // ---- 10 Hz: contenido ----
  private refreshContent(): void {
    const myId = this.host.myShipId();
    const me = myId ? this.byId.get(myId)?.target?.ship : undefined;
    const serverTime = this.host.serverTime();
    for (const plate of this.byId.values()) {
      const ship = plate.target!.ship;
      const relation = relationOf(ship, myId);
      if (relation !== plate.relation) {
        plate.relation = relation;
        plate.root.dataset.relation = relation; // color de texto y de barra por relación (CSS)
        plate.icon.innerHTML = iconSvg(RELATIONS[relation].icon, 12);
        this.ensureReload(plate, relation === 'self');
        plate.sizeDirty = true;
      }
      const name = truncateName(ship.name);
      if (name !== plate.nameText) {
        plate.nameText = name;
        plate.name.textContent = name;
        plate.sizeDirty = true;
      }
      const barW = this.host.mobile ? LABEL.barWMobile : LABEL.barW;
      const ratio = ship.maxHp > 0 ? Math.max(0, Math.min(1, ship.hp / ship.maxHp)) : 0;
      const fillPx = Math.round(barW * ratio);
      if (fillPx !== plate.fillPx) {
        plate.fillPx = fillPx;
        plate.fill.style.width = `${fillPx}px`;
        plate.trail.style.width = `${fillPx}px`; // la estela se encoge con transición de 400 ms
      }
      const low = ship.state === 'alive' && ratio < LABEL.lowHp;
      this.setLow(plate, low);
      const protectedS = Math.max(0, Math.ceil(ship.protectedUntil - serverTime));
      const attacker = !!me && ship.kind === 'player' && relation !== 'self' && ship.targetId === myId;
      const repairing = relation === 'self' && ship.repairing;
      const statusKey = `${protectedS}|${low ? 1 : 0}|${repairing ? 1 : 0}|${attacker ? 1 : 0}`;
      if (statusKey !== plate.statusKey) {
        plate.statusKey = statusKey;
        let html = '';
        if (attacker) html += `<span class="wo-status--attacker">${iconSvg('swords', 12)}</span>`;
        if (repairing) html += `<span class="wo-status--repair">${iconSvg('wrench', 12)}</span>`;
        if (protectedS > 0) html += `<span class="wo-status--shield">${iconSvg('shield', 12)}${protectedS}</span>`;
        if (low) html += `<span class="wo-status--danger">${iconSvg('alert', 12)}</span>`;
        plate.status.innerHTML = html;
        plate.sizeDirty = true;
      }
      if (attacker !== plate.attacker) {
        plate.attacker = attacker;
        plate.root.classList.toggle('is-attacker', attacker);
      }
      // Prioridad de declutter (§11.2): propio > objetivo > los que te atacan > hostiles a ≤ 80 m > resto por distancia
      const focus = this.host.focusId();
      plate.dist = me ? Math.hypot(ship.x - me.x, ship.z - me.z) : 0;
      plate.priority = relation === 'self' ? 0 : ship.id === focus ? 1 : ship.targetId === myId && myId ? 2 : ship.kind === 'pirate' && plate.dist <= 80 ? 3 : 4;
    }
  }

  private ensureReload(plate: Plate, own: boolean): void {
    if (own && !plate.reload) {
      plate.reload = el('div', 'wo-reload', plate.root);
      plate.reload.dataset.reload = '';
    } else if (!own && plate.reload) {
      plate.reload.remove();
      plate.reload = null;
    } else return;
    // Nodo nuevo o retirado: el estado escrito era del anterior (si no, un indicador nuevo nunca se mostraría)
    plate.reloadP = -1;
    plate.reloadVisible = false;
    plate.reloadReady = false;
    plate.reloadFlash = false;
  }

  private setLow(plate: Plate, low: boolean): void {
    if (low === plate.low) return;
    plate.low = low;
    plate.root.classList.toggle('is-low', low); // pulso de 1 Hz en CSS (fijo con movimiento reducido)
  }

  private setDisplay(plate: Plate, display: boolean): void {
    if (display === plate.display) return;
    plate.display = display;
    plate.root.style.display = display ? 'block' : 'none';
    if (display) plate.sizeDirty = true;
    else if (plate.hud || plate.entering) {
      // Sin dibujar no hay HUD que esquivar: al volver se decide en su primer frame, sin fundido heredado
      plate.hud = false;
      plate.entering = false;
      plate.root.classList.remove('is-hud', 'is-entering');
    }
  }

  // §11.4: oculta en el mismo frame y sin transición; al volver, fundido de entrada en los hijos (world-overlays.css), que
  // no pisa la opacidad del hundimiento escrita en línea en la raíz. Sin fundido con movimiento reducido
  private setHud(plate: Plate, hud: boolean, now: number): void {
    plate.hud = hud;
    plate.root.classList.toggle('is-hud', hud);
    const entering = !hud && !this.host.reducedMotion;
    if (entering !== plate.entering) {
      plate.entering = entering;
      plate.root.classList.toggle('is-entering', entering);
    }
    if (entering) plate.enterUntil = now + LABEL.hudFadeMs + 50; // margen de 3 frames para que la animación acabe
  }

  private anchor(plate: Plate): void {
    const t = plate.target!;
    const s = t.ship;
    // Extremo +Z de la caja del casco (abajo en pantalla) + 1,5 m: la placa abraza el casco con cualquier rumbo
    const ez = Math.abs((t.length / 2) * Math.cos(s.heading)) + Math.abs((t.beam / 2) * Math.sin(s.heading));
    this.host.projectInto(s.x, 0, s.z + ez + LABEL.anchorM, pt);
  }

  // ---- 10 Hz: declutter (§11.2) ----
  private declutter(): void {
    const { viewW, viewH } = this.host;
    const order = this.order;
    order.length = 0;
    // Lecturas de tamaño agrupadas (un solo layout). Solo en modo completo: medida con el estilo compacto, la caja
    // se quedaría corta cuando la placa vuelva a completa y se montaría sobre sus vecinas (AD-11)
    for (const plate of this.byId.values()) {
      if (plate.display && plate.sizeDirty && plate.mode === 'full') {
        plate.w = plate.body.offsetWidth;
        plate.h = plate.body.offsetHeight;
        plate.sizeDirty = false;
      }
    }
    this.readBlocks();
    for (const plate of this.byId.values()) {
      const ship = plate.target!.ship;
      const visible = ship.state === 'alive' || (ship.state === 'sinking' && plate.opacity > 0);
      this.anchor(plate);
      plate.onScreen = visible && pt.sx > -plate.w && pt.sx < viewW + plate.w && pt.sy > -plate.h && pt.sy < viewH + 8;
      plate.sx = pt.sx;
      plate.sy = pt.sy;
      if (plate.onScreen) order.push(plate);
      else plate.mode = 'hidden';
    }
    order.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
    const placed = this.placed;
    placed.length = 0;
    const gap = LABEL.gapPx;
    // Placa compacta: la barra con su borde y el borde (transparente) del cuerpo
    const barW = (this.host.mobile ? LABEL.barWMobile : LABEL.barW) + 4;
    const barH = (this.host.mobile ? LABEL.barHMobile : LABEL.barH) + 4;
    for (const plate of order) {
      // AC-107: la caja de la placa propia incluye el indicador de recarga, siempre (aunque esté oculto) para que
      // las placas vecinas no salten cada vez que aparece o desaparece
      const lead = plate.reload ? LABEL.reloadPx + LABEL.reloadGapPx : 0;
      const x = plate.sx - plate.w / 2 - lead;
      const w = plate.w + lead;
      const h = plate.reload ? Math.max(plate.h, LABEL.reloadTopPx + LABEL.reloadPx) : plate.h;
      let done = false;
      for (const dy of DY_STEPS) {
        if (!this.hits(x, plate.sy + dy, w, h, gap)) {
          this.place(plate, 'full', dy, x, w, h);
          done = true;
          break;
        }
      }
      if (done) continue;
      if (plate.priority < 2) {
        // Nunca se ocultan ni se compactan la propia y la del objetivo
        this.place(plate, 'full', LABEL.steps[LABEL.steps.length - 1], x, w, h);
        continue;
      }
      const cx = plate.sx - barW / 2;
      if (!this.hits(cx, plate.sy, barW, barH, gap)) this.place(plate, 'compact', 0, cx, barW, barH);
      else plate.mode = 'hidden';
    }
  }

  private hits(x: number, y: number, w: number, h: number, gap: number, skip = -1): boolean {
    const p = this.placed;
    for (let i = 0; i < p.length; i += 4) {
      if (i === skip) continue;
      if (x < p[i] + p[i + 2] + gap && x + w + gap > p[i] && y < p[i + 1] + p[i + 3] + gap && y + h + gap > p[i + 1]) return true;
    }
    return false;
  }

  private readBlocks(): void {
    const blocks = this.blocks;
    blocks.length = 0;
    const els = this.container.ownerDocument.querySelectorAll<HTMLElement>('[data-hud-block]');
    if (els.length === 0) return;
    const c = this.container.getBoundingClientRect();
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (r.width > 0 && r.height > 0) blocks.push(r.left - c.left, r.top - c.top, r.width, r.height); // display: none da 0 × 0
    }
  }

  // D41: un aviso que entra de golpe oculta en el mismo commit las placas que tapa, con su última posición escrita.
  // Volver a mostrarlas no corre prisa: lo decide position() en el frame siguiente
  private refreshBlocks(): void {
    this.readBlocks();
    const now = performance.now();
    for (const plate of this.byId.values()) {
      if (plate.display && !plate.hud && this.underHud(plate.sx + plate.bx, plate.sy, plate.bw, plate.bh, LABEL.hudHidePx)) this.setHud(plate, true, now);
    }
  }

  // ¿La caja, ampliada `margin` px por cada lado, se cruza con algún bloque del HUD?
  private underHud(x: number, y: number, w: number, h: number, margin: number): boolean {
    const b = this.blocks;
    for (let i = 0; i < b.length; i += 4) {
      if (x - margin < b[i] + b[i + 2] && x + w + margin > b[i] && y - margin < b[i + 1] + b[i + 3] && y + h + margin > b[i + 1]) return true;
    }
    return false;
  }

  private place(plate: Plate, mode: PlateMode, dy: number, x: number, w: number, h: number): void {
    if (mode !== plate.mode) plate.root.classList.toggle('is-compact', mode === 'compact');
    plate.mode = mode;
    plate.dy = dy;
    plate.bx = x - plate.sx;
    plate.bw = w;
    plate.bh = h;
    // §11.4: una placa bajo el HUD no ocupa sitio, así que sus vecinas conservan su posición natural
    plate.slot = -1;
    if (this.underHud(x, plate.sy + dy, w, h, plate.hud ? LABEL.hudShowPx : LABEL.hudHidePx)) return;
    plate.slot = this.placed.length;
    this.placed.push(x, plate.sy + dy, w, h);
  }

  // ---- Por frame: posición, desvanecido al hundirse y recarga propia ----
  private position(now: number): void {
    const myId = this.host.myShipId();
    for (const plate of this.byId.values()) {
      const ship = plate.target!.ship;
      let opacity = 1;
      if (ship.state === 'sinking') opacity = Math.max(0, 1 - (now - ship.sinkingSince) / LABEL.fadeMs);
      else if (ship.state === 'dead') opacity = 0;
      plate.opacity = opacity;
      const show = plate.mode !== 'hidden' && opacity > 0 && plate.onScreen;
      this.setDisplay(plate, show);
      if (!show) continue;
      this.anchor(plate);
      const sx = Math.round(pt.sx);
      const sy = Math.round(pt.sy + plate.dy);
      if (sx !== plate.sx || sy !== plate.sy) {
        plate.sx = sx;
        plate.sy = sy;
        plate.root.style.transform = `translate3d(${sx}px, ${sy}px, 0) translateX(-50%)`;
      }
      const alpha = opacity < 1 ? opacity.toFixed(2) : '';
      if (plate.root.style.opacity !== alpha) plate.root.style.opacity = alpha;
      // §11.4 (D39): con la caja colocada (completa o compacta, con su dy y la recarga de la propia), a < 8 px de un
      // bloque del HUD se oculta en este mismo frame; vuelve a ≥ 16 px si su sitio del declutter sigue libre
      const bx = sx + plate.bx;
      if (!plate.hud) {
        if (this.underHud(bx, sy, plate.bw, plate.bh, LABEL.hudHidePx)) this.setHud(plate, true, now);
      } else if (!this.underHud(bx, sy, plate.bw, plate.bh, LABEL.hudShowPx) && !this.hits(bx, sy, plate.bw, plate.bh, LABEL.gapPx, plate.slot)) {
        this.setHud(plate, false, now);
      }
      if (plate.entering && now >= plate.enterUntil) {
        plate.entering = false;
        plate.root.classList.remove('is-entering');
      }
      if (plate.reload && plate.id === myId) this.updateReload(plate);
    }
  }

  private updateReload(plate: Plate): void {
    const r = this.host.reload();
    const el = plate.reload!;
    const visible = r.visible && plate.mode === 'full';
    if (visible !== plate.reloadVisible) {
      plate.reloadVisible = visible;
      el.classList.toggle('is-visible', visible);
    }
    if (!visible) return;
    const p = r.flash ? 1 : r.progress;
    if (Math.abs(p - plate.reloadP) > 0.002 || (p === 1 && plate.reloadP !== 1)) {
      plate.reloadP = p;
      el.style.setProperty('--p', p.toFixed(3));
    }
    if (r.flash !== plate.reloadFlash) {
      plate.reloadFlash = r.flash;
      el.classList.toggle('is-flash', r.flash); // destello blanco de 120 ms al disparar
    }
    const ready = r.ready && !r.flash;
    if (ready !== plate.reloadReady) {
      plate.reloadReady = ready;
      el.classList.toggle('is-ready', ready); // lleno y armado: borde dorado con pulso de 1,2 Hz
    }
  }

  // Rectángulos visibles (depuración/QA de AD-11). La propia incluye el indicador de recarga si se ve (AC-107)
  visibleRects(): { id: string; x: number; y: number; w: number; h: number; mode: PlateMode; reload: boolean }[] {
    const out: { id: string; x: number; y: number; w: number; h: number; mode: PlateMode; reload: boolean }[] = [];
    for (const plate of this.byId.values()) {
      if (!plate.display || plate.hud) continue;
      const r = plate.body.getBoundingClientRect();
      let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
      const reload = !!plate.reload && plate.reloadVisible;
      if (reload) {
        const q = plate.reload!.getBoundingClientRect();
        x0 = Math.min(x0, q.left);
        y0 = Math.min(y0, q.top);
        x1 = Math.max(x1, q.right);
        y1 = Math.max(y1, q.bottom);
      }
      out.push({ id: plate.id, x: x0, y: y0, w: x1 - x0, h: y1 - y0, mode: plate.mode, reload });
    }
    return out;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener(HUD_BLOCKS_EVENT, this.onBlocksChanged);
    for (const plate of this.plates) plate.root.remove();
    this.byId.clear();
  }
}

// ---- Números flotantes (VFX §9): un punto fijo del mundo, animación por la Web Animations API ----
interface FloatItem {
  root: HTMLDivElement;
  rise: HTMLSpanElement;
  pop: HTMLElement;
  x: number; y: number; z: number;
  jitter: number;
  stack: number;
  start: number;
  end: number;
  active: boolean;
  anims: Animation[];
}

export class FloatingTextLayer {
  private readonly items: FloatItem[] = [];
  private readonly lastByKey = new Map<string, { t: number; n: number }>();

  constructor(container: HTMLElement, private readonly host: OverlayHost) {
    const size = host.mobile ? DAMAGE_TEXT.poolMobile : DAMAGE_TEXT.poolDesktop;
    for (let i = 0; i < size; i++) {
      const root = el('div', 'wo-float', container);
      root.dataset.float = '';
      const rise = el('span', 'wo-float__rise', root);
      const pop = el('i', 'wo-float__pop', rise);
      this.items.push({ root, rise, pop, x: 0, y: 0, z: 0, jitter: 0, stack: 0, start: 0, end: 0, active: false, anims: [] });
    }
  }

  spawn(kind: DamageTextKind, text: string, x: number, y: number, z: number, key: string, now: number): void {
    let item = this.items.find((i) => !i.active);
    if (!item) item = this.items.reduce((a, b) => (a.start <= b.start ? a : b)); // recicla el más viejo
    for (const a of item.anims) a.cancel();
    item.anims.length = 0;
    const opacity = DAMAGE_TEXT.opacity[kind];
    const gold = kind === 'gold';
    const duration = gold ? 1200 : DAMAGE_TEXT.durationMs;
    const rise = gold ? 48 : DAMAGE_TEXT.risePx;
    const last = this.lastByKey.get(key);
    const chained = !!last && now - last.t < DAMAGE_TEXT.stackMs;
    const n = chained ? last.n + 1 : 0;
    this.lastByKey.set(key, { t: now, n });
    item.active = true;
    item.x = x; item.y = y; item.z = z;
    item.jitter = (Math.random() * 2 - 1) * DAMAGE_TEXT.jitterPx;
    item.stack = n * DAMAGE_TEXT.stackPx;
    item.start = now;
    item.end = now + duration;
    item.root.dataset.kind = kind; // color, tamaño y peso por tipo (CSS)
    item.pop.textContent = text;
    item.root.style.display = 'block';
    this.place(item);
    if (typeof item.rise.animate === 'function') {
      item.anims.push(item.rise.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-rise}px)` }], { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }));
      const fadeAt = gold ? 900 / 1200 : 600 / 900;
      const pop = kind === 'heavy'
        ? [{ transform: 'scale(1.4)', opacity, offset: 0 }, { transform: 'scale(1)', opacity, offset: 200 / duration }]
        : [{ transform: 'scale(0.8)', opacity, offset: 0 }, { transform: 'scale(1.15)', opacity, offset: 90 / duration }, { transform: 'scale(1)', opacity, offset: 200 / duration }];
      item.anims.push(item.pop.animate([...pop, { transform: 'scale(1)', opacity, offset: fadeAt }, { transform: 'scale(1)', opacity: 0, offset: 1 }], { duration, fill: 'forwards' }));
    }
  }

  frame(now: number): void {
    for (const item of this.items) {
      if (!item.active) continue;
      if (now >= item.end) {
        item.active = false;
        item.root.style.display = 'none';
        continue;
      }
      this.place(item);
    }
  }

  private place(item: FloatItem): void {
    this.host.projectInto(item.x, item.y, item.z, pt);
    item.root.style.transform = `translate3d(${Math.round(pt.sx + item.jitter)}px, ${Math.round(pt.sy - item.stack)}px, 0) translate(-50%, -50%)`;
  }

  get active(): number {
    let n = 0;
    for (const item of this.items) if (item.active) n++;
    return n;
  }

  dispose(): void {
    for (const item of this.items) {
      for (const a of item.anims) a.cancel();
      item.root.remove();
    }
    this.lastByKey.clear();
  }
}

// Indicadores de borde (E13, ART-DIRECTION §12.8, D89; AC-121 y AC-124): chips DOM sobre el canvas que señalan el barco
// propio en vista libre y a quien te dispara desde fuera del marco útil. Se colocan en cada frame con placeChip
// (edge-chips.ts), por ref y sin estado de React (CLAUDE.md, regla 3): por frame solo se escriben la posición, el ángulo
// del triángulo, la escala del latido y la opacidad, y solo si cambian. Las cajas de los [data-hud-block] se leen a
// 10 Hz, al cambiar el tamaño de la ventana y cuando el HUD avisa (HUD_BLOCKS_EVENT). La caja de cada chip (forma y
// distancia) es la de su raíz, así que la pista (AC-110) y los e2e la leen del DOM. Estilos estáticos: wo-chip* en
// src/styles/world-overlays.css
import { hudLayout, LABEL, Relation, RELATIONS, relationOf } from './art';
import {
  Attack,
  attackOpacity,
  Box,
  CHIP,
  CHIP_TIMING,
  ChipKind,
  ChipSize,
  chipSize,
  Frame,
  halfShape,
  insideFrame,
  placeChip,
  Pt,
  pulseScale,
  shapeEdge,
  USABLE_FRAME,
  visibleAttackers
} from './edge-chips';
import type { ViewMode } from './free-view';
import type { RenderShip } from './game-client';
import { HUD_BLOCKS_EVENT, iconSvg, IconName, relationIcons, ScreenPoint } from './overlays';

export interface ChipHost {
  readonly viewW: number;
  readonly viewH: number;
  readonly reducedMotion: boolean;
  projectInto(x: number, y: number, z: number, out: ScreenPoint): void;
  myShipId(): string | null;
  ship(id: string): RenderShip | undefined;
  viewCenter(): { x: number; z: number }; // el foco de la cámara: el centro de la vista libre
  viewMode(): ViewMode;
  attackers(now: number): readonly Attack[];
}

export interface ChipRect {
  kind: ChipKind;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  side: string;
  deg: number;
  travel: number;
  opacity: number;
  more: number;
}

export interface ChipActions {
  onSelf: () => void; // centra, como C
  onAttacker: (shipId: string) => void; // lo selecciona como objetivo, como Tab sobre él
}

// Los iconos del chip son los de icons.tsx (24 × 24, trazo de 2), los de la lámina D89 y los de RelationIcon; los que no
// estén aquí salen con iconSvg (Lucide), como en las placas
const GLYPHS: Partial<Record<IconName, string>> = {
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.3 3 5.4V20h10v-3.6c1.8-1.1 3-2.8 3-5.4a8 8 0 0 0-8-8Z"/><circle cx="9" cy="11.5" r="1.6"/><circle cx="15" cy="11.5" r="1.6"/><path d="M10 20v-2.5M14 20v-2.5"/>',
  crown: '<path d="M4 18 2 7l5 5 5-8 5 8 5-5-2 11Z"/><path d="M5 21h14"/>',
  anchor: '<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V21M7 11h10M4 14a8 7 0 0 0 16 0"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M17.5 10.2A6 6 0 1 1 10.2 17.5"/><path d="M9 6.5v5"/>'
};
const ICON_PX = 18;

function glyph(name: IconName, size: number): string {
  const g = GLYPHS[name];
  if (!g) return iconSvg(name, size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${g}</svg>`;
}

// Dos iconos van en columna, como RelationIcon (Hud.tsx): el 2.º a 0,55 sobre el 1.º (la calavera) a 0,75
function iconsHtml(names: readonly IconName[]): string {
  if (names.length < 2) return glyph(names[0], ICON_PX);
  return glyph(names[1], Math.round(ICON_PX * 0.55)) + glyph(names[0], Math.round(ICON_PX * 0.75));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  parent?.appendChild(e);
  return e;
}

interface Chip {
  root: HTMLButtonElement;
  shape: HTMLSpanElement;
  icon: HTMLSpanElement;
  more: HTMLSpanElement;
  tri: SVGSVGElement;
  dist: HTMLSpanElement;
  // lo que hay escrito en el DOM
  kind: ChipKind | null;
  id: string;
  iconKey: string;
  relation: Relation | null;
  size: ChipSize | null;
  moreN: number;
  distText: string;
  label: string;
  side: string;
  w: number;
  h: number;
  x: number;
  y: number;
  cy: number; // centro de la forma dentro de la caja (en x siempre es w / 2)
  travel: number; // lo que se deslizó por el borde en el último frame (depuración)
  deg: number;
  scale: number;
  opacity: number;
  display: boolean;
  // el chip propio se desvanece en su última posición
  hideAt: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const pt: ScreenPoint = { sx: 0, sy: 0 };

export class EdgeChipLayer {
  private readonly self: Chip;
  private readonly attackers: Chip[] = [];
  private readonly blocks: Box[] = [];
  private readonly labelW = new Map<number, number>(); // ancho de la pastilla por número de caracteres (cifras tabulares)
  private readonly placed: Pt[] = [];
  private readonly onResize = () => this.readBlocks();
  private readonly onFonts = () => this.labelW.clear(); // lo medido con la fuente de reserva no vale con la del juego
  private lastTick = -Infinity;

  constructor(private readonly container: HTMLElement, private readonly host: ChipHost, actions: ChipActions) {
    this.self = this.createChip();
    this.self.root.addEventListener('click', () => actions.onSelf());
    for (let i = 0; i < CHIP.maxAttackers; i++) {
      const chip = this.createChip();
      chip.root.addEventListener('click', () => {
        if (chip.id) actions.onAttacker(chip.id);
      });
      this.attackers.push(chip);
    }
    window.addEventListener('resize', this.onResize);
    window.addEventListener(HUD_BLOCKS_EVENT, this.onResize);
    container.ownerDocument.fonts?.addEventListener('loadingdone', this.onFonts);
  }

  private createChip(): Chip {
    const root = el('button', 'wo-chip', this.container);
    root.type = 'button';
    root.dataset.edgeChip = '';
    const shape = el('span', 'wo-chip__shape', root);
    const tri = document.createElementNS(SVG_NS, 'svg');
    tri.setAttribute('class', 'wo-chip__tri');
    tri.setAttribute('width', '10');
    tri.setAttribute('height', '10');
    tri.setAttribute('viewBox', '0 0 10 10');
    tri.setAttribute('aria-hidden', 'true');
    tri.innerHTML = '<polygon points="0,0 8,5 0,10"/>'; // 8 de alto y 10 de base, con la base en x = 0
    shape.appendChild(tri);
    const icon = el('span', 'wo-chip__icon', shape);
    const more = el('span', 'wo-chip__more', shape);
    const dist = el('span', 'wo-chip__dist', root);
    return {
      root, shape, icon, more, tri, dist, kind: null, id: '', iconKey: '', relation: null, size: null, moreN: 0, distText: '', label: '',
      side: '', w: 0, h: 0, x: NaN, y: NaN, cy: 0, travel: 0, deg: NaN, scale: 1, opacity: 1, display: false, hideAt: -Infinity
    };
  }

  private readBlocks(): void {
    const blocks = this.blocks;
    blocks.length = 0;
    const els = this.container.ownerDocument.querySelectorAll<HTMLElement>('[data-hud-block]');
    const c = this.container.getBoundingClientRect();
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (r.width > 0 && r.height > 0) blocks.push([r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top]); // display: none da 0 × 0
    }
  }

  frame(now: number): void {
    if (now - this.lastTick >= 1000 / LABEL.declutterHz) {
      this.lastTick = now;
      this.readBlocks();
    }
    const vw = this.host.viewW;
    const vh = this.host.viewH;
    const layout = hudLayout(vw, vh);
    const frame = USABLE_FRAME[layout];
    const size = chipSize(layout);
    const myId = this.host.myShipId();
    const me = myId ? this.host.ship(myId) : undefined;
    const alive = !!me && me.state === 'alive';
    const mode = this.host.viewMode();
    this.placed.length = 0;

    // El propio (AC-121): solo en vista libre y con el centro del barco fuera del marco útil. El rayo sale del centro
    let selfShown = false;
    if (alive && mode === 'free') {
      this.host.projectInto(me.x, 0, me.z, pt);
      if (!insideFrame(vw, vh, frame, pt.sx, pt.sy)) {
        const c = this.host.viewCenter();
        this.show(this.self, 'self', myId!, 'self', ['star'], 0, Math.hypot(me.x - c.x, me.z - c.z), 'Tu barco: centrar', size);
        this.put(this.self, vw, vh, frame, [vw / 2, vh / 2], [pt.sx, pt.sy], 1);
        this.self.hideAt = -Infinity;
        this.setOpacity(this.self, 1);
        selfShown = true;
      }
    }
    if (!selfShown) this.fadeSelf(now);

    // Los de atacante (AC-124): fuera de la vista libre (los dos chips nunca coinciden, D89). El rayo sale del barco propio
    let used = 0;
    if (alive && mode !== 'free') {
      this.host.projectInto(me.x, 0, me.z, pt);
      const origin: Pt = insideFrame(vw, vh, frame, pt.sx, pt.sy) ? [pt.sx, pt.sy] : [vw / 2, vh / 2];
      const out: { ship: RenderShip; a: Attack; sx: number; sy: number; dist: number }[] = [];
      for (const a of this.host.attackers(now)) {
        const ship = this.host.ship(a.id);
        if (!ship || ship.state !== 'alive') continue;
        this.host.projectInto(ship.x, 0, ship.z, pt);
        if (insideFrame(vw, vh, frame, pt.sx, pt.sy)) continue; // dentro del marco útil no aparece
        out.push({ ship, a, sx: pt.sx, sy: pt.sy, dist: Math.hypot(ship.x - me.x, ship.z - me.z) });
      }
      for (const { item, more } of visibleAttackers(out)) {
        const chip = this.attackers[used++];
        const relation = relationOf(item.ship, myId);
        const name = item.ship.name;
        this.show(chip, 'attacker', item.ship.id, relation, relationIcons(relation, item.ship.classId), more, item.dist, `Te ataca ${name}: seleccionar`, size);
        this.put(chip, vw, vh, frame, origin, [item.sx, item.sy], this.host.reducedMotion ? 1 : pulseScale(item.a, now));
        this.setOpacity(chip, attackOpacity(item.a, now));
      }
    }
    for (let i = used; i < this.attackers.length; i++) this.hide(this.attackers[i]);
  }

  // Contenido: cambia al aparecer, al cambiar de atacante o de cifra de la distancia
  private show(chip: Chip, kind: ChipKind, id: string, relation: Relation, icons: readonly IconName[], more: number, dist: number, label: string, size: ChipSize): void {
    if (kind !== chip.kind) {
      chip.kind = kind;
      chip.root.dataset.chip = kind;
    }
    if (id !== chip.id) {
      chip.id = id;
      chip.root.dataset.shipId = id;
    }
    if (relation !== chip.relation) {
      chip.relation = relation;
      chip.root.dataset.relation = relation;
      chip.root.style.setProperty('--chip-color', RELATIONS[relation].text);
    }
    if (size !== chip.size) {
      chip.size = size;
      chip.root.dataset.size = size;
      chip.deg = NaN; // el triángulo va a otra distancia del centro
    }
    const iconKey = icons.join('+');
    if (iconKey !== chip.iconKey) {
      chip.iconKey = iconKey;
      chip.icon.innerHTML = iconsHtml(icons);
      chip.icon.dataset.icons = String(icons.length);
    }
    if (more !== chip.moreN) {
      chip.moreN = more;
      chip.more.textContent = more > 0 ? `+${more}` : '';
      chip.more.classList.toggle('is-visible', more > 0);
    }
    if (!chip.display) {
      chip.display = true;
      chip.root.style.display = 'block';
    }
    const text = `${Math.round(dist)} m`;
    if (text !== chip.distText) {
      chip.distText = text;
      chip.dist.textContent = text;
    }
    const full = `${label} (${text})`;
    if (full !== chip.label) {
      chip.label = full;
      chip.root.setAttribute('aria-label', full);
    }
  }

  // Posición (por frame): la caja de placeChip es la raíz; la forma va en su centro y la distancia debajo o encima
  private put(chip: Chip, vw: number, vh: number, frame: Frame, origin: Pt, target: Pt, scale: number): void {
    const kind = chip.kind!;
    const size = chip.size!;
    const p = placeChip(vw, vh, frame, this.blocks, origin, target, kind, size, this.pillWidth(chip), { avoid: this.placed });
    this.placed.push([p.x, p.y]);
    const [x0, y0, x1, y1] = p.box;
    const w = x1 - x0;
    const h = y1 - y0;
    chip.travel = p.travel;
    if (w !== chip.w || h !== chip.h || p.side !== chip.side) {
      chip.w = w;
      chip.h = h;
      chip.cy = p.y - y0;
      chip.side = p.side;
      chip.root.style.width = `${w}px`;
      chip.root.style.height = `${h}px`;
      // centro de la forma dentro de la caja: L desde la izquierda y la media forma (más la pastilla si va encima) desde arriba
      chip.root.style.setProperty('--cx', `${w / 2}px`);
      chip.root.style.setProperty('--cy', `${chip.cy}px`);
      chip.root.style.setProperty('--half', `${halfShape(kind, size)}px`);
      chip.root.dataset.side = p.side;
    }
    if (x0 !== chip.x || y0 !== chip.y) {
      chip.x = x0;
      chip.y = y0;
      chip.root.style.transform = `translate3d(${x0}px, ${y0}px, 0)`;
    }
    // El triángulo, desde la posición final del chip (≤ 10°): a 2 px del borde de la forma en esa dirección
    const deg = Math.round(((p.ang * 180) / Math.PI) * 2) / 2;
    if (deg !== chip.deg) {
      chip.deg = deg;
      const tipAt = shapeEdge(kind, size, p.ang) + 2;
      chip.tri.style.transform = `rotate(${deg}deg) translateX(${tipAt.toFixed(2)}px)`;
    }
    if (scale !== chip.scale) {
      chip.scale = scale;
      chip.shape.style.transform = scale === 1 ? '' : `scale(${scale.toFixed(3)})`;
    }
  }

  // Ancho de la pastilla («162 m», 12/600 tabular, 5 px de relleno): con cifras tabulares solo depende del número de
  // caracteres, así que se mide una vez por longitud
  private pillWidth(chip: Chip): number {
    const n = chip.distText.length;
    let w = this.labelW.get(n);
    if (w === undefined) {
      w = chip.dist.getBoundingClientRect().width;
      if (w > 0) this.labelW.set(n, w);
    }
    return w;
  }

  private setOpacity(chip: Chip, opacity: number): void {
    const o = Math.round(opacity * 100) / 100;
    if (o === chip.opacity) return;
    chip.opacity = o;
    chip.root.style.opacity = o === 1 ? '' : String(o);
  }

  // El propio se va en 150 ms en su última posición, cuando el barco vuelve al marco útil o se sale de la vista libre
  private fadeSelf(now: number): void {
    const chip = this.self;
    if (!chip.display) return;
    if (chip.hideAt === -Infinity) chip.hideAt = now;
    const k = (now - chip.hideAt) / CHIP_TIMING.selfFadeMs;
    if (k >= 1) this.hide(chip);
    else this.setOpacity(chip, 1 - k);
  }

  private hide(chip: Chip): void {
    chip.hideAt = -Infinity;
    if (!chip.display) return;
    chip.display = false;
    chip.root.style.display = 'none';
    this.setOpacity(chip, 1);
    if (chip.kind === 'attacker') {
      chip.id = '';
      delete chip.root.dataset.shipId;
    }
  }

  // Cajas visibles (depuración/QA de AD-30 y AD-31): la caja (forma y distancia), el centro de la forma, hacia dónde
  // apunta el triángulo (grados de pantalla, y hacia abajo), el deslizamiento y la opacidad
  visibleRects(): ChipRect[] {
    const out: ChipRect[] = [];
    for (const chip of [this.self, ...this.attackers]) {
      if (!chip.display || !chip.kind) continue;
      const r = chip.root.getBoundingClientRect();
      out.push({
        kind: chip.kind, id: chip.id, x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + chip.cy, side: chip.side,
        deg: chip.deg, travel: chip.travel, opacity: chip.opacity, more: chip.moreN
      });
    }
    return out;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener(HUD_BLOCKS_EVENT, this.onResize);
    this.container.ownerDocument.fonts?.removeEventListener('loadingdone', this.onFonts);
    for (const chip of [this.self, ...this.attackers]) chip.root.remove();
  }
}

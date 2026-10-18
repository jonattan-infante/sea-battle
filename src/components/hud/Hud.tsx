'use client';
// HUD (ART-DIRECTION §12). React solo pinta cuando cambian los datos del store; lo que avanza con el reloj
// (recarga, protección, cuenta atrás) se actualiza por ref desde un único requestAnimationFrame.
import React, { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { REPAIR_RATE, REPAIR_RATE_UNDER_FIRE } from '../../game/constants';
import { rankLabel, rankOf } from '../../game/xp';
import type { GameClient } from '../../client/game-client';
import { HINTS } from '../../client/hints';
import {
  addTicker,
  DANGER_TEXT,
  hudSignals,
  isLowHp,
  levelText,
  portBlock,
  rangeText,
  targetTypeLine,
  xpFill,
  XpProgress,
  xpNumbers,
  xpProgress
} from '../../client/hud-logic';
import { MeHud, Relation, TargetHud, useHud } from '../../client/hud-store';
import { HUD_BLOCKS_EVENT } from '../../client/overlays';
import { RankBadge } from './badges';
import FeedText from './FeedText';
import { Alert, Close, CloudOff, Coins, Crosshair, Recenter, Sailboat, Shield, Stop, Store, Swords, Target, Wrench } from './icons';
import Minimap, { ViewRect } from './Minimap';
import RelationIcon from './RelationIcon';
import Shop from './Shop';
import { DeathOverlay } from './Overlays';

export interface HudActions {
  toggleAttack: () => void;
  cycleTarget: (backwards?: boolean) => void;
  toggleRepair: () => void;
  stop: () => void;
  togglePort: () => void;
  deselect: () => void;
  respawn: () => void;
  buy: (itemId: string) => void;
  selectShip: (classId: 'sloop' | 'brig' | 'frigate') => void;
  retry: () => void;
  retryLoad: () => Promise<boolean>; // AC-131: true si entra al mundo con su progreso; un solo intento a la vez
  exit: () => Promise<boolean>; // false si el servidor no responde en 2 s (AC-126): no se sale de la partida
}

const RELATION_COLOR: Record<Relation, string> = {
  self: 'var(--rel-self)',
  player: 'var(--rel-player)',
  pirate: 'var(--rel-pirate)',
  merchant: 'var(--rel-merchant)'
};

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
const fmt = (n: number) => n.toLocaleString('es-ES');
const fmtRate = (r: number) => `${(r * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %/s`;

// Disposición del HUD: los mismos cortes que globals.css (§12.1–12.3). Decide los tamaños de las insignias (24 o 18 px en
// el panel, 16 o 12 en el objetivo) y dónde va el nivel. Solo cambia al girar o redimensionar la ventana
type HudLayout = 'desktop' | 'portrait' | 'landscape';
const PORTRAIT = '(max-width: 699.98px)';
const LANDSCAPE = '(max-height: 499.98px) and (min-width: 700px)';

function readLayout(): HudLayout {
  if (window.matchMedia(PORTRAIT).matches) return 'portrait';
  return window.matchMedia(LANDSCAPE).matches ? 'landscape' : 'desktop';
}

function subscribeLayout(onChange: () => void): () => void {
  const lists = [PORTRAIT, LANDSCAPE].map((q) => window.matchMedia(q));
  lists.forEach((l) => l.addEventListener('change', onChange));
  return () => lists.forEach((l) => l.removeEventListener('change', onChange));
}

function useHudLayout(): HudLayout {
  return useSyncExternalStore(subscribeLayout, readLayout, () => 'desktop');
}

// ---------- Panel del jugador ----------

// Barra de XP (§12.9): 200 × 4 bajo la vida en escritorio y franja en el borde inferior del bloque en móvil. Los números
// («1240 / 2000 XP») no caben en el panel: van en el title y en el nombre accesible de la barra (D76). Al ganar XP el
// relleno avanza en 400 ms (CSS) y brilla 300 ms (Web Animations, en el commit del cambio). Con una subida de nivel el
// relleno se monta de nuevo (key): la barra del nivel nuevo empieza ahí y no retrocede animada desde el nivel anterior
function XpBar({ progress, xp }: { progress: XpProgress; xp: number }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const lastXp = useRef(xp);
  useEffect(() => {
    const gained = xp > lastXp.current;
    lastXp.current = xp;
    if (!gained || typeof fillRef.current?.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    fillRef.current.animate([{ filter: 'brightness(1.4)' }, { filter: 'brightness(1)' }], { duration: 300, easing: 'ease-out' });
  }, [xp]);
  return (
    <div
      className="hud-xp"
      data-testid="player-xp"
      data-level={progress.level}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.span ?? 1}
      aria-valuenow={progress.span === null ? 1 : progress.into}
      aria-label={xpNumbers(progress)}
      title={xpNumbers(progress)}
    >
      <div key={progress.level} ref={fillRef} className="hud-xp__fill" style={{ width: `${(xpFill(progress) * 100).toFixed(2)}%` }} />
    </div>
  );
}

function PlayerPanel({ client }: { client: GameClient }) {
  const me = useHud((s) => s.me);
  const xp = useHud((s) => s.player?.xp ?? 0);
  const layout = useHudLayout();
  const shieldRef = useRef<HTMLSpanElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  const reloadRef = useRef<HTMLSpanElement>(null);

  // Protección y recarga cambian cada segundo: por ref, sin commits de React
  useEffect(() => {
    if (!me) return;
    // null fuerza la primera escritura: el DOM puede venir de un ticker anterior
    let lastShield: string | null = null;
    let lastReload: string | null = null;
    return addTicker((now) => {
      const remaining = me.protectedUntil - client.serverTime(now);
      const shield = me.action === 'idle' && me.state === 'alive' && remaining > 0 ? `Protegido ${Math.ceil(remaining)} s` : '';
      if (shield !== lastShield && shieldRef.current && baseRef.current) {
        lastShield = shield;
        shieldRef.current.textContent = shield;
        shieldRef.current.style.display = shield ? '' : 'none';
        baseRef.current.style.display = shield ? 'none' : '';
      }
      if (me.action === 'firing' && reloadRef.current) {
        const left = Math.max(0, hudSignals.reloadMs - (now - hudSignals.lastVolleyAt)) / 1000;
        const text = left.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        if (text !== lastReload) {
          lastReload = text;
          reloadRef.current.textContent = text;
        }
      }
    });
  }, [me, client]);

  if (!me) return null;
  const low = isLowHp(me);
  let base: React.ReactNode = 'Listo';
  let tone = '';
  if (me.state !== 'alive') base = 'Hundido';
  else if (me.action === 'repairing') {
    tone = me.underFire ? 'is-repair is-slow' : 'is-repair';
    base = <><Wrench size={12} /> Reparando +{fmtRate(me.underFire ? REPAIR_RATE_UNDER_FIRE : REPAIR_RATE)}</>;
  } else if (low) {
    tone = 'is-low';
    base = <><Alert size={12} /> Vida baja</>;
  } else if (me.action === 'firing') {
    tone = 'is-firing';
    base = <><Swords size={12} /> Atacando · <span ref={reloadRef}>0,0</span> s</>;
  } else if (me.action === 'armed') base = <><Swords size={12} /> Fuera de alcance</>;

  // Nivel, insignia y XP (1.1; GDD §14, ART-DIRECTION §12.9, D76). «Nivel 12» («Nivel máximo» en el 20): en escritorio a
  // la derecha de la línea de estado, con la fila del nombre como en la 1.0; en 390×844 junto a la vida, y en 844×390 en
  // la fila del nombre
  const progress = xpProgress(xp);
  const desktop = layout === 'desktop';
  const level = <span className="hud-player__level" data-testid="player-level">{levelText(progress)}</span>;
  const xpBar = <XpBar progress={progress} xp={xp} />;
  return (
    <section className={`panel hud-player ${low ? 'is-low' : ''}`} data-testid="player-frame" data-hud-block="">
      <div className="hud-class-icon">
        <Sailboat size={30} />
        <span className="hud-player__badge" data-testid="player-badge" data-rank={progress.rank} aria-label={rankLabel(progress.rank)} role="img">
          <RankBadge rank={progress.rank} size={desktop ? 24 : 18} />
        </span>
      </div>
      <div className="hud-player__body">
        <div className="hud-player__name">
          <strong data-testid="player-name">{me.name}</strong>
          {desktop && <span className="hud-player__class" data-testid="player-class">{me.classLabel}</span>}
          {layout === 'landscape' && level}
        </div>
        <div className="hud-player__hp">
          <div className="bar" data-testid="player-hp">
            <div className="bar__fill" style={{ width: pct(me.hp, me.maxHp), background: 'var(--ui-ok)' }} />
            <span className="bar__text" data-testid="player-hp-text">{fmt(me.hp)}/{fmt(me.maxHp)}</span>
          </div>
          {layout === 'portrait' && level}
        </div>
        {desktop && xpBar}
        <div className="hud-player__foot">
          <div className={`hud-status ${tone}`} data-testid="action-state" data-state={me.action}>
            <span ref={baseRef}>{base}</span>
            <span ref={shieldRef} className="hud-status is-shield" style={{ display: 'none' }} data-testid="protection" />
          </div>
          {desktop && level}
        </div>
      </div>
      {!desktop && <div className="hud-xp-strip">{xpBar}</div>}
    </section>
  );
}

// ---------- Panel del objetivo ----------

// "Tipo · actitud" (§12.1)
function attitudeOf(target: TargetHud): string {
  if (target.relation === 'pirate') return 'hostil';
  if (target.relation === 'merchant') return 'pasivo';
  if (target.relation === 'self') return 'tu barco';
  return target.attackable ? 'jugador · PvP' : 'jugador · no atacable';
}

function TargetPanel({ actions }: { actions: HudActions }) {
  const target = useHud((s) => s.target);
  const layout = useHudLayout();
  if (!target) return null;
  const color = RELATION_COLOR[target.relation];
  // Otro jugador (1.1, AC-153; GDD §14, «Panel de objetivo»): su insignia delante de «Balandra · Nivel 13 · Teniente».
  // En móvil esa línea va la última, bajo la distancia, y el panel crece a 70 de alto (CSS, D75)
  const player = target.relation === 'player' && target.level !== null;
  // NPC demasiado fuerte (AC-189, §12.10): la marca sustituye a «<clase> · hostil» y, en móvil, ocupa esa misma última línea
  const danger = !player && target.danger;
  const range = rangeText(target);
  return (
    <section
      className={`panel hud-target ${player ? 'is-player' : ''} ${danger ? 'is-danger' : ''}`}
      data-testid="target-frame"
      data-target-id={target.id}
      data-hud-block=""
    >
      <div className="hud-target__icon" style={{ color }}><RelationIcon relation={target.relation} classId={target.classId} /></div>
      <div className="hud-target__body">
        <div className="hud-target__name" style={{ color }} data-testid="target-name">{target.name}</div>
        {player ? (
          <div className="hud-target__meta is-player" data-testid="target-type">
            <RankBadge rank={rankOf(target.level!)} size={layout === 'desktop' ? 16 : 12} />
            <span>{targetTypeLine(target.classId, target.level!)}</span>
          </div>
        ) : danger ? (
          <div className="hud-target__meta is-danger" data-testid="target-type">
            <Alert size={12} />
            <span>{DANGER_TEXT}</span>
          </div>
        ) : (
          <div className="hud-target__meta" data-testid="target-type">{target.classLabel} · {attitudeOf(target)}</div>
        )}
        <div className="bar bar--sm" data-testid="target-hp">
          <div className="bar__fill" style={{ width: pct(target.hp, target.maxHp), background: color }} />
        </div>
        <div className="hud-target__row">
          {target.state === 'alive' ? (
            <>
              <span data-testid="target-distance">{target.distance} m</span>
              {target.relation !== 'self' && (
                <span className={range === '✓ En alcance' ? 'in-range' : 'out-range'} data-testid="target-range">
                  · {range}
                </span>
              )}
            </>
          ) : (
            <span className="out-range">Hundido</span>
          )}
        </div>
      </div>
      <button type="button" className="hud-target__close" onClick={actions.deselect} aria-label="Deseleccionar (Esc)" title="Deseleccionar (Esc)">
        <Close size={16} />
      </button>
    </section>
  );
}

// ---------- Oro ----------

function GoldPanel() {
  const gold = useHud((s) => s.player?.gold ?? 0);
  const gain = useHud((s) => s.goldGain);
  return (
    <section className="panel hud-gold" data-testid="player-gold-panel" data-hud-block="">
      <span className="hud-gold__coin"><Coins size={20} /></span>
      <strong data-testid="player-gold">{fmt(gold)}</strong>
      {gain && <span key={gain.id} className="hud-gold__gain">+{fmt(gain.amount)}</span>}
    </section>
  );
}

// ---------- Toasts, aviso de zona y feed ----------

// Cada aviso visible es un bloque del HUD para las placas (ART-DIRECTION §11.4, D41). Entran y salen de golpe: en el mismo
// commit, antes de pintar, la capa de placas relee las cajas y oculta las que quedan debajo. El aviso de guardado
// (AC-132, D50) va el primero, por encima de «Zona segura», y como ella no caduca ni cuenta en el cupo de toasts
function Toasts() {
  const toasts = useHud((s) => s.toasts);
  const inSafe = useHud((s) => s.me?.inSafeZone && s.me.state === 'alive');
  const unsaved = useHud((s) => s.saveWarning);
  const feed = useHud((s) => s.feed);
  const blocksKey = `${toasts.map((t) => t.id).join()}|${feed.map((f) => f.id).join()}|${!!inSafe}|${unsaved}`;
  useLayoutEffect(() => {
    window.dispatchEvent(new Event(HUD_BLOCKS_EVENT));
  }, [blocksKey]);
  return (
    <div className="hud-toasts" role="status" aria-live="polite" data-testid="toasts">
      {unsaved && <div className="toast toast--warn toast--unsaved" data-testid="save-warning" data-hud-block=""><CloudOff size={16} /> Progreso sin guardar, reintentando…</div>}
      {inSafe && <div className="toast toast--zone" data-testid="safe-zone" data-hud-block=""><Shield size={16} /> Zona segura</div>}
      {/* El aviso de subida de nivel (AC-151) lleva la insignia de 24 px en lugar del icono (§12.9) */}
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} data-hud-block="">
          {t.rank && <RankBadge rank={t.rank} size={24} />}
          {t.text}
        </div>
      ))}
      {/* En móvil el feed no tiene caja propia: sus líneas van como toasts (§12.2). En escritorio miden 0 × 0 y no cuentan */}
      {feed.map((f) => (
        <div key={`f${f.id}`} className={`toast feed-as-toast toast--${f.tone === 'danger' ? 'danger' : f.tone === 'gold' ? 'warn' : 'ok'}`} data-hud-block="">
          <FeedText line={f} />
        </div>
      ))}
    </div>
  );
}

function Feed() {
  const feed = useHud((s) => s.feed);
  return (
    <div className="hud-feed" data-testid="feed" aria-live="polite">
      {feed.map((f) => (
        <div key={f.id} className={`feed-line feed-line--${f.tone}`} data-hud-block="">
          <FeedText line={f} />
        </div>
      ))}
    </div>
  );
}

// ---------- Acciones ----------

interface ActionModel {
  attackEnabled: boolean;
  attacking: boolean;
  armed: boolean;
  repairing: boolean;
  repairEnabled: boolean;
  low: boolean;
  alive: boolean;
  portEnabled: boolean;
  portTitle: string;
}

function useActionModel(): ActionModel | null {
  const me = useHud((s) => s.me);
  const target = useHud((s) => s.target);
  const unsaved = useHud((s) => s.saveWarning);
  if (!me) return null;
  const alive = me.state === 'alive';
  const attacking = me.action === 'firing' || me.action === 'armed';
  const port = portBlock(me, unsaved);
  return {
    alive,
    attacking,
    armed: me.action === 'armed',
    attackEnabled: alive && (attacking || !!target?.attackable),
    repairing: me.action === 'repairing',
    repairEnabled: alive && (me.action === 'repairing' || me.hp < me.maxHp),
    low: isLowHp(me),
    portEnabled: !port,
    portTitle: port?.title ?? 'Puerto (P)'
  };
}

// Capa de recarga (conic-gradient) y destello de 150 ms en cada andanada, por ref
function useReloadLayer(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) {
      if (ref.current) ref.current.style.background = '';
      return;
    }
    let last = -1;
    return addTicker((now) => {
      const el = ref.current;
      if (!el) return;
      const p = Math.min(1, (now - hudSignals.lastVolleyAt) / hudSignals.reloadMs);
      const deg = Math.round((1 - p) * 360);
      if (deg !== last) {
        last = deg;
        el.style.background = deg > 0 ? `conic-gradient(rgba(6, 17, 26, 0.85) ${deg}deg, transparent 0)` : '';
      }
      el.parentElement?.classList.toggle('is-flash', now - hudSignals.lastVolleyAt < 150);
    });
  }, [ref, active]);
}

function ActionBar({ actions }: { actions: HudActions }) {
  const m = useActionModel();
  const reloadRef = useRef<HTMLSpanElement>(null);
  useReloadLayer(reloadRef, !!m?.attacking);
  if (!m) return null;
  return (
    <nav className="panel hud-actions" aria-label="Acciones" data-testid="action-bar" data-hud-block="">
      <button
        type="button"
        className={`slot ${m.attacking && !m.armed ? 'is-active' : ''} ${m.armed ? 'is-armed' : ''}`}
        disabled={!m.attackEnabled}
        onClick={actions.toggleAttack}
        title={m.attackEnabled ? 'Atacar / cancelar (Espacio)' : 'Selecciona un objetivo atacable'}
        data-testid="btn-attack"
      >
        <span className="slot__reload" ref={reloadRef} />
        <span className="slot__key">Esp</span>
        <span className="slot__icon"><Crosshair size={28} /></span>
        <span className="slot__label">Atacar</span>
      </button>
      <button
        type="button"
        className={`slot ${m.repairing ? 'is-active' : ''} ${m.low && !m.repairing ? 'is-pulse' : ''}`}
        disabled={!m.repairEnabled}
        onClick={actions.toggleRepair}
        title={m.repairEnabled ? 'Reparar (R)' : 'El casco ya está intacto'}
        data-testid="btn-repair"
      >
        <span className="slot__key">R</span>
        <span className="slot__icon">{m.low && !m.repairing ? <Alert size={28} /> : <Wrench size={28} />}</span>
        <span className="slot__label">Reparar</span>
      </button>
      <button type="button" className="slot" disabled={!m.alive} onClick={() => actions.cycleTarget(false)} title="Siguiente objetivo (Tab)" data-testid="btn-target">
        <span className="slot__key">Tab</span>
        <span className="slot__icon"><Target size={28} /></span>
        <span className="slot__label">Objetivo</span>
      </button>
      <button type="button" className="slot" disabled={!m.alive} onClick={actions.stop} title="Detener (S)" data-testid="btn-stop">
        <span className="slot__key">S</span>
        <span className="slot__icon"><Stop size={28} /></span>
        <span className="slot__label">Detener</span>
      </button>
      {/* DT-02 (AC-66): fuera de la zona, o con la BD caída (AC-132), se ve desactivado con aria-disabled y no con
          disabled, para que el clic o el toque lleguen a togglePort y muestren el aviso con el motivo */}
      <button
        type="button"
        className="slot"
        aria-disabled={!m.portEnabled}
        onClick={actions.togglePort}
        title={m.portTitle}
        data-testid="btn-port"
      >
        <span className="slot__key">P</span>
        <span className="slot__icon"><Store size={28} /></span>
        <span className="slot__label">Puerto</span>
      </button>
    </nav>
  );
}

function MobileButtons({ actions }: { actions: HudActions }) {
  const m = useActionModel();
  const reloadRef = useRef<HTMLSpanElement>(null);
  useReloadLayer(reloadRef, !!m?.attacking);
  if (!m) return null;
  return (
    <>
      <button type="button" className={`hud-mobile-btn hud-mobile-btn--attack ${m.attacking ? 'is-active' : ''}`} disabled={!m.attackEnabled} onClick={actions.toggleAttack} data-testid="m-attack" data-hud-block="" aria-label="Atacar">
        <span className="slot__reload" ref={reloadRef} />
        <Crosshair size={28} />
        Atacar
      </button>
      <button type="button" className="hud-mobile-btn hud-mobile-btn--target" disabled={!m.alive} onClick={() => actions.cycleTarget(false)} data-testid="m-target" data-hud-block="" aria-label="Objetivo">
        <Target size={22} />
        Objetivo
      </button>
      <button type="button" className={`hud-mobile-btn hud-mobile-btn--repair ${m.repairing ? 'is-active' : ''} ${m.low && !m.repairing ? 'is-pulse' : ''}`} disabled={!m.repairEnabled} onClick={actions.toggleRepair} data-testid="m-repair" data-hud-block="" aria-label="Reparar">
        <Wrench size={22} />
        Reparar
      </button>
      <button type="button" className="hud-mobile-btn hud-mobile-btn--port" aria-disabled={!m.portEnabled} onClick={actions.togglePort} data-testid="m-port" data-hud-block="" aria-label="Puerto" title={m.portEnabled ? 'Puerto' : m.portTitle}>
        <Store size={22} />
        Puerto
      </button>
    </>
  );
}

// ---------- Vista libre (E13, ART-DIRECTION §12.8, D89) ----------

// Centrar: solo existe en vista libre (AC-119) y entra con un fundido de 150 ms. Vuelve la cámara al barco, como C. Es un
// bloque del HUD: las placas y los indicadores de borde lo esquivan, y la pista también (AC-110). En escritorio va bajo el
// minimapa con la tecla; en táctil es un botón de 52 × 52 con la palabra debajo, como Reparar (globals.css)
function RecenterButton({ onRecenter }: { onRecenter?: () => void }) {
  const free = useHud((s) => s.freeView) && !!onRecenter;
  useLayoutEffect(() => {
    window.dispatchEvent(new Event(HUD_BLOCKS_EVENT));
  }, [free]);
  if (!free) return null;
  return (
    <button type="button" className="panel hud-recenter" onClick={onRecenter} data-testid="recenter" data-hud-block="" aria-label="Centrar" title="Centrar (C)">
      <Recenter size={22} />
      <span className="hud-recenter__label">Centrar</span>
      <kbd className="hud-recenter__key">C</kbd>
    </button>
  );
}

// ---------- Pistas de primera sesión (AC-79; textos en src/client/hints.ts) ----------

// AC-105: la pista no tapa la placa propia, la del objetivo ni los toasts, y desde la vista libre (AC-110), tampoco el
// botón Centrar ni los indicadores de borde. Tiene dos ranuras, bajo el barco y sobre él (CSS `.is-alt`), y cambia de
// ranura cuando se cruza con uno de esos elementos; si las dos se cruzan, se oculta (`.is-hidden`) mientras dure el cruce.
// Las placas y los indicadores se mueven con la cámara: se revisa por ref a ≤ 10 Hz y solo mientras hay pista. Los
// toasts y Centrar entran de golpe: además se recoloca en el mismo commit en el que aparecen (O-1, QA-4).
const overlaps = (a: DOMRect, b: DOMRect) => a.width > 0 && b.width > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function hintObstacles(): HTMLElement[] {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-plate][data-relation="self"], [data-testid="toasts"] > .toast, [data-testid="recenter"], [data-edge-chip]'));
  const selected = useHud.getState().selectedId;
  if (selected) els.push(...Array.from(document.querySelectorAll<HTMLElement>(`[data-plate][data-ship-id="${CSS.escape(selected)}"]`)));
  return els;
}

function placeHint(el: HTMLElement) {
  const obstacles = hintObstacles().map((o) => o.getBoundingClientRect());
  const covers = () => obstacles.some((o) => overlaps(el.getBoundingClientRect(), o));
  let hidden = false;
  if (covers()) {
    el.classList.toggle('is-alt');
    if (covers()) {
      el.classList.toggle('is-alt');
      hidden = true;
    }
  }
  el.classList.toggle('is-hidden', hidden);
}

function Hint() {
  const hint = useHud((s) => s.hint);
  // Cambia solo cuando entra o sale un toast (o una línea del feed, que en móvil es un toast) o Centrar: pocas veces por minuto
  const toastKey = useHud((s) => `${s.toasts.map((t) => t.id).join()}|${s.feed.map((f) => f.id).join()}|${s.me?.inSafeZone && s.me.state === 'alive'}|${s.saveWarning}|${s.freeView}`);
  const ref = useRef<HTMLDivElement>(null);
  const visible = hint !== null && hint < HINTS.length;

  useEffect(() => {
    if (!visible) return;
    let last = 0;
    return addTicker((now) => {
      if (now - last < 100) return;
      last = now;
      if (ref.current) placeHint(ref.current);
    });
  }, [visible]);

  // El toast nuevo ya está en el DOM (mismo commit) y aún no se ha pintado: la pista no lo pisa ni un frame
  useLayoutEffect(() => {
    if (visible && ref.current) placeHint(ref.current);
  }, [visible, toastKey]);

  if (!visible) return null;
  return (
    <div ref={ref} className="panel hud-hint" data-testid="hint" data-hint={hint}>
      <Compass16 /> <span className="hint-mouse">{HINTS[hint].mouse}</span>
      <span className="hint-touch">{HINTS[hint].touch}</span>
    </div>
  );
}

function Compass16() {
  return <Target size={16} />;
}

// ---------- Raíz ----------

export default function Hud({
  client,
  actions,
  islands,
  viewRect,
  onMinimapView,
  onRecenter
}: {
  client: GameClient;
  actions: HudActions;
  islands: { x: number; z: number; radius: number }[];
  viewRect?: () => ViewRect | null;
  onMinimapView?: (x: number, z: number) => void; // vista libre (E13): el minimapa centra la vista
  onRecenter?: () => void; // vista libre (E13): Centrar vuelve al seguimiento
}) {
  const dead = useHud((s) => s.me?.state !== undefined && s.me.state !== 'alive');
  const shopOpen = useHud((s) => s.shopOpen);
  return (
    <>
      <div className={`hud ${dead ? 'is-dead' : ''}`} data-testid="hud">
        <PlayerPanel client={client} />
        <TargetPanel actions={actions} />
        <GoldPanel />
        <Minimap client={client} islands={islands} viewRect={viewRect} onView={onMinimapView} />
        <Toasts />
        <Feed />
        <ActionBar actions={actions} />
        <MobileButtons actions={actions} />
        <RecenterButton onRecenter={onRecenter} />
        <Hint />
      </div>
      {shopOpen && <Shop actions={actions} />}
      <DeathOverlay client={client} actions={actions} />
    </>
  );
}

export type { MeHud, TargetHud };

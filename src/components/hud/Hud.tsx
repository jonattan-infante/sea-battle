'use client';
// HUD (ART-DIRECTION §12). React solo pinta cuando cambian los datos del store; lo que avanza con el reloj
// (recarga, protección, cuenta atrás) se actualiza por ref desde un único requestAnimationFrame.
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { REPAIR_RATE, REPAIR_RATE_UNDER_FIRE } from '../../game/constants';
import type { GameClient } from '../../client/game-client';
import { HINTS } from '../../client/hints';
import { addTicker, hudSignals, isLowHp } from '../../client/hud-logic';
import { MeHud, Relation, TargetHud, useHud } from '../../client/hud-store';
import { Alert, Anchor, Close, Coins, Crosshair, Sailboat, Shield, Skull, Star, Stop, Store, Swords, Target, Wrench } from './icons';
import Minimap, { ViewRect } from './Minimap';
import Shop from './Shop';
import { ConnectionOverlay, DeathOverlay } from './Overlays';

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

function RelationIcon({ relation, size = 22 }: { relation: Relation; size?: number }) {
  if (relation === 'pirate') return <Skull size={size} />;
  if (relation === 'merchant') return <Coins size={size} />;
  if (relation === 'self') return <Star size={size} />;
  return <Anchor size={size} />;
}

// ---------- Panel del jugador ----------

function PlayerPanel({ client }: { client: GameClient }) {
  const me = useHud((s) => s.me);
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

  return (
    <section className={`panel hud-player ${low ? 'is-low' : ''}`} data-testid="player-frame" data-hud-block="">
      <div className="hud-class-icon"><Sailboat size={30} /></div>
      <div className="hud-player__body">
        <div className="hud-player__name">
          <strong data-testid="player-name">{me.name}</strong>
          <span>{me.classLabel}</span>
        </div>
        <div className="bar" data-testid="player-hp">
          <div className="bar__fill" style={{ width: pct(me.hp, me.maxHp), background: 'var(--ui-ok)' }} />
          <span className="bar__text" data-testid="player-hp-text">{fmt(me.hp)}/{fmt(me.maxHp)}</span>
        </div>
        <div className={`hud-status ${tone}`} data-testid="action-state" data-state={me.action}>
          <span ref={baseRef}>{base}</span>
          <span ref={shieldRef} className="hud-status is-shield" style={{ display: 'none' }} data-testid="protection" />
        </div>
      </div>
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
  if (!target) return null;
  const color = RELATION_COLOR[target.relation];
  return (
    <section className="panel hud-target" data-testid="target-frame" data-target-id={target.id} data-hud-block="">
      <div className="hud-target__icon" style={{ color }}><RelationIcon relation={target.relation} /></div>
      <div className="hud-target__body">
        <div className="hud-target__name" style={{ color }} data-testid="target-name">{target.name}</div>
        <div className="hud-target__meta">{target.classLabel} · {attitudeOf(target)}</div>
        <div className="bar bar--sm" data-testid="target-hp">
          <div className="bar__fill" style={{ width: pct(target.hp, target.maxHp), background: color }} />
        </div>
        <div className="hud-target__row">
          {target.state === 'alive' ? (
            <>
              <span data-testid="target-distance">{target.distance} m</span>
              {target.relation !== 'self' && (
                <span className={target.inRange ? 'in-range' : 'out-range'} data-testid="target-range">
                  · {target.inRange ? '✓ En alcance' : '✕ Fuera de alcance'}
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

function Toasts() {
  const toasts = useHud((s) => s.toasts);
  const inSafe = useHud((s) => s.me?.inSafeZone && s.me.state === 'alive');
  const feed = useHud((s) => s.feed);
  return (
    <div className="hud-toasts" role="status" aria-live="polite" data-testid="toasts">
      {inSafe && <div className="toast toast--zone" data-testid="safe-zone"><Shield size={16} /> Zona segura</div>}
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>{t.text}</div>
      ))}
      {/* En móvil el feed no tiene caja propia: sus líneas van como toasts (§12.2) */}
      {feed.map((f) => (
        <div key={`f${f.id}`} className={`toast feed-as-toast toast--${f.tone === 'danger' ? 'danger' : f.tone === 'gold' ? 'warn' : 'ok'}`}>{f.text}</div>
      ))}
    </div>
  );
}

function Feed() {
  const feed = useHud((s) => s.feed);
  return (
    <div className="hud-feed" data-testid="feed" aria-live="polite">
      {feed.map((f) => (
        <div key={f.id} className={`feed-line feed-line--${f.tone}`} data-hud-block="">{f.text}</div>
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
}

function useActionModel(): ActionModel | null {
  const me = useHud((s) => s.me);
  const target = useHud((s) => s.target);
  if (!me) return null;
  const alive = me.state === 'alive';
  const attacking = me.action === 'firing' || me.action === 'armed';
  return {
    alive,
    attacking,
    armed: me.action === 'armed',
    attackEnabled: alive && (attacking || !!target?.attackable),
    repairing: me.action === 'repairing',
    repairEnabled: alive && (me.action === 'repairing' || me.hp < me.maxHp),
    low: isLowHp(me),
    portEnabled: alive && me.inSafeZone
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
      {/* DT-02 (AC-66): fuera de la zona se ve desactivado con aria-disabled y no con disabled, para que el clic
          o el toque lleguen a togglePort y muestren el aviso "El puerto solo abre en la zona segura" */}
      <button
        type="button"
        className="slot"
        aria-disabled={!m.portEnabled}
        onClick={actions.togglePort}
        title={m.portEnabled ? 'Puerto (P)' : 'Solo en la zona segura'}
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
      <button type="button" className="hud-mobile-btn hud-mobile-btn--port" aria-disabled={!m.portEnabled} onClick={actions.togglePort} data-testid="m-port" data-hud-block="" aria-label="Puerto" title={m.portEnabled ? 'Puerto' : 'Solo en la zona segura'}>
        <Store size={22} />
        Puerto
      </button>
    </>
  );
}

// ---------- Pistas de primera sesión (AC-79; textos en src/client/hints.ts) ----------

// AC-105: la pista no tapa la placa propia, la del objetivo ni los toasts. Tiene dos ranuras, bajo el barco y sobre él
// (CSS `.is-alt`), y cambia de ranura cuando se cruza con uno de esos elementos; si las dos se cruzan, se oculta
// (`.is-hidden`) mientras dure el cruce. Las placas se mueven con el barco: se revisa por ref a ≤ 10 Hz y solo mientras
// hay pista. Los toasts entran de golpe: además se recoloca en el mismo commit en el que aparecen (O-1, QA-4).
const overlaps = (a: DOMRect, b: DOMRect) => a.width > 0 && b.width > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function hintObstacles(): HTMLElement[] {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-plate][data-relation="self"], [data-testid="toasts"] > .toast'));
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
  // Cambia solo cuando entra o sale un toast (o una línea del feed, que en móvil es un toast): pocas veces por minuto
  const toastKey = useHud((s) => `${s.toasts.map((t) => t.id).join()}|${s.feed.map((f) => f.id).join()}|${s.me?.inSafeZone && s.me.state === 'alive'}`);
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

export default function Hud({ client, actions, islands, viewRect }: { client: GameClient; actions: HudActions; islands: { x: number; z: number; radius: number }[]; viewRect?: () => ViewRect | null }) {
  const dead = useHud((s) => s.me?.state !== undefined && s.me.state !== 'alive');
  const shopOpen = useHud((s) => s.shopOpen);
  return (
    <>
      <div className={`hud ${dead ? 'is-dead' : ''}`} data-testid="hud">
        <PlayerPanel client={client} />
        <TargetPanel actions={actions} />
        <GoldPanel />
        <Minimap client={client} islands={islands} viewRect={viewRect} />
        <Toasts />
        <Feed />
        <ActionBar actions={actions} />
        <MobileButtons actions={actions} />
        <Hint />
      </div>
      {shopOpen && <Shop actions={actions} />}
      <DeathOverlay client={client} actions={actions} />
      <ConnectionOverlay actions={actions} />
    </>
  );
}

export type { MeHud, TargetHud };

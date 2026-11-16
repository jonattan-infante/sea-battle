'use client';
// Astillero del puerto (ART-DIRECTION §14, GDD §11). El servidor valida cada compra; aquí solo se explica por qué un botón
// está desactivado. Con la BD caída (AC-132, D50) no se cierra: muestra una franja y bloquea las compras.
// 1.3: la tienda es por barco (D103; AC-216, AC-217) y la familia se compra (D101; AC-225). Pestañas Barcos y Familia: cada
// barco, con la vista previa de su modelo en el aspecto en uso, sus niveles, «Elegir» o «EN USO» y «Mejoras», que abre en el
// mismo panel la vista de mejoras de ese barco sin enviar nada. Con el Astillero abierto, los avisos salen dentro (O-48)
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CANNON_LEVELS,
  FAMILY_PRICE,
  FamilyChoice,
  MAX_UPGRADE_LEVEL,
  PLAYER_SHIP_ORDER,
  PlayerShipClass,
  SHIP_CLASSES,
  ShipFamily,
  UNDER_FIRE_WINDOW,
  UPGRADE_LEVELS,
  UpgradeId,
  upgradePrice
} from '../../game/constants';
import { levelsOf } from '../../game/stats';
import { PlayerView, Upgrades } from '../../game/types';
import { levelOf } from '../../game/xp';
import { PORT_FIRE_TOAST_KEY, portBlockReason, portUnderFireText, SHOP_UNAVAILABLE } from '../../client/hud-logic';
import { useHud } from '../../client/hud-store';
import { previewAlt, SHIP_PREVIEW_SIZE, SHIP_PREVIEWS } from '../../client/ship-previews';
import {
  FAMILY_CARDS,
  FAMILY_NOTE,
  FAMILY_TEXT,
  familyAria,
  isFamily,
  NEW_SHIP_TEXT,
  otherShipNotice,
  shipLevelLock,
  upgradesTitle
} from '../../client/shop-logic';
import { RankBadge } from './badges';
import type { HudActions } from './Hud';
import { ChevronLeft, Close, CloudOff, Coins, Crosshair, Sailboat, Shield, Wrench } from './icons';

const fmt = (n: number) => n.toLocaleString('es-ES');
const dec = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const UPGRADES: readonly UpgradeId[] = ['cannons', 'hull', 'sails'];
const UPGRADE_NAME: Record<UpgradeId, string> = { cannons: 'Cañones', hull: 'Casco', sails: 'Velas' };

const UPGRADE_ICON: Record<UpgradeId, React.ReactNode> = {
  cannons: <Crosshair size={36} />,
  hull: <Shield size={36} />,
  sails: <Sailboat size={36} />
};
// Los iconos de 14 de los niveles de cada barco (D100, en la lista y en la vista de mejoras)
const LEVEL_ICON: Record<UpgradeId, React.ReactNode> = {
  cannons: <Crosshair size={14} />,
  hull: <Shield size={14} />,
  sails: <Sailboat size={14} />
};

function statsLine(upgrade: UpgradeId, level: number, classId: string): React.ReactNode {
  const next = Math.min(MAX_UPGRADE_LEVEL, level + 1);
  const maxed = level >= MAX_UPGRADE_LEVEL;
  if (upgrade === 'cannons') {
    const a = CANNON_LEVELS[level - 1];
    const b = CANNON_LEVELS[next - 1];
    if (maxed) return <>Daño {a.damage} · Alcance {a.range} m · Recarga {dec(a.reload)} s</>;
    return <>Daño {a.damage} → <b>{b.damage}</b> · Alcance {a.range} → <b>{b.range} m</b> · Recarga {dec(a.reload)} → <b>{dec(b.reload)} s</b></>;
  }
  const base = upgrade === 'hull' ? SHIP_CLASSES[classId].maxHp : SHIP_CLASSES[classId].maxSpeed;
  const m = UPGRADE_LEVELS[upgrade].multipliers;
  const label = upgrade === 'hull' ? 'Vida máx.' : 'Vel. máx.';
  const unit = upgrade === 'hull' ? '' : ' m/s';
  const value = (lvl: number) => (upgrade === 'hull' ? fmt(Math.round(base * m[lvl - 1])) : dec(base * m[lvl - 1]));
  if (maxed) return <>{label} {value(level)}{unit} (×{dec(m[level - 1])})</>;
  return <>{label} {value(level)} → <b>{value(next)}{unit}</b> (×{dec(m[level - 1])} → ×{dec(m[next - 1])})</>;
}

// Una imagen en caché ya está completa al montarse y puede no disparar onLoad: se marca a mano (sin estado de React)
const markLoaded = (img: HTMLImageElement | null) => {
  if (img?.complete && img.naturalWidth > 0) img.classList.add('is-loaded');
};

// La vista previa del modelo (D103, D101): la caja tiene su tamaño y el fondo CSS de cielo y mar desde el principio, así que
// nada salta mientras llega; el retrato entra con un fundido de 150 ms, y si no llega, se queda el fondo
function ShipPreview({ classId, family, className, testId }: { classId: PlayerShipClass; family: FamilyChoice; className: string; testId: string }) {
  const url = SHIP_PREVIEWS[classId][family];
  return (
    <div className={`preview ${className}`}>
      <img
        key={url}
        src={url}
        width={SHIP_PREVIEW_SIZE.width}
        height={SHIP_PREVIEW_SIZE.height}
        decoding="async"
        alt={previewAlt(classId, family)}
        ref={markLoaded}
        onLoad={(e) => e.currentTarget.classList.add('is-loaded')}
        data-testid={testId}
        data-family={family}
      />
    </div>
  );
}

// Los 3 niveles de un barco (D100): el icono de 14 y 3 puntos de 8 por mejora, 164 × 14
function Levels({ levels, testId }: { levels: Upgrades; testId: string }) {
  return (
    <span
      className="lv"
      role="img"
      aria-label={UPGRADES.map((u) => `${UPGRADE_NAME[u]} ${levels[u]} de ${MAX_UPGRADE_LEVEL}`).join(', ')}
      data-testid={testId}
      data-levels={UPGRADES.map((u) => levels[u]).join(',')}
    >
      {UPGRADES.map((u) => (
        <span key={u} className="lv__group">
          {LEVEL_ICON[u]}
          {Array.from({ length: MAX_UPGRADE_LEVEL }, (_, i) => <span key={i} className={`lv__dot ${i < levels[u] ? 'is-on' : ''}`} />)}
        </span>
      ))}
    </span>
  );
}

// Tarjeta de mejora de hoy (§14), con los niveles y los precios del barco de la vista (GDD §11, 1.3)
function UpgradeCard({ upgrade, level, gold, classId, flash, locked, onBuy }: { upgrade: UpgradeId; level: number; gold: number; classId: PlayerShipClass; flash: boolean; locked: boolean; onBuy: () => void }) {
  const def = UPGRADE_LEVELS[upgrade];
  const maxed = level >= MAX_UPGRADE_LEVEL;
  const price = maxed ? 0 : upgradePrice(classId, upgrade, level + 1);
  const missing = price - gold;
  return (
    <article className={`card ${flash ? 'is-bought' : ''}`} data-testid={`shop-${upgrade}`}>
      <div className="card__icon">{UPGRADE_ICON[upgrade]}</div>
      <div className="card__body">
        <div className="card__title">
          <span>{def.label}</span>
          <span className="card__levels" aria-label={`Nivel ${level} de ${MAX_UPGRADE_LEVEL}`}>
            {Array.from({ length: MAX_UPGRADE_LEVEL }, (_, i) => <span key={i} className={`card__dot ${i < level ? 'is-on' : ''}`} />)}
            &nbsp;Nivel {level}/{MAX_UPGRADE_LEVEL}
          </span>
        </div>
        <div className="card__stats">{statsLine(upgrade, level, classId)}</div>
        <div className="card__foot">
          {maxed ? (
            <span className="stamp">Máximo</span>
          ) : (
            <>
              {missing > 0 && <span className="card__why">Te faltan {fmt(missing)}</span>}
              <span className="card__price" data-testid={`price-${upgrade}`}><Coins size={16} /> {fmt(price)}</span>
              <button type="button" className="btn btn--primary" disabled={locked || missing > 0} onClick={onBuy} data-testid={`buy-${upgrade}-${level + 1}`}>
                Mejorar
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

// Un barco de la lista (D103): la vista previa en lugar del icono, sus niveles o «Llega sin mejoras», las cifras con sus
// mejoras y el pie: «EN USO» o «Elegir» y «Mejoras» en los propios; «Requiere nivel…» o «Te faltan…», el precio y
// «Comprar» en los demás (D85)
function ShipCard({ classId, player, playerLevel, locked, cardRef, onBuy, onUse, onUpgrades }: {
  classId: PlayerShipClass;
  player: PlayerView;
  playerLevel: number;
  locked: boolean;
  cardRef?: React.Ref<HTMLElement>;
  onBuy: () => void;
  onUse: () => void;
  onUpgrades: () => void;
}) {
  const c = SHIP_CLASSES[classId];
  const owned = !!player.ships[classId];
  const active = player.activeShip === classId;
  const levels = levelsOf(player, classId);
  const hp = Math.round(c.maxHp * UPGRADE_LEVELS.hull.multipliers[levels.hull - 1]);
  const speed = c.maxSpeed * UPGRADE_LEVELS.sails.multipliers[levels.sails - 1];
  const lock = owned ? null : shipLevelLock(classId, playerLevel);
  const missing = c.price - player.gold;
  return (
    <article className="card card--ship" data-testid={`ship-${classId}`} ref={cardRef}>
      <ShipPreview classId={classId} family={player.family} className="card__preview" testId={`ship-preview-${classId}`} />
      <div className="card__body">
        <div className="card__title">
          <span>{c.label}</span>
          {owned ? <Levels levels={levels} testId={`levels-${classId}`} /> : <span className="card__new">{NEW_SHIP_TEXT}</span>}
        </div>
        <div className="card__stats">
          Vida <b>{fmt(hp)}</b> · Velocidad <b>{dec(speed)} m/s</b> · Cañones <b>{c.cannonsPerSide} por banda</b> · Eslora {c.length} m
        </div>
        <div className="card__foot">
          {owned ? (
            <>
              {active ? (
                <span className="stamp" data-testid={`in-use-${classId}`}>En uso</span>
              ) : (
                <button type="button" className="btn btn--secondary btn--compact" disabled={locked} onClick={onUse} data-testid={`use-${classId}`} aria-label={`Elegir ${c.label}`}>
                  Elegir
                </button>
              )}
              <button type="button" className="btn btn--secondary btn--compact" onClick={onUpgrades} data-testid={`upgrades-${classId}`} aria-label={upgradesTitle(classId)}>
                <Wrench size={16} />
                Mejoras
              </button>
            </>
          ) : (
            <>
              {lock ? (
                <span className="card__why card__why--level" data-testid={`level-lock-${classId}`}>
                  <RankBadge rank={lock.rank} size={16} />
                  {lock.text}
                </span>
              ) : (
                missing > 0 && <span className="card__why">Te faltan {fmt(missing)}</span>
              )}
              <span className="card__price"><Coins size={16} /> {fmt(c.price)}</span>
              <button type="button" className="btn btn--primary" disabled={locked || !!lock || missing > 0} onClick={onBuy} data-testid={`buy-ship-${classId}`}>
                Comprar
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

// La vista de mejoras de un barco (D103, la nueva D99): sustituye a la lista en el mismo panel; abrirla no envía nada (AC-216)
function UpgradesView({ classId, player, locked, flash, onBack, onBuy }: { classId: PlayerShipClass; player: PlayerView; locked: boolean; flash: UpgradeId | null; onBack: () => void; onBuy: (u: UpgradeId, level: number) => void }) {
  const levels = levelsOf(player, classId);
  const active = player.activeShip === classId;
  return (
    <section className="upgrades" data-testid="upgrades-view" data-ship={classId} aria-label={upgradesTitle(classId)}>
      <button type="button" className="upgrades__back" onClick={onBack} data-testid="upgrades-back">
        <ChevronLeft size={16} />
        Barcos
      </button>
      <div className="upgrades__head">
        <ShipPreview classId={classId} family={player.family} className="upgrades__preview" testId="upgrades-preview" />
        <div className="upgrades__text">
          <h3 className="upgrades__title" data-testid="upgrades-title">{upgradesTitle(classId)}</h3>
          <Levels levels={levels} testId="upgrades-levels" />
          {active && <span className="stamp upgrades__stamp" data-testid="upgrades-in-use">En uso</span>}
        </div>
        {!active && <p className="upgrades__other" data-testid="upgrades-other-ship">{otherShipNotice(player.activeShip)}</p>}
      </div>
      <div className="shop__grid upgrades__grid">
        {UPGRADES.map((u) => (
          <UpgradeCard key={u} upgrade={u} level={levels[u]} gold={player.gold} classId={classId} flash={flash === u} locked={locked} onBuy={() => onBuy(u, levels[u] + 1)} />
        ))}
      </div>
    </section>
  );
}

// Banderas de popa de 30 × 20 (D94; los colores de navio_curvo.py), decorativas
function Flag({ family }: { family: ShipFamily }) {
  return (
    <svg className="family__flag" width={30} height={20} viewBox="0 0 30 20" aria-hidden="true">
      {family === 'gb' ? (
        <>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0 0L30 20M30 0L0 20" stroke="#FFFFFF" strokeWidth="4" />
          <path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" strokeWidth="1.4" />
          <path d="M15 0V20M0 10H30" stroke="#FFFFFF" strokeWidth="6" />
          <path d="M15 0V20M0 10H30" stroke="#C8102E" strokeWidth="3.6" />
        </>
      ) : (
        <>
          <rect width="30" height="20" fill="#AA151B" />
          <rect y="5" width="30" height="10" fill="#F1BF00" />
        </>
      )}
    </svg>
  );
}

// La pestaña Familia (D101; AC-225): «Sin familia», la británica y la española, con el barco activo en cada aspecto
function FamilyTab({ player, locked, actions }: { player: PlayerView; locked: boolean; actions: HudActions }) {
  const intent = useHud((s) => s.familyIntent);
  const missing = FAMILY_PRICE - player.gold;
  return (
    <>
      <div className="shop__grid shop__grid--family">
        {FAMILY_CARDS.map((f) => {
          const inUse = player.family === f;
          const owned = !isFamily(f) || player.families.includes(f);
          const waiting = intent?.family === f;
          return (
            <article key={f} className={`card card--family ${inUse ? 'is-current' : ''}`} data-testid={`family-${f}`} aria-current={inUse ? 'true' : undefined}>
              <ShipPreview classId={player.activeShip} family={f} className="family__preview" testId={`family-preview-${f}`} />
              <div className="family__name">
                {isFamily(f) && <Flag family={f} />}
                <span>{FAMILY_TEXT[f].label}</span>
              </div>
              <div className="family__traits">{FAMILY_TEXT[f].traits}</div>
              <div className="card__foot">
                {inUse ? (
                  <span className="stamp">En uso</span>
                ) : owned ? (
                  <button type="button" className="btn btn--primary" disabled={locked || waiting} onClick={() => actions.selectFamily(f)} data-testid={`select-family-${f}`} aria-label={familyAria('select', f)}>
                    Elegir
                  </button>
                ) : (
                  <>
                    {missing > 0 && <span className="card__why">Te faltan {fmt(missing)}</span>}
                    <span className="card__price"><Coins size={16} /> {fmt(FAMILY_PRICE)}</span>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={locked || waiting || missing > 0}
                      onClick={() => isFamily(f) && actions.buyFamily(f)}
                      data-testid={`buy-family-${f}`}
                      aria-label={familyAria('buy', f, FAMILY_PRICE)}
                    >
                      Comprar
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="family__note">{FAMILY_NOTE}</p>
    </>
  );
}

type Tab = 'ships' | 'family';

export default function Shop({ actions }: { actions: HudActions }) {
  const player = useHud((s) => s.player);
  // Solo abre donde la zona protege: dentro y sin la marca de bajo fuego (GDD §11, AC-253)
  const canStay = useHud((s) => portBlockReason(s.me, false) === null); // la BD caída no la cierra: bloquea las compras (AC-132)
  const setShopOpen = useHud((s) => s.setShopOpen);
  const locked = useHud((s) => s.saveWarning);
  const notice = useHud((s) => s.shopNotice);
  const [tab, setTab] = useState<Tab>('ships');
  const [view, setView] = useState<PlayerShipClass | null>(null); // la vista de mejoras de ese barco, o la lista
  const [flash, setFlash] = useState<{ ship: PlayerShipClass; upgrade: UpgradeId } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const activeCard = useRef<HTMLElement>(null);
  const listScroll = useRef<number | null>(null); // desplazamiento de la lista al abrir una vista, para volver al mismo punto
  const prev = useRef(player?.ships);

  // La tienda solo existe donde la zona protege: se cierra al salir y al caer bajo fuego dentro. Al caer bajo fuego sale el
  // aviso del puerto con N = 10, el de pulsar Puerto en ese momento (D125)
  useEffect(() => {
    if (canStay) return;
    const st = useHud.getState();
    if (portBlockReason(st.me, false) === 'under-fire') st.pushToast('danger', portUnderFireText(UNDER_FIRE_WINDOW), undefined, { key: PORT_FIRE_TOAST_KEY, fire: true });
    setShopOpen(false);
  }, [canStay, setShopOpen]);

  // Al abrir, la lista lleva el barco que se navega a la vista, como scrollIntoView({ block: 'nearest' }) con el relleno de
  // la lista (D103): en el escritorio caben los 5 y no se mueve; en el móvil y el apaisado, baja hasta él y su «Mejoras»
  useLayoutEffect(() => {
    const box = body.current;
    const card = activeCard.current;
    if (!box || !card) return;
    const pad = parseFloat(getComputedStyle(box).paddingBottom) || 0;
    const top = card.offsetTop - pad;
    const bottom = card.offsetTop + card.offsetHeight + pad;
    if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = Math.min(top, bottom - box.clientHeight);
    else if (top < box.scrollTop) box.scrollTop = top;
  }, []);

  // La vista abre arriba; al volver, la lista vuelve al punto en que estaba
  useLayoutEffect(() => {
    const box = body.current;
    if (!box) return;
    if (tab === 'ships' && view === null && listScroll.current !== null) {
      box.scrollTop = listScroll.current;
      listScroll.current = null;
    } else if (view !== null || tab === 'family') box.scrollTop = 0;
  }, [view, tab]);

  // Borde dorado de 300 ms en la mejora recién comprada, la del barco que sea
  useEffect(() => {
    const before = prev.current;
    prev.current = player?.ships;
    if (!before || !player) return;
    for (const ship of PLAYER_SHIP_ORDER) {
      const a = before[ship];
      const b = player.ships[ship];
      const upgrade = a && b ? UPGRADES.find((u) => b[u] > a[u]) : undefined;
      if (!upgrade) continue;
      setFlash({ ship, upgrade });
      const id = setTimeout(() => setFlash(null), 300);
      return () => clearTimeout(id);
    }
  }, [player]);

  if (!player) return null;
  const level = levelOf(player.xp);

  const openUpgrades = (classId: PlayerShipClass) => {
    listScroll.current = body.current?.scrollTop ?? 0;
    setView(classId);
  };
  const showTab = (next: Tab) => {
    if (next === 'ships' && view !== null) setView(null); // la pestaña Barcos, marcada, también vuelve a la lista
    else if (next === 'family') {
      if (view !== null) setView(null);
      listScroll.current = null;
    }
    setTab(next);
  };

  return (
    <div className="modal-scrim modal-scrim--blur modal-scrim--sheet" onClick={(e) => e.target === e.currentTarget && setShopOpen(false)} data-testid="shop">
      <div className="shop" role="dialog" aria-modal="true" aria-labelledby="shop-title">
        <header className="shop__head">
          <h2 id="shop-title" className="shop__title font-pirate">Astillero del Puerto</h2>
          <span className="shop__gold" data-testid="shop-gold"><Coins size={16} /> {fmt(player.gold)}</span>
          <button type="button" className="shop__close" onClick={() => setShopOpen(false)} aria-label="Cerrar (Esc)"><Close /></button>
        </header>
        <div className="shop__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'ships'} className={`shop__tab ${tab === 'ships' ? 'is-active' : ''}`} onClick={() => showTab('ships')} data-testid="tab-ships">Barcos</button>
          <button type="button" role="tab" aria-selected={tab === 'family'} className={`shop__tab ${tab === 'family' ? 'is-active' : ''}`} onClick={() => showTab('family')} data-testid="tab-family">Familia</button>
        </div>
        {locked && <div className="shop__unsaved" role="status" data-testid="shop-unsaved"><CloudOff size={16} /> {SHOP_UNAVAILABLE}</div>}
        <div className="shop__body" ref={body} data-testid="shop-body">
          {tab === 'family' ? (
            <FamilyTab player={player} locked={locked} actions={actions} />
          ) : view !== null && player.ships[view] ? (
            <UpgradesView
              classId={view}
              player={player}
              locked={locked}
              flash={flash?.ship === view ? flash.upgrade : null}
              onBack={() => setView(null)}
              onBuy={(u, next) => actions.buy(`${u}:${next}`, view)}
            />
          ) : (
            <div className="shop__grid">
              {PLAYER_SHIP_ORDER.map((c) => (
                <ShipCard
                  key={c}
                  classId={c}
                  player={player}
                  playerLevel={level}
                  locked={locked}
                  cardRef={player.activeShip === c ? activeCard : undefined}
                  onBuy={() => actions.buy(`ship:${c}`)}
                  onUse={() => actions.selectShip(c)}
                  onUpgrades={() => openUpgrades(c)}
                />
              ))}
            </div>
          )}
        </div>
        {notice && (
          <div key={notice.id} className={`toast toast--${notice.kind} shop__notice`} role="status" data-testid="shop-notice">
            {notice.text}
          </div>
        )}
      </div>
    </div>
  );
}

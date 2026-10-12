'use client';
// Astillero del puerto (ART-DIRECTION §14, GDD §11). El servidor valida cada compra; aquí solo se explica
// por qué un botón está desactivado. Con la BD caída (AC-132, D50) no se cierra: muestra una franja y bloquea las compras.
import React, { useEffect, useRef, useState } from 'react';
import {
  CANNON_LEVELS,
  MAX_UPGRADE_LEVEL,
  PLAYER_SHIP_ORDER,
  PlayerShipClass,
  SHIP_CLASSES,
  UPGRADE_LEVELS,
  UpgradeId
} from '../../game/constants';
import { SHOP_UNAVAILABLE } from '../../client/hud-logic';
import { useHud } from '../../client/hud-store';
import type { HudActions } from './Hud';
import { Close, CloudOff, Coins, Crosshair, Sailboat, Shield } from './icons';

const fmt = (n: number) => n.toLocaleString('es-ES');
const dec = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

const UPGRADE_ICON: Record<UpgradeId, React.ReactNode> = {
  cannons: <Crosshair size={36} />,
  hull: <Shield size={36} />,
  sails: <Sailboat size={36} />
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

function UpgradeCard({ upgrade, level, gold, classId, flash, locked, onBuy }: { upgrade: UpgradeId; level: number; gold: number; classId: string; flash: boolean; locked: boolean; onBuy: () => void }) {
  const def = UPGRADE_LEVELS[upgrade];
  const maxed = level >= MAX_UPGRADE_LEVEL;
  const price = maxed ? 0 : def.prices[level];
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
              <span className="card__price"><Coins size={16} /> {fmt(price)}</span>
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

function ShipCard({ classId, owned, active, gold, hullLevel, locked, onBuy, onUse }: { classId: PlayerShipClass; owned: boolean; active: boolean; gold: number; hullLevel: number; locked: boolean; onBuy: () => void; onUse: () => void }) {
  const c = SHIP_CLASSES[classId];
  const hp = Math.round(c.maxHp * UPGRADE_LEVELS.hull.multipliers[hullLevel - 1]);
  const missing = c.price - gold;
  return (
    <article className="card" data-testid={`ship-${classId}`}>
      <div className="card__icon"><Sailboat size={40} /></div>
      <div className="card__body">
        <div className="card__title"><span>{c.label}</span></div>
        <div className="card__stats">
          Vida <b>{fmt(hp)}</b> · Velocidad <b>{c.maxSpeed} m/s</b> · Cañones <b>{c.cannonsPerSide} por banda</b> · Eslora {c.length} m
        </div>
        <div className="card__foot">
          {active ? (
            <span className="stamp">En uso</span>
          ) : owned ? (
            <button type="button" className="btn btn--secondary" disabled={locked} onClick={onUse} data-testid={`use-${classId}`}>Usar</button>
          ) : (
            <>
              {missing > 0 && <span className="card__why">Te faltan {fmt(missing)}</span>}
              <span className="card__price"><Coins size={16} /> {fmt(c.price)}</span>
              <button type="button" className="btn btn--primary" disabled={locked || missing > 0} onClick={onBuy} data-testid={`buy-ship-${classId}`}>Comprar</button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Shop({ actions }: { actions: HudActions }) {
  const player = useHud((s) => s.player);
  const inSafe = useHud((s) => !!s.me?.inSafeZone && s.me.state === 'alive');
  const setShopOpen = useHud((s) => s.setShopOpen);
  const locked = useHud((s) => s.saveWarning);
  const [tab, setTab] = useState<'upgrades' | 'ships'>('upgrades');
  const [flash, setFlash] = useState<UpgradeId | null>(null);
  const prev = useRef(player?.upgrades);

  // La tienda solo existe en la zona segura: se cierra al salir
  useEffect(() => {
    if (!inSafe) setShopOpen(false);
  }, [inSafe, setShopOpen]);

  // Borde dorado de 300 ms en la tarjeta recién comprada
  useEffect(() => {
    const before = prev.current;
    prev.current = player?.upgrades;
    if (!before || !player) return;
    const bought = (Object.keys(player.upgrades) as UpgradeId[]).find((k) => player.upgrades[k] > before[k]);
    if (!bought) return;
    setFlash(bought);
    const id = setTimeout(() => setFlash(null), 300);
    return () => clearTimeout(id);
  }, [player]);

  if (!player) return null;
  return (
    <div className="modal-scrim modal-scrim--blur modal-scrim--sheet" onClick={(e) => e.target === e.currentTarget && setShopOpen(false)} data-testid="shop">
      <div className="shop" role="dialog" aria-modal="true" aria-labelledby="shop-title">
        <header className="shop__head">
          <h2 id="shop-title" className="shop__title font-pirate">Astillero del Puerto</h2>
          <span className="shop__gold" data-testid="shop-gold"><Coins size={16} /> {fmt(player.gold)}</span>
          <button type="button" className="shop__close" onClick={() => setShopOpen(false)} aria-label="Cerrar (Esc)"><Close /></button>
        </header>
        <div className="shop__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'upgrades'} className={`shop__tab ${tab === 'upgrades' ? 'is-active' : ''}`} onClick={() => setTab('upgrades')}>Mejoras</button>
          <button type="button" role="tab" aria-selected={tab === 'ships'} className={`shop__tab ${tab === 'ships' ? 'is-active' : ''}`} onClick={() => setTab('ships')} data-testid="tab-ships">Barcos</button>
        </div>
        {locked && <div className="shop__unsaved" role="status" data-testid="shop-unsaved"><CloudOff size={16} /> {SHOP_UNAVAILABLE}</div>}
        <div className="shop__grid">
          {tab === 'upgrades'
            ? (['cannons', 'hull', 'sails'] as UpgradeId[]).map((u) => (
                <UpgradeCard
                  key={u}
                  upgrade={u}
                  level={player.upgrades[u]}
                  gold={player.gold}
                  classId={player.activeShip}
                  flash={flash === u}
                  locked={locked}
                  onBuy={() => actions.buy(`${u}:${player.upgrades[u] + 1}`)}
                />
              ))
            : PLAYER_SHIP_ORDER.map((c) => (
                <ShipCard
                  key={c}
                  classId={c}
                  owned={player.ownedShips.includes(c)}
                  active={player.activeShip === c}
                  gold={player.gold}
                  hullLevel={player.upgrades.hull}
                  locked={locked}
                  onBuy={() => actions.buy(`ship:${c}`)}
                  onUse={() => actions.selectShip(c)}
                />
              ))}
        </div>
      </div>
    </div>
  );
}

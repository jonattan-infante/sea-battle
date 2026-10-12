'use client';
// Muerte (ART-DIRECTION §15) y estados de conexión (§16.2). La cuenta atrás corre por ref (sin commits).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEATH_COUNTDOWN } from '../../game/constants';
import type { ConnectionState, GameClient } from '../../client/game-client';
import { addTicker } from '../../client/hud-logic';
import { useHud } from '../../client/hud-store';
import type { HudActions } from './Hud';
import { Coins, Compass, Skull } from './icons';

const RING = 2 * Math.PI * 28;
const RELATION_COLOR = { self: 'var(--rel-self)', player: 'var(--rel-player)', pirate: 'var(--rel-pirate)', merchant: 'var(--rel-merchant)' } as const;

export function DeathOverlay({ client, actions }: { client: GameClient; actions: HudActions }) {
  const death = useHud((s) => s.player?.death ?? null);
  const killedBy = useHud((s) => s.killedBy);
  const numberRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const respawnAt = death?.respawnAt ?? null;

  // `disabled` vive solo en el DOM: si fuera una prop, React descartaría el clic aunque el ticker habilite el
  // botón (decide con sus props, no con el DOM). Se pinta antes del primer frame para que no parpadee activo.
  useLayoutEffect(() => {
    if (respawnAt === null) return;
    let last = -1;
    const paint = (now: number) => {
      const left = Math.max(0, respawnAt - client.serverTime(now));
      const secs = Math.ceil(left);
      ringRef.current?.setAttribute('stroke-dashoffset', String(RING * (1 - left / DEATH_COUNTDOWN)));
      if (secs === last) return;
      last = secs;
      if (numberRef.current) numberRef.current.textContent = String(secs);
      const btn = buttonRef.current;
      if (btn) {
        btn.disabled = secs > 0;
        btn.textContent = secs > 0 ? `Zarpar en ${secs} s` : 'Zarpar';
        if (secs === 0) btn.focus(); // Enter zarpa sin buscar el botón
      }
    };
    paint(performance.now());
    return addTicker(paint);
  }, [respawnAt, client]);

  if (!death) return null;
  const color = killedBy ? RELATION_COLOR[killedBy.relation] : 'var(--ui-text)';
  return (
    <>
      <div className="death-vignette" />
      <section className="death-card" role="dialog" aria-modal="true" aria-labelledby="death-title" data-testid="death-card">
        <h2 id="death-title" className="font-pirate">Hundido</h2>
        {death.by && (
          <div className="death-card__by" style={{ color }} data-testid="death-by">
            por {killedBy?.relation === 'pirate' && <Skull size={16} />} {death.by}
          </div>
        )}
        <div className="death-card__lost" data-testid="death-gold"><Coins size={18} /> −{death.goldLost.toLocaleString('es-ES')} oro</div>
        <div className="death-ring" aria-hidden>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" stroke="rgba(242,193,78,0.2)" strokeWidth="4" fill="none" />
            <circle ref={ringRef} cx="32" cy="32" r="28" stroke="var(--ui-gold)" strokeWidth="4" fill="none" strokeDasharray={RING} strokeDashoffset={0} />
          </svg>
          <span ref={numberRef} data-testid="death-countdown">{DEATH_COUNTDOWN}</span>
        </div>
        <button ref={buttonRef} type="button" className="btn-sail" onClick={actions.respawn} data-testid="btn-respawn">
          Zarpar en {DEATH_COUNTDOWN} s
        </button>
      </section>
    </>
  );
}

// Un solo componente para todos los estados de conexión y de progreso (D50, §16.2): la tarjeta .offline con una tabla de
// textos. AC-131 no tiene juego detrás: va sobre el fondo de «Conectando», sin velo
interface OverlayCopy {
  title: string;
  body: string;
  detail?: string;
  retry: boolean;
  exit: boolean;
}

const LOAD_DETAIL = 'Lo que tenías guardado sigue intacto.';
const LOAD_RETRY_FAILED = 'Sigue sin responder. Prueba de nuevo en unos segundos.';

function copyFor(connection: ConnectionState, attempt: number, loadFailed: boolean): OverlayCopy {
  switch (connection) {
    case 'failed':
      return { title: 'Sin conexión', body: 'No pudimos reconectar con el servidor.', retry: true, exit: true };
    case 'load-failed':
      return { title: 'Progreso no disponible', body: 'No podemos cargar tu progreso ahora mismo', detail: loadFailed ? LOAD_RETRY_FAILED : LOAD_DETAIL, retry: true, exit: true };
    case 'kicked':
      return { title: 'Sesión en otra pestaña', body: 'Has abierto el juego en otra pestaña', detail: 'Tu barco sigue en la otra: solo hay uno por cuenta.', retry: false, exit: true };
    case 'unauthorized':
      return { title: 'Sesión no válida', body: 'Vuelve a iniciar sesión para seguir jugando.', retry: false, exit: true };
    default:
      return { title: 'Sin conexión', body: `Reintentando (${Math.max(1, attempt)}/3)…`, retry: false, exit: false };
  }
}

export function ConnectionOverlay({ actions }: { actions: HudActions }) {
  const connection = useHud((s) => s.connection);
  const attempt = useHud((s) => s.reconnectAttempt);
  // AC-126: "Salir" sondea el servidor 2 s antes de navegar; si no responde, se queda aquí y lo explica
  const [exit, setExit] = useState<'idle' | 'probing' | 'unreachable'>('idle');
  // AC-131: "Reintentar" lanza un solo intento de carga a la vez; si falla, cambia el detalle
  const [load, setLoad] = useState<'idle' | 'busy' | 'failed'>('idle');
  const retryRef = useRef<HTMLButtonElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (connection !== 'connected') return;
    setExit('idle');
    setLoad('idle');
  }, [connection]);
  // Al abrirse, el foco va al primario (o a "Salir" si es el único): Enter funciona sin buscarlo (D50)
  useLayoutEffect(() => {
    (retryRef.current ?? exitRef.current)?.focus();
  }, [connection]);
  if (connection === 'connected' || connection === 'connecting' || connection === 'full') return null;
  const onExit = async () => {
    if (exit === 'probing') return; // H-16: un solo sondeo en curso
    setExit('probing');
    setExit((await actions.exit()) ? 'idle' : 'unreachable');
  };
  const onRetry = async () => {
    if (connection !== 'load-failed') return actions.retry();
    if (load === 'busy') return;
    setLoad('busy');
    // Si entra, el overlay se desmonta con connection = 'connected'; si no, vuelve a estar activo con otro detalle
    setLoad((await actions.retryLoad()) ? 'idle' : 'failed');
  };
  const copy = copyFor(connection, attempt, load === 'failed');
  const busy = load === 'busy';
  // AC-126: el aviso del sondeo fallido sustituye al detalle mientras se vea
  const detail = exit === 'unreachable' ? null : copy.detail;
  return (
    <div className={connection === 'load-failed' ? 'offline-screen' : 'modal-scrim'} data-testid="connection-overlay" data-state={connection}>
      <section className="panel offline" role="alertdialog" aria-labelledby="offline-title" aria-describedby="offline-body">
        <h2 id="offline-title" className="font-pirate">{copy.title}</h2>
        <p id="offline-body" className="offline__body">{copy.body}</p>
        {detail && <p className="offline__detail" data-testid="offline-detail">{detail}</p>}
        {exit === 'unreachable' && <p className="offline__detail" role="status" data-testid="exit-unreachable">El servidor no responde. Vuelve a intentarlo en unos segundos</p>}
        {(copy.retry || copy.exit) && (
          <div className="flex gap-3">
            {copy.retry && (
              // Como «Salir» en AC-126 e: sin disabled, para que conserve el foco y los clics de más lleguen aquí y no lancen otro
              // intento. Mientras espera, aria-busy y aria-disabled, con el aspecto de D55 (CSS de .offline)
              <button ref={retryRef} type="button" className="btn btn--primary" onClick={onRetry} aria-busy={busy} aria-disabled={busy} data-testid="btn-retry">
                {busy ? 'Reintentando…' : 'Reintentar'}
              </button>
            )}
            <button ref={exitRef} type="button" className="btn btn--secondary" onClick={onExit} aria-busy={exit === 'probing'} data-testid="btn-exit">
              {exit === 'probing' ? 'Saliendo…' : 'Salir'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export function Connecting() {
  return (
    <div className="connecting" data-testid="loading">
      <Compass size={64} />
      <span>Izando velas…</span>
    </div>
  );
}

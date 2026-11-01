'use client';
// Opciones de cámara y teclas (E18, H-1801 y H-1802, lámina D98; ART-DIRECTION §20): el botón del HUD y su panel. El
// estado vive en src/client/options-store.ts; el teclado de la espera lo lee GameApp.tsx (routeKey). Abrirlo, cambiar una
// opción y cerrarlo no envían nada al servidor (AC-205), salvo el viewAt(null) de volver a «Centrada» (AC-207), que sale
// de la vista. Medidas y colores: globals.css («Opciones», §20)
import React, { useSyncExternalStore } from 'react';
import { Bindable, isArrowCode, keyLabel, keyText, VIEW_ACTIONS } from '../../client/key-bindings';
import { CameraMode } from '../../client/options';
import { useOptions } from '../../client/options-store';
import { ACTION_NAMES, noticeText } from '../../client/options-text';
import { ArrowCode, ArrowUp, Close, Move, Recenter, Settings } from './icons';
import { useHudLayout } from './layout';

// Las teclas solo salen en la forma de escritorio y con un puntero fino, el principal (AC-205, §20.2)
const FINE = '(pointer: fine)';
const subscribeFine = (onChange: () => void) => {
  const l = window.matchMedia(FINE);
  l.addEventListener('change', onChange);
  return () => l.removeEventListener('change', onChange);
};
const useFinePointer = () => useSyncExternalStore(subscribeFine, () => window.matchMedia(FINE).matches, () => false);

// Una tecla como la enseñan el panel y el HUD (AC-208): su letra en el teclado del jugador, o el icono de la flecha con su
// nombre, porque la Barlow no tiene las flechas
export function KeyCap({ code }: { code: string }) {
  const layout = useOptions((s) => s.layout);
  if (isArrowCode(code)) return <ArrowUp code={code as ArrowCode} className="keycap__arrow" title={keyText(code)} />;
  return <>{keyLabel(code, layout)}</>;
}

// El texto de una tecla asignada para un title («Detener (S)», «Centrar (flecha abajo)»)
export function useKeyText(action: Bindable): string {
  return useOptions((s) => keyText(s.keys[action], s.layout));
}

// §20.1: en escritorio, el engranaje solo; en táctil, con «Opciones» debajo, como los demás botones
export function OptionsButton() {
  const open = useOptions((s) => s.open);
  const setOpen = useOptions((s) => s.setOpen);
  return (
    <button
      type="button"
      className={`panel hud-options ${open ? 'is-active' : ''}`}
      onClick={() => setOpen(!open)}
      aria-label="Opciones"
      aria-expanded={open}
      title="Opciones"
      data-testid="options-button"
      data-hud-block=""
    >
      <Settings size={20} />
      <span className="hud-options__label" aria-hidden="true">
        Opciones
      </span>
    </button>
  );
}

// §20.3: la descripción de «Libre» en táctil no habla de teclas
const CAMERA: { mode: CameraMode; name: string; desk: string; touch: string; Icon: typeof Recenter }[] = [
  { mode: 'centered', name: 'Centrada', desk: 'La cámara sigue siempre a tu barco, como antes.', touch: 'La cámara sigue siempre a tu barco, como antes.', Icon: Recenter },
  { mode: 'free', name: 'Libre', desk: 'Mueve la vista arrastrando o con las teclas de la vista. Centrar vuelve al barco.', touch: 'Arrastra para mover la vista. Centrar vuelve al barco.', Icon: Move }
];

// Una fila de §20.4 y, debajo, su aviso. Estados: espera, intercambio (las 2 filas), rechazo (la tecla pulsada en rojo,
// AC-208) o en reposo. El aviso dura hasta la siguiente acción en el panel o hasta cerrarlo (AC-209)
function KeyRow({ action }: { action: Bindable }) {
  const code = useOptions((s) => s.keys[action]);
  const waiting = useOptions((s) => s.waiting === action);
  const notice = useOptions((s) => (s.notice && (s.notice.action === action || (s.notice.kind === 'swap' && s.notice.other === action)) ? s.notice : null));
  const layout = useOptions((s) => s.layout);
  const startWait = useOptions((s) => s.startWait);
  const mine = notice?.action === action;
  const state = waiting ? 'waiting' : notice?.kind === 'swap' ? 'swapped' : mine ? 'rejected' : 'idle';
  return (
    <>
      <div className="options__row" data-state={state} data-testid={`key-row-${action}`}>
        <span className="options__action">{ACTION_NAMES[action]}</span>
        <button
          type="button"
          className="options__key"
          onClick={() => startWait(action)}
          data-testid={`key-${action}`}
          data-code={code}
          aria-label={`${ACTION_NAMES[action]}: ${keyText(code, layout)}. Cambiar`}
        >
          {waiting ? 'Pulsa una tecla…' : state === 'rejected' && notice && notice.kind !== 'swap' ? notice.label : <KeyCap code={code} />}
        </button>
      </div>
      {waiting && (
        <p className="options__note" data-kind="wait" data-testid="options-wait-note">
          Esc cancela.
        </p>
      )}
      {mine && notice && (
        <p className="options__note" role="status" data-kind={notice.kind} data-testid="options-notice">
          {noticeText(notice, layout)}
        </p>
      )}
    </>
  );
}

export function OptionsPanel() {
  const open = useOptions((s) => s.open);
  const camera = useOptions((s) => s.camera);
  const setOpen = useOptions((s) => s.setOpen);
  const setCamera = useOptions((s) => s.setCamera);
  const reset = useOptions((s) => s.reset);
  const layout = useHudLayout();
  const fine = useFinePointer();
  if (!open) return null;
  const desk = layout === 'desktop';
  // Un clic o un toque fuera solo cierra el panel: el velo, transparente, lo recibe entero, así que no navega ni
  // selecciona (AC-205). Es un diálogo no modal: no atrapa el foco, porque las teclas del juego siguen activas (§20.2)
  return (
    <div className="options-scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)} data-testid="options-scrim">
      <section className="options" role="dialog" aria-label="Opciones" data-testid="options-panel">
        <header className="options__head">
          <h2 className="options__title">{layout === 'landscape' ? 'Opciones · Cámara' : 'Opciones'}</h2>
          <button type="button" className="options__close" onClick={() => setOpen(false)} aria-label="Cerrar (Esc)" data-testid="options-close">
            <Close size={desk ? 18 : 22} />
          </button>
        </header>
        {layout !== 'landscape' && <h3 className="options__heading">Cámara</h3>}
        <div className="options__cameras" role="radiogroup" aria-label="Cámara">
          {CAMERA.map(({ mode, name, desk: deskText, touch, Icon }) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={camera === mode}
              className="options__camera"
              onClick={() => setCamera(mode)}
              data-testid={`camera-${mode}`}
            >
              <span className="options__camera-icon">
                <Icon size={desk ? 24 : 26} />
              </span>
              <span className="options__camera-name">{name}</span>
              <span className="options__radio" aria-hidden="true" />
              <span className="options__camera-text">{desk ? deskText : touch}</span>
            </button>
          ))}
        </div>
        {desk && fine && (
          <div className="options__keys" data-testid="options-keys">
            <h3 className="options__heading options__heading--keys">Teclas</h3>
            <p className="options__hint">Haz clic en una tecla para cambiarla.</p>
            <div className="options__group">
              <h4 className="options__group-name">Vista</h4>
              <span className="options__group-note" data-testid="options-free-only">
                Solo con la cámara Libre
              </span>
            </div>
            {[...VIEW_ACTIONS, 'center' as const].map((a) => (
              <KeyRow key={a} action={a} />
            ))}
            <div className="options__group options__group--ship">
              <h4 className="options__group-name">Barco</h4>
            </div>
            <KeyRow action="stop" />
            <button type="button" className="options__reset" onClick={reset} data-testid="options-reset">
              Restablecer
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

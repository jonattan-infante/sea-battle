'use client';

import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA, LIGHTING, PALETTE } from '../../client/art';
import { GameRuntime } from '../../client/runtime';
import World from './World';

export interface GameCanvasProps {
  runtime: GameRuntime;
  onWaterClick: (x: number, z: number) => void;
  onShipClick: (id: string) => void;
  onShipDoubleClick: (id: string) => void;
}

const DOUBLE_CLICK_MS = 350;
const WHEEL_STEP = 40; // px acumulados por nivel de zoom (trackpads emiten deltas pequeños)
const WHEEL_COOLDOWN_MS = 220;
const PINCH_IN = 1.25;
const PINCH_OUT = 0.8;
const HOVER_MS = 1000 / 30;
// Cursores de ART-DIRECTION §12.7 (clases en src/styles/world-overlays.css)
const CURSOR_ATTACK = 'wo-cursor-attack';
const CURSOR_BLOCKED = 'wo-cursor-blocked';

// Orquesta cada frame antes del render: interpolación → cámara → barcos → VFX → capas DOM
function FrameDriver({ runtime }: { runtime: GameRuntime }) {
  useFrame((state, dt) => runtime.frame(state, dt), -1);
  return null;
}

export default function GameCanvas({ runtime, onWaterClick, onShipClick, onShipDoubleClick }: GameCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onWaterClick, onShipClick, onShipDoubleClick });
  handlers.current = { onWaterClick, onShipClick, onShipDoubleClick };

  // Entrada: picking en pantalla, marcador local inmediato, zoom por niveles y sin scroll ni zoom de página
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const touches = new Map<number, { x: number; y: number }>();
    let tap: { x: number; y: number } | null = null;
    let pinchBase = 0;
    let pinched = false;
    let lastShip = { id: '', t: 0 };
    let hoverAt = 0;
    let cursor = '';
    let wheelAcc = 0;
    let wheelAt = 0;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const setCursor = (value: string) => {
      if (value === cursor) return;
      if (cursor) el.classList.remove(cursor);
      if (value) el.classList.add(value);
      cursor = value;
    };
    const act = (x: number, y: number, touch: boolean) => {
      const id = runtime.pick(x, y, touch);
      const now = performance.now();
      if (id) {
        if (lastShip.id === id && now - lastShip.t < DOUBLE_CLICK_MS) {
          lastShip = { id: '', t: 0 };
          handlers.current.onShipDoubleClick(id);
        } else {
          lastShip = { id, t: now };
          handlers.current.onShipClick(id);
        }
        return;
      }
      const w = runtime.screenToWorld(x, y);
      if (!w) return;
      runtime.placeClickMarker(w.x, w.z); // local, antes de la respuesta del servidor (AC-14)
      handlers.current.onWaterClick(w.x, w.z);
    };
    const pinchDistance = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    // Vista libre (E13, GDD §5): pulsar y arrastrar más de 12 px desplaza la vista; soltar antes es un clic, que navega o
    // selecciona al soltar (con ratón, antes se hacía al pulsar). Dos dedos son zoom, nunca desplazamiento
    const view = runtime.freeView;
    const toWorld = (dx: number, dy: number) => runtime.screenDeltaToWorld(dx, dy);
    let mouseDown = false;
    // Un PointerEvent sintético (los e2e de AC-14 y AC-136) no es un puntero activo y setPointerCapture lanzaría
    const capture = (e: PointerEvent) => {
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // sin captura: el arrastre funciona igual mientras el puntero siga sobre el lienzo
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        mouseDown = true;
        view.pointerDown(p.x, p.y);
        capture(e);
        return;
      }
      touches.set(e.pointerId, p);
      capture(e);
      if (touches.size === 1) {
        tap = p;
        pinched = false;
        view.pointerDown(p.x, p.y);
      } else if (touches.size === 2) {
        pinchBase = pinchDistance();
        pinched = true;
        tap = null;
        view.cancelPress();
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType === 'mouse') {
        if (mouseDown && view.pointerMove(p.x, p.y, toWorld, performance.now())) return;
        const now = performance.now();
        if (now - hoverAt < HOVER_MS) return;
        hoverAt = now;
        const id = runtime.updateHover(p.x, p.y);
        setCursor(id ? (runtime.canAttack(id) ? CURSOR_ATTACK : CURSOR_BLOCKED) : '');
        return;
      }
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, p);
      if (touches.size === 1 && !pinched && view.pointerMove(p.x, p.y, toWorld, performance.now())) tap = null;
      if (touches.size === 2 && pinchBase > 0) {
        const ratio = pinchDistance() / pinchBase;
        if (ratio > PINCH_IN) {
          runtime.zoomBy(-1);
          pinchBase = pinchDistance();
        } else if (ratio < PINCH_OUT) {
          runtime.zoomBy(1);
          pinchBase = pinchDistance();
        }
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType === 'mouse') {
        if (e.button !== 0 || !mouseDown) return;
        mouseDown = false;
        if (view.pointerUp() === 'click') act(p.x, p.y, false);
        return;
      }
      touches.delete(e.pointerId);
      if (touches.size === 0) {
        if (view.pointerUp() === 'click' && tap && !pinched) act(p.x, p.y, true);
        tap = null;
        pinched = false;
        pinchBase = 0;
      }
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') mouseDown = false;
      view.cancelPress();
      touches.delete(e.pointerId);
      if (touches.size === 0) {
        tap = null;
        pinched = false;
      }
    };
    const onPointerLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      runtime.clearHover();
      setCursor('');
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      if (now - wheelAt < WHEEL_COOLDOWN_MS) return;
      wheelAcc += delta;
      if (Math.abs(wheelAcc) >= WHEEL_STEP) {
        runtime.zoomBy(wheelAcc > 0 ? 1 : -1); // rueda hacia abajo = más lejos
        wheelAcc = 0;
        wheelAt = now;
      }
    };
    const prevent = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchmove', prevent, { passive: false });
    el.addEventListener('gesturestart', prevent);
    el.addEventListener('contextmenu', prevent);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', prevent);
      el.removeEventListener('gesturestart', prevent);
      el.removeEventListener('contextmenu', prevent);
    };
  }, [runtime]);

  // Las capas DOM de placas y números las monta GameApp encima (pointer-events: none) y las conecta attachOverlays
  return (
    <div
      ref={wrapRef}
      data-testid="game-canvas"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {/* flat = sin tone mapping (D2). alpha: false solo fija el alfa de borrado en 1: three r180 crea el contexto
          siempre con alfa (WebGLRenderer.js:345); lo que deja el alfa del framebuffer en 1 son blendSrcAlpha y
          blendDstAlpha de las capas con CustomBlending (VFX §0.2). El renderer es el mismo que R3F crea con el objeto
          de props (new WebGLRenderer({ ...defaults, ...gl })); se crea aquí para avisar al runtime si no hay WebGL:
          sin frames, la entrada no se abriría nunca y la portada debe irse, como en la 1.0.3 (AC-193 c). stencil: la sombra
          en el agua de los GLB oscurece cada píxel una sola vez (ship-shadow.ts); three r180 no lo pide por defecto */}
      <Canvas
        orthographic
        flat
        dpr={runtime.mobile ? LIGHTING.dprMobile : LIGHTING.dprDesktop}
        gl={(defaults) => {
          try {
            return new THREE.WebGLRenderer({ ...defaults, antialias: true, alpha: false, stencil: true, powerPreference: 'high-performance' });
          } catch (e) {
            runtime.rendererFailed();
            throw e;
          }
        }}
        camera={{ near: CAMERA.near, far: CAMERA.far, zoom: 5, position: [0, CAMERA.distance * Math.sin(CAMERA.elevation), CAMERA.distance * Math.cos(CAMERA.elevation)] }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = false;
          gl.setClearColor(PALETTE.oceanEdge);
        }}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      >
        <FrameDriver runtime={runtime} />
        <World runtime={runtime} />
      </Canvas>
    </div>
  );
}

'use client';
import { useSyncExternalStore } from 'react';

// Disposición del HUD: los mismos cortes que globals.css (§12.1–12.3). Decide los tamaños de las insignias (24 o 18 px en
// el panel, 16 o 12 en el objetivo) y dónde va el nivel. Solo cambia al girar o redimensionar la ventana
export type HudLayout = 'desktop' | 'portrait' | 'landscape';
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

export function useHudLayout(): HudLayout {
  return useSyncExternalStore(subscribeLayout, readLayout, () => 'desktop');
}

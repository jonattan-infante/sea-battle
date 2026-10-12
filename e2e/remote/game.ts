// Pasos comunes de los specs remotos: entrar al juego del despliegue con la sesión del usuario de prueba y leer su
// progreso (los 4 campos de AC-97) del cliente, sin depender de la UI
import { expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { PlayerShipClass } from '../../src/game/constants';
import type { Upgrades } from '../../src/game/types';
import type { Health } from '../../server/health';
import { notVerified } from './env';

export interface Progress {
  gold: number;
  upgrades: Upgrades;
  ownedShips: PlayerShipClass[];
  activeShip: PlayerShipClass;
}

type ClientView = { client: { welcome: { playerId: string } | null; player: (Progress & { id: string }) | null; moveTo: (x: number, z: number) => void } };

// /game con la sesión de .auth/ → puente de depuración → ready(). Sin el puente no se puede medir (NO VERIFICADO); que
// no llegue a ready() es un fallo del despliegue
export async function enterRemoteGame(page: Page): Promise<{ playerId: string; seconds: number }> {
  const t0 = Date.now();
  await page.goto('/game');
  return waitForGame(page, t0);
}

// Tras page.goto('/game') o page.reload()
export async function waitForGame(page: Page, t0 = Date.now()): Promise<{ playerId: string; seconds: number }> {
  await expect(page, 'sin sesión, /game redirige al inicio de sesión').toHaveURL(/\/game(\?|$)/);
  await page.waitForFunction(() => window.__SEA_BATTLE__ !== undefined, null, { timeout: 30_000 }).catch(() => {
    throw notVerified('el build no expone window.__SEA_BATTLE__ (el puente de depuración que leen los arneses)');
  });
  await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true && !!window.__SEA_BATTLE__.player(), null, { timeout: 60_000 });
  const playerId = await page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as ClientView).client.welcome?.playerId ?? '');
  return { playerId, seconds: (Date.now() - t0) / 1000 };
}

export async function health(url: URL): Promise<Health> {
  const res = await fetch(new URL('/healthz', url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Health;
}

export function readProgress(page: Page): Promise<Progress> {
  return page.evaluate(() => {
    const p = (window.__SEA_BATTLE__!.runtime() as unknown as ClientView).client.player!;
    return { gold: p.gold, upgrades: { ...p.upgrades }, ownedShips: [...p.ownedShips].sort(), activeShip: p.activeShip };
  });
}

export const formatProgress = (p: Progress) =>
  `oro ${p.gold} · mejoras ${Object.entries(p.upgrades).map(([k, v]) => `${k} ${v}`).join(', ')} · barcos ${p.ownedShips.join('+')} · activo ${p.activeShip}`;

// Navegar con la API del cliente: solo para preparar el escenario, nunca para el gesto que evalúa el AC
export const moveTo = (page: Page, x: number, z: number) =>
  page.evaluate(([px, pz]) => (window.__SEA_BATTLE__!.runtime() as unknown as ClientView).client.moveTo(px, pz), [x, z]);

// Percentil por rango más cercano: con 30 muestras, el p95 es la 29.ª de menor a mayor
export function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

// Los logs y los registros llevan solo los 6 últimos caracteres del id del usuario de Clerk (regla de Jonattan)
export function shortId(id: string): string {
  return id.startsWith('user_') ? `user_…${id.slice(-6)}` : id;
}

// Registro de cada corrida en qa-artifacts/remote/ (ignorado por git), con el host y el commit medidos
export function saveRun(name: string, host: string, data: unknown): string {
  const dir = path.join(__dirname, '..', '..', 'qa-artifacts', 'remote');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${host.replace(/[^a-z0-9.-]/gi, '_')}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

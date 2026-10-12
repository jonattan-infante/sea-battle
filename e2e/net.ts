// Lectura de los frames de Socket.IO que captura trackSocket: intenciones enviadas, eventos y snapshots recibidos
import type { Page } from '@playwright/test';
import type { GameEvent, ServerFrame } from '../src/game/types';
import type { trackSocket } from './helpers';

export type Net = ReturnType<typeof trackSocket>;

function decode(payload: string): [string, unknown] | null {
  try {
    const msg = JSON.parse(payload.slice(2)) as unknown;
    return Array.isArray(msg) && typeof msg[0] === 'string' ? [msg[0], msg[1]] : null;
  } catch {
    return null;
  }
}

// Intenciones enviadas, en orden: [{ name: 'attack', data: { targetId } }, ...]
export function intents(net: Net): { name: string; data: unknown }[] {
  return net.sent.flatMap((p) => {
    const m = decode(p);
    return m ? [{ name: m[0], data: m[1] }] : [];
  });
}

export const intentNames = (net: Net) => intents(net).map((i) => i.name);

export function frames(net: Net): ServerFrame[] {
  return net.received.flatMap((p) => {
    const m = decode(p);
    return m && m[0] === 'frame' ? [m[1] as ServerFrame] : [];
  });
}

export const events = (net: Net): GameEvent[] => frames(net).flatMap((f) => f.e ?? []);

// Andanadas disparadas por un barco
export const volleysBy = (net: Net, shipId: string) => events(net).filter((e) => e.type === 'volley' && e.shipId === shipId);

// Último nombre visto en los snapshots para un barco
export function shipName(net: Net, shipId: string): string | null {
  let name: string | null = null;
  for (const f of frames(net)) for (const s of f.s ?? []) if (s.id === shipId && typeof s.n === 'string') name = s.n;
  return name;
}

// Navega con la API del cliente: solo para preparar el escenario, nunca para el gesto que evalúa el AC
export const sailTo = (page: Page, x: number, z: number) =>
  page.evaluate(([px, pz]) => {
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
    rt.client.moveTo(px, pz);
  }, [x, z]);

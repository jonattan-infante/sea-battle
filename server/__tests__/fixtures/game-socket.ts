// Cliente socket.io de prueba para los tests de persistencia: se une a la partida y acumula frames, vista y avisos
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { C2S, S2C } from '../../../src/game/protocol';
import { Notice, PlayerView, ServerFrame, Welcome } from '../../../src/game/types';

export interface Joined {
  c: ClientSocket;
  welcome: Welcome;
  frames: ServerFrame[];
  me: () => PlayerView; // la última vista privada recibida
  notices: () => Notice[];
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Espera a que se cumpla la condición; si no llega en el plazo, falla con la descripción
export async function waitFor(cond: () => boolean | Promise<boolean>, timeoutMs: number, what = 'la condición'): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error(`No se cumplió ${what} en ${timeoutMs} ms`);
    await sleep(10);
  }
}

export function connectGame(url: string, auth: Record<string, unknown>): ClientSocket {
  return ioClient(url, { transports: ['websocket'], reconnection: false, auth });
}

export async function joinGame(url: string, auth: Record<string, unknown>, name?: string, sockets?: ClientSocket[]): Promise<Joined> {
  const c = connectGame(url, auth);
  sockets?.push(c);
  const frames: ServerFrame[] = [];
  c.on(S2C.frame, (f: ServerFrame) => frames.push(f));
  await new Promise<void>((resolve, reject) => {
    c.once('connect', () => resolve());
    c.once('connect_error', reject);
  });
  const welcome = await new Promise<Welcome>((resolve) => {
    c.once(S2C.welcome, resolve);
    c.emit(C2S.join, name ? { name } : {});
  });
  const me = () => {
    for (let i = frames.length - 1; i >= 0; i--) if (frames[i].me) return frames[i].me!;
    throw new Error('Todavía no llegó la vista privada');
  };
  await waitFor(() => frames.some((f) => f.me), 3000, 'la primera vista privada');
  return { c, welcome, frames, me, notices: () => frames.flatMap((f) => f.n ?? []) };
}

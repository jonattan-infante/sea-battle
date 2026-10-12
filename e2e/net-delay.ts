// Retardo de red simulado en la página (AC-125): retrasa cada mensaje del WebSocket del juego `ms` en cada sentido,
// sin cambiar el orden. El throttling de CDP no retrasa los frames de un WebSocket ya abierto, así que se hace aquí,
// sin tocar el servidor. Cambia el retardo solo con la red en reposo: si no, los mensajes pendientes se reordenarían.
import type { Page } from '@playwright/test';

export async function installNetDelay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __NET_DELAY_MS__: number };
    w.__NET_DELAY_MS__ = 0;
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      private handler: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        const ms = w.__NET_DELAY_MS__;
        if (ms <= 0) return super.send(data);
        setTimeout(() => {
          if (this.readyState === Native.OPEN) super.send(data);
        }, ms);
      }
      get onmessage() {
        return this.handler;
      }
      set onmessage(fn: ((this: WebSocket, ev: MessageEvent) => unknown) | null) {
        this.handler = fn;
        super.onmessage = fn
          ? (ev: MessageEvent) => {
              const ms = w.__NET_DELAY_MS__;
              if (ms <= 0) fn.call(this, ev);
              else setTimeout(() => fn.call(this, ev), ms);
            }
          : null;
      }
    };
  });
}

export const setNetDelay = (page: Page, ms: number) =>
  page.evaluate((v) => ((window as unknown as { __NET_DELAY_MS__: number }).__NET_DELAY_MS__ = v), ms);

import { expect, Page } from '@playwright/test';

export interface DebugShip {
  id: string;
  kind: 'player' | 'pirate' | 'merchant';
  classId: string;
  name: string;
  x: number;
  z: number;
  heading: number;
  hp: number;
  maxHp: number;
  state: 'alive' | 'sinking' | 'dead';
  targetId: string | null;
  protectedUntil: number;
  screen: { sx: number; sy: number } | null;
}

// Cuenta commits de React con un hook de DevTools inyectado antes de cargar la página (AC-83/84/85)
export async function installCommitCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __COMMITS__: number; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown };
    w.__COMMITS__ = 0;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      isDisabled: false,
      renderers: new Map(),
      inject: () => 1,
      onCommitFiberRoot: () => {
        w.__COMMITS__++;
      },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {}
    };
  });
}

export const commits = (page: Page) => page.evaluate(() => (window as unknown as { __COMMITS__: number }).__COMMITS__);

// Mensajes de Socket.IO de juego ("42[...]"); el ping/pong de Engine.IO ("2"/"3") queda fuera (AC-86)
export function trackSocket(page: Page) {
  const sent: string[] = [];
  const received: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      const p = String(f.payload);
      if (p.startsWith('42')) sent.push(p);
    });
    ws.on('framereceived', (f) => {
      const p = String(f.payload);
      if (p.startsWith('42')) received.push(p);
    });
  });
  return { sent, received, reset: () => ((sent.length = 0), (received.length = 0)) };
}

export async function enterGame(page: Page, base = ''): Promise<void> {
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  (page as unknown as { __dialogs: string[] }).__dialogs = dialogs;
  await page.goto(`${base}/game`);
  await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 30_000 });
}

export const dialogsOf = (page: Page): string[] => (page as unknown as { __dialogs?: string[] }).__dialogs ?? [];

export const me = (page: Page) => page.evaluate(() => window.__SEA_BATTLE__!.me() as DebugShip | null);
export const ships = (page: Page) => page.evaluate(() => window.__SEA_BATTLE__!.ships() as DebugShip[]);
export const hud = (page: Page) => page.evaluate(() => window.__SEA_BATTLE__!.hud() as Record<string, unknown>);
export const renderInfo = (page: Page) => page.evaluate(() => window.__SEA_BATTLE__!.renderInfo() as { calls: number; triangles: number });

// Clic en el agua a una distancia del barco propio (en píxeles de pantalla)
export async function clickWater(page: Page, dx: number, dy: number): Promise<void> {
  const ship = await me(page);
  expect(ship?.screen).toBeTruthy();
  await page.mouse.click(ship!.screen!.sx + dx, ship!.screen!.sy + dy);
}

export async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 10_000, stepMs = 100): Promise<T> {
  const end = Date.now() + timeoutMs;
  let v = await fn();
  while (!ok(v)) {
    if (Date.now() > end) throw new Error(`waitFor: tiempo agotado; último valor ${JSON.stringify(v)?.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, stepMs));
    v = await fn();
  }
  return v;
}

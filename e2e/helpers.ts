import { expect, Page } from '@playwright/test';
import { DEFAULT_BINDINGS, Bindings } from '../src/client/key-bindings';
import { CameraMode, OPTIONS_KEY, serializeOptions } from '../src/client/options';

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
  repairing: boolean;
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

// Opciones de cámara y teclas de E18, que viven en el navegador (AC-207): se escriben antes de cada carga de la página,
// como si el jugador las hubiera elegido. La cámara por defecto es «Centrada»; las pruebas de la vista libre (E13)
// eligen «Libre». No sirve para probar la recarga, porque las vuelve a escribir en cada una
export async function presetOptions(page: Page, camera: CameraMode, keys: Bindings = DEFAULT_BINDINGS): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // sin almacenamiento, la página arranca con las de por defecto
      }
    },
    [OPTIONS_KEY, serializeOptions({ camera, keys })] as const
  );
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

// El GLB de la Balandra en el manifiesto antes de entrar (AC-193). GameApp asigna window.__SEA_BATTLE__ en el efecto que
// sigue a crear el runtime, antes de que llegue la bienvenida y del primer frame: la trampa pone ahí la URL, como si
// viniera en SHIP_GLB. El barco del invitado es la Balandra
// waitMs alarga el tope cuando lo que se prueba es la espera: en SwiftShader, el primer frame (que compila los shaders)
// puede durar más de 0,5 s y abriría la entrada por el tope aunque el GLB llegase a tiempo en una GPU
export const glbBeforeEntry = (page: Page, url: string, waitMs?: number) =>
  page.addInitScript(
    ([u, ms]) => {
      let debug: unknown;
      Object.defineProperty(window, '__SEA_BATTLE__', {
        configurable: true,
        get: () => debug,
        set: (v: { runtime(): unknown }) => {
          if (!debug) {
            const rt = v.runtime() as { useShipGlb(c: string, url: string): void; entry: { waitMs: number } };
            rt.useShipGlb('sloop', u);
            if (ms) rt.entry.waitMs = ms;
          }
          debug = v;
        }
      });
    },
    [url, waitMs ?? 0] as const
  );

// La entrada (EntryGate): primer frame, último frame que esperó, frame en que se mostró, con qué modelo y si fue por el
// tope (el del barco propio, el del puerto o el de la bienvenida, AC-200 e), el instante de la bienvenida; y si la portada
// «Izando velas…» ya no tapa el juego
export const entryOf = (page: Page) =>
  page.evaluate(() => {
    type Entry = { firstFrameAt: number; lastWaitAt: number; shownAt: number; withGlb: boolean; capped: boolean; portCapped: boolean; welcomeCapped: boolean; welcomeAt: number };
    const e = (window.__SEA_BATTLE__!.runtime() as unknown as { entry: Entry }).entry;
    const cover = document.querySelector<HTMLElement>('.game-root > [data-testid="loading"]');
    return {
      firstFrameAt: e.firstFrameAt,
      lastWaitAt: e.lastWaitAt,
      shownAt: e.shownAt,
      withGlb: e.withGlb,
      capped: e.capped,
      portCapped: e.portCapped,
      welcomeCapped: e.welcomeCapped,
      welcomeAt: e.welcomeAt,
      coverHidden: !!cover && cover.hidden
    };
  });

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

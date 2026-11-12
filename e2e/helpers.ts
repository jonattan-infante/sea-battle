import { expect, Page } from '@playwright/test';
import { DEFAULT_BINDINGS, Bindings } from '../src/client/key-bindings';
import { CameraMode, OPTIONS_KEY, serializeOptions } from '../src/client/options';
import { MOORING_AXIS, MOORINGS_1_1, PORT_SHAPE_1_1, SHIP_CLASSES, navClearance } from '../src/game/constants';
import { segmentPointDistance } from '../src/game/nav';

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
  // 120 s y no 30: con el mapa 1.1 y varias páginas abiertas, el WebGL por CPU de la CI tarda 25–42 s en entrar desde la
  // 2.ª página (QA-75 H-1). Ningún AC mide la entrada con este tope: eso es AC-193 (c)
  await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 120_000 });
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
// tope; y si la portada «Izando velas…» ya no tapa el juego
export const entryOf = (page: Page) =>
  page.evaluate(() => {
    type Entry = { firstFrameAt: number; lastWaitAt: number; shownAt: number; withGlb: boolean; capped: boolean };
    const e = (window.__SEA_BATTLE__!.runtime() as unknown as { entry: Entry }).entry;
    const cover = document.querySelector<HTMLElement>('.game-root > [data-testid="loading"]');
    return { firstFrameAt: e.firstFrameAt, lastWaitAt: e.lastWaitAt, shownAt: e.shownAt, withGlb: e.withGlb, capped: e.capped, coverHidden: !!cover && cover.hidden };
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

// AC-176 con el puerto de D92 (BACKLOG :1621, «Con el puerto con forma de isla»): el barco propio está en uno de los 12
// amarres (Q y ψ de MOORINGS_1_1), con el centro a L/2 + 2 m (±0,5) de Q a lo largo de ψ, la proa según ψ, hacia fuera
// (±5°), el amarre libre (ningún otro barco vivo con el centro a < 12 m de su eje, de Q a Q + 46 m en ψ) y el casco (de proa
// a popa, sin bauprés, como AC-20) sin tocar ningún círculo del puerto. Lo usan el e2e de AC-176 (spawn-mooring.spec.ts) y la
// reaparición de AC-63 y AC-101 (gameplay.spec.ts)
export interface MooringCheck {
  amarre: number; // 1–12, el más cercano al barco
  off: number; // m del centro del barco a Q + (L/2 + 2) en ψ
  turnDeg: number; // grados de la proa a ψ
  blockers: string[]; // otros barcos vivos en el eje de ese amarre
  hullOnPort: string[]; // círculos del puerto que toca el casco
}

const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function mooringOf(self: DebugShip, others: DebugShip[]): MooringCheck {
  const spots = MOORINGS_1_1.map((m, k) => {
    const psi = (m.psiDeg * Math.PI) / 180;
    const f = { x: Math.sin(psi), z: Math.cos(psi) };
    const d = navClearance(self.classId);
    const end = { x: m.x + f.x * MOORING_AXIS.length, z: m.z + f.z * MOORING_AXIS.length };
    return {
      amarre: k + 1,
      off: Math.hypot(self.x - (m.x + f.x * d), self.z - (m.z + f.z * d)),
      turnDeg: (angleBetween(self.heading, psi) * 180) / Math.PI,
      blockers: others.filter((s) => s.id !== self.id && s.state === 'alive' && segmentPointDistance({ x: m.x, z: m.z }, end, { x: s.x, z: s.z }) < MOORING_AXIS.freeRadius).map((s) => s.id)
    };
  });
  const best = spots.reduce((a, b) => (b.off < a.off ? b : a));
  const half = SHIP_CLASSES[self.classId].length / 2;
  const bow = { x: self.x + Math.sin(self.heading) * half, z: self.z + Math.cos(self.heading) * half };
  const stern = { x: self.x - Math.sin(self.heading) * half, z: self.z - Math.cos(self.heading) * half };
  const hullOnPort = PORT_SHAPE_1_1.circles.map((c, k) => ({ k, touch: segmentPointDistance(bow, stern, c) < c.radius - 1e-6 })).filter((c) => c.touch).map((c) => `PORT.${c.k}`);
  return { ...best, hullOnPort };
}

// Lee el barco propio y los demás, lo deja en el log y aserta AC-176 de una vez, para que el fallo enseñe todas las partes
export async function expectMoored(page: Page, label: string): Promise<MooringCheck> {
  const self = (await me(page))!;
  const check = mooringOf(self, await ships(page));
  const m = MOORINGS_1_1[check.amarre - 1];
  console.log(
    `AC-176 (${label}): ${self.classId} en (${self.x.toFixed(2)}, ${self.z.toFixed(2)}), rumbo ${((self.heading * 180) / Math.PI).toFixed(1)}° · amarre ${check.amarre} (Q (${m.x}, ${m.z}), ψ ${m.psiDeg}°): ` +
      `a ${check.off.toFixed(3)} m de Q + ${navClearance(self.classId)} m en ψ, ${check.turnDeg.toFixed(2)}° de ψ · barcos en su eje ${JSON.stringify(check.blockers)} · casco sobre ${JSON.stringify(check.hullOnPort)}`
  );
  expect({ amarre: check.amarre, aMenosDe05m: check.off <= 0.5, proaSegunPsi5g: check.turnDeg <= 5, ejeLibre: check.blockers, cascoSobreElPuerto: check.hullOnPort }).toEqual({
    amarre: check.amarre,
    aMenosDe05m: true,
    proaSegunPsi5g: true,
    ejeLibre: [],
    cascoSobreElPuerto: []
  });
  return check;
}

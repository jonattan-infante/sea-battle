// Vista libre (E13, GDD §5): AC-116 arrastre y clic (ratón y un dedo), AC-117 minimapa, AC-118 flechas, AC-119 vuelta al
// seguimiento (C, daño, muerte y reaparición), AC-120 clic lejos y límite del mapa, AC-122 lo que se mira está vivo y
// AC-123 envíos del cliente. La máquina de estados la cubre src/client/__tests__/free-view.test.ts; aquí, la sesión real
import { expect, Page, test } from '@playwright/test';
import { io, Socket } from 'socket.io-client';
import { MAP_HALF_SIZE } from '../src/game/constants';
import { C2S, S2C } from '../src/game/protocol';
import type { ServerFrame, ShipSnapshot } from '../src/game/types';
import { EDGE_ATTACK, VIEW_RETURN } from '../server/scenarios';
import { enterGame, hud, me, trackSocket, waitFor } from './helpers';
import { intents } from './net';
import { startOwnServer } from './own-server';

type Point = { x: number; z: number };

const camera = (page: Page) =>
  page.evaluate(() => {
    const rt = window.__SEA_BATTLE__!.runtime();
    return { mode: rt.freeView.mode, x: rt.focusX, z: rt.focusZ, ppm: rt.ppm, sinT: rt.sinT, w: rt.viewW, h: rt.viewH };
  });
const sentOf = (net: ReturnType<typeof trackSocket>, name: string) => intents(net).filter((i) => i.name === name);

// Un punto de agua lejos del barco y del HUD: a la derecha y un poco abajo del centro (la mitad derecha no tiene paneles
// entre y = 280 y la barra de acciones)
const waterPoint = async (page: Page) => {
  const c = await camera(page);
  return { x: c.w / 2 + 220, y: c.h / 2 + 60 };
};

// Centra la vista con el minimapa en un punto del mundo (AC-117), en coordenadas del canvas del minimapa
async function minimapCenter(page: Page, p: Point): Promise<void> {
  const box = (await page.getByTestId('minimap').locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + ((p.x + MAP_HALF_SIZE) / (2 * MAP_HALF_SIZE)) * box.width, box.y + ((p.z + MAP_HALF_SIZE) / (2 * MAP_HALF_SIZE)) * box.height);
}

// Pulsa una tecla desde la página y, desde ese instante, mira en cada frame si el barco propio está en el 10 % central
// (AC-23): los ms hasta el primer frame dentro y si siguió dentro en todos los siguientes, durante `ms`
const pressAndWatchCentred = (page: Page, code: string, ms: number) =>
  page.evaluate(
    ([key, windowMs]) =>
      new Promise<{ firstInMs: number | null; stayed: boolean; mode: string }>((resolve) => {
        const t0 = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: key }));
        let firstInMs: number | null = null;
        let stayed = true;
        const tick = () => {
          const dbg = window.__SEA_BATTLE__!;
          const s = dbg.me() as { x: number; z: number } | null;
          const p = s && dbg.runtime().project(s.x, s.z);
          const inside = !!p && Math.abs(p.sx - innerWidth / 2) <= 0.05 * innerWidth && Math.abs(p.sy - innerHeight / 2) <= 0.05 * innerHeight;
          const t = performance.now() - t0;
          if (inside && firstInMs === null) firstInMs = t;
          if (!inside && firstInMs !== null) stayed = false;
          if (t < windowMs) requestAnimationFrame(tick);
          else resolve({ firstInMs, stayed, mode: dbg.runtime().freeView.mode });
        };
        requestAnimationFrame(tick);
      }),
    [code, ms] as const
  );

test.describe('Vista libre (E13)', () => {
  test('AC-116: arrastrar más de 12 px desplaza la vista con el puntero y no envía ningún moveTo; soltar antes navega con 1', async ({ page }) => {
    const net = trackSocket(page); // antes de entrar: el WebSocket se abre al conectar y no se ve el que ya existe
    await enterGame(page);
    const start = await camera(page);
    const p = await waterPoint(page);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x - 124, p.y - 62, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const dragged = await camera(page);
    const want = { x: start.x + 124 / start.ppm, z: start.z + 62 / (start.ppm * start.sinT) };
    console.log(`AC-116 ratón: foco ${start.x.toFixed(1)}, ${start.z.toFixed(1)} → ${dragged.x.toFixed(1)}, ${dragged.z.toFixed(1)} (esperado ${want.x.toFixed(1)}, ${want.z.toFixed(1)}) · modo ${dragged.mode}`);
    expect(dragged.mode).toBe('free');
    expect(Math.abs(dragged.x - want.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(dragged.z - want.z)).toBeLessThanOrEqual(1);
    expect(sentOf(net, C2S.moveTo)).toHaveLength(0);

    // Un clic con 8 px de temblor sigue siendo un clic: exactamente 1 moveTo
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 8, p.y, { steps: 2 });
    await page.mouse.up();
    await waitFor(async () => sentOf(net, C2S.moveTo).length, (n) => n >= 1, 3000, 50);
    await page.waitForTimeout(200);
    expect(sentOf(net, C2S.moveTo)).toHaveLength(1);
  });

  test('AC-117: un clic en el minimapa centra la vista en ese punto (±5 m) sin enviar ningún moveTo', async ({ page }) => {
    const net = trackSocket(page); // antes de entrar: el WebSocket se abre al conectar y no se ve el que ya existe
    await enterGame(page);
    await minimapCenter(page, { x: 250, z: -250 });
    await page.waitForTimeout(200);
    const c = await camera(page);
    console.log(`AC-117: foco tras el clic en el minimapa ${c.x.toFixed(1)}, ${c.z.toFixed(1)} (punto 250, −250) · modo ${c.mode}`);
    expect(c.mode).toBe('free');
    expect(Math.hypot(c.x - 250, c.z + 250)).toBeLessThanOrEqual(5);
    expect(sentOf(net, C2S.moveTo)).toHaveLength(0);
  });

  test('AC-118: 2 s con una flecha pulsada mueven la vista 300 ±30 m; S detiene el barco y no mueve la vista', async ({ page }) => {
    const net = trackSocket(page); // antes de entrar: el WebSocket se abre al conectar y no se ve el que ya existe
    await enterGame(page);
    const start = await camera(page);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(100);
    const moved = await camera(page);
    const d = start.z - moved.z; // arriba en pantalla es −Z
    console.log(`AC-118: ${d.toFixed(1)} m hacia arriba en 2 s (en X ${(moved.x - start.x).toFixed(2)} m)`);
    expect(Math.abs(d - 300)).toBeLessThanOrEqual(30);
    expect(Math.abs(moved.x - start.x)).toBeLessThanOrEqual(1);
    await page.keyboard.press('KeyS');
    await page.waitForTimeout(300);
    const after = await camera(page);
    expect(sentOf(net, C2S.stop)).toHaveLength(1);
    expect(Math.hypot(after.x - moved.x, after.z - moved.z)).toBeLessThanOrEqual(0.5);
  });

  test('AC-119 (C): con C la cámara vuelve al barco en ≤ 300 ms y el barco queda en el 10 % central', async ({ page }) => {
    await enterGame(page);
    await minimapCenter(page, { x: -300, z: 300 });
    await page.waitForTimeout(200);
    expect((await camera(page)).mode).toBe('free');
    const r = await pressAndWatchCentred(page, 'KeyC', 800);
    console.log(`AC-119 (C): el barco entra en el 10 % central a los ${r.firstInMs?.toFixed(0)} ms y sigue dentro: ${r.stayed}; modo ${r.mode}`);
    expect(r.firstInMs).not.toBeNull();
    expect(r.firstInMs!).toBeLessThanOrEqual(300);
    expect(r.stayed).toBe(true);
    expect(r.mode).toBe('follow');
  });

  test('AC-120: a 400 m del barco, un clic en el agua navega hasta allí (1 moveTo) y el centro de la vista no sale de ±500 m', async ({ page }) => {
    const net = trackSocket(page); // antes de entrar: el WebSocket se abre al conectar y no se ve el que ya existe
    await enterGame(page);
    const ship = (await me(page))!;
    const far = { x: Math.max(-450, Math.min(450, ship.x + 400)), z: ship.z };
    await minimapCenter(page, far);
    await page.waitForTimeout(300);
    const c = await camera(page);
    const p = { x: c.w / 2 + 40, y: c.h / 2 + 40 };
    const target = await page.evaluate(([sx, sy]) => window.__SEA_BATTLE__!.runtime().screenToWorld(sx, sy)!, [p.x, p.y]);
    await page.mouse.click(p.x, p.y);
    await waitFor(async () => sentOf(net, C2S.moveTo).length, (n) => n >= 1, 3000, 50);
    await page.waitForTimeout(200);
    const sent = sentOf(net, C2S.moveTo);
    console.log(`AC-120: vista en ${c.x.toFixed(0)}, ${c.z.toFixed(0)} (barco en ${ship.x.toFixed(0)}, ${ship.z.toFixed(0)}) · moveTo ${JSON.stringify(sent.map((s) => s.data))} · punto ${target.x.toFixed(1)}, ${target.z.toFixed(1)}`);
    expect(Math.hypot(c.x - ship.x, c.z - ship.z)).toBeGreaterThanOrEqual(350);
    expect(sent).toHaveLength(1);
    const m = sent[0].data as Point;
    expect(Math.hypot(m.x - target.x, m.z - target.z)).toBeLessThanOrEqual(1);

    // Arrastrar más allá del borde: el centro se queda en ±MAP_HALF_SIZE
    await minimapCenter(page, { x: 480, z: 0 });
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowRight');
    const edge = await camera(page);
    console.log(`AC-120: con la flecha hacia el borde, el centro queda en ${edge.x.toFixed(1)}, ${edge.z.toFixed(1)}`);
    expect(edge.x).toBeLessThanOrEqual(MAP_HALF_SIZE);
    expect(edge.x).toBeGreaterThan(MAP_HALF_SIZE - 1);
  });

  test('AC-123: con la vista libre quieta, 10 s sin mensajes; arrastrando, ≤ 2 viewAt/s; al volver, 1 viewAt(null)', async ({ page }) => {
    test.setTimeout(60_000);
    const net = trackSocket(page); // antes de entrar: el WebSocket se abre al conectar y no se ve el que ya existe
    await enterGame(page);
    await minimapCenter(page, { x: 200, z: 200 });
    await page.waitForTimeout(800); // sale el viewAt del clic
    net.reset();
    await page.waitForTimeout(10_000);
    const still = intents(net);
    const p = await waterPoint(page);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    const t0 = Date.now();
    for (let i = 1; i <= 40; i++) {
      await page.mouse.move(p.x - i * 5, p.y - i * 2);
      await page.waitForTimeout(50);
    }
    await page.mouse.up();
    const dragMs = Date.now() - t0;
    await page.waitForTimeout(700); // el último centro pendiente
    const dragging = sentOf(net, C2S.viewAt);
    net.reset();
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(600);
    const back = intents(net);
    console.log(`AC-123: quieta ${still.length} mensajes en 10 s · arrastrando ${dragging.length} viewAt en ${dragMs} ms · al volver ${JSON.stringify(back)}`);
    expect(still).toEqual([]);
    expect(dragging.length).toBeGreaterThanOrEqual(2);
    expect(dragging.length).toBeLessThanOrEqual(Math.ceil(dragMs / 500) + 1);
    expect(back).toEqual([{ name: C2S.viewAt, data: null }]);
  });

  test('AC-119 (daño, muerte y reaparición): cada uno devuelve la cámara al barco en ≤ 300 ms @gpu', async ({ page }) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'view-return' });
    try {
      await enterGame(page, server.url);
      // Al borde de la zona segura, frente al pirata del escenario (32 m), y a por él: atacar quita la protección. Llegan
      // andanadas cada ~4,6 s: la 1.ª enseguida, la 2.ª daña y la 3.ª hunde (server/__tests__/scenarios.test.ts)
      const post = { x: 0, z: VIEW_RETURN.pirate.z - 32 };
      await page.evaluate(([x, z]) => window.__SEA_BATTLE__!.runtime().client.moveTo(x, z), [post.x, post.z]);
      await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - post.x, s.z - post.z) < 4, 30_000, 200);
      const hp0 = (await me(page))!.hp;
      await page.keyboard.press('Tab');
      await page.keyboard.press('Space');
      await waitFor(() => me(page), (s) => !!s && s.hp < hp0, 10_000, 50); // la 1.ª andanada, todavía en seguimiento

      // Entra en vista libre: con el minimapa si está a flote; hundido, el HUD no recibe el puntero y van las flechas
      const goFree = async () => {
        for (let i = 0; i < 5; i++) {
          const s = await me(page);
          if (s && s.state === 'alive') await minimapCenter(page, { x: -300, z: -300 });
          else {
            await page.keyboard.down('ArrowLeft');
            await page.waitForTimeout(300);
            await page.keyboard.up('ArrowLeft');
          }
          if ((await camera(page)).mode === 'free') return;
        }
        throw new Error('no entró en vista libre');
      };
      // Espera en el navegador a que el barco cumpla la condición y mide la vuelta desde ese frame
      type Cond = { kind: 'below'; hp: number } | { kind: 'down' } | { kind: 'alive' };
      const measure = (label: string, cond: Cond) =>
        page
          .evaluate(
            (c: Cond) =>
              new Promise<{ firstInMs: number | null; stayed: boolean; mode: string }>((resolve) => {
                const dbg = window.__SEA_BATTLE__!;
                const ok = () => {
                  const s = dbg.me() as { hp: number; state: string } | null;
                  if (!s) return false;
                  return c.kind === 'below' ? s.state === 'alive' && s.hp < c.hp : c.kind === 'down' ? s.state !== 'alive' : s.state === 'alive';
                };
                const wait = () => {
                  if (!ok()) return void requestAnimationFrame(wait);
                  const t0 = performance.now();
                  let firstInMs: number | null = null;
                  let stayed = true;
                  const tick = () => {
                    const s = dbg.me() as { x: number; z: number } | null;
                    const p = s && dbg.runtime().project(s.x, s.z);
                    const inside = !!p && Math.abs(p.sx - innerWidth / 2) <= 0.05 * innerWidth && Math.abs(p.sy - innerHeight / 2) <= 0.05 * innerHeight;
                    const t = performance.now() - t0;
                    if (inside && firstInMs === null) firstInMs = t;
                    if (!inside && firstInMs !== null) stayed = false;
                    if (t < 800) requestAnimationFrame(tick);
                    else resolve({ firstInMs, stayed, mode: dbg.runtime().freeView.mode });
                  };
                  requestAnimationFrame(tick);
                };
                wait();
              }),
            cond
          )
          .then((r) => {
            console.log(`AC-119 (${label}): el barco entra en el 10 % central a los ${r.firstInMs?.toFixed(0)} ms y sigue dentro: ${r.stayed}; modo ${r.mode}`);
            expect(r.firstInMs).not.toBeNull();
            expect(r.firstInMs!).toBeLessThanOrEqual(300);
            expect(r.stayed).toBe(true);
            expect(r.mode).toBe('follow');
          });

      await goFree();
      await measure('daño', { kind: 'below', hp: (await me(page))!.hp });
      await goFree();
      await measure('muerte', { kind: 'down' });
      await waitFor(async () => ((await hud(page)).me as { state: string } | null)?.state, (st) => st === 'dead', 15_000, 100);
      await goFree();
      await page.waitForTimeout(8500); // la cuenta atrás de la reaparición (DEATH_COUNTDOWN, 8 s)
      expect((await camera(page)).mode).toBe('free');
      const respawned = measure('reaparición', { kind: 'alive' });
      await page.keyboard.press('Space');
      await respawned;
    } finally {
      await server.kill();
    }
  });

  // Producto (2026-10-18): una andanada contra el barco propio devuelve la cámara aunque falle, como el daño. El pirata del
  // escenario tiene puntería 0: ninguna daña, así que solo la andanada puede devolverla (un mutante que solo mire el daño
  // deja la cámara en vista libre y cae por las aserciones del modo y del 10 % central)
  test('AC-119 (andanada sin daño): una andanada contra ti, aunque falle, devuelve la cámara al barco en ≤ 300 ms', async ({ page }) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'volley-miss' });
    try {
      await enterGame(page, server.url);
      const post = { x: EDGE_ATTACK.pirate.x, z: EDGE_ATTACK.pirate.z - EDGE_ATTACK.standoff };
      await page.evaluate(([x, z]) => window.__SEA_BATTLE__!.runtime().client.moveTo(x, z), [post.x, post.z]);
      await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - post.x, s.z - post.z) < 3, 40_000, 200);
      await page.evaluate(() => {
        const rt = window.__SEA_BATTLE__!.runtime();
        const w = window as unknown as { __volleys: number[] };
        w.__volleys = [];
        rt.client.onEvent((e) => {
          if (e.type === 'volley' && e.targetId === rt.client.myShipId) w.__volleys.push(performance.now());
        });
      });
      const volleys = () => page.evaluate(() => (window as unknown as { __volleys: number[] }).__volleys.length);
      // Atacarlo le quita la protección; tras la 1.ª andanada se deja de atacar (Esc) y él sigue disparando desde su puesto
      await page.keyboard.press('Tab');
      await page.keyboard.press('Space');
      await waitFor(volleys, (n) => n >= 1, 15_000, 100);
      await page.keyboard.press('Escape');
      const hp0 = (await me(page))!.hp;
      await minimapCenter(page, { x: -300, z: -300 });
      await waitFor(() => camera(page), (c) => c.mode === 'free', 2000, 50);
      // Desde la llegada de la siguiente andanada: el primer frame con el barco en el 10 % central y si sigue dentro
      const r = await page.evaluate(
        () =>
          new Promise<{ firstInMs: number | null; stayed: boolean; mode: string; freeAtVolley: boolean }>((resolve) => {
            const dbg = window.__SEA_BATTLE__!;
            const w = window as unknown as { __volleys: number[] };
            const n0 = w.__volleys.length;
            const wait = () => {
              if (w.__volleys.length === n0) return void requestAnimationFrame(wait);
              const t0 = w.__volleys[w.__volleys.length - 1];
              const freeAtVolley = dbg.runtime().freeView.mode !== 'follow';
              let firstInMs: number | null = null;
              let stayed = true;
              const tick = () => {
                const s = dbg.me() as { x: number; z: number } | null;
                const p = s && dbg.runtime().project(s.x, s.z);
                const inside = !!p && Math.abs(p.sx - innerWidth / 2) <= 0.05 * innerWidth && Math.abs(p.sy - innerHeight / 2) <= 0.05 * innerHeight;
                const t = performance.now() - t0;
                if (inside && firstInMs === null) firstInMs = t;
                if (!inside && firstInMs !== null) stayed = false;
                if (t < 800) requestAnimationFrame(tick);
                else resolve({ firstInMs, stayed, mode: dbg.runtime().freeView.mode, freeAtVolley });
              };
              requestAnimationFrame(tick);
            };
            wait();
          })
      );
      const hp1 = (await me(page))!.hp;
      console.log(`AC-119 (andanada sin daño): vida ${hp0} → ${hp1}; el barco entra en el 10 % central a los ${r.firstInMs?.toFixed(0)} ms de la andanada y sigue dentro: ${r.stayed}; modo ${r.mode}`);
      expect(r.freeAtVolley).toBe(true); // la andanada llegó con la vista libre (o ya volviendo por ella)
      expect(hp1).toBe(hp0); // ninguna dañó: la vuelta es por la andanada
      expect(r.firstInMs).not.toBeNull();
      expect(r.firstInMs!).toBeLessThanOrEqual(300);
      expect(r.stayed).toBe(true);
      expect(r.mode).toBe('follow');
    } finally {
      await server.kill();
    }
  });

  test('AC-122: con la vista libre sobre un sector pirata a más de 400 m, a los 500 ms se dibujan los NPC que el servidor tiene en la zona visible', async ({ page }) => {
    test.setTimeout(90_000);
    const server = await startOwnServer({});
    let observer: Socket | null = null;
    try {
      await enterGame(page, server.url);
      const ship = (await me(page))!;
      // Observador: otro cliente del mismo servidor con la vista en el mismo centro; lo que recibe es lo que el servidor
      // tiene en esos 300 m
      const known = new Map<string, ShipSnapshot>();
      observer = io(server.url, { transports: ['websocket'], reconnection: false, auth: { guest: true, guestId: `free-view-obs-${Date.now()}` } });
      observer.on(S2C.frame, (f: ServerFrame) => {
        if (f.full) known.clear();
        for (const d of f.s ?? []) known.set(d.id, { ...(known.get(d.id) ?? {}), ...d } as ShipSnapshot);
        for (const id of f.r ?? []) known.delete(id);
      });
      await new Promise<void>((resolve) => observer!.once('connect', () => resolve()));
      observer.emit(C2S.join, { name: 'Observador' });
      await new Promise<void>((resolve) => observer!.once(S2C.welcome, () => resolve()));
      // Candidatos en los cuatro sectores piratas (anillo de 300–460 m del puerto, constants.ts PIRATE_RING) a más de
      // 400 m del barco. Con un centro fijo (350, 350) el sector podía estar vacío en ese momento (patrullas, muertes):
      // se mide en el primero donde el servidor tiene NPC en la zona visible; elegirlo solo mira al observador, nunca lo
      // que dibuja el cliente
      const candidates: Point[] = [];
      for (const deg of [45, 135, 225, 315]) for (const r of [400, 340, 440]) {
        const a = (deg * Math.PI) / 180;
        candidates.push({ x: r * Math.cos(a), z: r * Math.sin(a) });
      }
      // Margen de 15 m dentro del borde: un barco que cruza el borde entre las dos lecturas no cuenta
      type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
      const inner = (rect: Rect, p: Point) => p.x > rect.minX + 15 && p.x < rect.maxX - 15 && p.z > rect.minZ + 15 && p.z < rect.maxZ - 15;
      let measured: { center: Point; rect: Rect; serverIds: string[]; drawn: string[] } | null = null;
      for (const center of candidates.filter((c) => Math.hypot(c.x - ship.x, c.z - ship.z) > 400)) {
        observer.emit(C2S.viewAt, center);
        await minimapCenter(page, center);
        await page.waitForTimeout(500); // 5 frames del servidor (SNAPSHOT_RATE 10) para los dos clientes
        const seen = await page.evaluate(() => {
          const rt = window.__SEA_BATTLE__!.runtime();
          return { rect: rt.viewRect()!, drawn: [...rt.views.keys()] };
        });
        const serverIds = [...known.values()].filter((s) => s.k !== 'player' && s.st === 'alive' && inner(seen.rect, s)).map((s) => s.id).sort();
        console.log(`AC-122: centro ${center.x.toFixed(0)}, ${center.z.toFixed(0)} a ${Math.hypot(center.x - ship.x, center.z - ship.z).toFixed(0)} m del barco · NPC del servidor en la zona ${serverIds.join(', ') || '(ninguno)'}`);
        if (serverIds.length > 0) {
          measured = { center, rect: seen.rect, serverIds, drawn: seen.drawn.filter((id) => serverIds.includes(id)).sort() };
          break;
        }
      }
      expect(measured).not.toBeNull(); // hay NPC que ver en algún sector
      console.log(`AC-122: vista ${JSON.stringify(measured!.rect)} · NPC del servidor ${measured!.serverIds.join(', ')} · dibujados ${measured!.drawn.join(', ') || '(ninguno)'}`);
      expect(measured!.drawn).toEqual(measured!.serverIds);
    } finally {
      observer?.disconnect();
      await server.kill();
    }
  });

  test('AC-116 @mobile: un dedo que se mueve más de 12 px desplaza la vista sin moveTo; un toque navega; dos dedos solo hacen zoom', async ({ page }) => {
    const net = trackSocket(page); // antes de entrar: el WebSocket se abre al conectar y no se ve el que ya existe
    await enterGame(page);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    const start = await camera(page);
    const scroll0 = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const [x, y] = [start.w / 2 + 60, start.h / 2 + 120];
    await touch('touchStart', [[x, y]]);
    for (let i = 1; i <= 10; i++) await touch('touchMove', [[x - i * 6, y - i * 4]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(200);
    const dragged = await camera(page);
    const want = { x: start.x + 60 / start.ppm, z: start.z + 40 / (start.ppm * start.sinT) };
    console.log(`AC-116 móvil: foco ${start.x.toFixed(1)}, ${start.z.toFixed(1)} → ${dragged.x.toFixed(1)}, ${dragged.z.toFixed(1)} (esperado ${want.x.toFixed(1)}, ${want.z.toFixed(1)})`);
    expect(dragged.mode).toBe('free');
    expect(Math.abs(dragged.x - want.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(dragged.z - want.z)).toBeLessThanOrEqual(1);
    expect(sentOf(net, C2S.moveTo)).toHaveLength(0);

    // Dos dedos: zoom, sin desplazar la vista
    const zoom0 = (await camera(page)).ppm;
    await touch('touchStart', [[x - 40, y], [x + 40, y]]);
    for (let i = 1; i <= 12; i++) await touch('touchMove', [[x - 40 - i * 8, y], [x + 40 + i * 8, y]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(400);
    const pinched = await camera(page);
    console.log(`AC-116 móvil: pellizco ppm ${zoom0.toFixed(2)} → ${pinched.ppm.toFixed(2)} · foco ${pinched.x.toFixed(1)}, ${pinched.z.toFixed(1)}`);
    expect(pinched.ppm).not.toBeCloseTo(zoom0, 2);
    expect(Math.hypot(pinched.x - dragged.x, pinched.z - dragged.z)).toBeLessThanOrEqual(0.5);
    expect(sentOf(net, C2S.moveTo)).toHaveLength(0);

    // Un toque: exactamente 1 moveTo
    await touch('touchStart', [[x, y]]);
    await touch('touchEnd', []);
    await waitFor(async () => sentOf(net, C2S.moveTo).length, (n) => n >= 1, 3000, 50);
    await page.waitForTimeout(200);
    expect(sentOf(net, C2S.moveTo)).toHaveLength(1);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(scroll0); // AC-81
  });
});

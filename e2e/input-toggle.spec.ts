// AC-125 (DT-01): dos pulsaciones seguidas de Espacio, del botón Atacar o de Esc dan exactamente las intenciones que
// el jugador pidió, aunque el estado del servidor aún no haya llegado al cliente. Se prueba cada Δ ∈ {80, 120, 200,
// 300} ms entre pulsaciones con un retardo de red de 0 y 100 ms por sentido (simulado en la página: e2e/net-delay.ts).
// El estado de acción del HUD refleja la última pulsación en ≤ 50 ms y no se desdice: se muestrea en cada frame
// durante 500 ms tras la última pulsación, con un objetivo vivo y a tiro, y no cambia después de los primeros 50 ms.
// Pulsaciones reales; la API del cliente solo prepara (navegar y dejar el ataque en un estado conocido).
// AC-128 (H-17): Reparar y Atacar alternados (R y luego Espacio, Espacio y luego R) tienen en cuenta lo que la otra
// intención cancela, y con el casco intacto R no anula el ataque ni el HUD sale de "atacando" (GDD §5 y §8).
import { expect, Page, test } from '@playwright/test';
import { CANNON_LEVELS, SHIP_CLASSES } from '../src/game/constants';
import { ScenarioName, TARGET_FAN, TARGETS_POINT } from '../server/scenarios';
import { DebugShip, enterGame, hud, me, ships, trackSocket, waitFor } from './helpers';
import { frames, intents, Net, sailTo } from './net';
import { installNetDelay, setNetDelay } from './net-delay';
import { OwnServer, startOwnServer } from './own-server';

const GAPS = [80, 120, 200, 300];
const CROSS_GAPS = [80, 120, 200]; // AC-128
const MAX_HULL = 0.9; // AC-128: la reparación no termina durante la prueba
const DELAYS = [0, 100];
const HUD_MS = 50;
const SAMPLE_MS = 500;
const MIN_FRAMES = 10; // en 500 ms: por debajo, el muestreo por frame no diría nada
// El Δ real entre las dos pulsaciones, medido en la página, es el pedido ± 40 ms. Si la máquina lo estira, la ronda se
// repite (hasta 3 veces): es una condición de la prueba, no del juego
const GAP_TOLERANCE_MS = 40;
const GAP_ATTEMPTS = 3;

// Un objetivo a tiro: cada mercante del abanico tiene un puesto a 40 m (el cañón N1 alcanza 60 m) en la recta desde
// TARGETS_POINT, donde además es el mercante más cercano, el que elige Objetivo en táctil
const RANGE = CANNON_LEVELS[0].range;
const STAND_M = 40;
const STANDS = TARGET_FAN.map((t) => {
  const k = (t.d - STAND_M) / t.d;
  return { fan: t, x: TARGETS_POINT.x + (t.x - TARGETS_POINT.x) * k, z: TARGETS_POINT.z + (t.z - TARGETS_POINT.z) * k };
});
// Y vivo: cada ronda deja el ataque activo menos que la recarga (4 s), así que dispara como mucho una andanada. Si el
// mercante tiene más vida que el daño máximo de una andanada antes de la ronda, no se hunde durante ella; si no, se
// pasa al puesto del siguiente. Los mercantes del escenario no regeneran ni disparan
const MAX_VOLLEY = SHIP_CLASSES.sloop.cannonsPerSide * CANNON_LEVELS[0].damage;

// Un servidor por test: cada uno empieza con los cuatro mercantes a plena vida. "targets" con el casco entero y
// "repair" (AC-128) con el jugador al 10 % de vida
let own: OwnServer;
const serve = (scenario: ScenarioName) => async () => {
  own = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: scenario });
};
test.afterEach(async () => {
  await own?.kill();
});

interface InputMark { t: number; code: string; repeat: boolean }
interface StateMark { t: number; s: string | null }

// Antes de cargar: instante de cada pulsación (tecla o toque en Atacar), cada cambio del estado de acción del HUD y su
// valor en cada frame (requestAnimationFrame), en el reloj de la página
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __INPUT__: InputMark[]; __ACTION__: StateMark[]; __FRAMES__: StateMark[] };
    w.__INPUT__ = [];
    w.__ACTION__ = [];
    w.__FRAMES__ = [];
    const state = () => document.querySelector('[data-testid="action-state"]')?.getAttribute('data-state') ?? null;
    window.addEventListener('keydown', (e) => w.__INPUT__.push({ t: performance.now(), code: e.code, repeat: e.repeat }), true);
    document.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest?.('[data-testid="m-attack"]')) w.__INPUT__.push({ t: performance.now(), code: 'm-attack', repeat: false });
    }, true);
    // Clic en el agua (AC-128 d): el lienzo del juego recibe el puntero
    document.addEventListener('pointerdown', (e) => {
      if ((e.target as Element | null)?.tagName === 'CANVAS') w.__INPUT__.push({ t: performance.now(), code: 'water', repeat: false });
    }, true);
    let last: string | null | undefined;
    new MutationObserver(() => {
      const s = state();
      if (s !== last) w.__ACTION__.push({ t: performance.now(), s });
      last = s;
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
    const frame = () => {
      w.__FRAMES__.push({ t: performance.now(), s: state() });
      if (w.__FRAMES__.length > 4000) w.__FRAMES__.splice(0, 2000);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await installNetDelay(page);
}

const marks = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __INPUT__: InputMark[]; __ACTION__: StateMark[]; __FRAMES__: StateMark[] };
    return { input: w.__INPUT__.slice(), action: w.__ACTION__.slice(), frames: w.__FRAMES__.slice(), now: performance.now() };
  });

// Estado de ataque propio según el servidor: el último campo `t` del barco propio en los frames recibidos
function serverTarget(net: Net, myId: string, initial: string | null = null): string | null {
  let t: string | null = initial;
  for (const f of frames(net)) for (const s of f.s ?? []) if (s.id === myId && 't' in s) t = s.t ?? null;
  return t;
}

// Igual para la reparación (campo `r`). Los frames son deltas: si el estado no cambia, no viene, de ahí el inicial
function serverRepairing(net: Net, myId: string, initial = false): boolean {
  let r = initial;
  for (const f of frames(net)) for (const s of f.s ?? []) if (s.id === myId && 'r' in s) r = !!s.r;
  return r;
}

const actionState = (page: Page) => page.getByTestId('action-state');

// Sin reparar, confirmado por el servidor (AC-128 b, d). Solo envía repair(false) si hace falta: con el retardo simulado,
// un repair(false) innecesario saldría ya dentro de la ronda siguiente y se contaría como suyo
async function resetRepair(page: Page) {
  await page.evaluate(() => {
    const client = (window.__SEA_BATTLE__!.runtime() as unknown as { client: { repair: (on: boolean) => void; myRepairing: () => boolean } }).client;
    if (client.myRepairing()) client.repair(false);
  });
  await waitFor(() => me(page), (s) => !!s && !s.repairing, 5000, 50);
  await expect(actionState(page)).not.toHaveAttribute('data-state', 'repairing');
}

async function hullRatio(page: Page): Promise<number> {
  const s = (await me(page))!;
  return s.hp / s.maxHp;
}

// Sin ataque, confirmado por el servidor, con la red en reposo y la última andanada ya impactada
async function resetAttack(page: Page) {
  await page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { client: { cancelAttack: () => void } }).client.cancelAttack());
  await waitFor(() => me(page), (s) => !!s && s.targetId === null, 5000, 50);
  await page.waitForTimeout(400);
}

async function sailToPoint(page: Page, point: { x: number; z: number }) {
  await sailTo(page, point.x, point.z);
  await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - point.x, s.z - point.z) < 2.5, 45_000, 250);
  await page.waitForTimeout(1500);
}

function fanShip(all: DebugShip[], fan: (typeof TARGET_FAN)[number]): DebugShip | undefined {
  return all.find((s) => s.kind === 'merchant' && Math.hypot(s.x - fan.x, s.z - fan.z) < 1);
}

// Para el test de repetición, que no mira el HUD: el mercante de 90 m queda fuera de alcance ("armed") y no se daña
async function toFanPoint(page: Page, point: { x: number; z: number }, d: (typeof TARGET_FAN)[number]['d']): Promise<DebugShip> {
  await sailToPoint(page, point);
  const target = fanShip(await ships(page), TARGET_FAN.find((f) => f.d === d)!);
  expect(target?.screen, `mercante de ${d} m en pantalla`).toBeTruthy();
  return target!;
}

// El objetivo de cada ronda: vivo, a tiro, con vida para aguantar una andanada y seleccionado con la interacción real
// (clic en escritorio, botón Objetivo en táctil). Si el actual ya no aguanta otra andanada, navega al siguiente puesto
function inRangeTarget(page: Page, select: (target: DebugShip) => Promise<void>) {
  let stand = -1;
  let id: string | null = null;
  const log: string[] = [];
  const next = async (): Promise<DebugShip> => {
    let target = id ? (await ships(page)).find((s) => s.id === id) : undefined;
    if (!target || target.state !== 'alive' || target.hp <= MAX_VOLLEY) {
      if (target) log.push(`${target.hp}/${target.maxHp}`);
      stand++;
      expect(stand, 'quedan mercantes con vida para una ronda más').toBeLessThan(STANDS.length);
      await sailToPoint(page, STANDS[stand]);
      const all = await ships(page);
      target = fanShip(all, STANDS[stand].fan);
      expect(target?.screen, `mercante de ${STANDS[stand].fan.d} m en pantalla`).toBeTruthy();
      expect(target!.hp, 'mercante a plena vida').toBe(target!.maxHp);
      const nearest = all.filter((s) => s.kind === 'merchant').sort((a, b) => dist(a, STANDS[stand]) - dist(b, STANDS[stand]))[0];
      expect(nearest.id, 'es el mercante más cercano').toBe(target!.id);
      id = target!.id;
    }
    const chosen = target!;
    const mine = (await me(page))!;
    expect(dist(chosen, mine), 'objetivo a tiro').toBeLessThanOrEqual(RANGE);
    if ((await hud(page)).selectedId !== chosen.id) {
      await select(chosen);
      await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', chosen.id);
    }
    return chosen;
  };
  const after = async () => {
    const target = (await ships(page)).find((s) => s.id === id);
    return target ? `${target.state} ${target.hp}/${target.maxHp}` : 'desaparecido';
  };
  return { next, after, log };
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// Selección con la interacción real de escritorio: clic sobre el barco y el ratón fuera de la escena
const selectByClick = (page: Page) => async (t: DebugShip) => {
  await page.mouse.click(t.screen!.sx, t.screen!.sy);
  await page.mouse.move(5, 450);
};

interface Result {
  delay: number;
  gap: number;
  realGap: number;
  intents: string;
  server: string | null;
  hud: string;
  ok: boolean;
}

// Dos pulsaciones separadas `gap` ms (`press(0)` y `press(1)`); espera a que todo se asiente y mide intenciones,
// estado final del servidor (desde `initial`, el confirmado antes de pulsar) y HUD
async function doublePress(
  page: Page,
  net: Net,
  myId: string,
  press: (i: number) => Promise<void>,
  gap: number,
  expected: string[],
  initial: { target: string | null; repairing: boolean } = { target: null, repairing: false }
) {
  const t0 = (await marks(page)).now;
  net.reset();
  // De inicio a inicio: lo que tarda la primera pulsación (un toque son varias idas y vueltas) no se suma al Δ
  const start = Date.now();
  await press(0);
  await page.waitForTimeout(Math.max(0, gap - (Date.now() - start)));
  await press(1);
  const delay = await page.evaluate(() => (window as unknown as { __NET_DELAY_MS__: number }).__NET_DELAY_MS__);
  await page.waitForTimeout(Math.max(2 * delay + 900, SAMPLE_MS + 200));
  const m = await marks(page);
  const presses = m.input.filter((i) => i.t >= t0 && !i.repeat && ['Space', 'Escape', 'KeyR', 'm-attack'].includes(i.code));
  const action = m.action.filter((a) => a.t >= t0);
  // Latencia del HUD por pulsación: primer cambio al estado esperado después de pulsar (null si nunca llega)
  const latencies = presses.map((p, i) => {
    const want = expected[i];
    if (want === undefined) return null;
    const hit = action.find((a) => a.t >= p.t && a.s === want);
    return hit ? hit.t - p.t : null;
  });
  const final = expected[expected.length - 1];
  const lastPress = presses[presses.length - 1]?.t ?? t0;
  // Muestreo por frame durante 500 ms tras la última pulsación: pasados los primeros 50 ms, ningún cambio y siempre
  // el estado de la última pulsación
  const window500 = m.frames.filter((f) => f.t >= lastPress && f.t <= lastPress + SAMPLE_MS);
  const settled = window500.filter((f) => f.t > lastPress + HUD_MS);
  const changes = window500.filter((f, i) => i > 0 && f.t > lastPress + HUD_MS && f.s !== window500[i - 1].s).length;
  const off = settled.filter((f) => f.s !== final).map((f) => f.s);
  return {
    realGap: presses.length >= 2 ? presses[1].t - presses[0].t : NaN,
    intents: intents(net).map((i) => i.name),
    raw: intents(net),
    server: serverTarget(net, myId, initial.target),
    repairing: serverRepairing(net, myId, initial.repairing),
    latencies,
    // Todos los estados por los que pasó el HUD desde la primera pulsación: sin intermedios ni vueltas atrás
    sequence: action.map((a) => a.s),
    frames: window500.length,
    changes,
    off
  };
}

type Run = Awaited<ReturnType<typeof doublePress>>;

async function withGap<T extends { r: Run }>(gap: number, round: () => Promise<T>): Promise<T & { attempts: number }> {
  let out = await round();
  let attempts = 1;
  while (Math.abs(out.r.realGap - gap) > GAP_TOLERANCE_MS && attempts < GAP_ATTEMPTS) {
    out = await round();
    attempts++;
  }
  return { ...out, attempts };
}

const gapOk = (r: Run, gap: number) => Math.abs(r.realGap - gap) <= GAP_TOLERANCE_MS;
const fmtTries = (attempts: number) => (attempts > 1 ? ` · ${attempts} intentos` : '');

// Lo común a los tres casos: latencia ≤ 50 ms, la secuencia exacta de estados y el muestreo por frame
function hudOk(r: Run, expected: string[], latencies = r.latencies) {
  return (
    latencies.every((l) => l !== null && l <= HUD_MS) &&
    JSON.stringify(r.sequence) === JSON.stringify(expected) &&
    r.frames >= MIN_FRAMES &&
    r.changes === 0 &&
    r.off.length === 0
  );
}

const fmtLat = (l: (number | null)[]) => l.map((v) => (v === null ? 'nunca' : `${v.toFixed(0)} ms`)).join(' / ');
const fmtHud = (r: Run, latencies = r.latencies) =>
  `${fmtLat(latencies)} · estados ${JSON.stringify(r.sequence)} · ${r.frames} frames en 500 ms, ${r.changes} cambios tras 50 ms${r.off.length ? ` (${[...new Set(r.off)].join(',')})` : ''}`;

function report(label: string, results: Result[], targets: string) {
  console.log(`${label} · ${targets}\n${results.map((r) => `  retardo ${r.delay} ms · Δ ${r.gap} (real ${r.realGap.toFixed(0)}) ms → ${r.intents} · servidor: ${r.server ?? 'sin ataque'} · HUD ${r.hud} · ${r.ok ? 'OK' : 'FALLA'}`).join('\n')}`);
}

test.describe('Doble pulsación con el estado del servidor en camino', () => {
  test.beforeEach(serve('targets'));

  test('AC-125: Espacio ×2 a Δ ∈ {80, 120, 200, 300} ms con 0 y 100 ms de retardo → exactamente attack → cancelAttack, el servidor sin ataque y el HUD al día en ≤ 50 ms sin desdecirse', async ({ page }) => {
    test.setTimeout(300_000);
    await instrument(page);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const myId = (await me(page))!.id;
    const targets = inRangeTarget(page, async (t) => {
      await page.mouse.click(t.screen!.sx, t.screen!.sy);
      await page.mouse.move(5, 450);
    });
    const expected = ['firing', 'idle'];

    const results: Result[] = [];
    for (const delay of DELAYS) {
      await setNetDelay(page, delay);
      for (const gap of GAPS) {
        const { r, target, after, attempts } = await withGap(gap, async () => {
          await resetAttack(page);
          const target = await targets.next();
          const r = await doublePress(page, net, myId, () => page.keyboard.press('Space'), gap, expected);
          return { r, target, after: await targets.after() };
        });
        const ok =
          gapOk(r, gap) &&
          JSON.stringify(r.raw) === JSON.stringify([{ name: 'attack', data: { targetId: target.id } }, { name: 'cancelAttack' }]) &&
          r.server === null &&
          hudOk(r, expected) &&
          after.startsWith('alive');
        results.push({ delay, gap, realGap: r.realGap, intents: JSON.stringify(r.intents), server: r.server, hud: `${fmtHud(r)} · objetivo ${after}${fmtTries(attempts)}`, ok });
        expect.soft((await hud(page)).selectedId, `selección tras Δ ${gap} y retardo ${delay}`).toBe(target.id);
      }
    }
    await setNetDelay(page, 0);
    report('AC-125 (Espacio ×2)', results, `mercantes agotados: ${JSON.stringify(targets.log)}`);
    for (const r of results) expect.soft(r.ok, `Espacio ×2, retardo ${r.delay} ms, Δ ${r.gap} ms: ${r.intents}, servidor ${r.server}, HUD ${r.hud}`).toBe(true);
  });

  test('AC-125: Esc ×2 a Δ ∈ {80, 120, 200, 300} ms con 0 y 100 ms de retardo → 1 cancelAttack, la 2.ª deselecciona sin red y el HUD al día en ≤ 50 ms sin desdecirse', async ({ page }) => {
    test.setTimeout(360_000);
    await instrument(page);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const myId = (await me(page))!.id;
    const targets = inRangeTarget(page, async (t) => {
      await page.mouse.click(t.screen!.sx, t.screen!.sy);
      await page.mouse.move(5, 450);
    });
    const expected = ['idle'];
    const results: Result[] = [];
    for (const delay of DELAYS) {
      await setNetDelay(page, delay);
      for (const gap of GAPS) {
        const { r, selected, panel, after, attempts } = await withGap(gap, async () => {
          // Objetivo seleccionado y atacado con Espacio, confirmado por el servidor y "a tiro" en el HUD
          await resetAttack(page);
          const target = await targets.next();
          await page.keyboard.press('Space');
          await waitFor(() => me(page), (s) => !!s && s.targetId === target.id, 5000, 50);
          await page.waitForTimeout(2 * delay + 300);
          await expect(page.getByTestId('action-state')).toHaveAttribute('data-state', 'firing');
          const r = await doublePress(page, net, myId, () => page.keyboard.press('Escape'), gap, expected);
          return { r, selected: (await hud(page)).selectedId, panel: await page.getByTestId('target-frame').count(), after: await targets.after() };
        });
        const latency = r.latencies.slice(0, 1);
        const ok = gapOk(r, gap) && JSON.stringify(r.intents) === JSON.stringify(['cancelAttack']) && r.server === null && selected === null && panel === 0 && hudOk(r, expected, latency) && after.startsWith('alive');
        results.push({ delay, gap, realGap: r.realGap, intents: JSON.stringify(r.intents), server: r.server, hud: `${fmtHud(r, latency)} · selección ${selected ?? 'ninguna'} · objetivo ${after}${fmtTries(attempts)}`, ok });
      }
    }
    await setNetDelay(page, 0);
    report('AC-125 (Esc ×2)', results, `mercantes agotados: ${JSON.stringify(targets.log)}`);
    for (const r of results) expect.soft(r.ok, `Esc ×2, retardo ${r.delay} ms, Δ ${r.gap} ms: ${r.intents}, servidor ${r.server}, HUD ${r.hud}`).toBe(true);
  });

  test('AC-125: mantener Espacio o S pulsadas no repite la intención (se ignoran los eventos repeat)', async ({ page }) => {
    test.setTimeout(120_000);
    await instrument(page);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const myId = (await me(page))!.id;
    const target = await toFanPoint(page, TARGETS_POINT, 90);
    await page.mouse.click(target.screen!.sx, target.screen!.sy);
    await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', target.id);
    await page.mouse.move(5, 450);

    const hold = async (key: string) => {
      const t0 = (await marks(page)).now;
      net.reset();
      // keyboard.down sobre una tecla ya pulsada genera keydown con repeat = true, como la repetición del sistema
      for (let i = 0; i < 8; i++) {
        await page.keyboard.down(key);
        await page.waitForTimeout(35);
      }
      await page.keyboard.up(key);
      await page.waitForTimeout(800);
      const repeats = (await marks(page)).input.filter((m) => m.t >= t0 && m.code === key);
      return { sent: intents(net).map((i) => i.name), keydowns: repeats.length, repeated: repeats.filter((m) => m.repeat).length };
    };
    const space = await hold('Space');
    const spaceServer = serverTarget(net, myId);
    await resetAttack(page);
    // S con el barco navegando: el destino lejos, para que haya algo que detener
    await sailTo(page, TARGETS_POINT.x, TARGETS_POINT.z - 80);
    await page.waitForTimeout(800);
    const stop = await hold('KeyS');
    console.log(`AC-125 (repetición): Espacio ${space.keydowns} keydown (${space.repeated} repeat) → ${JSON.stringify(space.sent)} · servidor ${spaceServer ?? 'sin ataque'} · S ${stop.keydowns} keydown (${stop.repeated} repeat) → ${JSON.stringify(stop.sent)}`);
    expect(space.repeated).toBeGreaterThanOrEqual(6); // la prueba de verdad generó repeticiones
    expect.soft(space.sent, 'Espacio mantenido').toEqual(['attack']);
    expect.soft(spaceServer, 'Espacio mantenido: el ataque queda activo').toBe(target.id);
    expect.soft(stop.sent, 'S mantenida').toEqual(['stop']);
  });

  test('AC-128 (c): con el casco intacto y un objetivo atacado, R con 0 y 100 ms de retardo → repair(true) rechazado por el servidor, el ataque sigue y el HUD no sale de "atacando"', async ({ page }) => {
    test.setTimeout(180_000);
    await instrument(page);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const myId = (await me(page))!.id;
    const targets = inRangeTarget(page, selectByClick(page));
    const lines: string[] = [];
    const fails: string[] = [];
    for (const delay of DELAYS) {
      await setNetDelay(page, delay);
      // Objetivo seleccionado y atacado con Espacio, confirmado por el servidor y "a tiro" en el HUD
      await resetAttack(page);
      const target = await targets.next();
      await page.keyboard.press('Space');
      await waitFor(() => me(page), (s) => !!s && s.targetId === target.id, 5000, 50);
      await page.waitForTimeout(2 * delay + 300);
      await expect(actionState(page)).toHaveAttribute('data-state', 'firing');
      const hull = await hullRatio(page);
      const t0 = (await marks(page)).now;
      net.reset();
      await page.keyboard.press('KeyR');
      await page.waitForTimeout(Math.max(2 * delay + 900, SAMPLE_MS + 200));
      const m = await marks(page);
      const from = m.input.find((i) => i.t >= t0 && i.code === 'KeyR' && !i.repeat)?.t ?? t0;
      // Desde la pulsación, sin descontar los primeros 50 ms: ningún frame fuera de "firing"
      const window500 = m.frames.filter((f) => f.t >= from && f.t <= from + SAMPLE_MS);
      const off = window500.filter((f) => f.s !== 'firing').map((f) => f.s);
      const sequence = m.action.filter((a) => a.t >= t0).map((a) => a.s);
      const raw = intents(net);
      const server = serverTarget(net, myId, target.id);
      const repairing = serverRepairing(net, myId, false);
      const toasts = (await page.getByTestId('toasts').textContent()) ?? '';
      const after = await targets.after();
      const ok =
        hull === 1 &&
        JSON.stringify(raw) === JSON.stringify([{ name: 'repair', data: { on: true } }]) &&
        server === target.id &&
        !repairing &&
        window500.length >= MIN_FRAMES &&
        off.length === 0 &&
        sequence.length === 0 &&
        toasts.includes('El casco ya está intacto') &&
        after.startsWith('alive');
      const line = `retardo ${delay} ms · casco ${(hull * 100).toFixed(0)} % → ${JSON.stringify(raw)} · servidor: ${server ?? 'sin ataque'}, ${repairing ? 'reparando' : 'sin reparar'} · HUD estados ${JSON.stringify(sequence)} · ${window500.length} frames en 500 ms${off.length ? `, fuera de "firing": ${[...new Set(off)].join(',')}` : ', todos "firing"'} · aviso ${JSON.stringify(toasts)} · objetivo ${after} · ${ok ? 'OK' : 'FALLA'}`;
      lines.push(`  ${line}`);
      if (!ok) fails.push(line);
    }
    await setNetDelay(page, 0);
    console.log(`AC-128 (c): R con el casco intacto\n${lines.join('\n')}`);
    expect(fails, 'R con el casco intacto').toEqual([]);
  });
});

test.describe('Doble toque en Atacar @mobile', () => {
  test.beforeEach(serve('targets'));

  test('AC-125: en 390×844, el botón Atacar ×2 a Δ ∈ {80, 120, 200, 300} ms con 0 y 100 ms de retardo → exactamente attack → cancelAttack, el servidor sin ataque y el HUD al día en ≤ 50 ms sin desdecirse', async ({ page }) => {
    test.setTimeout(360_000);
    await instrument(page);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const myId = (await me(page))!.id;
    // Objetivo elige primero el más cercano y luego rota por distancia: se toca hasta llegar al del puesto
    const targets = inRangeTarget(page, async (t) => {
      for (let i = 0; i < TARGET_FAN.length && (await hud(page)).selectedId !== t.id; i++) {
        await page.getByTestId('m-target').tap();
        await page.waitForTimeout(150);
      }
    });
    const expected = ['firing', 'idle'];
    const btn = page.getByTestId('m-attack');

    const results: Result[] = [];
    for (const delay of DELAYS) {
      await setNetDelay(page, delay);
      for (const gap of GAPS) {
        const { r, target, after, attempts } = await withGap(gap, async () => {
          await resetAttack(page);
          const target = await targets.next();
          const box = (await btn.boundingBox())!;
          const tap = () => page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
          const r = await doublePress(page, net, myId, tap, gap, expected);
          return { r, target, after: await targets.after() };
        });
        const ok =
          gapOk(r, gap) &&
          JSON.stringify(r.raw) === JSON.stringify([{ name: 'attack', data: { targetId: target.id } }, { name: 'cancelAttack' }]) &&
          r.server === null &&
          hudOk(r, expected) &&
          after.startsWith('alive');
        results.push({ delay, gap, realGap: r.realGap, intents: JSON.stringify(r.intents), server: r.server, hud: `${fmtHud(r)} · objetivo ${after}${fmtTries(attempts)}`, ok });
      }
    }
    await setNetDelay(page, 0);
    report('AC-125 (botón Atacar ×2, 390×844)', results, `mercantes agotados: ${JSON.stringify(targets.log)}`);
    for (const r of results) expect.soft(r.ok, `Atacar ×2, retardo ${r.delay} ms, Δ ${r.gap} ms: ${r.intents}, servidor ${r.server}, HUD ${r.hud}`).toBe(true);
  });
});

test.describe('Reparar y atacar cruzados con el casco dañado (AC-128)', () => {
  test.beforeEach(serve('repair'));

  test('AC-128 (a): con un objetivo atacado, R y luego Espacio a Δ ∈ {80, 120, 200} ms con 0 y 100 ms de retardo → exactamente repair(true) → attack, el servidor atacando sin reparar y el HUD al día en ≤ 50 ms sin desdecirse', async ({ page }) => {
    test.setTimeout(300_000);
    await instrument(page);
    const net = trackSocket(page);
    await enterGame(page, own.url);
    const myId = (await me(page))!.id;
    const targets = inRangeTarget(page, selectByClick(page));
    const expected = ['repairing', 'firing'];
    const results: Result[] = [];
    for (const delay of DELAYS) {
      await setNetDelay(page, delay);
      for (const gap of CROSS_GAPS) {
        const { r, target, hull, after, attempts } = await withGap(gap, async () => {
          // Objetivo seleccionado y atacado con Espacio, sin reparar, confirmado por el servidor y "a tiro" en el HUD
          await resetAttack(page);
          const target = await targets.next();
          await page.keyboard.press('Space');
          await waitFor(() => me(page), (s) => !!s && s.targetId === target.id && !s.repairing, 5000, 50);
          await page.waitForTimeout(2 * delay + 300);
          await expect(actionState(page)).toHaveAttribute('data-state', 'firing');
          const hull = await hullRatio(page);
          const r = await doublePress(page, net, myId, (i) => page.keyboard.press(i === 0 ? 'KeyR' : 'Space'), gap, expected, { target: target.id, repairing: false });
          return { r, target, hull, after: await targets.after() };
        });
        const ok =
          gapOk(r, gap) &&
          hull <= MAX_HULL &&
          JSON.stringify(r.raw) === JSON.stringify([{ name: 'repair', data: { on: true } }, { name: 'attack', data: { targetId: target.id } }]) &&
          r.server === target.id &&
          !r.repairing &&
          hudOk(r, expected) &&
          after.startsWith('alive');
        results.push({ delay, gap, realGap: r.realGap, intents: JSON.stringify(r.intents), server: `${r.server ?? 'sin ataque'}, ${r.repairing ? 'reparando' : 'sin reparar'}`, hud: `${fmtHud(r)} · casco ${(hull * 100).toFixed(0)} % · objetivo ${after}${fmtTries(attempts)}`, ok });
      }
    }
    await setNetDelay(page, 0);
    report('AC-128 (a): R y luego Espacio', results, `mercantes agotados: ${JSON.stringify(targets.log)}`);
    for (const r of results) expect.soft(r.ok, `R → Espacio, retardo ${r.delay} ms, Δ ${r.gap} ms: ${r.intents}, servidor ${r.server}, HUD ${r.hud}`).toBe(true);
  });

  // Un test por retardo: reparar cura 32 de vida/s y cada ronda repara ~2,5 s, así que cada servidor nuevo (casco al
  // 10 %) da para 3 rondas y sus reintentos sin pasar del 90 %
  for (const delay of DELAYS) {
    test(`AC-128 (b): reparando y con un objetivo seleccionado sin atacar, Espacio y luego R a Δ ∈ {80, 120, 200} ms con ${delay} ms de retardo → exactamente attack → repair(true), el servidor reparando sin ataque y el HUD al día en ≤ 50 ms sin desdecirse`, async ({ page }) => {
      test.setTimeout(240_000);
      await instrument(page);
      const net = trackSocket(page);
      await enterGame(page, own.url);
      const myId = (await me(page))!.id;
      const targets = inRangeTarget(page, selectByClick(page));
      const expected = ['firing', 'repairing'];
      const results: Result[] = [];
      await setNetDelay(page, delay);
      for (const gap of CROSS_GAPS) {
        const { r, target, hull, after, attempts } = await withGap(gap, async () => {
          // Reparando con R, el objetivo seleccionado y sin atacar, confirmado por el servidor y en el HUD
          await resetAttack(page);
          await resetRepair(page);
          const target = await targets.next();
          const hull = await hullRatio(page);
          await page.keyboard.press('KeyR');
          await waitFor(() => me(page), (s) => !!s && s.repairing && s.targetId === null, 5000, 50);
          await page.waitForTimeout(2 * delay + 100);
          await expect(actionState(page)).toHaveAttribute('data-state', 'repairing');
          const r = await doublePress(page, net, myId, (i) => page.keyboard.press(i === 0 ? 'Space' : 'KeyR'), gap, expected, { target: null, repairing: true });
          const out = { r, target, hull, after: await targets.after() };
          await resetRepair(page);
          return out;
        });
        const ok =
          gapOk(r, gap) &&
          hull <= MAX_HULL &&
          JSON.stringify(r.raw) === JSON.stringify([{ name: 'attack', data: { targetId: target.id } }, { name: 'repair', data: { on: true } }]) &&
          r.server === null &&
          r.repairing &&
          hudOk(r, expected) &&
          after.startsWith('alive');
        results.push({ delay, gap, realGap: r.realGap, intents: JSON.stringify(r.intents), server: `${r.server ?? 'sin ataque'}, ${r.repairing ? 'reparando' : 'sin reparar'}`, hud: `${fmtHud(r)} · casco ${(hull * 100).toFixed(0)} % · objetivo ${after}${fmtTries(attempts)}`, ok });
        expect.soft((await hud(page)).selectedId, `selección tras Δ ${gap}`).toBe(target.id);
      }
      await setNetDelay(page, 0);
      report(`AC-128 (b): Espacio y luego R (retardo ${delay} ms)`, results, `mercantes agotados: ${JSON.stringify(targets.log)}`);
      for (const r of results) expect.soft(r.ok, `Espacio → R, retardo ${r.delay} ms, Δ ${r.gap} ms: ${r.intents}, servidor ${r.server}, HUD ${r.hud}`).toBe(true);
    });
  }
});

// AC-128 (d) (H-21): navegar deja de reparar (GDD §8, world.ts moveTo). Sin reparar, R → clic en el agua → R: el segundo
// R repara, porque el clic ya canceló la reparación aunque el servidor aún no lo haya confirmado, y el barco termina
// reparando y sin destino (frena, AC-38)
test.describe('Reparar, navegar y reparar con el casco dañado (AC-128 d)', () => {
  test.beforeEach(serve('repair'));

  // Un punto de agua en pantalla: el lienzo bajo el puntero, sin barcos a < 60 px ni elementos del HUD
  async function waterPoint(page: Page): Promise<{ x: number; y: number }> {
    const mine = (await me(page))!;
    const others = (await ships(page)).filter((s) => s.screen).map((s) => s.screen!);
    const candidates = [[-160, -110], [160, -110], [-160, 110], [160, 110], [0, -160], [0, 160]].map(([dx, dy]) => ({ x: mine.screen!.sx + dx, y: mine.screen!.sy + dy }));
    for (const c of candidates) {
      const onCanvas = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', [c.x, c.y]);
      if (onCanvas && others.every((o) => Math.hypot(o.sx - c.x, o.sy - c.y) >= 60)) return c;
    }
    throw new Error('sin un punto de agua libre en pantalla');
  }

  for (const delay of DELAYS) {
    test(`AC-128 (d): R → clic en el agua → R a Δ ∈ {80, 120, 200} ms con ${delay} ms de retardo → exactamente repair(true) → moveTo → repair(true), el servidor reparando y el HUD al día en ≤ 50 ms sin desdecirse`, async ({ page }) => {
      test.setTimeout(180_000);
      await instrument(page);
      const net = trackSocket(page);
      await enterGame(page, own.url);
      const myId = (await me(page))!.id;
      await page.mouse.move(5, 450);
      await setNetDelay(page, delay);
      const expected = ['repairing', 'idle', 'repairing'];
      const lines: string[] = [];
      const fails: string[] = [];
      for (const gap of CROSS_GAPS) {
        let attempts = 0;
        let round: { realGaps: number[]; raw: { name: string; data: unknown }[]; repairing: boolean; drift: number; latencies: (number | null)[]; sequence: (string | null)[]; frames: number; changes: number; off: (string | null)[]; hull: number };
        do {
          attempts++;
          await resetRepair(page);
          const water = await waterPoint(page);
          const hull = await hullRatio(page);
          const t0 = (await marks(page)).now;
          net.reset();
          const s1 = Date.now();
          await page.keyboard.press('KeyR');
          await page.waitForTimeout(Math.max(0, gap - (Date.now() - s1)));
          const s2 = Date.now();
          await page.mouse.click(water.x, water.y);
          await page.waitForTimeout(Math.max(0, gap - (Date.now() - s2)));
          await page.keyboard.press('KeyR');
          await page.mouse.move(5, 450);
          await page.waitForTimeout(Math.max(2 * delay + 900, SAMPLE_MS + 200));
          // Sin destino (AC-38): repara frenado, no sigue hacia el punto del clic
          const p1 = (await me(page))!;
          await page.waitForTimeout(400);
          const p2 = (await me(page))!;
          const m = await marks(page);
          const inputs = m.input.filter((i) => i.t >= t0 && !i.repeat && (i.code === 'KeyR' || i.code === 'water'));
          const action = m.action.filter((a) => a.t >= t0);
          const latencies = inputs.map((p, i) => {
            const hit = action.find((a) => a.t >= p.t && a.s === expected[i]);
            return hit ? hit.t - p.t : null;
          });
          const last = inputs[inputs.length - 1]?.t ?? t0;
          const window500 = m.frames.filter((f) => f.t >= last && f.t <= last + SAMPLE_MS);
          round = {
            realGaps: inputs.slice(1).map((p, i) => p.t - inputs[i].t),
            raw: intents(net),
            repairing: serverRepairing(net, myId, false),
            drift: Math.hypot(p2.x - p1.x, p2.z - p1.z),
            latencies,
            sequence: action.map((a) => a.s),
            frames: window500.length,
            changes: window500.filter((f, i) => i > 0 && f.t > last + HUD_MS && f.s !== window500[i - 1].s).length,
            off: window500.filter((f) => f.t > last + HUD_MS && f.s !== 'repairing').map((f) => f.s),
            hull
          };
        } while (!(round.realGaps.length === 2 && round.realGaps.every((g) => Math.abs(g - gap) <= GAP_TOLERANCE_MS)) && attempts < GAP_ATTEMPTS);
        const names = round.raw.map((i) => i.name);
        const ok =
          round.realGaps.length === 2 &&
          round.realGaps.every((g) => Math.abs(g - gap) <= GAP_TOLERANCE_MS) &&
          round.hull <= MAX_HULL &&
          JSON.stringify(names) === JSON.stringify(['repair', 'moveTo', 'repair']) &&
          JSON.stringify(round.raw[0]?.data) === JSON.stringify({ on: true }) &&
          JSON.stringify(round.raw[2]?.data) === JSON.stringify({ on: true }) &&
          round.repairing &&
          round.drift < 0.5 &&
          round.latencies.length === 3 &&
          round.latencies.every((l) => l !== null && l <= HUD_MS) &&
          JSON.stringify(round.sequence) === JSON.stringify(expected) &&
          round.frames >= MIN_FRAMES &&
          round.changes === 0 &&
          round.off.length === 0;
        const line = `retardo ${delay} ms · Δ ${gap} (real ${round.realGaps.map((g) => g.toFixed(0)).join(' / ')}) ms → ${JSON.stringify(round.raw.map((i) => (i.name === 'repair' ? `repair(${(i.data as { on: boolean }).on})` : i.name)))} · servidor: ${round.repairing ? 'reparando' : 'sin reparar'}, ${round.drift.toFixed(2)} m en 400 ms · HUD ${fmtLat(round.latencies)} · estados ${JSON.stringify(round.sequence)} · ${round.frames} frames en 500 ms, ${round.changes} cambios tras 50 ms${round.off.length ? ` (${[...new Set(round.off)].join(',')})` : ''} · casco ${(round.hull * 100).toFixed(0)} %${fmtTries(attempts)} · ${ok ? 'OK' : 'FALLA'}`;
        lines.push(`  ${line}`);
        if (!ok) fails.push(line);
      }
      await resetRepair(page);
      await setNetDelay(page, 0);
      console.log(`AC-128 (d): R, clic en el agua y R (retardo ${delay} ms)\n${lines.join('\n')}`);
      expect(fails, 'R → clic en el agua → R').toEqual([]);
    });
  }
});

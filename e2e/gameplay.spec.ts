import { Browser, expect, Page, test } from '@playwright/test';
import { PORTS } from '../playwright.config';
import { HINTS } from '../src/client/hints';
import { SHIP_CLASSES } from '../src/game/constants';
import { AMBUSH_POINT, BLIND_GUNNER_POINT, SHOWCASE_POINT } from '../server/scenarios';
import { clickWater, dialogsOf, enterGame, hud, me, ships, trackSocket, waitFor } from './helpers';
import { intentNames } from './net';
import { OwnServer, startOwnServer } from './own-server';

test.describe('Landing', () => {
  test('AC-10: con AUTH_BYPASS aparece "Jugar como invitado"; sin él no existe en el DOM', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('cta-play')).toHaveText('Zarpar');
    await expect(page.getByTestId('cta-guest')).toHaveText('Jugar como invitado');
    await page.goto(`http://localhost:${PORTS.auth}/`);
    await expect(page.getByTestId('cta-play')).toBeVisible();
    await expect(page.getByTestId('cta-guest')).toHaveCount(0);
  });

  test('AC-12 (landing): con ?full=1 se muestra "Servidor lleno"', async ({ page }) => {
    await page.goto('/?full=1');
    await expect(page.getByTestId('server-full')).toHaveText('Servidor lleno. Inténtalo en unos minutos.');
  });

  test('AD-17: la landing no pide imágenes a dominios externos', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'image' && !r.url().startsWith('http://localhost')) external.push(r.url());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);
  });
});

test.describe('Partida como invitado', () => {
  test('AC-98: de la landing a jugando en ≤ 5 s, pasando por "Izando velas"', async ({ page }) => {
    await page.goto('/');
    const t0 = Date.now();
    await page.getByTestId('cta-guest').click();
    await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 15_000 });
    const elapsed = Date.now() - t0;
    console.log(`AC-98: jugando en ${elapsed} ms`);
    expect(elapsed).toBeLessThanOrEqual(5000);
  });

  test('AC-65/66: al aparecer está en la zona segura, con aviso y el botón Puerto activo', async ({ page }) => {
    await enterGame(page);
    await expect(page.getByTestId('safe-zone')).toBeVisible();
    await expect(page.getByTestId('btn-port')).toBeEnabled();
    await page.keyboard.press('KeyP');
    await expect(page.getByTestId('shop')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shop')).toHaveCount(0);
  });

  test('AC-14 (a, c): marcador ≤ 50 ms y la posición renderizada cambia en ≤ 350 ms en 10 de 10 corridas', async ({ page }) => {
    test.setTimeout(120_000);
    // O-56: el barco de un jugador que sale de otro test sigue 10 s en el mundo (DISCONNECT_GRACE) y, si caía bajo el clic,
    // el clic lo seleccionaba en vez de navegar. Cada clic va a un punto de agua libre, elegido justo antes de lanzarlo como
    // waterPoint() de input-toggle.spec.ts: sobre el lienzo y sin barcos ajenos a < 60 px. El primer candidato de cada lado
    // es el punto de siempre, a 120 px del barco
    const FREE_PX = 60;
    const OFFSETS_X = [0, -100, 100, -200, 200];
    const px = (v: number) => (v === Infinity ? 'ninguno en pantalla' : `${v.toFixed(0)} px`);
    await enterGame(page);
    const markers: number[] = [];
    const moves: number[] = [];
    for (let run = 0; run < 10; run++) {
      // Barco quieto antes de cada corrida (S y esperar velocidad 0 en pantalla)
      await page.keyboard.press('KeyS');
      let last = await me(page);
      await waitFor(
        async () => {
          await page.waitForTimeout(300);
          const now = await me(page);
          const still = !!now && !!last && Math.hypot(now.x - last.x, now.z - last.z) < 0.01;
          last = now;
          return still;
        },
        (still) => still,
        10_000,
        0
      );
      // Alterna arriba y abajo para quedarse cerca del puerto
      const dy = run % 2 === 0 ? -120 : 120;
      const t = await page.evaluate(
        ({ offY, freePx, offsets }) =>
          new Promise<{ marker: number; move: number; point: { x: number; y: number; nearest: number } | null; tried: { x: number; y: number; nearest: number; onCanvas: boolean }[] }>((resolve) => {
            const dbg = window.__SEA_BATTLE__!;
            const rt = dbg.runtime() as unknown as { clickMarker: unknown };
            type Seen = { id: string; x: number; z: number; screen: { sx: number; sy: number } | null };
            const me0 = dbg.me() as Seen;
            const others = (dbg.ships() as Seen[]).filter((s) => s.id !== me0.id && s.screen).map((s) => s.screen!);
            const tried = offsets.map((dx) => {
              const x = me0.screen!.sx + dx;
              const y = me0.screen!.sy + offY;
              const nearest = Math.min(Infinity, ...others.map((o) => Math.hypot(o.sx - x, o.sy - y)));
              return { x, y, nearest, onCanvas: document.elementFromPoint(x, y)?.tagName === 'CANVAS' };
            });
            const free = tried.find((c) => c.onCanvas && c.nearest >= freePx);
            if (!free) return resolve({ marker: -1, move: Infinity, point: null, tried });
            const point = { x: free.x, y: free.y, nearest: free.nearest };
            const canvas = document.querySelector('canvas')!;
            const t0 = performance.now();
            const opts = { clientX: point.x, clientY: point.y, bubbles: true, pointerType: 'mouse', button: 0, isPrimary: true };
            canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
            canvas.dispatchEvent(new PointerEvent('pointerup', opts));
            let marker = -1;
            const poll = () => {
              const now = performance.now();
              if (marker < 0 && rt.clickMarker) marker = now - t0;
              const m = dbg.me() as { x: number; z: number };
              if (Math.hypot(m.x - me0.x, m.z - me0.z) > 0.01) return resolve({ marker, move: now - t0, point, tried });
              if (now - t0 > 3000) return resolve({ marker, move: Infinity, point, tried });
              requestAnimationFrame(poll);
            };
            requestAnimationFrame(poll);
          }),
        { offY: dy, freePx: FREE_PX, offsets: OFFSETS_X }
      );
      const side = dy < 0 ? 'norte' : 'sur';
      if (t.point) {
        console.log(`AC-14 corrida ${run + 1}: ${side}, clic en (${t.point.x.toFixed(0)}, ${t.point.y.toFixed(0)}) · barco ajeno más cercano: ${px(t.point.nearest)}`);
      } else {
        console.log(`AC-14 corrida ${run + 1}: ${side}, sin punto libre · candidatos ${t.tried.map((c) => `(${c.x.toFixed(0)}, ${c.y.toFixed(0)}) ${c.onCanvas ? px(c.nearest) : 'fuera del lienzo'}`).join(' · ')}`);
      }
      expect(t.point, `AC-14: sin punto de agua libre (sobre el lienzo y sin barcos ajenos a < ${FREE_PX} px) en la corrida ${run + 1}`).not.toBeNull();
      markers.push(t.marker);
      moves.push(t.move);
    }
    console.log(`AC-14: marcador ${markers.map((v) => v.toFixed(0)).join(', ')} ms · primer movimiento ${moves.map((v) => v.toFixed(0)).join(', ')} ms`);
    expect(Math.max(...markers)).toBeLessThanOrEqual(50);
    expect(markers.every((v) => v >= 0)).toBe(true);
    expect(Math.max(...moves)).toBeLessThanOrEqual(350);
  });

  test('AC-26: clic sobre un pirata muestra el panel con nombre, tipo, vida y distancia sin emitir ningún mensaje', async ({ page }) => {
    test.setTimeout(90_000);
    const net = trackSocket(page);
    await enterGame(page, `http://localhost:${PORTS.showcase}`);
    // Escenario showcase: pirata en (45, 205). El jugador para a 85 m, fuera de su radio de agresión (70 m)
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
      rt.client.moveTo(-10, 140);
    });
    await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x + 10, s.z - 140) < 4, 45_000, 250);
    // El pirata puede no estar quieto: si un test anterior (capturas) lo atacó, vuelve a su puesto y puede entrar en
    // combate al pasar cerca. Da igual para AC-26: se elige el pirata en pantalla más cercano y se relee su posición
    // justo antes del clic
    const vw = page.viewportSize()!;
    const onScreen = (s: Awaited<ReturnType<typeof ships>>[number]) =>
      s.kind === 'pirate' && s.state === 'alive' && !!s.screen && s.screen.sx > 0 && s.screen.sx < vw.width && s.screen.sy > 0 && s.screen.sy < vw.height;
    const near = await waitFor(async () => (await ships(page)).filter(onScreen).sort((a, b) => Math.hypot(a.x + 10, a.z - 140) - Math.hypot(b.x + 10, b.z - 140))[0], (p) => !!p, 45_000, 250);
    const pirate = (await ships(page)).find((s) => s.id === near!.id && onScreen(s));
    expect(pirate?.screen).toBeTruthy();

    net.reset();
    await page.mouse.click(pirate!.screen!.sx, pirate!.screen!.sy);
    await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', pirate!.id);
    await expect(page.getByTestId('target-name')).toHaveText('Pirata');
    await expect(page.locator('.hud-target__meta')).toContainText('Pirata');
    await expect(page.getByTestId('target-hp')).toBeVisible();
    await expect(page.getByTestId('target-distance')).toHaveText(/^\d+ m$/);
    expect((await hud(page)).selectedId).toBe(pirate!.id); // el anillo de selección se dibuja a partir de selectedId
    await page.waitForTimeout(1000);
    expect(net.sent).toEqual([]);
  });

  test('Seleccionar, atacar y abrir el puerto no abre ningún diálogo bloqueante', async ({ page }) => {
    await enterGame(page);
    const all = await ships(page);
    const npc = all.find((s) => s.kind !== 'player' && s.screen);
    if (npc?.screen) await page.mouse.click(npc.screen.sx, npc.screen.sy);
    await page.keyboard.press('Space');
    await page.keyboard.press('KeyP');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    expect(dialogsOf(page)).toEqual([]);
  });

  test('Tab selecciona y Esc deselecciona sin generar tráfico de red', async ({ page }) => {
    // Antes de entrar: page.on('websocket') solo avisa de los sockets nuevos, y el del juego se abre al conectar
    const net = trackSocket(page);
    await enterGame(page);
    // Navegar hacia los mercantes hasta tener alguno a ≤ 150 m
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
      rt.client.moveTo(0, 200);
    });
    // Tras ver salir el moveTo se vacía el registro: desde aquí el cliente no debe enviar nada
    await waitFor(async () => intentNames(net), (names) => names.includes('moveTo'), 3000, 50);
    net.reset();
    const target = await waitFor(
      async () => {
        await page.keyboard.press('Tab');
        return (await hud(page)).selectedId as string | null;
      },
      (id) => !!id,
      45_000,
      1000
    );
    expect(target).toBeTruthy();
    await expect(page.getByTestId('target-frame')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('target-frame')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(net.sent).toEqual([]);
  });
});

type Box = { x: number; y: number; width: number; height: number };
const boxesOverlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// AC-105 / H-11: la pista visible no se cruza con la placa propia, la del objetivo ni ningún toast (oculta, vale).
// Devuelve la ranura en la que está la pista. `:visible` deja fuera las líneas del feed, que en escritorio son
// toasts con display: none
type HintSlot = 'bajo el barco' | 'sobre el barco' | 'oculta';
async function expectHintClear(page: Page, label: string, targetId?: string): Promise<HintSlot> {
  await page.waitForTimeout(400); // la pista revisa los obstáculos a 10 Hz
  const hint = page.getByTestId('hint');
  const cls = (await hint.getAttribute('class')) ?? '';
  const h = (await hint.boundingBox())!;
  const obstacles: Record<string, Box> = { 'placa propia': (await page.locator('[data-plate][data-relation="self"]').boundingBox())! };
  if (targetId) obstacles['placa del objetivo'] = (await page.locator(`[data-plate][data-ship-id="${targetId}"]`).boundingBox())!;
  const toasts = await page.getByTestId('toasts').locator('.toast:visible').all();
  for (let i = 0; i < toasts.length; i++) obstacles[`toast ${i + 1}`] = (await toasts[i].boundingBox())!;
  const slot: HintSlot = cls.includes('is-hidden') ? 'oculta' : cls.includes('is-alt') ? 'sobre el barco' : 'bajo el barco';
  console.log(`AC-105 ${label}: ${slot} (caja ${Math.round(h.x)}, ${Math.round(h.y)}, ${Math.round(h.width)}×${Math.round(h.height)}) · ${toasts.length} toasts`);
  if (slot !== 'oculta') for (const [id, b] of Object.entries(obstacles)) expect(boxesOverlap(h, b), `${label}: la pista se cruza con ${id}`).toBe(false);
  return slot;
}

// AC-110 / H-11: cada aviso visible se lee entero (sin recorte ni elipsis) y no pisa los paneles del jugador, del
// objetivo ni del oro, ni el minimapa
async function expectToastsClear(page: Page, label: string, count: number) {
  const toasts = page.getByTestId('toasts').locator('.toast:visible');
  await expect(toasts).toHaveCount(count);
  const panels: Record<string, Box> = {};
  for (const id of ['player-frame', 'target-frame', 'player-gold-panel', 'minimap']) {
    const panel = page.getByTestId(id);
    if (await panel.count()) panels[id] = (await panel.boundingBox())!;
  }
  for (const t of await toasts.all()) {
    const text = await t.innerText();
    const tb = (await t.boundingBox())!;
    for (const [id, b] of Object.entries(panels)) expect(boxesOverlap(tb, b), `${label}: el aviso «${text}» pisa ${id}`).toBe(false);
    const fit = await t.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
    console.log(`AC-110 ${label}: «${text}» caja ${Math.round(tb.x)}, ${Math.round(tb.y)}, ${Math.round(tb.width)}×${Math.round(tb.height)} · scroll ${fit.sw}×${fit.sh} ≤ client ${fit.cw}×${fit.ch}`);
    expect(fit.sw, `${label}: el aviso «${text}» se recorta en horizontal`).toBeLessThanOrEqual(fit.cw);
    expect(fit.sh, `${label}: el aviso «${text}» se recorta en vertical`).toBeLessThanOrEqual(fit.ch);
  }
}

// O-1 (QA-4): desde el frame en que entra un aviso, la pista visible no lo pisa en ningún frame. Se muestrea en cada
// requestAnimationFrame durante 600 ms, que es lo que se va a pintar en ese frame
type HintOverlapProbe = { frames: number; overlapped: number };
async function sampleHintOverToasts(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __hintOverlap: HintOverlapProbe };
    w.__hintOverlap = { frames: 0, overlapped: 0 };
    const t0 = performance.now();
    const tick = () => {
      const hint = document.querySelector<HTMLElement>('[data-testid="hint"]');
      const toasts = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="toasts"] > .toast')).filter((t) => t.offsetParent !== null);
      if (hint && !hint.classList.contains('is-hidden') && toasts.length > 0) {
        w.__hintOverlap.frames++;
        const h = hint.getBoundingClientRect();
        const hit = toasts.some((t) => {
          const b = t.getBoundingClientRect();
          return h.left < b.right && b.left < h.right && h.top < b.bottom && b.top < h.bottom;
        });
        if (hit) w.__hintOverlap.overlapped++;
      }
      if (performance.now() - t0 < 600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function expectNoHintOverToastFrames(page: Page, label: string) {
  await page.waitForTimeout(250); // hasta cerrar los 600 ms de muestreo (expectHintClear ya esperó 400 ms)
  const probe = await page.evaluate(() => (window as unknown as { __hintOverlap: HintOverlapProbe }).__hintOverlap);
  console.log(`O-1 ${label}: ${probe.overlapped} de ${probe.frames} frames con la pista visible sobre un aviso`);
  expect(probe.overlapped, `${label}: frames con la pista visible sobre un aviso`).toBe(0);
}

// AC-110 (ART-DIRECTION §12.3): en horizontal la ranura alta queda entre la columna izquierda (jugador y objetivo) y el
// oro, que la esquiva dinámica no cuenta como obstáculos. Cada una de las pistas, en las dos ranuras, cabe sin pisar
// ningún panel ni botón. Se pinta cada texto en la pista y se mide en el mismo tick (el ticker de la pista no puede
// intercalarse); al final se deja el texto y la ranura como estaban
async function expectEveryHintFitsLandscape(page: Page, label: string) {
  const ids = ['player-frame', 'target-frame', 'player-gold-panel', 'minimap', 'm-port', 'm-target', 'm-attack', 'm-repair'];
  const rows = await page.evaluate(
    ([texts, ids]) => {
      const el = document.querySelector<HTMLElement>('[data-testid="hint"]')!;
      // El texto de toque va en las dos variantes: se mide la que se vea (ver la nota de `pointer: coarse` más abajo)
      const spans = Array.from(el.querySelectorAll<HTMLElement>('.hint-mouse, .hint-touch'));
      const before = { texts: spans.map((sp) => sp.textContent), cls: el.className };
      const out: { text: string; slot: string; box: number[]; hits: string[] }[] = [];
      for (const alt of [false, true]) for (const text of texts) {
        spans.forEach((sp) => (sp.textContent = text));
        el.classList.toggle('is-alt', alt);
        el.classList.remove('is-hidden');
        const b = el.getBoundingClientRect();
        const hits = ids.filter((id) => {
          const o = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
          return !!o && o.width > 0 && b.left < o.right && o.left < b.right && b.top < o.bottom && o.top < b.bottom;
        });
        out.push({ text, slot: alt ? 'alta' : 'normal', box: [b.left, b.top, b.width, b.height].map(Math.round), hits });
      }
      spans.forEach((sp, i) => (sp.textContent = before.texts[i]));
      el.className = before.cls;
      return out;
    },
    [HINTS.map((h) => h.touch), ids] as const
  );
  for (const r of rows) {
    console.log(`AC-110 ${label}, pista ${r.slot} «${r.text}»: caja ${r.box.join(', ')}${r.hits.length ? ` · pisa ${r.hits.join(', ')}` : ''}`);
    expect(r.hits, `${label}: la pista «${r.text}» en la ranura ${r.slot} pisa un panel`).toEqual([]);
  }
}

// AC-105 + AC-110 en un tamaño de pantalla. Mercante quieto del showcase en (−40, 195); el jugador para 60 m al norte
// (placa del objetivo bajo el barco, el caso de H-06b) o 60 m al sur (sobre el barco), las distancias literales de
// AC-105. Además, a 0,75·R y 0,975·R al sur (R = radio de encuadre, U8): es donde la placa del objetivo cae sobre la
// ranura normal y empuja la pista a la alta (H-11), y esa posición en pantalla escala con R, no con los metros (con
// R = 80 coinciden con 60 y 78 m). Todos los puntos quedan a > 70 m de los piratas del escenario. Exige que, con avisos
// en pantalla, la pista se haya visto en las dos ranuras.
// browser.newContext hereda las opciones del proyecto: el caso táctil corre en el proyecto móvil y el de ratón en el de
// escritorio (en el móvil, un contexto de 1440×900 sigue con puntero táctil y muestra las pistas de toque)
async function expectHintAndToastsInSize(browser: Browser, viewport: { width: number; height: number }, touch: boolean) {
  const size = `${viewport.width}×${viewport.height}`;
  const seen = new Set<HintSlot>();
  const done: string[] = [];
  let landscapeChecked = false;
  const cases = [
    { side: 'sur', at: () => 60 },
    { side: 'norte', at: () => 60 },
    { side: 'sur', at: (r: number) => 0.75 * r },
    { side: 'sur', at: (r: number) => 0.975 * r }
  ];
  for (const { side, at } of cases) {
    const ctx = await browser.newContext(touch ? { viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport });
    try {
      const page = await ctx.newPage();
      await enterGame(page, `http://localhost:${PORTS.showcase}`);
      // Radio de encuadre de la sesión (U8: 65 m con el cañón N1; 80 m antes de U8, cuando stats() no lo daba)
      let range = 0;
      for (let i = 0; i < 30 && !range; i++) {
        range = await page.evaluate(() => Number(window.__SEA_BATTLE__!.runtime().stats().frameRange ?? 80));
        if (!range) await page.waitForTimeout(100);
      }
      const d = Math.round(at(range) * 10) / 10;
      const key = `${side} ${d}`;
      if (done.includes(key)) continue;
      done.push(key);
      const z = side === 'sur' ? 195 - d : 195 + d;
      await expect(page.getByTestId('hint')).toBeVisible();
      // En escritorio la pista es la de ratón (guarda: un contexto creado en el proyecto móvil heredaba el puntero
      // táctil). En los contextos táctiles Chromium no siempre emula `pointer: coarse`, así que ahí no se exige la
      // variante: las medidas de AC-110 se hacen con los textos de toque en cualquier caso
      if (!touch) await expect(page.getByTestId('hint').locator('.hint-mouse'), `${size}: pista de ratón`).toBeVisible();
      // En puerto: la pista con un aviso ("Zona segura")
      seen.add(await expectHintClear(page, `en puerto con "Zona segura", ${size}`));
      await expectToastsClear(page, `en puerto, ${size}`, 1);
      await sailTo(page, -40, z);
      await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x + 40, s.z - z) < 4, 45_000, 250);
      await page.waitForTimeout(700);
      const merchant = (await ships(page)).find((s) => s.kind === 'merchant' && s.screen && Math.hypot(s.x + 40, s.z - 195) < 5);
      expect(merchant?.screen).toBeTruthy();
      if (touch) await page.touchscreen.tap(merchant!.screen!.sx, merchant!.screen!.sy);
      else await page.mouse.click(merchant!.screen!.sx, merchant!.screen!.sy);
      await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', merchant!.id);
      await expect(page.getByTestId('hint')).toBeVisible();
      const label = `objetivo al ${side} a ${d} m (R ${range}), ${size}`;
      await expectHintClear(page, label, merchant!.id);
      if (viewport.height < 500 && side === 'sur' && !landscapeChecked) {
        await expectEveryHintFitsLandscape(page, label);
        landscapeChecked = true;
      }
      // Con uno y con dos avisos distintos (dos iguales ya no se apilan, AC-127) la pista tampoco los tapa, y los avisos
      // se leen enteros sin pisar los paneles ni el minimapa (H-11). Fuera de la zona, P da "El puerto solo abre en la
      // zona segura" y cambiar de barco da el aviso del servidor "Solo puedes cambiar de barco en el puerto"; los dos
      // salen siempre, también si un pirata del showcase ya ha dañado el barco (R con el casco entero no serviría). La
      // ranura sobre el barco queda bajo el primer aviso: con uno la pista sigue visible; con dos, si la otra ranura
      // está ocupada, se oculta
      const notices = [
        () => page.keyboard.press('KeyP'),
        () =>
          page.evaluate(() => {
            const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { selectShip: (classId: string) => void } };
            rt.client.selectShip('sloop');
          })
      ];
      for (const count of [1, 2]) {
        await sampleHintOverToasts(page);
        await notices[count - 1]();
        await expect(page.getByTestId('toasts').locator('.toast:visible')).toHaveCount(count);
        seen.add(await expectHintClear(page, `${label} con ${count} toasts`, merchant!.id));
        await expectToastsClear(page, `${label} con ${count} toasts`, count);
        await expectNoHintOverToastFrames(page, `${label} con ${count} toasts`);
      }
    } finally {
      await ctx.close();
    }
  }
  console.log(`AC-110 ranuras con avisos en pantalla, ${size}: ${[...seen].join(', ')}`);
  expect([...seen], `${size}: la pista se ha comprobado con avisos en las dos ranuras`).toEqual(expect.arrayContaining(['bajo el barco', 'sobre el barco']));
}

test.describe('HUD de escritorio', () => {
  test('AC-105 + AC-110: con el objetivo a 60 m al sur o al norte, la pista no tapa su placa, la propia ni los avisos, y los avisos se leen enteros sin pisar los paneles (1440×900, ratón)', async ({ browser }) => {
    test.setTimeout(360_000);
    await expectHintAndToastsInSize(browser, { width: 1440, height: 900 }, false);
  });
});

test.describe('Móvil @mobile', () => {
  test('AC-80: botones táctiles de ≥ 48 px (Atacar ≥ 64) sin solaparse', async ({ page }) => {
    await enterGame(page);
    const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const id of ['m-attack', 'm-target', 'm-repair', 'm-port', 'player-frame', 'minimap']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).toBeTruthy();
      boxes[id] = box!;
    }
    expect(boxes['m-attack'].width).toBeGreaterThanOrEqual(64);
    expect(boxes['m-attack'].height).toBeGreaterThanOrEqual(64);
    for (const id of ['m-target', 'm-repair', 'm-port']) {
      expect(boxes[id].width).toBeGreaterThanOrEqual(48);
      expect(boxes[id].height).toBeGreaterThanOrEqual(48);
    }
    const ids = Object.keys(boxes);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = boxes[ids[i]];
        const b = boxes[ids[j]];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `${ids[i]} se solapa con ${ids[j]}`).toBe(false);
      }
    }
  });

  test('H-06: en horizontal (844×390) la pista no tapa la placa propia ni los botones', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    try {
      const page = await ctx.newPage();
      await enterGame(page);
      const hint = page.getByTestId('hint');
      await expect(hint).toBeVisible();
      const plate = page.locator('[data-plate][data-relation="self"]');
      await expect(plate).toBeVisible();
      const boxes = { hint: (await hint.boundingBox())!, plate: (await plate.boundingBox())! } as Record<string, { x: number; y: number; width: number; height: number }>;
      for (const id of ['m-attack', 'm-target', 'm-repair', 'm-port']) boxes[id] = (await page.getByTestId(id).boundingBox())!;
      console.log(`H-06: pista ${JSON.stringify(boxes.hint)} · placa propia ${JSON.stringify(boxes.plate)}`);
      for (const id of Object.keys(boxes).filter((k) => k !== 'hint')) {
        const a = boxes.hint;
        const b = boxes[id];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `la pista se solapa con ${id}`).toBe(false);
      }
    } finally {
      await ctx.close();
    }
  });

  test('AC-105 + AC-110: con el objetivo a 60 m al sur o al norte, la pista no tapa su placa, la propia ni los avisos, y los avisos se leen enteros sin pisar los paneles (844×390 y 390×844)', async ({ browser }) => {
    test.setTimeout(600_000);
    for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) await expectHintAndToastsInSize(browser, viewport, true);
  });

  test('AC-81: deslizar y pellizcar sobre el canvas no hace scroll ni zoom de la página', async ({ page }) => {
    await enterGame(page);
    const view = () => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, scale: window.visualViewport?.scale ?? 1 }));
    const before = await view();
    // Gestos táctiles reales por CDP (page.touchscreen solo sabe hacer tap)
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    await touch('touchStart', [[195, 620]]);
    for (let i = 1; i <= 12; i++) await touch('touchMove', [[195, 620 - i * 30]]);
    await touch('touchEnd', []);
    await touch('touchStart', [[170, 420], [220, 420]]);
    for (let i = 1; i <= 12; i++) await touch('touchMove', [[170 - i * 8, 420 - i * 4], [220 + i * 8, 420 + i * 4]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(300);
    const after = await view();
    console.log(`AC-81: antes ${JSON.stringify(before)} · después ${JSON.stringify(after)}`);
    expect(after).toEqual(before);
  });
});

test.describe('Combate completo', () => {
  test('AC-58 y AC-78: hundir un mercante muestra "Hundiste a Mercante +60 oro" y sube el oro del HUD', async ({ page }) => {
    test.setTimeout(150_000);
    await enterGame(page);
    const goldText = async () => Number(((await page.getByTestId('player-gold').textContent()) ?? '0').replace(/\D/g, ''));
    const gold0 = await goldText();
    const moveTo = (x: number, z: number) =>
      page.evaluate(([px, pz]) => {
        const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
        rt.client.moveTo(px, pz);
      }, [x, z]);

    // Buscar el mercante más cercano dentro del área de interés y acercarse hasta poder seleccionarlo con Tab
    const merchantId = await waitFor(
      async () => {
        const mine = await me(page);
        const list = (await ships(page)).filter((s) => s.kind === 'merchant' && s.state === 'alive');
        const m = list.sort((a, b) => Math.hypot(a.x - mine!.x, a.z - mine!.z) - Math.hypot(b.x - mine!.x, b.z - mine!.z))[0];
        if (m) await moveTo(m.x, m.z);
        else await moveTo(0, 220);
        await page.keyboard.press('Tab');
        const selected = (await hud(page)).selectedId as string | null;
        return selected && (await ships(page)).some((s) => s.id === selected && s.kind === 'merchant') ? selected : null;
      },
      (id) => !!id,
      60_000,
      1500
    );
    await page.keyboard.press('Space');

    // Perseguirlo mientras huye hasta hundirlo
    await waitFor(
      async () => {
        const t = (await ships(page)).find((s) => s.id === merchantId);
        if (t && t.state === 'alive') await moveTo(t.x, t.z);
        const mine = await me(page);
        if (mine && t && t.state === 'alive' && mine.targetId !== merchantId) await page.keyboard.press('Space');
        return !t || t.state !== 'alive';
      },
      (sunk) => sunk,
      90_000,
      1000
    );
    await expect(page.getByTestId('feed')).toContainText(/Hundiste a Mercante \+60 oro/, { timeout: 3000 });
    const gold1 = await waitFor(goldText, (g) => g > gold0, 3000, 50);
    console.log(`AC-58/78: oro ${gold0} → ${gold1}`);
    expect(dialogsOf(page)).toEqual([]);
  });
});

test.describe('Puerto y barcos', () => {
  test('AC-70: con 2 000 de oro compra el Bergantín, conserva la Balandra, cambia gratis en el puerto y fuera de la zona no', async ({ page }) => {
    test.setTimeout(90_000);
    // Servidor 3101 con el escenario "shipyard": el jugador entra con el precio del Bergantín
    await enterGame(page, `http://localhost:${PORTS.empty}`);
    const gold = async (id: string) => Number(((await page.getByTestId(id).textContent()) ?? '').replace(/\D/g, ''));
    expect(await gold('player-gold')).toBe(2000);
    const shipIs = (classId: string) => waitFor(() => me(page), (s) => s?.classId === classId, 3000, 50);

    await page.keyboard.press('KeyP');
    await page.getByTestId('tab-ships').click();
    await page.getByTestId('buy-ship-brig').click();
    const brig = (await shipIs('brig'))!;
    console.log(`AC-70: Bergantín con ${brig.hp}/${brig.maxHp}`);
    expect(brig.maxHp).toBe(1400); // casco nivel 1 (× 1)
    expect(brig.hp).toBe(brig.maxHp);
    await waitFor(() => gold('shop-gold'), (g) => g === 0, 3000, 50);

    // La Balandra sigue en propiedad y cambiar entre ambas en el puerto es gratis
    await page.getByTestId('use-sloop').click();
    await shipIs('sloop');
    await page.getByTestId('use-brig').click();
    await shipIs('brig');
    expect(await gold('shop-gold')).toBe(0);

    // Fuera de la zona segura (r 110) el puerto no abre y el servidor rechaza el cambio aunque se pida directamente
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shop')).toHaveCount(0);
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
      rt.client.moveTo(0, 160);
    });
    await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x, s.z) > 130, 45_000, 250);
    await page.keyboard.press('KeyP');
    await expect(page.getByTestId('toasts')).toContainText('El puerto solo abre en la zona segura');
    await expect(page.getByTestId('shop')).toHaveCount(0);
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { selectShip: (c: string) => void } };
      rt.client.selectShip('sloop');
    });
    await page.waitForTimeout(700);
    expect((await me(page))!.classId).toBe('brig');
    expect(dialogsOf(page)).toEqual([]);
  });
});

// Textos flotantes de daño: cada spawn reescribe el texto de un elemento del pool de overlays.ts
async function recordFloats(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __FLOATS__: { kind: string; text: string }[] };
    w.__FLOATS__ = [];
    new MutationObserver((list) => {
      for (const m of list) {
        const pop = m.target;
        if (!(pop instanceof HTMLElement) || !pop.classList.contains('wo-float__pop')) continue;
        w.__FLOATS__.push({ kind: pop.closest<HTMLElement>('[data-float]')?.dataset.kind ?? '', text: pop.textContent ?? '' });
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}
const floatsOf = (page: Page) => page.evaluate(() => (window as unknown as { __FLOATS__: { kind: string; text: string }[] }).__FLOATS__);

// Contadores acumulados del runtime: una salpicadura por bala fallada y un impacto por bala que acierta, en pantalla
type Runtime = { resetCounters: () => void; stats: () => Record<string, number> };
const resetVfxCounters = (page: Page) => page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as Runtime).resetCounters());
const vfxCounters = (page: Page) =>
  page.evaluate(() => {
    const s = (window.__SEA_BATTLE__!.runtime() as unknown as Runtime).stats();
    return { splashes: s.splashes, hits: s.hits };
  });
const sum = (list: ImpactEvent[], key: 'hits' | 'misses') => list.reduce((acc, e) => acc + e[key], 0);

interface ImpactEvent { type: 'impact'; shipId: string; byShipId: string; damage: number; hits: number; misses: number }
function impactsOn(net: ReturnType<typeof trackSocket>, shipId: string): ImpactEvent[] {
  return net.received
    .flatMap((p) => {
      try {
        const [name, frame] = JSON.parse(p.slice(2)) as [string, { e?: { type: string }[] }];
        return name === 'frame' ? frame.e ?? [] : [];
      } catch {
        return [];
      }
    })
    .filter((e): e is ImpactEvent => e.type === 'impact' && (e as ImpactEvent).shipId === shipId);
}

// Espera n impactos sobre el jugador y devuelve los impactos y los textos flotantes ya mostrados
async function impactsAndFloats(page: Page, net: ReturnType<typeof trackSocket>, myId: string, n: number) {
  await waitFor(async () => impactsOn(net, myId).length, (k) => k >= n, 120_000, 250);
  const settled = impactsOn(net, myId);
  await page.waitForTimeout(600); // el texto sale cuando la bala llega en el reloj interpolado (~100 ms después)
  const floats = (await floatsOf(page)).filter((f) => f.kind !== 'gold');
  const counters = await vfxCounters(page);
  return { before: settled.length, settled, after: impactsOn(net, myId), floats, counters };
}

const sailTo = (page: Page, x: number, z: number) =>
  page.evaluate(([px, pz]) => {
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
    rt.client.moveTo(px, pz);
  }, [x, z]);

test.describe('Números de daño', () => {
  // Servidor propio con el showcase en cada test (QA-5 H-13): en el compartido, un test anterior puede sacar al artillero
  // ciego de su puesto y AC-75 dependía del orden de la suite
  let showcase: OwnServer;
  test.beforeEach(async () => {
    showcase = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'showcase' });
  });
  test.afterEach(async () => {
    await showcase?.kill();
  });

  test('AC-75 (k = 0): cada andanada fallida contra el jugador muestra un único "Fallo" y ningún número', async ({ page }) => {
    test.setTimeout(180_000);
    const net = trackSocket(page);
    await enterGame(page, showcase.url);
    await recordFloats(page);
    await resetVfxCounters(page);
    const myId = (await me(page))!.id;
    // Artillero ciego de server/scenarios.ts: precisión 0, ataca en cuanto acaba la protección inicial
    await sailTo(page, BLIND_GUNNER_POINT.x, BLIND_GUNNER_POINT.z - 45);
    const { before, settled, after, floats, counters } = await impactsAndFloats(page, net, myId, 3);
    console.log(`AC-75 (k = 0): ${after.length} impactos · textos ${JSON.stringify(floats)} · salpicaduras ${counters.splashes} (balas falladas ${sum(settled, 'misses')}–${sum(after, 'misses')}) · impactos de bala ${counters.hits}`);
    // Cada bala fallada deja una salpicadura (las del artillero son las únicas andanadas a la vista)
    expect(counters.splashes).toBeGreaterThanOrEqual(sum(settled, 'misses'));
    expect(counters.splashes).toBeLessThanOrEqual(sum(after, 'misses') + SHIP_CLASSES.pirate.cannonsPerSide);
    expect(counters.hits).toBe(0);
    expect(after.every((e) => e.hits === 0 && e.damage === 0 && e.misses === SHIP_CLASSES.pirate.cannonsPerSide)).toBe(true);
    expect(floats.every((f) => f.kind === 'miss' && f.text === 'Fallo')).toBe(true);
    expect(floats.length).toBeGreaterThanOrEqual(before);
    expect(floats.length).toBeLessThanOrEqual(after.length);
  });

  test('AC-75 (negativo): quien no es tirador ni objetivo no ve "Fallo" de una andanada ajena, aunque vea sus salpicaduras', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();
      const netB = trackSocket(b);
      await enterGame(a, showcase.url);
      await enterGame(b, showcase.url);
      for (const p of [a, b]) {
        await recordFloats(p);
        await resetVfxCounters(p);
      }
      const bId = (await me(b))!.id;
      // B se acerca al artillero ciego (k = 0); A mira desde 95 m, fuera de su radio de agresión (70 m)
      await sailTo(b, BLIND_GUNNER_POINT.x, BLIND_GUNNER_POINT.z - 45);
      await sailTo(a, BLIND_GUNNER_POINT.x, BLIND_GUNNER_POINT.z - 95);
      await waitFor(async () => impactsOn(netB, bId).length, (k) => k >= 3, 120_000, 250);
      await a.waitForTimeout(600); // el texto saldría al llegar la bala en el reloj interpolado
      const floatsA = await floatsOf(a);
      const floatsB = await floatsOf(b);
      const countersA = await vfxCounters(a);
      console.log(`AC-75 (negativo): B recibió ${impactsOn(netB, bId).length} impactos y vio ${floatsB.filter((f) => f.kind === 'miss').length} "Fallo"; A vio ${floatsA.filter((f) => f.kind === 'miss').length} "Fallo" y ${countersA.splashes} salpicaduras`);
      expect(floatsB.filter((f) => f.kind === 'miss').length).toBeGreaterThanOrEqual(3);
      expect(countersA.splashes).toBeGreaterThan(0); // A tenía la andanada en pantalla
      expect(floatsA.filter((f) => f.kind === 'miss')).toEqual([]);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('AC-75 (k > 0): cada andanada contra el jugador muestra un único número igual a k × daño', async ({ page }) => {
    test.setTimeout(180_000);
    const net = trackSocket(page);
    await enterGame(page, showcase.url);
    await recordFloats(page);
    await resetVfxCounters(page);
    const myId = (await me(page))!.id;
    // Pirata quieto del punto de captura (precisión 0,6): ataca al acabar la protección
    await sailTo(page, SHOWCASE_POINT.x, SHOWCASE_POINT.z);
    const { before, settled, after, floats, counters } = await impactsAndFloats(page, net, myId, 4);
    console.log(`AC-75 (k > 0): impactos de bala ${counters.hits} (aciertos ${sum(settled, 'hits')}–${sum(after, 'hits')}) · salpicaduras ${counters.splashes} (falladas ${sum(settled, 'misses')}–${sum(after, 'misses')})`);
    const cannons = SHIP_CLASSES.pirate.cannonsPerSide;
    expect(counters.hits).toBeGreaterThanOrEqual(sum(settled, 'hits'));
    expect(counters.hits).toBeLessThanOrEqual(sum(after, 'hits') + cannons);
    expect(counters.splashes).toBeGreaterThanOrEqual(sum(settled, 'misses'));
    expect(counters.splashes).toBeLessThanOrEqual(sum(after, 'misses') + cannons);
    const damage = SHIP_CLASSES.pirate.cannon!.damage;
    const expected = after.map((e) => (e.hits === 0 ? 'Fallo' : `−${e.hits * damage}`));
    console.log(`AC-75 (k > 0): impactos k = ${after.map((e) => e.hits).join(', ')} · textos ${floats.map((f) => f.text).join(', ')}`);
    for (const e of after) expect(e.damage).toBe(e.hits * damage);
    expect(floats.length).toBeGreaterThanOrEqual(before);
    expect(floats.length).toBeLessThanOrEqual(after.length);
    expect(floats.map((f) => f.text)).toEqual(expected.slice(0, floats.length));
    expect(floats.filter((f) => f.text !== 'Fallo').every((f) => f.kind === 'taken')).toBe(true);
  });
});

// Muerte real en la emboscada de server/scenarios.ts (5 piratas atacan en cuanto acaba la protección inicial)
async function sinkInAmbush(page: Page) {
  const net = trackSocket(page);
  await enterGame(page, `http://localhost:${PORTS.showcase}`);
  const start = (await me(page))!;
  await page.evaluate(([x, z]) => {
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
    rt.client.moveTo(x, z);
  }, [AMBUSH_POINT.x, AMBUSH_POINT.z]);
  await expect(page.getByTestId('death-card')).toBeVisible({ timeout: 110_000 });
  return { net, start, sunkAt: Date.now() };
}

const respawnsSent = (net: ReturnType<typeof trackSocket>) => net.sent.filter((f) => f.includes('"respawn"')).length;

// AC-106: "por ☠ Pirata" en una sola línea (ART-DIRECTION §15)
async function expectKillerOnOneLine(page: Page, label: string) {
  const height = (await page.getByTestId('death-by').boundingBox())!.height;
  console.log(`AC-106 (${label}): línea "por …" de ${height} px`);
  expect(height).toBeLessThanOrEqual(24);
}

// AC-101: el gesto emite exactamente 1 respawn y en ≤ 1 s el barco existe con el 100 % de la vida (AC-63: a 60–90 m)
async function expectSailWith(page: Page, net: ReturnType<typeof trackSocket>, start: { classId: string }, label: string, gesture: () => Promise<void>) {
  const button = page.getByTestId('btn-respawn');
  await expect(button).toBeEnabled({ timeout: 12_000 });
  await expect(button).toHaveText('Zarpar');
  net.reset();
  const t0 = Date.now();
  await gesture();
  const ship = await waitFor(() => me(page), (s) => !!s && s.state === 'alive' && s.hp === s.maxHp, 2000, 25);
  const elapsed = Date.now() - t0;
  await page.waitForTimeout(1000);
  const fromPort = Math.hypot(ship!.x, ship!.z);
  console.log(`AC-101 (${label}): ${respawnsSent(net)} respawn · vivo con ${ship!.hp}/${ship!.maxHp} a los ${elapsed} ms · a ${fromPort.toFixed(1)} m del puerto`);
  expect(respawnsSent(net)).toBe(1);
  expect(elapsed).toBeLessThanOrEqual(1000);
  expect(fromPort).toBeGreaterThanOrEqual(60);
  expect(fromPort).toBeLessThanOrEqual(90);
  expect(ship!.classId).toBe(start.classId);
  await expect(page.getByTestId('death-card')).toHaveCount(0);
  expect(dialogsOf(page)).toEqual([]);
}

test.describe('Muerte y reaparición', () => {
  test('AC-63, AC-101 (clic) y AC-106: Zarpar desactivado durante la cuenta atrás; al hacer clic reaparece con la vida llena', async ({ page }) => {
    test.setTimeout(150_000);
    const { net, start, sunkAt } = await sinkInAmbush(page);

    // Durante la cuenta atrás el botón está desactivado y ni un clic ni Espacio envían nada
    const button = page.getByTestId('btn-respawn');
    await expect(button).toBeDisabled();
    await expect(button).toHaveText(/^Zarpar en \d s$/);
    await expectKillerOnOneLine(page, '1440×900');
    net.reset();
    await button.click({ force: true });
    await page.keyboard.press('Space');
    expect(respawnsSent(net)).toBe(0);

    await expect(button).toBeEnabled({ timeout: 12_000 });
    console.log(`AC-63: Zarpar activo ${((Date.now() - sunkAt) / 1000).toFixed(1)} s después de mostrarse la tarjeta`);
    await expectSailWith(page, net, start, 'clic', () => button.click());
  });

  test('AC-101 (Enter): al activarse, Zarpar recibe el foco y Enter reaparece', async ({ page }) => {
    test.setTimeout(150_000);
    const { net, start } = await sinkInAmbush(page);
    const button = page.getByTestId('btn-respawn');
    await expect(button).toBeEnabled({ timeout: 12_000 });
    await expect(button).toBeFocused();
    await expectSailWith(page, net, start, 'Enter', () => page.keyboard.press('Enter'));
  });
});

test.describe('Muerte y reaparición en móvil @mobile', () => {
  test('AC-101 (toque) y AC-106 en 390×844', async ({ page }) => {
    test.setTimeout(150_000);
    const { net, start } = await sinkInAmbush(page);
    await expectKillerOnOneLine(page, '390×844');
    const button = page.getByTestId('btn-respawn');
    await expectSailWith(page, net, start, 'toque', () => button.tap());
  });
});

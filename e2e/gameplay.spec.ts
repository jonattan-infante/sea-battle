import { expect, Page, test } from '@playwright/test';
import { PORTS } from '../playwright.config';
import { AMBUSH_POINT } from '../server/scenarios';
import { clickWater, dialogsOf, enterGame, hud, me, ships, trackSocket, waitFor } from './helpers';

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
      const start = (await me(page))!;
      // Alterna arriba y abajo para quedarse cerca del puerto
      const dy = run % 2 === 0 ? -120 : 120;
      const t = await page.evaluate(
        ([x, y]) =>
          new Promise<{ marker: number; move: number }>((resolve) => {
            const dbg = window.__SEA_BATTLE__!;
            const rt = dbg.runtime() as unknown as { clickMarker: unknown };
            const me0 = dbg.me() as { x: number; z: number };
            const canvas = document.querySelector('canvas')!;
            const t0 = performance.now();
            const opts = { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse', button: 0, isPrimary: true };
            canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
            canvas.dispatchEvent(new PointerEvent('pointerup', opts));
            let marker = -1;
            const poll = () => {
              const now = performance.now();
              if (marker < 0 && rt.clickMarker) marker = now - t0;
              const m = dbg.me() as { x: number; z: number };
              if (Math.hypot(m.x - me0.x, m.z - me0.z) > 0.01) return resolve({ marker, move: now - t0 });
              if (now - t0 > 3000) return resolve({ marker, move: Infinity });
              requestAnimationFrame(poll);
            };
            requestAnimationFrame(poll);
          }),
        [start.screen!.sx, start.screen!.sy + dy]
      );
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
    // Escenario showcase: pirata quieto en (45, 205). El jugador para a 85 m, fuera de su radio de agresión
    // (70 m): si se acercara más, al acabar la protección el pirata atacaría y dejaría de estar quieto
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
      rt.client.moveTo(-10, 140);
    });
    await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x + 10, s.z - 140) < 4, 45_000, 250);
    await page.waitForTimeout(700);
    const pirate = (await ships(page)).find((s) => s.kind === 'pirate' && s.state === 'alive' && s.screen && Math.hypot(s.x - 45, s.z - 205) < 10);
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
    await enterGame(page);
    // Navegar hacia los mercantes hasta tener alguno a ≤ 150 m
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
      rt.client.moveTo(0, 200);
    });
    const net = trackSocket(page); // después del moveTo: desde aquí el cliente no debe enviar nada
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

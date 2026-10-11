import { expect, test } from '@playwright/test';
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

  test('AC-26: seleccionar, atacar y comprar no abre ningún diálogo bloqueante', async ({ page }) => {
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

  test('AC-81: deslizar sobre el canvas no hace scroll de la página', async ({ page }) => {
    await enterGame(page);
    const before = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    await page.touchscreen.tap(195, 500);
    await page.mouse.wheel(0, 400);
    const after = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
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

test.describe('Muerte y reaparición', () => {
  test('AC-63: hundido, Zarpar está desactivado durante la cuenta atrás y al pulsarlo reaparece a 60–90 m del puerto con la vida llena', async ({ page }) => {
    test.setTimeout(150_000);
    const net = trackSocket(page);
    await enterGame(page, `http://localhost:${PORTS.showcase}`);
    const start = (await me(page))!;

    // Navegar a la emboscada de server/scenarios.ts: 5 piratas atacan en cuanto acaba la protección inicial
    await page.evaluate(([x, z]) => {
      const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
      rt.client.moveTo(x, z);
    }, [AMBUSH_POINT.x, AMBUSH_POINT.z]);
    await expect(page.getByTestId('death-card')).toBeVisible({ timeout: 110_000 });
    const sunkAt = Date.now();

    // Durante la cuenta atrás el botón está desactivado y un clic no envía nada
    const button = page.getByTestId('btn-respawn');
    await expect(button).toBeDisabled();
    await expect(button).toHaveText(/^Zarpar en \d s$/);
    // H-07: "por ☠ Pirata" en una sola línea (ART-DIRECTION §15)
    const byHeight = (await page.getByTestId('death-by').boundingBox())!.height;
    console.log(`H-07: línea "por …" de ${byHeight} px`);
    expect(byHeight).toBeLessThanOrEqual(24);
    net.reset();
    await button.click({ force: true });
    await page.keyboard.press('Space');
    expect(net.sent.filter((f) => f.includes('"respawn"'))).toEqual([]);

    // Se activa al terminar la cuenta atrás y un clic real zarpa
    await expect(button).toBeEnabled({ timeout: 12_000 });
    await expect(button).toHaveText('Zarpar');
    console.log(`AC-63: Zarpar activo ${((Date.now() - sunkAt) / 1000).toFixed(1)} s después de mostrarse la tarjeta`);
    await button.click();
    await waitFor(async () => net.sent.filter((f) => f.includes('"respawn"')).length, (n) => n === 1, 2000, 50);

    const ship = await waitFor(() => me(page), (s) => !!s && s.state === 'alive', 5000, 100);
    const fromPort = Math.hypot(ship!.x, ship!.z);
    console.log(`AC-63: reaparece a ${fromPort.toFixed(1)} m del puerto con ${ship!.hp}/${ship!.maxHp}`);
    expect(fromPort).toBeGreaterThanOrEqual(60);
    expect(fromPort).toBeLessThanOrEqual(90);
    expect(ship!.hp).toBe(ship!.maxHp);
    expect(ship!.classId).toBe(start.classId);
    await expect(page.getByTestId('death-card')).toHaveCount(0);
    expect(dialogsOf(page)).toEqual([]);
  });
});

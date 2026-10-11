import { expect, test } from '@playwright/test';
import { PORTS } from '../playwright.config';
import { commits, enterGame, hud, installCommitCounter, me, renderInfo, ships, trackSocket, waitFor } from './helpers';

const EMPTY = `http://localhost:${PORTS.empty}`;

test.describe('Rendimiento @perf', () => {
  test('AC-83 y AC-86: en reposo sin NPC, 0 commits de React en 5 s y 0 mensajes enviados en 10 s', async ({ page }) => {
    await installCommitCounter(page);
    const socket = trackSocket(page);
    await enterGame(page, EMPTY);
    // Recién entrado no está bajo fuego: si lo estuviera, el estado cambiaría solo a los 3 s (commit en reposo)
    expect(((await hud(page)).me as { underFire: boolean }).underFire).toBe(false);
    await page.mouse.move(5, 450); // fuera del HUD y sin hover sobre barcos
    await page.waitForTimeout(2000); // asentarse tras la entrada
    const c0 = await commits(page);
    socket.reset();
    await page.waitForTimeout(5000);
    const c1 = await commits(page);
    await page.waitForTimeout(5000);
    console.log(`AC-83: ${c1 - c0} commits en 5 s · AC-86: ${socket.sent.length} mensajes enviados en 10 s`);
    expect(c1 - c0).toBe(0);
    expect(socket.sent).toEqual([]);
  });

  test('AC-87: dos jugadores quietos sin NPC reciben 0 frames en 10 s', async ({ browser }) => {
    test.setTimeout(60_000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();
      const sa = trackSocket(a);
      const sb = trackSocket(b);
      await enterGame(a, EMPTY);
      await enterGame(b, EMPTY);
      // Aislamiento: los barcos de tests anteriores siguen 10 s en el mundo (margen de reconexión) y su
      // baja es un cambio real que sí genera un frame. Se mide cuando solo quedan A y B.
      const ids = [(await me(a))!.id, (await me(b))!.id];
      await waitFor(() => ships(a), (list) => list.every((s) => ids.includes(s.id)), 15_000, 250);
      await a.waitForTimeout(1000);
      sa.reset();
      sb.reset();
      await a.waitForTimeout(10_000);
      const frames = (l: string[]) => l.filter((p) => p.startsWith('42["frame"')).length;
      console.log(`AC-87: A recibió ${frames(sa.received)} frames, B ${frames(sb.received)}`);
      expect(frames(sa.received)).toBe(0);
      expect(frames(sb.received)).toBe(0);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('AC-84: con NPC patrullando en pantalla y el jugador quieto, ≤ 2 commits/s de media en 10 s', async ({ page }) => {
    test.setTimeout(120_000);
    await installCommitCounter(page);
    await enterGame(page);
    const moveTo = (x: number, z: number) =>
      page.evaluate(([px, pz]) => {
        const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
        rt.client.moveTo(px, pz);
      }, [x, z]);
    const vw = page.viewportSize()!;
    const npcsOnScreen = async () =>
      (await ships(page)).filter((s) => s.kind !== 'player' && s.state === 'alive' && s.screen && s.screen.sx >= 0 && s.screen.sx <= vw.width && s.screen.sy >= 0 && s.screen.sy <= vw.height);

    // Acercarse al mercante más cercano (los piratas atacarían al acabar la protección) y parar con un NPC en pantalla
    await waitFor(
      async () => {
        if ((await npcsOnScreen()).length > 0) return true;
        const mine = await me(page);
        const npc = (await ships(page))
          .filter((s) => s.kind === 'merchant' && s.state === 'alive')
          .sort((a, b) => Math.hypot(a.x - mine!.x, a.z - mine!.z) - Math.hypot(b.x - mine!.x, b.z - mine!.z))[0];
        await moveTo(npc ? npc.x : 0, npc ? npc.z : 220);
        return false;
      },
      (ok) => ok,
      60_000,
      1000
    );
    await page.keyboard.press('KeyS');
    await waitFor(async () => { const a = await me(page); await page.waitForTimeout(300); const b = await me(page); return Math.hypot(a!.x - b!.x, a!.z - b!.z); }, (d) => d < 0.05, 15_000, 0);
    await page.mouse.move(5, 450);
    await page.waitForTimeout(1000);

    const start = await npcsOnScreen();
    const c0 = await commits(page);
    await page.waitForTimeout(10_000);
    const rate = ((await commits(page)) - c0) / 10;
    const end = new Map((await ships(page)).map((s) => [s.id, s]));
    const moved = start.filter((s) => { const e = end.get(s.id); return !!e && Math.hypot(e.x - s.x, e.z - s.z) > 1; }).length;
    console.log(`AC-84: ${rate.toFixed(2)} commits/s · ${start.length} NPC en pantalla al empezar, ${moved} se movieron`);
    expect(start.length).toBeGreaterThan(0);
    expect(moved).toBeGreaterThan(0);
    expect(rate).toBeLessThanOrEqual(2);
  });

  test('AC-89 (parcial): draw calls ≤ 100 y triángulos ≤ 250 000 en la escena inicial', async ({ page }) => {
    await enterGame(page);
    await page.waitForTimeout(1500);
    const info = await renderInfo(page);
    console.log(`AC-89: ${info.calls} draw calls, ${info.triangles} triángulos`);
    expect(info.calls).toBeLessThanOrEqual(100);
    expect(info.triangles).toBeLessThanOrEqual(250_000);
  });
});

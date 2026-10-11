import { expect, test } from '@playwright/test';
import { enterGame, me, ships, waitFor } from './helpers';

test.describe('Multijugador', () => {
  test('AC-11 y AC-13: dos jugadores se ven con su nombre en ≤ 2 s; al cerrar la pestaña, el barco desaparece a los ~10 s', async ({ browser }) => {
    test.setTimeout(90_000);
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();
      await enterGame(a);
      const t0 = Date.now();
      await enterGame(b);
      const meA = (await me(a))!;
      const meB = (await me(b))!;
      // Cada uno ve al otro con su nombre
      await waitFor(() => ships(a), (list) => list.some((s) => s.id === meB.id && s.name === meB.name), 2000, 50);
      await waitFor(() => ships(b), (list) => list.some((s) => s.id === meA.id && s.name === meA.name), 2000, 50);
      console.log(`AC-11: visibles mutuamente a los ${Date.now() - t0} ms de entrar B`);

      // A cierra la pestaña: su barco sigue 10 s (margen de reconexión) y luego desaparece para B
      await a.close();
      const closedAt = Date.now();
      await b.waitForTimeout(8000);
      expect((await ships(b)).some((s) => s.id === meA.id)).toBe(true);
      await waitFor(() => ships(b), (list) => !list.some((s) => s.id === meA.id), 6000, 200);
      const goneMs = Date.now() - closedAt;
      console.log(`AC-13: el barco desapareció a los ${goneMs} ms`);
      expect(goneMs).toBeLessThanOrEqual(11_000 + 500);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

// AC-109 (QA H-10), e2e: el clic en Zarpar llega en la misma mutación que habilita el botón (un MutationObserver hace
// el clic en el instante en que `disabled` pasa a false) y con el reloj del cliente adelantado 50 ms. El servidor
// tiene que aceptarlo a la primera, sin "Aún no puedes zarpar". El Jest+socket (server/__tests__/respawn-race.test.ts)
// hace las 20 corridas; aquí van 2 muertes reales en la emboscada de un servidor propio con el showcase.
import { expect, Page, test } from '@playwright/test';
import { AMBUSH_POINT } from '../server/scenarios';
import { enterGame, me, trackSocket, waitFor } from './helpers';
import { frames, intents, sailTo } from './net';
import { startOwnServer } from './own-server';

const AHEAD_S = 0.05;
const RUNS = 2;
const NOT_YET = 'Aún no puedes zarpar';

// Adelanta el reloj del cliente: todo lo que usa client.serverTime() (cuenta atrás, Zarpar y su comprobación) lo ve
async function clockAhead(page: Page, seconds: number) {
  await page.evaluate((s) => {
    const c = (window.__SEA_BATTLE__!.runtime() as unknown as { client: { serverTime: (now?: number) => number } }).client;
    const real = c.serverTime.bind(c);
    c.serverTime = (now?: number) => real(now) + s;
  }, seconds);
}

// Arma el clic: en la mutación que quita `disabled` a Zarpar, clic sobre el botón en ese mismo instante
async function armClickOnEnable(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __SAIL__: { t: number; clientTime: number; respawnAt: number } | null; __SAIL_OBS__?: MutationObserver };
    w.__SAIL__ = null;
    w.__SAIL_OBS__?.disconnect();
    const dbg = window.__SEA_BATTLE__!;
    const client = (dbg.runtime() as unknown as { client: { serverTime: () => number } }).client;
    const obs = new MutationObserver(() => {
      const btn = document.querySelector<HTMLButtonElement>('[data-testid="btn-respawn"]');
      if (!btn || btn.disabled || w.__SAIL__) return;
      const death = (dbg.player() as { death: { respawnAt: number } | null }).death;
      w.__SAIL__ = { t: performance.now(), clientTime: client.serverTime(), respawnAt: death?.respawnAt ?? NaN };
      btn.click();
      obs.disconnect();
    });
    obs.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
    w.__SAIL_OBS__ = obs;
  });
}

test.describe('Zarpar en la carrera de relojes', () => {
  test('AC-109: con el reloj del cliente adelantado 50 ms, el clic de Zarpar en la mutación que lo habilita se acepta a la primera, sin "Aún no puedes zarpar"', async ({ page }) => {
    test.setTimeout(300_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_SCENARIO: 'showcase' });
    try {
      const net = trackSocket(page);
      await enterGame(page, server.url);
      await clockAhead(page, AHEAD_S);
      for (let run = 1; run <= RUNS; run++) {
        await armClickOnEnable(page);
        await sailTo(page, AMBUSH_POINT.x, AMBUSH_POINT.z);
        await expect(page.getByTestId('death-card')).toBeVisible({ timeout: 120_000 });
        net.reset();
        const sail = await waitFor(
          () => page.evaluate(() => (window as unknown as { __SAIL__: { t: number; clientTime: number; respawnAt: number } | null }).__SAIL__),
          (s) => !!s,
          15_000,
          20
        );
        await page.waitForTimeout(1500); // respuesta del servidor: aviso de rechazo o barco a flote
        const sent = intents(net).filter((i) => i.name === 'respawn').length;
        const notices = frames(net).flatMap((f) => f.n ?? []).filter((n) => n.text === NOT_YET).length;
        const toast = await page.getByTestId('toasts').textContent();
        const ship = await me(page);
        console.log(`AC-109 corrida ${run}: clic con el reloj del cliente ${((sail!.clientTime - sail!.respawnAt) * 1000).toFixed(1)} ms después de respawnAt (adelanto inyectado ${AHEAD_S * 1000} ms) · ${sent} respawn · ${notices} "${NOT_YET}" · ${ship ? `a flote con ${ship.hp}/${ship.maxHp}` : 'sigue hundido'}`);
        expect(sail!.clientTime).toBeGreaterThanOrEqual(sail!.respawnAt); // el botón se habilitó según el reloj del cliente
        expect(sent).toBe(1);
        expect(notices).toBe(0);
        expect(toast ?? '').not.toContain(NOT_YET);
        expect(ship?.state).toBe('alive');
        expect(ship!.hp).toBe(ship!.maxHp);
        await expect(page.getByTestId('death-card')).toHaveCount(0);
      }
    } finally {
      await server.kill();
    }
  });
});

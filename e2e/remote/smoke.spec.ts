// AC-135 y AC-139 (a): prueba rápida de la persistencia contra un despliegue real. El usuario de prueba parte de un
// estado distinto del inicial, hunde un mercante y sale de tres maneras: (1) recarga; (2) cierra, espera ≥ 15 s y
// vuelve (pasados los 10 s de AC-96 el barco ya no está en memoria, así que se lee la BD); y (3) se redespliega y
// vuelve, solo fuera de prod. En cada paso se comparan exactamente los 4 campos de AC-97; la posición y la vida, no
import { expect, Page, test } from '@playwright/test';
import { execSync } from 'child_process';
import { STARTING_GOLD } from '../../src/game/constants';
import { hud, me, ships, waitFor } from '../helpers';
import { baseUrl, isProdHost, notVerified } from './env';
import { enterRemoteGame, formatProgress, health, moveTo, Progress, readProgress, saveRun, shortId, waitForGame } from './game';

const AWAY_MS = 15_000; // más que los 10 s de AC-96
const REDEPLOY_TIMEOUT_MS = 15 * 60_000;

// El "dado" de AC-135: un estado que no sea el de un usuario nuevo, para que volver al estado por defecto se detecte
function requireNonInitial(p: Progress): void {
  const initial = [
    p.gold === STARTING_GOLD && `oro ${STARTING_GOLD}`,
    Object.values(p.upgrades).every((level) => level <= 1) && 'sin mejoras',
    p.activeShip === 'sloop' && 'barco activo Balandra'
  ].filter(Boolean);
  if (initial.length > 0)
    throw notVerified(`AC-135: el usuario de prueba parte del estado inicial (${initial.join(', ')}); hace falta oro ≠ ${STARTING_GOLD}, ≥ 1 mejora y un barco activo que no sea la Balandra`);
}

// Hunde el mercante más cercano con Tab + Espacio, persiguiéndolo con la API del cliente (preparación, no el gesto
// evaluado). Sin hundirlo en 150 s, el escenario no se dio: NO VERIFICADO
async function sinkMerchant(page: Page): Promise<string> {
  const merchantId = await waitFor(
    async () => {
      const mine = await me(page);
      const m = (await ships(page))
        .filter((s) => s.kind === 'merchant' && s.state === 'alive')
        .sort((a, b) => Math.hypot(a.x - mine!.x, a.z - mine!.z) - Math.hypot(b.x - mine!.x, b.z - mine!.z))[0];
      await moveTo(page, m ? m.x : 0, m ? m.z : 220);
      await page.keyboard.press('Tab');
      const selected = (await hud(page)).selectedId as string | null;
      return selected && (await ships(page)).some((s) => s.id === selected && s.kind === 'merchant') ? selected : null;
    },
    (id) => !!id,
    60_000,
    1500
  ).catch(() => null);
  if (!merchantId) throw notVerified('AC-135: no se encontró un mercante que atacar en 60 s');
  await page.keyboard.press('Space');
  const sunk = await waitFor(
    async () => {
      const t = (await ships(page)).find((s) => s.id === merchantId);
      if (t && t.state === 'alive') await moveTo(page, t.x, t.z);
      const mine = await me(page);
      if (mine && t && t.state === 'alive' && mine.targetId !== merchantId) await page.keyboard.press('Space');
      return !t || t.state !== 'alive';
    },
    (done) => done,
    90_000,
    1000
  ).catch(() => false);
  if (!sunk) throw notVerified('AC-135: el mercante no se hundió en 90 s');
  return merchantId;
}

// "Justo antes de salir": el barco parado y los 4 campos sin cambios durante 3 s. Si no, un botín que llega en el
// último momento (los restos del mercante) cambia el oro entre la lectura y la salida y da un falso rojo
async function settledProgress(page: Page): Promise<Progress> {
  await page.keyboard.press('KeyS');
  let last = JSON.stringify(await readProgress(page));
  let since = Date.now();
  const settled = await waitFor(
    async () => {
      const now = JSON.stringify(await readProgress(page));
      if (now !== last) [last, since] = [now, Date.now()];
      return Date.now() - since >= 3000;
    },
    (ok) => ok,
    30_000,
    250
  ).catch(() => false);
  if (!settled) throw notVerified('AC-135: el progreso no se estabiliza en 30 s (sigue cambiando el oro)');
  return JSON.parse(last) as Progress;
}

test('AC-135 (1) recargar y (2) volver tras ≥ 15 s: los 4 campos de AC-97 no cambian @remote', async ({ page, context }) => {
  test.setTimeout(300_000);
  const url = baseUrl();
  const h = await health(url);
  const { playerId } = await enterRemoteGame(page);
  const s0 = await readProgress(page);
  console.log(`AC-135 ${shortId(playerId)} al entrar: ${formatProgress(s0)}`);
  requireNonInitial(s0);

  const merchantId = await sinkMerchant(page);
  const gold = await waitFor(() => readProgress(page), (p) => p.gold > s0.gold, 5000, 100).catch(() => null);
  if (!gold) throw notVerified(`AC-135: el oro no subió al hundir el mercante ${merchantId}`);
  console.log(`AC-135 mercante hundido: oro ${s0.gold} → ${gold.gold} (+${gold.gold - s0.gold})`);

  // (1) Recargar
  const before1 = await settledProgress(page);
  await page.reload();
  await waitForGame(page);
  const after1 = await readProgress(page);
  console.log(`AC-135 (1) recargar: antes ${formatProgress(before1)} · después ${formatProgress(after1)}`);
  expect.soft(after1, 'AC-135 (1) recargar').toEqual(before1);

  // (2) Cerrar la pestaña, esperar ≥ 15 s y volver a entrar
  const before2 = await settledProgress(page);
  await page.close();
  await new Promise((r) => setTimeout(r, AWAY_MS));
  const page2 = await context.newPage();
  await enterRemoteGame(page2);
  const after2 = await readProgress(page2);
  console.log(`AC-135 (2) cerrar ${AWAY_MS / 1000} s y volver: antes ${formatProgress(before2)} · después ${formatProgress(after2)}`);
  expect.soft(after2, `AC-135 (2) cerrar ${AWAY_MS / 1000} s y volver`).toEqual(before2);

  const file = saveRun('ac135', url.host, { health: h, playerId: shortId(playerId), alEntrar: s0, mercante: merchantId, pasos: [{ paso: 1, antes: before1, despues: after1 }, { paso: 2, antes: before2, despues: after2 }] });
  console.log(`AC-135 registro: ${file}`);
});

test('AC-135 (3) tras un redeploy: los 4 campos de AC-97 no cambian @remote', async ({ page, context }) => {
  const url = baseUrl();
  test.skip(isProdHost(url), 'AC-139 (a): en prod solo los pasos 1 y 2');
  test.setTimeout(REDEPLOY_TIMEOUT_MS + 180_000);
  const { playerId } = await enterRemoteGame(page);
  const before = await settledProgress(page);
  requireNonInitial(before);
  const h0 = await health(url);
  await page.close();

  // Un proceso nuevo: /healthz vuelve con un uptime menor que el tiempo transcurrido desde aquí
  const t0 = Date.now();
  if (process.env.REMOTE_REDEPLOY_CMD) execSync(process.env.REMOTE_REDEPLOY_CMD, { stdio: 'inherit' });
  else console.log(`AC-135 (3): redespliega ${url.host} ahora (o define REMOTE_REDEPLOY_CMD). Espero hasta ${REDEPLOY_TIMEOUT_MS / 60_000} min a un proceso nuevo`);
  const h1 = await waitFor(
    () => health(url).catch(() => null),
    (h) => !!h && h.uptimeSeconds * 1000 < Date.now() - t0,
    REDEPLOY_TIMEOUT_MS,
    5000
  ).catch(() => null);
  if (!h1) throw notVerified(`AC-135 (3): ${url.host} no se redesplegó en ${REDEPLOY_TIMEOUT_MS / 60_000} min`);
  console.log(`AC-135 (3) redeploy: commit ${h0.commit ?? '?'} → ${h1.commit ?? '?'} · proceso nuevo con ${h1.uptimeSeconds} s`);
  if (h0.commit && h1.commit) expect.soft(h1.commit, 'el redeploy sirve el mismo SHA').toBe(h0.commit);

  const page2 = await context.newPage();
  await enterRemoteGame(page2);
  const after = await readProgress(page2);
  console.log(`AC-135 (3) tras el redeploy: antes ${formatProgress(before)} · después ${formatProgress(after)}`);
  expect.soft(after, 'AC-135 (3) tras el redeploy').toEqual(before);
  const file = saveRun('ac135-redeploy', url.host, { antes: h0, despues: h1, playerId: shortId(playerId), paso: { antes: before, despues: after } });
  console.log(`AC-135 registro: ${file}`);
});

// AC-111 (H-305): aviso del Capitán pirata a todos, su marcador en el minimapa desde cualquier punto (fuera del área de
// interés) y el feed de todos al hundirse. Dos contextos en un servidor propio con un escenario determinista
// (server/scenarios.ts), para no alterar los servidores compartidos.
import { BrowserContext, expect, Page, test } from '@playwright/test';
import { CAPTAIN_CLASS, INTEREST_RADIUS } from '../src/game/constants';
import { CAPTAIN_BAIT_POINT, CAPTAIN_DOWN_POINT } from '../server/scenarios';
import { DebugShip, enterGame, me, ships, waitFor } from './helpers';
import { startOwnServer } from './own-server';

const VIEWPORT = { width: 1440, height: 900 };
const quadrantOf = (s: { x: number; z: number }) => (s.x > 0 ? (s.z < 0 ? 'NE' : 'SE') : s.z < 0 ? 'NO' : 'SO');
// Aviso de D49 por cuadrante, escrito a mano (no con captainSpawnText): con los dos jugadores junto al puerto, la guarida
// es el punto de 45° del arco de 440 m (GDD §9), a 311 m de los ejes, así que la patrulla (≤ 120 m) no cambia el cuadrante
const SPAWN_TEXT = {
  NE: '¡Capitán pirata en el noreste, sector I2!',
  NO: '¡Capitán pirata en el noroeste, sector B2!',
  SO: '¡Capitán pirata en el suroeste, sector B9!',
  SE: '¡Capitán pirata en el sureste, sector I9!'
} as const;

// Lleva el barco propio a (x, z) (posicionarse no es lo que se verifica) y espera a que llegue
async function sailTo(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(([px, pz]) => {
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { client: { moveTo: (x: number, z: number) => void } };
    rt.client.moveTo(px, pz);
  }, [x, z]);
  await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - x, s.z - z) < 4, 30_000, 200);
}

// Selecciona el objetivo atacable más cercano y ataca con el teclado, como el jugador (Tab + Espacio, GDD §5)
async function attackNearest(page: Page, targetId: string): Promise<void> {
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('target-frame')).toHaveAttribute('data-target-id', targetId);
  await page.keyboard.press('Space');
}

// Marcador del capitán en el minimapa: píxeles coral (#FF7A7A) del canvas alrededor de su posición (y, como control, en el
// punto opuesto del mapa, donde no hay nadie), y el halo centrado en ella. Devuelve las medidas para el log y los asserts
async function minimapMarker(page: Page, captain: DebugShip) {
  return page.evaluate(([cx, cz]) => {
    const canvas = document.querySelector('[data-testid="minimap"] canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const k = canvas.width / 1000;
    const r = Math.ceil(7 * (canvas.width / canvas.getBoundingClientRect().width));
    const coralAt = (x: number, z: number) => {
      const data = ctx.getImageData(Math.round((x + 500) * k) - r, Math.round((z + 500) * k) - r, 2 * r + 1, 2 * r + 1).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - 0xff) <= 12 && Math.abs(data[i + 1] - 0x7a) <= 18 && Math.abs(data[i + 2] - 0x7a) <= 18) n++;
      }
      return n;
    };
    const coral = coralAt(Number(cx), Number(cz));
    const control = coralAt(-Number(cx), -Number(cz));
    const halo = document.querySelector('[data-testid="minimap-captain"]') as HTMLElement;
    const hb = halo.getBoundingClientRect();
    const cb = canvas.getBoundingClientRect();
    const expected = { x: cb.left + ((Number(cx) + 500) / 1000) * cb.width, y: cb.top + ((Number(cz) + 500) / 1000) * cb.width };
    return {
      coral,
      control,
      haloVisible: getComputedStyle(halo).display !== 'none',
      haloShip: halo.dataset.shipId ?? null,
      haloError: Math.hypot(hb.left + hb.width / 2 - expected.x, hb.top + hb.height / 2 - expected.y)
    };
  }, [captain.x, captain.z] as const);
}

// Placa del capitán (ART-DIRECTION §11.1, D43): 2 iconos de 12 px y «Capitán pirata» entero, con el ancho máximo + 14 px
async function captainPlate(page: Page, captainId: string) {
  const plate = page.locator(`[data-plate][data-ship-id="${captainId}"]`);
  await expect(plate).toBeVisible();
  return plate.evaluate((el) => {
    const name = el.querySelector('.wo-plate__name') as HTMLElement;
    const icon = el.querySelector('.wo-plate__icon') as HTMLElement;
    const body = el.querySelector('.wo-plate__body') as HTMLElement;
    return { text: name.textContent, scroll: name.scrollWidth, client: name.clientWidth, icons: icon.querySelectorAll('svg').length, maxW: getComputedStyle(body).maxWidth, width: Math.round(body.getBoundingClientRect().width) };
  });
}

test.describe('Capitán pirata (AC-111)', () => {
  test('AC-111: al hundir el 10.º pirata, los dos jugadores reciben el aviso con la región y la celda de la guarida (D49) y ven el marcador propio del capitán en el minimapa, fuera de su área de interés', async ({ browser }) => {
    test.setTimeout(150_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: 'captain' });
    const contexts: BrowserContext[] = [];
    try {
      const pages: Page[] = [];
      for (let i = 0; i < 2; i++) {
        const ctx = await browser.newContext({ viewport: VIEWPORT });
        contexts.push(ctx);
        const page = await ctx.newPage();
        await enterGame(page, server.url);
        pages.push(page);
      }
      const [a, b] = pages;
      // A se acerca al cebo desde el borde de la zona segura y lo hunde (el 10.º pirata)
      await sailTo(a, CAPTAIN_BAIT_POINT.x, CAPTAIN_BAIT_POINT.z - 45);
      const bait = (await ships(a)).find((s) => s.kind === 'pirate')!;
      expect(bait).toBeDefined();
      await attackNearest(a, bait.id);

      for (const [label, page] of [['A', a], ['B', b]] as const) {
        const captain = await waitFor(async () => (await ships(page)).find((s) => s.classId === CAPTAIN_CLASS), (s) => !!s, 30_000, 100);
        const own = (await me(page))!;
        const dist = Math.hypot(captain!.x - own.x, captain!.z - own.z);
        const text = SPAWN_TEXT[quadrantOf(captain!)];
        await expect(page.getByTestId('toasts').getByText(text, { exact: true })).toBeVisible({ timeout: 5000 });
        // El marcador se redibuja a 2 Hz: se espera a que el halo siga al capitán y luego se mide
        await waitFor(() => minimapMarker(page, captain!), (m) => m.haloShip === captain!.id, 3000, 100);
        const fresh = (await ships(page)).find((s) => s.id === captain!.id)!;
        const marker = await minimapMarker(page, fresh);
        console.log(`AC-111 ${label}: «${text}»; capitán a ${dist.toFixed(0)} m (área de interés ${INTEREST_RADIUS} m); minimapa: ${marker.coral} px coral (control en el punto opuesto: ${marker.control}), halo visible ${marker.haloVisible}, error del halo ${marker.haloError.toFixed(1)} px`);
        expect(dist).toBeGreaterThan(INTEREST_RADIUS);
        // Modelo: ★ de R 5,5 px y r 2,2 px (D43) = 5·R·r·sin 36° ≈ 36 px²; el trazo de 1 px se come ~20 px² hacia dentro, así
        // que quedan ~16 px de relleno, y el suavizado deja 10–12 (medido en 1440×900 con DPR 1). Umbral: la mitad del mínimo
        // medido; el control en el punto opuesto (0 px) es el que asegura que esos píxeles son del capitán
        expect(marker.coral).toBeGreaterThanOrEqual(5);
        expect(marker.control).toBe(0);
        expect(marker.haloVisible).toBe(true);
        expect(marker.haloError).toBeLessThanOrEqual(3);
      }
    } finally {
      for (const ctx of contexts) await ctx.close();
      await server.kill();
    }
  });

  test('AC-111: al hundirse el capitán, el feed de los dos jugadores dice "El Capitán pirata ha caído: <quien lo hundió>" y su marcador sale del minimapa; su placa lleva calavera y corona y el nombre entero (D43)', async ({ browser }) => {
    test.setTimeout(150_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: 'captain-down' });
    const contexts: BrowserContext[] = [];
    try {
      const pages: Page[] = [];
      for (let i = 0; i < 2; i++) {
        const ctx = await browser.newContext({ viewport: VIEWPORT });
        contexts.push(ctx);
        const page = await ctx.newPage();
        await enterGame(page, server.url);
        pages.push(page);
      }
      const [a, b] = pages;
      await sailTo(a, CAPTAIN_DOWN_POINT.x, CAPTAIN_DOWN_POINT.z + 55);
      const captain = (await ships(a)).find((s) => s.classId === CAPTAIN_CLASS)!;
      expect(captain).toBeDefined();
      const nameA = (await me(a))!.name;
      // Placa del capitán: 2 iconos de 12 px y «Capitán pirata» sin truncar (máx. 128 + 14 px)
      const plateInfo = await captainPlate(a, captain.id);
      console.log(`AC-111 placa: ${JSON.stringify(plateInfo)}`);
      expect(plateInfo).toMatchObject({ text: 'Capitán pirata', icons: 2, maxW: '142px' });
      expect(plateInfo.scroll).toBeLessThanOrEqual(plateInfo.client);
      // Antes del hundimiento, los dos ven el marcador
      for (const page of [a, b]) await waitFor(() => minimapMarker(page, captain), (m) => m.haloVisible && m.coral >= 5 && m.control === 0, 3000, 100);
      await attackNearest(a, captain.id);
      const line = `El Capitán pirata ha caído: ${nameA}`;
      for (const [label, page] of [['A', a], ['B', b]] as const) {
        await expect(page.getByTestId('feed').getByText(line, { exact: true })).toBeVisible({ timeout: 15_000 });
        // El marcador desaparece en el redibujado en que llega el hundimiento (≤ 500 ms, D43)
        const t0 = Date.now();
        const gone = await waitFor(() => minimapMarker(page, captain), (m) => !m.haloVisible && m.coral === 0, 1500, 50);
        console.log(`AC-111 ${label}: feed «${line}»; marcador fuera del minimapa a los ${Date.now() - t0} ms del feed (${JSON.stringify(gone)})`);
      }
      // 1.1 (AC-152): la línea del botín lleva la XP de A, que lo hundió en solitario (240, GDD §10b)
      await expect(a.getByTestId('feed').getByText('Hundiste a Capitán pirata +600 oro · +240 XP', { exact: true })).toBeVisible();
    } finally {
      for (const ctx of contexts) await ctx.close();
      await server.kill();
    }
  });

  test('D43 / AD-28: en 390×844 la placa del capitán lleva calavera y corona y «Capitán pirata» entero (máx. 116 + 14 px) @mobile', async ({ page }) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: 'captain-down' });
    try {
      await enterGame(page, server.url);
      await sailTo(page, CAPTAIN_DOWN_POINT.x, CAPTAIN_DOWN_POINT.z + 55);
      const captain = (await ships(page)).find((s) => s.classId === CAPTAIN_CLASS)!;
      const info = await captainPlate(page, captain.id);
      console.log(`D43 placa en 390×844: ${JSON.stringify(info)}`);
      expect(info).toMatchObject({ text: 'Capitán pirata', icons: 2, maxW: '130px' });
      expect(info.scroll).toBeLessThanOrEqual(info.client);
    } finally {
      await page.context().close();
      await server.kill();
    }
  });
});

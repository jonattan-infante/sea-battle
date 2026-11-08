// AC-176, el e2e (posición y rumbo del barco propio al entrar, en 1440×900), contra el mapa por defecto del servidor: el
// compartido de playwright.config.ts, sin SEA_BATTLE_MAP (AC-210 c; condición v de BACKLOG :399). Con el puerto de D92
// (BACKLOG :1621, «Con el puerto con forma de isla»), el barco propio aparece en uno de los 12 amarres, libre, con el centro a
// L/2 + 2 m (±0,5) de su punto de muelle Q a lo largo de ψ, la proa según ψ, hacia fuera (±5°), y el casco sin tocar el
// puerto. Q y ψ son los de MOORINGS_1_1 (src/game/constants.ts), la tabla de GDD §4. La aserción la comparte con la
// reaparición de AC-63 (expectMoored, e2e/helpers.ts)
import { test } from '@playwright/test';
import { enterGame, expectMoored } from './helpers';

test.describe('AC-176: la aparición en un amarre del puerto de D92, con el mapa por defecto (AC-210 c)', () => {
  test('al entrar, el barco propio está en un amarre libre, a L/2 + 2 m (±0,5) de su Q en ψ, con la proa según ψ (±5°) y el casco sin tocar el puerto', async ({ page }) => {
    await enterGame(page);
    await expectMoored(page, 'al entrar, 1440×900');
  });
});

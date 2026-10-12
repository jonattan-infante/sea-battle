// AC-41 (QA-5 H-15): umbral de vida baja del HUD. El e2e no lo fija, porque sus muestras de vida saltan de 31,25 % a 23 %
import { isLowHp } from '../hud-logic';

describe('Vida baja del HUD (AC-41)', () => {
  test('239/800 (29,9 %) es vida baja: el botón Reparar pulsa', () => {
    expect(isLowHp({ state: 'alive', hp: 239, maxHp: 800 })).toBe(true);
  });

  test('240/800 (30 %) no es vida baja: el botón Reparar no pulsa', () => {
    expect(isLowHp({ state: 'alive', hp: 240, maxHp: 800 })).toBe(false);
  });

  test('un barco hundido no avisa de vida baja', () => {
    expect(isLowHp({ state: 'sinking', hp: 0, maxHp: 800 })).toBe(false);
  });
});

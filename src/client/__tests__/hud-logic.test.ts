// AC-41 (QA-5 H-15): umbral de vida baja del HUD. El e2e no lo fija, porque sus muestras de vida saltan de 31,25 % a 23 %
import { captainDownText, captainSpawnText, isLowHp } from '../hud-logic';

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

describe('Avisos del Capitán pirata (AC-111)', () => {
  test('aviso de aparición con el sector', () => {
    expect(captainSpawnText('NE')).toBe('¡El Capitán pirata ha aparecido en el sector NE!');
  });

  test('feed al hundirse: hasta 3 nombres por daño y "y N más"', () => {
    expect(captainDownText([], 0)).toBe('El Capitán pirata ha caído');
    expect(captainDownText(['Ana'], 0)).toBe('El Capitán pirata ha caído: Ana');
    expect(captainDownText(['Ana', 'Bea'], 0)).toBe('El Capitán pirata ha caído: Ana y Bea');
    expect(captainDownText(['Ana', 'Bea', 'Caro'], 0)).toBe('El Capitán pirata ha caído: Ana, Bea y Caro');
    expect(captainDownText(['Ana', 'Bea', 'Caro'], 1)).toBe('El Capitán pirata ha caído: Ana, Bea, Caro y 1 más');
    expect(captainDownText(['Ana', 'Bea', 'Caro'], 17)).toBe('El Capitán pirata ha caído: Ana, Bea, Caro y 17 más');
  });
});

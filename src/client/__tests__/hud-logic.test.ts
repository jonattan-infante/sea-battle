// AC-41 (QA-5 H-15): umbral de vida baja del HUD. El e2e no lo fija, porque sus muestras de vida saltan de 31,25 % a 23 %
import { CAPTAIN_LAIR_RADIUS, PIRATE_SECTORS } from '../../game/constants';
import { captainDownText, captainSpawnText, isLowHp, sectorOf } from '../hud-logic';

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
  // D49: «¡Capitán pirata en el {región}, sector {celda}!», con la región del cuadrante escrita entera y la celda de la
  // rejilla del minimapa. Guaridas en el punto de 45° del arco de 440 m de cada cuadrante (GDD §9)
  test('aviso de aparición con la región y la celda de la guarida, en los 4 cuadrantes (D49)', () => {
    const lair = (id: string) => {
      const { sx, sz } = PIRATE_SECTORS.find((s) => s.id === id)!;
      return { x: sx * CAPTAIN_LAIR_RADIUS * Math.SQRT1_2, z: sz * CAPTAIN_LAIR_RADIUS * Math.SQRT1_2 };
    };
    expect(captainSpawnText('NE', lair('NE'))).toBe('¡Capitán pirata en el noreste, sector I2!');
    expect(captainSpawnText('NO', lair('NO'))).toBe('¡Capitán pirata en el noroeste, sector B2!');
    expect(captainSpawnText('SO', lair('SO'))).toBe('¡Capitán pirata en el suroeste, sector B9!');
    expect(captainSpawnText('SE', lair('SE'))).toBe('¡Capitán pirata en el sureste, sector I9!');
  });

  test('la celda del aviso es la del pie del minimapa (sectorOf): A–J de oeste a este y 1–10 de norte a sur', () => {
    expect([sectorOf(-500, -500), sectorOf(0, 0), sectorOf(499.9, 499.9), sectorOf(500, 500), sectorOf(-600, 600)]).toEqual(['A1', 'F6', 'J10', 'J10', 'A10']);
    expect(captainSpawnText('NO', { x: -401, z: -99 })).toBe('¡Capitán pirata en el noroeste, sector A5!');
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

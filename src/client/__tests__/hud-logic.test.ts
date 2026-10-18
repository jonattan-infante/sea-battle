// AC-41 (QA-5 H-15): umbral de vida baja del HUD. El e2e no lo fija, porque sus muestras de vida saltan de 31,25 % a 23 %
import { CANNON_LEVELS, CAPTAIN_CLASS, CAPTAIN_LAIR_RADIUS, PIRATE_SECTORS, PlayerShipClass, ShipKind } from '../../game/constants';
import { PlayerView, ShipState } from '../../game/types';
import { captainDownText, captainSpawnText, DANGER_TEXT, isLowHp, rangeText, sectorOf, targetDanger, targetDistance } from '../hud-logic';
import type { Relation } from '../hud-store';

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

// AC-31, 1.1 («el panel dice exactamente lo que hace el servidor»): el panel del objetivo compara la distancia sin
// redondear, como el servidor (world.ts no dispara con dist > alcance) y el estado de la acción, y muestra la distancia
// redondeada hacia arriba, para que el número y el texto no se contradigan
describe('Alcance en el panel del objetivo (AC-31, 1.1)', () => {
  const n1 = CANNON_LEVELS[0].range; // 60 m
  const row = (distance: number, relation: Relation = 'pirate', attackable = true) => {
    const { shown, inRange } = targetDistance(distance, n1);
    return `${shown} m · ${rangeText({ relation, attackable, inRange })}`;
  };

  test('con N1 (60 m): a 59,6 y 60,0 m, «60 m · ✓ En alcance»; a 60,4 m, «61 m · ✕ Fuera de alcance»', () => {
    expect(n1).toBe(60);
    expect(targetDistance(59.6, n1)).toEqual({ shown: 60, inRange: true });
    expect(targetDistance(60, n1)).toEqual({ shown: 60, inRange: true });
    expect(targetDistance(60.4, n1)).toEqual({ shown: 61, inRange: false });
    expect([row(59.6), row(60), row(60.4)]).toEqual(['60 m · ✓ En alcance', '60 m · ✓ En alcance', '61 m · ✕ Fuera de alcance']);
  });

  test('una cañonera a 58 m está a tiro con N1, y a 62 m no', () => {
    expect(row(58)).toBe('58 m · ✓ En alcance');
    expect(row(62)).toBe('62 m · ✕ Fuera de alcance');
  });

  test('un jugador que no se puede atacar dice «✕ No atacable» con cualquier distancia (AC-153); un NPC, nunca', () => {
    expect(row(30, 'player', false)).toBe('30 m · ✕ No atacable');
    expect(row(30, 'player', true)).toBe('30 m · ✓ En alcance');
    expect(row(30, 'merchant', false)).toBe('30 m · ✓ En alcance');
  });
});

describe('Marca de peligro en el panel del objetivo (AC-189, D77)', () => {
  const player = (activeShip: PlayerShipClass, cannons = 1) =>
    ({ activeShip, upgrades: { cannons, hull: 1, sails: 1 } }) as PlayerView;
  const npc = (classId: string, kind: ShipKind = 'pirate', state: ShipState = 'alive') => ({ kind, classId, state });

  test('con la Balandra N1, la cañonera y el Capitán se marcan, y el pirata y el mercante no', () => {
    const sloop = player('sloop');
    expect([npc('gunboat'), npc(CAPTAIN_CLASS), npc('pirate'), npc('merchant', 'merchant')].map((t) => targetDanger(t, sloop))).toEqual([
      true,
      true,
      false,
      false
    ]);
  });

  test('la marca se quita al empezar el hundimiento, con «Hundido» en la fila de la distancia (D77)', () => {
    const sloop = player('sloop');
    expect((['alive', 'sinking', 'dead'] as const).map((state) => targetDanger(npc('gunboat', 'pirate', state), sloop))).toEqual([true, false, false]);
  });

  test('la marca de la cañonera se apaga al comprar Cañones N2', () => {
    expect(targetDanger(npc('gunboat'), player('sloop', 2))).toBe(false);
  });

  test('un jugador no se marca nunca, aunque su clase disparase: el cliente no conoce sus mejoras', () => {
    expect(targetDanger(npc(CAPTAIN_CLASS, 'player'), player('sloop'))).toBe(false);
  });

  test('sin los datos del jugador propio no hay marca', () => {
    expect(targetDanger(npc('gunboat'), null)).toBe(false);
  });

  test('el texto es el de §12.10', () => {
    expect(DANGER_TEXT).toBe('Demasiado fuerte para tu barco');
  });
});

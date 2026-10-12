// §0.4 y §6 (D32): en móvil y en calidad baja, el humo y el fuego de vida baja van con la tasa y la vida completas,
// así que el tope es de barcos: humo en ≤ 12 y fuego en ≤ 4. Lo que vive a la vez tiene que caber en los pools móviles.
// D35: el mínimo en px de la llama no pasa de ≈ 1/4 de la eslora en pantalla.
import { computePpm0, frameRangeM } from '../../art';
import { CANNON_LEVELS } from '../../../game/constants';
import { SHIP_RECIPES } from '../../models/ship-geometry';
import { DAMAGE_FX, flamePxMin, POOLS } from '../effects';

// Máximo vivo por emisor con una tasa y una vida fijas: justo tras emitir quedan floor(tasa·vida) + 1 tandas
const peak = (rate: number, life: number) => Math.floor(rate * life) + 1;

describe('Presupuesto del humo y el fuego de vida baja en móvil (D32)', () => {
  const [smokeShips, fireShips] = [DAMAGE_FX.smokeShips[1], DAMAGE_FX.fireShips[1]];
  const smokePerShip = peak(DAMAGE_FX.denseSmokeRate, DAMAGE_FX.smokeLife); // humo denso (≤ 25 %), un socket
  const flamesPerShip = DAMAGE_FX.fireSockets * peak(DAMAGE_FX.flameRate, DAMAGE_FX.flameLife); // ≤ 12 %: 3 sockets
  const coresPerShip = DAMAGE_FX.fireSockets * peak(DAMAGE_FX.coreRate, DAMAGE_FX.coreLife);
  const embersPerShip = DAMAGE_FX.fireSockets * peak(DAMAGE_FX.emberRate, DAMAGE_FX.emberLife);

  test('topes: humo en ≤ 12 barcos y fuego en ≤ 4 en móvil y calidad baja; fuego en ≤ 8 y humo sin tope en normal', () => {
    expect(DAMAGE_FX.smokeShips).toEqual([Infinity, 12]);
    expect(DAMAGE_FX.fireShips).toEqual([8, 4]);
  });

  // §0.4 cuenta 12 × 21 + 4 × 20 = 332 con la media de cuerpos vivos (3 × 12 × 0,55 = 19,8); justo tras una tanda
  // de los 3 sockets llegan a 21, y el pico es 12 × 21 + 4 × 21 = 336
  test('P_ALPHA: 12 barcos con humo denso + 4 con llamas en 3 sockets caben en las 640 del pool móvil', () => {
    expect(smokePerShip).toBe(21);
    expect(flamesPerShip).toBe(21);
    expect(smokeShips * smokePerShip + fireShips * flamesPerShip).toBeLessThanOrEqual(POOLS.mobile.alpha);
  });

  test('P_ADD: núcleos y brasas de los 4 barcos con fuego caben en las 192 del pool móvil', () => {
    expect(fireShips * (coresPerShip + embersPerShip)).toBeLessThanOrEqual(POOLS.mobile.add);
  });
});

// D35 (Q24): el mínimo en px del cuerpo de llama es min(10, 0,22·L·ppm) y el del núcleo min(5, 0,11·L·ppm)
describe('Mínimo en px de la llama de daño (D35)', () => {
  const ppm = (w: number, h: number, level: number) => computePpm0(w, h, frameRangeM(CANNON_LEVELS[level - 1].range));

  test('L·ppm pequeño: el mínimo baja de 10 px (Balandra en 390×844: 9,9 px con N1 y 8,1 px con N3)', () => {
    const L = SHIP_RECIPES.sloop.L;
    expect(flamePxMin(L, ppm(390, 844, 1))).toBeCloseTo(9.91, 2);
    expect(flamePxMin(L, ppm(390, 844, 3))).toBeCloseTo(8.05, 2);
    expect(flamePxMin(L, ppm(390, 844, 3), true)).toBeCloseTo(4.03, 2);
    expect(flamePxMin(L, 1)).toBeCloseTo(0.22 * L, 9); // nunca más de ≈ 1/4 de la eslora en pantalla
  });

  test('L·ppm grande: 10 px y 5 px, para todas las clases en escritorio con N1 y N3', () => {
    for (const r of Object.values(SHIP_RECIPES)) {
      for (const level of [1, 3]) {
        expect(flamePxMin(r.L, ppm(1440, 900, level))).toBe(10);
        expect(flamePxMin(r.L, ppm(1440, 900, level), true)).toBe(5);
      }
    }
  });

  test('390×844 con N3: solo la Balandra baja; Bergantín, Fragata, Pirata, Capitán y Mercante siguen en 10 px', () => {
    const changed = Object.entries(SHIP_RECIPES).filter(([, r]) => flamePxMin(r.L, ppm(390, 844, 3)) < 10).map(([id]) => id);
    expect(changed).toEqual(['sloop']);
  });
});

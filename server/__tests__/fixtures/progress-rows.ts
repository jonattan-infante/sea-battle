// Filas de player_progress para sembrar la BD en los tests, con el formato de GDD §13 («Formato de la fila»): v: 1, la de
// la 1.0 (sin XP), v: 2, la de la 1.1, y v: 3, la de la 1.3, que lee el puente (AC-220). Se escriben a mano, no con
// serializeProgress, para que un fallo del escritor no quede oculto en la siembra
import { SavedProgress } from '../../progress';

// Una fila de la 1.0. Solo existe con 0 de XP: una v: 1 con xp es un registro corrupto (AC-156)
export function rowV1(p: SavedProgress): Record<string, unknown> {
  if (p.xp !== 0) throw new Error(`Una fila v: 1 no lleva XP (${p.xp})`);
  return { v: 1, gold: p.gold, upgrades: { ...p.upgrades }, ownedShips: [...p.ownedShips], activeShip: p.activeShip };
}

export function rowV2(p: SavedProgress): Record<string, unknown> {
  return { v: 2, gold: p.gold, upgrades: { ...p.upgrades }, ownedShips: [...p.ownedShips], activeShip: p.activeShip, xp: p.xp };
}

// Todas las formas de fila de la 1.0 que acepta la 1.0.2 (AC-156): con y sin Bergantín y Fragata (y una sin Balandra, que
// la 1.0.2 también acepta), cada barco poseído como activo, cada nivel de cada mejora, y oro 0, uno corriente y el tope
export function v1Shapes(goldCap: number): SavedProgress[] {
  const fleets: SavedProgress['ownedShips'][] = [['sloop'], ['sloop', 'brig'], ['sloop', 'frigate'], ['sloop', 'brig', 'frigate'], ['brig']];
  const golds = [0, 1234, goldCap];
  const out: SavedProgress[] = [];
  let n = 0;
  for (const ownedShips of fleets) {
    for (const activeShip of ownedShips) {
      const level = (n % 3) + 1; // 1, 2, 3, … en cañones; casco y velas, desplazados, para cubrir cada nivel en cada eje
      out.push({
        gold: golds[n % 3],
        upgrades: { cannons: level, hull: ((n + 1) % 3) + 1, sails: ((n + 2) % 3) + 1 },
        ownedShips,
        activeShip,
        xp: 0
      });
      n++;
    }
  }
  return out;
}

// Filas v: 3 de la 1.3 (GDD §13, «Formato de la fila (1.3)»), tal como las escribe el escritor de la 1.3 (58b53d1, rama
// feat/ship-families): progress.test.ts comprueba que su escritor congelado (fixtures/progress-1.3.ts) da exactamente estas
// filas a partir del progreso de la 1.3, así que son filas de verdad aunque estén escritas a mano
const lv = (cannons: number, hull: number, sails: number) => ({ cannons, hull, sails });

// El ejemplo de AC-218: la Balandra a (3, 1, 2) y el Bergantín a N1, el Bergantín activo, las 2 familias y la española en uso
export const V3_AC218 = { v: 3, gold: 1234, xp: 2500, ships: { sloop: lv(3, 1, 2), brig: lv(1, 1, 1) }, activeShip: 'brig', families: ['gb', 'es'], family: 'es' };

// El ejemplo de AC-220 (c): con el Navío activo, el puente juega con la Fragata a (2, 2, 2)
export const V3_AC220 = { v: 3, gold: 5000, xp: 1500, ships: { sloop: lv(1, 1, 1), frigate: lv(2, 2, 2), line: lv(2, 1, 1) }, activeShip: 'line', families: ['es'], family: 'es' };

// Los dados de AC-220: la española en uso, niveles distintos en cada barco, la Goleta y el Navío, y el Navío activo
export const V3_FULL = {
  v: 3,
  gold: 4321,
  xp: 2500,
  ships: { sloop: lv(3, 1, 2), brig: lv(2, 3, 1), schooner: lv(1, 2, 3), frigate: lv(2, 2, 1), line: lv(3, 3, 2) },
  activeShip: 'line',
  families: ['gb', 'es'],
  family: 'es'
};

// Un jugador nuevo de la 1.3 tras su primera escritura (AC-218): solo la Balandra, sin familia y sin ninguna comprada (Q39)
export const V3_NEW = { v: 3, gold: 100, xp: 0, ships: { sloop: lv(1, 1, 1) }, activeShip: 'sloop', families: [], family: 'none' };

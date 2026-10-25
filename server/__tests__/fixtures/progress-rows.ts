// Filas de player_progress para sembrar la BD en los tests, con el formato de GDD §13 («Formato de la fila»): v: 1, la de
// la 1.0 (sin XP), y v: 2, la de la 1.1. Se escriben a mano, no con serializeProgress, para que un fallo del escritor no
// quede oculto en la siembra
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

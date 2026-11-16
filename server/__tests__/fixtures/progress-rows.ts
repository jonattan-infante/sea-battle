// Filas de player_progress para sembrar la BD en los tests, con el formato de GDD §13 («Formato de la fila»): v: 1, la de
// la 1.0 (sin XP), v: 2, la de la 1.1, y v: 3, la de la 1.3. Se escriben a mano, no con serializeProgress, para que un
// fallo del escritor no quede oculto en la siembra
import { NO_FAMILY, PlayerShipClass } from '../../../src/game/constants';
import { ShipLevels, Upgrades } from '../../../src/game/types';
import { SavedProgress } from '../../progress';

// El progreso de la 1.2 (filas v: 1 y v: 2): mejoras del jugador, no de cada barco
export interface LegacyProgress {
  gold: number;
  upgrades: Upgrades;
  ownedShips: PlayerShipClass[];
  activeShip: PlayerShipClass;
  xp: number;
}

// Una fila de la 1.0. Solo existe con 0 de XP: una v: 1 con xp es un registro corrupto (AC-156)
export function rowV1(p: LegacyProgress): Record<string, unknown> {
  if (p.xp !== 0) throw new Error(`Una fila v: 1 no lleva XP (${p.xp})`);
  return { v: 1, gold: p.gold, upgrades: { ...p.upgrades }, ownedShips: [...p.ownedShips], activeShip: p.activeShip };
}

export function rowV2(p: LegacyProgress): Record<string, unknown> {
  return { v: 2, gold: p.gold, upgrades: { ...p.upgrades }, ownedShips: [...p.ownedShips], activeShip: p.activeShip, xp: p.xp };
}

// Una fila de la 1.3 (AC-218), con las claves de `ships` en el orden en que llegan
export function rowV3(p: SavedProgress): Record<string, unknown> {
  const ships: Record<string, Upgrades> = {};
  for (const [classId, levels] of Object.entries(p.ships)) ships[classId] = { ...levels! };
  return { v: 3, gold: p.gold, xp: p.xp, ships, activeShip: p.activeShip, families: [...p.families], family: p.family };
}

// Lo que la 1.3 juega con una fila de la 1.2 (Q35 y Q39; AC-219): cada barco con los niveles de `upgrades`, en el orden de
// la tabla de ids, sin familia y sin ninguna comprada
export function migrated(p: LegacyProgress): SavedProgress {
  const ships: ShipLevels = {};
  for (const classId of ['sloop', 'brig', 'schooner', 'frigate', 'line'] as const) if (p.ownedShips.includes(classId)) ships[classId] = { ...p.upgrades };
  return { gold: p.gold, xp: p.xp, ships, activeShip: p.activeShip, families: [], family: NO_FAMILY };
}

// Todas las formas de fila de la 1.0 que acepta la 1.0.2 (AC-156): con y sin Bergantín y Fragata (y una sin Balandra, que
// la 1.0.2 también acepta), cada barco poseído como activo, cada nivel de cada mejora, y oro 0, uno corriente y el tope
export function v1Shapes(goldCap: number): LegacyProgress[] {
  const fleets: LegacyProgress['ownedShips'][] = [['sloop'], ['sloop', 'brig'], ['sloop', 'frigate'], ['sloop', 'brig', 'frigate'], ['brig']];
  const golds = [0, 1234, goldCap];
  const out: LegacyProgress[] = [];
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

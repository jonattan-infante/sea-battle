// Cifras derivadas de las tablas de constants.ts que comparten la simulación y el cliente (AC-189: el coste de un NPC en el
// panel del objetivo). Sin estado al importarse: el cliente lo usa sin arrastrar world.ts, que construye el grafo de rutas
import { SHIP_CLASSES, UPGRADE_LEVELS } from './constants';
import { Upgrades } from './types';

// Vida máxima de una clase con el casco del jugador (§11); sin jugador (un NPC), la de la tabla. Vale el Player del servidor
// y el PlayerView del cliente
export function maxHpFor(classId: string, player: { upgrades: Upgrades } | undefined): number {
  const mult = player ? UPGRADE_LEVELS.hull.multipliers[player.upgrades.hull - 1] : 1;
  return Math.round(SHIP_CLASSES[classId].maxHp * mult);
}

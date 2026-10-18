// Cifras derivadas de las tablas de constants.ts que comparten la simulación y el cliente (AC-189: el coste de un NPC en el
// panel del objetivo). Sin estado al importarse: el cliente lo usa sin arrastrar world.ts, que construye el grafo de rutas
import { CANNON_LEVELS, CannonStats, SHIP_CLASSES, UPGRADE_LEVELS } from './constants';
import { Upgrades } from './types';

// Vida máxima de una clase con el casco del jugador (§11); sin jugador (un NPC), la de la tabla. Vale el Player del servidor
// y el PlayerView del cliente
export function maxHpFor(classId: string, player: { upgrades: Upgrades } | undefined): number {
  const mult = player ? UPGRADE_LEVELS.hull.multipliers[player.upgrades.hull - 1] : 1;
  return Math.round(SHIP_CLASSES[classId].maxHp * mult);
}

// Daño medio por segundo (§7): una andanada de cannonsPerSide balas por recarga, cada una con su precisión. El servidor
// tira cada bala (rollHits en world.ts); esto es su media
function dpsOf(cannonsPerSide: number, cannon: CannonStats): number {
  return (cannonsPerSide * cannon.damage * cannon.accuracy) / cannon.reload;
}

// AC-189: la marca de peligro sale con un coste de más de la mitad de la vida máxima propia
export const DANGER_COST = 0.5;

// Coste de hundir un NPC en solitario (AC-189), en fracción de la vida máxima propia: el daño que hace el NPC mientras se le
// hunde, con el barco activo y las mejoras del jugador. Es un intercambio de andanadas sin reparar ni kiting, con las
// tablas y no con la vida actual, así que solo cambia con el barco o las mejoras. 0 si el NPC no dispara o el cliente no
// conoce su clase
export function soloSinkCost(npcClassId: string, player: { activeShip: string; upgrades: Upgrades }): number {
  const npc = SHIP_CLASSES[npcClassId];
  if (!npc?.cannon) return 0;
  const own = SHIP_CLASSES[player.activeShip];
  const ownDps = dpsOf(own.cannonsPerSide, CANNON_LEVELS[player.upgrades.cannons - 1]);
  const sinkTime = maxHpFor(npcClassId, undefined) / ownDps;
  return (dpsOf(npc.cannonsPerSide, npc.cannon) * sinkTime) / maxHpFor(player.activeShip, player);
}

export function marksDanger(cost: number): boolean {
  return cost > DANGER_COST;
}

export function tooStrong(npcClassId: string, player: { activeShip: string; upgrades: Upgrades }): boolean {
  return marksDanger(soloSinkCost(npcClassId, player));
}

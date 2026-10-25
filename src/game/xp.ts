// Experiencia, niveles e insignias (GDD §10b, 1.1). TypeScript puro y determinista, como world.ts: el servidor acredita la
// XP y el cliente usa las mismas funciones para mostrar el nivel, la insignia y la XP que daría un objetivo (AC-160).
// El reparto por daño es el del oro (splitReward en world.ts, con su mismo filtro de 60 s): aquí llegan las partes.
import {
  LEVEL_XP,
  NPC_XP,
  RANKS,
  XP_CAP,
  XP_LEVEL_FACTOR,
  XP_REPEAT_PERCENT,
  XP_REPEAT_WINDOW
} from './constants';
import { Player, World } from './types';
import { Vec2 } from './vec';

export type Rank = 1 | 2 | 3 | 4 | 5; // 1 Grumete … 5 Almirante (el `rank` del evento de ascenso, GDD §13)

// El nivel sale siempre de la XP total (AC-150): no hay un campo de nivel guardado
export function levelOf(xp: number): number {
  let level = 1;
  while (level < LEVEL_XP.length && xp >= LEVEL_XP[level]) level++;
  return level;
}

export function rankOf(level: number): Rank {
  let rank = 1;
  while (rank < RANKS.length && level >= RANKS[rank].fromLevel) rank++;
  return rank as Rank;
}

export function rankLabel(rank: Rank): string {
  return RANKS[rank - 1].label;
}

export function npcXp(classId: string): number {
  return NPC_XP[classId] ?? 0;
}

// Factor de nivel en %, con Δ = nivel de la víctima − nivel del atacante
export function levelFactorPercent(attackerLevel: number, victimLevel: number): number {
  const delta = victimLevel - attackerLevel;
  const { upPercentPerLevel, upMaxLevels, downPercentPerLevel } = XP_LEVEL_FACTOR;
  if (delta >= 0) return 100 + upPercentPerLevel * Math.min(delta, upMaxLevels);
  return Math.max(0, 100 - downPercentPerLevel * -delta);
}

// Factor de repetición en %, según los hundimientos con XP que ya lleva la pareja en su ventana
export function repeatPercent(priorKills: number): number {
  return XP_REPEAT_PERCENT[priorKills] ?? 0;
}

// XP de la parte de un atacante en un hundimiento PvP: los dos factores sobre su parte y un solo redondeo hacia abajo,
// en enteros para que 100 × 1,1 × 0,5 dé 55 y no 55,000…01
export function pvpXp(share: number, attackerLevel: number, victimLevel: number, priorKills: number): number {
  return Math.floor((share * levelFactorPercent(attackerLevel, victimLevel) * repeatPercent(priorKills)) / 10_000);
}

// Por encima del nivel 20 se sigue sumando, sin pasar del tope (§10b)
export function addXp(player: Player, amount: number): void {
  player.xp = Math.max(0, Math.min(XP_CAP, player.xp + amount));
}

// ---------- Parejas atacante → víctima (§10b, «Factor de repetición») ----------
// Viven en la memoria del servidor, por id de jugador: reconectar no las borra y un reinicio sí

// Hundimientos con XP que lleva la pareja en su ventana abierta (0 si no hay ventana o ya venció)
export function pairKills(world: World, attackerId: string, victimId: string): number {
  const pair = world.xpPairs.get(attackerId)?.get(victimId);
  return pair && world.time < pair.since + XP_REPEAT_WINDOW ? pair.kills : 0;
}

function recordPairKill(world: World, attackerId: string, victimId: string): void {
  let victims = world.xpPairs.get(attackerId);
  if (!victims) world.xpPairs.set(attackerId, (victims = new Map()));
  const pair = victims.get(victimId);
  if (pair && world.time < pair.since + XP_REPEAT_WINDOW) pair.kills += 1;
  else victims.set(victimId, { since: world.time, kills: 1 });
}

// Las ventanas vencidas se borran en cada hundimiento PvP, así que solo quedan las de los últimos 30 min
function pruneExpiredPairs(world: World): void {
  for (const [attackerId, victims] of world.xpPairs) {
    for (const [victimId, pair] of victims) if (world.time >= pair.since + XP_REPEAT_WINDOW) victims.delete(victimId);
    if (victims.size === 0) world.xpPairs.delete(attackerId);
  }
}

// Parejas abiertas de un atacante, para el panel del objetivo (AC-160): cuántos lleva y cuándo vence, en tiempo de servidor
export function openPairs(world: World, attackerId: string): { victimId: string; kills: number; expiresAt: number }[] {
  const victims = world.xpPairs.get(attackerId);
  if (!victims) return [];
  return [...victims]
    .filter(([, pair]) => world.time < pair.since + XP_REPEAT_WINDOW)
    .map(([victimId, pair]) => ({ victimId, kills: pair.kills, expiresAt: pair.since + XP_REPEAT_WINDOW }));
}

// ---------- Acreditar (lo llama sinkShip, en el mismo tick que el oro) ----------

// NPC hundido: cada jugador recibe su parte tal cual (AC-144, AC-145)
export function creditNpcXp(world: World, shares: Map<string, number>, pos: Vec2): void {
  for (const [playerId, xp] of shares) {
    const player = world.players.get(playerId);
    if (!player || xp <= 0) continue;
    addXp(player, xp);
    world.events.push({ type: 'xp', playerId, xp, pos: { ...pos }, source: 'kill' });
  }
}

// Jugador hundido: a la parte de cada atacante se le aplican su factor de nivel y el de su pareja con la víctima. Solo
// un hundimiento con XP abre o avanza la ventana de la pareja. La víctima no pierde nada (AC-146 a AC-148)
export function creditPvpXp(world: World, victim: Player, shares: Map<string, number>, pos: Vec2): void {
  if (shares.size === 0) return;
  pruneExpiredPairs(world);
  const victimLevel = levelOf(victim.xp);
  const attackers: { level: number; xp: number }[] = [];
  for (const [playerId, share] of shares) {
    const player = world.players.get(playerId);
    if (!player) continue;
    const level = levelOf(player.xp);
    const xp = pvpXp(share, level, victimLevel, pairKills(world, playerId, victim.id));
    attackers.push({ level, xp });
    if (xp <= 0) continue;
    recordPairKill(world, playerId, victim.id);
    addXp(player, xp);
    world.events.push({ type: 'xp', playerId, xp, pos: { ...pos }, source: 'pvp' });
  }
  if (attackers.length) world.pvpLog.push({ victimLevel, attackers });
}

export function drainPvpLog(world: World) {
  const log = world.pvpLog;
  world.pvpLog = [];
  return log;
}

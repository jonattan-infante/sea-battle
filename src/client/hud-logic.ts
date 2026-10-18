// Reglas del lado del cliente para el HUD y la entrada. Son solo para mostrar y habilitar botones:
// el servidor vuelve a validar cada intención (GDD §13).
import {
  CANNON_LEVELS,
  LEVEL_XP,
  LOW_HP_WARNING,
  MAP_HALF_SIZE,
  PirateSectorId,
  PORT_POSITION,
  PVP_ENABLED,
  SAFE_ZONE_RADIUS,
  SHIP_CLASSES,
  ShipKind,
  TAB_TARGET_RADIUS
} from '../game/constants';
import { tooStrong } from '../game/stats';
import { PlayerView } from '../game/types';
import { Vec2 } from '../game/vec';
import { levelOf, Rank, rankLabel, rankOf } from '../game/xp';
import type { GameClient, RenderShip } from './game-client';
import type { MeHud, Relation, TargetHud } from './hud-store';

export function inSafeZone(x: number, z: number): boolean {
  return Math.hypot(x - PORT_POSITION.x, z - PORT_POSITION.z) <= SAFE_ZONE_RADIUS;
}

export function relationOf(ship: Pick<RenderShip, 'id' | 'kind'>, myShipId: string | null): Relation {
  if (ship.id === myShipId) return 'self';
  return ship.kind;
}

export function cannonFor(player: PlayerView | null) {
  return CANNON_LEVELS[Math.max(0, Math.min(CANNON_LEVELS.length - 1, (player?.upgrades.cannons ?? 1) - 1))];
}

export function classLabel(classId: string): string {
  return SHIP_CLASSES[classId]?.label ?? classId;
}

// Celda de la rejilla del minimapa, «Sector E5» en su pie (D39): columnas A–J de oeste a este y filas 1–10 de norte a sur,
// en celdas de 100 m. En pantalla, «sector» solo nombra esta celda (D49)
export function sectorOf(x: number, z: number): string {
  const col = Math.max(0, Math.min(9, Math.floor((x + MAP_HALF_SIZE) / 100)));
  const row = Math.max(0, Math.min(9, Math.floor((z + MAP_HALF_SIZE) / 100)));
  return `${'ABCDEFGHIJ'[col]}${row + 1}`;
}

// Los cuadrantes del GDD (§4) se nombran como región, escrita entera, nunca «sector NE» (D49)
const REGIONS: Record<PirateSectorId, string> = { NE: 'noreste', NO: 'noroeste', SO: 'suroeste', SE: 'sureste' };

// Aviso y feed del Capitán pirata (GDD §9, AC-111). Aviso de D49: la región de su guarida y la celda de la guarida con
// sectorOf, la misma función del pie del minimapa, para que los dos textos no puedan divergir. Feed: hasta 3 nombres
// por daño y "y N más"
export function captainSpawnText(sector: PirateSectorId, lair: Vec2): string {
  return `¡Capitán pirata en el ${REGIONS[sector]}, sector ${sectorOf(lair.x, lair.z)}!`;
}

export function captainDownText(names: string[], more: number): string {
  if (names.length === 0) return 'El Capitán pirata ha caído';
  const list = more > 0 ? [...names, `${more} más`] : names;
  const text = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
  return `El Capitán pirata ha caído: ${text}`;
}

// ---------- Experiencia (1.1; GDD §10b y §14, ART-DIRECTION §12.9) ----------
// El nivel sale siempre de la XP (xp.ts): el cliente no guarda un nivel aparte

const fmt = (n: number) => n.toLocaleString('es-ES'); // el formato de la vida y el oro del HUD

// XP dentro del nivel y XP del nivel; span null en el nivel máximo
export interface XpProgress {
  level: number;
  rank: Rank;
  into: number;
  span: number | null;
}

export function xpProgress(xp: number): XpProgress {
  const level = levelOf(xp);
  const next = LEVEL_XP[level] as number | undefined;
  return { level, rank: rankOf(level), into: xp - LEVEL_XP[level - 1], span: next === undefined ? null : next - LEVEL_XP[level - 1] };
}

export function xpFill(p: XpProgress): number {
  return p.span === null ? 1 : p.into / p.span;
}

// «1240 / 2000 XP»: el title y el nombre accesible de la barra (D76); en el 20, «Nivel máximo» (GDD §14)
export function xpNumbers(p: XpProgress): string {
  return p.span === null ? 'Nivel máximo' : `${fmt(p.into)} / ${fmt(p.span)} XP`;
}

// «Nivel 12», y «Nivel máximo» en su lugar en el 20: en escritorio a la derecha de la línea de estado (D76), en 390×844
// junto a la vida y en 844×390 en la fila del nombre
export function levelText(p: XpProgress): string {
  return p.span === null ? 'Nivel máximo' : `Nivel ${p.level}`;
}

// Subida de nivel del propio jugador entre dos estados del servidor (AC-151). Un hundimiento que da varios niveles (el
// Capitán) da un solo aviso, con el nivel final y su insignia si cambió. prevXp undefined: el primer estado al entrar
export interface LevelUp {
  level: number;
  rank: Rank;
  rankChanged: boolean;
}

export function levelUpOf(prevXp: number | undefined, xp: number): LevelUp | null {
  if (prevXp === undefined) return null;
  const from = levelOf(prevXp);
  const level = levelOf(xp);
  if (level <= from) return null;
  const rank = rankOf(level);
  return { level, rank, rankChanged: rank !== rankOf(from) };
}

export function levelUpText(up: LevelUp): string {
  return up.rankChanged ? `¡Nivel ${up.level}! Ahora eres ${rankLabel(up.rank)}` : `¡Nivel ${up.level}!`;
}

// Línea de tipo del panel del objetivo cuando es otro jugador (AC-153; GDD §14, «Panel de objetivo»): clase corta, nivel
// e insignia. La insignia ya dice que es un jugador (los NPC no llevan), y si se le puede atacar va en la fila de la
// distancia («✕ No atacable»)
const SHORT_CLASS: Record<string, string> = { line: 'Navío' }; // el Navío de línea

export function shortClassLabel(classId: string): string {
  return SHORT_CLASS[classId] ?? classLabel(classId);
}

export function targetTypeLine(classId: string, level: number): string {
  return `${shortClassLabel(classId)} · Nivel ${level} · ${rankLabel(rankOf(level))}`;
}

// Línea de recompensa del feed (AC-152; GDD §14, «XP ganada»): «Hundiste a Pirata +105 oro · +30 XP». El nombre va
// aparte porque es lo único que se trunca (ART-DIRECTION §12.9). Cada tramo sale solo si es > 0
export interface Reward {
  lead: string;
  name: string | null;
  gold: number;
  xp: number;
}

export type RewardSource = 'kill' | 'wreck' | 'pvp';

// Recompensas de una pasada de eventos, con el punto y la fuente para juntar el hundimiento, el oro y la XP del mismo
// barco. En un frame llegan por ese orden (world.ts, sinkShip), con el mismo punto: el del barco hundido
export interface RewardDraft extends Reward {
  source: RewardSource;
  x: number;
  z: number;
}

// Sin hundimiento propio: quien ayudó a hundir un NPC cobra «Botín» (b), unos restos son «Restos» y quien ayudó en un PvP
// solo cobra XP, «Ayudaste en un hundimiento» (d)
const REWARD_LEAD: Record<RewardSource, string> = { kill: 'Botín', wreck: 'Restos', pvp: 'Ayudaste en un hundimiento' };

const draft = (source: RewardSource, pos: Vec2, lead: string, name: string | null): RewardDraft => ({ source, x: pos.x, z: pos.z, lead, name, gold: 0, xp: 0 });
const samePlace = (d: RewardDraft, pos: Vec2) => d.source !== 'wreck' && d.x === pos.x && d.z === pos.z;

// El barco que hundiste tú (el `sunk` con tu barco como autor): «Hundiste a <nombre>», (a) y (c)
export function pushKillReward(batch: RewardDraft[], source: 'kill' | 'pvp', name: string, pos: Vec2): void {
  batch.push(draft(source, pos, 'Hundiste a', name));
}

export function pushGoldReward(batch: RewardDraft[], source: RewardSource, gold: number, pos: Vec2): void {
  const same = source === 'wreck' ? undefined : batch.find((d) => samePlace(d, pos) && d.gold === 0);
  if (same) same.gold += gold;
  // El oro de un PvP solo lo cobra quien lo hundió, que siempre recibe su `sunk`: si faltara, se nombra «un barco»
  else batch.push({ ...(source === 'pvp' ? draft(source, pos, 'Hundiste a', 'un barco') : draft(source, pos, REWARD_LEAD[source], null)), gold });
}

export function pushXpReward(batch: RewardDraft[], source: 'kill' | 'pvp', xp: number, pos: Vec2): void {
  const same = batch.find((d) => samePlace(d, pos) && d.xp === 0);
  if (same) same.xp += xp;
  else batch.push({ ...draft(source, pos, REWARD_LEAD[source], null), xp });
}

// Las líneas que salen. Un NPC hundido sin oro ni XP para ti no tiene línea, como en la 1.0; hundir a un jugador siempre
// se cuenta, también sin tramos: «Hundiste a Barbarroja» (c)
export function rewardLines(batch: readonly RewardDraft[]): Reward[] {
  return batch.filter((d) => d.source === 'pvp' || d.gold > 0 || d.xp > 0).map(({ lead, name, gold, xp }) => ({ lead, name, gold, xp }));
}

export function rewardParts(r: Reward): { gold: string; xp: string } {
  return { gold: r.gold > 0 ? `+${r.gold} oro` : '', xp: r.xp > 0 ? `+${r.xp} XP` : '' };
}

export function rewardText(r: Reward): string {
  const { gold, xp } = rewardParts(r);
  return [r.lead, r.name, [gold, xp].filter(Boolean).join(' · ')].filter(Boolean).join(' ');
}

// Alcance (AC-31, 1.1: «el panel dice exactamente lo que hace el servidor»). Se compara la distancia sin redondear, como
// el servidor (world.ts no dispara con dist > alcance) y el estado de la acción. La distancia se muestra redondeada hacia
// arriba: con alcances enteros, «distancia mostrada ≤ alcance» es «a tiro», así que a 60,4 m dice «61 m · ✕ Fuera de
// alcance», y no «60 m» con un texto que la contradice
export function inCannonRange(distance: number, cannonRange: number): boolean {
  return distance <= cannonRange;
}

export function targetDistance(distance: number, cannonRange: number): { shown: number; inRange: boolean } {
  return { shown: Math.ceil(distance), inRange: inCannonRange(distance, cannonRange) };
}

// La fila de la distancia del panel del objetivo. Si a otro jugador no se le puede atacar (protegido o en la zona
// segura), «En alcance» o «Fuera de alcance» no significan nada: «✕ No atacable» (AC-153)
export function rangeText(target: Pick<TargetHud, 'relation' | 'attackable' | 'inRange'>): string {
  if (target.relation === 'player' && !target.attackable) return '✕ No atacable';
  return target.inRange ? '✓ En alcance' : '✕ Fuera de alcance';
}

// Marca de peligro (AC-189, D77): «este barco es demasiado fuerte para ti ahora», con el coste de hundirlo en solitario de
// src/game/stats.ts. Solo los NPC: el cliente no conoce las mejoras de los demás jugadores. El mercante no dispara
export const DANGER_TEXT = 'Demasiado fuerte para tu barco';

export function targetDanger(target: { kind: ShipKind; classId: string }, player: PlayerView | null): boolean {
  return target.kind !== 'player' && !!player && tooStrong(target.classId, player);
}

// Vida baja (< 30 %, AC-41): el panel propio avisa y el botón Reparar pulsa
export function isLowHp(me: Pick<MeHud, 'state' | 'hp' | 'maxHp'>): boolean {
  return me.state === 'alive' && me.hp / me.maxHp < LOW_HP_WARNING;
}

// Por qué Puerto no abre (§12.4). Con la BD caída manda el corte, también fuera de la zona (AC-132, D50: «mientras dure
// el corte, pulsar Puerto o P no abre la tienda»); si no, la zona segura (AC-66). null: abre
export const SHOP_UNAVAILABLE = 'La tienda no está disponible: no podemos guardar';
export interface PortBlock {
  title: string;
  toast: { kind: 'warn' | 'danger'; text: string };
}
export function portBlock(me: Pick<MeHud, 'state' | 'inSafeZone'> | null, saveWarning: boolean): PortBlock | null {
  if (saveWarning) return { title: SHOP_UNAVAILABLE, toast: { kind: 'danger', text: SHOP_UNAVAILABLE } };
  if (me?.state === 'alive' && me.inSafeZone) return null;
  return { title: 'Solo en la zona segura', toast: { kind: 'warn', text: 'El puerto solo abre en la zona segura' } };
}

// Misma regla que canAttack en src/game/world.ts, con los datos interpolados del cliente
export function canAttackClient(client: GameClient, me: RenderShip | undefined, target: RenderShip | undefined): boolean {
  if (!me || !target || me.state !== 'alive' || target.state !== 'alive' || me.id === target.id) return false;
  if (target.kind !== 'player') return true;
  const now = client.serverTime();
  return (
    PVP_ENABLED &&
    !inSafeZone(target.x, target.z) &&
    !inSafeZone(me.x, me.z) &&
    target.protectedUntil <= now &&
    me.protectedUntil <= now
  );
}

// Tab / Shift+Tab: atacables a ≤ 150 m, del más cercano al más lejano (GDD §5)
export function cycleTarget(client: GameClient, currentId: string | null, backwards: boolean): string | null {
  const me = client.getShip(client.myShipId);
  if (!me || me.state !== 'alive') return null;
  const list: { id: string; d: number }[] = [];
  for (const s of client.getShips()) {
    if (!canAttackClient(client, me, s)) continue;
    const d = Math.hypot(s.x - me.x, s.z - me.z);
    if (d <= TAB_TARGET_RADIUS) list.push({ id: s.id, d });
  }
  if (list.length === 0) return null;
  list.sort((a, b) => a.d - b.d);
  const i = list.findIndex((e) => e.id === currentId);
  if (i < 0) return list[backwards ? list.length - 1 : 0].id;
  return list[(i + (backwards ? list.length - 1 : 1)) % list.length].id;
}

// Señales que cambian con el reloj y se pintan por ref, sin pasar por React
export const hudSignals = {
  lastVolleyAt: -Infinity, // performance.now() de la última andanada propia (−∞: ninguna)
  reloadMs: CANNON_LEVELS[0].reload * 1000,
  lastHitAt: -Infinity // performance.now() del último daño recibido (−∞: ninguno; con 0, los 3 primeros s tras cargar contaban como "bajo fuego")
};

// Un único requestAnimationFrame para todos los elementos del HUD que se actualizan por ref
type Tick = (now: number) => void;
const ticks = new Set<Tick>();
let rafId = 0;

function loop(now: number) {
  ticks.forEach((t) => t(now));
  rafId = ticks.size > 0 ? requestAnimationFrame(loop) : 0;
}

export function addTicker(tick: Tick): () => void {
  ticks.add(tick);
  if (!rafId) rafId = requestAnimationFrame(loop);
  return () => {
    ticks.delete(tick);
  };
}

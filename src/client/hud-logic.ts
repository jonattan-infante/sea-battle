// Reglas del lado del cliente para el HUD y la entrada. Son solo para mostrar y habilitar botones:
// el servidor vuelve a validar cada intención (GDD §13).
import {
  CANNON_LEVELS,
  LOW_HP_WARNING,
  PORT_POSITION,
  PVP_ENABLED,
  SAFE_ZONE_RADIUS,
  SHIP_CLASSES,
  TAB_TARGET_RADIUS
} from '../game/constants';
import { PlayerView } from '../game/types';
import type { GameClient, RenderShip } from './game-client';
import type { MeHud, Relation } from './hud-store';

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

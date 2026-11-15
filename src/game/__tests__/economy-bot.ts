// Bot "barco primero" de AC-60 (§10), compartido por economy.test.ts (mapa de la 1.0, en `npm test`) y por el arnés de
// AC-173 (b) con el mapa de la 1.1 y 20 semillas (src/game/__map11__, `npm run test:map11`; producto, r11 d2814e1)
import { CAPTAIN_CLASS, GUNBOAT_CLASS, MAP_1_0, MapDef, PORT_POSITION, TICK_RATE } from '../constants';
import { Player, Ship } from '../types';
import { distance } from '../vec';
import { addPlayer, attack, buy, cannonOf, createWorld, isInSafeZone, itemPrice, moveTo, respawn, setRepair, shipOfPlayer, ShopItem } from '../world';
import { DT, run } from './helpers';

// Bot "barco primero" (AC-60): ataca al NPC más cercano, repara bajo el 40 %, no compra nada hasta poder
// pagar el Bergantín y, desde ahí, compra siempre lo más barato disponible (Fragata incluida). Con el Capitán pirata
// (H-305): no lo ataca, no entra a menos de 200 m de su guarida y, si el capitán lo elige, navega al puerto. Con la
// Cañonera (H-306): no la ataca mientras su cañón tenga menos alcance que ella (65 m), es decir, hasta Cañones N2
const LAIR_AVOID = 200;
const DUEL_DISTANCE = 40; // el bot se mantiene a ≤ 40 m de su objetivo
const CATALOG: ShopItem[] = [
  ...(['cannons', 'hull', 'sails'] as const).flatMap((upgrade) => [2, 3].map((level) => ({ kind: 'upgrade' as const, upgrade, level }))),
  { kind: 'ship', classId: 'brig' },
  { kind: 'ship', classId: 'frigate' }
];
function nextItem(p: Player): ShopItem | null {
  if (!p.ownedShips.includes('brig')) return { kind: 'ship', classId: 'brig' };
  const available = CATALOG.filter((i) =>
    i.kind === 'upgrade' ? i.level === p.upgrades[i.upgrade] + 1 : !p.ownedShips.includes(i.classId)
  );
  return available.sort((x, y) => itemPrice(x) - itemPrice(y))[0] ?? null;
}

export function simulateShipFirst(seed: number, i2: boolean, map: MapDef = MAP_1_0) {
  const world = createWorld({ seed, i2, map });
  addPlayer(world, 'g', 'Bot');
  const p = world.players.get('g')!;
  let earned = 0;
  let t500 = Infinity;
  let tBrig = Infinity;
  let tAll = Infinity;
  let earnedAtBrig = 0;
  let captains = 0;
  let fled = 0;
  let minLair = Infinity;
  const seen = new Set<string>();
  for (let tick = 1; tick <= 90 * 60 * TICK_RATE && tAll === Infinity; tick++) {
    const t = tick * DT;
    const cap = [...world.ships.values()].find((o) => o.classId === CAPTAIN_CLASS && o.state === 'alive');
    const lair = cap?.ai?.origin ?? null;
    if (cap && !seen.has(cap.id)) {
      seen.add(cap.id);
      captains++;
    }
    const own = shipOfPlayer(world, 'g')!;
    if (lair && own.state === 'alive') minLair = Math.min(minLair, distance(own.pos, lair));
    if (tick % 10 === 0) {
      const s = shipOfPlayer(world, 'g')!;
      if (s.state === 'dead') respawn(world, 'g');
      else if (s.state === 'alive' && cap && (cap.attackTargetId === s.id || distance(s.pos, lair!) < LAIR_AVOID) && !isInSafeZone(s.pos)) {
        // El capitán lo eligió o está cerca de su guarida: al puerto
        if (s.attackTargetId) fled++;
        s.attackTargetId = null;
        if (s.repairing) setRepair(world, 'g', false);
        if (!s.destination || distance(s.destination, PORT_POSITION) > 5) moveTo(world, 'g', PORT_POSITION);
      } else if (s.state === 'alive' && !s.repairing) {
        const item = nextItem(p);
        if (s.hp / s.maxHp < 0.4) setRepair(world, 'g', true);
        else if (item && p.gold >= itemPrice(item)) {
          if (isInSafeZone(s.pos)) {
            buy(world, 'g', item);
            if (item.kind === 'ship' && item.classId === 'brig') {
              tBrig = t;
              earnedAtBrig = earned;
            }
            if (!nextItem(p)) tAll = t;
          } else {
            s.attackTargetId = null;
            if (!s.destination) moveTo(world, 'g', { x: 0, z: 0 });
          }
        } else {
          let best: Ship | null = null;
          for (const o of world.ships.values()) {
            if (o.kind === 'player' || o.state !== 'alive' || o.classId === CAPTAIN_CLASS) continue;
            if (o.classId === GUNBOAT_CLASS && cannonOf(world, s)!.range < cannonOf(world, o)!.range) continue;
            // Para dispararle tendría que acercarse a ≤ 40 m: nada a menos de 240 m de la guarida
            if (lair && distance(o.pos, lair) < LAIR_AVOID + DUEL_DISTANCE) continue;
            if (!best || distance(o.pos, s.pos) < distance(best.pos, s.pos)) best = o;
          }
          if (best) {
            if (s.attackTargetId !== best.id) attack(world, 'g', best.id);
            if (distance(s.pos, best.pos) > DUEL_DISTANCE) moveTo(world, 'g', best.pos);
          }
        }
      }
    }
    for (const e of run(world, DT)) {
      if (e.type === 'loot' && e.playerId === 'g') earned += e.gold;
    }
    if (t500 === Infinity && earned >= 500) t500 = t;
  }
  return { t500, tBrig, tAll, deaths: p.deaths, n1PerMin: earnedAtBrig / (tBrig / 60), captains, fled, minLair };
}

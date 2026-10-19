// Simulación autoritativa del mundo (GDD §4–§12). TypeScript puro y determinista: sin React, three.js,
// sockets, Date ni Math.random (todo el azar sale de world.rng).
import {
  ARRIVE_DISTANCE,
  ATTACK_MAX_DISTANCE,
  CANNONBALL_SPEED,
  CANNON_LEVELS,
  CAPTAIN_CLASS,
  CAPTAIN_KILLS_TO_SPAWN,
  CAPTAIN_LAIR_RADIUS,
  CAPTAIN_SPAWN_MIN_PLAYER_DISTANCE,
  CannonStats,
  DEATH_COUNTDOWN,
  RESPAWN_CLOCK_TOLERANCE,
  DEATH_GOLD_PENALTY,
  DISCONNECT_GRACE,
  GOLD_CAP,
  GUNBOATS_PER_SECTOR,
  GUNBOAT_CLASS,
  GUNBOAT_RING,
  HOSTILE_AI,
  ORBIT_LEAD,
  HostileAiStats,
  IslandDef,
  MAP_1_0,
  MOORING_AXIS,
  MapDef,
  Mooring,
  LOOT_DAMAGE_WINDOW,
  MAX_UPGRADE_LEVEL,
  MERCHANT_FLEE_TIME,
  MERCHANT_RING,
  navClearance,
  PIVOT_MIN_ANGLE,
  PIVOT_SPEED,
  PIVOT_ZONE,
  MERCHANT_ROUTE_POINTS,
  NAV_LIMIT,
  NPC_POPULATION,
  NPC_POPULATION_I2,
  NPC_RESPAWN_MIN_PLAYER_DISTANCE,
  PIRATES_PER_SECTOR,
  PIRATES_PER_SECTOR_I2,
  PIRATE_PATROL_WAIT,
  PIRATE_PORT_EXCLUSION,
  PIRATE_RETURN_ARRIVE,
  PIRATE_RING,
  PIRATE_SECTORS,
  PLAYER_SHIP_ORDER,
  PORT_POSITION,
  PVP_ENABLED,
  PVP_XP,
  PlayerShipClass,
  REPAIR_MAX_SPEED,
  REPAIR_RATE,
  REPAIR_RATE_UNDER_FIRE,
  REPAIR_TICK,
  REPAIR_UNDER_FIRE_WINDOW,
  RESPAWN_RING,
  SAFE_ZONE_RADIUS,
  SHIP_CLASSES,
  SINKING_TIME,
  SPAWN_PROTECTION,
  STARTING_GOLD,
  STARTING_SHIP,
  ShipClassStats,
  THREAT_WINDOW,
  TURN_FACTORS,
  UPGRADE_LEVELS,
  UpgradeId,
  WRECK_LIFETIME,
  WRECK_PICKUP_RADIUS
} from './constants';
import { Navigator, segmentPointDistance } from './nav';
import { NpcAi, Player, PlayerView, Ship, ShipSnapshot, World } from './types';
import { Vec2, angleDelta, createRng, distance, forward, headingTo, normalizeAngle } from './vec';
import { creditNpcXp, creditPvpXp, levelOf, npcXp } from './xp';

export const navigator = new Navigator(MAP_1_0.islands);
const navigators = new WeakMap<IslandDef[], Navigator>([[MAP_1_0.islands, navigator]]);
// Márgenes y radios de colisión de todas las clases: sus grafos y cruces se preparan al crear el mundo, no en el tick de la
// primera ruta o del primer contacto con la costa (AC-171)
const NAV_CLEARANCES = [...new Set(Object.keys(SHIP_CLASSES).map(navClearance))];
const COLLISION_RADII = [...new Set(Object.values(SHIP_CLASSES).map((c) => c.radius))];

// El navegador del mapa del mundo: uno por lista de islas, así los mundos del mismo mapa comparten grafos y cruces
export function navigatorOf(world: World): Navigator {
  let nav = navigators.get(world.islands);
  if (!nav) {
    nav = new Navigator(world.islands);
    navigators.set(world.islands, nav);
  }
  return nav;
}
const EPS = 1e-6;

export interface CreateWorldOptions {
  seed?: number;
  spawnNpcs?: boolean;
  i2?: boolean; // AC-187: apagado por defecto, como en staging y prod
  map?: MapDef; // por defecto, el de la 1.0 (el del juego); MAP_1_1 es el de la 1.1, aún sin activar (constants.ts)
}

export function createWorld(options: CreateWorldOptions = {}): World {
  const map = options.map ?? MAP_1_0;
  const world: World = {
    time: 0,
    tick: 0,
    ships: new Map(),
    players: new Map(),
    projectiles: [],
    wrecks: [],
    islands: map.islands,
    moorings: map.moorings,
    events: [],
    rng: createRng(options.seed ?? 1),
    nextId: 1,
    killsSinceBoss: 0,
    i2: options.i2 ?? false,
    xpPairs: new Map(),
    pvpLog: []
  };
  navigatorOf(world).prepare(NAV_CLEARANCES, COLLISION_RADII);
  if (options.spawnNpcs !== false) {
    // AC-51: con el I2 encendido, 1 cañonera por sector en lugar de 1 de sus piratas; apagado, la población de la 1.0
    const pirates = world.i2 ? PIRATES_PER_SECTOR_I2 : PIRATES_PER_SECTOR;
    PIRATE_SECTORS.forEach((_, sector) => {
      for (let i = 0; i < pirates; i++) spawnPirate(world, sector);
    });
    if (world.i2) {
      PIRATE_SECTORS.forEach((_, sector) => {
        for (let i = 0; i < GUNBOATS_PER_SECTOR; i++) spawnGunboat(world, sector);
      });
    }
    const merchants = world.i2 ? NPC_POPULATION_I2.merchant : NPC_POPULATION.merchant;
    for (let i = 0; i < merchants; i++) spawnMerchant(world);
  }
  return world;
}

// ---------- Utilidades de reglas ----------

const rand = (world: World, min: number, max: number) => min + world.rng() * (max - min);

export function classOf(ship: Ship): ShipClassStats {
  return SHIP_CLASSES[ship.classId];
}

export function playerOf(world: World, ship: Ship): Player | undefined {
  return ship.ownerId ? world.players.get(ship.ownerId) : undefined;
}

export function cannonOf(world: World, ship: Ship): CannonStats | null {
  const player = playerOf(world, ship);
  if (player) return CANNON_LEVELS[player.upgrades.cannons - 1];
  return classOf(ship).cannon;
}

export function maxSpeedOf(world: World, ship: Ship): number {
  const player = playerOf(world, ship);
  const mult = player ? UPGRADE_LEVELS.sails.multipliers[player.upgrades.sails - 1] : 1;
  return classOf(ship).maxSpeed * mult;
}

export function maxHpFor(classId: string, player: Player | undefined): number {
  const mult = player ? UPGRADE_LEVELS.hull.multipliers[player.upgrades.hull - 1] : 1;
  return Math.round(SHIP_CLASSES[classId].maxHp * mult);
}

export function isInSafeZone(pos: Vec2): boolean {
  return distance(pos, PORT_POSITION) <= SAFE_ZONE_RADIUS;
}

export function isProtected(world: World, ship: Ship): boolean {
  return ship.protectedUntil > world.time;
}

export function isAlive(ship: Ship | undefined): ship is Ship {
  return !!ship && ship.state === 'alive';
}

// Un jugador al que un pirata o PvP puede atacar: a flote, fuera de la zona segura y sin protección.
// Un barco desconectado sigue siendo atacable durante el margen de reconexión (AC-96).
export function isAttackablePlayer(world: World, ship: Ship): boolean {
  return ship.kind === 'player' && isAlive(ship) && !isInSafeZone(ship.pos) && !isProtected(world, ship);
}

export function canAttack(world: World, attacker: Ship, target: Ship): boolean {
  if (!isAlive(attacker) || !isAlive(target) || attacker.id === target.id) return false;
  if (!cannonOf(world, attacker)) return false;
  if (attacker.kind === 'merchant') return false;
  if (attacker.kind === 'pirate') return isAttackablePlayer(world, target);
  if (target.kind === 'player') {
    return PVP_ENABLED && isAttackablePlayer(world, target) && !isInSafeZone(attacker.pos) && !isProtected(world, attacker);
  }
  return true;
}

// Oro que pierde un jugador al hundirse (§10)
export function deathPenalty(gold: number): number {
  return Math.floor(gold * DEATH_GOLD_PENALTY);
}

function addGold(player: Player, amount: number): void {
  player.gold = Math.max(0, Math.min(GOLD_CAP, player.gold + amount));
}

// ---------- Generación de NPC ----------

function farFromPlayers(world: World, pos: Vec2): boolean {
  for (const s of world.ships.values()) {
    if (s.kind === 'player' && s.state !== 'dead' && distance(s.pos, pos) < NPC_RESPAWN_MIN_PLAYER_DISTANCE) return false;
  }
  return true;
}

// Punto válido para aparecer o planificar: dentro del límite y fuera del margen de navegación (§6)
function navigableFor(world: World, pos: Vec2, clearance: number): boolean {
  return navigatorOf(world).navigable(pos, clearance);
}

// Punto de aparición de un hostil en su sector: el anillo pirata o, la cañonera, el suyo (§9)
function pirateSpot(world: World, sector: number, checkPlayers: boolean, classId = 'pirate'): Vec2 {
  const { sx, sz } = PIRATE_SECTORS[sector];
  const radius = navClearance(classId);
  const ring = classId === GUNBOAT_CLASS ? GUNBOAT_RING : PIRATE_RING;
  let fallback: Vec2 | null = null;
  for (let attempt = 0; attempt < 120; attempt++) {
    const a = rand(world, 0.12, Math.PI / 2 - 0.12);
    const r = rand(world, ring.min, ring.max);
    const p = { x: Math.cos(a) * r * sx, z: Math.sin(a) * r * sz };
    if (!navigableFor(world, p, radius)) continue;
    fallback ??= p;
    if (!checkPlayers || farFromPlayers(world, p)) return p;
  }
  return fallback ?? { x: sx * 380, z: sz * 380 };
}

function newShip(world: World, classId: string, name: string, ownerId: string | null, pos: Vec2, heading: number): Ship {
  const stats = SHIP_CLASSES[classId];
  return {
    id: `ship-${world.nextId++}`,
    kind: stats.kind,
    classId,
    name,
    ownerId,
    pos: { ...pos },
    heading,
    speed: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    state: 'alive',
    stateTimer: 0,
    destination: null,
    path: [],
    attackTargetId: null,
    reload: 0,
    repairing: false,
    repairClock: 0,
    lastDamagedAt: -Infinity,
    damage: [],
    protectedUntil: 0,
    ai: null,
    disconnectedAt: null
  };
}

function spawnHostile(world: World, classId: string, sector: number): Ship {
  const pos = pirateSpot(world, sector, true, classId);
  const ship = newShip(world, classId, SHIP_CLASSES[classId].label, null, pos, rand(world, 0, Math.PI * 2));
  ship.ai = { state: 'patrol', origin: { ...pos }, sector, wait: rand(world, 0, 2), targetId: null, route: [], routeIndex: 0, fleeUntil: 0, threatId: null };
  world.ships.set(ship.id, ship);
  return ship;
}

export function spawnPirate(world: World, sector: number): Ship {
  return spawnHostile(world, 'pirate', sector);
}

// Cañonera pirata (§9, I2) en su anillo del sector. null con el I2 apagado (AC-187: nada del I2 en el mundo, como el Capitán)
export function spawnGunboat(world: World, sector: number): Ship | null {
  return world.i2 ? spawnHostile(world, GUNBOAT_CLASS, sector) : null;
}

// ---------- Capitán pirata (§9, I2) ----------

function isCaptain(ship: Ship): boolean {
  return ship.classId === CAPTAIN_CLASS;
}

// Capitán en el mundo (vivo o hundiéndose): nunca hay más de uno. Al terminar de hundirse sale del mundo
function captainOf(world: World): Ship | undefined {
  for (const s of world.ships.values()) if (isCaptain(s)) return s;
  return undefined;
}

// Sector pirata de un punto (§4): NE = (x+, z−), NO = (x−, z−), SO = (x−, z+), SE = (x+, z+)
function sectorAt(p: Vec2): number {
  return p.x > 0 ? (p.z < 0 ? 0 : 3) : p.z < 0 ? 1 : 2;
}

// Puntos del arco exterior (440 m) de un sector: primero el centro y luego hacia los lados, a pasos de 2,5°, sin salir del
// abanico de pirateSpot (0,12 rad de margen con los ejes)
const LAIR_OFFSETS = (() => {
  const step = (2.5 * Math.PI) / 180;
  const out = [0];
  for (let k = 1; k * step <= Math.PI / 4 - 0.12; k++) out.push(k * step, -k * step);
  return out;
})();

// Guarida (§9): sector pirata con menos jugadores (empate al azar, con la semilla), su punto exterior y, si está a menos
// de 150 m de un jugador, el punto libre más cercano del mismo arco; si el arco entero está ocupado, el siguiente sector
function captainLair(world: World): { pos: Vec2; sector: number } | null {
  const players = [...world.ships.values()].filter((s) => s.kind === 'player' && s.state !== 'dead');
  const counts = [0, 0, 0, 0];
  for (const p of players) counts[sectorAt(p.pos)]++;
  const order = counts.map((n, i) => ({ i, n, r: world.rng() })).sort((a, b) => a.n - b.n || a.r - b.r);
  const clearance = navClearance(CAPTAIN_CLASS);
  for (const { i } of order) {
    const { sx, sz } = PIRATE_SECTORS[i];
    for (const offset of LAIR_OFFSETS) {
      const a = Math.PI / 4 + offset;
      const pos = { x: Math.cos(a) * CAPTAIN_LAIR_RADIUS * sx, z: Math.sin(a) * CAPTAIN_LAIR_RADIUS * sz };
      if (!navigableFor(world, pos, clearance)) continue;
      if (players.every((p) => distance(p.pos, pos) >= CAPTAIN_SPAWN_MIN_PLAYER_DISTANCE)) return { pos, sector: i };
    }
  }
  return null;
}

// Hace aparecer al capitán en su guarida (o en `at`, solo escenarios y tests) y avisa a todos (AC-111). null con el I2
// apagado (AC-187: es la única compuerta, también para los escenarios), si ya hay uno o si ningún punto del arco exterior
// está a ≥ 150 m de todos los jugadores (se reintenta en el siguiente tick)
export function spawnCaptain(world: World, at?: Vec2): Ship | null {
  if (!world.i2 || captainOf(world)) return null;
  const lair = at ? { pos: { ...at }, sector: sectorAt(at) } : captainLair(world);
  if (!lair) return null;
  const ship = newShip(world, CAPTAIN_CLASS, SHIP_CLASSES[CAPTAIN_CLASS].label, null, lair.pos, rand(world, 0, Math.PI * 2));
  ship.ai = { state: 'patrol', origin: { ...lair.pos }, sector: lair.sector, wait: rand(world, 0, 2), targetId: null, route: [], routeIndex: 0, fleeUntil: 0, threatId: null };
  world.ships.set(ship.id, ship);
  world.events.push({ type: 'captain', shipId: ship.id, sector: PIRATE_SECTORS[lair.sector].id, pos: { ...lair.pos } });
  return ship;
}

// Aparición (AC-54): con 10 piratas o cañoneras hundidos desde su última muerte, si no hay ninguno
function updateCaptain(world: World): void {
  if (world.killsSinceBoss >= CAPTAIN_KILLS_TO_SPAWN) spawnCaptain(world);
}

function merchantRoute(world: World): Vec2[] {
  const radius = navClearance('merchant');
  for (let attempt = 0; attempt < 60; attempt++) {
    const count = MERCHANT_ROUTE_POINTS.min + Math.floor(world.rng() * (MERCHANT_ROUTE_POINTS.max - MERCHANT_ROUTE_POINTS.min + 1));
    const base = rand(world, 0, Math.PI * 2);
    const span = rand(world, Math.PI * 0.35, Math.PI * 0.6);
    const out: Vec2[] = [];
    for (let i = 0; i < count; i++) {
      // Lazo cerrado: ida por un radio y vuelta por otro
      const t = i < count / 2 ? i / Math.max(1, count / 2 - 1) : (count - 1 - i) / Math.max(1, count / 2 - 1);
      const a = base + span * Math.min(1, t);
      const r = i < count / 2 ? rand(world, MERCHANT_RING.min + 10, 230) : rand(world, 250, MERCHANT_RING.max - 10);
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    if (out.every((p) => navigableFor(world, p, radius))) return out;
  }
  return [{ x: 200, z: 0 }, { x: 0, z: 200 }, { x: -200, z: 0 }, { x: 0, z: -200 }];
}

export function spawnMerchant(world: World): Ship {
  let route = merchantRoute(world);
  for (let i = 0; i < 20 && !farFromPlayers(world, route[0]); i++) route = merchantRoute(world);
  const ship = newShip(world, 'merchant', 'Mercante', null, route[0], headingTo(route[0], route[1]));
  ship.ai = { state: 'route', origin: { ...route[0] }, sector: -1, wait: 0, targetId: null, route, routeIndex: 1, fleeUntil: 0, threatId: null };
  world.ships.set(ship.id, ship);
  return ship;
}

// ---------- Jugadores ----------

// Un amarre libre del mapa (ningún barco vivo con el centro a < 12 m de su eje), al azar con la semilla entre los libres,
// con el barco atracado de popa: el centro a su margen de Q en el rumbo ψ y la proa hacia fuera (AC-176). null si están
// todos ocupados o el mapa no tiene amarres
function mooringSpot(world: World, classId: string): { pos: Vec2; heading: number } | null {
  const alive = [...world.ships.values()].filter((s) => s.state === 'alive');
  const along = (m: Mooring, d: number) => {
    const f = forward((m.psiDeg * Math.PI) / 180);
    return { x: m.x + f.x * d, z: m.z + f.z * d };
  };
  const free = world.moorings.filter((m) => alive.every((s) => segmentPointDistance(along(m, 0), along(m, MOORING_AXIS.length), s.pos) >= MOORING_AXIS.freeRadius));
  if (free.length === 0) return null;
  const m = free[Math.floor(world.rng() * free.length)];
  return { pos: along(m, navClearance(classId)), heading: (m.psiDeg * Math.PI) / 180 };
}

// Aparición de un jugador: en un amarre libre si el mapa los tiene (AC-176); si no, o con todos ocupados, en el anillo
// del puerto (AC-63)
function respawnPoint(world: World, classId: string): { pos: Vec2; heading: number } {
  const moored = mooringSpot(world, classId);
  if (moored) return moored;
  const clearance = navClearance(classId);
  for (let attempt = 0; attempt < 50; attempt++) {
    const a = rand(world, 0, Math.PI * 2);
    const r = rand(world, RESPAWN_RING.min, RESPAWN_RING.max);
    const pos = { x: PORT_POSITION.x + Math.sin(a) * r, z: PORT_POSITION.z + Math.cos(a) * r };
    if (navigableFor(world, pos, clearance)) return { pos, heading: a };
  }
  return { pos: { x: 0, z: 75 }, heading: 0 };
}

// initial: el progreso guardado de un usuario de Clerk (server/persistence.ts); sin él, el inicial (100 de oro, Balandra y
// 0 de XP)
export function addPlayer(world: World, id: string, name: string, initial?: Pick<Player, 'gold' | 'upgrades' | 'ownedShips' | 'activeShip'> & { xp?: number }): Player {
  const existing = world.players.get(id);
  if (existing) {
    const ship = world.ships.get(existing.shipId);
    if (ship) {
      ship.disconnectedAt = null; // reconexión dentro del margen: recupera el mismo barco
      existing.name = name;
      ship.name = name;
      return existing;
    }
  }
  const player: Player = existing ?? {
    id,
    name,
    shipId: '',
    gold: initial?.gold ?? world.startingGold ?? STARTING_GOLD,
    upgrades: initial ? { ...initial.upgrades } : { cannons: 1, hull: 1, sails: 1 },
    ownedShips: initial ? [...initial.ownedShips] : [STARTING_SHIP],
    activeShip: initial?.activeShip ?? STARTING_SHIP,
    kills: 0,
    deaths: 0,
    death: null,
    xp: initial?.xp ?? 0
  };
  player.name = name;
  player.death = null;
  world.players.set(id, player);
  const spot = respawnPoint(world, player.activeShip);
  const ship = newShip(world, player.activeShip, name, id, spot.pos, spot.heading);
  ship.maxHp = maxHpFor(player.activeShip, player);
  ship.hp = Math.round(ship.maxHp * (world.startingHull ?? 1));
  ship.protectedUntil = world.time + SPAWN_PROTECTION;
  player.shipId = ship.id;
  world.ships.set(ship.id, ship);
  return player;
}

// El barco queda DISCONNECT_GRACE s en el mundo; después el servidor saca al jugador de la memoria (AC-129)
export function disconnectPlayer(world: World, playerId: string): void {
  const ship = shipOfPlayer(world, playerId);
  if (ship) {
    ship.disconnectedAt = world.time;
    ship.destination = null;
    ship.path = [];
    ship.attackTargetId = null;
    ship.repairing = false;
  }
}

// Saca al jugador y su barco del mundo (otro proceso escribió un progreso más nuevo: server/persistence.ts)
export function removePlayer(world: World, playerId: string): void {
  const ship = shipOfPlayer(world, playerId);
  if (ship) removeShip(world, ship);
  world.players.delete(playerId);
}

function removeShip(world: World, ship: Ship): void {
  world.ships.delete(ship.id);
  for (const s of world.ships.values()) {
    if (s.attackTargetId === ship.id) s.attackTargetId = null;
    if (s.ai?.targetId === ship.id) s.ai.targetId = null;
    if (s.ai?.threatId === ship.id) s.ai.threatId = null;
  }
}

export function shipOfPlayer(world: World, playerId: string): Ship | undefined {
  const player = world.players.get(playerId);
  return player ? world.ships.get(player.shipId) : undefined;
}

// ---------- Intenciones del jugador ----------

export type ActionResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

// El destino es el punto navegable más cercano al pedido y, si la clase no llega a él, el alcanzable más cercano: el
// último waypoint de la ruta (§6, punto 1b; AC-172)
function setDestination(world: World, ship: Ship, target: Vec2): void {
  const clearance = navClearance(ship.classId);
  const nav = navigatorOf(world);
  ship.path = nav.findPath(ship.pos, nav.nearestNavigable(target, clearance), clearance);
  ship.destination = { ...ship.path[ship.path.length - 1] };
}

export function moveTo(world: World, playerId: string, target: Vec2): ActionResult {
  const ship = shipOfPlayer(world, playerId);
  if (!isAlive(ship)) return fail('Tu barco no está a flote');
  ship.repairing = false;
  setDestination(world, ship, target);
  return { ok: true };
}

export function stop(world: World, playerId: string): ActionResult {
  const ship = shipOfPlayer(world, playerId);
  if (!isAlive(ship)) return fail('Tu barco no está a flote');
  ship.destination = null;
  ship.path = [];
  return { ok: true };
}

export function attack(world: World, playerId: string, targetId: string): ActionResult {
  const ship = shipOfPlayer(world, playerId);
  const target = world.ships.get(targetId);
  if (!isAlive(ship)) return fail('Tu barco no está a flote');
  if (!target || !canAttack(world, ship, target)) return fail('No puedes atacar ese objetivo');
  ship.attackTargetId = targetId;
  ship.repairing = false;
  ship.protectedUntil = 0; // atacar termina la protección (§12)
  return { ok: true };
}

export function cancelAttack(world: World, playerId: string): ActionResult {
  const ship = shipOfPlayer(world, playerId);
  if (!ship) return fail('Jugador desconocido');
  ship.attackTargetId = null;
  return { ok: true };
}

export function setRepair(world: World, playerId: string, on: boolean): ActionResult {
  const ship = shipOfPlayer(world, playerId);
  if (!isAlive(ship)) return fail('Tu barco no está a flote');
  if (!on) {
    ship.repairing = false;
    return { ok: true };
  }
  if (ship.hp >= ship.maxHp) return fail('El casco ya está intacto');
  ship.repairing = true;
  ship.repairClock = 0;
  ship.destination = null;
  ship.path = [];
  ship.attackTargetId = null; // reparar cancela el ataque (§8)
  return { ok: true };
}

export function respawn(world: World, playerId: string): ActionResult {
  const player = world.players.get(playerId);
  const ship = shipOfPlayer(world, playerId);
  if (!player || !ship) return fail('Jugador desconocido');
  if (ship.state === 'alive') return fail('Tu barco está a flote');
  if (!player.death || world.time - player.death.at < DEATH_COUNTDOWN - RESPAWN_CLOCK_TOLERANCE - EPS) return fail('Aún no puedes zarpar');
  const spot = respawnPoint(world, ship.classId);
  ship.state = 'alive';
  ship.stateTimer = 0;
  ship.pos = spot.pos;
  ship.heading = spot.heading;
  ship.speed = 0;
  ship.maxHp = maxHpFor(ship.classId, player);
  ship.hp = ship.maxHp;
  ship.reload = 0;
  ship.damage = [];
  ship.lastDamagedAt = -Infinity;
  ship.protectedUntil = world.time + SPAWN_PROTECTION;
  player.death = null;
  world.events.push({ type: 'respawn', shipId: ship.id });
  return { ok: true };
}

export type ShopItem = { kind: 'upgrade'; upgrade: UpgradeId; level: number } | { kind: 'ship'; classId: PlayerShipClass };

export function itemPrice(item: ShopItem): number {
  return item.kind === 'upgrade' ? UPGRADE_LEVELS[item.upgrade].prices[item.level - 1] ?? Infinity : SHIP_CLASSES[item.classId].price;
}

function switchClass(world: World, ship: Ship, player: Player, classId: PlayerShipClass, keepRatio: boolean): void {
  const ratio = ship.hp / ship.maxHp;
  ship.classId = classId;
  player.activeShip = classId;
  ship.maxHp = maxHpFor(classId, player);
  ship.hp = keepRatio ? Math.round(ship.maxHp * ratio) : ship.maxHp;
  ship.pos = navigatorOf(world).nearestNavigable(ship.pos, navClearance(classId));
  ship.destination = null;
  ship.path = [];
}

// La tienda va en dos pasos para que el servidor pueda escribir la compra en la BD antes de confirmarla (AC-130 a):
// planBuy valida sin tocar el mundo y applyBuy aplica. buy() hace las dos cosas en el acto (invitados y tests)
export type BuyPlan = { ok: true; price: number } | { ok: false; reason: string };

export function planBuy(world: World, playerId: string, item: ShopItem): BuyPlan {
  const player = world.players.get(playerId);
  const ship = shipOfPlayer(world, playerId);
  if (!player || !isAlive(ship)) return fail('Tu barco no está a flote');
  if (!isInSafeZone(ship.pos)) return fail('El astillero solo abre en el puerto');
  const price = itemPrice(item);
  if (item.kind === 'upgrade') {
    if (item.level !== player.upgrades[item.upgrade] + 1 || item.level > MAX_UPGRADE_LEVEL) return fail('Primero necesitas el nivel anterior');
  } else if (player.ownedShips.includes(item.classId)) {
    return fail('Ya tienes ese barco');
  }
  if (player.gold < price) return fail(`Necesitas ${price} de oro`);
  return { ok: true, price };
}

// La compra sobre el progreso (el jugador o una copia que se escribe en la BD). Limitación conocida (P3): entre planBuy
// y applyBuy pasa la escritura (~20 ms); si en ese rato el jugador pierde oro (muerte), el precio se descuenta con suelo
// 0 y puede pagar de menos. La compra ya está escrita y confirmada, así que se entrega igualmente
export function applyPurchase(progress: Pick<Player, 'gold' | 'upgrades' | 'ownedShips' | 'activeShip'>, item: ShopItem, price: number): void {
  progress.gold = Math.max(0, progress.gold - price);
  if (item.kind === 'upgrade') {
    progress.upgrades[item.upgrade] = item.level;
    return;
  }
  if (!progress.ownedShips.includes(item.classId)) progress.ownedShips.push(item.classId);
  progress.ownedShips.sort((a, b) => PLAYER_SHIP_ORDER.indexOf(a) - PLAYER_SHIP_ORDER.indexOf(b));
  progress.activeShip = item.classId;
}

export function applyBuy(world: World, playerId: string, item: ShopItem, price: number): void {
  const player = world.players.get(playerId);
  if (!player) return;
  const ship = shipOfPlayer(world, playerId);
  applyPurchase(player, item, price);
  if (!ship) return;
  const afloat = ship.state === 'alive';
  if (item.kind === 'ship') {
    if (afloat) switchClass(world, ship, player, item.classId, false);
    else ship.classId = item.classId; // hundiéndose: Zarpar lo saca con la clase nueva y la vida llena
  } else if (item.upgrade === 'hull' && afloat) {
    const ratio = ship.hp / ship.maxHp;
    ship.maxHp = maxHpFor(ship.classId, player);
    ship.hp = Math.round(ship.maxHp * ratio);
  }
}

export function buy(world: World, playerId: string, item: ShopItem): ActionResult {
  const plan = planBuy(world, playerId, item);
  if (!plan.ok) return plan;
  applyBuy(world, playerId, item, plan.price);
  return { ok: true };
}

export function planSelectShip(world: World, playerId: string, classId: PlayerShipClass): ActionResult {
  const player = world.players.get(playerId);
  const ship = shipOfPlayer(world, playerId);
  if (!player || !isAlive(ship)) return fail('Tu barco no está a flote');
  if (!player.ownedShips.includes(classId)) return fail('No tienes ese barco');
  if (!isInSafeZone(ship.pos)) return fail('Solo puedes cambiar de barco en el puerto');
  return { ok: true };
}

export function applySelectShip(world: World, playerId: string, classId: PlayerShipClass): void {
  const player = world.players.get(playerId);
  const ship = shipOfPlayer(world, playerId);
  if (!player || player.activeShip === classId) return;
  if (ship?.state === 'alive') {
    switchClass(world, ship, player, classId, true);
    return;
  }
  player.activeShip = classId;
  if (ship) ship.classId = classId;
}

export function selectShip(world: World, playerId: string, classId: PlayerShipClass): ActionResult {
  const plan = planSelectShip(world, playerId, classId);
  if (!plan.ok) return plan;
  applySelectShip(world, playerId, classId);
  return { ok: true };
}

// ---------- Paso de simulación ----------

export function step(world: World, dt: number): void {
  world.time += dt;
  world.tick += 1;
  for (const ship of world.ships.values()) {
    if (ship.state === 'alive' && ship.ai) updateAi(world, ship, dt);
  }
  for (const ship of world.ships.values()) {
    if (ship.state === 'alive') moveShip(world, ship, dt);
  }
  for (const ship of world.ships.values()) {
    if (ship.state === 'alive') {
      updateCombat(world, ship, dt);
      updateRepair(world, ship, dt);
    }
  }
  updateProjectiles(world, dt);
  updateLifecycle(world, dt);
  updateWrecks(world);
  updateCaptain(world);
}

export function drainEvents(world: World) {
  const events = world.events;
  world.events = [];
  return events;
}

// ---------- Movimiento (§6) ----------

function turnFactor(angle: number): number {
  for (const t of TURN_FACTORS) if (angle <= t.maxAngle) return t.factor;
  return TURN_FACTORS[TURN_FACTORS.length - 1].factor;
}

function speedCapOf(world: World, ship: Ship): number {
  const max = maxSpeedOf(world, ship);
  const ai = ship.ai;
  if (!ai) return max;
  const stats = classOf(ship);
  switch (ai.state) {
    case 'patrol':
    case 'route':
      return stats.patrolSpeed;
    case 'combat': {
      // Orbita a su velocidad de órbita; para acercarse o, la cañonera, para alejarse, va a la máxima (§9)
      const hostile = hostileAiOf(ship);
      const target = ship.attackTargetId ? world.ships.get(ship.attackTargetId) : undefined;
      return target && distance(ship.pos, target.pos) <= approachDistance(hostile) && !fleePoint(world, ship, target, hostile) ? hostile.orbitSpeed : max;
    }
    default:
      return max;
  }
}

function moveShip(world: World, ship: Ship, dt: number): void {
  const stats = classOf(ship);
  let desired = 0;
  let arrived = false;

  const nav = navigatorOf(world);
  if (ship.destination) {
    if (ship.path.length === 0) ship.path = nav.findPath(ship.pos, ship.destination, navClearance(ship.classId));
    // Waypoints intermedios: pasar al siguiente al acercarse
    const skipRadius = Math.max(4, stats.radius);
    while (ship.path.length > 1 && distance(ship.pos, ship.path[0]) < skipRadius) ship.path.shift();
    const wp = ship.path[0];
    const dist = distance(ship.pos, wp);
    const final = ship.path.length === 1;
    // Distancia que queda por recorrer en toda la ruta: el frenado la usa para no pasarse del destino
    // cuando el último waypoint intermedio queda pegado a él (AC-20)
    let remaining = dist;
    for (let i = 1; i < ship.path.length; i++) remaining += distance(ship.path[i - 1], ship.path[i]);

    // Llegada: frena dentro de los 2 m; el destino se cumple cuando la velocidad llega a 0 (AC-15)
    arrived = final && dist <= ARRIVE_DISTANCE;
    if (!arrived) {
      const desiredHeading = headingTo(ship.pos, wp);
      const delta = angleDelta(ship.heading, desiredHeading);
      const maxTurn = stats.turnRate * dt;
      ship.heading = normalizeAngle(ship.heading + Math.max(-maxTurn, Math.min(maxTurn, delta)));
      desired = speedCapOf(world, ship) * turnFactor(Math.abs(delta));
      // Frena a tiempo para detenerse en el destino (v² = 2·frenado·d), con la distancia restante de la ruta
      desired = Math.min(desired, Math.sqrt(2 * stats.brake * Math.max(0, remaining - 0.5)));
      // Esquina cerrada en el siguiente waypoint: llegar al punto de salto a velocidad de pivote
      if (!final) {
        const corner = Math.abs(angleDelta(headingTo(ship.pos, wp), headingTo(wp, ship.path[1])));
        if (corner > PIVOT_MIN_ANGLE) {
          desired = Math.min(desired, Math.sqrt(PIVOT_SPEED * PIVOT_SPEED + 2 * stats.brake * Math.max(0, dist - skipRadius)));
        }
      }
      // Junto a una isla, los giros grandes se hacen casi en el sitio para que el casco no barra la costa (AC-20)
      if (Math.abs(delta) > PIVOT_MIN_ANGLE && nav.edgeClearance(ship.pos) < navClearance(ship.classId) + PIVOT_ZONE) {
        desired = Math.min(desired, PIVOT_SPEED);
      }
      if (final) {
        // Destino muy cerca y a la espalda: girar casi en el sitio en vez de orbitarlo
        const turnRadius = ship.speed / stats.turnRate;
        if (Math.abs(delta) > Math.PI / 2 && dist < turnRadius * 2 + ARRIVE_DISTANCE) desired = Math.min(desired, 1.5);
      }
    }
  }

  if (desired > ship.speed) ship.speed = Math.min(desired, ship.speed + stats.accel * dt);
  else ship.speed = Math.max(desired, ship.speed - stats.brake * dt);
  if (arrived && ship.speed === 0) {
    ship.destination = null;
    ship.path = [];
  }

  const f = forward(ship.heading);
  ship.pos.x += f.x * ship.speed * dt;
  ship.pos.z += f.z * ship.speed * dt;

  // Islas y borde sólidos: el casco sale por el punto más cercano del borde de la unión de las islas, también donde dos se
  // solapan (AC-199); los piratas además no entran en el radio de exclusión del puerto
  const out = nav.pushOut(ship.pos, stats.radius);
  if (out) {
    ship.pos.x = out.x;
    ship.pos.z = out.z;
    ship.speed *= 0.6;
  }
  if (ship.kind === 'pirate') {
    const d = distance(ship.pos, PORT_POSITION);
    if (d < PIRATE_PORT_EXCLUSION) {
      const h = headingTo(PORT_POSITION, ship.pos);
      const o = forward(h);
      ship.pos.x = PORT_POSITION.x + o.x * PIRATE_PORT_EXCLUSION;
      ship.pos.z = PORT_POSITION.z + o.z * PIRATE_PORT_EXCLUSION;
    }
  }
  if (Math.abs(ship.pos.x) > NAV_LIMIT || Math.abs(ship.pos.z) > NAV_LIMIT) {
    ship.pos.x = Math.max(-NAV_LIMIT, Math.min(NAV_LIMIT, ship.pos.x));
    ship.pos.z = Math.max(-NAV_LIMIT, Math.min(NAV_LIMIT, ship.pos.z));
    ship.speed *= 0.6;
  }
}

// ---------- Combate (§7) ----------

// Una tirada por cañón de la banda: impacto si rng() < precisión
export function rollHits(rng: () => number, cannons: number, accuracy: number): number {
  let hits = 0;
  for (let i = 0; i < cannons; i++) if (rng() < accuracy) hits++;
  return hits;
}

function updateCombat(world: World, ship: Ship, dt: number): void {
  ship.reload = Math.max(0, ship.reload - dt);
  if (!ship.attackTargetId) return;
  const target = world.ships.get(ship.attackTargetId);
  // AC-34: el ataque termina en el mismo tick si el objetivo ya no es válido o está a más de 200 m
  if (!target || !canAttack(world, ship, target) || distance(ship.pos, target.pos) > ATTACK_MAX_DISTANCE) {
    ship.attackTargetId = null;
    return;
  }
  const cannon = cannonOf(world, ship)!;
  const dist = distance(ship.pos, target.pos);
  // Épsilon: restar dt en coma flotante deja residuos que alargarían la recarga un tick
  if (ship.reload > EPS || dist > cannon.range) return;

  const cannons = classOf(ship).cannonsPerSide;
  const hits = rollHits(world.rng, cannons, ship.accuracyOverride ?? cannon.accuracy);
  const duration = dist / CANNONBALL_SPEED;
  world.projectiles.push({
    id: world.nextId++,
    ownerShipId: ship.id,
    targetShipId: target.id,
    hits,
    misses: cannons - hits,
    damagePerBall: cannon.damage,
    elapsed: 0,
    duration
  });
  ship.reload = cannon.reload;
  if (ship.kind === 'player') ship.protectedUntil = 0;
  world.events.push({ type: 'volley', shipId: ship.id, targetId: target.id, from: { ...ship.pos }, to: { ...target.pos }, duration, hits, cannons });
}

function updateProjectiles(world: World, dt: number): void {
  const remaining = [];
  for (const p of world.projectiles) {
    p.elapsed += dt;
    if (p.elapsed < p.duration - EPS) {
      remaining.push(p);
      continue;
    }
    const target = world.ships.get(p.targetShipId);
    const owner = world.ships.get(p.ownerShipId);
    // AC-33: si el objetivo se hundió antes del impacto, el daño se ignora
    if (!isAlive(target) || !owner) continue;
    if (target.kind === 'player' && (isInSafeZone(target.pos) || isProtected(world, target))) continue;
    const damage = p.hits * p.damagePerBall;
    world.events.push({ type: 'impact', shipId: target.id, byShipId: owner.id, damage, hits: p.hits, misses: p.misses, pos: { ...target.pos } });
    if (damage > 0) applyDamage(world, target, damage, owner);
  }
  world.projectiles = remaining;
}

function applyDamage(world: World, target: Ship, damage: number, attacker: Ship): void {
  target.hp = Math.max(0, target.hp - damage);
  target.lastDamagedAt = world.time;
  const attackerPlayer = playerOf(world, attacker);
  if (attackerPlayer) {
    const entry = target.damage.find((d) => d.playerId === attackerPlayer.id);
    if (entry) {
      entry.amount += damage;
      entry.at = world.time;
      entry.shipId = attacker.id;
    } else {
      target.damage.push({ playerId: attackerPlayer.id, shipId: attacker.id, amount: damage, at: world.time, firstAt: world.time });
    }
  }
  if (target.hp <= 0) {
    sinkShip(world, target, attacker);
    return;
  }
  const ai = target.ai;
  if (!ai || attacker.kind !== 'player') return;
  if (target.kind === 'pirate' && ai.state !== 'combat') {
    ai.state = 'combat'; // represalia (§9)
    ai.targetId = attacker.id;
  } else if (target.kind === 'merchant') {
    ai.state = 'flee';
    ai.threatId = attacker.id;
    ai.fleeUntil = world.time + MERCHANT_FLEE_TIME;
  }
}

// Reparto proporcional al daño de los últimos 60 s; el resto, a quien más daño hizo (empate: quien dañó antes)
export function splitReward(entries: { playerId: string; amount: number; firstAt: number }[], reward: number): Map<string, number> {
  const shares = new Map<string, number>();
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  if (total <= 0 || reward <= 0) return shares;
  let given = 0;
  for (const e of entries) {
    const share = Math.floor((reward * e.amount) / total);
    shares.set(e.playerId, (shares.get(e.playerId) ?? 0) + share);
    given += share;
  }
  const top = [...entries].sort((a, b) => b.amount - a.amount || a.firstAt - b.firstAt)[0];
  shares.set(top.playerId, (shares.get(top.playerId) ?? 0) + (reward - given));
  return shares;
}

function sinkShip(world: World, ship: Ship, killer: Ship | null): void {
  ship.state = 'sinking';
  ship.stateTimer = SINKING_TIME;
  ship.speed = 0;
  ship.destination = null;
  ship.path = [];
  ship.attackTargetId = null;
  ship.repairing = false;
  world.events.push({ type: 'sunk', shipId: ship.id, byShipId: killer?.id ?? null, pos: { ...ship.pos } });
  for (const s of world.ships.values()) {
    if (s.attackTargetId === ship.id) s.attackTargetId = null; // AC-61
  }

  const killerPlayer = killer ? playerOf(world, killer) : undefined;
  if (killerPlayer) killerPlayer.kills += 1;

  if (ship.kind !== 'player') {
    const stats = classOf(ship);
    const recent = ship.damage.filter((d) => world.time - d.at <= LOOT_DAMAGE_WINDOW);
    const paid = new Set<string>();
    for (const [playerId, gold] of splitReward(recent, stats.reward)) {
      const p = world.players.get(playerId);
      if (!p || gold <= 0) continue;
      addGold(p, gold);
      paid.add(playerId);
      world.events.push({ type: 'loot', playerId, gold, pos: { ...ship.pos }, source: 'kill' });
    }
    creditNpcXp(world, splitReward(recent, npcXp(ship.classId)), ship.pos); // la XP, con el reparto del oro (§10b)
    if (stats.wreck > 0) {
      const wreck = { id: `wreck-${world.nextId++}`, pos: { ...ship.pos }, gold: stats.wreck, expiresAt: world.time + WRECK_LIFETIME };
      world.wrecks.push(wreck);
      world.events.push({ type: 'wreck', wreckId: wreck.id, pos: wreck.pos, gold: wreck.gold, expiresAt: wreck.expiresAt });
    }
    if (isCaptain(ship)) {
      // Su muerte reinicia la cuenta y no suma (§9). Feed para todos: hasta 3 nombres por daño y "y N más", y solo los de
      // quienes cobran del reparto de arriba (AC-111)
      world.killsSinceBoss = 0;
      const names = recent
        .filter((d) => paid.has(d.playerId))
        .sort((a, b) => b.amount - a.amount || a.firstAt - b.firstAt)
        .map((d) => world.players.get(d.playerId)!.name);
      world.events.push({ type: 'captainDown', shipId: ship.id, names: names.slice(0, 3), more: Math.max(0, names.length - 3), pos: { ...ship.pos } });
    } else if (ship.kind === 'pirate') {
      world.killsSinceBoss += 1; // piratas y cañoneras; los mercantes no cuentan
    }
    return;
  }

  const victim = playerOf(world, ship);
  if (victim) {
    const goldLost = deathPenalty(victim.gold);
    victim.gold -= goldLost;
    victim.deaths += 1;
    victim.death = { by: killer ? killer.name : null, goldLost, at: world.time };
    if (killerPlayer && goldLost > 0) {
      addGold(killerPlayer, goldLost); // PvP: la penalización la recibe quien hundió (§10)
      world.events.push({ type: 'loot', playerId: killerPlayer.id, gold: goldLost, pos: { ...ship.pos }, source: 'pvp' });
    }
    // La XP, en cambio, se reparte por daño, con el mismo filtro que el oro de un NPC (§10b)
    const recent = ship.damage.filter((d) => world.time - d.at <= LOOT_DAMAGE_WINDOW);
    creditPvpXp(world, victim, splitReward(recent, PVP_XP), ship.pos);
  }
}

function updateLifecycle(world: World, dt: number): void {
  for (const ship of [...world.ships.values()]) {
    if (ship.disconnectedAt !== null && world.time - ship.disconnectedAt >= DISCONNECT_GRACE) {
      removeShip(world, ship);
      continue;
    }
    if (ship.state === 'alive') continue;
    ship.stateTimer -= dt;
    if (ship.state === 'sinking' && ship.stateTimer <= EPS) {
      if (isCaptain(ship)) {
        removeShip(world, ship); // no reaparece por tiempo: el siguiente nace tras otros 10 hundidos (§9)
        continue;
      }
      ship.state = 'dead';
      // NPC: el temporizador de reaparición cuenta desde el hundimiento (§9)
      ship.stateTimer = ship.kind === 'player' ? 0 : classOf(ship).respawnTime - SINKING_TIME;
      continue;
    }
    if (ship.state === 'dead' && ship.kind !== 'player' && ship.stateTimer <= EPS) respawnNpc(world, ship);
  }
}

function respawnNpc(world: World, ship: Ship): void {
  const stats = classOf(ship);
  let ai: NpcAi | null = null;
  if (ship.respawnPos) {
    ship.pos = { ...ship.respawnPos };
  } else if (ship.kind === 'pirate') {
    const sector = ship.ai?.sector ?? 0;
    const pos = pirateSpot(world, sector, true, ship.classId);
    ship.pos = pos;
    ai = { state: 'patrol', origin: { ...pos }, sector, wait: 0, targetId: null, route: [], routeIndex: 0, fleeUntil: 0, threatId: null };
  } else {
    let route = merchantRoute(world);
    for (let i = 0; i < 20 && !farFromPlayers(world, route[0]); i++) route = merchantRoute(world);
    ship.pos = { ...route[0] };
    ai = { state: 'route', origin: { ...route[0] }, sector: -1, wait: 0, targetId: null, route, routeIndex: 1, fleeUntil: 0, threatId: null };
  }
  ship.ai = ai;
  ship.state = 'alive';
  ship.stateTimer = 0;
  ship.hp = stats.maxHp;
  ship.maxHp = stats.maxHp;
  ship.speed = 0;
  ship.reload = 0;
  ship.damage = [];
  ship.destination = null;
  ship.path = [];
  ship.lastDamagedAt = -Infinity;
  world.events.push({ type: 'respawn', shipId: ship.id });
}

// ---------- Reparación (§8) ----------

function updateRepair(world: World, ship: Ship, dt: number): void {
  if (!ship.repairing) return;
  if (ship.hp >= ship.maxHp) {
    ship.repairing = false;
    return;
  }
  if (ship.speed > REPAIR_MAX_SPEED) return; // primero frena
  ship.repairClock += dt;
  while (ship.repairClock >= REPAIR_TICK - EPS && ship.hp < ship.maxHp) {
    ship.repairClock -= REPAIR_TICK;
    const underFire = world.time - ship.lastDamagedAt < REPAIR_UNDER_FIRE_WINDOW;
    const rate = underFire ? REPAIR_RATE_UNDER_FIRE : REPAIR_RATE;
    ship.hp = Math.min(ship.maxHp, ship.hp + ship.maxHp * rate * REPAIR_TICK);
  }
  if (ship.hp >= ship.maxHp) ship.repairing = false;
}

// ---------- Restos flotantes (§10, P1) ----------

function updateWrecks(world: World): void {
  if (world.wrecks.length === 0) return;
  const keep = [];
  for (const wreck of world.wrecks) {
    if (world.time >= wreck.expiresAt) {
      world.events.push({ type: 'wreckGone', wreckId: wreck.id });
      continue;
    }
    let best: Ship | null = null;
    let bestD = WRECK_PICKUP_RADIUS;
    for (const s of world.ships.values()) {
      if (s.kind !== 'player' || !isAlive(s) || s.disconnectedAt !== null) continue;
      const d = distance(s.pos, wreck.pos);
      if (d <= bestD) {
        best = s;
        bestD = d;
      }
    }
    const player = best ? playerOf(world, best) : undefined;
    if (player) {
      addGold(player, wreck.gold);
      world.events.push({ type: 'loot', playerId: player.id, gold: wreck.gold, pos: wreck.pos, source: 'wreck' });
      world.events.push({ type: 'wreckGone', wreckId: wreck.id });
      continue;
    }
    keep.push(wreck);
  }
  world.wrecks = keep;
}

// ---------- IA de NPC (§9) ----------

// Perfil de IA hostil de la clase: el capitán detecta, orbita y se ata a su guarida con sus propios radios (§9)
function hostileAiOf(ship: Ship): HostileAiStats {
  return HOSTILE_AI[ship.classId] ?? HOSTILE_AI.pirate;
}

function updateAi(world: World, ship: Ship, dt: number): void {
  if (ship.kind === 'pirate') updatePirate(world, ship, dt);
  else updateMerchant(world, ship);
}

function pirateDestination(p: Vec2): Vec2 {
  const d = distance(p, PORT_POSITION);
  if (d >= PIRATE_PORT_EXCLUSION + 5) return p;
  const o = forward(headingTo(PORT_POSITION, p));
  return { x: o.x * (PIRATE_PORT_EXCLUSION + 5), z: o.z * (PIRATE_PORT_EXCLUSION + 5) };
}

function pickPirateTarget(world: World, ship: Ship): Ship | null {
  // El que más daño le hizo en los últimos 10 s y sigue atacable; si no, el actual; si no, el más cercano a ≤70 m
  const recent = ship.damage
    .filter((d) => world.time - d.at <= THREAT_WINDOW)
    .sort((a, b) => b.amount - a.amount);
  for (const entry of recent) {
    const s = world.ships.get(entry.shipId);
    if (s && isAttackablePlayer(world, s)) return s;
  }
  const current = ship.ai!.targetId ? world.ships.get(ship.ai!.targetId) : undefined;
  if (current && isAttackablePlayer(world, current)) return current;
  let best: Ship | null = null;
  let bestD = hostileAiOf(ship).aggro;
  for (const s of world.ships.values()) {
    if (!isAttackablePlayer(world, s)) continue;
    const d = distance(s.pos, ship.pos);
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

// Por encima de esta distancia al objetivo, el hostil se acerca a velocidad máxima (§9)
function approachDistance(hostile: HostileAiStats): number {
  return hostile.keepAway?.approach ?? hostile.orbitRadius + 6;
}

// Cañonera por debajo de su banda (§9): punto al que se aleja, en línea recta desde el objetivo y a la distancia del punto
// de órbita. null si no le toca alejarse o si ese punto no es navegable (acorralada contra una isla o el borde): entonces
// orbita, como dice el GDD
function fleePoint(world: World, ship: Ship, target: Ship, hostile: HostileAiStats): Vec2 | null {
  if (!hostile.keepAway || distance(ship.pos, target.pos) >= hostile.keepAway.flee) return null;
  const away = forward(headingTo(target.pos, ship.pos));
  const reach = hostile.orbitRadius / Math.cos(ORBIT_LEAD);
  const p = pirateDestination({ x: target.pos.x + away.x * reach, z: target.pos.z + away.z * reach });
  return navigableFor(world, p, navClearance(ship.classId)) ? p : null;
}

function updatePirate(world: World, ship: Ship, dt: number): void {
  const ai = ship.ai!;
  const hostile = hostileAiOf(ship);

  if (ai.state === 'combat') {
    const target = pickPirateTarget(world, ship);
    const tooFar = target ? distance(ship.pos, target.pos) > hostile.disengage : true;
    if (!target || tooFar || distance(ship.pos, ai.origin) > hostile.leash) {
      ai.state = 'return';
      ai.targetId = null;
      ship.attackTargetId = null;
      setDestination(world, ship, ai.origin);
      return;
    }
    ai.targetId = target.id;
    ship.attackTargetId = target.id;
    const d = distance(ship.pos, target.pos);
    const orbit = hostile.orbitRadius;
    const away = fleePoint(world, ship, target, hostile);
    if (d > approachDistance(hostile)) {
      const back = forward(headingTo(target.pos, ship.pos));
      setDestination(world, ship, pirateDestination({ x: target.pos.x + back.x * orbit, z: target.pos.z + back.z * orbit }));
    } else if (away) {
      setDestination(world, ship, away); // la cañonera se aleja sin dejar de disparar: updateCombat sigue con su objetivo (§9)
    } else {
      // Órbita (pirata 45 m, capitán 50 m, cañonera 62 m): apunta a un punto adelantado ORBIT_LEAD sobre un círculo de radio
      // orbit / cos(ORBIT_LEAD). Sobre el círculo nominal, la cuerda hasta ese punto deja la órbita en orbit · cos(ORBIT_LEAD),
      // un 10 % por dentro (40,7 m para 45); con el radio compensado, la órbita real es la nominal (AC-188)
      const around = headingTo(target.pos, ship.pos) + ORBIT_LEAD;
      const o = forward(around);
      const aim = orbit / Math.cos(ORBIT_LEAD);
      setDestination(world, ship, pirateDestination({ x: target.pos.x + o.x * aim, z: target.pos.z + o.z * aim }));
    }
    return;
  }

  if (ai.state === 'return') {
    if (!ship.destination) setDestination(world, ship, ai.origin);
    if (distance(ship.pos, ai.origin) <= PIRATE_RETURN_ARRIVE) {
      ship.hp = ship.maxHp; // al volver recupera toda la vida (§9)
      ship.damage = [];
      ai.state = 'patrol';
      ai.wait = rand(world, PIRATE_PATROL_WAIT.min, PIRATE_PATROL_WAIT.max);
      ship.destination = null;
      ship.path = [];
    }
    return;
  }

  // Patrulla
  const spotted = pickPirateTarget(world, ship);
  if (spotted && distance(spotted.pos, ship.pos) <= hostile.aggro) {
    ai.state = 'combat';
    ai.targetId = spotted.id;
    ship.attackTargetId = spotted.id;
    return;
  }
  if (ship.destination) return;
  if (ship.holdPosition) return; // escenarios de prueba: espera en su puesto en vez de patrullar
  if (ai.wait > 0) {
    ai.wait -= dt;
    if (ai.wait <= 0) {
      for (let i = 0; i < 12; i++) {
        const a = rand(world, 0, Math.PI * 2);
        const r = rand(world, 15, hostile.patrolRadius);
        const p = pirateDestination({ x: ai.origin.x + Math.cos(a) * r, z: ai.origin.z + Math.sin(a) * r });
        if (navigableFor(world, p, navClearance(ship.classId))) {
          setDestination(world, ship, p);
          break;
        }
      }
    }
    return;
  }
  ai.wait = rand(world, PIRATE_PATROL_WAIT.min, PIRATE_PATROL_WAIT.max);
}

function updateMerchant(world: World, ship: Ship): void {
  const ai = ship.ai!;
  if (ai.state === 'flee') {
    const threat = ai.threatId ? world.ships.get(ai.threatId) : undefined;
    if (world.time >= ai.fleeUntil || !threat) {
      // Vuelve a la ruta por el waypoint más cercano
      let nearest = 0;
      ai.route.forEach((p, i) => {
        if (distance(p, ship.pos) < distance(ai.route[nearest], ship.pos)) nearest = i;
      });
      ai.state = 'route';
      ai.threatId = null;
      ai.routeIndex = nearest;
      setDestination(world, ship, ai.route[nearest]);
      return;
    }
    const away = forward(headingTo(threat.pos, ship.pos));
    setDestination(world, ship, { x: ship.pos.x + away.x * 60, z: ship.pos.z + away.z * 60 });
    return;
  }
  if (!ship.destination) {
    ai.routeIndex = (ai.routeIndex + 1) % ai.route.length;
    setDestination(world, ship, ai.route[ai.routeIndex]);
  }
}

// ---------- Vistas para la red ----------

const round1 = (n: number) => Math.round(n * 10) / 10;

export function shipSnapshot(world: World, s: Ship): ShipSnapshot {
  const player = playerOf(world, s);
  const snap: ShipSnapshot = {
    id: s.id,
    k: s.kind,
    c: s.classId,
    n: s.name,
    o: s.ownerId,
    x: round1(s.pos.x),
    z: round1(s.pos.z),
    h: Math.round(s.heading * 100) / 100,
    s: round1(s.speed),
    hp: Math.ceil(s.hp),
    mhp: s.maxHp,
    st: s.state,
    t: s.attackTargetId,
    r: s.repairing,
    pu: s.protectedUntil
  };
  if (player) snap.lv = levelOf(player.xp); // la placa lleva la insignia del jugador; los NPC no (§10b, §14)
  return snap;
}

export function playerView(world: World, playerId: string): PlayerView | null {
  const p = world.players.get(playerId);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    shipId: p.shipId,
    gold: p.gold,
    upgrades: { ...p.upgrades },
    ownedShips: [...p.ownedShips],
    activeShip: p.activeShip,
    kills: p.kills,
    deaths: p.deaths,
    death: p.death ? { by: p.death.by, goldLost: p.death.goldLost, respawnAt: p.death.at + DEATH_COUNTDOWN } : null,
    xp: p.xp
  };
}

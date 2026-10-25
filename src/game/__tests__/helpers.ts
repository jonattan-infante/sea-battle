import { TICK_RATE } from '../constants';
import { GameEvent, Ship, World } from '../types';
import { addPlayer, createWorld, drainEvents, shipOfPlayer, spawnCaptain, spawnGunboat, spawnMerchant, spawnPirate, step } from '../world';

export const DT = 1 / TICK_RATE;

export function emptyWorld(seed = 42): World {
  return createWorld({ seed, spawnNpcs: false });
}

// Mundo vacío con el I2 encendido (AC-187): el Capitán pirata solo aparece con él
export function i2World(seed = 42): World {
  return createWorld({ seed, spawnNpcs: false, i2: true });
}

export function run(world: World, seconds: number, onTick?: (w: World) => void): GameEvent[] {
  const events: GameEvent[] = [];
  const ticks = Math.round(seconds * TICK_RATE);
  for (let i = 0; i < ticks; i++) {
    step(world, DT);
    events.push(...drainEvents(world));
    onTick?.(world);
  }
  return events;
}

export function runUntil(world: World, maxSeconds: number, done: (w: World) => boolean): number {
  const ticks = Math.round(maxSeconds * TICK_RATE);
  for (let i = 0; i < ticks; i++) {
    step(world, DT);
    drainEvents(world);
    if (done(world)) return (i + 1) * DT;
  }
  return Infinity;
}

// Jugador colocado en (x, z) sin protección, mirando a `heading`
export function placePlayer(world: World, id: string, x: number, z: number, heading = 0): Ship {
  addPlayer(world, id, id);
  const ship = shipOfPlayer(world, id)!;
  ship.pos = { x, z };
  ship.heading = heading;
  ship.protectedUntil = 0;
  return ship;
}

export function placePirate(world: World, x: number, z: number, heading = 0): Ship {
  const ship = spawnPirate(world, 0);
  ship.pos = { x, z };
  ship.heading = heading;
  ship.ai!.origin = { x, z };
  ship.ai!.wait = 999;
  ship.destination = null;
  ship.path = [];
  return ship;
}

// Capitán con su guarida en (x, z), en patrulla y sin moverse hasta que vea a alguien
export function placeCaptain(world: World, x: number, z: number, heading = 0): Ship {
  const ship = spawnCaptain(world, { x, z });
  if (!ship) throw new Error('No se pudo colocar el capitán');
  ship.heading = heading;
  ship.ai!.wait = 999;
  ship.destination = null;
  ship.path = [];
  return ship;
}

// Cañonera con su origen en (x, z) y el sector de ese punto, en patrulla y sin moverse hasta que vea a alguien. Necesita
// el I2 encendido (AC-187)
export function placeGunboat(world: World, x: number, z: number, heading = 0): Ship {
  const ship = spawnGunboat(world, x > 0 ? (z < 0 ? 0 : 3) : z < 0 ? 1 : 2);
  if (!ship) throw new Error('No se pudo colocar la cañonera: ¿I2 apagado?');
  ship.pos = { x, z };
  ship.heading = heading;
  ship.ai!.origin = { x, z };
  ship.ai!.wait = 999;
  ship.destination = null;
  ship.path = [];
  return ship;
}

export function placeMerchant(world: World, x: number, z: number, heading = 0): Ship {
  const ship = spawnMerchant(world);
  ship.pos = { x, z };
  ship.heading = heading;
  ship.destination = null;
  ship.path = [];
  return ship;
}

// Blanco inmóvil y sin IA (para medir cadencias y daño)
export function dummy(world: World, x: number, z: number, hp = 1e9): Ship {
  const ship = placeMerchant(world, x, z);
  ship.ai = null;
  ship.hp = hp;
  ship.maxHp = hp;
  return ship;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

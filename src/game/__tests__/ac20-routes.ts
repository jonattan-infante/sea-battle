// AC-20 con el mapa del juego, partido en un archivo por clase (ac20-<clase>.test.ts) para que Jest los reparta entre sus
// procesos: entero en navigation.test.ts era la suite más larga (QA, 151,3 s sobre 4cd8c45; BACKLOG :1939). Cada clase hace
// sus 1 000 rutas con la misma semilla (2026) que antes, así que las de las 5 clases de siempre son las mismas rutas.
// AC-210 (c): con el mapa del juego (GAME_MAP, el del servidor sin variables), no con el de createWorld por defecto (el 1.0,
// la base de los tests), como pedía AC-171 (BACKLOG :1606), y con las 7 clases que hay en el juego con el I2 encendido por
// defecto (AC-171 pide «por tipo de NPC»; AC-210 c, «con las clases que hay»)
import { GAME_MAP, SHIP_CLASSES, navClearance } from '../constants';
import { segmentPointDistance } from '../nav';
import { createRng, distance } from '../vec';
import { createWorld, moveTo, navigatorOf } from '../world';
import { placePlayer, runUntil } from './helpers';

export const AC20_ROUTES = 1000;

// Segmento del casco (proa a popa, longitud L, sin bauprés) frente a cada círculo de las islas del mapa
export function hullTouchesIsland(x: number, z: number, heading: number, length: number, islands = GAME_MAP.islands): boolean {
  const fx = Math.sin(heading) * (length / 2);
  const fz = Math.cos(heading) * (length / 2);
  const bow = { x: x + fx, z: z + fz };
  const stern = { x: x - fx, z: z - fz };
  return islands.some((isl) => segmentPointDistance(bow, stern, { x: isl.x, z: isl.z }) < isl.radius - 1e-6);
}

// El test de una clase: el mismo nombre que tenía en navigation.test.ts
export function ac20RoutesTest(classId: string): void {
  test(`AC-20: ${classId} — 1 000 rutas aleatorias con el mapa del juego (${GAME_MAP.id}): el casco nunca toca una isla y el 100 % llega a ≤ 2 m`, () => {
    const rng = createRng(2026);
    const clearance = navClearance(classId);
    const length = SHIP_CLASSES[classId].length;
    const nav = navigatorOf(createWorld({ seed: 0, spawnNpcs: false, map: GAME_MAP }));
    let arrived = 0;
    let touched = 0;
    for (let i = 0; i < AC20_ROUTES; i++) {
      const world = createWorld({ seed: i, spawnNpcs: false, map: GAME_MAP });
      const from = nav.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, clearance);
      const to = nav.nearestNavigable({ x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 }, clearance);
      const ship = placePlayer(world, 'a', from.x, from.z, rng() * Math.PI * 2);
      ship.classId = classId;
      moveTo(world, 'a', to);
      const target = ship.destination!;
      let violated = false;
      const t = runUntil(world, 300, () => {
        if (!violated && hullTouchesIsland(ship.pos.x, ship.pos.z, ship.heading, length)) violated = true;
        return ship.destination === null && ship.speed === 0;
      });
      if (violated) touched++;
      if (t !== Infinity && distance(ship.pos, target) <= 2) arrived++;
    }
    expect({ classId, touched }).toEqual({ classId, touched: 0 });
    expect({ classId, arrived }).toEqual({ classId, arrived: AC20_ROUTES });
  }, 120_000);
}

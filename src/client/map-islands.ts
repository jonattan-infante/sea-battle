// Las islas que pinta el cliente (AC-199 e): salen de la bienvenida del servidor, los mismos círculos que su colisión, y no
// de una copia. Sin bienvenida (antes de entrar, o en las escenas sintéticas de QA), las de la 1.0, que son las del juego
// mientras el mapa nuevo esté apagado. Sin three ni DOM: la usan runtime.ts y los tests
import { IslandDef, ISLANDS } from '../game/constants';
import type { Welcome } from '../game/types';

// Huella de una lista de círculos: id, centro y radio de cada uno, en su orden. Dos listas con la misma huella pintan lo mismo
export function islandsKey(islands: readonly IslandDef[]): string {
  return islands.map((i) => `${i.id}:${i.x}:${i.z}:${i.radius}`).join('|');
}

export const ISLANDS_1_0_KEY = islandsKey(ISLANDS);

export function islandsOf(welcome: Pick<Welcome, 'islands'> | null | undefined): readonly IslandDef[] {
  return welcome?.islands?.length ? welcome.islands : ISLANDS;
}

// Con el mapa de la 1.0, las islas de la 1.0 con su arte procedural de siempre. Con cualquier otro, la versión sencilla de
// cada círculo hasta que llegue su modelo (AC-200 e; ART-DIRECTION §8.6, «Mientras se descargan»)
export function isMap10(islands: readonly IslandDef[]): boolean {
  return islandsKey(islands) === ISLANDS_1_0_KEY;
}

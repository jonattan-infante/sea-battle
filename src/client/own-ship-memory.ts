// El último barco propio de cada jugador en este navegador, su clase y su familia (opción A de AC-193 c, BACKLOG :1745; la
// familia, desde la 1.3, AC-227): con él el cliente predice qué GLB pedir antes de la bienvenida. Sin nada guardado, el
// jugador es nuevo y sale con STARTING_SHIP sin familia, que no tiene GLB. La clave lleva al jugador, para que dos cuentas
// en el mismo navegador no se pisen. El almacenamiento puede fallar (modo privado, cuota, sin permiso): entonces se predice
// la de salida y no se guarda nada
import { FamilyChoice, NO_FAMILY, PLAYER_SHIP_ORDER, PlayerShipClass, SHIP_FAMILIES, STARTING_SHIP } from '../game/constants';

const KEY = 'sea-battle-last-ship:';
const FAMILIES: readonly string[] = [...SHIP_FAMILIES, NO_FAMILY];

export interface OwnShip {
  classId: PlayerShipClass;
  family: FamilyChoice;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

// «clase» o «clase:familia». Las 5 clases se predicen (AC-226 d: en la 1.3 no hay interruptores). Un valor sin familia es el
// de la 1.2, cuyas filas entran sin familia (AC-229 b)
function parse(saved: string): OwnShip | null {
  const [classId, family = NO_FAMILY, ...rest] = saved.split(':');
  if (rest.length > 0 || !(PLAYER_SHIP_ORDER as readonly string[]).includes(classId) || !FAMILIES.includes(family)) return null;
  return { classId: classId as PlayerShipClass, family: family as FamilyChoice };
}

// null: no se predice nada y se espera a la bienvenida. Pasa con cualquier valor guardado que no sea un barco, que solo
// escribe un cliente más nuevo o una mano: es alguien que ya jugó, y adivinar mal cuesta bytes
export function predictedShip(player: string, storage: Store | null = browserStorage()): OwnShip | null {
  try {
    const saved = storage?.getItem(KEY + player) ?? null;
    return saved === null ? { classId: STARTING_SHIP, family: NO_FAMILY } : parse(saved);
  } catch {
    return { classId: STARTING_SHIP, family: NO_FAMILY };
  }
}

export function rememberShip(player: string, classId: PlayerShipClass, family: FamilyChoice, storage: Store | null = browserStorage()): void {
  const value = `${classId}:${family}`;
  try {
    if (storage?.getItem(KEY + player) !== value) storage?.setItem(KEY + player, value);
  } catch {
    // sin almacenamiento, la próxima visita predice la de salida
  }
}

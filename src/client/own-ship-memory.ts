// La última clase del barco propio de cada jugador en este navegador (opción A de AC-193 c, BACKLOG :1745): con ella el
// cliente predice qué GLB pedir antes de la bienvenida. Sin nada guardado, el jugador es nuevo y sale con STARTING_SHIP.
// La clave lleva al jugador, para que dos cuentas en el mismo navegador no se pisen. El almacenamiento puede fallar (modo
// privado, cuota, sin permiso): entonces se predice la de salida y no se guarda nada
import { PlayerShipClass, STARTING_SHIP } from '../game/constants';

const KEY = 'sea-battle-last-ship:';
// Las clases que se predicen: las que existen siempre (BACKLOG :1821). La predicción va antes de la bienvenida y no conoce
// los interruptores del servidor, así que con otra clase guardada (la Goleta o el Navío de AC-201) no se predice nada
const PREDICTED: readonly PlayerShipClass[] = ['sloop', 'brig', 'frigate'];

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

// null: no se predice nada y se espera a la bienvenida. Pasa con cualquier valor guardado que no sea una clase de PREDICTED,
// que solo escribe un cliente más nuevo o una mano: es alguien que ya jugó, y adivinar mal cuesta bytes
export function predictedShip(player: string, storage: Store | null = browserStorage()): PlayerShipClass | null {
  try {
    const saved = storage?.getItem(KEY + player) ?? null;
    if (saved === null) return STARTING_SHIP;
    return (PREDICTED as readonly string[]).includes(saved) ? (saved as PlayerShipClass) : null;
  } catch {
    return STARTING_SHIP;
  }
}

export function rememberShip(player: string, classId: PlayerShipClass, storage: Store | null = browserStorage()): void {
  try {
    if (storage?.getItem(KEY + player) !== classId) storage?.setItem(KEY + player, classId);
  } catch {
    // sin almacenamiento, la próxima visita predice la de salida
  }
}

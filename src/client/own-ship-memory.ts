// La última clase del barco propio de cada jugador en este navegador (opción A de AC-193 c, BACKLOG :1745): con ella el
// cliente predice qué GLB pedir antes de la bienvenida. Sin nada guardado, el jugador es nuevo y sale con STARTING_SHIP.
// La clave lleva al jugador, para que dos cuentas en el mismo navegador no se pisen. El almacenamiento puede fallar (modo
// privado, cuota, sin permiso): entonces se predice la de salida y no se guarda nada
import { PLAYER_SHIP_ORDER, PlayerShipClass, STARTING_SHIP } from '../game/constants';

const KEY = 'sea-battle-last-ship:';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function predictedShip(player: string, storage: Store | null = browserStorage()): PlayerShipClass {
  try {
    const saved = storage?.getItem(KEY + player);
    return (PLAYER_SHIP_ORDER as readonly string[]).includes(saved ?? '') ? (saved as PlayerShipClass) : STARTING_SHIP;
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

// Destino del marcador de clic (AC-14; H-1 de QA-71, P1 de la 1.2): el último waypoint de routeTo, la misma función con la
// que setDestination del servidor fija el destino del barco, desde la posición del barco propio y con el navegador de las
// islas de la bienvenida. Antes el cliente ajustaba el clic con el radio del casco y el servidor con navClearance, y en las
// escotaduras de I1 el servidor elegía otro punto: el marcador quedaba a 5–81 m de la parada
import { Navigator, routeTo } from '../game/nav';
import type { Vec2 } from '../game/vec';

export function markerDestination(nav: Navigator, ship: { x: number; z: number; classId: string }, x: number, z: number): Vec2 {
  const path = routeTo(nav, { x: ship.x, z: ship.z }, { x, z }, ship.classId);
  return path[path.length - 1];
}

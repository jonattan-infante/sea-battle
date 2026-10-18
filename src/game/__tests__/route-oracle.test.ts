import { IslandDef, MAP_1_0, MAP_1_1 } from '../constants';
import { Navigator } from '../nav';
import { ac22Pairs, referencePath, routeDifference } from './route-oracle';

// Rutas iguales a las de antes de los arreglos de coste (O-43; regla de producto: mismos puntos y misma longitud a
// ±0,01 m). findPath frente al oráculo (route-oracle.ts, el findPath de 4afc607), en las parejas de AC-22 de los márgenes
// 13, 19, 20 y 23, con los dos mapas. Un arreglo que empeore una ruta aunque llegue (el destino probado solo desde parte
// de los nodos, un tramo que corta un islote) cae aquí, aunque los tests de navegación sigan en verde
const MARGINS = [13, 19, 20, 23];
const PAIRS = 100; // por margen: el oráculo es la versión lenta, y el test no debe alargar la CI

describe('Rutas iguales al algoritmo de antes (O-43)', () => {
  test.each<[string, IslandDef[]]>([['MAP_1_1', MAP_1_1.islands], ['MAP_1_0', MAP_1_0.islands]])(
    '%s: findPath da las mismas rutas que el oráculo, a ±0,01 m en puntos y longitud',
    (name, islands) => {
      const nav = new Navigator(islands);
      const wrong: string[] = [];
      let total = 0;
      let graph = 0;
      const t0 = performance.now();
      for (const margin of MARGINS) {
        for (const [a, b] of ac22Pairs(nav, margin, PAIRS)) {
          const want = referencePath(nav, a, b, margin);
          const diff = routeDifference(a, nav.findPath(a, b, margin), want);
          total++;
          if (want.length > 1) graph++;
          if (diff && wrong.length < 5) wrong.push(`margen ${margin}, (${a.x.toFixed(2)}, ${a.z.toFixed(2)}) → (${b.x.toFixed(2)}, ${b.z.toFixed(2)}): ${diff}`);
        }
      }
      console.log(`O-43 oráculo ${name}: ${total} rutas, ${graph} por el grafo · ${(performance.now() - t0).toFixed(0)} ms`);
      expect(graph).toBeGreaterThan(total / 4);
      expect(wrong).toEqual([]);
    },
    60_000
  );
});

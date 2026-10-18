import { ISLANDS, IslandDef, NAV_LIMIT } from '../constants';
import { Navigator } from '../nav';
import { Vec2, createRng } from '../vec';

// El punto navegable más cercano cuando los márgenes de varias islas se solapan (AC-21, AC-172 a). Pasa con las 3 rocas
// del campo de escollos E1, a 31 m de borde a borde: con un margen > 15,5 m sus zonas infladas se tocan. Las formas de la
// 1.1 (GDD §4, tabla de islas) van aquí como círculos sueltos hasta que el mapa nuevo esté en constants.ts
const E1: IslandDef[] = [
  { id: 'E1a', x: 140, z: 260, radius: 7 },
  { id: 'E1b', x: 117.5, z: 299, radius: 7 },
  { id: 'E1c', x: 162.5, z: 299, radius: 7 }
];
const MAP_1_1: IslandDef[] = [
  ...ISLANDS,
  { id: 'T1', x: 150, z: -150, radius: 22 },
  { id: 'T2', x: -170, z: 150, radius: 22 },
  ...E1,
  { id: 'G1', x: 368, z: -368, radius: 20 },
  { id: 'G2', x: -368, z: -368, radius: 20 },
  { id: 'G3', x: -368, z: 368, radius: 20 },
  { id: 'G4', x: 368, z: 368, radius: 20 }
];
// Margen L/2 + 2 de las 9 clases de la 1.1 (GDD §4, «Receta de los escollos», fila «Paso»): Balandra 10, pirata 12,
// Goleta y mercante 13, Bergantín 14, Cañonera 16, Capitán 17, Fragata 19, Galeón 20 y Navío 23
const MARGINS = [10, 12, 13, 14, 16, 17, 19, 20, 23];
const CENTER = { x: 140, z: 286 }; // centro del triángulo de E1, a 25,99 m del centro de cada roca

// Lo que le queda al punto hasta el margen de la isla más cercana: negativo si está dentro del margen de alguna
const slack = (islands: IslandDef[], p: Vec2, margin: number) => Math.min(...islands.map((i) => Math.hypot(p.x - i.x, p.z - i.z) - i.radius - margin));

// Verdad de terreno por fuerza bruta: en cada uno de 360 rumbos, la distancia a la que el rayo sale de todas las islas
// infladas (une los tramos de cada círculo que se encadenan desde 0); el menor de los 360 acota por arriba la distancia
// al punto navegable más cercano
function nearestByRays(islands: IslandDef[], q: Vec2, margin: number): number {
  let best = Infinity;
  for (let k = 0; k < 360; k++) {
    const ux = Math.cos((k * Math.PI) / 180), uz = Math.sin((k * Math.PI) / 180);
    const spans = islands.flatMap((i) => {
      const r = i.radius + margin, b = (i.x - q.x) * ux + (i.z - q.z) * uz;
      const disc = b * b - ((q.x - i.x) ** 2 + (q.z - i.z) ** 2 - r * r);
      return disc > 0 ? [[b - Math.sqrt(disc), b + Math.sqrt(disc)]] : [];
    });
    let t = 0;
    for (let moved = true; moved; ) {
      moved = false;
      for (const [t0, t1] of spans) {
        if (t0 <= t + 1e-9 && t1 > t) {
          t = t1;
          moved = true;
        }
      }
    }
    best = Math.min(best, t);
  }
  return best;
}

// Puntos al azar dentro de las islas infladas (uniformes en el disco de cada una), con semilla fija
function insidePoints(islands: IslandDef[], margin: number, count: number, seed: number): Vec2[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => {
    const i = islands[Math.floor(rng() * islands.length)];
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * (i.radius + margin);
    return { x: i.x + Math.cos(a) * d, z: i.z + Math.sin(a) * d };
  });
}

describe('E1 — Punto navegable más cercano con márgenes que se solapan', () => {
  const navigator = new Navigator(MAP_1_1);

  test.each([
    ['Fragata', 19],
    ['Navío', 23]
  ])('AC-172 (a): un clic de %s (margen %i) en el centro del triángulo de E1 sale del margen de las 3 rocas, al punto más cercano', (_, margin) => {
    const p = navigator.nearestNavigable(CENTER, margin);
    const away = Math.hypot(p.x - CENTER.x, p.z - CENTER.z);
    const rays = nearestByRays(MAP_1_1, CENTER, margin);
    console.log(`AC-172 (a) margen ${margin}: (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) · ${slack(E1, p, margin).toFixed(2)} m fuera del margen de E1 · a ${away.toFixed(2)} m del centro (rayos: ${rays.toFixed(2)} m)`);
    expect(slack(MAP_1_1, p, margin)).toBeGreaterThanOrEqual(0);
    expect(slack(MAP_1_1, p, margin)).toBeLessThanOrEqual(1); // AC-21: a margen ±1 m del borde
    expect(away).toBeLessThanOrEqual(rays + 0.5);
  });

  // La propiedad, con las 16 formas de la 1.1 y las 9 clases: 20 000 puntos dentro de las islas infladas por margen
  test.each(MARGINS)('AC-21: con margen %i, de 20 000 puntos al azar dentro de las islas de la 1.1, ninguno se queda dentro del margen y todos acaban a margen +1 m como mucho del borde', (margin) => {
    const bad = insidePoints(MAP_1_1, margin, 20_000, 3)
      .map((q) => ({ q, left: slack(MAP_1_1, navigator.nearestNavigable(q, margin), margin) }))
      .filter(({ left }) => left < 0 || left > 1);
    expect({ count: bad.length, first: bad.slice(0, 3) }).toEqual({ count: 0, first: [] });
  });

  // Que sea el más cercano y no uno cualquiera fuera de las islas: frente a los rayos, en 200 puntos por margen
  test.each(MARGINS)('con margen %i, el punto devuelto está a ≤ 0,5 m más que el más cercano que encuentran los rayos', (margin) => {
    const far = insidePoints(MAP_1_1, margin, 200, 5)
      .map((q) => {
        const p = navigator.nearestNavigable(q, margin);
        return { q, extra: Math.hypot(p.x - q.x, p.z - q.z) - nearestByRays(MAP_1_1, q, margin) };
      })
      .filter(({ extra }) => extra > 0.5);
    expect({ count: far.length, first: far.slice(0, 3) }).toEqual({ count: 0, first: [] });
  });

  test('un punto ya navegable no se mueve, y uno fuera del límite vuelve al borde del mapa', () => {
    const rng = createRng(9);
    for (let k = 0; k < 2_000; k++) {
      const q = { x: (rng() * 2 - 1) * NAV_LIMIT, z: (rng() * 2 - 1) * NAV_LIMIT };
      if (slack(MAP_1_1, q, 23) >= 0) expect(navigator.nearestNavigable(q, 23)).toEqual(q);
    }
    expect(navigator.nearestNavigable({ x: 900, z: -700 }, 23)).toEqual({ x: NAV_LIMIT, z: -NAV_LIMIT });
  });
});

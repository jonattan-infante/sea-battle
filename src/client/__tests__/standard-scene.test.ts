// AC-89 (producto, P2 del punto 3 de dev-render; BACKLOG :421): la escena estándar tal cual y una variante con la población
// del I2 de GDD §0 (8 piratas, 4 Cañoneras y 8 mercantes, con el Capitán en el sitio de la Fragata que hace de jefe), en las
// mismas posiciones, rumbos, vidas y duelos, para que la diferencia entre las dos sea solo la de las clases
import { CAMERA, computePpm0 } from '../art';
import { GAME_MAP, IslandDef, MAP_1_0, MAP_1_1, MAX_CANNON_RANGE, navClearance } from '../../game/constants';
import { damageScene, galleryScene, islandsForScene, SceneName, sceneIslands, SceneSpec, showcaseScene, standardScene } from '../synthetic-scene';

const VIEW = { w: 1440, h: 900, ppm: computePpm0(1440, 900, MAX_CANNON_RANGE), sinT: Math.sin(CAMERA.elevation) };
// Lo que le falta al punto de la órbita más cercano a cada círculo para estar a su margen (radio + navClearance de su clase),
// en el peor barco: la órbita es un círculo de radio orbit con el centro a orbit de la salida (SyntheticSource.update), así que
// su punto más cercano a un círculo está a la distancia entre centros menos orbit. Negativo = dentro del margen
const worstGap = (spec: SceneSpec, islands: readonly IslandDef[]) => {
  let worst = { gap: Infinity, ship: '', island: '' };
  for (const s of spec.ships) {
    const cx = s.x + Math.cos(s.heading) * s.orbit;
    const cz = s.z - Math.sin(s.heading) * s.orbit;
    for (const i of islands) {
      const gap = Math.hypot(cx - i.x, cz - i.z) - s.orbit - (i.radius + navClearance(s.classId));
      if (gap < worst.gap) worst = { gap, ship: s.id, island: i.id };
    }
  }
  return worst;
};
const census = (ships: { kind: string; classId: string }[]) =>
  ships.reduce<Record<string, number>>((n, s) => ({ ...n, [`${s.kind}:${s.classId}`]: (n[`${s.kind}:${s.classId}`] ?? 0) + 1 }), {});

describe('La escena estándar de AC-89', () => {
  test('tal cual: 20 jugadores, 12 piratas, 8 mercantes y la Fragata «Capitán 21» en lugar del jefe', () => {
    const spec = standardScene(VIEW);
    expect(census(spec.ships)).toEqual({ 'player:sloop': 7, 'player:brig': 7, 'player:frigate': 7, 'pirate:pirate': 12, 'merchant:merchant': 8 });
    expect([spec.ships.length, spec.ships[40].classId, spec.ships[40].name, spec.duels.length]).toEqual([41, 'frigate', 'Capitán 21', 16]);
  });

  test('con la población del I2: 8 piratas, 4 Cañoneras, 8 mercantes y el Capitán en el sitio de la Fragata, con todo lo demás igual', () => {
    const base = standardScene(VIEW);
    const i2 = standardScene(VIEW, { i2: true });
    expect(census(i2.ships)).toEqual({ 'player:sloop': 7, 'player:brig': 7, 'player:frigate': 6, 'pirate:pirate': 8, 'pirate:gunboat': 4, 'merchant:merchant': 8, 'pirate:captain': 1 });
    expect([i2.ships[40].classId, i2.ships[40].kind, i2.ships[40].name]).toEqual(['captain', 'pirate', 'Capitán pirata']);
    expect(i2.ships.filter((s) => s.classId === 'gunboat').map((s) => s.name)).toEqual(Array(4).fill('Cañonera pirata'));
    const pose = (s: (typeof base.ships)[number]) => [s.id, s.x, s.z, s.heading, s.hp, s.speed, s.orbit];
    expect(i2.ships.map(pose)).toEqual(base.ships.map(pose));
    expect(i2.duels).toEqual(base.duels);
    expect([i2.focus, i2.seed]).toEqual([base.focus, base.seed]);
  });

  // AC-210: la escena va con las islas del mapa del juego. Antes se colocaba con las de la 1.0 (ISLANDS) y, con las de la 1.1,
  // 9 barcos quedaban dentro de su margen de los lóbulos de I1 y de los escollos de E1 (el peor, a −24,6 m)
  test('AC-210: sin islas, las del juego (la 1.1), y ningún punto de la órbita de ningún barco a menos de su margen de un círculo', () => {
    expect(GAME_MAP).toBe(MAP_1_1);
    for (const i2 of [false, true]) expect(worstGap(standardScene(VIEW, { i2 }), MAP_1_1.islands).gap).toBeGreaterThanOrEqual(0);
  });

  test('AC-210: con las islas de cada mapa (las de la bienvenida), fuera del margen de las suyas, con los 41 barcos y las mismas poses', () => {
    const pose = (s: SceneSpec['ships'][number]) => [s.id, s.classId, s.x, s.z, s.heading, s.hp, s.speed, s.orbit];
    const [a, b] = [MAP_1_0, MAP_1_1].map((map) => standardScene(VIEW, { islands: map.islands }));
    expect([a.ships.length, worstGap(a, MAP_1_0.islands).gap >= 0, b.ships.length, worstGap(b, MAP_1_1.islands).gap >= 0]).toEqual([41, true, 41, true]);
    expect([a.ships.map(pose), a.duels, a.focus]).toEqual([b.ships.map(pose), b.duels, b.focus]);
  });

  test('AC-210: las islas de la escena son las de la bienvenida y, sin ella, las del mapa del juego', () => {
    expect(sceneIslands({ islands: MAP_1_0.islands })).toBe(MAP_1_0.islands);
    expect(sceneIslands(null)).toBe(GAME_MAP.islands);
    expect(sceneIslands({ islands: [] })).toBe(GAME_MAP.islands);
  });

  // AC-210: la galería, la de daño y el escaparate pasan a pintar las islas del juego. Sus barcos siguen en mar abierto, fuera
  // del margen de los círculos de los 2 mapas (en su posición de salida; solo se mueve el mercante del escaparate), y su cámara
  // no mira a tierra
  test('AC-210: la galería, la de daño y el escaparate, sin barcos dentro de su margen ni la cámara sobre tierra, en la 1.0 y en la 1.1', () => {
    for (const spec of [galleryScene(), damageScene(), showcaseScene()]) {
      for (const map of [MAP_1_0, MAP_1_1]) {
        const onLand = map.islands.filter((i) => Math.hypot(spec.focus.x - i.x, spec.focus.z - i.z) < i.radius).map((i) => i.id);
        expect([spec.name, map.id, worstGap(spec, map.islands).gap >= 0, onLand]).toEqual([spec.name, map.id, true, []]);
      }
    }
  });

  // AC-210 (producto, BACKLOG :1936): en la 1.2 la portada (hero) no cambia de islas: sigue con los círculos de la 1.0, los
  // mismos ids y círculos que en 4cd8c45, aunque la bienvenida traiga los de la 1.1. Las escenas de prueba (la estándar y las
  // que abre la puerta de pruebas) siguen el mapa del juego: la bienvenida de la 1.1, o GAME_MAP (la 1.1) sin ella
  test('AC-210: la portada no cambia de islas; las escenas de prueba siguen el mapa del juego', () => {
    const map10 = [
      ['PORT', 0, 0, 30], ['I1', 260, 200, 45], ['I2', -300, 170, 35], ['I3', -220, -280, 55],
      ['I4', 250, -260, 40], ['I5', 20, 360, 30], ['I6', -410, -30, 28]
    ];
    const circles = (list: readonly IslandDef[]) => list.map((i) => [i.id, i.x, i.z, i.radius]);
    const testScenes: SceneName[] = ['standard', 'gallery', 'damage', 'showcase'];
    for (const welcome of [{ islands: MAP_1_1.islands }, null]) {
      expect(circles(islandsForScene('hero', welcome))).toEqual(map10);
      for (const name of testScenes) expect([name, circles(islandsForScene(name, welcome))]).toEqual([name, circles(MAP_1_1.islands)]);
    }
  });
});

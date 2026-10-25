// AC-89 (producto, P2 del punto 3 de dev-render; BACKLOG :421): la escena estándar tal cual y una variante con la población
// del I2 de GDD §0 (8 piratas, 4 Cañoneras y 8 mercantes, con el Capitán en el sitio de la Fragata que hace de jefe), en las
// mismas posiciones, rumbos, vidas y duelos, para que la diferencia entre las dos sea solo la de las clases
import { CAMERA, computePpm0 } from '../art';
import { MAX_CANNON_RANGE } from '../../game/constants';
import { standardScene } from '../synthetic-scene';

const VIEW = { w: 1440, h: 900, ppm: computePpm0(1440, 900, MAX_CANNON_RANGE), sinT: Math.sin(CAMERA.elevation) };
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
});

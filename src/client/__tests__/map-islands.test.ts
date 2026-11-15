// AC-199 e: el cliente pinta las islas con los mismos círculos que la colisión del servidor, los de la bienvenida
// (server/game-server.ts manda world.islands), y no con una copia. Con el mapa de la 1.0 son los de ISLANDS y la escena no se
// rehace; con el de la 1.1, el agua se construye con sus 50 círculos y la rejilla de candidatos
import * as THREE from 'three';
import { ISLANDS, MAP_1_0, MAP_1_1 } from '../../game/constants';
import { createWorld } from '../../game/world';
import { isMap10, islandsKey, islandsOf, ISLANDS_1_0_KEY } from '../map-islands';
import { createOceanMaterial, disposeOceanMaterial } from '../models/ocean-material';

describe('las islas del cliente salen de la bienvenida (AC-199 e)', () => {
  test('sin bienvenida, o con una sin islas, las de la 1.0', () => {
    expect(islandsOf(null)).toBe(ISLANDS);
    expect(islandsOf(undefined)).toBe(ISLANDS);
    expect(islandsOf({ islands: [] })).toBe(ISLANDS);
  });

  test('con el mapa de la 1.0, los círculos del servidor son los de ISLANDS: la escena no se rehace y conserva su arte', () => {
    const server = createWorld({ seed: 1, spawnNpcs: false }).islands;
    expect(islandsKey(islandsOf({ islands: server }))).toBe(ISLANDS_1_0_KEY);
    expect(isMap10(MAP_1_0.islands)).toBe(true);
  });

  test('con el mapa de la 1.1, el cliente toma exactamente los círculos con los que colisiona el servidor', () => {
    const server = createWorld({ seed: 1, spawnNpcs: false, map: MAP_1_1 }).islands;
    const client = islandsOf({ islands: server });
    expect(client).toEqual(MAP_1_1.islands);
    expect(islandsKey(client)).toBe(islandsKey(server));
    expect(isMap10(client)).toBe(false);
    // Un círculo distinto cambia la huella: el cliente rehace la escena
    expect(islandsKey(client.map((c, k) => (k === 3 ? { ...c, radius: c.radius + 0.5 } : c)))).not.toBe(islandsKey(client));
  });

  test('el agua de la 1.1 lleva sus 50 círculos y su rejilla, y al rehacerla se libera también la textura de la rejilla', () => {
    expect(MAP_1_1.islands).toHaveLength(50);
    const material = createOceanMaterial(MAP_1_1.islands);
    expect((material.uniforms.uIslands.value as THREE.Vector3[]).map((v) => [v.x, v.y, v.z])).toEqual(MAP_1_1.islands.map((i) => [i.x, i.z, i.radius]));
    const grid = material.uniforms.uIsleGrid.value as THREE.DataTexture;
    const freed: string[] = [];
    grid.addEventListener('dispose', () => freed.push('rejilla'));
    material.addEventListener('dispose', () => freed.push('material'));
    disposeOceanMaterial(material);
    expect(freed).toEqual(['rejilla', 'material']);
  });
});

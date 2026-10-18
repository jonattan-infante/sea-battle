// Rejilla de candidatos del agua (AC-198 e, salida 1): cada celda de 16 m guarda los círculos de isla que pueden quedar a
// menos de 18 m de algún punto suyo. Todo uso de la distancia a la costa en el shader satura a partir de 18 m, así que la
// distancia mínima a los candidatos de la celda, recortada a 18, es la misma que a todos los círculos: el agua sale igual
// píxel a píxel. Aquí se comprueba con la búsqueda que hace el shader (candidatesAt, en float32 como la GPU) frente a la
// fuerza bruta, en una malla densa y en los bordes de celda
import * as THREE from 'three';
import { ISLANDS } from '../../../game/constants';
import { buildIsleGrid, candidatesAt, EMPTY, ISLE_CELL, ISLE_REACH, IsleCircle, IsleGrid, MAX_ISLE_CIRCLES } from '../isle-grid';
import { createOceanMaterial } from '../ocean-material';

// A partir de qué distancia a la costa el agua ya no cambia: el mayor extremo de los smoothstep de dIsle del shader (18 m,
// el somero). Sale del código del shader y no de isle-grid.ts, para que un alcance menor en la rejilla se vea
const SATURATION = Math.max(...[...createOceanMaterial([]).fragmentShader.matchAll(/smoothstep\(\s*[\d.]+\s*,\s*([\d.]+)\s*,\s*dIsle\s*\)/g)].map((m) => Number(m[1])));

// Distancia mínima a la costa recortada donde satura el shader, sobre los círculos de `indices` (todos si no se da)
function shore(circles: IsleCircle[], x: number, z: number, indices?: number[]): number {
  let d = Infinity;
  const n = indices ? indices.length : circles.length;
  for (let k = 0; k < n; k++) {
    const c = circles[indices ? indices[k] : k];
    const dx = x - c.x;
    const dz = z - c.z;
    d = Math.min(d, Math.sqrt(dx * dx + dz * dz) - c.radius);
  }
  return Math.min(d, SATURATION);
}
// Los puntos que no cuadran: una malla de paso `step` sobre el dominio y 40 m más, y las líneas de borde de celda (justo
// en el borde y a ±1 mm), donde el float32 de la GPU puede caer en la celda vecina. «Todos» recorre los círculos cuya caja
// ±20 m contiene el punto: un círculo a menos de 18 m siempre está entre ellos, así que da el mínimo de verdad recortado a
// 18 (sin ninguno, 18, y la rejilla no puede dar menos), y no depende de las celdas. Así la prueba cabe en Jest, donde
// cada operación del bucle cuesta del orden de 20 veces más que en node directo (contexto vm)
function mismatches(circles: IsleCircle[], step: number): string[] {
  const grid = buildIsleGrid(circles);
  const box = SATURATION + 2;
  const x0 = grid.originX - 40;
  const z0 = grid.originZ - 40;
  const x1 = grid.originX + grid.nx * grid.cell + 40;
  const z1 = grid.originZ + grid.nz * grid.cell + 40;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let x = x0; x <= x1; x += step) xs.push(x);
  for (let z = z0; z <= z1; z += step) zs.push(z);
  for (let k = 0; k <= grid.nx; k++) for (const e of [-1e-3, 0, 1e-3]) xs.push(grid.originX + k * grid.cell + e);
  for (let k = 0; k <= grid.nz; k++) for (const e of [-1e-3, 0, 1e-3]) zs.push(grid.originZ + k * grid.cell + e);
  const bad: string[] = [];
  for (const x of xs) {
    const nearX = circles.flatMap((c, i) => (Math.abs(x - c.x) < c.radius + box ? [i] : []));
    for (const z of zs) {
      const near = nearX.filter((i) => Math.abs(z - circles[i].z) < circles[i].radius + box);
      if (!near.length) continue;
      const a = shore(circles, x, z, candidatesAt(grid, x, z));
      const b = shore(circles, x, z, near);
      if (a !== b && bad.length < 5) bad.push(`(${x.toFixed(3)}, ${z.toFixed(3)}): rejilla ${a}, todos ${b}`);
    }
  }
  return bad;
}

// Círculos al azar con semilla fija (LCG): solapes, islotes pegados y canales estrechos como los de D83, sin sus datos
function randomCircles(seed: number, n: number, half: number): IsleCircle[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: n }, () => ({ x: (rnd() * 2 - 1) * half, z: (rnd() * 2 - 1) * half, radius: 6 + rnd() * 39 }));
}

describe('AC-198 e: la rejilla de candidatos da la misma distancia a la costa que la lista, hasta 18 m', () => {
  test('el shader deja de usar la distancia a los 18 m (somero, orilla y espuma), y la rejilla llega hasta ahí', () => {
    expect(SATURATION).toBe(18);
    expect(ISLE_REACH).toBeGreaterThanOrEqual(SATURATION);
  });

  test('con las 7 islas de hoy (constants.ts)', () => {
    expect(ISLANDS).toHaveLength(7);
    expect(mismatches(ISLANDS, 1)).toEqual([]);
  });

  test.each([1, 2, 3])('con 60 círculos al azar (semilla %i), que solapan y dejan canales', (seed) => {
    expect(mismatches(randomCircles(seed, 60, 500), 2)).toEqual([]);
  });

  test('con un racimo de islotes que pasa de 4 por celda: la celda ocupa 2 texels y sigue exacta', () => {
    const cluster = Array.from({ length: 7 }, (_, i) => ({ x: 100 + 9 * Math.cos(i), z: -50 + 9 * Math.sin(i), radius: 4 + i }));
    const grid = buildIsleGrid(cluster);
    expect(grid.texelsPerCell).toBe(2);
    expect(mismatches(cluster, 0.5)).toEqual([]);
  });
});

describe('AC-198 e: el formato de la rejilla', () => {
  test('celdas de 16 m sobre las islas ±18,5 m; cada celda, sus candidatos de menor a mayor y el resto vacío (255)', () => {
    const circles = [
      { x: 0, z: 0, radius: 10 },
      { x: 30, z: 0, radius: 10 }
    ];
    const grid = buildIsleGrid(circles);
    expect([grid.cell, grid.originX, grid.originZ, grid.nx, grid.nz, grid.texelsPerCell]).toEqual([ISLE_CELL, -28.5, -28.5, Math.ceil(87 / 16), Math.ceil(57 / 16), 1]);
    expect(grid.data).toHaveLength(grid.nx * grid.nz * grid.texelsPerCell * 4);
    // El punto (15, 0) está a 5 m de los dos: su celda guarda los dos, en orden, y los 2 huecos que sobran vacíos
    const cx = Math.floor((15 - grid.originX) / grid.cell);
    const cz = Math.floor((0 - grid.originZ) / grid.cell);
    const at = (cz * grid.nx + cx) * grid.texelsPerCell * 4;
    expect(Array.from(grid.data.slice(at, at + 4))).toEqual([0, 1, EMPTY, EMPTY]);
    expect(candidatesAt(grid, 15, 0)).toEqual([0, 1]);
    expect(candidatesAt(grid, 500, 500)).toEqual([]); // fuera del dominio: ningún círculo a menos de 18 m
  });

  test('sin islas, la rejilla está vacía y nada tiene candidatos', () => {
    const grid = buildIsleGrid([]);
    expect([grid.nx, grid.nz]).toEqual([0, 0]);
    expect(candidatesAt(grid, 0, 0)).toEqual([]);
  });

  test(`más de ${MAX_ISLE_CIRCLES} círculos no caben en el índice de 1 byte ni en los uniforms: falla al crearla`, () => {
    expect(() => buildIsleGrid(randomCircles(4, MAX_ISLE_CIRCLES + 1, 500))).toThrow(/círculos/);
    expect(() => buildIsleGrid(randomCircles(4, MAX_ISLE_CIRCLES, 500))).not.toThrow();
  });
});

describe('AC-198 e: el material del océano lee la rejilla', () => {
  test('una textura RGBA8 sin filtrar ni mipmaps, del tamaño de la rejilla, y todos los círculos en el uniform', () => {
    const material = createOceanMaterial(ISLANDS);
    const grid = buildIsleGrid(ISLANDS);
    const tex = material.uniforms.uIsleGrid.value as THREE.DataTexture;
    expect([tex.image.width, tex.image.height, tex.format, tex.type, tex.magFilter, tex.minFilter, tex.generateMipmaps, tex.flipY]).toEqual([
      grid.nx * grid.texelsPerCell,
      grid.nz,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
      THREE.NearestFilter,
      THREE.NearestFilter,
      false,
      false
    ]);
    expect(Array.from(tex.image.data as Uint8Array)).toEqual(Array.from(grid.data));
    const islands = material.uniforms.uIslands.value as THREE.Vector3[];
    expect(islands.map((v) => [v.x, v.y, v.z])).toEqual(ISLANDS.map((c) => [c.x, c.z, c.radius]));
    expect(material.fragmentShader).toContain('texelFetch(uIsleGrid');
    expect(material.fragmentShader).not.toContain('uIslandCount');
  });
});

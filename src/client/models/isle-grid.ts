// Rejilla de candidatos para la distancia a la costa del agua (AC-198 e, salida 1). El shader del océano recorría todos los
// círculos de isla en cada píxel, y su coste crece con píxeles × círculos (≈ 0,088 ms por círculo a 2880×1800). Todo uso
// de esa distancia satura a partir de 18 m (somero smoothstep(0, 18), orilla (0, 4) y espuma de costa (2, 2,5)), así que
// a cada celda de 16 m le bastan los círculos que pueden quedar a menos de 18 m de algún punto suyo: el mínimo sobre ellos,
// recortado a 18, es el mismo que sobre todos, y el agua sale igual píxel a píxel. El margen de 0,5 m cubre el float32 de
// la GPU en los bordes de celda: un candidato de más no cambia el resultado, uno de menos sí
// Sin three ni DOM: la usan ocean-material.ts y los tests

export interface IsleCircle {
  x: number;
  z: number;
  radius: number;
}

export interface IsleGrid {
  originX: number; // esquina de la celda (0, 0), en m de mundo
  originZ: number;
  cell: number;
  nx: number;
  nz: number;
  // Texels RGBA por celda: 4 índices de círculo cada uno. Sale de los datos: 1 si ninguna celda pasa de 4 candidatos
  texelsPerCell: number;
  // (nx · texelsPerCell) × nz texels, fila a fila; los de una celda van seguidos. Índices de menor a mayor y EMPTY detrás
  data: Uint8Array;
}

export const ISLE_CELL = 16;
export const ISLE_REACH = 18; // m a partir de los que la distancia a la costa ya no cambia el agua
export const ISLE_MARGIN = 0.5;
export const EMPTY = 255;
// Índice de 1 byte (255 = vacío) y, sobre todo, los uniforms: 128 vec3 más los ≈ 33 del resto del shader caben de sobra
// en los 224 vectores que WebGL2 garantiza al fragment shader. AC-198 e pide como mucho 60
export const MAX_ISLE_CIRCLES = 128;

export function buildIsleGrid(circles: IsleCircle[], cell = ISLE_CELL, reach = ISLE_REACH + ISLE_MARGIN): IsleGrid {
  if (circles.length > MAX_ISLE_CIRCLES) throw new Error(`${circles.length} círculos de isla: el agua admite ${MAX_ISLE_CIRCLES}`);
  if (!circles.length) return { originX: 0, originZ: 0, cell, nx: 0, nz: 0, texelsPerCell: 1, data: new Uint8Array(0) };
  const originX = Math.min(...circles.map((c) => c.x - c.radius)) - reach;
  const originZ = Math.min(...circles.map((c) => c.z - c.radius)) - reach;
  const nx = Math.ceil((Math.max(...circles.map((c) => c.x + c.radius)) + reach - originX) / cell);
  const nz = Math.ceil((Math.max(...circles.map((c) => c.z + c.radius)) + reach - originZ) / cell);
  const cells: number[][] = [];
  for (let cz = 0; cz < nz; cz++) {
    for (let cx = 0; cx < nx; cx++) {
      const ax = originX + cx * cell;
      const az = originZ + cz * cell;
      // Distancia del centro al rectángulo de la celda (0 si cae dentro), menos el radio
      cells.push(
        circles.flatMap((c, i) => {
          const dx = Math.max(ax - c.x, 0, c.x - (ax + cell));
          const dz = Math.max(az - c.z, 0, c.z - (az + cell));
          return Math.hypot(dx, dz) - c.radius < reach ? [i] : [];
        })
      );
    }
  }
  const texelsPerCell = Math.max(1, Math.ceil(Math.max(...cells.map((l) => l.length)) / 4));
  const data = new Uint8Array(nx * nz * texelsPerCell * 4).fill(EMPTY);
  cells.forEach((list, k) => list.forEach((i, j) => (data[k * texelsPerCell * 4 + j] = i)));
  return { originX, originZ, cell, nx, nz, texelsPerCell, data };
}

// Los candidatos del punto (x, z), con la misma búsqueda que el shader y en float32 como la GPU: el primer vacío corta los
// dos bucles. `reads` cuenta los texels que lee, para comprobar ese corte
export function candidatesAt(grid: IsleGrid, x: number, z: number, reads?: { texels: number }): number[] {
  const f = Math.fround;
  const gx = Math.floor(f(f(f(x) - f(grid.originX)) * f(1 / grid.cell)));
  const gz = Math.floor(f(f(f(z) - f(grid.originZ)) * f(1 / grid.cell)));
  if (gx < 0 || gz < 0 || gx >= grid.nx || gz >= grid.nz) return [];
  const at = (gz * grid.nx + gx) * grid.texelsPerCell * 4;
  const out: number[] = [];
  for (let l = 0; l < grid.texelsPerCell; l++) {
    if (reads) reads.texels++;
    for (let k = 0; k < 4; k++) {
      const i = grid.data[at + l * 4 + k];
      if (i === EMPTY) return out;
      out.push(i);
    }
  }
  return out;
}

// Variante de QA 'grid-f32' (AC-198 e; solo para medir, con el gancho de QA del runtime): la misma rejilla con los círculos dentro, para que
// el shader no indexe el array de uniforms con un índice leído de la textura. Cada candidato es un texel RGBA32F (x, z, radio,
// 1) en el orden de sus índices, y los huecos (0, 0, 0, 0) detrás. `slots` = el mayor número de candidatos de una celda (≥ 1).
// Los valores son los mismos float32 que los uniforms, así que la distancia sale igual que con la rejilla de índices
export interface IsleGridF32 {
  slots: number;
  width: number; // nx · slots
  height: number; // nz
  data: Float32Array; // width × height × 4
}

export function isleGridF32(grid: IsleGrid, circles: IsleCircle[]): IsleGridF32 {
  const per = grid.texelsPerCell * 4;
  const count = (k: number) => {
    let n = 0;
    while (n < per && grid.data[k * per + n] !== EMPTY) n++;
    return n;
  };
  const cells = grid.nx * grid.nz;
  let slots = 1;
  for (let k = 0; k < cells; k++) slots = Math.max(slots, count(k));
  const data = new Float32Array(Math.max(1, cells * slots) * 4);
  for (let k = 0; k < cells; k++) {
    const n = count(k);
    for (let j = 0; j < n; j++) {
      const c = circles[grid.data[k * per + j]];
      data.set([c.x, c.z, c.radius, 1], (k * slots + j) * 4);
    }
  }
  return { slots, width: Math.max(1, grid.nx * slots), height: Math.max(1, grid.nz), data };
}

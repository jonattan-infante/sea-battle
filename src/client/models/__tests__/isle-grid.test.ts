// Rejilla de candidatos del agua (AC-198 e, salida 1): cada celda de 16 m guarda los círculos de isla que pueden quedar a
// menos de 18 m de algún punto suyo. Todo uso de la distancia a la costa en el shader satura a partir de 18 m, así que la
// distancia mínima a los candidatos de la celda, recortada a 18, es la misma que a todos los círculos: el agua sale igual
// píxel a píxel. Aquí se comprueba con la búsqueda que hace el shader (candidatesAt, en float32 como la GPU) frente a la
// fuerza bruta, en una malla densa y en los bordes de celda
import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';
import { ISLANDS, MAP_1_1 } from '../../../game/constants';
import { buildIsleGrid, candidatesAt, EMPTY, ISLE_CELL, ISLE_REACH, IsleCircle, IsleGrid, isleGridF32, MAX_ISLE_CIRCLES } from '../isle-grid';
import { createOceanMaterial, disposeOceanMaterial, OCEAN_LOOKUPS } from '../ocean-material';

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

// Con el puerto de D92, el mapa de la 1.1 tiene 50 círculos y alguna celda del puerto pide 2 texels, así que la rejilla entera
// lleva 2. El bucle de los texels se corta en el primer vacío (BACKLOG :1687): una celda con ≤ 3 candidatos lee 1 texel
describe('AC-198 e: el mapa de la 1.1 (50 círculos) y el corte en el primer vacío', () => {
  const circles = MAP_1_1.islands;
  const grid = buildIsleGrid(circles);

  test('2 texels por celda, como mucho 6 candidatos (en el puerto), y la misma distancia que la lista', () => {
    expect(circles).toHaveLength(50);
    expect(grid.texelsPerCell).toBe(2);
    const counts = Array.from({ length: grid.nx * grid.nz }, (_, k) => {
      let n = 0;
      for (let j = 0; j < grid.texelsPerCell * 4 && grid.data[k * grid.texelsPerCell * 4 + j] !== EMPTY; j++) n++;
      return n;
    });
    expect(Math.max(...counts)).toBe(6);
    expect(mismatches(circles, 2)).toEqual([]);
  });

  test('cada celda lee los texels hasta su primer vacío: 1 con ≤ 3 candidatos y 2 con 4 o más', () => {
    const wrong: string[] = [];
    let one = 0;
    for (let gz = 0; gz < grid.nz; gz++) {
      for (let gx = 0; gx < grid.nx; gx++) {
        const reads = { texels: 0 };
        const n = candidatesAt(grid, grid.originX + (gx + 0.5) * grid.cell, grid.originZ + (gz + 0.5) * grid.cell, reads).length;
        const want = n <= 3 ? 1 : 2;
        if (want === 1) one++;
        if (reads.texels !== want && wrong.length < 5) wrong.push(`celda (${gx}, ${gz}): ${n} candidatos, ${reads.texels} texels`);
      }
    }
    expect(wrong).toEqual([]);
    expect(one).toBeGreaterThan(0.95 * grid.nx * grid.nz);
  });

  test('el shader corta igual: el primer vacío sale también del bucle de los texels', () => {
    const shader = createOceanMaterial(circles).fragmentShader;
    expect(shader).toMatch(/for \(int l = 0; l < 2; l\+\+\) \{\s*if \(cellDone\) break;/);
    expect(shader).toMatch(/if \(i == 255\) \{\s*cellDone = true;\s*break;\s*\}/);
  });
});

// La búsqueda por lista (todos los círculos en cada píxel) existe solo para medir la rejilla contra ella en el mismo build
// (condición del lead para AC-198 e). El juego usa siempre la rejilla: es lo que da createOceanMaterial sin opciones, y solo el
// gancho de QA del runtime (setOceanLookup) pide la lista; ni la interfaz ni la URL lo llaman
describe('AC-198 e: la rejilla por defecto y la lista solo para QA', () => {
  const circles = MAP_1_1.islands;
  const LIST_LOOP = /for \(int i = 0; i < 50; i\+\+\) dIsle = min\(dIsle, length\(p - uIslands\[i\]\.xy\) - uIslands\[i\]\.z\);/;
  const GRID = /texelFetch\(uIsleGrid/;

  test('sin opciones, y con lookup grid, el shader busca en la rejilla y no recorre la lista', () => {
    for (const shader of [createOceanMaterial(circles).fragmentShader, createOceanMaterial(circles, {}).fragmentShader, createOceanMaterial(circles, { lookup: 'grid' }).fragmentShader]) {
      expect(shader).toMatch(GRID);
      expect(shader).toMatch(/cellDone/);
      expect(shader).not.toMatch(LIST_LOOP);
      const shore = shader.slice(shader.indexOf('float dIsle = 1e5;'), shader.indexOf('float s = 1.0 - smoothstep(0.0, 18.0, dIsle);'));
      expect(shore).toMatch(GRID);
      expect(shore).not.toMatch(/for \(int i = 0;/);
    }
    expect(createOceanMaterial(circles).fragmentShader).toBe(createOceanMaterial(circles, { lookup: 'grid' }).fragmentShader);
  });

  test('con lookup list, el shader recorre los 50 círculos y no lee la rejilla; el resto del shader, igual', () => {
    const grid = createOceanMaterial(circles).fragmentShader;
    const list = createOceanMaterial(circles, { lookup: 'list' }).fragmentShader;
    expect(list).toMatch(LIST_LOOP);
    expect(list).not.toMatch(GRID);
    expect(list).not.toMatch(/cellDone/);
    // Lo que va antes y después de la distancia a la costa es el mismo texto en las dos
    const cut = (s: string) => {
      const a = s.indexOf('float dIsle = 1e5;');
      const b = s.indexOf('float s = 1.0 - smoothstep(0.0, 18.0, dIsle);');
      expect(a).toBeGreaterThan(0);
      expect(b).toBeGreaterThan(a);
      return [s.slice(0, a), s.slice(b)];
    };
    expect(cut(list)).toEqual(cut(grid));
  });

  test('fuera de los tests, solo el runtime elige la búsqueda, con el gancho de QA y la rejilla de partida', () => {
    const src = path.resolve(__dirname, '../../..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(f);
        } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(f);
      }
    };
    walk(src);
    const rel = (f: string) => path.relative(src, f);
    const using = files.filter((f) => /setOceanLookup|\blookup\s*:|OceanLookup/.test(fs.readFileSync(f, 'utf8'))).map(rel).sort();
    expect(using).toEqual(['client/models/ocean-material.ts', 'client/runtime.ts']);
    const rt = fs.readFileSync(path.join(src, 'client/runtime.ts'), 'utf8');
    // En el runtime: la rejilla de partida, el método del gancho y ninguna llamada a él ni ningún 'list' escrito
    expect(rt).toMatch(/private oceanLookup: OceanLookup = 'grid';/);
    expect(rt.match(/setOceanLookup\(/g)).toHaveLength(1);
    expect(rt).toMatch(/\n  setOceanLookup\(lookup: OceanLookup\): void \{/);
    expect(rt).not.toMatch(/'list'/);
  });
});

// Las otras 2 búsquedas de QA (re-turno de C1): 'list-main', el bucle de main antes de la rejilla, que es el «hoy» con el que
// se calibra (9475c97, ocean-material.ts:130-132), y 'grid-f32', la rejilla con los círculos en una textura RGBA32F, sin
// indexar los uniforms con un índice leído de la textura. Solo cambia el bloque de la distancia a la costa
describe('AC-198 e: las variantes de QA list-main y grid-f32', () => {
  const shore = (sh: string) => sh.slice(sh.indexOf('float dIsle = 1e5;'), sh.indexOf('float s = 1.0 - smoothstep(0.0, 18.0, dIsle);'));
  const rest = (sh: string) => sh.replace(shore(sh), '').replace(/uniform vec3 uIslands\[\d+\];/, '').replace(/uniform int uIslandCount;\n|uniform highp sampler2D uIsleGridF;.*\n/g, '');

  test('list-main con las 7 islas: el bucle de main, tope 16 y break con uIslandCount = 7, y los 9 de sobra a (0, 0, −1)', () => {
    const m = createOceanMaterial([...ISLANDS], { lookup: 'list-main' });
    expect(shore(m.fragmentShader)).toMatch(/for \(int i = 0; i < 16; i\+\+\) \{\s*if \(i >= uIslandCount\) break;\s*dIsle = min\(dIsle, length\(p - uIslands\[i\]\.xy\) - uIslands\[i\]\.z\);\s*\}/);
    expect(shore(m.fragmentShader)).not.toMatch(/texelFetch/);
    expect(m.fragmentShader).toMatch(/uniform vec3 uIslands\[16\];/);
    expect(m.uniforms.uIslandCount.value).toBe(7);
    expect(m.fragmentShader).toMatch(/uniform int uIslandCount;/);
    expect(m.fragmentShader).not.toMatch(/uIsleGridF/);
    const packed = m.uniforms.uIslands.value as THREE.Vector3[];
    expect(packed).toHaveLength(16);
    expect(packed.slice(0, 7).map((v) => [v.x, v.y, v.z])).toEqual(ISLANDS.map((c) => [c.x, c.z, c.radius]));
    expect(packed.slice(7).every((v) => v.x === 0 && v.y === 0 && v.z === -1)).toBe(true);
  });

  test('list-main con los 50 círculos: el tope sube a 50 solo en la variante; la rejilla de por defecto no cambia', () => {
    const m = createOceanMaterial(MAP_1_1.islands, { lookup: 'list-main' });
    expect(shore(m.fragmentShader)).toMatch(/for \(int i = 0; i < 50; i\+\+\) \{\s*if \(i >= uIslandCount\) break;/);
    expect(m.uniforms.uIslandCount.value).toBe(50);
    expect(createOceanMaterial(MAP_1_1.islands).fragmentShader).toMatch(/uniform vec3 uIslands\[50\];/);
    expect(createOceanMaterial([...ISLANDS]).fragmentShader).toMatch(/uniform vec3 uIslands\[7\];/);
  });

  test('grid-f32: cada celda guarda sus candidatos, en el orden de la rejilla de índices, con x, z, radio y 1; el resto a 0', () => {
    for (const circles of [[...ISLANDS], MAP_1_1.islands]) {
      const grid = buildIsleGrid(circles);
      const f = isleGridF32(grid, circles);
      expect(f.width).toBe(grid.nx * f.slots);
      expect(f.height).toBe(grid.nz);
      const wrong: string[] = [];
      let maxN = 0;
      for (let gz = 0; gz < grid.nz; gz++) {
        for (let gx = 0; gx < grid.nx; gx++) {
          const ids = candidatesAt(grid, grid.originX + (gx + 0.5) * grid.cell, grid.originZ + (gz + 0.5) * grid.cell);
          maxN = Math.max(maxN, ids.length);
          const got = Array.from({ length: f.slots }, (_, j) => Array.from(f.data.subarray(((gz * grid.nx + gx) * f.slots + j) * 4, ((gz * grid.nx + gx) * f.slots + j) * 4 + 4)));
          const want = Array.from({ length: f.slots }, (_, j) => (j < ids.length ? [circles[ids[j]].x, circles[ids[j]].z, circles[ids[j]].radius, 1].map(Math.fround) : [0, 0, 0, 0]));
          if (JSON.stringify(got) !== JSON.stringify(want) && wrong.length < 5) wrong.push(`(${gx}, ${gz})`);
        }
      }
      expect(wrong).toEqual([]);
      expect(f.slots).toBe(maxN);
    }
    expect(isleGridF32(buildIsleGrid(MAP_1_1.islands), MAP_1_1.islands).slots).toBe(6);
  });

  test('grid-f32: el shader lee x, z y radio de la textura RGBA32F sin filtrar, sin indexar uIslands, y corta en el primer hueco', () => {
    const m = createOceanMaterial(MAP_1_1.islands, { lookup: 'grid-f32' });
    const sh = shore(m.fragmentShader);
    expect(sh).toMatch(/for \(int j = 0; j < 6; j\+\+\) \{\s*vec4 c = texelFetch\(uIsleGridF, ivec2\(cell\.x \* 6 \+ j, cell\.y\), 0\);\s*if \(c\.w == 0\.0\) break;\s*dIsle = min\(dIsle, length\(p - c\.xy\) - c\.z\);/);
    expect(sh).not.toMatch(/uIslands|uIsleGrid,/);
    expect(m.fragmentShader).toMatch(/uniform highp sampler2D uIsleGridF;/);
    expect(m.fragmentShader).not.toMatch(/uIslandCount/);
    const tex = m.uniforms.uIsleGridF.value as THREE.DataTexture;
    expect(tex.type).toBe(THREE.FloatType);
    expect(tex.format).toBe(THREE.RGBAFormat);
    expect([tex.minFilter, tex.magFilter, tex.generateMipmaps, tex.flipY]).toEqual([THREE.NearestFilter, THREE.NearestFilter, false, false]);
    const spy = jest.spyOn(tex, 'dispose');
    disposeOceanMaterial(m);
    expect(spy).toHaveBeenCalledTimes(1);
    // Las demás búsquedas no crean la textura de float
    for (const lookup of ['grid', 'list', 'list-main'] as const) expect(createOceanMaterial(MAP_1_1.islands, { lookup }).uniforms.uIsleGridF.value).toBeNull();
  });

  test('las 4 búsquedas comparten todo el shader menos la distancia a la costa (y el tamaño del array de islas)', () => {
    expect(OCEAN_LOOKUPS).toEqual(['grid', 'list', 'list-main', 'grid-f32']);
    for (const circles of [[...ISLANDS], MAP_1_1.islands]) {
      const base = rest(createOceanMaterial(circles).fragmentShader);
      for (const lookup of OCEAN_LOOKUPS) expect(rest(createOceanMaterial(circles, { lookup }).fragmentShader)).toBe(base);
    }
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

// AS-V15 (ASSET-SPEC §11): las comprobaciones AS-V02…V09 aplicadas al Object3D procedural de las 5 recetas P0,
// más AS-V16 (radio de las islas en la flotación) y los presupuestos de islas y props de §5. Sin WebGL.
import * as THREE from 'three';
import { ISLANDS } from '../../../game/constants';
import { buildBuoyGeometry, buildIslands, buildLootGeometry, buildPalmGeometry } from '../island-geometry';
import { SHIP_LOOKS, TOP_FACE } from '../../art';
import { buildShipAsset, deckHalfBeam, deckY, getShipModel, ShipExtras } from '../ship-geometry';

const CLASSES = ['sloop', 'brig', 'frigate', 'pirate', 'merchant'] as const;
const BUDGET = { ship: [2500, 800], npc: [2000, 700] } as const;
const EXTRAS_KEYS: (keyof ShipExtras)[] = [
  'sb_version', 'sb_kind', 'sb_id', 'sb_length', 'sb_beam', 'sb_freeboard', 'sb_draft', 'sb_mast_height',
  'sb_radius', 'sb_pick', 'sb_cannons_per_side', 'sb_lod_px'
];

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

describe.each(CLASSES)('Barco procedural %s', (classId) => {
  const model = getShipModel(classId);
  const root = buildShipAsset(classId);
  const id = model.recipe.assetId;
  const extras = root.userData as ShipExtras;
  const child = (name: string) => root.getObjectByName(name);
  root.updateMatrixWorld(true);

  test('AS-V02: raíz con el id, transform identidad y escala 1', () => {
    expect(root.name).toBe(id);
    expect(root.position.toArray()).toEqual([0, 0, 0]);
    expect(root.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(root.scale.toArray()).toEqual([1, 1, 1]);
  });

  test('AS-V03: extras completos; eslora y manga = caja del casco de LOD0 (±2 %)', () => {
    for (const key of EXTRAS_KEYS) expect(extras).toHaveProperty(key);
    const size = model.hullBox.getSize(new THREE.Vector3());
    expect(Math.abs(size.z - extras.sb_length) / extras.sb_length).toBeLessThanOrEqual(0.02);
    expect(Math.abs(size.x - extras.sb_beam) / extras.sb_beam).toBeLessThanOrEqual(0.02);
  });

  test('AS-V04: proa en +Z (el bauprés sobresale)', () => {
    const bow = child('socket_bow')!;
    const wake = child('socket_wake')!;
    expect(bow.position.z).toBeGreaterThan(0);
    expect(wake.position.z).toBeLessThan(0);
    const box = model.lods[0].boundingBox!;
    expect(box.max.z).toBeGreaterThan(Math.abs(box.min.z));
  });

  test('AS-V05: flotación y pivote', () => {
    const box = model.lods[0].boundingBox!;
    expect(box.min.y).toBeGreaterThanOrEqual(-(extras.sb_draft + 0.05));
    expect(model.hullBox.min.y).toBeLessThan(0);
    expect(model.hullBox.max.y).toBeGreaterThan(0);
    const c = model.hullBox.getCenter(new THREE.Vector3());
    expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(0.05 * extras.sb_length);
  });

  test('AS-V06: sockets de cañón por banda, numerados de popa a proa, y el resto de sockets', () => {
    const n = extras.sb_cannons_per_side;
    for (const side of ['port', 'stbd'] as const) {
      const sockets = root.children.filter((o) => o.name.startsWith(`socket_cannon_${side}_`));
      expect(sockets).toHaveLength(n);
      sockets.forEach((s, i) => {
        expect(s.name).toBe(`socket_cannon_${side}_${String(i + 1).padStart(2, '0')}`);
        expect(side === 'port' ? s.position.x > 0 : s.position.x < 0).toBe(true);
        if (i > 0) expect(s.position.z).toBeGreaterThan(sockets[i - 1].position.z);
      });
    }
    for (const name of ['socket_smoke', 'socket_fire_01', 'socket_fire_02', 'socket_fire_03', 'socket_label', 'socket_wake', 'socket_bow']) {
      expect(child(name)).toBeDefined();
    }
  });

  test('AS-V07: los sockets de cañón miran hacia afuera de su banda', () => {
    const z = new THREE.Vector3();
    for (const o of root.children.filter((c) => c.name.startsWith('socket_cannon_'))) {
      z.set(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
      const out = o.name.includes('_port_') ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0);
      expect(z.dot(out)).toBeGreaterThanOrEqual(0.99);
    }
  });

  test('AS-V08: triángulos dentro del presupuesto de §5 por LOD', () => {
    const [b0, b1] = BUDGET[extras.sb_kind];
    expect(tris(model.lods[0])).toBeLessThanOrEqual(b0);
    expect(tris(model.lods[1])).toBeLessThanOrEqual(b1);
    expect(tris(model.lods[1])).toBeLessThan(tris(model.lods[0]));
  });

  test('AS-V09: 1 malla y 1 primitiva por LOD, 1 material opaco sin texturas, con vertex colors', () => {
    const meshes = root.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh);
    expect(meshes.map((m) => m.name)).toEqual([`${id}_lod0`, `${id}_lod1`]);
    const materials = new Set(meshes.map((m) => m.material));
    expect(materials.size).toBe(1);
    const material = meshes[0].material as THREE.MeshStandardMaterial;
    expect(material.map).toBeNull();
    expect(material.transparent).toBe(false);
    expect(material.vertexColors).toBe(true);
    for (const m of meshes) {
      expect(m.geometry.groups).toHaveLength(0);
      // Atributos exactos (POSITION, NORMAL, COLOR_0, _RIM_MASK en el GLB)
      expect(Object.keys(m.geometry.attributes).sort()).toEqual(['_rim_mask', 'color', 'normal', 'position']);
    }
  });

  test('AS-V09 (D18): _rim_mask vale 1 solo en el casco (loft y castillos) y 0 en velas y aparejo', () => {
    const hull = new THREE.Color(SHIP_LOOKS[model.recipe.look].hull);
    model.lods.forEach((geometry, lod) => {
      const rim = geometry.getAttribute('_rim_mask');
      const color = geometry.getAttribute('color');
      expect(rim.count).toBe(geometry.getAttribute('position').count);
      let ones = 0;
      for (let v = 0; v < rim.count; v++) {
        const value = rim.getX(v);
        expect(value === 0 || value === 1).toBe(true);
        ones += value;
        // Todo vértice del color del casco es casco (strips del loft y tapas)
        if (Math.abs(color.getX(v) - hull.r) + Math.abs(color.getY(v) - hull.g) + Math.abs(color.getZ(v) - hull.b) < 1e-4) expect(value).toBe(1);
      }
      for (const [t0, t1] of model.sails[lod]) for (let v = t0 * 3; v < t1 * 3; v++) expect(rim.getX(v)).toBe(0);
      expect(ones).toBeGreaterThan(0);
      expect(ones).toBeLessThan(rim.count);
    });
  });

  test('AS-V14 (base): los rangos de vela de cada LOD solo contienen vértices del color de vela o de franja (y de los paneles en LOD0)', () => {
    const look = SHIP_LOOKS[model.recipe.look];
    model.lods.forEach((geometry, lod) => {
      const allowed = [look.sail, look.sailStripe, lod === 0 ? look.sailAlt : null].filter((c): c is string => !!c).map((hex) => new THREE.Color(hex));
      const ranges = model.sails[lod];
      expect(ranges.length).toBeGreaterThan(0);
      const color = geometry.getAttribute('color');
      for (const [t0, t1] of ranges) {
        expect(t1 * 3).toBeLessThanOrEqual(color.count);
        for (let v = t0 * 3; v < t1 * 3; v++) {
          const ok = allowed.some((c) => Math.abs(c.r - color.getX(v)) + Math.abs(c.g - color.getY(v)) + Math.abs(c.b - color.getZ(v)) < 1e-4);
          expect(ok).toBe(true);
        }
      }
    });
  });

  // D23 (ASSET-SPEC §6, §7, §8.1, §8.2): detalle interno dentro del presupuesto
  const colorCount = (geometry: THREE.BufferGeometry, hex: string, k = 1) => {
    const c = new THREE.Color(hex).multiplyScalar(k);
    const color = geometry.getAttribute('color');
    let n = 0;
    for (let v = 0; v < color.count; v++) if (Math.abs(c.r - color.getX(v)) + Math.abs(c.g - color.getY(v)) + Math.abs(c.b - color.getZ(v)) < 1e-4) n++;
    return n;
  };

  test('D23: tablas de cubierta (deck.alt) y paneles de lona (sail.alt) en LOD0, no en LOD1; oclusión ×0,85 en LOD0', () => {
    const look = SHIP_LOOKS[model.recipe.look];
    const [lod0, lod1] = model.lods;
    expect(colorCount(lod0, look.deckAlt)).toBeGreaterThan(0);
    expect(colorCount(lod1, look.deckAlt)).toBe(0);
    expect(colorCount(lod1, look.deckAlt, 0.85)).toBe(0);
    expect(colorCount(lod0, look.hull, 0.85)).toBeGreaterThan(0); // borde inferior de V2–V3
    expect(colorCount(lod0, look.mast, 0.85)).toBeGreaterThan(0); // collar de 0,4 m de los mástiles
    // Las velas cuadras llevan paneles; el mercante solo en las filas crema
    if (model.recipe.masts.some((m) => m.squares?.length)) {
      expect(colorCount(lod0, look.sailAlt)).toBeGreaterThan(0);
      expect(colorCount(lod1, look.sailAlt)).toBe(0);
    }
  });

  test('D23: normales con pliegue de 40° (material sin flat shading): el costado es continuo y el canto de cubierta, duro', () => {
    const material = (root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(material.flatShading).toBe(false);
    // En el centro de la eslora: el vértice V1 del costado (entre la cara V0–V1 y la franja) tiene una sola normal, y
    // el canto de cubierta V0 (costado frente a tablas) tiene más de una
    const r = model.recipe;
    const geometry = model.lods[0];
    const pos = geometry.getAttribute('position');
    const nor = geometry.getAttribute('normal');
    const at = (x: number, y: number, z: number) => {
      const set = new Set<string>();
      for (let v = 0; v < pos.count; v++) {
        if (Math.abs(pos.getX(v) - x) + Math.abs(pos.getY(v) - y) + Math.abs(pos.getZ(v) - z) < 1e-4) set.add(`${nor.getX(v).toFixed(3)},${nor.getY(v).toFixed(3)},${nor.getZ(v).toFixed(3)}`);
      }
      return set.size;
    };
    const yd = deckY(r, 0);
    const a = deckHalfBeam(r, 0) * 2 / r.B;
    expect(at(a * r.B / 2, yd, 0)).toBeGreaterThan(1);
    // V1: x(y₁) sobre la recta entre la flotación V3 (el vértice de babor con y = 0 en z = 0) y el canto; y₁ = yd − 0,3·F,
    // o el borde superior de la franja de portas de 1,0 m en las clases con portas (D36)
    let b = 0;
    for (let v = 0; v < pos.count; v++) if (Math.abs(pos.getY(v)) < 1e-6 && Math.abs(pos.getZ(v)) < 1e-6 && pos.getX(v) > b) b = pos.getX(v);
    const y1 = r.cannonZ.length ? yd - (r.F - r.cannonY - 0.5) : yd - 0.3 * r.F;
    const x1 = b + ((a * r.B / 2 - b) * y1) / yd;
    expect(at(x1, y1, 0)).toBe(1);
  });

  test('D23: portas de 0,8 m bajo el canto de cubierta (0,60·F + 0,4 ≤ yd(u)) y cañones con radio ≥ 0,22 m', () => {
    const r = model.recipe;
    for (const z of r.cannonZ) expect(r.cannonY + 0.4).toBeLessThanOrEqual(deckY(r, z / r.L) + 1e-9);
    if (r.cannonZ.length) expect(r.cannon[0]).toBeGreaterThanOrEqual(0.22);
  });

  // D36 (ASSET-SPEC §8.1–8.2, ART-DIRECTION §9.1): paños, tablas en las tapas y franja de portas. Las cifras salen de las
  // fórmulas de la spec, no de la implementación
  const sameColor = (color: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, v: number, hex: string) => {
    const c = new THREE.Color(hex);
    return Math.abs(c.r - color.getX(v)) + Math.abs(c.g - color.getY(v)) + Math.abs(c.b - color.getZ(v)) < 1e-4;
  };

  test('D36: franja de portas de 1,0 m centrada en la línea de cañones en la maestra, con la porta dentro; sin portas, 0,30–0,55·F', () => {
    const r = model.recipe;
    const look = SHIP_LOOKS[r.look];
    const pos = model.lods[0].getAttribute('position');
    const color = model.lods[0].getAttribute('color');
    const ys: number[] = [];
    for (let v = 0; v < pos.count; v++) if (Math.abs(pos.getZ(v)) < 1e-6 && pos.getX(v) > 0 && sameColor(color, v, look.band)) ys.push(pos.getY(v));
    const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
    if (r.cannonZ.length) {
      expect(lo).toBeCloseTo(r.cannonY - 0.5, 6);
      expect(hi).toBeCloseTo(r.cannonY + 0.5, 6);
    } else {
      expect(lo).toBeCloseTo(r.F - 0.55 * r.F, 6);
      expect(hi).toBeCloseTo(r.F - 0.3 * r.F, 6);
    }
  });

  test('D36: tapas de castillos y camaretas en n = 2·ceil(w/2 / 0,5) tablas deck / deck.alt en LOD0; lisas en LOD1', () => {
    const r = model.recipe;
    const look = SHIP_LOOKS[r.look];
    for (const box of r.boxes.filter((b) => b.kind === 'castle')) {
      const [w, h, d] = box.size;
      const top = box.pos[1] + h / 2;
      const n = 2 * Math.ceil(w / 2 / 0.5);
      model.lods.forEach((geometry, lod) => {
        const pos = geometry.getAttribute('position');
        const color = geometry.getAttribute('color');
        let count = 0;
        const colors = new Set<string>();
        for (let t = 0; t < pos.count / 3; t++) {
          const vs = [3 * t, 3 * t + 1, 3 * t + 2];
          if (!vs.every((v) => Math.abs(pos.getY(v) - top) < 1e-6 && Math.abs(pos.getX(v) - box.pos[0]) <= w / 2 + 1e-6 && Math.abs(pos.getZ(v) - box.pos[2]) <= d / 2 + 1e-6)) continue;
          count++;
          colors.add(sameColor(color, vs[0], look.deck) ? 'deck' : sameColor(color, vs[0], look.deckAlt) ? 'deckAlt' : 'otro');
        }
        expect(count).toBe(lod === 0 ? 2 * n : 2);
        expect([...colors].sort()).toEqual(lod === 0 ? ['deck', 'deckAlt'] : ['deck']);
      });
    }
  });

  test('D36/D37: rejillas de las velas (paños de ≈ 0,7 m, o 0,6 m con la paleta pirata; foque y latina por filas) en LOD0, lisas en LOD1', () => {
    const r = model.recipe;
    const look = SHIP_LOOKS[r.look];
    const pirate = r.look === 'pirate'; // D37: paños de 0,6 m y filas de 0,75 m
    const d = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const zy = (p: readonly [number, number]) => [0, p[1], p[0]];
    // Triángulos esperados por vela, en el orden de construcción: por mástil, cuadras, cangreja y latina; luego los foques
    const expected: [number, number][] = [];
    const rows = r.sailStyle === 'striped' ? 5 : 3;
    for (const mast of r.masts) {
      for (const s of mast.squares ?? []) {
        const nx = pirate ? Math.max(4, 4 * Math.round(s.w / 2.4)) : r.sailStyle === 'notched' ? Math.max(4, 4 * Math.round(s.w / 2.8)) : Math.max(4, 2 * Math.round(s.w / 1.4));
        expected.push([2 * nx * rows, 2 * 4 * rows]);
      }
      if (mast.gaff) expected.push([2 * Math.max(2, Math.round(d(zy(mast.gaff.A), zy(mast.gaff.D)) / (pirate ? 0.6 : 0.7))) * 3, 4]);
      if (mast.lateen) expected.push([2 * 3 * Math.max(2, Math.round(d(zy(mast.lateen.A), zy(mast.lateen.C)) / (pirate ? 0.75 : 0.9))) - 3, 3]); // la fila del pico degenera
    }
    const bs = r.bowsprit + 1;
    const tip = [0, 1.25 * r.F + 0.342 * bs, r.L / 2 - 1 + 0.94 * bs];
    for (const jib of r.jibs) expected.push([2 * 3 * Math.max(2, Math.round(d(jib.T === 'tip' ? tip : jib.T, jib.H) / (pirate ? 0.75 : 0.9))) - 3, 3]);
    // ASSET-SPEC §8.4 (D37): las dos cuadras del pirata llevan 12 columnas
    if (pirate) expect(r.masts.flatMap((m) => m.squares ?? []).map((q) => Math.max(4, 4 * Math.round(q.w / 2.4)))).toEqual([12, 12]);
    model.sails.forEach((ranges, lod) => {
      expect(ranges.map(([a, b]) => b - a)).toEqual(expected.map((e) => e[lod]));
      const color = model.lods[lod].getAttribute('color');
      for (const [a, b] of ranges) {
        let alt = 0;
        let plain = 0;
        for (let v = 3 * a; v < 3 * b; v++) {
          if (sameColor(color, v, look.sailAlt)) alt++;
          if (sameColor(color, v, look.sail)) plain++;
        }
        if (lod === 0) expect(alt > 0 && plain > 0).toBe(true);
        else expect(alt).toBe(0);
      }
    });
  });

  test('D36: porta de 1 quad hacia afuera (2 tris) y cañón sin tapa interior (18 tris) en LOD0; nada en LOD1', () => {
    const r = model.recipe;
    const look = SHIP_LOOKS[r.look];
    const n = r.cannonZ.length * 2;
    model.lods.forEach((geometry, lod) => {
      const pos = geometry.getAttribute('position');
      const color = geometry.getAttribute('color');
      let ports = 0;
      let guns = 0;
      for (let t = 0; t < pos.count / 3; t++) {
        if (sameColor(color, 3 * t, look.gunport)) {
          ports++;
          const p = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, 3 * t + k));
          const normal = new THREE.Vector3().subVectors(p[2], p[1]).cross(new THREE.Vector3().subVectors(p[0], p[1]));
          expect(Math.sign(normal.x)).toBe(Math.sign(p[0].x)); // cara exterior hacia afuera de su banda
        }
        if (sameColor(color, 3 * t, look.cannon)) guns++;
      }
      expect(ports).toBe(lod === 0 ? 2 * n : 0);
      expect(guns).toBe(lod === 0 ? 18 * n : 0);
    });
  });

  test('AS-V17 (D22): la elipse de fuego de cada socket se solapa ≤ 5 % con objetos de cubierta que sobresalen > 0,5 m', () => {
    const r = model.recipe;
    const ax = 0.15 * r.B; // semieje en manga (VFX-SPEC §6)
    const az = 0.06 * r.L; // semieje en eslora
    const N = 120;
    for (const name of ['socket_fire_01', 'socket_fire_02', 'socket_fire_03']) {
      const s = child(name)!.position;
      const surface = s.y - 0.3;
      // Sobre una superestructura, el socket va en su tapa + 0,3 m
      const under = r.boxes.find((b) => b.kind === 'castle' && Math.abs(s.x - b.pos[0]) <= b.size[0] / 2 && Math.abs(s.z - b.pos[2]) <= b.size[2] / 2);
      if (under) expect(s.y).toBeCloseTo(under.pos[1] + under.size[1] / 2 + 0.3, 5);
      // Obstáculos: cajas (castillos, carga, faroles) y barriles (cilindro de r 0,45 y 1 m de alto); sin mástiles ni jarcia
      const boxes = r.boxes.filter((b) => b.pos[1] + b.size[1] / 2 - surface > 0.5);
      const barrels = r.barrels.filter((p) => p[1] + 0.5 - surface > 0.5);
      let inside = 0;
      let hit = 0;
      for (let a = 0; a <= N; a++) {
        for (let b = 0; b <= N; b++) {
          const dx = ((2 * a) / N - 1) * ax;
          const dz = ((2 * b) / N - 1) * az;
          if ((dx / ax) ** 2 + (dz / az) ** 2 > 1) continue;
          inside++;
          const x = s.x + dx;
          const z = s.z + dz;
          const blocked = boxes.some((o) => Math.abs(x - o.pos[0]) <= o.size[0] / 2 && Math.abs(z - o.pos[2]) <= o.size[2] / 2) ||
            barrels.some((p) => Math.hypot(x - p[0], z - p[2]) <= 0.45);
          if (blocked) hit++;
        }
      }
      expect({ name, overlap: hit / inside <= 0.05 ? 'ok' : hit / inside }).toEqual({ name, overlap: 'ok' });
    }
  });
});

// D36 (ART-DIRECTION §4.2–4.2.1): pasos de L* de los alternos, medidos sobre los hex en pantalla
describe('Paleta de tablas y paños (D36)', () => {
  const L = (hex: string) => {
    const c = new THREE.Color(hex); // lineal
    const Y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
  };

  test('tablas a ±7 de L* de la cubierta en pantalla (#C9965E; pirata #6E4B30), con su albedo compensado', () => {
    expect(L(TOP_FACE.deck.target) - L('#C9965E')).toBeCloseTo(7, 0);
    expect(L(TOP_FACE.deckAlt.target) - L('#C9965E')).toBeCloseTo(-7, 0);
    expect(L(TOP_FACE.deckPirate.target) - L('#6E4B30')).toBeCloseTo(7, 0);
    expect(L(TOP_FACE.deckAltPirate.target) - L('#6E4B30')).toBeCloseTo(-7, 0);
    expect(SHIP_LOOKS.player.deck).toBe(TOP_FACE.deck.albedo);
    expect(SHIP_LOOKS.player.deckAlt).toBe(TOP_FACE.deckAlt.albedo);
    expect(SHIP_LOOKS.pirate.deck).toBe(TOP_FACE.deckPirate.albedo);
    expect(SHIP_LOOKS.merchant.deckAlt).toBe(TOP_FACE.deckAlt.albedo);
  });

  test('sail.alt: jugador ΔL* −12 sin bajar de 80 (AD-10); pirata #0D0D0F; mercante #D9CEB6', () => {
    expect(L(SHIP_LOOKS.player.sailAlt) - L(SHIP_LOOKS.player.sail)).toBeCloseTo(-12, 0);
    expect(L(SHIP_LOOKS.player.sailAlt)).toBeGreaterThanOrEqual(80);
    expect(SHIP_LOOKS.pirate.sailAlt).toBe('#0D0D0F');
    expect(SHIP_LOOKS.merchant.sailAlt).toBe('#D9CEB6');
  });
});

describe('Islas y props procedurales', () => {
  const islands = buildIslands(ISLANDS);

  test('AS-V16: el radio visual en la flotación de cada columna de la playa está entre 0,94r y 1,00r', () => {
    for (const island of ISLANDS) {
      const radii = islands.waterlineRadii[island.id];
      expect(radii.length).toBeGreaterThanOrEqual(12);
      for (const r of radii) {
        expect(r).toBeGreaterThanOrEqual(0.94 * island.radius - 1e-9);
        expect(r).toBeLessThanOrEqual(island.radius + 1e-9);
      }
    }
  });

  // D7: "lo que parece sólido es sólido": nada por encima del agua fuera de r + 0,5 m de su isla
  const outside = (x: number, z: number) => Math.min(...ISLANDS.map((i) => Math.hypot(x - i.x, z - i.z) - i.radius));

  test('AS-V16 (D7): ningún vértice sobre el agua de islas, rocas, muelles y pueblo queda fuera de r + 0,5 m', () => {
    const pos = islands.geometry.getAttribute('position');
    let worst = -Infinity;
    for (let v = 0; v < pos.count; v++) {
      if (pos.getY(v) <= 0) continue;
      worst = Math.max(worst, outside(pos.getX(v), pos.getZ(v)));
    }
    expect(worst).toBeLessThanOrEqual(0.5);
  });

  test('AS-V16 (D7): ninguna hoja ni tronco de palmera sobre el agua queda fuera de r + 0,5 m', () => {
    const palm = buildPalmGeometry().getAttribute('position');
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    let worst = -Infinity;
    for (const p of islands.palms) {
      m.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rotY, 0)), new THREE.Vector3().setScalar(p.scale));
      for (let i = 0; i < palm.count; i++) {
        v.fromBufferAttribute(palm, i).applyMatrix4(m);
        if (v.y > 0) worst = Math.max(worst, outside(v.x, v.z));
      }
    }
    expect(worst).toBeLessThanOrEqual(0.5);
  });

  test('§5: islas ≤ 900 triángulos, puerto ≤ 2 000, todo fusionado en una geometría', () => {
    for (const island of ISLANDS) {
      expect(islands.triangles[island.id]).toBeLessThanOrEqual(island.id === 'PORT' ? 2000 : 900);
    }
    expect(islands.geometry.groups).toHaveLength(0);
  });

  test('§5: palmera ≤ 100, boya ≤ 48 y caja de restos ≤ 48 triángulos', () => {
    expect(tris(buildPalmGeometry())).toBeLessThanOrEqual(100);
    expect(tris(buildBuoyGeometry())).toBeLessThanOrEqual(48);
    expect(tris(buildLootGeometry())).toBeLessThanOrEqual(48);
  });
});

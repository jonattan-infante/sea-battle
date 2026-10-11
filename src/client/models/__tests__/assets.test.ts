// AS-V15 (ASSET-SPEC §11): las comprobaciones AS-V02…V09 aplicadas al Object3D procedural de las 5 recetas P0,
// más AS-V16 (radio de las islas en la flotación) y los presupuestos de islas y props de §5. Sin WebGL.
import * as THREE from 'three';
import { ISLANDS } from '../../../game/constants';
import { buildBuoyGeometry, buildIslands, buildLootGeometry, buildPalmGeometry } from '../island-geometry';
import { SHIP_LOOKS } from '../../art';
import { buildShipAsset, getShipModel, ShipExtras } from '../ship-geometry';

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

  test('AS-V14 (base): los rangos de vela de cada LOD solo contienen vértices del color de vela o de franja', () => {
    const look = SHIP_LOOKS[model.recipe.look];
    const allowed = [look.sail, look.sailStripe].filter((c): c is string => !!c).map((hex) => new THREE.Color(hex));
    model.lods.forEach((geometry, lod) => {
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

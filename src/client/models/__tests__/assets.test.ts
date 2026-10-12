// AS-V15 (ASSET-SPEC §11): las comprobaciones AS-V02…V09 aplicadas al Object3D procedural de las 5 recetas P0,
// más AS-V16 (radio de las islas en la flotación) y los presupuestos de islas y props de §5. Sin WebGL.
import * as THREE from 'three';
import { ISLANDS } from '../../../game/constants';
import { buildBuoyGeometry, buildIslands, buildLootGeometry, buildPalmGeometry } from '../island-geometry';
import { SHIP_LOOKS, TOP_FACE } from '../../art';
import { buildShipAsset, clothTones, deckHalfBeam, deckY, getShipModel, ShipExtras, shipLook } from '../ship-geometry';

const CLASSES = ['sloop', 'brig', 'frigate', 'pirate', 'merchant', 'captain'] as const;
const BUDGET = { ship: [2500, 800], npc: [2000, 700] } as const;
const BUDGET_BY_ID: Record<string, readonly [number, number]> = { npc_pirate_captain: [2500, 800] }; // §5: el Capitán pirata, NPC con presupuesto propio
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
    const [b0, b1] = BUDGET_BY_ID[id] ?? BUDGET[extras.sb_kind];
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
    const hull = new THREE.Color(shipLook(model.recipe).hull);
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

  test('AS-V14 (base): los rangos de vela de cada LOD solo contienen vértices de los tonos de lona o de franja (LOD1: sail.lod1)', () => {
    const look = shipLook(model.recipe);
    model.lods.forEach((geometry, lod) => {
      const tones = lod === 0 ? [look.sail, look.sailMid, look.sailAlt] : [look.sailLod1];
      const allowed = [...tones, look.sailStripe].filter((c): c is string => !!c).map((hex) => new THREE.Color(hex));
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
    const look = shipLook(model.recipe);
    const [lod0, lod1] = model.lods;
    expect(colorCount(lod0, look.deckAlt)).toBeGreaterThan(0);
    expect(colorCount(lod1, look.deckAlt)).toBe(0);
    expect(colorCount(lod1, look.deckAlt, 0.85)).toBe(0);
    expect(colorCount(lod0, look.hull, 0.85)).toBeGreaterThan(0); // borde inferior de V2–V3
    expect(colorCount(lod0, look.mast, 0.85)).toBeGreaterThan(0); // collar de 0,4 m de los mástiles
    // Las velas llevan paños; el mercante, solo en las filas crema. LOD1, lisa en sail.lod1 (D40)
    expect(colorCount(lod0, look.sailAlt)).toBeGreaterThan(0);
    expect(colorCount(lod1, look.sailAlt)).toBe(0);
    expect(colorCount(lod1, look.sail)).toBe(0);
    expect(colorCount(lod1, look.sailLod1)).toBeGreaterThan(0);
  });

  test('D40 (O-8): LOD1 pinta la cubierta y las tapas lisas con el albedo de la media de las tablas, sin deck ni deck.alt', () => {
    const look = shipLook(model.recipe);
    const [lod0, lod1] = model.lods;
    expect(look.deckLod1).toBe(model.recipe.look === 'pirate' ? '#67462D' : '#BD8D59');
    expect(colorCount(lod1, look.deckLod1)).toBeGreaterThan(0);
    expect(colorCount(lod1, look.deck)).toBe(0);
    expect(colorCount(lod0, look.deckLod1)).toBe(0); // LOD0: la media sale de las tablas
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
    const look = shipLook(r);
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
    const look = shipLook(r);
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
          colors.add(sameColor(color, vs[0], look.deck) ? 'deck' : sameColor(color, vs[0], look.deckAlt) ? 'deckAlt' : sameColor(color, vs[0], look.deckLod1) ? 'deckLod1' : 'otro');
        }
        expect(count).toBe(lod === 0 ? 2 * n : 2);
        expect([...colors].sort()).toEqual(lod === 0 ? ['deck', 'deckAlt'] : ['deckLod1']);
      });
    }
  });

  // Paños esperados por vela (ASSET-SPEC §8.2, D40), en el orden de construcción (por mástil: cuadras, cangreja y latina;
  // luego los foques): n paños y triángulos de LOD0 y LOD1. Jugador: paño de 0,55 m; paleta pirata, 0,5 m (cuadras en
  // múltiplo de 4); mercante, 0,7 m y filas de 0,9 m en foque y latina. Foques y latinas con 3 tonos: paños radiales
  // × 3 filas, con la fila de la cabeza degenerada (1 triángulo por paño)
  const d3 = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const zy = (p: readonly [number, number]) => [0, p[1], p[0]];
  const sailPlan = () => {
    const r = model.recipe;
    const threeTones = r.look !== 'merchant';
    const p = r.look === 'pirate' ? 0.5 : r.look === 'merchant' ? 0.7 : 0.55;
    const plan: { kind: string; n: number; tris: [number, number] }[] = [];
    const rows = r.sailStyle === 'striped' ? 5 : r.sailStyle === 'banded' ? 4 : 3;
    for (const mast of r.masts) {
      for (const s of mast.squares ?? []) {
        const nx = r.look === 'pirate' ? Math.max(4, 4 * Math.round(s.w / 2.0)) : r.look === 'merchant' ? Math.max(4, 2 * Math.round(s.w / 1.4)) : Math.max(4, 2 * Math.round(s.w / 1.1));
        plan.push({ kind: 'cuadra', n: nx, tris: [2 * nx * rows, 2 * 4 * rows] });
      }
      if (mast.gaff) {
        const nu = Math.max(2, Math.round(d3(zy(mast.gaff.A), zy(mast.gaff.D)) / p));
        plan.push({ kind: 'cangreja', n: nu, tris: [2 * nu * 3, 4] });
      }
      if (mast.lateen) {
        const { A, B, C } = mast.lateen;
        const nu = Math.max(2, Math.round(d3(zy(A), zy(B)) / p));
        const nv = Math.max(2, Math.round(d3(zy(A), zy(C)) / 0.9));
        plan.push(threeTones ? { kind: 'latina', n: nu, tris: [5 * nu, 3] } : { kind: 'latina', n: nv, tris: [2 * 3 * nv - 3, 3] });
      }
    }
    const bs = r.bowsprit + 1;
    const tip = [0, 1.25 * r.F + 0.342 * bs, r.L / 2 - 1 + 0.94 * bs];
    for (const jib of r.jibs) {
      const T = jib.T === 'tip' ? tip : jib.T;
      const nu = Math.max(2, Math.round(d3(T, jib.C) / p));
      const nv = Math.max(2, Math.round(d3(T, jib.H) / 0.9));
      plan.push(threeTones ? { kind: 'foque', n: nu, tris: [5 * nu, 3] } : { kind: 'foque', n: nv, tris: [2 * 3 * nv - 3, 3] });
    }
    return plan;
  };

  test('D40: rejillas de las velas (paños de 0,55 m, 0,5 m en la paleta pirata; foques y latinas radiales × 3 filas; mercante como en D36) en LOD0, lisas en LOD1', () => {
    const plan = sailPlan();
    // ASSET-SPEC §8.4: las dos cuadras del pirata llevan 16 y 12 columnas (paños de 0,48 y 0,5 m), y las 5 del Capitán, 20,
    // 16, 24, 20 y 16
    const squares: Record<string, number[]> = { pirate: [16, 12], captain: [20, 16, 24, 20, 16] };
    if (squares[model.classId]) expect(plan.filter((q) => q.kind === 'cuadra').map((q) => q.n)).toEqual(squares[model.classId]);
    model.sails.forEach((ranges, lod) => expect(ranges.map(([a, b]) => b - a)).toEqual(plan.map((q) => q.tris[lod])));
  });

  // AS-V21 (a) (D40): en cada vela de LOD0 con n ≥ 3 paños, solo los 3 tonos de la paleta, dos paños vecinos nunca del
  // mismo tono y cada tono en ⌊n/3⌋ o ⌈n/3⌉ paños. Los paños salen de la geometría: triángulos del mismo color que
  // comparten una arista forman un paño; si dos vecinos repitieran tono se fundirían y saldrían menos de n
  if (model.recipe.look !== 'merchant') test('AS-V21 (a): 3 tonos barajados por vela, sin vecinos iguales y repartidos ⌊n/3⌋–⌈n/3⌉', () => {
    const look = shipLook(model.recipe);
    const tones = [look.sail, look.sailMid!, look.sailAlt].map((h) => new THREE.Color(h));
    const geometry = model.lods[0];
    const pos = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const key = (v: number) => `${pos.getX(v).toFixed(4)},${pos.getY(v).toFixed(4)},${pos.getZ(v).toFixed(4)}`;
    const toneOf = (v: number) => tones.findIndex((c) => Math.abs(c.r - color.getX(v)) + Math.abs(c.g - color.getY(v)) + Math.abs(c.b - color.getZ(v)) < 1e-4);
    // La franja roja del Capitán (D46) no es lona: queda fuera de los paños
    const stripe = look.sailStripe ? new THREE.Color(look.sailStripe) : null;
    const isStripe = (t: number) => !!stripe && [0, 1, 2].every((k) => Math.abs(stripe.r - color.getX(3 * t + k)) + Math.abs(stripe.g - color.getY(3 * t + k)) + Math.abs(stripe.b - color.getZ(3 * t + k)) < 1e-4);
    const plan = sailPlan();
    model.sails[0].forEach(([t0, t1], s) => {
      const n = plan[s].n;
      if (n < 3) return;
      const parent = Array.from({ length: t1 - t0 }, (_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      const tone: number[] = [];
      const edges = new Map<string, number[]>();
      for (let t = t0; t < t1; t++) {
        if (isStripe(t)) {
          tone.push(-1);
          continue;
        }
        const tt = [toneOf(3 * t), toneOf(3 * t + 1), toneOf(3 * t + 2)];
        expect(tt[0]).toBeGreaterThanOrEqual(0); // (1) solo los 3 tonos
        expect(tt[1]).toBe(tt[0]); // cada paño es de un solo color
        expect(tt[2]).toBe(tt[0]);
        tone.push(tt[0]);
        const k = [key(3 * t), key(3 * t + 1), key(3 * t + 2)];
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
          const e = [k[a], k[b]].sort().join('|');
          edges.set(e, [...(edges.get(e) ?? []), t - t0]);
        }
      }
      for (const ts of edges.values()) for (const t of ts.slice(1)) if (tone[t] === tone[ts[0]]) parent[find(t)] = find(ts[0]);
      const cloths = new Map<number, number>(); // raíz → tono
      tone.forEach((c, i) => { if (c >= 0) cloths.set(find(i), c); });
      expect({ vela: s, tipo: plan[s].kind, paños: cloths.size }).toEqual({ vela: s, tipo: plan[s].kind, paños: n }); // (2) sin vecinos iguales
      for (const ts of edges.values()) for (const t of ts.slice(1)) if (find(t) !== find(ts[0])) expect(tone[t]).not.toBe(tone[ts[0]]);
      const count = [0, 1, 2].map((c) => [...cloths.values()].filter((v) => v === c).length);
      for (const c of count) expect(c === Math.floor(n / 3) || c === Math.ceil(n / 3)).toBe(true); // (3)
    });
  });

  // ASSET-SPEC §8.4 y §7 (I2, D45, D46): rasgos del Capitán. En los dos LOD, el estandarte de 6,0 × 4,0 m en `flagMark`
  // con el cuadro de 2,0 m en `flag` en las dos caras, a popa del palo mayor (rasgo de identidad, AD-28), y la fila
  // inferior de cada cuadra de franja en `sailStripe` = `band`; el mascarón en `trim` delante de la roda, solo en LOD0
  if (classId === 'captain') test('I2: estandarte y franja roja del Capitán en LOD0 y LOD1; mascarón solo en LOD0', () => {
    const look = shipLook(model.recipe);
    model.lods.forEach((geometry, lod) => {
      const pos = geometry.getAttribute('position');
      const color = geometry.getAttribute('color');
      const area = (hex: string, keep: (c: THREE.Vector3) => boolean = () => true) => {
        let a = 0;
        for (let t = 0; t < pos.count / 3; t++) {
          if (![0, 1, 2].every((k) => sameColor(color, 3 * t + k, hex))) continue;
          const p = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, 3 * t + k));
          if (!keep(p[0].clone().add(p[1]).add(p[2]).divideScalar(3))) continue;
          a += new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).length() / 2;
        }
        return a;
      };
      const aloft = (c: THREE.Vector3) => c.y > 18 && c.z < 0;
      expect({ lod, campo: area(look.flagMark!, aloft) }).toEqual({ lod, campo: expect.closeTo(24, 3) });
      expect({ lod, cuadro: area(look.flag, aloft) }).toEqual({ lod, cuadro: expect.closeTo(8, 3) });
      expect({ lod, mascarón: area(look.trim, (c) => c.z > 14.6) }).toEqual({ lod, mascarón: lod === 0 ? expect.closeTo(2 * (0.6 * 1.0 + 1.0 * 1.2 + 0.6 * 1.2), 3) : 0 });
      expect(look.sailStripe).toBe(look.band);
      let red = 0;
      for (const [t0, t1] of model.sails[lod]) for (let t = t0; t < t1; t++) if (sameColor(color, 3 * t, look.sailStripe!)) red++;
      const squares = model.recipe.masts.flatMap((m) => m.squares ?? []);
      const nx = lod === 0 ? [20, 16, 24, 20, 16] : squares.map(() => 4);
      expect({ lod, filaRoja: red }).toEqual({ lod, filaRoja: nx.reduce((a, n) => a + 2 * n, 0) });
    });
  });

  test('D36: porta de 1 quad hacia afuera (2 tris) y cañón sin tapa interior (18 tris) en LOD0; nada en LOD1', () => {
    const r = model.recipe;
    const look = shipLook(r);
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
describe('Paleta de tablas y lona (D36, D40)', () => {
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

  test('D40: tonos de lona (§4.2): L* 96,1 / 86,2 / 76,1 en el jugador y 31,2 / 20,0 / 7,5 en el pirata; sail.mid, punto medio en sRGB', () => {
    expect([SHIP_LOOKS.player.sail, SHIP_LOOKS.player.sailMid, SHIP_LOOKS.player.sailAlt]).toEqual(['#FBF3E3', '#DED7C8', '#C2BBAC']);
    expect([SHIP_LOOKS.pirate.sail, SHIP_LOOKS.pirate.sailMid, SHIP_LOOKS.pirate.sailAlt]).toEqual(['#4A494D', '#303033', '#171619']);
    expect([SHIP_LOOKS.player.sail, SHIP_LOOKS.player.sailMid!, SHIP_LOOKS.player.sailAlt].map((h) => Math.round(L(h) * 10) / 10)).toEqual([96.1, 86.2, 76.1]);
    expect([SHIP_LOOKS.pirate.sail, SHIP_LOOKS.pirate.sailMid!, SHIP_LOOKS.pirate.sailAlt].map((h) => Math.round(L(h) * 10) / 10)).toEqual([31.2, 20, 7.5]);
    const byte = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
    for (const look of [SHIP_LOOKS.player, SHIP_LOOKS.pirate]) {
      for (let i = 0; i < 3; i++) expect(Math.abs(byte(look.sailMid!, i) - (byte(look.sail, i) + byte(look.sailAlt, i)) / 2)).toBeLessThanOrEqual(1);
    }
    // El mercante no cambia (D9): 2 tonos alternos
    expect([SHIP_LOOKS.merchant.sail, SHIP_LOOKS.merchant.sailMid, SHIP_LOOKS.merchant.sailAlt]).toEqual(['#EADFC6', null, '#D9CEB6']);
  });

  test('D40 (O-8): sail.lod1 = media lineal de los tonos de LOD0 (±1/255) y cubierta de LOD1 = albedo de la media de las tablas', () => {
    const mean = (hexes: string[]) => {
      const cs = hexes.map((h) => new THREE.Color(h)); // lineal
      return new THREE.Color(cs.reduce((a, c) => a + c.r, 0) / cs.length, cs.reduce((a, c) => a + c.g, 0) / cs.length, cs.reduce((a, c) => a + c.b, 0) / cs.length).getHexString();
    };
    const near = (a: string, b: string) => [0, 1, 2].every((i) => Math.abs(parseInt(a.slice(2 * i, 2 * i + 2), 16) - parseInt(b.slice(1 + 2 * i, 3 + 2 * i), 16)) <= 1);
    expect(near(mean([SHIP_LOOKS.player.sail, SHIP_LOOKS.player.sailMid!, SHIP_LOOKS.player.sailAlt]), SHIP_LOOKS.player.sailLod1)).toBe(true);
    expect(near(mean([SHIP_LOOKS.pirate.sail, SHIP_LOOKS.pirate.sailMid!, SHIP_LOOKS.pirate.sailAlt]), SHIP_LOOKS.pirate.sailLod1)).toBe(true);
    expect(near(mean([SHIP_LOOKS.merchant.sail, SHIP_LOOKS.merchant.sailAlt]), SHIP_LOOKS.merchant.sailLod1)).toBe(true);
    expect([SHIP_LOOKS.player.sailLod1, SHIP_LOOKS.pirate.sailLod1, SHIP_LOOKS.merchant.sailLod1]).toEqual(['#E0D9C9', '#353438', '#E2D7BE']);
    expect([TOP_FACE.deckMean.albedo, TOP_FACE.deckMeanPirate.albedo]).toEqual(['#BD8D59', '#67462D']);
    expect([SHIP_LOOKS.player.deckLod1, SHIP_LOOKS.merchant.deckLod1, SHIP_LOOKS.pirate.deckLod1]).toEqual(['#BD8D59', '#BD8D59', '#67462D']);
  });

  test('§8.2.1: el orden de tonos es determinista, sin vecinos iguales y con cada tono en ⌊n/3⌋–⌈n/3⌉ paños', () => {
    for (const id of ['ship_sloop', 'ship_frigate', 'npc_pirate']) {
      for (let sail = 0; sail < 12; sail++) {
        for (let n = 1; n <= 30; n++) {
          const t = clothTones(id, sail, n);
          expect(t).toEqual(clothTones(id, sail, n));
          expect(t).toHaveLength(n);
          for (let i = 1; i < n; i++) expect(t[i]).not.toBe(t[i - 1]);
          for (const c of [0, 1, 2]) {
            const k = t.filter((v) => v === c).length;
            expect(k === Math.floor(n / 3) || k === Math.ceil(n / 3)).toBe(true);
          }
          if (n === 30) expect(clothTones(id, sail, 12)).toEqual(t.slice(0, 12)); // un prefijo no depende de n
        }
      }
    }
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

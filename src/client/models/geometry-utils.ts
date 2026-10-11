// Acumulador de triángulos con color por vértice: fusiona piezas en una sola geometría (1 draw call).
// Todo sale no indexado, con atributos position, normal y color (lineal), como pide ASSET-SPEC §8.
import * as THREE from 'three';

export type Vec3 = [number, number, number];
export type VertexColorFn = (x: number, y: number, z: number, triangle: number) => THREE.Color;

const MIN_AREA = 1e-6;
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const ab = new THREE.Vector3();
const ac = new THREE.Vector3();

const colorCache = new Map<string, THREE.Color>();

// THREE.Color desde un hex sRGB, convertido a lineal y cacheado
export function lin(hex: string): THREE.Color {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

export class GeoBuilder {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly box = new THREE.Box3();
  private boxTracking = false;
  // Rangos de triángulos [inicio, fin) añadidos dentro de mark() (las velas, para AS-V14)
  readonly marks: [number, number][] = [];

  get triangles(): number {
    return this.pos.length / 9;
  }

  mark(fn: () => void): void {
    const t0 = this.triangles;
    fn();
    if (this.triangles > t0) this.marks.push([t0, this.triangles]);
  }

  // Caja envolvente de lo añadido entre beginBox() y endBox() (para medir solo el casco, AS-V03)
  beginBox(): void {
    this.box.makeEmpty();
    this.boxTracking = true;
  }

  endBox(): THREE.Box3 {
    this.boxTracking = false;
    return this.box.clone();
  }

  tri(a: Vec3, b: Vec3, c: Vec3, color: THREE.Color, colorB = color, colorC = color): void {
    va.fromArray(a);
    vb.fromArray(b);
    vc.fromArray(c);
    ab.subVectors(vb, va);
    ac.subVectors(vc, va);
    if (ab.cross(ac).length() * 0.5 < MIN_AREA) return; // quads degenerados en la proa
    this.push(va, color);
    this.push(vb, colorB);
    this.push(vc, colorC);
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: THREE.Color): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  // Añade una geometría de three transformada; el color es fijo o por vértice
  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color | VertexColorFn, skipTriangle?: (t: number) => boolean): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.getAttribute('position');
    const fn = typeof color === 'function' ? color : null;
    for (let i = 0; i + 2 < p.count; i += 3) {
      const t = i / 3;
      if (skipTriangle?.(t)) continue;
      va.fromBufferAttribute(p, i);
      vb.fromBufferAttribute(p, i + 1);
      vc.fromBufferAttribute(p, i + 2);
      const ca = fn ? fn(va.x, va.y, va.z, t).clone() : (color as THREE.Color);
      const cb = fn ? fn(vb.x, vb.y, vb.z, t).clone() : (color as THREE.Color);
      const cc = fn ? fn(vc.x, vc.y, vc.z, t).clone() : (color as THREE.Color);
      va.applyMatrix4(matrix);
      vb.applyMatrix4(matrix);
      vc.applyMatrix4(matrix);
      this.tri(va.toArray() as Vec3, vb.toArray() as Vec3, vc.toArray() as Vec3, ca, cb, cc);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals(); // no indexada → normales planas por cara
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  private push(v: THREE.Vector3, c: THREE.Color): void {
    this.pos.push(v.x, v.y, v.z);
    this.col.push(c.r, c.g, c.b);
    if (this.boxTracking) this.box.expandByPoint(v);
  }
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const s = new THREE.Vector3();
const t = new THREE.Vector3();

// Matriz TRS reutilizable (rotación en radianes, orden XYZ salvo que se indique)
export function trs(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order: THREE.EulerOrder = 'XYZ'): THREE.Matrix4 {
  e.set(rx, ry, rz, order);
  q.setFromEuler(e);
  t.set(x, y, z);
  s.set(sx, sy, sz);
  return m4.clone().compose(t, q, s);
}

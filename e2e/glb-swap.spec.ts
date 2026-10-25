// AC-193 (a), lo que comprueba QA al cambiar al GLB (BACKLOG, AC-193 a: «Sockets de los barcos de la receta» y «Cajas: casco
// sí, aparejo no»): con el Capitán de D91, cuyo GLB trae sus sockets, su palo y su volumen de clic (la Cañonera, sin entrada
// en SHIP_GLB: BACKLOG :421). Un fuego o un humo encendidos siguen en el socket del GLB desde el frame del cambio, sin
// duplicarse ni quedarse en el sitio viejo; la placa, la vida y el anillo se mueven a lo sumo una vez y en ese frame; un
// barco seleccionado sigue seleccionado; la eslora y la manga de la vista (las de la clase) no cambian. El GLB se retiene
// con page.route hasta que todo está encendido, y un envoltorio de runtime.frame apunta cada frame: el modelo, los puntos
// de emisión en coordenadas del barco, la placa y los anillos que se dibujan en su sitio
import { expect, Page, test } from '@playwright/test';
import { LEGIBILITY_I2 } from '../server/scenarios';
import { SHIP_GLB } from '../src/client/models/ship-glb';
import { DebugShip, enterGame, me, waitFor } from './helpers';
import { sailTo } from './net';
import { startOwnServer } from './own-server';

const CAPTAIN_GLB = SHIP_GLB.captain!;

interface Frame {
  n: number;
  glb: boolean; // el modelo de la vista es ya el del GLB
  smoke: number[][]; // puntos de emisión del humo, en coordenadas del barco (m, redondeados a mm)
  fire: number[][]; // de las llamas
  plate: string | null; // transform de la placa (con la barra de vida dentro)
  rings: number[]; // radios de los anillos dibujados en el sitio del barco
  selected: string | null;
  length: number;
  beam: number;
}

// Retiene el GLB del Capitán hasta release()
async function holdCaptainGlb(page: Page): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(`**${CAPTAIN_GLB}`, async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

// Envuelve runtime.frame: apunta un Frame por frame para la vista `id`, en window.__SWAP__
const record = (page: Page, id: string) =>
  page.evaluate((id) => {
    type V3 = { x: number; y: number; z: number; clone(): V3; set(x: number, y: number, z: number): V3; applyMatrix4(m: unknown): V3 };
    type View = { model: { map?: unknown }; mesh: { matrix: { clone(): { invert(): unknown } }; position: V3 }; ship: { x: number; z: number }; length: number; beam: number };
    type Rt = {
      frame(s: unknown, dt: number): void;
      views: Map<string, View>;
      effects: Record<string, (...a: number[]) => void>;
      pushRing(x: number, z: number, radius: number, ...rest: unknown[]): void;
      labels: { byId: Map<string, { root: HTMLElement }> } | null;
    };
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as Rt;
    const frames: Frame[] = [];
    (window as unknown as { __SWAP__: Frame[] }).__SWAP__ = frames;
    let cur: Frame | null = null;
    const local = (x: number, y: number, z: number) => {
      const v = rt.views.get(id)!;
      const p = v.mesh.position.clone().set(x, y, z).applyMatrix4(v.mesh.matrix.clone().invert());
      return [p.x, p.y, p.z].map((c) => Math.round(c * 1000) / 1000);
    };
    for (const [name, key] of [['damageSmoke', 'smoke'], ['flame', 'fire']] as const) {
      const orig = rt.effects[name].bind(rt.effects);
      rt.effects[name] = (...a: number[]) => {
        if (cur) cur[key].push(local(a[0], a[1], a[2]));
        orig(...a);
      };
    }
    const ring = rt.pushRing.bind(rt);
    rt.pushRing = (x, z, radius, ...rest) => {
      const v = rt.views.get(id);
      if (cur && v && Math.hypot(x - v.ship.x, z - v.ship.z) < 1e-6) cur.rings.push(Math.round(radius * 1000) / 1000);
      ring(x, z, radius, ...rest);
    };
    const frame = rt.frame.bind(rt);
    let n = 0;
    rt.frame = (s, dt) => {
      cur = { n: n++, glb: false, smoke: [], fire: [], plate: null, rings: [], selected: null, length: 0, beam: 0 };
      frame(s, dt);
      const v = rt.views.get(id);
      if (!v) return;
      cur.glb = !!v.model.map; // el procedural no lleva textura; el GLB, su respaldo y después su KTX2
      cur.plate = rt.labels?.byId.get(id)?.root.style.transform ?? null;
      cur.selected = (window.__SEA_BATTLE__!.hud() as { selectedId: string | null }).selectedId;
      cur.length = v.length;
      cur.beam = v.beam;
      frames.push(cur);
      cur = null;
    };
  }, id);

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __SWAP__: Frame[] }).__SWAP__);

// Los sockets de humo y de fuego del procedural y del GLB del Capitán, redondeados a mm
const sockets = (page: Page) =>
  page.evaluate(() => {
    type S = { smoke: { toArray(): number[] }; smoke2?: { toArray(): number[] }; fire: { toArray(): number[] }[] };
    const rt = window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { model(c: string): { sockets: S } } };
    const mm = (p: { toArray(): number[] }) => p.toArray().map((c) => Math.round(c * 1000) / 1000);
    const of = (s: S) => ({ smoke: [s.smoke, ...(s.smoke2 ? [s.smoke2] : [])].map(mm), fire: s.fire.map(mm) });
    return of(rt.shipGlb.model('captain').sockets);
  });
const captainLoaded = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { loaded(c: string): boolean } }).shipGlb.loaded('captain')), { timeout: 30_000 })
    .toBe(true);

// Un punto está en un socket si dista ≤ 2 mm (el redondeo de los dos lados)
const at = (p: number[], list: number[][]) => list.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= 0.002);
// Frames en los que una propiedad cambia respecto al anterior
const changes = <T>(list: Frame[], f: (x: Frame) => T) => list.slice(1).filter((x, i) => JSON.stringify(f(x)) !== JSON.stringify(f(list[i]))).map((x) => x.n);

test.describe('AC-193 a: el cambio al GLB del Capitán', () => {
  test('con fuego y humo encendidos, desde el frame del cambio salen en los sockets del GLB, sin duplicarse; la placa y el anillo se mueven a lo sumo una vez, en ese frame', async ({ page }) => {
    test.setTimeout(120_000);
    const release = await holdCaptainGlb(page);
    await enterGame(page);
    const proc = await sockets(page);
    // La escena gallery con el Capitán propio en el foco (anillo propio) y al 10 % de vida: humo denso y fuego en sus 3
    // sockets (≤ 12 %; VFX-SPEC §6, D21)
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__!.runtime();
      rt.setCameraPreset('game');
      rt.setZoomLevel(1);
      const scene = rt.startScene('gallery', { myShipId: 'g-captain' });
      scene.spec.ships.forEach((s, i) => scene.setPose(s.id, scene.focus.x + 2000 * (i + 1), scene.focus.z, s.heading));
      scene.setPose('g-captain', scene.focus.x, scene.focus.z, Math.PI / 2);
      const ship = scene.getShip('g-captain')!;
      ship.hp = Math.round(0.1 * ship.maxHp);
    });
    const puesta = await placaPuesta(page, 'g-captain'); await record(page, 'g-captain');
    await page.waitForTimeout(2_000); const grabadosAntes = await grabados(page, 'antes', 31); // el humo y el fuego, en régimen, con el procedural (2 s como mínimo), y > 30 frames antes del cambio (:154)
    release();
    await captainLoaded(page);
    await page.waitForTimeout(2_000); const grabadosDespues = await grabados(page, 'después', 31); // 2 s como mínimo y > 30 frames desde el cambio (:155)
    const glb = await sockets(page);
    // Sockets del GLB a más de 2 mm de los del procedural: sin ninguno, el test no distinguiría los dos modelos
    const moved = [...glb.smoke.filter((q) => !at(q, proc.smoke)), ...glb.fire.filter((q) => !at(q, proc.fire))].length;
    const list = await frames(page);
    const swap = list.find((f) => f.glb)?.n ?? -1;
    const before = list.filter((f) => f.n < swap);
    const after = list.filter((f) => f.n >= swap);
    const wrong = (fs: Frame[], s: { smoke: number[][]; fire: number[][] }) =>
      fs.filter((f) => f.smoke.some((p) => !at(p, s.smoke)) || f.fire.some((p) => !at(p, s.fire))).map((f) => f.n);
    const used = (fs: Frame[], key: 'smoke' | 'fire', s: number[][]) => s.filter((q) => fs.some((f) => f[key].some((p) => at(p, [q])))).length;
    const summary = {
      frames: list.length, swap, before: before.length, after: after.length, moved,
      smokeBefore: used(before, 'smoke', proc.smoke), smokeAfter: used(after, 'smoke', glb.smoke), fireBefore: used(before, 'fire', proc.fire), fireAfter: used(after, 'fire', glb.fire),
      plateChanges: changes(list, (f) => f.plate), ringChanges: changes(list, (f) => f.rings), rings: [before.at(-1)?.rings, after[0]?.rings],
      sizes: [...new Set(list.map((f) => `${f.length}×${f.beam}`))]
    };
    console.log(`AC-193 a, cambio al GLB del Capitán: ${JSON.stringify(summary)} · sockets procedural ${JSON.stringify(proc)} · GLB ${JSON.stringify(glb)} · grabados ${grabadosAntes.n} antes del cambio (${grabadosAntes.ms} ms tras los 2 s) y ${grabadosDespues.n} desde él (${grabadosDespues.ms} ms tras los 2 s) · la placa, puesta en ${puesta.ms} ms (${puesta.placa})`);
    expect(moved, 'sockets del GLB que no están en el procedural').toBeGreaterThan(0);
    expect(swap).toBeGreaterThan(0);
    expect(before.length).toBeGreaterThan(30); // con frames de sobra a los dos lados
    expect(after.length).toBeGreaterThan(30);
    // Cada frame emite solo en los sockets de su modelo: el viejo hasta el cambio y el del GLB desde ese frame
    expect([wrong(before, proc), wrong(after, glb)]).toEqual([[], []]);
    // El humo del Capitán (uno: el segundo de D25 es de la Cañonera) y los fuegos de vida baja, encendidos a los dos lados
    expect([summary.smokeBefore, summary.smokeAfter, summary.fireBefore, summary.fireAfter]).toEqual([1, 1, 3, 3]);
    for (const c of [summary.plateChanges, summary.ringChanges]) expect(c.length === 0 || (c.length === 1 && c[0] === swap), JSON.stringify(c)).toBe(true);
    expect(summary.sizes).toEqual(['30×8']); // la eslora y la manga de la clase (GDD §6), con los dos modelos
  });

  // El Capitán del escenario "legibility-i2" (quieto y sin IA, a 49 m del puesto propio de AC-115): el jugador navega a ese
  // puesto antes de seleccionarlo, para que el Capitán quede en pantalla con su placa
  test('un Capitán seleccionado sigue seleccionado al llegar su GLB, y su placa y su anillo se mueven a lo sumo una vez, en ese frame', async ({ page }) => {
    test.setTimeout(150_000);
    const server = await startOwnServer({ SEA_BATTLE_NPCS: '0', SEA_BATTLE_I2: '1', SEA_BATTLE_SCENARIO: 'legibility-i2' });
    try {
      const release = await holdCaptainGlb(page);
      await enterGame(page, server.url);
      await sailTo(page, LEGIBILITY_I2.self.x, LEGIBILITY_I2.self.z);
      await waitFor(() => me(page), (s) => !!s && Math.hypot(s.x - LEGIBILITY_I2.self.x, s.z - LEGIBILITY_I2.self.z) < 4, 45_000, 200); const quieto = await parado(page, LEGIBILITY_I2.self);
      const id = await page.evaluate(() => (window.__SEA_BATTLE__!.ships() as { id: string; classId: string }[]).find((s) => s.classId === 'captain')?.id ?? null);
      expect(id).not.toBeNull();
      await page.evaluate((id) => window.__SEA_BATTLE__!.select(id), id!);
      await record(page, id!);
      await page.waitForTimeout(1_500);
      release();
      await captainLoaded(page);
      await page.waitForTimeout(1_500);
      const list = await frames(page);
      const swap = list.find((f) => f.glb)?.n ?? -1;
      const summary = { frames: list.length, swap, selected: [...new Set(list.map((f) => f.selected))], withPlate: list.filter((f) => f.plate !== null).length, plateChanges: changes(list, (f) => f.plate), ringChanges: changes(list, (f) => f.rings), sizes: [...new Set(list.map((f) => `${f.length}×${f.beam}`))] };
      console.log(`AC-193 a, Capitán seleccionado: ${JSON.stringify(summary)} · el barco propio, parado en ${quieto.ms} ms a ${quieto.dist.toFixed(2)} m del puesto`);
      expect(swap).toBeGreaterThan(0);
      expect(summary.selected).toEqual([id]);
      expect(summary.withPlate, 'frames con la placa del Capitán').toBe(list.length);
      expect(list.at(-1)!.rings.length).toBeGreaterThan(0); // el anillo de la selección, en su sitio
      for (const c of [summary.plateChanges, summary.ringChanges]) expect(c.length === 0 || (c.length === 1 && c[0] === swap), JSON.stringify(c)).toBe(true);
      expect(summary.sizes).toEqual(['30×8']);
    } finally {
      await server.kill();
    }
  });
});

// El barco propio llega al puesto frenando y la cámara, que lo sigue, mueve la placa en pantalla (turno ff9b1c7: 17 px en
// 130 frames). Antes de grabar se espera a que se pare: 2 lecturas de me() seguidas, a 500 ms, a menos de 1 mm; si no se
// para en 15 s, waitFor lanza un error. Devuelve cuánto tardó y a qué distancia del puesto quedó, para el registro
async function parado(page: Page, post: { x: number; z: number }): Promise<{ ms: number; dist: number }> {
  const t0 = Date.now();
  let last: DebugShip | null = null;
  const s = await waitFor(() => me(page), (s) => {
    const still = !!s && !!last && Math.hypot(s.x - last.x, s.z - last.z) < 0.001;
    last = s;
    return still;
  }, 15_000, 500);
  return { ms: Date.now() - t0, dist: s ? Math.hypot(s.x - post.x, s.z - post.z) : NaN };
}

// Tras startScene, la placa de un barco nuevo no tiene sitio hasta la primera pasada del declutter, a 10 Hz (overlays.ts:250-256
// y :409-413): position() no escribe en una placa oculta (:512-514), así que su transform sigue vacío, o con el de otro
// barco si la placa del pool ya se usó, y su primera escritura cuenta como un movimiento (turno f2d1c3d: '' en los frames
// 0–4 y la placa en el 5). Antes de grabar se espera a que esté puesta: visible, con transform y 2 lecturas seguidas
// iguales, a 200 ms (más que una pasada de 100 ms); si no en 15 s, waitFor lanza un error. Devuelve cuánto tardó y la placa,
// para el registro
async function placaPuesta(page: Page, id: string): Promise<{ ms: number; placa: string }> {
  const t0 = Date.now();
  let last = '';
  const placa = await waitFor(() => page.evaluate((id) => {
    const root = (window.__SEA_BATTLE__!.runtime() as unknown as { labels: { byId: Map<string, { root: HTMLElement }> } | null }).labels?.byId.get(id)?.root;
    return root ? `${root.style.display} ${root.style.transform}` : '';
  }, id), (p) => {
    const puesta = p.startsWith('block translate3d(') && p === last;
    last = p;
    return puesta;
  }, 15_000, 200);
  return { ms: Date.now() - t0, placa };
}

// :154 y :155 piden > 30 frames a cada lado del cambio. En la CI (llvmpipe, run 40119428123) los 2 s de las :131 y :134
// dieron 36 frames antes del cambio y 21 desde él: ~10 frames/s tras el cambio (21 en ~2 s). Los 2 s siguen como mínimo (el
// humo y el fuego en régimen a los 2 lados, :159) y, tras ellos, se espera a que __SWAP__ tenga n frames a ese lado del
// cambio, contados como en las :140-141: antes, n < swap; desde él, n ≥ swap (sin cambio, todos son de antes). Se cuentan
// en la página, sin copiar el buffer; si no llegan en 30 s, waitFor lanza un error. Devuelve cuántos había y cuánto tardó
async function grabados(page: Page, lado: 'antes' | 'después', n: number): Promise<{ n: number; ms: number }> {
  const t0 = Date.now();
  const k = await waitFor(() => page.evaluate((lado) => {
    const fs = (window as unknown as { __SWAP__: Frame[] }).__SWAP__;
    const swap = fs.find((f) => f.glb)?.n ?? Infinity;
    let c = 0;
    for (const f of fs) if (lado === 'antes' ? f.n < swap : f.n >= swap) c++;
    return c;
  }, lado), (c) => c >= n, 30_000, 200);
  return { n: k, ms: Date.now() - t0 };
}

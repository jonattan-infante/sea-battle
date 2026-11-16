// Caché de la cadena de carga de los GLB (AC-193 c; condiciones de fusión del PR #19). El transcodificador de KTX2 vive en
// /basis/<hash>/ y los GLB en /models/<nombre>.<hash>.glb, con caché de un año (next.config.ts); los trozos del cargador
// son de /_next/static, que Next ya sirve así. Los GLB los sirve el servidor del juego, como en prod: build:e2e copia el
// fixture a public/models/e2e_*.glb (fuera de git). El del puerto es el mismo fixture con otro nombre: su cargador llega
// con D82, y aquí solo se prueba la regla de /models/. El par del paso 4c de §13, un GLB y su KTX2 aparte, sale de
// scripts/glb/e2e-models.ts
import fs from 'fs';
import path from 'path';
import { expect, Page, test } from '@playwright/test';
import { contentHash, E2E_PREFIX } from '../scripts/glb/content-hash';
import { externalKtx2Fixture } from '../scripts/glb/e2e-models';
import { SHIP_GLB } from '../src/client/models/ship-glb';
import { enterGame, entryOf, glbBeforeEntry } from './helpers';
import { startOwnServer } from './own-server';

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'ship_sloop_etc1s_meshopt.glb'));
const SHIP_URL = `/models/${E2E_PREFIX}ship_sloop.${contentHash(FIXTURE)}.glb`;
const PORT_URL = `/models/${E2E_PREFIX}port.${contentHash(FIXTURE)}.glb`;
const EXT = externalKtx2Fixture(new Uint8Array(FIXTURE));
const EXT_GLB_URL = `/models/${EXT.glbFile}`;
const EXT_KTX2_URL = `/models/${EXT.ktx2File}`;
const three = (file: string) => fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis', file));
const BASIS = `/basis/${contentHash(three('basis_transcoder.js'), three('basis_transcoder.wasm'))}/`;
const IMMUTABLE = 'public, max-age=31536000, immutable';

// Los trozos del cargador se reconocen por su contenido: cada firma es un literal de un módulo que solo se importa al haber
// un GLB que bajar (KTX2Loader, GLTFLoader y el descodificador de meshopt; ship-glb.ts, createGlbLoader)
const LOADER_SIGNATURES = ['basis_transcoder', 'KHR_texture_basisu', 'decodeGltfBuffer'];

// Lo que pide una página: rutas con su estado y su Cache-Control, y los js de /_next/static con las firmas que llevan
function track(page: Page) {
  const responses = new Map<string, string>();
  const scripts: string[] = [];
  const unread: string[] = [];
  const loaderChunks = new Map<string, string[]>();
  const bodies: Promise<void>[] = [];
  page.on('response', (r) => {
    const p = new URL(r.url()).pathname;
    responses.set(p, `${r.status()} ${r.headers()['cache-control'] ?? '(sin Cache-Control)'}`);
    if (!p.startsWith('/_next/static/') || !p.endsWith('.js')) return;
    scripts.push(p);
    bodies.push(
      r.text().then(
        (t) => {
          const found = LOADER_SIGNATURES.filter((s) => t.includes(s));
          if (found.length) loaderChunks.set(p, found);
        },
        () => void unread.push(p)
      )
    );
  });
  const paths = () => [...responses.keys()];
  return { responses, scripts, unread, loaderChunks, paths, settled: () => Promise.all(bodies) };
}

const loaded = (page: Page) =>
  expect.poll(() => page.evaluate(() => (window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { loaded(c: string): boolean } }).shipGlb.loaded('sloop')), { timeout: 20_000 }).toBe(true);

// El mapa del barco propio es ya la KTX2 (la del .ktx2 aparte, transcodificada)
const compressed = (page: Page) =>
  expect
    .poll(
      () =>
        page.evaluate(() => {
          const rt = window.__SEA_BATTLE__!.runtime() as unknown as { shipGlb: { model(c: string): { map?: { isCompressedTexture?: boolean } | null } } };
          return rt.shipGlb.model('sloop').map?.isCompressedTexture === true;
        }),
      { timeout: 30_000 }
    )
    .toBe(true);

// El cargador del puerto aún no existe (D82): la página lo baja con fetch, como lo haría
const fetchPort = (page: Page) =>
  page.evaluate(async (url) => {
    const r = await fetch(url);
    return [r.status, (await r.arrayBuffer()).byteLength];
  }, PORT_URL);

// Peticiones de la Resource Timing por ruta: con transferSize > 0 salió a la red (descarga o revalidación, que trae al
// menos las cabeceras); con 0 y cuerpo, salió de la caché
const network = (page: Page, paths: string[]) =>
  page.evaluate(
    (ps) =>
      ps.map((p) => {
        const es = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => new URL(e.name).pathname === p);
        return { path: p, requests: es.length, toNetwork: es.filter((e) => e.transferSize > 0).length, bytes: es.reduce((n, e) => n + e.transferSize, 0), body: es.every((e) => e.decodedBodySize > 0) };
      }),
    paths
  );

test.describe('Caché de la cadena de carga de los GLB (AC-193 c)', () => {
  // AC-197 (d) en la 1.3: un jugador sin familia no espera a ningún modelo propio. Con las 2 palancas de E-1 (AC-210 d) no hay
  // puerto, islas ni NPC del I2 con GLB, así que entra en el primer frame y, antes de entrar, no baja nada de la cadena de
  // carga ni de /models (la predicción de un invitado nuevo es la Balandra sin familia, sin GLB). Después, la precarga baja
  // las 10 combinaciones con familia (AC-227 c), una vez cada una. Cambia a propósito: hasta la 1.2 no había GLB de ninguna
  // clase del jugador y se asertaban 0 peticiones al cargador, a /basis y a /models en toda la visita
  test('AC-197 (d), sin familia (SEA_BATTLE_MAP=1.0 y SEA_BATTLE_I2=0, E-1): entra en el primer frame, sin bajar nada de la cadena de carga ni de /models antes; después, la precarga baja las 10 combinaciones', async ({ page }) => {
    test.setTimeout(120_000);
    const server = await startOwnServer({ SEA_BATTLE_MAP: '1.0', SEA_BATTLE_I2: '0' });
    try {
      const seen = track(page);
      await enterGame(page, server.url);
      await expect
        .poll(() => page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => /^\/models\/ship_[a-z]+_(gb|es)\.[0-9a-f]{8}\.glb$/.test(new URL(e.name).pathname)).length), { timeout: 60_000 })
        .toBe(10);
      await seen.settled();
      const entry = await entryOf(page);
      const chunks = [...seen.loaderChunks.keys()];
      const timed = await page.evaluate((chunks) => {
        const all = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((e) => ({ path: new URL(e.name).pathname, start: e.startTime }));
        return all.filter((e) => e.path.startsWith('/basis/') || e.path.startsWith('/models/') || chunks.includes(e.path));
      }, chunks);
      const before = timed.filter((e) => e.start < entry.shownAt).map((e) => e.path);
      const glbs = timed.filter((e) => e.path.endsWith('.glb')).map((e) => e.path).sort();
      console.log(`AC-197 (d) sin familia: entrada ${JSON.stringify(entry)} · antes de entrar ${JSON.stringify(before)} · firmas ${JSON.stringify(chunks)} · GLB ${glbs.length}`);
      expect(seen.unread).toEqual([]);
      expect(entry).toMatchObject({ lastWaitAt: 0, withGlb: false, capped: false, coverHidden: true });
      expect(entry.shownAt).toBe(entry.firstFrameAt);
      expect(before).toEqual([]);
      expect(chunks.length).toBeGreaterThan(0); // la cadena de carga sí baja, con la precarga
      expect(glbs).toEqual(Object.entries(SHIP_GLB).filter(([k]) => k.includes(':')).map(([, u]) => u!).sort());
    } finally {
      await server.kill();
    }
  });

  test('con manifiesto, la cadena de carga y los GLB se sirven con caché de un año, y en la visita siguiente hacen 0 peticiones a la red', async ({ context, page }) => {
    const first = track(page);
    await glbBeforeEntry(page, SHIP_URL);
    await enterGame(page);
    await loaded(page);
    expect(await fetchPort(page)).toEqual([200, FIXTURE.length]);
    await first.settled();
    expect(first.unread).toEqual([]);
    // Las 3 firmas aparecen: los trozos del cargador están identificados, y la prueba de arriba no pasa en vacío
    expect([...new Set([...first.loaderChunks.values()].flat())].sort()).toEqual([...LOADER_SIGNATURES].sort());
    const pieces = [...first.loaderChunks.keys(), `${BASIS}basis_transcoder.js`, `${BASIS}basis_transcoder.wasm`, SHIP_URL, PORT_URL];
    const headers = Object.fromEntries(pieces.map((p) => [p, first.responses.get(p) ?? 'sin pedir']));
    console.log(`AC-193 c 1.ª visita: ${JSON.stringify(headers)}`);
    expect(headers).toEqual(Object.fromEntries(pieces.map((p) => [p, `200 ${IMMUTABLE}`])));
    await page.close();

    // La visita siguiente, en el mismo navegador
    const again = await context.newPage();
    await glbBeforeEntry(again, SHIP_URL);
    await enterGame(again);
    await loaded(again);
    expect(await fetchPort(again)).toEqual([200, FIXTURE.length]);
    const next = await network(again, pieces);
    console.log(`AC-193 c visita siguiente: ${JSON.stringify(next)}`);
    expect(next).toEqual(pieces.map((p) => ({ path: p, requests: 1, toNetwork: 0, bytes: 0, body: true })));
  });

  // Paso 4c de §13: la KTX2 del barco va en su .ktx2 aparte, junto al GLB, que la enlaza por `uri`; GLTFLoader la pide al
  // lado del GLB. Lleva las reglas del GLB (BACKLOG :419): immutable y 0 peticiones a la red en la visita siguiente
  test('con la KTX2 en su .ktx2 aparte (paso 4c), el GLB y la KTX2 se sirven con caché de un año, y en la visita siguiente hacen 0 peticiones a la red', async ({ context, page }) => {
    test.setTimeout(120_000);
    const pieces = [EXT_GLB_URL, EXT_KTX2_URL];
    const first = track(page);
    await glbBeforeEntry(page, EXT_GLB_URL);
    await enterGame(page);
    await compressed(page);
    const headers = Object.fromEntries(pieces.map((p) => [p, first.responses.get(p) ?? 'sin pedir']));
    console.log(`AC-193 c paso 4c, 1.ª visita: ${JSON.stringify(headers)}`);
    expect(headers).toEqual(Object.fromEntries(pieces.map((p) => [p, `200 ${IMMUTABLE}`])));
    await page.close();

    const again = await context.newPage();
    await glbBeforeEntry(again, EXT_GLB_URL);
    await enterGame(again);
    await compressed(again);
    const next = await network(again, pieces);
    console.log(`AC-193 c paso 4c, visita siguiente: ${JSON.stringify(next)}`);
    expect(next).toEqual(pieces.map((p) => ({ path: p, requests: 1, toNetwork: 0, bytes: 0, body: true })));
  });

  // En un relevo de Railway los dos servidores se solapan ~1,3–2,3 s: si el HTML sale del nuevo y su /basis/<hash>/ cae en
  // el viejo, un 404 con caché de un año dejaría al navegador sin transcodificador. El 404 no se guarda
  test('un 404 en /basis/<hash>/ o en /models/ no se guarda: sin immutable ni max-age > 0', async ({ request }) => {
    expect(BASIS).not.toBe('/basis/ffffffff/');
    for (const url of ['/basis/ffffffff/basis_transcoder.js', '/models/no_existe.00000000.glb', '/models/no-existe.00000000.glb', '/models/no_existe_atlas.00000000.ktx2']) {
      const r = await request.get(url);
      const cacheControl = r.headers()['cache-control'] ?? '';
      console.log(`AC-193 c 404: ${url} → ${r.status()} ${cacheControl}`);
      expect([r.status(), cacheControl.includes('immutable'), Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? 0)]).toEqual([404, false, 0]);
    }
  });
});

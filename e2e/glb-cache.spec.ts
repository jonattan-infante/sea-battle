// Caché de la cadena de carga de los GLB (AC-193 c; condiciones de fusión del PR #19). El transcodificador de KTX2 vive en
// /basis/<hash>/ y los GLB en /models/<nombre>.<hash>.glb, con caché de un año (next.config.ts); los trozos del cargador
// son de /_next/static, que Next ya sirve así. Los GLB los sirve el servidor del juego, como en prod: build:e2e copia el
// fixture a public/models/e2e_*.glb (fuera de git). El del puerto es el mismo fixture con otro nombre: su cargador llega
// con D82, y aquí solo se prueba la regla de /models/
import fs from 'fs';
import path from 'path';
import { expect, Page, test } from '@playwright/test';
import { contentHash, E2E_PREFIX } from '../scripts/glb/content-hash';
import { enterGame, entryOf, glbBeforeEntry } from './helpers';

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'ship_sloop_etc1s_meshopt.glb'));
const SHIP_URL = `/models/${E2E_PREFIX}ship_sloop.${contentHash(FIXTURE)}.glb`;
const PORT_URL = `/models/${E2E_PREFIX}port.${contentHash(FIXTURE)}.glb`;
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
  test('con el manifiesto vacío, la primera visita no baja la cadena de carga: 0 peticiones al cargador, a /basis y a /models, y se entra como hoy', async ({ page }) => {
    const seen = track(page);
    await enterGame(page);
    await page.waitForTimeout(2_000); // la precarga de los demás GLB arranca al entrar (prefetchAll): con el manifiesto vacío, nada
    await seen.settled();
    const entry = await entryOf(page);
    console.log(`AC-193 c manifiesto vacío: ${seen.scripts.length} js leídos, firmas ${JSON.stringify([...seen.loaderChunks])}, entrada ${JSON.stringify(entry)}`);
    expect(seen.unread).toEqual([]);
    expect(seen.scripts.length).toBeGreaterThan(5); // se leyó el código de la página: la ausencia de firmas no es vacía
    expect([...seen.loaderChunks.keys()]).toEqual([]);
    expect(seen.paths().filter((p) => p.startsWith('/basis/') || p.startsWith('/models/'))).toEqual([]);
    expect(entry).toMatchObject({ lastWaitAt: 0, withGlb: false, capped: false, coverHidden: true });
    expect(entry.shownAt).toBe(entry.firstFrameAt);
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

  // En un relevo de Railway los dos servidores se solapan ~1,3–2,3 s: si el HTML sale del nuevo y su /basis/<hash>/ cae en
  // el viejo, un 404 con caché de un año dejaría al navegador sin transcodificador. El 404 no se guarda
  test('un 404 en /basis/<hash>/ o en /models/ no se guarda: sin immutable ni max-age > 0', async ({ request }) => {
    expect(BASIS).not.toBe('/basis/ffffffff/');
    for (const url of ['/basis/ffffffff/basis_transcoder.js', '/models/no_existe.00000000.glb', '/models/no-existe.00000000.glb']) {
      const r = await request.get(url);
      const cacheControl = r.headers()['cache-control'] ?? '';
      console.log(`AC-193 c 404: ${url} → ${r.status()} ${cacheControl}`);
      expect([r.status(), cacheControl.includes('immutable'), Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? 0)]).toEqual([404, false, 0]);
    }
  });
});

// P0 de prod (1.0.0): bucle /game ↔ /sign-in tras iniciar sesión (src/lib/auth-gate.ts). Contra el servidor sin
// invitado (Clerk de desarrollo): una navegación del cliente (RSC) a /game con un __session más viejo que __client_uat
// no puede refrescarse por handshake, y antes acababa en /sign-in, desde donde <SignIn> vuelve a /game. Ahora /game
// recarga como documento. El motivo se decide al decodificar el token, antes de verificar la firma, así que basta un
// token con una firma de relleno
import { createClerkClient } from '@clerk/backend';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { BrowserContext, expect, Page, test } from '@playwright/test';
import fs from 'fs';
import { parseEnv } from 'util';
import { PORTS } from '../playwright.config';
import { RELOAD_COOKIE } from '../src/lib/auth-gate';

const BASE = `http://localhost:${PORTS.auth}`;
const RSC = { rsc: '1', accept: '*/*', 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' };
const DOCUMENT = { accept: 'text/html', 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' };

function staleSession(): string {
  const now = Math.floor(Date.now() / 1000);
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = [part({ alg: 'RS256', kid: 'ins_e2e', typ: 'JWT' }), part({ sub: 'user_e2e', sid: 'sess_e2e', iat: now - 30, exp: now + 30, nbf: now - 40 }), Buffer.alloc(256).toString('base64url')].join('.');
  return `__clerk_db_jwt=dvb_e2e; __client_uat=${now}; __session=${token}`;
}

test.describe('P0: /game con un token que solo el handshake refresca', () => {
  test('RSC: recarga como documento en vez de mandar a /sign-in', async ({ request }) => {
    const res = await request.get(`${BASE}/game`, { headers: { ...RSC, cookie: staleSession() }, maxRedirects: 0 });
    expect(res.headers()['x-clerk-auth-reason']).toBe('session-token-iat-before-client-uat');
    const body = await res.text();
    expect(body, 'sin la redirección a /sign-in que cierra el bucle').not.toContain('NEXT_REDIRECT');
    expect(body).toContain('auth-reload');
  });

  test('documento: el middleware hace el handshake, como antes', async ({ request }) => {
    const res = await request.get(`${BASE}/game`, { headers: { ...DOCUMENT, cookie: staleSession() }, maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['x-clerk-auth-status']).toBe('handshake');
    expect(res.headers().location).toContain('/v1/client/handshake');
  });

  // window.location.replace es siempre una navegación de documento (el test del navegador lo mide: «DOC /game»). Si en
  // ese documento el middleware agota sus 3 handshakes (__clerk_redirect_count=3) y sigue sin sesión, /game manda a
  // /sign-in sin recargar
  test('documento con el motivo de handshake y los 3 intentos agotados: va a /sign-in, sin recarga', async ({ request }) => {
    const res = await request.get(`${BASE}/game`, { headers: { ...DOCUMENT, cookie: `${staleSession()}; __clerk_redirect_count=3` }, maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['x-clerk-auth-status']).toBe('signed-out');
    expect(res.headers()['x-clerk-auth-reason']).toBe('session-token-iat-before-client-uat');
    expect(res.headers().location).toContain('/sign-in?redirect_url=');
    expect(await res.text()).not.toContain('auth-reload');
  });

  // Tope: tras la recarga (marca de 30 s), si sigue sin sesión no se recarga otra vez
  test('RSC con la marca de una recarga reciente: va a /sign-in, sin segunda recarga', async ({ request }) => {
    const res = await request.get(`${BASE}/game`, { headers: { ...RSC, cookie: `${staleSession()}; ${RELOAD_COOKIE}=1` }, maxRedirects: 0 });
    expect(res.headers()['x-clerk-auth-reason']).toBe('session-token-iat-before-client-uat');
    const body = await res.text();
    expect(body).toContain('NEXT_REDIRECT');
    expect(body).not.toContain('auth-reload');
  });

  // Con el navegador de desarrollo (__clerk_db_jwt) y sin sesión: el caso de quien no ha iniciado sesión
  test('RSC sin sesión: sigue yendo a /sign-in', async ({ request }) => {
    const res = await request.get(`${BASE}/game`, { headers: { ...RSC, cookie: '__clerk_db_jwt=dvb_e2e' }, maxRedirects: 0 });
    expect(res.headers()['x-clerk-auth-reason']).toBe('session-token-and-uat-missing');
    const body = await res.text();
    expect(body).toContain('NEXT_REDIRECT');
    expect(body).not.toContain('auth-reload');
  });
});

// De punta a punta en Chromium con el usuario de prueba de la instancia de desarrollo (externalId sea-battle-qa, por
// ticket del Backend API; TECH-ARCHITECTURE §4). Como en la reproducción del lead en prod: se adelanta __client_uat 5 min
// justo antes de «Zarpar», así que el __session del navegador queda más viejo que la marca
const secretKey = () =>
  process.env.CLERK_SECRET_KEY ?? (fs.existsSync('.env.local') ? parseEnv(fs.readFileSync('.env.local', 'utf8')).CLERK_SECRET_KEY : undefined);

type Hop = { kind: 'DOC' | 'RSC'; path: string; reason: string; redirected: boolean };

// Respuestas de /game y /sign-in desde el clic: DOC = navegación de documento (redirected: un salto de la misma cadena
// de redirecciones, p. ej. el 307 del handshake o el 307 a /sign-in), RSC = navegación del cliente
function track(page: Page): Hop[] {
  const hops: Hop[] = [];
  page.on('response', (r) => {
    const req = r.request();
    const url = new URL(r.url());
    if (url.origin !== BASE || !/^\/(game|sign-in)/.test(url.pathname)) return;
    const kind = req.isNavigationRequest() ? 'DOC' : req.headers()['rsc'] ? 'RSC' : null;
    if (!kind) return;
    hops.push({ kind, path: url.pathname, reason: r.headers()['x-clerk-auth-reason'] ?? '', redirected: kind === 'DOC' && !!req.redirectedFrom() });
  });
  return hops;
}

async function zarpar(page: Page, before?: () => Promise<void>): Promise<{ hops: Hop[]; inGame: boolean; clickedAt: number }> {
  await page.goto(`${BASE}/`);
  await expect(page.getByTestId('cta-play')).toBeVisible();
  await page.waitForTimeout(1500);
  if (before) await before();
  const hops = track(page);
  const clickedAt = Date.now();
  await page.getByTestId('cta-play').click();
  const inGame = await page
    .waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(2000); // por si sigue navegando después de entrar
  page.removeAllListeners('response');
  return { hops, inGame, clickedAt };
}

// Entra con el usuario de prueba de la instancia de desarrollo; sin CLERK_SECRET_KEY de desarrollo, NO VERIFICADO
async function signInQa(page: Page, where: string): Promise<boolean> {
  const key = secretKey();
  if (!key) {
    console.log(`${where}: NO VERIFICADO: falta CLERK_SECRET_KEY (de la instancia de desarrollo) para entrar con el usuario de prueba`);
    return false;
  }
  if (!key.startsWith('sk_test_')) throw new Error('CLERK_SECRET_KEY no es de una instancia de desarrollo (sk_test_): el spec no la usa');
  await page.goto(`${BASE}/`);
  const instance = await page
    .waitForFunction(() => (window.Clerk?.loaded ? { publishableKey: window.Clerk.publishableKey, frontendApi: window.Clerk.frontendApi } : null), null, { timeout: 30_000 })
    .then((h) => h.jsonValue());
  if (!instance) throw new Error('la portada no carga Clerk');
  await clerkSetup({ publishableKey: instance.publishableKey, frontendApiUrl: instance.frontendApi, secretKey: key, dotenv: false });
  const backend = createClerkClient({ secretKey: key });
  const users = await backend.users.getUserList({ externalId: [process.env.E2E_CLERK_EXTERNAL_ID ?? 'sea-battle-qa'] });
  expect(users.data, 'un usuario de prueba en la instancia de desarrollo').toHaveLength(1);
  const { token } = await backend.signInTokens.createSignInToken({ userId: users.data[0].id, expiresInSeconds: 120 });
  await clerk.signIn({ page, signInParams: { strategy: 'ticket', ticket: token } });
  await page.waitForFunction(() => !!window.Clerk.user, null, { timeout: 15_000 });
  return true;
}

// Adelanta __client_uat 5 min, como la reproducción del lead en prod: el __session queda más viejo que la marca
const staleUat = (context: BrowserContext) => async () => {
  const future = String(Math.floor(Date.now() / 1000) + 300);
  const uat = (await context.cookies(BASE)).filter((c) => c.name.startsWith('__client_uat'));
  expect(uat.length, 'el navegador tiene __client_uat').toBeGreaterThan(0);
  await context.addCookies(uat.map((c) => ({ ...c, value: future })));
};

const hasReloadMark = async (context: BrowserContext) => (await context.cookies(BASE)).some((c) => c.name === RELOAD_COOKIE);

const summary = (hops: Hop[]) => hops.map((h) => `${h.redirected ? '↪' : ''}${h.kind} ${h.path}${h.reason ? ` (${h.reason})` : ''}`).join(' → ');
const documentLoads = (hops: Hop[]) => hops.filter((h) => h.kind === 'DOC' && !h.redirected);

test.describe('P0 en el navegador: «Zarpar» con la sesión iniciada', () => {
  test('con __session más viejo que __client_uat entra con una sola recarga; con cookies sanas, sin ninguna', async ({ page, context }) => {
    test.setTimeout(120_000);
    if (!(await signInQa(page, 'P0 navegador'))) return;

    // Sin desacuerdo nada cambia: una navegación del cliente a /game y ninguna recarga
    const healthy = await zarpar(page);
    console.log(`P0 cookies sanas: ${summary(healthy.hops)} · en el juego: ${healthy.inGame}`);
    expect(healthy.inGame, 'con cookies sanas entra al juego').toBe(true);
    expect(documentLoads(healthy.hops), 'con cookies sanas, ninguna recarga de documento').toHaveLength(0);
    expect(healthy.hops.filter((h) => h.path === '/sign-in'), 'con cookies sanas, nunca pasa por /sign-in').toHaveLength(0);
    await context.clearCookies({ name: RELOAD_COOKIE });

    const stale = await zarpar(page, staleUat(context));
    console.log(`P0 __client_uat adelantado: ${summary(stale.hops)} · en el juego: ${stale.inGame}`);
    expect(stale.hops[0]?.reason, 'el desacuerdo llega al servidor (si no, el test no prueba nada)').toBe('session-token-iat-before-client-uat');
    // Ni una visita a /sign-in, ni RSC ni documento (también un 307 dentro de la recarga): el código viejo a veces se cura
    // solo en 2–4 s en local (QA), así que «sin bucle largo» no basta
    expect(stale.hops.filter((h) => h.path === '/sign-in'), '0 visitas a /sign-in').toHaveLength(0);
    expect(documentLoads(stale.hops), 'una sola recarga de documento (la del handshake)').toHaveLength(1);
    expect(stale.inGame, 'termina en el juego').toBe(true);
  });

  // O-21 (QA-15 §2, sonda uat2): la marca de la recarga se borra al entrar al juego, así que un segundo desacuerdo
  // antes de sus 30 s también se recupera con una recarga en vez de volver al bucle viejo (44 rebotes en local, 8 en
  // staging, ~67 s en prod)
  test('dos desacuerdos en menos de 30 s: el segundo también entra con una recarga y sin pasar por /sign-in', async ({ page, context }) => {
    test.setTimeout(120_000);
    if (!(await signInQa(page, 'O-21 navegador'))) return;
    const first = await zarpar(page, staleUat(context));
    console.log(`O-21 primer desacuerdo: ${summary(first.hops)} · en el juego: ${first.inGame}`);
    expect(first.inGame, 'el primero entra al juego').toBe(true);
    expect(documentLoads(first.hops), 'el primero, con una recarga').toHaveLength(1);
    const markAfterGame = await hasReloadMark(context);
    console.log(`O-21 marca ${RELOAD_COOKIE} tras entrar al juego: ${markAfterGame ? 'sigue' : 'borrada'}`);
    expect.soft(markAfterGame, 'con /game servido con sesión, la marca se borra').toBe(false);

    const second = await zarpar(page, staleUat(context));
    // O-23 (QA-17): de clic a clic. La marca nace con la recarga, después del primer clic, así que este hueco es una cota
    // por arriba de su edad en el segundo; antes contaba también la carga de la portada y la espera previa al primero
    const gap = (second.clickedAt - first.clickedAt) / 1000;
    console.log(`O-21 segundo desacuerdo a ${gap.toFixed(1)} s del primero: ${summary(second.hops)} · en el juego: ${second.inGame}`);
    expect(gap, 'el segundo cae dentro de los 30 s de la marca (si no, el test no prueba nada)').toBeLessThan(30);
    expect(second.hops[0]?.reason, 'el segundo desacuerdo llega al servidor').toBe('session-token-iat-before-client-uat');
    expect(second.hops.filter((h) => h.path === '/sign-in'), 'el segundo: 0 visitas a /sign-in').toHaveLength(0);
    expect(documentLoads(second.hops), 'el segundo, con una sola recarga').toHaveLength(1);
    expect(second.inGame, 'el segundo termina en el juego').toBe(true);
  });
});

// P0 de prod (1.0.0): bucle /game ↔ /sign-in tras iniciar sesión. En una navegación del cliente (RSC, Sec-Fetch-Dest:
// empty) el middleware de Clerk no puede hacer el handshake que refresca un token viejo y deja la petición en
// signed-out con el motivo del handshake; si /game manda entonces a /sign-in, <SignIn> ve la sesión del cliente y
// vuelve a /game. Con esos motivos, /game recarga como documento para que el middleware haga el handshake
import { HANDSHAKE_REASONS, RELOAD_COOKIE, shouldReloadAsDocument } from '../auth-gate';

const RSC = { 'sec-fetch-dest': 'empty', accept: '*/*' };
const DOCUMENT = { 'sec-fetch-dest': 'document', accept: 'text/html' };
const headersOf = (h: Record<string, string>) => new Headers(h);

describe('/game sin userId: recargar como documento o ir a /sign-in', () => {
  test.each([...HANDSHAKE_REASONS, 'session-token-expired-refresh-non-eligible-no-refresh-cookie'])('RSC con %s → recarga como documento', (reason) => {
    expect(shouldReloadAsDocument(reason, headersOf(RSC))).toBe(true);
  });

  test.each([
    ['session-token-and-uat-missing', 'sin cookies de Clerk: no hay sesión que recuperar'],
    ['session-token-missing', 'el handshake ya se resolvió sin sesión'],
    ['token-invalid-signature', 'un token de otra instancia no se arregla recargando'],
    ['secret-key-invalid', 'configuración rota'],
    ['', 'sin motivo']
  ])('RSC con %j → /sign-in (%s)', (reason) => {
    expect(shouldReloadAsDocument(reason, headersOf(RSC))).toBe(false);
  });

  // Tope: tras una recarga (marca de 30 s), si sigue sin sesión va a /sign-in y no se recarga otra vez
  test('RSC con session-token-iat-before-client-uat y la marca de recarga → /sign-in', () => {
    expect(shouldReloadAsDocument('session-token-iat-before-client-uat', headersOf({ ...RSC, cookie: `__session=x; ${RELOAD_COOKIE}=1` }))).toBe(false);
    expect(shouldReloadAsDocument('session-token-iat-before-client-uat', headersOf({ ...RSC, cookie: `__session=x; otra-${RELOAD_COOKIE}=1` }))).toBe(true);
  });

  test('sin cabecera de motivo → /sign-in', () => {
    expect(shouldReloadAsDocument(null, headersOf(RSC))).toBe(false);
  });

  // En un documento el middleware ya hizo el handshake; si aun así llega uno de esos motivos es que agotó sus 3
  // intentos (__clerk_redirect_count), y recargar solo repetiría el bucle
  test.each([
    ['documento', DOCUMENT],
    ['iframe', { 'sec-fetch-dest': 'iframe' }],
    ['sin Sec-Fetch-Dest y con Accept text/html', { accept: 'text/html,application/xhtml+xml' }]
  ])('%s con session-token-iat-before-client-uat → /sign-in', (_label, h) => {
    expect(shouldReloadAsDocument('session-token-iat-before-client-uat', headersOf(h))).toBe(false);
  });
});

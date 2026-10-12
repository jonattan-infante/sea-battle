// P0 de prod (1.0.0): bucle /game ↔ /sign-in tras iniciar sesión. El middleware de Clerk solo hace el handshake (el
// viaje a la Frontend API que refresca un token de sesión viejo o que falta) en peticiones de documento; en una
// navegación del cliente (RSC) deja la petición en signed-out con el motivo del handshake. En prod la Frontend API
// pone __client_uat por su cuenta (clerk-js lo dice en core/auth/cookies/clientUat.ts), así que el __session de la
// página puede quedar más viejo que él. Si /game manda entonces a /sign-in, <SignIn> ve la sesión del cliente y vuelve a
// /game. Con estos motivos, /game recarga como documento para que el middleware haga el handshake, una sola vez: la
// recarga deja una marca de 30 s (el handshake de prod tarda < 1 s) y con ella /game vuelve a mandar a /sign-in, así que
// una sesión que ni el handshake arregla no cambia un bucle por otro de recargas

// La regla copia @clerk/backend 2.33.7 (el de @clerk/nextjs 6.39.7, dist/chunk-NNPDVHXM.mjs): los motivos de
// AuthErrorReason (:4736-4753) con los que se llama a handleMaybeHandshakeStatus (:5635; llamadas en :5687, :5741-5791,
// :5812 y :5870-5881), isRequestEligibleForHandshake (:5164-5173) y el tope de 3 handshakes de checkAndTrackRedirectLoop
// (:5335-5343). Al subir Clerk hay que revisarla contra esas funciones
export const RELOAD_COOKIE = 'sea-battle-auth-reload';
export const RELOAD_COOKIE_MAX_AGE_S = 30;

// Motivos con los que @clerk/backend pide un handshake (handleMaybeHandshakeStatus); los de token caducado llevan
// detrás el motivo del refresco (session-token-expired-refresh-…)
export const HANDSHAKE_REASONS = [
  'client-uat-but-no-session-token',
  'session-token-but-no-client-uat',
  'session-token-iat-before-client-uat',
  'session-token-expired',
  'session-token-nbf',
  'session-token-iat-in-the-future',
  'dev-browser-missing',
  'dev-browser-sync',
  'satellite-needs-syncing',
  'primary-responds-to-syncing',
  'primary-domain-cross-origin-sync',
  'active-organization-mismatch'
];

// Las peticiones en las que el middleware sí puede hacer el handshake (isRequestEligibleForHandshake de @clerk/backend).
// Si una de ellas llega aquí con un motivo de handshake, el middleware ya agotó sus intentos y recargar repetiría el bucle
function isDocumentRequest(headers: Headers): boolean {
  const dest = headers.get('sec-fetch-dest');
  if (dest === 'document' || dest === 'iframe') return true;
  return !dest && (headers.get('accept') ?? '').startsWith('text/html');
}

function reloadedRecently(headers: Headers): boolean {
  return (headers.get('cookie') ?? '').split(';').some((c) => c.trim().startsWith(`${RELOAD_COOKIE}=`));
}

export function shouldReloadAsDocument(reason: string | null, headers: Headers): boolean {
  if (!reason || isDocumentRequest(headers) || reloadedRecently(headers)) return false;
  return HANDSHAKE_REASONS.some((r) => reason === r || (r === 'session-token-expired' && reason.startsWith(`${r}-`)));
}

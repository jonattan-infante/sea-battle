// Entorno del arnés remoto (playwright.remote.config.ts): el despliegue a probar, la guarda de producción y las
// credenciales del usuario de prueba de Clerk. Los secretos van en .env.remote.local (ignorado por .gitignore) o en el
// entorno; nunca en el repo ni en los logs
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const ENV_FILE = path.join(ROOT, '.env.remote.local');
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

type Env = Record<string, string | undefined>;

// Sin despliegue, sin login o sin el puente de depuración no se puede medir: la corrida es NO VERIFICADO, no un rojo
// del juego (como AC-84 y AC-91)
export function notVerified(reason: string): Error {
  return new Error(`REMOTE NO VERIFICADO: ${reason}`);
}

// Las variables del entorno mandan sobre las del archivo
export function loadRemoteEnv(): void {
  if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

export function baseUrl(env: Env = process.env): URL {
  if (!env.BASE_URL) throw notVerified('falta BASE_URL (p. ej., BASE_URL=https://staging.example.com npm run test:remote)');
  try {
    return new URL(env.BASE_URL);
  } catch {
    throw notVerified(`BASE_URL no es una URL válida: ${env.BASE_URL}`);
  }
}

// Una corrida contra producción mete un barco de prueba en el mundo de los jugadores: solo con REMOTE_ALLOW_PROD=1,
// que se pone cuando Jonattan autoriza esa corrida (como un deploy). La guarda falla cerrada (DT-08): solo localhost y
// los hosts de REMOTE_STAGING_HOSTS (separados por comas) no son prod; cualquier otro lo es, así un dominio nuevo de
// prod queda protegido sin que nadie tenga que añadirlo
export function isProdHost(url: URL, env: Env = process.env): boolean {
  const host = url.hostname.toLowerCase();
  const staging = (env.REMOTE_STAGING_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return !LOCAL_HOSTS.includes(host) && !staging.includes(host);
}

export function prodGuard(url: URL, env: Env = process.env): void {
  if (isProdHost(url, env) && env.REMOTE_ALLOW_PROD !== '1')
    throw notVerified(`${url.hostname} no es localhost ni está en REMOTE_STAGING_HOSTS, así que cuenta como producción; hace falta REMOTE_ALLOW_PROD=1, y cada corrida en prod la autoriza Jonattan`);
}

// A (preferida): CLERK_SECRET_KEY de la instancia + externalId del usuario; entra con un token de inicio de sesión del
// Backend API (estrategia ticket) y un Testing Token, sin contraseña, así que vale con cualquier identificador que tenga
// activado la instancia (Clerk exige que el usuario tenga uno: email, teléfono o username). C: nombre de usuario +
// contraseña, sin clave secreta (sin Testing Token). Con Q13 las cuentas no tienen correo (O-13); E2E_CLERK_USERNAME es
// del usuario del e2e del login, que nunca es el del arnés remoto
export type LoginMethod = { kind: 'A'; externalId: string; secretKey: string } | { kind: 'C'; username: string; password: string };

export function loginMethod(env: Env = process.env): LoginMethod {
  if (env.E2E_CLERK_EXTERNAL_ID && env.CLERK_SECRET_KEY) return { kind: 'A', externalId: env.E2E_CLERK_EXTERNAL_ID, secretKey: env.CLERK_SECRET_KEY };
  if (env.E2E_REMOTE_USERNAME && env.E2E_CLERK_PASSWORD) return { kind: 'C', username: env.E2E_REMOTE_USERNAME, password: env.E2E_CLERK_PASSWORD };
  throw notVerified('faltan las credenciales del usuario de prueba: E2E_CLERK_EXTERNAL_ID con CLERK_SECRET_KEY (A) o E2E_REMOTE_USERNAME con E2E_CLERK_PASSWORD (C)');
}

// Motivo de un inicio de sesión fallido para el NO VERIFICADO: la primera línea no vacía del mensaje o, si no hay, el
// nombre del error, con el código y el mensaje de su primer error de Clerk si los trae. Sin red, @clerk/backend lanza un
// ClerkAPIResponseError con el mensaje vacío y errors[0] = unexpected_error: fetch failed (O-13)
export function failureReason(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const line = message.split('\n').map((l) => l.trim()).find(Boolean);
  if (line) return line;
  if (!(e instanceof Error)) return 'error sin mensaje';
  const first = (e as Error & { errors?: { code?: string; message?: string }[] }).errors?.[0];
  const detail = [first?.code, first?.message].filter(Boolean).join(': ');
  return detail ? `${e.name} (${detail})` : e.name;
}

// Sesión del usuario de prueba que guarda el global setup y reutilizan los specs
export function stateFile(url: URL): string {
  return path.join(ROOT, '.auth', `remote-${url.host.replace(/[^a-z0-9.-]/gi, '_')}.json`);
}

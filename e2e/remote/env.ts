// Entorno del arnés remoto (playwright.remote.config.ts): el despliegue a probar, la guarda de producción y las
// credenciales del usuario de prueba de Clerk. Los secretos van en .env.remote.local (ignorado por .gitignore) o en el
// entorno; nunca en el repo ni en los logs
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const ENV_FILE = path.join(ROOT, '.env.remote.local');
// Producción conocida; REMOTE_PROD_HOSTS la sustituye (hosts separados por comas)
const DEFAULT_PROD_HOSTS = 'sea-battle-production-5eba.up.railway.app';

// Sin despliegue, sin login o sin el puente de depuración no se puede medir: la corrida es NO VERIFICADO, no un rojo
// del juego (como AC-84 y AC-91)
export function notVerified(reason: string): Error {
  return new Error(`REMOTE NO VERIFICADO: ${reason}`);
}

// Las variables del entorno mandan sobre las del archivo
export function loadRemoteEnv(): void {
  if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

export function baseUrl(env: NodeJS.ProcessEnv = process.env): URL {
  if (!env.BASE_URL) throw notVerified('falta BASE_URL (p. ej., BASE_URL=https://staging.example.com npm run test:remote)');
  try {
    return new URL(env.BASE_URL);
  } catch {
    throw notVerified(`BASE_URL no es una URL válida: ${env.BASE_URL}`);
  }
}

// Una corrida contra producción mete un barco de prueba en el mundo de los jugadores: solo con REMOTE_ALLOW_PROD=1,
// que se pone cuando Jonattan autoriza esa corrida (como un deploy)
export function prodGuard(url: URL, env: NodeJS.ProcessEnv = process.env): void {
  const prod = (env.REMOTE_PROD_HOSTS ?? DEFAULT_PROD_HOSTS).split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (prod.includes(url.hostname.toLowerCase()) && env.REMOTE_ALLOW_PROD !== '1')
    throw notVerified(`${url.hostname} es producción; hace falta REMOTE_ALLOW_PROD=1, y cada corrida en prod la autoriza Jonattan`);
}

// A (preferida): CLERK_SECRET_KEY de la instancia + email; entra con un token de inicio de sesión del Backend API y un
// Testing Token, sin contraseña. C: email + contraseña, sin clave secreta (sin Testing Token)
export type LoginMethod = { kind: 'A'; email: string; secretKey: string } | { kind: 'C'; email: string; password: string };

export function loginMethod(env: NodeJS.ProcessEnv = process.env): LoginMethod {
  const email = env.E2E_CLERK_EMAIL;
  if (email && env.CLERK_SECRET_KEY) return { kind: 'A', email, secretKey: env.CLERK_SECRET_KEY };
  if (email && env.E2E_CLERK_PASSWORD) return { kind: 'C', email, password: env.E2E_CLERK_PASSWORD };
  throw notVerified('faltan las credenciales del usuario de prueba: E2E_CLERK_EMAIL con CLERK_SECRET_KEY (A) o con E2E_CLERK_PASSWORD (C)');
}

// Sesión del usuario de prueba que guarda el global setup y reutilizan los specs
export function stateFile(url: URL): string {
  return path.join(ROOT, '.auth', `remote-${url.host.replace(/[^a-z0-9.-]/gi, '_')}.json`);
}

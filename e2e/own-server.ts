// Servidor de juego propio para los tests que lo llenan (AC-12), lo paran y lo relanzan (AC-99) o necesitan un mundo
// aislado que pueden alterar sin afectar a los servidores compartidos de playwright.config.ts (hundir NPC, PvP).
// Usa el mismo build de producción (.next-e2e) en un puerto libre de su rango propio, que deriva de PW_PORT_BASE:
// cada corrida del harness con su base tiene su rango y no se pisa con otras.
import { ChildProcess, spawn } from 'child_process';
import net from 'net';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT_BASE = 3100; // la misma base por defecto que playwright.config.ts
const OWN_RANGE_OFFSET = 500;
const OWN_RANGE_SIZE = 100;
const BOOT_TIMEOUT_MS = 60_000;

export interface OwnServer {
  port: number;
  url: string;
  // Relanza el proceso en el mismo puerto (AC-99)
  start: () => Promise<void>;
  // SIGKILL: una caída, sin cierre ordenado de los sockets
  kill: () => Promise<void>;
  running: () => boolean;
}

const isFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, () => probe.close(() => resolve(true)));
  });

// Puertos que Chrome bloquea con net::ERR_UNSAFE_PORT (kRestrictedPorts de Chromium, comprobados con un barrido de
// 1–65535 contra el Chrome del harness): una página en uno de ellos no carga, así que el servidor propio nunca los usa.
// En 3600–3699 cae el 3659, que tumbó AC-99 cuando salió al azar; en 4000–4099 (base 3500), el 4045.
export const CHROME_UNSAFE_PORTS: ReadonlySet<number> = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111,
  113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548,
  554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666,
  6667, 6668, 6669, 6697, 10080
]);

// Rango propio: [PW_PORT_BASE + 500, PW_PORT_BASE + 599] (3600–3699 con la base por defecto) o, si se fija,
// [PW_OWN_PORT_BASE, PW_OWN_PORT_BASE + 99]
export function ownPortRange(env: Record<string, string | undefined> = process.env): { from: number; to: number } {
  const from = env.PW_OWN_PORT_BASE ? Number(env.PW_OWN_PORT_BASE) : Number(env.PW_PORT_BASE ?? DEFAULT_PORT_BASE) + OWN_RANGE_OFFSET;
  const to = from + OWN_RANGE_SIZE - 1;
  if (!Number.isInteger(from) || from < 1024 || to > 65535) throw new Error(`Rango de puertos propio no válido: ${from}–${to} (revisa PW_PORT_BASE y PW_OWN_PORT_BASE)`);
  return { from, to };
}

// Puertos que puede usar el servidor propio: los del rango menos los que bloquea Chrome
export function candidatePorts(from = ownPortRange().from, to = ownPortRange().to): number[] {
  const ports: number[] = [];
  for (let p = from; p <= to; p++) if (!CHROME_UNSAFE_PORTS.has(p)) ports.push(p);
  return ports;
}

// Empieza en un punto aleatorio para que dos corridas simultáneas no elijan el mismo puerto
export async function freePort(from = ownPortRange().from, to = ownPortRange().to): Promise<number> {
  const ports = candidatePorts(from, to);
  const offset = Math.floor(Math.random() * ports.length);
  for (let i = 0; i < ports.length; i++) {
    const port = ports[(offset + i) % ports.length];
    if (await isFree(port)) return port;
  }
  throw new Error(`No hay puertos libres en ${from}–${to} (sin contar los que bloquea Chrome)`);
}

// Si el worker de Playwright muere sin pasar por afterAll ni finally (timeout del teardown, SIGKILL), el servidor no
// puede quedarse huérfano ocupando su puerto: un vigía aparte, unido al worker por una tubería, lo mata en cuanto la
// tubería se cierra. Cuando el servidor termina por su cuenta, el vigía se cierra con él.
function guard(child: ChildProcess) {
  const watchdog = spawn(
    process.execPath,
    ['-e', `process.stdin.on('end', () => { try { process.kill(${child.pid}, 'SIGKILL'); } catch {} process.exit(0); }); process.stdin.resume();`],
    { stdio: ['pipe', 'ignore', 'ignore'], detached: true }
  );
  watchdog.unref();
  (watchdog.stdin as unknown as { unref: () => void }).unref();
  child.once('exit', () => watchdog.stdin?.end());
}

// env: variables extra del servidor (p. ej. { SEA_BATTLE_NPCS: '0' }); AUTH_BYPASS=1 siempre, como el harness.
// Igual que reuseExistingServer: false, nunca se usa un servidor ajeno: si el puerto está ocupado, falla al momento, y
// el servidor solo cuenta como listo cuando lo anuncia el proceso que se acaba de lanzar (no basta con que /healthz
// responda, porque podría contestar otro proceso).
export async function startOwnServer(env: Record<string, string> = {}): Promise<OwnServer> {
  const port = await freePort();
  const url = `http://localhost:${port}`;
  let proc: ChildProcess | null = null;

  const launch = async () => {
    if (!(await isFree(port))) throw new Error(`El puerto ${port} está ocupado: no se reutiliza un servidor ajeno`);
    const child = spawn(process.execPath, ['dist/server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, AUTH_BYPASS: '1', NEXT_DIST_DIR: '.next-e2e', NODE_ENV: 'production', ...env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    proc = child;
    guard(child);
    let stderr = '';
    child.stderr!.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)));
    await new Promise<void>((resolve, reject) => {
      let stdout = '';
      let ready = false;
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`El servidor propio no arrancó en ${BOOT_TIMEOUT_MS} ms (puerto ${port}): ${stderr}`));
      }, BOOT_TIMEOUT_MS);
      const onExit = (code: number | null, signal: string | null) => {
        clearTimeout(timer);
        reject(new Error(`El servidor propio terminó al arrancar (puerto ${port}, código ${code ?? signal}): ${stderr}`));
      };
      child.once('exit', onExit);
      child.stdout!.on('data', (d: Buffer) => {
        if (ready) return; // se sigue leyendo para que la tubería no se llene
        stdout += d.toString();
        if (!stdout.includes(`Servidor listo en ${url}`)) return;
        ready = true;
        clearTimeout(timer);
        child.off('exit', onExit);
        resolve();
      });
    });
  };

  const kill = async () => {
    const child = proc;
    proc = null;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGKILL');
    });
  };

  await launch();
  const server: OwnServer = {
    port,
    url,
    start: async () => {
      if (!server.running()) await launch();
    },
    kill,
    running: () => !!proc && proc.exitCode === null && proc.signalCode === null
  };
  return server;
}

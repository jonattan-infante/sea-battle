// Servidor de juego propio para los tests que lo llenan (AC-12), lo paran y lo relanzan (AC-99) o necesitan un mundo
// aislado que pueden alterar sin afectar a los servidores compartidos de playwright.config.ts (hundir NPC, PvP).
// Usa el mismo build de producción (.next-e2e) en un puerto libre de 3600–3699, fuera de los rangos del harness
// principal (3100–3103), de dev-render (3200) y de QA (3300–3301).
import { ChildProcess, spawn } from 'child_process';
import net from 'net';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const PORT_RANGE = { from: 3600, to: 3699 };
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

// Empieza en un punto aleatorio del rango para que dos corridas simultáneas no elijan el mismo puerto
async function freePort(): Promise<number> {
  const size = PORT_RANGE.to - PORT_RANGE.from + 1;
  const offset = Math.floor(Math.random() * size);
  for (let i = 0; i < size; i++) {
    const port = PORT_RANGE.from + ((offset + i) % size);
    if (await isFree(port)) return port;
  }
  throw new Error(`No hay puertos libres en ${PORT_RANGE.from}–${PORT_RANGE.to}`);
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

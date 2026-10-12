// Clúster temporal de Postgres para los tests (Jest y e2e): initdb en un directorio temporal y un puerto libre. Lo arranca
// un vigía aparte, unido al proceso que lo pide por una tubería: cuando la tubería se cierra (fin normal, Ctrl-C, timeout o
// SIGKILL), el vigía para Postgres y borra el directorio. Así nunca queda un postgres huérfano ni un clúster en disco.
import { ChildProcess, execFileSync, spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { Client } from 'pg';

const BIN_CANDIDATES = [
  '/opt/homebrew/opt/postgresql@17/bin',
  '/opt/homebrew/opt/postgresql@16/bin',
  '/opt/homebrew/opt/postgresql@15/bin',
  '/opt/homebrew/opt/postgresql@14/bin',
  '/usr/local/opt/postgresql@17/bin',
  '/usr/lib/postgresql/17/bin',
  '/usr/lib/postgresql/16/bin'
];

function findBinDir(): string | null {
  if (process.env.PG_BIN && fs.existsSync(path.join(process.env.PG_BIN, 'initdb'))) return process.env.PG_BIN;
  try {
    const dir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
    if (fs.existsSync(path.join(dir, 'initdb'))) return dir;
  } catch {
    /* sin pg_config en el PATH */
  }
  return BIN_CANDIDATES.find((dir) => fs.existsSync(path.join(dir, 'initdb'))) ?? null;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });

// El vigía arranca postgres como hijo suyo y lo para (SIGINT = parada rápida; SIGKILL a los 5 s) al cerrarse su stdin
const WATCHDOG = `
const { spawn } = require('child_process');
const fs = require('fs');
const [bin, dir, port] = process.argv.slice(1);
const pg = spawn(bin + '/postgres', ['-D', dir, '-p', port, '-k', dir, '-h', '127.0.0.1', '-F', '-c', 'max_connections=300'], { stdio: 'ignore' });
let stopping = false;
pg.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} process.exit(0); });
const stop = () => {
  if (stopping) return;
  stopping = true;
  try { pg.kill('SIGINT'); } catch {}
  setTimeout(() => { try { pg.kill('SIGKILL'); } catch {} }, 5000).unref();
};
process.stdin.on('end', stop);
process.stdin.on('close', stop);
process.stdin.on('error', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.stdin.resume();
`;

async function waitReady(url: string, timeoutMs: number): Promise<void> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 1000 });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch (e) {
      await client.end().catch(() => {});
      if (Date.now() > end) throw new Error(`Postgres temporal no responde: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

export const NO_POSTGRES =
  'No hay Postgres para los tests de persistencia: define TEST_DATABASE_URL (la CI lo hace) o instala Postgres (brew install postgresql@17) o fija PG_BIN';

export interface TempCluster {
  url: string;
  watchdog: ChildProcess;
  stop: () => Promise<void>; // cierra la tubería y espera a que el vigía pare Postgres y borre el directorio
}

export async function startTempCluster(): Promise<TempCluster> {
  const bin = findBinDir();
  if (!bin) throw new Error(NO_POSTGRES);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sea-battle-pg-'));
  execFileSync(path.join(bin, 'initdb'), ['-D', dir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C', '--no-sync', '--no-instructions'], { stdio: 'ignore' });
  const port = await freePort();
  const watchdog = spawn(process.execPath, ['-e', WATCHDOG, bin, dir, String(port)], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
  watchdog.unref();
  (watchdog.stdin as unknown as { unref: () => void }).unref();
  const url = `postgres://postgres@127.0.0.1:${port}/postgres`;
  const stop = () => stopWatchdog(watchdog);
  try {
    await waitReady(url, 20_000);
  } catch (e) {
    await stop();
    throw e;
  }
  return { url, watchdog, stop };
}

export async function stopWatchdog(watchdog: ChildProcess): Promise<void> {
  if (!watchdog.pid) return;
  watchdog.stdin?.end();
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    try {
      process.kill(watchdog.pid, 0);
    } catch {
      return; // el vigía terminó: postgres parado y directorio borrado
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`El vigía de Postgres (pid ${watchdog.pid}) no terminó en 10 s`);
}

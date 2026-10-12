// Lanza game-process.ts como proceso hijo (node --import tsx: un solo proceso, así kill -9 le llega a él y no a un
// envoltorio). Un vigía unido al test por una tubería lo mata si Jest muere sin limpiar, como e2e/own-server.ts
import { ChildProcess, spawn } from 'child_process';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const ENTRY = path.join(__dirname, 'game-process.ts');
const BOOT_TIMEOUT_MS = 30_000;

export interface GameChild {
  url: string;
  output: () => string;
  addGold: (userId: string, amount: number) => Promise<boolean>;
  kill: (signal: 'SIGKILL' | 'SIGTERM') => Promise<{ code: number | null; signal: string | null }>;
}

function guard(child: ChildProcess): void {
  const watchdog = spawn(
    process.execPath,
    ['-e', `process.stdin.on('end', () => { try { process.kill(${child.pid}, 'SIGKILL'); } catch {} process.exit(0); }); process.stdin.resume();`],
    { stdio: ['pipe', 'ignore', 'ignore'], detached: true }
  );
  watchdog.unref();
  (watchdog.stdin as unknown as { unref: () => void }).unref();
  child.once('exit', () => watchdog.stdin?.end());
}

export async function startGameChild(env: Record<string, string>): Promise<GameChild> {
  const child = spawn(process.execPath, ['--import', 'tsx', ENTRY], {
    cwd: ROOT,
    env: { ...process.env, AUTH_BYPASS: '1', SEA_BATTLE_NPCS: '0', PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  guard(child);
  let out = '';
  child.stdout!.on('data', (d: Buffer) => (out = (out + d.toString()).slice(-20_000)));
  child.stderr!.on('data', (d: Buffer) => (out = (out + d.toString()).slice(-20_000)));
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));

  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`El proceso de juego no arrancó en ${BOOT_TIMEOUT_MS} ms:\n${out}`)), BOOT_TIMEOUT_MS);
    const onData = () => {
      const m = /READY (\d+)/.exec(out);
      if (!m) return;
      clearTimeout(timer);
      child.stdout!.off('data', onData);
      resolve(Number(m[1]));
    };
    child.stdout!.on('data', onData);
    exited.then(({ code, signal }) => {
      clearTimeout(timer);
      reject(new Error(`El proceso de juego terminó al arrancar (${code ?? signal}):\n${out}`));
    });
  }).catch(async (err) => {
    child.kill('SIGKILL');
    await exited;
    throw err;
  });

  let nextId = 1;
  return {
    url: `http://127.0.0.1:${port}`,
    output: () => out,
    addGold: (userId, amount) =>
      new Promise((resolve) => {
        const id = nextId++;
        const onMessage = (msg: { id: number; ok: boolean }) => {
          if (msg.id !== id) return;
          child.off('message', onMessage);
          resolve(msg.ok);
        };
        child.on('message', onMessage);
        child.send({ id, type: 'addGold', userId, amount });
      }),
    kill: async (signal) => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
      return exited;
    }
  };
}

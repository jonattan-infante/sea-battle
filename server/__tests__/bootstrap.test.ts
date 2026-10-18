// Arranque con la BD del progreso (server/bootstrap.ts): en Railway es obligatoria; fuera, sin DATABASE_URL todo vive en
// memoria (e2e, dev:guest) y con ella se migra antes de abrir el puerto
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { C2S, S2C } from '../../src/game/protocol';
import { databaseConfigError, GameStack, startGame } from '../bootstrap';
import { createTestDb, TestDb } from './pg/test-db';

describe('DATABASE_URL', () => {
  test.each(['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID'])('en Railway es obligatoria (%s presente)', (marker) => {
    expect(databaseConfigError({ [marker]: 'x' })).toMatch(/Falta DATABASE_URL/);
    expect(databaseConfigError({ [marker]: 'x', DATABASE_URL: 'postgres://h/db' })).toBeNull();
  });

  test('fuera de Railway no hace falta', () => {
    expect(databaseConfigError({})).toBeNull();
  });

  test('en Railway sin DATABASE_URL el servidor termina con código 1 y no abre el puerto', () => {
    const { spawnSync } = jest.requireActual('child_process') as typeof import('child_process');
    const port = String(40000 + Math.floor(Math.random() * 10000));
    const result = spawnSync('npx', ['tsx', 'server/index.ts'], {
      env: { ...process.env, RAILWAY_ENVIRONMENT: 'staging', DATABASE_URL: '', AUTH_BYPASS: '', PORT: port, NODE_ENV: 'production' },
      encoding: 'utf8',
      timeout: 60_000
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Falta DATABASE_URL');
    expect(result.stdout).not.toContain('Servidor listo');
  }, 70_000);
});

describe('startGame', () => {
  // Lo que arranca cada test se para en afterEach, también si falla un expect o si arranca lo que debía fallar: con el
  // bucle del juego o el pool vivos, Jest no termina (O-34)
  const stacks: GameStack[] = [];
  const servers: Server[] = [];
  const dbs: TestDb[] = [];
  afterEach(async () => {
    for (const { game, pool } of stacks.splice(0)) {
      game.stop();
      await pool?.end();
    }
    servers.splice(0).forEach((s) => s.close());
    for (const db of dbs.splice(0)) await db.drop();
  });
  const io = () => {
    const server = new Server(createServer());
    servers.push(server);
    return server;
  };
  async function boot(...args: Parameters<typeof startGame>): Promise<GameStack> {
    const stack = await startGame(...args);
    stacks.push(stack);
    return stack;
  }

  test('sin DATABASE_URL (fuera de Railway) arranca sin BD y lo avisa', async () => {
    const logs: string[] = [];
    const { pool } = await boot(io(), { SEA_BATTLE_NPCS: '0' }, (m) => logs.push(m));
    expect(pool).toBeNull();
    expect(logs.join('\n')).toMatch(/Sin DATABASE_URL/);
  });

  test('con DATABASE_URL migra antes de devolver el servidor', async () => {
    const db = await createTestDb();
    dbs.push(db);
    await boot(io(), { SEA_BATTLE_NPCS: '0', DATABASE_URL: db.url });
    const { rows } = await db.admin.query("SELECT to_regclass('player_progress') IS NOT NULL AS ok");
    expect(rows[0].ok).toBe(true);
  });

  test('si la BD no responde, falla (y el proceso no abre el puerto)', async () => {
    await expect(boot(io(), { SEA_BATTLE_NPCS: '0', DATABASE_URL: 'postgres://postgres@127.0.0.1:1/none' })).rejects.toThrow();
  });
});

// AC-142 / AC-143: las métricas del proceso van activas por defecto (una línea por minuto con jugadores);
// SEA_BATTLE_METRICS=0 las apaga y SEA_BATTLE_METRICS_MS acorta la ventana (el humo del arnés de estrés)
describe('métricas del proceso', () => {
  async function playFor(env: Record<string, string>, ms: number): Promise<string[]> {
    const logs: string[] = [];
    const http: HttpServer = createServer();
    const server = new Server(http);
    const { game } = await startGame(server, { SEA_BATTLE_NPCS: '0', AUTH_BYPASS: '1', ...env }, (m) => logs.push(m));
    await new Promise<void>((resolve) => http.listen(0, resolve));
    const client = ioClient(`http://localhost:${(http.address() as AddressInfo).port}`, { transports: ['websocket'], reconnection: false, auth: { guest: true } });
    try {
      await new Promise<void>((resolve) => {
        client.on(S2C.welcome, () => resolve());
        client.emit(C2S.join, {});
      });
      await new Promise((r) => setTimeout(r, ms));
    } finally {
      client.disconnect();
      game.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    return logs.filter((l) => l.startsWith('📈 Métricas'));
  }

  test('activas por defecto, con la ventana de SEA_BATTLE_METRICS_MS', async () => {
    const lines = await playFor({ SEA_BATTLE_METRICS_MS: '1000' }, 1600);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/ jugadores=1 /);
  });

  test('SEA_BATTLE_METRICS=0 las apaga', async () => {
    expect(await playFor({ SEA_BATTLE_METRICS: '0', SEA_BATTLE_METRICS_MS: '1000' }, 1600)).toEqual([]);
  });

  test('una ventana no válida se ignora y queda la de 60 s', async () => {
    expect(await playFor({ SEA_BATTLE_METRICS_MS: '50' }, 1200)).toEqual([]);
  });
});

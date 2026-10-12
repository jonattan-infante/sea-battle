// Arranque con la BD del progreso (server/bootstrap.ts): en Railway es obligatoria; fuera, sin DATABASE_URL todo vive en
// memoria (e2e, dev:guest) y con ella se migra antes de abrir el puerto
import { createServer } from 'http';
import { Server } from 'socket.io';
import { databaseConfigError, startGame } from '../bootstrap';
import { createTestDb } from './pg/test-db';

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
  const io = () => new Server(createServer());

  test('sin DATABASE_URL (fuera de Railway) arranca sin BD y lo avisa', async () => {
    const logs: string[] = [];
    const server = io();
    const { game, pool } = await startGame(server, { SEA_BATTLE_NPCS: '0' }, (m) => logs.push(m));
    expect(pool).toBeNull();
    expect(logs.join('\n')).toMatch(/Sin DATABASE_URL/);
    game.stop();
    server.close();
  });

  test('con DATABASE_URL migra antes de devolver el servidor', async () => {
    const db = await createTestDb();
    const server = io();
    try {
      const { game, pool } = await startGame(server, { SEA_BATTLE_NPCS: '0', DATABASE_URL: db.url });
      const { rows } = await db.admin.query("SELECT to_regclass('player_progress') IS NOT NULL AS ok");
      expect(rows[0].ok).toBe(true);
      game.stop();
      await pool!.end();
    } finally {
      server.close();
      await db.drop();
    }
  });

  test('si la BD no responde, falla (y el proceso no abre el puerto)', async () => {
    const server = io();
    try {
      await expect(startGame(server, { SEA_BATTLE_NPCS: '0', DATABASE_URL: 'postgres://postgres@127.0.0.1:1/none' })).rejects.toThrow();
    } finally {
      server.close();
    }
  });
});

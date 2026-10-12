// Despliegue en Railway (AC-129, AC-133): una réplica, sin solape y con drenaje de 15 s para el apagado ordenado; el
// proceso es `node` directo (el SIGTERM le llega a él) y NODE_ENV se fija en el código
import fs from 'fs';
import path from 'path';
import { applyRailwayNodeEnv } from '../railway-env';
import { SHUTDOWN_FLUSH_MS } from '../shutdown';

const ROOT = path.join(__dirname, '..', '..');

describe('railway.json', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'railway.json'), 'utf8'));

  test('una réplica y sin solape: un solo mundo y un solo escritor por userId (AC-133)', () => {
    expect(config.deploy.numReplicas).toBe(1);
    expect(config.deploy.overlapSeconds).toBe(0);
  });

  test('drenaje de 15 s, más que el plazo del apagado ordenado: el SIGKILL no corta la escritura (AC-129)', () => {
    expect(config.deploy.drainingSeconds).toBe(15);
    expect(config.deploy.drainingSeconds * 1000).toBeGreaterThan(SHUTDOWN_FLUSH_MS + 2000);
  });

  test('arranca con node directo (npm puede no pasar el SIGTERM) y comprueba /healthz', () => {
    expect(config.deploy.startCommand).toBe('node dist/server/index.js');
    expect(config.deploy.healthcheckPath).toBe('/healthz');
  });
});

describe('NODE_ENV en Railway', () => {
  test.each(['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID'])('con %s es producción, aunque falte o diga otra cosa', (marker) => {
    const missing: Record<string, string | undefined> = { [marker]: 'x' };
    applyRailwayNodeEnv(missing);
    expect(missing.NODE_ENV).toBe('production');
    const wrong: Record<string, string | undefined> = { [marker]: 'x', NODE_ENV: 'development' };
    applyRailwayNodeEnv(wrong);
    expect(wrong.NODE_ENV).toBe('production');
  });

  test('fuera de Railway no se toca', () => {
    const local: Record<string, string | undefined> = { NODE_ENV: 'development' };
    applyRailwayNodeEnv(local);
    expect(local.NODE_ENV).toBe('development');
    const none: Record<string, string | undefined> = {};
    applyRailwayNodeEnv(none);
    expect(none.NODE_ENV).toBeUndefined();
  });

  test('server/index.ts lo aplica antes de cargar nada más (Next.js y React leen NODE_ENV al cargarse)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'server', 'index.ts'), 'utf8');
    const firstImport = source.split('\n').find((line) => line.startsWith('import '));
    expect(firstImport).toBe("import './railway-env';");
  });
});

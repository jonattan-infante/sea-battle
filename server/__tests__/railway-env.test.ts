// NODE_ENV en Railway: siempre producción, fijado en el código (server/railway-env.ts) antes de que Next.js y React lo lean.
// La configuración de despliegue (arranque, healthcheck, réplicas, solape y drenaje) no está en el repo: vive en los ajustes
// y variables del servicio en Railway, y la comprueba scripts/railway/check_deploy.py (TECH-ARCHITECTURE §2.1)
import fs from 'fs';
import path from 'path';
import { applyRailwayNodeEnv } from '../railway-env';

const ROOT = path.join(__dirname, '..', '..');

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

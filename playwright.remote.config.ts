// Arnés remoto: corre contra un despliegue real (BASE_URL), sin servidores locales ni AUTH_BYPASS, con un usuario de
// prueba de Clerk (e2e/remote/global-setup.ts). Fuera de verify y de test:e2e: `BASE_URL=https://… npm run test:remote`.
// Variables y secretos: docs/game/TECH-ARCHITECTURE.md §4. Trace siempre apagado: el inicio de sesión viaja en las
// peticiones
import { defineConfig } from '@playwright/test';
import { loadRemoteEnv, stateFile } from './e2e/remote/env';
import { chrome } from './playwright.config';

loadRemoteEnv();
// Sin BASE_URL el config carga igual y el global setup da NO VERIFICADO con el motivo
const url = process.env.BASE_URL && URL.canParse(process.env.BASE_URL) ? new URL(process.env.BASE_URL) : undefined;

export default defineConfig({
  testDir: './e2e/remote',
  globalSetup: './e2e/remote/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'test-results/remote',
  use: {
    baseURL: url?.origin,
    storageState: url ? stateFile(url) : undefined,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'desktop', use: { ...chrome, viewport: { width: 1440, height: 900 } } }]
});

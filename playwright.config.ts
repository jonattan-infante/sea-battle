// Harness e2e, de rendimiento y de capturas. Corre contra un build de producción propio en .next-e2e
// (`npm run build:e2e`; los scripts test:e2e, test:perf y qa:capture ya lo hacen).
// Servidores: invitado con NPC (3100), invitado sin NPC para medir reposo y con 2 000 de oro (3101), sin invitado (3102)
// y escenario determinista de capturas (3103).
import { defineConfig, devices } from '@playwright/test';

// PW_PORT_BASE permite correr una copia aislada del harness en paralelo sin chocar con otra corrida (por defecto 3100).
// Los servidores propios de los specs (e2e/own-server.ts) usan el rango [PW_PORT_BASE + 500, PW_PORT_BASE + 599]
// (3600–3699 por defecto), o [PW_OWN_PORT_BASE, PW_OWN_PORT_BASE + 99] si se fija; nunca un puerto que Chrome bloquee.
const BASE = Number(process.env.PW_PORT_BASE ?? 3100);
export const PORTS = { game: BASE, empty: BASE + 1, auth: BASE + 2, showcase: BASE + 3 } as const;

const server = (port: number, env: string) => ({
  command: `${env} PORT=${port} NEXT_DIST_DIR=.next-e2e NODE_ENV=production node dist/server/index.js`,
  url: `http://localhost:${port}/healthz`,
  reuseExistingServer: false, // nunca reutilizar un servidor ajeno o viejo: si el puerto está ocupado, fallar
  timeout: 60_000,
  stdout: 'ignore' as const,
  stderr: 'pipe' as const
});

// Chrome del sistema con GPU (Metal en macOS): con SwiftShader el WebGL por software satura la CPU
export const chrome = {
  channel: 'chrome',
  launchOptions: { args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] }
};

export default defineConfig({
  testDir: './e2e',
  testIgnore: 'remote/**', // contra un despliegue real: playwright.remote.config.ts
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORTS.game}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    server(PORTS.game, 'AUTH_BYPASS=1'),
    server(PORTS.empty, 'AUTH_BYPASS=1 SEA_BATTLE_NPCS=0 SEA_BATTLE_SCENARIO=shipyard'),
    server(PORTS.auth, ''),
    server(PORTS.showcase, 'AUTH_BYPASS=1 SEA_BATTLE_NPCS=0 SEA_BATTLE_SCENARIO=showcase')
  ],
  projects: [
    { name: 'desktop', use: { ...chrome, viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    {
      name: 'mobile',
      use: { ...chrome, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent },
      grep: /@mobile/
    }
  ]
});

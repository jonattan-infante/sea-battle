// Arnés remoto: antes de los specs comprueba que el despliegue responde (/healthz) y entra con el usuario de prueba de
// Clerk (método A o C, ver env.ts); guarda la sesión en .auth/ para los specs
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { chromium, FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { Health } from '../../server/health';
import { baseUrl, loadRemoteEnv, loginMethod, notVerified, prodGuard, stateFile } from './env';

export default async function globalSetup(config: FullConfig) {
  loadRemoteEnv();
  const url = baseUrl();
  prodGuard(url);
  const method = loginMethod();

  let health: Health;
  try {
    const res = await fetch(new URL('/healthz', url));
    health = (await res.json()) as Health;
    if (!res.ok || health.ok !== true) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    throw notVerified(`${url.origin}/healthz no responde (${(e as Error).message})`);
  }
  process.env.REMOTE_HEALTH = JSON.stringify(health);
  console.log(`REMOTE: ${url.origin} · commit ${health.commit ?? 'desconocido'} · ${health.players} jugadores · uptime ${health.uptimeSeconds} s · login ${method.kind}`);

  const { channel, launchOptions } = config.projects[0].use;
  const browser = await chromium.launch({ channel, ...launchOptions });
  try {
    const context = await browser.newContext({ baseURL: url.origin });
    const page = await context.newPage();
    await page.goto('/');
    // La clave publicable y el Frontend API salen del propio despliegue: así nunca se mezcla otra instancia de Clerk
    const instance = await page
      .waitForFunction(() => (window.Clerk?.loaded ? { publishableKey: window.Clerk.publishableKey, frontendApi: window.Clerk.frontendApi } : null), null, { timeout: 30_000 })
      .then((h) => h.jsonValue())
      .catch(() => null);
    if (!instance) throw notVerified(`la landing de ${url.origin} no carga Clerk`);
    try {
      if (method.kind === 'A') {
        await clerkSetup({ publishableKey: instance.publishableKey, frontendApiUrl: instance.frontendApi, secretKey: method.secretKey, dotenv: false });
        await clerk.signIn({ page, emailAddress: method.email });
      } else {
        process.env.CLERK_FAPI = instance.frontendApi; // el helper lo exige aunque no haya Testing Token
        await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: method.email, password: method.password } });
      }
      await page.waitForFunction(() => !!window.Clerk.user, null, { timeout: 15_000 });
    } catch (e) {
      throw notVerified(`no se pudo iniciar sesión con el usuario de prueba (método ${method.kind}): ${(e as Error).message.split('\n')[0]}`);
    }
    fs.mkdirSync(path.dirname(stateFile(url)), { recursive: true });
    await context.storageState({ path: stateFile(url) });
  } finally {
    await browser.close();
  }
}

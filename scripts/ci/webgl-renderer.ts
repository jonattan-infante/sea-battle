// CI (job e2e de ci.yml): qué Chrome y qué WebGL da en esta máquina la config de Playwright, antes de los e2e. Falla si no
// hay WebGL2: sin él, los e2e del juego caerían todos con un motivo menos claro
//   npx tsx scripts/ci/webgl-renderer.ts
import { chromium } from '@playwright/test';
import { chrome } from '../../playwright.config';

(async () => {
  const browser = await chromium.launch({ channel: chrome.channel, args: chrome.launchOptions.args });
  const page = await browser.newPage();
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
  console.log(`Chrome ${browser.version()}, args ${chrome.launchOptions.args.join(' ')}, WebGL2: ${renderer ?? 'NO'}`);
  await browser.close();
  if (!renderer) process.exitCode = 1;
})();

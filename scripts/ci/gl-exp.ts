// TEMPORAL (experimento del PR #45, se quita antes de fusionar): tres WebGL por CPU en el runner de GitHub, para ver
// cuál da más frames con el juego. Ejecutado directamente, dice qué renderer da cada uno
//   GL_EXP=lavapipe npx tsx scripts/ci/gl-exp.ts
import { chromium } from '@playwright/test';

export const GL_ARGS: Record<string, string[]> = {
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  // Vulkan por software de Mesa (mesa-vulkan-drivers) en vez del SwiftShader que trae Chrome
  lavapipe: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,CDPScreenshotNewSurface', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  // OpenGL por software de Mesa (llvmpipe) por EGL sin superficie
  llvmpipe: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
};

export const glArgs = () => GL_ARGS[process.env.GL_EXP ?? 'swiftshader'];

if (require.main === module) {
  (async () => {
    const browser = await chromium.launch({ channel: 'chrome', args: glArgs() });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    });
    console.log(`GL_EXP=${process.env.GL_EXP} args ${glArgs().join(' ')} → WebGL2: ${renderer ?? 'NO'}`);
    await browser.close();
  })();
}

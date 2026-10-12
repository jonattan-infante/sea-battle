// U6-a (ART-DIRECTION §16.1): portada de la landing generada con el motor. Arranca un servidor invitado en el
// puerto 3200, abre Chrome con GPU, pone la cámara de presentación (40°, ppm = 1,6·ppm₀) con la escena sintética
// 'hero' (src/client/synthetic-scene.ts) y escribe public/landing-hero.webp (1920×1080, ≤ 220 KB) y
// public/landing-hero-mobile.webp (828×1792, ≤ 120 KB). Sin dependencias nuevas: WebP con el codificador del canvas
// de Chrome (Playwright no exporta WebP). Copias PNG sin pérdida en qa-artifacts/render/ para revisión.
//
// Por defecto usa el build de producción de .next-e2e (`npm run qa:hero` lo genera antes). Con QA_HERO_DEV=1
// arranca el servidor de desarrollo (sin build). Siempre cierra Chrome y el servidor, también si falla.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.QA_HERO_PORT ?? 3200);
const DEV = process.env.QA_HERO_DEV === '1';
const BASE = `http://localhost:${PORT}`;
const PREVIEWS = path.join(ROOT, 'qa-artifacts', 'render');

const SHOTS = [
  { file: 'landing-hero.webp', viewport: { width: 1920, height: 1080 }, scale: 1, size: [1920, 1080], maxBytes: 220 * 1024 },
  // 414×896 CSS a 2× = 828×1792: el layout vertical del juego (reserva de HUD de móvil) con la densidad de un teléfono
  { file: 'landing-hero-mobile.webp', viewport: { width: 414, height: 896 }, scale: 2, size: [828, 1792], maxBytes: 120 * 1024 }
];

async function healthy() {
  try {
    return (await fetch(`${BASE}/healthz`)).ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (await healthy()) throw new Error(`El puerto ${PORT} ya está ocupado: no reutilizo un servidor ajeno`);
  const env = { ...process.env, AUTH_BYPASS: '1', SEA_BATTLE_NPCS: '0', PORT: String(PORT) };
  const child = DEV
    ? spawn('npx', ['tsx', 'server/index.ts'], { cwd: ROOT, env: { ...env, NODE_ENV: 'development' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true })
    : spawn('node', ['dist/server/index.js'], { cwd: ROOT, env: { ...env, NODE_ENV: 'production', NEXT_DIST_DIR: '.next-e2e' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  child.stderr.on('data', (d) => process.stderr.write(d));
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`El servidor terminó con código ${child.exitCode}`);
    if (await healthy()) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('El servidor no respondió en 90 s');
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM'); // grupo completo: npx → tsx → node
  } catch {
    child.kill('SIGTERM');
  }
}

async function shoot(browser, shot) {
  const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: shot.scale });
  try {
    const page = await context.newPage();
    page.on('dialog', (d) => void d.dismiss());
    // El primer acceso compila la ruta en modo desarrollo
    await page.goto(`${BASE}/game`, { timeout: 120_000 });
    await page.waitForFunction(() => window.__SEA_BATTLE__?.ready() === true, null, { timeout: 120_000 });
    await page.evaluate(() => {
      const rt = window.__SEA_BATTLE__.runtime();
      rt.setCameraPreset('presentation');
      window.__heroScene = rt.startScene('hero');
    });
    // La coreografía vive en la escena (HERO_CAPTURE_S): se captura en el primer frame que llega a ese instante
    const capture = await page.evaluate(async () => {
      const rt = window.__SEA_BATTLE__.runtime();
      const scene = window.__heroScene;
      await new Promise((resolve) => {
        const tick = () => (scene.serverTime() >= scene.spec.captureAt ? resolve() : requestAnimationFrame(tick));
        tick();
      });
      const png = rt.captureImage('image/png');
      return { png, at: scene.serverTime(), info: rt.lastFrameInfo(), stats: rt.stats() };
    }, null);
    if (!capture.png) throw new Error('captureImage devolvió null');
    // Un único frame, codificado con calidades decrecientes hasta caber en el presupuesto
    const encoded = await page.evaluate(async ({ png, maxBytes }) => {
      const img = new Image();
      img.src = png;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const bytes = (url) => {
        const b64 = url.slice(url.indexOf(',') + 1);
        return (b64.length * 3) / 4 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
      };
      for (let q = 0.95; q >= 0.3; q -= 0.05) {
        const url = canvas.toDataURL('image/webp', q);
        if (!url.startsWith('data:image/webp')) return { error: 'El navegador no codifica WebP' };
        if (bytes(url) <= maxBytes) return { url, quality: Math.round(q * 100) / 100, width: img.naturalWidth, height: img.naturalHeight };
      }
      return { error: `Ninguna calidad ≥ 0,3 cabe en ${maxBytes} bytes` };
    }, { png: capture.png, maxBytes: shot.maxBytes });
    if (encoded.error) throw new Error(`${shot.file}: ${encoded.error}`);
    if (encoded.width !== shot.size[0] || encoded.height !== shot.size[1]) {
      throw new Error(`${shot.file}: ${encoded.width}×${encoded.height}, se esperaba ${shot.size[0]}×${shot.size[1]}`);
    }
    const webp = Buffer.from(encoded.url.slice(encoded.url.indexOf(',') + 1), 'base64');
    fs.writeFileSync(path.join(ROOT, 'public', shot.file), webp);
    fs.writeFileSync(path.join(PREVIEWS, shot.file.replace('.webp', '.png')), Buffer.from(capture.png.slice(capture.png.indexOf(',') + 1), 'base64'));
    return { file: shot.file, width: encoded.width, height: encoded.height, bytes: webp.length, maxBytes: shot.maxBytes, quality: encoded.quality, at: capture.at, ...capture.info, ppm: capture.stats.ppm, ppm0: capture.stats.ppm0 };
  } finally {
    await context.close();
  }
}

let server = null;
let browser = null;
try {
  fs.mkdirSync(PREVIEWS, { recursive: true });
  server = await startServer();
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
  const results = [];
  for (const shot of SHOTS) results.push(await shoot(browser, shot));
  for (const r of results) {
    console.log(`${r.file}: ${r.width}×${r.height} · ${(r.bytes / 1024).toFixed(1)} KB (máx. ${r.maxBytes / 1024} KB) · calidad ${r.quality} · t = ${r.at.toFixed(3)} s · ppm ${r.ppm.toFixed(3)} = ${(r.ppm / r.ppm0).toFixed(2)}·ppm₀ · ${r.calls} draw calls · ${r.triangles} triángulos`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopServer(server);
}

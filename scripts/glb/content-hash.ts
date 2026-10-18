// Hash de contenido de los assets que se sirven con caché de un año (AC-193 c, next.config.ts): 8 hex del SHA-256 de sus
// bytes, en orden. El transcodificador de KTX2 vive en public/basis/<hash>/ y cada GLB en public/models/<nombre>.<hash>.glb:
// si el contenido cambia, cambia la URL, y el navegador no se queda con el viejo
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

export function contentHash(...parts: Uint8Array[]): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex').slice(0, 8);
}

// Los patrones de las rutas con caché de un año, en un solo sitio: los usan la regla de headers() de next.config.ts y
// HASHED_GLB, así que lo que el test da por bueno es justo lo que se sirve con immutable
export const HASH = '[0-9a-f]{8}';
export const HASHED_GLB_NAME = `[a-z0-9_]+\\.${HASH}\\.glb`;
export const HASHED_GLB = new RegExp(`^${HASHED_GLB_NAME}$`);

// Fixtures que build:e2e copia en public/models (fuera de git, .gitignore): no son assets del juego
export const E2E_PREFIX = 'e2e_';

// Lo que hay en una carpeta de modelos y no es <nombre>.<hash de su contenido>.glb (los fixtures de e2e aparte)
export function unhashedModels(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(E2E_PREFIX))
    .filter((e) => !e.isFile() || !HASHED_GLB.test(e.name) || e.name.split('.')[1] !== contentHash(fs.readFileSync(path.join(dir, e.name))))
    .map((e) => e.name)
    .sort();
}

// Falla pronto y con un mensaje claro si no hay build de producción
import fs from 'fs';
import path from 'path';

export default function globalSetup() {
  const root = path.join(__dirname, '..');
  const missing = ['dist/server/index.js', '.next-e2e/BUILD_ID'].filter((f) => !fs.existsSync(path.join(root, f)));
  if (missing.length) throw new Error(`Falta el build de producción (${missing.join(', ')}). Ejecuta "npm run build:e2e" antes de los e2e.`);
}

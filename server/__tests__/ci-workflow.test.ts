// DT-16: reglas del despliegue automático en .github/workflows/ci.yml que actionlint no mira. Staging solo con la
// etiqueta «staging» y nunca desde un fork (el secreto RAILWAY_TOKEN no debe llegar a código ajeno, y varios PR abiertos
// no deben pisarse staging); permisos mínimos (solo el job de prod escribe, para el tag y la release); acciones fijadas
import fs from 'fs';
import path from 'path';

const CI = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');
const CODE = CI.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'); // sin los comentarios

// El bloque de cada job: desde «  <nombre>:» hasta el siguiente job
function job(name: string): string {
  const start = CI.search(new RegExp(`^  ${name}:$`, 'm'));
  if (start < 0) throw new Error(`no hay job ${name}`);
  const rest = CI.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][a-z-]*:$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('despliegue automático (DT-16)', () => {
  test('deploy-staging: solo PR hacia main desde este repo, con la etiqueta staging, al ponerla o en un push posterior', () => {
    const staging = job('deploy-staging');
    expect(CI).toMatch(/^ {2}pull_request:\n {4}#[^\n]*\n {4}types: \[opened, synchronize, reopened, labeled\]$/m);
    expect(staging).toContain("github.event.pull_request.base.ref == 'main'");
    expect(staging).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(staging).toContain("contains(github.event.pull_request.labels.*.name, 'staging')");
    expect(staging).toContain("((github.event.action == 'labeled' && github.event.label.name == 'staging') || github.event.action == 'synchronize')");
    expect(staging).toMatch(/needs: verify/);
    expect(staging).toMatch(/group: staging\n\s+cancel-in-progress: false/);
  });

  test('deploy-production: solo push a main, tras verify, en el entorno production', () => {
    const prod = job('deploy-production');
    expect(prod).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(prod).toMatch(/needs: verify/);
    expect(prod).toMatch(/environment:\n\s+name: production/);
    expect(prod).toMatch(/group: production\n\s+cancel-in-progress: false/);
  });

  // El token se prueba en solo lectura antes de desplegar: si no puede leer, el job para sin tocar Railway
  test.each([
    ['deploy-staging', 'staging'],
    ['deploy-production', 'production']
  ])('%s prueba el token (token_check.py) antes de desplegar', (name, env) => {
    const steps = job(name);
    const check = steps.indexOf(`token_check.py --env ${env}`);
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(steps.indexOf(`deploy.py --env ${env}`));
  });

  test('permisos mínimos: lectura por defecto y escritura solo en deploy-production', () => {
    expect(CI).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(CODE.match(/contents: write/g)).toHaveLength(1);
    expect(job('deploy-production')).toMatch(/permissions:\n\s+contents: write/);
  });

  test('las acciones van fijadas a una versión exacta', () => {
    const uses = [...CI.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/@(v\d+\.\d+\.\d+|[0-9a-f]{40})$/);
  });

  test('el secreto solo va a los pasos que lo usan, nunca a un echo', () => {
    expect(CI).not.toMatch(/echo[^\n]*RAILWAY_TOKEN/);
    for (const line of CI.split('\n').filter((l) => l.includes('secrets.RAILWAY_TOKEN'))) expect(line.trim()).toBe('RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}');
  });
});

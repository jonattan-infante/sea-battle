// DT-16: reglas del despliegue automático en .github/workflows/ci.yml que actionlint no mira. Staging solo con la
// etiqueta «staging» y nunca desde un fork (el secreto RAILWAY_TOKEN no debe llegar a código ajeno, y varios PR abiertos
// no deben pisarse staging); verify siempre corre (H-29); permisos mínimos (solo el job de prod escribe, para el tag y la
// release); acciones fijadas
import fs from 'fs';
import path from 'path';

const CI = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');
const CODE = CI.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'); // sin los comentarios

// El bloque de cada job: desde «  <nombre>:» hasta el siguiente job (los nombres pueden llevar cifras, como e2e)
function job(name: string): string {
  const start = CI.search(new RegExp(`^  ${name}:$`, 'm'));
  if (start < 0) throw new Error(`no hay job ${name}`);
  const rest = CI.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][a-z0-9-]*:$/m);
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

  // H-29 (QA-19): verify corre en todos los eventos del PR, sin ningún if. GitHub cuenta un job saltado como «Success» y
  // no bloquea la fusión aunque sea un check obligatorio (docs.github.com, «Using conditions to control job execution»):
  // con un if, poner una etiqueta cualquiera en un PR con verify en rojo lo dejaría fusionable en main
  test('verify no tiene ninguna línea if: (un check obligatorio saltado cuenta como verde)', () => {
    expect(job('verify').split('\n').filter((l) => /^\s*(-\s+)?if:/.test(l))).toEqual([]);
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

// El e2e de Playwright en los PR: la selección de `npm run test:e2e` menos @gpu, el secreto de Clerk solo en el paso de
// los tests, cada shard cancela solo su corrida anterior del mismo PR, y los artefactos (el repo es público) se tapan y se
// comprueban antes de subirlos, y caducan a los 7 días
describe('e2e de Playwright en los PR', () => {
  const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const steps = (name: string) => job(name).split(/\n {6}- /);
  const step = (name: string, title: string) => {
    const found = steps(name).filter((s) => s.startsWith(`name: ${title}`));
    expect(found).toHaveLength(1);
    return found[0];
  };

  test('la selección de npm run test:e2e menos @gpu, en tantos shards como la matriz, con un reintento', () => {
    const e2e = job('e2e');
    const grep = PKG.scripts['test:e2e'].match(/--grep-invert "([^"]+)"/)?.[1];
    expect(grep).toBe('@perf|@capture|@soak'); // los turnos de QA en el Mac: @gpu sí corre allí
    expect(e2e).toContain(`--grep-invert "${grep}|@gpu"`);
    const shards = e2e.match(/shard: \[([\d, ]+)\]/)?.[1].split(',').length;
    expect(e2e).toContain(`--shard=\${{ matrix.shard }}/${shards} `);
    expect(e2e).toContain('--retries=1');
  });

  test('solo en PR (no al poner una etiqueta) y con permiso de solo lectura', () => {
    expect(job('e2e')).toContain("if: github.event_name == 'pull_request' && github.event.action != 'labeled'");
    for (const name of ['e2e', 'e2e-report']) expect(job(name)).toMatch(/permissions:\n\s+contents: read\n/);
  });

  test('el secreto de Clerk solo llega al paso de los tests, con la clave ficticia de reserva, y nunca a un echo', () => {
    const e2e = job('e2e');
    expect(job('e2e-report')).not.toMatch(/secrets\./);
    expect([...e2e.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1])).toEqual(['E2E_CLERK_SECRET_KEY', 'E2E_CLERK_SECRET_KEY', 'E2E_CLERK_SECRET_KEY']);
    const withValue = steps('e2e').filter((s) => /&& secrets\.E2E_CLERK_SECRET_KEY \|\|/.test(s));
    expect(withValue).toHaveLength(1);
    expect(withValue[0]).toMatch(/^name: e2e \(shard/);
    expect(withValue[0]).toContain("CLERK_SECRET_KEY: ${{ secrets.E2E_CLERK_SECRET_KEY != '' && vars.E2E_CLERK_PUBLISHABLE_KEY != '' && secrets.E2E_CLERK_SECRET_KEY || 'sk_live_dummy' }}");
    expect(e2e).toMatch(/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: \$\{\{ secrets\.E2E_CLERK_SECRET_KEY != '' && vars\.E2E_CLERK_PUBLISHABLE_KEY != '' && vars\.E2E_CLERK_PUBLISHABLE_KEY \|\| 'pk_live_[A-Za-z0-9]+' \}\}/);
    expect(CODE).not.toMatch(/echo[^\n]*CLERK|set -x/);
  });

  test('cada shard tiene su grupo de concurrencia por PR y cancela la corrida anterior', () => {
    expect(job('e2e')).toContain("format('e2e-pr-{0}-{1}', github.event.pull_request.number, matrix.shard)");
    expect(job('e2e')).toMatch(/cancel-in-progress: true/);
  });

  test('la salida de los tests pasa por redact_clerk.py, con pipefail para no perder su código de salida', () => {
    const run = step('e2e', 'e2e (shard');
    expect(run).toContain('shell: bash');
    expect(run).toMatch(/2>&1 \| python3 -u scripts\/ci\/redact_clerk\.py stream$/m);
  });

  test('nada se sube sin tapar y comprobar antes, y todo caduca a los 7 días', () => {
    const e2e = steps('e2e');
    const check = e2e.findIndex((s) => s.includes('redact_clerk.py check blob-report test-results'));
    expect(e2e.findIndex((s) => s.includes('redact_clerk.py redact blob-report test-results'))).toBe(check - 1);
    expect(e2e[check]).toContain('id: clean');
    const uploads = e2e.map((s, i) => [s, i] as const).filter(([s]) => s.includes('actions/upload-artifact'));
    expect(uploads).toHaveLength(2);
    for (const [s, i] of uploads) {
      expect(i).toBeGreaterThan(check);
      expect(s).toContain("steps.clean.outcome == 'success'");
    }
    const report = steps('e2e-report');
    const reportCheck = report.findIndex((s) => s.includes('redact_clerk.py check playwright-report e2e-results.json'));
    const reportUpload = report.findIndex((s) => s.includes('actions/upload-artifact'));
    expect(reportCheck).toBeGreaterThan(-1);
    expect(reportUpload).toBeGreaterThan(reportCheck);
    expect(report[reportUpload]).not.toMatch(/\bif:/); // si la comprobación falla, el paso no corre
    for (const [s] of [...uploads, [report[reportUpload], 0] as const]) expect(s).toMatch(/retention-days: 7$/m);
  });
});

// DT-14: Node 24 en todo. Railway (Railpack) toma la mayor de engines.node, la CI la de .nvmrc y estas pruebas corren con el
// Node que las lanza: si verify se corre con otra mayor, falla aquí, para que lo que QA aprueba sea lo que ejecuta prod
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const NODE_MAJOR = '24';

describe('Node 24 en todo (DT-14)', () => {
  test('package.json fija engines.node en 24.x (sin él, Railpack toma su «lts», que cambia de mayor)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.engines?.node).toBe(`${NODE_MAJOR}.x`);
  });

  test('.nvmrc tiene la misma mayor y la CI la lee de ahí', () => {
    expect(fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim()).toBe(NODE_MAJOR);
    const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toMatch(/^\s+node-version-file: \.nvmrc$/m);
    expect(ci).not.toMatch(/node-version:/);
  });

  test(`las pruebas corren en Node ${NODE_MAJOR}`, () => {
    expect(`Node ${process.versions.node}`).toMatch(new RegExp(`^Node ${NODE_MAJOR}\\.`));
  });
});

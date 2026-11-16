# Unitarios de check_healthz.py (AC-231), sin red. python3 -B -m unittest discover -s scripts/ci
import io, json, os, sys, tempfile, unittest
from contextlib import redirect_stdout
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_healthz
from check_healthz import check, parse_migrations, schema_version

SHA = '6b9d8f81b9f9803365915e24de9255845892b8db'
MIGRATE_1 = """export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `CREATE TABLE player_progress (version int)`
  }
];

const LOCK_KEY = 7_211_940_001;
"""
MIGRATE_3 = MIGRATE_1.replace('\n];', ',\n  {\n    version: 3,\n    sql: `ALTER TABLE x`\n  },\n  {\n    version: 2,\n    sql: `ALTER TABLE y`\n  }\n];')


def health(**over):
    body = {'ok': True, 'players': 0, 'uptimeSeconds': 12, 'commit': SHA, 'i2': True, 'map': '1.1',
            'startedAt': '2026-11-16T15:22:02.000Z', 'migrationsApplied': [], 'schemaVersion': 1}
    body.update(over)
    return json.dumps(body)


class SchemaVersion(unittest.TestCase):
    def test_la_mayor_de_migrations(self):
        self.assertEqual(schema_version(MIGRATE_1), 1)
        self.assertEqual(schema_version(MIGRATE_3), 3)

    def test_solo_cuenta_dentro_de_migrations(self):
        self.assertEqual(schema_version(MIGRATE_1 + '\nconst other = [{\n  version: 9,\n}];\n'), 1)

    def test_sin_migrations_falla(self):
        with self.assertRaises(ValueError):
            schema_version('const LOCK_KEY = 1;')
        with self.assertRaises(ValueError):
            schema_version('export const MIGRATIONS: Migration[] = [\n];')


class ParseMigrations(unittest.TestCase):
    def test_lista_de_enteros(self):
        self.assertEqual(parse_migrations('[]'), [])
        self.assertEqual(parse_migrations('[2, 3]'), [2, 3])

    def test_lo_demas_falla(self):
        for raw in ['', '2', '{}', '["2"]', '[true]', 'null']:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_migrations(raw)


class Check(unittest.TestCase):
    def test_cuadra(self):
        self.assertEqual(check(health(), SHA, [], 1), [])

    def test_commit_distinto(self):
        self.assertEqual(len(check(health(), '0' * 40, [], 1)), 1)
        self.assertIn('commit', check(health(), '0' * 40, [], 1)[0])

    def test_migraciones_distintas(self):
        # Un arranque que aplicó la 1 cuando se esperaba [] (o el mutante que devuelve MIGRATIONS)
        errors = check(health(migrationsApplied=[1]), SHA, [], 1)
        self.assertEqual(len(errors), 1)
        self.assertIn('migrationsApplied', errors[0])
        # Sin BD (null) no es «0 migraciones»
        self.assertIn('migrationsApplied', check(health(migrationsApplied=None, schemaVersion=1), SHA, [], 1)[0])
        # La declarada por el PR de la versión
        self.assertEqual(check(health(migrationsApplied=[2], schemaVersion=2), SHA, [2], 2), [])

    def test_esquema_distinto(self):
        errors = check(health(schemaVersion=0), SHA, [], 1)
        self.assertEqual(len(errors), 1)
        self.assertIn('schemaVersion', errors[0])

    def test_un_servidor_sin_los_campos_nuevos_falla(self):
        # Como la 1.2.1: trae commit, pero no migrationsApplied ni schemaVersion
        old = json.dumps({'ok': True, 'players': 0, 'uptimeSeconds': 3, 'commit': SHA, 'i2': True, 'map': '1.1'})
        self.assertEqual(len(check(old, SHA, [], 1)), 2)

    def test_lo_que_no_es_el_servidor(self):
        self.assertEqual(len(check('<html>502</html>', SHA, [], 1)), 1)
        self.assertEqual(len(check('[]', SHA, [], 1)), 1)
        self.assertEqual(len(check(health(ok=False), SHA, [], 1)), 1)

    def test_los_tres_a_la_vez(self):
        self.assertEqual(len(check(health(commit='x', migrationsApplied=[1], schemaVersion=7), SHA, [], 1)), 3)


class Main(unittest.TestCase):
    def run_main(self, args, body):
        with tempfile.NamedTemporaryFile('w', suffix='.ts', delete=False) as f:
            f.write(MIGRATE_1)
        try:
            out = io.StringIO()
            with mock.patch('sys.stdin', io.StringIO(body)), redirect_stdout(out):
                code = check_healthz.main(['--migrate-ts', f.name, *args])
            return code, out.getvalue()
        finally:
            os.unlink(f.name)

    def test_verde(self):
        code, out = self.run_main(['--commit', SHA], health())
        self.assertEqual(code, 0)
        self.assertIn('2026-11-16T15:22:02.000Z', out)

    def test_rojo_con_un_sha_falso(self):
        # Lo que hace la corrida forzada en rojo del job: el SHA esperado no es el desplegado
        code, out = self.run_main(['--commit', 'deadbeef' * 5], health())
        self.assertEqual(code, 1)
        self.assertIn('::error::AC-231: commit', out)

    def test_solo_la_version(self):
        code, out = self.run_main(['--schema-version'], '')
        self.assertEqual((code, out.strip()), (0, '1'))


if __name__ == '__main__':
    unittest.main()

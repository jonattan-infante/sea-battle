# Unitarios de deploy.py sin red (DT-16). python3 -B -m unittest discover -s scripts/railway
import os, sys, unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import SHA, classify, health_commit


class Classify(unittest.TestCase):
    def test_success_es_ok(self):
        self.assertEqual(classify('SUCCESS'), 'ok')

    def test_los_estados_finales_sin_exito_paran(self):
        for status in ('FAILED', 'CRASHED', 'REMOVED', 'SKIPPED', 'NEEDS_APPROVAL'):
            with self.subTest(status=status):
                self.assertEqual(classify(status), 'failed')

    def test_los_intermedios_esperan(self):
        for status in ('QUEUED', 'WAITING', 'INITIALIZING', 'BUILDING', 'DEPLOYING', 'UN_ESTADO_NUEVO'):
            with self.subTest(status=status):
                self.assertEqual(classify(status), 'pending')


class HealthCommit(unittest.TestCase):
    def test_lee_el_commit_de_healthz(self):
        self.assertEqual(health_commit('{"ok":true,"players":0,"uptimeSeconds":3,"commit":"abc"}'), 'abc')

    def test_sin_commit_es_none(self):
        self.assertIsNone(health_commit('{"ok":true,"players":0,"uptimeSeconds":3,"commit":null}'))

    def test_una_respuesta_que_no_es_la_del_servidor_es_none(self):
        for body in ('<html>Application failed to respond</html>', 'error: timed out', '{"commit":"abc"}', '[]'):
            with self.subTest(body=body):
                self.assertIsNone(health_commit(body))


class Sha(unittest.TestCase):
    def test_solo_un_sha_completo(self):
        self.assertTrue(SHA.match('7e7299fb562ed77a16cb57a15f95a9ba5f54062c'))
        for bad in ('7e7299f', 'main', '7E7299FB562ED77A16CB57A15F95A9BA5F54062C', '7e7299fb562ed77a16cb57a15f95a9ba5f54062c\n'):
            with self.subTest(sha=bad):
                self.assertIsNone(SHA.match(bad))


if __name__ == '__main__':
    unittest.main()

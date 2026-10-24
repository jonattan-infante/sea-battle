# Unitarios de check_deploy.py y railway_api.py sin red (DT-16, H-27). python3 -B -m unittest discover -s scripts/railway
import os, sys, unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import railway_api
from check_deploy import START, railpack_banner, shutdown_timeline, start_check

BANNER = 'Railpack 0.40.1\n  Steps\n  ──────────\n  ▸ build\n    $ npm run build\n  Deploy\n  ──────────\n    $ {cmd}\n'


class StartCheck(unittest.TestCase):
    # H-27 (QA-13 §5): sin el banner de Railpack en los logs del build, el plan no se puede comprobar y no cuenta
    def test_sin_banner_y_ajuste_y_manifest_con_start_no_falla(self):
        ok, detail = start_check(START, START, '')
        self.assertTrue(ok)
        self.assertIn('no comprobable', detail)

    def test_sin_banner_falla_si_el_manifest_dice_otra_cosa(self):
        self.assertFalse(start_check(START, 'npm start', '')[0])

    def test_sin_banner_falla_si_el_ajuste_dice_otra_cosa(self):
        self.assertFalse(start_check('npm start', START, '')[0])

    def test_banner_con_el_plan_start_no_falla(self):
        ok, detail = start_check(START, START, BANNER.format(cmd=START))
        self.assertTrue(ok)
        self.assertIn(repr([START]), detail)

    def test_banner_con_otro_plan_falla(self):
        ok, detail = start_check(START, START, BANNER.format(cmd='npm start'))
        self.assertFalse(ok)
        self.assertIn("['npm start']", detail)

    # O-60 (i): un banner sin la línea del plan no se puede comprobar y no cuenta como FALLA. El caso es lo que este script
    # leía del build de prod de b55345f (Railpack 0.43.0): solo el mensaje del título del recuadro
    def test_banner_sin_linea_de_plan_no_falla_y_dice_que_no_es_comprobable(self):
        ok, detail = start_check(START, START, '│ Railpack 0.43.0 │')
        self.assertTrue(ok)
        self.assertIn('no comprobable (el banner de Railpack no trae la línea del plan)', detail)

    def test_banner_sin_linea_de_plan_falla_si_el_ajuste_dice_otra_cosa(self):
        self.assertFalse(start_check('npm start', START, '│ Railpack 0.43.0 │')[0])


# Mensajes del log del build tal como llegan (prod b55345f, Railpack 0.43.0, 2026-10-23; staging da los mismos): una línea
# del banner por mensaje, y el que nombra a Railpack es solo el título del recuadro (O-60)
def build_log(cmd):
    return ['🚂 All aboard, next stop: builder v4', 'using build driver railpack-v0.43.0', '                   ', '╭─────────────────╮',
            '│ Railpack 0.43.0 │', '╰─────────────────╯', '', '  ↳ Detected Node', '            ', '\x1b[1m  Steps     \x1b[0m',
            '  ──────────', '  ▸ install', '    $ npm install', '         ', '  ▸ build', '    $ npm run build', '            ',
            '\x1b[1m  Deploy    \x1b[0m', '  ──────────', f'    $ {cmd}', '', 'load build definition from ./railpack-plan.json']


class RailpackBanner(unittest.TestCase):
    def test_banner_de_una_linea_por_mensaje_con_el_plan_start_no_falla(self):
        ok, detail = start_check(START, START, railpack_banner(build_log(START)))
        self.assertTrue(ok)
        self.assertIn(f"plan de Railpack ['{START}']", detail)

    def test_banner_de_una_linea_por_mensaje_con_otro_plan_falla(self):
        ok, detail = start_check(START, START, railpack_banner(build_log('npm start')))
        self.assertFalse(ok)
        self.assertIn("['npm start']", detail)

    def test_banner_de_un_solo_mensaje_sigue_valiendo(self):
        self.assertTrue(start_check(START, START, railpack_banner(['uploading snapshot', BANNER.format(cmd=START), 'copy / /app']))[0])

    def test_sin_banner_no_es_comprobable(self):
        banner = railpack_banner(['uploading snapshot', 'using build driver railpack-v0.43.0', 'copy / /app'])
        self.assertEqual(banner, '')
        self.assertIn('no comprobable', start_check(START, START, banner)[1])


class ProjectToken(unittest.TestCase):
    PROJECT = {
        'name': 'sea-battle',
        'environments': {'edges': [{'node': {'id': 'env-stg', 'name': 'staging'}}, {'node': {'id': 'env-prod', 'name': 'production'}}]},
        'services': {'edges': [{'node': {'id': 'svc-1', 'name': 'sea-battle'}}, {'node': {'id': 'svc-db', 'name': 'Postgres'}}]},
    }

    def test_el_token_de_staging_da_los_ids_de_staging(self):
        ids = railway_api.ids_for_project_token({'projectId': 'p-1', 'environmentId': 'env-stg'}, self.PROJECT, 'sea-battle', 'staging', 'sea-battle')
        self.assertEqual(ids, {'projectId': 'p-1', 'environmentId': 'env-stg', 'serviceId': 'svc-1'})

    def test_un_token_de_prod_no_sirve_para_staging(self):
        with self.assertRaisesRegex(SystemExit, 'es de sea-battle/production, no de sea-battle/staging'):
            railway_api.ids_for_project_token({'projectId': 'p-1', 'environmentId': 'env-prod'}, self.PROJECT, 'sea-battle', 'staging', 'sea-battle')

    def test_otro_proyecto_no_sirve(self):
        with self.assertRaises(SystemExit):
            railway_api.ids_for_project_token({'projectId': 'p-1', 'environmentId': 'env-stg'}, {**self.PROJECT, 'name': 'otro'}, 'sea-battle', 'staging', 'sea-battle')

    def test_sin_el_servicio_para(self):
        with self.assertRaisesRegex(SystemExit, 'No hay un servicio «web»'):
            railway_api.ids_for_project_token({'projectId': 'p-1', 'environmentId': 'env-stg'}, self.PROJECT, 'sea-battle', 'staging', 'web')


class Auth(unittest.TestCase):
    def test_el_token_de_proyecto_va_en_project_access_token(self):
        self.assertEqual(railway_api.auth({'RAILWAY_TOKEN': 't-proj', 'RAILWAY_API_TOKEN': 't-cuenta'}), ('project', {'Project-Access-Token': 't-proj'}))

    def test_el_de_cuenta_va_en_bearer(self):
        self.assertEqual(railway_api.auth({'RAILWAY_API_TOKEN': 't-cuenta'}), ('account', {'Authorization': 'Bearer t-cuenta'}))

    def test_gql_rechaza_mutaciones_antes_de_tocar_la_red(self):
        with self.assertRaisesRegex(SystemExit, 'Solo lectura'):
            railway_api.gql(railway_api.DEPLOY)


class ShutdownTimeline(unittest.TestCase):
    # O-42 (a): el aviso del apagado lleva los ms reales y, detrás del (+N ms), cuántos jugadores quedaron sin guardar;
    # la regex de shutdown_timeline lo sigue leyendo
    def test_el_aviso_con_los_ms_reales_y_el_recuento_se_sigue_leyendo(self):
        lines = [{'message': m} for m in (
            '🛑 SIGTERM: guardando el progreso antes de cerrar 2026-10-18T21:17:08.772Z',
            '⚠️  El progreso no se pudo guardar en 9520 ms 2026-10-18T21:17:18.292Z (+9520 ms) · 1 jugador sin guardar',
            '🔌 Sockets cerrados 2026-10-18T21:17:18.294Z (+9522 ms)')]
        detail = shutdown_timeline(lines, None)
        self.assertIn('🛑 → aviso de escritura fallida 9520 ms', detail)
        self.assertIn('🛑 → 🔌 9522 ms', detail)


if __name__ == '__main__':
    unittest.main()

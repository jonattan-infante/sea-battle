# Unitarios de redact_clerk.py sin red. python3 -B -m unittest discover -s scripts/ci
# Los valores falsos se arman en tiempo de ejecución, para que ningún escáner de secretos los confunda con claves reales
import base64, io, json, os, sys, tempfile, unittest, zipfile

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import redact_clerk
from redact_clerk import findings, redact_bytes, redact_text


def b64url(obj) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip('=')


JWT = f"{b64url({'alg': 'RS256', 'typ': 'JWT'})}.{b64url({'sub': 'user_falso', 'sid': 'sess_falsa'})}.firmaFalsaDeDieciseisCaracteres"
DVB = 'dvb_' + 'Q' * 27
SK = 'sk_' + 'test_' + 'Z' * 40
SECRETS = (JWT, DVB, SK)


def zipped(members: dict) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in members.items():
            z.writestr(name, data)
    return out.getvalue()


def everything(data: bytes) -> bytes:
    # El contenido de un zip, con los zips anidados y los zips en base64 abiertos, para buscar a mano
    if data[:4] == b'PK\x03\x04':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return b'\n'.join(everything(z.read(n)) for n in z.namelist())
    parts = [data] + [everything(base64.b64decode(m.group(2))) for m in redact_clerk.EMBEDDED_ZIP.finditer(data)]
    return b'\n'.join(parts)


class RedactText(unittest.TestCase):
    def assertClean(self, data: bytes):
        for s in SECRETS:
            self.assertNotIn(s.encode(), data)
        self.assertEqual(findings(data, 'x'), [])

    def test_cabecera_cookie_set_cookie_y_query(self):
        data = (
            f'cookie: __session={JWT}; __clerk_db_jwt={DVB}; __client_uat=1729700000\n'
            f'set-cookie: __session_Abc12={JWT}; Path=/; HttpOnly\n'
            f'GET /v1/client/handshake?redirect_url=x&__session={JWT}&__clerk_db_jwt={DVB}&__clerk_handshake_nonce=n0nce12345\n'
            f'{{"url":"https://h/x?__clerk_db_jwt%3D{DVB}"}}\n'
        ).encode()
        self.assertEqual(len(findings(data, 'x')), 1)
        out = redact_text(data)
        self.assertClean(out)
        self.assertIn(b'__session=REDACTED; __clerk_db_jwt=REDACTED', out)
        self.assertIn(b'__clerk_handshake_nonce=REDACTED', out)

    def test_objetos_de_cookie_de_las_trazas_en_los_dos_ordenes(self):
        data = json.dumps([{'name': '__clerk_db_jwt', 'value': DVB, 'path': '/'}, {'value': JWT, 'name': '__session'}]).encode()
        out = redact_text(data)
        self.assertClean(out)
        self.assertEqual(json.loads(out)[0]['value'], 'REDACTED')  # sigue siendo JSON válido

    def test_jwt_y_claves_sueltas_en_un_cuerpo(self):
        out = redact_text(json.dumps({'last_active_token': {'jwt': JWT}, 'dev_browser': DVB, 'k': SK}).encode())
        self.assertClean(out)
        self.assertEqual(redact_text(out), out)  # dos pasadas dan lo mismo

    def test_lo_que_no_es_secreto_no_se_toca(self):
        data = b'const n = "__session"; cookie: __clerk_db_jwt=dvb_e2e; pk_test_ZXhhbXBsZQ; eyJhbGciOiJub25lIn0'
        self.assertEqual(findings(data, 'x'), [])


class RedactFiles(unittest.TestCase):
    def test_traza_dentro_de_un_blob_dentro_del_html(self):
        trace = zipped({'0-trace.network': f'{{"name":"cookie","value":"__session={JWT}"}}', 'resources/a.json': f'{{"jwt":"{JWT}"}}'})
        blob = zipped({'report.jsonl': f'{{"stdout":"{DVB}"}}', 'resources/trace.zip': trace})
        html = b'<script>window.playwrightReportBase64 = "data:application/zip;base64,' + base64.b64encode(blob) + b'";</script>'
        self.assertEqual(len(findings(html, 'index.html')), 3)
        out = redact_bytes(html)
        self.assertEqual(findings(out, 'index.html'), [])
        for s in SECRETS[:2]:
            self.assertNotIn(s.encode(), everything(out))
        self.assertIn(b'__session=REDACTED', everything(out))

    def test_las_imagenes_no_se_reescriben(self):
        png = b'\x89PNG\r\n\x1a\n' + bytes(range(256)) * 4
        self.assertEqual(redact_bytes(png), png)

    def test_redact_y_check_sobre_una_carpeta(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, 'test-results', 'a'))
            with open(os.path.join(d, 'test-results', 'a', 'trace.zip'), 'wb') as f:
                f.write(zipped({'0-trace.trace': f'{{"url":"/game?__clerk_db_jwt={DVB}"}}'}))
            with open(os.path.join(d, 'test-results', 'a', 'error-context.md'), 'w') as f:
                f.write(f'token {JWT}')
            root = os.path.join(d, 'test-results')
            out = io.StringIO()
            sys.stdout, old = out, sys.stdout
            try:
                self.assertEqual(redact_clerk.main(['x', 'check', root]), 1)
                self.assertEqual(redact_clerk.main(['x', 'redact', root]), 0)
                self.assertEqual(redact_clerk.main(['x', 'check', root]), 0)
            finally:
                sys.stdout = old
            printed = out.getvalue()
            self.assertIn('trace.zip!0-trace.trace', printed)
            for s in SECRETS:
                self.assertNotIn(s, printed)  # check dice dónde, nunca el valor


if __name__ == '__main__':
    unittest.main()

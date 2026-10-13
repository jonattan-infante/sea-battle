# Unitarios de release.py (DT-16). python3 -B -m unittest discover -s scripts/release
import os, sys, unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from release import changelog_section, tag_exists, tag_for

LS_REMOTE = '6f12\trefs/tags/v1.0.0\n10b6\trefs/tags/v1.0.0^{}\ne551\trefs/tags/v1.0.10\n7e72\trefs/tags/v1.0.10^{}\n'
CHANGELOG = """# Changelog

## [Unreleased]

## [1.0.10] - 2026-11-01

### Corregido

- Diez.

## [1.0.1] - 2026-10-12

### Corregido

- **Bucle al entrar.** Uno.

## [1.0.0] - 2026-10-12

Primera versión.
"""


class Tag(unittest.TestCase):
    def test_el_tag_es_v_mas_la_version(self):
        self.assertEqual(tag_for('1.0.2'), 'v1.0.2')

    def test_una_version_que_no_es_x_y_z_para(self):
        for bad in ('1.0', 'v1.0.2', '1.0.2-rc.1', '', '1.0.2\n'):
            with self.subTest(version=bad):
                with self.assertRaises(SystemExit):
                    tag_for(bad)

    def test_existe_solo_con_la_ref_exacta(self):
        self.assertTrue(tag_exists(LS_REMOTE, '1.0.0'))
        self.assertTrue(tag_exists(LS_REMOTE, '1.0.10'))
        self.assertFalse(tag_exists(LS_REMOTE, '1.0.1'), 'v1.0.10 no es v1.0.1')
        self.assertFalse(tag_exists(LS_REMOTE, '1.0.2'))
        self.assertFalse(tag_exists('', '1.0.0'))


class Changelog(unittest.TestCase):
    def test_saca_la_seccion_sin_el_titulo(self):
        self.assertEqual(changelog_section(CHANGELOG, '1.0.1'), '### Corregido\n\n- **Bucle al entrar.** Uno.')

    def test_no_confunde_1_0_1_con_1_0_10(self):
        self.assertEqual(changelog_section(CHANGELOG, '1.0.10'), '### Corregido\n\n- Diez.')

    def test_la_ultima_seccion_llega_al_final(self):
        self.assertEqual(changelog_section(CHANGELOG, '1.0.0'), 'Primera versión.')

    def test_sin_seccion_o_vacia_es_none(self):
        self.assertIsNone(changelog_section(CHANGELOG, '1.0.2'))
        self.assertIsNone(changelog_section(CHANGELOG, 'Unreleased'))


if __name__ == '__main__':
    unittest.main()

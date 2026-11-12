"""Explicit glossary references survive the lesson build without nested hints.

Run: python3 tools/glossary_explicit.py
"""
import ast
import json
import pathlib
import re
import unittest


source = pathlib.Path(__file__).resolve().parents[1] / 'lessons' / 'build.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'glossarize')
terms = [
    {'id': 'force', 'a': 'force', 'k': 'l02'},
    {'id': 'torque', 'a': 'torque', 'k': 'l02'},
]
namespace = {
    're': re, 'json': json, 'GLOSSARY': terms,
    'SKIP_TAGS': {'button', 'script', 'style'},
    'gl_info': lambda: {g['id']: g for g in terms},
}
exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), namespace)
glossarize = namespace['glossarize']


class ExplicitGlossaryTests(unittest.TestCase):
    def render(self, text):
        return glossarize('<main><section class="section"><p>' + text + '</p></section></main>', 'l02')

    def test_explicit_reference_has_data_without_nested_auto_hint(self):
        result = self.render('<span class="gl" data-gl="force"><span>force</span></span> and torque')
        self.assertEqual(result.count('data-gl="force"'), 1)
        self.assertEqual(result.count('data-gl="torque"'), 1)
        data = json.loads(re.search(r'id="glData">(.*?)</script>', result).group(1))
        self.assertEqual(set(data), {'force', 'torque'})
        self.assertTrue(data['force']['here'])

    def test_explicit_place_takes_priority_over_earlier_auto_match(self):
        result = self.render('force, then <span class="gl" data-gl="force">force</span>')
        self.assertEqual(result.count('data-gl="force"'), 1)

    def test_original_auto_first_mention_is_preserved(self):
        result = self.render('force and force')
        self.assertEqual(result.count('data-gl="force"'), 1)

    def test_unknown_explicit_id_fails_the_build(self):
        with self.assertRaisesRegex(AssertionError, 'missing'):
            self.render('<span class="gl" data-gl="missing">force</span>')


if __name__ == '__main__':
    unittest.main()

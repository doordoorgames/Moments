"""Offline behavioral checks; no real source downloads."""
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image

spec = importlib.util.spec_from_file_location('collect', Path(__file__).with_name('collect.py'))
collect = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collect)

class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.public = self.root / 'frontend/public'
        self.public.mkdir(parents=True)
        (self.public.parent / 'package.json').write_text('{"dependencies":{"react":"19"}}')
        self.config = self.root / 'source.json'
        self.root_patch = patch.object(collect, 'ROOT', self.root)
        self.root_patch.start()
        self.args_patch = patch.object(sys, 'argv', ['collect.py', str(self.config)])
        self.args_patch.start()
    def tearDown(self):
        self.args_patch.stop()
        self.root_patch.stop()
        self.temp.cleanup()
    def write(self, **extra):
        data = dict(source='test', adapter='manifest', reuse=dict(status='permitted', evidence='Written approval'), items=[])
        data.update(extra)
        self.config.write_text(json.dumps(data))
    def test_gate_no_network_or_outputs(self):
        for reuse in [dict(status='unchecked', evidence=''), dict(status='permitted', evidence=[]), dict(status='permitted', evidence='  ')]:
            self.write(reuse=reuse, notes='Stop')
            with patch.object(collect, 'download') as download:
                self.assertEqual(collect.main(), 2)
                download.assert_not_called()
            self.assertFalse((self.public / 'assets').exists())
    def test_resize_metadata_duplicates_and_gallery(self):
        raw = io.BytesIO()
        Image.new('RGB', (600, 400), 'white').save(raw, 'PNG')
        item = dict(name='Bag </script>', category='handbags', image_url='https://example.com/bag.png', source_url='https://example.com/product', license='Approved')
        self.write(items=[item, item])
        with patch.object(collect, 'download', return_value=raw.getvalue()) as download:
            self.assertEqual(collect.main(), 0)
            self.assertEqual(collect.main(), 0)
            download.assert_called_once_with(item['image_url'], robots=True)
        catalog = json.loads((self.public / 'assets/shop/catalog.json').read_text())
        self.assertEqual(len(catalog), 1)
        row = catalog[0]
        self.assertEqual((row['width'], row['height']), (256, 171))
        with Image.open(self.public / row['image'].lstrip('/')) as image:
            self.assertEqual(image.format, 'WEBP')
            self.assertEqual(image.size, (256, 171))
        gallery = (self.public / 'assets/shop/_review/index.html').read_text()
        self.assertIn('name="robots" content="noindex"', gallery)
        self.assertNotIn('Bag </script>', gallery)
    def test_robots_disallowed_skips_image_request(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'User-agent: *\nDisallow: /private/\n'
        with patch.object(collect, 'urlopen', return_value=Response()) as request:
            with self.assertRaisesRegex(ValueError, 'disallows'):
                collect.download('https://example.com/private/bag.png', robots=True)
            self.assertEqual(request.call_count, 1)

    def test_openverse_filters_and_limit(self):
        raw = io.BytesIO()
        Image.new('RGB', (400, 400), 'white').save(raw, 'PNG')
        common = dict(title='Perfume', width=400, height=400, url='https://example.com/a.png')
        results = [dict(common, license='by'), dict(common, license='cc0', width=200), dict(common, license='pdm')]
        self.write(adapter='openverse', categories={'perfume':['perfume bottle']}, limit_per_category=1)
        def request(url, **kwargs):
            return json.dumps({'results':results}).encode() if 'api.openverse.org' in url else raw.getvalue()
        with patch.object(collect, 'download', side_effect=request):
            self.assertEqual(collect.main(), 0)
        self.assertEqual(len(json.loads((self.public / 'assets/shop/catalog.json').read_text())), 1)

if __name__ == '__main__':
    unittest.main()

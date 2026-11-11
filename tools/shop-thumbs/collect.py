#!/usr/bin/env python3
"""Collect explicitly permitted local shopping thumbnails; never hotlink."""
import hashlib
import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
USER_AGENT = 'MomentsShopThumbs/1.0'

def slug(value):
    return re.sub(r'[^a-z0-9]+', '-', str(value).lower()).strip('-') or 'item'

def public_folder():
    candidates = [p.parent / 'public' for p in ROOT.rglob('package.json')
                  if 'node_modules' not in p.parts and (p.parent / 'public').is_dir()
                  and 'react' in json.loads(p.read_text()).get('dependencies', {})]
    if len(candidates) != 1:
        raise ValueError('Expected exactly one React public folder: ' + str(candidates))
    return candidates[0]

def download(url, robots=False):
    if urlsplit(url).scheme not in ('http', 'https'):
        raise ValueError('Only HTTP(S) URLs are supported')
    def allowed(target):
        parts = urlsplit(target)
        robot_url = f'{parts.scheme}://{parts.netloc}/robots.txt'
        parser = RobotFileParser(robot_url)
        try:
            with urlopen(Request(robot_url, headers={'User-Agent': USER_AGENT}), timeout=20) as response:
                parser.parse(response.read().decode('utf-8', errors='replace').splitlines())
        except Exception as error:
            raise ValueError(f'Cannot verify robots.txt for {target}: {error}')
        if not parser.can_fetch(USER_AGENT, target):
            raise ValueError(f'robots.txt disallows {target}')
    if robots:
        allowed(url)
    with urlopen(Request(url, headers={'User-Agent': USER_AGENT}), timeout=30) as response:
        if robots and response.url != url:
            # Do not read redirected image bytes without checking their origin too.
            allowed(response.url)
        return response.read()

def gallery(public, catalog):
    template = (Path(__file__).parent / 'review.html').read_text()
    embedded = json.dumps(catalog, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    destination = public / 'assets/shop/_review/index.html'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(template.replace('__CATALOG__', embedded), encoding='utf-8')

def main():
    config = json.loads(Path(sys.argv[1]).read_text())
    reuse = config.get('reuse', {})
    if reuse.get('status') != 'permitted' or not reuse.get('evidence') or not str(reuse['evidence']).strip():
        print(config.get('notes', 'Reuse is not permitted or evidence is missing.'))
        return 2
    public = public_folder()
    catalog_path = public / 'assets/shop/catalog.json'
    catalog = json.loads(catalog_path.read_text()) if catalog_path.exists() else []
    known = {row['image_url'] for row in catalog}
    hashes = {row['id'] for row in catalog}
    source = slug(config.get('source', Path(sys.argv[1]).stem))
    errors = 0
    collected = 0
    last_api = 0

    def save(item, category, openverse=False):
        nonlocal collected, errors
        url = item['image_url']
        if url in known:
            return False
        try:
            raw = download(url, robots=config['adapter'] == 'manifest')
            identity = hashlib.sha256(raw).hexdigest()
            if identity in hashes:
                known.add(url)
                return False
            with Image.open(io.BytesIO(raw)) as original:
                width, height = original.size
                if openverse and (min(width, height) < 300 or max(width, height) / min(width, height) > 2.2):
                    return False
                image = original.convert('RGBA' if 'A' in original.getbands() or 'transparency' in original.info else 'RGB')
                image.thumbnail((256, 256), Image.Resampling.LANCZOS)
                name = item.get('name') or 'Untitled product'
                relative = Path('assets/shop') / source / slug(category) / f'{slug(name)[:100]}-{identity[:12]}.webp'
                output = public / relative
                output.parent.mkdir(parents=True, exist_ok=True)
                image.save(output, 'WEBP', quality=84)
                row = {key: item.get(key, '') for key in ('source_url', 'image_url', 'license', 'license_url', 'creator', 'attribution')}
                row.update(id=identity, name=name, category=category, image='/' + relative.as_posix(), width=image.width, height=image.height, source=source, collected_at=datetime.now(timezone.utc).isoformat())
                catalog.append(row)
                known.add(url)
                hashes.add(identity)
                collected += 1
                return True
        except Exception as error:
            errors += 1
            print(f'Skip {url}: {error}', file=sys.stderr)
            return False

    if config['adapter'] == 'manifest':
        for item in config.get('items', []):
            save(item, item['category'])
    elif config['adapter'] == 'openverse':
        for category, queries in config['categories'].items():
            count = sum(row['source'] == source and row['category'] == category for row in catalog)
            for query in queries:
                if count >= config.get('limit_per_category', 8):
                    break
                time.sleep(max(0, 1 - (time.monotonic() - last_api)))
                url = 'https://api.openverse.org/v1/images/?' + urlencode(dict(q=query, license='cc0,pdm', page_size=30, mature='false'))
                try:
                    last_api = time.monotonic()
                    results = json.loads(download(url))['results']
                except Exception as error:
                    errors += 1
                    print(f'Openverse query {query!r}: {error}', file=sys.stderr)
                    continue
                for result in results:
                    if count >= config.get('limit_per_category', 8):
                        break
                    if result.get('license', '').lower() not in ('cc0', 'pdm'):
                        continue
                    w, h = result.get('width') or 0, result.get('height') or 0
                    if min(w, h) < 300 or max(w, h) / min(w, h) > 2.2:
                        continue
                    item = dict(name=result.get('title'), image_url=result['url'], source_url=result.get('foreign_landing_url', ''), license=result['license'], license_url=result.get('license_url', ''), creator=result.get('creator', ''), attribution=result.get('attribution', ''))
                    count += int(save(item, category, True))
    else:
        raise ValueError('Unknown adapter: ' + config['adapter'])
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    gallery(public, catalog)
    print(f'Collected {collected} images; catalog contains {len(catalog)} images; {errors} errors.')
    return 1 if errors else 0

if __name__ == '__main__':
    sys.exit(main())

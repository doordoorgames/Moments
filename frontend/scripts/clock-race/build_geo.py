"""Build Clock Race geography silhouettes (countries, continents, Texas) as SVG path data.

Source: johan/world.geo.json (Natural Earth based, public domain) and mledoze/countries for
continent membership. Output: a JS module of {key: {d, vb}} drawn in a 100-unit box.
Usage: python3 -I build_geo.py <geo-src dir> <countries.json> <out.js> <preview dir>
"""
import json
import math
import os
import sys

src, cjson, out_js, preview = sys.argv[1:5]
world = json.load(open(os.path.join(src, 'countries.geo.json')))
feats = {f['id']: f for f in world['features'] if f['id'] != '-99'}
# Northern Cyprus / Somaliland are '-99'; keep them for continent fills.
extra = [f for f in world['features'] if f['id'] == '-99']
meta = {c['cca3']: c for c in json.load(open(cjson))}


def polys(feature):
    g = feature['geometry']
    return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']


def laea(lon0, lat0):
    p0, l0 = math.radians(lat0), math.radians(lon0)

    def f(lon, lat):
        dl = math.radians(((lon - lon0 + 540) % 360) - 180)
        p = math.radians(lat)
        c = 1 + math.sin(p0) * math.sin(p) + math.cos(p0) * math.cos(p) * math.cos(dl)
        k = math.sqrt(2 / max(c, 1e-9))
        return k * math.cos(p) * math.sin(dl), -k * (math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(dl))
    return f


def area(ring):
    return abs(sum(ring[i][0] * ring[i - 1][1] - ring[i - 1][0] * ring[i][1] for i in range(len(ring)))) / 2


def build(features, center, frame=None, min_area=0.25, pad=6, step=0.45, keep=None):
    proj = laea(*center)
    raw = [ring for ft in features for poly in polys(ft) for ring in poly]
    if keep:
        raw = [r for r in raw if keep(sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))]
    rings = [[proj(x, y) for x, y in ring] for ring in raw]
    pts = [pt for r in rings for pt in r]
    if frame:  # lon/lat window: fit to its projected corners and edges
        lo0, la0, lo1, la1 = frame
        edge = [proj(lo0 + (lo1 - lo0) * i / 20, la) for i in range(21) for la in (la0, la1)] + \
               [proj(lo, la0 + (la1 - la0) * i / 20) for i in range(21) for lo in (lo0, lo1)]
        xs, ys = [p[0] for p in edge], [p[1] for p in edge]
    else:
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    s = (100 - 2 * pad) / max(x1 - x0, y1 - y0)
    ox = (100 - (x1 - x0) * s) / 2 - x0 * s
    oy = (100 - (y1 - y0) * s) / 2 - y0 * s
    out = []
    for r in rings:
        r = [(x * s + ox, y * s + oy) for x, y in r]
        if area(r) < min_area:
            continue
        kept = [r[0]]
        for p in r[1:]:
            if math.dist(p, kept[-1]) >= step:
                kept.append(p)
        if len(kept) < 3:
            continue
        out.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in kept) + 'Z')
    return ''.join(out)


def center_of(features):
    pts = [pt for ft in features for poly in polys(ft) for pt in poly[0]]
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    return (min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2


SHAPES = {}
COUNTRIES = {'italy': 'ITA', 'japan': 'JPN', 'brazil': 'BRA', 'india': 'IND', 'egypt': 'EGY', 'saudi': 'SAU',
             'uk': 'GBR', 'china': 'CHN', 'mexico': 'MEX', 'canada': 'CAN'}
for key, iso in COUNTRIES.items():
    f = feats[iso]
    SHAPES[key] = build([f], center_of([f]), min_area=0.6 if key == 'canada' else 0.15)


def members(test):
    out = []
    for iso, f in feats.items():
        m = meta.get(iso) or meta.get({'CS-KM': 'UNK'}.get(iso, iso))
        if m and test(m, iso):
            out.append(f)
    return out


europe = members(lambda m, iso: m['region'] == 'Europe')
asia = members(lambda m, iso: m['region'] == 'Asia' or iso == 'RUS') + extra[:1]
africa = members(lambda m, iso: m['region'] == 'Africa') + extra[1:]
n_am = members(lambda m, iso: m['region'] == 'Americas' and m['subregion'] != 'South America')
s_am = members(lambda m, iso: m['subregion'] == 'South America')
oceania = members(lambda m, iso: m['region'] == 'Oceania')
SHAPES['europe'] = build(europe, (15, 52), frame=(-14, 34, 40, 71), min_area=0.08)
SHAPES['asia'] = build(asia, (90, 38), min_area=0.08, keep=lambda lo, la: lo > 25 and lo < 172 and la < 76)
SHAPES['africa'] = build(africa, (18, 2), min_area=0.08)
SHAPES['north_america'] = build(n_am, (-96, 48), min_area=0.08, keep=lambda lo, la: lo > -170 and lo < -10 and not (lo < -150 and la < 30))
SHAPES['south_america'] = build(s_am, (-60, -22), min_area=0.08)
SHAPES['oceania'] = build(oceania, (150, -25), frame=(112, -48, 180, -2), min_area=0.05)
SHAPES['antarctica'] = build([feats['ATA']], (0, -90), min_area=0.15)
tx = json.load(open(os.path.join(src, 'countries/USA/TX.geo.json')))['features'][0]
SHAPES['texas'] = build([tx], center_of([tx]), step=0.3)

os.makedirs(preview, exist_ok=True)
for k, d in SHAPES.items():
    open(os.path.join(preview, k + '.svg'), 'w').write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300"><rect width="100" height="100" fill="#FFFDF7"/>'
        f'<path d="{d}" fill="none" stroke="#0B0B0B" stroke-width="2.4" stroke-linejoin="round"/><path d="{d}" fill="#2E4BFF"/></svg>')
with open(out_js, 'w') as f:
    f.write('// Generated by frontend/scripts/clock-race/build_geo.py from Natural Earth data (johan/world.geo.json, public domain).\n'
            '// Each value is SVG path data in a 100x100 box. Do not edit by hand.\n')
    f.write('export const GEO_SHAPES = ' + json.dumps(SHAPES, indent=0) + ';\n')
print({k: len(v) for k, v in SHAPES.items()}, sum(len(v) for v in SHAPES.values()))

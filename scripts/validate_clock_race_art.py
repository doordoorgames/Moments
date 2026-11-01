"""Validate Clock Race bank coverage, decoded images, paths and credits."""
import json
import re
import sys
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))
from clock_race_bank import art_keys

art = root / "frontend/public/clock-race/art"
required = set(art_keys())
listed = set(re.findall(r"^\| `(\w+)`", (art / "ARTWORK_NEEDED.md").read_text(), re.M))
records = json.loads((art / "credits.json").read_text())
mapping = dict(re.findall(r"^  (\w+): '([^']+)',", (root / "frontend/src/components/clockRace/artManifest.js").read_text(), re.M))
errors = []
for label, keys in [("source manifest", listed), ("game mapping", set(mapping)), ("credits", set(records)), ("files", {p.stem for p in art.glob("*.webp")})]:
    if keys != required:
        errors.append(f"{label}: missing {sorted(required - keys)}, unused {sorted(keys - required)}")
for key, filename in mapping.items():
    if filename != key + ".webp":
        errors.append(f"{key}: invalid path {filename}")
        continue
    try:
        with Image.open(art / filename) as image:
            image.load()
            if image.format != "WEBP":
                errors.append(f"{key}: expected WebP")
    except OSError as exc:
        errors.append(str(exc))
    if not all(records.get(key, {}).get(field) for field in ("original", "source", "creator", "license", "license_url", "changes")):
        errors.append(f"{key}: incomplete credits")
views = root / "frontend/src/components/clockRace"
for view in ("PictureTasks.jsx", "NewTasks.jsx", "Tasks.jsx"):
    if re.search(r"data-art-needed|is-placeholder|<Placeholder\b", (views / view).read_text()):
        errors.append(f"{view}: artwork placeholder remains")
print(f"{len(mapping)} registered / {len(required)} required")
print("\n".join(errors))
sys.exit(bool(errors))

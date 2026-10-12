# Shopping thumbnails

Requires Python 3.9+ and Pillow:

```sh
python -m pip install -r tools/shop-thumbs/requirements.txt
python tools/shop-thumbs/collect.py tools/shop-thumbs/sources/openverse-fashion.json
```

The tool finds the React app’s public folder (`frontend/public` in Moments). It saves downloaded WebP thumbnails under `assets/shop/`, appends metadata to `catalog.json`, and embeds that catalog in `_review/index.html`. Open `/assets/shop/_review/index.html` (or `/assets/shop/_review/` on hosts serving directory indexes). No game, story, CMS, or backend integration is needed.

## Add a shopping website

1. Copy `sources/_template-shopping-site.json` to `sources/<site>.json` and set a unique `source`.
2. Check the website’s terms and robots.txt. Robots permission alone does not grant permission to reuse photos.
3. Get written permission covering the photos and intended reuse. Record the permission reference, date, and scope in `reuse.evidence`; set `reuse.status` to `permitted`.
4. List approved items with `name`, `category`, `image_url` (actual image file), and `source_url` (product page). Fill `license`, `license_url`, `creator`, and `attribution` where available.
5. Run `python tools/shop-thumbs/collect.py tools/shop-thumbs/sources/<site>.json`.
6. Review the generated gallery. Reject unsuitable images, then use **Copy rejected IDs** to share the list. Rejecting only marks images for review; it does not remove files or catalog entries.

The permission gate prints notes and exits 2 before any network request or output changes. Manifest downloads check robots.txt for every URL and conservatively skip when it cannot be verified. Duplicate image URLs and identical original file bytes are skipped. Openverse only accepts CC0/PDM results, checks dimensions before and after download, limits each category to eight total entries, and spaces API requests by at least one second. Images fit within 256 × 256 without padding, cropping, background removal, or upscaling; WebP quality is 84. Existing transparency is retained.

Exit codes: 0 completed; 1 partial/failed network collection (gallery and catalog still written); 2 reuse not permitted or evidence missing. Errors are printed per URL/query, so a failed run can be rerun safely. Openverse can return 403 challenges in automated environments; do not bypass access controls. Run again from an allowed environment. Public-domain results can include irrelevant photos: the gallery is a human review step, not a product recognizer.

Offline checks: `python tools/shop-thumbs/test_collect.py`.

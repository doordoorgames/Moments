# Shoug screen regression checks

The browser test loads the real production bundle and injects isolated room responses at the public API/WebSocket boundary. It never creates a room, changes a story, or votes in production. Content comes directly from `backend/import_shougs_tale.py`; the test selects the longest narration, title, first/second choice and combined content, plus multi-choice and ending screens. All eleven possible story flags are included as a conservative fit stress test.

```sh
npm install --no-save playwright
npx playwright install --with-deps chromium webkit
REACT_APP_BACKEND_URL=https://moments-production-ee12.up.railway.app npm run build
node tests/shoug-screen.cjs
# Repeat against deployed assets:
SHOUG_TEST_URL=https://moments-ten-psi.vercel.app node tests/shoug-screen.cjs
```

Run from `frontend`. Optional `SHOUG_CHROMIUM` supplies a browser executable. `SHOUG_ENGINE=chromium` runs that engine alone; otherwise both Chromium and WebKit run. `SHOUG_RESULTS` changes the JSON output path (default `/tmp/shoug-screen-results.json`).

Checks cover four viewport sizes, reserved safe-area padding, both vote counts, document/internal overflow, unclipped text/control bounds, 44px minimum tap targets, alternating major surfaces, foreground/shadow classes, and computed heavy weight. Unrelated homepage Google fonts are blocked to verify the Shoug local/system font fallback without a font-CDN dependency. Chromium additionally reports the actual platform glyph face using CDP. WebKit on Linux tests the rendering engine, not physical iOS font availability or native status-bar glyphs. A requested CSS weight of 900 does not prove that a fallback family contains a heavier face than Bold; a licensed Avenir webfont remains necessary for consistent exact Avenir on Android.

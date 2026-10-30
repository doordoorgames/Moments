// Visual theme for Clock Race. 'arcade' = "an afternoon inside a Japanese game center, circa 1992".
// The classic look stays one switch away for comparison: add ?theme=classic to the URL (remembered on
// this phone); ?theme=arcade switches back. Gameplay, timing and scoring are identical in both.
function pick() {
  try {
    const q = new URLSearchParams(window.location.search).get('theme');
    if (q === 'arcade' || q === 'classic') window.localStorage.setItem('clock-race-theme', q);
    return (q || window.localStorage.getItem('clock-race-theme') || 'arcade') === 'arcade';
  } catch {
    return true;
  }
}
export const ARCADE = pick();

// Replaceable art. Drop a painting with the same file name into public/clock-race/arcade/ to swap a layer
// (see public/clock-race/arcade/README.md for sizes and transparent regions).
export const ARCADE_ASSETS = '/clock-race/arcade/';
const art = file => `url(${ARCADE_ASSETS}${file})`;
export const ARCADE_VARS = {
  '--arc-room': art('a-room.jpg'), '--arc-shell': art('b-cabinet-shell.png'), '--arc-glass': art('c-crt-glass.png'),
  '--arc-ink': art('d-ink-frame.png'), '--arc-paint': art('d-paint-texture.png'),
  '--arc-fg-top': art('f-foreground-top.png'), '--arc-fg-bottom': art('f-foreground-bottom.png'),
};

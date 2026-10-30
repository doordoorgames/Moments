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

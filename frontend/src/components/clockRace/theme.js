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
// (see public/clock-race/arcade/README.md for sizes).
export const ARCADE_ASSETS = '/clock-race/arcade/';
const art = file => `url(${ARCADE_ASSETS}${file})`;
export const ARCADE_VARS = {'--arc-room': art('a-room.jpg'), '--arc-paint': art('d-paint-texture.png')};

// The two pixel faces, self-hosted in public/fonts/clock-race/ (OFL, licences alongside):
//   Handjet        every word players read, Arabic and English (a real pixel-grid Arabic)
//   Press Start 2P marquee lettering and numbers in English (room code, counts, countdown), the face
//                  Letter Challenge already uses
// Declared from here, not from the stylesheet, so the build never tries to bundle the files.
// font-display: block, so a phone never flashes a generic system font first.
const FONTS = `
@font-face{font-family:'CR Handjet';src:url(/fonts/clock-race/handjet.woff) format('woff');font-weight:400 900;font-display:block}
@font-face{font-family:'CR Press Start';src:url(/fonts/clock-race/press-start-2p.woff) format('woff');font-weight:400;font-display:block}`;
if (ARCADE && typeof document !== 'undefined' && !document.getElementById('cr-fonts')) {
  const style = document.createElement('style');
  style.id = 'cr-fonts';
  style.textContent = FONTS;
  document.head.appendChild(style);
  ['handjet.woff', 'press-start-2p.woff'].forEach(file => {
    const link = document.createElement('link');
    Object.assign(link, {rel: 'preload', as: 'font', type: 'font/woff', href: `/fonts/clock-race/${file}`, crossOrigin: 'anonymous'});
    document.head.appendChild(link);
  });
}

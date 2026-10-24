import purple from './assets/tvs/tv-purple.webp';
import beige from './assets/tvs/tv-beige.webp';
import blue from './assets/tvs/tv-blue.webp';
import yellow from './assets/tvs/tv-yellow.webp';
import orange from './assets/tvs/tv-orange.webp';
import teal from './assets/tvs/tv-teal.webp';

// The six TV cut-outs. `screen` is where the cream screen sits inside each image, in percent
// of that image. Measured from the art; tune these numbers if a letter ever looks off-centre.
export const TVS = {
  purple: {src: purple, width: 578, height: 617, screen: {left: 32.35, top: 32.9, width: 45.33, height: 41.98}},
  beige: {src: beige, width: 505, height: 546, screen: {left: 14.06, top: 15.02, width: 49.31, height: 46.52}},
  blue: {src: blue, width: 510, height: 541, screen: {left: 26.67, top: 36.41, width: 49.02, height: 43.44}},
  yellow: {src: yellow, width: 565, height: 577, screen: {left: 20.0, top: 16.46, width: 47.61, height: 40.21}},
  orange: {src: orange, width: 557, height: 580, screen: {left: 35.37, top: 28.45, width: 49.91, height: 44.14}},
  teal: {src: teal, width: 524, height: 517, screen: {left: 13.55, top: 14.89, width: 51.53, height: 47.58}},
};
// Must match TV_IDS in backend/letter_tv.py.
export const TV_IDS = ['purple', 'beige', 'blue', 'yellow', 'orange', 'teal'];

// Reference composition: 1080 units tall, x measured from the centre line of the screen.
// One unit = available height / 1080, unless the screen is too narrow to show both central
// TVs whole (old tablets), then it shrinks just enough. Outer TVs simply run off the edges.
export const REF_HEIGHT = 1080;
export const MIN_VISIBLE_WIDTH = 1440;

const GAP = 36;            // between the two central TVs
const OUTER_GAP = 30;      // between neighbouring TVs further out
const SLOTS = {
  centre: {height: 640, top: 110},
  near: {height: 540, top: 300},
  far: {height: 600, top: 80},
};

// Arrangement order: [far-left, near-left, centre-left, centre-right, near-right, far-right].
// Returns every TV's box in reference units (x = left edge relative to the centre line).
export function layoutSlots(arrangement) {
  const box = (id, slot) => {
    const tv = TVS[id], {height, top} = SLOTS[slot];
    return {id, role: slot, top, height, width: Math.round(height * tv.width / tv.height)};
  };
  const [fl, nl, cl, cr, nr, fr] = arrangement;
  const cL = box(cl, 'centre'), cR = box(cr, 'centre');
  cL.x = -GAP / 2 - cL.width; cR.x = GAP / 2;
  const nL = box(nl, 'near'), nR = box(nr, 'near');
  nL.x = cL.x - OUTER_GAP - nL.width; nR.x = cR.x + cR.width + OUTER_GAP;
  const fL = box(fl, 'far'), fR = box(fr, 'far');
  fL.x = nL.x - OUTER_GAP - fL.width; fR.x = nR.x + nR.width + OUTER_GAP;
  return [fL, nL, cL, cR, nR, fR];
}

// Both letters share one size, set by the shorter central screen (reference units).
export function letterSize(slots, scale = LETTER_SCALE) {
  const centre = slots.filter(s => s.role === 'centre');
  return Math.min(...centre.map(s => s.height * TVS[s.id].screen.height / 100)) * scale;
}

// Letter height as a share of its screen's height.
export const LETTER_SCALE = 0.7;

// NEXT button, centred between the central TVs below their screens (reference units).
export const BUTTON = {top: 820, width: 280, height: 100};

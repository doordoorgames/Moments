import purple from './assets/tvs/tv-purple.webp';
import beige from './assets/tvs/tv-beige.webp';
import blue from './assets/tvs/tv-blue.webp';
import yellow from './assets/tvs/tv-yellow.webp';
import orange from './assets/tvs/tv-orange.webp';
import teal from './assets/tvs/tv-teal.webp';

// The six TV cut-outs. `screen` is where the cream screen sits inside each image, in percent
// of that image. Measured from the art; tune these numbers if a letter ever looks off-centre.
export const TVS = {
  purple: {src: purple, width: 573, height: 607, screen: {left: 32.63, top: 32.62, width: 45.73, height: 42.67}},
  beige: {src: beige, width: 501, height: 538, screen: {left: 13.37, top: 14.5, width: 49.7, height: 47.21}},
  blue: {src: blue, width: 502, height: 533, screen: {left: 26.3, top: 36.21, width: 49.8, height: 44.09}},
  yellow: {src: yellow, width: 561, height: 569, screen: {left: 19.43, top: 15.99, width: 47.95, height: 40.78}},
  orange: {src: orange, width: 552, height: 572, screen: {left: 35.69, top: 28.15, width: 50.36, height: 44.76}},
  teal: {src: teal, width: 520, height: 509, screen: {left: 12.89, top: 14.34, width: 51.93, height: 48.33}},
};
// Must match TV_IDS in backend/letter_tv.py.
export const TV_IDS = ['purple', 'beige', 'blue', 'yellow', 'orange', 'teal'];

// Reference composition: 1080 units tall, x measured from the centre line of the screen.
// Every TV is the full height and they touch edge to edge. One unit = available height / 1080,
// unless the screen is too narrow for the two central TVs, then it shrinks just enough to show
// them whole. Outer TVs simply run off the edges.
export const REF_HEIGHT = 1080;

// Arrangement order: [far-left, near-left, centre-left, centre-right, near-right, far-right].
// Returns every TV's box in reference units (x = left edge relative to the centre line).
export function layoutSlots(arrangement) {
  const boxes = arrangement.map((id, i) => {
    const tv = TVS[id];
    return {id, role: i === 2 || i === 3 ? 'centre' : 'outer', top: 0, height: REF_HEIGHT, width: Math.round(REF_HEIGHT * tv.width / tv.height)};
  });
  boxes[2].x = -Math.round((boxes[2].width + boxes[3].width) / 2); boxes[3].x = boxes[2].x + boxes[2].width;
  for (let i = 1; i >= 0; i--) boxes[i].x = boxes[i + 1].x - boxes[i].width;
  for (let i = 4; i < 6; i++) boxes[i].x = boxes[i - 1].x + boxes[i - 1].width;
  return boxes;
}

// Half-width (units) that must stay visible so both central TVs are whole.
export const centreHalfWidth = slots => Math.max(-slots[2].x, slots[3].x + slots[3].width);
// Where the two central TVs meet (units from the centre line); NEXT sits on this seam.
export const centreSeam = slots => slots[3].x;

// Both letters share one size, set by the shorter central screen (reference units).
export function letterSize(slots, scale = LETTER_SCALE) {
  const centre = slots.filter(s => s.role === 'centre');
  return Math.min(...centre.map(s => s.height * TVS[s.id].screen.height / 100)) * scale;
}

// Letter height as a share of its screen's height.
export const LETTER_SCALE = 0.7;

// NEXT button, on the seam between the central TVs, below every screen (reference units).
export const BUTTON = {bottom: 24, width: 280, height: 100};

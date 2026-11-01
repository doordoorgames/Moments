// Pixel photo frames for every image in Clock Race (photos, maps, the missing-piece puzzle and its pieces).
// One shared utility: frame(seed) returns the style for a `cr-frame` element. The frame is a crisp 3px
// border in one of eight colours; the shadow is always the same dusty pink, offset bottom-right, hard-edged.
// Only the frame and shadow are styled: the picture inside keeps its own colours, untouched.
//
// Colours: six teals derived from the room's teal (--cr-teal #4F9E9B), plus ivory and near-black as accents.
// The order spreads the families so neighbours never match and ivory/black come up only now and then.
export const FRAME_COLORS = [
  '#4F9E9B', // 1 the room's teal
  '#4A92A6', // 4 a little bluer
  '#F7EEDB', // 7 ivory (accent)
  '#3A8380', // 2 a little darker
  '#5BA68D', // 5 a little greener
  '#76B9B4', // 3 a little lighter
  '#2A2630', // 8 near-black (accent)
  '#6E9794', // 6 muted, dusty
];
export const FRAME_SHADOW = '#D592AA';

// Stable for a given task (its place in the round) and picture (its place on the screen), so a re-render
// never changes a colour. Consecutive pictures always differ; the next task starts further round the cycle.
export function frameColor(taskIndex = 0, i = 0) {
  const n = FRAME_COLORS.length;
  return FRAME_COLORS[(((taskIndex * 3 + i) % n) + n) % n];
}

export const frame = (taskIndex, i) => ({'--frame': frameColor(taskIndex, i)});

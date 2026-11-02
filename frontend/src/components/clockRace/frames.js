// Colour variants for the pixel frames (PixelFrame.jsx) that wrap every picture in Clock Race.
// Six teals built around the room's teal (#4F9E9B). Each variant carries its own face colour plus the
// lighter and darker pixel rows that make the 16-bit bevel, so nothing is blended or computed at runtime.
export const FRAME_VARIANTS = [
  {name: 'teal',      face: '#4F9E9B', hi: '#86CBC5', lo: '#367674'}, // 1 the room's teal
  {name: 'darker',    face: '#3A8380', hi: '#66AFAA', lo: '#28605E'}, // 2 slightly darker
  {name: 'lighter',   face: '#76B9B4', hi: '#A9DCD7', lo: '#559791'}, // 3 slightly lighter
  {name: 'bluer',     face: '#4A92A6', hi: '#7DBDCF', lo: '#336F81'}, // 4 slightly bluer
  {name: 'deep',      face: '#2F6B6A', hi: '#55908E', lo: '#1F4C4B'}, // 5 muted deep teal
  {name: 'turquoise', face: '#9ED8D0', hi: '#D0F1EC', lo: '#76B8AF'}, // 6 pale turquoise
];

// Order the variants are handed out in, spread so neighbours never look alike.
const ORDER = [0, 3, 2, 4, 5, 1];

// Stable for a given task (its place in the round) and picture (its place on the screen): a re-render never
// changes a colour, neighbouring pictures always differ, and each new task starts further round the cycle.
export function frameVariant(taskIndex = 0, i = 0) {
  const n = ORDER.length;
  return ORDER[(((taskIndex * 2 + i) % n) + n) % n];
}

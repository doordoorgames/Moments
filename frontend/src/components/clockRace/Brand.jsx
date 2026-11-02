import React, {memo, useMemo} from 'react';

// Clock Race branding, drawn as real pixel art in SVG (every pixel is a 1x1 square, crispEdges),
// so it stays sharp at any size and on Retina screens. Black, white and greys only.

// ------------------------------------------------------------------ pixel clock icon (16 x 16)
// K black, W white, L light grey shade, G grey ticks
const CLOCK = [
  '.......KK.......',
  '.KK..........KK.',
  '.KKK.KKKKKK.KKK.',
  '....KKWGGWKK....',
  '...KWWWWWWWWK...',
  '..KWWWWKWWWWWK..',
  '.KKWWWWKWWWWWKK.',
  '.KWWWWWKWWWWWLK.',
  '.KWGWWWKKWWWGLK.',
  '.KWGWWWKKKKWGLK.',
  '.KWWWWWWWWWWWLK.',
  '.KKWWWWWWWWWLKK.',
  '..KWWWWWWWWLLK..',
  '...KWWWWWWLLK...',
  '....KKLGGLKK....',
  '.....KKKKKK.....',
];
const CLOCK_INK = {K: '#141414', W: '#F2F2F2', L: '#C6C6C6', G: '#8A8A8A'};

function pathFor(rows, ch) {
  let d = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === ch) d += `M${x} ${y}h1v1h-1z`; }));
  return d;
}

export const PixelClock = memo(function PixelClock({size = 64, className = ''}) {
  return <svg className={`cr-pixel-clock ${className}`} width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
    {Object.entries(CLOCK_INK).map(([ch, fill]) => <path key={ch} d={pathFor(CLOCK, ch)} fill={fill}/>)}
  </svg>;
});

// ------------------------------------------------------------------ "Clock Race" title logo
// A chunky 7-high bitmap face drawn for this logo only. '#' = pixel.
const GLYPHS = {
  C: ['.####', '##...', '##...', '##...', '##...', '##...', '.####'],
  l: ['##', '##', '##', '##', '##', '##', '##'],
  o: ['.....', '.....', '.###.', '##.##', '##.##', '##.##', '.###.'],
  c: ['....', '....', '.###', '##..', '##..', '##..', '.###'],
  k: ['##...', '##...', '##.##', '####.', '###..', '####.', '##.##'],
  R: ['####.', '##.##', '##.##', '####.', '###..', '##.#.', '##.##'],
  a: ['.....', '.....', '.###.', '...##', '.####', '##.##', '.####'],
  e: ['.....', '.....', '.###.', '##.##', '#####', '##...', '.####'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
};
const TEXT = 'Clock Race';
const PAD = 2; // room for the outline and the grey lower shade

function layout() {
  const px = [];
  let x = PAD;
  [...TEXT].forEach((ch, i) => {
    const g = GLYPHS[ch];
    g.forEach((row, y) => [...row].forEach((c, dx) => { if (c === '#') px.push([x + dx, y + PAD]); }));
    x += g[0].length + (i < TEXT.length - 1 ? 1 : 0);
  });
  const w = x + PAD, h = 7 + PAD * 2 + 1;
  const on = new Set(px.map(([a, b]) => `${a},${b}`));
  // the outline pixels sitting right on top of a letter's upper edge: the highlight runs along these
  const rim = px.filter(([a, b]) => !on.has(`${a},${b - 1}`)).map(([a, b]) => [a, b - 1]);
  return {px, w, h, rim};
}

export const ClockRaceLogo = memo(function ClockRaceLogo({label = TEXT, animate = true, className = ''}) {
  const {px, w, h, rim} = useMemo(layout, []);
  // group by column so the title can build itself left to right, one pixel column at a time
  const cols = useMemo(() => {
    const by = new Map();
    px.forEach(([x, y]) => { if (!by.has(x)) by.set(x, []); by.get(x).push(y); });
    return [...by.entries()].sort((a, b) => a[0] - b[0]);
  }, [px]);
  const rimPath = rim.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');
  return <svg className={`cr-logo ${animate ? 'is-animated' : ''} ${className}`} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" role="img" aria-label={label}>
    <defs><clipPath id="cr-logo-rim"><path d={rimPath}/></clipPath></defs>
    {/* three layers (black outline, grey lower shade, white face), each split into pixel columns that
        appear left to right; a column's three parts share one delay */}
    {[['#111', (x, y) => `M${x - 1} ${y - 1}h3v4h-3z`], ['#7C7C7C', (x, y) => `M${x} ${y + 1}h1v1h-1z`], ['#F4F4F4', (x, y) => `M${x} ${y}h1v1h-1z`]].map(([fill, cell]) =>
      <g key={fill} fill={fill}>
        {cols.map(([x, ys], i) => <path key={x} className="cr-logo-col" style={{'--c': i}} d={ys.map(y => cell(x, y)).join('')}/>)}
      </g>)}
    {/* one small highlight that slides once along the top edges after the title has built */}
    <g clipPath="url(#cr-logo-rim)"><rect className="cr-logo-glint" x="-3" y="0" width="3" height={h} fill="#FFFFFF"/></g>
  </svg>;
});

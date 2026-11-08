import React from 'react';
import {tap} from './tap';

// "Tap the incorrect word" and the six visual reasoning puzzles. The server (clock_race_wrongword.py,
// clock_race_iq.py) builds and checks every one; these only draw what the task says, as fine pixel art:
// crisp edges, thin charcoal outlines, paper and wood tones. The question's accent (var(--cr-accent)) marks
// what to look for; teal is never used here.

const INK = '#2A2630';
const PAPER = '#F7EEDB';
const PAPER_D = '#DCCFB4';
// shape colours for the pattern matrix and the stacked shapes (clock_race_iq.COLORS): never teal
export const IQ_COLORS = ['#E8927C', '#F0CF6E', '#9C8FD6', '#E88AAE', '#6E9BD9'];

// ------------------------------------------------------------------ اضغط على الكلمة الخطأ
// Every word is its own button. The button's 7px padding is the extra tap room around the word; buttons sit
// edge to edge, so no two touch targets overlap. Words never break (nowrap); Arabic shaping stays whole
// because each word is one unbroken run of text; punctuation stays on its word.
export function WrongWord({task, onPick}) {
  const ar = task.lang === 'ar';
  return <div className={`cr-ww ${ar ? 'is-ar' : 'is-en'}`} dir={ar ? 'rtl' : 'ltr'} lang={task.lang}>
    {task.words.map((w, i) => <button key={i} type="button" className="cr-ww-word" {...tap(() => onPick(i))}>
      <span dir="auto">{w}</span>
    </button>)}
  </div>;
}

// ------------------------------------------------------------------ shapes (same geometry the server checks)
export function Shape({shape, cx, cy, s, fill, stroke = INK, sw = 1.2}) {
  const r = s / 2;
  const common = {fill, stroke, strokeWidth: sw, strokeLinejoin: 'miter', vectorEffect: 'non-scaling-stroke'};
  const poly = pts => <polygon points={pts.map(([x, y]) => `${cx + x * r},${cy + y * r}`).join(' ')} {...common}/>;
  switch (shape) {
    case 'circle': return <circle cx={cx} cy={cy} r={r} {...common}/>;
    case 'square': return <rect x={cx - .86 * r} y={cy - .86 * r} width={1.72 * r} height={1.72 * r} {...common} shapeRendering="crispEdges"/>;
    case 'diamond': return poly([[0, -1], [1, 0], [0, 1], [-1, 0]]);
    case 'triangle': return poly([[0, -1], [1, .8], [-1, .8]]);
    case 'hexagon': return poly([[1, 0], [.5, .866], [-.5, .866], [-1, 0], [-.5, -.866], [.5, -.866]]);
    case 'plus': return poly([[-.34, -1], [.34, -1], [.34, -.34], [1, -.34], [1, .34], [.34, .34], [.34, 1], [-.34, 1], [-.34, .34], [-1, .34], [-1, -.34], [-.34, -.34]]);
    default: return null;
  }
}

function Opts({task, onPick, wide, render}) {
  return <div className={`cr-iq-opts ${wide ? 'is-wide' : ''}`}>
    {task.view.options.map((o, i) => <button key={i} type="button" className="cr-iq-card" aria-label={`${i + 1}`} {...tap(() => onPick(i))}>
      {render(o, i)}
    </button>)}
  </div>;
}

// ------------------------------------------------------------------ fold: punched paper on a 4x4 grid
const Hole = ({x, y}) => <rect x={x * 10 + 3.5} y={y * 10 + 3.5} width="3" height="3" fill={INK} shapeRendering="crispEdges"/>;
function Sheet({holes, children}) {
  return <svg viewBox="-1 -1 42 42" className="cr-iq-svg" shapeRendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="40" height="40" fill={PAPER} stroke={INK} strokeWidth=".8"/>
    {children}
    {holes.map(([x, y], i) => <Hole key={i} x={x} y={y}/>)}
  </svg>;
}
function FoldQuestion({view}) {
  const v = view.axis === 'v';
  // the half that folded away is a dashed ghost; the arrow shows which way it went
  return <svg viewBox="-1 -1 42 42" className="cr-iq-svg" shapeRendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="40" height="40" fill="none" stroke={INK} strokeWidth=".6" strokeDasharray="1.5 1.5" opacity=".7"/>
    <rect x={v ? 20 : 0} y={v ? 0 : 20} width={v ? 20 : 40} height={v ? 40 : 20} fill={PAPER} stroke={INK} strokeWidth=".8"/>
    <rect x={v ? 20 : 0} y={v ? 0 : 20} width={v ? 2 : 40} height={v ? 40 : 2} fill={PAPER_D}/>
    {view.holes.map(([x, y], i) => <Hole key={i} x={x} y={y}/>)}
    <path d={v ? 'M6 20 Q12 10 18 18' : 'M20 6 Q30 12 22 18'} fill="none" stroke="var(--cr-accent,#EEA5BD)" strokeWidth="1.6" shapeRendering="auto"/>
    <path d={v ? 'M18 18 l-3.4 -.6 l2.2 -2.6z' : 'M22 18 l.6 -3.4 l2.6 2.2z'} fill="var(--cr-accent,#EEA5BD)" shapeRendering="auto"/>
  </svg>;
}
export function Fold({task, onPick}) {
  return <div className="cr-iq is-fold">
    <div className="cr-iq-q"><FoldQuestion view={task.view}/></div>
    <Opts task={task} onPick={onPick} render={o => <Sheet holes={o}/>}/>
  </div>;
}

// ------------------------------------------------------------------ hidden: lines on a 4x4 lattice
function Lattice({edges, color = INK, dots = true, box}) {
  const [x0, y0, w, h] = box || [0, 0, 4, 4];
  return <svg viewBox={`${x0 - .45} ${y0 - .45} ${w + .9} ${h + .9}`} className="cr-iq-svg" aria-hidden="true">
    {dots && <rect x={x0 - .45} y={y0 - .45} width={w + .9} height={h + .9} fill={PAPER}/>}
    {dots && Array.from({length: 25}, (_, i) => <rect key={i} x={(i % 5) - .05} y={Math.floor(i / 5) - .05} width=".1" height=".1" fill={PAPER_D}/>)}
    {edges.map(([o, x, y], i) => <line key={i} x1={x} y1={y} x2={o === 'h' ? x + 1 : x} y2={o === 'v' ? y + 1 : y}
      stroke={color} strokeWidth=".16" strokeLinecap="square"/>)}
  </svg>;
}
export function Hidden({task, onPick}) {
  const t = task.view.target;
  const w = Math.max(...t.map(([o, x]) => x + (o === 'h' ? 1 : 0)));
  const h = Math.max(...t.map(([o, , y]) => y + (o === 'v' ? 1 : 0)));
  return <div className="cr-iq is-hidden">
    <div className="cr-iq-q is-small"><Lattice edges={t} color="var(--cr-accent,#EEA5BD)" dots={false} box={[0, 0, Math.max(1, w), Math.max(1, h)]}/></div>
    <Opts task={task} onPick={onPick} render={o => <Lattice edges={o}/>}/>
  </div>;
}

// ------------------------------------------------------------------ matrix: 3x3 pattern
const SPOTS = {1: [[0, 0]], 2: [[-1, 0], [1, 0]], 3: [[-1, .9], [1, .9], [0, -.9]]};
function Cell({cell, x = 0, y = 0, size = 30}) {
  if (!cell) return <g>
    <rect x={x + 1} y={y + 1} width={size - 2} height={size - 2} fill="none" stroke="var(--cr-accent,#EEA5BD)" strokeWidth="1.4" strokeDasharray="2.5 2" shapeRendering="crispEdges"/>
    <text x={x + size / 2} y={y + size / 2 + 4.5} textAnchor="middle" fontSize="13" fontFamily="var(--cr-press,monospace)" fill="var(--cr-accent,#EEA5BD)">?</text>
  </g>;
  const [shape, color, count] = cell;
  const s = count === 1 ? size * .5 : size * .34;
  return <g>
    <rect x={x + 1} y={y + 1} width={size - 2} height={size - 2} fill={PAPER} stroke={INK} strokeWidth=".7" shapeRendering="crispEdges"/>
    {SPOTS[count].map(([dx, dy], i) => <Shape key={i} shape={shape} cx={x + size / 2 + dx * size * .22} cy={y + size / 2 + dy * size * .2} s={s} fill={IQ_COLORS[color]}/>)}
  </g>;
}
export function Matrix({task, onPick}) {
  return <div className="cr-iq is-matrix">
    <div className="cr-iq-q is-big">
      <svg viewBox="0 0 90 90" className="cr-iq-svg" aria-hidden="true">
        {task.view.grid.map((row, r) => row.map((cell, c) => <Cell key={`${r}${c}`} cell={cell} x={c * 30} y={r * 30}/>))}
      </svg>
    </div>
    <Opts task={task} onPick={onPick} render={o => <svg viewBox="0 0 30 30" className="cr-iq-svg" aria-hidden="true"><Cell cell={o}/></svg>}/>
  </div>;
}

// ------------------------------------------------------------------ rotate: turned, not mirrored
function Blocks({cells}) {
  const w = Math.max(...cells.map(c => c[0])) + 1, h = Math.max(...cells.map(c => c[1])) + 1, n = Math.max(w, h);
  const ox = (n - w) / 2, oy = (n - h) / 2;
  return <svg viewBox={`-.2 -.2 ${n + .4} ${n + .4}`} className="cr-iq-svg" shapeRendering="crispEdges" aria-hidden="true">
    {cells.map(([x, y, eye], i) => <g key={i}>
      <rect x={x + ox} y={y + oy} width="1" height="1" fill={eye ? INK : PAPER} stroke={INK} strokeWidth=".06"/>
      {!eye && <rect x={x + ox + .06} y={y + oy + .06} width=".88" height=".14" fill="#FFFFFF" opacity=".7"/>}
      {eye && <rect x={x + ox + .36} y={y + oy + .36} width=".28" height=".28" fill="var(--cr-accent,#EEA5BD)"/>}
    </g>)}
  </svg>;
}
export function Rotate({task, onPick}) {
  return <div className="cr-iq is-rotate">
    <div className="cr-iq-q"><Blocks cells={task.view.shape}/></div>
    <Opts task={task} onPick={onPick} render={o => <Blocks cells={o}/>}/>
  </div>;
}

// ------------------------------------------------------------------ match: matchstick sums
// a seven-segment digit 6 wide x 11 tall; a stick is a pale wooden bar with a red head
const SEG = {'0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg'};
const SEG_AT = {a: [1, 0, 'h'], b: [5, 1, 'v'], c: [5, 6, 'v'], d: [1, 10, 'h'], e: [0, 6, 'v'], f: [0, 1, 'v'], g: [1, 5, 'h']};
function Stick({x, y, o}) {
  return o === 'h'
    ? <g><rect x={x} y={y} width="4" height=".9" fill="#E9C48A"/><rect x={x + 3.2} y={y - .1} width="1.1" height="1.1" fill="#D2504A"/></g>
    : <g><rect x={x} y={y} width=".9" height="4" fill="#E9C48A"/><rect x={x - .1} y={y} width="1.1" height="1.1" fill="#D2504A"/></g>;
}
function Sum({eq}) {
  const parts = [];
  let x = 0;
  for (const ch of eq) {
    if (SEG[ch]) {
      for (const s of SEG[ch]) { const [dx, dy, o] = SEG_AT[s]; parts.push(<Stick key={`${x}${s}`} x={x + dx} y={dy} o={o}/>); }
      x += 7.5;
    } else {
      if (ch === '+' || ch === '-') parts.push(<Stick key={`${x}h`} x={x} y={5} o="h"/>);
      if (ch === '+') parts.push(<Stick key={`${x}v`} x={x + 1.55} y={3} o="v"/>);
      if (ch === '=') { parts.push(<Stick key={`${x}a`} x={x} y={3.6} o="h"/>); parts.push(<Stick key={`${x}b`} x={x} y={6.4} o="h"/>); }
      x += 5.5;
    }
  }
  return <svg viewBox={`-1 -1.2 ${x + 1} 13.4`} className="cr-iq-svg is-sum" shapeRendering="crispEdges" aria-hidden="true" direction="ltr">{parts}</svg>;
}
export function Match({task, onPick}) {
  return <div className="cr-iq is-match" dir="ltr">
    <div className="cr-iq-q is-sum"><Sum eq={task.view.eq}/></div>
    <Opts task={task} onPick={onPick} wide render={o => <Sum eq={o}/>}/>
  </div>;
}

// ------------------------------------------------------------------ overlap: what's at the back / on top
export function Overlap({task, onPick}) {
  return <div className="cr-iq is-overlap">
    <div className="cr-iq-q is-big">
      <svg viewBox="0 0 100 100" className="cr-iq-svg" aria-hidden="true">
        {task.view.layers.map((L, i) => <Shape key={i} shape={L.shape} cx={L.x} cy={L.y} s={L.s} fill={IQ_COLORS[L.color]} sw={1.6}/>)}
      </svg>
    </div>
    <Opts task={task} onPick={onPick} render={L => <svg viewBox="0 0 100 100" className="cr-iq-svg" aria-hidden="true">
      <Shape shape={L.shape} cx={50} cy={50} s={70} fill={IQ_COLORS[L.color]} sw={1.6}/></svg>}/>
  </div>;
}

const IQ_VIEWS = {fold: Fold, hidden: Hidden, matrix: Matrix, rotate: Rotate, match: Match, overlap: Overlap};
export function IqPuzzle(props) {
  const View = IQ_VIEWS[props.task.kind];
  return View ? <View {...props}/> : null;
}

export const iqPrompt = (task, t) => (task.kind === 'overlap' ? t.iq[task.view.ask] : t.iq[task.kind]);

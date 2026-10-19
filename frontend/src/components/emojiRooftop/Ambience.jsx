import React, {memo, useEffect, useRef} from 'react';

// Living details layered on the table art: leaf shadows breathing in the top right,
// and a small flicker on the candle and the bottom-right lantern every 7–15 seconds.

// Pseudo-random but fixed leaf layout, so shadows never jump between renders.
function leaves(seed, count, cx, cy, spread) {
  const out = [];
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread;
    out.push({x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * .8, r: rnd() * 360, l: 26 + rnd() * 30, w: 9 + rnd() * 7});
  }
  return out;
}
const CLUSTERS = [
  leaves(7, 26, 330, 120, 120),
  leaves(19, 20, 190, 210, 95),
  leaves(31, 18, 360, 330, 100),
  leaves(43, 12, 90, 70, 70),
];
const BRANCHES = ['M420 -10 Q330 90 190 210', 'M420 60 Q360 200 360 330', 'M300 -10 Q200 40 90 70'];

const Leaf = ({x, y, r, l, w}) => <path transform={`translate(${x} ${y}) rotate(${r})`} d={`M0 0 Q${w} ${-l / 2} 0 ${-l} Q${-w} ${-l / 2} 0 0Z`}/>;

function useFlicker(ref) {
  useEffect(() => {
    let t;
    const next = () => {
      t = setTimeout(() => {
        const el = ref.current;
        if (el) { el.classList.remove('is-flicker'); void el.offsetWidth; el.classList.add('is-flicker'); }
        next();
      }, 7000 + Math.random() * 8000);
    };
    next();
    return () => clearTimeout(t);
  }, [ref]);
}

function Ambience() {
  const candle = useRef(null), lantern = useRef(null);
  useFlicker(candle);
  useFlicker(lantern);
  return <div className="er-ambience" aria-hidden="true">
    <svg className="er-leaves er-leaves-a" viewBox="0 0 440 440">
      <g className="er-leaves-sway">
        {BRANCHES.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/>)}
        {CLUSTERS.slice(0, 2).flat().map((p, i) => <Leaf key={i} {...p}/>)}
      </g>
    </svg>
    <svg className="er-leaves er-leaves-b" viewBox="0 0 440 440">
      <g className="er-leaves-sway">{CLUSTERS.slice(2).flat().map((p, i) => <Leaf key={i} {...p}/>)}</g>
    </svg>
    <span ref={candle} className="er-glow er-glow-candle"/>
    <span ref={lantern} className="er-glow er-glow-lantern"/>
  </div>;
}

export default memo(Ambience);

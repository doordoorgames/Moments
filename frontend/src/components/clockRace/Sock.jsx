import React, {memo, useId} from 'react';
import {ARCADE} from './theme';

// A sock design is "color-pattern-accent". Counts must match SOCK_* in backend/clock_race_data.py.
export const SOCK_COLORS = ['#FF7A6B', '#6FB3FF', '#59D3A6', '#FFC93C', '#B79CFF'];
export const SOCK_ACCENTS = ['#FFF6E5', '#0B0B0B', '#E3262E'];
const K = '#0B0B0B';
const SHAPE = 'M16 4 H46 V58 Q46 64 53 68 L76 80 Q90 87 85 98 Q80 107 64 101 L27 85 Q14 79 16 64 Z';

function pattern(p, color) {
  switch (p) {
    case 1: return [16, 28, 40, 52].map(y => <rect key={y} x="0" y={y} width="100" height="6" fill={color}/>);
    case 2: return [[24, 22], [38, 22], [24, 36], [38, 36], [31, 49], [24, 62], [38, 62], [52, 74], [66, 82], [44, 78]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="3.6" fill={color}/>);
    case 3: return [22, 40, 58, 76].map(y => <path key={y} d={`M0 ${y} l8 -6 l8 6 l8 -6 l8 6 l8 -6 l8 6 l8 -6 l8 6 l8 -6 l8 6 l8 -6 l8 6`} stroke={color} strokeWidth="4" fill="none"/>);
    case 4: return [0, 1, 2, 3, 4, 5, 6, 7].flatMap(r => [0, 1, 2, 3, 4, 5].map(c => (r + c) % 2 ? null : <rect key={`${r}-${c}`} x={c * 14} y={14 + r * 12} width="14" height="12" fill={color} opacity=".75"/>));
    default: return null;
  }
}

function Sock({code}) {
  const id = useId().replace(/:/g, '');
  const [c, p, a] = String(code).split('-').map(Number);
  const accent = SOCK_ACCENTS[a % SOCK_ACCENTS.length];
  const ink = a === 1 ? '#FFFDF7' : K; // pattern shows in ink on light accents, cream on the black one
  return <svg viewBox="0 0 100 110" className="cr-sock" aria-hidden="true">
    <defs><clipPath id={`s${id}`}><path d={SHAPE}/></clipPath></defs>
    {!ARCADE && <path d={SHAPE} fill={K} transform="translate(3 3)"/>}
    <g clipPath={`url(#s${id})`}>
      <rect width="100" height="110" fill={SOCK_COLORS[c % SOCK_COLORS.length]}/>
      <g opacity={a === 1 ? 0.9 : 0.55}>{pattern(p, ink === K ? K : accent)}</g>
      <rect x="0" y="0" width="100" height="12" fill={accent}/>
      <path d="M60 70 Q74 72 86 84 L90 110 L56 110 Z" fill={accent} transform="translate(8 0)"/>
      <path d="M8 66 Q8 90 32 92 L40 72 Z" fill={accent}/>
    </g>
    {!ARCADE && <path d={SHAPE} fill="none" stroke={K} strokeWidth="4" strokeLinejoin="round"/>}
    <path d="M16 12 H46" stroke={K} strokeWidth="3"/>
  </svg>;
}

export default memo(Sock);

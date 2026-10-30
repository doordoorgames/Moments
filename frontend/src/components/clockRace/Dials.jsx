import React, {memo} from 'react';
import {fraction} from './localCheck';

export const PLAYER_COLORS = ['#FF5B36', '#2E4BFF', '#13B07A', '#FFB300', '#FF5FA2', '#8A5CF6', '#00A2C2', '#E66A00', '#6A8F1F', '#D2335F', '#33507A', '#9B5B2E'];
const PIE = 2 * Math.PI * 25; // circle r=25 drawn with a 50-wide stroke = a filled wedge

// One player's clock: the wedge fills clockwise from 12 o'clock, the hand points at the progress,
// 20 ticks = 20 tasks.
export const Dial = memo(function Dial({done, total = 20, color, size = 46, big = false}) {
  const p = fraction(done, total);
  return <svg viewBox="0 0 100 100" width={size} height={size} className={`cr-dial ${big ? 'is-big' : ''}`} aria-hidden="true">
    <circle cx="50" cy="53" r="45" fill="#0B0B0B"/>
    <circle cx="50" cy="50" r="45" fill="#FFFDF7" stroke="#0B0B0B" strokeWidth="6"/>
    <circle cx="50" cy="50" r="25" fill="none" stroke={color} strokeWidth="50" transform="rotate(-90 50 50)"
      strokeDasharray={PIE} strokeDashoffset={PIE * (1 - p)} className="cr-dial-fill"/>
    {Array.from({length: total}, (_, i) => <line key={i} x1="50" y1="9" x2="50" y2={i % 5 === 0 ? 17 : 13} stroke="#0B0B0B"
      strokeWidth={i % 5 === 0 ? 3.5 : 2.2} strokeLinecap="round" transform={`rotate(${i * 360 / total} 50 50)`} opacity={p * total > i ? .35 : 1}/>)}
    <g className="cr-dial-hand" style={{transform: `rotate(${p * 360}deg)`}}>
      <line x1="50" y1="50" x2="50" y2="20" stroke="#0B0B0B" strokeWidth="5.5" strokeLinecap="round"/>
    </g>
    <circle cx="50" cy="50" r="6" fill="#0B0B0B"/>
  </svg>;
});

// The race strip at the top: every player, join order (never re-sorted, so nobody's dial jumps).
function Dials({players, me, total = 20, winner}) {
  const many = players.length > 6;
  return <div className={`cr-dials ${many ? 'is-many' : ''}`} role="list" aria-label="السباق">
    {players.map(p => <div role="listitem" key={p.id}
      className={`cr-dial-seat ${p.id === me ? 'is-me' : ''} ${p.id === winner ? 'is-winner' : ''} ${p.racing === false ? 'is-out' : ''}`}
      aria-label={`${p.name} ${Math.round(fraction(p.done, total) * 100)}%`}>
      <span className="cr-dial-wrap">
        <Dial done={p.done} total={total} color={PLAYER_COLORS[p.color % PLAYER_COLORS.length]} size={many ? 40 : 48}/>
        {p.done > 0 && <i className="cr-dial-pop" key={p.done} style={{borderColor: PLAYER_COLORS[p.color % PLAYER_COLORS.length]}}/>}
      </span>
      <span className="cr-dial-name" dir="auto">{p.id === me ? 'أنت' : p.name}</span>
    </div>)}
  </div>;
}

export default memo(Dials);

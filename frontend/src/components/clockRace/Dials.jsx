import React, {memo, useEffect, useState} from 'react';
import {botDone, fraction} from './localCheck';
import {ARCADE} from './theme';

const CLASSIC_COLORS = ['#FF5B36', '#2E4BFF', '#13B07A', '#FFB300', '#FF5FA2', '#8A5CF6', '#00A2C2', '#E66A00', '#6A8F1F', '#D2335F', '#33507A', '#9B5B2E'];
// Arcade: the same twelve hues, muted like aged cel paint (still clearly told apart).
const ARCADE_COLORS = ['#E2836B', '#6F98C9', '#86B56E', '#E0B44E', '#DE8BA6', '#9A86CC', '#55AFA6', '#D99257', '#8E9F5C', '#C2667F', '#55688F', '#B28466'];
export const PLAYER_COLORS = ARCADE ? ARCADE_COLORS : CLASSIC_COLORS;
const PIE = 2 * Math.PI * 25; // circle r=25 drawn with a 50-wide stroke = a filled wedge

// One player's clock: the wedge fills clockwise from 12 o'clock, the hand points at the progress,
// 20 ticks = 20 tasks.
export const Dial = memo(function Dial(props) {
  return ARCADE ? <ArcadeDial {...props}/> : <ClassicDial {...props}/>;
});

// Arcade timer: a cabinet-style meter. Ivory bezel with a ring of 20 lamps (one per task) that light in the
// player's colour, a powder-blue face filling like a clock, and a hand. Paint sits a hair off the ink line,
// as on a hand-painted cel; the outline itself wobbles slightly. Same reading as the classic clock.
const wob = (r, seed, n = 36) => {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r + Math.sin(a * 3 + seed) * 0.55 + Math.sin(a * 7 + seed * 2) * 0.35;
    d += `${i ? 'L' : 'M'}${(50 + rr * Math.sin(a)).toFixed(2)} ${(50 - rr * Math.cos(a)).toFixed(2)}`;
  }
  return d + 'Z';
};
const BEZEL = wob(46, 1.3), FACE = wob(31, 4.1);
const LAMPS = Array.from({length: 20}, (_, i) => {
  const a = (i + 0.5) / 20 * Math.PI * 2;
  return [50 + 38.5 * Math.sin(a), 50 - 38.5 * Math.cos(a)];
});
const ArcadeDial = memo(function ArcadeDial({done, total = 20, color, size = 46, big = false}) {
  const p = fraction(done, total);
  const lit = Math.round(p * 20);
  return <svg viewBox="0 0 100 100" width={size} height={size} className={`cr-dial is-arcade ${big ? 'is-big' : ''}`} aria-hidden="true">
    <path d={BEZEL} fill="#F4EAD5" transform="translate(.9 -.7)"/>
    {LAMPS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.3" fill={i < lit ? color : '#DCD3C1'}/>)}
    <path d={FACE} fill="#CFE0EC" transform="translate(.7 -.6)"/>
    <circle cx="50" cy="50" r="15.5" fill="none" stroke={color} strokeWidth="31" transform="rotate(-90 50 50)" opacity=".9"
      strokeDasharray={PIE * 0.62} strokeDashoffset={PIE * 0.62 * (1 - p)} className="cr-dial-fill"/>
    <g className="cr-dial-hand" style={{transform: `rotate(${p * 360}deg)`}}>
      <line x1="50" y1="50" x2="50" y2="24" stroke="#3A3446" strokeWidth="4.6" strokeLinecap="butt"/>
    </g>
    <circle cx="50" cy="50" r="5.2" fill="#55688F"/>
  </svg>;
});

const ClassicDial = memo(function ClassicDial({done, total = 20, color, size = 46, big = false}) {
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
// Simulated players (TEST99) move by their schedule, ticking here so the rest of the screen stays still.
function Dials({players, me, total = 20, winner, youLabel, bots, startsAt, offset, racing}) {
  const many = players.length > 6;
  const hasBots = racing && bots && Object.keys(bots).length > 0;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!hasBots) return undefined;
    const id = setInterval(() => tick(x => x + 1), 250);
    return () => clearInterval(id);
  }, [hasBots]);
  const elapsed = (Date.now() + (offset?.current || 0)) / 1000 - (startsAt || 0);
  return <div className={`cr-dials ${many ? 'is-many' : ''}`} role="list">
    {players.map(p => {
      const done = hasBots && bots[p.id] ? Math.max(p.done, botDone(bots[p.id], elapsed)) : p.done;
      return <div role="listitem" key={p.id}
        className={`cr-dial-seat ${p.id === me ? 'is-me' : ''} ${p.id === winner ? 'is-winner' : ''} ${p.racing === false ? 'is-out' : ''}`}
        aria-label={`${p.name} ${Math.round(fraction(done, total) * 100)}%`}>
        <span className="cr-dial-wrap">
          <Dial done={done} total={total} color={PLAYER_COLORS[p.color % PLAYER_COLORS.length]} size={many ? 40 : 48}/>
          {done > 0 && <i className="cr-dial-pop" key={done} style={{borderColor: PLAYER_COLORS[p.color % PLAYER_COLORS.length]}}/>}
        </span>
        <span className="cr-dial-name" dir="auto">{p.id === me ? youLabel : p.name}</span>
      </div>;
    })}
  </div>;
}

export default memo(Dials);

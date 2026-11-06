import React, {memo, useEffect, useState} from 'react';
import {TOTAL, botDone} from './localCheck';

// The race scoreboard at the top of the game: every player in the race, their name and how many of the
// 20 tasks they have finished. Join order, never re-sorted, so nobody's line jumps while racing.
// Reads the same room state the server pushes (done counts), plus the test bots' schedules so their
// numbers tick on time between pushes. Players who joined after the start watch, and are not listed.
function Scoreboard({players, me, winner, total = TOTAL, bots, startsAt, offset, racing, label}) {
  const racers = players.filter(p => p.racing !== false);
  const hasBots = racing && bots && Object.keys(bots).length > 0;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!hasBots) return undefined;
    const id = setInterval(() => tick(x => x + 1), 250);
    return () => clearInterval(id);
  }, [hasBots]);
  const elapsed = (Date.now() + (offset?.current || 0)) / 1000 - (startsAt || 0);
  const cols = racers.length <= 3 ? 1 : racers.length <= 8 ? 2 : 3;
  return <ol className={`cr-score is-c${cols}`} aria-label={label}>
    {racers.map(p => {
      const done = Math.min(total, hasBots && bots[p.id] ? Math.max(p.done, botDone(bots[p.id], elapsed)) : p.done);
      const out = !!p.out;
      return <li key={p.id} className={`cr-score-row ${p.id === me ? 'is-me' : ''} ${p.id === winner ? 'is-winner' : ''} ${out ? 'is-out' : ''}`}>
        <span className="cr-score-name" dir="auto">{p.name}</span>
        <b className="cr-score-num" dir="ltr"><span key={done} className="cr-score-done">{done}</span>/{total}</b>
      </li>;
    })}
  </ol>;
}

export default memo(Scoreboard);
